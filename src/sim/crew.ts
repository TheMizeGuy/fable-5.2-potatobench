// The farm's crews: who can do which job, hiring, and the time lost on the road between places.
import { distance, HOME_YARD } from './farm.ts'
import * as P from './params.ts'
import type { Campaign, JobKind, Unit, UnitKind } from './types.ts'

export const UNIT_LABEL: Record<UnitKind, string> = { farmer: 'the farmer', hand: 'a field hand', operator: 'the tractor operator' }

export function canDo(kind: UnitKind, job: JobKind): boolean {
  return P.UNIT_JOBS[kind].includes(job)
}

// Share of a day a crew spends on the road from one place to another.
export function travelDays(from: number, to: number): number {
  return from === to ? 0 : distance(from, to) * P.TRAVEL_DAYS_PER_UNIT
}

export function newFarmer(): Unit {
  return { id: 0, kind: 'farmer', name: P.FARMER_NAME, at: HOME_YARD, wage: 0, job: -1, to: HOME_YARD, road: 0, paidTo: 0 }
}

export function crewCount(c: Campaign, kind: UnitKind): number {
  let n = 0
  for (const u of c.crew) if (u.kind === kind) n++
  return n
}

// Why a unit of this kind cannot be hired now, or '' when it can.
export function hireBlock(c: Campaign, kind: UnitKind): string {
  if (c.phase !== 'plan' && c.phase !== 'season') return 'Hands are hired in spring or during the season.'
  if (c.phase === 'season' && (!c.season || c.season.frozen)) return 'The season is over.'
  if (kind === 'farmer') return 'There is one farmer, and that is you.'
  if (kind === 'hand') return crewCount(c, 'hand') >= P.MAX_HANDS ? `${P.MAX_HANDS} field hands are as many as the farm can keep busy.` : ''
  if (kind === 'operator') {
    if (!c.upgrades.tractor2) return 'An operator needs a second tractor to drive.'
    return crewCount(c, 'operator') >= P.MAX_OPERATORS ? 'The second tractor already has an operator.' : ''
  }
  return 'No such work on this farm.'
}

export function newUnit(c: Campaign, kind: 'hand' | 'operator'): Unit {
  const names = kind === 'hand' ? P.HAND_NAMES : P.OPERATOR_NAMES
  const taken = new Set(c.crew.map(u => u.name))
  const name = names.find(n => !taken.has(n)) ?? `${names[0]} ${c.nextUnit}`
  return {
    id: c.nextUnit++, kind, name, at: HOME_YARD, wage: kind === 'hand' ? P.HAND_WAGE : P.OPERATOR_WAGE,
    job: -1, to: HOME_YARD, road: 0, paidTo: 0,
  }
}

// The order crews take their turns when they have the same share of the day left: the hands, then the operator,
// then the farmer, who can do anything and so goes last; within a kind, in the order hired.
const TURN: Record<UnitKind, number> = { hand: 0, operator: 1, farmer: 2 }

export function turnBefore(a: Unit, b: Unit): boolean {
  return TURN[a.kind] !== TURN[b.kind] ? TURN[a.kind] < TURN[b.kind] : a.id < b.id
}
