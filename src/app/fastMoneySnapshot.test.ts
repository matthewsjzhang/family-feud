import { describe, expect, it } from "vitest";
import type { Survey } from "../data/bank";
import { createFastMoney, fastMoneyReducer, type FastMoneyAction, type FastMoneyState } from "../engine/fastMoney";
import { createGame, gameReducer } from "../engine/mainGame";
import { DEFAULT_RULES } from "../engine/rules";
import { deriveFastMoneyEvents, toFastMoneyView, toSnapshot } from "./boardSnapshot";

function survey(i: number): Survey {
  return {
    id: `fm${i}`,
    season: 22,
    answerCount: 4,
    question: `Fast Money question ${i + 1}`,
    total: 100,
    answers: [40, 30, 20, 10].map((points, j) => ({ text: `Q${i + 1} ANSWER ${j + 1}`, points })),
    source: "https://example.test",
  };
}

const run = (s: FastMoneyState, ...actions: FastMoneyAction[]) => actions.reduce(fastMoneyReducer, s);
const say = (text: string): FastMoneyAction => ({ type: "giveAnswer", text });
const fresh = () => createFastMoney(DEFAULT_RULES.fastMoney, [0, 1, 2, 3, 4].map(survey), ["Ann", "Bob"]);
const eventsFor = (s: FastMoneyState, action: FastMoneyAction) => deriveFastMoneyEvents(s, fastMoneyReducer(s, action));

/** Player 1 answers all five and is judged [0, 1, null, 3, 2] = 100 points. */
function afterPlayer1() {
  let s = run(fresh(), { type: "startClock" }, ...["cat", "dog", "fish", "bird", "frog"].map(say));
  [0, 1, null, 3, 2].forEach((answer, question) => (s = run(s, { type: "judge", question, answer })));
  return s;
}

describe("toFastMoneyView", () => {
  it("shows nothing until the host puts an answer up, then its points after judging", () => {
    let s = run(fresh(), { type: "startClock" }, ...["cat", "dog", "fish", "bird", "frog"].map(say));
    expect(toFastMoneyView(s, "Smith").rows[0]![0]).toEqual({ text: null, points: null });
    s = run(s, { type: "showAnswer", question: 0 });
    expect(toFastMoneyView(s, "Smith").rows[0]![0]).toEqual({ text: "cat", points: null });
    s = run(s, { type: "judge", question: 0, answer: 0 });
    expect(toFastMoneyView(s, "Smith").rows[0]![0]).toEqual({ text: "cat", points: 40 });
  });

  it("never shows the questions or the survey answers", () => {
    const json = JSON.stringify(toFastMoneyView(afterPlayer1(), "Smith"));
    expect(json).not.toMatch(/Fast Money question|ANSWER/);
  });

  it("covers player 1's answers and the total while player 2 plays, then uncovers them", () => {
    let s = run(afterPlayer1(), { type: "startPlayer2" });
    let view = toFastMoneyView(s, "Smith");
    expect(view.player1Hidden).toBe(true);
    expect(view.total).toBeNull();
    expect(view.rows.every(([p1]) => p1.text === null && p1.points === null)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/cat|dog/);

    s = run(s, { type: "startClock" }, ...["a", "b", "c", "d", "e"].map(say));
    view = toFastMoneyView(s, "Smith");
    expect(view.player1Hidden).toBe(false);
    expect(view.rows[0]![0]).toEqual({ text: "cat", points: 40 });
    expect(view.total).toBe(100);
  });

  it("shows an unanswered question as blank with zero once time runs out", () => {
    const s = run(fresh(), { type: "startClock" }, say("cat"), { type: "tick", ms: 20000 });
    expect(toFastMoneyView(s, "Smith").rows[1]![0]).toEqual({ text: "", points: 0 });
  });

  it("is part of the board snapshot only while Fast Money is on, under the winning family's name", () => {
    let game = createGame(DEFAULT_RULES, [
      { name: "Smith", players: ["Ann", "Bob"] },
      { name: "Jones", players: ["Jan", "Joe"] },
    ]);
    expect(toSnapshot(game, fresh()).fastMoney).toBeNull(); // no winner yet
    game = gameReducer(game, { type: "adjustScore", team: 0, delta: 0 });
    game = { ...game, winner: 0 };
    expect(toSnapshot(game).fastMoney).toBeNull();
    expect(toSnapshot(game, fresh()).fastMoney).toMatchObject({ family: "Smith", players: ["Ann", "Bob"], target: 200 });
  });
});

describe("deriveFastMoneyEvents", () => {
  it("announces the start, the clock and running out of time", () => {
    expect(deriveFastMoneyEvents(null, fresh())).toEqual([{ type: "fmStart" }]);
    expect(eventsFor(fresh(), { type: "startClock" })).toEqual([{ type: "fmClockStart" }]);
    const answering = run(fresh(), { type: "startClock" }, say("cat"));
    expect(eventsFor(answering, { type: "tick", ms: 20000 })).toEqual([{ type: "fmTimeUp" }]);
    expect(eventsFor(answering, { type: "tick", ms: 100 })).toEqual([]);
  });

  it("marks showing an answer and then its points, including zero", () => {
    const judging = run(fresh(), { type: "startClock" }, ...["cat", "dog", "fish", "bird", "frog"].map(say));
    expect(eventsFor(judging, { type: "showAnswer", question: 1 })).toEqual([
      { type: "fmAnswerShown", player: 0, question: 1 },
    ]);
    expect(eventsFor(judging, { type: "judge", question: 1, answer: null })).toEqual([
      { type: "fmPoints", player: 0, question: 1, points: 0 },
    ]);
    const judged = run(judging, { type: "judge", question: 1, answer: null });
    expect(eventsFor(judged, { type: "judge", question: 1, answer: 2 })).toEqual([
      { type: "fmPoints", player: 0, question: 1, points: 20 },
    ]);
  });

  it("sounds the double buzzer on a duplicate and uncovers player 1 when player 2 is done", () => {
    let s = run(afterPlayer1(), { type: "startPlayer2" }, { type: "startClock" });
    expect(eventsFor(s, say("CAT"))).toEqual([{ type: "fmDuplicate" }]);
    s = run(s, ...["a", "b", "c", "d"].map(say));
    expect(eventsFor(s, say("e"))).toEqual([{ type: "fmUncover" }]);
  });

  it("announces the result with the payout", () => {
    let s = run(afterPlayer1(), { type: "startPlayer2" }, { type: "startClock" }, ...["a", "b", "c", "d", "e"].map(say));
    [0, 0, null, null].forEach((answer, question) => (s = run(s, { type: "judge", question, answer })));
    const events = eventsFor(s, { type: "judge", question: 4, answer: 1 });
    expect(events.at(-1)).toEqual({ type: "fmResult", won: true, total: 210, payout: 20000 });
  });
});
