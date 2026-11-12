// The carpenter's kit: a gabled body with its foundation, roof and trim, windows, doors, chimneys and the small parts
// every building here is put together from. All drawn through a Builder, in the frame it is set to.
import { FIN, type Builder, type Q, type V3 } from './builder.ts'
import { groundY } from './small.ts'

export const TRIM = '#e6e0d0'
export const FIELDSTONE = '#8f8a80'
export const LUMBER = '#d2b47c'
export const IRON = '#2c2b29'

const UP: V3 = [0, 1, 0]

// A wall seen from outside: its foot at the left, the way it runs, the way it faces, how long and how high.
export interface Face { o: V3; r: V3; n: V3; len: number; h: number }

export function fp(f: Face, s: number, y: number, out = 0): V3 {
  return [f.o[0] + f.r[0] * s + f.n[0] * out, f.o[1] + y, f.o[2] + f.r[2] * s + f.n[2] * out]
}

// A board or block set on a wall: its middle `s` along and `y` up, standing `out` clear of the wall.
export function fbox(b: Builder, f: Face, s: number, y: number, w: number, h: number, depth: number, color: string | readonly number[], fin: number, out = 0, o: Q & { skip?: string } = {}): void {
  b.obox(fp(f, s, y, out + depth / 2), f.r, UP, f.n, w / 2, h / 2, depth / 2, color, fin, o)
}

// The highest and lowest ground under a footprint, so a floor can sit level on a slope.
export function level(x: number, z: number, w: number, d: number, ry = 0): { top: number; low: number } {
  const c = Math.cos(ry), s = Math.sin(ry)
  let top = -Infinity, low = Infinity
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const y = groundY(x + (lx * w / 2) * c + (lz * d / 2) * s, z - (lx * w / 2) * s + (lz * d / 2) * c)
    top = Math.max(top, y)
    low = Math.min(low, y)
  }
  return { top, low }
}

export interface Shell { w: number; l: number; wall: number; rise: number; W: Face; E: Face; S: Face; N: Face; top: number }

// The faces of a body `w` across and `l` along its ridge (the ridge runs along z), floor at 0.
export function faces(w: number, l: number, wall: number, rise: number): Shell {
  return {
    w, l, wall, rise, top: wall + rise,
    W: { o: [-w / 2, 0, -l / 2], r: [0, 0, 1], n: [-1, 0, 0], len: l, h: wall },
    E: { o: [w / 2, 0, l / 2], r: [0, 0, -1], n: [1, 0, 0], len: l, h: wall },
    S: { o: [-w / 2, 0, l / 2], r: [1, 0, 0], n: [0, 0, 1], len: w, h: wall },
    N: { o: [w / 2, 0, -l / 2], r: [-1, 0, 0], n: [0, 0, -1], len: w, h: wall },
  }
}

export interface ShellO { gable?: string; gableFin?: number; skip?: string; base?: number; wear?: number }

// Walls and gables. `skip`: faces left open, any of 'W', 'E', 'S', 'N'. `base`: where the walls start, if not the floor.
export function shell(b: Builder, w: number, l: number, wall: number, rise: number, color: string, fin: number, o: ShellO = {}): Shell {
  const sh = faces(w, l, wall, rise)
  const skip = o.skip ?? '', y0 = o.base ?? 0
  const side = (f: Face, uo: number) => b.quad(fp(f, 0, y0), fp(f, f.len, y0), fp(f, f.len, wall), fp(f, 0, wall), color, fin, { ex: [0.94, 0.72], uo })
  if (!skip.includes('W')) side(sh.W, 3.1)
  if (!skip.includes('E')) side(sh.E, 11.7)
  for (const [name, f, uo] of [['S', sh.S, 23.3], ['N', sh.N, 31.9]] as [string, Face, number][]) {
    if (skip.includes(name)) continue
    b.quad(fp(f, 0, y0), fp(f, f.len, y0), fp(f, f.len, wall), fp(f, 0, wall), color, fin, { ex: [0.94, 0.9], uo })
    if (rise > 0) b.tri(fp(f, 0, wall), fp(f, f.len, wall), fp(f, f.len / 2, wall + rise), o.gable ?? color, o.gableFin ?? fin, { ex: [0.9, 0.8], uo })
  }
  return sh
}

// Ground made level for a building on a slope: a bank with its top at the floor and turfed sides easing out to the
// ground. `ramp`: the side toward +z falls away gently, as trodden earth, for wheels.
export function pad(b: Builder, w: number, d: number, depth: number, ramp = false, grow = 0.3): void {
  const hx = w / 2 + grow, hz = d / 2 + grow, y1 = -0.02, y0 = -depth - 0.05
  const sx = hx + depth * 1.3, zb = -hz - depth * 0.8, zf = hz + (ramp ? Math.max(1.5, depth * 3) : depth * 1.4)
  const earth = '#8a7158'
  b.quad([-hx, y1, hz], [hx, y1, hz], [hx, y1, -hz], [-hx, y1, -hz], earth, FIN.earth)
  b.quad([-sx, y0, zf], [sx, y0, zf], [hx, y1, hz], [-hx, y1, hz], ramp ? earth : '#ffffff', ramp ? FIN.earth : FIN.turf)
  b.quad([sx, y0, zb], [-sx, y0, zb], [-hx, y1, -hz], [hx, y1, -hz], '#ffffff', FIN.turf)
  b.quad([sx, y0, zf], [sx, y0, zb], [hx, y1, -hz], [hx, y1, hz], '#ffffff', FIN.turf)
  b.quad([-sx, y0, zb], [-sx, y0, zf], [-hx, y1, hz], [-hx, y1, -hz], '#ffffff', FIN.turf)
}

// Stone under the sills, showing more on the downhill side.
export function foundation(b: Builder, w: number, l: number, depth: number, color = FIELDSTONE, fin: number = FIN.stone, out = 0.05): void {
  b.box(0, -depth / 2 + 0.03, 0, w + out * 2, depth + 0.06, l + out * 2, color, fin, { skip: 'b', ex: [0.8, 1] })
}

export interface RoofO { color: string; fin: number; eave?: number; rake?: number; thick?: number; rust?: number; sag?: number; trim?: string | null; cap?: string }

// A gable roof over a body: two slabs that overhang eaves and rakes, shaded underneath, with a cap along the ridge.
// `rust` (metal): 0 sound .. 1 far gone. `sag`: how far an old ridge has settled in its middle.
export function roof(b: Builder, w: number, l: number, wall: number, rise: number, o: RoofO): void {
  const eave = o.eave ?? 0.2, rake = o.rake ?? 0.16, thick = o.thick ?? 0.06, sag = o.sag ?? 0
  const ex = o.fin === FIN.metal ? 1 - 0.5 * (o.rust ?? 0) : 1
  const half = w / 2, run = Math.hypot(half, rise), nx = rise / run, ny = half / run
  const xe = half + eave, ye = wall - (eave * rise) / half
  const z0 = -l / 2 - rake, z1 = l / 2 + rake
  const segs = sag > 0 ? 6 : 1
  const dip = (t: number) => sag * (1 - (2 * t - 1) * (2 * t - 1))
  for (const sg of [-1, 1]) {
    for (let k = 0; k < segs; k++) {
      const ta = k / segs, tb = (k + 1) / segs
      const za = z0 + (z1 - z0) * ta, zb = z0 + (z1 - z0) * tb, da = dip(ta), db = dip(tb)
      // foot at the eave, head at the ridge; `near` and `far` ends in z chosen so the top faces out
      const zf = sg > 0 ? zb : za, zn = sg > 0 ? za : zb, df = sg > 0 ? db : da, dn = sg > 0 ? da : db
      const top = (x: number, y: number, z: number, d: number): V3 => [sg * (x + nx * thick), y + ny * thick - d, z]
      const und = (x: number, y: number, z: number, d: number): V3 => [sg * x, y - d, z]
      b.roofing(true).quad(top(xe, ye, zf, df * 0.4), top(xe, ye, zn, dn * 0.4), top(0, wall + rise, zn, dn), top(0, wall + rise, zf, df), o.color, o.fin, { ex, uo: sg * 7.3 + za })
      b.roofing(false)
      b.quad(und(xe, ye, zn, dn * 0.4), und(xe, ye, zf, df * 0.4), und(0, wall + rise, zf, df), und(0, wall + rise, zn, dn), o.trim ?? '#8d8474', FIN.wood, { ex: 0.5 })
      // the eave's edge
      b.quad(und(xe, ye, zf, df * 0.4), und(xe, ye, zn, dn * 0.4), top(xe, ye, zn, dn * 0.4), top(xe, ye, zf, df * 0.4), o.trim ?? o.color, FIN.plain, { ex: 0.9 })
    }
    // the rakes' edges
    for (const [z, d] of [[z0, 1], [z1, -1]]) {
      const a: V3 = [sg * xe, ye, z], c: V3 = [0, wall + rise, z]
      const at: V3 = [sg * (xe + nx * thick), ye + ny * thick, z], ct: V3 = [sg * nx * thick, wall + rise + ny * thick, z]
      if (sg * d > 0) b.quad(a, c, ct, at, o.trim ?? o.color, FIN.plain)
      else b.quad(c, a, at, ct, o.trim ?? o.color, FIN.plain)
    }
  }
  for (let k = 0; k < segs; k++) {
    const ta = k / segs, tb = (k + 1) / segs, yc = wall + rise + ny * thick + 0.012
    b.beam([0, yc - dip(ta), z0 - 0.01 + (z1 - z0 + 0.02) * ta], [0, yc - dip(tb), z0 - 0.01 + (z1 - z0 + 0.02) * tb], 0.13 + 2 * nx * thick, 0.045, o.cap ?? o.color, o.fin === FIN.metal ? FIN.plain : FIN.wood, { tint: 0.86 })
  }
  if (o.trim) {
    // rake boards under the roof's edge on each gable
    for (const z of [-l / 2 - 0.012, l / 2 + 0.012]) for (const sg of [-1, 1]) {
      b.beam([sg * (xe - 0.02), ye - 0.045, z], [0, wall + rise - 0.045, z], 0.03, 0.11, o.trim, FIN.plain)
    }
  }
}

// A single slope: from a high edge at y1 down to a low edge at y0, over a rectangle from the wall at x0 out to x1
// (x1 the low side), z0 to z1.
export function leanRoof(b: Builder, x0: number, x1: number, z0: number, z1: number, y1: number, y0: number, color: string, fin: number, o: { thick?: number; rust?: number; over?: number } = {}): void {
  const thick = o.thick ?? 0.05, over = o.over ?? 0.12
  const sg = x1 > x0 ? 1 : -1
  const run = Math.abs(x1 - x0), sl = (y1 - y0) / run
  const xl = x1 + sg * over, yl = y0 - sl * over
  const za = z0 - over, zb = z1 + over
  const ex = fin === FIN.metal ? 1 - 0.5 * (o.rust ?? 0) : 1
  const A: V3 = [xl, yl + thick, sg > 0 ? zb : za], B: V3 = [xl, yl + thick, sg > 0 ? za : zb]
  const C: V3 = [x0, y1 + thick, sg > 0 ? za : zb], D: V3 = [x0, y1 + thick, sg > 0 ? zb : za]
  b.roofing(true).quad(A, B, C, D, color, fin, { ex })
  b.roofing(false)
  const lo = (p: V3): V3 => [p[0], p[1] - thick, p[2]]
  b.quad(lo(B), lo(A), lo(D), lo(C), '#8d8474', FIN.wood, { ex: 0.5 })
  b.quad(lo(A), lo(B), B, A, color, FIN.plain, { ex: 0.9 })
  b.quad(lo(D), lo(A), A, D, color, FIN.plain)
  b.quad(lo(B), lo(C), C, B, color, FIN.plain)
}

// Corner boards, a board under each eave and one along the foot of the walls.
export function trims(b: Builder, sh: Shell, color = TRIM, o: { frieze?: boolean; water?: boolean; wide?: number } = {}): void {
  const { w, l, wall } = sh, t = o.wide ?? 0.09
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - t / 2 + 0.022), wall / 2, sz * (l / 2 - t / 2 + 0.022), t, wall, t, color, FIN.plain)
  if (o.frieze ?? true) for (const f of [sh.W, sh.E]) fbox(b, f, f.len / 2, wall - 0.065, f.len, 0.13, 0.025, color, FIN.plain)
  if (o.water ?? true) b.box(0, 0.045, 0, w + 0.05, 0.09, l + 0.05, color, FIN.plain, { skip: 'b' })
}

export interface WinO { cols?: number; rows?: number; seed?: number; shutters?: string; trim?: string; barn?: boolean; plain?: boolean }

// A window on a wall: casing, sill, glass with its bars, and shutters if the house has them. `seed`: how soon its lamp
// is lit as the day goes (0 first, 1 last, above 1 never).
export function win(b: Builder, f: Face, s: number, y: number, w: number, h: number, o: WinO = {}): void {
  const trim = o.trim ?? TRIM, c = o.barn ? 0.045 : 0.055
  if (!o.plain) {
    fbox(b, f, s, y + h / 2 + c / 2, w + c * 2 + 0.03, c, 0.045, trim, FIN.plain)
    fbox(b, f, s - w / 2 - c / 2, y, c, h, 0.035, trim, FIN.plain)
    fbox(b, f, s + w / 2 + c / 2, y, c, h, 0.035, trim, FIN.plain)
    fbox(b, f, s, y - h / 2 - 0.018, w + c * 2 + 0.05, 0.036, 0.07, trim, FIN.plain)
  }
  b.panel(fp(f, s - w / 2, y - h / 2, 0.012), fp(f, s + w / 2, y - h / 2, 0.012), fp(f, s + w / 2, y + h / 2, 0.012), fp(f, s - w / 2, y + h / 2, 0.012),
    [o.cols ?? 2, o.rows ?? 2, o.seed ?? 2], FIN.glass, o.barn ? 1 : 0)
  if (o.shutters) {
    const sw = w * 0.5
    for (const sg of [-1, 1]) fbox(b, f, s + sg * (w / 2 + c + sw / 2 + 0.01), y, sw, h + 0.02, 0.022, o.shutters, FIN.clapboard, 0, { vo: 0.03 })
  }
}

export interface DoorO { kind?: 'plank' | 'x' | 'panel'; trim?: string | null; fin?: number; ajar?: number }

// A door with its foot at y0: planks, planks braced with a white Z and X, or a panelled house door with a light over it.
export function door(b: Builder, f: Face, s: number, y0: number, w: number, h: number, color: string, o: DoorO = {}): void {
  const kind = o.kind ?? 'plank', trim = o.trim === undefined ? TRIM : o.trim
  fbox(b, f, s, y0 + h / 2, w, h, 0.045, color, o.fin ?? (kind === 'panel' ? FIN.plain : FIN.boards), 0, { ex: [0.86, 0.96] })
  if (trim) {
    const c = kind === 'panel' ? 0.06 : 0.075
    fbox(b, f, s, y0 + h + c / 2, w + c * 2, c, 0.055, trim, FIN.plain)
    for (const sg of [-1, 1]) fbox(b, f, s + sg * (w / 2 + c / 2), y0 + h / 2, c, h, 0.055, trim, FIN.plain)
  }
  if (kind === 'x') {
    const t = trim ?? TRIM, r = 0.07, out = 0.05
    for (const yy of [y0 + r / 2 + 0.02, y0 + h * 0.5, y0 + h - r / 2 - 0.02]) fbox(b, f, s, yy, w - 0.04, r, 0.02, t, FIN.plain, 0.045)
    for (const sg of [-1, 1]) fbox(b, f, s + sg * (w / 2 - r / 2 - 0.02), y0 + h / 2, r, h - 0.04, 0.02, t, FIN.plain, 0.045)
    for (const [ya, yb] of [[y0 + 0.06, y0 + h * 0.5 - 0.03], [y0 + h * 0.5 + 0.03, y0 + h - 0.06]]) {
      b.beam(fp(f, s - w / 2 + 0.06, ya, out + 0.012), fp(f, s + w / 2 - 0.06, yb, out + 0.012), 0.02, r * 0.9, t, FIN.plain)
      b.beam(fp(f, s - w / 2 + 0.06, yb, out + 0.012), fp(f, s + w / 2 - 0.06, ya, out + 0.012), 0.02, r * 0.9, t, FIN.plain)
    }
  } else if (kind === 'panel') {
    // four panels let in, a brass knob
    for (const [px, py, ph] of [[-0.24, 0.3, 0.34], [0.24, 0.3, 0.34], [-0.24, 0.72, 0.3], [0.24, 0.72, 0.3]]) {
      fbox(b, f, s + px * w, y0 + py * h, w * 0.34, ph * h, 0.01, color, FIN.plain, 0.046, { tint: 0.72 })
    }
    fbox(b, f, s + w * 0.36, y0 + h * 0.48, 0.03, 0.03, 0.03, '#b08a3c', FIN.plain, 0.05)
  } else {
    // strap hinges and a latch
    for (const yy of [y0 + h * 0.2, y0 + h * 0.8]) fbox(b, f, s - w * 0.22, yy, w * 0.5, 0.03, 0.012, IRON, FIN.plain, 0.046)
  }
}

// A lantern on a bracket by a door: the first light lit when the day goes.
export function lantern(b: Builder, f: Face, s: number, y: number): void {
  fbox(b, f, s, y + 0.075, 0.025, 0.025, 0.15, IRON, FIN.plain)
  b.lathe(fp(f, s, y + 0.055, 0.13), [[0.065, 0], [0.012, 0.045]], 6, IRON, FIN.plain)
  fbox(b, f, s, y - 0.058, 0.07, 0.014, 0.07, IRON, FIN.plain, 0.095)
  const h = 0.05, w = 0.03, o0 = 0.1, o1 = 0.16, lit = [1, 1, 0]
  b.panel(fp(f, s - w, y - h, o1), fp(f, s + w, y - h, o1), fp(f, s + w, y + h, o1), fp(f, s - w, y + h, o1), lit, FIN.glass)
  b.panel(fp(f, s + w, y - h, o1), fp(f, s + w, y - h, o0), fp(f, s + w, y + h, o0), fp(f, s + w, y + h, o1), lit, FIN.glass)
  b.panel(fp(f, s - w, y - h, o0), fp(f, s - w, y - h, o1), fp(f, s - w, y + h, o1), fp(f, s - w, y + h, o0), lit, FIN.glass)
}

// A brick stack from y0 to `top`, corbelled out under its cap.
export function chimney(b: Builder, x: number, z: number, y0: number, top: number, w: number, d: number, color = '#7a4636'): void {
  b.box(x, (y0 + top) / 2, z, w, top - y0, d, color, FIN.brick, { skip: 'b', ex: [0.8, 1] })
  b.box(x, top - 0.1, z, w + 0.06, 0.06, d + 0.06, color, FIN.brick, { tint: 0.9 })
  b.box(x, top - 0.04, z, w + 0.1, 0.05, d + 0.1, color, FIN.brick, { tint: 0.82 })
  b.box(x, top + 0.01, z, w - 0.12, 0.06, d - 0.12, '#1a1817', FIN.plain, { skip: 'b' })
  b.box(x, y0 + 0.03, z, w + 0.07, 0.05, d + 0.07, '#5e6266', FIN.plain, { skip: 'b' })
}

// A lightning rod with its glass ball.
export function rod(b: Builder, x: number, y: number, z: number, h = 0.46): void {
  b.cyl([x, y, z], [x, y + h, z], 0.012, 0.006, 5, IRON, FIN.plain)
  b.blob([x, y + h * 0.5, z], [0.035, 0.035, 0.035], 3, '#5d7f8c', FIN.plain, { detail: 0, rough: 0 })
}

// A stovepipe with its hat.
export function stovepipe(b: Builder, x: number, y0: number, z: number, h: number): V3 {
  b.cyl([x, y0, z], [x, y0 + h, z], 0.045, 0.045, 8, '#3a3b3c', FIN.metal, { ex: 0.75 })
  b.lathe([x, y0 + h + 0.04, z], [[0.09, 0], [0.0, 0.07]], 8, '#35363a', FIN.plain)
  b.cyl([x, y0 + h, z], [x, y0 + h + 0.045, z], 0.012, 0.012, 4, IRON, FIN.plain)
  return [x, y0 + h + 0.12, z]
}

// A stack of sawn boards and timbers, ends showing.
export function lumber(b: Builder, x: number, y: number, z: number, w: number, h: number, l: number, ry = 0): void {
  if (h < 0.02 || w < 0.05) return
  const layers = Math.max(1, Math.round(h / 0.07))
  for (let k = 0; k < layers; k++) {
    const jog = ((k * 37) % 7 - 3) * 0.012
    b.box(x + jog * Math.cos(ry), y + (k + 0.5) * (h / layers), z - jog * Math.sin(ry), w - 0.03 * (k % 2), h / layers - 0.012, l - 0.08 * ((k * 3) % 4) / 3, LUMBER, FIN.boards, { ry, tint: 0.9 + 0.2 * (((k * 53) % 10) / 10), uo: k * 1.3 })
  }
  for (const sg of [-1, 1]) b.box(x + sg * w * 0.3, y - 0.03, z, 0.07, 0.06, l * 0.3, '#7d6648', FIN.wood, { ry: ry + Math.PI / 2 })
}

// A heap of field stone: `n` stones tipped in a mound `r` across.
export function stoneHeap(b: Builder, x: number, y: number, z: number, r: number, n: number, seed: number): void {
  const greys = ['#9a968c', '#aaa59a', '#827e76', '#a39c8e', '#8d867a', '#b3aea0']
  for (let k = 0; k < n; k++) {
    const a = k * 2.399963 + seed, d = r * Math.sqrt((k + 0.5) / n) * 0.92
    const hgt = Math.max(0, 1 - (d / r) * (d / r)) * r * 0.55
    const s = 0.09 + 0.09 * (((k * 71 + seed * 13) % 10) / 10)
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d
    b.blob([px, y + s * 0.4, pz], [s * 1.25, s * 0.8, s * 1.1], k + seed * 5, greys[(k + seed) % greys.length], FIN.plain, { detail: 0, rough: 0.34, facets: true, ex: 0.92 })
    if (hgt > s * 1.2) b.blob([px * 0.6 + x * 0.4, y + hgt * 0.85, pz * 0.6 + z * 0.4], [s * 1.2, s * 0.8, s * 1.2], k * 3 + seed, greys[(k + 2 + seed) % greys.length], FIN.plain, { detail: 0, rough: 0.34, facets: true })
  }
}

// A load tipped from a cart: a low cone of earth or gravel, a little out of round.
export function tipped(b: Builder, x: number, y: number, z: number, r: number, color: string, fin: number, seed = 0): void {
  const h = r * 0.52, lean = 0.12 * r
  const dx = Math.cos(seed * 2.4) * lean, dz = Math.sin(seed * 2.4) * lean
  b.push(x, y - 0.03, z, seed * 1.3)
  b.lathe([0, 0, 0], [[r, 0], [r * 0.74, h * 0.34], [r * 0.4, h * 0.76], [r * 0.14, h * 0.96], [0, h]], 9, color, fin, { uo: seed * 3.1 })
  b.lathe([dx * 4, 0, dz * 4], [[r * 0.5, 0], [r * 0.2, h * 0.4], [0, h * 0.5]], 7, color, fin, { uo: seed * 5.3, tint: 0.94 })
  b.pop()
}

// A barrel: staves bulging between hoops, the head let in a little.
export function barrel(b: Builder, x: number, y: number, z: number, s = 1, tint = 1, full = false): void {
  const r = 0.115 * s, h = 0.3 * s
  b.lathe([x, y, z], [[r * 0.84, 0], [r * 0.98, h * 0.22], [r * 1.04, h * 0.5], [r * 0.98, h * 0.78], [r * 0.84, h]], 9, '#8d7352', FIN.wood, { tint, uo: x * 3.1 })
  for (const t of [0.14, 0.86]) b.lathe([x, y + h * t - 0.008 * s, z], [[r * 0.94, 0], [r * 0.955, 0.016 * s]], 9, '#4a453e', FIN.plain)
  if (full) b.blob([x, y + h * 0.97, z], [r * 0.8, h * 0.1, r * 0.8], Math.round(x * 91 + z * 57), '#b89466', FIN.earth, { detail: 0, rough: 0.5, facets: true })
  else b.lathe([x, y + h * 0.93, z], [[r * 0.84, 0], [0, 0]], 9, '#7a6447', FIN.wood)
}

// A wheel on its side axis: a tyre and a hub, standing at (x, z) with its axle along `ax`.
export function wheel(b: Builder, c: V3, ax: V3, r: number, wide: number, hub: string, sides = 10): void {
  const a: V3 = [c[0] - ax[0] * wide / 2, c[1] - ax[1] * wide / 2, c[2] - ax[2] * wide / 2], e: V3 = [c[0] + ax[0] * wide / 2, c[1] + ax[1] * wide / 2, c[2] + ax[2] * wide / 2]
  b.cyl(a, e, r, r, Math.max(sides, 14), '#1e1e1c', FIN.plain, { cap: 'ab', ex: 0.9 })
  const a2: V3 = [c[0] - ax[0] * (wide / 2 + 0.006), c[1], c[2] - ax[2] * (wide / 2 + 0.006)], e2: V3 = [c[0] + ax[0] * (wide / 2 + 0.006), c[1], c[2] + ax[2] * (wide / 2 + 0.006)]
  b.cyl(a2, e2, r * 0.55, r * 0.55, 14, hub, FIN.plain, { cap: 'ab' })
}

export { groundY, UP }
