// Shared uniforms and a small helper for adding to three's built-in materials.
import { Color, Vector2, type IUniform, type Material } from 'three'
import { GLSL_NOISE } from './noise.ts'

export const U = {
  uTime: { value: 0 },
  uSway: { value: 0.3 },
  uWindDir: { value: new Vector2(1, 0) },
  uSnow: { value: 0 },
  uRime: { value: 0 },
  uWet: { value: 0 },
  uGrass: { value: new Color('#6f8a45') },
  uGold: { value: 0 },
  uCloud: { value: 0 },
  uSky: { value: new Color('#bcd3e0') },
}

export interface Patch {
  uniforms?: Record<string, IUniform>
  vertexHead?: string
  vertexBegin?: string       // after begin_vertex: edit `transformed`
  vertexNormal?: string      // after beginnormal_vertex: edit `objectNormal`
  vertexProject?: string     // after project_vertex: `vWorld` is set; may edit gl_Position
  fragmentHead?: string
  fragmentColor?: string     // after color_fragment: edit `diffuseColor`
  fragmentRoughness?: string // after roughnessmap_fragment: edit `roughnessFactor`
  fragmentEmissive?: string  // after emissivemap_fragment: edit `totalEmissiveRadiance`
  fragmentEnd?: string       // after fog: edit `gl_FragColor`
}

const SHARED_HEAD = `
uniform float uTime;
uniform float uSway;
uniform vec2 uWindDir;
uniform float uSnow;
uniform float uRime;
uniform float uWet;
uniform vec3 uGrass;
uniform float uGold;
uniform float uCloud;
uniform vec3 uSky;
varying vec3 vWorld;
varying vec3 vWNormal;
${GLSL_NOISE}
`

let serial = 0

export function patch<M extends Material>(mat: M, p: Patch): M {
  const key = `patch-${serial++}`
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U, p.uniforms ?? {})
    let vs = shader.vertexShader
    vs = vs.replace('#include <common>', `#include <common>\n${SHARED_HEAD}\n${p.vertexHead ?? ''}`)
    if (p.vertexBegin) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${p.vertexBegin}`)
    if (p.vertexNormal) vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${p.vertexNormal}`)
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vWorld = (modelMatrix * wp).xyz;
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wn = mat3(instanceMatrix) * wn;
        #endif
        vWNormal = normalize(mat3(modelMatrix) * wn);
      }
      ${p.vertexProject ?? ''}`)
    shader.vertexShader = vs
    let fs = shader.fragmentShader
    fs = fs.replace('#include <common>', `#include <common>\n${SHARED_HEAD}\n${p.fragmentHead ?? ''}`)
    if (p.fragmentColor) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${p.fragmentColor}`)
    if (p.fragmentRoughness) fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${p.fragmentRoughness}`)
    if (p.fragmentEmissive) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${p.fragmentEmissive}`)
    if (p.fragmentEnd) fs = fs.replace('#include <fog_fragment>', `#include <fog_fragment>\n${p.fragmentEnd}`)
    shader.fragmentShader = fs
  }
  mat.customProgramCacheKey = () => key
  return mat
}

// Snow settles on what faces up, rime frosts it; both in patches.
export const SNOW_RIME = snowRime('uSnow')
export const SNOW_RIME_TREE = snowRime('uSnow * 0.45')

function snowRime(amount: string): string {
  return /* glsl */ `
  {
    float snowAmt = ${amount};
    float up = clamp(vWNormal.y, 0.0, 1.0);
    float n = fbm(vWorld.xz * 0.3) * 0.8 + vnoise(vWorld.xz * 3.0) * 0.2;
    float lie = n * 0.7 + up * 0.3;
    float cover = smoothstep(1.0 - snowAmt, 1.03 - snowAmt, lie) * step(0.001, snowAmt) * smoothstep(0.25, 0.6, up);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.95), cover);
    float rime = uRime * smoothstep(0.2, 0.9, up) * (0.55 + 0.45 * vnoise(vWorld.xz * 9.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.89, 0.93), rime * 0.75);
  }
`
}

// Sway a plant-like vertex by its height above its own base. `amount` is a GLSL expression.
export function sway(amount: string): string {
  return /* glsl */ `
  {
    float h = max(0.0, position.y);
    vec3 base = vec3(0.0);
    #ifdef USE_INSTANCING
      base = instanceMatrix[3].xyz;
    #endif
    float ph = dot(base.xz, vec2(0.37, 0.23));
    float gust = 0.55 + 0.45 * sin(uTime * 0.6 - dot(base.xz, uWindDir) * 0.12);
    float s = uSway * gust * (sin(uTime * 2.1 + ph) * 0.5 + sin(uTime * 3.7 + ph * 1.7) * 0.2 + 0.55);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld + vec3(uWindDir.x, 0.0, uWindDir.y) * s * h * (${amount}), 1.0);
  }
`
}
