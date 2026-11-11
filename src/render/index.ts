// The field view: the farm as a cut-out block of Aroostook land, drawn with three.js. Falls back to a flat drawing without WebGL.
import {
  Box3, NeutralToneMapping, PCFShadowMap, Ray, Raycaster, SRGBColorSpace, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three'
import type { App } from '../game/app.ts'
import type { CreateFieldView, FieldView } from '../game/contracts.ts'
import { FIELD_COUNT, HILLS } from '../sim/index.ts'
import { CameraRig, type Viewport } from './camera.ts'
import { copyEnv, easeEnv, envTarget, makeEnv } from './env.ts'
import { createFallbackView } from './fallback.ts'
import { Fields, bloomTint, type HillDisplay } from './fields.ts'
import { Harvest } from './harvest.ts'
import { FIELDS, SHED_SPOT, fieldBaseY } from './layout.ts'
import { Props } from './props.ts'
import { U } from './shaders.ts'
import { snapshot, type Snapshot } from './state.ts'
import { buildTerrain } from './terrain.ts'
import { puffTexture } from './textures.ts'
import { Tractor, figure, implementFor, stride } from './tractor.ts'
import { Weather } from './weather.ts'
import { Poly, heightAt, parkSpot, planDay, serpentine, type Pt, type Reveal, type Seg } from './work.ts'

const DAY_ANIM_S = 3.4          // how long a paused day's work takes to play out
const TITLE_LOOP_S = 46
const LOST_MS = 3000            // how long a lost WebGL context may stay away before the farm is drawn flat
const STILL = 0.02              // the pace of water, cloud, mist and smoke under reduced motion

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
    }
  }
  try {
    inner = createWebGLView(canvas, app, () => {
      console.warn('The County: the 3D view was lost and did not come back, drawing the farm flat.')
      inner.dispose()
      flat()
    })
  } catch (err) {
    console.warn('The County: WebGL is not available, drawing the farm flat.', err)
    flat()
  }
  return {
    ready: Promise.resolve(),
    quality: () => inner.quality(),
    resize: () => inner.resize(),
    frame: dt => inner.frame(dt),
    fieldAnchor: i => inner.fieldAnchor(i),
    dispose: () => inner.dispose(),
  }
}

interface SampleInfo { hill: number; weights: number[]; marks: number[] }

function createWebGLView(canvas: HTMLCanvasElement, app: App, giveUp: () => void): FieldView {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  if (!renderer.getContext()) throw new Error('no WebGL context')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none'
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  renderer.toneMapping = NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0xe9eee6, 1)

  const scene = new Scene()
  const rig = new CameraRig()
  const weather = new Weather(scene)
  const terrain = buildTerrain()
  const props = new Props()
  const fields = new Fields()
  const harvest = new Harvest()
  const puff = puffTexture()
  const tractor = new Tractor(puff)
  tractor.group.scale.setScalar(1.25)
  const walker = figure(tractor, '#56604a', '#b9492e')
  const fork = tractor.box(0.02, 0.5, 0.02, tractor.mat('#6b5a45'), 0.12, 0.3, 0.08, walker)
  fork.rotation.z = -0.4
  walker.scale.setScalar(1.3)
  scene.add(terrain.group, props.group, fields.group, harvest.group, tractor.group, walker)

  const env = makeEnv(), envT = makeEnv()
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
  let hovered = -1
  let reduced = app.settings.reducedMotion
  const dugSince = new Map<number, number>()
  let tints = snap.fields.map(f => bloomTint(f.variety))

  // Hills waiting for the tractor or walker to pass: the segment of the day and the place along its path.
  let pending: (Reveal & { seg: number })[] = []

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
    } else if (e.type === 'settings') reduced = app.settings.reducedMotion
  })

  // The title screen: spraying the middle field, round and round.
  function titleSeg(): Seg {
    const f = FIELDS[2]
    const path = serpentine(2, [0, 1, 2, 3, 4, 5, 6, 7])
    path.push({ x: f.x1 + 0.9, z: f.z1 - 0.4 }, { x: f.x1 + 0.9, z: f.z0 + 0.3 }, path[0])
    return { kind: 'spray', field: 2, walker: false, travel: [path[0]], path, reveals: [], start: 0, end: 1 }
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
      const s = samples.get(r.field)
      harvest.sample(r.field, r.hill, s && s.hill === r.hill ? s.weights : [], s && s.hill === r.hill ? s.marks : [], fv.variety)
    } else if (r.tubers === 'dig') {
      const seg = segs.find(sg => sg.field === r.field && sg.kind === 'dig')
      const along = seg ? new Poly(seg.path).at(r.at) : { dx: -1, dz: 0 }
      harvest.dig(r.field, r.hill, { variety: fv.variety, gramsPerHill: fv.grams, dark: fv.dark, green: fv.green }, along)
    }
  }

  function flush(animate: boolean): void {
    for (const r of pending) reveal(r, animate && pending.length < 200)
    pending = []
  }

  function rebuild(): void {
    const next = snapshot(app)
    const prev = snap
    const sameSeason = dayPassed && !first && prev.mode === 'season' && next.mode === 'season' && prev.year === next.year
    if (sameSeason) flush(app.speed < 3)
    snap = next
    tints = snap.fields.map(f => bloomTint(f.variety))
    if (next.mode !== 'season') {
      harvest.clear()
      dugSince.clear()
    }
    const sameDay = !dayPassed && !first && prev.mode === next.mode && prev.year === next.year && prev.seasonDay === next.seasonDay
    if (sameSeason) {
      segs = planDay(next, shown, tractorAt, new Map([...samples].map(([f, s]) => [f, s.hill])))
      pending = []
      segs.forEach((s, k) => { for (const r of s.reveals) pending.push({ ...r, seg: k }) })
      const wait = new Set(pending.map(r => r.field * HILLS + r.hill))
      shown = next.fields.map((f, i) => f.hills.map((_, h) => (wait.has(i * HILLS + h) ? shown[i][h] : display(i, h, next))))
      dayT = 0
    } else if (sameDay) {
      // A command in the middle of the day: keep the day playing, refresh everything not waiting to be revealed.
      const wait = new Set(pending.map(r => r.field * HILLS + r.hill))
      shown = next.fields.map((f, i) => f.hills.map((_, h) => (wait.has(i * HILLS + h) ? shown[i][h] : display(i, h, next))))
    } else {
      flush(false)
      shown = next.fields.map((f, i) => f.hills.map((_, h) => display(i, h, next)))
      segs = next.mode === 'title' ? [titleSeg()] : []
      if (next.mode !== 'title' && (first || prev.mode !== next.mode)) {
        const p = next.mode === 'season' && next.next ? parkSpot(next.next.field) : { x: SHED_SPOT.x, z: SHED_SPOT.z }
        tractorAt = p
        heading = next.mode === 'season' && next.next ? Math.PI : SHED_SPOT.heading
      }
      dayT = next.mode === 'title' ? 0 : 1
    }
    for (let i = 0; i < FIELD_COUNT; i++) {
      const st = next.fields[i].status
      if (st === 'dug' && !dugSince.has(i)) dugSince.set(i, next.seasonDay)
      if (st !== 'dug') dugSince.delete(i)
    }
    const barrels = next.fields.map((f, i) => next.mode === 'season' && (f.status === 'digging' || (f.status === 'dug' && next.seasonDay - (dugSince.get(i) ?? next.seasonDay) < 3)))
    harvest.setBarrelFields(barrels, (f, h) => shown[f][h].look.kind === 'dug' && next.fields[f].hills[h].kind === 'dug')
    fields.setTargets(next.fields, shown)
    envTarget(next, envT)
    samples.clear()
    dayPassed = false
    dirty = false
    if (first) {
      first = false
      copyEnv(env, envT)
      fields.snap(tints)
      harvest.snap()
    }
  }

  // Where the tractor and walker are at this point of the day, and which pending hills they have passed.
  function placeWorkers(dt: number): void {
    let segIdx = -1
    for (let k = 0; k < segs.length; k++) if (dayT >= segs[k].start) segIdx = k
    const seg: Seg | null = segIdx >= 0 ? segs[segIdx] : null
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
    if (seg) {
      kind = seg.kind
      const span = Math.max(1e-6, seg.end - seg.start)
      const u = Math.min(1, (dayT - seg.start) / span)
      const travel = new Poly(seg.travel)
      const tShare = travel.length > 0.3 ? Math.min(0.4, 0.12 + travel.length / 120) : 0
      const path = new Poly(seg.path)
      if (u < tShare || seg.kind === 'travel') {
        const p = travel.at((seg.kind === 'travel' ? u : u / tShare) * travel.length)
        pos = p
        dir = p
        passedUpTo(-1)
      } else {
        const w = (u - tShare) / (1 - tShare)
        if (!seg.walker) {
          const p = path.at(w * path.length)
          pos = p
          dir = p
          working = w < 1 ? 1 : 0
          passedUpTo(w * path.length)
        } else {
          const end = travel.at(travel.length)
          pos = end
          dir = travel.length > 0.01 ? end : dir
          const p = path.at(w * path.length)
          walkPos = p
          walkDir = p
          walkerOn = w < 1
          passedUpTo(w * path.length)
        }
      }
      tractor.setImplement(seg.kind === 'travel' ? tractor.current === 'none' ? 'none' : tractor.current : implementFor(seg.kind))
    } else if (snap.mode !== 'season' && snap.mode !== 'title') {
      tractor.setImplement('none')
    }
    const moved = Math.hypot(pos.x - tractorAt.x, pos.z - tractorAt.z)
    travelled += moved
    if (moved > 1e-4 || seg) {
      const target = Math.atan2(dir.dz, dir.dx)
      let d = target - heading
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      heading += moved > 1e-4 ? d * Math.min(1, dt * 7 + moved * 2) : 0
    }
    tractorAt = { x: pos.x, z: pos.z }
    const y = heightAt(pos.x, pos.z)
    const ahead = heightAt(pos.x + Math.cos(heading) * 0.6, pos.z + Math.sin(heading) * 0.6)
    const behind = heightAt(pos.x - Math.cos(heading) * 0.6, pos.z - Math.sin(heading) * 0.6)
    tractor.group.position.set(pos.x, y + 0.02, pos.z)
    tractor.group.rotation.set(0, -heading, Math.atan2(ahead - behind, 1.2), 'YXZ')
    tractor.driver.visible = !walkerOn
    walker.visible = walkerOn
    if (walkerOn) {
      walker.position.set(walkPos.x, heightAt(walkPos.x, walkPos.z) + 0.04, walkPos.z)
      walker.rotation.y = -Math.atan2(walkDir.dz, walkDir.dx)
      stride(walker, time * 9, 1)
      fork.visible = kind === 'sample' || kind === 'rogue'
    }
    const wind = new Vector2(Math.cos(env.windDir) * env.wind, Math.sin(env.windDir) * env.wind)
    tractor.animate(ambient, travelled, working, kind, wind)
  }

  // ---- Input: orbit, zoom, pick
  const ray = new Raycaster()
  const boxes = FIELDS.map(f => new Box3(new Vector3(f.x0, Math.min(fieldBaseY(f.i, f.z0), fieldBaseY(f.i, f.z1)) - 0.1, f.z0), new Vector3(f.x1, Math.max(fieldBaseY(f.i, f.z0), fieldBaseY(f.i, f.z1)) + 0.7, f.z1)))
  const hit = new Vector3()
  function pick(clientX: number, clientY: number): number {
    const b = canvas.getBoundingClientRect()
    const ndc = new Vector2(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1)
    ray.setFromCamera(ndc, rig.camera)
    let best = -1, bd = Infinity
    const r: Ray = ray.ray
    boxes.forEach((box, i) => {
      if (r.intersectBox(box, hit)) {
        const d = hit.distanceTo(r.origin)
        if (d < bd) { bd = d; best = i }
      }
    })
    return best
  }
  // One pointer drags to turn the land, two pinch to zoom, and a press that does not move selects.
  const pointers = new Map<number, { x: number; y: number }>()
  let downAt: { x: number; y: number } | null = null
  let dragged = false
  let slop = 6
  let pinch = 0
  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try { canvas.setPointerCapture?.(e.pointerId) } catch { /* the pointer is already gone */ }
    if (pointers.size === 1) { downAt = { x: e.clientX, y: e.clientY }; dragged = false; slop = e.pointerType === 'mouse' ? 6 : 12 }
    if (pointers.size >= 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); dragged = true }
  }
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId)
    if (!p) {
      if (e.pointerType === 'mouse') {
        const h = pick(e.clientX, e.clientY)
        if (h !== hovered) { hovered = h; canvas.style.cursor = h >= 0 ? 'pointer' : 'default' }
      }
      return
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch > 0 && d > 0) rig.zoomBy(pinch / d)
      pinch = d
      return
    }
    if (downAt && !dragged && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > slop) dragged = true
    if (dragged) rig.orbit(dx, dy)
  }
  const release = (e: PointerEvent, tap: boolean) => {
    const had = pointers.delete(e.pointerId)
    if (pointers.size < 2) pinch = 0
    if (tap && had && pointers.size === 0 && !dragged && downAt) app.select(pick(e.clientX, e.clientY))
    if (pointers.size === 0) downAt = null
  }
  const onUp = (e: PointerEvent) => release(e, true)
  const onCancel = (e: PointerEvent) => release(e, false)
  const onLeave = () => { if (hovered !== -1) { hovered = -1; canvas.style.cursor = 'default' } }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    rig.zoomBy(Math.exp(Math.max(-1, Math.min(1, e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)))))
  }
  const onDbl = () => rig.reset()
  const onLost = (e: Event) => { e.preventDefault(); lost = true; lostFor = 0 }
  const onRestored = () => { lost = false; dirty = true }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onCancel)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('dblclick', onDbl)
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  function viewport(): Viewport {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight
    const i = app.insets
    return { w, h, top: i.top, right: i.right, bottom: i.bottom, left: i.left }
  }

  const pixelRatio = () => Math.min(2, devicePixelRatio || 1)
  let size = { w: 0, h: 0 }
  function resize(): void {
    const vp = viewport()
    renderer.setPixelRatio(pixelRatio())
    renderer.setSize(vp.w, vp.h, false)
    size = { w: vp.w, h: vp.h }
    weather.setPointScale(rig.pixelScale(vp.h) * renderer.getPixelRatio())
  }
  resize()

  function frame(dtMs: number): void {
    if (document.hidden) return
    if (lost) {
      lostFor += dtMs
      if (lostFor > LOST_MS) giveUp()
      return
    }
    const vp = viewport()
    // A move to a screen of another density changes the pixel ratio without any resize event.
    if (vp.w !== size.w || vp.h !== size.h || pixelRatio() !== renderer.getPixelRatio()) resize()
    const dt = Math.min(0.1, dtMs / 1000)
    time += dt
    ambient += dt * (reduced ? STILL : 1)
    fall += reduced ? 0 : dt
    if (dirty) rebuild()
    // Day clock: follows the game clock when it runs, plays the day out by itself when paused.
    if (snap.mode === 'title') dayT = reduced ? 0.3 : (time / TITLE_LOOP_S) % 1
    else if (dayT < 1) dayT = Math.min(1, app.speed > 0 ? Math.max(dayT + dt / DAY_ANIM_S * 0.25, app.dayProgress) : dayT + dt / DAY_ANIM_S)
    easeEnv(env, envT, 1 - Math.exp(-dt / 1.1))
    U.uTime.value = ambient
    U.uSway.value = reduced ? 0 : env.wind
    U.uWindDir.value.set(Math.cos(env.windDir), Math.sin(env.windDir))
    U.uSnow.value = env.snow
    U.uRime.value.set(env.rime0, env.rime1, env.rime2)
    U.uWet.value = env.wet
    U.uGrass.value.copy(env.grass)
    U.uGold.value = env.gold
    U.uCloud.value = reduced ? 0 : env.cloud
    U.uSky.value.copy(env.skyHorizon)
    terrain.water.ice.value = env.ice
    weather.update(ambient, fall, env, vp.w / vp.h, rig.distance())
    props.update(ambient, env)
    placeWorkers(dt)
    fields.update(dt, { selected: app.selected, hovered, oats: env.oats, oatsRipe: env.oatsRipe, wind: env.wind, time, reduced }, tints)
    harvest.update(dt, app.speed === 0)
    const drift = snap.mode === 'title' && !reduced ? Math.sin(time * 0.045) : 0
    rig.update(dt, vp, app.selected, drift, reduced)
    renderer.render(scene, rig.camera)
  }

  const anchor = new Vector3()
  const view: FieldView = {
    ready: Promise.resolve(),
    quality: () => ({ tier: 'high', fps: 0 }),
    resize,
    frame,
    fieldAnchor(i) {
      const f = FIELDS[i]
      if (!f) return { x: 0, y: 0, visible: false }
      anchor.set(f.cx, fields.topY(i), f.z0).project(rig.camera)
      const vp = viewport()
      const x = (anchor.x + 1) / 2 * vp.w, y = (1 - anchor.y) / 2 * vp.h
      return { x, y, visible: anchor.z < 1 && x >= 0 && x <= vp.w && y >= 0 && y <= vp.h }
    },
    dispose() {
      off()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDbl)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      terrain.dispose()
      props.dispose()
      fields.dispose()
      harvest.dispose()
      tractor.dispose()
      weather.dispose()
      puff.dispose()
      renderer.dispose()
    },
  }

  // Test hook: settle every transition at once, so a screenshot shows the state rather than a blend.
  ;(globalThis as Record<string, unknown>).__countyField = {
    settle() {
      if (dirty) rebuild()
      flush(false)
      dayT = 1
      copyEnv(env, envT)
      fields.snap(tints)
      harvest.snap()
      rig.snap(viewport(), app.selected)
    },
    anchor(i: number) {
      return view.fieldAnchor(i)
    },
    seek(t: number) {
      if (dirty) rebuild()
      dayT = Math.max(0, Math.min(1, t))
    },
    info() {
      return { mode: snap.mode, dayT, pending: pending.length, segs: segs.map(s => `${s.kind}@${s.field}`), tractor: tractorAt, fields: snap.fields.map(f => f.status) }
    },
    // What the last frame drew, where the camera stood, and the clocks.
    stats() {
      const r = renderer.info.render
      return { triangles: r.triangles, calls: r.calls, pixelRatio: renderer.getPixelRatio(), width: canvas.width, height: canvas.height, camera: rig.where(), time, ambient, fall }
    },
  }
  return view
}
