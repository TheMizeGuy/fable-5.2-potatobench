// The far country: ranges of hills all the way round, beyond where the land itself ends, so no view stops at an edge.
// Each range is a real ridge: a band of ground some kilometres deep that rises from the valley's haze to a crest of
// tops and saddles and falls away behind, with spurs running down its face that the low sun lights on one side. Each
// stands a step paler and bluer than the one before, and pale at its foot where the air lies in the valleys.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial } from 'three'
import { FARM_CENTER, REACH, macroY } from './layout.ts'
import { fbm2, rng, smooth } from './noise.ts'
import { FRAG_LIB, SHARED, U, linear } from './shaders.ts'

// near, far: the band's reach from the farm (metres). top: how high its tops stand. air: how much of the way it has
// gone to the colour of the sky behind it on a fair day.
// This is rolling country: a range's tops stand three or four hundred metres over its valleys and are kilometres apart.
// `top` is how far a range's tops stand over the country at the land's edge in their direction.
const RANGES = [
  { near: REACH + 700, far: REACH + 3100, top: 330, air: 0.5 },
  { near: REACH + 2900, far: REACH + 5600, top: 500, air: 0.64 },
  { near: REACH + 5400, far: REACH + 8800, top: 700, air: 0.76 },
  { near: REACH + 8800, far: REACH + 12400, top: 960, air: 0.86 },
]
// The furthest crest, with room to spare: the picture must reach it.
export const FAR_REACH = REACH + 12400
const AROUND = 448, ACROSS = 18
// How far below the land's edge a range's foot is sunk, out of sight.
const FOOT = 90
// How high the country stands where the drawn land gives out, looking each way from the farm: the ranges rise from
// behind it, wherever it is high or low.
const EDGE = Array.from({ length: AROUND + 1 }, (_, s) => {
  const th = (s / AROUND) * Math.PI * 2, c = Math.cos(th), n = Math.sin(th)
  let y = -Infinity
  for (let r = 0.6; r <= 0.96; r += 0.06) y = Math.max(y, macroY(FARM_CENTER.x + c * REACH * r, FARM_CENTER.z + n * REACH * r))
  return y
})
// ... taken smoothly round, so a ridge's foot does not follow every swell.
const EDGE_Y = EDGE.map((_, s) => {
  let sum = 0
  for (let k = -12; k <= 12; k++) sum += EDGE[(((s + k) % AROUND) + AROUND) % AROUND]
  return sum / 25
})

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
      const hills = [7, 11, 17, 27].map((n, i) => ({ n, a: [0.3, 0.22, 0.13, 0.06][i], ph: r() * 6.283 }))
      const tors = Array.from({ length: 5 }, () => ({ at: r() * 6.283, wide: 0.1 + r() * 0.12, tall: 0.1 + r() * 0.2 }))
      const crestAt = (th: number): number => {
        let h = 0.62
        for (const w of swells) h += 0.3 * w.a * Math.sin(w.n * th + w.ph)
        for (const w of hills) h += w.a * Math.sin(w.n * th + w.ph)
        for (const t of tors) {
          let d = Math.abs(th - t.at)
          if (d > Math.PI) d = Math.PI * 2 - d
          h += t.tall * Math.exp(-(d * d) / (t.wide * t.wide))
        }
        return Math.min(1.12, Math.max(0.3, h))
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
          const spur = fbm2(wx * 4.1 + u * 1.3, wz * 4.1 - u * 0.9) - 0.5
          const knoll = fbm2(wx * 9 + u * 3.5, wz * 9 + u * 2.6) - 0.5
          const h = face * crest * (1 + 0.34 * spur * (0.3 + face)) + 0.1 * knoll * Math.sin(Math.PI * Math.min(1, u * 1.1)) * crest
          const rise = Math.max(0, h) * 0.9
          pos.push(x, EDGE_Y[s] - FOOT + (range.top + FOOT) * rise, z)
          // how far up from the land's edge this stands, as a share of the range's height
          look.push(range.air, ((range.top + FOOT) * rise - FOOT) / range.top)
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
          float high = smoothstep(0.3, 0.9, vLook.y + (fold - 0.5) * 0.3);
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
          float low = 1.0 - smoothstep(0.02, 0.34 + 0.3 * vLook.x, vLook.y);
          air = mix(air, 1.0, low * (2.0 - low));
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
