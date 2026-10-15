// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../engine/rules";
import type { SyncChannel, SyncMessage } from "../sync/channel";
import { useGameHost, type GameSetup } from "./useGameHost";

/** In-memory stand-in for BroadcastChannel that records what the host sends. */
function fakeChannel() {
  const sent: SyncMessage[] = [];
  const listeners = new Set<(m: SyncMessage) => void>();
  const channel: SyncChannel = {
    post: (m) => sent.push(m),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {},
  };
  return { channel, sent, receive: (m: SyncMessage) => listeners.forEach((l) => l(m)) };
}

const setup: GameSetup = {
  rules: DEFAULT_RULES,
  families: [
    { name: "Smith", players: ["S1", "S2", "S3", "S4", "S5"] },
    { name: "Jones", players: ["J1", "J2", "J3", "J4", "J5"] },
  ],
};

async function ready() {
  const fake = fakeChannel();
  const factory = () => fake.channel;
  const hook = renderHook(() => useGameHost(factory));
  await waitFor(() => expect(hook.result.current.bankReady).toBe(true), { timeout: 10000 });
  return { ...fake, hook };
}

describe("useGameHost", () => {
  it("loads the question bank and starts on the setup screen", async () => {
    const { hook, sent } = await ready();
    expect(hook.result.current.bankSize).toBeGreaterThan(8800);
    expect(hook.result.current.state).toBeNull();
    expect(sent.at(-1)).toEqual({ type: "snapshot", snapshot: null, events: [] });
  });

  it("starts each round with a real survey of the right size and tells the board", async () => {
    const { hook, sent } = await ready();
    act(() => hook.result.current.newGame(setup));
    expect(hook.result.current.upcoming).toMatchObject({ number: 1, minAnswers: 6, maxAnswers: 8 });
    act(() => hook.result.current.startNextRound());

    const round = hook.result.current.state!.round!;
    expect(round.survey.answerCount).toBeGreaterThanOrEqual(6);
    expect(round.survey.source).toMatch(/mstiescott\.neocities\.org\/feud\d+_\d/);
    const last = sent.at(-1)!;
    expect(last).toMatchObject({ type: "snapshot", events: [{ type: "newRound" }] });
    // The board never receives hidden answer text.
    expect(JSON.stringify(last)).not.toContain(round.survey.answers[0]!.text);
  });

  it("draws Sudden Death questions from the separate single-answer bank", async () => {
    const { hook } = await ready();
    expect(hook.result.current.suddenDeathBankSize).toBeGreaterThan(450);
    const oneRound = { ...structuredClone(DEFAULT_RULES), id: "one", builtIn: false, rounds: [DEFAULT_RULES.rounds[0]!] };
    act(() => hook.result.current.newGame({ ...setup, rules: oneRound }));
    act(() => hook.result.current.startNextRound());
    // Smith takes control with the #1 answer, strikes out, and Jones' steal fails: well short of 300.
    for (const action of [
      { type: "buzz", team: 0 },
      { type: "faceOffAnswer", team: 0, answer: 0 },
      { type: "playOrPass", play: true },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
      { type: "answer", answer: null },
      { type: "steal", answer: null },
    ] as const) {
      act(() => hook.result.current.apply(action));
    }
    expect(hook.result.current.upcoming).toMatchObject({ kind: "suddenDeath" });

    act(() => hook.result.current.startNextRound());
    const sd = hook.result.current.state!.round!;
    expect(sd.kind).toBe("suddenDeath");
    expect(sd.survey.answerCount).toBe(1);
    expect(sd.survey.source).toMatch(/feud\d+_1$/);

    // Swapping keeps it a Sudden Death question.
    act(() => hook.result.current.swapQuestion());
    const swapped = hook.result.current.state!.round!;
    expect(swapped.survey.id).not.toBe(sd.survey.id);
    expect(swapped.survey.source).toMatch(/feud\d+_1$/);
  });

  describe("Fast Money", () => {
    /** A game where the first round decides it (target 1), won by Smith. */
    async function wonGame() {
      const fake = await ready();
      const { hook } = fake;
      const quick = { ...structuredClone(DEFAULT_RULES), id: "quick", builtIn: false, win: { type: "target" as const, target: 1 } };
      act(() => hook.result.current.newGame({ ...setup, rules: quick }));
      act(() => hook.result.current.startNextRound());
      for (const action of [
        { type: "buzz", team: 0 },
        { type: "faceOffAnswer", team: 0, answer: 0 },
        { type: "playOrPass", play: true },
        { type: "answer", answer: null },
        { type: "answer", answer: null },
        { type: "answer", answer: null },
        { type: "steal", answer: null },
      ] as const) {
        act(() => hook.result.current.apply(action));
      }
      expect(hook.result.current.state!.winner).toBe(0);
      return fake;
    }

    it("is only available once the game is won", async () => {
      const { hook } = await ready();
      act(() => hook.result.current.newGame(setup));
      expect(hook.result.current.canStartFastMoney).toBe(false);
      act(() => hook.result.current.startFastMoney([0, 1]));
      expect(hook.result.current.fastMoney).toBeNull();
    });

    it("starts with two players of the winning family and five real surveys, and tells the board", async () => {
      const { hook, sent } = await wonGame();
      expect(hook.result.current.canStartFastMoney).toBe(true);
      act(() => hook.result.current.startFastMoney([0, 0]));
      expect(hook.result.current.lastError).toMatch(/two different players/i);

      act(() => hook.result.current.startFastMoney([1, 3]));
      const fm = hook.result.current.fastMoney!;
      expect(fm.players.map((p) => p.name)).toEqual(["S2", "S4"]);
      expect(fm.surveys).toHaveLength(5);
      expect(new Set(fm.surveys.map((s) => s.id)).size).toBe(5);
      expect(fm.surveys.every((s) => s.answerCount >= 4 && /feud\d+_[4-8]$/.test(s.source))).toBe(true);
      expect(hook.result.current.canStartFastMoney).toBe(false);

      const last = sent.at(-1) as { snapshot: { fastMoney: unknown }; events: unknown[] };
      expect(last.events).toEqual([{ type: "fmStart" }]);
      expect(last.snapshot.fastMoney).toMatchObject({ family: "Smith", players: ["S2", "S4"] });
      // The board never gets the Fast Money questions or survey answers.
      expect(JSON.stringify(last)).not.toContain(fm.surveys[0]!.question);
    });

    it("runs the clock from the host window and undoes Fast Money steps separately", async () => {
      const { hook } = await wonGame();
      act(() => hook.result.current.startFastMoney([0, 1]));
      act(() => hook.result.current.applyFastMoney({ type: "startClock" }));
      await waitFor(() => expect(hook.result.current.fastMoney!.timeLeftMs).toBeLessThan(19_800), { timeout: 3000 });

      act(() => hook.result.current.applyFastMoney({ type: "giveAnswer", text: "cat" }));
      expect(hook.result.current.fastMoney!.players[0].answers[0]!.text).toBe("cat");
      expect(hook.result.current.canUndo).toBe(true);
      act(() => hook.result.current.undo());
      expect(hook.result.current.fastMoney!.players[0].answers[0]!.text).toBeNull();
      // Clock ticks are not undo steps: one more undo goes back to before the clock started.
      act(() => hook.result.current.undo());
      expect(hook.result.current.fastMoney!.phase).toBe("ready");
      expect(hook.result.current.state!.winner).toBe(0); // the main game is untouched
    });

    it("suggests matches against each Fast Money survey and checks actions", async () => {
      const { hook } = await wonGame();
      act(() => hook.result.current.startFastMoney([0, 1]));
      const fm = hook.result.current.fastMoney!;
      const top = fm.surveys[2]!.answers[0]!.text.split("/")[0]!;
      expect(hook.result.current.suggestFastMoney(2, top)!.index).toBe(0);
      expect(hook.result.current.canFastMoney({ type: "giveAnswer", text: "x" })).toBe(false); // clock not started
      expect(hook.result.current.canFastMoney({ type: "startClock" })).toBe(true);
    });

    it("leaves Fast Money, and a new game clears it", async () => {
      const { hook } = await wonGame();
      act(() => hook.result.current.startFastMoney([0, 1]));
      act(() => hook.result.current.endFastMoney());
      expect(hook.result.current.fastMoney).toBeNull();
      act(() => hook.result.current.startFastMoney([0, 1]));
      act(() => hook.result.current.newGame(setup));
      expect(hook.result.current.fastMoney).toBeNull();
    });
  });

  describe("custom questions and question sets", () => {
    beforeEach(() => localStorage.clear());

    const family = { question: "Name something in our garage.", answers: [{ text: "Car", points: 50 }, { text: "Bikes", points: 30 }, { text: "Junk", points: 20 }], suddenDeath: false };

    it("adds, edits and deletes custom questions, saved in the browser and listed in the banks", async () => {
      const { hook } = await ready();
      let added = null as ReturnType<typeof hook.result.current.addCustomQuestion>;
      act(() => {
        added = hook.result.current.addCustomQuestion(family);
      });
      expect(added).toMatchObject({ custom: "main", answerCount: 3 });
      expect(hook.result.current.banks!.custom.map((s) => s.question)).toEqual([family.question]);
      expect(hook.result.current.findSurvey(added!.id)).toEqual(added);
      expect(JSON.parse(localStorage.getItem("feud.customQuestions")!)).toHaveLength(1);

      act(() => {
        hook.result.current.updateCustomQuestion(added!.id, { ...family, question: "Name something in the garage." });
      });
      expect(hook.result.current.banks!.custom[0]!.question).toBe("Name something in the garage.");

      act(() => {
        expect(hook.result.current.addCustomQuestion({ ...family, question: "" })).toBeNull();
      });
      expect(hook.result.current.lastError).toMatch(/question/i);

      act(() => hook.result.current.removeCustomQuestion(added!.id));
      expect(hook.result.current.banks!.custom).toEqual([]);
    });

    it("plays a queued custom question even when it has fewer answers than the round normally needs", async () => {
      const { hook } = await ready();
      let added = null as ReturnType<typeof hook.result.current.addCustomQuestion>;
      act(() => {
        added = hook.result.current.addCustomQuestion(family);
      });
      act(() => hook.result.current.newGame(setup));
      act(() => hook.result.current.queueSurvey(added!.id));
      act(() => hook.result.current.startNextRound());
      expect(hook.result.current.state!.round!.survey.id).toBe(added!.id);
      expect(hook.result.current.state!.round!.slots).toHaveLength(3);
    });

    it("plays a question set's questions in order, then random ones; Sudden Death and Fast Money from the set too", async () => {
      const { hook } = await ready();
      const banks = hook.result.current.banks!;
      let custom = null as ReturnType<typeof hook.result.current.addCustomQuestion>;
      act(() => {
        custom = hook.result.current.addCustomQuestion(family);
      });
      const [r2] = banks.main.filter((s) => s.answerCount === 5);
      const sd = banks.suddenDeath[3]!;
      const fm = banks.main.slice(100, 105).map((s) => s.id);
      let saved = null as ReturnType<typeof hook.result.current.saveQuestionSet>;
      act(() => {
        saved = hook.result.current.saveQuestionSet({
          id: "",
          name: "Garage night",
          rounds: [custom!.id, r2!.id],
          suddenDeath: [sd.id],
          fastMoney: fm,
        });
      });
      expect(hook.result.current.questionSets.map((s) => s.name)).toEqual(["Garage night"]);
      expect(JSON.parse(localStorage.getItem("feud.questionSets")!)).toHaveLength(1);

      // Three rounds and a target nobody reaches, so Sudden Death follows.
      const threeRounds = {
        ...structuredClone(DEFAULT_RULES),
        id: "three",
        builtIn: false,
        rounds: DEFAULT_RULES.rounds.slice(0, 3),
        win: { type: "target" as const, target: 100_000 },
      };
      act(() => hook.result.current.newGame({ ...setup, rules: threeRounds, questionSetId: saved!.id }));
      expect(hook.result.current.activeQuestionSet?.name).toBe("Garage night");

      const asked: string[] = [];
      for (let round = 0; round < 3; round++) {
        act(() => hook.result.current.startNextRound());
        asked.push(hook.result.current.state!.round!.survey.id);
        for (const action of [
          { type: "buzz", team: 0 },
          { type: "faceOffAnswer", team: 0, answer: 0 },
          { type: "playOrPass", play: true },
          { type: "answer", answer: null },
          { type: "answer", answer: null },
          { type: "answer", answer: null },
          { type: "steal", answer: null },
        ] as const) {
          act(() => hook.result.current.apply(action));
        }
      }
      expect(asked.slice(0, 2)).toEqual([custom!.id, r2!.id]);
      expect(asked[2]).not.toBe(custom!.id); // the set ran out: a random round-3 question
      expect(hook.result.current.upcoming?.kind).toBe("suddenDeath");

      act(() => hook.result.current.startNextRound());
      expect(hook.result.current.state!.round!.survey.id).toBe(sd.id);
      act(() => hook.result.current.apply({ type: "buzz", team: 0 }));
      act(() => hook.result.current.apply({ type: "faceOffAnswer", team: 0, answer: 0 }));
      expect(hook.result.current.state!.winner).toBe(0);

      act(() => hook.result.current.startFastMoney([0, 1]));
      expect(hook.result.current.fastMoney!.surveys.map((s) => s.id)).toEqual(fm);
    });

    it("plays random questions when no set is chosen, and skips a set question that no longer exists", async () => {
      const { hook } = await ready();
      let saved = null as ReturnType<typeof hook.result.current.saveQuestionSet>;
      act(() => {
        saved = hook.result.current.saveQuestionSet({ id: "", name: "Gone", rounds: ["custom-q-deleted"], suddenDeath: [], fastMoney: [] });
      });
      act(() => hook.result.current.newGame({ ...setup, questionSetId: saved!.id }));
      act(() => hook.result.current.startNextRound());
      expect(hook.result.current.state!.round!.survey.answerCount).toBeGreaterThanOrEqual(6);

      act(() => hook.result.current.newGame(setup));
      expect(hook.result.current.activeQuestionSet).toBeNull();
    });
  });

  describe("champions and the question queue", () => {
    beforeEach(() => localStorage.clear());

    /** Plays round 1 of a game that the first round decides (target 1); `team` wins it. */
    function winRound1(hook: Awaited<ReturnType<typeof ready>>["hook"], team: 0 | 1) {
      act(() => hook.result.current.startNextRound());
      for (const action of [
        { type: "buzz", team },
        { type: "faceOffAnswer", team, answer: 0 },
        { type: "playOrPass", play: true },
        { type: "answer", answer: null },
        { type: "answer", answer: null },
        { type: "answer", answer: null },
        { type: "steal", answer: null },
      ] as const) {
        act(() => hook.result.current.apply(action));
      }
      expect(hook.result.current.state!.winner).toBe(team);
    }

    const quickRules = (championLimit: number | null = 5) => ({
      ...structuredClone(DEFAULT_RULES),
      id: "quick",
      builtIn: false,
      win: { type: "target" as const, target: 1 },
      championLimit,
    });

    it("crowns the winner, brings them back as family 1, and counts their wins and Fast Money winnings", async () => {
      const { hook, sent } = await ready();
      act(() => hook.result.current.newGame({ ...setup, rules: quickRules() }));
      winRound1(hook, 1); // Jones win game 1

      // Fast Money: one top answer for player 1, nothing for player 2.
      act(() => hook.result.current.startFastMoney([0, 1]));
      for (const action of [
        { type: "startClock" },
        { type: "giveAnswer", text: "anything" },
        { type: "endTurn" },
        { type: "judge", question: 0, answer: 0 },
        { type: "startPlayer2" },
        { type: "startClock" },
        { type: "endTurn" },
      ] as const) {
        act(() => hook.result.current.applyFastMoney(action));
      }
      const payout = hook.result.current.fastMoney!.outcome!.payout;
      expect(payout).toBeGreaterThan(0);
      act(() => hook.result.current.endFastMoney());

      act(() => hook.result.current.finishGame());
      expect(hook.result.current.state).toBeNull();
      expect(hook.result.current.champion).toEqual({ family: setup.families[1], wins: 1, winnings: payout });
      expect(JSON.parse(localStorage.getItem("feud.champion")!)).toMatchObject({ wins: 1 });

      // Game 2: the champions return as family 1 and the board is told.
      const challengers = { name: "Lee", players: ["L1", "L2", "L3", "L4", "L5"] };
      act(() =>
        hook.result.current.newGame({
          rules: quickRules(),
          families: [hook.result.current.champion!.family, challengers],
          championReturning: true,
        }),
      );
      expect(hook.result.current.championTeam).toBe(0);
      expect((sent.at(-1) as { snapshot: { champion: unknown } }).snapshot.champion).toEqual({ team: 0, wins: 1 });
      winRound1(hook, 0);
      act(() => hook.result.current.finishGame());
      expect(hook.result.current.champion).toMatchObject({ family: { name: "Jones" }, wins: 2, winnings: payout });
    });

    it("retires the champions undefeated at the preset's win limit", async () => {
      const { hook } = await ready();
      act(() => hook.result.current.newGame({ ...setup, rules: quickRules(2) }));
      winRound1(hook, 0);
      act(() => hook.result.current.finishGame());
      act(() =>
        hook.result.current.newGame({
          rules: quickRules(2),
          families: [hook.result.current.champion!.family, setup.families[1]],
          championReturning: true,
        }),
      );
      winRound1(hook, 0);
      act(() => hook.result.current.finishGame());
      expect(hook.result.current.champion).toBeNull();
      expect(hook.result.current.retiredChampion).toMatchObject({ family: { name: "Smith" }, wins: 2 });
      expect(localStorage.getItem("feud.champion")).toBeNull();
    });

    it("loses the title to the challengers, and forgets champions when a fresh game starts without them", async () => {
      const { hook } = await ready();
      act(() => hook.result.current.newGame({ ...setup, rules: quickRules() }));
      winRound1(hook, 0);
      act(() => hook.result.current.finishGame());
      act(() =>
        hook.result.current.newGame({
          rules: quickRules(),
          families: [hook.result.current.champion!.family, setup.families[1]],
          championReturning: true,
        }),
      );
      winRound1(hook, 1);
      act(() => hook.result.current.finishGame());
      expect(hook.result.current.champion).toMatchObject({ family: { name: "Jones" }, wins: 1 });

      act(() => hook.result.current.newGame(setup));
      expect(hook.result.current.champion).toBeNull();
      expect(hook.result.current.championTeam).toBeNull();
    });

    it("plays a question the host picked in the browser when it fits the round", async () => {
      const { hook } = await ready();
      const banks = hook.result.current.banks!;
      const six = banks.main.find((s) => s.answerCount === 6 && !hook.result.current.isUsed(s.id))!;
      const sd = banks.suddenDeath[0]!;
      act(() => hook.result.current.newGame(setup));

      // A Sudden Death question doesn't fit round 1, so it stays queued and a random question is used.
      act(() => hook.result.current.queueSurvey(sd.id));
      act(() => hook.result.current.startNextRound());
      expect(hook.result.current.state!.round!.survey.id).not.toBe(sd.id);
      expect(hook.result.current.queued?.id).toBe(sd.id);

      act(() => hook.result.current.undo());
      act(() => hook.result.current.queueSurvey(six.id));
      act(() => hook.result.current.startNextRound());
      expect(hook.result.current.state!.round!.survey.id).toBe(six.id);
      expect(hook.result.current.queued).toBeNull();
      expect(hook.result.current.isUsed(six.id)).toBe(true);
    });
  });

  it("applies actions, reports refused ones, and undoes", async () => {
    const { hook } = await ready();
    act(() => hook.result.current.newGame(setup));
    act(() => hook.result.current.startNextRound());
    act(() => hook.result.current.apply({ type: "playOrPass", play: true }));
    expect(hook.result.current.lastError).toMatch(/not allowed/i);

    act(() => hook.result.current.apply({ type: "buzz", team: 1 }));
    expect(hook.result.current.lastError).toBeNull();
    expect(hook.result.current.can({ type: "buzz", team: 0 })).toBe(false);
    act(() => hook.result.current.undo());
    expect(hook.result.current.state!.round!.faceOff.buzzed).toBeNull();
    expect(hook.result.current.canUndo).toBe(true); // the startRound is still undoable
  });

  it("swaps the question for another of the same size before anyone buzzes", async () => {
    const { hook } = await ready();
    act(() => hook.result.current.newGame(setup));
    act(() => hook.result.current.startNextRound());
    const before = hook.result.current.state!.round!.survey;
    expect(hook.result.current.canSwapQuestion).toBe(true);
    act(() => hook.result.current.swapQuestion());
    const after = hook.result.current.state!.round!;
    expect(after.survey.id).not.toBe(before.id);
    expect(after.survey.answerCount).toBe(before.answerCount);
    expect(after.number).toBe(1);
    expect(hook.result.current.state!.roundsPlayed).toBe(1);

    act(() => hook.result.current.apply({ type: "buzz", team: 0 }));
    expect(hook.result.current.canSwapQuestion).toBe(false);
  });

  it("suggests matches only among answers still hidden", async () => {
    const { hook } = await ready();
    act(() => hook.result.current.newGame(setup));
    act(() => hook.result.current.startNextRound());
    const top = hook.result.current.state!.round!.survey.answers[0]!.text.split("/")[0]!;
    expect(hook.result.current.suggest(top)!.index).toBe(0);
    act(() => hook.result.current.apply({ type: "buzz", team: 0 }));
    act(() => hook.result.current.apply({ type: "faceOffAnswer", team: 0, answer: 0 }));
    expect(hook.result.current.suggest(top)!.index).not.toBe(0);
  });

  it("answers a board window's hello with the current state, and clears the board on end", async () => {
    const { hook, sent, receive } = await ready();
    act(() => hook.result.current.newGame(setup));
    const count = sent.length;
    act(() => receive({ type: "hello" }));
    expect(sent).toHaveLength(count + 1);
    expect(sent.at(-1)).toMatchObject({ type: "snapshot", events: [] });
    expect((sent.at(-1) as { snapshot: unknown }).snapshot).not.toBeNull();

    act(() => hook.result.current.endGame());
    expect(hook.result.current.state).toBeNull();
    expect(sent.at(-1)).toEqual({ type: "snapshot", snapshot: null, events: [] });
  });
});
