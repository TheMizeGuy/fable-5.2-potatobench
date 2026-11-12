// Checks the camera's four tiers without a browser, at several window sizes and with the screen edges the interface
// covers in each screen (a top bar and a low card; a sheet over the right third in spring; a command bar over the right
// quarter in the season; an upright phone's bottom sheet):
//   yard:   the farmstead inside what the interface leaves free;
//   field:  the field in hand inside it and about a third of its width, at least three fields in the picture, and the
//           level line of the eye on the picture, so there is a horizon and sky;
//   farm:   the six home fields and the farmstead inside it;
//   county: every parcel and both yards inside it.
// Usage: node tools/render/framing.ts [--all]   (--all prints every line, not only the failures and a summary)
import { Vector3 } from 'three'
import { CameraRig, HOME_FIELD, type Pose, type TierName, type Viewport } from '../../src/render/camera.ts'
import { FIELDS, YARD_AT, fieldBaseY, profile } from '../../src/render/layout.ts'

const all = process.argv.includes('--all')
// width, height, then the edges covered: top, right, bottom, left
const windows: [string, number, number, number, number, number, number][] = [
  ['1920x1080 bar and card', 1920, 1080, 56, 0, 150, 0],
  ['1920x1080 spring sheet (right third)', 1920, 1080, 56, 640, 0, 0],
  ['1920x1080 season bar (right quarter)', 1920, 1080, 56, 480, 90, 0],
  ['1440x900 bar and card', 1440, 900, 56, 0, 150, 0],
  ['1440x900 spring sheet', 1440, 900, 56, 480, 0, 0],
  ['1440x900 season bar', 1440, 900, 56, 360, 90, 0],
  ['1440x900 tall card', 1440, 900, 56, 0, 300, 0],
  ['1024x700 bar and card', 1024, 700, 52, 0, 150, 0],
  ['1024x700 season bar', 1024, 700, 52, 256, 80, 0],
  ['844x390 phone on its side', 844, 390, 44, 0, 96, 0],
  ['390x844 phone upright', 390, 844, 52, 0, 190, 0],
]
let failed = 0, checked = 0
const v = new Vector3()

function span(rig: CameraRig, vp: Viewport, pts: [number, number, number][]): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const [x, y, z] of pts) {
    v.set(x, y, z).project(rig.camera)
    const sx = (v.x + 1) / 2 * vp.w, sy = (1 - v.y) / 2 * vp.h
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy)
  }
  return { x0, x1, y0, y1 }
}
const fieldPts = (i: number): [number, number, number][] => {
  const f = FIELDS[i]
  return [[f.x0, fieldBaseY(f.z0), f.z0], [f.x1, fieldBaseY(f.z0), f.z0], [f.x0, fieldBaseY(f.z1), f.z1], [f.x1, fieldBaseY(f.z1), f.z1]]
}
const yardPts = (yard: number): [number, number, number][] => {
  const y = YARD_AT[yard]
  return [0, 9].flatMap(up => [[y.x0, profile(y.z0) + up, y.z0], [y.x1, profile(y.z0) + up, y.z0], [y.x0, profile(y.z1) + up, y.z1], [y.x1, profile(y.z1) + up, y.z1]] as [number, number, number][])
}

for (const [label, w, h, top, right, bottom, left] of windows) {
  const vp: Viewport = { w, h, top, right, bottom, left }
  const rig = new CameraRig()
  const free = { x0: left, x1: w - right, y0: top, y1: h - bottom }
  const inside = (b: { x0: number; x1: number; y0: number; y1: number }) => b.x0 >= free.x0 - 2 && b.x1 <= free.x1 + 2 && b.y0 >= free.y0 - 2 && b.y1 <= free.y1 + 2
  const upright = w < h
  const cases: [TierName, number][] = [['yard', -1], ['yard', -2], ['field', HOME_FIELD], ['field', 0], ['field', 4], ['field', 7], ['field', 8], ['field', 13], ['farm', 0], ['county', 0]]
  let last: Pose | null = null
  for (const [tier, n] of cases) {
    const p = tier === 'yard' ? rig.yard(n, vp) : tier === 'field' ? rig.field(n, vp) : rig.tier(tier, vp)
    rig.moveTo(p, true)
    rig.snap(vp)
    // Where the level line of the eye falls on the picture: sky shows above it.
    const horizon = h / 2 + (top - bottom) / 2 - (h / 2 / Math.tan((p.fov * Math.PI) / 360)) * Math.tan(p.pitch - p.tilt)
    let ok = true, what = ''
    if (tier === 'yard') {
      const b = span(rig, vp, yardPts(n))
      ok = inside(b)
      what = `yard x ${b.x0.toFixed(0)}..${b.x1.toFixed(0)} y ${b.y0.toFixed(0)}..${b.y1.toFixed(0)}`
    } else if (tier === 'field') {
      const b = span(rig, vp, fieldPts(n))
      const share = (b.x1 - b.x0) / (free.x1 - free.x0)
      // Fields with their middle in the picture.
      let seen = 0
      for (const f of FIELDS) { v.set(f.cx, fieldBaseY(f.cz), f.cz).project(rig.camera); if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) seen++ }
      const third = upright ? share > 0.4 && share <= 0.75 : share >= 0.26 && share <= 0.64 && (b.x1 - b.x0) / w >= 0.2
      // An upright phone: the horizon in the top fifth of what is free, or thereabouts, and sky above it.
      const sky = upright ? horizon > top + 30 && horizon < top + 0.3 * (free.y1 - free.y0) : horizon > top + 8
      // (The lot at the map's corner has one neighbour and woods: on an upright phone it is seen nearly alone.)
      ok = inside(b) && third && (seen >= 3 || (upright && n === 8)) && sky
      what = `field x ${b.x0.toFixed(0)}..${b.x1.toFixed(0)} y ${b.y0.toFixed(0)}..${b.y1.toFixed(0)}, ${(share * 100).toFixed(0)}% of the free width, ${seen} fields in the picture, level line at y ${horizon.toFixed(0)}`
    } else {
      const pts = tier === 'farm' ? [...[0, 1, 2, 3, 4, 5, 14, 15].flatMap(fieldPts), ...yardPts(-1)] : [...FIELDS.flatMap(f => fieldPts(f.i)), ...yardPts(-1), ...yardPts(-2)]
      const b = span(rig, vp, pts)
      const tall = (b.y1 - b.y0) / (free.y1 - free.y0)
      // The tiers must be steps: each a good deal further off than the one before.
      const step = !last || p.dist > last.dist * 1.25
      ok = inside(b) && step && (tier === 'county' || upright || horizon > top + 8)
      what = `land x ${b.x0.toFixed(0)}..${b.x1.toFixed(0)} y ${b.y0.toFixed(0)}..${b.y1.toFixed(0)} (${(tall * 100).toFixed(0)}% of the free height), level line at y ${horizon.toFixed(0)}`
      last = p
    }
    if (tier === 'field' && n === HOME_FIELD) last = p
    checked++
    if (!ok) failed++
    if (!ok || all) console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} (free x ${free.x0}..${free.x1}, y ${free.y0}..${free.y1}) ${tier}${tier === 'field' || tier === 'yard' ? ' ' + n : ''}: ${p.dist.toFixed(0)} m off, pitch ${p.pitch.toFixed(2)}, lens ${p.fov.toFixed(0)}; ${what}`)
  }
  if (!all) {
    const f = rig.field(HOME_FIELD, vp), a = rig.farm(vp), c = rig.county(vp), y = rig.yard(-1, vp)
    console.log(`     ${label}: yard ${y.dist.toFixed(0)} m, field ${f.dist.toFixed(0)} m, farm ${a.dist.toFixed(0)} m, county ${c.dist.toFixed(0)} m`)
  }
}
console.log(`${checked - failed} of ${checked} framings hold`)
process.exit(failed ? 1 : 0)
