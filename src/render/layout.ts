// Where everything on the farm sits. Pure numbers, shared by the 3D view, picking and the 2D fallback.
import { COLS, FIELD_COUNT, ROWS } from '../sim/index.ts'
import { fbm2, smooth } from './noise.ts'

export const SX = 0.9                // hill spacing along a row (x)
export const SZ = 1.0                // row spacing (z)
export const FW = COLS * SX
export const FD = ROWS * SZ

export const BLOCK = { x0: -15, x1: 23.5, z0: -22.5, z1: 19.6, base: -3 }
const TILT = 0.05
const TERRACE_Z0 = [-14.5, -3.5, 7.5]
const TERRACE_Y = [4.2, 2.2, 0.4]
const FIELD_X0 = [-11.4, 0.6]

export interface FieldRect { i: number; x0: number; x1: number; z0: number; z1: number; cx: number; cz: number; terrace: number }

export const FIELDS: FieldRect[] = Array.from({ length: FIELD_COUNT }, (_, i) => {
  const t = Math.floor(i / 2), x0 = FIELD_X0[i % 2], z0 = TERRACE_Z0[t]
  return { i, x0, x1: x0 + FW, z0, z1: z0 + FD, cx: x0 + FW / 2, cz: z0 + FD / 2, terrace: t }
})

function terraceY(t: number, z: number): number {
  return TERRACE_Y[t] - TILT * (z - (TERRACE_Z0[t] + FD / 2))
}

const BROOK = { z: 17.4, half: 0.8, bed: -0.65, water: -0.3 }
export const BROOK_Z = BROOK.z
export const WATER_Y = BROOK.water

// Ground height along the slope, terraced, without bumps.
export function profile(z: number): number {
  if (z < -15) return terraceY(0, -15) + 3.1 * smooth(-15, -21.5, z)
  if (z < -6) return terraceY(0, z)
  if (z < -4) return mix(terraceY(0, -6), terraceY(1, -4), smooth(-6, -4, z))
  if (z < 5) return terraceY(1, z)
  if (z < 7) return mix(terraceY(1, 5), terraceY(2, 7), smooth(5, 7, z))
  if (z < 16) return terraceY(2, z)
  const g = mix(terraceY(2, 16), 0.05, smooth(16, 16.6, z))
  const d = Math.abs(z - BROOK.z)
  const chan = d < BROOK.half + 0.25 ? 1 - smooth(BROOK.half - 0.35, BROOK.half + 0.25, d) : 0
  const far = z > BROOK.z ? mix(0.05, 0.18, smooth(BROOK.z, 19.4, z)) : g
  return mix(far, BROOK.bed, chan)
}

// The same slope without terraces, for the road side and the woods edge.
const SMOOTH: number[] = []
const SMOOTH_Z0 = BLOCK.z0 - 1, SMOOTH_STEP = 0.25
for (let z = SMOOTH_Z0; z <= BLOCK.z1 + 1; z += SMOOTH_STEP) {
  let s = 0, n = 0
  for (let k = -12; k <= 12; k++) { s += profile(z + k * 0.25); n++ }
  SMOOTH.push(s / n)
}
function smoothProfile(z: number): number {
  const f = (z - SMOOTH_Z0) / SMOOTH_STEP
  const i = Math.max(0, Math.min(SMOOTH.length - 2, Math.floor(f)))
  const t = Math.max(0, Math.min(1, f - i))
  const p = SMOOTH[i] * (1 - t) + SMOOTH[i + 1] * t
  // The brook still cuts through.
  return Math.min(p, profile(z) + (Math.abs(z - BROOK.z) < 1.2 ? 0 : 99))
}

export const HOUSE = { x: 18.2, z: 3.2 }
export const POTATO_HOUSE = { x: 17.4, z: -13.2 }
const PADS = [
  { x: HOUSE.x + 0.6, z: HOUSE.z - 0.6, rx: 3.6, rz: 3.4 },
  { x: POTATO_HOUSE.x, z: POTATO_HOUSE.z + 0.6, rx: 3.2, rz: 4.2 },
]

// The farm road: from the potato house door down past the farmhouse and over the brook.
export const ROAD: [number, number][] = [
  [POTATO_HOUSE.x, POTATO_HOUSE.z + 2.4], [15.6, -8.6], [13.8, -5.2], [13.4, 0.5], [13.8, 6.2], [13.5, 12], [13.6, 16], [13.6, BLOCK.z1],
]
const SPUR: [number, number][] = [[13.5, HOUSE.z], [HOUSE.x - 1.9, HOUSE.z]]

function segDist(x: number, z: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)
}

export function roadDist(x: number, z: number): number {
  let d = 99
  for (let k = 0; k < ROAD.length - 1; k++) d = Math.min(d, segDist(x, z, ROAD[k], ROAD[k + 1]))
  return Math.min(d, segDist(x, z, SPUR[0], SPUR[1]) + 0.15)
}

// Ground height anywhere on the block.
export function groundY(x: number, z: number): number {
  const terr = profile(z)
  const wR = smooth(11.9, 13.0, x), wL = smooth(-11.9, -13.2, x)
  const w = Math.max(wR, wL * 0.8)
  let y = terr * (1 - w) + smoothProfile(z) * w
  let flat = 0
  for (const p of PADS) {
    const dx = (x - p.x) / p.rx, dz = (z - p.z) / p.rz
    const d = Math.max(Math.abs(dx), Math.abs(dz))
    const k = 1 - smooth(0.75, 1.15, d)
    if (k > 0) {
      y = y * (1 - k) + smoothProfile(p.z) * k
      flat = Math.max(flat, k)
    }
  }
  const road = 1 - smooth(0.7, 1.5, roadDist(x, z))
  const field = fieldMask(x, z, 0.5)
  const woods = smooth(-15.2, -17.5, z)
  const amp = (0.13 + 0.4 * woods) * (1 - field) * (1 - flat) * (1 - 0.8 * road)
  const bank = Math.abs(z - BROOK.z) < 1.4 ? 0.3 : 1
  return y + amp * bank * (fbm2(x * 0.22, z * 0.22) - 0.5) * 2
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

// The flat surface a field's soil lies on (no bumps inside fields).
export function fieldBaseY(field: number, z: number): number {
  return terraceY(FIELDS[field].terrace, z)
}

export function hillPos(field: number, hill: number): { x: number; z: number } {
  const f = FIELDS[field]
  const row = Math.floor(hill / COLS), col = hill % COLS
  return { x: f.x0 + (col + 0.5) * SX, z: f.z0 + (row + 0.5) * SZ }
}

// Where the tractor waits when there is nothing to do.
export const SHED_SPOT = { x: POTATO_HOUSE.x - 1.6, z: POTATO_HOUSE.z + 4.2, heading: Math.PI * 0.5 }

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
