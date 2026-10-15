// Plays the board's sounds through one lazily created AudioContext.
// Browsers start an AudioContext "suspended" until the page has had a user
// gesture, and the board window is opened by the host, so it starts locked:
// unlock() must be called from a click/keypress on the board.

import type { BoardEvent } from "../app/boardSnapshot";
import { SOUNDS, soundForEvent, type AudioContextLike, type BufferLike, type SoundName } from "./sounds";

export type AudioContextCtor = new () => AudioContextLike;

export interface SoundPlayerOptions {
  /** Defaults to the browser's AudioContext; null/undefined there = silent no-op player. */
  AudioContext?: AudioContextCtor | null;
  muted?: boolean;
  volume?: number;
  /** Gap between sounds from one batch, so a reveal + round-won don't smear together. */
  spacingMs?: number;
  /** Called when unlocked/muted/volume change (lets React re-render). */
  onChange?: () => void;
  /**
   * Recorded audio files to use instead of synthesized sounds, by sound name
   * (e.g. a real strike buzzer). A sound plays synthesized until its file has
   * loaded, and for good if the file is missing or can't be decoded.
   */
  samples?: Partial<Record<SoundName, string>>;
  /** Defaults to the browser's fetch; injectable for tests. */
  fetch?: (url: string) => Promise<Response>;
}

export interface SoundPlayer {
  play(name: SoundName, delayMs?: number): void;
  playEvent(event: BoardEvent): void;
  /** Plays a batch in order, `spacingMs` apart; silent events take no slot. */
  playEvents(events: readonly BoardEvent[]): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  setVolume(volume: number): void;
  readonly volume: number;
  /** Creates/resumes the context. Call from a user gesture. Never rejects. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  /** False when the browser has no Web Audio at all. */
  readonly supported: boolean;
  /** Resolves once every recorded sample has loaded or failed (never rejects). */
  samplesLoaded(): Promise<void>;
}

// Scheduling slightly ahead of "now" avoids clipping the attack of the first note.
const LOOKAHEAD = 0.02;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

function browserAudioContext(): AudioContextCtor | null {
  // Older Safari only has the prefixed constructor.
  const g = globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export function createSoundPlayer(options: SoundPlayerOptions = {}): SoundPlayer {
  const Ctor = options.AudioContext === undefined ? browserAudioContext() : options.AudioContext;
  const spacing = (options.spacingMs ?? 120) / 1000;
  let muted = options.muted ?? false;
  let volume = clamp01(options.volume ?? 0.8);
  let ctx: AudioContextLike | null = null;
  let failed = false;
  const changed = () => options.onChange?.();
  const recordings = new Map<SoundName, BufferLike>();
  let loading: Promise<void> = Promise.resolve();

  /** Fetch and decode the sample files. A failure just leaves that sound synthesized. */
  function loadSamples(c: AudioContextLike): Promise<void> {
    const fetchFile = options.fetch ?? (typeof fetch === "function" ? (url: string) => fetch(url) : null);
    const entries = Object.entries(options.samples ?? {}) as [SoundName, string][];
    if (!fetchFile) return Promise.resolve();
    return Promise.all(
      entries.map(async ([name, url]) => {
        try {
          const response = await fetchFile(url);
          if (!response.ok) return;
          recordings.set(name, await c.decodeAudioData(await response.arrayBuffer()));
        } catch {
          // Missing, offline or undecodable: keep the synthesized sound.
        }
      }),
    ).then(() => undefined);
  }

  function context(): AudioContextLike | null {
    if (ctx || failed || !Ctor) return ctx;
    try {
      ctx = new Ctor();
      // Decoding works while the context is still suspended, so load right away.
      loading = loadSamples(ctx);
    } catch {
      // e.g. too many contexts, or audio blocked by policy: stay silent.
      failed = true;
    }
    return ctx;
  }

  function playRecording(c: AudioContextLike, buffer: BufferLike, at: number): void {
    const source = c.createBufferSource();
    const gain = c.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(c.destination);
    source.start(at);
  }

  const running = () => ctx?.state === "running";

  function schedule(name: SoundName, offsetSec: number): void {
    if (muted || volume === 0) return;
    const c = context();
    // A suspended context's clock is frozen: anything scheduled now would all
    // fire at once when it resumes, so skip sounds until it's unlocked.
    if (!c || c.state !== "running") return;
    try {
      const at = c.currentTime + LOOKAHEAD + offsetSec;
      const recording = recordings.get(name);
      if (recording) playRecording(c, recording, at);
      else SOUNDS[name](c, at, volume);
    } catch {
      // A sound must never break the board.
    }
  }

  return {
    play(name, delayMs = 0) {
      schedule(name, delayMs / 1000);
    },
    playEvent(event) {
      const name = soundForEvent(event);
      if (name) schedule(name, 0);
    },
    playEvents(events) {
      let slot = 0;
      for (const event of events) {
        const name = soundForEvent(event);
        if (!name) continue;
        schedule(name, slot * spacing);
        slot++;
      }
    },
    setMuted(m) {
      if (m === muted) return;
      muted = m;
      changed();
    },
    get muted() {
      return muted;
    },
    setVolume(v) {
      const next = clamp01(v);
      if (next === volume) return;
      volume = next;
      changed();
    },
    get volume() {
      return volume;
    },
    async unlock() {
      const c = context();
      if (!c) return;
      if (c.state !== "running") {
        try {
          await c.resume();
        } catch {
          // Still locked; the button stays up and the next click tries again.
        }
      }
      changed();
    },
    get unlocked() {
      return running();
    },
    get supported() {
      return !!Ctor && !failed;
    },
    samplesLoaded: () => loading,
  };
}
