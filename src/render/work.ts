// The farm's day, replayed: where each person goes, on foot or on a machine, by the farm's roads, the path each works,
// and which hills change as they pass (planted, hilled, killed, dug, pulled, blight found).
import { COLS, HAUL_CWT_DAY, HILLS, PARCELS, TRUCK_HAUL, type BuildingKind, type HillLook, type JobKind } from '../sim/index.ts'
import type { HillDisplay } from './fields.ts'
import {
  BARN, BAYS, DUFOUR_POTATO_HOUSE, FD, FIELDS, FW, HOUSE, PLANTED_ROWS, POTATO_HOUSE, ROAD, ROW, SPURS, SX, TRUCK_SPOT, WALLS, fieldAt, fieldBaseY, groundY, hillPos, parkSpot, route,
  siteOf, yardSpot, type FieldRect, type Pt, type Spot,
} from './layout.ts'
import { K, S } from './scale.ts'
import type { Snapshot, UnitVis, Work } from './state.ts'

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
  lit: boolean           // planned with the clock stopped: worked literally, a pass at a time
  from: number           // where along `path` the work is taken up, as arc length
  loads?: number         // hauling: the loads this part of the day comes to
  help?: boolean         // standing by at the headland while the one tractor works this ground under someone else
  polys?: { walkTo: Poly; travel: Poly; path: Poly }
}

// Barrels to a load, on the truck's bed or the trailer's (what each is drawn carrying), and what a barrel holds.
export const LOAD = 16
const BARREL_CWT = 1.65

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

// ---- Places. The yards' plan is layout.ts's (sites, doors, bays); these say who stands where on it.

export type { Spot }

// The big doors of the old potato houses, facing down the slope: where barrels come in.
export function houseDoor(yard: number): Spot {
  return yard === -2 ? { x: DUFOUR_POTATO_HOUSE.x, z: DUFOUR_POTATO_HOUSE.z + 3.5 * S, heading: -Math.PI / 2 } : { x: POTATO_HOUSE.x, z: POTATO_HOUSE.z + 4.3 * S, heading: -Math.PI / 2 }
}

// The potato house a field's crop goes to: the nearer of the farm's.
export function houseFor(field: number, dufour: boolean): number {
  if (!dufour) return -1
  const f = FIELDS[field]
  const d = (yard: number) => { const h = houseDoor(yard); return Math.abs(f.cx - h.x) + Math.abs(f.cz - h.z) }
  return d(-2) < d(-1) ? -2 : -1
}

// The door a field's crop goes in by, and where a load stops before it: the yard's old potato house, or (for every
// other field) the second one once the farm has built it there.
export function cropDoor(snap: Snapshot, field: number): { door: Spot; stop: Pt } {
  const yard = houseFor(field, snap.farm.dufour)
  const second = field % 2 === 1 && snap.farm.buildings.some(b => b.kind === 'house' && b.built && b.yard === yard) ? siteOf('house', yard) : undefined
  const door = second ? { x: second.door.x, z: second.door.z, heading: Math.atan2(second.z - second.door.z, second.x - second.door.x) } : houseDoor(yard)
  return { door, stop: { x: door.x - Math.cos(door.heading) * 0.9 * S, z: door.z - Math.sin(door.heading) * 0.9 * S } }
}

// Where each machine is kept: in the machine shed's bays once it stands (the truck in the third while there are no
// more than two tractors); before that the one tractor on the potato house apron and the truck on the back lane.
export function machineHome(kind: 'tractor' | 'truck', k: number, shed: boolean, tractors: number): Spot {
  if (kind === 'truck') return shed && tractors <= 2 ? { ...BAYS[2], z: BAYS[2].z - 0.25 * S } : TRUCK_SPOT
  return shed ? BAYS[Math.min(k, BAYS.length - 1)] : yardSpot(-1, k, false)
}

// The house's kitchen porch, on the dooryard side: its edge, where people sit on a day off.
const PORCH = { x: HOUSE.x - 2.02 * S, z: HOUSE.z - 3.2 * S }

// A day off: the porch and the dooryard. Each: where, which way they face, and whether they sit (the seat's height).
export function sundaySpot(k: number): Spot & { seat: number } {
  const px = PORCH.x, pz = PORCH.z
  const spots: [number, number, number, number][] = [
    // the porch is railed along its upper half: people sit on the edge of the open half, by the steps
    [px, pz + 0.4, Math.PI, 0.1], [px, pz + 1.05, Math.PI, 0.1], [px - 1.2, pz + 0.3, 0.2, -1], [px - 1.5, pz + 1.6, -0.9, -1],
    [px - 1.0, pz + 2.3, 2.4, 0], [px - 0.5, pz - 1.7, 0.9, -1], [px - 2.0, pz - 0.4, 0.5, 0], [px - 1.7, pz - 1.4, -0.6, -1],
    [px - 0.7, pz + 3.8, 1.9, 0], [px - 2.4, pz + 1.0, 0.1, -1], [px - 1.3, pz + 4.6, -2.2, 0], [px - 2.6, pz + 2.6, 0.9, -1],
  ]
  // (written in the small units the porch was drawn in)
  const [x, z, heading, seat] = spots[k % spots.length]
  return { x: px + (x - px) * S, z: pz + (z - pz) * S, heading, seat: seat > 0 ? seat * S : seat }
}

// Laid up: a chair on the porch.
export function sickSpot(k: number): Spot {
  return { x: PORCH.x + 0.27 * S, z: PORCH.z + (0.9 - (k % 3) * 0.55) * S, heading: Math.PI }
}

// Where people stand about before the season and between jobs at home: the farmer by the kitchen door, the rest in the
// dooryard between the barn and the road, in loose knots, turned to one another.
export function idleSpot(yard: number, slot: number, farmer: boolean): Spot {
  if (yard === -1 && farmer) return { x: PORCH.x - 0.9 * S, z: PORCH.z + 1.2 * S, heading: 2.6 }
  if (yard !== -1) return yardSpot(yard, slot, true)
  const [x, z] = DOORYARD[slot % DOORYARD.length]
  const knot = DOORYARD_KNOTS[Math.floor((slot % DOORYARD.length) / 3) % DOORYARD_KNOTS.length]
  return { x, z, heading: Math.atan2(knot[1] - z, knot[0] - x) }
}
// Offsets from the ground before the barn's great door, which opens on the dooryard.
const YARD_DOOR = { x: BARN.x - 3.9 * S, z: BARN.z - 0.3 * S }
const DOORYARD: [number, number][] = ([
  [0.7, -0.7], [0, -0.1], [0.8, 0.3], [-0.3, -1.6], [0.3, -1.3], [-0.5, -2.3],
  [0.6, 2.2], [-0.2, 2.7], [-0.4, 1.7], [-0.9, -0.5], [-1.1, 0.4], [-0.4, 0.8],
] as [number, number][]).map(([x, z]) => [YARD_DOOR.x + x * S, YARD_DOOR.z + z * S])
const DOORYARD_KNOTS: [number, number][] = ([[0.5, -0.2], [-0.15, -1.75], [0, 2.2], [-0.8, 0.2]] as [number, number][]).map(([x, z]) => [YARD_DOOR.x + x * S, YARD_DOOR.z + z * S])
// What the dooryard and the porch are spread out from when people are drawn large.
export const DOORYARD_AT: Pt = { x: YARD_DOOR.x + 0.6 * S, z: YARD_DOOR.z - 0.1 * S }
export const PORCH_AT: Pt = { x: PORCH.x, z: PORCH.z + 0.2 * S }

// Callers. Someone asking for work waits where the house's spur leaves the farm road; a neighbour pulls in on the spur;
// a buyer leaves his car on the potato house apron.
const SPUR = SPURS[0]
export const GATE: Spot = { x: SPUR[0][0] + 0.9 * S, z: SPUR[0][1] + 1.3 * S, heading: 0.5 }
export const CALLER: { truck: Spot; man: Spot } = {
  truck: { x: SPUR[0][0] + 1.9 * S, z: SPUR[0][1] + 0.05 * S, heading: 0.06 }, man: { x: SPUR[0][0] + 2.8 * S, z: SPUR[0][1] - 0.8 * S, heading: 0.9 },
}
export const BUYER: { car: Spot; man: Spot } = { car: { x: POTATO_HOUSE.x - 3.4 * S, z: POTATO_HOUSE.z + 6.7 * S, heading: -0.88 }, man: { x: POTATO_HOUSE.x - 0.9 * S, z: POTATO_HOUSE.z + 4.9 * S, heading: -1.2 } }
// Where the road leaves the picture, for people coming to the farm and leaving it: beyond the bridge.
export const OFF_FARM: Pt = { x: ROAD[13][0], z: ROAD[13][1] }

// A building's site as the work sees it: where the carpenters' bench stands, out in front of its door and facing the
// building (for the pond and the road, which are dug and spread, the first of its work points).
export function buildSite(kind: BuildingKind, yard: number): Spot {
  const s = siteOf(kind, yard) ?? siteOf('shed', -1)!
  const earth = kind === 'pond' || kind === 'road'
  // (the farm stand fronts the town road: its bench stands at its side, off the road)
  const w = earth ? s.work[0] : kind === 'stand' ? s.work[3] : s.work[2]
  const dx = s.x - w.x, dz = s.z - w.z, l = Math.hypot(dx, dz) || 1
  const out = earth ? 0 : 1.3 * S
  return { x: w.x - (dx / l) * out, z: w.z - (dz / l) * out, heading: Math.atan2(dz, dx) }
}

// Where the winter's grading is done: at the packing shed's door, the table along its front.
export function packSite(): Spot {
  const s = siteOf('packing', -1)!
  const dx = s.x - s.door.x, dz = s.z - s.door.z, l = Math.hypot(dx, dz) || 1
  // (under the porch roof: the table and those on both sides of it stand on the porch's floor)
  return { x: s.door.x + (dx / l) * 0.09 * S, z: s.door.z + (dz / l) * 0.09 * S, heading: Math.atan2(dz, dx) + Math.PI / 2 }
}

// Where a crew stands when it is at a place and not working: a field's corner, or its spot at a yard.
export function restAt(place: number, slot: number, walker: boolean): Pt & { heading: number } {
  if (place < 0) return yardSpot(place, slot, walker)
  const p = parkSpot(place, slot)
  return { ...p, heading: Math.PI }
}

// Where the work on a parcel is staged for those who do it at one place: felling at the line the stand has been cut
// back to, rocks and brush along the field. `felled`: the share of a tract's felling done.
export function siteAt(kind: JobKind, field: number, felled = 0): Spot {
  const f = FIELDS[field]
  if (!f) return { x: 0, z: 0, heading: 0 }
  // The land fells a tract's woods from the farm's side (z1) and its brush from the road's (x0): the work stands on
  // the cut ground just short of the trees still up, facing them.
  if (kind === 'fell') {
    // (back from the line by about the reach of the work, so the tree being cut is the stand's outermost and the
    // people are out from under the canopy)
    const k = Math.min(0.9, Math.max(0, felled))
    return PARCELS[f.i].cover === 'brush' ? { x: f.x0 - 1.1 * S + k * FW, z: f.cz, heading: 0 } : { x: f.cx, z: f.z1 + 1.4 * S - k * FD, heading: -Math.PI / 2 }
  }
  if (kind === 'brush') return hedgeSpot(f)
  if (kind === 'haul') return { x: f.x1 + 0.9 * S, z: f.cz, heading: -Math.PI / 2 }
  return { x: f.cx, z: f.cz, heading: 0 }
}

// How a field is watered: from the pond through a line of pipe (when the pond was drawn on), with the reel and its
// gun, or from a tank wagon.
export function waterWay(snap: Snapshot, field: number, pondDrawn: boolean): 'tank' | 'reel' | 'pipe' {
  const block = FIELDS[field]?.block
  if (pondDrawn && (block === 'home' || block === 'brook')) return 'pipe'
  return snap.farm.equipment.includes('reel') ? 'reel' : 'tank'
}

// Where a field's hedgerow is cut back: on the headland by its nearest wall, facing the wall.
function hedgeSpot(f: FieldRect): Spot {
  let best: Spot = { x: f.cx, z: f.z1 + 0.6 * S, heading: Math.PI / 2 }, bd = Infinity
  for (const [x0, z0, x1, z1] of WALLS) {
    const upright = Math.abs(x1 - x0) < Math.abs(z1 - z0)
    if (upright) {
      if (f.cz < Math.min(z0, z1) - 3 * K || f.cz > Math.max(z0, z1) + 3 * K) continue
      const side = x0 > f.cx ? 1 : -1, edge = side > 0 ? f.x1 : f.x0, d = Math.abs(x0 - edge)
      if (d < bd) { bd = d; best = { x: edge + side * Math.max(0.15 * S, d - 1.25 * S), z: f.cz, heading: side > 0 ? 0 : Math.PI } }
    } else {
      if (f.cx < Math.min(x0, x1) - 3 * K || f.cx > Math.max(x0, x1) + 3 * K) continue
      const side = z0 > f.cz ? 1 : -1, edge = side > 0 ? f.z1 : f.z0, d = Math.abs(z0 - edge)
      if (d < bd) { bd = d; best = { x: f.cx, z: edge + side * Math.max(0.15 * S, d - 1.25 * S), heading: side > 0 ? Math.PI / 2 : -Math.PI / 2 } }
    }
  }
  return best
}

// ---- Work along the rows of a five-acre field.
// A day lasts about a second and a half at the clock's normal speed, and a planter's real day is seventy crossings of
// 173 m: the two cannot both be shown. The rule:
//  - Each day's work on a job covers a band of the field, from where the job stood to where it now stands (shares
//    of the field's depth, from its top). What is above the band is done; what is below is still to do.
//  - With the clock running, the machine (or the person on foot) works the band's leading row at a pace that looks
//    right on the screen, and the band behind them fills in over the day, from the top down to the row they are on.
//  - The way to a day's work is seen for most of a day's length on the clock (units.ts, WAY_DAY), at a pace that
//    reads from where the camera is; a way too long for that is cut to its start and its last stretch. The work
//    begins when they are there: the picture is that far behind the day, the day is not held.
//  - With the clock stopped (a day stepped or replayed), it is literal: they go at a machine's and a person's real
//    pace, back and forth over the band a pass at a time, turning on the headland, and the ground changes where they
//    have been. A test dig and a day's digging are the exceptions: the interface waits to see them, so they play
//    as a running day does.

// Speeds at human pace, metres a second (used whenever the clock is stopped, and for those on foot at a site).
export const PACE = { walk: 1.4, worn: 1.0, lane: 5.5, work: 2.4, truck: 8.5 }
// How far past the field's end a machine runs before it turns, and the radius it turns on. The headlands are at
// least 17 m wide everywhere, so a turn stays inside the walls and off the lane beyond.
const RUN_OUT = 4, TURN = 5

// The way from a to b by the farm's roads: out of a crop along the row they are in, never across it.
export function wayFrom(a: Pt, b: Pt): Pt[] {
  const fi = fieldAt(a.x, a.z)
  if (fi < 0 || Math.hypot(a.x - b.x, a.z - b.z) < 2.5 * S) return route(a, b)
  const f = FIELDS[fi], end = { x: Math.abs(a.x - f.x0) < Math.abs(a.x - f.x1) ? f.x0 - RUN_OUT : f.x1 + RUN_OUT, z: a.z }
  return [a, ...route(end, b)]
}

// Where someone stands by while the tractor works their part of a field: off the rows' end, beside where it turns.
function standBy(field: number, top: number): Pt {
  const f = FIELDS[field]
  return { x: f.x1 + 2.6, z: Math.max(f.z0 + 1.5, Math.min(f.z1 - 1.5, f.z0 + top * FD - 3.5)) }
}

// Whether a machine stands in a field or on the headland at its ends.
function inField(field: number, p: Pt): boolean {
  const f = FIELDS[field]
  return p.x > f.x0 - RUN_OUT - TURN - 2 && p.x < f.x1 + RUN_OUT + TURN + 2 && p.z > f.z0 - 1 && p.z < f.z1 + 1
}

// The crossings for the share of a job from p0 to p1 of the field's depth (0 at its top), starting from the end
// nearer to `fromX`.
export function crossings(field: number, p0: number, p1: number, n: number, fromX: number): Pt[] {
  const f = FIELDS[field]
  const c = (v: number) => Math.max(0, Math.min(1, v))
  const b0 = f.z0 + c(Math.min(p0, p1)) * FD, b1 = f.z0 + c(Math.max(p0, p1)) * FD
  if (b1 - b0 < 6) n = 1
  const rowZ = (z: number) => f.z0 + (Math.max(0, Math.min(PLANTED_ROWS - 1, Math.round((z - f.z0) / ROW - 0.5))) + 0.5) * ROW
  let east = Math.abs(fromX - f.x1) <= Math.abs(fromX - f.x0)
  const pts: Pt[] = []
  let last = 0
  for (let k = 0; k < n; k++) {
    const z = rowZ(b0 + ((k + 0.5) / n) * (b1 - b0))
    const a = { x: f.x1 + RUN_OUT, z }, b = { x: f.x0 - RUN_OUT, z }
    if (k > 0) {
      // round on the headland from the last row's end to this one's start
      const out = east ? 1 : -1, x = east ? a.x : b.x, dz = z - last, sg = Math.sign(dz) || 1
      if (Math.abs(dz) > 2 * TURN) pts.push({ x: x + out * TURN, z: last + sg * TURN }, { x: x + out * TURN, z: z - sg * TURN })
      else for (let m = 1; m < 5; m++) { const t = (m / 5) * Math.PI; pts.push({ x: x + out * Math.sin(t) * (Math.abs(dz) / 2 + 1.5), z: (last + z) / 2 - (dz / 2) * Math.cos(t) }) }
    }
    pts.push(east ? a : b, east ? b : a)
    last = z
    east = !east
  }
  return pts
}

function scoutWalk(field: number, flip: boolean): Pt[] {
  const f = FIELDS[field]
  const pts: Pt[] = []
  for (let k = 0; k <= 3; k++) {
    const x = f.x1 - 6 - (k / 3) * (f.x1 - f.x0 - 12)
    pts.push({ x, z: (k % 2 ? 1 : 0) !== (flip ? 1 : 0) ? f.z1 - 1.2 * S : f.z0 + 1.2 * S })
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
// working: the row work their machine was at when the day began ('field|kind'), or ''.
export interface CrewFrom { id: number; at: Pt; slot: number; ride: Ride; machine: Pt | null; farmer: boolean; goal: Spot | null; working: string; arrives?: boolean }

// How far each job had got when the day began: by field and kind, 0..1 (undefined when it was not seen before).
export type Before = (key: string) => number | undefined

// Plan the day that just passed for every person. `shown` is what is on screen now, `snap` the new state; each starts
// where they stand on screen. Returns each one's segments, in the order of `crews`.
export function planDay(snap: Snapshot, shown: HillDisplay[][], crews: CrewFrom[], sampleHills: Map<number, number>, pondDrawn = false, before: Before = () => undefined, literal = false): Seg[][] {
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
  // The day's band of each job (from where it stood to where it stands, as shares of the field's depth), split between
  // those who worked it, the first taking the upper part; and the changed hills each takes: those nearest their part.
  const bandOf = (key: string): [number, number] => {
    const [fs, kind] = key.split('|')
    let p1 = 1
    for (const u of snap.units) for (const w of u.worked) if (w.kind === kind && String(w.field) === fs && w.share !== undefined) p1 = w.share
    // a job that covers the whole field every time it is done
    if (kind === 'spray' || kind === 'scout') return [0, 1]
    const was = before(key)
    const p0 = was === undefined || was > p1 + 1e-6 ? (p1 > 0.99 && was === undefined ? 0 : was === undefined ? Math.max(0, p1 - 0.5) : 0) : was
    return [p0, p1]
  }
  const share = (key: string, id: number): { hills: number[]; band: [number, number] } => {
    const list = sharers.get(key) ?? [id], n = list.length, k = Math.max(0, list.indexOf(id))
    const [p0, p1] = bandOf(key)
    const band: [number, number] = [p0 + ((p1 - p0) * k) / n, p0 + ((p1 - p0) * (k + 1)) / n]
    const mine = (h: number) => {
      const z = (Math.floor(h / COLS) + 0.5) / (HILLS / COLS)
      let best = 0, bd = Infinity
      for (let q = 0; q < n; q++) { const d = Math.abs(z - (p0 + ((p1 - p0) * (q + 0.5)) / n)); if (d < bd) { bd = d; best = q } }
      return best === k
    }
    return { hills: (hillsFor.get(key) ?? []).filter(h => n === 1 || mine(h)), band }
  }

  // A tractor between people who each did row work with it today (the farm's day gives it to one and then the other):
  // it is seen with whoever has it, over all of that ground, and the others stand by at the end of their own part.
  const drivers = crews.filter(c => c.ride === 'tractor')
  const lent = new Map<number, { w: Work; of: number }[]>()
  let turn = 0
  if (drivers.length) for (const crew of crews) {
    const u = units.get(crew.id)
    if (!u || crew.ride) continue
    for (const w of u.worked) {
      if (!ROW_JOBS.has(w.kind) || (w.kind === 'water' && waterWay(snap, w.field, pondDrawn) !== 'tank')) continue
      const d = drivers[turn++ % drivers.length]
      lent.set(d.id, [...(lent.get(d.id) ?? []), { w, of: crew.id }])
    }
  }

  return crews.map(crew => {
    const u = units.get(crew.id)
    const segs: Seg[] = []
    let at = crew.at
    let machine = crew.machine
    // To a place: on the machine when today's work has one (walking to it first if it stands elsewhere), else on foot.
    const way = wayFrom
    const go = (to: Pt, ride: Ride): { walkTo: Pt[]; travel: Pt[] } => {
      if (!ride) return { walkTo: [], travel: way(at, to) }
      const m = machine ?? at
      const walkTo = Math.hypot(m.x - at.x, m.z - at.z) > 1.2 * S ? way(at, m) : []
      return { walkTo, travel: way(m, to) }
    }
    const some = (n: number) => { const v = Math.sin((snap.seasonDay + 1) * 12.9898 + (crew.id + 1) * 78.233 + n * 37.719) * 43758.5453; return v - Math.floor(v) }
    if (u) {
      const order = [...u.worked.map(w => ({ w, of: crew.id })), ...(lent.get(crew.id) ?? [])].sort((a, b) => first(`${b.w.field}|${b.w.kind}`) - first(`${a.w.field}|${a.w.kind}`))
      for (const { w, of } of order) {
        const key = `${w.field}|${w.kind}`
        const ride: Ride = MACHINE_JOBS.has(w.kind) ? crew.ride : ''
        const wet = w.kind === 'water' ? waterWay(snap, w.field, pondDrawn) : 'tank'
        if (SITE_JOBS.has(w.kind) || wet !== 'tank') {
          // Staged at one place: the stage puts each worker where the work wants them.
          const yard = w.kind === 'build'
          const going = snap.farm.buildings.find(x => !x.built && x.yard === w.field)
          const spot = yard ? buildSite(going ? going.kind : 'shed', w.field) : siteAt(wet !== 'tank' ? 'haul' : w.kind, w.field, snap.fields[w.field]?.felled ?? 0)
          // already at it since yesterday: carry on where they stand (hauling, the trips go on from where the machine is)
          const there = (!ride && Math.hypot(spot.x - at.x, spot.z - at.z) < 9) || (crew.working === (wet !== 'tank' ? `${w.field}|${wet}` : key) && !crew.arrives)
          const { walkTo, travel } = there ? { walkTo: [], travel: [at] } : go(spot, ride)
          // a day's hauling in loads: what one person brings in, by the barrel, over what a bed holds (a last day is a short one)
          const loads = w.kind === 'haul' ? Math.max(1, Math.ceil(((ride === 'truck' ? HAUL_CWT_DAY * TRUCK_HAUL : HAUL_CWT_DAY) / (LOAD * BARREL_CWT)) * (w.share !== undefined && w.share >= 1 ? 0.5 : 1))) : undefined
          segs.push({ kind: w.kind, field: w.field, walker: !ride, ride, walkTo, travel, path: [{ x: spot.x, z: spot.z }], reveals: [], start: 0, end: 0, site: wet !== 'tank' ? `${w.field}|${wet}` : key, lit: literal, from: 0, loads })
          if (!there) at = { x: spot.x, z: spot.z }
          if (ride) {
            // a day's hauling ends at the potato house door
            at = machine = w.kind === 'haul' ? cropDoor(snap, w.field).stop : at
          }
          continue
        }
        const f = snap.fields[w.field]
        const { hills, band } = share(key, of)
        const tractor = ROW_JOBS.has(w.kind) && ride === 'tractor'
        const help = !tractor && ROW_JOBS.has(w.kind) && drivers.length > 0
        let path: Pt[]
        const start = parkSpot(w.field, crew.slot)
        // A day's digging is never literal: the interface waits to see the day's band out, so it plays as a running day does.
        const lit = (literal && w.kind !== 'dig') || w.kind === 'sample'
        // on foot in this field since yesterday: carry on from where they stand
        const afoot = !tractor && !help && !lit && w.kind !== 'scout' && !crew.arrives && inField(w.field, at)
        if (tractor) {
          // the dug ground is the band the dug hills lie in (the simulation digs in rows from the top)
          let [p0, p1] = band
          if (w.kind === 'dig' && hills.length) {
            const rows = hills.map(h => Math.floor(h / COLS)), deep = HILLS / COLS
            p0 = Math.min(...rows) / deep
            p1 = (Math.max(...rows) + 1) / deep
          }
          // literally: a pass through each stretch of the band; with the clock running: the band's leading row
          path = lit ? crossings(w.field, p0, p1, Math.max(1, Math.round((p1 - p0) * (HILLS / COLS))), (machine ?? at).x) : crossings(w.field, Math.max(p0, p1 - 0.004), p1, 1, (machine ?? at).x)
        } else if (help) {
          path = [standBy(w.field, band[0])]
        } else if (w.kind === 'scout') {
          path = scoutWalk(w.field, crew.slot % 2 === 1)
        } else {
          path = [afoot ? { x: at.x, z: at.z } : { x: start.x - 0.5 * S, z: start.z + 0.6 * S }]
          const byRow = hills.slice().sort((a, b) => (Math.floor(a / COLS) - Math.floor(b / COLS)) || ((a % COLS) - (b % COLS)) * (Math.floor(a / COLS) % 2 ? 1 : -1))
          for (const h of byRow) {
            const p = hillPos(w.field, h)
            // The walker stands in the furrow below the hill, facing it.
            path.push({ x: p.x + 0.2, z: p.z + 1.1 })
          }
          if (byRow.length === 0) path.push(hillPos(w.field, Math.floor(HILLS / 2)))
          // A test dig ends at the hill: whoever dug it stays to look at what came up.
          if (w.kind !== 'sample' || byRow.length === 0) path.push({ x: start.x - 0.5 * S, z: start.z + 0.6 * S })
        }
        // worn out, they come off the field at the day's end and sit down at its edge
        if (!tractor && w.kind !== 'sample' && u.tired > 0.72) {
          const last = path[path.length - 1], fr = FIELDS[w.field]
          const up = last.z - fr.z0 < fr.z1 - last.z
          path.push({ x: last.x, z: up ? fr.z0 - 0.7 * S : fr.z1 + 0.7 * S })
        }
        const poly = new Poly(path)
        // the ground changes once the machine and what it draws are clear of it
        const lag = tractor ? (w.kind === 'dig' ? 1.7 : w.kind === 'plant' ? 1.1 : 1.0) * S + SX / 2 : 0.05
        // With the clock running the band fills in over the day, from its top down, a stretch of a row at a time.
        const ordered = lit ? hills : hills.slice().sort((a, b) => (Math.floor(a / COLS) - Math.floor(b / COLS)) || ((a % COLS) - (b % COLS)) * (Math.floor(a / COLS) % 2 ? 1 : -1))
        const reveals: Reveal[] = help ? [] : ordered.map((h, n) => {
          const p = hillPos(w.field, h)
          return {
            field: w.field, hill: h, at: lit ? Math.min(poly.length, poly.nearest(p.x, p.z) + lag) : ((n + 0.5) / ordered.length) * poly.length, look: f.hills[h], ridge: f.ridge,
            tubers: w.kind === 'dig' ? 'dig' : w.kind === 'sample' ? 'sample' : '',
          }
        })
        reveals.sort((a, b) => a.at - b.at)
        // A machine already at work in this field carries on from where it is (`from` below zero), with no drive to it.
        const here = tractor && !lit && !!machine && inField(w.field, machine) && crew.working === key
        const from = here ? -1 : 0
        // (someone who lives out comes in by the road to the machine where it was left)
        const { walkTo, travel } = here ? { walkTo: crew.arrives ? way(at, machine!) : [], travel: [machine!] } : afoot ? { walkTo: [], travel: [at] } : go(path[0], tractor ? 'tractor' : '')
        if (from > 0) { const e = poly.at(from); travel.push({ x: e.x, z: e.z }) }
        segs.push({ kind: w.kind, field: w.field, walker: !tractor, ride: tractor ? 'tractor' : '', walkTo, travel, path, reveals, start: 0, end: 0, site: '', lit, from, help })
        at = lit ? path[path.length - 1] : travel[travel.length - 1]
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
          segs.push({ kind: 'travel', field: -1, walker: !ride, ride, walkTo, travel: part, path: [part[part.length - 1]], reveals: [], start: 0, end: 0, site: '', lit: literal, from: 0 })
        }
      } else if (!u.worked.length && crew.goal === null && u.at >= 0) {
        // nothing done today and nowhere to go: at the field they were left at
        const dest = restAt(u.at, crew.slot, true)
        if (Math.hypot(dest.x - at.x, dest.z - at.z) > 3 * S) segs.push({ kind: 'travel', field: -1, walker: true, ride: '', walkTo: [], travel: way(at, dest), path: [dest], reveals: [], start: 0, end: 0, site: '', lit: literal, from: 0 })
      }
    }
    // A day off, a day laid up, or nothing to do in the yard: to where that is spent.
    if (crew.goal && !segs.length && Math.hypot(crew.goal.x - at.x, crew.goal.z - at.z) > 0.4) {
      const travel = way(at, crew.goal)
      segs.push({ kind: 'travel', field: -1, walker: true, ride: '', walkTo: [], travel, path: [{ x: crew.goal.x, z: crew.goal.z }], reveals: [], start: 0, end: 0.5, site: '', lit: literal, from: 0 })
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
