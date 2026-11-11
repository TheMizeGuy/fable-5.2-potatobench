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

export class CameraRig {
  readonly camera = new PerspectiveCamera(26, 1, 1, 400)
  az = BASE_AZ
  el = BASE_EL
  zoom = 1
  private cur = { az: BASE_AZ, el: BASE_EL, dist: 90, tx: CENTER.x, ty: CENTER.y, tz: CENTER.z, sx: 0, sy: 0 }
  private fitKey = ''
  private fit = { dist: 90, sx: 0, sy: 0 }
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
    const aw = Math.max(80, vp.w - vp.left - vp.right), ah = Math.max(80, vp.h - vp.top - vp.bottom)
    const margin = Math.min(aw, ah) * 0.04
    const pts = aw < 640 ? CORE : BOUNDS
    let dist = 90
    for (let k = 0; k < 5; k++) {
      this.place(BASE_AZ, BASE_EL, dist, CENTER.x, CENTER.y, CENTER.z, 0, 0, vp)
      const e = this.extents(vp, pts)
      const s = Math.max((e.x1 - e.x0) / (aw - margin * 2), (e.y1 - e.y0) / (ah - margin * 2))
      dist *= s
    }
    this.place(BASE_AZ, BASE_EL, dist, CENTER.x, CENTER.y, CENTER.z, 0, 0, vp)
    const e = this.extents(vp, pts)
    const cx = vp.left + aw / 2, cy = vp.top + ah / 2
    this.fit = { dist, sx: cx - (e.x0 + e.x1) / 2, sy: cy - (e.y0 + e.y1) / 2 }
  }

  update(dt: number, vp: Viewport, focus: number, drift: number): void {
    this.computeFit(vp)
    const aw = Math.max(80, vp.w - vp.left - vp.right), ah = Math.max(80, vp.h - vp.top - vp.bottom)
    const centerSx = vp.left + aw / 2 - vp.w / 2, centerSy = vp.top + ah / 2 - vp.h / 2
    let tx = CENTER.x, ty = CENTER.y, tz = CENTER.z, sx = this.fit.sx, sy = this.fit.sy, dist = this.fit.dist * this.zoom
    if (focus >= 0) {
      const f = FIELDS[focus]
      const k = 0.62
      tx += (f.cx - tx) * k
      ty += (fieldBaseY(focus, f.cz) + 0.3 - ty) * k
      tz += (f.cz - tz) * k
      sx += (centerSx - sx) * k
      sy += (centerSy - sy) * k
      dist *= 0.76
    }
    const az = this.az + drift * 0.11, el = this.el + drift * 0.025
    const c = this.cur
    const e = this.first ? 1 : 1 - Math.exp(-dt * 4)
    this.first = false
    c.az += (az - c.az) * e
    c.el += (el - c.el) * e
    c.dist += (dist - c.dist) * e
    c.tx += (tx - c.tx) * e
    c.ty += (ty - c.ty) * e
    c.tz += (tz - c.tz) * e
    c.sx += (sx - c.sx) * e
    c.sy += (sy - c.sy) * e
    this.place(c.az, c.el, c.dist, c.tx, c.ty, c.tz, c.sx, c.sy, vp)
  }

  snap(vp: Viewport, focus: number): void {
    this.first = true
    this.update(0, vp, focus, 0)
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
