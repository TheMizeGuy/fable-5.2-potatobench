// The running game: owns the campaign, the clock, the selection and the orders, saving, and tells the views what changed.
import {
  advise, apply, climateWorld, createCampaign, fieldInfo, fieldNeeds, isFarmYear, seasonDone, startYears, unitBlock, FARM_YEAR0,
  type Advice, type Campaign, type Cmd, type GameEvent, type JobKind, type Phase, type Result, type World,
} from '../sim/index.ts'
import type { Pointing, Thing } from './contracts.ts'
import { neighborYear } from './neighbor.ts'
import { clearSave, parseSave, readSave, readSettings, serialize, writeSave, writeSettings, type SaveFile } from './save.ts'

export type Speed = 0 | 1 | 2 | 3
// Pause and three speeds, as a strategy game has them: at the first a day takes four seconds, time to watch the
// people work and give the next order; the second is three times that; at the third a season goes by in under two
// minutes. Each is named for what it really is against the first.
export const DAYS_PER_SECOND = [0, 0.25, 0.75, 2]
export const SPEED_X = ['', '1×', '3×', '8×']

export type Quality = 'auto' | 'high' | 'medium' | 'low'

export interface Settings {
  units: 'us' | 'metric'
  sound: boolean
  volume: number
  reducedMotion: boolean
  hints: boolean            // the one-line tips that come with a badge the first time
  pauseOnAlerts: boolean    // stop the clock when something new needs the player (off: the speed set is the speed it runs)
  quality: Quality
}

const DEFAULT_SETTINGS: Settings = { units: 'us', sound: true, volume: 0.6, reducedMotion: false, hints: true, pauseOnAlerts: false, quality: 'auto' }

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

// A card that needs an answer stops the clock whatever the settings say: a crop weighed in (sell or store), an
// incident that asks for an answer, the freeze. Nothing else changes the speed the player set: a notice that asks
// nothing (frost forecast on the barrels, which the crew hauls ahead of by itself) is a toast, and pauses only for a
// player who turned on "Pause on alerts".
const STOP_FOR = new Set(['weighed', 'incident', 'freeze'])
// Events worth an alert even though they are not warnings.
const NOTABLE = new Set([
  'dug', 'weighed', 'sample', 'skinSet', 'emerged', 'ti', 'mature', 'watch',
  'skillUp', 'hired', 'quit', 'hurt', 'poached', 'incident', 'incidentDone', 'breakdown', 'repaired',
  'felled', 'stumped', 'tiled', 'rocks', 'brushed', 'brushBack', 'building', 'built', 'pondDry', 'frozenInField',
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
  // The speed the clock was at when it stopped itself, to go back to once the card is answered.
  resumeSpeed: Speed = 1
  // The most recent alerts, newest last.
  alerts: Alert[] = []
  private nextAlert = 1
  private advised = new Set<string>()
  private listeners = new Set<(e: AppEvent) => void>()
  private dirty = false
  private sinceSave = 0
  private revision = 0
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
    this.pauseReason = ''
    this.advised = new Set()
    this.alerts = []
    this.dayProgress = 0
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
    this.emit({ type: 'screen', screen })
  }

  do(cmd: Cmd): Result {
    const c = this.campaign
    if (!c) return { ok: false, err: 'No game in progress.', events: [] }
    const r = apply(this.world, c, cmd)
    if (!r.ok) return r
    if (cmd.t === 'next') this.meetNeighbor()
    // The last question answered, however it was answered: the days go on at the speed they had.
    if (cmd.t === 'answer' && !c.incidents.length) { this.holding = ''; this.resumeAfterCard() }
    this.dirty = true
    this.revision++
    for (const e of r.events) if (e.level !== 'info' || NOTABLE.has(e.type)) this.alert(c, e)
    if (cmd.t === 'day') {
      this.emit({ type: 'events', events: r.events, dayPassed: true })
      this.paceAfterDay(c, r.events)
    } else if (r.events.length) {
      this.emit({ type: 'events', events: r.events, dayPassed: false })
    }
    if (c.phase !== this.screen && this.screen !== 'title') {
      this.halt('')
      this.setScreen(c.phase)
      this.save()
    }
    this.emit({ type: 'change' })
    return r
  }

  private alert(c: Campaign, e: GameEvent): void {
    const a: Alert = { id: this.nextAlert++, year: c.year, day: e.day, field: e.field, level: e.level, type: e.type, text: e.text, data: e.data }
    this.alerts.push(a)
    if (this.alerts.length > ALERTS_KEPT) this.alerts.splice(0, this.alerts.length - ALERTS_KEPT)
    this.emit({ type: 'alert', alert: a })
  }

  // After a day: a card that needs an answer stops the clock, and so does the season's end. Anything new that needs
  // doing is said where the player looks, and stops the clock only for a player who asked for that.
  private paceAfterDay(c: Campaign, events: GameEvent[]): void {
    const fresh = this.freshNeeds(c)
    if (this.speed === 0) return
    const decision = events.find(e => STOP_FOR.has(e.type))
    if (seasonDone(c)) this.halt('The season is over.')
    else if (decision) this.halt(decision.text)
    else if (this.settings.pauseOnAlerts) {
      const trouble = events.find(e => e.level === 'bad' || e.level === 'warn')
      const why = trouble ? trouble.text : fresh[0]?.text ?? ''
      if (why) this.halt(why)
    }
  }

  private halt(why: string): void {
    this.dayProgress = 0
    if (this.speed === 0) return
    this.resumeSpeed = this.speed
    this.speed = 0
    this.pauseReason = why
    this.emit({ type: 'speed', speed: 0 })
  }

  // Once the card the clock stopped for is answered, the days go on at the speed they had. A clock the player stopped
  // stays stopped.
  // Stops the clock for a question the interface asks (the season's spraying): answered or put away, it goes on.
  stopFor(why: string): void {
    if (this.speed > 0) this.halt(why)
  }

  resumeAfterCard(): void {
    if (this.screen !== 'season' || this.speed !== 0 || this.pauseReason === '') return
    const c = this.campaign
    if (!c || seasonDone(c)) return
    this.setSpeed(this.resumeSpeed || 1)
    this.resumedAt = performance.now()
  }

  // What reference practice now wants that it did not want yesterday: each kind of order said once, as an alert that
  // takes the player to the first field it is for. Scouting and test digs come round too often to be news.
  private freshNeeds(c: Campaign): Advice[] {
    if (c.phase !== 'season') return []
    const now = this.needs().map(n => n.need).filter((a): a is Advice => !!a && a.act !== 'scout' && a.act !== 'sample' && a.act !== 'close')
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
    for (const field of fields) {
      const unit = opts.unit ?? this.unit
      const r = apply(this.world, c, unit >= 0 ? { t: 'job', kind, field, unit } : { t: 'job', kind, field })
      out.push({ field, ok: r.ok, err: r.err })
      if (!r.ok) continue
      taken.push(field)
      const jobs = c.season?.jobs ?? []
      if (opts.first && jobs.length) apply(this.world, c, { t: 'bump', id: jobs[jobs.length - 1].id })
    }
    if (taken.length) {
      this.dirty = true
      this.revision++
      this.emit({ type: 'order', kind, fields: taken })
      this.emit({ type: 'change' })
    }
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
  orderAt(field: number): OrderResult {
    return this.unit >= 0 && this.campaign?.season ? this.sendTo(field, this.unit) : this.smartOrder(field)
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
    if (this.speed === speed) return
    this.speed = speed
    if (speed === 0) this.dayProgress = 0
    this.emit({ type: 'speed', speed })
  }

  // Space: stop, or go on at the speed the clock last ran at.
  togglePause(): void {
    if (this.speed > 0) { this.resumeSpeed = this.speed; this.setSpeed(0) } else this.setSpeed(this.resumeSpeed || 1)
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

  // While a pointer is held down on the land (a drag, a press on a stamp) the days wait, so nothing is lost to it.
  pressing = false
  // When an answer last set the days going again (performance.now()), so a Space just after it is not taken back.
  resumedAt = 0

  tick(dtMs: number): void {
    const c = this.campaign
    if (c && this.screen === 'season' && this.speed > 0 && c.season && !seasonDone(c) && !this.pressing) {
      this.dayProgress += (Math.min(dtMs, 250) / 1000) * DAYS_PER_SECOND[this.speed]
      let guard = 0
      while (this.dayProgress >= 1 && guard++ < 3 && this.speed > 0) {
        this.dayProgress -= 1
        this.do({ t: 'day' })
      }
      if (this.speed === 0) this.dayProgress = 0
    }
    this.sinceSave += dtMs
    if (this.dirty && this.sinceSave > 2500) this.save()
  }

  save(): void {
    if (!this.campaign) return
    this.dirty = false
    this.sinceSave = 0
    this.emit({ type: 'saved', ok: writeSave(this.campaign) })
  }
}
