// Work you can hear: felling, stone picking, brush cutting and its fire, building, and barrels coming in. Each kind
// is far off and dull while it is only going on somewhere on the farm, and comes close when the player has picked
// the person doing it or the place it is done. Made of the same single blows as the cues (farmstead.ts), played
// in the bouts and rests of a person working.
import { vary } from './cues.ts'
import { barrelRoll, chop, hammer, plank, sawStroke, snap, stone, swish, treeFall } from './farmstead.ts'
import { Fader, Glide, Smooth, filter, gain, noiseSource, panner, strike, texture, tick, wanderingLoop, type Rig } from './synth.ts'

export type WorkKind = 'fell' | 'rocks' | 'brush' | 'build' | 'barrels'

// How present each kind of work is: 0 not going on, FAR going on somewhere, NEAR at the person or place picked.
export type WorkScene = Record<WorkKind, number>

export const FAR = 0.3
export const NEAR = 1
export const NO_WORK: WorkScene = { fell: 0, rocks: 0, brush: 0, build: 0, barrels: 0 }

// One kind of work: where it sits, how near it sounds, and when its next sound is due.
class Site {
  rig: Rig
  level: Fader
  top: Smooth
  out: GainNode
  amount = 0
  next = 0
  // Carries on for a moment while the level fades out.
  until = 0

  constructor(rig: Rig, pan: number) {
    const ctx = rig.ctx
    this.rig = rig
    this.out = gain(ctx, 1)
    this.level = new Fader(ctx)
    // Far off, the top of a sound is lost before the rest.
    const air = filter(ctx, 'lowpass', 1800, 0.5)
    this.top = new Smooth(air.frequency, 1800)
    const side = panner(ctx, pan)
    this.out.connect(air).connect(this.level.input)
    this.level.output.connect(side).connect(rig.bus)
    side.connect(gain(ctx, 0.3)).connect(rig.verb)
  }

  set(amount: number, t: number): void {
    this.level.to(amount <= 0 ? 0 : amount >= 0.9 ? 0.45 : 0.13, t, 0.7)
    if (amount > 0.02) {
      this.top.to(amount >= 0.9 ? 9000 : 1800, t, 0.6, 1)
      this.amount = amount
      this.until = Infinity
    } else if (this.until === Infinity) {
      this.until = t + 1.2
    }
  }

  // True while there is work to sound in the stretch that starts at `from`; otherwise keeps `next` just ahead.
  on(from: number): boolean {
    if (this.amount > 0 && from <= this.until) return true
    this.next = from + 0.3 + 0.7 * this.rig.rand()
    if (from > this.until) this.amount = 0
    return false
  }
}

type Felling = 'axe' | 'saw' | 'fall'
type Raising = 'nail' | 'saw' | 'board'

export class Work {
  rig: Rig
  sites: Record<WorkKind, Site>
  private felling: Felling = 'saw'
  private fellLeft = 0
  private bouts = 0
  private raising: Raising = 'saw'
  private raiseLeft = 0
  private nails = 0
  private sunk = 0
  private swings = 0
  private roar: Glide | null = null
  private nextFlare = 0
  private nextSpit = 0

  constructor(rig: Rig) {
    this.rig = rig
    // Each kind keeps a side of its own, so two going on at once can be told apart.
    this.sites = {
      fell: new Site(rig, -0.5), rocks: new Site(rig, 0.35), brush: new Site(rig, 0.55), build: new Site(rig, -0.25), barrels: new Site(rig, 0.15),
    }
  }

  set(w: WorkScene, t: number): void {
    for (const k of Object.keys(this.sites) as WorkKind[]) this.sites[k].set(w[k], t)
  }

  schedule(from: number, to: number): void {
    this.fell(from, to)
    this.rocks(from, to)
    this.brush(from, to)
    this.build(from, to)
    this.barrels(from, to)
  }

  // An axe to open the notch, the crosscut for the back cut, and every few bouts a tree comes down.
  private fell(from: number, to: number): void {
    const s = this.sites.fell, rig = this.rig, r = rig.rand
    if (!s.on(from)) { this.fellLeft = 0; return }
    if (s.next < from) s.next = from + 0.2 * r()
    while (s.next < to) {
      if (this.fellLeft <= 0) {
        this.bouts++
        this.felling = this.bouts % 5 === 0 ? 'fall' : this.felling === 'axe' ? 'saw' : 'axe'
        this.fellLeft = this.felling === 'axe' ? 4 + Math.floor(3 * r()) : this.felling === 'saw' ? 12 + Math.floor(10 * r()) : 1
        // Straightening up to look at the cut.
        s.next += 1.2 + 2.3 * r()
        continue
      }
      this.fellLeft--
      if (this.felling === 'axe') {
        // An axeman's working pace: about thirty-five blows a minute.
        chop(rig, s.out, s.next, vary(rig, 0.8, 0.2))
        s.next += vary(rig, 1.7, 0.1)
      } else if (this.felling === 'saw') {
        // The crosscut: about sixty strokes each way a minute, the pull a little lower and softer than the push.
        const push = this.fellLeft % 2 === 0
        const dur = vary(rig, 0.42, 0.08)
        sawStroke(rig, s.out, s.next, dur, push ? 0.28 : 0.2, push ? 1150 : 950, 50)
        s.next += dur + 0.07
      } else {
        s.next = treeFall(rig, s.out, s.next + 0.6, 0.6) + 1.5
      }
    }
  }

  // Stones thrown on the stone boat, one or two at a time, and now and then the boat dragged on.
  private rocks(from: number, to: number): void {
    const s = this.sites.rocks, rig = this.rig, r = rig.rand
    if (!s.on(from)) return
    if (s.next < from) s.next = from + 0.3 * r()
    while (s.next < to) {
      if (r() < 0.07) {
        // The boat dragged on: its runners over stony ground.
        const g = strike(rig.ctx, s.next, 0.3, 0.25, 0.3)
        const n = noiseSource(rig, s.next)
        n.connect(filter(rig.ctx, 'bandpass', 320, 0.8)).connect(g.g).connect(s.out)
        n.stop(g.end)
        for (let k = 0; k < 5; k++) stone(rig, s.out, s.next + 0.1 + 0.9 * r(), 0.25, true)
        s.next += 2.2 + 1.5 * r()
        continue
      }
      stone(rig, s.out, s.next, vary(rig, 0.8, 0.25), r() < 0.62)
      if (r() < 0.3) stone(rig, s.out, s.next + 0.09 + 0.1 * r(), 0.3, true)
      s.next += 1.1 + 2.4 * r()
    }
  }

  // The brush hook in bouts, and the pile burning: a low breathing roar under a steady crackle with a spit now and
  // then.
  private brush(from: number, to: number): void {
    const s = this.sites.brush, rig = this.rig, ctx = rig.ctx, r = rig.rand
    if (!s.on(from)) return
    if (!this.roar) {
      const flame = gain(ctx, 0.2)
      wanderingLoop(rig, rig.noise, from, 0.97).connect(filter(ctx, 'lowpass', 420, 0.6)).connect(filter(ctx, 'highpass', 90)).connect(flame).connect(s.out)
      this.roar = new Glide(flame.gain, 0.2)
      // Sparks and small sticks letting go: most of them faint, a few sharp.
      const sparks = texture(rig, 8.3, 60, (add, sr, rand) => {
        tick(add, sr, rand, 0, 2200 + 4200 * rand(), 0.9, 0.0015 + 0.004 * rand(), 0.08 + 0.92 * rand() * rand() * rand())
      })
      for (const rate of [1, 0.83]) wanderingLoop(rig, sparks, from, rate).connect(gain(ctx, 0.3)).connect(s.out)
    }
    if (this.nextFlare < from) this.nextFlare = from
    while (this.nextFlare < to) {
      const at = this.nextFlare + 0.8 + 2 * r()
      this.roar.to(0.12 + 0.2 * r(), this.nextFlare, at)
      this.nextFlare = at
    }
    // A knot letting go, with some body to it.
    if (this.nextSpit < from) this.nextSpit = from + 2 * r()
    while (this.nextSpit < to) {
      snap(rig, s.out, this.nextSpit, 0.12 + 0.2 * r())
      this.nextSpit += 1 + 5 * r()
    }
    if (s.next < from) s.next = from + r()
    while (s.next < to) {
      if (this.swings <= 0) {
        this.swings = 3 + Math.floor(5 * r())
        s.next += 2 + 4 * r()
        continue
      }
      this.swings--
      swish(rig, s.out, s.next, vary(rig, 0.5, 0.2))
      snap(rig, s.out, s.next + 0.12, vary(rig, 0.4, 0.3))
      if (r() < 0.4) snap(rig, s.out, s.next + 0.17, 0.2)
      s.next += vary(rig, 0.85, 0.15)
    }
  }

  // Nails driven, each blow higher than the last; boards cut with the hand saw; a board dropped on the stack.
  private build(from: number, to: number): void {
    const s = this.sites.build, rig = this.rig, r = rig.rand
    if (!s.on(from)) { this.raiseLeft = 0; return }
    if (s.next < from) s.next = from + 0.2 * r()
    while (s.next < to) {
      if (this.raiseLeft <= 0) {
        if (this.raising === 'nail' && this.nails < 2 + Math.floor(3 * r())) {
          this.nails++
        } else {
          this.nails = 0
          this.raising = this.raising === 'saw' ? 'nail' : r() < 0.3 ? 'board' : 'saw'
        }
        this.raiseLeft = this.raising === 'nail' ? 4 + Math.floor(3 * r()) : this.raising === 'saw' ? 10 + Math.floor(8 * r()) : 1
        this.sunk = 0
        s.next += this.raising === 'nail' && this.nails > 0 ? 0.6 + 0.8 * r() : 1 + 2 * r()
        continue
      }
      const total = this.raiseLeft + this.sunk
      this.raiseLeft--
      if (this.raising === 'nail') {
        hammer(rig, s.out, s.next, vary(rig, 0.8, 0.15), total > 1 ? this.sunk / (total - 1) : 1)
        this.sunk++
        s.next += vary(rig, 0.36, 0.08)
      } else if (this.raising === 'saw') {
        // A hand saw: short and quick, cutting on the push.
        const push = this.raiseLeft % 2 === 0
        const dur = push ? vary(rig, 0.24, 0.08) : vary(rig, 0.18, 0.08)
        sawStroke(rig, s.out, s.next, dur, push ? 0.22 : 0.09, push ? 2300 : 1900, 400)
        s.next += dur + 0.03
      } else {
        plank(rig, s.out, s.next, vary(rig, 0.8, 0.2))
        s.next += 0.8 + r()
      }
    }
  }

  // Barrels let down the ramp into the potato house.
  private barrels(from: number, to: number): void {
    const s = this.sites.barrels, rig = this.rig, r = rig.rand
    if (!s.on(from)) return
    if (s.next < from) s.next = from + 0.5 + r()
    while (s.next < to) s.next = barrelRoll(rig, s.out, s.next, vary(rig, 0.5, 0.2)) + 1.5 + 4.5 * r()
  }
}
