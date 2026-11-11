// A three-quarter view of the block that keeps the farm inside the part of the window the panels leave free.
import { PerspectiveCamera, Vector3 } from 'three'
import { BLOCK, FIELDS, fieldBaseY } from './layout.ts'

const BASE_AZ = -0.5
const BASE_EL = 0.66
const AZ_RANGE = 0.55
const EL_MIN = 0.32, EL_MAX = 1.12
const ZOOM_MIN = 0.45, ZOOM_MAX = 1.4
const CENTER = new Vector3((BLOCK.x0 + BLOCK.x1) / 2, 1.2, (BLOCK.z0 + BLOCK.z1) / 2)

const BOUNDS: Vector3[] = [
  new Vector3(BLOCK.x0, BLOCK.base, BLOCK.z0), new Vector3(BLOCK.x1, BLOCK.base, BLOCK.z0),
  new Vector3(BLOCK.x0, BLOCK.base, BLOCK.z1), new Vector3(BLOCK.x1, BLOCK.base, BLOCK.z1),
  new Vector3(BLOCK.x0, 10.5, BLOCK.z0), new Vector3(BLOCK.x1, 10.5, BLOCK.z0),
  new Vector3(BLOCK.x0, 3.5, BLOCK.z1), new Vector3(BLOCK.x1, 3.5, BLOCK.z1),
  new Vector3(BLOCK.x0, 8, -15), new Vector3(BLOCK.x1, 8, -15),
]

// On a narrow screen frame the fields and the farmyard, and let the woods and the block's corners go off the edge.
const CORE: Vector3[] = [
  new Vector3(-12.6, 0, -15.5), new Vector3(20, 0, -15.5), new Vector3(-12.6, 0, 17.5), new Vector3(20, 0, 17.5),
  new Vector3(-12.6, 5.5, -15.5), new Vector3(20, 5.5, -15.5), new Vector3(-12.6, 2, 17.5), new Vector3(20, 2, 17.5),
]

export interface Viewport { w: number; h: number; top: number; right: number; bottom: number; left: number }

interface Area { x0: number; y0: number; w: number; h: number }
interface Aim { tx: number; ty: number; tz: number; sx: number; sy: number; dist: number }

// Each field's corners and the spot its name label hangs from.
const FIELD_MARKS: Vector3[] = FIELDS.flatMap(f => [
  new Vector3(f.x0, fieldBaseY(f.i, f.z0), f.z0), new Vector3(f.x1, fieldBaseY(f.i, f.z0), f.z0),
  new Vector3(f.x0, fieldBaseY(f.i, f.z1), f.z1), new Vector3(f.x1, fieldBaseY(f.i, f.z1), f.z1),
  new Vector3(f.cx, fieldBaseY(f.i, f.z0) + 0.6, f.z0),
])

// The part of the window the farm is fitted to. When the panels leave too little, the farm is fitted to a larger
// central area and runs under the panels' inner edges: a readable farm partly covered beats a speck.
function freeArea(vp: Viewport): Area {
  const span = (size: number, a: number, b: number, floor: number, share: number): [number, number] => {
    const free = size - a - b
    const want = Math.min(size, Math.max(floor, size * share))
    if (free >= want || a + b <= 0) return [a, Math.max(1, free)]
    const cut = (want - free) / (a + b)
    return [a * (1 - cut), want]
  }
  const [x0, w] = span(vp.w, vp.left, vp.right, 360, 0.42)
  const [y0, h] = span(vp.h, vp.top, vp.bottom, 300, 0.45)
  return { x0, y0, w, h }
}

// How far selecting a field moves the camera toward it: not at all when the free area is small, so the other fields stay in view.
function focusShare(a: Area): number {
  return clamp((Math.min(a.w, a.h * 1.6) - 420) / 300, 0, 1)
}

export class CameraRig {
  readonly camera = new PerspectiveCamera(26, 1, 1, 400)
  az = BASE_AZ
  el = BASE_EL
  zoom = 1
  private cur = { az: BASE_AZ, el: BASE_EL, dist: 90, tx: CENTER.x, ty: CENTER.y, tz: CENTER.z, sx: 0, sy: 0 }
  private fitKey = ''
  private fit = { dist: 90, sx: 0, sy: 0 }
  private limitKey = ''
  private limit = 0
  private v = new Vector3()
  private first = true

  reset(): void {
    this.az = BASE_AZ
    this.el = BASE_EL
    this.zoom = 1
  }

  orbit(dx: number, dy: number): void {
    this.az = clamp(this.az - dx * 0.005, BASE_AZ - AZ_RANGE, BASE_AZ + AZ_RANGE)
    this.el = clamp(this.el + dy * 0.004, EL_MIN, EL_MAX)
  }

  zoomBy(f: number): void {
    this.zoom = clamp(this.zoom * f, ZOOM_MIN, ZOOM_MAX)
  }

  private place(az: number, el: number, dist: number, tx: number, ty: number, tz: number, sx: number, sy: number, vp: Viewport): void {
    const c = this.camera
    c.aspect = vp.w / vp.h
    c.position.set(tx + Math.sin(az) * Math.cos(el) * dist, ty + Math.sin(el) * dist, tz + Math.cos(az) * Math.cos(el) * dist)
    c.lookAt(tx, ty, tz)
    if (sx || sy) c.setViewOffset(vp.w, vp.h, -sx, -sy, vp.w, vp.h)
    else c.clearViewOffset()
    c.updateProjectionMatrix()
    c.updateMatrixWorld(true)
  }

  private extents(vp: Viewport, pts: Vector3[]): { x0: number; x1: number; y0: number; y1: number } {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of pts) {
      this.v.copy(p).project(this.camera)
      const x = (this.v.x + 1) / 2 * vp.w, y = (1 - this.v.y) / 2 * vp.h
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    return { x0, x1, y0, y1 }
  }

  // The distance and screen shift that fit the whole block, centred in the free area, at the default angle.
  private computeFit(vp: Viewport): void {
    const key = `${vp.w}|${vp.h}|${vp.top}|${vp.right}|${vp.bottom}|${vp.left}`
    if (key === this.fitKey) return
    this.fitKey = key
    const a = freeArea(vp)
    // Narrow: the fields and the farmyard fill the room. Wide: the whole block, woods and cut faces too. In between, a blend.
    const core = this.fitTo(vp, a, CORE), whole = this.fitTo(vp, a, BOUNDS)
    const t = smoothstep(700, 1100, a.w)
    const fit = { dist: core.dist + (whole.dist - core.dist) * t, sx: core.sx + (whole.sx - core.sx) * t, sy: core.sy + (whole.sy - core.sy) * t }
    // Fitted wider than the panels allow: the six fields, not the farmyard beside them, go in the middle of what is left.
    const fw = vp.w - vp.left - vp.right, fh = vp.h - vp.top - vp.bottom
    if (a.w > fw + 1 || a.h > fh + 1) {
      this.place(BASE_AZ, BASE_EL, fit.dist, CENTER.x, CENTER.y, CENTER.z, fit.sx, fit.sy, vp)
      const e = this.extents(vp, FIELD_MARKS)
      if (a.w > fw + 1) fit.sx += vp.left + fw / 2 - (e.x0 + e.x1) / 2
      if (a.h > fh + 1) fit.sy += vp.top + fh / 2 - (e.y0 + e.y1) / 2
    }
    this.fit = fit
  }

  private fitTo(vp: Viewport, a: Area, pts: Vector3[]): { dist: number; sx: number; sy: number } {
    const margin = Math.min(a.w, a.h) * 0.04
    let dist = 90
    for (let k = 0; k < 5; k++) {
      this.place(BASE_AZ, BASE_EL, dist, CENTER.x, CENTER.y, CENTER.z, 0, 0, vp)
      const e = this.extents(vp, pts)
      dist *= Math.max((e.x1 - e.x0) / (a.w - margin * 2), (e.y1 - e.y0) / (a.h - margin * 2))
    }
    this.place(BASE_AZ, BASE_EL, dist, CENTER.x, CENTER.y, CENTER.z, 0, 0, vp)
    const e = this.extents(vp, pts)
    return { dist, sx: a.x0 + a.w / 2 - (e.x0 + e.x1) / 2, sy: a.y0 + a.h / 2 - (e.y0 + e.y1) / 2 }
  }

  // Where the camera aims for a selected field, `share` of the way from the whole farm toward it.
  private aim(vp: Viewport, a: Area, focus: number, share: number): Aim {
    const t: Aim = { tx: CENTER.x, ty: CENTER.y, tz: CENTER.z, sx: this.fit.sx, sy: this.fit.sy, dist: this.fit.dist * this.zoom }
    if (focus < 0 || share <= 0) return t
    const f = FIELDS[focus]
    const k = 0.62 * share
    t.tx += (f.cx - t.tx) * k
    t.ty += (fieldBaseY(focus, f.cz) + 0.3 - t.ty) * k
    t.tz += (f.cz - t.tz) * k
    t.sx += (a.x0 + a.w / 2 - vp.w / 2 - t.sx) * k
    t.sy += (a.y0 + a.h / 2 - vp.h / 2 - t.sy) * k
    t.dist *= 1 - 0.24 * share
    return t
  }

  // How far, in pixels, each field corner and label anchor falls outside the part of the window the panels leave free.
  private overflow(vp: Viewport, t: Aim, az: number, el: number, out: Float32Array): Float32Array {
    this.place(az, el, t.dist, t.tx, t.ty, t.tz, t.sx, t.sy, vp)
    FIELD_MARKS.forEach((p, k) => {
      this.v.copy(p).project(this.camera)
      const x = (this.v.x + 1) / 2 * vp.w, y = (1 - this.v.y) / 2 * vp.h
      // A label is hidden when its anchor comes this near a panel.
      const mx = k % 5 === 4 ? 30 : 0, my = k % 5 === 4 ? 12 : 0
      out[k] = Math.max(0, vp.left + mx - x, x - vp.w + vp.right + mx, vp.top + my - y, y - vp.h + vp.bottom + my)
    })
    return out
  }

  // The most a selection may move the camera without pushing any field, or its label, further under a panel than it was.
  private focusLimit(vp: Viewport, a: Area, focus: number, az: number, el: number): number {
    const most = focus >= 0 ? focusShare(a) : 0
    if (most <= 0) return 0
    const key = `${this.fitKey}|${focus}|${this.zoom.toFixed(3)}|${az.toFixed(3)}|${el.toFixed(3)}`
    if (key === this.limitKey) return this.limit
    this.limitKey = key
    const base = this.overflow(vp, this.aim(vp, a, focus, 0), az, el, new Float32Array(FIELD_MARKS.length))
    const now = new Float32Array(FIELD_MARKS.length)
    const fits = (s: number) => this.overflow(vp, this.aim(vp, a, focus, s), az, el, now).every((o, k) => o <= base[k] + 2)
    let lo = 0, hi = most
    if (fits(hi)) lo = hi
    else for (let k = 0; k < 7; k++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
    this.limit = lo
    return lo
  }

  // `still` (reduced motion): jump to the new view instead of gliding to it.
  update(dt: number, vp: Viewport, focus: number, drift: number, still = false): void {
    this.computeFit(vp)
    const a = freeArea(vp)
    const az = this.az + drift * 0.11, el = this.el + drift * 0.025
    const t = this.aim(vp, a, focus, this.focusLimit(vp, a, focus, az, el))
    const c = this.cur
    const e = this.first || still ? 1 : 1 - Math.exp(-dt * 4)
    this.first = false
    c.az += (az - c.az) * e
    c.el += (el - c.el) * e
    c.dist += (t.dist - c.dist) * e
    c.tx += (t.tx - c.tx) * e
    c.ty += (t.ty - c.ty) * e
    c.tz += (t.tz - c.tz) * e
    c.sx += (t.sx - c.sx) * e
    c.sy += (t.sy - c.sy) * e
    this.place(c.az, c.el, c.dist, c.tx, c.ty, c.tz, c.sx, c.sy, vp)
  }

  snap(vp: Viewport, focus: number): void {
    this.first = true
    this.update(0, vp, focus, 0)
  }

  // Where the camera is now, for tests.
  where(): { x: number; y: number; z: number; dist: number } {
    const p = this.camera.position
    return { x: p.x, y: p.y, z: p.z, dist: this.cur.dist }
  }

  distance(): number {
    return this.cur.dist
  }

  // Pixels per world unit at distance 1, for point sizes.
  pixelScale(h: number): number {
    return h / (2 * Math.tan((this.camera.fov * Math.PI) / 360))
  }
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
