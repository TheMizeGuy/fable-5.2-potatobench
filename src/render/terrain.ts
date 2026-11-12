// The land: one surface from the farm out to the far ridges, the farm's own meadow round its blocks of fields, the
// neighbours' quilt of strips and woodlots beyond, the brook and its ford, the roads and tracks and the stone walls.
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, Quaternion, Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FIELD_COUNT, PARCELS } from '../sim/index.ts'
import { OFF_GLSL, OFF_KIND } from './fields.ts'
import {
  BLOCKS, FIELDS, FORD, LAND, REGION, WALLS, WATER_Y, WAYS, brookHalf, brookZ, fordAt, gravelDist, groundY, hillRoadZ,
  TRACT_LINE, ridgeWoodAt, roadDist, townRoadZ, tractAt, wallDist,
} from './layout.ts'
import { hash2, rng, smooth } from './noise.ts'
import { SNOW_RIME, linear, patch, snowRimeAt } from './shaders.ts'

export interface Terrain {
  group: Group
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

const rectGlsl = (r: { x0: number; z0: number; x1: number; z1: number }) => `vec4(${r.x0.toFixed(2)}, ${r.z0.toFixed(2)}, ${r.x1.toFixed(2)}, ${r.z1.toFixed(2)})`

export function buildTerrain(): Terrain {
  const group = new Group()
  const disposables: { dispose(): void }[] = []
  const held = { value: new Array(FIELD_COUNT).fill(1) as number[] }
  const off = { value: new Array(FIELD_COUNT).fill(0) as number[] }, avail = { value: new Array(FIELD_COUNT).fill(0) as number[] }

  const xs = axis(LAND.x0 - 4.2, LAND.x1 + 4.2, 0.6, 1.065, 3600), zs = axis(-64.2, 64.2, 0.6, 1.065, 3600)
  const nx = xs.length, nz = zs.length
  const pos = new Float32Array(nx * nz * 3)
  const surf = new Float32Array(nx * nz * 4), near = new Float32Array(nx * nz * 2)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], k = j * nx + i
      const home = x > LAND.x0 - 4.5 && x < LAND.x1 + 4.5 && z > -64.5 && z < 64.5
      pos[k * 3] = x
      pos[k * 3 + 1] = groundY(x, z) - (home ? underField(x, z) * 0.09 : 0)
      pos[k * 3 + 2] = z
      // Under a tract's own trees the floor is the woods'; the line cut round it is a green ride.
      const stand = tractAt(x, z, TRACT_LINE), inside = tractAt(x, z, -0.5)
      surf[k * 4] = stand >= 0 && PARCELS[stand].cover === 'woods' ? (inside >= 0 ? 1 : 0.2) : ridgeWoodAt(x, z)
      surf[k * 4 + 1] = Math.min(1, Math.abs(z - brookZ(x)) / 8)
      // Trodden earth in the dooryards and along the gravel by them; a worn verge along the road between.
      const yard = Math.min(Math.hypot(x - 23.6, (z + 4) * 0.7), Math.hypot(x - 91.5, (z + 4) * 0.8)) < 12 ? 1 : 0.4
      surf[k * 4 + 2] = home ? Math.max(0, 1 - gravelDist(x, z) / 2.2) * yard : 0
      surf[k * 4 + 3] = hash2(i, j)
      near[k * 2] = home ? Math.min(1, gravelDist(x, z) / 4) : 1
      near[k * 2 + 1] = home ? Math.min(1, wallDist(x, z) / 3) : 1
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
  land.setIndex(new BufferAttribute(idx, 1))
  land.computeVertexNormals()
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
        ours = max(ours, 1.0 - smoothstep(-3.0, 5.0 + (mid - 0.5) * 6.0, rectDist(vec4(${(LAND.x0 - 10).toFixed(1)}, -112.0, ${(LAND.x1 + 6).toFixed(1)}, -20.0), p)));
        // Inside the farm's country the quilt's woods give way to open land.
        float od = max(max(${LAND.x0.toFixed(1)} - p.x, p.x - ${LAND.x1.toFixed(1)}), max(-26.0 - p.y, p.y - ${(LAND.z1 + 4).toFixed(1)}));
        float open = 1.0 - smoothstep(-6.0, 10.0, od);
        vec3 col = grass;
        {
          Land l = landAt(p);
          // Strip edges wander a little, as a ploughman's do, and each strip ends in a headland of rough grass.
          float qx = l.q.x + (n2.b - 0.5) * 0.7 + (broad - 0.5) * 1.6;
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
          outland = mix(outland, broadleaf * 0.55, hrow * 0.8);
          landRough = mix(0.96, 1.0, inWoods);
          landBump = mix(landBump, (crown.rg - 0.5) * 11.0, max(inWoods, hedge * 0.8) * (1.0 - ours));
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
        // The meadow where it has been mown; rank grass in the ditch beside the road and where no mower reaches by the walls.
        float meadowK = ours * (1.0 - wetHere) * (1.0 - smoothstep(0.1, 0.4, vSurf.z));
        col = mix(col, hay, mown * meadowK * 0.85);
        float rd = vNear.x * 4.0;
        float ditch = smoothstep(0.8, 1.05, rd) * (1.0 - smoothstep(1.3, 2.0, rd)) + (1.0 - smoothstep(0.15, 0.8, vNear.y * 3.0)) * 0.7;
        col = mix(col, grass * vec3(0.68, 0.9, 0.6) * (0.8 + 0.4 * tuft), min(1.0, ditch) * 0.6 * ours);
        // Bare ledge shows through high on the ridge, grey and lichened.
        float ledge = smoothstep(0.64, 0.74, texture2D(uNoise, p * 0.027 + 0.43).b * 0.72 + mid * 0.28) * smoothstep(-31.0, -46.0, p.y) * (1.0 - smoothstep(-200.0, -280.0, p.y));
        col = mix(col, mix(${linear('#8e8c84')}, ${linear('#6a6e5e')}, smoothstep(0.4, 0.7, fine)) * (0.78 + 0.4 * n2.a), ledge * ours);
        landBump = mix(landBump, (n2.rg - 0.5) * 5.0, ledge * ours);
        // The woods' floor on the ridge, needle duff and moss, its edge as uneven as the trees'.
        float floorK = smoothstep(0.25, 0.75, vSurf.x + (mid - 0.5) * 0.7);
        vec3 duff = mix(${linear('#43372a')}, ${linear('#2d3b22')}, smoothstep(0.4, 0.7, patchy + (fine - 0.5) * 0.4)) * (0.7 + 0.6 * fine);
        col = mix(col, duff, floorK * 0.94);
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
          // Somebody else's parcel: its hay, pasture or stubble, to an edge as uneven as a mower leaves.
          if (uOffK[k] > 0.001) {
            float tall;
            vec2 f = (p - FIELD_RECT[k].xy) / (FIELD_RECT[k].zw - FIELD_RECT[k].xy);
            vec3 meadow = offCover(p, f, OFF_KINDS[k], texture2D(uNoise, p * 0.05).b, texture2D(uNoise, p * 0.47).a, texture2D(uNoise, p * 1.9).a, tall);
            meadow = mix(meadow, meadow * vec3(1.16, 1.12, 0.96) + vec3(0.025, 0.02, 0.0), uAvailK[k] * 0.8);
            col = mix(col, meadow, (1.0 - smoothstep(-0.7, 0.8, fd + (mid - 0.5) * 2.2 + (fine - 0.5) * 0.6)) * uOffK[k]);
          }
          col = mix(col, soil * (0.8 + 0.3 * fine), (1.0 - smoothstep(0.35, 0.85, fd + (mid - 0.5) * 0.5)) * uHeld[k]);
          headland = max(headland, (1.0 - smoothstep(0.9, 2.0, fd + (fine - 0.5) * 0.6)) * smoothstep(0.3, 0.7, fd) * uHeld[k]);
        }
        col = mix(col, mix(grass * vec3(1.18, 1.08, 0.8), soil * 1.15, 0.35 + 0.3 * fine), headland * 0.7);
        col *= mix(1.0, 0.84, uWet * (1.0 - bank));
        landRough = mix(landRough, 0.62, uWet * 0.6);
        landRough = mix(landRough, 0.35, wetHere * uWet);
        diffuseColor.rgb = col;
      }
      ${snowRimeAt('uSnow * (1.0 - 0.7 * smoothstep(-0.03, 0.07, vWNormal.x) * (1.0 - smoothstep(0.42, 0.7, uSnow)))', 'rimeAt( vWorld.y )')}
    `,
    fragmentRoughness: 'roughnessFactor = landRough;',
    fragmentNormal: 'normal = normalize(normal + (viewMatrix * vec4(landBump.x, 0.0, landBump.y, 0.0)).xyz * 0.22);',
  })
  const landMesh = new Mesh(land, landMat)
  landMesh.receiveShadow = true
  landMesh.frustumCulled = false
  group.add(landMesh)
  disposables.push(land, landMat)

  // ---- Roads and tracks: ribbons laid on the ground. A dirt road is two ruts worn pale with a grass crown between, mud
  // and standing water in them when it is wet; gravel is laid full width, crowned and tight at its edges. The farm road
  // is dirt until the farm gravels it, from the potato house outward. A track keeps only its ruts.
  const gravel = { value: 0 }
  const roadMat = (kind: 'farm' | 'town' | 'track') => patch(new MeshStandardMaterial({ color: 0xffffff, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), {
    uniforms: { uGravel: gravel },
    vertexHead: 'varying vec2 vRoad;',
    vertexBegin: 'vRoad = uv;',
    fragmentHead: 'uniform float uGravel; varying vec2 vRoad; float roadPool;',
    fragmentColor: /* glsl */ `
      {
        float u = vRoad.x, edge = min(u, 1.0 - u);
        vec4 rn = texture2D(uNoise, vWorld.xz * 0.9);
        float fine = rn.a, mid = texture2D(uNoise, vWorld.xz * 0.13).a, broad = texture2D(uNoise, vWorld.xz * 0.031).b;
        float rut = max(exp(-pow((u - 0.27) / 0.11, 2.0)), exp(-pow((u - 0.73) / 0.11, 2.0)));
        float wear = clamp(rut * ${kind === 'track' ? '1.0' : '1.3'} - 0.18 + (fine - 0.5) * 0.5 + (mid - 0.5) * 0.5 + ${kind === 'track' ? '(broad - 0.6) * 0.9' : '0.12'}, 0.0, 1.0);
        vec3 dirt = mix(${linear('#7f6248')}, ${linear('#b09472')}, wear * (0.6 + 0.4 * fine)) * mix(1.0, 0.56, uWet);
        float dirtA = smoothstep(0.2, 0.62, wear) * smoothstep(0.0, 0.1, edge) * ${kind === 'track' ? '0.8' : '0.95'};
        vec3 stone = mix(${linear('#8c877a')}, ${linear('#b4ae9c')}, fine) * (0.86 + 0.24 * step(0.62, rn.b)) * (1.0 - 0.2 * rut) * mix(1.0, 0.72, uWet);
        float stoneA = smoothstep(0.0, 0.07, edge + (fine - 0.5) * 0.06);
        float g = ${kind === 'town' ? '1.0' : kind === 'track' ? '0.0' : '1.0 - smoothstep(uGravel * 1.2 - 0.06, uGravel * 1.2, length(vWorld.xz - vec2(23.4, -13.2)) / 78.0 + (mid - 0.5) * 0.05)'};
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
        float snowed = smoothstep(0.4, 0.9, uSnow);
        float trod = ${kind === 'farm' ? '1.0 - smoothstep(16.0, 26.0, distance(vWorld.xz, vec2(21.0, -5.0)))' : '0.0'};
        float ruts = max(exp(-pow((vRoad.x - 0.27) / 0.13, 2.0)), exp(-pow((vRoad.x - 0.73) / 0.13, 2.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.55, 0.62) * (0.8 + 0.3 * texture2D(uNoise, vWorld.xz * 0.7).a), snowed * trod);
        diffuseColor.a = mix(diffuseColor.a, max(ruts * trod, diffuseColor.a * ${kind === 'track' ? '0.1' : '0.4'}), snowed);
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
    if (w.kind === 'road') ribbon(w.pts, w.pts === WAYS[0].pts ? 1.42 : 1.35, farmRoad, 0.035)
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
      shine: 0.3,
      vertexHead: 'varying vec2 vBrook;',
      vertexBegin: 'vBrook = uv;',
      fragmentHead: 'uniform float uIce; varying vec2 vBrook; vec2 ripple; float frozen; float riffle; float ford; float shoreK;',
      fragmentColor: /* glsl */ `
        {
          vec2 f1 = texture2D(uNoise, vWorld.xz * vec2(0.05, 0.12) + vec2(-uTime * 0.03, 0.0)).rg - 0.5;
          vec2 f2 = texture2D(uNoise, vWorld.xz * vec2(0.21, 0.37) + vec2(-uTime * 0.06, uTime * 0.01)).rg - 0.5;
          float shore = abs(vBrook.y), wob = texture2D(uNoise, vWorld.xz * 0.23).a - 0.5;
          shoreK = shore;
          // Ice makes from the banks: a shelf down each side in the cold months, the current still open in the middle.
          frozen = uIce * smoothstep(0.66 - 0.52 * uIce, 0.84 - 0.52 * uIce, shore + wob * 0.34);
          ripple = (f1 + f2 * 0.3) * (1.0 - frozen);
          ford = 1.0 - smoothstep(${(FORD.half * 0.6).toFixed(2)}, ${(FORD.half * 1.6).toFixed(2)}, abs(vWorld.x - ${FORD.x.toFixed(2)}));
          // Pools and runs along its length. Peat-dark in the pools, amber where it runs thin over gravel, clear at the edge.
          float pool = smoothstep(0.34, 0.7, texture2D(uNoise, vec2(vWorld.x * 0.012, 0.37)).b);
          float depth = (1.0 - max(smoothstep(0.28, 0.92, shore + wob * 0.34), ford * 0.85)) * (0.5 + 0.5 * pool);
          vec3 col = mix(${linear('#9a8660')}, mix(${linear('#5e5c3b')}, ${linear('#273936')}, smoothstep(0.4, 0.85, depth)), smoothstep(0.0, 0.45, depth));
          float broken = texture2D(uNoise, vWorld.xz * vec2(0.19, 0.83) + vec2(-uTime * 0.05, 0.0)).a * 0.6 + texture2D(uNoise, vWorld.zx * vec2(1.31, 0.43) + vec2(0.0, -uTime * 0.09)).a * 0.4;
          riffle = max((1.0 - pool) * 0.7, ford) * smoothstep(0.54, 0.8, broken) * (1.0 - frozen) * smoothstep(0.95, 0.45, shore);
          col = mix(col, vec3(0.5, 0.54, 0.52), riffle * 0.6);
          // the current drawn out in lines
          col *= 0.9 + 0.2 * texture2D(uNoise, vWorld.xz * vec2(0.035, 0.62) + vec2(-uTime * 0.045, 0.0)).a;
          vec3 ice = vec3(0.6, 0.67, 0.74) * (0.9 + 0.2 * texture2D(uNoise, vWorld.xz * 0.11).a);
          ice = mix(ice, vec3(0.84, 0.88, 0.93), smoothstep(0.3, 0.7, uSnow) * smoothstep(0.35, 0.6, texture2D(uNoise, vWorld.xz * 0.05).b + uSnow * 0.3));
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
          vec2 g = texture2D( uNoise, vWorld.xz * 0.9 + vec2( -uTime * 0.25, uTime * 0.07 ) ).rg - 0.5;
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
  group.add(rocks)
  disposables.push(rocks.geometry, rocks.material as MeshStandardMaterial)

  return { group, water: { ice }, held, off, avail, gravel, dispose() { for (const d of disposables) d.dispose() } }
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
  // Boulders the ice left on the hill pasture, too big to move.
  for (let k = 0; k < 90; k++) {
    const x = 6 + r() * 36, z = -26 - r() * 52
    if (ridgeWoodAt(x, z) > 0.4 || roadDist(x, z) < 2 || r() < 0.35) continue
    const s = 0.22 + 0.5 * r() * r()
    spots.push([x, z, s, -s * 0.25])
    if (r() < 0.5) spots.push([x + (r() - 0.5) * 1.2, z + (r() - 0.5) * 1.2, s * 0.5, -s * 0.1])
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
