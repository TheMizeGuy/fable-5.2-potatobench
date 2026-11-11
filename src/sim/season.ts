// One growing season: the daily step for weather, water, crop, blight and the farmer's work.
import { dayIndex, formatDay, withCommas } from './calendar.ts'
import { gradeHill, newLot, finishLot } from './harvest.ts'
import * as P from './params.ts'
import { nextInt, nextUnit } from './rng.ts'
import {
  H_DECAYED, H_DUG, H_EMERGED, H_KNOWN, H_ROGUED, H_SAMPLED, H_SEEDBLIGHT, H_VIRUS, H_WILT,
  type Campaign, type Day, type FieldSeason, type GameEvent, type Job, type JobKind, type Season, type World,
} from './types.ts'
import { variety } from './varieties.ts'
import { clamp, fieldTmin, getDay, pDays, pUnit, wallin } from './weather.ts'

const GONE = H_ROGUED | H_SAMPLED | H_DUG | H_DECAYED
const NO_CROP = H_ROGUED | H_DUG | H_DECAYED

const F_EMERGED = 1, F_TI = 2, F_CLOSED = 4, F_MATURE = 8, F_DRY = 16, F_SKIN = 32, F_LOGGED = 64

export const FIELD_NAMES = ['North Ridge', 'South Ridge', 'Upper Middle', 'Lower Middle', 'Brook Field', 'Bottom Field']

function zeros(n: number): number[] {
  const a = new Array<number>(n)
  for (let i = 0; i < n; i++) a[i] = 0
  return a
}

function emptyField(): FieldSeason {
  return {
    status: 'rest', variety: 'katahdin', seedVirus: 0,
    plantDay: -1, emergeDay: -1, tiDay: -1, closeDay: -1, matureDay: -1, deadDay: -1, killDay: -1, dugDay: -1,
    pdSoil: 0, pdAir: 0, pdEmerge: 0,
    dr: 0, wet: 8, ksAvg: 1, canopy: 0, green: 0, wateredDay: -1,
    hillPasses: 0, cover: P.COVER_BY_PASSES[0], weeded: false,
    residue: 0, lastSpray: -1,
    scab: 0, hollow: 0, knob: 0, logDays: 0, dryRun: 0, frostT: 0,
    sev: 0, sevPeak: 0, lastScout: -1, knownSev: 0, seenFromRoad: false,
    samples: [], sampleN: [], estBias: 1, eye: 0, seedBlight: 0, frostDay: -1, frostShare: 0, rimeDay: -1, digDone: 0, lotId: -1, flags: 0,
    hState: [], hEmergeAt: [], hPd0: [], hVigor: [], hC: [], hLes: [], hLat: [], hMass: [], hN: [], hTb: [],
  }
}

export function startSeason(world: World, c: Campaign): void {
  const year = c.year
  const startDay = dayIndex(year, P.SEASON_START.month, P.SEASON_START.dom)
  let soilT = 0
  for (let k = 1; k <= 7; k++) soilT += getDay(world, year, startDay - k).tmean
  const s: Season = {
    year, day: startDay, startDay,
    lastDay: dayIndex(year, P.SEASON_LAST.month, P.SEASON_LAST.dom),
    soilT: Math.max(0.5, soilT / 7 - 1),
    sv: 0, svToday: 0, watchDay: -1, frozen: false,
    fields: [], jobs: [], nextJob: 1, workLeft: 1, worked: [], spent: 0, log: [],
  }
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = emptyField()
    const plan = c.plans[i]
    if (plan.crop === 'potato') {
      f.status = 'idle'
      f.variety = plan.variety
      let virus = P.VIRUS_CERTIFIED
      let seedBlight = 0
      if (plan.seed === 'saved') {
        const stock = c.seedStock.find(x => x.variety === plan.variety && x.fields > 0)
        if (stock) { stock.fields -= 1; virus = stock.virus; seedBlight = stock.blight }
      }
      f.seedVirus = virus
      f.seedBlight = seedBlight
    }
    s.fields.push(f)
  }
  c.season = s
}

function push(s: Season, out: GameEvent[], type: string, field: number, level: GameEvent['level'], text: string, data?: GameEvent['data']): void {
  const e: GameEvent = { day: s.day, type, field, text, level }
  if (data) e.data = data
  out.push(e)
  s.log.push(e)
  if (s.log.length > 160) s.log.splice(0, s.log.length - 160)
}

// ---------------------------------------------------------------- jobs

export function jobDays(c: Campaign, kind: JobKind, f: FieldSeason | null): number {
  if (kind === 'spray' && c.upgrades.boom) return 0.1
  if (kind === 'dig' && c.upgrades.harvester) return 1.25
  if (kind === 'water' && c.upgrades.reel) return 0.5
  if (kind === 'rogue' && f) return Math.min(2, 0.2 + 0.08 * knownHills(f))
  return P.JOB_DAYS[kind]
}

export function jobCost(c: Campaign, kind: JobKind): number {
  if (kind === 'water' && c.upgrades.reel) return 200
  return P.JOB_COST[kind]
}

export function knownHills(f: FieldSeason): number {
  let n = 0
  for (let i = 0; i < f.hState.length; i++) if ((f.hState[i] & H_KNOWN) && !(f.hState[i] & GONE)) n++
  return n
}

// Why this job cannot be asked for right now, or '' when it can.
export function jobBlock(c: Campaign, kind: JobKind, field: number): string {
  const s = c.season
  if (!s || c.phase !== 'season') return 'The season is not under way.'
  if (s.frozen) return 'The ground has frozen.'
  const f = s.fields[field]
  if (!f) return 'No such field.'
  if (f.status === 'rest') return 'This field is resting in oats and clover.'
  if (f.status === 'dug') return 'This field is dug.'
  if (f.status === 'lost') return 'This crop is lost.'
  if (s.jobs.some(j => j.kind === kind && j.field === field)) return 'Already on the list.'
  const up = f.emergeDay >= 0
  const alive = f.deadDay < 0
  switch (kind) {
    case 'plant':
      return f.status === 'idle' ? '' : 'Already planted.'
    case 'hill':
      if (f.status === 'idle') return 'Nothing planted yet.'
      if (!up) return 'Wait until the plants are up.'
      if (!alive) return 'The vines are dead.'
      if (f.hillPasses >= 2) return 'Hilled twice already.'
      if (f.canopy >= P.CLOSURE) return 'The rows have closed; hilling now would tear the plants.'
      return ''
    case 'scout':
      if (f.status === 'idle') return 'Nothing planted yet.'
      if (!up) return 'Nothing is up yet.'
      if (!alive) return 'The vines are dead.'
      return ''
    case 'spray':
      if (f.status === 'idle') return 'Nothing planted yet.'
      if (!up) return 'Nothing is up to protect yet.'
      if (!alive) return 'The vines are dead.'
      return ''
    case 'water':
      if (f.status === 'idle') return 'Nothing planted yet.'
      if (!alive) return 'The vines are dead.'
      if (f.wet >= P.WORKABLE_WET_MM) return 'The ground is already wet.'
      return ''
    case 'rogue':
      if (!alive || f.status === 'idle') return 'No living plants to pull.'
      return knownHills(f) > 0 ? '' : 'No blighted plants have been found here. Scout first.'
    case 'sample':
      if (f.tiDay < 0) return 'No tubers have set yet.'
      if (f.status === 'digging') return 'Already being dug.'
      return ''
    case 'kill':
      if (f.tiDay < 0) return 'No tubers have set yet.'
      return alive ? '' : 'The vines are already dead.'
    case 'dig':
      if (f.tiDay < 0) return 'No tubers have set yet.'
      return ''
  }
}

// Why the weather stops this job today, or '' when it can go ahead.
export function jobWait(kind: JobKind, f: FieldSeason, d: Day): string {
  switch (kind) {
    case 'plant': case 'hill': case 'dig':
      if (d.prcp >= 6) return 'raining'
      if (f.wet >= P.WORKABLE_WET_MM) return 'ground too wet'
      return ''
    case 'spray':
      if (d.prcp >= 2) return 'raining'
      if (d.wind >= 7.5) return 'too windy'
      return ''
    case 'kill':
      return d.prcp >= 6 ? 'raining' : ''
    case 'water':
      return d.prcp >= 5 ? 'raining' : ''
    default:
      return d.prcp >= 15 ? 'heavy rain' : ''
  }
}

export function addJob(c: Campaign, kind: JobKind, field: number): string {
  const why = jobBlock(c, kind, field)
  if (why) return why
  const s = c.season!
  s.jobs.push({ id: s.nextJob++, kind, field, done: 0, need: jobDays(c, kind, s.fields[field]) })
  return ''
}

function charge(c: Campaign, amount: number): void {
  c.cash -= amount
  c.yearCosts += amount
}

function plantField(c: Campaign, s: Season, f: FieldSeason, vert: number): void {
  const seedBlight = f.seedBlight
  f.seedBlight = 0
  f.status = 'planted'
  f.plantDay = s.day
  f.estBias = 0.7 + 0.6 * nextUnit(c)
  f.hState = zeros(P.HILLS); f.hEmergeAt = zeros(P.HILLS); f.hPd0 = zeros(P.HILLS); f.hVigor = zeros(P.HILLS)
  f.hC = zeros(P.HILLS); f.hLes = zeros(P.HILLS); f.hLat = zeros(P.HILLS); f.hMass = zeros(P.HILLS)
  f.hN = zeros(P.HILLS); f.hTb = zeros(P.HILLS)
  for (let i = 0; i < P.HILLS; i++) {
    let st = 0
    if (nextUnit(c) < f.seedVirus) st |= H_VIRUS
    if (nextUnit(c) < seedBlight * 0.5) st |= H_SEEDBLIGHT
    if (nextUnit(c) < vert) st |= H_WILT
    f.hState[i] = st
    f.hEmergeAt[i] = P.EMERGE_PD * (0.85 + 0.35 * nextUnit(c))
    f.hVigor[i] = ((st & H_VIRUS) ? P.VIRUS_VIGOR : 1) * (0.88 + 0.24 * nextUnit(c))
  }
}

function tryInfect(c: Campaign, f: FieldSeason, i: number, leafSus: number, cool: boolean): void {
  const st = f.hState[i]
  if (!(st & H_EMERGED) || (st & GONE) || f.hLes[i] > 0 || f.hLat[i] > 0 || f.hC[i] <= 0.02) return
  if (nextUnit(c) < leafSus * (1 - P.PROTECT * f.residue)) f.hLat[i] = P.LATENT_DAYS + (cool ? 2 : 0)
}

// Hills whose tubers will come out at the dig.
function standingHills(f: FieldSeason): number {
  let n = 0
  for (let i = 0; i < P.HILLS; i++) {
    const st = f.hState[i]
    if ((st & H_EMERGED) && !(st & NO_CROP)) n++
  }
  return n
}

function completeJob(world: World, c: Campaign, s: Season, job: Job, d: Day, out: GameEvent[]): void {
  const f = s.fields[job.field]
  const name = FIELD_NAMES[job.field]
  if (job.kind !== 'dig') charge(c, jobCost(c, job.kind))
  switch (job.kind) {
    case 'plant':
      plantField(c, s, f, c.fields[job.field].vert)
      push(s, out, 'planted', job.field, 'info', `${name} is planted to ${variety(f.variety).name}.`)
      break
    case 'hill':
      f.hillPasses++
      f.cover = Math.max(f.cover, P.COVER_BY_PASSES[f.hillPasses])
      f.weeded = true
      push(s, out, 'hilled', job.field, 'info', `${name} hilled${f.hillPasses === 2 ? ' a second time' : ''}.`)
      break
    case 'scout': {
      f.lastScout = s.day
      let found = 0
      for (let i = 0; i < P.HILLS; i++) {
        const st = f.hState[i]
        if (!(st & H_EMERGED) || (st & GONE)) continue
        if (f.hLes[i] >= P.LESION_START && ((st & H_KNOWN) || nextUnit(c) < P.SCOUT_DETECT)) {
          f.hState[i] = st | H_KNOWN
          found++
        }
      }
      f.knownSev = knownSeverity(f)
      const virus = f.hState.filter(st => (st & H_VIRUS) && (st & H_EMERGED) && !(st & GONE)).length
      push(s, out, 'scout', job.field, found ? 'bad' : 'good',
        found ? `Walked ${name}: blight lesions on ${found} ${found === 1 ? 'hill' : 'hills'}.` : `Walked ${name}: no blight found.`,
        { found, virus })
      break
    }
    case 'spray':
      f.residue = 1
      f.lastSpray = s.day
      push(s, out, 'sprayed', job.field, 'info', `${name} sprayed with protectant.`)
      break
    case 'water':
      f.dr = Math.max(0, f.dr - P.IRRIGATION_MM)
      f.wateredDay = s.day
      push(s, out, 'watered', job.field, 'info', `${name} watered, about an inch.`)
      break
    case 'rogue': {
      let pulled = 0
      const standing = standingHills(f)
      for (let i = 0; i < P.HILLS; i++) {
        const st = f.hState[i]
        if ((st & H_KNOWN) && !(st & GONE)) {
          f.hState[i] = st | H_ROGUED
          f.hC[i] = 0; f.hLes[i] = 0; f.hLat[i] = 0; f.hMass[i] = 0
          pulled++
        }
      }
      f.knownSev = 0
      if (standing > 0) f.eye *= 1 - pulled / standing
      push(s, out, 'rogued', job.field, 'info', `Pulled and bagged ${pulled} blighted ${pulled === 1 ? 'hill' : 'hills'} in ${name}.`, { pulled })
      break
    }
    case 'sample': {
      const pool: number[] = []
      for (let i = 0; i < P.HILLS; i++) {
        const st = f.hState[i]
        if ((st & H_EMERGED) && !(st & GONE)) pool.push(i)
      }
      if (!pool.length) break
      const standing = standingHills(f)
      const expect = standing > 0 ? f.eye / standing : 0
      const i = pool[nextInt(c, pool.length)]
      const lot = newLot(c, job.field, f, s.day, false)
      const tubers = gradeHill(c, s, f, job.field, i, lot, d)
      f.samples.push(expect > 0 ? f.hMass[i] / expect : 1)
      f.sampleN.push(tubers.length)
      // The lifted plant stops growing; its tubers go in with the crop.
      f.hState[i] |= H_SAMPLED
      const grams = Math.round(f.hMass[i])
      f.hC[i] = 0; f.hLes[i] = 0; f.hLat[i] = 0
      push(s, out, 'sample', job.field, 'info',
        `Test dig in ${name}: ${tubers.length} tubers, ${(grams / 453.6).toFixed(1)} lb under one hill.`,
        { hill: i, grams, weights: tubers.map(t => Math.round(t.w)), marks: tubers.map(t => t.mark) })
      break
    }
    case 'kill':
      f.killDay = s.day
      f.deadDay = s.day
      f.status = 'dead'
      for (let i = 0; i < P.HILLS; i++) f.hC[i] *= 0.08
      push(s, out, 'killed', job.field, 'info', `Vines killed in ${name}. Skins set in about two weeks.`)
      break
    case 'dig': {
      const lot = c.lots.find(l => l.id === f.lotId)!
      f.status = 'dug'
      f.dugDay = s.day
      finishLot(c, f, lot)
      const total = lot.grades.no1 + lot.grades.chef + lot.grades.b + lot.grades.no2 + lot.skinned
      push(s, out, 'dug', job.field, 'good', `${name} is dug: ${withCommas(total)} cwt to sell, ${withCommas(lot.grades.cull)} cwt culled.`, { lot: lot.id })
      break
    }
  }
}

function digProgress(c: Campaign, s: Season, f: FieldSeason, field: number, job: Job, d: Day): void {
  if (f.lotId < 0) {
    const lot = newLot(c, field, f, s.day, true)
    f.lotId = lot.id
    f.status = 'digging'
    charge(c, jobCost(c, 'dig'))
    s.jobs = s.jobs.filter(j => j.field !== field || j.kind === 'dig')
    if (f.deadDay < 0) f.deadDay = s.day
  }
  const lot = c.lots.find(l => l.id === f.lotId)!
  const upto = Math.min(P.HILLS, Math.floor((job.done / job.need) * P.HILLS + 1e-6))
  for (let i = f.digDone; i < upto; i++) {
    const st = f.hState[i]
    if ((st & H_EMERGED) && !(st & NO_CROP)) gradeHill(c, s, f, field, i, lot, d)
    f.hState[i] = st | H_DUG
    f.hC[i] = 0
  }
  f.digDone = upto
}

function runJobs(world: World, c: Campaign, s: Season, d: Day, out: GameEvent[]): void {
  s.workLeft = 1
  s.worked = []
  let k = 0
  while (k < s.jobs.length && s.workLeft > 1e-6) {
    const job = s.jobs[k]
    const f = s.fields[job.field]
    // Every job is re-checked against the field as it now is, begun or not (a dig under way is the exception).
    if (!(job.kind === 'dig' && job.done > 0)) {
      s.jobs.splice(k, 1)
      const why = jobBlock(c, job.kind, job.field)
      if (why) {
        push(s, out, 'dropped', job.field, 'warn', `${JOB_LABEL[job.kind]} in ${FIELD_NAMES[job.field]} dropped. ${why}`)
        continue
      }
      s.jobs.splice(k, 0, job)
      if (job.done === 0) job.need = jobDays(c, job.kind, f)
    }
    if (jobWait(job.kind, f, d)) { k++; continue }
    const use = Math.min(s.workLeft, job.need - job.done)
    job.done += use
    s.workLeft -= use
    s.worked.push({ kind: job.kind, field: job.field })
    if (job.kind === 'dig') digProgress(c, s, f, job.field, job, d)
    if (job.done >= job.need - 1e-6) {
      s.jobs.splice(k, 1)
      completeJob(world, c, s, job, d, out)
    } else k++
  }
}

export const JOB_LABEL: Record<JobKind, string> = {
  plant: 'Planting', hill: 'Hilling', scout: 'Scouting', spray: 'Spraying', water: 'Watering',
  rogue: 'Roguing', sample: 'Test dig', kill: 'Vine kill', dig: 'Digging',
}

// ---------------------------------------------------------------- the crop

function knownSeverity(f: FieldSeason): number {
  let sum = 0, n = 0
  for (let i = 0; i < P.HILLS; i++) {
    const st = f.hState[i]
    if (!(st & H_EMERGED) || (st & GONE)) continue
    n++
    if (st & H_KNOWN) sum += f.hLes[i]
  }
  return n ? sum / n : 0
}

function fieldDay(world: World, c: Campaign, s: Season, fi: number, d: Day, sevRegion: number, out: GameEvent[]): void {
  const f = s.fields[fi]
  const fp = c.fields[fi]
  const v = variety(f.variety)
  const name = FIELD_NAMES[fi]
  const elev = fp.elev
  const taw = P.TAW_MM[elev]

  // Water balance (FAO-56, one bucket).
  const raw = P.DEPLETION_P * taw
  const ks = f.dr <= raw ? 1 : Math.max(0, (taw - f.dr) / (taw - raw))
  const kc = P.KC_BARE + (P.KC_FULL - P.KC_BARE) * f.canopy
  f.dr += kc * d.et0 * ks - d.prcp
  if (f.dr < 0) f.dr = 0
  if (f.dr > taw) f.dr = taw
  f.wet = f.wet * P.DRAIN[elev] + d.prcp
  const logged = f.wet > P.WATERLOG_MM
  if (logged) f.logDays++
  const ksTol = ks + (1 - ks) * v.drought * 0.5
  const ksCrop = (P.STRESS_FLOOR + (1 - P.STRESS_FLOOR) * ksTol) * (logged ? 0.6 : 1)
  f.ksAvg = 0.8 * f.ksAvg + 0.2 * ks
  if (d.prcp >= P.STORM_MM) f.cover = Math.max(P.COVER_BY_PASSES[0], f.cover - P.STORM_EROSION)

  const alive = f.deadDay < 0
  const bulking = f.tiDay >= 0 && alive
  if (bulking) {
    if (ks < 0.65) f.dryRun++
    else if (f.dryRun > 0) {
      if (f.dryRun >= 5) { f.knob++; f.hollow++ }
      f.dryRun = 0
    }
    if (s.day - f.tiDay <= 35 && f.dr > 0.55 * taw) f.scab++
    if (s.day - f.tiDay <= 28 && s.soilT + P.SOIL_T_OFFSET[elev] < 12.8) f.hollow += 0.2
  }
  if (alive && !(f.flags & F_DRY) && f.emergeDay >= 0 && f.ksAvg < 0.55) {
    f.flags |= F_DRY
    push(s, out, 'dry', fi, 'warn', `${name} is drying out. The plants are wilting by afternoon.`)
  }
  if (!(f.flags & F_LOGGED) && f.logDays >= 3) {
    f.flags |= F_LOGGED
    push(s, out, 'logged', fi, 'warn', `Water is standing in ${name}.`)
  }

  // Thermal time.
  const pAir = pDays(d.tmin, d.tmax)
  const soilT = s.soilT + P.SOIL_T_OFFSET[elev]
  f.pdSoil += pUnit(soilT)
  f.pdAir += pAir
  const tUnit = pAir / 10
  const tminF = fieldTmin(d, elev)
  if (tminF <= 0) f.rimeDay = s.day

  // Late blight weather for this field.
  const wetH = Math.min(24, d.wetH + P.HUMID_BONUS[elev] + (f.wateredDay === s.day ? 3 : 0))
  const sev = alive ? wallin(wetH, d.wetT) : 0
  const hotDry = d.tmax >= 29 && d.wetH <= 4
  const cool = d.tmean < 13

  if (alive && f.emergeDay >= 0) {
    const pressure = clamp((s.sv - P.SV_THRESHOLD) / 25, 0.25, 1.5)
    if (s.sv >= P.SV_THRESHOLD && sevRegion >= 1 && nextUnit(c) < P.ARRIVE_PER_SEV * sevRegion * pressure) {
      tryInfect(c, f, nextInt(c, P.HILLS), v.blightLeaf, cool)
    }
    if (sev >= 1 && !hotDry) {
      let spor = 0
      for (let i = 0; i < P.HILLS; i++) {
        if (f.hLes[i] < P.LESION_START || f.hC[i] <= 0.02 || (f.hState[i] & GONE)) continue
        const strength = Math.sqrt(f.hLes[i]) * (0.4 + 0.2 * sev) * P.SPREAD
        spor += Math.sqrt(f.hLes[i])
        const r = Math.floor(i / P.COLS), col = i % P.COLS
        for (let dr = -2; dr <= 2; dr++) {
          const rr = r + dr
          if (rr < 0 || rr >= P.ROWS) continue
          for (let dc = -2; dc <= 2; dc++) {
            const cc = col + dc
            if (cc < 0 || cc >= P.COLS || (dr === 0 && dc === 0)) continue
            const j = rr * P.COLS + cc
            if (f.hLes[j] > 0 || f.hLat[j] > 0) continue
            if (nextUnit(c) < strength / (dr * dr + dc * dc)) tryInfect(c, f, j, v.blightLeaf, cool)
          }
        }
      }
      if (spor > 0) {
        const pJump = Math.min(0.9, P.JUMP * spor * (sev / 4))
        if (nextUnit(c) < pJump * 8) tryInfect(c, f, nextInt(c, P.HILLS), v.blightLeaf, cool)
        for (let o = 0; o < P.FIELD_COUNT; o++) {
          if (o === fi) continue
          const g = s.fields[o]
          if (g.emergeDay < 0 || g.deadDay >= 0) continue
          const near = Math.abs(o - fi) <= 2 ? 1 : 0.5
          if (nextUnit(c) < pJump * near) tryInfect(c, g, nextInt(c, P.HILLS), variety(g.variety).blightLeaf, cool)
        }
      }
    }
  }

  // Hills.
  const soilF = 1 - P.SOIL_YIELD * (1 - fp.soil)
  const matAt = v.matPd
  const weedF = f.weeded || f.closeDay < 0 ? 1 : P.UNWEEDED_FACTOR
  const frostKill = alive && tminF <= P.LEAF_FROST_START ? clamp((P.LEAF_FROST_START - tminF) / P.LEAF_FROST_SPAN, 0, 1) : 0
  const rainWash = d.prcp >= 4 ? Math.min(1, d.prcp / 20) * (1 - 0.8 * f.cover) : 0
  let planted = 0, up = 0, sumC = 0, sumG = 0, sumLes = 0, sumAge = 0, living = 0
  const canopyBefore = f.canopy
  for (let i = 0; i < P.HILLS; i++) {
    let st = f.hState[i]
    if (st & GONE) continue
    planted++
    if (!(st & H_EMERGED)) {
      if (!alive) continue
      if (f.pdSoil >= f.hEmergeAt[i]) {
        st |= H_EMERGED
        f.hState[i] = st
        f.hC[i] = P.CANOPY_START
        f.hPd0[i] = f.pdAir
        if (st & H_SEEDBLIGHT) f.hLat[i] = P.LATENT_DAYS + 3
      } else {
        if (soilT < 7 && nextUnit(c) < (soilT < 4.5 ? 0.04 : 0.016) * (f.wet > 8 ? 2 : 1)) f.hState[i] = st | H_DECAYED
        continue
      }
    }
    up++
    const age = f.pdAir - f.hPd0[i]
    sumAge += age
    if (alive) {
      let cv = f.hC[i]
      if (frostKill > 0) cv = Math.max(0.02, cv * (1 - frostKill))
      if (age < ((st & H_WILT) ? matAt * P.VERT_EARLY : matAt)) cv += P.CANOPY_RATE * tUnit * (0.4 + 0.6 * ksCrop) * (0.6 + 0.4 * f.hVigor[i]) * cv * (1 - cv)
      else cv = Math.max(0, cv - P.SENESCE_RATE * (0.5 + tUnit / 2) * (1.3 - 0.3 * ksCrop))
      f.hC[i] = cv

      if (f.hLat[i] > 0) {
        f.hLat[i] -= 1
        if (f.hLat[i] <= 0) { f.hLat[i] = 0; f.hLes[i] = P.LESION_START }
      } else if (f.hLes[i] > 0 && !hotDry) {
        const grow = sev >= 1 ? P.LESION_GROW * sev * v.blightLeaf * (1 - 0.3 * f.residue) : d.rh >= 80 ? 0.006 : 0
        f.hLes[i] = Math.min(1, f.hLes[i] + grow)
      }
      const les = f.hLes[i]
      const green = cv * (1 - les)
      if (rainWash > 0 && les >= P.LESION_START) f.hTb[i] += les * rainWash
      if (bulking && f.hN[i] > 0) {
        const part = clamp((age - v.tiPd) / P.PARTITION_PD, 0, 1)
        f.hMass[i] += P.BULK_G_PER_MJ * d.rs * green * tUnit * ksCrop * f.hVigor[i] * soilF * part * v.bulk * weedF
      }
      sumC += cv; sumG += green
      if (cv > 0.02) { living++; sumLes += les }
    }
  }
  const denom = planted > 0 ? planted : 1
  f.canopy = alive ? sumC / denom : 0
  f.green = alive ? sumG / denom : 0
  f.sev = living > 0 ? sumLes / living : 0
  if (f.sev > f.sevPeak) f.sevPeak = f.sev
  f.knownSev = knownSeverity(f)
  if (bulking) {
    let stunted = 0
    for (let i = 0; i < P.HILLS; i++) if ((f.hState[i] & H_VIRUS) && (f.hState[i] & H_EMERGED) && !(f.hState[i] & GONE)) stunted++
    const seen = f.canopy * (1 - f.knownSev) * (1 - (1 - P.VIRUS_VIGOR) * (up > 0 ? stunted / up : 0))
    const part = clamp((f.pdAir - f.pdEmerge - v.tiPd) / P.PARTITION_PD, 0, 1)
    f.eye += P.BULK_G_PER_MJ * d.rs * seen * tUnit * ksCrop * soilF * part * v.bulk * weedF * planted
  }

  // Protectant wears off, faster while the canopy is still adding leaf, and washes off in rain.
  if (f.residue > 0) {
    const newLeaf = Math.max(0, f.canopy - canopyBefore)
    f.residue *= P.RESIDUE_DECAY * (1 - Math.min(0.5, newLeaf * 4))
    // exp(-0.56 x rain in cm), as its second-order rational approximation (no exp in the core).
    if (d.prcp > 0) { const r = d.prcp / 10; f.residue /= 1 + 0.56 * r + 0.157 * r * r }
    if (f.residue < 0.02) f.residue = 0
  }

  // Tubers in frozen ground.
  if (f.tiDay >= 0 && tminF <= P.TUBER_FROST_START && d.snwd < 30) {
    f.frostT = Math.min(0.9, f.frostT + (1 - 0.85 * f.cover) * clamp((P.TUBER_FROST_START - tminF) / 5, 0, 1) * 0.4)
  }

  // Milestones.
  if (f.status === 'planted' && up * 2 >= planted && up > 0) {
    f.status = 'growing'
    f.emergeDay = s.day
    f.pdEmerge = f.pdAir
    f.flags |= F_EMERGED
    const gaps = Math.round((1 - planted / P.HILLS) * 100)
    if (gaps >= 8) push(s, out, 'emerged', fi, 'warn', `${name} is up, but thin: about ${gaps}% of the seed rotted in cold ground.`, { gaps })
    else push(s, out, 'emerged', fi, 'good', `${name} is up: rows of green from the road.`)
  }
  if (f.status === 'planted' && planted === 0) {
    f.status = 'lost'
    push(s, out, 'lost', fi, 'bad', `The seed rotted in ${name}. Cold, wet ground.`)
    return
  }
  if (alive && f.emergeDay >= 0) {
    if (frostKill >= 0.05) { f.frostDay = s.day; f.frostShare = frostKill }
    if (frostKill >= 0.25) {
      push(s, out, 'frost', fi, 'bad', `Frost in ${name}: ${Math.round(frostKill * 100)}% of the leaf blackened.`, { kill: Math.round(frostKill * 100) })
    }
    if (f.tiDay < 0 && f.pdAir - f.pdEmerge >= v.tiPd) {
      f.tiDay = s.day
      const water = 0.55 + 0.45 * f.ksAvg
      for (let i = 0; i < P.HILLS; i++) {
        const st = f.hState[i]
        if (!(st & H_EMERGED) || (st & GONE)) continue
        const n = v.set * (0.72 + 0.56 * nextUnit(c)) * water * ((st & H_VIRUS) ? 0.85 : 1)
        f.hN[i] = Math.max(1, Math.round(n))
      }
      push(s, out, 'ti', fi, 'info', `${name}: tubers are setting. From here the crop is underground.`)
    }
    if (f.closeDay < 0 && f.canopy >= P.CLOSURE) {
      f.closeDay = s.day
      push(s, out, 'closed', fi, 'info', `${name}: the rows have closed.${f.hillPasses === 0 ? ' It was never hilled.' : ''}`)
    }
    if (f.matureDay < 0 && up > 0 && sumAge / up >= matAt) {
      f.matureDay = s.day
      push(s, out, 'mature', fi, 'info', `${name}: the vines are starting to go down.`)
    }
    if (!f.seenFromRoad && f.sev >= P.ROAD_SEV) {
      f.seenFromRoad = true
      for (let i = 0; i < P.HILLS; i++) if (f.hLes[i] >= P.LESION_START && !(f.hState[i] & GONE)) f.hState[i] |= H_KNOWN
      f.knownSev = knownSeverity(f)
      push(s, out, 'blightSeen', fi, 'bad', `Blight in ${name}: brown patches you can see from the road.`)
    }
    if (f.seenFromRoad) {
      for (let i = 0; i < P.HILLS; i++) if (f.hLes[i] >= 0.2 && !(f.hState[i] & GONE)) f.hState[i] |= H_KNOWN
    }
    if (f.tiDay >= 0 && f.green < 0.03) {
      f.deadDay = s.day
      f.status = 'dead'
      const why = frostKill > 0.5 ? 'Frost finished the vines' : f.sev > 0.5 ? 'Blight has taken the vines' : 'The vines are down'
      push(s, out, 'vinesDead', fi, f.sev > 0.5 || frostKill > 0.5 ? 'bad' : 'info', `${why} in ${name}.`)
    }
  }
  if (f.deadDay >= 0 && !(f.flags & F_SKIN) && s.day - f.deadDay >= P.SKIN_DAYS && f.status === 'dead') {
    f.flags |= F_SKIN
    push(s, out, 'skinSet', fi, 'good', `${name}: skins are set. Ready to dig.`)
  }
}

export function stepDay(world: World, c: Campaign): GameEvent[] {
  const s = c.season!
  const out: GameEvent[] = []
  if (s.frozen) return out
  const d = getDay(world, s.year, s.day)

  runJobs(world, c, s, d, out)

  const nb = world.neighbor[String(s.year)]
  if (nb) {
    const news = s.day === nb.plant ? 'are planting' : s.day === nb.hill1 ? 'are hilling' : s.day === nb.firstSpray ? 'have the sprayer out'
      : s.day === nb.kill ? 'are killing their vines' : s.day === nb.dig ? 'have started digging' : ''
    if (news) push(s, out, 'neighbor', -1, 'info', `From the road: the neighbours ${news}.`)
  }

  s.soilT += P.SOIL_T_GAIN * (d.tmean - s.soilT)
  let sevRegion = 0
  if (s.day >= dayIndex(s.year, P.SV_START.month, P.SV_START.dom)) {
    sevRegion = wallin(d.wetH, d.wetT)
    s.sv += sevRegion
    if (s.watchDay < 0 && s.sv >= P.SV_THRESHOLD) {
      s.watchDay = s.day
      push(s, out, 'watch', -1, 'warn', `Blight watch: ${P.SV_THRESHOLD} severity values have accumulated. Spores can be expected from here on.`)
    }
  }
  s.svToday = sevRegion

  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const st = s.fields[i].status
    if (st === 'planted' || st === 'growing' || st === 'dead' || st === 'digging') fieldDay(world, c, s, i, d, sevRegion, out)
  }

  const freeze = s.day >= s.lastDay || (s.day > dayIndex(s.year, 9, 1) && s.soilT <= P.FREEZE_UP_SOIL_T)
  if (freeze) {
    s.frozen = true
    s.jobs = []
    for (let i = 0; i < P.FIELD_COUNT; i++) {
      const f = s.fields[i]
      if (f.status === 'digging') {
        const lot = c.lots.find(l => l.id === f.lotId)!
        finishLot(c, f, lot)
        f.status = 'dug'
        f.dugDay = s.day
        push(s, out, 'dug', i, 'bad', `${FIELD_NAMES[i]} froze before the digging was done. What was out of the ground is saved.`, { lot: lot.id })
      } else if (f.status === 'planted' || f.status === 'growing' || f.status === 'dead') {
        f.status = 'lost'
        push(s, out, 'lost', i, 'bad', `${FIELD_NAMES[i]} froze in the ground. The crop is lost.`)
      } else if (f.status === 'idle') {
        f.status = 'lost'
      }
    }
    push(s, out, 'freeze', -1, 'info', `${formatDay(s.year, s.day)}: the ground has frozen. The season is over.`)
  }
  s.day++
  c.steps++
  return out
}

export function seasonDone(c: Campaign): boolean {
  const s = c.season
  if (!s) return false
  if (s.frozen) return true
  return s.fields.every(f => f.status === 'rest' || f.status === 'dug' || f.status === 'lost')
}
