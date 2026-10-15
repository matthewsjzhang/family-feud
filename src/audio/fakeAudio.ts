// A recording stand-in for AudioContext (jsdom has no Web Audio). Test-only.

import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BufferLike,
  BufferSourceLike,
  FilterLike,
  GainLike,
  OscillatorLike,
} from "./sounds";

export class FakeParam implements AudioParamLike {
  value = 0;
  /** Every value set or ramped to, in call order. */
  readonly values: number[] = [];
  setValueAtTime(v: number) {
    this.value = v;
    this.values.push(v);
  }
  linearRampToValueAtTime(v: number) {
    this.setValueAtTime(v);
  }
  exponentialRampToValueAtTime(v: number) {
    if (v <= 0) throw new RangeError("exponential ramp target must be > 0");
    this.setValueAtTime(v);
  }
}

class FakeNode implements AudioNodeLike {
  readonly outputs: AudioNodeLike[] = [];
  connect(destination: AudioNodeLike) {
    this.outputs.push(destination);
    return destination;
  }
}

class FakeSource extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  start(when: number) {
    this.startAt = when;
  }
  stop(when: number) {
    this.stopAt = when;
  }
}

export class FakeOscillator extends FakeSource implements OscillatorLike {
  type: OscillatorType = "sine";
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
}

export class FakeBufferSource extends FakeSource implements BufferSourceLike {
  buffer: BufferLike | null = null;
}

export class FakeGain extends FakeNode implements GainLike {
  readonly gain = new FakeParam();
}

export class FakeFilter extends FakeNode implements FilterLike {
  type: BiquadFilterType = "lowpass";
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

export class FakeAudioContext implements AudioContextLike {
  /** Every context constructed, newest last. */
  static instances: FakeAudioContext[] = [];
  /** State new contexts start in (browsers: "suspended" without a user gesture). */
  static initialState: AudioContextState = "suspended";

  currentTime = 10;
  readonly sampleRate = 8000;
  state: AudioContextState = FakeAudioContext.initialState;
  readonly destination = new FakeNode();
  readonly oscillators: FakeOscillator[] = [];
  readonly bufferSources: FakeBufferSource[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  resumeCalls = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  static reset(initialState: AudioContextState = "suspended") {
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = initialState;
  }

  resume() {
    this.resumeCalls++;
    this.state = "running";
    return Promise.resolve();
  }
  createOscillator() {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createBufferSource() {
    const s = new FakeBufferSource();
    this.bufferSources.push(s);
    return s;
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter() {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createBuffer(_channels: number, length: number): BufferLike {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }

  /** All sources (oscillators and noise) in creation order. */
  get sources(): FakeSource[] {
    return [...this.oscillators, ...this.bufferSources];
  }
}
