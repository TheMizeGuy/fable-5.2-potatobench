// Grass. Rank grass where no machine goes: along the walls, the brook's banks, the field margins, the road's verge and
// under the edge of the woods; it shows from far off. And the sward itself, through the farm's meadow and over the hay
// and pasture of land the farm does not hold: that is drawn only near the camera, and sinks into the painted ground
// with distance. All of it takes the low sun from behind and moves with the wind.
// It is laid in patches of ground, each shuffled so that any first share of it is an even thinning; far patches draw
// fewer, larger clumps, and patches out of sight none.
import {
  DoubleSide, Frustum, Group, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, MeshStandardMaterial, Sphere, Vector2, Vector3,
  type PerspectiveCamera,
} from 'three'
import { OFF_KIND } from './fields.ts'
import { grassGeometry } from './geometry.ts'
import {
  BARN, DUFOUR_BARN, DUFOUR_HOUSE, DUFOUR_POTATO_HOUSE, HOME_WOODS, HOUSE, LAND, POND, POTATO_HOUSE, WALLS, brookHalf, brookZ, fieldAt, fieldMask, groundY,
  oursAt, ridgeWoodAt, roadDist, tractAt, woodFront,
} from './layout.ts'
import { hash2, rng } from './noise.ts'
import { SNOW_RIME, patch, sway } from './shaders.ts'

const CELL = 22
// How far off a patch keeps all its clumps; how far off rank grass is no longer drawn; and how far off the sward has
// sunk out of sight. By tier.
const REACH = { high: { full: 26, gone: 170, sward: 84 }, medium: { full: 20, gone: 130, sward: 62 }, low: { full: 14, gone: 90, sward: 0 } }

// field: the parcel a patch of sward lies on (drawn while that parcel is somebody else's), or -1.
interface Patch { mesh: Mesh; geo: InstancedBufferGeometry; all: number; thin: { value: number }; fade: { value: Vector2 }; sphere: Sphere; sward: boolean; field: number }

export class Grass {
  readonly group = new Group()
  private patches: Patch[] = []
  private disposables: { dispose(): void }[] = []
  private frustum = new Frustum()
  private pm = new Matrix4()
  private near = new Vector3()
  private reach = REACH.high
  private share = 1

  constructor() {
    const cells = new Map<string, number[]>()
    let k = 0
    const yards = [HOUSE, BARN, POTATO_HOUSE, DUFOUR_HOUSE, DUFOUR_BARN, DUFOUR_POTATO_HOUSE]
    const clear = (x: number, z: number, onField: boolean): boolean => {
      if ((!onField && fieldMask(x, z, 0.9) > 0) || roadDist(x, z) < 0.95) return false
      if (Math.abs(z - brookZ(x)) < brookHalf(x) + 0.12) return false
      if (ridgeWoodAt(x, z) > 0.55 || tractAt(x, z, 0.2) >= 0) return false
      if (Math.hypot((x - POND.x) / (POND.rx * 1.2), (z - POND.z) / (POND.rz * 1.2)) < 1) return false
      for (const y of yards) if (Math.hypot(x - y.x, (z - y.z) * 0.7) < 3.6) return false
      return true
    }
    // size: 0..1, how tall this clump stands among its kind. Packed with its own number.
    const put = (x: number, z: number, size: number, kind = 'r', field = -1) => {
      k++
      if (!clear(x, z, field >= 0)) return
      const key = `${kind}|${field}|${Math.floor(x / CELL)}|${Math.floor(z / CELL)}`
      let list = cells.get(key)
      if (!list) cells.set(key, (list = []))
      list.push(x, groundY(x, z) - 0.03, z, Math.floor(hash2(k, 13) * 1000) + Math.min(0.99, Math.max(0.01, size)))
    }
    // Rushes and long grass crowd both banks of the brook.
    for (let x = LAND.x0 - 4; x < LAND.x1 + 4; x += 0.2) {
      for (const side of [-1, 1]) {
        for (let n = 0; n < 2; n++) {
          k++
          // The far bank is left more open, so the water shows from across the brook.
          if (side > 0 && hash2(k, 21) < 0.55) continue
          const off = brookHalf(x) + 0.14 + hash2(k, 5) * hash2(k, 6) * 2.2
          put(x + (hash2(k, 7) - 0.5) * 0.3, brookZ(x) + side * off, 0.5 - off * 0.12)
        }
      }
    }
    // Along the walls, where the mower does not reach.
    for (const [x0, z0, x1, z1] of WALLS) {
      const len = Math.hypot(x1 - x0, z1 - z0)
      for (let d = 0; d < len; d += 0.18) {
        k++
        const t = d / len, side = hash2(k, 3) < 0.5 ? -1 : 1, off = 0.15 + hash2(k, 4) * 0.55
        const nx = (z1 - z0) / len, nz = -(x1 - x0) / len
        put(x0 + (x1 - x0) * t + nx * side * off, z0 + (z1 - z0) * t + nz * side * off, 0.3 + 0.4 * hash2(k, 9))
      }
    }
    // Fern and long grass under the edge of the woods.
    for (let x = HOME_WOODS.x0; x < HOME_WOODS.x1; x += 0.16) {
      k++
      const z = Math.min(-22.3, woodFront(x) + 2.6 - hash2(k, 5) * 4.2)
      if (hash2(k, 8) < 0.6) put(x + (hash2(k, 7) - 0.5) * 0.3, z, 0.45 + 0.5 * hash2(k, 9))
    }
    // Field margins, the road's verge, and clumps through the farm's meadow; and the sward between them.
    const step = 0.38
    for (let z = LAND.z0 - 3; z < LAND.z1; z += step) {
      for (let x = LAND.x0; x < LAND.x1; x += step) {
        k++
        const jx = x + (hash2(k, 3) - 0.5) * step, jz = z + (hash2(k, 7) - 0.5) * step
        const on = fieldAt(jx, jz)
        if (on >= 0) {
          // Somebody else's hay stands tall, pasture is grazed short, stubble grows a few weeds.
          const sort = OFF_KIND[on] ?? 0
          if (on >= 6 && on < 14 && hash2(k, 11) < (sort === 0 ? 0.9 : sort === 1 ? 0.6 : 0.14)) put(jx, jz, sort === 0 ? 0.42 + 0.4 * hash2(k, 17) : 0.1 + 0.26 * hash2(k, 17), 's', on)
          continue
        }
        const ours = oursAt(jx, jz, 2)
        if (ours <= 0.01) continue
        const clump = hash2(Math.floor(jx / 3.1), Math.floor(jz / 3.1)) < 0.34 ? hash2(Math.floor(jx / 1.1) + 7, Math.floor(jz / 1.1)) : 0
        const want = (0.02 + 0.5 * fieldMask(jx, jz, 2.1) + 0.4 * Math.max(0, 1 - Math.abs(roadDist(jx, jz) - 1.3) / 0.5) + 0.7 * clump * clump) * ours
        if (hash2(k, 11) < want) put(jx, jz, 0.15 + 0.4 * hash2(k, 17))
        else {
          // the sward: thick, low, uneven
          for (let n = 0; n < 2; n++) {
            if (hash2(k, 19 + n) > 0.8 * ours) continue
            put(x + (hash2(k, 29 + n) - 0.5) * step * 1.6, z + (hash2(k, 31 + n) - 0.5) * step * 1.6, 0.06 + 0.3 * hash2(k, 17 + n) * hash2(k, 23), 's')
          }
        }
      }
    }
    const src = grassGeometry()
    this.disposables.push(src)
    const r = rng(9)
    for (const [key, list] of cells) {
      const n = list.length / 4
      const [kind, field] = key.split('|')
      // shuffle, so that the first part of the patch is an even thinning of it
      const order = Array.from({ length: n }, (_, i) => i)
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
      const at = new Float32Array(n * 4)
      let cx = 0, cz = 0
      order.forEach((o, i) => { at.set(list.slice(o * 4, o * 4 + 4), i * 4); cx += list[o * 4]; cz += list[o * 4 + 2] })
      cx /= n; cz /= n
      let rad = 0
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(at[i * 4] - cx, at[i * 4 + 2] - cz))
      const geo = new InstancedBufferGeometry()
      geo.index = src.index
      for (const name of Object.keys(src.attributes)) geo.setAttribute(name, src.attributes[name])
      geo.setAttribute('aAt', new InstancedBufferAttribute(at, 4))
      geo.instanceCount = n
      const sphere = new Sphere(new Vector3(cx, groundY(cx, cz) + 0.3, cz), rad + 1)
      geo.boundingSphere = sphere
      const thin = { value: 1 }, fade = { value: new Vector2(1e5, 2e5) }
      const mat = patch(new MeshStandardMaterial({ color: 0xffffff, side: DoubleSide, roughness: 0.8, metalness: 0 }), {
        key: 'county-grass',
        uniforms: { uThin: thin, uFade: fade },
        translucent: 0.5,
        shine: 0.3,
        blade: true,
        vertexHead: 'attribute vec4 aAt;\nattribute vec3 aBlade;\nuniform float uThin;\nuniform vec2 uFade;\nvarying vec3 vTint;',
        vertexNormal: /* glsl */ `
          float ga = floor(aAt.w) * 0.0437, gc = cos(ga), gs = sin(ga);
          objectNormal = vec3(gc * objectNormal.x + gs * objectNormal.z, objectNormal.y, -gs * objectNormal.x + gc * objectNormal.z);
        `,
        // Short and bleached in spring, tall and in seed by July, flattened under snow. Thinned far off, each clump
        // wider; and the sward sinks into the ground as it nears the distance where it is no longer drawn.
        vertexBegin: /* glsl */ `
          float gb = floor(aAt.w) * 0.0437, gbc = cos(gb), gbs = sin(gb);
          float season = mix(0.4, 1.0, uLeaf) * (1.0 - 0.7 * smoothstep(0.2, 0.8, uSnow));
          float sink = 1.0 - smoothstep(uFade.x, uFade.y, distance(aAt.xyz, cameraPosition));
          float tall = (0.2 + 0.75 * fract(aAt.w)) * (0.8 + 0.4 * fract(aAt.w * 0.0531)) * season * sink;
          float seed = mix(1.0, smoothstep(0.5, 1.0, uLeaf), aBlade.z);
          vec3 gl = position * vec3(0.62 * seed, 1.0, 0.62 * seed) * vec3(0.7 + 0.6 * fract(aAt.w), 1.0, 0.7 + 0.6 * fract(aAt.w)) * vec3(uThin, 1.0, uThin);
          transformed = aAt.xyz + vec3(gbc * gl.x + gbs * gl.z, gl.y * tall, -gbs * gl.x + gbc * gl.z);
          vec3 gcol = uGrass * mix(vec3(0.7, 0.9, 0.56), vec3(1.2, 1.25, 0.78), aBlade.y) * (0.82 + 0.4 * fract(aAt.w * 0.173));
          gcol = mix(gcol, uGrass * vec3(1.5, 1.3, 0.8), aBlade.z * 0.7);
          vTint = gcol;
        `,
        vertexWorld: sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '1.1'),
        fragmentHead: 'varying vec3 vTint;',
        fragmentColor: `diffuseColor.rgb *= vTint; ${SNOW_RIME}`,
      })
      const mesh = new Mesh(geo, mat)
      mesh.receiveShadow = true
      this.group.add(mesh)
      this.patches.push({ mesh, geo, all: n, thin, fade, sphere, sward: kind === 's', field: Number(field) })
      this.disposables.push(geo, mat)
    }
  }

  setTier(tier: 'high' | 'medium' | 'low'): void {
    this.reach = REACH[tier]
    this.share = tier === 'low' ? 0.5 : 1
  }

  // Thin each patch by its distance from the camera. off: for each parcel, 1 while it is somebody else's ground.
  update(camera: PerspectiveCamera, off: number[]): void {
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const c = camera.position
    for (const p of this.patches) {
      const d = Math.max(0, this.near.copy(p.sphere.center).distanceTo(c) - p.sphere.radius)
      const gone = p.sward ? this.reach.sward : this.reach.gone
      if (d > gone || (p.field >= 0 && off[p.field] < 0.5) || !this.frustum.intersectsSphere(p.sphere)) { p.mesh.visible = false; continue }
      const keep = Math.min(1, Math.pow(this.reach.full / Math.max(d, 1), p.sward ? 1.0 : 1.4)) * this.share
      const k = Math.max(0.06, keep)
      p.mesh.visible = true
      p.geo.instanceCount = Math.max(1, Math.round(p.all * k))
      p.thin.value = Math.min(2.4, 1 / Math.sqrt(k))
      if (p.sward) p.fade.value.set(gone * 0.5, gone * 0.96)
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
