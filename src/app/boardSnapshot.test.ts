import { describe, expect, it } from "vitest";
import type { Survey } from "../data/bank";
import { createGame, gameReducer, type GameAction, type GameState } from "../engine/mainGame";
import { DEFAULT_RULES } from "../engine/rules";
import { deriveEvents, toSnapshot } from "./boardSnapshot";

const survey: Survey = {
  id: "q6",
  season: 20,
  answerCount: 6,
  question: "Name something secret.",
  total: 89,
  answers: [30, 20, 15, 10, 8, 6].map((points, i) => ({ text: `SECRET ${i + 1}`, points })),
  source: "https://example.test",
};

const families = [
  { name: "Smith", players: ["S1", "S2", "S3", "S4", "S5"] },
  { name: "Jones", players: ["J1", "J2", "J3", "J4", "J5"] },
];

const run = (s: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, s);
const started = () => run(createGame(DEFAULT_RULES, families), { type: "startRound", survey });

/** Events for the last action applied to `state`. */
function eventsFor(state: GameState, action: GameAction) {
  return deriveEvents(state, gameReducer(state, action));
}

describe("toSnapshot", () => {
  it("never includes the text or points of hidden answers", () => {
    const s = run(started(), { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 2 });
    const snapshot = toSnapshot(s);
    expect(snapshot.round!.slots[2]).toEqual({ number: 3, state: "won", text: "SECRET 3", points: 15 });
    expect(snapshot.round!.slots[0]).toEqual({ number: 1, state: "hidden", text: null, points: null });
    const json = JSON.stringify(snapshot);
    for (const hidden of [1, 2, 4, 5, 6]) expect(json).not.toContain(`SECRET ${hidden}`);
  });

  it("keeps the question off the board until someone buzzes in, then keeps it up", () => {
    const before = toSnapshot(started());
    expect(before.round!.question).toBeNull();
    expect(JSON.stringify(before)).not.toContain(survey.question);

    const buzzed = run(started(), { type: "buzz", team: 0 });
    expect(toSnapshot(buzzed).round!.question).toBe(survey.question);
    const nextPair = run(
      buzzed,
      { type: "faceOffAnswer", team: 0, answer: null },
      { type: "faceOffAnswer", team: 1, answer: null },
    );
    expect(toSnapshot(nextPair).round!.question).toBe(survey.question);
  });

  it("names the players at the buzzer and carries scores", () => {
    const snapshot = toSnapshot(run(started(), { type: "adjustScore", team: 1, delta: 40 }));
    expect(snapshot.round!.faceOff.players).toEqual(["S1", "J1"]);
    expect(snapshot.families).toEqual([
      { name: "Smith", score: 0 },
      { name: "Jones", score: 40 },
    ]);
  });

  it("shows no round before the first one starts", () => {
    expect(toSnapshot(createGame(DEFAULT_RULES, families)).round).toBeNull();
  });
});

describe("deriveEvents", () => {
  it("announces a new round", () => {
    const fresh = createGame(DEFAULT_RULES, families);
    expect(eventsFor(fresh, { type: "startRound", survey })).toEqual([{ type: "newRound" }]);
  });

  it("reports the buzz and each reveal", () => {
    expect(eventsFor(started(), { type: "buzz", team: 1 })).toEqual([{ type: "buzz", team: 1 }]);
    const buzzed = run(started(), { type: "buzz", team: 1 });
    expect(eventsFor(buzzed, { type: "faceOffAnswer", team: 1, answer: 3 })).toEqual([
      { type: "reveal", slot: 3, earned: true },
    ]);
  });

  it("flashes one X for a face-off miss, including when both players miss", () => {
    const buzzed = run(started(), { type: "buzz", team: 0 });
    expect(eventsFor(buzzed, { type: "faceOffAnswer", team: 0, answer: null })).toEqual([{ type: "strike", count: 1 }]);
    const firstMissed = run(buzzed, { type: "faceOffAnswer", team: 0, answer: null });
    expect(eventsFor(firstMissed, { type: "faceOffAnswer", team: 1, answer: null })).toEqual([
      { type: "strike", count: 1 },
    ]);
  });

  it("flashes the strike total while playing, then one X for a failed steal and the round result", () => {
    let s = run(
      started(),
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: 0 },
      { type: "playOrPass", play: true },
      { type: "answer", answer: null },
    );
    expect(eventsFor(s, { type: "answer", answer: null })).toEqual([{ type: "strike", count: 2 }]);
    s = run(s, { type: "answer", answer: null }, { type: "answer", answer: null });
    expect(eventsFor(s, { type: "steal", answer: null })).toEqual([
      { type: "strike", count: 1 },
      { type: "roundWon", team: 0, points: 30 },
    ]);
  });

  it("reveals the stolen answer before awarding the round to the stealing family", () => {
    const s = run(
      started(),
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: 0 },
      { type: "playOrPass", play: true },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
    );
    expect(eventsFor(s, { type: "steal", answer: 1 })).toEqual([
      { type: "reveal", slot: 1, earned: true },
      { type: "roundWon", team: 1, points: 50 },
    ]);
  });

  it("marks answers revealed after the round as not earned", () => {
    const over = run(
      started(),
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: 0 },
      { type: "playOrPass", play: true },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
      { type: "steal", answer: null },
    );
    expect(eventsFor(over, { type: "reveal", answer: 4 })).toEqual([{ type: "reveal", slot: 4, earned: false }]);
  });

  it("announces the game winner", () => {
    const s = run(started(), { type: "adjustScore", team: 0, delta: 290 }, { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 0 }, { type: "playOrPass", play: true }, { type: "answer", answer: null }, { type: "answer", answer: null }, { type: "answer", answer: null });
    const events = eventsFor(s, { type: "steal", answer: null });
    expect(events.at(-1)).toEqual({ type: "gameWon", team: 0 });
  });
});
