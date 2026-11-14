// The running game: owns the campaign, the clock, the selection and the orders, saving, and tells the views what changed.
import {
  advise, apply, awaitsWord, climateWorld, createCampaign, fieldInfo, fieldNeeds, FIELD_NAMES, held, isFarmYear, plantingIn, plantReady, plantWordGiven, seasonDone, startYears, unitBlock, FARM_YEAR0, PLANT_WORD_DAYS,
  type Advice, type Campaign, type Cmd, type GameEvent, type JobKind, type Phase, type Result, type World,
} from '../sim/index.ts'
import type { Pointing, Thing } from './contracts.ts'
import { neighborYear } from './neighbor.ts'
import { clearSave, parseSave, readSave, readSettings, serialize, writeSave, writeSettings, type SaveFile } from './save.ts'

export type Speed = 0 | 1 | 2 | 3
// Pause and three speeds. A day of work takes three minutes at the first: the work is watched as it is done, a
// tractor crossing a field and coming back. At the second it takes half a minute, the same work run six times
// faster; at the third three seconds. Each is named for what it is against the first, in round figures.
// Time with no work in it goes by quickly at every speed (QUIET_S: a day nobody works, and what is left of a day
// once its last work is done): the days are long for the work in them, and the crop need not be waited for (the
// owner, 14 November: "things dont have to grow as they would in real life its a game").
export const DAY_SECONDS = 180
// A day this long or longer at the clock's speed (seconds) is watched as it is worked, and counted by the hour.
export const LONG_DAY_S = 25
export const DAY_HOURS = 11
// ('brisk' is the clock the game had before days were long: four seconds a day at its first speed, every day the
// same length. Tests of everything that is not the long day itself run on it, so a test that waits for a day waits
// four seconds.)
const LADDERS = { long: [0, 1 / DAY_SECONDS, 1 / 30, 1 / 3], brisk: [0, 0.25, 0.75, 2] }
// Seconds a day with no work in it takes at each speed (null: such a day is as long as any other).
const QUIETS: Record<keyof typeof LADDERS, number[] | null> = { long: [0, 3, 1.5, 0.3], brisk: null }
export let QUIET_S: number[] | null = QUIETS.long
// A new farm's first season opens this many days before the soil is expected to be fit to plant.
export const OPEN_BEFORE_PLANTING = 3
export type Days = keyof typeof LADDERS
export const DAYS_PER_SECOND = [...LADDERS.long]
export const SPEED_X = ['', '', '', '']
export function setDays(which: Days): void {
  QUIET_S = QUIETS[which]
  for (let k = 0; k < 4; k++) {
    DAYS_PER_SECOND[k] = LADDERS[which][k]
    const x = k ? DAYS_PER_SECOND[k] / LADDERS[which][1] : 0
    SPEED_X[k] = k ? `${x < 10 ? Math.round(x) : x < 100 ? Math.round(x / 10) * 10 : Math.round(x / 100) * 100}×` : ''
  }
}
setDays('long')
// Orders that change nothing about who works where: given part way through a day, the day need not be brought up
// to that moment first.
const NO_WORK = new Set<Cmd['t']>(['day', 'work', 'sell', 'deliver', 'seed', 'payMortgage', 'sellLogs', 'raise', 'accept', 'plan'])

export type Quality = 'auto' | 'high' | 'medium' | 'low'

export interface Settings {
  units: 'us' | 'metric'
  sound: boolean
  volume: number
  reducedMotion: boolean
  hints: boolean            // the one-line tips that come with a badge the first time
  pauseOnAlerts: boolean    // stop the clock when something new needs the player (off: the speed set is the speed it runs)
  quality: Quality
  // How large the interface is drawn: 'auto' fits it to the window (src/ui/scale.ts).
  uiScale: 'auto' | '1' | '1.25' | '1.5' | '1.75' | '2'
}

const DEFAULT_SETTINGS: Settings = { units: 'us', sound: true, volume: 0.6, reducedMotion: false, hints: true, pauseOnAlerts: false, quality: 'auto', uiScale: 'auto' }

export type Screen = 'title' | Phase

export interface Alert {
  id: number
  year: number
  day: number
  field: number             // -1 when not about one field
  level: GameEvent['level']
  type: string
  text: string
  data?: GameEvent['data']  // the event's own figures: the person, the building, the incident it is about
}

export interface OrderResult { field: number; ok: boolean; err: string }

export type AppEvent =
  | { type: 'change' }
  | { type: 'events'; events: GameEvent[]; dayPassed: boolean }
  | { type: 'screen'; screen: Screen }
  | { type: 'select'; field: number; fields: number[] }
  | { type: 'hover'; field: number }
  | { type: 'unit'; unit: number }
  | { type: 'point' }
  | { type: 'notice'; text: string }
  | { type: 'inspect' }
  | { type: 'yard'; yard: number }
  | { type: 'focus'; field: number }
  | { type: 'order'; kind: JobKind; fields: number[] }
  // An order given by a stamp or a right-click: who will do it (-1: whoever can), and the one picked who could not.
  | { type: 'sent'; field: number; kind: JobKind; unit: number; instead?: number }
  | { type: 'alert'; alert: Alert }
  | { type: 'speed'; speed: Speed }
  | { type: 'settings' }
  | { type: 'insets' }
  | { type: 'saved'; ok: boolean }

// The one rule for a game that pauses itself: it does so only where the year waits on the player's own decision and
// loses something if it is missed, in every year, with the tutorial on or off and whatever "Pause on alerts" says.
// "Skip ahead" and every "Fast-forward to ..." key only set the speed, so they stop there too. Nothing else changes
// the speed the player set: a notice that asks nothing (frost forecast on the barrels, which the crew hauls ahead of
// by itself, a job the crew handles, news) is a toast. Every cause, and the decision it waits on:
export const SELF_PAUSES = {
  plantAsk: 'The word to plant: the crew stands ready, and starts on its own three days after the game resumes.',
  killCall: 'A vine kill that is the player\'s to give: they keep these vines up, or the crew does not kill them by itself.',
  spray: 'The season\'s spraying question, at the first blight weather (asked by the season screen).',
  weighed: 'A crop weighed in: sell it now or store it.',
  incident: 'A telegram that needs a reply.',
  over: 'The season is over (the crop is in, or the ground froze): no days are left to run until it is closed out.',
  alerts: 'Only for a player who turned on "Pause on alerts": anything new that needs doing.',
} as const
export type PauseCause = keyof typeof SELF_PAUSES
// The events of a day that pause the game, and the cause each one is.
const STOP_FOR: Record<string, PauseCause> = { weighed: 'weighed', incident: 'incident', freeze: 'over', plantAsk: 'plantAsk', killCall: 'killCall' }
// Why the game paused for a decision made on the land, read after "Paused: ". Resuming is an answer too.
export const PLANT_PAUSE = `the soil is ready. Press a ringed Plant stamp, or resume and your crew starts in ${PLANT_WORD_DAYS} days.`
function killPause(e: GameEvent): string {
  const first = e.text.slice(0, e.text.indexOf('. ') + 1) || e.text
  return `${first.charAt(0).toLowerCase()}${first.slice(1)} Press a ringed Kill vines stamp, or resume and they stay up.`
}
// How long after the game sets the days going by itself a press on pause is read as "go on" (round nine: players
// pressed play 0.5 to 1 s after an answer had already resumed the game, and so paused it).
export const SELF_RESUME_MS = 2000
// Events worth an alert even though they are not warnings.
const NOTABLE = new Set([
  'dug', 'weighed', 'sample', 'skinSet', 'emerged', 'ti', 'mature', 'watch',
  'skillUp', 'hired', 'quit', 'hurt', 'poached', 'incident', 'incidentDone', 'breakdown', 'repaired',
  'felled', 'stumped', 'tiled', 'rocks', 'brushed', 'brushBack', 'building', 'built', 'pondDry', 'frozenInField', 'crewKill',
  'plantAsk', 'plantWord', 'killCall',
])
const ALERTS_KEPT = 24

export class App {
  // The world of the farm being played: its own made-up years, or the record for a farm started in a real year.
  world: World
  // The long record the made-up years are put together from.
  readonly record: World
  campaign: Campaign | null = null
  // Fields the player has selected, in the order they were clicked.
  selection: number[] = []
  // The field under the pointer, or -1.
  hover = -1
  // The person the player has picked to give orders to, or -1 for whoever is free.
  unit = -1
  // Where that person was picked: on the land (their card opens beside them) or from a list (the time book).
  unitFrom: 'land' | 'list' = 'list'
  // What the pointer is over on the land, and the thing (not a person, field or yard) last clicked there.
  pointing: Pointing | null = null
  thing: { thing: Thing; x: number; y: number } | null = null
  // The yard the player has selected to build in or look over: -1 the home yard, -2 the Dufour yard, 0 none.
  yard = 0
  speed: Speed = 0
  settings: Settings
  // How far through the current day the clock is, 0..1, for smooth animation.
  dayProgress = 0
  screen: Screen = 'title'
  // Screen edges covered by the interface, in CSS pixels. The field view keeps the farm inside what is left.
  insets = { top: 0, right: 0, bottom: 0, left: 0 }
  // Why the clock last stopped itself, in the game's words ('' when the player set it).
  pauseReason = ''
  // Which of SELF_PAUSES that was ('' when the player paused, or a tutorial note or a card holds the game).
  pauseCause: PauseCause | '' = ''
  // A pause for a decision on the land that another card came ahead of: made as soon as the game would run again.
  private owed: { cause: 'plantAsk' | 'killCall'; why: string; fields: number[] } | null = null
  // The speed the clock was at when it stopped itself, to go back to once the card is answered.
  resumeSpeed: Speed = 1
  // The most recent alerts, newest last.
  alerts: Alert[] = []
  private nextAlert = 1
  private advised = new Set<string>()
  private listeners = new Set<(e: AppEvent) => void>()
  private dirty = false
  private sinceSave = 0
  // (counts the orders given: what is worked out from the farm is worked out again when it has moved on)
  revision = 0
  private needsAt = -1
  private needsCache: { need: Advice | null; hold: Advice | null }[] = []

  constructor(world: World) {
    this.world = world
    this.record = world
    this.settings = readSettings(DEFAULT_SETTINGS)
    try {
      if (typeof matchMedia === 'function' && localStorage.getItem('the-county/settings') === null) {
        this.settings.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
      }
    } catch { /* storage blocked: play on without saved settings */ }
  }

  on(fn: (e: AppEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(e: AppEvent): void {
    for (const fn of [...this.listeners]) fn(e)
  }

  // The most recently selected field, or -1.
  get selected(): number {
    return this.selection.length ? this.selection[this.selection.length - 1] : -1
  }

  startYears(): number[] {
    return startYears(this.record)
  }

  // A farm started in a real year plays on the record; every other farm gets years of its own from its seed.
  private worldFor(c: Campaign): World {
    return isFarmYear(c.startYear) ? climateWorld(this.record, c.seed) : this.record
  }

  // The neighbor's season is worked out before the player's begins, so news from the road can arrive on its days.
  private meetNeighbor(): void {
    const c = this.campaign
    if (!c || !isFarmYear(c.year) || this.world.neighbor[String(c.year)]) return
    const n = neighborYear(this.world, c.seed, c.year)
    if (n) this.world.neighbor[String(c.year)] = n
  }

  savedGame(): SaveFile | null {
    return readSave()
  }

  // Starts a farm. With no year it is a farm of its own with weather made from its seed; a year plays the record.
  newGame(startYear?: number, seed?: number): void {
    const s = seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] | 0)
    if (startYear === undefined) {
      this.world = climateWorld(this.record, s)
      this.campaign = createCampaign(this.world, { seed: s, startYear: FARM_YEAR0 + 1 })
    } else {
      this.world = this.record
      this.campaign = createCampaign(this.world, { seed: s, startYear })
    }
    this.afterLoad()
  }

  continueGame(): boolean {
    const file = readSave()
    if (!file) return false
    this.campaign = file.campaign
    this.world = this.worldFor(file.campaign)
    this.afterLoad()
    return true
  }

  importSave(text: string): boolean {
    const file = parseSave(text)
    if (!file) return false
    this.campaign = file.campaign
    this.world = this.worldFor(file.campaign)
    this.afterLoad()
    return true
  }

  exportSave(): string {
    return this.campaign ? serialize(this.campaign, Date.now()) : ''
  }

  private afterLoad(): void {
    this.speed = 0
    this.resumeSpeed = 1
    this.pace = 1
    this.pauseReason = ''
    this.pauseCause = ''
    this.owed = null
    this.advised = new Set()
    this.alerts = []
    this.ahead = null
    // (a save taken part way through a day goes on from the last order given in it)
    this.dayProgress = this.campaign!.season?.clock?.at ?? 0
    this.selection = []
    this.unit = -1
    this.yard = 0
    this.revision++
    this.meetNeighbor()
    this.setScreen(this.campaign!.phase)
    this.save()
    this.emit({ type: 'change' })
  }

  quitToTitle(): void {
    this.save()
    this.speed = 0
    this.setScreen('title')
  }

  deleteSave(): void {
    clearSave()
    this.campaign = null
    this.speed = 0
    this.selection = []
    this.setScreen('title')
    this.emit({ type: 'change' })
  }

  private setScreen(screen: Screen): void {
    if (this.screen === screen) return
    this.screen = screen
    // A new spring opens on the plan itself: what was in hand on last year's land is put down.
    if (screen === 'plan') { this.selection = []; this.unit = -1; this.yard = 0 }
    this.emit({ type: 'screen', screen })
  }

  do(cmd: Cmd): Result {
    const c = this.campaign
    if (!c) return { ok: false, err: 'No game in progress.', events: [] }
    // An order given part way through a day is given to a farm that has done the day's work up to that moment: it
    // is worked in what is left of the day.
    const before = NO_WORK.has(cmd.t) ? [] : this.upToNow()
    const r = apply(this.world, c, cmd)
    if (!r.ok) return r
    if (cmd.t === 'next') this.meetNeighbor()
    // A new farm's first season opens close to planting (the owner, 14 November: "start the player closer to when
    // the ground is ready for planting on a new game"): the weeks before it, in which a first-year farm has nothing
    // to do, are gone through at once. (A farm started in a year of the record, as the tests and tools start them,
    // opens on the season's first day.)
    if (cmd.t === 'begin' && QUIET_S && c.history.length === 0 && this.world !== this.record) {
      for (let n = 0; n < 60 && c.phase === 'season' && c.season && c.season.plantAsk === undefined && plantingIn(this.world, c) > OPEN_BEFORE_PLANTING; n++) {
        apply(this.world, c, { t: 'day' })
      }
    }
    // The last question answered, however it was answered: the days go on at the speed they had.
    if (cmd.t === 'answer' && !c.incidents.length) { this.holding = ''; this.resumeAfterCard() }
    if (cmd.t === 'job') this.answered(cmd.kind)
    this.dirty = true
    this.revision++
    for (const e of r.events) if (e.level !== 'info' || NOTABLE.has(e.type)) this.alert(c, e)
    this.ahead = null
    if (cmd.t === 'day') {
      this.emit({ type: 'events', events: r.events, dayPassed: true })
      this.paceAfterDay(c, r.events)
    } else if (cmd.t === 'work') {
      if (r.events.length) this.emit({ type: 'events', events: r.events, dayPassed: false })
      this.paceAfterDay(c, [...before, ...r.events])
    } else {
      if (r.events.length) this.emit({ type: 'events', events: r.events, dayPassed: false })
      if (before.length) this.paceAfterDay(c, before)
    }
    if (c.phase !== this.screen && this.screen !== 'title') {
      this.halt('over', '')
      this.setScreen(c.phase)
      this.save()
    }
    this.emit({ type: 'change' })
    return r
  }

  // Brings the farm up to this moment of a day already begun: the crews' work so far today is done. What it brought.
  private upToNow(): GameEvent[] {
    const c = this.campaign, s = c?.season
    if (!c || c.phase !== 'season' || !s?.clock || this.dayProgress <= s.clock.at + 0.002) return []
    const events = apply(this.world, c, { t: 'work', to: Math.min(1, this.dayProgress) }).events
    this.revision++
    this.ahead = null
    if (events.length) {
      for (const e of events) if (e.level !== 'info' || NOTABLE.has(e.type)) this.alert(c, e)
      this.emit({ type: 'events', events, dayPassed: false })
    }
    return events
  }

  private alert(c: Campaign, e: GameEvent): void {
    const a: Alert = { id: this.nextAlert++, year: c.year, day: e.day, field: e.field, level: e.level, type: e.type, text: e.text, data: e.data }
    this.alerts.push(a)
    if (this.alerts.length > ALERTS_KEPT) this.alerts.splice(0, this.alerts.length - ALERTS_KEPT)
    this.emit({ type: 'alert', alert: a })
  }

  // After a day: a decision that waits on the player pauses the game (SELF_PAUSES), and so does the season's end.
  // Anything else new that needs doing is said where the player looks, and pauses only for a player who asked for that.
  private paceAfterDay(c: Campaign, events: GameEvent[]): void {
    const fresh = this.freshNeeds(c)
    if (this.speed === 0) return
    for (const e of events) {
      if (e.type === 'plantAsk') this.owed = { cause: 'plantAsk', why: PLANT_PAUSE, fields: [] }
      else if (e.type === 'killCall') this.owed = { cause: 'killCall', why: killPause(e), fields: Array.isArray(e.data?.fields) ? e.data.fields : [e.field] }
    }
    const decision = events.find(e => STOP_FOR[e.type] && e.type !== 'plantAsk' && e.type !== 'killCall')
    if (seasonDone(c)) this.halt('over', 'The season is over.')
    else if (decision) this.halt(STOP_FOR[decision.type], decision.text)
    else if (this.owed) this.pauseOwed(c)
    else if (this.settings.pauseOnAlerts) {
      const trouble = events.find(e => e.level === 'bad' || e.level === 'warn')
      const why = trouble ? trouble.text : fresh[0]?.text ?? ''
      if (why) this.halt('alerts', why)
    }
  }

  // The pause a decision on the land is owed, unless the decision has been made since. True when the game paused.
  private pauseOwed(c: Campaign): boolean {
    const o = this.owed
    this.owed = null
    const s = c.season
    if (!o || !s || this.speed === 0 || seasonDone(c)) return false
    const waits = o.cause === 'plantAsk' ? !plantWordGiven(s)
      : o.fields.some(i => s.fields[i]?.status === 'growing' && s.fields[i].deadDay < 0 && !s.jobs.some(j => j.kind === 'kill' && j.field === i))
    if (waits) this.halt(o.cause, o.why)
    return waits
  }

  // The player gave the order a pause was waiting for: the pause is their own now, and stays until they resume.
  private answered(kind: JobKind): void {
    if (!(this.pauseCause === 'plantAsk' && kind === 'plant') && !(this.pauseCause === 'killCall' && kind === 'kill')) return
    this.pauseReason = ''
    this.pauseCause = ''
    this.emit({ type: 'speed', speed: this.speed })
  }

  private halt(cause: PauseCause, why: string): void {
    if (this.speed === 0) return
    // "Skip ahead" skips the waiting, not the work it was waiting for: at the decision it skipped to, the way on is at
    // the speed the player had before. A telegram or a weigh ticket on the way does not end the skip.
    const landed = this.skipBack > 0 && (cause === 'plantAsk' || cause === 'killCall' || cause === 'spray' || cause === 'over')
    this.resumeSpeed = landed ? this.skipBack : this.speed
    if (landed) this.skipBack = 0
    this.speed = 0
    this.pauseReason = why
    this.pauseCause = cause
    this.emit({ type: 'speed', speed: 0 })
  }

  // Once the card the clock stopped for is answered, the days go on at the speed they had. A clock the player stopped
  // stays stopped.
  // Stops the clock for a question the interface asks (the season's spraying, a weigh ticket): answered or put away,
  // it goes on.
  stopFor(why: string, cause: 'spray' | 'weighed' = 'spray'): void {
    if (this.speed > 0) this.halt(cause, why)
  }

  resumeAfterCard(): void {
    if (this.screen !== 'season' || this.speed !== 0 || this.pauseReason === '') return
    const c = this.campaign
    if (!c || seasonDone(c)) return
    const skip = this.skipBack
    this.setSpeed(this.resumeSpeed || 1)
    this.skipBack = skip
    this.resumedAt = performance.now()
  }

  // What reference practice now wants that it did not want yesterday: each kind of order said once, as an alert that
  // takes the player to the first field it is for. Scouting and test digs come round too often to be news.
  private freshNeeds(c: Campaign): Advice[] {
    if (c.phase !== 'season') return []
    // (the planting that waits for the player's word is said by the crew itself: plantAsk)
    const now = this.needs().map(n => n.need).filter((a): a is Advice => !!a && a.act !== 'scout' && a.act !== 'sample' && a.act !== 'close' && !(a.act === 'plant' && awaitsWord(c, 'plant', a.field)))
    const fresh = now.filter(a => !this.advised.has(a.id))
    this.advised = new Set(now.map(a => a.id))
    const byAct = new Map<string, Advice[]>()
    for (const a of fresh) byAct.set(a.act, [...(byAct.get(a.act) ?? []), a])
    for (const [act, list] of byAct) {
      const a = list[0]
      this.alert(c, { day: c.season?.day ?? 0, type: 'need', field: a.field, level: a.urgent ? 'warn' : 'info', text: a.text, data: { act, fields: list.map(x => x.field) } })
    }
    return fresh
  }

  // What each field needs now under reference practice (need), or why it is being left alone (hold).
  needs(): { need: Advice | null; hold: Advice | null }[] {
    const c = this.campaign
    if (!c) return []
    if (this.needsAt !== this.revision) {
      this.needsCache = fieldNeeds(this.world, c)
      this.needsAt = this.revision
    }
    return this.needsCache
  }

  setInsets(top: number, right: number, bottom: number, left: number): void {
    const i = this.insets
    if (i.top === top && i.right === right && i.bottom === bottom && i.left === left) return
    this.insets = { top, right, bottom, left }
    this.emit({ type: 'insets' })
  }

  // ---------------------------------------------------------------- selection

  // Selects one field, or with add toggles it in the selection. -1 clears.
  select(field: number, add = false): void {
    let next: number[]
    if (field < 0) next = []
    else if (!add) next = [field]
    else next = this.selection.includes(field) ? this.selection.filter(f => f !== field) : [...this.selection, field]
    this.setSelection(next)
  }

  // Selects every field in the same state as this one: same crop, same stage of the season.
  selectLike(field: number): void {
    const c = this.campaign
    if (!c || field < 0) return
    const of = (i: number) => { const f = fieldInfo(c, i); return `${f.crop}|${f.status}` }
    const key = of(field)
    const all = c.fields.map((_, i) => i).filter(i => c.fields[i].tenure !== 'none' && of(i) === key)
    this.setSelection([...all.filter(i => i !== field), field])
  }

  private setSelection(next: number[]): void {
    if (next.length && this.yard !== 0) this.selectYard(0)
    if (next.length === this.selection.length && next.every((f, k) => f === this.selection[k])) return
    this.selection = next
    this.emit({ type: 'select', field: this.selected, fields: next })
  }

  // Picks a crew: orders given while it is picked go to that crew. -1 lets any free crew take them.
  selectUnit(unit: number, from: 'land' | 'list' = 'list'): void {
    if (this.unit === unit && (unit < 0 || this.unitFrom === from)) return
    this.unit = unit
    this.unitFrom = from
    if (unit >= 0) this.thing = null
    this.emit({ type: 'unit', unit })
  }

  // The pointer over the land: what is under it, for names and marks before a click.
  point(p: Pointing | null): void {
    const a = this.pointing
    if (a === p || (a && p && a.unit === p.unit && a.field === p.field && a.yard === p.yard && a.thing?.kind === p.thing?.kind && a.thing?.k === p.thing?.k && Math.abs(a.x - p.x) < 1 && Math.abs(a.y - p.y) < 1)) return
    this.pointing = p
    this.emit({ type: 'point' })
  }

  // Something said back to the player about what they just did on the land (an order refused, and why).
  notice(text: string): void {
    this.emit({ type: 'notice', text })
  }

  // A thing on the land clicked (its name card opens beside it), or null to put that card away.
  inspect(thing: Thing | null, x = 0, y = 0): void {
    if (!thing && !this.thing) return
    this.thing = thing ? { thing, x, y } : null
    this.emit({ type: 'inspect' })
  }

  // Selects a yard (-1 home, -2 Dufour), where buildings are ordered; 0 clears. Fields and a yard are not held at once.
  selectYard(yard: number): void {
    if (this.yard === yard) return
    this.yard = yard
    if (yard !== 0) this.setSelection([])
    this.emit({ type: 'yard', yard })
  }

  setHover(field: number): void {
    if (this.hover === field) return
    this.hover = field
    this.emit({ type: 'hover', field })
  }

  // Asks the field view to bring a field into frame (-1: the whole farm).
  focus(field: number): void {
    this.emit({ type: 'focus', field })
  }

  // ---------------------------------------------------------------- orders

  // Gives an order to the selected fields (or the ones named). It reaches every field that can take it.
  // With a crew picked (or named) the order is that crew's; otherwise any crew able to do it takes it.
  order(kind: JobKind, opts: { fields?: number[]; first?: boolean; unit?: number } = {}): OrderResult[] {
    const c = this.campaign
    const fields = opts.fields ?? this.selection
    const out: OrderResult[] = []
    if (!c) return out
    const taken: number[] = []
    // (given part way through a day: to a farm that has done the day's work up to now)
    const before = fields.length ? this.upToNow() : []
    for (const field of fields) {
      const unit = opts.unit ?? this.unit
      const r = apply(this.world, c, unit >= 0 ? { t: 'job', kind, field, unit } : { t: 'job', kind, field })
      out.push({ field, ok: r.ok, err: r.err })
      if (!r.ok) continue
      taken.push(field)
      // What an order sets off is said (the word to plant: "Your crew will plant the other 3 fields too").
      for (const e of r.events) if (e.level !== 'info' || NOTABLE.has(e.type)) this.alert(c, e)
      this.answered(kind)
      const jobs = c.season?.jobs ?? []
      if (opts.first && jobs.length) apply(this.world, c, { t: 'bump', id: jobs[jobs.length - 1].id })
    }
    if (taken.length || before.length) {
      this.dirty = true
      this.revision++
      this.ahead = null
      if (taken.length) this.emit({ type: 'order', kind, fields: taken })
      this.emit({ type: 'change' })
    }
    if (before.length) this.paceAfterDay(c, before)
    return out
  }

  // A stamp's order: the one reference practice has for the field now. It goes to the person picked when they can do it,
  // and otherwise on the work list for whoever can; either way the answer says who.
  smartOrder(field: number): OrderResult {
    const c = this.campaign
    const need = this.needs()[field]?.need
    const picked = this.unit >= 0 && !!c?.season
    if (!need || need.act === 'sell' || need.act === 'close' || need.act === 'wait') {
      if (picked) return this.sendTo(field, this.unit)
      return { field, ok: false, err: need ? need.text : this.needs()[field]?.hold?.why ?? 'Nothing needs doing here right now.' }
    }
    const kind = need.act
    const instead = picked && unitBlock(c!, kind, this.unit) ? this.unit : -1
    const unit = picked && instead < 0 ? this.unit : -1
    const r = this.order(kind, { fields: [field], unit })[0]
    if (r.ok) this.emit({ type: 'sent', field, kind, unit, ...(instead >= 0 ? { instead } : {}) })
    return r
  }

  // The frost warning pressed: the haul of a field's barrels first, today, and the answer says who and how much.
  haulAhead(field: number): void {
    const r = this.do({ t: 'haulNow', field })
    this.notice(r.ok ? r.events[0]?.text ?? '' : r.err)
  }

  // A right-click (or a long press) on a field: with someone picked, an order to them; otherwise the field's own order.
  // With nobody picked and nothing to order, the answer also says how to send someone.
  orderAt(field: number): OrderResult {
    const picked = this.unit >= 0 && !!this.campaign?.season
    const r = picked ? this.sendTo(field, this.unit) : this.smartOrder(field)
    if (r.ok) return r
    const err = this.tooEarly(field) || r.err
    return { ...r, err: picked || this.campaign?.phase !== 'season' ? err : `${err} To send someone here, select them first.` }
  }

  // Why a field that is to grow potatoes cannot be planted yet, or '': the season has not begun, or the soil is cold.
  private tooEarly(field: number): string {
    const c = this.campaign
    if (!c || c.plans[field]?.crop !== 'potato' || !held(c, field)) return ''
    const name = FIELD_NAMES[field]
    if (c.phase === 'plan') return `It's too early to plant ${name}. Planting starts once the season does.`
    if (c.phase !== 'season' || fieldInfo(c, field).status !== 'idle') return ''
    const pr = plantReady(this.world, c, field)
    if (pr.ok) return ''
    return `It's too early to plant ${name}. ${pr.why.startsWith('It\'s too early.') ? 'Seed just sits and rots in cold ground.' : pr.why}`
  }

  // The most useful work a field has now that this person can do, given to them: the suggested order, then work on the
  // list nobody is named for, then what the routine would put on the list. Otherwise why not, in one sentence.
  private sendTo(field: number, unit: number): OrderResult {
    const c = this.campaign!
    const s = c.season!
    const { need, hold } = this.needs()[field] ?? { need: null, hold: null }
    const job = (a: Advice | null): a is Advice & { act: JobKind } => !!a && a.act !== 'wait' && a.act !== 'sell' && a.act !== 'close'
    const tries: { kind: JobKind; id?: number }[] = [
      ...(job(need) ? [{ kind: need.act }] : []),
      ...s.jobs.filter(j => j.field === field && j.unit < 0 && j.kind !== 'build').map(j => ({ kind: j.kind, id: j.id })),
      ...advise(this.world, c).filter(a => a.field === field && job(a) && a.act !== need?.act).map(a => ({ kind: a.act as JobKind })),
    ]
    let err = ''
    for (const t of tries) {
      const r = t.id !== undefined ? this.do({ t: 'assign', id: t.id, unit }) : this.order(t.kind, { fields: [field], unit })[0]
      if (r.ok) {
        this.emit({ type: 'sent', field, kind: t.kind, unit })
        return { field, ok: true, err: '' }
      }
      err ||= r.err
    }
    const named = s.jobs.find(j => j.field === field && j.unit >= 0 && j.kind !== 'build')
    const who = named ? c.crew.find(u => u.id === named.unit) : undefined
    const has = !who ? '' : who.kind === 'farmer' ? 'You already have' : who.id === unit ? 'They already have' : `${who.name.split(' ')[0]} already has`
    if (!err && has) err = `${has} this field's work on the work list.`
    return { field, ok: false, err: err || (need ? need.text : hold?.why ?? 'Nothing needs doing here right now.') }
  }

  // ---------------------------------------------------------------- the clock

  // Why the clock may not run now (a card that wants an answer), or ''. Set by the interface.
  holding = ''

  setSpeed(speed: Speed): void {
    if (speed > 0 && this.holding) {
      this.pauseReason = this.holding
      this.emit({ type: 'speed', speed: this.speed })
      return
    }
    this.pauseReason = ''
    this.pauseCause = ''
    // (a speed the player sets is theirs: it ends a skip)
    this.skipBack = 0
    if (this.speed === speed) return
    this.speed = speed
    this.emit({ type: 'speed', speed })
  }

  // Whether the time now going by has no work in it: nobody works today, or today's last work is done.
  hurrying = false
  private quietNow(c: Campaign): boolean {
    if (!QUIET_S || !c.season?.clock) return false
    const log = this.today()?.season?.clock?.log
    if (!log) return false
    let last = -1
    for (const x of log) if (x.to > last) last = x.to
    // (someone on the way to work that begins later today is before the last of it; the evening after it, a moment's grace)
    return this.dayProgress > last + 0.012
  }

  // How long a day of work takes at the speed the clock is at (or, paused, would go on at), in seconds.
  daySeconds(): number {
    return 1 / (DAYS_PER_SECOND[this.speed || this.resumeSpeed || 1] * this.pace)
  }

  // Today as it goes on from here if no new order comes: a copy of the farm with the day's work done to the evening
  // (the night not yet come). What the land shows being done through the day is read from it. Null out of a season.
  private ahead: { rev: number; c: Campaign; events: GameEvent[] } | null = null
  today(): Campaign | null {
    const c = this.campaign
    if (!c || c.phase !== 'season' || !c.season || c.season.frozen || seasonDone(c)) return null
    if (this.ahead && this.ahead.rev === this.revision) return this.ahead.c
    const copy = structuredClone(c)
    const r = apply(this.world, copy, { t: 'work', to: 1 })
    this.ahead = { rev: this.revision, c: copy, events: r.events }
    return copy
  }
  // What the rest of today will bring (a test dig's hill, a field planted), for the land to show as it happens.
  todayEvents(): GameEvent[] {
    return this.today() && this.ahead ? this.ahead.events : []
  }

  // "Skip ahead": the fastest speed until the next decision on the land, then back to the speed the clock had.
  skipBack: Speed | 0 = 0
  skipAhead(): void {
    const back = (this.speed > 0 ? this.speed : this.resumeSpeed || 1) as Speed
    this.setSpeed(3)
    this.skipBack = back >= 3 ? 1 : back
  }

  // Space: stop, or go on at the speed the clock last ran at.
  togglePause(): void {
    if (this.speed > 0) { this.resumeSpeed = this.speed; this.setSpeed(0) } else this.setSpeed(this.resumeSpeed || 1)
  }

  // A press on pause (Space, the clock's key, the "Running" chip). Just after the game set the days going by itself
  // (a card answered, a paper put away, the guide's clock) the press was meant as "go on": it is not taken as a
  // pause, and the answer is false. Only the first such press: the next one pauses.
  pressPause(): boolean {
    if (this.speed > 0 && performance.now() - this.resumedAt < SELF_RESUME_MS) { this.resumedAt = 0; return false }
    this.togglePause()
    return true
  }

  // The next speed up, coming round from 3x to 1x.
  cycleSpeed(): void {
    this.setSpeed((this.speed === 0 ? this.resumeSpeed || 1 : this.speed % 3 + 1) as Speed)
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value
    writeSettings(this.settings)
    this.emit({ type: 'settings' })
  }

  // How many times faster than its speed the clock runs: 1 but while the tutorial carries the player past days that
  // teach nothing (src/ui/tutorial.ts). Every pause the game makes itself stops it all the same.
  pace = 1
  // While a pointer is held down on the land (a drag, a press on a stamp) the days wait, so nothing is lost to it.
  pressing = false
  // When the game last set the days going by itself (performance.now()), so a press on pause just after it is not
  // taken back.
  resumedAt = 0

  tick(dtMs: number): void {
    const c = this.campaign
    if (c && this.screen === 'season' && this.speed > 0 && c.season && !seasonDone(c) && !this.pressing) {
      if (this.owed && this.pauseOwed(c)) return
      // The morning: the day's standing orders are given as the day begins, not when it is over.
      if (!c.season.clock) { this.do({ t: 'work', to: 0 }); if (this.speed === 0 || !c.season || seasonDone(c)) return }
      // (time with no work in it goes by quickly: a day nobody works, and the rest of a day once its work is done)
      const quiet = this.quietNow(c)
      this.hurrying = quiet
      this.dayProgress += (Math.min(dtMs, 250) / 1000) * (quiet ? 1 / QUIET_S![this.speed] : DAYS_PER_SECOND[this.speed] * this.pace)
      // A long day is counted as it goes: by the hour (a working day has eleven) the farm's own count has the work
      // done so far, so the work list, a person's card and what the day brings (a field planted, barrels to haul)
      // keep up with what is seen; and a test dig is answered the moment the day as it will go has it done.
      if (this.daySeconds() >= LONG_DAY_S && this.dayProgress < 1) {
        const at = c.season.clock?.at ?? 0
        const ahead = this.ahead && this.ahead.rev === this.revision ? this.ahead.c.season?.clock?.log : undefined
        const dug = !!ahead && ahead.some(x => x.kind === 'sample' && x.to > at + 1e-4 && x.to <= this.dayProgress)
        if (dug || (!quiet && Math.floor(this.dayProgress * DAY_HOURS) / DAY_HOURS > at + 1e-6)) {
          const events = this.upToNow()
          this.dirty = true
          this.emit({ type: 'change' })
          this.paceAfterDay(c, events)
          if (this.speed === 0) return
        }
      }
      let guard = 0
      while (this.dayProgress >= 1 && guard++ < 3 && this.speed > 0) {
        this.dayProgress -= 1
        this.do({ t: 'day' })
      }
      // (a day's turn that paused the game: the next day begins at its beginning)
      if (this.speed === 0) this.dayProgress = 0
    }
    this.sinceSave += dtMs
    // (with the clock running, well into a day: never in the frames a day's turn is drawn over)
    if (this.dirty && this.sinceSave > 2500 && (this.speed === 0 || this.dayProgress > 0.4 || this.sinceSave > 8000)) this.save()
  }

  save(): void {
    if (!this.campaign) return
    this.dirty = false
    this.sinceSave = 0
    this.emit({ type: 'saved', ok: writeSave(this.campaign) })
  }
}
