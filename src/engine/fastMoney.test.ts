import { describe, expect, it } from "vitest";
import type { Survey } from "../data/bank";
import {
  createFastMoney,
  fastMoneyReducer,
  fastMoneyTotal,
  isPlayer1Hidden,
  type FastMoneyAction,
  type FastMoneyState,
} from "./fastMoney";
import { DEFAULT_RULES, type FastMoneyRule } from "./rules";
import { createHistory, undoableReducer } from "./undo";

// Each survey's #1 answer is worth 40, #2 30, #3 20, #4 10.
function survey(i: number): Survey {
  const points = [40, 30, 20, 10];
  return {
    id: `fm${i}`,
    season: 22,
    answerCount: 4,
    question: `Fast Money question ${i + 1}`,
    total: 100,
    answers: points.map((p, j) => ({ text: `Q${i + 1} ANSWER ${j + 1}`, points: p })),
    source: "https://example.test",
  };
}

const SURVEYS = Array.from({ length: 5 }, (_, i) => survey(i));
const RULE = DEFAULT_RULES.fastMoney;

function newRound(rule: FastMoneyRule = RULE) {
  return createFastMoney(rule, SURVEYS, ["Ann", "Bob"]);
}

function run(state: FastMoneyState, ...actions: FastMoneyAction[]): FastMoneyState {
  return actions.reduce(fastMoneyReducer, state);
}

const say = (text: string): FastMoneyAction => ({ type: "giveAnswer", text });
const judge = (question: number, answer: number | null): FastMoneyAction => ({ type: "judge", question, answer });

/** Player answers all five questions, then the host judges them with the given board answers. */
function playTurn(state: FastMoneyState, words: string[], board: (number | null)[]): FastMoneyState {
  let s = run(state, { type: "startClock" }, ...words.map(say));
  board.forEach((answer, q) => (s = run(s, judge(q, answer))));
  return s;
}

describe("setup", () => {
  it("needs exactly five surveys and two players", () => {
    expect(() => createFastMoney(RULE, SURVEYS.slice(0, 4), ["Ann", "Bob"])).toThrow(/five/i);
    expect(() => createFastMoney(RULE, SURVEYS, ["Ann"])).toThrow(/two players/i);
  });

  it("starts with player 1 and a 20-second clock that isn't running", () => {
    const s = newRound();
    expect(s).toMatchObject({ turn: 0, phase: "ready", timeLeftMs: 20000, clockRunning: false, current: 0 });
    expect(s.players[0].answers).toHaveLength(5);
  });

  it("uses the timers from the rules", () => {
    expect(newRound({ ...RULE, timers: [30, 35] }).timeLeftMs).toBe(30000);
  });
});

describe("the clock", () => {
  it("doesn't run until the host starts it", () => {
    expect(run(newRound(), { type: "tick", ms: 1000 }).timeLeftMs).toBe(20000);
  });

  it("only pauses a running clock", () => {
    expect(() => run(newRound(), { type: "pauseClock" })).toThrow(/clock/i);
    const paused = run(newRound(), { type: "startClock" }, { type: "pauseClock" });
    expect(() => run(paused, { type: "pauseClock" })).toThrow(/clock/i);
  });

  it("counts down once started, and can be paused", () => {
    let s = run(newRound(), { type: "startClock" }, { type: "tick", ms: 1500 });
    expect(s.timeLeftMs).toBe(18500);
    s = run(s, { type: "pauseClock" }, { type: "tick", ms: 5000 });
    expect(s.timeLeftMs).toBe(18500);
    expect(s.phase).toBe("answering");
  });

  it("ends the turn at zero; unanswered questions score nothing", () => {
    let s = run(newRound(), { type: "startClock" }, say("cat"), { type: "tick", ms: 25000 });
    expect(s).toMatchObject({ phase: "judging", timeLeftMs: 0, clockRunning: false });
    expect(s.players[0].answers[1]).toMatchObject({ text: null, judged: true, points: 0 });
    expect(s.players[0].answers[0]).toMatchObject({ text: "cat", judged: false });
  });
});

describe("answering", () => {
  it("records an answer and moves to the next question", () => {
    const s = run(newRound(), { type: "startClock" }, say("cat"));
    expect(s.players[0].answers[0]!.text).toBe("cat");
    expect(s.current).toBe(1);
  });

  it("ends the turn and stops the clock after the fifth answer", () => {
    const s = run(newRound(), { type: "startClock" }, ...["a", "b", "c", "d", "e"].map(say));
    expect(s).toMatchObject({ phase: "judging", clockRunning: false });
  });

  it("lets the player pass and come back to passed questions at the end", () => {
    let s = run(newRound(), { type: "startClock" }, { type: "pass" }, say("b"), { type: "pass" }, say("d"), say("e"));
    expect(s.current).toBe(0);
    s = run(s, say("a"));
    expect(s.current).toBe(2);
    s = run(s, say("c"));
    expect(s.phase).toBe("judging");
    expect(s.players[0].answers.map((a) => a.text)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("lets the host end the turn early", () => {
    const s = run(newRound(), { type: "startClock" }, say("a"), { type: "endTurn" });
    expect(s.phase).toBe("judging");
  });

  it("ignores blank answers and only accepts answers while the clock phase is on", () => {
    const answering = run(newRound(), { type: "startClock" });
    expect(() => run(answering, say("   "))).toThrow(/blank/i);
    expect(() => run(newRound(), say("cat"))).toThrow();
  });
});

describe("judging", () => {
  const judging = () => run(newRound(), { type: "startClock" }, ...["a", "b", "c", "d", "e"].map(say));

  it("scores an answer with its survey points, or zero if not on the board", () => {
    let s = run(judging(), judge(0, 1), judge(1, null));
    expect(s.players[0].answers[0]).toMatchObject({ answer: 1, points: 30, judged: true });
    expect(s.players[0].answers[1]).toMatchObject({ answer: null, points: 0, judged: true });
    expect(fastMoneyTotal(s)).toBe(30);
  });

  it("can put an answer on the board before its points, like \"survey says\"", () => {
    let s = run(judging(), { type: "showAnswer", question: 2 });
    expect(s.players[0].answers[2]).toMatchObject({ shown: true, judged: false, points: 0 });
    s = run(s, judge(2, 0));
    expect(s.players[0].answers[2]).toMatchObject({ shown: true, judged: true, points: 40 });
    expect(() => run(newRound(), { type: "showAnswer", question: 0 })).toThrow();
  });

  it("shows and scores blank answers automatically when time runs out", () => {
    const s = run(newRound(), { type: "startClock" }, say("cat"), { type: "tick", ms: 20000 });
    expect(s.players[0].answers[1]).toMatchObject({ text: null, shown: true, judged: true, points: 0 });
    expect(() => run(s, { type: "showAnswer", question: 1 })).toThrow(/no answer/i);
  });

  it("lets the host change a judgement before moving on", () => {
    const s = run(judging(), judge(0, 1), judge(0, 0));
    expect(fastMoneyTotal(s)).toBe(40);
  });

  it("rejects judging a question with no answer, or a board answer that doesn't exist", () => {
    const s = run(newRound(), { type: "startClock" }, say("a"), { type: "endTurn" });
    expect(() => run(s, judge(1, 0))).toThrow(/no answer/i);
    expect(() => run(s, judge(0, 7))).toThrow();
  });
});

describe("between players", () => {
  it("wins outright if player 1 alone reaches the target", () => {
    const s = playTurn(newRound(), ["a", "b", "c", "d", "e"], [0, 0, 0, 0, 0]); // 5 x 40 = 200
    expect(s.phase).toBe("done");
    expect(s.outcome).toEqual({ won: true, total: 200, payout: 20000 });
  });

  it("otherwise hands over to player 2 with the 25-second clock", () => {
    let s = playTurn(newRound(), ["a", "b", "c", "d", "e"], [0, 1, null, 3, 2]); // 100
    expect(s.phase).toBe("handoff");
    s = run(s, { type: "startPlayer2" });
    expect(s).toMatchObject({ turn: 1, phase: "ready", timeLeftMs: 25000, current: 0 });
  });

  it("covers player 1's answers while player 2 plays, and uncovers them for judging", () => {
    let s = run(playTurn(newRound(), ["a", "b", "c", "d", "e"], [0, 1, null, 3, 2]), { type: "startPlayer2" });
    expect(isPlayer1Hidden(s)).toBe(true);
    s = run(s, { type: "startClock" }, ...["v", "w", "x", "y", "z"].map(say));
    expect(isPlayer1Hidden(s)).toBe(false);
    expect(isPlayer1Hidden(newRound())).toBe(false);
  });
});

describe("player 2", () => {
  const player2 = () =>
    run(playTurn(newRound(), ["Cat", "b", "c", "d", "e"], [0, 1, null, 3, 2]), { type: "startPlayer2" }, { type: "startClock" });

  it("hears the double buzzer and must try again on a duplicate answer", () => {
    const s = run(player2(), say("CAT!"));
    expect(s.duplicates).toBe(1);
    expect(s.current).toBe(0);
    expect(s.players[1].answers[0]!.text).toBeNull();
  });

  it("catches a duplicate worded differently when both mean the same board answer", () => {
    const pets = { ...survey(0), answers: [{ text: "CAT/KITTEN", points: 40 }, { text: "DOG", points: 30 }] };
    let s = createFastMoney(RULE, [pets, ...SURVEYS.slice(1)], ["Ann", "Bob"]);
    s = playTurn(s, ["kitten", "b", "c", "d", "e"], [0, null, null, null, null]);
    s = run(s, { type: "startPlayer2" }, { type: "startClock" }, say("cats"));
    expect(s.duplicates).toBe(1);
    s = run(s, say("dog"));
    expect(s.players[1].answers[0]!.text).toBe("dog");
  });

  it("only treats it as a duplicate on the same question", () => {
    const s = run(player2(), { type: "pass" }, say("cat"));
    expect(s.duplicates).toBe(0);
    expect(s.players[1].answers[1]!.text).toBe("cat");
  });

  it("lets the host call a duplicate the automatic check missed", () => {
    const s = run(player2(), { type: "giveAnswer", text: "kitty", duplicate: true });
    expect(s.duplicates).toBe(1);
    expect(s.players[1].answers[0]!.text).toBeNull();
  });

  it("keeps a running total of both players while answers are judged", () => {
    const s = run(player2(), ...["v", "w", "x", "y", "z"].map(say), judge(0, 0), judge(1, 0));
    expect(fastMoneyTotal(s)).toBe(100 + 80);
    expect(s.phase).toBe("judging");
    expect(s.outcome).toBeNull();
  });
});

describe("result", () => {
  function finish(p2Board: (number | null)[], rule: FastMoneyRule = RULE) {
    let s = playTurn(newRound(rule), ["a", "b", "c", "d", "e"], [0, 1, null, 3, 2]); // 100
    s = run(s, { type: "startPlayer2" });
    return playTurn(s, ["v", "w", "x", "y", "z"], p2Board);
  }

  it("pays the grand prize at 200 or more", () => {
    const s = finish([0, 0, 1, null, null]); // + 110 = 210
    expect(s.phase).toBe("done");
    expect(s.outcome).toEqual({ won: true, total: 210, payout: 20000 });
  });

  it("pays $5 a point below 200", () => {
    const s = finish([0, 0, null, null, 3]); // + 90 = 190
    expect(s.outcome).toEqual({ won: false, total: 190, payout: 950 });
  });

  it("uses the preset's target, prize and per-point amount", () => {
    const s = finish([0, 3, null, null, null], { ...RULE, target: 150, grandPrize: 10000, perPoint: 1 }); // 150
    expect(s.outcome).toEqual({ won: true, total: 150, payout: 10000 });
  });

  it("wins the moment the total reaches the target, with answers still to judge", () => {
    let s = playTurn(newRound(), ["a", "b", "c", "d", "e"], [0, 1, null, 3, 2]); // 100
    s = run(s, { type: "startPlayer2" }, { type: "startClock" }, ...["v", "w", "x", "y", "z"].map(say));
    s = run(s, judge(0, 0), judge(1, 0)); // 180
    expect(s.phase).toBe("judging");
    s = run(s, judge(2, 1)); // 210
    expect(s.phase).toBe("done");
    expect(s.outcome).toEqual({ won: true, total: 210, payout: 20000 });
    expect(s.players[1].answers.slice(3).map((a) => a.judged)).toEqual([false, false]);
  });

  it("lets the host reveal the rest after an early win without changing the prize", () => {
    let s = playTurn(newRound(), ["a", "b", "c", "d", "e"], [0, 1, null, 3, 2]); // 100
    s = run(s, { type: "startPlayer2" }, { type: "startClock" }, ...["v", "w", "x", "y", "z"].map(say));
    s = run(s, judge(0, 0), judge(1, 0), judge(2, 1)); // 210: won
    s = run(s, { type: "showAnswer", question: 3 });
    expect(s.players[1].answers[3]!.shown).toBe(true);
    s = run(s, judge(3, 0), judge(4, null)); // + 40
    expect(s.outcome).toEqual({ won: true, total: 250, payout: 20000 });
    // Answers already judged can't be changed after the win (that could undo it): use Undo instead.
    expect(() => run(s, judge(0, null))).toThrow();
  });

  it("supports undo, e.g. after a wrong judgement", () => {
    const reduce = undoableReducer(fastMoneyReducer);
    let h = createHistory(run(newRound(), { type: "startClock" }, ...["a", "b", "c", "d", "e"].map(say)));
    h = reduce(h, judge(0, 0));
    h = reduce(h, { type: "undo" });
    expect(h.present.players[0].answers[0]!.judged).toBe(false);
  });
});
