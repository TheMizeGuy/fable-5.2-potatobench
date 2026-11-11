// The rules as the interface states them, worked out from the simulation's own constants so the copy cannot drift.
import * as S from '../sim/index.ts'
import { levelNow } from '../sim/market.ts'
import * as F from './fmt.ts'

export const JOB_KEY: Record<S.JobKind, string> = { plant: 'P', hill: 'H', scout: 'C', spray: 'S', water: 'W', rogue: 'R', sample: 'T', kill: 'K', dig: 'D' }
export const JOB_VERB: Record<S.JobKind, string> = {
  plant: 'Plant', hill: 'Hill', scout: 'Scout', spray: 'Spray', water: 'Water', rogue: 'Rogue', sample: 'Test dig', kill: 'Kill vines', dig: 'Dig',
}

// One line each: what the job does.
export function jobWhat(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return 'Puts the seed in the ground.'
    case 'hill': return 'Pulls soil up over the row: it keeps the tubers out of the light and the blight, and buries the weeds.'
    case 'scout': return 'Walks the rows looking for blight, which only shows up close.'
    case 'spray': return 'Puts protectant on the leaves. It stops spores taking hold; it does not cure a blighted plant.'
    case 'water': return `Irrigates ${F.metric() ? 'about 25 mm' : 'about an inch'}.`
    case 'rogue': return 'Pulls up and bags the blighted plants you have found, so they stop throwing spores at the rest.'
    case 'sample': return 'Lifts one hill so you can see the tubers: how many, how big, and what is wrong with them.'
    case 'kill': return 'Kills the vines. The tubers stop growing and their skins start to set.'
    case 'dig': return 'Lifts the crop and grades it, tuber by tuber.'
  }
}

// The usual price through the season relative to the season average (USDA monthly record, as the simulation holds it).
export function usualFactor(day: number): number {
  const c = S.SEASON_CURVE
  if (day <= c[0][0]) return c[0][1]
  for (let i = 1; i < c.length; i++) {
    if (day <= c[i][0]) return c[i - 1][1] + ((day - c[i - 1][0]) / (c[i][0] - c[i - 1][0])) * (c[i][1] - c[i - 1][1])
  }
  return c[c.length - 1][1]
}

// What a large tuber brings against a US No. 1 of the same variety.
export function largeRatio(world: S.World, c: S.Campaign, id: S.VarietyId): number {
  const lot = { variety: id, sprouted: false } as S.Lot
  const no1 = S.gradePrice(world, c, lot, 'no1')
  return no1 > 0 ? S.gradePrice(world, c, lot, 'chef') / no1 : 1
}

export function largeRule(world: S.World, c: S.Campaign, id: S.VarietyId, short = false): string {
  const r = largeRatio(world, c, id)
  if (short) return r >= 1 ? `${F.pct(r - 1)} over, as bakers` : `${F.pct(1 - r)} under`
  return r >= 1 ? `${F.pct(r - 1)} over the No. 1 price, as bakers` : `${F.pct(1 - r)} under the No. 1 price`
}

// The cellar month a pile dug on dugDay starts to sprout in: an index into CELLAR_MONTHS, past its end when it never does.
export function sproutMonth(year: number, dugDay: number, id: S.VarietyId, vent: boolean): number {
  const keeps = S.variety(id).dormancy + S.COOL_CELLAR_DAYS + (vent ? S.VENT_DAYS : 0)
  const before = S.dayIndex(year, 10, 1) - dugDay
  return Math.max(1, Math.floor((keeps - before) / 30) + 1)
}

export function sproutText(m: number): string {
  return m < S.CELLAR_MONTHS.length ? `starts to sprout as ${S.CELLAR_MONTHS[m]} opens` : 'will not sprout before the cellar is emptied in May'
}

// For a crop dug at the usual time, around September 25.
export function keepsUntil(year: number, id: S.VarietyId, vent: boolean): string {
  const m = sproutMonth(year, S.dayIndex(year, 8, 25), id, vent)
  return m < S.CELLAR_MONTHS.length ? `${S.CELLAR_MONTHS[m - 1]}` : 'May and after'
}

// How heavy a crop the variety can make: its daily growth times the length of its bulking season.
export function yieldWord(v: S.Variety): string {
  const k = v.bulk * (v.matPd - v.tiPd)
  return k < 430 ? 'light' : k < 520 ? 'moderate' : k < 620 ? 'heavy' : 'heaviest, if September holds'
}

// How many tubers a hill sets, and so how they size: '' when it is nothing out of the ordinary.
export function setWord(v: S.Variety): string {
  return v.set <= 6 ? 'few tubers, so they run large' : v.set >= 9 ? 'many tubers, so they run small' : ''
}

// Each trait in full for a line of prose, or short for a table whose column says what it is about.
export function blightWord(v: S.Variety, short = false): string {
  const k = v.blightLeaf < 0.6 ? 0 : v.blightLeaf < 0.95 ? 1 : v.blightLeaf < 1.2 ? 2 : 3
  return (short ? ['resists', 'some resistance', 'prone', 'very prone'] : ['resists leaf blight', 'some leaf blight resistance', 'blight-prone leaf', 'very blight-prone leaf'])[k]
}

export function scabWord(v: S.Variety, short = false): string {
  const k = v.scab < 0.7 ? 0 : v.scab < 1.1 ? 1 : v.scab < 1.8 ? 2 : 3
  return (short ? ['resists', 'average', 'prone', 'very prone'] : ['resists scab', 'average on scab', 'scab-prone', 'very scab-prone'])[k]
}

export function droughtWord(v: S.Variety, short = false): string {
  const k = v.drought >= 0.55 ? 0 : v.drought >= 0.35 ? 1 : 2
  return (short ? ['rides it out', 'average', 'suffers'] : ['rides out dry spells', 'average in a dry spell', 'suffers in a dry spell'])[k]
}

export function seedWord(v: S.Variety, short = false): string {
  const k = v.virus <= 0.5 ? 0 : v.virus >= 0.9 ? 2 : 1
  return (short ? ['holds up well', 'picks up some virus', 'picks up virus fast'] : ['holds up well as saved seed', 'picks up some virus as saved seed', 'picks up virus fast as saved seed'])[k]
}

export function varietyName(id: string): string {
  const v = S.VARIETIES.find(x => x.id === id)
  return v ? v.name : F.upper(id)
}

// The year's price level as far as the market has shown it, in plain words.
export function moodText(world: S.World, c: S.Campaign): string {
  const s = c.season
  if (c.phase === 'season' && s && s.day < S.dayIndex(c.year, 7, 1)) {
    return 'The market has not shown its hand yet: whether potatoes are short or plentiful this year starts to show in August and can move until November.'
  }
  const d = levelNow(world, c) - 1
  const how = Math.abs(d) < 0.015 ? 'close to a usual year' : `about ${F.pct(Math.abs(d))} ${d > 0 ? 'above' : 'below'} a usual year`
  const open = c.phase === 'season' && s && s.day < S.dayIndex(c.year, 10, 1)
  return `Prices are running ${how} so far${open ? ', and that can still move until November as the rest of the harvest comes in' : ''}.`
}

// Where prices usually go from today, during the season.
export function outlookText(c: S.Campaign): string {
  const s = c.season
  const low = Math.min(...S.SEASON_CURVE.map(p => p[1]))
  const nov = S.MONTH_CURVE[0], apr = S.MONTH_CURVE[5]
  const base = `September and October are usually the low of the year; November runs about ${F.pct(nov / low - 1)} above it and April about ${F.pct(apr / low - 1)} (USDA, Maine, 1979 to 2013).`
  if (c.phase !== 'season' || !s) return base
  const now = usualFactor(s.day)
  return `${base} Against today's price that puts November ${F.versus(nov / now)} and April ${F.versus(apr / now)}.`
}

export function storageText(c: S.Campaign, cwt: number): string {
  const shrink = c.upgrades.vent ? S.SHRINK_VENT : S.SHRINK
  return `The cellar charges ${F.storeRate(S.STORE_COST)} from the day of the dig, about ${F.money(cwt * S.STORE_COST)} a month for this crop, and the pile shrinks about ${F.num(shrink * 100, 1)}% a month${c.upgrades.vent ? ' with the ventilation' : ''}, faster once it sprouts.`
}

export function contractText(v: S.Variety): string {
  return `${v.name} is grown on contract: the price is the same whenever it is delivered, with no winter rise, so keeping it only costs storage and shrink.`
}

// What saved seed carries, for the stock in hand.
export function savedSeedText(stock: S.SeedStock[]): string {
  const fields = stock.reduce((a, x) => a + x.fields, 0)
  const virus = fields > 0 ? stock.reduce((a, x) => a + x.virus * x.fields, 0) / fields : 0
  const blight = stock.some(x => x.blight > 0.01)
  return `Saved seed is free, but it carries more virus every year it is saved: about ${F.pct(virus)} of plants from this stock will come up stunted (certified seed: about ${F.pct(S.VIRUS_CERTIFIED)}), and a stunted plant gives about ${F.pct(1 - S.VIRUS_VIGOR)} less.${blight ? ' Tuber blight went into the cellar with it, and some of that comes back up in the field.' : ''}`
}
