import { describe, expect, it } from "vitest";
import type { Survey } from "../data/bank";
import {
  canApply,
  createGame,
  gameReducer,
  nextRound,
  type GameAction,
  type GameState,
  type Team,
} from "./mainGame";
import { DEFAULT_RULES, FIXED_ROUNDS_RULES, SINGLE_POINTS_RULES, type GameRules } from "./rules";
import { createHistory, undoableReducer } from "./undo";

const POINTS = [30, 20, 15, 10, 8, 6, 4, 2];

function survey(answerCount: number, id = `q${answerCount}`): Survey {
  const points = POINTS.slice(0, answerCount);
  return {
    id,
    season: 20,
    answerCount,
    question: `Question ${id}`,
    total: points.reduce((a, b) => a + b, 0),
    answers: points.map((p, i) => ({ text: `ANSWER ${i + 1}`, points: p })),
    source: "https://example.test",
  };
}

const FAMILIES = [
  { name: "Smith", players: ["S1", "S2", "S3", "S4", "S5"] },
  { name: "Jones", players: ["J1", "J2", "J3", "J4", "J5"] },
];

function newGame(rules: GameRules = DEFAULT_RULES) {
  return createGame(rules, FAMILIES);
}

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state);
}

/** Start the next round with a survey of the smallest size that round allows. */
function startNext(state: GameState): GameState {
  const upcoming = nextRound(state);
  if (!upcoming) throw new Error("no next round");
  return run(state, { type: "startRound", survey: survey(upcoming.minAnswers) });
}

/** Team wins the face-off with the #1 answer, plays, and clears the board. */
function sweepRound(state: GameState, team: Team): GameState {
  let s = startNext(state);
  s = run(s, { type: "buzz", team }, { type: "faceOffAnswer", team, answer: 0 }, { type: "playOrPass", play: true });
  for (let i = 1; i < s.round!.survey.answerCount; i++) s = run(s, { type: "answer", answer: i });
  return s;
}

/** Team wins the round with only the #1 answer (control, 3 strikes, failed steal). */
function winSmallRound(state: GameState, team: Team): GameState {
  let s = startNext(state);
  return run(
    s,
    { type: "buzz", team },
    { type: "faceOffAnswer", team, answer: 0 },
    { type: "playOrPass", play: true },
    { type: "answer", answer: null },
    { type: "answer", answer: null },
    { type: "answer", answer: null },
    { type: "steal", answer: null },
  );
}

describe("game setup", () => {
  it("starts with zero scores and no round in progress", () => {
    const s = newGame();
    expect(s.families.map((f) => f.score)).toEqual([0, 0]);
    expect(s.round).toBeNull();
    expect(nextRound(s)).toMatchObject({ kind: "round", number: 1, name: "Single", multiplier: 1 });
  });

  it("refuses invalid rules or a family without players", () => {
    expect(() => createGame({ ...DEFAULT_RULES, rounds: [] }, FAMILIES)).toThrow(/round/i);
    expect(() => createGame(DEFAULT_RULES, [FAMILIES[0]!, { name: "Empty", players: [] }])).toThrow(/player/i);
  });

  it("refuses a survey whose size doesn't fit the round", () => {
    expect(() => run(newGame(), { type: "startRound", survey: survey(4) })).toThrow(/6.*8/);
  });

  it("accepts a hand-picked survey of any size (e.g. a custom 3-answer question)", () => {
    const s = run(newGame(), { type: "startRound", survey: survey(3), handPicked: true });
    expect(s.round!.slots).toHaveLength(3);
    expect(s.roundsPlayed).toBe(1);
  });
});

describe("face-off", () => {
  const start = () => run(newGame(), { type: "startRound", survey: survey(6) });

  it("remembers that someone has buzzed in this round, even after both players miss", () => {
    expect(start().round!.hasBuzzed).toBe(false);
    const buzzed = run(start(), { type: "buzz", team: 1 });
    expect(buzzed.round!.hasBuzzed).toBe(true);
    const nextPair = run(
      buzzed,
      { type: "faceOffAnswer", team: 1, answer: null },
      { type: "faceOffAnswer", team: 0, answer: null },
    );
    expect(nextPair.round!.faceOff.buzzed).toBeNull();
    expect(nextPair.round!.hasBuzzed).toBe(true);
  });

  it("pits the first player of each family against each other", () => {
    expect(start().round!.faceOff.players).toEqual([0, 0]);
  });

  it("gives control right away for the #1 answer", () => {
    const s = run(start(), { type: "buzz", team: 1 }, { type: "faceOffAnswer", team: 1, answer: 0 });
    expect(s.round!.phase).toBe("playOrPass");
    expect(s.round!.faceOff.winner).toBe(1);
    expect(s.round!.slots[0]).toBe("won");
    expect(s.round!.bank).toBe(30);
  });

  it("lets the other player answer when the first answer isn't #1; the higher answer wins", () => {
    let s = run(start(), { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 2 });
    expect(s.round!.phase).toBe("faceOff");
    expect(s.round!.faceOff.turn).toBe(1);
    s = run(s, { type: "faceOffAnswer", team: 1, answer: 1 });
    expect(s.round!.faceOff.winner).toBe(1);
    expect(s.round!.bank).toBe(15 + 20);
  });

  it("keeps control with the first player when their answer ranks higher", () => {
    const s = run(
      start(),
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: 1 },
      { type: "faceOffAnswer", team: 1, answer: 3 },
    );
    expect(s.round!.faceOff.winner).toBe(0);
  });

  it("gives control to the second player if the first misses and they hit anything", () => {
    const s = run(
      start(),
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: null },
      { type: "faceOffAnswer", team: 1, answer: 5 },
    );
    expect(s.round!.faceOff.winner).toBe(1);
  });

  it("gives control to the first player if they hit and the second misses", () => {
    const s = run(
      start(),
      { type: "buzz", team: 1 },
      { type: "faceOffAnswer", team: 1, answer: 4 },
      { type: "faceOffAnswer", team: 0, answer: null },
    );
    expect(s.round!.faceOff.winner).toBe(1);
  });

  it("brings up the next pair when both players miss", () => {
    const s = run(
      start(),
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: null },
      { type: "faceOffAnswer", team: 1, answer: null },
    );
    expect(s.round!.phase).toBe("faceOff");
    expect(s.round!.faceOff).toMatchObject({ players: [1, 1], buzzed: null, turn: null, first: null });
  });

  it("rejects answers before the buzz, out of turn, or for an answer already on the board", () => {
    const s = start();
    expect(() => run(s, { type: "faceOffAnswer", team: 0, answer: 0 })).toThrow();
    const buzzed = run(s, { type: "buzz", team: 0 });
    expect(() => run(buzzed, { type: "faceOffAnswer", team: 1, answer: 0 })).toThrow();
    expect(() => run(buzzed, { type: "buzz", team: 1 })).toThrow();
    const first = run(buzzed, { type: "faceOffAnswer", team: 0, answer: 2 });
    expect(() => run(first, { type: "faceOffAnswer", team: 1, answer: 2 })).toThrow(/already/i);
    expect(() => run(first, { type: "faceOffAnswer", team: 1, answer: 9 })).toThrow();
  });
});

describe("play or pass", () => {
  const won = () =>
    run(
      newGame(),
      { type: "startRound", survey: survey(6) },
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: 0 },
    );

  it("lets the face-off winner play, starting with the player after them", () => {
    const s = run(won(), { type: "playOrPass", play: true });
    expect(s.round).toMatchObject({ phase: "playing", control: 0, currentPlayer: 1, strikes: 0 });
  });

  it("hands the board to the other family on a pass", () => {
    const s = run(won(), { type: "playOrPass", play: false });
    expect(s.round).toMatchObject({ phase: "playing", control: 1, currentPlayer: 1 });
  });

  it("is only allowed right after the face-off", () => {
    expect(() => run(newGame(), { type: "playOrPass", play: true })).toThrow();
  });
});

describe("playing the board", () => {
  const playing = () =>
    run(
      newGame(),
      { type: "startRound", survey: survey(6) },
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: 0 },
      { type: "playOrPass", play: true },
    );

  it("adds revealed answers to the bank and moves to the next player", () => {
    const s = run(playing(), { type: "answer", answer: 3 });
    expect(s.round!.bank).toBe(30 + 10);
    expect(s.round!.slots[3]).toBe("won");
    expect(s.round!.currentPlayer).toBe(2);
  });

  it("goes around the family and back to the first player", () => {
    let s = playing();
    for (let i = 0; i < 2; i++) s = run(s, { type: "answer", answer: null });
    for (let i = 1; i < 3; i++) s = run(s, { type: "answer", answer: i });
    expect(s.round!.currentPlayer).toBe(0);
  });

  it("gives a strike for a wrong answer and goes to the steal after three", () => {
    let s = run(playing(), { type: "answer", answer: null }, { type: "answer", answer: null });
    expect(s.round!.strikes).toBe(2);
    s = run(s, { type: "answer", answer: null });
    expect(s.round).toMatchObject({ phase: "steal", strikes: 3, currentPlayer: null });
  });

  it("wins the bank, with no steal, when the family clears the board", () => {
    const s = sweepRound(newGame(), 0);
    expect(s.round).toMatchObject({ phase: "over", winner: 0, awarded: 89 });
    expect(s.families.map((f) => f.score)).toEqual([89, 0]);
  });
});

describe("steal", () => {
  const atSteal = () =>
    run(
      newGame(),
      { type: "startRound", survey: survey(6) },
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: 0 },
      { type: "playOrPass", play: true },
      { type: "answer", answer: 2 },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
    );

  it("gives the whole bank, plus the stolen answer, to the other family", () => {
    const s = run(atSteal(), { type: "steal", answer: 4 });
    expect(s.round).toMatchObject({ phase: "over", winner: 1, awarded: 30 + 15 + 8 });
    expect(s.families.map((f) => f.score)).toEqual([0, 53]);
  });

  it("leaves the bank with the controlling family when the steal fails", () => {
    const s = run(atSteal(), { type: "steal", answer: null });
    expect(s.round).toMatchObject({ winner: 0, awarded: 45 });
    expect(s.families.map((f) => f.score)).toEqual([45, 0]);
  });
});

describe("after the round", () => {
  it("reveals the remaining answers without scoring them", () => {
    let s = winSmallRound(newGame(), 0);
    s = run(s, { type: "reveal", answer: 5 });
    expect(s.round!.slots[5]).toBe("shown");
    expect(s.families[0].score).toBe(30);
    expect(() => run(s, { type: "reveal", answer: 0 })).toThrow(/already/i);
  });

  it("does not allow revealing answers for free during play", () => {
    const s = run(newGame(), { type: "startRound", survey: survey(6) });
    expect(() => run(s, { type: "reveal", answer: 0 })).toThrow();
  });

  it("does not start a new round while one is in progress", () => {
    const s = run(newGame(), { type: "startRound", survey: survey(6) });
    expect(nextRound(s)).toBeNull();
    expect(() => run(s, { type: "startRound", survey: survey(6) })).toThrow();
  });
});

describe("Default rules: rounds, multipliers and winning", () => {
  it("plays single, single, double, triple", () => {
    let s = newGame();
    const seen: [string, number][] = [];
    for (let i = 0; i < 4; i++) {
      seen.push([nextRound(s)!.name, nextRound(s)!.multiplier]);
      s = winSmallRound(s, 0);
    }
    expect(seen).toEqual([["Single", 1], ["Single", 1], ["Double", 2], ["Triple", 3]]);
    // 30 x (1 + 1 + 2 + 3)
    expect(s.families[0].score).toBe(210);
  });

  it("ends the game as soon as a family reaches 300 at the end of a round", () => {
    let s = sweepRound(newGame(), 0); // 89 (6-answer board)
    s = sweepRound(s, 0); // + 83 (5 answers) = 172
    expect(s.winner).toBeNull();
    s = sweepRound(s, 0); // + 2 x 75 (4 answers) = 322
    expect(s.families[0].score).toBe(322);
    expect(s.winner).toBe(0);
    expect(nextRound(s)).toBeNull();
    expect(() => startNext(s)).toThrow();
  });

  it("goes to Sudden Death when nobody has 300 after the triple round", () => {
    let s = newGame();
    for (const team of [0, 1, 0, 1] as Team[]) s = winSmallRound(s, team);
    expect(s.winner).toBeNull();
    expect(nextRound(s)).toMatchObject({ kind: "suddenDeath", name: "Sudden Death", multiplier: 3 });
  });

  it("carries the face-off rotation over from round to round", () => {
    let s = run(
      newGame(),
      { type: "startRound", survey: survey(6) },
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: null },
      { type: "faceOffAnswer", team: 1, answer: null },
      { type: "buzz", team: 1 },
      { type: "faceOffAnswer", team: 1, answer: 0 },
      { type: "playOrPass", play: true },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
      { type: "steal", answer: null },
    );
    s = startNext(s);
    expect(s.round!.faceOff.players).toEqual([2, 2]);
  });
});

describe("Sudden Death", () => {
  function atSuddenDeath() {
    let s = newGame();
    for (const team of [0, 1, 0, 1] as Team[]) s = winSmallRound(s, team);
    return run(s, { type: "startRound", survey: survey(1, "sd") });
  }

  it("uses a single-answer survey from the Sudden Death bank", () => {
    let s = newGame();
    for (const team of [0, 1, 0, 1] as Team[]) s = winSmallRound(s, team);
    expect(nextRound(s)).toMatchObject({ minAnswers: 1, maxAnswers: 1 });
    expect(() => run(s, { type: "startRound", survey: survey(4, "main") })).toThrow(/1-1 answers/);
    expect(atSuddenDeath().round!.slots).toEqual(["hidden"]);
  });

  it("is a face-off where only the #1 answer counts, worth triple, and it ends the game", () => {
    const before = atSuddenDeath();
    const scores = before.families.map((f) => f.score);
    let s = run(before, { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: null });
    expect(s.round!.slots[0]).toBe("hidden");
    expect(s.round!.faceOff.turn).toBe(1);
    s = run(s, { type: "faceOffAnswer", team: 1, answer: 0 });
    expect(s.winner).toBe(1);
    expect(s.round).toMatchObject({ phase: "over", awarded: 90 });
    expect(s.families[1].score).toBe(scores[1]! + 90);
    expect(nextRound(s)).toBeNull();
  });

  it("brings up the next pair when neither player says the #1 answer", () => {
    const s = run(
      atSuddenDeath(),
      { type: "buzz", team: 1 },
      { type: "faceOffAnswer", team: 1, answer: null },
      { type: "faceOffAnswer", team: 0, answer: null },
    );
    expect(s.winner).toBeNull();
    expect(s.round!.phase).toBe("faceOff");
    expect(s.round!.faceOff.buzzed).toBeNull();
  });

  it("does not use play or pass", () => {
    const s = run(atSuddenDeath(), { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 0 });
    expect(s.winner).toBe(0);
    expect(() => run(s, { type: "playOrPass", play: true })).toThrow();
  });
});

describe("other presets", () => {
  it("Single points scores every round x1 and repeats the last round until 300", () => {
    let s = newGame(SINGLE_POINTS_RULES);
    for (let i = 0; i < 4; i++) s = winSmallRound(s, 0);
    expect(s.families[0].score).toBe(120);
    expect(nextRound(s)).toMatchObject({ kind: "round", number: 5, multiplier: 1 });
    for (let i = 0; i < 6; i++) s = winSmallRound(s, 0);
    expect(s.families[0].score).toBe(300);
    expect(s.winner).toBe(0);
  });

  it("Fixed rounds ends after round 5 and the highest score wins", () => {
    let s = newGame(FIXED_ROUNDS_RULES);
    for (const team of [0, 1, 0, 1, 0] as Team[]) s = winSmallRound(s, team);
    expect(s.winner).toBe(0);
    expect(nextRound(s)).toBeNull();
  });

  it("Fixed rounds goes to Sudden Death (x1) when tied after round 5", () => {
    let s = newGame(FIXED_ROUNDS_RULES);
    for (const team of [0, 1, 0, 1] as Team[]) s = winSmallRound(s, team); // 60-60
    s = run(s, { type: "adjustScore", team: 1, delta: 30 }); // 60-90
    s = winSmallRound(s, 0); // 90-90 after round 5
    expect(s.families.map((f) => f.score)).toEqual([90, 90]);
    expect(s.winner).toBeNull();
    expect(nextRound(s)).toMatchObject({ kind: "suddenDeath", multiplier: 1 });
  });
});

describe("host corrections", () => {
  it("adjusts a family's score by hand", () => {
    const s = run(newGame(), { type: "adjustScore", team: 1, delta: 25 });
    expect(s.families[1].score).toBe(25);
  });

  it("can tell the UI whether an action is allowed", () => {
    const s = newGame();
    expect(canApply(s, { type: "startRound", survey: survey(6) })).toBe(true);
    expect(canApply(s, { type: "buzz", team: 0 })).toBe(false);
  });

  it("undoes the last action, and does nothing with no history", () => {
    const reduce = undoableReducer(gameReducer);
    let h = createHistory(run(newGame(), { type: "startRound", survey: survey(6) }));
    h = reduce(h, { type: "undo" });
    expect(h.present.round).not.toBeNull();
    h = reduce(h, { type: "buzz", team: 0 });
    h = reduce(h, { type: "faceOffAnswer", team: 0, answer: 0 });
    expect(h.present.round!.bank).toBe(30);
    h = reduce(h, { type: "undo" });
    expect(h.present.round!.bank).toBe(0);
    expect(h.present.round!.faceOff.buzzed).toBe(0);
  });

  it("never changes the state it was given", () => {
    const s = run(newGame(), { type: "startRound", survey: survey(6) });
    const snapshot = structuredClone(s);
    run(s, { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 0 });
    expect(s).toEqual(snapshot);
  });
});

describe("fixes from the review", () => {
  it("ends the game when a host score correction takes a family past the target", () => {
    let s = sweepRound(newGame(), 0); // round 1 over, nobody near 300
    expect(s.winner).toBeNull();
    s = run(s, { type: "adjustScore", team: 0, delta: 300 });
    expect(s.families[0].score).toBeGreaterThanOrEqual(300);
    expect(s.winner).toBe(0);
    expect(nextRound(s)).toBeNull();
  });

  it("awards the round when the face-off uncovers every answer on a small hand-picked board", () => {
    let s = run(newGame(), { type: "startRound", survey: survey(2), handPicked: true });
    s = run(
      s,
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: 1 }, // Smith says #2
      { type: "faceOffAnswer", team: 1, answer: 0 }, // Jones beats it with #1: the board is now clear
    );
    expect(s.round!.slots.every((slot) => slot === "won")).toBe(true);
    // Nothing is left to play for, so the round should be over and Jones paid.
    expect(s.round!.phase).toBe("over");
    expect(s.round!.winner).toBe(1);
    expect(s.families[1].score).toBe(50);
  });

  it("a score correction mid-round leaves the winner to the end of the round", () => {
    let s = startNext(newGame());
    s = run(s, { type: "adjustScore", team: 0, delta: 300 });
    expect(s.winner).toBeNull();
  });

  it("Fixed rounds: a correction after the last round decides the game, and a tie still goes to Sudden Death", () => {
    let s = newGame(FIXED_ROUNDS_RULES);
    for (const team of [0, 1, 0, 1, 0] as Team[]) s = winSmallRound(s, team); // 90-60
    expect(s.winner).toBe(0);
    s = run(s, { type: "adjustScore", team: 1, delta: 30 }); // 90-90
    expect(s.winner).toBeNull();
    expect(nextRound(s)).toMatchObject({ kind: "suddenDeath" });
    s = run(s, { type: "adjustScore", team: 1, delta: 10 }); // 90-100
    expect(s.winner).toBe(1);
  });
});

