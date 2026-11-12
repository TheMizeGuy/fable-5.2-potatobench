// What lies and stands about the yards: logs and field stone as the farm has them, the dooryard's furniture and the
// back yard's garden, washing and hens, machines parked where the farm keeps them, and out in the country the
// neighbours' places, the poles along the town road and the bars in the walls.
import { IRON, TRIM, barrel, chimney, door, foundation, leanRoof, level, roof, shell, stoneHeap, wheel, win } from './arch.ts'
import { FIN, type Builder, type V3 } from './builder.ts'
import { cordwood } from './farmstead.ts'
import { FARMSTEADS } from './flora.ts'
import { BAYS, DUFOUR_BARN, HOUSE, IMPLEMENT_SPOTS, LOG_DECKS, SITES, STONE_PILE, TRUCK_SPOT, groundY, townRoadZ, type Spot } from './layout.ts'
import { hash2 } from './noise.ts'

const BARK = '#5f4d3d', CUT = '#d0ae78'

// ---- What comes off the land: logs decked, one for each load, and a heap of field stone that grows with the loads.
export const DECK_HOLDS = 21
export function materials(b: Builder, logs: number, stone: number): void {
  let left = Math.min(Math.round(logs), DECK_HOLDS * LOG_DECKS.length)
  LOG_DECKS.forEach((d, n) => {
    const here = Math.min(left, DECK_HOLDS)
    left -= here
    if (here <= 0 && n > 0) return
    const y = level(d.x, d.z, 1.6, 2.4).top
    b.at(d.x, y, d.z, d.heading, y)
    // skids under the deck, stakes at its sides
    for (const z of [-0.75, 0.75]) b.box(0, 0.05, z, 1.9, 0.1, 0.12, '#6d5b48', FIN.wood)
    if (here > 0) for (const x of [-0.86, 0.86]) for (const z of [-0.75, 0.75]) b.box(x, 0.45, z, 0.06, 0.8, 0.06, '#7d6a52', FIN.wood)
    let k = 0
    for (let row = 0; row < 6 && k < here; row++) {
      const inRow = 6 - row
      for (let i = 0; i < inRow && k < here; i++, k++) {
        const j = hash2(k + n * 37, 5), r = 0.118 + 0.022 * j
        const x = (i - (inRow - 1) / 2) * 0.262 + (hash2(k, 9) - 0.5) * 0.02, yy = 0.1 + 0.125 + row * 0.215
        const half = 1.14 + 0.14 * hash2(k, 3), off = (hash2(k, 7) - 0.5) * 0.16
        b.cyl([x, yy, off - half], [x, yy, off + half], r, r * (0.86 + 0.1 * j), 8, BARK, FIN.wood, { cap: 'ab', capColor: CUT, capFin: FIN.endgrain, tint: 0.8 + 0.4 * j, uo: k })
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

// ---- Stand-ins for the farm's machines at rest, until the real ones are parked here. Each faces +x.
function tractor(b: Builder, body: string, rim: string): void {
  b.box(0.22, 0.44, 0, 1.0, 0.18, 0.24, '#5c5d5a', FIN.plain)
  b.box(0.3, 0.67, 0, 0.82, 0.26, 0.32, body, FIN.plain)
  b.box(0.74, 0.6, 0, 0.08, 0.38, 0.31, body, FIN.plain)
  b.box(0.79, 0.58, 0, 0.02, 0.28, 0.24, '#2a2a27', FIN.plain)
  b.box(-0.1, 0.74, 0, 0.26, 0.2, 0.3, body, FIN.plain)
  b.box(-0.47, 0.8, 0, 0.24, 0.05, 0.24, '#2a2a27', FIN.plain)
  b.box(-0.58, 0.9, 0, 0.03, 0.2, 0.2, '#2a2a27', FIN.plain)
  for (const z of [-0.36, 0.36]) {
    wheel(b, [-0.42, 0.37, z], [0, 0, 1], 0.37, 0.2, rim, 12)
    b.box(-0.42, 0.79, z, 0.62, 0.035, 0.24, body, FIN.plain)
    b.box(-0.74, 0.62, z, 0.035, 0.34, 0.24, body, FIN.plain)
    wheel(b, [0.62, 0.2, z * 0.86], [0, 0, 1], 0.2, 0.1, rim, 10)
  }
  b.cyl([0.42, 0.78, 0.09], [0.42, 1.24, 0.09], 0.026, 0.026, 6, '#2a2a27', FIN.plain)
  b.beam([-0.08, 0.76, 0], [-0.3, 1.0, 0], 0.024, 0.024, '#2a2a27', FIN.plain)
  b.cyl([-0.3, 0.98, -0.1], [-0.3, 1.0, 0.1], 0.03, 0.03, 6, '#2a2a27', FIN.plain)
}

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

function sprayer(b: Builder): void {
  b.box(0, 0.34, 0, 1.0, 0.06, 0.5, '#5c5d5a', FIN.plain)
  b.cyl([0, 0.62, -0.38], [0, 0.62, 0.38], 0.24, 0.24, 12, '#e3dfd2', FIN.plain, { cap: 'ab' })
  for (const sg of [-1, 1]) {
    wheel(b, [-0.1, 0.2, sg * 0.44], [0, 0, 1], 0.2, 0.09, '#8b8d88', 10)
    // the boom folded up each side
    b.beam([-0.42, 0.5, sg * 0.3], [-0.5, 1.75, sg * 0.36], 0.04, 0.04, '#8b8d88', FIN.metal)
    b.beam([-0.5, 1.75, sg * 0.36], [-0.44, 0.95, sg * 0.52], 0.03, 0.03, '#8b8d88', FIN.metal)
  }
  b.box(-0.42, 0.5, 0, 0.05, 0.05, 0.9, '#8b8d88', FIN.metal)
  b.beam([0.5, 0.34, 0], [1.1, 0.3, 0], 0.05, 0.05, '#5c5d5a', FIN.plain)
}

function harvester(b: Builder): void {
  const red = '#a43a27'
  b.box(0, 0.42, 0, 2.0, 0.08, 0.9, '#5c5d5a', FIN.plain)
  for (const sg of [-1, 1]) {
    wheel(b, [-0.3, 0.26, sg * 0.56], [0, 0, 1], 0.26, 0.14, red, 10)
    b.box(0, 0.66, sg * 0.46, 1.9, 0.42, 0.04, red, FIN.plain)
  }
  // the lifting web up from the share, the picking table, the boom that carries the crop over to the truck
  b.beam([1.2, 0.2, 0], [0.2, 0.95, 0], 0.84, 0.05, '#77797a', FIN.metal, { ex: 0.9 })
  b.box(-0.45, 0.92, 0, 1.0, 0.05, 0.86, '#77797a', FIN.metal, { ex: 0.9 })
  b.beam([-0.9, 0.9, 0], [-1.2, 1.7, 0.9], 0.34, 0.06, red, FIN.plain)
  b.box(1.26, 0.14, 0, 0.14, 0.03, 0.84, '#8b8d88', FIN.metal)
  for (const x of [-0.9, 0.0]) for (const sg of [-1, 1]) b.box(x, 1.12, sg * 0.44, 0.04, 0.5, 0.04, red, FIN.plain)
  b.box(-0.45, 1.36, 0, 1.0, 0.03, 0.94, '#c9c2ae', FIN.cloth)
  b.beam([1.0, 0.42, 0], [1.9, 0.34, 0], 0.06, 0.06, '#5c5d5a', FIN.plain)
}

function reel(b: Builder): void {
  b.box(0, 0.3, 0, 1.3, 0.06, 0.6, '#5c5d5a', FIN.plain)
  for (const sg of [-1, 1]) {
    wheel(b, [-0.1, 0.2, sg * 0.42], [0, 0, 1], 0.2, 0.09, '#b7791f', 10)
    b.cyl([0, 0.85, sg * 0.27], [0, 0.85, sg * 0.3], 0.56, 0.56, 14, '#b7791f', FIN.plain, { cap: 'ab' })
    b.beam([-0.3, 0.3, sg * 0.3], [0, 0.85, sg * 0.3], 0.04, 0.05, '#5c5d5a', FIN.plain)
    b.beam([0.3, 0.3, sg * 0.3], [0, 0.85, sg * 0.3], 0.04, 0.05, '#5c5d5a', FIN.plain)
  }
  b.cyl([0, 0.85, -0.27], [0, 0.85, 0.27], 0.42, 0.42, 14, '#22221f', FIN.plain, { ex: 0.9 })
  // the gun on its little cart, hitched behind
  b.box(-1.0, 0.22, 0, 0.5, 0.04, 0.5, '#5c5d5a', FIN.plain)
  for (const sg of [-1, 1]) wheel(b, [-1.0, 0.12, sg * 0.28], [0, 0, 1], 0.12, 0.05, '#b7791f', 8)
  b.beam([-1.0, 0.24, 0], [-1.25, 0.7, 0], 0.035, 0.035, '#8b8d88', FIN.metal)
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

export interface MachineLook { tractors: number; truck: boolean; sprayer: boolean; harvester: boolean; reel: boolean; shed: boolean; car: boolean }

const PAINTS: [string, string][] = [['#8e918b', '#9b3a26'], ['#3f6a4c', '#d8c38a']]

// Machines the farm owns and is not using today, parked where it keeps them: tractors and the truck in the machine
// shed's bays, the sprayer, the harvester and the reel in the grass at its end; a customer's car at the stand.
export function machines(b: Builder, m: MachineLook): void {
  const put = (s: Spot, draw: () => void, y = groundY(s.x, s.z) + 0.02) => {
    b.at(s.x, y, s.z, -s.heading, y)
    draw()
  }
  // a second and a third tractor are only ever owned once the shed stands
  const shed = SITES.find(s => s.kind === 'shed' && s.yard === -1)!
  const floor = level(shed.x, shed.z, shed.w, shed.d).top + 0.05
  if (m.shed) for (let k = 0; k < Math.min(2, m.tractors); k++) put(BAYS[k], () => tractor(b, ...PAINTS[k]), floor)
  if (m.truck) {
    if (m.shed) put({ ...BAYS[2], z: BAYS[2].z - 0.25 }, () => truck(b, '#3d5a6e'), floor)
    else put(TRUCK_SPOT, () => truck(b, '#3d5a6e'))
  }
  if (m.harvester) put(IMPLEMENT_SPOTS.harvester, () => harvester(b))
  if (m.sprayer) put(IMPLEMENT_SPOTS.sprayer, () => sprayer(b))
  if (m.reel) put(IMPLEMENT_SPOTS.reel, () => reel(b))
  if (m.car) {
    const s = SITES.find(q => q.kind === 'stand' && q.yard === -1)!
    put({ x: s.x - 1.9, z: s.z + 0.5, heading: 0.12 - Math.PI / 2 }, () => car(b, '#7d9aa8'))
  }
}

// ---- The life of the yards, home and Dufour: fixed things, made once.
function picket(b: Builder, x0: number, z0: number, x1: number, z1: number, gate = -1): void {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.105)
  const dx = (x1 - x0) / len, dz = (z1 - z0) / len
  b.at(0, 0, 0, 0, groundY(x0, z0))
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * len, x = x0 + dx * d, z = z0 + dz * d, y = groundY(x, z)
    if (gate >= 0 && Math.abs(d - gate) < 0.3) continue
    b.box(x, y + 0.25, z, 0.05, 0.42, 0.016, TRIM, FIN.plain, { ry: Math.atan2(-dz, dx), skip: 'b', tint: 0.92 + 0.14 * hash2(k, 3) })
    if (k % 9 === 0 || (gate >= 0 && Math.abs(Math.abs(d - gate) - 0.36) < 0.06)) b.box(x, y + 0.3, z, 0.07, 0.6, 0.07, TRIM, FIN.plain, { skip: 'b' })
  }
  for (const h of [0.14, 0.36]) {
    const segs = Math.ceil(len / 1.2)
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * len, c = ((k + 1) / segs) * len
      if (gate >= 0 && a < gate + 0.3 && c > gate - 0.3) continue
      b.beam([x0 + dx * a, groundY(x0 + dx * a, z0 + dz * a) + h, z0 + dz * a], [x0 + dx * c, groundY(x0 + dx * c, z0 + dz * c) + h, z0 + dz * c], 0.02, 0.045, TRIM, FIN.plain)
    }
  }
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

function appleTree(b: Builder, x: number, z: number, s: number, seed: number): void {
  const y = groundY(x, z)
  b.at(x, y, z, seed * 1.7, y)
  b.cyl([0, -0.05, 0], [0.05 * s, 0.5 * s, 0.02 * s], 0.075 * s, 0.055 * s, 6, '#4f4338', FIN.wood)
  const limbs: V3[] = []
  for (let k = 0; k < 4; k++) {
    const a = k * 1.571 + hash2(seed, k) * 1.2, r = (0.38 + 0.2 * hash2(seed + 3, k)) * s
    const tip: V3 = [0.05 * s + Math.cos(a) * r, (0.82 + 0.22 * hash2(seed + 5, k)) * s, 0.02 * s + Math.sin(a) * r]
    b.cyl([0.05 * s, 0.48 * s, 0.02 * s], tip, 0.04 * s, 0.018 * s, 5, '#4f4338', FIN.wood)
    limbs.push(tip)
  }
  limbs.push([0.05 * s, 1.02 * s, 0.02 * s])
  // The crown: a dark heart at each limb's end and sprays of leaf standing out all round it, lit together as one low
  // spreading head, so it has a sunny side and a shaded one and a ragged outline.
  const heart: V3 = [0.05 * s, 0.6 * s, 0.02 * s]
  const greens = ['#3f5f33', '#4a6b38', '#587a40', '#4f7436']
  let n = seed * 977
  const rnd = () => hash2(n++, seed + 5)
  limbs.forEach((p, k) => {
    for (let q = 0; q < 4; q++) {
      const a = rnd() * 6.283, d = (q === 0 ? 0 : 0.2 + 0.16 * rnd()) * s
      const r = (0.2 + 0.08 * rnd()) * s
      const c: V3 = [p[0] + Math.cos(a) * d, p[1] + (0.08 - 0.14 * rnd()) * s, p[2] + Math.sin(a) * d]
      b.blob(c, [r * 0.66, r * 0.5, r * 0.66], seed * 7 + k * 5 + q, '#2c4426', FIN.leaf, { detail: 0, rough: 0.2, round: heart, tint: 0.7 })
      for (let j = 0; j < 26; j++) {
        const u = rnd() * 2 - 1, t = rnd() * 6.283, w = Math.sqrt(1 - u * u), out = 0.55 + 0.5 * rnd()
        const o: V3 = [w * Math.cos(t), u * 0.8 + 0.15, w * Math.sin(t)]
        const at: V3 = [c[0] + o[0] * r * out, c[1] + o[1] * r * out * 0.8, c[2] + o[2] * r * out]
        const size = (0.075 + 0.05 * rnd()) * s
        // across the way out, tipped a little at random
        const rx = rnd() - 0.5, ry = rnd() - 0.5, rz = rnd() - 0.5
        let ux = o[1] * rz - o[2] * ry, uy = o[2] * rx - o[0] * rz, uz = o[0] * ry - o[1] * rx
        const ul = Math.hypot(ux, uy, uz) || 1
        ux /= ul; uy /= ul; uz /= ul
        const vx = o[1] * uz - o[2] * uy + o[0] * 0.3, vy = o[2] * ux - o[0] * uz + o[1] * 0.3 - 0.25, vz = o[0] * uy - o[1] * ux + o[2] * 0.3
        const nrm: V3 = [at[0] - heart[0], (at[1] - heart[1]) * 1.2 + 0.25 * s, at[2] - heart[2]]
        b.card(at, [ux * size, uy * size, uz * size], [vx * size * 0.75, vy * size * 0.75, vz * size * 0.75], nrm, greens[(j + k) % 4], FIN.leaf, 1, 0.72 + 0.4 * out * rnd() + 0.12 * o[1])
      }
    }
  })
  // apples among the outer leaves
  for (let k = 0; k < 12; k++) {
    const a = rnd() * 6.283, d = (0.4 + 0.26 * rnd()) * s
    b.blob([0.05 * s + Math.cos(a) * d, (0.68 + 0.26 * rnd()) * s, 0.02 * s + Math.sin(a) * d], [0.026 * s, 0.026 * s, 0.026 * s], k, '#9c3328', FIN.leaf, { detail: 0, rough: 0.1, ex: 0.9 })
  }
}

// A length of split-rail or post-and-wire fence.
function posts(b: Builder, x0: number, z0: number, x1: number, z1: number, every: number, wire: boolean): void {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / every))
  let prev: V3 | null = null
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n + (hash2(k, 31) - 0.5) * 0.06, z = z0 + ((z1 - z0) * k) / n + (hash2(k, 37) - 0.5) * 0.06, y = groundY(x, z)
    const lean = (hash2(k, 41) - 0.5) * 0.08
    b.at(0, 0, 0, 0, y)
    b.cyl([x, y - 0.05, z], [x + lean, y + 0.5 + 0.08 * hash2(k, 43), z + lean * 0.6], 0.035, 0.028, 5, '#77695a', FIN.wood, { tint: 0.8 + 0.4 * hash2(k, 47) })
    const here: V3 = [x + lean * 0.7, y, z + lean * 0.4]
    if (prev && wire) for (const h of [0.2, 0.38]) b.beam([prev[0], prev[1] + h, prev[2]], [here[0], here[1] + h, here[2]], 0.008, 0.008, '#4a4640', FIN.plain)
    if (prev && !wire) for (const h of [0.18, 0.38]) b.beam([prev[0], prev[1] + h + 0.03, prev[2]], [here[0], here[1] + h - 0.02, here[2]], 0.035, 0.045, '#8a7d6b', FIN.wood)
    prev = here
  }
}

export function yardLife(b: Builder): void {
  const hx = HOUSE.x, hz = HOUSE.z
  // The front of the big house: a picket fence with its gate, flowers under the windows.
  picket(b, 19.35, 4.5, 19.35, 6.6)
  picket(b, 19.35, 6.6, 25.4, 6.6, 4.25)
  b.at(0, 0, 0, 0, groundY(21, 5))
  // a bed under the windows: low mounds of leaf, hollyhocks standing against the clapboards, small bloom all through
  for (let k = 0; k < 12; k++) {
    const z = hz - 1.62 + k * 0.29, x = hx - 1.74 - 0.06 * hash2(k, 5), y = groundY(x, z)
    const r = 0.13 + 0.05 * hash2(k, 7)
    b.blob([x, y + r * 0.5, z], [r, r * 0.8, r * 1.25], k, k % 3 ? '#3f6b35' : '#4f7a3c', FIN.leaf, { detail: 1, rough: 0.4, ex: 0 })
    for (let q = 0; q < 5; q++) {
      const a = hash2(k * 7 + q, 3) * 6.283, d = r * 0.8 * hash2(k * 7 + q, 9)
      b.blob([x - 0.03 + Math.cos(a) * d, y + r * (0.95 - 0.3 * d / r), z + Math.sin(a) * d * 1.2], [0.022, 0.018, 0.022], q, ['#c9567a', '#e3c44a', '#e9e2d6', '#b65fb0'][(k + q) % 4], FIN.plain, { detail: 0, rough: 0.2 })
    }
    if (k % 3 === 1) {
      const sx = hx - 1.6, hgt = 0.5 + 0.22 * hash2(k, 13)
      b.cyl([sx, y, z + 0.1], [sx - 0.02, y + hgt, z + 0.1], 0.008, 0.006, 4, '#4f7a3c', FIN.plain)
      for (let q = 0; q < 5; q++) b.blob([sx - 0.02, y + hgt * (0.45 + 0.13 * q), z + 0.1 + (q % 2 ? 0.02 : -0.02)], [0.028, 0.026, 0.028], q + k, k % 2 ? '#c9567a' : '#e6dccb', FIN.plain, { detail: 0, rough: 0.2 })
    }
  }
  // The well by the kitchen porch: a plank cover and an iron pump, a pail under its spout.
  {
    const x = 21.25, z = hz - 5.0, y = groundY(x, z)
    b.at(x, y, z, 0.3, y)
    b.box(0, 0.05, 0, 0.6, 0.1, 0.6, '#8a7d6b', FIN.boards)
    b.cyl([0, 0.1, 0], [0, 0.52, 0], 0.04, 0.035, 7, '#3d5a48', FIN.plain)
    b.cyl([0, 0.52, 0], [0, 0.6, 0], 0.05, 0.03, 7, '#3d5a48', FIN.plain, { cap: 'b' })
    b.beam([0, 0.56, 0], [-0.26, 0.44, 0], 0.02, 0.03, '#3d5a48', FIN.plain)
    b.beam([0, 0.42, 0], [0.12, 0.38, 0], 0.03, 0.03, '#3d5a48', FIN.plain)
    b.lathe([0.17, 0.1, 0], [[0.05, 0], [0.065, 0.11]], 7, '#b9bcb8', FIN.metal)
  }
  // Milk cans by the back house door, a grindstone, a wheelbarrow.
  {
    const y = groundY(22.2, hz - 4.75)
    b.at(22.25, y, hz - 4.75, 0, y)
    for (const [x, z] of [[0, 0], [0.16, 0.1]]) b.lathe([x, 0, z], [[0.07, 0], [0.075, 0.2], [0.045, 0.27], [0.05, 0.3]], 8, '#aab0ae', FIN.metal)
    b.at(21.6, groundY(21.6, hz - 7.6), hz - 7.55, 0.4, groundY(21.6, hz - 7.6))
    b.cyl([0, 0.3, -0.03], [0, 0.3, 0.03], 0.16, 0.16, 12, '#a39c8e', FIN.concrete, { cap: 'ab' })
    for (const sg of [-1, 1]) { b.beam([sg * 0.16, 0, -0.1], [0, 0.3, -0.06], 0.03, 0.03, '#6d5b48', FIN.wood); b.beam([sg * 0.16, 0, 0.1], [0, 0.3, 0.06], 0.03, 0.03, '#6d5b48', FIN.wood) }
  }
  // The back yard. A kitchen garden behind the ell: rows of greens, bean poles, a low fence, a scarecrow.
  {
    const gx0 = 25.7, gx1 = 27.8, gz0 = hz - 4.1, gz1 = hz - 1.5
    b.at(0, 0, 0, 0, groundY(26.7, hz - 2.8))
    const rows = 6
    for (let r = 0; r < rows; r++) {
      const z = gz0 + 0.25 + (r * (gz1 - gz0 - 0.5)) / (rows - 1)
      const ya = groundY(gx0 + 0.15, z), yb = groundY(gx1 - 0.15, z)
      b.beam([gx0 + 0.15, ya + 0.02, z], [gx1 - 0.15, yb + 0.02, z], 0.26, 0.07, '#5d4333', FIN.earth)
      for (let k = 0; k < 9; k++) {
        const x = gx0 + 0.3 + k * 0.2 + (hash2(k, r) - 0.5) * 0.04, y = groundY(x, z) + 0.06
        if (r === 1) {
          // beans on poles
          if (k % 2) continue
          b.cyl([x, y, z], [x, y + 0.62, z], 0.012, 0.01, 4, '#8a7458', FIN.wood)
          b.blob([x, y + 0.3, z], [0.07, 0.26, 0.07], k * 3 + r, '#4d7d3a', FIN.leaf, { detail: 0, rough: 0.4 })
        } else {
          const kind = r % 3, s = 0.06 + 0.035 * hash2(k + 11, r)
          b.blob([x, y + s * (kind === 0 ? 0.7 : 1.1), z], [s * 1.3, s * (kind === 0 ? 0.8 : 1.4), s * 1.3], k * 7 + r * 13, ['#5c8f55', '#3f7a3c', '#7a9c4c'][kind], FIN.leaf, { detail: 0, rough: 0.5 })
        }
      }
    }
    posts(b, gx0, gz0, gx1, gz0, 0.7, true); posts(b, gx1, gz0, gx1, gz1, 0.65, true); posts(b, gx1, gz1, gx0, gz1, 0.7, true); posts(b, gx0, gz1, gx0, gz0, 0.65, true)
    // the scarecrow in his old coat
    const sx = gx1 - 0.5, sz = gz0 + 1.3, sy = groundY(sx, sz)
    b.at(sx, sy, sz, 0.6, sy)
    b.box(0, 0.4, 0, 0.03, 0.8, 0.03, '#77695a', FIN.wood)
    b.box(0, 0.6, 0, 0.52, 0.03, 0.03, '#77695a', FIN.wood)
    b.box(0, 0.5, 0, 0.2, 0.28, 0.07, '#4a5f7a', FIN.cloth, { flex: [0.06, 0] })
    for (const sg of [-1, 1]) b.box(sg * 0.19, 0.57, 0, 0.18, 0.08, 0.06, '#4a5f7a', FIN.cloth, { flex: 0.03 })
    b.blob([0, 0.74, 0], [0.06, 0.07, 0.06], 4, '#c9b27a', FIN.cloth, { detail: 0, rough: 0.1 })
    b.lathe([0, 0.79, 0], [[0.12, 0], [0.06, 0.01], [0.05, 0.06], [0, 0.07]], 8, '#6b5a3c', FIN.cloth)
  }
  // The clothesline between two posts, the week's wash on it.
  {
    const x0 = 25.6, x1 = 28.3, z = hz + 1.1
    const y0 = groundY(x0, z), y1 = groundY(x1, z)
    b.at(0, 0, 0, 0, y0)
    for (const [x, y] of [[x0, y0], [x1, y1]]) { b.box(x, y + 0.5, z, 0.05, 1.05, 0.05, '#8a7d6b', FIN.wood); b.box(x, y + 1.0, z, 0.05, 0.04, 0.5, '#8a7d6b', FIN.wood) }
    const things: [number, number, number, string][] = [
      [0.1, 0.46, 0.42, '#e8e4da'], [0.62, 0.26, 0.3, '#5f7ea3'], [0.94, 0.5, 0.48, '#e3ddd0'], [1.5, 0.22, 0.34, '#b5503e'], [1.78, 0.2, 0.26, '#e8e4da'], [2.04, 0.34, 0.36, '#8a9a6a'], [2.42, 0.18, 0.2, '#d8cfa8'],
    ]
    for (const lz of [-0.2, 0.2]) {
      const line = (t: number): V3 => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 1.0 - 0.09 * Math.sin(t * Math.PI), z + lz]
      for (let k = 0; k < 8; k++) b.beam(line(k / 8), line((k + 1) / 8), 0.008, 0.008, '#d8d2c2', FIN.plain)
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
    const cx = 26.6, cz = hz - 5.35
    const g = level(cx, cz, 1.0, 0.8)
    b.at(cx, g.top + 0.12, cz, 0, g.top)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.42, -0.1, sz * 0.32, 0.06, 0.34, 0.06, '#77695a', FIN.wood)
    b.box(0, 0.3, 0, 1.0, 0.6, 0.78, '#8f3626', FIN.boards, { skip: 'b' })
    leanRoof(b, -0.5, 0.5, -0.4, 0.4, 0.74, 0.58, '#8d908c', FIN.metal, { rust: 0.5, over: 0.08 })
    b.box(0.2, 0.2, 0.395, 0.2, 0.26, 0.012, '#17130f', FIN.dark)
    b.beam([0.2, 0.06, 0.4], [0.2, -0.26, 0.9], 0.18, 0.02, '#8a7d6b', FIN.wood)
    win(b, { o: [-0.5, 0, 0.39], r: [1, 0, 0], n: [0, 0, 1], len: 1, h: 0.6 }, 0.3, 0.38, 0.22, 0.16, { cols: 2, rows: 1, barn: true })
    const hens: [number, number, number, string, boolean][] = [
      [26.3, cz + 1.0, 0.4, '#d8d2c2', true], [27.0, cz + 0.85, 2.2, '#a0522d', false], [27.4, cz + 1.3, 4.1, '#d8d2c2', true], [26.0, cz + 0.5, 5.3, '#3a3632', false],
      [27.5, cz + 0.4, 1.2, '#a0522d', true], [26.75, cz + 1.5, 3.3, '#b88a4c', true], [25.75, cz + 1.4, 0.1, '#a0522d', false],
    ]
    for (const [x, z, ry, color, peck] of hens) hen(b, x, z, ry, color, peck)
  }
  // Fuel: a red tank on its stand by the barn's corner; a wagon and the stone boat by the lane.
  {
    const x = 26.95, z = -10.85, y = groundY(x, z)
    b.at(x, y, z, 0, y)
    for (const sx of [-0.3, 0.3]) for (const sz of [-1, 1]) b.beam([sx, 0, sz * 0.26], [sx, 0.62, sz * 0.14], 0.035, 0.035, '#5c5d5a', FIN.plain)
    b.cyl([-0.45, 0.82, 0], [0.45, 0.82, 0], 0.22, 0.22, 12, '#9c2f22', FIN.metal, { cap: 'ab', ex: 0.92 })
    b.cyl([0.3, 0.6, 0.16], [0.36, 0.2, 0.3], 0.014, 0.014, 4, '#1f1f1d', FIN.plain)
    const wx = 39.3, wz = -2.3
    b.at(wx, groundY(wx, wz), wz, 0.15, groundY(wx, wz))
    wagon(b)
    const sbx = 22.0, sbz = -10.85
    b.at(sbx, groundY(sbx, sbz), sbz, 0.9, groundY(sbx, sbz))
    b.box(0, 0.05, 0, 1.0, 0.05, 0.6, '#77695a', FIN.boards)
    for (const sg of [-1, 1]) b.box(0, 0.03, sg * 0.28, 1.1, 0.07, 0.06, '#5f5345', FIN.wood)
    b.beam([0.5, 0.06, 0], [0.9, 0.06, 0], 0.012, 0.012, IRON, FIN.plain)
  }
  // The orchard: four old apple trees past the sheds, a tyre on a rope from the stoutest limb.
  appleTree(b, 38.8, 0.3, 1.9, 1); appleTree(b, 41.0, 0.6, 1.6, 2); appleTree(b, 38.6, 3.0, 1.7, 3); appleTree(b, 41.2, 3.3, 2.0, 4)
  {
    const x = 41.9, z = 3.6, y = groundY(x, z)
    b.at(x, y, z, 0.4, y)
    b.beam([-0.6, 1.72, -0.3], [0.1, 1.6, 0.05], 0.05, 0.05, '#4f4338', FIN.wood)
    b.cyl([0, 1.62, 0], [0, 0.62, 0], 0.01, 0.01, 4, '#b7a98a', FIN.plain)
    b.lathe([0, 0.42, 0], [[0.1, 0], [0.19, 0.04], [0.21, 0.09], [0.19, 0.14], [0.1, 0.18]], 10, '#1f1f1d', FIN.plain, {})
  }
  // The mailbox where the farm's road meets the town road.
  {
    const x = 22.3, z = townRoadZ(22.3) - 1.5, y = groundY(x, z)
    b.at(x, y, z, 0.2, y)
    b.box(0, 0.32, 0, 0.06, 0.64, 0.06, '#77695a', FIN.wood)
    b.box(0, 0.7, 0.04, 0.16, 0.14, 0.34, '#b9bcb8', FIN.metal)
    b.box(0.09, 0.76, 0.1, 0.012, 0.1, 0.05, '#b8402c', FIN.plain)
    // The culvert that carries the town road's ditch under the farm's road: a pipe's mouth in a stone headwall each side.
    const cz = townRoadZ(20.6) - 2.3
    for (const sg of [-1, 1]) {
      const cx = 20.55 + sg * 1.25, cy = groundY(cx, cz)
      b.at(cx, cy, cz, 0, cy)
      b.box(0, 0.08, 0, 0.3, 0.46, 1.1, '#8f8a80', FIN.stone, { skip: 'b' })
      b.cyl([sg * 0.16, 0.06, 0], [-sg * 0.3, 0.06, 0], 0.17, 0.17, 10, '#77736b', FIN.concrete, { cap: 'a', capColor: '#0d0c0b', capFin: FIN.dark })
      b.blob([sg * 0.5, -0.02, 0.1], [0.5, 0.06, 0.4], 3, '#6f6a5c', FIN.gravel, { detail: 1, rough: 0.2 })
    }
  }
  // Along the yard's east side, where the farm's ground meets the neighbour's pasture: cedar posts and wire.
  posts(b, 42.6, -7.2, 42.6, 6.4, 1.5, true)
  posts(b, 42.6, 6.4, 31.6, 6.6, 1.5, true)
  // The Dufour place: an old hay rake rusting behind the barn, barrels, a rail fence gone grey.
  {
    const x = DUFOUR_BARN.x + 3.2, z = DUFOUR_BARN.z + 1.6, y = groundY(x, z)
    b.at(x, y, z, 0.5, y)
    for (const sg of [-1, 1]) {
      b.cyl([0, 0.42, sg * 0.8], [0, 0.42, sg * 0.83], 0.42, 0.42, 14, '#6b3d2c', FIN.metal, { ex: 0.5, cap: 'ab' })
      b.cyl([0, 0.42, sg * 0.79], [0, 0.42, sg * 0.84], 0.36, 0.36, 14, '#17130f', FIN.dark, { cap: 'ab' })
    }
    b.cyl([0, 0.42, -0.8], [0, 0.42, 0.8], 0.025, 0.025, 5, '#6b3d2c', FIN.metal, { ex: 0.5 })
    for (let k = 0; k < 12; k++) b.beam([-0.05, 0.44, -0.72 + k * 0.13], [-0.4, 0.06, -0.72 + k * 0.13], 0.012, 0.012, '#6b3d2c', FIN.plain)
    b.box(0.1, 0.62, 0, 0.16, 0.03, 0.2, '#6b3d2c', FIN.metal, { ex: 0.5 })
    b.at(0, 0, 0, 0, y)
    posts(b, 86.2, 4.6, 92.4, 5.4, 1.5, false)
    cordwoodAt(b, 92.5, -3.9)
  }
}

function cordwoodAt(b: Builder, x: number, z: number): void {
  const y = groundY(x, z)
  b.at(x, y, z, 0.2, y)
  cordwood(b, 0, 0, 0, 1.2, 0.5)
  for (const sz of [-0.64, 0.64]) b.box(0, 0.3, sz, 0.05, 0.6, 0.05, '#77695a', FIN.wood)
}

// ---- The country: the neighbours' farmsteads, the poles along the town road and up the farm's own road, bars in the
// walls where the tracks go through.
function neighbour(b: Builder, x: number, z: number, ry: number, k: number): void {
  const y = Math.min(groundY(x, z), groundY(x + 2, z - 9), groundY(x - 2, z + 2)) + 0.2
  const paint = ['#e2dccd', '#d9d0b8', '#c9c3b2', '#e6dfc8'][k % 4], barnCol = k % 3 === 1 ? '#8a8378' : '#84301f', roofCol = k % 2 ? '#4a4c50' : '#5d5a56'
  b.at(x, y, z, ry, y)
  foundation(b, 3.0, 4.2, 1.0)
  let sh = shell(b, 3.0, 4.2, 2.1, 1.2, paint, FIN.clapboard)
  roof(b, 3.0, 4.2, 2.1, 1.2, { color: roofCol, fin: FIN.shingle, eave: 0.18, rake: 0.16, trim: TRIM })
  for (const f of [sh.W, sh.E]) for (const s of [0.9, 2.1, 3.3]) for (const yy of [0.8, 1.65]) win(b, f, s, yy, 0.34, 0.52, { cols: 2, rows: 2, plain: true, seed: hash2(k * 7 + Math.round(s * 10), Math.round(yy * 10)) })
  for (const s of [0.8, 2.2]) win(b, sh.S, s, 0.8, 0.34, 0.52, { cols: 2, rows: 2, plain: true, seed: 0.2 })
  door(b, sh.S, 1.5, 0.02, 0.44, 0.9, '#3c4a40', { kind: 'panel' })
  chimney(b, 0.3, 0.2, 2.8, 3.85, 0.4, 0.4)
  b.push(0.2, 0, -3.6)
  sh = shell(b, 2.4, 3.0, 1.5, 0.9, paint, FIN.clapboard)
  roof(b, 2.4, 3.0, 1.5, 0.9, { color: roofCol, fin: FIN.shingle, eave: 0.16, rake: 0.1, trim: TRIM })
  win(b, sh.W, 1.5, 0.8, 0.34, 0.5, { cols: 2, rows: 2, plain: true, seed: 0.05 })
  b.pop()
  b.push(0.6, 0, -9.3)
  foundation(b, 4.6, 6.4, 1.0)
  sh = shell(b, 4.6, 6.4, 2.6, 2.0, barnCol, FIN.boards)
  roof(b, 4.6, 6.4, 2.6, 2.0, { color: '#8d908c', fin: FIN.metal, rust: 0.2 + 0.6 * hash2(k, 3), eave: 0.24, rake: 0.22, trim: k % 3 === 1 ? null : TRIM })
  b.quad([-2.31, 0.02, -1.0], [-2.31, 0.02, 1.0], [-2.31, 2.0, 1.0], [-2.31, 2.0, -1.0], '#1a1410', FIN.dark)
  win(b, sh.S, 2.3, 3.6, 0.34, 0.34, { cols: 2, rows: 2, barn: true })
  if (k % 2 === 0) {
    // a silo beside the barn
    b.cyl([3.4, -1, -1.2], [3.4, 5.4, -1.2], 0.95, 0.95, 14, '#a8a295', FIN.concrete)
    b.lathe([3.4, 5.4, -1.2], [[1.0, 0], [0.7, 0.42], [0, 0.62]], 14, '#8d908c', FIN.metal)
  }
  b.pop()
}

export function country(b: Builder): void {
  FARMSTEADS.forEach(([x, z, ry], k) => neighbour(b, x, z, ry, k))
}

// Poles and their wire: along the town road, and up the farm's road to the house.
export function poles(b: Builder): void {
  const line: V3[] = []
  for (let x = -150; x <= 210; x += 22) {
    const z = townRoadZ(x) + 2.4
    line.push([x, groundY(x, z), z])
  }
  const lane: V3[] = [[26, 0, townRoadZ(26) + 2.4], [21.9, 0, 47.6], [20.6, 0, 39.0], [19.9, 0, 31.2], [19.6, 0, 24.6], [19.5, 0, 18.0], [19.6, 0, 11.4], [20.9, 0, 6.9]]
  for (const p of lane) p[1] = groundY(p[0], p[2])
  b.at(0, 0, 0, 0, 0)
  const pole = (p: V3, arm: boolean, k: number) => {
    const lean = (hash2(k, 71) - 0.5) * 0.12
    b.cyl([p[0], p[1] - 0.2, p[2]], [p[0] + lean, p[1] + 2.9, p[2] + lean * 0.5], 0.06, 0.045, 6, '#5a4a3c', FIN.wood, { tint: 0.8 + 0.4 * hash2(k, 73), ex: 0.95 })
    if (arm) {
      b.box(p[0] + lean, p[1] + 2.7, p[2] + lean * 0.5, 0.06, 0.06, 0.62, '#5a4a3c', FIN.wood)
      for (const sg of [-1, 1]) b.cyl([p[0] + lean, p[1] + 2.73, p[2] + sg * 0.26], [p[0] + lean, p[1] + 2.8, p[2] + sg * 0.26], 0.02, 0.016, 5, '#8fa39a', FIN.plain)
    }
  }
  const wire = (a: V3, c: V3, sag: number) => {
    const n = 6
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n
      const p = (t: number): V3 => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * Math.sin(t * Math.PI), a[2] + (c[2] - a[2]) * t]
      b.beam(p(t0), p(t1), 0.012, 0.012, '#1f1f1d', FIN.plain)
    }
  }
  line.forEach((p, k) => {
    pole(p, true, k)
    if (k > 0) for (const sg of [-1, 1]) wire([line[k - 1][0], line[k - 1][1] + 2.8, line[k - 1][2] + sg * 0.26], [p[0], p[1] + 2.8, p[2] + sg * 0.26], 0.42)
  })
  lane.forEach((p, k) => {
    if (k > 0) pole(p, false, k + 40)
    if (k > 0) wire([lane[k - 1][0], lane[k - 1][1] + 2.8, lane[k - 1][2]], [p[0], p[1] + 2.85, p[2]], 0.28)
  })
  // the drop to the house's gable
  wire([lane[lane.length - 1][0], lane[lane.length - 1][1] + 2.85, lane[lane.length - 1][2]], [HOUSE.x - 0.4, groundY(HOUSE.x, HOUSE.z) + 2.75, HOUSE.z + 1.86], 0.16)
  // Bars in the walls where the tracks pass through: two posts each side, the bars slid back.
  for (const [x, z] of [[16.5, -20.8], [-17.45, -20.8], [49, -7.6], [83.6, -7.5], [16.4, 31.4]]) {
    for (const sg of [-1, 1]) {
      const pz = z + sg * 1.05, y = groundY(x, pz)
      for (const dx of [-0.07, 0.07]) b.box(x + dx, y + 0.34, pz, 0.06, 0.7, 0.07, '#77695a', FIN.wood)
    }
    const y = groundY(x, z - 1.9)
    for (let k = 0; k < 3; k++) b.beam([x + (k - 1) * 0.02, y + 0.16 + k * 0.2, z - 3.0], [x, groundY(x, z - 1.05) + 0.14 + k * 0.2, z - 0.95], 0.04, 0.05, '#8a7d6b', FIN.wood, { tint: 0.85 + 0.1 * k })
  }
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
