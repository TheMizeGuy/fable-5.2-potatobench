// The continuous voices: wind, rain, the tractor, crickets and birds. Each runs for the life of the context;
// levels move only by smoothed targets, and timed sounds are scheduled a little ahead by schedule(from, to).
import type { Scene } from './scene.ts'
import { Fader, Glide, Smooth, filter, gain, noiseBed, panner, swell, wanderingLoop, type Rig } from './synth.ts'

// How strong the wind sounds for a wind setting of 0..1 (1 m/s to 7.5 m/s and over). With the ridge's note
// climbing as it blows harder, a gale comes out some 12 dB over a breeze.
const windLevel = (w: number) => 0.072 * w

// Four layers, each from noise of its own so that they add and never cancel where their bands cross.
export class Wind {
  rig: Rig
  level: Fader
  sighLevel: Fader
  leafLevel: Fader
  cold: Fader
  gust: Glide
  bodyTop: Glide
  sighGust: Glide
  sighPitch: Glide
  leafGust: Glide
  whistleGust: Glide
  whistlePitch: Glide
  amount = 0
  next = 0

  constructor(rig: Rig, t: number) {
    const ctx = rig.ctx
    this.rig = rig
    const layer = (chain: AudioNode[]): [Glide, Fader] => {
      const lv = new Fader(ctx)
      lv.output.connect(rig.bus)
      const gust = gain(ctx, 1)
      gust.connect(lv.input)
      let node: AudioNode = noiseBed(rig, t, 0.8)
      for (const f of chain) node = node.connect(f)
      node.connect(gust)
      return [new Glide(gust.gain, 1), lv]
    }

    // Air over open ground: a broad low rush that opens as a gust comes through.
    const lp = filter(ctx, 'lowpass', 420, 0.6)
    const body = layer([filter(ctx, 'highpass', 150, 0.7), lp, filter(ctx, 'lowpass', 1600, 0.5)])
    this.gust = body[0]
    this.level = body[1]
    this.bodyTop = new Glide(lp.frequency, 420)

    // The spruce on the ridge: needles shed a band of sound that climbs with the wind.
    const sigh = filter(ctx, 'bandpass', 800, 1)
    const ridge = layer([sigh, filter(ctx, 'lowpass', 3000, 0.5)])
    this.sighGust = ridge[0]
    this.sighLevel = ridge[1]
    this.sighPitch = new Glide(sigh.frequency, 800)

    // Leaves brushing each other close by, around 4 kHz, mostly in the gusts.
    const leaves = layer([filter(ctx, 'highpass', 2600, 0.6), filter(ctx, 'lowpass', 5200, 0.6)])
    this.leafGust = leaves[0]
    this.leafLevel = leaves[1]

    // A cold wind finding a gap: thin and pitched.
    const bp = filter(ctx, 'bandpass', 900, 6)
    const gap = layer([bp, filter(ctx, 'bandpass', 1100, 1.5)])
    this.whistleGust = gap[0]
    this.cold = gap[1]
    this.whistlePitch = new Glide(bp.frequency, 900)
  }

  set(wind: number, cold: number, t: number): void {
    this.amount = wind
    const v = windLevel(wind)
    this.level.to(0.7 * v, t, 2)
    this.sighLevel.to(v, t, 2)
    this.leafLevel.to(0.12 * v * wind, t, 2)
    this.cold.to(0.04 * cold, t, 2.5)
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    if (this.next < from) this.next = from
    while (this.next < to) {
      const t = this.next
      // Gusts come on a scale of ten seconds or so and move the level about 3 dB either way, 5 at most.
      const n = Math.max(-1.6, Math.min(1.6, 2 * (r() + r() + r() - 1.5)))
      const g = Math.exp(0.35 * n)
      const at = t + 3 + 6 * r()
      // Wind speed in m/s; the sound's strength goes as about its square.
      const u = (1 + 6.5 * this.amount) * Math.sqrt(g)
      this.gust.to(g, t, at)
      this.bodyTop.to(220 + 70 * u, t, at)
      this.sighGust.to(g, t, at)
      // Needles a millimetre thick shed their sound at 0.2 x speed / thickness: 200 Hz for each m/s.
      this.sighPitch.to(200 * u, t, at)
      this.leafGust.to(Math.pow(g, 1.5), t, at)
      this.whistleGust.to(Math.pow(g, 1.5), t, at)
      this.whistlePitch.to(760 + 650 * r(), t, at)
      this.next = at
    }
  }
}

// Far drops: a dense, even patter, written with wrap-around so it loops without a seam. No drop stands out, so
// the loop cannot be picked out by its rhythm; the drops that do stand out are scheduled one at a time.
function patter(rig: Rig, seconds: number): AudioBuffer {
  const sr = rig.ctx.sampleRate
  const rand = rig.rand
  const n = Math.floor(sr * seconds)
  const b = rig.ctx.createBuffer(2, n, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    const count = Math.floor(seconds * 150)
    for (let k = 0; k < count; k++) {
      const start = Math.floor(rand() * n)
      const amp = 0.3 + 0.7 * rand()
      const f = 3600 * Math.pow(2, 1.1 * (rand() + rand() - 1))
      const tau = (2 + 3 * rand()) / f
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

export class Rain {
  rig: Rig
  out: AudioNode
  hiss: Fader
  far: Fader
  near: Fader
  roar: Fader
  hp: Smooth
  lp: Smooth
  amount = 0
  heavy = 0
  next = 0
  // Keeps dropping while the level fades out.
  until = 0

  constructor(rig: Rig, t: number) {
    const ctx = rig.ctx
    this.rig = rig
    const hp = filter(ctx, 'highpass', 600, 0.5)
    const lp = filter(ctx, 'lowpass', 6500, 0.5)
    this.hp = new Smooth(hp.frequency, 600)
    this.lp = new Smooth(lp.frequency, 6500)
    this.hiss = new Fader(ctx)
    noiseBed(rig, t, 1).connect(hp).connect(lp).connect(this.hiss.input)
    this.hiss.output.connect(rig.bus)

    // A downpour on leaves and soil: the roar between 600 Hz and 1.2 kHz that grows fastest as rain gets heavy.
    this.roar = new Fader(ctx)
    noiseBed(rig, t, 1).connect(filter(ctx, 'bandpass', 850, 0.9)).connect(this.roar.input)
    this.roar.output.connect(rig.bus)

    this.far = new Fader(ctx)
    this.far.output.connect(filter(ctx, 'lowpass', 8000)).connect(rig.bus)
    for (const [seconds, rate] of [[7.3, 1], [9.1, 0.93]]) wanderingLoop(rig, patter(rig, seconds), t, rate).connect(this.far.input)

    this.near = new Fader(ctx)
    this.near.output.connect(rig.bus)
    this.near.output.connect(gain(ctx, 0.12)).connect(rig.verb)
    this.out = this.near.input
  }

  set(rain: number, heavy: number, t: number): void {
    // Light rain is mostly separate drops; as it gets heavy they run together into a hiss and then a roar.
    this.hiss.to(0.01 * Math.sqrt(rain) + 0.017 * rain * rain * (0.5 + 0.5 * heavy), t, 2.2)
    this.far.to(0.045 * Math.sqrt(rain) * (1 - 0.5 * heavy), t, 2.2)
    this.near.to(rain > 0 ? 0.9 : 0, t, 2.2)
    this.roar.to(0.055 * heavy * rain, t, 2.6)
    this.hp.to(600 - 150 * heavy, t, 2.5, 1)
    this.lp.to(6500 + 1500 * heavy, t, 2.5, 1)
    if (rain > 0.02) {
      this.amount = rain
      this.heavy = heavy
      this.until = Infinity
    } else if (this.until === Infinity) {
      this.until = t + 6
    }
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    if (this.amount <= 0 || from > this.until) { this.next = from + r(); return }
    if (this.next < from) this.next = from + 0.2 * r()
    while (this.next < to) {
      this.drop(this.next)
      this.next += -Math.log(1 - r()) / (3 + 9 * this.amount)
    }
  }

  // One drop landing close by: a tick on a leaf, or the ring of a bubble in standing water once it pours.
  private drop(t: number): void {
    const ctx = this.rig.ctx
    const r = this.rig.rand
    const o = ctx.createOscillator()
    const amp = 0.012 + 0.05 * r() * r() * r()
    const g = ctx.createGain()
    g.gain.value = 0
    g.gain.setValueAtTime(0, t)
    let end: number
    if (r() < 0.35 * this.heavy) {
      const f = 3200 + 4000 * r()
      o.frequency.setValueAtTime(f, t)
      o.frequency.exponentialRampToValueAtTime(f * 1.08, t + 0.012)
      g.gain.linearRampToValueAtTime(amp * 0.6, t + 0.001)
      g.gain.setTargetAtTime(0, t + 0.001, 0.004)
      end = t + 0.04
    } else {
      const f = 3600 * Math.pow(2, 1.1 * (r() + r() - 1))
      o.frequency.value = f
      const tau = (2.5 + 4 * r()) / f
      g.gain.linearRampToValueAtTime(amp, t + 0.0006)
      g.gain.setTargetAtTime(0, t + 0.0006, tau)
      end = t + 0.0006 + tau * 9
    }
    o.connect(g).connect(panner(ctx, 1.8 * r() - 0.9)).connect(this.out)
    o.start(t)
    o.stop(end)
  }
}

// Low idle and governed working speed of a Farmall H, in turns a minute.
const IDLE_RPM = 450
const WORK_RPM = 1650

// A four-cylinder, four-stroke row-crop tractor heard across the field. One cycle of the engine is two turns of
// the crank and four firings, so the exhaust note is the fourth harmonic of the cycle and its multiples (55 Hz and
// up at work, a 15-a-second putter at idle); the harmonics between them, from cylinders that never fire quite
// alike, give the lope.
export class Engine {
  rig: Rig
  level: Fader
  cycle: Smooth
  firing: Smooth
  drift: ConstantSourceNode
  pan: StereoPannerNode
  load = 0
  next = 0
  nextPan = 0

  constructor(rig: Rig, t: number) {
    const ctx = rig.ctx
    const r = rig.rand
    this.rig = rig
    const K = 160
    const re = new Float32Array(K + 1), im = new Float32Array(K + 1)
    for (let k = 1; k <= K; k++) {
      const share = k % 4 === 0 ? 1 : k % 2 === 0 ? 0.2 : 0.3
      const a = share * (1 - (k / (K + 1)) ** 2)
      const ph = (k % 4 === 0 ? 0.8 : 2 * Math.PI) * r()
      re[k] = a * Math.cos(ph)
      im[k] = a * Math.sin(ph)
    }
    const o = ctx.createOscillator()
    o.setPeriodicWave(ctx.createPeriodicWave(re, im))
    const fire = ctx.createOscillator()
    this.cycle = new Smooth(o.frequency, IDLE_RPM / 120)
    this.firing = new Smooth(fire.frequency, IDLE_RPM / 30)
    // The governor holds the revs within a few percent; they hunt, in cents, on both oscillators together.
    this.drift = ctx.createConstantSource()
    this.drift.offset.value = 0
    this.drift.connect(o.detune)
    this.drift.connect(fire.detune)

    this.level = new Fader(ctx)
    const far = filter(ctx, 'lowpass', 3500, 0.5)
    const pipe = filter(ctx, 'highpass', 45, 0.7)
    o.connect(pipe)
    // An open exhaust is strongest around 125 Hz and falls away above; the engine's casing adds a flatter clatter
    // up to 2 kHz, some 16 dB under it.
    pipe.connect(filter(ctx, 'lowpass', 210, 0.6)).connect(far)
    pipe.connect(filter(ctx, 'lowpass', 1500, 0.5)).connect(gain(ctx, 0.1)).connect(far)

    // A breath of noise at each firing.
    const chuff = gain(ctx, 0.5)
    fire.connect(gain(ctx, 0.5)).connect(chuff.gain)
    wanderingLoop(rig, rig.noise, t, 1).connect(filter(ctx, 'bandpass', 420, 0.7)).connect(chuff).connect(gain(ctx, 0.08)).connect(far)

    this.pan = panner(ctx, 0.2)
    far.connect(this.level.input)
    this.level.output.connect(this.pan).connect(rig.bus)
    o.start(t)
    fire.start(t)
    this.drift.start(t)
  }

  // level 0..1; load 0 is idling, 1 is pulling an implement.
  set(level: number, load: number, t: number): void {
    const v = 0.2 * level
    this.level.to(v, t, v > this.level.value ? 1.2 : 0.9)
    const rpm = IDLE_RPM + (WORK_RPM - IDLE_RPM) * load
    this.cycle.to(rpm / 120, t, 1.2, 0.01)
    this.firing.to(rpm / 30, t, 1.2, 0.01)
    this.load = load
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    if (this.next < from) this.next = from
    while (this.next < to) {
      this.drift.offset.setTargetAtTime((12 + 18 * this.load) * (2 * r() - 1), this.next, 0.35)
      this.next += 0.6 + 2.2 * r()
    }
    if (this.nextPan < from) this.nextPan = from
    while (this.nextPan < to) {
      this.pan.pan.setTargetAtTime(0.9 * r() - 0.4, this.nextPan, 5)
      this.nextPan += 7 + 9 * r()
    }
  }
}

const CRICKETS = 4
// Loudness of each pulse through a chirp, in dB under the loudest: a chirp swells.
const SWELL_DB = [-7.3, -2.4, -0.5, -0.1, -0.1]
// Each gap between pulses is a little longer than the one before.
const STRETCH = [0.89, 1, 1.125, 1.2]

// Fall field crickets: each a nearly pure tone of its own near 4.7 kHz, in chirps of three to five pulses.
// Each cricket keeps its own pace, none keeps time with another, and the pace follows the temperature.
export class Crickets {
  rig: Rig
  level: Fader
  tones: OscillatorNode[] = []
  gates: GainNode[] = []
  hz: number[] = []
  pulses: number[] = []
  pace: number[] = []
  next: number[] = []
  rate = 0
  pulse = 0.05
  // Keeps chirping while the level fades out.
  until = 0

  constructor(rig: Rig, t: number) {
    const ctx = rig.ctx
    const r = rig.rand
    this.rig = rig
    this.level = new Fader(ctx)
    const bus = this.level.input
    this.level.output.connect(rig.bus)
    this.level.output.connect(gain(ctx, 0.2)).connect(rig.verb)
    for (let k = 0; k < CRICKETS; k++) {
      const o = ctx.createOscillator()
      const hz = 4350 + 650 * r()
      o.frequency.value = hz
      const g = gain(ctx, 0)
      // The nearest is the loudest; the rest sit back and to the sides.
      o.connect(g).connect(gain(ctx, k === 0 ? 1 : 0.2 + 0.4 * r())).connect(panner(ctx, k === 0 ? 0.25 : 1.8 * r() - 0.9)).connect(bus)
      o.start(t)
      this.tones.push(o)
      this.gates.push(g)
      this.hz.push(hz)
      const x = r()
      this.pulses.push(x < 0.25 ? 3 : x < 0.93 ? 4 : 5)
      this.pace.push(0.65 + 0.7 * r())
      this.next.push(0)
    }
  }

  set(level: number, chirps: number, pulse: number, t: number): void {
    this.level.to(0.03 * level, t, 2)
    if (level > 0.02) {
      this.rate = chirps
      this.pulse = pulse
      this.until = Infinity
    } else if (this.until === Infinity) {
      this.until = t + 8
    }
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    for (let k = 0; k < CRICKETS; k++) {
      if (this.rate <= 0 || from > this.until) { this.next[k] = from + r(); continue }
      const period = 1 / (this.rate * this.pace[k])
      if (this.next[k] < from) this.next[k] = from + r() * period
      while (this.next[k] < to) {
        const length = this.chirp(k, this.next[k])
        // An irregular chirper: the gaps vary by a fifth, and now and then it stops to listen.
        const n = 2 * (r() + r() + r() - 1.5)
        const rest = r() < 0.03 ? period * (1 + 3 * r()) : 0
        this.next[k] += Math.max(length + 0.12, period * (1 + 0.2 * n)) + rest
      }
    }
  }

  // Schedules one chirp and returns how long it lasts.
  private chirp(k: number, t: number): number {
    const g = this.gates[k].gain
    const f = this.tones[k].frequency
    const hz = this.hz[k]
    const r = this.rig.rand
    // Mostly its usual number of pulses, sometimes one fewer.
    const n = this.pulses[k] - (r() < 0.15 ? 1 : 0)
    const len = 0.41 * this.pulse
    let at = t
    for (let p = 0; p < n; p++) {
      const peak = Math.pow(10, SWELL_DB[p] / 20)
      g.setValueAtTime(0, at)
      g.linearRampToValueAtTime(peak, at + len * 0.4)
      g.linearRampToValueAtTime(peak * 0.7, at + len * 0.75)
      g.linearRampToValueAtTime(0, at + len * 1.25)
      // The pitch sags by about 200 Hz as the wing closes.
      f.setValueAtTime(hz * 1.012, at)
      f.linearRampToValueAtTime(hz * 0.966, at + len * 1.25)
      at += this.pulse * STRETCH[Math.min(p, STRETCH.length - 1)]
    }
    return at - t
  }
}

export type Species = 'sparrow' | 'chickadee' | 'robin' | 'junco'

// Who sings, by month, as weights. The white-throated sparrow is back by May; the chickadee whistles most in spring.
const SONGS: Record<number, [Species, number][]> = {
  3: [['chickadee', 0.5], ['robin', 0.35], ['junco', 0.15]],
  4: [['sparrow', 0.4], ['robin', 0.25], ['junco', 0.2], ['chickadee', 0.15]],
  5: [['sparrow', 0.4], ['robin', 0.25], ['junco', 0.25], ['chickadee', 0.1]],
  6: [['sparrow', 0.4], ['robin', 0.25], ['junco', 0.25], ['chickadee', 0.1]],
}

// Seconds from the end of one song to the start of the next while a bird keeps singing.
const REST: Record<Species, [number, number]> = { sparrow: [5, 10], chickadee: [4, 7], robin: [0.8, 1.5], junco: [4, 9] }

// One whistled note of a robin's phrase: [seconds, gap after it, Hz at the start, Hz at the end].
type Slur = [number, number, number, number]

// One bird: where it is, how far off, and the song that is its own. A bird keeps its song; no two birds share one.
export interface Singer {
  species: Species
  pan: number
  near: number            // 1 is close by; less is further off, quieter and more in the trees
  pitch: number           // Hz: the sparrow's lowest whistle, the chickadee's fee, the centre of the junco's trill
  left: number            // songs before it falls silent and another bird takes over
  rising: boolean         // sparrow: the whistles step up after the first, or down before the triplets
  step: number            // sparrow: the size of that step, as a frequency ratio
  third: boolean          // sparrow: a third long whistle before the triplets
  slurred: boolean        // sparrow: the first whistle is scooped up into
  triplets: number        // sparrow
  rate: number            // junco: notes a second
  count: number           // junco: notes in the trill
  shape: number[]         // junco: the note's path, as ratios of its pitch
  phrases: Slur[][]       // robin: its repertoire
  last: number            // robin: the phrase it sang last
}

export function singer(rig: Rig, species: Species): Singer {
  const r = rig.rand
  const s: Singer = {
    species, pan: 1.6 * r() - 0.8, near: 0.5 + 0.5 * r(), pitch: 0, left: 2 + Math.floor(3 * r()),
    rising: true, step: 1.26, third: false, slurred: false, triplets: 2, rate: 0, count: 0, shape: [], phrases: [], last: -1,
  }
  switch (species) {
    case 'sparrow':
      s.rising = r() < 0.8
      s.pitch = 2800 + 900 * r()
      s.step = Math.pow(2, (1.6 + 3.6 * r()) / 12)
      s.third = r() < 0.35
      s.slurred = r() < 0.5
      s.triplets = 1 + Math.floor(2.4 * r())
      break
    case 'chickadee':
      s.pitch = 3550 + 530 * r()
      s.left = 3 + Math.floor(3 * r())
      break
    case 'junco':
      s.pitch = 4300 + 800 * r()
      s.rate = 8.5 + 5 * r()
      s.count = Math.round(s.rate * (1.2 + 0.5 * r()))
      // A down-slurred note, then a shorter one above it.
      s.shape = [1.22 + 0.1 * r(), 0.84 - 0.06 * r(), 1.02 + 0.12 * r(), 1.1 + 0.14 * r()]
      break
    case 'robin': {
      s.left = 2 + Math.floor(3 * r())
      const n = 8 + Math.floor(6 * r())
      for (let k = 0; k < n; k++) {
        const parts = r() < 0.15 ? 1 : r() < 0.6 ? 2 : 3
        const ph: Slur[] = []
        // Phrases alternate: one mostly rising, the next mostly falling.
        let up = k % 2 === 0
        let f = up ? 1750 + 700 * r() : 2900 + 800 * r()
        for (let j = 0; j < parts; j++) {
          const span = 350 + 950 * r()
          const end = Math.max(1650, Math.min(3900, f + (up ? span : -span)))
          ph.push([0.05 + 0.07 * r(), 0.012 + 0.03 * r(), f, end])
          up = r() < 0.3 ? up : !up
          f = Math.max(1650, Math.min(3900, end + 300 * (2 * r() - 1)))
        }
        s.phrases.push(ph)
      }
      break
    }
  }
  return s
}

interface Lane { far: boolean; next: number; singer: Singer | null }

// Two lanes of song, one near and one far, each a bird singing a bout of its own song and then falling quiet.
// The scene's rate sets how long the quiet lasts: at 5 the near lane rests 8 to 24 seconds between birds.
export class Birds {
  rig: Rig
  out: GainNode
  rate = 0
  month = 5
  lanes: Lane[] = [{ far: false, next: 0, singer: null }, { far: true, next: 0, singer: null }]

  constructor(rig: Rig) {
    const ctx = rig.ctx
    this.rig = rig
    this.out = gain(ctx, 1)
    this.out.connect(filter(ctx, 'lowpass', 8000)).connect(rig.bus)
  }

  set(rate: number, month: number): void {
    this.rate = rate
    this.month = month
  }

  schedule(from: number, to: number): void {
    const r = this.rig.rand
    for (const lane of this.lanes) {
      if (this.rate <= 0) { lane.next = from + 1 + 3 * r(); lane.singer = null; continue }
      const quiet = () => ((lane.far ? 14 + 26 * r() : 8 + 16 * r()) * 5) / this.rate
      if (lane.next < from) lane.next = from + 0.5 + (lane.far ? 0.6 : 0.15) * quiet()
      while (lane.next < to) {
        if (!lane.singer || lane.singer.left <= 0) lane.singer = this.arrive(lane.far)
        const s = lane.singer
        s.left--
        const end = lane.next + song(this.rig, this.out, lane.next, s)
        const [lo, hi] = REST[s.species]
        // Within a bout the bird keeps its own pace; then the lane falls quiet for a while.
        lane.next = end + (s.left > 0 ? lo + (hi - lo) * r() : quiet())
      }
    }
  }

  private arrive(far: boolean): Singer {
    const r = this.rig.rand
    const pool = SONGS[this.month] ?? SONGS[5]
    let x = r() * pool.reduce((a, p) => a + p[1], 0)
    let species = pool[0][0]
    for (const [sp, w] of pool) { if ((x -= w) <= 0) { species = sp; break } }
    const s = singer(this.rig, species)
    if (far) s.near *= 0.45
    return s
  }
}

// One whistled note: a pure tone following a pitch path of [seconds after start, Hz] points, with a trace of
// second harmonic and no corners in its loudness.
function note(rig: Rig, out: AudioNode, t: number, dur: number, path: [number, number][], amp: number, edge = 0.025): void {
  const ctx = rig.ctx
  const g = ctx.createGain()
  const e = Math.min(edge, dur * 0.4)
  swell(g.gain, t, dur, amp, e, e)
  g.connect(out)
  for (const [mul, level] of [[1, 1], [2, 0.03]]) {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(path[0][1] * mul, t)
    for (let i = 1; i < path.length; i++) o.frequency.linearRampToValueAtTime(path[i][1] * mul, t + path[i][0])
    if (level === 1) o.connect(g); else o.connect(gain(ctx, level)).connect(g)
    o.start(t)
    o.stop(t + dur + 0.02)
  }
}

// Sings one song of this bird and returns how long it lasts. No two renditions are quite alike.
export function song(rig: Rig, out: AudioNode, t: number, s: Singer): number {
  const ctx = rig.ctx
  const r = rig.rand
  const o = gain(ctx, 0.5 * (0.3 + 0.7 * s.near))
  o.connect(panner(ctx, s.pan)).connect(out)
  // Further off, more of the song comes back from the trees.
  o.connect(gain(ctx, 0.2 + 0.6 * (1 - s.near))).connect(rig.verb)
  const p = s.pitch * (1 + 0.003 * (2 * r() - 1))
  const about = (x: number, by: number) => x * (1 + by * (2 * r() - 1))
  switch (s.species) {
    case 'sparrow': {
      // White-throated sparrow: two or three long, steady whistles with one step in pitch between them, then
      // triplets ("Old Sam Peabody, Peabody"). Rising in most Maine birds; falling in a few.
      const high = p * s.step
      const leads = s.rising ? [p, high] : [high * 1.06, high]
      if (s.third) leads.push(s.rising ? high : p)
      const body = s.rising ? high : p
      let at = t
      leads.forEach((hz, k) => {
        const d = about([0.72, 0.58, 0.43][k], 0.07)
        const scoop = k === 0 && s.slurred ? 0.94 : 0.995
        note(rig, o, at, d, [[0, hz * scoop], [0.06, hz], [d, hz * (1 + 0.003 * (2 * r() - 1))]], 0.05, 0.03)
        at += d + about(k === 0 ? 0.19 : 0.16, 0.12)
      })
      // The last triplet is sometimes left off.
      const n = Math.max(1, s.triplets - (s.triplets > 1 && r() < 0.2 ? 1 : 0))
      for (let k = 0; k < n; k++) {
        // The triplets sink by about half a semitone over the song.
        const hz = body * (0.985 - 0.012 * k)
        const part = about(0.115, 0.06)
        for (let j = 0; j < 3; j++) {
          note(rig, o, at, part, [[0, hz], [part, hz * (1 - 0.004 * r())]], 0.047 - k * 0.004, 0.016)
          at += part + 0.014
        }
        at += about(0.07, 0.15)
      }
      return at - t
    }
    case 'chickadee': {
      // Black-capped chickadee: "fee-bee". The fee slides down about a semitone in its first half; the bee sits
      // a little over two semitones under the end of the fee, with a catch in the middle.
      const fee = about(0.34, 0.06), gap = about(0.125, 0.12), bee = about(0.37, 0.06)
      const end = p / 1.056
      note(rig, o, t, fee, [[0, p], [0.184, end], [fee, end]], 0.05, 0.04)
      const b = end / 1.134
      const at = t + fee + gap
      note(rig, o, at, bee * 0.47, [[0, b], [bee * 0.47, b]], 0.046, 0.03)
      note(rig, o, at + bee * 0.53, bee * 0.47, [[0, b], [bee * 0.47, b * 0.995]], 0.044, 0.03)
      return fee + gap + bee
    }
    case 'robin': {
      // American robin: carolled phrases of two or three slurred whistles from its own repertoire, about two
      // phrases a second, in a group of three to seven.
      let at = t
      const n = 3 + Math.floor(r() * 5)
      for (let k = 0; k < n; k++) {
        // Mostly the other kind of phrase from the last one, so the song rocks up and down.
        let i = Math.floor(r() * s.phrases.length)
        if (s.last >= 0 && (i % 2 === s.last % 2) && r() < 0.75) i = (i + 1) % s.phrases.length
        if (i === s.last) i = (i + 2) % s.phrases.length
        s.last = i
        const start = at
        for (const [d, rest, f0, f1] of s.phrases[i]) {
          note(rig, o, at, d, [[0, f0], [d, f1]], 0.046, 0.016)
          at += d + rest
        }
        at = Math.max(at + 0.25, start + about(0.5, 0.12))
      }
      return at - t
    }
    case 'junco': {
      // Dark-eyed junco: an even, ringing trill of one two-part note repeated for a second and a half.
      const step = 1 / s.rate
      const [a0, a1, b0, b1] = s.shape
      const n = s.count + Math.round(2 * r() - 1)
      for (let k = 0; k < n; k++) {
        const amp = 0.042 * Math.min(1, 0.45 + k / 5)
        const at = t + k * step * (1 + 0.01 * (2 * r() - 1))
        note(rig, o, at, step * 0.4, [[0, p * a0], [step * 0.4, p * a1]], amp, 0.008)
        note(rig, o, at + step * 0.42, step * 0.26, [[0, p * b0], [step * 0.26, p * b1]], amp * 0.7, 0.008)
      }
      return n * step
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
    this.crickets.set(s.crickets, s.chirps, s.pulse, t)
    this.birds.set(s.birds, s.month)
  }

  setEngine(level: number, load: number, t: number): void {
    this.engine.set(level, load, t)
  }

  schedule(from: number, to: number): void {
    this.wind.schedule(from, to)
    this.rain.schedule(from, to)
    this.engine.schedule(from, to)
    this.crickets.schedule(from, to)
    this.birds.schedule(from, to)
  }
}
