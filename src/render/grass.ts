// Long grass where no machine goes: along the walls, the brook's banks, the field margins and the road's verge,
// and thinly through the meadow. It takes the low sun from behind and moves with the wind.
import { DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshStandardMaterial, Sphere, Vector3 } from 'three'
import { grassGeometry } from './geometry.ts'
import { BARN, HOME_WOODS, HOUSE, POTATO_HOUSE, WALLS, brookHalf, brookZ, fieldMask, groundY, roadDist } from './layout.ts'
import { hash2 } from './noise.ts'
import { SNOW_RIME, patch, sway } from './shaders.ts'

export class Grass {
  readonly mesh: Mesh
  private disposables: { dispose(): void }[] = []

  constructor() {
    const at: number[] = []
    let k = 0
    const clear = (x: number, z: number): boolean => {
      if (fieldMask(x, z, 0.9) > 0 || roadDist(x, z) < 0.95) return false
      if (Math.abs(z - brookZ(x)) < brookHalf(x) + 0.12) return false
      if (z < HOME_WOODS.z1 + 0.6 && x < HOME_WOODS.x1 + 1) return false
      const yard = Math.min(Math.hypot(x - HOUSE.x, (z - HOUSE.z + 2) * 0.6), Math.hypot(x - BARN.x, (z - BARN.z) * 0.7), Math.hypot(x - POTATO_HOUSE.x, z - POTATO_HOUSE.z + 2))
      return yard > 3.4
    }
    // size: 0..1, how tall this clump stands among its kind. Packed with its own number.
    const put = (x: number, z: number, size: number) => {
      k++
      if (!clear(x, z)) return
      at.push(x, groundY(x, z) - 0.03, z, Math.floor(hash2(k, 13) * 1000) + Math.min(0.99, Math.max(0.01, size)))
    }
    // Rushes and long grass crowd both banks of the brook.
    for (let x = -60; x < 70; x += 0.2) {
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
      for (let d = 0; d < len; d += 0.16) {
        k++
        const t = d / len, side = hash2(k, 3) < 0.5 ? -1 : 1, off = 0.15 + hash2(k, 4) * 0.55
        const nx = (z1 - z0) / len, nz = -(x1 - x0) / len
        put(x0 + (x1 - x0) * t + nx * side * off, z0 + (z1 - z0) * t + nz * side * off, 0.3 + 0.4 * hash2(k, 9))
      }
    }
    // Field margins, the road's verge, and clumps through the meadow.
    const step = 0.36
    for (let z = -27; z < 48; z += step) {
      for (let x = -28; x < 38; x += step) {
        k++
        const jx = x + (hash2(k, 3) - 0.5) * step, jz = z + (hash2(k, 7) - 0.5) * step
        if (jx < -17.9) continue
        const clump = hash2(Math.floor(jx / 3.1), Math.floor(jz / 3.1)) < 0.34 ? hash2(Math.floor(jx / 1.1) + 7, Math.floor(jz / 1.1)) : 0
        const want = 0.02 + 0.55 * fieldMask(jx, jz, 2.1) + 0.4 * Math.max(0, 1 - Math.abs(roadDist(jx, jz) - 1.3) / 0.5) + 0.75 * clump * clump
        if (hash2(k, 11) < want) put(jx, jz, 0.15 + 0.4 * hash2(k, 17))
      }
    }
    const src = grassGeometry()
    const geo = new InstancedBufferGeometry()
    geo.index = src.index
    for (const name of Object.keys(src.attributes)) geo.setAttribute(name, src.attributes[name])
    geo.setAttribute('aAt', new InstancedBufferAttribute(new Float32Array(at), 4))
    geo.instanceCount = at.length / 4
    geo.boundingSphere = new Sphere(new Vector3(5, 3, 9), 60)
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, side: DoubleSide, roughness: 0.8, metalness: 0 }), {
      translucent: 0.8,
      shine: 0.3,
      vertexHead: 'attribute vec4 aAt;\nattribute vec3 aBlade;\nvarying vec3 vTint;',
      vertexNormal: /* glsl */ `
        float ga = floor(aAt.w) * 0.0437, gc = cos(ga), gs = sin(ga);
        objectNormal = vec3(gc * objectNormal.x + gs * objectNormal.z, objectNormal.y, -gs * objectNormal.x + gc * objectNormal.z);
      `,
      // Short and bleached in spring, tall and in seed by July, flattened under snow.
      vertexBegin: /* glsl */ `
        float gb = floor(aAt.w) * 0.0437, gbc = cos(gb), gbs = sin(gb);
        float season = mix(0.4, 1.0, uLeaf) * (1.0 - 0.7 * smoothstep(0.2, 0.8, uSnow));
        float tall = (0.2 + 0.75 * fract(aAt.w)) * (0.8 + 0.4 * fract(aAt.w * 0.0531)) * season;
        float seed = mix(1.0, smoothstep(0.5, 1.0, uLeaf), aBlade.z);
        vec3 gl = position * vec3(0.62 * seed, 1.0, 0.62 * seed) * vec3(0.7 + 0.6 * fract(aAt.w), 1.0, 0.7 + 0.6 * fract(aAt.w));
        transformed = aAt.xyz + vec3(gbc * gl.x + gbs * gl.z, gl.y * tall, -gbs * gl.x + gbc * gl.z);
        vec3 gcol = uGrass * mix(vec3(0.7, 0.9, 0.56), vec3(1.2, 1.25, 0.78), aBlade.y) * (0.82 + 0.4 * fract(aAt.w * 0.173));
        gcol = mix(gcol, uGrass * vec3(1.5, 1.3, 0.8), aBlade.z * 0.7);
        vTint = gcol;
      `,
      vertexWorld: sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '1.1'),
      fragmentHead: 'varying vec3 vTint;',
      fragmentColor: `diffuseColor.rgb *= vTint; ${SNOW_RIME}`,
    })
    this.mesh = new Mesh(geo, mat)
    this.mesh.receiveShadow = true
    this.disposables.push(src, geo, mat)
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
