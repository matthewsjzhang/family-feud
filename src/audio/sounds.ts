// Original game-show sound effects, synthesized with the Web Audio API.
// No audio files: every sound is oscillators, filtered noise and envelopes, so
// nothing is downloaded and nothing is copied from the TV show.
//
// The audio types below are the small slice of Web Audio we use. A real
// AudioContext satisfies them, and tests can pass a plain fake (jsdom has no audio).

import type { BoardEvent } from "../app/boardSnapshot";

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
}

export interface OscillatorLike extends AudioNodeLike {
  type: OscillatorType;
  frequency: AudioParamLike;
  detune: AudioParamLike;
  start(when: number): void;
  stop(when: number): void;
}

export interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface FilterLike extends AudioNodeLike {
  type: BiquadFilterType;
  frequency: AudioParamLike;
  Q: AudioParamLike;
}

export interface BufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: BufferLike | null;
  start(when: number): void;
  stop(when: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: AudioContextState;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  createBiquadFilter(): FilterLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
  createBufferSource(): BufferSourceLike;
  /** Turns an audio file (e.g. an MP3) into a playable buffer. */
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>;
}

/** Schedules one sound starting at `at` (context seconds). `volume` is 0..1. */
export type Sound = (ctx: AudioContextLike, at: number, volume: number) => void;

// ---------- Building blocks ----------

// Exponential ramps can't reach 0, so envelopes fade to this instead.
const SILENT = 0.0001;

interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  /** Glide to this frequency over the tone (exponential, like a pitch bend). */
  freqEnd?: number;
  detune?: number;
  /** Seconds after `at`. */
  delay?: number;
  attack?: number;
  /** Total length in seconds, including the release. */
  dur: number;
  /** Peak gain before the master volume is applied. */
  peak: number;
  /** Hold the peak this long before decaying (buzzers); bells decay right away. */
  hold?: number;
  /** Optional filter between oscillator and envelope. */
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

function tone(ctx: AudioContextLike, at: number, volume: number, o: ToneOptions): void {
  const start = at + (o.delay ?? 0);
  const end = start + o.dur;
  const attack = o.attack ?? 0.005;
  const peak = Math.max(SILENT, o.peak * volume);

  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, start);
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, end);
  if (o.detune) osc.detune.setValueAtTime(o.detune, start);

  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, start);
  env.gain.linearRampToValueAtTime(peak, start + attack);
  if (o.hold) {
    env.gain.setValueAtTime(peak, start + attack + o.hold);
    // A fast release reads as "buzzer off" rather than a ringing decay.
    env.gain.linearRampToValueAtTime(SILENT, end);
  } else {
    env.gain.exponentialRampToValueAtTime(SILENT, end);
  }

  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.setValueAtTime(o.filter.freq, start);
    f.Q.setValueAtTime(o.filter.q ?? 1, start);
    osc.connect(f);
    f.connect(env);
  } else {
    osc.connect(env);
  }
  env.connect(ctx.destination);
  osc.start(start);
  // Stop slightly after the envelope ends so the source is released (no leaked nodes).
  osc.stop(end + 0.02);
}

// One second of white noise per context, reused by every noisy sound.
const noiseBuffers = new WeakMap<AudioContextLike, BufferLike>();
function noiseBuffer(ctx: AudioContextLike): BufferLike {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    const length = Math.max(1, Math.floor(ctx.sampleRate));
    buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

interface NoiseOptions {
  delay?: number;
  dur: number;
  peak: number;
  attack?: number;
  hold?: number;
  filter: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number };
}

function noise(ctx: AudioContextLike, at: number, volume: number, o: NoiseOptions): void {
  const start = at + (o.delay ?? 0);
  const end = start + o.dur;
  const attack = o.attack ?? 0.01;
  const peak = Math.max(SILENT, o.peak * volume);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.filter.type;
  f.frequency.setValueAtTime(o.filter.freq, start);
  if (o.filter.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(o.filter.freqEnd, end);
  f.Q.setValueAtTime(o.filter.q ?? 1, start);
  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, start);
  env.gain.linearRampToValueAtTime(peak, start + attack);
  if (o.hold) {
    env.gain.setValueAtTime(peak, start + attack + o.hold);
    env.gain.linearRampToValueAtTime(SILENT, end);
  } else {
    env.gain.exponentialRampToValueAtTime(SILENT, end);
  }
  src.connect(f);
  f.connect(env);
  env.connect(ctx.destination);
  src.start(start);
  src.stop(end + 0.02);
}

/** A bell: a fundamental plus inharmonic partials that die away faster, like struck metal. */
function bell(ctx: AudioContextLike, at: number, volume: number, freq: number, peak: number, dur: number, delay = 0): void {
  tone(ctx, at, volume, { freq, dur, peak, delay, attack: 0.003 });
  tone(ctx, at, volume, { freq: freq * 2.76, dur: dur * 0.45, peak: peak * 0.45, delay, attack: 0.002 });
  tone(ctx, at, volume, { freq: freq * 5.4, dur: dur * 0.18, peak: peak * 0.2, delay, attack: 0.001 });
}

/** A brassy note: filtered sawtooth pair, slightly detuned for width. */
function brass(ctx: AudioContextLike, at: number, volume: number, freq: number, delay: number, dur: number, peak: number): void {
  const filter = { type: "lowpass" as const, freq: Math.min(5000, freq * 5), q: 0.8 };
  const common = { freq, delay, dur, attack: 0.025, hold: dur * 0.6, filter };
  tone(ctx, at, volume, { ...common, type: "sawtooth", peak, detune: -6 });
  tone(ctx, at, volume, { ...common, type: "sawtooth", peak: peak * 0.8, detune: 7 });
}

/** Note name -> Hz (equal temperament, A4 = 440). Only what the melodies use. */
const NOTE: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, Bb4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, Bb5: 932.33, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98,
};
const n = (name: string): number => NOTE[name] ?? 440;

// ---------- The sounds ----------

export const SOUNDS = {
  /** Answer revealed and scored: bright two-strike bell. */
  ding: (ctx, at, v) => {
    bell(ctx, at, v, n("E6"), 0.32, 1.1);
    bell(ctx, at, v, n("B5"), 0.18, 0.9); // a fourth below, struck together: fuller and brighter
  },
  /** Revealed after the round (not scored): one quiet, mellow bell. */
  softDing: (ctx, at, v) => {
    tone(ctx, at, v, { freq: n("A5"), dur: 0.7, peak: 0.12, attack: 0.004 });
    tone(ctx, at, v, { freq: n("A5") * 2, dur: 0.3, peak: 0.04, attack: 0.003 });
  },
  /** Wrong answer: harsh low buzzer, two beating oscillators plus grit. */
  strike: (ctx, at, v) => {
    const filter = { type: "lowpass" as const, freq: 1800, q: 0.7 };
    tone(ctx, at, v, { type: "sawtooth", freq: 110, dur: 0.62, peak: 0.28, attack: 0.01, hold: 0.5, filter });
    tone(ctx, at, v, { type: "square", freq: 116.5, dur: 0.62, peak: 0.16, attack: 0.01, hold: 0.5, filter });
    noise(ctx, at, v, { dur: 0.62, peak: 0.07, hold: 0.5, filter: { type: "bandpass", freq: 900, q: 0.8 } });
  },
  /** Face-off buzzer press: quick upward electronic blip. */
  buzzIn: (ctx, at, v) => {
    tone(ctx, at, v, { type: "square", freq: 620, freqEnd: 1240, dur: 0.09, peak: 0.12, attack: 0.003, filter: { type: "lowpass", freq: 4000 } });
    tone(ctx, at, v, { type: "square", freq: 1240, delay: 0.09, dur: 0.16, peak: 0.1, attack: 0.003, hold: 0.08, filter: { type: "lowpass", freq: 4000 } });
  },
  /** Round won: rising major arpeggio landing on a held, shimmering top note (~1.2s). */
  roundWon: (ctx, at, v) => {
    const notes = ["C5", "E5", "G5", "C6"];
    notes.forEach((name, i) => {
      const last = i === notes.length - 1;
      const dur = last ? 0.8 : 0.22;
      tone(ctx, at, v, { type: "triangle", freq: n(name), delay: i * 0.12, dur, peak: 0.22, attack: 0.006 });
      tone(ctx, at, v, { freq: n(name) * 2, delay: i * 0.12, dur: dur * 0.6, peak: 0.06, attack: 0.004 });
    });
    bell(ctx, at, v, n("G6"), 0.08, 0.7, 0.36);
  },
  /** Game won: an original brass fanfare (~3s) ending on a big major chord with bells. */
  gameWon: (ctx, at, v) => {
    // [note, start, length] - an original pickup-and-climb figure.
    const melody: [string, number, number][] = [
      ["G4", 0.0, 0.14], ["G4", 0.16, 0.14], ["C5", 0.32, 0.3],
      ["E5", 0.66, 0.14], ["D5", 0.82, 0.14], ["E5", 0.98, 0.3],
      ["G5", 1.32, 0.2], ["F5", 1.54, 0.14], ["A5", 1.7, 0.3],
    ];
    for (const [name, delay, dur] of melody) brass(ctx, at, v, n(name), delay, dur, 0.12);
    // Final chord, held.
    for (const name of ["C5", "E5", "G5", "C6"]) brass(ctx, at, v, n(name), 2.05, 1.0, 0.07);
    bell(ctx, at, v, n("C6"), 0.1, 1.0, 2.05);
    bell(ctx, at, v, n("G6"), 0.07, 0.9, 2.2);
    noise(ctx, at, v, { delay: 2.05, dur: 1.0, peak: 0.03, filter: { type: "highpass", freq: 6000 } }); // cymbal wash
  },
  /** Fast Money clock starts: one clean, short beep. */
  fmClockStart: (ctx, at, v) => {
    tone(ctx, at, v, { type: "square", freq: 1000, dur: 0.16, peak: 0.08, attack: 0.004, hold: 0.12, filter: { type: "lowpass", freq: 3000 } });
  },
  /** Clock ran out: higher, longer, pulsing two-note horn (distinct from the strike buzzer). */
  fmTimeUp: (ctx, at, v) => {
    const filter = { type: "lowpass" as const, freq: 2500, q: 0.7 };
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.3;
      const dur = i === 2 ? 0.6 : 0.24;
      tone(ctx, at, v, { type: "square", freq: 330, delay, dur, peak: 0.12, attack: 0.01, hold: dur - 0.05, filter });
      tone(ctx, at, v, { type: "sawtooth", freq: 440, delay, dur, peak: 0.1, attack: 0.01, hold: dur - 0.05, filter });
    }
  },
  /** Duplicate answer: two short, rough buzzes. */
  fmDuplicate: (ctx, at, v) => {
    const filter = { type: "lowpass" as const, freq: 1600, q: 0.7 };
    for (const delay of [0, 0.26]) {
      tone(ctx, at, v, { type: "sawtooth", freq: 150, delay, dur: 0.18, peak: 0.24, attack: 0.006, hold: 0.14, filter });
      tone(ctx, at, v, { type: "square", freq: 157, delay, dur: 0.18, peak: 0.12, attack: 0.006, hold: 0.14, filter });
    }
  },
  /** Fast Money answer scored: bell plus a quick higher chime. */
  fmPoints: (ctx, at, v) => {
    bell(ctx, at, v, n("C6"), 0.28, 0.9);
    bell(ctx, at, v, n("G6"), 0.16, 0.7, 0.08);
  },
  /** Fast Money answer worth 0: a dull low "bonk" that sinks in pitch. */
  fmZero: (ctx, at, v) => {
    tone(ctx, at, v, { freq: 200, freqEnd: 70, dur: 0.4, peak: 0.35, attack: 0.004 });
    tone(ctx, at, v, { type: "square", freq: 95, freqEnd: 60, dur: 0.3, peak: 0.06, attack: 0.004, filter: { type: "lowpass", freq: 600 } });
  },
  /** Fast Money won: fast climbing run into a long chord, bells and cymbal (~3.5s). */
  fmWin: (ctx, at, v) => {
    const run = ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6"];
    run.forEach((name, i) => tone(ctx, at, v, { type: "triangle", freq: n(name), delay: i * 0.07, dur: 0.2, peak: 0.18, attack: 0.004 }));
    const chordAt = run.length * 0.07 + 0.05;
    brass(ctx, at, v, n("C5"), chordAt, 0.3, 0.1);
    brass(ctx, at, v, n("C5"), chordAt + 0.35, 0.2, 0.1);
    for (const name of ["C4", "E5", "G5", "C6"]) brass(ctx, at, v, n(name), chordAt + 0.6, 2.2, 0.07);
    for (let i = 0; i < 4; i++) bell(ctx, at, v, n(["C6", "E6", "G6", "E6"][i] ?? "C6"), 0.07, 1.0, chordAt + 0.6 + i * 0.2);
    noise(ctx, at, v, { delay: chordAt + 0.6, dur: 2.0, peak: 0.04, filter: { type: "highpass", freq: 5500 } });
  },
  /** Fast Money lost: a gentle, sinking two-note sigh. */
  fmLose: (ctx, at, v) => {
    const filter = { type: "lowpass" as const, freq: 1200, q: 0.5 };
    tone(ctx, at, v, { type: "triangle", freq: n("G4"), freqEnd: n("F4"), dur: 0.5, peak: 0.2, attack: 0.04, filter });
    tone(ctx, at, v, { type: "triangle", freq: n("E4"), freqEnd: n("C4"), delay: 0.5, dur: 1.1, peak: 0.2, attack: 0.04, filter });
    tone(ctx, at, v, { freq: n("C4") / 2, delay: 0.5, dur: 1.1, peak: 0.08, attack: 0.06 });
  },
  /** Player 1's answers uncovered: an airy upward whoosh. */
  whoosh: (ctx, at, v) => {
    noise(ctx, at, v, { dur: 0.5, peak: 0.18, attack: 0.15, filter: { type: "bandpass", freq: 300, freqEnd: 3500, q: 1.2 } });
  },
} satisfies Record<string, Sound>;

export type SoundName = keyof typeof SOUNDS;
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

/**
 * Which sound a board event makes. Null = silent on purpose:
 * - newRound: the board resets (and a reconnecting board gets one); a sound there
 *   would fire on every reload and talk over the host reading the question.
 * - fmStart: the host is still introducing Fast Money; the clock beep is the real start.
 * - fmAnswerShown: always followed by its fmPoints ding/bonk; a sound for both is clutter.
 */
export function soundForEvent(event: BoardEvent): SoundName | null {
  switch (event.type) {
    case "newRound":
      return null;
    case "buzz":
      return "buzzIn";
    case "reveal":
      return event.earned ? "ding" : "softDing";
    case "strike":
      return "strike";
    case "roundWon":
      return "roundWon";
    case "gameWon":
      return "gameWon";
    case "fmStart":
      return null;
    case "fmClockStart":
      return "fmClockStart";
    case "fmTimeUp":
      return "fmTimeUp";
    case "fmDuplicate":
      return "fmDuplicate";
    case "fmUncover":
      return "whoosh";
    case "fmAnswerShown":
      return null;
    case "fmPoints":
      return event.points > 0 ? "fmPoints" : "fmZero";
    case "fmResult":
      return event.won ? "fmWin" : "fmLose";
  }
}
