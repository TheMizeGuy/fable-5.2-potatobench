// The six fields: soil whose rows ridge as they are hilled, each simulated hill drawn as a patch of plants made of
// leaves, their blossom, the rest-year oats over clover, and the marks that show what the player has selected.
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, Group, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, MeshStandardMaterial, NearestFilter, RGBAFormat, ShaderMaterial, Sphere, Vector3, Vector4, type Texture,
} from 'three'
import { COLS, FIELD_COUNT, HILLS, ROWS, type HillLook } from '../sim/index.ts'
import { blossomGeometry, oatGeometry, plantGeometry } from './geometry.ts'
import { FD, FIELDS, FW, PLANT, PLANTED_ROWS, PLANTS_PER_ROW, ROW, fieldBaseY, groundY, profile } from './layout.ts'
import { hash2 } from './noise.ts'
import { SNOW_RIME, depthFor, linear, patch, sway, type Patch } from './shaders.ts'
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

export interface HillDisplay { look: HillLook; ridge: number }

// The smallest a blossom or a tuber may be drawn, as world size per unit of distance: about a pixel.
export const PIXEL = { value: 0.0006 }
// What the marks on the ground are multiplied by so they hold their brightness under any exposure.
export const UI_GAIN = { value: 1 }

const PLANT_FN = /* glsl */ `
attribute vec4 aAt;
uniform sampler2D uT0;
uniform sampler2D uT1;
uniform vec4 uRect;
uniform vec4 uCrop;        // wilt, share of leaf blackened by frost, rime this morning, bloom
uniform float uDense;
struct Plant { vec3 at; float w; float h; float cs; float sn; float droop; float dead; float frost; vec4 h0; vec4 h1; vec3 r; };
Plant gp;
Plant plantAt() {
  Plant p;
  vec2 huv = (aAt.xz - uRect.xy) * uRect.zw;
  p.h0 = texture2D(uT0, huv);
  p.h1 = texture2D(uT1, huv);
  p.r = fract(aAt.w * vec3(61.7, 127.3, 331.9));
  p.dead = p.h0.a;
  p.frost = clamp(uCrop.y * (0.7 + 0.6 * p.r.y), 0.0, 1.0) * (1.0 - p.dead);
  p.droop = clamp(max(uCrop.x * 0.9, p.frost * 0.85), 0.0, 1.0) * (1.0 - p.dead);
  float size = (0.22 + 0.78 * pow(p.h0.r, 0.75)) * mix(1.0, 0.6, p.h1.a) * (0.84 + 0.32 * p.r.x) * step(0.004, p.h0.r) * uDense;
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

const LEAF_COLOUR = /* glsl */ `
  {
    float grow = gp.h0.r, yellow = gp.h0.g;
    vec3 col = mix(${linear('#a2d85c')}, ${linear('#62b04c')}, smoothstep(0.08, 0.7, grow));
    col = mix(col, ${linear('#9aa24c')}, min(1.0, yellow * 1.6));
    col = mix(col, ${linear('#b09a55')}, clamp((yellow - 0.55) * 1.8, 0.0, 1.0));
    col = mix(col, ${linear('#b4c67a')}, 0.6 * gp.h1.a);
    col = mix(col, ${linear('#7f8560')}, min(1.0, uCrop.x * 1.1));
    float bl = clamp(gp.h0.b * 2.4, 0.0, 1.0);
    float hit = smoothstep(0.0, 0.25, bl * 1.3 - fract(aLeaf.x * 7.3 + gp.r.x));
    col = mix(col, mix(${linear('#4b3324')}, ${linear('#241a14')}, fract(aLeaf.x * 3.1 + gp.r.z)), hit);
    float burnt = smoothstep(0.0, 0.2, gp.frost * 1.25 - fract(aLeaf.x * 5.7 + gp.r.y));
    // On the morning of the frost the leaf is white with rime; it is black by the next day.
    col = mix(col, ${linear('#2b2a26')}, burnt * (1.0 - 0.75 * uCrop.z));
    col = mix(col, ${linear('#a8bcc0')}, 0.55 * uCrop.z * smoothstep(0.2, 0.9, aLeaf.y));
    col = mix(col, ${linear('#b5a27a')} * (0.8 + 0.4 * gp.r.z), gp.dead);
    col = mix(${linear('#8a9a62')}, col, aLeaf.z);
    // Deep in the canopy little light arrives.
    col *= mix(0.7, 1.0, smoothstep(0.0, 0.42, position.y)) * (0.9 + 0.2 * gp.r.z);
    vTint = col;
    vErode = max(max(gp.dead * 0.32, hit * 0.55), burnt * 0.45 * (1.0 - uCrop.z)) * aLeaf.z;
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
  float taper = smoothstep(0.0, 0.012, f.x) * smoothstep(1.0, 0.988, f.x) * smoothstep(0.0, 0.01, f.y) * smoothstep(1.0, 0.99, f.y);
  vec2 prof = rowProfile(fr, smoothstep(0.55, 1.0, hill.b));
  float amp = ${RIDGE_AMP.toFixed(3)} * hill.b * taper * (1.0 - 0.75 * smoothstep(0.3, 1.0, uSnow));
  float lumps = (textureLod(uNoise, xz * 0.37, 0.0).a - 0.5) * 0.1;
  float h = mix(amp * prof.x, amp * 0.2 + 0.025 + lumps * taper, hill.r);
  return vec3(h, amp * (1.0 - hill.r) * prof.y / ${ROW.toFixed(3)}, mix(prof.x, 0.5, hill.r));
}
`

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
  soil: Mesh
  plants: Mesh
  blossoms: Mesh
  oatMesh: Mesh | null
  ring: Mesh
  ringU: { uLevel: { value: number }; uGrow: { value: number }; uGain: { value: number } }
  pulse: Mesh
  pulseU: { uLevel: { value: number }; uGrow: { value: number }; uGain: { value: number } }
  pulseT: number
  selT: number
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
  private cropTarget: Vector4[] = []
  private rest: boolean[] = new Array(FIELD_COUNT).fill(false)
  private settled = false
  private disposables: { dispose(): void }[] = []
  private col = new Color()
  private plantGeo: BufferGeometry
  private bloomGeo: BufferGeometry
  private oatGeo: BufferGeometry
  private leafTex: Texture
  private flowerTex: Texture
  private density = 1
  // Plants throw shadows into the second cascade only while the first does not already hold them.
  farShadows = true

  constructor(leafTex: Texture, flowerTex: Texture) {
    this.leafTex = leafTex
    this.flowerTex = flowerTex
    this.plantGeo = plantGeometry()
    this.bloomGeo = blossomGeometry()
    this.oatGeo = oatGeometry()
    this.disposables.push(this.plantGeo, this.bloomGeo, this.oatGeo)
    for (let i = 0; i < FIELD_COUNT; i++) this.build(i)
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
    const water = { value: 0 }, damp = { value: 0.3 }, cover = { value: 0 }, tint = { value: 0.2 }, dense = { value: 1 }
    const oats = { value: new Vector3(0, 0, 0) }
    const shared = { uT0: { value: t0 }, uT1: { value: t1 }, uRect: { value: new Vector4(f.x0, f.z0, 1 / FW, 1 / FD) }, uCrop: { value: crop }, uDense: dense }
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
      uniforms: { uT1: { value: t1 }, uSoil: { value: soilColor }, uWater: water, uDamp: damp, uCover: cover },
      vertexHead: ROW_FN,
      vertexNormal: `vec4 hillN; vec3 shN = soilShape(aF, position.xz, hillN); objectNormal = normalize(vec3(0.0, 1.0, ${SLOPE.toFixed(4)} - shN.y));`,
      vertexBegin: /* glsl */ `
        vec4 hillB;
        vec3 shB = soilShape(aF, position.xz, hillB);
        transformed.y += shB.x;
        vF = aF;
        vProf = shB.z;
        vRidged = smoothstep(0.08, 0.55, hillB.b) * (1.0 - hillB.r);
        vDrill = step(0.02, hillB.b) * (1.0 - hillB.r) * (1.0 - smoothstep(0.08, 0.4, hillB.b));
        vHill = hillB;
      `,
    }
    const soilMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }), {
      ...soilShape,
      fragmentHead: /* glsl */ `
        uniform sampler2D uT1;
        uniform vec3 uSoil;
        uniform float uWater;
        uniform float uDamp;
        uniform float uCover;
        varying vec2 vF;
        varying float vProf;
        varying float vRidged;
        varying float vDrill;
        varying vec4 vHill;
        float poolF;
        float soilRough;
        vec2 soilBump;
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
          float cov = uCover * smoothstep(0.2, 0.5, broad * 0.6 + 0.42 * uCover + 0.2 * fine);
          vec3 clover = uGrass * vec3(0.6, 0.98, 0.58) * (0.66 + 0.68 * fine);
          clover = mix(clover, vec3(0.74, 0.62, 0.7), step(0.8, grit) * step(0.55, fine) * 0.55 * uLeaf);
          soil = mix(soil, clover, cov);
          poolF = uWater * mix(1.0, 1.0 - smoothstep(0.06, 0.3, vProf), vRidged) * smoothstep(0.4, 0.55, broad * 0.6 + 0.4 * texture2D(uNoise, vWorld.xz * 0.017).b);
          soil = mix(soil, vec3(0.018, 0.02, 0.018), poolF * 0.92);
          diffuseColor.rgb = soil;
          soilBump = ((n2.rg - 0.5) * 1.2 + (n3.rg - 0.5)) * (1.0 - poolF) * (1.0 - 0.5 * cov);
          soilRough = mix(mix(0.96, 0.66, uDamp), 0.04, poolF);
        }
        ${SNOW_RIME}
      `,
      fragmentRoughness: 'roughnessFactor = soilRough;',
      fragmentNormal: /* glsl */ `
        normal = normalize(normal + (viewMatrix * vec4(soilBump.x, 0.0, soilBump.y, 0.0)).xyz * 0.55);
        normal = normalize(mix(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz, poolF));
      `,
    })
    const soil = new Mesh(soilGeo, soilMat)
    soil.receiveShadow = true
    soil.castShadow = true
    soil.customDepthMaterial = depthFor(soilShape)
    soil.layers.enable(1)
    this.group.add(soil)
    this.disposables.push(soilGeo, soilMat, soil.customDepthMaterial)

    // ---- plants: every other one first, so a lower setting can draw half of them
    const at = new Float32Array(PLANTS * 4)
    let m = 0
    for (const parity of [0, 1]) {
      for (let j = 0; j < PLANTED_ROWS; j++) {
        for (let k = 0; k < PLANTS_PER_ROW; k++) {
          if ((j + k) % 2 !== parity) continue
          const z = f.z0 + (j + 0.5) * ROW
          at.set([f.x0 + (k + 0.5) * PLANT, fieldBaseY(z), z, hash2(i * 977 + k, j * 131 + 7)], m * 4)
          m++
        }
      }
    }
    const aAt = new InstancedBufferAttribute(at, 4)
    const instanced = (src: BufferGeometry): InstancedBufferGeometry => {
      const g = new InstancedBufferGeometry()
      g.index = src.index
      for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.attributes[name])
      g.setAttribute('aAt', aAt)
      g.instanceCount = PLANTS
      g.boundingSphere = bounds
      this.disposables.push(g)
      return g
    }
    const leafShape: Patch = {
      key: 'county-plant',
      uniforms: shared,
      vertexHead: `${PLANT_FN}\nattribute vec3 aLeaf;\nvarying vec3 vTint;\nvarying float vErode;`,
      vertexNormal: /* glsl */ `
        gp = plantAt();
        objectNormal = normalize(vec3(gp.cs * objectNormal.x + gp.sn * objectNormal.z, objectNormal.y + 0.3 * gp.droop, -gp.sn * objectNormal.x + gp.cs * objectNormal.z));
      `,
      vertexBegin: LEAF_SHAPE + LEAF_COLOUR,
      vertexWorld: `${sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '0.55 * (1.0 - 0.6 * uCrop.x) * (1.0 - 0.8 * gp.dead)')}
        cWorld.y += sin(uTime * 6.3 + aLeaf.x * 40.0 + aAt.w * 23.0) * 0.012 * aLeaf.y * aLeaf.z * min(uSway, 1.0) * (1.0 - gp.dead);`,
    }
    const plantMat = patch(new MeshStandardMaterial({ map: this.leafTex, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide, roughness: 0.66, metalness: 0 }), {
      ...leafShape,
      translucent: 1.1,
      ambient: 1.0,
      shine: 0.25,
      fragmentHead: 'varying vec3 vTint;\nvarying float vErode;',
      fragmentColor: `diffuseColor.rgb *= vTint; diffuseColor.a *= 1.0 - vErode * (0.25 + 0.75 * texture2D(uNoise, vMapUv * 1.7).a); ${SNOW_RIME}`,
    })
    const plants = new Mesh(instanced(this.plantGeo), plantMat)
    plants.castShadow = true
    plants.receiveShadow = true
    plants.customDepthMaterial = depthFor({ ...leafShape, vertexBegin: `gp = plantAt();\n${LEAF_SHAPE}` })
    plants.layers.enable(1)
    this.group.add(plants)
    this.disposables.push(plantMat, plants.customDepthMaterial)

    // ---- blossom
    const bloomMat = patch(new MeshStandardMaterial({ map: this.flowerTex, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide, roughness: 0.7, metalness: 0 }), {
      key: 'county-blossom',
      uniforms: { ...shared, uTint: tint, uPix: PIXEL },
      translucent: 1.4,
      ambient: 1.3,
      vertexHead: `${PLANT_FN}\nattribute vec4 aFlower;\nuniform float uTint;\nuniform float uPix;\nvarying vec3 vTint;\nfloat showF;`,
      vertexNormal: 'gp = plantAt();\nobjectNormal = vec3(0.0, 1.0, 0.0);',
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
          float fbase = 0.017 + 0.006 * aFlower.w, fsize = max(fbase, length(cWorld.xyz - cameraPosition) * uPix);
          float fkeep = clamp(fbase * fbase / (fsize * fsize) * 1.5, 0.05, 1.0);
          fsize *= showF * step(fract(aFlower.w * 7.13 + aAt.w * 3.7), fkeep);
          vec3 fr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), fu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          cWorld.xyz += (fr * aFlower.x + fu * aFlower.y) * fsize;
        }
      `,
      fragmentHead: 'varying vec3 vTint;',
      fragmentColor: 'diffuseColor.rgb *= vTint;',
    })
    const blossoms = new Mesh(instanced(this.bloomGeo), bloomMat)
    blossoms.receiveShadow = true
    this.group.add(blossoms)
    this.disposables.push(bloomMat)

    // ---- marks on the ground: the selection and the ring that answers an order
    const ringGeo = ringGeometry(i)
    const mark = () => {
      const un = { uLevel: { value: 0 }, uGrow: { value: 0 }, uGain: UI_GAIN }
      const mat = new ShaderMaterial({
        uniforms: un,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        vertexShader: /* glsl */ `
          attribute vec3 aRing;      // across the band 0..1, distance to the nearest corner, which way is out (packed with position)
          attribute vec2 aOut;
          uniform float uGrow;
          varying vec3 vRing;
          void main() {
            vRing = aRing;
            vec3 p = position + vec3(aOut.x, 0.0, aOut.y) * (uGrow + (aRing.x - 0.5) * uGrow * 0.6);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uLevel;
          uniform float uGain;
          varying vec3 vRing;
          void main() {
            // A pale line with a dark edge, so it shows on snow as well as on soil. Heavier at the corners.
            float across = smoothstep(0.0, 0.18, vRing.x) * smoothstep(1.0, 0.82, vRing.x);
            float core = smoothstep(0.2, 0.36, vRing.x) * smoothstep(0.8, 0.64, vRing.x);
            float corner = 1.0 - smoothstep(1.4, 2.2, vRing.y);
            float a = uLevel * across * mix(0.62, 1.0, max(corner, 1.0 - core));
            if (a < 0.004) discard;
            gl_FragColor = vec4(mix(vec3(0.02, 0.03, 0.02), vec3(0.95, 0.9, 0.78), core) * uGain, a);
          }`,
      })
      const mesh = new Mesh(ringGeo, mat)
      mesh.renderOrder = 6
      mesh.visible = false
      mesh.frustumCulled = false
      this.group.add(mesh)
      this.disposables.push(mat)
      return { mesh, un }
    }
    const ring = mark(), pulse = mark()
    this.disposables.push(ringGeo)

    this.gfx.push({
      d0, d1, t0, t1, crop, soilColor, water, damp, cover, tint, oats, dense, soil, plants, blossoms, oatMesh: null,
      ring: ring.mesh, ringU: ring.un, pulse: pulse.mesh, pulseU: pulse.un, pulseT: 9, selT: 9,
    })
    this.soilTarget.push(new Color(SOIL.good))
    this.cropTarget.push(new Vector4())
  }

  // The oats of a rest year, made the first time a field is rested.
  private buildOats(i: number): Mesh {
    const f = FIELDS[i], g = this.gfx[i]
    const step = 0.27, kx = Math.floor(FW / step), kz = Math.floor(FD / step)
    const at = new Float32Array(kx * kz * 4)
    let n = 0
    for (let j = 0; j < kz; j++) {
      for (let k = 0; k < kx; k++) {
        const x = f.x0 + ((k + 0.5 + (hash2(k + i * 71, j) - 0.5) * 0.8) / kx) * FW
        const z = f.z0 + ((j + 0.5 + (hash2(j + 13, k + i * 37) - 0.5) * 0.8) / kz) * FD
        at.set([x, fieldBaseY(z), z, hash2(k * 3 + 1, j * 7 + i)], n * 4)
        n++
      }
    }
    const geo = new InstancedBufferGeometry()
    geo.index = this.oatGeo.index
    for (const name of Object.keys(this.oatGeo.attributes)) geo.setAttribute(name, this.oatGeo.attributes[name])
    geo.setAttribute('aAt', new InstancedBufferAttribute(at, 4))
    geo.instanceCount = n
    geo.boundingSphere = new Sphere(new Vector3(f.cx, fieldBaseY(f.cz) + 0.3, f.cz), Math.hypot(FW, FD) / 2 + 1)
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
        transformed = aAt.xyz + vec3(obc * ol.x + obs * ol.z, ol.y * tall, -obs * ol.x + obc * ol.z) * vec3(uDense, 1.0, uDense);
        oatGust = gustAt(aAt.xz);
      `,
      vertexWorld: sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '1.5'),
    }
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, side: DoubleSide, roughness: 0.72, metalness: 0 }), {
      ...shape,
      translucent: 0.7,
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
    this.group.add(mesh)
    this.disposables.push(geo, mat, mesh.customDepthMaterial)
    return mesh
  }

  // Set what each hill should look like. `display` may hold hills still waiting to be revealed by the tractor.
  setTargets(fields: FieldVis[], display: HillDisplay[][]): void {
    for (let i = 0; i < FIELD_COUNT; i++) {
      const fv = fields[i]
      this.rest[i] = fv.crop === 'rest'
      if (this.rest[i] && !this.gfx[i].oatMesh) this.gfx[i].oatMesh = this.buildOats(i)
      this.cropTarget[i].set(fv.wilt, fv.frosted, fv.rime, fv.bloom)
      this.soilTarget[i].set(SOIL[fv.moisture] ?? SOIL.good)
      this.waterTarget[i] = fv.moisture === 'standing water' ? 1 : 0
      this.dampTarget[i] = DAMP[fv.moisture] ?? 0.3
      this.coverTarget[i] = fv.crop === 'rest' ? 1 : 0
      this.gfx[i].tint.value = BLOOM_TINT[fv.variety] ?? 0.2
      for (let h = 0; h < HILLS; h++) {
        const d = display[i][h]
        this.hillTarget(i * HILLS + h, d.look, d.ridge, fv)
      }
    }
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

  // dt in seconds. `oats`, `oatsRipe`: the growth of the rest-year cover.
  update(dt: number, opts: { selection: number[]; hover: number; oats: number; oatsRipe: number; reduced: boolean }): void {
    const kFast = 1 - Math.exp(-dt * 6), kSlow = 1 - Math.exp(-dt * 2.5)
    for (let i = 0; i < FIELD_COUNT; i++) {
      const g = this.gfx[i]
      g.soilColor.lerp(this.soilTarget[i], kSlow)
      g.water.value += (this.waterTarget[i] - g.water.value) * kSlow
      g.damp.value += (this.dampTarget[i] - g.damp.value) * kSlow
      g.cover.value += (this.coverTarget[i] * (0.35 + 0.65 * opts.oats) - g.cover.value) * kSlow
      g.crop.lerp(this.cropTarget[i], kSlow)
      g.oats.value.set(this.rest[i] ? opts.oats : 0, opts.oatsRipe, 0)
      if (g.oatMesh) g.oatMesh.visible = this.rest[i] && opts.oats > 0.01
      // The selection: steady, after it has drawn the eye twice.
      const sel = opts.selection.includes(i)
      g.selT = sel ? g.selT + dt : 0
      const beat = sel && !opts.reduced && g.selT < 1.1 ? 0.18 * Math.sin(g.selT * 11.4) * (1 - g.selT / 1.1) : 0
      const want = sel ? 0.95 + beat : i === opts.hover ? 0.42 : 0
      g.ringU.uLevel.value += (want - g.ringU.uLevel.value) * (opts.reduced ? 1 : 1 - Math.exp(-dt * 14))
      g.ring.visible = g.ringU.uLevel.value > 0.01
      // An order heard: a ring that opens out from the field and goes.
      if (g.pulseT < 0.7) {
        g.pulseT += dt
        const u = Math.min(1, g.pulseT / 0.7)
        g.pulseU.uGrow.value = opts.reduced ? 0.5 : 1.6 * (1 - (1 - u) * (1 - u))
        g.pulseU.uLevel.value = (1 - u) * 0.9
        g.pulse.visible = u < 1
      } else g.pulse.visible = false
    }
    if (!this.settled) this.stepHills(kFast)
  }

  // The ring that tells the player an order was heard.
  ringOrder(fields: number[]): void {
    for (const i of fields) if (this.gfx[i]) this.gfx[i].pulseT = 0
  }

  // The fields whose ring is still on the ground.
  ringing(): number[] {
    return this.gfx.map((g, i) => (g.pulseT < 0.7 ? i : -1)).filter(i => i >= 0)
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
  snap(): void {
    this.cur.set(this.tgt)
    for (let i = 0; i < FIELD_COUNT; i++) {
      const g = this.gfx[i]
      g.soilColor.copy(this.soilTarget[i])
      g.water.value = this.waterTarget[i]
      g.damp.value = this.dampTarget[i]
      g.crop.copy(this.cropTarget[i])
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
      g.plants.visible = any
      g.blossoms.visible = any && this.cropTarget[i].w > 0.01
    }
  }

  // Half the plants, each a little larger, where the machine cannot carry them all.
  setDensity(d: number): void {
    if (d === this.density) return
    this.density = d
    for (const g of this.gfx) {
      const count = d >= 1 ? PLANTS : Math.ceil(PLANTS / 2)
      ;(g.plants.geometry as InstancedBufferGeometry).instanceCount = count
      ;(g.blossoms.geometry as InstancedBufferGeometry).instanceCount = count
      g.dense.value = d >= 1 ? 1 : 1.36
    }
  }

  // Shadows from plants reach the second cascade only when the first is too small to hold the fields.
  setFarShadows(on: boolean): void {
    if (on === this.farShadows) return
    this.farShadows = on
    for (const g of this.gfx) {
      for (const m of [g.plants, g.soil, g.oatMesh]) if (m) { if (on) m.layers.enable(1); else m.layers.disable(1) }
    }
  }

  // Height of the top of the crop in a field, for labels.
  topY(i: number): number {
    return fieldBaseY(FIELDS[i].z0) + 0.55
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}

// A band round a field, lying on the ground just outside the crop.
function ringGeometry(i: number): BufferGeometry {
  const f = FIELDS[i]
  const pad = 0.4, w = 0.3
  const pos: number[] = [], ring: number[] = [], out: number[] = [], idx: number[] = []
  const corners: [number, number][] = [[f.x0 - pad, f.z0 - pad], [f.x1 + pad, f.z0 - pad], [f.x1 + pad, f.z1 + pad], [f.x0 - pad, f.z1 + pad]]
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
        ring.push(e, near, 0)
        out.push(ox, oz)
      }
      if (k > 0) { const a = o + (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    }
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
