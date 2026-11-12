// Dig day: tubers thrown up behind the digger onto the turned soil, lying in the row until they are picked into
// the barrels that stand in ranks across the field. And the test dig: one hill's own tubers laid out beside it.
import {
  BufferAttribute, Color, DynamicDrawUsage, InstancedMesh, LatheGeometry, Matrix4, MeshStandardMaterial, Quaternion, Group, Vector2, Vector3,
} from 'three'
import { COLS, FIELD_COUNT, HILLS, variety, type VarietyId } from '../sim/index.ts'
import { RIDGE_AMP } from './fields.ts'
import { tuberGeometry } from './geometry.ts'
import { fieldBaseY, hillPos } from './layout.ts'
import { hash2, rng } from './noise.ts'
import { patch } from './shaders.ts'

const MAX_TUBERS = 3600
const MAX_BARRELS = 220
const FLIGHT = 0.55

interface Tuber {
  field: number; hill: number
  t: number                        // seconds since thrown
  life: number                     // seconds lying before being picked
  fx: number; fy: number; fz: number
  tx: number; ty: number; tz: number
  sx: number; sy: number; sz: number
  rot: Quaternion
  spin: Vector3
  arc: number
  color: Color
  clod?: boolean
}

export interface CropLook {
  variety: VarietyId
  gramsPerHill: number             // what the lot says came out of each hill so far, 0 if unknown
  dark: number                     // share of tubers with blight or rot
  green: number                    // share greened
}

const MARK_DARK = new Set([7, 8, 9])   // blight, frost, rot (1 + index into CAUSES)
const MARK_GREEN = 1
const CLOD = new Color('#5b4030')
const PALE = new Color('#f3ecdc')

function upload(mesh: InstancedMesh, n: number): void {
  if (n <= 0) return
  for (const a of [mesh.instanceMatrix, mesh.instanceColor]) {
    if (!a) continue
    a.clearUpdateRanges()
    a.addUpdateRange(0, n * a.itemSize)
    a.needsUpdate = true
  }
}

export class Harvest {
  readonly group = new Group()
  private tubers: Tuber[] = []
  private tuberMesh: InstancedMesh
  private barrelMesh: InstancedMesh
  private barrelScale = new Float32Array(FIELD_COUNT * HILLS)
  private barrelWant = new Uint8Array(FIELD_COUNT * HILLS)
  private busyHills = new Uint16Array(FIELD_COUNT * HILLS)
  private barrelsJumped = false
  private r = rng(31)
  private m = new Matrix4()
  private v = new Vector3()
  private s = new Vector3()
  private q = new Quaternion()
  private disposables: { dispose(): void }[] = []

  constructor() {
    const tg = tuberGeometry()
    const tm = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 }), {})
    this.tuberMesh = new InstancedMesh(tg, tm, MAX_TUBERS)
    this.tuberMesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.tuberMesh.count = 0
    this.tuberMesh.castShadow = true
    this.tuberMesh.receiveShadow = true
    this.tuberMesh.frustumCulled = false
    this.tuberMesh.setColorAt(0, new Color(1, 1, 1))
    this.tuberMesh.instanceColor!.setUsage(DynamicDrawUsage)
    this.group.add(this.tuberMesh)
    // A cedar potato barrel: staves bulging at the middle, two dark hoops, an open top.
    const prof = [new Vector2(0, 0), new Vector2(0.17, 0), new Vector2(0.2, 0.13), new Vector2(0.21, 0.25), new Vector2(0.2, 0.37), new Vector2(0.17, 0.5), new Vector2(0.15, 0.5), new Vector2(0.15, 0.44), new Vector2(0, 0.44)]
    const bg = new LatheGeometry(prof, 14)
    const bp = bg.getAttribute('position') as BufferAttribute
    const col = new Float32Array(bp.count * 3)
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i), rad = Math.hypot(bp.getX(i), bp.getZ(i))
      const hoop = Math.abs(y - 0.13) < 0.02 || Math.abs(y - 0.37) < 0.02
      // the open top shows the crop inside, paler than the staves
      const c = y > 0.43 && rad < 0.16 ? [0.62, 0.48, 0.28] : hoop ? [0.05, 0.04, 0.035] : [0.36, 0.25, 0.14]
      col.set(c, i * 3)
    }
    bg.setAttribute('color', new BufferAttribute(col, 3))
    const bm = patch(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0 }), {})
    this.barrelMesh = new InstancedMesh(bg, bm, MAX_BARRELS)
    this.barrelMesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.barrelMesh.count = 0
    this.barrelMesh.castShadow = true
    this.barrelMesh.receiveShadow = true
    this.barrelMesh.frustumCulled = false
    this.barrelMesh.layers.enable(1)
    this.group.add(this.barrelMesh)
    this.disposables.push(tg, tm, bg, bm)
  }

  // A hill dug by the digger: a scatter of tubers like the lot so far, and the clods that come up with them.
  dig(field: number, hill: number, crop: CropLook, along: { dx: number; dz: number }): void {
    const g = crop.gramsPerHill > 0 ? crop.gramsPerHill : 700
    const n = Math.max(3, Math.min(11, Math.round(g / 120 + (this.r() - 0.5) * 2)))
    const weights: number[] = []
    for (let k = 0; k < n; k++) weights.push((g / n) * (0.35 + 1.3 * this.r()))
    const marks = weights.map(() => {
      const u = this.r()
      return u < crop.dark ? 8 : u < crop.dark + crop.green ? MARK_GREEN : 0
    })
    this.spawn(field, hill, weights, marks, crop.variety, along, false)
    const p = hillPos(field, hill)
    const base = fieldBaseY(p.z)
    this.trim(3)
    for (let k = 0; k < 3; k++) {
      const s = 0.05 + this.r() * 0.06
      const back = 0.2 + this.r() * 0.7, side = (this.r() - 0.5) * 1.6
      this.tubers.push({
        field, hill, t: -this.r() * 0.15, life: 0.8 + this.r() * 1.2, clod: true,
        fx: p.x, fy: base + 0.05, fz: p.z,
        tx: p.x - along.dx * back - along.dz * side, ty: base + 0.05, tz: p.z - along.dz * back + along.dx * side,
        sx: s * 1.3, sy: s, sz: s * 1.1,
        rot: new Quaternion(), spin: new Vector3(this.r() - 0.5, this.r() - 0.5, this.r() - 0.5).normalize(),
        arc: 0.2 + this.r() * 0.4, color: CLOD.clone().multiplyScalar(0.8 + 0.4 * this.r()),
      })
    }
  }

  private trim(n: number): void {
    const over = this.tubers.length + n - MAX_TUBERS
    if (over > 0) this.tubers.splice(0, over)
  }

  // A test dig: these exact tubers, laid out in a row where the hill stood, the biggest first.
  sample(field: number, hill: number, weights: number[], marks: number[], v: VarietyId): void {
    this.spawn(field, hill, weights.length ? weights : [120, 80], marks, v, { dx: 1, dz: 0 }, true)
  }

  private spawn(field: number, hill: number, weights: number[], marks: number[], v: VarietyId, along: { dx: number; dz: number }, laidOut: boolean): void {
    const p = hillPos(field, hill)
    const base = fieldBaseY(p.z)
    const va = variety(v)
    // Lifted toward paper so the crop reads against the soil it came out of.
    const skin = new Color(va.skin).lerp(PALE, 0.28)
    const order = weights.map((_, k) => k).sort((a, b) => weights[b] - weights[a])
    this.trim(order.length)
    order.forEach((k, idx) => {
      const w = Math.max(8, weights[k])
      const len = 0.2 * Math.cbrt(w / 150) * (laidOut ? 1.25 : 1)
      const shape = va.shape * (0.9 + 0.2 * this.r())
      let tx: number, tz: number
      if (laidOut) {
        tx = p.x - 0.42 + idx * 0.125
        tz = p.z + 0.34
      } else {
        const back = 0.3 + this.r() * 0.5
        const side = (this.r() - 0.5) * 1.5
        tx = p.x - along.dx * back - along.dz * side
        tz = p.z - along.dz * back + along.dx * side
      }
      const color = skin.clone().multiplyScalar(0.86 + 0.24 * this.r())
      const mark = marks[k] ?? 0
      if (MARK_DARK.has(mark)) color.lerp(new Color('#3a2a1e'), 0.7)
      else if (mark === MARK_GREEN) color.lerp(new Color('#7f9a52'), 0.55)
      else if (mark === 2) color.lerp(new Color('#6b5038'), 0.3)
      const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), laidOut ? 0.2 + this.r() * 0.3 : this.r() * Math.PI * 2)
      this.tubers.push({
        field, hill, t: -idx * (laidOut ? 0.16 : 0.03), life: laidOut ? 16 : 9 + this.r() * 5,
        fx: p.x, fy: base + 0.05, fz: p.z,
        tx, ty: base + 0.03 + len * 0.3, tz,
        sx: len * shape, sy: len * 0.62, sz: len * 0.78,
        rot, spin: new Vector3(this.r() - 0.5, this.r() - 0.5, this.r() - 0.5).normalize(),
        arc: laidOut ? 0.55 : 0.25 + this.r() * 0.35,
        color,
      })
    })
  }

  // Barrels stand in ranks where the crop has been picked up, on fields being dug or with the crop still out.
  setBarrelFields(active: boolean[], dug: (field: number, hill: number) => boolean): void {
    for (let f = 0; f < FIELD_COUNT; f++) {
      for (let h = 0; h < HILLS; h++) {
        const k = f * HILLS + h
        const row = Math.floor(h / COLS), col = h % COLS
        this.barrelWant[k] = active[f] && col % 3 === 1 && row % 2 === 0 && dug(f, h) ? 1 : 0
      }
    }
  }

  clear(): void {
    this.tubers.length = 0
    this.barrelWant.fill(0)
  }

  snap(): void {
    for (let k = 0; k < this.barrelWant.length; k++) this.barrelScale[k] = this.busyHills[k] ? 0 : this.barrelWant[k]
    this.barrelsJumped = true
  }

  // boost: how much larger than life the tubers are drawn, so they read from far off. still: no arcs and spins.
  update(dt: number, paused: boolean, boost: number, still: boolean): void {
    this.busyHills.fill(0)
    let n = 0
    const keep: Tuber[] = []
    for (const t of this.tubers) {
      t.t += dt
      if (t.t > FLIGHT) t.life -= dt * (paused ? 0.25 : 1)
      if (t.life < -0.6) continue
      keep.push(t)
      if (!t.clod) this.busyHills[t.field * HILLS + t.hill]++
      if (t.t < 0) continue
      const p = still ? 1 : Math.min(1, t.t / FLIGHT)
      // out along the ground quickly, then settling; up and over on the way
      const e = 1 - (1 - p) * (1 - p)
      const land = still ? 1 : p < 1 ? 1 : 1 - 0.15 * Math.max(0, 1 - (t.t - FLIGHT) / 0.12)
      const y = t.fy + (t.ty - t.fy) * e + t.arc * 4 * p * (1 - p)
      const big = t.clod ? 1 : boost
      this.v.set(t.fx + (t.tx - t.fx) * e, y + t.sy * (big - 1) * 0.3, t.fz + (t.tz - t.fz) * e)
      const shrink = t.life < 0 ? Math.max(0, 1 + t.life / 0.6) : 1
      const pop = (still ? Math.min(1, 0.2 + t.t * 5) : Math.min(1, 0.75 + p * 1.25)) * shrink * big
      this.q.setFromAxisAngle(t.spin, still ? 0 : (1 - p) * 5).premultiply(t.rot)
      this.s.set(t.sx * pop, t.sy * pop * land, t.sz * pop)
      this.m.compose(this.v, this.q, this.s)
      if (n < MAX_TUBERS) {
        this.tuberMesh.setMatrixAt(n, this.m)
        this.tuberMesh.setColorAt(n, t.color)
        n++
      }
    }
    this.tubers = keep
    this.tuberMesh.count = n
    upload(this.tuberMesh, n)

    let b = 0, moved = false
    const k1 = still ? 1 : 1 - Math.exp(-dt * 4)
    const up = new Vector3(0, 1, 0)
    for (let k = 0; k < this.barrelWant.length; k++) {
      const want = this.barrelWant[k] && !this.busyHills[k] ? 1 : 0
      const was = this.barrelScale[k]
      const d = want - was
      this.barrelScale[k] = Math.abs(d) < 0.002 ? want : was + d * k1
      if (this.barrelScale[k] !== was) moved = true
      if (this.barrelScale[k] < 0.02 || b >= MAX_BARRELS) continue
      const f = Math.floor(k / HILLS), h = k % HILLS
      const p = hillPos(f, h)
      const sc = this.barrelScale[k] * 1.15 * Math.min(1.5, 0.75 + boost * 0.25)
      this.v.set(p.x + (hash2(k, 3) - 0.5) * 0.16, fieldBaseY(p.z) + RIDGE_AMP * 0.1, p.z + (hash2(k, 5) - 0.5) * 0.16)
      this.q.setFromAxisAngle(up, hash2(k, 4) * 6.28)
      this.s.set(sc, sc, sc)
      this.barrelMesh.setMatrixAt(b++, this.m.compose(this.v, this.q, this.s))
    }
    if (moved || this.barrelsJumped || b !== this.barrelMesh.count) upload(this.barrelMesh, b)
    this.barrelsJumped = false
    this.barrelMesh.count = b
  }

  busy(): boolean {
    return this.tubers.length > 0
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.tuberMesh.dispose()
    this.barrelMesh.dispose()
  }
}
