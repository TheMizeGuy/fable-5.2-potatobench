// The field view: the farm in its country, drawn with three.js, played like a strategy map.
// Falls back to a flat drawing without WebGL.
import { PCFShadowMap, Raycaster, Scene, Triangle, Vector2, Vector3, WebGLRenderer, type Object3D } from 'three'
import type { App } from '../game/app.ts'
import type { CreateFieldView, FieldView } from '../game/contracts.ts'
import { FIELD_COUNT, HILLS } from '../sim/index.ts'
import { CameraRig, type Pose, type Viewport } from './camera.ts'
import { Clearing } from './clearing.ts'
import { Kit } from './crew.ts'
import { copyEnv, easeEnv, envTarget, light, makeEnv, makeLight } from './env.ts'
import { createFallbackView } from './fallback.ts'
import { Fields, MARK_WIDE, PIXEL, UI_GAIN, type HillDisplay } from './fields.ts'
import { Flora } from './flora.ts'
import { Grass } from './grass.ts'
import { Harvest } from './harvest.ts'
import { attachInput } from './input.ts'
import { FD, FIELDS, fieldBaseY, groundY, YARD_AT, yardAt } from './layout.ts'
import { clamp, smooth } from './noise.ts'
import { Particles } from './particles.ts'
import { Pond } from './pond.ts'
import { Post } from './post.ts'
import { LAMP, Props } from './props.ts'
import { U } from './shaders.ts'
import { SunShadows } from './shadows.ts'
import { Sky } from './sky.ts'
import { snapshot, type Mode, type Snapshot } from './state.ts'
import { buildTerrain } from './terrain.ts'
import { flowerTexture, leafTexture, noiseTexture, puffTexture } from './textures.ts'
import { Birds } from './birds.ts'
import { Crews, type PendingReveal } from './units.ts'
import { Weather } from './weather.ts'
import { Poly, type Reveal } from './work.ts'

const DAY_ANIM_S = 3.4          // how long a paused day's work takes to play out
const TITLE_LOOP_S = 44
const LOST_MS = 3000            // how long a lost WebGL context may stay away before the farm is drawn flat
const STILL = 0.02              // the pace of water, cloud, mist and smoke under reduced motion
const SHOWN_CAP_S = 2.5         // the longest whenShown() keeps the interface waiting

type Tier = 'high' | 'medium' | 'low'
// What each setting keeps. Going down: the shallow focus and the contact shade go first, then shadow detail, then
// the size the scene is drawn at and the number of plants; and whole plants give way to clumps, and clumps to rows
// painted on the ground, nearer the camera.
const TIERS: Record<Tier, { scale: number; pixels: number; msaa: number; ao: boolean; focus: boolean; shadow: [number, number, number]; density: number }> = {
  high: { scale: 1, pixels: 3.7e6, msaa: 4, ao: true, focus: true, shadow: [3072, 2048, 2048], density: 1 },
  medium: { scale: 1, pixels: 2.6e6, msaa: 4, ao: false, focus: false, shadow: [2048, 1024, 1024], density: 1 },
  low: { scale: 0.72, pixels: 1.4e6, msaa: 0, ao: false, focus: false, shadow: [1024, 1024, 512], density: 0.5 },
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
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' })
  if (!renderer.getContext()) throw new Error('no WebGL context')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none'
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  renderer.setClearColor(0x000000, 1)
  renderer.info.autoReset = false

  const scene = new Scene()
  const rig = new CameraRig()
  const noise = noiseTexture()
  U.uNoise.value = noise
  const sky = new Sky()
  const shadows = new SunShadows(scene)
  const post = new Post(renderer)
  const leafTex = leafTexture(), flowerTex = flowerTexture(), puffTex = puffTexture()
  const terrain = buildTerrain()
  const flora = new Flora()
  const clearing = new Clearing(flora)
  const pond = new Pond()
  const grass = new Grass()
  const props = new Props()
  const fields = new Fields(leafTex, flowerTex)
  const harvest = new Harvest()
  const kit = new Kit()
  const crews = new Crews(kit)
  const particles = new Particles(puffTex)
  const weather = new Weather()
  const birds = new Birds()
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
  // What the camera was last asked to frame; the player's own hand on it makes it 'free'.
  let framing: 'title' | 'home' | 'whole' | 'field' | 'free' = 'home'
  let framed = -1
  const dugSince = new Map<number, number>()
  const waiters: Waiter[] = []
  const focus = new Vector3(), ahead = new Vector3(), sunAt = new Vector3()
  const windAt = U.uWindAt.value

  // Hills waiting for a crew to pass: which crew, the segment of its day and the place along its path.
  let pending: PendingReveal[] = []

  // ---- quality
  let tier: Tier = app.settings.quality === 'auto' ? ((navigator.hardwareConcurrency ?? 8) <= 4 ? 'medium' : 'high') : app.settings.quality
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
    post.setSize(Math.max(2, Math.round(vp.w * pr * scale)), Math.max(2, Math.round(vp.h * pr * scale)), { msaa: t.msaa, ao: t.ao, focus: t.focus, bloom: true })
    shadows.setSizes(t.shadow)
    fields.setTier(tier, t.density)
    grass.setTier(tier)
    flora.setTier(tier)
    crews.setScreen(vp.w, vp.h)
    reframe(reduced)
  }

  function poseFor(mode: Mode, vp: Viewport): Pose {
    return mode === 'title' ? rig.titlePose(vp) : rig.home(vp)
  }

  // After the window or the interface's edges change: hold whatever was framed.
  function reframe(still: boolean): void {
    const vp = viewport()
    if (framing === 'free') return
    const to = framing === 'title' ? rig.titlePose(vp) : framing === 'field' && framed >= 0 ? rig.fieldPose(framed, vp) : framing === 'whole' ? rig.whole(vp) : rig.home(vp)
    if (rig.moving()) rig.retarget(to)
    else rig.moveTo(to, still, 500)
  }

  // Home: the home farm, with the other blocks reaching in from the edges. Home again: the whole map.
  function goHome(): void {
    const vp = viewport()
    if (snap.mode === 'title') { framing = 'title'; rig.moveTo(rig.titlePose(vp), reduced); return }
    const again = framing === 'home' && rig.at(rig.home(vp))
    framing = again ? 'whole' : 'home'
    rig.moveTo(again ? rig.whole(vp) : rig.home(vp), reduced)
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
      const vp = viewport()
      if (e.field >= 0 && e.field < FIELD_COUNT) {
        framing = 'field'
        framed = e.field
        rig.moveTo(rig.fieldPose(e.field, vp), reduced)
      } else { framing = 'free'; goHome() }
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
        const to = rig.fieldPose(staged.field, viewport())
        const far = Math.hypot(rig.cur.x - to.x, rig.cur.z - to.z) > FD * 0.8 || rig.cur.dist > to.dist * 1.3
        if (far) { framing = 'field'; framed = staged.field; rig.moveTo(to, false) }
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
        framing = next.mode === 'title' ? 'title' : 'home'
        if (first && next.mode === 'title' && !reduced) {
          // The opening: up from the brook and its mist to the key frame, slowly.
          rig.moveTo(rig.titlePose(viewport(), true), true)
          rig.moveTo(rig.titlePose(viewport()), false, 14000)
        } else rig.moveTo(poseFor(next.mode, viewport()), first || reduced)
      } else crews.sync(next)
      dayT = next.mode === 'title' ? 0 : 1
    }
    for (let i = 0; i < FIELD_COUNT; i++) {
      const st = next.fields[i].status
      if (st === 'dug' && !dugSince.has(i)) dugSince.set(i, next.seasonDay)
      if (st !== 'dug') dugSince.delete(i)
    }
    const barrels = next.fields.map((f, i) => next.mode === 'season' && (f.status === 'digging' || (f.status === 'dug' && next.seasonDay - (dugSince.get(i) ?? next.seasonDay) < 4)))
    harvest.setBarrelFields(barrels, (f, h) => shown[f][h].look.kind === 'dug' && next.fields[f].hills[h].kind === 'dug')
    fields.setTargets(next.fields, shown)
    clearing.set(next.fields)
    pond.set(next.farm)
    const gravelled = next.farm.buildings.find(b => b.kind === 'road')
    terrain.gravel.value = gravelled ? (gravelled.built ? 1 : gravelled.progress) : 0
    envTarget(next, envT)
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
    const a = new Vector3(f.x0, fieldBaseY(f.z0) + 0.25, f.z0), b = new Vector3(f.x1, fieldBaseY(f.z0) + 0.25, f.z0)
    const c = new Vector3(f.x1, fieldBaseY(f.z1) + 0.25, f.z1), d = new Vector3(f.x0, fieldBaseY(f.z1) + 0.25, f.z1)
    return [new Triangle(a, b, c), new Triangle(a, c, d)]
  })
  // A tract under trees is picked by its canopy too: the same quad at the height of the crowns.
  const crowns = quads.map(tris => tris.map(t => new Triangle(t.a.clone().setY(t.a.y + 4.5), t.b.clone().setY(t.b.y + 4.5), t.c.clone().setY(t.c.y + 4.5))))
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
      const t = d.y < -1e-4 ? (groundY(p.x, p.z) - o.y) / d.y : -1
      if (t > 0 && yardAt(o.x + d.x * t, o.z + d.z * t) === yard) return yard
    }
    return 0
  }
  function pickUnit(x: number, y: number): number {
    if (snap.mode === 'title') return -1
    const vp = viewport()
    return crews.pick(x, y, rig.camera, vp.w, vp.h, snap.mode === 'season' || app.unit >= 0)
  }
  const input = attachInput(canvas, app, rig, viewport, pick, pickUnit, goHome, pickYard)

  function applyLight(dt: number): void {
    // The sun's small journey through the day, smoothed so that days running fast do not make the light flicker.
    // The faster the days go by, the less of each the sun shows, or the shadows would sway.
    const through = snap.mode === 'season' && app.speed > 0 ? Math.sin((app.dayProgress - 0.25) * Math.PI * 2) / app.speed : 0
    sunDrift += (through - sunDrift) * (1 - Math.exp(-dt / 1.1))
    light(env, reduced ? 0 : sunDrift, lit)
    U.uSunDir.value.copy(lit.sunDir)
    U.uSunCol.value.copy(lit.sun)
    U.uHazeSun.value.copy(lit.hazeSun)
    U.uHazeAway.value.copy(lit.hazeAway)
    U.uMistCol.value.copy(lit.mist)
    U.uHaze.value.set(env.haze, 0.011)
    // Mist lies in the low ground: on the brook and the bottom land, thinning fast above it; on a fog day it fills the
    // valley to the mid slope and the ridge stands out of it.
    U.uMist.value.set((0.5 - 0.36 * env.mistDeep) * env.mist, 2.6 - 1.5 * env.mistDeep, 0.2 + 1.9 * env.mistDeep, 0.85)
    U.uCloud.value.x = env.cloudShadow
    U.uCloud.value.y = env.cloud
    U.uSnow.value = env.snow
    U.uRime.value.set(env.rime0, env.rime1, env.rime2)
    U.uWet.value = env.wet
    U.uGrass.value.copy(env.grass)
    U.uGold.value = env.gold
    U.uLeaf.value = env.leaf
    U.uDay.value = snap.day
    U.uSunlit.value += ((snap.mode === 'title' ? 150 : 0) - U.uSunlit.value) * Math.min(1, dt * 1.2)
    sky.setAir(lit.air, lit.sunDir, lit.skyCap, lit.skyGain / lit.skyShow)
    sky.tune.set(lit.skyShow, lit.skySat, 0.25)
    sky.deck.copy(lit.deck)
    sky.deckDark.copy(lit.deckDark)
    sky.ground.copy(lit.ground)
    UI_GAIN.value = 1.1 / lit.exposure
    const lamp = snap.mode === 'cellar' ? 0.9 : snap.mode === 'plan' || snap.mode === 'ledger' ? 0.35 : snap.mode === 'title' ? 0.22 : 0
    LAMP.value += (lamp / lit.exposure * 0.6 - LAMP.value) * Math.min(1, dt * 2)
  }
  let sunDrift = 0
  const spent = { crews: 0, update: 0, draw: 0 }
  let replayPace = 1
  let titleShift = 0.16

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
    // Two slow stretches running, and the setting comes down a step; it does not go back up by itself.
    slow = median > 23 ? slow + 1 : 0
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
    if (snap.mode === 'title') dayT = reduced ? 0.36 : (((time / TITLE_LOOP_S + titleShift) % 1) + 1) % 1
    else if (dayT < 1) dayT = Math.min(1, app.speed > 0 ? Math.max(dayT + dt / DAY_ANIM_S * 0.25, app.dayProgress) : dayT + dt / DAY_ANIM_S * replayPace)
    if (crews.stageHold >= 0 && snap.mode === 'season') dayT = Math.min(dayT, crews.stageHold)
    easeEnv(env, envT, 1 - Math.exp(-dt / 1.1))
    applyLight(dt)
    const pace = reduced ? STILL : 1
    const wx = Math.cos(env.windDir), wz = Math.sin(env.windDir)
    U.uTime.value = ambient
    U.uSway.value = reduced ? 0 : env.wind
    U.uWindDir.value.set(wx, wz)
    windAt.x += wx * (0.4 + env.wind) * 2.2 * dt * pace
    windAt.y += wz * (0.4 + env.wind) * 2.2 * dt * pace
    U.uCloud.value.z = windAt.x * 0.0009
    U.uCloud.value.w = windAt.y * 0.0009
    terrain.water.ice.value = env.ice
    for (let i = 0; i < FIELD_COUNT; i++) { terrain.held.value[i] = fields.held[i]; terrain.off.value[i] = fields.off[i]; terrain.avail.value[i] = fields.avail[i] }
    input.frame(dt)
    if (rig.idle < 0.2 && framing !== 'free') framing = 'free'
    rig.update(dt, vp, reduced, snap.mode === 'title' && framing === 'title' && !reduced ? Math.sin(time * 0.05) : 0)
    const cam = rig.camera
    sky.dome.position.copy(cam.position)
    const t0 = performance.now()
    crews.place({
      dt, dayT, advancing: app.speed > 0, pace: replayPace, time, reduced, idle: snap.mode !== 'season' && snap.mode !== 'title',
      season: snap.mode === 'season', dist: rig.cur.dist, dust: env.dry, picked: app.unit, particles, passed,
    })
    // Smoke from the kitchen chimney on cold days.
    smokeAt += dt * pace
    if (env.smoke > 0.2 && smokeAt > 0.16) {
      smokeAt = 0
      particles.emit(props.chimney.x, props.chimney.y, props.chimney.z, (Math.random() - 0.5) * 0.1, 0.5, (Math.random() - 0.5) * 0.1, 0.12, 0.3, 4.5, 0.74, 0.74, 0.76, 0.36 * env.smoke, 0.8)
    }
    const t1 = performance.now()
    particles.update(dt * (reduced ? 0.3 : 1), wx * env.wind * 1.6, wz * env.wind * 1.6)
    focus.set(rig.cur.x, fieldBaseY(rig.cur.z), rig.cur.z)
    weather.update(fall, env.rain, env.snowfall, wx * env.wind, wz * env.wind, cam.getWorldDirection(ahead).multiplyScalar(30).add(cam.position), lit.hazeAway, (size.h * size.pr) / (2 * Math.tan((cam.fov * Math.PI) / 360)))
    birds.update(ambient, Math.max(env.rain, env.snowfall), lit.hazeAway)
    shadows.update(lit.sunDir, lit.sun, focus, rig.focus(), dtMs <= 0.5)
    fields.setFarShadows(!shadows.holdsFarm)
    MARK_WIDE.value = clamp(rig.cur.dist / 42, 1, 4.5)
    fields.update(dt, cam, { selection: app.selection, hover: app.hover, oats: env.oats, oatsRipe: env.oatsRipe, reduced })
    grass.update(cam, fields.off)
    flora.update(cam)
    harvest.update(dt, app.speed === 0, clamp(rig.cur.dist / 30, 1, 2.3), reduced)
    PIXEL.value = (TIERS[tier].msaa ? 1.7 : 1.4) / ((post.target.height) / (2 * Math.tan((cam.fov * Math.PI) / 360)))
    // The focus is shallow in the opening shot, slight in play, and opens up while the player moves the camera.
    const want = env.lens * (rig.idle < 0.6 ? 0.2 : 1) * (snap.mode === 'title' ? 1 : smooth(60, 16, rig.cur.dist) * 0.9 + 0.5)
    lens += (want - lens) * (1 - Math.exp(-dt / 0.35))
    const t2 = performance.now()
    renderer.info.reset()
    if (frameNo % 2 === 0 || frameNo < 4 || dtMs <= 0.5) sky.renderMap(renderer)
    // The opening shot is focused on the bottom fields, half way to what it looks at.
    const sharp = rig.focus() * (snap.mode === 'title' && framing === 'title' ? 0.5 : 1)
    // Where the sun stands on the picture, and how much of its light the air shows: most when it is low, the air is
    // hazy or misty, the sky is open, and the camera looks its way.
    sunAt.copy(lit.sunDir).multiplyScalar(4000).add(cam.position).project(cam)
    const facing = cam.getWorldDirection(ahead).dot(lit.sunDir)
    const low = smooth(0.75, 0.12, lit.sunDir.y)
    const open = clamp(1 - env.cloud, 0, 1) * (1 - Math.max(env.rain, env.snowfall))
    const thick = clamp(0.35 + env.haze * 380 + 0.5 * env.mist, 0, 1.3)
    const shafts = (reduced ? 0.6 : 1) * 0.5 * low * open * thick * smooth(-0.15, 0.55, facing)
    // The grade follows the light: warm and rich under a low open sun, plainer under cloud, cool on snow.
    const gold = low * open
    const cold = clamp(env.snow, 0, 1)
    post.render(scene, cam, {
      exposure: lit.exposure, focus: sharp, aperture: 0.3 * lens, time, grain: 0.018,
      sunX: sunAt.x * 0.5 + 0.5, sunY: sunAt.y * 0.5 + 0.5, shafts: sunAt.z < 1 ? shafts : 0,
      warm: 0.22 + 0.5 * gold - 0.3 * cold, rich: 0.1 + 0.14 * gold, contrast: 0.09 + 0.08 * open,
    }, Math.round(size.w * size.pr), Math.round(size.h * size.pr))
    const t3 = performance.now()
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
      anchor.y = fieldBaseY(anchor.z) + 0.35
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
    const u = crews.where().units.find(x => x.id === id)
    return u ? screenAt(u.x, groundY(u.x, u.z) + 1.9, u.z) : { x: 0, y: 0, visible: false }
  }

  function yardAnchor(yard: number): { x: number; y: number; visible: boolean } {
    const p = YARD_AT[yard]
    return p ? screenAt(p.x, groundY(p.x, p.z) + 6.5, p.z) : { x: 0, y: 0, visible: false }
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
    crews: crews.group, particles: particles.mesh, weather: weather.group, birds: birds.mesh, sky: sky.dome,
  }

  rebuild()
  resize()
  const ready = (async () => {
    try {
      renderer.setRenderTarget(post.target)
      await renderer.compileAsync(scene, rig.camera)
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
        copyEnv(env, envT)
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
        titleShift = dayT - time / TITLE_LOOP_S
      },
      info() {
        const w = crews.where()
        return {
          mode: snap.mode, dayT, pending: pending.length, segs: crews.segsInfo(), tractor: w.tractor, farmer: w.farmer, units: w.units,
          fields: snap.fields.map(f => f.status), held: snap.fields.map(f => f.held), tier, framing, rings: fields.ringing(), lods: fields.lods(),
        }
      },
      whenShown,
      // For working on the look: put the camera somewhere.
      view(p: Partial<Pose>) {
        framing = 'free'
        rig.moveTo({ ...rig.goal, ...p }, true)
      },
      home() { goHome() },
      // Where a crew is on the screen, for clicking it in checks.
      unitAt(id: number) {
        const u = crews.where().units.find(x => x.id === id)
        if (!u) return null
        const v = new Vector3(u.x, fieldBaseY(u.z) + 0.5, u.z).project(rig.camera)
        const vp = viewport()
        return { x: (v.x + 1) / 2 * vp.w, y: (1 - v.y) / 2 * vp.h }
      },
      // What a click at a point on the screen would pick.
      pickAt: (x: number, y: number) => ({ field: pick(x, y), unit: pickUnit(x, y), yard: pickYard(x, y), mode: snap.mode, held: snap.fields.map(f => f.held), available: snap.fields.map(f => f.available) }),
      parts: () => Object.keys(parts),
      show(name: string, on: boolean) { if (parts[name]) parts[name].visible = on },
      shadowsOn(on: boolean) { for (const l of shadows.lights) l.castShadow = on },
      env, lit, rig,
      // What the last frame drew, where the camera stood, and the clocks.
      stats() {
        const r = renderer.info.render
        return {
          triangles: r.triangles, calls: r.calls, pixelRatio: renderer.getPixelRatio(), width: canvas.width, height: canvas.height,
          camera: rig.where(), time, ambient, fall, exposure: lit.exposure, tier, fps, drawn: [post.target.width, post.target.height], firstFrame,
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
      kit.dispose()
      particles.dispose()
      weather.dispose()
      birds.dispose()
      sky.dispose()
      shadows.dispose()
      post.dispose()
      for (const t of [noise, leafTex, flowerTex, puffTex]) t.dispose()
      renderer.dispose()
    },
  }
}
