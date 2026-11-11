// Browser-local saves. Every save carries a version; migrate() brings an old one forward.
import { SAVE_VERSION, type Campaign } from '../sim/index.ts'

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
