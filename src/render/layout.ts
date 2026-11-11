// Where everything on the farm and in the country round it sits. Pure numbers, shared by the 3D view, picking and the 2D fallback.
// x runs along the rows (north on the left), z down the slope from the spruce ridge (west) to the brook (east), y up.
import { COLS, FIELD_COUNT, ROWS } from '../sim/index.ts'
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

const FIELD_X0 = [-15.6, 0.6]
const BAND_Z0 = [-19.6, -6.4, 6.8]

export interface FieldRect { i: number; x0: number; x1: number; z0: number; z1: number; cx: number; cz: number; band: number }

export const FIELDS: FieldRect[] = Array.from({ length: FIELD_COUNT }, (_, i) => {
  const band = Math.floor(i / 2), x0 = FIELD_X0[i % 2], z0 = BAND_Z0[band]
  return { i, x0, x1: x0 + FW, z0, z1: z0 + FD, cx: x0 + FW / 2, cz: z0 + FD / 2, band }
})

// The home farm inside its walls. The camera stays over it.
export const FARM = { x0: -18.4, x1: 29, z0: -22.6, z1: 25.5 }
export const FARM_CENTER = { x: 4.6, z: 0.4 }
export const WATER_Y = 0.06
const BROOK_Z0 = 22.6

// The slope through the farm, west to east: far ridge, two hills, our ridge, the fields, the brook, the land rising again.
const KNOTS: [number, number][] = [
  [-3600, 120], [-2300, 100], [-1500, 108], [-1100, 82], [-760, 42], [-520, 40], [-380, 22], [-215, 19], [-120, 8.5], [-72, 6.3],
  [-40, 6.7], [-21, 5.1], [-8, 3.735], [5, 2.37], [18.5, 0.95], [BROOK_Z0, 0.26], [27, 0.75], [46, 2.2], [80, 5.5], [170, 17],
  [320, 24], [540, 58], [900, 75], [1500, 118], [3600, 150],
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
  return Math.max(Math.abs(x - FARM_CENTER.x) - 34, Math.abs(z) - 34, 0)
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
  const w = smooth(0, 220, Math.max(Math.abs(x - FARM_CENTER.x) - 34, 0))
  return BROOK_Z0 + 1.3 * Math.sin(x * 0.075 + 0.4) + 0.6 * Math.sin(x * 0.19 + 1.7) - wander(x, BROOK_Z0, w)
}

export function brookHalf(x: number): number {
  return 1.15 + 0.3 * Math.sin(x * 0.13 + 0.7)
}

export const HOUSE = { x: 23.6, z: 4.4 }
export const BARN = { x: 23.9, z: -6.5 }
export const POTATO_HOUSE = { x: 23.4, z: -17.6 }

// Ground levelled for the buildings: each sits a step higher up the slope than the last.
const PADS = [
  { x: HOUSE.x, z: HOUSE.z, rx: 2.9, rz: 2.9, at: 4.6 },
  { x: HOUSE.x + 0.1, z: -0.1, rx: 2.4, rz: 2.8, at: 0.4 },
  { x: BARN.x, z: BARN.z, rx: 3.5, rz: 4.1, at: -5.2 },
  { x: POTATO_HOUSE.x, z: -13.1, rx: 2.9, rz: 1.9, at: -14.0 },
]

export function padLevel(k: number): number {
  return profile(PADS[k].at)
}

// The farm road: from the potato house down past the dooryard, over the brook and out to the town road.
export const ROAD: [number, number][] = [
  [23.4, -13.2], [20.9, -12.0], [18.9, -9.6], [17.9, -4.5], [17.7, 3.4], [17.9, 10], [17.6, 17], [17.8, 22.4], [18.3, 30], [19.2, 38], [20.2, 47.5],
  [20.6, townRoadZ(20.6)],
]
export const SPURS: [number, number][][] = [
  [[17.7, 3.4], [21.3, 3.6]],
  [[17.9, -4.5], [21.2, -5.6]],
]

function segDist(x: number, z: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1)
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)
}

export function roadDist(x: number, z: number): number {
  if (x < 14 || x > 30 || z < -18 || z > 60) return 99
  let d = 99
  for (let k = 0; k < ROAD.length - 1; k++) d = Math.min(d, segDist(x, z, ROAD[k], ROAD[k + 1]))
  for (const s of SPURS) d = Math.min(d, segDist(x, z, s[0], s[1]) + 0.1)
  return d
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
    const d = Math.hypot(dx, dz)
    m = Math.max(m, 1 - smooth(pad * 0.4, pad, d))
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
    y = mix(WATER_Y + 0.24 + 0.05 * db, y, smooth(1.2, 7, db))
    y = mix(y, WATER_Y - 0.5, 1 - smooth(hw - 0.35, hw + 0.4, db))
  }
  let flat = 0
  if (home && x > 16) {
    for (const p of PADS) {
      const d = Math.max(Math.abs(x - p.x) / p.rx, Math.abs(z - p.z) / p.rz)
      const k = 1 - smooth(0.78, 1.25, d)
      if (k > 0) { y = mix(y, profile(p.at), k); flat = Math.max(flat, k) }
    }
  }
  const road = 1 - smooth(0.6, 1.6, roadDist(x, z))
  const field = home ? fieldMask(x, z, 0.7) : 0
  const bank = smooth(0.6, 3, db)
  const amp = 0.11 * (1 - field) * (1 - flat) * (1 - 0.85 * road) * bank
  return y + amp * (fbm2(x * 0.23 + 4.2, z * 0.23) - 0.5) * 2
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

// Stone walls: the north-west boundary, the wall under the woodlot, and the wall along the road with its gateways.
export const WALLS: [number, number, number, number][] = [
  [-17.5, -21.6, -17.4, 20.4], [-17.5, -21.7, 16.4, -21.7], [16.5, -21.7, 16.5, -8.2], [16.4, 5.6, 16.4, 19.6],
]

export function wallDist(x: number, z: number): number {
  let d = 99
  for (const [x0, z0, x1, z1] of WALLS) d = Math.min(d, segDist(x, z, [x0, z0], [x1, z1]))
  return d
}

// Where the tractor waits when there is nothing to do: on the apron of the potato house.
export const SHED_SPOT = { x: 21.2, z: -12.6, heading: 2.6 }

// ---- The country beyond the walls: a quilt of blocks, each a woodlot or a run of strips. The terrain shader draws the
// same quilt from the same numbers (see QUILT_GLSL in terrain.ts), so trees stand where the picture says woods.
export const REGION = 120
export const HOME_WOODS = { x0: -44, x1: 14.5, z0: -58, z1: -23.4 }

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

// Whether trees stand here: the home woodlot on the ridge, the woodlots of the quilt, and the hedgerows between blocks.
export function woodsAt(x: number, z: number): { woods: number; hard: number } {
  const h = HOME_WOODS
  // No trees on the farm itself, nor on the neighbour's ground to the north-west where the evening sun comes from.
  if (x > FARM.x0 - 1.5 && x < FARM.x1 + 1.5 && z > FARM.z0 && z < FARM.z1 + 6) return { woods: 0, hard: 0 }
  if (x > -150 && x <= FARM.x0 && z > FARM.z0 - 6 && z < FARM.z1 + 8) return { woods: 0, hard: 0 }
  const ragged = 5 * (fbm2(x * 0.09, z * 0.09) - 0.5)
  if (x > h.x0 + ragged && x < h.x1 + ragged && z > h.z0 + ragged && z < h.z1) return { woods: 1, hard: z > h.z1 - 5 ? 0.6 : 0.16 }
  const r = regionAt(x, z)
  if (r.woods) return { woods: smooth(1.5, 6, r.edge + ragged * 0.6), hard: r.hard }
  return { woods: r.edge < 1.6 ? 0.45 : 0, hard: 0.75 }
}
