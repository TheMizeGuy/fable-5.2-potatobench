// The six fields: soil with rows that ridge as they are hilled, one plant per hill, flowers, the rest-year cover.
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh,
  LinearFilter, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, Quaternion, RGBAFormat, Vector3,
} from 'three'
import { COLS, FIELD_COUNT, HILLS, ROWS, type HillLook } from '../sim/index.ts'
import { blossomGeometry, deadGeometry, plantGeometry, tuftGeometry } from './geometry.ts'
import { FD, FIELDS, FW, SX, SZ, fieldBaseY, hillPos } from './layout.ts'
import { hash2 } from './noise.ts'
import { SNOW_RIME, patch, sway } from './shaders.ts'
import type { FieldVis } from './state.ts'
import { CLOUD_SHADE } from './terrain.ts'

export const RIDGE_AMP = 0.44
const N = FIELD_COUNT * HILLS
const TUFTS_X = 24, TUFTS_Z = 16
const TUFTS = TUFTS_X * TUFTS_Z
const SHOWN = 0.002            // below this scale an instance is not drawn at all

const C = {
  young: new Color('#6fa355'), leaf: new Color('#3f7d48'), old: new Color('#8f9a4a'), straw: new Color('#a89452'),
  pale: new Color('#a9bd72'), blight: new Color('#4b3324'), blightDeep: new Color('#241a14'), dead: new Color('#8d7d63'),
  droop: new Color('#7d8058'), white: new Color('#f2ecf7'), lilac: new Color('#c9b6e0'), frost: new Color('#2b2a26'),
  oat: new Color('#6f8f63'), oatRipe: new Color('#bda766'),
}

// Send only the first n instances of these attributes to the GPU.
export function upload(n: number, ...attrs: (InstancedBufferAttribute | null)[]): void {
  if (n <= 0) return
  for (const a of attrs) {
    if (!a) continue
    a.clearUpdateRanges()
    a.addUpdateRange(0, n * a.itemSize)
    a.needsUpdate = true
  }
}

const SOIL: Record<string, string> = {
  'standing water': '#3f2e23', wet: '#4a3528', good: '#614634', drying: '#6d5039', dry: '#7a5a43', wilting: '#8c6c52',
}

// How much purple is in the flower, by variety.
const BLOOM_TINT: Record<string, number> = { norland: 0.9, superior: 0.15, katahdin: 0.05, kennebec: 0.1, burbank: 0.1, atlantic: 0.55, gold: 0.75, caribou: 0.3 }

export interface HillDisplay { look: HillLook; ridge: number }

interface FieldUniforms {
  uHill: { value: DataTexture }
  uSoil: { value: Color }
  uWater: { value: number }
  uCover: { value: number }
  uHover: { value: number }
  uAmp: { value: number }
}

export class Fields {
  readonly group = new Group()
  readonly soils: Mesh[] = []
  private uniforms: FieldUniforms[] = []
  private hillData: Uint8Array[] = []
  private soilTarget: Color[] = []
  private waterTarget: number[] = []
  private coverTarget: number[] = []
  private hoverTarget: number[] = []
  private plants: InstancedMesh
  private deads: InstancedMesh
  private blossoms: InstancedMesh
  private tufts: InstancedMesh
  private outlines: Mesh[] = []
  private outlineMats: MeshBasicMaterial[] = []
  private aSway: InstancedBufferAttribute
  private aSwayB: InstancedBufferAttribute
  private aBloom: InstancedBufferAttribute
  // Per hill, current and target: width, height, r, g, b, bloom, dead share, dug, pulled, ridge.
  private cur = new Float32Array(N * 10)
  private tgt = new Float32Array(N * 10)
  private wilt = new Float32Array(FIELD_COUNT)
  private frost = new Float32Array(FIELD_COUNT)
  private rest: boolean[] = new Array(FIELD_COUNT).fill(false)
  private tuftGrow = new Float32Array(FIELD_COUNT)
  private tuftRipe = -1
  private settled = false
  private disposables: { dispose(): void }[] = []
  private m = new Matrix4()
  private q = new Quaternion()
  private v = new Vector3()
  private s = new Vector3()
  private col = new Color()

  constructor() {
    for (let i = 0; i < FIELD_COUNT; i++) this.buildSoil(i)
    const plantGeo = plantGeometry()
    const plantMat = patch(new MeshLambertMaterial({ vertexColors: true }), {
      vertexHead: 'attribute float aSway;',
      vertexProject: sway('0.12 * aSway'),
      fragmentColor: SNOW_RIME,
    })
    this.plants = new InstancedMesh(plantGeo, plantMat, N)
    this.aSway = new InstancedBufferAttribute(new Float32Array(N).fill(1), 1)
    this.aSway.setUsage(DynamicDrawUsage)
    plantGeo.setAttribute('aSway', this.aSway)
    this.setupInstances(this.plants)
    const deadGeo = deadGeometry()
    const deadMat = patch(new MeshLambertMaterial({ vertexColors: true }), { fragmentColor: SNOW_RIME })
    this.deads = new InstancedMesh(deadGeo, deadMat, N)
    this.setupInstances(this.deads)
    const blossomGeo = blossomGeometry()
    this.aBloom = new InstancedBufferAttribute(new Float32Array(N), 1)
    this.aBloom.setUsage(DynamicDrawUsage)
    blossomGeo.setAttribute('aBloom', this.aBloom)
    this.aSwayB = new InstancedBufferAttribute(new Float32Array(N).fill(1), 1)
    this.aSwayB.setUsage(DynamicDrawUsage)
    blossomGeo.setAttribute('aSway', this.aSwayB)
    const blossomMat = patch(new MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2630 }), {
      vertexHead: 'attribute float aSway; attribute float aBloom; attribute vec3 aFc; attribute float aFk;',
      vertexBegin: 'if (aFk > aBloom) transformed = aFc;',
      vertexProject: sway('0.12 * aSway'),
    })
    this.blossoms = new InstancedMesh(blossomGeo, blossomMat, N)
    this.setupInstances(this.blossoms)
    this.blossoms.castShadow = false
    const tuftGeo = tuftGeometry()
    const tuftMat = patch(new MeshLambertMaterial({ vertexColors: true }), {
      vertexProject: sway('0.3'),
      fragmentColor: SNOW_RIME,
    })
    this.tufts = new InstancedMesh(tuftGeo, tuftMat, FIELD_COUNT * TUFTS)
    this.setupInstances(this.tufts)
    this.tufts.castShadow = false
    this.disposables.push(plantGeo, plantMat, deadGeo, deadMat, blossomGeo, blossomMat, tuftGeo, tuftMat)
    for (let i = 0; i < FIELD_COUNT; i++) this.buildOutline(i)
  }

  // Instances are packed to the front and only `count` of them drawn; the mesh stays visible so its shaders compile up front.
  private setupInstances(mesh: InstancedMesh): void {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.setColorAt(0, this.col.set(0xffffff))
    mesh.instanceColor!.setUsage(DynamicDrawUsage)
    mesh.count = 0
    this.group.add(mesh)
  }

  private buildSoil(i: number): void {
    const f = FIELDS[i]
    const nx = COLS * 6, nz = ROWS * 12
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3)
    const fuv = new Float32Array((nx + 1) * (nz + 1) * 2)
    for (let j = 0; j <= nz; j++) {
      for (let k = 0; k <= nx; k++) {
        const u = k / nx, v = j / nz
        const x = f.x0 + u * FW, z = f.z0 + v * FD
        const o = j * (nx + 1) + k
        pos.set([x, fieldBaseY(i, z), z], o * 3)
        fuv.set([u, v], o * 2)
      }
    }
    const idx: number[] = []
    for (let j = 0; j < nz; j++) {
      for (let k = 0; k < nx; k++) {
        const a = j * (nx + 1) + k, b = a + 1, c = a + nx + 1, d = c + 1
        idx.push(a, c, b, b, c, d)
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setAttribute('aF', new BufferAttribute(fuv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const data = new Uint8Array(COLS * ROWS * 4)
    const tex = new DataTexture(data, COLS, ROWS, RGBAFormat)
    tex.magFilter = LinearFilter
    tex.minFilter = LinearFilter
    tex.needsUpdate = true
    const un: FieldUniforms = {
      uHill: { value: tex }, uSoil: { value: new Color(SOIL.good) }, uWater: { value: 0 }, uCover: { value: 0 }, uHover: { value: 0 }, uAmp: { value: RIDGE_AMP },
    }
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }), {
      uniforms: un as unknown as Record<string, { value: unknown }>,
      vertexHead: /* glsl */ `
        attribute vec2 aF;
        uniform sampler2D uHill;
        uniform float uAmp;
        varying vec2 vF;
        varying float vProf;
        varying float vRidged;
        varying float vSharp;
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
      `,
      vertexNormal: /* glsl */ `
        vec2 cellF = aF * vec2(${COLS}.0, ${ROWS}.0);
        float frF = fract(cellF.y) - 0.5;
        float taperF = smoothstep(0.0, 0.03, aF.x) * smoothstep(1.0, 0.97, aF.x) * smoothstep(0.0, 0.02, aF.y) * smoothstep(1.0, 0.98, aF.y);
        vec4 hillF = texture2D(uHill, aF);
        float sharpF = smoothstep(0.55, 1.0, hillF.b);
        vec2 profF = rowProfile(frF, sharpF);
        float ampF = uAmp * hillF.b * taperF;
        objectNormal = normalize(vec3(0.0, 1.0, -ampF * (1.0 - hillF.r) * profF.y / ${SZ.toFixed(2)}));
      `,
      vertexBegin: /* glsl */ `
        float lumpsF = (vnoise(position.xz * 4.0) - 0.5) * 0.1 + (vnoise(position.xz * 11.0) - 0.5) * 0.05;
        float hF = ampF * profF.x;
        hF = mix(hF, ampF * 0.2 + 0.03 + lumpsF, hillF.r);
        transformed.y += hF;
        vF = aF;
        vProf = mix(profF.x, 0.5, hillF.r);
        vRidged = smoothstep(0.08, 0.55, hillF.b) * (1.0 - hillF.r);
        vSharp = sharpF * (1.0 - hillF.r);
        vDrill = step(0.02, hillF.b) * (1.0 - hillF.r) * (1.0 - smoothstep(0.08, 0.4, hillF.b));
        vHill = hillF;
      `,
      fragmentHead: /* glsl */ `
        uniform sampler2D uHill;
        uniform vec3 uSoil;
        uniform float uWater;
        uniform float uCover;
        uniform float uHover;
        varying vec2 vF;
        varying float vProf;
        varying float vRidged;
        varying float vSharp;
        varying float vDrill;
        varying vec4 vHill;
        float poolF;
      `,
      fragmentColor: /* glsl */ `
        {
          vec2 cell = vF * vec2(${COLS}.0, ${ROWS}.0);
          vec2 local = fract(cell) - 0.5;
          vec4 hc = texture2D(uHill, (floor(cell) + 0.5) / vec2(${COLS}.0, ${ROWS}.0));
          float n = fbm(vWorld.xz * 1.3);
          float fine = vnoise(vWorld.xz * 16.0);
          float grain = mix(0.24, 0.1, vRidged);
          vec3 soil = uSoil * (0.84 + 0.3 * n) * (1.0 - grain * 0.5 + grain * fine);
          // Drill lines when planted; the higher the rows are thrown up, the deeper the furrows and the brighter the crests,
          // with relief shading from the back of the farm, as on a painted relief map, so the faces toward the viewer fall dark.
          float relief = dot(normalize(vWNormal), vec3(-0.3, 0.62, -0.72));
          soil *= mix(1.0, mix(0.62, 1.2 + 0.1 * vSharp, vProf) * (0.6 + 0.72 * clamp(relief, -0.3, 1.0)), vRidged);
          soil *= 1.0 - 0.5 * vSharp * (1.0 - smoothstep(0.0, 0.18, vProf));
          soil *= 1.0 - 0.22 * vDrill * smoothstep(0.82, 0.97, vProf);
          float clod = smoothstep(0.7, 0.9, vnoise(vWorld.xz * 7.0 + 3.1));
          soil = mix(soil, soil * 1.2, clod * 0.45 * mix(0.6, vProf, vRidged) * (1.0 - 0.6 * vRidged));
          float lump = vnoise(vWorld.xz * 6.0);
          vec3 turned = uSoil * mix(0.55, 1.05, smoothstep(0.35, 0.75, lump)) * (0.88 + 0.24 * fine);
          soil = mix(soil, turned, vHill.r);
          float hole = hc.g * (1.0 - smoothstep(0.16, 0.3, length(local * vec2(${(SX / SZ).toFixed(2)}, 1.0))));
          soil = mix(soil, soil * 0.45, hole);
          if (uCover > 0.001) {
            float cov = uCover * smoothstep(0.25, 0.55, fbm(vWorld.xz * 0.8) * 0.55 + 0.45 * uCover + 0.15 * fine);
            vec3 clover = vec3(0.105, 0.19, 0.06) * (0.75 + 0.5 * n) * (0.85 + 0.3 * fine);
            clover = mix(clover, vec3(0.75, 0.72, 0.7), step(0.93, vnoise(vWorld.xz * 22.0)) * 0.6);
            soil = mix(soil, clover, cov);
          }
          poolF = 0.0;
          if (uWater > 0.001) poolF = uWater * mix(1.0, 1.0 - smoothstep(0.1, 0.35, vProf), vRidged) * smoothstep(0.5, 0.62, fbm(vWorld.xz * 0.35));
          soil = mix(soil, vec3(0.03, 0.035, 0.035), poolF);
          diffuseColor.rgb = soil * (1.0 + uHover * 0.22);
        }
        ${CLOUD_SHADE}
        ${SNOW_RIME}
      `,
      fragmentRoughness: 'roughnessFactor = mix(roughnessFactor, 0.06, poolF);',
      fragmentEmissive: 'totalEmissiveRadiance += uSky * poolF * 0.5;',
    })
    const mesh = new Mesh(geo, mat)
    mesh.receiveShadow = true
    mesh.userData.field = i
    this.group.add(mesh)
    this.soils.push(mesh)
    this.uniforms.push(un)
    this.hillData.push(data)
    this.soilTarget.push(new Color(SOIL.good))
    this.waterTarget.push(0)
    this.coverTarget.push(0)
    this.hoverTarget.push(0)
    this.disposables.push(geo, mat, tex)
  }

  private buildOutline(i: number): void {
    const f = FIELDS[i]
    const pad = 0.28, w = 0.16
    const pts: number[] = []
    const corners: [number, number][] = [[f.x0 - pad, f.z0 - pad], [f.x1 + pad, f.z0 - pad], [f.x1 + pad, f.z1 + pad], [f.x0 - pad, f.z1 + pad]]
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4]
      const dx = Math.sign(bx - ax), dz = Math.sign(bz - az)
      const nx = -dz * w, nz = dx * w
      const a0x = ax - dx * w, a0z = az - dz * w, b0x = bx + dx * w, b0z = bz + dz * w
      const quad = [[a0x - nx, a0z - nz], [a0x + nx, a0z + nz], [b0x - nx, b0z - nz], [b0x + nx, b0z + nz]]
      for (const o of [0, 1, 2, 2, 1, 3]) {
        const [x, z] = quad[o]
        pts.push(x, fieldBaseY(i, Math.max(f.z0, Math.min(f.z1, z))) + 0.1, z)
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    const mat = new MeshBasicMaterial({ color: 0xf3ecdc, transparent: true, opacity: 0, depthWrite: false, side: 2, fog: false })
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -2
    const mesh = new Mesh(geo, mat)
    mesh.renderOrder = 2
    this.group.add(mesh)
    this.outlines.push(mesh)
    this.outlineMats.push(mat)
    this.disposables.push(geo, mat)
  }

  // Set what each hill should look like. `display` may hold hills still waiting to be revealed by the tractor.
  setTargets(fields: FieldVis[], display: HillDisplay[][]): void {
    for (let i = 0; i < FIELD_COUNT; i++) {
      const fv = fields[i]
      this.rest[i] = fv.crop === 'rest'
      this.wilt[i] = fv.wilt
      this.frost[i] = fv.frosted
      this.soilTarget[i].set(SOIL[fv.moisture] ?? SOIL.good)
      this.waterTarget[i] = fv.moisture === 'standing water' ? 1 : 0
      this.coverTarget[i] = fv.crop === 'rest' ? 1 : 0
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
    const t = this.tgt, o = k * 10
    const col = this.col
    let w = 0, h = 0, bloom = 0, dead = 0
    const wilt = fv.wilt
    if (look.kind === 'plant') {
      const c = Math.max(0.02, look.canopy)
      // Frost blackens leaf where it stands: the plant keeps its spread and slumps, it does not turn into a small green one.
      const frost = fv.frosted > 0 ? Math.min(1, fv.frosted * (0.75 + 0.5 * hash2(k, 21))) : 0
      const spread = frost > 0 ? Math.min(1, c / Math.max(0.15, 1 - fv.frosted)) : c
      const vig = 0.78 + 0.22 * Math.min(1.2, look.vigor)
      const stunt = look.stunted ? 0.68 : 1
      const bl = Math.min(1, look.blight * 2.2)
      w = (0.2 + 1.02 * spread) * vig * stunt * (1 + 0.16 * wilt) * (1 - 0.1 * bl) * (1 + 0.1 * frost)
      h = (0.14 + 0.62 * spread) * vig * stunt * (1 - 0.62 * wilt) * (1 - 0.3 * Math.max(0, bl - 0.5)) * (1 - 0.35 * look.yellow) * (1 - 0.55 * frost)
      col.copy(C.young).lerp(C.leaf, Math.min(1, Math.max(0, (spread - 0.12) / 0.45)))
      if (look.yellow > 0) col.lerp(C.old, Math.min(1, look.yellow * 1.6)).lerp(C.straw, Math.max(0, look.yellow - 0.55) * 1.8)
      if (look.stunted) col.lerp(C.pale, 0.5)
      if (wilt > 0) col.lerp(C.droop, Math.min(1, wilt * 1.1))
      if (bl > 0) col.lerp(C.blight, Math.min(1, bl * 1.6)).lerp(C.blightDeep, Math.max(0, bl - 0.55) * 1.6)
      if (frost > 0) col.lerp(C.frost, Math.min(1, frost * 1.15))
      bloom = fv.bloom * Math.min(1, Math.max(0, (c - 0.25) / 0.25)) * (1 - look.yellow) * (1 - bl) * (1 - Math.min(1, frost * 1.5))
    } else if (look.kind === 'dead') {
      dead = 1
      w = 0.95
      h = 1
      col.copy(C.dead)
    } else {
      col.copy(C.leaf)
    }
    const j = hash2(k, 3) * 0.12 - 0.06
    t[o] = w
    t[o + 1] = h
    t[o + 2] = col.r * (1 + j)
    t[o + 3] = col.g * (1 + j)
    t[o + 4] = col.b * (1 + j * 0.5)
    t[o + 5] = bloom
    t[o + 6] = dead
    t[o + 7] = look.kind === 'dug' ? 1 : 0
    t[o + 8] = look.kind === 'pulled' ? 1 : 0
    t[o + 9] = ridge
  }

  setHover(i: number): void {
    for (let k = 0; k < FIELD_COUNT; k++) this.hoverTarget[k] = k === i ? 1 : 0
  }

  // dt in seconds. Returns nothing; updates instance buffers where something is still moving.
  update(dt: number, opts: { selected: number; hovered: number; oats: number; oatsRipe: number; wind: number; time: number; reduced: boolean }, tints: number[]): void {
    const kFast = 1 - Math.exp(-dt * 6), kSlow = 1 - Math.exp(-dt * 2.5)
    for (let i = 0; i < FIELD_COUNT; i++) {
      const un = this.uniforms[i]
      un.uSoil.value.lerp(this.soilTarget[i], kSlow)
      un.uWater.value += (this.waterTarget[i] - un.uWater.value) * kSlow
      un.uCover.value += (this.coverTarget[i] * (0.35 + 0.65 * opts.oats) - un.uCover.value) * kSlow
      un.uHover.value += ((i === opts.hovered ? 1 : 0) - un.uHover.value) * kFast
      const sel = i === opts.selected
      const pulse = opts.reduced ? 1 : 0.85 + 0.15 * Math.sin(opts.time * 3)
      const target = sel ? 0.95 * pulse : i === opts.hovered ? 0.45 : 0
      const mat = this.outlineMats[i]
      mat.opacity += (target - mat.opacity) * kFast
      this.outlines[i].visible = mat.opacity > 0.01
    }
    if (!this.settled) this.stepHills(kFast, tints)
    this.updateTufts(opts.oats, opts.oatsRipe)
  }

  private stepHills(k: number, tints: number[]): void {
    const cur = this.cur, tgt = this.tgt
    let moving = false
    for (let n = 0; n < N * 10; n++) {
      const d = tgt[n] - cur[n]
      if (Math.abs(d) > 0.002) { cur[n] += d * k; moving = true } else cur[n] = tgt[n]
    }
    this.writeInstances(tints)
    if (!moving) this.settled = true
  }

  // Jump everything to its target, for screenshots and first frames.
  snap(tints: number[]): void {
    this.cur.set(this.tgt)
    for (let i = 0; i < FIELD_COUNT; i++) {
      const un = this.uniforms[i]
      un.uSoil.value.copy(this.soilTarget[i])
      un.uWater.value = this.waterTarget[i]
    }
    this.writeInstances(tints)
    this.settled = true
  }

  // Only the plants, flowers and dead vines that are there are written, packed to the front of each buffer.
  private writeInstances(tints: number[]): void {
    const cur = this.cur
    const { m, q, v, s, col } = this
    const up = new Vector3(0, 1, 0)
    let np = 0, nb = 0, nd = 0
    for (let i = 0; i < FIELD_COUNT; i++) {
      const data = this.hillData[i]
      const tint = tints[i]
      for (let h = 0; h < HILLS; h++) {
        const k = i * HILLS + h, o = k * 10
        const ridge = cur[o + 9], dug = cur[o + 7]
        data[h * 4] = Math.round(dug * 255)
        data[h * 4 + 1] = Math.round(cur[o + 8] * 255)
        data[h * 4 + 2] = Math.round(ridge * 255)
        data[h * 4 + 3] = 255
        const dead = cur[o + 6]
        const w = cur[o] * (1 - dead), hh = cur[o + 1] * (1 - dead)
        const plant = w > SHOWN && hh > SHOWN
        if (!plant && dead <= SHOWN) continue
        const p = hillPos(i, h)
        const jx = (hash2(k, 1) - 0.5) * 0.1, jz = (hash2(k, 2) - 0.5) * 0.08
        const y = fieldBaseY(i, p.z) + RIDGE_AMP * ridge * (1 - dug) + (dug > 0 ? 0.03 : 0)
        q.setFromAxisAngle(up, (hash2(k, 5) < 0.5 ? 0 : Math.PI) + (hash2(k, 8) - 0.5) * 0.5)
        v.set(p.x + jx, y - 0.02, p.z + jz)
        if (plant) {
          const swayK = (1 - 0.6 * this.wilt[i]) * (1 - 0.7 * this.frost[i]) * (dead > 0.5 ? 0.2 : 1)
          m.compose(v, q, s.set(w * SZ * 1.18, hh, w * SZ * 0.94))
          this.plants.setMatrixAt(np, m)
          this.plants.setColorAt(np, col.setRGB(cur[o + 2], cur[o + 3], cur[o + 4]))
          this.aSway.setX(np, swayK)
          np++
          if (cur[o + 5] > 0.02) {
            this.blossoms.setMatrixAt(nb, m)
            this.blossoms.setColorAt(nb, col.copy(C.white).lerp(C.lilac, tint * (0.6 + 0.4 * hash2(k, 9))))
            this.aBloom.setX(nb, cur[o + 5])
            this.aSwayB.setX(nb, swayK)
            nb++
          }
        }
        if (dead > SHOWN) {
          const dw = dead * (0.85 + 0.25 * hash2(k, 4))
          m.compose(v, q, s.set(dw * SZ, dead, dw * SZ))
          this.deads.setMatrixAt(nd, m)
          this.deads.setColorAt(nd, col.copy(C.dead).multiplyScalar(0.85 + 0.3 * hash2(k, 6)))
          nd++
        }
      }
      this.uniforms[i].uHill.value.needsUpdate = true
    }
    this.plants.count = np
    this.blossoms.count = nb
    this.deads.count = nd
    upload(np, this.plants.instanceMatrix, this.plants.instanceColor, this.aSway)
    upload(nb, this.blossoms.instanceMatrix, this.blossoms.instanceColor, this.aBloom, this.aSwayB)
    upload(nd, this.deads.instanceMatrix, this.deads.instanceColor)
  }

  private updateTufts(oats: number, ripe: number): void {
    const key = Math.round(oats * 60) * 1000 + Math.round(ripe * 60) + this.rest.reduce((a, r, i) => a + (r ? 1 << (i + 20) : 0), 0)
    if (key === this.tuftRipe) return
    this.tuftRipe = key
    const { m, q, v, s, col } = this
    const up = new Vector3(0, 1, 0)
    let n = 0
    for (let i = 0; i < FIELD_COUNT; i++) {
      const f = FIELDS[i]
      const grow = this.rest[i] ? oats : 0
      this.tuftGrow[i] = grow
      if (grow <= SHOWN) continue
      for (let t = 0; t < TUFTS; t++) {
        const k = i * TUFTS + t
        const gx = t % TUFTS_X, gz = Math.floor(t / TUFTS_X)
        const x = f.x0 + ((gx + 0.5 + (hash2(k, 11) - 0.5) * 0.9) / TUFTS_X) * FW
        const z = f.z0 + ((gz + 0.5 + (hash2(k, 12) - 0.5) * 0.25) / TUFTS_Z) * FD
        const hgt = grow * (0.5 + 0.35 * hash2(k, 13))
        q.setFromAxisAngle(up, hash2(k, 14) * Math.PI * 2)
        const wdt = 0.75 + 0.45 * hash2(k, 15)
        m.compose(v.set(x, fieldBaseY(i, z) - 0.01, z), q, s.set(wdt, hgt, wdt))
        this.tufts.setMatrixAt(n, m)
        col.copy(C.oat).lerp(C.oatRipe, ripe * (0.7 + 0.3 * hash2(k, 16))).multiplyScalar(0.85 + 0.3 * hash2(k, 17))
        this.tufts.setColorAt(n, col)
        n++
      }
    }
    this.tufts.count = n
    upload(n, this.tufts.instanceMatrix, this.tufts.instanceColor)
  }

  // Height of the top of the crop in a field, for labels.
  topY(i: number): number {
    return fieldBaseY(i, FIELDS[i].z0) + 0.6
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    for (const mesh of [this.plants, this.blossoms, this.deads, this.tufts]) mesh.dispose()
  }
}

export function bloomTint(variety: string): number {
  return BLOOM_TINT[variety] ?? 0.2
}
