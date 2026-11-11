// The block of land: turf and road on top, soil on the cut faces, the brook in front, stone walls.
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3,
} from 'three'
import { BLOCK, BROOK_Z, FIELDS, WATER_Y, fieldMask, groundY, roadDist } from './layout.ts'
import { hash2, rng, smooth } from './noise.ts'
import { SNOW_RIME, patch } from './shaders.ts'
import { STRATA_PX, strataTexture } from './textures.ts'

export const CLOUD_SHADE = /* glsl */ `
  if (uCloud > 0.001) diffuseColor.rgb *= 1.0 - uCloud * 0.38 * smoothstep(0.48, 0.66, fbm(vWorld.xz * 0.045 + vec2(uTime * 0.035, uTime * 0.012)));
`

const STEP = 0.25

export interface Terrain {
  group: Group
  water: { ice: { value: number } }
  dispose(): void
}

export function buildTerrain(): Terrain {
  const group = new Group()
  const disposables: { dispose(): void }[] = []

  // ---- Top surface
  const nx = Math.round((BLOCK.x1 - BLOCK.x0) / STEP) + 1
  const nz = Math.round((BLOCK.z1 - BLOCK.z0) / STEP) + 1
  const pos = new Float32Array(nx * nz * 3)
  const surf = new Float32Array(nx * nz * 4)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = Math.min(BLOCK.x1, BLOCK.x0 + i * STEP), z = Math.min(BLOCK.z1, BLOCK.z0 + j * STEP)
      const k = j * nx + i
      const field = fieldMask(x, z, 0.3)
      pos[k * 3] = x
      pos[k * 3 + 1] = groundY(x, z) - field * 0.04
      pos[k * 3 + 2] = z
      const rd = roadDist(x, z)
      const ruts = 1 - 0.55 * (1 - smooth(0.06, 0.2, rd))
      surf[k * 4] = (1 - smooth(0.5, 0.78, rd)) * ruts
      surf[k * 4 + 1] = smooth(-15.3, -16.6, z) * (1 - smooth(0.5, 1.5, rd))
      surf[k * 4 + 2] = Math.max(1 - smooth(0.55, 1.05, Math.abs(z - BROOK_Z)), field * 0.9)
      surf[k * 4 + 3] = hash2(i, j)
    }
  }
  const idx: number[] = []
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  }
  const top = new BufferGeometry()
  top.setAttribute('position', new BufferAttribute(pos, 3))
  top.setAttribute('aSurf', new BufferAttribute(surf, 4))
  top.setIndex(idx)
  top.computeVertexNormals()
  const topMat = patch(new MeshLambertMaterial({ color: 0xffffff }), {
    vertexHead: 'attribute vec4 aSurf; varying vec4 vSurf;',
    vertexBegin: 'vSurf = aSurf;',
    fragmentHead: 'varying vec4 vSurf;',
    fragmentColor: /* glsl */ `
      {
        float n = fbm(vWorld.xz * 0.55);
        float fine = vnoise(vWorld.xz * 5.0);
        vec3 grass = uGrass * (0.8 + 0.38 * n) * (0.9 + 0.2 * fine) * (0.95 + 0.1 * vSurf.w);
        grass *= 1.0 - 0.12 * uWet;
        float steep = 1.0 - smoothstep(0.75, 0.95, vWNormal.y);
        grass = mix(grass, grass * vec3(1.05, 0.95, 0.8), steep * 0.6);
        vec3 woods = vec3(0.075, 0.07, 0.045) * (0.8 + 0.5 * n);
        vec3 road = mix(vec3(0.26, 0.21, 0.155), vec3(0.15, 0.12, 0.09), uWet) * (0.8 + 0.35 * fine);
        vec3 mud = mix(vec3(0.17, 0.13, 0.09), vec3(0.1, 0.075, 0.05), uWet) * (0.85 + 0.3 * fine);
        vec3 col = mix(grass, woods, vSurf.y);
        col = mix(col, mud, vSurf.z * 0.85);
        col = mix(col, road, vSurf.x);
        diffuseColor.rgb = col;
      }
      ${CLOUD_SHADE}
      ${SNOW_RIME}
    `,
  })
  const topMesh = new Mesh(top, topMat)
  topMesh.receiveShadow = true
  group.add(topMesh)
  disposables.push(top, topMat)

  // ---- Cut faces
  const strata = strataTexture()
  disposables.push(strata)
  const skirt = skirtGeometry(nx, nz, pos)
  const skirtMat = new MeshLambertMaterial({ map: strata, color: 0xffffff, emissive: 0x2a2018 })
  const skirtMesh = new Mesh(skirt, skirtMat)
  group.add(skirtMesh)
  disposables.push(skirt, skirtMat)

  // The underside, so the block never looks hollow.
  const under = new PlaneGeometry(BLOCK.x1 - BLOCK.x0, BLOCK.z1 - BLOCK.z0)
  under.rotateX(Math.PI / 2)
  under.translate((BLOCK.x0 + BLOCK.x1) / 2, BLOCK.base, (BLOCK.z0 + BLOCK.z1) / 2)
  const underMat = new MeshBasicMaterial({ color: 0x2a221b })
  group.add(new Mesh(under, underMat))
  disposables.push(under, underMat)

  // A soft shadow under the block.
  const shadowTex = blobTexture()
  const shadowGeo = new PlaneGeometry(BLOCK.x1 - BLOCK.x0 + 14, BLOCK.z1 - BLOCK.z0 + 14)
  shadowGeo.rotateX(-Math.PI / 2)
  shadowGeo.translate((BLOCK.x0 + BLOCK.x1) / 2 + 3, BLOCK.base - 0.6, (BLOCK.z0 + BLOCK.z1) / 2 + 1)
  const shadowMat = new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x1a1612, fog: false })
  const shadowMesh = new Mesh(shadowGeo, shadowMat)
  shadowMesh.renderOrder = -1
  group.add(shadowMesh)
  disposables.push(shadowTex, shadowGeo, shadowMat)

  // ---- The brook
  const ice = { value: 0 }
  const waterGeo = new PlaneGeometry(BLOCK.x1 - BLOCK.x0, 2.2, 120, 8)
  waterGeo.rotateX(-Math.PI / 2)
  waterGeo.translate((BLOCK.x0 + BLOCK.x1) / 2, WATER_Y, BROOK_Z)
  const waterMat = patch(new MeshStandardMaterial({ color: 0x2f403d, roughness: 0.85, metalness: 0.0, side: DoubleSide }), {
    uniforms: { uIce: ice },
    fragmentHead: 'uniform float uIce; float waterGlint;',
    fragmentColor: /* glsl */ `
      {
        float flow = fbm(vec2(vWorld.x * 0.7 - uTime * 0.5, vWorld.z * 2.2));
        vec3 deep = vec3(0.006, 0.014, 0.018);
        vec3 shallow = vec3(0.016, 0.03, 0.032);
        vec3 col = mix(deep, shallow, smoothstep(0.3, 0.75, flow));
        col = mix(col, vec3(0.62, 0.66, 0.7) * (0.9 + 0.1 * flow), uIce);
        col = mix(col, vec3(0.9, 0.92, 0.94), uIce * uSnow * smoothstep(0.35, 0.6, fbm(vWorld.xz * 0.6)));
        diffuseColor.rgb = col;
        float edge = smoothstep(0.55, 0.85, abs(vWorld.z - ${BROOK_Z.toFixed(2)}));
        waterGlint = (1.0 - uIce) * (0.006 + 0.012 * flow + 0.16 * smoothstep(0.74, 0.82, flow)) * (1.0 - 0.6 * edge);
      }
    `,
    fragmentEmissive: 'totalEmissiveRadiance += uSky * waterGlint;',
    fragmentRoughness: 'roughnessFactor = mix(0.85, 0.7, uIce);',
  })
  const water = new Mesh(waterGeo, waterMat)
  water.receiveShadow = true
  group.add(water)
  disposables.push(waterGeo, waterMat)
  const faces = waterFaces()
  const facesMat = new MeshLambertMaterial({ color: 0x24322f, transparent: true, opacity: 0.85, side: DoubleSide })
  group.add(new Mesh(faces, facesMat))
  disposables.push(faces, facesMat)

  // ---- Stone walls and rock piles along the field edges
  const rocks = stoneWalls()
  group.add(rocks)
  disposables.push(rocks.geometry, rocks.material as MeshLambertMaterial)

  return {
    group,
    water: { ice },
    dispose() { for (const d of disposables) d.dispose() },
  }
}

function skirtGeometry(nx: number, nz: number, top: Float32Array): BufferGeometry {
  // Walk the rim: front (z1), right (x1), back (z0), left (x0), so the faces point outward.
  const rim: number[] = []
  for (let i = 0; i < nx; i++) rim.push((nz - 1) * nx + i)
  for (let j = nz - 2; j >= 0; j--) rim.push(j * nx + nx - 1)
  for (let i = nx - 2; i >= 0; i--) rim.push(i)
  for (let j = 1; j < nz; j++) rim.push(j * nx)
  const pos: number[] = [], uv: number[] = [], nrm: number[] = []
  let s = 0
  const W = 512 / STRATA_PX, H = 640 / STRATA_PX
  for (let k = 0; k < rim.length - 1; k++) {
    const a = rim[k], b = rim[k + 1]
    const ax = top[a * 3], ay = top[a * 3 + 1], az = top[a * 3 + 2]
    const bx = top[b * 3], by = top[b * 3 + 1], bz = top[b * 3 + 2]
    const len = Math.hypot(bx - ax, bz - az)
    if (len < 1e-6) continue
    const nxv = -(bz - az) / len, nzv = (bx - ax) / len
    const s1 = s + len
    // two triangles: a-top, a-bottom, b-top, b-bottom
    const quad = [[ax, ay, az, s, 0], [ax, BLOCK.base, az, s, ay - BLOCK.base], [bx, by, bz, s1, 0], [bx, BLOCK.base, bz, s1, by - BLOCK.base]]
    for (const q of [quad[0], quad[1], quad[2], quad[2], quad[1], quad[3]]) {
      pos.push(q[0], q[1], q[2])
      uv.push(q[3] / W, 1 - q[4] / H)
      nrm.push(nxv, 0, nzv)
    }
    s = s1
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  return g
}

function waterFaces(): BufferGeometry {
  const pos: number[] = []
  for (const x of [BLOCK.x0, BLOCK.x1]) {
    const out = x === BLOCK.x0 ? -1 : 1
    for (let z = BROOK_Z - 1.4; z < BROOK_Z + 1.4; z += 0.1) {
      const y0 = groundY(x, z), y1 = groundY(x, z + 0.1)
      if (y0 >= WATER_Y && y1 >= WATER_Y) continue
      const xo = x + out * 0.005
      const quad = [[xo, Math.min(y0, WATER_Y), z], [xo, WATER_Y, z], [xo, Math.min(y1, WATER_Y), z + 0.1], [xo, WATER_Y, z + 0.1]]
      const order = out > 0 ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 2, 1, 3]
      for (const o of order) pos.push(...quad[o])
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.computeVertexNormals()
  return g
}

function stoneWalls(): InstancedMesh {
  const spots: [number, number, number][] = []
  const r = rng(77)
  const line = (x0: number, z0: number, x1: number, z1: number, every: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / every))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const x = x0 + (x1 - x0) * t + (r() - 0.5) * 0.25, z = z0 + (z1 - z0) * t + (r() - 0.5) * 0.25
      if (roadDist(x, z) < 1.2) continue
      spots.push([x, z, 0.13 + r() * 0.13])
      if (r() < 0.55) spots.push([x + (r() - 0.5) * 0.2, z + (r() - 0.5) * 0.2, 0.1 + r() * 0.08])
    }
  }
  line(-12.5, -15.2, -12.4, 16.1, 0.24)
  line(-12.4, -15.4, 12.2, -15.4, 0.26)
  for (const f of FIELDS) if (f.i % 2 === 0) line(f.x1 + 0.6, f.z0 + 0.2, f.x1 + 0.6, f.z1 - 0.2, 0.75)
  const geo = new IcosahedronGeometry(1, 0)
  const mat = patch(new MeshLambertMaterial({ color: 0xffffff, flatShading: true }), { fragmentColor: SNOW_RIME })
  const mesh = new InstancedMesh(geo, mat, spots.length)
  const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3(), e = new Vector3()
  const col = new Color()
  const greys = ['#8e8a82', '#a29d93', '#76726b', '#9a9488', '#827b70']
  spots.forEach(([x, z, s], k) => {
    p.set(x, groundY(x, z) + s * 0.35, z)
    q.setFromAxisAngle(e.set(r(), r(), r()).normalize(), r() * Math.PI)
    sc.set(s * (1 + r() * 0.5), s * (0.6 + r() * 0.3), s * (1 + r() * 0.4))
    mesh.setMatrixAt(k, m.compose(p, q, sc))
    mesh.setColorAt(k, col.set(greys[k % greys.length]))
  })
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.3)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

