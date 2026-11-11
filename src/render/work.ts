// The farmer's day, replayed: which field the tractor or the walker is in, the path they follow,
// and which hills change as they pass (planted, hilled, killed, dug, pulled, blight found).
import { COLS, HILLS, type HillLook, type JobKind } from '../sim/index.ts'
import type { HillDisplay } from './fields.ts'
import { FIELDS, ROAD, SHED_SPOT, SZ, fieldAt, fieldBaseY, groundY, hillPos } from './layout.ts'
import type { Snapshot, Work } from './state.ts'

export interface Pt { x: number; z: number }

export interface Reveal { field: number; hill: number; at: number; look: HillLook; ridge: number; tubers: 'dig' | 'sample' | '' }

export interface Seg {
  kind: JobKind | 'travel'
  field: number
  walker: boolean
  travel: Pt[]           // how the tractor gets there
  path: Pt[]             // the working pass (tractor or walker)
  reveals: Reveal[]      // `at` is arc length along `path`
  start: number          // share of the day
  end: number
}

const TRACTOR_JOBS = new Set<string>(['plant', 'hill', 'spray', 'kill', 'water', 'dig'])
const LANE = 1.16        // the headland above a field, where the tractor travels

export class Poly {
  pts: Pt[]
  cum: number[] = [0]
  constructor(pts: Pt[]) {
    this.pts = pts.length ? pts : [{ x: 0, z: 0 }]
    for (let k = 1; k < this.pts.length; k++) this.cum.push(this.cum[k - 1] + Math.hypot(this.pts[k].x - this.pts[k - 1].x, this.pts[k].z - this.pts[k - 1].z))
  }
  get length(): number { return this.cum[this.cum.length - 1] }
  at(s: number): { x: number; z: number; dx: number; dz: number } {
    const L = this.length
    if (L <= 0) return { x: this.pts[0].x, z: this.pts[0].z, dx: 1, dz: 0 }
    s = Math.max(0, Math.min(L, s))
    let k = 1
    while (k < this.cum.length - 1 && this.cum[k] < s) k++
    const a = this.pts[k - 1], b = this.pts[k]
    const seg = this.cum[k] - this.cum[k - 1]
    const t = seg > 0 ? (s - this.cum[k - 1]) / seg : 0
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
    return { x: a.x + dx * t, z: a.z + dz * t, dx: dx / l, dz: dz / l }
  }
  // Arc length of the point on the path nearest to (x, z).
  nearest(x: number, z: number): number {
    let best = 0, bd = Infinity
    for (let k = 1; k < this.pts.length; k++) {
      const a = this.pts[k - 1], b = this.pts[k]
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z)
      if (d < bd) { bd = d; best = this.cum[k - 1] + Math.sqrt(l2) * t }
    }
    return best
  }
}

// Where the tractor stands while the farmer works a field on foot: on the headland at the field's corner.
export function parkSpot(field: number): Pt {
  const f = FIELDS[field]
  return { x: f.x1 + (field % 2 === 1 ? 1.3 : 0.9), z: f.z0 - 0.5 }
}

// The farm road at a given distance down the slope. Above the dooryard a track runs on up beside the fields.
function roadAt(z: number): Pt {
  if (z < -9.6) return { x: 17.3, z }
  for (let k = 0; k < ROAD.length - 1; k++) {
    const [x0, z0] = ROAD[k], [x1, z1] = ROAD[k + 1]
    if ((z >= z0 && z <= z1) || (z >= z1 && z <= z0)) {
      const t = z1 === z0 ? 0 : (z - z0) / (z1 - z0)
      return { x: x0 + (x1 - x0) * t, z }
    }
  }
  return { x: 17.6, z }
}

// From a to b, by the road when the trip changes level.
export function route(a: Pt, b: Pt): Pt[] {
  if (Math.abs(a.z - b.z) < 2.5 && Math.abs(a.x - b.x) < 18) return [a, b]
  const pts: Pt[] = [a]
  const lowA = laneZ(a), lowB = laneZ(b)
  if (Math.abs(lowA - a.z) > 0.05) pts.push({ x: a.x, z: lowA })
  pts.push(roadAt(lowA))
  const dir = Math.sign(lowB - lowA)
  for (const [x, z] of ROAD) if (z > -9.6 && (z - lowA) * dir > 0 && (lowB - z) * dir > 0) pts.push({ x, z })
  pts.push(roadAt(lowB))
  if (Math.abs(lowB - b.z) > 0.05) pts.push({ x: b.x, z: lowB })
  pts.push(b)
  return pts
}

// Inside the fields, travel along the headland above so as not to cross the crop.
function laneZ(p: Pt): number {
  for (const f of FIELDS) if (p.z >= f.z0 - LANE - 0.4 && p.z <= f.z1 + 0.6 && p.x < 16.4) return f.z0 - LANE
  return p.z
}

// Up one simulated row and back down the next: four planted rows to a pass.
export function serpentine(field: number, rows: number[]): Pt[] {
  const f = FIELDS[field]
  const pts: Pt[] = []
  for (const r of rows) {
    const z = f.z0 + (r + 0.5) * SZ
    const a = { x: f.x1 + 0.8, z }, b = { x: f.x0 - 0.8, z }
    if (r % 2 === 0) pts.push(a, b)
    else pts.push(b, a)
  }
  return pts
}

function scoutWalk(field: number): Pt[] {
  const f = FIELDS[field]
  const pts: Pt[] = []
  for (let k = 0; k <= 6; k++) {
    const x = f.x1 - 0.5 - (k / 6) * (f.x1 - f.x0 - 1)
    pts.push({ x, z: k % 2 ? f.z1 - 1.2 : f.z0 + 1.2 })
  }
  return pts
}

function changed(a: HillDisplay, look: HillLook, ridge: number, kind: JobKind): boolean {
  switch (kind) {
    case 'plant': return (a.look.kind === 'bare' && look.kind !== 'bare') || Math.abs(a.ridge - ridge) > 0.01
    case 'hill': return Math.abs(a.ridge - ridge) > 0.01
    case 'kill': return a.look.kind === 'plant' && look.kind === 'dead'
    case 'dig': case 'sample': return a.look.kind !== 'dug' && look.kind === 'dug'
    case 'rogue': return a.look.kind !== 'pulled' && look.kind === 'pulled'
    case 'scout': return a.look.blight === 0 && look.blight > 0
    default: return false
  }
}

// Plan the day that just passed. `shown` is what is on screen now, `snap` the new state; `from` is where the tractor is.
export function planDay(snap: Snapshot, shown: HillDisplay[][], from: Pt, sampleHills: Map<number, number>): Seg[] {
  const segs: Seg[] = []
  let at = from
  const claimed = new Set<number>()
  // A test dig comes first, then any digging: they are what the player is waiting to see.
  const first = (w: Work) => (w.kind === 'sample' ? 2 : w.kind === 'dig' ? 1 : 0)
  const list: Work[] = snap.worked.slice().sort((a, b) => first(b) - first(a))
  for (const w of list) {
    const f = snap.fields[w.field]
    const reveals: Reveal[] = []
    const changedHills: number[] = []
    for (let h = 0; h < HILLS; h++) {
      const key = w.field * HILLS + h
      if (claimed.has(key)) continue
      if (changed(shown[w.field][h], f.hills[h], f.ridge, w.kind)) {
        if (w.kind === 'sample' && sampleHills.has(w.field) && sampleHills.get(w.field) !== h) continue
        changedHills.push(h)
        claimed.add(key)
      }
    }
    const tractor = TRACTOR_JOBS.has(w.kind)
    let path: Pt[]
    if (tractor) {
      let rows = [0, 1, 2, 3, 4, 5, 6, 7]
      if (w.kind === 'dig' && changedHills.length) {
        const set = new Set(changedHills.map(h => Math.floor(h / COLS)))
        rows = rows.filter(r => set.has(r))
      }
      path = serpentine(w.field, rows)
    } else if (w.kind === 'scout') {
      path = scoutWalk(w.field)
    } else {
      const start = parkSpot(w.field)
      path = [{ x: start.x - 0.5, z: start.z + 0.6 }]
      const order = changedHills.slice().sort((a, b) => (Math.floor(a / COLS) - Math.floor(b / COLS)) || ((a % COLS) - (b % COLS)) * (Math.floor(a / COLS) % 2 ? 1 : -1))
      for (const h of order) {
        const p = hillPos(w.field, h)
        // The farmer stands in the furrow below the hill, facing it.
        path.push({ x: p.x + 0.1, z: p.z + SZ * 0.62 })
      }
      if (order.length === 0) path.push(hillPos(w.field, Math.floor(HILLS / 2)))
      // A test dig ends at the hill: the farmer stays to look at what came up.
      if (w.kind !== 'sample' || order.length === 0) path.push({ x: start.x - 0.5, z: start.z + 0.6 })
    }
    const poly = new Poly(path)
    const lag = tractor ? (w.kind === 'dig' ? 1.7 : w.kind === 'plant' ? 1.1 : 1.0) : 0.05
    for (const h of changedHills) {
      const p = hillPos(w.field, h)
      reveals.push({
        field: w.field, hill: h, at: Math.min(poly.length, poly.nearest(p.x, p.z) + lag), look: f.hills[h], ridge: f.ridge,
        tubers: w.kind === 'dig' ? 'dig' : w.kind === 'sample' ? 'sample' : '',
      })
    }
    reveals.sort((a, b) => a.at - b.at)
    const target = tractor ? path[0] : parkSpot(w.field)
    segs.push({ kind: w.kind, field: w.field, walker: !tractor, travel: route(at, target), path, reveals, start: 0, end: 0 })
    at = tractor ? path[path.length - 1] : target
  }
  if (!segs.length) {
    // Nothing done today: head for the next job, or home to the potato house.
    const dest = snap.next ? parkSpot(snap.next.field) : SHED_SPOT
    if (Math.hypot(dest.x - at.x, dest.z - at.z) > 0.3) segs.push({ kind: 'travel', field: -1, walker: false, travel: route(at, dest), path: [dest], reveals: [], start: 0, end: 0 })
  }
  // Share the day: travel is quick, real work takes most of it.
  const weight = (s: Seg) => (s.kind === 'travel' ? 0.6 : 1)
  const total = segs.reduce((a, s) => a + weight(s), 0)
  let t = 0
  for (const s of segs) {
    s.start = t / total
    t += weight(s)
    s.end = t / total
  }
  return segs
}

export function heightAt(x: number, z: number): number {
  return fieldAt(x, z) >= 0 ? fieldBaseY(z) + 0.05 : groundY(x, z)
}
