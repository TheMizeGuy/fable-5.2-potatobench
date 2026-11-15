// Farm buildings: what each costs in cash, logs and stone, building them, and what a standing one does.
import { withCommas } from './calendar.ts'
import { travelDays } from './crew.ts'
import { DUFOUR_YARD, HOME_YARD, PARCELS } from './farm.ts'
import * as P from './params.ts'
import type { Building, BuildingKind, Campaign, World } from './types.ts'
import { getDay } from './weather.ts'

export const YARD_NAME: Record<number, string> = { [HOME_YARD]: 'the home yard', [DUFOUR_YARD]: 'the Dufour yard' }

// 'a' or 'an' for a name.
export function article(name: string, capital = false): string {
  const an = /^[aeiou]/i.test(name)
  return capital ? (an ? 'An' : 'A') : (an ? 'an' : 'a')
}

// The building of this kind at this yard, standing or under way.
export function buildingAt(c: Campaign, kind: BuildingKind, yard: number): Building | undefined {
  return c.buildings.find(b => b.kind === kind && b.yard === yard)
}

export function hasBuilt(c: Campaign, kind: BuildingKind, yard = HOME_YARD): boolean {
  const b = buildingAt(c, kind, yard)
  return !!b && b.built
}

// Bunkhouses standing, at either yard.
export function bunkhouses(c: Campaign): number {
  let n = 0
  for (const b of c.buildings) if (b.kind === 'bunk' && b.built) n++
  return n
}

export interface BuildCost {
  cash: number              // the cash part
  logs: number              // loads of logs it takes
  stone: number             // loads of stone it takes
  buyLogs: number           // loads of logs the yard lacks, bought at the mill
  buyStone: number          // loads of stone the yard lacks, bought from the quarry
  total: number             // dollars in all: the cash part and what is bought
}

// Whole loads in the yard: a load still being cut or picked counts once it is whole.
export function wholeLoads(x: number): number {
  return Math.floor(x + 1e-9)
}

export function buildCost(c: Campaign, kind: BuildingKind): BuildCost {
  const spec = P.BUILDINGS[kind]
  const buyLogs = Math.max(0, spec.logs - wholeLoads(c.logs))
  const buyStone = Math.max(0, spec.stone - wholeLoads(c.stone))
  return {
    cash: spec.cash, logs: spec.logs, stone: spec.stone, buyLogs, buyStone,
    total: spec.cash + buyLogs * P.MILL_PRICE + buyStone * P.QUARRY_PRICE,
  }
}

// What the farm can put into things that last: in spring its cash (the plan's own costs are still to come out of the
// loan); from the season's start, its cash and the bank's money until it owes BUILD_CREDIT in all.
export function spendable(c: Campaign): number {
  return c.phase === 'plan' ? Math.max(0, c.cash) : Math.max(0, c.cash + P.BUILD_CREDIT)
}

// Why the farm cannot pay this much for such a thing now, or '' when it can. what: 'buildings', 'equipment'.
export function spendBlock(c: Campaign, cost: number, what: string): string {
  if (cost <= spendable(c) + 1e-6) return ''
  if (c.phase === 'plan') return `You can't afford it yet. It costs $${withCommas(cost)}, and in spring the bank won't lend for ${what}.`
  return `You can't afford it yet. It costs $${withCommas(cost)}, and the bank lends until you owe $${withCommas(P.BUILD_CREDIT)} (you ${c.cash < 0 ? `owe $${withCommas(Math.round(-c.cash))}` : `have $${withCommas(Math.floor(c.cash))}`}).`
}

// Why this building cannot be started at this yard now, or '' when it can.
export function buildBlock(c: Campaign, kind: BuildingKind, yard: number, dufourHeld: boolean): string {
  const spec = P.BUILDINGS[kind]
  if (!spec) return 'No such building.'
  if (c.phase === 'ledger' || c.phase === 'over') return 'You can order a building in spring, during the season, or in winter.'
  if (c.phase === 'season' && (!c.season || c.season.frozen)) return 'The ground has frozen, so order it in winter instead.'
  if (yard !== HOME_YARD && yard !== DUFOUR_YARD) return 'No such yard.'
  if (yard === DUFOUR_YARD) {
    if (!spec.dufour) return `${article(spec.name, true)} ${spec.name.toLowerCase()} can only go in the home yard.`
    if (!dufourHeld) return 'The Dufour yard is yours only while you hold Dufour land.'
  }
  const at = buildingAt(c, kind, yard)
  if (at) return at.built ? `There's already ${article(spec.name)} ${spec.name.toLowerCase()} in ${YARD_NAME[yard]}.` : `${article(spec.name, true)} ${spec.name.toLowerCase()} is already going up in ${YARD_NAME[yard]}.`
  const cost = buildCost(c, kind)
  return spendBlock(c, cost.total, 'buildings')
}

// Pays for a building, takes its materials from the yard, and starts it.
export function startBuilding(c: Campaign, kind: BuildingKind, yard: number): Building {
  const cost = buildCost(c, kind)
  c.cash -= cost.total
  c.yearCosts += cost.total
  c.yearBuilding += cost.total
  c.logs = Math.max(0, c.logs - (cost.logs - cost.buyLogs))
  c.stone = Math.max(0, c.stone - (cost.stone - cost.buyStone))
  const b: Building = { id: c.nextBuilding++, kind, yard, done: 0, need: P.BUILDINGS[kind].days, built: false }
  c.buildings.push(b)
  return b
}

// Puts days of building work (standard crew-days) into a building. True when it stands.
export function buildWork(c: Campaign, b: Building, days: number): boolean {
  if (b.built) return false
  b.done = Math.min(b.need, b.done + days)
  if (b.done < b.need - 1e-6) return false
  b.done = b.need
  b.built = true
  if (b.kind === 'house' && b.yard === HOME_YARD) c.upgrades.house2 = true
  return true
}

// Share of the usual time travel takes, with the gravelled road.
export function roadFactor(c: Campaign): number {
  return hasBuilt(c, 'road') ? P.ROAD_SPEED : 1
}

// Share of a day spent on the road between places, on this farm's roads.
export function travel(c: Campaign, from: number, to: number): number {
  return travelDays(from, to) * roadFactor(c)
}

// Rain at Caribou over the 30 days up to and including this one, mm.
export function rain30(world: World, year: number, day: number): number {
  let mm = 0
  for (let k = 0; k < 30; k++) mm += getDay(world, year, day - k).prcp
  return mm
}

// Whether this field can be watered from the pond now: a home or intervale field, and water in the pond.
export function pondServes(c: Campaign, field: number): boolean {
  if (field < 0 || !hasBuilt(c, 'pond') || c.pond < 1) return false
  const block = PARCELS[field]?.block
  return block === 'home' || block === 'brook'
}
