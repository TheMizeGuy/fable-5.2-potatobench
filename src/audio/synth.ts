// The shared signal chain and the small building blocks every voice is made from.
// Works on any BaseAudioContext, so the same voices render live and offline.

export type Rand = () => number

export function prng(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function clamp01(x: number): number {
  return x > 0 ? (x < 1 ? x : 1) : 0
}

// The settings slider (0..1) to the master gain. Squared, so the low end of the slider is usable.
export function volumeGain(setting: number): number {
  const v = clamp01(Number.isFinite(setting) ? setting : 0)
  return 1.5 * v * v
}

// Time constants, in seconds, of the master fade when sound comes on and when it goes off or the tab is hidden.
export const FADE_IN = 0.25
export const FADE_OUT = 0.08

export function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

export interface Rig {
  ctx: BaseAudioContext
  rand: Rand
  noise: AudioBuffer      // white noise, mono, long enough that a loop of it is not heard coming round
  bus: GainNode           // every dry voice sums here
  verb: GainNode          // reverb send
  volume: GainNode        // master volume, after the bus
}

export interface RigOptions {
  seed: number
  // false skips the volume, trim and ceiling: the bus goes straight to dest (used to measure raw levels).
  master: boolean
}

export function createRig(ctx: BaseAudioContext, dest: AudioNode, opts: RigOptions): Rig {
  const rand = prng(opts.seed)
  const bus = ctx.createGain()
  const volume = ctx.createGain()
  const verb = ctx.createGain()
  const conv = ctx.createConvolver()
  conv.buffer = impulse(ctx, prng(opts.seed ^ 0x51ed), 2.6)
  const wet = ctx.createGain()
  wet.gain.value = 0.55
  verb.connect(conv).connect(wet).connect(bus)

  if (opts.master) {
    // No DynamicsCompressorNode: Firefox's lets the first tenth of a second of a sound through 3 to 5 dB low when
    // it follows quiet, so cues came out weaker there than in Chromium and WebKit. A fixed trim and a soft ceiling
    // behave the same everywhere.
    const trim = ctx.createGain()
    trim.gain.value = 0.25 * OUTPUT_TRIM
    const ceil = ctx.createWaveShaper()
    ceil.curve = ceilingCurve(8193)
    ceil.oversample = 'none'
    bus.connect(volume).connect(trim).connect(ceil).connect(dest)
  } else {
    bus.connect(dest)
  }

  return { ctx, rand, noise: whiteNoise(ctx, prng(opts.seed ^ 0x9e37), NOISE_SECONDS), bus, verb, volume }
}

// The gain between the volume control and the output. The loudness plan was set with it in place.
const OUTPUT_TRIM = 1.95

// The limiter, a soft ceiling: unity up to 0.7, then bending toward 0.97 and never past it. The input is
// pre-scaled by 0.25, so the curve spans inputs of -4..4.
function ceilingCurve(n: number): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 8 - 4
    const a = Math.abs(x)
    const y = a <= 0.7 ? a : 0.7 + 0.27 * Math.tanh((a - 0.7) / 0.27)
    c[i] = x < 0 ? -y : y
  }
  return c
}

const NOISE_SECONDS = 32

function whiteNoise(ctx: BaseAudioContext, rand: Rand, seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds)
  const b = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = rand() * 2 - 1
  return b
}

// A plain room-and-yard reverb: decaying noise that darkens as it fades.
function impulse(ctx: BaseAudioContext, rand: Rand, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const b = ctx.createBuffer(2, n, sr)
  const pre = Math.floor(0.012 * sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    let y = 0
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr
      const k = 0.5 * Math.exp(-t / 0.9) + 0.06
      y += k * (rand() * 2 - 1 - y)
      const fadeIn = Math.min(1, t / 0.008)
      d[i] = y * Math.exp(-t / 0.36) * fadeIn * Math.min(1, (seconds - i / sr) / 0.3)
    }
  }
  return b
}

export function gain(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain()
  g.gain.value = value
  return g
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

export function panner(ctx: BaseAudioContext, pan: number): StereoPannerNode {
  const p = ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  return p
}

// A stretch of the noise for a one-shot sound.
export function noiseSource(rig: Rig, t: number): AudioBufferSourceNode {
  const s = rig.ctx.createBufferSource()
  s.buffer = rig.noise
  s.start(t, rig.rand() * (rig.noise.duration - 4))
  return s
}

// Plays a buffer round and round at a speed that wanders by a percent or so, so no pass lines up with the last.
export function wanderingLoop(rig: Rig, buffer: AudioBuffer, t: number, rate: number): AudioBufferSourceNode {
  const ctx = rig.ctx
  const s = ctx.createBufferSource()
  s.buffer = buffer
  s.loop = true
  s.playbackRate.value = rate
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 1 / (11 + 8 * rig.rand())
  lfo.connect(gain(ctx, 0.012 * rate)).connect(s.playbackRate)
  lfo.start(t)
  s.start(t, rig.rand() * (buffer.duration - 0.5))
  return s
}

// Endless noise for a continuous voice, in stereo. Three passes over the one buffer at different, wandering
// speeds: two summed in the middle and one as the difference between the sides. Nothing comes round the same
// twice, and the sum to mono is still plain noise.
export function noiseBed(rig: Rig, t: number, width: number): AudioNode {
  const ctx = rig.ctx
  const out = ctx.createChannelMerger(2)
  const mid = gain(ctx, Math.SQRT1_2)
  wanderingLoop(rig, rig.noise, t, 1).connect(mid)
  wanderingLoop(rig, rig.noise, t, 0.811).connect(mid)
  mid.connect(out, 0, 0)
  mid.connect(out, 0, 1)
  const side = wanderingLoop(rig, rig.noise, t, 0.887)
  side.connect(gain(ctx, width)).connect(out, 0, 0)
  side.connect(gain(ctx, -width)).connect(out, 0, 1)
  return out
}

// A gain envelope with no corners: a raised-cosine rise to `peak`, a hold, and a raised-cosine fall, over `dur`.
export function swell(g: AudioParam, t: number, dur: number, peak: number, rise: number, fall: number): void {
  // Silent from the start of time: a value set "now" could land inside the curve if the clock has moved on.
  g.setValueAtTime(0, 0)
  g.setValueCurveAtTime(curve(peak, true), t, rise)
  g.setValueCurveAtTime(curve(peak, false), t + dur - fall, fall)
}

function curve(peak: number, up: boolean): Float32Array<ArrayBuffer> {
  const c = new Float32Array(24)
  for (let i = 0; i < c.length; i++) {
    const x = i / (c.length - 1)
    c[i] = peak * (0.5 - 0.5 * Math.cos(Math.PI * (up ? x : 1 - x)))
  }
  return c
}

// A gain that rises from silence and falls back to it. Returns the node and when it has gone quiet.
export function strike(ctx: BaseAudioContext, t: number, peak: number, attack: number, decay: number): { g: GainNode; end: number } {
  const g = ctx.createGain()
  g.gain.value = 0
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.setTargetAtTime(0, t + attack, decay)
  return { g, end: t + attack + decay * 9 }
}

// Smoothly retargets a continuous parameter; repeated calls with an unchanged value are dropped.
export class Smooth {
  param: AudioParam
  value: number
  constructor(param: AudioParam, initial: number) {
    this.param = param
    this.value = initial
    param.value = initial
  }
  to(v: number, t: number, tc: number, eps = 0.0005): void {
    if (Math.abs(v - this.value) <= eps) return
    this.value = v
    this.param.setTargetAtTime(v, t, tc)
  }
}

// A value that glides from one target to the next in equal ratios (even steps in decibels or in pitch), which is
// how a gust or a change of revs is heard. Each glide is anchored where the last one ended, so nothing jumps if
// scheduling has fallen behind.
export class Glide {
  param: AudioParam
  last: number
  constructor(param: AudioParam, initial: number) {
    this.param = param
    this.last = initial
    param.value = initial
  }
  to(v: number, from: number, at: number): void {
    this.param.setValueAtTime(this.last, from)
    this.param.exponentialRampToValueAtTime(v, at)
    this.last = v
  }
}

// A level that eases in and out. Two gains in series each move toward the square root of the target, so a sound
// rising from silence starts with no slope instead of arriving almost at once.
export class Fader {
  input: GainNode
  output: GainNode
  value = 0
  constructor(ctx: BaseAudioContext) {
    this.input = gain(ctx, 0)
    this.output = gain(ctx, 0)
    this.input.connect(this.output)
  }
  to(v: number, t: number, tc: number): void {
    if (Math.abs(v - this.value) <= 0.0003) return
    this.value = v
    const root = Math.sqrt(v)
    this.input.gain.setTargetAtTime(root, t, tc)
    this.output.gain.setTargetAtTime(root, t, tc)
  }
}
