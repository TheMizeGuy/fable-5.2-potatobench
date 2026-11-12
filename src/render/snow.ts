// Snow on the ground, for the land and the fields' soil. A first snow lies thin over nearly everything and whatever
// stands on the ground shows through it (stubble, ridges, rank grass). Deep snow buries all that under drifts the wind
// laid out, long down the wind, which a low sun lights along one side. Going, in spring, it lies where it is held: the
// drifts' cores, hollows, ditches, the lee of walls and woods.
// The patterns are laid at scales that share no period, and each is let go as it nears the size of a pixel, so no
// grid of the noise shows from any height.
export const GROUND_SNOW = /* glsl */ `
const vec2 SNOW_WIND = vec2(0.94, 0.34);
// col: the ground as it is without snow. up: how much it faces the sky. hold: where snow lies longest, 0..1 (below 0
// where it goes first). poke: how much of what stands there shows through thin snow, 0..1. bump: the surface's slope.
vec3 groundSnow(vec3 col, vec2 xz, float up, float amount, float hold, float poke, inout float rough, inout vec2 bump, out float cover) {
  cover = 0.0;
  if (amount < 0.002) return col;
  vec2 q = vec2(dot(xz, SNOW_WIND), dot(xz, vec2(-SNOW_WIND.y, SNOW_WIND.x)));
  vec2 dq = q * vec2(0.0023, 0.0063);
  float d0 = texture2D(uNoise, dq).b;
  float d1 = texture2D(uNoise, vec2(xz.x * 0.8 - xz.y * 0.6, xz.x * 0.6 + xz.y * 0.8) * 0.0041 + 0.37).b;
  float px = length(fwidth(xz));
  // the wind's carving, a few metres long; and the grain of what the snow lies on, a hand's breadth
  float seeCr = 1.0 - smoothstep(0.6, 2.5, px), seeGr = 1.0 - smoothstep(0.12, 0.5, px);
  vec4 cr = mix(vec4(0.5), texture2D(uNoise, q * vec2(0.031, 0.097)), seeCr);
  float grain = mix(0.5, texture2D(uNoise, vec2(xz.x * 0.6 + xz.y * 0.8, xz.y * 0.6 - xz.x * 0.8) * 0.43).a, seeGr);
  float mid = texture2D(uNoise, vec2(xz.x * 0.6 - xz.y * 0.8, xz.y * 0.6 + xz.x * 0.8) * 0.027 + 0.19).a;
  float deep = smoothstep(0.5, 0.95, amount);
  // going, in spring; or come new, in the fall
  float melt = smoothstep(55.0, 95.0, uDay) * (1.0 - smoothstep(200.0, 250.0, uDay));
  float lieNew = 0.6 + (grain - 0.5) * 0.3 + (mid - 0.5) * 0.3 + (d0 - 0.5) * 0.2 + hold * 0.1;
  float lieOld = d0 * 0.46 + d1 * 0.22 + (mid - 0.5) * 0.16 + (cr.a - 0.5) * 0.08 + hold * 0.45;
  float lie = mix(lieNew, lieOld, melt);
  float a = amount * 1.55;
  cover = smoothstep(1.0 - a, 1.16 - a, lie) * smoothstep(0.2, 0.55, up);
  cover *= 1.0 - clamp(poke, 0.0, 1.0) * (1.0 - deep) * (0.45 + 0.55 * grain);
  // thin snow is seen through
  float thick = mix(mix(0.78, 0.96, melt), 1.0, deep);
  // the drifts' own shape, and the wind's carving across them
  float dx = texture2D(uNoise, dq + vec2(0.004, 0.0)).b - d0, dz = texture2D(uNoise, dq + vec2(0.0, 0.004)).b - d0;
  vec2 relief = (SNOW_WIND * dx + vec2(-SNOW_WIND.y, SNOW_WIND.x) * dz) * 4.5 * (0.35 + 0.65 * deep) + (cr.rg - 0.5) * 0.3 * seeCr;
  // scoured to a glaze on the crowns of the drifts, soft and a little blue in their lee
  float crust = deep * (1.0 - smoothstep(0.3, 0.55, d0)) * smoothstep(0.4, 0.7, cr.a);
  vec3 snow = mix(vec3(0.84, 0.89, 0.96), vec3(0.95, 0.96, 0.98), smoothstep(0.3, 0.7, d0 * 0.8 + cr.a * 0.2));
  // old snow is grey with what has blown onto it, and the ground at its edge is wet and dark
  snow = mix(snow, snow * vec3(0.86, 0.87, 0.88), melt * (1.0 - deep) * (0.5 + 0.5 * mid));
  col *= 1.0 - 0.4 * melt * (1.0 - deep) * smoothstep(0.0, 0.25, cover) * (1.0 - smoothstep(0.25, 0.7, cover));
  col = mix(col, snow, smoothstep(0.08, 0.6, cover) * thick);
  rough = mix(rough, mix(0.9, 0.45, crust), cover);
  bump = mix(bump, relief, cover);
  return col;
}
`
