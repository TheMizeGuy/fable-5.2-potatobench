// The game's sound, all synthesized: a quiet ambience that follows the weather and the season, the tractor
// while the farmer works, and a few restrained cues for what happens. Silent until the first user gesture.
import type { App, AppEvent, Screen } from '../game/app.ts'
import type { CreateSound } from '../game/contracts.ts'
import { monthDay, today, type GameEvent } from '../sim/index.ts'
import { Ambience } from './ambience.ts'
import * as cue from './cues.ts'
import { sceneFor, type SceneInput } from './scene.ts'
import { createRig, volumeGain, type Rig } from './synth.ts'

// Warning chime pitches: A minor pentatonic, low. More serious is lower.
const WARN_HZ: [string, number][] = [
  ['lost', 146.8], ['breakdown', 146.8], ['blightSeen', 196], ['frost', 261.6], ['freeze', 261.6], ['watch', 220], ['dry', 164.8],
]
const BAD_HZ = 196
const HAND_JOBS = new Set(['scout', 'rogue', 'sample'])
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']

type Ctor = typeof AudioContext

function audioContextClass(): Ctor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export const createSound: CreateSound = app => {
  const AC = audioContextClass()
  if (!AC || typeof document === 'undefined') return { frame() {}, dispose() {} }

  let ctx: AudioContext | null = null
  let rig: Rig | null = null
  let amb: Ambience | null = null
  let gestured = false
  let sinceScene = Infinity
  let suspendTimer = 0
  let lastScreen: Screen = app.screen
  let barrelUntil = 0
  const lastCue: Record<string, number> = {}

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
    sinceScene = Infinity
  }

  // Brings the output to where the settings, the tab and the autoplay rules say it should be.
  function apply(): void {
    clearTimeout(suspendTimer)
    if (!wanted()) {
      if (!ctx || !rig || ctx.state === 'closed') return
      rig.volume.gain.setTargetAtTime(0, ctx.currentTime, 0.08)
      const c = ctx
      suspendTimer = window.setTimeout(() => { if (!wanted() && c.state === 'running') c.suspend().catch(() => {}) }, 600)
      return
    }
    if (!ctx) start()
    if (!ctx || !rig) return
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
    rig.volume.gain.setTargetAtTime(volumeGain(Number(app.settings.volume)), ctx.currentTime, 0.25)
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
      const month = monthDay(c.year, c.season.day).month
      return { place: 'season', month, weather: t ? { wind: t.day.wind, prcp: t.day.prcp, sky: t.sky, tmean: t.day.tmean } : null }
    }
    if (app.screen === 'cellar') return { place: 'cellar', month: (10 + c.month) % 12, weather: null }
    if (app.screen === 'plan') return { place: 'plan', month: 3, weather: null }
    return { place: 'yearEnd', month: 4, weather: null }
  }

  // The tractor: running while the farmer works the queue, idling for jobs done on foot.
  function engineTarget(): [number, number] {
    const s = app.campaign?.season
    if (app.screen !== 'season' || !s || app.speed === 0 || s.frozen || s.worked.length === 0) return [0, 0]
    return s.worked.some(w => !HAND_JOBS.has(w.kind)) ? [1, 1] : [0.4, 0]
  }

  function ready(key: string, gap: number, now: number): boolean {
    if (now - (lastCue[key] ?? -Infinity) < gap) return false
    lastCue[key] = now
    return true
  }

  function onEvents(events: GameEvent[]): void {
    if (!live() || !rig || !ctx) return
    const now = ctx.currentTime
    const has = new Set(events.map(e => e.type))
    let k = 0
    const slot = () => now + 0.03 + 0.11 * k++

    if (has.has('planted') && ready('planted', 0.3, now)) cue.planted(rig, slot())
    if (has.has('hilled') && ready('hilled', 0.3, now)) cue.hilled(rig, slot())
    if (has.has('sprayed') && ready('sprayed', 0.3, now)) cue.sprayed(rig, slot())
    if (has.has('watered') && ready('watered', 0.3, now)) cue.watered(rig, slot())
    if ((has.has('dug') || has.has('sample')) && now >= barrelUntil) {
      const dig = has.has('dug')
      const sample = events.find(e => e.type === 'sample')
      const w = sample?.data?.weights
      barrelUntil = cue.barrel(rig, slot(), dig ? 'dig' : 'sample', Array.isArray(w) ? w.length : 5)
    }
    if ((has.has('sold') || has.has('overflow')) && ready('sold', 0.15, now)) cue.sold(rig, slot())

    let hz = 0
    for (const [type, f] of WARN_HZ) if (has.has(type)) { hz = f; break }
    if (!hz && events.some(e => e.level === 'bad' && e.type !== 'dug')) hz = BAD_HZ
    if (hz && ready('warn', 1, now)) cue.chime(rig, slot(), hz)

    // The bank calling the note closes the year with no cadence.
    if (events.some(e => e.type === 'lost' && e.field < 0)) lastCue.cadence = now
    if (has.has('kept') && ready('cadence', 4, now)) cue.cadence(rig, slot() + 0.25, 'kept')
  }

  function onScreen(screen: Screen): void {
    sinceScene = Infinity
    if (screen === 'ledger' && lastScreen === 'cellar' && live() && rig && ctx && ready('cadence', 4, ctx.currentTime)) {
      cue.cadence(rig, ctx.currentTime + 0.2, 'ledger')
    }
    lastScreen = screen
  }

  const off = app.on((e: AppEvent) => {
    if (e.type === 'settings') apply()
    else if (e.type === 'events') onEvents(e.events)
    else if (e.type === 'screen') onScreen(e.screen)
  })
  for (const g of GESTURES) window.addEventListener(g, onGesture, true)
  document.addEventListener('visibilitychange', apply)

  return {
    frame(dtMs: number) {
      if (!ctx || !amb || ctx.state !== 'running') return
      const now = ctx.currentTime
      sinceScene += dtMs
      if (sinceScene >= 150) {
        sinceScene = 0
        amb.setScene(sceneFor(sceneInput()), now)
        const [level, load] = engineTarget()
        amb.setEngine(level, load, now)
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
    },
  }
}
