// What the grower can know. The interface, the renderer and the bots read the game through these
// functions only, so nothing hidden (true tuber weight, latent blight) can leak onto the screen.
import { DUE_LABEL } from './buyers.ts'
import { withCommas } from './calendar.ts'
import { cellarCapacity, openLots, potatoHouses, type PotatoHouse } from './campaign.ts'
import { travelDays } from './crew.ts'
import { HOME_YARD, PARCELS, YARDS, type BlockId } from './farm.ts'
import { lotCwt } from './harvest.ts'
import * as P from './params.ts'
import { FIELD_NAMES, haulFactor, holdsDufour, jobBlock, jobCost, jobDays, jobWait, JOB_LABEL, knownHills } from './season.ts'
import {
  H_DECAYED, H_DUG, H_EMERGED, H_KNOWN, H_ROGUED, H_SAMPLED, H_VIRUS, H_WILT,
  type Campaign, type Day, type Due, type FieldSeason, type JobKind, type Tenure, type UnitKind, type VarietyId, type World,
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
}

const POSITION = ['bottom land', 'mid slope', 'ridge']

export function fieldInfo(c: Campaign, fi: number): FieldInfo {
  const fp = c.fields[fi]
  const plan = c.plans[fi]
  const s = c.season
  const base: FieldInfo = {
    index: fi, name: FIELD_NAMES[fi], tenure: fp.tenure, block: PARCELS[fi].block,
    elev: fp.elev, position: POSITION[fp.elev], soil: fp.soil, vert: fp.vert, streak: fp.streak,
    crop: plan.crop, status: plan.crop === 'rest' ? 'rest' : 'idle', variety: plan.crop === 'rest' ? 'Oats and clover' : variety(plan.variety).name,
    stage: plan.crop === 'rest' ? 'Resting' : 'Not planted', daysIn: 0, canopy: 0, moisture: 1, moistureLabel: 'good', tooWet: false,
    hillPasses: 0, protect: 0, blightKnown: 0, blightHills: 0, scoutAge: -1, stunted: 0, estimate: null, tubers: null, skin: 0, bloom: 0, stand: 1, frosted: 0, rime: false, wilt: 0, deadDays: -1, lot: -1,
  }
  const f = s?.fields[fi]
  if (fp.tenure === 'none' || f?.status === 'off') {
    base.status = 'off'
    base.crop = 'rest'
    base.variety = ''
    base.stage = 'Not the farm\'s'
    return base
  }
  if (!s || !f) return base
  const taw = P.TAW_MM[fp.elev]
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
      days: jobDays(c, kind, f, fi), cost: jobCost(c, kind),
      wait: f && d && why === '' ? jobWait(kind, f, d) : '',
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
}

// Every parcel the farm does not own: the land it could rent or buy, and what it rents now.
export function landInfo(c: Campaign): LandInfo[] {
  const out: LandInfo[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const fp = c.fields[i]
    if (fp.tenure === 'owned') continue
    const p = PARCELS[i]
    const dufour = p.block === 'dufour'
    let other = false
    for (let j = 0; j < P.FIELD_COUNT; j++) if (j !== i && PARCELS[j].block === 'dufour' && c.fields[j].tenure !== 'none') other = true
    const house = dufour && !other ? YARDS[1].cellar : 0
    const brings = !dufour ? '' : house > 0 ? `The Dufour potato house comes with it: ${withCommas(house)} cwt of storage.`
      : 'It shares the Dufour potato house the farm already has.'
    out.push({
      field: i, name: p.name, block: p.block, elev: fp.elev, position: POSITION[fp.elev], tenure: fp.tenure,
      rent: p.rent, price: p.price, soil: fp.soil, vert: fp.vert, streak: fp.streak, house, brings,
      travel: travelDays(HOME_YARD, i), haul: haulFactor(c, i, holdsDufour(c) || dufour) - 1,
    })
  }
  return out
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
  for (let k = 1; k <= days; k++) out.push(forecastFor(world, c.seed, s.year, s.day + k, k))
  return out
}

// Why each job on the list is not moving today, by job id ('' when it can go ahead).
export function jobWaits(world: World, c: Campaign): Record<number, string> {
  const s = c.season
  const out: Record<number, string> = {}
  if (!s) return out
  const d = getDay(world, s.year, s.day)
  for (const j of s.jobs) out[j.id] = jobWait(j.kind, s.fields[j.field], d)
  return out
}
