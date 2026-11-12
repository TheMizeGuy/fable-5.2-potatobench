// Everything made by hand is drawn from one kind of geometry and one material. A Builder lays out walls, roofs, posts,
// barrels and stones as plain quads and solids, each carrying a colour, a finish (clapboard, boards, shingle, stone,
// glass ...) and where it is on its own surface; the material paints the finish from those, so a whole farmstead is a
// handful of draws and no texture is fetched.
import {
  BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, Matrix4, Mesh, MeshStandardMaterial, Vector3, type MeshDepthMaterial,
} from 'three'
import { hash2 } from './noise.ts'
import { NOW, S } from './scale.ts'
import { depthFor, patch, snowRimeAt } from './shaders.ts'

export type V3 = [number, number, number]

export const FIN = {
  plain: 0, clapboard: 1, boards: 2, shingle: 3, metal: 4, brick: 5, stone: 6, glass: 7, concrete: 8, earth: 9, cloth: 10,
  endgrain: 11, hay: 12, leaf: 13, wood: 14, gravel: 15, dark: 16, turf: 17, cord: 18,
} as const

// ex: for most finishes how open the surface is to the sky (1 open, less in corners and under eaves), at the bottom and
// the top of the piece; a finish may read it as something of its own (glass: the kind of window).
export interface Q { ex?: number | [number, number]; uo?: number; vo?: number; flex?: number | [number, number]; tint?: number }

const RGB = new Map<string, number[]>()
const tmpColor = new Color()
export function rgb(c: string | readonly number[], tint = 1): readonly number[] {
  if (typeof c !== 'string') return tint === 1 ? c : [c[0] * tint, c[1] * tint, c[2] * tint]
  let v = RGB.get(c)
  if (!v) {
    tmpColor.set(c)
    v = [tmpColor.r, tmpColor.g, tmpColor.b]
    RGB.set(c, v)
  }
  return tint === 1 ? v : [v[0] * tint, v[1] * tint, v[2] * tint]
}

const ICO: number[][] = []
function ico(detail: number): number[] {
  if (!ICO[detail]) {
    const g = new IcosahedronGeometry(1, detail)
    ICO[detail] = Array.from(g.getAttribute('position').array as Float32Array)
    g.dispose()
  }
  return ICO[detail]
}

const UP: V3 = [0, 1, 0]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

export class Builder {
  // Two lots of geometry: everything, and the tops of roofs. A roof under a low sun is a slope the light rakes along,
  // which a shadow map of any size stripes; roofs are drawn apart so they can throw shadow without taking it.
  private lots: Lot[] = [lot(), lot()]
  private at_ = 0
  private get pos(): number[] { return this.lots[this.at_].pos }
  private get nrm(): number[] { return this.lots[this.at_].nrm }
  private get col(): number[] { return this.lots[this.at_].col }
  private get uvh(): number[] { return this.lots[this.at_].uvh }
  private get fin(): number[] { return this.lots[this.at_].fin }
  private get idx(): number[] { return this.lots[this.at_].idx }
  private m = new Matrix4()
  private t = new Matrix4()
  private stack: Matrix4[] = []
  private v = new Vector3()
  private n = new Vector3()
  // The level heights above ground are measured from, for what the weather does to the foot of a wall.
  ground = 0

  get triangles(): number { return (this.lots[0].idx.length + this.lots[1].idx.length) / 3 }
  get empty(): boolean { return this.lots[0].idx.length + this.lots[1].idx.length === 0 }

  // What is drawn from here on is the top of a roof (or is not any more).
  roofing(on: boolean): this {
    this.at_ = on ? 1 : 0
    return this
  }

  // Draw from here on at a place in the world, turned about the vertical.
  at(x: number, y: number, z: number, ry = 0, ground = y): this {
    this.m.makeRotationY(ry).setPosition(x, y, z)
    this.ground = ground
    return this
  }

  push(x: number, y: number, z: number, ry = 0): this {
    this.stack.push(this.m.clone())
    this.m.multiply(this.t.makeRotationY(ry).setPosition(x, y, z))
    return this
  }

  pop(): this {
    this.m.copy(this.stack.pop()!)
    return this
  }

  // A point of the current drawing in the world, in metres.
  world(p: V3): V3 {
    const w = this.v.set(p[0], p[1], p[2]).applyMatrix4(this.m)
    return [NOW.x + S * w.x, S * w.y, NOW.z + S * w.z]
  }

  // The same point in the small units of the frame being drawn in.
  local(p: V3): V3 {
    const w = this.v.set(p[0], p[1], p[2]).applyMatrix4(this.m)
    return [w.x, w.y, w.z]
  }

  vert(p: V3, n: V3, c: readonly number[], u: number, v: number, fin: number, ex = 1, flex = 0): number {
    const w = this.v.set(p[0], p[1], p[2]).applyMatrix4(this.m)
    this.pos.push(NOW.x + S * w.x, S * w.y, NOW.z + S * w.z)
    this.uvh.push(u, v, w.y - this.ground)
    const d = this.n.set(n[0], n[1], n[2]).transformDirection(this.m)
    this.nrm.push(d.x, d.y, d.z)
    this.col.push(c[0], c[1], c[2])
    this.fin.push(fin, ex, flex)
    return this.pos.length / 3 - 1
  }

  // A flat four-sided piece seen from the side a, b, c, d run anticlockwise: a and b its foot, d and c its head.
  // On an upright piece the finish is laid by height; on a sloping one, up the slope from a-b.
  quad(a: V3, b: V3, c: V3, d: V3, color: string | readonly number[], fin: number, o: Q = {}): void {
    const u = sub(b, a), w = sub(d, a)
    const n = unit(cross(u, w))
    const ul = Math.hypot(u[0], u[1], u[2]) || 1
    const uh: V3 = [u[0] / ul, u[1] / ul, u[2] / ul]
    const vh = cross(n, uh)
    const upright = Math.abs(n[1]) < 0.5
    const uo = o.uo ?? 0, vo = o.vo ?? 0
    const ex = o.ex ?? 1, ex0 = typeof ex === 'number' ? ex : ex[0], ex1 = typeof ex === 'number' ? ex : ex[1]
    const fx = o.flex ?? 0, fx0 = typeof fx === 'number' ? fx : fx[0], fx1 = typeof fx === 'number' ? fx : fx[1]
    const col = rgb(color, o.tint ?? 1)
    const put = (p: V3, e: number, f: number): number => {
      const q = sub(p, a)
      const pu = q[0] * uh[0] + q[1] * uh[1] + q[2] * uh[2] + uo
      const pv = upright ? p[1] + vo : q[0] * vh[0] + q[1] * vh[1] + q[2] * vh[2] + vo
      return this.vert(p, n, col, pu, pv, fin, e, f)
    }
    const i0 = put(a, ex0, fx0), i1 = put(b, ex0, fx0), i2 = put(c, ex1, fx1), i3 = put(d, ex1, fx1)
    this.idx.push(i0, i1, i2, i0, i2, i3)
  }

  // A sheet through a grid of points (rows of equal length), shaded smooth and facing up: banked earth, a heap, a tarpaulin.
  surface(rows: V3[][], color: string | readonly number[], fin: number, o: Q = {}): void {
    const nr = rows.length, nc = rows[0].length
    const col = rgb(color, o.tint ?? 1)
    const ex = o.ex ?? 1, e0 = typeof ex === 'number' ? ex : ex[0]
    const base = this.pos.length / 3
    const at = (i: number, j: number) => rows[Math.max(0, Math.min(nr - 1, i))][Math.max(0, Math.min(nc - 1, j))]
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
      let n = unit(cross(sub(at(i + 1, j), at(i - 1, j)), sub(at(i, j + 1), at(i, j - 1))))
      if (n[1] < 0) n = [-n[0], -n[1], -n[2]]
      const p = rows[i][j]
      this.vert(p, n, col, p[0] + (o.uo ?? 0), p[2] + (o.vo ?? 0), fin, e0)
    }
    for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
      const a = base + i * nc + j, c = a + 1, d = a + nc, e = d + 1
      const pa = rows[i][j], pc = rows[i][j + 1], pd = rows[i + 1][j]
      const up = cross(sub(pc, pa), sub(pd, pa))[1] > 0
      if (up) this.idx.push(a, c, e, a, e, d)
      else this.idx.push(a, e, c, a, d, e)
    }
  }

  // A spray of leaves: a small diamond seen from both sides, lit as if it faced along n (the way out of its crown).
  card(c: V3, u: V3, v: V3, n: V3, color: string | readonly number[], fin: number, ex = 1, tint = 1): void {
    const col = rgb(color, tint), nn = unit(n)
    const i0 = this.vert([c[0] - u[0], c[1] - u[1], c[2] - u[2]], nn, col, -1, 0, fin, ex)
    const i1 = this.vert([c[0] - v[0], c[1] - v[1], c[2] - v[2]], nn, col, 0, -1, fin, ex)
    const i2 = this.vert([c[0] + u[0], c[1] + u[1], c[2] + u[2]], nn, col, 1, 0, fin, ex)
    const i3 = this.vert([c[0] + v[0], c[1] + v[1], c[2] + v[2]], nn, col, 0, 1, fin, ex)
    this.idx.push(i0, i1, i2, i0, i2, i3, i0, i2, i1, i0, i3, i2)
  }

  // A pane: the same piece laid with its own unit square, and three numbers in place of a colour.
  panel(a: V3, b: V3, c: V3, d: V3, data: readonly number[], fin: number, ex = 1): void {
    const n = unit(cross(sub(b, a), sub(d, a)))
    const i0 = this.vert(a, n, data, 0, 0, fin, ex), i1 = this.vert(b, n, data, 1, 0, fin, ex)
    const i2 = this.vert(c, n, data, 1, 1, fin, ex), i3 = this.vert(d, n, data, 0, 1, fin, ex)
    this.idx.push(i0, i1, i2, i0, i2, i3)
  }

  tri(a: V3, b: V3, c: V3, color: string | readonly number[], fin: number, o: Q = {}): void {
    const u = sub(b, a), w = sub(c, a)
    const n = unit(cross(u, w))
    const ul = Math.hypot(u[0], u[1], u[2]) || 1
    const uh: V3 = [u[0] / ul, u[1] / ul, u[2] / ul]
    const vh = cross(n, uh)
    const upright = Math.abs(n[1]) < 0.5
    const uo = o.uo ?? 0, vo = o.vo ?? 0
    const ex = o.ex ?? 1, ex0 = typeof ex === 'number' ? ex : ex[0], ex1 = typeof ex === 'number' ? ex : ex[1]
    const col = rgb(color, o.tint ?? 1)
    const put = (p: V3, e: number): number => {
      const q = sub(p, a)
      const pu = q[0] * uh[0] + q[1] * uh[1] + q[2] * uh[2] + uo
      const pv = upright ? p[1] + vo : q[0] * vh[0] + q[1] * vh[1] + q[2] * vh[2] + vo
      return this.vert(p, n, col, pu, pv, fin, e)
    }
    this.idx.push(put(a, ex0), put(b, ex0), put(c, ex1))
  }

  // A box with axes of its own: half sizes along ax, ay (up) and az. `skip` names faces left out: any of
  // 'f' (+az), 'k' (-az), 'r' (+ax), 'l' (-ax), 't' (+ay), 'b' (-ay).
  obox(c: V3, ax: V3, ay: V3, az: V3, hx: number, hy: number, hz: number, color: string | readonly number[], fin: number, o: Q & { skip?: string } = {}): void {
    const p = (sx: number, sy: number, sz: number): V3 => [
      c[0] + ax[0] * hx * sx + ay[0] * hy * sy + az[0] * hz * sz,
      c[1] + ax[1] * hx * sx + ay[1] * hy * sy + az[1] * hz * sz,
      c[2] + ax[2] * hx * sx + ay[2] * hy * sy + az[2] * hz * sz,
    ]
    const skip = o.skip ?? ''
    const ex = o.ex ?? 1, flat = typeof ex === 'number' ? ex : (ex[0] + ex[1]) / 2
    if (!skip.includes('f')) this.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), color, fin, o)
    if (!skip.includes('k')) this.quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), color, fin, o)
    if (!skip.includes('r')) this.quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), color, fin, o)
    if (!skip.includes('l')) this.quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), color, fin, o)
    if (!skip.includes('t')) this.quad(p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1), color, fin, { ...o, ex: typeof ex === 'number' ? ex : ex[1] })
    if (!skip.includes('b')) this.quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), color, fin, { ...o, ex: flat * 0.6 })
  }

  // A box by its middle and its sizes, turned about the vertical.
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string | readonly number[], fin: number, o: Q & { skip?: string; ry?: number } = {}): void {
    const r = o.ry ?? 0, c = Math.cos(r), s = Math.sin(r)
    this.obox([x, y, z], [c, 0, -s], UP, [s, 0, c], w / 2, h / 2, d / 2, color, fin, o)
  }

  // A squared timber from a to b, `w` wide and `h` deep.
  beam(a: V3, b: V3, w: number, h: number, color: string | readonly number[], fin: number, o: Q & { skip?: string } = {}): void {
    const d = sub(b, a), len = Math.hypot(d[0], d[1], d[2])
    if (len < 1e-5) return
    const ax = unit(d)
    const ref: V3 = Math.abs(ax[1]) > 0.95 ? [1, 0, 0] : UP
    const az = unit(cross(ax, ref)), ay = cross(az, ax)
    this.obox([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], ax, ay, az, len / 2, h / 2, w / 2, color, fin, o)
  }

  // A round from a to b: a log, a post, a pipe, a tank. Smooth round its side; `cap` closes its ends ('a', 'b' or 'ab').
  cyl(a: V3, b: V3, r0: number, r1: number, sides: number, color: string | readonly number[], fin: number, o: Q & { cap?: string; capColor?: string | readonly number[]; capFin?: number } = {}): void {
    const d = unit(sub(b, a)), len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const ref: V3 = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : UP
    const s = unit(cross(d, ref)), t = cross(d, s)
    const col = rgb(color, o.tint ?? 1)
    const ex = o.ex ?? 1, e0 = typeof ex === 'number' ? ex : ex[0], e1 = typeof ex === 'number' ? ex : ex[1]
    const fx = o.flex ?? 0, f0 = typeof fx === 'number' ? fx : fx[0], f1 = typeof fx === 'number' ? fx : fx[1]
    const base = this.pos.length / 3
    for (let k = 0; k <= sides; k++) {
      const an = (k / sides) * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an)
      const n: V3 = [s[0] * cs + t[0] * sn, s[1] * cs + t[1] * sn, s[2] * cs + t[2] * sn]
      const arc = (k / sides) * Math.PI * (r0 + r1) + (o.uo ?? 0)
      this.vert([a[0] + n[0] * r0, a[1] + n[1] * r0, a[2] + n[2] * r0], n, col, arc, o.vo ?? 0, fin, e0, f0)
      this.vert([b[0] + n[0] * r1, b[1] + n[1] * r1, b[2] + n[2] * r1], n, col, arc, len + (o.vo ?? 0), fin, e1, f1)
    }
    for (let k = 0; k < sides; k++) {
      const q = base + k * 2
      this.idx.push(q, q + 2, q + 3, q, q + 3, q + 1)
    }
    const cap = o.cap ?? ''
    const capCol = rgb(o.capColor ?? color, o.tint ?? 1), capFin = o.capFin ?? fin
    for (const end of cap) {
      const at = end === 'a' ? a : b, r = end === 'a' ? r0 : r1, n: V3 = end === 'a' ? [-d[0], -d[1], -d[2]] : d
      const e = end === 'a' ? e0 : e1, f = end === 'a' ? f0 : f1
      const c0 = this.vert(at, n, capCol, 0, 0, capFin, e, f)
      for (let k = 0; k <= sides; k++) {
        const an = (k / sides) * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an)
        this.vert([at[0] + (s[0] * cs + t[0] * sn) * r, at[1] + (s[1] * cs + t[1] * sn) * r, at[2] + (s[2] * cs + t[2] * sn) * r], n, capCol, cs, sn, capFin, e, f)
      }
      for (let k = 0; k < sides; k++) {
        if (end === 'a') this.idx.push(c0, c0 + 2 + k, c0 + 1 + k)
        else this.idx.push(c0, c0 + 1 + k, c0 + 2 + k)
      }
    }
  }

  // A shape turned about the vertical through c: `profile` is [radius, height] pairs from the foot up.
  lathe(c: V3, profile: [number, number][], sides: number, color: string | readonly number[], fin: number, o: Q = {}): void {
    const col = rgb(color, o.tint ?? 1)
    const ex = o.ex ?? 1, e0 = typeof ex === 'number' ? ex : ex[0]
    const base = this.pos.length / 3, rows = profile.length
    const slope = profile.map((_, i) => {
      const p = profile[Math.max(0, i - 1)], q = profile[Math.min(rows - 1, i + 1)]
      const dr = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dr, dy) || 1
      return [dy / l, -dr / l]
    })
    let run = 0
    const along = profile.map((p, i) => (i === 0 ? 0 : (run += Math.hypot(p[0] - profile[i - 1][0], p[1] - profile[i - 1][1]))))
    for (let k = 0; k <= sides; k++) {
      const an = (k / sides) * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an)
      for (let i = 0; i < rows; i++) {
        const [r, y] = profile[i]
        this.vert([c[0] + cs * r, c[1] + y, c[2] + sn * r], [cs * slope[i][0], slope[i][1], sn * slope[i][0]], col, (k / sides) * Math.PI * 2 * Math.max(r, 0.05) + (o.uo ?? 0), along[i], fin, e0)
      }
    }
    for (let k = 0; k < sides; k++) {
      for (let i = 0; i < rows - 1; i++) {
        const q = base + k * rows + i, n = q + rows
        this.idx.push(n, q, q + 1, n, q + 1, n + 1)
      }
    }
  }

  // A rounded uneven lump: a stone, a heap, a bush, a hen. `rough`: how far its surface wanders; `facets`: flat faces.
  blob(c: V3, r: V3, seed: number, color: string | readonly number[], fin: number, o: Q & { detail?: number; rough?: number; facets?: boolean; flat?: number; round?: V3 } = {}): void {
    const src = ico(o.detail ?? 1), rough = o.rough ?? 0.3, floor = o.flat ?? -2
    const col = rgb(color, o.tint ?? 1)
    const ex = o.ex ?? 1, e0 = typeof ex === 'number' ? ex : ex[0]
    const p: V3[] = [], dirs: V3[] = []
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2]
      const k = 1 + (hash2(Math.round(x * 53) + seed * 131, Math.round(y * 47 + z * 91) + seed * 17) - 0.5) * rough * 2
      const yy = Math.max(floor, y * k)
      p.push([c[0] + x * k * r[0], c[1] + yy * r[1], c[2] + z * k * r[2]])
      dirs.push(unit([x / r[0], y / r[1], z / r[2]]))
    }
    for (let i = 0; i < p.length; i += 3) {
      const a = p[i], b = p[i + 1], d = p[i + 2]
      const fn = unit(cross(sub(b, a), sub(d, a)))
      const base = this.pos.length / 3
      for (let q = 0; q < 3; q++) {
        const w = p[i + q]
        // `round`: shade as part of one mass about that point (a crown of leaves), not as a lump of its own
        const n: V3 = o.facets ? fn : o.round ? unit([w[0] - o.round[0], w[1] - o.round[1], w[2] - o.round[2]]) : unit([dirs[i + q][0] * 0.7 + fn[0] * 0.3, dirs[i + q][1] * 0.7 + fn[1] * 0.3, dirs[i + q][2] * 0.7 + fn[2] * 0.3])
        this.vert(w, n, col, w[0] - c[0] + (o.uo ?? 0), w[1] - c[1] + w[2] - c[2], fin, e0)
      }
      this.idx.push(base, base + 1, base + 2)
    }
  }

  geometry(which = 0): BufferGeometry {
    const l = this.lots[which]
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(l.pos), 3))
    g.setAttribute('normal', new BufferAttribute(new Float32Array(l.nrm), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(l.col), 3))
    g.setAttribute('aUvh', new BufferAttribute(new Float32Array(l.uvh), 3))
    g.setAttribute('aFin', new BufferAttribute(new Float32Array(l.fin), 3))
    const n = l.pos.length / 3
    g.setIndex(new BufferAttribute(n > 65535 ? new Uint32Array(l.idx) : new Uint16Array(l.idx), 1))
    g.computeBoundingSphere()
    return g
  }

  // What has been drawn so far as one mesh that throws and takes shadow in every cascade (its roofs, which only throw
  // it, a mesh under it); the builder is left empty.
  mesh(mat: MeshStandardMaterial, depth?: MeshDepthMaterial): Mesh {
    const make = (which: number): Mesh => {
      const mesh = new Mesh(this.geometry(which), mat)
      if (depth) mesh.customDepthMaterial = depth
      mesh.castShadow = true
      mesh.receiveShadow = which === 0
      for (const l of [1, 2, 3]) mesh.layers.enable(l)
      return mesh
    }
    const mesh = make(0)
    if (this.lots[1].idx.length) mesh.add(make(1))
    this.clear()
    return mesh
  }

  clear(): void {
    this.lots = [lot(), lot()]
    this.at_ = 0
    this.stack = []
  }
}

interface Lot { pos: number[]; nrm: number[]; col: number[]; uvh: number[]; fin: number[]; idx: number[] }
const lot = (): Lot => ({ pos: [], nrm: [], col: [], uvh: [], fin: [], idx: [] })

// Do something to a built mesh and the roofs under it.
export function each(mesh: Mesh, fn: (m: Mesh) => void): void {
  fn(mesh)
  for (const c of mesh.children) fn(c as Mesh)
}

// How bright a lit window is drawn (set against the exposure each frame), and what share of the windows are lit.
export const LAMP_LUM = { value: 0 }
export const DUSK = { value: 0 }

// Washing on the line, a flag, a swing: what hangs moves with the gusts, by how far it hangs from what holds it.
// And leaves that fall are gone, from the picture and from the shadow, once the trees are bare.
const MOVES = /* glsl */ `
  if (aFin.z > 0.0) {
    float gust = gustAt(cWorld.xz);
    float ph = dot(cWorld.xz, vec2(1.7, 1.3));
    float lean = uSway * (0.3 + 1.2 * gust) * (0.6 + 0.4 * sin(uTime * 2.6 + ph) + 0.2 * sin(uTime * 6.3 + ph * 2.1));
    cWorld.xz += uWindDir * lean * aFin.z;
    cWorld.y += 0.35 * lean * lean * aFin.z;
  }
  if (aFin.x > 12.5 && aFin.x < 13.5 && aFin.y > 0.5 && uLeaf < 0.12) cWorld.xyz = vec3(0.0, -60.0, 0.0);
`

// The same shapes in the sun's shadow pass.
export function builtDepth(): MeshDepthMaterial {
  return depthFor({ key: 'county-built', vertexHead: 'attribute vec3 aFin;', vertexWorld: MOVES })
}

// The one material: paint and wear drawn from where each piece is on its own surface.
export function builtMaterial(): MeshStandardMaterial {
  return patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 }), {
    key: 'county-built',
    uniforms: { uLampLum: LAMP_LUM, uDusk: DUSK },
    vertexHead: 'attribute vec3 aUvh; attribute vec3 aFin; varying vec3 vUvh; varying vec3 vFin;',
    vertexBegin: 'vUvh = aUvh; vFin = aFin;',
    vertexWorld: MOVES,
    fragmentHead: /* glsl */ `
      uniform float uLampLum; uniform float uDusk;
      varying vec3 vUvh; varying vec3 vFin;
      float bRough; float bMetal; float bSnow; float bGlass; float bLit; vec2 bBump;
      float bh1(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453); }
      float bh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // How much of a pattern this fine still shows at this distance.
      float seen(float c) { return 1.0 - smoothstep(0.3, 0.95, fwidth(c)); }
    `,
    fragmentColor: /* glsl */ `
      {
        int fin = int(vFin.x + 0.5);
        vec2 uv = vUvh.xy;
        float hgt = vUvh.z;
        vec3 base = diffuseColor.rgb;
        float open = vFin.y;
        float mott = texture2D(uNoise, uv * 0.11 + 0.31).b;
        float fine = texture2D(uNoise, uv * 1.3).a;
        // Rain runs down a wall in streaks, and splashes the foot of it with earth.
        float streak = texture2D(uNoise, vec2(uv.x * 1.1, uv.y * 0.07 + 0.5)).a;
        float splash = (1.0 - smoothstep(0.0, 0.42, hgt)) * (0.45 + 0.55 * fine);
        bRough = 0.9; bMetal = 0.0; bSnow = 1.0; bGlass = 0.0; bLit = 0.0; bBump = vec2(0.0);
        if (fin == ${FIN.clapboard}) {
          float c = uv.y / 0.05, lap = fract(c), row = floor(c), s = seen(c);
          float joint = floor(uv.x / 1.7 + bh1(row) * 9.0);
          streak = texture2D(uNoise, vec2(uv.x * 0.31, uv.y * 0.045 + 0.5)).a;
          float board = 0.9 + 0.2 * bh2(vec2(row, joint));
          // each board's foot throws a line of shade on the one below; old paint is thin, and thinnest low down
          base *= mix(1.0, board * (1.0 - 0.5 * smoothstep(0.76, 0.95, lap)) * (1.0 + 0.1 * smoothstep(0.0, 0.2, lap) * (1.0 - smoothstep(0.2, 0.5, lap))), s);
          float worn = smoothstep(0.52, 0.8, mott * 0.6 + streak * 0.4 + 0.45 * (1.0 - smoothstep(0.0, 1.2, hgt)));
          base = mix(base, (base * vec3(0.7, 0.68, 0.64) + 0.01) * (0.9 + 0.2 * fine), worn * 0.34);
          base = mix(base, base * vec3(0.7, 0.66, 0.56), splash * 0.6);
          bBump.y = -1.1 * s * smoothstep(0.7, 0.98, lap);
          bRough = 0.78;
        } else if (fin == ${FIN.boards}) {
          float wide = 0.115;
          float c = uv.x / wide, id = floor(c), fr = fract(c), s = seen(c);
          float tone = 0.8 + 0.4 * bh1(id);
          float gap = smoothstep(0.88, 0.98, fr) + (1.0 - smoothstep(0.0, 0.05, fr)) * 0.4;
          float grain = texture2D(uNoise, vec2(uv.x * 3.1, uv.y * 0.16 + id * 0.37)).a;
          base *= mix(1.0, tone * (1.0 - 0.5 * gap), s) * (0.84 + 0.32 * grain);
          // weather greys the foot of every board, and the nails weep
          float grey = smoothstep(0.35, 0.9, (1.0 - smoothstep(0.0, 1.6, hgt)) * 0.7 + mott * 0.5 + bh1(id + 7.0) * 0.25);
          base = mix(base, vec3(0.3, 0.29, 0.27) * (0.7 + 0.5 * grain), grey * 0.34);
          base = mix(base, base * vec3(0.62, 0.56, 0.48), splash * 0.7);
          bBump.x = s * (smoothstep(0.86, 0.98, fr) - (1.0 - smoothstep(0.0, 0.08, fr))) * 1.2;
          bRough = 0.92;
        } else if (fin == ${FIN.shingle}) {
          float c = uv.y / 0.062, course = floor(c), lap = fract(c), s = seen(c);
          float t = uv.x / 0.095 + 0.5 * mod(course, 2.0) + bh1(course) * 0.3, tab = floor(t), tf = fract(t);
          float tone = 0.84 + 0.3 * bh2(vec2(tab, course));
          float shade = 1.0 - 0.42 * smoothstep(0.0, 0.16, 0.16 - lap) - 0.18 * (1.0 - smoothstep(0.0, 0.06, tf));
          base *= mix(1.0, tone * shade, s);
          // lichen and moss creep down from the ridge and the damp north side; dark where the rain runs
          float moss = smoothstep(0.7, 0.92, texture2D(uNoise, uv * 0.31 + 0.11).b * 0.7 + fine * 0.2 + streak * 0.2) * step(0.5, vWNormal.y);
          base = mix(base, vec3(0.1, 0.12, 0.07) * (0.7 + 0.6 * fine), moss * 0.3);
          base *= 0.8 + 0.34 * streak;
          bBump.y = 0.9 * s * (smoothstep(0.0, 0.16, 0.16 - lap) - 0.4);
          bRough = 0.94;
        } else if (fin == ${FIN.metal}) {
          float c = uv.x / 0.22, fr = fract(c), s = seen(c);
          float seam = smoothstep(0.86, 0.94, fr) * (1.0 - smoothstep(0.96, 1.0, fr));
          base *= mix(1.0, 1.0 + 0.3 * seam - 0.3 * smoothstep(0.94, 1.0, fr) - 0.12 * (1.0 - smoothstep(0.0, 0.08, fr)), s);
          // rust starts at the eaves and the seams and runs down the sheet
          float rust = smoothstep(0.42, 0.78, texture2D(uNoise, vec2(uv.x * 0.21 + 0.4, uv.y * 0.09)).b * 0.72 + streak * 0.4);
          float amount = clamp(2.0 - open * 2.0, 0.0, 1.0);
          base = mix(base, vec3(0.2, 0.085, 0.04) * (0.7 + 0.6 * fine), rust * amount);
          base *= 0.88 + 0.22 * streak;
          bBump.x = s * (smoothstep(0.84, 0.9, fr) - smoothstep(0.94, 1.0, fr)) * 1.4;
          bRough = mix(0.55, 0.85, rust * amount);
          bMetal = mix(0.35, 0.0, rust * amount);
          bSnow = 0.72;
          open = 1.0;
        } else if (fin == ${FIN.brick}) {
          float c = uv.y / 0.036, course = floor(c), s = seen(c);
          float t = uv.x / 0.1 + 0.5 * mod(course, 2.0), id = floor(t);
          float mortar = max(smoothstep(0.8, 0.94, fract(c)), smoothstep(0.88, 0.97, fract(t)));
          base = mix(base, mix(base * (0.7 + 0.55 * bh2(vec2(id, course))), vec3(0.42, 0.4, 0.36), mortar * 0.8), s);
          base *= 0.86 + 0.24 * streak;
          bBump = s * vec2(smoothstep(0.86, 0.97, fract(t)), smoothstep(0.78, 0.94, fract(c))) * 0.8;
        } else if (fin == ${FIN.stone}) {
          // field stone laid dry or in lime: uneven stones, each its own grey, dark between
          vec2 cell = uv / vec2(0.16, 0.105);
          cell.x += 0.5 * mod(floor(cell.y), 2.0);
          vec2 ci = floor(cell), cf = fract(cell);
          float d1 = 9.0, d2 = 9.0, id = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j));
            vec2 q = o + 0.5 + 0.36 * (vec2(bh2(ci + o), bh2(ci + o + 17.3)) - 0.5) * 2.0 - cf;
            float d = dot(q, q * vec2(1.0, 1.25));
            if (d < d1) { d2 = d1; d1 = d; id = bh2(ci + o + 5.1); } else if (d < d2) d2 = d;
          }
          float edge = sqrt(d2) - sqrt(d1), s = seen(cell.y);
          vec3 stone = base * (0.62 + 0.7 * id) * mix(vec3(1.06, 1.0, 0.92), vec3(0.92, 0.98, 1.08), bh1(id * 91.0));
          base = mix(base * 0.92, mix(base * 0.42, stone, smoothstep(0.015, 0.1, edge)), s) * (0.84 + 0.3 * fine);
          base = mix(base, vec3(0.2, 0.23, 0.12), 0.3 * smoothstep(0.6, 0.85, mott) * (1.0 - smoothstep(0.0, 0.5, hgt)));
          bRough = 0.95;
        } else if (fin == ${FIN.glass}) {
          vec2 pc = uv * max(vColor.xy, vec2(1.0)), pf = abs(fract(pc) - 0.5), aa = fwidth(pc);
          vec2 bw = vec2(0.05, 0.038);
          vec2 bar = smoothstep(vec2(0.5) - bw - aa * 0.5, vec2(0.5) - bw + aa * 0.5, pf);
          // too far off to draw a bar: the glass keeps the bars' own small share of pale
          float wood = mix(max(bar.x, bar.y), 0.14, smoothstep(0.3, 0.9, max(aa.x, aa.y)));
          bGlass = 1.0 - wood;
          bLit = step(vColor.z, uDusk - 0.001);
          // by day a window is dark, with a curtain's pale edge in the lower sash of a house
          float curtain = (1.0 - step(0.5, open)) * smoothstep(0.3, 0.5, abs(uv.x - 0.5)) * (1.0 - smoothstep(0.8, 1.0, uv.y)) * smoothstep(0.0, 0.5, uv.y + abs(uv.x - 0.5));
          base = mix(mix(vec3(0.02, 0.025, 0.03), vec3(0.3, 0.29, 0.26), curtain * 0.5), vec3(0.78, 0.76, 0.69), wood);
          bRough = mix(0.3, 0.6, wood);
          bSnow = 0.0;
          open = 1.0;
        } else if (fin == ${FIN.concrete}) {
          float form = seen(uv.y / 0.3) * smoothstep(0.92, 0.99, fract(uv.y / 0.3));
          base *= (0.86 + 0.26 * mott) * (0.9 + 0.2 * fine) * (1.0 - 0.2 * form) * (0.82 + 0.3 * streak);
          base = mix(base, base * vec3(0.66, 0.62, 0.52), splash * 0.7);
          bRough = 0.9;
        } else if (fin == ${FIN.earth}) {
          base *= (0.74 + 0.5 * mott) * (0.8 + 0.4 * fine) * mix(1.0, 0.66, uWet);
          bRough = mix(0.97, 0.6, uWet * 0.6);
        } else if (fin == ${FIN.gravel}) {
          float peb = bh2(floor(uv * 34.0)) * seen(uv.x * 34.0);
          base *= (0.8 + 0.4 * mott) * (0.86 + 0.28 * fine) * (0.86 + 0.3 * peb) * mix(1.0, 0.72, uWet);
          bRough = 0.96;
        } else if (fin == ${FIN.cloth}) {
          float weave = texture2D(uNoise, uv * 7.0).a;
          base *= 0.9 + 0.14 * weave + 0.1 * sin(uv.x * 46.0 + sin(uv.y * 9.0)) * seen(uv.x * 7.0);
          bRough = 0.98; bSnow = 0.3;
        } else if (fin == ${FIN.endgrain}) {
          float r = length(uv), rings = 0.5 + 0.5 * sin(r * 34.0 + fine * 3.0);
          base *= (0.84 + 0.22 * rings * seen(r * 5.0)) * (1.0 - 0.3 * smoothstep(0.8, 1.0, r)) * (0.9 + 0.2 * fine);
          bRough = 0.85;
        } else if (fin == ${FIN.hay}) {
          float straw = texture2D(uNoise, vec2(uv.x * 9.0, uv.y * 1.4)).a, straw2 = texture2D(uNoise, vec2(uv.x * 1.7, uv.y * 11.0) + 0.4).a;
          base *= 0.66 + 0.44 * straw + 0.3 * straw2;
          bRough = 0.96;
        } else if (fin == ${FIN.leaf}) {
          vec4 lf = texture2D(uNoise, vWorld.xz * 1.9 + vWorld.y * 1.3);
          float turned = smoothstep(0.25, 0.8, uGold + (lf.b - 0.5) * 0.5);
          base = mix(base, base * vec3(2.3, 1.25, 0.42), turned * open);
          base *= 0.56 + 0.7 * lf.a;
          if (open > 0.5 && lf.a + lf.b * 0.6 > 0.35 + uLeaf * 1.6) discard;
          bBump = (lf.rg - 0.5) * 2.4;
          bRough = 0.8; bSnow = 0.5;
          open = 1.0;
        } else if (fin == ${FIN.wood}) {
          float grain = texture2D(uNoise, vec2(uv.x * 0.22, uv.y * 4.6)).a;
          base *= (0.8 + 0.34 * grain) * (0.9 + 0.18 * mott);
          bRough = 0.9;
        } else if (fin == ${FIN.turf}) {
          // banked earth grown over: the meadow's own green, whatever the season
          vec2 tp = vWorld.xz;
          base = uGrass * (0.62 + 0.62 * texture2D(uNoise, tp * 0.043).b) * (0.82 + 0.36 * texture2D(uNoise, tp * 0.31).a) * (0.84 + 0.32 * texture2D(uNoise, tp * 0.0037).b);
          base *= mix(vec3(1.2, 1.07, 0.78), mix(vec3(0.86, 0.9, 0.84), vec3(0.8, 0.97, 0.88), uLeaf), smoothstep(0.32, 0.68, texture2D(uNoise, tp * 0.027 + 0.31).b));
          bBump = (texture2D(uNoise, tp * 0.31).rg - 0.5) * 1.2;
          bRough = 0.96;
        } else if (fin == ${FIN.cord}) {
          // split wood stacked with its ends out: rounds and quarters, pale where they were cut
          vec2 cell = uv / 0.075;
          cell.x += 0.5 * mod(floor(cell.y), 2.0);
          vec2 ci = floor(cell), cf = fract(cell) - 0.5;
          float r = length(cf + 0.3 * (vec2(bh2(ci), bh2(ci + 9.1)) - 0.5)) / (0.72 + 0.5 * bh2(ci + 1.7)), s = seen(cell.y);
          float tone = 0.62 + 0.6 * bh2(ci + 3.3);
          float rings = 0.9 + 0.1 * sin(r * 26.0 + bh2(ci) * 6.0);
          base = mix(base * 0.72, mix(base * 0.16, base * tone * rings, 1.0 - smoothstep(0.38, 0.5, r)), s) * (0.85 + 0.3 * fine);
          bRough = 0.9;
        } else if (fin == ${FIN.dark}) {
          // an open doorway: the dark of the inside, a little of the floor's light at its foot
          base *= 0.5 + 0.9 * (1.0 - smoothstep(0.0, 0.7, uv.y)) * fine;
          bRough = 1.0; bSnow = 0.0;
        } else {
          base *= (0.93 + 0.12 * fine) * (0.94 + 0.1 * mott);
          base = mix(base, base * vec3(0.76, 0.72, 0.64), splash * 0.4);
          bRough = 0.8;
        }
        diffuseColor.rgb = base * (0.34 + 0.66 * open);
      }
      ${snowRimeAt('uSnow * bSnow', 'rimeAt( vWorld.y ) * bSnow')}
    `,
    fragmentRoughness: 'roughnessFactor = bRough; metalnessFactor = bMetal;',
    // The relief of laps, seams and joints, turned to the surface's own run and rise.
    fragmentNormal: /* glsl */ `
      if (dot(bBump, bBump) > 1e-6) {
        vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
        vec2 dux = dFdx(vUvh.xy), duy = dFdy(vUvh.xy);
        float det = dux.x * duy.y - dux.y * duy.x;
        if (abs(det) > 1e-10) {
          vec3 tU = normalize((dpx * duy.y - dpy * dux.y) / det), tV = normalize((dpy * dux.x - dpx * duy.x) / det);
          normal = normalize(normal + (viewMatrix * vec4(tU * bBump.x + tV * bBump.y, 0.0)).xyz * 0.3);
        }
      }`,
    // Glass shows the sky, more of it the flatter it is seen; each pane sits a little out of true, so the low sun
    // flashes from one and then the next; and when it is dark enough to want a lamp, some are lit.
    fragmentEmissive: /* glsl */ `
      if (bGlass > 0.0) {
        vec2 pane = floor(vUvh.xy * max(vColor.xy, vec2(1.0))) + floor(vWorld.xz * 3.0);
        vec3 wN = normalize(vWNormal + 0.035 * (vec3(bh2(pane), bh2(pane + 3.1), bh2(pane + 7.7)) - 0.5));
        vec3 wV = normalize(cameraPosition - vWorld);
        vec3 wR = reflect(-wV, wN);
        float fres = 0.02 + 0.5 * pow(1.0 - max(dot(wN, wV), 0.0), 4.0);
        vec3 sky = skyRadiance(vec3(wR.x, max(wR.y, 0.0) + 0.06, wR.z), 0.12) * (0.25 + 0.75 * smoothstep(-0.05, 0.3, wR.y));
        float glint = pow(max(dot(wR, uSunDir), 0.0), 260.0);
        vec3 lamp = vec3(1.0, 0.62, 0.27) * uLampLum * bLit * (0.55 + 0.6 * texture2D(uNoise, vUvh.xy * 0.9 + pane * 0.13).a);
        totalEmissiveRadiance += bGlass * (sky * fres * (1.0 - 0.6 * bLit) + uSunCol * glint * 2.2 * cloudShade(vWorld) + lamp);
      }`,
  })
}
