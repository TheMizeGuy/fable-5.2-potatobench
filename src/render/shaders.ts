// What every material in the scene shares: the sun and its cascaded shadow, light from the sky, cloud shadow, haze and
// ground mist, snow, rime and wind. Added to three's built-in materials by patching their shaders.
import {
  Color, MeshDepthMaterial, ShaderChunk, Vector2, Vector3, Vector4, type IUniform, type Material, type Texture,
} from 'three'
import { FARM_CENTER, REACH } from './layout.ts'
import { GLSL_NOISE } from './noise.ts'
import { KV } from './scale.ts'

export const U = {
  uTime: { value: 0 },
  uSway: { value: 0.3 },
  uWindDir: { value: new Vector2(1, 0) },
  // How far the wind has carried things since the start, so gusts travel downwind.
  uWindAt: { value: new Vector2() },
  // Gusts: xy the heading their fronts travel on (it turns slowly, whatever the day's wind does), z how far they have
  // run along it, w how hard it blows.
  uGust: { value: new Vector4(1, 0, 0, 0.3) },
  uSnow: { value: 0 },
  // Rime on the ridge, the mid slope and the bottom land: cold air settles, so the low ground frosts first.
  uRime: { value: new Vector3() },
  uWet: { value: 0 },
  uGrass: { value: new Color('#6f8a45') },
  uGold: { value: 0 },
  uLeaf: { value: 1 },
  uSunDir: { value: new Vector3(0, 1, 0) },
  uSunCol: { value: new Color(1, 1, 1) },
  // x: how dark a cloud's shadow is, y: how much of the sky is cloud, zw: where the clouds have drifted to.
  uCloud: { value: new Vector4() },
  uNoise: { value: null as Texture | null },
  uSkyTex: { value: null as Texture | null },
  // x: density of the air at the brook, y: how fast it thins with height.
  uHaze: { value: new Vector2(0.0006, 0.012) },
  uHazeSun: { value: new Color('#f3c98b') },
  uHazeAway: { value: new Color('#bcd3e0') },
  // x: density of the ground mist, y: how fast it thins with height, z: the height it lies from, w: how patchy it is.
  uMist: { value: new Vector4(0, 0.9, 0, 0.6) },
  uMistCol: { value: new Color('#e6e9e6') },
  // Shadows fade out between these distances from the camera.
  uShadowFade: { value: new Vector2(300, 420) },
  // Day of the year, 0..365, for the neighbours' crops.
  uDay: { value: 196 },
  // Within this distance of the farm no cloud shadow falls (the opening shot keeps the farm in the sun).
  uSunlit: { value: 0 },
  // 0 by day, 1 when the sun is well down and the light is the moon's.
  uNight: { value: 0 },
}

export interface Patch {
  key?: string              // materials given the same key share one compiled program
  uniforms?: Record<string, IUniform>
  defines?: Record<string, string | number>
  vertexHead?: string
  vertexNormal?: string      // after beginnormal_vertex: edit `objectNormal`
  vertexBegin?: string       // after begin_vertex: edit `transformed`
  vertexWorld?: string       // edit `cWorld`, the position in the world, before it is projected (wind)
  fragmentHead?: string
  fragmentColor?: string     // after color_fragment: edit `diffuseColor`
  fragmentRoughness?: string // after metalnessmap_fragment: edit `roughnessFactor`, `metalnessFactor`
  fragmentNormal?: string    // after normal_fragment_maps: edit `normal` (view space)
  fragmentEmissive?: string  // after emissivemap_fragment: edit `totalEmissiveRadiance`
  fragmentEnd?: string       // after the haze: edit `gl_FragColor`
  translucent?: number       // share of the sun that comes through from behind (leaves)
  through?: [number, number, number]   // the colour light takes coming through (a leaf's yellow-green unless given; a petal's is near white)
  ambient?: number           // share of the sky's light this material takes (inside a canopy takes less)
  rim?: number               // how much a low sun behind it lights its edge (0.3 unless given)
  shine?: number             // share of the sky's reflection it shows (a leaf's bloom of fine hair shows little)
  blade?: boolean            // grass and grain: lit as if every blade faced up, and aglow when the sun is behind it
  noHaze?: boolean
}

export const SHARED = /* glsl */ `
uniform float uTime;
uniform float uSway;
uniform vec2 uWindDir;
uniform vec2 uWindAt;
uniform vec4 uGust;
uniform float uNight;
uniform float uSnow;
uniform vec3 uRime;
uniform float uWet;
uniform vec3 uGrass;
uniform float uGold;
uniform float uLeaf;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec4 uCloud;
uniform sampler2D uNoise;
uniform sampler2D uSkyTex;
uniform vec2 uHaze;
uniform vec3 uHazeSun;
uniform vec3 uHazeAway;
uniform vec4 uMist;
uniform vec3 uMistCol;
uniform vec2 uShadowFade;
uniform float uDay;
uniform float uSunlit;
varying vec3 vWorld;
varying vec3 vWNormal;
${GLSL_NOISE}
float rimeAt(float yTrue) {
  float y = yTrue / ${KV.toFixed(3)};
  return mix(mix(uRime.z, uRime.y, smoothstep(2.0, 3.0, y)), uRime.x, smoothstep(3.6, 4.7, y));
}
// A gust front passing over a place: 0 calm, 1 in the gust. Fronts lie across the wind and run down it, broad enough
// to be followed over a field from the playing height.
float gustAt(vec2 xz) {
  vec2 q = vec2(dot(xz, uGust.xy) - uGust.z, dot(xz, vec2(-uGust.y, uGust.x)));
  // A front is some 70 m from the next along the wind and a couple of hundred long: three or so are on a field at once.
  float broad = textureLod(uNoise, q * vec2(0.0046, 0.0017), 0.0).b;
  float fine = textureLod(uNoise, q * vec2(0.021, 0.0093) + 0.37, 0.0).b;
  return smoothstep(0.36, 0.74, broad * 0.72 + fine * 0.28);
}
`

// The day's haze is given as a density (env.haze); a metre of air at the brook holds this share of it.
export const HAZE_PER_M = 0.3
// How fast the haze thins with height, per metre: it lies in the lowest kilometre, so a camera that climbs to see the
// county still looks through it.
export const HAZE_FALL = 0.0011
// The scale of the cloud field: one turn of its pattern, in metres. A cloud is about a third of that across, a field
// or two wide, so its shadow is seen to cross them.
export const CLOUD_TURN = 1150

// Shared by the sky's picture of the clouds and the shadow they throw on the land.
export const CLOUD_GLSL = /* glsl */ `
// How high the bases of the cumulus stand, and how tall the tallest is.
const float CLOUD_H = 780.0;
const float CLOUD_T = 520.0;
float cloudField(vec2 p) {
  vec2 q = p * ${(1 / CLOUD_TURN).toFixed(6)} + uCloud.zw;
  float crowd = texture2D(uNoise, q * 0.19 + 0.17).b;
  float body = texture2D(uNoise, q).b;
  float lump = texture2D(uNoise, q * 2.7 + vec2(0.43, 0.11) + uCloud.zw * 0.6).b;
  return clamp((crowd * 0.34 + body * 0.42 + lump * 0.24 - 0.5) * 1.75 + 0.5, 0.0, 1.0);
}
// Where in the field a cloud begins, for the share of the sky that is cloud; a closed sky has no gaps.
float cloudEdge() {
  return 0.92 - uCloud.y * 0.74 - smoothstep(0.9, 1.0, uCloud.y);
}
float cloudCover(float field) {
  float edge = cloudEdge();
  return smoothstep(edge, edge + 0.15, field);
}
`

export const HAZE_GLSL = /* glsl */ `
// The colour of the air looking along dir: warm toward the sun, cool away from it.
vec3 hazeTint(vec3 dir) {
  vec2 a = dir.xz / max(length(dir.xz), 1e-4), b = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
  float toSun = max(dot(a, b), 0.0);
  return mix(uHazeAway, uHazeSun, toSun * toSun * toSun * (1.0 - 0.5 * smoothstep(0.0, 0.5, dir.y)));
}
// Air whose density falls off with height, integrated along the sight line from height ya to height yb over length t.
float airBetween(float density, float falloff, float base, float ya, float yb, float t) {
  float ea = exp(-falloff * max(ya - base, -0.5)), eb = exp(-falloff * max(yb - base, -0.5));
  float dy = yb - ya;
  return density * t * (abs(dy) > 1e-3 ? (ea - eb) / (falloff * dy) : ea);
}
// mistShare: how much of the air in the way is ground mist, which has its own colour.
float hazeAmount(float ya, float yb, float t, vec2 xz, out float mistShare) {
  mistShare = 0.0;
  // A fair day's haze belongs to distance: what is within a field's length stands in clear air, and every hundred
  // metres beyond takes a little more of the sky's colour, so the far field, the woods on the ridge and the country
  // behind them each stand a step paler than the last.
  float air = airBetween(uHaze.x * ${HAZE_PER_M.toFixed(3)}, uHaze.y, 0.0, ya, yb, t) * mix(smoothstep(50.0, 420.0, t), 1.0, smoothstep(0.0014, 0.003, uHaze.x));
  if (uMist.x > 1e-5) {
    // Mist lies in banks with clear air between, drifting; and however deep, what stands in it still shows through.
    float bank = texture2D(uNoise, xz * 0.0021 + uCloud.zw * 6.0).b * 0.65 + texture2D(uNoise, xz * 0.011 - uCloud.zw * 11.0).b * 0.35;
    float wisp = 1.0 - uMist.w + uMist.w * 2.6 * smoothstep(0.32, 0.78, bank);
    float low = min(airBetween(uMist.x * wisp, uMist.y, uMist.z, ya, yb, min(t, 1500.0)), 0.9);
    mistShare = low / max(air + low, 1e-5);
    air += low;
  }
  return 1.0 - exp(-air);
}
// The land that is drawn ends: well before it does, it has gone into the air, so no edge is ever seen.
float landsEnd(vec2 xz) {
  return smoothstep(${(REACH * 0.56).toFixed(1)}, ${(REACH * 0.93).toFixed(1)}, distance(xz, vec2(${FARM_CENTER.x.toFixed(1)}, ${FARM_CENTER.z.toFixed(1)})));
}
// Mist is lit from within when the sun is beyond it.
vec3 mistTint(vec3 dir) {
  float toSun = max(dot(dir, uSunDir), 0.0);
  return uMistCol * (1.0 + 0.9 * toSun * toSun * toSun) + uSunCol * (0.02 * pow(toSun, 8.0));
}
`

export const FRAG_LIB = /* glsl */ `
${CLOUD_GLSL}
${HAZE_GLSL}
float cloudShade(vec3 p) {
  if (uCloud.x < 0.002) return 1.0;
  vec2 q = p.xz + uSunDir.xz / max(uSunDir.y, 0.12) * CLOUD_H;
  return 1.0 - uCloud.x * cloudCover(cloudField(q)) * smoothstep(uSunlit, uSunlit * 1.8 + 1.0, length(p.xz));
}
// A cut-out texture loses its cover as it shrinks on screen; this gives it back. size: the texture's width in texels.
float coverGain(vec2 uv, float size) {
  vec2 dx = dFdx(uv * size), dy = dFdy(uv * size);
  return 1.0 + 0.45 * max(0.5 * log2(max(dot(dx, dx), dot(dy, dy)) + 1e-8), 0.0);
}
vec2 skyUv(vec3 d) {
  return vec2(atan(d.z, d.x) * 0.15915494 + 0.5, acos(clamp(d.y, -1.0, 1.0)) * 0.31830989);
}
// Light arriving from the whole sky on a surface facing n, and the sky seen in a mirror along r.
vec3 skyIrradiance(vec3 n) {
  return 3.14159265 * textureLod(uSkyTex, skyUv(n), 5.0).rgb;
}
vec3 skyRadiance(vec3 r, float roughness) {
  return textureLod(uSkyTex, skyUv(r), roughness * 5.5).rgb;
}
`

const SHADOW_LIB = /* glsl */ `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
float cascadeEdge(vec4 c) {
  vec3 p = c.xyz / c.w;
  vec2 e = min(p.xy, 1.0 - p.xy);
  return min(min(e.x, e.y), 1.0 - p.z);
}
// The sun's shadow from the finest cascade that covers this point, blended into the next at its edge.
float countyShadow() {
  float fade = 1.0 - smoothstep(uShadowFade.x, uShadowFade.y, length(vWorld - cameraPosition));
  if (fade <= 0.0) return 1.0;
  float sh = 1.0;
  float w0 = smoothstep(0.0, 0.04, cascadeEdge(vDirectionalShadowCoord[0]));
  #if NUM_DIR_LIGHT_SHADOWS > 1
    if (w0 < 1.0) {
      float w1 = smoothstep(0.0, 0.04, cascadeEdge(vDirectionalShadowCoord[1]));
      #if NUM_DIR_LIGHT_SHADOWS > 2
        if (w1 < 1.0) {
          float w2 = smoothstep(0.0, 0.04, cascadeEdge(vDirectionalShadowCoord[2]));
          if (w2 > 0.0) sh = mix(1.0, getShadow(directionalShadowMap[2], directionalLightShadows[2].shadowMapSize, directionalLightShadows[2].shadowIntensity, directionalLightShadows[2].shadowBias, directionalLightShadows[2].shadowRadius, vDirectionalShadowCoord[2]), w2);
        }
      #endif
      if (w1 > 0.0) sh = mix(sh, getShadow(directionalShadowMap[1], directionalLightShadows[1].shadowMapSize, directionalLightShadows[1].shadowIntensity, directionalLightShadows[1].shadowBias, directionalLightShadows[1].shadowRadius, vDirectionalShadowCoord[1]), w1);
    }
  #endif
  if (w0 > 0.0) sh = mix(sh, getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]), w0);
  return mix(1.0, sh, fade);
}
#endif
`

// three lights each directional light by itself. Here the first is the sun and the others only carry its further
// shadow cascades, so the block that loops over them is replaced with one that lights once.
const SUN_BLOCK = /* glsl */ `
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
  {
    DirectionalLight directionalLight = directionalLights[ 0 ];
    getDirectionalLightInfo( directionalLight, directLight );
    float cloudVis = cloudShade( vWorld ), shade = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      if ( receiveShadow ) shade = countyShadow();
    #endif
    vec3 sunFull = directLight.color * cloudVis;
    directLight.color = sunFull * shade;
    RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      {
        // A low sun behind a thing catches its edge: the fuzz of a tree, a crop, a shoulder. Level ground takes little.
        float rimEdge = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
        float rimSun = saturate( dot( - geometryViewDir, directLight.direction ) * 1.5 - 0.3 );
        float rimSide = 1.0 - 0.8 * saturate( vWNormal.y );
        reflectedLight.directDiffuse += directLight.color * ( COUNTY_RIM * rimEdge * rimEdge * rimEdge * rimSun * rimSide ) * material.diffuseContribution;
      }
    #ifdef COUNTY_TRANSLUCENT
      // Light through a leaf: what its neighbours shade still glows a little, as light scattered about in the canopy.
      #ifdef COUNTY_BLADE
        float backLit = 0.12 + 0.88 * pow( saturate( dot( - geometryViewDir, directLight.direction ) ), 2.0 );
      #else
        float backLit = saturate( dot( - geometryNormal, directLight.direction ) );
      #endif
      reflectedLight.directDiffuse += sunFull * ( 0.3 + 0.7 * shade ) * backLit * COUNTY_TRANSLUCENT * material.diffuseContribution * COUNTY_THROUGH * RECIPROCAL_PI;
    #endif
  }
#endif
`

const SKY_LIGHT = /* glsl */ `
#if defined( RE_IndirectDiffuse )
  {
    vec3 wN = inverseTransformDirection( geometryNormal, viewMatrix );
    iblIrradiance += skyIrradiance( wN ) * COUNTY_AMBIENT;
    #if defined( RE_IndirectSpecular )
      vec3 wR = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
      radiance += skyRadiance( wR, material.roughness ) * COUNTY_AMBIENT * COUNTY_SHINE;
    #endif
  }
#endif
`

const LIGHTS = (() => {
  const chunk = ShaderChunk.lights_fragment_begin
  const a = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )')
  const b = chunk.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )')
  if (a < 0 || b < a) throw new Error('three: the lighting chunk is not laid out as expected')
  return chunk.slice(0, a) + SUN_BLOCK + chunk.slice(b) + SKY_LIGHT
})()

export const HAZE = /* glsl */ `
  {
    vec3 hv = vWorld - cameraPosition;
    float hd = length( hv );
    float hm;
    float ha = hazeAmount( cameraPosition.y, vWorld.y, hd, vWorld.xz, hm );
    float gone = landsEnd( vWorld.xz );
    ha = ha + ( 1.0 - ha ) * gone;
    hm *= 1.0 - gone;
    vec3 hdir = hv / max( hd, 1e-4 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( hazeTint( hdir ), mistTint( hdir ), hm ), ha );
  }
`

function project(world: string | undefined): string {
  return /* glsl */ `
  vec4 cWorld = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    cWorld = instanceMatrix * cWorld;
  #endif
  cWorld = modelMatrix * cWorld;
  ${world ?? ''}
  vWorld = cWorld.xyz;
  vec4 mvPosition = viewMatrix * cWorld;
  gl_Position = projectionMatrix * mvPosition;
`
}

let serial = 0

function patchVertex(vs: string, p: Patch, lit: boolean): string {
  vs = vs.replace('#include <common>', `#include <common>\n${SHARED}\n${p.vertexHead ?? ''}`)
  if (lit) {
    if (p.vertexNormal) vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${p.vertexNormal}`)
    vs = vs.replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWNormal = inverseTransformDirection( transformedNormal, viewMatrix );')
  }
  if (p.vertexBegin) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${p.vertexBegin}`)
  vs = vs.replace('#include <project_vertex>', project(p.vertexWorld))
  return vs.replace('#include <worldpos_vertex>', 'vec4 worldPosition = cWorld;')
}

export function patch<M extends Material>(mat: M, p: Patch = {}): M {
  const key = p.key ?? `county-${serial++}`
  mat.defines = { ...(mat.defines ?? {}), COUNTY_AMBIENT: (p.ambient ?? 1).toFixed(3), COUNTY_SHINE: (p.shine ?? 1).toFixed(3), COUNTY_RIM: (p.rim ?? 0.3).toFixed(3), ...(p.defines ?? {}) }
  if (p.translucent) mat.defines.COUNTY_TRANSLUCENT = p.translucent.toFixed(3)
  const through = p.through ?? [1, 1.16, 0.5]
  mat.defines.COUNTY_THROUGH = `vec3( ${through.map(v => v.toFixed(3)).join(', ')} )`
  if (p.blade) mat.defines.COUNTY_BLADE = 1
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U, p.uniforms ?? {})
    shader.vertexShader = patchVertex(shader.vertexShader, p, true)
    let fs = shader.fragmentShader
    fs = fs.replace('#include <common>', `#include <common>\n${SHARED}\n${FRAG_LIB}\n${p.fragmentHead ?? ''}`)
    fs = fs.replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>\n${SHADOW_LIB}`)
    if (p.fragmentColor) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${p.fragmentColor}`)
    if (p.fragmentRoughness) fs = fs.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${p.fragmentRoughness}`)
    // A blade is seen from both sides but lit from above on both: undo three's flip of the normal on back faces.
    const blade = p.blade ? '#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif\n' : ''
    if (p.fragmentNormal || blade) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${blade}${p.fragmentNormal ?? ''}`)
    if (p.fragmentEmissive) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${p.fragmentEmissive}`)
    fs = fs.replace('#include <lights_fragment_begin>', LIGHTS)
    fs = fs.replace('#include <fog_fragment>', `${p.noHaze ? '' : HAZE}\n${p.fragmentEnd ?? ''}`)
    shader.fragmentShader = fs
  }
  mat.customProgramCacheKey = () => key
  return mat
}

// The same shape in the sun's shadow pass: anything a patch moves in the vertex shader has to move there too.
export function depthFor(p: Patch): MeshDepthMaterial {
  const mat = new MeshDepthMaterial()
  const key = p.key ? `${p.key}-depth` : `county-depth-${serial++}`
  if (p.defines) mat.defines = { ...p.defines }
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U, p.uniforms ?? {})
    shader.vertexShader = patchVertex(shader.vertexShader, p, false)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${SHARED}`)
  }
  mat.customProgramCacheKey = () => key
  return mat
}

// Snow settles on what faces up, deepest where it drifts and last to go in the hollows; rime frosts what the night chilled.
export const SNOW_RIME = snowRime('uSnow', '1.0')
export const SNOW_RIME_TREE = snowRime('uSnow * 0.36', '0.35')
// The same, with the rime of one place (a field's own frost last night) instead of the rime by height on the slope.
export function snowRimeAt(amount: string, rime: string): string {
  return snowRime(amount, '1.0', rime)
}

function snowRime(amount: string, rimeShare: string, rime = 'rimeAt( vWorld.y )'): string {
  return /* glsl */ `
  {
    float snowAmt = ${amount};
    float up = clamp( vWNormal.y, 0.0, 1.0 );
    #ifdef COUNTY_BLADE
      up = max( up, 0.75 );
    #endif
    if ( snowAmt > 0.001 ) {
      vec4 sn = texture2D( uNoise, vWorld.xz * 0.011 );
      float lie = sn.b * 0.56 + texture2D( uNoise, vWorld.xz * 0.07 ).a * 0.2 + texture2D( uNoise, vWorld.xz * 0.37 ).a * 0.1 + texture2D( uNoise, vWorld.xz * 1.6 ).a * 0.05 + up * 0.18;
      float cover = smoothstep( 1.0 - snowAmt * 1.25, 1.3 - snowAmt * 1.25, lie ) * smoothstep( 0.2, 0.55, up );
      vec3 snow = vec3( 0.84, 0.88, 0.93 ) * ( 0.94 + 0.08 * sn.a );
      diffuseColor.rgb = mix( diffuseColor.rgb * ( 1.0 - 0.3 * smoothstep( 0.0, 0.3, cover ) ), snow, smoothstep( 0.12, 0.7, cover ) );
    }
    if ( uRime.x + uRime.y + uRime.z > 0.001 ) {
      float rimeHere = ${rimeShare} * ${rime} * smoothstep( 0.0, 0.5, up );
      #ifndef COUNTY_BLADE
        rimeHere *= 1.0 - 0.45 * clamp( dot( vWNormal, uSunDir ) * 2.0 - 0.6, 0.0, 1.0 );
      #endif
      // Where the sun has reached it the rime is already going; it stays white in every shadow the low sun throws.
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        rimeHere *= mix( 1.0, 0.66, countyShadow() * ( 1.0 - uNight ) );
      #endif
      float crystals = texture2D( uNoise, vWorld.xz * 0.21 ).a * 0.55 + texture2D( uNoise, vWorld.xz * 0.045 ).b * 0.45;
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.74, 0.83, 0.9 ), rimeHere * ( 0.7 + 0.3 * smoothstep( 0.3, 0.7, crystals ) ) );
    }
  }
`
}

// Bend a plant-like thing downwind by `amount` (a GLSL expression) times how high the vertex stands above `base`.
export function sway(base: string, height: string, amount: string): string {
  return /* glsl */ `
  {
    vec2 at = ${base};
    float gust = gustAt( at );
    float ph = dot( at, vec2( 0.37, 0.23 ) );
    float lean = uSway * ( 0.35 + 1.1 * gust ) * ( 0.7 + 0.3 * sin( uTime * 2.3 + ph ) + 0.14 * sin( uTime * 5.1 + ph * 1.7 ) );
    cWorld.xz += uWindDir * lean * ( ${height} ) * ( ${amount} );
  }
`
}

export function linear(hex: string): string {
  const c = new Color(hex)
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`
}
