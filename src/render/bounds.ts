// What bounds the open ground where no wall does: post-and-rail fence along the sides of fields that face pasture and
// along the lanes that run through it, with a bar-way in each run. Posts and rails are boxes at true size (a post a
// little over a metre, three metres to the next), laid out by patch so that what is out of sight is not drawn.
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { FIELDS, WAYS, YARD_AT, brookHalf, brookZ, fieldMask, groundY, ridgeWoodAt, roadDist, tractAt, wallDist } from './layout.ts'
import { hash2 } from './noise.ts'
import { patch, snowRimeAt } from './shaders.ts'

const SPAN = 3.1
// The runs of fence: each a line of points SPAN apart. Shared with whoever plants along them.
export function fenceRuns(): [number, number][][] {
  const yards = Object.values(YARD_AT)
  const clear = (x: number, z: number) => wallDist(x, z) > 7 && roadDist(x, z) > 3.2 && tractAt(x, z, 3) < 0 && ridgeWoodAt(x, z) < 0.05
    && Math.abs(z - brookZ(x)) > brookHalf(x) + 9 && yards.every(y => x < y.x0 - 6 || x > y.x1 + 6 || z < y.z0 - 6 || z > y.z1 + 6)
  const runs: [number, number][][] = []
  const along = (x0: number, z0: number, x1: number, z1: number, ok: (x: number, z: number) => boolean) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / SPAN)
    let run: [number, number][] = []
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k * SPAN) / len, z = z0 + ((z1 - z0) * k * SPAN) / len
      if (ok(x, z) && clear(x, z)) run.push([x, z])
      else { if (run.length > 4) runs.push(run); run = [] }
    }
    if (run.length > 4) runs.push(run)
  }
  // Round each field, a few metres out, wherever no wall, lane or other field is there already.
  const OUT = 5.2
  for (const f of FIELDS) {
    const lone = (x: number, z: number) => fieldMask(x, z, 2.5) < 0.01 && roadDist(x, z) > 9
    along(f.x0 - OUT, f.z0 - OUT, f.x1 + OUT, f.z0 - OUT, lone)
    along(f.x0 - OUT, f.z1 + OUT, f.x1 + OUT, f.z1 + OUT, lone)
    along(f.x0 - OUT, f.z0 - OUT, f.x0 - OUT, f.z1 + OUT, lone)
    along(f.x1 + OUT, f.z0 - OUT, f.x1 + OUT, f.z1 + OUT, lone)
  }
  // Along a lane where it has pasture beside it and no field.
  for (const w of WAYS) {
    if (w.kind !== 'track') continue
    for (let s = 0; s < w.pts.length - 1; s++) {
      const [ax, az] = w.pts[s], [bx, bz] = w.pts[s + 1], l = Math.hypot(bx - ax, bz - az) || 1
      const nx = (-(bz - az) / l) * 4.4, nz = ((bx - ax) / l) * 4.4
      for (const side of [-1, 1]) along(ax + nx * side, az + nz * side, bx + nx * side, bz + nz * side, (x, z) => fieldMask(x, z, 7) < 0.01 && roadDist(x, z) > 3.6)
    }
  }
  return runs
}

export function buildBounds(): { group: Group; dispose(): void } {
  const group = new Group()
  const mat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 }), {
    key: 'county-fence',
    // weathered cedar, silver where the sun has had it; snow along the top of every rail
    fragmentColor: `diffuseColor.rgb *= 0.8 + 0.4 * texture2D(uNoise, vWorld.xz * 1.7 + vWorld.y * 2.3).a; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), min(1.0, uSnow * 1.4) * smoothstep(0.6, 0.9, vWNormal.y)); ${snowRimeAt('0.0', 'rimeAt( vWorld.y )')}`,
  })
  const post = new BoxGeometry(0.15, 1.3, 0.15).translate(0, 0.55, 0), rail = new BoxGeometry(1, 0.1, 0.05)
  const cells = new Map<string, { posts: Matrix4[]; rails: Matrix4[] }>()
  const cell = (x: number, z: number) => {
    const key = `${Math.floor(x / 160)}|${Math.floor(z / 160)}`
    let c = cells.get(key)
    if (!c) cells.set(key, (c = { posts: [], rails: [] }))
    return c
  }
  const q = new Quaternion(), p = new Vector3(), s = new Vector3(), up = new Vector3(0, 1, 0), dir = new Vector3(), X = new Vector3(1, 0, 0)
  const putPost = (x: number, z: number, tall = 1) => cell(x, z).posts.push(new Matrix4().compose(p.set(x, groundY(x, z), z), q.setFromAxisAngle(up, hash2(Math.round(x * 3), Math.round(z * 3)) * 0.5), s.set(tall, tall * (0.92 + 0.16 * hash2(Math.round(x), Math.round(z))), tall)))
  const putRail = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    dir.set(bx - ax, by - ay, bz - az)
    const len = dir.length()
    cell(ax, az).rails.push(new Matrix4().compose(p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q.setFromUnitVectors(X, dir.normalize()), s.set(len + 0.2, 1, 1)))
  }
  for (const run of fenceRuns()) {
    // a bar-way a third of the way along: two stout posts, and the bars drawn back and leaning on one of them
    const gate = run.length > 9 ? Math.floor(run.length / 3) : -9
    for (let k = 0; k < run.length; k++) {
      const [x, z] = run[k]
      putPost(x, z, k === gate || k === gate + 1 ? 1.25 : 1)
      if (k === run.length - 1) continue
      const [bx, bz] = run[k + 1], ya = groundY(x, z), yb = groundY(bx, bz)
      if (k === gate) {
        for (const h of [0.3, 0.62, 0.94]) putRail(x, ya + h, z, x + (bx - x) * 0.55 + (bz - z) * 0.5, ya + h * 0.4 + 0.1, z + (bz - z) * 0.55 - (bx - x) * 0.5)
        continue
      }
      // the rails sag and no two are nailed at one height
      for (const h of [0.5, 0.98]) putRail(x, ya + h + 0.06 * (hash2(k, Math.round(x)) - 0.5), z, bx, yb + h + 0.06 * (hash2(k + 1, Math.round(x)) - 0.5), bz)
    }
  }
  const disposables: { dispose(): void }[] = [mat, post, rail]
  const c = new Color()
  for (const { posts, rails } of cells.values()) {
    for (const [geo, list] of [[post, posts], [rail, rails]] as const) {
      if (!list.length) continue
      const m = new InstancedMesh(geo, mat, list.length)
      list.forEach((mx, k) => { m.setMatrixAt(k, mx); m.setColorAt(k, c.set(['#8f897d', '#a39c8d', '#7d776c', '#99907f'][k % 4])) })
      m.computeBoundingSphere()
      m.castShadow = geo === post
      m.receiveShadow = true
      group.add(m)
    }
  }
  return { group, dispose() { for (const d of disposables) d.dispose() } }
}
