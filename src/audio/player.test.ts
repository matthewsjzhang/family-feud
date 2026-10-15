import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { BoardEvent } from "../app/boardSnapshot";
import { FakeAudioContext } from "./fakeAudio";
import { createSoundPlayer, type AudioContextCtor } from "./player";
import type { AudioContextLike } from "./sounds";

const ctx = () => {
  const c = FakeAudioContext.instances.at(-1);
  if (!c) throw new Error("no AudioContext was created");
  return c;
};
const startTimes = (c: FakeAudioContext) => [...new Set(c.sources.map((s) => s.startAt ?? -1))].sort((a, b) => a - b);

beforeEach(() => FakeAudioContext.reset("suspended"));

describe("createSoundPlayer", () => {
  it("accepts the browser's real AudioContext (type-level check)", () => {
    expectTypeOf<typeof AudioContext>().toExtend<AudioContextCtor>();
  });

  it("creates the context lazily, and only once", async () => {
    const player = createSoundPlayer({ AudioContext: FakeAudioContext });
    expect(FakeAudioContext.instances).toHaveLength(0);
    await player.unlock();
    player.play("ding");
    await player.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it("starts locked; unlock() resumes the suspended context", async () => {
    const onChange = vi.fn();
    const player = createSoundPlayer({ AudioContext: FakeAudioContext, onChange });
    expect(player.unlocked).toBe(false);
    await player.unlock();
    expect(ctx().resumeCalls).toBe(1);
    expect(player.unlocked).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it("schedules nothing while the context is still suspended (no burst on unlock)", () => {
    const player = createSoundPlayer({ AudioContext: FakeAudioContext });
    player.play("ding");
    player.playEvent({ type: "strike", count: 1 });
    expect(ctx().sources).toHaveLength(0);
  });

  it("does not resume an already running context", async () => {
    FakeAudioContext.reset("running");
    const player = createSoundPlayer({ AudioContext: FakeAudioContext });
    await player.unlock();
    expect(ctx().resumeCalls).toBe(0);
    expect(player.unlocked).toBe(true);
  });

  it("plays an event's sound once unlocked", async () => {
    const player = createSoundPlayer({ AudioContext: FakeAudioContext });
    await player.unlock();
    player.playEvent({ type: "reveal", slot: 0, earned: true });
    expect(ctx().sources.length).toBeGreaterThan(0);
    expect(Math.min(...startTimes(ctx()))).toBeGreaterThanOrEqual(ctx().currentTime);
  });

  it("silent events schedule nothing", async () => {
    const player = createSoundPlayer({ AudioContext: FakeAudioContext });
    await player.unlock();
    player.playEvents([{ type: "newRound" }, { type: "fmStart" }]);
    expect(ctx().sources).toHaveLength(0);
  });

  it("muted: nothing is scheduled; unmuting plays again", async () => {
    const player = createSoundPlayer({ AudioContext: FakeAudioContext, muted: true });
    await player.unlock();
    player.play("gameWon");
    player.playEvents([{ type: "strike", count: 2 }]);
    expect(ctx().sources).toHaveLength(0);
    player.setMuted(false);
    expect(player.muted).toBe(false);
    player.play("strike");
    expect(ctx().sources.length).toBeGreaterThan(0);
  });

  it("volume scales the gain and is clamped to 0..1", async () => {
    const peak = async (volume: number) => {
      FakeAudioContext.reset("running");
      const player = createSoundPlayer({ AudioContext: FakeAudioContext, volume });
      await player.unlock();
      player.play("softDing");
      return Math.max(...ctx().gains.flatMap((g) => g.gain.values));
    };
    expect(await peak(0.25)).toBeCloseTo((await peak(1)) / 4, 5);

    const player = createSoundPlayer({ AudioContext: FakeAudioContext });
    player.setVolume(3);
    expect(player.volume).toBe(1);
    player.setVolume(-1);
    expect(player.volume).toBe(0);
  });

  it("volume 0 schedules nothing", async () => {
    FakeAudioContext.reset("running");
    const player = createSoundPlayer({ AudioContext: FakeAudioContext, volume: 0 });
    await player.unlock();
    player.play("ding");
    expect(ctx().sources).toHaveLength(0);
  });

  it("spaces a batch's sounds apart, skipping silent events", async () => {
    FakeAudioContext.reset("running");
    const player = createSoundPlayer({ AudioContext: FakeAudioContext, spacingMs: 120 });
    const events: BoardEvent[] = [
      { type: "reveal", slot: 0, earned: true },
      { type: "fmAnswerShown", player: 0, question: 0 },
      { type: "strike", count: 1 },
      { type: "roundWon", team: 0, points: 50 },
    ];
    player.playEvents(events);
    const c = ctx();
    // Each sound's earliest source start = its slot in the batch.
    const firstStart = (from: number, to: number) => Math.min(...c.oscillators.slice(from, to).map((o) => o.startAt ?? Infinity));
    const t0 = c.currentTime + 0.02;
    // ding = 6 oscillators, strike = 2 oscillators (+ noise), roundWon follows.
    expect(firstStart(0, 6)).toBeCloseTo(t0, 5);
    expect(firstStart(6, 8)).toBeCloseTo(t0 + 0.12, 5);
    expect(firstStart(8, c.oscillators.length)).toBeCloseTo(t0 + 0.24, 5);
  });

  it("is a silent no-op without Web Audio", async () => {
    const player = createSoundPlayer({ AudioContext: null });
    expect(player.supported).toBe(false);
    await expect(player.unlock()).resolves.toBeUndefined();
    expect(() => {
      player.play("ding");
      player.playEvents([{ type: "strike", count: 1 }]);
      player.setMuted(true);
      player.setVolume(0.3);
    }).not.toThrow();
    expect(player.unlocked).toBe(false);
  });

  it("defaults to no-op in an environment without AudioContext (node)", async () => {
    const player = createSoundPlayer();
    await player.unlock();
    expect(() => player.play("ding")).not.toThrow();
    expect(player.unlocked).toBe(false);
  });

  it("survives a constructor that throws", async () => {
    class Broken {
      constructor() {
        throw new Error("too many AudioContexts");
      }
    }
    const player = createSoundPlayer({ AudioContext: Broken as unknown as new () => AudioContextLike });
    await expect(player.unlock()).resolves.toBeUndefined();
    expect(() => player.play("ding")).not.toThrow();
    expect(player.supported).toBe(false);
  });

  it("survives resume() rejecting (stays locked)", async () => {
    class Stubborn extends FakeAudioContext {
      override resume() {
        return Promise.reject(new Error("not allowed"));
      }
    }
    const player = createSoundPlayer({ AudioContext: Stubborn });
    await expect(player.unlock()).resolves.toBeUndefined();
    expect(player.unlocked).toBe(false);
  });

  it("a sound that throws does not escape", async () => {
    FakeAudioContext.reset("running");
    const player = createSoundPlayer({ AudioContext: FakeAudioContext });
    await player.unlock();
    vi.spyOn(ctx(), "createOscillator").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => player.play("ding")).not.toThrow();
  });
});
