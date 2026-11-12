// The farmstead, section 6: incidents. Each is drawn from the seed and the day; each choice is held from both sides.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { hashUnit } from '../src/sim/rng.ts'
import type { Campaign, Cmd, JobKind } from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

function ok(c: Campaign, cmd: Cmd): S.Result {
  const r = S.apply(world, c, cmd)
  expect(r.ok, `${JSON.stringify(cmd)}: ${r.err}`).toBe(true)
  return r
}

function refused(c: Campaign, cmd: Cmd, why?: RegExp): void {
  const before = S.hashCampaign(c)
  const r = S.apply(world, c, cmd)
  expect(r.ok, JSON.stringify(cmd)).toBe(false)
  expect(r.err.length).toBeGreaterThan(0)
  if (why) expect(r.err).toMatch(why)
  expect(S.hashCampaign(c), JSON.stringify(cmd)).toBe(before)
}

function tendDay(c: Campaign, skip: JobKind[] = []): S.GameEvent[] {
  for (const a of S.advise(world, c)) {
    if (a.act === 'wait' || a.act === 'close') continue
    if (a.act === 'sell') S.apply(world, c, { t: 'sell', lot: a.lot, frac: 1 })
    else if (!skip.includes(a.act)) S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
  }
  return ok(c, { t: 'day' }).events
}

// Reference practice until an incident of this kind opens; returns it.
function until(c: Campaign, kind: S.IncidentKind): S.Incident {
  for (let g = 0; g < 300 && !c.incidents.some(i => i.kind === kind); g++) tendDay(c)
  const inc = c.incidents.find(i => i.kind === kind)
  expect(inc, kind).toBeDefined()
  return inc!
}

// 1990, seed 7, with a hand and an operator: someone asks for work on June 7. 1995, seed 2: a neighbour on May 10.
function farm(year: number, seed: number): Campaign {
  const c = S.createCampaign(world, { seed, startYear: year })
  ok(c, { t: 'hire', kind: 'hand' })
  ok(c, { t: 'hire', kind: 'operator' })
  ok(c, { t: 'sundays', off: false })
  ok(c, { t: 'begin' })
  return c
}

describe('incidents', () => {
  it('are drawn from the seed and the day: the same campaign meets the same ones, another seed others', () => {
    const run = (seed: number) => {
      const c = farm(1990, seed)
      const out: string[] = []
      for (let g = 0; g < 160; g++) for (const e of tendDay(c)) if (e.type === 'incident') out.push(`${e.day}:${e.data!.kind}`)
      return out
    }
    const a = run(7)
    expect(a.length).toBeGreaterThan(0)
    expect(run(7)).toEqual(a)
    expect(run(8)).not.toEqual(a)
  })

  it('wait a few days for an answer, then take their default; the season\'s end closes them', () => {
    const c = farm(1990, 7)
    const inc = until(c, 'applicant')
    expect(inc.until).toBe(inc.day + S.INCIDENT_DAYS)
    const info = S.incidentInfo(c).find(x => x.id === inc.id)!
    expect(info.choices.map(x => x.id)).toEqual(['hire', 'pass'])
    expect(info.fallback).toBe('pass')
    for (const ch of info.choices) expect(ch.does.length).toBeGreaterThan(10)
    const crew = c.crew.length
    let events: S.GameEvent[] = []
    while (c.incidents.some(i => i.id === inc.id) && c.season!.day <= inc.until + 1) events = events.concat(tendDay(c))
    expect(c.incidents.find(i => i.id === inc.id)).toBeUndefined()
    expect(events.some(e => e.type === 'incidentDone' && e.data!.incident === inc.id)).toBe(true)
    expect(c.crew.length).toBe(crew)
  })
})

describe('someone asking for work', () => {
  it('taken on, starts at their asking wage with their own skills and trait; with no room, cannot be', () => {
    const c = farm(1990, 7)
    const inc = until(c, 'applicant')
    // Two hired already (topped up if a neighbour took one), no bunkhouse: no room.
    while (S.hiredCount(c) < S.HOUSED_OUT) ok(c, { t: 'hire', kind: 'hand' })
    refused(c, { t: 'answer', incident: inc.id, choice: 'hire' }, /bunkhouse/)
    expect(S.incidentInfo(c).find(x => x.id === inc.id)!.choices[0].ok).toBe(false)
    refused(c, { t: 'answer', incident: inc.id, choice: 'golf' }, /choices/)
    ok(c, { t: 'dismiss', unit: c.crew[1].id })
    const wages = c.yearWages
    ok(c, { t: 'answer', incident: inc.id, choice: 'hire' })
    const u = c.crew[c.crew.length - 1]
    expect([u.name, u.skills, u.trait, u.wage]).toEqual([inc.applicant!.name, inc.applicant!.skills, inc.applicant!.trait, inc.applicant!.ask])
    expect(c.yearWages - wages).toBe(inc.applicant!.ask)
    expect(c.incidents.find(i => i.id === inc.id)).toBeUndefined()
    refused(c, { t: 'answer', incident: inc.id, choice: 'hire' }, /No such question/)
  })
})

describe('a neighbour\'s offer', () => {
  const c = farm(1995, 2)
  const inc = until(c, 'poach')
  const u = c.crew.find(x => x.id === inc.unit)!

  it('is for the best hand on the farm, at 15% more', () => {
    expect(u.kind).not.toBe('farmer')
    for (const o of c.crew) if (o.kind !== 'farmer') expect(S.SKILLS.reduce((a, k) => a + u.skills[k], 0)).toBeGreaterThanOrEqual(S.SKILLS.reduce((a, k) => a + o.skills[k], 0))
    expect(inc.wage).toBe(Math.round(u.wage * (1 + S.POACH_RAISE)))
  })

  it('matched, keeps them at the higher wage', () => {
    const x = structuredClone(c)
    ok(x, { t: 'answer', incident: inc.id, choice: 'match' })
    expect(x.crew.find(o => o.id === inc.unit)!.wage).toBe(inc.wage)
  })

  it('not matched, loses them if they are unhappy, keeps them if they are content', () => {
    const sad = structuredClone(c), glad = structuredClone(c)
    sad.crew.find(o => o.id === inc.unit)!.mood = S.POACH_MOOD - 0.1
    glad.crew.find(o => o.id === inc.unit)!.mood = S.POACH_MOOD + 0.1
    const e1 = ok(sad, { t: 'answer', incident: inc.id, choice: 'let' }).events
    ok(glad, { t: 'answer', incident: inc.id, choice: 'let' })
    expect(sad.crew.some(o => o.id === inc.unit)).toBe(false)
    expect(e1.some(e => e.type === 'poached')).toBe(true)
    expect(glad.crew.find(o => o.id === inc.unit)!.wage).toBe(u.wage)
  })
})

// The first day from `from` on which the seed's draw for this salt falls under p.
function drawDay(c: Campaign, from: number, salt: number, p: number, lo = 0): number {
  for (let d = from; d < from + 200; d++) {
    const h = hashUnit(c.seed, c.year, d, salt)
    if (h < p && h >= lo) return d
  }
  throw new Error('no such day')
}

describe('a tractor breaking down', () => {
  it('is likelier with long hours and half as likely with a machine shed', () => {
    const u = structuredClone(S.createCampaign(world, { seed: 1, startYear: 1990 }).crew[0])
    u.tired = 0
    const fresh = S.breakdownChance(u, false)
    u.tired = 1
    expect(S.breakdownChance(u, false)).toBeCloseTo(fresh * (1 + S.BREAK_TIRED), 12)
    expect(S.breakdownChance(u, true)).toBeCloseTo(S.breakdownChance(u, false) * S.BREAK_SHED, 12)
  })

  // 2001, seed 3: the farmer alone, worn out, spraying every day until the day the draw falls under the chance.
  const base = S.createCampaign(world, { seed: 3, startYear: 2001 })
  ok(base, { t: 'begin' })
  for (let g = 0; g < 400 && base.season!.day < S.dayIndex(2001, 6, 1); g++) tendDay(base, ['kill', 'dig'])
  ok(base, { t: 'sundays', off: false })
  for (const j of [...base.season!.jobs]) ok(base, { t: 'cancel', id: j.id })
  const worn = { ...base.crew[0], tired: 1 }
  const day = drawDay(base, base.season!.day + 1, 7200 + 0, S.breakdownChance(worn, true))
  // Up to that day, keep a spray on the list and the farmer worn out.
  const run = (c: Campaign, to: number): S.GameEvent[] => {
    let events: S.GameEvent[] = []
    while (c.season!.day <= to) {
      c.crew[0].tired = 1
      for (const f of [0, 2, 4]) if (!c.season!.jobs.some(j => j.field === f) && S.jobBlock(c, 'water', f) === '') ok(c, { t: 'job', kind: 'water', field: f })
      events = ok(c, { t: 'day' }).events
    }
    return events
  }

  it('waiting for the part, the tractor is three days out and machine work stops', () => {
    const c = structuredClone(base)
    const events = run(c, day)
    const inc = c.incidents.find(i => i.kind === 'breakdown')!
    expect(inc).toBeDefined()
    expect(events.some(e => e.type === 'incident' && e.data!.kind === 'breakdown')).toBe(true)
    expect(inc.back).toBe(day + 1 + S.BREAK_DAYS)
    expect(S.tractorsRunning(c, c.season!.day)).toBe(0)
    expect(S.labourInfo(c).broken).toBe(1)
    run(c, day + 1)
    expect(c.season!.worked.filter(w => S.jobSkill(w.kind) === 'machine')).toEqual([])
    run(c, inc.back! - 1)
    expect(S.tractorsRunning(c, c.season!.day)).toBe(1)
  })

  it('a rush part costs $450 and has it back the next day', () => {
    const c = structuredClone(base)
    run(c, day)
    const inc = c.incidents.find(i => i.kind === 'breakdown')!
    const costs = c.yearCosts
    ok(c, { t: 'answer', incident: inc.id, choice: 'rush' })
    expect(c.yearCosts - costs).toBe(S.RUSH_PART)
    expect(S.tractorsRunning(c, c.season!.day)).toBe(0)
    expect(S.tractorsRunning(c, c.season!.day + 1)).toBe(1)
    // On the last day it is offered, a rush part still brings the tractor back a day early.
    const last = structuredClone(base)
    run(last, day)
    const inc2 = last.incidents.find(i => i.kind === 'breakdown')!
    expect(inc2.until).toBe(inc2.back! - 2)
    while (last.season!.day < inc2.until) ok(last, { t: 'day' })
    ok(last, { t: 'answer', incident: inc2.id, choice: 'rush' })
    expect(last.broken).toEqual([inc2.back! - 1])
  })

  it('with someone on the farm good with machines it is a day out, and nobody is asked', () => {
    const c = structuredClone(base)
    c.crew[0].skills.machine = S.MECHANIC
    const events = run(c, day)
    expect(c.incidents.filter(i => i.kind === 'breakdown')).toEqual([])
    expect(events.some(e => e.type === 'breakdown')).toBe(true)
    expect(c.broken).toEqual([day + 2])
  })

  it('a machine shed halves the odds: on a day the draw falls between the two, only the farm without it breaks down', () => {
    const p = S.breakdownChance(worn, false)
    const d = drawDay(base, base.season!.day + 1, 7200, p, p * S.BREAK_SHED)
    const plain = structuredClone(base), shed = structuredClone(base)
    shed.buildings.push({ id: shed.nextBuilding++, kind: 'shed', yard: -1, done: 16, need: 16, built: true })
    run(plain, d)
    run(shed, d)
    expect(plain.broken.length).toBe(1)
    expect(shed.broken.length).toBe(0)
  })
})

describe('someone hurt', () => {
  it('happens only working worn out in the woods or on a machine, never to the slow and sure: rest prevents it', () => {
    const u = structuredClone(S.createCampaign(world, { seed: 1, startYear: 1990 }).crew[0])
    u.tired = S.HURT_TIRED
    expect(S.hurtChance(u)).toBe(0)
    u.tired = 0.9
    expect(S.hurtChance(u)).toBe(S.HURT_CHANCE)
    u.trait = 'slow'
    expect(S.hurtChance(u)).toBe(0)
  })

  it('is out five to ten days, does no work, and comes back', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    for (let g = 0; g < 400 && c.season!.day < S.dayIndex(2001, 6, 1); g++) tendDay(c, ['kill', 'dig'])
    ok(c, { t: 'sundays', off: false })
    // Felling the woodlot, worn out, until the day the draw falls under the chance (a day dry enough to work).
    let day = c.season!.day
    do day = drawDay(c, day + 1, 7100 + 0, S.HURT_CHANCE)
    while (S.getDay(world, 2001, day).prcp >= 15)
    for (const j of [...c.season!.jobs]) ok(c, { t: 'cancel', id: j.id })
    ok(c, { t: 'job', kind: 'fell', field: 14 })
    let events: S.GameEvent[] = []
    while (c.season!.day <= day) {
      c.crew[0].tired = 0.95
      events = ok(c, { t: 'day' }).events
    }
    const hurt = events.find(e => e.type === 'hurt')!
    expect(hurt).toBeDefined()
    const out = c.crew[0].out - day - 1
    expect(out).toBeGreaterThanOrEqual(S.HURT_DAYS[0])
    expect(out).toBeLessThanOrEqual(S.HURT_DAYS[1])
    expect(S.peopleInfo(c)[0].doing).toMatch(/Hurt/)
    ok(c, { t: 'job', kind: 'scout', field: 2 })
    ok(c, { t: 'day' })
    expect(c.season!.worked).toEqual([])
    while (c.season!.day < c.crew[0].out) ok(c, { t: 'day' })
    ok(c, { t: 'day' })
    expect(c.season!.worked.length).toBeGreaterThan(0)
  })
})

describe('a buyer', () => {
  // 1990, seed 7: one field dug and weighed in late September, then the day the draw brings a buyer.
  const base = S.createCampaign(world, { seed: 7, startYear: 1990 })
  ok(base, { t: 'begin' })
  for (let g = 0; g < 400 && base.season!.day < S.dayIndex(1990, 8, 21); g++) tendDay(base, ['dig'])
  for (const j of [...base.season!.jobs]) ok(base, { t: 'cancel', id: j.id })
  const field = [0, 2, 4, 5].find(i => S.fieldInfo(base, i).status === 'dead')!
  ok(base, { t: 'job', kind: 'dig', field })
  for (let k = 0; k < 40 && !base.season!.fields[field].weighed; k++) ok(base, { t: 'day' })
  for (const i of [...base.incidents]) ok(base, { t: 'answer', incident: i.id, choice: i.choices[i.choices.length - 1] })
  const day = drawDay(base, base.season!.day, 7500, S.BUYER_CHANCE)
  while (base.season!.day <= day) ok(base, { t: 'day' })
  const inc = base.incidents.find(i => i.kind === 'buyer')!

  it('offers 10% over the market for a weighed lot, this week only', () => {
    expect(inc).toBeDefined()
    expect(inc.until).toBe(day + S.BUYER_DAYS)
    expect(base.lots.find(l => l.id === inc.lot)!.field).toBe(field)
  })

  it('taken, the lot is sold at 10% over what it would fetch on the market today', () => {
    const c = structuredClone(base)
    const lot = c.lots.find(l => l.id === inc.lot)!
    const twin = structuredClone(c)
    ok(twin, { t: 'sell', lot: lot.id, frac: 1 })
    const market = twin.yearRevenue - c.yearRevenue
    const rev = c.yearRevenue
    ok(c, { t: 'answer', incident: inc.id, choice: 'take' })
    expect(c.yearRevenue - rev).toBeCloseTo(market * (1 + S.BUYER_PREMIUM), 6)
    expect(lot.open).toBe(false)
  })

  it('turned down or left a week, the lot stays as it was; sold meanwhile, the offer cannot be taken', () => {
    const c = structuredClone(base)
    const lot = c.lots.find(l => l.id === inc.lot)!
    const have = S.lotCwt(lot)
    while (c.incidents.some(i => i.id === inc.id)) ok(c, { t: 'day' })
    expect(c.season!.day === inc.until + 1 || c.season!.frozen).toBe(true)
    expect(S.lotCwt(lot)).toBeCloseTo(have, 6)
    const d = structuredClone(base)
    ok(d, { t: 'sell', lot: inc.lot!, frac: 1 })
    refused(d, { t: 'answer', incident: inc.id, choice: 'take' }, /gone/)
  })
})
