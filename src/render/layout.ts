// Where everything on the farm and in the country round it sits, in metres. Pure numbers, shared by the 3D view,
// picking and the 2D fallback. x runs along the rows (north on the left), z down the slope from the spruce ridge (west)
// to the brook (east), y up.
// The simulation's plan coordinates (src/sim/farm.ts) are put on the ground through scale.ts: the land K metres to the
// plan unit, the two yards as islands at true size, widths and heights at their real figures.
import { COLS, FIELD_COUNT, PARCELS, ROWS, TRACTS, type BlockId, type BuildingKind } from '../sim/index.ts'
import { clamp, fbm2, hash2, mix, smooth } from './noise.ts'
import { K, KV, S, island, toWorld, type Frame } from './scale.ts'

export const FW = 14.4 * K            // a field along its rows
export const FD = 10.88 * K           // and across them
export const SX = FW / COLS           // one simulated hill along the row
export const SZ = FD / ROWS           // and across the rows
// Rows are planted at their true spacing, whatever the field's size: about 0.9 m between rows, 0.3 m between plants.
export const PLANTED_ROWS = Math.round(FD / 0.9)
export const PLANTS_PER_ROW = Math.round(FW / 0.3)
export const ROW = FD / PLANTED_ROWS
export const PLANT = FW / PLANTS_PER_ROW

export interface FieldRect { i: number; x0: number; x1: number; z0: number; z1: number; cx: number; cz: number; block: BlockId; elev: number }

// Every parcel where the simulation puts it (src/sim/farm.ts), held or not.
export const FIELDS: FieldRect[] = Array.from({ length: FIELD_COUNT }, (_, i) => {
  const p = PARCELS[i], x = K * p.x, z = K * p.z
  return { i, x0: x - FW / 2, x1: x + FW / 2, z0: z - FD / 2, z1: z + FD / 2, cx: x, cz: z, block: p.block, elev: p.elev }
})

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Pt { x: number; z: number }
export interface Spot { x: number; z: number; heading: number }
const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0: K * x0, x1: K * x1, z0: K * z0, z1: K * z1 })

// The home farm inside its walls; east of the farmstead the back yard where its new buildings go, and below that the
// swale and the pond.
export const FARM: Rect = rect(-18.4, 44.6, -22.6, 25.5)
export const FARM_CENTER = { x: 4.6 * K, z: 0.4 * K }
// Each block of land with its headlands and walls, and the Dufour farmstead. Inside them the ground is the farm's.
export const BLOCKS: Record<BlockId, Rect> = {
  home: FARM,
  ridge: rect(-53.8, -17.4, -22.4, -6.9),
  brook: rect(-18.2, 17.2, 25.5, 45.6),
  dufour: rect(48.6, 98.5, -22.4, 7.4),
}
// All of it: the camera stays over this, and inside it the land keeps the farm's own slope.
export const LAND: Rect = rect(-56, 100, -24, 47)
export const WATER_Y = 0.06 * KV
const BROOK_Z0 = 22.6 * K

// ---- Relief. The slope through the farm, west to east: far ridge, two hills, our ridge, the fields, the brook, the
// flat of the intervale beyond it, then the land rising again to the town road and the hills. Given in plan units and
// the heights they had; the farm's own part (between NEAR_W and NEAR_E) is stretched K along and KV up, and the
// country beyond keeps its own distances and rises from where the farm's part ends.
const KNOTS: [number, number][] = [
  [-3600, 120], [-2300, 100], [-1500, 108], [-1100, 82], [-760, 52], [-520, 44], [-380, 29], [-235, 23], [-150, 11.5], [-104, 13.2],
  [-78, 15.4], [-60, 13.7], [-46, 10.5], [-33, 6.95], [-22.2, 5.24], [-21, 5.1], [-8, 3.735], [5, 2.37], [18.5, 0.95], [22.6, 0.26], [27, 0.6], [31, 0.74], [45, 0.98], [53, 2.3], [80, 5.5],
  [170, 17], [320, 24], [540, 58], [900, 75], [1500, 118], [3600, 150],
]
const NEAR_W = 150, NEAR_E = 170, Y_W = 11.5, Y_E = 17
const PLACED: [number, number][] = KNOTS.map(([z, y]) =>
  z < -NEAR_W ? [-K * NEAR_W + (z + NEAR_W), KV * Y_W + (y - Y_W)] : z > NEAR_E ? [K * NEAR_E + (z - NEAR_E), KV * Y_E + (y - Y_E)] : [K * z, KV * y])
// How far the country is drawn: the far end of the slope's profile.
export const REACH = K * NEAR_E + 3430
const P_STEP = 1, P_Z0 = Math.floor(PLACED[0][0]), P_N = Math.ceil((PLACED[PLACED.length - 1][0] - P_Z0) / P_STEP) + 2
const PROFILE = new Float32Array(P_N)
{
  const m = PLACED.map((_, k) => {
    const a = PLACED[Math.max(0, k - 1)], b = PLACED[Math.min(PLACED.length - 1, k + 1)]
    return (b[1] - a[1]) / (b[0] - a[0])
  })
  let k = 0
  for (let n = 0; n < P_N; n++) {
    const z = P_Z0 + n * P_STEP
    while (k < PLACED.length - 2 && PLACED[k + 1][0] <= z) k++
    const [z0, y0] = PLACED[k], [z1, y1] = PLACED[k + 1]
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
// The same heights over the farm's own land as a table, for shaders that stand things on the fields.
export const SLOPE_TABLE = (() => {
  const z0 = Math.floor(LAND.z0 - 12 * K), n = Math.ceil(LAND.z1 + 4 * K - z0) + 2
  const data = new Float32Array(n)
  for (let i = 0; i < n; i++) data[i] = profile(z0 + i)
  return { z0, n, data }
})()
// The farm's own fall, height per metre down the slope through the middle fields.
export const FALL = (profile(-8 * K) - profile(5 * K)) / (13 * K)

function outside(x: number, z: number): number {
  return Math.max(LAND.x0 - x, x - LAND.x1, LAND.z0 - z - 10 * K, z - LAND.z1, 0)
}

// The ridge behind the fields: its crest rises and falls along its length, and behind the farmstead it dips to a saddle.
export const SADDLE = { x: 23.5 * K, half: 12 * K }
function ridgeRise(x: number, z: number): number {
  const k = smooth(-34 * K, -60 * K, z) * (1 - smooth(-150 * K, -150 * K - 100, z))
  if (k <= 0) return 0
  const along = fbm2(x / (85 * K) + 2.7, z / (150 * K) + 5.1) - 0.5
  const saddle = Math.exp(-(((x - SADDLE.x) / SADDLE.half) ** 2))
  return k * KV * (7.5 * along - 5.2 * saddle)
}

// How far the valley's line wanders north and south of the farm.
function wander(x: number, z: number, w: number): number {
  return w * 70 * (fbm2(x / 520 + 3.1, z / 1100 + 1.7) - 0.5)
}

// The lie of the land without roads, pads or small bumps.
export function macroY(x: number, z: number): number {
  const d = outside(x, z)
  if (d <= 0) return profile(z)
  const w = smooth(0, 220 * KV, d)
  const rise = ridgeRise(x, z)
  const zw = z + wander(x, z, w)
  const valley = smooth(8 * KV, 90 * KV, Math.abs(zw - BROOK_Z0))
  const swell = (0.35 + 0.65 * smooth(200, 1400, d)) * 24 * (fbm2(x / 340 + 7.3, z / 340 - 2.1) - 0.5) * 2
  return profile(zw) + rise + w * valley * (swell + 3 * (fbm2(x / 90, z / 90) - 0.5))
}

// The brook's course grows with the land; its width is its own.
export function brookZ(x: number): number {
  const w = smooth(0, 220 * KV, Math.max(LAND.x0 - x, x - LAND.x1, 0)), u = x / K
  return BROOK_Z0 + K * (2 * Math.sin(u * 0.085 + 1.2) + Math.sin(u * 0.21 + 0.3) + 0.35 * Math.sin(u * 0.47 + 5.4)) - wander(x, BROOK_Z0, w)
}

export function brookHalf(x: number): number {
  return S * (1.3 + 0.32 * Math.sin((x / K) * 0.13 + 0.7) + 0.7 * fordAt(x))
}

// The ford to the intervale: the track down between the home fields goes through the brook on gravel.
export const FORD = { x: -0.3 * K, half: 1.6 * S }
export function fordAt(x: number): number {
  return 1 - smooth(FORD.half * 0.6, FORD.half * 1.5, Math.abs(x - FORD.x))
}

// ---- The yards. Each is an island: laid out in the small units it was first drawn in (kept below as written), at
// true size round an anchor that sits where the land puts it. The home yard hangs on the farm road at the dooryard;
// the Dufour yard on its gateway in the wall; the farm stand on the road by the bridge.
export const HOME: Frame = island(17.9, -4.5)
export const DUFOUR: Frame = island(83.6, -7.6)
export const BRIDGE: Frame = island(16.2, 18.4)
// The irrigation pond and its pump house are dug in the low ground below the swale, a short pipe from the brook:
// the pump's small point (34.6, 7.4) stands at the plan point (34.6, 18.2).
export const PONDSIDE: Frame = { x: (K - S) * 34.6, z: K * 18.2 - S * 7.4 }
// Where the farm road meets the town road: the mailbox and the culvert.
export const ROADSIDE: Frame = { x: (K - S) * 20.6, z: 0 }
const at = (f: Frame, p: Pt): Pt => toWorld(f, p.x, p.z)

// What stands in the yards, in small units in its own frame: the builders' drawings are made in these.
export const SMALL = {
  HOUSE: { x: 23.6, z: 4.4 }, BARN: { x: 23.9, z: -6.5 }, POTATO_HOUSE: { x: 23.4, z: -17.6 },
  // The Dufour place: a cape and an old barn by the yard, and a potato house banked into the slope above it.
  DUFOUR_HOUSE: { x: 93.6, z: 2.4 }, DUFOUR_BARN: { x: 95.2, z: -6.2 }, DUFOUR_POTATO_HOUSE: { x: 89.8, z: -14.0 },
  // Where the pond's basin lies: dug into the slope below the back yard, clear of the pump house on its upper bank.
  POND: { x: 39.6, z: 11.0, rx: 2.6, rz: 2.2 },
  // Logs decked by the dooryard and across the back lane, fieldstone tipped at the barn's corner.
  LOG_DECKS: [{ x: 20.05, z: -2.8, heading: 0 }, { x: 31.5, z: -9.7, heading: 0 }, { x: 33.6, z: -9.7, heading: 0 }] as Spot[],
  STONE_PILE: { x: 20.75, z: -9.35 } as Pt,
}
export const HOUSE = at(HOME, SMALL.HOUSE), BARN = at(HOME, SMALL.BARN), POTATO_HOUSE = at(HOME, SMALL.POTATO_HOUSE)
export const DUFOUR_HOUSE = at(DUFOUR, SMALL.DUFOUR_HOUSE), DUFOUR_BARN = at(DUFOUR, SMALL.DUFOUR_BARN), DUFOUR_POTATO_HOUSE = at(DUFOUR, SMALL.DUFOUR_POTATO_HOUSE)
export const POND = { ...at(PONDSIDE, SMALL.POND), rx: S * SMALL.POND.rx, rz: S * SMALL.POND.rz }
export const POND_AT = POND
const spot = (f: Frame, s: Spot): Spot => ({ ...at(f, s), heading: s.heading })
export const LOG_DECKS: Spot[] = SMALL.LOG_DECKS.map(s => spot(HOME, s))
export const STONE_PILE: Pt = at(HOME, SMALL.STONE_PILE)

// The middle of each yard (-1 home, -2 Dufour): where its marker stands, over its old buildings; and `x0`..`z1`, the
// ground a click on means the yard, which takes in every site of the plan below.
function yardRect(f: Frame, x: number, z: number, reach: number, x0: number, x1: number, z0: number, z1: number) {
  const a = toWorld(f, x0, z0), b = toWorld(f, x1, z1)
  return { ...toWorld(f, x, z), reach: reach * S, x0: a.x, x1: b.x, z0: a.z, z1: b.z }
}
export const YARD_AT: Record<number, { x: number; z: number; reach: number; x0: number; x1: number; z0: number; z1: number }> = {
  [-1]: yardRect(HOME, 24.4, -7.4, 13, 18.4, 42.3, -22.4, 6.7),
  [-2]: yardRect(DUFOUR, 92.6, -6.2, 11, 83.9, 100, -18.2, 6.4),
}
export const YARD_FRAME: Record<number, Frame> = { [-1]: HOME, [-2]: DUFOUR }
// The yard at a point on the ground, or 0.
export function yardAt(x: number, z: number): number {
  for (const yard of [-1, -2]) {
    const p = YARD_AT[yard]
    if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return yard
  }
  return 0
}

// ---- The yards' plan: where each building the farm can raise stands, laid out before any is built. A site looks
// toward its `ry` (0: down the slope, +z; -PI/2: toward the fields, -x); `w` is its width across that front and `d` its
// depth. `door` is the ground in front of its door and `work` where people stand to build it. All in metres in the
// world; `small` is the same site in the small units of its `frame`, for the drawing of it.
export interface SmallSite { kind: BuildingKind; yard: number; x: number; z: number; ry: number; w: number; d: number; door: Pt; work: Pt[] }
export interface Site extends SmallSite { frame: Frame; small: SmallSite }
function site(kind: BuildingKind, yard: number, x: number, z: number, ry: number, w: number, d: number, doorAt = 0, frame: Frame = YARD_FRAME[yard]): Site {
  const c = Math.cos(ry), s = Math.sin(ry)
  const local = (lx: number, lz: number): Pt => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c })
  const small: SmallSite = {
    kind, yard, x, z, ry, w, d, door: local(doorAt, d / 2 + 0.7),
    work: [local(-w / 2 - 0.5, d / 2 + 0.4), local(w / 2 + 0.5, d / 2 + 0.4), local(doorAt + 0.6, d / 2 + 1.3), local(-w / 2 - 0.6, -d * 0.2), local(w / 2 + 0.6, -d * 0.2)],
  }
  return { kind, yard, ...at(frame, small), ry, w: S * w, d: S * d, door: at(frame, small.door), work: small.work.map(p => at(frame, p)), frame, small }
}
export const SITES: Site[] = [
  // Home: a second potato house banked into the slope beside the first, the bunkhouse beyond it up the Dufour road;
  // behind the barn, down the back lane, the machine shed and the packing shed; the pond's pump house in the low
  // ground, the stand by the bridge, the weather station in the open behind the house.
  site('house', -1, 31.6, -18.0, 0, 4.0, 6.0),
  site('bunk', -1, 39.2, -13.4, 0, 5.0, 3.2, -0.9),
  site('shed', -1, 33.6, -6.0, 0, 6.4, 3.1),
  site('packing', -1, 33.6, 1.1, 0, 6.0, 4.0, -1.2),
  site('pond', -1, 34.6, 7.4, 0, 1.3, 1.6, 0, PONDSIDE),
  site('stand', -1, 19.9, 19.2, -Math.PI / 2, 2.2, 1.3, 0, BRIDGE),
  site('station', -1, 30.6, 5.4, 0, 1.7, 1.7),
  site('road', -1, 20.4, -11.4, 0, 1.5, 1.5),
  // Dufour: a second potato house beside the old one, and a bunkhouse below the yard road.
  site('house', -2, 95.8, -15.2, 0, 3.4, 5.0),
  site('bunk', -2, 86.6, -2.2, 0, 4.6, 3.0, -0.8),
]
export function siteOf(kind: BuildingKind, yard: number): Site | undefined {
  return SITES.find(s => s.kind === kind && s.yard === yard)
}
// Where machines the farm owns stand when nobody is on them (a heading is the way it faces: cos, sin in x, z): the
// machine shed's three bays, where the truck waits before there is a shed, and the grass past the shed for implements.
export const BAY_WIDE = S * (6.4 / 3)
export const BAYS: Spot[] = [-1, 0, 1].map(k => spot(HOME, { x: 33.6 + k * (6.4 / 3), z: -5.9, heading: Math.PI / 2 }))
export const TRUCK_SPOT: Spot = spot(HOME, { x: 36.6, z: -9.2, heading: -0.3 })
export const IMPLEMENT_SPOTS: Record<'harvester' | 'sprayer' | 'reel', Spot> = {
  harvester: spot(HOME, { x: 38.5, z: -5.9, heading: -0.12 }), sprayer: spot(HOME, { x: 40.9, z: -6.1, heading: 0.2 }), reel: spot(HOME, { x: 41.3, z: -2.4, heading: -1.2 }),
}
// Ground kept clear of trees and long grass: each site, whether or not anything stands there yet.
export const KEEP_CLEAR: { x: number; z: number; r: number }[] = [
  ...SITES.filter(s => s.kind !== 'road').map(s => ({ x: s.x, z: s.z, r: Math.hypot(s.w, s.d) / 2 + 1.4 * S })),
  ...LOG_DECKS.map(p => ({ x: p.x, z: p.z, r: 1.8 * S })), { ...STONE_PILE, r: 1.6 * S },
  // where the implements stand in the grass past the machine shed, and the orchard
  { ...toWorld(HOME, 39.7, -5.8), r: 3.0 * S }, { ...toWorld(HOME, 40, 1.6), r: 3.4 * S }, { x: TRUCK_SPOT.x, z: TRUCK_SPOT.z, r: 1.8 * S },
]

// Ground levelled for the buildings: each sits a step higher up the slope than the last. `at`: where up the slope
// (a z in its frame's small units) its level is taken from.
const PADS = ([
  [HOME, SMALL.HOUSE.x, SMALL.HOUSE.z - 0.4, 2.9, 2.3, 4.6],
  [HOME, SMALL.HOUSE.x + 0.1, -0.1, 2.4, 2.8, 0.4],
  [HOME, SMALL.BARN.x, SMALL.BARN.z, 3.5, 4.1, -5.2],
  [HOME, SMALL.POTATO_HOUSE.x, -13.1, 2.9, 1.9, -14.0],
  [DUFOUR, SMALL.DUFOUR_HOUSE.x, SMALL.DUFOUR_HOUSE.z, 2.6, 3.4, 2.4],
  [DUFOUR, SMALL.DUFOUR_BARN.x, SMALL.DUFOUR_BARN.z, 2.9, 3.4, -6.0],
  [DUFOUR, SMALL.DUFOUR_POTATO_HOUSE.x, -10.3, 2.5, 1.8, -11.0],
] as [Frame, number, number, number, number, number][]).map(([f, x, z, rx, rz, up]) => ({ ...toWorld(f, x, z), rx: S * rx, rz: S * rz, level: profile(toWorld(f, x, up).z) }))

export function padLevel(k: number): number {
  return PADS[k].level
}

// ---- The farm roads and tracks. Roads are gravel; tracks are two ruts through the grass along the headlands; the
// headland strips at the ends of the fields are where a tractor turns and runs along to the lane, drawn only as worn
// ground. Crews go between places by these (src/sim/farm.ts counts the distance square to the fields, as these run).
// A point is written in the frame it belongs to: L on the land (plan units), H in the home yard, D in the Dufour yard.

export type WayKind = 'road' | 'track' | 'headland'
export interface Way { kind: WayKind; pts: [number, number][] }
// True widths: the tread of a farm lane, the gravelled farm road, the town road.
export const WIDE = { track: 3, road: 3.6, town: 5.8 }

const L = (x: number, z: number): [number, number] => [K * x, K * z]
const H = (x: number, z: number): [number, number] => [HOME.x + S * x, HOME.z + S * z]
const D = (x: number, z: number): [number, number] => [DUFOUR.x + S * x, DUFOUR.z + S * z]
const LANE_RIDGE = -20.8, LANE_MID = -7.6, LANE_LOW = 5.6, LANE_BROOK = 31.4, LANE_FOOT = 18.8

// The farm road: from the potato house down past the dooryard, over the brook and out to the town road.
// Below the dooryard it keeps to the foot of the bottom field's headland, clear of the swale.
// Its first eleven points run from the potato house to the bridge (the gravelling's marks follow them).
export const ROAD: [number, number][] = [
  H(23.4, -13.2), H(20.9, -12.0), H(18.9, -9.6), H(18.508, LANE_MID), H(17.9, -4.5), H(17.5, 3.4), L(16.5, LANE_LOW), L(15.95, 7.1), L(15.9, 15.6),
  L(16.2, 18.4), L(17.8, 22.4), L(18.3, 30), L(18.458, LANE_BROOK), L(19.2, 38), L(20.2, 47.5), [K * 20.6, townRoadZ(K * 20.6)],
]
export const SPURS: [number, number][][] = [
  [H(17.5, 3.4), H(21.3, 3.6)],
  [H(17.9, -4.5), H(21.2, -5.6)],
]
// Where the roads cross the brook on their bridges.
export const BRIDGE_X = { home: K * 17.8 + 0.4, dufour: D(92.0, 12.0)[0] + 2 }
// The road to the Dufour place: out past the potato house, over the neighbour's ground, and along the Dufour lane.
const DUFOUR_ROAD: [number, number][] = [H(23.4, -13.2), H(27.4, -13.1), H(31.8, -11.9), H(36.0, -9.4), H(40.4, -7.9), L(45.0, -7.6), L(50.0, LANE_MID)]
const DUFOUR_YARD_ROAD: [number, number][] = [L(82.2, LANE_MID), D(83.6, -7.6), D(86.4, -7.4), D(89.8, -6.8)]
// The Dufour drive, down over the brook to the town road.
const DRIVE_X = D(92.0, 12.0)[0]
const DUFOUR_DRIVE: [number, number][] = [
  D(89.8, -6.8), D(91.2, 1.0), D(92.0, 12.0), [DRIVE_X + 1, K * 17], [BRIDGE_X.dufour, brookZ(BRIDGE_X.dufour)], [DRIVE_X + 3, K * 32], [DRIVE_X + 4, townRoadZ(DRIVE_X + 4)],
]

function lane(z: number, xs: number[]): [number, number][] { return xs.map(x => L(x, z)) }
function down(x: number, zs: number[]): [number, number][] { return zs.map(z => L(x, z)) }

// The back lane behind the barn and the aprons and paths of the yards' sites. Each starts on a road already there.
const YARD_WAYS: [number, number][][] = [
  [H(29.0, -12.6636), H(29.0, -9.0), H(29.2, -4.0), H(29.6, 0.9)],
  [H(29.2, -4.0), H(31.0, -3.6), H(36.6, -3.6), H(40.6, -4.0)],
  [H(31.6, -11.9545), H(31.6, -14.6)],
  [H(39.2, -8.3091), H(39.2, -10.9)],
  [D(89.8, -6.8), D(92.6, -10.2), D(95.8, -12.3)],
  [D(90.985, -0.2), D(87.0, 0.3)],
]

export const WAYS: Way[] = [
  { kind: 'road', pts: ROAD },
  ...SPURS.map(pts => ({ kind: 'road' as const, pts })),
  ...YARD_WAYS.map(pts => ({ kind: 'road' as const, pts })),
  { kind: 'road', pts: DUFOUR_ROAD },
  { kind: 'road', pts: DUFOUR_YARD_ROAD },
  { kind: 'road', pts: DUFOUR_DRIVE },
  // Home: the lane under the woodlot runs on through the wall to the ridge lots; a track runs up beside the fields to it.
  { kind: 'track', pts: lane(LANE_RIDGE, [-52.0, -35.9, -19.8, -16.4, -0.3, 15.8, 17.2]) },
  { kind: 'track', pts: [L(17.2, LANE_RIDGE), L(17.2, -14.2), L(17.4, -11.6), H(18.9, -9.6)] },
  { kind: 'track', pts: [...lane(LANE_MID, [-16.4, -0.3, 15.8]), H(18.508, LANE_MID)] },
  { kind: 'track', pts: lane(LANE_LOW, [-16.4, -0.3, 15.8, 16.5]) },
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

// Far from any way.
export const NO_WAY = 999
function wayDist(x: number, z: number, kinds: number, reach = 12): number {
  let d = NO_WAY
  for (let k = 0; k < WAYS.length; k++) {
    const w = WAYS[k], b = BOXES[k]
    if (!(kinds & (w.kind === 'road' ? 1 : w.kind === 'track' ? 2 : 4))) continue
    if (x < b.x0 - reach || x > b.x1 + reach || z < b.z0 - reach || z > b.z1 + reach) continue
    for (let s = 0; s < w.pts.length - 1; s++) d = Math.min(d, segDist(x, z, w.pts[s], w.pts[s + 1]))
  }
  return d
}

// Distance to the nearest road or track (NO_WAY when far from any).
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
        if (segDist(p[0], p[1], a, b) < 0.1 && Math.hypot(p[0] - a[0], p[1] - a[1]) > 0.1 && Math.hypot(p[0] - b[0], p[1] - b[1]) > 0.1) {
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
    for (let k = 0; k < NODES.length; k++) if (Math.abs(NODES[k].x - x) < 0.12 && Math.abs(NODES[k].z - z) < 0.12) return k
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
  if (Math.hypot(a.x - b.x, a.z - b.z) < 2.5 * S) return [a, b]
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
  return K * 48 + 20 * Math.sin(x / 400 + 0.6) + 9 * Math.sin(x / 150)
}
export function hillRoadZ(x: number): number {
  return -K * 168 + 44 * Math.sin(x / 520 + 1.1) + 16 * Math.sin(x / 190)
}

// 1 inside a field (grown by `pad` metres), falling to 0 outside.
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
export function oursAt(x: number, z: number, soft = 3 * S): number {
  let m = 0
  for (const b of Object.values(BLOCKS)) {
    const d = Math.max(b.x0 - x, x - b.x1, b.z0 - z, z - b.z1)
    m = Math.max(m, 1 - smooth(-soft * 0.5, soft, d))
  }
  return m
}

// How wide the brook's banks are cut into the valley floor.
const BANK = 7 * S

// Ground height anywhere.
export function groundY(x: number, z: number): number {
  let y = macroY(x, z)
  const home = outside(x, z) <= 0
  const bz = brookZ(x), db = Math.abs(z - bz)
  if (db < BANK) {
    const hw = brookHalf(x)
    // At the ford the bed comes up to a gravel bar the water runs thin over.
    const bed = mix(WATER_Y - 0.5 * S, WATER_Y - 0.07 * S, fordAt(x))
    y = mix(WATER_Y + 0.24 * S + 0.05 * db, y, smooth(1.2 * S, BANK, db))
    y = mix(y, bed, 1 - smooth(hw - 0.35 * S, hw + 0.4 * S, db))
  }
  let flat = 0
  if (home) {
    for (const p of PADS) {
      const d = Math.max(Math.abs(x - p.x) / p.rx, Math.abs(z - p.z) / p.rz)
      if (d > 1.25) continue
      const k = 1 - smooth(0.78, 1.25, d)
      y = mix(y, p.level, k)
      flat = Math.max(flat, k)
    }
  }
  const road = 1 - smooth(0.6 * S, 1.6 * S, roadDist(x, z))
  const field = home ? fieldMask(x, z, 0.7 * S) : 0
  const bank = smooth(0.6 * S, 3 * S, db)
  // Between the blocks the meadow lies in long swells and hollows, which the roads ride over; the yards lie quieter.
  let calm = 0
  if (home) for (const yard of [-1, -2]) {
    const p = YARD_AT[yard]
    calm = Math.max(calm, 1 - smooth(S, 9 * S, Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1 - 4 * S)))
  }
  const swell = home ? KV * mix((1 - fieldMask(x, z, 7 * K)) * (0.5 + 0.9 * (1 - fieldMask(x, z, 15 * K))), 0.2 * (1 - fieldMask(x, z, 5 * K)), calm) * (fbm2((x / K) * 0.045 + 11.3, (z / K) * 0.06 - 4.1) - 0.5) * 2 : 0
  const amp = 0.11 * S * (1 - field) * (1 - flat) * (1 - 0.85 * road) * bank
  return y + amp * (fbm2((x / S) * 0.23 + 4.2, (z / S) * 0.23) - 0.5) * 2 + swell * (1 - flat) * smooth(1.2 * S, BANK, db)
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
// A wall is about a metre high and nearly as wide.
export const WALLS: [number, number, number, number][] = ([
  // home: the north boundary, the wall under the woodlot, and the wall along the road with the dooryard's opening
  [-17.5, -21.6, -17.4, 20.4], [-17.5, -21.7, 16.4, -21.7], [16.5, -21.7, 16.5, -8.2], [31.6, 7.6, 31.6, 18.2],
  // the ridge lots
  [-53.4, -21.7, -17.5, -21.7], [-53.4, -21.7, -53.4, -7.2], [-53.4, -7.2, -17.5, -7.2],
  // the intervale: open to the brook, walled on the other three sides
  [-17.4, 29.6, -17.4, 44.9], [-17.4, 44.9, 16.4, 44.9], [16.4, 32.6, 16.4, 44.9],
  // the Dufour place
  [49.0, -21.8, 83.6, -21.8], [49.0, -21.8, 49.0, 6.8], [49.0, 6.8, 83.6, 6.8], [83.6, -21.8, 83.6, 6.8],
] as [number, number, number, number][]).map(w => w.map(v => v * K) as [number, number, number, number])
// Where the tracks pass through the walls: bars stand at each.
export const GATEWAYS: Pt[] = [[16.5, -20.8], [-17.45, -20.8], [49, -7.6], [83.6, -7.6], [16.4, 31.4]].map(([x, z]) => ({ x: K * x, z: K * z }))

export function wallDist(x: number, z: number): number {
  let d = NO_WAY
  for (const [x0, z0, x1, z1] of WALLS) {
    if (x < Math.min(x0, x1) - 12 || x > Math.max(x0, x1) + 12 || z < Math.min(z0, z1) - 12 || z > Math.max(z0, z1) + 12) continue
    d = Math.min(d, segDist(x, z, [x0, z0], [x1, z1]))
  }
  return d
}

// Where crews wait at a yard: the farmer's tractor on the potato house apron, the second tractor beside it, the hands by
// the barn door; at the Dufour yard, in front of its potato house.
export const SHED_SPOT: Spot = spot(HOME, { x: 21.2, z: -12.6, heading: 2.6 })
export function yardSpot(yard: number, slot: number, walker: boolean): Spot {
  if (yard === -2) {
    if (walker) return spot(DUFOUR, { x: 87.6 + (slot % 3) * 0.7, z: -6.0 - Math.floor(slot / 3) * 0.6, heading: -1.6 })
    return spot(DUFOUR, { x: 88.6 + slot * 2.4, z: -9.0, heading: 1.9 })
  }
  if (walker) return spot(HOME, { x: 20.4 + (slot % 3) * 0.55, z: -7.6 + Math.floor(slot / 3) * 0.6 + (slot % 3) * 0.2, heading: 0.3 })
  return slot === 0 ? SHED_SPOT : spot(HOME, { x: 25.6 + (slot - 1) * 2.2, z: -12.2, heading: 2.2 })
}

// Where a crew stands at a field when it is not working the rows: on the lane above the field's corner, each crew a
// little apart.
export function parkSpot(field: number, slot = 0): Pt {
  const f = FIELDS[field]
  return { x: f.x1 - 2 - (slot % 3) * 6.4, z: f.z0 - 1.16 * K - Math.floor(slot / 3) * 1.2 }
}

// ---- The country beyond the walls: a quilt of blocks, each a woodlot or a run of strips. The terrain shader draws the
// same quilt from the same numbers (see QUILT_GLSL in terrain.ts), so trees stand where the picture says woods.
// The neighbours' strips grow with the land, as our fields do.
export const QUILT = { region: 120 * K, width0: 12 * K, width1: 14 * K, far0: 1400, far1: 4800, run: 3.4 }
export const REGION = QUILT.region
// The woods on the ridge, all along above the fields from beyond the ridge lots to past the Dufour place, and back over
// the crest.
export const HOME_WOODS = rect(-62, 100, -98, -23.4)
// Where the woods break: an old hill pasture runs up the saddle behind the home potato house and farmstead.
const WOOD_GAP = { x: 22.75 * K, half: 8.25 * K }

export interface Region { woods: boolean; hard: number; edge: number; angle: number; width: number; key: number; qx: number; bx: number; bz: number }

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
  const angle = (hash2(bx + 77, bz + 301) < 0.5 ? 0 : Math.PI / 2) + (hash2(bx + 5, bz + 9) - 0.5) * 0.7
  return {
    woods: hash2(bx + 19, bz - 83) < 0.26 + 0.42 * smooth(QUILT.far0, QUILT.far1, far),
    hard: hash2(bx + 43, bz + 7),
    edge: (d2 - d1) * 0.5,
    angle,
    width: QUILT.width0 + QUILT.width1 * hash2(bx - 3, bz + 41),
    key: bx * 7919 + bz * 104729,
    qx: Math.cos(angle) * (x - sx) + Math.sin(angle) * (z - sz), bx, bz,
  }
}

// A neighbour's strips, as the terrain shader lays them: how far a point is from the nearer side of its strip, and
// whether a hedgerow has grown up along that side.
export function stripEdge(x: number, z: number): { d: number; hedged: boolean } {
  const r = regionAt(x, z)
  const u = r.qx / r.width, s = Math.floor(u), fx = u - s
  const side = fx < 0.5 ? s : s + 1
  return { d: Math.min(fx, 1 - fx) * r.width, hedged: !r.woods && hash2(side * 7 + r.bx * 13, r.bz * 29 + 91) < 0.4 }
}

// Inside the farm's country (all its blocks and the ground between) the quilt's woods give way to open land.
export const OPEN = { z0: -26 * K, z1: LAND.z1 + 4 * K, in: -6 * K, out: 10 * K }
export function openCountry(x: number, z: number): number {
  const d = Math.max(LAND.x0 - x, x - LAND.x1, OPEN.z0 - z, z - OPEN.z1)
  return 1 - smooth(OPEN.in, OPEN.out, d)
}

// A tract's bounds are a line cut through the woods, this far outside its corners.
export const TRACT_LINE = 1.8 * S
// The tracts that start the game under trees, and whether a point lies on one.
const WOODED = TRACTS.filter(i => PARCELS[i].cover !== 'open').map(i => FIELDS[i])
export function tractAt(x: number, z: number, pad = 0): number {
  for (const f of WOODED) if (x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad) return f.i
  return -1
}

// The front of the ridge woods at x: bays where old pasture runs up into the trees, points where the spruce comes down
// to the wall. Along a tract of woods the trees stand to its line.
export function woodFront(x: number): number {
  const u = x / K
  const bay = 9 * KV * smooth(0.46, 0.8, fbm2(u * 0.043 + 9.1, 3.3)) + 2.6 * S * (fbm2(u * 0.17 * KV, 7.7) - 0.5)
  let hold = 0
  for (const f of WOODED) if (f.cz < -20 * K) hold = Math.max(hold, 1 - smooth(0.5 * K, 6 * K, Math.max(f.x0 - x, x - f.x1)))
  return HOME_WOODS.z1 - Math.max(0, bay) * (1 - hold)
}

// 1 in the pasture that runs up the saddle, narrowing as it climbs and closing beyond the crest.
function woodGap(x: number, z: number): number {
  if (z < -112 * K) return 0
  const u = z / K
  const half = WOOD_GAP.half * (1 - 0.5 * smooth(-28, -80, u)) + 3.4 * K * (fbm2(u * 0.09, 1.3) - 0.5)
  const cx = WOOD_GAP.x + 3 * K * (fbm2(u * 0.05 + 4.2, 8.8) - 0.5)
  return (1 - smooth(half - 1.6 * KV, half + 1.6 * KV, Math.abs(x - cx))) * smooth(-112, -92, u)
}

// How surely trees stand at a point of the ridge woods, 0..1: thinning at the ragged front and sides, none in the gap.
export function ridgeWoodAt(x: number, z: number): number {
  const h = HOME_WOODS
  if (x < h.x0 - 8 * K || x > h.x1 + 8 * K || z < h.z0 - 10 * K || z > h.z1 + 2 * K) return 0
  let d = smooth(-0.9 * S, 2.2 * S, woodFront(x) - z)
  d *= smooth(h.x0 - 6 * K, h.x0 + 5 * K, x + 9 * K * (fbm2((z / K) * 0.06, 2.1) - 0.5)) * (1 - smooth(h.x1 - 5 * K, h.x1 + 6 * K, x + 9 * K * (fbm2((z / K) * 0.06, 5.9) - 0.5)))
  d *= smooth(h.z0 - 8 * K, h.z0 + 8 * K, z + 14 * K * (fbm2((x / K) * 0.025, 6.4) - 0.5))
  return d * (1 - woodGap(x, z))
}

// Whether trees stand here: the woods on the ridge, the woodlots of the quilt, and the hedgerows between blocks.
// hard: the share of them that are hardwoods. The tracts' own stands are not counted: they come and go with the clearing.
export function woodsAt(x: number, z: number): { woods: number; hard: number } {
  if (tractAt(x, z, TRACT_LINE) >= 0) return { woods: 0, hard: 0 }
  const ridge = ridgeWoodAt(x, z)
  if (ridge > 0.02) {
    // Hardwoods along the front and in stands through the spruce.
    const front = 1 - smooth(4 * S, 14 * S, woodFront(x) - z)
    const stand = smooth(0.5, 0.72, fbm2((x / K) * 0.068 + 1.9, (z / K) * 0.1 + 7.3))
    return { woods: ridge, hard: Math.min(0.92, 0.1 + 0.55 * front + 0.66 * stand) }
  }
  // No trees on the farm's land, nor on the neighbour's ground to the north-west where the evening sun comes from.
  if (oursAt(x, z, 1.5 * S) > 0.01) return { woods: 0, hard: 0 }
  if (x > -150 * K && x <= LAND.x0 + 4 * K && z > FARM.z0 - 6 * K && z < FARM.z1 + 8 * K) return { woods: 0, hard: 0 }
  const open = openCountry(x, z)
  if (open > 0.5) return { woods: 0, hard: 0 }
  const ragged = 5 * S * (fbm2((x / S) * 0.09, (z / S) * 0.09) - 0.5)
  const r = regionAt(x, z)
  if (r.woods) return { woods: smooth(1.5 * S, 6 * S, r.edge + ragged * 0.6) * (1 - open * 2), hard: r.hard }
  return { woods: r.edge < 1.6 * S ? 0.45 : 0, hard: 0.75 }
}
