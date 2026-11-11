// What every material in the scene shares: the sun and its cascaded shadow, light from the sky, cloud shadow, haze and
// ground mist, snow, rime and wind. Added to three's built-in materials by patching their shaders.
import {
  Color, MeshDepthMaterial, ShaderChunk, Vector2, Vector3, Vector4, type IUniform, type Material, type Texture,
} from 'three'
import { GLSL_NOISE } from './noise.ts'

export const U = {
  uTime: { value: 0 },
  uSway: { value: 0.3 },
  uWindDir: { value: new Vector2(1, 0) },
  // How far the wind has carried things since the start, so gusts travel downwind.
  uWindAt: { value: new Vector2() },
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
  ambient?: number           // share of the sky's light this material takes (inside a canopy takes less)
  noHaze?: boolean
}

export const SHARED = /* glsl */ `
uniform float uTime;
uniform float uSway;
uniform vec2 uWindDir;
uniform vec2 uWindAt;
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
float rimeAt(float y) {
  return mix(mix(uRime.z, uRime.y, smoothstep(2.0, 3.0, y)), uRime.x, smoothstep(3.6, 4.7, y));
}
// A gust front passing over a place: 0 calm, 1 in the gust.
float gustAt(vec2 xz) {
  return textureLod(uNoise, (xz - uWindAt) * 0.03, 0.0).b;
}
`

// Shared by the sky's picture of the clouds and the shadow they throw on the land.
export const CLOUD_GLSL = /* glsl */ `
float cloudField(vec2 p) {
  vec2 q = p * 0.00042 + uCloud.zw;
  return texture2D(uNoise, q).b * 0.64 + texture2D(uNoise, q * 2.63 + 0.31).b * 0.36;
}
float cloudCover(float field) {
  return smoothstep(0.86 - uCloud.y * 0.62, 1.04 - uCloud.y * 0.62, field);
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
  float ea = exp(-falloff * max(ya - base, -1.5)), eb = exp(-falloff * max(yb - base, -1.5));
  float dy = yb - ya;
  return density * t * (abs(dy) > 1e-3 ? (ea - eb) / (falloff * dy) : ea);
}
float hazeAmount(float ya, float yb, float t, vec2 xz) {
  float air = airBetween(uHaze.x, uHaze.y, 0.0, ya, yb, t);
  if (uMist.x > 1e-5) {
    float wisp = 1.0 - uMist.w + uMist.w * 1.7 * texture2D(uNoise, xz * 0.006 + uCloud.zw * 9.0).b;
    air += airBetween(uMist.x * wisp, uMist.y, uMist.z, ya, yb, min(t, 400.0));
  }
  return 1.0 - exp(-air);
}
`

export const FRAG_LIB = /* glsl */ `
${CLOUD_GLSL}
${HAZE_GLSL}
float cloudShade(vec3 p) {
  if (uCloud.x < 0.002) return 1.0;
  vec2 q = p.xz + uSunDir.xz / max(uSunDir.y, 0.14) * 260.0;
  return 1.0 - uCloud.x * cloudCover(cloudField(q)) * smoothstep(uSunlit, uSunlit * 1.8 + 1.0, length(p.xz));
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
    float sunVis = cloudShade( vWorld );
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      if ( receiveShadow ) sunVis *= countyShadow();
    #endif
    vec3 sunLit = directLight.color * sunVis;
    directLight.color = sunLit;
    RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    #ifdef COUNTY_TRANSLUCENT
      float backLit = saturate( dot( - geometryNormal, directLight.direction ) );
      reflectedLight.directDiffuse += sunLit * backLit * COUNTY_TRANSLUCENT * material.diffuseContribution * vec3( 1.0, 1.16, 0.5 ) * RECIPROCAL_PI;
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
      radiance += skyRadiance( wR, material.roughness ) * COUNTY_AMBIENT;
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
    gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeTint( hv / max( hd, 1e-4 ) ), hazeAmount( cameraPosition.y, vWorld.y, hd, vWorld.xz ) );
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
  mat.defines = { ...(mat.defines ?? {}), COUNTY_AMBIENT: (p.ambient ?? 1).toFixed(3), ...(p.defines ?? {}) }
  if (p.translucent) mat.defines.COUNTY_TRANSLUCENT = p.translucent.toFixed(3)
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U, p.uniforms ?? {})
    shader.vertexShader = patchVertex(shader.vertexShader, p, true)
    let fs = shader.fragmentShader
    fs = fs.replace('#include <common>', `#include <common>\n${SHARED}\n${FRAG_LIB}\n${p.fragmentHead ?? ''}`)
    fs = fs.replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>\n${SHADOW_LIB}`)
    if (p.fragmentColor) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${p.fragmentColor}`)
    if (p.fragmentRoughness) fs = fs.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${p.fragmentRoughness}`)
    if (p.fragmentNormal) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${p.fragmentNormal}`)
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
export const SNOW_RIME_TREE = snowRime('uSnow * 0.5', '0.35')

function snowRime(amount: string, rimeShare: string): string {
  return /* glsl */ `
  {
    float snowAmt = ${amount};
    float up = clamp( vWNormal.y, 0.0, 1.0 );
    if ( snowAmt > 0.001 ) {
      vec4 sn = texture2D( uNoise, vWorld.xz * 0.011 );
      float lie = sn.b * 0.62 + texture2D( uNoise, vWorld.xz * 0.07 ).a * 0.2 + up * 0.18;
      float cover = smoothstep( 1.02 - snowAmt * 1.25, 1.2 - snowAmt * 1.25, lie ) * smoothstep( 0.2, 0.55, up );
      vec3 snow = vec3( 0.84, 0.88, 0.93 ) * ( 0.94 + 0.08 * sn.a );
      diffuseColor.rgb = mix( diffuseColor.rgb * ( 1.0 - 0.3 * smoothstep( 0.0, 0.3, cover ) ), snow, smoothstep( 0.12, 0.7, cover ) );
    }
    if ( uRime.x + uRime.y + uRime.z > 0.001 ) {
      float rimeHere = ${rimeShare} * rimeAt( vWorld.y ) * smoothstep( 0.0, 0.5, up ) * ( 1.0 - 0.45 * clamp( dot( vWNormal, uSunDir ) * 2.0 - 0.6, 0.0, 1.0 ) );
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
