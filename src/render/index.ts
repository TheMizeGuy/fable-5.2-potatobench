// The field view: the farm in its country, drawn with three.js, played like a strategy map.
// Falls back to a flat drawing without WebGL.
import {
  BackSide, Color, CustomBlending, DoubleSide, FloatType, FrontSide, Group, OneFactor, PCFShadowMap, Raycaster, Scene, Triangle, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget, ZeroFactor,
  type Material, type Mesh, type MeshDepthMaterial, type MeshStandardMaterial, type Object3D, type Side,
} from 'three'
import { DAYS_PER_SECOND, type App } from '../game/app.ts'
import type { CreateFieldView, FieldView, Place, Thing } from '../game/contracts.ts'
import { FIELD_COUNT, HILLS } from '../sim/index.ts'
import { CameraRig, HOME_FIELD, MIN_DIST, MOVE_MS, pitchFor, type Pose, type TierName, type Viewport } from './camera.ts'
import { Clearing } from './clearing.ts'
import { EVENING, MORNING, copyEnv, easeEnv, envTarget, light, makeEnv, makeLight } from './env.ts'
import { FarHills } from './far.ts'
import { createFallbackView } from './fallback.ts'
import { Fields, MARK_WIDE, PIXEL, UI_GAIN, type HillDisplay } from './fields.ts'
import { Flora } from './flora.ts'
import { Grass } from './grass.ts'
import { Harvest } from './harvest.ts'
import { attachInput } from './input.ts'
import { DUFOUR, FD, FIELDS, FW, HOME, HOUSE, LAND, POTATO_HOUSE, ROAD, WATER_Y, brookZ, fieldBaseY, groundY, YARD_AT, yardAt } from './layout.ts'
import { clamp, hash2, smooth } from './noise.ts'
import { K, KV, S } from './scale.ts'
import { laps } from './laps.ts'
import { Climb, Pace, SIZES, Sizer, startOn } from './pace.ts'
import { Particles } from './particles.ts'
import { Pond } from './pond.ts'
import { Post } from './post.ts'
import { Probe } from './probe.ts'
import { LAMP, Props } from './props.ts'
import { CLOUD_TURN, FIRST_NUDGE, HAZE_FALL, U } from './shaders.ts'
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
//   high: everything, the picture at no more than a 1920 by 1080 screen's pixels however dense the display (a window
//     of 1512 by 982 at two device pixels to one is drawn at 1786 by 1160 and stretched, with its edges given back);
//     the fine shadow redrawn every other frame, the second every fourth, the widest every twelfth.
//   medium: the picture at 1.45 million pixels with lighter smoothing of edges; no contact shade or soft focus; shadow
//     maps at half the detail, the wider two redrawn less often; shorter shafts; clouds followed in fewer steps;
//     and what the other parts drop at this setting (whole trees, plants and grass nearer the camera only).
//   low: the picture at 0.9 million pixels with no multisampling; the fine shadow redrawn every third frame, the
//     second every twelfth, the widest (the back country's woods) once a second; no shafts or bloom; flat-bottomed
//     clouds; and the other parts' low setting (fewer whole plants, trees as simple shapes, sparse grass, people
//     without shadows).
// `pixels`: the most the picture is drawn at; `ratio`: the most device pixels to one of the page's that the canvas
// itself is given (the browser stretches it over the window); `every`: how often each shadow cascade is redrawn, in frames.
const TIERS: Record<Tier, { scale: number; pixels: number; ratio: number; msaa: number; ao: boolean; focus: boolean; bloom: boolean; shafts: number; clouds: number; shadow: [number, number, number]; every: [number, number, number]; density: number }> = {
  high: { scale: 1, pixels: 1920 * 1080, ratio: 2, msaa: 4, ao: true, focus: true, bloom: true, shafts: 40, clouds: 7, shadow: [3072, 2048, 2048], every: [2, 4, 12], density: 1 },
  medium: { scale: 1, pixels: 1.45e6, ratio: 1.5, msaa: 2, ao: false, focus: false, bloom: true, shafts: 20, clouds: 4, shadow: [2048, 1024, 1024], every: [2, 6, 24], density: 1 },
  low: { scale: 0.75, pixels: 0.9e6, ratio: 1, msaa: 0, ao: false, focus: false, bloom: false, shafts: 0, clouds: 2, shadow: [1024, 1024, 512], every: [3, 12, 60], density: 0.5 },
}
// Where the setting a machine was measured for is remembered, and which measure it was: a build that draws at another
// cost counts on, and every machine is measured again.
const GPU_KEY = 'the-county/gpu', GPU_MEASURE = 1
type TierDef = (typeof TIERS)[Tier]
const DOWN: Record<Tier, Tier> = { high: 'medium', medium: 'low', low: 'low' }
const UP: Record<Tier, Tier> = { low: 'medium', medium: 'high', high: 'high' }

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
    fieldCorners: i => inner.fieldCorners(i),
    unitAnchor: u => inner.unitAnchor(u),
    unitFoot: u => inner.unitFoot(u),
    thingAnchor: t => inner.thingAnchor(t),
    thingAt: (x, y) => inner.thingAt(x, y),
    follow: u => inner.follow(u),
    followed: () => inner.followed(),
    unitPlace: u => inner.unitPlace(u),
    home: () => inner.home(),
    yardAnchor: y => inner.yardAnchor(y),
    groundAt: (x, y) => inner.groundAt?.(x, y) ?? null,
    screenOf: p => inner.screenOf?.(p) ?? { x: 0, y: 0, visible: false },
    show: what => inner.show?.(what),
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
  const probe = new Probe(renderer)
  post.probe = probe
  probe.setCascades(shadows.lights.map(l => l.shadow.camera))
  const leafTex = leafTexture(), flowerTex = flowerTexture(), puffTex = puffTexture()
  lap('textures')
  const terrain = buildTerrain()
  lap('terrain')
  const flora = new Flora()
  flora.bake(renderer)
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
  // The land's hold on trees counted as felled until they are seen to go over (asked for by name: it comes with the
  // land's own next change, and until then nothing is held).
  const holdTrees = (flora as unknown as { holdStanding?: (i: number, n: number) => void }).holdStanding?.bind(flora)
  crews.setHold((i, n) => {
    const fv = snap.fields[i]
    if (!holdTrees || !fv) return
    holdTrees(i, n)
    flora.setFelled(i, fv.cover === 'woods' || fv.cover === 'brush' ? fv.felled : 1)
  })
  lap('crews')
  const particles = new Particles(puffTex)
  const weather = new Weather()
  const birds = new Birds()
  const farHills = new FarHills()
  const beacons = new Beacons()
  scene.add(farHills.mesh, beacons.group)
  // The sky is drawn last of all, where the land (itself drawn after what stands on it) has left it showing.
  const above = new Group()
  above.renderOrder = 60
  above.add(sky.dome)
  scene.add(above, terrain.group, flora.group, clearing.group, pond.group, grass.group, props.group, fields.group, harvest.group, crews.group, particles.mesh, weather.group, birds.mesh)
  // Whatever throws a shadow near at hand throws it into the fine cascade; the far trees and farmsteads only into the wide one.
  scene.traverse(o => { if (o.castShadow && !o.userData.far) o.layers.enable(3) })

  const env = makeEnv(), envT = makeEnv(), lit = makeLight()
  let snap: Snapshot = snapshot(app)
  let shown: HillDisplay[][] = snap.fields.map(f => f.hills.map(look => ({ look, ridge: f.ridge })))
  let dayT = 1
  let dirty = true, dayPassed = false, first = true
  // Whether the clock was running when the day just counted was counted (what it brought may have stopped it since).
  let dayRan = false
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
  // How long the first frame's own drawing took, and how many shaders there were by its end.
  let firstDraw = [0, 0]
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
  // Left to itself the view starts where the graphics chip suggests, a chip built into the processor at the middle
  // setting (the low one on a small machine) and a graphics card at the high one, and then times its first frames
  // whole: the setting is the highest those leave room for, and it is remembered, so it is measured once. After that
  // the picture's size follows whether frames keep their beat, and the setting comes down a step if at its smallest
  // they still do not (or at once, if they are plainly too slow); it does not go back up by itself.
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
  // Under a test driver the picture is kept as the setting gives it, so that a tool's pictures do not depend on what
  // else the machine was doing; a tool may ask for the measuring by name.
  let adaptive = !navigator.webdriver || new URLSearchParams(location.search).has('adapt')
  function remembered(): Tier | null {
    try {
      const kept = JSON.parse(localStorage.getItem(GPU_KEY) ?? 'null') as { tier?: string; measure?: number } | null
      const t = kept?.measure === GPU_MEASURE ? kept.tier : null
      return t === 'high' || t === 'medium' || t === 'low' ? t : null
    } catch { return null }
  }
  // fell: the setting kept is one it came down to by itself, and may go up from again.
  function remember(ms: number, fell = false): void {
    try { localStorage.setItem(GPU_KEY, JSON.stringify({ tier, ms: Math.round(ms * 10) / 10, measure: GPU_MEASURE, fell })) } catch { /* storage blocked: measured again next time */ }
  }
  const known = adaptive ? remembered() : null
  let fellBefore = false
  try { fellBefore = known !== null && (JSON.parse(localStorage.getItem(GPU_KEY) ?? 'null') as { fell?: boolean } | null)?.fell === true } catch { /* nothing kept */ }
  const startedAt = app.settings.quality === 'auto' ? known ?? startTier() : app.settings.quality
  let tier: Tier = startedAt
  let cur: TierDef = TIERS[tier]
  // The first run's frames, timed whole (null once the choice is made).
  let trial: number[] | null = adaptive && app.settings.quality === 'auto' && !known ? [] : null
  const onePixel = new Uint8Array(4)
  const times: number[] = []
  let fps = 60, warm = 0
  const pacing = new Pace(), sizer = new Sizer()
  // A tool may ask for every beat of the display to be drawn, and for the frame to be drawn without one or another of
  // the things that make it cheaper, to measure what each saves.
  let capped = true
  const without = { order: false, cards: false, contact: false }

  function viewport(): Viewport {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight
    const i = app.insets
    return { w, h, top: i.top, right: i.right, bottom: i.bottom, left: i.left }
  }

  const pixelRatio = () => Math.min(cur.ratio, devicePixelRatio || 1)
  // A tool's hand on the setting's parts, to try one against another.
  let over: Partial<TierDef> = {}
  let size = { w: 0, h: 0, pr: 0 }
  // The setting the parts were last told of: a change of size alone leaves them as they are.
  let told: Tier | '' = ''
  function resize(): void {
    cur = { ...TIERS[tier], ...over }
    const vp = viewport(), pr = pixelRatio(), t = cur
    renderer.setPixelRatio(pr)
    renderer.setSize(vp.w, vp.h, false)
    size = { w: vp.w, h: vp.h, pr }
    const scale = Math.min(t.scale, Math.sqrt(t.pixels / Math.max(1, vp.w * vp.h * pr * pr))) * sizer.size
    post.setSize(Math.max(2, Math.floor(vp.w * pr * scale + 1e-6)), Math.max(2, Math.floor(vp.h * pr * scale + 1e-6)), { msaa: t.msaa, ao: t.ao, focus: t.focus, bloom: t.bloom, shafts: t.shafts })
    sky.setSteps(t.clouds)
    shadows.every = t.every
    shadows.setSizes(t.shadow)
    crews.setScreen(vp.w, vp.h)
    if (told !== tier) {
      told = tier
      weather.setTier(tier)
      particles.setTier(tier)
      fields.setTier(tier, t.density)
      grass.setTier(tier)
      flora.setTier(tier)
      props.setTier(tier)
      crews.setTier(tier)
    }
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
  // Whether a field's tag point lies under what the interface covers (or off the screen).
  function covered(i: number): boolean {
    if (i < 0 || i >= FIELD_COUNT) return false
    const vp = viewport(), at = fieldAnchor(i)
    return !at.visible || at.x < vp.left || at.x > vp.w - vp.right || at.y < vp.top || at.y > vp.h - vp.bottom
  }

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
    rig.level()
    if (snap.mode === 'title') { framing = 'title'; rig.moveTo(rig.titlePose(vp, titleU()), reduced); return }
    const at = framing !== 'free' && framing !== 'title' && rig.isAt(framedPose(vp, turned())) ? framing : 'free'
    if (at === 'free' || at === 'county') { frameField(at === 'county' ? framed : fieldInView(), reduced, true); return }
    framing = at === 'farm' ? 'county' : 'farm'
    rig.moveTo(framedPose(vp), reduced, 1100)
  }

  const off = app.on(e => {
    pacing.wake()
    if (e.type === 'change' || e.type === 'screen') dirty = true
    else if (e.type === 'events') {
      dirty = true
      if (e.dayPassed) { dayPassed = true; dayRan = app.speed > 0 }
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
    } else if (e.type === 'insets') {
      // In a season the camera is the player's: only on a narrow screen, where a card takes half of it, is the view
      // moved, and then only when the card would cover the field in hand.
      if (snap.mode !== 'season') reframe(reduced)
      else if (viewport().w < 700) {
        // The field that was framed is framed again above the sheet; anything else in hand is brought out from under it.
        if (framing !== 'free' && covered(app.selected)) reframe(reduced)
        else if (app.selected < 0 || framing === 'free') keepInView()
      }
    }
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

  // (late: what someone has yet to be seen doing, being behind the clock on the way to it, goes on waiting for them)
  function flush(animate: boolean, late = false): void {
    const keep: PendingReveal[] = []
    for (const r of pending) {
      if (late && crews.owes(r.unit, r.gen)) keep.push(r)
      else reveal(r, animate && pending.length < 200)
    }
    pending = keep
  }

  // A crew has gone this far along its day: reveal the hills it has passed.
  function passed(unit: number, seg: number, arc: number, gen: number): void {
    if (!pending.length) return
    const keep: PendingReveal[] = []
    for (const r of pending) {
      if (r.unit === unit && (r.gen < gen || (r.gen === gen && (r.seg < seg || (r.seg === seg && r.at <= arc))))) reveal(r, true)
      else keep.push(r)
    }
    pending = keep
  }

  function rebuild(): void {
    const next = snapshot(app)
    const prev = snap
    const sameSeason = dayPassed && !first && prev.mode === 'season' && next.mode === 'season' && prev.year === next.year
    if (sameSeason) flush(app.speed < 3 && !reduced, true)
    snap = next
    if (next.mode !== 'season') {
      harvest.clear()
      dugSince.clear()
    }
    const sameDay = !dayPassed && !first && prev.mode === next.mode && prev.year === next.year && prev.seasonDay === next.seasonDay
    if (sameSeason) {
      for (const [f, s] of samples) lastSample.set(f, s)
      pending = pending.concat(crews.plan(next, shown, new Map([...samples].map(([f, s]) => [f, s.hill])), new Set(waiters.filter(w => w.kind === 'dig').map(w => w.field)), dayRan))
      const wait = new Set(pending.map(r => r.field * HILLS + r.hill))
      shown = next.fields.map((f, i) => f.hills.map((_, h) => (wait.has(i * HILLS + h) ? shown[i][h] : display(i, h, next))))
      dayT = 0
      digDir.clear()
      for (const s of crews.segments()) if (s.kind === 'dig' && !digDir.has(s.field)) { const p = new Poly(s.path).at(0); digDir.set(s.field, { dx: p.dx, dz: p.dz }) }
    } else if (sameDay) {
      // A command in the middle of the day: keep the day playing, refresh everything not waiting to be revealed.
      crews.sync(next)
      // (an order just given, with the clock running: whoever would take it sets out)
      if (app.speed > 0) crews.setOut(next)
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
  // The ground a point of the screen lies over: the ray followed down to the slope it meets.
  function groundAt(x: number, y: number): Place | null {
    const vp = viewport()
    ray.setFromCamera(ndc.set((x / vp.w) * 2 - 1, -(y / vp.h) * 2 + 1), rig.camera)
    const o = ray.ray.origin, d = ray.ray.direction
    if (d.y > -1e-4) return null
    const look = rig.looksAt(vp)
    let gy = groundY(look.x, look.z), t = 0
    for (let k = 0; k < 5; k++) { t = (gy - o.y) / d.y; gy = groundY(o.x + d.x * t, o.z + d.z * t) }
    return t > 0 && Number.isFinite(t) ? { x: o.x + d.x * t, y: gy, z: o.z + d.z * t } : null
  }
  function pickUnit(x: number, y: number): number {
    if (snap.mode === 'title') return -1
    const vp = viewport()
    return crews.pick(x, y, rig.camera, vp.w, vp.h, snap.mode === 'season' || app.unit >= 0)
  }
  function thingAt(x: number, y: number): Thing | null {
    if (snap.mode === 'title') return null
    const vp = viewport()
    return crews.pickThing(x, y, rig.camera, vp.w, vp.h)
  }
  // The person the camera keeps in the middle of the picture until the player moves it, or -1.
  let following = -1
  const input = attachInput(canvas, app, rig, viewport, pick, pickUnit, goHome, pickYard, i => frameField(i), thingAt)

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

  // A second and a half of frames drawn while things move: what they cost, and whether the picture should change
  // size or the setting change. Slow is when more than a quarter of the frames miss their beat by a margin: that is
  // felt as a stutter long before the middle frame is late.
  //   two slow stretches running: the picture is drawn smaller, at once, by as much as the frames are late;
  //   at its smallest (seven tenths of the side) and slow for six seconds more: the setting comes down a step, if it
  //     was left to choose for itself (a setting the player chose is kept);
  //   in time for a while: the picture a size larger, and when it has been at its full size and in time for a minute
  //     or more, the setting a step up again (beginning at its smallest picture). Going up is never urgent and makes
  //     every buffer again, so it waits until the camera has stopped.
  let timesFor = 0
  function measure(dtMs: number): void {
    if (warm < 150) { warm++; return }
    if (dtMs > 250) return
    times.push(dtMs)
    timesFor += dtMs
    if (timesFor < 1500 || times.length < 12) return
    const sorted = times.slice().sort((a, b) => a - b), seconds = timesFor / 1000
    times.length = 0
    timesFor = 0
    fps = Math.round(1000 / Math.max(1, sorted[sorted.length >> 1]))
    if (!adaptive || probe.on) return
    const late = sorted[Math.floor(sorted.length * 0.73)] / pacing.frameMs, slow = late > 1.23
    const auto = app.settings.quality === 'auto'
    // Too slow for any size of the picture to mend (under 26 frames a second where 60 are asked for), two stretches
    // running, is not walked down a size at a time. (One such stretch is as often something else on the machine.)
    tooSlow = late > 2.3 ? tooSlow + 1 : 0
    const plainly = tooSlow >= 2 && auto && tier !== 'low'
    if (plainly) tooSlow = 0
    if (upDue && !slow) return
    const say = plainly ? 'floor' : sizer.feed(slow, seconds, late)
    if (!slow || say === 'smaller') atFloor = 0
    if (say === 'floor') {
      // (the picture at its smallest and slow for six seconds, not three: a setting is dearer to change than a size,
      // and a few seconds of something else on the machine should not cost one)
      if (!auto || tier === 'low' || (!plainly && ++atFloor < 2)) return
      atFloor = 0
      tier = DOWN[tier]
      lowered = true
      // (the lower setting begins at its smallest picture too, and grows from there if it holds: at its full size it
      // may be no cheaper than the one given up)
      sizer.reset(true)
      climb.fell()
      // A setting the machine could not hold at any size is not tried again another day; one given up in a single
      // bad stretch (something else at work on the machine) is.
      if (!plainly) remember(sorted[sorted.length >> 1], true)
      resizeNow()
    } else if (say === 'smaller') resizeNow()
    else if (say === 'larger') upDue = true
    else if (auto && lowered && tier !== 'high' && climb.feed(!slow && sizer.step === 0, seconds)) {
      tier = UP[tier]
      lowered = tier !== 'high'
      sizer.reset(true)
      remember(sorted[sorted.length >> 1], lowered)
      upDue = true
    }
  }
  function resizeNow(): void {
    upDue = false
    warm = 60
    resize()
  }
  // The picture or the setting is to go up when the camera has stopped. lowered: the setting has come down by itself
  // from where it began.
  let upDue = false
  let tooSlow = 0
  let atFloor = 0
  let lowered = fellBefore
  let camMoving = false
  const climb = new Climb()

  // Whether anything in the picture moves by itself or is being moved: then every frame is drawn. Otherwise, after a
  // few seconds, the land comes to rest (its water, wind, smoke and weather ease to a stop) and is drawn only a couple
  // of times a second until something is touched.
  let poseWas = 0
  function busy(): boolean {
    const c = rig.cur, g = rig.goal
    const pose = c.x + c.z * 1.37 + c.dist * 2.11 + c.yaw * 331 + c.pitch * 577 + c.fov * 13 + g.x * 0.71 + g.z * 0.53 + g.dist * 1.9 + g.yaw * 211
    const moved = pose !== poseWas
    poseWas = pose
    camMoving = moved || rig.moving() || rig.idle < 0.6
    return moved || app.speed > 0 || (snap.mode === 'title' && !reduced) || dayT < 1 || rig.moving() || rig.idle < 1 || pending.length > 0 || waiters.length > 0
      || dirty || frameNo < 90 || trial !== null
  }
  // A hand on anything, the interface's panels too, is somebody there.
  const wake = () => pacing.wake()
  const TOUCHES = ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'keydown'] as const
  for (const name of TOUCHES) addEventListener(name, wake, { passive: true })
  const downward = new Vector3()

  // Grass is laid out in the time the browser has to spare between frames, a few milliseconds at a go; asked for
  // again after a quarter of a second where it has had none (a machine at full stretch), and then for a moment only.
  const spare = typeof requestIdleCallback === 'function' ? requestIdleCallback : null
  let laying = false
  function layGrass(): void {
    if (!spare || laying || !grass.wants) return
    laying = true
    spare(idle => {
      laying = false
      const began = performance.now()
      grass.lay(() => { const took = performance.now() - began; return took < (idle.didTimeout ? 1.5 : 6) && (idle.didTimeout || idle.timeRemaining() > 1) })
      layGrass()
    }, { timeout: 250 })
  }

  // beatMs: the time since the display's last beat (or next to none: a still picture asked for, always drawn).
  function frame(beatMs: number): void {
    if (document.hidden || !compiled) return
    if (lost) {
      lostFor += beatMs
      if (lostFor > LOST_MS) giveUp()
      return
    }
    const timed = beatMs > 0.5
    // Not every beat is drawn: a fast display's every second or third, and few when nothing moves.
    // (the opening's camera never stops: there the beats to a frame may change as it goes)
    const dtMs = timed ? (capped ? pacing.tick(beatMs, busy(), snap.mode === 'title', camMoving && snap.mode !== 'title') : beatMs) : beatMs
    if (timed && dtMs === 0) return
    const vp = viewport()
    // A move to a screen of another density changes the pixel ratio without any resize event.
    if (vp.w !== size.w || vp.h !== size.h || pixelRatio() !== size.pr) { upDue = false; resize() }
    else if (upDue && !(camMoving && snap.mode !== 'title')) resizeNow()
    const dt = Math.min(0.1, dtMs / 1000)
    // The land's own clocks ease to a stop as it comes to rest.
    const live = timed && capped ? pacing.live : 1
    const wdt = dt * live
    if (timed && live === 1 && !pacing.halved) measure(dtMs)
    time += wdt
    ambient += wdt * (reduced ? STILL : 1)
    fall += reduced ? 0 : wdt
    frameNo++
    if (dirty) rebuild()
    // Day clock: follows the game clock when it runs, plays the day out by itself when paused.
    if (snap.mode === 'title') dayT = reduced ? 0.12 : titleDay()
    else if (dayT < 1) dayT = Math.min(1, app.speed > 0 ? Math.max(dayT + dt / DAY_ANIM_S * 0.25, app.dayProgress) : dayT + dt / DAY_ANIM_S * replayPace)
    if (crews.stageHold >= 0 && snap.mode === 'season') dayT = Math.min(dayT, crews.stageHold)
    aimHour(false)
    easeEnv(env, envT, 1 - Math.exp(-dt / 1.1), reduced ? dt * 4 : dt)
    const pace = (reduced ? STILL : 1) * live
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
    if (following >= 0) {
      if (rig.idle < 0.2 || snap.mode === 'title') following = -1
      else if (!followClose) comeClose(following)
      else if (crews.anchor(following, far) && Math.hypot(rig.goal.x - far.x, rig.goal.z - far.z) > 1.5) {
        const to = rig.complete({ x: far.x, z: far.z, ...followClose })
        if (rig.moving()) rig.retarget(to)
        else rig.moveTo(to, reduced, 700)
      }
    }
    if (snap.mode === 'title' && framing === 'title') {
      rig.level()
      if (!reduced && titleFixed < 0) titleClock += dt
      const to = rig.titlePose(vp, titleU())
      if (rig.moving()) rig.retarget(to)
      else rig.moveTo(to, true)
    }
    rig.update(dt, vp, reduced)
    applyLight(dt)
    const cam = rig.camera
    crews.shudder(cam, wdt, reduced)
    sky.dome.position.copy(cam.position)
    laps.end('land: clocks, light, camera')
    const t0 = performance.now()
    crews.place({
      dt: wdt, dayT, advancing: app.speed > 0, pace: replayPace, time, reduced, idle: snap.mode !== 'season' && snap.mode !== 'title',
      season: snap.mode === 'season', dist: rig.cur.dist, dust: env.dry, dark: clamp((LAMP.value * lit.exposure) / 5, 0, 1), picked: app.unit, particles, passed, snap, env, camera: cam,
      speed: app.speed, daySec: 1 / DAYS_PER_SECOND[Math.max(1, app.speed)], clock: Math.min(0.25, dtMs / 1000) * live,
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
    laps.end('land: people, yard')
    particles.update(wdt * (reduced ? 0.3 : 1), wx * env.wind * 4, wz * env.wind * 4)
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
    laps.end('land: air')
    shadows.update(lit.sunDir, lit.sun, focus, eyeDist, dtMs <= 0.5, ahead.x / flat, ahead.z / flat, app.speed === 0 && dayT >= 1 && snap.mode !== 'title')
    fields.setFarShadows(!shadows.holdsFarm)
    MARK_WIDE.value = clamp(rig.cur.dist / (42 * S), 1, 4.5 * K / S)
    laps.end('land: shadows placed')
    fields.update(wdt, cam, { selection: app.selection, hover: app.hover, oats: env.oats, oatsRipe: env.oatsRipe, reduced })
    laps.end('land: crop')
    grass.update(cam, fields.off, dtMs <= 0.5, spare !== null)
    layGrass()
    laps.end('land: grass')
    flora.update(cam, shadows.wide && !without.cards, focus)
    laps.end('land: trees')
    harvest.update(wdt, app.speed === 0, clamp(rig.cur.dist / (30 * S), 1, 2.3), reduced)
    PIXEL.value = (cur.msaa ? 1.7 : 1.4) / ((post.target.height) / (2 * Math.tan((cam.fov * Math.PI) / 360)))
    // A landscape seen whole is sharp from front to back: a soft focus would make a model of it. Only close in, among
    // things a few metres off, does the lens go a little soft behind them; it opens up while the player moves the camera.
    const want = env.lens * (rig.idle < 0.6 ? 0.2 : 1) * smooth(90, 14, rig.cur.dist) * (snap.mode === 'title' ? 0.7 : 1.2)
    lens += (want - lens) * (1 - Math.exp(-dt / 0.35))
    const t2 = performance.now()
    renderer.info.reset()
    probe.sect('skymap')
    if (frameNo % 2 === 0 || frameNo < 4 || dtMs <= 0.5) sky.renderMap(renderer)
    laps.end('land: sky map')
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
    // Contact shade lets go with distance: with nothing in the picture as near as that (the nearest ground is along
    // its bottom edge; trees and slopes are allowed for), its passes are not run.
    downward.set(0, -1, 0.5).unproject(cam).sub(cam.position).normalize()
    const nearest = downward.y < -1e-3 ? (cam.position.y - focus.y) / -downward.y : 1e9
    post.render(scene, cam, {
      exposure: lit.exposure, focus: sharp, aperture: 0.3 * lens, time, grain: 0.018,
      sunX: sunAt.x * 0.5 + 0.5, sunY: sunAt.y * 0.5 + 0.5, shafts: sunAt.z < 1 ? shafts : 0, shaftTint,
      warm: 0.2 + 0.5 * gold + 0.1 * autumn * open - 0.3 * cold - 0.28 * lit.night,
      // Rain is wet and dark: its colours deepen and its darks go down, where snow and mist pale theirs.
      rich: 0.1 + 0.15 * gold + 0.1 * autumn + 0.16 * env.rain - 0.05 * env.snowfall,
      contrast: 0.1 + 0.09 * open * lit.day + 0.06 * env.storm + 0.16 * env.rain,
      veil: 0.08 * env.mist + 0.05 * env.snowfall, veilTint,
      vignette: snap.mode === 'title' ? 0.3 : 0.2 + 0.1 * lit.night + 0.06 * env.storm,
      contact: without.contact || nearest * 0.9 - 50 < 900,
    }, Math.round(size.w * size.pr), Math.round(size.h * size.pr))
    probe.endFrame()
    laps.end('land: drawn')
    if (trial && timed && frameNo > 8) {
      // The frame is drawn twice more and the GPU waited for, so the time is the whole of three frames' work and not
      // only the page's share of it: a graphics card left idle between frames slows itself down and would read slow.
      for (let k = 0; k < 2; k++) post.render(scene, cam, { exposure: lit.exposure, focus: sharp, aperture: 0.3 * lens, time, grain: 0.018, sunX: 0.5, sunY: 0.5, shafts: 0, shaftTint, warm: 0, rich: 0, contrast: 0, veil: 0, veilTint, vignette: 0.2 }, Math.round(size.w * size.pr), Math.round(size.h * size.pr))
      const g = renderer.getContext()
      g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, onePixel)
      trial.push((performance.now() - t2) / 3)
      if (trial.length >= 5 || trial[trial.length - 1] > 150) {
        const ms = trial.sort((a, b) => a - b)[trial.length >> 1]
        trial = null
        // What the high setting would cost, from what this one did.
        const want = startOn(ms / (tier === 'high' ? 1 : tier === 'medium' ? 0.67 : 0.45))
        const changed = want !== tier
        tier = want
        remember(ms)
        warm = 0
        if (changed) resize()
      }
    }
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
    if (!firstFrame) { firstFrame = performance.now(); firstDraw = [Math.round(t3 - t2), renderer.info.programs?.length ?? 0] }
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
  // The foot the anchors keep above: the interface's foot as it first stood at this window size on this screen, so a
  // list, an alert or a card coming and going never moves a field's tag point while the camera stands still.
  let anchorFoot = { w: 0, h: 0, mode: '', bottom: 0 }
  function fieldAnchor(i: number): { x: number; y: number; visible: boolean } {
    const f = FIELDS[i]
    if (!f) return { x: 0, y: 0, visible: false }
    const vp = viewport()
    if (anchorFoot.w !== vp.w || anchorFoot.h !== vp.h || anchorFoot.mode !== snap.mode || (!anchorFoot.bottom && vp.bottom)) anchorFoot = { w: vp.w, h: vp.h, mode: snap.mode, bottom: vp.bottom }
    const cam = rig.camera.position
    const near = fields.nearEdge(i, cam.x, cam.z)
    far.set(2 * f.cx - near.x, near.y, 2 * f.cz - near.z)
    const floor = vp.h - anchorFoot.bottom - 10
    let x = 0, y = 0, inFront = false
    // Walked in from the near edge until above the foot; the step that crosses it is met at the foot exactly, so the
    // point moves smoothly with the camera rather than in steps.
    let px = NaN, py = NaN
    for (let k = 0; k <= 6; k++) {
      anchor.copy(near).lerp(far, k / 12)
      anchor.y = fieldBaseY(anchor.z) + 0.7
      anchor.project(rig.camera)
      x = (anchor.x + 1) / 2 * vp.w
      y = (1 - anchor.y) / 2 * vp.h
      inFront = anchor.z < 1
      if (inFront && y <= floor && k > 0 && py > floor) { const t = (py - floor) / (py - y); x = px + (x - px) * t; y = floor }
      if (!inFront || y <= floor) break
      px = x; py = y
    }
    return { x, y, visible: inFront && x >= 0 && x <= vp.w && y >= 0 && y <= vp.h }
  }

  function screenAt(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const vp = viewport()
    anchor.set(x, y, z).project(rig.camera)
    const sx = (anchor.x + 1) / 2 * vp.w, sy = (1 - anchor.y) / 2 * vp.h
    return { x: sx, y: sy, visible: anchor.z < 1 && sx >= 0 && sx <= vp.w && sy >= 0 && sy <= vp.h }
  }

  // A point of the land on the screen; behind the camera, a point far off the way it lies.
  function screenOf(p: Place): { x: number; y: number; visible: boolean } {
    const a = screenAt(p.x, p.y, p.z)
    if (anchor.z < 1) return a
    const vp = viewport()
    return { x: vp.w / 2 - (a.x - vp.w / 2) * 1e3, y: vp.h / 2 - (a.y - vp.h / 2) * 1e3, visible: false }
  }

  function fieldCorners(i: number): { x: number; y: number; visible: boolean }[] {
    const f = FIELDS[i]
    if (!f) return []
    const vp = viewport()
    return [[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]].map(([x, z]) => {
      anchor.set(x, fieldBaseY(z) + 0.5, z).project(rig.camera)
      return { x: (anchor.x + 1) / 2 * vp.w, y: (1 - anchor.y) / 2 * vp.h, visible: anchor.z < 1 }
    })
  }

  function unitAnchor(id: number): { x: number; y: number; visible: boolean } {
    return crews.anchor(id, far) ? screenAt(far.x, far.y, far.z) : { x: 0, y: 0, visible: false }
  }

  function unitFoot(id: number): { x: number; y: number; visible: boolean } {
    return crews.anchor(id, far) ? screenAt(far.x, groundY(far.x, far.z) + 0.05, far.z) : { x: 0, y: 0, visible: false }
  }

  function thingAnchor(t: Thing): { x: number; y: number; visible: boolean } {
    if (t.kind === 'yard') return yardAnchor(t.k)
    return crews.thingAt(t, far) ? screenAt(far.x, far.y, far.z) : { x: 0, y: 0, visible: false }
  }

  // Follow ends with the person plainly on the screen: the camera comes in until their pin stands about 120 px over
  // the ground (the figure about half that; a driver's less), or, off the land, frames the home yard where they are indoors.
  function follow(id: number): void {
    following = id
    followClose = null
    if (id < 0) return
    framing = 'free'
    rig.idle = 99
    if (!comeClose(id)) {
      // Not on the land this moment (indoors, a day off at home): the house, from near enough that it is plainly the
      // house that is shown, until they come out.
      framedYard = -1
      rig.moveTo(rig.complete({ x: HOUSE.x - 1.2 * S, z: HOUSE.z - 1.6 * S, dist: 58, pitch: 0.3 }), reduced, 900)
    }
  }

  // The view Follow holds: as close as puts them plainly on the screen, looking down a little more than a walker's eye
  // does, so ground lower than the slope's line (a dip, the brook side) still has them in the picture.
  let followClose: { dist: number; pitch: number } | null = null
  function comeClose(id: number): boolean {
    if (!crews.anchor(id, far)) return false
    const vp = viewport()
    const tall = Math.max(0.6, far.y - groundY(far.x, far.z))
    const perUnit = vp.h / (2 * Math.tan((rig.camera.fov * Math.PI) / 360))
    const want = (tall * perUnit) / (crews.placeOf(id) === 'machine' ? 90 : 120)
    let dist = Math.max(MIN_DIST, Math.min(Math.max(rig.goal.dist, rig.cur.dist), want))
    let pitch = Math.max(pitchFor(dist), 0.3)
    // At a tract's trees (felling, the brush) a walker's eye is among the boughs: from further up and steeper, over them.
    const wooded = snap.fields.some((f, i) => f.cover !== 'open' && far.x > FIELDS[i].x0 - 12 && far.x < FIELDS[i].x1 + 12 && far.z > FIELDS[i].z0 - 12 && far.z < FIELDS[i].z1 + 12)
    if (wooded) { dist = Math.max(dist, 30); pitch = Math.max(pitch, 0.86) }
    followClose = { dist, pitch }
    rig.moveTo(rig.complete({ x: far.x, z: far.z, ...followClose }), reduced, 900)
    return true
  }

  // Brings a person, a yard, a thing or a point of the land to the middle of the picture, from where the camera stands.
  function show(what: { unit: number } | { yard: number } | { thing: Thing } | { at: Place }): void {
    let p: { x: number; z: number } | null = null
    if ('unit' in what) { if (crews.anchor(what.unit, far)) p = { x: far.x, z: far.z } }
    else if ('yard' in what) p = YARD_AT[what.yard] ?? null
    else if ('thing' in what) { if (what.thing.kind === 'yard') p = YARD_AT[what.thing.k] ?? null; else if (crews.thingAt(what.thing, far)) p = { x: far.x, z: far.z } }
    else p = what.at
    if (!p) return
    following = -1
    framing = 'free'
    rig.moveTo(centredOn(p), reduced, 600)
  }

  // The view from where the camera stands that puts a point of the land in the middle of what the interface leaves
  // free (a view's own middle is the window's, which a sheet on a phone may cover).
  function centredOn(p: { x: number; z: number }): Pose {
    const c = rig.looksAt(viewport())
    return rig.complete({ x: rig.cur.x + p.x - c.x, z: rig.cur.z + p.z - c.z })
  }

  // On a phone a sheet takes half the land: whatever is in hand is kept in view above it.
  function keepInView(): void {
    let p: { x: number; z: number } | null = null
    let at: { x: number; y: number; visible: boolean } | null = null
    if (app.unit >= 0 && app.unitFrom === 'land') { if (crews.anchor(app.unit, far)) { p = { x: far.x, z: far.z }; at = screenAt(far.x, far.y, far.z) } }
    else if (app.yard !== 0 && YARD_AT[app.yard]) { p = YARD_AT[app.yard]; at = yardAnchor(app.yard) }
    else if (app.thing && app.thing.thing.kind !== 'yard') { if (crews.thingAt(app.thing.thing, far)) { p = { x: far.x, z: far.z }; at = screenAt(far.x, far.y, far.z) } }
    else if (app.selected >= 0 && FIELDS[app.selected]) {
      // A field: the middle of its near edge, where its tag stands and from where it runs up the picture.
      if (!covered(app.selected)) return
      const cam = rig.camera.position
      const near = fields.nearEdge(app.selected, cam.x, cam.z)
      p = { x: near.x, z: near.z }
      at = { x: 0, y: 0, visible: false }
    }
    if (!p || !at) return
    const vp = viewport()
    if (at.visible && at.x >= vp.left && at.x <= vp.w - vp.right && at.y >= vp.top && at.y <= vp.h - vp.bottom) return
    following = -1
    framing = 'free'
    rig.moveTo(centredOn(p), reduced, 500)
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

  const under = (o: Object3D, root: Object3D): boolean => { for (let p: Object3D | null = o; p; p = p.parent) if (p === root) return true; return false }
  // For measuring what each part of the scene costs: the parts by name, which the tools can switch off.
  const parts: Record<string, Object3D> = {
    terrain: terrain.group, flora: flora.group, clearing: clearing.group, pond: pond.group, grass: grass.group, props: props.group, fields: fields.group, harvest: harvest.group,
    crews: crews.group, particles: particles.mesh, weather: weather.group, birds: birds.mesh, sky: sky.dome, far: farHills.mesh, beacons: beacons.group, farwoods: flora.farWoods,
  }

  rebuild()
  resize()
  lap('first state')
  // When each material's shader was ready, in milliseconds since the view was asked for (for the start-up tool); with
  // ?compile=serial they are compiled one at a time and each is given its own time instead.
  const shadersAt: [string, number][] = []
  const namesOf = (): Map<unknown, string> => {
    const names = new Map<unknown, string>()
    for (const [part, root] of Object.entries(parts)) {
      root.traverse(o => {
        const m = (o as Mesh).material
        if (!m) return
        for (const x of Array.isArray(m) ? m : [m]) if (!names.has(x)) names.set(x, `${part}${o.userData.part ? ` (${o.userData.part as string})` : ''} ${names.size}: ${x.type}${(x as { transparent?: boolean }).transparent ? ', see-through' : ''}`)
      })
    }
    return names
  }
  // The shadow passes' own shaders (a thing that sways or stands in rows is drawn into the shadow maps by a shader of
  // its own) are no part of the scene's, and nor are the lens's: left to themselves each is made in the middle of the
  // first frame that wants it, and that frame waits for it (a quarter of a second, the first time the camera came
  // down to a crop). They are handed to the compiler with the rest, each set up as the shadow pass will set it up.
  const SHADOW_SIDE: Record<number, Side> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide }
  function shadowShaders(): Material[] {
    const made: Material[] = []
    const seen = new Set<string>()
    scene.traverse(o => {
      const mesh = o as Mesh, own = mesh.material as MeshStandardMaterial, depth = mesh.customDepthMaterial as MeshDepthMaterial | undefined
      if (!depth || !own || Array.isArray(own)) return
      const key = `${depth.uuid}|${(o as { isInstancedMesh?: boolean }).isInstancedMesh === true}|${own.shadowSide ?? own.side}|${own.alphaTest}|${own.map ? 1 : 0}`
      if (seen.has(key)) return
      seen.add(key)
      depth.side = own.shadowSide ?? SHADOW_SIDE[own.side]
      depth.alphaTest = own.alphaToCoverage ? 0.5 : own.alphaTest
      depth.map = own.map ?? null
      depth.alphaMap = own.alphaMap ?? null
      mesh.material = depth
      renderer.compile(mesh, rig.camera, scene)
      mesh.material = own
      made.push(depth)
    })
    return made
  }
  let twoPass = { ok: false, pixels: [] as number[] }
  async function compileScene(): Promise<void> {
    const names = namesOf()
    const program = (m: unknown) => (renderer.properties.get(m as object) as { currentProgram?: { isReady(): boolean; program: WebGLProgram } }).currentProgram
    if (new URLSearchParams(location.search).get('compile') === 'serial') {
      const ctx = renderer.getContext()
      const seen = new Set<unknown>()
      const drawn: Object3D[] = []
      scene.traverse(o => { if ((o as Mesh).material && ((o as Mesh).isMesh || (o as { isPoints?: boolean }).isPoints)) drawn.push(o) })
      // (&reverse compiles them in the other order, to tell a shader that is dear from one that only came first)
      if (new URLSearchParams(location.search).has('reverse')) drawn.reverse()
      for (const o of drawn) {
        const t0 = performance.now()
        const made = renderer.compile(o, rig.camera, scene), t1 = performance.now()
        for (const x of made) {
          const p = program(x)
          if (p) ctx.getProgramParameter(p.program, ctx.LINK_STATUS)
          if (!seen.has(x)) { seen.add(x); shadersAt.push([`${names.get(x) ?? x.type} (the page's own part ${Math.round(t1 - t0)} ms)`, Math.round(performance.now() - t0)]) }
        }
      }
      return
    }
    const waiting = renderer.compile(scene, rig.camera)
    for (const m of [...shadowShaders(), ...post.compile()]) { waiting.add(m); if (!names.has(m)) names.set(m, `${m.type} of a shadow or lens pass`) }
    // (and the cards as they are drawn in one pass, for the check below and for a machine that fails it)
    for (const [mesh, mat] of flora.onePass()) {
      const own = mesh.material
      mesh.material = mat
      for (const m of renderer.compile(mesh, rig.camera, scene)) waiting.add(m)
      mesh.material = own
    }
    // The land is laid out by now, and its shaders are with the graphics system's compiler: the splash is told how
    // many of them are through (the scene's building, before this, holds the page still and cannot be shown moving).
    // The land's own shader is waited for longer than all the rest together, so it is given the rule's last stretch
    // and named while it is the one thing left.
    const land = [...waiting].filter(m => names.get(m)?.startsWith('terrain (land)'))
    const rest = Math.max(1, waiting.size - land.length)
    // (told four times a second at most: the page is kept as still as it can be while the compiler has the machine)
    let told = -1e9
    const tell = (now = false) => {
      if (!now && performance.now() - told < 250) return
      told = performance.now()
      const left = land.filter(m => waiting.has(m)).length
      const share = land.length ? 0.3 + 0.3 * (1 - (waiting.size - left) / rest) + 0.4 * (1 - left / land.length) : 0.3 + 0.7 * (1 - waiting.size / rest)
      dispatchEvent(new CustomEvent('county:stage', { detail: { what: left && left === waiting.size ? 'Colouring the land' : 'Mixing the light', share } }))
    }
    await new Promise<void>(done => {
      const check = () => {
        tell()
        for (const m of waiting) {
          const p = program(m)
          if (p && !p.isReady()) continue
          waiting.delete(m)
          shadersAt.push([names.get(m) ?? m.type, Math.round(performance.now() - began)])
        }
        if (waiting.size) setTimeout(check, 10); else { tell(true); done() }
      }
      check()
    })
  }
  const ready = (async () => {
    try {
      renderer.setRenderTarget(post.target)
      await compileScene()
      lap('shaders')
      // The cards are drawn in two passes only where the two place them alike to the last bit.
      twoPass = flora.checkTwoPass(renderer, scene)
      if (!twoPass.ok) flora.twoPass(false)
      lap('cards checked')
    } catch (err) {
      console.warn('The County: shaders could not be compiled ahead of the first frame.', err)
    }
    renderer.setRenderTarget(null)
    compiled = true
    // Test hook: settle every transition at once, so a screenshot shows the state rather than a blend.
    const hooks = {
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
      corners: (i: number) => fieldCorners(i),
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
        if (!crews.anchor(id, far)) return null
        const at = screenAt(far.x, far.y, far.z), foot = screenAt(far.x, groundY(far.x, far.z) + 0.05, far.z)
        // on the body, where they are drawn: half way between the ground under them and the point over their head
        return { x: (foot.x + at.x) / 2, y: (foot.y + at.y) / 2 }
      },
      // Where the interface pins a person's face.
      unitPin: (id: number) => unitAnchor(id),
      // The ground under them, for checks that measure how tall a figure stands on the screen.
      unitFoot: (id: number) => unitFoot(id),
      unitPlace: (id: number) => crews.placeOf(id),
      // Where a yard's tag and a thing are pinned, for checks that a card opens beside them.
      yardPin: (yard: number) => yardAnchor(yard),
      thingPin: (t: Thing) => thingAnchor(t),
      following: () => following,
      // Where people are to be looked for in the yard, in metres (for tools that point the camera at them).
      places: () => crews.places(),
      clocks: () => crews.clocks(),
      // What a click at a point on the screen would pick.
      pickAt: (x: number, y: number) => ({ field: pick(x, y), unit: pickUnit(x, y), yard: pickYard(x, y), thing: thingAt(x, y), mode: snap.mode, held: snap.fields.map(f => f.held), available: snap.fields.map(f => f.available) }),
      parts: () => Object.keys(parts),
      show(name: string, on: boolean) { if (parts[name]) parts[name].visible = on },
      // One child of a part, by its place in it (to find which mesh draws something).
      showChild(name: string, k: number, on: boolean) { const c = parts[name]?.children[k]; if (c) c.scale.setScalar(on ? 1 : 0); return parts[name]?.children.length ?? 0 },
      shadowsOn(on: boolean) { for (const l of shadows.lights) l.castShadow = on },
      // Time the frame's passes on the GPU (and, with `byPart`, each part of the scene in each of them); cost() gives
      // what was measured since the last call.
      probe(on: boolean, byPart = false) {
        if (!on) { probe.stop(); return probe.timed }
        probe.tag('farwoods', flora.farWoods)
        for (const [name, o] of Object.entries(parts)) probe.tag(name, o, m => (m.userData.part as string | undefined) ?? (name === 'flora' && m.userData.far ? 'cards' : undefined))
        probe.start(byPart)
        return probe.timed
      },
      cost: () => probe.take(),
      // Try a setting's parts by hand ({} gives the setting back).
      force(o: Partial<TierDef>) { over = o; resize() },
      // Follow frame time as a player's browser does (a test driver's does not, unless asked), and forget or set what
      // was remembered of this machine.
      adapt(on: boolean, known?: Tier | null) {
        adaptive = on
        if (known === null) { try { localStorage.removeItem(GPU_KEY) } catch { /* nothing kept */ } } else if (known) { tier = known; remember(0); resize() }
        if (on && known === null) trial = []
      },
      // Draw the frame without one of the things that make it cheaper: 'order' (the land and the sky drawn last),
      // 'cardshadow' (far patches' cards in the fine shadow map from the yard tier's distance, not only the farm tier's),
      // 'cards' (cards in the fine shadow when it is wide), 'lazy' (the fine shadow redrawn only when it has
      // moved, where nothing in it moves to be seen), 'contact' (no contact shade where nothing is near enough to show it).
      tryWithout(name: 'order' | 'cards' | 'lazy' | 'contact' | 'corners' | 'thin' | 'half' | 'reach' | 'plants' | 'near' | 'a2c' | 'cardshadow' | 'twopass' | 'treereach', on: boolean) {
        if (name === 'cardshadow') { shadows.early = !on; return }
        if (name === 'twopass') { flora.twoPass(!on && twoPass.ok); return }
        if (name === 'treereach') { flora.tryWithout('reach', on); return }
        if (name !== 'order' && name !== 'cards' && name !== 'lazy' && name !== 'contact') { fields.tryWithout(name, on); return }
        if (name === 'lazy') shadows.eager = on
        else without[name] = on
        terrain.under.renderOrder = without.order ? 0 : 50
        above.renderOrder = without.order ? 0 : 60
      },
      // The cards' two passes: what the start-up check found and whether they are on; the check run again, with the
      // first pass pushed off by `nudge` to see that it catches a machine on which the two do not agree; on or off.
      twoPass: () => ({ ...twoPass, on: flora.twoPassOn }),
      twoPassCheck(nudge = 0) { FIRST_NUDGE.value = nudge; const r = flora.checkTwoPass(renderer, scene); FIRST_NUDGE.value = 0; return r },
      // The farm road's first points, in metres (for a tool's picture down the lane).
      lane: () => ROAD.slice(0, 4),
      // Nothing drawn of the trees as trees, or of their cards (for the tool that lays a view's cost to its parts).
      trees(kind: 'whole' | 'cards', on: boolean) { flora.tryWithout(kind, !on) },
      // How much drawing a part is, whatever the machine: the fragments of it that are drawn, as a multiple of the
      // picture's pixels (a cut-out counts for as much of the pixel as it covers), first all of them, then those in
      // front of what was drawn before them. kind: 'cards', 'whole' (trees as trees), 'farwoods', 'grass', 'props'.
      work(kind: 'cards' | 'whole' | 'farwoods' | 'grass' | 'props'): [number, number] {
        const root = kind === 'farwoods' ? flora.farWoods : kind === 'grass' ? grass.group : kind === 'props' ? props.group : flora.group
        const meshes: Mesh[] = []
        root.traverse(o => {
          const m = o as Mesh
          if (!m.isMesh || !m.layers.test(rig.camera.layers) || (kind === 'cards' && !m.userData.far) || (kind === 'whole' && m.userData.far) || (root === flora.group && kind !== 'cards' && kind !== 'whole')) return
          if (kind !== 'farwoods' && root === flora.group && flora.farWoods && under(m, flora.farWoods)) return
          meshes.push(m)
        })
        const firsts = meshes.map(m => m.userData.first as Mesh | undefined).filter((f): f is Mesh => !!f && f.visible)
        const mats = new Set<Material>()
        for (const m of [...meshes, ...firsts]) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x)
        scene.traverse(o => { if ((o as { isLight?: boolean }).isLight) o.layers.enable(7) })
        const kept = [...mats].map(x => [x, x.blending, x.blendSrc, x.blendDst, x.blendSrcAlpha, x.blendDstAlpha, x.depthTest, x.colorWrite] as const)
        const counted = (x: Material) => { x.blending = CustomBlending; x.blendSrc = ZeroFactor; x.blendDst = OneFactor; x.blendSrcAlpha = OneFactor; x.blendDstAlpha = OneFactor }
        const w = 960, h = Math.round(960 * post.target.height / Math.max(1, post.target.width))
        const rt = new WebGLRenderTarget(w, h, { type: FloatType, depthBuffer: true })
        const px = new Float32Array(w * h * 4), was = renderer.getRenderTarget(), colour = new Color(), mask = rig.camera.layers.mask
        renderer.getClearColor(colour)
        const alpha = renderer.getClearAlpha()
        rig.camera.layers.set(7)
        const out: number[] = []
        for (const depth of [false, true]) {
          // Drawn: every fragment that passes the cut-out (of the first pass, where there are two). Lit: those in
          // front when drawn (or, in two passes, those the second pass keeps).
          const first = firsts.length > 0
          for (const m of meshes) { if (!first || depth) m.layers.enable(7); else m.layers.disable(7) }
          for (const f of firsts) f.layers.enable(7)
          for (const m of meshes) for (const x of Array.isArray(m.material) ? m.material : [m.material]) { counted(x); x.depthTest = depth }
          for (const f of firsts) { const x = f.material as Material; if (!depth) { counted(x); x.colorWrite = true; x.depthTest = false } }
          renderer.setRenderTarget(rt)
          renderer.setClearColor(0x000000, 0)
          renderer.clear()
          renderer.render(scene, rig.camera)
          renderer.readRenderTargetPixels(rt, 0, 0, w, h, px)
          let sum = 0
          for (let k = 3; k < px.length; k += 4) sum += px[k]
          out.push(sum / (w * h))
          for (const [x, blending, src, dst, srcA, dstA, depthTest, colorWrite] of kept) Object.assign(x, { blending, blendSrc: src, blendDst: dst, blendSrcAlpha: srcA, blendDstAlpha: dstA, depthTest, colorWrite })
        }
        rig.camera.layers.mask = mask
        for (const m of [...meshes, ...firsts]) m.layers.disable(7)
        renderer.setClearColor(colour, alpha)
        renderer.setRenderTarget(was)
        rt.dispose()
        return [out[0], out[1]]
      },
      // How much drawing the crop's whole plants are, whatever the machine: their fragments as a multiple of the
      // picture's pixels, first all that pass the leaf's cut-out, then those that are also in front of what was drawn
      // before them (what the picture keeps as it goes). Counted in a small picture of the same shape.
      cropWork(): [number, number] {
        const w = 960, h = Math.round(960 * post.target.height / Math.max(1, post.target.width))
        const rt = new WebGLRenderTarget(w, h, { type: FloatType, depthBuffer: true })
        const px = new Float32Array(w * h * 4)
        const others = scene.children.filter(o => o.visible && o !== fields.group && !(o as { isLight?: boolean }).isLight)
        for (const o of others) o.visible = false
        const was = renderer.getRenderTarget(), colour = new Color()
        renderer.getClearColor(colour)
        const alpha = renderer.getClearAlpha()
        const out: number[] = []
        for (const depth of [false, true]) {
          const hidden = fields.counting(true, depth)
          renderer.setRenderTarget(rt)
          renderer.setClearColor(0x000000, 0)
          renderer.clear()
          renderer.render(scene, rig.camera)
          renderer.readRenderTargetPixels(rt, 0, 0, w, h, px)
          fields.counting(false, depth, hidden)
          let sum = 0
          for (let k = 0; k < px.length; k += 4) sum += px[k]
          out.push((sum * 64) / (w * h))
        }
        for (const o of others) o.visible = true
        renderer.setClearColor(colour, alpha)
        renderer.setRenderTarget(was)
        rt.dispose()
        return [out[0], out[1]]
      },
      // How long a material's shader takes to compile by itself, as it is or with pieces of its fragment shader
      // cut out (each cut: a pattern and what takes its place), to find what in it is dear to compile.
      timeShader(label: string, cuts: [string, string][] = [], nudge = false) {
        let found: Mesh | null = null
        const names = namesOf()
        scene.traverse(o => {
          const m = (o as Mesh).material
          if (found || !m || Array.isArray(m) || !(names.get(m) ?? '').startsWith(label)) return
          found = o as Mesh
        })
        if (!found) return { ms: -1, page: 0, ok: false, missed: [] as string[], name: '' }
        const from = (found as Mesh).material as Material, twin = (found as Mesh).clone(), mat = from.clone()
        const missed: string[] = []
        mat.defines = { ...(from.defines ?? {}) }
        mat.onBeforeCompile = (shader, r) => {
          from.onBeforeCompile(shader, r)
          // (a vertex shader no compiler has seen, so nothing of this program can have been kept from before)
          if (nudge) shader.vertexShader = shader.vertexShader.replace('void main() {', `void main() {\n  float nudged${Math.round(performance.now())} = 0.0;`)
          for (const [pattern, to] of cuts) {
            const re = new RegExp(pattern)
            if (!re.test(shader.fragmentShader)) missed.push(pattern)
            shader.fragmentShader = shader.fragmentShader.replace(re, to)
          }
        }
        mat.customProgramCacheKey = () => `timed-${performance.now()}`
        twin.material = mat
        const ctx = renderer.getContext(), t0 = performance.now()
        renderer.compile(twin, rig.camera, scene)
        const t1 = performance.now()
        const p = (renderer.properties.get(mat) as { currentProgram?: { program: WebGLProgram } }).currentProgram
        // (the browser may say a program is linked before its shaders are through the graphics system's own
        // compiler: only its word that the work is complete is waited for)
        const name = names.get(from) ?? ''
        return new Promise<{ ms: number; page: number; ok: boolean; missed: string[]; name: string }>(done => {
          const check = () => {
            if (p && !ctx.getProgramParameter(p.program, 0x91b1)) { setTimeout(check, 4); return }
            const ms = Math.round(performance.now() - t0)
            const ok = p ? ctx.getProgramParameter(p.program, ctx.LINK_STATUS) as boolean : false
            mat.dispose()
            done({ ms, page: Math.round(t1 - t0), ok, missed, name })
          }
          check()
        })
      },
      // Draw on every beat of the display, whatever its rate and whether anything moves (for timing a frame).
      uncap(on: boolean) { capped = !on },
      // For the tool that looks for late frames: the parts of each frame named on the browser's timeline; and what the
      // last frame drawn did that not every frame does (frames drawn so far, the picture's width, the display's beats
      // to a frame, shader programs made, which shadow maps were drawn again, squares of grass laid, patches of trees
      // that changed how they are drawn, geometries held).
      laps: (on: boolean) => laps.watch(on),
      // The shader programs made so far, and which of the scene's materials (or their shadows) use each.
      shaders() {
        const names = namesOf()
        for (const [part, root] of Object.entries(parts)) root.traverse(o => { const d = (o as Mesh).customDepthMaterial; if (d && !names.has(d)) names.set(d, `${part}${o.userData.part ? ` (${o.userData.part as string})` : ''}: its shadow`) })
        const by = new Map<number, string[]>()
        for (const [m, label] of names) {
          const made = (renderer.properties.get(m as object) as { programs?: Map<string, { id: number }> }).programs
          for (const p of made?.values() ?? []) by.set(p.id, [...(by.get(p.id) ?? []), label])
        }
        return (renderer.info.programs ?? []).map(p => ({ id: p.id, kind: (p as unknown as { type: string }).type, by: by.get(p.id) ?? [] }))
      },
      drew: () => [frameNo, post.target.width, pacing.every, renderer.info.programs?.length ?? 0, shadows.redrawn, grass.laid, flora.swaps, renderer.info.memory.geometries],
      pace: () => ({ beat: pacing.beat, every: pacing.every, still: pacing.still, halved: pacing.halved, size: sizer.size, tier, adaptive, timing: trial !== null, fps, lowered, drawn: [post.target.width, post.target.height] }),
      // Stop (or go on) redrawing one shadow cascade, to measure what it costs.
      cascade(k: number, on: boolean) { shadows.held[k] = !on },
      // Draw a cascade with nothing in it, to see what of the picture's shade is its own.
      emptyCascade(k: number, on: boolean) { shadows.empty(k, on) },
      env, lit, rig,
      // What the last frame drew, where the camera stood, and the clocks.
      stats() {
        const r = renderer.info.render
        return {
          triangles: r.triangles, calls: r.calls, pixelRatio: renderer.getPixelRatio(), width: canvas.width, height: canvas.height,
          camera: rig.where(), time, ambient, fall, exposure: lit.exposure, tier, startedAt, fps, drawn: [post.target.width, post.target.height], samples: post.target.samples, firstFrame, built, began, shadersAt, firstDraw,
          spent: { crews: +spent.crews.toFixed(2), update: +spent.update.toFixed(2), draw: +spent.draw.toFixed(2) }, objects: scene.children.reduce((n, c) => { let k = 0; c.traverse(() => k++); return n + k }, 0),
        }
      },
    }
    // Whatever a tool changes is drawn at once, as what a player changes is.
    const changing = hooks as unknown as Record<string, (...a: unknown[]) => unknown>
    for (const name of ['settle', 'seek', 'view', 'titleAt', 'tune', 'home', 'tier', 'show', 'showChild', 'shadowsOn', 'force', 'cascade', 'emptyCascade', 'adapt', 'uncap', 'tryWithout', 'trees']) {
      const call = changing[name]
      changing[name] = (...a) => { pacing.wake(); return call(...a) }
    }
    ;(globalThis as Record<string, unknown>).__countyField = hooks
  })()

  return {
    ready,
    quality: () => ({ tier, fps, size: sizer.size, least: SIZES[SIZES.length - 1], lowered }),
    resize,
    frame,
    fieldAnchor,
    fieldCorners,
    unitAnchor,
    unitFoot,
    thingAnchor,
    thingAt,
    follow,
    followed: () => following,
    unitPlace: (id: number) => crews.placeOf(id),
    home: goHome,
    yardAnchor,
    groundAt,
    screenOf,
    show,
    whenShown,
    dispose() {
      off()
      input.dispose()
      for (const w of waiters) w.resolve()
      for (const name of TOUCHES) removeEventListener(name, wake)
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
