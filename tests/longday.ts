// A long day run without a picture: the real game at its first speed (a day of three and a half minutes), stepped a
// frame at a time, the field view's own bookkeeping of the day's plan done as src/render/index.ts does it, and every
// frame where each person and machine is seen. For tests of a day watched as it is worked (tests/longday.test.ts).
import { PerspectiveCamera, Texture } from 'three'
import { App, DAY_SECONDS, setDays } from '../src/game/app.ts'
import { WATCH } from '../src/render/crew.ts'
import { copyEnv, envTarget, makeEnv } from '../src/render/env.ts'
import type { HillDisplay } from '../src/render/fields.ts'
import { FIELDS } from '../src/render/layout.ts'
import { Particles } from '../src/render/particles.ts'
import { snapshot, type Snapshot } from '../src/render/state.ts'
import { Crews, type PendingReveal } from '../src/render/units.ts'
import * as sim from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

export interface LongSeen {
  days: number
  jumps: string[]                       // steps nobody could make, seen (not gone from sight)
  fastest: { foot: number; rig: number; working: number }   // metres a second, in sight, kept up for a second
  where: { foot: string; rig: string }  // and when that was
  slowestWorking: number                // a machine at row work, in sight, while it moved (median of its pace)
  slid: number                          // figures carried over the ground with their legs not stepping
  popped: number                        // hills whose ground changed only when the day turned, their machine never by
  shown: number                         // hills whose ground changed as the work passed
  ahead: string[]                       // ground shown worked that the day's end did not have worked
  atWork: { kind: string; field: number; unit: number; hours: number; seen: number }[]   // each stretch of row work in the days' records, and the share of its hours a machine was seen at it in its field
  replans: { at: number; moved: number }[]   // an order given part way through a day: how far anyone in sight was moved by the new plan
  orders: string[]
  plans: string[]
}

// job: the work the day is begun for (the first day the farm's advice asks for it). order: at this share of the first
// day, a second order (rocks on a resting field). hands: field hands hired.
export function watchLong(opts: { job: sim.JobKind; days?: number; order?: number; hands?: number; dt?: number; seed?: number }): LongSeen {
  setDays('long')
  const app = new App(world)
  app.settings.pauseOnAlerts = false
  app.newGame(1987, opts.seed ?? 3)
  const c = app.campaign!
  c.cash += 40000
  for (let k = 0; k < (opts.hands ?? 1); k++) app.do({ t: 'hire', kind: 'hand' })
  app.do({ t: 'begin' })
  app.do({ t: 'sprayWay', way: 'auto' })
  let found = false
  for (let n = 0; n < 300 && !found && !sim.seasonDone(c); n++) {
    c.incidents = []
    const want = sim.advise(app.world, c).filter(a => a.act === opts.job && a.field >= 0)
    if (want.length) { for (const a of want.slice(0, 2)) app.do({ t: 'job', kind: a.act as sim.JobKind, field: a.field }); found = true; break }
    for (const a of sim.advise(app.world, c)) if (a.field >= 0 && a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') app.do({ t: 'job', kind: a.act as sim.JobKind, field: a.field })
    app.do({ t: 'day' })
  }
  if (!found) throw new Error(`no day wants ${opts.job}`)

  const crews = new Crews(), particles = new Particles(new Texture())
  const camera = new PerspectiveCamera(42, 1.6, 0.5, 9000)
  camera.position.set(60, 200, 460)
  camera.updateMatrixWorld()
  crews.setScreen(1280, 800)
  const env = makeEnv(), envT = makeEnv()
  let snap: Snapshot = snapshot(app)
  const display = (s: Snapshot): HillDisplay[][] => s.fields.map(f => f.hills.map((look, h) => ({ look, ridge: f.ridges?.[h] ?? f.ridge })))
  let shown = display(snap)
  let pending: PendingReveal[] = []
  crews.rest(snap)
  copyEnv(env, envTarget(snap, envT))
  let dirty = false, dayPassed = false, dayT = 1
  let longKey = '', longFor = -1, longShares = new Map<string, number>()
  const doneToday = new Set<number>()
  const out: LongSeen = { days: 0, jumps: [], fastest: { foot: 0, rig: 0, working: 0 }, where: { foot: '', rig: '' }, slowestWorking: 0, slid: 0, popped: 0, shown: 0, ahead: [], atWork: [], replans: [], orders: [], plans: [] }
  app.on(e => { if (e.type === 'change' || e.type === 'screen') dirty = true; else if (e.type === 'events') { dirty = true; if (e.dayPassed) dayPassed = true } })
  const reveal = (r: PendingReveal, late: boolean) => { shown[r.field][r.hill] = { look: r.look, ridge: r.ridge }; doneToday.add(r.field * sim.HILLS + r.hill); if (late) out.popped++; else out.shown++ }
  const passed = (unit: number, seg: number, arc: number, gen: number) => {
    pending = pending.filter(r => { const now = r.unit === unit && (r.gen < gen || (r.gen === gen && (r.seg < seg || (r.seg === seg && r.at <= arc)))); if (now) reveal(r, false); return !now })
  }
  let replanned = false
  const rebuild = () => {
    const next = snapshot(app), prev = snap
    const turn = dayPassed && prev.mode === 'season' && next.mode === 'season' && prev.year === next.year
    snap = next
    if (turn) {
      for (const r of pending) reveal(r, true)
      pending = []
      // What was shown worked through the day is what the day's end has worked.
      next.fields.forEach((f, i) => f.hills.forEach((look, h) => {
        if (!doneToday.has(i * sim.HILLS + h)) return
        const was = shown[i][h].look.kind
        if (was !== look.kind && !(was === 'seed' && look.kind === 'plant')) out.ahead.push(`day ${next.seasonDay - 1}: field ${i} hill ${h} was shown ${was}, the day left it ${look.kind}`)
      }))
      doneToday.clear()
      longKey = ''
      crews.sync(next)
      shown = display(next)
      out.days++
    } else if (prev.mode === next.mode && prev.seasonDay === next.seasonDay) {
      crews.sync(next)
      const wait = new Set(pending.map(r => r.field * sim.HILLS + r.hill)), fresh = display(next)
      shown = fresh.map((hills, i) => hills.map((d, h) => (wait.has(i * sim.HILLS + h) || doneToday.has(i * sim.HILLS + h) ? shown[i][h] : d)))
    } else { pending = []; shown = display(next); crews.rest(next); dayT = 1 }
    const season = c.season
    if (season?.clock && next.mode === 'season') {
      const day = `${next.year}|${next.seasonDay}|`, key = `${day}${app.revision}`
      const ahead = key !== longKey ? app.today() : null
      if (ahead) {
        const again = longKey.startsWith(day)
        if (!again) longShares = new Map(season.jobs.filter(j => j.need > 0 && j.done > 0).map(j => [`${j.field}|${j.kind}`, Math.min(1, j.done / j.need)]))
        longKey = key
        longFor = next.seasonDay
        pending = crews.plan(snapshot(app, ahead), shown, new Map(), new Set(), true, { daySec: DAY_SECONDS, day: next.seasonDay, shares: longShares, now: app.dayProgress })
        dayT = app.dayProgress
        out.plans.push(`day ${next.seasonDay} at ${app.dayProgress.toFixed(2)}${again ? ' (again)' : ''}: ${crews.plans().join(' || ')}`)
        if (again) replanned = true
      }
    }
    envTarget(next, envT)
    copyEnv(env, envT)
    dayPassed = dirty = false
  }

  const dt = opts.dt ?? 1 / 20
  const days = opts.days ?? 1
  const was = new Map<string, { x: number; z: number; fade: number }>()
  const paces: number[] = []
  const trail = new Map<string, { x: number; z: number; foot: boolean }[]>()
  // Each stretch of row work the days' records have, as it is planned: watched for through its hours.
  const stretches = new Map<string, { kind: string; field: number; unit: number; from: number; to: number; frames: number; seen: number }>()
  let time = 0, ordered = false, figures: (number[] & { run?: number })[] = []
  WATCH.rows.length = 0
  WATCH.on = true
  app.setSpeed(1)
  const day0 = c.season!.day
  try {
    for (let n = 0; n < (days * DAY_SECONDS + 4) / dt && out.days < days; n++) {
      time += dt
      if (c.incidents.length) c.incidents = []
      if (app.speed === 0 && c.phase === 'season' && !sim.seasonDone(c)) app.setSpeed(1)
      if (opts.order !== undefined && !ordered && c.season!.day === day0 && app.dayProgress >= opts.order) {
        ordered = true
        const f = c.season!.fields.findIndex(x => x.status === 'rest')
        const r = app.do({ t: 'job', kind: 'rocks', field: f })
        out.orders.push(`${r.ok ? `rocks on field ${f}` : r.err} at ${app.dayProgress.toFixed(2)}`)
      }
      app.tick(dt * 1000)
      if (dirty) rebuild()
      const s = c.season
      if (!s || c.phase !== 'season') break
      dayT = longKey && s.day === longFor ? app.dayProgress : 1
      crews.place({
        dt, dayT, advancing: app.speed > 0, live: true, pace: 1, time, reduced: false, idle: false, season: true, dist: 300, dust: env.dry, dark: 0, picked: -1, particles, passed, snap, env, camera,
        speed: app.speed, daySec: DAY_SECONDS, clock: dt,
      })
      particles.update(dt, 0, 0)
      const w = crews.where()
      const all = [...w.units.map(u => ({ key: `person ${u.id}`, x: u.x, z: u.z, fade: u.fade, foot: u.foot, most: u.foot ? 4.5 : 17 })), ...w.rigs.map(r => ({ key: r.key, x: r.x, z: r.z, fade: r.fade, foot: false, most: 17 }))]
      let moved = 0
      for (const p of all) {
        const b = was.get(p.key)
        if (b && Number.isFinite(p.x) && Number.isFinite(b.x)) {
          const d = Math.hypot(p.x - b.x, p.z - b.z), v = d / dt
          if (Math.min(p.fade, b.fade) >= 0.95) {
            // (the pace kept up over a second: a step down from a seat is not a pace)
            const h = trail.get(p.key) ?? []
            h.push({ x: p.x, z: p.z, foot: p.foot })
            if (h.length > Math.round(1 / dt)) h.shift()
            trail.set(p.key, h)
            if (h.length === Math.round(1 / dt) && h.every(q => q.foot === p.foot)) {
              const v1 = Math.hypot(p.x - h[0].x, p.z - h[0].z) / ((h.length - 1) * dt)
              if (p.foot && v1 > out.fastest.foot) { out.fastest.foot = v1; out.where.foot = `${p.key}, day ${s.day} at ${app.dayProgress.toFixed(3)}` }
              if (!p.foot && v1 > out.fastest.rig) { out.fastest.rig = v1; out.where.rig = `${p.key}, day ${s.day} at ${app.dayProgress.toFixed(3)}` }
            }
            if (d > p.most * dt * 1.25 + 0.3) out.jumps.push(`${p.key} ${d.toFixed(1)} m in a frame (${v.toFixed(0)} m/s), day ${s.day} at ${app.dayProgress.toFixed(3)}`)
            moved = Math.max(moved, d)
          } else trail.delete(p.key)
        }
        was.set(p.key, { x: p.x, z: p.z, fade: p.fade })
      }
      if (replanned) { replanned = false; out.replans.push({ at: app.dayProgress, moved }) }
      for (const r of w.rigs) {
        if (!r.work || r.fade < 0.95) continue
        const b = was.get(`${r.key} pace`)
        if (b) { const v = Math.hypot(r.x - b.x, r.z - b.z) / dt; if (v > 0.2) { paces.push(v); out.fastest.working = Math.max(out.fastest.working, v) } }
      }
      for (const r of w.rigs) was.set(`${r.key} pace`, { x: r.x, z: r.z, fade: r.fade })
      // the stretches of row work in today's plan, and whether a machine is seen at each in its field in its hours
      if (longKey && s.day === longFor) {
        const ahead = app.today()
        for (const x of ahead?.season?.worked ?? []) {
          if (x.from === undefined || x.to === undefined || !x.machine?.startsWith('tractor') || x.kind === 'haul' || x.field < 0) continue
          const key = `${s.day}|${x.unit}|${x.kind}|${x.field}`
          const st = stretches.get(key) ?? { kind: x.kind, field: x.field, unit: x.unit, from: x.from, to: x.to, frames: 0, seen: 0 }
          st.from = Math.min(st.from, x.from); st.to = Math.max(st.to, x.to)
          stretches.set(key, st)
          if (app.dayProgress < x.from || app.dayProgress > x.to) continue
          st.frames++
          const f = FIELDS[x.field]
          if (w.rigs.some(r => r.work === x.kind && r.holder === x.unit && r.x > f.x0 - 14 && r.x < f.x1 + 14 && r.z > f.z0 - 3 && r.z < f.z1 + 3)) st.seen++
        }
      }
      // figures carried over the ground with their legs not stepping (as tests/slide.test.ts has it)
      const rows = WATCH.rows.slice() as (number[] & { run?: number })[]
      WATCH.rows.length = 0
      for (const r of rows) {
        const [x, , z, , , , , , , , , , flags] = r
        let near: (number[] & { run?: number }) | null = null, best = 1.5
        for (const o of figures) { const d = Math.hypot(o[0] - x, o[2] - z); if (d < best) { best = d; near = o } }
        const v = near ? best / dt : 0
        r.run = v > 0.6 && !(flags & 16) && !(flags & 32) ? (near?.run ?? 0) + 1 : 0
        if (r.run === 5) out.slid++
      }
      figures = rows
    }
  } finally { WATCH.on = false; WATCH.rows.length = 0 }
  paces.sort((a, b) => a - b)
  out.slowestWorking = paces.length ? paces[Math.floor(paces.length / 2)] : 0
  out.atWork = [...stretches.values()].map(st => ({ kind: st.kind, field: st.field, unit: st.unit, hours: st.to - st.from, seen: st.frames ? st.seen / st.frames : 0 }))
  crews.dispose()
  particles.dispose()
  return out
}
