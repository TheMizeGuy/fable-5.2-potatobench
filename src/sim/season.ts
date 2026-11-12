// One growing season: the daily step for weather, water, crop, blight and the people's work.
import { dayIndex, formatDay, SUNDAY, weekday, withCommas } from './calendar.ts'
import { buildWork, hasBuilt, pondServes, rain30, travel, YARD_NAME } from './buildings.ts'
import { basePrice } from './market.ts'
import { turnBefore } from './crew.ts'
import { distance, DUFOUR_YARD, holdsDufourLand, HOME_FIELDS, HOME_YARD, PARCELS } from './farm.ts'
import { ageLot, gradeHill, newLot, finishLot, lotCwt } from './harvest.ts'
import { brushedNow, COVER_WORD, envTmin, fell, fellLeft, fieldEnv, isField, isOpen, standing, stoneBruise, stoneSpeed, stumped } from './land.ts'
import * as P from './params.ts'
import { breakdownChance, CHOICE_LABEL, defaultChoice, hurtChance, INCIDENT_TITLE, incidentText } from './incidents.ts'
import { applicantsFor, gainXp, hurt, jobSkill, moodTarget, payOf, resting, scoutChance, SKILL_LABEL, speed, sprayCover, willDo, zeroSkills } from './people.ts'
import { hashUnit, nextInt, nextUnit } from './rng.ts'
import {
  H_DECAYED, H_DUG, H_EMERGED, H_KNOWN, H_ROGUED, H_SAMPLED, H_SEEDBLIGHT, H_VIRUS, H_WILT,
  type Building, type Campaign, type Cause, type Day, type FieldSeason, type FieldStatus, type GameEvent, type Incident, type IncidentKind, type Job, type JobKind, type Lot,
  type JobBy, type Rig, type RoutineKind, type Season, type Skill, type Unit, type World,
} from './types.ts'
import { variety } from './varieties.ts'
import { clamp, getDay, pDays, pUnit, skyOf, wallin } from './weather.ts'

const GONE = H_ROGUED | H_SAMPLED | H_DUG | H_DECAYED
const NO_CROP = H_ROGUED | H_DUG | H_DECAYED

const F_EMERGED = 1, F_TI = 2, F_CLOSED = 4, F_MATURE = 8, F_DRY = 16, F_SKIN = 32, F_LOGGED = 64

const EPS = 1e-6

export const FIELD_NAMES: string[] = PARCELS.map(p => p.name)

function zeros(n: number): number[] {
  const a = new Array<number>(n)
  for (let i = 0; i < n; i++) a[i] = 0
  return a
}

function emptyField(status: FieldStatus = 'rest'): FieldSeason {
  return {
    status, variety: 'katahdin', seedVirus: 0,
    plantDay: -1, emergeDay: -1, tiDay: -1, closeDay: -1, matureDay: -1, deadDay: -1, killDay: -1, dugDay: -1,
    pdSoil: 0, pdAir: 0, pdEmerge: 0,
    dr: 0, wet: 8, ksAvg: 1, canopy: 0, green: 0, wateredDay: -1,
    hillPasses: 0, cover: P.COVER_BY_PASSES[0], weeded: false,
    residue: 0, lastSpray: -1,
    scab: 0, hollow: 0, knob: 0, logDays: 0, dryRun: 0, frostT: 0,
    sev: 0, sevPeak: 0, lastScout: -1, knownSev: 0, seenFromRoad: false,
    samples: [], sampleN: [], estBias: 1, eye: 0, seedBlight: 0, frostDay: -1, frostShare: 0, rimeDay: -1, digDone: 0,
    inField: 0, weighed: false, lotId: -1, flags: 0,
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
    fields: [], jobs: [], nextJob: 1, worked: [], spent: 0, log: [], pickers: false,
  }
  // Everyone starts the season rested in the home yard; hired people have their first month paid with the plan.
  for (const u of c.crew) {
    u.at = HOME_YARD; u.to = HOME_YARD; u.road = 0; u.job = -1; u.rig = ''
    u.tired = 0; u.low = 0
    u.paidTo = startDay + P.WAGE_DAYS
  }
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    // Land the farm does not hold, and a tract still to clear, are no field this season.
    if (!isField(c, i)) { s.fields.push(emptyField('off')); continue }
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
  // The buildings under way go on the list; the pond is full from the spring melt.
  for (const b of c.buildings) if (buildable(c, b)) s.jobs.push(buildJob(s, b))
  if (hasBuilt(c, 'pond')) c.pond = P.POND_CAP
  c.season = s
}

export function buildJob(s: Season, b: Building): Job {
  return { id: s.nextJob++, kind: 'build', field: b.yard, done: b.done, need: b.need, unit: -1, by: 'you', building: b.id }
}

function push(s: Season, out: GameEvent[], type: string, field: number, level: GameEvent['level'], text: string, data?: GameEvent['data']): void {
  const e: GameEvent = { day: s.day, type, field, text, level }
  if (data) e.data = data
  out.push(e)
  s.log.push(e)
  if (s.log.length > 160) s.log.splice(0, s.log.length - 160)
}

// ---------------------------------------------------------------- jobs

// Share of a working day a job takes on one field, at normal speed. Digging only lifts the crop: hauling it in is
// its own order. For hauling, the days a tractor would take for what lies in the field now.
export function jobDays(c: Campaign, kind: JobKind, f: FieldSeason | null, field = -1): number {
  if (kind === 'spray' && c.upgrades.boom) return 0.1
  if (kind === 'dig') return c.upgrades.harvester ? 1.25 : P.JOB_DAYS.dig
  if (kind === 'water' && pondServes(c, field)) return P.POND_DAYS
  if (kind === 'water' && c.upgrades.reel) return 0.5
  if (kind === 'haul') return f && field >= 0 ? f.inField * haulFactor(c, field) * roadHaul(c) / P.HAUL_CWT_DAY : P.JOB_DAYS.haul
  if (kind === 'rogue' && f) return Math.min(2, 0.2 + 0.08 * knownHills(f))
  if (kind === 'fell' && field >= 0 && field < P.FIELD_COUNT) return fellLeft(c, field)
  return P.JOB_DAYS[kind]
}

// The Dufour yard and its potato house are the farm's while it holds any Dufour field (the back lot does not count).
export function holdsDufour(c: Campaign): boolean {
  return holdsDufourLand(c.fields)
}

// A building that can be worked on: not yet standing, and in the Dufour yard only while Dufour land is held.
export function buildable(c: Campaign, b: Building): boolean {
  return !b.built && (b.yard !== DUFOUR_YARD || holdsDufour(c))
}

// Road distance from a field to the nearest potato house the farm has (or would have, with dufour set).
export function haulDistance(c: Campaign, field: number, dufour = holdsDufour(c)): number {
  const home = distance(field, HOME_YARD)
  return dufour ? Math.min(home, distance(field, DUFOUR_YARD)) : home
}

// How much longer hauling a field's crop in takes for its distance: 1 inside the home farm's own haul, more beyond it.
export function haulFactor(c: Campaign, field: number, dufour = holdsDufour(c)): number {
  return 1 + P.HAUL * Math.max(0, haulDistance(c, field, dufour) - P.HAUL_FREE)
}

// Share of the time hauling takes on the gravelled road.
function roadHaul(c: Campaign): number {
  return hasBuilt(c, 'road') ? P.ROAD_SPEED : 1
}

// Cwt a day this person hauls from this field with this rig.
export function haulRate(c: Campaign, u: Unit, field: number, rig: Rig): number {
  return P.HAUL_CWT_DAY * speed(u, 'machine') * (hasBuilt(c, 'shed') ? P.SHED_SPEED : 1) * (rig === 'truck' ? P.TRUCK_HAUL : 1)
    / (haulFactor(c, field) * roadHaul(c))
}

export function jobCost(c: Campaign, kind: JobKind, field = -1): number {
  if (kind === 'water' && pondServes(c, field)) return P.POND_COST
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
  return block(c, kind, field, null)
}

// The same, for an order already on the list (self), which does not count as its own duplicate.
function block(c: Campaign, kind: JobKind, field: number, self: Job | null): string {
  const s = c.season
  if (!s || c.phase !== 'season') return 'The season is not under way.'
  if (s.frozen) return 'The ground has frozen.'
  // Hauling and building go on the list by themselves; the player cannot order them.
  if (kind === 'build') {
    if (!self) return 'Building goes on the list with the order to build.'
    const b = c.buildings.find(x => x.id === self.building)
    return b && buildable(c, b) ? '' : 'There is nothing left to build.'
  }
  if (kind === 'haul') {
    const h = s.fields[field]
    const barrels = !!h && !h.weighed && (h.status === 'digging' || h.status === 'dug') && h.inField >= 0.5
    if (!self) {
      if (s.jobs.some(j => j.kind === 'haul' && j.field === field)) return 'Already on the list.'
      if (!barrels) return standingBy(c, 'haul', field) ? 'Hauling goes on the list by itself as the digger lifts the crop.' : 'There is nothing in barrels to haul.'
      return ''
    }
    return h && !h.weighed && (h.status === 'digging' || h.status === 'dug') ? '' : 'There is nothing left to haul.'
  }
  const f = s.fields[field]
  if (!f) return 'No such field.'
  if (kind === 'fell' || kind === 'rocks' || kind === 'brush') return landBlock(c, s, kind, field, self)
  if (f.status === 'off') {
    if (c.fields[field].tenure === 'none') return 'This field is not the farm\'s.'
    return isOpen(c, field) ? 'Cleared this season: it can be planted next spring.' : `${FIELD_NAMES[field]} is ${COVER_WORD[c.fields[field].cover]}. Clear it first.`
  }
  if (f.status === 'rest') return 'This field is resting in oats and clover.'
  if (f.status === 'dug') return 'This field is dug.'
  if (f.status === 'lost') return 'This crop is lost.'
  if (s.jobs.some(j => j !== self && j.kind === kind && j.field === field)) return 'Already on the list.'
  const up = f.emergeDay >= 0
  const alive = f.deadDay < 0
  switch (kind) {
    case 'plant':
      if (c.fields[field].works) return `The contractor is at work in ${FIELD_NAMES[field]}.`
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
  return ''
}

// Felling, picking rocks and cutting hedgerows: work on the land rather than the crop.
function landBlock(c: Campaign, s: Season, kind: JobKind, field: number, self: Job | null): string {
  const fp = c.fields[field]
  const name = FIELD_NAMES[field]
  if (fp.tenure === 'none') return 'This field is not the farm\'s.'
  if (s.jobs.some(j => j !== self && j.kind === kind && j.field === field)) return 'Already on the list.'
  switch (kind) {
    case 'fell':
      if (!standing(fp.cover)) return `There is nothing to fell on ${name}.`
      return ''
    case 'rocks': {
      if (fp.cover !== 'open') return `${name} is ${COVER_WORD[fp.cover]}. Fell it and have the stumps pulled first.`
      if (fp.works) return `The contractor is at work in ${name}.`
      const st = s.fields[field].status
      if (st === 'planted' || st === 'growing' || st === 'dead' || st === 'digging') return 'Rocks are picked when no crop is in the ground: before planting, after the dig, or in a rest year.'
      if (fp.stones < P.ROCKS_MIN) return 'There are hardly any stones left to pick.'
      return ''
    }
    case 'brush':
      if (fp.cover !== 'open') return `${name} is ${COVER_WORD[fp.cover]}. Clear it first.`
      if (fp.elev === 2) return 'The ridge has no hedgerows holding cold air: only bottom land and the mid slope do.'
      if (brushedNow(c, field)) return `Cut back already; it grows back ${P.BRUSH_YEARS} years after it was cut.`
      return ''
  }
  return ''
}

// Why the weather stops this job today, or '' when it can go ahead. windMax is the most wind a spray can go on in
// on this field (more where it is sheltered).
export function jobWait(kind: JobKind, f: FieldSeason, d: Day, windMax = P.SPRAY_WIND): string {
  switch (kind) {
    case 'plant': case 'hill': case 'dig': case 'rocks':
      if (d.prcp >= 6) return 'raining'
      if (f.wet >= P.WORKABLE_WET_MM) return 'ground too wet'
      return ''
    case 'haul':
      if (f.inField < 0.5) return 'waiting for the digger'
      return d.prcp >= 15 ? 'heavy rain' : ''
    case 'spray':
      if (d.prcp >= 2) return 'raining'
      if (d.wind >= windMax) return 'too windy'
      return ''
    case 'kill':
      return d.prcp >= 6 ? 'raining' : ''
    case 'water':
      return d.prcp >= 5 ? 'raining' : ''
    default:
      return d.prcp >= 15 ? 'heavy rain' : ''
  }
}

// Why this person cannot be given this job, or '' when they can.
export function unitBlock(c: Campaign, kind: JobKind, unit: number): string {
  if (unit === -1) return ''
  const u = c.crew.find(x => x.id === unit)
  if (!u) return 'No such crew.'
  if (u.foreman) return `${u.name} is foreman and does no field work.`
  const skill = jobSkill(kind)
  if (u.prio[skill] <= 0) {
    const as = u.kind === 'hand' && skill === 'machine' ? ' is a field hand and' : u.kind === 'operator' && skill === 'field' ? ' drives the second tractor and' : ''
    return `${u.name}${as} is set never to do ${SKILL_LABEL[skill]}.`
  }
  return ''
}

export function addJob(c: Campaign, kind: JobKind, field: number, unit = -1, by: JobBy = 'you'): string {
  const why = jobBlock(c, kind, field) || unitBlock(c, kind, unit)
  if (why) return why
  const s = c.season!
  const job: Job = { id: s.nextJob++, kind, field, done: 0, need: jobDays(c, kind, s.fields[field], field), unit, by }
  // The crop in the barrels comes in before anything else.
  if (kind === 'haul') s.jobs.unshift(job)
  else s.jobs.push(job)
  return ''
}

// Whether the routine (or a foreman, on their block) puts this kind of work on the list by itself for this field.
export function standingBy(c: Campaign, kind: JobKind, field: number): JobBy | null {
  const block = PARCELS[field]?.block
  if (block && c.crew.some(u => u.foreman === block)) return 'foreman'
  return (P.ROUTINE_KINDS as JobKind[]).includes(kind) && (c.routine?.[kind as RoutineKind] ?? P.ROUTINE_DEFAULT[kind as RoutineKind]) ? 'routine' : null
}

// A person lets go of the order they hold, and of the tractor or truck they were driving for it.
export function letGo(u: Unit): void {
  u.job = -1
  u.rig = ''
}

// Lets go of an order: any crew holding it goes back to the list (a crew on the road keeps driving).
export function releaseJob(c: Campaign, id: number): void {
  for (const u of c.crew) if (u.job === id) letGo(u)
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

function completeJob(world: World, c: Campaign, s: Season, job: Job, d: Day, out: GameEvent[], u: Unit): void {
  if (job.kind === 'build') {
    const b = c.buildings.find(x => x.id === job.building)
    if (b) push(s, out, 'built', job.field, 'good', `The ${P.BUILDINGS[b.kind].name.toLowerCase()} in ${YARD_NAME[b.yard]} is built. ${P.BUILDINGS[b.kind].does}`, { building: b.id })
    return
  }
  const f = s.fields[job.field]
  const name = FIELD_NAMES[job.field]
  if (job.kind !== 'dig' && job.kind !== 'haul') charge(c, job.kind === 'water' && job.pond ? P.POND_COST : jobCost(c, job.kind))
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
      const eye = scoutChance(u)
      for (let i = 0; i < P.HILLS; i++) {
        const st = f.hState[i]
        if (!(st & H_EMERGED) || (st & GONE)) continue
        if (f.hLes[i] >= P.LESION_START && ((st & H_KNOWN) || nextUnit(c) < eye)) {
          f.hState[i] = st | H_KNOWN
          found++
        }
      }
      f.knownSev = knownSeverity(f)
      if (found) f.blightFound ??= s.day
      const virus = f.hState.filter(st => (st & H_VIRUS) && (st & H_EMERGED) && !(st & GONE)).length
      push(s, out, 'scout', job.field, found ? 'bad' : 'good',
        found ? `Walked ${name}: blight lesions on ${found} ${found === 1 ? 'hill' : 'hills'}.` : `Walked ${name}: no blight found.`,
        { found, virus })
      break
    }
    case 'spray':
      f.residue = sprayCover(u)
      f.lastSpray = s.day
      f.sprays = (f.sprays ?? 0) + 1
      push(s, out, 'sprayed', job.field, 'info', `${name} sprayed with protectant.`)
      break
    case 'water':
      f.dr = Math.max(0, f.dr - P.IRRIGATION_MM)
      f.wateredDay = s.day
      push(s, out, 'watered', job.field, 'info', `${name} watered, about an inch${job.pond ? ', from the pond' : ''}.`)
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
      f.blightPulled = (f.blightPulled ?? 0) + pulled
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
    case 'fell':
      push(s, out, 'felled', job.field, 'good', `${name} is felled. The stumps are left; a contractor can pull them.${sheltering(c, job.field)}`, { logs: Math.round(c.logs) })
      break
    case 'rocks': {
      const fp = c.fields[job.field]
      const take = Math.min(fp.stones, P.ROCKS_TAKE)
      fp.stones -= take
      c.stone += P.ROCKS_LOADS * take
      push(s, out, 'rocks', job.field, 'info', `Rocks picked off ${name}: ${Math.round(P.ROCKS_LOADS * take * 10) / 10} loads of fieldstone to the yard.`, { stones: Math.round(fp.stones * 100) / 100 })
      break
    }
    case 'brush':
      c.fields[job.field].brushed = c.year
      push(s, out, 'brushed', job.field, 'info', `The hedgerows along ${name} are cut back: cold air drains away, but the wind dries it more. They grow back in ${P.BRUSH_YEARS} years.`)
      break
    case 'dig': {
      const lot = c.lots.find(l => l.id === f.lotId)!
      f.status = 'dug'
      f.dugDay = s.day
      finishLot(c, f, lot)
      const total = lot.grades.no1 + lot.grades.chef + lot.grades.b + lot.grades.no2 + lot.skinned
      push(s, out, 'dug', job.field, 'good', `${name} is dug: ${withCommas(total)} cwt to sell, ${withCommas(lot.grades.cull)} cwt culled. ${f.inField >= 0.5 ? `${withCommas(f.inField)} cwt is still in barrels in the field.` : 'It is all hauled in.'}`, { lot: lot.id })
      if (f.inField < 0.5) weigh(s, f, job.field, lot, out)
      break
    }
  }
}

// The whole crop is in: the weigh ticket is cut, and the lot can be sold or stored.
function weigh(s: Season, f: FieldSeason, field: number, lot: Lot, out: GameEvent[]): void {
  f.inField = 0
  f.weighed = true
  const total = lotCwt(lot)
  push(s, out, 'weighed', field, 'good', `The weigh ticket for ${FIELD_NAMES[field]}: ${withCommas(total)} cwt in the potato house, ready to sell or store.`, { lot: lot.id })
  const k = s.jobs.findIndex(j => j.kind === 'haul' && j.field === field)
  if (k >= 0) s.jobs.splice(k, 1)
}

// Takes cwt of the crop lying in a field out of the lot's sound grades, in proportion, as culls for this cause.
function lose(f: FieldSeason, lot: Lot, cwt: number, cause: Cause): void {
  const have = lotCwt(lot)
  if (have <= 0 || cwt <= 0) return
  const take = Math.min(cwt, have, f.inField)
  const keep = 1 - take / have
  lot.grades.no1 *= keep; lot.grades.chef *= keep; lot.grades.b *= keep; lot.grades.no2 *= keep; lot.skinned *= keep
  lot.grades.cull += take
  lot.loss[cause] += take
  f.inField -= take
}

// The crop in barrels in the field overnight: a hard frost at the field freezes a share of it, and a bright day greens
// a little.
function exposure(c: Campaign, s: Season, d: Day, out: GameEvent[]): void {
  const bright = skyOf(d) === 'clear'
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.inField < 0.5 || f.lotId < 0) continue
    const lot = c.lots.find(l => l.id === f.lotId)
    if (!lot) continue
    const tmin = envTmin(d, fieldEnv(c, i))
    if (tmin <= P.FREEZE_IN_FIELD) {
      const frozen = f.inField * P.FREEZE_SHARE
      lose(f, lot, frozen, 'frost')
      push(s, out, 'frozenInField', i, 'bad', `A hard frost on the barrels in ${FIELD_NAMES[i]}: ${withCommas(frozen)} cwt froze before it was hauled in.`, { cwt: Math.round(frozen) })
    }
    if (bright) lose(f, lot, f.inField * P.GREEN_IN_FIELD, 'green')
    if (f.status === 'dug' && f.inField < 0.5) weigh(s, f, i, lot, out)
  }
}

function digProgress(c: Campaign, s: Season, f: FieldSeason, field: number, job: Job, d: Day, u: Unit): void {
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
  const stones = stoneBruise(c.fields[field].stones, u)
  const before = lotCwt(lot)
  for (let i = f.digDone; i < upto; i++) {
    const st = f.hState[i]
    if ((st & H_EMERGED) && !(st & NO_CROP)) gradeHill(c, s, f, field, i, lot, d, stones)
    f.hState[i] = st | H_DUG
    f.hC[i] = 0
  }
  f.digDone = upto
  // What the digger lifts goes into barrels in the field, and an order to haul it in goes to the top of the list.
  f.inField += lotCwt(lot) - before
  const by = standingBy(c, 'haul', field)
  if (by && f.inField >= 0.5 && !s.jobs.some(j => j.kind === 'haul' && j.field === field)) {
    s.jobs.unshift({ id: s.nextJob++, kind: 'haul', field, done: 0, need: jobDays(c, 'haul', f, field), unit: -1, by })
  }
}

// ---------------------------------------------------------------- the crews' day
//
// Each person has one day of work a day (none on a Sunday off, none for a foreman). In turn:
// 1. Everyone carries on: one still on the road finishes the drive, then works the order they hold if that order is
//    still on the list, still theirs to do, still makes sense for the field, and the weather allows it today.
//    Otherwise they let it go (the work done on it stays with the order), and the tractor with it.
// 2. Then people take orders one at a time. The one with the most of the day left goes next; on a tie the hands go
//    first, then the operators, then the farmer, and within a kind the one hired first. They look through the kinds
//    of work in their own priority order (1 first; kinds at the same priority together; 0 never). At each priority
//    they look down the list for the first PICK_WINDOW orders of those kinds they could take: not pinned to someone
//    else, not held by someone else, allowed by the weather today, and, for machine work, with a tractor free (on
//    the way, an order that no longer makes sense for its field is dropped, as before). Of those they take the one
//    with the least travel plus PICK_LAG for each place down the list, the earliest on a tie; they drive there and
//    work it at their own speed until it is done or the day is used up. Someone who finds nothing is idle.
// People end the day where they worked, and one still on the road carries the rest of the drive into tomorrow.

interface Turn { u: Unit; left: number; idle: boolean; spent: Record<Skill, number>; tractor: boolean }

function heldByOther(c: Campaign, job: Job, u: Unit): boolean {
  for (const o of c.crew) if (o !== u && o.job === job.id) return true
  return false
}

function mayTake(u: Unit, job: Job): boolean {
  return (job.unit < 0 || job.unit === u.id) && willDo(u, job.kind)
}

// Tractors the farm owns.
export function tractorsOwned(c: Campaign): number {
  return 1 + (c.upgrades.tractor2 ? 1 : 0) + (c.upgrades.tractor3 ? 1 : 0)
}

// Tractors that run today: those the farm owns less those broken down.
export function tractorsRunning(c: Campaign, day: number): number {
  let out = 0
  for (const back of c.broken) if (back > day) out++
  return Math.max(0, tractorsOwned(c) - out)
}

// What this person would drive to work this order: '' for work on foot, the truck for hauling when it is free, a
// tractor otherwise, or null when every running tractor is taken.
function rigFor(c: Campaign, s: Season, u: Unit, job: Job): Rig | null {
  if (jobSkill(job.kind) !== 'machine') return ''
  if (u.rig) return u.rig
  if (job.kind === 'haul' && c.upgrades.truck && !c.crew.some(o => o !== u && o.rig === 'truck')) return 'truck'
  let busy = 0
  for (const o of c.crew) if (o !== u && o.rig === 'tractor') busy++
  return busy < tractorsRunning(c, s.day) ? 'tractor' : null
}

// Whether today is a working day: on a Sunday off nobody works, unless a frost is coming on crop still in barrels.
export function workday(c: Campaign, s: Season): boolean {
  return s.frostHaul === s.day || !(c.sundaysOff && weekday(s.year, s.day) === SUNDAY)
}

// The soil's part of the one planting rule (outlook.ts, plantReady): not before the season's earliest planting date,
// and the soil at the seed's temperature.
export function soilFit(s: Season): boolean {
  return s.day >= dayIndex(s.year, P.PLANT_FROM.month, P.PLANT_FROM.dom) && s.soilT >= P.PLANT_SOIL_C
}

// Why the weather holds up this order today, on its own field (building in a yard stops only for heavy rain). The
// routine's planting waits for the soil the planting rule asks for; the player's own order goes when they say.
export function waitFor(c: Campaign, s: Season, job: Job, d: Day): string {
  if (job.field < 0) return d.prcp >= 15 ? 'heavy rain' : ''
  if (job.kind === 'plant' && job.by !== 'you' && !soilFit(s)) return 'the soil is too cold'
  return jobWait(job.kind, s.fields[job.field], d, job.kind === 'spray' ? fieldEnv(c, job.field).wind : P.SPRAY_WIND)
}

// Standard crew-days of an order a person gets through in a day of their time.
function workRate(c: Campaign, s: Season, u: Unit, job: Job): number {
  const skill = jobSkill(job.kind)
  let r = speed(u, skill)
  if (skill === 'machine' && hasBuilt(c, 'shed')) r *= P.SHED_SPEED
  if (job.kind === 'dig' && s.pickers) r *= P.PICKER_DIG
  if (job.kind === 'plant' || job.kind === 'dig') r *= stoneSpeed(c.fields[job.field].stones)
  if (job.kind === 'fell') r *= P.FELL_SEASON
  return r
}

// A field's name, or a yard's.
export function placeName(i: number): string {
  return i >= 0 ? FIELD_NAMES[i] : YARD_NAME[i]
}

// Re-checks an order against its field as it now is (a dig under way is the exception) and drops it from the list
// if it no longer makes sense. False when it was dropped.
function stillWanted(c: Campaign, s: Season, job: Job, out: GameEvent[]): boolean {
  if (job.kind === 'dig' && job.done > 0) return true
  const why = block(c, job.kind, job.field, job)
  if (!why) return true
  const k = s.jobs.indexOf(job)
  if (k >= 0) s.jobs.splice(k, 1)
  releaseJob(c, job.id)
  push(s, out, 'dropped', job.field, 'warn', `${JOB_LABEL[job.kind]} in ${placeName(job.field)} dropped. ${why}`, { job: job.id, kind: job.kind, why })
  return false
}

// Each morning orders that no longer make sense for their field leave the list, each with a dropped event and its
// reason: a walk, a spray or a watering for vines that are dead or dug, and the like. Building and hauling stay.
function sweep(c: Campaign, s: Season, out: GameEvent[]): void {
  for (const j of [...s.jobs]) {
    if (j.kind === 'build' || j.kind === 'haul' || (j.kind === 'dig' && j.done > 0)) continue
    stillWanted(c, s, j, out)
  }
}

// Work that can wait a few days without the season taking anything for it.
const WAITABLE: JobKind[] = ['fell', 'rocks', 'brush', 'build']

// Why the season cannot wait for this order, or '': spraying under a blight watch, planting, hauling ahead of a
// frost, and digging late in the season.
export function pressingWhy(c: Campaign, s: Season, job: Job): string {
  const f = job.field >= 0 ? s.fields[job.field] : null
  switch (job.kind) {
    case 'spray': return s.watchDay >= 0 && f && f.deadDay < 0 ? 'blight weather will not wait' : ''
    case 'plant': return 'the planting season is short'
    case 'haul': return s.frostHaul === s.day ? 'a frost is coming on the barrels' : ''
    case 'dig': return s.day >= dayIndex(s.year, P.PICKERS_FROM.month, P.PICKERS_FROM.dom) ? 'the ground freezes before long' : ''
  }
  return ''
}

function stoppedToday(s: Season, job: Job): boolean {
  return job.kind === 'dig' && (s.digStop ?? []).includes(job.field)
}

export function waitable(kind: JobKind): boolean {
  return WAITABLE.includes(kind)
}

// Drives toward the crew's destination with what is left of its day. True once it is there.
function drive(t: Turn): boolean {
  const u = t.u
  if (u.road <= 0) return true
  const go = Math.min(t.left, u.road)
  u.road -= go
  t.left -= go
  if (u.road > EPS) return false
  u.road = 0
  u.at = u.to
  return true
}

function work(world: World, c: Campaign, s: Season, t: Turn, job: Job, d: Day, out: GameEvent[]): void {
  const u = t.u
  if (u.at !== job.field && u.road <= 0) {
    u.to = job.field
    u.road = travel(c, u.at, job.field)
  }
  if (!drive(t) || t.left <= EPS) return
  if (job.kind === 'haul') { haulWork(c, s, t, job, out); return }
  if (job.kind === 'build') { buildDay(world, c, s, t, job, d, out); return }
  const f = s.fields[job.field]
  if (job.done === 0) {
    // Water from the pond is set aside when the watering begins.
    if (job.kind === 'water' && !job.pond && pondServes(c, job.field)) { job.pond = true; c.pond -= 1 }
    job.need = job.kind === 'water' && job.pond ? P.POND_DAYS : jobDays(c, job.kind, f, job.field)
  }
  if (u.rig === 'tractor') t.tractor = true
  const rate = workRate(c, s, u, job)
  const cap = job.kind === 'dig' ? digCap(c, s, t, job, rate) : t.left
  if (job.kind === 'dig' && cap < 0.05 && cap < t.left) { stopDig(c, s, u, job, out); return }
  const use = Math.min(cap * rate, job.need - job.done)
  const time = Math.min(t.left, use / rate)
  job.done += use
  t.left -= time
  t.spent[jobSkill(job.kind)] += time
  s.worked.push({ kind: job.kind, field: job.field, unit: u.id })
  if (job.kind === 'dig') digProgress(c, s, f, job.field, job, d, u)
  if (job.kind === 'fell' && fell(c, job.field, use, u)) job.done = job.need
  if (job.kind === 'dig' && cap < t.left + time - EPS && job.done < job.need - 1e-6) { stopDig(c, s, u, job, out); return }
  if (job.done >= job.need - 1e-6) {
    const k = s.jobs.indexOf(job)
    if (k >= 0) s.jobs.splice(k, 1)
    letGo(u)
    completeJob(world, c, s, job, d, out, u)
  }
}

// With a frost forecast tonight and nobody else to haul, the share of the day left for digging so that the rest of it
// hauls in everything in the field's barrels: the dug crop comes in before the night.
function digCap(c: Campaign, s: Season, t: Turn, job: Job, rate: number): number {
  const f = s.fields[job.field]
  if (s.frostLow === undefined || s.frostLow + P.FROST_OFFSET[c.fields[job.field].elev] * 0.7 > P.FREEZE_IN_FIELD + P.DIG_FROST_MARGIN) return t.left
  const u = t.u
  const haulers = c.crew.filter(o => o !== u && !o.foreman && willDo(o, 'haul') && !hurt(o, s.day) && !resting(o)).length
  if (haulers > 0 && tractorsRunning(c, s.day) + (c.upgrades.truck ? 1 : 0) >= 2) return t.left
  const lot = f.lotId >= 0 ? c.lots.find(l => l.id === f.lotId) : undefined
  const lifted = lot ? lotCwt(lot) + lot.sold + lot.grades.cull : 0
  const perDay = (job.done > 0 && lifted > 0 ? lifted / job.done : P.DIG_CWT_GUESS) * rate
  const h = haulRate(c, u, job.field, c.upgrades.truck ? 'truck' : 'tractor')
  const free = t.left - f.inField / h
  return Math.max(0, free * h / (perDay + h))
}

function stopDig(c: Campaign, s: Season, u: Unit, job: Job, out: GameEvent[]): void {
  letGo(u)
  if ((s.digStop ?? []).includes(job.field)) return
  s.digStop = [...(s.digStop ?? []), job.field]
  push(s, out, 'digWait', job.field, 'info', `${u.name} stops digging ${placeName(job.field)} for today: a frost is forecast tonight, and what is dug has to be hauled in first.`, { unit: u.id, job: job.id })
}

// A day's hauling: barrels from the field to the nearest potato house, as much as the rest of the day allows. When
// everything is in and the field is dug, the weigh ticket is cut; with the digger still at work, the hauler lets
// the order go until there is more to haul.
function haulWork(c: Campaign, s: Season, t: Turn, job: Job, out: GameEvent[]): void {
  const u = t.u
  const f = s.fields[job.field]
  if (u.rig === 'tractor') t.tractor = true
  const rate = haulRate(c, u, job.field, u.rig || 'tractor')
  const take = Math.min(t.left * rate, f.inField)
  const time = Math.min(t.left, take / rate)
  f.inField -= take
  t.left -= time
  t.spent.machine += time
  job.done += time
  job.need = job.done + f.inField / rate
  s.worked.push({ kind: 'haul', field: job.field, unit: u.id })
  if (f.inField >= 0.5) return
  letGo(u)
  const lot = c.lots.find(l => l.id === f.lotId)
  if (f.status === 'dug' && lot) weigh(s, f, job.field, lot, out)
}

// A day's building: crew-days into the building; when it stands its effect begins.
function buildDay(world: World, c: Campaign, s: Season, t: Turn, job: Job, _d: Day, out: GameEvent[]): void {
  const u = t.u
  const b = c.buildings.find(x => x.id === job.building)
  if (!b || b.built) { letGo(u); return }
  const rate = speed(u, 'build')
  const use = Math.min(t.left * rate, b.need - b.done)
  const time = Math.min(t.left, use / rate)
  t.left -= time
  t.spent.build += time
  job.done += use
  job.need = b.need
  s.worked.push({ kind: 'build', field: job.field, unit: u.id })
  if (buildWork(c, b, use)) {
    const k = s.jobs.indexOf(job)
    if (k >= 0) s.jobs.splice(k, 1)
    letGo(u)
    completeJob(world, c, s, job, _d, out, u)
  }
}

function choose(c: Campaign, s: Season, u: Unit, d: Day, out: GameEvent[]): { job: Job; rig: Rig } | null {
  const pick = byPriority(c, s, u, d, out)
  if (pick && !waitable(pick.job.kind)) return pick
  for (const job of [...s.jobs]) {
    if (waitable(job.kind) || !mayTake(u, job) || heldByOther(c, job, u) || stoppedToday(s, job) || !pressingWhy(c, s, job)) continue
    if (!stillWanted(c, s, job, out)) continue
    const rig = rigFor(c, s, u, job)
    if (waitFor(c, s, job, d) || rig === null) continue
    if (pick && !(s.pressed ?? []).includes(u.id)) {
      s.pressed = [...(s.pressed ?? []), u.id]
      push(s, out, 'pressing', job.field, 'info', `${u.name} leaves ${pick ? JOB_LABEL[pick.job.kind].toLowerCase() : 'what they were set to'} for ${JOB_LABEL[job.kind].toLowerCase()} in ${placeName(job.field)}: ${pressingWhy(c, s, job)}.`, { unit: u.id, job: job.id })
    }
    return { job, rig }
  }
  return pick
}

function byPriority(c: Campaign, s: Season, u: Unit, d: Day, out: GameEvent[]): { job: Job; rig: Rig } | null {
  for (let level = 1; level <= P.PRIORITY_MAX; level++) {
    let any = false
    for (const k of P.SKILLS) if (u.prio[k] === level) any = true
    if (!any) continue
    const cands: { job: Job; rig: Rig }[] = []
    let k = 0
    while (k < s.jobs.length && cands.length < P.PICK_WINDOW) {
      const job = s.jobs[k]
      if (u.prio[jobSkill(job.kind)] !== level || !mayTake(u, job) || heldByOther(c, job, u) || stoppedToday(s, job)) { k++; continue }
      if (!stillWanted(c, s, job, out)) continue
      const rig = rigFor(c, s, u, job)
      if (!waitFor(c, s, job, d) && rig !== null) cands.push({ job, rig })
      k++
    }
    let best: { job: Job; rig: Rig } | null = null
    let bestCost = Infinity
    for (let r = 0; r < cands.length; r++) {
      const cost = travel(c, u.at, cands[r].job.field) + r * P.PICK_LAG
      if (cost < bestCost) { best = cands[r]; bestCost = cost }
    }
    if (best) return best
  }
  return null
}

// Who works today: everyone but a foreman and anyone laid up hurt, and nobody on a Sunday off.
function turnsFor(c: Campaign, s: Season): Turn[] {
  if (!workday(c, s)) return []
  const turns: Turn[] = []
  for (const u of c.crew) if (!u.foreman && !hurt(u, s.day) && !resting(u)) turns.push({ u, left: 1, idle: false, spent: zeroSkills(), tractor: false })
  turns.sort((a, b) => turnBefore(a.u, b.u) ? -1 : turnBefore(b.u, a.u) ? 1 : 0)
  return turns
}

// The newest lot of this year's crop that is in and weighed, with something left in it.
export function standLot(c: Campaign, s: Season): Lot | undefined {
  let best: Lot | undefined
  for (const l of c.lots) {
    if (!l.open || l.year !== s.year || !s.fields[l.field]?.weighed) continue
    if (!best || l.dugDay > best.dugDay || (l.dugDay === best.dugDay && l.id > best.id)) best = l
  }
  return best
}

// Whether the farm stand opens today: built, August or later, and a weighed lot to sell from.
export function standOpen(c: Campaign, s: Season): boolean {
  return hasBuilt(c, 'stand') && s.day >= dayIndex(s.year, P.STAND_FROM.month, P.STAND_FROM.dom) && !!standLot(c, s)
}

// Someone minds the stand each day it is open: whoever puts packing first among those working today (on a tie, the
// first to take a turn). False when nobody is working, and the stand stays shut.
function mindStand(c: Campaign, s: Season, turns: Turn[]): boolean {
  if (!standOpen(c, s)) return false
  let best: Turn | null = null
  for (const t of turns) {
    const p = t.u.prio.pack
    if (p > 0 && (!best || p < best.u.prio.pack)) best = t
  }
  if (!best) best = turns[0] ?? null
  if (!best) return false
  best.left -= P.STAND_MIND
  best.spent.pack += P.STAND_MIND
  return true
}

// A day at the farm stand: about STAND_CWT from the newest lot at twice the market's No. 1 price; 2.4 times for red
// and yellow varieties, and for thin-skinned new potatoes up to September 5.
function standSales(world: World, c: Campaign, s: Season): void {
  const lot = standLot(c, s)
  if (!lot) return
  const no1 = basePrice(world, c, lot.variety) * (lot.sprouted ? 0.85 : 1)
  const special = P.STAND_SPECIAL_VARIETIES.includes(lot.variety)
  let left = P.STAND_CWT, money = 0
  if (lot.skinned > 0 && s.day <= dayIndex(s.year, P.NEW_POTATO_LAST.month, P.NEW_POTATO_LAST.dom)) {
    const t = Math.min(left, lot.skinned)
    lot.skinned -= t
    money += t * no1 * P.STAND_SPECIAL
    left -= t
  }
  const t = Math.min(left, lot.grades.no1)
  lot.grades.no1 -= t
  money += t * no1 * (special ? P.STAND_SPECIAL : P.STAND_PRICE)
  left -= t
  lot.sold += P.STAND_CWT - left
  lot.revenue += money
  c.cash += money
  c.yearRevenue += money
  c.yearStand += money
  if (lotCwt(lot) < 0.5) lot.open = false
}

// The irrigation pond fills from rain and the brook, and empties when a dry month has the brook low.
function pondDay(world: World, c: Campaign, s: Season, d: Day, out: GameEvent[]): void {
  if (!hasBuilt(c, 'pond')) return
  if (rain30(world, s.year, s.day) < P.POND_DRY_MM) {
    if (c.pond > 0) push(s, out, 'pondDry', -1, 'warn', 'The brook is low after a dry month, and the pond has gone dry.')
    c.pond = 0
  } else {
    c.pond = Math.min(P.POND_CAP, c.pond + P.POND_FILL + d.prcp / P.POND_RAIN_MM)
  }
}

function runCrews(world: World, c: Campaign, s: Season, d: Day, out: GameEvent[]): { turns: Turn[]; minded: boolean } {
  s.worked = []
  const turns = turnsFor(c, s)
  const minded = mindStand(c, s, turns)
  for (const t of turns) {
    const u = t.u
    if (!drive(t)) continue
    const job = u.job >= 0 ? s.jobs.find(j => j.id === u.job) : undefined
    if (!job || !mayTake(u, job) || !stillWanted(c, s, job, out) || waitFor(c, s, job, d)) { letGo(u); continue }
    work(world, c, s, t, job, d, out)
  }
  for (;;) {
    let t: Turn | null = null
    for (const x of turns) {
      if (x.idle || x.left <= EPS || x.u.job >= 0) continue
      if (!t || x.left > t.left) t = x
    }
    if (!t) break
    const pick = choose(c, s, t.u, d, out)
    if (!pick) { t.idle = true; continue }
    t.u.job = pick.job.id
    t.u.rig = pick.rig
    work(world, c, s, t, pick.job, d, out)
  }
  return { turns, minded }
}

// The end of each person's day: experience in what they worked at, tiredness, mood, and whether they have had enough.
function peopleDay(c: Campaign, s: Season, turns: Turn[], out: GameEvent[]): void {
  let fieldsIn = 0
  for (const f of s.fields) if (f.status === 'dug') fieldsIn++
  const quit: Unit[] = []
  for (const u of c.crew) {
    const t = turns.find(x => x.u === u)
    const used = t ? Math.max(0, Math.min(1, 1 - t.left)) : 0
    if (t) {
      for (const k of P.SKILLS) {
        for (const level of gainXp(u, k, t.spent[k])) push(s, out, 'skillUp', -1, 'good', `${u.name} is better at ${SKILL_LABEL[k]}: level ${level}.`, { unit: u.id, level })
      }
    }
    const tire = P.TIRE_PER_DAY * (u.trait === 'tireless' ? P.TIRELESS : 1)
    const wasTired = u.tired
    u.tired = Math.max(0, Math.min(1, u.tired + tire * used - P.REST_PER_DAY * (1 - used)))
    if (wasTired < P.HURT_TIRED && u.tired >= P.HURT_TIRED) {
      push(s, out, 'wornOut', -1, 'warn', (u.rest ?? 'auto') === 'push'
        ? `${u.name} is worn out and told to work on: slower, and liable to get hurt on a machine or in the woods.`
        : `${u.name} is worn out and will rest tomorrow, before anyone gets hurt.`, { unit: u.id })
    }
    if (u.rest === 'now' && u.tired < P.REST_UNTIL) {
      u.rest = 'auto'
      push(s, out, 'rested', -1, 'info', `${u.name} is rested and back at work tomorrow.`, { unit: u.id })
    }
    const target = moodTarget(c, u, fieldsIn)
    let pull = P.MOOD_PULL
    if (u.trait === 'hothead' && u.tired > P.MOOD_TIRED_FROM && target < u.mood) pull *= P.HOTHEAD_FALL
    u.mood += (target - u.mood) * pull
    if (u.trait === 'cheerful' && u.mood < P.CHEERFUL_FLOOR) u.mood = P.CHEERFUL_FLOOR
    if (u.mood < 0) u.mood = 0
    if (u.mood > 1) u.mood = 1
    if (u.kind === 'farmer') continue
    if (u.mood < P.QUIT_MOOD) {
      if (u.low === 0) push(s, out, 'unhappy', -1, 'warn', `${u.name} is unhappy. A week of it and they will quit.`, { unit: u.id })
      u.low++
    } else u.low = 0
    if (u.low >= P.QUIT_DAYS) quit.push(u)
  }
  for (const u of quit) {
    removePerson(c, u)
    push(s, out, 'quit', -1, 'bad', `${u.name} has had enough and quits.`, { unit: u.id })
  }
}

// Takes someone off the farm: the order they held goes back to the list, and orders pinned to them are anyone's.
export function removePerson(c: Campaign, u: Unit): void {
  const k = c.crew.indexOf(u)
  if (k >= 0) c.crew.splice(k, 1)
  for (const j of c.season?.jobs ?? []) if (j.unit === u.id) j.unit = -1
}

export const JOB_LABEL: Record<JobKind, string> = {
  plant: 'Planting', hill: 'Hilling', scout: 'Scouting', spray: 'Spraying', water: 'Watering',
  rogue: 'Roguing', sample: 'Test dig', kill: 'Vine kill', dig: 'Digging',
  fell: 'Felling', rocks: 'Picking rocks', brush: 'Cutting brush', build: 'Building', haul: 'Hauling',
}

// The text for the fields a tract sheltered, now that it is down.
export function sheltering(c: Campaign, tract: number): string {
  const out: string[] = []
  for (let i = 0; i < c.fields.length; i++) {
    if (!isField(c, i)) continue
    const p = PARCELS[i], t = PARCELS[tract]
    const dx = p.x - t.x, dz = p.z - t.z
    if (dx * dx + dz * dz <= P.SHELTER_RANGE * P.SHELTER_RANGE && fieldEnv(c, i).shelter < 0) out.push(FIELD_NAMES[i])
  }
  return out.length ? ` ${out.join(' and ')} ${out.length === 1 ? 'is' : 'are'} out in the open now: drier, windier, and not so frosty.` : ''
}

// The contractors' day: stumps pulled and tile laid, a season day at a time.
function contractors(c: Campaign, s: Season, out: GameEvent[]): void {
  for (let i = 0; i < c.fields.length; i++) {
    const fp = c.fields[i]
    if (!fp.works) continue
    fp.works.left--
    if (fp.works.left > 0) continue
    const kind = fp.works.kind
    fp.works = null
    if (kind === 'stump') {
      stumped(c, i)
      push(s, out, 'stumped', i, 'good', `The stumps are out of ${FIELD_NAMES[i]}. It is a field now: rested, stony new ground, ready to plant next spring.`)
    } else {
      fp.tiled = true
      push(s, out, 'tiled', i, 'good', `Tile drains are in under ${FIELD_NAMES[i]}: it drains like the mid slope now, and holds a little less water in a drought.`)
    }
  }
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

// How readily blight jumps from one field to another: the home six within two places of each other on the list at
// the full rate, as they always have; any other pair at the full rate within JUMP_NEAR by road; half otherwise.
function jumpNear(a: number, b: number): number {
  if (a < HOME_FIELDS && b < HOME_FIELDS) return Math.abs(a - b) <= 2 ? 1 : 0.5
  return distance(a, b) <= P.JUMP_NEAR ? 1 : 0.5
}

function fieldDay(world: World, c: Campaign, s: Season, fi: number, d: Day, sevRegion: number, out: GameEvent[]): void {
  const f = s.fields[fi]
  const fp = c.fields[fi]
  const v = variety(f.variety)
  const name = FIELD_NAMES[fi]
  const elev = fp.elev
  const env = fieldEnv(c, fi)
  const taw = env.taw

  // Water balance (FAO-56, one bucket).
  const raw = P.DEPLETION_P * taw
  const ks = f.dr <= raw ? 1 : Math.max(0, (taw - f.dr) / (taw - raw))
  const kc = P.KC_BARE + (P.KC_FULL - P.KC_BARE) * f.canopy
  f.dr += kc * d.et0 * env.et * ks - d.prcp
  if (f.dr < 0) f.dr = 0
  if (f.dr > taw) f.dr = taw
  f.wet = f.wet * env.drain + d.prcp
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
  const tminF = envTmin(d, env)
  if (tminF <= 0) f.rimeDay = s.day

  // Late blight weather for this field.
  const wetH = Math.max(0, Math.min(24, d.wetH + env.humid + (f.wateredDay === s.day ? 3 : 0)))
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
          if (nextUnit(c) < pJump * jumpNear(fi, o)) tryInfect(c, g, nextInt(c, P.HILLS), variety(g.variety).blightLeaf, cool)
        }
      }
    }
  }

  // Hills.
  const soilF = (1 - P.SOIL_YIELD * (1 - fp.soil)) * (fp.raw ? P.RAW_GROUND : 1)
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
      f.blightFound ??= s.day
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

  // Wages fall due every WAGE_DAYS from the day each person was taken on.
  for (const u of c.crew) {
    while (u.wage > 0 && s.day >= u.paidTo) {
      const pay = payOf(u)
      charge(c, pay)
      c.yearWages += pay
      u.paidTo += P.WAGE_DAYS
    }
  }
  // The picking crew goes back to school when the harvest break ends; while it is on it is paid for each day worked.
  if (s.pickers && s.day > dayIndex(s.year, P.PICKERS_TO.month, P.PICKERS_TO.dom)) {
    s.pickers = false
    push(s, out, 'pickers', -1, 'info', 'The harvest break is over and the pickers are back in school.')
  }
  if (s.pickers && workday(c, s)) {
    charge(c, P.PICKER_DAY)
    c.yearWages += P.PICKER_DAY
  }

  morning(c, s, out)
  sweep(c, s, out)
  s.pressed = []
  s.digStop = []
  const { turns, minded } = runCrews(world, c, s, d, out)
  contractors(c, s, out)
  if (minded) standSales(world, c, s)
  pondDay(world, c, s, d, out)

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
  exposure(c, s, d, out)
  drawIncidents(c, s, turns, out)
  peopleDay(c, s, turns, out)

  const freeze = s.day >= s.lastDay || (s.day > dayIndex(s.year, 9, 1) && s.soilT <= P.FREEZE_UP_SOIL_T)
  if (freeze) {
    s.frozen = true
    s.jobs = []
    s.pickers = false
    for (const u of c.crew) letGo(u)
    for (let i = 0; i < P.FIELD_COUNT; i++) {
      const f = s.fields[i]
      if (f.status === 'digging') {
        const lot = c.lots.find(l => l.id === f.lotId)!
        finishLot(c, f, lot)
        f.status = 'dug'
        f.dugDay = s.day
        push(s, out, 'dug', i, 'bad', `${FIELD_NAMES[i]} froze before the digging was done. What was hauled in is saved.`, { lot: lot.id })
      } else if (f.status === 'planted' || f.status === 'growing' || f.status === 'dead') {
        f.status = 'lost'
        push(s, out, 'lost', i, 'bad', `${FIELD_NAMES[i]} froze in the ground. The crop is lost.`)
      } else if (f.status === 'idle') {
        f.status = 'lost'
      }
    }
    leftInField(c, s, out, 'froze in the barrels')
    closeIncidents(c, s, out)
    push(s, out, 'freeze', -1, 'info', `${formatDay(s.year, s.day)}: the ground has frozen. The season is over.`)
  }
  s.day++
  c.steps++
  // The crop in the potato houses is charged and shrinks a night at a time.
  for (const l of c.lots) if (l.open && l.year === s.year && s.fields[l.field]?.weighed) ageLot(c, l, s.day)
  return out
}

export function seasonDone(c: Campaign): boolean {
  const s = c.season
  if (!s) return false
  if (s.frozen) return true
  return s.fields.every(f => f.status === 'off' || f.status === 'rest' || (f.status === 'dug' && f.weighed) || f.status === 'lost')
}

// ---------------------------------------------------------------- incidents

// The morning: broken tractors that are back, incidents nobody answered taking their defaults, and the tractors
// that are down taken from whoever was holding them.
function morning(c: Campaign, s: Season, out: GameEvent[]): void {
  const back = c.broken.filter(b => b <= s.day).length
  if (back > 0) {
    c.broken = c.broken.filter(b => b > s.day)
    push(s, out, 'repaired', -1, 'good', back === 1 ? 'The tractor is going again.' : `${back} tractors are going again.`)
  }
  for (const inc of [...c.incidents]) if (inc.until < s.day) resolveIncident(c, s, inc, defaultChoice(inc), out)
  let running = tractorsRunning(c, s.day)
  for (const u of c.crew) {
    if (u.rig !== 'tractor') continue
    if (running > 0) running--
    else letGo(u)
  }
}

// Opens an incident, with an event saying what happened and what is asked.
function openIncident(c: Campaign, s: Season, out: GameEvent[], fields: Omit<Incident, 'id' | 'day'>): Incident {
  const inc: Incident = { id: c.nextIncident++, day: s.day, ...fields }
  c.incidents.push(inc)
  s.telegram = s.day
  const choices = inc.choices.map(ch => CHOICE_LABEL[ch]).join(' or ')
  push(s, out, 'incident', -1, 'warn', `${INCIDENT_TITLE[inc.kind]}. ${incidentText(c, inc)} ${choices}?`, { incident: inc.id, kind: inc.kind })
  return inc
}

// The passive choices, which need nothing but the season: someone not taken on, an offer not matched, a part waited
// for, a buyer turned away. The active ones are answered through apply().
export function resolveIncident(c: Campaign, s: Season, inc: Incident, choice: string, out: GameEvent[]): void {
  const k = c.incidents.indexOf(inc)
  if (k >= 0) c.incidents.splice(k, 1)
  switch (choice) {
    case 'pass':
      push(s, out, 'incidentDone', -1, 'info', `${inc.applicant!.name} looks for work elsewhere.`, { incident: inc.id })
      break
    case 'let': {
      const u = c.crew.find(x => x.id === inc.unit)
      if (u && u.mood < P.POACH_MOOD) {
        removePerson(c, u)
        push(s, out, 'poached', -1, 'bad', `${u.name} takes the neighbour's offer and goes.`, { incident: inc.id, unit: u.id })
      } else if (u) {
        push(s, out, 'incidentDone', -1, 'good', `${u.name} is happy enough here and stays.`, { incident: inc.id, unit: u.id })
      }
      break
    }
    case 'wait':
      push(s, out, 'incidentDone', -1, 'info', `The part is on its way: the tractor is back on ${formatDay(s.year, inc.back!)}.`, { incident: inc.id })
      break
    case 'refuse':
      push(s, out, 'incidentDone', -1, 'info', 'The buyer goes on down the road.', { incident: inc.id })
      break
  }
}

// When the season ends, open incidents take their defaults and the tractors are mended over the winter.
export function closeIncidents(c: Campaign, s: Season, out: GameEvent[]): void {
  for (const inc of [...c.incidents]) resolveIncident(c, s, inc, defaultChoice(inc), out)
  c.broken = []
  for (const u of c.crew) u.out = -1
}

function openKind(c: Campaign, kind: IncidentKind): boolean {
  return c.incidents.some(i => i.kind === kind)
}

// The day's incidents, drawn from the campaign seed and the day (not the game's random stream), so a replay sees the
// same ones: injuries to people working tired in the woods or on a machine, tractors breaking down, someone asking
// for work, a neighbour after one of the farm's people, a buyer for a lot.
function drawIncidents(c: Campaign, s: Season, turns: Turn[], out: GameEvent[]): void {
  const u01 = (salt: number) => hashUnit(c.seed, s.year, s.day, salt)
  const shed = hasBuilt(c, 'shed')
  // In a farm's first year no telegram comes before its first planting is finished (or mid-June, on a farm that
  // has not planted by then).
  const firstPlanting = c.history.length === 0 && s.day < dayIndex(s.year, P.QUIET_UNTIL.month, P.QUIET_UNTIL.dom) &&
    c.plans.some((p, i) => p?.crop === 'potato' && c.fields[i].tenure !== 'none' && s.fields[i].plantDay < 0)
  for (const t of turns) {
    const u = t.u
    if (t.spent.machine + t.spent.woods > 0 && u01(7100 + u.id) < hurtChance(u)) {
      const days = P.HURT_DAYS[0] + Math.floor(u01(7150 + u.id) * (P.HURT_DAYS[1] - P.HURT_DAYS[0] + 1))
      u.out = s.day + 1 + days
      letGo(u)
      push(s, out, 'hurt', -1, 'bad', `${u.name} is hurt, working worn out ${t.spent.woods > 0 ? 'in the woods' : 'on the tractor'}: off for ${days} days, back on ${formatDay(s.year, u.out)}.`, { unit: u.id, days })
    }
    if (t.tractor && c.broken.length < tractorsOwned(c) && !firstPlanting) {
      if (u01(7200 + u.id) < breakdownChance(u, shed)) {
        const mechanic = c.crew.some(x => x.skills.machine >= P.MECHANIC && !hurt(x, s.day + 1))
        const back = s.day + 1 + (mechanic ? 1 : P.BREAK_DAYS)
        c.broken.push(back)
        if (mechanic) push(s, out, 'breakdown', -1, 'warn', `A tractor broke down under ${u.name}. There is someone on the farm who can fix it: it is back on ${formatDay(s.year, back)}.`, { unit: u.id })
        else openIncident(c, s, out, { kind: 'breakdown', until: back - 2, choices: ['rush', 'wait'], unit: u.id, back })
      }
    }
  }
  c.heard ??= []
  if (firstPlanting) return
  // An offer, someone asking for work or a buyer waits a week after the last telegram; a breakdown does not.
  if (s.telegram !== undefined && s.day - s.telegram < P.TELEGRAM_GAP) return
  if (!openKind(c, 'applicant') && !c.heard.includes('applicant') && u01(7300) < P.APPLICANT_CHANCE) {
    c.heard.push('applicant')
    const taken = new Set([...c.crew.map(u => u.name), ...c.applicants.map(a => a.name)])
    const a = applicantsFor(c.seed, s.year, taken, 1, s.day)[0]
    openIncident(c, s, out, { kind: 'applicant', until: s.day + P.INCIDENT_DAYS, choices: ['hire', 'pass'], applicant: { ...a, id: c.nextIncident } })
  }
  if (!openKind(c, 'poach') && s.telegram !== s.day && u01(7400) < P.POACH_CHANCE) {
    let best: Unit | null = null, bestSum = -1
    for (const u of c.crew) {
      if (u.kind === 'farmer' || c.heard.includes(`poach:${u.id}`)) continue
      let sum = 0
      for (const k of P.SKILLS) sum += u.skills[k]
      if (sum > bestSum) { best = u; bestSum = sum }
    }
    if (best) {
      c.heard.push(`poach:${best.id}`)
      openIncident(c, s, out, { kind: 'poach', until: s.day + P.INCIDENT_DAYS, choices: ['match', 'let'], unit: best.id, wage: Math.round(best.wage * (1 + P.POACH_RAISE)) })
    }
  }
  if (!openKind(c, 'buyer') && s.telegram !== s.day && s.day >= dayIndex(s.year, P.BUYER_FROM.month, P.BUYER_FROM.dom) && u01(7500) < P.BUYER_CHANCE) {
    let best: Lot | null = null
    for (const l of c.lots) {
      if (!l.open || l.year !== s.year || !s.fields[l.field]?.weighed || lotCwt(l) < P.BUYER_MIN_CWT || c.heard.includes(`buyer:${l.id}`)) continue
      if (!best || lotCwt(l) > lotCwt(best)) best = l
    }
    if (best) {
      c.heard.push(`buyer:${best.id}`)
      openIncident(c, s, out, { kind: 'buyer', until: s.day + P.BUYER_DAYS, choices: ['take', 'refuse'], lot: best.id })
    }
  }
}

// When the season ends with a crop still in barrels in a field, it is lost there; what was hauled in is weighed.
export function leftInField(c: Campaign, s: Season, out: GameEvent[], how: string): void {
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.status !== 'dug' || f.weighed) continue
    const lot = c.lots.find(l => l.id === f.lotId)
    if (!lot) continue
    if (f.inField >= 0.5) {
      const cwt = f.inField
      lose(f, lot, cwt, 'frost')
      push(s, out, 'frozenInField', i, 'bad', `${withCommas(cwt)} cwt in ${FIELD_NAMES[i]} ${how}: it never came in.`, { cwt: Math.round(cwt) })
    }
    weigh(s, f, i, lot, out)
  }
}
