// What falls: rain, snow, and in autumn the leaves, in a box of air that stays round what the camera looks at and
// grows with the camera's distance, so the weather reads from the playing height as well as from among the rows.
import {
  BufferAttribute, Color, DoubleSide, Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2, Vector3, type IUniform,
} from 'three'
import { rng } from './noise.ts'

// Each drop keeps its own place in the box and wraps round as the box moves with the camera.
const WRAP = /* glsl */ `
uniform vec3 uCentre;
uniform float uSpan;
vec3 wrap(vec3 seed, vec3 fallen, vec3 box) {
  vec3 p = seed * box + fallen;
  return mod(p - uCentre + box * 0.5, box) - box * 0.5 + uCentre;
}
`

interface Fall { mesh: Mesh; mat: ShaderMaterial; u: Record<string, IUniform>; geo: InstancedBufferGeometry; count: number }

export class Weather {
  readonly group = new Group()
  private rain: Fall
  private snow: Fall
  private leaves: Fall
  private disposables: { dispose(): void }[] = []

  constructor() {
    const r = rng(8)
    const make = (count: number, vertex: string, fragment: string, extra: Record<string, IUniform> = {}): Fall => {
      const g = new InstancedBufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3))
      g.setIndex([0, 1, 2, 1, 3, 2])
      const seed = new Float32Array(count * 4)
      for (let k = 0; k < count * 4; k++) seed[k] = r()
      g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4))
      g.instanceCount = count
      const u: Record<string, IUniform> = {
        uFall: { value: 0 }, uAmount: { value: 0 }, uWind: { value: new Vector2() }, uColor: { value: new Color() }, uCentre: { value: new Vector3() },
        uSpan: { value: 1 }, uPx: { value: new Vector2(0.001, 0.001) }, ...extra,
      }
      const mat = new ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, side: DoubleSide, vertexShader: vertex, fragmentShader: fragment })
      const mesh = new Mesh(g, mat)
      mesh.frustumCulled = false
      mesh.renderOrder = 9
      this.group.add(mesh)
      this.disposables.push(g, mat)
      return { mesh, mat, u, geo: g, count }
    }
    // Rain: streaks along the way it falls, never thinner than a pixel and a half.
    this.rain = make(18000, /* glsl */ `
      attribute vec4 aSeed;
      uniform float uFall; uniform float uAmount; uniform vec2 uWind; uniform vec2 uPx;
      varying float vA; varying float vX;
      ${WRAP}
      void main() {
        vec3 dir = normalize(vec3(uWind.x * 0.24, -1.0, uWind.y * 0.24));
        vec3 head = wrap(aSeed.xyz, dir * uFall * (21.0 + 9.0 * aSeed.w), vec3(70.0, 34.0, 70.0) * uSpan);
        vec4 a = projectionMatrix * viewMatrix * vec4(head, 1.0);
        vec4 b = projectionMatrix * viewMatrix * vec4(head - dir * (0.34 + 0.4 * aSeed.w) * pow(uSpan, 0.6), 1.0);
        vec2 along = (b.xy / max(b.w, 1e-3) - a.xy / max(a.w, 1e-3)) / uPx;
        vec2 across = normalize(vec2(-along.y, along.x) + 1e-5) * uPx;
        vec4 clip = mix(a, b, position.y);
        clip.xy += across * position.x * 0.62 * clip.w;
        // Whether a drop is falling is its own affair, not a matter of where it is: light rain is thin everywhere.
        vA = step(fract(aSeed.x * 91.7 + aSeed.y * 47.3 + aSeed.z * 13.1), uAmount) * (0.1 + 0.2 * aSeed.w) * smoothstep(1.5, 7.0, a.w) * step(0.0, min(a.w, b.w));
        vX = position.x;
        gl_Position = clip;
      }`, 'uniform vec3 uColor;\nvarying float vA; varying float vX;\nvoid main() {\n  float a = vA * (1.0 - vX * vX);\n  if (a < 0.01) discard;\n  gl_FragColor = vec4(uColor, a);\n}')
    // Snow: soft flakes that wander as they come down, big enough far off to be seen falling.
    this.snow = make(7000, /* glsl */ `
      attribute vec4 aSeed;
      uniform float uFall; uniform float uAmount; uniform vec2 uWind; uniform vec2 uPx;
      varying float vA; varying vec2 vUv;
      ${WRAP}
      void main() {
        vec3 p = wrap(aSeed.xyz, vec3(uWind.x * 0.6, -1.0, uWind.y * 0.6) * uFall * (1.9 + 0.9 * aSeed.w), vec3(64.0, 40.0, 64.0) * uSpan);
        p.x += sin(uFall * 0.9 + aSeed.z * 30.0) * 0.45 * uSpan;
        p.z += cos(uFall * 0.7 + aSeed.x * 30.0) * 0.45 * uSpan;
        vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
        float size = (0.03 + 0.035 * aSeed.w) * pow(uSpan, 0.7) * projectionMatrix[1][1] / uPx.y / max(clip.w, 0.1);
        size = clamp(size, 1.6, 10.0);
        vUv = vec2(position.x, position.y * 2.0 - 1.0);
        clip.xy += vUv * size * uPx * clip.w;
        vA = step(aSeed.z, uAmount) * step(0.3, clip.w);
        gl_Position = clip;
      }`, 'uniform vec3 uColor;\nvarying float vA; varying vec2 vUv;\nvoid main() {\n  float a = vA * smoothstep(1.0, 0.3, length(vUv));\n  if (a < 0.01) discard;\n  gl_FragColor = vec4(uColor, a * 0.85);\n}')
    // Leaves: let go along the edge of the woods and carried over the fields, turning as they fall.
    this.leaves = make(900, /* glsl */ `
      attribute vec4 aSeed;
      uniform float uFall; uniform float uAmount; uniform vec2 uWind; uniform vec2 uPx; uniform vec3 uLight; uniform float uFloor;
      varying float vA; varying vec2 vUv; varying vec3 vCol;
      ${WRAP}
      void main() {
        // Leaves fall from the height of a tree, not out of the sky.
        vec3 box = vec3(90.0 * max(1.0, uSpan * 0.8), 20.0, 70.0 * max(1.0, uSpan * 0.8));
        vec3 p = wrap(aSeed.xyz, vec3(uWind.x * 1.6 + 0.3, -1.0, uWind.y * 1.6) * uFall * (0.7 + 0.5 * aSeed.w), box);
        p.y += uFloor + 9.0 - uCentre.y;
        float t = uFall * (1.6 + 2.0 * aSeed.w) + aSeed.x * 40.0;
        p.x += sin(t * 0.7) * 0.5;
        p.z += cos(t * 0.6) * 0.5;
        p.y += sin(t * 1.3) * 0.15;
        vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
        float size = (0.07 + 0.06 * aSeed.w) * (1.0 + 0.22 * uSpan) * projectionMatrix[1][1] / uPx.y / max(clip.w, 0.1);
        float tiny = smoothstep(0.5, 1.3, size);
        size = clamp(size, 1.2, 9.0);
        vec2 c = vec2(position.x, position.y * 2.0 - 1.0);
        vUv = c;
        // a leaf seen turning: it thins to an edge and broadens again
        float s = sin(t * 2.3), k = cos(t * 2.3);
        c = vec2(c.x * k - c.y * s, c.x * s + c.y * k) * vec2(1.0, 0.25 + 0.75 * abs(sin(t * 1.9)));
        clip.xy += c * size * uPx * clip.w;
        // Thick under the trees along the ridge, a few carried everywhere.
        float near = mix(0.12, 1.0, smoothstep(-90.0, -270.0, p.z));
        vA = step(aSeed.z, uAmount * near * tiny) * step(0.3, clip.w);
        vCol = mix(mix(vec3(0.52, 0.13, 0.03), vec3(0.62, 0.36, 0.05), smoothstep(0.2, 0.6, aSeed.y)), vec3(0.34, 0.07, 0.03), step(0.82, aSeed.y)) * uLight * 0.36;
        gl_Position = clip;
      }`, 'varying float vA; varying vec2 vUv; varying vec3 vCol;\nvoid main() {\n  if (vA * step(length(vUv * vec2(1.0, 0.7)), 0.9) < 0.5) discard;\n  gl_FragColor = vec4(vCol, 1.0);\n}', { uLight: { value: new Color() }, uFloor: { value: 0 } })
    this.leaves.mat.transparent = false
    this.leaves.mat.depthWrite = true
    this.leaves.mesh.renderOrder = 0
  }

  // The lower settings draw fewer drops and flakes.
  setTier(tier: 'high' | 'medium' | 'low'): void {
    const share = tier === 'high' ? 1 : tier === 'medium' ? 0.66 : 0.4
    for (const f of [this.rain, this.snow, this.leaves]) f.geo.instanceCount = Math.round(f.count * share)
  }

  // fall: a clock that stops under reduced motion. span: how far the box of air is stretched (the camera's distance).
  // tint: the colour of the day's air on what falls. light: the light on a leaf. res: the picture's size in pixels.
  update(o: {
    fall: number; rain: number; snowfall: number; leaves: number; windX: number; windZ: number; centre: Vector3; span: number
    tint: Color; light: Color; resX: number; resY: number; floor: number
  }): void {
    this.rain.mesh.visible = o.rain > 0.01
    this.snow.mesh.visible = o.snowfall > 0.01
    this.leaves.mesh.visible = o.leaves > 0.01
    const amount = [o.rain, o.snowfall, o.leaves]
    ;[this.rain, this.snow, this.leaves].forEach((f, k) => {
      f.u.uFall.value = o.fall
      f.u.uAmount.value = amount[k]
      f.u.uWind.value.set(o.windX, o.windZ)
      f.u.uCentre.value.copy(o.centre)
      f.u.uSpan.value = o.span
      f.u.uPx.value.set(2 / Math.max(1, o.resX), 2 / Math.max(1, o.resY))
    })
    this.rain.u.uColor.value.copy(o.tint).multiplyScalar(1.35)
    this.snow.u.uColor.value.copy(o.tint).multiplyScalar(2.6)
    this.leaves.u.uLight.value.copy(o.light)
    this.leaves.u.uFloor.value = o.floor
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
