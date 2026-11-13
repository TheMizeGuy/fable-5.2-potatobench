// The farm's machines: tractors with the implement for the job, the truck, a trailer, and the cars that call. Each
// body is one mesh in its own paint; wheels, the driver and whatever turns or rattles are drawn from the shared
// shapes (prims.ts).
import {
  BoxGeometry, BufferAttribute, Color, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial,
  Quaternion, Shape, SphereGeometry, TorusGeometry, Vector2, Vector3, type BufferGeometry, type Material,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { JobKind } from '../sim/index.ts'
import { COLORS, Pose, drawFigure, drive, type Dress } from './crew.ts'
import type { Particles } from './particles.ts'
import type { Prims } from './prims.ts'
import { SNOW_RIME, patch } from './shaders.ts'

export type Implement = 'none' | 'planter' | 'hiller' | 'sprayer' | 'tank' | 'flail' | 'digger' | 'harvester' | 'trailer'

export function implementFor(kind: JobKind | 'travel', harvester = false): Implement {
  switch (kind) {
    case 'plant': return 'planter'
    case 'hill': return 'hiller'
    case 'spray': return 'sprayer'
    case 'kill': return 'flail'
    case 'water': return 'tank'
    case 'dig': return harvester ? 'harvester' : 'digger'
    case 'haul': return 'trailer'
    default: return 'none'
  }
}

// How dusty or muddy the ground is, shared by every machine: road dust clings low down on a dry day, mud on a wet one.
export const GRIME = { value: new Vector3(0.52, 0.42, 0.31) }

let shared: Material | null = null
function machineMaterial(): Material {
  shared ??= patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.56, metalness: 0.08 }), {
    key: 'county-machine',
    uniforms: { uGrime: GRIME },
    vertexHead: 'varying float vLow;',
    vertexBegin: 'vLow = position.y;',
    fragmentHead: 'uniform vec3 uGrime; varying float vLow;',
    fragmentColor: /* glsl */ `
      {
        float worn = texture2D(uNoise, vWorld.xz * 0.9 + vWorld.yy * 0.7).a;
        diffuseColor.rgb *= 0.86 + 0.26 * worn;
        diffuseColor.rgb = mix(diffuseColor.rgb, uGrime, (1.0 - smoothstep(0.02, 0.62, vLow)) * (0.34 + 0.3 * worn));
      }
      ${SNOW_RIME.replace('uSnow', 'uSnow * 0.25')}`,
  })
  return shared
}

// Puts painted pieces together into one geometry.
class Shop {
  private geos: BufferGeometry[] = []
  private m = new Matrix4()
  private q = new Quaternion()
  private c = new Color()

  add(g: BufferGeometry, color: string, x = 0, y = 0, z = 0, rz = 0, ry = 0): this {
    this.q.setFromAxisAngle(new Vector3(0, 1, 0), ry).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rz))
    g.applyMatrix4(this.m.compose(new Vector3(x, y, z), this.q, new Vector3(1, 1, 1)))
    const flat = g.index ? g.toNonIndexed() : g
    if (flat !== g) g.dispose()
    for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name)
    const n = flat.getAttribute('position').count
    const col = new Float32Array(n * 3)
    this.c.set(color)
    for (let i = 0; i < n; i++) col.set([this.c.r, this.c.g, this.c.b], i * 3)
    flat.setAttribute('color', new BufferAttribute(col, 3))
    this.geos.push(flat)
    return this
  }

  box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, rz = 0, ry = 0): this {
    return this.add(new BoxGeometry(w, h, d), color, x, y, z, rz, ry)
  }

  // A box with its edges rounded over, long along x.
  rounded(w: number, h: number, d: number, r: number, color: string, x: number, y: number, z: number, rz = 0): this {
    const s = new Shape()
    const hd = d / 2, hh = h / 2, rr = Math.min(r, hd, hh)
    s.moveTo(-hd + rr, -hh)
    s.lineTo(hd - rr, -hh)
    s.quadraticCurveTo(hd, -hh, hd, -hh + rr)
    s.lineTo(hd, hh - rr)
    s.quadraticCurveTo(hd, hh, hd - rr, hh)
    s.lineTo(-hd + rr, hh)
    s.quadraticCurveTo(-hd, hh, -hd, hh - rr)
    s.lineTo(-hd, -hh + rr)
    s.quadraticCurveTo(-hd, -hh, -hd + rr, -hh)
    const g = new ExtrudeGeometry(s, { depth: w - rr, bevelEnabled: true, bevelThickness: rr * 0.5, bevelSize: rr * 0.5, bevelSegments: 2, curveSegments: 4 })
    g.translate(0, 0, -(w - rr) / 2)
    g.rotateY(Math.PI / 2)
    return this.add(g, color, x, y, z, rz)
  }

  // A cylinder along y, or across the machine (along z) when `across`.
  cyl(r0: number, r1: number, h: number, color: string, x: number, y: number, z: number, across = false, sides = 12, rz = 0): this {
    const g = new CylinderGeometry(r0, r1, h, sides)
    if (across) g.rotateX(Math.PI / 2)
    return this.add(g, color, x, y, z, rz)
  }

  ball(r: number, color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): this {
    const g = new SphereGeometry(r, 12, 8)
    g.scale(sx, sy, sz)
    return this.add(g, color, x, y, z)
  }

  // A mudguard: a band bent over a wheel on the axle (x, y), from angle a0 to a1, `wide` across, centred on z.
  guard(r: number, thick: number, a0: number, a1: number, wide: number, color: string, x: number, y: number, z: number): this {
    const s = new Shape()
    s.absarc(0, 0, r + thick, a0, a1, false)
    s.absarc(0, 0, r, a1, a0, true)
    s.closePath()
    const g = new ExtrudeGeometry(s, { depth: wide, bevelEnabled: false, curveSegments: 10 })
    g.translate(0, 0, -wide / 2)
    return this.add(g, color, x, y, z)
  }

  // A side view cut out and given width: a cab, a car's body. `pts` in (x, y), going round anticlockwise.
  profile(pts: [number, number][], wide: number, bevel: number, color: string, x: number, y: number, z: number): this {
    const s = new Shape()
    pts.forEach(([px, py], k) => (k === 0 ? s.moveTo(px, py) : s.lineTo(px, py)))
    s.closePath()
    const g = new ExtrudeGeometry(s, { depth: wide - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 })
    g.translate(0, 0, -(wide - bevel * 2) / 2)
    return this.add(g, color, x, y, z)
  }

  done(): BufferGeometry {
    const merged = mergeGeometries(this.geos)!
    for (const g of this.geos) g.dispose()
    this.geos = []
    return merged
  }
}

// The tractor's own measures, in the small units it is modelled in: where its back axle and its nose are, its wheels,
// how far apart they stand, and the top of its stack. The truck's: from its bumper to the end of its bed.
export const TRACTOR_MODEL = { axle: -0.42, wheel: 0.37, tyre: 0.21, track: 0.36, nose: 0.82, stack: 1.26 }
export const TRUCK_MODEL = { nose: 1.145, bed: 1.55, wide: 0.96 }
export const TRACTOR_SIZE = {
  long: TRACTOR_MODEL.nose - (TRACTOR_MODEL.axle - TRACTOR_MODEL.wheel), wide: 2 * TRACTOR_MODEL.track + TRACTOR_MODEL.tyre, tall: TRACTOR_MODEL.stack,
}
export const TRUCK_SIZE = { long: TRUCK_MODEL.nose + 0.24 + TRUCK_MODEL.bed, wide: TRUCK_MODEL.wide }

export interface Paint { body: string; frame: string; rim: string; seat: string }
// The farm's first tractor is old and red; the second a grey one with a red belly; the third green with yellow wheels.
export const PAINTS: Paint[] = [
  { body: '#a8341f', frame: '#3a2f2a', rim: '#d9cfb6', seat: '#2a2a27' },
  { body: '#8f938e', frame: '#8a3324', rim: '#8a3324', seat: '#3a3936' },
  { body: '#3d6a3a', frame: '#2f3b2c', rim: '#d6ae3c', seat: '#d6ae3c' },
]

const IRON = '#4a4b49', DARK = '#262624', STEEL = '#8b8d88'

function tractorBody(p: Paint): BufferGeometry {
  const s = new Shop()
  // Facing +x, the back axle at x = -0.42. Frame rails and the engine under the hood.
  s.box(1.02, 0.1, 0.2, p.frame, 0.2, 0.42, 0)
  s.box(0.5, 0.26, 0.22, IRON, 0.22, 0.52, 0)
  s.box(0.14, 0.2, 0.26, IRON, 0.02, 0.54, 0)
  // the gearbox and the back axle's housings
  s.rounded(0.46, 0.3, 0.3, 0.08, p.frame, -0.36, 0.44, 0)
  s.cyl(0.07, 0.07, 0.62, p.frame, -0.42, 0.37, 0, true, 10)
  // the tank and cowl in front of the driver, the grille's surround
  s.rounded(0.3, 0.22, 0.31, 0.09, p.body, -0.07, 0.74, 0)
  s.rounded(0.1, 0.42, 0.33, 0.08, p.body, 0.75, 0.6, 0)
  s.box(0.02, 0.3, 0.23, DARK, 0.805, 0.6, 0)
  for (let n = 0; n < 6; n++) s.box(0.026, 0.012, 0.24, '#b9b6aa', 0.812, 0.48 + n * 0.048, 0)
  // seat on its spring, the platform, the drawbar
  const pan = new LatheGeometry([new Vector2(0, 0), new Vector2(0.11, 0.005), new Vector2(0.135, 0.05), new Vector2(0.125, 0.065)], 12)
  s.add(pan, p.seat, -0.44, 0.76, 0)
  s.box(0.03, 0.17, 0.2, p.seat, -0.56, 0.87, 0)
  s.cyl(0.018, 0.018, 0.14, STEEL, -0.46, 0.7, 0)
  for (const z of [-0.2, 0.2]) s.box(0.42, 0.025, 0.14, IRON, -0.14, 0.555, z)
  s.box(0.36, 0.04, 0.1, IRON, -0.74, 0.32, 0)
  // mudguards over the big wheels, with their inner plates
  for (const z of [-0.36, 0.36]) {
    s.guard(0.42, 0.025, Math.PI * 0.42, Math.PI * 1.04, 0.25, p.body, -0.42, 0.37, z)
    s.box(0.5, 0.3, 0.02, p.body, -0.5, 0.6, z - Math.sign(z) * 0.125)
  }
  // the front axle, kingpins and steering arm
  s.box(0.07, 0.06, 0.66, IRON, 0.62, 0.24, 0)
  s.box(0.08, 0.2, 0.08, IRON, 0.62, 0.33, 0)
  // stack, air cleaner, steering column and wheel, lamps on their stalks
  s.cyl(0.024, 0.028, 0.5, DARK, 0.42, 1.0, 0.09, false, 8)
  s.cyl(0.036, 0.036, 0.02, DARK, 0.42, TRACTOR_MODEL.stack - 0.01, 0.09, false, 8)
  s.cyl(0.045, 0.045, 0.14, STEEL, 0.56, 0.87, -0.08, false, 10)
  s.cyl(0.012, 0.012, 0.38, DARK, -0.13, 0.9, 0, false, 6, 0.9)
  const wheel = new TorusGeometry(0.1, 0.011, 6, 16)
  wheel.rotateY(Math.PI / 2)
  s.add(wheel, DARK, -0.275, 1.0, 0, 0.9 + Math.PI / 2)
  s.box(0.2, 0.012, 0.014, DARK, -0.275, 1.0, 0, 0.9)
  s.box(0.014, 0.012, 0.2, DARK, -0.275, 1.0, 0, 0.9)
  for (const z of [-0.2, 0.2]) {
    s.cyl(0.008, 0.008, 0.16, DARK, 0.6, 0.72, z, false, 6)
    s.ball(0.05, '#d8d4c4', 0.62, 0.8, z, 1, 1, 0.9)
    s.box(0.012, 0.07, 0.07, '#f0e6b8', 0.668, 0.8, z)
  }
  // a toolbox and the lift arms behind
  s.box(0.16, 0.07, 0.1, p.frame, -0.3, 0.6, -0.17)
  for (const z of [-0.14, 0.14]) s.box(0.3, 0.03, 0.03, STEEL, -0.72, 0.42, z, 0.12)
  return s.done()
}

const HINGE = { x: -0.08, y: 0.66 }

function hoodGeometry(p: Paint): BufferGeometry {
  // The hood, in the tractor's own space; it is hinged at HINGE and lifts when the engine is being seen to.
  const s = new Shop()
  s.rounded(0.82, 0.24, 0.33, 0.1, p.body, HINGE.x + 0.41, HINGE.y + 0.03, 0)
  for (let n = 0; n < 5; n++) for (const z of [-0.168, 0.168]) s.box(0.012, 0.09, 0.006, DARK, HINGE.x + 0.2 + n * 0.08, HINGE.y, z)
  return s.done()
}

function implementGeometry(kind: Implement): BufferGeometry | null {
  const s = new Shop()
  const green = '#4f6b46', deep = '#3c5335', white = '#e3dfd2', blue = '#5f7383', red = '#a8341f', board = '#9a8a6a'
  switch (kind) {
    case 'none': return null
    case 'planter':
      // four hoppers over four rows, each with its opener and its covering discs
      s.box(0.1, 0.08, 1.46, STEEL, -0.86, 0.36, 0)
      s.box(0.5, 0.05, 0.08, IRON, -0.8, 0.36, 0)
      for (const z of [-0.51, -0.17, 0.17, 0.51]) {
        s.rounded(0.3, 0.3, 0.26, 0.05, green, -1.02, 0.6, z)
        s.box(0.3, 0.02, 0.24, '#c7ab7a', -1.02, 0.752, z)
        s.box(0.05, 0.32, 0.04, IRON, -1.0, 0.3, z)
        s.box(0.3, 0.04, 0.04, IRON, -1.14, 0.2, z)
        for (const side of [-1, 1]) s.cyl(0.1, 0.1, 0.012, STEEL, -1.34, 0.11, z + side * 0.07, true, 10)
      }
      s.box(0.05, 0.05, 1.5, IRON, -1.22, 0.3, 0)
      break
    case 'hiller':
      s.box(0.1, 0.1, 1.5, '#a8341f', -0.9, 0.42, 0)
      s.box(0.2, 0.05, 0.3, IRON, -0.8, 0.44, 0)
      for (const z of [-0.68, -0.34, 0, 0.34, 0.68]) {
        s.box(0.05, 0.34, 0.05, IRON, -0.95, 0.26, z)
        // a pair of wings that throw the soil up to the row on either side
        for (const side of [-1, 1]) s.box(0.4, 0.24, 0.018, STEEL, -1.1, 0.14, z + side * 0.075, 0, side * 0.42)
      }
      break
    case 'sprayer':
      s.cyl(0.25, 0.25, 0.82, white, -0.96, 0.66, 0, true, 16)
      for (const z of [-0.41, 0.41]) s.ball(0.25, white, -0.96, 0.66, z, 1, 1, 0.3)
      s.box(0.36, 0.06, 0.6, IRON, -0.94, 0.38, 0)
      s.box(0.1, 0.14, 0.12, red, -0.72, 0.5, 0)
      s.box(0.05, 0.36, 0.05, IRON, -1.24, 0.56, 0)
      s.cyl(0.05, 0.05, 0.08, DARK, -0.96, 0.93, 0, false, 8)
      break
    case 'tank': {
      const barrel = new CylinderGeometry(0.34, 0.34, 1.2, 16)
      barrel.rotateZ(Math.PI / 2)
      s.add(barrel, blue, -1.55, 0.68, 0)
      for (const x of [-2.15, -0.95]) s.ball(0.34, blue, x, 0.68, 0, 0.25, 1, 1)
      for (const x of [-1.9, -1.2]) s.cyl(0.345, 0.345, 0.04, IRON, x, 0.68, 0, false, 16, Math.PI / 2)
      s.box(1.5, 0.06, 0.5, IRON, -1.5, 0.3, 0)
      s.box(0.5, 0.04, 0.06, IRON, -0.9, 0.3, 0)
      s.cyl(0.03, 0.03, 0.5, STEEL, -1.55, 1.2, 0)
      s.box(0.05, 0.05, 1.5, STEEL, -1.55, 1.44, 0)
      s.box(0.2, 0.16, 0.2, red, -0.98, 0.44, 0)
      break
    }
    case 'flail':
      s.rounded(0.6, 0.22, 1.46, 0.08, green, -1.08, 0.38, 0)
      s.box(0.2, 0.14, 1.46, deep, -1.42, 0.3, 0)
      s.cyl(0.11, 0.11, 1.38, DARK, -1.1, 0.22, 0, true, 8)
      s.box(0.4, 0.05, 0.08, IRON, -0.82, 0.42, 0)
      s.box(0.16, 0.12, 0.14, IRON, -0.84, 0.5, 0)
      break
    case 'digger':
      // a share that lifts the row, and the sides of the rattling chain that sifts the soil away
      for (const z of [-0.47, 0.47]) s.box(1.36, 0.22, 0.05, red, -1.5, 0.45, z, 0.3)
      s.box(1.3, 0.03, 0.9, STEEL, -1.5, 0.36, 0, 0.3)
      s.box(0.5, 0.05, 0.08, IRON, -0.84, 0.32, 0)
      s.box(0.18, 0.03, 0.9, STEEL, -0.87, 0.11, 0, -0.3)
      s.box(0.05, 0.3, 0.05, IRON, -1.9, 0.36, -0.5)
      s.box(0.05, 0.3, 0.05, IRON, -1.9, 0.36, 0.5)
      break
    case 'harvester':
      // the same share and chain, a cross elevator and a boom that drops the crop into barrels on a platform
      for (const z of [-0.47, 0.47]) s.box(1.5, 0.24, 0.05, red, -1.56, 0.5, z, 0.34)
      s.box(1.44, 0.03, 0.9, STEEL, -1.56, 0.4, 0, 0.34)
      s.box(0.5, 0.05, 0.08, IRON, -0.84, 0.32, 0)
      s.box(0.18, 0.03, 0.9, STEEL, -0.87, 0.11, 0, -0.3)
      s.box(0.5, 0.5, 1.2, red, -2.36, 0.72, 0.1)
      s.box(0.44, 0.06, 1.7, STEEL, -2.36, 1.0, 0.5)
      s.box(0.9, 0.06, 0.8, board, -2.4, 0.42, 1.0)
      for (const x of [-2.8, -2.0]) s.box(0.04, 0.5, 0.04, IRON, x, 0.66, 1.38)
      s.box(0.84, 0.04, 0.04, IRON, -2.4, 0.9, 1.38)
      break
    case 'trailer':
      // a flat rack for barrels: a bed of boards on a wagon frame, a headboard, stakes
      s.box(2.0, 0.05, 0.92, board, -1.92, 0.5, 0)
      for (const z of [-0.3, 0.3]) s.box(2.0, 0.07, 0.06, IRON, -1.92, 0.44, z)
      s.box(0.6, 0.04, 0.06, IRON, -0.72, 0.36, 0)
      s.box(0.05, 0.4, 0.92, board, -0.95, 0.72, 0)
      for (const x of [-2.86, -1.9]) for (const z of [-0.44, 0.44]) s.box(0.04, 0.28, 0.04, board, x, 0.66, z)
      for (const x of [-2.5, -1.3]) s.box(0.05, 0.05, 0.86, IRON, x, 0.26, 0)
      break
  }
  return s.done()
}

// A motor vehicle seen from the side, given width: the farm's stake truck, a neighbour's pickup, a buyer's car.
export type Motor = 'truck' | 'pickup' | 'sedan'
function motorGeometry(kind: Motor, paint: string): BufferGeometry {
  const s = new Shop()
  const chrome = '#b9bcbf', glass = '#1b2327', board = '#8f7f62'
  if (kind === 'sedan') {
    // a low rounded body, a turret top, a trunk
    s.profile([[-1.0, 0.2], [0.95, 0.2], [1.0, 0.36], [0.92, 0.5], [0.45, 0.56], [0.3, 0.6], [-0.62, 0.6], [-0.98, 0.5]], 0.78, 0.06, paint, 0, 0, 0)
    s.profile([[-0.56, 0.58], [0.26, 0.58], [0.1, 0.84], [-0.02, 0.88], [-0.34, 0.88], [-0.44, 0.84]], 0.68, 0.06, paint, 0, 0, 0)
    s.profile([[-0.5, 0.62], [0.2, 0.62], [0.07, 0.82], [-0.4, 0.82]], 0.7, 0, glass, 0, 0, 0)
    s.box(0.03, 0.2, 0.6, glass, 0.17, 0.72, 0, -0.55)
    for (const x of [0.62, -0.6]) for (const z of [-0.36, 0.36]) s.guard(0.2, 0.03, 0, Math.PI, 0.14, paint, x, 0.2, z)
    s.box(0.05, 0.05, 0.82, chrome, 1.0, 0.26, 0)
    s.box(0.05, 0.05, 0.82, chrome, -1.03, 0.26, 0)
    s.box(0.02, 0.14, 0.4, chrome, 0.99, 0.42, 0)
    for (const z of [-0.28, 0.28]) s.ball(0.05, '#f0e6b8', 0.94, 0.46, z, 0.5, 1, 1)
    return s.done()
  }
  const bed = kind === 'truck' ? TRUCK_MODEL.bed : 0.95, back = -0.2 - bed
  // the frame, the hood and its grille, the cab, the running boards and front mudguards
  s.box(bed + 1.5, 0.08, 0.34, DARK, back / 2 + 0.55, 0.3, 0)
  s.rounded(0.62, 0.3, 0.5, 0.11, paint, 0.74, 0.56, 0)
  s.box(0.03, 0.26, 0.4, DARK, 1.07, 0.54, 0)
  for (let n = 0; n < 5; n++) s.box(0.036, 0.014, 0.4, chrome, 1.072, 0.45 + n * 0.045, 0)
  s.profile([[-0.2, 0.34], [0.46, 0.34], [0.46, 0.7], [0.36, 0.74], [0.24, 1.0], [0.16, 1.04], [-0.16, 1.04], [-0.2, 1.0]], 0.76, 0.05, paint, 0, 0, 0)
  s.profile([[-0.14, 0.76], [0.3, 0.76], [0.2, 0.98], [-0.14, 0.98]], 0.78, 0, glass, 0, 0, 0)
  s.box(0.03, 0.22, 0.62, glass, 0.3, 0.87, 0, -0.42)
  for (const z of [-0.4, 0.4]) {
    s.guard(0.22, 0.03, -0.1, Math.PI * 0.95, 0.16, paint, 0.78, 0.22, z)
    s.box(0.62, 0.025, 0.12, DARK, 0.18, 0.3, z)
    s.ball(0.055, '#d8d4c4', 0.98, 0.56, z * 0.86, 0.7, 1, 1)
    s.box(0.012, 0.075, 0.075, '#f0e6b8', 1.02, 0.56, z * 0.86)
  }
  s.box(0.05, 0.06, 0.86, chrome, 1.12, 0.3, 0)
  if (kind === 'truck') {
    // the rack body: a floor of boards, a headboard, stake sides
    s.box(bed, 0.05, 0.96, board, -0.24 - bed / 2, 0.5, 0)
    for (const z of [-0.2, 0.2]) s.box(bed, 0.1, 0.06, DARK, -0.24 - bed / 2, 0.42, z)
    s.box(0.04, 0.5, 0.96, board, -0.26, 0.78, 0)
    for (let n = 0; n <= 4; n++) for (const z of [-0.47, 0.47]) s.box(0.04, 0.42, 0.03, board, -0.3 - (bed - 0.08) * n / 4, 0.72, z)
    for (const y of [0.68, 0.86]) for (const z of [-0.47, 0.47]) s.box(bed - 0.04, 0.07, 0.022, board, -0.26 - bed / 2, y, z)
  } else {
    s.box(bed, 0.04, 0.72, DARK, -0.22 - bed / 2, 0.44, 0)
    for (const z of [-0.37, 0.37]) s.box(bed, 0.26, 0.04, paint, -0.22 - bed / 2, 0.56, z)
    s.box(0.04, 0.26, 0.76, paint, back, 0.56, 0)
    for (const z of [-0.4, 0.4]) s.guard(0.22, 0.03, 0, Math.PI, 0.1, paint, -0.84, 0.22, z)
  }
  return s.done()
}

// The irrigation reel: a drum of hose on a cart at the field's edge, and the gun on its sled out in the crop.
export function reelGeometry(): BufferGeometry {
  const s = new Shop()
  const orange = '#b8642a'
  s.cyl(0.62, 0.62, 0.05, orange, 0, 0.82, -0.26, true, 18)
  s.cyl(0.62, 0.62, 0.05, orange, 0, 0.82, 0.26, true, 18)
  s.cyl(0.5, 0.5, 0.5, '#23262a', 0, 0.82, 0, true, 16)
  s.box(1.2, 0.07, 0.7, IRON, 0, 0.22, 0)
  for (const z of [-0.3, 0.3]) { s.box(0.07, 0.66, 0.05, IRON, -0.2, 0.52, z, 0.3); s.box(0.07, 0.66, 0.05, IRON, 0.2, 0.52, z, -0.3) }
  s.box(0.6, 0.05, 0.06, IRON, 0.86, 0.24, 0)
  return s.done()
}

const V = new Matrix4(), VQ = new Quaternion(), E = new Vector3(), E2 = new Vector3(), SEAT = new Matrix4()
const p0 = new Vector3(), p1 = new Vector3(), axle = new Vector3(), fwd = new Vector3(), up = new Vector3(), side = new Vector3(), spoke = new Vector3()
const CHAIN = new Color('#2a2a28'), LAMP = new Color(5.5, 4.4, 2.4), GREY = new Color('#8b8d88')
const pose = new Pose()

export interface MachineFrame {
  dt: number
  time: number
  particles: Particles
  dust: number             // 0 damp ground .. 1 dust-dry
  mud: number              // 0..1
  lamps: number            // how much the light wants lamps, 0..1
  sun: number              // how much direct sun there is to catch on glass and paint, 0..1
  still: boolean           // no smoke, no shake
  cold: boolean
}

// What a machine is doing this frame.
export interface MachineState {
  moved: number            // distance covered this frame
  turn: number             // how hard it is steering, -1..1
  working: number          // 0..1
  kind: JobKind | 'travel'
  driver: Dress | null
  load: number             // barrels aboard
  far: number              // 0 seen from close by .. 1 from across the farm, where it is found by what it leaves in the air
}

abstract class Machine {
  readonly group = new Group()
  x = 0
  z = 0
  y = 0
  heading = 0
  pitch = 0
  scale = 1
  travelled = 0
  protected puffAt = 0
  protected trail = 0
  protected running = 0
  protected rims: Color
  protected disposables: { dispose(): void }[] = []

  constructor(rim: string) {
    this.rims = new Color(rim)
  }

  place(x: number, y: number, z: number, heading: number, pitch: number, scale: number): void {
    this.x = x; this.y = y; this.z = z; this.heading = heading; this.pitch = pitch; this.scale = scale
    this.group.position.set(x, y, z)
    this.group.rotation.set(0, -heading, pitch, 'YXZ')
    this.group.scale.setScalar(scale)
    this.use()
  }

  // Makes this machine the one whose space the shared frame holds.
  protected use(): void {
    V.compose(E.set(this.x, this.y, this.z), VQ.setFromEuler(this.group.rotation), E2.set(this.scale, this.scale, this.scale))
    fwd.set(1, 0, 0).transformDirection(V)
    up.set(0, 1, 0).transformDirection(V)
    side.set(0, 0, 1).transformDirection(V)
  }

  // A point of the machine's own space, in the world.
  at(x: number, y: number, z: number, out: Vector3): Vector3 {
    return out.set(x, y, z).applyMatrix4(V)
  }

  // The same for whoever asks from outside, whichever machine was drawn last.
  point(x: number, y: number, z: number, out: Vector3): Vector3 {
    this.use()
    return this.at(x, y, z, out)
  }

  protected wheel(pr: Prims, shape: 'tyre' | 'tread', x: number, y: number, z: number, r: number, wide: number, steer = 0, rim = this.rims): void {
    this.at(x, y, z, p0)
    axle.copy(side).multiplyScalar(z < 0 ? -1 : 1)
    const a = -this.travelled / r * (z < 0 ? -1 : 1)
    spoke.copy(fwd).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a))
    if (steer) { axle.addScaledVector(fwd, (z < 0 ? 1 : -1) * Math.sin(steer)).normalize(); spoke.addScaledVector(axle, -spoke.dot(axle)).normalize() }
    const s = this.scale
    pr.put(shape, p0, axle, spoke, r * s, wide * s, r * s, rim)
  }

  protected seated(pr: Prims, f: MachineFrame, st: MachineState, x: number, y: number, z: number): void {
    if (!st.driver) return
    this.at(x, y, z, p0)
    SEAT.copy(V).scale(E.set(1.16, 1.16, 1.16)).setPosition(p0)
    const bounce = st.moved > 0 && !f.still ? Math.sin(this.travelled * 9) * 0.006 : 0
    drawFigure(pr, SEAT, st.driver, drive(pose, f.time, st.turn, bounce))
  }

  protected lamp(pr: Prims, f: MachineFrame, x: number, y: number, z: number, r: number, far = 0): void {
    if (f.lamps < 0.05) return
    this.at(x, y, z, p0)
    // (from across the farm a lamp is a point of light a few pixels wide, as it is to the eye)
    const s = r * this.scale * (1 + 5 * far)
    pr.put('glow', p0, up, fwd, s * 0.5, s, s, LAMPC.copy(LAMP).multiplyScalar(f.lamps))
  }

  // The exhaust, and what the wheels throw up. (sx, sy, sz): the stack's mouth; back: where the back wheels are.
  // Sizes are metres, and what is left in the air is laid down by the distance covered as well as by time, so that a
  // machine at work can be found from across the farm by the dust hanging along the way it went, at any clock speed.
  protected fumes(f: MachineFrame, st: MachineState, sx: number, sy: number, sz: number, back: number, half: number): void {
    if (f.still) { this.running = 0; return }
    const speed = f.dt > 0 ? st.moved / f.dt : 0
    const on = speed > 0.3 || st.working > 0
    const r = Math.random, pt = f.particles
    if (on && this.running <= 0) {
      // the engine catches: a dark cough that stands over the machine for a few seconds, taller on a cold morning
      this.at(sx, sy, sz, p0)
      for (let n = 0; n < (f.cold ? 10 : 5); n++) {
        const up = r() * (f.cold ? 7 : 3.5)
        pt.emit(p0.x + (r() - 0.5) * 0.5, p0.y + up, p0.z + (r() - 0.5) * 0.5, 0, 0.8, 0, 0.3 + 0.14 * up, 0.45, 2.5 + r() * 2.5, 0.17, 0.17, 0.18, f.cold ? 0.55 : 0.4, 0.45 + up / 14)
      }
    }
    this.running = on ? 1.5 : Math.max(0, this.running - f.dt)
    this.puffAt += f.dt
    if (on && speed < 12 && this.puffAt > 0.09) {
      this.puffAt = 0
      this.at(sx, sy, sz, p0)
      // (under load, and seen from far off: a darker column that stands a few seconds over where the machine is)
      const far = st.far * (st.working > 0 ? 1 : 0.4)
      pt.emit(p0.x, p0.y, p0.z, 0, 1.1 + r() * 0.5 + 1.2 * far, 0, 0.12 + 0.45 * far, 0.7 + 0.5 * far, (1.2 + r() * 0.8) * (1 + 1.3 * far), 0.3 - 0.08 * far, 0.3 - 0.08 * far, 0.32 - 0.08 * far, (f.cold ? 0.42 : 0.26) + 0.2 * far, 0.6)
      // mud flung off the tyres on a wet day: dark, heavy, soon down
      if (f.mud > 0.3 && speed > 0.5 && r() < f.mud * 0.5) {
        this.at(back - 0.1, 0.2, r() < 0.5 ? -half : half, p0)
        pt.emit(p0.x, p0.y, p0.z, -fwd.x * (0.6 + r()), 0.9 + r() * 0.8, -fwd.z * (0.6 + r()), 0.1, 0.03, 0.5 + r() * 0.3, 0.17, 0.12, 0.09, 0.9, 0.05)
      }
    }
    if (speed <= 1.5) { this.trail = 0; return }
    this.trail += st.moved
    const dust = Math.max(f.dust, st.working > 0 && (st.kind === 'plant' || st.kind === 'hill' || st.kind === 'dig') ? 0.5 + 0.3 * f.dust : 0) * (1 - f.mud)
    let guard = 0
    // closer together at a working pace, when each puff is all there is to see of it
    const every = speed < 12 ? 2.5 : 6
    while (this.trail > every && guard++ < 14) {
      this.trail -= every
      if (speed >= 12 && r() < 0.5) {
        // exhaust left standing along the way
        this.at(sx, sy, sz, p0)
        pt.emit(p0.x - fwd.x * this.trail, p0.y + 1 + r() * 2, p0.z - fwd.z * this.trail, 0, 0.6, 0, 0.9, 0.7, 2.5 + r() * 2, 0.3, 0.3, 0.32, 0.22, 0.6)
      }
      if (dust < 0.06) continue
      // where the back wheels were that far back along the way it came
      const bx = this.x - fwd.x * (this.trail + 1.5), bz = this.z - fwd.z * (this.trail + 1.5)
      const soil = st.working > 0
      // (hurrying, the puffs are far apart: each is wider and thinner, so they run together into a haze along the way)
      const fast = speed >= 12 ? 1 : 0
      pt.emit(bx + (r() - 0.5) * 1.6, this.y + 0.9 + fast + 0.8 * st.far, bz + (r() - 0.5) * 1.6, (r() - 0.5) * 0.5, 0.6 + r() * 0.6, (r() - 0.5) * 0.5, (1.6 + r() * 0.9) * (1 + 0.9 * st.far) + 2.2 * fast, 0.42 + r() * 0.2, (5 + r() * 4) * (1 + 0.4 * st.far),
        soil ? 0.72 : 0.78, soil ? 0.62 : 0.7, soil ? 0.5 : 0.58, Math.min(0.85, (0.62 - 0.36 * fast) * Math.min(1, dust * 1.4) * (1 + 0.35 * st.far)), 0.55)
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}

const LAMPC = new Color()

export class Tractor extends Machine {
  current: Implement = 'none'
  private hood: Group
  private impl: Mesh
  private implGeo = new Map<Implement, BufferGeometry | null>()
  private hitch = new Group()
  // 0 lowered into work .. 1 carried
  private lift = 1
  private near = 0
  private wake = 0
  private hoodUp = 0
  broken = false

  constructor(paint: Paint) {
    super(paint.rim)
    const mat = machineMaterial()
    const body = new Mesh(tractorBody(paint), mat)
    const hood = new Mesh(hoodGeometry(paint), mat)
    this.hood = new Group()
    this.hood.position.set(HINGE.x, HINGE.y, 0)
    hood.position.set(-HINGE.x, -HINGE.y, 0)
    this.hood.add(hood)
    this.hitch.position.set(-0.78, 0.4, 0)
    this.impl = new Mesh(body.geometry, mat)
    this.impl.position.set(0.78, -0.4, 0)
    this.impl.visible = false
    this.hitch.add(this.impl)
    this.group.add(body, this.hood, this.hitch)
    for (const m of [body, hood, this.impl]) { m.castShadow = true; m.receiveShadow = true; m.layers.enable(1); m.layers.enable(3) }
    this.disposables.push(body.geometry, hood.geometry)
  }

  setImplement(name: Implement): void {
    if (name === this.current) return
    this.current = name
    if (!this.implGeo.has(name)) {
      const g = implementGeometry(name)
      this.implGeo.set(name, g)
      if (g) this.disposables.push(g)
    }
    const g = this.implGeo.get(name) ?? null
    this.impl.visible = !!g
    if (g) this.impl.geometry = g
  }

  // Draws the wheels, the driver and the implement's moving parts, and leaves what the machine leaves in the air.
  draw(pr: Prims, f: MachineFrame, st: MachineState): void {
    this.use()
    this.travelled += st.moved
    const s = this.scale
    const lifted = this.current === 'hiller' || this.current === 'sprayer' || this.current === 'flail'
    this.lift += ((st.working > 0 ? 0 : 1) - this.lift) * Math.min(1, f.dt * 4)
    this.hitch.rotation.z = lifted ? -this.lift * 0.2 : this.current === 'digger' || this.current === 'harvester' ? -this.lift * 0.07 : 0
    this.hoodUp += ((this.broken ? 1 : 0) - this.hoodUp) * Math.min(1, f.dt * 3)
    this.hood.rotation.z = this.hoodUp * 0.95
    const shake = st.moved > 0 && !f.still ? Math.sin(this.travelled * 31) * 0.004 : 0
    this.group.position.y = this.y + shake
    for (const z of [-TRACTOR_MODEL.track, TRACTOR_MODEL.track]) this.wheel(pr, 'tread', TRACTOR_MODEL.axle, TRACTOR_MODEL.wheel, z, TRACTOR_MODEL.wheel, TRACTOR_MODEL.tyre)
    for (const z of [-0.31, 0.31]) this.wheel(pr, 'tyre', 0.62, 0.2, z, 0.2, 0.1, -st.turn * 0.5)
    this.seated(pr, f, st, -0.44, 0.8, 0)
    // lamps are lit only with someone at the wheel
    if (st.driver) for (const z of [-0.2, 0.2]) this.lamp(pr, f, 0.675, 0.8, z, 0.05, st.far)
    // From across the farm, in sun: the light it catches as it goes, a glint that comes and goes with the ground.
    if (st.driver && st.far > 0.15 && f.sun > 0.2 && (st.moved > 0 || st.working > 0)) {
      const k = 0.5 + 0.5 * Math.sin(this.travelled * 0.9)
      if (k > 0.35) {
        this.at(0.3, 1.05, 0, p0)
        const g = 0.7 * st.far * s
        pr.put('glow', p0, up, fwd, g, g, g, LAMPC.set(3.4, 3.2, 2.7).multiplyScalar(f.sun * st.far * k))
      }
    }
    const w = st.working
    switch (this.current) {
      case 'planter':
        for (const z of [-0.51, -0.17, 0.17, 0.51]) this.wheel(pr, 'tyre', -1.5, 0.14, z + 0.001, 0.14, 0.07, 0, GREY)
        break
      case 'sprayer': {
        // the boom: carried folded up, let down across eight rows for the work
        const fold = this.lift * 1.25, c = Math.cos(fold), sn = Math.sin(fold)
        for (const sd of [-1, 1]) {
          this.at(-1.24, 0.56, sd * 0.06, p0)
          this.at(-1.24, 0.56 + 1.4 * sn, sd * (0.06 + 1.4 * c), p1)
          pr.rod('cyl', p0, p1, 0.02 * s, GREY)
          for (let n = 1; n <= 4; n++) {
            const u = n / 4 * 1.38
            this.at(-1.24, 0.56 + u * sn, sd * (0.06 + u * c), p0)
            this.at(-1.24, 0.47 + u * sn, sd * (0.06 + u * c), p1)
            pr.rod('cyl', p0, p1, 0.012 * s, CHAIN)
          }
        }
        break
      }
      case 'tank':
        for (const z of [-0.36, 0.36]) this.wheel(pr, 'tyre', -1.6, 0.2, z, 0.2, 0.1, 0, GREY)
        break
      case 'digger':
      case 'harvester': {
        const len = this.current === 'digger' ? 1.3 : 1.44, x0 = this.current === 'digger' ? -1.5 : -1.56, tilt = this.current === 'digger' ? 0.3 : 0.34, y0 = this.current === 'digger' ? 0.38 : 0.42
        for (let n = 0; n < 10; n++) {
          const u = ((n / 10 + this.travelled * 0.7) % 1 + 1) % 1 - 0.5
          this.at(x0 - u * len * Math.cos(tilt), y0 - 0.0 + u * len * Math.sin(tilt) * -1 + 0.03, -0.44, p0)
          this.at(x0 - u * len * Math.cos(tilt), y0 + u * len * Math.sin(tilt) * -1 + 0.03, 0.44, p1)
          pr.rod('cyl', p0, p1, 0.014 * s, CHAIN)
        }
        for (const z of [-0.56, 0.56]) this.wheel(pr, 'tyre', -1.9, 0.22, z, 0.22, 0.09, 0, GREY)
        if (this.current === 'harvester') {
          this.wheel(pr, 'tyre', -2.4, 0.2, 1.4, 0.2, 0.09, 0, GREY)
          for (let n = 0; n < 2; n++) { this.at(-2.62 + n * 0.44, 0.45, 1.05, p0); pr.put('barrel', p0, up, fwd, 0.4 * s, 0.4 * s, 0.4 * s, COLORS.WHITE) }
        }
        break
      }
      case 'trailer': {
        for (const x of [-2.5, -1.3]) for (const z of [-0.47, 0.47]) this.wheel(pr, 'tyre', x, 0.2, z, 0.2, 0.09, 0, GREY)
        this.barrels(pr, st.load, -1.18, 0.525, 4, 2, 0.42, 0.38)
        break
      }
    }
    this.fumes(f, st, 0.42, 1.27, 0.09, -0.7, 0.36)
    if (f.still || w <= 0) return
    this.puffWork(f, st)
  }

  // Barrels standing in rows on a bed, from the front back.
  barrels(pr: Prims, n: number, x0: number, y: number, rows: number, across: number, dx: number, dz: number): void {
    const s = this.scale
    for (let k = 0; k < Math.min(n, rows * across * 2); k++) {
      const tier = Math.floor(k / (rows * across)), i = k % (rows * across)
      const row = Math.floor(i / across), col = i % across
      this.at(x0 - row * dx - tier * 0.1, y + tier * 0.4, (col - (across - 1) / 2) * dz, p0)
      pr.put('barrel', p0, up, fwd, 0.4 * s, 0.4 * s, 0.4 * s, COLORS.WHITE)
    }
  }

  private puffWork(f: MachineFrame, st: MachineState): void {
    const r = Math.random, pt = f.particles
    const emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, grow: number, life: number, cr: number, cg: number, cb: number, alpha: number, drift: number) => {
      this.at(x, y, z, p0)
      pt.emit(p0.x, p0.y, p0.z, fwd.x * vx + side.x * vz, vy, fwd.z * vx + side.z * vz, size, grow, life, cr, cg, cb, alpha, drift)
    }
    const speed = f.dt > 0 ? st.moved / f.dt : 0
    // Close to: fine spray under the boom, water thrown from the tank's pipe, chaff, turned earth.
    this.near += f.dt
    if (speed < 12 && this.near > 0.06) {
      this.near = 0
      if (st.kind === 'spray') for (let m = 0; m < 2; m++) emit(-1.26, 0.42, (r() - 0.5) * 2.9, -0.25, -0.05 + r() * 0.1, 0, 0.24, 0.9, 1.5 + r() * 1.4, 0.88, 0.92, 0.94, 0.26, 0.95)
      else if (st.kind === 'water') for (const sd of [-1, 1]) emit(-1.55, 1.46, sd * 0.8, 0, 1 + r(), sd * (3.4 + 2 * r()), 0.2, 1.1, 1.3 + r() * 0.5, 0.8, 0.86, 0.9, 0.34, 0.5)
      else if (st.kind === 'kill') emit(-1.5, 0.2, (r() - 0.5) * 1.3, -(1.2 + r()), 0.8 + r(), 0, 0.2, 0.5, 0.9 + r() * 0.5, 0.5, 0.52, 0.3, 0.42, 0.4)
      else if (st.kind === 'dig' && r() < 0.6) emit(-1.9, 0.16, (r() - 0.5) * 1.1, -0.6, 0.6 + r() * 0.6, 0, 0.25, 0.6, 1.2 + r(), 0.42, 0.31, 0.24, 0.3, 0.3)
    }
    // From far off: a drift hanging over the rows just worked, going with the wind; wider, denser and longer in the
    // air the further off it is seen from, so the work is found from the far side of the farm.
    this.wake += st.moved
    let guard = 0
    const far = st.far, wide = 1 + 0.9 * far, long = 1 + 0.5 * far, dense = 1 + 0.7 * far
    while (this.wake > 4 && guard++ < 16) {
      this.wake -= 4
      const bx = -1.3 - this.wake / this.scale
      if (st.kind === 'spray') for (const z of [-0.9, 0.9]) emit(bx, 0.7 + 0.5 * far, z + (r() - 0.5) * 0.8, 0, 0.2, 0, (2.0 + r() * 0.8) * wide, 0.6, (5 + r() * 4) * long, 0.92, 0.95, 0.97, 0.26 * dense, 0.95)
      else if (st.kind === 'water') emit(bx, 0.9 + 0.5 * far, (r() - 0.5) * 3, 0, 0.3, 0, 1.6 * wide, 0.6, (3 + r() * 2) * long, 0.84, 0.89, 0.93, 0.2 * dense, 0.7)
      else if (st.kind === 'kill') emit(bx, 0.6 + 0.5 * far, (r() - 0.5) * 1.3, 0, 0.5, 0, 1.5 * wide, 0.5, (4 + r() * 3) * long, 0.62, 0.6, 0.36, 0.34 * dense, 0.5)
      // (on ground too damp for dust the planter, the hiller and the digger still leave the haze of turned earth)
      else if ((st.kind === 'plant' || st.kind === 'hill' || st.kind === 'dig') && f.dust * (1 - f.mud) < 0.2 && far > 0.1) emit(bx, 0.7 + 0.5 * far, (r() - 0.5) * 1.6, 0, 0.3, 0, 1.3 * wide, 0.45, (3.5 + r() * 2.5) * long, 0.5, 0.42, 0.34, 0.3 * far * (1 - 0.6 * f.mud), 0.4)
    }
  }
}

// An implement the farm owns, standing in the yard while no tractor has it on: the harvester, the sprayer with its
// boom folded up, the irrigation reel.
export type YardKind = 'harvester' | 'sprayer' | 'reel'
export class Yarded extends Machine {
  readonly kind: YardKind
  // how far the model is carried forward so that it stands over its spot, and how far it is let down onto the grass
  private dx: number

  constructor(kind: YardKind) {
    super('#8b8d88')
    this.kind = kind
    this.dx = kind === 'harvester' ? 1.8 : kind === 'sprayer' ? 1.0 : 0
    const mesh = new Mesh(kind === 'reel' ? reelGeometry() : implementGeometry(kind)!, machineMaterial())
    mesh.position.set(this.dx, kind === 'sprayer' ? -0.3 : 0, 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.layers.enable(1)
    mesh.layers.enable(3)
    this.group.add(mesh)
    this.disposables.push(mesh.geometry)
  }

  draw(pr: Prims): void {
    this.use()
    const s = this.scale, dx = this.dx
    if (this.kind === 'harvester') {
      for (const z of [-0.56, 0.56]) this.wheel(pr, 'tyre', -1.9 + dx, 0.22, z, 0.22, 0.09, 0, GREY)
      this.wheel(pr, 'tyre', -2.4 + dx, 0.2, 1.4, 0.2, 0.09, 0, GREY)
    } else if (this.kind === 'sprayer') {
      for (const sd of [-1, 1]) {
        this.at(-1.24 + dx, 0.26, sd * 0.06, p0)
        this.at(-1.24 + dx, 0.26 + 1.4 * Math.sin(1.25), sd * (0.06 + 1.4 * Math.cos(1.25)), p1)
        pr.rod('cyl', p0, p1, 0.02 * s, GREY)
      }
    } else {
      for (const z of [-0.4, 0.4]) this.wheel(pr, 'tyre', -0.15, 0.2, z, 0.2, 0.09, 0, GREY)
    }
  }
}

// The farm's truck, a neighbour's pickup or a buyer's car.
export class Car extends Machine {
  readonly kind: Motor
  private stack: [number, number, number]

  constructor(kind: Motor, paint: string, rim = '#c9c4b4') {
    super(rim)
    this.kind = kind
    const body = new Mesh(motorGeometry(kind, paint), machineMaterial())
    body.castShadow = true
    body.receiveShadow = true
    body.layers.enable(1)
    body.layers.enable(3)
    this.group.add(body)
    this.disposables.push(body.geometry)
    this.stack = kind === 'sedan' ? [-1.02, 0.2, 0.25] : [-0.3, 0.26, 0.3]
  }

  draw(pr: Prims, f: MachineFrame, st: MachineState): void {
    this.use()
    this.travelled += st.moved
    const sedan = this.kind === 'sedan'
    const r = sedan ? 0.19 : 0.21, front = sedan ? 0.62 : 0.78, half = sedan ? 0.36 : 0.4
    const back = sedan ? -0.6 : this.kind === 'truck' ? -1.32 : -0.84
    for (const z of [-half, half]) {
      this.wheel(pr, 'tyre', front, r, z, r, 0.11, -st.turn * 0.45)
      this.wheel(pr, 'tyre', back, r, z, r, this.kind === 'truck' ? 0.2 : 0.11)
    }
    // (low enough that a hat clears the cab's roof)
    if (st.driver) this.seated(pr, f, st, sedan ? -0.14 : 0.02, sedan ? 0.3 : 0.4, -0.17)
    if (st.driver) for (const z of [-0.34, 0.34]) this.lamp(pr, f, sedan ? 0.97 : 1.03, sedan ? 0.46 : 0.56, sedan ? z * 0.82 : z, 0.055)
    if (this.kind === 'truck') {
      const s = this.scale
      for (let k = 0; k < Math.min(st.load, 16); k++) {
        const tier = Math.floor(k / 8), i = k % 8
        this.at(-0.5 - Math.floor(i / 2) * 0.37 - tier * 0.12, 0.525 + tier * 0.4, (i % 2 - 0.5) * 0.4, p0)
        pr.put('barrel', p0, up, fwd, 0.4 * s, 0.4 * s, 0.4 * s, COLORS.WHITE)
      }
    }
    this.fumes(f, st, this.stack[0], this.stack[1], this.stack[2], back, half)
  }
}
