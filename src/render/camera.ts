// The camera of a strategy map that is also a landscape. It looks at a point on the land from a distance, and the lens
// is raised above that line so the far edge of the picture takes in the woods, the back country, the hills and a band
// of sky. It has four tiers, and zooms smoothly through them: the yard (down to a walker's eye level), the field (the
// playing view: the field in hand about a third of the picture's width, three to five fields in frame), the farm (the
// whole home farm) and the county (every parcel). Whatever it frames, it frames inside what the interface leaves free.
// The player's own moves are damped; moves the game makes (a change of screen, a field brought into frame) are timed.
import { FAR_REACH } from './far.ts'
import { PerspectiveCamera, Vector3 } from 'three'
import { FALL, FARM, FIELDS, YARD_AT, fieldBaseY, groundY, profile } from './layout.ts'
import { clamp, mix, smooth } from './noise.ts'

export interface Viewport { w: number; h: number; top: number; right: number; bottom: number; left: number }
// pitch: how steeply the camera looks down at its point on the ground. tilt: how far the lens is raised above that line.
export interface Pose { x: number; z: number; dist: number; yaw: number; pitch: number; fov: number; tilt: number }
export type TierName = 'yard' | 'field' | 'farm' | 'county'

export const MIN_DIST = 7.5
// The steepest the player can tip the view: a little short of straight down, so north stays up.
const STEEP = 1.46
// How far the picture reaches: past the last range of hills (src/render/far.ts).
export const FAR = FAR_REACH + 3200
// The land is seen from the brook side, turned toward the low sun: three-quarter back light.
export const HOME_YAW = -0.24
// The field the playing view opens on: the one beside the farmstead, so the yard is in the picture.
export const HOME_FIELD = 3
const SLOPE = -FALL
export const MOVE_MS = 800
// How high the far hills stand above the level line of the eye (radians).
const CREST = 0.05

// By distance in metres: the pitch, how far below level the lens itself points, and the lens (degrees, vertical).
// Near a yard the eye comes down to a walker's; from the field tier out the level line stays on the picture, so
// there is always a horizon; the lens draws in a little with distance, so far hills do not shrink to a thread.
const VIEW: [number, number, number, number][] = [
  [7.5, 0.09, 0, 40], [25, 0.16, 0.05, 40], [70, 0.24, 0.1, 41], [200, 0.32, 0.15, 42], [420, 0.38, 0.165, 42],
  [700, 0.47, 0.19, 41], [1100, 0.6, 0.23, 39], [2200, 0.74, 0.27, 37], [8000, 0.9, 0.3, 35],
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

const corners = (f: (typeof FIELDS)[number]) => [
  new Vector3(f.x0, fieldBaseY(f.z0) + 1, f.z0), new Vector3(f.x1, fieldBaseY(f.z0) + 1, f.z0),
  new Vector3(f.x0, fieldBaseY(f.z1), f.z1), new Vector3(f.x1, fieldBaseY(f.z1), f.z1),
]
// A yard, with its roofs.
const yardMarks = (yard: number): Vector3[] => {
  const y = YARD_AT[yard]
  return [0, 10].flatMap(up => [[y.x0, y.z0], [y.x1, y.z0], [y.x0, y.z1], [y.x1, y.z1]].map(([x, z]) => new Vector3(x, profile(z) + up, z)))
}
// The farm tier holds the home farm as its walls hold it: the six fields, the farmstead and its back yard, the swale
// and the woodlot behind; the county tier every parcel and both yards.
const FARM_MARKS: Vector3[] = [
  ...FIELDS.filter(f => f.block === 'home').flatMap(corners), ...yardMarks(-1),
  ...[[FARM.x0, FARM.z0], [FARM.x1, FARM.z0], [FARM.x0, FARM.z1], [FARM.x1, FARM.z1]].map(([x, z]) => new Vector3(x, profile(z), z)),
]
const ALL_MARKS: Vector3[] = [...FIELDS.flatMap(corners), ...yardMarks(-1), ...yardMarks(-2)]
// Where the camera's point on the ground may go: over every parcel and yard, and a little beyond.
const ROAM = (() => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const m of ALL_MARKS) { x0 = Math.min(x0, m.x); x1 = Math.max(x1, m.x); z0 = Math.min(z0, m.z); z1 = Math.max(z1, m.z) }
  return { x0: x0 - 120, x1: x1 + 120, z0: z0 - 120, z1: z1 + 160 }
})()

// The opening shot. It starts high and far beyond the brook, looking into the last of the sun, so the size of the
// country is the first thing seen: the whole farm small below, the woods, the back country and the hills. It comes down
// over the swale, and ends a barn's height over the pasture below the dooryard: the farmstead, the tractor coming
// down the lane with its driver, the rows of the middle field running away to the woods and the hills, the sun low
// ahead. The title's card covers the left third of the window, so all of that is composed into the right two thirds;
// and the camera stands clear of every tree and pole.
// Each is the place looked at, how far off, and the way of looking.
const TITLE: Pose[] = [
  { x: 40, z: -20, dist: 1650, yaw: -1.02, pitch: 0.27, fov: 31, tilt: 0.152 },
  { x: 120, z: 30, dist: 640, yaw: -1.0, pitch: 0.19, fov: 32, tilt: 0.1 },
  { x: 200, z: -10, dist: 200, yaw: -1.04, pitch: 0.14, fov: 33, tilt: 0.085 },
  { x: 208, z: -31, dist: 100, yaw: -1.1, pitch: 0.12, fov: 34, tilt: 0.07 },
]
// The time of each of those along the move, 0..1: most of it is spent coming down the last of the way.
const TITLE_AT = [0, 0.4, 0.78, 1]

// A smooth curve through numbers given at times: no corner anywhere (Catmull-Rom).
function through(v: number[], at: number[], u: number): number {
  let i = 0
  while (i < v.length - 2 && at[i + 1] <= u) i++
  const t = clamp((u - at[i]) / (at[i + 1] - at[i]), 0, 1)
  const p0 = v[Math.max(0, i - 1)], p1 = v[i], p2 = v[i + 1], p3 = v[Math.min(v.length - 1, i + 2)]
  const h = at[i + 1] - at[i]
  const m1 = i > 0 ? ((p2 - p0) / (at[i + 1] - at[i - 1])) * h : p2 - p1
  const m2 = i + 2 < v.length ? ((p3 - p1) / (at[i + 2] - at[i])) * h : p2 - p1
  const t2 = t * t, t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2
}

interface Fit { start: number; yaw: number; wide: number; tall: number; at?: number }

export class CameraRig {
  readonly camera = new PerspectiveCamera(42, 1, 0.5, FAR)
  // Where the player has asked the camera to be, and where it is.
  readonly goal: Pose = this.at({ x: FIELDS[HOME_FIELD].cx, z: FIELDS[HOME_FIELD].cz, dist: 420, yaw: HOME_YAW })
  readonly cur: Pose = { ...this.goal }
  private move: { from: Pose; to: Pose; t: number; ms: number } | null = null
  private shift = { x: 0, y: 0 }
  private shiftGoal = { x: 0, y: 0 }
  private fits = new Map<string, Pose>()
  private titled: Pose = { ...this.goal }
  private v = new Vector3()
  private probe = new PerspectiveCamera(42, 1, 0.5, FAR)
  // Seconds since the player last moved the camera by hand.
  idle = 99
  // How far the player has tipped the view over toward straight down, 0 (as each distance sets it) to 1.
  private lean = 0
  private leanGoal = 0

  private place(c: PerspectiveCamera, p: Pose, vp: Viewport, sx: number, sy: number): void {
    const ty = profile(clamp(p.z, ROAM.z0, ROAM.z1)) + 0.8
    const pitch = p.pitch + (STEEP - p.pitch) * this.lean, tilt = p.tilt * (1 - this.lean)
    const cp = Math.cos(pitch), sp = Math.sin(pitch)
    c.fov = p.fov
    c.aspect = vp.w / vp.h
    // The nearer the nearest thing drawn, the less depth there is to tell a road from the ground under it a
    // kilometre off: the near edge of the picture stands as far out as each distance allows.
    c.near = clamp(p.dist * 0.06, 0.8, 40)
    c.far = FAR
    const x = p.x - Math.sin(p.yaw) * cp * p.dist, z = p.z + Math.cos(p.yaw) * cp * p.dist
    let y = ty + sp * p.dist
    const floor = groundY(x, z) + 1.7
    if (y < floor) y = floor
    c.position.set(x, y, z)
    c.lookAt(p.x, ty, p.z)
    if (tilt) c.rotateX(tilt)
    if (sx || sy) c.setViewOffset(vp.w, vp.h, -sx, -sy, vp.w, vp.h)
    else c.clearViewOffset()
    c.updateProjectionMatrix()
    c.updateMatrixWorld(true)
  }

  private offsetFor(vp: Viewport): { x: number; y: number } {
    // Never shift the picture's centre so far that it leaves the window.
    return { x: clamp((vp.left - vp.right) / 2, -vp.w * 0.3, vp.w * 0.3), y: clamp((vp.top - vp.bottom) / 2, -vp.h * 0.3, vp.h * 0.3) }
  }

  // How upright the window is, 0 (a screen) to 1 (a phone held upright). An upright window is narrow: with the
  // screen's lens it would see one field and no sky, so it is given a wider lens, pointed a little lower, which puts
  // the horizon in its top fifth and several fields below it.
  private upright = 0
  private shape(vp: Viewport): void {
    this.upright = 1 - smooth(0.62, 1, vp.w / vp.h)
  }

  // A view at a distance, with the pitch, lens and raise that go with it.
  at(p: { x: number; z: number; dist: number; yaw: number }): Pose {
    const n = this.upright
    return { x: p.x, z: p.z, dist: p.dist, yaw: p.yaw, pitch: pitchFor(p.dist), fov: fovFor(p.dist) + 20 * n, tilt: tiltFor(p.dist) - 0.07 * n }
  }

  // A view given in part (by a tool): what is not given follows from the distance.
  complete(p: Partial<Pose>): Pose {
    const dist = p.dist ?? this.goal.dist
    const std = this.at({ x: 0, z: 0, dist, yaw: 0 })
    return {
      x: p.x ?? this.goal.x, z: p.z ?? this.goal.z, dist, yaw: p.yaw ?? this.goal.yaw,
      pitch: p.pitch ?? std.pitch, fov: p.fov ?? std.fov, tilt: p.tilt ?? (p.pitch === undefined ? std.tilt : Math.min(std.tilt, Math.max(0, p.pitch - 0.04))),
    }
  }

  // The view that holds `marks` in the ground the interface leaves free, below the band of woods, hills and sky.
  // wide, tall: the share of that ground's width and height the marks are to take. at: how far down it their middle
  // sits (left out: as low as they will go, so the room to spare is given to the hills and the sky).
  private fit(marks: Vector3[], vp: Viewport, o: Fit): Pose {
    this.shape(vp)
    const fw = Math.max(120, vp.w - vp.left - vp.right)
    const off = this.offsetFor(vp)
    let cx0 = 0, cz0 = 0
    for (const m of marks) { cx0 += m.x; cz0 += m.z }
    const p = this.at({ x: cx0 / marks.length, z: cz0 / marks.length, dist: o.start, yaw: o.yaw })
    // What the marks cover on the picture from the view as it stands, and the ground they are to be kept in.
    const box = { x0: 0, x1: 0, y0: 0, y1: 0, top: 0, fh: 0, margin: 0 }
    const look = () => {
      Object.assign(p, this.at(p))
      this.place(this.probe, p, vp, off.x, off.y)
      // Where the crest of the far hills stands on the picture: the land is kept below it, with room for the woods between.
      const focal = vp.h / 2 / Math.tan((p.fov * Math.PI) / 360)
      const crest = vp.h / 2 + off.y - focal * Math.tan(p.pitch - p.tilt + CREST)
      box.top = Math.max(vp.top, Math.min(crest + vp.h * 0.05, vp.h * 0.45))
      box.fh = Math.max(100, vp.h - vp.bottom - box.top)
      box.margin = Math.min(fw, box.fh) * 0.035
      box.x0 = box.y0 = Infinity
      box.x1 = box.y1 = -Infinity
      for (const m of marks) {
        this.v.copy(m).project(this.probe)
        const x = (this.v.x + 1) / 2 * vp.w, y = (1 - this.v.y) / 2 * vp.h
        box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y)
      }
    }
    const centre = () => {
      for (let j = 0; j < 6; j++) {
        look()
        const cx = vp.left + fw / 2
        const low = vp.h - vp.bottom - box.margin - (box.y1 - box.y0) / 2
        const cy = o.at === undefined ? Math.max(box.top + box.fh / 2, low) : Math.min(box.top + box.fh * o.at, low)
        const g0 = this.ground(this.probe, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, vp, p), g1 = this.ground(this.probe, cx, cy, vp, p)
        p.x += (g0.x - g1.x) * 0.85
        p.z += (g0.z - g1.z) * 0.85
      }
    }
    // The distance comes in a part of the way at a time, the marks centred again at each, so the two cannot chase each other.
    for (let k = 0; k < 26; k++) {
      centre()
      look()
      const over = Math.max((box.x1 - box.x0) / (fw * o.wide - box.margin * 2), (box.y1 - box.y0) / (box.fh * o.tall - box.margin * 2))
      p.dist = clamp(p.dist * clamp(Math.pow(over, 0.6), 0.8, 1.25), 30, 12000)
    }
    centre()
    return this.at(p)
  }

  private cached(name: string, vp: Viewport, make: () => Pose): Pose {
    const key = `${name}|${vp.w}|${vp.h}|${vp.top}|${vp.right}|${vp.bottom}|${vp.left}`
    let p = this.fits.get(key)
    if (!p) {
      if (this.fits.size > 60) this.fits.clear()
      p = make()
      this.fits.set(key, p)
    }
    return p
  }

  // The field tier: the field in hand about a third of the free width (more of it on an upright window), low in the
  // picture, with the fields beyond it, the woods, the hills and the sky above.
  field(i: number, vp: Viewport, yaw = HOME_YAW): Pose {
    const f = FIELDS[i] ?? FIELDS[HOME_FIELD]
    const fw = Math.max(120, vp.w - vp.left - vp.right)
    // A third of what is free, and never less than three tenths of the window: under a sheet the field does not shrink away.
    const wide = Math.min(0.62, Math.max(mix(0.56, 0.36, smooth(420, 1000, fw)), (0.3 * vp.w) / fw))
    return this.cached(`field${f.i}@${yaw.toFixed(2)}`, vp, () => this.fit(corners(f), vp, { start: 420, yaw, wide, tall: 0.42, at: 0.7 }))
  }

  // The farm tier: the six home fields and the farmstead.
  farm(vp: Viewport): Pose {
    return this.cached('farm', vp, () => this.fit(FARM_MARKS, vp, { start: 900, yaw: HOME_YAW, wide: 1, tall: 1 }))
  }

  // The county tier: every parcel and both yards, the whole map.
  county(vp: Viewport): Pose {
    return this.cached('county', vp, () => this.fit(ALL_MARKS, vp, { start: 2800, yaw: HOME_YAW * 0.5, wide: 1, tall: 1 }))
  }

  // The yard tier: a farmstead filling the free ground, from a little above its roofs.
  yard(yard: number, vp: Viewport, yaw = HOME_YAW): Pose {
    return this.cached(`yard${yard}@${yaw.toFixed(2)}`, vp, () => this.fit(yardMarks(YARD_AT[yard] ? yard : -1), vp, { start: 80, yaw, wide: 0.8, tall: 0.6, at: 0.6 }))
  }

  tier(name: TierName, vp: Viewport, field = HOME_FIELD, yard = -1): Pose {
    return name === 'yard' ? this.yard(yard, vp) : name === 'field' ? this.field(field, vp) : name === 'farm' ? this.farm(vp) : this.county(vp)
  }

  // The tier a distance belongs to.
  tierOf(dist: number, vp: Viewport): TierName {
    const f = this.field(HOME_FIELD, vp).dist, a = this.farm(vp).dist, c = this.county(vp).dist
    return dist < f * 0.45 ? 'yard' : dist < Math.sqrt(f * a) ? 'field' : dist < Math.sqrt(a * c) ? 'farm' : 'county'
  }

  // True when the camera is at (or going to) this view.
  isAt(p: Pose): boolean {
    const g = this.goal
    return Math.hypot(g.x - p.x, g.z - p.z) < 0.04 * p.dist + 2 && Math.abs(Math.log(g.dist / p.dist)) < 0.08 && Math.abs(turn(g.yaw, p.yaw)) < 0.05
  }

  // The opening shot at a point of its move, 0..1 (see TITLE).
  titlePose(vp: Viewport, u = 0): Pose {
    const p = this.titled, t = clamp(u, 0, 1)
    p.x = through(TITLE.map(k => k.x), TITLE_AT, t)
    p.z = through(TITLE.map(k => k.z), TITLE_AT, t)
    p.dist = Math.exp(through(TITLE.map(k => Math.log(k.dist)), TITLE_AT, t))
    p.yaw = through(TITLE.map(k => k.yaw), TITLE_AT, t)
    p.pitch = through(TITLE.map(k => k.pitch), TITLE_AT, t)
    p.fov = through(TITLE.map(k => k.fov), TITLE_AT, t)
    p.tilt = through(TITLE.map(k => k.tilt), TITLE_AT, t)
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
    const y0 = profile(clamp(at.z, ROAM.z0, ROAM.z1)) + 0.2
    const den = d.y - SLOPE * d.z
    let t = (y0 + SLOPE * (o.z - at.z) - o.y) / (Math.abs(den) > 1e-4 ? den : -1e-4)
    const far = at.dist * 3.2 + 300
    if (t < 0 || t > far) t = far
    return { x: o.x + d.x * t, z: o.z + d.z * t }
  }

  // The ground in the middle of what the interface leaves free: where the picture is looking.
  looksAt(vp: Viewport): { x: number; z: number } {
    return this.ground(this.camera, vp.left + (vp.w - vp.left - vp.right) / 2, vp.top + (vp.h - vp.top - vp.bottom) * 0.56, vp, this.cur)
  }

  private byHand(): void {
    if (this.move) { Object.assign(this.goal, this.cur); this.move = null }
    this.idle = 0
  }

  private bound(vp: Viewport): void {
    const g = this.goal
    g.x = clamp(g.x, ROAM.x0, ROAM.x1)
    g.z = clamp(g.z, ROAM.z0, ROAM.z1)
    g.dist = clamp(g.dist, MIN_DIST, Math.max(this.county(vp).dist * 1.15, this.farm(vp).dist * 1.3, 1200))
    this.shape(vp)
    const std = this.at(g)
    g.pitch = std.pitch
    g.fov = std.fov
    g.tilt = std.tilt
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

  // Tips the view over toward straight down (positive) or back toward the horizon.
  leanBy(amount: number): void {
    this.idle = 0
    this.leanGoal = clamp(this.leanGoal + amount, 0, 1)
  }

  // Back to the tilt each distance sets.
  level(): void {
    this.leanGoal = 0
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
    this.lean += (this.leanGoal - this.lean) * (still ? 1 : 1 - Math.exp(-dt / 0.12))
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
    return this.v.set(this.cur.x, profile(clamp(this.cur.z, ROAM.z0, ROAM.z1)), this.cur.z).distanceTo(this.camera.position)
  }

  where(): { x: number; y: number; z: number; dist: number; yaw: number } {
    const p = this.camera.position
    return { x: p.x, y: p.y, z: p.z, dist: this.cur.dist, yaw: this.cur.yaw }
  }
}
