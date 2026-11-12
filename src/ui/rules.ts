// The rules as the interface states them, worked out from the simulation's own constants so the copy cannot drift.
import type { Alert } from '../game/app.ts'
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// F runs the clock, so felling is X, for the axe.
export const JOB_KEY: Record<S.JobKind, string> = { plant: 'P', hill: 'H', scout: 'C', spray: 'S', water: 'W', rogue: 'R', sample: 'T', kill: 'K', dig: 'D', fell: 'X', rocks: 'O', brush: 'B', build: '', haul: '' }
export const KEY_JOB: Record<string, S.JobKind> = { p: 'plant', h: 'hill', c: 'scout', s: 'spray', w: 'water', r: 'rogue', t: 'sample', k: 'kill', d: 'dig', x: 'fell', o: 'rocks', b: 'brush' }
export const JOB_VERB: Record<S.JobKind, string> = {
  plant: 'Plant', hill: 'Hill', scout: 'Scout', spray: 'Spray', water: 'Water', rogue: 'Rogue', sample: 'Test dig', kill: 'Kill vines', dig: 'Dig',
  fell: 'Fell', rocks: 'Pick rocks', brush: 'Cut brush', build: 'Build', haul: 'Haul in',
}
// What the crew is doing, before the field's name.
export const JOB_DOING: Record<S.JobKind, string> = {
  plant: 'Planting', hill: 'Hilling', scout: 'Scouting', spray: 'Spraying', water: 'Watering', rogue: 'Roguing', sample: 'Test dig in', kill: 'Killing vines in', dig: 'Digging',
  fell: 'Felling', rocks: 'Picking rocks in', brush: 'Cutting brush round', build: 'Building in', haul: 'Hauling from',
}

// An order in a few words: "Hilling North Ridge", "Building in the home yard". A build order's place is a yard.
export function jobText(j: { kind: S.JobKind; field: number }, c?: S.Campaign, building?: number): string {
  if (j.kind === 'build') {
    const b = c && building !== undefined ? c.buildings.find(x => x.id === building) : undefined
    return b ? `Building the ${S.BUILDINGS[b.kind].name.toLowerCase()}` : `${JOB_DOING.build} ${S.placeName(j.field)}`
  }
  return `${JOB_DOING[j.kind]} ${S.placeName(j.field)}`
}

// One line each: what the job does.
export function jobWhat(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return 'Puts the seed in the ground.'
    case 'hill': return 'Pulls soil up over the row: it keeps the tubers out of the light and the blight, and buries the weeds.'
    case 'scout': return 'Walks the rows looking for blight, which only shows up close.'
    case 'spray': return 'Puts protectant on the leaves. It stops spores taking hold; it does not cure a blighted plant.'
    case 'water': return `Irrigates ${inch()}.`
    case 'rogue': return 'Pulls up and bags the blighted plants you have found, so they stop throwing spores at the rest.'
    case 'sample': return 'Lifts one hill so you can see the tubers: how many, how big, and what is wrong with them.'
    case 'kill': return 'Kills the vines. The tubers stop growing and their skins start to set.'
    case 'dig': return 'Lifts the crop into barrels in the field.'
    case 'fell': return 'Cuts the standing wood. The logs come to the yard.'
    case 'rocks': return 'Picks the stones off the ground. They come to the yard as fieldstone.'
    case 'brush': return 'Cuts back the hedgerow round the field.'
    case 'build': return 'Puts up the building, a day of work at a time.'
    case 'haul': return 'Brings the barrels in from the field to the potato house, where the crop is weighed.'
  }
}

// What an order does and when a careful grower gives it, in two short sentences, for the one page of help.
export function orderHelp(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return `Puts the seed in. Wait for soil near ${F.temp(10)}: in colder ground it rots.`
    case 'hill': return 'Pulls soil over the row to cover the tubers and bury weeds. Twice, before the rows close.'
    case 'scout': return 'Walks the rows for blight, which shows only up close. Weekly; more often on a blight watch.'
    case 'spray': return 'Puts protectant on the leaf. Before blight weather: it cures nothing, and rain and new leaf wear it off.'
    case 'water': return `Irrigates ${inch()}. When the ground is dry while the tubers size.`
    case 'rogue': return 'Pulls and bags the blighted plants you have found. While they are few.'
    case 'sample': return 'Lifts one hill to show its tubers. Your only look at the crop before dig day.'
    case 'kill': return `Kills the vines: growth stops and skins set in ${S.SKIN_DAYS} days. Early September, or sooner if blight is winning.`
    case 'dig': return 'Lifts the crop into barrels. Once the skins are set, and before the ground freezes.'
    case 'fell': return 'Cuts a tract of woods or brush, the first step to a new field. Slow in the season, cheap in winter.'
    case 'rocks': return 'Picks stones. Stony ground slows planting and digging and bruises the crop. Only with no crop in.'
    case 'brush': return 'Cuts the hedgerow back: less blight weather and frost, a little more drying wind. It grows back.'
    case 'build': return 'Raises a building with the farm\'s own people. Ordered from the yard.'
    case 'haul': return 'Brings the dug crop in. Barrels left in the field can freeze or green.'
  }
}

// The whole of the teaching: a sentence or two the first time each kind of badge appears.
export function hint(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return `The soil has reached ${F.temp(10)}, warm enough to plant. In colder ground the seed sits and rots.`
    case 'hill': return 'Hilling pulls soil over the row to cover the coming tubers and bury the weeds. Do it twice, before the rows close.'
    case 'scout': return 'Scouting walks the rows. Blight shows only up close, and a week-old reading is a guess.'
    case 'spray': return 'Spray before blight weather. Protectant stops spores taking hold, cures nothing, and wears off in rain and new leaf.'
    case 'water': return `Dry soil while the tubers size costs yield and brings scab. Watering puts on ${inch()}.`
    case 'rogue': return 'To rogue is to pull and bag the blighted plants you have found, so they stop throwing spores at the rest.'
    case 'sample': return 'A test dig lifts one hill so you can see the tubers. It is your only look before dig day.'
    case 'kill': return `Kill the vines once the crop is made. The tubers stop growing, and skins take ${S.SKIN_DAYS} days to set.`
    case 'dig': return 'Digging lifts the crop into barrels. Wait for set skins if frost allows, because thin skins do not keep.'
    case 'fell': return 'Felling a tract is the first step to a new field: fell, stump, pick the rocks, plant.'
    case 'rocks': return 'Stones slow the planter and the digger and bruise the crop. Picking them takes hands and time.'
    case 'brush': return 'A grown-up hedgerow holds damp and frost on the field. Cutting it lets the wind through.'
    case 'build': return 'The farm\'s own people put buildings up, when they are not needed in the fields.'
    case 'haul': return 'The dug crop sits in barrels until it is hauled in. A hard frost on barrels in the field takes a share.'
  }
}

function inch(): string {
  return F.metric() ? `about ${S.IRRIGATION_MM} mm` : 'about an inch'
}

export function isJob(act: S.Advice['act'] | undefined): act is S.JobKind {
  return !!act && act !== 'wait' && act !== 'sell' && act !== 'close'
}

// A blight reading is a guess once the field has gone a week unwalked.
export function isStale(f: S.FieldInfo): boolean {
  return f.scoutAge < 0 || f.scoutAge >= 7
}

export function hillWord(passes: number): string {
  return passes >= 2 ? 'twice' : passes === 1 ? 'once, of two' : 'not yet'
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
    case 'off': return 'rest'
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
    case 'delivered': return { text: a.text.replace(/^Delivered .* for /, `${name}delivered for `).replace(/\.$/, ''), glyph: 'deliver' }
    case 'contractShort': case 'contractFilled': return { text: a.text.replace(/\.$/, ''), glyph: 'contract' }
    case 'hired': return { text: a.text.replace(/ is hired as .*/, ' hired'), glyph: 'hire' }
    case 'dismissed': return { text: a.text.replace(/\.$/, ''), glyph: 'crew' }
    case 'quit': return { text: `${who(a.text)} quit`, glyph: 'unhappy' }
    case 'unhappy': return { text: `${who(a.text)} is unhappy`, glyph: 'unhappy' }
    case 'wornOut': return { text: `${who(a.text)} is worn out`, glyph: 'tired' }
    case 'hurt': return { text: `${who(a.text)} is hurt${/back on (.+)\.$/.exec(a.text) ? `, back ${/back on (.+)\.$/.exec(a.text)![1]}` : ''}`, glyph: 'hurt' }
    case 'poached': return { text: `${who(a.text)} left for the neighbor`, glyph: 'unhappy' }
    case 'skillUp': return { text: a.text.replace(/ is better at /, ': ').replace(/: level (\d+)\.$/, ' $1'), glyph: 'rise' }
    case 'breakdown': return { text: 'A tractor broke down', glyph: 'tractor' }
    case 'repaired': return { text: 'The tractor is going again', glyph: 'tractor' }
    case 'building': return { text: a.text.replace(/ is started in .*/, ' started').replace(/^An? /, ''), glyph: 'build' }
    case 'built': return { text: a.text.replace(/^The (.+?) in .*$/, (_, b: string) => `${F.upper(b)} built`), glyph: 'build' }
    case 'felled': return { text: `${name}felled`, glyph: 'fell' }
    case 'stumped': return { text: `${name}stumps out`, glyph: 'stump' }
    case 'tiled': return { text: `${name}tile drains in`, glyph: 'tile' }
    case 'rocks': return { text: `${name}rocks picked`, glyph: 'rocks' }
    case 'brushed': return { text: `${name}brush cut back`, glyph: 'brush' }
    case 'brushBack': return { text: a.text.replace(/\.$/, ''), glyph: 'brush' }
    case 'pondDry': return { text: 'The pond is dry', glyph: 'pond' }
    case 'frozenInField': return { text: `${name}barrels froze${n ? `, ${F.localize(`${n} cwt`)}` : ''}`, glyph: 'frost' }
    case 'weighed': return { text: `${name}weighed in`, glyph: 'ticket' }
    case 'pickers': return { text: a.text.startsWith('A picking') ? 'Pickers hired' : 'Pickers sent home', glyph: 'pickers' }
    case 'logsSold': return { text: a.text.replace(/^Sold (.+?) loads of logs to the mill for (.+)\.$/, 'Logs sold for $2'), glyph: 'logs' }
    case 'incident': return { text: F.localize(a.text.split('. ')[0]), glyph: 'ask' }
    case 'incidentDone': return { text: a.text.replace(/\.$/, ''), glyph: 'ask' }
    case 'foreman': return { text: a.text.replace(/:.*$/, '').replace(/\.$/, ''), glyph: 'foreman' }
    default: return { text: a.text, glyph: a.level === 'bad' ? 'blight' : a.level === 'warn' ? 'warn' : a.level === 'good' ? 'check' : 'flat' }
  }
}

// The person an alert is about: the name it starts with.
function who(text: string): string {
  return /^(.+?)(?: is | has | takes | quits)/.exec(text)?.[1] ?? text.split(' ')[0]
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
function usualFactor(day: number): number {
  const c = S.SEASON_CURVE
  if (day <= c[0][0]) return c[0][1]
  for (let i = 1; i < c.length; i++) {
    if (day <= c[i][0]) return c[i - 1][1] + ((day - c[i - 1][0]) / (c[i][0] - c[i - 1][0])) * (c[i][1] - c[i - 1][1])
  }
  return c[c.length - 1][1]
}

// What a large tuber brings against a US No. 1 of the same variety.
function largeRatio(world: S.World, c: S.Campaign, id: S.VarietyId): number {
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
  const base = `September and October are usually the low of the year; November runs about ${F.pct(nov / low - 1)} above it and April about ${F.pct(apr / low - 1)}.`
  if (c.phase !== 'season' || !s) return base
  const now = usualFactor(s.day)
  return `${base} Against today's price that puts November ${F.versus(nov / now)} and April ${F.versus(apr / now)}.`
}

// Where the price usually stands by April against today, in a phrase, for the weigh ticket.
export function aprilPhrase(c: S.Campaign, v: S.Variety): string {
  if (v.contract) return 'off contract it fetches a processing price, which barely moves through the winter'
  const s = c.season
  const now = c.phase === 'season' && s ? usualFactor(s.day) : S.MONTH_CURVE[Math.min(c.month, S.MONTH_CURVE.length - 1)]
  return `by April it is usually ${F.versus(S.MONTH_CURVE[5] / now, 'above today', 'below today').replace('level with', 'level with today')}`
}

export function storageText(c: S.Campaign, cwt: number): string {
  const shrink = c.upgrades.vent ? S.SHRINK_VENT : S.SHRINK
  return `The cellar charges ${F.storeRate(S.STORE_COST)} from the day of the dig, about ${F.money(cwt * S.STORE_COST)} a month for this crop, and the pile shrinks about ${F.num(shrink * 100, 1)}% a month${c.upgrades.vent ? ' with the ventilation' : ''}, faster once it sprouts.`
}

export function contractText(v: S.Variety): string {
  return `${v.name} is a chipping potato. Off contract it fetches only a processing price, ${offContract()} its usual price, and that barely moves through the winter, so keeping it only costs storage and shrink. Against a chip plant's contract it gets the contract price.`
}

// How far under its usual price the chipping variety sells with no contract.
export function offContract(): string {
  return `${F.pct(1 - S.PROCESSING_PRICE)} under`
}

// ---------------------------------------------------------------- crews

export const KIND_GLYPH: Record<S.UnitKind, string> = { farmer: 'farmer', hand: 'hand', operator: 'tractor' }
export const KIND_NAME: Record<S.UnitKind, string> = { farmer: 'The farmer', hand: 'Field hand', operator: 'Tractor operator' }

// What a kind of crew can be given, in words.
export function kindDoes(kind: S.UnitKind): string {
  if (kind === 'farmer') return 'Every job.'
  return `${F.upper(F.list(S.UNIT_JOBS[kind].map(j => JOB_NOUN[j])))}.`
}

const JOB_NOUN: Record<S.JobKind, string> = {
  plant: 'planting', hill: 'hilling', scout: 'scouting', spray: 'spraying', water: 'watering', rogue: 'pulling blighted plants', sample: 'test digs', kill: 'vine kill', dig: 'digging',
  fell: 'felling', rocks: 'picking rocks', brush: 'cutting brush', build: 'building', haul: 'hauling',
}

export function initial(name: string): string {
  return name.slice(0, 1).toUpperCase()
}

// ---------------------------------------------------------------- people

export const SKILL_NAME: Record<S.Skill, string> = { machine: 'Machine', field: 'Field', woods: 'Woods', build: 'Building', pack: 'Packing' }
export const SKILL_GLYPH: Record<S.Skill, string> = { machine: 'tractor', field: 'scout', woods: 'fell', build: 'build', pack: 'packing' }

// The orders each kind of work covers, from the simulation's own table.
export function skillCovers(skill: S.Skill): string {
  const jobs = (Object.keys(S.JOB_SKILL) as S.JobKind[]).filter(k => S.JOB_SKILL[k] === skill)
  return jobs.length ? F.upper(F.list(jobs.map(j => JOB_NOUN[j]))) : 'Packing the stored crop in the packing shed, in winter'
}

// A priority as a cell shows it: 1 first .. 4, and a dash for never.
export function prioMark(level: number): string {
  return level <= 0 ? '–' : String(level)
}

export function prioWord(level: number): string {
  return level <= 0 ? 'never' : level === 1 ? 'first' : `priority ${level}`
}

// The next priority a click gives: 1, 2, 3, 4, never, and round again.
export function prioNext(level: number, back = false): number {
  const order = [1, 2, 3, 4, 0]
  const k = order.indexOf(level)
  return order[(k + (back ? order.length - 1 : 1)) % order.length]
}

export function firstName(name: string): string {
  return name === S.FARMER_NAME ? 'You' : name.split(' ')[0]
}

// Why a person's mood is where it is: the pulls on it the grower can see, the strongest first.
export function moodWhy(c: S.Campaign, p: S.PersonInfo): { up: boolean; text: string }[] {
  const out: { up: boolean; text: string; size: number }[] = []
  if (p.kind !== 'farmer') {
    if (p.bed) out.push({ up: true, text: 'a bed in the bunkhouse', size: S.MOOD_BED })
    if (p.ask > 0 && p.wage !== p.ask) {
      const d = (p.wage - p.ask) / p.ask
      out.push({ up: d > 0, text: `paid ${F.pct(Math.abs(d))} ${d > 0 ? 'over' : 'under'} what they asked`, size: Math.abs(d) * S.MOOD_PAY })
    }
  }
  if (p.tired > S.MOOD_TIRED_FROM) out.push({ up: false, text: 'worn down by the work', size: S.MOOD_TIRED * (p.tired - S.MOOD_TIRED_FROM) })
  const s = c.season
  const fieldsIn = s && c.phase === 'season' ? s.fields.filter(f => f.status === 'dug').length : 0
  if (fieldsIn > 0) out.push({ up: true, text: `${F.plural(fieldsIn, 'field')} brought in`, size: S.MOOD_PER_FIELD * fieldsIn })
  const cheer = c.crew.filter(u => u.id !== p.id && u.trait === 'cheerful').length
  if (cheer > 0) out.push({ up: true, text: 'cheerful company', size: S.CHEERFUL_OTHERS * cheer })
  return out.filter(x => x.size >= 0.01).sort((a, b) => b.size - a.size).slice(0, 3).map(({ up, text }) => ({ up, text }))
}

// Where a person's mood is heading: the target it moves toward a little each day, against where it stands.
export function moodHeading(c: S.Campaign, p: S.PersonInfo): 'rising' | 'falling' | '' {
  const u = c.crew.find(x => x.id === p.id)
  if (!u) return ''
  const fieldsIn = c.season && c.phase === 'season' ? c.season.fields.filter(f => f.status === 'dug').length : 0
  const t = S.moodTarget(c, u, fieldsIn)
  return t > p.mood + 0.03 ? 'rising' : t < p.mood - 0.03 ? 'falling' : ''
}

// What tiredness is doing to a person, and what brings it down.
export function tiredWhy(c: S.Campaign, p: S.PersonInfo): string {
  const slow = p.tired > S.TIRED_SLOW_FROM ? S.TIRED_SLOW * (p.tired - S.TIRED_SLOW_FROM) / (1 - S.TIRED_SLOW_FROM) : 0
  const rest = c.sundaysOff ? 'Sunday rests them' : 'no day off: Sundays are worked'
  if (p.tired >= S.HURT_TIRED) return `${F.pct(slow)} slower, and can be hurt on a machine or in the woods; ${rest}`
  if (slow > 0.005) return `${F.pct(slow)} slower; ${rest}`
  return p.tired >= 0.3 ? `a week's work adds up; ${rest}` : ''
}

// The quiet sign on a person's chip, the most pressing first: hurt, about to quit, worn out, unhappy, tired, idle.
export type Sign = { glyph: string; cls: 'bad' | 'warn'; text: string } | null

export function personSign(p: S.PersonInfo, idle: boolean): Sign {
  if (p.hurtUntil >= 0) return { glyph: 'hurt', cls: 'bad', text: 'hurt' }
  if (p.quitIn >= 0) return { glyph: 'unhappy', cls: 'bad', text: `quits in ${F.plural(p.quitIn, 'day')}` }
  if (p.tired >= S.HURT_TIRED) return { glyph: 'tired', cls: 'bad', text: 'worn out' }
  if (p.mood < 0.45) return { glyph: 'unhappy', cls: 'warn', text: p.moodWord }
  if (p.tired >= S.TIRED_SLOW_FROM) return { glyph: 'tired', cls: 'warn', text: 'tired' }
  if (idle) return { glyph: 'stale', cls: 'warn', text: 'idle, with work waiting' }
  return null
}

// ---------------------------------------------------------------- buildings and land

export const BUILD_GLYPH: Record<S.BuildingKind, string> = {
  house: 'house', shed: 'shed', bunk: 'bunk', packing: 'packing', pond: 'pond', stand: 'stand', station: 'station', road: 'road',
}

// The steps a tract goes through, as its card's track shows them.
export const CLEAR_STEPS: { stage: S.ClearStage; word: string; glyph: string }[] = [
  { stage: 'fell', word: 'Standing', glyph: 'woods' },
  { stage: 'stump', word: 'Felled', glyph: 'stump' },
  { stage: 'rocks', word: 'Stumped', glyph: 'rocks' },
  { stage: 'done', word: 'Field', glyph: 'idle' },
]

// What stones cost a field, in a few words: slower planting and digging, and bruising at the dig.
export function stonesText(stones: number): string {
  const slow = 1 - S.stoneSpeed(stones)
  const bruise = S.stoneBruise(stones, null)
  const parts = [slow > 0.005 ? `planting and digging ${F.pct(slow)} slower` : slow < -0.005 ? `planting and digging ${F.pct(-slow)} quicker` : '', bruise > 0.002 ? `about ${F.pct(bruise)} bruised at the dig` : '']
  return parts.filter(Boolean).join(', ')
}

export function stonesWord(stones: number): string {
  return stones >= 0.6 ? 'very stony' : stones >= 0.4 ? 'stony' : stones >= 0.2 ? 'a few stones' : 'clean'
}

// What saved seed carries, for the stock in hand.
export function savedSeedText(stock: S.SeedStock[]): string {
  const fields = stock.reduce((a, x) => a + x.fields, 0)
  const virus = fields > 0 ? stock.reduce((a, x) => a + x.virus * x.fields, 0) / fields : 0
  const blight = stock.some(x => x.blight > 0.01)
  return `Saved seed is free, but it carries more virus every year it is saved: about ${F.pct(virus)} of plants from this stock will come up stunted (certified seed: about ${F.pct(S.VIRUS_CERTIFIED)}), and a stunted plant gives about ${F.pct(1 - S.VIRUS_VIGOR)} less.${blight ? ' Tuber blight went into the cellar with it, and some of that comes back up in the field.' : ''}`
}

// How a season is counted on the way to keeping the farm: "Year 2 of 5".
export function seasonCount(c: S.Campaign): string {
  return F.upper(c.yearIdx < c.goalYears ? `year ${c.yearIdx + 1} of ${c.goalYears}` : `year ${c.yearIdx + 1}`)
}

// Every farm counts its years from its first spring, whatever year its weather was made for.
let firstYear = S.FARM_YEAR0 + 1
export function countYearsFrom(c: S.Campaign): void {
  firstYear = c.startYear
}

// A year as a heading names it: "Year 2".
export function yearName(year: number): string {
  return `Year ${yearShort(year)}`
}

// The same in a sentence: "year 2".
export function yearWord(year: number): string {
  return `year ${yearShort(year)}`
}

// The same where there is room only for a figure: a column of years, the axis of a chart.
export function yearShort(year: number): string {
  return String(year - firstYear + 1)
}

// "Years 1 to 5", or "Year 3" when they are the same.
export function yearSpan(a: number, b: number): string {
  if (a === b) return yearName(a)
  return `Years ${yearShort(a)} to ${yearShort(b)}`
}
