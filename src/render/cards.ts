// Far trees as cards. Each kind of tree is drawn once, from three heights of eye, into an atlas that keeps not its
// colour but what its own material colours it from (where on the tree, which way it faces, its shade, leaf or wood).
// A card then stands where the tree stands, turned to whoever looks (the camera, or the sun in the shadow pass), and
// is coloured and lit by the same code as the whole tree: so it turns with the season and sits in the day's light.
import {
  BufferAttribute, BufferGeometry, DoubleSide, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Mesh, OrthographicCamera, RGBAFormat, Scene,
  ShaderMaterial, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three'
import type { Patch } from './shaders.ts'

// A cell of the atlas in pixels and its margin; the half width and half height of what it holds, in tree heights, about
// a point this far up the tree; and the heights of eye, in radians above the level.
export const CARD = { cols: 7, rows: 3, w: 192, h: 240, pad: 10, halfW: [0.34, 0.52, 0.42, 0.7], halfH: 0.66, centre: 0.56, elev: [0.17, 0.56, 0.96] }
const AW = CARD.cols * CARD.w, AH = CARD.rows * CARD.h
// How many columns on from a hardwood in leaf the same tree stands bare.
export const BARE = 3

export interface CardCell { geo: BufferGeometry; conifer: boolean; bare: boolean }
export const cardMaps: Record<'uCard0' | 'uCard1' | 'uCard2', { value: Texture | null }> = { uCard0: { value: null }, uCard1: { value: null }, uCard2: { value: null } }

// Three maps, each a value times its cover so that it can be smoothed: where on the tree and cover; which way it faces
// (as the eye that drew it saw it) and its shade; leaf or wood (a conifer: its depth of shade, and trunk).
export function bakeCards(renderer: WebGLRenderer, cells: CardCell[]): WebGLRenderTarget[] {
  const targets = [0, 1, 2].map(() => new WebGLRenderTarget(AW, AH, {
    type: HalfFloatType, format: RGBAFormat, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, generateMipmaps: true, depthBuffer: true,
  }))
  const make = (conifer: boolean) => new ShaderMaterial({
    uniforms: { uMode: { value: 0 }, uBare: { value: 0 } },
    defines: conifer ? {} : { HARD: 1 },
    vertexColors: conifer,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      #ifdef HARD
        attribute float aShade; attribute float aPart; attribute vec3 aRound;
      #endif
      varying vec3 vObj; varying vec3 vN; varying vec3 vInfo;
      void main() {
        vObj = position;
        #ifdef HARD
          vN = normalMatrix * aRound; vInfo = vec3(aShade, aPart, 0.0);
        #else
          vN = normalMatrix * normal; vInfo = vec3(color.g, color.r, color.b);
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uMode; uniform float uBare;
      varying vec3 vObj; varying vec3 vN; varying vec3 vInfo;
      void main() {
        #ifdef HARD
          if (uBare > 0.5 && vInfo.y > 0.5) discard;
        #endif
        vec3 n = normalize(vN);
        if (n.z < 0.0) n = -n;
        if (uMode < 0.5) gl_FragColor = vec4(vObj, 1.0);
        else if (uMode < 1.5) gl_FragColor = vec4(n, vInfo.x);
        else gl_FragColor = vec4(vInfo.y, vInfo.z, 0.0, 1.0);
      }`,
  })
  const mats = { con: make(true), hard: make(false) }
  const scene = new Scene(), mesh = new Mesh(cells[0].geo, mats.con)
  mesh.frustumCulled = false
  scene.add(mesh)
  const cam = new OrthographicCamera(-1, 1, CARD.halfH, -CARD.halfH, 0.1, 12)
  const was = renderer.getRenderTarget(), auto = renderer.autoClear
  renderer.autoClear = true
  renderer.setClearColor(0x000000, 0)
  for (let mode = 0; mode < 3; mode++) {
    const rt = targets[mode]
    rt.scissorTest = true
    renderer.setRenderTarget(rt)
    cells.forEach((cell, col) => {
      mesh.geometry = cell.geo
      mesh.material = cell.conifer ? mats.con : mats.hard
      mesh.material.uniforms.uMode.value = mode
      mesh.material.uniforms.uBare.value = cell.bare ? 1 : 0
      // each kind in a cell as wide as it is: a spruce's card is half the width of a maple's
      const half = CARD.halfW[col === 0 ? 0 : ((col - 1) % 3) + 1]
      cam.left = -half
      cam.right = half
      cam.updateProjectionMatrix()
      CARD.elev.forEach((e, row) => {
        const x = col * CARD.w + CARD.pad, y = row * CARD.h + CARD.pad, w = CARD.w - 2 * CARD.pad, h = CARD.h - 2 * CARD.pad
        rt.viewport.set(x, y, w, h)
        rt.scissor.set(x, y, w, h)
        renderer.setRenderTarget(rt)
        cam.position.set(0, CARD.centre + Math.sin(e) * 5, Math.cos(e) * 5)
        cam.lookAt(0, CARD.centre, 0)
        cam.updateMatrixWorld()
        renderer.render(scene, cam)
      })
    })
    rt.scissorTest = false
    rt.viewport.set(0, 0, AW, AH)
    rt.scissor.set(0, 0, AW, AH)
  }
  renderer.setRenderTarget(was)
  renderer.autoClear = auto
  renderer.setClearColor(0x000000, 1)
  mats.con.dispose()
  mats.hard.dispose()
  cardMaps.uCard0.value = targets[0].texture
  cardMaps.uCard1.value = targets[1].texture
  cardMaps.uCard2.value = targets[2].texture
  return targets
}

export function cardGeometry(): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return g
}

const f = (v: number) => v.toFixed(4)
// The card's place and its cell of the atlas, for the picture and for the shadow pass alike. The tree's foot, width and
// height come from its instance; it turns to the eye about the upright, and leans as the eye that drew its cell did.
export const CARD_VERTEX: Pick<Patch, 'vertexHead' | 'vertexBegin' | 'vertexWorld'> = {
  vertexHead: 'attribute vec4 aTree; varying vec4 vTree; varying vec2 vCard; varying vec3 vCell; float gCardHalf;',
  vertexBegin: /* glsl */ `
    vTree = aTree;
    {
      vec3 cZ = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
      float cE = asin(clamp(cZ.y, -1.0, 1.0)) + (fract(aTree.x * 7.31) - 0.5) * 0.14;
      float cRow = cE < 0.36 ? 0.0 : cE < 0.76 ? 1.0 : 2.0;
      #ifdef CARD_CONIFER
        float cCol = 0.0;
        gCardHalf = ${f(CARD.halfW[0])};
      #else
        float cSp = floor(aTree.x + 0.001);
        float cCol = cSp < 0.5 ? 1.0 : cSp < 2.5 ? 2.0 : 3.0;
        gCardHalf = cSp < 0.5 ? ${f(CARD.halfW[1])} : cSp < 2.5 ? ${f(CARD.halfW[2])} : ${f(CARD.halfW[3])};
      #endif
      float cFlip = fract(aTree.x * 3.71) < 0.5 ? -1.0 : 1.0;
      vCard = (vec2(cCol, cRow) * vec2(${f(CARD.w)}, ${f(CARD.h)}) + ${f(CARD.pad)} + (vec2(position.x * cFlip, position.y) * 0.5 + 0.5) * vec2(${f(CARD.w - 2 * CARD.pad)}, ${f(CARD.h - 2 * CARD.pad)})) / vec2(${f(AW)}, ${f(AH)});
      vCell = vec3(cRow < 0.5 ? ${f(CARD.elev[0])} : cRow < 1.5 ? ${f(CARD.elev[1])} : ${f(CARD.elev[2])}, cFlip, 0.0);
      #ifdef USE_MAP
        vMapUv = vCard;
      #endif
    }
    transformed = vec3(0.0);
  `,
  vertexWorld: /* glsl */ `
    {
      vec3 cZ = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
      vec2 cH = normalize(cZ.xz + vec2(1e-5, 0.0));
      vec3 cR = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]) + vec3(1e-5, 0.0, 0.0));
      float cw = length(instanceMatrix[0].xyz), cs = length(instanceMatrix[1].xyz);
      #ifdef CARD_THIN
        // in the wide shadows a wood is drawn with two trees in five, each half as wide again
        if (fract(aTree.x * 13.7 + aTree.y * 5.1) > 0.4) cw = 0.0, cs = 0.0;
        cw *= 1.5;
      #endif
      cWorld.xyz += vec3(0.0, ${f(CARD.centre)} * cs, 0.0) + cR * (position.x * gCardHalf * cw)
        + position.y * ${f(CARD.halfH)} * (cos(vCell.x) * cs * vec3(0.0, 1.0, 0.0) - sin(vCell.x) * cw * vec3(cH.x, 0.0, cH.y));
    }
  `,
}

// For the card's fragment shader: the maps, which level of them to read (no coarser than keeps one cell out of the
// next), and a direction the drawing eye saw, as it lies in the world now.
export const CARD_FRAGMENT = /* glsl */ `
uniform sampler2D uCard0; uniform sampler2D uCard1; uniform sampler2D uCard2;
varying vec4 vTree; varying vec2 vCard; varying vec3 vCell;
vec3 cardWN;
#define vWNormal cardWN
float cardLod() {
  vec2 px = vCard * vec2(${f(AW)}, ${f(AH)});
  return clamp(log2(max(length(dFdx(px)), length(dFdy(px))) + 1e-6), 0.0, 3.0);
}
vec3 cardWorld(vec3 n) {
  vec3 cZ = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec2 h = normalize(cZ.xz + vec2(1e-5, 0.0));
  vec3 R = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]) + vec3(1e-5, 0.0, 0.0)), H = vec3(h.x, 0.0, h.y);
  float c = cos(vCell.x), s = sin(vCell.x);
  return normalize(n.x * vCell.y * R + n.y * (c * vec3(0.0, 1.0, 0.0) - s * H) + n.z * (s * vec3(0.0, 1.0, 0.0) + c * H));
}
`
export const BARE_SHIFT = f((BARE * CARD.w) / AW)
// In the shadow pass (three gives a depth material its mesh's own map, so the atlas is read here by its own name): the
// card's cover, read no coarser than keeps its cell its own, and a hardwood bare once its leaves are down.
export const CARD_SHADOW_HEAD = 'uniform sampler2D uCard0; varying vec4 vTree; varying vec2 vCard; varying vec3 vCell;'
export const CARD_SHADOW = /* glsl */ `
  {
    vec2 px = vCard * vec2(${f(AW)}, ${f(AH)});
    float cl = clamp(log2(max(length(dFdx(px)), length(dFdy(px))) + 1e-6), 0.0, 3.0);
    vec2 at = vCard;
    #ifndef CARD_CONIFER
      at.x += ${BARE_SHIFT} * step(uLeaf, 0.3);
    #endif
    if (textureLod(uCard0, at, cl).a < 0.4) discard;
  }
`
