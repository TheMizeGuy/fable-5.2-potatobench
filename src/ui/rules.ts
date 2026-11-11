// The rules as the interface states them, worked out from the simulation's own constants so the copy cannot drift.
import type { Alert } from '../game/app.ts'
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

export const JOB_KEY: Record<S.JobKind, string> = { plant: 'P', hill: 'H', scout: 'C', spray: 'S', water: 'W', rogue: 'R', sample: 'T', kill: 'K', dig: 'D' }
export const KEY_JOB: Record<string, S.JobKind> = { p: 'plant', h: 'hill', c: 'scout', s: 'spray', w: 'water', r: 'rogue', t: 'sample', k: 'kill', d: 'dig' }
export const JOB_VERB: Record<S.JobKind, string> = {
  plant: 'Plant', hill: 'Hill', scout: 'Scout', spray: 'Spray', water: 'Water', rogue: 'Rogue', sample: 'Test dig', kill: 'Kill vines', dig: 'Dig',
}
// What the crew is doing, before the field's name.
export const JOB_DOING: Record<S.JobKind, string> = {
  plant: 'Planting', hill: 'Hilling', scout: 'Walking', spray: 'Spraying', water: 'Watering', rogue: 'Roguing', sample: 'Test dig in', kill: 'Killing vines in', dig: 'Digging',
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

// What an order does and when a careful grower gives it, in two short sentences, for the one page of help.
export function orderHelp(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return `Puts the seed in. Wait for soil near ${F.temp(10)}: in colder ground it rots.`
    case 'hill': return 'Pulls soil over the row to cover the tubers and bury weeds. Twice, before the rows close.'
    case 'scout': return 'Walks the rows for blight, which shows only up close. Weekly; more often on a blight watch.'
    case 'spray': return 'Puts protectant on the leaf. Before blight weather: it cures nothing, and rain and new leaf wear it off.'
    case 'water': return `Irrigates ${F.metric() ? 'about 25 mm' : 'about an inch'}. When the ground is dry while the tubers size.`
    case 'rogue': return 'Pulls and bags the blighted plants you have found. While they are few.'
    case 'sample': return 'Lifts one hill to show its tubers. Your only look at the crop before dig day.'
    case 'kill': return `Kills the vines: growth stops and skins set in ${S.SKIN_DAYS} days. Early September, or sooner if blight is winning.`
    case 'dig': return 'Lifts the crop and grades every tuber. Once the skins are set, and before the ground freezes.'
  }
}

// The whole of the teaching: one sentence the first time each kind of badge appears.
export function hint(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return `Plant now: the soil has reached ${F.temp(10)}. In colder ground the seed sits and rots.`
    case 'hill': return 'Hilling pulls soil over the row to cover the coming tubers and bury the weeds. Twice, before the rows close.'
    case 'scout': return 'Walk the rows: blight shows only up close, and a week-old reading is a guess.'
    case 'spray': return 'Spray before blight weather: protectant stops spores taking hold, cures nothing, and wears off in rain and new leaf.'
    case 'water': return 'Water when the ground is dry while the tubers size: dry soil costs yield and brings scab.'
    case 'rogue': return 'Rogue: pull and bag the blighted plants you have found, so they stop throwing spores at the rest.'
    case 'sample': return 'A test dig lifts one hill so you can see the tubers. It is your only look before dig day.'
    case 'kill': return `Kill the vines when the crop is made: the tubers stop growing and skins take ${S.SKIN_DAYS} days to set.`
    case 'dig': return 'Digging lifts the crop and grades every tuber. Wait for set skins if frost allows: thin skins do not keep.'
  }
}

// The glyph for where a field is in its year.
export function stageGlyph(f: S.FieldInfo): string {
  switch (f.status) {
    case 'rest': return 'rest'
    case 'idle': return 'idle'
    case 'planted': return 'planted'
    case 'growing': return f.stage === 'Growing leaf' ? 'leaf' : f.stage === 'Vines going down' ? 'down' : f.bloom > 0.2 ? 'bloom' : 'bulk'
    case 'dead': return 'dead'
    case 'digging': return 'dig'
    case 'dug': return 'dug'
    case 'lost': return 'close'
  }
}

// An alert in a few words, for the strip by the land. The whole sentence is in the diary.
export function alertShort(a: Alert): { text: string; glyph: string } {
  const name = a.field >= 0 ? `${S.FIELD_NAMES[a.field]}: ` : ''
  const n = /(\d+)/.exec(a.text)?.[1] ?? ''
  switch (a.type) {
    case 'emerged': return { text: `${name}${a.level === 'warn' ? 'up, but thin' : 'up'}`, glyph: 'leaf' }
    case 'ti': return { text: `${name}tubers setting`, glyph: 'bulk' }
    case 'mature': return { text: `${name}vines going down`, glyph: 'down' }
    case 'vinesDead': return { text: `${name}${a.text.startsWith('Frost') ? 'frost took the vines' : a.text.startsWith('Blight') ? 'blight took the vines' : 'vines dead'}`, glyph: 'dead' }
    case 'skinSet': return { text: `${name}skins set`, glyph: 'dig' }
    case 'frost': return { text: `${name}frost on the leaf`, glyph: 'frost' }
    case 'dry': return { text: `${name}drying out`, glyph: 'dry' }
    case 'logged': return { text: `${name}standing water`, glyph: 'water' }
    case 'blightSeen': return { text: `${name}blight, seen from the road`, glyph: 'blight' }
    case 'scout': return { text: a.level === 'bad' ? `${name}blight on ${n === '1' ? 'one hill' : `${n} hills`}` : `${name}walked, no blight`, glyph: a.level === 'bad' ? 'blight' : 'scout' }
    case 'watch': return { text: 'Blight watch is on', glyph: 'blight' }
    case 'sample': return { text: `${name}test dig, ${n} tubers`, glyph: 'sample' }
    case 'dug': return { text: `${name}${a.level === 'bad' ? 'froze half dug' : 'dug'}`, glyph: 'dig' }
    case 'lost': return { text: a.field >= 0 ? `${name}crop lost` : a.text, glyph: 'close' }
    case 'freeze': return { text: 'The ground has frozen', glyph: 'frost' }
    case 'dropped': return { text: `${name}${a.text.split(' in ')[0].toLowerCase()} dropped`, glyph: 'warn' }
    case 'sold': return { text: a.text.replace(/^Sold .* for /, `${name}sold for `).replace(/\.$/, ''), glyph: 'check' }
    default: return { text: a.text, glyph: a.level === 'bad' ? 'blight' : a.level === 'warn' ? 'warn' : a.level === 'good' ? 'check' : 'flat' }
  }
}

// What the five-day forecast says the sky will do, from its own chance of rain.
export function forecastSky(d: S.ForecastDay): string {
  if (d.rainChance >= 60) return d.hi <= 1 ? 'snow' : d.rainMm >= 20 ? 'storm' : 'rain'
  return d.rainChance >= 30 ? 'shower' : 'clear'
}

export const SKY_WORD: Record<string, string> = {
  clear: 'Clear', cloud: 'Some cloud', overcast: 'Overcast', rain: 'Rain', storm: 'Heavy rain', fog: 'Fog and damp', snow: 'Snow', shower: 'A chance of rain',
}
export const BLIGHT_RISK = ['none', 'some', 'high', 'severe']

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

// The same, as a mark out of four.
export function yieldMark(v: S.Variety): number {
  const k = v.bulk * (v.matPd - v.tiPd)
  return k < 430 ? 1 : k < 520 ? 2 : k < 620 ? 3 : 4
}

// How many tubers a hill sets, and so how they size: '' when it is nothing out of the ordinary.
export function setWord(v: S.Variety): string {
  return v.set <= 6 ? 'few tubers, so they run large' : v.set >= 9 ? 'many tubers, so they run small' : ''
}

// Each trait in full for a line of prose, or short for a table whose column says what it is about.
export function blightWord(v: S.Variety, short = false): string {
  return (short ? ['resists', 'some resistance', 'prone', 'very prone'] : ['resists leaf blight', 'some leaf blight resistance', 'blight-prone leaf', 'very blight-prone leaf'])[blightMark(v)]
}

// 0 resists .. 3 very prone.
export function blightMark(v: S.Variety): number {
  return v.blightLeaf < 0.6 ? 0 : v.blightLeaf < 0.95 ? 1 : v.blightLeaf < 1.2 ? 2 : 3
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

export function soilWord(soil: number): string {
  return soil >= 0.85 ? 'rested' : soil >= 0.4 ? 'tired' : 'worn'
}

export const POSITION_NOTE = [
  'Bottom land: holds water, stays wet after rain, warms late, collects frost and stays damp for blight.',
  'Mid slope: middling on water and frost.',
  'Ridge: drains fast and warms early, but dries out.',
]

// The year's price level as far as the market has shown it, in plain words.
export function moodText(world: S.World, c: S.Campaign): string {
  const s = c.season
  if (c.phase === 'season' && s && s.day < S.dayIndex(c.year, 7, 1)) {
    return 'The market has not shown its hand yet: whether potatoes are short or plentiful this year starts to show in August and can move until November.'
  }
  const d = S.levelNow(world, c) - 1
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

// Where the price usually stands by April against today, in a phrase, for the weigh ticket.
export function aprilPhrase(c: S.Campaign, v: S.Variety): string {
  if (v.contract) return 'a contract price: it does not rise through the winter'
  const s = c.season
  const now = c.phase === 'season' && s ? usualFactor(s.day) : S.MONTH_CURVE[Math.min(c.month, S.MONTH_CURVE.length - 1)]
  return `by April it is usually ${F.versus(S.MONTH_CURVE[5] / now, 'above today', 'below today').replace('level with', 'level with today')}`
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

// How a season is counted on the way to keeping the farm.
export function seasonCount(c: S.Campaign): string {
  return c.yearIdx < c.goalYears ? `season ${c.yearIdx + 1} of ${c.goalYears}` : `year ${c.yearIdx + 1}`
}
