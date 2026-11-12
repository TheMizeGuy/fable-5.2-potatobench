// The eight kinds of building the farm raises, each on its site in the yards' plan (layout.ts), drawn as far along as
// the work is: the site staked out and the materials delivered, the foundation, the frame going up bent by bent, boards
// and roof, and then the finished building in use.
import {
  FIELDSTONE, IRON, LUMBER, TRIM, barrel, door, fbox, foundation, fp, leanRoof, level, lumber, roof, shell, stoneHeap, stovepipe, trims, win,
} from './arch.ts'
import { FIN, type Builder, type V3 } from './builder.ts'
import { bankEarth, potatoHouse } from './farmstead.ts'
import { POND_AT, ROAD, brookHalf, brookZ, groundY, type Site } from './layout.ts'
import { clamp, mix } from './noise.ts'

const RED = '#8f3626', NEW_TIN = '#a9adab', CEDAR = '#b3925f', CONCRETE = '#aaa497', EARTH = '#6f4e3a', GRAVEL = '#9b9584'
const GREEN = '#2c4a37', STRING = '#ece7da'

// What the game says of a site.
export interface SiteLook {
  progress: number          // 0..1 while it is going up
  built: boolean
  lived: boolean            // people sleep or work there (lamps, smoke)
  open: boolean             // the stand is selling today
  autumn: boolean           // late enough in the year for squash on the stand
}

// Where its smoke leaves and its vane turns.
export interface SiteMarks { smoke: V3[]; vane: V3 | null; cups: V3 | null }

const ramp = (p: number, a: number, c: number) => clamp((p - a) / (c - a), 0, 1)

interface Plan {
  w: number; l: number; wall: number; rise: number
  open?: boolean            // the front (W) has no wall: a pole shed
  masonry?: boolean         // walls of concrete to the eaves, as a potato house has
  wallColor: string; wallFin: number; roofColor: string; roofFin: number
  cuts?: [number, number, number, number]
  eave?: number
}

// Four walls of a ring, y0 to y1.
function ring(b: Builder, w: number, l: number, y0: number, y1: number, thick: number, color: string, fin: number, skip = ''): void {
  if (y1 - y0 < 0.01) return
  const y = (y0 + y1) / 2, h = y1 - y0
  if (!skip.includes('W')) b.box(-w / 2 + thick / 2, y, 0, thick, h, l, color, fin, { skip: 'b', uo: 1 })
  if (!skip.includes('E')) b.box(w / 2 - thick / 2, y, 0, thick, h, l, color, fin, { skip: 'b', uo: 5 })
  b.box(0, y, l / 2 - thick / 2, w - thick * 2, h, thick, color, fin, { skip: 'b', uo: 9 })
  b.box(0, y, -l / 2 + thick / 2, w - thick * 2, h, thick, color, fin, { skip: 'b', uo: 13 })
}

// Both slopes of a roof between two shares of the way from eave to ridge, lifted off the rafters.
function slopes(b: Builder, w: number, l: number, wall: number, rise: number, eave: number, rake: number, s0: number, s1: number, lift: number, color: string, fin: number, under: boolean): void {
  if (s1 - s0 < 0.01) return
  const half = w / 2, run = Math.hypot(half, rise), nx = rise / run, ny = half / run
  const xe = half + eave, ye = wall - (eave * rise) / half
  const at = (s: number, off: number): [number, number] => [xe * (1 - s) + nx * off, ye + (wall + rise - ye) * s + ny * off]
  const z0 = -l / 2 - rake, z1 = l / 2 + rake
  for (const sg of [-1, 1]) {
    const [xa, ya] = at(s0, lift), [xb, yb] = at(s1, lift)
    const zf = sg > 0 ? z1 : z0, zn = sg > 0 ? z0 : z1
    b.quad([sg * xa, ya, zf], [sg * xa, ya, zn], [sg * xb, yb, zn], [sg * xb, yb, zf], color, fin, { uo: sg * 3 })
    if (under) {
      const [xc, yc] = at(s0, lift - 0.03), [xd, yd] = at(s1, lift - 0.03)
      b.quad([sg * xc, yc, zn], [sg * xc, yc, zf], [sg * xd, yd, zf], [sg * xd, yd, zn], color, fin, { ex: 0.6, uo: sg * 3 })
    }
  }
}

// A frame building as far along as `p`: the terrace cut level, stakes and string, the foundation, the bents of the frame
// one after another, boards rising up the walls and over the rafters, then roofing and siding. Ridge along z.
function raise(b: Builder, pl: Plan, depth: number, p: number): void {
  const { w, l, wall, rise } = pl
  const cuts = pl.cuts ?? [0.1, 0.28, 0.55, 0.8]
  const t1 = ramp(p, cuts[0], cuts[1]), t2 = ramp(p, cuts[1], cuts[2]), t3 = ramp(p, cuts[2], cuts[3]), t4 = ramp(p, cuts[3], 1)
  const eave = pl.eave ?? 0.2, rake = 0.16
  // the ground cut level and bare
  if (!pl.masonry) b.box(0, -depth / 2 - 0.13, 0, w + 0.7, depth, l + 0.7, EARTH, FIN.earth, { skip: 'b' })
  if (t1 < 0.6) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (w / 2 + 0.3), z = sz * (l / 2 + 0.3)
      b.box(x, 0.1, z, 0.04, 0.5, 0.04, LUMBER, FIN.wood)
      b.box(x, 0.37, z, 0.045, 0.06, 0.045, '#b8402c', FIN.plain)
      b.beam([x, 0.3, z], [-x, 0.3, z], 0.014, 0.014, STRING, FIN.plain)
      b.beam([x, 0.3, z], [x, 0.3, -z], 0.014, 0.014, STRING, FIN.plain)
    }
  }
  // foundation, or for a potato house the concrete walls themselves
  const f0 = pl.masonry ? -0.5 : -depth - 0.13
  const fTop = pl.masonry ? mix(-0.3, wall, t1) : mix(-0.12, 0.1, t1)
  if (t1 > 0) ring(b, w, l, f0, fTop, pl.masonry ? 0.2 : 0.17, pl.masonry ? CONCRETE : FIELDSTONE, pl.masonry ? FIN.concrete : FIN.stone)
  if (t2 <= 0) return
  // the frame: sills, then bents raised one after another, plates joining them, the ridge last
  const x = w / 2 - 0.06
  if (!pl.masonry) ring(b, w - 0.04, l - 0.04, 0.1, 0.19, 0.11, LUMBER, FIN.wood)
  const n = Math.max(2, Math.round(l / 1.45) + 1)
  const up = Math.min(n, Math.ceil(t2 * (n + 0.6) - 1e-6))
  const zAt = (k: number) => -l / 2 + 0.06 + (k * (l - 0.12)) / (n - 1)
  for (let k = 0; k < up; k++) {
    const z = zAt(k)
    if (!pl.masonry) {
      for (const sx of [-1, 1]) {
        b.box(sx * x, (0.19 + wall) / 2, z, 0.1, wall - 0.19, 0.1, LUMBER, FIN.wood, { skip: 'b', uo: k })
        b.beam([sx * x, wall - 0.42, z], [sx * (x - 0.36), wall - 0.06, z], 0.05, 0.06, LUMBER, FIN.wood)
      }
    }
    b.beam([-x, wall - 0.05, z], [x, wall - 0.05, z], 0.09, 0.1, LUMBER, FIN.wood)
    for (const sx of [-1, 1]) b.beam([sx * x, wall, z], [0, wall + rise, z], 0.07, 0.1, LUMBER, FIN.wood, { tint: 0.96 })
    b.beam([-x * 0.46, wall + rise * 0.54, z], [x * 0.46, wall + rise * 0.54, z], 0.05, 0.07, LUMBER, FIN.wood)
  }
  if (up >= 2) {
    for (const sx of [-1, 1]) {
      b.beam([sx * x, wall + 0.03, zAt(0) - 0.05], [sx * x, wall + 0.03, zAt(up - 1) + 0.05], 0.1, 0.07, LUMBER, FIN.wood)
      if (!pl.masonry && !(pl.open && sx < 0)) b.beam([sx * x, wall * 0.52, zAt(0)], [sx * x, wall * 0.52, zAt(up - 1)], 0.05, 0.08, LUMBER, FIN.wood)
    }
  }
  if (up >= n) {
    b.beam([0, wall + rise + 0.02, -l / 2 - 0.05], [0, wall + rise + 0.02, l / 2 + 0.05], 0.06, 0.1, LUMBER, FIN.wood)
    for (const sx of [-1, 1]) b.beam([sx * x * 0.52, wall + rise * 0.5 + 0.04, -l / 2], [sx * x * 0.52, wall + rise * 0.5 + 0.04, l / 2], 0.06, 0.06, LUMBER, FIN.wood)
  }
  if (t3 <= 0) return
  // boards up the walls and the gables, then over the rafters from the eaves
  const ta = ramp(t3, 0, 0.6), tb = ramp(t3, 0.45, 1)
  const y0 = pl.masonry ? wall : 0.1, yh = mix(y0, wall, ta)
  const board = (xx: number, zz: number, ww: number, dd: number, uo: number) => { if (yh - y0 > 0.02) b.box(xx, (y0 + yh) / 2, zz, ww, yh - y0, dd, LUMBER, FIN.boards, { skip: 'b', uo, tint: 0.97 }) }
  if (!pl.masonry) {
    if (!pl.open) board(-w / 2 + 0.014, 0, 0.028, l, 2)
    board(w / 2 - 0.014, 0, 0.028, l, 6)
    board(0, l / 2 - 0.014, w, 0.028, 10)
    board(0, -l / 2 + 0.014, w, 0.028, 14)
  }
  if (ta >= 1 || pl.masonry) {
    const g = pl.masonry ? ta : ramp(t3, 0.5, 0.8)
    if (g > 0) for (const sz of [-1, 1]) {
      const z = sz * (l / 2 - 0.014), hw = w / 2, top = wall + rise * g, xi = (w / 2) * (1 - g)
      const a: V3 = [-hw, wall, z], c: V3 = [hw, wall, z], d: V3 = [xi, top, z], e: V3 = [-xi, top, z]
      if (sz > 0) { b.quad(a, c, d, e, LUMBER, FIN.boards, { uo: 3 }); b.quad(c, a, e, d, LUMBER, FIN.boards, { uo: 3, ex: 0.6 }) } else { b.quad(c, a, e, d, LUMBER, FIN.boards, { uo: 7 }); b.quad(a, c, d, e, LUMBER, FIN.boards, { uo: 7, ex: 0.6 }) }
    }
  }
  slopes(b, w, l, wall, rise, eave, rake, 0, tb, 0.055, LUMBER, FIN.boards, true)
  // staging along the back, a ladder at the front
  if (p < 0.985) {
    const sx = w / 2 + 0.45
    for (const z of [-l * 0.3, l * 0.3]) for (const dx of [0, 0.42]) b.box(sx + dx - 0.2, wall * 0.42, z, 0.045, wall * 0.84 + 0.6, 0.045, '#9c8660', FIN.wood)
    b.box(sx, wall * 0.62, 0, 0.42, 0.035, l * 0.72, '#b29a6c', FIN.wood)
    b.box(sx, wall * 0.3, 0, 0.42, 0.03, l * 0.7, '#a48c5f', FIN.wood)
    for (const dz of [-0.11, 0.11]) b.beam([-w / 2 - 0.62, -0.1, l * 0.18 + dz], [-w / 2 - 0.05, wall + 0.25, l * 0.18 + dz], 0.03, 0.04, '#a9905f', FIN.wood)
    for (let k = 1; k < 7; k++) { const t = k / 7; b.box(-w / 2 - 0.62 + 0.57 * t, -0.1 + (wall + 0.35) * t, l * 0.18, 0.025, 0.025, 0.24, '#a9905f', FIN.wood) }
  }
  if (t4 <= 0) return
  // roofing laid from the eaves, and the walls' own finish from the sills
  slopes(b, w, l, wall, rise, eave, rake, 0, ramp(t4, 0, 0.6), 0.075, pl.roofColor, pl.roofFin, false)
  const ts = ramp(t4, 0.3, 1), ys = mix(y0, wall, ts)
  if (!pl.masonry && ys - y0 > 0.02) {
    const skin = (xx: number, zz: number, ww: number, dd: number, uo: number) => b.box(xx, (y0 + ys) / 2, zz, ww, ys - y0, dd, pl.wallColor, pl.wallFin, { skip: 'b', uo })
    if (!pl.open) skin(-w / 2 - 0.006, 0, 0.02, l + 0.02, 2)
    skin(w / 2 + 0.006, 0, 0.02, l + 0.02, 6)
    skin(0, l / 2 + 0.006, w + 0.02, 0.02, 10)
    skin(0, -l / 2 - 0.006, w + 0.02, 0.02, 14)
  }
}

// What is delivered to a site and used up as the work goes: sawn lumber, field stone, a mortar tub, sawhorses.
function supplies(b: Builder, x: number, z: number, p: number, stone: boolean): void {
  const left = 1 - ramp(p, 0.2, 0.95)
  lumber(b, x, 0.0, z, 0.62, 0.08 + 0.5 * left, 2.1, 0.12)
  if (left > 0.3) lumber(b, x + 0.86, 0.0, z + 0.2, 0.5, 0.36 * left, 1.7, -0.1)
  if (stone && p < 0.3) stoneHeap(b, x - 0.2, -0.02, z + 1.9, 0.7, Math.round(16 * (1 - ramp(p, 0.08, 0.28))) + 2, 3)
  // sawhorses with a plank across, once there is sawing to do
  if (p > 0.2 && p < 0.97) {
    for (const dz of [-0.5, 0.5]) {
      b.box(x - 1.0, 0.3, z + dz, 0.5, 0.05, 0.06, '#9c8660', FIN.wood)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([x - 1.0 + sx * 0.2, 0.3, z + dz], [x - 1.0 + sx * 0.26, -0.05, z + dz + sz * 0.1], 0.03, 0.03, '#9c8660', FIN.wood)
    }
    b.box(x - 1.0, 0.345, z, 0.16, 0.03, 1.5, LUMBER, FIN.wood)
  }
}

function seat(b: Builder, s: Site): number {
  const g = level(s.x, s.z, s.w, s.d, s.ry)
  b.at(s.x, g.top + 0.05, s.z, s.ry, g.top + 0.05)
  return g.top + 0.05 - g.low + 0.4
}

// ---- The machine shed: a pole shed open to the yard, three bays, tin over boards.
const SHED: Plan = { w: 3.1, l: 6.4, wall: 1.5, rise: 0.72, open: true, wallColor: RED, wallFin: FIN.boards, roofColor: NEW_TIN, roofFin: FIN.metal, eave: 0.24 }
function shed(b: Builder, s: Site, look: SiteLook): void {
  const depth = seat(b, s)
  supplies(b, -s.w / 2 - 1.5, s.d / 2 + 0.2, look.built ? 1 : look.progress, true)
  b.push(0, 0, 0, Math.PI / 2)
  const pl = SHED
  if (!look.built) { raise(b, pl, depth, look.progress); b.pop(); return }
  const { w, l, wall, rise } = pl
  b.box(0, -depth / 2 - 0.02, 0, w + 0.3, depth, l + 0.3, EARTH, FIN.earth, { skip: 'b' })
  // the apron: earth ramped down from the open front
  b.quad([-w / 2 - 1.5, -depth + 0.25, -l / 2 - 0.15], [-w / 2 - 1.5, -depth + 0.25, l / 2 + 0.15], [-w / 2 - 0.1, -0.02, l / 2 + 0.15], [-w / 2 - 0.1, -0.02, -l / 2 - 0.15], EARTH, FIN.earth)
  shell(b, w, l, wall, rise, RED, FIN.boards, { skip: 'W' })
  // the inside of the walls, in shade
  b.quad([w / 2 - 0.02, 0, -l / 2], [w / 2 - 0.02, 0, l / 2], [w / 2 - 0.02, wall, l / 2], [w / 2 - 0.02, wall, -l / 2], '#7a6a58', FIN.boards, { ex: 0.42 })
  for (const sz of [-1, 1]) {
    const z = sz * (l / 2 - 0.02), a: V3 = [sz * w / 2, 0, z], c: V3 = [-sz * w / 2, 0, z]
    b.quad(a, c, [c[0], wall, z], [a[0], wall, z], '#7a6a58', FIN.boards, { ex: 0.45 })
    b.tri([a[0], wall, z], [c[0], wall, z], [0, wall + rise, z], '#7a6a58', FIN.boards, { ex: 0.4 })
  }
  roof(b, w, l, wall, rise, { color: NEW_TIN, fin: FIN.metal, rust: 0.08, eave: 0.26, rake: 0.2, trim: TRIM })
  for (const sx of [1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.03), wall / 2, sz * (l / 2 - 0.03), 0.1, wall, 0.1, TRIM, FIN.plain)
  // posts and the long header across the open front, braced
  const zs = [-l / 2 + 0.07, -l / 6, l / 6, l / 2 - 0.07]
  for (const z of zs) {
    b.box(-w / 2 + 0.07, wall / 2 - 0.1, z, 0.13, wall + 0.2, 0.13, '#8d7d66', FIN.wood)
    b.box(-w / 2 + 0.07, -0.02, z, 0.24, 0.16, 0.24, CONCRETE, FIN.concrete)
  }
  b.beam([-w / 2 + 0.07, wall - 0.09, -l / 2], [-w / 2 + 0.07, wall - 0.09, l / 2], 0.12, 0.18, '#8d7d66', FIN.wood)
  for (const z of zs) for (const sg of [-1, 1]) {
    if (Math.abs(z + sg * 0.4) > l / 2) continue
    b.beam([-w / 2 + 0.07, wall - 0.5, z], [-w / 2 + 0.07, wall - 0.14, z + sg * 0.38], 0.05, 0.07, '#8d7d66', FIN.wood)
  }
  // the bench at the far end, drums, a tyre, a grease-black floor
  b.box(w / 2 - 0.34, 0.4, l / 2 - 0.5, 0.5, 0.05, 0.8, '#7d6648', FIN.wood)
  b.box(w / 2 - 0.34, 0.2, l / 2 - 0.5, 0.44, 0.4, 0.7, '#4f463c', FIN.wood, { skip: 'tb' })
  b.cyl([w / 2 - 0.3, 0, -l / 2 + 0.3], [w / 2 - 0.3, 0.42, -l / 2 + 0.3], 0.14, 0.14, 10, '#35506a', FIN.metal, { cap: 'b', ex: 0.8 })
  b.cyl([w / 2 - 0.3, 0, -l / 2 + 0.66], [w / 2 - 0.3, 0.42, -l / 2 + 0.66], 0.14, 0.14, 10, '#8d2f22', FIN.metal, { cap: 'b', ex: 0.7 })
  for (let k = 0; k < 3; k++) b.lathe([w / 2 - 0.35, k * 0.11, l / 2 - 1.3], [[0.1, 0], [0.18, 0.02], [0.2, 0.055], [0.18, 0.09], [0.1, 0.11]], 10, '#1f1f1d', FIN.plain)
  b.pop()
}

// ---- The bunkhouse: a long low house in new cedar, a porch on its front, a stovepipe through the roof.
const BUNK: Plan = { w: 3.2, l: 5.0, wall: 1.3, rise: 0.82, wallColor: CEDAR, wallFin: FIN.shingle, roofColor: '#4d4f52', roofFin: FIN.shingle, eave: 0.18 }
function bunk(b: Builder, s: Site, look: SiteLook, marks: SiteMarks): void {
  const depth = seat(b, s)
  const pl: Plan = { ...BUNK, w: s.d, l: s.w }
  supplies(b, s.w / 2 + 1.4, s.d / 2 + 0.6, look.built ? 1 : look.progress, true)
  b.push(0, 0, 0, Math.PI / 2)
  if (!look.built) { raise(b, pl, depth, look.progress); b.pop(); return }
  const { w, l, wall, rise } = pl
  foundation(b, w, l, depth)
  const sh = shell(b, w, l, wall, rise, CEDAR, FIN.shingle)
  trims(b, sh, TRIM, { frieze: true, water: true })
  roof(b, w, l, wall, rise, { color: '#4d4f52', fin: FIN.shingle, eave: 0.18, rake: 0.16, trim: TRIM })
  // the front (to the yard): a door, three sashes; lamps there when hands live in it
  const lit = (k: number) => (look.lived ? 0.03 + k * 0.05 : 1.5)
  const ds = l / 2 + 0.9
  door(b, sh.W, ds, 0.03, 0.42, 0.9, GREEN, { kind: 'panel' })
  let k = 0
  for (const sw of [0.62, 1.66, l - 0.62]) win(b, sh.W, sw, 0.78, 0.34, 0.5, { cols: 2, rows: 4, seed: lit(k++) })
  for (const sw of [0.9, l - 0.9]) win(b, sh.E, sw, 0.78, 0.34, 0.5, { cols: 2, rows: 4, seed: lit(k++) })
  win(b, sh.S, w / 2, 0.78, 0.34, 0.5, { cols: 2, rows: 4, seed: lit(k++) })
  win(b, sh.N, w / 2, 0.78, 0.34, 0.5, { cols: 2, rows: 4, seed: lit(k++) })
  // the porch along the front
  const x0 = -w / 2, x1 = -w / 2 - 0.9
  b.box((x0 + x1) / 2, -0.03, 0, 0.9, 0.07, l - 0.4, '#a08c6c', FIN.boards)
  b.box(x1 + 0.03, -0.07 - depth / 2, 0, 0.03, depth, l - 0.4, '#77695a', FIN.boards, { skip: 'tb', ex: 0.7 })
  leanRoof(b, x0, x1 - 0.03, -l / 2 + 0.12, l / 2 - 0.12, wall - 0.04, wall - 0.26, '#4d4f52', FIN.shingle)
  for (const z of [-l / 2 + 0.26, -l / 6, l / 6, l / 2 - 0.26]) b.box(x1 + 0.06, (wall - 0.24) / 2, z, 0.07, wall - 0.24, 0.07, TRIM, FIN.plain)
  b.box(x1 + 0.06, wall - 0.27, 0, 0.08, 0.08, l - 0.4, TRIM, FIN.plain)
  for (let st = 0; st < 3; st++) b.box(x1 - 0.1 - st * 0.17, -0.07 - (st * (depth - 0.35)) / 3 - 0.03, ds - l / 2, 0.18, 0.06, 0.9, '#a08c6c', FIN.boards)
  // a bench, a wash stand with its basin, boots by the door
  b.box(x0 - 0.16, 0.2, -1.3, 0.22, 0.035, 1.2, '#7d6648', FIN.wood)
  for (const z of [-1.8, -0.8]) b.box(x0 - 0.16, 0.1, z, 0.2, 0.2, 0.035, '#7d6648', FIN.wood)
  b.box(x0 - 0.18, 0.2, 0.2, 0.26, 0.4, 0.3, '#8a7458', FIN.wood)
  b.lathe([x0 - 0.18, 0.4, 0.2], [[0.06, 0], [0.11, 0.05], [0.115, 0.055]], 9, '#d8d4c8', FIN.plain)
  // the stove's pipe
  const top = stovepipe(b, 0.5, wall + rise * 0.55, -l * 0.22, 0.75)
  if (look.lived) marks.smoke.push(b.world(top))
  // the wash on a line by the end wall
  b.pop()
}

// ---- The packing shed: a long red shed with a loading dock, the grading line out at its end door, barrels and sacks.
const PACKING: Plan = { w: 4.0, l: 6.0, wall: 1.75, rise: 1.1, wallColor: RED, wallFin: FIN.boards, roofColor: NEW_TIN, roofFin: FIN.metal, eave: 0.22 }
function packing(b: Builder, s: Site, look: SiteLook): void {
  const depth = seat(b, s)
  supplies(b, s.w / 2 + 1.5, -s.d / 2 + 0.4, look.built ? 1 : look.progress, true)
  b.push(0, 0, 0, Math.PI / 2)
  const pl = PACKING
  if (!look.built) { raise(b, pl, depth, look.progress); b.pop(); return }
  const { w, l, wall, rise } = pl
  foundation(b, w, l, depth)
  const sh = shell(b, w, l, wall, rise, RED, FIN.boards)
  trims(b, sh, TRIM, { frieze: false, water: false, wide: 0.1 })
  roof(b, w, l, wall, rise, { color: NEW_TIN, fin: FIN.metal, rust: 0.05, eave: 0.24, rake: 0.2, trim: TRIM })
  const lit = look.lived ? 0.1 : 1.5
  // The front: the dock with its roof, the wide door onto it, a row of sashes for light on the grading table.
  const dz0 = -l / 2 + 0.4, dz1 = 0.9
  b.box(-w / 2 - 0.55, -0.02 - (depth + 0.1) / 2 + 0.05, (dz0 + dz1) / 2, 1.1, depth + 0.1, dz1 - dz0, '#8d7d66', FIN.boards, { skip: 'b' })
  b.box(-w / 2 - 0.55, 0.045, (dz0 + dz1) / 2, 1.16, 0.05, dz1 - dz0 + 0.06, '#a39072', FIN.boards)
  b.quad(fp(sh.W, 1.0, 0.05, 0.012), fp(sh.W, 2.3, 0.05, 0.012), fp(sh.W, 2.3, 1.4, 0.012), fp(sh.W, 1.0, 1.4, 0.012), '#1a1410', FIN.dark)
  door(b, sh.W, 0.86, 0.06, 1.3, 1.36, '#7a2e21', { kind: 'x', trim: null })
  fbox(b, sh.W, 1.5, 1.47, 2.9, 0.07, 0.06, TRIM, FIN.plain)
  leanRoof(b, -w / 2, -w / 2 - 1.2, dz0 - 0.1, dz1 + 0.1, wall - 0.06, wall - 0.36, NEW_TIN, FIN.metal, { rust: 0.05 })
  for (const z of [dz0 + 0.05, dz1 - 0.05]) b.box(-w / 2 - 1.08, (wall - 0.36) / 2, z, 0.08, wall - 0.3, 0.08, TRIM, FIN.plain)
  for (const sw of [3.7, 4.5, 5.3]) win(b, sh.W, sw, 1.02, 0.36, 0.46, { cols: 3, rows: 3, barn: true, seed: lit })
  for (const sw of [0.8, 2.0, 4.0, 5.2]) win(b, sh.E, sw, 1.1, 0.36, 0.4, { cols: 3, rows: 2, barn: true, seed: lit })
  win(b, sh.S, w / 2, wall + rise * 0.45, 0.34, 0.34, { cols: 2, rows: 2, barn: true })
  // barrels and sacks on the dock
  let k = 0
  for (const [x, z, y] of [[-0.3, -2.2, 0], [-0.52, -2.0, 0], [-0.3, -1.76, 0], [-0.76, -2.22, 0], [-0.42, -2.1, 0.3], [-0.9, 0.5, 0], [-0.66, 0.62, 0]]) barrel(b, -w / 2 + x, 0.07 + y, z, 1, 0.88 + 0.24 * ((k++ * 37) % 10) / 10, y === 0 && k % 3 === 0)
  for (const [x, z, r] of [[-0.9, -0.5, 0.2], [-0.84, -0.86, -0.3], [-0.88, -0.66, 1.2]]) b.blob([-w / 2 + x, 0.14 + (r > 1 ? 0.13 : 0), z], [0.2, 0.08, 0.13], Math.round(r * 9) + 4, '#b7a47c', FIN.cloth, { rough: 0.16, detail: 1 })
  // The end to the lane: the big door, and outside it the grading line: hopper, sizing screen on its legs, the
  // picking table, and barrels set to catch each grade.
  b.quad(fp(sh.N, 1.1, 0.03, 0.012), fp(sh.N, 2.9, 0.03, 0.012), fp(sh.N, 2.9, 1.5, 0.012), fp(sh.N, 1.1, 1.5, 0.012), '#1a1410', FIN.dark)
  door(b, sh.N, 3.2, 0.04, 1.3, 1.48, '#7a2e21', { kind: 'x', trim: null })
  fbox(b, sh.N, 2.2, 1.58, 3.4, 0.07, 0.06, TRIM, FIN.plain)
  win(b, sh.N, w / 2, wall + rise * 0.45, 0.34, 0.34, { cols: 2, rows: 2, barn: true })
  {
    const z0 = -l / 2 - 0.5, x = 0.35
    b.box(x, -0.02 - depth * 0.25, z0 - 0.8, 2.2, depth * 0.5, 2.6, EARTH, FIN.earth, { skip: 'b' })
    // hopper
    b.box(x, 0.72, z0 - 0.05, 0.62, 0.3, 0.5, '#5d7a52', FIN.metal, { ex: 0.9 })
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + sx * 0.27, 0.29, z0 - 0.05 + sz * 0.2, 0.05, 0.58, 0.05, '#4c6444', FIN.plain)
    // the inclined screen and the picking table beyond it
    b.beam([x, 0.62, z0 - 0.3], [x, 0.44, z0 - 1.3], 0.46, 0.05, '#8b8d88', FIN.metal, { ex: 0.85 })
    for (const sx of [-1, 1]) b.beam([x + sx * 0.25, 0.66, z0 - 0.3], [x + sx * 0.25, 0.48, z0 - 1.3], 0.03, 0.09, '#5d7a52', FIN.plain)
    b.box(x, 0.42, z0 - 1.75, 0.6, 0.04, 0.9, '#a39072', FIN.wood)
    for (const sx of [-1, 1]) for (const zz of [z0 - 0.45, z0 - 1.25, z0 - 1.4, z0 - 2.1]) b.box(x + sx * 0.26, 0.2, zz, 0.045, 0.42, 0.045, '#4c6444', FIN.plain)
    // potatoes on the table, barrels under each chute and at the end
    for (let q = 0; q < 14; q++) b.blob([x - 0.2 + ((q * 37) % 40) / 100, 0.46, z0 - 1.4 - ((q * 53) % 70) / 100], [0.035, 0.026, 0.028], q, q % 5 === 0 ? '#9c5a48' : '#c2a071', FIN.plain, { detail: 0, rough: 0.2 })
    barrel(b, x - 0.48, -0.02, z0 - 0.75, 1, 1, true)
    barrel(b, x + 0.5, -0.02, z0 - 1.0, 1, 0.9, true)
    barrel(b, x, -0.02, z0 - 2.36, 1, 1.05, true)
    barrel(b, x + 0.3, -0.02, z0 - 2.5, 1, 0.92)
    for (const [bx2, bz2] of [[1.2, -0.3], [1.45, -0.34], [1.32, -0.56], [1.2, -0.8], [1.46, -0.78]]) barrel(b, x + bx2, -0.02, z0 + bz2, 1, 0.86 + 0.3 * Math.abs(bx2 - 1.3))
    barrel(b, x + 1.32, 0.28, z0 - 0.45, 1, 1.02)
  }
  b.pop()
}

// ---- The second potato house: the same banked house as the first, new.
function house(b: Builder, s: Site, look: SiteLook): void {
  const wall = s.yard === -2 ? 1.0 : 1.15, rise = s.yard === -2 ? 1.1 : 1.25
  if (look.built) { potatoHouse(b, s.x, s.z, s.w, s.d, wall, rise, { fresh: true, barrels: 6 }); return }
  const y = groundY(s.x, s.z + s.d / 2 + 0.7) + 0.03
  const p = look.progress
  b.at(s.x, y, s.z, 0, y)
  supplies(b, -s.w / 2 - 1.0, s.d / 2 + 1.6, p, true)
  // spoil from the cut, heaped each side until it is banked back against the walls
  if (p < 0.82) for (const sg of [-1, 1]) {
    b.blob([sg * (s.w / 2 + 1.7), 0.25, -0.6], [0.95, 0.55, 2.0], sg + 3, EARTH, FIN.earth, { detail: 1, rough: 0.22, flat: -0.6 })
  }
  raise(b, { w: s.w, l: s.d, wall, rise, masonry: true, wallColor: '#a59b86', wallFin: FIN.shingle, roofColor: '#5a5650', roofFin: FIN.shingle, cuts: [0.06, 0.45, 0.62, 0.8] }, 0.5, p)
  bankEarth(b, s.x, s.z, s.w, s.d, y, wall, ramp(p, 0.8, 1) * 0.92)
}

// ---- The pond's pump house: a hut on the bank, the intake down to the brook, the main to the yard's fields.
function pond(b: Builder, s: Site, look: SiteLook): void {
  const depth = seat(b, s)
  const p = look.built ? 1 : look.progress
  if (!look.built) {
    supplies(b, -1.7, 0.4, p, false)
    raise(b, { w: s.w, l: s.d, wall: 0.95, rise: 0.42, wallColor: '#c9c3b2', wallFin: FIN.clapboard, roofColor: NEW_TIN, roofFin: FIN.metal, eave: 0.12 }, depth, p)
  } else {
    foundation(b, s.w, s.d, depth, CONCRETE, FIN.concrete)
    const sh = shell(b, s.w, s.d, 0.95, 0.42, '#d5cfbf', FIN.clapboard)
    trims(b, sh, TRIM, { wide: 0.07 })
    roof(b, s.w, s.d, 0.95, 0.42, { color: NEW_TIN, fin: FIN.metal, rust: 0.1, eave: 0.14, rake: 0.12, trim: TRIM })
    door(b, sh.S, s.w / 2, 0.02, 0.4, 0.8, GREEN, { kind: 'plank' })
    win(b, sh.W, s.d / 2, 0.62, 0.26, 0.26, { cols: 2, rows: 2, barn: true })
    // the standpipe and its wheel
    b.cyl([s.w / 2 + 0.3, -depth * 0.5, 0.2], [s.w / 2 + 0.3, 0.52, 0.2], 0.05, 0.05, 7, '#7d2f24', FIN.metal, { ex: 0.9 })
    b.cyl([s.w / 2 + 0.3, 0.52, 0.2], [s.w / 2 + 0.3, 0.56, 0.2], 0.1, 0.1, 8, IRON, FIN.plain, { cap: 'ab' })
  }
  // Pipe: laid on the ground from the brook up to the hut, and on from it to the basin, as far as the work has got.
  b.at(0, 0, 0, 0, groundY(s.x, s.z))
  const laid = look.built ? 1 : ramp(p, 0.15, 0.9)
  const run = (pts: [number, number][], share: number, r: number, color: string) => {
    let total = 0
    for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])
    let left = total * share
    for (let k = 1; k < pts.length && left > 0.05; k++) {
      const [ax, az] = pts[k - 1], [cx, cz] = pts[k], len = Math.hypot(cx - ax, cz - az), t = Math.min(1, left / len)
      const ex = ax + (cx - ax) * t, ez = az + (cz - az) * t
      b.cyl([ax, groundY(ax, az) + r * 0.8, az], [ex, groundY(ex, ez) + r * 0.8, ez], r, r, 6, color, FIN.metal, { ex: 0.86 })
      b.box(ax, groundY(ax, az) + r * 0.8, az, r * 2.8, r * 2.8, r * 2.8, '#55585a', FIN.plain)
      left -= len
    }
  }
  const bz = brookZ(s.x + 0.6) - brookHalf(s.x + 0.6) + 0.5
  const intake: [number, number][] = []
  for (let k = 0; k <= 7; k++) intake.push([s.x + 0.3 + 0.3 * (k / 7), s.z + s.d / 2 + 0.1 + (bz - s.z - s.d / 2 - 0.1) * (k / 7)])
  run(intake.reverse(), laid, 0.055, '#6d7376')
  const main: [number, number][] = [[s.x + s.w / 2 + 0.3, s.z + 0.2], [s.x + 1.6, s.z + 0.9], [POND_AT.x - POND_AT.rx * 0.55, POND_AT.z - POND_AT.rz * 0.4]]
  run(main, look.built ? 1 : ramp(p, 0.5, 0.95), 0.045, '#6d7376')
  if (!look.built && p > 0.05) {
    // lengths of pipe waiting by the hut
    for (let k = 0; k < Math.round(5 * (1 - laid)); k++) b.cyl([s.x - 1.2 + (k % 3) * 0.12, groundY(s.x - 1.2, s.z - 1) + 0.06 + Math.floor(k / 3) * 0.1, s.z - 1.6], [s.x - 1.2 + (k % 3) * 0.12, groundY(s.x - 1.2, s.z + 0.2) + 0.06 + Math.floor(k / 3) * 0.1, s.z + 0.2], 0.055, 0.055, 6, '#6d7376', FIN.metal, { ex: 0.86, cap: 'ab', capColor: '#222' })
  }
}

// ---- The farm stand: a little open-fronted shed by the bridge, its counter to the road.
function stand(b: Builder, s: Site, look: SiteLook): void {
  const depth = seat(b, s)
  const p = look.built ? 1 : look.progress
  const w = s.w, d = s.d, hf = 1.25, hb = 1.0
  if (!look.built) {
    lumber(b, -w / 2 - 0.7, -0.05, 0.3, 0.4, 0.3 * (1 - p) + 0.06, 1.6, 0.2)
    b.box(0, -depth / 2 - 0.05, 0, w + 0.4, depth, d + 0.4, EARTH, FIN.earth, { skip: 'b' })
    if (p < 0.3) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(sx * (w / 2 + 0.2), 0.1, sz * (d / 2 + 0.2), 0.04, 0.5, 0.04, LUMBER, FIN.wood)
      b.beam([sx * (w / 2 + 0.2), 0.3, sz * (d / 2 + 0.2)], [-sx * (w / 2 + 0.2), 0.3, sz * (d / 2 + 0.2)], 0.014, 0.014, STRING, FIN.plain)
    }
    const posts = Math.ceil(ramp(p, 0.15, 0.5) * 4)
    const at: [number, number, number][] = [[-1, 1, hf], [1, 1, hf], [-1, -1, hb], [1, -1, hb]]
    for (let k = 0; k < posts; k++) b.box(at[k][0] * (w / 2 - 0.05), at[k][2] / 2, at[k][1] * (d / 2 - 0.05), 0.08, at[k][2], 0.08, LUMBER, FIN.wood)
    if (p > 0.5) for (const sx of [-1, 1]) b.beam([sx * (w / 2 - 0.05), hf, d / 2 - 0.05], [sx * (w / 2 - 0.05), hb, -d / 2 + 0.05], 0.06, 0.08, LUMBER, FIN.wood)
    if (p > 0.6) { const t = ramp(p, 0.6, 0.95); b.box(0, 0.5 * hb * t, -d / 2 + 0.02, w * t, hb * t, 0.03, LUMBER, FIN.boards) }
    return
  }
  b.box(0, -depth / 2 - 0.03, 0, w + 0.2, depth, d + 0.2, '#8d7d66', FIN.boards, { skip: 'b' })
  // back and sides of board, a counter along the front, a roof that falls to the back
  b.box(0, hb / 2, -d / 2 + 0.02, w, hb, 0.04, '#d8d2c2', FIN.boards)
  for (const sx of [-1, 1]) {
    b.box(sx * (w / 2 - 0.02), 0.3, 0, 0.04, 0.6, d, '#d8d2c2', FIN.boards)
    b.box(sx * (w / 2 - 0.04), hf / 2, d / 2 - 0.04, 0.08, hf, 0.08, TRIM, FIN.plain)
    b.box(sx * (w / 2 - 0.04), hb / 2, -d / 2 + 0.04, 0.08, hb, 0.08, TRIM, FIN.plain)
  }
  b.box(0, 0.5, d / 2 - 0.12, w - 0.1, 0.045, 0.34, '#a39072', FIN.wood)
  b.box(0, 0.25, d / 2 - 0.02, w - 0.16, 0.5, 0.03, '#d8d2c2', FIN.boards)
  b.push(0, 0, 0, -Math.PI / 2)
  leanRoof(b, -d / 2 - 0.02 + d + 0.22, -d / 2 - 0.16, -w / 2 - 0.02, w / 2 + 0.02, hf + 0.2, hb + 0.02, '#7c3528', FIN.metal, { rust: 0.15, over: 0.08 })
  b.pop()
  // the signboard on the roof's edge: a painted potato
  b.box(0, hf + 0.36, d / 2 + 0.12, 1.3, 0.34, 0.035, '#efe9da', FIN.plain)
  b.box(0, hf + 0.36, d / 2 + 0.142, 1.22, 0.26, 0.01, '#b8402c', FIN.plain)
  b.box(0, hf + 0.36, d / 2 + 0.15, 1.14, 0.2, 0.01, '#efe9da', FIN.plain)
  b.blob([0, hf + 0.36, d / 2 + 0.16], [0.2, 0.075, 0.012], 3, '#a9834f', FIN.plain, { detail: 1, rough: 0.12 })
  for (const sx of [-0.4, 0.4]) b.blob([sx, hf + 0.36, d / 2 + 0.16], [0.09, 0.05, 0.012], 5, sx < 0 ? '#9c4a3c' : '#c7a569', FIN.plain, { detail: 1, rough: 0.12 })
  if (!look.open) {
    // shut: a board shutter let down over the counter
    b.box(0, 0.86, d / 2 - 0.03, w - 0.16, 0.7, 0.03, '#b9b2a0', FIN.boards)
    return
  }
  // open: bushel baskets of potatoes on the counter and the ground, sacks, squash in the autumn, a scale
  const basket = (x: number, y: number, z: number, color: string) => {
    b.lathe([x, y, z], [[0.085, 0], [0.12, 0.13]], 8, '#b89a66', FIN.wood)
    b.blob([x, y + 0.13, z], [0.105, 0.045, 0.105], Math.round(x * 31 + z * 17), color, FIN.plain, { detail: 1, rough: 0.5, facets: true })
  }
  const kinds = ['#c2a071', '#9c4a3c', '#d3b46a', '#c2a071']
  for (let k = 0; k < 4; k++) basket(-w / 2 + 0.36 + k * 0.46, 0.525, d / 2 - 0.12, kinds[k])
  for (let k = 0; k < 3; k++) basket(-w / 2 + 0.5 + k * 0.42, -0.02, d / 2 + 0.28, kinds[(k + 1) % 4])
  for (const [x, r] of [[0.74, 0.1], [0.94, -0.2]]) b.blob([x, 0.12, d / 2 + 0.32], [0.12, 0.17, 0.1], 7 + Math.round(r * 10), '#b7a47c', FIN.cloth, { rough: 0.14 })
  if (look.autumn) for (const [x, z, sc] of [[-0.95, 0.5, 1], [-0.75, 0.62, 0.8], [-1.0, 0.72, 0.7]]) b.blob([x, 0.07 * sc, d / 2 + z - 0.2], [0.11 * sc, 0.08 * sc, 0.11 * sc], Math.round(x * 9), '#cf7a28', FIN.plain, { rough: 0.1 })
  b.box(0.2, 0.62, d / 2 - 0.2, 0.14, 0.18, 0.1, '#d8d4c8', FIN.plain)
  b.lathe([0.2, 0.71, d / 2 - 0.2], [[0.02, 0], [0.09, 0.02]], 8, '#8b8d88', FIN.plain)
}

// ---- The weather station: a white louvred box on legs in a little fenced plot, a rain gauge, and a mast.
function station(b: Builder, s: Site, look: SiteLook, marks: SiteMarks): void {
  const g = groundY(s.x, s.z)
  b.at(s.x, g, s.z, s.ry, g)
  const w = s.w
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(sx * w / 2, 0.22, sz * w / 2, 0.05, 0.5, 0.05, look.built ? TRIM : LUMBER, FIN.wood)
    if (!look.built) b.beam([sx * w / 2, 0.36, sz * w / 2], [-sx * w / 2, 0.36, sz * w / 2], 0.014, 0.014, STRING, FIN.plain)
    if (!look.built) b.beam([sx * w / 2, 0.36, sz * w / 2], [sx * w / 2, 0.36, -sz * w / 2], 0.014, 0.014, STRING, FIN.plain)
  }
  if (!look.built) {
    // the mast lying ready, the shelter still in its crate
    b.cyl([-0.7, 0.07, -0.4], [0.75, 0.07, 0.5], 0.03, 0.022, 6, '#b9bcb8', FIN.metal)
    b.box(0.2, 0.2, -0.4, 0.45, 0.4, 0.4, LUMBER, FIN.boards)
    return
  }
  for (const sx of [-1, 1]) {
    for (const y of [0.2, 0.4]) {
      b.box(sx * w / 2, y, 0, 0.025, 0.04, w, TRIM, FIN.plain)
      b.box(0, y, sx * w / 2, w, 0.04, 0.025, TRIM, FIN.plain)
    }
  }
  // the shelter
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([-0.3 + sx * 0.17, 0, 0.2 + sz * 0.14], [-0.3 + sx * 0.14, 0.52, 0.2 + sz * 0.11], 0.03, 0.03, TRIM, FIN.plain)
  b.box(-0.3, 0.7, 0.2, 0.36, 0.36, 0.3, '#efeae0', FIN.clapboard, { vo: 0.03 })
  b.push(-0.3, 0, 0.2)
  roof(b, 0.42, 0.4, 0.88, 0.1, { color: '#efeae0', fin: FIN.plain, eave: 0.04, rake: 0.04, thick: 0.02 })
  b.pop()
  // the rain gauge on its post
  b.box(0.45, 0.2, 0.45, 0.05, 0.4, 0.05, TRIM, FIN.wood)
  b.cyl([0.45, 0.4, 0.45], [0.45, 0.66, 0.45], 0.05, 0.065, 8, '#b9bcb8', FIN.metal)
  // the mast, guyed three ways, with the vane and the cups at its head
  const top = 3.3
  b.cyl([0.35, 0, -0.35], [0.35, top, -0.35], 0.03, 0.02, 6, '#c2c5c1', FIN.metal)
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094 + 0.5
    b.cyl([0.35, top * 0.72, -0.35], [0.35 + Math.cos(a) * 1.25, 0.02, -0.35 + Math.sin(a) * 1.25], 0.006, 0.006, 3, '#77797a', FIN.plain)
  }
  b.box(0.35, top - 0.12, -0.35, 0.62, 0.025, 0.025, '#c2c5c1', FIN.plain)
  marks.vane = b.world([0.35 - 0.29, top - 0.04, -0.35])
  marks.cups = b.world([0.35 + 0.29, top - 0.06, -0.35])
}

// ---- Gravelling the farm road: loads of gravel tipped along it ahead of the work, the drag where the work has got to.
function road(b: Builder, s: Site, look: SiteLook): void {
  b.at(0, 0, 0, 0, groundY(s.x, s.z))
  const p = look.built ? 1 : look.progress
  const pts = ROAD.slice(0, 11)
  const seg: number[] = [0]
  for (let k = 1; k < pts.length; k++) seg.push(seg[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]))
  const total = seg[seg.length - 1]
  const at = (dist: number): { x: number; z: number; nx: number; nz: number } => {
    let k = 1
    while (k < pts.length - 1 && seg[k] < dist) k++
    const t = clamp((dist - seg[k - 1]) / (seg[k] - seg[k - 1]), 0, 1)
    const dx = pts[k][0] - pts[k - 1][0], dz = pts[k][1] - pts[k - 1][1], l = Math.hypot(dx, dz) || 1
    return { x: pts[k - 1][0] + dx * t, z: pts[k - 1][1] + dz * t, nx: -dz / l, nz: dx / l }
  }
  const heap = (x: number, z: number, r: number, seed: number) => b.blob([x, groundY(x, z) + r * 0.2, z], [r, r * 0.58, r * 0.9], seed, GRAVEL, FIN.gravel, { detail: 1, rough: 0.18, flat: -0.4 })
  if (look.built) {
    // what was left over, kept at the corner for mending
    heap(s.x, s.z, 0.7, 3)
    heap(s.x + 0.75, s.z + 0.3, 0.45, 4)
    return
  }
  // loads waiting ahead of the work, each on the road's shoulder
  const done = total * p
  for (let dist = done + 2.5, k = 0; dist < Math.min(total, done + 30); dist += 4.6, k++) {
    const q = at(dist), side = k % 2 ? 1 : -1
    heap(q.x + q.nx * side * 1.15, q.z + q.nz * side * 1.15, 0.62 + 0.14 * ((k * 7) % 3), k)
  }
  // the drag: a timber frame drawn along to spread and level, and stakes each side where it works
  const q = at(Math.min(total - 0.5, done + 0.6))
  const y = groundY(q.x, q.z) + 0.06
  const ax = q.nz, az = -q.nx
  b.beam([q.x - q.nx * 0.6, y, q.z - q.nz * 0.6], [q.x + q.nx * 0.6, y, q.z + q.nz * 0.6], 0.12, 0.1, '#6d5b48', FIN.wood)
  b.beam([q.x - q.nx * 0.6 + ax * 0.7, y, q.z - q.nz * 0.6 + az * 0.7], [q.x + q.nx * 0.6 + ax * 0.7, y, q.z + q.nz * 0.6 + az * 0.7], 0.12, 0.1, '#6d5b48', FIN.wood)
  for (const sd of [-1, 1]) b.beam([q.x + q.nx * sd * 0.55, y + 0.04, q.z + q.nz * sd * 0.55], [q.x - q.nx * sd * 0.55 + ax * 0.7, y + 0.04, q.z - q.nz * sd * 0.55 + az * 0.7], 0.06, 0.06, '#6d5b48', FIN.wood)
  b.beam([q.x, y + 0.05, q.z], [q.x - ax * 1.3, y + 0.3, q.z - az * 1.3], 0.012, 0.012, IRON, FIN.plain)
  for (const dd of [-1.5, 1.5, 4.5]) for (const sd of [-1, 1]) {
    const r = at(clamp(done + dd, 0, total))
    const x = r.x + r.nx * sd * 0.95, z = r.z + r.nz * sd * 0.95
    b.box(x, groundY(x, z) + 0.18, z, 0.035, 0.4, 0.035, LUMBER, FIN.wood)
    b.box(x, groundY(x, z) + 0.36, z, 0.04, 0.06, 0.04, '#b8402c', FIN.plain)
  }
  // a barrow and a shovel by the nearest load
  const wq = at(Math.min(total, done + 2.5))
  const wx = wq.x - wq.nx * 1.3, wz = wq.z - wq.nz * 1.3, wy = groundY(wx, wz)
  b.box(wx, wy + 0.2, wz, 0.34, 0.14, 0.26, '#5f7383', FIN.metal, { ry: 0.5, ex: 0.9 })
  b.cyl([wx + 0.22, wy + 0.09, wz - 0.14], [wx + 0.26, wy + 0.09, wz - 0.06], 0.09, 0.09, 8, '#1f1f1d', FIN.plain, { cap: 'ab' })
  for (const sd of [-1, 1]) b.beam([wx - 0.1, wy + 0.2, wz + sd * 0.1], [wx - 0.46, wy + 0.24, wz + 0.2 + sd * 0.12], 0.02, 0.025, '#8a7458', FIN.wood)
}

// Draw one site of the plan as the game has it.
export function drawSite(b: Builder, s: Site, look: SiteLook): SiteMarks {
  const marks: SiteMarks = { smoke: [], vane: null, cups: null }
  switch (s.kind) {
    case 'house': house(b, s, look); break
    case 'shed': shed(b, s, look); break
    case 'bunk': bunk(b, s, look, marks); break
    case 'packing': packing(b, s, look); break
    case 'pond': pond(b, s, look); break
    case 'stand': stand(b, s, look); break
    case 'station': station(b, s, look, marks); break
    case 'road': road(b, s, look); break
  }
  return marks
}

// The corners of a site not yet built on, staked, for when the yard is being planned.
export function drawPlot(b: Builder, s: Site): void {
  if (s.kind === 'road') return
  const g = level(s.x, s.z, s.w, s.d, s.ry)
  b.at(s.x, g.low, s.z, s.ry, g.low)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * s.w / 2, z = sz * s.d / 2
    const at = b.world([x, 0, z])
    const y = groundY(at[0], at[2]) - g.low
    b.box(x, y + 0.16, z, 0.05, 0.42, 0.05, LUMBER, FIN.wood)
    b.box(x, y + 0.36, z, 0.06, 0.07, 0.06, '#d8c9a0', FIN.plain)
  }
}
