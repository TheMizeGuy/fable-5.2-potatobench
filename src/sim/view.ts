// What the grower can know. The interface, the renderer and the bots read the game through these
// functions only, so nothing hidden (true tuber weight, latent blight) can leak onto the screen.
import * as P from './params.ts'
import { FIELD_NAMES, jobBlock, jobCost, jobDays, jobWait, JOB_LABEL, knownHills } from './season.ts'
import {
  H_DECAYED, H_DUG, H_EMERGED, H_KNOWN, H_ROGUED, H_SAMPLED, H_VIRUS, H_WILT,
  type Campaign, type Day, type FieldSeason, type JobKind, type World,
} from './types.ts'
import { variety } from './varieties.ts'
import { forecastFor, getDay, skyOf, wallin, type ForecastDay } from './weather.ts'

export interface Estimate { mean: number; lo: number; hi: number; digs: number }

// Total tuber weight in cwt per acre as an experienced eye would put it: a guess that test digs sharpen.
export function estimateYield(c: Campaign, fi: number): Estimate | null {
  const f = c.season?.fields[fi]
  if (!f || f.tiDay < 0 || f.status === 'dug' || f.status === 'lost' || f.status === 'rest') return null
  let mass = 0
  for (let i = 0; i < P.HILLS; i++) if (!(f.hState[i] & (H_DUG | H_SAMPLED | H_ROGUED | H_DECAYED))) mass += f.hMass[i]
  const truth = (mass * P.CWT_PER_HILL_GRAM) / P.FIELD_ACRES
  const n = f.samples.length
  let wSum = 1 / 0.04, mSum = f.estBias / 0.04
  if (n > 0) {
    let r = 0
    for (const x of f.samples) r += x
    wSum += n / 0.1
    mSum += (r / n) * (n / 0.1)
  }
  const bias = mSum / wSum
  const sd = Math.sqrt(1 / wSum)
  const mean = truth * bias
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
  skin: number              // skin set once the vines are dead, 0..1
  bloom: number             // how much of the field is in flower, 0..1
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
    index: fi, name: FIELD_NAMES[fi], elev: fp.elev, position: POSITION[fp.elev], soil: fp.soil, vert: fp.vert, streak: fp.streak,
    crop: plan.crop, status: plan.crop === 'rest' ? 'rest' : 'idle', variety: plan.crop === 'rest' ? 'Oats and clover' : variety(plan.variety).name,
    stage: plan.crop === 'rest' ? 'Resting' : 'Not planted', daysIn: 0, canopy: 0, moisture: 1, moistureLabel: 'good', tooWet: false,
    hillPasses: 0, protect: 0, blightKnown: 0, blightHills: 0, scoutAge: -1, stunted: 0, estimate: null, skin: 0, bloom: 0, wilt: 0, deadDays: -1, lot: -1,
  }
  if (!s) return base
  const f = s.fields[fi]
  const taw = P.TAW_MM[fp.elev]
  base.status = f.status
  base.moisture = 1 - f.dr / taw
  base.tooWet = f.wet >= P.WORKABLE_WET_MM
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
      days: jobDays(c, kind, f), cost: jobCost(c, kind),
      wait: f && d && why === '' ? jobWait(kind, f, d) : '',
    }
  })
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
