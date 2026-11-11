// The fields: soil whose rows ridge as they are hilled, each simulated hill drawn as a patch of plants made of leaves,
// their blossom, the rest-year oats over clover, and the marks that show what the player has selected. Land the farm
// does not hold is somebody else's hay, pasture or stubble, staked out in spring when it can be had.
// What is drawn follows what the camera can resolve: whole plants near, a cheaper clump of leaves further off, and far
// away (or out of sight) the crop painted into the ground in rows, with no plants and no shadow at all.
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, Frustum, Group, InstancedBufferAttribute, InstancedBufferGeometry,
  InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, NearestFilter, Quaternion, RGBAFormat, ShaderMaterial, Sphere, Vector2, Vector3,
  Vector4, type PerspectiveCamera, type Texture,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COLS, FIELD_COUNT, HILLS, ROWS, type HillLook } from '../sim/index.ts'
import { blossomGeometry, clumpGeometry, oatGeometry, plantGeometry } from './geometry.ts'
import { FD, FIELDS, FW, PLANT, PLANTED_ROWS, PLANTS_PER_ROW, ROW, fieldBaseY, groundY, profile } from './layout.ts'
import { hash2 } from './noise.ts'
import { SNOW_RIME, depthFor, linear, patch, snowRimeAt, sway, type Patch } from './shaders.ts'
import type { FieldVis } from './state.ts'

export const RIDGE_AMP = 0.17
const N = FIELD_COUNT * HILLS
const G = 8                    // numbers kept per hill: grow, yellow, blight, dead, dug, pulled, ridge, stunt
const PLANTS = PLANTED_ROWS * PLANTS_PER_ROW
const SLOPE = (profile(-8) - profile(5)) / 13

const SOIL: Record<string, string> = {
  'standing water': '#4c3024', wet: '#59382a', good: '#774a37', drying: '#84543d', dry: '#925d44', wilting: '#9d6b54',
}
const DAMP: Record<string, number> = { 'standing water': 1, wet: 0.85, good: 0.3, drying: 0.12, dry: 0, wilting: 0 }

// How much lilac is in the flower, by variety.
const BLOOM_TINT: Record<string, number> = { norland: 0.9, superior: 0.2, katahdin: 0.35, kennebec: 0.08, burbank: 0.12, atlantic: 0.55, gold: 0.8, caribou: 0.3 }

// What somebody else's ground is in, by parcel: 0 hay, 1 pasture, 2 last year's stubble.
const OFF_KIND = [0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 2, 2, 0, 1]

// Where each level of detail takes over, by quality tier: whole plants out to `near`, clumps out to `far`.
export const LOD = { high: { near: 36, far: 160 }, medium: { near: 26, far: 118 }, low: { near: 17, far: 82 } }

export interface HillDisplay { look: HillLook; ridge: number }

// The smallest a blossom or a tuber may be drawn, as world size per unit of distance: about a pixel.
export const PIXEL = { value: 0.0006 }
// What the marks on the ground are multiplied by so they hold their brightness under any exposure.
export const UI_GAIN = { value: 1 }
// How much wider than their own width the marks on the ground are drawn, so they still show from the strategic view.
export const MARK_WIDE = { value: 1 }

const PLANT_FN = /* glsl */ `
attribute vec4 aAt;
uniform sampler2D uT0;
uniform sampler2D uT1;
uniform vec4 uRect;
uniform vec4 uCrop;        // wilt, share of leaf blackened by frost, rime this morning, bloom
uniform float uDense;
uniform vec2 uKeep;        // the plants drawn by this mesh: those whose own number falls in [x, y)
struct Plant { vec3 at; float w; float h; float cs; float sn; float droop; float dead; float frost; vec4 h0; vec4 h1; vec3 r; };
Plant gp;
Plant plantAt() {
  Plant p;
  vec2 huv = (aAt.xz - uRect.xy) * uRect.zw;
  p.h0 = texture2D(uT0, huv);
  p.h1 = texture2D(uT1, huv);
  p.r = fract(aAt.w * vec3(61.7, 127.3, 331.9));
  float own = fract(aAt.w * 173.31);
  p.dead = p.h0.a;
  p.frost = clamp(uCrop.y * (0.7 + 0.6 * p.r.y), 0.0, 1.0) * (1.0 - p.dead);
  p.droop = clamp(max(uCrop.x * 0.9, p.frost * 0.85), 0.0, 1.0) * (1.0 - p.dead);
  float size = (0.22 + 0.78 * pow(p.h0.r, 0.75)) * mix(1.0, 0.6, p.h1.a) * (0.84 + 0.32 * p.r.x) * step(0.004, p.h0.r) * uDense
    * step(uKeep.x, own) * step(own, uKeep.y - 1e-4);
  p.w = size * 0.8 * (1.0 + 0.1 * p.droop);
  p.h = size * 0.56 * mix(1.0, 0.36, p.dead);
  float a = aAt.w * 6.2831853;
  p.cs = cos(a);
  p.sn = sin(a);
  vec2 jit = (p.r.yz - 0.5) * vec2(${(PLANT * 0.4).toFixed(3)}, ${(ROW * 0.16).toFixed(3)});
  p.at = vec3(aAt.x + jit.x, aAt.y + ${RIDGE_AMP.toFixed(3)} * p.h1.b * (1.0 - p.h1.r) - 0.012, aAt.z + jit.y);
  return p;
}
vec3 plantPlace(vec3 pl) {
  // Wider along the row than across it: the rows close first, the furrows between them last.
  return gp.at + vec3((gp.cs * pl.x + gp.sn * pl.z) * gp.w * 1.35, pl.y * gp.h, (-gp.sn * pl.x + gp.cs * pl.z) * gp.w);
}
`

const LEAF_SHAPE = /* glsl */ `
  vec3 pl = position;
  pl.y -= aLeaf.y * aLeaf.y * 0.42 * gp.droop * aLeaf.z;
  pl.xz *= 1.0 + 0.18 * gp.droop * aLeaf.y * aLeaf.z;
  pl.y = max(pl.y, 0.02);
  transformed = plantPlace(pl);
`

// The leaf's colour from its hill's state, shared by the plants and by the crop painted into the ground far off.
const LEAF_TINT = /* glsl */ `
vec3 leafTint(float grow, float yellow, float stunt, float wilt) {
  vec3 col = mix(${linear('#a2d85c')}, ${linear('#52a84e')}, smoothstep(0.08, 0.7, grow));
  col = mix(col, ${linear('#9aa24c')}, min(1.0, yellow * 1.6));
  col = mix(col, ${linear('#b09a55')}, clamp((yellow - 0.55) * 1.8, 0.0, 1.0));
  col = mix(col, ${linear('#b4c67a')}, 0.6 * stunt);
  return mix(col, ${linear('#7f8560')}, min(1.0, wilt * 1.1));
}
`

const LEAF_COLOUR = /* glsl */ `
  {
    float grow = gp.h0.r, yellow = gp.h0.g;
    vec3 col = leafTint(grow, yellow, gp.h1.a, uCrop.x);
    float bl = clamp(gp.h0.b * 2.4, 0.0, 1.0);
    float hit = smoothstep(0.0, 0.25, bl * 1.3 - fract(aLeaf.x * 7.3 + gp.r.x));
    col = mix(col, mix(${linear('#4b3324')}, ${linear('#241a14')}, fract(aLeaf.x * 3.1 + gp.r.z)), hit);
    float burnt = smoothstep(0.0, 0.2, gp.frost * 1.25 - fract(aLeaf.x * 5.7 + gp.r.y));
    // On the morning of the frost the leaf is white with rime; it is black by the next day.
    col = mix(col, ${linear('#2b2a26')}, burnt * (1.0 - 0.75 * uCrop.z));
    col = mix(col, ${linear('#a8bcc0')}, 0.55 * uCrop.z * smoothstep(0.2, 0.9, aLeaf.y));
    col = mix(col, ${linear('#b5a27a')} * (0.8 + 0.4 * gp.r.z), gp.dead);
    col = mix(${linear('#8a9a62')}, col, aLeaf.z);
    // Deep in the canopy little light arrives; and no two leaves are quite one green.
    col *= mix(0.46, 1.0, smoothstep(0.02, 0.44, position.y)) * (0.9 + 0.2 * gp.r.z) * (0.84 + 0.32 * fract(aLeaf.x * 0.618 + gp.r.x * 5.0));
    vTint = col;
    vErode = max(max(gp.dead * 0.32, hit * 0.55), burnt * 0.45 * (1.0 - uCrop.z)) * aLeaf.z;
    // Seen from far off a plant keeps as many of its leaves as it has canopy, so a half-grown field shows its soil.
    vKeep = step(fract(sin(aLeaf.x * 91.7 + gp.r.y * 47.3) * 43758.5), max(0.3 + 0.7 * smoothstep(0.35, 0.9, grow), gp.dead));
  }
`

const ROW_FN = /* glsl */ `
attribute vec2 aF;
uniform sampler2D uT1;
varying vec2 vF;
varying float vProf;
varying float vRidged;
varying float vDrill;
varying vec4 vHill;
// A row in cross-section, 1 on the crest and 0 in the furrow, and its slope across the row.
// Rounded while the rows are low; hilled twice, steep sides meeting in a narrow V.
vec2 rowProfile(float fr, float sharp) {
  float q = abs(fr) * 2.0;
  float soft = 0.5 + 0.5 * cos(q * 3.14159265);
  float dSoft = -1.5707963 * sin(q * 3.14159265);
  float hard = 1.0 - q * q;
  float dHard = -2.0 * q;
  return vec2(mix(soft, hard, sharp), mix(dSoft, dHard, sharp) * 2.0 * sign(fr));
}
// Height above the smooth ground, the slope across the rows, and where on the row's profile this point is.
vec3 soilShape(vec2 f, vec2 xz, out vec4 hill) {
  hill = texture2D(uT1, f);
  float fr = fract(f.y * ${PLANTED_ROWS}.0) - 0.5;
  float taper = smoothstep(0.0, 0.035, f.x) * smoothstep(1.0, 0.965, f.x) * smoothstep(0.0, 0.02, f.y) * smoothstep(1.0, 0.98, f.y);
  vec2 prof = rowProfile(fr, smoothstep(0.55, 1.0, hill.b));
  float amp = ${RIDGE_AMP.toFixed(3)} * hill.b * taper * (1.0 - 0.75 * smoothstep(0.3, 1.0, uSnow));
  float lumps = (textureLod(uNoise, xz * 0.37, 0.0).a - 0.5) * 0.1;
  float h = mix(amp * prof.x, amp * 0.2 + 0.025 + lumps * taper, hill.r);
  // The tilled ground runs under the turf at its edge, so a field has no rim.
  float rim = min(min(f.x, 1.0 - f.x) * ${FW.toFixed(2)}, min(f.y, 1.0 - f.y) * ${FD.toFixed(2)});
  h += 0.015 - 0.1 * (1.0 - smoothstep(0.0, 0.3, rim));
  return vec3(h, amp * (1.0 - hill.r) * prof.y / ${ROW.toFixed(3)}, mix(prof.x, 0.5, hill.r));
}
`

// Somebody else's ground: hay, pasture or last year's stubble, through the year. Moves with the wind where it stands tall.
const OFF_GLSL = /* glsl */ `
vec3 offCover(vec2 p, vec2 f, float kind, float broad, float fine, float grit, out float tall) {
  float d = uDay;
  float green = smoothstep(118.0, 150.0, d) * (1.0 - 0.55 * smoothstep(262.0, 300.0, d));
  vec3 live = uGrass * (0.78 + 0.44 * broad) * (0.86 + 0.28 * fine);
  vec3 dead = ${linear('#9c8a5e')} * (0.8 + 0.4 * broad) * (0.88 + 0.24 * fine);
  vec3 col;
  float gust = gustAt(p) * min(uSway, 1.2);
  tall = 0.0;
  if (kind < 0.5) {
    // Hay: tall and streaked with the lie of the grass, seed heads buff in July, cut into windrows in early August.
    float mown = step(0.5, fract(f.x * 3.7 + f.y * 1.3)) * smoothstep(212.0, 216.0, d) * (1.0 - smoothstep(236.0, 252.0, d));
    float streak = texture2D(uNoise, vec2(p.x * 0.09 + p.y * 0.02, p.y * 0.6)).a;
    col = mix(dead, live * vec3(1.06, 1.0, 0.76), green) * (0.9 + 0.2 * streak);
    col = mix(col, ${linear('#b7a378')} * (0.85 + 0.3 * fine), 0.42 * smoothstep(168.0, 192.0, d) * (1.0 - mown) * green);
    float row = 0.5 + 0.5 * cos(p.y * 6.2831853 / 2.1 + broad * 2.0);
    col = mix(col, mix(${linear('#a8a561')}, ${linear('#6f7a3a')}, smoothstep(0.55, 0.9, row)) * (0.85 + 0.3 * fine), mown);
    tall = green * (1.0 - mown) * smoothstep(140.0, 175.0, d);
    // the wave of a gust shows pale where it lays the grass over
    col *= 1.0 + 0.32 * gust * tall;
  } else if (kind < 1.5) {
    // Pasture: short and darker, clumps of rush and thistle, a path worn where the cattle walk.
    col = mix(dead * 0.92, live * vec3(0.88, 1.0, 0.86), green) * (0.84 + 0.32 * grit);
    float rush = smoothstep(0.72, 0.8, texture2D(uNoise, p * 0.31).b);
    col = mix(col, live * vec3(0.52, 0.66, 0.42), rush * 0.7);
    float path = 1.0 - smoothstep(0.0, 0.18, abs(fract(p.x * 0.07 + 0.35 * sin(p.y * 0.21 + broad * 3.0)) - 0.5) - 0.02);
    col = mix(col, ${linear('#7f6a4f')} * (0.8 + 0.4 * fine), path * 0.45);
    tall = 0.25 * green;
    col *= 1.0 + 0.12 * gust * green;
  } else {
    // Stubble: last year's grain cut short in pale rows, the ground showing, weeds coming through by midsummer.
    float rows = 0.5 + 0.5 * cos(p.y * 6.2831853 / 0.19);
    float aa = smoothstep(0.3, 0.8, fwidth(p.y) / 0.19);
    vec3 straw = ${linear('#c2ad7c')} * (0.82 + 0.3 * fine);
    vec3 ground = ${linear('#6e4a36')} * (0.8 + 0.4 * broad);
    col = mix(ground, straw, mix(smoothstep(0.35, 0.8, rows), 0.55, aa));
    float weeds = smoothstep(0.3, 0.85, broad * 0.5 + fine * 0.5 + 0.3 * smoothstep(150.0, 200.0, d) - 0.25) * green;
    col = mix(col, live * vec3(0.95, 1.05, 0.82), weeds * 0.85);
    tall = 0.4 * weeds;
    col *= 1.0 + 0.16 * gust * weeds;
  }
  return col;
}
`

// The crop as seen from too far for plants: rows of canopy painted on the ground, with the furrows between them dark.
const PAINT_GLSL = /* glsl */ `
vec4 paintCrop(vec2 f, vec4 h0, vec4 h1, float fine, out float lift) {
  float grow = h0.r;
  lift = 0.0;
  if (grow < 0.004) return vec4(0.0);
  float fr = abs(fract(f.y * ${PLANTED_ROWS}.0) - 0.5) * 2.0;
  float along = fract(f.x * ${PLANTS_PER_ROW}.0 + 0.5 * floor(f.y * ${PLANTED_ROWS}.0));
  float closed = smoothstep(0.35, 0.95, grow);
  float wide = mix(0.3 + 0.5 * pow(grow, 0.75), 1.15, closed) * (1.0 - 0.3 * h1.a);
  // Rows finer than a pixel are drawn as what they average to, or they would shimmer.
  float rowsPx = fwidth(f.y * ${PLANTED_ROWS}.0);
  float blur = smoothstep(0.22, 0.75, rowsPx);
  float e = rowsPx * 2.0 + 0.04;
  float sharp = 1.0 - smoothstep(wide - e, wide + e, fr + 0.18 * (1.0 - closed) * abs(along - 0.5));
  float cover = mix(sharp, clamp(wide, 0.0, 1.0), blur);
  vec3 col = leafTint(grow, h0.g, h1.a, uCrop.x);
  float bl = clamp(h0.b * 2.4, 0.0, 1.0);
  col = mix(col, mix(${linear('#4b3324')}, ${linear('#241a14')}, fine), smoothstep(0.0, 0.25, bl * 1.3 - fine));
  col = mix(col, ${linear('#2b2a26')}, clamp(uCrop.y * 1.1, 0.0, 1.0) * (1.0 - 0.75 * uCrop.z));
  col = mix(col, ${linear('#a8bcc0')}, 0.45 * uCrop.z);
  col = mix(col, ${linear('#b5a27a')}, h0.a);
  // a rounded row: lit along its crown, dark down its sides into the furrow
  col *= mix(mix(0.5, 1.05, smoothstep(1.0, 0.1, fr)), 0.82, blur) * (0.86 + 0.28 * fine);
  // blossom, as white flecks over the leaf
  float open = uCrop.w * smoothstep(0.3, 0.55, grow) * (1.0 - h0.g) * (1.0 - bl) * (1.0 - h0.a) * (1.0 - min(1.0, uCrop.y * 1.5));
  float fleck = step(1.0 - 0.42 * open, fract(sin(dot(floor(f * vec2(${PLANTS_PER_ROW}.0 * 2.0, ${PLANTED_ROWS}.0 * 2.0)), vec2(12.9898, 78.233))) * 43758.5453));
  fleck = mix(fleck, 0.42 * open, smoothstep(0.4, 1.2, fwidth(f.x * ${PLANTS_PER_ROW}.0 * 2.0)));
  col = mix(col, mix(${linear('#f8f5fa')}, ${linear('#d3c2e6')}, uTint) * 1.3, fleck * cover);
  lift = cover;
  return vec4(col, cover);
}
`

interface Mark { mesh: Mesh; un: { uLevel: { value: number }; uGrow: { value: number }; uGain: { value: number }; uDash: { value: number }; uWide: { value: number } } }

interface FieldGfx {
  d0: Uint8Array
  d1: Uint8Array
  t0: DataTexture
  t1: DataTexture
  crop: Vector4
  soilColor: Color
  water: { value: number }
  damp: { value: number }
  cover: { value: number }
  tint: { value: number }
  oats: { value: Vector3 }
  dense: { value: number }
  denseMid: { value: number }
  keepNear: { value: Vector2 }
  keepMid: { value: Vector2 }
  bloomShare: { value: number }
  off: { value: number }
  avail: { value: number }
  paint: { value: number }
  rimeHere: { value: number }
  bounds: Sphere
  soil: Mesh
  plants: Mesh
  clumps: Mesh
  blossoms: Mesh
  oatMesh: Mesh | null
  ring: Mark
  pulse: Mark
  stake: Mark
  pulseT: number
  selT: number
  lod: number
  any: boolean
}

export class Fields {
  readonly group = new Group()
  private gfx: FieldGfx[] = []
  private cur = new Float32Array(N * G)
  private tgt = new Float32Array(N * G)
  private soilTarget: Color[] = []
  private waterTarget = new Float32Array(FIELD_COUNT)
  private dampTarget = new Float32Array(FIELD_COUNT)
  private coverTarget = new Float32Array(FIELD_COUNT)
  private offTarget = new Float32Array(FIELD_COUNT)
  private rimeTarget = new Float32Array(FIELD_COUNT)
  private cropTarget: Vector4[] = []
  private rest: boolean[] = new Array(FIELD_COUNT).fill(false)
  private availNow: boolean[] = new Array(FIELD_COUNT).fill(false)
  private settled = false
  private disposables: { dispose(): void }[] = []
  private plantGeo: BufferGeometry
  private clumpGeo: BufferGeometry
  private bloomGeo: BufferGeometry
  private oatGeo: BufferGeometry
  private leafTex: Texture
  private flowerTex: Texture
  private density = 1
  private lodAt = LOD.high
  private stakes: InstancedMesh
  private stakeWide = 1
  private frustum = new Frustum()
  private pm = new Matrix4()
  private near = new Vector3()
  // Plants throw shadows into the second cascade only while the first does not already hold them.
  farShadows = true
  // Whether each parcel is the farm's, as drawn now (eased), for the land round it.
  readonly held: number[] = new Array(FIELD_COUNT).fill(1)

  constructor(leafTex: Texture, flowerTex: Texture) {
    this.leafTex = leafTex
    this.flowerTex = flowerTex
    this.plantGeo = plantGeometry()
    this.clumpGeo = clumpGeometry()
    this.bloomGeo = blossomGeometry()
    this.oatGeo = oatGeometry()
    this.disposables.push(this.plantGeo, this.clumpGeo, this.bloomGeo, this.oatGeo)
    for (let i = 0; i < FIELD_COUNT; i++) this.build(i)
    this.stakes = this.buildStakes()
  }

  private build(i: number): void {
    const f = FIELDS[i]
    const d0 = new Uint8Array(HILLS * 4), d1 = new Uint8Array(HILLS * 4)
    const tex = (d: Uint8Array) => {
      const t = new DataTexture(d, COLS, ROWS, RGBAFormat)
      t.magFilter = t.minFilter = NearestFilter
      t.needsUpdate = true
      this.disposables.push(t)
      return t
    }
    const t0 = tex(d0), t1 = tex(d1)
    const crop = new Vector4(), soilColor = new Color(SOIL.good)
    const water = { value: 0 }, damp = { value: 0.3 }, cover = { value: 0 }, tint = { value: 0.2 }, dense = { value: 1 }, denseMid = { value: 1.36 }
    const keepNear = { value: new Vector2(0, 1.01) }, keepMid = { value: new Vector2(0, 0) }, bloomShare = { value: 1 }
    const off = { value: 0 }, paint = { value: 0 }, rimeHere = { value: 0 }, avail = { value: 0 }
    const oats = { value: new Vector3(0, 0, 0) }
    const rect = { value: new Vector4(f.x0, f.z0, 1 / FW, 1 / FD) }
    const shared = { uT0: { value: t0 }, uT1: { value: t1 }, uRect: rect, uCrop: { value: crop }, uDense: dense, uKeep: keepNear }
    const bounds = new Sphere(new Vector3(f.cx, fieldBaseY(f.cz) + 0.3, f.cz), Math.hypot(FW, FD) / 2 + 1)

    // ---- soil
    const nx = 48, nz = PLANTED_ROWS * 8
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), fuv = new Float32Array((nx + 1) * (nz + 1) * 2)
    for (let j = 0; j <= nz; j++) {
      for (let k = 0; k <= nx; k++) {
        const u = k / nx, v = j / nz, o = j * (nx + 1) + k
        const z = f.z0 + v * FD
        pos.set([f.x0 + u * FW, fieldBaseY(z), z], o * 3)
        fuv.set([u, v], o * 2)
      }
    }
    const idx = new Uint32Array(nx * nz * 6)
    let n = 0
    for (let j = 0; j < nz; j++) {
      for (let k = 0; k < nx; k++) {
        const a = j * (nx + 1) + k, b = a + 1, c = a + nx + 1, d = c + 1
        idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d
      }
    }
    const soilGeo = new BufferGeometry()
    soilGeo.setAttribute('position', new BufferAttribute(pos, 3))
    soilGeo.setAttribute('aF', new BufferAttribute(fuv, 2))
    soilGeo.setIndex(new BufferAttribute(idx, 1))
    soilGeo.computeVertexNormals()
    soilGeo.boundingSphere = bounds
    const soilShape: Patch = {
      key: 'county-soil',
      uniforms: {
        uT0: { value: t0 }, uT1: { value: t1 }, uSoil: { value: soilColor }, uWater: water, uDamp: damp, uCover: cover, uOff: off,
        uOffKind: { value: OFF_KIND[i] ?? 0 }, uPaint: paint, uCrop: { value: crop }, uTint: tint, uOatsHere: oats, uRimeHere: rimeHere, uAvail: avail,
      },
      vertexHead: `${ROW_FN}\nuniform float uOff;\nuniform float uPaint;`,
      vertexNormal: `vec4 hillN; vec3 shN = soilShape(aF, position.xz, hillN); shN.y *= (1.0 - uOff) * (1.0 - uPaint); objectNormal = normalize(vec3(0.0, 1.0, ${SLOPE.toFixed(4)} - shN.y));`,
      vertexBegin: /* glsl */ `
        vec4 hillB;
        vec3 shB = soilShape(aF, position.xz, hillB);
        transformed.y += mix(shB.x, 0.015 - 0.1 * (1.0 - smoothstep(0.0, 0.3, min(min(aF.x, 1.0 - aF.x) * ${FW.toFixed(2)}, min(aF.y, 1.0 - aF.y) * ${FD.toFixed(2)}))), uOff);
        vF = aF;
        vProf = shB.z;
        vRidged = smoothstep(0.08, 0.55, hillB.b) * (1.0 - hillB.r) * (1.0 - uOff);
        vDrill = step(0.02, hillB.b) * (1.0 - hillB.r) * (1.0 - smoothstep(0.08, 0.4, hillB.b)) * (1.0 - uOff);
        vHill = hillB;
      `,
    }
    const soilMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }), {
      ...soilShape,
      fragmentHead: /* glsl */ `
        uniform sampler2D uT0;
        uniform sampler2D uT1;
        uniform vec3 uSoil;
        uniform float uWater;
        uniform float uDamp;
        uniform float uCover;
        uniform float uOff;
        uniform float uOffKind;
        uniform float uPaint;
        uniform vec4 uCrop;
        uniform float uTint;
        uniform vec3 uOatsHere;
        uniform float uRimeHere;
        uniform float uAvail;
        varying vec2 vF;
        varying float vProf;
        varying float vRidged;
        varying float vDrill;
        varying vec4 vHill;
        float poolF;
        float poolOpen;
        float soilRough;
        vec2 soilBump;
        ${LEAF_TINT}
        ${OFF_GLSL}
        ${PAINT_GLSL}
      `,
      fragmentColor: /* glsl */ `
        {
          vec2 cell = vF * vec2(${COLS}.0, ${ROWS}.0);
          vec4 hc = texture2D(uT1, (floor(cell) + 0.5) / vec2(${COLS}.0, ${ROWS}.0));
          vec4 n1 = texture2D(uNoise, vWorld.xz * 0.05), n2 = texture2D(uNoise, vWorld.xz * 0.47), n3 = texture2D(uNoise, vWorld.xz * 1.9);
          float broad = n1.b, fine = n2.a, grit = n3.a;
          vec3 soil = uSoil * (0.8 + 0.4 * broad) * (0.84 + 0.32 * fine) * (0.92 + 0.16 * grit);
          // Crests dry pale; furrows hold the damp. Where seed was dropped the drill line is fresh dark earth.
          soil *= mix(1.0, mix(0.74, 1.14, vProf), vRidged);
          soil *= 1.0 - 0.24 * vDrill * smoothstep(0.8, 0.97, vProf);
          vec3 turned = uSoil * mix(0.46, 0.9, smoothstep(0.3, 0.75, fine)) * (0.88 + 0.24 * grit);
          soil = mix(soil, turned, vHill.r);
          float hole = hc.g * (1.0 - smoothstep(0.22, 0.44, length(fract(cell) - 0.5)));
          soil = mix(soil, soil * 0.4, hole);
          // Under a closed canopy the ground gets what light the leaves let through.
          vec4 over = texture2D(uT0, vF);
          float shaded = smoothstep(0.4, 0.95, over.r) * (1.0 - over.a) * (1.0 - vHill.r);
          soil *= mix(vec3(1.0), vec3(0.34, 0.5, 0.3), shaded * (1.0 - uPaint));
          poolOpen = 1.0 - 0.35 * shaded;
          float cov = uCover * smoothstep(0.2, 0.5, broad * 0.6 + 0.42 * uCover + 0.2 * fine);
          vec3 clover = uGrass * vec3(0.6, 0.98, 0.58) * (0.66 + 0.68 * fine);
          clover = mix(clover, vec3(0.74, 0.62, 0.7), step(0.8, grit) * step(0.55, fine) * 0.55 * uLeaf);
          soil = mix(soil, clover, cov);
          poolF = uWater * mix(1.0, 1.0 - smoothstep(0.12, 0.5, vProf), vRidged) * smoothstep(0.34, 0.5, broad * 0.6 + 0.4 * texture2D(uNoise, vWorld.xz * 0.017).b);
          soilRough = mix(mix(0.96, 0.66, uDamp), 0.04, poolF);
          // Far off, the crop and the rest-year oats are painted where plants would stand.
          if (uPaint > 0.001) {
            float lift;
            vec4 crop = paintCrop(vF, over, vHill, fine, lift);
            soil = mix(soil, crop.rgb, crop.a * uPaint);
            vec3 oat = mix(${linear('#7fa46a')}, ${linear('#cfb56b')}, uOatsHere.y) * (0.78 + 0.4 * fine);
            soil = mix(soil, oat, uOatsHere.x * smoothstep(0.1, 0.6, uOatsHere.x) * 0.85 * uPaint);
            poolF *= 1.0 - crop.a * uPaint;
            soilRough = mix(soilRough, 0.8, crop.a * uPaint);
          }
          if (uOff > 0.001) {
            float tall;
            vec3 meadow = offCover(vWorld.xz, vF, uOffKind, broad, fine, grit, tall);
            // Land to be had stands a little paler and warmer than the land round it.
            meadow = mix(meadow, meadow * vec3(1.16, 1.12, 0.96) + vec3(0.025, 0.02, 0.0), uAvail * 0.8);
            soil = mix(soil, meadow, uOff);
            poolF *= 1.0 - uOff;
            soilRough = mix(soilRough, 0.9, uOff);
          }
          soil = mix(soil, vec3(0.018, 0.02, 0.018), poolF * 0.92);
          diffuseColor.rgb = soil;
          soilBump = ((n2.rg - 0.5) * 1.2 + (n3.rg - 0.5)) * (1.0 - poolF) * (1.0 - 0.5 * cov);
        }
        ${snowRimeAt('uSnow', 'uRimeHere')}
      `,
      fragmentRoughness: 'roughnessFactor = soilRough;',
      fragmentNormal: /* glsl */ `
        normal = normalize(normal + (viewMatrix * vec4(soilBump.x, 0.0, soilBump.y, 0.0)).xyz * 0.55);
        normal = normalize(mix(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz, poolF));
      `,
      // Water standing in the furrows shows the sky, from any height.
      fragmentEmissive: /* glsl */ `
        if ( poolF > 0.01 ) {
          vec3 pN = inverseTransformDirection( normal, viewMatrix );
          vec3 pV = normalize( cameraPosition - vWorld );
          vec3 pR = reflect( - pV, pN );
          pR.y = abs( pR.y );
          float pF = 0.4 + 0.6 * pow( 1.0 - max( dot( pN, pV ), 0.0 ), 4.0 );
          totalEmissiveRadiance += skyRadiance( pR, 0.1 ) * pF * poolF * poolOpen;
        }
      `,
    })
    const soil = new Mesh(soilGeo, soilMat)
    soil.receiveShadow = true
    soil.castShadow = true
    soil.customDepthMaterial = depthFor(soilShape)
    soil.layers.enable(1)
    this.group.add(soil)
    this.disposables.push(soilGeo, soilMat, soil.customDepthMaterial)

    // ---- plants. In four interleaved classes, so the first half and the first quarter are each spread evenly.
    const at = new Float32Array(PLANTS * 4)
    let m = 0
    for (const [pj, pk] of [[0, 0], [1, 1], [0, 1], [1, 0]]) {
      for (let j = pj; j < PLANTED_ROWS; j += 2) {
        for (let k = pk; k < PLANTS_PER_ROW; k += 2) {
          const z = f.z0 + (j + 0.5) * ROW
          at.set([f.x0 + (k + 0.5) * PLANT, fieldBaseY(z), z, hash2(i * 977 + k, j * 131 + 7)], m * 4)
          m++
        }
      }
    }
    const aAt = new InstancedBufferAttribute(at, 4)
    const instanced = (src: BufferGeometry, count: number): InstancedBufferGeometry => {
      const g = new InstancedBufferGeometry()
      g.index = src.index
      for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.attributes[name])
      g.setAttribute('aAt', aAt)
      g.instanceCount = count
      g.boundingSphere = bounds
      this.disposables.push(g)
      return g
    }
    const leafShape = (uniforms: Patch['uniforms']): Patch => ({
      key: 'county-plant',
      uniforms,
      vertexHead: `${PLANT_FN}\n${LEAF_TINT}\nattribute vec3 aLeaf;\nvarying vec3 vTint;\nvarying float vErode;\nvarying float vKeep;`,
      vertexNormal: /* glsl */ `
        gp = plantAt();
        objectNormal = normalize(vec3(gp.cs * objectNormal.x + gp.sn * objectNormal.z, objectNormal.y + 0.3 * gp.droop, -gp.sn * objectNormal.x + gp.cs * objectNormal.z));
      `,
      vertexBegin: LEAF_SHAPE + LEAF_COLOUR,
      vertexWorld: `${sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '0.55 * (1.0 - 0.6 * uCrop.x) * (1.0 - 0.8 * gp.dead)')}
        cWorld.y += sin(uTime * 6.3 + aLeaf.x * 40.0 + aAt.w * 23.0) * 0.012 * aLeaf.y * aLeaf.z * min(uSway, 1.0) * (1.0 - gp.dead);`,
    })
    const leafMat = (shape: Patch) => patch(new MeshStandardMaterial({ map: this.leafTex, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide, roughness: 0.82, metalness: 0 }), {
      ...shape,
      translucent: 1.25,
      ambient: 1.0,
      shine: 0.2,
      fragmentHead: 'varying vec3 vTint;\nvarying float vErode;\nvarying float vKeep;',
      fragmentColor: `diffuseColor.rgb *= vTint; float cg = coverGain(vMapUv, 256.0); diffuseColor.a *= cg * (1.0 - (1.0 - vKeep) * smoothstep(1.2, 1.9, cg)) * (1.0 - vErode * (0.25 + 0.75 * texture2D(uNoise, vMapUv * 1.7).a)); ${SNOW_RIME}`,
    })
    const nearShape = leafShape(shared)
    const plantMat = leafMat(nearShape)
    const plants = new Mesh(instanced(this.plantGeo, PLANTS), plantMat)
    plants.castShadow = true
    plants.receiveShadow = true
    plants.customDepthMaterial = depthFor({ ...nearShape, vertexBegin: `gp = plantAt();\n${LEAF_SHAPE}` })
    plants.layers.enable(1)
    this.group.add(plants)
    this.disposables.push(plantMat, plants.customDepthMaterial)
    // the clumps of middle distance: half the plants, each a little larger, in fewer leaves
    const midShape = leafShape({ ...shared, uDense: denseMid, uKeep: keepMid })
    const clumpMat = leafMat(midShape)
    const clumps = new Mesh(instanced(this.clumpGeo, PLANTS / 2), clumpMat)
    clumps.castShadow = true
    clumps.receiveShadow = true
    clumps.customDepthMaterial = depthFor({ ...midShape, vertexBegin: `gp = plantAt();\n${LEAF_SHAPE}` })
    clumps.visible = false
    this.group.add(clumps)
    this.disposables.push(clumpMat, clumps.customDepthMaterial)

    // ---- blossom
    const bloomMat = patch(new MeshStandardMaterial({ map: this.flowerTex, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide, roughness: 0.7, metalness: 0 }), {
      key: 'county-blossom',
      uniforms: { ...shared, uKeep: { value: new Vector2(0, 1.01) }, uTint: tint, uPix: PIXEL, uShare: bloomShare },
      translucent: 1.4,
      ambient: 0.95,
      blade: true,
      vertexHead: `${PLANT_FN}\nattribute vec4 aFlower;\nuniform float uTint;\nuniform float uPix;\nuniform float uShare;\nvarying vec3 vTint;\nfloat showF;`,
      // A flower is open to the sky and to whoever looks at it.
      vertexNormal: 'gp = plantAt();\nobjectNormal = normalize(vec3(0.0, 1.0, 0.0) + normalize(cameraPosition - aAt.xyz));',
      vertexBegin: /* glsl */ `
        vec3 pl = position;
        pl.y -= 0.1 * gp.droop;
        transformed = plantPlace(pl);
        float open = uCrop.w * smoothstep(0.3, 0.55, gp.h0.r) * (1.0 - gp.h0.g) * (1.0 - min(1.0, gp.h0.b * 2.4)) * (1.0 - gp.dead)
          * (1.0 - min(1.0, uCrop.y * 1.5)) * (1.0 - 0.7 * gp.h1.a) * (1.0 - 0.6 * uCrop.x);
        // Not every plant is in flower at once: more of them at the height of the bloom.
        showF = step(aFlower.z, open) * step(gp.r.x, 0.25 + 0.4 * uCrop.w);
        vTint = mix(${linear('#f8f5fa')}, ${linear('#d3c2e6')}, uTint * (0.4 + 0.6 * aFlower.w));
      `,
      vertexWorld: /* glsl */ `
        ${sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '0.55')}
        {
          // Far off a flower is drawn no smaller than a pixel, and fewer are drawn, so the field keeps its share of white.
          // uShare: how many plants each drawn one stands for.
          float fbase = 0.017 + 0.006 * aFlower.w, fsize = max(fbase, length(cWorld.xyz - cameraPosition) * uPix);
          float fkeep = clamp(fbase * fbase / (fsize * fsize) * 2.0 * uShare, 0.012, 1.0);
          // and stands clear of the leaves, which close over it as they shrink
          cWorld.y += 0.05 * smoothstep(1.2, 3.0, fsize / fbase);
          fsize *= showF * step(fract(aFlower.w * 7.13 + aAt.w * 3.7), fkeep);
          vec3 fr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), fu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          cWorld.xyz += (fr * aFlower.x + fu * aFlower.y) * fsize;
        }
      `,
      fragmentHead: 'varying vec3 vTint;',
      fragmentColor: 'diffuseColor.rgb *= vTint;',
    })
    const blossoms = new Mesh(instanced(this.bloomGeo, PLANTS), bloomMat)
    blossoms.receiveShadow = true
    this.group.add(blossoms)
    this.disposables.push(bloomMat)

    // ---- marks on the ground: the selection, the ring that answers an order, and the stakes of land to be had
    const ringGeo = ringGeometry(i)
    const ring = this.mark(ringGeo), pulse = this.mark(ringGeo), stake = this.mark(ringGeo)
    stake.un.uDash.value = 1
    this.disposables.push(ringGeo)

    this.gfx.push({
      d0, d1, t0, t1, crop, soilColor, water, damp, cover, tint, oats, dense, denseMid, keepNear, keepMid, bloomShare, off, avail, paint, rimeHere, bounds,
      soil, plants, clumps, blossoms, oatMesh: null, ring, pulse, stake, pulseT: 9, selT: 9, lod: 0, any: false,
    })
    this.soilTarget.push(new Color(SOIL.good))
    this.cropTarget.push(new Vector4())
  }

  private mark(geo: BufferGeometry): Mark {
    const un = { uLevel: { value: 0 }, uGrow: { value: 0 }, uGain: UI_GAIN, uDash: { value: 0 }, uWide: MARK_WIDE }
    const mat = new ShaderMaterial({
      uniforms: un,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      vertexShader: /* glsl */ `
        attribute vec3 aRing;      // across the band 0..1, distance to the nearest corner, distance along the ring
        attribute vec2 aOut;
        uniform float uGrow;
        uniform float uWide;
        varying vec3 vRing;
        void main() {
          vRing = aRing;
          vec3 p = position + vec3(aOut.x, 0.0, aOut.y) * (uGrow + (aRing.x - 0.5) * uGrow * 0.6 + aRing.x * 0.3 * (uWide - 1.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLevel;
        uniform float uGain;
        uniform float uDash;
        uniform float uWide;
        varying vec3 vRing;
        void main() {
          // A pale line with a dark edge, so it shows on snow as well as on soil. Heavier at the corners.
          float across = smoothstep(0.0, 0.18, vRing.x) * smoothstep(1.0, 0.82, vRing.x);
          float core = smoothstep(0.2, 0.36, vRing.x) * smoothstep(0.8, 0.64, vRing.x);
          float corner = 1.0 - smoothstep(1.4, 2.2, vRing.y);
          // Land to be had is marked out in dashes, like a surveyor's line.
          float dash = mix(1.0, max(step(0.42, fract(vRing.z / (1.3 * uWide))), corner), uDash);
          float a = uLevel * across * mix(0.62, 1.0, max(corner, 1.0 - core)) * dash;
          if (a < 0.004) discard;
          vec3 pale = mix(vec3(0.95, 0.9, 0.78), vec3(0.98, 0.84, 0.62), uDash);
          gl_FragColor = vec4(mix(vec3(0.02, 0.03, 0.02), pale, core) * uGain, a);
        }`,
    })
    const mesh = new Mesh(geo, mat)
    mesh.renderOrder = 6
    mesh.visible = false
    mesh.frustumCulled = false
    this.group.add(mesh)
    this.disposables.push(mat)
    return { mesh, un }
  }

  // Surveyor's stakes at the corners of land to be had: a post with a flag of pink tape.
  private buildStakes(): InstancedMesh {
    const parts: BufferGeometry[] = []
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: [number, number, number]) => {
      const p: number[] = [], col: number[] = []
      const v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]
      const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]]
      for (const fc of faces) for (const t of [[0, 1, 2], [0, 2, 3]]) for (const q of t) {
        const [a, b, cc] = v[fc[q]]
        p.push(x + a * w / 2, y + b * h / 2, z + cc * d / 2)
        col.push(...c)
      }
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3))
      g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
      g.computeVertexNormals()
      parts.push(g)
    }
    box(0.05, 0.62, 0.05, 0, 0.31, 0, [0.62, 0.52, 0.38])
    box(0.2, 0.09, 0.012, 0.11, 0.56, 0, [0.95, 0.32, 0.42])
    const geo = mergeGeometries(parts)!
    for (const p of parts) p.dispose()
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8 }), { fragmentColor: SNOW_RIME })
    const mesh = new InstancedMesh(geo, mat, FIELD_COUNT * 4)
    const m = new Matrix4().makeScale(0, 0, 0)
    for (let k = 0; k < FIELD_COUNT * 4; k++) mesh.setMatrixAt(k, m)
    mesh.castShadow = true
    mesh.frustumCulled = false
    this.group.add(mesh)
    this.disposables.push(geo, mat)
    return mesh
  }

  private placeStakes(): void {
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), up = new Vector3(0, 1, 0)
    for (let i = 0; i < FIELD_COUNT; i++) {
      const f = FIELDS[i]
      const corners: [number, number][] = [[f.x0 - 0.5, f.z0 - 0.5], [f.x1 + 0.5, f.z0 - 0.5], [f.x1 + 0.5, f.z1 + 0.5], [f.x0 - 0.5, f.z1 + 0.5]]
      corners.forEach(([x, z], k) => {
        const on = this.availNow[i] ? 1 : 0
        q.setFromAxisAngle(up, hash2(i, k) * 6.28)
        const size = on * 1.3 * Math.min(2.6, MARK_WIDE.value)
        m.compose(p.set(x, Math.max(groundY(x, z), fieldBaseY(z)) - 0.04, z), q, s.set(size, size, size))
        this.stakes.setMatrixAt(i * 4 + k, m)
      })
    }
    this.stakes.instanceMatrix.needsUpdate = true
  }

  // The oats of a rest year, made the first time a field is rested.
  private buildOats(i: number): Mesh {
    const f = FIELDS[i], g = this.gfx[i]
    const step = 0.27, kx = Math.floor(FW / step), kz = Math.floor(FD / step)
    const at = new Float32Array(kx * kz * 4)
    let n = 0
    // checkerboard first, so half of them make an even field at middle distance
    for (const parity of [0, 1]) {
      for (let j = 0; j < kz; j++) {
        for (let k = 0; k < kx; k++) {
          if ((j + k) % 2 !== parity) continue
          const x = f.x0 + ((k + 0.5 + (hash2(k + i * 71, j) - 0.5) * 0.8) / kx) * FW
          const z = f.z0 + ((j + 0.5 + (hash2(j + 13, k + i * 37) - 0.5) * 0.8) / kz) * FD
          at.set([x, fieldBaseY(z), z, hash2(k * 3 + 1, j * 7 + i)], n * 4)
          n++
        }
      }
    }
    const geo = new InstancedBufferGeometry()
    geo.index = this.oatGeo.index
    for (const name of Object.keys(this.oatGeo.attributes)) geo.setAttribute(name, this.oatGeo.attributes[name])
    geo.setAttribute('aAt', new InstancedBufferAttribute(at, 4))
    geo.instanceCount = n
    geo.userData.all = n
    geo.boundingSphere = g.bounds
    const shape: Patch = {
      key: 'county-oats',
      uniforms: { uOats: g.oats, uDense: g.dense },
      vertexHead: 'attribute vec4 aAt;\nattribute vec3 aBlade;\nuniform vec3 uOats;\nuniform float uDense;\nvarying vec3 vTint;\nfloat oatGust;',
      vertexNormal: /* glsl */ `
        float oa = aAt.w * 6.2831853, oc = cos(oa), os = sin(oa);
        objectNormal = vec3(oc * objectNormal.x + os * objectNormal.z, objectNormal.y, -os * objectNormal.x + oc * objectNormal.z);
      `,
      vertexBegin: /* glsl */ `
        float ob = aAt.w * 6.2831853, obc = cos(ob), obs = sin(ob);
        float tall = (0.05 + 0.4 * uOats.x) * (0.75 + 0.5 * fract(aAt.w * 53.1));
        float head = mix(1.0, smoothstep(0.55, 0.85, uOats.x), aBlade.z);
        vec3 ol = position * vec3(0.55, 1.0, 0.55) * vec3(head, mix(1.0, head, aBlade.z * 0.3), head);
        transformed = aAt.xyz + vec3(obc * ol.x + obs * ol.z, ol.y * tall, -obs * ol.x + obc * ol.z) * vec3(uOats.z, 1.0, uOats.z);
        oatGust = gustAt(aAt.xz);
      `,
      vertexWorld: sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '1.5'),
    }
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, side: DoubleSide, roughness: 0.72, metalness: 0 }), {
      ...shape,
      translucent: 0.45,
      blade: true,
      shine: 0.4,
      vertexBegin: shape.vertexBegin + /* glsl */ `
        {
          float ripe = uOats.y * (0.7 + 0.3 * fract(aAt.w * 17.3));
          vec3 col = mix(${linear('#7fa46a')}, ${linear('#d2b76c')}, ripe);
          col = mix(col * 0.6, col, smoothstep(0.0, 0.7, aBlade.y));
          col = mix(col, col * vec3(1.16, 1.12, 0.92), aBlade.z);
          // The wave of a gust shows pale where the oats lie over.
          vTint = col * (0.84 + 0.3 * fract(aBlade.x * 9.1)) * (1.0 + 0.3 * oatGust * min(uSway, 1.0));
        }
      `,
      fragmentHead: 'varying vec3 vTint;',
      fragmentColor: `diffuseColor.rgb *= vTint; ${SNOW_RIME}`,
    })
    const mesh = new Mesh(geo, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.customDepthMaterial = depthFor(shape)
    mesh.layers.enable(1)
    mesh.layers.enable(3)
    this.group.add(mesh)
    this.disposables.push(geo, mat, mesh.customDepthMaterial)
    return mesh
  }

  // Set what each hill should look like. `display` may hold hills still waiting to be revealed by the crews.
  setTargets(fields: FieldVis[], display: HillDisplay[][]): void {
    let stakes = false
    for (let i = 0; i < FIELD_COUNT; i++) {
      const fv = fields[i]
      this.rest[i] = fv.held && fv.crop === 'rest'
      if (this.rest[i] && !this.gfx[i].oatMesh) this.gfx[i].oatMesh = this.buildOats(i)
      this.cropTarget[i].set(fv.wilt, fv.frosted, fv.rime, fv.bloom)
      this.soilTarget[i].set(SOIL[fv.moisture] ?? SOIL.good)
      this.waterTarget[i] = fv.held && fv.moisture === 'standing water' ? 1 : 0
      this.dampTarget[i] = DAMP[fv.moisture] ?? 0.3
      this.coverTarget[i] = this.rest[i] ? 1 : 0
      this.offTarget[i] = fv.held ? 0 : 1
      this.rimeTarget[i] = fv.rime
      if (this.availNow[i] !== fv.available) { this.availNow[i] = fv.available; stakes = true }
      this.gfx[i].tint.value = BLOOM_TINT[fv.variety] ?? 0.2
      for (let h = 0; h < HILLS; h++) {
        const d = display[i][h]
        this.hillTarget(i * HILLS + h, d.look, d.ridge, fv)
      }
    }
    if (stakes) this.placeStakes()
    this.settled = false
  }

  setHill(field: number, hill: number, d: HillDisplay, fv: FieldVis): void {
    this.hillTarget(field * HILLS + hill, d.look, d.ridge, fv)
    this.settled = false
  }

  private hillTarget(k: number, look: HillLook, ridge: number, fv: FieldVis): void {
    const t = this.tgt, o = k * G
    let grow = 0, dead = 0
    if (look.kind === 'plant') {
      const c = Math.max(0.03, look.canopy)
      // Frost blackens leaf where it stands: the plant keeps its spread and slumps, it does not turn into a small green one.
      const spread = fv.frosted > 0 ? Math.min(1, c / Math.max(0.15, 1 - fv.frosted)) : c
      grow = Math.min(1, spread * (0.78 + 0.22 * Math.min(1.2, look.vigor)))
    } else if (look.kind === 'dead') {
      grow = Math.max(0.6, look.canopy)
      dead = 1
    }
    t[o] = grow
    t[o + 1] = look.kind === 'plant' ? look.yellow : 0
    t[o + 2] = look.kind === 'plant' ? look.blight : 0
    t[o + 3] = dead
    t[o + 4] = look.kind === 'dug' ? 1 : 0
    t[o + 5] = look.kind === 'pulled' ? 1 : 0
    t[o + 6] = ridge
    t[o + 7] = look.kind === 'plant' && look.stunted ? 1 : 0
  }

  // How far off each field is drawn from, as a level of detail from 0 (whole plants) to 2 (painted).
  private lodFor(i: number, camera: PerspectiveCamera): number {
    const g = this.gfx[i], f = FIELDS[i], c = camera.position
    if (!this.frustum.intersectsSphere(g.bounds)) return 2
    const x = Math.max(f.x0, Math.min(f.x1, c.x)), z = Math.max(f.z0, Math.min(f.z1, c.z))
    const d = this.near.set(x, fieldBaseY(z) + 0.2, z).distanceTo(c)
    const L = this.lodAt
    const s = (a: number, w: number) => Math.max(0, Math.min(1, (d - a) / w))
    return s(L.near - 4, 10) + s(L.far - 20, 40)
  }

  // dt in seconds. `oats`, `oatsRipe`: the growth of the rest-year cover.
  update(dt: number, camera: PerspectiveCamera, opts: { selection: number[]; hover: number; oats: number; oatsRipe: number; reduced: boolean }): void {
    const kFast = 1 - Math.exp(-dt * 6), kSlow = 1 - Math.exp(-dt * 2.5), kLod = 1 - Math.exp(-dt * 5)
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    for (let i = 0; i < FIELD_COUNT; i++) {
      const g = this.gfx[i]
      g.soilColor.lerp(this.soilTarget[i], kSlow)
      g.water.value += (this.waterTarget[i] - g.water.value) * kSlow
      g.damp.value += (this.dampTarget[i] - g.damp.value) * kSlow
      g.cover.value += (this.coverTarget[i] * (0.35 + 0.65 * opts.oats) - g.cover.value) * kSlow
      g.off.value += (this.offTarget[i] - g.off.value) * kSlow
      if (Math.abs(this.offTarget[i] - g.off.value) < 0.002) g.off.value = this.offTarget[i]
      g.rimeHere.value += (this.rimeTarget[i] - g.rimeHere.value) * kSlow
      this.held[i] = 1 - g.off.value
      g.crop.lerp(this.cropTarget[i], kSlow)
      const want = this.lodFor(i, camera)
      g.lod = Math.abs(want - g.lod) > 0.6 ? want : g.lod + (want - g.lod) * kLod
      this.applyLod(i, opts.oats, opts.oatsRipe)
      // The selection: steady, after it has drawn the eye twice.
      const sel = opts.selection.includes(i)
      g.selT = sel ? g.selT + dt : 0
      const beat = sel && !opts.reduced && g.selT < 1.1 ? 0.18 * Math.sin(g.selT * 11.4) * (1 - g.selT / 1.1) : 0
      const ringWant = sel ? 0.95 + beat : i === opts.hover ? 0.42 : 0
      g.ring.un.uLevel.value += (ringWant - g.ring.un.uLevel.value) * (opts.reduced ? 1 : 1 - Math.exp(-dt * 14))
      g.avail.value += ((this.availNow[i] ? 1 : 0) - g.avail.value) * kFast
      g.ring.mesh.visible = g.ring.un.uLevel.value > 0.01
      g.ring.un.uDash.value = this.availNow[i] ? 1 : 0
      // Land to be had, marked out in spring.
      const stakeWant = this.availNow[i] && !sel ? (i === opts.hover ? 0.95 : 0.72) : 0
      g.stake.un.uLevel.value += (stakeWant - g.stake.un.uLevel.value) * (opts.reduced ? 1 : kFast)
      g.stake.mesh.visible = g.stake.un.uLevel.value > 0.01
      // An order heard: a ring that opens out from the field and goes.
      if (g.pulseT < 0.7) {
        g.pulseT += dt
        const u = Math.min(1, g.pulseT / 0.7)
        g.pulse.un.uGrow.value = opts.reduced ? 0.5 : 1.6 * (1 - (1 - u) * (1 - u))
        g.pulse.un.uLevel.value = (1 - u) * 0.9
        g.pulse.mesh.visible = u < 1
      } else g.pulse.mesh.visible = false
    }
    if (!this.settled) this.stepHills(kFast)
    if (Math.abs(MARK_WIDE.value - this.stakeWide) > 0.05 * this.stakeWide && this.availNow.some(a => a)) { this.stakeWide = MARK_WIDE.value; this.placeStakes() }
  }

  private applyLod(i: number, oats: number, oatsRipe: number): void {
    const g = this.gfx[i], lod = g.lod
    const nearOn = lod < 1, midOn = lod > 0 && lod < 2
    g.keepNear.value.set(Math.max(0, lod), 1.01)
    if (lod < 1) g.keepMid.value.set(0, lod)
    else g.keepMid.value.set(lod - 1, 1.01)
    g.paint.value = Math.max(0, Math.min(1, lod - 1))
    g.plants.visible = g.any && nearOn
    g.clumps.visible = g.any && midOn
    // The blossom thins with distance; each flower drawn stands for more.
    const bloomGeo = g.blossoms.geometry as InstancedBufferGeometry
    const count = lod < 0.5 ? PLANTS : lod < 1.5 ? PLANTS / 2 : PLANTS / 4
    bloomGeo.instanceCount = this.density < 1 ? Math.min(count, PLANTS / 2) : count
    g.bloomShare.value = PLANTS / bloomGeo.instanceCount
    g.blossoms.visible = g.any && this.cropTarget[i].w > 0.01
    // Only whole plants throw shadow into the second cascade; nothing painted throws any.
    const near1 = this.farShadows && lod < 0.5
    for (const m of [g.plants, g.soil]) { if (near1) m.layers.enable(1); else m.layers.disable(1) }
    g.soil.castShadow = lod < 1.5 && g.off.value < 0.5
    g.clumps.castShadow = lod < 1.5
    const rest = this.rest[i]
    g.oats.value.set(rest ? oats : 0, oatsRipe, 1)
    if (g.oatMesh) {
      const geo = g.oatMesh.geometry as InstancedBufferGeometry
      const all = geo.userData.all as number
      geo.instanceCount = lod < 1 ? all : Math.ceil(all / 2)
      g.oats.value.z = lod < 1 ? 1 : 1.4
      g.oatMesh.visible = rest && oats > 0.01 && lod < 1.9
      if (this.farShadows && lod < 0.5) g.oatMesh.layers.enable(1); else g.oatMesh.layers.disable(1)
    }
  }

  // The ring that tells the player an order was heard.
  ringOrder(fields: number[]): void {
    for (const i of fields) if (this.gfx[i]) this.gfx[i].pulseT = 0
  }

  // The fields whose ring is still on the ground.
  ringing(): number[] {
    return this.gfx.map((g, i) => (g.pulseT < 0.7 ? i : -1)).filter(i => i >= 0)
  }

  // What each field is drawn with now, for the tools: 0 whole plants, 1 clumps, 2 painted.
  lods(): number[] {
    return this.gfx.map(g => Math.round(g.lod * 10) / 10)
  }

  private stepHills(k: number): void {
    const cur = this.cur, tgt = this.tgt
    let moving = false
    for (let n = 0; n < N * G; n++) {
      const d = tgt[n] - cur[n]
      if (Math.abs(d) > 0.003) { cur[n] += d * k; moving = true } else cur[n] = tgt[n]
    }
    this.write()
    if (!moving) this.settled = true
  }

  // Jump everything to its target, for screenshots and first frames.
  // oats: the growth of the rest-year cover, as update() is given it.
  snap(oats: number, camera?: PerspectiveCamera): void {
    this.cur.set(this.tgt)
    if (camera) this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    for (let i = 0; i < FIELD_COUNT; i++) {
      const g = this.gfx[i]
      g.soilColor.copy(this.soilTarget[i])
      g.water.value = this.waterTarget[i]
      g.damp.value = this.dampTarget[i]
      g.cover.value = this.coverTarget[i] * (0.35 + 0.65 * oats)
      g.off.value = this.offTarget[i]
      g.rimeHere.value = this.rimeTarget[i]
      this.held[i] = 1 - g.off.value
      g.crop.copy(this.cropTarget[i])
      if (camera) g.lod = this.lodFor(i, camera)
      g.pulseT = 9
      g.selT = 9
    }
    this.write()
    this.settled = true
  }

  private write(): void {
    const cur = this.cur
    for (let i = 0; i < FIELD_COUNT; i++) {
      const g = this.gfx[i]
      let any = false
      for (let h = 0; h < HILLS; h++) {
        const o = (i * HILLS + h) * G, q = h * 4
        const dug = cur[o + 4], pulled = cur[o + 5]
        const grow = cur[o] * (1 - dug) * (1 - pulled)
        if (grow > 0.004) any = true
        g.d0[q] = Math.round(grow * 255)
        g.d0[q + 1] = Math.round(cur[o + 1] * 255)
        g.d0[q + 2] = Math.round(Math.min(1, cur[o + 2]) * 255)
        g.d0[q + 3] = Math.round(cur[o + 3] * 255)
        g.d1[q] = Math.round(dug * 255)
        g.d1[q + 1] = Math.round(pulled * 255)
        g.d1[q + 2] = Math.round(cur[o + 6] * 255)
        g.d1[q + 3] = Math.round(cur[o + 7] * 255)
      }
      g.t0.needsUpdate = true
      g.t1.needsUpdate = true
      g.any = any
    }
  }

  // Half the plants, each a little larger, where the machine cannot carry them all; and where each level of detail begins.
  setTier(tier: 'high' | 'medium' | 'low', density: number): void {
    this.lodAt = LOD[tier]
    if (density === this.density) return
    this.density = density
    for (const g of this.gfx) {
      ;(g.plants.geometry as InstancedBufferGeometry).instanceCount = density >= 1 ? PLANTS : PLANTS / 2
      g.dense.value = density >= 1 ? 1 : 1.36
    }
  }

  // Shadows from plants reach the second cascade only when the first is too small to hold the fields.
  setFarShadows(on: boolean): void {
    this.farShadows = on
  }

  // Where a field's plate is pinned: the middle of its near edge as seen from `toward` (the camera), on the ground.
  nearEdge(i: number, towardX: number, towardZ: number): Vector3 {
    const f = FIELDS[i]
    const dx = towardX - f.cx, dz = towardZ - f.cz
    // the side of the field the camera looks across from
    const sx = Math.abs(dx) / (FW / 2), sz = Math.abs(dz) / (FD / 2)
    if (sz >= sx) {
      const z = dz > 0 ? f.z1 - 0.9 : f.z0 + 0.9
      return new Vector3(f.cx, fieldBaseY(z) + 0.35, z)
    }
    const x = dx > 0 ? f.x1 - 1.2 : f.x0 + 1.2
    return new Vector3(x, fieldBaseY(f.cz) + 0.35, f.cz)
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.stakes.dispose()
  }
}

// A band round a field, lying on the ground just outside the crop.
function ringGeometry(i: number): BufferGeometry {
  const f = FIELDS[i]
  const pad = 0.4, w = 0.3
  const pos: number[] = [], ring: number[] = [], out: number[] = [], idx: number[] = []
  const corners: [number, number][] = [[f.x0 - pad, f.z0 - pad], [f.x1 + pad, f.z0 - pad], [f.x1 + pad, f.z1 + pad], [f.x0 - pad, f.z1 + pad]]
  let arc = 0
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4]
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len
    const ox = dz, oz = -dx
    const steps = Math.ceil(len / 0.6)
    const o = pos.length / 3
    for (let k = 0; k <= steps; k++) {
      // each side runs past its ends so the corners close
      const t = -w + ((len + 2 * w) * k) / steps
      const near = Math.min(Math.max(t, 0), Math.max(len - t, 0))
      for (const e of [0, 1]) {
        const x = ax + dx * t + ox * e * w, z = az + dz * t + oz * e * w
        pos.push(x, Math.max(groundY(x, z), fieldBaseY(z)) + 0.07, z)
        ring.push(e, near, arc + t)
        out.push(ox, oz)
      }
      if (k > 0) { const a = o + (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    }
    arc += len
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aRing', new BufferAttribute(new Float32Array(ring), 3))
  g.setAttribute('aOut', new BufferAttribute(new Float32Array(out), 2))
  g.setIndex(idx)
  return g
}

export function bloomTint(variety: string): number {
  return BLOOM_TINT[variety] ?? 0.2
}
