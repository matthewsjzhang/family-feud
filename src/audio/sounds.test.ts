import { beforeEach, describe, expect, it } from "vitest";
import type { BoardEvent } from "../app/boardSnapshot";
import { FakeAudioContext } from "./fakeAudio";
import { SOUND_NAMES, SOUNDS, soundForEvent, type SoundName } from "./sounds";

const running = () => {
  FakeAudioContext.reset("running");
  return new FakeAudioContext();
};

const maxGain = (ctx: FakeAudioContext) => Math.max(...ctx.gains.flatMap((g) => g.gain.values));
const lastStop = (ctx: FakeAudioContext) => Math.max(...ctx.sources.map((s) => s.stopAt ?? 0));

describe("soundForEvent", () => {
  // Keyed by every event type, so adding a BoardEvent without a case here fails to compile.
  const cases: Record<BoardEvent["type"], [BoardEvent, SoundName | null][]> = {
    newRound: [[{ type: "newRound" }, null]],
    buzz: [[{ type: "buzz", team: 0 }, "buzzIn"], [{ type: "buzz", team: 1 }, "buzzIn"]],
    reveal: [
      [{ type: "reveal", slot: 0, earned: true }, "ding"],
      [{ type: "reveal", slot: 3, earned: false }, "softDing"],
    ],
    strike: [
      [{ type: "strike", count: 1 }, "strike"],
      [{ type: "strike", count: 3 }, "strike"],
      [{ type: "strike", count: 7 }, "strike"],
    ],
    roundWon: [[{ type: "roundWon", team: 0, points: 120 }, "roundWon"]],
    gameWon: [[{ type: "gameWon", team: 1 }, "gameWon"]],
    fmStart: [[{ type: "fmStart" }, null]],
    fmClockStart: [[{ type: "fmClockStart" }, "fmClockStart"]],
    fmTimeUp: [[{ type: "fmTimeUp" }, "fmTimeUp"]],
    fmDuplicate: [[{ type: "fmDuplicate" }, "fmDuplicate"]],
    fmUncover: [[{ type: "fmUncover" }, "whoosh"]],
    fmAnswerShown: [[{ type: "fmAnswerShown", player: 0, question: 2 }, null]],
    fmPoints: [
      [{ type: "fmPoints", player: 1, question: 0, points: 34 }, "fmPoints"],
      [{ type: "fmPoints", player: 0, question: 4, points: 0 }, "fmZero"],
    ],
    fmResult: [
      [{ type: "fmResult", won: true, total: 212, payout: 20000 }, "fmWin"],
      [{ type: "fmResult", won: false, total: 150, payout: 750 }, "fmLose"],
    ],
  };

  for (const [type, list] of Object.entries(cases)) {
    it(`maps ${type}`, () => {
      for (const [event, sound] of list) expect(soundForEvent(event)).toBe(sound);
    });
  }

  it("only maps to sounds that exist", () => {
    for (const list of Object.values(cases)) {
      for (const [event] of list) {
        const name = soundForEvent(event);
        if (name) expect(SOUND_NAMES).toContain(name);
      }
    }
  });
});

describe("SOUNDS", () => {
  beforeEach(() => FakeAudioContext.reset("running"));

  it.each(SOUND_NAMES)("%s schedules nodes and stops every source", (name) => {
    const ctx = running();
    SOUNDS[name](ctx, 10, 1);
    expect(ctx.sources.length).toBeGreaterThan(0);
    for (const s of ctx.sources) {
      expect(s.startAt).not.toBeNull();
      expect(s.startAt!).toBeGreaterThanOrEqual(10);
      // No leaks: every source is told to stop, after it starts.
      expect(s.stopAt).not.toBeNull();
      expect(s.stopAt!).toBeGreaterThan(s.startAt!);
      expect(s.outputs.length).toBe(1);
    }
    // Every gain ends up at the destination, and nothing clips.
    for (const g of ctx.gains) expect(g.outputs).toContain(ctx.destination);
    expect(maxGain(ctx)).toBeLessThanOrEqual(1);
    expect(maxGain(ctx)).toBeGreaterThan(0.01);
  });

  it("have roughly the intended lengths", () => {
    const length = (name: SoundName) => {
      const ctx = running();
      SOUNDS[name](ctx, 0, 1);
      return lastStop(ctx);
    };
    expect(length("strike")).toBeCloseTo(0.64, 1);
    expect(length("buzzIn")).toBeLessThan(0.35);
    expect(length("roundWon")).toBeGreaterThan(1);
    expect(length("roundWon")).toBeLessThan(1.5);
    expect(length("gameWon")).toBeGreaterThan(2.8);
    expect(length("gameWon")).toBeLessThan(3.5);
    expect(length("fmWin")).toBeGreaterThan(3);
    expect(length("fmClockStart")).toBeLessThan(0.3);
  });

  it("fmDuplicate is two separate buzzes", () => {
    const ctx = running();
    SOUNDS.fmDuplicate(ctx, 0, 1);
    const starts = new Set(ctx.oscillators.map((o) => o.startAt));
    expect(starts.size).toBe(2);
  });

  it("fmTimeUp sounds different from strike (higher pitch)", () => {
    const pitch = (name: SoundName) => {
      const ctx = running();
      SOUNDS[name](ctx, 0, 1);
      return Math.min(...ctx.oscillators.map((o) => o.frequency.values[0] ?? 0));
    };
    expect(pitch("fmTimeUp")).toBeGreaterThan(pitch("strike") * 2);
  });

  it("volume scales every gain", () => {
    const full = running();
    SOUNDS.ding(full, 0, 1);
    const half = running();
    SOUNDS.ding(half, 0, 0.5);
    expect(maxGain(half)).toBeCloseTo(maxGain(full) / 2, 5);
  });

  it("reuses one noise buffer per context", () => {
    const ctx = running();
    SOUNDS.strike(ctx, 0, 1);
    SOUNDS.whoosh(ctx, 1, 1);
    const [a, b] = ctx.bufferSources;
    expect(a?.buffer).toBeTruthy();
    expect(a?.buffer).toBe(b?.buffer);
  });
});
