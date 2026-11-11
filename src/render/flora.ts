// Trees: the spruce and fir of the ridge woodlot, birch and maple along its edge and by the house, alder on the brook,
// and the woodlots and hedgerows of the country beyond. Near the farm they are whole trees; far off, simpler ones.
import {
  BufferAttribute, BufferGeometry, DoubleSide, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshStandardMaterial, Quaternion, Vector3, type Texture,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FARM, FARM_CENTER, HOME_WOODS, POTATO_HOUSE, brookHalf, brookZ, groundY, hillRoadZ, roadDist, townRoadZ, woodsAt } from './layout.ts'
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

// A hardwood one unit high: a trunk and limbs, and a crown of leaf sprays set on a few rounded masses.
function hardwood(seed: number): { wood: BufferGeometry; crown: BufferGeometry } {
  const r = rng(seed)
  const pos: number[] = [], nrm: number[] = [], idx: number[] = []
  const limb = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number) => {
    const o = pos.length / 3
    const dx = bx - ax, dy = by - ay, dz = bz - az
    const ux = Math.abs(dy) > 0.9 * Math.hypot(dx, dy, dz) ? 1 : 0, uy = ux ? 0 : 1
    let sx = dy * 0 - dz * uy, sy = dz * ux - dx * 0, sz = dx * uy - dy * ux
    const sl = Math.hypot(sx, sy, sz) || 1
    sx /= sl; sy /= sl; sz /= sl
    const l = Math.hypot(dx, dy, dz) || 1
    const tx = (dy * sz - dz * sy) / l, ty = (dz * sx - dx * sz) / l, tz = (dx * sy - dy * sx) / l
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
      const nx = sx * c + tx * s, ny = sy * c + ty * s, nz = sz * c + tz * s
      pos.push(ax + nx * ra, ay + ny * ra, az + nz * ra, bx + nx * rb, by + ny * rb, bz + nz * rb)
      nrm.push(nx, ny, nz, nx, ny, nz)
      const q = o + k * 2, n = o + ((k + 1) % 5) * 2
      idx.push(q, n, q + 1, q + 1, n, n + 1)
    }
  }
  limb(0, 0, 0, 0.02, 0.5, 0.01, 0.04, 0.026)
  const lobes: [number, number, number, number][] = []
  for (let k = 0; k < 5; k++) {
    const a = k * 2.4 + r(), d = k === 0 ? 0 : 0.14 + r() * 0.12
    const lx = Math.cos(a) * d, lz = Math.sin(a) * d, ly = 0.58 + r() * 0.24 - d * 0.5
    lobes.push([lx, ly, lz, 0.17 + r() * 0.07])
    limb(0.02, 0.36 + r() * 0.12, 0.01, lx, ly, lz, 0.02, 0.006)
  }
  const wood = new BufferGeometry()
  wood.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  wood.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  wood.setIndex(idx)

  const cp: number[] = [], cn: number[] = [], cu: number[] = [], ci: number[] = []
  for (const [lx, ly, lz, lr] of lobes) {
    for (let k = 0; k < 9; k++) {
      // points spread over the lobe's surface, cards facing outward and tilted at random
      const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u)
      const nx = q * Math.cos(a), ny = u * 0.8 + 0.2, nz = q * Math.sin(a)
      const px = lx + nx * lr * 0.86, py = ly + ny * lr * 0.86, pz = lz + nz * lr * 0.86
      const size = lr * (0.9 + r() * 0.5)
      let tx = -nz, tz = nx
      const tl = Math.hypot(tx, tz) || 1
      tx /= tl; tz /= tl
      const bx = ny * tz, by = nz * tx - nx * tz, bz = -ny * tx
      const o = cp.length / 3
      for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        cp.push(px + (tx * su + bx * sv) * size, py + by * sv * size, pz + (tz * su + bz * sv) * size)
        const l = Math.hypot(nx, ny + 0.35, nz)
        cn.push(nx / l, (ny + 0.35) / l, nz / l)
        cu.push((su + 1) / 2, (sv + 1) / 2)
      }
      ci.push(o, o + 1, o + 2, o + 1, o + 3, o + 2)
    }
  }
  const crown = new BufferGeometry()
  crown.setAttribute('position', new BufferAttribute(new Float32Array(cp), 3))
  crown.setAttribute('normal', new BufferAttribute(new Float32Array(cn), 3))
  crown.setAttribute('uv', new BufferAttribute(new Float32Array(cu), 2))
  crown.setIndex(ci)
  return { wood, crown }
}

// A hardwood far off: a few rounded masses on a stub of trunk.
function hardwoodFar(detail: number): BufferGeometry {
  const r = rng(21)
  const parts: BufferGeometry[] = []
  for (let k = 0; k < 4; k++) {
    const g = new IcosahedronGeometry(0.2 + r() * 0.07, detail)
    const p = g.getAttribute('position') as BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const j = 1 + (hash2(Math.round(p.getX(i) * 90) + k * 7, Math.round(p.getY(i) * 90 + p.getZ(i) * 51)) - 0.5) * 0.3
      p.setXYZ(i, p.getX(i) * j, p.getY(i) * j * 0.86, p.getZ(i) * j)
    }
    g.translate(k === 0 ? 0 : (r() - 0.5) * 0.3, 0.56 + r() * 0.22, k === 0 ? 0 : (r() - 0.5) * 0.3)
    g.deleteAttribute('uv')
    parts.push(g)
  }
  const merged = mergeGeometries(parts)!
  merged.computeVertexNormals()
  for (const p of parts) p.dispose()
  return merged
}

export class Flora {
  readonly group = new Group()
  private disposables: { dispose(): void }[] = []

  constructor(sprayTex: Texture) {
    const r = rng(2024)
    const spruceNear: Tree[] = [], firNear: Tree[] = [], coniferFar: Tree[] = [], coniferDistant: Tree[] = [], broadNear: Tree[] = [], broadFar: Tree[] = [], shrubs: Tree[] = []
    const open = (x: number, z: number) =>
      roadDist(x, z) > 1.8 && Math.abs(z - townRoadZ(x)) > 3.2 && Math.abs(z - hillRoadZ(x)) > 3.2 && Math.abs(z - brookZ(x)) > brookHalf(x) + 0.7
      && Math.hypot(x - POTATO_HOUSE.x, z - POTATO_HOUSE.z) > 5.2

    // The home woodlot on the ridge above the fields.
    const h = HOME_WOODS
    for (let z = h.z0 - 4; z < h.z1 + 1; z += 1.9) {
      for (let x = h.x0 - 4; x < h.x1 + 4; x += 1.9) {
        const jx = x + (r() - 0.5) * 1.7, jz = z + (r() - 0.5) * 1.7
        const w = woodsAt(jx, jz)
        if (w.woods < 0.5 || !open(jx, jz) || r() < 0.1) continue
        const front = jz > h.z1 - 4.5
        const t: Tree = { x: jx, z: jz, s: (front ? 3.6 : 5.2) + r() * 3.4, r: r(), hue: r() }
        if (r() < w.hard) broadNear.push({ ...t, s: 3.2 + r() * 2.2 })
        else (r() < 0.36 ? firNear : spruceNear).push(t)
      }
    }
    // By the house, along the lane and on the brook.
    broadNear.push({ x: 20.4, z: 8.6, s: 6.2, r: 0.3, hue: 0.12 }, { x: 26.6, z: 7.6, s: 4.6, r: 0.7, hue: 0.62 }, { x: 27.4, z: -2.4, s: 4.2, r: 0.5, hue: 0.8 })
    for (let k = 0; k < 4; k++) spruceNear.push({ x: 27.6 + r() * 1.4, z: -12 + k * 2.3 + r(), s: 4 + r() * 2.2, r: r(), hue: r() })
    for (let x = -150; x < 170; x += 1.5 + r() * 2.6) {
      if (Math.abs(x - 17.8) < 3.2 || (x > -26 && x < 13)) continue
      const side = r() < 0.5 ? -1 : 1, bz = brookZ(x), off = brookHalf(x) + 0.9 + r() * 1.6
      // Fewer on the farm's own bank, so the view across the brook stays open.
      if (side < 0 && x > FARM.x0 - 4 && x < FARM.x1 && r() < 0.62) continue
      const z = bz + side * off
      if (r() < 0.72) shrubs.push({ x, z, s: 1.1 + r() * 1.1, r: r(), hue: r() })
      else (Math.abs(x - FARM_CENTER.x) < 90 ? broadNear : broadFar).push({ x, z: bz + side * (off + 1), s: 3 + r() * 2.4, r: r(), hue: r() })
    }
    // The country: woodlots thinning with distance, each tree standing for more as they go, and hedgerow trees.
    const reach = 1500
    for (let tries = 0; tries < 160000; tries++) {
      const a = r() * Math.PI * 2, d = 40 + Math.pow(r(), 1.7) * reach
      const x = FARM_CENTER.x + Math.cos(a) * d, z = FARM_CENTER.z + Math.sin(a) * d
      if (coniferFar.length + broadFar.length + coniferDistant.length > 11000) break
      const w = woodsAt(x, z)
      if (w.woods <= 0 || !open(x, z)) continue
      const sparse = 1 / (1 + d / 260)
      if (r() > w.woods * (0.3 + 0.7 * sparse)) continue
      const grow = 1 + d / 520
      const t: Tree = { x, z, s: (4.2 + r() * 3.6) * grow, r: r(), hue: r() }
      const near = d < 95
      if (r() < w.hard) (near ? broadNear : broadFar).push({ ...t, s: (3.2 + r() * 2.4) * grow })
      else if (near) (r() < 0.36 ? firNear : spruceNear).push(t)
      else (d < 340 ? coniferFar : coniferDistant).push(t)
    }
    // Trees round the neighbours' farmsteads.
    for (const [fx, fz] of FARMSTEADS) {
      for (let k = 0; k < 5; k++) {
        const x = fx + (r() - 0.5) * 16, z = fz + (r() - 0.5) * 14
        if (Math.hypot(x - fx, z - fz) < 5 || !open(x, z)) continue
        ;(r() < 0.6 ? broadFar : coniferFar).push({ x, z, s: 4.5 + r() * 3, r: r(), hue: r() })
      }
    }

    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3(), up = new Vector3(0, 1, 0)
    const place = (geo: BufferGeometry, mat: MeshStandardMaterial, trees: Tree[], wide: number, sink: number, far: boolean, depth?: Patch): InstancedMesh => {
      const mesh = new InstancedMesh(geo, mat, trees.length)
      const info = new Float32Array(trees.length * 4)
      trees.forEach((t, k) => {
        q.setFromAxisAngle(up, t.r * 6.283)
        const w = t.s * wide * (0.82 + 0.36 * t.r)
        mesh.setMatrixAt(k, m.compose(p.set(t.x, groundY(t.x, t.z) - sink * t.s, t.z), q, sc.set(w, t.s, w)))
        info.set([t.r, t.hue, 0.78 + 0.44 * hash2(k, 5), t.s], k * 4)
      })
      geo.setAttribute('aTree', new InstancedBufferAttribute(info, 4))
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = true
      mesh.receiveShadow = !far
      // Far trees shadow only into the last cascade; near ones into all three.
      if (!far) mesh.layers.enable(1)
      mesh.layers.enable(2)
      mesh.frustumCulled = false
      if (depth) {
        const d = depthFor(depth)
        mesh.customDepthMaterial = d
        this.disposables.push(d)
      }
      this.group.add(mesh)
      this.disposables.push(geo, mat)
      return mesh
    }

    const windy: Patch = { vertexWorld: sway('vec2(instanceMatrix[3].x, instanceMatrix[3].z)', 'max(cWorld.y - instanceMatrix[3].y, 0.0)', '0.02') }
    const coniferMat = (key: string) => patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0, side: DoubleSide }), {
      ...windy,
      key,
      ambient: 0.9,
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree;',
      vertexBegin: 'vTree = aTree;',
      fragmentHead: 'varying vec4 vTree;',
      fragmentColor: `diffuseColor.rgb *= mix(${linear('#1d3329')}, ${linear('#2d4a33')}, vTree.y) * vTree.z; ${SNOW_RIME_TREE}`,
    })
    place(conifer(9, 7, 0.2, 5), coniferMat('county-conifer'), spruceNear, 1, 0.02, false)
    place(conifer(11, 6, 0.13, 9), coniferMat('county-conifer'), firNear, 1, 0.02, false)
    place(conifer(4, 5, 0.2, 13), coniferMat('county-conifer'), coniferFar, 1, 0.02, true)
    // Beyond the reach of any shadow map: these only stand against the sky.
    place(conifer(3, 4, 0.21, 17), coniferMat('county-conifer'), coniferDistant, 1, 0.02, true).castShadow = false

    // Hardwoods: green in summer, turning by the tree in late September, bare by November.
    const LEAF = /* glsl */ `
      {
        vec3 summer = mix(${linear('#5c8a3c')}, ${linear('#7da04a')}, vTree.y);
        vec3 fall = vTree.x < 0.34 ? ${linear('#c4562a')} : vTree.x < 0.7 ? ${linear('#dcae3a')} : ${linear('#c9822e')};
        float turned = smoothstep(vTree.y * 0.55, vTree.y * 0.55 + 0.45, uGold);
        diffuseColor.rgb *= mix(summer, fall, turned) * vTree.z;
      }
    `
    const wood = hardwood(3)
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
    place(wood.wood, barkMat, broadNear, 1, 0.01, false)
    const crownPatch: Patch = {
      key: 'county-crown',
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree;',
      vertexBegin: 'vTree = aTree;',
      vertexWorld: `${sway('vec2(instanceMatrix[3].x, instanceMatrix[3].z)', 'max(cWorld.y - instanceMatrix[3].y, 0.0)', '0.035')}
        cWorld.xyz += sin(uTime * 3.1 + position.x * 31.0 + position.y * 17.0 + aTree.x * 20.0) * 0.012 * aTree.w * min(uSway, 1.0);`,
    }
    const crownMat = patch(new MeshStandardMaterial({ map: sprayTex, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide, roughness: 0.7, metalness: 0 }), {
      ...crownPatch,
      translucent: 0.9,
      fragmentHead: 'varying vec4 vTree;',
      // Leaves thin out as they fall: the bare limbs show through, then stand alone.
      fragmentColor: `${LEAF} diffuseColor.a *= smoothstep(0.0, 0.5, uLeaf * 1.5 - texture2D(uNoise, vMapUv * 0.8 + vTree.xy).a); ${SNOW_RIME_TREE}`,
    })
    const crown = place(wood.crown, crownMat, broadNear, 1, 0.01, false, crownPatch)
    crown.receiveShadow = true
    const farMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), {
      ...windy,
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree; varying float vUp;',
      // With the leaves down a far tree is a thin grey shape.
      vertexBegin: 'vTree = aTree; vUp = position.y; transformed.xz *= mix(0.45, 1.0, uLeaf);',
      fragmentHead: 'varying vec4 vTree; varying float vUp;',
      fragmentColor: `${LEAF} diffuseColor.rgb = mix(${linear('#5a5046')}, diffuseColor.rgb, uLeaf) * (0.7 + 0.5 * vUp); ${SNOW_RIME_TREE}`,
    })
    place(hardwoodFar(0), farMat, broadFar, 1.15, 0.2, true)
    // Alder: the same rounded masses, low and dark, standing in the brook's bank.
    const alderMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), {
      ...windy,
      vertexHead: 'attribute vec4 aTree; varying vec4 vTree; varying float vUp;',
      vertexBegin: 'vTree = aTree; vUp = position.y; transformed.xz *= mix(0.6, 1.0, uLeaf);',
      fragmentHead: 'varying vec4 vTree; varying float vUp;',
      fragmentColor: `diffuseColor.rgb = mix(${linear('#5a5046')}, mix(${linear('#3f6a36')}, ${linear('#a8843a')}, uGold * vTree.y), uLeaf) * vTree.z * (0.65 + 0.55 * vUp); ${SNOW_RIME_TREE}`,
    })
    place(hardwoodFar(1), alderMat, shrubs, 1.7, 0.42, false)
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
