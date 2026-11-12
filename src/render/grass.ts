// Grass. Rank grass where no machine goes: along the walls, the brook's banks, the field margins, the road's verge and
// under the edge of the woods. And the sward itself, through the farm's meadow and over the hay and pasture of land the
// farm does not hold. All of it takes the low sun from behind and moves with the wind.
// It is drawn only round the camera: the land is cut into squares, a square's grass is laid out the first time the
// camera comes near it and let go when many others have been laid since, so the cost does not grow with the land.
// Within a square the clumps are shuffled so that any first share of them is an even thinning; far squares draw
// fewer, larger clumps.
// Laying a square out is some thousands of questions asked of the land, a sixtieth of a second's work or more: it is
// done a few rows of the square at a time, in the time the browser has to spare between frames (or, where it tells
// of none, to a small budget of each frame's time), never a whole square in a frame, and is begun while the camera
// is still on its way down. A square once laid is kept: coming back to it costs nothing.
import {
  DoubleSide, Frustum, Group, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, MeshStandardMaterial, Sphere, Vector2, Vector3,
  type BufferGeometry, type PerspectiveCamera,
} from 'three'
import { OFF_KIND } from './fields.ts'
import { grassGeometry } from './geometry.ts'
import {
  BARN, DUFOUR_BARN, DUFOUR_HOUSE, DUFOUR_POTATO_HOUSE, HOME_WOODS, HOUSE, KEEP_CLEAR, LAND, POND, POTATO_HOUSE, WIDE, brookHalf, brookZ, fieldAt, fieldMask,
  groundY, oursAt, ridgeWoodAt, roadDist, tractAt, wallDist, woodFront,
} from './layout.ts'
import { hash2, rng, fbm2 } from './noise.ts'
import { K, S } from './scale.ts'
import { SNOW_RIME, patch, sway } from './shaders.ts'

const CELL = 36
const STEP = 0.46
// How far off a square keeps all its clumps; how far off rank grass is no longer drawn; and how far off the sward has
// sunk out of sight. By tier.
const REACH = { high: { full: 24, gone: 120, sward: 66 }, medium: { full: 16, gone: 90, sward: 40 }, low: { full: 14, gone: 60, sward: 0 } }
// How long a frame may spend laying grass out while the camera moves, in milliseconds (where the browser gives the
// time between frames to it, the frame spends none).
const BUDGET_MS = 2
// Squares are laid out from this many times the height at which grass is first drawn, so that most of them are there
// by the time the camera is low enough to show them.
const EARLY = 1.5
// How many squares are kept once laid (the squares within reach at the high setting are some sixty).
const KEEP = 160

// field: the parcel a patch of sward lies on (drawn while that parcel is somebody else's), or -1.
interface Patch { mesh: Mesh; geo: InstancedBufferGeometry; mat: MeshStandardMaterial; all: number; thin: { value: number }; fade: { value: Vector2 }; sphere: Sphere; sward: boolean; field: number }
interface Cell { patches: Patch[]; x: number; z: number }
interface Job { key: string; x: number; z: number; steps: Generator<void, Cell> }

export class Grass {
  readonly group = new Group()
  private cells = new Map<string, Cell>()
  private src: BufferGeometry
  private frustum = new Frustum()
  private pm = new Matrix4()
  private near = new Vector3()
  private reach = REACH.high
  // Squares laid so far, for the tools.
  laid = 0
  // Squares held now.
  get held(): number { return this.cells.size }
  private share = 1
  private yards = [HOUSE, BARN, POTATO_HOUSE, DUFOUR_HOUSE, DUFOUR_BARN, DUFOUR_POTATO_HOUSE]
  // The square being laid out now; where the camera last was, and how far round it squares are laid out.
  private job: Job | null = null
  private ball = new Sphere()
  private view = { x: 0, z: 0, ground: 0, reach: -1 }
  // True while there is grass still to lay out round the camera.
  wants = false

  constructor() {
    this.src = grassGeometry()
    // One patch with nothing in it, never drawn and never let go: the grass's shader is compiled with the rest of the
    // land's before the first frame, and is still there when every square has been let go.
    const none = this.patch(new Float32Array(4), 1, 0, 0, 1, 's', -1)
    none.geo.instanceCount = 0
    none.mesh.visible = false
  }

  private clear(x: number, z: number, onField: boolean): boolean {
    if ((!onField && fieldMask(x, z, 0.9 * S) > 0) || roadDist(x, z) < WIDE.track / 2 + 0.5) return false
    if (Math.abs(z - brookZ(x)) < brookHalf(x) + 0.25) return false
    if (z < HOME_WOODS.z1 + 2 * K && (ridgeWoodAt(x, z) > 0.55 || tractAt(x, z, 0.4) >= 0)) return false
    if (Math.hypot((x - POND.x) / (POND.rx * 1.2), (z - POND.z) / (POND.rz * 1.2)) < 1) return false
    for (const y of this.yards) if (Math.hypot(x - y.x, (z - y.z) * 0.7) < 3.6 * S) return false
    for (const c of KEEP_CLEAR) if (Math.hypot(x - c.x, z - c.z) < c.r) return false
    return true
  }

  // A square of the land: its clumps by kind, each kind a patch. It stops after each row of the square and each patch
  // made, to be gone on with in the next frame.
  private *build(cx: number, cz: number): Generator<void, Cell> {
    const lists = new Map<string, number[]>()
    const put = (x: number, z: number, size: number, k: number, kind: string, field = -1) => {
      const key = `${kind}|${field}`
      let list = lists.get(key)
      if (!list) lists.set(key, (list = []))
      // size: 0..1, how tall this clump stands among its kind. Packed with its own number.
      list.push(x, groundY(x, z) - 0.05, z, Math.floor(hash2(k, 13) * 1000) + Math.min(0.99, Math.max(0.01, size)))
    }
    const x0 = cx * CELL, z0 = cz * CELL, n = Math.round(CELL / STEP)
    const inLand = x0 > LAND.x0 - 2 * CELL && x0 < LAND.x1 + CELL && z0 > LAND.z0 - 12 * K && z0 < LAND.z1 + CELL
    for (let j = 0; inLand && j < n; j++) {
      for (let i = 0; i < n; i++) {
        const gx = Math.round(x0 / STEP) + i, gz = Math.round(z0 / STEP) + j, k = gx * 7919 + gz * 104729
        const x = (gx + hash2(k, 3)) * STEP, z = (gz + hash2(k, 7)) * STEP
        const on = fieldAt(x, z)
        if (on >= 0) {
          // Somebody else's hay stands tall, pasture is grazed short, stubble grows a few weeds.
          const sort = OFF_KIND[on] ?? 0
          if (on >= 6 && on < 14 && hash2(k, 11) < (sort === 0 ? 0.22 : sort === 1 ? 0.13 : 0.03) && this.clear(x, z, true)) put(x, z, sort === 0 ? 0.42 + 0.4 * hash2(k, 17) : 0.1 + 0.26 * hash2(k, 17), k, 's', on)
          continue
        }
        const ours = oursAt(x, z, 2 * S)
        const bank = Math.abs(z - brookZ(x)) - brookHalf(x)
        // Rank where the mower does not reach: the brook's banks (the far bank more open, so the water shows from
        // across it), along the walls, under the wood's edge, the field margins and the road's verge.
        let rank = 0
        if (bank < 2.4 * S) rank = Math.max(rank, (z < brookZ(x) ? 0.8 : 0.4) * (1 - bank / (2.4 * S)))
        if (rank < 0.6) rank = Math.max(rank, 0.7 * Math.max(0, 1 - wallDist(x, z) / (0.8 * S)))
        if (z < HOME_WOODS.z1 + 4 * S) { const e = z - woodFront(x); if (e > -1.6 * S && e < 2.6 * S) rank = Math.max(rank, 0.5) }
        if (ours > 0.01) {
          const clump = hash2(Math.floor(x / (3.1 * S)), Math.floor(z / (3.1 * S))) < 0.34 ? hash2(Math.floor(x / (1.1 * S)) + 7, Math.floor(z / (1.1 * S))) : 0
          rank = Math.max(rank, (0.02 + 0.5 * fieldMask(x, z, 2.1 * S) + 0.4 * Math.max(0, 1 - Math.abs(roadDist(x, z) - (WIDE.track / 2 + 1.4)) / 1.1) + 0.7 * clump * clump) * ours)
        }
        if (rank <= 0.01 && ours <= 0.01) continue
        if (!this.clear(x, z, false)) continue
        if (hash2(k, 11) < Math.min(0.9, rank * 1.5)) put(x, z, bank < 2.4 * S ? 0.5 - bank * 0.05 : 0.08 + 0.3 * hash2(k, 17), k, 'r')
        else if (hash2(k, 19) < (0.26 + 1.1 * Math.max(0, fbm2(x * 0.19 + 3.3, z * 0.19 + 8.1) - 0.3)) * ours) put(x, z, 0.02 + 0.3 * hash2(k, 17) * hash2(k, 23) * hash2(k, 29) * 1.6, k, 's')
      }
      yield
    }
    const cell: Cell = { patches: [], x: cx, z: cz }
    const r = rng(9 + cx * 31 + cz * 17)
    for (const [key, list] of lists) {
      const count = list.length / 4
      const [kind, field] = key.split('|')
      // shuffle, so that the first part of the patch is an even thinning of it
      const order = Array.from({ length: count }, (_, i) => i)
      for (let i = count - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
      const at = new Float32Array(count * 4)
      let mx = 0, mz = 0
      for (let i = 0; i < count; i++) {
        const o = order[i] * 4
        at[i * 4] = list[o]; at[i * 4 + 1] = list[o + 1]; at[i * 4 + 2] = list[o + 2]; at[i * 4 + 3] = list[o + 3]
        mx += list[o]; mz += list[o + 2]
      }
      mx /= count; mz /= count
      let rad = 0
      for (let i = 0; i < count; i++) rad = Math.max(rad, Math.hypot(at[i * 4] - mx, at[i * 4 + 2] - mz))
      cell.patches.push(this.patch(at, count, mx, mz, rad, kind, Number(field)))
      yield
    }
    return cell
  }

  // One patch of a square: `count` clumps of one kind, each `at` its place with its size and number.
  private patch(at: Float32Array, count: number, mx: number, mz: number, rad: number, kind: string, field: number): Patch {
    const geo = new InstancedBufferGeometry()
    geo.index = this.src.index
    for (const name of Object.keys(this.src.attributes)) geo.setAttribute(name, this.src.attributes[name])
    geo.setAttribute('aAt', new InstancedBufferAttribute(at, 4))
    geo.instanceCount = count
    const sphere = new Sphere(new Vector3(mx, groundY(mx, mz) + 0.3, mz), rad + 1)
    geo.boundingSphere = sphere
    const thin = { value: 1 }, fade = { value: new Vector2(1e5, 2e5) }
    const mat = patch(new MeshStandardMaterial({ color: 0xffffff, side: DoubleSide, roughness: 0.8, metalness: 0 }), {
      key: 'county-grass',
      uniforms: { uThin: thin, uFade: fade },
      translucent: 0.5,
      shine: 0.3,
      blade: true,
      vertexHead: 'attribute vec4 aAt;\nattribute vec3 aBlade;\nuniform float uThin;\nuniform vec2 uFade;\nvarying vec3 vTint;',
      vertexNormal: /* glsl */ `
        float ga = floor(aAt.w) * 0.0437, gc = cos(ga), gs = sin(ga);
        objectNormal = vec3(gc * objectNormal.x + gs * objectNormal.z, objectNormal.y, -gs * objectNormal.x + gc * objectNormal.z);
      `,
      // Short and bleached in spring, tall and in seed by July, flattened under snow. Thinned far off, each clump
      // wider; and the sward sinks into the ground as it nears the distance where it is no longer drawn.
      vertexBegin: /* glsl */ `
        float gb = floor(aAt.w) * 0.0437, gbc = cos(gb), gbs = sin(gb);
        float season = mix(0.4, 1.0, uLeaf) * (1.0 - 0.7 * smoothstep(0.2, 0.6, uSnow)) * (1.0 - smoothstep(0.6, 0.95, uSnow) * step(fract(aAt.w), 0.7));
        float sink = 1.0 - smoothstep(uFade.x, uFade.y, distance(aAt.xyz, cameraPosition));
        float tall = (0.2 + 0.75 * fract(aAt.w)) * (0.8 + 0.4 * fract(aAt.w * 0.0531)) * season * sink * 0.72;
        float seed = mix(1.0, smoothstep(0.5, 1.0, uLeaf), aBlade.z);
        vec3 gl = position * vec3(0.62 * seed, 1.0, 0.62 * seed) * vec3(0.7 + 0.6 * fract(aAt.w), 1.0, 0.7 + 0.6 * fract(aAt.w)) * vec3(uThin, 1.0, uThin);
        transformed = aAt.xyz + vec3(gbc * gl.x + gbs * gl.z, gl.y * tall, -gbs * gl.x + gbc * gl.z);
        vec3 gcol = uGrass * mix(vec3(0.7, 0.9, 0.56), vec3(1.2, 1.25, 0.78), aBlade.y) * (0.82 + 0.4 * fract(aAt.w * 0.173));
        gcol = mix(gcol, uGrass * vec3(1.5, 1.3, 0.8), aBlade.z * 0.7);
        vTint = gcol;
      `,
      vertexWorld: sway('aAt.xz', 'max(cWorld.y - aAt.y, 0.0)', '1.1'),
      fragmentHead: 'varying vec3 vTint;',
      fragmentColor: `diffuseColor.rgb *= vTint; ${SNOW_RIME}`,
    })
    const mesh = new Mesh(geo, mat)
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    this.group.add(mesh)
    return { mesh, geo, mat, all: count, thin, fade, sphere, sward: kind === 's', field }
  }

  private drop(cell: Cell): void {
    for (const p of cell.patches) {
      this.group.remove(p.mesh)
      p.geo.dispose()
      p.mat.dispose()
    }
  }

  setTier(tier: 'high' | 'medium' | 'low'): void {
    this.reach = REACH[tier]
    this.share = tier === 'low' ? 0.5 : 1
  }

  // The square to lay out next: the nearest one within reach not yet laid, those the camera looks at before those
  // behind it. False when there is none.
  private pick(all: boolean): boolean {
    const { x, z, ground, reach } = this.view
    if (reach <= 0) return false
    let best = Infinity, bi = 0, bj = 0
    const i0 = Math.floor((x - reach) / CELL), i1 = Math.floor((x + reach) / CELL), j0 = Math.floor((z - reach) / CELL), j1 = Math.floor((z + reach) / CELL)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const mx = (i + 0.5) * CELL, mz = (j + 0.5) * CELL
      let d = Math.hypot(mx - x, mz - z)
      if (d > reach + CELL * 0.7 || d >= best || this.cells.has(`${i}|${j}`)) continue
      if (!all && !this.frustum.intersectsSphere(this.ball.set(this.near.set(mx, ground, mz), CELL))) d += reach * 2
      if (d < best) { best = d; bi = i; bj = j }
    }
    if (best === Infinity) return false
    this.job = { key: `${bi}|${bj}`, x: bi, z: bj, steps: this.build(bi, bj) }
    return true
  }

  // Go on laying grass out round where the camera last was, for as long as `more` says (it is asked after each row
  // of a square). The frame does a little of it; the time between frames, where the browser gives any, does the rest.
  lay(more: () => boolean, all = false): void {
    for (;;) {
      if (!this.job && !this.pick(all)) { this.wants = false; return }
      let done: IteratorResult<void, Cell>
      do done = this.job!.steps.next()
      while (!done.done && more())
      if (!done.done) return
      this.cells.set(this.job!.key, done.value)
      // (not drawn until the next frame has thinned it for its distance)
      for (const p of done.value.patches) p.mesh.visible = false
      this.job = null
      this.laid++
      if (!more()) return
    }
  }

  // Lay out the squares the camera is near (all of them when `all`, for a still picture; otherwise a little of one,
  // nearest first, unless `between` says the time between frames is doing it), let go the furthest when too many
  // are kept, and thin each patch by its distance.
  // off: for each parcel, 1 while it is somebody else's ground.
  update(camera: PerspectiveCamera, off: number[], all = false, between = false): void {
    const began = performance.now()
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const c = camera.position
    const height = Math.max(0, c.y - groundY(c.x, c.z))
    const gone = this.reach.gone
    const flat = height < gone ? Math.sqrt(gone * gone - height * height) : -1
    // What is laid out reaches as far as what is drawn would from lower down: the camera is on its way there.
    const early = height < gone * EARLY ? Math.min(gone, Math.sqrt(gone * gone * EARLY * EARLY - height * height)) : -1
    this.view.x = c.x; this.view.z = c.z; this.view.ground = c.y - height
    this.view.reach = all ? flat : early
    this.wants = true
    if (all) this.lay(() => true, true)
    else if (!between) this.lay(() => performance.now() - began < BUDGET_MS)
    else if (!this.job && !this.pick(false)) this.wants = false
    if (this.cells.size > KEEP) {
      let far = -1, at = ''
      for (const [key, cell] of this.cells) {
        const d = Math.hypot((cell.x + 0.5) * CELL - c.x, (cell.z + 0.5) * CELL - c.z)
        if (d > far) { far = d; at = key }
      }
      const cell = this.cells.get(at)
      if (cell) { this.drop(cell); this.cells.delete(at) }
    }
    for (const cell of this.cells.values()) {
      const d = Math.hypot((cell.x + 0.5) * CELL - c.x, (cell.z + 0.5) * CELL - c.z)
      const out = flat < 0 || d > flat + CELL * 3
      for (const p of cell.patches) {
        if (out) { p.mesh.visible = false; continue }
        const pd = Math.max(0, this.near.copy(p.sphere.center).distanceTo(c) - p.sphere.radius)
        const far = p.sward ? this.reach.sward : gone
        if (pd > far || (p.field >= 0 && off[p.field] < 0.5) || !this.frustum.intersectsSphere(p.sphere)) { p.mesh.visible = false; continue }
        const keep = Math.min(1, Math.pow(this.reach.full / Math.max(pd, 1), p.sward ? 1.0 : 1.4)) * this.share
        const k = Math.max(0.06, keep)
        p.mesh.visible = true
        p.geo.instanceCount = Math.max(1, Math.round(p.all * k))
        // the sward's clumps are few and broad: each stands for the grass round it
        p.thin.value = Math.min(2.4, 1 / Math.sqrt(k)) * (p.sward ? 1.6 : 1)
        if (p.sward) p.fade.value.set(far * 0.45, far * 0.95)
      }
    }
  }

  dispose(): void {
    for (const cell of this.cells.values()) this.drop(cell)
    this.cells.clear()
    this.src.dispose()
  }
}
