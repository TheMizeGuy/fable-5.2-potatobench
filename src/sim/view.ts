// What the grower can know. The interface, the renderer and the bots read the game through these
// functions only, so nothing hidden (true tuber weight, latent blight) can leak onto the screen.
import { DUE_LABEL } from './buyers.ts'
import { dayIndex, formatDay, weekday, WEEKDAYS, withCommas } from './calendar.ts'
import {
  cellarCapacity, mortgageDue, mortgageOwed, openLots, pickersWindow, potatoHouses, stumpBlock, timberTracts, WINTER_LABEL, WINTER_WORKS, winterBlock,
  type PotatoHouse,
} from './campaign.ts'
import { hireRoom, travelDays } from './crew.ts'
import { BLOCK_NAME, DUFOUR_YARD, HOME_YARD, PARCELS, TRACTS, YARDS, type BlockId, type Holding } from './farm.ts'
import { lotCwt } from './harvest.ts'
import * as P from './params.ts'
import { bestSkill, defaultPrio, hasBed, hiredCount, housingLimit, moodWord, payOf, speed, tiredWord, xpNeed } from './people.ts'
import { brushedNow, clearing, COVER_WORD, fellLeft, fieldEnv, sheltered, standing, type ClearStage } from './land.ts'
import {
  FIELD_NAMES, haulFactor, haulRate, holdsDufour, jobBlock, jobCost, jobDays, jobWait, JOB_LABEL, knownHills, standOpen, tractorsOwned, waitFor, workday,
} from './season.ts'
import { buildBlock, buildCost, buildingAt, hasBuilt, rain30, roadFactor, YARD_NAME } from './buildings.ts'
import {
  H_DECAYED, H_DUG, H_EMERGED, H_KNOWN, H_ROGUED, H_SAMPLED, H_VIRUS, H_WILT,
  type BuildingKind, type Campaign, type Cover, type Day, type Due, type FieldSeason, type JobKind, type Skill, type Tenure, type Trait, type UnitKind,
  type VarietyId,
  type WinterWork, type World,
} from './types.ts'
import { variety } from './varieties.ts'
import { forecastFor, getDay, skyOf, wallin, type ForecastDay } from './weather.ts'

export interface Estimate { mean: number; lo: number; hi: number; digs: number }

const PRIOR_VAR = 0.22 * 0.22     // how far off a practised eye runs
const DIG_VAR = 0.25 * 0.25       // how far one hill runs from its field

// Total tuber weight in cwt per acre as an experienced eye would put it: a guess that test digs sharpen.
export function estimateYield(c: Campaign, fi: number): Estimate | null {
  const f = c.season?.fields[fi]
  if (!f || f.tiDay < 0 || f.status === 'dug' || f.status === 'lost' || f.status === 'rest' || f.status === 'off') return null
  // What the grower expects from the leaf, the weather and the calendar, corrected by the hills lifted so far.
  // Nothing here reads the tubers themselves except through a test dig.
  const eye = (f.eye * P.CWT_PER_HILL_GRAM) / P.FIELD_ACRES
  const n = f.samples.length
  let wSum = 1 / PRIOR_VAR, mSum = f.estBias / PRIOR_VAR
  for (const k of f.samples) { wSum += 1 / DIG_VAR; mSum += k / DIG_VAR }
  const sd = Math.sqrt(1 / wSum)
  const mean = eye * (mSum / wSum)
  return { mean, lo: Math.max(0, mean * (1 - 1.5 * sd)), hi: mean * (1 + 1.5 * sd), digs: n }
}

export type HillKind = 'bare' | 'seed' | 'plant' | 'dead' | 'dug' | 'pulled'
// yellow: how far the plant has gone down (ripening, or dying early with wilt), 0..1.
export interface HillLook { kind: HillKind; canopy: number; vigor: number; blight: number; stunted: boolean; yellow: number }

export function hillLook(f: FieldSeason, i: number): HillLook {
  const st = f.hState.length ? f.hState[i] : 0
  if (!f.hState.length) return { kind: 'bare', canopy: 0, vigor: 1, blight: 0, stunted: false, yellow: 0 }
  if (st & (H_DUG | H_SAMPLED)) return { kind: 'dug', canopy: 0, vigor: 1, blight: 0, stunted: false, yellow: 0 }
  if (st & H_ROGUED) return { kind: 'pulled', canopy: 0, vigor: 1, blight: 0, stunted: false, yellow: 0 }
  if (!(st & H_EMERGED)) return { kind: 'seed', canopy: 0, vigor: 1, blight: 0, stunted: false, yellow: 0 }
  const dead = f.deadDay >= 0
  const matAt = variety(f.variety).matPd * ((st & H_WILT) ? P.VERT_EARLY : 1)
  const over = f.pdAir - f.hPd0[i] - matAt
  return {
    kind: dead ? 'dead' : 'plant',
    canopy: f.hC[i],
    vigor: f.hVigor[i],
    blight: st & H_KNOWN ? f.hLes[i] : 0,
    stunted: (st & H_VIRUS) !== 0,
    yellow: dead ? 1 : over <= 0 ? 0 : Math.min(1, over / 110),
  }
}

export type Moisture = 'standing water' | 'wet' | 'good' | 'drying' | 'dry' | 'wilting'

export interface FieldInfo {
  index: number
  name: string
  tenure: Tenure            // 'none': not the farm's, and status is 'off'
  block: BlockId
  elev: number
  position: string
  soil: number
  vert: number
  streak: number
  crop: 'potato' | 'rest'
  status: FieldSeason['status']
  variety: string
  stage: string
  daysIn: number
  canopy: number
  moisture: number          // share of plant-available water left, 0..1
  moistureLabel: Moisture
  tooWet: boolean
  hillPasses: number
  protect: number           // protectant left on the leaf, 0..1
  blightKnown: number       // share of leaf lost to blight on the hills the grower has seen
  blightHills: number
  scoutAge: number          // days since the field was walked, -1 if never
  stunted: number           // share of plants visibly stunted by virus
  estimate: Estimate | null
  // Known only from test digs: tubers under a hill, and the average tuber weight in grams that implies.
  tubers: { perHill: number; lo: number; hi: number; digs: number } | null
  skin: number              // skin set once the vines are dead, 0..1
  bloom: number             // how much of the field is in flower, 0..1
  stand: number             // share of the seed that came up, 0..1 (1 until the field is up)
  frosted: number           // share of the leaf blackened by frost in the last week, 0..1
  rime: boolean             // this field froze last night
  wilt: number              // how hard the plants are drooping for water, 0..1
  deadDays: number
  lot: number
  // The land under the crop.
  cover: Cover              // 'open' for a field; a tract still to clear is 'woods', 'brush' or 'stumps', and status 'off'
  coverWord: string
  stones: number            // 0..1
  raw: boolean              // new ground that has not had a crop or a rest year: a first potato crop grows 15% less
  tiled: boolean
  brushed: number           // years until cut hedgerows grow back; 0 when they stand
  sheltered: boolean        // standing woods or brush nearby: less water lost, sprays in more wind, an hour wetter, colder
  shelteredBy: string       // the name of the tract that shelters it, or ''
  clearing: { stage: ClearStage; next: string; felled: number } | null   // for a tract: where its clearing stands
  works: { kind: 'stump' | 'tile'; left: number } | null                 // a contractor at work: season days left
  // The harvest.
  inField: number           // cwt dug and lying in barrels in the field, not yet hauled in
  weighed: boolean          // the whole crop is in and the weigh ticket cut: it can be sold or stored
  // Today's blight risk from this field's own wet hours, 0 to 4 (Wallin severity values), with a weather station;
  // null without one, or when fieldInfo is asked without the world.
  blightRisk: number | null
}

const POSITION = ['bottom land', 'mid slope', 'ridge']

export function fieldInfo(c: Campaign, fi: number, world?: World): FieldInfo {
  const fp = c.fields[fi]
  const plan = c.plans[fi]
  const s = c.season
  const base: FieldInfo = {
    index: fi, name: FIELD_NAMES[fi], tenure: fp.tenure, block: PARCELS[fi].block,
    elev: fp.elev, position: POSITION[fp.elev], soil: fp.soil, vert: fp.vert, streak: fp.streak,
    crop: plan.crop, status: plan.crop === 'rest' ? 'rest' : 'idle', variety: plan.crop === 'rest' ? 'Oats and clover' : variety(plan.variety).name,
    stage: plan.crop === 'rest' ? 'Resting' : 'Not planted', daysIn: 0, canopy: 0, moisture: 1, moistureLabel: 'good', tooWet: false,
    hillPasses: 0, protect: 0, blightKnown: 0, blightHills: 0, scoutAge: -1, stunted: 0, estimate: null, tubers: null, skin: 0, bloom: 0, stand: 1, frosted: 0, rime: false, wilt: 0, deadDays: -1, lot: -1,
    cover: fp.cover, coverWord: COVER_WORD[fp.cover], stones: fp.stones, raw: fp.raw, tiled: fp.tiled,
    brushed: brushedNow(c, fi) ? P.BRUSH_YEARS - (c.year - fp.brushed) : 0, sheltered: false, shelteredBy: '',
    clearing: null, works: fp.works ? { ...fp.works } : null,
    inField: 0, weighed: false, blightRisk: null,
  }
  const env = fieldEnv(c, fi)
  if (env.shelter >= 0) { base.sheltered = true; base.shelteredBy = FIELD_NAMES[env.shelter] }
  if (PARCELS[fi].holding !== 'field') {
    const cl = clearing(c, fi)
    base.clearing = { ...cl, felled: standing(fp.cover) ? fp.felled / P.FELL_DAYS[fp.cover] : 1 }
  }
  const f = s?.fields[fi]
  if (fp.tenure === 'none' || fp.cover !== 'open' || f?.status === 'off') {
    base.status = 'off'
    base.crop = 'rest'
    base.variety = ''
    base.stage = fp.tenure === 'none' ? 'Not the farm\'s' : fp.cover === 'woods' ? 'Standing woods' : fp.cover === 'brush' ? 'Brush'
      : fp.cover === 'stumps' ? 'Stumps' : 'New ground, ready next spring'
    return base
  }
  if (!s || !f) return base
  base.inField = f.inField
  base.weighed = f.weighed
  if (world && hasBuilt(c, 'station') && !s.frozen) {
    const d = getDay(world, s.year, s.day)
    base.blightRisk = wallin(Math.max(0, Math.min(24, d.wetH + env.humid + (f.wateredDay === s.day ? 3 : 0))), d.wetT)
  }
  const taw = env.taw
  base.status = f.status
  base.moisture = 1 - f.dr / taw
  base.tooWet = f.wet >= P.WORKABLE_WET_MM
  base.rime = f.rimeDay >= 0 && f.rimeDay === s.day - 1
  if (f.frostDay >= 0 && s.day - f.frostDay <= 6 && f.deadDay < 0) base.frosted = f.frostShare
  base.moistureLabel = f.wet > P.WATERLOG_MM ? 'standing water' : base.tooWet ? 'wet'
    : base.moisture > 0.65 ? 'good' : base.moisture > 0.45 ? 'drying' : base.moisture > 0.25 ? 'dry' : 'wilting'
  if (f.status === 'rest') return base
  base.variety = variety(f.variety).name
  base.hillPasses = f.hillPasses
  base.protect = f.residue
  base.canopy = f.canopy
  base.lot = f.lotId
  if (f.plantDay >= 0) base.daysIn = s.day - f.plantDay
  if (f.hState.length) {
    let up = 0, stunted = 0
    for (let i = 0; i < P.HILLS; i++) {
      const st = f.hState[i]
      if ((st & H_EMERGED) && !(st & (H_DUG | H_SAMPLED | H_ROGUED))) { up++; if (st & H_VIRUS) stunted++ }
    }
    base.stunted = up ? stunted / up : 0
    if (f.emergeDay >= 0) {
      let rotted = 0
      for (let i = 0; i < P.HILLS; i++) if (f.hState[i] & H_DECAYED) rotted++
      base.stand = 1 - rotted / P.HILLS
    }
    base.blightHills = knownHills(f)
  }
  base.blightKnown = f.knownSev
  if (f.status === 'growing') {
    base.wilt = Math.max(0, Math.min(1, (0.42 - base.moisture) / 0.3))
    if (f.tiDay >= 0) {
      const k = s.day - f.tiDay
      base.bloom = k < 4 ? k / 4 : k <= 14 ? 1 : k < 24 ? (24 - k) / 10 : 0
    }
  }
  base.scoutAge = f.lastScout < 0 ? -1 : s.day - f.lastScout
  base.estimate = estimateYield(c, fi)
  if (base.estimate && f.sampleN.length) {
    let n = 0
    for (const x of f.sampleN) n += x
    const perHill = n / f.sampleN.length
    const gramsPerHill = P.FIELD_ACRES / (P.HILLS * P.CWT_PER_HILL_GRAM)
    base.tubers = { perHill, lo: base.estimate.lo * gramsPerHill / perHill, hi: base.estimate.hi * gramsPerHill / perHill, digs: f.sampleN.length }
  }
  if (f.deadDay >= 0) {
    base.deadDays = s.day - f.deadDay
    base.skin = Math.min(1, base.deadDays / P.SKIN_DAYS)
  }
  switch (f.status) {
    case 'idle': base.stage = 'Not planted'; break
    case 'planted': base.stage = 'Planted, not up'; break
    case 'growing':
      base.stage = f.tiDay < 0 ? 'Growing leaf' : f.matureDay >= 0 ? 'Vines going down' : f.closeDay < 0 ? 'Setting tubers' : 'Bulking'
      break
    case 'dead': base.stage = base.skin >= 1 ? 'Vines dead, skins set' : 'Vines dead, skins setting'; break
    case 'digging': base.stage = 'Being dug'; break
    case 'dug': base.stage = 'Dug'; break
    case 'lost': base.stage = 'Lost'; break
  }
  return base
}

export interface ActionInfo { kind: JobKind; label: string; ok: boolean; why: string; days: number; cost: number; wait: string }

export function fieldActions(world: World, c: Campaign, fi: number): ActionInfo[] {
  const s = c.season
  const d = s ? getDay(world, s.year, s.day) : null
  return P.JOBS.map(kind => {
    const why = jobBlock(c, kind, fi)
    const f = s ? s.fields[fi] : null
    return {
      kind, label: JOB_LABEL[kind], ok: why === '', why,
      days: jobDays(c, kind, f, fi), cost: jobCost(c, kind, fi),
      wait: f && d && why === '' ? jobWait(kind, f, d, fieldEnv(c, fi).wind) : '',
    }
  })
}

// ---------------------------------------------------------------- crews, land, contracts, storage

export interface CrewInfo {
  id: number
  kind: UnitKind
  name: string
  at: number                // a field index, or -1 the home yard, -2 the Dufour yard
  wage: number              // dollars a month
  job: { id: number; kind: JobKind; field: number } | null   // the order it is working or going to
  travelling: boolean
  to: number                // where it is going (equals at when it is not travelling)
  road: number              // days of driving left
}

export function crewInfo(c: Campaign): CrewInfo[] {
  const s = c.phase === 'season' ? c.season : null
  return c.crew.map(u => {
    const j = s && u.job >= 0 ? s.jobs.find(x => x.id === u.job) : undefined
    const travelling = !!s && u.road > 0
    return {
      id: u.id, kind: u.kind, name: u.name, at: u.at, wage: u.wage,
      job: j ? { id: j.id, kind: j.kind, field: j.field } : null,
      travelling, to: travelling ? u.to : u.at, road: travelling ? u.road : 0,
    }
  })
}

// ---------------------------------------------------------------- people

export interface PersonInfo {
  id: number
  name: string
  kind: UnitKind
  skills: Record<Skill, number>     // 0..10
  progress: Record<Skill, number>   // share of the way to the next level, 0..1
  trait: Trait | ''
  traitName: string                 // '' for the farmer
  traitText: string                 // what the trait does, in one sentence
  tired: number                     // 0..1
  tiredWord: string
  mood: number                      // 0..1
  moodWord: string
  wage: number                      // dollars a month agreed
  pay: number                       // dollars a month paid: a foreman earns 40% more
  ask: number                       // what they asked for; 0 for the farmer
  prio: Record<Skill, number>       // 0 never, 1 first .. 4
  speed: Record<Skill, number>      // share of normal speed today at each kind of work
  doing: string                     // what they are doing now, in words
  job: { id: number; kind: JobKind; field: number } | null
  at: number                        // a field index, or -1 the home yard, -2 the Dufour yard
  to: number
  travelling: boolean
  foreman: BlockId | null
  winter: WinterWork
  winterField: number
  winterText: string
  bed: boolean                      // has a bed in a bunkhouse
  quitIn: number                    // days until they quit if their mood stays this low; -1 when they are not about to
}

export function peopleInfo(c: Campaign): PersonInfo[] {
  const s = c.phase === 'season' ? c.season : null
  const rest = !!s && !s.frozen && !workday(c, s)
  return c.crew.map(u => {
    const j = s && u.job >= 0 ? s.jobs.find(x => x.id === u.job) : undefined
    const travelling = !!s && u.road > 0
    const progress = { machine: 0, field: 0, woods: 0, build: 0, pack: 0 }
    const sp = { machine: 0, field: 0, woods: 0, build: 0, pack: 0 }
    for (const k of P.SKILLS) {
      progress[k] = u.skills[k] >= P.SKILL_MAX ? 0 : Math.min(1, u.xp[k] / xpNeed(u.skills[k]))
      sp[k] = speed(u, k)
    }
    let doing: string
    if (u.foreman) doing = `Foreman of ${BLOCK_NAME[u.foreman]}`
    else if (c.phase === 'season' && s && !s.frozen) {
      if (rest) doing = 'Sunday: resting'
      else if (j) doing = `${travelling ? 'On the way to' : 'At'} ${JOB_LABEL[j.kind].toLowerCase()}${j.field >= 0 ? ` in ${FIELD_NAMES[j.field]}` : ''}`
      else if (travelling) doing = 'On the road'
      else doing = 'Nothing to do'
    } else if (c.phase === 'cellar' || (s && s.frozen)) doing = u.winter === 'off' ? 'Laid off for the winter' : `Kept on: ${WINTER_LABEL[u.winter]}`
    else doing = 'Waiting for the season'
    return {
      id: u.id, name: u.name, kind: u.kind, skills: { ...u.skills }, progress,
      trait: u.trait, traitName: u.trait ? P.TRAITS[u.trait].name : '', traitText: u.trait ? P.TRAITS[u.trait].text : '',
      tired: u.tired, tiredWord: tiredWord(u.tired), mood: u.mood, moodWord: moodWord(u.mood),
      wage: u.wage, pay: payOf(u), ask: u.ask, prio: { ...u.prio }, speed: sp, doing,
      job: j ? { id: j.id, kind: j.kind, field: j.field } : null,
      at: u.at, to: travelling ? u.to : u.at, travelling,
      foreman: u.foreman || null,
      winter: u.winter, winterField: u.winterField,
      winterText: u.winter === 'woods' && u.winterField >= 0 ? `${WINTER_LABEL.woods}: ${FIELD_NAMES[u.winterField]}` : WINTER_LABEL[u.winter],
      bed: hasBed(c, u),
      quitIn: u.kind !== 'farmer' && u.mood < P.QUIT_MOOD ? Math.max(1, P.QUIT_DAYS - u.low) : -1,
    }
  })
}

export interface ApplicantInfo {
  id: number
  name: string
  skills: Record<Skill, number>
  best: Skill
  suits: UnitKind                  // what they would be taken on as: a tractor operator if machine work is their best
  trait: Trait
  traitName: string
  traitText: string
  ask: number                       // dollars a month
  prio: Record<Skill, number>       // the priorities they would start with
  why: string                       // why they cannot be taken on now, or ''
}

export function applicantInfo(c: Campaign): ApplicantInfo[] {
  const why = hireRoom(c)
  return c.applicants.map(a => {
    const best = bestSkill(a.skills)
    return {
      id: a.id, name: a.name, skills: { ...a.skills }, best, suits: best === 'machine' ? 'operator' : 'hand',
      trait: a.trait, traitName: P.TRAITS[a.trait].name, traitText: P.TRAITS[a.trait].text,
      ask: a.ask, prio: defaultPrio(a.skills), why,
    }
  })
}

export interface WinterChoice { work: WinterWork; ok: boolean; why: string }

export interface WinterInfo {
  months: number                    // November to April
  monthly: number                   // dollars a month in wages for everyone kept on
  woods: { field: number; name: string; left: number; logs: number }[]   // tracts to fell: crew-days left, loads of logs at a yield of 1
  people: {
    id: number
    name: string
    work: WinterWork
    field: number
    text: string
    pay: number                     // dollars a month while kept on; 0 laid off, and for the farmer
    crewDays: number                // crew-days a month they put in, before their skill
    choices: WinterChoice[]
  }[]
}

export function winterInfo(c: Campaign): WinterInfo {
  let monthly = 0
  const people = c.crew.map(u => {
    const pay = u.winter === 'off' || u.kind === 'farmer' ? 0 : payOf(u)
    monthly += pay
    return {
      id: u.id, name: u.name, work: u.winter, field: u.winterField,
      text: u.winter === 'woods' && u.winterField >= 0 ? `${WINTER_LABEL.woods}: ${FIELD_NAMES[u.winterField]}` : WINTER_LABEL[u.winter],
      pay, crewDays: u.winter === 'off' ? 0 : u.kind === 'farmer' ? P.FARMER_WINTER_DAYS : P.WINTER_DAYS,
      choices: WINTER_WORKS.map(w => {
        const why = winterBlock(c, u, w, w === 'woods' ? timberTracts(c)[0] ?? -1 : -1)
        return { work: w, ok: why === '', why }
      }),
    }
  })
  const woods = timberTracts(c).map(i => {
    const cover = c.fields[i].cover as 'woods' | 'brush'
    return { field: i, name: FIELD_NAMES[i], left: fellLeft(c, i), logs: P.TIMBER[cover] * fellLeft(c, i) / P.FELL_DAYS[cover] }
  })
  return { months: P.WINTER_MONTHS, monthly, woods, people }
}

export interface LabourInfo {
  weekday: string                   // today's day of the week, in season
  restDay: boolean                  // nobody works today: a Sunday off
  sundaysOff: boolean
  tractors: number                  // tractors the farm owns
  tractorsFree: number              // not held by anyone right now
  truck: boolean                    // the farm has a truck for hauling
  hired: number                     // hired people
  housing: number                   // how many hired people the farm can house
  beds: number                      // bunkhouse beds
  hireWhy: string                   // why nobody more can be hired now, or ''
  pickers: { on: boolean; ok: boolean; why: string; perDay: number; digFaster: number }
}

export function labourInfo(c: Campaign): LabourInfo {
  const s = c.season
  const inSeason = c.phase === 'season' && !!s && !s.frozen
  let held = 0
  for (const u of c.crew) if (u.rig === 'tractor') held++
  const owned = tractorsOwned(c)
  const window = inSeason && pickersWindow(c)
  const from = formatDay(c.year, dayIndex(c.year, P.PICKERS_FROM.month, P.PICKERS_FROM.dom))
  const to = formatDay(c.year, dayIndex(c.year, P.PICKERS_TO.month, P.PICKERS_TO.dom))
  const pickersWhy = !inSeason ? 'Pickers are hired during the harvest.' : !window ? `The schools close for the harvest only from ${from} to ${to}.` : ''
  return {
    weekday: s ? WEEKDAYS[weekday(s.year, s.day)] : '',
    restDay: inSeason && !workday(c, s!),
    sundaysOff: c.sundaysOff,
    tractors: owned, tractorsFree: Math.max(0, owned - held), truck: c.upgrades.truck,
    hired: hiredCount(c), housing: housingLimit(c), beds: housingLimit(c) - P.HOUSED_OUT, hireWhy: hireRoom(c),
    pickers: { on: !!s?.pickers, ok: pickersWhy === '', why: pickersWhy, perDay: P.PICKER_DAY, digFaster: P.PICKER_DIG },
  }
}

export interface LandInfo {
  field: number
  name: string
  block: BlockId
  elev: number
  position: string
  tenure: Tenure            // 'rented' or 'none'
  rent: number              // dollars a year, paid when the season begins
  price: number             // dollars to buy, from cash
  soil: number
  vert: number
  streak: number
  house: number             // cwt of potato house that comes with it (the Dufour house, when no other Dufour field is held)
  brings: string            // what holding it brings besides the field, in plain words ('' when nothing)
  travel: number            // days of driving from the home yard
  haul: number              // extra share of digging time for the haul to the nearest potato house, once held
  cover: Cover              // what stands on it: a tract is woods or brush to clear
  stones: number            // 0..1; a tract's once it is cleared
  rentable: boolean         // let by the year; a tract is only for sale
  rentWhy: string           // why it cannot be rented this spring, or ''
  buyWhy: string            // why it cannot be bought this spring, or ''
  down: number              // dollars down to buy it: a quarter of the price
  loan: number              // dollars on the land mortgage if bought
}

// Every parcel the farm does not own: the land it could rent or buy, and what it rents now.
export function landInfo(c: Campaign): LandInfo[] {
  const out: LandInfo[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const fp = c.fields[i]
    if (fp.tenure === 'owned') continue
    const p = PARCELS[i]
    const dufour = p.block === 'dufour' && p.holding === 'field'
    let other = false
    for (let j = 0; j < P.FIELD_COUNT; j++) if (j !== i && PARCELS[j].block === 'dufour' && PARCELS[j].holding === 'field' && c.fields[j].tenure !== 'none') other = true
    const house = dufour && !other ? YARDS[1].cellar : 0
    const timber = standing(fp.cover) ? `${fp.cover === 'woods' ? 'Woods' : 'Brush'} to clear: about ${P.TIMBER[fp.cover]} loads of logs and ${P.FELL_DAYS[fp.cover]} crew-days of felling, then stumps and rocks.` : ''
    const brings = timber || (!dufour ? '' : house > 0 ? `The Dufour potato house comes with it: ${withCommas(house)} cwt of storage.`
      : 'It shares the Dufour potato house the farm already has.')
    const down = Math.round(p.price * P.MORTGAGE_DOWN)
    const spring = c.phase === 'plan'
    const rentWhy = !spring ? 'Land is rented in spring.' : p.holding !== 'field' ? `${p.name} is not let; it can only be bought.` : fp.tenure === 'rented' ? 'Rented already.' : ''
    const buyWhy = !spring ? 'Land is bought in spring.' : p.holding === 'dufour' && !holdsDufour(c) ? `${p.name} goes with the Dufour place: rent or buy a Dufour field first.`
      : c.cash < down ? `Not enough cash for the quarter down: $${withCommas(down)}.` : ''
    out.push({
      field: i, name: p.name, block: p.block, elev: fp.elev, position: POSITION[fp.elev], tenure: fp.tenure,
      rent: p.rent, price: p.price, soil: fp.soil, vert: fp.vert, streak: fp.streak, house, brings,
      travel: travelDays(HOME_YARD, i) * roadFactor(c), haul: haulFactor(c, i, holdsDufour(c) || dufour) - 1,
      cover: fp.cover, stones: standing(fp.cover) ? p.stones : fp.stones, rentable: p.holding === 'field', rentWhy, buyWhy,
      down, loan: p.price - down,
    })
  }
  return out
}

// ---------------------------------------------------------------- buildings and hauling

export interface BuildingInfo {
  kind: BuildingKind
  yard: number              // -1 the home yard, -2 the Dufour yard
  yardName: string
  name: string
  state: 'none' | 'building' | 'built'
  progress: number          // share of the building done, 0..1
  daysLeft: number          // crew-days of building left
  ok: boolean               // can be ordered now
  why: string               // why not, or ''
  cash: number              // the cash part
  logs: number              // loads of logs it takes
  stone: number             // loads of stone it takes
  buyLogs: number           // loads of logs the yard lacks, to be bought at the mill
  buyStone: number          // loads of stone the yard lacks, to be bought from the quarry
  total: number             // dollars in all, with what is bought
  days: number              // crew-days of building
  does: string              // what it does, in one sentence
  catch: string             // its catch, in one sentence
}

// Every kind of building at every yard it can stand in: what stands, what is going up and how far along, and what
// each would cost now.
export function buildingInfo(c: Campaign): BuildingInfo[] {
  const out: BuildingInfo[] = []
  const dufour = holdsDufour(c)
  for (const kind of P.BUILDING_KINDS) {
    const spec = P.BUILDINGS[kind]
    for (const yard of spec.dufour ? [HOME_YARD, DUFOUR_YARD] : [HOME_YARD]) {
      const b = buildingAt(c, kind, yard)
      const cost = buildCost(c, kind)
      const why = buildBlock(c, kind, yard, dufour)
      out.push({
        kind, yard, yardName: YARD_NAME[yard], name: spec.name,
        state: !b ? 'none' : b.built ? 'built' : 'building', progress: b ? b.done / b.need : 0, daysLeft: b ? b.need - b.done : spec.days,
        ok: why === '', why, cash: cost.cash, logs: cost.logs, stone: cost.stone, buyLogs: cost.buyLogs, buyStone: cost.buyStone,
        total: cost.total, days: spec.days, does: spec.does, catch: spec.catch,
      })
    }
  }
  return out
}

export interface HaulInfo {
  field: number
  name: string
  cwt: number               // in barrels in the field
  digging: boolean          // the digger is still at work there
  daysToHaul: number        // days one person with a tractor would take to bring it in
  frostChance: number       // percent: tonight's chance of a frost at the coldest field (the forecast's)
  exposure: string          // what can happen to it, in plain words
  hauler: number            // the person hauling it now, or -1
}

// The crop lying in barrels in the fields, and what it is exposed to until it is hauled in.
export function haulInfo(world: World, c: Campaign): HaulInfo[] {
  const s = c.season
  if (c.phase !== 'season' || !s) return []
  const fc = forecast(world, c, 1)[0]
  const out: HaulInfo[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.inField < 0.5) continue
    const job = s.jobs.find(j => j.kind === 'haul' && j.field === i)
    const hauler = job ? c.crew.find(u => u.job === job.id)?.id ?? -1 : -1
    out.push({
      field: i, name: FIELD_NAMES[i], cwt: f.inField, digging: f.status === 'digging',
      daysToHaul: f.inField / haulRate(c, c.crew[0], i, 'tractor'), frostChance: fc ? fc.frostChance : 0,
      exposure: `A night at ${P.FREEZE_IN_FIELD} C or colder freezes a fifth of it; each bright day greens half a percent.`,
      hauler,
    })
  }
  return out
}

export interface PondInfo {
  built: boolean
  waterings: number         // field-waterings in the pond now
  capacity: number
  rain30: number            // mm of rain in the last 30 days; under POND_DRY_MM the brook is low and the pond dry
  dryBelow: number
}

export function pondInfo(world: World, c: Campaign): PondInfo {
  const s = c.season
  return {
    built: hasBuilt(c, 'pond'), waterings: c.pond, capacity: P.POND_CAP,
    rain30: s ? rain30(world, s.year, s.day - 1) : 0, dryBelow: P.POND_DRY_MM,
  }
}

export interface StandInfo { built: boolean; open: boolean; sales: number; perDay: number }

export function standInfo(c: Campaign): StandInfo {
  const s = c.season
  return { built: hasBuilt(c, 'stand'), open: !!s && c.phase === 'season' && !s.frozen && standOpen(c, s), sales: c.yearStand, perDay: P.STAND_CWT }
}

// ---------------------------------------------------------------- tracts, materials, the mortgage

export interface TractInfo {
  field: number
  name: string
  block: BlockId
  cover: Cover
  coverWord: string
  tenure: Tenure
  holding: Holding          // 'owned' from the start, 'sale', or 'dufour' (for sale while Dufour land is held)
  price: number
  stage: ClearStage         // the next step: fell, stump, rocks, or done
  next: string              // the next step in plain words
  felled: number            // share of the felling done, 0..1
  fellLeft: number          // crew-days of felling left
  timber: number            // loads of logs it holds at a yield of 1 (a feller at woods skill 5)
  shelters: number[]        // held fields its standing cover shelters now
  works: { kind: 'stump' | 'tile'; left: number } | null
  stumpFee: number
  stumpWhy: string          // why the stumps cannot be pulled now, or ''
  stones: number            // what it will have, or has, once cleared
}

export function tractInfo(c: Campaign): TractInfo[] {
  return TRACTS.map(i => {
    const fp = c.fields[i]
    const p = PARCELS[i]
    const cl = clearing(c, i)
    const fellTotal = standing(fp.cover) ? P.FELL_DAYS[fp.cover] : 0
    return {
      field: i, name: p.name, block: p.block, cover: fp.cover, coverWord: COVER_WORD[fp.cover], tenure: fp.tenure, holding: p.holding,
      price: p.price, stage: cl.stage, next: cl.next,
      felled: fellTotal ? fp.felled / fellTotal : 1, fellLeft: fellLeft(c, i), timber: standing(fp.cover) ? P.TIMBER[fp.cover] : 0,
      shelters: sheltered(c, i), works: fp.works ? { ...fp.works } : null,
      stumpFee: P.STUMP_FEE, stumpWhy: stumpBlock(c, i), stones: standing(fp.cover) || fp.cover === 'stumps' ? p.stones : fp.stones,
    }
  })
}

export interface MaterialsInfo {
  logs: number              // loads in the yard
  stone: number             // loads of fieldstone in the yard
  logPrice: number          // dollars a load, sold to the mill
  millPrice: number         // dollars a load of logs bought for a building
  quarryPrice: number       // dollars a load of stone bought for a building
  sellWhy: string           // why logs cannot be sold now, or ''
}

export function materialsInfo(c: Campaign): MaterialsInfo {
  return {
    logs: c.logs, stone: c.stone, logPrice: P.LOG_PRICE, millPrice: P.MILL_PRICE, quarryPrice: P.QUARRY_PRICE,
    sellWhy: c.phase === 'over' ? 'The farm is gone.' : c.logs <= 0 ? 'There are no logs in the yard.' : '',
  }
}

export interface MortgageInfo {
  loans: { field: number; name: string; loan: number; owed: number }[]
  owed: number              // dollars still owed in all
  principal: number         // dollars off the loans the bank takes at this year end
  interest: number          // dollars of interest at this year end
  rate: number              // interest on what is owed, a year
  down: number              // share of a price paid down when land is bought
  payWhy: string            // why extra cannot be paid now, or ''
}

export function mortgageInfo(c: Campaign): MortgageInfo {
  const owed = mortgageOwed(c)
  const due = mortgageDue(c)
  return {
    loans: c.mortgages.map(m => ({ field: m.field, name: FIELD_NAMES[m.field], loan: m.loan, owed: m.owed })),
    owed, principal: due.principal, interest: due.interest, rate: P.MORTGAGE_RATE, down: P.MORTGAGE_DOWN,
    payWhy: owed <= 0 ? 'Nothing is owed on the land.' : c.phase !== 'plan' ? 'Extra is paid on the mortgage in spring.' : c.cash <= 0 ? 'Not enough cash.' : '',
  }
}

export interface OfferInfo {
  id: number
  buyer: string
  variety: VarietyId
  varietyName: string
  cwt: number               // US No. 1 and large tubers
  price: number             // dollars per cwt
  due: Due
  dueBy: string             // when it must be delivered, in words
  value: number             // dollars, if all delivered
  usual: number             // the variety's open-market No. 1 price in an average year, for comparison
  penaltyRate: number       // share of the value of what is not delivered charged at the due date
}

export interface ContractInfo extends OfferInfo {
  delivered: number         // cwt
  needed: number            // cwt still to deliver
  paid: number              // dollars received so far
  settled: boolean          // the due date has passed
  penalty: number           // charged at the due date if settled; otherwise what the shortfall would cost today
}

function offerView(o: { id: number; buyer: string; variety: VarietyId; cwt: number; price: number; due: Due }): OfferInfo {
  const v = variety(o.variety)
  return {
    id: o.id, buyer: o.buyer, variety: o.variety, varietyName: v.name, cwt: o.cwt, price: o.price, due: o.due,
    dueBy: DUE_LABEL[o.due], value: o.cwt * o.price, usual: v.contract ? v.price * P.PROCESSING_PRICE : v.price,
    penaltyRate: P.CONTRACT_PENALTY,
  }
}

// This spring's offers, until the season begins.
export function offerInfo(c: Campaign): OfferInfo[] {
  return c.offers.map(offerView)
}

// This year's accepted contracts.
export function contractInfo(c: Campaign): ContractInfo[] {
  return c.contracts.map(k => {
    const needed = Math.max(0, k.cwt - k.delivered)
    return {
      ...offerView(k), delivered: k.delivered, needed, paid: k.paid, settled: k.settled,
      penalty: k.settled ? k.penalty : needed * k.price * P.CONTRACT_PENALTY,
    }
  })
}

export interface StorageInfo {
  houses: PotatoHouse[]     // each potato house the farm has now, with where it is and what it holds
  capacity: number          // cwt
  stored: number            // cwt in the lots still in hand
  free: number              // cwt of room left
}

export function storageInfo(c: Campaign): StorageInfo {
  const capacity = cellarCapacity(c)
  let stored = 0
  for (const l of openLots(c)) stored += lotCwt(l)
  return { houses: potatoHouses(c), capacity, stored, free: Math.max(0, capacity - stored) }
}

export interface TodayInfo { day: Day; sky: ReturnType<typeof skyOf>; soilT: number; severity: number; sv: number; watch: boolean }

export function today(world: World, c: Campaign): TodayInfo | null {
  const s = c.season
  if (!s) return null
  const d = getDay(world, s.year, s.day)
  return { day: d, sky: skyOf(d), soilT: s.soilT, severity: wallin(d.wetH, d.wetT), sv: s.sv, watch: s.watchDay >= 0 }
}

export function forecast(world: World, c: Campaign, days = 5): ForecastDay[] {
  const s = c.season
  if (!s) return []
  const out: ForecastDay[] = []
  const err = hasBuilt(c, 'station') ? P.STATION_ERROR : 1
  for (let k = 1; k <= days; k++) out.push(forecastFor(world, c.seed, s.year, s.day + k, k, err))
  return out
}

// Why each job on the list is not moving today, by job id ('' when it can go ahead).
export function jobWaits(world: World, c: Campaign): Record<number, string> {
  const s = c.season
  const out: Record<number, string> = {}
  if (!s) return out
  const d = getDay(world, s.year, s.day)
  for (const j of s.jobs) out[j.id] = waitFor(c, s, j, d)
  return out
}
