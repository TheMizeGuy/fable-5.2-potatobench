// The far country: ranges of hills all the way round, beyond where the land itself ends, so no view stops at an edge.
// Each range is a real ridge: a band of ground some kilometres deep that rises from the valley's haze to a crest of
// tops and saddles and falls away behind, with spurs running down its face that the low sun lights on one side. Each
// stands a step paler and bluer than the one before, and pale at its foot where the air lies in the valleys.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial } from 'three'
import { FARM_CENTER, REACH } from './layout.ts'
import { fbm2, rng, smooth } from './noise.ts'
import { FRAG_LIB, SHARED, U, linear } from './shaders.ts'

// near, far: the band's reach from the farm (metres). top: how high its tops stand. air: how much of the way it has
// gone to the colour of the sky behind it on a fair day.
const RANGES = [
  { near: REACH + 900, far: REACH + 2700, top: 520, air: 0.44 },
  { near: REACH + 2700, far: REACH + 5000, top: 780, air: 0.6 },
  { near: REACH + 5000, far: REACH + 8200, top: 1150, air: 0.74 },
  { near: REACH + 8600, far: REACH + 12400, top: 1650, air: 0.85 },
]
// The furthest crest, with room to spare: the picture must reach it.
export const FAR_REACH = REACH + 12400
const AROUND = 448, ACROSS = 18
const FOOT = -60

export class FarHills {
  readonly mesh: Mesh
  private geo = new BufferGeometry()
  private mat: ShaderMaterial

  constructor() {
    const r = rng(4021)
    const pos: number[] = [], look: number[] = [], idx: number[] = []
    RANGES.forEach((range, k) => {
      // A skyline that closes on itself: a few long swells that carry the range up and down, hills along it that come
      // to rounded tops with saddles between, and here and there one that stands above its neighbours.
      const swells = [2, 3, 5].map(n => ({ n, a: 1 / n, ph: r() * 6.283 }))
      const hills = [9, 14, 22, 35, 57].map((n, i) => ({ n, a: [0.5, 0.42, 0.3, 0.17, 0.08][i], ph: r() * 6.283 }))
      const tors = Array.from({ length: 6 }, () => ({ at: r() * 6.283, wide: 0.035 + r() * 0.06, tall: 0.25 + r() * 0.5 }))
      const crestAt = (th: number): number => {
        let h = 0.5
        for (const w of swells) h += 0.42 * w.a * Math.sin(w.n * th + w.ph)
        for (const w of hills) h += w.a * (Math.pow(Math.abs(Math.cos(w.n * th * 0.5 + w.ph)), 1.6) - 0.45)
        for (const t of tors) {
          let d = Math.abs(th - t.at)
          if (d > Math.PI) d = Math.PI * 2 - d
          h += t.tall * Math.exp(-(d * d) / (t.wide * t.wide))
        }
        return Math.max(0.12, h)
      }
      const first = pos.length / 3
      const deep = range.far - range.near
      for (let s = 0; s <= AROUND; s++) {
        const th = (s / AROUND) * Math.PI * 2
        const crest = crestAt(th)
        // The crest line wanders in and out along the range.
        const crestU = 0.52 + 0.14 * Math.sin(th * 7 + k * 1.7) + 0.08 * Math.sin(th * 17 + k)
        for (let j = 0; j <= ACROSS; j++) {
          const u = j / ACROSS
          const rad = range.near + deep * u
          const x = FARM_CENTER.x + Math.cos(th) * rad, z = FARM_CENTER.z + Math.sin(th) * rad
          // Up to the crest and down behind it; the near face is the longer.
          const face = u < crestU ? smooth(0, 1, u / crestU) : smooth(0, 1, (1 - u) / (1 - crestU))
          // Spurs and hollows down the face, and the lesser tops on it: the same hill seen along and across.
          const wx = Math.cos(th) * (3 + k) * 2.2 + k * 9.1, wz = Math.sin(th) * (3 + k) * 2.2 - k * 4.3
          const spur = fbm2(wx * 5.2 + u * 1.3, wz * 5.2 - u * 0.9) - 0.5
          const knoll = fbm2(wx * 13 + u * 5.5, wz * 13 + u * 4.1) - 0.5
          const h = face * crest * (1 + 0.5 * spur * (0.4 + face)) + 0.2 * knoll * Math.sin(Math.PI * Math.min(1, u * 1.1)) * crest
          pos.push(x, FOOT + (range.top - FOOT) * Math.max(0, h) * 0.78, z)
          look.push(range.air, face)
        }
        if (s > 0) {
          for (let j = 0; j < ACROSS; j++) {
            const a = first + (s - 1) * (ACROSS + 1) + j, b = a + 1, c = a + ACROSS + 1, d = c + 1
            idx.push(a, c, b, b, c, d)
          }
        }
      }
    })
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    this.geo.setAttribute('aLook', new BufferAttribute(new Float32Array(look), 2))
    this.geo.setIndex(idx)
    this.geo.computeVertexNormals()
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
          vWNormal = normal;
          gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${SHARED}
        ${FRAG_LIB}
        varying vec2 vLook;
        void main() {
          vec3 n = normalize(vWNormal);
          n = n.y < 0.0 ? -n : n;
          // Woods and upland pasture as a mottle; rust in October, white on the tops in winter.
          float mottle = texture2D(uNoise, vWorld.xz * 0.00021 + vLook.x * 3.7).b;
          float fold = texture2D(uNoise, vWorld.xz * 0.00093 + vLook.x * 2.1).a;
          vec3 land = mix(${linear('#22362b')}, ${linear('#4a5c36')}, smoothstep(0.35, 0.7, mottle));
          land = mix(land, mix(${linear('#7d4526')}, ${linear('#977536')}, fold), uGold * 0.5 * smoothstep(0.3, 0.65, fold) * uLeaf);
          land = mix(land, ${linear('#4f493f')}, (1.0 - uLeaf) * 0.5);
          float high = smoothstep(${(RANGES[0].top * 0.3).toFixed(1)}, ${(RANGES[2].top * 0.8).toFixed(1)}, vWorld.y + (fold - 0.5) * 160.0);
          land = mix(land, vec3(0.8, 0.85, 0.92), clamp(uSnow * 1.3, 0.0, 1.0) * (0.4 + 0.5 * high) * smoothstep(0.3, 0.7, n.y));
          // The low sun lights one side of every spur and leaves the other to the sky.
          float sun = max(dot(n, uSunDir), 0.0) * (1.0 - 0.5 * uCloud.x * uCloud.y);
          vec3 col = land * (0.8 + 0.4 * fold) * (uSunCol * sun * 1.25 + skyIrradiance(n)) * 0.3183;
          // Distance makes it a blue shape before it makes it pale.
          col = mix(col, uHazeAway * vec3(0.3, 0.42, 0.66), 0.5);
          vec3 hv = vWorld - cameraPosition;
          float hd = length(hv), hm;
          vec3 dir = hv / hd;
          float real = hazeAmount(cameraPosition.y, vWorld.y, hd, vWorld.xz, hm);
          // On a fair day each range stands a set step nearer the sky's colour; thick air takes them all. And the air
          // lies in the valleys: every range rises out of it, so its foot is never a line.
          float air = max(vLook.x, smoothstep(0.9, 0.998, real));
          float low = 1.0 - smoothstep(-20.0, 330.0 + 500.0 * vLook.x, vWorld.y);
          air = mix(air, 1.0, low * low * 0.94);
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
