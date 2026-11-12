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
  // The big house: gable to the brook, two storeys, shutters, the front door under its hood. It runs toward the brook
  // from the kitchen ell, its dooryard wall in line with the ell's.
  {
    const { w, l, wall, rise } = M.house
    const d = seat(b, hx + 0.325, hz + 0.7, w, l)
    foundation(b, w, l, d)
    const sh = shell(b, w, l, wall, rise, WHITE, FIN.clapboard)
    trims(b, sh)
    roof(b, w, l, wall, rise, { color: SLATE, fin: FIN.shingle, eave: 0.2, rake: 0.18, trim: TRIM })
    // cornice returns
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.08), wall - 0.06, sz * (l / 2 + 0.06), 0.44, 0.1, 0.14, TRIM, FIN.plain)
    const seeds = [0.42, 0.9, 0.3, 0.74, 0.55, 0.96]
    let k = 0
    for (const f of [sh.W, sh.E]) for (const s of [0.85, l / 2, l - 0.85]) for (const y of [0.98, 2.02]) {
      win(b, f, s, y, 0.36, 0.6, { cols: 3, rows: 4, seed: seeds[k++ % 6], shutters: f === sh.W ? GREEN : undefined })
    }
    for (const s of [0.72, w - 0.72]) for (const y of [0.98, 2.02]) win(b, sh.S, s, y, 0.36, 0.6, { cols: 3, rows: 4, seed: seeds[k++ % 6], shutters: GREEN })
    win(b, sh.S, w / 2, 2.02, 0.36, 0.6, { cols: 3, rows: 4, seed: 0.8, shutters: GREEN })
    win(b, sh.S, w / 2, wall + 0.56, 0.28, 0.42, { cols: 2, rows: 3, seed: 1.4 })
    win(b, sh.N, w / 2, wall + 0.56, 0.28, 0.42, { cols: 2, rows: 3, seed: 1.4 })
    // the front door: panelled, a light over it, a hood on brackets, granite steps down to the path
    const dh = M.houseDoor.h, zf = l / 2
    door(b, sh.S, w / 2, 0.02, M.houseDoor.w, dh, GREEN, { kind: 'panel' })
    win(b, sh.S, w / 2, dh + 0.13, 0.44, 0.1, { cols: 4, rows: 1, seed: 0.5, plain: true })
    b.box(0, dh + 0.3, zf + 0.2, 0.92, 0.05, 0.42, TRIM, FIN.plain)
    leanRoof(b, -0.46, 0.46, zf, zf + 0.42, dh + 0.33, dh + 0.33, SLATE, FIN.shingle, { over: 0.02, thick: 0.02 })
    for (const sx of [-1, 1]) {
      b.beam([sx * 0.38, dh - 0.04, zf + 0.02], [sx * 0.38, dh + 0.27, zf + 0.36], 0.04, 0.05, TRIM, FIN.plain)
      b.box(sx * 0.38, dh + 0.1, zf + 0.03, 0.05, 0.36, 0.04, TRIM, FIN.plain)
    }
    const drop = d - 0.45, steps = Math.max(2, Math.ceil(drop / 0.085) + 1)
    for (let st = 0; st < steps; st++) b.box(0, -0.03 - st * 0.085 - 0.2, zf + 0.2 + st * 0.15, 0.96 + st * 0.06, 0.5, 0.34, '#9b978e', FIN.concrete, { skip: 'b' })
    const on = (x: number) => wall + rise * (1 - Math.abs(x) / (w / 2))
    chimney(b, 0.5, -1.3, on(0.5) - 0.12, wall + rise + 0.5, 0.4, 0.4)
    chimney(b, -0.45, 1.2, on(0.45) - 0.12, wall + rise + 0.42, 0.36, 0.36)
    rod(b, 0, wall + rise + 0.06, zf - 0.3)
  }
  // The little house: the kitchen ell a step up the slope, its porch to the dooryard, the kitchen chimney.
  {
    const { w, l, wall, rise } = M.ell
    const d = seat(b, hx + 0.2, hz - 3.2, w, l)
    foundation(b, w, l, d)
    const sh = shell(b, w, l, wall, rise, WHITE, FIN.clapboard)
    trims(b, sh)
    roof(b, w, l, wall, rise, { color: SLATE, fin: FIN.shingle, eave: 0.16, rake: 0.1, trim: TRIM })
    win(b, sh.W, 0.52, 0.86, 0.34, 0.54, { cols: 3, rows: 4, seed: 0.02 })
    win(b, sh.W, l - 0.5, 0.86, 0.34, 0.54, { cols: 3, rows: 4, seed: 0.06 })
    door(b, sh.W, l / 2, 0.02, M.houseDoor.w, M.houseDoor.h, GREEN, { kind: 'panel' })
    lantern(b, sh.W, l / 2 + 0.38, 1.0)
    for (const s of [0.7, l - 0.7]) win(b, sh.E, s, 0.86, 0.34, 0.54, { cols: 3, rows: 4, seed: 0.12 })
    // the porch: boards on stone piers, square posts, a rail, a shingled roof, steps down to the yard
    const px0 = -w / 2, px1 = px0 - 0.97, ph = wall - 0.26
    b.box((px0 + px1) / 2, -0.035, 0, px0 - px1, 0.07, 2.6, PORCH, FIN.boards, { uo: 0.4 })
    for (const z of [-1.2, 0, 1.2]) b.box(px1 + 0.1, -0.07 - d / 2, z, 0.2, d, 0.2, FIELDSTONE, FIN.stone, { skip: 'tb' })
    b.box(px1 + 0.02, -0.07 - d * 0.5, 0, 0.03, d, 2.6, '#6f6657', FIN.boards, { skip: 'tb', ex: 0.7 })
    leanRoof(b, px0, px1 - 0.04, -1.3, 1.3, wall - 0.1, ph + 0.02, SLATE, FIN.shingle, { over: 0.1 })
    for (const z of [-1.24, -0.02, 1.24]) {
      b.box(px1 + 0.05, ph / 2, z, 0.07, ph, 0.07, TRIM, FIN.plain)
      b.box(px1 + 0.05, ph - 0.06, z, 0.12, 0.05, 0.12, TRIM, FIN.plain)
    }
    b.box(px1 + 0.05, ph - 0.01, 0, 0.09, 0.09, 2.6, TRIM, FIN.plain)
    const rail = (z0: number, z1: number) => {
      b.box(px1 + 0.05, 0.4, (z0 + z1) / 2, 0.05, 0.04, z1 - z0, TRIM, FIN.plain)
      b.box(px1 + 0.05, 0.09, (z0 + z1) / 2, 0.04, 0.03, z1 - z0, TRIM, FIN.plain)
      for (let z = z0 + 0.07; z < z1 - 0.03; z += 0.075) b.box(px1 + 0.05, 0.245, z, 0.018, 0.29, 0.018, TRIM, FIN.plain, { skip: 'tb' })
    }
    rail(-1.2, -0.06)
    for (const z of [-1.27, 1.27]) {
      b.box((px0 + px1) / 2, 0.4, z, px0 - px1 - 0.1, 0.04, 0.05, TRIM, FIN.plain)
      for (let x = px1 + 0.14; x < px0 - 0.05; x += 0.075) b.box(x, 0.23, z, 0.018, 0.32, 0.018, TRIM, FIN.plain, { skip: 'tb' })
    }
    const fall = Math.max(2, Math.ceil((d - 0.4) / 0.085))
    for (let s = 0; s < fall; s++) b.box(px1 - 0.08 - s * 0.14, -0.07 - s * 0.085 - 0.03, 0.6, 0.15, 0.06, 0.9, PORCH, FIN.boards, { tint: 0.92 })
    // a bench under the window, and the old dog asleep on the boards
    b.box(px0 - 0.14, 0.2, -0.72, 0.2, 0.035, 0.7, '#6d5b48', FIN.wood)
    for (const z of [-1.02, -0.42]) b.box(px0 - 0.14, 0.1, z, 0.18, 0.2, 0.035, '#6d5b48', FIN.wood)
    b.blob([px0 - 0.5, 0.075, -0.3], [0.17, 0.07, 0.085], 5, '#6b4f36', FIN.plain, { rough: 0.12 })
    b.blob([px0 - 0.68, 0.075, -0.24], [0.07, 0.055, 0.06], 6, '#5e4530', FIN.plain, { rough: 0.1 })
    b.blob([px0 - 0.33, 0.04, -0.34], [0.09, 0.02, 0.02], 7, '#5e4530', FIN.plain, { rough: 0.1, detail: 0 })
    const cy = wall + rise * (1 - 0.3 / (w / 2))
    chimney(b, 0.3, -0.3, cy - 0.12, wall + rise + 0.6, 0.34, 0.34)
    m.smoke.push(b.world([0.3, wall + rise + 0.68, -0.3]))
  }
  // The back house: woodshed and workshop, plainer, its wide door to the yard and the winter's wood by it.
  {
    const { w, l, wall, rise } = M.backHouse
    const d = seat(b, hx + 0.3, hz - 6.0, w, l, 0.07)
    foundation(b, w, l, d)
    const sh = shell(b, w, l, wall, rise, OLD_WHITE, FIN.clapboard)
    trims(b, sh)
    roof(b, w, l, wall, rise, { color: SLATE, fin: FIN.shingle, eave: 0.16, rake: 0.1, trim: TRIM })
    // the wide door stands half open on its track
    b.quad(fp(sh.W, 0.95, 0.03, 0.012), fp(sh.W, 2.15, 0.03, 0.012), fp(sh.W, 2.15, 1.2, 0.012), fp(sh.W, 0.95, 1.2, 0.012), '#17130f', FIN.dark)
    door(b, sh.W, 0.82, 0.03, 0.9, 1.17, '#75695a', { trim: null })
    fbox(b, sh.W, 1.3, 1.25, 2.1, 0.06, 0.06, TRIM, FIN.plain)
    win(b, sh.W, l - 0.32, 0.86, 0.26, 0.4, { cols: 2, rows: 3, seed: 0.5 })
    win(b, sh.E, l / 2, 0.86, 0.3, 0.44, { cols: 2, rows: 3, seed: 0.66 })
    const wx = -w / 2 - 0.19
    cordwood(b, wx, 0, -0.55, 1.3, 0.62)
    cordwood(b, wx, 0, -1.26, 0.3, 0.3)
    cordwood(b, w / 2 + 0.19, 0, 0.3, 2.0, 0.7)
    // the chopping block, the axe left in it, split wood lying about
    const cx = -w / 2 - 0.75
    b.cyl([cx, -0.02, -1.0], [cx, 0.2, -1.0], 0.13, 0.12, 9, '#7b6247', FIN.wood, { cap: 'b', capColor: '#b59566', capFin: FIN.endgrain })
    b.beam([cx, 0.2, -1.0], [cx + 0.2, 0.47, -0.95], 0.02, 0.025, '#8a7458', FIN.wood)
    b.box(cx + 0.02, 0.23, -1.0, 0.03, 0.07, 0.1, '#5c5d5a', FIN.plain, { ry: 0.3 })
    for (const [x, z, r] of [[-0.3, -0.75, 0.4], [0.25, -1.3, 1.3], [-0.2, -1.32, 2.2], [0.28, -0.7, 0.9]]) b.box(cx + x, 0.03, z, 0.2, 0.05, 0.06, '#b59566', FIN.wood, { ry: r })
  }
}

function barn(b: Builder, m: Marks): void {
  // Its dooryard wall stands where the dooryard is measured from, and its great door before the spur from the road;
  // it runs up the slope from the back house.
  const { w, l, wall, rise } = M.barn, top = wall + rise
  const d = seat(b, BARN.x + 0.55, BARN.z - 1.9, w, l)
  foundation(b, w, l, d)
  const sh = shell(b, w, l, wall, rise, RED, FIN.boards)
  trims(b, sh, TRIM, { frieze: false, water: false, wide: 0.11 })
  roof(b, w, l, wall, rise, { color: TIN, fin: FIN.metal, rust: 0.3, eave: 0.26, rake: 0.24, trim: TRIM })
  // The great door on its track, slid part way back: the dark of the bay behind it.
  const dw = M.barn.door.w, dh = M.barn.door.h, at = 5.6
  b.quad(fp(sh.W, at - dw / 2, 0.02, 0.012), fp(sh.W, at + dw / 2, 0.02, 0.012), fp(sh.W, at + dw / 2, dh + 0.04, 0.012), fp(sh.W, at - dw / 2, dh + 0.04, 0.012), '#1a1410', FIN.dark)
  door(b, sh.W, at - dw * 0.86, 0.04, dw, dh, DARK_RED, { kind: 'x', trim: null })
  fbox(b, sh.W, at - dw * 0.45, dh + 0.12, dw * 2.2, 0.08, 0.07, TRIM, FIN.plain)
  for (const s of [at - dw / 2 - 0.03, at + dw / 2 + 0.03]) fbox(b, sh.W, s, dh / 2 + 0.03, 0.07, dh + 0.06, 0.03, TRIM, FIN.plain)
  lantern(b, sh.W, at + dw / 2 + 0.3, 1.75)
  for (const s of [0.7, 1.5, 2.3, l - 0.7]) win(b, sh.W, s, 1.35, 0.32, 0.32, { cols: 2, rows: 2, barn: true, seed: 1.2 })
  for (const s of [1.1, l - 1.1]) win(b, sh.W, s, 2.42, 0.3, 0.3, { cols: 2, rows: 2, barn: true })
  for (const s of [0.9, 2.2]) win(b, sh.E, s, 2.5, 0.3, 0.3, { cols: 2, rows: 2, barn: true, seed: 1.2 })
  // The gable to the brook: a man door, the hay door under its hood with the fork's track, the loft window.
  door(b, sh.S, 1.0, 0.03, 0.48, 0.95, DARK_RED, { kind: 'x' })
  const hc = w / 2, hy = 2.95
  b.quad(fp(sh.S, hc - 0.48, hy, 0.012), fp(sh.S, hc + 0.48, hy, 0.012), fp(sh.S, hc + 0.48, hy + 1.05, 0.012), fp(sh.S, hc - 0.48, hy + 1.05, 0.012), '#1a1410', FIN.dark)
  fbox(b, sh.S, hc, hy + 0.1, 0.9, 0.24, 0.2, '#c9a85a', FIN.hay)
  for (const sg of [-1, 1]) door(b, sh.S, hc + sg * 0.73, hy, 0.46, 1.05, DARK_RED, { kind: 'x', trim: null })
  fbox(b, sh.S, hc, hy + 1.1, 2.0, 0.07, 0.03, TRIM, FIN.plain)
  win(b, sh.S, hc, hy + 1.5, 0.3, 0.3, { cols: 2, rows: 2, barn: true })
  for (const s of [w - 1.2, w - 0.55]) win(b, sh.S, s, 1.35, 0.32, 0.32, { cols: 2, rows: 2, barn: true, seed: 1.2 })
  for (const s of [0.9, w - 0.9]) win(b, sh.S, s, 2.42, 0.3, 0.3, { cols: 2, rows: 2, barn: true })
  // the gable up the slope: a second great door, shut, onto the barnyard
  door(b, sh.N, w / 2, 0.04, dw, dh, DARK_RED, { kind: 'x' })
  win(b, sh.N, w / 2, hy + 1.2, 0.3, 0.3, { cols: 2, rows: 2, barn: true })
  for (const s of [0.9, w - 0.9]) win(b, sh.N, s, 2.42, 0.3, 0.3, { cols: 2, rows: 2, barn: true })
  b.push(0, 0, l / 2 + 0.24 + 0.3)
  roof(b, 1.3, 0.62, top - 0.575, 0.575, { color: TIN, fin: FIN.metal, rust: 0.3, eave: 0.02, rake: 0.01, trim: TRIM })
  b.pop()
  b.beam([0, top - 0.12, l / 2], [0, top - 0.12, l / 2 + 0.82], 0.07, 0.09, '#5a4c3e', FIN.wood)
  b.cyl([0, top - 0.17, l / 2 + 0.74], [0, top - 0.75, l / 2 + 0.74], 0.008, 0.008, 4, '#b7a98a', FIN.plain)
  b.box(0, top - 0.8, l / 2 + 0.74, 0.05, 0.1, 0.03, IRON, FIN.plain)
  // The lean-to along the back: the old tie-up, a low roof and a row of small sashes.
  {
    const x0 = w / 2, x1 = w / 2 + M.barn.lean, z0 = -3.4, z1 = 2.6, yh = 2.3, yl = 1.45
    b.quad([x1, -0.4, z1], [x1, -0.4, z0], [x1, yl, z0], [x1, yl, z1], RED, FIN.boards, { ex: [0.94, 0.75], uo: 41 })
    for (const [z, sg] of [[z0, -1], [z1, 1]]) {
      const a: V3 = [sg > 0 ? x0 : x1, -0.4, z], c: V3 = [sg > 0 ? x1 : x0, -0.4, z]
      b.quad(a, c, [c[0], sg > 0 ? yl : yh, z], [a[0], sg > 0 ? yh : yl, z], RED, FIN.boards, { ex: [0.94, 0.85], uo: 47 + sg })
    }
    leanRoof(b, x0, x1, z0, z1, yh + 0.02, yl + 0.02, TIN, FIN.metal, { rust: 0.5 })
    const E: Face = { o: [x1, 0, z1], r: [0, 0, -1], n: [1, 0, 0], len: z1 - z0, h: yl }
    for (let s = 0.7; s < z1 - z0 - 1.4; s += 0.95) win(b, E, s, 0.9, 0.3, 0.26, { cols: 2, rows: 1, barn: true, seed: 1.2 })
    door(b, E, z1 - z0 - 0.7, 0.03, 0.5, 0.95, DARK_RED, { kind: 'x' })
    for (const z of [z0, z1]) b.box(x1 - 0.03, yl / 2 - 0.2, z, 0.09, yl + 0.4, 0.09, TRIM, FIN.plain)
  }
  // The cupola: louvred, capped in tin, the vane on its spire; and rods along the ridge.
  b.box(0, top + 0.02, 0, 0.92, 0.14, 0.92, TRIM, FIN.plain)
  b.box(0, top + 0.4, 0, 0.74, 0.62, 0.74, TRIM, FIN.clapboard, { vo: 0.02 })
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    b.box(nx * 0.37, top + 0.4, nz * 0.37, nz ? 0.46 : 0.012, 0.42, nx ? 0.46 : 0.012, '#3d3a34', FIN.clapboard, { vo: 0.05 })
  }
  b.box(0, top + 0.73, 0, 0.94, 0.05, 0.94, TRIM, FIN.plain)
  const ap: V3 = [0, top + 1.24, 0], e = 0.52, ye = top + 0.75
  b.tri([-e, ye, e], [e, ye, e], ap, TIN, FIN.metal, { ex: 0.9 })
  b.tri([e, ye, e], [e, ye, -e], ap, TIN, FIN.metal, { ex: 0.9 })
  b.tri([e, ye, -e], [-e, ye, -e], ap, TIN, FIN.metal, { ex: 0.9 })
  b.tri([-e, ye, -e], [-e, ye, e], ap, TIN, FIN.metal, { ex: 0.9 })
  b.cyl([0, top + 1.22, 0], [0, top + 1.7, 0], 0.014, 0.008, 5, IRON, FIN.plain)
  b.blob([0, top + 1.36, 0], [0.045, 0.045, 0.045], 2, '#b08a3c', FIN.plain, { detail: 0, rough: 0 })
  m.vanes.push(b.world([0, top + 1.62, 0]))
  for (const z of [-3.4, 3.4]) rod(b, 0, top + 0.06, z)
}

// A potato house: a low frame house shingled grey, concrete below where the doors are, the hill banked to its eaves on
// both sides and round the back. Its doors face down the slope and take a truck. `bank`: how far the earth has been
// banked up, 0..1.
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
  const dw = 0.95, dh = 1.45
  fbox(b, sh.S, w / 2, (dh + 0.12 - 0.5) / 2, w + 0.14, dh + 0.62, 0.1, CONCRETE, FIN.concrete, 0, { ex: [0.85, 1] })
  for (const sg of [-1, 1]) door(b, sh.S, w / 2 + sg * (dw / 2 + 0.01), 0.02, dw, dh, '#5c4d40', { kind: 'x', trim: null })
  fbox(b, sh.S, w / 2, dh + 0.09, dw * 2 + 0.3, 0.12, 0.13, '#4a4038', FIN.wood, 0.06)
  lantern(b, sh.S, w / 2, dh + 0.36)
  win(b, sh.S, w / 2, wall + rise * 0.56, 0.36, 0.32, { cols: 2, rows: 2, barn: true, seed: 0.5 })
  win(b, sh.N, w / 2, wall + rise * 0.5, 0.32, 0.28, { cols: 2, rows: 2, barn: true })
  // wing walls hold back the bank each side of the doors, stepping down to the apron
  for (const sg of [-1, 1]) {
    b.box(sg * (w / 2 + 0.07), 0.3, l / 2 + 0.6, 0.22, 1.6, 1.2, CONCRETE, FIN.concrete, { skip: 'b', uo: sg })
    b.box(sg * (w / 2 + 0.07), 0.05, l / 2 + 1.7, 0.22, 1.0, 1.0, CONCRETE, FIN.concrete, { skip: 'b', uo: sg * 3 })
  }
  b.box(0, -0.1, l / 2 + 1.1, w - 0.08, 0.22, 2.2, CONCRETE, FIN.concrete, { skip: 'b', tint: 0.9 })
  // ventilators along the ridge
  for (const vz of l > 7 ? [-l * 0.3, 0, l * 0.3] : l > 5.5 ? [-l * 0.27, l * 0.2] : [0]) {
    b.box(0, top + 0.13, vz, 0.34, 0.36, 0.34, '#9aa09e', FIN.metal, { skip: 'b', ex: 0.8 })
    b.push(0, 0, vz)
    roof(b, 0.42, 0.42, top + 0.31, 0.15, { color: '#9aa09e', fin: FIN.metal, rust: 0.4, eave: 0.03, rake: 0.03, thick: 0.02 })
    b.pop()
  }
  // barrels on the apron: empties stacked against the wing wall, a few full ones by the other
  const n = o.barrels ?? 0
  for (let k = 0; k < n; k++) {
    const col = k % 4, row = Math.floor(k / 4) % 2, tier = Math.floor(k / 8)
    barrel(b, w / 2 - 0.26 - col * 0.25 - (tier ? 0.12 : 0), -0.002 + tier * 0.295, l / 2 + 0.3 + row * 0.25, 1, 0.86 + 0.28 * ((k * 37) % 10) / 10)
  }
  if (n > 0) for (const [x, z] of [[0.3, 1.25], [0.05, 1.02], [0.42, 1.7]]) barrel(b, -w / 2 + 0.2 + x, -0.002, l / 2 + z, 1, 1, true)

  bankEarth(b, px, pz, w, l, y, wall, bank)
}

// Earth banked against a potato house: to the eaves along both sides and round the back, easing out into the slope,
// grown over with the meadow. `bank`: how far it has been banked up, 0..1.
export function bankEarth(b: Builder, px: number, pz: number, w: number, l: number, y: number, wall: number, bank: number): void {
  if (bank <= 0.02) return
  b.at(0, 0, 0, 0, y)
  const yt = y + (wall + 0.03) * bank, out = 2.7 * (0.45 + 0.55 * bank), zf = pz + l / 2 + 0.12, zb = pz - l / 2
  const ease = (t: number) => t * t * (3 - 2 * t)
  // the line of the eaves, from the front of one side round the back to the front of the other, and the way out from it
  const line: { x: number; z: number; dx: number; dz: number; reach: number; top?: number }[] = []
  for (const sg of [1, -1]) {
    const part: typeof line = []
    part.push({ x: px + sg * (w / 2 + 0.2), z: zf + 2.3, dx: sg, dz: 0, reach: 0.5, top: 0 }, { x: px + sg * (w / 2 + 0.2), z: zf + 1.15, dx: sg, dz: 0, reach: 0.7, top: 0.6 })
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
  const hx = DUFOUR_HOUSE.x, hz = DUFOUR_HOUSE.z, U = M.dufour
  const paint = '#bdb7a8', trim = '#cbc5b6', shingles = '#55565a', rust = '#8b8d88'
  {
    const { w, l, wall, rise } = U.house
    const d = seat(b, hx, hz, w, l)
    foundation(b, w, l, d)
    const sh = shell(b, w, l, wall, rise, paint, FIN.clapboard)
    trims(b, sh, trim)
    roof(b, w, l, wall, rise, { color: shingles, fin: FIN.shingle, eave: 0.16, rake: 0.14, trim, sag: 0.05 })
    for (const s of [0.65, 1.5, l - 1.5, l - 0.65]) win(b, sh.W, s, 0.8, 0.34, 0.54, { cols: 3, rows: 4, seed: s < 2 ? 0.05 : 0.6 })
    door(b, sh.W, l / 2, 0.02, M.houseDoor.w, M.houseDoor.h, '#4c5846', { kind: 'panel', trim })
    b.box(-w / 2 - 0.25, -0.04, 0, 0.5, 0.1, 0.96, '#9b978e', FIN.concrete, { skip: 'b' })
    for (const s of [0.75, w - 0.75]) win(b, sh.S, s, 0.8, 0.34, 0.54, { cols: 3, rows: 4, seed: 0.3 })
    win(b, sh.S, w / 2, wall + 0.62, 0.3, 0.46, { cols: 2, rows: 3, seed: 0.85 })
    win(b, sh.N, w / 2, wall + 0.62, 0.3, 0.46, { cols: 2, rows: 3, seed: 1.4 })
    for (const s of [1.1, l - 1.1]) win(b, sh.E, s, 0.8, 0.34, 0.54, { cols: 3, rows: 4, seed: 0.7 })
    chimney(b, 0, 0, wall + rise - 0.25, wall + rise + 0.6, 0.46, 0.46)
    m.smoke.push(b.world([0, wall + rise + 0.68, 0]))
  }
  {
    const { w, l, wall, rise } = U.ell, cz = hz - U.house.l / 2 - l / 2
    const d = seat(b, hx + 0.2, cz, w, l)
    foundation(b, w, l, d)
    const sh = shell(b, w, l, wall, rise, paint, FIN.clapboard)
    trims(b, sh, trim)
    roof(b, w, l, wall, rise, { color: shingles, fin: FIN.shingle, eave: 0.14, rake: 0.08, trim })
    win(b, sh.W, 0.8, 0.76, 0.32, 0.48, { cols: 2, rows: 3, seed: 0.1 })
    door(b, sh.W, 1.9, 0.02, 0.42, 0.9, '#4c5846', { kind: 'panel', trim })
    lantern(b, sh.W, 2.26, 0.98)
    win(b, sh.E, l / 2, 0.76, 0.32, 0.48, { cols: 2, rows: 3, seed: 0.4 })
  }
  {
    const { w, l, wall, rise } = U.woodshed, cz = hz - U.house.l / 2 - U.ell.l - l / 2
    const d = seat(b, hx + 0.3, cz, w, l)
    foundation(b, w, l, d)
    const sh = shell(b, w, l, wall, rise, OLD_BOARDS, FIN.boards)
    roof(b, w, l, wall, rise, { color: rust, fin: FIN.metal, rust: 0.9, eave: 0.14, rake: 0.1 })
    b.quad(fp(sh.W, 0.5, 0.03, 0.012), fp(sh.W, 1.6, 0.03, 0.012), fp(sh.W, 1.6, 1.0, 0.012), fp(sh.W, 0.5, 1.0, 0.012), '#17130f', FIN.dark)
    cordwood(b, -w / 2 - 0.19, 0, 0.85, 0.8, 0.56)
    cordwood(b, -0.72, 0, -l / 2 - 0.19, 1.0, 0.6, Math.PI / 2, 0.3)
  }
  {
    const bx = DUFOUR_BARN.x, bz = DUFOUR_BARN.z
    const { w, l, wall, rise } = U.barn
    const d = seat(b, bx, bz, w, l)
    foundation(b, w, l, d)
    const sh = shell(b, w, l, wall, rise, OLD_BOARDS, FIN.boards)
    roof(b, w, l, wall, rise, { color: rust, fin: FIN.metal, rust: 0.85, eave: 0.22, rake: 0.2, sag: 0.1 })
    const dw = 1.8, at = 3.4
    b.quad(fp(sh.W, at - dw / 2, 0.02, 0.012), fp(sh.W, at + dw / 2, 0.02, 0.012), fp(sh.W, at + dw / 2, dw + 0.04, 0.012), fp(sh.W, at - dw / 2, dw + 0.04, 0.012), '#1a1410', FIN.dark)
    door(b, sh.W, at - dw * 0.8, 0.04, dw, dw, '#6c655a', { kind: 'x', trim: null })
    fbox(b, sh.W, at - dw * 0.4, dw + 0.12, dw * 2.1, 0.07, 0.06, '#9a9488', FIN.plain)
    win(b, sh.W, l - 0.7, 1.3, 0.3, 0.3, { cols: 2, rows: 2, barn: true })
    const hy = 2.7
    b.quad(fp(sh.S, w / 2 - 0.45, hy, 0.012), fp(sh.S, w / 2 + 0.45, hy, 0.012), fp(sh.S, w / 2 + 0.45, hy + 0.95, 0.012), fp(sh.S, w / 2 - 0.45, hy + 0.95, 0.012), '#1a1410', FIN.dark)
    fbox(b, sh.S, w / 2, hy + 0.08, 0.84, 0.2, 0.16, '#b99a55', FIN.hay)
    door(b, sh.S, w / 2 + 0.92, hy, 0.9, 0.95, '#6c655a', { kind: 'x', trim: null })
    door(b, sh.S, 0.9, 0.03, 0.5, 0.95, '#6c655a', { trim: null })
    // a board or two gone from the gable
    for (const s of [0.6, w - 0.9]) fbox(b, sh.S, s, 1.8 + s * 0.1, 0.11, 1.1, 0.01, '#1f1a15', FIN.dark, 0.004)
    const x1 = w / 2 + U.barn.lean, z0 = -2.2, z1 = 1.4, yh = 1.9, yl = 1.25
    leanRoof(b, w / 2, x1, z0, z1, yh, yl, rust, FIN.metal, { rust: 1 })
    b.quad([x1, -0.4, z1], [x1, -0.4, z0], [x1, yl, z0], [x1, yl, z1], OLD_BOARDS, FIN.boards, { ex: [0.94, 0.75], uo: 5 })
    b.quad([w / 2, -0.4, z1], [x1, -0.4, z1], [x1, yl, z1], [w / 2, yh, z1], OLD_BOARDS, FIN.boards, { uo: 9 })
    b.quad([x1, -0.4, z0], [w / 2, -0.4, z0], [w / 2, yh, z0], [x1, yl, z0], OLD_BOARDS, FIN.boards, { uo: 13 })
    rod(b, 0, wall + rise - 0.04, l / 2 - 0.5)
  }
  const ph = DUFOUR_POTATO_HOUSE, P = U.potatoHouse
  potatoHouse(b, ph.x, ph.z + 2.5 - P.l / 2, P.w, P.l, P.wall, P.rise, { barrels: 9 })
}

function bridge(b: Builder, x: number): void {
  const z = brookZ(x)
  const deck = Math.max(groundY(x, z - 2), WATER_Y + 0.42)
  b.at(x, deck, z, 0, deck - 0.4)
  for (let k = 0; k < 10; k++) b.box(0, 0.02, -1.45 + k * 0.32, 2.1, 0.07, 0.3, k % 2 ? '#7d6a55' : '#6d5b48', FIN.wood, { tint: 0.9 + 0.2 * ((k * 7) % 5) / 5, uo: k })
  for (const dx of [-0.92, 0.92]) {
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
  // its doors stand where its apron is taken from (work.ts): a little down the slope from its own point
  const P = M.potatoHouse
  potatoHouse(b, POTATO_HOUSE.x, POTATO_HOUSE.z + 3.1 - P.l / 2, P.w, P.l, P.wall, P.rise, { barrels: 14 })
  useFrame(DUFOUR)
  dufour(b, m)
  useFrame(TRUE)
  bridge(b, BRIDGE_X.home)
  bridge(b, BRIDGE_X.dufour)
  return m
}
