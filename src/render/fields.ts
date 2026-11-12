// The fields: soil whose rows ridge as they are hilled, each simulated hill drawn as a patch of plants made of leaves,
// their blossom, the rest-year oats over clover, and the marks that show what the player has selected. Land the farm
// does not hold is somebody else's hay, pasture or stubble, staked out in spring when it can be had.
// What is drawn follows what the camera can resolve: whole plants near, a cheaper clump of leaves further off, and far
// away (or out of sight) the crop painted into the ground in rows, with no plants and no shadow at all.
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, Frustum, Group, InstancedBufferAttribute, InstancedBufferGeometry,
  InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, FloatType, LinearFilter, NearestFilter, Quaternion, RedFormat, RGBAFormat, ShaderMaterial, Sphere, Vector2, Vector3,
  Vector4, CustomBlending, OneFactor, type Material, type Object3D, type PerspectiveCamera, type Texture,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COLS, FIELD_COUNT, HILLS, PARCELS, ROWS, STUMP_DAYS, TILE_DAYS, type HillLook } from '../sim/index.ts'
import { blossomGeometry, oatGeometry, plantGeometry } from './geometry.ts'
import { FALL, FD, FIELDS, FW, PLANT, PLANTED_ROWS, PLANTS_PER_ROW, ROW, SLOPE_TABLE, SX, SZ, fieldBaseY, groundY } from './layout.ts'
import { hash2 } from './noise.ts'
import { K, S } from './scale.ts'
import { SNOW_RIME, depthFor, linear, patch, snowRimeAt, sway, type Patch } from './shaders.ts'
import { GROUND_SNOW } from './snow.ts'
import type { FieldVis } from './state.ts'

export const RIDGE_AMP = 0.22
const N = FIELD_COUNT * HILLS
const G = 8                    // numbers kept per hill: grow, yellow, blight, dead, dug, pulled, ridge, stunt
const SLOPE = FALL
// Whole plants are drawn from one pool, in a window of the row lattice round the camera's nearest ground; everywhere
// else the crop is painted on the soil in its rows. A plant of the pool stands for two along the row.
const PLANT_STEP = PLANT * 2, PLANT_COLS = Math.floor(PLANTS_PER_ROW / 2)
// The rest-year oats, from a pool of their own.
const OAT_STEP = 0.6, OAT_COLS = Math.floor(FW / OAT_STEP), OAT_ROWS = Math.floor(FD / OAT_STEP)
// The sprayer's wheelings: every this many rows.
const TRAM = 20
// How far from the eye whole plants are drawn one in two and one in four along the row, and with half their leaves.
const THIN_AT = [18, 30], HALF_AT = 24
// Half the window along the rows and across them, in metres, by quality tier; and how far off its nearest ground may
// be before nothing of it would show.
// How far off a field keeps its rows as shapes in the ground, by tier.
const FLAT_AT = { high: 190, medium: 140, low: 80 }
export const POOL = { high: { x: 36, z: 27, reach: 110 }, medium: { x: 28, z: 21, reach: 90 }, low: { x: 18, z: 14, reach: 60 } }

const SOIL: Record<string, string> = {
  'standing water': '#4c3024', wet: '#59382a', good: '#774a37', drying: '#84543d', dry: '#925d44', wilting: '#9d6b54',
}
const DAMP: Record<string, number> = { 'standing water': 1, wet: 0.85, good: 0.3, drying: 0.12, dry: 0, wilting: 0 }

// How much lilac is in the flower, by variety.
const BLOOM_TINT: Record<string, number> = { norland: 0.9, superior: 0.2, katahdin: 0.35, kennebec: 0.08, burbank: 0.12, atlantic: 0.55, gold: 0.8, caribou: 0.3 }

// What somebody else's ground is in, by parcel: 0 hay, 1 pasture, 2 last year's stubble.
export const OFF_KIND = [0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 2, 2, 0, 1, 0, 1, 1, 0]

export interface HillDisplay { look: HillLook; ridge: number }

// The smallest a blossom or a tuber may be drawn, as world size per unit of distance: about a pixel.
export const PIXEL = { value: 0.0006 }
// What the marks on the ground are multiplied by so they hold their brightness under any exposure.
export const UI_GAIN = { value: 1 }
// How much wider than their own width the marks on the ground are drawn, so they still show from the strategic view.
export const MARK_WIDE = { value: 1 }

// A hill's numbers as they lie on the ground. Growth, yellowing, vigour and the ridge run smoothly from one hill to the
// next; blight spreads from its hill as a ragged focus; dead vines end at a ragged line; dug ground ends along the
// digger's pairs of rows, each pair a little ahead of or behind its neighbour; a test dig is a patch at its hill.
// h0: growth (none where dug or pulled), yellow, the share of leaf blight has taken, dead. h1: dug, pulled, ridge, stunt.
const HILL_FN = /* glsl */ `
float gLump;
float gSick;
void hillAt(vec2 f, vec2 xz, out vec4 h0, out vec4 h1) {
  vec4 na = textureLod(uNoise, xz * 0.021, 0.0), nb = textureLod(uNoise, xz * 0.047 + 0.37, 0.0);
  float lump = textureLod(uNoise, xz * 0.083 + 0.11, 0.0).b;
  vec2 uv = f + (vec2(na.b, nb.b) - 0.5) * vec2(${(0.5 / COLS).toFixed(5)}, ${(0.5 / ROWS).toFixed(5)});
  h0 = textureLod(uT0, uv, 0.0);
  h1 = textureLod(uT1, uv, 0.0);
  gLump = lump;
  float sick = min(1.0, h0.b * 2.4) * 1.3;
  h0.b = smoothstep(0.0, 0.3, sick - (0.1 + 0.9 * lump));
  // round a focus the leaf yellows before it goes
  h0.g = max(h0.g, 0.8 * smoothstep(0.0, 0.3, sick * 1.5 - (0.1 + 0.9 * lump)) * (1.0 - h0.b));
  h0.a = smoothstep(0.42, 0.58, h0.a + (lump - 0.5) * 0.8 + (nb.a - 0.5) * 0.3);
  h0.g = clamp(h0.g * (0.72 + 0.56 * na.b), 0.0, 1.0);
  float strip = floor(f.y * ${(PLANTED_ROWS / 2).toFixed(1)});
  float ahead = fract(sin(strip * 12.9898) * 43758.5453) - 0.5;
  vec2 cell = f * vec2(${COLS}.0, ${ROWS}.0);
  // each hill's strips come open in turn from the top of its band as it is dug
  float within = (strip + 0.5) / ${(PLANTED_ROWS / 2).toFixed(1)} * ${ROWS}.0;
  float turn = mix(0.2, 0.8, fract(within));
  h1.r = smoothstep(turn - 0.06, turn + 0.06, textureLod(uT1, vec2(f.x + ahead * ${(0.4 / COLS).toFixed(5)}, (floor(within) + 0.5) / ${ROWS}.0), 0.0).r);
  float pulled = texelFetch(uT1, ivec2(clamp(floor(cell), vec2(0.0), vec2(${COLS - 1}.0, ${ROWS - 1}.0))), 0).g;
  h1.g = pulled * (1.0 - smoothstep(1.5, 3.9, length((fract(cell) - 0.5) * vec2(${SX.toFixed(2)}, ${SZ.toFixed(2)})) + (lump - 0.5) * 1.4));
  h0.r = min(1.0, h0.r * (0.93 + 0.14 * nb.b)) * (1.0 - h1.r) * (1.0 - h1.g);
  gSick = smoothstep(0.0, 0.25, sick);
  h0.r *= mix(1.0, smoothstep(0.1, 0.45, h0.r + (textureLod(uNoise, xz * 0.31, 0.0).a - 0.5) * 0.5), gSick);
}
`
// How far in from each end of the rows nothing is planted: the headland, where the machines turn.
const HEAD = [3.0, 4.6]
// A slot of a pool as a place in a field's lattice: `aAt` is where it stands (x, the slope's height, z) and its own
// number; `slotIn` is 0 outside the field and falls to 0 at the window's edge.
const slotGlsl = (stepX: number, stepZ: number, cols: number, rows: number, jitter: number) => /* glsl */ `
attribute vec2 aSlot;
uniform sampler2D uSlope;
uniform vec4 uWin;         // the window in this field's lattice: first column, first row, and its centre on the ground
uniform vec2 uPool;        // half the window, along the rows and across them
uniform vec2 uFadeR;       // how far from the eye whole plants begin to give way, and where they are gone
uniform float uSeed;
vec4 aAt;
float slotIn;
float slopeY(float z) {
  float f = clamp(z - ${SLOPE_TABLE.z0.toFixed(1)}, 0.0, ${(SLOPE_TABLE.n - 1.001).toFixed(3)});
  int i = int(f);
  return mix(texelFetch(uSlope, ivec2(i, 0), 0).r, texelFetch(uSlope, ivec2(i + 1, 0), 0).r, f - float(i));
}
void slot() {
  float c = uWin.x + aSlot.x, r = uWin.y + aSlot.y;
  aAt.w = fract(sin(dot(vec2(c, r) + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 j = (fract(aAt.w * vec2(61.7, 127.3)) - 0.5) * ${jitter.toFixed(3)};
  aAt.x = uRect.x + (c + 0.5 + j.x) * ${stepX.toFixed(5)};
  aAt.z = uRect.y + (r + 0.5 + j.y) * ${stepZ.toFixed(5)};
  aAt.y = slopeY(aAt.z);
  vec2 d = abs(aAt.xz - uWin.zw) / uPool;
  slotIn = step(0.0, c) * step(c, ${(cols - 1).toFixed(1)}) * step(0.0, r) * step(r, ${(rows - 1).toFixed(1)}) * (1.0 - smoothstep(0.7, 1.0, max(d.x, d.y))) * (1.0 - smoothstep(uFadeR.x, uFadeR.y, distance(aAt.xyz, cameraPosition)));
  // The window lies round the camera's nearest ground, a third of it behind the camera: what stands more than a
  // step behind the eye is in no picture.
  slotIn *= step(-1.5, dot(aAt.xyz - cameraPosition, -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])));
}
`
const PLANT_FN = /* glsl */ `
uniform sampler2D uT0;
uniform sampler2D uT1;
uniform vec4 uRect;
uniform vec4 uCrop;        // wilt, share of leaf blackened by frost, rime this morning, bloom
uniform float uOpen;       // how the wind reaches this field: less in the lee of standing woods
${HILL_FN}
${slotGlsl(PLANT_STEP, ROW, PLANT_COLS, PLANTED_ROWS, 0)}
uniform vec3 uSpare;       // 1 where a saving is on: plants thinned with distance, half the leaves far off
uniform vec2 uTrial;       // for the tools: the plants' size (0: none is drawn), and 1 to draw one plant in two everywhere
struct Plant { vec3 at; float w; float h; float cs; float sn; float droop; float dead; float frost; vec4 h0; vec4 h1; vec3 r; float wide; float far; float stands; };
Plant gp;
Plant plantAt() {
  Plant p;
  slot();
  // Further off, every second plant along the row is drawn and then every fourth, each as wide as those it stands
  // for: level across a crop the far plants lie a dozen deep in a pixel and none of them is seen whole. (Where the
  // change comes differs a little from plant to plant, so it is no line across the field.)
  p.far = distance(aAt.xyz, cameraPosition) + (aAt.w - 0.5) * 4.0;
  float every = exp2(max(uTrial.y, uSpare.x * (step(${THIN_AT[0].toFixed(1)}, p.far) + step(${THIN_AT[1].toFixed(1)}, p.far))));
  slotIn *= uTrial.x;
  if (mod(uWin.x + aSlot.x, every) > 0.5) slotIn = 0.0;
  p.wide = 1.0 + 0.36 * (every - 1.0) - 0.04 * (every - 1.0) * (every - 1.0);
  p.stands = every;
  // A slot with no plant to draw (outside the field, past the window's edge, behind the camera) is done with here:
  // its hill is not read. Level across a crop that is half the slots.
  if (slotIn <= 0.0) {
    p.at = aAt.xyz; p.w = 0.0; p.h = 0.0; p.cs = 1.0; p.sn = 0.0; p.droop = 0.0; p.dead = 0.0; p.frost = 0.0;
    p.h0 = vec4(0.0); p.h1 = vec4(0.0); p.r = vec3(0.0); p.wide = 1.0;
    return p;
  }
  hillAt((aAt.xz - uRect.xy) * uRect.zw, aAt.xz, p.h0, p.h1);
  p.r = fract(aAt.w * vec3(61.7, 127.3, 331.9));
  p.dead = p.h0.a;
  p.h0.r *= step(p.h1.g, 0.25 + 0.5 * p.r.z);
  p.h0.r *= mix(1.0, step(0.35 * p.r.x, p.h0.r - 0.12), gSick);
  p.frost = smoothstep(0.0, 0.25, uCrop.y * 1.25 - gLump + 0.2 * (p.r.y - 0.5)) * (1.0 - p.dead);
  p.droop = clamp(max(uCrop.x * 0.9, p.frost * 0.85), 0.0, 1.0) * (1.0 - p.dead);
  float size = (0.22 + 0.78 * pow(p.h0.r, 0.75)) * mix(1.0, 0.6, p.h1.a) * (0.84 + 0.32 * p.r.x) * step(0.004, p.h0.r) * slotIn
    * smoothstep(${HEAD[0].toFixed(1)}, ${HEAD[1].toFixed(1)}, min(aAt.x - uRect.x, uRect.x + ${FW.toFixed(2)} - aAt.x));
  p.w = size * 0.8 * (1.0 + 0.1 * p.droop);
  p.h = size * 0.56 * mix(1.0, 0.36, p.dead);
  float a = aAt.w * 6.2831853;
  p.cs = cos(a);
  p.sn = sin(a);
  vec2 jit = (p.r.yz - 0.5) * vec2(${(PLANT_STEP * 0.4).toFixed(3)}, ${(ROW * 0.14).toFixed(3)});
  // The tractor's wheels run in the same furrows all season: the rows beside them stand back from it.
  float rowI = floor((aAt.z - uRect.y) / ${ROW.toFixed(4)});
  float tr = mod(rowI + ${(TRAM / 2).toFixed(1)}, ${TRAM.toFixed(1)});
  float tram = step(tr, 0.5) + step(${(TRAM - 1.5).toFixed(1)}, tr);
  p.w *= 1.0 - 0.22 * tram;
  jit.y += (tr < 0.5 ? 0.12 : -0.12) * tram;
  jit.x += (every - 1.0) * ${(PLANT_STEP * 0.5).toFixed(3)};
  p.at = vec3(aAt.x + jit.x, aAt.y + ${RIDGE_AMP.toFixed(3)} * smoothstep(0.0, 0.05, p.h1.b) * (0.4 + 0.6 * p.h1.b) * (1.0 - p.h1.r) - 0.012, aAt.z + jit.y);
  return p;
}
vec3 plantPlace(vec3 pl) {
  // Wider along the row than across it: the rows close first, the furrows between them last.
  // Where only every other plant is drawn, each stands for its neighbour along the row, and keeps to its own row.
  return gp.at + vec3((gp.cs * pl.x + gp.sn * pl.z) * gp.w * 1.5 * gp.wide, pl.y * gp.h, (-gp.sn * pl.x + gp.cs * pl.z) * gp.w * 0.94);
}
`

const LEAF_SHAPE = /* glsl */ `
  vec3 pl = position;
  // Far off a plant is drawn with every other leaf, each a little larger.
  float fewer = uSpare.y * step(${HALF_AT.toFixed(1)}, gp.far);
  pl *= 1.0 - fewer * aLeaf.z * step(0.5, aLeaf.x);
  pl.xz *= 1.0 + 0.22 * fewer * aLeaf.z;
  pl.y -= aLeaf.y * aLeaf.y * 0.42 * gp.droop * aLeaf.z;
  pl.xz *= 1.0 + 0.18 * gp.droop * aLeaf.y * aLeaf.z;
  pl.y = max(pl.y, 0.02);
  transformed = plantPlace(pl);
  // A leaf that reaches over the furrow hangs into it, so the rows keep their shape after the canopy closes.
  float furrow = smoothstep(0.2, 0.5, abs(transformed.z - gp.at.z) / ${ROW.toFixed(4)});
  transformed.y -= 0.46 * gp.h * furrow * (1.0 - gp.dead);
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
    float bl = gp.h0.b;
    float hit = smoothstep(0.0, 0.25, bl * 1.3 - fract(aLeaf.x * 7.3 + gp.r.x));
    col = mix(col, mix(${linear('#4b3324')}, ${linear('#241a14')}, fract(aLeaf.x * 3.1 + gp.r.z)), hit);
    float burnt = smoothstep(0.0, 0.2, gp.frost * 1.25 - fract(aLeaf.x * 5.7 + gp.r.y));
    // On the morning of the frost the leaf is white with rime; it is black by the next day.
    col = mix(col, ${linear('#2b2a26')}, burnt * (1.0 - 0.75 * uCrop.z));
    col = mix(col, ${linear('#a8bcc0')}, 0.55 * uCrop.z * smoothstep(0.2, 0.9, aLeaf.y));
    col = mix(col, ${linear('#b5a27a')} * (0.8 + 0.4 * gp.r.z), gp.dead);
    col = mix(${linear('#8a9a62')}, col, aLeaf.z);
    // Deep in the canopy little light arrives; and no two leaves are quite one green.
    col *= mix(0.46, 1.0, smoothstep(0.02, 0.44, position.y)) * (0.9 + 0.2 * gp.r.z) * (0.84 + 0.32 * fract(aLeaf.x * 0.618 + gp.r.x * 5.0)) * mix(1.14, 0.46, furrow);
    vTint = col;
    vErode = max(max(gp.dead * 0.32, hit * 0.55), burnt * 0.45 * (1.0 - uCrop.z)) * aLeaf.z;
    // Seen from far off a plant keeps as many of its leaves as it has canopy, so a half-grown field shows its soil.
    vKeep = step(fract(sin(aLeaf.x * 91.7 + gp.r.y * 47.3) * 43758.5), max(0.3 + 0.7 * smoothstep(0.35, 0.9, grow), gp.dead));
  }
`

const ROW_FN = /* glsl */ `
attribute vec2 aF;
uniform sampler2D uT0;
uniform sampler2D uT1;
uniform vec4 uCrop;
uniform vec4 uWin;
uniform vec2 uPool;
uniform vec2 uFadeR;
uniform float uNear;
uniform float uPix;
uniform float uCoarse;
uniform vec3 uOatsHere;
varying vec2 vF;
varying float vProf;
varying float vRidged;
varying float vDrill;
vec4 gShape;
vec4 gH0;
vec4 gH1;
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
${HILL_FN}
// Height above the smooth ground, the slope across the rows, where on the row's profile this point is, and how much of
// the height is leaf. Where whole plants are not drawn each row carries a ridge of leaf as tall and as wide as they
// are, so the crop has its relief from any distance; rows too fine for the screen are drawn flat, or they would shimmer.
vec4 soilShape(vec2 f, vec3 at, out vec4 h0, out vec4 hill) {
  hillAt(f, at.xz, h0, hill);
  float fr = fract(f.y * ${PLANTED_ROWS}.0) - 0.5;
  float rim = min(min(f.x, 1.0 - f.x) * ${FW.toFixed(2)}, min(f.y, 1.0 - f.y) * ${FD.toFixed(2)});
  float taper = smoothstep(0.0, 1.2, rim);
  float head = smoothstep(${HEAD[0].toFixed(1)}, ${HEAD[1].toFixed(1)}, min(f.x, 1.0 - f.x) * ${FW.toFixed(2)});
  float px = ${ROW.toFixed(4)} / max(1e-4, distance(at, cameraPosition) * uPix * 0.6);
  float show = smoothstep(7.0, 15.0, px) * (1.0 - uCoarse);
  vec2 prof = rowProfile(fr, smoothstep(0.55, 1.0, hill.b));
  float rb = smoothstep(0.0, 0.05, hill.b) * (0.4 + 0.6 * hill.b);
  float amp = ${RIDGE_AMP.toFixed(3)} * rb * taper * head * (1.0 - 0.75 * smoothstep(0.3, 1.0, uSnow)) * show;
  float lumps = (textureLod(uNoise, at.xz * ${(0.37 / S).toFixed(4)}, 0.0).a - 0.5) * 0.2;
  float h = mix(amp * prof.x, amp * 0.2 + 0.025 + lumps * taper, hill.r);
  // The tilled ground runs under the turf at its edge, so a field has no rim.
  h += 0.03 - 0.22 * (1.0 - smoothstep(0.0, 0.7, rim)) * (1.0 - uCoarse);
  float slope = amp * (1.0 - hill.r) * prof.y / ${ROW.toFixed(4)};
  float q = abs(fr) * 2.0;
  float size = (0.22 + 0.78 * pow(h0.r, 0.75)) * mix(1.0, 0.6, hill.a) * step(0.004, h0.r);
  float droop = clamp(max(uCrop.x * 0.9, uCrop.y * 0.85), 0.0, 1.0) * (1.0 - h0.a);
  float top = size * 0.5 * mix(1.0, 0.36, h0.a) * (1.0 - 0.35 * droop);
  float wide = size * 0.92;
  float wheel = 1.0 - smoothstep(0.2, 0.45, abs(fract(f.y * ${(PLANTED_ROWS / TRAM).toFixed(4)}) - 0.5) * ${TRAM.toFixed(1)});
  float low = 0.52 * smoothstep(0.85, 1.0, wide) * (1.0 - wheel);
  float shape = q < 0.25 ? 1.0 : q < 0.75 ? clamp(wide * 1.5 - 0.5, low, 0.86) : low;
  vec2 d = abs(at.xz - uWin.zw) / uPool;
  float away = 1.0 - uNear * (1.0 - smoothstep(0.7, 1.0, max(d.x, d.y))) * (1.0 - smoothstep(uFadeR.x, uFadeR.y, distance(at, cameraPosition)));
  float lift = top * head * show * away * (1.0 - 0.6 * smoothstep(0.3, 1.0, uSnow));
  h += lift * shape;
  h += uOatsHere.x * 0.62 * taper * away * (1.0 - uCoarse) * (0.8 + 0.4 * textureLod(uNoise, at.xz * 0.21, 0.0).a);
  slope += q > 0.25 && q < 0.75 ? -sign(fr) * lift * (1.0 - low) * ${(0.7 / (ROW * 0.5)).toFixed(4)} : 0.0;
  return vec4(h, slope, mix(prof.x, 0.5, hill.r), lift * shape);
}
`

// Somebody else's ground: hay, pasture or last year's stubble, through the year. Moves with the wind where it stands tall.
export const OFF_GLSL = /* glsl */ `
// What offCover reads of the ground at p whatever grows there: the lie of the hay, the rushes, the gust and the width
// of a pixel. Apart from it, so that the land, which looks through every parcel for each point, reads them once and
// not once a parcel (a loop that reads a texture cannot be left early on every graphics system, and is then run whole).
vec4 offRead(vec2 p) {
  return vec4(texture2D(uNoise, vec2(p.x * 0.09 + p.y * 0.02, p.y * 0.6)).a, texture2D(uNoise, p * 0.31).b, gustAt(p) * min(uSway, 1.2), fwidth(p.y));
}
vec3 offCover(vec2 p, vec2 f, float kind, float broad, float fine, float grit, vec4 read, out float tall) {
  float d = uDay;
  float green = smoothstep(118.0, 150.0, d) * (1.0 - 0.55 * smoothstep(262.0, 300.0, d));
  vec3 live = uGrass * (0.78 + 0.44 * broad) * (0.86 + 0.28 * fine);
  vec3 dead = ${linear('#9c8a5e')} * (0.8 + 0.4 * broad) * (0.88 + 0.24 * fine);
  vec3 col;
  float gust = read.z;
  tall = 0.0;
  if (kind < 0.5) {
    // Hay: tall and streaked with the lie of the grass, seed heads buff in July, cut into windrows in early August.
    // The mower works across the piece over ten days in early August; the cut hay lies in windrows, then is gone.
    float mown = smoothstep(0.0, 0.05, (d - 212.0) / 10.0 - f.x + (broad - 0.5) * 0.12) * (1.0 - smoothstep(236.0, 252.0, d));
    float streak = read.x;
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
    float rush = smoothstep(0.72, 0.8, read.y);
    col = mix(col, live * vec3(0.52, 0.66, 0.42), rush * 0.7);
    float path = 1.0 - smoothstep(0.0, 0.18, abs(fract(p.x * 0.07 + 0.35 * sin(p.y * 0.21 + broad * 3.0)) - 0.5) - 0.02);
    col = mix(col, ${linear('#7f6a4f')} * (0.8 + 0.4 * fine), path * 0.45);
    tall = 0.25 * green;
    col *= 1.0 + 0.12 * gust * green;
  } else {
    // Stubble: last year's grain cut short in pale rows, the ground showing, weeds coming through by midsummer.
    float rows = 0.5 + 0.5 * cos(p.y * 6.2831853 / 0.19);
    float aa = smoothstep(0.3, 0.8, read.w / 0.19);
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

// The crop painted on the ground in its rows, under the plants and wherever they are not drawn. Every stripe is averaged
// over the pixel it falls in, and gives way to its mean as it nears the pixel's size, so nothing shimmers at any range.
const PAINT_GLSL = /* glsl */ `
float pulseI(float x, float d) { return floor(x) * d + min(fract(x), d); }
// A stripe that fills the first d of every unit of x, averaged over a footprint w wide.
float pulse(float x, float d, float w) { w = max(w, 1e-4); return (pulseI(x + 0.5 * w, d) - pulseI(x - 0.5 * w, d)) / w; }
vec4 paintCrop(vec2 f, vec4 h0, vec4 h1, float fine, float rowsPx, float rowFade, out float lift) {
  float grow = h0.r;
  lift = 0.0;
  if (grow < 0.004) return vec4(0.0);
  float rowP = f.y * ${PLANTED_ROWS}.0;
  float fr = abs(fract(rowP) - 0.5) * 2.0;
  float along = fract(f.x * ${PLANTS_PER_ROW}.0 + 0.5 * floor(rowP));
  float alongFade = smoothstep(0.3, 0.9, fwidth(f.x * ${PLANTS_PER_ROW}.0));
  float closed = smoothstep(0.35, 0.95, grow);
  float wide = mix(0.3 + 0.5 * pow(grow, 0.75), 1.15, closed) * (1.0 - 0.3 * h1.a);
  float duty = clamp(wide - 0.18 * (1.0 - closed) * abs(along - 0.5) * (1.0 - alongFade), 0.0, 1.0);
  // Looked at across its rows from low down, a crop hides its furrows behind its own height.
  vec3 vd = normalize(cameraPosition - vWorld);
  float lean = 0.5 * (0.22 + 0.78 * pow(grow, 0.75)) * smoothstep(0.05, 0.4, grow) * ${(1 / ROW).toFixed(4)} * abs(vd.z) / max(vd.y, 0.15);
  lean = min(1.0, lean) * rowFade;
  duty = clamp(duty + lean, 0.0, 1.0);
  float gone = smoothstep(0.85, 1.25, rowsPx);
  float cover = mix(pulse(rowP - 0.5 + 0.5 * duty, duty, rowsPx), duty, gone);
  // a planter's miss: a few yards of a row here and there with nothing up in it
  float rowI = floor(rowP);
  float miss = step(0.94, fract(sin(rowI * 91.3458) * 47453.5453)) * step(0.72, texture2D(uNoise, vec2(f.x * 23.0 + rowI * 0.137, rowI * 0.071)).a) * (1.0 - closed * 0.6);
  cover *= 1.0 - 0.9 * miss * (1.0 - smoothstep(0.12, 0.4, rowsPx));
  // The sprayer's wheelings: a bare furrow every so many rows, still a line when the rows have merged.
  float tramP = rowP / ${TRAM.toFixed(1)};
  cover *= 1.0 - 0.85 * pulse(tramP - 0.5 + ${(0.35 / TRAM).toFixed(4)}, ${(0.7 / TRAM).toFixed(4)}, fwidth(tramP));
  cover *= smoothstep(${HEAD[0].toFixed(1)}, ${HEAD[1].toFixed(1)}, min(f.x, 1.0 - f.x) * ${FW.toFixed(2)});
  vec3 col = leafTint(grow, h0.g, h1.a, uCrop.x);
  float bl = h0.b;
  col = mix(col, mix(${linear('#3d3024')}, ${linear('#1c1712')}, fine), smoothstep(0.0, 0.25, bl * 1.3 - fine));
  float frost = smoothstep(0.0, 0.25, uCrop.y * 1.25 - gLump);
  col = mix(col, ${linear('#2b2a26')}, frost * (1.0 - 0.75 * uCrop.z));
  col = mix(col, ${linear('#a8bcc0')}, 0.45 * uCrop.z);
  col = mix(col, ${linear('#b5a27a')}, h0.a);
  // the planter's passes: no four rows came up quite like the next four
  float bandP = rowP / 4.0, bandPx = rowsPx / 4.0;
  col *= 1.0 + (fract(sin(floor(bandP) * 78.233) * 43758.5453) - 0.5) * 0.24 * (1.0 - smoothstep(0.45, 0.9, bandPx));
  // where one pass of the planter met the next the gap is never quite a row: a line every fourth furrow, which is
  // still drawn when the rows themselves have run together
  cover *= 1.0 - 0.5 * pulse(bandP - 0.045, 0.09, bandPx) * (1.0 - closed * 0.5) * (1.0 - smoothstep(0.7, 1.3, bandPx));
  col *= 1.0 - 0.3 * pulse(bandP - 0.06, 0.12, bandPx) * (1.0 - smoothstep(0.7, 1.3, bandPx));
  // and past that the field keeps a grain along its rows
  float grain = texture2D(uNoise, vec2(f.x * 0.55, rowP * 0.043)).a * 0.6 + texture2D(uNoise, vec2(f.x * 0.3 + 0.31, rowP * 0.0117)).a * 0.4;
  col *= 0.74 + 0.52 * grain;
  // and the sprayer's bouts lie a little apart in tone
  col *= 1.0 + (fract(sin(floor(tramP + 0.5) * 37.719) * 43758.5453) - 0.5) * 0.1;
  // a rounded row: lit along its crown, dark down its sides into the furrow
  float furrow = mix(pulse(rowP - 0.16, 0.32, rowsPx), 0.32, gone);
  col *= mix(mix(0.26, 0.84, smoothstep(0.95, 0.25, fr)), 0.86 - 0.66 * furrow * (1.0 - 0.7 * lean), rowFade) * (0.86 + 0.28 * fine);
  // blossom: white flecks over the leaf, a haze of white from far off
  float open = uCrop.w * smoothstep(0.3, 0.55, grow) * (1.0 - h0.g) * (1.0 - bl) * (1.0 - h0.a) * (1.0 - frost);
  vec2 fc = f * vec2(${PLANTS_PER_ROW}.0 * 2.0, ${PLANTED_ROWS}.0 * 2.0);
  float fleck = step(1.0 - 0.5 * open, fract(sin(dot(floor(fc), vec2(12.9898, 78.233))) * 43758.5453)) * (1.0 - smoothstep(0.2, 0.34, length(fract(fc) - 0.5)));
  // from above a field in flower is paler than one that is not, and paler in drifts
  fleck *= mix(1.0 - smoothstep(0.2, 0.5, fr), 1.0, rowFade);
  fleck = mix(fleck, 0.24 * open * (0.4 + 1.2 * fine), smoothstep(0.35, 1.0, max(fwidth(fc.x), fwidth(fc.y))));
  col = mix(col, mix(${linear('#f8f5fa')}, ${linear('#d3c2e6')}, uTint) * 1.25, fleck * cover);
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
  win: { value: Vector4 }
  oatWin: { value: Vector4 }
  off: { value: number }
  avail: { value: number }
  paint: { value: number }
  under: { value: number }
  nearU: { value: number }
  coarse: { value: number }
  ranges: { fine: [number, number]; coarse: [number, number] }
  rimeHere: { value: number }
  tract: { value: Vector4 }
  ground: { value: Vector4 }
  open: { value: number }
  bounds: Sphere
  soil: Mesh
  plants: Mesh
  plantMat: Material
  plantWhole: Material | null
  wholeMat: () => Material
  plantCount: Material | null
  countMat: () => Material
  blossoms: Mesh
  oatMesh: Mesh | null
  ring: Mark
  pulse: Mark
  stake: Mark
  pulseT: number
  selT: number
  near: boolean
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
  private tractTarget: Vector4[] = []
  private groundTarget: Vector4[] = []
  private heldTarget = new Float32Array(FIELD_COUNT)
  private bare: boolean[] = new Array(FIELD_COUNT).fill(false)
  private cropTarget: Vector4[] = []
  private rest: boolean[] = new Array(FIELD_COUNT).fill(false)
  private availNow: boolean[] = new Array(FIELD_COUNT).fill(false)
  // In spring, a tract of the farm's still to clear: its bounds are drawn, as a lot there is work to do on.
  private lotNow: boolean[] = new Array(FIELD_COUNT).fill(false)
  private settled = false
  private disposables: { dispose(): void }[] = []
  private plantGeo: BufferGeometry
  private bloomGeo: BufferGeometry
  private oatGeo: BufferGeometry
  private plantPool: InstancedBufferGeometry
  private bloomPool: InstancedBufferGeometry
  private oatPool: InstancedBufferGeometry
  private slope: DataTexture
  private pool = { value: new Vector2(POOL.high.x, POOL.high.z) }
  private fadeR = { value: new Vector2(1e5, 2e5) }
  private reach = POOL.high.reach
  private centre = new Vector3()
  private ahead = new Vector3()
  private windowOn = false
  private camAt = new Vector3()
  // The savings in the whole plants a tool may switch off (1 on): thinned with distance, half the leaves far off, the
  // window drawn in sooner in a level view.
  private spare = { value: new Vector3(1, 1, 1) }
  private trial = { value: new Vector2(1, 0) }
  private flatAt = FLAT_AT.high
  private flags: InstancedMesh
  private flagged = ''
  private leafTex: Texture
  private flowerTex: Texture
  private stakes: InstancedMesh
  private stakeWide = 1
  private frustum = new Frustum()
  private pm = new Matrix4()
  private near = new Vector3()
  // Plants throw shadows into the second cascade only while the first does not already hold them.
  farShadows = true
  // Whether each parcel is tilled ground of the farm's, as drawn now (eased), for the land round it; and whether it is
  // somebody else's hay or pasture, and marked out to be had.
  readonly held: number[] = new Array(FIELD_COUNT).fill(1)
  readonly off: number[] = new Array(FIELD_COUNT).fill(0)
  readonly avail: number[] = new Array(FIELD_COUNT).fill(0)

  constructor(leafTex: Texture, flowerTex: Texture) {
    this.leafTex = leafTex
    this.flowerTex = flowerTex
    this.plantGeo = plantGeometry()
    this.bloomGeo = blossomGeometry()
    this.oatGeo = oatGeometry()
    this.slope = new DataTexture(SLOPE_TABLE.data, SLOPE_TABLE.n, 1, RedFormat, FloatType)
    this.slope.magFilter = this.slope.minFilter = NearestFilter
    this.slope.needsUpdate = true
    const pooled = (src: BufferGeometry): InstancedBufferGeometry => {
      const g = new InstancedBufferGeometry()
      g.index = src.index
      for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.attributes[name])
      g.instanceCount = 0
      return g
    }
    this.plantPool = pooled(this.plantGeo)
    this.bloomPool = pooled(this.bloomGeo)
    this.oatPool = pooled(this.oatGeo)
    this.disposables.push(this.plantGeo, this.bloomGeo, this.oatGeo, this.plantPool, this.bloomPool, this.oatPool, this.slope)
    this.sizePools('high')
    for (let i = 0; i < FIELD_COUNT; i++) this.build(i)
    this.stakes = this.buildStakes()
    this.flags = this.buildFlags()
  }

  private build(i: number): void {
    const f = FIELDS[i]
    const d0 = new Uint8Array(HILLS * 4), d1 = new Uint8Array(HILLS * 4)
    const tex = (d: Uint8Array) => {
      const t = new DataTexture(d, COLS, ROWS, RGBAFormat)
      t.magFilter = t.minFilter = LinearFilter
      t.needsUpdate = true
      this.disposables.push(t)
      return t
    }
    const t0 = tex(d0), t1 = tex(d1)
    const crop = new Vector4(), soilColor = new Color(SOIL.good)
    const water = { value: 0 }, damp = { value: 0.3 }, cover = { value: 0 }, tint = { value: 0.2 }
    const win = { value: new Vector4() }, oatWin = { value: new Vector4() }
    const off = { value: 0 }, paint = { value: 0 }, under = { value: 0 }, nearU = { value: 0 }, coarse = { value: 0 }, rimeHere = { value: 0 }, avail = { value: 0 }, open = { value: 1 }
    const shy = { value: PARCELS[i].block === 'home' && f.z0 < -10 * K ? 1 : 0 }
    const tract = { value: new Vector4() }, ground = { value: new Vector4(PARCELS[i].stones, 0, 0, 0) }
    // A stand is felled from the side toward the farm; the swale from the road.
    const fell = { value: PARCELS[i].cover === 'brush' ? new Vector3(1, 0, 0) : new Vector3(0, -1, 1) }
    const oats = { value: new Vector3(0, 0, 0) }
    const rect = { value: new Vector4(f.x0, f.z0, 1 / FW, 1 / FD) }
    const shared = { uSpare: this.spare, uTrial: this.trial, uT0: { value: t0 }, uT1: { value: t1 }, uRect: rect, uCrop: { value: crop }, uOpen: open, uWin: win, uPool: this.pool, uFadeR: this.fadeR, uSlope: { value: this.slope }, uSeed: { value: i * 17.3 } }
    const bounds = new Sphere(new Vector3(f.cx, fieldBaseY(f.cz) + 0.3, f.cz), Math.hypot(FW, FD) / 2 + 2)

    // ---- soil
    // the rows run straight along the field: four points to a row across them, one every few metres along
    const nx = COLS * 4, nz = PLANTED_ROWS * 4
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), fuv = new Float32Array((nx + 1) * (nz + 1) * 2)
    for (let j = 0; j <= nz; j++) {
      for (let k = 0; k <= nx; k++) {
        const u = k / nx, v = j / nz, o = j * (nx + 1) + k
        const z = f.z0 + v * FD
        pos.set([f.x0 + u * FW, fieldBaseY(z), z], o * 3)
        fuv.set([u, v], o * 2)
      }
    }
    // and the same ground in a few broad faces, for when the rows are too fine to have a shape on the screen
    const cz: number[] = []
    for (let j = 0; j < nz; j += 16) cz.push(j)
    cz.push(nz)
    const idx = new Uint32Array(nx * nz * 6 + (cz.length - 1) * 4 * 6)
    let n = 0
    for (let j = 0; j < nz; j++) {
      for (let k = 0; k < nx; k++) {
        const a = j * (nx + 1) + k, b = a + 1, c = a + nx + 1, d = c + 1
        idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d
      }
    }
    const fineN = n
    for (let j = 0; j < cz.length - 1; j++) {
      for (let k = 0; k < 4; k++) {
        const k0 = Math.round((k * nx) / 4), k1 = Math.round(((k + 1) * nx) / 4)
        const a = cz[j] * (nx + 1) + k0, b = cz[j] * (nx + 1) + k1, c = cz[j + 1] * (nx + 1) + k0, d = cz[j + 1] * (nx + 1) + k1
        idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d
      }
    }
    const ranges = { fine: [0, fineN] as [number, number], coarse: [fineN, n - fineN] as [number, number] }
    const soilGeo = new BufferGeometry()
    soilGeo.setAttribute('position', new BufferAttribute(pos, 3))
    soilGeo.setAttribute('aF', new BufferAttribute(fuv, 2))
    soilGeo.setIndex(new BufferAttribute(idx, 1))
    soilGeo.setDrawRange(0, fineN)
    soilGeo.computeVertexNormals()
    soilGeo.boundingSphere = bounds
    const soilShape: Patch = {
      key: 'county-soil',
      uniforms: {
        uT0: { value: t0 }, uT1: { value: t1 }, uSoil: { value: soilColor }, uWater: water, uDamp: damp, uCover: cover, uOff: off,
        uOffKind: { value: OFF_KIND[i] ?? 0 }, uPaint: paint, uUnder: under, uCrop: { value: crop }, uTint: tint, uOatsHere: oats, uRimeHere: rimeHere, uAvail: avail,
        uTract: tract, uGround: ground, uFell: fell, uShy: shy, uWin: win, uPool: this.pool, uFadeR: this.fadeR, uNear: nearU, uPix: PIXEL, uCoarse: coarse,
      },
      vertexHead: `${ROW_FN}\nuniform float uOff;\nuniform float uPaint;`,
      vertexNormal: `gShape = soilShape(aF, position, gH0, gH1); objectNormal = normalize(vec3(0.0, 1.0, ${SLOPE.toFixed(4)} - gShape.y * (1.0 - uOff)));`,
      vertexBegin: /* glsl */ `
        vec4 hillB = gH1;
        vec4 shB = gShape;
        transformed.y += mix(shB.x, 0.03 - 0.22 * (1.0 - uCoarse) * (1.0 - smoothstep(0.0, 0.7, min(min(aF.x, 1.0 - aF.x) * ${FW.toFixed(2)}, min(aF.y, 1.0 - aF.y) * ${FD.toFixed(2)}))), uOff);
        vF = aF;
        vProf = shB.z;
        vRidged = smoothstep(0.08, 0.55, smoothstep(0.0, 0.05, hillB.b) * (0.4 + 0.6 * hillB.b)) * (1.0 - hillB.r) * (1.0 - uOff);
        vDrill = step(0.02, hillB.b) * (1.0 - hillB.r) * (1.0 - smoothstep(0.08, 0.4, hillB.b)) * (1.0 - uOff);
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
        uniform float uShy;
        uniform float uUnder;      // the crop's rows painted under plants drawn at middle distance, so what shows between their leaves is the row
        uniform vec4 uCrop;
        uniform float uTint;
        uniform vec3 uOatsHere;
        uniform float uRimeHere;
        uniform float uAvail;
        uniform vec4 uTract;       // a tract being cleared: how much of this look shows, share felled, share torn up by the bulldozer, 1 for brush
        uniform vec4 uGround;      // stones, share of the tile laid while the trenches stand open, 1 once tiled, 1 for raw new ground
        uniform vec3 uFell;
        varying vec2 vF;
        varying float vProf;
        varying float vRidged;
        varying float vDrill;
        float poolF;
        float poolOpen;
        float soilRough;
        vec2 soilBump;
        ${HILL_FN}
        ${LEAF_TINT}
        ${OFF_GLSL}
        ${PAINT_GLSL}
        ${GROUND_SNOW}
      `,
      fragmentColor: /* glsl */ `
        {
          vec2 sw = vWorld.xz / ${S.toFixed(2)};
          vec4 over, hill;
          hillAt(vF, vWorld.xz, over, hill);
          float rowP = vF.y * ${PLANTED_ROWS}.0;
          float rowsPx = length(vec2(dFdx(rowP), dFdy(rowP)));
          float rowFade = smoothstep(0.2, 0.5, rowsPx);
          // The lie of the ground: low places hold water and grow rank; knolls dry first and grow thin.
          float lowK = smoothstep(0.42, 0.7, texture2D(uNoise, sw * 0.019 + 0.57).b * 0.75 + texture2D(uNoise, sw * 0.0071 + 0.2).b * 0.25);
          float knollK = 1.0 - smoothstep(0.3, 0.5, texture2D(uNoise, sw * 0.019 + 0.57).b * 0.75 + texture2D(uNoise, sw * 0.0071 + 0.2).b * 0.25);
          float dampK = max(uDamp, uWet);
          float headX = min(vF.x, 1.0 - vF.x) * ${FW.toFixed(2)};
          vec4 n1 = texture2D(uNoise, sw * 0.05), n2 = texture2D(uNoise, sw * 0.47), n3 = texture2D(uNoise, sw * 1.9);
          float broad = n1.b, fine = n2.a, grit = n3.a;
          vec3 soil = uSoil * (0.8 + 0.4 * broad) * (0.84 + 0.32 * fine) * (0.92 + 0.16 * grit);
          soil *= (1.0 - (0.2 + 0.3 * dampK) * lowK) * (1.0 + (0.26 - 0.14 * dampK) * knollK);
          {
            // Worked ground before the planter: the harrow's bouts lying a little apart in tone, its tines' scratches
            // close to, clods. After it: ridges, their crests drying pale and their furrows dark, darker the lower the
            // sun stands across them.
            float bare = (1.0 - smoothstep(0.0, 0.06, hill.b)) * (1.0 - hill.r) * (1.0 - uOff);
            float hq = (vWorld.x * 0.83 + vWorld.z * 0.56), boutP = hq / 3.6, boutPx = length(vec2(dFdx(boutP), dFdy(boutP)));
            float bout = fract(sin(floor(boutP) * 53.17) * 43758.5453) - 0.5;
            float lap = pulse(boutP - 0.05, 0.1, boutPx);
            soil *= 1.0 + bare * (0.3 * bout - 0.2 * lap) * (1.0 - smoothstep(0.5, 1.0, boutPx));
            soil *= 1.0 + bare * 0.3 * (texture2D(uNoise, vWorld.xz * 0.11).a - 0.5);
            float tine = 0.5 + 0.5 * cos(hq * 6.2831853 / 0.24);
            soil *= 1.0 + bare * 0.12 * (tine - 0.5) * (1.0 - smoothstep(0.15, 0.4, fwidth(hq) / 0.24));
            soil *= 1.0 + bare * (0.1 * (texture2D(uNoise, vec2(hq * 0.02, (vWorld.z * 0.83 - vWorld.x * 0.56) * 0.004)).a - 0.5) + 0.06);
            float ridged = smoothstep(0.01, 0.08, hill.b) * (1.0 - hill.r) * (1.0 - uOff) * step(over.r, 0.3);
            float low = clamp(abs(uSunDir.z) / max(uSunDir.y, 0.08) * 0.22, 0.0, 1.0);
            float crest = mix(pulse(rowP - 0.25, 0.5, rowsPx), 0.5, smoothstep(0.85, 1.25, rowsPx));
            // (drawn wherever the ridges themselves are too fine to stand in the ground)
            float drawn = smoothstep(0.067, 0.143, rowsPx);
            soil *= 1.0 + ridged * drawn * ((crest - 0.5) * (0.62 + 0.5 * low) - 0.12 - 0.16 * low);
            soil *= 1.0 - 0.14 * ridged;
            // bare ground dries pale and flat
            soil = mix(soil, soil * 1.22 + vec3(0.02, 0.016, 0.012), bare * (1.0 - dampK) * 0.7);
            float passP = rowP / 4.0, passPx = rowsPx / 4.0;
            soil *= 1.0 + ridged * ((fract(sin(floor(passP) * 78.233) * 43758.5453) - 0.5) * 0.3 - 0.4 * pulse(passP - 0.06, 0.12, passPx)) * (1.0 - smoothstep(0.6, 1.2, passPx));
            soil *= 1.0 + ridged * 0.2 * (texture2D(uNoise, vec2(vF.x * 1.7, rowP * 0.043)).a - 0.5);
          }
          // Crests dry pale; furrows hold the damp. Where seed was dropped the drill line is fresh dark earth.
          soil *= mix(1.0, mix(0.74, 1.14, vProf), vRidged * (1.0 - rowFade));
          soil *= 1.0 - 0.24 * vDrill * mix(smoothstep(0.8, 0.97, vProf), 0.3, rowFade);
          // The headland: packed pale by the wheels that turn on it, their ruts running across the rows' ends.
          float headS = (1.0 - smoothstep(${HEAD[0].toFixed(1)}, ${HEAD[1].toFixed(1)}, headX)) * smoothstep(0.02, 0.1, hill.b) * (1.0 - uOff);
          float rut = (1.0 - smoothstep(0.1, 0.32, abs(headX - 1.3))) + (1.0 - smoothstep(0.1, 0.32, abs(headX - 3.1)));
          soil = mix(soil, uSoil * (1.0 + 0.2 * fine) * (1.0 - 0.34 * min(1.0, rut)), headS * 0.8);
          // Dug ground: dark and cloddy, each pass of the digger a strip of its own.
          float stripP = vF.y * ${(PLANTED_ROWS / 2).toFixed(1)};
          vec3 turned = uSoil * mix(0.46, 0.9, smoothstep(0.3, 0.75, fine)) * (0.88 + 0.24 * grit);
          turned *= 1.0 + (fract(sin(floor(stripP) * 12.9898) * 43758.5453) - 0.5) * 0.3 * (1.0 - smoothstep(0.3, 0.7, fwidth(stripP)));
          soil = mix(soil, turned, hill.r);
          soil = mix(soil, turned * 0.7, hill.g);
          // Under a closed canopy the ground gets what light the leaves let through.
          float shaded = smoothstep(0.4, 0.95, over.r) * (1.0 - over.a) * (1.0 - hill.r);
          float paintK = max(uPaint, uUnder);
          soil *= 1.0 - 0.5 * smoothstep(0.25, 0.7, over.r) * (1.0 - 0.5 * over.a);
          soil = mix(soil, vec3(0.13, 0.1, 0.075) * (0.6 + 0.9 * grit), gSick * (1.0 - smoothstep(0.1, 0.5, over.r)) * 0.7 * step(0.02, hill.b) * (1.0 - hill.r));
          soil *= mix(vec3(1.0), vec3(0.34, 0.5, 0.3), shaded * (1.0 - paintK));
          poolOpen = 1.0 - 0.35 * shaded;
          float cov = uCover * smoothstep(0.2, 0.5, broad * 0.6 + 0.42 * uCover + 0.2 * fine);
          vec3 clover = uGrass * vec3(0.6, 0.98, 0.58) * (0.66 + 0.68 * fine);
          clover = mix(clover, vec3(0.74, 0.62, 0.7), step(0.8, grit) * step(0.55, fine) * 0.55 * uLeaf);
          soil = mix(soil, clover, cov);
          // New ground lies pale and cloddy; stones show on every field by how stony it is.
          soil = mix(soil, mix(soil, ${linear('#9d7856')}, 0.55) * (0.84 + 0.32 * step(0.55, grit)), uGround.w * (1.0 - cov));
          float stone = smoothstep(0.84 - 0.16 * uGround.x, 0.9 - 0.16 * uGround.x, n3.a * 0.7 + fine * 0.3) * min(1.0, uGround.x * 1.6);
          soil = mix(soil, vec3(0.42, 0.41, 0.38) * (0.7 + 0.6 * broad), stone * 0.8 * (1.0 - shaded) * (1.0 - cov));
          // New ground: the bulldozer's passes in buff subsoil and dark topsoil, and the field stone it turned up lying
          // on it in drifts, pale enough to be counted from across the farm.
          if (uGround.w > 0.001) {
            float pass = 0.5 + 0.5 * cos((vWorld.x + vWorld.z * 0.35) * 6.2831853 / 3.4 + (broad - 0.5) * 5.0);
            float passK = 1.0 - smoothstep(0.25, 0.7, fwidth(vWorld.x) / 3.4);
            vec3 sub = mix(${linear('#b08a5c')}, ${linear('#6e4a36')}, smoothstep(0.35, 0.65, texture2D(uNoise, sw * 0.019 + 0.3).b + (pass - 0.5) * 0.3 * passK));
            soil = mix(soil, sub * (0.84 + 0.3 * fine), uGround.w * 0.7 * (1.0 - cov));
            vec2 sc = vWorld.xz / 1.3, si = floor(sc);
            float sh = fract(sin(dot(si, vec2(12.9898, 78.233))) * 43758.5453), sr = 0.16 + 0.22 * fract(sh * 17.3);
            float drift = smoothstep(0.3, 0.7, texture2D(uNoise, sw * 0.033 + 0.6).b);
            float share = uGround.x * (0.25 + 0.75 * drift);
            float rock = step(sh, share) * (1.0 - smoothstep(sr * 0.7, sr, length(fract(sc) - 0.5 - (vec2(fract(sh * 7.1), fract(sh * 3.7)) - 0.5) * 0.3)));
            rock = mix(rock, share * 0.22, smoothstep(0.3, 0.9, fwidth(sc.x)));
            soil = mix(soil, vec3(0.6, 0.59, 0.55) * (0.8 + 0.4 * fine), rock * uGround.w * (1.0 - cov));
          }
          // Tile: the trenches stand open down the fall while they are laid; afterwards the ground over each drain dries first.
          float lat = abs(fract(sw.x / 2.6 + 0.5) - 0.5) * 2.6;
          if (uGround.y > 0.001) {
            float laid = 1.0 - smoothstep(uGround.y - 0.01, uGround.y + 0.01, vF.x);
            soil = mix(soil, ${linear('#9c7c58')} * (0.8 + 0.4 * fine), (1.0 - smoothstep(0.14, 0.5, lat + (fine - 0.5) * 0.2)) * laid * 0.8);
            soil = mix(soil, ${linear('#241812')}, (1.0 - smoothstep(0.05, 0.13, lat)) * laid);
          }
          soil *= 1.0 + uGround.z * smoothstep(0.3, 0.7, max(uDamp, uWet)) * (0.06 + 0.4 * (1.0 - smoothstep(0.1, 1.0, lat + (fine - 0.5) * 0.5)));
          float lowG = broad * 0.6 + 0.4 * texture2D(uNoise, sw * 0.017).b;
          poolF = uWater * (1.0 - uGround.z) * mix(0.8 * smoothstep(0.74, 0.82, lowG), (1.0 - smoothstep(0.12, 0.5, vProf)) * smoothstep(0.34, 0.5, lowG), vRidged * (1.0 - rowFade));
          // Rain: bare soil goes near black and shines a little; water stands only in the lowest places.
          float rainK = smoothstep(0.3, 0.8, uWet) * (1.0 - uOff) * (1.0 - cov) * (1.0 - smoothstep(0.2, 0.6, over.r));
          poolF = max(poolF, rainK * 0.85 * smoothstep(0.88, 0.98, lowK + 0.06 * (fine - 0.5)) * mix(1.0, 1.0 - smoothstep(0.12, 0.5, vProf), vRidged * (1.0 - rowFade)));
          soil *= 1.0 - 0.45 * rainK;
          soilRough = mix(mix(mix(0.96, 0.66, uDamp), 0.5, rainK), 0.04, poolF);
          // Far off, the crop and the rest-year oats are painted where plants would stand.
          if (paintK > 0.001) {
            float lift;
            vec4 crop = paintCrop(vF, over, hill, fine, rowsPx, rowFade, lift);
            // rank and dark in the low places, thin and pale on the knolls; held back where the woods shade it
            crop.rgb *= (1.0 - 0.3 * lowK) * (1.0 + 0.3 * knollK) * mix(1.0, 1.4, smoothstep(0.3, 0.9, rowsPx));
            crop.rgb = mix(crop.rgb, crop.rgb * vec3(1.1, 1.06, 0.72), 0.5 * knollK);
            // from far off a crop is its green: the shade between its leaves is not seen
            crop.rgb = mix(crop.rgb, crop.rgb * vec3(0.86, 1.14, 0.8), smoothstep(0.3, 0.9, rowsPx) * (1.0 - over.a) * (1.0 - over.g));
            crop.a *= 1.0 - 0.3 * knollK * (1.0 - smoothstep(0.5, 0.9, over.r));
            float shy = uShy * (1.0 - smoothstep(0.03, 0.2, vF.y + (broad - 0.5) * 0.08));
            crop.rgb = mix(crop.rgb, crop.rgb * vec3(1.12, 1.1, 0.8), 0.6 * shy);
            crop.a *= 1.0 - 0.35 * shy;
            // close to, the row is leaves: light on some, the dark between
            float leafy = texture2D(uNoise, vWorld.xz * 2.9).a;
            crop.rgb *= mix(1.0, 0.5 + 0.95 * leafy, 1.0 - smoothstep(0.02, 0.12, rowsPx));
            // leaf by leaf close to, the lie of the land's fertility from far off, and the wind laying the canopy over
            crop.rgb *= 0.72 * (0.82 + 0.3 * broad) * (0.6 + 0.5 * n3.a) * (1.0 + 0.22 * gustAt(vWorld.xz) * min(uSway, 1.2) * smoothstep(0.4, 0.9, over.r) * (1.0 - over.a));
            soil = mix(soil, crop.rgb, crop.a * paintK);
            float boutP = vF.y * ${(FD / 3.6).toFixed(2)};
            vec3 oat = mix(${linear('#86ac6c')}, ${linear('#d2b76c')}, uOatsHere.y * (0.75 + 0.5 * broad)) * (1.02 + 0.36 * fine) * (0.8 + 0.4 * n3.a);
            // close to, it is stems and the dark between them
            oat *= mix(0.62 + 0.5 * texture2D(uNoise, vWorld.xz * vec2(3.7, 1.1)).a, 1.0, smoothstep(0.03, 0.2, rowsPx)) * (1.0 - 0.14 * lowK + 0.12 * knollK);
            oat *= 1.0 + (fract(sin(floor(boutP) * 91.17) * 43758.5453) - 0.5) * 0.24 * (1.0 - smoothstep(0.25, 0.6, fwidth(boutP)));
            oat *= 1.0 + 0.3 * gustAt(vWorld.xz) * min(uSway, 1.2);
            // lodged where a storm laid it down
            oat = mix(oat, oat * vec3(1.12, 1.08, 0.9), smoothstep(0.62, 0.7, texture2D(uNoise, sw * 0.011 + 0.3).b) * uOatsHere.y);
            soil = mix(soil, oat, uOatsHere.x * smoothstep(0.1, 0.6, uOatsHere.x) * 0.85 * uPaint);
            poolF *= 1.0 - crop.a * paintK;
            soilRough = mix(soilRough, 0.8, crop.a * paintK);
          }
          if (uOff > 0.001) {
            float tall;
            vec3 meadow = offCover(sw, vF, uOffKind, broad, fine, grit, offRead(sw), tall);
            // Land to be had stands a little paler and warmer than the land round it.
            meadow = mix(meadow, meadow * vec3(1.16, 1.12, 0.96) + vec3(0.025, 0.02, 0.0), uAvail * 0.8);
            soil = mix(soil, meadow, uOff);
            poolF *= 1.0 - uOff;
            soilRough = mix(soilRough, 0.9, uOff);
          }
          if (uTract.x > 0.001) {
            // Under the trees: needle duff, or the wet sod of the swale. Where they have been felled: scuffed duff, chips
            // and sawdust, skid trails, green coming. Where the bulldozer has been: torn subsoil in its cleat marks.
            float u = dot(vF, uFell.xy) + uFell.z + (broad - 0.5) * 0.12 + (fine - 0.5) * 0.05;
            vec3 duff = mix(${linear('#3b3125')} * (0.7 + 0.6 * fine), uGrass * vec3(0.5, 0.66, 0.42) * (0.7 + 0.6 * fine), uTract.w);
            vec3 cut = mix(${linear('#6f5a44')}, ${linear('#927a5a')}, fine) * (0.78 + 0.44 * broad);
            cut = mix(cut, ${linear('#d2bd92')}, step(0.74, grit) * step(0.4, fine) * 0.7);
            float trail = 1.0 - smoothstep(0.05, 0.3, abs(fract(sw.x * 0.21 + 0.25 * sin(sw.y * 0.5)) - 0.5));
            cut = mix(cut, ${linear('#4b3a2b')} * (0.8 + 0.4 * fine), trail * 0.55);
            cut = mix(cut, uGrass * vec3(0.8, 0.95, 0.6), smoothstep(0.55, 0.8, texture2D(uNoise, sw * 0.13).b) * 0.45 * uLeaf);
            cut = mix(cut, uGrass * vec3(0.62, 0.74, 0.5) * (0.7 + 0.6 * fine), uTract.w * 0.5);
            vec3 look = mix(duff, cut, 1.0 - smoothstep(uTract.y - 0.03, uTract.y + 0.03, u + 0.03 - 0.06 * step(0.999, uTract.y)));
            float cleat = 0.5 + 0.5 * cos(sw.y * 6.2831853 / 0.42 + 2.0 * sin(sw.x * 0.7));
            vec3 torn = mix(${linear('#96744e')}, ${linear('#6b4a36')}, smoothstep(0.3, 0.7, fine + (broad - 0.5) * 0.6)) * (0.74 + 0.3 * cleat) * mix(1.0, 0.66, uWet);
            look = mix(look, torn, (1.0 - smoothstep(uTract.z - 0.03, uTract.z + 0.03, u + 0.03)) * step(0.001, uTract.z));
            soil = mix(soil, look, uTract.x);
            poolF *= 1.0 - uTract.x;
            soilRough = mix(soilRough, 0.95, uTract.x);
          }
          soil = mix(soil, vec3(0.018, 0.02, 0.018), poolF * 0.92);
          soilBump = ((n2.rg - 0.5) * 1.2 + (n3.rg - 0.5)) * (1.0 - poolF) * (1.0 - 0.5 * cov);
          {
            // Snow lies first in the furrows, so thin snow draws every ridge; stubble and dead vine stand out of it;
            // deep snow buries the lot, and keeps only the faintest ribbing where the rows are.
            float ridgeK = smoothstep(0.02, 0.3, hill.b) * (1.0 - hill.r) * (1.0 - uOff);
            float crestS = mix(pulse(rowP - 0.25, 0.5, rowsPx), 0.5, smoothstep(0.85, 1.25, rowsPx));
            float holdS = 0.5 * lowK - 0.3 * knollK + ridgeK * (0.5 - 1.1 * crestS) + 0.3 * uOff;
            float pokeS = max(max(0.7 * over.a, 0.5 * over.r), max(0.55 * cov, 0.3 * uOff)) + 0.5 * ridgeK * crestS;
            float snowK;
            vec2 sb = soilBump * 0.55;
            soil = groundSnow(soil, vWorld.xz, clamp(vWNormal.y, 0.0, 1.0), uSnow, holdS, pokeS, soilRough, sb, snowK);
            soilBump = sb / 0.55;
            soil *= 1.0 + snowK * ridgeK * 0.1 * (crestS - 0.5);
            poolF *= 1.0 - snowK;
          }
          diffuseColor.rgb = soil;
        }
        ${snowRimeAt('0.0', 'uRimeHere')}
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
    this.group.add(soil)
    this.disposables.push(soilGeo, soilMat)

    // ---- plants, from the pool
    const leafShape = (uniforms: Patch['uniforms']): Patch => ({
      key: 'county-plant',
      uniforms,
      vertexHead: `${PLANT_FN}\n${LEAF_TINT}\nattribute vec3 aLeaf;\nvarying vec3 vTint;\nvarying float vErode;\nvarying float vKeep;`,
      vertexNormal: /* glsl */ `
        gp = plantAt();
        objectNormal = normalize(vec3(gp.cs * objectNormal.x + gp.sn * objectNormal.z, objectNormal.y + 0.3 * gp.droop, -gp.sn * objectNormal.x + gp.cs * objectNormal.z));
      `,
      vertexBegin: LEAF_SHAPE + LEAF_COLOUR,
      vertexWorld: `${sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '0.55 * uOpen * (1.0 - 0.6 * uCrop.x) * (1.0 - 0.8 * gp.dead)')}
        cWorld.y += sin(uTime * 6.3 + aLeaf.x * 40.0 + aAt.w * 23.0) * 0.012 * aLeaf.y * aLeaf.z * min(uSway, 1.0) * (1.0 - gp.dead);`,
    })
    // A leaf is lit at its corners (see the patch): level across a crop a pixel has a dozen leaves behind one
    // another, every one of them lit before the nearest is known, and lit in full they were the whole cost of
    // coming close. (`whole`: lit at every pixel as before, for the tool that measures the one against the other.)
    const leafMat = (shape: Patch, whole = false) => patch(new MeshStandardMaterial({ map: this.leafTex, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide, roughness: 0.82, metalness: 0 }), {
      ...shape,
      corners: !whole,
      cornersIf: 'slotIn > 0.0',
      translucent: 1.25,
      ambient: 1.0,
      shine: 0.2,
      fragmentHead: 'varying vec3 vTint;\nvarying float vErode;\nvarying float vKeep;',
      fragmentColor: `diffuseColor.rgb *= vTint; float cg = coverGain(vMapUv, 256.0); diffuseColor.a *= cg * (1.0 - (1.0 - vKeep) * smoothstep(1.2, 1.9, cg)) * (1.0 - vErode * (0.25 + 0.75 * texture2D(uNoise, vMapUv * 1.7).a)); ${SNOW_RIME}`,
    })
    const nearShape = leafShape(shared)
    const plantMat = leafMat(nearShape)
    // (They throw no shadow of their own: the sun's pass took its distances from the sun's side and drew every plant
    // at no size, a quarter of a million triangles into the fine map each time for nothing. It is not run.)
    const plants = new Mesh(this.plantPool, plantMat)
    plants.receiveShadow = true
    plants.frustumCulled = false
    plants.visible = false
    this.group.add(plants)
    this.disposables.push(plantMat)

    // ---- blossom
    const bloomMat = patch(new MeshStandardMaterial({ map: this.flowerTex, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide, roughness: 0.7, metalness: 0 }), {
      key: 'county-blossom',
      uniforms: { ...shared, uTint: tint, uPix: PIXEL },
      translucent: 0.2,
      through: [1, 0.97, 0.9],
      ambient: 0.9,
      blade: true,
      vertexHead: `${PLANT_FN}\nattribute vec4 aFlower;\nuniform float uTint;\nuniform float uPix;\nvarying vec3 vTint;\nfloat showF;`,
      // A flower is open to the sky and to whoever looks at it.
      vertexNormal: 'gp = plantAt();\nobjectNormal = normalize(vec3(0.0, 1.0, 0.0) + normalize(cameraPosition - aAt.xyz));',
      vertexBegin: /* glsl */ `
        vec3 pl = position;
        pl.y -= 0.1 * gp.droop;
        transformed = plantPlace(pl);
        float open = uCrop.w * smoothstep(0.3, 0.55, gp.h0.r) * (1.0 - gp.h0.g) * (1.0 - gp.h0.b) * (1.0 - gp.dead)
          * (1.0 - min(1.0, uCrop.y * 1.5)) * (1.0 - 0.7 * gp.h1.a) * (1.0 - 0.6 * uCrop.x);
        // Not every plant is in flower at once: more of them at the height of the bloom.
        // (a plant that stands for its neighbours carries their flowers too)
        showF = step(aFlower.z, open * gp.stands) * step(gp.r.x, (0.4 + 0.5 * uCrop.w) * gp.stands) * step(0.3, slotIn) * step(${HEAD[1].toFixed(1)}, min(aAt.x - uRect.x, uRect.x + ${FW.toFixed(2)} - aAt.x));
        vTint = mix(${linear('#f8f5fa')}, ${linear('#d3c2e6')}, uTint * (0.4 + 0.6 * aFlower.w)) * 0.92;
      `,
      vertexWorld: /* glsl */ `
        ${sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '0.55')}
        {
          // Far off a flower is drawn no smaller than a pixel, and fewer are drawn, so the field keeps its share of white.
          // uShare: how many plants each drawn one stands for.
          float fbase = 0.05 + 0.02 * aFlower.w, fsize = max(fbase, length(cWorld.xyz - cameraPosition) * uPix * 1.5);
          float fkeep = clamp(fbase * fbase / (fsize * fsize) * 1.3, 0.012, 1.0);
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
    const blossoms = new Mesh(this.bloomPool, bloomMat)
    blossoms.receiveShadow = true
    blossoms.frustumCulled = false
    blossoms.visible = false
    this.group.add(blossoms)
    this.disposables.push(bloomMat)

    // ---- marks on the ground: the selection, the ring that answers an order, and the stakes of land to be had
    const ringGeo = ringGeometry(i)
    const wooded = PARCELS[i].cover !== 'open'
    const ring = this.mark(ringGeo, wooded), pulse = this.mark(ringGeo, wooded), stake = this.mark(ringGeo, wooded)
    stake.un.uDash.value = 1
    this.disposables.push(ringGeo)

    this.gfx.push({
      d0, d1, t0, t1, crop, soilColor, water, damp, cover, tint, oats, win, oatWin, off, avail, paint, under, nearU, coarse, ranges, rimeHere, tract, ground, open, bounds,
      soil, plants, plantMat, plantWhole: null, wholeMat: () => leafMat(nearShape, true), blossoms, oatMesh: null,
      // (for the tool that counts the leaves' fragments: each adds a sixty-fourth to the pixel it is drawn on)
      plantCount: null, countMat: () => Object.assign(leafMat({ ...nearShape, key: 'county-plant-count', fragmentEnd: 'gl_FragColor = vec4( 1.0 / 64.0 );' }), { alphaToCoverage: false, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor }), ring, pulse, stake, pulseT: 9, selT: 9, near: false, any: false,
    })
    this.soilTarget.push(new Color(SOIL.good))
    this.cropTarget.push(new Vector4())
    this.tractTarget.push(new Vector4())
    this.groundTarget.push(new Vector4(PARCELS[i].stones, 0, 0, 0))
  }

  private mark(geo: BufferGeometry, wooded: boolean): Mark {
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
    // On a tract the mark is drawn over the trees that stand on it.
    mat.depthTest = !wooded
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

  // A lath with a rag on it where a hill was pulled to see what is under it: tall enough to find from across the farm.
  private buildFlags(): InstancedMesh {
    const lath = new BufferGeometry(), rag = new BufferGeometry()
    const quad = (g: BufferGeometry, x0: number, x1: number, y0: number, y1: number, c: [number, number, number]) => {
      const p: number[] = [], col: number[] = [], nrm: number[] = []
      for (const [ax, az] of [[1, 0], [0, 1]]) for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
        const x = x0 + (x1 - x0) * u
        p.push(x * ax, y0 + (y1 - y0) * v, x * az)
        col.push(...c)
        nrm.push(0, 1, 0)
      }
      g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3))
      g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
      g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
    }
    quad(lath, -0.04, 0.04, 0, 2.3, [0.62, 0.5, 0.36])
    quad(rag, 0.04, 0.62, 1.78, 2.26, [0.96, 0.93, 0.86])
    const geo = mergeGeometries([lath, rag])!
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: DoubleSide, roughness: 0.9, metalness: 0 }), { key: 'county-flag' })
    const mesh = new InstancedMesh(geo, mat, 96)
    mesh.count = 0
    mesh.frustumCulled = false
    this.group.add(mesh)
    this.disposables.push(lath, rag, geo, mat)
    return mesh
  }

  private placeFlags(): void {
    const at: number[] = []
    for (let k = 0; k < N && at.length < 96; k++) if (this.cur[k * G + 5] > 0.5) at.push(k)
    const key = at.join(',')
    if (key === this.flagged) return
    this.flagged = key
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(1, 1, 1), up = new Vector3(0, 1, 0)
    at.forEach((k, n) => {
      const i = Math.floor(k / HILLS), h = k % HILLS, f = FIELDS[i]
      const x = f.x0 + ((h % COLS) + 0.5) * SX + 0.5, z = f.z0 + (Math.floor(h / COLS) + 0.5) * SZ + 0.4
      q.setFromAxisAngle(up, hash2(k, 5) * 6.28)
      this.flags.setMatrixAt(n, m.compose(p.set(x, fieldBaseY(z), z), q, s))
    })
    this.flags.count = at.length
    this.flags.instanceMatrix.needsUpdate = true
  }

  private placeStakes(): void {
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), up = new Vector3(0, 1, 0)
    for (let i = 0; i < FIELD_COUNT; i++) {
      const f = FIELDS[i]
      const o = 0.5 * S
      const corners: [number, number][] = [[f.x0 - o, f.z0 - o], [f.x1 + o, f.z0 - o], [f.x1 + o, f.z1 + o], [f.x0 - o, f.z1 + o]]
      corners.forEach(([x, z], k) => {
        const on = this.availNow[i] ? 1 : 0
        q.setFromAxisAngle(up, hash2(i, k) * 6.28)
        const size = on * 1.3 * S * Math.min(2.6, MARK_WIDE.value) * (PARCELS[i].cover !== 'open' ? 1.7 : 1)
        m.compose(p.set(x, Math.max(groundY(x, z), fieldBaseY(z)) - 0.08, z), q, s.set(size, size, size))
        this.stakes.setMatrixAt(i * 4 + k, m)
      })
    }
    this.stakes.instanceMatrix.needsUpdate = true
  }

  // The oats of a rest year, made the first time a field is rested: tufts from the oats' pool, in the window.
  private buildOats(i: number): Mesh {
    const f = FIELDS[i], g = this.gfx[i]
    const shape: Patch = {
      key: 'county-oats',
      uniforms: {
        uOats: g.oats, uRect: { value: new Vector4(f.x0, f.z0, 1 / FW, 1 / FD) }, uWin: g.oatWin, uPool: this.pool, uFadeR: this.fadeR, uSlope: { value: this.slope }, uSeed: { value: i * 31.7 },
      },
      vertexHead: `uniform vec4 uRect;\n${slotGlsl(OAT_STEP, OAT_STEP, OAT_COLS, OAT_ROWS, 0.8)}\nattribute vec3 aBlade;\nuniform vec3 uOats;\nvarying vec3 vTint;\nfloat oatGust;`,
      vertexNormal: /* glsl */ `
        slot();
        float oa = aAt.w * 6.2831853, oc = cos(oa), os = sin(oa);
        objectNormal = vec3(oc * objectNormal.x + os * objectNormal.z, objectNormal.y, -os * objectNormal.x + oc * objectNormal.z);
      `,
      vertexBegin: /* glsl */ `
        float ob = aAt.w * 6.2831853, obc = cos(ob), obs = sin(ob);
        float tall = (0.05 + 0.4 * uOats.x) * (0.75 + 0.5 * fract(aAt.w * 53.1));
        float head = mix(1.0, smoothstep(0.55, 0.85, uOats.x), aBlade.z);
        vec3 ol = position * vec3(0.55, 1.0, 0.55) * vec3(head, mix(1.0, head, aBlade.z * 0.3), head);
        transformed = aAt.xyz + vec3(obc * ol.x + obs * ol.z, ol.y * tall * 2.2, -obs * ol.x + obc * ol.z) * vec3(uOats.z * 2.4, 1.0, uOats.z * 2.4) * slotIn;
        oatGust = gustAt(aAt.xz);
      `,
      vertexWorld: sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '1.5'),
    }
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, side: DoubleSide, roughness: 0.72, metalness: 0 }), {
      ...shape,
      translucent: 0.16,
      blade: true,
      shine: 0.2,
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
    const mesh = new Mesh(this.oatPool, mat)
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.visible = false
    this.group.add(mesh)
    this.disposables.push(mat)
    return mesh
  }

  // Set what each hill should look like. `display` may hold hills still waiting to be revealed by the crews.
  setTargets(fields: FieldVis[], display: HillDisplay[][], spring = false): void {
    let stakes = false
    for (let i = 0; i < FIELD_COUNT; i++) {
      const fv = fields[i]
      this.rest[i] = fv.held && fv.crop === 'rest'
      if (this.rest[i] && !this.gfx[i].oatMesh) this.gfx[i].oatMesh = this.buildOats(i)
      this.cropTarget[i].set(fv.wilt, fv.frosted, fv.rime, fv.bloom)
      this.soilTarget[i].set(SOIL[fv.moisture] ?? SOIL.good)
      // Standing water after a soaking; wet ground still shines in its furrows until it drains.
      this.waterTarget[i] = !fv.held ? 0 : fv.moisture === 'standing water' ? 1 : fv.moisture === 'wet' ? 0.4 : 0
      this.dampTarget[i] = DAMP[fv.moisture] ?? 0.3
      this.coverTarget[i] = this.rest[i] ? 1 : 0
      // A tract under trees or stumps, new ground waiting for its first spring, or somebody else's hay.
      const tract = fv.cover !== 'open', fresh = !tract && fv.ours && !fv.held
      const standing = fv.cover === 'woods' || fv.cover === 'brush'
      this.offTarget[i] = fv.held || tract || fresh ? 0 : 1
      this.heldTarget[i] = fv.held || fresh ? 1 : 0
      this.bare[i] = tract && standing && fv.felled <= 0
      const torn = fv.works === 'stump' ? Math.max(0.04, 1 - fv.worksLeft / STUMP_DAYS) : 0
      this.tractTarget[i].set(tract ? 1 : 0, standing ? fv.felled : 1, torn, PARCELS[i].cover === 'brush' ? 1 : 0)
      this.groundTarget[i].set(tract ? 0 : fv.stones, fv.works === 'tile' ? Math.max(0.05, 1 - fv.worksLeft / TILE_DAYS) : 0, fv.tiled ? 1 : 0, fv.raw && !tract ? 1 : 0)
      this.gfx[i].open.value = fv.sheltered ? 0.6 : 1.15
      this.rimeTarget[i] = fv.rime
      if (this.availNow[i] !== fv.available) { this.availNow[i] = fv.available; stakes = true }
      this.lotNow[i] = spring && fv.ours && fv.cover !== 'open'
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

  // The pools' slots, for a tier's window.
  private sizePools(tier: 'high' | 'medium' | 'low'): void {
    const w = POOL[tier]
    this.pool.value.set(w.x, w.z)
    this.reach = w.reach
    const fill = (geo: InstancedBufferGeometry, stepX: number, stepZ: number) => {
      const nx = Math.ceil((2 * w.x) / stepX), nz = Math.ceil((2 * w.z) / stepZ)
      const slots = new Float32Array(nx * nz * 2)
      for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) slots.set([k, j], (j * nx + k) * 2)
      geo.setAttribute('aSlot', new InstancedBufferAttribute(slots, 2))
      geo.instanceCount = nx * nz
    }
    fill(this.plantPool, PLANT_STEP, ROW)
    this.bloomPool.setAttribute('aSlot', this.plantPool.getAttribute('aSlot'))
    this.bloomPool.instanceCount = this.plantPool.instanceCount
    fill(this.oatPool, OAT_STEP, OAT_STEP)
  }

  // Where the window of whole plants lies: round the nearest ground the camera sees, a little way on into the picture.
  private placeWindow(camera: PerspectiveCamera): void {
    const c = camera.position, d = camera.getWorldDirection(this.ahead)
    this.camAt.copy(c)
    // the ray along the foot of the picture
    const down = (camera.fov * Math.PI) / 360
    const flat = Math.hypot(d.x, d.z) || 1e-4, pitch = Math.atan2(-d.y, flat) + down * 0.9
    const height = c.y - fieldBaseY(c.z)
    const out = pitch > 0.02 ? height / Math.tan(pitch) : 1e6
    const dist = Math.hypot(out, height)
    this.windowOn = dist < this.reach
    if (!this.windowOn) return
    const pm = Math.min(this.pool.value.x, this.pool.value.y)
    const on = out + pm * 0.42
    const far = Math.hypot(on, height)
    // Looked at level, the far part of the window is seen edge-on, a strip a few pixels deep with every plant in it
    // behind another: the painted rows take over sooner there. Looked down on, the whole window shows and is kept.
    const level = this.spare.value.z * Math.min(1, Math.max(0, (0.62 + d.y) / 0.37))
    this.fadeR.value.set(far + pm * 0.05, far + pm * (0.9 - 0.4 * level))
    this.centre.set(c.x + (d.x / flat) * on, 0, c.z + (d.z / flat) * on)
  }

  private applyWindow(i: number, oats: number, oatsRipe: number): void {
    const g = this.gfx[i], f = FIELDS[i], w = this.pool.value, c = this.centre
    const near = this.windowOn && c.x + w.x > f.x0 && c.x - w.x < f.x1 && c.z + w.y > f.z0 && c.z - w.y < f.z1
    g.near = near
    g.nearU.value = near ? 1 : 0
    // Past where a row has any width on the screen the ground is drawn in a few broad faces.
    const cam = this.camAt
    const away = Math.hypot(Math.max(f.x0 - cam.x, cam.x - f.x1, 0), Math.max(f.z0 - cam.z, cam.z - f.z1, 0), Math.max(0, cam.y - fieldBaseY(f.cz) - 30))
    const far = away > this.flatAt || g.off.value > 0.5
    if (far !== g.coarse.value > 0.5) {
      g.coarse.value = far ? 1 : 0
      const r = far ? g.ranges.coarse : g.ranges.fine
      g.soil.geometry.setDrawRange(r[0], r[1])
    }
    // The crop is painted on the soil everywhere; the plants of the window stand on the paint.
    g.paint.value = 1
    g.under.value = 1
    g.plants.visible = near && g.any
    g.blossoms.visible = near && g.any && this.cropTarget[i].w > 0.01
    if (near) {
      g.win.value.set(Math.floor((c.x - w.x - f.x0) / PLANT_STEP), Math.floor((c.z - w.y - f.z0) / ROW), c.x, c.z)
      g.oatWin.value.set(Math.floor((c.x - w.x - f.x0) / OAT_STEP), Math.floor((c.z - w.y - f.z0) / OAT_STEP), c.x, c.z)
    }
    const rest = this.rest[i]
    g.oats.value.set(rest ? oats : 0, oatsRipe, 1)
    if (g.oatMesh) g.oatMesh.visible = near && rest && oats > 0.01
  }

  // dt in seconds. `oats`, `oatsRipe`: the growth of the rest-year cover.
  update(dt: number, camera: PerspectiveCamera, opts: { selection: number[]; hover: number; oats: number; oatsRipe: number; reduced: boolean }): void {
    const kFast = 1 - Math.exp(-dt * 6), kSlow = 1 - Math.exp(-dt * 2.5)
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    this.placeWindow(camera)
    for (let i = 0; i < FIELD_COUNT; i++) {
      const g = this.gfx[i]
      g.soilColor.lerp(this.soilTarget[i], kSlow)
      g.water.value += (this.waterTarget[i] - g.water.value) * kSlow
      g.damp.value += (this.dampTarget[i] - g.damp.value) * kSlow
      g.cover.value += (this.coverTarget[i] * (0.35 + 0.65 * opts.oats) - g.cover.value) * kSlow
      g.off.value += (this.offTarget[i] - g.off.value) * kSlow
      if (Math.abs(this.offTarget[i] - g.off.value) < 0.002) g.off.value = this.offTarget[i]
      g.rimeHere.value += (this.rimeTarget[i] - g.rimeHere.value) * kSlow
      this.held[i] += (this.heldTarget[i] - this.held[i]) * kSlow
      this.off[i] = g.off.value
      this.avail[i] = g.avail.value
      g.tract.value.lerp(this.tractTarget[i], kSlow)
      g.ground.value.lerp(this.groundTarget[i], kSlow)
      // Somebody else's ground and the floor of a standing wood are the land's own to draw.
      g.soil.visible = g.off.value < 0.999 && !(this.bare[i] && g.tract.value.x > 0.99 && g.tract.value.y < 0.002)
      g.crop.lerp(this.cropTarget[i], kSlow)
      this.applyWindow(i, opts.oats, opts.oatsRipe)
      // The selection: steady, after it has drawn the eye twice.
      const sel = opts.selection.includes(i)
      g.selT = sel ? g.selT + dt : 0
      const beat = sel && !opts.reduced && g.selT < 1.1 ? 0.18 * Math.sin(g.selT * 11.4) * (1 - g.selT / 1.1) : 0
      const ringWant = sel ? 0.95 + beat : i === opts.hover ? 0.42 : this.lotNow[i] ? 0.34 : 0
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

  // The ring that tells the player an order was heard.
  ringOrder(fields: number[]): void {
    for (const i of fields) if (this.gfx[i]) this.gfx[i].pulseT = 0
  }

  // The fields whose ring is still on the ground.
  ringing(): number[] {
    return this.gfx.map((g, i) => (g.pulseT < 0.7 ? i : -1)).filter(i => i >= 0)
  }

  // What each field is drawn with now, for the tools: 0 whole plants in the window, 2 painted.
  lods(): number[] {
    return this.gfx.map(g => (g.near ? 0 : 2))
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
    if (camera) this.placeWindow(camera)
    for (let i = 0; i < FIELD_COUNT; i++) {
      const g = this.gfx[i]
      g.soilColor.copy(this.soilTarget[i])
      g.water.value = this.waterTarget[i]
      g.damp.value = this.dampTarget[i]
      g.cover.value = this.coverTarget[i] * (0.35 + 0.65 * oats)
      g.off.value = this.offTarget[i]
      g.rimeHere.value = this.rimeTarget[i]
      this.held[i] = this.heldTarget[i]
      this.off[i] = g.off.value
      g.avail.value = this.availNow[i] ? 1 : 0
      this.avail[i] = g.avail.value
      g.tract.value.copy(this.tractTarget[i])
      g.ground.value.copy(this.groundTarget[i])
      g.soil.visible = g.off.value < 0.999 && !this.bare[i]
      g.crop.copy(this.cropTarget[i])
      g.pulseT = 9
      g.selT = 9
    }
    this.write()
    this.settled = true
  }

  private write(): void {
    const cur = this.cur
    const mean = [0, 0, 0, 0, 0]
    for (let i = 0; i < FIELD_COUNT; i++) {
      const g = this.gfx[i]
      let any = false, standing = 0
      mean.fill(0)
      for (let h = 0; h < HILLS; h++) {
        const o = (i * HILLS + h) * G
        if (cur[o + 4] > 0.5 || cur[o + 5] > 0.5) continue
        standing++
        for (let c = 0; c < 4; c++) mean[c] += cur[o + c]
        mean[4] += cur[o + 7]
      }
      if (standing) for (let c = 0; c < 5; c++) mean[c] /= standing
      for (let h = 0; h < HILLS; h++) {
        const o = (i * HILLS + h) * G, q = h * 4
        const dug = cur[o + 4], pulled = cur[o + 5], gone = Math.max(dug, pulled)
        if (cur[o] * (1 - dug) * (1 - pulled) > 0.004) any = true
        const at = (c: number, m: number) => Math.round(Math.min(1, cur[o + c] + (mean[m] - cur[o + c]) * gone) * 255)
        g.d0[q] = at(0, 0)
        g.d0[q + 1] = at(1, 1)
        g.d0[q + 2] = at(2, 2)
        g.d0[q + 3] = at(3, 3)
        g.d1[q] = Math.round(dug * 255)
        g.d1[q + 1] = Math.round(pulled * 255)
        g.d1[q + 2] = Math.round(cur[o + 6] * 255)
        g.d1[q + 3] = at(7, 4)
      }
      g.t0.needsUpdate = true
      g.t1.needsUpdate = true
      g.any = any
    }
    this.placeFlags()
  }

  // The window of whole plants is smaller where the machine cannot carry as many.
  setTier(tier: 'high' | 'medium' | 'low', _density: number): void {
    this.sizePools(tier)
    this.flatAt = FLAT_AT[tier]
  }

  // For the tool that counts fragments: nothing of the fields drawn but the whole plants, each fragment of them
  // adding to its pixel (`depth`: only those in front of what was drawn before them, as the picture keeps them); or
  // (`on` false) everything as it was. Gives what was hidden, to be handed back.
  counting(on: boolean, depth = true, hidden: Object3D[] = []): Object3D[] {
    if (!on) { for (const o of hidden) o.visible = true }
    else for (const o of this.group.children) if (o.visible && !this.gfx.some(g => g.plants === o)) { o.visible = false; hidden.push(o) }
    for (const g of this.gfx) {
      if (on && !g.plantCount) { g.plantCount = g.countMat(); this.disposables.push(g.plantCount) }
      if (on && g.plantCount) { g.plantCount.depthTest = depth; g.plants.material = g.plantCount } else g.plants.material = g.plantMat
    }
    return hidden
  }

  // For the tools: draw the crop's whole plants without one of the things that make them cheaper, to measure it.
  // 'corners': every leaf lit at every pixel, as it was.
  // 'thin': every plant drawn however far; 'half': every leaf; 'reach': the window as deep in a level view as in any.
  // And to find where the plants' cost lies: 'plants' (none drawn, their triangles still sent), 'near' (one plant in
  // two everywhere, near ones too), 'a2c' (the cut-out with no coverage by samples).
  tryWithout(name: 'corners' | 'thin' | 'half' | 'reach' | 'plants' | 'near' | 'a2c', on: boolean): void {
    if (name === 'plants') { this.trial.value.x = on ? 0 : 1; return }
    if (name === 'near') { this.trial.value.y = on ? 1 : 0; return }
    if (name === 'a2c') { for (const g of this.gfx) for (const m of [g.plantMat, g.plantWhole]) if (m) { m.alphaToCoverage = !on; m.needsUpdate = true } return }
    if (name !== 'corners') { this.spare.value[name === 'thin' ? 'x' : name === 'half' ? 'y' : 'z'] = on ? 0 : 1; return }
    for (const g of this.gfx) {
      if (on && !g.plantWhole) { g.plantWhole = g.wholeMat(); this.disposables.push(g.plantWhole) }
      g.plants.material = on && g.plantWhole ? g.plantWhole : g.plantMat
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
      const z = dz > 0 ? f.z1 - 0.9 * S : f.z0 + 0.9 * S
      return new Vector3(f.cx, fieldBaseY(z) + 0.35, z)
    }
    const x = dx > 0 ? f.x1 - 1.2 * S : f.x0 + 1.2 * S
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
  const pad = 0.4 * S, w = 0.3 * S
  const pos: number[] = [], ring: number[] = [], out: number[] = [], idx: number[] = []
  const corners: [number, number][] = [[f.x0 - pad, f.z0 - pad], [f.x1 + pad, f.z0 - pad], [f.x1 + pad, f.z1 + pad], [f.x0 - pad, f.z1 + pad]]
  let arc = 0
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4]
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len
    const ox = dz, oz = -dx
    const steps = Math.ceil(len / 3)
    const o = pos.length / 3
    for (let k = 0; k <= steps; k++) {
      // each side runs past its ends so the corners close
      const t = -w + ((len + 2 * w) * k) / steps
      const near = Math.min(Math.max(t, 0), Math.max(len - t, 0))
      for (const e of [0, 1]) {
        const x = ax + dx * t + ox * e * w, z = az + dz * t + oz * e * w
        pos.push(x, Math.max(groundY(x, z), fieldBaseY(z)) + 0.16, z)
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
