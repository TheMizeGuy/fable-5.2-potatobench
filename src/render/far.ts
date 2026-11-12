// The far country: three ridgelines of blue distance all the way round, beyond where the land itself ends, so no view
// stops at an edge. Each is a wall of hills with its own skyline, paler and bluer the further off, pale at its foot
// where the air lies in the valleys.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial } from 'three'
import { FARM_CENTER } from './layout.ts'
import { rng } from './noise.ts'
import { FRAG_LIB, SHARED, U, linear } from './shaders.ts'

const RINGS = [
  { radius: 4700, base: 190, rise: 120, peaks: 0.3 },
  { radius: 6100, base: 350, rise: 170, peaks: 0.6 },
  { radius: 7900, base: 530, rise: 250, peaks: 1 },
]
const STEPS = 384
const FOOT = -160

export class FarHills {
  readonly mesh: Mesh
  private geo = new BufferGeometry()
  private mat: ShaderMaterial

  constructor() {
    const r = rng(4021)
    const pos: number[] = [], look: number[] = [], idx: number[] = []
    RINGS.forEach((ring, k) => {
      // A skyline that closes on itself: long swells, shorter hills on them, and here and there a hill that stands alone.
      const waves = Array.from({ length: 9 }, (_, n) => ({ n: [2, 3, 5, 7, 11, 16, 23, 34, 51][n], a: [1, 0.8, 0.7, 0.5, 0.4, 0.26, 0.18, 0.1, 0.06][n], ph: r() * 6.283 }))
      const tors = Array.from({ length: 5 }, () => ({ at: r() * 6.283, wide: 0.05 + r() * 0.07, tall: (0.35 + r() * 0.65) * ring.peaks }))
      const first = pos.length / 3
      for (let s = 0; s <= STEPS; s++) {
        const th = (s / STEPS) * Math.PI * 2
        let h = 0, norm = 0
        for (const w of waves) { h += w.a * Math.sin(w.n * th + w.ph); norm += w.a }
        h = 0.5 + 0.5 * (h / norm) * 1.9
        for (const t of tors) {
          let d = Math.abs(th - t.at)
          if (d > Math.PI) d = Math.PI * 2 - d
          h += t.tall * Math.exp(-(d * d) / (t.wide * t.wide))
        }
        const top = ring.base + ring.rise * Math.max(0, h)
        const x = FARM_CENTER.x + Math.cos(th) * ring.radius, z = FARM_CENTER.z + Math.sin(th) * ring.radius
        pos.push(x, FOOT, z, x, top, z)
        look.push(k, 0, k, 1)
        if (s > 0) {
          const o = first + (s - 1) * 2
          idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2)
        }
      }
    })
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    this.geo.setAttribute('aLook', new BufferAttribute(new Float32Array(look), 2))
    this.geo.setIndex(idx)
    this.mat = new ShaderMaterial({
      uniforms: { ...U },
      side: DoubleSide,
      vertexShader: /* glsl */ `
        ${SHARED}
        attribute vec2 aLook;
        varying vec2 vLook;
        void main() {
          vLook = aLook;
          vWorld = position;
          vWNormal = normalize(vec3(-position.x, 0.0, -position.z));
          gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${SHARED}
        ${FRAG_LIB}
        varying vec2 vLook;
        void main() {
          vec3 inward = normalize(vWNormal);
          vec3 n = normalize(inward * 0.62 + vec3(0.0, 0.78, 0.0));
          // Woods and upland pasture, too far off to be more than a mottle; rust in October, white on the tops in winter.
          float around = atan(vWorld.z, vWorld.x);
          float mottle = texture2D(uNoise, vec2(around * 2.4 + vLook.x * 0.37, vWorld.y * 0.0035)).b;
          float fold = texture2D(uNoise, vec2(around * 7.0, vWorld.y * 0.0012 + vLook.x * 0.21)).a;
          vec3 land = mix(${linear('#2f4a36')}, ${linear('#5b6e3c')}, smoothstep(0.35, 0.7, mottle));
          land = mix(land, mix(${linear('#8a4a26')}, ${linear('#a5803a')}, fold), uGold * 0.55 * smoothstep(0.3, 0.65, fold) * uLeaf);
          land = mix(land, ${linear('#5a5348')}, (1.0 - uLeaf) * 0.5);
          land = mix(land, vec3(0.8, 0.85, 0.92), clamp(uSnow * 1.3, 0.0, 1.0) * (0.45 + 0.4 * smoothstep(0.3, 0.8, vLook.y + (fold - 0.5) * 0.4)));
          land *= 0.75 + 0.5 * fold;
          vec3 col = land * (uSunCol * max(dot(n, uSunDir), 0.0) * cloudShade(vWorld) + skyIrradiance(n)) * 0.3183;
          // The air between: bluer than the sky's own edge where it is thin, the sky's edge where it is thick.
          vec3 hv = vWorld - cameraPosition;
          float hd = length(hv), hm;
          float ha = hazeAmount(cameraPosition.y, vWorld.y, hd, vWorld.xz, hm);
          ha = max(ha, 0.4 + 0.15 * vLook.x);
          float foot = 1.0 - vLook.y;
          ha = mix(ha, 1.0, foot * foot * 0.5);
          vec3 air = hazeTint(hv / hd);
          vec2 a = hv.xz / max(length(hv.xz), 1e-4), b = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
          float toSun = max(dot(a, b), 0.0);
          air *= mix(mix(vec3(0.5, 0.7, 1.02), vec3(0.92, 0.9, 0.9), toSun * toSun), vec3(1.0), smoothstep(0.86, 0.995, ha));
          gl_FragColor = vec4(mix(col, air, ha), 1.0);
        }`,
    })
    this.mesh = new Mesh(this.geo, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.userData.far = true
  }

  dispose(): void {
    this.geo.dispose()
    this.mat.dispose()
  }
}
