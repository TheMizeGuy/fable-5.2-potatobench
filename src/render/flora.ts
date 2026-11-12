// Trees: the spruce and fir of the ridge with hardwoods along its front and in stands through it, birch and maple by
// the house, alder on the brook, the stands on the tracts the farm can clear, and the woodlots and hedgerows of the
// country beyond. Near the farm they are whole trees; far off, simpler ones of the same outline and colour.
import {
  BufferAttribute, BufferGeometry, DoubleSide, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshStandardMaterial, Quaternion, Sphere, Vector3, type MeshDepthMaterial, type PerspectiveCamera,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PARCELS, TRACTS } from '../sim/index.ts'
import {
  DUFOUR_BARN, DUFOUR_HOUSE, DUFOUR_POTATO_HOUSE, FARM, FARM_CENTER, FD, FIELDS, FW, HOME_WOODS, POND, POTATO_HOUSE, brookHalf, brookZ, fieldMask,
  groundY, hillRoadZ, oursAt, ridgeWoodAt, roadDist, stripEdge, townRoadZ, tractAt, woodFront, woodsAt,
} from './layout.ts'
import { fbm2, hash2, rng, smooth } from './noise.ts'
import { SNOW_RIME_TREE, depthFor, linear, patch, sway, type Patch } from './shaders.ts'

// kind: 0 maple, 1 birch, 2 poplar, 3 alder and brush (for a hardwood); 0 spruce, 1 fir (for a conifer).
export interface Tree { x: number; z: number; s: number; r: number; hue: number; kind: number; w?: number }
// A tree of a tract's stand, in the order the stand is felled.
export interface StandTree extends Tree { conifer: boolean; bush: boolean }

// A conifer one unit high: tiers of separate drooping boughs, each a spray that narrows to an upturned tip, no two
// the same length, round a dark core. colour: shade (dark at the trunk), how near the tip, 1 on the trunk.
function conifer(tiers: number, boughs: number, width: number, seed: number, fold: boolean): BufferGeometry {
  const r = rng(seed)
  const pos: number[] = [], col: number[] = [], nrm: number[] = [], idx: number[] = []
  const vert = (x: number, y: number, z: number, shade: number, tip: number, part: number, nx: number, ny: number, nz: number) => {
    const l = Math.hypot(nx, ny, nz) || 1
    pos.push(x, y, z)
    col.push(shade, tip, part)
    nrm.push(nx / l, ny / l, nz / l)
    return pos.length / 3 - 1
  }
  const cone = (sides: number, y0: number, y1: number, rad: number, shade: number, part: number) => {
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2
      const v0 = vert(Math.cos(a0) * rad, y0, Math.sin(a0) * rad, shade, 0, part, Math.cos(a0), 0.35, Math.sin(a0))
      const v1 = vert(Math.cos(a1) * rad, y0, Math.sin(a1) * rad, shade, 0, part, Math.cos(a1), 0.35, Math.sin(a1))
      const v2 = vert(0, y1, 0, shade * 0.9, 0, part, Math.cos(am), 0.5, Math.sin(am))
      idx.push(v0, v2, v1)
    }
  }
  cone(5, 0, 0.5, 0.024, 0.8, 1)
  cone(6, 0.17, 0.96, width * 0.4, 0.3, 0)
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers
    const y0 = 0.11 + Math.pow(f, 0.95) * 0.82
    const rad = width * Math.pow(1 - f, 0.8) * (0.84 + 0.32 * r()) + 0.02
    const n = Math.max(4, Math.round(boughs * (1 - 0.45 * f)))
    const turn = r() * 6.283
    for (let k = 0; k < n; k++) {
      const a = turn + ((k + (r() - 0.5) * 0.7) / n) * 6.283
      const len = rad * (0.7 + 0.52 * r())
      const half = len * (0.36 + 0.16 * r()) + 0.012
      const droop = 0.05 + 0.075 * (1 - f) + 0.04 * r()
      const ca = Math.cos(a), sa = Math.sin(a)
      const root = vert(ca * 0.012, y0 + droop + 0.03, sa * 0.012, 0.36, 0, 0, ca * 0.4, 1, sa * 0.4)
      const mx = ca * len * 0.55, mz = sa * len * 0.55, my = y0 + droop * 0.25
      const left = vert(mx - sa * half, my - 0.014, mz + ca * half, 0.72, 0.5, 0, ca - sa * 0.8, 0.62, sa + ca * 0.8)
      const right = vert(mx + sa * half, my - 0.014, mz - ca * half, 0.72, 0.5, 0, ca + sa * 0.8, 0.62, sa - ca * 0.8)
      const tip = vert(ca * len, y0 + 0.012 - 0.02 * r(), sa * len, 1, 1, 0, ca, 0.5, sa)
      if (fold) {
        const mid = vert(mx, my + 0.022, mz, 0.84, 0.45, 0, ca * 0.5, 1, sa * 0.5)
        idx.push(root, left, mid, root, mid, right, left, tip, mid, mid, tip, right)
      } else idx.push(root, left, right, left, tip, right)
    }
  }
  // the leader
  cone(3, 0.9, 1.02, 0.028, 0.95, 0)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.setIndex(idx)
  return g
}

interface Wood { pos: number[]; nrm: number[]; idx: number[] }

// A tapering limb from a to b.
function limb(w: Wood, ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number, sides = 5): void {
  const o = w.pos.length / 3
  const dx = bx - ax, dy = by - ay, dz = bz - az
  const ux = Math.abs(dy) > 0.9 * Math.hypot(dx, dy, dz) ? 1 : 0, uy = ux ? 0 : 1
  let sx = -dz * uy, sy = dz * ux, sz = dx * uy - dy * ux
  const sl = Math.hypot(sx, sy, sz) || 1
  sx /= sl; sy /= sl; sz /= sl
  const l = Math.hypot(dx, dy, dz) || 1
  const tx = (dy * sz - dz * sy) / l, ty = (dz * sx - dx * sz) / l, tz = (dx * sy - dy * sx) / l
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
    const nx = sx * c + tx * s, ny = sy * c + ty * s, nz = sz * c + tz * s
    w.pos.push(ax + nx * ra, ay + ny * ra, az + nz * ra, bx + nx * rb, by + ny * rb, bz + nz * rb)
    w.nrm.push(nx, ny, nz, nx, ny, nz)
    const q = o + k * 2, n = o + ((k + 1) % sides) * 2
    w.idx.push(q, n, q + 1, q + 1, n, n + 1)
  }
}

type Form = 'maple' | 'birch' | 'bush'

// A hardwood one unit high: a trunk forking into limbs and twigs (what stands in winter), and a crown of rounded masses
// of leaf that shade together as one volume, darker underneath and inside. A birch is narrow on a tall pale stem, often
// two; a bush is a clump of stems with no trunk. aPart: 0 wood, 1 leaf. aShade: how much light reaches that part.
function broadleaf(seed: number, form: Form, detail: number): BufferGeometry {
  const r = rng(seed)
  const wood: Wood = { pos: [], nrm: [], idx: [] }
  const lobes: [number, number, number, number, number][] = []     // x, y, z, radius, detail
  let crownY = 0.66
  if (form === 'maple') {
    limb(wood, 0, -0.03, 0, 0.012, 0.14, 0.004, 0.05, 0.036)
    limb(wood, 0.012, 0.14, 0.004, 0.02, 0.4, 0.01, 0.036, 0.026)
    lobes.push([0.02, 0.8, 0, 0.21, detail])
    const ring = 5
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * 6.283 + r() * 0.7, d = 0.2 + r() * 0.07
      lobes.push([Math.cos(a) * d, 0.5 + r() * 0.17, Math.sin(a) * d, 0.16 + r() * 0.045, detail])
    }
    for (let k = 0; k < 2; k++) {
      const a = r() * 6.283, d = 0.31 + r() * 0.06
      lobes.push([Math.cos(a) * d, 0.46 + r() * 0.26, Math.sin(a) * d, 0.09 + r() * 0.035, 0])
    }
  } else if (form === 'birch') {
    crownY = 0.7
    const lean = 0.05
    limb(wood, 0, -0.03, 0, lean * 0.4, 0.3, 0.01, 0.022, 0.016)
    limb(wood, lean * 0.4, 0.3, 0.01, lean, 0.66, 0.02, 0.016, 0.009)
    // a second stem from the same root
    limb(wood, 0.02, -0.03, 0.01, -0.09, 0.34, -0.05, 0.017, 0.012)
    limb(wood, -0.09, 0.34, -0.05, -0.13, 0.6, -0.07, 0.012, 0.007)
    lobes.push([lean, 0.86, 0.02, 0.14, detail])
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * 6.283 + r() * 0.8, d = 0.12 + r() * 0.05
      lobes.push([lean + Math.cos(a) * d, 0.58 + r() * 0.2, Math.sin(a) * d, 0.11 + r() * 0.035, detail])
    }
    lobes.push([-0.14, 0.66 + r() * 0.06, -0.08, 0.1, detail])
    lobes.push([0.17, 0.48, 0.12, 0.07, 0], [-0.2, 0.5, 0.06, 0.065, 0])
  } else {
    // leafy to the ground: its stems show only in winter
    crownY = 0.4
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 6.283 + r() * 0.8, d = 0.2 + r() * 0.16, y = 0.2 + r() * 0.3
      lobes.push([Math.cos(a) * d, y, Math.sin(a) * d, 0.18 + r() * 0.07, k < 3 ? detail : 0])
      limb(wood, Math.cos(a) * 0.03, -0.02, Math.sin(a) * 0.03, Math.cos(a) * d * 0.8, y + 0.1, Math.sin(a) * d * 0.8, 0.012, 0.005, 3)
    }
    lobes.push([0.03, 0.62, -0.02, 0.2, detail], [-0.05, 0.42, 0.06, 0.22, 0])
  }
  // limbs into the masses, each ending in twigs
  if (form !== 'bush') {
    const from = form === 'maple' ? 0.36 : 0.56
    lobes.forEach(([lx, ly, lz, lr], k) => {
      const hy = from - 0.1 * r(), reach = 0.82
      const ex = lx * reach, ey = Math.max(hy + 0.06, ly - lr * 0.2), ez = lz * reach
      limb(wood, 0.015, hy, 0.005, ex, ey, ez, form === 'maple' ? 0.02 : 0.011, 0.007, 4)
      if (detail === 0 && k > 3) return
      for (let q = 0; q < 2; q++) {
        const a = r() * 6.283, tl = lr * (0.7 + 0.4 * r())
        limb(wood, ex, ey, ez, ex + Math.cos(a) * tl * 0.7, ey + tl * (0.4 + 0.5 * r()), ez + Math.sin(a) * tl * 0.7, 0.006, 0.002, 3)
      }
    })
  }
  const parts: BufferGeometry[] = []
  const woodGeo = new BufferGeometry()
  const wn = wood.pos.length / 3
  woodGeo.setAttribute('position', new BufferAttribute(new Float32Array(wood.pos), 3))
  woodGeo.setAttribute('normal', new BufferAttribute(new Float32Array(wood.nrm), 3))
  woodGeo.setAttribute('aShade', new BufferAttribute(new Float32Array(wn).fill(1), 1))
  woodGeo.setAttribute('aPart', new BufferAttribute(new Float32Array(wn).fill(0), 1))
  woodGeo.setAttribute('aRound', new BufferAttribute(new Float32Array(wood.nrm), 3))
  woodGeo.setIndex(wood.idx)
  parts.push(woodGeo)
  let reach = 0
  for (const [lx, ly, lz, lr] of lobes) reach = Math.max(reach, Math.hypot(lx, (ly - crownY) * 1.15, lz) + lr)
  lobes.forEach(([lx, ly, lz, lr, det], k) => {
    const g = lump(lr, det, k + seed * 7, 0.34)
    const p = g.getAttribute('position') as BufferAttribute
    const n = new Float32Array(p.count * 3), shade = new Float32Array(p.count), round = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      const ox = p.getX(i), oy = p.getY(i), oz = p.getZ(i), ol = Math.hypot(ox, oy, oz) || 1
      const x = lx + ox, y = ly + oy, z = lz + oz
      // The mass's own roundness, leaned toward the crown's, so the whole crown has a lit side and a shaded one.
      let cx = x, cy = (y - crownY) * 1.15, cz = z
      const cl = Math.hypot(cx, cy, cz) || 1
      cx /= cl; cy /= cl; cz /= cl
      const nx = (ox / ol) * 0.55 + cx * 0.45, ny = (oy / ol) * 0.55 + cy * 0.45 + 0.12, nz = (oz / ol) * 0.55 + cz * 0.45
      const nl = Math.hypot(nx, ny, nz) || 1
      n.set([nx / nl, ny / nl, nz / nl], i * 3)
      round.set([ox / ol, oy / ol, oz / ol], i * 3)
      const depth = Math.min(1.1, cl / reach)
      shade[i] = (0.4 + 0.6 * smooth(0.3, 1, depth)) * (0.74 + 0.26 * smooth(-0.7, 0.5, oy / ol)) * (0.86 + 0.14 * smooth(0.3, 0.8, y))
      p.setXYZ(i, x, y, z)
    }
    g.setAttribute('normal', new BufferAttribute(n, 3))
    g.setAttribute('aShade', new BufferAttribute(shade, 1))
    g.setAttribute('aPart', new BufferAttribute(new Float32Array(p.count).fill(1), 1))
    g.setAttribute('aRound', new BufferAttribute(round, 3))
    parts.push(g)
  })
  const tree = mergeGeometries(parts)!
  for (const g of parts) g.dispose()
  return tree
}

// A rounded, uneven mass.
function lump(radius: number, detail: number, seed: number, rough = 0.5): BufferGeometry {
  const ico = new IcosahedronGeometry(radius, detail)
  ico.deleteAttribute('uv')
  ico.deleteAttribute('normal')
  const g = mergeVertices(ico)
  ico.dispose()
  const p = g.getAttribute('position') as BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const j = 1 + (hash2(Math.round(p.getX(i) / radius * 17) + seed * 7, Math.round(p.getY(i) / radius * 17 + p.getZ(i) / radius * 9)) - 0.5) * rough
    p.setXYZ(i, p.getX(i) * j, p.getY(i) * j * 0.86, p.getZ(i) * j)
  }
  return g
}

export interface Kind { geo: BufferGeometry; mat: MeshStandardMaterial; wide: number; sink: number; depth?: MeshDepthMaterial; shadow: boolean }
interface Chunk { near: InstancedMesh[]; far: InstancedMesh[]; sphere: Sphere; fixed: boolean }
// A tract's stand: its trees in felling order, and for each mesh that draws some of them their places in that order,
// last to fall first, so the trees still standing are always the first of the mesh.
interface Stand { trees: StandTree[]; sets: { mesh: InstancedMesh; ranks: number[] }[]; cut: number }

type Cls = 'spruce' | 'maple' | 'birch' | 'bush' | 'conBack' | 'broadBack' | 'conFar' | 'conDistant' | 'broadFar' | 'broadDistant'

// Trees are laid out in patches of ground, each its own set of meshes so what is out of sight is not drawn, nor drawn
// into a shadow it cannot reach. On and near the farm a patch has whole trees for when the camera is close and simpler
// ones for when it is not.
const CELL = 64
const NEAR_AT = { high: 150, medium: 115, low: 45 }

export class Flora {
  readonly group = new Group()
  private disposables: { dispose(): void }[] = []
  private chunks = new Map<string, Chunk>()
  private stands = new Map<number, Stand>()
  private near: Record<string, Kind>
  private far: Record<string, Kind>
  private nearAt = NEAR_AT.high
  private v = new Vector3()

  constructor() {
    const r = rng(2024)
    const trees: Record<Cls, Tree[]> = { spruce: [], maple: [], birch: [], bush: [], conBack: [], broadBack: [], conFar: [], conDistant: [], broadFar: [], broadDistant: [] }
    const built = [POTATO_HOUSE, DUFOUR_POTATO_HOUSE, DUFOUR_HOUSE, DUFOUR_BARN]
    const open = (x: number, z: number) =>
      roadDist(x, z) > 1.8 && Math.abs(z - townRoadZ(x)) > 3.2 && Math.abs(z - hillRoadZ(x)) > 3.2 && Math.abs(z - brookZ(x)) > brookHalf(x) + 0.7
      && built.every(b => Math.hypot(x - b.x, z - b.z) > 5.2) && fieldMask(x, z, 1.2) < 0.01
    // maple, birch or poplar
    const hard = (t: Omit<Tree, 'kind'>, poplar = 0.12) => {
      const q = r()
      if (q < poplar) trees.birch.push({ ...t, kind: 2, s: t.s * 1.12 })
      else if (q < poplar + 0.4) trees.birch.push({ ...t, kind: 1 })
      else trees.maple.push({ ...t, kind: 0 })
    }
    // a fir is a slimmer spruce
    const soft = (t: Omit<Tree, 'kind'>) => trees.spruce.push(r() < 0.36 ? { ...t, kind: 1, w: 0.7 } : { ...t, kind: 0 })
    // The canopy rolls: stands of taller and of lower trees.
    const tall = (x: number, z: number) => 0.74 + 0.56 * fbm2(x * 0.055 + 3.7, z * 0.07 + 1.1)

    // The front of the woods on the ridge, where the camera can come close: whole trees, smaller toward the ragged edge.
    const h = HOME_WOODS
    for (let z = -44; z < h.z1 + 1.5; z += 1.9) {
      for (let x = h.x0 - 6; x < h.x1 + 6; x += 1.9) {
        const jx = x + (r() - 0.5) * 1.8, jz = z + (r() - 0.5) * 1.8
        const w = woodsAt(jx, jz)
        if (r() > w.woods * 0.93 || !open(jx, jz)) continue
        const depth = woodFront(jx) - jz
        const size = (0.58 + 0.42 * smooth(0, 7, depth)) * tall(jx, jz)
        const t = { x: jx, z: jz, s: 0, r: r(), hue: r() }
        if (r() < w.hard) hard({ ...t, s: (3.9 + r() * 2.8) * size })
        else soft({ ...t, s: (5.4 + r() * 3.8) * size * (r() < 0.04 ? 1.35 : 1) })
      }
    }
    // Under its edge: saplings, young birch and brush, in and out along the front.
    for (let x = h.x0 - 2; x < h.x1 + 2; x += 0.55 + r() * 0.7) {
      const z = Math.min(-22.5, woodFront(x) + 2.1 - r() * 3.4)
      if (ridgeWoodAt(x, z - 2.5) < 0.3 || tractAt(x, z, 1.4) >= 0 || !open(x, z)) continue
      const q = r(), t = { x, z, s: 0, r: r(), hue: r() }
      if (q < 0.5) trees.bush.push({ ...t, s: 0.7 + r() * 0.9, kind: 3 })
      else if (q < 0.78) trees.spruce.push({ ...t, s: 1.2 + r() * 1.9, kind: 0, w: 1.25 })
      else trees.birch.push({ ...t, s: 2.2 + r() * 1.6, kind: r() < 0.3 ? 2 : 1 })
    }
    // Back up the ridge and over its crest, where nobody walks: simpler trees, each standing for a little more.
    for (let z = h.z0 - 10; z < -44; z += 2.7) {
      for (let x = h.x0 - 8; x < h.x1 + 8; x += 2.7) {
        const jx = x + (r() - 0.5) * 2.6, jz = z + (r() - 0.5) * 2.6
        const w = woodsAt(jx, jz)
        if (r() > w.woods * 0.95 || !open(jx, jz)) continue
        const size = tall(jx, jz) * 1.12
        const t = { x: jx, z: jz, s: 0, r: r(), hue: r() }
        if (r() < w.hard) trees.broadBack.push({ ...t, s: (4.4 + r() * 2.8) * size, kind: r() < 0.4 ? 1 : 0 })
        else trees.conBack.push({ ...t, s: (5.8 + r() * 3.8) * size, kind: r() < 0.36 ? 1 : 0, w: 1.12 })
      }
    }
    // By the house, along the lane and on the brook; the Dufour dooryard's maple, and a few along the road between.
    trees.maple.push({ x: 28.3, z: 4.6, s: 6.6, r: 0.3, hue: 0.12, kind: 0 }, { x: 27.6, z: -2.4, s: 4.6, r: 0.5, hue: 0.8, kind: 0 })
    for (let k = 0; k < 4; k++) {
      const t = { x: 28.2 + r() * 1.4, z: -8.6 + k * 2.3 + r(), s: 4.2 + r() * 2.4, r: r(), hue: r(), kind: 0 }
      if (roadDist(t.x, t.z) > 1.8) trees.spruce.push(t)
    }
    trees.maple.push({ x: 97.4, z: 6.6, s: 6.8, r: 0.22, hue: 0.2, kind: 0 })
    trees.birch.push({ x: 89.0, z: 4.6, s: 4.4, r: 0.62, hue: 0.7, kind: 1 })
    for (let k = 0; k < 3; k++) trees.spruce.push({ x: 98.6 + r() * 1.6, z: -10 + k * 2.6, s: 4.4 + r() * 2.2, r: r(), hue: r(), kind: 0 })
    for (let x = 33; x < 48; x += 2.2 + r() * 3) {
      const side = r() < 0.5 ? -1 : 1, z = -8.4 + side * (2.4 + r() * 1.2) - (x < 40 ? (40 - x) * 0.35 : 0)
      if (!open(x, z)) continue
      if (r() < 0.55) trees.bush.push({ x, z, s: 1.2 + r(), r: r(), hue: r(), kind: 3 })
      else hard({ x, z, s: 3.6 + r() * 2.6, r: r(), hue: r() })
    }
    for (let x = -150; x < 170; x += 1.5 + r() * 2.6) {
      if (Math.abs(x - 17.8) < 3.2 || Math.abs(x - 92.6) < 3.2 || (x > -26 && x < 13.5)) continue
      const side = r() < 0.5 ? -1 : 1, bz = brookZ(x), off = brookHalf(x) + 0.9 + r() * 1.6
      // Fewer on the farm's own bank, so the view across the brook stays open.
      if (side < 0 && x > FARM.x0 - 4 && x < FARM.x1 && r() < 0.62) continue
      const z = bz + side * off
      if (tractAt(x, z, 0.8) >= 0 || Math.hypot((x - POND.x) / (POND.rx + 1.5), (z - POND.z) / (POND.rz + 1.5)) < 1) continue
      if (r() < 0.72) trees.bush.push({ x, z, s: 0.9 + r() * 0.9, r: r(), hue: r(), kind: 3 })
      else hard({ x, z: bz + side * (off + 1), s: 3.2 + r() * 2.6, r: r(), hue: r() }, 0.3)
    }
    // The country: woodlots thinning with distance, each tree standing for more as they go, and hedgerow trees.
    const reach = 1500
    for (let tries = 0; tries < 160000; tries++) {
      const a = r() * Math.PI * 2, d = 40 + Math.pow(r(), 1.7) * reach
      const x = FARM_CENTER.x + Math.cos(a) * d, z = FARM_CENTER.z + Math.sin(a) * d
      if (trees.conFar.length + trees.broadFar.length + trees.conDistant.length + trees.broadDistant.length > 11000) break
      if (ridgeWoodAt(x, z) > 0.02 || tractAt(x, z, 1.4) >= 0) continue
      const w = woodsAt(x, z)
      if (w.woods <= 0 || !open(x, z)) continue
      const sparse = 1 / (1 + d / 260)
      if (r() > w.woods * (0.3 + 0.7 * sparse)) continue
      const grow = 1 + d / 520
      const t = { x, z, s: (4.2 + r() * 3.6) * grow, r: r(), hue: r(), kind: 0 }
      const near = d < 95
      if (r() < w.hard) {
        if (near) hard({ ...t, s: (3.4 + r() * 2.6) * grow })
        else (d < 330 ? trees.broadFar : trees.broadDistant).push({ ...t, s: (3.6 + r() * 2.6) * grow, kind: r() < 0.35 ? 1 : 0 })
      } else if (near) soft(t)
      else (d < 340 ? trees.conFar : trees.conDistant).push({ ...t, w: 1.1 })
    }
    // Hedgerows between the neighbours' strips round the farm: brush, with a tree here and there. Low to the north-west,
    // where the evening sun comes from.
    for (let z = -18; z < 150; z += 1.05) {
      for (let x = -150; x < 200; x += 1.05) {
        const jx = x + (r() - 0.5), jz = z + (r() - 0.5)
        const e = stripEdge(jx, jz)
        if (!e.hedged || e.d > 0.75 || r() < 0.3) continue
        if (oursAt(jx, jz, 2) > 0.01 || woodsAt(jx, jz).woods > 0 || !open(jx, jz) || tractAt(jx, jz, 1.4) >= 0) continue
        const low = jx < -18 && jz < 34
        if (r() < (low ? 0.94 : 0.7)) trees.bush.push({ x: jx, z: jz, s: 0.8 + r() * 0.9, r: r(), hue: r(), kind: 3 })
        else hard({ x: jx, z: jz, s: (low ? 2.4 : 3.2) + r() * 2.4, r: r(), hue: r() }, 0.25)
      }
    }
    // Trees round the neighbours' farmsteads.
    for (const [fx, fz] of FARMSTEADS) {
      for (let k = 0; k < 5; k++) {
        const x = fx + (r() - 0.5) * 16, z = fz + (r() - 0.5) * 14
        if (Math.hypot(x - fx, z - fz) < 5 || !open(x, z)) continue
        ;(r() < 0.6 ? trees.broadFar : trees.conFar).push({ x, z, s: 4.5 + r() * 3, r: r(), hue: r(), kind: 0 })
      }
    }

    const windy = sway('vec2(instanceMatrix[3].x, instanceMatrix[3].z)', 'max(cWorld.y - instanceMatrix[3].y, 0.0)', '0.02')
    // Spruce and fir: near-black inside, the needles of each spray lighter to its tip, so the side the sun is on shows
    // warm and the tree has a shape; new growth pale at the tips in June.
    const cMat = patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0, side: DoubleSide }), {
      key: 'county-conifer',
      ambient: 0.78,
      translucent: 0.14,
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree; varying vec3 vObj;',
      vertexBegin: 'vTree = aTree; vObj = position;',
      vertexWorld: windy,
      fragmentHead: 'varying vec4 vTree; varying vec3 vObj;',
      fragmentColor: /* glsl */ `
        {
          float fir = step(0.5, floor(vTree.x + 0.001));
          float n = texture2D(uNoise, vObj.xz * 2.7 + vObj.y * 2.1 + fract(vTree.x) * 5.0).a;
          vec3 deep = mix(${linear('#15271d')}, ${linear('#1b2f2a')}, fir);
          vec3 lit = mix(mix(${linear('#3a5a30')}, ${linear('#526c34')}, vTree.y), ${linear('#3a5c4c')}, fir * 0.7);
          lit = mix(lit, ${linear('#86a24c')}, 0.3 * smoothstep(148.0, 164.0, uDay) * (1.0 - smoothstep(186.0, 212.0, uDay)) * vColor.g);
          vec3 col = mix(deep, lit, clamp(vColor.g * (0.5 + 0.75 * n), 0.0, 1.0)) * vColor.r * vTree.z;
          diffuseColor.rgb = mix(col, ${linear('#4b4037')} * (0.7 + 0.5 * n), step(0.5, vColor.b));
        }
        ${SNOW_RIME_TREE}`,
    })
    // Hardwoods: pale in new leaf, green all summer, turning by the tree and the bough through September, the leaves
    // thinning as they fall until the limbs stand bare.
    const leafPatch: Patch = {
      key: 'county-hardwood',
      vertexHead: 'attribute vec4 aTree; attribute float aShade; attribute float aPart; attribute vec3 aRound; varying vec4 vTree; varying float vShade; varying float vPart; varying vec3 vObj; varying vec3 vRound;',
      vertexBegin: /* glsl */ `
        vTree = aTree; vShade = aShade; vPart = aPart; vObj = position;
        #ifdef USE_INSTANCING
          vRound = normalize((modelMatrix * instanceMatrix * vec4(aRound, 0.0)).xyz);
        #else
          vRound = normalize((modelMatrix * vec4(aRound, 0.0)).xyz);
        #endif
      `,
      vertexWorld: `${sway('vec2(instanceMatrix[3].x, instanceMatrix[3].z)', 'max(cWorld.y - instanceMatrix[3].y, 0.0)', '0.034')}
        cWorld.xyz += sin(uTime * 2.7 + position.x * 23.0 + position.y * 17.0 + aTree.x * 20.0) * 0.016 * min(aTree.w, 6.0) * 0.2 * min(uSway, 1.0) * step(0.5, aPart);`,
    }
    const leafMat = patch(new MeshStandardMaterial({ color: 0xffffff, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide, roughness: 0.9, metalness: 0 }), {
      ...leafPatch,
      translucent: 0.6,
      ambient: 0.92,
      shine: 0.1,
      fragmentHead: 'varying vec4 vTree; varying float vShade; varying float vPart; varying vec3 vObj; varying vec3 vRound; vec2 leafBump;',
      fragmentColor: /* glsl */ `
        {
          float sp = floor(vTree.x + 0.001), own = fract(vTree.x);
          leafBump = vec2(0.0);
          // the tree's own space, in the world's units, so its leaves hold still on it in the wind
          vec3 q = vObj * vTree.w;
          if (vPart < 0.5) {
            // Bark: birch pale with dark marks and a dark foot, poplar green-grey, the rest grey-brown. Kept dark, since
            // the light that comes through leaves is counted on the bark too.
            float mark = step(0.74, texture2D(uNoise, vec2(atan(vObj.x, vObj.z) * 0.6, q.y * 0.33) + own * 3.0).a);
            vec3 bark = ${linear('#5b5146')};
            vec3 birch = mix(mix(${linear('#dedacd')}, ${linear('#3a3531')}, mark), ${linear('#514941')}, 1.0 - smoothstep(0.02, 0.12, vObj.y));
            bark = mix(bark, birch, step(0.5, sp) * step(sp, 1.5));
            bark = mix(bark, mix(${linear('#aeb198')}, ${linear('#55564a')}, mark * 0.7), step(1.5, sp) * step(sp, 2.5));
            bark = mix(bark, ${linear('#4a443c')}, step(2.5, sp));
            diffuseColor.rgb = bark * 0.62 * (0.8 + 0.3 * texture2D(uNoise, q.xy * 0.9).a);
            diffuseColor.a = 1.0;
          } else {
            // looked up from above on what faces the sky and from the side on what does not, so it never smears
            vec2 atTop = q.xz * 0.5 + own * 7.0, atSide = vec2(q.x + q.z, q.y * 1.2) * 0.45 + own * 5.0;
            float sky = smoothstep(0.35, 0.75, abs(normalize(vRound).y));
            vec4 cl = mix(texture2D(uNoise, atSide), texture2D(uNoise, atTop), sky);
            float fine = mix(texture2D(uNoise, atSide * 2.9 + 0.37).a, texture2D(uNoise, atTop * 2.9 + 0.37).a, sky);
            leafBump = (cl.rg - 0.5) * 2.4;
            vec3 summer = mix(${linear('#456f30')}, ${linear('#7c9c45')}, vTree.y);
            summer = mix(summer, mix(${linear('#587f3a')}, ${linear('#8fa850')}, vTree.y), step(0.5, sp) * step(sp, 1.5));
            summer = mix(summer, mix(${linear('#6b8a4a')}, ${linear('#96a85c')}, vTree.y), step(1.5, sp) * step(sp, 2.5));
            summer = mix(summer, mix(${linear('#38592e')}, ${linear('#55733a')}, vTree.y), step(2.5, sp));
            vec3 young = mix(${linear('#93b354')}, ${linear('#b2c268')}, own) * mix(1.0, 0.8, step(2.5, sp));
            vec3 col = mix(young, summer, smoothstep(140.0, 178.0, uDay));
            vec3 fall = own < 0.2 ? ${linear('#a03c27')} : own < 0.58 ? ${linear('#c06d2b')} : ${linear('#cb9d39')};
            fall = mix(fall, mix(${linear('#c9a236')}, ${linear('#d8b644')}, own), step(0.5, sp) * step(sp, 2.5));
            fall = mix(fall, ${linear('#8a7a3a')}, step(2.5, sp));
            float late = 0.12 * step(1.5, sp) + 0.2 * step(2.5, sp) - 0.1 * (1.0 - step(0.5, sp));
            float start = clamp(0.18 + vTree.y * 0.42 + late, 0.16, 0.72);
            float turned = smoothstep(start, start + 0.3, uGold + (cl.b - 0.5) * 0.3);
            col = mix(col, fall * (0.78 + 0.34 * cl.a), turned);
            // Masses of leaf within the mass: light where they face the sky, dark under and between.
            float clump = smoothstep(0.3, 0.72, cl.b * 0.7 + fine * 0.3 + (vShade - 0.7) * 0.85);
            diffuseColor.rgb = col * mix(0.4, 1.1, clump) * (0.62 + 0.38 * vShade) * (0.88 + 0.24 * fine) * vTree.z;
            if (!gl_FrontFacing) diffuseColor.rgb *= 0.4;
            // The outline of every mass is broken by its leaves, so light comes through its edge; and leaves thin as they fall.
            float rim = 1.0 - abs(dot(normalize(vRound), normalize(cameraPosition - vWorld)));
            float cover = 1.0 - smoothstep(0.58, 0.88, rim + (fine - 0.5) * 0.9 + (cl.b - 0.5) * 0.5);
            cover *= smoothstep(0.0, 0.3, uLeaf * 1.3 - fine * (1.0 - 0.4 * uLeaf));
            diffuseColor.a = cover;
          }
        }
        ${SNOW_RIME_TREE}`,
      fragmentNormal: 'normal = normalize(normal + (viewMatrix * vec4(leafBump.x, 0.0, leafBump.y, 0.0)).xyz * 0.5);',
    })
    // In the shadow pass a crown thins with its leaves.
    const leafDepth = depthFor({ ...leafPatch, vertexBegin: `${leafPatch.vertexBegin} if (aPart > 0.5) transformed.xz *= smoothstep(0.0, 0.6, uLeaf);` })
    this.disposables.push(cMat, leafMat, leafDepth)

    const g = {
      spruce: conifer(10, 7, 0.21, 5, true), spruceFar: conifer(10, 7, 0.21, 5, false), conMid: conifer(7, 6, 0.21, 13, false), conFar: conifer(5, 5, 0.215, 17, false), conDistant: conifer(3, 4, 0.23, 19, false),
      maple: broadleaf(3, 'maple', 1), birch: broadleaf(11, 'birch', 1), bush: broadleaf(23, 'bush', 1),
      mapleFar: broadleaf(3, 'maple', 0), birchFar: broadleaf(11, 'birch', 0), bushFar: broadleaf(23, 'bush', 0),
    }
    this.disposables.push(...Object.values(g))
    const k = (geo: BufferGeometry, mat: MeshStandardMaterial, wide: number, sink: number, shadow = true, depth?: MeshDepthMaterial): Kind => ({ geo, mat, wide, sink, shadow, depth })
    // What each tree is drawn with close to, and far from, the camera.
    this.near = {
      spruce: k(g.spruce, cMat, 1, 0.02), maple: k(g.maple, leafMat, 1.06, 0.01, true, leafDepth), birch: k(g.birch, leafMat, 0.94, 0.01, true, leafDepth),
      bush: k(g.bush, leafMat, 1.25, 0.04, true, leafDepth),
    }
    this.far = {
      spruce: k(g.spruceFar, cMat, 1, 0.02), maple: k(g.mapleFar, leafMat, 1.06, 0.01, true, leafDepth), birch: k(g.birchFar, leafMat, 0.94, 0.01, true, leafDepth),
      bush: k(g.bushFar, leafMat, 1.25, 0.04, true, leafDepth),
      conBack: k(g.conMid, cMat, 1, 0.02), broadBack: k(g.mapleFar, leafMat, 1.1, 0.01, true, leafDepth),
      conFar: k(g.conFar, cMat, 1, 0.02), conDistant: k(g.conDistant, cMat, 1, 0.02, false),
      broadFar: k(g.mapleFar, leafMat, 1.1, 0.01, true, leafDepth), broadDistant: k(g.mapleFar, leafMat, 1.1, 0.01, false),
    }
    // Lay each class out by patch: near-and-far patches on and round the farm, far-only patches beyond.
    for (const cls of Object.keys(trees) as Cls[]) {
      const byCell = new Map<string, Tree[]>()
      const both = cls in this.near
      const cell = both ? CELL : cls === 'conBack' || cls === 'broadBack' ? CELL : 720
      for (const t of trees[cls]) {
        const key = `${both ? 'n' : cell === CELL ? 'b' : 'f'}|${Math.floor(t.x / cell)}|${Math.floor(t.z / cell)}`
        let list = byCell.get(key)
        if (!list) byCell.set(key, (list = []))
        list.push(t)
      }
      for (const [key, list] of byCell) {
        let ch = this.chunks.get(key)
        if (!ch) this.chunks.set(key, (ch = { near: [], far: [], sphere: new Sphere(), fixed: !both }))
        ch.far.push(this.place(this.far[cls], list, true))
        if (both) ch.near.push(this.place(this.near[cls], list, false))
      }
    }
    for (const i of TRACTS) if (PARCELS[i].cover !== 'open') this.plantStand(i)
    for (const ch of this.chunks.values()) {
      const all = [...ch.near, ...ch.far]
      all.forEach((m, i) => { if (i === 0) ch.sphere.copy(m.boundingSphere!); else ch.sphere.union(m.boundingSphere!) })
      for (const m of ch.near) m.visible = false
    }
  }

  // The trees or brush standing on a tract when the game starts, in the order they will be felled: the woods from the
  // side toward the farm, the swale from the road.
  private plantStand(i: number): void {
    const f = FIELDS[i], brush = PARCELS[i].cover === 'brush'
    const r = rng(900 + i * 31)
    const step = brush ? 0.98 : 1.5
    const list: StandTree[] = []
    const order: number[] = []
    // Burnt Hill went to poplar and birch; the home woodlot is spruce; the back lot is mixed.
    const hardShare = i === 16 ? 0.82 : i === 14 ? 0.14 : 0.5
    for (let z = f.z0 + 0.8; z < f.z1 - 0.5; z += step) {
      for (let x = f.x0 + 0.8; x < f.x1 - 0.6; x += step) {
        const jx = Math.min(f.x1 - 0.7, Math.max(f.x0 + 0.7, x + (r() - 0.5) * step * 1.7)), jz = Math.min(f.z1 - 0.45, Math.max(f.z0 + 0.7, z + (r() - 0.5) * step * 1.7))
        // thickets and openings
        if (r() > 0.42 + 1.1 * fbm2(jx * 0.31 + i * 3.1, jz * 0.31 + 5.7)) continue
        const t = { x: jx, z: jz, r: r(), hue: r() }
        const tall = 0.8 + 0.44 * fbm2(jx * 0.055 + 3.7, jz * 0.07 + 1.1)
        let tree: StandTree
        if (brush) {
          const q = r()
          tree = q < 0.84 ? { ...t, s: 0.9 + r() * 0.8, kind: 3, conifer: false, bush: true }
            : q < 0.94 ? { ...t, s: 2.2 + r() * 1.3, kind: r() < 0.5 ? 2 : 1, conifer: false, bush: false }
              : { ...t, s: 1.3 + r() * 1.2, kind: 0, conifer: true, bush: false, w: 1.2 }
        } else if (r() < hardShare) {
          const q = r(), poplar = i === 16 ? 0.55 : 0.15
          tree = { ...t, s: (3.8 + r() * 2.6) * tall * (q < poplar ? 1.12 : 1), kind: q < poplar ? 2 : q < poplar + 0.35 ? 1 : 0, conifer: false, bush: false }
        } else tree = { ...t, s: (5.2 + r() * 3.4) * tall, kind: r() < 0.36 ? 1 : 0, conifer: true, bush: false, w: r() < 0.36 ? 0.72 : 1 }
        list.push(tree)
        order.push((brush ? (jx - f.x0) / FW : (f.z1 - jz) / FD) + (r() - 0.5) * 0.1)
      }
    }
    const by = list.map((_, n) => n).sort((a, b) => order[a] - order[b])
    const trees = by.map(n => list[n])
    const ch: Chunk = { near: [], far: [], sphere: new Sphere(), fixed: false }
    const stand: Stand = { trees, sets: [], cut: 0 }
    const cls = (t: StandTree) => (t.conifer ? 'spruce' : t.bush ? 'bush' : t.kind === 0 ? 'maple' : 'birch')
    for (const c of ['spruce', 'maple', 'birch', 'bush']) {
      const ranks: number[] = []
      for (let n = trees.length - 1; n >= 0; n--) if (cls(trees[n]) === c) ranks.push(n)
      if (!ranks.length) continue
      const sub = ranks.map(n => trees[n])
      const near = this.place(this.near[c], sub, false), far = this.place(this.far[c], sub, true)
      ch.near.push(near)
      ch.far.push(far)
      stand.sets.push({ mesh: near, ranks }, { mesh: far, ranks })
    }
    this.chunks.set(`t|${i}`, ch)
    this.stands.set(i, stand)
  }

  // A tract's stand in felling order (empty for a parcel that never had one).
  stand(i: number): StandTree[] {
    return this.stands.get(i)?.trees ?? []
  }

  // How many of a tract's trees are down: the first `share` of them in felling order.
  setFelled(i: number, share: number): number {
    const st = this.stands.get(i)
    if (!st) return 0
    const cut = Math.round(Math.max(0, Math.min(1, share)) * st.trees.length)
    if (cut !== st.cut) {
      st.cut = cut
      for (const s of st.sets) {
        let n = 0
        while (n < s.ranks.length && s.ranks[n] >= cut) n++
        s.mesh.count = n
      }
    }
    return cut
  }

  // The low brush of hedgerows and wood edges, for whoever else plants it.
  bush(far: boolean): Kind {
    return far ? this.far.bush : this.near.bush
  }

  private place(kind: Kind, trees: Tree[], far: boolean): InstancedMesh {
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3(), up = new Vector3(0, 1, 0)
    const geo = new BufferGeometry()
    geo.index = kind.geo.index
    for (const name of Object.keys(kind.geo.attributes)) geo.setAttribute(name, kind.geo.attributes[name])
    const mesh = new InstancedMesh(geo, kind.mat, trees.length)
    const info = new Float32Array(trees.length * 4)
    trees.forEach((t, n) => {
      q.setFromAxisAngle(up, t.r * 6.283)
      const w = t.s * kind.wide * (t.w ?? 1) * (0.84 + 0.32 * t.r)
      mesh.setMatrixAt(n, m.compose(p.set(t.x, groundY(t.x, t.z) - kind.sink * t.s, t.z), q, sc.set(w, t.s, w)))
      info.set([t.kind + Math.min(0.999, t.r), t.hue, 0.8 + 0.4 * hash2(Math.round(t.x * 7), Math.round(t.z * 7)), t.s], n * 4)
    })
    geo.setAttribute('aTree', new InstancedBufferAttribute(info, 4))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.castShadow = kind.shadow
    mesh.receiveShadow = true
    // Whole trees shadow into every cascade; far ones only into the last, wide one.
    mesh.layers.enable(2)
    if (!far) { mesh.layers.enable(1); mesh.layers.enable(3) } else mesh.userData.far = true
    if (kind.depth) mesh.customDepthMaterial = kind.depth
    this.group.add(mesh)
    this.disposables.push(geo)
    return mesh
  }

  setTier(tier: 'high' | 'medium' | 'low'): void {
    this.nearAt = NEAR_AT[tier]
  }

  // Whole trees in the patches near the camera, simple ones in the rest.
  update(camera: PerspectiveCamera): void {
    const c = camera.position
    for (const ch of this.chunks.values()) {
      if (ch.fixed) continue
      const d = Math.max(0, this.v.copy(ch.sphere.center).distanceTo(c) - ch.sphere.radius)
      const near = d < this.nearAt
      for (const m of ch.near) m.visible = near
      for (const m of ch.far) m.visible = !near
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.group.traverse(o => { if (o instanceof InstancedMesh) o.dispose() })
  }
}

// Where the neighbours' houses and barns stand: along the town road and the road over the hill.
export const FARMSTEADS: [number, number, number][] = [
  [-92, townRoadZ(-92) + 9, 0.3], [118, townRoadZ(118) - 10, 2.9], [262, townRoadZ(262) + 10, 0.1], [-246, townRoadZ(-246) - 9, 3.3],
  [-58, hillRoadZ(-58) + 9, 0.2], [96, hillRoadZ(96) - 9, 3.0], [-212, hillRoadZ(-212) + 10, 0.4], [248, hillRoadZ(248) + 9, 0.1],
  [-380, hillRoadZ(-380) - 9, 3.2], [404, hillRoadZ(404) - 10, 2.8], [30, -420, 0.6], [-160, -540, 2.4], [210, -610, 1.2],
]
