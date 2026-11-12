// Where things fall on the picture at points of the opening shot, without a browser: the sun, the tractor on its way
// down the farm road, the poles beside it, the farmstead and the field in blossom. For composing the shot.
// Usage: node tools/render/titleprobe.ts [u ...]   (u: points of the move, 0..1; default 0 0.6 1)
import { Vector3 } from 'three'
import { CameraRig, type Viewport } from '../../src/render/camera.ts'
import { light, makeEnv, makeLight } from '../../src/render/env.ts'
import { BARN, FIELDS, HOUSE, POTATO_HOUSE, ROAD, WIDE, fieldBaseY, groundY, townRoadZ } from '../../src/render/layout.ts'
import { S } from '../../src/render/scale.ts'

const us = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n))
const vp: Viewport = { w: 1920, h: 1080, top: 0, right: 0, bottom: 0, left: 0 }
const rig = new CameraRig()
const v = new Vector3()
const at = (x: number, y: number, z: number): string => {
  v.set(x, y, z).project(rig.camera)
  return v.z > 1 ? 'behind' : `${Math.round((v.x + 1) / 2 * vp.w)},${Math.round((1 - v.y) / 2 * vp.h)}`
}
// The poles as src/render/yard.ts lays them up the farm road (every fifty metres, on its east side).
const poles: [number, number][] = []
{
  const gap = 50
  let run = 0
  for (let k = ROAD.length - 1; k > 5; k--) {
    const [ax, az] = ROAD[k], [cx, cz] = ROAD[k - 1], len = Math.hypot(cx - ax, cz - az)
    for (let d = gap - run; d < len; d += gap) {
      const t = d / len, nx = -(cz - az) / len, nz = (cx - ax) / len
      poles.push([ax + (cx - ax) * t - nx * 1.6 * S, az + (cz - az) * t - nz * 1.6 * S])
    }
    run = (run + len) % gap
  }
}
void townRoadZ; void WIDE
// The tractor's way: from the potato house down the farm road.
const way: [number, number][] = [[POTATO_HOUSE.x, POTATO_HOUSE.z + 2 * S], ...ROAD]
const along = (m: number): [number, number] => {
  for (let k = 1; k < way.length; k++) {
    const l = Math.hypot(way[k][0] - way[k - 1][0], way[k][1] - way[k - 1][1])
    if (m <= l) return [way[k - 1][0] + (way[k][0] - way[k - 1][0]) * (m / l), way[k - 1][1] + (way[k][1] - way[k - 1][1]) * (m / l)]
    m -= l
  }
  return way[way.length - 1]
}
const env = makeEnv(), lit = makeLight()
env.elLow = 0.128
light(env, 0, lit)
for (const u of us.length ? us : [0, 0.6, 1]) {
  const p = rig.titlePose(vp, u)
  rig.moveTo({ ...p }, true)
  rig.snap(vp)
  const c = rig.camera.position
  console.log(`u ${u}: camera ${c.x.toFixed(0)}, ${c.y.toFixed(1)}, ${c.z.toFixed(0)} (${(c.y - groundY(c.x, c.z)).toFixed(1)} m over the ground), ${p.dist.toFixed(0)} m off, yaw ${p.yaw.toFixed(2)}`)
  console.log(`   sun ${at(c.x + lit.skySun.x * 9000, c.y + lit.skySun.y * 9000, c.z + lit.skySun.z * 9000)}; house ${at(HOUSE.x, groundY(HOUSE.x, HOUSE.z) + 5, HOUSE.z)}; barn ${at(BARN.x, groundY(BARN.x, BARN.z) + 6, BARN.z)}`)
  const f = FIELDS[3]
  console.log(`   the middle field's corners ${[[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]].map(([x, z]) => at(x, fieldBaseY(z), z)).join(' | ')}`)
  console.log(`   poles ${poles.map(([x, z]) => `${at(x, groundY(x, z) + 7, z)} (${Math.hypot(x - c.x, z - c.z).toFixed(0)} m)`).filter(s => !s.startsWith('behind')).slice(-6).join(' | ')}`)
  console.log(`   the tractor at ${[40, 60, 80, 90, 100, 110, 120, 140].map(m => { const [x, z] = along(m); return `${m} m: ${at(x, groundY(x, z) + 1.5, z)} (${Math.hypot(x - c.x, z - c.z).toFixed(0)} m off)` }).join(' | ')}`)
}
