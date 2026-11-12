// The far country: three ridgelines of blue distance all the way round, beyond where the land itself ends, so no view
// stops at an edge. Each is a wall of hills with its own skyline, paler the further off and pale at its foot where the
// air lies in the valleys. They are too far for detail: a dark cool shape, a little of the day's light, and the air.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial } from 'three'
import { FARM_CENTER } from './layout.ts'
import { rng } from './noise.ts'
import { FRAG_LIB, SHARED, U, linear } from './shaders.ts'

// air: how much of the way each ridge has gone to the colour of the sky behind it on a fair day.
const RINGS = [
  { radius: 4700, base: 95, rise: 135, air: 0.34 },
  { radius: 6100, base: 215, rise: 190, air: 0.54 },
  { radius: 7900, base: 380, rise: 280, air: 0.72 },
]
const STEPS = 512
const FOOT = -160

export class FarHills {
  readonly mesh: Mesh
  private geo = new BufferGeometry()
  private mat: ShaderMaterial

  constructor() {
    const r = rng(4021)
    const pos: number[] = [], look: number[] = [], idx: number[] = []
    RINGS.forEach((ring, k) => {
      // A skyline that closes on itself: a few long swells that carry the range up and down, hills along it that come
      // to rounded tops with saddles between, and here and there one that stands above its neighbours.
      const swells = [2, 3, 5].map(n => ({ n, a: 1 / n, ph: r() * 6.283 }))
      const hills = [9, 14, 22, 35, 57].map((n, i) => ({ n, a: [0.5, 0.42, 0.3, 0.17, 0.08][i], ph: r() * 6.283 }))
      const tors = Array.from({ length: 6 }, () => ({ at: r() * 6.283, wide: 0.035 + r() * 0.06, tall: 0.25 + r() * 0.5 }))
      const first = pos.length / 3
      for (let s = 0; s <= STEPS; s++) {
        const th = (s / STEPS) * Math.PI * 2
        let h = 0.42
        for (const w of swells) h += 0.42 * w.a * Math.sin(w.n * th + w.ph)
        for (const w of hills) h += w.a * (Math.pow(Math.abs(Math.cos(w.n * th * 0.5 + w.ph)), 1.6) - 0.45)
        for (const t of tors) {
          let d = Math.abs(th - t.at)
          if (d > Math.PI) d = Math.PI * 2 - d
          h += t.tall * Math.exp(-(d * d) / (t.wide * t.wide))
        }
        const top = ring.base + ring.rise * Math.max(0.04, h)
        const x = FARM_CENTER.x + Math.cos(th) * ring.radius, z = FARM_CENTER.z + Math.sin(th) * ring.radius
        pos.push(x, FOOT, z, x, top, z)
        look.push(ring.air, 0, ring.air, 1)
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
          vec3 n = normalize(normalize(vWNormal) * 0.6 + vec3(0.0, 0.8, 0.0));
          // Woods and upland pasture as a mottle; rust in October, white on the tops in winter.
          float around = atan(vWorld.z, vWorld.x);
          float mottle = texture2D(uNoise, vec2(around * 2.4 + vLook.x * 3.7, vWorld.y * 0.0035)).b;
          float fold = texture2D(uNoise, vec2(around * 7.0, vWorld.y * 0.0012 + vLook.x * 2.1)).a;
          vec3 land = mix(${linear('#24382c')}, ${linear('#4c5f37')}, smoothstep(0.35, 0.7, mottle));
          land = mix(land, mix(${linear('#7d4526')}, ${linear('#977536')}, fold), uGold * 0.5 * smoothstep(0.3, 0.65, fold) * uLeaf);
          land = mix(land, ${linear('#4f493f')}, (1.0 - uLeaf) * 0.5);
          land = mix(land, vec3(0.8, 0.85, 0.92), clamp(uSnow * 1.3, 0.0, 1.0) * (0.4 + 0.45 * smoothstep(0.3, 0.8, vLook.y + (fold - 0.5) * 0.4)));
          vec3 col = land * (0.8 + 0.4 * fold) * (uSunCol * max(dot(n, uSunDir), 0.0) * (1.0 - 0.5 * uCloud.x * uCloud.y) + skyIrradiance(n)) * 0.3183;
          // Distance makes it a blue shape before it makes it pale.
          col = mix(col, uHazeAway * vec3(0.3, 0.42, 0.66), 0.6);
          vec3 hv = vWorld - cameraPosition;
          float hd = length(hv), hm;
          vec3 dir = hv / hd;
          float real = hazeAmount(cameraPosition.y, vWorld.y, hd, vWorld.xz, hm);
          // On a fair day each ridge stands a set step nearer the sky's colour; thick air takes them all.
          float air = max(vLook.x, smoothstep(0.82, 0.99, real));
          float foot = 1.0 - vLook.y;
          air = mix(air, 1.0, foot * foot * 0.55);
          gl_FragColor = vec4(mix(col, hazeTint(dir), air), 1.0);
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
