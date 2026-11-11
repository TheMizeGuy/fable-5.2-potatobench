// The running game: owns the campaign, the clock, saving, and tells the views when something changed.
import { apply, createCampaign, seasonDone, startYears, type Campaign, type Cmd, type GameEvent, type Phase, type Result, type World } from '../sim/index.ts'
import { clearSave, parseSave, readSave, readSettings, serialize, writeSave, writeSettings, type SaveFile } from './save.ts'

export type Speed = 0 | 1 | 2 | 3
export const DAYS_PER_SECOND = [0, 0.8, 2.5, 8]

export interface Settings {
  units: 'us' | 'metric'
  sound: boolean
  volume: number
  reducedMotion: boolean
  hints: boolean
  autoPause: boolean
}

const DEFAULT_SETTINGS: Settings = { units: 'us', sound: true, volume: 0.6, reducedMotion: false, hints: true, autoPause: true }

export type Screen = 'title' | Phase

export type AppEvent =
  | { type: 'change' }
  | { type: 'events'; events: GameEvent[]; dayPassed: boolean }
  | { type: 'screen'; screen: Screen }
  | { type: 'select'; field: number }
  | { type: 'speed'; speed: Speed }
  | { type: 'settings' }
  | { type: 'insets' }
  | { type: 'saved'; ok: boolean }

// Events that stop the clock so the player can respond.
const PAUSE_ON = new Set(['watch', 'blightSeen', 'frost', 'dug', 'skinSet', 'vinesDead', 'lost', 'freeze', 'sample', 'dry', 'ti'])

export class App {
  readonly world: World
  campaign: Campaign | null = null
  selected = -1
  speed: Speed = 0
  settings: Settings
  // How far through the current day the clock is, 0..1, for smooth animation.
  dayProgress = 0
  screen: Screen = 'title'
  // Screen edges covered by interface panels, in CSS pixels. The field view keeps the farm inside what is left.
  insets = { top: 0, right: 0, bottom: 0, left: 0 }
  private listeners = new Set<(e: AppEvent) => void>()
  private dirty = false
  private sinceSave = 0

  constructor(world: World) {
    this.world = world
    this.settings = readSettings(DEFAULT_SETTINGS)
    if (typeof matchMedia === 'function' && localStorage.getItem('the-county/settings') === null) {
      this.settings.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    }
  }

  on(fn: (e: AppEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(e: AppEvent): void {
    for (const fn of [...this.listeners]) fn(e)
  }

  startYears(): number[] {
    return startYears(this.world)
  }

  savedGame(): SaveFile | null {
    return readSave()
  }

  newGame(startYear: number, seed?: number): void {
    const s = seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] | 0)
    this.campaign = createCampaign(this.world, { seed: s, startYear })
    this.afterLoad()
  }

  continueGame(): boolean {
    const file = readSave()
    if (!file) return false
    this.campaign = file.campaign
    this.afterLoad()
    return true
  }

  importSave(text: string): boolean {
    const file = parseSave(text)
    if (!file) return false
    this.campaign = file.campaign
    this.afterLoad()
    return true
  }

  exportSave(): string {
    return this.campaign ? serialize(this.campaign, Date.now()) : ''
  }

  private afterLoad(): void {
    this.speed = 0
    this.dayProgress = 0
    this.selected = -1
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
    this.dirty = true
    if (cmd.t === 'day') {
      this.emit({ type: 'events', events: r.events, dayPassed: true })
      if (this.settings.autoPause && r.events.some(e => PAUSE_ON.has(e.type) || e.level === 'bad')) this.setSpeed(0)
      if (seasonDone(c)) this.setSpeed(0)
    } else if (r.events.length) {
      this.emit({ type: 'events', events: r.events, dayPassed: false })
    }
    if (c.phase !== this.screen && this.screen !== 'title') {
      this.setSpeed(0)
      this.setScreen(c.phase)
      this.save()
    }
    this.emit({ type: 'change' })
    return r
  }

  setInsets(top: number, right: number, bottom: number, left: number): void {
    const i = this.insets
    if (i.top === top && i.right === right && i.bottom === bottom && i.left === left) return
    this.insets = { top, right, bottom, left }
    this.emit({ type: 'insets' })
  }

  select(field: number): void {
    if (this.selected === field) return
    this.selected = field
    this.emit({ type: 'select', field })
  }

  setSpeed(speed: Speed): void {
    if (this.speed === speed) return
    this.speed = speed
    this.emit({ type: 'speed', speed })
  }

  togglePause(): void {
    this.setSpeed(this.speed === 0 ? 1 : 0)
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value
    writeSettings(this.settings)
    this.emit({ type: 'settings' })
  }

  tick(dtMs: number): void {
    const c = this.campaign
    if (c && this.screen === 'season' && this.speed > 0 && c.season && !seasonDone(c)) {
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
