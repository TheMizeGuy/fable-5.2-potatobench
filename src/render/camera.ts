// The camera of a strategy map: it looks at a point on the farm from a distance, steep when far and low when near.
// The player's own moves are damped; moves the game makes (a change of screen, a field brought into frame) are timed.
import { PerspectiveCamera, Vector3 } from 'three'
import { FARM, FARM_CENTER, FIELDS, fieldBaseY, groundY, profile } from './layout.ts'
import { clamp, mix, smooth } from './noise.ts'

export interface Viewport { w: number; h: number; top: number; right: number; bottom: number; left: number }
export interface Pose { x: number; z: number; dist: number; yaw: number; pitch: number; fov: number }

export const MIN_DIST = 7.5
const FAR_DIST = 96
const LENS = 27
const HOME_YAW = 0.16
const SLOPE = (profile(5) - profile(-8)) / 13
export const MOVE_MS = 800

// Looking down steeply from far off, along the rows to the horizon from close in.
export function pitchFor(dist: number): number {
  const t = smooth(Math.log(MIN_DIST), Math.log(FAR_DIST), Math.log(dist))
  return mix(0.105, 0.82, Math.pow(t, 0.8))
}

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
  return out
}

// What has to be in frame for the farm to be whole: the six fields, the farmstead, the brook.
const FIELD_MARKS: Vector3[] = FIELDS.flatMap(f => [
  new Vector3(f.x0, fieldBaseY(f.z0) + 0.5, f.z0), new Vector3(f.x1, fieldBaseY(f.z0) + 0.5, f.z0),
  new Vector3(f.x0, fieldBaseY(f.z1), f.z1), new Vector3(f.x1, fieldBaseY(f.z1), f.z1),
])
const FARM_MARKS: Vector3[] = [
  ...FIELD_MARKS, new Vector3(27.4, profile(-20) + 3.2, -20.5), new Vector3(27.2, profile(6) + 3.4, 7), new Vector3(-17.4, profile(-21) + 0.6, -21.6),
  new Vector3(-17.4, 0.4, 23.2), new Vector3(20, 0.4, 23.6),
]

export class CameraRig {
  readonly camera = new PerspectiveCamera(LENS, 1, 0.3, 9000)
  // Where the player has asked the camera to be, and where it is.
  readonly goal: Pose = { x: FARM_CENTER.x, z: FARM_CENTER.z, dist: 90, yaw: HOME_YAW, pitch: pitchFor(90), fov: LENS }
  readonly cur: Pose = { ...this.goal }
  private move: { from: Pose; to: Pose; t: number; ms: number } | null = null
  private shift = { x: 0, y: 0 }
  private shiftGoal = { x: 0, y: 0 }
  private homeKey = ''
  private homePose: Pose = { ...this.goal }
  private v = new Vector3()
  private probe = new PerspectiveCamera(LENS, 1, 0.3, 9000)
  private tmp: Pose = { ...this.goal }
  // Seconds since the player last moved the camera by hand.
  idle = 99

  private place(c: PerspectiveCamera, p: Pose, vp: Viewport, sx: number, sy: number): void {
    const ty = profile(clamp(p.z, -40, 30)) + 0.35
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch)
    c.fov = p.fov
    c.aspect = vp.w / vp.h
    c.near = clamp(p.dist * 0.04, 0.2, 3)
    c.far = 9000
    let x = p.x - Math.sin(p.yaw) * cp * p.dist, z = p.z + Math.cos(p.yaw) * cp * p.dist, y = ty + sp * p.dist
    const floor = groundY(x, z) + 0.85
    if (y < floor) y = floor
    c.position.set(x, y, z)
    c.lookAt(p.x, ty, p.z)
    if (sx || sy) c.setViewOffset(vp.w, vp.h, -sx, -sy, vp.w, vp.h)
    else c.clearViewOffset()
    c.updateProjectionMatrix()
    c.updateMatrixWorld(true)
  }

  private offsetFor(vp: Viewport): { x: number; y: number } {
    // Never shift the picture's centre so far that it leaves the window.
    return { x: clamp((vp.left - vp.right) / 2, -vp.w * 0.3, vp.w * 0.3), y: clamp((vp.top - vp.bottom) / 2, -vp.h * 0.3, vp.h * 0.3) }
  }

  // The view that holds the whole farm inside what the interface leaves free.
  home(vp: Viewport): Pose {
    const key = `${vp.w}|${vp.h}|${vp.top}|${vp.right}|${vp.bottom}|${vp.left}`
    if (key === this.homeKey) return this.homePose
    this.homeKey = key
    const fw = Math.max(160, vp.w - vp.left - vp.right), fh = Math.max(140, vp.h - vp.top - vp.bottom)
    // On a narrow window the six fields fill the room and the farmyard may run off the edge.
    const wide = smooth(520, 900, fw)
    const off = this.offsetFor(vp)
    const fit = (marks: Vector3[]): Pose => {
      const p: Pose = { x: FARM_CENTER.x, z: FARM_CENTER.z, dist: 90, yaw: HOME_YAW, pitch: 0, fov: LENS }
      const margin = Math.min(fw, fh) * 0.045
      for (let k = 0; k < 7; k++) {
        p.pitch = pitchFor(p.dist)
        this.place(this.probe, p, vp, off.x, off.y)
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
        for (const m of marks) {
          this.v.copy(m).project(this.probe)
          const x = (this.v.x + 1) / 2 * vp.w, y = (1 - this.v.y) / 2 * vp.h
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
        }
        p.dist = clamp(p.dist * Math.max((x1 - x0) / (fw - margin * 2), (y1 - y0) / (fh - margin * 2)), 20, 260)
        // Centre what is to be seen in the free area.
        const cx = vp.left + fw / 2, cy = vp.top + fh / 2
        const g0 = this.ground(this.probe, (x0 + x1) / 2, (y0 + y1) / 2, vp, p), g1 = this.ground(this.probe, cx, cy, vp, p)
        p.x += g0.x - g1.x
        p.z += g0.z - g1.z
      }
      p.pitch = pitchFor(p.dist)
      return p
    }
    const a = fit(FIELD_MARKS), b = fit(FARM_MARKS)
    this.homePose = blend(a, b, wide, { ...a })
    this.homePose.pitch = pitchFor(this.homePose.dist)
    return this.homePose
  }

  // The view of one field: it fills about half the free area.
  fieldPose(i: number, vp: Viewport): Pose {
    const f = FIELDS[i], h = this.home(vp)
    return { x: f.cx, z: f.cz, dist: clamp(h.dist * 0.42, 24, 60), yaw: this.goal.yaw, pitch: pitchFor(clamp(h.dist * 0.42, 24, 60)), fov: LENS }
  }

  // The key frame: low over the brook, the bottom fields' blossom close in front, looking up the slope past the
  // farmstead to the spruce. The camera stands below what it looks at, so the pitch is a little upward.
  // `start`: where the shot begins, down at the water with the mist, before it rises to the key frame.
  titlePose(vp: Viewport, start = false): Pose {
    const narrow = 1 - smooth(0.7, 1.3, vp.w / vp.h)
    if (start) return { x: mix(20.1, 22.6, narrow), z: mix(-13, -6, narrow), dist: mix(44, 40, narrow), yaw: mix(0.5, 0.78, narrow), pitch: -0.071, fov: mix(30, 40, narrow) }
    return { x: mix(21.7, 23.4, narrow), z: mix(-13.6, -6, narrow), dist: mix(40, 36, narrow), yaw: mix(0.5, 0.78, narrow), pitch: mix(0.004, 0.02, narrow), fov: mix(30, 40, narrow) }
  }

  // The point of the farm's slope under a pixel.
  private ground(c: PerspectiveCamera, px: number, py: number, vp: Viewport, at: Pose): { x: number; z: number } {
    this.v.set((px / vp.w) * 2 - 1, -(py / vp.h) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize()
    const o = c.position, d = this.v
    const y0 = profile(clamp(at.z, -40, 30)) + 0.1
    const den = d.y - SLOPE * d.z
    let t = (y0 + SLOPE * (o.z - at.z) - o.y) / (Math.abs(den) > 1e-4 ? den : -1e-4)
    if (t < 0 || t > 600) t = 600
    return { x: o.x + d.x * t, z: o.z + d.z * t }
  }

  private byHand(): void {
    if (this.move) { Object.assign(this.goal, this.cur); this.move = null }
    this.idle = 0
  }

  private bound(vp: Viewport): void {
    const g = this.goal
    g.x = clamp(g.x, FARM.x0 + 2, FARM.x1 - 2)
    g.z = clamp(g.z, FARM.z0 + 2, FARM.z1 - 2)
    g.dist = clamp(g.dist, MIN_DIST, Math.max(this.home(vp).dist * 1.12, 70))
    g.pitch = pitchFor(g.dist)
    g.fov = LENS
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

  // `drift` (title only): a slow breathing of the shot, -1..1.
  update(dt: number, vp: Viewport, still: boolean, drift = 0): void {
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
    const p = Object.assign(this.tmp, this.cur)
    if (drift) {
      p.x += 2.2 * drift
      p.yaw += 0.035 * drift
      p.dist *= 1 - 0.035 * drift
    }
    this.place(this.camera, p, vp, this.shift.x, this.shift.y)
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
    return this.v.set(this.cur.x, profile(clamp(this.cur.z, -40, 30)), this.cur.z).distanceTo(this.camera.position)
  }

  where(): { x: number; y: number; z: number; dist: number; yaw: number } {
    const p = this.camera.position
    return { x: p.x, y: p.y, z: p.z, dist: this.cur.dist, yaw: this.cur.yaw }
  }
}
