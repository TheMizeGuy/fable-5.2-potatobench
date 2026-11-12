// The camera of a strategy map that is also a landscape: it looks at a point on the farm from a distance, and the lens
// is raised above that line so the far edge of the picture takes in the woods, the hills and a band of sky. Far off it
// looks down more steeply; close in it comes down to a walker's eye level among the rows.
// The player's own moves are damped; moves the game makes (a change of screen, a field brought into frame) are timed.
import { PerspectiveCamera, Vector3 } from 'three'
import { FARM_CENTER, FIELDS, LAND, fieldBaseY, groundY, profile } from './layout.ts'
import { clamp, mix, smooth } from './noise.ts'

export interface Viewport { w: number; h: number; top: number; right: number; bottom: number; left: number }
// pitch: how steeply the camera looks down at its point on the ground. tilt: how far the lens is raised above that line.
export interface Pose { x: number; z: number; dist: number; yaw: number; pitch: number; fov: number; tilt: number }

export const MIN_DIST = 7.5
// The farm is seen from the brook side, turned toward the low sun: three-quarter back light.
const HOME_YAW = -0.24
const SLOPE = (profile(5) - profile(-8)) / 13
export const MOVE_MS = 800
// How high the far hills stand above the level line of the eye, seen from the playing height (radians).
const CREST = 0.082

// By distance: the pitch, how far below level the lens itself points, and the lens (degrees, vertical).
const VIEW: [number, number, number, number][] = [
  [7.5, 0.13, 0.04, 36], [16, 0.19, 0.085, 38], [34, 0.29, 0.16, 42], [58, 0.385, 0.225, 44], [110, 0.5, 0.3, 44], [240, 0.68, 0.43, 42],
]
function viewAt(dist: number, k: 1 | 2 | 3): number {
  const l = Math.log(dist)
  let i = 0
  while (i < VIEW.length - 2 && Math.log(VIEW[i + 1][0]) <= l) i++
  const a = VIEW[i], b = VIEW[i + 1]
  return mix(a[k], b[k], clamp((l - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0])), 0, 1))
}
export function pitchFor(dist: number): number { return viewAt(dist, 1) }
export function tiltFor(dist: number): number { return viewAt(dist, 1) - viewAt(dist, 2) }
export function fovFor(dist: number): number { return viewAt(dist, 3) }

// cubic-bezier(0.45, 0, 0.2, 1)
function easeMove(u: number): number {
  const x1 = 0.45, y1 = 0, x2 = 0.2, y2 = 1
  let t = u
  for (let k = 0; k < 6; k++) {
    const x = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t - u
    const dx = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2)
    if (Math.abs(dx) < 1e-6) break
    t = clamp(t - x / dx, 0, 1)
  }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
}

function turn(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

function blend(a: Pose, b: Pose, t: number, out: Pose): Pose {
  out.x = mix(a.x, b.x, t)
  out.z = mix(a.z, b.z, t)
  out.dist = Math.exp(mix(Math.log(a.dist), Math.log(b.dist), t))
  out.yaw = a.yaw + turn(a.yaw, b.yaw) * t
  out.pitch = mix(a.pitch, b.pitch, t)
  out.fov = mix(a.fov, b.fov, t)
  out.tilt = mix(a.tilt, b.tilt, t)
  return out
}

// A curve from a to c that leans toward b: no corner anywhere along it.
function curve(a: Pose, b: Pose, c: Pose, t: number, out: Pose): Pose {
  const u = 1 - t, wa = u * u, wb = 2 * u * t, wc = t * t
  out.x = wa * a.x + wb * b.x + wc * c.x
  out.z = wa * a.z + wb * b.z + wc * c.z
  out.dist = Math.exp(wa * Math.log(a.dist) + wb * Math.log(b.dist) + wc * Math.log(c.dist))
  out.yaw = wa * a.yaw + wb * b.yaw + wc * c.yaw
  out.pitch = wa * a.pitch + wb * b.pitch + wc * c.pitch
  out.fov = wa * a.fov + wb * b.fov + wc * c.fov
  out.tilt = wa * a.tilt + wb * b.tilt + wc * c.tilt
  return out
}

const corners = (f: (typeof FIELDS)[number]) => [
  new Vector3(f.x0, fieldBaseY(f.z0) + 0.5, f.z0), new Vector3(f.x1, fieldBaseY(f.z0) + 0.5, f.z0),
  new Vector3(f.x0, fieldBaseY(f.z1), f.z1), new Vector3(f.x1, fieldBaseY(f.z1), f.z1),
]
// What has to be in frame for the home farm to be whole: its six fields, the farmstead, the brook. The other blocks then
// reach in from the edges, so it is plain there is more land than the screen holds.
const FIELD_MARKS: Vector3[] = FIELDS.filter(f => f.block === 'home').flatMap(corners)
const FARM_MARKS: Vector3[] = [
  ...FIELD_MARKS, new Vector3(27.4, profile(-20) + 3.2, -20.5), new Vector3(27.2, profile(6) + 3.4, 7), new Vector3(-17.4, profile(-21) + 0.6, -21.6),
  new Vector3(-17.4, profile(20.5), 20.5), new Vector3(20, profile(20.5), 20.5),
]
// Every parcel and the Dufour yard: the whole map.
const ALL_MARKS: Vector3[] = [...FIELDS.flatMap(corners), new Vector3(96, profile(-6) + 3, -6), new Vector3(27.4, profile(-20) + 3.2, -20.5)]

// The opening shot looks into the last of the sun, along the brook and the rows that run toward it. It starts high
// beyond the brook with the whole farm below and the hills behind; comes down over the bridge (the middle view only
// bends its way); and ends low on the farm road with the blossom at its feet and the sun in the tops of the spruce.
const TITLE: Pose[] = [
  { x: 2, z: 8, dist: 68, yaw: -1, pitch: 0.19, fov: 32, tilt: 0.125 },
  { x: -29, z: 1.9, dist: 40, yaw: -1.05, pitch: 0.1, fov: 32, tilt: 0.1 },
  { x: -6.1, z: -8.3, dist: 26, yaw: -1.08, pitch: 0.05, fov: 33, tilt: 0.06 },
]

export class CameraRig {
  readonly camera = new PerspectiveCamera(44, 1, 0.3, 9000)
  // Where the player has asked the camera to be, and where it is.
  readonly goal: Pose = { x: FARM_CENTER.x, z: FARM_CENTER.z, dist: 60, yaw: HOME_YAW, pitch: pitchFor(60), fov: fovFor(60), tilt: tiltFor(60) }
  readonly cur: Pose = { ...this.goal }
  private move: { from: Pose; to: Pose; t: number; ms: number } | null = null
  private shift = { x: 0, y: 0 }
  private shiftGoal = { x: 0, y: 0 }
  private homeKey = ''
  private homePose: Pose = { ...this.goal }
  private wholeKey = ''
  private wholePose: Pose = { ...this.goal }
  private titled: Pose = { ...this.goal }
  private v = new Vector3()
  private probe = new PerspectiveCamera(44, 1, 0.3, 9000)
  // Seconds since the player last moved the camera by hand.
  idle = 99

  private place(c: PerspectiveCamera, p: Pose, vp: Viewport, sx: number, sy: number): void {
    const ty = profile(clamp(p.z, -40, 50)) + 0.35
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch)
    c.fov = p.fov
    c.aspect = vp.w / vp.h
    c.near = clamp(p.dist * 0.04, 0.2, 3)
    c.far = 9000
    const x = p.x - Math.sin(p.yaw) * cp * p.dist, z = p.z + Math.cos(p.yaw) * cp * p.dist
    let y = ty + sp * p.dist
    const floor = groundY(x, z) + 0.85
    if (y < floor) y = floor
    c.position.set(x, y, z)
    c.lookAt(p.x, ty, p.z)
    if (p.tilt) c.rotateX(p.tilt)
    if (sx || sy) c.setViewOffset(vp.w, vp.h, -sx, -sy, vp.w, vp.h)
    else c.clearViewOffset()
    c.updateProjectionMatrix()
    c.updateMatrixWorld(true)
  }

  private offsetFor(vp: Viewport): { x: number; y: number } {
    // Never shift the picture's centre so far that it leaves the window.
    return { x: clamp((vp.left - vp.right) / 2, -vp.w * 0.3, vp.w * 0.3), y: clamp((vp.top - vp.bottom) / 2, -vp.h * 0.3, vp.h * 0.3) }
  }

  // A view at a distance, with the pitch, lens and raise that go with it.
  at(p: { x: number; z: number; dist: number; yaw: number }): Pose {
    return { x: p.x, z: p.z, dist: p.dist, yaw: p.yaw, pitch: pitchFor(p.dist), fov: fovFor(p.dist), tilt: tiltFor(p.dist) }
  }

  // A view given in part (by a tool): what is not given follows from the distance.
  complete(p: Partial<Pose>): Pose {
    const dist = p.dist ?? this.goal.dist
    return {
      x: p.x ?? this.goal.x, z: p.z ?? this.goal.z, dist, yaw: p.yaw ?? this.goal.yaw,
      pitch: p.pitch ?? pitchFor(dist), fov: p.fov ?? fovFor(dist), tilt: p.tilt ?? (p.pitch === undefined ? tiltFor(dist) : Math.min(tiltFor(dist), Math.max(0, p.pitch - 0.04))),
    }
  }

  // The view that holds `marks` in the ground the interface leaves free, below the band of woods, hills and sky.
  private fit(marks: Vector3[], vp: Viewport, start = 60, yaw = HOME_YAW): Pose {
    const fw = Math.max(160, vp.w - vp.left - vp.right)
    const off = this.offsetFor(vp)
    let cx0 = 0, cz0 = 0
    for (const m of marks) { cx0 += m.x; cz0 += m.z }
    const p = this.at({ x: cx0 / marks.length, z: cz0 / marks.length, dist: start, yaw })
    for (let k = 0; k < 16; k++) {
      Object.assign(p, this.at(p))
      this.place(this.probe, p, vp, off.x, off.y)
      // Where the crest of the far hills stands on the picture: the farm is kept below it, with room for the woods between.
      const focal = vp.h / 2 / Math.tan((p.fov * Math.PI) / 360)
      const crest = vp.h / 2 + off.y - focal * Math.tan(p.pitch - p.tilt + CREST)
      const top = Math.max(vp.top, Math.min(crest + vp.h * 0.06, vp.h * 0.42)), fh = Math.max(140, vp.h - vp.bottom - top)
      const margin = Math.min(fw, fh) * 0.04
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const m of marks) {
        this.v.copy(m).project(this.probe)
        const x = (this.v.x + 1) / 2 * vp.w, y = (1 - this.v.y) / 2 * vp.h
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      }
      // a step at a time, so marks that start behind the camera cannot throw the fit out
      p.dist = clamp(p.dist * clamp(Math.max((x1 - x0) / (fw - margin * 2), (y1 - y0) / (fh - margin * 2)), 0.7, 1.4), 16, 420)
      // Centre what is to be seen in the free ground.
      const cx = vp.left + fw / 2, cy = top + fh / 2
      const g0 = this.ground(this.probe, (x0 + x1) / 2, (y0 + y1) / 2, vp, p), g1 = this.ground(this.probe, cx, cy, vp, p)
      p.x += (g0.x - g1.x) * 0.8
      p.z += (g0.z - g1.z) * 0.8
    }
    return this.at(p)
  }

  // The view that holds the home farm inside what the interface leaves free.
  home(vp: Viewport): Pose {
    const key = `${vp.w}|${vp.h}|${vp.top}|${vp.right}|${vp.bottom}|${vp.left}`
    if (key === this.homeKey) return this.homePose
    this.homeKey = key
    const fw = Math.max(160, vp.w - vp.left - vp.right)
    // On a narrow window the six fields fill the room and the farmyard may run off the edge.
    const wide = smooth(520, 900, fw)
    const a = this.fit(FIELD_MARKS, vp), b = this.fit(FARM_MARKS, vp)
    this.homePose = this.at(blend(a, b, wide, { ...a }))
    return this.homePose
  }

  // The view that holds every parcel: the whole map.
  whole(vp: Viewport): Pose {
    const key = `${vp.w}|${vp.h}|${vp.top}|${vp.right}|${vp.bottom}|${vp.left}`
    if (key === this.wholeKey) return this.wholePose
    this.wholeKey = key
    this.wholePose = this.fit(ALL_MARKS, vp, 170, HOME_YAW * 0.55)
    return this.wholePose
  }

  // True when the camera is at (or going to) this view.
  isAt(p: Pose): boolean {
    const g = this.goal
    return Math.hypot(g.x - p.x, g.z - p.z) < 1.5 && Math.abs(Math.log(g.dist / p.dist)) < 0.08 && Math.abs(turn(g.yaw, p.yaw)) < 0.05
  }

  // The view of one field: it fills about half the free area.
  fieldPose(i: number, vp: Viewport): Pose {
    const f = FIELDS[i], h = this.home(vp)
    return this.at({ x: f.cx, z: f.cz, dist: clamp(h.dist * 0.5, 22, 46), yaw: this.goal.yaw })
  }

  // The opening shot at a point of its move, 0..1 (see TITLE).
  titlePose(vp: Viewport, u = 0): Pose {
    const p = curve(TITLE[0], TITLE[1], TITLE[2], clamp(u, 0, 1), this.titled)
    // An upright window sees less to either side: stand back and widen the lens.
    const narrow = 1 - smooth(0.7, 1.3, vp.w / vp.h)
    p.fov = mix(p.fov, 46, narrow)
    p.dist *= 1 + 0.25 * narrow
    return p
  }

  // The point of the farm's slope under a pixel. Above the land (the hills, the sky) it is a point far off on the slope.
  private ground(c: PerspectiveCamera, px: number, py: number, vp: Viewport, at: Pose): { x: number; z: number } {
    this.v.set((px / vp.w) * 2 - 1, -(py / vp.h) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize()
    const o = c.position, d = this.v
    const y0 = profile(clamp(at.z, -40, 50)) + 0.1
    const den = d.y - SLOPE * d.z
    let t = (y0 + SLOPE * (o.z - at.z) - o.y) / (Math.abs(den) > 1e-4 ? den : -1e-4)
    const far = at.dist * 3.2 + 40
    if (t < 0 || t > far) t = far
    return { x: o.x + d.x * t, z: o.z + d.z * t }
  }

  private byHand(): void {
    if (this.move) { Object.assign(this.goal, this.cur); this.move = null }
    this.idle = 0
  }

  private bound(vp: Viewport): void {
    const g = this.goal
    g.x = clamp(g.x, LAND.x0 + 4, LAND.x1 - 4)
    g.z = clamp(g.z, LAND.z0 + 2, LAND.z1 - 2)
    g.dist = clamp(g.dist, MIN_DIST, Math.max(this.whole(vp).dist * 1.06, this.home(vp).dist * 1.12, 70))
    g.pitch = pitchFor(g.dist)
    g.fov = fovFor(g.dist)
    g.tilt = tiltFor(g.dist)
  }

  // Drag: the ground that was under the pointer stays under it.
  pan(fromX: number, fromY: number, toX: number, toY: number, vp: Viewport): void {
    this.byHand()
    this.place(this.probe, this.goal, vp, this.shift.x, this.shift.y)
    const a = this.ground(this.probe, fromX, fromY, vp, this.goal), b = this.ground(this.probe, toX, toY, vp, this.goal)
    this.goal.x += a.x - b.x
    this.goal.z += a.z - b.z
    this.bound(vp)
  }

  // Wheel or pinch: zoom, keeping the ground under the pointer where it is.
  zoomAt(factor: number, px: number, py: number, vp: Viewport): void {
    this.byHand()
    this.place(this.probe, this.goal, vp, this.shift.x, this.shift.y)
    const a = this.ground(this.probe, px, py, vp, this.goal)
    this.goal.dist *= factor
    this.bound(vp)
    this.place(this.probe, this.goal, vp, this.shift.x, this.shift.y)
    const b = this.ground(this.probe, px, py, vp, this.goal)
    this.goal.x += a.x - b.x
    this.goal.z += a.z - b.z
    this.bound(vp)
  }

  turnBy(rad: number, vp: Viewport): void {
    this.byHand()
    this.goal.yaw += rad
    this.bound(vp)
  }

  // Keys: along the screen's own right and up.
  slide(right: number, up: number, vp: Viewport): void {
    this.byHand()
    const k = this.goal.dist * 0.9, s = Math.sin(this.goal.yaw), c = Math.cos(this.goal.yaw)
    this.goal.x += (c * right + s * up) * k
    this.goal.z += (s * right - c * up) * k
    this.bound(vp)
  }

  // A timed move to a view. `still`: jump there.
  moveTo(to: Pose, still: boolean, ms = MOVE_MS): void {
    Object.assign(this.goal, to)
    if (still) { Object.assign(this.cur, to); this.move = null } else this.move = { from: { ...this.cur }, to: { ...to }, t: 0, ms }
  }

  // If a timed move is under way, send it somewhere else without starting it again.
  retarget(to: Pose): void {
    Object.assign(this.goal, to)
    if (this.move) Object.assign(this.move.to, to)
  }

  moving(): boolean {
    return this.move !== null
  }

  update(dt: number, vp: Viewport, still: boolean): void {
    this.idle += dt
    const off = this.offsetFor(vp)
    this.shiftGoal.x = off.x
    this.shiftGoal.y = off.y
    if (this.move) {
      this.move.t += dt * 1000
      const u = clamp(this.move.t / this.move.ms, 0, 1)
      blend(this.move.from, this.move.to, easeMove(u), this.cur)
      if (u >= 1) this.move = null
    } else {
      const k = still ? 1 : 1 - Math.exp(-dt / 0.085)
      blend(this.cur, this.goal, k, this.cur)
    }
    const ks = still ? 1 : 1 - Math.exp(-dt / 0.16)
    this.shift.x += (this.shiftGoal.x - this.shift.x) * ks
    this.shift.y += (this.shiftGoal.y - this.shift.y) * ks
    this.place(this.camera, this.cur, vp, this.shift.x, this.shift.y)
  }

  snap(vp: Viewport): void {
    this.move = null
    Object.assign(this.cur, this.goal)
    const off = this.offsetFor(vp)
    this.shift.x = off.x
    this.shift.y = off.y
    this.place(this.camera, this.cur, vp, off.x, off.y)
  }

  // Where the lens is focused: the distance from the camera to what it looks at.
  focus(): number {
    return this.v.set(this.cur.x, profile(clamp(this.cur.z, -40, 50)), this.cur.z).distanceTo(this.camera.position)
  }

  where(): { x: number; y: number; z: number; dist: number; yaw: number } {
    const p = this.camera.position
    return { x: p.x, y: p.y, z: p.z, dist: this.cur.dist, yaw: this.cur.yaw }
  }
}
