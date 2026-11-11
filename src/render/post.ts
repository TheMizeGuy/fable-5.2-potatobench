// The lens: the scene is drawn in open-ended light, then given contact shade, a shallow focus, a little bloom,
// a filmic curve, anti-aliasing and grain on its way to the screen.
import {
  BufferAttribute, BufferGeometry, DepthTexture, HalfFloatType, LinearFilter, Matrix4, Mesh, NearestFilter, OrthographicCamera,
  RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, UnsignedIntType, Vector2, Vector4, WebGLRenderTarget,
  type PerspectiveCamera, type Texture, type WebGLRenderer,
} from 'three'

export interface PostOptions { msaa: number; ao: boolean; focus: boolean; bloom: boolean }
export interface Shot { exposure: number; focus: number; aperture: number; time: number; grain: number }

const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }'

const DEPTH_GLSL = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uInvProj;
vec3 viewPos(vec2 uv) {
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).r * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
`

// How far out of focus a point at view depth z is, 0..1: sharp in a band about the focus, softer the further from it.
const COC_GLSL = /* glsl */ `
uniform vec2 uLens;      // x: the distance in focus, y: aperture
float cocAt(float z) {
  float d = 1.0 - uLens.x / max(z, 0.05);
  // What is nearer than the focus goes soft, never to a smear.
  float c = d < 0.0 ? min(-d, 1.3) * 0.55 : d;
  return clamp(uLens.y * (c - 0.1) / 0.9, 0.0, 1.0);
}
`

const AO_FRAG = /* glsl */ `
${DEPTH_GLSL}
uniform vec2 uRes;
uniform float uProjScale;
const float RADIUS = 0.85;
const int TAPS = 10;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, px = 1.0 / uRes;
  if (texture2D(tDepth, uv).r >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 c = viewPos(uv);
  vec3 r = viewPos(uv + vec2(px.x, 0.0)) - c, l = c - viewPos(uv - vec2(px.x, 0.0));
  vec3 u = viewPos(uv + vec2(0.0, px.y)) - c, d = c - viewPos(uv - vec2(0.0, px.y));
  vec3 n = normalize(cross(abs(r.z) < abs(l.z) ? r : l, abs(u.z) < abs(d.z) ? u : d));
  float reach = min(RADIUS * uProjScale / -c.z, 48.0);
  float turn = 6.2831853 * ign(gl_FragCoord.xy);
  float sum = 0.0;
  for (int i = 0; i < TAPS; i++) {
    float a = (float(i) + 0.5) / float(TAPS);
    float th = a * 43.98 + turn;
    vec3 v = viewPos(uv + vec2(cos(th), sin(th)) * a * reach * px) - c;
    float vv = dot(v, v), f = max(RADIUS * RADIUS - vv, 0.0);
    sum += f * f * f * max((dot(v, n) - 0.012 - 0.0012 * -c.z) / (vv + 0.004), 0.0);
  }
  float ao = max(0.0, 1.0 - sum * 5.0 / (float(TAPS) * pow(RADIUS, 6.0)));
  // Contact shade belongs to what is near: let it go where the air takes over.
  gl_FragColor = vec4(mix(ao, 1.0, smoothstep(140.0, 420.0, -c.z)));
}
`

const AO_BLUR_FRAG = /* glsl */ `
${DEPTH_GLSL}
uniform sampler2D tAO;
uniform vec2 uRes;
uniform vec2 uDir;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float z = viewPos(uv).z;
  float sum = 0.0, wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 o = uv + uDir * float(i) / uRes;
    float w = exp(-float(i * i) / 6.0) * max(0.0, 1.0 - abs(viewPos(o).z - z) / (0.06 * -z + 0.05));
    sum += texture2D(tAO, o).r * w;
    wsum += w;
  }
  gl_FragColor = vec4(wsum > 0.0 ? sum / wsum : 1.0);
}
`

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uExposure;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, px = 0.5 / uRes;
  vec3 c = (texture2D(tScene, uv + px * vec2(-1.0, -1.0)).rgb + texture2D(tScene, uv + px * vec2(1.0, -1.0)).rgb
    + texture2D(tScene, uv + px * vec2(-1.0, 1.0)).rgb + texture2D(tScene, uv + px * vec2(1.0, 1.0)).rgb) * 0.25 * uExposure;
  float b = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(min(c * max(b - 0.95, 0.0) / max(b, 1e-4), vec3(24.0)), 1.0);
}
`

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uRes;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, px = 0.5 / uRes;
  gl_FragColor = (texture2D(tSrc, uv + px * vec2(-1.0, -1.0)) + texture2D(tSrc, uv + px * vec2(1.0, -1.0))
    + texture2D(tSrc, uv + px * vec2(-1.0, 1.0)) + texture2D(tSrc, uv + px * vec2(1.0, 1.0))) * 0.25;
}
`

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tAdd;
uniform vec2 uRes;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, px = 1.0 / uRes;
  vec4 s = texture2D(tSrc, uv) * 4.0;
  s += (texture2D(tSrc, uv + px * vec2(-1.0, 0.0)) + texture2D(tSrc, uv + px * vec2(1.0, 0.0)) + texture2D(tSrc, uv + px * vec2(0.0, -1.0)) + texture2D(tSrc, uv + px * vec2(0.0, 1.0))) * 2.0;
  s += texture2D(tSrc, uv + px * vec2(-1.0, -1.0)) + texture2D(tSrc, uv + px * vec2(1.0, -1.0)) + texture2D(tSrc, uv + px * vec2(-1.0, 1.0)) + texture2D(tSrc, uv + px * vec2(1.0, 1.0));
  gl_FragColor = texture2D(tAdd, uv) + s / 16.0 * 0.8;
}
`

const FOCUS_PRE_FRAG = /* glsl */ `
${DEPTH_GLSL}
${COC_GLSL}
uniform sampler2D tScene;
uniform vec2 uRes;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  gl_FragColor = vec4(min(texture2D(tScene, uv).rgb, vec3(40.0)), cocAt(-viewPos(uv).z));
}
`

const FOCUS_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uRes;
const float REACH = 7.0;
const int TAPS = 22;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, px = 1.0 / uRes;
  vec4 c = texture2D(tSrc, uv);
  vec3 sum = c.rgb;
  float wsum = 1.0, turn = 6.2831853 * ign(gl_FragCoord.xy);
  for (int i = 0; i < TAPS; i++) {
    float a = sqrt((float(i) + 0.5) / float(TAPS)), th = float(i) * 2.39996 + turn;
    float dist = a * REACH * max(c.a, 0.25);
    vec4 s = texture2D(tSrc, uv + vec2(cos(th), sin(th)) * dist * px);
    // A point reaches this pixel only if it is itself that far out of focus.
    float w = clamp(s.a * REACH - dist + 1.0, 0.0, 1.0);
    sum += s.rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, c.a);
}
`

const FINISH_FRAG = /* glsl */ `
${DEPTH_GLSL}
${COC_GLSL}
uniform sampler2D tScene;
uniform sampler2D tAO;
uniform sampler2D tBloom;
uniform sampler2D tFocus;
uniform vec2 uRes;
uniform vec4 uUse;       // contact shade, focus, bloom, vignette
uniform float uExposure;
vec3 film(vec3 c) {
  // Straight up to the middle tones, so a lit colour is the colour it was painted; a soft shoulder above.
  float m = max(c.r, max(c.g, c.b));
  float t = m <= 0.58 ? m : 0.58 + 0.42 * (1.0 - exp(-(m - 0.58) / 0.42));
  vec3 r = c * (t / max(m, 1e-5));
  return mix(r, vec3(t), 0.6 * smoothstep(1.6, 14.0, m));
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = texture2D(tScene, uv).rgb;
  float z = -viewPos(uv).z;
  if (uUse.y > 0.5) {
    vec4 soft = texture2D(tFocus, uv);
    col = mix(col, soft.rgb, smoothstep(0.02, 0.4, max(cocAt(z), soft.a * 0.6)));
  }
  if (uUse.x > 0.5) {
    float ao = texture2D(tAO, uv).r;
    col *= mix(vec3(1.0), vec3(ao) + (1.0 - ao) * vec3(0.045, 0.05, 0.07), 0.92);
  }
  col *= uExposure;
  col += texture2D(tBloom, uv).rgb * uUse.z;
  vec2 q = (uv - 0.5) * vec2(1.0, uRes.y / uRes.x) * 1.25;
  col *= 1.0 - uUse.w * smoothstep(0.25, 1.0, length(q) * 1.45);
  col = film(col);
  col = mix(12.92 * col, 1.055 * pow(max(col, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  gl_FragColor = vec4(col, 1.0);
}
`

const OUT_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uRes;       // the picture's own size
uniform vec2 uOut;       // the screen's
uniform vec2 uGrain;     // amount, time
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = gl_FragCoord.xy / uOut, px = 1.0 / uRes;
  vec3 m = texture2D(tSrc, uv).rgb;
  float lNW = lum(texture2D(tSrc, uv + px * vec2(-1.0, -1.0)).rgb), lNE = lum(texture2D(tSrc, uv + px * vec2(1.0, -1.0)).rgb);
  float lSW = lum(texture2D(tSrc, uv + px * vec2(-1.0, 1.0)).rgb), lSE = lum(texture2D(tSrc, uv + px * vec2(1.0, 1.0)).rgb), lM = lum(m);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), vec2(-8.0), vec2(8.0)) * px;
  vec3 a = 0.5 * (texture2D(tSrc, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tSrc, uv - dir * 0.5).rgb + texture2D(tSrc, uv + dir * 0.5).rgb);
  float lB = lum(b);
  vec3 col = (lB < lMin || lB > lMax) ? a : b;
  float g = hash(gl_FragCoord.xy + fract(uGrain.y) * 91.7) - 0.5;
  col += g * uGrain.x * (1.0 - 0.6 * lum(col));
  gl_FragColor = vec4(col, 1.0);
}
`

export class Post {
  private renderer: WebGLRenderer
  private tri = new BufferGeometry()
  private quad: Mesh
  private scene2 = new Scene()
  private cam2 = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private sceneRT!: WebGLRenderTarget
  private half: WebGLRenderTarget[] = []      // ao, ao blur, focus source, focus
  private bloom: WebGLRenderTarget[] = []
  private glow: WebGLRenderTarget[] = []
  private ldr!: WebGLRenderTarget
  private mats: Record<string, ShaderMaterial> = {}
  private invProj = new Matrix4()
  private opts: PostOptions = { msaa: 4, ao: true, focus: true, bloom: true }
  private w = 0
  private h = 0
  private key = ''
  private float: boolean
  private white: Texture | null = null

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.float = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float')
    this.tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const make = (name: string, frag: string, uniforms: Record<string, { value: unknown }>) => {
      this.mats[name] = new ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false })
    }
    const res = () => ({ value: new Vector2(1, 1) })
    const depth = () => ({ tDepth: { value: null }, uInvProj: { value: this.invProj } })
    const lens = { value: new Vector2(50, 0) }
    make('ao', AO_FRAG, { ...depth(), uRes: res(), uProjScale: { value: 500 } })
    make('aoBlur', AO_BLUR_FRAG, { ...depth(), tAO: { value: null }, uRes: res(), uDir: { value: new Vector2(1, 0) } })
    make('bright', BRIGHT_FRAG, { tScene: { value: null }, uRes: res(), uExposure: { value: 1 } })
    make('down', DOWN_FRAG, { tSrc: { value: null }, uRes: res() })
    make('up', UP_FRAG, { tSrc: { value: null }, tAdd: { value: null }, uRes: res() })
    make('focusPre', FOCUS_PRE_FRAG, { ...depth(), tScene: { value: null }, uRes: res(), uLens: lens })
    make('focus', FOCUS_FRAG, { tSrc: { value: null }, uRes: res() })
    make('finish', FINISH_FRAG, {
      ...depth(), tScene: { value: null }, tAO: { value: null }, tBloom: { value: null }, tFocus: { value: null }, uRes: res(),
      uUse: { value: new Vector4(1, 1, 1, 0.16) }, uExposure: { value: 1 }, uLens: lens,
    })
    make('out', OUT_FRAG, { tSrc: { value: null }, uRes: res(), uOut: res(), uGrain: { value: new Vector2(0.02, 0) } })
    this.quad = new Mesh(this.tri, this.mats.out)
    this.quad.frustumCulled = false
    this.scene2.add(this.quad)
  }

  // w and h are the size the scene is drawn at, in device pixels.
  setSize(w: number, h: number, opts: PostOptions): void {
    const key = `${w}|${h}|${opts.msaa}|${opts.ao}|${opts.focus}|${opts.bloom}`
    if (key === this.key) return
    this.key = key
    this.opts = { ...opts }
    this.w = w
    this.h = h
    this.free()
    const type = this.float ? HalfFloatType : UnsignedByteType
    const depthTexture = new DepthTexture(w, h, UnsignedIntType)
    depthTexture.minFilter = depthTexture.magFilter = NearestFilter
    this.sceneRT = new WebGLRenderTarget(w, h, { type, format: RGBAFormat, samples: opts.msaa, depthTexture, minFilter: LinearFilter, magFilter: LinearFilter })
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1)
    const rt = (tw: number, th: number, t = type) => new WebGLRenderTarget(tw, th, { type: t, format: RGBAFormat, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter })
    this.half = [rt(hw, hh, UnsignedByteType), rt(hw, hh, UnsignedByteType), rt(hw, hh), rt(hw, hh)]
    let bw = hw, bh = hh
    for (let k = 0; k < 5 && bw > 8 && bh > 8; k++) {
      this.bloom.push(rt(bw, bh))
      this.glow.push(rt(bw, bh))
      bw = Math.max(2, bw >> 1)
      bh = Math.max(2, bh >> 1)
    }
    this.ldr = rt(w, h, UnsignedByteType)
  }

  private free(): void {
    for (const t of [this.sceneRT, this.ldr, ...this.half, ...this.bloom, ...this.glow]) if (t) { t.depthTexture?.dispose(); t.dispose() }
    this.half = []
    this.bloom = []
    this.glow = []
  }

  private pass(name: string, target: WebGLRenderTarget | null, set: Record<string, unknown>): void {
    const m = this.mats[name]
    for (const k of Object.keys(set)) m.uniforms[k].value = set[k]
    if (m.uniforms.uRes) (m.uniforms.uRes.value as Vector2).set(target ? target.width : this.w, target ? target.height : this.h)
    this.quad.material = m
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene2, this.cam2)
  }

  // The target the scene itself is drawn into; shaders are compiled against it.
  get target(): WebGLRenderTarget {
    return this.sceneRT
  }

  render(scene: Scene, camera: PerspectiveCamera, shot: Shot, outW: number, outH: number): void {
    const r = this.renderer, o = this.opts
    r.setRenderTarget(this.sceneRT)
    r.render(scene, camera)
    this.invProj.copy(camera.projectionMatrixInverse)
    const color = this.sceneRT.texture, depth = this.sceneRT.depthTexture
    const [ao, aoBlur, focusSrc, focus] = this.half
    if (o.ao) {
      const projScale = (ao.height / 2) / Math.tan((camera.fov * Math.PI) / 360)
      this.pass('ao', ao, { tDepth: depth, uProjScale: projScale })
      this.pass('aoBlur', aoBlur, { tDepth: depth, tAO: ao.texture, uDir: this.dirX })
      this.pass('aoBlur', ao, { tDepth: depth, tAO: aoBlur.texture, uDir: this.dirY })
    }
    const lensOn = o.focus && shot.aperture > 0.01
    ;(this.mats.finish.uniforms.uLens.value as Vector2).set(shot.focus, shot.aperture)
    if (lensOn) {
      this.pass('focusPre', focusSrc, { tDepth: depth, tScene: color })
      this.pass('focus', focus, { tSrc: focusSrc.texture })
    }
    if (o.bloom && this.bloom.length) {
      this.pass('bright', this.bloom[0], { tScene: color, uExposure: shot.exposure })
      for (let k = 1; k < this.bloom.length; k++) this.pass('down', this.bloom[k], { tSrc: this.bloom[k - 1].texture })
      const last = this.bloom.length - 1
      let src = this.bloom[last].texture
      for (let k = last - 1; k >= 0; k--) {
        this.pass('up', this.glow[k], { tSrc: src, tAdd: this.bloom[k].texture })
        src = this.glow[k].texture
      }
    }
    const use = this.mats.finish.uniforms.uUse.value as Vector4
    use.set(o.ao ? 1 : 0, lensOn ? 1 : 0, o.bloom && this.bloom.length ? 0.22 : 0, 0.2)
    this.pass('finish', this.ldr, { tDepth: depth, tScene: color, tAO: ao.texture, tBloom: this.glow.length ? this.glow[0].texture : color, tFocus: focus.texture, uExposure: shot.exposure })
    ;(this.mats.out.uniforms.uOut.value as Vector2).set(outW, outH)
    ;(this.mats.out.uniforms.uGrain.value as Vector2).set(shot.grain, shot.time)
    const m = this.mats.out
    m.uniforms.tSrc.value = this.ldr.texture
    ;(m.uniforms.uRes.value as Vector2).set(this.ldr.width, this.ldr.height)
    this.quad.material = m
    r.setRenderTarget(null)
    r.render(this.scene2, this.cam2)
  }

  private dirX = new Vector2(1, 0)
  private dirY = new Vector2(0, 1)

  dispose(): void {
    this.free()
    this.tri.dispose()
    for (const m of Object.values(this.mats)) m.dispose()
    this.white?.dispose()
  }
}
