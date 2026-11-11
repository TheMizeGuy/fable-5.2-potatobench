// The field view: the farm in its country, drawn with three.js, played like a strategy map.
// Falls back to a flat drawing without WebGL.
import { PCFShadowMap, Raycaster, Scene, Triangle, Vector2, Vector3, WebGLRenderer } from 'three'
import type { App } from '../game/app.ts'
import type { CreateFieldView, FieldView } from '../game/contracts.ts'
import { FIELD_COUNT, HILLS } from '../sim/index.ts'
import { CameraRig, type Pose, type Viewport } from './camera.ts'
import { Farmer, Kit, Tractor, implementFor, stoop, stride } from './crew.ts'
import { copyEnv, easeEnv, envTarget, light, makeEnv, makeLight } from './env.ts'
import { createFallbackView } from './fallback.ts'
import { Fields, PIXEL, UI_GAIN, type HillDisplay } from './fields.ts'
import { Flora } from './flora.ts'
import { Grass } from './grass.ts'
import { Harvest } from './harvest.ts'
import { attachInput } from './input.ts'
import { FD, FIELDS, FW, ROAD, SHED_SPOT, fieldBaseY } from './layout.ts'
import { clamp, smooth } from './noise.ts'
import { Particles } from './particles.ts'
import { Post } from './post.ts'
import { LAMP, Props } from './props.ts'
import { U } from './shaders.ts'
import { SunShadows } from './shadows.ts'
import { Sky } from './sky.ts'
import { snapshot, type Mode, type Snapshot } from './state.ts'
import { buildTerrain } from './terrain.ts'
import { flowerTexture, leafTexture, noiseTexture, puffTexture, roadTexture, sprayTexture } from './textures.ts'
import { Birds } from './birds.ts'
import { Weather } from './weather.ts'
import { Poly, heightAt, parkSpot, planDay, type Pt, type Reveal, type Seg } from './work.ts'

const DAY_ANIM_S = 3.4          // how long a paused day's work takes to play out
const TITLE_LOOP_S = 44
const LOST_MS = 3000            // how long a lost WebGL context may stay away before the farm is drawn flat
const STILL = 0.02              // the pace of water, cloud, mist and smoke under reduced motion
const SHOWN_CAP_S = 2.5         // the longest whenShown() keeps the interface waiting
const SAMPLE_DRIVE_S = 0.5      // a test dig keeps its own time: the drive to the field, then the walk in and the lift
const SAMPLE_S = 2

type Tier = 'high' | 'medium' | 'low'
// What each setting keeps. Going down: the shallow focus and the contact shade go first, then shadow detail, then
// the size the scene is drawn at and the number of plants.
const TIERS: Record<Tier, { scale: number; pixels: number; msaa: number; ao: boolean; focus: boolean; shadow: [number, number, number]; density: number }> = {
  high: { scale: 1, pixels: 3.7e6, msaa: 4, ao: true, focus: true, shadow: [4096, 2048, 2048], density: 1 },
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
  const roadTex = roadTexture(), leafTex = leafTexture(), flowerTex = flowerTexture(), sprayTex = sprayTexture(), puffTex = puffTexture()
  const terrain = buildTerrain(roadTex)
  const flora = new Flora(sprayTex)
  const grass = new Grass()
  const props = new Props()
  const fields = new Fields(leafTex, flowerTex)
  const harvest = new Harvest()
  const kit = new Kit()
  const tractor = new Tractor(kit)
  const farmer = new Farmer(kit)
  const particles = new Particles(puffTex)
  const weather = new Weather()
  const birds = new Birds()
  scene.add(sky.dome, terrain.group, flora.group, grass.mesh, props.group, fields.group, harvest.group, tractor.group, farmer.group, particles.mesh, weather.group, birds.mesh)

  const env = makeEnv(), envT = makeEnv(), lit = makeLight()
  let snap: Snapshot = snapshot(app)
  let shown: HillDisplay[][] = snap.fields.map(f => f.hills.map(look => ({ look, ridge: f.ridge })))
  let segs: Seg[] = []
  let dayT = 1
  let dirty = true, dayPassed = false, first = true
  const samples = new Map<number, SampleInfo>()
  let tractorAt: Pt = { x: SHED_SPOT.x, z: SHED_SPOT.z }
  let heading = SHED_SPOT.heading
  let travelled = 0
  let time = 0
  // Clocks for water, cloud, mist and smoke (`ambient`) and for rain and snow (`fall`): under reduced motion the first
  // nearly stops and the second stops. The farmer's work keeps `time`.
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
  let framing: 'title' | 'home' | 'field' | 'free' = 'home'
  let framed = -1
  const dugSince = new Map<number, number>()
  const waiters: Waiter[] = []
  const focus = new Vector3(), ahead = new Vector3()
  const windAt = U.uWindAt.value

  // Hills waiting for the tractor or walker to pass: the segment of the day and the place along its path.
  let pending: (Reveal & { seg: number })[] = []

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
    fields.setDensity(t.density)
    reframe(reduced)
  }

  function poseFor(mode: Mode, vp: Viewport): Pose {
    return mode === 'title' ? rig.titlePose(vp) : rig.home(vp)
  }

  // After the window or the interface's edges change: hold whatever was framed.
  function reframe(still: boolean): void {
    const vp = viewport()
    if (framing === 'free') return
    const to = framing === 'title' ? rig.titlePose(vp) : framing === 'field' && framed >= 0 ? rig.fieldPose(framed, vp) : rig.home(vp)
    if (rig.moving()) rig.retarget(to)
    else rig.moveTo(to, still, 500)
  }

  function goHome(): void {
    framing = snap.mode === 'title' ? 'title' : 'home'
    rig.moveTo(poseFor(snap.mode, viewport()), reduced)
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
      } else goHome()
    } else if (e.type === 'insets') reframe(reduced)
  })

  // The title screen: the tractor comes out of the potato house and down the farm road, over the bridge and away.
  function titleSeg(): Seg {
    const travel: Pt[] = [{ x: 23.4, z: -15.6 }, ...ROAD.map(([x, z]) => ({ x, z }))]
    return { kind: 'travel', field: -1, walker: false, travel, path: [travel[travel.length - 1]], reveals: [], start: 0, end: 0.8 }
  }

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
      const seg = segs.find(sg => sg.field === r.field && sg.kind === 'dig')
      const along = seg ? new Poly(seg.path).at(r.at) : { dx: -1, dz: 0 }
      harvest.dig(r.field, r.hill, { variety: fv.variety, gramsPerHill: fv.grams, dark: fv.dark, green: fv.green }, along)
    }
  }
  // The day's test digs, kept after the snapshot is rebuilt so the reveal can lay out the hill's own tubers.
  const lastSample = new Map<number, SampleInfo>()

  function flush(animate: boolean): void {
    for (const r of pending) reveal(r, animate && pending.length < 200)
    pending = []
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
      segs = planDay(next, shown, tractorAt, new Map([...samples].map(([f, s]) => [f, s.hill])))
      pending = []
      segs.forEach((s, k) => { for (const r of s.reveals) pending.push({ ...r, seg: k }) })
      const wait = new Set(pending.map(r => r.field * HILLS + r.hill))
      shown = next.fields.map((f, i) => f.hills.map((_, h) => (wait.has(i * HILLS + h) ? shown[i][h] : display(i, h, next))))
      dayT = 0
      clockSeg = -2
      sampleHold = -1
      // A key moment about to play where the player is not looking: bring the field into frame, unless their hand is on the camera.
      const staged = segs.find(s => s.kind === 'sample' || (s.kind === 'dig' && prev.fields[s.field].status !== 'digging'))
      if (staged && !reduced && app.speed < 3 && rig.idle > 2.5) {
        const to = rig.fieldPose(staged.field, viewport())
        const far = Math.hypot(rig.cur.x - to.x, rig.cur.z - to.z) > FD * 0.8 || rig.cur.dist > to.dist * 1.3
        if (far) { framing = 'field'; framed = staged.field; rig.moveTo(to, false) }
      }
    } else if (sameDay) {
      // A command in the middle of the day: keep the day playing, refresh everything not waiting to be revealed.
      const wait = new Set(pending.map(r => r.field * HILLS + r.hill))
      shown = next.fields.map((f, i) => f.hills.map((_, h) => (wait.has(i * HILLS + h) ? shown[i][h] : display(i, h, next))))
    } else {
      flush(false)
      shown = next.fields.map((f, i) => f.hills.map((_, h) => display(i, h, next)))
      segs = next.mode === 'title' ? [titleSeg()] : []
      if (first || prev.mode !== next.mode) {
        if (next.mode !== 'title') {
          const p = next.mode === 'season' && next.next ? parkSpot(next.next.field) : { x: SHED_SPOT.x, z: SHED_SPOT.z }
          tractorAt = p
          heading = next.mode === 'season' && next.next ? Math.PI : SHED_SPOT.heading
        }
        particles.clear()
        // A change of screen is a move of the camera, not a cut.
        framing = next.mode === 'title' ? 'title' : 'home'
        if (first && next.mode === 'title' && !reduced) {
          // The opening: up from the brook and its mist to the key frame, slowly.
          rig.moveTo(rig.titlePose(viewport(), true), true)
          rig.moveTo(rig.titlePose(viewport()), false, 14000)
        } else rig.moveTo(poseFor(next.mode, viewport()), first || reduced)
      }
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

  // Where the tractor and walker are at this point of the day, and which pending hills they have passed.
  function placeWorkers(dt: number): void {
    let segIdx = -1
    for (let k = 0; k < segs.length; k++) if (dayT >= segs[k].start) segIdx = k
    const seg: Seg | null = segIdx >= 0 ? segs[segIdx] : null
    if (segIdx !== clockSeg) { clockSeg = segIdx; segClock = 0 } else segClock += dt * (app.speed > 0 ? 1 : replayPace)
    sampleHold = -1
    const passedUpTo = (arc: number) => {
      if (!pending.length) return
      const keep: typeof pending = []
      for (const r of pending) {
        if (r.seg < segIdx || (r.seg === segIdx && r.at <= arc)) reveal(r, true)
        else keep.push(r)
      }
      pending = keep
    }
    let pos: Pt = tractorAt, dir = { dx: Math.cos(heading), dz: Math.sin(heading) }
    let working = 0
    let walkerOn = false
    let walkPos: Pt = pos, walkDir = dir
    let kind: Seg['kind'] = 'travel'
    let bent = 0, walking = 0
    if (seg) {
      kind = seg.kind
      const span = Math.max(1e-6, seg.end - seg.start)
      let u = Math.min(1, (dayT - seg.start) / span)
      const travel = new Poly(seg.travel)
      let tShare = seg.kind === 'travel' ? 1 : travel.length > 0.3 ? Math.min(0.4, 0.12 + travel.length / 150) : 0
      if (seg.kind === 'sample') {
        // However long the day is, the hill is up inside two and a half seconds, and the day waits for it.
        const drive = travel.length > 0.3 ? SAMPLE_DRIVE_S : 0
        u = Math.min(1, segClock / (drive + SAMPLE_S))
        tShare = drive / (drive + SAMPLE_S)
        if (u < 0.92 && snap.mode === 'season') sampleHold = seg.end - 1e-3
      }
      const path = new Poly(seg.path)
      if (u < tShare || seg.kind === 'travel') {
        // ease in and out of a trip
        const s = seg.kind === 'travel' ? u : u / tShare
        const p = travel.at((s * s * (3 - 2 * s)) * travel.length)
        pos = p
        dir = p
        passedUpTo(-1)
      } else {
        const w = (u - tShare) / (1 - tShare)
        if (!seg.walker) {
          // Dig day is staged: the digger is lowered at the row's end, the rows come out, and the tractor stands at the finish.
          const lead = seg.kind === 'dig' ? 0.05 : 0, tail = seg.kind === 'dig' ? 0.08 : 0
          const run = clamp((w - lead) / (1 - lead - tail), 0, 1)
          const p = path.at(run * path.length)
          pos = p
          dir = p
          working = run > 0 && run < 1 ? 1 : 0
          passedUpTo(run >= 1 ? Infinity : run * path.length)
        } else {
          const end = travel.at(travel.length)
          pos = end
          dir = travel.length > 0.01 ? end : dir
          if (seg.kind === 'sample') {
            // The test dig is staged: the walk in, the fork set and the hill lifted, then a moment to look.
            const walk = Math.min(1, w / 0.5)
            const p = path.at(walk * path.length)
            walkPos = p
            walkDir = walk < 1 ? p : { dx: 0, dz: -1 }
            walking = walk < 1 ? 1 : 0
            bent = smooth(0.5, 0.62, w) * (1 - 0.6 * smooth(0.66, 0.8, w))
            passedUpTo(w >= 0.64 ? Infinity : -1)
            walkerOn = true
          } else {
            const p = path.at(w * path.length)
            walkPos = p
            walkDir = p
            walkerOn = w < 1
            walking = 1
            passedUpTo(w * path.length)
          }
        }
      }
      tractor.setImplement(seg.kind === 'travel' ? tractor.current : implementFor(seg.kind))
    } else if (snap.mode !== 'season') {
      tractor.setImplement('none')
    }
    // A jump (the title's loop starting again) is not a drive.
    const step = Math.hypot(pos.x - tractorAt.x, pos.z - tractorAt.z)
    const moved = step > 3 ? 0 : step
    travelled += moved
    let turn = 0
    if (moved > 1e-4 || seg) {
      const target = Math.atan2(dir.dz, dir.dx)
      let d = target - heading
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      turn = clamp(d * 1.5, -1, 1)
      heading += step > 3 ? d : moved > 1e-4 ? d * Math.min(1, dt * 7 + moved * 2) : 0
    }
    tractorAt = { x: pos.x, z: pos.z }
    const y = heightAt(pos.x, pos.z)
    const ahead = heightAt(pos.x + Math.cos(heading) * 0.6, pos.z + Math.sin(heading) * 0.6)
    const behind = heightAt(pos.x - Math.cos(heading) * 0.6, pos.z - Math.sin(heading) * 0.6)
    tractor.group.position.set(pos.x, y + 0.01, pos.z)
    tractor.group.rotation.set(0, -heading, Math.atan2(ahead - behind, 1.2), 'YXZ')
    tractor.driver.visible = !walkerOn
    farmer.group.visible = walkerOn
    if (walkerOn) {
      farmer.group.position.set(walkPos.x, heightAt(walkPos.x, walkPos.z) + 0.02, walkPos.z)
      farmer.group.rotation.y = -Math.atan2(walkDir.dz, walkDir.dx)
      stride(farmer.figure, time * 9, walking)
      stoop(farmer.figure, bent)
      farmer.fork.visible = kind === 'sample' || kind === 'rogue'
    }
    // Units carry a ring on the ground when seen from far off.
    const far = smooth(34, 70, rig.cur.dist) * (snap.mode === 'season' ? 0.75 : 0)
    ;(tractor.ring.material as unknown as { uniforms: { uLevel: { value: number } } }).uniforms.uLevel.value = far * (seg && seg.kind !== 'travel' && !seg.walker ? 1 : 0.5)
    ;(farmer.ring.material as unknown as { uniforms: { uLevel: { value: number } } }).uniforms.uLevel.value = far
    tractor.ring.rotation.z = 0
    const idle = snap.mode !== 'season' && snap.mode !== 'title'
    tractor.animate(dt, travelled, moved, turn, working, kind, env.dry, particles, reduced || idle)
  }

  // ---- picking
  const ray = new Raycaster()
  const ndc = new Vector2(), hit = new Vector3()
  const quads = FIELDS.map(f => {
    const a = new Vector3(f.x0, fieldBaseY(f.z0) + 0.25, f.z0), b = new Vector3(f.x1, fieldBaseY(f.z0) + 0.25, f.z0)
    const c = new Vector3(f.x1, fieldBaseY(f.z1) + 0.25, f.z1), d = new Vector3(f.x0, fieldBaseY(f.z1) + 0.25, f.z1)
    return [new Triangle(a, b, c), new Triangle(a, c, d)]
  })
  function pick(x: number, y: number): number {
    const vp = viewport()
    ray.setFromCamera(ndc.set((x / vp.w) * 2 - 1, -(y / vp.h) * 2 + 1), rig.camera)
    let best = -1, bd = Infinity
    quads.forEach((tris, i) => {
      for (const t of tris) {
        if (ray.ray.intersectTriangle(t.a, t.b, t.c, false, hit)) {
          const d = hit.distanceToSquared(ray.ray.origin)
          if (d < bd) { bd = d; best = i }
        }
      }
    })
    return best
  }
  const input = attachInput(canvas, app, rig, viewport, pick, goHome)

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
    U.uMist.value.set((0.5 - 0.36 * env.mistDeep) * env.mist, 2.4 - 1.85 * env.mistDeep, 0.2, 0.85)
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
  let replayPace = 1
  let clockSeg = -2, segClock = 0, sampleHold = -1
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
    if (sampleHold >= 0 && snap.mode === 'season') dayT = Math.min(dayT, sampleHold)
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
    input.frame(dt)
    if (rig.idle < 0.2 && framing !== 'free') framing = 'free'
    rig.update(dt, vp, reduced, snap.mode === 'title' && framing === 'title' && !reduced ? Math.sin(time * 0.05) : 0)
    const cam = rig.camera
    sky.dome.position.copy(cam.position)
    placeWorkers(dt)
    // Smoke from the kitchen chimney on cold days.
    smokeAt += dt * pace
    if (env.smoke > 0.2 && smokeAt > 0.16) {
      smokeAt = 0
      particles.emit(props.chimney.x, props.chimney.y, props.chimney.z, (Math.random() - 0.5) * 0.1, 0.5, (Math.random() - 0.5) * 0.1, 0.12, 0.3, 4.5, 0.74, 0.74, 0.76, 0.36 * env.smoke, 0.8)
    }
    particles.update(dt * (reduced ? 0.3 : 1), wx * env.wind * 1.6, wz * env.wind * 1.6)
    focus.set(rig.cur.x, fieldBaseY(rig.cur.z), rig.cur.z)
    weather.update(fall, env.rain, env.snowfall, wx * env.wind, wz * env.wind, cam.getWorldDirection(ahead).multiplyScalar(30).add(cam.position), lit.hazeAway, (size.h * size.pr) / (2 * Math.tan((cam.fov * Math.PI) / 360)))
    birds.update(ambient, Math.max(env.rain, env.snowfall), lit.hazeAway)
    shadows.update(lit.sunDir, lit.sun, focus, rig.focus(), dtMs <= 0.5)
    fields.setFarShadows(!shadows.holdsFarm)
    fields.update(dt, { selection: app.selection, hover: app.hover, oats: env.oats, oatsRipe: env.oatsRipe, reduced })
    harvest.update(dt, app.speed === 0, clamp(rig.cur.dist / 30, 1, 2.3), reduced)
    PIXEL.value = (TIERS[tier].msaa ? 1.7 : 1.4) / ((post.target.height) / (2 * Math.tan((cam.fov * Math.PI) / 360)))
    // The focus is shallow in the opening shot, slight in play, and opens up while the player moves the camera.
    const want = env.lens * (rig.idle < 0.6 ? 0.2 : 1) * (snap.mode === 'title' ? 1 : smooth(60, 16, rig.cur.dist) * 0.9 + 0.5)
    lens += (want - lens) * (1 - Math.exp(-dt / 0.35))
    renderer.info.reset()
    if (frameNo % 2 === 0 || frameNo < 4 || dtMs <= 0.5) sky.renderMap(renderer)
    // The opening shot is focused on the bottom fields, half way to what it looks at.
    const sharp = rig.focus() * (snap.mode === 'title' && framing === 'title' ? 0.5 : 1)
    post.render(scene, cam, { exposure: lit.exposure, focus: sharp, aperture: 0.3 * lens, time, grain: 0.018 }, Math.round(size.w * size.pr), Math.round(size.h * size.pr))
    if (!firstFrame) firstFrame = performance.now()
    // Tell whoever is waiting that the land has shown what it had to show.
    for (let k = waiters.length - 1; k >= 0; k--) {
      const w = waiters[k]
      const has = pending.some(r => r.field === w.field && r.tubers === w.kind)
      if (has) w.seen = true
      let done = time >= w.until || reduced || app.speed >= 3
      if (!has && frameNo > w.born) {
        if (!w.seen) done = true
        else if (w.settle === 0) w.settle = time + (w.kind === 'sample' ? 0.45 : 0.7)
        else if (time >= w.settle) done = true
      }
      if (done) { waiters.splice(k, 1); w.resolve() }
    }
  }

  const onLost = (e: Event) => { e.preventDefault(); lost = true; lostFor = 0 }
  const onRestored = () => { lost = false; dirty = true }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  // Where a field's plate hangs: over the edge of the field that is furthest up the screen, whichever way the camera is turned.
  const anchor = new Vector3()
  function fieldAnchor(i: number): { x: number; y: number; visible: boolean } {
    const f = FIELDS[i]
    if (!f) return { x: 0, y: 0, visible: false }
    const yaw = rig.cur.yaw
    const dx = Math.sin(yaw), dz = -Math.cos(yaw)
    const reach = Math.abs(dx) * FW / 2 + Math.abs(dz) * FD / 2
    const z = f.cz + dz * reach
    anchor.set(f.cx + dx * reach, fieldBaseY(clamp(z, f.z0, f.z1)) + 0.55, z).project(rig.camera)
    const vp = viewport()
    const x = (anchor.x + 1) / 2 * vp.w, y = (1 - anchor.y) / 2 * vp.h
    return { x, y, visible: anchor.z < 1 && x >= 0 && x <= vp.w && y >= 0 && y <= vp.h }
  }

  // Settles when the land has shown the test dig's hill lifted, or the last row of the day's digging come out.
  function whenShown(kind: 'sample' | 'dig', field: number): Promise<void> {
    return new Promise(resolve => {
      waiters.push({ kind, field, resolve, born: frameNo, until: time + SHOWN_CAP_S, seen: false, settle: 0 })
    })
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
        sampleHold = -1
        segClock = 1e6
        copyEnv(env, envT)
        fields.snap(env.oats)
        harvest.snap()
        rig.snap(viewport())
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
        return { mode: snap.mode, dayT, pending: pending.length, segs: segs.map(s => `${s.kind}@${s.field}`), tractor: tractorAt, farmer: farmer.group.visible ? { x: farmer.group.position.x, z: farmer.group.position.z, turn: farmer.group.rotation.y } : null, fields: snap.fields.map(f => f.status), tier, framing, rings: fields.ringing() }
      },
      whenShown,
      // For working on the look: put the camera somewhere.
      view(p: Partial<Pose>) {
        framing = 'free'
        rig.moveTo({ ...rig.goal, ...p }, true)
      },
      env, lit, rig,
      // What the last frame drew, where the camera stood, and the clocks.
      stats() {
        const r = renderer.info.render
        return {
          triangles: r.triangles, calls: r.calls, pixelRatio: renderer.getPixelRatio(), width: canvas.width, height: canvas.height,
          camera: rig.where(), time, ambient, fall, exposure: lit.exposure, tier, fps, drawn: [post.target.width, post.target.height], firstFrame,
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
    dispose() {
      off()
      input.dispose()
      for (const w of waiters) w.resolve()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      terrain.dispose()
      flora.dispose()
      grass.dispose()
      props.dispose()
      fields.dispose()
      harvest.dispose()
      kit.dispose()
      particles.dispose()
      weather.dispose()
      birds.dispose()
      sky.dispose()
      shadows.dispose()
      post.dispose()
      for (const t of [noise, roadTex, leafTex, flowerTex, sprayTex, puffTex]) t.dispose()
      renderer.dispose()
    },
  }
}
