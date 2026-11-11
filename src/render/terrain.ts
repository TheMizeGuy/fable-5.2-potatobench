// The land: one surface from the farm out to the far ridges, the farm's own meadow round its blocks of fields, the
// neighbours' quilt of strips and woodlots beyond, the brook and its ford, the roads and tracks and the stone walls.
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, Quaternion, Vector3, type Texture,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FIELD_COUNT } from '../sim/index.ts'
import {
  BLOCKS, FIELDS, FORD, LAND, REGION, WALLS, WATER_Y, WAYS, brookHalf, brookZ, fordAt, gravelDist, groundY, hillRoadZ,
  ridgeWoods, roadDist, townRoadZ,
} from './layout.ts'
import { hash2, rng, smooth } from './noise.ts'
import { SNOW_RIME, linear, patch } from './shaders.ts'

export interface Terrain {
  group: Group
  water: { ice: { value: number } }
  // Whether each parcel is the farm's (1) or somebody else's ground (0), as the fields are drawn now.
  held: { value: number[] }
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

// 1 well inside a field, 0 at its edge: where the land lies under the tilled ground.
function underField(x: number, z: number): number {
  let m = 0
  for (const f of FIELDS) {
    const d = Math.min(x - f.x0, f.x1 - x, z - f.z0, f.z1 - z)
    if (d > 0) m = Math.max(m, smooth(0.3, 0.9, d))
  }
  return m
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
    col = mix(grass * mix(vec3(1.0), vec3(0.92, 1.06, 0.82), uLeaf), ${linear('#a9ad62')}, mown);
    rows = 0.3 * mown;
  } else if (kind < 0.92) {
    col = mix(grass * mix(vec3(0.9, 0.96, 0.84), vec3(0.72, 0.98, 0.7), uLeaf), ${linear('#8f6f86')}, 0.2 * ramp(168.0, 180.0, d) * (1.0 - ramp(206.0, 220.0, d)));
  } else {
    col = grass * vec3(1.05, 1.0, 0.86);
  }
  return col;
}
`

const rectGlsl = (r: { x0: number; z0: number; x1: number; z1: number }) => `vec4(${r.x0.toFixed(2)}, ${r.z0.toFixed(2)}, ${r.x1.toFixed(2)}, ${r.z1.toFixed(2)})`

export function buildTerrain(roadTex: Texture): Terrain {
  const group = new Group()
  const disposables: { dispose(): void }[] = []
  const held = { value: new Array(FIELD_COUNT).fill(1) as number[] }

  const xs = axis(LAND.x0 - 4.2, LAND.x1 + 4.2, 0.6, 1.065, 3600), zs = axis(-64.2, 64.2, 0.6, 1.065, 3600)
  const nx = xs.length, nz = zs.length
  const pos = new Float32Array(nx * nz * 3)
  const surf = new Float32Array(nx * nz * 4)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], k = j * nx + i
      const home = x > LAND.x0 - 4.5 && x < LAND.x1 + 4.5 && z > -64.5 && z < 64.5
      pos[k * 3] = x
      pos[k * 3 + 1] = groundY(x, z) - (home ? underField(x, z) * 0.09 : 0)
      pos[k * 3 + 2] = z
      const ragged = home ? 3 * (hash2(Math.round(x * 0.4), Math.round(z * 0.4)) - 0.5) : 0
      surf[k * 4] = home && ridgeWoods(x, z - 1, ragged) ? 1 : 0
      surf[k * 4 + 1] = Math.min(1, Math.abs(z - brookZ(x)) / 8)
      // Trodden earth in the dooryards and along the gravel by them; a worn verge along the road between.
      const yard = Math.min(Math.hypot(x - 23.6, (z + 4) * 0.7), Math.hypot(x - 91.5, (z + 4) * 0.8)) < 12 ? 1 : 0.4
      surf[k * 4 + 2] = home ? Math.max(0, 1 - gravelDist(x, z) / 2.2) * yard : 0
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
  const fieldRects = FIELDS.map(rectGlsl).join(', ')
  const blocks = Object.values(BLOCKS)
  const landMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 }), {
    uniforms: { uHeld: held },
    vertexHead: 'attribute vec4 aSurf; varying vec4 vSurf;',
    vertexBegin: 'vSurf = aSurf;',
    fragmentHead: /* glsl */ `
      varying vec4 vSurf;
      uniform float uHeld[${FIELD_COUNT}];
      ${QUILT_GLSL}
      const vec4 FIELD_RECT[${FIELD_COUNT}] = vec4[${FIELD_COUNT}](${fieldRects});
      const vec4 BLOCK_RECT[${blocks.length}] = vec4[${blocks.length}](${blocks.map(rectGlsl).join(', ')});
      float landRough;
      vec2 landBump;
      float rectDist(vec4 r, vec2 p) { vec2 d = max(r.xy - p, p - r.zw); return max(d.x, d.y); }
    `,
    fragmentColor: /* glsl */ `
      {
        vec2 p = vWorld.xz;
        vec4 n1 = texture2D(uNoise, p * 0.0037);
        vec4 n2 = texture2D(uNoise, p * 0.043);
        vec4 n3 = texture2D(uNoise, p * 0.31);
        float fine = n3.a, mid = n2.b, broad = n1.b;
        // Meadow: no two yards the same green. Clover dark, seed heads pale, worn places thin.
        float patchy = texture2D(uNoise, p * 0.011).b, tuft = texture2D(uNoise, p * 0.13).a;
        vec3 grass = uGrass * (0.62 + 0.62 * mid) * (0.82 + 0.36 * fine) * (0.84 + 0.32 * broad);
        float lush = texture2D(uNoise, p * 0.027 + 0.31).b;
        grass *= mix(vec3(1.2, 1.07, 0.78), mix(vec3(0.86, 0.9, 0.84), vec3(0.8, 0.97, 0.88), uLeaf), smoothstep(0.32, 0.68, lush));
        float swath = 0.5 + 0.5 * cos(p.y * 6.2831853 / 1.7 + (mid - 0.5) * 2.4);
        grass *= 0.95 + 0.1 * swath * (1.0 - smoothstep(0.25, 0.8, fwidth(p.y) / 1.7));
        grass = mix(grass, grass * vec3(0.72, 0.95, 0.7), smoothstep(0.52, 0.7, patchy) * uLeaf);
        grass = mix(grass, grass * vec3(1.32, 1.2, 0.86), smoothstep(0.5, 0.78, tuft) * 0.7 * uLeaf);
        vec3 soil = ${linear('#7a4c38')} * (0.8 + 0.4 * mid) * mix(1.0, 0.62, uWet);
        landRough = 0.96;
        landBump = (n3.rg - 0.5) * 1.6 + (n2.rg - 0.5) * 0.8;

        // The farm's own ground: meadow round its blocks of fields; the neighbours' quilt beyond.
        float ours = 0.0;
        for (int k = 0; k < ${blocks.length}; k++) ours = max(ours, 1.0 - smoothstep(-1.5, 2.5 + (mid - 0.5) * 2.0, rectDist(BLOCK_RECT[k], p)));
        // Inside the farm's country the quilt's woods give way to open land.
        float od = max(max(${LAND.x0.toFixed(1)} - p.x, p.x - ${LAND.x1.toFixed(1)}), max(-26.0 - p.y, p.y - ${(LAND.z1 + 4).toFixed(1)}));
        float open = 1.0 - smoothstep(-6.0, 10.0, od);
        vec3 col = grass;
        {
          Land l = landAt(p);
          // Strip edges wander a little, as a ploughman's do, and each strip ends in a headland of rough grass.
          float qx = l.q.x + (n2.b - 0.5) * 2.2 + (broad - 0.5) * 4.0;
          float strip = floor(qx / l.width), fx = fract(qx / l.width);
          float runL = l.width * 3.4, shift = ihash(ivec2(int(strip) + l.cell.x * 31, l.cell.y * 17 + 5));
          float along = floor(l.q.y / runL + shift), fy = fract(l.q.y / runL + shift);
          ivec2 id = ivec2(int(strip) * 7 + l.cell.x * 13 + int(along) * 3, l.cell.y * 29 + int(along));
          float kind = ihash(id), tone = ihash(id + ivec2(3, 11));
          float rows;
          vec3 crop = cropColor(kind, tone, uDay, soil, grass, rows) * (0.86 + 0.28 * tone) * (0.86 + 0.28 * patchy);
          float period = ${(0.34).toFixed(2)};
          float line = 0.5 + 0.5 * cos(l.q.x * 6.2831853 / period);
          float show = rows * (1.0 - smoothstep(0.2, 0.7, fwidth(l.q.x) / period));
          crop *= 1.0 - show * 0.45 * (1.0 - line);
          // mowing and tillage lines that carry at any distance
          float sweep = 0.5 + 0.5 * cos(l.q.x * 6.2831853 / (l.width * 0.2));
          crop *= 0.9 + 0.14 * sweep * (1.0 - smoothstep(0.5, 2.0, fwidth(l.q.x) / (l.width * 0.2)));
          float verge = min(min(fx, 1.0 - fx) * l.width, min(fy, 1.0 - fy) * runL * 0.6);
          float aa = fwidth(qx) * 1.5;
          vec3 rough = grass * mix(vec3(0.86, 0.9, 0.76), vec3(1.08, 1.02, 0.84), tuft);
          crop = mix(rough, crop, smoothstep(0.6, 1.8 + aa, verge + (fine - 0.5) * 0.8));
          // woodlots, and hedgerows between the blocks
          float bough = texture2D(uNoise, p * 0.19).a;
          vec3 spruce = ${linear('#1c3026')} * (0.65 + 0.7 * bough);
          vec3 broadleaf = mix(${linear('#3c6a30')}, mix(${linear('#b5532a')}, ${linear('#d6b23e')}, fine), uGold * step(0.35, mid)) * (0.6 + 0.8 * bough);
          broadleaf = mix(${linear('#5a5046')} * (0.7 + 0.5 * bough), broadleaf, uLeaf);
          vec3 woods = mix(spruce, broadleaf * 0.62, smoothstep(0.92 - l.hard * 0.7, 1.08 - l.hard * 0.7, texture2D(uNoise, p * 0.021).a + (bough - 0.5) * 0.3));
          float ragged = (mid - 0.5) * 6.0;
          float inWoods = l.woods * smoothstep(1.5, 4.0, l.edge + ragged) * (1.0 - smoothstep(0.3, 0.5, open));
          float hedge = (1.0 - l.woods) * (1.0 - smoothstep(1.0, 2.6, l.edge + ragged * 0.3)) * (1.0 - open);
          vec3 outland = mix(crop, woods, max(inWoods, hedge * 0.8));
          landRough = mix(0.96, 1.0, inWoods);
          col = mix(outland, col, ours);
        }
        // Wet hollows in the meadow, greener and darker, with rushes; after rain they hold water.
        float hollow = smoothstep(0.62, 0.78, texture2D(uNoise, p * 0.019 + 0.57).b) * ours * (1.0 - vSurf.x);
        float lowGround = smoothstep(3.2, 1.1, vWorld.y);
        float wetHere = hollow * (0.45 + 0.55 * lowGround) + (1.0 - smoothstep(0.12, 0.4, vSurf.y)) * 0.6 * ours;
        col = mix(col, grass * vec3(0.62, 0.82, 0.6) * (0.8 + 0.4 * tuft), wetHere * 0.75);
        // The farm's meadow moves: a gust lays the grass over and it shows pale.
        float gust = gustAt(p) * min(uSway, 1.2);
        col *= 1.0 + 0.14 * gust * ours * uLeaf * (1.0 - vSurf.x);
        // Wildflowers in drifts through the farm's meadow by the season: buttercup, orange hawkweed and daisies from late
        // June, goldenrod from August. Too small to see one by one from far off, they show as a wash of their colour.
        {
          vec2 fp = p * 2.6;
          vec2 fc = floor(fp);
          float h1 = hash12(fc), h2 = hash12(fc + 17.3);
          float drift = smoothstep(0.42, 0.72, texture2D(uNoise, p * 0.019 + 0.7).b);
          float june = smoothstep(158.0, 172.0, uDay) * (1.0 - smoothstep(208.0, 224.0, uDay));
          float aug = smoothstep(214.0, 230.0, uDay) * (1.0 - smoothstep(262.0, 282.0, uDay));
          vec3 early = h2 < 0.42 ? ${linear('#e8c22a')} : h2 < 0.72 ? ${linear('#de5f24')} : ${linear('#eeeadb')};
          vec3 fcol = mix(early, ${linear('#d9a92a')}, step(0.5, aug));
          float share = drift * (june * 0.18 + aug * 0.24) * ours * (1.0 - wetHere) * (1.0 - vSurf.x) * (1.0 - smoothstep(0.1, 0.4, vSurf.z));
          float bloom = step(h1, share) * (1.0 - smoothstep(0.09, 0.2, length(fract(fp) - 0.5)));
          float far = smoothstep(0.25, 0.9, fwidth(fp.x));
          col = mix(col, fcol * 0.8, mix(bloom, share * 0.1, far));
        }
        // the woods' floor on the ridge, the dooryards and the brook's banks
        col = mix(col, ${linear('#3b3125')} * (0.7 + 0.6 * fine), vSurf.x * 0.92);
        col = mix(col, mix(${linear('#8a6e52')}, ${linear('#5b4534')}, uWet) * (0.82 + 0.36 * fine), smoothstep(0.25, 0.75, vSurf.z + (fine - 0.5) * 0.5) * 0.85);
        float bank = 1.0 - smoothstep(0.1, 0.24, vSurf.y + (mid - 0.5) * 0.1);
        vec3 gravel = mix(${linear('#8c8676')}, ${linear('#4c4033')}, 0.45 + 0.4 * fine) * mix(1.0, 0.7, uWet);
        col = mix(col, gravel, bank);
        // Under each of the farm's fields the ground is the soil's own colour, so no green shows at a field's edge; round
        // it, a headland where the tractor turns, worn pale. Somebody else's ground runs green to its wall.
        float headland = 0.0;
        for (int k = 0; k < ${FIELD_COUNT}; k++) {
          float fd = rectDist(FIELD_RECT[k], p);
          if (fd > 3.0) continue;
          col = mix(col, soil * (0.8 + 0.3 * fine), (1.0 - smoothstep(0.35, 0.85, fd + (mid - 0.5) * 0.5)) * uHeld[k]);
          headland = max(headland, (1.0 - smoothstep(0.9, 2.0, fd + (fine - 0.5) * 0.6)) * smoothstep(0.3, 0.7, fd) * uHeld[k]);
        }
        col = mix(col, mix(grass * vec3(1.18, 1.08, 0.8), soil * 1.15, 0.35 + 0.3 * fine), headland * 0.7);
        col *= mix(1.0, 0.84, uWet * (1.0 - bank));
        landRough = mix(landRough, 0.62, uWet * 0.6);
        landRough = mix(landRough, 0.35, wetHere * uWet);
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

  // ---- Roads and tracks: ribbons laid on the ground. A track keeps only its two ruts; grass grows between them.
  const roadMat = (tint: string, wetTint: string, ruts: boolean) => patch(new MeshStandardMaterial({ map: roadTex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), {
    fragmentColor: /* glsl */ `
      diffuseColor.rgb *= mix(${linear(tint)}, ${linear(wetTint)}, uWet) * (0.85 + 0.3 * texture2D(uNoise, vWorld.xz * 0.2).a);
      ${ruts ? 'diffuseColor.a *= smoothstep(0.6, 0.9, texture2D(map, vMapUv).r) * 0.85;' : ''}
      ${SNOW_RIME} diffuseColor.a *= 1.0 - 0.85 * smoothstep(0.5, 0.9, uSnow);`,
    fragmentRoughness: 'roughnessFactor = mix(0.95, 0.5, uWet * 0.7);',
  })
  const farmRoad = roadMat('#b29474', '#6b5440', false), townRoad = roadMat('#c2b396', '#857763', false), trackMat = roadMat('#a88a68', '#5e4a38', true)
  const laid = new Map<MeshStandardMaterial, BufferGeometry[]>()
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
        // over the brook a track keeps to the gravel of the ford, just under the water
        const y = Math.abs(z - brookZ(x)) < brookHalf(x) + 0.3 && fordAt(x) > 0.5 ? WATER_Y - 0.06 : groundY(x, z)
        p.push(x, y + lift, z)
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
    const list = laid.get(mat) ?? []
    list.push(g)
    laid.set(mat, list)
  }
  for (const w of WAYS) {
    if (w.kind === 'road') ribbon(w.pts, w.pts === WAYS[0].pts ? 1.5 : 1.35, farmRoad, 0.035)
    else if (w.kind === 'track') ribbon(w.pts, 1.3, trackMat, 0.025)
  }
  const longRoad = (zOf: (x: number) => number): [number, number][] => {
    const pts: [number, number][] = []
    for (let x = -1500; x <= 1500; x += 6) pts.push([x, zOf(x)])
    return pts
  }
  ribbon(longRoad(townRoadZ), 2.4, townRoad, 0.06)
  ribbon(longRoad(hillRoadZ), 2.4, townRoad, 0.08)
  // one draw for each kind of way
  for (const [mat, geos] of laid) {
    const g = mergeGeometries(geos)!
    for (const x of geos) x.dispose()
    const mesh = new Mesh(g, mat)
    mesh.receiveShadow = true
    mesh.renderOrder = 1
    group.add(mesh)
    disposables.push(g)
  }
  disposables.push(farmRoad, townRoad, trackMat)

  // ---- The brook: a ribbon of water down the valley, thin over the gravel of the ford.
  const ice = { value: 0 }
  {
    const p: number[] = [], uv: number[] = [], ix: number[] = []
    let k = 0
    for (let x = -460; x <= 470; x += Math.abs(x - 20) < 90 ? 0.6 : 3) {
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
      fragmentHead: 'uniform float uIce; varying vec2 vBrook; vec2 ripple; float frozen; float riffle; float ford;',
      fragmentColor: /* glsl */ `
        {
          vec2 f1 = texture2D(uNoise, vWorld.xz * vec2(0.05, 0.12) + vec2(-uTime * 0.03, 0.0)).rg - 0.5;
          vec2 f2 = texture2D(uNoise, vWorld.xz * vec2(0.21, 0.37) + vec2(-uTime * 0.06, uTime * 0.01)).rg - 0.5;
          ripple = (f1 + f2 * 0.3) * (1.0 - uIce);
          float shore = abs(vBrook.y);
          frozen = uIce;
          ford = 1.0 - smoothstep(${(FORD.half * 0.6).toFixed(2)}, ${(FORD.half * 1.6).toFixed(2)}, abs(vWorld.x - ${FORD.x.toFixed(2)}));
          // Peat-dark water over a stony bed, pale where it runs thin at the edges and white where it breaks over stones.
          vec3 deep = ${linear('#2b3532')}, shallow = ${linear('#8a7c5e')};
          float thin = max(smoothstep(0.42, 0.9, shore + (texture2D(uNoise, vWorld.xz * 0.23).a - 0.5) * 0.3), ford * 0.85);
          vec3 col = mix(deep, shallow, thin);
          float reach = max(smoothstep(0.9, 1.0, 0.5 - 0.5 * sin(vWorld.x * 0.13 + 0.7)), ford);
          float broken = texture2D(uNoise, vWorld.xz * vec2(0.19, 0.83) + vec2(-uTime * 0.05, 0.0)).a * 0.6 + texture2D(uNoise, vWorld.zx * vec2(1.31, 0.43) + vec2(0.0, -uTime * 0.09)).a * 0.4;
          riffle = reach * smoothstep(0.5, 0.75, broken) * (1.0 - uIce) * smoothstep(0.95, 0.5, shore);
          col = mix(col, vec3(0.5, 0.54, 0.52), riffle * 0.6);
          col = mix(col, vec3(0.62, 0.68, 0.74) * (0.9 + 0.2 * texture2D(uNoise, vWorld.xz * 0.11).a), uIce);
          col = mix(col, vec3(0.84, 0.88, 0.93), uIce * smoothstep(0.3, 0.7, uSnow) * smoothstep(0.35, 0.6, texture2D(uNoise, vWorld.xz * 0.05).b + uSnow * 0.3));
          diffuseColor.rgb = col;
          diffuseColor.a = mix(mix(smoothstep(1.0, 0.72, shore) * 0.95, smoothstep(1.0, 0.6, shore) * 0.7, ford), smoothstep(1.0, 0.9, shore), uIce);
        }
      `,
      fragmentRoughness: 'roughnessFactor = mix(0.07, 0.55, max(frozen, riffle));',
      fragmentNormal: 'normal = normalize(normal + (viewMatrix * vec4(ripple.x, 0.0, ripple.y, 0.0)).xyz * (0.18 + 0.5 * riffle));',
      // Water mirrors the sky, more of it the lower it is seen; and seen from above, the sun glints off the ripples.
      fragmentEmissive: /* glsl */ `
        {
          vec3 wN = inverseTransformDirection( normal, viewMatrix );
          vec3 wV = normalize( cameraPosition - vWorld );
          float fres = 0.2 + 0.8 * pow( 1.0 - max( dot( wN, wV ), 0.0 ), 4.0 );
          vec3 wR = reflect( - wV, wN );
          wR.y = abs( wR.y );
          // Rain breaks the mirror.
          float mirror = ( 1.0 - frozen ) * ( 1.0 - riffle * 0.6 ) * mix( 1.0, 0.3, smoothstep( 0.7, 1.0, uCloud.y ) ) * ( 1.0 - 0.5 * ford );
          totalEmissiveRadiance += skyRadiance( wR, 0.08 ) * fres * mirror;
          vec2 g = texture2D( uNoise, vWorld.xz * 0.9 + vec2( -uTime * 0.25, uTime * 0.07 ) ).rg - 0.5;
          vec3 gN = normalize( vec3( g.x * 1.6 + ripple.x * 2.0, 1.0, g.y * 1.6 + ripple.y * 2.0 ) );
          float glint = pow( max( dot( reflect( - wV, gN ), uSunDir ), 0.0 ), 160.0 ) * smoothstep( 0.55, 0.8, texture2D( uNoise, vWorld.xz * 0.31 + vec2( uTime * 0.04, 0.0 ) ).b );
          totalEmissiveRadiance += uSunCol * glint * 3.0 * mirror * cloudShade( vWorld );
        }
      `,
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

  return { group, water: { ice }, held, dispose() { for (const d of disposables) d.dispose() } }
}

// Field stone, cleared by hand and piled along the edges of every block; gateways where the tracks go through.
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
  // Nearer home the walls are laid closer; out on the far blocks a stone stands for a little more.
  WALLS.forEach(([x0, z0, x1, z1], k) => line(x0, z0, x1, z1, k < 4 ? 0.17 : 0.21))
  // What is left of an older wall above the brook.
  for (let x = -18; x < 16; x += 1.6) {
    if (hash2(Math.round(x * 0.5), 7) < 0.5) continue
    line(x, 19.5 + (r() - 0.5) * 0.3, x + 1.2 + r() * 0.5, 19.45 + (r() - 0.5) * 0.3, 0.22)
  }
  // Piles where picked stone was tipped against the walls, here and there.
  for (const [x0, z0, x1, z1] of WALLS) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    for (let d = 6 + r() * 6; d < len - 3; d += 11 + r() * 9) {
      const t = d / len, nx = -(z1 - z0) / len, nz = (x1 - x0) / len, side = r() < 0.5 ? -1 : 1
      const cx = x0 + (x1 - x0) * t + nx * side * 0.7, cz = z0 + (z1 - z0) * t + nz * side * 0.7
      if (roadDist(cx, cz) < 2 || FIELDS.some(f => cx > f.x0 - 0.6 && cx < f.x1 + 0.6 && cz > f.z0 - 0.6 && cz < f.z1 + 0.6)) continue
      for (let q = 0; q < 9; q++) {
        const a = r() * 6.283, dd = Math.sqrt(r()) * 0.5, s = 0.09 + r() * 0.1
        spots.push([cx + Math.cos(a) * dd * 1.4, cz + Math.sin(a) * dd, s, dd < 0.2 ? s * 0.7 : 0])
      }
    }
  }
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
