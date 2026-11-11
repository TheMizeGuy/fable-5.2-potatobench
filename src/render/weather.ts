// What falls: rain and snow, in a box of air that stays round what the camera looks at.
import {
  BufferAttribute, BufferGeometry, Color, Group, LineSegments, Points, ShaderMaterial, Vector2, Vector3,
} from 'three'
import { rng } from './noise.ts'

const BOX = 'vec3(70.0, 30.0, 70.0)'
// Each drop keeps its own place in the box and wraps round as the box moves with the camera.
const WRAP = /* glsl */ `
vec3 wrap(vec3 seed, vec3 fallen, vec3 centre) {
  vec3 box = ${BOX};
  vec3 p = seed * box + fallen;
  return mod(p - centre + box * 0.5, box) - box * 0.5 + centre;
}
`

export class Weather {
  readonly group = new Group()
  private rain: LineSegments
  private snow: Points
  private rainU = { uFall: { value: 0 }, uAmount: { value: 0 }, uWind: { value: new Vector2() }, uColor: { value: new Color('#c8d0d4') }, uCentre: { value: new Vector3() } }
  private snowU = { uFall: { value: 0 }, uAmount: { value: 0 }, uWind: { value: new Vector2() }, uColor: { value: new Color('#ffffff') }, uCentre: { value: new Vector3() }, uScale: { value: 300 } }
  private disposables: { dispose(): void }[] = []

  constructor() {
    const r = rng(8)
    {
      const n = 5200
      const seed = new Float32Array(n * 2 * 4)
      for (let k = 0; k < n; k++) {
        const s = [r(), r(), r(), 0]
        seed.set(s, k * 8)
        seed.set([s[0], s[1], s[2], 1], k * 8 + 4)
      }
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(n * 2 * 3), 3))
      g.setAttribute('aSeed', new BufferAttribute(seed, 4))
      const mat = new ShaderMaterial({
        uniforms: this.rainU,
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uFall; uniform float uAmount; uniform vec2 uWind; uniform vec3 uCentre;
          varying float vA;
          ${WRAP}
          void main() {
            vec3 dir = normalize(vec3(uWind.x * 0.22, -1.0, uWind.y * 0.22));
            vec3 p = wrap(aSeed.xyz, dir * uFall * 24.0, uCentre);
            p -= dir * aSeed.w * (0.7 + 0.5 * fract(aSeed.x * 7.1));
            // Whether a drop is falling is its own affair, not a matter of where it is: light rain is thin everywhere.
            vA = step(fract(aSeed.x * 91.7 + aSeed.y * 47.3 + aSeed.z * 13.1), uAmount) * (0.32 + 0.22 * aSeed.w);
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: 'uniform vec3 uColor;\nvarying float vA;\nvoid main() {\n  if (vA < 0.01) discard;\n  gl_FragColor = vec4(uColor, vA);\n}',
      })
      this.rain = new LineSegments(g, mat)
      this.disposables.push(g, mat)
    }
    {
      const n = 4200
      const seed = new Float32Array(n * 3)
      for (let k = 0; k < n; k++) seed.set([r(), r(), r()], k * 3)
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
      g.setAttribute('aSeed', new BufferAttribute(seed, 3))
      const mat = new ShaderMaterial({
        uniforms: this.snowU,
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute vec3 aSeed;
          uniform float uFall; uniform float uAmount; uniform vec2 uWind; uniform vec3 uCentre; uniform float uScale;
          varying float vA;
          ${WRAP}
          void main() {
            vec3 p = wrap(aSeed, vec3(uWind.x * 0.5, -1.0, uWind.y * 0.5) * uFall * 2.2, uCentre);
            p.x += sin(uFall * 0.9 + aSeed.z * 30.0) * 0.4;
            p.z += cos(uFall * 0.7 + aSeed.x * 30.0) * 0.4;
            vA = step(aSeed.z, uAmount);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            gl_PointSize = clamp(uScale * (0.05 + 0.05 * aSeed.x) / -mv.z, 1.0, 14.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: 'uniform vec3 uColor;\nvarying float vA;\nvoid main() {\n  vec2 d = gl_PointCoord - 0.5;\n  float a = vA * smoothstep(0.5, 0.15, length(d));\n  if (a < 0.01) discard;\n  gl_FragColor = vec4(uColor, a * 0.85);\n}',
      })
      this.snow = new Points(g, mat)
      this.disposables.push(g, mat)
    }
    for (const o of [this.rain, this.snow]) {
      o.frustumCulled = false
      o.renderOrder = 9
      this.group.add(o)
    }
  }

  // fall: a clock that stops under reduced motion. tint: the colour of the day's light on what falls.
  update(fall: number, rain: number, snowfall: number, windX: number, windZ: number, centre: Vector3, tint: Color, pointScale: number): void {
    this.rain.visible = rain > 0.01
    this.snow.visible = snowfall > 0.01
    this.rainU.uFall.value = fall
    this.rainU.uAmount.value = rain
    this.rainU.uWind.value.set(windX, windZ)
    this.rainU.uCentre.value.copy(centre)
    this.rainU.uColor.value.copy(tint).multiplyScalar(1.5)
    this.snowU.uFall.value = fall
    this.snowU.uAmount.value = snowfall
    this.snowU.uWind.value.set(windX, windZ)
    this.snowU.uCentre.value.copy(centre)
    this.snowU.uColor.value.copy(tint).multiplyScalar(2.6)
    this.snowU.uScale.value = pointScale
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
