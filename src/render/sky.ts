// The sky: sunlight scattered by air and haze (the analytic model three's Sky uses, after Preetham), a layer of cloud,
// and the sun. Drawn as the backdrop, and into a small map every material reads for the light the sky gives.
import {
  BackSide, BufferAttribute, BufferGeometry, Color, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Mesh, OrthographicCamera,
  RepeatWrapping, Scene, ShaderMaterial, SphereGeometry, Vector2, Vector3, WebGLRenderTarget, type WebGLRenderer,
} from 'three'
import { clamp } from './noise.ts'
import { CLOUD_GLSL, HAZE_GLSL, U } from './shaders.ts'

const RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5]
const MIE = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14]
const SCALE = 0.04

export interface Air { turbidity: number; rayleigh: number; mie: number; g: number }

function betas(air: Air): { r: number[]; m: number[] } {
  const c = 0.2 * air.turbidity * 10e-18
  return { r: RAYLEIGH.map(k => k * air.rayleigh), m: MIE.map(k => 0.434 * c * k * air.mie) }
}

function sunStrength(y: number): number {
  return 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(clamp(y, -1, 1))) / 1.5)))
}

function extinction(y: number, b: { r: number[]; m: number[] }): number[] {
  const zen = Math.acos(Math.max(0, y))
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - zen * 57.29578, -1.253))
  return [0, 1, 2].map(k => Math.exp(-(b.r[k] * 8400 * inv + b.m[k] * 1250 * inv)))
}

// Sunlight reaching the ground square on, in the sky's own units.
export function sunLight(sun: Vector3, air: Air, out: Color): Color {
  const f = extinction(sun.y, betas(air)), e = sunStrength(sun.y) * SCALE
  return out.setRGB(e * f[0], e * f[1], e * f[2])
}

// The clear sky's radiance along a direction: the same arithmetic as clearSky() in the shader below.
export function clearSky(dx: number, dy: number, dz: number, sun: Vector3, air: Air, out: Color): Color {
  const b = betas(air), e = sunStrength(sun.y)
  const y = Math.max(dy, 0.001), l = Math.hypot(dx, y, dz)
  const fex = extinction(y / l, b)
  const cosT = (dx * sun.x + y * sun.y + dz * sun.z) / l
  const rPhase = 0.0596831 * (1 + Math.pow(cosT * 0.5 + 0.5, 2))
  const g2 = air.g * air.g
  const mPhase = 0.07957747 * (1 - g2) / Math.pow(1 - 2 * air.g * cosT + g2, 1.5)
  const low = clamp(Math.pow(1 - sun.y, 5), 0, 1)
  const c = [0, 1, 2].map(k => {
    const scat = (b.r[k] * rPhase + b.m[k] * mPhase) / (b.r[k] + b.m[k])
    let lin = Math.pow(e * scat * (1 - fex[k]), 1.5)
    lin *= 1 + (Math.pow(e * scat * fex[k], 0.5) - 1) * low
    return (lin + 0.1 * fex[k]) * SCALE
  })
  return out.setRGB(c[0], c[1] + 0.0003, c[2] + 0.00075)
}

const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec4 uCloud;
uniform sampler2D uNoise;
uniform vec2 uHaze;
uniform vec3 uHazeSun;
uniform vec3 uHazeAway;
uniform vec4 uMist;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform float uMieG;
uniform vec3 uSkyTune;      // x: gain, y: saturation, z: how much of the sun gets through the cloud
uniform vec3 uDeck;
uniform vec3 uDeckDark;
uniform vec3 uGroundRad;
${CLOUD_GLSL}
${HAZE_GLSL}
vec3 clearSky(vec3 dir, out vec3 fex) {
  float zen = acos(max(0.0, dir.y));
  float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - zen * 57.29578, -1.253));
  fex = exp(-(uBetaR * 8400.0 * inv + uBetaM * 1250.0 * inv));
  float cosT = dot(dir, uSunDir);
  float rPhase = 0.0596831 * (1.0 + pow(cosT * 0.5 + 0.5, 2.0));
  float g2 = uMieG * uMieG;
  float mPhase = 0.07957747 * (1.0 - g2) / pow(1.0 - 2.0 * uMieG * cosT + g2, 1.5);
  vec3 scat = (uBetaR * rPhase + uBetaM * mPhase) / (uBetaR + uBetaM);
  vec3 lin = pow(uSunE * scat * (1.0 - fex), vec3(1.5));
  lin *= mix(vec3(1.0), pow(uSunE * scat * fex, vec3(0.5)), clamp(pow(1.0 - uSunDir.y, 5.0), 0.0, 1.0));
  return (lin + 0.1 * fex) * 0.04 + vec3(0.0, 0.0003, 0.00075);
}
vec3 skyColor(vec3 dir, vec3 eye, float disc) {
  vec3 d = normalize(vec3(dir.x, max(dir.y, 0.001), dir.z));
  vec3 fex;
  vec3 col = clearSky(d, fex);
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSkyTune.y) * uSkyTune.x;
  float cosT = dot(d, uSunDir);
  vec2 p = eye.xz + d.xz / max(d.y, 0.02) * 260.0;
  float shape = cloudField(p) + (texture2D(uNoise, p * 0.0034 + uCloud.zw * 2.0).a - 0.5) * 0.17;
  float dens = cloudCover(shape) * smoothstep(0.004, 0.06, dir.y);
  vec2 toSun = uSunDir.xz / max(length(uSunDir.xz), 1e-3);
  float lit = clamp(0.56 + (shape - cloudField(p + toSun * 80.0)) * 3.4, 0.0, 1.0);
  float thick = smoothstep(0.0, 0.42, shape - (0.95 - uCloud.y * 0.62));
  vec3 cloud = mix(uDeckDark, uDeck, lit * (1.0 - 0.5 * thick));
  cloud += uDeck * pow(max(cosT, 0.0), 14.0) * (1.0 - dens) * 2.2;
  float sun = smoothstep(0.99992, 0.99997, cosT) * disc * mix(1.0, uSkyTune.z, dens);
  col += uSunE * fex * 0.04 * 9.0 * sun;
  col = mix(col, cloud, dens);
  float low = max(dir.y, 0.0015);
  float air = uHaze.x * exp(-uHaze.y * max(eye.y, 0.0)) / (uHaze.y * low);
  air += min(uMist.x * exp(-uMist.y * max(eye.y - uMist.z, -1.5)) / (uMist.y * low), uMist.x * 160.0);
  col = mix(col, hazeTint(d), 1.0 - exp(-air));
  return mix(col, uGroundRad, smoothstep(0.0, -0.35, dir.y));
}
`

const MAP_W = 256, MAP_H = 128

export class Sky {
  readonly dome: Mesh
  readonly map: WebGLRenderTarget
  // How far the light of the sky is scaled, how much colour it keeps, how much sun a cloud lets through.
  readonly tune = new Vector3(1, 1, 0.2)
  readonly deck = new Color()
  readonly deckDark = new Color()
  readonly ground = new Color()
  private uniforms = {
    uSunDir: U.uSunDir, uCloud: U.uCloud, uNoise: U.uNoise, uHaze: U.uHaze, uHazeSun: U.uHazeSun, uHazeAway: U.uHazeAway, uMist: U.uMist,
    uBetaR: { value: new Vector3() }, uBetaM: { value: new Vector3() }, uSunE: { value: 0 }, uMieG: { value: 0.8 },
    uSkyTune: { value: this.tune }, uDeck: { value: this.deck }, uDeckDark: { value: this.deckDark }, uGroundRad: { value: this.ground },
    uRes: { value: new Vector2(MAP_W, MAP_H) }, uCap: { value: 4 }, uLight: { value: 1 },
  }
  private domeMat: ShaderMaterial
  private mapMat: ShaderMaterial
  private mapScene = new Scene()
  private mapCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private disposables: { dispose(): void }[] = []

  constructor() {
    this.domeMat = new ShaderMaterial({
      uniforms: this.uniforms,
      side: BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = wp.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * wp;
          gl_Position.z = gl_Position.w;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        ${SKY_GLSL}
        void main() {
          gl_FragColor = vec4(skyColor(normalize(vDir), cameraPosition, 1.0), 1.0);
        }`,
    })
    const sphere = new SphereGeometry(4200, 48, 24)
    this.dome = new Mesh(sphere, this.domeMat)
    this.dome.frustumCulled = false
    this.dome.renderOrder = -100
    this.dome.matrixAutoUpdate = true

    this.map = new WebGLRenderTarget(MAP_W, MAP_H, { type: HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter })
    this.map.texture.wrapS = RepeatWrapping
    this.mapMat = new ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec2 uRes;
        uniform float uCap;
        uniform float uLight;
        ${SKY_GLSL}
        void main() {
          vec2 uv = gl_FragCoord.xy / uRes;
          float phi = (uv.x - 0.5) * 6.2831853, theta = uv.y * 3.14159265;
          vec3 dir = vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
          // The glare round the sun is the sun's own light: left in, it would fill every shadow.
          vec3 c = skyColor(dir, vec3(0.0, 3.0, 0.0), 0.0) * uLight;
          gl_FragColor = vec4(c * min(1.0, uCap / max(max(c.r, c.g), c.b)), 1.0);
        }`,
    })
    const tri = new BufferGeometry()
    tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const quad = new Mesh(tri, this.mapMat)
    quad.frustumCulled = false
    this.mapScene.add(quad)
    U.uSkyTex.value = this.map.texture
    this.disposables.push(sphere, this.domeMat, this.mapMat, tri, this.map)
  }

  // light: how much of the sky that is seen also lights the scene.
  setAir(air: Air, sun: Vector3, cap: number, light: number): void {
    this.uniforms.uCap.value = cap
    this.uniforms.uLight.value = light
    const b = betas(air)
    this.uniforms.uBetaR.value.set(b.r[0], b.r[1], b.r[2])
    this.uniforms.uBetaM.value.set(b.m[0], b.m[1], b.m[2])
    this.uniforms.uSunE.value = sunStrength(sun.y)
    this.uniforms.uMieG.value = air.g
  }

  // Redraw the map of the sky that lights the scene.
  renderMap(renderer: WebGLRenderer): void {
    const was = renderer.getRenderTarget()
    renderer.setRenderTarget(this.map)
    renderer.render(this.mapScene, this.mapCam)
    renderer.setRenderTarget(was)
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
