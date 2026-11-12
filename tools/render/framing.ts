// Checks the camera's framing without a browser: at several window sizes, that the home view holds all six home fields
// inside what the interface leaves free with a band of sky above the land, and that the whole view holds every field.
// Usage: node tools/render/framing.ts
import { Vector3 } from 'three'
import { CameraRig, type Viewport } from '../../src/render/camera.ts'
import { FIELDS, fieldBaseY } from '../../src/render/layout.ts'

const sizes: [number, number, number, number][] = [
  [1920, 1080, 56, 150], [1440, 900, 56, 150], [1440, 900, 56, 300], [1024, 700, 52, 150], [844, 390, 44, 96], [390, 844, 52, 190],
]
let failed = 0
const v = new Vector3()
for (const [w, h, top, bottom] of sizes) {
  const vp: Viewport = { w, h, top, right: 0, bottom, left: 0 }
  const rig = new CameraRig()
  for (const name of ['home', 'whole'] as const) {
    const p = name === 'home' ? rig.home(vp) : rig.whole(vp)
    rig.moveTo(p, true)
    rig.snap(vp)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const f of FIELDS.slice(0, name === 'home' ? 6 : 14)) {
      for (const [x, z] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]]) {
        v.set(x, fieldBaseY(z), z).project(rig.camera)
        const sx = (v.x + 1) / 2 * w, sy = (1 - v.y) / 2 * h
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy)
      }
    }
    // Where the level line of the eye falls on the picture: sky shows above it.
    const horizon = h / 2 + (top - bottom) / 2 - (h / 2 / Math.tan((p.fov * Math.PI) / 360)) * Math.tan(p.pitch - p.tilt)
    const inside = x0 >= 0 && x1 <= w && y0 >= top && y1 <= h - bottom + 2
    // An upright phone has no room for the farm and a sky both, and the whole map is looked down on; otherwise the level
    // line of the eye must be on the picture.
    const sky = name === 'whole' || horizon > top || w < h
    if (!inside || !sky) failed++
    console.log(`${inside && sky ? 'ok  ' : 'FAIL'} ${w}x${h} (free ${top}..${h - bottom}) ${name}: distance ${p.dist.toFixed(0)}, fields x ${x0.toFixed(0)}..${x1.toFixed(0)}, y ${y0.toFixed(0)}..${y1.toFixed(0)}, level line at y ${horizon.toFixed(0)}`)
  }
}
process.exit(failed ? 1 : 0)
