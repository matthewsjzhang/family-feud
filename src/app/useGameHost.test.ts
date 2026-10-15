// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
