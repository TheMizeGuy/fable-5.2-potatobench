// Dig day: tubers thrown up behind the digger onto the turned soil, then picked into barrels that stand in the field.
import {
  Color, DynamicDrawUsage, Group, InstancedMesh, LatheGeometry, Matrix4, MeshLambertMaterial, Quaternion, Vector2, Vector3,
} from 'three'
import { FIELD_COUNT, HILLS, variety, type VarietyId } from '../sim/index.ts'
import { tuberGeometry } from './geometry.ts'
import { RIDGE_AMP, upload } from './fields.ts'
import { fieldBaseY, hillPos } from './layout.ts'
import { hash2, rng } from './noise.ts'

const MAX_TUBERS = 3000
const MAX_BARRELS = 260
const BARREL_EVERY = 5

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
const CLOD = new Color('#4e3829')

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
    const tm = new MeshLambertMaterial({ color: 0xffffff })
    this.tuberMesh = new InstancedMesh(tg, tm, MAX_TUBERS)
    this.tuberMesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.tuberMesh.count = 0
    this.tuberMesh.castShadow = true
    this.tuberMesh.frustumCulled = false
    this.tuberMesh.setColorAt(0, new Color(1, 1, 1))
    this.group.add(this.tuberMesh)
    const prof = [new Vector2(0, 0), new Vector2(0.16, 0), new Vector2(0.19, 0.12), new Vector2(0.2, 0.22), new Vector2(0.19, 0.33), new Vector2(0.16, 0.44), new Vector2(0, 0.44)]
    const bg = new LatheGeometry(prof, 12)
    const bm = new MeshLambertMaterial({ color: '#8a6a48' })
    this.barrelMesh = new InstancedMesh(bg, bm, MAX_BARRELS)
    this.barrelMesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.barrelMesh.count = 0
    this.barrelMesh.castShadow = true
    this.barrelMesh.receiveShadow = true
    this.barrelMesh.frustumCulled = false
    this.group.add(this.barrelMesh)
    this.disposables.push(tg, tm, bg, bm)
  }

  // A hill dug by the digger: a scatter of tubers like the lot so far.
  dig(field: number, hill: number, crop: CropLook, along: { dx: number; dz: number }): void {
    const g = crop.gramsPerHill > 0 ? crop.gramsPerHill : 700
    const n = Math.max(2, Math.min(11, Math.round(g / 130 + (this.r() - 0.5) * 2)))
    const weights: number[] = []
    for (let k = 0; k < n; k++) weights.push((g / n) * (0.35 + 1.3 * this.r()))
    const marks = weights.map(() => {
      const u = this.r()
      return u < crop.dark ? 8 : u < crop.dark + crop.green ? MARK_GREEN : 0
    })
    this.spawn(field, hill, weights, marks, crop.variety, along, false)
    // Clods of earth thrown up with them.
    const p = hillPos(field, hill)
    const base = fieldBaseY(field, p.z)
    this.trim(4)
    for (let k = 0; k < 4; k++) {
      const s = 0.06 + this.r() * 0.06
      const back = 0.2 + this.r() * 0.7, side = (this.r() - 0.5) * 1.0
      this.tubers.push({
        field, hill, t: -this.r() * 0.15, life: 0.6 + this.r() * 0.8, clod: true,
        fx: p.x, fy: base + 0.05, fz: p.z,
        tx: p.x - along.dx * back - along.dz * side, ty: base + 0.06, tz: p.z - along.dz * back + along.dx * side,
        sx: s * 1.3, sy: s, sz: s * 1.1,
        rot: new Quaternion(), spin: new Vector3(this.r() - 0.5, this.r() - 0.5, this.r() - 0.5).normalize(),
        arc: 0.25 + this.r() * 0.45, color: CLOD.clone().multiplyScalar(0.8 + 0.4 * this.r()),
      })
    }
  }

  private trim(n: number): void {
    const over = this.tubers.length + n - MAX_TUBERS
    if (over > 0) this.tubers.splice(0, over)
  }

  // A test dig: these exact tubers, laid out where the hill stood.
  sample(field: number, hill: number, weights: number[], marks: number[], v: VarietyId): void {
    this.spawn(field, hill, weights.length ? weights : [120, 80], marks, v, { dx: 1, dz: 0 }, true)
  }

  private spawn(field: number, hill: number, weights: number[], marks: number[], v: VarietyId, along: { dx: number; dz: number }, laidOut: boolean): void {
    const p = hillPos(field, hill)
    const base = fieldBaseY(field, p.z)
    const va = variety(v)
    const skin = new Color(va.skin)
    const order = weights.map((w, k) => k).sort((a, b) => weights[b] - weights[a])
    this.trim(order.length)
    order.forEach((k, idx) => {
      const w = Math.max(8, weights[k])
      const len = 0.3 * Math.cbrt(w / 150) * (laidOut ? 1.15 : 1)
      const shape = va.shape * (0.9 + 0.2 * this.r())
      let tx: number, tz: number
      if (laidOut) {
        // Biggest first, in two short rows in the gap the hill left.
        const col = idx % 4, row = Math.floor(idx / 4)
        tx = p.x - 0.3 + col * 0.2
        tz = p.z - 0.18 + row * 0.34
      } else {
        const back = 0.35 + this.r() * 0.6
        const side = (this.r() - 0.5) * 0.85
        tx = p.x - along.dx * back - along.dz * side
        tz = p.z - along.dz * back + along.dx * side
      }
      const color = skin.clone().multiplyScalar(0.85 + 0.25 * this.r())
      const mark = marks[k] ?? 0
      if (MARK_DARK.has(mark)) color.lerp(new Color('#3a2a1e'), 0.7)
      else if (mark === MARK_GREEN) color.lerp(new Color('#7f9a52'), 0.55)
      else if (mark === 2) color.lerp(new Color('#6b5038'), 0.3)
      const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), this.r() * Math.PI * 2)
      this.tubers.push({
        field, hill, t: -idx * (laidOut ? 0.12 : 0.03), life: laidOut ? 14 : 6 + this.r() * 3,
        fx: p.x, fy: base + 0.05, fz: p.z,
        tx, ty: base + 0.04 + len * 0.3, tz,
        sx: len * shape, sy: len * 0.62, sz: len * 0.78,
        rot, spin: new Vector3(this.r() - 0.5, this.r() - 0.5, this.r() - 0.5).normalize(),
        arc: laidOut ? 0.9 : 0.35 + this.r() * 0.5,
        color,
      })
    })
  }

  // Barrels stand where the crop has been picked up, on fields being dug or just dug.
  setBarrelFields(active: boolean[], dug: (field: number, hill: number) => boolean): void {
    for (let f = 0; f < FIELD_COUNT; f++) {
      for (let h = 0; h < HILLS; h++) {
        const k = f * HILLS + h
        this.barrelWant[k] = active[f] && hash2(k, 77) < 1 / BARREL_EVERY && dug(f, h) ? 1 : 0
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

  update(dt: number, paused: boolean): void {
    this.busyHills.fill(0)
    let n = 0
    const keep: Tuber[] = []
    for (const t of this.tubers) {
      t.t += dt
      const flight = 0.55
      if (t.t > flight) t.life -= dt * (paused ? 0.25 : 1)
      if (t.life < -0.6) continue
      keep.push(t)
      if (!t.clod) this.busyHills[t.field * HILLS + t.hill]++
      if (t.t < 0) continue
      const p = Math.min(1, t.t / flight)
      const ease = p
      const y = t.fy + (t.ty - t.fy) * ease + t.arc * 4 * p * (1 - p)
      this.v.set(t.fx + (t.tx - t.fx) * ease, y, t.fz + (t.tz - t.fz) * ease)
      const shrink = t.life < 0 ? Math.max(0, 1 + t.life / 0.6) : 1
      const pop = Math.min(1, 0.4 + p)
      this.q.setFromAxisAngle(t.spin, (1 - p) * 6).premultiply(t.rot)
      this.s.set(t.sx * shrink * pop, t.sy * shrink * pop, t.sz * shrink * pop)
      this.m.compose(this.v, this.q, this.s)
      if (n < MAX_TUBERS) {
        this.tuberMesh.setMatrixAt(n, this.m)
        this.tuberMesh.setColorAt(n, t.color)
        n++
      }
    }
    this.tubers = keep
    this.tuberMesh.count = n
    // Only what moved goes to the GPU: the tubers in flight or lying, and the barrels while they grow or go.
    upload(n, this.tuberMesh.instanceMatrix, this.tuberMesh.instanceColor)

    let b = 0, moved = false
    const k1 = 1 - Math.exp(-dt * 4)
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
      const sc = this.barrelScale[k]
      this.v.set(p.x + (hash2(k, 3) - 0.5) * 0.3, fieldBaseY(f, p.z) + RIDGE_AMP * 0.1, p.z + 0.5)
      this.q.setFromAxisAngle(up, hash2(k, 4) * 6.28)
      this.s.set(sc, sc, sc)
      this.barrelMesh.setMatrixAt(b++, this.m.compose(this.v, this.q, this.s))
    }
    if (moved || this.barrelsJumped || b !== this.barrelMesh.count) upload(b, this.barrelMesh.instanceMatrix)
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
