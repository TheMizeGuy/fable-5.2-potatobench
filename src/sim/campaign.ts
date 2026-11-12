// The campaign: planning, the season, the cellar and the year-end ledger, all driven through apply().
import { asks, frostAhead, noteKillAsks, standingOrders } from './advice.ts'
import { contractOffers } from './buyers.ts'
import { hireBlock, hireRoom, newFarmer, newUnit } from './crew.ts'
import { BLOCK_NAME, BLOCKS, DUFOUR_YARD, HOME_FIELDS, HOME_YARD, PARCELS, YARDS, type BlockId } from './farm.ts'
import { lotCwt } from './harvest.ts'
import { sellLot } from './market.ts'
import * as P from './params.ts'
import { applicantsFor, fromApplicant, gainXp, jobSkill, payOf, SKILL_LABEL, speed, subject } from './people.ts'
import { hash32 } from './rng.ts'
import {
  addJob, buildable, buildJob, closeIncidents, FIELD_NAMES, holdsDufour, JOB_LABEL, leftInField, letGo, releaseJob, removePerson, resolveIncident, seasonDone, sheltering,
  startSeason, stepDay, unitBlock,
} from './season.ts'
import { CHOICE_LABEL } from './incidents.ts'
import { article, buildBlock, buildCost, buildingAt, buildWork, hasBuilt, startBuilding, YARD_NAME } from './buildings.ts'
import { brushedNow, COVER_WORD, fell, isField, standing } from './land.ts'
import type { Campaign, Cmd, Contract, Due, FieldPlan, GameEvent, Incident, JobKind, Lot, Result, RoutineKind, Season, SprayWay, Unit, UpgradeId, WinterWork, World, YearSummary } from './types.ts'
import { variety } from './varieties.ts'
import { dayIndex, formatDay, withCommas } from './calendar.ts'
import { ageLot, finishLot } from './harvest.ts'
import { hasYear } from './weather.ts'
import { yearLabel } from './climate.ts'

const REST_PLAN: FieldPlan = { crop: 'rest', variety: 'katahdin', seed: 'certified' }

export function lastStartYear(world: World): number {
  const ys = world.weather.playable
  return ys[ys.length - 1] - (P.GOAL_YEARS - 1)
}

export function startYears(world: World): number[] {
  const ys = world.weather.playable
  return ys.filter(y => {
    for (let k = 0; k < P.GOAL_YEARS; k++) if (!ys.includes(y + k)) return false
    return true
  })
}

export function held(c: Campaign, field: number): boolean {
  const f = c.fields[field]
  return !!f && f.tenure !== 'none'
}

function defaultPlan(c: Campaign, i: number): FieldPlan {
  // New ground rests a year first: its first potato crop on raw ground would grow less.
  if (!isField(c, i) || c.fields[i].raw) return { ...REST_PLAN }
  return { crop: c.fields[i].streak >= 2 ? 'rest' : 'potato', variety: 'katahdin', seed: 'certified' }
}

export function defaultPlans(c: Campaign): FieldPlan[] {
  return c.fields.map((_, i) => defaultPlan(c, i))
}

export function createCampaign(world: World, opts: { seed: number; startYear: number }): Campaign {
  if (!hasYear(world, opts.startYear)) throw new Error(`no weather for ${opts.startYear}`)
  const c: Campaign = {
    v: P.SAVE_VERSION,
    seed: opts.seed | 0,
    rng: hash32(opts.seed, opts.startYear, 77),
    startYear: opts.startYear, year: opts.startYear, yearIdx: 0, goalYears: P.GOAL_YEARS,
    phase: 'plan', outcome: '',
    cash: P.START_CASH,
    fields: PARCELS.map((p, i) => ({
      elev: p.elev, soil: Math.max(0, 1 - 0.5 * p.streak), vert: p.vert, streak: p.streak,
      tenure: i < HOME_FIELDS || p.holding === 'owned' ? 'owned' : 'none',
      cover: p.cover, stones: p.cover === 'open' ? p.stones : 0, raw: false, felled: 0, brushed: -1, tiled: false, works: null,
    })),
    plans: [],
    upgrades: { boom: false, harvester: false, vent: false, reel: false, tractor2: false, house2: false, tractor3: false, truck: false },
    seedStock: [], season: null, lots: [], nextLot: 1,
    crew: [newFarmer()], nextUnit: 1, applicants: [], sundaysOff: true, logs: 0, stone: 0, mortgages: [], buildings: [], nextBuilding: 1, pond: 0,
    incidents: [], nextIncident: 1, broken: [], heard: [], routine: { ...P.ROUTINE_DEFAULT },
    offers: [], contracts: [],
    month: 0,
    yearRevenue: 0, yearCosts: 0, yearRest: 0, yearStorage: 0,
    yearWages: 0, yearRent: 0, yearLand: 0, yearContracts: 0, yearPenalties: 0, yearLogs: 0, yearMortgage: 0, yearWorks: 0,
    yearBuilding: 0, yearStand: 0, yearPacking: 0,
    history: [], steps: 0,
  }
  c.plans = defaultPlans(c)
  c.offers = contractOffers(c.seed, c.year)
  c.applicants = springApplicants(c)
  return c
}

function springApplicants(c: Campaign): ReturnType<typeof applicantsFor> {
  return applicantsFor(c.seed, c.year, new Set(c.crew.map(u => u.name)))
}

export interface PlanCosts { fields: number; rent: number; wages: number; total: number }

// What beginning the season costs: growing each held field, the year's rent, and the first month of every hired wage.
export function planCosts(c: Campaign): PlanCosts {
  let fields = 0, rent = 0, wages = 0
  for (let i = 0; i < c.plans.length; i++) {
    if (!isField(c, i)) continue
    const p = c.plans[i]
    if (p.crop === 'rest') fields += P.REST_COST
    else fields += P.FIELD_COST + (p.seed === 'certified' ? P.SEED_CWT_PER_FIELD * P.CERT_SEED_PER_CWT : 0)
    if (c.fields[i].tenure === 'rented') rent += PARCELS[i].rent
  }
  for (const u of c.crew) wages += payOf(u)
  return { fields, rent, wages, total: fields + rent + wages }
}

export function planCost(c: Campaign): number {
  return planCosts(c).total
}

function savedSeedShort(c: Campaign): string {
  const need: Record<string, number> = {}
  c.plans.forEach((p, i) => { if (held(c, i) && p.crop === 'potato' && p.seed === 'saved') need[p.variety] = (need[p.variety] ?? 0) + 1 })
  for (const id of Object.keys(need)) {
    const have = c.seedStock.filter(s => s.variety === id).reduce((a, s) => a + s.fields, 0)
    if (have < need[id]) return `You don't have enough saved ${variety(id as FieldPlan['variety']).name} seed. The cellar holds enough for ${have} ${have === 1 ? 'field' : 'fields'}.`
  }
  return ''
}

export interface PotatoHouse { name: string; at: number; cwt: number }

// The potato houses the farm has now: the home house, a second one at home once built, the Dufour house and one
// built there while Dufour land is held. Ventilation is in the home houses.
export function potatoHouses(c: Campaign): PotatoHouse[] {
  const home = c.upgrades.vent ? P.CELLAR_CWT_VENT : P.CELLAR_CWT
  const out: PotatoHouse[] = [{ name: 'Home potato house', at: HOME_YARD, cwt: home }]
  if (hasBuilt(c, 'house', HOME_YARD)) out.push({ name: 'Second potato house', at: HOME_YARD, cwt: home })
  if (holdsDufour(c)) {
    out.push({ name: 'Dufour potato house', at: DUFOUR_YARD, cwt: YARDS[1].cellar })
    if (hasBuilt(c, 'house', DUFOUR_YARD)) out.push({ name: 'New Dufour potato house', at: DUFOUR_YARD, cwt: P.HOUSE_CWT })
  }
  return out
}

export function cellarCapacity(c: Campaign): number {
  let cap = 0
  for (const h of potatoHouses(c)) cap += h.cwt
  return cap
}

export function openLots(c: Campaign): Lot[] {
  return c.lots.filter(l => l.open)
}

function ok(events: GameEvent[] = []): Result { return { ok: true, err: '', events } }
function fail(err: string): Result { return { ok: false, err, events: [] } }

function note(c: Campaign, type: string, level: GameEvent['level'], text: string, field = -1): GameEvent {
  const e: GameEvent = { day: c.season ? c.season.day : 0, type, field, text, level }
  if (c.season) c.season.log.push(e)
  return e
}

function cost(c: Campaign, amount: number): void {
  c.cash -= amount
  c.yearCosts += amount
}

// Contracts that fall due now: what was not delivered costs CONTRACT_PENALTY of its contract value.
// Puts US No. 1 and large tubers of a lot against a contract, up to what it still needs. Returns the cwt and the money.
function deliverLot(c: Campaign, lot: Lot, k: Contract): { take: number; money: number } {
  if (c.phase === 'season' && c.season) ageLot(c, lot, c.season.day)
  const have = lot.grades.no1 + lot.grades.chef
  const take = Math.min(have, Math.max(0, k.cwt - k.delivered))
  if (take <= 1e-6) return { take: 0, money: 0 }
  const keep = 1 - take / have
  lot.grades.no1 *= keep
  lot.grades.chef *= keep
  const money = take * k.price
  k.delivered += take
  k.paid += money
  lot.sold += take
  lot.revenue += money
  c.cash += money
  c.yearRevenue += money
  c.yearContracts += money
  if (lotCwt(lot) < 0.5) lot.open = false
  return { take, money }
}

function settleContracts(c: Campaign, due: Due | 'all', out: GameEvent[]): void {
  for (const k of c.contracts) {
    if (k.settled || (due !== 'all' && k.due !== due)) continue
    // On the due date the buyer takes what is still owed from the crop in the potato houses, before any shortfall.
    for (const lot of openLots(c)) {
      if (k.cwt - k.delivered <= 1e-6) break
      if (lot.variety !== k.variety || (c.season && c.phase === 'season' && !c.season.fields[lot.field]?.weighed)) continue
      const d = deliverLot(c, lot, k)
      if (d.take > 1e-6) out.push(note(c, 'delivered', 'good', `${k.buyer} collected ${withCommas(d.take)} cwt of ${variety(k.variety).name} from your potato house toward the contract and paid $${withCommas(d.money)}.`, lot.field))
    }
    k.settled = true
    const short = k.cwt - k.delivered
    const name = variety(k.variety).name
    if (short > 1e-6) {
      const pen = short * k.price * P.CONTRACT_PENALTY
      k.penalty = pen
      cost(c, pen)
      c.yearPenalties += pen
      out.push(note(c, 'contractShort', 'bad', `You came up ${withCommas(short)} cwt of ${name} short on ${k.buyer.toLowerCase()}'s contract, and the penalty is $${withCommas(pen)}.`))
    } else {
      out.push(note(c, 'contractFilled', 'good', `${k.buyer}'s contract for ${withCommas(k.cwt)} cwt of ${name} is filled.`))
    }
  }
}

function endSeason(world: World, c: Campaign): GameEvent[] {
  const s = c.season!
  const out: GameEvent[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.status === 'off') continue
    if (f.status === 'rest') {
      c.cash += P.REST_INCOME
      c.yearRevenue += P.REST_INCOME
      c.yearRest += P.REST_INCOME
    } else if (f.status !== 'dug' && f.status !== 'lost') {
      if (f.status === 'digging') {
        const lot = c.lots.find(l => l.id === f.lotId)
        if (lot) finishLot(c, f, lot)
      }
      f.status = f.status === 'digging' ? 'dug' : 'lost'
      if (f.status === 'lost') out.push(f.plantDay < 0
        ? note(c, 'lost', 'warn', `${FIELD_NAMES[i]} was never planted.`, i)
        : note(c, 'lost', 'bad', `${FIELD_NAMES[i]} was left in the ground.`, i))
    }
  }
  leftInField(c, s, out, 'was left in the barrels')
  closeIncidents(c, s, out)
  s.jobs = []
  // The crews go home for the winter.
  for (const u of c.crew) { letGo(u); u.at = HOME_YARD; u.to = HOME_YARD; u.road = 0; u.tired = 0 }
  s.pickers = false
  settleContracts(c, 'harvest', out)
  // The potato houses only hold so much: the overflow is sold off the field.
  const cap = cellarCapacity(c)
  let total = openLots(c).reduce((a, l) => a + lotCwt(l), 0)
  if (total > cap) {
    const lots = openLots(c).sort((a, b) => lotCwt(b) - lotCwt(a))
    for (const lot of lots) {
      if (total <= cap) break
      const have = lotCwt(lot)
      const frac = Math.min(1, (total - cap) / have)
      const money = sellLot(world, c, lot, frac)
      total -= have * frac
      out.push(note(c, 'overflow', 'warn', `The cellar is full, so ${withCommas(have * frac)} cwt of ${variety(lot.variety).name} was sold straight from the field for $${withCommas(money)}.`, lot.field))
    }
  }
  // What was kept has been sitting in the cellar since its dig: that time is charged and shrinks the pile too.
  const nov1 = dayIndex(c.year, 10, 1)
  let rent = 0, kept = 0
  for (const lot of openLots(c)) {
    rent += ageLot(c, lot, nov1)
    kept += lotCwt(lot)
  }
  if (rent > 0) {
    out.push(note(c, 'stored', 'info', `${withCommas(kept)} cwt is in the cellar. Storing it since harvest has cost $${withCommas(rent)}.`))
  }
  const rest = c.yearRest
  if (rest > 0) out.push(note(c, 'rest', 'info', `The oats and clover brought in $${withCommas(rest)}.`))
  c.phase = 'cellar'
  c.month = 0
  return out
}


function storeMonth(c: Campaign, out: GameEvent[]): void {
  const vent = c.upgrades.vent
  for (const lot of openLots(c)) {
    const v = variety(lot.variety)
    lot.months++
    let shrink = vent ? P.SHRINK_VENT : P.SHRINK
    if (lot.months === 1) shrink += 0.03 * (1 - lot.skin)
    const stored = dayIndex(lot.year, 10, 1) - lot.dugDay + lot.months * 30
    if (!lot.sprouted && stored > v.dormancy + P.COOL_CELLAR_DAYS + (vent ? P.VENT_DAYS : 0)) {
      lot.sprouted = true
      out.push(note(c, 'sprout', 'warn', `The ${v.name} from ${FIELD_NAMES[lot.field]} has started to sprout.`, lot.field))
    }
    if (lot.sprouted) shrink += P.SPROUT_SHRINK
    let rotLoss = 0
    if (lot.rot > 0) {
      const grow = lot.rot * (vent ? P.ROT_GROW_VENT : P.ROT_GROW)
      rotLoss = Math.min(0.5, grow)
      lot.rot = Math.min(0.9, lot.rot + grow)
      if (!lot.broke && lot.rot >= P.ROT_BREAK) {
        lot.broke = true
        rotLoss = 0.55
        lot.rot = 0.06
        const seed = lot.seedHeld > 0 ? ' The seed you held back from it is lost too.' : ''
        lot.seedHeld = 0
        out.push(note(c, 'breakdown', 'bad', `Rot has spread through the ${v.name} from ${FIELD_NAMES[lot.field]}, and more than half of it is gone.${seed}`, lot.field))
      }
    }
    const keep = (1 - shrink) * (1 - rotLoss)
    const before = lotCwt(lot)
    const rent = Math.round(before * P.STORE_COST)
    c.cash -= rent
    c.yearCosts += rent
    c.yearStorage += rent
    lot.grades.no1 *= keep; lot.grades.chef *= keep; lot.grades.b *= keep; lot.grades.no2 *= keep; lot.skinned *= keep
    lot.loss.rot += before * (1 - shrink) * rotLoss
    if (lotCwt(lot) < 0.5) lot.open = false
  }
}

export const WINTER_WORKS: WinterWork[] = ['off', 'woods', 'pack', 'build']
export const WINTER_LABEL: Record<WinterWork, string> = {
  off: 'laid off', woods: 'felling in the woods', pack: 'packing in the packing shed', build: 'building',
}

// Whether today falls in the harvest break, when the schools close and pickers can be had.
export function pickersWindow(c: Campaign): boolean {
  const s = c.season
  if (!s) return false
  return s.day >= dayIndex(s.year, P.PICKERS_FROM.month, P.PICKERS_FROM.dom) && s.day <= dayIndex(s.year, P.PICKERS_TO.month, P.PICKERS_TO.dom)
}

// Puts a new person on the books: in season their first month is paid now; in spring it is part of the plan.
function takeOn(c: Campaign, u: Unit): GameEvent {
  if (c.phase === 'season' && c.season) {
    const pay = payOf(u)
    cost(c, pay)
    c.yearWages += pay
    u.paidTo = c.season.day + P.WAGE_DAYS
  }
  c.crew.push(u)
  const as = u.kind === 'hand' ? 'a field hand' : 'a tractor operator'
  return note(c, 'hired', 'info', `${u.name} is hired as ${as} at $${withCommas(u.wage)} a month.`)
}

// The tracts the farm holds with standing woods or brush to fell.
export function timberTracts(c: Campaign): number[] {
  const out: number[] = []
  for (let i = 0; i < c.fields.length; i++) if (c.fields[i].tenure !== 'none' && standing(c.fields[i].cover)) out.push(i)
  return out
}

// Why a person cannot be set to this winter work, or '' when they can. Woods work names the tract to fell.
export function winterBlock(c: Campaign, u: Unit, work: WinterWork, field = -1): string {
  if (work === 'off') return ''
  if (u.trait === 'homebody') return `${u.name} is a homebody and won't work winters.`
  switch (work) {
    case 'woods': {
      if (!Number.isInteger(field) || field < 0 || field >= P.FIELD_COUNT) {
        return timberTracts(c).length ? 'Pick a tract to fell.' : 'There\'s no standing timber on your farm to fell.'
      }
      if (c.fields[field].tenure === 'none') return `${FIELD_NAMES[field]} isn't yours.`
      if (!standing(c.fields[field].cover)) return `There's nothing left to fell on ${FIELD_NAMES[field]}.`
      return ''
    }
    case 'pack':
      if (!hasBuilt(c, 'packing')) return 'Packing needs a packing shed.'
      return unpacked(c) >= 1 ? '' : 'There\'s nothing left in storage to pack.'
    case 'build':
      return c.buildings.some(b => buildable(c, b)) ? '' : 'Nothing is being built.'
  }
  return 'No such winter work.'
}

// One month of winter. Someone kept on is paid and puts in WINTER_DAYS crew-days at their skill; the farmer works
// unpaid, FARMER_WINTER_DAYS. Anyone laid off is not paid and comes back in spring; so is someone whose winter work
// has run out, from the month it runs out.
function winterMonth(c: Campaign, out: GameEvent[]): void {
  for (const u of c.crew) {
    if (u.winter === 'off') continue
    const why = winterBlock(c, u, u.winter, u.winterField)
    if (why) {
      out.push(note(c, 'winterIdle', 'info', `${winterOff(u)}. ${why}`))
      u.winter = 'off'
      u.winterField = -1
      continue
    }
    if (u.kind !== 'farmer') {
      const pay = payOf(u)
      cost(c, pay)
      c.yearWages += pay
    }
    const skill = WINTER_SKILL[u.winter]
    const time = u.kind === 'farmer' ? P.FARMER_WINTER_DAYS : P.WINTER_DAYS
    winterWork(c, u, time * speed(u, skill), out)
    for (const level of gainXp(u, skill, time)) out.push(note(c, 'skillUp', 'good', `${subject(u, 'is', 'You are')} better at ${SKILL_LABEL[skill]}: level ${level}.`))
  }
  // Work that ran out this month lays its people off now, not a month on, so the winter's lines say what they do.
  for (const u of c.crew) {
    if (u.winter === 'off') continue
    const why = winterBlock(c, u, u.winter, u.winterField)
    if (!why) continue
    const other = u.winter === 'woods' ? timberTracts(c).filter(i => i !== u.winterField) : []
    const more = other.length ? ` ${FIELD_NAMES[other[0]]} is still standing if you want it felled.` : ''
    out.push(note(c, 'winterIdle', 'info', `${winterOff(u)}. ${why}${more}`))
    u.winter = 'off'
    u.winterField = -1
  }
}

function winterOff(u: Unit): string {
  return subject(u, 'is laid off for the rest of the winter', 'You\'re done working for the rest of the winter')
}

const WINTER_SKILL: Record<Exclude<WinterWork, 'off'>, 'woods' | 'pack' | 'build'> = { woods: 'woods', pack: 'pack', build: 'build' }

// What a month of winter work does, in standard crew-days.
function winterWork(c: Campaign, u: Unit, days: number, out: GameEvent[]): void {
  if (u.winter === 'pack') pack(c, days * P.PACK_PER_DAY)
  if (u.winter === 'build') {
    let left = days
    for (const b of c.buildings) {
      if (!buildable(c, b) || left <= 0) continue
      const use = Math.min(left, b.need - b.done)
      left -= use
      if (buildWork(c, b, use)) out.push(note(c, 'built', 'good', `The ${P.BUILDINGS[b.kind].name.toLowerCase()} in ${YARD_NAME[b.yard]} was built over the winter. ${P.BUILDINGS[b.kind].does}`))
    }
  }
  if (u.winter === 'woods') {
    const i = u.winterField
    if (fell(c, i, days, u)) {
      out.push(note(c, 'felled', 'good', `${FIELD_NAMES[i]} was felled over the winter. The stumps are still there, and a contractor can pull them.${sheltering(c, i)}`, i))
    }
  }
}

// Cwt of No. 1 and B size in store not yet packed.
export function unpacked(c: Campaign): number {
  let cwt = 0
  for (const l of openLots(c)) cwt += (l.grades.no1 + l.grades.b) * (1 - l.packed)
  return cwt
}

// Packs up to cwt of the stored No. 1 and B size, the oldest lots first, at the packing charge.
function pack(c: Campaign, cwt: number): void {
  let left = cwt
  for (const l of openLots(c)) {
    const base = l.grades.no1 + l.grades.b
    const take = Math.min(left, base * (1 - l.packed))
    if (take <= 0) continue
    l.packed = Math.min(1, l.packed + take / base)
    left -= take
    const charge = take * P.PACK_CHARGE
    cost(c, charge)
    c.yearPacking += charge
    if (left <= 0) break
  }
}

// Dollars still owed on the land mortgage.
export function mortgageOwed(c: Campaign): number {
  let owed = 0
  for (const m of c.mortgages) owed += m.owed
  return owed
}

// What the bank takes at this year end: a set share of each purchase's loan, and interest on what is still owed.
export function mortgageDue(c: Campaign): { principal: number; interest: number } {
  let principal = 0, interest = 0
  for (const m of c.mortgages) {
    interest += m.owed * P.MORTGAGE_RATE
    principal += Math.min(m.owed, m.loan * P.MORTGAGE_PRINCIPAL)
  }
  return { principal, interest }
}

export function netWorth(c: Campaign): number {
  let w = c.cash
  for (const id of Object.keys(c.upgrades) as UpgradeId[]) if (c.upgrades[id]) w += P.UPGRADES[id].cost * 0.5
  for (let i = HOME_FIELDS; i < c.fields.length; i++) if (c.fields[i].tenure === 'owned') w += PARCELS[i].price * P.LAND_WORTH
  w -= mortgageOwed(c)
  return Math.round(w)
}

function closeYear(world: World, c: Campaign, out: GameEvent[]): void {
  const s = c.season!
  settleContracts(c, 'all', out)
  let interest = 0
  const lots = c.lots.filter(l => l.year === c.year)
  let potatoFields = 0, market = 0, culled = 0, peak = 0, sprays = 0
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.status === 'off') continue
    if (c.plans[i].crop === 'potato' && f.plantDay >= 0) potatoFields++
    if (f.sevPeak > peak) peak = f.sevPeak
    sprays += f.sprays ?? 0
  }
  for (const lot of lots) {
    market += lot.sold
    culled += lot.loss.green + lot.loss.blight + lot.loss.frost + lot.loss.rot + lot.loss.small
  }
  // The land mortgage: a share of each loan and the interest on what is still owed, part of the year's costs.
  if (c.mortgages.length) {
    const due = mortgageDue(c)
    const pay = due.principal + due.interest
    cost(c, pay)
    c.yearMortgage += pay
    for (const m of c.mortgages) m.owed -= Math.min(m.owed, m.loan * P.MORTGAGE_PRINCIPAL)
    c.mortgages = c.mortgages.filter(m => m.owed > 0.005)
    out.push(note(c, 'mortgage', 'info', `The bank took $${withCommas(pay)} for the land mortgage, $${withCommas(due.principal)} off the loan and $${withCommas(due.interest)} in interest. You still owe $${withCommas(mortgageOwed(c))}.`))
  }
  c.cash -= P.NOTE_PAYMENT + P.LIVING
  if (c.cash < 0) {
    interest = Math.round(-c.cash * P.CREDIT_RATE)
    c.cash -= interest
  }
  const sum: YearSummary = {
    year: c.year,
    cashStart: c.history.length ? c.history[c.history.length - 1].cashEnd : P.START_CASH,
    cashEnd: c.cash,
    revenue: c.yearRevenue, costs: c.yearCosts, note: P.NOTE_PAYMENT, living: P.LIVING, interest,
    restIncome: c.yearRest, storage: c.yearStorage,
    wages: c.yearWages, rent: c.yearRent, land: c.yearLand, penalties: c.yearPenalties, contracts: c.yearContracts,
    logs: c.yearLogs, mortgage: c.yearMortgage, works: c.yearWorks, building: c.yearBuilding, stand: c.yearStand, packing: c.yearPacking,
    cwtSold: market, cwtCulled: culled,
    yieldCwtAcre: potatoFields ? market / (potatoFields * P.FIELD_ACRES) : 0,
    potatoFields, blightPeak: peak, sprays, lots,
  }
  c.history.push(sum)

  // Seed held back comes out of the cellar as next year's stock.
  c.seedStock = []
  for (const lot of lots) {
    if (lot.seedHeld > 0 && !lot.broke) {
      c.seedStock.push({ variety: lot.variety, fields: lot.seedHeld, virus: lot.virus, blight: lot.blightSeed })
    }
  }
  // Frost heaves stones up through the winter in every open field the farm holds.
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const fp = c.fields[i]
    if (fp.tenure !== 'none' && fp.cover === 'open') fp.stones = Math.min(1, fp.stones + P.HEAVE)
  }
  // Soil remembers what grew, on the land the farm held this year; new ground has had its first year.
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    if (s.fields[i].status === 'off') continue
    const fp = c.fields[i]
    fp.raw = false
    const odds = fp.vert / (1 - fp.vert)
    // A potato field that was never planted lay fallow: it counts as a year out of potatoes.
    if (c.plans[i].crop === 'potato' && s.fields[i].plantDay >= 0) {
      fp.soil = Math.max(0, fp.soil + P.SOIL_AFTER_POTATO)
      fp.streak++
      const o = odds * P.VERT_GROW
      fp.vert = Math.min(0.95, o / (1 + o))
    } else {
      fp.soil = 1
      fp.streak = 0
      const o = odds * P.VERT_REST
      fp.vert = Math.max(0.01, o / (1 + o))
    }
  }
  c.phase = 'ledger'
  if (c.cash < P.CREDIT_LIMIT) {
    c.outcome = 'lost'
    out.push(note(c, 'lost', 'bad', 'The bank has called in your loan, and the farm is being sold at auction.'))
  } else if (c.outcome === '' && c.yearIdx + 1 >= c.goalYears) {
    c.outcome = 'kept'
    out.push(note(c, 'kept', 'good', 'You made it through five seasons, and the farm is still yours.'))
  }
}

function nextYear(world: World, c: Campaign): Result {
  if (c.outcome === 'lost') { c.phase = 'over'; return ok() }
  if (!world.weather.playable.includes(c.year + 1)) { c.phase = 'over'; return ok() }
  c.year++
  c.yearIdx++
  c.yearRevenue = 0
  c.yearCosts = 0
  c.yearRest = 0
  c.yearStorage = 0
  c.yearWages = 0
  c.yearRent = 0
  c.yearLand = 0
  c.yearContracts = 0
  c.yearPenalties = 0
  c.yearLogs = 0
  c.yearMortgage = 0
  c.yearWorks = 0
  c.yearBuilding = 0
  c.yearStand = 0
  c.yearPacking = 0
  c.month = 0
  c.season = null
  c.lots = []
  c.contracts = []
  c.offers = contractOffers(c.seed, c.year)
  c.applicants = springApplicants(c)
  // A neighbour's offer for someone is made once while they work here; the rest may come again next year.
  c.heard = c.heard.filter(k => k.startsWith('poach:'))
  c.phase = 'plan'
  // Carry the plan forward with the rotation flipped where the soil asks for it, and drop seed that is not there.
  // Rented land and the hired crew carry forward too, until they are released or dismissed.
  c.plans = c.plans.map((p, i) => {
    if (!isField(c, i) || c.fields[i].raw) return { ...REST_PLAN }
    const fp = c.fields[i]
    const crop = p.crop === 'potato' && fp.streak >= 2 ? 'rest' : p.crop === 'rest' ? 'potato' : p.crop
    return { crop, variety: p.variety, seed: 'certified' } as FieldPlan
  })
  // Hedgerows cut back BRUSH_YEARS ago have grown back.
  const out: GameEvent[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const fp = c.fields[i]
    if (fp.brushed >= 0 && !brushedNow(c, i)) {
      fp.brushed = -1
      if (fp.tenure !== 'none') out.push(note(c, 'brushBack', 'info', `The brush has grown back along ${FIELD_NAMES[i]}.`, i))
    }
  }
  return ok(out)
}

function fieldIndex(field: number): boolean {
  return Number.isInteger(field) && field >= 0 && field < P.FIELD_COUNT
}

export function apply(world: World, c: Campaign, cmd: Cmd): Result {
  const opened = openRoutine(c)
  const r = command(world, c, cmd)
  if (opened && r.ok) r.events.unshift(opened)
  if (r.ok) r.events.push(...lapsedBuyers(c))
  return r
}

// A buyer's offer for a lot that has since been sold, delivered or used up goes with it, so no telegram offers to buy
// what is not there.
function lapsedBuyers(c: Campaign): GameEvent[] {
  const out: GameEvent[] = []
  for (const inc of [...c.incidents]) {
    if (inc.kind !== 'buyer') continue
    const lot = c.lots.find(l => l.id === inc.lot)
    if (lot && lot.open && lotCwt(lot) >= P.BUYER_MIN_CWT) continue
    c.incidents.splice(c.incidents.indexOf(inc), 1)
    out.push(note(c, 'incidentDone', 'info', `The buyer has moved on, because ${lot ? `the ${variety(lot.variety).name} from ${FIELD_NAMES[lot.field]}` : 'that lot'} is no longer there to buy.`))
  }
  return out
}

// A game saved before the routine opens with it on, and says so once.
function openRoutine(c: Campaign): GameEvent | null {
  c.heard ??= []
  for (const j of c.season?.jobs ?? []) j.by ??= 'you'
  for (const u of c.crew) u.rest ??= 'auto'
  if (c.routine) return null
  c.routine = { ...P.ROUTINE_DEFAULT }
  return note(c, 'routine', 'info', 'Your crew now follows a routine. Planting, hilling, walking the fields, test digs, digging and hauling go on the work list automatically. Spraying, watering and killing the vines are your decisions. You can change any of these under Who does what.')
}

// The year the date falls in now: from January the winter's cellar months, and the ledger closed in spring, are
// in the year after the season's. The ledger itself is the season's year.
export function yearNow(c: Campaign): number {
  return c.year + ((c.phase === 'cellar' && c.month >= 2) || c.phase === 'ledger' ? 1 : 0)
}

// "Year 2" (or the record's year) for the date now.
export function yearNowLabel(c: Campaign): string {
  return yearLabel(yearNow(c))
}

// Whether this kind of work goes on the list by itself.
export function routineOn(c: Campaign, kind: JobKind): boolean {
  return (P.ROUTINE_KINDS as JobKind[]).includes(kind) && (c.routine?.[kind as RoutineKind] ?? P.ROUTINE_DEFAULT[kind as RoutineKind])
}

// How spraying is done this season, or null when the player has not said this year.
export function sprayWayNow(c: Campaign): SprayWay | null {
  return c.sprayWay && c.sprayWay.year === c.year ? c.sprayWay.way : null
}

// The farm's standing orders, in the order they are listed.
export function routineInfo(c: Campaign): { kind: JobKind; auto: boolean }[] {
  return P.ROUTINE_KINDS.map(kind => ({ kind, auto: routineOn(c, kind) }))
}

function command(world: World, c: Campaign, cmd: Cmd): Result {
  switch (cmd.t) {
    case 'plan': {
      if (c.phase !== 'plan') return fail('You can only change the plan in spring.')
      if (!fieldIndex(cmd.field)) return fail('No such field.')
      if (!held(c, cmd.field)) return fail(`${FIELD_NAMES[cmd.field]} isn't yours. Rent or buy it first.`)
      if (!isField(c, cmd.field)) return fail(`${FIELD_NAMES[cmd.field]} is still ${COVER_WORD[c.fields[cmd.field].cover]}. Clear it first.`)
      const v = variety(cmd.plan.variety)
      if (cmd.plan.crop === 'potato' && v.released > c.year) return fail(`${v.name} wasn't released until ${v.released}.`)
      const before = c.plans[cmd.field]
      c.plans[cmd.field] = { crop: cmd.plan.crop, variety: cmd.plan.variety, seed: cmd.plan.seed }
      const short = savedSeedShort(c)
      if (short) { c.plans[cmd.field] = before; return fail(short) }
      return ok()
    }
    case 'buy': {
      if (c.phase !== 'plan') return fail('You can only buy equipment in spring.')
      const u = P.UPGRADES[cmd.upgrade]
      if (!u) return fail('No such equipment.')
      if (c.upgrades[cmd.upgrade]) return fail('You already own it.')
      if ((cmd.upgrade === 'tractor2' || cmd.upgrade === 'tractor3') && !hasBuilt(c, 'shed')) return fail('You need the machine shed before you can keep another tractor.')
      if (cmd.upgrade === 'tractor3' && !c.upgrades.tractor2) return fail('Buy the second tractor first.')
      if (cmd.upgrade === 'house2' && buildingAt(c, 'house', HOME_YARD)) return fail('You already have a second potato house at home, built or going up.')
      if (c.cash - u.cost < 0) return fail('You can\'t afford it yet, and the bank won\'t lend for equipment.')
      c.cash -= u.cost
      c.yearCosts += u.cost
      c.upgrades[cmd.upgrade] = true
      // A contractor puts up the second potato house at once.
      if (cmd.upgrade === 'house2') c.buildings.push({ id: c.nextBuilding++, kind: 'house', yard: HOME_YARD, done: P.BUILDINGS.house.days, need: P.BUILDINGS.house.days, built: true })
      return ok()
    }
    case 'answer': {
      const s = c.season
      const inc = c.incidents.find(i => i.id === cmd.incident)
      if (!inc || c.phase !== 'season' || !s) return fail('That question is no longer waiting for an answer.')
      if (!inc.choices.includes(cmd.choice)) return fail(`The choices are: ${inc.choices.map(ch => CHOICE_LABEL[ch]).join(', ')}.`)
      const why = answerBlock(c, inc, cmd.choice)
      if (why) return fail(why)
      const out: GameEvent[] = []
      answer(world, c, s, inc, cmd.choice, out)
      return ok(out)
    }
    case 'build': {
      const why = buildBlock(c, cmd.kind, cmd.yard, holdsDufour(c))
      if (why) return fail(why)
      const cost = buildCost(c, cmd.kind)
      const b = startBuilding(c, cmd.kind, cmd.yard)
      if (c.phase === 'season' && c.season) c.season.jobs.push(buildJob(c.season, b))
      const spec = P.BUILDINGS[cmd.kind]
      const bought = cost.buyLogs > 0 || cost.buyStone > 0 ? `, including ${[cost.buyLogs > 0 ? `${Math.ceil(cost.buyLogs)} loads of logs` : '', cost.buyStone > 0 ? `${Math.ceil(cost.buyStone)} loads of stone` : ''].filter(Boolean).join(' and ')} you had to buy,` : ''
      const when = c.phase === 'season' ? 'It\'s on the work list for whoever builds.' : c.phase === 'cellar' ? 'Anyone you keep on to build can put it up this winter.' : 'It goes on the work list when the season starts.'
      return ok([note(c, 'building', 'info', `${article(spec.name, true)} ${spec.name.toLowerCase()} is started in ${YARD_NAME[cmd.yard]}. It costs $${withCommas(cost.total)}${bought} and takes ${spec.days} crew-days of building. ${when}`)])
    }
    case 'rent': {
      if (c.phase !== 'plan') return fail('You can only rent land in spring.')
      if (!fieldIndex(cmd.field)) return fail('No such field.')
      const fp = c.fields[cmd.field]
      const name = FIELD_NAMES[cmd.field]
      if (fp.tenure === 'owned') return fail(`You already own ${name}.`)
      if (fp.tenure === 'rented') return fail(`You've already rented ${name} for this year.`)
      if (PARCELS[cmd.field].holding !== 'field') return fail(`${name} isn't for rent. You can only buy it.`)
      fp.tenure = 'rented'
      c.plans[cmd.field] = defaultPlan(c, cmd.field)
      return ok([note(c, 'rented', 'info', `You've rented ${name} for the year. The $${withCommas(PARCELS[cmd.field].rent)} rent is due when the season starts.`, cmd.field)])
    }
    case 'release': {
      if (c.phase !== 'plan') return fail('You can only give up rented land in spring.')
      if (!fieldIndex(cmd.field)) return fail('No such field.')
      const fp = c.fields[cmd.field]
      const name = FIELD_NAMES[cmd.field]
      if (fp.tenure === 'owned') return fail(`You own ${name}, and land can't be sold back.`)
      if (fp.tenure === 'none') return fail(`${name} isn't yours.`)
      fp.tenure = 'none'
      c.plans[cmd.field] = { ...REST_PLAN }
      return ok([note(c, 'released', 'info', `${name} goes back to its owner.`, cmd.field)])
    }
    case 'buyLand': {
      if (c.phase !== 'plan') return fail('You can only buy land in spring.')
      if (!fieldIndex(cmd.field)) return fail('No such field.')
      const fp = c.fields[cmd.field]
      const name = FIELD_NAMES[cmd.field]
      if (fp.tenure === 'owned') return fail(`You already own ${name}.`)
      if (PARCELS[cmd.field].holding === 'dufour' && !holdsDufour(c)) return fail(`${name} comes with the Dufour place, so rent or buy a Dufour field first.`)
      const price = PARCELS[cmd.field].price
      const down = Math.round(price * P.MORTGAGE_DOWN)
      if (c.cash - down < 0) return fail(`You can't afford the down payment yet. It's $${withCommas(down)}, a quarter of the price.`)
      const was = fp.tenure
      cost(c, down)
      c.yearLand += down
      c.mortgages.push({ field: cmd.field, loan: price - down, owed: price - down })
      fp.tenure = 'owned'
      if (was === 'none') c.plans[cmd.field] = defaultPlan(c, cmd.field)
      return ok([note(c, 'landBought', 'good', `${name} is yours. You bought it for $${withCommas(price)}, with $${withCommas(down)} down and $${withCommas(price - down)} on the land mortgage.`, cmd.field)])
    }
    case 'stump': {
      const why = stumpBlock(c, cmd.field)
      if (why) return fail(why)
      cost(c, P.STUMP_FEE)
      c.yearWorks += P.STUMP_FEE
      c.fields[cmd.field].works = { kind: 'stump', left: P.STUMP_DAYS }
      return ok([note(c, 'stumping', 'info', `A contractor will pull the stumps on ${FIELD_NAMES[cmd.field]}. It costs $${withCommas(P.STUMP_FEE)} and takes about ${P.STUMP_DAYS} season days.`, cmd.field)])
    }
    case 'tile': {
      const why = tileBlock(c, cmd.field)
      if (why) return fail(why)
      cost(c, P.TILE_FEE)
      c.yearWorks += P.TILE_FEE
      c.fields[cmd.field].works = { kind: 'tile', left: P.TILE_DAYS }
      return ok([note(c, 'tiling', 'info', `A contractor will lay tile drains under ${FIELD_NAMES[cmd.field]}. It costs $${withCommas(P.TILE_FEE)} and takes about ${P.TILE_DAYS} season days.`, cmd.field)])
    }
    case 'sellLogs': {
      if (c.phase !== 'plan' && c.phase !== 'season' && c.phase !== 'cellar') return fail('You can sell logs in spring, during the season, or in winter.')
      if (!Number.isFinite(cmd.loads) || cmd.loads <= 0) return fail('Choose how many loads to sell.')
      if (cmd.loads > c.logs + 1e-9) return fail(`There ${c.logs >= 1 && c.logs < 2 ? 'is' : 'are'} only ${Math.floor(c.logs * 10) / 10} loads of logs in the yard.`)
      const loads = Math.min(cmd.loads, c.logs)
      const money = loads * P.LOG_PRICE
      c.logs -= loads
      if (c.logs < 1e-9) c.logs = 0
      c.cash += money
      c.yearRevenue += money
      c.yearLogs += money
      return ok([note(c, 'logsSold', 'good', `Sold ${Math.round(loads * 10) / 10} loads of logs to the mill for $${withCommas(money)}.`)])
    }
    case 'payMortgage': {
      if (c.phase !== 'plan') return fail('You can only pay extra on the mortgage in spring.')
      const owed = mortgageOwed(c)
      if (owed <= 0) return fail('Nothing is owed on the land.')
      if (!Number.isFinite(cmd.amount) || cmd.amount <= 0) return fail('Choose how much to pay.')
      if (cmd.amount > owed + 1e-6) return fail(`Only $${withCommas(owed)} is owed.`)
      if (c.cash - cmd.amount < 0) return fail('You don\'t have enough cash.')
      let left = Math.min(cmd.amount, owed)
      const paid = left
      for (const m of c.mortgages) {
        const take = Math.min(m.owed, left)
        m.owed -= take
        left -= take
      }
      c.mortgages = c.mortgages.filter(m => m.owed > 0.005)
      cost(c, paid)
      c.yearMortgage += paid
      return ok([note(c, 'mortgagePaid', 'good', `You paid $${withCommas(paid)} off the land mortgage and still owe $${withCommas(mortgageOwed(c))}.`)])
    }
    case 'accept': {
      if (c.phase !== 'plan') return fail('You can only sign contracts in spring.')
      const k = c.offers.findIndex(o => o.id === cmd.offer)
      if (k < 0) return fail('No such offer.')
      const [o] = c.offers.splice(k, 1)
      const signed: Contract = { ...o, delivered: 0, paid: 0, penalty: 0, settled: false }
      c.contracts.push(signed)
      return ok([note(c, 'accepted', 'info', `You signed a contract with ${o.buyer.toLowerCase()} for ${withCommas(o.cwt)} cwt of ${variety(o.variety).name} at $${o.price.toFixed(2)} a cwt.`)])
    }
    case 'begin': {
      if (c.phase !== 'plan') return fail('The season has already started.')
      const short = savedSeedShort(c)
      if (short) return fail(short)
      const pc = planCosts(c)
      if (c.cash - pc.total < P.OPERATING_LIMIT) return fail('The bank won\'t lend that much for spring. Rest a field, or plant saved seed, which is free but carries virus.')
      cost(c, pc.total)
      c.yearRent += pc.rent
      c.yearWages += pc.wages
      c.offers = []
      c.applicants = []
      startSeason(world, c)
      c.phase = 'season'
      return ok()
    }
    case 'hire': {
      if ('applicant' in cmd) {
        const why = hireRoom(c)
        if (why) return fail(why)
        const a = c.applicants.find(x => x.id === cmd.applicant)
        if (!a) return fail(c.phase === 'plan' ? 'No such applicant.' : 'The people who asked for work in spring have found other work.')
        c.applicants = c.applicants.filter(x => x !== a)
        return ok([takeOn(c, fromApplicant(c, a))])
      }
      const why = hireBlock(c, cmd.kind)
      if (why) return fail(why)
      return ok([takeOn(c, newUnit(c, cmd.kind as 'hand' | 'operator'))])
    }
    case 'dismiss': {
      if (c.phase !== 'plan' && c.phase !== 'season') return fail('You can let people go in spring or during the season.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such hand.')
      if (u.kind === 'farmer') return fail('You\'re the farmer, so you stay.')
      removePerson(c, u)
      return ok([note(c, 'dismissed', 'info', `${u.name} has been let go.`)])
    }
    case 'raise': {
      if (c.phase === 'over') return fail('The farm is gone.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such person.')
      if (u.kind === 'farmer') return fail('As the farmer you don\'t draw a wage. Your family\'s living costs come out at the end of the year.')
      if (!Number.isFinite(cmd.wage)) return fail('Choose what the wage should be.')
      const wage = Math.round(cmd.wage)
      if (wage < P.WAGE_MIN || wage > P.WAGE_MAX) return fail(`A wage has to be between $${withCommas(P.WAGE_MIN)} and $${withCommas(P.WAGE_MAX)} a month.`)
      if (wage === u.wage) return fail(`${u.name} is already paid $${withCommas(wage)} a month.`)
      const was = u.wage
      u.wage = wage
      return ok([note(c, 'raise', 'info', `${u.name}'s wage goes from $${withCommas(was)} to $${withCommas(wage)} a month. They asked for $${withCommas(u.ask)}.`)])
    }
    case 'priority': {
      if (c.phase === 'over') return fail('The farm is gone.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such person.')
      if (!P.SKILLS.includes(cmd.work)) return fail('No such kind of work.')
      if (!Number.isInteger(cmd.level) || cmd.level < 0 || cmd.level > P.PRIORITY_MAX) return fail(`A priority runs from 1 (first) to ${P.PRIORITY_MAX}, or 0 for never.`)
      if (u.prio[cmd.work] === cmd.level) return fail(`${subject(u, 'already has', 'You already have')} ${SKILL_LABEL[cmd.work]} at priority ${cmd.level}.`)
      u.prio[cmd.work] = cmd.level
      if (cmd.level === 0) {
        // Set never to do this work: orders of that kind pinned to them are anyone's, and one held goes back.
        for (const j of c.season?.jobs ?? []) {
          if (jobSkill(j.kind) !== cmd.work) continue
          if (j.unit === u.id) j.unit = -1
          if (u.job === j.id) letGo(u)
        }
      }
      return ok()
    }
    case 'foreman': {
      if (c.phase === 'over') return fail('The farm is gone.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such person.')
      if (u.kind === 'farmer') return fail('You\'re the farmer and already run the whole farm. A foreman has to be someone you hired.')
      if (cmd.block === null) {
        if (!u.foreman) return fail(`${u.name} isn't a foreman.`)
        u.foreman = ''
        return ok([note(c, 'foreman', 'info', `${u.name} goes back to field work.`)])
      }
      const block = cmd.block as BlockId
      if (!BLOCKS.includes(block)) return fail('No such block.')
      if (u.foreman === block) return fail(`${u.name} is already foreman there.`)
      if (!PARCELS.some((p, i) => p.block === block && held(c, i))) return fail('You hold no land there.')
      const other = c.crew.find(x => x.foreman === block)
      if (other) return fail(`${other.name} is already foreman there.`)
      u.foreman = block
      for (const j of c.season?.jobs ?? []) if (j.unit === u.id) j.unit = -1
      letGo(u)
      return ok([note(c, 'foreman', 'info', `${u.name} is now foreman of ${BLOCK_NAME[block]}. They'll add whatever its fields need to the work list, and won't do field work themselves.`)])
    }
    case 'sundays': {
      if (c.phase === 'over') return fail('The farm is gone.')
      if (typeof cmd.off !== 'boolean') return fail('Choose whether Sundays are off.')
      if (c.sundaysOff === cmd.off) return fail(cmd.off ? 'Sundays are already off.' : 'Your farm already works Sundays.')
      c.sundaysOff = cmd.off
      return ok([note(c, 'sundays', 'info', cmd.off ? 'Sundays are off now, so nobody works on a Sunday.' : 'Your farm works Sundays now. That\'s one more day each week, but everyone gets more tired.')])
    }
    case 'pickers': {
      const s = c.season
      if (c.phase !== 'season' || !s || s.frozen) return fail('You can hire pickers during the harvest.')
      if (typeof cmd.on !== 'boolean') return fail('Choose whether to hire the pickers.')
      if (s.pickers === cmd.on) return fail(cmd.on ? 'The pickers are already here.' : 'There are no pickers to send home.')
      if (cmd.on && !pickersWindow(c)) return fail('Schools only close for the harvest from September 20 to October 10.')
      s.pickers = cmd.on
      return ok([note(c, 'pickers', 'info', cmd.on ? `A picking crew is hired at $${withCommas(P.PICKER_DAY)} for each day worked, and digging goes faster.` : 'The pickers are sent home.')])
    }
    case 'winter': {
      if (c.phase === 'over') return fail('The farm is gone.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such person.')
      if (!WINTER_WORKS.includes(cmd.work)) return fail('No such winter work.')
      const field = cmd.work === 'woods' ? cmd.field ?? -1 : -1
      if (u.winter === cmd.work && u.winterField === field) return fail(`${subject(u, 'is', 'You\'re')} already set to that for the winter.`)
      const why = winterBlock(c, u, cmd.work, field)
      if (why) return fail(why)
      u.winter = cmd.work
      u.winterField = field
      return ok([note(c, 'winterSet', 'info', cmd.work === 'off' ? subject(u, 'will be laid off for the winter without pay, and will come back in spring.', 'You\'ll take the winter off.')
        : `${subject(u, 'will stay on this winter,', 'You\'ll spend this winter')} ${WINTER_LABEL[cmd.work]}.`)])
    }
    case 'job': {
      // The coach's ask is read before the order goes on the list, where it stops asking.
      const asked = cmd.kind === 'kill' ? asks(world, c) : []
      const why = addJob(c, cmd.kind, cmd.field, cmd.unit ?? -1, 'you')
      if (why) return fail(why)
      noteKillAsks(world, c, asked)
      if (cmd.kind === 'kill') delete c.season!.fields[cmd.field].keepVines
      return ok()
    }
    case 'rest': {
      if (c.phase === 'over') return fail('The farm is gone.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such person.')
      const mode = cmd.mode ?? 'now'
      if (mode !== 'now' && mode !== 'auto' && mode !== 'push') return fail('Choose one: rest now, rest when worn out, or keep working.')
      if (u.rest === mode) return fail(mode === 'now' ? `${subject(u, 'is', 'You\'re')} already resting.` : mode === 'push' ? `${subject(u, 'is', 'You\'re')} already told to keep working.` : `${subject(u, 'already rests', 'You already rest')} when worn out.`)
      u.rest = mode
      if (mode === 'now') letGo(u)
      return ok([note(c, 'rest', 'info', mode === 'now' ? `${subject(u, 'takes', 'You take')} time off until rested.` : mode === 'push' ? `${subject(u, 'will', 'You\'ll')} keep working no matter how tired, which is slower and risks an injury on a machine or in the woods.` : `${subject(u, 'will', 'You\'ll')} rest automatically once worn out.`)])
    }
    case 'keepVines': {
      if (c.phase !== 'season' || !c.season) return fail('The season isn\'t under way.')
      const f = fieldIndex(cmd.field) ? c.season.fields[cmd.field] : undefined
      if (!f) return fail('No such field.')
      if (typeof cmd.keep !== 'boolean') return fail('Choose whether to keep the vines up.')
      if (!!f.keepVines === cmd.keep) return fail(cmd.keep ? 'You\'re already keeping these vines up.' : 'Your crew already kills these vines when they\'re due.')
      if (cmd.keep) {
        f.keepVines = true
        for (const j of c.season.jobs.filter(x => x.kind === 'kill' && x.field === cmd.field && x.by === 'routine')) { c.season.jobs.splice(c.season.jobs.indexOf(j), 1); releaseJob(c, j.id) }
      } else delete f.keepVines
      return ok([note(c, 'keepVines', 'info', cmd.keep ? `The vines in ${FIELD_NAMES[cmd.field]} will stay up until you order them killed. If they're still up on ${formatDay(c.year, dayIndex(c.year, P.DIG_GREEN.month, P.DIG_GREEN.dom))}, the field gets dug green.`
        : `Your crew will kill the vines in ${FIELD_NAMES[cmd.field]} automatically when they're due.`)])
    }
    case 'sprayWay': {
      if (c.phase === 'over') return fail('The farm is gone.')
      if (cmd.way !== 'auto' && cmd.way !== 'ask' && cmd.way !== 'none') return fail('Choose one: keep the fields sprayed, ask each time, or not this year.')
      if (sprayWayNow(c) === cmd.way) return fail('Spraying is already done that way this year.')
      c.sprayWay = { year: c.year, way: cmd.way }
      c.routine.spray = cmd.way === 'auto'
      // Not this year: the sprays the routine put on the list come off it; the player's own orders stand.
      if (cmd.way === 'none' && c.season) {
        for (const j of c.season.jobs.filter(x => x.kind === 'spray' && x.by === 'routine')) { c.season.jobs.splice(c.season.jobs.indexOf(j), 1); releaseJob(c, j.id) }
      }
      return ok([note(c, 'routine', 'info', cmd.way === 'auto' ? 'Spraying now goes on the work list automatically wherever a field needs it.'
        : cmd.way === 'ask' ? 'Spraying now waits for your order.' : 'No spraying this year. You won\'t be asked to spray any field, and if blight comes, nothing will stop it.')])
    }
    case 'routine': {
      if (c.phase === 'over') return fail('The farm is gone.')
      if (!(P.ROUTINE_KINDS as JobKind[]).includes(cmd.kind)) return fail(`${JOB_LABEL[cmd.kind] ?? 'That'} is never ordered automatically.`)
      if (typeof cmd.auto !== 'boolean') return fail('Choose whether it\'s done automatically.')
      const kind = cmd.kind as RoutineKind
      if (c.routine[kind] === cmd.auto && !(kind === 'spray' && sprayWayNow(c) === 'none')) return fail(cmd.auto ? `${JOB_LABEL[kind]} is already done automatically.` : `${JOB_LABEL[kind]} already waits for your order.`)
      c.routine[kind] = cmd.auto
      if (kind === 'spray') c.sprayWay = { year: c.year, way: cmd.auto ? 'auto' : 'ask' }
      return ok([note(c, 'routine', 'info', cmd.auto ? `${JOB_LABEL[kind]} now goes on the work list automatically wherever a field needs it.` : `${JOB_LABEL[kind]} now waits for your order.`)])
    }
    case 'assign': {
      if (c.phase !== 'season' || !c.season) return fail('There\'s no work list right now.')
      const job = c.season.jobs.find(j => j.id === cmd.id)
      if (!job) return fail('No such job.')
      if (!Number.isInteger(cmd.unit) || cmd.unit < -1) return fail('No such crew.')
      const why = unitBlock(c, job.kind, cmd.unit)
      if (why) return fail(why)
      job.unit = cmd.unit
      for (const u of c.crew) if (u.job === job.id && cmd.unit >= 0 && u.id !== cmd.unit) letGo(u)
      return ok()
    }
    case 'cancel': {
      if (c.phase !== 'season' || !c.season) return fail('There\'s no work list right now.')
      const k = c.season.jobs.findIndex(j => j.id === cmd.id)
      if (k < 0) return fail('No such job.')
      if (c.season.jobs[k].kind === 'haul') return fail('The crop in the field has to come in, so hauling can\'t be canceled.')
      if (c.season.jobs[k].kind === 'build') return fail('The building is paid for, so it stays on the work list until it\'s built.')
      if (c.season.jobs[k].kind === 'dig' && c.season.jobs[k].done > 0) return fail('The digger is already in the field, so it\'s too late to cancel.')
      // A vine kill taken off the list is the player keeping the vines up: the crew does not kill them by itself.
      if (c.season.jobs[k].kind === 'kill') c.season.fields[c.season.jobs[k].field].keepVines = true
      c.season.jobs.splice(k, 1)
      releaseJob(c, cmd.id)
      return ok()
    }
    case 'bump': {
      if (c.phase !== 'season' || !c.season) return fail('There\'s no work list right now.')
      const k = c.season.jobs.findIndex(j => j.id === cmd.id)
      if (k < 0) return fail('No such job.')
      const [job] = c.season.jobs.splice(k, 1)
      c.season.jobs.unshift(job)
      return ok()
    }
    case 'day': {
      if (c.phase !== 'season' || !c.season) return fail('The season isn\'t under way.')
      if (c.season.frozen) return fail('The ground has frozen. Close out the season.')
      const orders = standingOrders(world, c)
      const day = stepDay(world, c)
      return ok([...orders, ...day, ...frostAhead(world, c)])
    }
    case 'endSeason': {
      if (c.phase !== 'season' || !c.season) return fail('The season isn\'t under way.')
      return ok(endSeason(world, c))
    }
    case 'sell': {
      if (c.phase !== 'season' && c.phase !== 'cellar') return fail('There\'s nothing to sell right now.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('That lot is gone.')
      if (Number.isNaN(cmd.frac)) return fail('Choose how much to sell.')
      if (c.phase === 'season' && c.season) {
        const f = c.season.fields[lot.field]
        if (f.status === 'digging') return fail('It\'s still being dug.')
        if (f.status === 'dug' && !f.weighed) return fail('It\'s still in barrels in the field. You can sell it once it\'s hauled in and weighed.')
        ageLot(c, lot, c.season.day)
      }
      const money = sellLot(world, c, lot, cmd.frac)
      return ok([note(c, 'sold', 'good', `Sold ${variety(lot.variety).name} from ${FIELD_NAMES[lot.field]} for $${withCommas(money)}.`, lot.field)])
    }
    case 'deliver': {
      if (c.phase !== 'season' && c.phase !== 'cellar') return fail('There\'s nothing to deliver right now.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('That lot is gone.')
      const k = c.contracts.find(x => x.id === cmd.contract)
      if (!k) return fail('No such contract.')
      if (k.settled) return fail('That contract has closed.')
      const name = variety(lot.variety).name
      if (k.variety !== lot.variety) return fail(`${k.buyer} wants ${variety(k.variety).name}, not ${name}.`)
      const need = k.cwt - k.delivered
      if (need <= 1e-6) return fail('That contract is already filled.')
      if (c.phase === 'season' && c.season && c.season.fields[lot.field].status === 'digging') return fail('It\'s still being dug.')
      if (c.phase === 'season' && c.season && !c.season.fields[lot.field].weighed) return fail('It\'s still in barrels in the field. You can deliver it once it\'s hauled in and weighed.')
      if (lot.grades.no1 + lot.grades.chef <= 1e-6) return fail('There are no US No. 1 or large potatoes left in that lot.')
      const { take, money } = deliverLot(c, lot, k)
      return ok([note(c, 'delivered', 'good', `Delivered ${withCommas(take)} cwt of ${name} from ${FIELD_NAMES[lot.field]} to ${k.buyer.toLowerCase()} for $${withCommas(money)}.`, lot.field)])
    }
    case 'seed': {
      if (c.phase !== 'cellar') return fail('You can only hold back seed once the crop is in the cellar.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('That lot is gone.')
      if (lot.broke) return fail('Rot has been through that pile, so it\'s no good for seed.')
      const n = Math.floor(cmd.fields)
      if (!(n >= 1)) return fail('Hold back seed for at least one field.')
      const need = n * P.SEED_CWT_PER_FIELD
      const have = lot.grades.b + lot.grades.no1
      if (have < need) return fail(`There aren't enough sound potatoes. This lot has enough for ${Math.floor(have / P.SEED_CWT_PER_FIELD)} ${Math.floor(have / P.SEED_CWT_PER_FIELD) === 1 ? 'field' : 'fields'} at most.`)
      const fromB = Math.min(lot.grades.b, need)
      lot.grades.b -= fromB
      lot.grades.no1 -= need - fromB
      lot.seedHeld += n
      if (lotCwt(lot) < 0.5) lot.open = false
      return ok()
    }
    case 'month': {
      if (c.phase !== 'cellar') return fail('The cellar isn\'t open right now.')
      const out: GameEvent[] = []
      if (openLots(c).length === 0 || c.month >= P.MONTH_CURVE.length - 1) {
        for (const lot of openLots(c)) sellLot(world, c, lot, 1)
        // The rest of the winter passes.
        for (let m = c.month; m < P.WINTER_MONTHS; m++) winterMonth(c, out)
        closeYear(world, c, out)
        return ok(out)
      }
      winterMonth(c, out)
      storeMonth(c, out)
      c.month++
      if (c.month === P.CONTRACT_WINTER_MONTH) settleContracts(c, 'winter', out)
      return ok(out)
    }
    case 'next': {
      if (c.phase !== 'ledger') return fail('The year isn\'t closed yet.')
      return nextYear(world, c)
    }
  }
  return fail('No such command.')
}

// Why this answer cannot be given now, or '' when it can.
export function answerBlock(c: Campaign, inc: Incident, choice: string): string {
  switch (choice) {
    case 'hire': return hireRoom(c)
    case 'rush': return c.season && inc.back! <= c.season.day + 1 ? 'The part arrives tomorrow anyway.' : ''
    case 'match': {
      const u = c.crew.find(x => x.id === inc.unit)
      return u ? '' : 'They\'ve already left.'
    }
    case 'take': {
      const lot = c.lots.find(l => l.id === inc.lot)
      if (!lot || !lot.open) return 'That lot is gone.'
      return ''
    }
  }
  return ''
}

// Carries out an answer. The passive choices are the defaults, shared with the season's day.
function answer(world: World, c: Campaign, s: Season, inc: Incident, choice: string, out: GameEvent[]): void {
  const done = () => { c.incidents = c.incidents.filter(i => i !== inc) }
  switch (choice) {
    case 'hire': {
      done()
      out.push(takeOn(c, fromApplicant(c, inc.applicant!)))
      return
    }
    case 'match': {
      done()
      const u = c.crew.find(x => x.id === inc.unit)!
      const was = u.wage
      u.wage = inc.wage!
      out.push(note(c, 'incidentDone', 'info', `${u.name} is staying, and their wage goes from $${withCommas(was)} to $${withCommas(u.wage)} a month.`))
      return
    }
    case 'rush': {
      done()
      cost(c, P.RUSH_PART)
      const k = c.broken.indexOf(inc.back!)
      if (k >= 0) c.broken[k] = s.day + 1
      out.push(note(c, 'incidentDone', 'info', `You paid $${withCommas(P.RUSH_PART)} for a rush part, so the tractor will be back tomorrow.`))
      return
    }
    case 'take': {
      done()
      const lot = c.lots.find(l => l.id === inc.lot)!
      ageLot(c, lot, s.day)
      const money = sellLot(world, c, lot, 1)
      const bonus = money * P.BUYER_PREMIUM
      c.cash += bonus
      c.yearRevenue += bonus
      lot.revenue += bonus
      out.push(note(c, 'incidentDone', 'good', `Sold the ${variety(lot.variety).name} from ${FIELD_NAMES[lot.field]} to the buyer for $${withCommas(money + bonus)}, 10% over the market price.`, lot.field))
      return
    }
  }
  resolveIncident(c, s, inc, choice, out)
}

// Why the stumps cannot be pulled on this tract now, or '' when they can.
export function stumpBlock(c: Campaign, field: number): string {
  const why = worksPhase(c)
  if (why) return why
  if (!fieldIndex(field)) return 'No such field.'
  const fp = c.fields[field]
  const name = FIELD_NAMES[field]
  if (fp.tenure === 'none') return `${name} isn't yours.`
  if (standing(fp.cover)) return `${name} is still ${COVER_WORD[fp.cover]}. Fell it first.`
  if (fp.cover !== 'stumps') return `There are no stumps on ${name}.`
  if (fp.works) return 'The contractor is already there.'
  if (c.cash - P.STUMP_FEE < 0) return `You can't afford the contractor yet. It costs $${withCommas(P.STUMP_FEE)}.`
  return ''
}

// Why tile cannot go in under this field now, or '' when it can.
export function tileBlock(c: Campaign, field: number): string {
  const why = worksPhase(c)
  if (why) return why
  if (!fieldIndex(field)) return 'No such field.'
  const fp = c.fields[field]
  const name = FIELD_NAMES[field]
  if (fp.tenure !== 'owned') return 'Tile drains can only go under your own land.'
  if (fp.cover !== 'open') return `${name} is still ${COVER_WORD[fp.cover]}. Clear it first.`
  if (fp.elev !== 0) return 'Only bottom land needs tile, because the slopes drain on their own.'
  if (fp.tiled) return `${name} is already tiled.`
  if (fp.works) return 'The contractor is already there.'
  const st = c.season?.fields[field].status
  if (c.phase === 'season' && (st === 'planted' || st === 'growing' || st === 'dead' || st === 'digging')) return 'Tile can only be laid when no crop is in the ground.'
  if (c.cash - P.TILE_FEE < 0) return `You can't afford the contractor yet. It costs $${withCommas(P.TILE_FEE)}.`
  return ''
}

// Contractors are taken on in spring or in the season, and work season days.
function worksPhase(c: Campaign): string {
  if (c.phase === 'plan') return ''
  if (c.phase === 'season' && c.season && !c.season.frozen) return ''
  return 'Contractors only work during the season, so order it in spring.'
}

export function canEndSeason(c: Campaign): boolean {
  return c.phase === 'season' && seasonDone(c)
}
