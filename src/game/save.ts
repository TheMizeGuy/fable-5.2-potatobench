// Browser-local saves. Every save carries a version; migrate() brings an old one forward.
import { applicantsFor, HOME_FIELDS, PARCELS, SAVE_VERSION, upgradePerson, type Campaign } from '../sim/index.ts'

const KEY = 'the-county/save'
const SETTINGS_KEY = 'the-county/settings'

export interface SaveFile { v: number; savedAt: number; campaign: Campaign }

type Migration = (c: Record<string, unknown>) => void
// One entry per version step: MIGRATIONS[n] turns a version n campaign into version n + 1.
const MIGRATIONS: Record<number, Migration> = {
  // Version 2 added the year's rest income and storage bill, the grower's by-eye expectation, and seed blight.
  1: c => {
    c.yearRest ??= 0
    c.yearStorage ??= 0
    for (const h of (c.history as Record<string, unknown>[] | undefined) ?? []) { h.restIncome ??= 0; h.storage ??= 0 }
    for (const l of (c.lots as Record<string, unknown>[] | undefined) ?? []) l.aged ??= l.dugDay
    const season = c.season as { fields?: Record<string, unknown>[] } | null
    for (const f of season?.fields ?? []) {
      const mass = Array.isArray(f.hMass) ? (f.hMass as number[]).reduce((a, b) => a + b, 0) : 0
      f.eye ??= mass
      f.seedBlight ??= 0
      f.frostDay ??= -1
      f.frostShare ??= 0
      f.rimeDay ??= -1
      f.sampleN ??= []
      f.samples = []
      f.sampleN = []
    }
  },
  // Version 3 added the land beyond the home six, the crew, contracts, two pieces of equipment and their books.
  2: c => {
    const fields = (c.fields as Record<string, unknown>[] | undefined) ?? []
    const plans = (c.plans as Record<string, unknown>[] | undefined) ?? []
    if (!Array.isArray(fields) || !Array.isArray(plans)) return
    for (let i = 0; i < fields.length; i++) fields[i].tenure ??= i < HOME_FIELDS ? 'owned' : 'none'
    for (let i = fields.length; i < PARCELS.length; i++) {
      const p = PARCELS[i]
      fields.push({ elev: p.elev, soil: Math.max(0, 1 - 0.5 * p.streak), vert: p.vert, streak: p.streak, tenure: 'none' })
    }
    for (let i = plans.length; i < PARCELS.length; i++) plans.push({ crop: 'rest', variety: 'katahdin', seed: 'certified' })
    const upgrades = c.upgrades as Record<string, unknown> | undefined
    if (upgrades && typeof upgrades === 'object') { upgrades.tractor2 ??= false; upgrades.house2 ??= false }
    c.crew ??= [{ id: 0, kind: 'farmer', name: 'You', at: -1, wage: 0, job: -1, to: -1, road: 0, paidTo: 0 }]
    c.nextUnit ??= 1
    c.offers ??= []
    c.contracts ??= []
    for (const k of ['yearWages', 'yearRent', 'yearLand', 'yearContracts', 'yearPenalties']) c[k] ??= 0
    for (const h of (c.history as Record<string, unknown>[] | undefined) ?? []) {
      for (const k of ['wages', 'rent', 'land', 'penalties', 'contracts']) h[k] ??= 0
    }
    const season = c.season as { fields?: Record<string, unknown>[]; jobs?: Record<string, unknown>[]; worked?: Record<string, unknown>[]; workLeft?: unknown } | null
    if (season && typeof season === 'object') {
      delete season.workLeft
      for (const j of season.jobs ?? []) j.unit ??= -1
      for (const w of season.worked ?? []) w.unit ??= 0
      const sf = season.fields
      if (Array.isArray(sf)) {
        for (let i = sf.length; i < PARCELS.length; i++) {
          sf.push({
            status: 'off', variety: 'katahdin', seedVirus: 0,
            plantDay: -1, emergeDay: -1, tiDay: -1, closeDay: -1, matureDay: -1, deadDay: -1, killDay: -1, dugDay: -1,
            pdSoil: 0, pdAir: 0, pdEmerge: 0,
            dr: 0, wet: 8, ksAvg: 1, canopy: 0, green: 0, wateredDay: -1,
            hillPasses: 0, cover: 0.5, weeded: false,
            residue: 0, lastSpray: -1,
            scab: 0, hollow: 0, knob: 0, logDays: 0, dryRun: 0, frostT: 0,
            sev: 0, sevPeak: 0, lastScout: -1, knownSev: 0, seenFromRoad: false,
            samples: [], sampleN: [], estBias: 1, eye: 0, seedBlight: 0, frostDay: -1, frostShare: 0, rimeDay: -1, digDone: 0, lotId: -1, flags: 0,
            hState: [], hEmergeAt: [], hPd0: [], hVigor: [], hC: [], hLes: [], hLat: [], hMass: [], hN: [], hTb: [],
          })
        }
      }
    }
  },
  // Version 4 made the crew people: skills, a trait, tiredness, mood, an asking wage, priorities, winter work; added
  // the spring's applicants, the Sundays-off rule and the harvest-break pickers.
  3: c => {
    const crew = Array.isArray(c.crew) ? c.crew as Record<string, unknown>[] : []
    const seed = typeof c.seed === 'number' ? c.seed : 0
    const year = typeof c.year === 'number' ? c.year : 0
    for (const u of crew) if (u && typeof u === 'object') upgradePerson(u, seed, year)
    c.sundaysOff ??= true
    if (c.applicants === undefined) c.applicants = c.phase === 'plan' ? applicantsFor(seed, year, new Set(crew.map(u => String(u.name)))) : []
    const season = c.season as Record<string, unknown> | null
    if (season && typeof season === 'object') season.pickers ??= false
  },
}

export function migrate(raw: unknown): Campaign | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  let v = typeof c.v === 'number' && Number.isInteger(c.v) ? c.v : 0
  if (v < 1 || v > SAVE_VERSION) return null
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v]
    if (!step) return null
    step(c)
    v++
    c.v = v
  }
  if (!Array.isArray(c.fields) || !Array.isArray(c.plans) || typeof c.year !== 'number' || typeof c.phase !== 'string') return null
  return c as unknown as Campaign
}

export function parseSave(text: string): SaveFile | null {
  try {
    const file = JSON.parse(text) as SaveFile
    const campaign = migrate(file?.campaign)
    if (!campaign) return null
    return { v: campaign.v, savedAt: typeof file.savedAt === 'number' ? file.savedAt : 0, campaign }
  } catch {
    return null
  }
}

export function serialize(c: Campaign, now: number): string {
  const file: SaveFile = { v: c.v, savedAt: now, campaign: c }
  return JSON.stringify(file)
}

export function readSave(): SaveFile | null {
  try {
    const text = localStorage.getItem(KEY)
    return text ? parseSave(text) : null
  } catch {
    return null
  }
}

export function writeSave(c: Campaign): boolean {
  try {
    localStorage.setItem(KEY, serialize(c, Date.now()))
    return true
  } catch {
    return false
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}

export function readSettings<T extends object>(defaults: T): T {
  try {
    const text = localStorage.getItem(SETTINGS_KEY)
    if (!text) return { ...defaults }
    return { ...defaults, ...(JSON.parse(text) as Partial<T>) }
  } catch {
    return { ...defaults }
  }
}

export function writeSettings(s: object): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* storage unavailable */ }
}
