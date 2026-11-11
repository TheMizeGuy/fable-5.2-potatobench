// Sky backdrop, sun and sky light, rain, falling snow, and mist lying in the low ground.
import {
  BufferAttribute, BufferGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight, LineSegments, Mesh,
  NormalBlending, Points, Scene, ShaderMaterial, Vector2, Vector3,
} from 'three'
import type { Env } from './env.ts'
import { BLOCK, groundY } from './layout.ts'
import { GLSL_NOISE, rng } from './noise.ts'

const CENTER = new Vector3((BLOCK.x0 + BLOCK.x1) / 2, 0, (BLOCK.z0 + BLOCK.z1) / 2)

export class Weather {
  readonly group = new Group()
  readonly sun: DirectionalLight
  readonly hemi: HemisphereLight
  readonly fog: Fog
  private sky: Mesh
  private skyU = { uTop: { value: new Color() }, uHor: { value: new Color() }, uTime: { value: 0 }, uCloud: { value: 0 }, uRes: { value: new Vector2(1, 1) } }
  private rain: LineSegments
  private rainU = { uTime: { value: 0 }, uAmount: { value: 0 }, uWind: { value: new Vector2() }, uColor: { value: new Color('#c8d0d4') } }
  private snow: Points
  private snowU = { uTime: { value: 0 }, uAmount: { value: 0 }, uWind: { value: new Vector2() }, uScale: { value: 300 } }
  private mist: Mesh[] = []
  private mistU = { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new Color('#e6e9e6') }, uWind: { value: new Vector2() } }
  private disposables: { dispose(): void }[] = []

  constructor(scene: Scene) {
    this.sun = new DirectionalLight(0xffffff, 2.6)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const sc = this.sun.shadow.camera
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 140
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.03
    this.sun.shadow.radius = 3
    this.sun.target.position.copy(CENTER)
    scene.add(this.sun, this.sun.target)
    this.hemi = new HemisphereLight(0xbcd3e0, 0x5a4a38, 1.1)
    scene.add(this.hemi)
    this.fog = new Fog(0xe9eee6, 60, 400)
    scene.fog = this.fog

    // A painted backdrop: a gradient across the screen, light at the bottom.
    const skyGeo = new BufferGeometry()
    skyGeo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const skyMat = new ShaderMaterial({
      uniforms: this.skyU,
      depthWrite: false,
      depthTest: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHor; uniform float uTime; uniform float uCloud; uniform vec2 uRes;
        varying vec2 vUv;
        ${GLSL_NOISE}
        void main() {
          float t = smoothstep(0.0, 1.0, vUv.y);
          vec3 col = mix(uHor, uTop, pow(t, 0.85));
          vec2 p = vec2(vUv.x * uRes.x / uRes.y, vUv.y);
          float c = fbm(p * vec2(2.2, 5.0) + vec2(uTime * 0.004, 0.0));
          col = mix(col, mix(uHor, vec3(1.0), 0.5), uCloud * 0.35 * smoothstep(0.5, 0.75, c) * smoothstep(0.2, 0.8, vUv.y));
          col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
    this.sky = new Mesh(skyGeo, skyMat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -10
    scene.add(this.sky)
    this.disposables.push(skyGeo, skyMat)

    this.rain = this.buildRain()
    this.snow = this.buildSnow()
    this.group.add(this.rain, this.snow)
    for (const y of [0.55, 0.95, 1.4, 2.0]) this.mist.push(this.buildMist(y))
    scene.add(this.group)
  }

  private buildRain(): LineSegments {
    const n = 2600
    const r = rng(8)
    const seed = new Float32Array(n * 2 * 4)
    const pos = new Float32Array(n * 2 * 3)
    for (let k = 0; k < n; k++) {
      const s = [r(), r(), r(), 0]
      seed.set(s, k * 8)
      seed.set([s[0], s[1], s[2], 1], k * 8 + 4)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 4))
    const mat = new ShaderMaterial({
      uniforms: this.rainU,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime; uniform float uAmount; uniform vec2 uWind;
        varying float vA;
        void main() {
          float H = 22.0;
          float y = 18.0 - mod(aSeed.y * H + uTime * 16.0, H);
          vec3 p = vec3(${BLOCK.x0.toFixed(1)} + aSeed.x * ${(BLOCK.x1 - BLOCK.x0).toFixed(1)}, y, ${BLOCK.z0.toFixed(1)} + aSeed.z * ${(BLOCK.z1 - BLOCK.z0).toFixed(1)});
          p.xz += uWind * (18.0 - y) * 0.12;
          vec3 dir = normalize(vec3(uWind.x * 0.12, -1.0, uWind.y * 0.12));
          p -= dir * aSeed.w * 0.55;
          vA = step(aSeed.x * 0.37 + aSeed.z * 0.63, uAmount * 1.05) * smoothstep(-3.0, 0.0, y) * (0.45 + 0.3 * aSeed.w);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: 'uniform vec3 uColor;\nvarying float vA;\nvoid main() {\n  if (vA < 0.01) discard;\n  gl_FragColor = vec4(uColor, vA);\n  #include <colorspace_fragment>\n}',
    })
    const lines = new LineSegments(g, mat)
    lines.frustumCulled = false
    lines.renderOrder = 5
    this.disposables.push(g, mat)
    return lines
  }

  private buildSnow(): Points {
    const n = 2400
    const r = rng(9)
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
        uniform float uTime; uniform float uAmount; uniform vec2 uWind; uniform float uScale;
        varying float vA;
        void main() {
          float H = 22.0;
          float y = 18.0 - mod(aSeed.y * H + uTime * 1.3, H);
          vec3 p = vec3(${BLOCK.x0.toFixed(1)} + aSeed.x * ${(BLOCK.x1 - BLOCK.x0).toFixed(1)}, y, ${BLOCK.z0.toFixed(1)} + aSeed.z * ${(BLOCK.z1 - BLOCK.z0).toFixed(1)});
          p.x += sin(uTime * 0.9 + aSeed.z * 30.0) * 0.4 + uWind.x * (18.0 - y) * 0.1;
          p.z += cos(uTime * 0.7 + aSeed.x * 30.0) * 0.4 + uWind.y * (18.0 - y) * 0.1;
          vA = step(aSeed.z, uAmount) * smoothstep(-3.0, 0.0, y);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * (0.05 + 0.04 * aSeed.x) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: 'varying float vA;\nvoid main() {\n  vec2 d = gl_PointCoord - 0.5;\n  float a = vA * smoothstep(0.5, 0.2, length(d));\n  if (a < 0.01) discard;\n  gl_FragColor = vec4(vec3(0.97), a * 0.9);\n  #include <colorspace_fragment>\n}',
    })
    const pts = new Points(g, mat)
    pts.frustumCulled = false
    pts.renderOrder = 5
    this.disposables.push(g, mat)
    return pts
  }

  // A sheet of mist at height y, faded where the ground comes up through it and at the edges of the block.
  private buildMist(y: number): Mesh {
    const nx = 78, nz = 84
    const pos: number[] = [], alpha: number[] = []
    const x0 = BLOCK.x0 + 0.2, x1 = BLOCK.x1 - 0.2, z0 = -7, z1 = BLOCK.z1 - 0.2
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz
        pos.push(x, y, z)
        const above = y - groundY(x, z)
        const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z)
        alpha.push(Math.max(0, Math.min(1, above / 0.7)) * Math.min(1, edge / 1.6) * (above < 0 ? 0 : 1))
      }
    }
    const idx: number[] = []
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1
        idx.push(a, c, b, b, c, d)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('aAlpha', new BufferAttribute(new Float32Array(alpha), 1))
    g.setIndex(idx)
    const mat = new ShaderMaterial({
      uniforms: { ...this.mistU, uLayer: { value: y } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vA; varying vec2 vXZ;
        void main() { vA = aAlpha; vXZ = position.xz; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAmount; uniform vec3 uColor; uniform vec2 uWind; uniform float uLayer;
        varying float vA; varying vec2 vXZ;
        ${GLSL_NOISE}
        void main() {
          vec2 p = vXZ * 0.16 + uWind * uTime * 0.02 + vec2(uLayer * 3.1, uLayer * 1.7);
          float n = fbm(p) * 0.75 + 0.25 * fbm(p * 2.7 - uTime * 0.01);
          float a = vA * uAmount * smoothstep(0.25, 0.7, n) * (0.5 - 0.12 * uLayer);
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }
      `,
    })
    const mesh = new Mesh(g, mat)
    mesh.renderOrder = 4
    mesh.frustumCulled = false
    this.group.add(mesh)
    this.disposables.push(g, mat)
    return mesh
  }

  // `time` is the ambient clock, slowed to nearly nothing under reduced motion; `fall` moves rain and snow and stops there.
  // `dist` is how far the camera is from the middle of the farm; haze is measured from there.
  update(time: number, fall: number, env: Env, aspect: number, dist: number): void {
    const el = env.sunElev, az = env.sunAz
    const d = 60
    this.sun.position.set(CENTER.x + Math.cos(el) * Math.cos(az) * d, Math.sin(el) * d, CENTER.z + Math.cos(el) * Math.sin(az) * d)
    this.sun.color.copy(env.sun)
    this.sun.intensity = env.sunI
    this.hemi.color.copy(env.hemiSky)
    this.hemi.groundColor.copy(env.hemiGround)
    this.hemi.intensity = env.hemiI
    this.fog.color.copy(env.skyHorizon)
    this.fog.near = dist - 30 + 6 * env.fog
    this.fog.far = dist + 14 + 320 * (1 - env.fog) * (1 - env.fog)
    this.skyU.uTop.value.copy(env.skyTop)
    this.skyU.uHor.value.copy(env.skyHorizon)
    this.skyU.uTime.value = time
    this.skyU.uCloud.value = env.cloud
    this.skyU.uRes.value.set(aspect, 1)
    const wx = Math.cos(env.windDir) * env.wind, wz = Math.sin(env.windDir) * env.wind
    this.rainU.uTime.value = fall
    this.rainU.uAmount.value = env.rain
    this.rainU.uWind.value.set(wx, wz)
    this.rain.visible = env.rain > 0.01
    this.snowU.uTime.value = fall
    this.snowU.uAmount.value = env.snowfall
    this.snowU.uWind.value.set(wx, wz)
    this.snow.visible = env.snowfall > 0.01
    this.mistU.uTime.value = time
    this.mistU.uAmount.value = env.mist
    this.mistU.uWind.value.set(wx + 0.3, wz + 0.1)
    this.mistU.uColor.value.copy(env.skyHorizon).lerp(new Color(1, 1, 1), 0.35)
    for (const m of this.mist) m.visible = env.mist > 0.01
  }

  setPointScale(px: number): void {
    this.snowU.uScale.value = px
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}

