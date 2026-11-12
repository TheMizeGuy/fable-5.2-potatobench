// The farm's day, replayed: where each person goes, on foot or on a machine, by the farm's roads, the path each works,
// and which hills change as they pass (planted, hilled, killed, dug, pulled, blight found).
import { COLS, HILLS, ROWS, type BuildingKind, type HillLook, type JobKind } from '../sim/index.ts'
import type { HillDisplay } from './fields.ts'
import {
  BARN, DUFOUR_POTATO_HOUSE, FIELDS, HOUSE, POTATO_HOUSE, SZ, fieldAt, fieldBaseY, groundY, hillPos, parkSpot, route, yardSpot, type Pt,
} from './layout.ts'
import type { Snapshot, UnitVis } from './state.ts'

export type { Pt }
export type Ride = '' | 'tractor' | 'truck'

export interface Reveal { field: number; hill: number; at: number; look: HillLook; ridge: number; tubers: 'dig' | 'sample' | '' }

export interface Seg {
  kind: JobKind | 'travel'
  field: number
  walker: boolean        // worked on foot
  ride: Ride             // what the person is on for this part of the day
  walkTo: Pt[]           // on foot to where the machine stands, before the drive
  travel: Pt[]           // how the crew gets there
  path: Pt[]             // the working pass
  reveals: Reveal[]      // `at` is arc length along `path`
  start: number          // share of the day
  end: number
  site: string           // the work's own staging, shared by everyone at it ('' for work along a path)
  polys?: { walkTo: Poly; travel: Poly; path: Poly }
}

// Work done from a tractor's seat along the rows.
export const ROW_JOBS = new Set<string>(['plant', 'hill', 'spray', 'kill', 'water', 'dig'])
// Work that takes a machine.
export const MACHINE_JOBS = new Set<string>([...ROW_JOBS, 'haul'])
// Work staged at one place, by everyone who is at it.
export const SITE_JOBS = new Set<string>(['fell', 'rocks', 'brush', 'build', 'haul'])

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

// ---- Places. Where people and machines stand in the yards, and where each kind of work is staged. The yards' own plan
// (doors, building sites) belongs to layout.ts; until it gives them, these stand in.

export interface Spot { x: number; z: number; heading: number }

// The big doors of the potato houses, facing down the slope: where barrels come in.
export function houseDoor(yard: number): Spot {
  return yard === -2 ? { x: DUFOUR_POTATO_HOUSE.x, z: DUFOUR_POTATO_HOUSE.z + 3.5, heading: -Math.PI / 2 } : { x: POTATO_HOUSE.x, z: POTATO_HOUSE.z + 4.3, heading: -Math.PI / 2 }
}

// The potato house a field's crop goes to: the nearer of the farm's.
export function houseFor(field: number, dufour: boolean): number {
  if (!dufour) return -1
  const f = FIELDS[field]
  const d = (yard: number) => { const h = houseDoor(yard); return Math.abs(f.cx - h.x) + Math.abs(f.cz - h.z) }
  return d(-2) < d(-1) ? -2 : -1
}

// Where each machine is kept: the tractors on the potato house apron, the truck by the barn.
export function machineHome(kind: 'tractor' | 'truck', k: number): Spot {
  if (kind === 'truck') return { x: BARN.x - 3.9, z: BARN.z + 2.6, heading: 0.25 }
  return yardSpot(-1, k, false)
}

// A day off: the porch and the dooryard. Each: where, which way they face, and whether they sit (the seat's height).
export function sundaySpot(k: number): Spot & { seat: number } {
  const hx = HOUSE.x, hz = HOUSE.z
  const spots: [number, number, number, number][] = [
    [hx - 2.02, hz - 2.6, Math.PI, 0.1], [hx - 2.02, hz - 3.5, Math.PI, 0.1], [hx - 3.2, hz - 2.9, 0.2, -1], [hx - 3.5, hz - 1.6, -0.9, -1],
    [hx - 3.0, hz - 0.9, 2.4, 0], [hx - 2.02, hz - 4.1, Math.PI, 0.1], [hx - 4.0, hz - 3.6, 0.5, 0], [hx - 3.7, hz - 4.6, -0.6, -1],
    [hx - 2.7, hz + 0.6, 1.9, 0], [hx - 4.4, hz - 2.2, 0.1, -1], [hx - 3.3, hz + 1.4, -2.2, 0], [hx - 4.6, hz - 0.6, 0.9, -1],
  ]
  const [x, z, heading, seat] = spots[k % spots.length]
  return { x, z, heading, seat }
}

// Laid up: a chair on the porch.
export function sickSpot(k: number): Spot {
  return { x: HOUSE.x - 1.75, z: HOUSE.z - 2.3 - (k % 3) * 0.55, heading: Math.PI }
}

// Where people stand about before the season and between jobs at home: the farmer by the kitchen door, the rest by the barn.
export function idleSpot(yard: number, slot: number, farmer: boolean): Spot {
  if (yard === -1 && farmer) return { x: HOUSE.x - 2.9, z: HOUSE.z - 2.0, heading: 2.6 }
  return yardSpot(yard, slot, true)
}

// Callers: where someone waits at the gate, where a neighbour's truck pulls in, where a buyer leaves his car.
export const GATE: Spot = { x: 18.7, z: 4.9, heading: 0.5 }
export const CALLER: { truck: Spot; man: Spot } = { truck: { x: 19.6, z: 3.45, heading: 0.06 }, man: { x: 20.5, z: 2.6, heading: 0.9 } }
export const BUYER: { car: Spot; man: Spot } = { car: { x: 20.0, z: -10.9, heading: -0.88 }, man: { x: POTATO_HOUSE.x - 0.9, z: POTATO_HOUSE.z + 4.9, heading: -1.2 } }
// Where the road leaves the picture, for people coming to the farm and leaving it.
export const OFF_FARM: Pt = { x: 19.2, z: 38 }

// A building's site: where the work stands (the site's edge, toward the yard), and which way the building lies.
export function buildSite(kind: BuildingKind, yard: number): Spot {
  if (yard === -2) return kind === 'bunk' ? { x: 96.6, z: -11.6, heading: 0 } : { x: 86.6, z: -13.2, heading: -Math.PI / 2 }
  const home: Record<BuildingKind, Spot> = {
    house: { x: 28.2, z: -15.6, heading: -Math.PI / 2 },
    shed: { x: 27.8, z: -8.6, heading: 0 },
    bunk: { x: 27.9, z: -2.2, heading: 0 },
    packing: { x: 19.9, z: -15.6, heading: -Math.PI / 2 },
    pond: { x: 28.6, z: 9.6, heading: 0 },
    stand: { x: 19.3, z: 19.2, heading: 0 },
    station: { x: 27.2, z: 7.6, heading: 0 },
    road: { x: 17.6, z: 0.4, heading: Math.PI / 2 },
  }
  return home[kind]
}

// Where a crew stands when it is at a place and not working: a field's corner, or its spot at a yard.
export function restAt(place: number, slot: number, walker: boolean): Pt & { heading: number } {
  if (place < 0) return yardSpot(place, slot, walker)
  const p = parkSpot(place, slot)
  return { ...p, heading: Math.PI }
}

// Where the work on a parcel is staged for those who do it at one place: felling at the wood's edge on the lane,
// rocks and brush along the field.
export function siteAt(kind: JobKind, field: number): Spot {
  const f = FIELDS[field]
  if (!f) return { x: 0, z: 0, heading: 0 }
  if (kind === 'fell') return { x: f.cx, z: f.z1 - 1.6, heading: -Math.PI / 2 }
  if (kind === 'brush') return { x: f.cx, z: f.z1 + 0.5, heading: Math.PI / 2 }
  if (kind === 'haul') return { x: f.x1 + 0.9, z: f.cz, heading: -Math.PI / 2 }
  return { x: f.cx, z: f.cz, heading: 0 }
}

// How a field is watered: from the pond through a line of pipe, with the reel and its gun, or from a tank wagon.
export function waterWay(snap: Snapshot, field: number): 'tank' | 'reel' | 'pipe' {
  const block = FIELDS[field]?.block
  if (snap.farm.pond > 0.01 && (block === 'home' || block === 'brook')) return 'pipe'
  return snap.farm.equipment.includes('reel') ? 'reel' : 'tank'
}

// Up one simulated row and back down the next: four planted rows to a pass, with a turn out on the headland between.
export function serpentine(field: number, rows: number[]): Pt[] {
  const f = FIELDS[field]
  const pts: Pt[] = []
  rows.forEach((r, k) => {
    const z = f.z0 + (r + 0.5) * SZ
    const a = { x: f.x1 + 0.5, z }, b = { x: f.x0 - 0.5, z }
    const from = k % 2 === 0 ? a : b, to = k % 2 === 0 ? b : a
    if (k > 0) {
      // swing round on the headland from the last row's end to this one's start
      const prev = pts[pts.length - 1], out = k % 2 === 0 ? 1 : -1
      const mid = (prev.z + from.z) / 2, half = (from.z - prev.z) / 2
      for (let n = 1; n < 6; n++) {
        const t = (n / 6) * Math.PI
        pts.push({ x: prev.x + out * Math.sin(t) * Math.min(1.1, Math.abs(half) * 1.4 + 0.25), z: mid - half * Math.cos(t) })
      }
    }
    pts.push(from, to)
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

// A person as the day begins: where they stand, what they will be on today, and where that machine stands now.
export interface CrewFrom { id: number; at: Pt; slot: number; ride: Ride; machine: Pt | null; farmer: boolean; goal: Spot | null }

// Plan the day that just passed for every person. `shown` is what is on screen now, `snap` the new state; each starts
// where they stand on screen. Returns each one's segments, in the order of `crews`.
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
    if (field >= 0 && f) {
      for (let h = 0; h < HILLS; h++) {
        const k = field * HILLS + h
        if (claimed.has(k) || !changed(shown[field][h], f.hills[h], f.ridge, kind)) continue
        if (kind === 'sample' && sampleHills.has(field) && sampleHills.get(field) !== h) continue
        hills.push(h)
        claimed.add(k)
      }
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
    let machine = crew.machine
    // To a place: on the machine when today's work has one (walking to it first if it stands elsewhere), else on foot.
    const go = (to: Pt, ride: Ride): { walkTo: Pt[]; travel: Pt[] } => {
      if (!ride) return { walkTo: [], travel: route(at, to) }
      const m = machine ?? at
      const walkTo = Math.hypot(m.x - at.x, m.z - at.z) > 1.2 ? route(at, m) : []
      return { walkTo, travel: route(m, to) }
    }
    if (u && !u.hurt && !u.resting) {
      const order = u.worked.slice().sort((a, b) => first(`${b.field}|${b.kind}`) - first(`${a.field}|${a.kind}`))
      for (const w of order) {
        const key = `${w.field}|${w.kind}`
        const ride: Ride = MACHINE_JOBS.has(w.kind) ? crew.ride : ''
        const way = w.kind === 'water' ? waterWay(snap, w.field) : 'tank'
        if (SITE_JOBS.has(w.kind) || way !== 'tank') {
          // Staged at one place: the stage puts each worker where the work wants them.
          const yard = w.kind === 'build'
          const going = snap.farm.buildings.find(x => !x.built && x.yard === w.field)
          const spot = yard ? buildSite(going ? going.kind : 'shed', w.field) : siteAt(way !== 'tank' ? 'haul' : w.kind, w.field)
          const { walkTo, travel } = go(spot, ride)
          segs.push({ kind: w.kind, field: w.field, walker: !ride, ride, walkTo, travel, path: [{ x: spot.x, z: spot.z }], reveals: [], start: 0, end: 0, site: way !== 'tank' ? `${w.field}|${way}` : key })
          at = { x: spot.x, z: spot.z }
          if (ride) machine = at
          continue
        }
        const f = snap.fields[w.field]
        const { hills, rows } = share(key, crew.id)
        const tractor = ROW_JOBS.has(w.kind) && ride === 'tractor'
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
        const { walkTo, travel } = go(path[0], tractor ? 'tractor' : '')
        segs.push({ kind: w.kind, field: w.field, walker: !tractor, ride: tractor ? 'tractor' : '', walkTo, travel, path, reveals, start: 0, end: 0, site: '' })
        at = path[path.length - 1]
        if (tractor) machine = at
      }
      // Still on the road at the end of the day: as far along the way as the farm's day took them.
      if (u.to !== u.at) {
        const ride: Ride = u.job && MACHINE_JOBS.has(u.job.kind) ? crew.ride : ''
        const dest = restAt(u.to, crew.slot, !ride)
        const { walkTo, travel } = go(dest, ride)
        const trip = new Poly(travel)
        if (trip.length > 0.3) {
          const part = u.along >= 1 ? trip.pts : trip.upTo(trip.length * u.along)
          segs.push({ kind: 'travel', field: -1, walker: !ride, ride, walkTo, travel: part, path: [part[part.length - 1]], reveals: [], start: 0, end: 0, site: '' })
        }
      } else if (!u.worked.length && crew.goal === null && u.at >= 0) {
        // nothing done today and nowhere to go: at the field they were left at
        const dest = restAt(u.at, crew.slot, true)
        if (Math.hypot(dest.x - at.x, dest.z - at.z) > 3) segs.push({ kind: 'travel', field: -1, walker: true, ride: '', walkTo: [], travel: route(at, dest), path: [dest], reveals: [], start: 0, end: 0, site: '' })
      }
    }
    // A day off, a day laid up, or nothing to do in the yard: to where that is spent.
    if (crew.goal && !segs.length && Math.hypot(crew.goal.x - at.x, crew.goal.z - at.z) > 0.4) {
      const travel = route(at, crew.goal)
      segs.push({ kind: 'travel', field: -1, walker: true, ride: '', walkTo: [], travel, path: [{ x: crew.goal.x, z: crew.goal.z }], reveals: [], start: 0, end: 0.5, site: '' })
      return segs
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
