// The rules as the interface states them, worked out from the simulation's own constants so the copy cannot drift.
import type { Alert } from '../game/app.ts'
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// F steps the clock's speed, so felling is X, for the axe.
export const JOB_KEY: Record<S.JobKind, string> = { plant: 'P', hill: 'H', scout: 'C', spray: 'S', water: 'W', rogue: 'R', sample: 'T', kill: 'K', dig: 'D', fell: 'L', rocks: 'O', brush: 'B', build: '', haul: '' }
export const KEY_JOB: Record<string, S.JobKind> = { p: 'plant', h: 'hill', c: 'scout', s: 'spray', w: 'water', r: 'rogue', t: 'sample', k: 'kill', d: 'dig', l: 'fell', o: 'rocks', b: 'brush' }
export const JOB_VERB: Record<S.JobKind, string> = {
  plant: 'Plant', hill: 'Hill', scout: 'Scout', spray: 'Spray', water: 'Water', rogue: 'Rogue', sample: 'Test dig', kill: 'Kill vines', dig: 'Dig',
  fell: 'Fell', rocks: 'Pick rocks', brush: 'Cut brush', build: 'Build', haul: 'Haul in',
}
// What the crew is doing, before the field's name.
export const JOB_DOING: Record<S.JobKind, string> = {
  plant: 'Planting', hill: 'Hilling', scout: 'Scouting', spray: 'Spraying', water: 'Watering', rogue: 'Roguing', sample: 'Test dig in', kill: 'Killing vines in', dig: 'Digging',
  fell: 'Felling', rocks: 'Picking rocks in', brush: 'Cutting brush around', build: 'Building in', haul: 'Hauling from',
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
    case 'plant': return 'Plants the seed potatoes.'
    case 'hill': return 'Piles soil over the row, which keeps the potatoes out of the light and away from blight, and buries the weeds.'
    case 'scout': return 'Walks the rows looking for blight, which you can only see up close.'
    case 'spray': return 'Sprays the leaves so blight can\'t take hold. It won\'t cure a plant that already has blight.'
    case 'water': return `Waters the field with ${inch()}.`
    case 'rogue': return 'Pulls up and bags the blighted plants you\'ve found, so they stop spreading spores to the rest.'
    case 'sample': return 'Digs up one plant so you can see how many potatoes it has, how big they are, and what\'s wrong with them.'
    case 'kill': return 'Kills the vines, which stops the potatoes growing and lets their skins toughen for harvest.'
    case 'dig': return 'Digs up the crop and puts it in barrels in the field.'
    case 'fell': return 'Cuts down the trees and brings the logs to the yard.'
    case 'rocks': return 'Picks the stones off the field and brings them to the yard as fieldstone.'
    case 'brush': return 'Cuts back the hedgerow around the field.'
    case 'build': return 'Puts up the building, one day of work at a time.'
    case 'haul': return 'Brings the barrels in from the field to the potato house, where the crop is weighed.'
  }
}

// What an order does and when a careful grower gives it, in two short sentences, for the one page of help.
export function orderHelp(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return `Plants the seed potatoes. Wait until the soil is near ${F.temp(10)}, because seed rots in colder ground.`
    case 'hill': return 'Piles soil over the row to cover the potatoes and bury weeds. Do it twice, before the rows close.'
    case 'scout': return 'Walks the rows looking for blight, which you can only see up close. Do it weekly, and more often during a blight watch.'
    case 'spray': return 'Protects the leaves from blight. Spray before blight weather, because it can\'t cure blight, and rain and new leaves wear it off.'
    case 'water': return `Waters the field with ${inch()}. Use it when the soil is dry while the potatoes are filling out.`
    case 'rogue': return 'Pulls up and bags the blighted plants you\'ve found. Do it while there are only a few.'
    case 'sample': return 'Digs up one plant to show its potatoes. It\'s your only look at the crop before harvest.'
    case 'kill': return `Kills the vines, so the potatoes stop growing and their skins set in ${S.SKIN_DAYS} days. Do it in early September, or sooner if blight is winning.`
    case 'dig': return 'Digs up the crop and puts it in barrels. Do it once the skins have set, and before the ground freezes.'
    case 'fell': return 'Clears a tract of woods or brush, which is the first step to a new field. It\'s slow during the season and cheap in winter.'
    case 'rocks': return 'Picks stones off the field, because stony ground slows planting and digging and bruises the crop. Do it only when no crop is in the ground.'
    case 'brush': return 'Cuts the hedgerow back, which means less blight weather and frost but a little more drying wind. It grows back.'
    case 'build': return 'Your own crew puts up a building. Order it from the yard.'
    case 'haul': return 'Brings the harvested crop in. Barrels left in the field can freeze or turn green.'
  }
}

// The whole of the teaching: a sentence or two the first time each kind of badge appears.
export function hint(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return `The soil has reached ${F.temp(10)}, which is warm enough to plant. In colder ground the seed just sits and rots.`
    case 'hill': return 'Hilling piles soil over the row to cover the potatoes that are about to form and bury the weeds. Do it twice, before the rows close.'
    case 'scout': return 'Scouting means walking the rows. You can only see blight up close, and a week-old reading is just a guess.'
    case 'spray': return 'Spray before blight weather. It keeps blight from taking hold but can\'t cure it, and it wears off as it rains and new leaves grow.'
    case 'water': return `Dry soil while the potatoes are filling out costs you yield and brings scab. Watering adds ${inch()}.`
    case 'rogue': return 'Roguing means pulling up and bagging the blighted plants you\'ve found, so they stop spreading spores to the rest.'
    case 'sample': return 'A test dig pulls up one plant so you can see its potatoes. It\'s your only look before harvest.'
    case 'kill': return `Kill the vines once the crop is fully grown. The potatoes stop growing, and their skins take ${S.SKIN_DAYS} days to set.`
    case 'dig': return 'Digging puts the crop in barrels. Wait for the skins to set if frost allows, because thin-skinned potatoes don\'t keep.'
    case 'fell': return 'Felling a tract is the first step to a new field. After that you pull the stumps, pick the rocks, and plant.'
    case 'rocks': return 'Stones slow down planting and digging and bruise the crop. Picking them takes people and time.'
    case 'brush': return 'An overgrown hedgerow holds damp and frost on the field. Cutting it back lets the wind through.'
    case 'build': return 'Your own crew puts up buildings when they aren\'t needed in the fields.'
    case 'haul': return 'The harvested crop sits in barrels until it\'s hauled in. A hard frost can ruin some of the barrels left in the field.'
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
  return passes >= 2 ? 'twice' : passes === 1 ? 'once, one to go' : 'not yet'
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
    case 'emerged': return { text: `${name}${a.level === 'warn' ? 'plants are up, but sparse' : 'plants are up'}`, glyph: 'leaf' }
    case 'ti': return { text: `${name}potatoes are forming`, glyph: 'bulk' }
    case 'mature': return { text: `${name}vines are dying back`, glyph: 'down' }
    case 'vinesDead': return { text: `${name}${a.text.startsWith('Frost') ? 'frost killed the vines' : a.text.startsWith('Blight') ? 'blight killed the vines' : 'vines are dead'}`, glyph: 'dead' }
    case 'skinSet': return { text: `${name}skins have set`, glyph: 'dig' }
    case 'frost': return { text: `${name}frost on the leaves`, glyph: 'frost' }
    case 'dry': return { text: `${name}drying out`, glyph: 'dry' }
    case 'logged': return { text: `${name}standing water`, glyph: 'water' }
    case 'blightSeen': return { text: `${name}blight spotted from the road`, glyph: 'blight' }
    case 'scout': return { text: a.level === 'bad' ? `${name}blight on ${F.plural(typeof a.data?.found === 'number' ? a.data.found : Number(n), 'plant')}` : `${name}scouted, no blight`, glyph: a.level === 'bad' ? 'blight' : 'scout' }
    case 'watch': return { text: 'Blight watch is on', glyph: 'blight' }
    case 'sample': return { text: `${name}test dig found ${n} potatoes`, glyph: 'sample' }
    case 'dug': return { text: `${name}${a.level === 'bad' ? 'froze before it was all dug' : 'harvested'}`, glyph: 'dig' }
    case 'lost': return { text: a.field >= 0 ? `${name}crop lost` : a.text, glyph: 'close' }
    case 'freeze': return { text: 'The ground has frozen', glyph: 'frost' }
    case 'dropped': {
      // An order the morning took off the list, and why: the reason is the whole point of saying it.
      const why = typeof a.data?.why === 'string' && a.data.why ? `. ${a.data.why.replace(/\.$/, '')}` : ''
      return { text: `${name}${a.text.split(' in ')[0].toLowerCase()} taken off the work list${why}`, glyph: 'warn' }
    }
    case 'sold': return { text: a.text.replace(/^Sold .* for /, `${name}sold for `).replace(/\.$/, ''), glyph: 'check' }
    case 'delivered': return { text: a.text.replace(/^Delivered .* for /, `${name}delivered for `).replace(/\.$/, ''), glyph: 'deliver' }
    case 'contractShort': case 'contractFilled': return { text: a.text.replace(/\.$/, ''), glyph: 'contract' }
    case 'hired': return { text: a.text.replace(/ is hired as .*/, ' hired'), glyph: 'hire' }
    case 'dismissed': return { text: a.text.replace(/\.$/, ''), glyph: 'crew' }
    case 'quit': return { text: `${who(a.text)} quit`, glyph: 'unhappy' }
    case 'unhappy': return { text: `${whoIs(a.text)} unhappy`, glyph: 'unhappy' }
    case 'wornOut': return { text: `${whoIs(a.text)} worn out`, glyph: 'tired' }
    case 'hurt': return { text: `${whoIs(a.text)} hurt${/back on (.+)\.$/.exec(a.text) ? `, back ${/back on (.+)\.$/.exec(a.text)![1]}` : ''}`, glyph: 'hurt' }
    case 'poached': return { text: `${who(a.text)} left to work for the neighbor`, glyph: 'unhappy' }
    case 'skillUp': return { text: a.text.replace(/ (?:is|are) better at /, ': ').replace(/: level (\d+)\.$/, ' $1'), glyph: 'rise' }
    case 'breakdown': return { text: 'A tractor broke down', glyph: 'tractor' }
    case 'repaired': return { text: 'The tractor is running again', glyph: 'tractor' }
    case 'building': return { text: F.upper(a.text.replace(/ is started in .*/, ' started').replace(/^An? /, '')), glyph: 'build' }
    case 'built': return { text: a.text.replace(/^The (.+?) in .*$/, (_, b: string) => `${F.upper(b)} built`), glyph: 'build' }
    case 'felled': return { text: `${name}trees felled`, glyph: 'fell' }
    case 'stumped': return { text: `${name}stumps pulled`, glyph: 'stump' }
    case 'tiled': return { text: `${name}tile drains laid`, glyph: 'tile' }
    case 'rocks': return { text: `${name}rocks picked`, glyph: 'rocks' }
    case 'brushed': return { text: `${name}brush cut back`, glyph: 'brush' }
    case 'brushBack': return { text: a.text.replace(/\.$/, ''), glyph: 'brush' }
    case 'pondDry': return { text: 'The pond is dry', glyph: 'pond' }
    case 'frostBarrels': {
      const cwt = [...a.text.matchAll(/([\d,]+) cwt in /g)].reduce((t, m) => t + Number(m[1].replace(/,/g, '')), 0)
      return { text: `Frost tonight on ${cwt ? F.localize(`${cwt} cwt`) : 'the crop'} in barrels. Haul it in now`, glyph: 'frost' }
    }
    case 'frozenInField': return { text: `${name}barrels froze${typeof a.data?.cwt === 'number' && a.data.cwt > 0 ? `, ${F.localize(`${a.data.cwt} cwt`)}` : ''}`, glyph: 'frost' }
    case 'weighed': return { text: `${name}weighed in`, glyph: 'ticket' }
    case 'pickers': return { text: a.text.startsWith('A picking') ? 'Pickers hired' : 'Pickers sent home', glyph: 'pickers' }
    case 'logsSold': return { text: a.text.replace(/^Sold (.+?) loads of logs to the mill for (.+)\.$/, 'Logs sold for $2'), glyph: 'logs' }
    case 'incident': return { text: F.localize(a.text.split('. ')[0]), glyph: 'ask' }
    case 'need': {
      const more = Array.isArray(a.data?.fields) ? a.data.fields.length - 1 : 0
      return { text: `${a.text.replace(/\.$/, '')}${more > 0 ? ` and ${F.plural(more, 'more field')}` : ''}`, glyph: typeof a.data?.act === 'string' ? a.data.act : 'warn' }
    }
    case 'incidentDone': return { text: a.text.replace(/\.$/, ''), glyph: 'ask' }
    case 'foreman': return { text: a.text.split('. ')[0].replace(/\.$/, ''), glyph: 'foreman' }
    default: return { text: a.text, glyph: a.level === 'bad' ? 'blight' : a.level === 'warn' ? 'warn' : a.level === 'good' ? 'check' : 'flat' }
  }
}

// The person an alert is about: the name it starts with.
function who(text: string): string {
  return /^(.+?)(?: is | are | has | takes | quits)/.exec(text)?.[1] ?? text.split(' ')[0]
}

function whoIs(text: string): string {
  const w = who(text)
  return w === 'You' ? 'You\'re' : `${w} is`
}

// Days until the ground is fit to plant, as a grower would reckon it: the soil drawn toward each day's mean, from the
// forecast for five days and the usual weather after, and never before the date the coach calls too early. -1 when
// it cannot be told within three months.
export function plantingIn(world: S.World, c: S.Campaign): number {
  const s = c.season
  const t = S.today(world, c)
  if (!s || !t) return -1
  const earliest = S.dayIndex(s.year, 4, 8)
  const fc = S.forecast(world, c, 5)
  const nm = world.weather.normals
  let soil = t.soilT
  for (let k = 1; k <= 90; k++) {
    const day = s.day + k
    const f = fc[k - 1]
    const slot = !S.isLeap(s.year) && day >= 59 ? day + 1 : day
    const mean = f ? (f.hi + f.lo) / 2 : (nm.tmax[slot] + nm.tmin[slot]) / 20
    soil += S.SOIL_T_GAIN * (mean - soil)
    if (day >= earliest && soil >= 10) return k
  }
  return -1
}

// Seed that rotted in cold ground, in one line for the ticket: the planting day, and what it cost where the field's
// stand is known (stand: the share of the seed that came up; total: the crop dug, cwt). Seed rots only in cold soil
// before it comes up. Empty when nothing rotted and the planting was not before the season's earliest date.
export function coldPlanting(c: S.Campaign, lot: S.Lot, stand: number | null, total: number): string {
  const s = c.season
  const day = s && s.year === lot.year ? s.fields[lot.field]?.plantDay ?? -1 : -1
  const early = day >= 0 && day < S.dayIndex(lot.year, S.PLANT_FROM.month, S.PLANT_FROM.dom)
  const on = day >= 0 ? ` on ${F.date(lot.year, day)}` : ''
  const rotted = stand !== null && stand > 0 ? 1 - stand : 0
  const lost = rotted >= 0.01 ? total * rotted / stand! / S.FIELD_ACRES : 0
  if (lost >= 0.5) return `${early ? `Planted in cold soil${on}, and` : `The soil turned cold after planting${on}, and`} ${F.pct(rotted)} of the seed rotted before it came up, which cost about ${F.perArea(lost)}.`
  if (!early) return ''
  return stand === null ? `Planted in cold soil${on}, so some of the seed may have rotted before it came up.` : `Planted in cold soil${on}, but the seed came up anyway.`
}

// What the five-day forecast says the sky will do, from its own chance of rain.
export function forecastSky(d: S.ForecastDay): string {
  if (d.rainChance >= 60) return d.hi <= 1 ? 'snow' : d.rainMm >= 20 ? 'storm' : 'rain'
  return d.rainChance >= 30 ? 'shower' : 'clear'
}

export const SKY_WORD: Record<string, string> = {
  clear: 'Clear', cloud: 'Partly cloudy', overcast: 'Overcast', rain: 'Rain', storm: 'Heavy rain', fog: 'Foggy and damp', snow: 'Snow', shower: 'Chance of rain',
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
  if (short) return r >= 1 ? `${F.pct(r - 1)} more, as bakers` : `${F.pct(1 - r)} less`
  return r >= 1 ? `${F.pct(r - 1)} above the No. 1 price, as bakers` : `${F.pct(1 - r)} below the No. 1 price`
}

// The cellar month a pile dug on dugDay starts to sprout in: an index into CELLAR_MONTHS, past its end when it never does.
export function sproutMonth(year: number, dugDay: number, id: S.VarietyId, vent: boolean): number {
  const keeps = S.variety(id).dormancy + S.COOL_CELLAR_DAYS + (vent ? S.VENT_DAYS : 0)
  const before = S.dayIndex(year, 10, 1) - dugDay
  return Math.max(1, Math.floor((keeps - before) / 30) + 1)
}

export function sproutText(m: number): string {
  return m < S.CELLAR_MONTHS.length ? `starts to sprout in early ${S.CELLAR_MONTHS[m]}` : 'won\'t sprout before the cellar is emptied in May'
}

// For a crop dug at the usual time, around September 25.
export function keepsUntil(year: number, id: S.VarietyId, vent: boolean): string {
  const m = sproutMonth(year, S.dayIndex(year, 8, 25), id, vent)
  return m < S.CELLAR_MONTHS.length ? `${S.CELLAR_MONTHS[m - 1]}` : 'May or later'
}

// How heavy a crop the variety can make: its daily growth times the length of its bulking season.
export function yieldWord(v: S.Variety): string {
  const k = v.bulk * (v.matPd - v.tiPd)
  return k < 430 ? 'light' : k < 520 ? 'moderate' : k < 620 ? 'heavy' : 'heaviest, if September stays mild'
}

// How many tubers a hill sets, and so how they size: '' when it is nothing out of the ordinary.
export function setWord(v: S.Variety): string {
  return v.set <= 6 ? 'few tubers, so they grow large' : v.set >= 9 ? 'many tubers, so they stay small' : ''
}

// Each trait in full for a line of prose, or short for a table whose column says what it is about.
export function blightWord(v: S.Variety, short = false): string {
  return (short ? ['resists', 'some resistance', 'prone', 'very prone'] : ['resists leaf blight', 'some leaf blight resistance', 'leaves prone to blight', 'leaves very prone to blight'])[blightMark(v)]
}

// 0 resists .. 3 very prone.
export function blightMark(v: S.Variety): number {
  return v.blightLeaf < 0.6 ? 0 : v.blightLeaf < 0.95 ? 1 : v.blightLeaf < 1.2 ? 2 : 3
}

export function scabWord(v: S.Variety, short = false): string {
  const k = v.scab < 0.7 ? 0 : v.scab < 1.1 ? 1 : v.scab < 1.8 ? 2 : 3
  return (short ? ['resists', 'average', 'prone', 'very prone'] : ['resists scab', 'average scab resistance', 'scab-prone', 'very scab-prone'])[k]
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
  'Bottom land holds water and warms up late. It collects frost and stays damp, which blight likes.',
  'Mid slope, so water and frost are about average.',
  'Ridge land drains fast and warms up early, but it dries out.',
]

// The year's price level as far as the market has shown it, in plain words.
export function moodText(world: S.World, c: S.Campaign): string {
  const s = c.season
  if (c.phase === 'season' && s && s.day < S.dayIndex(c.year, 7, 1)) {
    return 'It\'s too early to tell how the market will go. You\'ll start to see in August whether potatoes are scarce or plentiful this year, and prices can keep moving until November.'
  }
  const d = S.levelNow(world, c) - 1
  const how = Math.abs(d) < 0.015 ? 'close to a usual year' : `about ${F.pct(Math.abs(d))} ${d > 0 ? 'above' : 'below'} a usual year`
  const open = c.phase === 'season' && s && s.day < S.dayIndex(c.year, 10, 1)
  return `Prices are running ${how} so far${open ? ', and they can still move until November as the rest of the harvest comes in' : ''}.`
}

// Where prices usually go from today, during the season.
export function outlookText(c: S.Campaign): string {
  const s = c.season
  const low = Math.min(...S.SEASON_CURVE.map(p => p[1]))
  const nov = S.MONTH_CURVE[0], apr = S.MONTH_CURVE[5]
  const base = `Prices are usually lowest in September and October. November runs about ${F.pct(nov / low - 1)} above that and April about ${F.pct(apr / low - 1)}.`
  if (c.phase !== 'season' || !s) return base
  const now = usualFactor(s.day)
  return `${base} Compared with today's price, that puts November ${F.versus(nov / now)} and April ${F.versus(apr / now)}.`
}

// What keeping a lot would really bring, in a phrase, from the storage outlook: the best month ahead at the usual
// prices, after the cellar's charge, shrink and sprouting, against what selling pays today.
export function storePhrase(o: { now: number; best: S.StoreMonth | null }): string {
  const b = o.best
  if (!b) return 'there\'s no month left to store it until'
  const d = b.net - o.now
  if (d < 0.5) return `after storage costs and shrink, no month pays more than today, and the best is ${b.name} at about ${F.money(b.net)}`
  return `stored until ${b.name}, it brings about ${F.money(b.net)} after storage costs and shrink, which is ${F.money(d)} more than today${b.sprouted ? ', though it will have sprouted' : ''}`
}

export function storageText(c: S.Campaign, cwt: number): string {
  const shrink = c.upgrades.vent ? S.SHRINK_VENT : S.SHRINK
  return `Storage costs ${F.storeRate(S.STORE_COST)} from the day of harvest, which is about ${F.money(cwt * S.STORE_COST)} a month for this crop. The pile also shrinks about ${F.num(shrink * 100, 1)}% a month${c.upgrades.vent ? ' with the ventilation' : ''}, and faster once it sprouts.`
}

export function contractText(v: S.Variety): string {
  return `${v.name} is a chipping potato. Without a contract it only gets a processing price, ${offContract()} its usual price, and that barely moves through the winter, so storing it just costs you storage and shrink. Delivered on a chip plant's contract, it gets the contract price.`
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
  if (kind === 'farmer') return 'Does every job.'
  return `Does ${F.list(S.UNIT_JOBS[kind].map(j => JOB_NOUN[j]))}.`
}

const JOB_NOUN: Record<S.JobKind, string> = {
  plant: 'planting', hill: 'hilling', scout: 'scouting', spray: 'spraying', water: 'watering', rogue: 'pulling blighted plants', sample: 'test digs', kill: 'killing vines', dig: 'digging',
  fell: 'felling', rocks: 'picking rocks', brush: 'cutting brush', build: 'building', haul: 'hauling',
}

export function initial(name: string): string {
  return name.slice(0, 1).toUpperCase()
}

// ---------------------------------------------------------------- people

// What letting someone go means, on every card that asks.
export const LET_GO_TEXT = 'They\'ll leave today and won\'t come back. You won\'t get back the month you\'ve already paid.'

export const SKILL_NAME: Record<S.Skill, string> = { machine: 'Machine', field: 'Field', woods: 'Woods', build: 'Building', pack: 'Packing' }
export const SKILL_GLYPH: Record<S.Skill, string> = { machine: 'tractor', field: 'scout', woods: 'fell', build: 'build', pack: 'packing' }

// The orders each kind of work covers, from the simulation's own table.
export function skillCovers(skill: S.Skill): string {
  const jobs = (Object.keys(S.JOB_SKILL) as S.JobKind[]).filter(k => S.JOB_SKILL[k] === skill)
  return jobs.length ? F.upper(F.list(jobs.map(j => JOB_NOUN[j]))) : 'Packing the stored crop in the packing shed over the winter'
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
      out.push({ up: d > 0, text: `being paid ${F.pct(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than they asked`, size: Math.abs(d) * S.MOOD_PAY })
    }
  }
  if (p.tired > S.MOOD_TIRED_FROM) out.push({ up: false, text: 'being worn down by the work', size: S.MOOD_TIRED * (p.tired - S.MOOD_TIRED_FROM) })
  const s = c.season
  const fieldsIn = s && c.phase === 'season' ? s.fields.filter(f => f.status === 'dug').length : 0
  if (fieldsIn > 0) out.push({ up: true, text: `getting ${F.plural(fieldsIn, 'field')} harvested`, size: S.MOOD_PER_FIELD * fieldsIn })
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

// What tiredness is doing to a person, and what brings it down, in whole sentences.
export function tiredWhy(c: S.Campaign, p: S.PersonInfo): string {
  const slow = p.tired > S.TIRED_SLOW_FROM ? S.TIRED_SLOW * (p.tired - S.TIRED_SLOW_FROM) / (1 - S.TIRED_SLOW_FROM) : 0
  const rest = c.sundaysOff ? 'Sunday off will help.' : 'There\'s no day off while Sundays are worked.'
  const are = p.kind === 'farmer' ? 'You\'re' : 'They\'re'
  if (p.tired >= S.HURT_TIRED) return `${are} ${F.pct(slow)} slower and could get hurt on a machine or in the woods. ${rest}`
  if (slow > 0.005) return `${are} ${F.pct(slow)} slower. ${rest}`
  return p.tired >= 0.3 ? `A week of work adds up. ${rest}` : ''
}

// The quiet sign on a person's chip, the most pressing first: hurt, about to quit, worn out, unhappy, tired, idle.
export type Sign = { glyph: string; cls: 'bad' | 'warn'; text: string } | null

export function personSign(p: S.PersonInfo, idle: boolean): Sign {
  if (p.hurtUntil >= 0) return { glyph: 'hurt', cls: 'bad', text: 'hurt' }
  if (p.quitIn >= 0) return { glyph: 'unhappy', cls: 'bad', text: `quits in ${F.plural(p.quitIn, 'day')}` }
  if (p.tired >= S.HURT_TIRED) return { glyph: 'tired', cls: 'bad', text: 'worn out' }
  if (p.mood < 0.45) return { glyph: 'unhappy', cls: 'warn', text: p.moodWord }
  if (p.tired >= S.TIRED_SLOW_FROM) return { glyph: 'tired', cls: 'warn', text: 'tired' }
  if (idle) return { glyph: 'stale', cls: 'warn', text: 'idle while work is waiting' }
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
  const parts = [slow > 0.005 ? `planting and digging ${F.pct(slow)} slower` : slow < -0.005 ? `planting and digging ${F.pct(-slow)} faster` : '', bruise > 0.002 ? `about ${F.pct(bruise)} bruised at harvest` : '']
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
  return `Saved seed is free, but it carries more virus every year you save it. From this stock, about ${F.pct(virus)} of plants will come up stunted (with certified seed it's about ${F.pct(S.VIRUS_CERTIFIED)}), and a stunted plant yields about ${F.pct(1 - S.VIRUS_VIGOR)} less.${blight ? ' Blight also went into the cellar with these potatoes, and some of it will come back in the field.' : ''}`
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
