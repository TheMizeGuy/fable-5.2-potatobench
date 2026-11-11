// The farmstead: the connected farm (big house, little house, back house, barn) stepping up the slope, the potato house
// banked into the hill, the bridge, and the neighbours' houses and barns far off.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Group, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, Quaternion, Shape, Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FARMSTEADS } from './flora.ts'
import { BARN, HOUSE, POTATO_HOUSE, WATER_Y, brookZ, groundY, padLevel } from './layout.ts'
import { SNOW_RIME, linear, patch } from './shaders.ts'

type Finish = 'plain' | 'clapboard' | 'boards' | 'shingle' | 'metal' | 'brick' | 'stone' | 'glass'

// Paint and wear, drawn in the shader from where the surface is in the world: no texture coordinates needed.
const FINISH: Record<Finish, string> = {
  plain: 'float tone = 0.94 + 0.12 * texture2D(uNoise, vWorld.xy * 0.6 + vWorld.zz * 0.4).a;',
  clapboard: /* glsl */ `
    float lap = fract(vWorld.y / 0.13);
    float seen = 1.0 - smoothstep(0.3, 0.9, fwidth(vWorld.y) / 0.13);
    float tone = (1.0 - 0.34 * seen * smoothstep(0.78, 0.98, lap)) * (0.9 + 0.2 * texture2D(uNoise, vec2(dot(vWorld.xz, vec2(0.7, 0.7)) * 0.3, vWorld.y * 2.0)).a);`,
  boards: /* glsl */ `
    float run = abs(vWNormal.x) > abs(vWNormal.z) ? vWorld.z : vWorld.x;
    float seen = 1.0 - smoothstep(0.3, 0.9, fwidth(run) / 0.2);
    float board = floor(run / 0.2);
    float tone = (1.0 - 0.4 * seen * smoothstep(0.86, 0.98, fract(run / 0.2))) * (0.84 + 0.3 * fract(sin(board * 12.9898) * 43758.5453) * seen) * (0.9 + 0.2 * texture2D(uNoise, vec2(run * 1.5, vWorld.y * 0.25)).a);`,
  shingle: /* glsl */ `
    float run = abs(vWNormal.x) > abs(vWNormal.z) ? vWorld.z : vWorld.x;
    float course = vWorld.y / 0.085, seen = 1.0 - smoothstep(0.3, 0.9, fwidth(course));
    float tab = floor(run / 0.17 + 0.5 * floor(course));
    float tone = (1.0 - 0.3 * seen * smoothstep(0.7, 0.98, fract(course))) * (0.8 + 0.36 * fract(sin(tab * 78.233 + floor(course) * 12.9898) * 43758.5453) * seen) * (0.9 + 0.2 * texture2D(uNoise, vWorld.xz * 0.4).a);`,
  metal: /* glsl */ `
    float run = abs(vWNormal.x) > abs(vWNormal.z) ? vWorld.z : vWorld.x;
    float seen = 1.0 - smoothstep(0.3, 0.9, fwidth(run) / 0.3);
    float tone = (1.0 - 0.3 * seen * smoothstep(0.9, 0.99, fract(run / 0.3))) * (0.82 + 0.3 * texture2D(uNoise, vWorld.xz * 0.21).b);`,
  brick: /* glsl */ `
    float course = vWorld.y / 0.06, run = (abs(vWNormal.x) > abs(vWNormal.z) ? vWorld.z : vWorld.x) / 0.13 + 0.5 * floor(course);
    float seen = 1.0 - smoothstep(0.3, 0.9, fwidth(course));
    float tone = mix(1.0, 0.72 + 0.4 * fract(sin(floor(run) * 12.9898 + floor(course) * 78.233) * 43758.5453), seen) * (1.0 - 0.35 * seen * max(smoothstep(0.82, 0.96, fract(course)), smoothstep(0.9, 0.98, fract(run))));`,
  stone: 'float tone = 0.72 + 0.5 * texture2D(uNoise, vWorld.xz * 0.5 + vWorld.yy * 0.7).a;',
  glass: 'float tone = 1.0;',
}

export const LAMP = { value: 0 }

export class Props {
  readonly group = new Group()
  // Where smoke leaves the kitchen chimney.
  readonly chimney = new Vector3()
  private parts = new Map<string, { mat: MeshStandardMaterial; geos: BufferGeometry[] }>()
  private disposables: { dispose(): void }[] = []
  private m = new Matrix4()
  private q = new Quaternion()
  private up = new Vector3(0, 1, 0)

  constructor() {
    this.farmhouse()
    this.potatoHouse()
    this.bridge()
    for (const { mat, geos } of this.parts.values()) {
      const merged = mergeGeometries(geos)!
      for (const g of geos) g.dispose()
      const mesh = new Mesh(merged, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.layers.enable(1)
      mesh.layers.enable(2)
      this.group.add(mesh)
      this.disposables.push(merged, mat)
    }
    this.neighbours()
  }

  private mat(color: string, finish: Finish, roughness = 0.9): { mat: MeshStandardMaterial; geos: BufferGeometry[] } {
    const key = `${color}|${finish}`
    let part = this.parts.get(key)
    if (!part) {
      const glass = finish === 'glass'
      const mat = patch(new MeshStandardMaterial({ color, roughness: glass ? 0.1 : roughness, metalness: finish === 'metal' ? 0.25 : 0 }), {
        key: `county-built-${finish}`,
        uniforms: glass ? { uLamp: LAMP } : {},
        fragmentHead: glass ? 'uniform float uLamp;' : '',
        fragmentColor: `{ ${FINISH[finish]} diffuseColor.rgb *= tone; } ${glass ? '' : SNOW_RIME}`,
        // Windows catch the low sun, and show lamplight on a winter evening.
        fragmentEmissive: glass ? /* glsl */ `
          {
            vec3 seen = reflect(normalize(vWorld - cameraPosition), normalize(vWNormal));
            float low = 1.0 - smoothstep(0.16, 0.5, uSunDir.y);
            totalEmissiveRadiance += uSunCol * (pow(max(dot(seen, uSunDir), 0.0), 14.0) * 1.3 + 0.16 * low * max(dot(normalize(vWNormal), uSunDir), 0.0)) * cloudShade(vWorld);
            float lit = step(0.66, fract(sin(floor(vWorld.y * 1.2) * 12.9898 + floor(vWorld.x * 0.97) * 78.233 + floor(vWorld.z * 0.97) * 37.719) * 43758.5453));
            totalEmissiveRadiance += ${linear('#ffc47a')} * uLamp * lit * 0.9;
          }` : '',
      })
      part = { mat, geos: [] }
      this.parts.set(key, part)
    }
    return part
  }

  private add(g: BufferGeometry, part: { geos: BufferGeometry[] }, x: number, y: number, z: number, ry = 0): void {
    g.applyMatrix4(this.m.compose(new Vector3(x, y, z), this.q.setFromAxisAngle(this.up, ry), new Vector3(1, 1, 1)))
    const flat = g.index ? g.toNonIndexed() : g
    if (flat !== g) g.dispose()
    for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name)
    part.geos.push(flat)
  }

  private box(w: number, h: number, d: number, color: string, finish: Finish, x: number, y: number, z: number, ry = 0): void {
    this.add(new BoxGeometry(w, h, d), this.mat(color, finish), x, y, z, ry)
  }

  // A gabled building: ridge along z, floor centre at (x, y, z). Returns the height of the ridge.
  private gabled(w: number, l: number, wall: number, rise: number, color: string, finish: Finish, roofColor: string, roofFinish: Finish, x: number, y: number, z: number): number {
    const shape = new Shape()
    shape.moveTo(-w / 2, -0.6)
    shape.lineTo(w / 2, -0.6)
    shape.lineTo(w / 2, wall)
    shape.lineTo(0, wall + rise)
    shape.lineTo(-w / 2, wall)
    shape.closePath()
    const body = new ExtrudeGeometry(shape, { depth: l, bevelEnabled: false })
    body.translate(0, 0, -l / 2)
    this.add(body, this.mat(color, finish), x, y, z)
    const oh = 0.16
    const ang = Math.atan2(rise, w / 2)
    const slope = Math.hypot(w / 2, rise) + oh
    for (const side of [-1, 1]) {
      const roof = new BoxGeometry(slope, 0.07, l + oh * 2)
      roof.translate(-slope / 2 + (oh > 0 ? 0 : 0), 0.035, 0)
      roof.rotateZ(side > 0 ? ang : Math.PI - ang)
      roof.translate(0, wall + rise + 0.01, 0)
      this.add(roof, this.mat(roofColor, roofFinish, 0.8), x, y, z)
    }
    // rake and eave boards
    for (const end of [-1, 1]) for (const side of [-1, 1]) {
      const rake = new BoxGeometry(slope, 0.09, 0.05)
      rake.translate(-slope / 2, -0.03, 0)
      rake.rotateZ(side > 0 ? ang : Math.PI - ang)
      rake.translate(0, wall + rise, end * (l / 2 + oh - 0.02))
      this.add(rake, this.mat('#efe9da', 'plain'), x, y, z)
    }
    return y + wall + rise
  }

  // A window: casing, sash and glass on a wall facing -x (`face` 0) or +z (`face` 1).
  private window(x: number, y: number, z: number, face: number, w = 0.34, h = 0.52): void {
    const t = 0.05
    if (face === 0) {
      this.box(t, h + 0.1, w + 0.1, '#efe9da', 'plain', x, y, z)
      this.box(t + 0.01, h, w, '#1c2428', 'glass', x - 0.008, y, z)
      this.box(t + 0.02, 0.025, w, '#efe9da', 'plain', x - 0.01, y, z)
      this.box(t + 0.02, h, 0.022, '#efe9da', 'plain', x - 0.01, y, z)
    } else {
      this.box(w + 0.1, h + 0.1, t, '#efe9da', 'plain', x, y, z)
      this.box(w, h, t + 0.01, '#1c2428', 'glass', x, y, z + 0.008)
      this.box(w, 0.025, t + 0.02, '#efe9da', 'plain', x, y, z + 0.01)
      this.box(0.022, h, t + 0.02, '#efe9da', 'plain', x, y, z + 0.01)
    }
  }

  private farmhouse(): void {
    const white = '#e9e3d3', red = '#8a3b2d', roof = '#4b4d50', barnRoof = '#8a8c88', brick = '#7c4737', green = '#2f4a3a'
    const hx = HOUSE.x, hz = HOUSE.z
    const y0 = padLevel(0), y1 = padLevel(1), y2 = padLevel(2)
    // The big house: gable to the road below, two storeys.
    const ridge = this.gabled(3.0, 3.6, 2.05, 1.15, white, 'clapboard', roof, 'shingle', hx, y0, hz)
    this.box(3.06, 0.14, 3.66, '#8a857c', 'stone', hx, y0 + 0.02, hz)
    for (const wz of [hz - 1.05, hz, hz + 1.05]) for (const wy of [0.72, 1.62]) this.window(hx - 1.5, y0 + wy, wz, 0)
    for (const wx of [hx - 0.72, hx + 0.72]) for (const wy of [0.72, 1.62]) this.window(wx, y0 + wy, hz + 1.8, 1)
    this.window(hx, y0 + 2.5, hz + 1.8, 1, 0.26, 0.36)
    // front door on the gable end, with a hood
    this.box(0.42, 0.86, 0.06, green, 'plain', hx, y0 + 0.5, hz + 1.81)
    this.box(0.7, 0.05, 0.3, '#efe9da', 'plain', hx, y0 + 1.02, hz + 1.94)
    this.box(0.8, 0.1, 0.4, '#8a857c', 'stone', hx, y0 + 0.04, hz + 2.0)
    for (const s of [-1, 1]) this.box(0.08, 2.05, 0.08, '#efe9da', 'plain', hx + s * 1.5, y0 + 1.02, hz + 1.8)
    this.box(0.36, 0.9, 0.36, brick, 'brick', hx + 0.4, ridge + 0.1, hz - 0.5)
    // The little house (the kitchen ell), a step up the slope, with a porch on the dooryard side.
    const ell = this.gabled(2.3, 3.0, 1.45, 0.82, white, 'clapboard', roof, 'shingle', hx + 0.1, y1, hz - 3.2)
    for (const wz of [hz - 2.5, hz - 3.9]) this.window(hx - 1.05, y1 + 0.78, wz, 0, 0.32, 0.48)
    this.box(0.06, 0.82, 0.4, green, 'plain', hx - 1.06, y1 + 0.46, hz - 3.2)
    this.box(0.9, 0.06, 2.4, roof, 'shingle', hx - 1.5, y1 + 1.36, hz - 3.2)
    for (const pz of [hz - 4.3, hz - 2.1]) this.box(0.07, 1.3, 0.07, '#efe9da', 'plain', hx - 1.88, y1 + 0.68, pz)
    this.box(0.9, 0.08, 2.4, '#8d7f6c', 'boards', hx - 1.5, y1 + 0.06, hz - 3.2)
    this.box(0.3, 0.8, 0.3, brick, 'brick', hx + 0.3, ell + 0.15, hz - 3.4)
    this.chimney.set(hx + 0.3, ell + 0.6, hz - 3.4)
    // The back house (woodshed and workshop), then the barn, each a step higher.
    this.gabled(2.5, 2.8, 1.5, 0.9, white, 'clapboard', roof, 'shingle', hx + 0.2, y1 + 0.1, hz - 6.0)
    this.box(0.06, 1.1, 1.3, '#6f6253', 'boards', hx - 1.06, y1 + 0.66, hz - 6.0)
    const bx = BARN.x, bz = BARN.z
    const barnTop = this.gabled(4.3, 6.0, 2.5, 1.9, red, 'boards', barnRoof, 'metal', bx, y2, bz - 0.8)
    this.box(4.36, 0.2, 6.06, '#8a857c', 'stone', bx, y2 + 0.04, bz - 0.8)
    // the great door on its track, the hay door above it, a row of small sashes, white trim
    this.box(0.07, 1.9, 1.9, '#7c3528', 'boards', bx - 2.17, y2 + 1.0, bz - 0.4)
    this.box(0.08, 0.08, 2.9, '#efe9da', 'plain', bx - 2.18, y2 + 2.0, bz - 0.9)
    for (const s of [-1, 1]) this.box(0.09, 1.9, 0.07, '#efe9da', 'plain', bx - 2.19, y2 + 1.0, bz - 0.4 + s * 0.95)
    for (const wz of [bz - 2.9, bz + 1.6]) this.window(bx - 2.15, y2 + 1.25, wz, 0, 0.3, 0.3)
    for (const s of [-1, 1]) this.box(0.1, 2.5, 0.1, '#efe9da', 'plain', bx - 2.15, y2 + 1.25, bz - 0.8 + s * 3.0)
    this.box(0.7, 0.8, 0.07, '#7c3528', 'boards', bx, y2 + 3.0, bz + 2.21)
    this.window(bx, y2 + 3.9, bz + 2.2, 1, 0.26, 0.26)
    for (const s of [-1, 1]) this.box(0.1, 2.5, 0.1, '#efe9da', 'plain', bx + s * 2.15, y2 + 1.25, bz + 2.2)
    // cupola
    this.box(0.62, 0.5, 0.62, '#efe9da', 'clapboard', bx, barnTop + 0.2, bz - 0.8)
    this.gabled(0.8, 0.8, 0.0, 0.34, '#efe9da', 'plain', barnRoof, 'metal', bx, barnTop + 0.45, bz - 0.8)
    // woodpile against the back house
    for (let k = 0; k < 3; k++) this.box(0.34, 0.3 - k * 0.02, 1.5 - k * 0.2, '#8a7458', 'boards', hx - 1.36, y1 + 0.2 + k * 0.28, hz - 7.0)
  }

  private potatoHouse(): void {
    const px = POTATO_HOUSE.x, pz = POTATO_HOUSE.z
    const y = padLevel(3)
    const w = 4.2, l = 6.2, wall = 1.15, rise = 1.25
    const front = pz + l / 2
    // The frame house above, shingled and weathered grey; concrete below, where the door is.
    const top = this.gabled(w, l, wall, rise, '#8f8a80', 'shingle', '#5d5a56', 'shingle', px, y, pz)
    this.box(w + 0.1, 0.62, 0.16, '#a8a295', 'stone', px, y + 0.3, front + 0.02)
    for (const s of [-1, 1]) {
      this.box(0.82, 1.08, 0.08, '#5e5248', 'boards', px + s * 0.43, y + 0.56, front + 0.08)
      // wing walls hold back the bank each side of the door
      this.box(0.18, 0.8, 1.8, '#a8a295', 'stone', px + s * (w / 2 + 0.05), y + 0.34, front + 0.8)
    }
    this.box(1.9, 0.1, 0.12, '#3b352e', 'plain', px, y + 1.16, front + 0.09)
    this.window(px, y + 1.7, front, 1, 0.3, 0.3)
    // ventilators on the ridge
    for (const vz of [pz - 1.6, pz + 1.3]) {
      this.box(0.36, 0.36, 0.36, '#9aa0a0', 'metal', px, top + 0.14, vz)
      this.gabled(0.5, 0.5, 0, 0.16, '#9aa0a0', 'metal', '#9aa0a0', 'metal', px, top + 0.32, vz)
    }
    // Earth banked to the eaves along both sides and round the back.
    const berm = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 }), {
      fragmentColor: `diffuseColor.rgb = uGrass * (0.74 + 0.5 * texture2D(uNoise, vWorld.xz * 0.043).b) * (0.88 + 0.24 * texture2D(uNoise, vWorld.xz * 0.31).a); ${SNOW_RIME}`,
    })
    const bank = (sx: number, sz: number, bw: number, bl: number, x: number, z: number) => {
      const sh = new Shape()
      sh.moveTo(0, -0.7)
      sh.lineTo(bw, -0.7)
      sh.lineTo(bw, 0)
      sh.lineTo(0, wall + 0.05)
      sh.closePath()
      const g = new ExtrudeGeometry(sh, { depth: bl, bevelEnabled: false })
      g.translate(0, 0, -bl / 2)
      if (sx < 0) g.scale(-1, 1, 1)
      if (sz) g.rotateY(-Math.PI / 2 * sz)
      const mesh = new Mesh(g, berm)
      mesh.position.set(x, y, z)
      mesh.castShadow = mesh.receiveShadow = true
      mesh.layers.enable(1)
      this.group.add(mesh)
      this.disposables.push(g)
    }
    bank(1, 0, 2.2, l - 0.2, px + w / 2 - 0.02, pz - 0.1)
    bank(-1, 0, 2.2, l - 0.2, px - w / 2 + 0.02, pz - 0.1)
    bank(1, 1, 2.0, w + 3.4, px, pz - l / 2 + 0.02)
    this.disposables.push(berm)
  }

  private bridge(): void {
    const x = 17.8, z = brookZ(17.8)
    const deck = Math.max(groundY(x, z - 2), WATER_Y + 0.42)
    for (let k = 0; k < 9; k++) this.box(1.9, 0.07, 0.3, k % 2 ? '#7a6753' : '#6d5b48', 'boards', x, deck + 0.02, z - 1.36 + k * 0.34)
    for (const dx of [-0.82, 0.82]) {
      const g = new CylinderGeometry(0.09, 0.09, 3.3, 7)
      g.rotateX(Math.PI / 2)
      this.add(g, this.mat('#4f4237', 'plain'), x + dx, deck - 0.08, z)
      // a rail on posts
      for (const pz of [-1.2, 0, 1.2]) this.box(0.07, 0.5, 0.07, '#6d5b48', 'plain', x + dx * 1.1, deck + 0.28, z + pz)
      this.box(0.06, 0.06, 2.7, '#6d5b48', 'plain', x + dx * 1.1, deck + 0.5, z)
    }
  }

  // The neighbours: a house and a barn each, small and plain, seen from a long way off.
  private neighbours(): void {
    const one = (w: number, l: number, wall: number, rise: number, x: number, z: number, wallC: number[], roofC: number[]): BufferGeometry => {
      const hw = w / 2, hl = l / 2, top = wall + rise
      const v: number[] = [], c: number[] = []
      const tri = (a: number[], b: number[], d: number[], col: number[]) => { v.push(...a, ...b, ...d); c.push(...col, ...col, ...col) }
      const quad = (a: number[], b: number[], d: number[], e: number[], col: number[]) => { tri(a, b, d, col); tri(a, d, e, col) }
      const P = (px: number, py: number, pz: number) => [x + px, py, z + pz]
      quad(P(-hw, -1, hl), P(hw, -1, hl), P(hw, wall, hl), P(-hw, wall, hl), wallC)
      quad(P(hw, -1, -hl), P(-hw, -1, -hl), P(-hw, wall, -hl), P(hw, wall, -hl), wallC)
      quad(P(hw, -1, hl), P(hw, -1, -hl), P(hw, wall, -hl), P(hw, wall, hl), wallC)
      quad(P(-hw, -1, -hl), P(-hw, -1, hl), P(-hw, wall, hl), P(-hw, wall, -hl), wallC)
      tri(P(-hw, wall, hl), P(hw, wall, hl), P(0, top, hl), wallC)
      tri(P(hw, wall, -hl), P(-hw, wall, -hl), P(0, top, -hl), wallC)
      quad(P(hw + 0.15, wall - 0.1, hl + 0.15), P(hw + 0.15, wall - 0.1, -hl - 0.15), P(0, top, -hl - 0.15), P(0, top, hl + 0.15), roofC)
      quad(P(-hw - 0.15, wall - 0.1, -hl - 0.15), P(-hw - 0.15, wall - 0.1, hl + 0.15), P(0, top, hl + 0.15), P(0, top, -hl - 0.15), roofC)
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
      g.setAttribute('color', new BufferAttribute(new Float32Array(c), 3))
      g.computeVertexNormals()
      return g
    }
    const white = [0.82, 0.79, 0.7], red = [0.26, 0.05, 0.035], grey = [0.09, 0.09, 0.1], tin = [0.3, 0.31, 0.3]
    const parts = [one(3, 4.2, 2.1, 1.2, 0, 0, white, grey), one(2.4, 3, 1.5, 0.9, 0.2, -3.6, white, grey), one(4.6, 6.4, 2.6, 2, 0.6, -9, red, tin)]
    const geo = mergeGeometries(parts)!
    for (const p of parts) p.dispose()
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 }), { fragmentColor: SNOW_RIME })
    const mesh = new InstancedMesh(geo, mat, FARMSTEADS.length)
    const p = new Vector3(), s = new Vector3(1, 1, 1)
    FARMSTEADS.forEach(([x, z, ry], k) => {
      const y = Math.min(groundY(x, z), groundY(x + 2, z - 9), groundY(x - 2, z + 2)) + 0.2
      mesh.setMatrixAt(k, this.m.compose(p.set(x, y, z), this.q.setFromAxisAngle(this.up, ry), s))
    })
    mesh.castShadow = true
    mesh.layers.enable(2)
    mesh.frustumCulled = false
    this.group.add(mesh)
    this.disposables.push(geo, mat)
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.group.traverse(o => { if (o instanceof InstancedMesh) o.dispose() })
  }
}
