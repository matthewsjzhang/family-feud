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

describe("recorded samples (e.g. a real strike buzzer MP3)", () => {
  const mp3 = new ArrayBuffer(8);
  const okFetch = () => vi.fn(async () => ({ ok: true, arrayBuffer: async () => mp3 }) as unknown as Response);

  async function readyPlayer(fetchImpl: typeof fetch, volume = 0.8) {
    const player = createSoundPlayer({
      AudioContext: FakeAudioContext,
      samples: { strike: "sounds/strike.mp3" },
      fetch: fetchImpl,
      volume,
    });
    await player.unlock();
    await player.samplesLoaded();
    return player;
  }

  it("loads the file once and plays it for the strike instead of the synthesized buzzer", async () => {
    const fetchImpl = okFetch();
    const player = await readyPlayer(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("sounds/strike.mp3");
    const c = ctx();
    expect(c.decoded).toHaveLength(1);

    player.playEvent({ type: "strike", count: 2 });
    expect(c.oscillators).toHaveLength(0);
    expect(c.bufferSources).toHaveLength(1);
    expect(c.bufferSources[0]!.buffer).toBe(c.decoded[0]!.buffer);
    expect(c.bufferSources[0]!.startAt).toBeGreaterThanOrEqual(c.currentTime);
  });

  it("scales the recording with the volume, and plays nothing when muted", async () => {
    const player = await readyPlayer(okFetch(), 0.5);
    player.play("strike");
    expect(ctx().gains.at(-1)!.gain.value).toBeCloseTo(0.5);
    player.setMuted(true);
    player.play("strike");
    expect(ctx().bufferSources).toHaveLength(1);
  });

  it("keeps the synthesized sounds for everything else", async () => {
    const player = await readyPlayer(okFetch());
    player.play("ding");
    expect(ctx().oscillators.length).toBeGreaterThan(0);
    expect(ctx().bufferSources.every((s) => s.buffer !== ctx().decoded[0]!.buffer)).toBe(true);
  });

  it("falls back to the synthesized buzzer when the file is missing or can't be decoded", async () => {
    const missing = vi.fn(async () => ({ ok: false, arrayBuffer: async () => mp3 }) as unknown as Response);
    let player = await readyPlayer(missing);
    player.play("strike");
    expect(ctx().oscillators.length).toBeGreaterThan(0);

    FakeAudioContext.reset("suspended");
    FakeAudioContext.failDecode = true;
    player = await readyPlayer(okFetch());
    player.play("strike");
    expect(ctx().oscillators.length).toBeGreaterThan(0);

    FakeAudioContext.reset("suspended");
    player = await readyPlayer(vi.fn(async () => Promise.reject(new Error("offline"))));
    player.play("strike");
    expect(ctx().oscillators.length).toBeGreaterThan(0);
  });

  it("uses the synthesized buzzer until the file has finished loading", async () => {
    let finish: (r: Response) => void = () => {};
    const slow = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    const player = createSoundPlayer({ AudioContext: FakeAudioContext, samples: { strike: "s.mp3" }, fetch: slow });
    await player.unlock();
    player.play("strike");
    expect(ctx().oscillators.length).toBeGreaterThan(0);
    finish({ ok: true, arrayBuffer: async () => mp3 } as unknown as Response);
    await player.samplesLoaded();
    const before = ctx().oscillators.length;
    player.play("strike");
    expect(ctx().oscillators).toHaveLength(before);
  });
});

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
