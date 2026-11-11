// Trees: the spruce and fir of the ridge woodlot, birch and maple along its edge and by the house, alder on the brook,
// and the woodlots and hedgerows of the country beyond. Near the farm they are whole trees; far off, simpler ones.
import {
  BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshStandardMaterial, Quaternion, Sphere, Vector3, type MeshDepthMaterial, type PerspectiveCamera, type Texture,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  DUFOUR_BARN, DUFOUR_HOUSE, DUFOUR_POTATO_HOUSE, FARM, FARM_CENTER, HOME_WOODS, POTATO_HOUSE, brookHalf, brookZ, fieldMask, groundY, hillRoadZ, roadDist,
  townRoadZ, woodsAt,
} from './layout.ts'
import { hash2, rng } from './noise.ts'
import { SNOW_RIME_TREE, depthFor, linear, patch, sway, type Patch } from './shaders.ts'

interface Tree { x: number; z: number; s: number; r: number; hue: number }

// A conifer one unit high: whorls of drooping boughs, each a ragged skirt, darker toward the trunk.
function conifer(whorls: number, spokes: number, width: number, seed: number): BufferGeometry {
  const r = rng(seed)
  const pos: number[] = [], col: number[] = [], nrm: number[] = [], idx: number[] = []
  const vert = (x: number, y: number, z: number, shade: number, nx: number, ny: number, nz: number) => {
    const l = Math.hypot(nx, ny, nz) || 1
    pos.push(x, y, z)
    col.push(shade, shade, shade)
    nrm.push(nx / l, ny / l, nz / l)
    return pos.length / 3 - 1
  }
  // trunk
  const sides = 5
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2
    const v0 = vert(Math.cos(a0) * 0.022, 0, Math.sin(a0) * 0.022, 0.5, Math.cos(a0), 0, Math.sin(a0))
    const v1 = vert(Math.cos(a1) * 0.022, 0, Math.sin(a1) * 0.022, 0.5, Math.cos(a1), 0, Math.sin(a1))
    const v2 = vert(0, 0.5, 0, 0.45, Math.cos(a0), 0.3, Math.sin(a0))
    idx.push(v0, v2, v1)
  }
  for (let w = 0; w < whorls; w++) {
    const t = w / whorls
    const y0 = 0.13 + Math.pow(t, 0.92) * 0.8
    const rad = width * Math.pow(1 - t, 0.8) * (0.86 + 0.28 * r()) + 0.015
    const rise = 0.2 * (1 - t * 0.45) + 0.05
    const apex = vert(0, y0 + rise, 0, 0.5, 0, 1, 0)
    const turn = r() * Math.PI * 2
    const ring: number[] = []
    for (let k = 0; k < spokes * 2; k++) {
      const a = turn + (k / (spokes * 2)) * Math.PI * 2
      const tip = k % 2 === 0
      const rr = rad * (tip ? 0.92 + 0.2 * r() : 0.5 + 0.12 * r())
      ring.push(vert(Math.cos(a) * rr, y0 - (tip ? 0.035 + 0.03 * r() : -0.02), Math.sin(a) * rr, tip ? 1.0 : 0.62, Math.cos(a), 0.75, Math.sin(a)))
    }
    for (let k = 0; k < ring.length; k++) idx.push(apex, ring[(k + 1) % ring.length], ring[k])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.setIndex(idx)
  return g
}

// A hardwood one unit high: a flared trunk that forks into limbs and branches, and at their ends masses of leaf sprays,
// so the crown has an uneven outline with sky through it. Each leaf card carries how deep in the crown it sits
// (aShade), so the inside of the crown is dark and its sunny top light. A birch is narrower, airier and drooping.
function hardwood(seed: number, birch: boolean): { wood: BufferGeometry; crown: BufferGeometry; core: BufferGeometry } {
  const r = rng(seed)
  const pos: number[] = [], nrm: number[] = [], idx: number[] = []
  const limb = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number) => {
    const o = pos.length / 3
    const dx = bx - ax, dy = by - ay, dz = bz - az
    const ux = Math.abs(dy) > 0.9 * Math.hypot(dx, dy, dz) ? 1 : 0, uy = ux ? 0 : 1
    let sx = -dz * uy, sy = dz * ux, sz = dx * uy - dy * ux
    const sl = Math.hypot(sx, sy, sz) || 1
    sx /= sl; sy /= sl; sz /= sl
    const l = Math.hypot(dx, dy, dz) || 1
    const tx = (dy * sz - dz * sy) / l, ty = (dz * sx - dx * sz) / l, tz = (dx * sy - dy * sx) / l
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
      const nx = sx * c + tx * s, ny = sy * c + ty * s, nz = sz * c + tz * s
      pos.push(ax + nx * ra, ay + ny * ra, az + nz * ra, bx + nx * rb, by + ny * rb, bz + nz * rb)
      nrm.push(nx, ny, nz, nx, ny, nz)
      const q = o + k * 2, n = o + ((k + 1) % 6) * 2
      idx.push(q, n, q + 1, q + 1, n, n + 1)
    }
  }
  // the trunk, flared at the foot
  limb(0, -0.02, 0, 0.01, 0.12, 0, birch ? 0.04 : 0.06, birch ? 0.026 : 0.036)
  const top = birch ? 0.62 : 0.4
  limb(0.01, 0.12, 0, 0.02, top, 0.01, birch ? 0.026 : 0.036, birch ? 0.014 : 0.026)
  const lobes: [number, number, number, number][] = []
  const spread = birch ? 0.17 : 0.28
  const limbs = birch ? 4 : 4 + Math.floor(r() * 2)
  for (let k = 0; k < limbs; k++) {
    const a = k * (Math.PI * 2 / limbs) + r() * 0.8
    const h0 = (birch ? 0.3 : 0.3) + r() * (top - 0.32)
    const out = spread * (0.65 + 0.5 * r()), rise = (birch ? 0.3 : 0.26) + r() * 0.16
    const ex = Math.cos(a) * out, ez = Math.sin(a) * out, ey = h0 + rise
    limb(0.015, h0, 0.005, ex, ey, ez, birch ? 0.012 : 0.02, 0.008)
    // each limb forks into two branches, a mass of leaves at each tip
    for (const turn of [-0.55, 0.6]) {
      const b = a + turn + (r() - 0.5) * 0.4, len = (birch ? 0.09 : 0.13) * (0.7 + 0.6 * r())
      const fx = ex + Math.cos(b) * len, fz = ez + Math.sin(b) * len, fy = ey + (birch ? 0.02 : 0.06) + r() * 0.07 - (birch ? 0.05 * r() : 0)
      limb(ex, ey, ez, fx, fy, fz, 0.008, 0.004)
      lobes.push([fx, fy, fz, (birch ? 0.095 : 0.13) + r() * (birch ? 0.04 : 0.06)])
    }
  }
  // the crown's top, and masses filling in over the trunk
  lobes.push([0.02, top + (birch ? 0.28 : 0.3), 0.01, birch ? 0.11 : 0.16])
  for (let k = 0; k < (birch ? 2 : 3); k++) {
    const a = r() * 6.283, d = 0.06 + r() * 0.08
    lobes.push([Math.cos(a) * d, top + 0.12 + r() * 0.14, Math.sin(a) * d, (birch ? 0.1 : 0.14) + r() * 0.04])
  }
  const wood = new BufferGeometry()
  wood.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  wood.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  wood.setIndex(idx)

  // the crown's middle and top, for how deep a card sits
  let mx = 0, my = 0, mz = 0
  for (const [lx, ly, lz] of lobes) { mx += lx; my += ly; mz += lz }
  mx /= lobes.length; my /= lobes.length; mz /= lobes.length
  let reach = 0
  for (const [lx, ly, lz, lr] of lobes) reach = Math.max(reach, Math.hypot(lx - mx, (ly - my) * 1.3, lz - mz) + lr)
  const cp: number[] = [], cn: number[] = [], cu: number[] = [], cs: number[] = [], ci: number[] = []
  for (const [lx, ly, lz, lr] of lobes) {
    const cards = birch ? 26 : 34
    for (let k = 0; k < cards; k++) {
      // points spread through the outer part of the lobe, cards facing outward and tilted at random
      const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u)
      const nx = q * Math.cos(a), ny = u * 0.8 + 0.2, nz = q * Math.sin(a)
      const out = 0.55 + 0.5 * r()
      const px = lx + nx * lr * out, py = ly + ny * lr * out * (birch ? 1.25 : 1), pz = lz + nz * lr * out
      const size = lr * (0.36 + r() * 0.26)
      let tx = -nz, tz = nx
      const tl = Math.hypot(tx, tz) || 1
      tx /= tl; tz /= tl
      const droop = birch ? -0.6 : 0
      const bx = ny * tz, by = nz * tx - nx * tz + droop, bz = -ny * tx
      // how deep: 0 in the heart of the crown, 1 on its outside; lit more on the top
      const depth = Math.min(1, Math.hypot(px - mx, (py - my) * 1.3, pz - mz) / reach)
      const shade = Math.min(1.15, 0.35 + 0.65 * Math.pow(depth, 1.4) + 0.25 * Math.max(0, (py - my) / reach))
      const o = cp.length / 3
      for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        cp.push(px + (tx * su + bx * sv) * size, py + by * sv * size, pz + (tz * su + bz * sv) * size)
        const l = Math.hypot(nx, ny + 0.35, nz)
        cn.push(nx / l, (ny + 0.35) / l, nz / l)
        cu.push((su + 1) / 2, (sv + 1) / 2)
        cs.push(shade)
      }
      ci.push(o, o + 1, o + 2, o + 1, o + 3, o + 2)
    }
  }
  const crown = new BufferGeometry()
  crown.setAttribute('position', new BufferAttribute(new Float32Array(cp), 3))
  crown.setAttribute('normal', new BufferAttribute(new Float32Array(cn), 3))
  crown.setAttribute('uv', new BufferAttribute(new Float32Array(cu), 2))
  crown.setAttribute('aShade', new BufferAttribute(new Float32Array(cs), 1))
  crown.setIndex(ci)
  // The dark heart of each mass of leaves, smaller than the mass, so the crown is not seen through but keeps its holes.
  const parts = lobes.map(([lx, ly, lz, lr], k) => {
    const g = lump(lr * 0.55, 1, k + seed * 7)
    g.translate(lx, ly, lz)
    return g
  })
  const core = mergeGeometries(parts)!
  for (const p of parts) p.dispose()
  return { wood, crown, core }
}

// A rounded, uneven mass with smooth shading.
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
  g.computeVertexNormals()
  return g
}

// A hardwood far off: a few rounded masses on a stub of trunk.
function hardwoodFar(detail: number): BufferGeometry {
  const r = rng(21)
  const parts: BufferGeometry[] = []
  // One broad mass, others crowding round it and smaller ones breaking the outline, on a bare length of trunk.
  const masses: [number, number, number, number][] = [[0, 0.6, 0, 0.27]]
  for (let k = 0; k < 5; k++) { const a = k * 1.26 + r(); masses.push([Math.cos(a) * 0.21, 0.38 + r() * 0.3, Math.sin(a) * 0.21, 0.15 + r() * 0.07]) }
  for (let k = 0; k < (detail ? 4 : 2); k++) { const a = r() * 6.28; masses.push([Math.cos(a) * 0.34, 0.34 + r() * 0.4, Math.sin(a) * 0.34, 0.08 + r() * 0.05]) }
  masses.forEach(([x, y, z, rad], k) => {
    const g = lump(rad, k < 3 ? detail : 0, k, 0.8)
    g.translate(x, y, z)
    parts.push(g)
  })
  const trunk = new CylinderGeometry(0.024, 0.04, 0.4, 5, 1, true)
  trunk.deleteAttribute('uv')
  trunk.translate(0, 0.2, 0)
  parts.push(trunk)
  const merged = mergeGeometries(parts)!
  for (const p of parts) p.dispose()
  return merged
}

interface Kind { geo: BufferGeometry; mat: MeshStandardMaterial; wide: number; sink: number; depth?: MeshDepthMaterial; shadow: boolean }
interface Chunk { near: InstancedMesh[]; far: InstancedMesh[]; sphere: Sphere; fixed: boolean }

// Trees are laid out in patches of ground, each its own set of meshes so what is out of sight is not drawn, nor drawn
// into a shadow it cannot reach. On and near the farm a patch has whole trees for when the camera is close and simpler
// ones for when it is not.
const CELL = 34
const NEAR_AT = { high: 80, medium: 58, low: 40 }

export class Flora {
  readonly group = new Group()
  private disposables: { dispose(): void }[] = []
  private chunks = new Map<string, Chunk>()
  private nearAt = NEAR_AT.high
  private v = new Vector3()

  constructor(sprayTex: Texture) {
    const r = rng(2024)
    // Trees that can be seen close (on and near the farm), and trees only ever seen from far off.
    type Cls = 'spruce' | 'fir' | 'maple' | 'birch' | 'shrub' | 'conFar' | 'conDistant' | 'broadFar' | 'broadDistant'
    const trees: Record<Cls, Tree[]> = { spruce: [], fir: [], maple: [], birch: [], shrub: [], conFar: [], conDistant: [], broadFar: [], broadDistant: [] }
    const built = [POTATO_HOUSE, DUFOUR_POTATO_HOUSE, DUFOUR_HOUSE, DUFOUR_BARN]
    const open = (x: number, z: number) =>
      roadDist(x, z) > 1.8 && Math.abs(z - townRoadZ(x)) > 3.2 && Math.abs(z - hillRoadZ(x)) > 3.2 && Math.abs(z - brookZ(x)) > brookHalf(x) + 0.7
      && built.every(b => Math.hypot(x - b.x, z - b.z) > 5.2) && fieldMask(x, z, 1.2) < 0.01
    const broad = (t: Tree) => (t.r < 0.45 ? trees.maple : trees.birch).push(t)
    const conifer1 = (t: Tree) => (r() < 0.36 ? trees.fir : trees.spruce).push(t)

    // The woods along the ridge above the fields.
    const h = HOME_WOODS
    for (let z = h.z0 - 4; z < h.z1 + 1; z += 1.9) {
      for (let x = h.x0 - 4; x < h.x1 + 4; x += 1.9) {
        const jx = x + (r() - 0.5) * 1.7, jz = z + (r() - 0.5) * 1.7
        const w = woodsAt(jx, jz)
        if (w.woods < 0.5 || !open(jx, jz) || r() < 0.1) continue
        const front = jz > h.z1 - 4.5
        const t: Tree = { x: jx, z: jz, s: (front ? 3.6 : 5.2) + r() * 3.4, r: r(), hue: r() }
        if (r() < w.hard) broad({ ...t, s: 3.2 + r() * 2.2 })
        else conifer1(t)
      }
    }
    // By the house, along the lane and on the brook; the Dufour dooryard's maple, and a few along the road between.
    broad({ x: 27.3, z: 9.4, s: 6.4, r: 0.3, hue: 0.12 }); broad({ x: 20.2, z: 10.6, s: 3.4, r: 0.7, hue: 0.62 }); broad({ x: 27.6, z: -2.4, s: 4.4, r: 0.5, hue: 0.8 })
    for (let k = 0; k < 4; k++) {
      const t = { x: 28.2 + r() * 1.4, z: -8.6 + k * 2.3 + r(), s: 4 + r() * 2.2, r: r(), hue: r() }
      if (roadDist(t.x, t.z) > 1.8) trees.spruce.push(t)
    }
    broad({ x: 97.4, z: 6.6, s: 6.8, r: 0.22, hue: 0.2 }); broad({ x: 89.0, z: 4.6, s: 4.2, r: 0.62, hue: 0.7 })
    for (let k = 0; k < 3; k++) trees.spruce.push({ x: 98.6 + r() * 1.6, z: -10 + k * 2.6, s: 4.2 + r() * 2, r: r(), hue: r() })
    for (let x = 30; x < 48; x += 2.2 + r() * 3) {
      const side = r() < 0.5 ? -1 : 1, z = -8.4 + side * (2.4 + r() * 1.2) - (x < 40 ? (40 - x) * 0.35 : 0)
      if (!open(x, z)) continue
      if (r() < 0.55) trees.shrub.push({ x, z, s: 1.2 + r(), r: r(), hue: r() })
      else broad({ x, z, s: 3.4 + r() * 2.4, r: r(), hue: r() })
    }
    for (let x = -150; x < 170; x += 1.5 + r() * 2.6) {
      if (Math.abs(x - 17.8) < 3.2 || Math.abs(x - 92.6) < 3.2 || (x > -26 && x < 13)) continue
      const side = r() < 0.5 ? -1 : 1, bz = brookZ(x), off = brookHalf(x) + 0.9 + r() * 1.6
      // Fewer on the farm's own bank, so the view across the brook stays open.
      if (side < 0 && x > FARM.x0 - 4 && x < FARM.x1 && r() < 0.62) continue
      const z = bz + side * off
      if (r() < 0.72) trees.shrub.push({ x, z, s: 1.1 + r() * 1.1, r: r(), hue: r() })
      else broad({ x, z: bz + side * (off + 1), s: 3 + r() * 2.4, r: r(), hue: r() })
    }
    // The country: woodlots thinning with distance, each tree standing for more as they go, and hedgerow trees.
    const reach = 1500
    for (let tries = 0; tries < 160000; tries++) {
      const a = r() * Math.PI * 2, d = 40 + Math.pow(r(), 1.7) * reach
      const x = FARM_CENTER.x + Math.cos(a) * d, z = FARM_CENTER.z + Math.sin(a) * d
      if (trees.conFar.length + trees.broadFar.length + trees.conDistant.length + trees.broadDistant.length > 11000) break
      const w = woodsAt(x, z)
      if (w.woods <= 0 || !open(x, z)) continue
      const sparse = 1 / (1 + d / 260)
      if (r() > w.woods * (0.3 + 0.7 * sparse)) continue
      const grow = 1 + d / 520
      const t: Tree = { x, z, s: (4.2 + r() * 3.6) * grow, r: r(), hue: r() }
      const near = d < 95
      if (r() < w.hard) {
        if (near) broad({ ...t, s: (3.2 + r() * 2.4) * grow })
        else (d < 330 ? trees.broadFar : trees.broadDistant).push({ ...t, s: (3.2 + r() * 2.4) * grow })
      } else if (near) conifer1(t)
      else (d < 340 ? trees.conFar : trees.conDistant).push(t)
    }
    // Trees round the neighbours' farmsteads.
    for (const [fx, fz] of FARMSTEADS) {
      for (let k = 0; k < 5; k++) {
        const x = fx + (r() - 0.5) * 16, z = fz + (r() - 0.5) * 14
        if (Math.hypot(x - fx, z - fz) < 5 || !open(x, z)) continue
        ;(r() < 0.6 ? trees.broadFar : trees.conFar).push({ x, z, s: 4.5 + r() * 3, r: r(), hue: r() })
      }
    }

    const windy: Patch = { vertexWorld: sway('vec2(instanceMatrix[3].x, instanceMatrix[3].z)', 'max(cWorld.y - instanceMatrix[3].y, 0.0)', '0.02') }
    const cMat = patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0, side: DoubleSide }), {
      ...windy,
      key: 'county-conifer',
      ambient: 0.62,
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree;',
      vertexBegin: 'vTree = aTree;',
      fragmentHead: 'varying vec4 vTree;',
      // Each bough's needles catch the light a little differently.
      fragmentColor: `diffuseColor.rgb *= mix(${linear('#13231b')}, ${linear('#223b27')}, vTree.y) * vTree.z * (0.72 + 0.56 * texture2D(uNoise, vWorld.xz * 0.8 + vWorld.y * 0.9).a); ${SNOW_RIME_TREE}`,
    })
    // Hardwoods: green in summer, turning by the tree in late September, bare by November.
    const LEAF = /* glsl */ `
      {
        vec3 summer = mix(${linear('#557f38')}, ${linear('#7da04a')}, vTree.y);
        vec3 fall = vTree.x < 0.34 ? ${linear('#c4562a')} : vTree.x < 0.7 ? ${linear('#dcae3a')} : ${linear('#c9822e')};
        float turned = smoothstep(vTree.y * 0.55, vTree.y * 0.55 + 0.45, uGold);
        diffuseColor.rgb *= mix(summer, fall, turned) * vTree.z;
      }
    `
    const barkMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: DoubleSide }), {
      ...windy,
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree; varying float vUp;',
      vertexBegin: 'vTree = aTree; vUp = position.y;',
      fragmentHead: 'varying vec4 vTree; varying float vUp;',
      // Birch where the tree's number says so: white bark with dark bands. The rest grey-brown.
      fragmentColor: `
        float band = step(0.8, fract(vUp * 23.0 + vTree.x * 7.0)) * step(0.4, fract(vUp * 7.3));
        vec3 birch = mix(${linear('#e4e0d4')}, ${linear('#3a3632')}, band);
        diffuseColor.rgb = mix(${linear('#5e5448')}, birch, step(0.45, vTree.x) * step(vUp, 0.62));
        ${SNOW_RIME_TREE}`,
    })
    const crownPatch: Patch = {
      key: 'county-crown',
      vertexHead: 'attribute vec4 aTree; attribute float aShade; varying vec4 vTree; varying float vShade;',
      vertexBegin: 'vTree = aTree; vShade = aShade;',
      vertexWorld: `${sway('vec2(instanceMatrix[3].x, instanceMatrix[3].z)', 'max(cWorld.y - instanceMatrix[3].y, 0.0)', '0.035')}
        cWorld.xyz += sin(uTime * 3.1 + position.x * 31.0 + position.y * 17.0 + aTree.x * 20.0) * 0.012 * aTree.w * min(uSway, 1.0);`,
    }
    const crownMat = patch(new MeshStandardMaterial({ map: sprayTex, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide, roughness: 0.7, metalness: 0 }), {
      ...crownPatch,
      translucent: 0.9,
      ambient: 0.85,
      fragmentHead: 'varying vec4 vTree; varying float vShade;',
      // Deep in the crown is dark; leaves thin out as they fall, the bare limbs show through, then stand alone.
      fragmentColor: `${LEAF} diffuseColor.rgb *= vShade * (0.86 + 0.28 * texture2D(uNoise, vMapUv * 0.37 + vTree.xy).a); diffuseColor.a *= coverGain(vMapUv, 128.0) * smoothstep(0.0, 0.5, uLeaf * 1.5 - texture2D(uNoise, vMapUv * 0.8 + vTree.xy).a); ${SNOW_RIME_TREE}`,
    })
    const coreMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), {
      ...windy,
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree;',
      vertexBegin: 'vTree = aTree; transformed *= vec3(uLeaf, 1.0, uLeaf); transformed.y = mix(0.6, transformed.y, uLeaf);',
      fragmentHead: 'varying vec4 vTree;',
      fragmentColor: `${LEAF} diffuseColor.rgb *= 0.26 + 0.34 * texture2D(uNoise, vWorld.xz * 1.3 + vWorld.y * 0.9).a; ${SNOW_RIME_TREE}`,
    })
    const farMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), {
      ...windy,
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree; varying float vUp; varying float vBark;',
      // With the leaves down a far tree is a thin grey shape.
      vertexBegin: 'vTree = aTree; vUp = position.y; vBark = step(length(position.xz), 0.045) * step(position.y, 0.42); transformed.xz *= mix(0.45, 1.0, uLeaf);',
      fragmentHead: 'varying vec4 vTree; varying float vUp; varying float vBark;',
      // Leaf masses: mottled, darker underneath, the trunk bare below.
      fragmentColor: `${LEAF} diffuseColor.rgb = mix(${linear('#5a5046')}, diffuseColor.rgb * (0.66 + 0.7 * texture2D(uNoise, vWorld.xz * 0.7 + vWorld.y * 0.5).a), uLeaf * (1.0 - step(0.5, vBark))) * (0.5 + 0.66 * vUp); ${SNOW_RIME_TREE}`,
    })
    // Alder: the same rounded masses, low and dark, standing in the brook's bank.
    const alderMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), {
      ...windy,
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree; varying float vUp;',
      vertexBegin: 'vTree = aTree; vUp = position.y; transformed.xz *= mix(0.6, 1.0, uLeaf);',
      fragmentHead: 'varying vec4 vTree; varying float vUp;',
      fragmentColor: `diffuseColor.rgb = mix(${linear('#5a5046')}, mix(${linear('#3f6a36')}, ${linear('#a8843a')}, uGold * vTree.y), uLeaf) * vTree.z * (0.65 + 0.55 * vUp); ${SNOW_RIME_TREE}`,
    })
    const crownDepth = depthFor(crownPatch)
    this.disposables.push(cMat, barkMat, crownMat, coreMat, farMat, alderMat, crownDepth)
    const maple = hardwood(3, false), birch = hardwood(11, true)
    const g = {
      spruce: conifer(9, 7, 0.2, 5), fir: conifer(11, 6, 0.13, 9), conFar: conifer(6, 6, 0.2, 13), conDistant: conifer(4, 5, 0.21, 17),
      far1: hardwoodFar(1), far0: hardwoodFar(0),
    }
    this.disposables.push(maple.wood, maple.crown, maple.core, birch.wood, birch.crown, birch.core, ...Object.values(g))
    const k = (geo: BufferGeometry, mat: MeshStandardMaterial, wide: number, sink: number, shadow = true, depth?: MeshDepthMaterial): Kind => ({ geo, mat, wide, sink, shadow, depth })
    // What each tree is drawn with close to, and far from, the camera.
    const near: Record<string, Kind[]> = {
      spruce: [k(g.spruce, cMat, 1, 0.02)], fir: [k(g.fir, cMat, 1, 0.02)],
      maple: [k(maple.wood, barkMat, 0.8, 0.01), k(maple.crown, crownMat, 0.8, 0.01, true, crownDepth), k(maple.core, coreMat, 0.8, 0.01)],
      birch: [k(birch.wood, barkMat, 0.7, 0.01), k(birch.crown, crownMat, 0.7, 0.01, true, crownDepth), k(birch.core, coreMat, 0.7, 0.01)],
      shrub: [k(g.far1, alderMat, 1.7, 0.42)],
    }
    const far: Record<string, Kind[]> = {
      spruce: [k(g.conFar, cMat, 1, 0.02)], fir: [k(g.conFar, cMat, 0.75, 0.02)],
      maple: [k(g.far1, farMat, 1.15, 0.2)], birch: [k(g.far1, farMat, 0.95, 0.2)], shrub: [k(g.far0, alderMat, 1.7, 0.42)],
      conFar: [k(g.conFar, cMat, 1, 0.02)], conDistant: [k(g.conDistant, cMat, 1, 0.02, false)],
      broadFar: [k(g.far1, farMat, 1.15, 0.2)], broadDistant: [k(g.far0, farMat, 1.15, 0.2, false)],
    }
    // Lay each class out by patch: near-and-far patches on and round the farm, far-only patches beyond.
    for (const cls of Object.keys(trees) as Cls[]) {
      const byCell = new Map<string, Tree[]>()
      const both = cls in near
      for (const t of trees[cls]) {
        const cell = both ? CELL : 160
        const key = `${both ? 'n' : 'f'}|${Math.floor(t.x / cell)}|${Math.floor(t.z / cell)}`
        let list = byCell.get(key)
        if (!list) byCell.set(key, (list = []))
        list.push(t)
      }
      for (const [key, list] of byCell) {
        let ch = this.chunks.get(key)
        if (!ch) this.chunks.set(key, (ch = { near: [], far: [], sphere: new Sphere(), fixed: !both }))
        for (const kind of far[cls]) ch.far.push(this.place(kind, list, true))
        if (both) for (const kind of near[cls]) ch.near.push(this.place(kind, list, false))
      }
    }
    for (const ch of this.chunks.values()) {
      const all = [...ch.near, ...ch.far]
      all.forEach((m, i) => { if (i === 0) ch.sphere.copy(m.boundingSphere!); else ch.sphere.union(m.boundingSphere!) })
      for (const m of ch.near) m.visible = false
    }
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
      const w = t.s * kind.wide * (0.82 + 0.36 * t.r)
      mesh.setMatrixAt(n, m.compose(p.set(t.x, groundY(t.x, t.z) - kind.sink * t.s, t.z), q, sc.set(w, t.s, w)))
      info.set([t.r, t.hue, 0.78 + 0.44 * hash2(Math.round(t.x * 7), Math.round(t.z * 7)), t.s], n * 4)
    })
    geo.setAttribute('aTree', new InstancedBufferAttribute(info, 4))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.castShadow = kind.shadow
    mesh.receiveShadow = !far
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
