// The voices that tell the seasons apart with the eyes shut: the brook in flood and the peepers along it in spring,
// bumblebees in the blossom in high summer, geese and crows over the dug fields and dry leaves blowing at harvest,
// and trees cracking in the frost in deep winter. Each is built the first time it is wanted, so a year that never
// reaches it never pays for it.
import type { Scene } from './scene.ts'
import { Fader, Glide, filter, gain, noiseSource, panner, spread, strike, swell, texture, tick, wanderingLoop, type Rand, type Rig } from './synth.ts'

// When the next of a sound that comes now and then is due. The wait is drawn for the sound at its fullest and
// stretched by how much of it there is at the moment, so a season coming in thins it out without fixing a wait
// drawn while it was faint; while there is none of it the wait stands still.
export class Sparse {
  first: [number, number]    // seconds before the first, and between later ones: least, and how much more by chance
  later: [number, number]
  since = -1
  wait = 0

  constructor(first: [number, number], later: [number, number]) {
    this.first = first
    this.later = later
  }

  // The time of the next one if it falls before `to`, else -1.
  due(amount: number, from: number, to: number, r: Rand): number {
    if (amount <= 0.02) return -1
    if (this.since < 0) { this.since = from; this.wait = this.first[0] + this.first[1] * r() }
    const at = this.since + this.wait / amount
    return at < to ? Math.max(at, from) : -1
  }

  // Begins the wait for the one after, counted from `t`.
  after(t: number, r: Rand): void {
    this.since = t
    this.wait = this.later[0] + this.later[1] * r()
  }
}

// Water over stones: a steady wash, a narrower band above it that moves about, and bubbles.
export class Brook {
  rig: Rig
  level: Fader | null = null
  riffle: Glide | null = null
  amount = 0
  nextRiffle = 0

  constructor(rig: Rig) {
    this.rig = rig
  }

  private build(t: number): void {
    const rig = this.rig, ctx = rig.ctx
    this.level = new Fader(ctx)
    // The brook lies down the slope, off to one side.
    const side = panner(ctx, 0.45)
    this.level.output.connect(side).connect(rig.bus)
    side.connect(gain(ctx, 0.25)).connect(rig.verb)
    wanderingLoop(rig, rig.noise, t, 0.93).connect(filter(ctx, 'bandpass', 520, 0.7)).connect(gain(ctx, 0.8)).connect(this.level.input)
    const hi = filter(ctx, 'bandpass', 1700, 1.6)
    wanderingLoop(rig, rig.noise, t, 1.07).connect(hi).connect(gain(ctx, 0.5)).connect(this.level.input)
    this.riffle = new Glide(hi.frequency, 1700)
    // Air caught under the water rings as it rises: a short note sliding up. A bubble of a millimetre's radius
    // rings near 3 kHz and one of five near 650 Hz.
    const bubbles = texture(rig, 9.7, 36, (add, sr, r) => {
      const f = 600 * Math.pow(2, 2.2 * r())
      const up = 1.2 + 0.3 * r()
      const amp = 0.15 + 1.1 * r() * r()
      const tau = 0.006 + 0.008 * r()
      const len = Math.floor(tau * 8 * sr)
      let ph = 0
      for (let j = 0; j < len; j++) {
        const x = j / sr
        ph += (2 * Math.PI * f * Math.pow(up, Math.min(1, x / 0.03))) / sr
        add(j, amp * Math.sin(ph) * Math.min(1, x / 0.002) * Math.exp(-x / tau))
      }
    })
    spread(rig, bubbles, t, 0.3).connect(gain(ctx, 1.2)).connect(this.level.input)
  }

  set(amount: number, t: number): void {
    if (amount > 0.01 && !this.level) this.build(t)
    if (!this.level) return
    this.level.to(0.045 * amount, t, 3)
    this.amount = amount
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    if (!this.riffle || this.amount <= 0.01) return
    if (this.nextRiffle < from) this.nextRiffle = from
    while (this.nextRiffle < to) {
      const at = this.nextRiffle + 1.2 + 2.6 * r()
      this.riffle.to(1200 + 1400 * r(), this.nextRiffle, at)
      this.nextRiffle = at
    }
  }
}

const PEEPERS = 8

// Spring peepers: each frog one clear note near 3 kHz that climbs about 15% as it sounds, a little over once a
// second and faster when it is warm. Each keeps fairly steady time at a pace of its own, so the chorus shimmers
// and never falls into step.
export class Peepers {
  rig: Rig
  level: Fader | null = null
  tones: OscillatorNode[] = []
  gates: GainNode[] = []
  hz: number[] = []
  pace: number[] = []
  next: number[] = []
  rate = 0
  until = 0

  constructor(rig: Rig) {
    this.rig = rig
  }

  private build(t: number): void {
    const rig = this.rig, ctx = rig.ctx, r = rig.rand
    this.level = new Fader(ctx)
    this.level.output.connect(rig.bus)
    this.level.output.connect(gain(ctx, 0.45)).connect(rig.verb)
    for (let k = 0; k < PEEPERS; k++) {
      const o = ctx.createOscillator()
      const hz = 2700 + 600 * r()
      o.frequency.value = hz
      const g = gain(ctx, 0)
      // They are down at the brook: one nearer than the rest, all toward the same side.
      o.connect(g).connect(gain(ctx, k === 0 ? 1 : 0.2 + 0.45 * r())).connect(panner(ctx, k === 0 ? 0.3 : 1.3 * r() - 0.2)).connect(this.level.input)
      o.start(t)
      this.tones.push(o)
      this.gates.push(g)
      this.hz.push(hz)
      this.pace.push(0.75 + 0.6 * r())
      this.next.push(-1)
    }
  }

  set(level: number, rate: number, t: number): void {
    if (level > 0.02 && !this.level) this.build(t)
    if (!this.level) return
    this.level.to(0.028 * level, t, 2.5)
    if (level > 0.02) {
      this.rate = rate
      this.until = Infinity
    } else if (this.until === Infinity) {
      this.until = t + 8
    }
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    if (!this.level) return
    for (let k = 0; k < PEEPERS; k++) {
      if (this.rate <= 0 || from > this.until) { this.next[k] = from + r(); continue }
      const period = 1 / (this.rate * this.pace[k])
      if (this.next[k] < from) this.next[k] = from + r() * period
      while (this.next[k] < to) {
        const len = this.peep(k, this.next[k])
        // Steady, with now and then a rest of a few beats.
        const rest = r() < 0.04 ? period * (2 + 4 * r()) : 0
        this.next[k] += Math.max(len + 0.08, period * (1 + 0.16 * (r() + r() - 1))) + rest
      }
    }
  }

  private peep(k: number, t: number): number {
    const g = this.gates[k].gain
    const f = this.tones[k].frequency
    const hz = this.hz[k]
    const len = 0.12 + 0.07 * this.rig.rand()
    g.setValueAtTime(0, t)
    g.linearRampToValueAtTime(1, t + 0.03)
    g.linearRampToValueAtTime(0.75, t + len * 0.7)
    g.linearRampToValueAtTime(0, t + len)
    f.setValueAtTime(hz * 0.93, t)
    f.linearRampToValueAtTime(hz * 1.07, t + len)
    return len
  }
}

// A bumblebee going by: a buzz at its wingbeat that swells, sags a little in pitch as it passes, and is gone.
export class Bees {
  rig: Rig
  out: GainNode | null = null
  amount = 0
  pace = new Sparse([2, 8], [10, 22])

  constructor(rig: Rig) {
    this.rig = rig
  }

  set(amount: number): void {
    this.amount = amount
  }

  schedule(from: number, to: number): void {
    const at = this.pace.due(this.amount, from, to, this.rig.rand)
    if (at < 0) return
    this.pass(at)
    this.pace.after(at, this.rig.rand)
  }

  private pass(t: number): void {
    const rig = this.rig, ctx = rig.ctx, r = rig.rand
    if (!this.out) {
      this.out = gain(ctx, 1)
      this.out.connect(rig.bus)
      this.out.connect(gain(ctx, 0.1)).connect(rig.verb)
    }
    const dur = 3 + 2.5 * r()
    const hz = 155 + 75 * r()
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(hz * 1.015, t)
    o.frequency.exponentialRampToValueAtTime(hz * 0.985, t + dur)
    // The wings never beat quite evenly.
    const waver = ctx.createOscillator()
    waver.frequency.value = 9 + 5 * r()
    waver.connect(gain(ctx, hz * 0.02)).connect(o.frequency)
    const g = ctx.createGain()
    swell(g.gain, t, dur, 0.013 * (0.6 + 0.4 * r()), dur * 0.48, dur * 0.48)
    const pan = panner(ctx, 0)
    const side = r() < 0.5 ? -1 : 1
    pan.pan.setValueAtTime(-0.85 * side, t)
    pan.pan.linearRampToValueAtTime(0.85 * side, t + dur)
    o.connect(filter(ctx, 'lowpass', 1500, 0.7)).connect(filter(ctx, 'highpass', 140)).connect(g).connect(pan).connect(this.out)
    o.start(t)
    waver.start(t)
    o.stop(t + dur + 0.05)
    waver.stop(t + dur + 0.05)
  }
}

// `goose` is the bird with the short, higher call, the one that answers the gander's honk.
interface Goose { hz: number; next: number; lead: boolean; goose: boolean }

// A skein of Canada geese going over: a handful of birds, each with a voice of its own, calling across one another
// as they come up from one side, pass, and go down the other.
export class Geese {
  rig: Rig
  reed: PeriodicWave | null = null
  amount = 0
  pace = new Sparse([6, 14], [40, 70])
  skein: { out: GainNode; until: number; birds: Goose[] } | null = null

  constructor(rig: Rig) {
    this.rig = rig
  }

  set(amount: number): void {
    this.amount = amount
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    if (this.skein) {
      const s = this.skein
      for (const b of s.birds) {
        if (b.next < from) b.next = from + 0.1 * r()
        while (b.next < to && b.next < s.until) {
          this.honk(s.out, b.next, b.hz * (1 + 0.02 * (2 * r() - 1)), b.lead ? 1 : 0.45 + 0.4 * r(), b.goose)
          b.next += b.lead ? 0.5 + 0.5 * r() : 0.9 + 2.2 * r()
        }
      }
      if (from > s.until) this.skein = null
      return
    }
    const at = this.pace.due(this.amount, from, to, r)
    if (at < 0) return
    this.skein = this.start(at)
    this.pace.after(this.skein.until, r)
  }

  private start(t: number): { out: GainNode; until: number; birds: Goose[] } {
    const rig = this.rig, ctx = rig.ctx, r = rig.rand
    const dur = 11 + 6 * r()
    const out = ctx.createGain()
    swell(out.gain, t, dur, 0.5 + 0.5 * r(), dur * 0.42, dur * 0.5)
    const pan = panner(ctx, 0)
    const side = r() < 0.5 ? -1 : 1
    pan.pan.setValueAtTime(-0.7 * side, t)
    pan.pan.linearRampToValueAtTime(0.7 * side, t + dur)
    // High and far: the top is gone and half of it comes back off the hill.
    const far = filter(ctx, 'lowpass', 2800, 0.5)
    out.connect(far).connect(pan).connect(rig.bus)
    pan.connect(gain(ctx, 0.5)).connect(rig.verb)
    const birds: Goose[] = []
    const n = 3 + Math.floor(3 * r())
    for (let k = 0; k < n; k++) {
      const goose = k % 2 === 1
      birds.push({ hz: goose ? 720 + 130 * r() : 500 + 150 * r(), next: t + (k === 0 ? 0.2 : 1.5 * r() + 0.6 * k), lead: k === 0, goose })
    }
    return { out, until: t + dur, birds }
  }

  // One honk, "her-onk": a low first syllable, a break upward, and the second syllable sagging as it ends. The
  // goose's answer is the second syllable alone, short.
  private honk(out: AudioNode, t: number, hz: number, amp: number, short: boolean): void {
    const ctx = this.rig.ctx
    if (!this.reed) {
      const K = 14
      const re = new Float32Array(K + 1), im = new Float32Array(K + 1)
      for (let k = 1; k <= K; k++) im[k] = (k === 1 ? 0.5 : 1) / Math.pow(k, 0.8)
      this.reed = ctx.createPeriodicWave(re, im)
    }
    const o = ctx.createOscillator()
    o.setPeriodicWave(this.reed)
    const f = o.frequency
    const g = ctx.createGain()
    g.gain.value = 0
    g.gain.setValueAtTime(0, t)
    // Where the second syllable begins and ends.
    const on = short ? 0 : 0.11, end = short ? 0.13 : 0.36
    if (!short) {
      f.setValueAtTime(hz * 0.72, t)
      f.linearRampToValueAtTime(hz * 0.77, t + 0.1)
      g.gain.linearRampToValueAtTime(0.4 * amp, t + 0.025)
      g.gain.linearRampToValueAtTime(0.35 * amp, t + 0.1)
    }
    f.setValueAtTime(hz, t + on)
    f.linearRampToValueAtTime(hz * 1.04, t + on + 0.04)
    f.linearRampToValueAtTime(hz * 0.93, t + end - 0.02)
    g.gain.linearRampToValueAtTime(amp, t + on + 0.03)
    g.gain.linearRampToValueAtTime(0.75 * amp, t + end - 0.08)
    g.gain.linearRampToValueAtTime(0, t + end)
    // The bill and throat: two bands of the buzz let through.
    o.connect(filter(ctx, 'bandpass', 1250, 2.2)).connect(gain(ctx, 0.105)).connect(g)
    o.connect(filter(ctx, 'bandpass', 2450, 3)).connect(gain(ctx, 0.063)).connect(g)
    o.connect(gain(ctx, 0.017)).connect(g)
    g.connect(out)
    o.start(t)
    o.stop(t + end + 0.02)
  }
}

// Crows on the dug ground: two to four harsh caws from one bird, well off.
export class Crows {
  rig: Rig
  amount = 0
  pace = new Sparse([4, 12], [22, 40])

  constructor(rig: Rig) {
    this.rig = rig
  }

  set(amount: number): void {
    this.amount = amount
  }

  schedule(from: number, to: number): void {
    const at = this.pace.due(this.amount, from, to, this.rig.rand)
    if (at < 0) return
    this.call(at)
    this.pace.after(at, this.rig.rand)
  }

  private call(t: number): void {
    const rig = this.rig, ctx = rig.ctx, r = rig.rand
    const out = gain(ctx, 0.5 + 0.5 * r())
    const pan = panner(ctx, 1.6 * r() - 0.8)
    out.connect(filter(ctx, 'lowpass', 2400, 0.5)).connect(pan).connect(rig.bus)
    pan.connect(gain(ctx, 0.5)).connect(rig.verb)
    const hz = 470 + 80 * r()
    const n = 2 + Math.floor(3 * r())
    let at = t
    for (let k = 0; k < n; k++) {
      this.caw(out, at, hz * (1 + 0.03 * (2 * r() - 1)), 0.24 + 0.08 * r())
      at += 0.4 + 0.12 * r()
    }
  }

  // One caw: a rough buzz and breath through the throat's band, falling a little in pitch.
  private caw(out: AudioNode, t: number, hz: number, dur: number): void {
    const rig = this.rig, ctx = rig.ctx
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(hz * 1.06, t)
    o.frequency.linearRampToValueAtTime(hz * 0.9, t + dur)
    // The harshness: the voice breaks up many times a second.
    const rough = gain(ctx, 0.55)
    const rasp = ctx.createOscillator()
    rasp.type = 'sawtooth'
    rasp.frequency.value = hz / 2.03
    rasp.connect(gain(ctx, 0.45)).connect(rough.gain)
    const env = ctx.createGain()
    swell(env.gain, t, dur, 0.2, 0.03, dur * 0.4)
    const breath = noiseSource(rig, t)
    o.connect(rough)
    breath.connect(gain(ctx, 0.7)).connect(rough)
    // A caw is strongest between 1.3 and 1.5 kHz and has little above 1.9.
    rough.connect(filter(ctx, 'bandpass', 1380, 2)).connect(env)
    rough.connect(filter(ctx, 'bandpass', 1750, 3)).connect(gain(ctx, 0.35)).connect(env)
    env.connect(out)
    o.start(t)
    rasp.start(t)
    o.stop(t + dur + 0.02)
    rasp.stop(t + dur + 0.02)
    breath.stop(t + dur + 0.02)
  }
}

// Deep cold: a tree splitting in the frost somewhere up the ridge. One sharp report and the hill giving it back.
export class Frost {
  rig: Rig
  amount = 0
  pace = new Sparse([5, 14], [18, 34])

  constructor(rig: Rig) {
    this.rig = rig
  }

  set(amount: number): void {
    this.amount = amount
  }

  schedule(from: number, to: number): void {
    const at = this.pace.due(this.amount, from, to, this.rig.rand)
    if (at < 0) return
    this.report(at)
    this.pace.after(at, this.rig.rand)
  }

  private report(t: number): void {
    const rig = this.rig, ctx = rig.ctx, r = rig.rand
    const amp = 0.21 + 0.14 * r()
    const pan = panner(ctx, 1.6 * r() - 0.8)
    const far = filter(ctx, 'lowpass', 2600, 0.5)
    far.connect(pan)
    pan.connect(gain(ctx, 0.6)).connect(rig.bus)
    pan.connect(rig.verb)
    const n = noiseSource(rig, t)
    const s = strike(ctx, t, amp, 0.001, 0.025 + 0.02 * r())
    n.connect(filter(ctx, 'bandpass', 900 + 600 * r(), 0.7)).connect(s.g).connect(far)
    n.stop(s.end)
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(90, t + 0.05)
    const b = strike(ctx, t, amp * 0.5, 0.003, 0.05)
    o.connect(b.g).connect(far)
    o.start(t)
    o.stop(b.end)
  }
}

// Dry leaves let go by the hardwoods, blowing across the ground: little runs of crisp ticks, thicker in the gusts.
export class Leaves {
  rig: Rig
  level: Fader | null = null
  gusts: Glide | null = null

  constructor(rig: Rig) {
    this.rig = rig
  }

  private build(t: number): void {
    const rig = this.rig, ctx = rig.ctx
    this.level = new Fader(ctx)
    this.level.output.connect(rig.bus)
    this.level.output.connect(gain(ctx, 0.08)).connect(rig.verb)
    // One leaf skittering: a few ticks as it catches and lets go.
    const runs = texture(rig, 11.3, 18, (add, sr, r) => {
      const level = 0.3 + 0.7 * r() * r()
      const n = 3 + Math.floor(6 * r())
      let at = 0
      for (let k = 0; k < n; k++) {
        tick(add, sr, r, at, 4000 + 4000 * r(), 1.6, 0.002 + 0.003 * r(), level * (0.5 + 0.5 * r()))
        at += 0.02 + 0.06 * r()
      }
    })
    const gust = gain(ctx, 1)
    spread(rig, runs, t, 0.85).connect(filter(ctx, 'highpass', 3000)).connect(gust).connect(this.level.input)
    this.gusts = new Glide(gust.gain, 1)
  }

  // How dry and loose the leaves are, times how hard it blows.
  set(dry: number, wind: number, t: number): void {
    const amount = dry * (0.5 + 0.25 * wind)
    if (amount > 0.02 && !this.level) this.build(t)
    this.level?.to(0.16 * amount, t, 2)
  }

  // The wind's gusts carry them: `g` is the gust's strength about 1.
  gust(g: number, from: number, at: number): void {
    this.gusts?.to(Math.pow(g, 1.5), from, at)
  }
}

// All of them, set together from the scene.
export class Seasons {
  brook: Brook
  peepers: Peepers
  bees: Bees
  geese: Geese
  crows: Crows
  frost: Frost
  leaves: Leaves

  constructor(rig: Rig) {
    this.brook = new Brook(rig)
    this.peepers = new Peepers(rig)
    this.bees = new Bees(rig)
    this.geese = new Geese(rig)
    this.crows = new Crows(rig)
    this.frost = new Frost(rig)
    this.leaves = new Leaves(rig)
  }

  set(s: Scene, t: number): void {
    this.brook.set(s.brook, t)
    this.peepers.set(s.peepers, s.peeps, t)
    this.bees.set(s.bees)
    this.geese.set(s.geese)
    this.crows.set(s.crows)
    this.frost.set(s.frost)
    this.leaves.set(s.dry, s.wind, t)
  }

  schedule(from: number, to: number): void {
    this.brook.schedule(from, to)
    this.peepers.schedule(from, to)
    this.bees.schedule(from, to)
    this.geese.schedule(from, to)
    this.crows.schedule(from, to)
    this.frost.schedule(from, to)
  }
}
