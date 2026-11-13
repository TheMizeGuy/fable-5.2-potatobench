// The people and machines of the land run without a picture: the real game stepped a frame at a time at a clock
// speed, the field view's own bookkeeping of days and plans done as src/render/index.ts does it, and every frame
// where each person and machine is seen. For tests of what is seen of the work (tests/seen.test.ts).
import { PerspectiveCamera, Texture } from 'three'
import { App } from '../src/game/app.ts'
import { Crews, type PendingReveal } from '../src/render/units.ts'
import { copyEnv, envTarget, makeEnv } from '../src/render/env.ts'
import type { HillDisplay } from '../src/render/fields.ts'
import { FIELDS } from '../src/render/layout.ts'
import { Particles } from '../src/render/particles.ts'
import { snapshot, type Snapshot } from '../src/render/state.ts'
import * as sim from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()
const DAYS_PER_SECOND = [0, 0.25, 0.75, 2]
// How far past its ends and sides a field's own ground is taken to reach: the headlands a machine turns on.
export const HEAD = { x: 12, z: 2 }

export interface Farm { spring?: (app: App) => void; order?: (app: App) => void }

function start(farm: Farm): App {
  const app = new App(world)
  app.newGame(1977, 5)
  const c = app.campaign!
  c.cash += 60000
  if (c.applicants[0]) app.do({ t: 'hire', applicant: c.applicants[0].id })
  farm.spring?.(app)
  app.do({ t: 'begin' })
  app.do({ t: 'sprayWay', way: 'auto' })
  app.setSpeed(0)
  farm.order?.(app)
  return app
}

// How many days go by on this farm before a kind of work is first done (0: never).
export function firstDay(kind: string, farm: Farm = {}): number {
  const app = start(farm), c = app.campaign!
  for (let n = 1; n < 240 && c.phase === 'season' && !sim.seasonDone(c); n++) {
    c.incidents = []
    app.do({ t: 'day' })
    if (c.season!.worked.some(w => w.kind === kind)) return n
  }
  return 0
}

export interface Seen {
  seconds: number          // from when the game first had anyone at this work to the end (or to `grace` after it last had)
  atWork: number           // of them, a machine was seen on a field of this work (for work on foot: whoever does it)
  working: number          // and at this work, by its own account
  busy: number             // or at any work there (behind the days, the picture may be of the work before)
  path: number             // metres it was seen to cover there, working
  along: number            // of them, along the rows
  moving: number           // seconds it was seen moving there
  jumps: string[]          // steps nobody could make, seen (not gone from sight)
  cuts: number             // times someone went from sight and was seen again elsewhere
  fields: number[]
  work: [number, number]   // how many times someone's day had this work in it, at the start and by the end
  lead: number             // metres the first to set out was seen to go before the first day was counted
  trace: string[]
}

// Runs the days at a clock speed from the evening before `kind` is first done, and says what was seen of it.
// foot: the work is done on foot (the one doing it is watched, not a machine); dist: how far off the camera is.
export function watch(kind: string, speed: 1 | 2 | 3, opts: { farm?: Farm; seconds?: number; dist?: number; foot?: boolean; headZ?: number; grace?: number } = {}): Seen {
  const farm = opts.farm ?? {}, dist = opts.dist ?? 450, grace = opts.grace ?? [6, 6, 4.5, 3.5][speed], headZ = opts.headZ ?? HEAD.z
  const days = firstDay(kind, farm)
  if (!days) throw new Error(`nobody ever does ${kind}`)
  const app = start(farm), c = app.campaign!
  for (let n = 0; n < days - 1; n++) { c.incidents = []; app.do({ t: 'day' }) }
  const crews = new Crews(), particles = new Particles(new Texture())
  const camera = new PerspectiveCamera(42, 1.6, 0.5, 9000)
  camera.position.set(60, dist * 0.45, 60 + dist * 0.9)
  camera.updateMatrixWorld()
  crews.setScreen(1280, 800)
  const env = makeEnv(), envT = makeEnv()
  let snap: Snapshot = snapshot(app)
  const display = (s: Snapshot): HillDisplay[][] => s.fields.map(f => f.hills.map(look => ({ look, ridge: f.ridge })))
  let shown = display(snap)
  let pending: PendingReveal[] = []
  crews.rest(snap)
  copyEnv(env, envTarget(snap, envT))
  let dirty = false, dayPassed = false, dayT = 1
  app.on(e => { if (e.type === 'change' || e.type === 'screen') dirty = true; else if (e.type === 'events') { dirty = true; if (e.dayPassed) dayPassed = true } })
  const reveal = (r: PendingReveal) => { shown[r.field][r.hill] = { look: r.look, ridge: r.ridge } }
  const passed = (unit: number, seg: number, arc: number, gen: number) => {
    pending = pending.filter(r => { const now = r.unit === unit && (r.gen < gen || (r.gen === gen && (r.seg < seg || (r.seg === seg && r.at <= arc)))); if (now) reveal(r); return !now })
  }
  const rebuild = () => {
    const next = snapshot(app), prev = snap
    const sameSeason = dayPassed && prev.mode === 'season' && next.mode === 'season' && prev.year === next.year
    if (sameSeason) pending = pending.filter(r => { const keep = crews.owes(r.unit, r.gen); if (!keep) reveal(r); return keep })
    snap = next
    const wait = () => new Set(pending.map(r => r.field * sim.HILLS + r.hill))
    if (sameSeason) {
      pending = pending.concat(crews.plan(next, shown, new Map()))
      const w = wait(), fresh = display(next)
      shown = fresh.map((hills, i) => hills.map((d, h) => (w.has(i * sim.HILLS + h) ? shown[i][h] : d)))
      dayT = 0
    } else if (prev.mode === next.mode && prev.seasonDay === next.seasonDay) {
      crews.sync(next)
      // (a build from before people set out ahead of the day has no such call)
      if (app.speed > 0) crews.setOut?.(next)
    } else { pending = []; shown = display(next); crews.rest(next); dayT = 1 }
    envTarget(next, envT)
    copyEnv(env, envT)
    dayPassed = dirty = false
  }

  const dt = 1 / 60
  const out: Seen = { seconds: 0, atWork: 0, working: 0, busy: 0, path: 0, along: 0, moving: 0, jumps: [], cuts: 0, fields: [], work: [NaN, NaN], lead: 0, trace: [] }
  const fields = new Set<number>()
  let since = Infinity, begun = false, time = 0, lastTrace = -1
  const was = new Map<string, { x: number; z: number; fade: number }>()
  const lead0 = new Map<number, { x: number; z: number }>()
  const inField = (x: number, z: number) => { for (const i of fields) { const r = FIELDS[i]; if (x > r.x0 - HEAD.x && x < r.x1 + HEAD.x && z > r.z0 - headZ && z < r.z1 + headZ) return true } return false }
  const quick = [1, 1, 1.5, 2.4][speed]
  app.setSpeed(speed)
  const dayOne = c.season!.day
  let dayNow = dayOne, events = 0, stopped = 0
  out.work[0] = 0
  for (let n = 0; n < (opts.seconds ?? 20) * 60; n++) {
    time += dt
    if (c.incidents.length) c.incidents = []
    // (a question that stops the clock is answered a third of a second later)
    if (app.speed !== speed && c.phase === 'season' && ++stopped > 20) { app.setSpeed(speed); stopped = 0 }
    app.tick(dt * 1000)
    if (dirty) rebuild()
    if (dayT < 1) dayT = Math.min(1, app.speed > 0 ? Math.max(dayT + (dt / 3.4) * 0.25, app.dayProgress) : dayT + dt / 3.4)
    if (crews.stageHold >= 0) dayT = Math.min(dayT, crews.stageHold)
    crews.place({
      dt, dayT, advancing: app.speed > 0, pace: 1, time, reduced: false, idle: false, season: snap.mode === 'season', dist, dust: env.dry, dark: 0, picked: -1, particles, passed, snap, env, camera,
      speed: app.speed, daySec: 1 / DAYS_PER_SECOND[Math.max(1, app.speed)], clock: dt,
    })
    particles.update(dt, 0, 0)
    const s = c.season
    if (!s || c.phase !== 'season') break
    // who the game has at this work
    const who = new Set<number>()
    for (const u of c.crew) { const j = s.jobs.find(x => x.id === u.job); if (j && j.kind === kind) { who.add(u.id); fields.add(j.field) } }
    for (const w of s.worked) if (w.kind === kind) { who.add(w.unit); fields.add(w.field) }
    const w = crews.where()
    // (a build that does not say who is gone from sight, or what a machine is at: nobody is, and it is not said)
    for (const p of [...w.units, ...w.rigs]) p.fade ??= 1
    for (const r of w.rigs) { r.work ??= ''; r.tool ??= '' }
    const last = new Map<object, { x: number; z: number }>()
    w.rigs.forEach((r, k) => { const b = was.get(`${r.kind} ${k}`); if (b) last.set(r, b) })
    // steps nobody could make (someone gone from sight through a cut is not seen to make one)
    for (const [key, p, most] of [...w.units.map(u => [`person ${u.id}`, u, (u.foot ? 9 : 28) * quick] as const), ...w.rigs.map((r, k) => [`${r.kind} ${k}`, r, 28 * quick] as const)]) {
      const b = was.get(key)
      if (b && Number.isFinite(p.x) && Number.isFinite(b.x)) {
        const d = Math.hypot(p.x - b.x, p.z - b.z)
        if (d > most * dt * 1.25 + 0.6) { if (Math.min(p.fade, b.fade) >= 0.5) out.jumps.push(`${key} ${d.toFixed(0)} m at ${time.toFixed(1)} s`); else out.cuts++ }
      }
      was.set(key, { x: p.x, z: p.z, fade: p.fade })
    }
    const moved = (r: { x: number; z: number }) => { const b = last.get(r); return !!b && Math.hypot(r.x - b.x, r.z - b.z) > 0.02 }
    if (!begun && s.day === dayOne) { const lead = snap.lead ? w.units.find(u => u.id === snap.lead!.unit) : undefined; const b = lead ? lead0.get(lead.id) : undefined; if (lead) { if (b) out.lead += Math.hypot(lead.x - b.x, lead.z - b.z); lead0.set(lead.id, { x: lead.x, z: lead.z }) } }
    if (s.day !== dayNow) { dayNow = s.day; events += s.worked.filter(x => x.kind === kind).length }
    if (who.size) { since = time; begun = true }
    out.work[1] = events
    if (time - lastTrace >= 0.5) {
      lastTrace = time
      out.trace.push(`${time.toFixed(1)}s day ${s.day} ${w.rigs.map(r => `${r.kind}${r.holder >= 0 ? '(' + r.holder + ')' : ''} ${r.x.toFixed(0)},${r.z.toFixed(0)} ${r.tool} ${r.work}${r.fade < 0.5 ? ' gone' : ''}`).join(' | ')} || ${w.units.map(u => `${u.id}${u.foot ? ' on foot' : ' riding'} ${u.x.toFixed(0)},${u.z.toFixed(0)}${u.fade < 0.5 ? ' gone' : ''}`).join(' | ')} || ${crews.clocks().join(' || ')}`)
    }
    if (!begun || time - since > grace) continue
    out.seconds += dt
    const at = opts.foot
      ? w.units.filter(u => who.has(u.id) && u.fade >= 0.5 && inField(u.x, u.z))
      // (hauling: the truck, or the tractor with the trailer on, at the field or on its way)
      : kind === 'haul' ? w.rigs.filter(r => r.holder >= 0 && r.fade >= 0.5 && (r.kind === 'truck' || r.tool === 'trailer') && (inField(r.x, r.z) || moved(r)))
        : w.rigs.filter(r => r.holder >= 0 && r.fade >= 0.5 && inField(r.x, r.z) && !w.units.find(u => u.id === r.holder)?.foot)
    if (at.length) {
      out.atWork += dt
      if (!opts.foot && at.some(r => (r as { work: string }).work === kind)) out.working += dt
      if (!opts.foot && at.some(r => (r as { work: string }).work !== '')) out.busy += dt
      const p = at[0], key = opts.foot ? `at ${(p as { id: number }).id}` : `at ${w.rigs.indexOf(p as never)}`
      const b = was.get(key)
      // (how it goes while it works: the way in along the headland is not the work)
      const busy = opts.foot || kind === 'haul' || (p as { work: string }).work !== ''
      if (b && busy) { const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz); if (d < 15) { out.path += d; out.along += Math.abs(dx); if (d > 0.5 * dt) out.moving += dt } }
      for (const k of [...was.keys()]) if (k.startsWith('at ') && k !== key) was.delete(k)
      was.set(key, { x: p.x, z: p.z, fade: 1 })
    } else for (const k of [...was.keys()]) if (k.startsWith('at ')) was.delete(k)
  }
  out.fields = [...fields]
  crews.dispose()
  particles.dispose()
  return out
}
