// The crews' day, replayed: where each tractor and each person on foot goes, by the farm's roads, the path each works,
// and which hills change as they pass (planted, hilled, killed, dug, pulled, blight found).
import { COLS, HILLS, ROWS, type HillLook, type JobKind, type UnitKind } from '../sim/index.ts'
import type { HillDisplay } from './fields.ts'
import { FIELDS, SZ, fieldAt, fieldBaseY, groundY, hillPos, parkSpot, route, yardSpot, type Pt } from './layout.ts'
import type { Snapshot, UnitVis } from './state.ts'

export type { Pt }

export interface Reveal { field: number; hill: number; at: number; look: HillLook; ridge: number; tubers: 'dig' | 'sample' | '' }

export interface Seg {
  kind: JobKind | 'travel'
  field: number
  walker: boolean        // worked on foot
  travel: Pt[]           // how the crew gets there
  path: Pt[]             // the working pass
  reveals: Reveal[]      // `at` is arc length along `path`
  start: number          // share of the day
  end: number
  polys?: { travel: Poly; path: Poly }
}

export const TRACTOR_JOBS = new Set<string>(['plant', 'hill', 'spray', 'kill', 'water', 'dig'])

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
  // The path up to arc length s.
  upTo(s: number): Pt[] {
    const out: Pt[] = [this.pts[0]]
    for (let k = 1; k < this.pts.length; k++) {
      if (this.cum[k] >= s) { const p = this.at(s); out.push({ x: p.x, z: p.z }); return out }
      out.push(this.pts[k])
    }
    return out
  }
}

// Where a crew stands when it is at a place and not working: a field's corner, or its spot at a yard.
export function restAt(place: number, slot: number, walker: boolean): Pt & { heading: number } {
  if (place < 0) return yardSpot(place, slot, walker)
  const p = parkSpot(place, slot)
  return { ...p, heading: Math.PI }
}

// Up one simulated row and back down the next: four planted rows to a pass.
export function serpentine(field: number, rows: number[]): Pt[] {
  const f = FIELDS[field]
  const pts: Pt[] = []
  rows.forEach((r, k) => {
    const z = f.z0 + (r + 0.5) * SZ
    const a = { x: f.x1 + 0.8, z }, b = { x: f.x0 - 0.8, z }
    if (k % 2 === 0) pts.push(a, b)
    else pts.push(b, a)
  })
  return pts
}

function scoutWalk(field: number, flip: boolean): Pt[] {
  const f = FIELDS[field]
  const pts: Pt[] = []
  for (let k = 0; k <= 6; k++) {
    const x = f.x1 - 0.5 - (k / 6) * (f.x1 - f.x0 - 1)
    pts.push({ x, z: (k % 2 ? 1 : 0) !== (flip ? 1 : 0) ? f.z1 - 1.2 : f.z0 + 1.2 })
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

export interface CrewFrom { id: number; kind: UnitKind; at: Pt; slot: number }

// Plan the day that just passed for every crew. `shown` is what is on screen now, `snap` the new state; each crew starts
// where it stands on screen. Returns each crew's segments, in the order of `crews`.
export function planDay(snap: Snapshot, shown: HillDisplay[][], crews: CrewFrom[], sampleHills: Map<number, number>): Seg[][] {
  const units = new Map<number, UnitVis>(snap.units.map(u => [u.id, u]))
  // Who worked each field at each job today, in order: they share out the hills that changed.
  const sharers = new Map<string, number[]>()
  for (const u of snap.units) for (const w of u.worked) {
    const key = `${w.field}|${w.kind}`
    const list = sharers.get(key) ?? []
    if (!list.includes(u.id)) list.push(u.id)
    sharers.set(key, list)
  }
  // The hills each job changed. A test dig first, then any digging: they are what the player is waiting to see.
  const first = (k: string) => (k.endsWith('|sample') ? 2 : k.endsWith('|dig') ? 1 : 0)
  const claimed = new Set<number>()
  const hillsFor = new Map<string, number[]>()
  for (const key of [...sharers.keys()].sort((a, b) => first(b) - first(a))) {
    const [fs, kind] = key.split('|') as [string, JobKind]
    const field = Number(fs), f = snap.fields[field]
    const hills: number[] = []
    // Building is done in a yard (a negative place): there are no hills to change.
    if (!f) { hillsFor.set(key, hills); continue }
    for (let h = 0; h < HILLS; h++) {
      const k = field * HILLS + h
      if (claimed.has(k) || !changed(shown[field][h], f.hills[h], f.ridge, kind)) continue
      if (kind === 'sample' && sampleHills.has(field) && sampleHills.get(field) !== h) continue
      hills.push(h)
      claimed.add(k)
    }
    hillsFor.set(key, hills)
  }
  // Split a job's changed hills between its crews by rows, the first crew taking the first rows.
  const share = (key: string, id: number): { hills: number[]; rows: number[] } => {
    const list = sharers.get(key) ?? [id], n = list.length, k = Math.max(0, list.indexOf(id))
    const r0 = Math.floor((k * ROWS) / n), r1 = Math.floor(((k + 1) * ROWS) / n)
    const rows: number[] = []
    for (let r = r0; r < r1; r++) rows.push(r)
    const hills = (hillsFor.get(key) ?? []).filter(h => n === 1 || (Math.floor(h / COLS) >= r0 && Math.floor(h / COLS) < r1))
    return { hills, rows }
  }

  return crews.map(crew => {
    const u = units.get(crew.id)
    const segs: Seg[] = []
    let at = crew.at
    const onFoot = crew.kind === 'hand'
    if (u) {
      const order = u.worked.slice().sort((a, b) => first(`${b.field}|${b.kind}`) - first(`${a.field}|${a.kind}`))
      for (const w of order) {
        if (w.field < 0) continue
        const key = `${w.field}|${w.kind}`
        const f = snap.fields[w.field]
        const { hills, rows } = share(key, crew.id)
        const tractor = TRACTOR_JOBS.has(w.kind) && !onFoot
        let path: Pt[]
        const start = parkSpot(w.field, crew.slot)
        if (tractor) {
          let passes = rows
          if (w.kind === 'dig' && hills.length) {
            const set = new Set(hills.map(h => Math.floor(h / COLS)))
            passes = rows.filter(r => set.has(r))
            if (!passes.length) passes = [...set].sort((a, b) => a - b)
          }
          path = serpentine(w.field, passes)
        } else if (w.kind === 'scout') {
          path = scoutWalk(w.field, crew.slot % 2 === 1)
        } else {
          path = [{ x: start.x - 0.5, z: start.z + 0.6 }]
          const byRow = hills.slice().sort((a, b) => (Math.floor(a / COLS) - Math.floor(b / COLS)) || ((a % COLS) - (b % COLS)) * (Math.floor(a / COLS) % 2 ? 1 : -1))
          for (const h of byRow) {
            const p = hillPos(w.field, h)
            // The walker stands in the furrow below the hill, facing it.
            path.push({ x: p.x + 0.1, z: p.z + SZ * 0.62 })
          }
          if (byRow.length === 0) path.push(hillPos(w.field, Math.floor(HILLS / 2)))
          // A test dig ends at the hill: whoever dug it stays to look at what came up.
          if (w.kind !== 'sample' || byRow.length === 0) path.push({ x: start.x - 0.5, z: start.z + 0.6 })
        }
        const poly = new Poly(path)
        const lag = tractor ? (w.kind === 'dig' ? 1.7 : w.kind === 'plant' ? 1.1 : 1.0) : 0.05
        const reveals: Reveal[] = hills.map(h => {
          const p = hillPos(w.field, h)
          return {
            field: w.field, hill: h, at: Math.min(poly.length, poly.nearest(p.x, p.z) + lag), look: f.hills[h], ridge: f.ridge,
            tubers: w.kind === 'dig' ? 'dig' : w.kind === 'sample' ? 'sample' : '',
          }
        })
        reveals.sort((a, b) => a.at - b.at)
        // A hand walks to where the job starts; the farmer drives the tractor to the field's corner and walks from it.
        const target = tractor ? path[0] : onFoot ? path[0] : start
        segs.push({ kind: w.kind, field: w.field, walker: !tractor, travel: route(at, target), path, reveals, start: 0, end: 0 })
        at = tractor ? path[path.length - 1] : onFoot ? path[path.length - 1] : target
      }
      // Still on the road at the end of the day: as far along the drive as the farm's day took it.
      const goal = u.to !== u.at ? u.to : u.worked.length ? -99 : u.at
      if (goal !== -99) {
        const dest = restAt(goal, crew.slot, onFoot)
        const trip = new Poly(route(at, dest))
        const along = u.to !== u.at ? u.along : 1
        if (trip.length > 0.3) {
          const travel = along >= 1 ? trip.pts : trip.upTo(trip.length * along)
          segs.push({ kind: 'travel', field: -1, walker: onFoot, travel, path: [travel[travel.length - 1]], reveals: [], start: 0, end: 0 })
        }
      }
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
  })
}

export function heightAt(x: number, z: number): number {
  return fieldAt(x, z) >= 0 ? fieldBaseY(z) + 0.05 : groundY(x, z)
}
