// What lies and stands about the yards and ties them to the land: logs and field stone as the farm has them; the
// dooryard's fences, garden, washing and hens; the orchard, the pasture fence, the gate on the town road; and out in
// the country the neighbours' places, the poles along the roads and the far things the eye measures distance by.
import { IRON, TRIM, barrel, chimney, door, foundation, leanRoof, level, roof, shell, stoneHeap, tipped, wheel, win } from './arch.ts'
import { FIN, type Builder, type V3 } from './builder.ts'
import { cordwood } from './farmstead.ts'
import { FARMSTEADS } from './flora.ts'
import { DUFOUR_DRIVE, PASTURE, ROAD, SIDING, VILLAGE, WIDE, WOOD_GATE, hillRoadZ as hillRoadTrue, townRoadZ as townRoadTrue } from './layout.ts'
import { SMALL as M } from './measures.ts'
import { K, S } from './scale.ts'
import {
  DUFOUR, DUFOUR_BARN, GATEWAYS_TRUE, HOME, HOUSE, LOG_DECKS, ROADSIDE, STANDSIDE, STONE_PILE, TRUE, from, groundY, townRoadZ, useFrame,
} from './small.ts'
import { hash2 } from './noise.ts'

const BARK = '#5f4d3d', CUT = '#d0ae78', GREY_WOOD = '#8a7d6b', POST = '#77695a'

// ---- What comes off the land: sawlogs decked on skids, one for each load, and a heap of field stone that grows.
export const DECK_HOLDS = 21
export function materials(b: Builder, logs: number, stone: number): void {
  useFrame(HOME)
  let left = Math.min(Math.round(logs), DECK_HOLDS * LOG_DECKS.length)
  LOG_DECKS.forEach((d, n) => {
    const here = Math.min(left, DECK_HOLDS)
    left -= here
    if (here <= 0 && n > 0) return
    const y = level(d.x, d.z, 1.6, 2.4).top
    b.at(d.x, y, d.z, d.heading, y)
    // skids under the deck, stakes at its sides
    for (const z of [-0.75, 0.75]) b.box(0, 0.045, z, 1.7, 0.09, 0.1, '#6d5b48', FIN.wood)
    if (here > 0) for (const x of [-0.74, 0.74]) for (const z of [-0.75, 0.75]) b.box(x, 0.4, z, 0.05, 0.72, 0.05, '#7d6a52', FIN.wood)
    // sixteen-foot logs, a foot or so through: seven to the bottom row, one fewer in each above
    let k = 0
    for (let row = 0; row < 4 && k < here; row++) {
      const inRow = 7 - row
      for (let i = 0; i < inRow && k < here; i++, k++) {
        const j = hash2(k + n * 37, 5), r = 0.078 + 0.02 * j
        const x = (i - (inRow - 1) / 2) * 0.194 + (hash2(k, 9) - 0.5) * 0.016, yy = 0.09 + 0.09 + row * 0.158
        const half = 1.08 + 0.1 * hash2(k, 3), off = (hash2(k, 7) - 0.5) * 0.16
        b.cyl([x, yy, off - half], [x, yy, off + half], r, r * (0.84 + 0.1 * j), 8, BARK, FIN.wood, { cap: 'ab', capColor: CUT, capFin: FIN.endgrain, tint: 0.8 + 0.4 * j, uo: k })
      }
    }
  })
  const n = Math.min(90, Math.round(stone * 1.3))
  if (n > 0) {
    const y = groundY(STONE_PILE.x, STONE_PILE.z)
    b.at(STONE_PILE.x, y, STONE_PILE.z, 0, y)
    stoneHeap(b, 0, 0, 0, 0.34 + 0.085 * Math.sqrt(n), n, 11)
  }
}

// ---- A truck for the town road and a car for the stand. Each faces +x.
function truck(b: Builder, body: string): void {
  // a farm truck of the day: a rounded hood, a tall cab, a stake body
  b.box(-0.1, 0.38, 0, 2.3, 0.1, 0.5, '#2a2a27', FIN.plain)
  b.box(0.82, 0.62, 0, 0.62, 0.34, 0.6, body, FIN.plain)
  b.box(0.86, 0.82, 0, 0.5, 0.08, 0.5, body, FIN.plain)
  b.box(1.14, 0.58, 0, 0.03, 0.26, 0.4, '#b9bcb8', FIN.metal)
  b.box(0.3, 0.8, 0, 0.5, 0.7, 0.66, body, FIN.plain)
  b.box(0.3, 1.17, 0, 0.56, 0.04, 0.7, body, FIN.plain, { tint: 0.8 })
  b.panel([0.552, 0.86, 0.28], [0.552, 0.86, -0.28], [0.552, 1.1, -0.28], [0.552, 1.1, 0.28], [1, 1, 2], FIN.glass, 1)
  for (const sg of [-1, 1]) {
    b.panel(sg > 0 ? [0.12, 0.86, 0.332] : [0.48, 0.86, -0.332], sg > 0 ? [0.48, 0.86, 0.332] : [0.12, 0.86, -0.332], sg > 0 ? [0.48, 1.1, 0.332] : [0.12, 1.1, -0.332], sg > 0 ? [0.12, 1.1, 0.332] : [0.48, 1.1, -0.332], [1, 1, 2], FIN.glass, 1)
    b.box(0.86, 0.5, sg * 0.34, 0.5, 0.08, 0.14, body, FIN.plain, { tint: 0.85 })
    wheel(b, [0.86, 0.22, sg * 0.32], [0, 0, 1], 0.22, 0.12, '#c9c2ae', 10)
    wheel(b, [-0.78, 0.22, sg * 0.34], [0, 0, 1], 0.22, 0.2, '#c9c2ae', 10)
    for (const x of [-1.2, -0.7, -0.2]) b.box(x, 0.84, sg * 0.42, 0.04, 0.5, 0.03, '#8a7458', FIN.wood)
    for (const y of [0.76, 0.98]) b.box(-0.68, y, sg * 0.42, 1.2, 0.09, 0.02, '#9c8660', FIN.boards)
    b.blob([1.15, 0.7, sg * 0.2], [0.03, 0.045, 0.045], 3, '#e9e2c9', FIN.plain, { detail: 0, rough: 0 })
  }
  b.box(-0.68, 0.48, 0, 1.3, 0.06, 0.86, '#9c8660', FIN.boards)
  b.box(-0.06, 0.82, 0, 0.03, 0.6, 0.86, '#9c8660', FIN.boards)
}

function car(b: Builder, body: string): void {
  b.box(0, 0.36, 0, 1.9, 0.26, 0.72, body, FIN.plain)
  b.box(0.62, 0.52, 0, 0.6, 0.1, 0.66, body, FIN.plain)
  b.box(-0.12, 0.64, 0, 0.86, 0.32, 0.64, body, FIN.plain, { tint: 0.94 })
  b.box(-0.12, 0.815, 0, 0.8, 0.03, 0.6, body, FIN.plain, { tint: 0.86 })
  b.box(-0.72, 0.5, 0, 0.42, 0.08, 0.66, body, FIN.plain)
  b.panel([0.312, 0.56, 0.28], [0.312, 0.56, -0.28], [0.312, 0.78, -0.28], [0.312, 0.78, 0.28], [1, 1, 2], FIN.glass, 1)
  b.panel([-0.552, 0.56, -0.28], [-0.552, 0.56, 0.28], [-0.552, 0.78, 0.28], [-0.552, 0.78, -0.28], [1, 1, 2], FIN.glass, 1)
  for (const sg of [-1, 1]) {
    b.panel(sg > 0 ? [-0.5, 0.56, 0.322] : [0.26, 0.56, -0.322], sg > 0 ? [0.26, 0.56, 0.322] : [-0.5, 0.56, -0.322], sg > 0 ? [0.26, 0.78, 0.322] : [-0.5, 0.78, -0.322], sg > 0 ? [-0.5, 0.78, 0.322] : [0.26, 0.78, -0.322], [2, 1, 2], FIN.glass, 1)
    for (const x of [0.6, -0.62]) wheel(b, [x, 0.19, sg * 0.33], [0, 0, 1], 0.19, 0.12, '#d8d2c2', 10)
    b.blob([0.95, 0.42, sg * 0.24], [0.03, 0.05, 0.05], 3, '#e9e2c9', FIN.plain, { detail: 0, rough: 0 })
  }
  b.box(0.97, 0.3, 0, 0.04, 0.06, 0.74, '#c9ccc8', FIN.metal)
  b.box(-0.97, 0.3, 0, 0.04, 0.06, 0.74, '#c9ccc8', FIN.metal)
}

function wagon(b: Builder): void {
  b.box(0, 0.5, 0, 2.3, 0.06, 0.95, '#8a7458', FIN.boards)
  for (const sg of [-1, 1]) b.box(0, 0.44, sg * 0.3, 2.2, 0.08, 0.08, '#6d5b48', FIN.wood)
  for (const x of [-0.8, 0.8]) {
    b.box(x, 0.36, 0, 0.08, 0.08, 1.0, '#6d5b48', FIN.wood)
    for (const sg of [-1, 1]) {
      b.cyl([x, 0.3, sg * 0.5], [x, 0.3, sg * 0.56], 0.3, 0.3, 12, '#7a2f24', FIN.plain, { cap: 'ab', ex: 0.9 })
      b.cyl([x, 0.3, sg * 0.49], [x, 0.3, sg * 0.57], 0.06, 0.06, 6, IRON, FIN.plain, { cap: 'ab' })
    }
  }
  for (const x of [-1.12, 1.12]) { b.box(x, 0.86, 0, 0.05, 0.7, 0.05, '#8a7458', FIN.wood); b.box(x, 1.1, 0, 0.04, 0.05, 0.9, '#8a7458', FIN.wood); b.box(x, 0.8, 0, 0.04, 0.05, 0.9, '#8a7458', FIN.wood) }
  b.beam([1.15, 0.38, 0], [2.3, 0.2, 0], 0.06, 0.06, '#6d5b48', FIN.wood)
}

// A customer's car pulled onto the verge by the stand on the days it is open. (The farm's own machines are drawn
// where they stand, working or parked, by units.ts.)
export function standCar(b: Builder): void {
  useFrame(STANDSIDE)
  const x = 3.2, z = 1.7, y = groundY(x, z) + 0.02
  b.at(x, y, z, 0.1, y)
  car(b, '#7d9aa8')
}

// ---- Fences.
// A picket fence along a line of points; `gate`: how far along the first run a gap is left, with its posts.
function picket(b: Builder, x0: number, z0: number, x1: number, z1: number, gate = -1): void {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.062)
  const dx = (x1 - x0) / len, dz = (z1 - z0) / len
  b.at(0, 0, 0, 0, groundY(x0, z0))
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * len, x = x0 + dx * d, z = z0 + dz * d, y = groundY(x, z)
    if (gate >= 0 && Math.abs(d - gate) < 0.24) continue
    b.box(x, y + 0.25, z, 0.034, 0.42, 0.012, TRIM, FIN.plain, { ry: Math.atan2(-dz, dx), skip: 'b', tint: 0.92 + 0.14 * hash2(k, 3) })
    if (k % 18 === 0 || k === n || (gate >= 0 && Math.abs(Math.abs(d - gate) - 0.3) < 0.035)) b.box(x, y + 0.29, z, 0.06, 0.58, 0.06, TRIM, FIN.plain, { skip: 'b' })
  }
  for (const h of [0.14, 0.36]) {
    const segs = Math.ceil(len / 1.1)
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * len, c = ((k + 1) / segs) * len
      if (gate >= 0 && a < gate + 0.24 && c > gate - 0.24) continue
      b.beam([x0 + dx * a, groundY(x0 + dx * a, z0 + dz * a) + h, z0 + dz * a], [x0 + dx * c, groundY(x0 + dx * c, z0 + dz * c) + h, z0 + dz * c], 0.016, 0.04, TRIM, FIN.plain)
    }
  }
}

// Posts along a line with wire, rails or boards between them. `gap`: a stretch [from, to] along it left open for a gate.
type Fence = 'wire' | 'rail' | 'board'
function fence(b: Builder, pts: [number, number][], kind: Fence, every: number, gap: [number, number] | null = null, color = kind === 'board' ? '#e2dccd' : POST): void {
  let run = 0, n = 0
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, z0] = pts[s], [x1, z1] = pts[s + 1]
    const len = Math.hypot(x1 - x0, z1 - z0), count = Math.max(1, Math.round(len / every))
    let prev: V3 | null = null
    for (let k = 0; k <= count; k++, n++) {
      const d = run + (len * k) / count
      const open = !!gap && d > gap[0] && d < gap[1]
      const jit = kind === 'board' ? 0 : 0.05
      const x = x0 + ((x1 - x0) * k) / count + (hash2(n, 31) - 0.5) * jit, z = z0 + ((z1 - z0) * k) / count + (hash2(n, 37) - 0.5) * jit, y = groundY(x, z)
      const lean = kind === 'board' ? 0 : (hash2(n, 41) - 0.5) * 0.07
      const tall = kind === 'board' ? 0.62 : 0.5 + 0.08 * hash2(n, 43)
      const here: V3 = [x + lean * 0.7, y, z + lean * 0.4]
      if (open) { prev = null; continue }
      b.at(0, 0, 0, 0, y)
      if (kind === 'board') b.box(x, y + tall / 2 - 0.04, z, 0.06, tall + 0.08, 0.06, color, FIN.plain, { skip: 'b' })
      else b.cyl([x, y - 0.05, z], [x + lean, y + tall, z + lean * 0.6], 0.036, 0.028, 5, POST, FIN.wood, { tint: 0.8 + 0.4 * hash2(n, 47) })
      if (prev) {
        if (kind === 'wire') for (const h of [0.16, 0.3, 0.44]) b.beam([prev[0], prev[1] + h, prev[2]], [here[0], here[1] + h, here[2]], 0.01, 0.01, '#4a4640', FIN.plain, { skip: 'lr' })
        else if (kind === 'rail') for (const h of [0.18, 0.4]) b.beam([prev[0], prev[1] + h + 0.03, prev[2]], [here[0], here[1] + h - 0.02, here[2]], 0.035, 0.045, GREY_WOOD, FIN.wood)
        else for (const h of [0.16, 0.36, 0.56]) b.beam([prev[0], prev[1] + h, prev[2]], [here[0], here[1] + h, here[2]], 0.014, 0.065, color, FIN.plain, { skip: 'lr', tint: 0.94 + 0.1 * hash2(n, h * 100) })
      }
      prev = here
    }
    run += len
  }
}

// A farm gate of bars with a brace, hung at (x, z) and swung to `ry`; `wide` across.
function gate(b: Builder, x: number, z: number, ry: number, wide: number, color = GREY_WOOD): void {
  const y = groundY(x, z)
  b.at(x, y, z, ry, y)
  for (const h of [0.14, 0.3, 0.46, 0.6]) b.box(wide / 2, h, 0, wide, 0.045, 0.02, color, FIN.wood)
  for (const px of [0.03, wide / 2, wide - 0.03]) b.box(px, 0.37, 0, 0.05, 0.52, 0.03, color, FIN.wood)
  b.beam([0.04, 0.14, 0.014], [wide - 0.04, 0.6, 0.014], 0.02, 0.045, color, FIN.wood)
  b.box(-0.04, 0.4, 0, 0.09, 0.9, 0.09, POST, FIN.wood, { skip: 'b' })
}

function hen(b: Builder, x: number, z: number, ry: number, color: string, pecking: boolean): void {
  const y = groundY(x, z)
  b.at(x, y, z, ry, y)
  b.blob([0, 0.085, 0], [0.075, 0.06, 0.05], 3, color, FIN.plain, { detail: 1, rough: 0.12 })
  b.blob([-0.07, 0.12, 0], [0.04, 0.05, 0.03], 5, color, FIN.plain, { detail: 0, rough: 0.2, tint: 0.85 })
  const hx = pecking ? 0.09 : 0.065, hy = pecking ? 0.05 : 0.16
  b.blob([hx, hy, 0], [0.028, 0.03, 0.024], 7, color, FIN.plain, { detail: 0, rough: 0.1 })
  b.box(hx + 0.004, hy + 0.03, 0, 0.025, 0.02, 0.008, '#b8402c', FIN.plain)
  b.box(hx + 0.034, hy - 0.004, 0, 0.02, 0.01, 0.012, '#c9a03c', FIN.plain)
  for (const sg of [-1, 1]) b.box(0.005, 0.02, sg * 0.02, 0.008, 0.045, 0.008, '#c9a03c', FIN.plain)
}

// ---- What ties the yards to the land and reads from the fields: fences, the orchard, the pasture, the gate on the
// town road. Made once.
export function yardBones(b: Builder): void {
  const hx = HOUSE.x, hz = HOUSE.z
  useFrame(HOME)
  // The front garden: pickets from the dooryard wall round the gable to the brook, a gate on the path to the front door.
  picket(b, 22.1, hz + 1.6, 21.0, hz + 1.6)
  picket(b, 21.0, hz + 1.6, 21.0, hz + 6.4)
  picket(b, 21.0, hz + 6.4, 26.8, hz + 6.4, hx + 0.325 - 21.0)
  picket(b, 26.8, hz + 6.4, 26.8, hz + 3.26)
  picket(b, 26.8, hz + 3.26, 25.78, hz + 3.26)
  // The kitchen yard behind the house, boarded off from the back lane: the garden, the hens and the wash inside it.
  fence(b, [[25.8, hz - 1.3], [30.5, hz - 1.3], [30.5, -12.9], [29.1, -12.3]], 'board', 1.1, [10.6, 11.6])
  gate(b, 30.5, hz - 1.3 - 5.9, Math.PI / 2 + 0.5, 0.95, '#e2dccd')
  // The pasture east of the yard: cedar posts and three wires, a gate at the end of the shed lane, a trough by it.
  useFrame(TRUE)
  const P = PASTURE.map(p => [p.x / S, p.z / S] as [number, number])
  const gateAt = from(HOME, 50.4, -6.4)
  fence(b, [P[0], P[1], P[2], P[3], [P[0][0], gateAt.z + 1.0]], 'wire', 1.9)
  fence(b, [[P[0][0], gateAt.z - 1.0], P[0]], 'wire', 1.9)
  gate(b, P[0][0], gateAt.z - 1.0, -Math.PI / 2 - 1.1, 2.0)
  b.box(P[0][0] + 0.04, groundY(P[0][0], gateAt.z + 1) + 0.4, gateAt.z + 1.0, 0.09, 0.9, 0.09, POST, FIN.wood, { skip: 'b' })
  {
    const x = P[0][0] + 2.6, z = gateAt.z + 2.4, y = groundY(x, z)
    b.at(x, y, z, 0.3, y)
    b.box(0, 0.16, 0, 1.3, 0.3, 0.42, '#77736b', FIN.concrete, { skip: 'b' })
    b.box(0, 0.3, 0, 1.2, 0.02, 0.32, '#3d4f57', FIN.plain)
    b.blob([1.2, 0.07, 0.5], [0.1, 0.07, 0.1], 3, '#d8d4c8', FIN.plain, { detail: 0, rough: 0.2, facets: true })
  }
  // The gate on the town road: board fence along the frontage, the gate hooked back, the culvert under the drive.
  const end = ROAD[ROAD.length - 1], before = ROAD[ROAD.length - 2]
  const dl = Math.hypot(end[0] - before[0], end[1] - before[1]), ux = (end[0] - before[0]) / dl, uz = (end[1] - before[1]) / dl
  const gx = (end[0] - ux * 11) / S, gz = (end[1] - uz * 11) / S, nx = -uz, nz = ux
  const half = 2.5 / S
  for (const sg of [-1, 1]) {
    fence(b, [[gx + nx * sg * half, gz + nz * sg * half], [gx + nx * sg * (half + 7), gz + nz * sg * (half + 7) + 0.4]], 'board', 1.1)
  }
  gate(b, gx + nx * half, gz + nz * half, Math.atan2(-nz, nx) + Math.PI - 1.35, half * 2 - 0.1)
  // Bars where the tracks pass through the walls, slid back; and the woodlot path's.
  for (const { x, z } of [...GATEWAYS_TRUE, { x: WOOD_GATE.x / S, z: WOOD_GATE.z / S }]) {
    for (const sg of [-1, 1]) {
      const pz = z + sg * 1.05, y = groundY(x, pz)
      b.at(0, 0, 0, 0, y)
      for (const dx of [-0.07, 0.07]) b.box(x + dx, y + 0.34, pz, 0.06, 0.7, 0.07, POST, FIN.wood)
    }
    const y = groundY(x, z - 1.9)
    for (let q = 0; q < 3; q++) b.beam([x + (q - 1) * 0.02, y + 0.16 + q * 0.2, z - 3.0], [x, groundY(x, z - 1.05) + 0.14 + q * 0.2, z - 0.95], 0.04, 0.05, GREY_WOOD, FIN.wood, { tint: 0.85 + 0.1 * q })
  }
  // The mailbox where the farm's road meets the town road, and the culvert that carries the ditch under it.
  useFrame(ROADSIDE)
  {
    const x = 22.3, z = townRoadZ(22.3) - 1.9, y = groundY(x, z)
    b.at(x, y, z, 0.2, y)
    b.box(0, 0.25, 0, 0.05, 0.5, 0.05, POST, FIN.wood)
    b.box(0, 0.56, 0.04, 0.09, 0.09, 0.22, '#b9bcb8', FIN.metal)
    b.box(0.05, 0.6, 0.1, 0.01, 0.08, 0.04, '#b8402c', FIN.plain)
    const cz = townRoadZ(20.6) - 2.6
    for (const sg of [-1, 1]) {
      const cx = 20.55 + sg * 1.25, cy = groundY(cx, cz)
      b.at(cx, cy, cz, 0, cy)
      b.box(0, 0.08, 0, 0.3, 0.46, 1.1, '#8f8a80', FIN.stone, { skip: 'b' })
      b.cyl([sg * 0.16, 0.06, 0], [-sg * 0.3, 0.06, 0], 0.17, 0.17, 10, '#77736b', FIN.concrete, { cap: 'a', capColor: '#0d0c0b', capFin: FIN.dark })
      b.blob([sg * 0.5, -0.02, 0.1], [0.5, 0.06, 0.4], 3, '#6f6a5c', FIN.gravel, { detail: 1, rough: 0.2 })
    }
  }
  // The Dufour place: a rail fence gone grey along the foot of its dooryard.
  useFrame(DUFOUR)
  fence(b, [[85.0, 5.6], [92.6, 6.3], [98.6, 6.0]], 'rail', 1.4, [8.4, 9.9])
}

// ---- The life of the yards, seen when the camera comes in: fixed things, made once.
export function yardLife(b: Builder): void {
  const hx = HOUSE.x, hz = HOUSE.z
  useFrame(HOME)
  b.at(0, 0, 0, 0, groundY(21, 5))
  // Beds under the windows of the big house, hollyhocks against the clapboards; flagstones from the gate to the steps.
  const bed = (x: number, z: number, k: number, wallX: number | null) => {
    const y = groundY(x, z), r = 0.13 + 0.05 * hash2(k, 7)
    b.blob([x, y + r * 0.5, z], [r, r * 0.8, r * 1.25], k, k % 3 ? '#3f6b35' : '#4f7a3c', FIN.leaf, { detail: 1, rough: 0.4, ex: 0 })
    for (let q = 0; q < 5; q++) {
      const a = hash2(k * 7 + q, 3) * 6.283, d = r * 0.8 * hash2(k * 7 + q, 9)
      b.blob([x - 0.03 + Math.cos(a) * d, y + r * (0.95 - 0.3 * d / r), z + Math.sin(a) * d * 1.2], [0.022, 0.018, 0.022], q, ['#c9567a', '#e3c44a', '#e9e2d6', '#b65fb0'][(k + q) % 4], FIN.plain, { detail: 0, rough: 0.2 })
    }
    if (wallX !== null && k % 3 === 1) {
      const hgt = 0.5 + 0.22 * hash2(k, 13)
      b.cyl([wallX, y, z + 0.1], [wallX - 0.02, y + hgt, z + 0.1], 0.008, 0.006, 4, '#4f7a3c', FIN.plain)
      for (let q = 0; q < 5; q++) b.blob([wallX - 0.02, y + hgt * (0.45 + 0.13 * q), z + 0.1 + (q % 2 ? 0.02 : -0.02)], [0.028, 0.026, 0.028], q + k, k % 2 ? '#c9567a' : '#e6dccb', FIN.plain, { detail: 0, rough: 0.2 })
    }
  }
  const wx = hx + 0.325 - M.house.w / 2, sz = hz + 0.7 + M.house.l / 2
  for (let k = 0; k < 13; k++) bed(wx - 0.22 - 0.06 * hash2(k, 5), hz + 1.9 + k * 0.29, k, wx - 0.1)
  for (let k = 0; k < 9; k++) { const x = wx + 0.4 + k * 0.36; if (Math.abs(x - (hx + 0.325)) > 0.7) bed(x, sz + 0.24, k + 20, null) }
  for (let k = 0; k < 4; k++) {
    const z = sz + 0.5 + k * 0.33, x = hx + 0.325 + (hash2(k, 3) - 0.5) * 0.12, y = groundY(x, z)
    b.blob([x, y + 0.005, z], [0.2, 0.02, 0.14], k + 3, '#8f8a80', FIN.plain, { detail: 0, rough: 0.2, facets: true })
  }
  // The well by the kitchen's back door: a plank cover and an iron pump, a pail under its spout; a rain barrel.
  {
    const x = 26.1, z = hz - 2.6, y = groundY(x, z)
    b.at(x, y, z, 0.3, y)
    b.box(0, 0.05, 0, 0.6, 0.1, 0.6, GREY_WOOD, FIN.boards)
    b.cyl([0, 0.1, 0], [0, 0.52, 0], 0.04, 0.035, 7, '#3d5a48', FIN.plain)
    b.cyl([0, 0.52, 0], [0, 0.6, 0], 0.05, 0.03, 7, '#3d5a48', FIN.plain, { cap: 'b' })
    b.beam([0, 0.56, 0], [-0.26, 0.44, 0], 0.02, 0.03, '#3d5a48', FIN.plain)
    b.beam([0, 0.42, 0], [0.12, 0.38, 0], 0.03, 0.03, '#3d5a48', FIN.plain)
    b.lathe([0.17, 0.1, 0], [[0.05, 0], [0.065, 0.11]], 7, '#b9bcb8', FIN.metal)
    const rx = hx + 0.2 + M.ell.w / 2 + 0.16, rz = hz - 3.2 - M.ell.l / 2 + 0.2
    b.at(rx, groundY(rx, rz), rz, 0, groundY(rx, rz))
    barrel(b, 0, -0.01, 0, 1.25, 0.8)
  }
  // Milk cans by the back house door, the grindstone by the woodpile.
  {
    const bw = hx + 0.3 - M.backHouse.w / 2
    const y = groundY(bw - 0.3, hz - 4.75)
    b.at(bw - 0.3, y, hz - 4.75, 0, y)
    for (const [x, z] of [[0, 0], [0.16, 0.1]]) b.lathe([x, 0, z], [[0.07, 0], [0.075, 0.2], [0.045, 0.27], [0.05, 0.3]], 8, '#aab0ae', FIN.metal)
    b.at(bw - 0.9, groundY(bw - 0.9, hz - 7.6), hz - 7.55, 0.4, groundY(bw - 0.9, hz - 7.6))
    b.cyl([0, 0.3, -0.03], [0, 0.3, 0.03], 0.16, 0.16, 12, '#a39c8e', FIN.concrete, { cap: 'ab' })
    for (const sg of [-1, 1]) { b.beam([sg * 0.16, 0, -0.1], [0, 0.3, -0.06], 0.03, 0.03, '#6d5b48', FIN.wood); b.beam([sg * 0.16, 0, 0.1], [0, 0.3, 0.06], 0.03, 0.03, '#6d5b48', FIN.wood) }
  }
  // The kitchen garden: rows of greens and roots, beans on poles, the scarecrow in his old coat.
  {
    const gx0 = 26.4, gx1 = 29.6, gz0 = hz - 7.8, gz1 = hz - 3.8
    b.at(0, 0, 0, 0, groundY(28, hz - 5.8))
    const rows = 9
    for (let r = 0; r < rows; r++) {
      const z = gz0 + 0.25 + (r * (gz1 - gz0 - 0.5)) / (rows - 1)
      const ya = groundY(gx0 + 0.15, z), yb = groundY(gx1 - 0.15, z)
      b.beam([gx0 + 0.15, ya + 0.015, z], [gx1 - 0.15, yb + 0.015, z], 0.22, 0.06, '#5d4333', FIN.earth, { skip: 'b' })
      for (let q = 0; q < 14; q++) {
        const x = gx0 + 0.3 + q * 0.2 + (hash2(q, r) - 0.5) * 0.04, y = groundY(x, z) + 0.05
        if (r === 1 || r === 6) {
          if (q % 2) continue
          b.cyl([x, y, z], [x, y + 0.62, z], 0.012, 0.01, 4, '#8a7458', FIN.wood)
          b.blob([x, y + 0.3, z], [0.07, 0.26, 0.07], q * 3 + r, '#4d7d3a', FIN.leaf, { detail: 0, rough: 0.4 })
        } else {
          const kind = r % 3, s = 0.05 + 0.03 * hash2(q + 11, r)
          b.blob([x, y + s * (kind === 0 ? 0.7 : 1.1), z], [s * 1.3, s * (kind === 0 ? 0.8 : 1.4), s * 1.3], q * 7 + r * 13, ['#5c8f55', '#3f7a3c', '#7a9c4c'][kind], FIN.leaf, { detail: 0, rough: 0.5 })
        }
      }
    }
    const sx = gx1 - 0.5, sz2 = gz0 + 1.9, sy = groundY(sx, sz2)
    b.at(sx, sy, sz2, 0.6, sy)
    b.box(0, 0.4, 0, 0.03, 0.8, 0.03, POST, FIN.wood)
    b.box(0, 0.6, 0, 0.52, 0.03, 0.03, POST, FIN.wood)
    b.box(0, 0.5, 0, 0.2, 0.28, 0.07, '#4a5f7a', FIN.cloth, { flex: [0.06, 0] })
    for (const sg of [-1, 1]) b.box(sg * 0.19, 0.57, 0, 0.18, 0.08, 0.06, '#4a5f7a', FIN.cloth, { flex: 0.03 })
    b.blob([0, 0.74, 0], [0.06, 0.07, 0.06], 4, '#c9b27a', FIN.cloth, { detail: 0, rough: 0.1 })
    b.lathe([0, 0.79, 0], [[0.12, 0], [0.06, 0.01], [0.05, 0.06], [0, 0.07]], 8, '#6b5a3c', FIN.cloth)
  }
  // The clothesline between two posts, the week's wash on it.
  {
    const x0 = 26.6, x1 = 29.8, z = hz - 2.4
    const y0 = groundY(x0, z), y1 = groundY(x1, z)
    b.at(0, 0, 0, 0, y0)
    for (const [x, y] of [[x0, y0], [x1, y1]]) { b.box(x, y + 0.5, z, 0.05, 1.05, 0.05, GREY_WOOD, FIN.wood); b.box(x, y + 1.0, z, 0.05, 0.04, 0.5, GREY_WOOD, FIN.wood) }
    const things: [number, number, number, string][] = [
      [0.1, 0.46, 0.42, '#e8e4da'], [0.62, 0.26, 0.3, '#5f7ea3'], [0.94, 0.5, 0.48, '#e3ddd0'], [1.5, 0.22, 0.34, '#b5503e'], [1.78, 0.2, 0.26, '#e8e4da'], [2.04, 0.34, 0.36, '#8a9a6a'], [2.42, 0.18, 0.2, '#d8cfa8'], [2.7, 0.3, 0.4, '#e8e4da'],
    ]
    for (const lz of [-0.2, 0.2]) {
      const line = (t: number): V3 => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 1.0 - 0.09 * Math.sin(t * Math.PI), z + lz]
      for (let q = 0; q < 8; q++) b.beam(line(q / 8), line((q + 1) / 8), 0.008, 0.008, '#d8d2c2', FIN.plain, { skip: 'lr' })
      for (const [at, wide, drop, color] of things) {
        if ((lz > 0) === (Math.round(at * 10) % 2 === 0)) continue
        const a = line(at / (x1 - x0)), c = line((at + wide) / (x1 - x0))
        const lo = (p: V3): V3 => [p[0], p[1] - drop, p[2]]
        b.quad(lo(a), lo(c), c, a, color, FIN.cloth, { flex: [drop * 0.5, 0] })
        b.quad(lo(c), lo(a), a, c, color, FIN.cloth, { flex: [drop * 0.5, 0], tint: 0.9 })
      }
    }
  }
  // The hen house and its hens.
  {
    const cx = 28.3, cz = hz - 9.4
    const g = level(cx, cz, 1.3, 1.0)
    b.at(cx, g.top + 0.12, cz, 0, g.top)
    for (const sx of [-1, 1]) for (const s2 of [-1, 1]) b.box(sx * 0.56, -0.1, s2 * 0.42, 0.06, 0.34, 0.06, POST, FIN.wood)
    b.box(0, 0.36, 0, 1.3, 0.72, 1.0, '#8f3626', FIN.boards, { skip: 'b' })
    leanRoof(b, -0.65, 0.65, -0.5, 0.5, 0.9, 0.7, '#8d908c', FIN.metal, { rust: 0.5, over: 0.08 })
    b.box(0.3, 0.2, 0.505, 0.2, 0.26, 0.012, '#17130f', FIN.dark)
    b.beam([0.3, 0.06, 0.51], [0.3, -0.26, 1.0], 0.18, 0.02, GREY_WOOD, FIN.wood)
    win(b, { o: [-0.65, 0, 0.5], r: [1, 0, 0], n: [0, 0, 1], len: 1.3, h: 0.72 }, 0.4, 0.44, 0.24, 0.18, { cols: 2, rows: 1, barn: true })
    const hens: [number, number, number, string, boolean][] = [
      [-0.3, 1.0, 0.4, '#d8d2c2', true], [0.4, 0.85, 2.2, '#a0522d', false], [0.8, 1.3, 4.1, '#d8d2c2', true], [-0.6, 0.5, 5.3, '#3a3632', false],
      [0.9, 0.4, 1.2, '#a0522d', true], [0.15, 1.5, 3.3, '#b88a4c', true], [-0.85, 1.4, 0.1, '#a0522d', false], [-1.3, 0.9, 2.6, '#d8d2c2', true],
    ]
    for (const [x, z, ry, color, peck] of hens) hen(b, cx + x, cz + z, ry, color, peck)
  }
  // Fuel: a red tank on its stand at the barn's upper end; the manure heap behind the tie-up.
  {
    const x = 28.6, z = -13.9, y = groundY(x, z)
    b.at(x, y, z, 0, y)
    for (const sx of [-0.3, 0.3]) for (const s2 of [-1, 1]) b.beam([sx, 0, s2 * 0.26], [sx, 0.62, s2 * 0.14], 0.035, 0.035, '#5c5d5a', FIN.plain)
    b.cyl([-0.45, 0.82, 0], [0.45, 0.82, 0], 0.22, 0.22, 12, '#9c2f22', FIN.metal, { cap: 'ab', ex: 0.92 })
    b.cyl([0.3, 0.6, 0.16], [0.36, 0.2, 0.3], 0.014, 0.014, 4, '#1f1f1d', FIN.plain)
    b.at(0, 0, 0, 0, y)
    tipped(b, 29.9, groundY(29.9, -9.2), -9.2, 0.75, '#4f4032', FIN.hay, 3)
  }
  // A wagon by the pasture gate, the stone boat by the stone pile, and a light on a pole where the spur leaves the road.
  {
    const wxx = 47.8, wz = -4.4
    b.at(wxx, groundY(wxx, wz), wz, 0.15, groundY(wxx, wz))
    wagon(b)
    const sbx = STONE_PILE.x + 2.0, sbz = STONE_PILE.z - 1.7
    b.at(sbx, groundY(sbx, sbz), sbz, 0.9, groundY(sbx, sbz))
    b.box(0, 0.05, 0, 1.0, 0.05, 0.6, POST, FIN.boards)
    for (const sg of [-1, 1]) b.box(0, 0.03, sg * 0.28, 1.1, 0.07, 0.06, '#5f5345', FIN.wood)
    b.beam([0.5, 0.06, 0], [0.9, 0.06, 0], 0.012, 0.012, IRON, FIN.plain)
    const lx = 19.0, lz = -2.6, ly = groundY(lx, lz)
    b.at(lx, ly, lz, 0, ly)
    b.cyl([0, -0.1, 0], [0, 2.9, 0], 0.05, 0.04, 6, '#5a4a3c', FIN.wood)
    b.beam([0, 2.8, 0], [0.5, 2.9, 0], 0.025, 0.025, IRON, FIN.plain)
    b.lathe([0.5, 2.78, 0], [[0.16, 0], [0.05, 0.08], [0.02, 0.12]], 8, '#3d4a43', FIN.plain)
    b.panel([0.42, 2.775, -0.08], [0.58, 2.775, -0.08], [0.58, 2.775, 0.08], [0.42, 2.775, 0.08], [1, 1, 0], FIN.glass)
  }
  // The Dufour place: an old hay rake rusting behind the barn.
  useFrame(DUFOUR)
  {
    const x = DUFOUR_BARN.x + M.dufour.barn.w / 2 + M.dufour.barn.lean + 1.2, z = DUFOUR_BARN.z + 2.6, y = groundY(x, z)
    b.at(x, y, z, 0.5, y)
    for (const sg of [-1, 1]) {
      b.cyl([0, 0.42, sg * 0.8], [0, 0.42, sg * 0.83], 0.42, 0.42, 14, '#6b3d2c', FIN.metal, { ex: 0.5, cap: 'ab' })
      b.cyl([0, 0.42, sg * 0.79], [0, 0.42, sg * 0.84], 0.36, 0.36, 14, '#17130f', FIN.dark, { cap: 'ab' })
    }
    b.cyl([0, 0.42, -0.8], [0, 0.42, 0.8], 0.025, 0.025, 5, '#6b3d2c', FIN.metal, { ex: 0.5 })
    for (let q = 0; q < 12; q++) b.beam([-0.05, 0.44, -0.72 + q * 0.13], [-0.4, 0.06, -0.72 + q * 0.13], 0.012, 0.012, '#6b3d2c', FIN.plain, { skip: 'lr' })
    b.box(0.1, 0.62, 0, 0.16, 0.03, 0.2, '#6b3d2c', FIN.metal, { ex: 0.5 })
    const cx = 91.6, cz = 1.2, cy = groundY(cx, cz)
    b.at(cx, cy, cz, 0, cy)
    cordwood(b, 0, 0, 0, 1.4, 0.5)
  }
}

// ---- The country.
// A neighbour's farmstead: house and ell, barn, a shed, and on some a silo or a banked potato house. `near`: close
// enough for its windows and doors to be worth drawing.
function neighbour(b: Builder, x: number, z: number, ry: number, k: number, near: boolean): void {
  const y = Math.min(groundY(x, z), groundY(x + 4, z - 12), groundY(x - 4, z + 4)) + 0.2
  const H = M.neighbour.house, B = M.neighbour.barn
  const paint = ['#e2dccd', '#d9d0b8', '#c9c3b2', '#e6dfc8'][k % 4], barnCol = k % 3 === 1 ? '#8a8378' : '#84301f', roofCol = k % 2 ? '#4a4c50' : '#5d5a56'
  const grown = 0.9 + 0.2 * hash2(k, 11)
  b.at(x, y, z, ry, y)
  foundation(b, H.w, H.l, 1.4)
  let sh = shell(b, H.w, H.l, H.wall * grown, H.rise, paint, FIN.clapboard)
  roof(b, H.w, H.l, H.wall * grown, H.rise, { color: roofCol, fin: FIN.shingle, eave: 0.18, rake: 0.16, trim: TRIM })
  for (const f of [sh.W, sh.E]) for (const s of [0.9, H.l / 2, H.l - 0.9]) for (const yy of [0.95, 1.95]) win(b, f, s, yy, 0.36, 0.56, { cols: 2, rows: 2, plain: true, seed: near ? hash2(k * 7 + Math.round(s * 10), Math.round(yy * 10)) : 0.2 + 0.6 * hash2(k, Math.round(s * 9 + yy * 5)) })
  if (near) {
    for (const s of [0.8, H.w - 0.8]) win(b, sh.S, s, 0.95, 0.36, 0.56, { cols: 2, rows: 2, plain: true, seed: 0.2 })
    door(b, sh.S, H.w / 2, 0.02, M.houseDoor.w, M.houseDoor.h, '#3c4a40', { kind: 'panel' })
  }
  chimney(b, 0.3, 0.2, H.wall * grown + H.rise * 0.7, H.wall * grown + H.rise + 0.5, 0.4, 0.4)
  b.push(0.25, 0, -H.l / 2 - 1.5)
  sh = shell(b, 2.5, 3.0, 1.5, 0.9, paint, FIN.clapboard)
  roof(b, 2.5, 3.0, 1.5, 0.9, { color: roofCol, fin: FIN.shingle, eave: 0.16, rake: 0.1, trim: TRIM })
  if (near) win(b, sh.W, 1.5, 0.86, 0.34, 0.52, { cols: 2, rows: 2, plain: true, seed: 0.05 })
  b.pop()
  // the barn stands off from the house across its yard, turned as it suited the ground
  const side = k % 2 ? -1 : 1
  b.push(side * (4.5 + 2 * hash2(k, 5)), 0, -H.l / 2 - 8.5 - 3 * hash2(k, 7), k % 4 === 2 ? Math.PI / 2 : 0)
  foundation(b, B.w, B.l, 1.6)
  sh = shell(b, B.w, B.l, B.wall, B.rise, barnCol, FIN.boards)
  roof(b, B.w, B.l, B.wall, B.rise, { color: '#8d908c', fin: FIN.metal, rust: 0.2 + 0.6 * hash2(k, 3), eave: 0.24, rake: 0.22, trim: k % 3 === 1 ? null : TRIM })
  b.quad([-B.w / 2 - 0.012, 0.02, -0.9], [-B.w / 2 - 0.012, 0.02, 0.9], [-B.w / 2 - 0.012, 1.85, 0.9], [-B.w / 2 - 0.012, 1.85, -0.9], '#1a1410', FIN.dark)
  if (near) win(b, sh.S, B.w / 2, B.wall + B.rise * 0.6, 0.34, 0.34, { cols: 2, rows: 2, barn: true })
  if (k % 3 === 0) {
    // a silo beside the barn
    b.cyl([B.w / 2 + 1.5, -1.2, -1.2], [B.w / 2 + 1.5, 5.6, -1.2], 1.15, 1.15, 12, '#a8a295', FIN.concrete)
    b.lathe([B.w / 2 + 1.5, 5.6, -1.2], [[1.2, 0], [0.8, 0.5], [0, 0.75]], 12, '#8d908c', FIN.metal)
  }
  b.pop()
  // a machine shed or a banked potato house, low, across the yard
  b.push(-side * (5.5 + hash2(k, 9)), 0, -H.l / 2 - 6 - 2 * hash2(k, 13), Math.PI / 2)
  if (k % 2) {
    shell(b, 3.4, 6.4, 1.5, 0.8, '#8a857a', FIN.boards, { skip: 'W' })
    roof(b, 3.4, 6.4, 1.5, 0.8, { color: '#9a9d99', fin: FIN.metal, rust: 0.3, eave: 0.2, rake: 0.16 })
  } else {
    shell(b, 4.6, 6.6, 1.0, 1.3, '#8a857a', FIN.shingle, { base: -1.2 })
    roof(b, 4.6, 6.6, 1.0, 1.3, { color: '#57544f', fin: FIN.shingle, eave: 0.2, rake: 0.2 })
    for (const sg of [-1, 1]) b.quad([sg * 5.0, -0.9, sg * 3.5], [sg * 5.0, -0.9, -sg * 3.5], [sg * 2.3, 1.0, -sg * 3.3], [sg * 2.3, 1.0, sg * 3.3], '#ffffff', FIN.turf)
  }
  b.pop()
}

export function country(b: Builder): void {
  useFrame(TRUE)
  const from0 = { x: K * 20, z: 0 }
  FARMSTEADS.forEach(([x, z, ry], k) => neighbour(b, x / S, z / S, ry, k, Math.hypot(x - from0.x, z - from0.z) < 1300))
  landmarks(b)
}

// Things of known size on the horizon: a village on the road over the hill with its white church, seen through the
// saddle behind the farm; and down the town road a water tower and the long sheds by the siding.
function landmarks(b: Builder): void {
  const house = (x: number, z: number, ry: number, k: number) => {
    const y = groundY(x, z) + 0.1
    b.at(x, y, z, ry, y)
    foundation(b, 3.2, 4.2, 1.2)
    shell(b, 3.2, 4.2, 2.2, 1.2, ['#e2dccd', '#cdbf9f', '#b9c2c0', '#d8c9b8'][k % 4], FIN.clapboard)
    roof(b, 3.2, 4.2, 2.2, 1.2, { color: k % 2 ? '#4a4c50' : '#5d4a40', fin: FIN.shingle, eave: 0.16, rake: 0.14 })
  }
  // the village
  const vx = VILLAGE.x / S, vz = VILLAGE.z / S
  {
    const cx = vx + 6, cz = vz - 12, y = Math.max(groundY(cx, cz), groundY(cx, cz + 5)) + 0.2
    b.at(cx, y, cz, 0, y)
    // the church: a white nave, its gable to the road, a square tower and a spire thirty metres to the vane
    foundation(b, 4.6, 8.4, 1.6)
    const sh = shell(b, 4.6, 8.4, 2.9, 2.3, '#ece7da', FIN.clapboard)
    roof(b, 4.6, 8.4, 2.9, 2.3, { color: '#3f4144', fin: FIN.shingle, eave: 0.2, rake: 0.2, trim: TRIM })
    for (const f of [sh.W, sh.E]) for (const s of [1.4, 3.2, 5.0, 6.8]) win(b, f, s, 1.5, 0.42, 1.5, { cols: 2, rows: 5, plain: true, seed: 0.3 })
    b.box(0, 3.6, 4.2 + 1.0, 2.2, 7.2, 2.2, '#ece7da', FIN.clapboard, { skip: 'b' })
    b.box(0, 7.3, 5.2, 2.5, 0.16, 2.5, TRIM, FIN.plain)
    b.box(0, 8.0, 5.2, 1.8, 1.3, 1.8, '#ece7da', FIN.clapboard, { skip: 'b' })
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.box(nx * 0.9, 8.0, 5.2 + nz * 0.9, nz ? 0.7 : 0.02, 0.9, nx ? 0.7 : 0.02, '#2f2c28', FIN.dark)
    b.box(0, 8.72, 5.2, 2.1, 0.14, 2.1, TRIM, FIN.plain)
    const ap: V3 = [0, 13.6, 5.2], e = 0.95, ye = 8.8
    for (const [ax, az, cx2, cz2] of [[-e, e, e, e], [e, e, e, -e], [e, -e, -e, -e], [-e, -e, -e, e]]) b.tri([ax, ye, 5.2 + az], [cx2, ye, 5.2 + cz2], ap, '#4a5257', FIN.metal, { ex: 0.9 })
    door(b, { o: [-1.1, 0, 6.3], r: [1, 0, 0], n: [0, 0, 1], len: 2.2, h: 3 }, 1.1, 0.02, 0.8, 1.2, '#5a3a2c', { kind: 'panel' })
  }
  for (let k = 0; k < 9; k++) {
    const along = (k - 4) * 9.5 + (hash2(k, 3) - 0.5) * 3, side = k % 2 ? -1 : 1
    const x = vx + along, z = hillRoadTrue((vx + along) * S) / S + side * (7 + 3 * hash2(k, 5))
    if (Math.abs(along - 6) < 5 && side < 0) continue
    house(x, z, side > 0 ? Math.PI : 0, k)
  }
  // the siding: a water tower, and the long potato houses beside the track
  const tx = SIDING.x / S, tz = SIDING.z / S
  {
    const y = groundY(tx, tz)
    b.at(tx, y, tz, 0.3, y)
    for (const [lx, lz] of [[-1.7, -1.7], [1.7, -1.7], [1.7, 1.7], [-1.7, 1.7]]) {
      b.beam([lx * 1.25, -0.5, lz * 1.25], [lx, 10.2, lz], 0.16, 0.16, '#6f7376', FIN.metal, { ex: 0.9 })
    }
    for (const yy of [3.2, 6.8]) for (let q = 0; q < 4; q++) {
      const a = [[-1, -1], [1, -1], [1, 1], [-1, 1]][q], c = [[-1, -1], [1, -1], [1, 1], [-1, 1]][(q + 1) % 4]
      const r = 1.7 * (1.25 - 0.25 * (yy + 0.5) / 10.7)
      b.beam([a[0] * r, yy, a[1] * r], [c[0] * r, yy, c[1] * r], 0.08, 0.08, '#6f7376', FIN.metal, { skip: 'lr' })
    }
    b.cyl([0, 0, 0], [0, 10.4, 0], 0.3, 0.3, 8, '#6f7376', FIN.metal)
    b.lathe([0, 9.6, 0], [[0.3, 0], [2.3, 0.9], [2.6, 1.4], [2.6, 3.9], [2.3, 4.3], [0.3, 5.0], [0, 5.1]], 14, '#aeb6b8', FIN.metal, { ex: 0.9 })
  }
  for (let k = 0; k < 3; k++) {
    const x = tx + 14 + k * 13, z = tz + 6, y = Math.max(groundY(x, z - 4), groundY(x, z + 4)) + 0.2
    b.at(x, y, z, Math.PI / 2, y)
    foundation(b, 5.6, 11, 1.4, '#aaa497', FIN.concrete)
    shell(b, 5.6, 11, 2.0, 1.9, k === 1 ? '#8a857a' : '#84301f', FIN.boards)
    roof(b, 5.6, 11, 2.0, 1.9, { color: '#8d908c', fin: FIN.metal, rust: 0.3 + 0.2 * k, eave: 0.2, rake: 0.2 })
  }
  for (let k = 0; k < 7; k++) {
    const x = tx - 30 + k * 8 + (hash2(k, 9) - 0.5) * 2, z = townRoadTrue(x * S) / S + (k % 2 ? 8 : -8)
    house(x, z, k % 2 ? Math.PI : 0, k + 3)
  }
}

// Poles and their wire: along the town road and the road over the hill, up the farm's road to the house, and up the
// Dufour drive.
export function poles(b: Builder): void {
  useFrame(TRUE)
  b.at(0, 0, 0, 0, 0)
  const T = M.pole, gap = 50 / S
  const pole = (p: V3, arm: boolean, k: number) => {
    const lean = (hash2(k, 71) - 0.5) * 0.16
    b.cyl([p[0], p[1] - 0.2, p[2]], [p[0] + lean, p[1] + T, p[2] + lean * 0.5], 0.065, 0.045, 6, '#5a4a3c', FIN.wood, { tint: 0.8 + 0.4 * hash2(k, 73), ex: 0.95 })
    if (arm) {
      b.box(p[0] + lean, p[1] + T - 0.25, p[2] + lean * 0.5, 0.06, 0.06, 0.8, '#5a4a3c', FIN.wood)
      for (const sg of [-1, 1]) b.cyl([p[0] + lean, p[1] + T - 0.22, p[2] + sg * 0.34], [p[0] + lean, p[1] + T - 0.14, p[2] + sg * 0.34], 0.02, 0.016, 5, '#8fa39a', FIN.plain)
    }
  }
  const wire = (a: V3, c: V3, sag: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const p = (t: number): V3 => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * Math.sin(t * Math.PI), a[2] + (c[2] - a[2]) * t]
      b.beam(p(k / n), p((k + 1) / n), 0.014, 0.014, '#1f1f1d', FIN.plain, { skip: 'lr' })
    }
  }
  // the town road: the whole length of it that is drawn; the wire hangs in more pieces near the farm
  const end = ROAD[ROAD.length - 1], beside = (WIDE.town / 2 + 2.8) / S
  let prev: V3 | null = null
  for (let k = -44, x = end[0] / S - 44 * gap; k <= 56; k++, x += gap) {
    const z = townRoadZ(x) + beside
    const p: V3 = [x, groundY(x, z), z]
    pole(p, true, k + 200)
    if (prev) for (const sg of [-1, 1]) wire([prev[0], prev[1] + T - 0.14, prev[2] + sg * 0.34], [p[0], p[1] + T - 0.14, p[2] + sg * 0.34], 0.5, Math.abs(k) < 12 ? 6 : 3)
    prev = p
  }
  // the road over the hill, too far off for its wire to show
  for (let x = -1500 / S; x <= 2700 / S; x += gap * 1.2) {
    const z = hillRoadTrue(x * S) / S + beside
    pole([x, groundY(x, z), z], true, Math.round(x))
  }
  // up a road from the town road, on one side, to a last pole and a drop to the house
  const up = (road: [number, number][], until: number, side: number, last: { x: number; z: number }, to: { x: number; y: number; z: number }, seed: number) => {
    const e = road[road.length - 1]
    const line: V3[] = [[e[0] / S + 0.5 * gap, 0, townRoadZ(e[0] / S + 0.5 * gap) + beside]]
    let run = 0
    for (let k = road.length - 1; k > until; k--) {
      const [ax, az] = road[k], [cx, cz] = road[k - 1], len = Math.hypot(cx - ax, cz - az) / S
      for (let d = gap - run; d < len; d += gap) {
        const t = d / len, nx = -(cz - az) / (len * S), nz = (cx - ax) / (len * S)
        line.push([(ax + (cx - ax) * t) / S - nx * side * 1.9, 0, (az + (cz - az) * t) / S - nz * side * 1.9])
      }
      run = (run + len) % gap
    }
    line.push([last.x, 0, last.z])
    for (const p of line) p[1] = groundY(p[0], p[2])
    line.forEach((p, k) => {
      if (k === 0) return
      pole(p, false, k + seed)
      wire([line[k - 1][0], line[k - 1][1] + T - 0.14, line[k - 1][2]], [p[0], p[1] + T - 0.05, p[2]], 0.34, 5)
    })
    const l = line[line.length - 1]
    wire([l[0], l[1] + T - 0.05, l[2]], [to.x, to.y, to.z], 0.2, 4)
  }
  const gable = from(HOME, HOUSE.x + 0.325 - 0.4, HOUSE.z + 0.7 + M.house.l / 2 + 0.06), floor = from(HOME, HOUSE.x, HOUSE.z)
  up(ROAD, 5, -1, from(HOME, 20.4, HOUSE.z + 5.2), { ...gable, y: groundY(floor.x, floor.z) + M.house.wall + 0.5 }, 40)
  const dh = from(DUFOUR, 93.4, 8.6), dg = from(DUFOUR, 93.6, 2.4 + M.dufour.house.l / 2 + 0.06)
  up(DUFOUR_DRIVE, 2, -1, dh, { ...dg, y: groundY(dg.x, dg.z - 1) + M.dufour.house.wall + 0.6 }, 80)
}

// ---- Things that move, each a small mesh of its own: a weather vane, the station's cups, a truck for the town road.
export function vaneShape(b: Builder, s: number): void {
  b.at(0, 0, 0)
  b.beam([-0.3 * s, 0, 0], [0.34 * s, 0, 0], 0.012 * s, 0.012 * s, IRON, FIN.plain)
  b.tri([0.34 * s, -0.05 * s, 0], [0.46 * s, 0, 0], [0.34 * s, 0.05 * s, 0], '#b08a3c', FIN.plain)
  b.tri([0.34 * s, 0.05 * s, 0], [0.46 * s, 0, 0], [0.34 * s, -0.05 * s, 0], '#b08a3c', FIN.plain)
  b.quad([-0.34 * s, -0.09 * s, 0], [-0.14 * s, -0.03 * s, 0], [-0.14 * s, 0.03 * s, 0], [-0.34 * s, 0.09 * s, 0], '#b08a3c', FIN.plain)
  b.quad([-0.14 * s, -0.03 * s, 0], [-0.34 * s, -0.09 * s, 0], [-0.34 * s, 0.09 * s, 0], [-0.14 * s, 0.03 * s, 0], '#b08a3c', FIN.plain)
}

export function cupsShape(b: Builder): void {
  b.at(0, 0, 0)
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094, x = Math.cos(a) * 0.16, z = Math.sin(a) * 0.16
    b.beam([0, 0, 0], [x, 0, z], 0.01, 0.01, '#c2c5c1', FIN.plain)
    b.blob([x, 0, z], [0.04, 0.04, 0.04], k, '#2a2a27', FIN.plain, { detail: 0, rough: 0 })
  }
  b.cyl([0, -0.06, 0], [0, 0.02, 0], 0.012, 0.012, 5, '#c2c5c1', FIN.plain)
}

export function roadTruck(b: Builder): void {
  b.at(0, 0, 0)
  truck(b, '#6a3a2c')
  for (let k = 0; k < 6; k++) barrel(b, -1.1 + (k % 3) * 0.3, 0.52, -0.16 + Math.floor(k / 3) * 0.3, 1, 0.9 + 0.05 * k)
}

export function passingCar(b: Builder): void {
  b.at(0, 0, 0)
  car(b, '#3f4f45')
}
