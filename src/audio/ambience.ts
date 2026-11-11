// The continuous voices: wind, rain, the tractor, crickets and birds. Each runs for the life of the context;
// levels move only by smoothed targets, and timed sounds are scheduled a little ahead by schedule(from, to).
import type { Scene } from './scene.ts'
import { Smooth, filter, gain, noiseSource, panner, type Rig } from './synth.ts'

// Mono in, wide stereo out: the right side hears the same signal a few milliseconds late.
function widen(rig: Rig, input: AudioNode, ms: number): AudioNode {
  const m = rig.ctx.createChannelMerger(2)
  const d = rig.ctx.createDelay(0.1)
  d.delayTime.value = ms / 1000
  input.connect(m, 0, 0)
  input.connect(d).connect(m, 0, 1)
  return m
}

export class Wind {
  rig: Rig
  level: Smooth
  cold: Smooth
  gust: GainNode
  whistleGust: GainNode
  lp: BiquadFilterNode
  bp: BiquadFilterNode
  amount = 0
  next = 0

  constructor(rig: Rig, t: number) {
    const ctx = rig.ctx
    this.rig = rig
    const src = noiseSource(rig, t, true)
    this.lp = filter(ctx, 'lowpass', 420, 0.6)
    this.gust = gain(ctx, 0.8)
    const lv = gain(ctx, 0)
    this.level = new Smooth(lv.gain, 0)
    src.connect(filter(ctx, 'highpass', 70)).connect(this.lp).connect(filter(ctx, 'lowpass', 1400, 0.5)).connect(this.gust).connect(lv)
    widen(rig, lv, 23).connect(rig.bus)

    this.bp = filter(ctx, 'bandpass', 900, 9)
    this.whistleGust = gain(ctx, 0.5)
    const cv = gain(ctx, 0)
    this.cold = new Smooth(cv.gain, 0)
    src.connect(this.bp).connect(filter(ctx, 'bandpass', 1100, 2)).connect(this.whistleGust).connect(cv)
    widen(rig, cv, 11).connect(rig.bus)
  }

  set(wind: number, cold: number, t: number): void {
    this.amount = wind
    this.level.to(0.6 * wind, t, 2)
    this.cold.to(0.5 * cold, t, 2.5)
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    if (this.next < from) this.next = from
    while (this.next < to) {
      const t = this.next
      const s = r()
      const dur = 1.8 + 4.2 * r()
      this.gust.gain.setTargetAtTime(0.55 + 0.75 * s, t, dur * 0.3)
      this.lp.frequency.setTargetAtTime(260 + (450 + 650 * this.amount) * s, t, dur * 0.3)
      this.bp.frequency.setTargetAtTime(760 + 650 * s, t, dur * 0.4)
      this.whistleGust.gain.setTargetAtTime(0.25 + 0.9 * s * s, t, dur * 0.3)
      this.next = t + dur
    }
  }
}

export class Rain {
  hiss: Smooth
  drops: Smooth
  rumble: Smooth
  hp: Smooth
  lp: Smooth

  constructor(rig: Rig, t: number) {
    const ctx = rig.ctx
    const src = noiseSource(rig, t, true)
    const hp = filter(ctx, 'highpass', 600, 0.5)
    const lp = filter(ctx, 'lowpass', 4500, 0.5)
    this.hp = new Smooth(hp.frequency, 600)
    this.lp = new Smooth(lp.frequency, 4500)
    const hv = gain(ctx, 0)
    this.hiss = new Smooth(hv.gain, 0)
    src.connect(hp).connect(lp).connect(hv)
    widen(rig, hv, 17).connect(rig.bus)

    const patter = ctx.createBufferSource()
    patter.buffer = rig.drops
    patter.loop = true
    patter.start(t, rig.rand() * 4)
    const dv = gain(ctx, 0)
    this.drops = new Smooth(dv.gain, 0)
    patter.connect(filter(ctx, 'lowpass', 8000)).connect(dv).connect(rig.bus)

    const rv = gain(ctx, 0)
    this.rumble = new Smooth(rv.gain, 0)
    src.connect(filter(ctx, 'lowpass', 160, 0.6)).connect(rv)
    widen(rig, rv, 31).connect(rig.bus)
  }

  set(rain: number, heavy: number, t: number): void {
    this.hiss.to(0.13 * rain * rain * (0.5 + 0.5 * heavy), t, 1.2)
    this.drops.to(0.2 * rain * (1 - 0.4 * heavy), t, 1.2)
    this.rumble.to(0.25 * heavy * rain, t, 1.6)
    this.hp.to(650 - 250 * heavy, t, 1.5, 1)
    this.lp.to(4200 + 3000 * heavy, t, 1.5, 1)
  }
}

export class Engine {
  level: Smooth
  f1: Smooth
  f2: Smooth

  constructor(rig: Rig, t: number) {
    const ctx = rig.ctx
    const o1 = ctx.createOscillator()
    o1.type = 'sawtooth'
    const o2 = ctx.createOscillator()
    o2.type = 'square'
    this.f1 = new Smooth(o1.frequency, 22)
    this.f2 = new Smooth(o2.frequency, 11)
    // A slow wander in the revs, so the drone never sits still.
    const wob = ctx.createOscillator()
    wob.frequency.value = 0.23
    const wobDepth = gain(ctx, 0.45)
    wob.connect(wobDepth)
    wobDepth.connect(o1.frequency)
    wobDepth.connect(gain(ctx, 0.5)).connect(o2.frequency)

    const body = filter(ctx, 'lowpass', 230, 2.2)
    o1.connect(gain(ctx, 0.5)).connect(body)
    o2.connect(gain(ctx, 0.18)).connect(body)

    // Exhaust: noise opened and closed at the firing rate.
    const chuff = gain(ctx, 0.6)
    o1.connect(gain(ctx, 0.6)).connect(chuff.gain)
    noiseSource(rig, t, true).connect(filter(ctx, 'bandpass', 150, 1.2)).connect(chuff)

    const out = gain(ctx, 0)
    this.level = new Smooth(out.gain, 0)
    const far = filter(ctx, 'lowpass', 900, 0.5)
    body.connect(far)
    chuff.connect(gain(ctx, 0.9)).connect(far)
    far.connect(out).connect(panner(ctx, 0.2)).connect(rig.bus)
    o1.start(t)
    o2.start(t)
    wob.start(t)
  }

  // level 0..1; load 0 is idling, 1 is pulling an implement.
  set(level: number, load: number, t: number): void {
    const v = 0.11 * level
    this.level.to(v, t, v > this.level.value ? 0.5 : 0.9)
    this.f1.to(21 + 8 * load, t, 1.2, 0.05)
    this.f2.to((21 + 8 * load) / 2, t, 1.2, 0.05)
  }
}

const CRICKET_HZ = [4380, 4650, 4910]
const CRICKET_PAN = [-0.6, 0.2, 0.7]
const CRICKET_PULSES = [3, 4, 3]

export class Crickets {
  rig: Rig
  level: Smooth
  gates: GainNode[] = []
  next = [0, 0, 0]
  rate = 0
  // Keeps chirping while the level fades out.
  until = 0

  constructor(rig: Rig, t: number) {
    const ctx = rig.ctx
    this.rig = rig
    const bus = gain(ctx, 0)
    this.level = new Smooth(bus.gain, 0)
    bus.connect(rig.bus)
    bus.connect(gain(ctx, 0.25)).connect(rig.verb)
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator()
      o.frequency.value = CRICKET_HZ[k]
      const g = gain(ctx, 0)
      o.connect(g).connect(panner(ctx, CRICKET_PAN[k])).connect(bus)
      o.start(t)
      this.gates.push(g)
    }
  }

  set(level: number, chirps: number, t: number): void {
    this.level.to(0.03 * level, t, 2)
    if (level > 0.02) {
      this.rate = chirps
      this.until = Infinity
    } else if (this.until === Infinity) {
      this.until = t + 8
    }
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    for (let k = 0; k < 3; k++) {
      if (this.rate <= 0 || from > this.until) { this.next[k] = from + r(); continue }
      const period = (1 / this.rate) * (1 + 0.06 * k)
      if (this.next[k] < from) this.next[k] = from + r() * period
      while (this.next[k] < to) {
        this.chirp(k, this.next[k])
        this.next[k] += period * (0.92 + 0.16 * r())
      }
    }
  }

  private chirp(k: number, t: number): void {
    const g = this.gates[k].gain
    for (let p = 0; p < CRICKET_PULSES[k]; p++) {
      const at = t + p * 0.032
      g.setValueAtTime(0, at)
      g.linearRampToValueAtTime(1, at + 0.004)
      g.setValueAtTime(1, at + 0.013)
      g.linearRampToValueAtTime(0, at + 0.019)
    }
  }
}

type Song = 'sparrow' | 'chickadee' | 'robin' | 'trill'

// Who sings, by month, as weights.
const SONGS: Record<number, [Song, number][]> = {
  3: [['chickadee', 1]],
  4: [['sparrow', 0.35], ['robin', 0.4], ['chickadee', 0.25]],
  5: [['sparrow', 0.4], ['robin', 0.25], ['trill', 0.2], ['chickadee', 0.15]],
  6: [['sparrow', 0.3], ['trill', 0.35], ['robin', 0.15], ['chickadee', 0.2]],
}

interface Singer { song: Song; pan: number; pitch: number; left: number }

export class Birds {
  rig: Rig
  out: GainNode
  rate = 0
  month = 5
  next = 0
  singer: Singer | null = null

  constructor(rig: Rig) {
    const ctx = rig.ctx
    this.rig = rig
    this.out = gain(ctx, 1)
    this.out.connect(filter(ctx, 'lowpass', 6500)).connect(rig.bus)
    this.out.connect(gain(ctx, 0.4)).connect(rig.verb)
  }

  set(rate: number, month: number): void {
    this.rate = rate
    this.month = month
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    if (this.rate <= 0) { this.next = from + 1 + 3 * r(); return }
    const gap = 60 / this.rate
    if (this.next < from) this.next = from + 0.5 + r() * gap * 0.5
    while (this.next < to) {
      const dur = this.sing(this.next)
      this.next += dur + gap * (0.5 + r())
    }
  }

  private sing(t: number): number {
    const r = this.rig.rand
    if (!this.singer || this.singer.left <= 0) {
      const pool = SONGS[this.month] ?? SONGS[5]
      let x = r() * pool.reduce((a, p) => a + p[1], 0)
      let song = pool[0][0]
      for (const [s, w] of pool) { if ((x -= w) <= 0) { song = s; break } }
      this.singer = { song, pan: r() * 1.6 - 0.8, pitch: 0.93 + 0.14 * r(), left: 2 + Math.floor(r() * 4) }
    }
    this.singer.left--
    return phrase(this.rig, this.out, t, this.singer.song, this.singer.pitch, this.singer.pan)
  }
}

// One whistled note: a sine following a pitch path of [seconds after start, hz] points.
function note(rig: Rig, out: AudioNode, t: number, dur: number, path: [number, number][], amp: number): void {
  const ctx = rig.ctx
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(path[0][1], t)
  for (let i = 1; i < path.length; i++) o.frequency.linearRampToValueAtTime(path[i][1], t + path[i][0])
  const g = ctx.createGain()
  g.gain.value = 0
  const a = Math.min(0.025, dur * 0.3)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(amp, t + a)
  g.gain.setValueAtTime(amp, t + dur - a)
  g.gain.linearRampToValueAtTime(0, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

// Plays one song phrase and returns how long it lasts.
export function phrase(rig: Rig, out: AudioNode, t: number, song: Song, p: number, pan: number): number {
  const ctx = rig.ctx
  const r = rig.rand
  const o = panner(ctx, pan)
  o.connect(out)
  switch (song) {
    case 'sparrow': {
      // White-throated sparrow, the north woods' "oh sweet Canada, Canada, Canada".
      note(rig, o, t, 0.6, [[0, 3000 * p], [0.06, 3100 * p], [0.6, 3100 * p]], 0.05)
      note(rig, o, t + 0.68, 0.5, [[0, 3950 * p], [0.5, 3950 * p]], 0.055)
      let at = t + 1.26
      for (let k = 0; k < 3; k++) {
        const a = 0.046 - k * 0.006
        note(rig, o, at, 0.1, [[0, 3850 * p], [0.1, 3780 * p]], a)
        note(rig, o, at + 0.125, 0.1, [[0, 3700 * p], [0.1, 3640 * p]], a)
        note(rig, o, at + 0.25, 0.1, [[0, 3700 * p], [0.1, 3640 * p]], a)
        at += 0.37
      }
      return at - t
    }
    case 'chickadee': {
      // Black-capped chickadee, "fee-bee".
      note(rig, o, t, 0.3, [[0, 4000 * p], [0.3, 3950 * p]], 0.05)
      note(rig, o, t + 0.42, 0.38, [[0, 3500 * p], [0.15, 3450 * p], [0.18, 3530 * p], [0.38, 3480 * p]], 0.045)
      return 0.8
    }
    case 'robin': {
      // American robin: short rising and falling carolled syllables.
      let at = t
      const n = 4 + Math.floor(r() * 3)
      for (let k = 0; k < n; k++) {
        const f1 = (2100 + 500 * r()) * p
        const f2 = f1 + 300 + 500 * r()
        const d = 0.17 + 0.12 * r()
        note(rig, o, at, d, [[0, f1], [d * 0.45, f2], [d, f1 + 120 * r()]], 0.038)
        at += d + 0.12 + 0.1 * r()
      }
      return at - t
    }
    case 'trill': {
      // A dry trill of quick falling chips, like a chipping sparrow or junco.
      const n = 10 + Math.floor(r() * 7)
      for (let k = 0; k < n; k++) note(rig, o, t + k * 0.066, 0.036, [[0, 5600 * p], [0.036, 4400 * p]], 0.028)
      return n * 0.066
    }
  }
}

export class Ambience {
  wind: Wind
  rain: Rain
  engine: Engine
  crickets: Crickets
  birds: Birds

  constructor(rig: Rig, t: number) {
    this.wind = new Wind(rig, t)
    this.rain = new Rain(rig, t)
    this.engine = new Engine(rig, t)
    this.crickets = new Crickets(rig, t)
    this.birds = new Birds(rig)
  }

  setScene(s: Scene, t: number): void {
    this.wind.set(s.wind, s.cold, t)
    this.rain.set(s.rain, s.heavy, t)
    this.crickets.set(s.crickets, s.chirps, t)
    this.birds.set(s.birds, s.month)
  }

  setEngine(level: number, load: number, t: number): void {
    this.engine.set(level, load, t)
  }

  schedule(from: number, to: number): void {
    this.wind.schedule(from, to)
    this.crickets.schedule(from, to)
    this.birds.schedule(from, to)
  }
}
