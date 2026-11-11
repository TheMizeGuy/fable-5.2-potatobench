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

export function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

export interface Rig {
  ctx: BaseAudioContext
  rand: Rand
  noise: AudioBuffer      // white noise loop, mono
  drops: AudioBuffer      // rain patter loop, stereo
  bus: GainNode           // every dry voice sums here
  verb: GainNode          // reverb send
  volume: GainNode        // master volume, after the bus
}

export interface RigOptions {
  seed: number
  // false skips the volume, compressor and ceiling: the bus goes straight to dest (used to measure raw levels).
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
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 10
    comp.ratio.value = 6
    comp.attack.value = 0.004
    comp.release.value = 0.3
    const pre = ctx.createGain()
    pre.gain.value = 0.5
    const ceil = ctx.createWaveShaper()
    ceil.curve = ceilingCurve(4097)
    ceil.oversample = 'none'
    bus.connect(volume).connect(comp).connect(pre).connect(ceil).connect(dest)
  } else {
    bus.connect(dest)
  }

  return { ctx, rand, noise: whiteNoise(ctx, prng(opts.seed ^ 0x9e37), 5), drops: rainDrops(ctx, prng(opts.seed ^ 0x2545), 6), bus, verb, volume }
}

// A soft ceiling: unity up to 0.7, then bending toward 0.97 and never past it. The input is pre-scaled by 0.5,
// so the curve spans inputs of -2..2.
function ceilingCurve(n: number): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 4 - 2
    const a = Math.abs(x)
    const y = a <= 0.7 ? a : 0.7 + 0.27 * Math.tanh((a - 0.7) / 0.27)
    c[i] = x < 0 ? -y : y
  }
  return c
}

function whiteNoise(ctx: BaseAudioContext, rand: Rand, seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds)
  const b = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = rand() * 2 - 1
  return b
}

// Drops on leaves and soil: many tiny damped ticks, most of them faint. Written with wrap-around so the loop is seamless.
function rainDrops(ctx: BaseAudioContext, rand: Rand, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const b = ctx.createBuffer(2, n, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    const count = Math.floor(seconds * 140)
    for (let k = 0; k < count; k++) {
      const start = Math.floor(rand() * n)
      const r = rand()
      const amp = 0.04 + 0.5 * r * r * r
      const f = 1400 + 4200 * rand()
      const tau = 0.0006 + 0.0022 * rand()
      const len = Math.floor(tau * 7 * sr)
      const w = (2 * Math.PI * f) / sr
      for (let j = 0; j < len; j++) d[(start + j) % n] += amp * Math.sin(w * j) * Math.exp(-j / (tau * sr))
    }
    let peak = 0
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]))
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / peak
  }
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
      d[i] = y * Math.exp(-t / 0.42) * fadeIn
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

export function noiseSource(rig: Rig, t: number, loop: boolean): AudioBufferSourceNode {
  const s = rig.ctx.createBufferSource()
  s.buffer = rig.noise
  s.loop = loop
  s.start(t, rig.rand() * (rig.noise.duration - 0.5))
  return s
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
