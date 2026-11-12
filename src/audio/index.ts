// The game's sound, all synthesized: a quiet ambience that follows the weather and the season, the tractor and
// the truck, people at work when the player looks their way, and cues for what happens. Silent until the first
// user gesture. It reads the game as the grower could: public campaign fields, the simulation's views and the app.
import type { App, AppEvent, Screen } from '../game/app.ts'
import type { CreateSound, Sound } from '../game/contracts.ts'
import { goals } from '../game/goals.ts'
import { monthDay, today, type Campaign, type JobKind } from '../sim/index.ts'
import { Ambience } from './ambience.ts'
import { Director } from './director.ts'
import { sceneFor, type SceneInput } from './scene.ts'
import { FADE_IN, FADE_OUT, createRig, volumeGain, type Rig } from './synth.ts'
import { FAR, NEAR, NO_WORK, type WorkKind, type WorkScene } from './work.ts'

// Work done on foot with the tractor left idling at the headland, and work done from its seat.
const HAND_JOBS = new Set<JobKind>(['scout', 'rogue', 'sample'])
const MACHINE_JOBS = new Set<JobKind>(['plant', 'hill', 'spray', 'water', 'kill', 'dig', 'haul'])
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']
// How present the truck is when it hauls out of sight, against 1 when the player has picked it.
const TRUCK_FAR = 0.45

type Ctor = typeof AudioContext

function audioContextClass(): Ctor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

// What can be heard of people working, from who did what on the last day worked and what the player has picked.
export function workFor(app: App): { work: WorkScene; truck: number; tractor: [number, number] } {
  const c = app.campaign
  const work: WorkScene = { ...NO_WORK }
  let truck = 0
  let tractor: [number, number] = [0, 0]
  if (!c) return { work, truck, tractor }
  const hear = (kind: WorkKind, near: boolean) => { work[kind] = Math.max(work[kind], near ? NEAR : FAR) }
  // A tract of alder brush is cut and burnt, not felled.
  const felling = (field: number): WorkKind => (c.fields[field]?.cover === 'brush' ? 'brush' : 'fell')
  const s = c.season
  if (app.screen === 'season' && s && !s.frozen && app.speed > 0) {
    let seat = false, foot = false, truckOut = false
    for (const w of s.worked) {
      const near = w.unit === app.unit || (w.field >= 0 ? app.selection.includes(w.field) : w.field === app.yard)
      if (w.kind === 'fell') hear(felling(w.field), near)
      else if (w.kind === 'rocks') hear('rocks', near)
      else if (w.kind === 'brush') hear('brush', near)
      else if (w.kind === 'build') hear('build', near)
      let byTruck = false
      if (w.kind === 'haul') {
        // The barrels come down the ramp at the potato house: picking a yard brings them close too.
        const close = near || app.yard !== 0
        hear('barrels', close)
        // The day's work does not say what was driven. The farm's one truck goes to the first to haul; anyone
        // still holding a tractor for the haul is on a tractor.
        const u = c.crew.find(x => x.id === w.unit)
        byTruck = c.upgrades.truck && !truckOut && u?.rig !== 'tractor'
        if (byTruck) {
          truckOut = true
          truck = Math.max(truck, close ? 1 : TRUCK_FAR)
        }
      }
      if (MACHINE_JOBS.has(w.kind) && !byTruck) seat = true
      if (HAND_JOBS.has(w.kind)) foot = true
    }
    tractor = seat ? [1, 1] : foot ? [0.4, 0] : [0, 0]
  } else if (app.screen === 'cellar') {
    // Winter work goes on behind the cellar months: far off unless the player has picked who is at it.
    for (const u of c.crew) {
      const near = u.id === app.unit
      if (u.winter === 'woods' && u.winterField >= 0) hear(felling(u.winterField), near || app.selection.includes(u.winterField))
      else if (u.winter === 'build') hear('build', near || app.yard !== 0)
      else if (u.winter === 'pack') hear('barrels', near)
    }
  }
  return { work, truck, tractor }
}

// The sound, with one thing more than the seam asks: any cue by its name in the director's list, for the interface
// to sound at the moment its own motion lands (a stamp coming down, a coupon torn off).
export interface SoundWithCues extends Sound {
  cue(id: string, arg?: number): void
}

export const createSound: CreateSound = (app: App): SoundWithCues => {
  const AC = audioContextClass()
  if (!AC || typeof document === 'undefined') return { frame() {}, dispose() {}, cue() {} }

  let ctx: AudioContext | null = null
  let rig: Rig | null = null
  let amb: Ambience | null = null
  let director: Director | null = null
  let gestured = false
  let sinceScene = Infinity
  let suspendTimer = 0
  let lastScreen: Screen = app.screen
  // The goals already met on the farm being played, so that only one newly met is rewarded.
  let goalsOf: Campaign | null = null
  let met = new Set<string>()
  let rewardDue = false
  let picked: number[] = []

  const wanted = () => gestured && app.settings.sound && !document.hidden
  const live = () => ctx !== null && ctx.state === 'running' && wanted()

  function start(): void {
    try {
      ctx = new AC!({ latencyHint: 'balanced' })
    } catch {
      return
    }
    rig = createRig(ctx, ctx.destination, { seed: (Date.now() ^ 0x5bd1e995) >>> 0, master: true })
    rig.volume.gain.value = 0
    amb = new Ambience(rig, ctx.currentTime)
    director = new Director(rig)
    sinceScene = Infinity
  }

  // Brings the output to where the settings, the tab and the autoplay rules say it should be.
  function apply(): void {
    clearTimeout(suspendTimer)
    if (!wanted()) {
      if (!ctx || !rig || ctx.state === 'closed') return
      rig.volume.gain.setTargetAtTime(0, ctx.currentTime, FADE_OUT)
      const c = ctx
      suspendTimer = window.setTimeout(() => { if (!wanted() && c.state === 'running') c.suspend().catch(() => {}) }, 600)
      return
    }
    if (!ctx) start()
    if (!ctx || !rig) return
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
    rig.volume.gain.setTargetAtTime(volumeGain(Number(app.settings.volume)), ctx.currentTime, FADE_IN)
  }

  function onGesture(): void {
    if (!gestured) {
      gestured = true
      apply()
    } else if (ctx && ctx.state !== 'running' && wanted()) {
      ctx.resume().catch(() => {})
    }
  }

  function sceneInput(): SceneInput {
    const c = app.campaign
    if (!c || app.screen === 'title') return { place: 'title', month: 5, weather: null }
    if (app.screen === 'season' && c.season) {
      const t = today(app.world, c)
      const { month, dom } = monthDay(c.year, c.season.day)
      return { place: 'season', month, dom, weather: t ? { wind: t.day.wind, prcp: t.day.prcp, sky: t.sky, tmean: t.day.tmean } : null }
    }
    if (app.screen === 'cellar') return { place: 'cellar', month: (10 + c.month) % 12, weather: null }
    if (app.screen === 'plan') return { place: 'plan', month: 3, weather: null }
    return { place: 'yearEnd', month: 4, weather: null }
  }

  function onScreen(screen: Screen): void {
    sinceScene = Infinity
    if (screen === 'ledger' && lastScreen === 'cellar' && live() && director && ctx) director.ledger(ctx.currentTime)
    lastScreen = screen
  }

  // Rewards a goal the moment it is first met. A farm just loaded starts from what it has already done.
  function checkGoals(): void {
    const c = app.campaign
    if (!c || app.screen === 'title') { goalsOf = null; return }
    const done = goals(c).filter(g => g.done).map(g => g.id)
    if (goalsOf !== c) {
      goalsOf = c
      met = new Set(done)
      rewardDue = false
      return
    }
    if (done.some(id => !met.has(id))) rewardDue = true
    for (const id of done) met.add(id)
    reward()
  }

  // Sounds a reward that is owed. With the sound off it is let go; with the line full it is tried again.
  function reward(): void {
    if (!rewardDue) return
    if (!live() || !director || !ctx) rewardDue = false
    else if (director.goal(ctx.currentTime)) rewardDue = false
  }

  function onPick(e: AppEvent): void {
    // Only what was added to the selection answers: taking a field out of it is not a pick.
    let added = -1
    if (e.type === 'select') {
      for (const f of e.fields) if (!picked.includes(f)) added = f
      picked = e.fields
    }
    if (!live() || !director || !ctx) return
    const now = ctx.currentTime
    if (e.type === 'select') {
      if (added < 0) return
      const cover = app.campaign?.fields[added]?.cover ?? 'open'
      director.pick(cover === 'open' ? 'field' : 'tract', added, now)
    } else if (e.type === 'unit' && e.unit >= 0) {
      director.pick('person', e.unit, now)
    } else if (e.type === 'yard' && e.yard !== 0) {
      director.pick('yard', e.yard, now)
    }
  }

  const off = app.on((e: AppEvent) => {
    if (e.type === 'settings') apply()
    else if (e.type === 'events') { if (live() && director && ctx) director.events(e.events, ctx.currentTime) }
    else if (e.type === 'order') { if (live() && director && ctx) director.order(ctx.currentTime) }
    else if (e.type === 'select' || e.type === 'unit' || e.type === 'yard') onPick(e)
    else if (e.type === 'alert' && e.alert.type === 'need') { if (live() && director && ctx) director.need(ctx.currentTime, e.alert.level !== 'info') }
    else if (e.type === 'screen') onScreen(e.screen)
    else if (e.type === 'change') checkGoals()
  })
  for (const g of GESTURES) window.addEventListener(g, onGesture, true)
  document.addEventListener('visibilitychange', apply)

  return {
    cue(id: string, arg = 0) {
      if (live() && director && ctx) director.cue(id, ctx.currentTime, arg)
    },
    frame(dtMs: number) {
      if (!ctx || !amb || ctx.state !== 'running') return
      const now = ctx.currentTime
      sinceScene += dtMs
      if (sinceScene >= 150) {
        sinceScene = 0
        amb.setScene(sceneFor(sceneInput()), now)
        const w = workFor(app)
        amb.setEngine(w.tractor[0], w.tractor[1], now)
        amb.setWork(w.work, w.truck, now)
        reward()
      }
      amb.schedule(now, now + 0.4)
    },
    dispose() {
      off()
      for (const g of GESTURES) window.removeEventListener(g, onGesture, true)
      document.removeEventListener('visibilitychange', apply)
      clearTimeout(suspendTimer)
      ctx?.close().catch(() => {})
      ctx = null
      rig = null
      amb = null
      director = null
    },
  }
}
