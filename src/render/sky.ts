// The sky: sunlight scattered by air and haze (the analytic model three's Sky uses, after Preetham), low cumulus with
// lit edges and dark bases under streaks of high ice cloud, the sun and its glow, and by night a moon and stars.
// Drawn as the backdrop, and into a small map every material reads for the light the sky gives.
import {
  BackSide, BufferAttribute, BufferGeometry, Color, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Mesh, OrthographicCamera,
  RepeatWrapping, Scene, ShaderMaterial, SphereGeometry, Vector2, Vector3, Vector4, WebGLRenderTarget, type WebGLRenderer,
} from 'three'
import { clamp } from './noise.ts'
import { CLOUD_GLSL, HAZE_GLSL, U, HAZE_PER_M } from './shaders.ts'

const RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5]
const MIE = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14]
const SCALE = 0.04

// The sky once the sun is well down, in the same units as the day's.
export const NIGHT_ZENITH = new Color(0.0032, 0.0062, 0.017)
export const NIGHT_HORIZON = new Color(0.0085, 0.0135, 0.027)

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
  // The model keeps a floor of light after the sun has gone; it goes with the sun.
  const lit = clamp(e / 20, 0, 1)
  return out.setRGB(c[0] * lit, (c[1] + 0.0003) * lit, (c[2] + 0.00075) * lit)
}

const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSkySun;       // where the sun itself is, which may be below the horizon
uniform vec3 uMoon;
uniform vec4 uCloud;
uniform sampler2D uNoise;
uniform vec2 uHaze;
uniform vec3 uHazeSun;
uniform vec3 uHazeAway;
uniform vec4 uMist;
uniform vec3 uMistCol;
uniform vec3 uSunCol;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform float uMieG;
uniform vec3 uSkyTune;      // x: gain, y: saturation, z: how much of the sun gets through the cloud
uniform vec4 uSkyMore;      // x: high cloud, y: how torn and dark the cloud is, z: night, w: a clock for the stars
uniform vec3 uDeck;
uniform vec3 uDeckDark;
uniform vec3 uRim;
uniform vec3 uHighCol;
uniform vec3 uGlow;
uniform vec3 uGroundRad;
uniform float uExposure;
${CLOUD_GLSL}
${HAZE_GLSL}
vec3 clearSky(vec3 dir, out vec3 fex) {
  float zen = acos(max(0.0, dir.y));
  float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - zen * 57.29578, -1.253));
  fex = exp(-(uBetaR * 8400.0 * inv + uBetaM * 1250.0 * inv));
  float cosT = dot(dir, uSkySun);
  float rPhase = 0.0596831 * (1.0 + pow(cosT * 0.5 + 0.5, 2.0));
  float g2 = uMieG * uMieG;
  float mPhase = 0.07957747 * (1.0 - g2) / pow(1.0 - 2.0 * uMieG * cosT + g2, 1.5);
  vec3 scat = (uBetaR * rPhase + uBetaM * mPhase) / (uBetaR + uBetaM);
  vec3 lin = pow(uSunE * scat * (1.0 - fex), vec3(1.5));
  lin *= mix(vec3(1.0), pow(uSunE * scat * fex, vec3(0.5)), clamp(pow(1.0 - uSkySun.y, 5.0), 0.0, 1.0));
  return ((lin + 0.1 * fex) * 0.04 + vec3(0.0, 0.0003, 0.00075)) * clamp(uSunE / 20.0, 0.0, 1.0);
}
vec3 hash32(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
// The night: a deep sky paler toward the land, the last colour where the sun went down, stars, and the moon.
vec3 nightSky(vec3 d, float disc, float night) {
  vec3 col = mix(${glsl(NIGHT_HORIZON)}, ${glsl(NIGHT_ZENITH)}, pow(d.y, 0.55)) * night;
  vec2 a = d.xz / max(length(d.xz), 1e-4), b = uSkySun.xz / max(length(uSkySun.xz), 1e-4);
  float toward = max(dot(a, b), 0.0);
  col += uGlow * (pow(toward, 3.0) * exp(-d.y * 7.0) + 0.08 * exp(-d.y * 4.0));
  if (night < 0.01) return col;
  float cm = max(dot(d, uMoon), 0.0);
  if (disc > 0.5) {
    vec2 uv = d.xz / (1.0 + d.y) * 64.0;
    vec3 h = hash32(floor(uv));
    float r = length(fract(uv) - 0.2 - 0.6 * h.xy);
    float twinkle = 0.75 + 0.25 * sin(uSkyMore.w * (1.5 + 3.0 * h.y) + h.x * 40.0);
    float bright = fract(h.z * 37.0);
    col += vec3(0.9, 0.95, 1.1) * night * step(0.72, h.z) * smoothstep(0.13, 0.0, r) * (0.03 + 0.42 * bright * bright) * twinkle * smoothstep(0.02, 0.2, d.y);
    float seas = texture2D(uNoise, (d.xz - uMoon.xz) * 9.0 + 0.4).b;
    col += vec3(0.86, 0.87, 0.82) * night * smoothstep(0.99965, 0.99978, cm) * (0.7 + 0.5 * seas) * 0.5;
  }
  return col + vec3(0.22, 0.3, 0.46) * night * (pow(cm, 700.0) * 0.05 + pow(cm, 30.0) * 0.006);
}
vec3 skyColor(vec3 dir, vec3 eye, float disc) {
  vec3 d = normalize(vec3(dir.x, max(dir.y, 0.001), dir.z));
  vec3 fex;
  vec3 col = clearSky(d, fex);
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSkyTune.y) * uSkyTune.x;
  float night = uSkyMore.z;
  col += nightSky(d, disc, night);
  float cosT = dot(d, uSkySun);
  vec3 sunCol = uSunE * fex * 0.04;

  // High cloud: streaks of ice far above, which take the colour of the sun long after the land has lost it.
  vec2 ph = d.xz / (d.y + 0.2);
  float streak = texture2D(uNoise, vec2(ph.x * 0.16 + ph.y * 0.05, ph.y * 0.62 - ph.x * 0.04) + uCloud.zw * 0.2).a;
  float bank = texture2D(uNoise, ph * 0.07 + 0.31 + uCloud.zw * 0.2).b;
  float high = uSkyMore.x * smoothstep(0.64, 1.0, streak * 0.5 + bank * 0.62) * smoothstep(0.0, 0.14, dir.y);
  col = mix(col, uHighCol * (0.8 + 0.4 * streak) + sunCol * 0.012 * pow(max(cosT, 0.0), 6.0), high * 0.75);

  // Cumulus with body. The cloud is a slab of air over a flat base, and the line of sight is followed up through it
  // from the base: a cloud stands tallest where it is thickest, so from the side it is seen as a heap with a dark
  // floor, a lit shoulder toward the sun and a grey one away, and far cloud stands in ranks down to the horizon.
  // The field is the one that throws the shadows on the land.
  // (Toward the horizon the layer is drawn nearer than it is, or its clouds would shrink to a grain.)
  float reach = 1.0 / (d.y + 0.14);
  // Seen low, the line of sight would run through one cloud into the next: it is followed up only as far as one cloud's breadth.
  float lean = min(reach, 1.4);
  vec2 toSun = uSunDir.xz / max(length(uSunDir.xz), 1e-3);
  float closed = smoothstep(0.75, 1.0, uCloud.y);
  // Seen from the side a cloud covers more of the sky than its footprint does of the ground: its foot is drawn in a little.
  float edge0 = cloudEdge() + 0.07 * (1.0 - closed);
  // Only cloud near the sun in the picture is seen against the light.
  float into = smoothstep(0.5, 0.96, cosT);
  float dens = 0.0, thick = 0.0;
  vec3 cloud = vec3(0.0);
  vec2 p = eye.xz + d.xz * reach * CLOUD_H;
  // Most cumulus are shallow; here and there, where the air is rising, one towers to three times their height.
  float tower = smoothstep(0.52, 0.8, texture2D(uNoise, p * 0.00027 + uCloud.zw * 0.31 + 0.61).b) * (1.0 - closed);
  float taper = mix(0.62, 0.17, tower) - 0.4 * closed;
  for (int i = 0; i < CLOUD_STEPS; i++) {
    float up = (float(i) + 0.5) / float(CLOUD_STEPS);
    vec2 q = p + d.xz * lean * CLOUD_T * up;
    float wisp = texture2D(uNoise, q * 0.0019 + uCloud.zw * 2.3).a;
    float curl = texture2D(uNoise, q * 0.0061 + uCloud.zw * 4.0).b;
    float shape = cloudField(q) + (wisp - 0.5) * 0.1 + (curl - 0.5) * 0.06 * (0.4 + up);
    // How much cloud there is at this height: all of the footprint at the base, only the heart of it at the top.
    float a = smoothstep(0.0, 0.07 + 0.05 * up, shape - edge0 - up * taper) * (0.82 - 0.3 * up);
    // The shoulder toward the sun is lit, the one away from it is in the cloud's own shade.
    // (No branch and no early way out of this loop: a texture read inside either loses its level of detail on some
    // graphics chips, and the far cloud would turn to grit.)
    float sunward = cloudField(q + toSun * 190.0);
    float side = clamp((shape - sunward) * 4.5, -1.0, 1.0);
    float body = smoothstep(0.0, 0.34, shape - edge0 - up * taper);
    // Seen with the light: a grey base, shoulders that brighten with height, the sunward one brightest. Seen against
    // it: bright thin edges round a dark body.
    float front = clamp(0.34 + 0.62 * up + 0.5 * side - 0.3 * body * (1.0 - up), 0.0, 1.0);
    float back = clamp(0.12 + 0.88 * (1.0 - body) + 0.3 * side, 0.0, 1.0);
    float lit = mix(front, back, into);
    float take = a * (1.0 - dens);
    cloud += mix(uDeckDark, uDeck, lit) * take;
    thick += body * take;
    dens += take;
  }
  cloud /= max(dens, 1e-4);
  thick /= max(dens, 1e-4);
  // A closed sky is not one grey: it lies in long soft folds, and hangs darker where rain is in it.
  float fold = texture2D(uNoise, p * 0.00016 + uCloud.zw * 0.5).b * 0.62 + texture2D(uNoise, p * 0.00055 + 0.3 + uCloud.zw * 0.9).b * 0.38;
  float torn = fold * 0.6 + texture2D(uNoise, p * 0.0019 + uCloud.zw * 2.3).a * 0.4;
  cloud *= mix(1.0, 0.52 + 0.86 * fold, closed) * (1.0 - uSkyMore.y * 0.5 * smoothstep(0.3, 0.75, torn));
  // Thin cloud before the sun lets it through: a bright edge.
  cloud += uRim * pow(max(cosT, 0.0), 14.0) * (1.0 - 0.8 * thick) * 1.4;
  // Before the sun itself the cloud is thin, so the sun is a disc in a glow and never a smear.
  dens *= smoothstep(0.0, 0.05, dir.y) * (1.0 - 0.85 * pow(max(cosT, 0.0), 900.0));

  float sun = smoothstep(0.999962, 0.999985, cosT) * disc * mix(1.0, uSkyTune.z, dens);
  float aureole = pow(max(cosT, 0.0), 5000.0) * 0.5 + pow(max(cosT, 0.0), 260.0) * 0.045;
  col += sunCol * (sun * 16.0 + aureole * (1.0 - 0.8 * dens));
  col = mix(col, cloud, dens);
  #ifdef SKY_HOLD
  {
    // The sky is held under white as the lens will show it, so it keeps its colour right up to the sun; only the sun
    // itself is let through, and a closed sky, which has no sun to hold back. This is done before the land's air is
    // laid over the low sky, so that air is the same brightness against the sky as it is against the far hills.
    vec3 v = col * uExposure;
    float m = max(v.r, max(v.g, v.b));
    float held = m <= 0.55 ? m : 0.55 + 0.6 * (1.0 - exp(-(m - 0.55) / 1.0));
    float through = max(smoothstep(0.99972, 0.99994, cosT), smoothstep(0.75, 1.0, uCloud.y));
    col *= mix(held / max(m, 1e-5), 1.0, through);
  }
  #endif
  float low = max(dir.y, 0.0015);
  // The sky has its own air in it already: the land's haze is laid over only its lowest few degrees, where the far
  // country goes into it; in thick weather it stands higher, so no skyline shows through rain or snow.
  float air = uHaze.x * ${HAZE_PER_M.toFixed(3)} / (0.0042 * low) + smoothstep(0.0009, 0.002, uHaze.x) * 0.6 / low;
  air += min(uMist.x * exp(-uMist.y * max(eye.y - uMist.z, -1.5)) / (uMist.y * low), uMist.x * 60.0);
  col = mix(col, hazeTint(d), 1.0 - exp(-air));
  return mix(col, uGroundRad, smoothstep(0.0, -0.35, dir.y));
}
`

function glsl(c: Color): string {
  return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`
}

const MAP_W = 256, MAP_H = 128

export class Sky {
  readonly dome: Mesh
  readonly map: WebGLRenderTarget
  // How far the light of the sky is scaled, how much colour it keeps, how much sun a cloud lets through.
  readonly tune = new Vector3(1, 1, 0.2)
  // High cloud, how torn the cloud is, night, and the stars' clock.
  readonly more = new Vector4(0.3, 0, 0, 0)
  readonly sun = new Vector3(0, 1, 0)
  readonly moon = new Vector3(0, 1, 0)
  readonly deck = new Color()
  readonly deckDark = new Color()
  readonly rim = new Color()
  readonly high = new Color()
  readonly glow = new Color()
  readonly ground = new Color()
  private uniforms = {
    uSunDir: U.uSunDir, uCloud: U.uCloud, uNoise: U.uNoise, uHaze: U.uHaze, uHazeSun: U.uHazeSun, uHazeAway: U.uHazeAway, uMist: U.uMist,
    uMistCol: U.uMistCol, uSunCol: U.uSunCol,
    uSkySun: { value: this.sun }, uMoon: { value: this.moon },
    uBetaR: { value: new Vector3() }, uBetaM: { value: new Vector3() }, uSunE: { value: 0 }, uMieG: { value: 0.8 },
    uSkyTune: { value: this.tune }, uSkyMore: { value: this.more }, uDeck: { value: this.deck }, uDeckDark: { value: this.deckDark },
    uRim: { value: this.rim }, uHighCol: { value: this.high }, uGlow: { value: this.glow }, uGroundRad: { value: this.ground },
    uRes: { value: new Vector2(MAP_W, MAP_H) }, uCap: { value: 4 }, uLight: { value: 1 }, uExposure: { value: 1 },
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
      defines: { CLOUD_STEPS: 7, SKY_HOLD: 1 },
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
    const sphere = new SphereGeometry(9000, 48, 24)
    this.dome = new Mesh(sphere, this.domeMat)
    this.dome.frustumCulled = false
    // Drawn after the land, where the land has left the sky showing.
    this.dome.renderOrder = 100
    this.dome.matrixAutoUpdate = true

    this.map = new WebGLRenderTarget(MAP_W, MAP_H, { type: HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter })
    this.map.texture.wrapS = RepeatWrapping
    this.mapMat = new ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      defines: { CLOUD_STEPS: 3 },
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
          vec3 c = skyColor(dir, vec3(0.0, 12.0, 0.0), 0.0) * uLight;
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

  // sun: where the sun itself is. light: how much of the sky that is seen also lights the scene.
  setAir(air: Air, sun: Vector3, moon: Vector3, cap: number, light: number, exposure: number): void {
    this.uniforms.uCap.value = cap
    this.uniforms.uLight.value = light
    this.uniforms.uExposure.value = exposure
    this.sun.copy(sun)
    this.moon.copy(moon)
    const b = betas(air)
    this.uniforms.uBetaR.value.set(b.r[0], b.r[1], b.r[2])
    this.uniforms.uBetaM.value.set(b.m[0], b.m[1], b.m[2])
    this.uniforms.uSunE.value = sunStrength(sun.y)
    this.uniforms.uMieG.value = air.g
  }

  // How many steps the clouds' body is followed through (the quality setting's).
  setSteps(n: number): void {
    if (this.domeMat.defines.CLOUD_STEPS === n) return
    this.domeMat.defines.CLOUD_STEPS = n
    this.domeMat.needsUpdate = true
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
