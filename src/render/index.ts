// The field view: the farm in its country, drawn with three.js, played like a strategy map.
// Falls back to a flat drawing without WebGL.
import { Color, PCFShadowMap, Raycaster, Scene, Triangle, Vector2, Vector3, WebGLRenderer, type Object3D } from 'three'
import type { App } from '../game/app.ts'
import type { CreateFieldView, FieldView } from '../game/contracts.ts'
import { FIELD_COUNT, HILLS } from '../sim/index.ts'
import { CameraRig, HOME_FIELD, MOVE_MS, type Pose, type TierName, type Viewport } from './camera.ts'
import { Clearing } from './clearing.ts'
import { EVENING, MORNING, copyEnv, easeEnv, envTarget, light, makeEnv, makeLight } from './env.ts'
import { FarHills } from './far.ts'
import { createFallbackView } from './fallback.ts'
import { Fields, MARK_WIDE, PIXEL, UI_GAIN, type HillDisplay } from './fields.ts'
import { Flora } from './flora.ts'
import { Grass } from './grass.ts'
import { Harvest } from './harvest.ts'
import { attachInput } from './input.ts'
import { DUFOUR, FD, FIELDS, FW, HOME, LAND, POTATO_HOUSE, ROAD, WATER_Y, brookZ, fieldBaseY, groundY, YARD_AT, yardAt } from './layout.ts'
import { clamp, hash2, smooth } from './noise.ts'
import { K, KV, S } from './scale.ts'
import { Particles } from './particles.ts'
import { Pond } from './pond.ts'
import { Post } from './post.ts'
import { LAMP, Props } from './props.ts'
import { CLOUD_TURN, HAZE_FALL, U } from './shaders.ts'
import { SunShadows } from './shadows.ts'
import { Sky } from './sky.ts'
import { snapshot, type Mode, type Snapshot } from './state.ts'
import { buildTerrain } from './terrain.ts'
import { flowerTexture, leafTexture, noiseTexture, puffTexture } from './textures.ts'
import { Beacons } from './beacons.ts'
import { Birds } from './birds.ts'
import { Crews, type PendingReveal } from './units.ts'
import { Weather } from './weather.ts'
import { Poly, type Reveal } from './work.ts'

const DAY_ANIM_S = 3.4          // how long a paused day's work takes to play out
// The opening shot, in seconds: down from the far view to the road, a stay there while the tractor goes by, up again,
// and a stay at the top. The tractor's trip down the farm road is timed to it.
const TITLE_DOWN_S = 38, TITLE_STAY_S = 20, TITLE_UP_S = 30, TITLE_TOP_S = 8
const TITLE_LOOP_S = TITLE_DOWN_S + TITLE_STAY_S + TITLE_UP_S + TITLE_TOP_S
// The tractor in the opening: how far down the road it is as the camera comes to rest (metres), and its pace.
const TITLE_MEET_M = 66, TITLE_PACE = 1.2
const HOUR_HOLD_S = 6           // the least time between a morning's light and an evening's
const LOST_MS = 3000            // how long a lost WebGL context may stay away before the farm is drawn flat
const STILL = 0.02              // the pace of water, cloud, mist and smoke under reduced motion
const SHOWN_CAP_S = 2.5         // the longest whenShown() keeps the interface waiting

type Tier = 'high' | 'medium' | 'low'
// What each setting keeps. A frame costs in two ways: the pixels it fills, and the things it draws (most of them
// trees, drawn once into the picture and again into each shadow map). Each step down takes from both.
//   high: everything; the fine shadow redrawn every other frame, the second every fourth, the widest every twelfth
//     (most of what a frame draws is trees, and more than half of those were being drawn into shadow maps).
//   medium: the picture at 2.3 million pixels with lighter smoothing of edges; no contact shade or soft focus; shadow
//     maps at half the detail, the wider two redrawn less often; shorter shafts; clouds followed in fewer steps;
//     and what the other parts drop at this setting (whole trees, plants and grass nearer the camera only).
//   low: the picture at 1.1 million pixels with no multisampling; the fine shadow redrawn every third frame, the
//     second every twelfth, the widest (the back country's woods) once a second; no shafts or bloom; flat-bottomed
//     clouds; and the other parts' low setting (fewer whole plants, trees as simple shapes, sparse grass, people
//     without shadows).
// `every`: how often each shadow cascade is redrawn, in frames.
const TIERS: Record<Tier, { scale: number; pixels: number; msaa: number; ao: boolean; focus: boolean; bloom: boolean; shafts: number; clouds: number; shadow: [number, number, number]; every: [number, number, number]; density: number }> = {
  high: { scale: 1, pixels: 3.7e6, msaa: 4, ao: true, focus: true, bloom: true, shafts: 40, clouds: 7, shadow: [3072, 2048, 2048], every: [2, 4, 12], density: 1 },
  medium: { scale: 1, pixels: 2.3e6, msaa: 2, ao: false, focus: false, bloom: true, shafts: 20, clouds: 4, shadow: [2048, 1024, 1024], every: [2, 6, 24], density: 1 },
  low: { scale: 0.7, pixels: 1.1e6, msaa: 0, ao: false, focus: false, bloom: false, shafts: 0, clouds: 2, shadow: [1024, 1024, 512], every: [3, 12, 60], density: 0.5 },
}
const DOWN: Record<Tier, Tier> = { high: 'medium', medium: 'low', low: 'low' }

// The view the rest of the game holds. It starts in 3D and turns to the flat drawing if WebGL fails or never comes back.
export const createFieldView: CreateFieldView = (canvas, app) => {
  let inner: FieldView
  const flat = () => {
    inner = createFallbackView(canvas, app)
    ;(globalThis as Record<string, unknown>).__countyField = {
      flat: true,
      settle() {},
      seek() {},
      anchor: (i: number) => inner.fieldAnchor(i),
      info: () => ({ mode: 'flat' }),
      whenShown: () => Promise.resolve(),
    }
  }
  let ready: Promise<void> = Promise.resolve()
  try {
    inner = createWebGLView(canvas, app, () => {
      console.warn('The County: the 3D view was lost and did not come back, drawing the farm flat.')
      inner.dispose()
      flat()
    })
    ready = inner.ready
  } catch (err) {
    console.warn('The County: WebGL is not available, drawing the farm flat.', err)
    flat()
  }
  return {
    ready,
    quality: () => inner.quality(),
    resize: () => inner.resize(),
    frame: dt => inner.frame(dt),
    fieldAnchor: i => inner.fieldAnchor(i),
    unitAnchor: u => inner.unitAnchor(u),
    yardAnchor: y => inner.yardAnchor(y),
    whenShown: (kind, field) => inner.whenShown(kind, field),
    dispose: () => inner.dispose(),
  }
}

interface SampleInfo { hill: number; weights: number[]; marks: number[] }
interface Waiter { kind: 'sample' | 'dig'; field: number; resolve: () => void; born: number; until: number; seen: boolean; settle: number }

function createWebGLView(canvas: HTMLCanvasElement, app: App, giveUp: () => void): FieldView {
  // The context is asked for here and checked before three sees it: a context handed back already lost makes three's
  // constructor log an error and throw, where this throws quietly and the caller draws the farm flat.
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' })
  if (!gl || gl.isContextLost()) throw new Error('no WebGL context')
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' })
  if (!renderer.getContext()) throw new Error('no WebGL context')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none'
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  renderer.setClearColor(0x000000, 1)
  renderer.info.autoReset = false

  // How long each part of the scene took to build, in milliseconds since the view was asked for (for the budget tool).
  const began = performance.now()
  const built: [string, number][] = []
  const lap = (name: string) => built.push([name, Math.round(performance.now() - began)])
  const scene = new Scene()
  const rig = new CameraRig()
  const noise = noiseTexture()
  U.uNoise.value = noise
  const sky = new Sky()
  const shadows = new SunShadows(scene)
  const post = new Post(renderer)
  const leafTex = leafTexture(), flowerTex = flowerTexture(), puffTex = puffTexture()
  lap('textures')
  const terrain = buildTerrain()
  lap('terrain')
  const flora = new Flora()
  lap('trees')
  const clearing = new Clearing(flora)
  const pond = new Pond()
  const grass = new Grass()
  lap('clearing')
  const props = new Props()
  lap('yards')
  const fields = new Fields(leafTex, flowerTex)
  lap('fields')
  const harvest = new Harvest()
  const crews = new Crews()
  crews.setStand(i => flora.stand(i))
  lap('crews')
  const particles = new Particles(puffTex)
  const weather = new Weather()
  const birds = new Birds()
  const farHills = new FarHills()
  const beacons = new Beacons()
  scene.add(farHills.mesh, beacons.group)
  scene.add(sky.dome, terrain.group, flora.group, clearing.group, pond.group, grass.group, props.group, fields.group, harvest.group, crews.group, particles.mesh, weather.group, birds.mesh)
  // Whatever throws a shadow near at hand throws it into the fine cascade; the far trees and farmsteads only into the wide one.
  scene.traverse(o => { if (o.castShadow && !o.userData.far) o.layers.enable(3) })

  const env = makeEnv(), envT = makeEnv(), lit = makeLight()
  let snap: Snapshot = snapshot(app)
  let shown: HillDisplay[][] = snap.fields.map(f => f.hills.map(look => ({ look, ridge: f.ridge })))
  let dayT = 1
  let dirty = true, dayPassed = false, first = true
  const samples = new Map<number, SampleInfo>()
  let time = 0
  // Clocks for water, cloud, mist and smoke (`ambient`) and for rain and snow (`fall`): under reduced motion the first
  // nearly stops and the second stops. The crews' work keeps `time`.
  let ambient = 0
  let fall = 0
  let lost = false
  let lostFor = 0
  let compiled = false
  let frameNo = 0
  let reduced = app.settings.reducedMotion
  let lens = 0.2
  let firstFrame = 0
  let smokeAt = 0
  // What the camera was last asked to frame (the opening shot, or one of its four tiers); the player's own hand on it
  // makes it 'free'. `framed`: the field of the field tier; `framedYard`: the yard of the yard tier.
  let framing: 'title' | TierName | 'free' = 'field'
  let framed = HOME_FIELD
  let framedYard = -1
  const dugSince = new Map<number, number>()
  const barrelPeak = new Map<number, number>()
  const waiters: Waiter[] = []
  const focus = new Vector3(), ahead = new Vector3(), sunAt = new Vector3()
  const windAt = U.uWindAt.value

  // Hills waiting for a crew to pass: which crew, the segment of its day and the place along its path.
  let pending: PendingReveal[] = []

  // ---- quality
  // Left to itself the view starts where the graphics chip suggests and comes down if frames run slow: a chip built
  // into the processor starts at the middle setting (the low one on a small machine), a graphics card at the high one.
  function startTier(): Tier {
    const gl = renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const chip = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '').toLowerCase()
    const small = (navigator.hardwareConcurrency ?? 8) <= 4
    if (/swiftshader|llvmpipe|software|basic render/.test(chip)) return 'low'
    if (/intel|adreno|mali|powervr|videocore|radeon\(tm\) graphics|radeon graphics|vega \d/.test(chip) && !/arc\(tm\) a\d/.test(chip)) return small ? 'low' : 'medium'
    // Apple's own chips: the larger ones carry the high setting; the base ones, and a browser that will not say, start in the middle.
    if (/apple/.test(chip) && !/ (pro|max|ultra)\b/.test(chip)) return 'medium'
    return small ? 'medium' : 'high'
  }
  const startedAt = app.settings.quality === 'auto' ? startTier() : app.settings.quality
  let tier: Tier = startedAt
  const times: number[] = []
  let slow = 0, fps = 60, warm = 0

  function viewport(): Viewport {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight
    const i = app.insets
    return { w, h, top: i.top, right: i.right, bottom: i.bottom, left: i.left }
  }

  const pixelRatio = () => Math.min(2, devicePixelRatio || 1)
  let size = { w: 0, h: 0, pr: 0 }
  function resize(): void {
    const vp = viewport(), pr = pixelRatio(), t = TIERS[tier]
    renderer.setPixelRatio(pr)
    renderer.setSize(vp.w, vp.h, false)
    size = { w: vp.w, h: vp.h, pr }
    const scale = Math.min(t.scale, Math.sqrt(t.pixels / Math.max(1, vp.w * vp.h * pr * pr)))
    post.setSize(Math.max(2, Math.round(vp.w * pr * scale)), Math.max(2, Math.round(vp.h * pr * scale)), { msaa: t.msaa, ao: t.ao, focus: t.focus, bloom: t.bloom, shafts: t.shafts })
    sky.setSteps(t.clouds)
    weather.setTier(tier)
    particles.setTier(tier)
    shadows.every = t.every
    shadows.setSizes(t.shadow)
    fields.setTier(tier, t.density)
    grass.setTier(tier)
    flora.setTier(tier)
    props.setTier(tier)
    crews.setScreen(vp.w, vp.h)
    crews.setTier(tier)
    reframe(reduced)
  }

  // The opening shot goes down from its far view to its low one, stays, and goes back, without end; a tool can hold
  // it at a point of the way down.
  let titleClock = 0
  let titleFixed = -1
  const ease = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1))
  function titleU(): number {
    if (titleFixed >= 0) return titleFixed
    if (reduced) return 0
    const t = titleClock % TITLE_LOOP_S
    return t < TITLE_DOWN_S + TITLE_STAY_S ? ease(t / TITLE_DOWN_S) : 1 - ease((t - TITLE_DOWN_S - TITLE_STAY_S) / TITLE_UP_S)
  }
  // The length of the tractor's way in the opening (the people's part lays it from the potato house down the farm road).
  const titleRoad = ROAD.reduce((n, p, k) => n + (k ? Math.hypot(p[0] - ROAD[k - 1][0], p[1] - ROAD[k - 1][1]) : Math.hypot(p[0] - POTATO_HOUSE.x, p[1] - POTATO_HOUSE.z)), 0)
  // Where the tractor is on its way, as a share of the day the people's part plays out (its trip is the first 0.8).
  function titleDay(): number {
    // Held by a tool at a point of the way down: as it would be then, and at the low view with the tractor in frame.
    const t = titleFixed >= 0 ? titleFixed * TITLE_DOWN_S + (titleFixed >= 1 ? 6.5 : 0) : titleClock % TITLE_LOOP_S
    const share = clamp((TITLE_MEET_M + TITLE_PACE * (t - TITLE_DOWN_S)) / titleRoad, 0, 1)
    // The people's part eases a trip in and out (a smooth step of its clock): ask for the clock that gives this share.
    return (0.5 - Math.sin(Math.asin(1 - 2 * share) / 3)) * 0.8
  }

  // The view a screen opens on: the season is played from the field tier, beside the farmstead; every other screen
  // shows the home farm whole.
  const tierFor = (mode: Mode): TierName => (mode === 'season' ? 'field' : 'farm')
  // What is framed now, as a view inside what the interface leaves free. yaw: the way the player has turned the view.
  function framedPose(vp: Viewport, yaw?: number): Pose {
    if (framing === 'title') return rig.titlePose(vp, titleU())
    if (framing === 'field') return rig.field(framed, vp, yaw)
    if (framing === 'yard') return rig.yard(framedYard, vp, yaw)
    return framing === 'county' ? rig.county(vp) : rig.farm(vp)
  }
  const turned = () => (framing === 'field' || framing === 'yard' ? rig.goal.yaw : undefined)

  // After the window or the interface's edges change: hold whatever was framed.
  function reframe(still: boolean): void {
    if (framing === 'free') return
    const to = framedPose(viewport(), turned())
    if (rig.moving()) rig.retarget(to)
    else rig.moveTo(to, still, 500)
  }

  // Bring a field into frame at the field tier, the way the view is turned now (or, `square`, as the land is first seen).
  function frameField(i: number, still = reduced, square = false): void {
    framing = 'field'
    framed = i
    const to = square ? rig.field(i, viewport()) : rig.field(i, viewport(), rig.goal.yaw)
    // A long way to go takes a little longer, so the land is seen to glide by and not to jump.
    const way = Math.hypot(to.x - rig.cur.x, to.z - rig.cur.z) / Math.max(to.dist, rig.cur.dist)
    rig.moveTo(to, still, MOVE_MS * clamp(0.8 + way * 1.6, 1, 1.8))
  }
  // The field nearest to where the picture is looking.
  function fieldInView(): number {
    const at = rig.looksAt(viewport())
    let best = HOME_FIELD, bd = Infinity
    snap.fields.forEach((f, i) => {
      if (!f.held && !f.ours) return
      const d = Math.hypot(FIELDS[i].cx - at.x, FIELDS[i].cz - at.z)
      if (d < bd) { bd = d; best = i }
    })
    return best
  }

  // Home steps out through the tiers and back: the field, the farm, the county, the field again. From a view of the
  // player's own it goes to the field tier, on the field they were looking at, and puts the view square again.
  function goHome(): void {
    const vp = viewport()
    if (snap.mode === 'title') { framing = 'title'; rig.moveTo(rig.titlePose(vp, titleU()), reduced); return }
    const at = framing !== 'free' && framing !== 'title' && rig.isAt(framedPose(vp, turned())) ? framing : 'free'
    if (at === 'free' || at === 'county') { frameField(at === 'county' ? framed : fieldInView(), reduced, true); return }
    framing = at === 'farm' ? 'county' : 'farm'
    rig.moveTo(framedPose(vp), reduced, 1100)
  }

  const off = app.on(e => {
    if (e.type === 'change' || e.type === 'screen') dirty = true
    else if (e.type === 'events') {
      dirty = true
      if (e.dayPassed) dayPassed = true
      for (const ev of e.events) {
        if (ev.type === 'sample' && ev.field >= 0 && ev.data && typeof ev.data.hill === 'number') {
          samples.set(ev.field, {
            hill: ev.data.hill,
            weights: Array.isArray(ev.data.weights) ? ev.data.weights : [],
            marks: Array.isArray(ev.data.marks) ? ev.data.marks : [],
          })
        }
      }
    } else if (e.type === 'settings') {
      reduced = app.settings.reducedMotion
      if (app.settings.quality !== 'auto' && app.settings.quality !== tier) { tier = app.settings.quality; resize() }
    } else if (e.type === 'order') fields.ringOrder(e.fields)
    else if (e.type === 'focus') {
      if (e.field >= 0 && e.field < FIELD_COUNT) frameField(e.field)
      else {
        // The whole farm is asked for.
        framing = 'farm'
        rig.moveTo(rig.farm(viewport()), reduced)
      }
    } else if (e.type === 'insets') reframe(reduced)
  })

  function display(f: number, h: number, s: Snapshot): HillDisplay {
    return { look: s.fields[f].hills[h], ridge: s.fields[f].ridge }
  }

  function reveal(r: Reveal, animate: boolean): void {
    shown[r.field][r.hill] = { look: r.look, ridge: r.ridge }
    fields.setHill(r.field, r.hill, shown[r.field][r.hill], snap.fields[r.field])
    if (!animate) return
    const fv = snap.fields[r.field]
    if (r.tubers === 'sample') {
      const s = samples.get(r.field) ?? lastSample.get(r.field)
      harvest.sample(r.field, r.hill, s && s.hill === r.hill ? s.weights : [], s && s.hill === r.hill ? s.marks : [], fv.variety)
    } else if (r.tubers === 'dig') {
      const along = digDir.get(r.field) ?? { dx: -1, dz: 0 }
      harvest.dig(r.field, r.hill, { variety: fv.variety, gramsPerHill: fv.grams, dark: fv.dark, green: fv.green }, along)
    }
  }
  // The day's test digs, kept after the snapshot is rebuilt so the reveal can lay out the hill's own tubers.
  const lastSample = new Map<number, SampleInfo>()
  // Which way the digger is going over each field being dug, for where the tubers land.
  const digDir = new Map<number, { dx: number; dz: number }>()

  function flush(animate: boolean): void {
    for (const r of pending) reveal(r, animate && pending.length < 200)
    pending = []
  }

  // A crew has gone this far along its day: reveal the hills it has passed.
  function passed(unit: number, seg: number, arc: number): void {
    if (!pending.length) return
    const keep: PendingReveal[] = []
    for (const r of pending) {
      if (r.unit === unit && (r.seg < seg || (r.seg === seg && r.at <= arc))) reveal(r, true)
      else keep.push(r)
    }
    pending = keep
  }

  function rebuild(): void {
    const next = snapshot(app)
    const prev = snap
    const sameSeason = dayPassed && !first && prev.mode === 'season' && next.mode === 'season' && prev.year === next.year
    if (sameSeason) flush(app.speed < 3 && !reduced)
    snap = next
    if (next.mode !== 'season') {
      harvest.clear()
      dugSince.clear()
    }
    const sameDay = !dayPassed && !first && prev.mode === next.mode && prev.year === next.year && prev.seasonDay === next.seasonDay
    if (sameSeason) {
      for (const [f, s] of samples) lastSample.set(f, s)
      pending = crews.plan(next, shown, new Map([...samples].map(([f, s]) => [f, s.hill])))
      const wait = new Set(pending.map(r => r.field * HILLS + r.hill))
      shown = next.fields.map((f, i) => f.hills.map((_, h) => (wait.has(i * HILLS + h) ? shown[i][h] : display(i, h, next))))
      dayT = 0
      digDir.clear()
      for (const s of crews.segments()) if (s.kind === 'dig' && !digDir.has(s.field)) { const p = new Poly(s.path).at(0); digDir.set(s.field, { dx: p.dx, dz: p.dz }) }
      // A key moment about to play where the player is not looking: bring the field into frame, unless their hand is on the camera.
      const staged = crews.staged(prev)
      if (staged && !reduced && app.speed < 3 && rig.idle > 2.5) {
        const to = rig.field(staged.field, viewport(), rig.goal.yaw)
        const far = Math.hypot(rig.cur.x - to.x, rig.cur.z - to.z) > FD * 0.8 || rig.cur.dist > to.dist * 1.3
        if (far) frameField(staged.field, false)
      }
    } else if (sameDay) {
      // A command in the middle of the day: keep the day playing, refresh everything not waiting to be revealed.
      crews.sync(next)
      const wait = new Set(pending.map(r => r.field * HILLS + r.hill))
      shown = next.fields.map((f, i) => f.hills.map((_, h) => (wait.has(i * HILLS + h) ? shown[i][h] : display(i, h, next))))
    } else {
      flush(false)
      shown = next.fields.map((f, i) => f.hills.map((_, h) => display(i, h, next)))
      if (first || prev.mode !== next.mode || prev.year !== next.year) {
        crews.rest(next)
        if (next.mode === 'title') crews.title()
        particles.clear()
        // A change of screen is a move of the camera, not a cut.
        framing = next.mode === 'title' ? 'title' : tierFor(next.mode)
        framed = HOME_FIELD
        // To and from the opening shot the camera swings a long way round: give it time.
        rig.moveTo(framedPose(viewport()), first || reduced, next.mode === 'title' || prev.mode === 'title' ? 2600 : MOVE_MS)
      } else crews.sync(next)
      dayT = next.mode === 'title' ? 0 : 1
    }
    for (let i = 0; i < FIELD_COUNT; i++) {
      const st = next.fields[i].status
      if (st === 'dug' && !dugSince.has(i)) dugSince.set(i, next.seasonDay)
      if (st !== 'dug') dugSince.delete(i)
    }
    // Barrels stand in a field while its crop waits there to be hauled, fewer as it goes in.
    const barrels = next.fields.map((f, i) => {
      const peak = Math.max(f.inField, next.mode === 'season' ? barrelPeak.get(i) ?? 0 : 0)
      barrelPeak.set(i, peak)
      return next.mode === 'season' && (f.status === 'digging' || f.inField > 0.5)
    })
    harvest.setBarrelFields(barrels, (f, h) => shown[f][h].look.kind === 'dug' && next.fields[f].hills[h].kind === 'dug'
      && (next.fields[f].status === 'digging' || hash2(h, f + 3) <= next.fields[f].inField / Math.max(1, barrelPeak.get(f) ?? 1)))
    fields.setTargets(next.fields, shown, next.mode === 'plan')
    clearing.set(next.fields)
    pond.set(next.farm)
    const gravelled = next.farm.buildings.find(b => b.kind === 'road')
    terrain.gravel.value = gravelled ? (gravelled.built ? 1 : gravelled.progress) : 0
    props.sync(next)
    envTarget(next, envT)
    heldHour = null
    dayHour = envT.hour
    aimHour(first)
    samples.clear()
    dayPassed = false
    dirty = false
    if (first) {
      first = false
      copyEnv(env, envT)
      fields.snap(env.oats)
      harvest.snap()
    }
  }

  // ---- picking: the farm's own fields, and in spring the land that can be had; and the crews.
  const ray = new Raycaster()
  const ndc = new Vector2(), hit = new Vector3()
  const quads = FIELDS.map(f => {
    const a = new Vector3(f.x0, fieldBaseY(f.z0) + 0.5, f.z0), b = new Vector3(f.x1, fieldBaseY(f.z0) + 0.5, f.z0)
    const c = new Vector3(f.x1, fieldBaseY(f.z1) + 0.5, f.z1), d = new Vector3(f.x0, fieldBaseY(f.z1) + 0.5, f.z1)
    return [new Triangle(a, b, c), new Triangle(a, c, d)]
  })
  // A tract under trees is picked by its canopy too: the same quad at the height of the crowns.
  const crowns = quads.map(tris => tris.map(t => new Triangle(t.a.clone().setY(t.a.y + 10), t.b.clone().setY(t.b.y + 10), t.c.clone().setY(t.c.y + 10))))
  function pick(x: number, y: number): number {
    const vp = viewport()
    ray.setFromCamera(ndc.set((x / vp.w) * 2 - 1, -(y / vp.h) * 2 + 1), rig.camera)
    let best = -1, bd = Infinity
    quads.forEach((tris, i) => {
      const f = snap.fields[i]
      if (!f.held && !f.available && !f.ours) return
      const wooded = f.cover === 'woods' && f.felled < 0.9
      for (const t of wooded ? [...tris, ...crowns[i]] : tris) {
        if (ray.ray.intersectTriangle(t.a, t.b, t.c, false, hit)) {
          const d = hit.distanceToSquared(ray.ray.origin)
          if (d < bd) { bd = d; best = i }
        }
      }
    })
    return best
  }
  // The yard under a point on the screen (-1 home, -2 Dufour), or 0: where the ray meets the yard's level ground.
  function pickYard(x: number, y: number): number {
    if (snap.mode === 'title') return 0
    const vp = viewport()
    ray.setFromCamera(ndc.set((x / vp.w) * 2 - 1, -(y / vp.h) * 2 + 1), rig.camera)
    const o = ray.ray.origin, d = ray.ray.direction
    for (const yard of [-1, -2]) {
      const p = YARD_AT[yard]
      // the yard lies on the slope: follow the ray down to the ground it meets, not to one level
      let t = -1, y = groundY(p.x, p.z)
      for (let k = 0; k < 3 && d.y < -1e-4; k++) { t = (y - o.y) / d.y; y = groundY(o.x + d.x * t, o.z + d.z * t) }
      if (t > 0 && yardAt(o.x + d.x * t, o.z + d.z * t) === yard) return yard
    }
    return 0
  }
  function pickUnit(x: number, y: number): number {
    if (snap.mode === 'title') return -1
    const vp = viewport()
    return crews.pick(x, y, rig.camera, vp.w, vp.h, snap.mode === 'season' || app.unit >= 0)
  }
  const input = attachInput(canvas, app, rig, viewport, pick, pickUnit, goHome, pickYard, i => frameField(i))

  // The hour the scene is lit for. The day's own picture may be a morning (fog, a white frost, deep mist); days going
  // by quickly are never shown as mornings and stand in the plainer light of mid afternoon, and the light turns from
  // morning to evening or back no oftener than every few seconds, so it never chases the days.
  let dayHour = EVENING
  // An hour set by a tool, held until the game next changes the day.
  let heldHour: number | null = null
  let morning = false
  let hourSince = -99
  function aimHour(now: boolean): void {
    const season = snap.mode === 'season'
    const want = dayHour < 0 && (!season || app.speed <= 1)
    if (want !== morning && (now || !season || app.speed === 0 || time - hourSince > HOUR_HOLD_S)) { morning = want; hourSince = time }
    // Between changes the sun holds still: a sun that crept would make every fine shadow on the land crawl.
    envT.hour = heldHour !== null ? heldHour : !season ? dayHour : morning ? MORNING : app.speed >= 3 ? 0.72 : app.speed === 2 ? 0.87 : EVENING
  }

  const shaftTint = new Color(), veilTint = new Color(), leafLight = new Color()
  let looking = 0
  function applyLight(dt: number): void {
    // How far the camera looks toward the sun, taken slowly so that turning the view does not pump the exposure.
    const toSun = rig.camera.getWorldDirection(ahead).dot(lit.skySun)
    looking += (toSun - looking) * (dt > 0.01 ? 1 - Math.exp(-dt / 0.7) : 1)
    light(env, looking, lit)
    U.uSunDir.value.copy(lit.sunDir)
    U.uSunCol.value.copy(lit.sun)
    U.uHazeSun.value.copy(lit.hazeSun)
    U.uHazeAway.value.copy(lit.hazeAway)
    U.uMistCol.value.copy(lit.mist)
    U.uHaze.value.set(env.haze, HAZE_FALL)
    U.uNight.value = lit.night
    // Mist lies in the low ground: on the brook and the bottom land, thinning fast above it; on a fog day it fills the
    // valley to the mid slope and the ridge stands out of it.
    // In metres: a sheet a few metres deep over the water and the bottom fields, gone by the middle fields; on a fog
    // day it stands some twenty metres deep, thinner, and only the ridge fields and the woods rise out of it.
    U.uMist.value.set((0.04 - 0.02 * env.mistDeep) * env.mist, 1 / (2.2 + 5 * env.mistDeep), WATER_Y + 1.6 + 5.5 * env.mistDeep, 0.8)
    U.uCloud.value.x = env.cloudShadow
    U.uCloud.value.y = env.cloud
    U.uSnow.value = env.snow
    U.uRime.value.set(env.rime0, env.rime1, env.rime2)
    U.uWet.value = env.wet
    U.uGrass.value.copy(env.grass)
    U.uGold.value = env.gold
    U.uLeaf.value = env.leaf
    U.uDay.value = snap.day
    U.uSunlit.value += ((snap.mode === 'title' ? 120 * K : 0) - U.uSunlit.value) * Math.min(1, dt * 1.2)
    sky.setAir(lit.air, lit.skySun, lit.moon, lit.skyCap, lit.skyGain / lit.skyShow, lit.exposure)
    sky.tune.set(lit.skyShow, lit.skySat, 0.25)
    sky.more.set(env.high, env.storm, lit.night, ambient)
    sky.deck.copy(lit.deck)
    sky.deckDark.copy(lit.deckDark)
    sky.rim.copy(lit.rim)
    sky.high.copy(lit.high)
    sky.glow.copy(lit.glow)
    sky.ground.copy(lit.ground)
    UI_GAIN.value = 1.1 / lit.exposure
    // Lamps are lit when it is dark enough to want one: after sunset, and one or two under a black storm.
    const lamp = 5 * smooth(0.5, 0.95, 1 - lit.day) + 0.5 * smooth(0.7, 1, env.storm) * smooth(0.9, 1, env.cloud)
    LAMP.value += (lamp / lit.exposure - LAMP.value) * Math.min(1, dt * 2)
  }
  const spent = { crews: 0, update: 0, draw: 0 }
  const tally = { frames: 0, triangles: 0, calls: 0 }
  let replayPace = 1
  let gustHeading = 0.4, gustRun = 0, mistAt = 0
  const cloudAt = new Vector2()

  function measure(dtMs: number): void {
    if (warm < 150) { warm++; return }
    if (dtMs > 250) return
    times.push(dtMs)
    if (times.length < 90) return
    const sorted = times.slice().sort((a, b) => a - b)
    const median = sorted[45]
    times.length = 0
    fps = Math.round(1000 / Math.max(1, median))
    if (app.settings.quality !== 'auto') return
    // Two slow stretches running, and the setting comes down a step; it does not go back up by itself. Slow is when
    // more than a quarter of the frames miss a sixtieth of a second by a margin: that is felt as a stutter long before
    // the middle frame is late.
    slow = sorted[66] > 20.5 ? slow + 1 : 0
    // Plainly too slow (under 35 frames a second) is not given a second stretch to prove it.
    if (sorted[66] > 28) slow = 2
    if (slow >= 2 && tier !== 'low') {
      tier = DOWN[tier]
      slow = 0
      warm = 60
      resize()
    }
  }

  function frame(dtMs: number): void {
    if (document.hidden || !compiled) return
    if (lost) {
      lostFor += dtMs
      if (lostFor > LOST_MS) giveUp()
      return
    }
    const vp = viewport()
    // A move to a screen of another density changes the pixel ratio without any resize event.
    if (vp.w !== size.w || vp.h !== size.h || pixelRatio() !== size.pr) resize()
    const dt = Math.min(0.1, dtMs / 1000)
    if (dtMs > 0.5) measure(dtMs)
    time += dt
    ambient += dt * (reduced ? STILL : 1)
    fall += reduced ? 0 : dt
    frameNo++
    if (dirty) rebuild()
    // Day clock: follows the game clock when it runs, plays the day out by itself when paused.
    if (snap.mode === 'title') dayT = reduced ? 0.12 : titleDay()
    else if (dayT < 1) dayT = Math.min(1, app.speed > 0 ? Math.max(dayT + dt / DAY_ANIM_S * 0.25, app.dayProgress) : dayT + dt / DAY_ANIM_S * replayPace)
    if (crews.stageHold >= 0 && snap.mode === 'season') dayT = Math.min(dayT, crews.stageHold)
    aimHour(false)
    easeEnv(env, envT, 1 - Math.exp(-dt / 1.1), reduced ? dt * 4 : dt)
    const pace = reduced ? STILL : 1
    const wx = Math.cos(env.windDir), wz = Math.sin(env.windDir)
    U.uTime.value = ambient
    U.uSway.value = reduced ? 0 : env.wind
    U.uWindDir.value.set(wx, wz)
    windAt.x += wx * (0.4 + env.wind) * 2.2 * dt * pace
    windAt.y += wz * (0.4 + env.wind) * 2.2 * dt * pace
    // Gusts run down a heading that follows the day's wind slowly; cloud and its shadow drift with the wind itself.
    let swing = env.windDir - gustHeading
    while (swing > Math.PI) swing -= Math.PI * 2
    while (swing < -Math.PI) swing += Math.PI * 2
    gustHeading += swing * (1 - Math.exp(-dt / 7))
    // A front runs down the wind at some metres a second, and crosses a field in a quarter of a minute; the clouds'
    // shadows go a little slower than a walking tractor in a light air and as fast as a truck in a blow.
    gustRun += (5 + 9 * env.wind) * dt * pace
    U.uGust.value.set(Math.cos(gustHeading), Math.sin(gustHeading), gustRun, env.wind)
    cloudAt.x -= (wx * (5 + 11 * env.wind) * dt * pace) / CLOUD_TURN
    cloudAt.y -= (wz * (5 + 11 * env.wind) * dt * pace) / CLOUD_TURN
    U.uCloud.value.z = cloudAt.x
    U.uCloud.value.w = cloudAt.y
    terrain.water.ice.value = env.ice
    for (let i = 0; i < FIELD_COUNT; i++) { terrain.held.value[i] = fields.held[i]; terrain.off.value[i] = fields.off[i]; terrain.avail.value[i] = fields.avail[i] }
    input.frame(dt)
    if (rig.idle < 0.2 && framing !== 'free') framing = 'free'
    if (snap.mode === 'title' && framing === 'title') {
      if (!reduced && titleFixed < 0) titleClock += dt
      const to = rig.titlePose(vp, titleU())
      if (rig.moving()) rig.retarget(to)
      else rig.moveTo(to, true)
    }
    rig.update(dt, vp, reduced)
    applyLight(dt)
    const cam = rig.camera
    crews.shudder(cam, dt, reduced)
    sky.dome.position.copy(cam.position)
    const t0 = performance.now()
    crews.place({
      dt, dayT, advancing: app.speed > 0, pace: replayPace, time, reduced, idle: snap.mode !== 'season' && snap.mode !== 'title',
      season: snap.mode === 'season', dist: rig.cur.dist, dust: env.dry, dark: clamp((LAMP.value * lit.exposure) / 5, 0, 1), picked: app.unit, particles, passed, snap, env, camera: cam,
    })
    // Smoke from the kitchen chimney: all day in the cold, a thread of it at supper time. It goes on rising and leans
    // away downwind, a plume a few roofs high: from two fields off it says where the house is and which way the wind sets.
    smokeAt += dt * pace
    if (env.smoke > 0.2 && smokeAt > 0.3) {
      smokeAt = 0
      particles.emit(props.chimney.x, props.chimney.y, props.chimney.z, (Math.random() - 0.5) * 0.2, 1.1, (Math.random() - 0.5) * 0.2, 0.3, 0.42, 15, 0.74, 0.74, 0.76, 0.3 * env.smoke, 0.85, 1.1 / (1 + env.wind))
    }
    props.update({ dt: dt * pace, time: ambient, env, lit, dist: rig.cur.dist, yard: app.yard, particles, eye: cam.position })
    // The brook breathes on a still damp morning: wisps that lift off the water and thin away.
    mistAt += dt * pace
    const breath = Math.max(env.mist, 0.5 * Math.max(env.rime0, env.rime2)) * (1 - Math.max(env.rain, env.snowfall)) * (1 - 0.6 * Math.min(1, env.wind))
    if (breath > 0.12 && mistAt > 0.2) {
      mistAt = 0
      const reach = clamp(rig.cur.dist * 1.6, 120, 900)
      const x = clamp(rig.cur.x + (Math.random() - 0.5) * 2 * reach, LAND.x0 - 300, LAND.x1 + 300)
      const big = clamp(rig.cur.dist / 90, 1, 3.2)
      particles.emit(x, WATER_Y + 0.8, brookZ(x) + (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5, 3.2 * big, 1.1 * big, 11, 0.9, 0.92, 0.95, 0.11 * breath, 0.5)
    }
    const t1 = performance.now()
    particles.update(dt * (reduced ? 0.3 : 1), wx * env.wind * 4, wz * env.wind * 4)
    // Where the picture is looking: the ground in the middle of what the interface leaves free.
    const eyes = rig.looksAt(vp)
    focus.set(eyes.x, fieldBaseY(eyes.z), eyes.z)
    const eyeDist = focus.distanceTo(rig.camera.position)
    // The air that rain, snow and leaves fall through reaches from the camera past what it looks at.
    const span = clamp(eyeDist / 45, 1, 40)
    leafLight.copy(lit.sun).multiplyScalar(0.3).add(lit.hazeAway)
    weather.update({
      fall, rain: env.rain, snowfall: env.snowfall, leaves: env.fall * (0.35 + 0.65 * Math.min(1, env.wind * 2)), windX: wx * env.wind, windZ: wz * env.wind,
      centre: ahead.set(eyes.x, focus.y, eyes.z).lerp(rig.camera.position, 0.45), span, tint: lit.hazeAway, light: leafLight,
      resX: post.target.width, resY: post.target.height, floor: focus.y,
    })
    birds.update(ambient, Math.max(env.rain, env.snowfall, lit.night), lit.hazeAway)
    beacons.update(post.target.width, post.target.height, smooth(0.1, 0.8, (LAMP.value * lit.exposure) / 0.6), lit.exposure)
    rig.camera.getWorldDirection(ahead)
    const flat = Math.hypot(ahead.x, ahead.z) || 1
    shadows.update(lit.sunDir, lit.sun, focus, eyeDist, dtMs <= 0.5, ahead.x / flat, ahead.z / flat)
    fields.setFarShadows(!shadows.holdsFarm)
    MARK_WIDE.value = clamp(rig.cur.dist / (42 * S), 1, 4.5 * K / S)
    fields.update(dt, cam, { selection: app.selection, hover: app.hover, oats: env.oats, oatsRipe: env.oatsRipe, reduced })
    grass.update(cam, fields.off, dtMs <= 0.5)
    flora.update(cam)
    harvest.update(dt, app.speed === 0, clamp(rig.cur.dist / (30 * S), 1, 2.3), reduced)
    PIXEL.value = (TIERS[tier].msaa ? 1.7 : 1.4) / ((post.target.height) / (2 * Math.tan((cam.fov * Math.PI) / 360)))
    // A landscape seen whole is sharp from front to back: a soft focus would make a model of it. Only close in, among
    // things a few metres off, does the lens go a little soft behind them; it opens up while the player moves the camera.
    const want = env.lens * (rig.idle < 0.6 ? 0.2 : 1) * smooth(90, 14, rig.cur.dist) * (snap.mode === 'title' ? 0.7 : 1.2)
    lens += (want - lens) * (1 - Math.exp(-dt / 0.35))
    const t2 = performance.now()
    renderer.info.reset()
    if (frameNo % 2 === 0 || frameNo < 4 || dtMs <= 0.5) sky.renderMap(renderer)
    const skyDrew = renderer.info.render.triangles
    const sharp = rig.focus()
    // Where the sun stands on the picture, and how much of its light the air shows: most when it is low, the air is
    // hazy or misty, the sky is open, and the camera looks its way.
    sunAt.copy(lit.skySun).multiplyScalar(8000).add(cam.position).project(cam)
    const facing = cam.getWorldDirection(ahead).dot(lit.skySun)
    const falling = Math.max(env.rain, env.snowfall)
    const open = clamp(1 - env.cloud, 0, 1) * (1 - falling)
    const thick = clamp(0.45 + env.haze * 380 + 0.6 * env.mist, 0, 1.4)
    const shafts = (reduced ? 0.7 : 1) * lit.low * lit.day * Math.min(1, env.sunScale * 1.5) * (0.35 + 0.65 * open) * thick * smooth(0.25, 0.8, facing)
    const peak = Math.max(lit.sun.r, lit.sun.g, lit.sun.b, 1e-4)
    shaftTint.copy(lit.sun).multiplyScalar(1 / peak)
    // The grade follows the light: warm and rich under a low open sun, plainer under cloud, amber in the fall, cool on
    // snow and blue at night; and what falls or hangs in the air lifts the darks into its own colour.
    const gold = lit.low * open * lit.day
    const cold = clamp(env.snow, 0, 1)
    const autumn = env.gold * (1 - cold)
    veilTint.copy(lit.hazeAway).multiplyScalar(lit.exposure)
    const veilPeak = Math.max(veilTint.r, veilTint.g, veilTint.b, 0.7)
    veilTint.multiplyScalar(0.7 / veilPeak)
    post.render(scene, cam, {
      exposure: lit.exposure, focus: sharp, aperture: 0.3 * lens, time, grain: 0.018,
      sunX: sunAt.x * 0.5 + 0.5, sunY: sunAt.y * 0.5 + 0.5, shafts: sunAt.z < 1 ? shafts : 0, shaftTint,
      warm: 0.2 + 0.5 * gold + 0.1 * autumn * open - 0.3 * cold - 0.28 * lit.night,
      // Rain is wet and dark: its colours deepen and its darks go down, where snow and mist pale theirs.
      rich: 0.1 + 0.15 * gold + 0.1 * autumn + 0.16 * env.rain - 0.05 * env.snowfall,
      contrast: 0.1 + 0.09 * open * lit.day + 0.06 * env.storm + 0.16 * env.rain,
      veil: 0.08 * env.mist + 0.05 * env.snowfall, veilTint,
      vignette: snap.mode === 'title' ? 0.3 : 0.2 + 0.1 * lit.night + 0.06 * env.storm,
    }, Math.round(size.w * size.pr), Math.round(size.h * size.pr))
    const t3 = performance.now()
    // What the frames draw, summed, so a tool can take the mean over many: the shadow maps are redrawn on different
    // frames, and one frame's count says little.
    tally.frames++
    tally.triangles += renderer.info.render.triangles - skyDrew
    tally.calls += renderer.info.render.calls
    // how long the frame's own work and its drawing take, smoothed, for the tools
    spent.crews += (t1 - t0 - spent.crews) * 0.05
    spent.update += (t2 - t1 - spent.update) * 0.05
    spent.draw += (t3 - t2 - spent.draw) * 0.05
    if (!firstFrame) firstFrame = performance.now()
    // Tell whoever is waiting that the land has shown what it had to show.
    for (let k = waiters.length - 1; k >= 0; k--) {
      const w = waiters[k]
      const has = pending.some(r => r.field === w.field && r.tubers === w.kind)
      if (has) w.seen = true
      let done = time >= w.until || reduced || app.speed >= 3
      if (!has && frameNo > w.born) {
        if (!w.seen) done = true
        else if (w.settle === 0) w.settle = time + (w.kind === 'sample' ? 0.45 : 0.3)
        else if (time >= w.settle) done = true
      }
      if (done) { waiters.splice(k, 1); w.resolve() }
    }
  }

  const onLost = (e: Event) => { e.preventDefault(); lost = true; lostFor = 0 }
  const onRestored = () => { lost = false; dirty = true }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  // Where a field's plate is pinned: the middle of the field's near edge (the edge nearest the camera), a little inside
  // the crop and on the ground, so a plate standing on it sits on its own field. When that edge is under the interface
  // at the bottom of the screen, the pin moves up the field's middle just far enough to be in the clear.
  const anchor = new Vector3(), far = new Vector3()
  function fieldAnchor(i: number): { x: number; y: number; visible: boolean } {
    const f = FIELDS[i]
    if (!f) return { x: 0, y: 0, visible: false }
    const vp = viewport()
    const cam = rig.camera.position
    const near = fields.nearEdge(i, cam.x, cam.z)
    far.set(2 * f.cx - near.x, near.y, 2 * f.cz - near.z)
    const floor = vp.h - vp.bottom - 10
    let x = 0, y = 0, inFront = false
    for (let k = 0; k <= 6; k++) {
      anchor.copy(near).lerp(far, k / 12)
      anchor.y = fieldBaseY(anchor.z) + 0.7
      anchor.project(rig.camera)
      x = (anchor.x + 1) / 2 * vp.w
      y = (1 - anchor.y) / 2 * vp.h
      inFront = anchor.z < 1
      if (!inFront || y <= floor) break
    }
    return { x, y, visible: inFront && x >= 0 && x <= vp.w && y >= 0 && y <= vp.h }
  }

  function screenAt(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const vp = viewport()
    anchor.set(x, y, z).project(rig.camera)
    const sx = (anchor.x + 1) / 2 * vp.w, sy = (1 - anchor.y) / 2 * vp.h
    return { x: sx, y: sy, visible: anchor.z < 1 && sx >= 0 && sx <= vp.w && sy >= 0 && sy <= vp.h }
  }

  function unitAnchor(id: number): { x: number; y: number; visible: boolean } {
    return crews.anchor(id, far) ? screenAt(far.x, far.y, far.z) : { x: 0, y: 0, visible: false }
  }

  function yardAnchor(yard: number): { x: number; y: number; visible: boolean } {
    const p = YARD_AT[yard]
    return p ? screenAt(p.x, groundY(p.x, p.z) + 6.5 * S, p.z) : { x: 0, y: 0, visible: false }
  }

  // Settles when the land has shown the test dig's hill lifted, or the last row of the day's digging come out.
  function whenShown(kind: 'sample' | 'dig', field: number): Promise<void> {
    return new Promise(resolve => {
      waiters.push({ kind, field, resolve, born: frameNo, until: time + SHOWN_CAP_S, seen: false, settle: 0 })
    })
  }

  // For measuring what each part of the scene costs: the parts by name, which the tools can switch off.
  const parts: Record<string, Object3D> = {
    terrain: terrain.group, flora: flora.group, clearing: clearing.group, pond: pond.group, grass: grass.group, props: props.group, fields: fields.group, harvest: harvest.group,
    crews: crews.group, particles: particles.mesh, weather: weather.group, birds: birds.mesh, sky: sky.dome, far: farHills.mesh, beacons: beacons.group,
  }

  rebuild()
  resize()
  lap('first state')
  const ready = (async () => {
    try {
      renderer.setRenderTarget(post.target)
      await renderer.compileAsync(scene, rig.camera)
      lap('shaders')
    } catch (err) {
      console.warn('The County: shaders could not be compiled ahead of the first frame.', err)
    }
    renderer.setRenderTarget(null)
    compiled = true
    // Test hook: settle every transition at once, so a screenshot shows the state rather than a blend.
    ;(globalThis as Record<string, unknown>).__countyField = {
      settle() {
        if (dirty) rebuild()
        flush(false)
        dayT = snap.mode === 'title' ? dayT : 1
        replayPace = 1
        crews.settle()
        aimHour(true)
        copyEnv(env, envT)
        if (snap.mode === 'title' && framing === 'title') rig.moveTo(rig.titlePose(viewport(), titleU()), true)
        rig.snap(viewport())
        fields.snap(env.oats, rig.camera)
        harvest.snap()
        lens = env.lens
        frame(0.2)
      },
      anchor: (i: number) => fieldAnchor(i),
      // pace: how fast a paused day's work then plays on, 1 as in play.
      seek(t: number, pace = 1) {
        if (dirty) rebuild()
        replayPace = pace
        dayT = Math.max(0, Math.min(1, t))
      },
      info() {
        const w = crews.where()
        return {
          mode: snap.mode, dayT, pending: pending.length, segs: crews.segsInfo(), tractor: w.tractor, farmer: w.farmer, units: w.units, rigs: w.rigs, parts: crews.prims.count,
          fields: snap.fields.map(f => f.status), held: snap.fields.map(f => f.held), tier, framing, rings: fields.ringing(), lods: fields.lods(),
        }
      },
      whenShown,
      // For working on the look: put the camera somewhere.
      // A view may be given in metres, or in the units the tools' views were first written in: `frame` 'land' (plan
      // units: places and distance times K), 'home' or 'dufour' (a yard's small units: places through the yard, distance
      // times S), 'field' (x, z as shares of field `field`'s length and depth; distance in metres), or 'auto' (a near
      // view is a yard's, a far one the land's).
      view(p: Partial<Pose> & { frame?: 'land' | 'home' | 'dufour' | 'field' | 'near' | 'auto'; field?: number }) {
        framing = 'free'
        const q: Partial<Pose> = { ...p }
        let frame = p.frame
        if (frame === 'auto') frame = (p.dist ?? 99) <= 30 && p.x !== undefined ? ((p.x ?? 0) > 60 ? 'dufour' : 'home') : 'land'
        if (frame === 'land') {
          if (p.x !== undefined) q.x = p.x * K
          if (p.z !== undefined) q.z = p.z * K
          if (p.dist !== undefined) q.dist = p.dist * K
        } else if (frame === 'home' || frame === 'dufour') {
          const f = frame === 'home' ? HOME : DUFOUR
          if (p.x !== undefined) q.x = f.x + S * p.x
          if (p.z !== undefined) q.z = f.z + S * p.z
          if (p.dist !== undefined) q.dist = p.dist * S
        } else if (frame === 'near') {
          // a place given in metres (where a person or a machine is), seen from as near as it was first written
          if (p.dist !== undefined) q.dist = p.dist * S
        } else if (frame === 'field') {
          const f = FIELDS[p.field ?? 0]
          q.x = f.x0 + (p.x ?? 0.5) * FW
          q.z = f.z0 + (p.z ?? 0.5) * FD
        }
        rig.moveTo(rig.complete(q), true)
      },
      scale: { K, S, KV },
      // Where a point of the ground is on the screen (for tools that draw over the picture).
      screenOf: (x: number, z: number, up = 0) => screenAt(x, groundY(x, z) + up, z),
      // Hold the opening shot at a point of its move (0 the wide view, 1 the low one); below 0 lets it run.
      titleAt(u: number) { titleFixed = u },
      // For working on the light: set parts of the day's air by hand; they hold until the game next changes the day.
      tune(o: Record<string, number>) { Object.assign(envT, o); Object.assign(env, o); if (typeof o.hour === 'number') { dayHour = o.hour; heldHour = o.hour } },
      home() { goHome() },
      // Put the camera at a tier ('yard', 'field', 'farm', 'county'); n: the field or the yard.
      tier(name: TierName, n?: number) {
        framing = name
        if (name === 'field') framed = n ?? HOME_FIELD
        if (name === 'yard') framedYard = n ?? -1
        rig.moveTo(framedPose(viewport()), true)
      },
      // How far off each tier stands in this window (for checks that zoom).
      tiers() {
        const vp = viewport()
        return { yard: rig.yard(-1, vp).dist, field: rig.field(HOME_FIELD, vp).dist, farm: rig.farm(vp).dist, county: rig.county(vp).dist }
      },
      // The mean of what each frame drew since the last call (triangles and draw calls over every pass).
      mean() {
        const m = { frames: tally.frames, triangles: tally.frames ? tally.triangles / tally.frames : 0, calls: tally.frames ? tally.calls / tally.frames : 0 }
        tally.frames = tally.triangles = tally.calls = 0
        return m
      },
      // Where a crew is on the screen, for clicking it in checks.
      unitAt(id: number) {
        const u = crews.where().units.find(x => x.id === id)
        if (!u) return null
        const at = unitAnchor(id)
        const v = new Vector3(u.x, fieldBaseY(u.z) + 0.9, u.z).project(rig.camera)
        const vp = viewport()
        // on the body: half way between the ground under them and the point over their head
        return { x: ((v.x + 1) / 2 * vp.w + at.x) / 2, y: ((1 - v.y) / 2 * vp.h + at.y) / 2 }
      },
      // Where the interface pins a person's face.
      unitPin: (id: number) => unitAnchor(id),
      // What a click at a point on the screen would pick.
      pickAt: (x: number, y: number) => ({ field: pick(x, y), unit: pickUnit(x, y), yard: pickYard(x, y), mode: snap.mode, held: snap.fields.map(f => f.held), available: snap.fields.map(f => f.available) }),
      parts: () => Object.keys(parts),
      show(name: string, on: boolean) { if (parts[name]) parts[name].visible = on },
      shadowsOn(on: boolean) { for (const l of shadows.lights) l.castShadow = on },
      // Stop (or go on) redrawing one shadow cascade, to measure what it costs.
      cascade(k: number, on: boolean) { shadows.held[k] = !on },
      env, lit, rig,
      // What the last frame drew, where the camera stood, and the clocks.
      stats() {
        const r = renderer.info.render
        return {
          triangles: r.triangles, calls: r.calls, pixelRatio: renderer.getPixelRatio(), width: canvas.width, height: canvas.height,
          camera: rig.where(), time, ambient, fall, exposure: lit.exposure, tier, startedAt, fps, drawn: [post.target.width, post.target.height], firstFrame, built,
          spent: { crews: +spent.crews.toFixed(2), update: +spent.update.toFixed(2), draw: +spent.draw.toFixed(2) }, objects: scene.children.reduce((n, c) => { let k = 0; c.traverse(() => k++); return n + k }, 0),
        }
      },
    }
  })()

  return {
    ready,
    quality: () => ({ tier, fps }),
    resize,
    frame,
    fieldAnchor,
    unitAnchor,
    yardAnchor,
    whenShown,
    dispose() {
      off()
      input.dispose()
      for (const w of waiters) w.resolve()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      terrain.dispose()
      flora.dispose()
      clearing.dispose()
      pond.dispose()
      grass.dispose()
      props.dispose()
      fields.dispose()
      harvest.dispose()
      crews.dispose()
      particles.dispose()
      weather.dispose()
      birds.dispose()
      farHills.dispose()
      beacons.dispose()
      sky.dispose()
      shadows.dispose()
      post.dispose()
      for (const t of [noise, leafTex, flowerTex, puffTex]) t.dispose()
      renderer.dispose()
    },
  }
}
