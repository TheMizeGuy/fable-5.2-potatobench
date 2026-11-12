// The land: one surface from the farm out to the far ridges, the farm's own meadow round its blocks of fields, the
// neighbours' quilt of strips and woodlots beyond, the brook and its ford, the roads and tracks and the stone walls.
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, OctahedronGeometry, Matrix4, Mesh,
  MeshStandardMaterial, Quaternion, Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FIELD_COUNT, PARCELS } from '../sim/index.ts'
import { OFF_GLSL, OFF_KIND } from './fields.ts'
import {
  BLOCKS, FIELDS, FORD, HOME, LAND, OPEN, QUILT, REACH, ROAD, WALLS, WATER_Y, WAYS, WIDE, YARD_AT, brookHalf, brookZ, fordAt, gravelDist, groundY, hillRoadZ, TRACT_LINE, ridgeWoodAt, roadDist, townRoadZ, tractAt, wallDist, FARM, WOOD_GATE, oursAt, fieldMask, HOUSE, BARN, POTATO_HOUSE, DUFOUR_HOUSE, DUFOUR_BARN, VILLAGE, SIDING, HOME_WOODS,
} from './layout.ts'
import { K, KV, S, toWorld } from './scale.ts'
import { hash2, rng, smooth } from './noise.ts'
import { SNOW_RIME, linear, patch, snowRimeAt } from './shaders.ts'
import { GROUND_SNOW } from './snow.ts'
import { buildBounds } from './bounds.ts'
import { landIndex } from './landmesh.ts'

export interface Terrain {
  group: Group
  // The land's own surface, in a group of its own that sets when it is drawn.
  under: Group
  water: { ice: { value: number } }
  // Whether each parcel is the farm's tilled ground (1) or not (0), as the fields are drawn now; whether it is somebody
  // else's hay or pasture; and whether it is marked out to be had.
  held: { value: number[] }
  off: { value: number[] }
  avail: { value: number[] }
  // How much of the farm road has been gravelled, 0..1.
  gravel: { value: number }
  dispose(): void
}

// A run of grid lines: even across the farm, finer over the bands given (where the ground has to hold a shape: the
// brook's bed, the yards' pads), widening outward to the horizon.
function axis(lo: number, hi: number, step: number, fine: [number, number, number][], growth: number, limit: number): number[] {
  const mid: number[] = []
  for (let v = lo; v <= hi + 1e-6; v += step) mid.push(v)
  for (const [a, b, st] of fine) for (let v = a; v <= b; v += st) mid.push(v)
  mid.sort((a, b) => a - b)
  const out: number[] = []
  for (const v of mid) if (!out.length || v - out[out.length - 1] > 0.45) out.push(v)
  let s = step, a = out[0], b = out[out.length - 1]
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
    if (d > 0) m = Math.max(m, smooth(0.3 * S, 0.9 * S, d))
  }
  return m
}

// The quilt, as in regionAt() in layout.ts, and what grows on each strip by the day of the year.
const QUILT_GLSL = /* glsl */ `
struct Land { float woods; float hard; float edge; vec2 q; float width; ivec2 cell; };
Land landAt(vec2 p) {
  ivec2 c = ivec2(floor(p / ${QUILT.region.toFixed(1)}));
  float d1 = 1e9, d2 = 1e9;
  ivec2 best = c;
  vec2 site = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 cc = c + ivec2(i, j);
      vec2 s = (vec2(cc) + 0.5 + (vec2(ihash(cc + ivec2(131, 17)), ihash(cc + ivec2(-57, 211))) - 0.5) * 0.72) * ${QUILT.region.toFixed(1)};
      float d = distance(p, s);
      if (d < d1) { d2 = d1; d1 = d; best = cc; site = s; } else if (d < d2) d2 = d;
    }
  }
  Land l;
  l.cell = best;
  l.edge = (d2 - d1) * 0.5;
  l.woods = step(ihash(best + ivec2(19, -83)), 0.26 + 0.42 * smoothstep(${QUILT.far0.toFixed(1)}, ${QUILT.far1.toFixed(1)}, distance(site, vec2(${(4.6 * K).toFixed(1)}, 0.0))));
  l.hard = ihash(best + ivec2(43, 7));
  float ang = (ihash(best + ivec2(77, 301)) < 0.5 ? 0.0 : 1.5707963) + (ihash(best + ivec2(5, 9)) - 0.5) * 0.7;
  l.width = ${QUILT.width0.toFixed(1)} + ${QUILT.width1.toFixed(1)} * ihash(best + ivec2(-3, 41));
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
    rows = max((0.25 + 0.75 * (1.0 - up)) * step(128.0, d) * (1.0 - dug), 0.4 * dug);
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

// A rectangle of the land in the small units the ground's patterns are drawn in.
const rectGlsl = (r: { x0: number; z0: number; x1: number; z1: number }) => `vec4(${(r.x0 / S).toFixed(3)}, ${(r.z0 / S).toFixed(3)}, ${(r.x1 / S).toFixed(3)}, ${(r.z1 / S).toFixed(3)})`

export function buildTerrain(): Terrain {
  const group = new Group()
  const disposables: { dispose(): void }[] = []
  const held = { value: new Array(FIELD_COUNT).fill(1) as number[] }
  const off = { value: new Array(FIELD_COUNT).fill(0) as number[] }, avail = { value: new Array(FIELD_COUNT).fill(0) as number[] }

  const yards = [-1, -2].map(y => YARD_AT[y])
  const brookBand = 3.4 * K + 9 * S
  // Ten metres to a square over the country, five over the home farm, finer over the yards and along the brook.
  const xs = axis(LAND.x0 - 4.2 * K, LAND.x1 + 4.2 * K, 10, [[FARM.x0 - 10, FARM.x1 + 10, 5], ...yards.map(y => [y.x0 - 8, y.x1 + 8, 1.6] as [number, number, number])], 1.07, REACH)
  const zs = axis(-64.2 * K, 64.2 * K, 10, [[FARM.z0 - 10, 20 * K, 5], ...yards.map(y => [y.z0 - 8, y.z1 + 8, 1.6] as [number, number, number]), [22.6 * K - brookBand, 22.6 * K + brookBand, 1.6]], 1.07, REACH)
  const nx = xs.length, nz = zs.length
  const pos = new Float32Array(nx * nz * 3)
  const surf = new Float32Array(nx * nz * 4), near = new Float32Array(nx * nz * 2)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], k = j * nx + i
      const home = x > LAND.x0 - 4.5 * K && x < LAND.x1 + 4.5 * K && z > -64.5 * K && z < 64.5 * K
      pos[k * 3] = x
      pos[k * 3 + 1] = groundY(x, z) - (home ? underField(x, z) * 0.2 : 0)
      pos[k * 3 + 2] = z
      // Under a tract's own trees the floor is the woods'; the line cut round it is a green ride.
      const stand = home ? tractAt(x, z, TRACT_LINE) : -1, inside = home ? tractAt(x, z, -0.5 * S) : -1
      surf[k * 4] = stand >= 0 && PARCELS[stand].cover === 'woods' ? (inside >= 0 ? 1 : 0.2) : ridgeWoodAt(x, z)
      surf[k * 4 + 1] = Math.min(1, Math.abs(z - brookZ(x)) / (8 * S))
      // Trodden earth in the dooryards and along the gravel by them; a worn verge along the road between.
      const yard = yards.some(y => Math.hypot(x - y.x, (z - y.z) * 0.75) < 12 * S) ? 1 : 0.4
      const gravel = home ? gravelDist(x, z) : 999
      surf[k * 4 + 2] = Math.max(0, 1 - gravel / (2.2 * S)) * yard
      surf[k * 4 + 3] = hash2(i, j)
      near[k * 2] = Math.min(1, gravel / (4 * S))
      near[k * 2 + 1] = home ? Math.min(1, wallDist(x, z) / (3 * S)) : 1
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
  land.setAttribute('aNear', new BufferAttribute(near, 2))
  // The ground's slope at each point is taken from the whole grid; the land is then drawn in fewer triangles.
  land.setIndex(new BufferAttribute(idx, 1))
  land.computeVertexNormals()
  land.setIndex(new BufferAttribute(landIndex(xs, zs, [
    ...yards.map(y => ({ x0: y.x0 - 8, x1: y.x1 + 8, z0: y.z0 - 8, z1: y.z1 + 8 })),
    { x0: -Infinity, x1: Infinity, z0: 22.6 * K - brookBand, z1: 22.6 * K + brookBand },
  ]), 1))
  const fieldRects = FIELDS.map(rectGlsl).join(', ')
  const blocks = Object.values(BLOCKS)
  const landMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 }), {
    uniforms: { uHeld: held, uOffK: off, uAvailK: avail },
    vertexHead: 'attribute vec4 aSurf; attribute vec2 aNear; varying vec4 vSurf; varying vec2 vNear;',
    vertexBegin: 'vSurf = aSurf; vNear = aNear;',
    fragmentHead: /* glsl */ `
      varying vec4 vSurf;
      varying vec2 vNear;
      uniform float uHeld[${FIELD_COUNT}];
      uniform float uOffK[${FIELD_COUNT}];
      uniform float uAvailK[${FIELD_COUNT}];
      const float OFF_KINDS[${FIELD_COUNT}] = float[${FIELD_COUNT}](${Array.from({ length: FIELD_COUNT }, (_, k) => (OFF_KIND[k] ?? 0).toFixed(1)).join(', ')});
      ${QUILT_GLSL}
      ${OFF_GLSL}
      const vec4 FIELD_RECT[${FIELD_COUNT}] = vec4[${FIELD_COUNT}](${fieldRects});
      const vec4 BLOCK_RECT[${blocks.length}] = vec4[${blocks.length}](${blocks.map(rectGlsl).join(', ')});
      float landRough;
      float landSnow = 0.0;
      vec2 landBump;
      ${GROUND_SNOW}
      float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
      const vec2 PLACES[2] = vec2[2](vec2(${VILLAGE.x.toFixed(1)}, ${VILLAGE.z.toFixed(1)}), vec2(${SIDING.x.toFixed(1)}, ${SIDING.z.toFixed(1)}));
      float rectDist(vec4 r, vec2 p) { vec2 d = max(r.xy - p, p - r.zw); return max(d.x, d.y); }
      vec2 turned(vec2 v, float a, float b) { return vec2(v.x * a + v.y * b, v.y * a - v.x * b); }
    `,
    fragmentColor: /* glsl */ `
      {
        // pw: metres. p: the small units the ground's patterns were drawn in.
        vec2 pw = vWorld.xz, p = pw / ${S.toFixed(2)};
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
        // In seed by July, and cut for hay a piece at a time: stubble pale, the windrows lying, then the aftermath greening.
        grass = mix(grass, ${linear('#a89c66')} * (0.8 + 0.4 * fine), 0.3 * smoothstep(160.0, 184.0, uDay) * (1.0 - smoothstep(236.0, 262.0, uDay)) * smoothstep(0.4, 0.7, tuft));
        float cutAt = 184.0 + 30.0 * texture2D(uNoise, p * 0.0061 + 0.21).b, since = uDay - cutAt;
        float mown = smoothstep(0.0, 1.5, since) * (1.0 - smoothstep(14.0, 32.0, since));
        float windrow = smoothstep(0.55, 0.9, 0.5 + 0.5 * cos(p.y * 6.2831853 / 1.9 + (mid - 0.5) * 1.6)) * (1.0 - smoothstep(3.0, 7.0, since)) * (1.0 - smoothstep(0.3, 0.9, fwidth(p.y) / 1.9));
        vec3 hay = mix(mix(${linear('#a6aa5e')}, ${linear('#7f9148')}, smoothstep(6.0, 30.0, since)), ${linear('#8a8f52')}, windrow) * (0.86 + 0.28 * fine);
        vec3 soil = ${linear('#7a4c38')} * (0.8 + 0.4 * mid) * mix(1.0, 0.62, uWet);
        landRough = 0.96;
        landBump = (n3.rg - 0.5) * 1.6 + (n2.rg - 0.5) * 0.8;

        // The farm's own ground: meadow round its blocks of fields; the neighbours' quilt beyond.
        float ours = 0.0;
        for (int k = 0; k < ${blocks.length}; k++) ours = max(ours, 1.0 - smoothstep(-1.5, 2.5 + (mid - 0.5) * 2.0, rectDist(BLOCK_RECT[k], p)));
        // The hill behind the fields, where it is not under trees, is rough pasture.
        ours = max(ours, 1.0 - smoothstep(-3.0, 5.0 + (mid - 0.5) * 6.0, rectDist(${rectGlsl({ x0: LAND.x0 - 10 * K, z0: -112 * K, x1: LAND.x1 + 6 * K, z1: -20 * K })}, p)));
        // Inside the farm's country the quilt's woods give way to open land.
        float od = max(max(${LAND.x0.toFixed(1)} - pw.x, pw.x - ${LAND.x1.toFixed(1)}), max(${OPEN.z0.toFixed(1)} - pw.y, pw.y - ${OPEN.z1.toFixed(1)}));
        float open = 1.0 - smoothstep(${OPEN.in.toFixed(1)}, ${OPEN.out.toFixed(1)}, od);
        vec3 col = grass;
        float woodK = 0.0;
        vec3 winterWood = vec3(0.2);
        {
          Land l = landAt(pw);
          l.q /= ${S.toFixed(2)}; l.width /= ${S.toFixed(2)}; l.edge /= ${S.toFixed(2)};
          // Strip edges wander a little, as a ploughman's do, and each strip ends in a headland of rough grass.
          float qx = l.q.x + (n2.b - 0.5) * 0.7 + (broad - 0.5) * 1.6;
          float strip = floor(qx / l.width), fx = fract(qx / l.width);
          float runL = l.width * ${QUILT.run.toFixed(1)}, shift = ihash(ivec2(int(strip) + l.cell.x * 31, l.cell.y * 17 + 5));
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
          // The sprayer's wheelings through potatoes and grain, and the lie of the crop where wind and rain have been at it.
          float wheel = (1.0 - smoothstep(0.05, 0.2, abs(abs(fract(l.q.x / 3.6) - 0.5) * 3.6 - 0.9))) * (1.0 - smoothstep(0.3, 1.2, fwidth(l.q.x)));
          crop *= 1.0 - 0.26 * wheel * step(kind, 0.58) * ramp(150.0, 175.0, uDay) * (1.0 - ramp(246.0, 262.0, uDay));
          crop *= 0.84 + 0.32 * texture2D(uNoise, p * 0.037 + tone).a;
          float verge = min(min(fx, 1.0 - fx) * l.width, min(fy, 1.0 - fy) * runL * 0.6);
          float aa = fwidth(qx) * 1.5;
          vec3 rough = grass * mix(vec3(0.86, 0.9, 0.76), vec3(1.08, 1.02, 0.84), tuft);
          crop = mix(rough, crop, smoothstep(0.6, 1.8 + aa, verge + (fine - 0.5) * 0.8));
          // woodlots, and hedgerows between the blocks
          // Seen from far off a wood is its canopy: crowns catching the light, dark between them, hardwood stands paler
          // among the spruce and turning in September.
          vec4 crown = texture2D(uNoise, p * 0.071);
          float bough = crown.a;
          vec3 spruce = mix(${linear('#14261c')}, ${linear('#2f4c2b')}, bough * bough);
          vec3 turned = mix(mix(${linear('#b5482a')}, ${linear('#d98a2c')}, fine), ${linear('#dcb53a')}, step(0.5, mid));
          vec3 broadleaf = mix(mix(${linear('#33562a')}, ${linear('#789a44')}, bough), turned * (0.6 + 0.5 * bough), smoothstep(0.1, 0.6, uGold + (broad - 0.5) * 0.4) * step(0.3, tuft));
          broadleaf = mix(${linear('#5a5046')} * (0.7 + 0.5 * bough), broadleaf, uLeaf);
          vec3 woods = mix(spruce, broadleaf, smoothstep(0.92 - l.hard * 0.7, 1.08 - l.hard * 0.7, texture2D(uNoise, p * 0.021).a + (bough - 0.5) * 0.3));
          woods *= 0.5 + 0.7 * bough;
          float ragged = (mid - 0.5) * 6.0;
          float inWoods = l.woods * smoothstep(1.5, 4.0, l.edge + ragged) * (1.0 - smoothstep(0.3, 0.5, open));
          float hedge = (1.0 - l.woods) * (1.0 - smoothstep(1.0, 2.6, l.edge + ragged * 0.3)) * (1.0 - open);
          vec3 outland = mix(crop, woods, max(inWoods, hedge * 0.8));
          // Hedgerows grown up along some of the strips' sides (stripEdge() in layout.ts stands bushes on the same lines).
          float hu = l.q.x / l.width, hfx = fract(hu), hside = hfx < 0.5 ? floor(hu) : floor(hu) + 1.0;
          float hedged = step(ihash(ivec2(int(hside) * 7 + l.cell.x * 13, l.cell.y * 29 + 91)), 0.4) * (1.0 - l.woods);
          float hrow = hedged * (1.0 - smoothstep(0.25, 1.25, min(hfx, 1.0 - hfx) * l.width + (fine - 0.5) * 1.1));
          outland = mix(outland, broadleaf * 0.5, hrow * 0.9);
          {
            // The neighbours' ground is worked too: a farm track down the side of one strip, a stone wall along another.
            float sideH = ihash(ivec2(int(hside) * 7 + l.cell.x * 13, l.cell.y * 29 + 91));
            float sdm = min(hfx, 1.0 - hfx) * l.width * ${S.toFixed(2)}, pxm = length(fwidth(pw));
            float track = step(0.4, sideH) * step(sideH, 0.64) * (1.0 - l.woods) * (1.0 - open);
            float ruts = (1.0 - smoothstep(0.25, 0.6, abs(sdm - 1.6))) + (1.0 - smoothstep(0.25, 0.6, abs(sdm - 3.2)));
            outland = mix(outland, soil * 1.2, track * min(1.0, ruts) * 0.6 * (1.0 - smoothstep(0.6, 2.0, pxm)));
            outland = mix(outland, soil * 1.15, track * (1.0 - smoothstep(1.0, 4.4 + pxm, sdm)) * 0.45 * smoothstep(0.6, 2.0, pxm) * clamp(4.4 / pxm, 0.25, 1.0));
            float wall = step(0.64, sideH) * step(sideH, 0.84) * (1.0 - l.woods) * (1.0 - open) * (1.0 - smoothstep(0.5, 1.1 + pxm, sdm));
            outland = mix(outland, mix(vec3(0.5, 0.49, 0.45), broadleaf * 0.5, 0.5) * (0.75 + 0.5 * fine), wall * 0.85 * clamp(1.6 / pxm, 0.3, 1.0));
          }
          landRough = mix(0.96, 1.0, inWoods);
          woodK = max(inWoods, hedge * 0.8) * (1.0 - ours);
          // a wood in winter from far off: the grey-brown of bare twigs, spruce dark among it, snow showing through
          winterWood = mix(spruce * 0.8, mix(${linear('#4f463f')}, ${linear('#786c62')}, bough), smoothstep(0.92 - l.hard * 0.7, 1.08 - l.hard * 0.7, texture2D(uNoise, p * 0.021).a + (bough - 0.5) * 0.3));
          landBump = mix(landBump, (crown.rg - 0.5) * 11.0, max(inWoods, hedge * 0.8) * (1.0 - ours));
          col = mix(outland, col, ours);
        }
        // Wet hollows in the meadow, greener and darker, with rushes; after rain they hold water.
        float hollow = smoothstep(0.62, 0.78, texture2D(uNoise, p * 0.019 + 0.57).b) * ours * (1.0 - vSurf.x);
        float lowGround = smoothstep(3.2, 1.1, vWorld.y / ${KV.toFixed(3)});
        float wetHere = hollow * (0.45 + 0.55 * lowGround) + (1.0 - smoothstep(0.12, 0.4, vSurf.y)) * 0.6 * ours;
        col = mix(col, grass * vec3(0.62, 0.82, 0.6) * (0.8 + 0.4 * tuft), wetHere * 0.75);
        {
          float nearK = 1.0 - smoothstep(9.0, 40.0, distance(vWorld, cameraPosition));
          // (How fast the ground goes by from one pixel to the next is taken here, outside the branch, and handed to
          // each read inside it: a branch that works that out for itself is run for every point of the land on some
          // graphics systems, however far the camera.)
          vec2 wx = dFdx(pw), wy = dFdy(pw);
          if (nearK > 0.001) {
            // blades lying every way in tufts, light on some and the thatch dark between them
            // (a blade's width across, a few of its lengths along; three lies of the grass, one or another by the tuft)
            float lie1 = textureGrad(uNoise, pw * 0.13, wx * 0.13, wy * 0.13).b, lie2 = textureGrad(uNoise, pw * 0.13 + 0.5, wx * 0.13, wy * 0.13).a;
            vec2 g1 = turned(pw, 0.95, 0.3), g2 = turned(pw, 0.2, 0.98), g3 = turned(pw, 0.7, -0.7);
            float b1 = textureGrad(uNoise, g1 * vec2(3.1, 0.47), turned(wx, 0.95, 0.3) * vec2(3.1, 0.47), turned(wy, 0.95, 0.3) * vec2(3.1, 0.47)).a;
            float b2 = textureGrad(uNoise, g2 * vec2(3.1, 0.47) + 0.3, turned(wx, 0.2, 0.98) * vec2(3.1, 0.47), turned(wy, 0.2, 0.98) * vec2(3.1, 0.47)).a;
            float blade2 = textureGrad(uNoise, g3 * vec2(2.7, 0.43) + 0.6, turned(wx, 0.7, -0.7) * vec2(2.7, 0.43), turned(wy, 0.7, -0.7) * vec2(2.7, 0.43)).a;
            float blade = mix(mix(b1, b2, smoothstep(0.35, 0.65, lie1)), blade2, smoothstep(0.45, 0.7, lie2));
            float sward = smoothstep(0.3, 0.7, blade);
            float meadowN = (1.0 - vSurf.x) * (1.0 - smoothstep(0.1, 0.4, vSurf.z));
            col *= mix(1.0, mix(0.6, 1.36, sward), nearK * meadowN * 0.8);
            col = mix(col, col * vec3(1.25, 1.18, 0.7), nearK * meadowN * 0.35 * smoothstep(0.62, 0.9, blade2) * (0.4 + 0.6 * (1.0 - uLeaf * 0.6)));
            landBump += (vec2(blade, blade2) - 0.5) * 2.5 * nearK * meadowN;
          }
        }
        // The farm's meadow moves: a gust lays the grass over and it shows pale.
        float gust = gustAt(p) * min(uSway, 1.2);
        col *= 1.0 + 0.14 * gust * ours * uLeaf * (1.0 - vSurf.x);
        // Pasture and mowing: no two pieces of it grazed or grown alike, and the cattle's paths wandering across it.
        {
          float piece = texture2D(uNoise, p * 0.0023 + 0.61).b, rough = texture2D(uNoise, p * 0.0041 + 0.23).b;
          float meadow = ours * (1.0 - vSurf.x) * (1.0 - smoothstep(0.1, 0.4, vSurf.z));
          col *= mix(1.0, 0.8 + 0.44 * smoothstep(0.35, 0.65, piece), meadow);
          // fern and hardhack coming in where it is not kept down, rusty by September
          vec3 brake = mix(grass * vec3(0.74, 0.86, 0.5), ${linear('#8a6a3c')} * (0.8 + 0.4 * fine), smoothstep(236.0, 262.0, uDay));
          col = mix(col, brake * (0.7 + 0.6 * tuft), smoothstep(0.6, 0.7, rough + (mid - 0.5) * 0.2) * 0.6 * meadow * uLeaf);
          float clumpP = smoothstep(0.62, 0.72, texture2D(uNoise, p * 0.057 + 0.3).a) * smoothstep(0.45, 0.6, rough);
          col = mix(col, mix(grass * vec3(0.4, 0.52, 0.34), ${linear('#6e5a3a')}, 0.6 * (1.0 - uLeaf)) * (0.6 + 0.8 * fine), clumpP * 0.7 * meadow);
          float back = meadow * (1.0 - smoothstep(${HOME_WOODS.z1.toFixed(1)}, ${(HOME_WOODS.z1 + 60).toFixed(1)}, pw.y));
          col = mix(col, mix(${linear('#6f7046')}, ${linear('#4f5a34')}, tuft) * (0.7 + 0.6 * fine), back * 0.5 * smoothstep(0.35, 0.6, texture2D(uNoise, p * 0.021 + 0.8).b));
          float trailN = texture2D(uNoise, p * 0.0052 + 0.17).b, pxm = length(fwidth(pw));
          float off = abs(trailN - 0.5) / max(fwidth(trailN), 1e-5) * pxm;
          float trail = (1.0 - smoothstep(0.2, 0.55 + pxm, off)) * smoothstep(0.4, 0.5, piece) * (1.0 - smoothstep(1.2, 3.5, pxm));
          col = mix(col, ${linear('#7f6a4f')} * (0.8 + 0.4 * fine) * mix(1.0, 0.7, uWet), trail * 0.55 * meadow);
        }
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
        // The meadow where it has been mown; rank grass in the ditch beside the road and where no mower reaches by the walls.
        float meadowK = ours * (1.0 - wetHere) * (1.0 - smoothstep(0.1, 0.4, vSurf.z));
        col = mix(col, hay, mown * meadowK * 0.85);
        float rd = vNear.x * 4.0;
        float ditch = smoothstep(0.8, 1.05, rd) * (1.0 - smoothstep(1.3, 2.0, rd)) + (1.0 - smoothstep(0.15, 0.8, vNear.y * 3.0)) * 0.7;
        col = mix(col, grass * vec3(0.68, 0.9, 0.6) * (0.8 + 0.4 * tuft), min(1.0, ditch) * 0.6 * ours);
        // Round the village and the siding the ground is worked in small pieces, and the road widens to a yard.
        for (int k = 0; k < 2; k++) {
          vec2 pd = pw - PLACES[k];
          vec2 ad = abs(pd);
          if (ad.x > 220.0 || ad.y > 150.0) continue;
          float reachP = 1.0 - smoothstep(0.75, 1.0, max(ad.x / 200.0, ad.y / 130.0) + (mid - 0.5) * 0.3);
          vec2 cellP = pd / vec2(47.0, 36.0) + 0.5, idP = floor(cellP), inP = fract(cellP);
          float hP = hash12(idP + float(k) * 31.7), tP = hash12(idP + 9.3 + float(k) * 17.1);
          vec3 plot = hP < 0.3 ? soil * (0.9 + 0.3 * tP) : hP < 0.62 ? grass * vec3(1.14, 1.06, 0.7) * (0.85 + 0.3 * tP) : grass * (0.78 + 0.4 * tP);
          float linesP = 0.5 + 0.5 * cos(pd.y * 6.2831853 / 1.1);
          plot *= hP < 0.3 ? 1.0 - 0.3 * linesP * (1.0 - smoothstep(0.3, 0.9, fwidth(pd.y) / 1.1)) : 1.0;
          float edgeP = min(min(inP.x, 1.0 - inP.x) * 47.0, min(inP.y, 1.0 - inP.y) * 36.0);
          plot = mix(grass * vec3(0.55, 0.62, 0.42), plot, smoothstep(0.7, 1.8 + length(fwidth(pw)), edgeP));
          float offRoad = smoothstep(7.0, 12.0, ad.y);
          col = mix(col, plot, reachP * offRoad * (1.0 - vSurf.x) * 0.92);
          float apron = 1.0 - smoothstep(0.8, 1.0, length(pd / vec2(34.0, 13.0)) + (fine - 0.5) * 0.2);
          col = mix(col, mix(${linear('#8c8676')}, ${linear('#5e5346')}, fine) * mix(1.0, 0.7, uWet), apron * 0.9);
        }
        // Bare ledge shows through high on the ridge, grey and lichened.
        float ledge = smoothstep(0.64, 0.74, texture2D(uNoise, p * 0.027 + 0.43).b * 0.72 + mid * 0.28) * smoothstep(-31.0, -46.0, pw.y / ${K.toFixed(1)}) * (1.0 - smoothstep(-200.0, -280.0, pw.y / ${K.toFixed(1)}));
        col = mix(col, mix(${linear('#8e8c84')}, ${linear('#6a6e5e')}, smoothstep(0.4, 0.7, fine)) * (0.78 + 0.4 * n2.a), ledge * ours);
        landBump = mix(landBump, (n2.rg - 0.5) * 5.0, ledge * ours);
        // The woods' floor on the ridge, needle duff and moss, its edge as uneven as the trees'.
        float floorK = smoothstep(0.25, 0.75, vSurf.x + (mid - 0.5) * 0.7);
        vec3 duff = mix(${linear('#43372a')}, ${linear('#2d3b22')}, smoothstep(0.4, 0.7, patchy + (fine - 0.5) * 0.4)) * (0.7 + 0.6 * fine);
        // Along the wood's edge and in its bays, where light gets in under the trees: fern in beds, rusty by September.
        {
          float edgeW = smoothstep(0.03, 0.22, vSurf.x) * (1.0 - smoothstep(0.35, 0.8, vSurf.x + (mid - 0.5) * 0.5));
          vec3 fern = mix(uGrass * vec3(0.7, 1.0, 0.5), ${linear('#8f6a38')}, smoothstep(236.0, 262.0, uDay)) * (0.6 + 0.8 * texture2D(uNoise, p * 0.9).a);
          col = mix(col, fern, edgeW * smoothstep(0.35, 0.6, texture2D(uNoise, p * 0.06 + 0.4).b) * 0.8 * uLeaf);
        }
        col = mix(col, duff, floorK * 0.94);
        // From far off a wood is its canopy: what shows between the trees drawn there is crowns, not floor.
        {
          float cfar = smoothstep(140.0, 380.0, distance(vWorld, cameraPosition)) * (0.25 + 0.75 * uLeaf) * (1.0 - smoothstep(0.15, 0.5, uSnow));
          vec4 cr = texture2D(uNoise, p * 0.071);
          vec3 canopy = mix(${linear('#14261c')}, ${linear('#2f4c2b')}, cr.a * cr.a) * (0.5 + 0.7 * cr.a);
          col = mix(col, canopy, floorK * 0.94 * cfar);
          landBump = mix(landBump, (cr.rg - 0.5) * 11.0, floorK * cfar);
        }
        col = mix(col, mix(${linear('#8a6e52')}, ${linear('#5b4534')}, uWet) * (0.82 + 0.36 * fine), smoothstep(0.25, 0.75, vSurf.z + (fine - 0.5) * 0.5) * 0.85);
        {
          float wetB = (1.0 - smoothstep(0.5, 1.0, vSurf.y + (mid - 0.5) * 0.3)) * (1.0 - vSurf.x);
          vec3 rush = mix(grass * vec3(0.42, 0.62, 0.36), ${linear('#6f6a3c')}, 0.6 * (1.0 - uLeaf)) * (0.45 + 1.0 * texture2D(uNoise, p * 0.7).a);
          col = mix(col, rush, wetB * (0.35 + 0.5 * smoothstep(0.4, 0.6, tuft)));
        }
        float barB = smoothstep(0.5, 0.7, texture2D(uNoise, pw * 0.0063 + 0.4).b);
        float bank = max(1.0 - smoothstep(0.1, 0.24, vSurf.y + (mid - 0.5) * 0.1), barB * (1.0 - smoothstep(0.26, 0.42, vSurf.y + (mid - 0.5) * 0.12)));
        vec3 gravel = mix(${linear('#8c8676')}, ${linear('#4c4033')}, 0.45 + 0.4 * fine) * mix(1.0, 0.7, uWet);
        col = mix(col, gravel, bank);
        // Under each of the farm's fields the ground is the soil's own colour, so no green shows at a field's edge; round
        // it, a headland where the tractor turns, worn pale. Somebody else's ground runs green to its wall.
        float headland = 0.0, margin = 0.0;
        // What somebody else's parcel reads of the ground, read once here if any such parcel is near: the loop over
        // the parcels then reads no texture, and can be left early.
        float offNear = 0.0;
        for (int k = 0; k < ${FIELD_COUNT}; k++) offNear = max(offNear, uOffK[k] * step(rectDist(FIELD_RECT[k], p), 4.6));
        vec3 offNoise = vec3(0.0);
        vec4 offGround = vec4(0.0);
        if (offNear > 0.001) {
          offNoise = vec3(texture2D(uNoise, p * 0.05).b, texture2D(uNoise, p * 0.47).a, texture2D(uNoise, p * 1.9).a);
          offGround = offRead(p);
        }
        for (int k = 0; k < ${FIELD_COUNT}; k++) {
          float fd = rectDist(FIELD_RECT[k], p);
          if (fd > 4.6) continue;
          // Somebody else's parcel: its hay, pasture or stubble, to an edge as uneven as a mower leaves.
          if (uOffK[k] > 0.001) {
            float tall;
            vec2 f = (p - FIELD_RECT[k].xy) / (FIELD_RECT[k].zw - FIELD_RECT[k].xy);
            vec3 meadow = offCover(p, f, OFF_KINDS[k], offNoise.x, offNoise.y, offNoise.z, offGround, tall);
            meadow = mix(meadow, meadow * vec3(1.16, 1.12, 0.96) + vec3(0.025, 0.02, 0.0), uAvailK[k] * 0.8);
            col = mix(col, meadow, (1.0 - smoothstep(-0.7, 0.8, fd + (mid - 0.5) * 2.2 + (fine - 0.5) * 0.6)) * uOffK[k]);
          }
          col = mix(col, soil * (0.8 + 0.3 * fine), (1.0 - smoothstep(0.35, 0.85, fd + (mid - 0.5) * 0.5)) * uHeld[k]);
          headland = max(headland, (1.0 - smoothstep(0.9, 2.0, fd + (fine - 0.5) * 0.6)) * smoothstep(0.3, 0.7, fd) * uHeld[k]);
          margin = max(margin, smoothstep(1.6, 2.2, fd) * (1.0 - smoothstep(2.9, 4.4, fd + (mid - 0.5) * 1.6 + (fine - 0.5) * 0.5)));
        }
        col = mix(col, mix(grass * vec3(1.18, 1.08, 0.8), soil * 1.15, 0.35 + 0.3 * fine), headland * 0.7);
        col = mix(col, mix(grass * vec3(0.5, 0.66, 0.4), ${linear('#8a7a4c')}, max(0.3 * step(0.6, tuft), 0.7 * (1.0 - uLeaf))) * (0.6 + 0.7 * fine), margin * 0.75);
        col *= mix(1.0, 0.84, uWet * (1.0 - bank));
        landRough = mix(landRough, 0.62, uWet * 0.6);
        landRough = mix(landRough, 0.35, wetHere * uWet);
        {
          // Snow. It is held in the hollows, in the ditches, along the walls and under the wood's edge, and goes first
          // from ground that faces the sun; rank grass and weeds stand out of it along every wall and field edge.
          float holdS = 0.7 * hollow + 0.5 * lowGround * ours + 0.6 * min(1.0, ditch) + 0.5 * smoothstep(0.05, 0.4, vSurf.x) + 0.4 * woodK - 0.5 * bank;
          float pokeS = max(max(0.9 * min(1.0, ditch), 0.8 * headland), 0.25 * smoothstep(0.5, 0.78, tuft)) * ours + 0.5 * bank;
          float snowK;
          vec2 sb = landBump * 0.22;
          col = groundSnow(col, vWorld.xz, clamp(vWNormal.y, 0.0, 1.0), uSnow, holdS, pokeS, landRough, sb, snowK);
          landBump = sb / 0.22;
          landSnow = snowK;
          // Under trees the snow lies in their shade, and from far off what is seen is their twigs and boughs.
          col = mix(col, col * vec3(0.6, 0.66, 0.78), snowK * smoothstep(0.25, 0.75, vSurf.x) * 0.7);
          col = mix(col, winterWood * (0.7 + 0.5 * fine), snowK * woodK * 0.72);
          // The paths the household treads: house to barn, barn to potato house, and out to the lane.
          float pathD = min(min(segD(pw, vec2(${HOUSE.x.toFixed(1)}, ${HOUSE.z.toFixed(1)}), vec2(${BARN.x.toFixed(1)}, ${BARN.z.toFixed(1)})), segD(pw, vec2(${BARN.x.toFixed(1)}, ${BARN.z.toFixed(1)}), vec2(${POTATO_HOUSE.x.toFixed(1)}, ${POTATO_HOUSE.z.toFixed(1)}))),
            min(segD(pw, vec2(${HOUSE.x.toFixed(1)}, ${HOUSE.z.toFixed(1)}), vec2(${ROAD[2][0].toFixed(1)}, ${ROAD[2][1].toFixed(1)})), segD(pw, vec2(${DUFOUR_HOUSE.x.toFixed(1)}, ${DUFOUR_HOUSE.z.toFixed(1)}), vec2(${DUFOUR_BARN.x.toFixed(1)}, ${DUFOUR_BARN.z.toFixed(1)}))));
          float path = (1.0 - smoothstep(0.45, 1.1, pathD + (texture2D(uNoise, pw * 0.09).b - 0.5) * 1.6 + (fine - 0.5) * 0.3)) * snowK;
          col = mix(col, mix(vec3(0.42, 0.47, 0.6), soil * 0.7, 0.35 * (1.0 - smoothstep(0.5, 0.95, uSnow))) * (0.8 + 0.4 * fine), path * 0.9);
        }
        diffuseColor.rgb = col;
      }
      ${snowRimeAt('0.0', 'rimeAt( vWorld.y )')}
    `,
    fragmentRoughness: 'roughnessFactor = landRough;',
    // (under snow the ground's small unevenness is buried: the drifts' own shape is what the light falls on)
    fragmentNormal: 'normal = normalize(mix(normal, (viewMatrix * vec4(0.0, 1.0, 0.03, 0.0)).xyz, 0.75 * landSnow) + (viewMatrix * vec4(landBump.x, 0.0, landBump.y, 0.0)).xyz * 0.22);',
  })
  const landMesh = new Mesh(land, landMat)
  landMesh.receiveShadow = true
  landMesh.frustumCulled = false
  landMesh.userData.part = 'land'
  // Its surface is the costliest thing in the picture to shade: drawn after the trees, the crops and the buildings,
  // it is shaded only where it shows between them.
  const under = new Group()
  under.renderOrder = 50
  under.add(landMesh)
  group.add(under)
  disposables.push(land, landMat)

  // ---- Roads and tracks: ribbons laid on the ground. A dirt road is two ruts worn pale with a grass crown between, mud
  // and standing water in them when it is wet; gravel is laid full width, crowned and tight at its edges. The farm road
  // is dirt until the farm gravels it, from the potato house outward. A track keeps only its ruts.
  const gravel = { value: 0 }
  // The gravel is laid from the potato house outward, as far as the bridge.
  const gravelReach = Math.hypot(ROAD[10][0] - ROAD[0][0], ROAD[10][1] - ROAD[0][1])
  const trodAt = toWorld(HOME, 21, -5)
  const roadMat = (kind: 'farm' | 'town' | 'track') => patch(new MeshStandardMaterial({ color: 0xffffff, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), {
    uniforms: { uGravel: gravel },
    vertexHead: 'varying vec2 vRoad;',
    vertexBegin: 'vRoad = uv;',
    fragmentHead: 'uniform float uGravel; varying vec2 vRoad; float roadPool; float outV; float vergeW;',
    fragmentColor: /* glsl */ `
      {
        // A lane's ribbon is wider than its tread: a verge each side, with a ditch on one of them.
        vergeW = ${kind === 'track' ? '2.6' : '0.0'};
        float treadW = ${kind === 'track' ? WIDE.track.toFixed(1) : '1.0'};
        float um = vRoad.x * (treadW + 2.0 * vergeW);
        float u = ${kind === 'track' ? 'clamp((um - vergeW) / treadW, 0.0, 1.0)' : 'vRoad.x'}, edge = min(u, 1.0 - u);
        outV = ${kind === 'track' ? 'max(vergeW - um, um - vergeW - treadW)' : '-1.0'};
        vec2 rp = vWorld.xz / ${S.toFixed(2)};
        vec4 rn = texture2D(uNoise, rp * 0.9);
        float fine = rn.a, mid = texture2D(uNoise, rp * 0.13).a, broad = texture2D(uNoise, rp * 0.031).b;
        float rut = max(exp(-pow((u - 0.27) / 0.11, 2.0)), exp(-pow((u - 0.73) / 0.11, 2.0)));
        float wear = clamp(rut * ${kind === 'track' ? '1.0' : '1.3'} - 0.18 + (fine - 0.5) * 0.5 + (mid - 0.5) * 0.5 + ${kind === 'track' ? '(broad - 0.6) * 0.9' : '0.12'}, 0.0, 1.0);
        vec3 dirt = mix(${linear('#7f6248')}, ${linear('#b09472')}, wear * (0.6 + 0.4 * fine)) * mix(1.0, 0.56, uWet);
        float dirtA = smoothstep(0.2, 0.62, wear) * smoothstep(0.0, 0.1, edge) * ${kind === 'track' ? '0.8' : '0.95'};
        vec3 stone = mix(${linear('#8c877a')}, ${linear('#b4ae9c')}, fine) * (0.86 + 0.24 * step(0.62, rn.b)) * (1.0 - 0.2 * rut) * mix(1.0, 0.72, uWet);
        float stoneA = smoothstep(0.0, 0.07, edge + (fine - 0.5) * 0.06);
        float g = ${kind === 'town' ? '1.0' : kind === 'track' ? '0.0' : `1.0 - smoothstep(uGravel * 1.2 - 0.06, uGravel * 1.2, length(vWorld.xz - vec2(${ROAD[0][0].toFixed(1)}, ${ROAD[0][1].toFixed(1)})) / ${gravelReach.toFixed(1)} + (mid - 0.5) * 0.05)`};
        // Water stands in the ruts of a dirt road after rain; in a wet spring it is mud from side to side.
        roadPool = uWet * (1.0 - g) * smoothstep(0.5, 0.8, rut) * smoothstep(0.52, 0.66, mid * 0.6 + broad * 0.4);
        dirt = mix(dirt, ${linear('#3d2d22')}, smoothstep(0.6, 1.0, uWet) * 0.5 * (1.0 - g));
        dirtA = mix(dirtA, max(dirtA, smoothstep(0.0, 0.12, edge) * 0.8), smoothstep(0.6, 1.0, uWet));
        diffuseColor.rgb = mix(mix(dirt, vec3(0.02, 0.022, 0.02), roadPool), stone, g);
        diffuseColor.a = mix(dirtA, stoneA, g);
      }
      ${SNOW_RIME}
      {
        // Under snow a way shows only where it is trodden: the farm road between the house and the potato house.
        float snowed = smoothstep(0.25, 0.8, uSnow);
        float stalks = 0.0;
        if (outV > 0.0) {
          // Longer grass and weeds nobody mows, ragged at its outer edge; dead stalks standing out of the snow in winter.
          float vn = texture2D(uNoise, vWorld.xz * 0.61).a, vb = texture2D(uNoise, vWorld.xz * 0.043).b;
          float k = (1.0 - smoothstep(vergeW * 0.35, vergeW, outV + (vn - 0.5) * 1.4)) * (0.55 + 0.45 * smoothstep(0.3, 0.6, vb));
          vec3 rank = uGrass * vec3(0.6, 0.8, 0.46) * (0.5 + 0.8 * vn);
          rank = mix(rank, ${linear('#9a8a58')} * (0.6 + 0.6 * vn), max(0.3 * step(0.66, vn), 0.75 * (1.0 - uLeaf)));
          rank = mix(rank, mix(${linear('#d8c64a')}, ${linear('#e9e4d2')}, step(0.5, vb)), step(0.9, texture2D(uNoise, vWorld.xz * 2.3).a) * uLeaf * 0.8);
          float ditch = step(vRoad.x, 0.5) * (1.0 - smoothstep(0.2, 0.55, abs(outV - 1.2)));
          rank = mix(rank, vec3(0.035, 0.045, 0.03), ditch * 0.8);
          diffuseColor.rgb = rank;
          diffuseColor.a = max(k * 0.92, ditch * 0.8);
          stalks = max(k * step(0.5, vn) * 0.75, ditch * 0.5);
        }
        float trod = ${kind === 'track' ? '0.0' : '1.0'};
        float ruts = max(exp(-pow((vRoad.x - 0.27) / 0.13, 2.0)), exp(-pow((vRoad.x - 0.73) / 0.13, 2.0)));
        vec3 packed = mix(vec3(0.62, 0.67, 0.76), vec3(0.3, 0.3, 0.32), ruts * ${kind === 'town' ? '0.75' : '0.5'}) * (0.8 + 0.3 * texture2D(uNoise, vWorld.xz * 0.32).a);
        diffuseColor.rgb = mix(diffuseColor.rgb, packed, snowed * trod);
        diffuseColor.a = mix(diffuseColor.a, max(trod * smoothstep(0.02, 0.2, min(vRoad.x, 1.0 - vRoad.x)), diffuseColor.a * 0.1), snowed);
        if (outV > 0.0) { diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.25, 0.17), snowed); diffuseColor.a = mix(diffuseColor.a, stalks, snowed); }
      }`,
    fragmentRoughness: 'roughnessFactor = mix(mix(0.95, 0.6, uWet * 0.7), 0.05, roadPool);',
  })
  const farmRoad = roadMat('farm'), townRoad = roadMat('town'), trackMat = roadMat('track')
  const laid = new Map<MeshStandardMaterial, BufferGeometry[]>()
  const ribbon = (pts: [number, number][], width: number, mat: MeshStandardMaterial, lift: number): void => {
    const p: number[] = [], uv: number[] = [], ix: number[] = []
    let len = 0
    // resample so the ribbon follows the ground
    const fine: [number, number][] = []
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1]
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3))
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
        const y = Math.abs(z - brookZ(x)) < brookHalf(x) + 0.3 * S && fordAt(x) > 0.5 ? WATER_Y - 0.06 * S : groundY(x, z)
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
    if (w.kind === 'road') ribbon(w.pts, w.pts === WAYS[0].pts ? WIDE.road : WIDE.road * 0.9, farmRoad, 0.11)
    else if (w.kind === 'track') ribbon(w.pts, WIDE.track + 5.2, trackMat, 0.08)
  }
  const longRoad = (zOf: (x: number) => number): [number, number][] => {
    const pts: [number, number][] = []
    for (let x = LAND.x0 - 2600; x <= LAND.x1 + 2600; x += 14) pts.push([x, zOf(x)])
    return pts
  }
  ribbon(longRoad(townRoadZ), WIDE.town, townRoad, 0.14)
  ribbon(longRoad(hillRoadZ), WIDE.town, townRoad, 0.16)
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
    for (let x = LAND.x0 - 1400; x <= LAND.x1 + 1400; x += x > LAND.x0 - 60 && x < LAND.x1 + 60 ? 1.6 : 8) {
      const z = brookZ(x), hw = brookHalf(x) + 0.5 * S
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
      shine: 0.3,
      vertexHead: 'varying vec2 vBrook;',
      vertexBegin: 'vBrook = uv;',
      fragmentHead: 'uniform float uIce; varying vec2 vBrook; vec2 ripple; float frozen; float riffle; float ford; float shoreK; vec2 bw;',
      fragmentColor: /* glsl */ `
        {
          bw = vWorld.xz / ${S.toFixed(2)};
          vec2 f1 = texture2D(uNoise, bw * vec2(0.05, 0.12) + vec2(-uTime * 0.03, 0.0)).rg - 0.5;
          vec2 f2 = texture2D(uNoise, bw * vec2(0.21, 0.37) + vec2(-uTime * 0.06, uTime * 0.01)).rg - 0.5;
          float shore = abs(vBrook.y), wob = texture2D(uNoise, bw * 0.23).a - 0.5;
          shoreK = shore;
          // Ice makes from the banks: a shelf down each side in the cold months, the current still open in the middle.
          float lead = 0.34 * smoothstep(0.34, 0.7, texture2D(uNoise, vec2(bw.x * 0.012, 0.37)).b);
          frozen = uIce * smoothstep(0.66 - (0.2 + lead) * uIce, 0.84 - (0.2 + lead) * uIce, shore + wob * 0.34);
          ripple = (f1 + f2 * 0.3) * (1.0 - frozen);
          ford = 1.0 - smoothstep(${(FORD.half * 0.6).toFixed(2)}, ${(FORD.half * 1.6).toFixed(2)}, abs(vWorld.x - ${FORD.x.toFixed(2)}));
          // Pools and runs along its length. Peat-dark in the pools, amber where it runs thin over gravel, clear at the edge.
          float pool = smoothstep(0.34, 0.7, texture2D(uNoise, vec2(bw.x * 0.012, 0.37)).b);
          float depth = (1.0 - max(smoothstep(0.28, 0.92, shore + wob * 0.34), ford * 0.85)) * (0.5 + 0.5 * pool);
          vec3 col = mix(${linear('#9a8660')}, mix(${linear('#5e5c3b')}, ${linear('#273936')}, smoothstep(0.4, 0.85, depth)), smoothstep(0.0, 0.45, depth));
          float broken = texture2D(uNoise, bw * vec2(0.19, 0.83) + vec2(-uTime * 0.05, 0.0)).a * 0.6 + texture2D(uNoise, bw.yx * vec2(1.31, 0.43) + vec2(0.0, -uTime * 0.09)).a * 0.4;
          riffle = max((1.0 - pool) * 0.7, ford) * smoothstep(0.54, 0.8, broken) * (1.0 - frozen) * smoothstep(0.95, 0.45, shore);
          col = mix(col, vec3(0.5, 0.54, 0.52), riffle * 0.6);
          // the current drawn out in lines
          col *= 0.9 + 0.2 * texture2D(uNoise, bw * vec2(0.035, 0.62) + vec2(-uTime * 0.045, 0.0)).a;
          vec3 ice = vec3(0.6, 0.67, 0.74) * (0.9 + 0.2 * texture2D(uNoise, bw * 0.11).a);
          ice = mix(ice, vec3(0.84, 0.88, 0.93), smoothstep(0.3, 0.7, uSnow) * smoothstep(0.35, 0.6, texture2D(uNoise, bw * 0.05).b + uSnow * 0.3));
          diffuseColor.rgb = mix(col, ice, frozen);
          diffuseColor.a = mix(mix(smoothstep(1.0, 0.74, shore) * 0.96, smoothstep(1.0, 0.6, shore) * 0.72, ford), smoothstep(1.0, 0.9, shore), frozen);
        }
      `,
      fragmentRoughness: 'roughnessFactor = mix(0.07, 0.55, max(frozen, riffle));',
      fragmentNormal: 'normal = normalize(normal + (viewMatrix * vec4(ripple.x, 0.0, ripple.y, 0.0)).xyz * (0.16 + 0.5 * riffle));',
      // Water mirrors the sky and, near its edge, the bank; more of both the lower it is seen. Looked into from above
      // it shows its own depth. The sun glints off it only for an eye that looks toward the sun.
      fragmentEmissive: /* glsl */ `
        {
          vec3 wN = inverseTransformDirection( normal, viewMatrix );
          vec3 wV = normalize( cameraPosition - vWorld );
          float fres = 0.13 + 0.87 * pow( 1.0 - max( dot( wN, wV ), 0.0 ), 5.0 );
          vec3 wR = reflect( - wV, wN );
          wR.y = abs( wR.y );
          // Rain breaks the mirror.
          float mirror = ( 1.0 - frozen ) * ( 1.0 - riffle * 0.6 ) * mix( 1.0, 0.3, smoothstep( 0.7, 1.0, uCloud.y ) ) * ( 1.0 - 0.5 * ford );
          vec3 seen = skyRadiance( wR, 0.08 );
          vec3 bank = skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * uGrass * 0.09;
          seen = mix( seen, bank, smoothstep( 0.45, 0.95, shoreK ) * ( 1.0 - smoothstep( 0.1, 0.5, wR.y ) ) * 0.8 );
          totalEmissiveRadiance += seen * fres * mirror;
          vec2 g = texture2D( uNoise, bw * 0.9 + vec2( -uTime * 0.25, uTime * 0.07 ) ).rg - 0.5;
          vec3 gN = normalize( vec3( g.x * 0.5 + ripple.x * 1.3, 1.0, g.y * 0.5 + ripple.y * 1.3 ) );
          float glint = pow( max( dot( reflect( - wV, gN ), uSunDir ), 0.0 ), 260.0 );
          totalEmissiveRadiance += uSunCol * glint * 2.4 * mirror * cloudShade( vWorld );
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
  const bounds = buildBounds()
  group.add(bounds.group)
  disposables.push(bounds)
  group.add(rocks)
  disposables.push(rocks.geometry, rocks.material as MeshStandardMaterial)

  return { group, under, water: { ice }, held, off, avail, gravel, dispose() { for (const d of disposables) d.dispose() } }
}

// Field stone, cleared by hand and piled along the edges of every block; gateways where the tracks go through.
function stoneWalls(): InstancedMesh {
  const spots: [number, number, number, number][] = []
  const r = rng(77)
  const line = (x0: number, z0: number, x1: number, z1: number, every: number) => {
    const count = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / every))
    for (let k = 0; k <= count; k++) {
      const t = k / count
      const x = x0 + (x1 - x0) * t + (r() - 0.5) * 0.4, z = z0 + (z1 - z0) * t + (r() - 0.5) * 0.4
      if (roadDist(x, z) < WIDE.track / 2 + 1.3 || Math.hypot(x - WOOD_GATE.x, z - WOOD_GATE.z) < 2.6) continue
      const s = 0.26 + r() * 0.18
      spots.push([x, z, s, 0])
      if (r() < 0.85) spots.push([x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.3, 0.2 + r() * 0.14, s * 0.85])
      if (r() < 0.4) spots.push([x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.3, 0.16 + r() * 0.1, s * 1.5])
      if (r() < 0.3) spots.push([x + (r() - 0.5) * 1.1, z + (r() - 0.5) * 1.1, 0.14 + r() * 0.12, 0])
    }
  }
  WALLS.forEach(([x0, z0, x1, z1]) => line(x0, z0, x1, z1, 0.56))
  // What is left of an older wall above the brook.
  for (let x = -18 * K; x < 16 * K; x += 7) {
    if (hash2(Math.round(x * 0.5), 7) < 0.5) continue
    line(x, 19.5 * K + (r() - 0.5) * 0.7, x + 2.6 + r() * 1.2, 19.5 * K + (r() - 0.5) * 0.7, 0.6)
  }
  // Piles where picked stone was tipped against the walls, here and there.
  for (const [x0, z0, x1, z1] of WALLS) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    for (let d = 12 + r() * 12; d < len - 6; d += 30 + r() * 30) {
      const t = d / len, nx = -(z1 - z0) / len, nz = (x1 - x0) / len, side = r() < 0.5 ? -1 : 1
      const cx = x0 + (x1 - x0) * t + nx * side * 1.5, cz = z0 + (z1 - z0) * t + nz * side * 1.5
      if (roadDist(cx, cz) < 4 || FIELDS.some(f => cx > f.x0 - 1.3 && cx < f.x1 + 1.3 && cz > f.z0 - 1.3 && cz < f.z1 + 1.3)) continue
      for (let q = 0; q < 9; q++) {
        const a = r() * 6.283, dd = Math.sqrt(r()) * 1.1, s = 0.2 + r() * 0.22
        spots.push([cx + Math.cos(a) * dd * 1.4, cz + Math.sin(a) * dd, s, dd < 0.45 ? s * 0.7 : 0])
      }
    }
  }
  // Boulders the ice left on the hill pasture, too big to move.
  for (let k = 0; k < 30 * K; k++) {
    const x = (6 + r() * 36) * K, z = (-26 - r() * 52) * K
    if (ridgeWoodAt(x, z) > 0.4 || roadDist(x, z) < 4 || r() < 0.35) continue
    const s = 0.5 + 1.1 * r() * r()
    spots.push([x, z, s, -s * 0.25])
    if (r() < 0.5) spots.push([x + (r() - 0.5) * 2.6, z + (r() - 0.5) * 2.6, s * 0.5, -s * 0.1])
  }
  // Ledge breaking through on the pasture's knolls, and the big stones nobody ever moved.
  for (let k = 0; k < 90; k++) {
    const x = LAND.x0 + r() * (LAND.x1 - LAND.x0), z = FARM.z0 + r() * 42 * K
    if (oursAt(x, z) < 0.9 || fieldMask(x, z, 10) > 0.01 || roadDist(x, z) < 6 || tractAt(x, z, 6) >= 0) continue
    if (Object.values(YARD_AT).some(y => x > y.x0 - 8 && x < y.x1 + 8 && z > y.z0 - 8 && z < y.z1 + 8) || Math.abs(z - brookZ(x)) < 12) continue
    const n = 2 + Math.floor(r() * 5), turn = r() * 3.14
    for (let q = 0; q < n; q++) {
      const a = r() * 6.283, dd = r() * 3.6, s = 0.5 + 1.3 * r() * r()
      spots.push([x + Math.cos(a + turn) * dd * 1.7, z + Math.sin(a) * dd, s, -s * 0.38])
    }
  }
  // Old walls that run on into the woods, where fields were let go; and along the foot of the saddle's old pasture.
  for (const wx of [-44, -31, -8, 5, 15.2, 31.6, 44, 58, 71]) {
    const x0 = wx * K, z0 = HOME_WOODS.z1 + 6, far = 50 + r() * 70
    for (let d = 0; d < far; d += 9) if (r() < 0.78) line(x0 + d * 0.06, z0 - d, x0 + (d + 8) * 0.06, z0 - d - 8, 0.62)
  }
  // Stone picked off each field and tipped at its corners.
  for (const f of FIELDS) for (const [cx, cz] of [[f.x0 - 5, f.z0 - 5], [f.x1 + 5, f.z0 - 5], [f.x0 - 5, f.z1 + 5], [f.x1 + 5, f.z1 + 5]]) {
    if (r() < 0.45 || roadDist(cx, cz) < 5 || fieldMask(cx, cz, 2) > 0.01) continue
    for (let q = 0; q < 12; q++) { const a = r() * 6.283, dd = Math.sqrt(r()) * 1.6, s = 0.22 + r() * 0.3; spots.push([cx + Math.cos(a) * dd, cz + Math.sin(a) * dd, s, dd < 0.6 ? s * 0.8 : 0]) }
  }
  // A culvert where a lane crosses wet ground: a headwall of flat stones each side.
  for (const [cx, cz] of [[-0.3 * K, 21.2 * K], [-0.3 * K, 2.2 * K], [34 * K, -7.6 * K]]) for (const side of [-1, 1]) for (let q = -2; q <= 2; q++) spots.push([cx + side * 3.1 + (r() - 0.5) * 0.3, cz + q * 0.55, 0.42, q === 0 ? -0.2 : 0.05])
  const geo = new OctahedronGeometry(1, 0)
  const gp = geo.getAttribute('position') as BufferAttribute
  for (let i = 0; i < gp.count; i++) {
    const k = 1 + (hash2(Math.round(gp.getX(i) * 50), Math.round(gp.getY(i) * 50 + gp.getZ(i) * 31)) - 0.5) * 0.3
    gp.setXYZ(i, gp.getX(i) * k, gp.getY(i) * k, gp.getZ(i) * k)
  }
  geo.computeVertexNormals()
  const mat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }), {
    fragmentColor: `diffuseColor.rgb *= 0.85 + 0.3 * texture2D(uNoise, vWorld.xz * 0.4).a; diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.3 * uSnow), vec3(0.86, 0.9, 0.95), uSnow * smoothstep(0.6, 0.9, vWNormal.y)); ${snowRimeAt('0.0', 'rimeAt( vWorld.y )')}`,
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
  mesh.frustumCulled = false
  return mesh
}
