// The campaign: planning, the season, the cellar and the year-end ledger, all driven through apply().
import { foremanOrders } from './advice.ts'
import { contractOffers } from './buyers.ts'
import { hireBlock, hireRoom, newFarmer, newUnit } from './crew.ts'
import { BLOCK_NAME, BLOCKS, DUFOUR_YARD, HOME_FIELDS, HOME_YARD, PARCELS, YARDS, type BlockId } from './farm.ts'
import { lotCwt } from './harvest.ts'
import { sellLot } from './market.ts'
import * as P from './params.ts'
import { applicantsFor, fromApplicant, gainXp, jobSkill, payOf, SKILL_LABEL, speed } from './people.ts'
import { hash32 } from './rng.ts'
import {
  addJob, buildable, buildJob, closeIncidents, FIELD_NAMES, holdsDufour, leftInField, letGo, releaseJob, removePerson, resolveIncident, seasonDone, sheltering,
  startSeason, stepDay, unitBlock,
} from './season.ts'
import { CHOICE_LABEL } from './incidents.ts'
import { article, buildBlock, buildCost, buildingAt, buildWork, hasBuilt, startBuilding, YARD_NAME } from './buildings.ts'
import { brushedNow, COVER_WORD, fell, isField, standing } from './land.ts'
import type { Campaign, Cmd, Contract, Due, FieldPlan, GameEvent, Incident, Lot, Result, Season, Unit, UpgradeId, WinterWork, World, YearSummary } from './types.ts'
import { variety } from './varieties.ts'
import { dayIndex, withCommas } from './calendar.ts'
import { finishLot } from './harvest.ts'
import { hasYear } from './weather.ts'

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
    incidents: [], nextIncident: 1, broken: [],
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
    if (have < need[id]) return `Not enough saved ${variety(id as FieldPlan['variety']).name} seed: ${have} field${have === 1 ? '' : 's'} worth in the cellar.`
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
function settleContracts(c: Campaign, due: Due | 'all', out: GameEvent[]): void {
  for (const k of c.contracts) {
    if (k.settled || (due !== 'all' && k.due !== due)) continue
    k.settled = true
    const short = k.cwt - k.delivered
    const name = variety(k.variety).name
    if (short > 1e-6) {
      const pen = short * k.price * P.CONTRACT_PENALTY
      k.penalty = pen
      cost(c, pen)
      c.yearPenalties += pen
      out.push(note(c, 'contractShort', 'bad', `${withCommas(short)} cwt of ${name} short on ${k.buyer.toLowerCase()}'s contract. The penalty is $${withCommas(pen)}.`))
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
      out.push(note(c, 'overflow', 'warn', `No room in the cellar: ${withCommas(have * frac)} cwt of ${variety(lot.variety).name} sold off the field for $${withCommas(money)}.`, lot.field))
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
    out.push(note(c, 'stored', 'info', `${withCommas(kept)} cwt is in the cellar. Keeping it since the dig has cost $${withCommas(rent)}.`))
  }
  const rest = c.yearRest
  if (rest > 0) out.push(note(c, 'rest', 'info', `The oats and clover brought in $${withCommas(rest)}.`))
  c.phase = 'cellar'
  c.month = 0
  return out
}

// Charges storage and shrinks the pile for the time a lot has sat since it was last accounted for.
function ageLot(c: Campaign, lot: Lot, toDay: number): number {
  const months = (toDay - lot.aged) / 30
  if (months <= 0) return 0
  const rent = Math.round(lotCwt(lot) * P.STORE_COST * months)
  const keep = 1 - (c.upgrades.vent ? P.SHRINK_VENT : P.SHRINK) * months
  lot.grades.no1 *= keep; lot.grades.chef *= keep; lot.grades.b *= keep; lot.grades.no2 *= keep; lot.skinned *= keep
  lot.aged = toDay
  c.cash -= rent
  c.yearCosts += rent
  c.yearStorage += rent
  return rent
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
        const seed = lot.seedHeld > 0 ? ' The seed held back from it is lost with it.' : ''
        lot.seedHeld = 0
        out.push(note(c, 'breakdown', 'bad', `Rot has run through the ${v.name} from ${FIELD_NAMES[lot.field]}. More than half the pile is gone.${seed}`, lot.field))
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
  if (u.trait === 'homebody') return `${u.name} is a homebody and will not work winters.`
  switch (work) {
    case 'woods': {
      if (!Number.isInteger(field) || field < 0 || field >= P.FIELD_COUNT) {
        return timberTracts(c).length ? 'Say which tract to fell.' : 'There is no standing timber on the farm to fell.'
      }
      if (c.fields[field].tenure === 'none') return `${FIELD_NAMES[field]} is not the farm's.`
      if (!standing(c.fields[field].cover)) return `There is nothing left to fell on ${FIELD_NAMES[field]}.`
      return ''
    }
    case 'pack':
      if (!hasBuilt(c, 'packing')) return 'Packing needs a packing shed.'
      return unpacked(c) >= 1 ? '' : 'Nothing in store is left to pack.'
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
      out.push(note(c, 'winterIdle', 'info', `${u.name} is laid off for the rest of the winter: ${why}`))
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
    for (const level of gainXp(u, skill, time)) out.push(note(c, 'skillUp', 'good', `${u.name} is better at ${SKILL_LABEL[skill]}: level ${level}.`))
  }
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
      if (buildWork(c, b, use)) out.push(note(c, 'built', 'good', `The ${P.BUILDINGS[b.kind].name.toLowerCase()} in ${YARD_NAME[b.yard]} is built over the winter. ${P.BUILDINGS[b.kind].does}`))
    }
  }
  if (u.winter === 'woods') {
    const i = u.winterField
    if (fell(c, i, days, u)) {
      out.push(note(c, 'felled', 'good', `${FIELD_NAMES[i]} is felled over the winter. The stumps are left; a contractor can pull them.${sheltering(c, i)}`, i))
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
  let potatoFields = 0, market = 0, culled = 0, peak = 0
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.status === 'off') continue
    if (c.plans[i].crop === 'potato' && f.plantDay >= 0) potatoFields++
    if (f.sevPeak > peak) peak = f.sevPeak
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
    out.push(note(c, 'mortgage', 'info', `The bank takes $${withCommas(pay)} on the land mortgage: $${withCommas(due.principal)} off the loan and $${withCommas(due.interest)} interest. $${withCommas(mortgageOwed(c))} is still owed.`))
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
    potatoFields, blightPeak: peak, lots,
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
    out.push(note(c, 'lost', 'bad', 'The bank has called the note. The farm is sold at auction.'))
  } else if (c.outcome === '' && c.yearIdx + 1 >= c.goalYears) {
    c.outcome = 'kept'
    out.push(note(c, 'kept', 'good', `Five seasons, and the farm is still yours.`))
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
  switch (cmd.t) {
    case 'plan': {
      if (c.phase !== 'plan') return fail('Plans are made in spring.')
      if (!fieldIndex(cmd.field)) return fail('No such field.')
      if (!held(c, cmd.field)) return fail(`${FIELD_NAMES[cmd.field]} is not the farm's. Rent or buy it first.`)
      if (!isField(c, cmd.field)) return fail(`${FIELD_NAMES[cmd.field]} is ${COVER_WORD[c.fields[cmd.field].cover]}. Clear it first.`)
      const v = variety(cmd.plan.variety)
      if (cmd.plan.crop === 'potato' && v.released > c.year) return fail(`${v.name} was not released until ${v.released}.`)
      const before = c.plans[cmd.field]
      c.plans[cmd.field] = { crop: cmd.plan.crop, variety: cmd.plan.variety, seed: cmd.plan.seed }
      const short = savedSeedShort(c)
      if (short) { c.plans[cmd.field] = before; return fail(short) }
      return ok()
    }
    case 'buy': {
      if (c.phase !== 'plan') return fail('Equipment is bought in spring.')
      const u = P.UPGRADES[cmd.upgrade]
      if (!u) return fail('No such equipment.')
      if (c.upgrades[cmd.upgrade]) return fail('Already owned.')
      if ((cmd.upgrade === 'tractor2' || cmd.upgrade === 'tractor3') && !hasBuilt(c, 'shed')) return fail('Another tractor needs the machine shed to stand in.')
      if (cmd.upgrade === 'tractor3' && !c.upgrades.tractor2) return fail('Buy the second tractor first.')
      if (cmd.upgrade === 'house2' && buildingAt(c, 'house', HOME_YARD)) return fail('There is a second potato house at home already, standing or going up.')
      if (c.cash - u.cost < 0) return fail('Not enough cash. The bank will not lend for equipment.')
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
      if (!inc || c.phase !== 'season' || !s) return fail('No such question is waiting.')
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
      const bought = cost.buyLogs > 0 || cost.buyStone > 0 ? `, buying ${[cost.buyLogs > 0 ? `${Math.ceil(cost.buyLogs)} loads of logs` : '', cost.buyStone > 0 ? `${Math.ceil(cost.buyStone)} of stone` : ''].filter(Boolean).join(' and ')}` : ''
      const when = c.phase === 'season' ? 'It is on the list for whoever builds.' : c.phase === 'cellar' ? 'Someone kept on to build can put it up this winter.' : 'It goes on the list when the season begins.'
      return ok([note(c, 'building', 'info', `${article(spec.name, true)} ${spec.name.toLowerCase()} is started in ${YARD_NAME[cmd.yard]}: $${withCommas(cost.total)}${bought}, and ${spec.days} crew-days of building. ${when}`)])
    }
    case 'rent': {
      if (c.phase !== 'plan') return fail('Land is rented in spring.')
      if (!fieldIndex(cmd.field)) return fail('No such field.')
      const fp = c.fields[cmd.field]
      const name = FIELD_NAMES[cmd.field]
      if (fp.tenure === 'owned') return fail(`The farm owns ${name}.`)
      if (fp.tenure === 'rented') return fail(`${name} is already rented for this year.`)
      if (PARCELS[cmd.field].holding !== 'field') return fail(`${name} is not let; it can only be bought.`)
      fp.tenure = 'rented'
      c.plans[cmd.field] = defaultPlan(c, cmd.field)
      return ok([note(c, 'rented', 'info', `${name} is rented for the year: $${withCommas(PARCELS[cmd.field].rent)}, paid when the season begins.`, cmd.field)])
    }
    case 'release': {
      if (c.phase !== 'plan') return fail('Rented land is given up in spring.')
      if (!fieldIndex(cmd.field)) return fail('No such field.')
      const fp = c.fields[cmd.field]
      const name = FIELD_NAMES[cmd.field]
      if (fp.tenure === 'owned') return fail(`The farm owns ${name}. Land is not sold back.`)
      if (fp.tenure === 'none') return fail(`${name} is not the farm's.`)
      fp.tenure = 'none'
      c.plans[cmd.field] = { ...REST_PLAN }
      return ok([note(c, 'released', 'info', `${name} goes back to its owner.`, cmd.field)])
    }
    case 'buyLand': {
      if (c.phase !== 'plan') return fail('Land is bought in spring.')
      if (!fieldIndex(cmd.field)) return fail('No such field.')
      const fp = c.fields[cmd.field]
      const name = FIELD_NAMES[cmd.field]
      if (fp.tenure === 'owned') return fail(`The farm already owns ${name}.`)
      if (PARCELS[cmd.field].holding === 'dufour' && !holdsDufour(c)) return fail(`${name} goes with the Dufour place: rent or buy a Dufour field first.`)
      const price = PARCELS[cmd.field].price
      const down = Math.round(price * P.MORTGAGE_DOWN)
      if (c.cash - down < 0) return fail(`Not enough cash for the quarter down: $${withCommas(down)}.`)
      const was = fp.tenure
      cost(c, down)
      c.yearLand += down
      c.mortgages.push({ field: cmd.field, loan: price - down, owed: price - down })
      fp.tenure = 'owned'
      if (was === 'none') c.plans[cmd.field] = defaultPlan(c, cmd.field)
      return ok([note(c, 'landBought', 'good', `${name} is the farm's: bought for $${withCommas(price)}, $${withCommas(down)} down and $${withCommas(price - down)} on the land mortgage.`, cmd.field)])
    }
    case 'stump': {
      const why = stumpBlock(c, cmd.field)
      if (why) return fail(why)
      cost(c, P.STUMP_FEE)
      c.yearWorks += P.STUMP_FEE
      c.fields[cmd.field].works = { kind: 'stump', left: P.STUMP_DAYS }
      return ok([note(c, 'stumping', 'info', `A contractor will pull the stumps on ${FIELD_NAMES[cmd.field]}: $${withCommas(P.STUMP_FEE)}, about ${P.STUMP_DAYS} season days.`, cmd.field)])
    }
    case 'tile': {
      const why = tileBlock(c, cmd.field)
      if (why) return fail(why)
      cost(c, P.TILE_FEE)
      c.yearWorks += P.TILE_FEE
      c.fields[cmd.field].works = { kind: 'tile', left: P.TILE_DAYS }
      return ok([note(c, 'tiling', 'info', `A contractor will lay tile drains under ${FIELD_NAMES[cmd.field]}: $${withCommas(P.TILE_FEE)}, about ${P.TILE_DAYS} season days.`, cmd.field)])
    }
    case 'sellLogs': {
      if (c.phase !== 'plan' && c.phase !== 'season' && c.phase !== 'cellar') return fail('Logs are sold in spring, in the season or in winter.')
      if (!Number.isFinite(cmd.loads) || cmd.loads <= 0) return fail('Say how many loads to sell.')
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
      if (c.phase !== 'plan') return fail('Extra is paid on the mortgage in spring.')
      const owed = mortgageOwed(c)
      if (owed <= 0) return fail('Nothing is owed on the land.')
      if (!Number.isFinite(cmd.amount) || cmd.amount <= 0) return fail('Say how much to pay.')
      if (cmd.amount > owed + 1e-6) return fail(`Only $${withCommas(owed)} is owed.`)
      if (c.cash - cmd.amount < 0) return fail('Not enough cash.')
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
      return ok([note(c, 'mortgagePaid', 'good', `$${withCommas(paid)} paid off the land mortgage. $${withCommas(mortgageOwed(c))} is still owed.`)])
    }
    case 'accept': {
      if (c.phase !== 'plan') return fail('Contracts are signed in spring.')
      const k = c.offers.findIndex(o => o.id === cmd.offer)
      if (k < 0) return fail('No such offer.')
      const [o] = c.offers.splice(k, 1)
      const signed: Contract = { ...o, delivered: 0, paid: 0, penalty: 0, settled: false }
      c.contracts.push(signed)
      return ok([note(c, 'accepted', 'info', `Contract signed with ${o.buyer.toLowerCase()}: ${withCommas(o.cwt)} cwt of ${variety(o.variety).name} at $${o.price.toFixed(2)}.`)])
    }
    case 'begin': {
      if (c.phase !== 'plan') return fail('The season has already begun.')
      const short = savedSeedShort(c)
      if (short) return fail(short)
      const pc = planCosts(c)
      if (c.cash - pc.total < P.OPERATING_LIMIT) return fail('The bank will not lend that much for the spring. Rest a field, or plant saved seed: it is free, but it carries virus.')
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
      if (c.phase !== 'plan' && c.phase !== 'season') return fail('Hands are let go in spring or during the season.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such hand.')
      if (u.kind === 'farmer') return fail('The farmer stays.')
      removePerson(c, u)
      return ok([note(c, 'dismissed', 'info', `${u.name} is let go.`)])
    }
    case 'raise': {
      if (c.phase === 'over') return fail('The farm is gone.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such person.')
      if (u.kind === 'farmer') return fail('The farmer is not paid a wage; the household draw comes at the year end.')
      if (!Number.isFinite(cmd.wage)) return fail('Say what the wage should be.')
      const wage = Math.round(cmd.wage)
      if (wage < P.WAGE_MIN || wage > P.WAGE_MAX) return fail(`A wage is between $${withCommas(P.WAGE_MIN)} and $${withCommas(P.WAGE_MAX)} a month.`)
      if (wage === u.wage) return fail(`${u.name} is already paid $${withCommas(wage)} a month.`)
      const was = u.wage
      u.wage = wage
      return ok([note(c, 'raise', 'info', `${u.name}'s wage goes from $${withCommas(was)} to $${withCommas(wage)} a month (asked $${withCommas(u.ask)}).`)])
    }
    case 'priority': {
      if (c.phase === 'over') return fail('The farm is gone.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such person.')
      if (!P.SKILLS.includes(cmd.work)) return fail('No such kind of work.')
      if (!Number.isInteger(cmd.level) || cmd.level < 0 || cmd.level > P.PRIORITY_MAX) return fail(`A priority is 0 (never) or 1 (first) to ${P.PRIORITY_MAX}.`)
      if (u.prio[cmd.work] === cmd.level) return fail(`${u.name} already has ${SKILL_LABEL[cmd.work]} at priority ${cmd.level}.`)
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
      if (u.kind === 'farmer') return fail('The farmer runs the whole farm; a foreman is someone hired.')
      if (cmd.block === null) {
        if (!u.foreman) return fail(`${u.name} is not a foreman.`)
        u.foreman = ''
        return ok([note(c, 'foreman', 'info', `${u.name} goes back to field work.`)])
      }
      const block = cmd.block as BlockId
      if (!BLOCKS.includes(block)) return fail('No such block.')
      if (u.foreman === block) return fail(`${u.name} is already foreman there.`)
      if (!PARCELS.some((p, i) => p.block === block && held(c, i))) return fail('The farm holds no land there.')
      const other = c.crew.find(x => x.foreman === block)
      if (other) return fail(`${other.name} is foreman there already.`)
      u.foreman = block
      for (const j of c.season?.jobs ?? []) if (j.unit === u.id) j.unit = -1
      letGo(u)
      return ok([note(c, 'foreman', 'info', `${u.name} is foreman of ${BLOCK_NAME[block]}: they will put on the list what the fields there need, and do no field work.`)])
    }
    case 'sundays': {
      if (c.phase === 'over') return fail('The farm is gone.')
      if (typeof cmd.off !== 'boolean') return fail('Say whether Sundays are off.')
      if (c.sundaysOff === cmd.off) return fail(cmd.off ? 'Sundays are already off.' : 'The farm already works Sundays.')
      c.sundaysOff = cmd.off
      return ok([note(c, 'sundays', 'info', cmd.off ? 'Sundays off: nobody works on a Sunday.' : 'The farm works Sundays now: a day more each week, and everyone tires.')])
    }
    case 'pickers': {
      const s = c.season
      if (c.phase !== 'season' || !s || s.frozen) return fail('Pickers are hired during the harvest.')
      if (typeof cmd.on !== 'boolean') return fail('Say whether to hire the pickers.')
      if (s.pickers === cmd.on) return fail(cmd.on ? 'The pickers are already here.' : 'There are no pickers to send home.')
      if (cmd.on && !pickersWindow(c)) return fail('The schools close for the harvest only from September 20 to October 10.')
      s.pickers = cmd.on
      return ok([note(c, 'pickers', 'info', cmd.on ? `A picking crew is hired by the day, $${withCommas(P.PICKER_DAY)} a day worked: every dig goes faster.` : 'The pickers are sent home.')])
    }
    case 'winter': {
      if (c.phase === 'over') return fail('The farm is gone.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('No such person.')
      if (!WINTER_WORKS.includes(cmd.work)) return fail('No such winter work.')
      const field = cmd.work === 'woods' ? cmd.field ?? -1 : -1
      if (u.winter === cmd.work && u.winterField === field) return fail(`${u.name} is already set to that for the winter.`)
      const why = winterBlock(c, u, cmd.work, field)
      if (why) return fail(why)
      u.winter = cmd.work
      u.winterField = field
      return ok([note(c, 'winterSet', 'info', cmd.work === 'off' ? `${u.name} will be laid off for the winter, unpaid, and back in spring.` : `${u.name} will be kept on this winter: ${WINTER_LABEL[cmd.work]}.`)])
    }
    case 'job': {
      const why = addJob(c, cmd.kind, cmd.field, cmd.unit ?? -1)
      return why ? fail(why) : ok()
    }
    case 'assign': {
      if (c.phase !== 'season' || !c.season) return fail('No work list.')
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
      if (c.phase !== 'season' || !c.season) return fail('No work list.')
      const k = c.season.jobs.findIndex(j => j.id === cmd.id)
      if (k < 0) return fail('No such job.')
      if (c.season.jobs[k].kind === 'haul') return fail('The crop in the field has to come in.')
      if (c.season.jobs[k].kind === 'build') return fail('The building is paid for: it stays on the list until it stands.')
      if (c.season.jobs[k].kind === 'dig' && c.season.jobs[k].done > 0) return fail('The digger is already in the field.')
      c.season.jobs.splice(k, 1)
      releaseJob(c, cmd.id)
      return ok()
    }
    case 'bump': {
      if (c.phase !== 'season' || !c.season) return fail('No work list.')
      const k = c.season.jobs.findIndex(j => j.id === cmd.id)
      if (k < 0) return fail('No such job.')
      const [job] = c.season.jobs.splice(k, 1)
      c.season.jobs.unshift(job)
      return ok()
    }
    case 'day': {
      if (c.phase !== 'season' || !c.season) return fail('The season is not under way.')
      if (c.season.frozen) return fail('The ground has frozen. Close out the season.')
      foremanOrders(world, c)
      return ok(stepDay(world, c))
    }
    case 'endSeason': {
      if (c.phase !== 'season' || !c.season) return fail('The season is not under way.')
      return ok(endSeason(world, c))
    }
    case 'sell': {
      if (c.phase !== 'season' && c.phase !== 'cellar') return fail('Nothing to sell now.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('That lot is gone.')
      if (Number.isNaN(cmd.frac)) return fail('Say how much to sell.')
      if (c.phase === 'season' && c.season) {
        const f = c.season.fields[lot.field]
        if (f.status === 'digging') return fail('Still being dug.')
        if (f.status === 'dug' && !f.weighed) return fail('Still in barrels in the field: it can be sold once it is hauled in and weighed.')
        ageLot(c, lot, c.season.day)
      }
      const money = sellLot(world, c, lot, cmd.frac)
      return ok([note(c, 'sold', 'good', `Sold ${variety(lot.variety).name} from ${FIELD_NAMES[lot.field]} for $${withCommas(money)}.`, lot.field)])
    }
    case 'deliver': {
      if (c.phase !== 'season' && c.phase !== 'cellar') return fail('Nothing to deliver now.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('That lot is gone.')
      const k = c.contracts.find(x => x.id === cmd.contract)
      if (!k) return fail('No such contract.')
      if (k.settled) return fail('That contract has closed.')
      const name = variety(lot.variety).name
      if (k.variety !== lot.variety) return fail(`${k.buyer} wants ${variety(k.variety).name}, not ${name}.`)
      const need = k.cwt - k.delivered
      if (need <= 1e-6) return fail('That contract is filled.')
      if (c.phase === 'season' && c.season && c.season.fields[lot.field].status === 'digging') return fail('Still being dug.')
      if (c.phase === 'season' && c.season && !c.season.fields[lot.field].weighed) return fail('Still in barrels in the field: it can be delivered once it is hauled in and weighed.')
      if (lot.grades.no1 + lot.grades.chef <= 1e-6) return fail('There is no US No. 1 or large stock left in that lot.')
      if (c.phase === 'season' && c.season) ageLot(c, lot, c.season.day)
      const have = lot.grades.no1 + lot.grades.chef
      const take = Math.min(have, need)
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
      return ok([note(c, 'delivered', 'good', `Delivered ${withCommas(take)} cwt of ${name} from ${FIELD_NAMES[lot.field]} to ${k.buyer.toLowerCase()} for $${withCommas(money)}.`, lot.field)])
    }
    case 'seed': {
      if (c.phase !== 'cellar') return fail('Seed is held back from the cellar.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('That lot is gone.')
      if (lot.broke) return fail('Rot has been through that pile. It is not fit for seed.')
      const n = Math.floor(cmd.fields)
      if (!(n >= 1)) return fail('Hold back seed for at least one field.')
      const need = n * P.SEED_CWT_PER_FIELD
      const have = lot.grades.b + lot.grades.no1
      if (have < need) return fail(`Not enough sound tubers: enough for ${Math.floor(have / P.SEED_CWT_PER_FIELD)} ${Math.floor(have / P.SEED_CWT_PER_FIELD) === 1 ? 'field' : 'fields'} at most.`)
      const fromB = Math.min(lot.grades.b, need)
      lot.grades.b -= fromB
      lot.grades.no1 -= need - fromB
      lot.seedHeld += n
      if (lotCwt(lot) < 0.5) lot.open = false
      return ok()
    }
    case 'month': {
      if (c.phase !== 'cellar') return fail('The cellar is closed.')
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
      if (c.phase !== 'ledger') return fail('The year is not closed.')
      return nextYear(world, c)
    }
  }
  return fail('No such command.')
}

// Why this answer cannot be given now, or '' when it can.
export function answerBlock(c: Campaign, inc: Incident, choice: string): string {
  switch (choice) {
    case 'hire': return hireRoom(c)
    case 'rush': return c.season && inc.back! <= c.season.day + 1 ? 'The part comes tomorrow anyway.' : ''
    case 'match': {
      const u = c.crew.find(x => x.id === inc.unit)
      return u ? '' : 'They have gone already.'
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
      out.push(note(c, 'incidentDone', 'info', `${u.name} stays: the wage goes from $${withCommas(was)} to $${withCommas(u.wage)} a month.`))
      return
    }
    case 'rush': {
      done()
      cost(c, P.RUSH_PART)
      const k = c.broken.indexOf(inc.back!)
      if (k >= 0) c.broken[k] = s.day + 1
      out.push(note(c, 'incidentDone', 'info', `A rush part for $${withCommas(P.RUSH_PART)}: the tractor is back tomorrow.`))
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
      out.push(note(c, 'incidentDone', 'good', `Sold the ${variety(lot.variety).name} from ${FIELD_NAMES[lot.field]} to the buyer for $${withCommas(money + bonus)}, 10% over the market.`, lot.field))
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
  if (fp.tenure === 'none') return `${name} is not the farm's.`
  if (standing(fp.cover)) return `${name} is ${COVER_WORD[fp.cover]}. Fell it first.`
  if (fp.cover !== 'stumps') return `There are no stumps on ${name}.`
  if (fp.works) return 'The contractor is already there.'
  if (c.cash - P.STUMP_FEE < 0) return `Not enough cash for the contractor: $${withCommas(P.STUMP_FEE)}.`
  return ''
}

// Why tile cannot go in under this field now, or '' when it can.
export function tileBlock(c: Campaign, field: number): string {
  const why = worksPhase(c)
  if (why) return why
  if (!fieldIndex(field)) return 'No such field.'
  const fp = c.fields[field]
  const name = FIELD_NAMES[field]
  if (fp.tenure !== 'owned') return 'Tile drains go only under the farm\'s own land.'
  if (fp.cover !== 'open') return `${name} is ${COVER_WORD[fp.cover]}. Clear it first.`
  if (fp.elev !== 0) return 'Only bottom land needs tile: the slope drains itself.'
  if (fp.tiled) return `${name} is tiled already.`
  if (fp.works) return 'The contractor is already there.'
  const st = c.season?.fields[field].status
  if (c.phase === 'season' && (st === 'planted' || st === 'growing' || st === 'dead' || st === 'digging')) return 'Tile is laid when no crop is in the ground.'
  if (c.cash - P.TILE_FEE < 0) return `Not enough cash for the contractor: $${withCommas(P.TILE_FEE)}.`
  return ''
}

// Contractors are taken on in spring or in the season, and work season days.
function worksPhase(c: Campaign): string {
  if (c.phase === 'plan') return ''
  if (c.phase === 'season' && c.season && !c.season.frozen) return ''
  return 'Contractors work in the season: order it in spring.'
}

export function canEndSeason(c: Campaign): boolean {
  return c.phase === 'season' && seasonDone(c)
}
