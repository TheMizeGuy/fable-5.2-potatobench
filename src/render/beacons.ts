// What carries from far off: a lamp in a farmhouse window at dusk, ours and every neighbour's, and the two things of
// known size on the horizon, the church's tower and spire and the water tower by the siding. Each is a few pixels of
// true geometry at the playing distances and would be lost in the air; here each is drawn again as a mark that never
// gets smaller on the screen than the eye can find, and gives way to the real thing as the camera comes near.
import {
  AdditiveBlending, BufferAttribute, Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NormalBlending, Group, ShaderMaterial,
  Vector2,
} from 'three'
import { FARMSTEADS } from './flora.ts'
import { DUFOUR_HOUSE, HOUSE, SIDING, VILLAGE, groundY } from './layout.ts'
import { hash2 } from './noise.ts'
import { S } from './scale.ts'
import { FRAG_LIB, SHARED, U } from './shaders.ts'

const quad = (): InstancedBufferGeometry => {
  const g = new InstancedBufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3))
  g.setIndex([0, 1, 2, 1, 3, 2])
  return g
}

export class Beacons {
  readonly group = new Group()
  private lampU = { ...U, uPx: { value: new Vector2(0.001, 0.001) }, uDusk: { value: 0 }, uGain: { value: 1 } }
  private markU = { ...U, uPx: { value: new Vector2(0.001, 0.001) } }
  private disposables: { dispose(): void }[] = []

  constructor() {
    // ---- Lamps: the kitchen window of every farmhouse, and a few along the village street.
    const lamps: number[] = []
    const lamp = (x: number, z: number, k: number) => lamps.push(x, groundY(x, z) + 3, z, k < 3 ? 0.1 : hash2(k, 71))
    lamp(HOUSE.x, HOUSE.z, 1)
    lamp(DUFOUR_HOUSE.x, DUFOUR_HOUSE.z, 2)
    FARMSTEADS.forEach(([x, z], k) => lamp(x, z, 10 + k))
    for (let k = 0; k < 6; k++) lamp(VILLAGE.x + (k - 2.5) * 21 + (hash2(k, 3) - 0.5) * 8, VILLAGE.z + (k % 2 ? -16 : 16), 60 + k)
    lamp(SIDING.x + 12, SIDING.z + 8, 80)
    {
      const g = quad()
      g.setAttribute('aAt', new InstancedBufferAttribute(new Float32Array(lamps), 4))
      g.instanceCount = lamps.length / 4
      const mat = new ShaderMaterial({
        uniforms: this.lampU, transparent: true, depthWrite: false, blending: AdditiveBlending,
        vertexShader: /* glsl */ `
          ${SHARED}
          attribute vec4 aAt;
          uniform vec2 uPx; uniform float uDusk;
          varying vec2 vUv; varying float vOn;
          void main() {
            vUv = vec2(position.x, position.y * 2.0 - 1.0);
            // The lamp is in a window: it is drawn a house's depth nearer the eye than the house's middle, so the house's
            // own walls do not hide it and whatever stands in front of the house still does.
            vec3 eye = aAt.xyz - cameraPosition;
            float far = length(eye);
            vec3 at = aAt.xyz - eye / far * min(17.0, far * 0.5);
            vWorld = at;
            vec4 clip = projectionMatrix * viewMatrix * vec4(at, 1.0);
            // Never smaller than a couple of pixels; near at hand the real window takes over.
            float px = 0.9 * projectionMatrix[1][1] / uPx.y / max(clip.w, 0.1);
            float size = max(px, 5.0);
            clip.xy += vUv * size * uPx * clip.w;
            // They are lit one house after another as the light goes; a few keep early hours.
            vOn = smoothstep(aAt.w * 0.85, aAt.w * 0.85 + 0.12, uDusk) * smoothstep(70.0, 260.0, far) * step(0.3, clip.w);
            gl_Position = clip;
          }`,
        fragmentShader: /* glsl */ `
          ${SHARED}
          ${FRAG_LIB}
          uniform float uGain;
          varying vec2 vUv; varying float vOn;
          void main() {
            float r = length(vUv);
            float glow = (exp(-r * r * 9.0) + 0.22 * exp(-r * r * 2.2)) * vOn;
            if (glow < 0.004) discard;
            // Bright enough for the lens to bloom, whatever the exposure; the air between takes some of it.
            vec3 hv = vWorld - cameraPosition;
            float hm;
            float ha = hazeAmount(cameraPosition.y, vWorld.y, length(hv), vWorld.xz, hm);
            gl_FragColor = vec4(vec3(1.0, 0.62, 0.27) * (uGain * glow * (1.0 - 0.75 * ha)), 1.0);
          }`,
      })
      const mesh = new Mesh(g, mat)
      mesh.frustumCulled = false
      mesh.renderOrder = 7
      this.group.add(mesh)
      this.disposables.push(g, mat)
    }
    // ---- Landmarks. Each: its foot, its height and half-width in metres, how far its top is pinched, its colour.
    const marks: { x: number; y: number; z: number; h: number; half: number; pinch: number; col: string }[] = []
    {
      // The church stands by the village street (src/render/yard.ts): a white tower, and the spire over it.
      const x = VILLAGE.x + 6 * S, z = VILLAGE.z + (-12 + 5.2) * S, y = groundY(x, z)
      marks.push({ x, y, z, h: 8.8 * S, half: 1.15 * S, pinch: 0, col: '#ece7da' })
      marks.push({ x, y: y + 8.8 * S, z, h: 4.8 * S, half: 0.95 * S, pinch: 1, col: '#59626a' })
      // The water tower by the siding: its tank, on legs too thin to see from here.
      const tx = SIDING.x, tz = SIDING.z, ty = groundY(tx, tz)
      marks.push({ x: tx, y: ty + 10.2 * S, z: tz, h: 4.6 * S, half: 2.5 * S, pinch: 0.15, col: '#b4bcbe' })
      marks.push({ x: tx, y: ty, z: tz, h: 10.2 * S, half: 1.7 * S, pinch: 0.25, col: '#6f7376' })
    }
    {
      const g = quad()
      const at = new Float32Array(marks.length * 4), shape = new Float32Array(marks.length * 4), c = new Color()
      marks.forEach((m, k) => {
        at.set([m.x, m.y, m.z, m.h], k * 4)
        c.set(m.col)
        shape.set([c.r, c.g, c.b, m.half + 100 * Math.round(m.pinch * 100)], k * 4)
      })
      g.setAttribute('aAt', new InstancedBufferAttribute(at, 4))
      g.setAttribute('aShape', new InstancedBufferAttribute(shape, 4))
      g.instanceCount = marks.length
      const mat = new ShaderMaterial({
        uniforms: this.markU, transparent: true, depthWrite: false, blending: NormalBlending,
        vertexShader: /* glsl */ `
          ${SHARED}
          attribute vec4 aAt; attribute vec4 aShape;
          uniform vec2 uPx;
          varying vec3 vCol; varying float vSide; varying float vShow;
          void main() {
            float pinch = floor(aShape.w / 100.0 + 0.5) / 100.0, half0 = aShape.w - pinch * 10000.0;
            vCol = aShape.rgb;
            // Drawn a little nearer the eye than the thing itself, so its own walls and the trees at its foot do not hide it.
            vec3 toEye = cameraPosition - aAt.xyz;
            float off = length(toEye);
            vec3 foot = aAt.xyz + toEye / off * min(45.0, off * 0.2), top = foot + vec3(0.0, aAt.w, 0.0);
            vec4 a = projectionMatrix * viewMatrix * vec4(foot, 1.0), b = projectionMatrix * viewMatrix * vec4(top, 1.0);
            vec4 clip = mix(a, b, position.y);
            // Its true width on the screen, and the least it is drawn at: a needle the eye can find.
            float px = half0 * projectionMatrix[0][0] / uPx.x / max(clip.w, 0.1);
            float wide = max(px, 2.4) * (1.0 - pinch * position.y);
            clip.x += position.x * wide * uPx.x * clip.w;
            // The sunward side is lit and the other is in shade: which is which depends on where the sun stands.
            vec3 eye = normalize(aAt.xyz - cameraPosition);
            vSide = position.x * sign(eye.x * uSunDir.z - eye.z * uSunDir.x);
            // Once the real thing is wide enough on the screen this gives way to it.
            vShow = (1.0 - smoothstep(7.0, 11.0, px)) * step(0.3, min(a.w, b.w));
            vWorld = mix(foot, top, position.y);
            gl_Position = clip;
          }`,
        fragmentShader: /* glsl */ `
          ${SHARED}
          ${FRAG_LIB}
          varying vec3 vCol; varying float vSide; varying float vShow;
          void main() {
            if (vShow < 0.01) discard;
            float lit = smoothstep(-0.25, 0.25, vSide);
            // (A white tower in a low sun is still seen as white: the light on it keeps half its colour.)
            vec3 sun = mix(vec3(dot(uSunCol, vec3(0.2126, 0.7152, 0.0722))), uSunCol, 0.5);
            vec3 col = vCol * (sun * (0.08 + 0.92 * lit) * 1.1 + skyIrradiance(vec3(0.0, 1.0, 0.0))) * 0.3183;
            // It stands in the same air as the land round it, but a bright thing against a dull one carries further.
            vec3 hv = vWorld - cameraPosition;
            float hd = length(hv), hm;
            float ha = hazeAmount(cameraPosition.y, vWorld.y, hd, vWorld.xz, hm) * 0.45;
            col = mix(col, hazeTint(hv / hd), ha);
            // Under a closed sky nothing far off is darker than the air it stands in.
            col = max(col, hazeTint(hv / hd) * ha * 0.9);
            gl_FragColor = vec4(col, vShow);
          }`,
      })
      const mesh = new Mesh(g, mat)
      mesh.frustumCulled = false
      mesh.renderOrder = 6
      this.group.add(mesh)
      this.disposables.push(g, mat)
    }
  }

  // dusk: how much lamplight the hour wants, 0..1. exposure: the lens's, so a lamp is as bright in the picture whatever it is.
  update(resX: number, resY: number, dusk: number, exposure: number): void {
    this.lampU.uPx.value.set(2 / Math.max(1, resX), 2 / Math.max(1, resY))
    this.markU.uPx.value.set(2 / Math.max(1, resX), 2 / Math.max(1, resY))
    this.lampU.uDusk.value = dusk
    this.lampU.uGain.value = 3.4 / Math.max(0.05, exposure)
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
