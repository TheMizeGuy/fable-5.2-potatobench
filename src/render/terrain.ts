// The land: one surface from the farm out to the far ridges, the neighbours' quilt of strips and woodlots drawn on it,
// the brook, the roads and the stone walls.
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, Quaternion, Vector3, type Texture,
} from 'three'
import {
  FARM, FIELDS, HOME_WOODS, REGION, ROAD, SPURS, WALLS, WATER_Y, brookHalf, brookZ, fieldMask, groundY, hillRoadZ, roadDist, townRoadZ,
} from './layout.ts'
import { hash2, rng } from './noise.ts'
import { SNOW_RIME, linear, patch } from './shaders.ts'

export interface Terrain {
  group: Group
  water: { ice: { value: number } }
  dispose(): void
}

// A run of grid lines: even across the farm, widening outward to the horizon.
function axis(lo: number, hi: number, step: number, growth: number, limit: number): number[] {
  const out: number[] = []
  for (let v = lo; v <= hi + 1e-6; v += step) out.push(v)
  let s = step, a = lo, b = hi
  while (b < limit) {
    s *= growth
    a -= s
    b += s
    out.unshift(a)
    out.push(b)
  }
  return out
}

// The quilt, as in regionAt() in layout.ts, and what grows on each strip by the day of the year.
const QUILT_GLSL = /* glsl */ `
struct Land { float woods; float hard; float edge; vec2 q; float width; ivec2 cell; };
Land landAt(vec2 p) {
  ivec2 c = ivec2(floor(p / ${REGION.toFixed(1)}));
  float d1 = 1e9, d2 = 1e9;
  ivec2 best = c;
  vec2 site = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 cc = c + ivec2(i, j);
      vec2 s = (vec2(cc) + 0.5 + (vec2(ihash(cc + ivec2(131, 17)), ihash(cc + ivec2(-57, 211))) - 0.5) * 0.72) * ${REGION.toFixed(1)};
      float d = distance(p, s);
      if (d < d1) { d2 = d1; d1 = d; best = cc; site = s; } else if (d < d2) d2 = d;
    }
  }
  Land l;
  l.cell = best;
  l.edge = (d2 - d1) * 0.5;
  l.woods = step(ihash(best + ivec2(19, -83)), 0.26 + 0.42 * smoothstep(700.0, 2400.0, distance(site, vec2(4.6, 0.0))));
  l.hard = ihash(best + ivec2(43, 7));
  float ang = (ihash(best + ivec2(77, 301)) < 0.5 ? 0.0 : 1.5707963) + (ihash(best + ivec2(5, 9)) - 0.5) * 0.7;
  l.width = 12.0 + 14.0 * ihash(best + ivec2(-3, 41));
  vec2 r = p - site;
  l.q = vec2(cos(ang) * r.x + sin(ang) * r.y, -sin(ang) * r.x + cos(ang) * r.y);
  return l;
}
float ramp(float a, float b, float x) { return clamp((x - a) / (b - a), 0.0, 1.0); }
// A strip's colour: potatoes, oats, hay, clover or pasture, each by the calendar. rows: 1 where a crop is drilled in rows.
vec3 cropColor(float kind, float tone, float day, vec3 soil, vec3 grass, out float rows) {
  rows = 0.0;
  float d = day + (tone - 0.5) * 10.0;
  vec3 col;
  if (kind < 0.36) {
    float up = ramp(150.0, 186.0, d), down = ramp(238.0, 258.0, d), dug = ramp(262.0, 276.0, d);
    vec3 leaf = mix(${linear('#6fa355')}, ${linear('#3a6b3c')}, ramp(160.0, 200.0, d));
    leaf = mix(leaf, ${linear('#d9dcc9')}, 0.2 * ramp(190.0, 198.0, d) * (1.0 - ramp(212.0, 222.0, d)));
    leaf = mix(leaf, ${linear('#7a6f48')}, down);
    col = mix(soil, leaf, up * (1.0 - dug));
    rows = (0.25 + 0.75 * (1.0 - up)) * step(128.0, d) * (1.0 - dug);
  } else if (kind < 0.58) {
    float up = ramp(128.0, 160.0, d), ripe = ramp(205.0, 232.0, d), cut = ramp(242.0, 250.0, d);
    vec3 oat = mix(${linear('#7fa46a')}, ${linear('#cfb56b')}, ripe);
    col = mix(mix(soil, oat, up), ${linear('#b8a778')}, cut);
    col = mix(col, grass, 0.35 * cut * ramp(262.0, 290.0, d));
    rows = 0.12 * (1.0 - up);
  } else if (kind < 0.8) {
    float mown = max(ramp(176.0, 179.0, d) * (1.0 - ramp(190.0, 204.0, d)), ramp(234.0, 237.0, d) * (1.0 - ramp(246.0, 262.0, d)));
    col = mix(grass * vec3(0.92, 1.06, 0.82), ${linear('#a9ad62')}, mown);
    rows = 0.3 * mown;
  } else if (kind < 0.92) {
    col = mix(grass * vec3(0.72, 0.98, 0.7), ${linear('#8f6f86')}, 0.2 * ramp(168.0, 180.0, d) * (1.0 - ramp(206.0, 220.0, d)));
  } else {
    col = grass * vec3(1.05, 1.0, 0.86);
  }
  return col;
}
`

export function buildTerrain(roadTex: Texture): Terrain {
  const group = new Group()
  const disposables: { dispose(): void }[] = []

  const xs = axis(-50.2, 60.2, 0.6, 1.065, 3600), zs = axis(-64.2, 64.2, 0.6, 1.065, 3600)
  const nx = xs.length, nz = zs.length
  const pos = new Float32Array(nx * nz * 3)
  const surf = new Float32Array(nx * nz * 4)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], k = j * nx + i
      const home = x > -50.5 && x < 60.5 && z > -64.5 && z < 64.5
      pos[k * 3] = x
      pos[k * 3 + 1] = groundY(x, z) - (home ? fieldMask(x, z, 0.35) * 0.09 : 0)
      pos[k * 3 + 2] = z
      const h = HOME_WOODS
      const ragged = home ? 3 * (hash2(Math.round(x * 0.4), Math.round(z * 0.4)) - 0.5) : 0
      surf[k * 4] = home && x > h.x0 + ragged && x < h.x1 + ragged && z > h.z0 + ragged && z < h.z1 + 1 ? 1 : 0
      surf[k * 4 + 1] = Math.min(1, Math.abs(z - brookZ(x)) / 8)
      const yard = home ? Math.max(0, 1 - roadDist(x, z) / 2.2) : 0
      surf[k * 4 + 2] = yard
      surf[k * 4 + 3] = hash2(i, j)
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6)
  let n = 0
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
      idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d
    }
  }
  const land = new BufferGeometry()
  land.setAttribute('position', new BufferAttribute(pos, 3))
  land.setAttribute('aSurf', new BufferAttribute(surf, 4))
  land.setIndex(new BufferAttribute(idx, 1))
  land.computeVertexNormals()
  const fieldRects = FIELDS.map(f => `vec4(${f.x0.toFixed(2)}, ${f.z0.toFixed(2)}, ${f.x1.toFixed(2)}, ${f.z1.toFixed(2)})`).join(', ')
  const landMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 }), {
    vertexHead: 'attribute vec4 aSurf; varying vec4 vSurf;',
    vertexBegin: 'vSurf = aSurf;',
    fragmentHead: /* glsl */ `
      varying vec4 vSurf;
      ${QUILT_GLSL}
      const vec4 FIELD_RECT[6] = vec4[6](${fieldRects});
      float landRough;
      vec2 landBump;
    `,
    fragmentColor: /* glsl */ `
      {
        vec2 p = vWorld.xz;
        float far = length(vWorld - cameraPosition);
        vec4 n1 = texture2D(uNoise, p * 0.0037);
        vec4 n2 = texture2D(uNoise, p * 0.043);
        vec4 n3 = texture2D(uNoise, p * 0.31);
        float fine = n3.a, mid = n2.b, broad = n1.b;
        // Meadow: no two yards the same green. Clover dark, seed heads pale, worn places thin.
        float patchy = texture2D(uNoise, p * 0.011).b, tuft = texture2D(uNoise, p * 0.13).a;
        vec3 grass = uGrass * (0.62 + 0.62 * mid) * (0.82 + 0.36 * fine) * (0.84 + 0.32 * broad);
        grass = mix(grass, grass * vec3(0.72, 0.95, 0.7), smoothstep(0.52, 0.7, patchy) * uLeaf);
        grass = mix(grass, grass * vec3(1.32, 1.2, 0.86), smoothstep(0.5, 0.78, tuft) * 0.7 * uLeaf);
        vec3 soil = ${linear('#7a4c38')} * (0.8 + 0.4 * mid) * mix(1.0, 0.62, uWet);
        landRough = 0.96;
        landBump = (n3.rg - 0.5) * 1.6 + (n2.rg - 0.5) * 0.8;

        // Home: meadow inside the walls, needles under the spruce, trodden earth in the dooryard, gravel by the brook.
        vec2 hd = max(vec2(${FARM.x0.toFixed(1)}, ${FARM.z0.toFixed(1)}) - p, p - vec2(${FARM.x1.toFixed(1)}, ${(FARM.z1 + 3).toFixed(1)}));
        float home = 1.0 - smoothstep(-1.5, 2.5, max(hd.x, hd.y));
        vec3 col = grass;
        {
          Land l = landAt(p);
          float strip = floor(l.q.x / l.width), fx = fract(l.q.x / l.width);
          float along = floor(l.q.y / (l.width * 3.4) + ihash(ivec2(int(strip) + l.cell.x * 31, l.cell.y * 17 + 5)));
          ivec2 id = ivec2(int(strip) * 7 + l.cell.x * 13 + int(along) * 3, l.cell.y * 29 + int(along));
          float kind = ihash(id), tone = ihash(id + ivec2(3, 11));
          float rows;
          vec3 crop = cropColor(kind, tone, uDay, soil, grass, rows) * (0.86 + 0.28 * tone);
          float period = ${(0.34).toFixed(2)};
          float line = 0.5 + 0.5 * cos(l.q.x * 6.2831853 / period);
          float show = rows * (1.0 - smoothstep(0.2, 0.7, fwidth(l.q.x) / period));
          crop *= 1.0 - show * 0.45 * (1.0 - line);
          // mowing and tillage lines that carry at any distance
          float sweep = 0.5 + 0.5 * cos(l.q.x * 6.2831853 / (l.width * 0.2));
          crop *= 0.95 + 0.07 * sweep * (1.0 - smoothstep(0.5, 2.0, fwidth(l.q.x) / (l.width * 0.2)));
          float verge = min(fx, 1.0 - fx) * l.width;
          float aa = fwidth(l.q.x) + 0.25;
          crop = mix(grass * 0.82, crop, smoothstep(0.35, 0.35 + aa, verge));
          // woodlots, and hedgerows between the blocks
          float bough = texture2D(uNoise, p * 0.19).a;
          vec3 spruce = ${linear('#1c3026')} * (0.65 + 0.7 * bough);
          vec3 broad = mix(${linear('#3c6a30')}, mix(${linear('#b5532a')}, ${linear('#d6b23e')}, fine), uGold * step(0.35, mid)) * (0.6 + 0.8 * bough);
          broad = mix(${linear('#5a5046')} * (0.7 + 0.5 * bough), broad, uLeaf);
          vec3 woods = mix(spruce, broad * 0.62, smoothstep(0.92 - l.hard * 0.7, 1.08 - l.hard * 0.7, texture2D(uNoise, p * 0.021).a + (bough - 0.5) * 0.3));
          float ragged = (mid - 0.5) * 6.0;
          float inWoods = l.woods * smoothstep(1.5, 4.0, l.edge + ragged);
          float hedge = (1.0 - l.woods) * (1.0 - smoothstep(1.0, 2.6, l.edge + ragged * 0.3));
          vec3 outland = mix(crop, woods, max(inWoods, hedge * 0.8));
          landRough = mix(0.96, 1.0, inWoods);
          col = mix(outland, col, home);
        }
        // the home woodlot's floor, the dooryard and the brook's banks
        col = mix(col, ${linear('#3b3125')} * (0.7 + 0.6 * fine), vSurf.x * 0.92);
        col = mix(col, mix(${linear('#8a6e52')}, ${linear('#5b4534')}, uWet) * (0.82 + 0.36 * fine), smoothstep(0.25, 0.75, vSurf.z + (fine - 0.5) * 0.5) * 0.85);
        float bank = 1.0 - smoothstep(0.1, 0.24, vSurf.y + (mid - 0.5) * 0.1);
        col = mix(col, mix(${linear('#8c8676')}, ${linear('#4c4033')}, 0.45 + 0.4 * fine) * mix(1.0, 0.7, uWet), bank);
        // under the six fields the ground is the soil's own colour, so no green shows at a field's edge
        for (int k = 0; k < 6; k++) {
          vec2 fd = max(FIELD_RECT[k].xy - p, p - FIELD_RECT[k].zw);
          col = mix(col, soil * (0.8 + 0.3 * fine), 1.0 - smoothstep(0.35, 0.85, max(fd.x, fd.y) + (mid - 0.5) * 0.5));
        }
        col *= mix(1.0, 0.84, uWet * (1.0 - bank));
        landRough = mix(landRough, 0.62, uWet * 0.6);
        diffuseColor.rgb = col;
      }
      ${SNOW_RIME}
    `,
    fragmentRoughness: 'roughnessFactor = landRough;',
    fragmentNormal: 'normal = normalize(normal + (viewMatrix * vec4(landBump.x, 0.0, landBump.y, 0.0)).xyz * 0.22);',
  })
  const landMesh = new Mesh(land, landMat)
  landMesh.receiveShadow = true
  landMesh.frustumCulled = false
  group.add(landMesh)
  disposables.push(land, landMat)

  // ---- Roads: ribbons laid on the ground.
  const roadMat = (tint: string, wetTint: string) => patch(new MeshStandardMaterial({ map: roadTex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), {
    fragmentColor: `diffuseColor.rgb *= mix(${linear(tint)}, ${linear(wetTint)}, uWet) * (0.85 + 0.3 * texture2D(uNoise, vWorld.xz * 0.2).a); ${SNOW_RIME} diffuseColor.a *= 1.0 - 0.85 * smoothstep(0.5, 0.9, uSnow);`,
    fragmentRoughness: 'roughnessFactor = mix(0.95, 0.5, uWet * 0.7);',
  })
  const farmRoad = roadMat('#b29474', '#6b5440'), townRoad = roadMat('#c2b396', '#857763')
  const ribbon = (pts: [number, number][], width: number, mat: MeshStandardMaterial, lift: number): void => {
    const p: number[] = [], uv: number[] = [], ix: number[] = []
    let len = 0
    // resample so the ribbon follows the ground
    const fine: [number, number][] = []
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1]
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.9))
      for (let s = 0; s < steps; s++) fine.push([ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps])
    }
    fine.push(pts[pts.length - 1])
    for (let k = 0; k < fine.length; k++) {
      const a = fine[Math.max(0, k - 1)], b = fine[Math.min(fine.length - 1, k + 1)]
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1
      const nxv = -dz / l, nzv = dx / l
      if (k > 0) len += Math.hypot(fine[k][0] - fine[k - 1][0], fine[k][1] - fine[k - 1][1])
      for (const s of [-1, 0, 1]) {
        const x = fine[k][0] + nxv * s * width / 2, z = fine[k][1] + nzv * s * width / 2
        p.push(x, groundY(x, z) + lift, z)
        uv.push((s + 1) / 2, len / (width * 2))
      }
      if (k > 0) {
        const o = (k - 1) * 3
        ix.push(o, o + 1, o + 3, o + 1, o + 4, o + 3, o + 1, o + 2, o + 4, o + 2, o + 5, o + 4)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    g.setIndex(ix)
    g.computeVertexNormals()
    const mesh = new Mesh(g, mat)
    mesh.receiveShadow = true
    mesh.renderOrder = 1
    group.add(mesh)
    disposables.push(g)
  }
  ribbon(ROAD, 1.5, farmRoad, 0.035)
  for (const s of SPURS) ribbon(s, 1.25, farmRoad, 0.03)
  const longRoad = (zOf: (x: number) => number): [number, number][] => {
    const pts: [number, number][] = []
    for (let x = -1500; x <= 1500; x += 6) pts.push([x, zOf(x)])
    return pts
  }
  ribbon(longRoad(townRoadZ), 2.4, townRoad, 0.06)
  ribbon(longRoad(hillRoadZ), 2.4, townRoad, 0.08)
  disposables.push(farmRoad, townRoad)

  // ---- The brook: a ribbon of water down the valley.
  const ice = { value: 0 }
  {
    const p: number[] = [], uv: number[] = [], ix: number[] = []
    let k = 0
    for (let x = -460; x <= 470; x += Math.abs(x) < 70 ? 0.6 : 3) {
      const z = brookZ(x), hw = brookHalf(x) + 0.5
      for (const s of [-1, -0.5, 0, 0.5, 1]) {
        p.push(x, WATER_Y, z + s * hw)
        uv.push(x, s)
      }
      if (k > 0) for (let q = 0; q < 4; q++) { const o = (k - 1) * 5 + q; ix.push(o, o + 1, o + 5, o + 1, o + 6, o + 5) }
      k++
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    g.setIndex(ix)
    g.computeVertexNormals()
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, side: DoubleSide }), {
      uniforms: { uIce: ice },
      vertexHead: 'varying vec2 vBrook;',
      vertexBegin: 'vBrook = uv;',
      fragmentHead: 'uniform float uIce; varying vec2 vBrook; vec2 ripple; float frozen;',
      fragmentColor: /* glsl */ `
        {
          vec2 f1 = texture2D(uNoise, vWorld.xz * vec2(0.09, 0.2) + vec2(-uTime * 0.035, 0.0)).rg - 0.5;
          vec2 f2 = texture2D(uNoise, vWorld.xz * vec2(0.21, 0.37) + vec2(-uTime * 0.06, uTime * 0.01)).rg - 0.5;
          ripple = (f1 + f2 * 0.6) * (1.0 - uIce);
          float shore = abs(vBrook.y);
          frozen = uIce;
          vec3 deep = ${linear('#2f3a36')}, shallow = ${linear('#7a735c')};
          vec3 col = mix(deep, shallow, smoothstep(0.3, 0.95, shore));
          // From straight above little sky is mirrored; give the water some of it anyway, so it never reads as tar.
          col += uHazeAway * 0.07 * (1.0 - uIce);
          col = mix(col, vec3(0.62, 0.68, 0.74) * (0.9 + 0.2 * texture2D(uNoise, vWorld.xz * 0.11).a), uIce);
          col = mix(col, vec3(0.84, 0.88, 0.93), uIce * smoothstep(0.3, 0.7, uSnow) * smoothstep(0.35, 0.6, texture2D(uNoise, vWorld.xz * 0.05).b + uSnow * 0.3));
          diffuseColor.rgb = col;
          diffuseColor.a = mix(smoothstep(1.0, 0.72, shore) * 0.94, smoothstep(1.0, 0.9, shore), uIce);
        }
      `,
      fragmentRoughness: 'roughnessFactor = mix(0.07, 0.55, frozen);',
      fragmentNormal: 'normal = normalize(normal + (viewMatrix * vec4(ripple.x, 0.0, ripple.y, 0.0)).xyz * 0.5);',
    })
    const water = new Mesh(g, mat)
    water.receiveShadow = true
    water.renderOrder = 2
    group.add(water)
    disposables.push(g, mat)
  }

  const rocks = stoneWalls()
  group.add(rocks)
  disposables.push(rocks.geometry, rocks.material as MeshStandardMaterial)

  return { group, water: { ice }, dispose() { for (const d of disposables) d.dispose() } }
}

// Field stone, cleared by hand and piled along the edges: the west wall, the wall under the woodlot, the wall by the road.
function stoneWalls(): InstancedMesh {
  const spots: [number, number, number, number][] = []
  const r = rng(77)
  const line = (x0: number, z0: number, x1: number, z1: number, every: number) => {
    const count = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / every))
    for (let k = 0; k <= count; k++) {
      const t = k / count
      const x = x0 + (x1 - x0) * t + (r() - 0.5) * 0.22, z = z0 + (z1 - z0) * t + (r() - 0.5) * 0.22
      if (roadDist(x, z) < 1.3) continue
      const s = 0.1 + r() * 0.09
      spots.push([x, z, s, 0])
      if (r() < 0.8) spots.push([x + (r() - 0.5) * 0.16, z + (r() - 0.5) * 0.16, 0.08 + r() * 0.06, s * 0.8])
      if (r() < 0.3) spots.push([x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.06 + r() * 0.05, 0])
    }
  }
  for (const [x0, z0, x1, z1] of WALLS) line(x0, z0, x1, z1, 0.17)
  line(-18, 20.6, 16, 20.5, 1.9)
  for (const f of FIELDS) if (f.i % 2 === 0) line(f.x1 + 0.9, f.z0 + 0.6, f.x1 + 0.9, f.z1 - 0.6, 0.9)
  const geo = new IcosahedronGeometry(1, 1)
  const gp = geo.getAttribute('position') as BufferAttribute
  for (let i = 0; i < gp.count; i++) {
    const k = 1 + (hash2(Math.round(gp.getX(i) * 50), Math.round(gp.getY(i) * 50 + gp.getZ(i) * 31)) - 0.5) * 0.3
    gp.setXYZ(i, gp.getX(i) * k, gp.getY(i) * k, gp.getZ(i) * k)
  }
  geo.computeVertexNormals()
  const mat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }), {
    fragmentColor: `diffuseColor.rgb *= 0.85 + 0.3 * texture2D(uNoise, vWorld.xz * 0.9).a; ${SNOW_RIME}`,
  })
  const mesh = new InstancedMesh(geo, mat, spots.length)
  const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3(), e = new Vector3()
  const col = new Color()
  const greys = ['#9a968c', '#aaa59a', '#827e76', '#a39c8e', '#8d867a', '#b3aea0']
  spots.forEach(([x, z, s, up], k) => {
    p.set(x, groundY(x, z) + s * 0.4 + up, z)
    q.setFromAxisAngle(e.set(r(), r(), r()).normalize(), r() * Math.PI)
    sc.set(s * (1 + r() * 0.5), s * (0.62 + r() * 0.3), s * (1 + r() * 0.4))
    mesh.setMatrixAt(k, m.compose(p, q, sc))
    mesh.setColorAt(k, col.set(greys[k % greys.length]))
  })
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
