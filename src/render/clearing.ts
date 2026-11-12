// What clearing leaves on the land, and what lies on every field: the stumps and slash where a tract's trees stood, the
// stems just felled and the logs piled at its edge, the rows of stumps a bulldozer pushes up, field stone and the piles
// and walls it is picked into, and the brush of the hedgerows at whatever age it has reached since it was last cut.
import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshStandardMaterial, Quaternion, Vector3,
} from 'three'
import { FIELD_COUNT, PARCELS, STUMP_DAYS, TRACTS } from '../sim/index.ts'
import type { Flora } from './flora.ts'
import { FD, FIELDS, FW, WALLS, fieldBaseY, groundY, roadDist } from './layout.ts'
import { fbm2, hash2, rng } from './noise.ts'
import { SNOW_RIME, patch } from './shaders.ts'
import type { FieldVis } from './state.ts'

const STONES_FULL = 230        // stones drawn on a field as stony as ground can be
const UP = new Vector3(0, 1, 0)

// A cylinder whose side is bark and whose ends are fresh-cut wood.
function wood(radiusTop: number, radiusBottom: number, along: 'x' | 'y'): BufferGeometry {
  const g = new CylinderGeometry(radiusTop, radiusBottom, 1, 7, 1).toNonIndexed()
  g.deleteAttribute('uv')
  const n = g.getAttribute('normal') as BufferAttribute
  const col = new Float32Array(n.count * 3)
  for (let i = 0; i < n.count; i++) {
    const end = Math.abs(n.getY(i)) > 0.9
    col.set(end ? [0.72, 0.58, 0.36] : [0.2, 0.165, 0.135], i * 3)
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  if (along === 'x') g.rotateZ(Math.PI / 2)
  else g.translate(0, 0.5, 0)
  return g
}

function rough(detail: number, seed: number, amount: number, flat: number): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail)
  g.deleteAttribute('uv')
  const p = g.getAttribute('position') as BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (hash2(Math.round(p.getX(i) * 50) + seed, Math.round(p.getY(i) * 50 + p.getZ(i) * 31)) - 0.5) * amount
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * flat, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

interface Hedge { x: number; z: number; field: number; s: number; r: number }

export class Clearing {
  readonly group = new Group()
  private flora: Flora
  private stumps: InstancedMesh
  private logs: InstancedMesh
  private heaps: InstancedMesh
  private rocks: InstancedMesh
  private brush: InstancedMesh
  private hedges: Hedge[] = []
  private key = ''
  private disposables: { dispose(): void }[] = []
  private m = new Matrix4()
  private q = new Quaternion()
  private q2 = new Quaternion()
  private p = new Vector3()
  private s = new Vector3()
  private e = new Vector3()
  private c = new Color()

  constructor(flora: Flora) {
    this.flora = flora
    let trees = 0
    for (const i of TRACTS) trees += flora.stand(i).length
    const woodMat = patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 }), {
      key: 'county-cutwood',
      fragmentColor: `diffuseColor.rgb *= 0.74 + 0.5 * texture2D(uNoise, vWorld.xz * 1.3 + vWorld.y * 0.9).a; ${SNOW_RIME}`,
    })
    const heapMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 }), {
      key: 'county-heap',
      fragmentHead: 'vec2 heapBump;',
      // Slash and root wads: a tangle, lit in clumps.
      fragmentColor: `vec4 hn = texture2D(uNoise, vWorld.xz * 2.1 + vWorld.y * 1.7); heapBump = (hn.rg - 0.5) * 3.0; diffuseColor.rgb *= 0.5 + 0.9 * hn.a; ${SNOW_RIME}`,
      fragmentNormal: 'normal = normalize(normal + (viewMatrix * vec4(heapBump.x, 0.0, heapBump.y, 0.0)).xyz * 0.6);',
    })
    const rockMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), {
      key: 'county-fieldstone',
      fragmentColor: `diffuseColor.rgb *= 0.85 + 0.3 * texture2D(uNoise, vWorld.xz * 0.9).a; ${SNOW_RIME}`,
    })
    const stumpGeo = wood(0.82, 1.3, 'y'), logGeo = wood(1, 1, 'x'), heapGeo = rough(1, 3, 0.75, 0.5), rockGeo = rough(0, 11, 0.4, 0.72)
    this.disposables.push(woodMat, heapMat, rockMat, stumpGeo, logGeo, heapGeo, rockGeo)
    const mesh = (geo: BufferGeometry, mat: MeshStandardMaterial, n: number, shadow: boolean): InstancedMesh => {
      const im = new InstancedMesh(geo, mat, n)
      im.count = 0
      im.castShadow = shadow
      im.receiveShadow = true
      im.frustumCulled = false
      this.group.add(im)
      return im
    }
    this.stumps = mesh(stumpGeo, woodMat, trees + 4, true)
    this.logs = mesh(logGeo, woodMat, TRACTS.length * 70, true)
    this.heaps = mesh(heapGeo, heapMat, trees + TRACTS.length * 60, true)
    this.rocks = mesh(rockGeo, rockMat, FIELD_COUNT * (STONES_FULL + 50) + TRACTS.length * 160, false)
    for (const im of [this.heaps, this.rocks]) im.setColorAt(0, this.c.set('#ffffff'))

    // Hedgerow brush along the walls, in runs with gaps; each bush belongs to the field it stands beside.
    const r = rng(41)
    for (const [x0, z0, x1, z1] of WALLS) {
      const len = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / len, nz = (x1 - x0) / len
      for (let d = 0.5; d < len - 0.3; d += 0.6 + r() * 0.8) {
        const t = d / len, off = (r() - 0.5) * 0.7
        const x = x0 + (x1 - x0) * t + nx * off, z = z0 + (z1 - z0) * t + nz * off
        if (fbm2(x * 0.16 + 5.3, z * 0.16 + 1.7) < 0.47 || roadDist(x, z) < 1.7) continue
        let field = -1, best = 3.6
        for (const f of FIELDS) {
          const fd = Math.hypot(Math.max(f.x0 - x, x - f.x1, 0), Math.max(f.z0 - z, z - f.z1, 0))
          if (fd < best) { best = fd; field = f.i }
        }
        this.hedges.push({ x, z, field, s: 0.75 + r() * 0.8, r: r() })
      }
    }
    const kind = flora.bush(true)
    const geo = new BufferGeometry()
    geo.index = kind.geo.index
    for (const name of Object.keys(kind.geo.attributes)) geo.setAttribute(name, kind.geo.attributes[name])
    const info = new Float32Array(this.hedges.length * 4)
    this.hedges.forEach((h, n) => info.set([3 + Math.min(0.999, h.r), hash2(n, 5), 0.8 + 0.4 * hash2(n, 9), h.s], n * 4))
    geo.setAttribute('aTree', new InstancedBufferAttribute(info, 4))
    this.brush = new InstancedMesh(geo, kind.mat, this.hedges.length)
    this.brush.castShadow = true
    this.brush.receiveShadow = true
    this.brush.frustumCulled = false
    this.brush.layers.enable(1)
    if (kind.depth) this.brush.customDepthMaterial = kind.depth
    this.group.add(this.brush)
    this.disposables.push(geo)
  }

  private put(mesh: InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, tilt = 0, tint?: string): void {
    const n = mesh.count
    if (n >= mesh.instanceMatrix.count) return
    this.q.setFromAxisAngle(UP, yaw)
    if (tilt) this.q.multiply(this.q2.setFromAxisAngle(this.e.set(0, 0, 1), tilt))
    mesh.setMatrixAt(n, this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz)))
    if (tint) mesh.setColorAt(n, this.c.set(tint))
    mesh.count = n + 1
  }

  // Redraw from the day's state; nothing is done when nothing it shows has changed.
  set(fields: FieldVis[]): void {
    const key = fields.map(f => `${f.cover}${f.felled.toFixed(3)}${f.works}${f.worksLeft}|${f.stones.toFixed(2)}|${f.hedge.toFixed(2)}${f.held ? 'h' : ''}${f.ours ? 'o' : ''}`).join(';')
    if (key === this.key) return
    this.key = key
    this.stumps.count = this.logs.count = this.heaps.count = this.rocks.count = 0
    for (const i of TRACTS) this.tract(i, fields[i])
    for (let i = 0; i < FIELD_COUNT; i++) this.stones(i, fields[i])
    this.hedges.forEach((h, n) => {
      const grown = h.field >= 0 ? fields[h.field].hedge : 1
      // Just cut, a hedgerow is stubs and sprouts; it stands again in four years.
      const k = 0.15 + 0.85 * Math.pow(grown, 0.8)
      this.q.setFromAxisAngle(UP, h.r * 6.283)
      const w = h.s * 1.05 * (0.84 + 0.32 * h.r) * (0.4 + 0.6 * k)
      this.brush.setMatrixAt(n, this.m.compose(this.p.set(h.x, groundY(h.x, h.z) - 0.04, h.z), this.q, this.s.set(w, h.s * k, w)))
    })
    for (const m of [this.stumps, this.logs, this.heaps, this.rocks, this.brush]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }

  private tract(i: number, fv: FieldVis): void {
    const trees = this.flora.stand(i)
    if (!trees.length) return
    const f = FIELDS[i], n = trees.length, brushy = PARCELS[i].cover === 'brush'
    const standing = fv.cover === 'woods' || fv.cover === 'brush'
    const cut = this.flora.setFelled(i, standing ? fv.felled : 1)
    if (fv.cover === 'open') return
    const share = fv.works === 'stump' ? Math.max(0.04, 1 - fv.worksLeft / STUMP_DAYS) : 0
    const pulled = Math.round(share * n)
    for (let k = pulled; k < cut; k++) {
      const t = trees[k], y = groundY(t.x, t.z)
      const rad = t.bush ? 0.05 + 0.03 * t.r : (t.conifer ? 0.026 : 0.03) * t.s + 0.03
      this.put(this.stumps, t.x, y - 0.03, t.z, rad, t.bush ? 0.1 : 0.15 + 0.12 * t.r, rad, t.r * 6.283)
      // the tops and limbs left where it fell: grey-brown, a conifer's still rusty with needles
      if (hash2(k * 7 + i, 3) < (t.bush ? 0.45 : 0.72)) {
        const a = hash2(k, i + 11) * 6.283, d = 0.45 + 0.5 * hash2(k, i + 5), size = t.bush ? 0.26 + 0.18 * t.r : 0.24 + 0.035 * t.s
        this.put(this.heaps, t.x + Math.cos(a) * d, y + size * 0.12, t.z + Math.sin(a) * d, size * 1.25, size * 0.62, size, a, 0, t.conifer ? '#5e4a38' : t.bush ? '#57543f' : '#62574a')
      }
    }
    // The last few down still lie where they fell, limbed, tops away from the standing timber.
    if (standing && !brushy && cut > 0 && cut < n) {
      for (let k = Math.max(pulled, cut - 6); k < cut; k++) {
        const t = trees[k], len = t.s * 0.74, a = -1.5708 + (hash2(k, 23) - 0.5) * 1.1
        const cx = t.x + Math.cos(a) * len * 0.5, cz = t.z - Math.sin(a) * len * 0.5
        this.put(this.logs, cx, groundY(cx, cz) + 0.02 * t.s + 0.04, cz, len, 0.022 * t.s, 0.022 * t.s, a)
      }
    }
    // Logs piled along the side the stand was opened from, more of them as more comes down.
    const logs = Math.round((cut / n) * (brushy ? 8 : 45)), piles = brushy ? 1 : 5
    for (let k = 0; k < logs; k++) {
      const pile = k % piles, at = Math.floor(k / piles)
      const row = at < 4 ? 0 : at < 7 ? 1 : 2, col = at < 4 ? at : at < 7 ? at - 4 : at - 7
      const rad = brushy ? 0.07 : 0.14 + 0.03 * hash2(k, i)
      const len = brushy ? 1.2 : 1.5 + 0.2 * hash2(k, i + 3)
      let x: number, z: number, yaw: number
      const across = (col - (row === 0 ? 1.5 : row === 1 ? 1 : 0.5)) * rad * 2.05
      if (brushy) { x = f.x0 + 0.9 + across; z = f.z1 - 1.3; yaw = 1.5708 } else { x = f.x0 + 1.7 + pile * ((FW - 3.4) / (piles - 1)) + (hash2(k, 31) - 0.5) * 0.12; z = f.z1 - 0.95 + across; yaw = 0 }
      this.put(this.logs, x, groundY(x, z) + rad * (1 + row * 1.74), z, len, rad, rad, yaw)
    }
    // Where the bulldozer has been, the stumps lie pushed up in rows with the earth still on their roots.
    if (share > 0) {
      for (const u of [0.22, 0.5, 0.78]) {
        if (u > share) continue
        const span = brushy ? FD : FW
        for (let d = 0.7; d < span - 0.5; d += 0.8 + 0.5 * hash2(Math.round(d * 10), i + Math.round(u * 100))) {
          const jig = (hash2(Math.round(d * 13), i + 7) - 0.5) * 0.7
          const x = brushy ? f.x0 + u * FW + jig : f.x0 + d, z = brushy ? f.z0 + d : f.z1 - u * FD + jig
          const size = 0.34 + 0.3 * hash2(Math.round(d * 17), i)
          this.put(this.heaps, x, groundY(x, z) + size * 0.2, z, size * 1.2, size * 0.95, size, hash2(Math.round(d * 5), 3) * 6.283, 0, hash2(Math.round(d * 3), 9) < 0.5 ? '#3d2c21' : '#57402e')
        }
      }
    }
  }

  // Stones scattered on tilled ground by how stony it is, the pile at its corner where the picked stone was tipped, and
  // on new ground the wall the picked stone goes into.
  private stones(i: number, fv: FieldVis): void {
    const f = FIELDS[i]
    const tilled = fv.cover === 'open' && (fv.held || fv.ours)
    if (!tilled) return
    const greys = ['#9a968c', '#aaa59a', '#827e76', '#a39c8e', '#8d867a', '#b3aea0']
    const n = Math.round(fv.stones * STONES_FULL)
    for (let k = 0; k < n; k++) {
      const x = f.x0 + 0.3 + hash2(i * 131 + k, 1) * (FW - 0.6), z = f.z0 + 0.3 + hash2(i * 131 + k, 2) * (FD - 0.6)
      const big = hash2(i * 131 + k, 3), size = 0.045 + 0.12 * big * big
      this.put(this.rocks, x, fieldBaseY(z) + 0.05 + size * 0.2, z, size * (1 + 0.5 * hash2(k, 4)), size * 0.7, size, hash2(k, 5) * 6.283, hash2(k, 6) - 0.5, greys[k % greys.length])
    }
    const pile = Math.round(Math.max(0, Math.min(0.7, 0.85 - fv.stones)) * 56)
    const px = f.x0 + 0.55, pz = f.z1 - 0.5
    for (let k = 0; k < pile; k++) {
      const a = hash2(i * 17 + k, 7) * 6.283, d = Math.sqrt(hash2(i * 17 + k, 8)) * (0.28 + 0.012 * pile), size = 0.08 + 0.09 * hash2(i * 17 + k, 9)
      const x = px + Math.cos(a) * d * 1.3, z = pz + Math.sin(a) * d
      this.put(this.rocks, x, fieldBaseY(z) + size * 0.4 + Math.max(0, 0.3 - d) * 0.9, z, size * 1.3, size * 0.8, size, a, hash2(k, 10) - 0.5, greys[(k + i) % greys.length])
    }
    if (TRACTS.includes(i) && PARCELS[i].cover === 'woods') {
      const built = Math.max(0, Math.min(1, (PARCELS[i].stones - fv.stones) / 0.4))
      const len = built * FW
      for (let d = 0; d < len; d += 0.19) {
        const k = Math.round(d * 100)
        const x = f.x0 + d + (hash2(k, i) - 0.5) * 0.2, z = f.z0 + 0.3 + (hash2(k, i + 1) - 0.5) * 0.2, size = 0.1 + 0.09 * hash2(k, i + 2)
        this.put(this.rocks, x, fieldBaseY(z) + size * 0.4, z, size * 1.3, size * 0.75, size * 1.1, hash2(k, 3) * 6.283, hash2(k, 4) - 0.5, greys[k % greys.length])
        if (hash2(k, i + 5) < 0.75) this.put(this.rocks, x + 0.05, fieldBaseY(z) + size * 1.15, z, size, size * 0.6, size, hash2(k, 6) * 6.283, 0, greys[(k + 2) % greys.length])
      }
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    for (const m of [this.stumps, this.logs, this.heaps, this.rocks, this.brush]) m.dispose()
  }
}
