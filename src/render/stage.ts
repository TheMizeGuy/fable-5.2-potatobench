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
import { Poly, buildSite, cropDoor, heightAt, packSite, siteAt, type Pt, type Spot } from './work.ts'

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
  rig: { x: number; z: number; heading: number; load: number } | null
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
}

interface Site {
  kind: string
  field: number
  spot: Spot
  t: number
  seen: number
  load: number
  n: number
  at: Map<number, { x: number; z: number; walking: boolean }>
  trip: Poly | null
  ph: number
  piles: [number, number]  // stones put off at each end of the field
  falls: Fall[]            // trees coming down and lying to be limbed
}

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

  begin(): void {
    this.frame++
    this.thud = 0
    for (const [key, s] of this.sites) if (this.frame - s.seen > 600) this.sites.delete(key)
  }

  clear(): void {
    this.sites.clear()
  }

  // Everyone at one piece of work this frame. `kind` is the job, or 'pack', 'reel' and 'pipe' for those ways of working.
  work(key: string, kind: string, field: number, ws: Worker[], f: StageFrame): void {
    let st = this.sites.get(key)
    if (!st) {
      const spot = kind === 'build' || kind === 'pack' ? this.yardSpot(kind, field, f.snap) : siteAt((kind === 'reel' || kind === 'pipe' ? 'haul' : kind) as JobKind, field)
      st = { kind, field, spot, t: hash(field + kind.length) * 20, seen: this.frame, load: 0, n: kind === 'fell' ? -1 : 0, at: new Map(), trip: null, ph: 0, piles: [3, 0], falls: [] }
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
    if (!m) { m = { x: w.x, z: w.z, walking: false }; st.at.set(w.id, m) }
    const dx = PT.x - m.x, dz = PT.z - m.z, dist = Math.hypot(dx, dz)
    if (dist > 30) { m.x = PT.x; m.z = PT.z }
    m.walking = dist > (m.walking ? 0.06 : 0.4) * f.s
    if (m.walking) {
      const step = Math.min(dist, (f.going ? 1.5 : 0) * f.s * (1 - 0.4 * w.tired) * f.dt)
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
          else this.puff(f, c, 3, 2.4, 0.5, 0.44, 0.33, 0.34, 2.4, 1.2, 1.6)
        }
        if (!t.bush) { this.thud = 1; this.thudAt.copy(a) }
      }
    }
    st.falls = st.falls.filter(t => t.t < 6)
    const falling = st.falls.find(t => t.t >= -0.3 && t.t < 2.1), lying = st.falls.find(t => t.t >= 2.1)
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

  // ---- picking rocks: a horse and a stone boat down the field, and people throwing stones on

  private rocks(st: Site, ws: Worker[], f: StageFrame): void {
    const pr = f.pr, s = f.s
    const fd = FIELDS[st.field]
    const half = (fd.x1 - fd.x0) / 2 - 1.6
    // back and forth across the field, a row further down each time
    // the boat goes a little way and stands while the stones round it are thrown on, then on again
    const stops = Math.max(2, Math.ceil((2 * half) / (1.5 * Math.max(1, s * 0.7)))), TS = 6, GO = 1.8
    const leg = stops * TS + 5
    const k = Math.floor(st.t / leg), u = st.t - k * leg
    const stop = Math.floor(u / TS), v = u - stop * TS
    const unloading = stop >= stops
    const along = unloading ? 1 : (stop + ease(Math.min(1, v / GO))) / stops, dir = k % 2 ? -1 : 1
    const bx = dir * (-half + 2 * half * along) / s, bz = (-3 + (k % 4) * 2) / s
    const moving = !unloading && v < GO && f.going
    const picking = unloading ? 0 : clamp01((v - GO) / (TS - GO))
    if (unloading && f.going) {
      const off = Math.min(st.load, f.dt * 3)
      st.load -= off
      st.piles[dir > 0 ? 1 : 0] += off
    }
    // the piles at the field's ends, growing as the boat is emptied
    for (const end of [0, 1]) {
      const n = Math.min(22, Math.floor(st.piles[end]))
      for (let q = 0; q < n; q++) {
        const ring = q < 9 ? 0 : q < 17 ? 1 : 2, ang = q * 2.4, rad = (0.42 - 0.15 * ring) * (0.5 + 0.5 * hash(q + end * 31))
        // in the field's own corners, off the headland where the tractors turn
        this.P(st, s, ((end ? 1 : -1) * (half + 0.8)) / s + Math.cos(ang) * rad, 0.03 + 0.085 * ring, -((fd.z1 - fd.z0) / 2 - 0.8) / s + Math.sin(ang) * rad, b)
        pr.put('ball', b, Y, X, (0.085 + 0.04 * hash(q + 5)) * s, 0.065 * s, (0.08 + 0.03 * hash(q + 9)) * s, GRAVEL)
      }
    }
    const hh = st.spot.heading + (dir > 0 ? 0 : Math.PI)
    this.local(st, s, bx + dir * 1.75, bz, PT)
    drawBeast(pr, HORSE, PT.x, heightAt(PT.x, PT.z), PT.z, hh, s * DRAUGHT, st.t * 6, moving ? 0.8 : 0, unloading ? 0.6 * span(1, 3, u - stops * TS) : 0)
    c.copy(withers)
    // the boat: two runners and a deck of planks, low to the ground
    this.P(st, s, bx, 0.05, bz, a)
    d.set(Math.cos(hh), 0, Math.sin(hh))
    e.set(-d.z, 0, d.x)
    pr.put('box', b.copy(a).addScaledVector(d, -0.5 * s), d, Y, 0.045 * s, 1.0 * s, 0.62 * s, SLED)
    for (const sd of [-1, 1]) pr.put('box', b.copy(a).addScaledVector(d, -0.55 * s).addScaledVector(e, sd * 0.27 * s).addScaledVector(Y, -0.04 * s), d, Y, 0.06 * s, 1.15 * s, 0.07 * s, SLED)
    b.copy(a).addScaledVector(d, 0.5 * s)
    pr.rod('cyl', c, b, 0.008 * s, CHAIN)
    const heap = Math.min(12, Math.floor(st.load))
    for (let n = 0; n < heap; n++) {
      b.copy(a).addScaledVector(d, (-0.3 + 0.2 * (n % 4) + 0.05 * hash(n)) * s).addScaledVector(e, (-0.17 + 0.17 * (Math.floor(n / 4) % 3)) * s).addScaledVector(Y, (0.07 + (n >= 8 ? 0.08 : 0)) * s)
      pr.put('ball', b, Y, d, (0.075 + 0.03 * hash(n + 3)) * s, 0.06 * s, (0.07 + 0.02 * hash(n + 7)) * s, GRAVEL)
    }
    ws.forEach((w, r) => {
      w.rig = null
      w.aboard = false
      const sd = r % 2 ? 1 : -1
      const ox = (-0.15 + 0.55 * (r % 3)) * (dir > 0 ? 1 : -1) - dir * 0.2, oz = sd * (0.72 + 0.16 * Math.floor(r / 2))
      if (!this.go(st, w, f, bx + ox, bz + oz, dir > 0 ? 0 : Math.PI)) return
      // two stones each at every stand, a little out of step with one another
      const beat = picking * 2 - 0.12 * (r % 3)
      const cyc = unloading ? frac(st.t / 2.6 + r * 0.43) : beat <= 0 || beat >= 2 ? 0 : frac(beat)
      if (unloading) {
        // at the field's edge: off the boat and onto the pile
        lifting(w.pose, cyc, sd, 0.1)
        w.pose.held = cyc > 0.24 && cyc < 0.78 ? 'stone' : ''
        return
      }
      if (cyc <= 0) { stand(w.pose, st.t + r, w.tired); return }
      const thrown = lifting(w.pose, cyc, -sd * (dir > 0 ? 1 : -1), 0.12)
      w.pose.held = cyc > 0.24 && cyc < 0.78 ? 'stone' : ''
      w.pose.size = 0.8 + 0.5 * hash(stop * 2 + Math.floor(Math.max(0, beat)) + r * 7)
      if (thrown > 0 && thrown < 0.55) {
        // the stone in the air between the hands and the boat
        const q = thrown / 0.55
        this.P(st, s, bx + ox, STAND_HIP * 0.9, bz + oz * 0.8, c)
        b.copy(c).lerp(a, q)
        b.y += Math.sin(q * Math.PI) * 0.22 * s
        pr.put('ball', b, Y, d, 0.07 * s, 0.055 * s, 0.062 * s, GRAVEL)
      }
      const mark = (k * 100 + stop) * 2 + Math.floor(Math.max(0, beat)) + r * 100000
      if (thrown > 0.55 && st.ph !== mark && f.going) { st.ph = mark; st.load = Math.min(13, st.load + 1) }
    })
  }

  // ---- cutting back the hedgerow: brush hooks along the edge, armfuls to the fire

  private brush(st: Site, ws: Worker[], f: StageFrame): void {
    const pr = f.pr, s = f.s
    // the brush is burnt as it is cut, except in a high wind, in the wet or on snow: the smoke shows where the work is
    const burning = f.wind < 0.85 && !f.cold && f.snap.weather.prcp < 1
    // the hedge is ahead of the spot, along the wall; the pile and the fire a little way down the headland
    const fx = -0.1, fz = 3.0
    this.P(st, s, fx, 0, fz, a)
    // the pile, and on a still day the fire in it
    for (let n = 0; n < 6; n++) {
      b.copy(a).add(c.set((hash(n) - 0.5) * 0.6 * s, (0.08 + 0.12 * hash(n + 9)) * s, (hash(n + 4) - 0.5) * 0.6 * s))
      pr.put('ball', b, Y, X, 0.2 * s, 0.11 * s, 0.19 * s, burning && n < 3 ? EMBER : COLORS.BRUSH)
    }
    if (burning) {
      for (let n = 0; n < 5; n++) {
        const fl = 0.6 + 0.4 * Math.sin(st.t * (9 + n * 2.3) + n * 2)
        b.copy(a).add(c.set((hash(n + 20) - 0.5) * 0.36 * s, 0.14 * s, (hash(n + 30) - 0.5) * 0.36 * s))
        pr.put('glow', b, Y, X, 0.09 * s * fl, (0.2 + 0.2 * fl) * s, 0.09 * s * fl, FLAME[n % 3])
      }
      if (!f.still && f.going) {
        const q = Math.random
        // (the air does not carry a puff far up: the column is laid in along its length)
        if (q() < 0.7) {
          const up = Math.pow(q(), 1.4) * 34
          f.particles.emit(a.x + (q() - 0.5) * (0.6 + 0.12 * up), a.y + 0.8 + up, a.z + (q() - 0.5) * (0.6 + 0.12 * up), 0, 0.9, 0, 0.7 + 0.16 * up, 0.5 + 0.03 * up, 5 + q() * 4, 0.6, 0.59, 0.58, 0.5 * (1 - up / 46), 0.35 + up / 60)
        }
        if (q() < 0.2) f.particles.emit(a.x, a.y + 0.3 * s, a.z, (q() - 0.5) * 0.8, 1.6 + q(), (q() - 0.5) * 0.8, 0.018 * s, 0, 0.9, 6, 2.2, 0.5, 0.9, 0.5)
      }
    }
    ws.forEach((w, r) => {
      w.rig = null
      w.aboard = false
      const lz = r % 2 ? 1.6 + 1.2 * Math.floor(r / 2) : -0.6 - 1.4 * Math.floor(r / 2)
      const T = 8, t = frac(st.t / T + r * 0.37 + w.id * 0.21) * T
      if (t < 3.6) {
        if (this.go(st, w, f, -0.12, lz, 0)) {
          const u = frac(t / 1.2)
          swing(w.pose, u < 0.5 ? 1 - ease(u / 0.5) : u < 0.64 ? (u - 0.5) / 0.14 : 1, false, 0.3)
          w.pose.tool = 'hook'
        }
      } else if (t < 4.6) {
        if (this.go(st, w, f, -0.05, lz, 0)) stoop(w.pose.reset(), Math.sin((t - 3.6) * Math.PI), st.t * 4)
      } else if (t < 6.6) {
        const there = this.go(st, w, f, fx - 0.1, fz - 0.75, Math.PI / 2, 1)
        w.pose.held = 'brush'
        if (there) { lifting(w.pose, 0.7, Math.sign(lz)); w.pose.held = t < 6.2 ? 'brush' : '' }
      } else if (this.go(st, w, f, -0.12, lz, 0)) stand(w.pose, st.t, w.tired)
    })
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
      this.P(st, s, -1.2, 0, 0.9, a)
      pr.put('dome', a, Y, X, 0.7 * s, 0.34 * s, 0.6 * s, kind === 'road' ? GRAVEL : EARTH)
    }
    ws.forEach((w, r) => {
      w.rig = null
      w.aboard = false
      if (earth) {
        const role = r % 4
        if (role % 2 === 0) {
          if (this.go(st, w, f, 0.2 + 0.5 * r, -0.4 + 0.5 * (r % 3), 0.3)) forking(w.pose, frac(st.t / 2.2 + r * 0.4))
        } else {
          const u = frac(st.t / 6 + r * 0.3)
          const there = this.go(st, w, f, u < 0.5 ? 0.6 : -0.9, u < 0.5 ? 0.4 : 0.8, 0, u < 0.5 ? 1 : 0)
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

  // ---- hauling: barrels onto the truck or the trailer at the field, the drive to the potato house, and off again

  private haul(st: Site, ws: Worker[], f: StageFrame): void {
    if (!st.trip) {
      st.trip = new Poly(route({ x: st.spot.x, z: st.spot.z }, cropDoor(f.snap, st.field).stop))
    }
    // Each hauler has a machine and works its own load.
    ws.forEach((w, r) => this.load(st, w, r, f))
  }

  // One load a day: on at the field, the drive in, off at the potato house door, and the day ends there.
  private load(st: Site, w: Worker, r: number, f: StageFrame): void {
    const pr = f.pr, s = f.s
    const trip = st.trip!
    const CAP = 8
    const lap = w.w
    const loading = lap < 0.42, out = lap >= 0.42 && lap < 0.6, unloading = lap >= 0.6 && lap < 0.97
    const done = lap >= 0.97
    const along = loading ? 0 : out ? ease((lap - 0.42) / 0.18) : 1
    // the second machine stands a length behind the first
    const p = trip.at(Math.max(0, Math.min(trip.length, along * trip.length + (loading ? 0 : -r * 3.4 * s * along))))
    const heading = loading ? st.spot.heading : Math.atan2(p.dz, p.dx)
    const px = p.x + (loading ? Math.cos(st.spot.heading) * r * 3.6 * s : 0), pz = p.z + (loading ? Math.sin(st.spot.heading) * r * 3.6 * s : 0)
    const load = done ? 0 : loading ? Math.floor(CAP * span(0.03, 0.4, lap)) : out ? CAP : Math.ceil(CAP * (1 - span(0.62, 0.95, lap)))
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
      if (loading) { lifting(w.pose, frac(st.t / 1.7 + r * 0.4), 1, 0.1); w.pose.held = frac(st.t / 1.7 + r * 0.4) > 0.24 && frac(st.t / 1.7 + r * 0.4) < 0.78 ? 'barrel' : '' }
      else stand(w.pose, st.t, w.tired, 1)
      return
    }
    w.aboard = out
    if (out) return
    if (done) { flank(-0.9, -1.0, PT); w.x = PT.x; w.z = PT.z; w.heading = heading - 0.6; stand(w.pose, st.t, w.tired, 1); return }
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
      for (let n = 0; n < Math.min(left, 6); n++) {
        flank(-0.6 - 0.44 * n, -1.8 - 0.1 * (n % 2), PT)
        a.set(PT.x, heightAt(PT.x, PT.z), PT.z)
        pr.put('barrel', a, Y, X, 0.42 * s, 0.42 * s, 0.42 * s, WHITE)
      }
    } else if (unloading) {
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

  // ---- watering from the reel (a gun on a sled, drawn in on its hose) or from the pond (a line of pipe and sprinklers)

  private water(st: Site, ws: Worker[], f: StageFrame): void {
    const pr = f.pr, s = f.s
    const fd = FIELDS[st.field]
    const reel = st.kind === 'reel'
    const span0 = fd.x1 - fd.x0
    // st.spot is on the headland at the field's side, facing up the slope: the field lies to its left
    const hx = st.spot.x, hz = st.spot.z
    const jet = (from: Vector3, dirA: number, reachU: number, high: number, thick: number) => {
      const n = 9
      let px = from.x, py = from.y, pz = from.z
      for (let k = 1; k <= n; k++) {
        const q = k / n
        const x = from.x + Math.cos(dirA) * reachU * q, z = from.z + Math.sin(dirA) * reachU * q
        const y = from.y + (high * 4 * q * (1 - q)) - q * (from.y - heightAt(x, z))
        a.set(px, py, pz)
        b.set(x, y, z)
        pr.rod('cyl', a, b, thick * (0.6 + 0.7 * q), WATER)
        px = x; py = y; pz = z
      }
      if (!f.still && f.going && Math.random() < 0.1 * reachU) {
        // spray falling out of the far half of the throw, and going a little way with the wind
        const q = 0.55 + Math.random() * 0.45
        f.particles.emit(from.x + Math.cos(dirA) * reachU * q, from.y + high * 4 * q * (1 - q) * 0.8, from.z + Math.sin(dirA) * reachU * q, 0, -0.3, 0, 0.08 * s, 0.26 * s, 0.8 + Math.random() * 0.6, 0.85, 0.9, 0.94, 0.17, 0.8)
      }
    }
    if (reel) {
      // the drum on its cart, the hose out along the rows, the gun sweeping
      a.set(hx, heightAt(hx, hz), hz)
      d.set(-1, 0, 0)
      e.set(0, 0, 1)
      for (const sd of [-1, 1]) pr.put('cyl', b.copy(a).addScaledVector(Y, 0.78 * s).addScaledVector(e, sd * 0.27 * s), e, X, 0.6 * s, 0.05 * s, 0.6 * s, ORANGE)
      pr.put('cyl', b.copy(a).addScaledVector(Y, 0.78 * s).addScaledVector(e, -0.22 * s), e, X, 0.47 * s, 0.44 * s, 0.47 * s, DRUM)
      pr.put('box', b.copy(a).addScaledVector(Y, 0.14 * s), Y, X, 1.2 * s, 0.07 * s, 0.7 * s, CHAIN)
      for (const sd of [-1, 1]) { b.copy(a).addScaledVector(e, sd * 0.3 * s).addScaledVector(Y, 0.14 * s); c.copy(a).addScaledVector(e, sd * 0.3 * s).addScaledVector(Y, 0.78 * s); pr.rod('cyl', b, c, 0.035 * s, CHAIN) }
      const gx = fd.x0 + span0 * (0.25 + 0.45 * frac(st.t / 90))
      b.set(hx - 0.5 * s, heightAt(hx, hz) + 0.05, hz)
      c.set(gx, heightAt(gx, hz) + 0.05, hz)
      pr.rod('cyl', b, c, 0.03 * s, DRUM)
      a.set(gx, heightAt(gx, hz), hz)
      for (const sd of [-1, 1]) { b.copy(a).addScaledVector(e, sd * 0.25 * s); c.copy(a).addScaledVector(Y, 0.5 * s); pr.rod('cyl', b, c, 0.02 * s, CHAIN) }
      c.copy(a).addScaledVector(Y, 0.52 * s)
      const sweep = Math.PI + 1.25 * Math.sin(st.t * 0.5)
      if (f.going) jet(c, sweep, 6.2 + 0.3 * Math.sin(st.t * 7), 1.5, 0.022 * s)
    } else {
      // pipe laid across the rows from the headland, a sprinkler at every joint
      b.set(hx - 0.4 * s, heightAt(hx, hz) + 0.07, hz)
      c.set(fd.x0 + 1.2, heightAt(fd.x0 + 1.2, hz) + 0.07, hz)
      pr.rod('cyl', b, c, 0.022 * s, COLORS.ALU)
      for (let n = 0; n < 5; n++) {
        const x = fd.x0 + 1.6 + (span0 - 3) * n / 4
        a.set(x, heightAt(x, hz) + 0.07, hz)
        c.copy(a).addScaledVector(Y, 0.3 * s)
        pr.rod('cyl', a, c, 0.012 * s, COLORS.ALU)
        const turn = st.t * 1.6 + n * 1.3
        if (f.going) for (const sd of [0, Math.PI]) jet(c, turn + sd, 2.6, 0.38, 0.009 * s)
      }
    }
    ws.forEach((w, r) => {
      w.rig = null
      w.aboard = false
      const m = st.at.get(w.id) ?? { x: w.x, z: w.z, walking: false }
      st.at.set(w.id, m)
      // tending it: by the reel, or walking the pipe with a length on the shoulder
      const T = 9, t = frac(st.t / T + r * 0.5) * T
      const tx = hx + (0.9 + 0.4 * r) * s, tz = hz + (reel ? 0.5 : -2 + 4 * ease(span(0, T, t))) * s
      const dx = tx - m.x, dz = tz - m.z, dist = Math.hypot(dx, dz)
      if (dist > 30) { m.x = tx; m.z = tz }
      m.walking = dist > (m.walking ? 0.06 : 0.45) * s
      if (m.walking) {
        const step = Math.min(dist, (f.going ? 1.3 : 0) * s * f.dt)
        m.x += (dx / dist) * step
        m.z += (dz / dist) * step
        w.heading = Math.atan2(dz, dx)
        walk(w.pose, st.t * 9 + w.id, 1, w.tired, reel ? 0 : 2)
        if (!reel) { w.pose.tool = 'pipe'; w.pose.toolA.set(-0.5, STAND_HIP + 0.25, 0.115); w.pose.toolB.set(0.6, STAND_HIP + 0.29, 0.115) }
      } else {
        w.heading = Math.PI
        stand(w.pose, st.t, w.tired, reel ? 1 : 3)
      }
      w.x = m.x
      w.z = m.z
      w.lift = 0
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
