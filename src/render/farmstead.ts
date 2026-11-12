// The buildings that stand from the first day: the connected farm at home (big house, little house, back house, barn),
// the banked potato houses, the Dufour place gone grey for want of paint, and the plank bridges.
import {
  FIELDSTONE, IRON, TRIM, barrel, chimney, door, fbox, foundation, fp, lantern, leanRoof, level, rod, roof, shell, trims, win, type Face,
} from './arch.ts'
import { FIN, type Builder, type V3 } from './builder.ts'
import { SMALL as M } from './measures.ts'
import {
  BARN, BRIDGE_X, DUFOUR, DUFOUR_BARN, DUFOUR_HOUSE, DUFOUR_POTATO_HOUSE, HOME, HOUSE, POTATO_HOUSE, TRUE, WATER_Y, brookZ, groundY, useFrame,
} from './small.ts'

const WHITE = '#e4ded0', OLD_WHITE = '#cfc9b9', SLATE = '#46484c', GREEN = '#26402f', RED = '#8a3324', DARK_RED = '#742c20'
const TIN = '#8d908c', CONCRETE = '#aaa497', GREY_SHINGLE = '#8a857a', OLD_BOARDS = '#877f72', PORCH = '#8a7d6b'

// Where smoke leaves a chimney, where a vane turns, and where a porch lamp or a doorway is, for the yard's life.
export interface Marks { smoke: V3[]; vanes: V3[] }

// Set the builder to a body's floor: level on the highest ground under it. Returns how deep its foundation goes.
function seat(b: Builder, x: number, z: number, w: number, l: number, lift = 0.04): number {
  const g = level(x, z, w, l)
  b.at(x, g.top + lift, z, 0, g.top + lift)
  return g.top + lift - g.low + 0.45
}

// Cordwood stacked between stakes: `len` along x, the cut ends facing -x and +x... drawn as one block with its ends cut.
export function cordwood(b: Builder, x: number, y: number, z: number, len: number, h: number, ry = 0, deep = 0.3): void {
  b.box(x, y + h / 2, z, deep, h, len, '#c2a06c', FIN.cord, { ry, skip: 'b', ex: [0.8, 1] })
  b.box(x, y + h + 0.012, z, deep * 0.94, 0.03, len * 0.98, '#9c7f58', FIN.wood, { ry, skip: 'b' })
}

function house(b: Builder, m: Marks): void {
  const hx = HOUSE.x, hz = HOUSE.z
  // The big house: gable to the brook, two storeys, shutters, the front door under its hood.
  {
    const d = seat(b, hx, hz, M.house.w, M.house.l)
    foundation(b, M.house.w, M.house.l, d)
    const sh = shell(b, M.house.w, M.house.l, M.house.wall, M.house.rise, WHITE, FIN.clapboard)
    trims(b, sh)
    roof(b, 3.0, 3.6, 2.05, 1.15, { color: SLATE, fin: FIN.shingle, eave: 0.2, rake: 0.18, trim: TRIM })
    // cornice returns
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 1.42, 1.99, sz * 1.86, 0.44, 0.1, 0.14, TRIM, FIN.plain)
    const seeds = [0.42, 0.9, 0.3, 0.74, 0.55, 0.96]
    let k = 0
    for (const f of [sh.W, sh.E]) for (const s of [0.72, 1.8, 2.88]) for (const y of [0.76, 1.63]) {
      win(b, f, s, y, 0.33, 0.54, { cols: 3, rows: 4, seed: seeds[k++ % 6], shutters: f === sh.W ? GREEN : undefined })
    }
    for (const s of [0.56, 2.44]) for (const y of [0.76, 1.63]) win(b, sh.S, s, y, 0.33, 0.54, { cols: 3, rows: 4, seed: seeds[k++ % 6], shutters: GREEN })
    win(b, sh.S, 1.5, 1.63, 0.33, 0.54, { cols: 3, rows: 4, seed: 0.8, shutters: GREEN })
    win(b, sh.S, 1.5, 2.56, 0.26, 0.4, { cols: 2, rows: 3, seed: 1.4 })
    win(b, sh.N, 1.5, 2.56, 0.26, 0.4, { cols: 2, rows: 3, seed: 1.4 })
    // the front door: panelled, a light over it, a hood on brackets, two granite steps
    door(b, sh.S, 1.5, 0.02, M.houseDoor.w, M.houseDoor.h, GREEN, { kind: 'panel' })
    win(b, sh.S, 1.5, 1.03, 0.44, 0.1, { cols: 4, rows: 1, seed: 0.5, plain: true })
    b.box(0, 1.2, 2.0, 0.92, 0.05, 0.42, TRIM, FIN.plain)
    leanRoof(b, -0.46, 0.46, 1.8, 2.22, 1.23, 1.23, SLATE, FIN.shingle, { over: 0.02, thick: 0.02 })
    for (const sx of [-1, 1]) {
      b.beam([sx * 0.38, 0.86, 1.82], [sx * 0.38, 1.17, 2.16], 0.04, 0.05, TRIM, FIN.plain)
      b.box(sx * 0.38, 1.0, 1.83, 0.05, 0.36, 0.04, TRIM, FIN.plain)
    }
    const drop = d - 0.45, steps = Math.max(2, Math.ceil(drop / 0.11) + 1)
    for (let st = 0; st < steps; st++) b.box(0, -0.03 - st * 0.11 - 0.2, 2.0 + st * 0.2, 0.96 + st * 0.06, 0.5, 0.44, '#9b978e', FIN.concrete, { skip: 'b' })
    chimney(b, 0.42, -0.55, 2.72, 3.84, 0.38, 0.38)
    rod(b, 0, 3.26, 1.5)
  }
  // The little house: the kitchen ell a step up the slope, its porch to the dooryard, the kitchen chimney.
  {
    const ex = hx + 0.1, ez = hz - 3.2
    const d = seat(b, ex, ez, 2.3, 3.0)
    foundation(b, 2.3, 3.0, d)
    const sh = shell(b, 2.3, 3.0, 1.45, 0.82, WHITE, FIN.clapboard)
    trims(b, sh)
    roof(b, 2.3, 3.0, 1.45, 0.82, { color: SLATE, fin: FIN.shingle, eave: 0.16, rake: 0.1, trim: TRIM })
    win(b, sh.W, 0.52, 0.8, 0.32, 0.5, { cols: 3, rows: 4, seed: 0.02 })
    win(b, sh.W, 2.5, 0.8, 0.32, 0.5, { cols: 3, rows: 4, seed: 0.06 })
    door(b, sh.W, 1.5, 0.02, 0.42, 0.88, GREEN, { kind: 'panel' })
    lantern(b, sh.W, 1.87, 0.96)
    for (const s of [0.7, 2.3]) win(b, sh.E, s, 0.8, 0.32, 0.5, { cols: 3, rows: 4, seed: 0.12 })
    // the porch: boards on stone piers, square posts, a rail, a shingled roof, steps down to the yard
    const px0 = -1.15, px1 = -2.12
    b.box((px0 + px1) / 2, -0.035, 0, px0 - px1, 0.07, 2.6, PORCH, FIN.boards, { uo: 0.4 })
    for (const z of [-1.2, 0, 1.2]) b.box(px1 + 0.1, -0.07 - d / 2, z, 0.2, d, 0.2, FIELDSTONE, FIN.stone, { skip: 'tb' })
    b.box(px1 + 0.02, -0.07 - d * 0.5, 0, 0.03, d, 2.6, '#6f6657', FIN.boards, { skip: 'tb', ex: 0.7 })
    leanRoof(b, px0, px1 - 0.04, -1.3, 1.3, 1.36, 1.2, SLATE, FIN.shingle, { over: 0.1 })
    for (const z of [-1.24, -0.02, 1.24]) {
      b.box(px1 + 0.05, 0.6, z, 0.07, 1.2, 0.07, TRIM, FIN.plain)
      b.box(px1 + 0.05, 1.14, z, 0.12, 0.05, 0.12, TRIM, FIN.plain)
    }
    b.box(px1 + 0.05, 1.19, 0, 0.09, 0.09, 2.6, TRIM, FIN.plain)
    const rail = (z0: number, z1: number) => {
      b.box(px1 + 0.05, 0.38, (z0 + z1) / 2, 0.05, 0.04, z1 - z0, TRIM, FIN.plain)
      b.box(px1 + 0.05, 0.09, (z0 + z1) / 2, 0.04, 0.03, z1 - z0, TRIM, FIN.plain)
      for (let z = z0 + 0.09; z < z1 - 0.04; z += 0.13) b.box(px1 + 0.05, 0.235, z, 0.022, 0.27, 0.022, TRIM, FIN.plain, { skip: 'tb' })
    }
    rail(-1.2, -0.06)
    for (const z of [-1.27, 1.27]) {
      b.box((px0 + px1) / 2, 0.38, z, px0 - px1 - 0.1, 0.04, 0.05, TRIM, FIN.plain)
      for (let x = px1 + 0.2; x < px0 - 0.06; x += 0.13) b.box(x, 0.22, z, 0.022, 0.3, 0.022, TRIM, FIN.plain, { skip: 'tb' })
    }
    for (let s = 0; s < 3; s++) b.box(px1 - 0.1 - s * 0.17, -0.07 - s * (d - 0.4) / 3 - 0.03, 0.6, 0.18, 0.06, 0.9, PORCH, FIN.boards, { tint: 0.92 })
    // a bench under the window, and the old dog asleep on the boards
    b.box(px0 - 0.14, 0.2, -0.72, 0.2, 0.035, 0.7, '#6d5b48', FIN.wood)
    for (const z of [-1.02, -0.42]) b.box(px0 - 0.14, 0.1, z, 0.18, 0.2, 0.035, '#6d5b48', FIN.wood)
    b.blob([px0 - 0.5, 0.075, -0.3], [0.17, 0.07, 0.085], 5, '#6b4f36', FIN.plain, { rough: 0.12 })
    b.blob([px0 - 0.68, 0.075, -0.24], [0.07, 0.055, 0.06], 6, '#5e4530', FIN.plain, { rough: 0.1 })
    b.blob([px0 - 0.33, 0.04, -0.34], [0.09, 0.02, 0.02], 7, '#5e4530', FIN.plain, { rough: 0.1, detail: 0 })
    chimney(b, 0.25, -0.3, 1.9, 2.92, 0.32, 0.32)
    m.smoke.push(b.world([0.25, 3.0, -0.3]))
  }
  // The back house: woodshed and workshop, plainer, its wide door to the yard and the winter's wood by it.
  {
    const bx = hx + 0.2, bz = hz - 6.0
    const d = seat(b, bx, bz, 2.5, 2.8, 0.07)
    foundation(b, 2.5, 2.8, d)
    const sh = shell(b, 2.5, 2.8, 1.5, 0.9, OLD_WHITE, FIN.clapboard)
    trims(b, sh)
    roof(b, 2.5, 2.8, 1.5, 0.9, { color: SLATE, fin: FIN.shingle, eave: 0.16, rake: 0.1, trim: TRIM })
    // the wide door stands half open on its track
    b.quad(fp(sh.W, 0.95, 0.03, 0.012), fp(sh.W, 2.15, 0.03, 0.012), fp(sh.W, 2.15, 1.2, 0.012), fp(sh.W, 0.95, 1.2, 0.012), '#17130f', FIN.dark)
    door(b, sh.W, 0.82, 0.03, 0.9, 1.17, '#75695a', { trim: null })
    fbox(b, sh.W, 1.3, 1.25, 2.1, 0.06, 0.06, TRIM, FIN.plain)
    win(b, sh.W, 2.48, 0.86, 0.26, 0.4, { cols: 2, rows: 3, seed: 0.5 })
    win(b, sh.E, 1.4, 0.86, 0.3, 0.44, { cols: 2, rows: 3, seed: 0.66 })
    cordwood(b, -1.42, 0, -0.55, 1.3, 0.62)
    cordwood(b, -1.42, 0, -1.26, 0.3, 0.3)
    cordwood(b, 1.44, 0, 0.3, 2.0, 0.7)
    // the chopping block, the axe left in it, split wood lying about
    b.cyl([-2.0, -0.02, -1.0], [-2.0, 0.2, -1.0], 0.13, 0.12, 9, '#7b6247', FIN.wood, { cap: 'b', capColor: '#b59566', capFin: FIN.endgrain })
    b.beam([-2.0, 0.2, -1.0], [-1.8, 0.47, -0.95], 0.02, 0.025, '#8a7458', FIN.wood)
    b.box(-1.98, 0.23, -1.0, 0.03, 0.07, 0.1, '#5c5d5a', FIN.plain, { ry: 0.3 })
    for (const [x, z, r] of [[-2.3, -0.75, 0.4], [-1.75, -1.3, 1.3], [-2.2, -1.32, 2.2], [-1.72, -0.7, 0.9]]) b.box(x, 0.03, z, 0.2, 0.05, 0.06, '#b59566', FIN.wood, { ry: r })
  }
}

function barn(b: Builder, m: Marks): void {
  const bx = BARN.x, bz = BARN.z - 0.8
  const { w, l, wall, rise } = M.barn, top = wall + rise
  const d = seat(b, bx, bz, w, l)
  foundation(b, w, l, d)
  const sh = shell(b, w, l, wall, rise, RED, FIN.boards)
  trims(b, sh, TRIM, { frieze: false, water: false, wide: 0.11 })
  roof(b, w, l, wall, rise, { color: TIN, fin: FIN.metal, rust: 0.3, eave: 0.26, rake: 0.24, trim: TRIM })
  // The great door on its track, slid part way back: the dark of the bay behind it.
  b.quad(fp(sh.W, 2.45, 0.02, 0.012), fp(sh.W, 4.35, 0.02, 0.012), fp(sh.W, 4.35, 1.94, 0.012), fp(sh.W, 2.45, 1.94, 0.012), '#1a1410', FIN.dark)
  door(b, sh.W, 2.72, 0.04, M.barn.door.w, M.barn.door.h, DARK_RED, { kind: 'x', trim: null })
  fbox(b, sh.W, 2.9, 2.0, 4.1, 0.08, 0.07, TRIM, FIN.plain)
  for (const s of [2.42, 4.38]) fbox(b, sh.W, s, 0.98, 0.07, 1.96, 0.03, TRIM, FIN.plain)
  lantern(b, sh.W, 4.62, 1.7)
  for (const s of [0.62, 1.34, 5.0, 5.56]) win(b, sh.W, s, 1.3, 0.3, 0.3, { cols: 2, rows: 2, barn: true, seed: 1.2 })
  for (const s of [0.9, 2.2, 3.8, 5.1]) win(b, sh.E, s, 1.9, 0.3, 0.3, { cols: 2, rows: 2, barn: true, seed: 1.2 })
  // The gable to the brook: a man door, the hay door under its hood with the fork's track, the loft window.
  door(b, sh.S, 0.85, 0.03, 0.5, 1.0, DARK_RED, { kind: 'x' })
  b.quad(fp(sh.S, 1.72, 2.5, 0.012), fp(sh.S, 2.58, 2.5, 0.012), fp(sh.S, 2.58, 3.42, 0.012), fp(sh.S, 1.72, 3.42, 0.012), '#1a1410', FIN.dark)
  fbox(b, sh.S, 2.15, 2.58, 0.8, 0.22, 0.2, '#c9a85a', FIN.hay)
  for (const sg of [-1, 1]) door(b, sh.S, 2.15 + sg * 0.66, 2.5, 0.42, 0.92, DARK_RED, { kind: 'x', trim: null })
  fbox(b, sh.S, 2.15, 3.47, 1.84, 0.07, 0.03, TRIM, FIN.plain)
  win(b, sh.S, 2.15, 3.86, 0.3, 0.3, { cols: 2, rows: 2, barn: true })
  win(b, sh.N, 2.15, 3.5, 0.3, 0.3, { cols: 2, rows: 2, barn: true })
  win(b, sh.S, 3.3, 1.3, 0.3, 0.3, { cols: 2, rows: 2, barn: true, seed: 1.2 })
  b.push(0, 0, l / 2 + 0.24 + 0.3)
  roof(b, 1.3, 0.62, top - 0.575, 0.575, { color: TIN, fin: FIN.metal, rust: 0.3, eave: 0.02, rake: 0.01, trim: TRIM })
  b.pop()
  b.beam([0, top - 0.12, l / 2], [0, top - 0.12, l / 2 + 0.82], 0.07, 0.09, '#5a4c3e', FIN.wood)
  b.cyl([0, top - 0.17, l / 2 + 0.74], [0, top - 0.75, l / 2 + 0.74], 0.008, 0.008, 4, '#b7a98a', FIN.plain)
  b.box(0, top - 0.8, l / 2 + 0.74, 0.05, 0.1, 0.03, IRON, FIN.plain)
  // The lean-to along the back: the old tie-up, a low roof and a row of small sashes.
  {
    const x0 = w / 2, x1 = w / 2 + 1.55, z0 = -2.7, z1 = 1.5, yh = 1.95, yl = 1.3
    b.quad([x1, -0.3, z1], [x1, -0.3, z0], [x1, yl, z0], [x1, yl, z1], RED, FIN.boards, { ex: [0.94, 0.75], uo: 41 })
    for (const [z, sg] of [[z0, -1], [z1, 1]]) {
      const a: V3 = [sg > 0 ? x0 : x1, -0.3, z], c: V3 = [sg > 0 ? x1 : x0, -0.3, z]
      b.quad(a, c, [c[0], sg > 0 ? yl : yh, z], [a[0], sg > 0 ? yh : yl, z], RED, FIN.boards, { ex: [0.94, 0.85], uo: 47 + sg })
    }
    leanRoof(b, x0, x1, z0, z1, yh + 0.02, yl + 0.02, TIN, FIN.metal, { rust: 0.5 })
    const E: Face = { o: [x1, 0, z1], r: [0, 0, -1], n: [1, 0, 0], len: z1 - z0, h: yl }
    for (const s of [0.7, 1.6, 2.5, 3.5]) win(b, E, s, 0.82, 0.3, 0.26, { cols: 2, rows: 1, barn: true, seed: 1.2 })
    for (const z of [z0, z1]) b.box(x1 - 0.03, yl / 2 - 0.15, z, 0.09, yl + 0.3, 0.09, TRIM, FIN.plain)
  }
  // The cupola: louvred, capped in tin, the vane on its spire; and rods along the ridge.
  b.box(0, top + 0.02, 0, 0.74, 0.12, 0.74, TRIM, FIN.plain)
  b.box(0, top + 0.33, 0, 0.6, 0.5, 0.6, TRIM, FIN.clapboard, { vo: 0.02 })
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    b.box(nx * 0.3, top + 0.33, nz * 0.3, nz ? 0.36 : 0.012, 0.34, nx ? 0.36 : 0.012, '#3d3a34', FIN.clapboard, { vo: 0.05 })
  }
  b.box(0, top + 0.6, 0, 0.76, 0.05, 0.76, TRIM, FIN.plain)
  const ap: V3 = [0, top + 1.0, 0], e = 0.42, ye = top + 0.62
  b.tri([-e, ye, e], [e, ye, e], ap, TIN, FIN.metal, { ex: 0.9 })
  b.tri([e, ye, e], [e, ye, -e], ap, TIN, FIN.metal, { ex: 0.9 })
  b.tri([e, ye, -e], [-e, ye, -e], ap, TIN, FIN.metal, { ex: 0.9 })
  b.tri([-e, ye, -e], [-e, ye, e], ap, TIN, FIN.metal, { ex: 0.9 })
  b.cyl([0, top + 0.98, 0], [0, top + 1.42, 0], 0.014, 0.008, 5, IRON, FIN.plain)
  b.blob([0, top + 1.12, 0], [0.04, 0.04, 0.04], 2, '#b08a3c', FIN.plain, { detail: 0, rough: 0 })
  m.vanes.push(b.world([0, top + 1.36, 0]))
  for (const z of [-2.5, 2.5]) rod(b, 0, top + 0.06, z)
}

// A potato house: a low frame house shingled grey, concrete below where the doors are, the hill banked to its eaves on
// both sides and round the back. Its doors face down the slope. `bank`: how far the earth has been banked up, 0..1.
export function potatoHouse(b: Builder, px: number, pz: number, w: number, l: number, wall: number, rise: number, o: { bank?: number; fresh?: boolean; barrels?: number } = {}): void {
  const bank = o.bank ?? 1
  const y = groundY(px, pz + l / 2 + 0.7) + 0.03
  const top = wall + rise
  b.at(px, y, pz, 0, y)
  const shingle = o.fresh ? '#a59b86' : GREY_SHINGLE, roofCol = o.fresh ? '#5a5650' : '#57544f'
  const sh = shell(b, w, l, wall, rise, shingle, FIN.shingle, { base: -0.5 })
  roof(b, w, l, wall, rise, { color: roofCol, fin: FIN.shingle, eave: 0.2, rake: 0.22, trim: o.fresh ? TRIM : '#b4ad9d' })
  for (const sx of [-1, 1]) b.box(sx * (w / 2 - 0.02), wall / 2, l / 2 - 0.02, 0.1, wall, 0.1, o.fresh ? TRIM : '#b4ad9d', FIN.plain)
  // concrete to the lintel, two wide plank doors, a lamp over them, a sash in the gable
  fbox(b, sh.S, w / 2, 0.24, w + 0.14, 1.0, 0.1, CONCRETE, FIN.concrete, 0, { ex: [0.85, 1] })
  for (const sg of [-1, 1]) door(b, sh.S, w / 2 + sg * 0.45, 0.02, 0.86, 1.1, '#5c4d40', { kind: 'x', trim: null })
  fbox(b, sh.S, w / 2, 1.19, 2.0, 0.11, 0.13, '#4a4038', FIN.wood, 0.06)
  lantern(b, sh.S, w / 2, 1.4)
  win(b, sh.S, w / 2, wall + rise * 0.42, 0.34, 0.3, { cols: 2, rows: 2, barn: true, seed: 0.5 })
  win(b, sh.N, w / 2, wall + rise * 0.42, 0.3, 0.26, { cols: 2, rows: 2, barn: true })
  // wing walls hold back the bank each side of the doors, stepping down to the apron
  for (const sg of [-1, 1]) {
    b.box(sg * (w / 2 + 0.07), 0.3, l / 2 + 0.5, 0.2, 1.3, 1.0, CONCRETE, FIN.concrete, { skip: 'b', uo: sg })
    b.box(sg * (w / 2 + 0.07), 0.08, l / 2 + 1.42, 0.2, 0.86, 0.84, CONCRETE, FIN.concrete, { skip: 'b', uo: sg * 3 })
  }
  b.box(0, -0.1, l / 2 + 1.0, 2.4, 0.22, 2.0, CONCRETE, FIN.concrete, { skip: 'b', tint: 0.9 })
  // ventilators along the ridge
  for (const vz of l > 5.5 ? [-l * 0.27, l * 0.2] : [0]) {
    b.box(0, top + 0.13, vz, 0.34, 0.36, 0.34, '#9aa09e', FIN.metal, { skip: 'b', ex: 0.8 })
    b.push(0, 0, vz)
    roof(b, 0.42, 0.42, top + 0.31, 0.15, { color: '#9aa09e', fin: FIN.metal, rust: 0.4, eave: 0.03, rake: 0.03, thick: 0.02 })
    b.pop()
  }
  // barrels by the door: empties stacked against the wing wall, a few full ones on the apron
  const n = o.barrels ?? 0
  for (let k = 0; k < n; k++) {
    const col = k % 4, row = Math.floor(k / 4) % 2, tier = Math.floor(k / 8)
    barrel(b, w / 2 + 0.36 + col * 0.25 + (tier ? 0.12 : 0), 0.0 + tier * 0.3, l / 2 + 0.36 + row * 0.25, 1, 0.86 + 0.28 * ((k * 37) % 10) / 10)
  }
  if (n > 0) for (const [x, z] of [[-0.86, 1.25], [-1.05, 1.05], [0.7, 1.7]]) barrel(b, x, 0.01, l / 2 + z, 1, 1, true)

  bankEarth(b, px, pz, w, l, y, wall, bank)
}

// Earth banked against a potato house: to the eaves along both sides and round the back, easing out into the slope,
// grown over with the meadow. `bank`: how far it has been banked up, 0..1.
export function bankEarth(b: Builder, px: number, pz: number, w: number, l: number, y: number, wall: number, bank: number): void {
  if (bank <= 0.02) return
  b.at(0, 0, 0, 0, y)
  const yt = y + (wall + 0.03) * bank, out = 2.5 * (0.45 + 0.55 * bank), zf = pz + l / 2 + 0.12, zb = pz - l / 2
  const ease = (t: number) => t * t * (3 - 2 * t)
  // the line of the eaves, from the front of one side round the back to the front of the other, and the way out from it
  const line: { x: number; z: number; dx: number; dz: number; reach: number; top?: number }[] = []
  for (const sg of [1, -1]) {
    const part: typeof line = []
    part.push({ x: px + sg * (w / 2 + 0.18), z: zf + 2.1, dx: sg, dz: 0, reach: 0.5, top: 0 }, { x: px + sg * (w / 2 + 0.18), z: zf + 1.0, dx: sg, dz: 0, reach: 0.7, top: 0.62 })
    for (let k = 0; k <= 5; k++) part.push({ x: px + sg * (w / 2 - 0.04), z: zf + ((zb - zf) * k) / 5, dx: sg, dz: 0, reach: k === 0 ? 0.85 : 1 })
    for (let k = 1; k <= 3; k++) { const a = (k / 4) * Math.PI / 2; part.push({ x: px + sg * (w / 2 - 0.04), z: zb, dx: sg * Math.cos(a), dz: -Math.sin(a), reach: 1 }) }
    for (let k = 0; k <= 2; k++) part.push({ x: px + sg * (w / 2 - 0.04) * (1 - k / 2), z: zb, dx: 0, dz: -1, reach: 0.9 })
    line.push(...(sg > 0 ? part : part.reverse().slice(1)))
  }
  const J = 5
  const rows: V3[][] = line.map((p, i) => {
    const row: V3[] = []
    for (let j = 0; j <= J; j++) {
      const t = j / J, r = out * p.reach * t
      const x = p.x + p.dx * r, z = p.z + p.dz * r
      const g = groundY(x, z) - 0.04
      const wob = 0.07 * Math.sin(i * 1.9 + j * 2.3) * Math.sin(t * Math.PI)
      row.push([x, Math.max(g, g + (yt - g) * (p.top ?? 1) * (1 - ease(t)) + wob * (p.top ?? 1)), z])
    }
    return row
  })
  b.surface(rows, '#ffffff', FIN.turf)
}

// The Dufour place: a cape gone grey for want of paint with its ell and woodshed, an old barn of weathered boards with
// a rusted roof and a ridge that has settled, and a potato house banked into the slope above the yard.
function dufour(b: Builder, m: Marks): void {
  const hx = DUFOUR_HOUSE.x, hz = DUFOUR_HOUSE.z
  const paint = '#bdb7a8', trim = '#cbc5b6', shingles = '#55565a', rust = '#8b8d88'
  {
    const d = seat(b, hx, hz, 3.2, 4.4)
    foundation(b, 3.2, 4.4, d)
    const sh = shell(b, 3.2, 4.4, 1.35, 1.35, paint, FIN.clapboard)
    trims(b, sh, trim)
    roof(b, 3.2, 4.4, 1.35, 1.35, { color: shingles, fin: FIN.shingle, eave: 0.16, rake: 0.14, trim, sag: 0.05 })
    for (const s of [0.6, 1.4, 3.0, 3.8]) win(b, sh.W, s, 0.76, 0.32, 0.5, { cols: 3, rows: 4, seed: s < 2 ? 0.05 : 0.6 })
    door(b, sh.W, 2.2, 0.02, 0.44, 0.88, '#4c5846', { kind: 'panel', trim })
    b.box(-1.85, -0.04, 0, 0.5, 0.1, 0.96, '#9b978e', FIN.concrete, { skip: 'b' })
    for (const s of [0.7, 2.5]) win(b, sh.S, s, 0.76, 0.32, 0.5, { cols: 3, rows: 4, seed: 0.3 })
    win(b, sh.S, 1.6, 1.98, 0.28, 0.42, { cols: 2, rows: 3, seed: 0.85 })
    for (const s of [1.0, 3.4]) win(b, sh.E, s, 0.76, 0.32, 0.5, { cols: 3, rows: 4, seed: 0.7 })
    chimney(b, 0, 0, 2.4, 3.3, 0.46, 0.46)
    m.smoke.push(b.world([0, 3.38, 0]))
  }
  {
    const d = seat(b, hx + 0.2, hz - 3.5, 2.2, 2.8)
    foundation(b, 2.2, 2.8, d)
    const sh = shell(b, 2.2, 2.8, 1.2, 0.8, paint, FIN.clapboard)
    trims(b, sh, trim)
    roof(b, 2.2, 2.8, 1.2, 0.8, { color: shingles, fin: FIN.shingle, eave: 0.14, rake: 0.08, trim })
    win(b, sh.W, 0.8, 0.72, 0.3, 0.44, { cols: 2, rows: 3, seed: 0.1 })
    door(b, sh.W, 1.9, 0.02, 0.4, 0.84, '#4c5846', { kind: 'panel', trim })
    win(b, sh.E, 1.4, 0.72, 0.3, 0.44, { cols: 2, rows: 3, seed: 0.4 })
  }
  {
    const d = seat(b, hx + 0.3, hz - 6.0, 2.0, 2.4)
    foundation(b, 2.0, 2.4, d)
    const sh = shell(b, 2.0, 2.4, 1.1, 0.7, OLD_BOARDS, FIN.boards)
    roof(b, 2.0, 2.4, 1.1, 0.7, { color: rust, fin: FIN.metal, rust: 0.9, eave: 0.14, rake: 0.1 })
    b.quad(fp(sh.W, 0.5, 0.03, 0.012), fp(sh.W, 1.5, 0.03, 0.012), fp(sh.W, 1.5, 0.98, 0.012), fp(sh.W, 0.5, 0.98, 0.012), '#17130f', FIN.dark)
    cordwood(b, -1.16, 0, 0.75, 0.8, 0.56)
    cordwood(b, -0.72, 0, -0.5, 1.0, 0.6, Math.PI / 2, 0.3)
  }
  {
    const bx = DUFOUR_BARN.x, bz = DUFOUR_BARN.z
    const w = 3.8, l = 5.0, wall = 2.1, rise = 1.6
    const d = seat(b, bx, bz, w, l)
    foundation(b, w, l, d)
    const sh = shell(b, w, l, wall, rise, OLD_BOARDS, FIN.boards)
    roof(b, w, l, wall, rise, { color: rust, fin: FIN.metal, rust: 0.85, eave: 0.22, rake: 0.2, sag: 0.09 })
    b.quad(fp(sh.W, 1.9, 0.02, 0.012), fp(sh.W, 3.5, 0.02, 0.012), fp(sh.W, 3.5, 1.64, 0.012), fp(sh.W, 1.9, 1.64, 0.012), '#1a1410', FIN.dark)
    door(b, sh.W, 2.1, 0.04, 1.6, 1.6, '#6c655a', { kind: 'x', trim: null })
    fbox(b, sh.W, 2.4, 1.72, 3.4, 0.07, 0.06, '#9a9488', FIN.plain)
    win(b, sh.W, 0.7, 1.2, 0.28, 0.28, { cols: 2, rows: 2, barn: true })
    b.quad(fp(sh.S, 1.5, 2.2, 0.012), fp(sh.S, 2.3, 2.2, 0.012), fp(sh.S, 2.3, 3.0, 0.012), fp(sh.S, 1.5, 3.0, 0.012), '#1a1410', FIN.dark)
    fbox(b, sh.S, 1.9, 2.27, 0.74, 0.18, 0.16, '#b99a55', FIN.hay)
    door(b, sh.S, 2.72, 2.2, 0.8, 0.8, '#6c655a', { kind: 'x', trim: null })
    door(b, sh.S, 0.8, 0.03, 0.5, 0.96, '#6c655a', { trim: null })
    // a board or two gone from the gable
    for (const s of [0.5, 3.1]) fbox(b, sh.S, s, 1.5 + s * 0.1, 0.16, 0.9, 0.01, '#1f1a15', FIN.dark, 0.004)
    leanRoof(b, w / 2, w / 2 + 1.3, -2.0, 1.0, 1.6, 1.1, rust, FIN.metal, { rust: 1 })
    b.quad([w / 2 + 1.3, -0.3, 1.0], [w / 2 + 1.3, -0.3, -2.0], [w / 2 + 1.3, 1.1, -2.0], [w / 2 + 1.3, 1.1, 1.0], OLD_BOARDS, FIN.boards, { ex: [0.94, 0.75], uo: 5 })
    b.quad([w / 2, -0.3, 1.0], [w / 2 + 1.3, -0.3, 1.0], [w / 2 + 1.3, 1.1, 1.0], [w / 2, 1.6, 1.0], OLD_BOARDS, FIN.boards, { uo: 9 })
    b.quad([w / 2 + 1.3, -0.3, -2.0], [w / 2, -0.3, -2.0], [w / 2, 1.6, -2.0], [w / 2 + 1.3, 1.1, -2.0], OLD_BOARDS, FIN.boards, { uo: 13 })
    rod(b, 0, wall + rise - 0.02, 1.6)
  }
  const ph = DUFOUR_POTATO_HOUSE
  potatoHouse(b, ph.x, ph.z, 3.6, 5.0, 1.0, 1.1, { barrels: 9 })
}

function bridge(b: Builder, x: number): void {
  const z = brookZ(x)
  const deck = Math.max(groundY(x, z - 2), WATER_Y + 0.42)
  b.at(x, deck, z, 0, deck - 0.4)
  for (let k = 0; k < 10; k++) b.box(0, 0.02, -1.45 + k * 0.32, 1.9, 0.07, 0.3, k % 2 ? '#7d6a55' : '#6d5b48', FIN.wood, { tint: 0.9 + 0.2 * ((k * 7) % 5) / 5, uo: k })
  for (const dx of [-0.82, 0.82]) {
    b.cyl([dx, -0.1, -1.7], [dx, -0.1, 1.7], 0.1, 0.1, 7, '#4f4237', FIN.wood, { cap: 'ab', capFin: FIN.endgrain, capColor: '#8c7556' })
    for (const pz of [-1.3, 0, 1.3]) b.box(dx * 1.1, 0.3, pz, 0.08, 0.56, 0.08, '#6d5b48', FIN.wood)
    b.box(dx * 1.1, 0.56, 0, 0.07, 0.06, 2.9, '#6d5b48', FIN.wood)
    b.box(dx * 1.1, 0.32, 0, 0.04, 0.05, 2.7, '#6d5b48', FIN.wood)
  }
  // stone abutments under each end
  for (const sz of [-1, 1]) b.box(0, -0.45, sz * 1.55, 2.2, 0.8, 0.5, FIELDSTONE, FIN.stone, { skip: 'b' })
}

// Everything that stands from the start, into one builder.
export function farmstead(b: Builder): Marks {
  const m: Marks = { smoke: [], vanes: [] }
  useFrame(HOME)
  house(b, m)
  barn(b, m)
  potatoHouse(b, POTATO_HOUSE.x, POTATO_HOUSE.z, 4.2, 6.2, 1.15, 1.25, { barrels: 14 })
  useFrame(DUFOUR)
  dufour(b, m)
  useFrame(TRUE)
  bridge(b, BRIDGE_X.home)
  bridge(b, BRIDGE_X.dufour)
  return m
}
