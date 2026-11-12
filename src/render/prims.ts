// Everything that moves on the farm (people, animals, wheels, tools, loads) is put together from a few shapes, each
// one instanced mesh: a part is a shape, a place and a colour, set afresh every frame. However many people and
// machines are at work, they cost these few draws.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh,
  LatheGeometry, Matrix4, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector2, Vector3, type Material,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { UI_GAIN } from './fields.ts'
import { patch } from './shaders.ts'

export type Shape =
  | 'box' | 'cyl' | 'taper' | 'ball' | 'dome' | 'cone' | 'torso' | 'tyre' | 'tread' | 'barrel' | 'bough' | 'log' | 'glow'

// How many of each a frame may hold.
const ROOM: Record<Shape, number> = {
  box: 2600, cyl: 2600, taper: 1400, ball: 2200, dome: 400, cone: 260, torso: 120, tyre: 60, tread: 24, barrel: 260, bough: 120, log: 90, glow: 60,
}

function paint(g: BufferGeometry, colour: (x: number, y: number, z: number) => [number, number, number]): BufferGeometry {
  const p = g.getAttribute('position') as BufferAttribute
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) c.set(colour(p.getX(i), p.getY(i), p.getZ(i)), i * 3)
  g.setAttribute('color', new BufferAttribute(c, 3))
  return g
}
const WHITE = (): [number, number, number] => [1, 1, 1]

function bare(g: BufferGeometry): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g
  for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') flat.deleteAttribute(name)
  return flat
}

// A trunk: an ellipse lofted from the hips (y = 0) to the shoulders (y = 1), front toward +x, a unit wide and deep.
function torsoGeometry(): BufferGeometry {
  const rings: [number, number, number][] = [   // y, depth, width
    [0, 0.72, 0.8], [0.14, 0.8, 0.84], [0.4, 0.72, 0.76], [0.66, 0.86, 0.9], [0.86, 0.9, 1], [0.96, 0.7, 0.94], [1.02, 0.36, 0.5],
  ]
  const N = 10
  const pos: number[] = []
  const at = (r: number, k: number): [number, number, number] => {
    const [y, d, w] = rings[r], a = (k / N) * Math.PI * 2
    // the chest stands a little proud of the back
    return [Math.cos(a) * d * 0.5 + (y > 0.5 && y < 0.95 ? 0.04 : 0), y, Math.sin(a) * w * 0.5]
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < N; k++) {
      const a = at(r, k), b = at(r, k + 1), c = at(r + 1, k), d = at(r + 1, k + 1)
      pos.push(...a, ...c, ...b, ...b, ...c, ...d)
    }
  }
  const top = rings.length - 1
  for (let k = 0; k < N; k++) pos.push(0, rings[top][0], 0, ...at(top, k + 1), ...at(top, k), 0, 0, 0, ...at(0, k), ...at(0, k + 1))
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  const merged = mergeVerts(g)
  merged.computeVertexNormals()
  return paint(bare(merged), WHITE)
}

// Welds a triangle soup so that its normals come out smooth.
function mergeVerts(g: BufferGeometry): BufferGeometry {
  const p = g.getAttribute('position') as BufferAttribute
  const seen = new Map<string, number>()
  const pos: number[] = [], index: number[] = []
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`
    let k = seen.get(key)
    if (k === undefined) { k = pos.length / 3; seen.set(key, k); pos.push(p.getX(i), p.getY(i), p.getZ(i)) }
    index.push(k)
  }
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(index)
  return g
}

// A wheel about the y axis, a unit in radius and a unit wide: black rubber with a rounded shoulder, and a dished rim
// that takes the part's colour. `lugs`: the chevrons of a drive tyre.
function wheelGeometry(lugs: number): BufferGeometry {
  const rubber = (x: number, _y: number, z: number): [number, number, number] => (Math.hypot(x, z) > 0.6 ? [0.022, 0.021, 0.02] : [1, 1, 1])
  const prof = [
    new Vector2(0.58, -0.5), new Vector2(0.86, -0.5), new Vector2(1, -0.3), new Vector2(1, 0.3), new Vector2(0.86, 0.5), new Vector2(0.58, 0.5),
    new Vector2(0.56, 0.3), new Vector2(0.2, 0.12), new Vector2(0.16, 0.34), new Vector2(0, 0.34),
  ]
  const parts: BufferGeometry[] = [bare(new LatheGeometry(prof, 18))]
  const back = new CylinderGeometry(0.57, 0.57, 0.1, 14)
  back.translate(0, -0.3, 0)
  parts.push(bare(back))
  for (let k = 0; k < lugs; k++) {
    const a = (k / lugs) * Math.PI * 2
    for (const side of [-1, 1]) {
      const lug = new BoxGeometry(0.2, 0.52, 0.075)
      lug.rotateX(side * 0.5)
      lug.translate(0.97, side * 0.24, 0)
      lug.rotateY(a + (side > 0 ? Math.PI / lugs : 0))
      parts.push(bare(lug))
    }
  }
  const g = mergeGeometries(parts)!
  for (const p of parts) p.dispose()
  return paint(g, rubber)
}

// A cedar potato barrel standing on y = 0, a unit tall: staves, two dark hoops, an open top with the crop showing.
function barrelGeometry(): BufferGeometry {
  const prof = [new Vector2(0, 0), new Vector2(0.34, 0), new Vector2(0.4, 0.26), new Vector2(0.42, 0.5), new Vector2(0.4, 0.74), new Vector2(0.34, 1), new Vector2(0.3, 1), new Vector2(0.3, 0.9), new Vector2(0, 0.9)]
  return paint(bare(new LatheGeometry(prof, 12)), (x, y, z) => {
    const rad = Math.hypot(x, z)
    if (y > 0.86 && rad < 0.32) return [0.6, 0.46, 0.27]
    if (Math.abs(y - 0.26) < 0.035 || Math.abs(y - 0.74) < 0.035) return [0.05, 0.04, 0.035]
    const stave = 0.9 + 0.2 * Math.abs(Math.sin(Math.atan2(z, x) * 6))
    return [0.34 * stave, 0.235 * stave, 0.13 * stave]
  })
}

// A spruce bough tier: a ragged skirt of needles, a unit across at its foot and a unit tall.
function boughGeometry(): BufferGeometry {
  const g = new ConeGeometry(0.5, 1, 9, 2, true)
  g.translate(0, 0.5, 0)
  const p = g.getAttribute('position') as BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i)
    const k = y < 0.01 ? 1 + 0.22 * Math.sin(a * 4.5) : y < 0.6 ? 1.12 : 1
    p.setXYZ(i, p.getX(i) * k, y - (y < 0.01 ? 0.1 * Math.cos(a * 4.5) : 0), p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return paint(bare(g), (_x, y) => { const v = 0.62 + 0.5 * y; return [v, v, v] })
}

// A log lying along y, a unit long and a unit through: bark, and the pale wood of the sawn ends.
function logGeometry(): BufferGeometry {
  const g = new CylinderGeometry(0.5, 0.5, 1, 9)
  g.translate(0, 0.5, 0)
  return paint(bare(g), (x, y, z) => (y < 0.001 || y > 0.999) && Math.hypot(x, z) < 0.49 ? [0.72, 0.56, 0.33] : (y < 0.001 || y > 0.999 ? [0.2, 0.15, 0.1] : [0.21, 0.16, 0.115]))
}

function shapeGeometry(s: Shape): BufferGeometry {
  switch (s) {
    case 'box': { const g = new BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return paint(bare(g), WHITE) }
    case 'cyl': { const g = new CylinderGeometry(1, 1, 1, 10); g.translate(0, 0.5, 0); return paint(bare(g), WHITE) }
    case 'taper': { const g = new CylinderGeometry(0.72, 1, 1, 10); g.translate(0, 0.5, 0); return paint(bare(g), WHITE) }
    case 'ball': return paint(bare(new SphereGeometry(1, 12, 8)), WHITE)
    case 'glow': return paint(bare(new SphereGeometry(1, 8, 6)), WHITE)
    case 'dome': return paint(bare(new SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2)), WHITE)
    case 'cone': { const g = new ConeGeometry(1, 1, 9); g.translate(0, 0.5, 0); return paint(bare(g), WHITE) }
    case 'torso': return torsoGeometry()
    case 'tyre': return wheelGeometry(0)
    case 'tread': return wheelGeometry(11)
    case 'barrel': return barrelGeometry()
    case 'bough': return boughGeometry()
    case 'log': return logGeometry()
  }
}

const SHAPES: Shape[] = ['box', 'cyl', 'taper', 'ball', 'dome', 'cone', 'torso', 'tyre', 'tread', 'barrel', 'bough', 'log', 'glow']

export class Prims {
  readonly group = new Group()
  private mesh = {} as Record<Shape, InstancedMesh>
  private n = {} as Record<Shape, number>
  private was = {} as Record<Shape, number>
  private mats: Material[] = []
  private m = new Matrix4()
  private x = new Vector3()
  private y = new Vector3()
  private z = new Vector3()
  private c = new Color()
  // Parts drawn this frame, for the tools.
  count = 0

  constructor() {
    const cloth = patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.86, metalness: 0 }), { key: 'county-prims', shine: 0.5 })
    const glow = new MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false })
    this.mats.push(cloth, glow)
    for (const s of SHAPES) {
      const mesh = new InstancedMesh(shapeGeometry(s), s === 'glow' ? glow : cloth, ROOM[s])
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.setColorAt(0, this.c.set(1, 1, 1))
      mesh.instanceColor!.setUsage(DynamicDrawUsage)
      mesh.count = 0
      mesh.frustumCulled = false
      mesh.castShadow = s !== 'glow'
      mesh.receiveShadow = s !== 'glow'
      mesh.layers.enable(1)
      mesh.layers.enable(3)
      this.mesh[s] = mesh
      this.n[s] = 0
      this.was[s] = 0
      this.group.add(mesh)
    }
  }

  begin(): void {
    for (const s of SHAPES) this.n[s] = 0
  }

  // A part with its foot at `o`, its own y axis along `up` (`sy` long), turned so its x axis lies toward `fwd`.
  put(s: Shape, o: Vector3, up: Vector3, fwd: Vector3, sx: number, sy: number, sz: number, c: Color): void {
    const k = this.n[s]
    if (k >= ROOM[s]) return
    const y = this.y.copy(up)
    const l = y.length()
    if (l < 1e-6) y.set(0, 1, 0)
    else y.multiplyScalar(1 / l)
    const z = this.z.crossVectors(fwd, y)
    if (z.lengthSq() < 1e-8) z.crossVectors(Math.abs(y.y) < 0.9 ? this.x.set(0, 1, 0) : this.x.set(1, 0, 0), y)
    z.normalize()
    const x = this.x.crossVectors(y, z)
    const e = this.m.elements
    e[0] = x.x * sx; e[1] = x.y * sx; e[2] = x.z * sx; e[3] = 0
    e[4] = y.x * sy; e[5] = y.y * sy; e[6] = y.z * sy; e[7] = 0
    e[8] = z.x * sz; e[9] = z.y * sz; e[10] = z.z * sz; e[11] = 0
    e[12] = o.x; e[13] = o.y; e[14] = o.z; e[15] = 1
    const mesh = this.mesh[s]
    mesh.setMatrixAt(k, this.m)
    if (s === 'glow') mesh.setColorAt(k, this.c.copy(c).multiplyScalar(UI_GAIN.value))
    else mesh.setColorAt(k, c)
    this.n[s] = k + 1
  }

  // A round part from a to b, `r` thick.
  rod(s: Shape, a: Vector3, b: Vector3, r: number, c: Color): void {
    const up = ROD.subVectors(b, a)
    this.put(s, a, up, Math.abs(up.y) > Math.abs(up.x) ? AX : AY, r, up.length(), r, c)
  }

  // A part centred on p, standing upright in the world.
  blob(s: Shape, p: Vector3, sx: number, sy: number, sz: number, c: Color): void {
    this.put(s, p, AY, AX, sx, sy, sz, c)
  }

  end(): void {
    let total = 0
    for (const s of SHAPES) {
      const mesh = this.mesh[s], n = this.n[s]
      mesh.count = n
      total += n
      if (n > 0 || this.was[s] > 0) {
        for (const a of [mesh.instanceMatrix, mesh.instanceColor!]) {
          a.clearUpdateRanges()
          a.addUpdateRange(0, Math.max(1, n) * a.itemSize)
          a.needsUpdate = true
        }
      }
      this.was[s] = n
    }
    this.count = total
  }

  dispose(): void {
    for (const s of SHAPES) { this.mesh[s].geometry.dispose(); this.mesh[s].dispose() }
    for (const m of this.mats) m.dispose()
  }
}

const ROD = new Vector3()
const AX = new Vector3(1, 0, 0)
const AY = new Vector3(0, 1, 0)
