// The staging of the work that is done at one place by whoever is at it: felling, picking rocks, cutting brush,
// building, hauling the crop in, watering from the reel or the pond, grading in the packing shed. Each puts its people
// where the work wants them, gives them the motions of it, and draws what the work needs around them.
import { Color, Vector3 } from 'three'
import type { BuildingKind, JobKind } from '../sim/index.ts'
import { DRAUGHT, GREY_HORSE, HORSE, drawBeast, withers } from './animals.ts'
import { COLORS, Pose, STAND_HIP, forking, hammering, lifting, sawing, stand, stoop, swing, walk, type Dress } from './crew.ts'
import { FIELDS, route, siteOf } from './layout.ts'
import type { Particles } from './particles.ts'
import type { Prims } from './prims.ts'
import type { StandTree } from './flora.ts'
import type { Snapshot } from './state.ts'
import { LOAD, Poly, buildSite, cropDoor, heightAt, packSite, siteAt, type Pt, type Spot } from './work.ts'

export interface Worker {
  id: number
  dress: Dress
  tired: number
  w: number                // how far through this part of the day's work, 0..1
  // Set by the stage: where the figure stands, how it holds itself, and the machine it has charge of.
  x: number
  z: number
  heading: number
  lift: number             // height above the ground
  pose: Pose
  aboard: boolean          // in the seat of its machine
  // fade: below 1 while the machine goes from sight where a drive is cut (it is next seen coming in at the far end)
  rig: { x: number; z: number; heading: number; load: number; fade?: number } | null
  loads: number            // hauling: how many loads the day's part of it comes to
  lit: boolean             // this part of the day was planned with the clock stopped
}

export interface StageFrame {
  pr: Prims
  particles: Particles
  dt: number
  time: number
  s: number                // how much larger than life things are drawn, so they read from far off
  snap: Snapshot
  wind: number             // 0 still .. 1 and more, a strong wind
  cold: boolean            // snow on the ground
  still: boolean           // reduced motion
  going: boolean           // the work is going on (the clock runs, or the day is being played out)
  stand: (field: number) => StandTree[]   // a tract's trees in the order they are felled (the land's own)
  pace: number             // metres a second a machine at work is seen to go (its own pace when the day is literal)
  lane: number             // and a machine on the lane
  literal: boolean         // the clock is stopped and the day's work goes at its own pace
  dry: boolean             // dry ground: what is dragged over it raises dust
  day: number              // how long a day lasts on the clock, seconds
  far: (x: number, z: number) => number   // 0 seen from close by .. 1 from across the farm, where smoke is what is found
}

interface Site {
  kind: string
  field: number
  spot: Spot
  t: number
  seen: number
  load: number
  n: number
  at: Map<number, { x: number; z: number; walking: boolean; seen: number }>
  trip: Poly | null
  ph: number
  piles: [number, number]  // stones put off at each end of the field
  falls: Fall[]            // trees coming down and lying to be limbed
  held: number             // of them, how many the land is asked to leave standing a moment longer
  job: Map<number, Doing>  // what each one is at, where the work is more than a place to stand
  // the stone boat: where it is, which way it is going, the line it is making for; 0 going on, 1 standing, 2 unloading
  bx: number
  bz: number
  tz: number
  dir: number
  mode: number
  pt: number
}

interface Doing { ph: number; t: number; x: number; z: number; n: number }

// How far a job on a field had got by the day's end, 0..1 (below zero when nobody's day says).
function shareOf(snap: Snapshot, kind: string, field: number): number {
  let p = -1
  for (const u of snap.units) for (const w of u.worked) if (w.kind === kind && w.field === field && w.share !== undefined) p = Math.max(p, w.share)
  return p
}

// A lap of hauling with the clock running, as shares of it: standing to load (and again to unload), and when the
// door is reached.
const LAP_STAND = 0.18, LAP_DOOR = 0.5
// How far past a field's end the stones are put off: beyond where the tractors turn.
const HEAP_OUT = 13

interface Fall { x: number; z: number; h: number; conifer: boolean; bush: boolean; t: number; side: number; down: boolean }

const Y = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0)
const a = new Vector3(), b = new Vector3(), c = new Vector3(), d = new Vector3(), e = new Vector3(), g = new Vector3()
const SPRUCE = new Color('#1f3a2a'), ALDER = new Color('#51683a'), ALDER_DARK = new Color('#3f5632'), WHITE = new Color(1, 1, 1), SLED = new Color('#6f5a41'), CHAIN = new Color('#2b2b2a')
const FLAME = [new Color(7, 2.4, 0.5), new Color(8, 4.2, 0.9), new Color(5, 1.2, 0.3)], EMBER = new Color('#2a1c14'), WATER = new Color('#cfe0ea')
const ORANGE = new Color('#b8642a'), DRUM = new Color('#23262a'), GRAVEL = new Color('#8f8a80'), HARDWOOD = new Color('#4f6a34'), HARDWOOD_DARK = new Color('#3c5229')

const ease = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
const span = (lo: number, hi: number, t: number) => clamp01((t - lo) / (hi - lo))
const frac = (t: number) => t - Math.floor(t)
const hash = (n: number) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453)

export class Stage {
  private sites = new Map<string, Site>()
  private frame = 0
  // A tree has come down: how hard, and where, for whoever shakes the camera.
  thud = 0
  readonly thudAt = new Vector3()

  // Where someone last stood at a piece of work, if they have been at it: the way back to it ends there.
  // A load is on, or going on, or coming off: the trip in hand is seen through to the potato house door.
  tripOpen(key: string, id: number): boolean {
    const j = this.sites.get(key)?.job.get(id)
    return !!j && j.t > 0.02 && j.t < LAP_DOOR + LAP_STAND
  }

  placeOf(key: string, id: number): Pt | null {
    const m = this.sites.get(key)?.at.get(id)
    return m ? { x: m.x, z: m.z } : null
  }

  // The land's hold on trees counted as felled: how many of a tract's last ones to leave standing.
  hold: (field: number, n: number) => void = () => {}

  begin(): void {
    this.frame++
    this.thud = 0
    for (const [key, s] of this.sites) {
      // (nobody at the felling any more: the land has its trees back)
      if (s.held && this.frame - s.seen > 1) { s.held = 0; this.hold(s.field, 0) }
      if (this.frame - s.seen > 600) this.sites.delete(key)
    }
  }

  clear(): void {
    for (const s of this.sites.values()) if (s.held) this.hold(s.field, 0)
    this.sites.clear()
  }

  // Everyone at one piece of work this frame. `kind` is the job, or 'pack', 'reel' and 'pipe' for those ways of working.
  work(key: string, kind: string, field: number, ws: Worker[], f: StageFrame): void {
    let st = this.sites.get(key)
    if (!st) {
      const spot = kind === 'build' || kind === 'pack' ? this.yardSpot(kind, field, f.snap) : siteAt((kind === 'reel' || kind === 'pipe' ? 'haul' : kind) as JobKind, field)
      st = { kind, field, spot, t: hash(field + kind.length) * 20, seen: this.frame, load: 0, n: kind === 'fell' ? -1 : 0, at: new Map(), trip: null, ph: 0, piles: [3, 0], falls: [], held: 0, job: new Map(), bx: 0, bz: 0, tz: 0, dir: 1, mode: 0, pt: 0 }
      this.sites.set(key, st)
    }
    st.seen = this.frame
    if (f.going) st.t += f.dt
    switch (kind) {
      case 'fell': this.fell(st, ws, f); break
      case 'rocks': this.rocks(st, ws, f); break
      case 'brush': this.brush(st, ws, f); break
      case 'build': this.build(st, ws, f); break
      case 'haul': this.haul(st, ws, f); break
      case 'reel': case 'pipe': this.water(st, ws, f); break
      case 'pack': this.pack(st, ws, f); break
    }
  }

  private yardSpot(kind: string, yard: number, snap: Snapshot): Spot {
    if (kind === 'pack') return packSite()
    const b = snap.farm.buildings.find(x => !x.built && x.yard === yard)
    return buildSite(b ? b.kind : 'shed', yard)
  }

  // ---- helpers: the site's own space (x ahead of the spot, z to its right), scaled with everything on it.

  private local(st: Site, s: number, lx: number, lz: number, out: Pt): Pt {
    const h = st.spot.heading, ch = Math.cos(h), sh = Math.sin(h)
    out.x = st.spot.x + (ch * lx - sh * lz) * s
    out.z = st.spot.z + (sh * lx + ch * lz) * s
    return out
  }

  private P(st: Site, s: number, lx: number, ly: number, lz: number, out: Vector3): Vector3 {
    this.local(st, s, lx, lz, PT)
    return out.set(PT.x, heightAt(PT.x, PT.z) + ly * s, PT.z)
  }

  // Walks a worker to a place on the site and faces them; true once they are there.
  private go(st: Site, w: Worker, f: StageFrame, lx: number, lz: number, facing: number, load = 0): boolean {
    this.local(st, f.s, lx, lz, PT)
    return this.goTo(st, w, f, PT.x, PT.z, st.spot.heading + facing, load)
  }

  // The same to a place in the world, to face `heading` there.
  private goTo(st: Site, w: Worker, f: StageFrame, x: number, z: number, heading: number, load = 0): boolean {
    PT.x = x
    PT.z = z
    let m = st.at.get(w.id)
    if (!m) { m = { x: w.x, z: w.z, walking: false, seen: 0 }; st.at.set(w.id, m) }
    // (back at the work after being away from it: from where they now are)
    if (m.seen < this.frame - 1) { m.x = w.x; m.z = w.z }
    m.seen = this.frame
    const dx = PT.x - m.x, dz = PT.z - m.z, dist = Math.hypot(dx, dz)
    if (dist > 150) { m.x = PT.x; m.z = PT.z }
    m.walking = dist > (m.walking ? 0.06 : 0.4) * f.s
    if (m.walking) {
      // (a long way to their own part of the work is hurried over)
      const step = Math.min(dist, (f.going ? Math.max(1.5 * f.s * (1 - 0.4 * w.tired), dist > 14 ? Math.min(dist * 0.9, f.pace * 1.5) : 0) : 0) * f.dt)
      m.x += (dx / dist) * step
      m.z += (dz / dist) * step
      w.heading = Math.atan2(dz, dx)
      walk(w.pose, st.t * 9 + w.id, 1, w.tired, load)
    } else w.heading = heading
    w.x = m.x
    w.z = m.z
    w.lift = 0
    return !m.walking
  }

  // A point of the world in a worker's own space, for a hand to reach.
  private reach(w: Worker, s: number, world: Vector3, out: Vector3): Vector3 {
    const fs = s * w.dress.tall, ch = Math.cos(w.heading), sh = Math.sin(w.heading)
    const dx = world.x - w.x, dz = world.z - w.z
    return out.set((dx * ch + dz * sh) / fs, (world.y - heightAt(w.x, w.z) - w.lift * s) / fs, (-dx * sh + dz * ch) / fs)
  }

  private puff(f: StageFrame, at: Vector3, n: number, spread: number, r: number, g: number, bl: number, alpha: number, life = 1.4, rise = 0.5, size = 0.22): void {
    if (f.still) return
    for (let k = 0; k < n; k++) {
      const q = Math.random
      f.particles.emit(at.x + (q() - 0.5) * spread, at.y + q() * 0.1 + size * 0.5, at.z + (q() - 0.5) * spread, (q() - 0.5) * 0.8, rise * (0.4 + q()), (q() - 0.5) * 0.8, size, size * 2.2, life * (0.6 + q() * 0.8), r, g, bl, alpha, 0.6)
    }
  }

  // ---- felling

  // Felling is done at the land's own trees. The stand is the land writer's (its trees in the order they come down);
  // the people work at the next one still standing, and each tree the land takes away as the day's felling is counted
  // falls here in its place, is limbed where it lies, and is left to the land's own stems, stumps and slash.
  private fell(st: Site, ws: Worker[], f: StageFrame): void {
    const pr = f.pr, s = f.s
    const fv = f.snap.fields[st.field]
    const brushy = fv?.cover === 'brush'
    const trees = f.stand(st.field)
    const n = trees.length
    const share = fv && (fv.cover === 'woods' || fv.cover === 'brush') ? Math.max(0, Math.min(1, fv.felled)) : 1
    const cut = Math.round(share * n)
    if (st.n < 0 || cut < st.n) st.n = cut
    // those the land has just taken down: the last few fall here, one after another
    if (cut > st.n) {
      for (let k = Math.max(st.n, cut - 3); k < cut; k++) st.falls.push({ x: trees[k].x, z: trees[k].z, h: this.tall(trees[k]), conifer: trees[k].conifer, bush: trees[k].bush, t: -0.7 * (k - Math.max(st.n, cut - 3)), side: k % 2 ? 1 : -1, down: false })
      st.n = cut
    }
    // The land leaves its own tree standing until the one drawn here begins to go.
    const waiting = st.falls.reduce((k, t) => k + (t.t < 0 ? 1 : 0), 0)
    if (waiting !== st.held) { st.held = waiting; this.hold(st.field, waiting) }
    // The work stands before the next tree to come down, facing into the stand.
    const next = n ? trees[Math.min(cut, n - 1)] : null
    const h = brushy ? 0 : -Math.PI / 2
    if (next) st.spot = { x: next.x - Math.cos(h) * 1.0 * s, z: next.z - Math.sin(h) * 1.0 * s, heading: h }
    const tx = 1.0, tz = 0
    for (const t of st.falls) {
      if (f.going) t.t += f.dt
      if (t.t < 0) continue
      const fall = Math.pow(span(0, 1.5, t.t), 2.4), limbed = span(2.2, 5.5, t.t), ang = fall * (Math.PI / 2 - 0.04)
      a.set(t.x, heightAt(t.x, t.z), t.z)
      // away from the standing timber, a little to one side
      d.set(-Math.cos(h) + t.side * 0.5 * Math.sin(h), 0, -Math.sin(h) - t.side * 0.5 * Math.cos(h)).normalize()
      b.copy(Y).multiplyScalar(Math.cos(ang)).addScaledVector(d, Math.sin(ang))
      this.tree(pr, t, a, b, limbed)
      if (!t.down && t.t >= 1.5) {
        // down: the crash, needles and dust (snow in winter) thrown up all along it
        t.down = true
        for (let k = 0; k < 5; k++) {
          c.copy(a).addScaledVector(d, (0.25 + 0.17 * k) * t.h)
          if (f.cold) this.puff(f, c, 4, 2.4, 0.9, 0.93, 0.97, 0.5, 2.6, 1.2, 1.6)
          else this.puff(f, c, 3, 2.4, 0.5, 0.44, 0.33, 0.2, 2.4, 1.2, 1.1)
        }
        if (!t.bush) { this.thud = 1; this.thudAt.copy(a) }
      }
    }
    st.falls = st.falls.filter(t => t.t < 6)
    const falling = st.falls.find(t => t.t >= -0.3 && t.t < 2.1), lying = st.falls.find(t => t.t >= 2.1)
    // The slash is burnt on the cut ground behind the work as it comes off, as cut brush is, except in a high wind,
    // in the wet or on snow: from across the farm the smoke shows where the felling is.
    if (ws.length) this.fire(st, f, -5.2, 2.6, f.going && f.wind < 0.85 && !f.cold && f.snap.weather.prcp < 1)
    // the people
    const pair = ws.length >= 2 && !brushy
    ws.forEach((w, k) => {
      w.rig = null
      w.aboard = false
      if (k <= 1 && (k === 0 || pair)) {
        if (falling) {
          // stand clear and watch it go
          if (this.go(st, w, f, tx - 2.2, tz + (k ? 1.4 : -1.2), 0.2)) stand(w.pose, st.t, w.tired, k ? 3 : 0)
        } else if (lying) {
          // limbing: along the trunk with the axe
          const at = 0.25 + 0.3 * k
          d.set(-Math.cos(h) + lying.side * 0.5 * Math.sin(h), 0, -Math.sin(h) - lying.side * 0.5 * Math.cos(h)).normalize()
          if (this.goTo(st, w, f, lying.x + d.x * lying.h * at - d.z * 0.9, lying.z + d.z * lying.h * at + d.x * 0.9, Math.atan2(d.x, -d.z))) {
            const u = frac(st.t / 1.05 + k * 0.5)
            swing(w.pose, u < 0.55 ? 1 - ease(u / 0.55) : u < 0.68 ? (u - 0.55) / 0.13 : 1, true)
            w.pose.tool = brushy ? 'hook' : 'axe'
          }
        } else if (pair) {
          // a crosscut saw between two: one pulls as the other gives
          const sd = k === 0 ? -1 : 1
          if (this.go(st, w, f, tx, tz + sd * 0.74, -sd * Math.PI / 2)) {
            const x = Math.sin(st.t * 5.4) * (k === 0 ? 1 : -1)
            sawing(w.pose, x, 0.21)
            if (k === 0) {
              const dz = 0.09 * Math.sin(st.t * 5.4)
              this.P(st, s, tx, 0.22, tz - 0.52 + dz, c)
              this.P(st, s, tx, 0.22, tz + 0.52 + dz, e)
              pr.put('box', c, d.subVectors(e, c), Y, 0.075 * s, c.distanceTo(e), 0.006 * s, COLORS.STEEL)
              if (!f.still && Math.random() < 0.3) { this.P(st, s, tx, 0.2, tz, c); f.particles.emit(c.x, c.y, c.z, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4, 0.03 * s, 0.1, 0.7, 0.78, 0.66, 0.45, 0.5, 0.2) }
            }
          }
        } else if (this.go(st, w, f, tx - 0.47, tz + 0.1, 0)) {
          const u = frac(st.t / (brushy ? 0.95 : 1.25) + w.id * 0.37)
          const kk = u < 0.5 ? 1 - ease(u / 0.5) : u < 0.62 ? Math.pow((u - 0.5) / 0.12, 1.5) : 1
          swing(w.pose, kk, false, brushy ? 0.3 : 0.12)
          w.pose.tool = brushy ? 'hook' : 'axe'
          if (!f.still && u > 0.6 && u < 0.66) { this.P(st, s, tx - 0.06, 0.3, tz, c); f.particles.emit(c.x, c.y, c.z, -0.5 + Math.random() * 0.3, 0.5, (Math.random() - 0.5), 0.025 * s, 0.05, 0.6, 0.8, 0.68, 0.46, 0.8, 0.1) }
        }
      } else if (k === 2 || (k === 1 && !pair)) {
        // bucking a log on the cut ground behind
        if (this.go(st, w, f, -3.0, -2.4, 0)) {
          const u = frac(st.t / 1.1 + 0.3)
          swing(w.pose, u < 0.55 ? 1 - ease(u / 0.55) : u < 0.68 ? (u - 0.55) / 0.13 : 1, true)
          w.pose.tool = 'axe'
        }
        this.P(st, s, -2.45, 0.07, -3.4, c)
        this.P(st, s, -2.45, 0.07, -1.4, e)
        pr.put('log', c, d.subVectors(e, c), Y, 0.15 * s, c.distanceTo(e), 0.15 * s, WHITE)
      } else {
        // dragging the tops to a brush pile
        const u = frac(st.t / 9 + k * 0.31)
        const out = u < 0.5
        if (this.go(st, w, f, out ? -0.6 : -4.2, out ? 2.6 : -5.2 - 0.6 * (k % 2), 0, out ? 0 : 1) && out) stoop(w.pose.reset(), 0.9, st.t * 3)
        if (!out) w.pose.held = 'brush'
      }
    })
    if (brushy) return
    // The team: a log on the chain from the cut line back over the cleared ground, and out again light.
    const T = 22, t = frac(st.t / T) * T
    const from: [number, number] = [-1.2, 2.2], to: [number, number] = [-9.5, 3.4]
    const hauling = t < 12, going = t >= 14
    const u = hauling ? ease(t / 12) : going ? 1 - ease((t - 14) / (T - 14)) : 1
    const hx = from[0] + (to[0] - from[0]) * u, hz = from[1] + (to[1] - from[1]) * u
    this.local(st, s, hx, hz, PT)
    const hh = h + Math.atan2(to[1] - from[1], to[0] - from[0]) + (going ? Math.PI : 0)
    const moving = (going || hauling) && f.going ? 1 : 0
    for (const sd of [-1, 1]) {
      const ox = -Math.sin(hh) * sd * 0.42 * s, oz = Math.cos(hh) * sd * 0.42 * s
      drawBeast(pr, sd < 0 ? HORSE : GREY_HORSE, PT.x + ox, heightAt(PT.x + ox, PT.z + oz), PT.z + oz, hh, s * DRAUGHT, st.t * 7 + sd, moving, 0)
      if (hauling) {
        c.copy(withers)
        e.set(PT.x - Math.cos(hh) * 2.6 * s, heightAt(PT.x, PT.z) + 0.1 * s, PT.z - Math.sin(hh) * 2.6 * s)
        pr.rod('cyl', c, e, 0.008 * s, CHAIN)
      }
    }
    if (hauling) {
      c.set(PT.x - Math.cos(hh) * 2.6 * s, heightAt(PT.x, PT.z) + 0.2, PT.z - Math.sin(hh) * 2.6 * s)
      d.set(-Math.cos(hh), 0, -Math.sin(hh))
      pr.put('log', c, d, Y, 0.38, 7.5, 0.38, WHITE)
      if (!f.still && moving && Math.random() < 0.25) f.particles.emit(c.x, c.y, c.z, 0, 0.2, 0, 0.5, 0.9, 2.2, f.cold ? 0.9 : 0.5, f.cold ? 0.93 : 0.42, f.cold ? 0.97 : 0.32, 0.25, 0.4)
    }
  }

  // How tall one of the land's trees stands, in metres.
  private tall(t: StandTree): number {
    return t.bush ? Math.max(2.4, t.s * 2.6) : Math.max(6, t.s)
  }

  // One of the land's trees as it goes over: a trunk along `up` from its foot, in bough or in leaf.
  private tree(pr: Prims, t: Fall, foot: Vector3, up: Vector3, limbed: number): void {
    const H = t.h
    if (t.bush) {
      for (let k = 0; k < 5; k++) {
        const az = hash(t.x * 7 + k) * 6.28, len = H * (0.65 + 0.5 * hash(t.z * 13 + k)) * (1 - 0.3 * limbed)
        e.set(Math.cos(az), 0, Math.sin(az))
        c.copy(up).addScaledVector(e, 0.3 * up.y).normalize()
        pr.put('log', foot, c, X, 0.1, len, 0.1, WHITE)
        for (const q of [0.62, 0.96]) {
          g.copy(foot).addScaledVector(c, q * len)
          pr.put('ball', g, c, X, 0.42 * (1 - limbed), 0.55 * (1 - limbed), 0.42 * (1 - limbed), k % 2 ? ALDER : ALDER_DARK)
        }
      }
      return
    }
    const r = 0.026 * H + 0.03
    pr.put('log', foot, up, X, r * 2, H * (1 - 0.26 * limbed), r * 2, WHITE)
    if (t.conifer) {
      for (let k = 0; k < 6; k++) {
        const wide = H * (0.3 - 0.04 * k) * (1 - limbed)
        if (wide <= 0.05) continue
        c.copy(foot).addScaledVector(up, (0.2 + 0.135 * k) * H)
        pr.put('bough', c, up, X, wide, 0.3 * H, wide, SPRUCE)
      }
    } else {
      for (let k = 0; k < 4; k++) {
        c.copy(foot).addScaledVector(up, (0.56 + 0.13 * k) * H).addScaledVector(X, (hash(k + t.x) - 0.5) * 0.12 * H)
        const w2 = H * (0.19 - 0.02 * k) * (1 - limbed)
        if (w2 > 0.05) pr.put('ball', c, up, X, w2, w2 * 0.8, w2, k % 2 ? HARDWOOD : HARDWOOD_DARK)
      }
    }
  }

  // ---- picking rocks: a horse and a stone boat working down the field, the people ranging out round it for stones

  private rocks(st: Site, ws: Worker[], f: StageFrame): void {
    const pr = f.pr, s = f.s
    const fd = FIELDS[st.field]
    // The boat crosses the field on a line as far down it as the job has got, standing every dozen metres while the
    // stones round it are brought in. Past the field's end the load goes off in a heap by the wall, and the boat
    // comes back on the next line.
    const sh = shareOf(f.snap, 'rocks', st.field)
    const line = fd.z0 + 6 + (fd.z1 - fd.z0 - 12) * (sh < 0 ? 0.5 : sh)
    const out0 = fd.x0 - HEAP_OUT + 2.5, out1 = fd.x1 + HEAP_OUT - 2.5
    if (!st.n) {
      st.n = 1
      st.dir = hash(st.field + 2) < 0.5 ? 1 : -1
      st.bx = fd.x0 + (fd.x1 - fd.x0) * (0.25 + 0.5 * hash(st.field * 3 + 1))
      st.bz = st.tz = line
      st.load = 5
    }
    const v = Math.min(3.2, Math.max(1, f.pace * 0.4))
    const inField = st.bx > fd.x0 + 3 && st.bx < fd.x1 - 3
    if (f.going) {
      st.pt += f.dt
      if (st.mode === 0) {
        st.bx += st.dir * v * f.dt
        const dz = st.tz - st.bz
        st.bz += Math.sign(dz) * Math.min(Math.abs(dz), 0.7 * v * f.dt)
        if (st.dir > 0 ? st.bx >= out1 : st.bx <= out0) { st.bx = st.dir > 0 ? out1 : out0; st.mode = 2; st.pt = 0 }
        else if (inField && st.pt * v >= 11) { st.mode = 1; st.pt = 0 }
      } else if (st.mode === 1) {
        if (st.pt > 5.5) { st.mode = 0; st.pt = 0 }
      } else {
        st.load = Math.max(0, st.load - f.dt * 2.6)
        if (st.pt > 6) { st.dir = -st.dir; st.tz = line; st.mode = 0; st.pt = 0 }
      }
    }
    const moving = st.mode === 0 && f.going, unloading = st.mode === 2
    // the heaps by the walls at the ends of the lines already picked, and the one going up now
    const lines = Math.max(1, Math.round((line - fd.z0 - 6) / 9))
    for (let q = Math.max(0, lines - 5); q <= lines; q++) {
      for (const end of [0, 1]) {
        const now = q === lines
        if (now && !(unloading && (st.dir > 0 ? 1 : 0) === end)) continue
        const hz = now ? st.bz : fd.z0 + 6 + q * 9 - 4 * hash(q * 5 + end), hx = end ? fd.x1 + HEAP_OUT : fd.x0 - HEAP_OUT
        const n = now ? Math.round(14 * clamp01(st.pt / 5)) : 9 + Math.floor(8 * hash(q * 3 + end * 17 + st.field))
        for (let k = 0; k < n; k++) {
          const ring = k < 7 ? 0 : k < 12 ? 1 : 2, ang = k * 2.4 + q, rad = (1.1 - 0.4 * ring) * (0.45 + 0.55 * hash(k + q * 31 + end * 7))
          b.set(hx + Math.cos(ang) * rad, 0, hz + Math.sin(ang) * rad)
          b.y = heightAt(b.x, b.z) + 0.1 + 0.24 * ring
          pr.put('ball', b, Y, X, 0.2 + 0.1 * hash(k + 5 + q), 0.16, 0.19 + 0.07 * hash(k + 9 + q), GRAVEL)
        }
      }
    }
    const hh = st.dir > 0 ? 0 : Math.PI
    d.set(Math.cos(hh), 0, Math.sin(hh))
    e.set(-d.z, 0, d.x)
    const hx = st.bx + st.dir * 1.75 * s
    drawBeast(pr, HORSE, hx, heightAt(hx, st.bz), st.bz, hh, s * DRAUGHT, st.t * 6, moving ? 0.8 : 0, unloading ? 0.6 * span(1, 3, st.pt) : 0)
    c.copy(withers)
    // the boat: two runners and a deck of planks, low to the ground
    a.set(st.bx, heightAt(st.bx, st.bz) + 0.05 * s, st.bz)
    pr.put('box', b.copy(a).addScaledVector(d, -0.5 * s), d, Y, 0.045 * s, 1.0 * s, 0.62 * s, SLED)
    for (const sd of [-1, 1]) pr.put('box', b.copy(a).addScaledVector(d, -0.55 * s).addScaledVector(e, sd * 0.27 * s).addScaledVector(Y, -0.04 * s), d, Y, 0.06 * s, 1.15 * s, 0.07 * s, SLED)
    b.copy(a).addScaledVector(d, 0.5 * s)
    pr.rod('cyl', c, b, 0.008 * s, CHAIN)
    const heap = Math.min(13, Math.floor(st.load))
    for (let n = 0; n < heap; n++) {
      b.copy(a).addScaledVector(d, (-0.3 + 0.2 * (n % 4) + 0.05 * hash(n)) * s).addScaledVector(e, (-0.17 + 0.17 * (Math.floor(n / 4) % 3)) * s).addScaledVector(Y, (0.07 + (n >= 8 ? 0.08 : 0)) * s)
      pr.put('ball', b, Y, d, (0.075 + 0.03 * hash(n + 3)) * s, 0.06 * s, (0.07 + 0.02 * hash(n + 7)) * s, GRAVEL)
    }
    // dry ground: the runners raise a little dust
    if (moving && f.dry && !f.still && Math.random() < 0.5) f.particles.emit(st.bx - st.dir * 1.6, a.y + 0.5, st.bz + (Math.random() - 0.5), -st.dir * 0.3, 0.3, 0, 2.2, 3.4, 3.2, 0.56, 0.47, 0.36, 0.22, 0.5)
    ws.forEach((w, r) => {
      w.rig = null
      w.aboard = false
      let j = st.job.get(w.id)
      const sd = r % 2 ? 1 : -1
      const next = (q: Doing) => {
        // the next stone: somewhere ahead of the boat and out to either side of its line
        q.n++
        q.ph = 0
        q.t = 0
        q.x = Math.min(fd.x1 - 1, Math.max(fd.x0 + 1, st.bx + st.dir * (2 + 11 * hash(q.n * 1.7 + w.id))))
        q.z = Math.min(fd.z1 - 1, Math.max(fd.z0 + 1, st.bz + (hash(q.n * 3.1 + w.id * 5) - 0.5) * 26))
      }
      if (!j) { j = { ph: 0, t: 0, x: 0, z: 0, n: r * 7 }; st.job.set(w.id, j); next(j) }
      const bx = st.bx - st.dir * (0.9 - 0.5 * (r % 3)), bz = st.bz + sd * 1.25, face = sd > 0 ? -Math.PI / 2 : Math.PI / 2
      if (unloading || !inField) {
        // past the field's edge: off the boat and onto the heap
        if (j.ph !== 0) next(j)
        if (!this.goTo(st, w, f, bx, bz, face)) return
        if (!unloading) { stand(w.pose, st.t + r, w.tired); return }
        const cyc = frac(st.t / 2.6 + r * 0.43)
        lifting(w.pose, cyc, sd * st.dir, 0.1)
        w.pose.held = cyc > 0.24 && cyc < 0.78 ? 'stone' : ''
        return
      }
      if (j.ph === 0) {
        if (this.goTo(st, w, f, j.x, j.z, Math.atan2(st.bz - j.z, st.bx - j.x))) j.ph = 1
      } else if (j.ph === 1) {
        this.goTo(st, w, f, j.x, j.z, w.heading)
        if (f.going) j.t += f.dt
        const k = Math.min(0.5, (j.t / 1.3) * 0.5)
        lifting(w.pose, k, 0, 0)
        w.pose.held = k > 0.24 ? 'stone' : ''
        w.pose.size = 0.8 + 0.5 * hash(j.n)
        if (j.t >= 1.3) { j.ph = 2; j.t = 0 }
      } else if (j.ph === 2) {
        const there = this.goTo(st, w, f, bx, bz, face, 1)
        w.pose.held = 'stone'
        w.pose.size = 0.8 + 0.5 * hash(j.n)
        if (there) { j.ph = 3; j.t = 0 }
      } else {
        this.goTo(st, w, f, bx, bz, face)
        if (f.going) j.t += f.dt
        const k = 0.5 + Math.min(0.5, (j.t / 0.9) * 0.5)
        const thrown = lifting(w.pose, k, -sd, 0.12)
        w.pose.held = k < 0.78 ? 'stone' : ''
        w.pose.size = 0.8 + 0.5 * hash(j.n)
        if (thrown > 0 && thrown < 0.55) {
          // the stone in the air between the hands and the boat
          const q = thrown / 0.55
          c.set(w.x, heightAt(w.x, w.z) + STAND_HIP * 0.9 * s, w.z)
          b.copy(c).lerp(a, q)
          b.y += Math.sin(q * Math.PI) * 0.22 * s
          pr.put('ball', b, Y, d, 0.07 * s, 0.055 * s, 0.062 * s, GRAVEL)
        }
        if (j.t >= 0.9) { st.load = Math.min(13, st.load + 1); next(j) }
      }
    })
  }

  // ---- cutting back the hedgerow: brush hooks along the whole of the wall, armfuls to a fire where each one is working

  private brush(st: Site, ws: Worker[], f: StageFrame): void {
    const pr = f.pr, s = f.s
    const fd = FIELDS[st.field]
    // the brush is burnt as it is cut, except in a high wind, in the wet or on snow: the smoke shows where the work is
    const burning = f.wind < 0.85 && !f.cold && f.snap.weather.prcp < 1
    // The wall runs across the way the spot faces. Over the job the whole of the field's side along it is cut back:
    // each one has a stretch of it and works along that from one end to the other.
    const upright = Math.abs(Math.cos(st.spot.heading)) > 0.5
    const L = ((upright ? fd.z1 - fd.z0 : fd.x1 - fd.x0) - 8) / s
    const sh = shareOf(f.snap, 'brush', st.field)
    const p = sh < 0 ? 0.5 : clamp01(sh), n = Math.max(1, ws.length)
    const fires: number[] = []
    ws.forEach((w, r) => {
      w.rig = null
      w.aboard = false
      const base = -L / 2 + (L * (r + p)) / n
      // their fire: on the headland behind them, moved on every fifteen metres or so
      const fz = (Math.round((base * s) / 15) * 15 + 4) / s, fx = -1.5
      if (fires.length < 3 && !fires.some(z => Math.abs(z - fz) < 1)) {
        fires.push(fz)
        this.fire(st, f, fx, fz, burning)
      }
      const T = 12, t = frac(st.t / T + r * 0.37 + w.id * 0.21) * T
      if (t < 5) {
        // along the hedge a step at a time, the hook swinging
        if (this.go(st, w, f, -0.12, base + 0.25 * Math.floor(t / 1.2), 0)) {
          const u = frac(t / 1.2)
          swing(w.pose, u < 0.5 ? 1 - ease(u / 0.5) : u < 0.64 ? (u - 0.5) / 0.14 : 1, false, 0.3)
          w.pose.tool = 'hook'
        }
      } else if (t < 6) {
        if (this.go(st, w, f, -0.05, base + 1, 0)) stoop(w.pose.reset(), Math.sin((t - 5) * Math.PI), st.t * 4)
      } else if (t < 9.6) {
        const there = this.go(st, w, f, fx + 0.75, fz, Math.PI, 1)
        w.pose.held = 'brush'
        if (there) { lifting(w.pose, 0.7, 1); w.pose.held = t < 9.2 ? 'brush' : '' }
      } else if (this.go(st, w, f, -0.12, base, 0)) stand(w.pose, st.t, w.tired)
    })
  }

  // A pile of cut brush and, in burning weather, the fire in it and its smoke going up.
  private fire(st: Site, f: StageFrame, fx: number, fz: number, burning: boolean): void {
    const pr = f.pr, s = f.s
    this.P(st, s, fx, 0, fz, a)
    const far = f.far(a.x, a.z)
    for (let n = 0; n < 6; n++) {
      b.copy(a).add(c.set((hash(n) - 0.5) * 0.6 * s, (0.08 + 0.12 * hash(n + 9)) * s, (hash(n + 4) - 0.5) * 0.6 * s))
      pr.put('ball', b, Y, X, 0.2 * s, 0.11 * s, 0.19 * s, burning && n < 3 ? EMBER : COLORS.BRUSH)
    }
    if (!burning) return
    for (let n = 0; n < 5; n++) {
      const fl = 0.6 + 0.4 * Math.sin(st.t * (9 + n * 2.3) + n * 2 + fz)
      b.copy(a).add(c.set((hash(n + 20) - 0.5) * 0.36 * s, 0.14 * s, (hash(n + 30) - 0.5) * 0.36 * s))
      pr.put('glow', b, Y, X, 0.09 * s * fl, (0.2 + 0.2 * fl) * s, 0.09 * s * fl, FLAME[n % 3])
    }
    if (f.still || !f.going) return
    const q = Math.random
    // (the air does not carry a puff far up: the column is laid in along its length)
    if (q() < 0.7) {
      const up = Math.pow(q(), 1.4) * 34
      // (from across the farm the column is drawn wider and denser: it is what says where the work is)
      f.particles.emit(a.x + (q() - 0.5) * (0.6 + 0.12 * up), a.y + 0.8 + up, a.z + (q() - 0.5) * (0.6 + 0.12 * up), 0, 0.9, 0, (0.7 + 0.16 * up) * (1 + 0.9 * far), 0.5 + 0.03 * up, 5 + q() * 4, 0.6 + 0.08 * far, 0.59 + 0.08 * far, 0.58 + 0.08 * far, Math.min(0.85, 0.5 * (1 - up / 46) * (1 + 0.7 * far)), 0.35 + up / 60)
    }
    if (q() < 0.2) f.particles.emit(a.x, a.y + 0.3 * s, a.z, (q() - 0.5) * 0.8, 1.6 + q(), (q() - 0.5) * 0.8, 0.018 * s, 0, 0.9, 6, 2.2, 0.5, 0.9, 0.5)
  }

  // ---- building: sawing, carrying, nailing at the site's edge

  private build(st: Site, ws: Worker[], f: StageFrame): void {
    const pr = f.pr, s = f.s
    const b0 = f.snap.farm.buildings.find(x => !x.built && x.yard === st.field)
    const kind: BuildingKind = b0 ? b0.kind : 'shed'
    const earth = kind === 'pond' || kind === 'road'
    const prog = b0 ? b0.progress : 0.5
    const plan = siteOf(kind, st.field)
    // the carpenters' bench out in front of the building: a pair of sawhorses with a plank across, a stack of lumber
    if (!earth) {
      for (const lx of [-1.35, -0.75]) {
        for (const lz of [0.66, 1.1]) { this.P(st, s, lx, 0, lz, a); pr.put('box', a, Y, X, 0.04 * s, 0.3 * s, 0.04 * s, COLORS.WOOD) }
        this.P(st, s, lx, 0.3, 0.6, a)
        this.P(st, s, lx, 0.3, 1.16, b)
        pr.put('box', a, c.subVectors(b, a), Y, 0.05 * s, a.distanceTo(b), 0.05 * s, COLORS.WOOD)
      }
      this.P(st, s, -1.9, 0.35, 0.88, a)
      this.P(st, s, -0.2, 0.35, 0.88, b)
      pr.put('box', a, c.subVectors(b, a), Y, 0.022 * s, a.distanceTo(b), 0.15 * s, COLORS.PALE)
      for (let n = 0; n < 5; n++) {
        this.P(st, s, -2.2, 0.02 + 0.035 * Math.floor(n / 2), -1.2 + (n % 2) * 0.17, a)
        this.P(st, s, -0.5, 0.02 + 0.035 * Math.floor(n / 2), -1.2 + (n % 2) * 0.17, b)
        pr.put('box', a, c.subVectors(b, a), Y, 0.03 * s, a.distanceTo(b), 0.15 * s, n % 2 ? COLORS.PALE : COLORS.WOOD)
      }
    } else {
      // a heap of what is being moved
      // (in on the ground being dug or spread, clear of what is stacked at the site's corner)
      this.P(st, s, 1.0, 0, 0.9, a)
      pr.put('dome', a, Y, X, 0.7 * s, 0.34 * s, 0.6 * s, kind === 'road' ? GRAVEL : EARTH)
    }
    ws.forEach((w, r) => {
      w.rig = null
      w.aboard = false
      if (earth) {
        const role = r % 4
        if (role % 2 === 0) {
          if (this.go(st, w, f, 2.4 + 0.5 * r, -0.4 + 0.5 * (r % 3), 0.3)) forking(w.pose, frac(st.t / 2.2 + r * 0.4))
        } else {
          const u = frac(st.t / 6 + r * 0.3)
          const there = this.go(st, w, f, u < 0.5 ? 2.8 : 1.3, u < 0.5 ? 0.4 : 0.8, 0, u < 0.5 ? 1 : 0)
          if (u < 0.5) { w.pose.held = 'stone'; w.pose.size = 1.2 }
          if (there) stoop(w.pose.reset(), 0.8, st.t * 3)
        }
        return
      }
      // The first, fourth, fifth and sixth nail at the building's own work points (its front corners, then its sides);
      // the second saws at the bench; the third and any more carry.
      const nailer = r === 0 ? 0 : r >= 3 && r <= 5 ? r - 2 : -1
      if (nailer >= 0 && plan) {
        const at = plan.work[[0, 1, 3, 4][nailer]]
        if (this.goTo(st, w, f, at.x, at.z, Math.atan2(plan.z - at.z, plan.x - at.x))) hammering(w.pose, st.t * 9 + r, nailer % 2 ? 0.3 + 0.36 * prog : 0.36)
      } else if (r === 1) {
        if (this.go(st, w, f, -1.05, 0.5, Math.PI / 2)) {
          const x = Math.sin(st.t * 6)
          sawing(w.pose, x, 0.4)
          w.pose.gripL = true
          w.pose.handL.set(0.2, 0.385, -0.12)
          w.pose.tool = 'saw'
          w.pose.toolA.set(0.22 + 0.09 * x, 0.42, 0.02)
          w.pose.toolB.set(0.5 + 0.09 * x, 0.34, 0.02)
        }
      } else {
        // carrying planks from the stack to the work
        const T = 7, t = frac(st.t / T + r * 0.2) * T
        const loaded = t >= 1 && t < 4
        const to = plan ? plan.work[2] : null
        if (t < 1) { if (this.go(st, w, f, -1.3, -0.82, -Math.PI / 2)) stoop(w.pose.reset(), Math.sin(t * Math.PI) * 0.8, 0) }
        else if (t < 4) { if (to ? this.goTo(st, w, f, to.x, to.z, st.spot.heading, 2) : this.go(st, w, f, 0.25, 0.05, 0, 2)) stand(w.pose, st.t, w.tired) }
        else this.go(st, w, f, -1.3, -0.82, -Math.PI / 2)
        if (loaded) {
          w.pose.gripR = true
          w.pose.handR.set(0.08, STAND_HIP + 0.25, 0.11)
          w.pose.tool = 'plank'
          w.pose.toolA.set(-0.42, STAND_HIP + 0.245, 0.115)
          w.pose.toolB.set(0.5, STAND_HIP + 0.3, 0.115)
        }
      }
    })
  }

  // ---- hauling: barrels onto the truck or the trailer at the field, the drive to the potato house, off again, and back

  private haul(st: Site, ws: Worker[], f: StageFrame): void {
    if (!st.trip) {
      st.trip = new Poly(route({ x: st.spot.x, z: st.spot.z }, cropDoor(f.snap, st.field).stop))
    }
    // Each hauler has a machine and works its own loads.
    ws.forEach((w, r) => this.load(st, w, r, f))
  }

  // Load after load of as many barrels as the bed holds: on at the field, in along the lane, off at the potato house
  // door, and out again light. With the clock stopped the day's loads are counted out, each at a truck's own pace;
  // with it running the trips go on from one day into the next at a pace the eye can follow on the lane.
  private load(st: Site, w: Worker, r: number, f: StageFrame): void {
    const pr = f.pr, s = f.s
    const trip = st.trip!
    const CAP = LOAD
    let j = st.job.get(w.id)
    if (!j) { j = { ph: 0, t: (r * 0.37) % 1, x: 0, z: 0, n: 0 }; st.job.set(w.id, j) }
    // The lap: loading, the drive in, unloading, the drive back, as shares of it. With the clock running a lap is
    // two days long (a job of a day or two would otherwise never be seen to leave the field), and a drive too long
    // to make in its share of that at a pace that reads is cut, as the way to any work is: away from one end, in to
    // the other.
    const literal = f.literal && w.lit
    const q0 = literal ? 0.22 : LAP_STAND, q1 = LAP_DOOR, q2 = q1 + q0
    const lapS = Math.min(6, Math.max(2.6, 1.5 * f.day)), legS = lapS * (q1 - q0), reach = f.lane * legS
    if (literal) j.t = frac(Math.min(0.99999, w.w) * Math.max(1, w.loads))
    // (the clock stopped on a day that was running: the load in hand is seen in to the door, and no more)
    else if (f.going) j.t = f.literal ? (j.t < q2 ? Math.min(q2, j.t + f.dt / lapS) : j.t) : frac(j.t + f.dt / lapS)
    const lap = j.t
    const loading = lap < q0, out = lap >= q0 && lap < q1, unloading = lap >= q1 && lap < q2, back = lap >= q2
    const leg = (u: number): number => {
      if (literal || trip.length <= reach * 1.25) return ease(u)
      if (u < 0.4) return ((reach * 0.4) / trip.length) * (u / 0.4) * (u / 0.4)
      const r = (u - 0.4) / 0.6
      return 1 - ((reach * 0.6) / trip.length) * (1 - r) * (1 - r)
    }
    const along = loading ? 0 : out ? leg((lap - q0) / (q1 - q0)) : unloading ? 1 : 1 - leg((lap - q2) / (1 - q2))
    // (a cut drive: going from sight over the last of the pulling away)
    const drive = out ? (lap - q0) / (q1 - q0) : back ? (lap - q2) / (1 - q2) : 1
    if (w.rig) w.rig.fade = !literal && trip.length > reach * 1.25 && drive < 0.4 ? 1 - 0.9 * clamp01((drive - 0.2) / 0.2) : 1
    // the second machine stands a length behind the first
    const stood = loading || unloading
    const p = trip.at(Math.max(0, Math.min(trip.length, along * trip.length - (unloading ? r * 3.4 * s : 0))))
    const heading = loading ? st.spot.heading : back ? Math.atan2(-p.dz, -p.dx) : Math.atan2(p.dz, p.dx)
    const px = p.x + (loading ? Math.cos(st.spot.heading) * r * 3.6 * s : 0), pz = p.z + (loading ? Math.sin(st.spot.heading) * r * 3.6 * s : 0)
    const load = loading ? Math.floor(CAP * span(0.04, 0.96, lap / q0)) : out ? CAP : unloading ? Math.ceil(CAP * (1 - span(0.04, 0.96, (lap - q1) / q0))) : 0
    if (w.rig) { w.rig.x = px; w.rig.z = pz; w.rig.heading = heading; w.rig.load = load }
    const ch = Math.cos(heading), sh = Math.sin(heading)
    // beside the bed, on the side away from the crop
    const flank = (lx: number, lz: number, out2: Pt) => { out2.x = px + (ch * lx - sh * lz) * s; out2.z = pz + (sh * lx + ch * lz) * s; return out2 }
    w.lift = 0
    if (!w.rig) {
      // no machine of their own to load: lending a hand with the barrels at the field
      this.local(st, s, 1.6 + 1.1 * r, -1.5, PT)
      w.x = PT.x
      w.z = PT.z
      w.heading = st.spot.heading - Math.PI / 2
      w.aboard = false
      const cyc = frac(st.t / 1.7 + r * 0.4)
      lifting(w.pose, cyc, 1, 0.1)
      w.pose.held = cyc > 0.24 && cyc < 0.78 ? 'barrel' : ''
      return
    }
    w.aboard = !stood
    if (!stood) return
    // a barrel at a time: up from the ground and round onto the bed, or down off it and round to the door
    flank(-1.05, -0.98, PT)
    w.x = PT.x
    w.z = PT.z
    const cyc = frac(st.t / 1.5 + r * 0.5)
    if (loading) {
      lifting(w.pose, cyc, 0, 0.16)
      w.heading = heading - Math.PI / 2 + Math.PI * ease(span(0.4, 0.66, cyc))
      w.pose.held = cyc > 0.24 && cyc < 0.78 ? 'barrel' : ''
      // barrels brought to the headland, waiting to go
      const left = CAP - load
      for (let n = 0; n < Math.min(left, 8); n++) {
        flank(-0.6 - 0.44 * (n % 4), -1.8 - 0.44 * Math.floor(n / 4), PT)
        a.set(PT.x, heightAt(PT.x, PT.z), PT.z)
        pr.put('barrel', a, Y, X, 0.42 * s, 0.42 * s, 0.42 * s, WHITE)
      }
    } else {
      lifting(w.pose, 1 - cyc, 0, 0.16)
      w.heading = heading + Math.PI / 2 - Math.PI * ease(span(0.3, 0.6, cyc))
      w.pose.held = cyc > 0.2 && cyc < 0.74 ? 'barrel' : ''
      // set down, and rolled on its side to the big door
      const door = cropDoor(f.snap, st.field).door
      const rolling = frac(st.t / 1.5 + r * 0.5 + 0.3)
      flank(-1.05, -1.7, PT)
      a.set(PT.x, heightAt(PT.x, PT.z) + 0.17 * s, PT.z)
      b.set(door.x + Math.cos(door.heading) * 0.6 * s, heightAt(door.x, door.z) + 0.17 * s, door.z + Math.sin(door.heading) * 0.6 * s)
      c.copy(a).lerp(b, rolling)
      d.subVectors(b, a).normalize()
      e.set(-d.z, 0, d.x)
      const spin = rolling * 9
      pr.put('barrel', c.addScaledVector(e, -0.2 * s), e, d.multiplyScalar(Math.cos(spin)).addScaledVector(Y, Math.sin(spin)), 0.42 * s, 0.42 * s, 0.42 * s, WHITE)
    }
  }

  // ---- watering from the reel (a big gun on a cart, drawn in on its hose the length of the field) or from the pond
  // (a main along the lane and a line of pipe across the rows, a sprinkler at every joint)

  private water(st: Site, ws: Worker[], f: StageFrame): void {
    const pr = f.pr, s = f.s
    const fd = FIELDS[st.field]
    const reel = st.kind === 'reel'
    const day = f.snap.seasonDay
    // st.spot is on the headland at the field's side, half way down it
    const hx = st.spot.x
    // a throw of water from a nozzle: fine rods close to, and a drift of spray that shows from across the farm
    const jet = (from: Vector3, dirA: number, reachM: number, high: number, thick: number, n: number, mist: number) => {
      let px = from.x, py = from.y, pz = from.z
      for (let k = 1; k <= n; k++) {
        const q = k / n
        const x = from.x + Math.cos(dirA) * reachM * q, z = from.z + Math.sin(dirA) * reachM * q
        const y = from.y + (high * 4 * q * (1 - q)) - q * (from.y - heightAt(x, z))
        a.set(px, py, pz)
        b.set(x, y, z)
        pr.rod('cyl', a, b, thick * (0.6 + 0.7 * q), WATER)
        px = x; py = y; pz = z
      }
      if (!f.still && f.going && Math.random() < mist) {
        const q = 0.35 + Math.random() * 0.65, size = 0.06 * reachM * (0.5 + q)
        f.particles.emit(from.x + Math.cos(dirA) * reachM * q, from.y + high * 4 * q * (1 - q) * 0.8, from.z + Math.sin(dirA) * reachM * q, 0, -0.4, 0, size, size * 1.6, 0.9 + Math.random() * 0.7, 0.86, 0.91, 0.95, 0.16, 0.8)
      }
    }
    let tendX = hx + 2, tendZ = st.spot.z
    if (reel) {
      // Two pulls water the field: the gun throws about forty metres to either side of its lane. Each day's pull is
      // down one lane, the gun coming in from the far end to the drum as the hose is wound on.
      const laneZ = fd.cz + (day % 2 ? 1 : -1) * (fd.z1 - fd.z0) * 0.25
      const far = fd.x0 + 14, near = fd.x1 - 16
      if (f.literal) st.pt = clamp01(ws[0]?.w ?? 0.5)
      else if (f.going) st.pt = frac(st.pt + f.dt / 70)
      const gx = far + (near - far) * st.pt
      // the drum on its cart
      a.set(hx, heightAt(hx, laneZ), laneZ)
      e.set(0, 0, 1)
      const turn = st.t * 0.3
      for (const sd of [-1, 1]) pr.put('cyl', b.copy(a).addScaledVector(Y, 0.78 * s).addScaledVector(e, sd * 0.27 * s), e, c.set(Math.cos(turn), Math.sin(turn), 0), 0.6 * s, 0.05 * s, 0.6 * s, ORANGE)
      pr.put('cyl', b.copy(a).addScaledVector(Y, 0.78 * s).addScaledVector(e, -0.22 * s), e, X, (0.3 + 0.17 * st.pt) * s, 0.44 * s, (0.3 + 0.17 * st.pt) * s, DRUM)
      pr.put('box', b.copy(a).addScaledVector(Y, 0.14 * s), Y, X, 1.2 * s, 0.07 * s, 0.7 * s, CHAIN)
      for (const sd of [-1, 1]) { b.copy(a).addScaledVector(e, sd * 0.3 * s).addScaledVector(Y, 0.14 * s); c.copy(a).addScaledVector(e, sd * 0.3 * s).addScaledVector(Y, 0.78 * s); pr.rod('cyl', b, c, 0.035 * s, CHAIN) }
      // the hose out along the rows, lying to the lie of the ground
      const parts = 8
      for (let k = 0; k < parts; k++) {
        const xa = hx - 0.5 * s + (gx - (hx - 0.5 * s)) * (k / parts), xb = hx - 0.5 * s + (gx - (hx - 0.5 * s)) * ((k + 1) / parts)
        b.set(xa, heightAt(xa, laneZ) + 0.06, laneZ)
        c.set(xb, heightAt(xb, laneZ) + 0.06, laneZ)
        pr.rod('cyl', b, c, 0.045 * s, DRUM)
      }
      // the gun on its cart: two wheels, a riser and the barrel, swinging its sector
      a.set(gx, heightAt(gx, laneZ), laneZ)
      for (const sd of [-1, 1]) {
        b.copy(a).addScaledVector(e, sd * 0.42 * s).addScaledVector(Y, 0.2 * s)
        pr.put('tyre', b, e, X, 0.2 * s, 0.07 * s, 0.2 * s, CHAIN)
        c.copy(a).addScaledVector(Y, 0.62 * s)
        pr.rod('cyl', b, c, 0.02 * s, ORANGE)
      }
      c.copy(a).addScaledVector(Y, 0.62 * s)
      const sweep = Math.PI + 2.3 * Math.sin(st.t * 0.33)
      b.copy(c).add(d.set(Math.cos(sweep) * 0.5 * s, 0.26 * s, Math.sin(sweep) * 0.5 * s))
      pr.rod('cyl', c, b, 0.03 * s, COLORS.ALU)
      if (f.going) jet(g.copy(b), sweep, 38 + 2 * Math.sin(st.t * 7), 5.5, 0.05, 14, 1)
      tendZ = laneZ + 1.2
    } else {
      // The main comes up the headland from the pond's side; the line across the rows is moved down the field a set at
      // a time, and every joint has its sprinkler turning.
      const lineZ = fd.z0 + 12 + ((day * 37) % Math.max(1, Math.round(fd.z1 - fd.z0 - 24)))
      const pond = siteOf('pond', -1)
      if (!st.trip) st.trip = new Poly(pond ? route({ x: pond.door.x, z: pond.door.z }, { x: hx, z: st.spot.z }) : [{ x: hx, z: st.spot.z }, { x: hx, z: st.spot.z }])
      const main = st.trip.pts
      for (let k = 1; k < main.length; k++) {
        b.set(main[k - 1].x, heightAt(main[k - 1].x, main[k - 1].z) + 0.08, main[k - 1].z)
        c.set(main[k].x, heightAt(main[k].x, main[k].z) + 0.08, main[k].z)
        pr.rod('cyl', b, c, 0.03 * s, COLORS.ALU)
      }
      b.set(hx, heightAt(hx, st.spot.z) + 0.08, st.spot.z)
      c.set(hx, heightAt(hx, lineZ) + 0.08, lineZ)
      pr.rod('cyl', b, c, 0.03 * s, COLORS.ALU)
      const joints = Math.max(2, Math.floor((fd.x1 - fd.x0 - 6) / 12))
      let lx = hx, ly = c.y
      for (let n = 0; n < joints; n++) {
        const x = fd.x1 - 3 - 12 * n
        a.set(x, heightAt(x, lineZ) + 0.08, lineZ)
        b.set(lx, ly, lineZ)
        pr.rod('cyl', b, a, 0.022 * s, COLORS.ALU)
        lx = x; ly = a.y
        c.copy(a).addScaledVector(Y, 0.36 * s)
        pr.rod('cyl', a, c, 0.012 * s, COLORS.ALU)
        const turn = st.t * 1.6 + n * 1.3
        if (f.going) for (const sd of [0, Math.PI]) jet(c, turn + sd, 11, 1.2, 0.02, 5, 0.12)
      }
      tendZ = lineZ + 1.5
    }
    ws.forEach((w, r) => {
      w.rig = null
      w.aboard = false
      // tending it: the first by the drum (or the main's valve), the rest walking the line, a length of pipe on the
      // shoulder where there is pipe to move
      const walking = r > 0 || !reel
      const T = 40, t = frac(st.t / T + r * 0.37)
      const reach = Math.min(fd.x1 - fd.x0 - 20, 30 + 40 * r)
      const tx = walking ? fd.x1 - 4 - reach * (t < 0.5 ? ease(t * 2) : 1 - ease(t * 2 - 1)) : tendX
      const there = this.goTo(st, w, f, tx, tendZ + (walking ? 0 : 0.6 * r), Math.PI, reel ? 0 : 2)
      if (there) stand(w.pose, st.t, w.tired, reel ? 1 : 3)
      else if (!reel) { w.pose.tool = 'pipe'; w.pose.toolA.set(-1.3, STAND_HIP + 0.25, 0.115); w.pose.toolB.set(1.5, STAND_HIP + 0.29, 0.115) }
    })
  }

  // ---- the packing shed in winter: a grading table, barrels in, sacks out

  private pack(st: Site, ws: Worker[], f: StageFrame): void {
    const pr = f.pr, s = f.s
    // the table on its trestles, tubers on it, barrels at one end and sewn sacks at the other
    for (const lz of [-0.6, 0.6]) for (const lx of [-0.2, 0.2]) { this.P(st, s, lx, 0, lz, a); pr.put('box', a, Y, X, 0.04 * s, 0.36 * s, 0.04 * s, COLORS.WOOD) }
    this.P(st, s, 0, 0.36, -0.75, a)
    this.P(st, s, 0, 0.36, 0.75, b)
    pr.put('box', a, c.subVectors(b, a), Y, 0.03 * s, a.distanceTo(b), 0.5 * s, COLORS.PALE)
    for (let n = 0; n < 9; n++) {
      this.P(st, s, -0.15 + 0.15 * (n % 3), 0.4, -0.5 + 0.12 * n + 0.04 * Math.sin(st.t * 2 + n), a)
      pr.put('ball', a, Y, X, 0.045 * s, 0.032 * s, 0.036 * s, COLORS.TUBER)
    }
    for (let n = 0; n < 3; n++) { this.P(st, s, -0.2 + 0.42 * (n % 2), 0, -1.25 - 0.4 * Math.floor(n / 2), a); pr.put('barrel', a, Y, X, 0.42 * s, 0.42 * s, 0.42 * s, WHITE) }
    for (let n = 0; n < 5; n++) { this.P(st, s, -0.1 + 0.3 * (n % 2), 0.02 + 0.13 * Math.floor(n / 2), 1.35, a); pr.put('ball', a, Y, X, 0.2 * s, 0.085 * s, 0.13 * s, COLORS.SACK) }
    ws.forEach((w, r) => {
      w.rig = null
      w.aboard = false
      if (r % 3 === 2) {
        const T = 8, t = frac(st.t / T + r * 0.3) * T
        const loaded = t < 3.5
        if (this.go(st, w, f, loaded ? 0.5 : -0.6, loaded ? 1.5 : -0.9, loaded ? -1.6 : 1.6, loaded ? 1 : 0)) stoop(w.pose.reset(), 0.6, st.t * 2)
        if (loaded && st.at.get(w.id)!.walking) w.pose.held = 'sack'
        return
      }
      const sd = r % 3 === 0 ? -1 : 1
      if (!this.go(st, w, f, sd * 0.42, (r % 2 ? 0.3 : -0.25), sd > 0 ? Math.PI : 0)) return
      stand(w.pose, st.t, w.tired)
      // hands over the table, sorting
      w.pose.lean = 0.3
      w.pose.gripL = w.pose.gripR = true
      w.pose.handL.set(0.2 + 0.05 * Math.sin(st.t * 4 + r), 0.47 + 0.03 * Math.sin(st.t * 8 + r), -0.08 + 0.05 * Math.cos(st.t * 3))
      w.pose.handR.set(0.2 - 0.05 * Math.sin(st.t * 4 + r), 0.47 + 0.03 * Math.cos(st.t * 7 + r), 0.08 + 0.05 * Math.sin(st.t * 3.3))
    })
  }
}

const PT: Pt = { x: 0, z: 0 }
// The scale at which the felled spruce (2.7 to 3.2 tall as built) matches the trees of the woods as they stand now.
const TREE_MOST = 5.5
const EARTH = new Color('#5b4030')
