// Where everything on the farm and in the country round it sits. Pure numbers, shared by the 3D view, picking and the 2D fallback.
// x runs along the rows (north on the left), z down the slope from the spruce ridge (west) to the brook (east), y up.
import { COLS, FIELD_COUNT, PARCELS, ROWS, type BlockId } from '../sim/index.ts'
import { clamp, fbm2, hash2, mix, smooth } from './noise.ts'

export const SUB = 4                  // plants drawn per simulated hill, each way
export const ROW = 0.34               // spacing of the planted rows
export const PLANT = 0.3              // spacing of plants along a row
export const SX = SUB * PLANT         // one simulated hill along the row
export const SZ = SUB * ROW           // one simulated row: four planted rows
export const FW = COLS * SX
export const FD = ROWS * SZ
export const PLANTED_ROWS = ROWS * SUB
export const PLANTS_PER_ROW = COLS * SUB

export interface FieldRect { i: number; x0: number; x1: number; z0: number; z1: number; cx: number; cz: number; block: BlockId; elev: number }

// Every parcel where the simulation puts it (src/sim/farm.ts), held or not.
export const FIELDS: FieldRect[] = Array.from({ length: FIELD_COUNT }, (_, i) => {
  const p = PARCELS[i]
  return { i, x0: p.x - FW / 2, x1: p.x + FW / 2, z0: p.z - FD / 2, z1: p.z + FD / 2, cx: p.x, cz: p.z, block: p.block, elev: p.elev }
})

export interface Rect { x0: number; x1: number; z0: number; z1: number }

// The home farm inside its walls.
export const FARM: Rect = { x0: -18.4, x1: 29, z0: -22.6, z1: 25.5 }
export const FARM_CENTER = { x: 4.6, z: 0.4 }
// Each block of land with its headlands and walls, and the Dufour farmstead. Inside them the ground is the farm's.
export const BLOCKS: Record<BlockId, Rect> = {
  home: FARM,
  ridge: { x0: -53.8, x1: -17.4, z0: -22.4, z1: -6.9 },
  brook: { x0: -18.2, x1: 17.2, z0: 25.5, z1: 45.6 },
  dufour: { x0: 48.6, x1: 98.5, z0: -22.4, z1: 7.4 },
}
// All of it: the camera stays over this, and inside it the land keeps the farm's own slope.
export const LAND: Rect = { x0: -56, x1: 100, z0: -24, z1: 47 }
export const WATER_Y = 0.06
const BROOK_Z0 = 22.6

// The slope through the farm, west to east: far ridge, two hills, our ridge, the fields, the brook, the flat of the
// intervale beyond it, then the land rising again to the town road and the hills.
const KNOTS: [number, number][] = [
  [-3600, 120], [-2300, 100], [-1500, 108], [-1100, 82], [-760, 42], [-520, 40], [-380, 22], [-215, 19], [-120, 8.5], [-72, 6.3],
  [-40, 6.7], [-21, 5.1], [-8, 3.735], [5, 2.37], [18.5, 0.95], [BROOK_Z0, 0.26], [27, 0.6], [31, 0.74], [45, 0.98], [53, 2.3], [80, 5.5],
  [170, 17], [320, 24], [540, 58], [900, 75], [1500, 118], [3600, 150],
]
const P_Z0 = -3500, P_STEP = 0.5, P_N = 14001
const PROFILE = new Float32Array(P_N)
{
  const m = KNOTS.map((_, k) => {
    const a = KNOTS[Math.max(0, k - 1)], b = KNOTS[Math.min(KNOTS.length - 1, k + 1)]
    return (b[1] - a[1]) / (b[0] - a[0])
  })
  let k = 0
  for (let n = 0; n < P_N; n++) {
    const z = P_Z0 + n * P_STEP
    while (k < KNOTS.length - 2 && KNOTS[k + 1][0] <= z) k++
    const [z0, y0] = KNOTS[k], [z1, y1] = KNOTS[k + 1]
    const h = z1 - z0, t = clamp((z - z0) / h, 0, 1), t2 = t * t, t3 = t2 * t
    PROFILE[n] = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[k + 1]
  }
}

// Height of the slope at z, before the land's own swells are added. Straight inside the farm.
export function profile(z: number): number {
  const f = clamp((z - P_Z0) / P_STEP, 0, P_N - 1.001)
  const i = Math.floor(f)
  return PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * (f - i)
}

function outside(x: number, z: number): number {
  return Math.max(LAND.x0 - x, x - LAND.x1, LAND.z0 - z - 8, z - LAND.z1, 0)
}

// How far the valley's line wanders north and south of the farm.
function wander(x: number, z: number, w: number): number {
  return w * 70 * (fbm2(x / 520 + 3.1, z / 1100 + 1.7) - 0.5)
}

// The lie of the land without roads, pads or small bumps.
export function macroY(x: number, z: number): number {
  const d = outside(x, z)
  if (d <= 0) return profile(z)
  const w = smooth(0, 220, d)
  const zw = z + wander(x, z, w)
  const valley = smooth(8, 90, Math.abs(zw - BROOK_Z0))
  const swell = (0.35 + 0.65 * smooth(200, 1400, d)) * 24 * (fbm2(x / 340 + 7.3, z / 340 - 2.1) - 0.5) * 2
  return profile(zw) + w * valley * (swell + 3 * (fbm2(x / 90, z / 90) - 0.5))
}

export function brookZ(x: number): number {
  const w = smooth(0, 220, Math.max(LAND.x0 - x, x - LAND.x1, 0))
  return BROOK_Z0 + 2 * Math.sin(x * 0.085 + 1.2) + Math.sin(x * 0.21 + 0.3) + 0.35 * Math.sin(x * 0.47 + 5.4) - wander(x, BROOK_Z0, w)
}

export function brookHalf(x: number): number {
  return 1.3 + 0.32 * Math.sin(x * 0.13 + 0.7) + 0.7 * fordAt(x)
}

// The ford to the intervale: the track down between the home fields goes through the brook on gravel.
export const FORD = { x: -0.3, half: 1.6 }
export function fordAt(x: number): number {
  return 1 - smooth(FORD.half * 0.6, FORD.half * 1.5, Math.abs(x - FORD.x))
}

export const HOUSE = { x: 23.6, z: 4.4 }
export const BARN = { x: 23.9, z: -6.5 }
export const POTATO_HOUSE = { x: 23.4, z: -17.6 }
// The Dufour place: a cape and an old barn by the yard, and a potato house banked into the slope above it.
export const DUFOUR_HOUSE = { x: 93.6, z: 2.4 }
export const DUFOUR_BARN = { x: 95.2, z: -6.2 }
export const DUFOUR_POTATO_HOUSE = { x: 89.8, z: -14.0 }

// Ground levelled for the buildings: each sits a step higher up the slope than the last.
const PADS = [
  { x: HOUSE.x, z: HOUSE.z, rx: 2.9, rz: 2.9, at: 4.6 },
  { x: HOUSE.x + 0.1, z: -0.1, rx: 2.4, rz: 2.8, at: 0.4 },
  { x: BARN.x, z: BARN.z, rx: 3.5, rz: 4.1, at: -5.2 },
  { x: POTATO_HOUSE.x, z: -13.1, rx: 2.9, rz: 1.9, at: -14.0 },
  { x: DUFOUR_HOUSE.x, z: DUFOUR_HOUSE.z, rx: 2.6, rz: 3.4, at: 2.4 },
  { x: DUFOUR_BARN.x, z: DUFOUR_BARN.z, rx: 2.9, rz: 3.4, at: -6.0 },
  { x: DUFOUR_POTATO_HOUSE.x, z: -10.3, rx: 2.5, rz: 1.8, at: -11.0 },
]

export function padLevel(k: number): number {
  return profile(PADS[k].at)
}

// ---- The farm roads and tracks. Roads are gravel; tracks are two ruts through the grass along the headlands; the
// headland strips at the ends of the fields are where a tractor turns and runs along to the lane, drawn only as worn
// ground. Crews go between places by these (src/sim/farm.ts counts the distance square to the fields, as these run).

export type WayKind = 'road' | 'track' | 'headland'
export interface Way { kind: WayKind; pts: [number, number][] }

const LANE_RIDGE = -20.8, LANE_MID = -7.6, LANE_LOW = 5.6, LANE_BROOK = 31.4, LANE_FOOT = 18.8

// The farm road: from the potato house down past the dooryard, over the brook and out to the town road.
export const ROAD: [number, number][] = [
  [23.4, -13.2], [20.9, -12.0], [18.9, -9.6], [18.508, LANE_MID], [17.9, -4.5], [17.7, 3.4], [17.767, LANE_LOW], [17.9, 10], [17.6, 17],
  [17.8, 22.4], [18.3, 30], [18.458, LANE_BROOK], [19.2, 38], [20.2, 47.5], [20.6, townRoadZ(20.6)],
]
export const SPURS: [number, number][][] = [
  [[17.7, 3.4], [21.3, 3.6]],
  [[17.9, -4.5], [21.2, -5.6]],
]
// The road to the Dufour place: out past the potato house, over the neighbour's ground, and along the Dufour lane.
const DUFOUR_ROAD: [number, number][] = [[23.4, -13.2], [27.4, -13.1], [31.8, -11.9], [36.0, -9.4], [40.4, -7.9], [45.0, -7.6], [50.0, LANE_MID]]
const DUFOUR_YARD_ROAD: [number, number][] = [[82.2, LANE_MID], [86.4, -7.4], [89.8, -6.8]]
// The Dufour drive, down over the brook to the town road.
const DUFOUR_DRIVE: [number, number][] = [[89.8, -6.8], [91.2, 1.0], [92.0, 12.0], [92.6, brookZ(92.6)], [93.2, 32], [93.6, townRoadZ(93.6)]]

function lane(z: number, xs: number[]): [number, number][] { return xs.map(x => [x, z]) }
function down(x: number, zs: number[]): [number, number][] { return zs.map(z => [x, z]) }

export const WAYS: Way[] = [
  { kind: 'road', pts: ROAD },
  ...SPURS.map(pts => ({ kind: 'road' as const, pts })),
  { kind: 'road', pts: DUFOUR_ROAD },
  { kind: 'road', pts: DUFOUR_YARD_ROAD },
  { kind: 'road', pts: DUFOUR_DRIVE },
  // Home: the lane under the woodlot runs on through the wall to the ridge lots; a track runs up beside the fields to it.
  { kind: 'track', pts: lane(LANE_RIDGE, [-52.0, -35.9, -19.8, -16.4, -0.3, 15.8, 17.2]) },
  { kind: 'track', pts: [[17.2, LANE_RIDGE], [17.2, -14.2], [17.4, -11.6], [18.9, -9.6]] },
  { kind: 'track', pts: lane(LANE_MID, [-16.4, -0.3, 15.8, 18.508]) },
  { kind: 'track', pts: lane(LANE_LOW, [-16.4, -0.3, 15.8, 17.767]) },
  // Down between the home fields and through the ford to the intervale.
  { kind: 'track', pts: down(-0.3, [LANE_RIDGE, LANE_MID, LANE_LOW, LANE_FOOT, 22.0, 27.0, LANE_BROOK]) },
  { kind: 'track', pts: lane(LANE_BROOK, [-16.4, -0.3, 15.8, 18.458]) },
  { kind: 'track', pts: down(-35.9, [LANE_RIDGE, -8.2]) },
  // The Dufour lanes.
  { kind: 'track', pts: lane(LANE_MID, [50.0, 66.1, 82.2]) },
  { kind: 'track', pts: lane(LANE_RIDGE, [50.0, 66.1, 82.2]) },
  { kind: 'track', pts: lane(LANE_LOW, [50.0, 66.1, 82.2]) },
  { kind: 'track', pts: down(66.1, [LANE_RIDGE, LANE_MID, LANE_LOW]) },
  // Headlands at the ends of every field.
  { kind: 'headland', pts: down(-16.4, [LANE_RIDGE, LANE_MID, LANE_LOW, LANE_FOOT]) },
  { kind: 'headland', pts: down(15.8, [LANE_RIDGE, LANE_MID, LANE_LOW, LANE_FOOT]) },
  { kind: 'headland', pts: lane(LANE_FOOT, [-16.4, -0.3, 15.8]) },
  { kind: 'headland', pts: down(-16.4, [LANE_BROOK, 44.2]) },
  { kind: 'headland', pts: down(-0.3, [LANE_BROOK, 44.2]) },
  { kind: 'headland', pts: down(15.8, [LANE_BROOK, 44.2]) },
  { kind: 'headland', pts: down(-52.0, [LANE_RIDGE, -8.2]) },
  { kind: 'headland', pts: down(-19.8, [LANE_RIDGE, -8.2]) },
  { kind: 'headland', pts: down(50.0, [LANE_RIDGE, LANE_MID, LANE_LOW]) },
  { kind: 'headland', pts: down(82.2, [LANE_RIDGE, LANE_MID, LANE_LOW]) },
]

function segDist(x: number, z: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1)
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)
}

interface Box { x0: number; x1: number; z0: number; z1: number }
const BOXES: Box[] = WAYS.map(w => {
  const xs = w.pts.map(p => p[0]), zs = w.pts.map(p => p[1])
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
})

function wayDist(x: number, z: number, kinds: number, reach = 4): number {
  let d = 99
  for (let k = 0; k < WAYS.length; k++) {
    const w = WAYS[k], b = BOXES[k]
    if (!(kinds & (w.kind === 'road' ? 1 : w.kind === 'track' ? 2 : 4))) continue
    if (x < b.x0 - reach || x > b.x1 + reach || z < b.z0 - reach || z > b.z1 + reach) continue
    for (let s = 0; s < w.pts.length - 1; s++) d = Math.min(d, segDist(x, z, w.pts[s], w.pts[s + 1]))
  }
  return d
}

// Distance to the nearest road or track (99 when far from any).
export function roadDist(x: number, z: number): number {
  return wayDist(x, z, 3)
}
// Distance to the nearest gravel road.
export function gravelDist(x: number, z: number): number {
  return wayDist(x, z, 1)
}

// ---- Routing over the ways: a graph of their points, crossings split, searched for the shortest way between two places.

interface Node { x: number; z: number; to: number[]; len: number[] }
const NODES: Node[] = []
{
  // Split every way where another meets or crosses it.
  const segs: { w: number; a: [number, number]; b: [number, number] }[] = []
  WAYS.forEach((w, k) => { for (let s = 0; s < w.pts.length - 1; s++) segs.push({ w: k, a: w.pts[s], b: w.pts[s + 1] }) })
  const cuts = WAYS.map(w => w.pts.map(() => [] as [number, number][]))
  for (let i = 0; i < segs.length; i++) {
    for (let j = 0; j < segs.length; j++) {
      if (segs[i].w === segs[j].w) continue
      const { a, b } = segs[i]
      // the ends of segment j that lie on segment i
      for (const p of [segs[j].a, segs[j].b]) {
        if (segDist(p[0], p[1], a, b) < 0.05 && Math.hypot(p[0] - a[0], p[1] - a[1]) > 0.05 && Math.hypot(p[0] - b[0], p[1] - b[1]) > 0.05) {
          const w = WAYS[segs[i].w], s = w.pts.indexOf(a)
          cuts[segs[i].w][s].push(p)
        }
      }
      // proper crossings
      const c = segs[j]
      const d1x = b[0] - a[0], d1z = b[1] - a[1], d2x = c.b[0] - c.a[0], d2z = c.b[1] - c.a[1]
      const den = d1x * d2z - d1z * d2x
      if (Math.abs(den) < 1e-9) continue
      const t = ((c.a[0] - a[0]) * d2z - (c.a[1] - a[1]) * d2x) / den, u = ((c.a[0] - a[0]) * d1z - (c.a[1] - a[1]) * d1x) / den
      if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
        const s = WAYS[segs[i].w].pts.indexOf(a)
        cuts[segs[i].w][s].push([a[0] + d1x * t, a[1] + d1z * t])
      }
    }
  }
  const nodeAt = (x: number, z: number): number => {
    for (let k = 0; k < NODES.length; k++) if (Math.abs(NODES[k].x - x) < 0.06 && Math.abs(NODES[k].z - z) < 0.06) return k
    NODES.push({ x, z, to: [], len: [] })
    return NODES.length - 1
  }
  const link = (a: number, b: number) => {
    if (a === b || NODES[a].to.includes(b)) return
    const l = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z)
    NODES[a].to.push(b); NODES[a].len.push(l)
    NODES[b].to.push(a); NODES[b].len.push(l)
  }
  WAYS.forEach((w, k) => {
    let prev = -1
    w.pts.forEach((p, s) => {
      const here = nodeAt(p[0], p[1])
      if (prev >= 0) link(prev, here)
      prev = here
      const extra = cuts[k][s].slice().sort((q, r) => Math.hypot(q[0] - p[0], q[1] - p[1]) - Math.hypot(r[0] - p[0], r[1] - p[1]))
      for (const q of extra) { const n = nodeAt(q[0], q[1]); link(prev, n); prev = n }
    })
  })
}

export interface Pt { x: number; z: number }

// The nearest point of the network to p: the edge it is on and where.
function onNetwork(p: Pt): { a: number; b: number; x: number; z: number; d: number } {
  let best = { a: 0, b: 0, x: NODES[0].x, z: NODES[0].z, d: Infinity }
  for (let a = 0; a < NODES.length; a++) {
    const na = NODES[a]
    for (const b of na.to) {
      if (b < a) continue
      const nb = NODES[b]
      const dx = nb.x - na.x, dz = nb.z - na.z, l2 = dx * dx + dz * dz || 1
      const t = clamp(((p.x - na.x) * dx + (p.z - na.z) * dz) / l2, 0, 1)
      const x = na.x + dx * t, z = na.z + dz * t, d = Math.hypot(p.x - x, p.z - z)
      if (d < best.d) best = { a, b, x, z, d }
    }
  }
  return best
}

// The way from a to b by the farm's roads, tracks and headlands. Short hops go straight.
export function route(a: Pt, b: Pt): Pt[] {
  if (Math.hypot(a.x - b.x, a.z - b.z) < 2.5) return [a, b]
  const pa = onNetwork(a), pb = onNetwork(b)
  const out: Pt[] = [a]
  const push = (p: Pt) => { const l = out[out.length - 1]; if (Math.hypot(l.x - p.x, l.z - p.z) > 0.05) out.push(p) }
  push({ x: pa.x, z: pa.z })
  const same = (pa.a === pb.a && pa.b === pb.b) || (pa.a === pb.b && pa.b === pb.a)
  if (!same) {
    // Dijkstra from the two ends of a's edge to the two ends of b's.
    const n = NODES.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n)
    dist[pa.a] = Math.hypot(pa.x - NODES[pa.a].x, pa.z - NODES[pa.a].z)
    dist[pa.b] = Math.min(dist[pa.b], Math.hypot(pa.x - NODES[pa.b].x, pa.z - NODES[pa.b].z))
    for (;;) {
      let u = -1
      for (let k = 0; k < n; k++) if (!done[k] && dist[k] < Infinity && (u < 0 || dist[k] < dist[u])) u = k
      if (u < 0) break
      done[u] = 1
      const nu = NODES[u]
      for (let e = 0; e < nu.to.length; e++) {
        const v = nu.to[e], alt = dist[u] + nu.len[e]
        if (alt < dist[v]) { dist[v] = alt; prev[v] = u }
      }
    }
    const endA = dist[pb.a] + Math.hypot(pb.x - NODES[pb.a].x, pb.z - NODES[pb.a].z)
    const endB = dist[pb.b] + Math.hypot(pb.x - NODES[pb.b].x, pb.z - NODES[pb.b].z)
    let k = endA <= endB ? pb.a : pb.b
    const chain: number[] = []
    while (k >= 0) { chain.push(k); k = prev[k] }
    for (let c = chain.length - 1; c >= 0; c--) push({ x: NODES[chain[c]].x, z: NODES[chain[c]].z })
  }
  push({ x: pb.x, z: pb.z })
  push(b)
  return out
}

// The town road beyond the brook, and the road over the next hill.
export function townRoadZ(x: number): number {
  return 48 + 9 * Math.sin(x / 170 + 0.6) + 4 * Math.sin(x / 61)
}
export function hillRoadZ(x: number): number {
  return -168 + 22 * Math.sin(x / 230 + 1.1) + 8 * Math.sin(x / 83)
}

// 1 inside a field (grown by `pad`), falling to 0 outside.
export function fieldMask(x: number, z: number, pad: number): number {
  let m = 0
  for (const f of FIELDS) {
    const dx = Math.max(f.x0 - x, x - f.x1, 0), dz = Math.max(f.z0 - z, z - f.z1, 0)
    if (dx > pad || dz > pad) continue
    const d = Math.hypot(dx, dz)
    m = Math.max(m, 1 - smooth(pad * 0.4, pad, d))
  }
  return m
}

// 1 on the farm's own ground (its blocks and the Dufour yard), easing to 0 a little way outside.
export function oursAt(x: number, z: number, soft = 3): number {
  let m = 0
  for (const b of Object.values(BLOCKS)) {
    const d = Math.max(b.x0 - x, x - b.x1, b.z0 - z, z - b.z1)
    m = Math.max(m, 1 - smooth(-soft * 0.5, soft, d))
  }
  return m
}

// Ground height anywhere.
export function groundY(x: number, z: number): number {
  let y = macroY(x, z)
  const home = outside(x, z) <= 0
  const bz = brookZ(x), db = Math.abs(z - bz)
  if (db < 7) {
    const hw = brookHalf(x)
    // At the ford the bed comes up to a gravel bar the water runs thin over.
    const bed = mix(WATER_Y - 0.5, WATER_Y - 0.07, fordAt(x))
    y = mix(WATER_Y + 0.24 + 0.05 * db, y, smooth(1.2, 7, db))
    y = mix(y, bed, 1 - smooth(hw - 0.35, hw + 0.4, db))
  }
  let flat = 0
  if (home && (x > 16 && x < 30 || x > 84)) {
    for (const p of PADS) {
      const d = Math.max(Math.abs(x - p.x) / p.rx, Math.abs(z - p.z) / p.rz)
      const k = 1 - smooth(0.78, 1.25, d)
      if (k > 0) { y = mix(y, profile(p.at), k); flat = Math.max(flat, k) }
    }
  }
  const road = 1 - smooth(0.6, 1.6, roadDist(x, z))
  const field = home ? fieldMask(x, z, 0.7) : 0
  const bank = smooth(0.6, 3, db)
  // Between the blocks the meadow lies in long low swells.
  const swell = home ? 0.32 * (1 - fieldMask(x, z, 5)) * (fbm2(x * 0.045 + 11.3, z * 0.06 - 4.1) - 0.5) * 2 : 0
  const amp = 0.11 * (1 - field) * (1 - flat) * (1 - 0.85 * road) * bank
  return y + amp * (fbm2(x * 0.23 + 4.2, z * 0.23) - 0.5) * 2 + swell * (1 - flat) * (1 - road) * bank
}

// The smooth surface a field's soil lies on.
export function fieldBaseY(z: number): number {
  return profile(z)
}

export function hillPos(field: number, hill: number): { x: number; z: number } {
  const f = FIELDS[field]
  const row = Math.floor(hill / COLS), col = hill % COLS
  return { x: f.x0 + (col + 0.5) * SX, z: f.z0 + (row + 0.5) * SZ }
}

export function fieldAt(x: number, z: number): number {
  for (const f of FIELDS) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return f.i
  return -1
}

// Stone walls round each block, where field stone was cleared by hand and piled; tracks pass through gateways.
export const WALLS: [number, number, number, number][] = [
  // home: the north boundary, the wall under the woodlot, and the wall along the road with the dooryard's opening
  [-17.5, -21.6, -17.4, 20.4], [-17.5, -21.7, 16.4, -21.7], [16.5, -21.7, 16.5, -8.2], [16.4, 5.6, 16.4, 19.6],
  // the ridge lots
  [-53.4, -21.7, -17.5, -21.7], [-53.4, -21.7, -53.4, -7.2], [-53.4, -7.2, -17.5, -7.2],
  // the intervale: open to the brook, walled on the other three sides
  [-17.4, 29.6, -17.4, 44.9], [-17.4, 44.9, 16.4, 44.9], [16.4, 32.6, 16.4, 44.9],
  // the Dufour place
  [49.0, -21.8, 83.6, -21.8], [49.0, -21.8, 49.0, 6.8], [49.0, 6.8, 83.6, 6.8], [83.6, -21.8, 83.6, 6.8],
]

export function wallDist(x: number, z: number): number {
  let d = 99
  for (const [x0, z0, x1, z1] of WALLS) d = Math.min(d, segDist(x, z, [x0, z0], [x1, z1]))
  return d
}

// Where crews wait at a yard: the farmer's tractor on the potato house apron, the second tractor beside it, the hands by
// the barn door; at the Dufour yard, in front of its potato house.
export interface Spot { x: number; z: number; heading: number }
export const SHED_SPOT: Spot = { x: 21.2, z: -12.6, heading: 2.6 }
export function yardSpot(yard: number, slot: number, walker: boolean): Spot {
  if (yard === -2) {
    if (walker) return { x: 87.6 + (slot % 3) * 0.7, z: -6.0 - Math.floor(slot / 3) * 0.6, heading: -1.6 }
    return { x: 88.6 + slot * 2.4, z: -9.0, heading: 1.9 }
  }
  if (walker) return { x: 20.4 + (slot % 3) * 0.55, z: -7.6 + Math.floor(slot / 3) * 0.6 + (slot % 3) * 0.2, heading: 0.3 }
  return slot === 0 ? SHED_SPOT : { x: 25.6 + (slot - 1) * 2.2, z: -12.2, heading: 2.2 }
}

// Where a crew stands at a field when it is not working the rows: on the lane at the field's corner, each crew a little apart.
export function parkSpot(field: number, slot = 0): Pt {
  const f = FIELDS[field]
  return { x: f.x1 + 1.0 - (slot % 3) * 2.9, z: f.z0 - 0.62 - Math.floor(slot / 3) * 0.5 }
}

// ---- The country beyond the walls: a quilt of blocks, each a woodlot or a run of strips. The terrain shader draws the
// same quilt from the same numbers (see QUILT_GLSL in terrain.ts), so trees stand where the picture says woods.
export const REGION = 120
// The woods on the ridge, all along above the fields from beyond the ridge lots to past the Dufour place.
export const HOME_WOODS = { x0: -62, x1: 100, z0: -58, z1: -23.4 }
// Where the woods break: behind the home potato house and farmstead, and where the Dufour road climbs out.
export const WOOD_GAPS: Rect[] = [{ x0: 14.5, x1: 31, z0: -40, z1: -20 }]

export interface Region { woods: boolean; hard: number; edge: number; angle: number; width: number; key: number }

export function regionAt(x: number, z: number): Region {
  const cx = Math.floor(x / REGION), cz = Math.floor(z / REGION)
  let d1 = 1e9, d2 = 1e9, bx = 0, bz = 0, sx = 0, sz = 0
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ix = cx + i, iz = cz + j
      const px = (ix + 0.5 + (hash2(ix + 131, iz + 17) - 0.5) * 0.72) * REGION
      const pz = (iz + 0.5 + (hash2(ix - 57, iz + 211) - 0.5) * 0.72) * REGION
      const d = Math.hypot(x - px, z - pz)
      if (d < d1) { d2 = d1; d1 = d; bx = ix; bz = iz; sx = px; sz = pz } else if (d < d2) d2 = d
    }
  }
  const far = Math.hypot(sx - FARM_CENTER.x, sz)
  return {
    woods: hash2(bx + 19, bz - 83) < 0.26 + 0.42 * smooth(700, 2400, far),
    hard: hash2(bx + 43, bz + 7),
    edge: (d2 - d1) * 0.5,
    angle: (hash2(bx + 77, bz + 301) < 0.5 ? 0 : Math.PI / 2) + (hash2(bx + 5, bz + 9) - 0.5) * 0.7,
    width: 12 + 14 * hash2(bx - 3, bz + 41),
    key: bx * 7919 + bz * 104729,
  }
}

// Inside the farm's country (all its blocks and the ground between) the quilt's woods give way to open land.
export function openCountry(x: number, z: number): number {
  const d = Math.max(LAND.x0 - x, x - LAND.x1, -26 - z, z - (LAND.z1 + 4))
  return 1 - smooth(-6, 10, d)
}

function inWoodsRidge(x: number, z: number, ragged: number): boolean {
  const h = HOME_WOODS
  if (!(x > h.x0 + ragged && x < h.x1 + ragged && z > h.z0 + ragged && z < h.z1)) return false
  for (const g of WOOD_GAPS) if (x > g.x0 + ragged && x < g.x1 + ragged && z > g.z0 && z < g.z1) return false
  return true
}

// Whether trees stand here: the woods on the ridge, the woodlots of the quilt, and the hedgerows between blocks.
export function woodsAt(x: number, z: number): { woods: number; hard: number } {
  const h = HOME_WOODS
  const ragged = 5 * (fbm2(x * 0.09, z * 0.09) - 0.5)
  if (inWoodsRidge(x, z, ragged)) return { woods: 1, hard: z > h.z1 - 5 ? 0.6 : 0.16 }
  // No trees on the farm's land, nor on the neighbour's ground to the north-west where the evening sun comes from.
  if (oursAt(x, z, 1.5) > 0.01) return { woods: 0, hard: 0 }
  if (x > -150 && x <= LAND.x0 + 4 && z > FARM.z0 - 6 && z < FARM.z1 + 8) return { woods: 0, hard: 0 }
  const open = openCountry(x, z)
  if (open > 0.5) return { woods: 0, hard: 0 }
  const r = regionAt(x, z)
  if (r.woods) return { woods: smooth(1.5, 6, r.edge + ragged * 0.6) * (1 - open * 2), hard: r.hard }
  return { woods: r.edge < 1.6 ? 0.45 : 0, hard: 0.75 }
}

// The rows of the ridge woods' edge for the terrain shader: whether a grid point is under the ridge woods.
export function ridgeWoods(x: number, z: number, ragged: number): boolean {
  return inWoodsRidge(x, z, ragged)
}
