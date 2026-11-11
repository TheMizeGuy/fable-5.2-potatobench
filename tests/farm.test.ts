// The bigger farm: land, crews and travel, the haul, potato houses, contracts.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd, JobKind } from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

function ok(c: Campaign, cmd: Cmd): S.Result {
  const r = S.apply(world, c, cmd)
  expect(r.ok, `${JSON.stringify(cmd)}: ${r.err}`).toBe(true)
  return r
}

// A refused command says why in words and changes nothing.
function refused(c: Campaign, cmd: Cmd, why?: RegExp): void {
  const before = S.hashCampaign(c)
  const r = S.apply(world, c, cmd)
  expect(r.ok, JSON.stringify(cmd)).toBe(false)
  expect(r.err.length).toBeGreaterThan(0)
  if (why) expect(r.err).toMatch(why)
  expect(S.hashCampaign(c), JSON.stringify(cmd)).toBe(before)
}

function days(c: Campaign, n: number): S.GameEvent[] {
  const out: S.GameEvent[] = []
  for (let k = 0; k < n; k++) out.push(...ok(c, { t: 'day' }).events)
  return out
}

// Reference practice, day by day, until `until` turns true; jobs in `skip` and all selling are left to the test.
function tend(c: Campaign, until: (c: Campaign) => boolean, skip: JobKind[] = []): void {
  for (let guard = 0; !until(c); guard++) {
    expect(guard < 400 && c.phase === 'season').toBe(true)
    for (const a of S.advise(world, c)) {
      if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && !skip.includes(a.act)) S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
    }
    S.apply(world, c, { t: 'day' })
  }
}

function clearList(c: Campaign): void {
  for (const j of [...c.season!.jobs]) ok(c, { t: 'cancel', id: j.id })
}

const crewOf = (c: Campaign, id: number) => S.crewInfo(c).find(u => u.id === id)!
const order = (c: Campaign, kind: JobKind, field: number) => c.season!.jobs.find(j => j.kind === kind && j.field === field)

// Runs days until an order is off the list (the weather may hold it up), and returns that day's events and work.
function untilDone(c: Campaign, kind: JobKind, field: number): { events: S.GameEvent[]; worked: S.Season['worked'] } {
  for (let k = 0; k < 20; k++) {
    const events = ok(c, { t: 'day' }).events
    if (!order(c, kind, field)) return { events, worked: c.season!.worked }
  }
  throw new Error(`${kind} on field ${field} never finished`)
}

describe('the land', () => {
  it('has a field for every parcel, named from PARCELS, the home six owned and the rest not the farm\'s', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    expect(S.FIELD_COUNT).toBe(S.PARCELS.length)
    expect(S.FIELD_NAMES).toEqual(S.PARCELS.map(p => p.name))
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const f = S.fieldInfo(c, i)
      expect([f.name, f.block, f.elev]).toEqual([S.PARCELS[i].name, S.PARCELS[i].block, S.PARCELS[i].elev])
      expect(f.tenure).toBe(i < S.HOME_FIELDS ? 'owned' : 'none')
      if (i >= S.HOME_FIELDS) {
        expect(f.status).toBe('off')
        // New land starts rested, with little early dying.
        expect([c.fields[i].soil, c.fields[i].streak]).toEqual([1, 0])
        expect(c.fields[i].vert).toBeLessThanOrEqual(0.08)
      }
    }
    expect(S.landInfo(c).map(l => l.field)).toEqual([6, 7, 8, 9, 10, 11, 12, 13])
    refused(c, { t: 'plan', field: 9, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } }, /not the farm's/)
  })

  it('rents by the year: the rent is part of the plan, paid when the season begins, and carried into the next spring until released', () => {
    const c = S.createCampaign(world, { seed: 4, startYear: 1992 })
    const before = S.planCosts(c)
    ok(c, { t: 'rent', field: 7 })
    refused(c, { t: 'rent', field: 7 }, /already rented/)
    expect(S.fieldInfo(c, 7).tenure).toBe('rented')
    expect(c.plans[7]).toEqual({ crop: 'potato', variety: 'katahdin', seed: 'certified' })
    const pc = S.planCosts(c)
    expect(pc.rent).toBe(S.PARCELS[7].rent)
    expect(pc.fields - before.fields).toBe(S.FIELD_COST + S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)
    const cash = c.cash
    ok(c, { t: 'begin' })
    expect(c.cash).toBe(cash - pc.total)
    expect([c.yearRent, c.yearCosts]).toEqual([S.PARCELS[7].rent, pc.total])
    expect(c.season!.fields[7].status).toBe('idle')
    // Play the year out on reference practice, the rented field with the rest.
    tend(c, x => S.seasonDone(x))
    ok(c, { t: 'endSeason' })
    while (c.phase === 'cellar') ok(c, { t: 'month' })
    expect(c.history[0].rent).toBe(S.PARCELS[7].rent)
    expect(c.fields[7].streak).toBe(1)
    ok(c, { t: 'next' })
    // Next spring it is still rented, its plan carried forward, and the rent comes due again with the plan.
    expect(c.fields[7].tenure).toBe('rented')
    expect(S.planCosts(c).rent).toBe(S.PARCELS[7].rent)
    // Given up, it is not the farm's: no plan, no rent.
    ok(c, { t: 'release', field: 7 })
    refused(c, { t: 'release', field: 7 }, /not the farm's/)
    expect(c.fields[7].tenure).toBe('none')
    expect(c.plans[7].crop).toBe('rest')
    expect(S.planCosts(c).rent).toBe(0)
  })

  it('a field the farm does not hold takes no orders, earns nothing and keeps its record', () => {
    const c = S.createCampaign(world, { seed: 4, startYear: 1992 })
    ok(c, { t: 'rent', field: 8 })
    ok(c, { t: 'plan', field: 8, plan: { crop: 'rest', variety: 'katahdin', seed: 'certified' } })
    const record = structuredClone(c.fields.slice(9))
    ok(c, { t: 'begin' })
    for (const kind of S.JOBS) refused(c, { t: 'job', kind, field: 9 }, /not the farm's/)
    expect(S.fieldActions(world, c, 9).every(a => !a.ok)).toBe(true)
    expect(S.fieldInfo(c, 9).status).toBe('off')
    expect(c.season!.fields[9].hState).toEqual([])
    tend(c, x => S.seasonDone(x))
    ok(c, { t: 'endSeason' })
    // The rented field in oats and clover brings rest income; the land not held brings none.
    const resting = c.plans.filter((p, i) => S.held(c, i) && p.crop === 'rest').length
    expect(c.yearRest).toBe(resting * S.REST_INCOME)
    expect(resting).toBe(c.plans.slice(0, 6).filter(p => p.crop === 'rest').length + 1)
    while (c.phase === 'cellar') ok(c, { t: 'month' })
    expect(c.fields.slice(9)).toEqual(record)
    expect([c.fields[8].soil, c.fields[8].streak]).toEqual([1, 0])
  })

  it('is bought outright from cash, not on the spring loan, and net worth keeps it at its price', () => {
    const c = S.createCampaign(world, { seed: 2, startYear: 2005 })
    ok(c, { t: 'rent', field: 9 })
    c.cash = S.PARCELS[9].price + 30000
    const worth = S.netWorth(c)
    const cash = c.cash
    ok(c, { t: 'buyLand', field: 9 })
    expect(c.cash).toBe(cash - S.PARCELS[9].price)
    expect([c.yearLand, c.yearCosts]).toEqual([S.PARCELS[9].price, S.PARCELS[9].price])
    expect(c.fields[9].tenure).toBe('owned')
    expect(S.netWorth(c)).toBe(worth)
    // Bought land pays no rent and is not given back.
    expect(S.planCosts(c).rent).toBe(0)
    refused(c, { t: 'release', field: 9 }, /owns/)
    refused(c, { t: 'buyLand', field: 9 }, /already owns/)
    // Short of cash: refused, whatever the bank would lend for the spring.
    refused(c, { t: 'buyLand', field: 6 }, /cash/)
    ok(c, { t: 'begin' })
    refused(c, { t: 'buyLand', field: 6 }, /spring/)
    refused(c, { t: 'rent', field: 6 }, /spring/)
  })
})

describe('potato houses', () => {
  it('count the Dufour house only while Dufour land is held, and a second home house adds as much again', () => {
    const c = S.createCampaign(world, { seed: 5, startYear: 2010 })
    const cap = () => S.storageInfo(c).capacity
    expect(cap()).toBe(S.CELLAR_CWT)
    expect(S.landInfo(c).find(l => l.field === 10)!.house).toBe(S.YARDS[1].cellar)
    ok(c, { t: 'rent', field: 10 })
    expect(cap()).toBe(S.CELLAR_CWT + S.YARDS[1].cellar)
    expect(S.storageInfo(c).houses.map(h => [h.name, h.at])).toEqual([['Home potato house', -1], ['Dufour potato house', -2]])
    expect(S.landInfo(c).find(l => l.field === 11)!.house).toBe(0)
    ok(c, { t: 'rent', field: 11 })
    ok(c, { t: 'release', field: 10 })
    expect(cap()).toBe(S.CELLAR_CWT + S.YARDS[1].cellar)
    ok(c, { t: 'release', field: 11 })
    expect(cap()).toBe(S.CELLAR_CWT)
    expect(S.cellarCapacity(c)).toBe(cap())
    c.cash = 60000
    ok(c, { t: 'buy', upgrade: 'house2' })
    expect(cap()).toBe(2 * S.CELLAR_CWT)
    ok(c, { t: 'buy', upgrade: 'vent' })
    expect(cap()).toBe(2 * S.CELLAR_CWT_VENT)
  })
})

describe('the haul', () => {
  it('leaves a home dig as it was and lengthens a dig far from any potato house, up to about 40%', () => {
    const c = S.createCampaign(world, { seed: 5, startYear: 2010 })
    for (let i = 0; i < S.HOME_FIELDS; i++) expect(S.jobDays(c, 'dig', null, i)).toBe(S.JOB_DAYS.dig)
    const far = S.jobDays(c, 'dig', null, 8)
    expect(far).toBeCloseTo(S.JOB_DAYS.dig * (1 + S.HAUL * (S.distance(8, -1) - S.HAUL_FREE)), 12)
    expect(far / S.JOB_DAYS.dig).toBeGreaterThan(1.35)
    expect(far / S.JOB_DAYS.dig).toBeLessThan(1.45)
    for (let i = 0; i < S.FIELD_COUNT; i++) expect(S.jobDays(c, 'dig', null, i)).toBeLessThanOrEqual(far)
    expect(S.jobDays(c, 'dig', null, 7)).toBeGreaterThan(S.JOB_DAYS.dig)
    // The Dufour fields haul to their own potato house once the farm holds one.
    ok(c, { t: 'rent', field: 11 })
    for (const i of [10, 11, 12, 13]) expect(S.jobDays(c, 'dig', null, i)).toBe(S.JOB_DAYS.dig)
    for (const l of S.landInfo(c)) expect(l.haul, l.name).toBeCloseTo(S.haulFactor(c, l.field, true) - 1, 12)
    // With the harvester the haul still counts.
    c.upgrades.harvester = true
    expect(S.jobDays(c, 'dig', null, 8)).toBeCloseTo(1.25 * far / S.JOB_DAYS.dig, 12)
  })

  it('sets the need of a dig order on a far field', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'rent', field: 8 })
    ok(c, { t: 'begin' })
    tend(c, x => x.season!.fields[8].tiDay >= 0 && x.season!.fields[0].tiDay >= 0, ['kill', 'dig'])
    clearList(c)
    ok(c, { t: 'job', kind: 'dig', field: 8 })
    ok(c, { t: 'job', kind: 'dig', field: 0 })
    expect(order(c, 'dig', 8)!.need).toBeCloseTo(S.haulFactor(c, 8) * S.JOB_DAYS.dig, 12)
    expect(order(c, 'dig', 0)!.need).toBe(S.JOB_DAYS.dig)
    expect(S.fieldActions(world, c, 8).find(a => a.kind === 'dig')!.days).toBeCloseTo(order(c, 'dig', 8)!.need, 12)
  })
})

describe('travel', () => {
  // 1990: the farm rents Spruce Lot, at the far end of the ridge lots. On the first day fit to plant both it and
  // Upper Middle, the farmer is still in the home yard.
  const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
  ok(c, { t: 'rent', field: 8 })
  ok(c, { t: 'buy', upgrade: 'tractor2' })
  ok(c, { t: 'begin' })
  const fit = () => [2, 8].every(i => S.fieldActions(world, c, i).find(a => a.kind === 'plant')!.wait === '')
  while (!fit()) ok(c, { t: 'day' })

  it('runs about 0.03 of a day between neighbouring home fields and 0.11 from home to the Dufour place', () => {
    expect(S.travelDays(0, 1)).toBeCloseTo(0.026, 3)
    expect(S.travelDays(2, 4)).toBeCloseTo(0.021, 3)
    expect(S.travelDays(-1, -2)).toBeCloseTo(0.106, 3)
    expect(S.travelDays(5, 5)).toBe(0)
  })

  it('costs a far field more of the day than a near one', () => {
    expect(crewOf(c, 0).at).toBe(-1)
    const near = structuredClone(c), far = structuredClone(c)
    ok(near, { t: 'job', kind: 'plant', field: 2 })
    ok(far, { t: 'job', kind: 'plant', field: 8 })
    days(near, 1)
    days(far, 1)
    const a = order(near, 'plant', 2)!.done, b = order(far, 'plant', 8)!.done
    expect(a).toBeCloseTo(1 - S.travelDays(-1, 2), 12)
    expect(b).toBeCloseTo(1 - S.travelDays(-1, 8), 12)
    expect(b).toBeLessThan(a - 0.05)
    expect([crewOf(near, 0).at, crewOf(far, 0).at]).toEqual([2, 8])
    expect(near.season!.worked).toEqual([{ kind: 'plant', field: 2, unit: 0 }])
    // The farmer holds the planting it began and, on the next day fit for it, finishes it before anything else.
    expect(crewOf(far, 0).job!.kind).toBe('plant')
    ok(far, { t: 'job', kind: 'plant', field: 2 })
    ok(far, { t: 'bump', id: order(far, 'plant', 2)!.id })
    const { events, worked } = untilDone(far, 'plant', 8)
    expect(events.some(e => e.type === 'planted' && e.field === 8)).toBe(true)
    expect(worked[0]).toEqual({ kind: 'plant', field: 8, unit: 0 })
  })

  it('a field hand cannot plant: pinned it is refused, and unpinned the planting waits for the farmer', () => {
    const x = structuredClone(c)
    ok(x, { t: 'hire', kind: 'hand' })
    const hand = x.crew[1].id
    refused(x, { t: 'job', kind: 'plant', field: 2, unit: hand }, /field hand/)
    ok(x, { t: 'job', kind: 'plant', field: 2 })
    refused(x, { t: 'assign', id: order(x, 'plant', 2)!.id, unit: hand }, /field hand/)
    days(x, 1)
    expect(x.season!.worked).toEqual([{ kind: 'plant', field: 2, unit: 0 }])
    expect(crewOf(x, hand)).toMatchObject({ at: -1, job: null })
  })

  it('lets another crew take over an order the farmer began, and keeps the work done on it', () => {
    const x = structuredClone(c)
    ok(x, { t: 'job', kind: 'plant', field: 0 })
    days(x, 1)
    const job = order(x, 'plant', 0)!
    const done = job.done
    expect(done).toBeCloseTo(1 - S.travelDays(-1, 0), 12)
    ok(x, { t: 'hire', kind: 'operator' })
    const op = x.crew.find(u => u.kind === 'operator')!
    expect(op.at).toBe(-1)
    ok(x, { t: 'assign', id: job.id, unit: op.id })
    expect(crewOf(x, 0).job).toBeNull()
    expect(crewOf(x, op.id).job).toBeNull()
    const { events, worked } = untilDone(x, 'plant', 0)
    expect(worked).toEqual([{ kind: 'plant', field: 0, unit: op.id }])
    expect(events.filter(e => e.type === 'planted' && e.field === 0).length).toBe(1)
    expect(crewOf(x, op.id).at).toBe(0)
    expect(crewOf(x, 0).at).toBe(0)
  })
})

describe('crews in midsummer', () => {
  // 2001: every home field in potatoes and Spruce Lot rented; the second tractor bought. Grown on reference
  // practice to mid July, then the list is cleared for each test.
  const base = S.createCampaign(world, { seed: 3, startYear: 2001 })
  ok(base, { t: 'buy', upgrade: 'tractor2' })
  ok(base, { t: 'rent', field: 8 })
  for (const i of [1, 3]) ok(base, { t: 'plan', field: i, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } })
  ok(base, { t: 'begin' })
  tend(base, x => x.season!.day >= S.dayIndex(2001, 6, 12), ['kill', 'dig'])
  // Two dry, calm days ahead, so the weather holds up none of the jobs the tests give.
  const calm = (x: Campaign, n: number) => {
    for (let k = 0; k < n; k++) {
      const d = S.getDay(world, 2001, x.season!.day + k)
      if (d.prcp >= 2 || d.wind >= 7.5) return false
    }
    return true
  }
  while (!calm(base, 2)) {
    const next = base.season!.day + 1
    tend(base, x => x.season!.day >= next, ['kill', 'dig'])
  }
  clearList(base)
  const up = [0, 1, 2, 3, 4, 5, 8].every(i => S.fieldInfo(base, i).status === 'growing' && S.fieldInfo(base, i).canopy > 0)

  function fresh(hands = 1): { c: Campaign; hand: number } {
    const c = structuredClone(base)
    for (let k = 0; k < hands; k++) ok(c, { t: 'hire', kind: 'hand' })
    return { c, hand: c.crew.find(u => u.kind === 'hand')?.id ?? -1 }
  }

  it('starts from every field up and growing, with an empty list', () => {
    expect(up).toBe(true)
    expect(base.season!.jobs).toEqual([])
  })

  it('two crews work two orders the same day, and never the same one', () => {
    const { c, hand } = fresh()
    ok(c, { t: 'job', kind: 'scout', field: 0 })
    ok(c, { t: 'job', kind: 'scout', field: 2 })
    const events = days(c, 1)
    const w = c.season!.worked
    expect(w.length).toBe(2)
    expect(new Set(w.map(x => x.unit))).toEqual(new Set([0, hand]))
    expect(new Set(w.map(x => x.field))).toEqual(new Set([0, 2]))
    // The hand goes first and takes the first walk on the list.
    expect(w[0]).toEqual({ kind: 'scout', field: 0, unit: hand })
    expect(events.filter(e => e.type === 'scout').map(e => e.field).sort()).toEqual([0, 2])
    expect(c.season!.jobs).toEqual([])
  })

  it('one farmer on the home six works the list in order; a crew far from an order takes a nearer one first', () => {
    const c = structuredClone(base)
    for (const f of [5, 0, 4, 1]) ok(c, { t: 'job', kind: 'scout', field: f })
    days(c, 1)
    expect(c.season!.worked.map(w => [w.field, w.unit])).toEqual([[5, 0], [0, 0], [4, 0], [1, 0]])
    // From the home yard, Spruce Lot is 0.13 of a day away and Lower Middle 0.03: the hand walks Lower Middle first.
    const { c: d, hand } = fresh()
    ok(d, { t: 'job', kind: 'scout', field: 8, unit: hand })
    ok(d, { t: 'job', kind: 'scout', field: 3, unit: hand })
    days(d, 1)
    expect(d.season!.worked.map(w => w.field)).toEqual([3, 8])
    expect(S.travelDays(-1, 8) - S.travelDays(-1, 3)).toBeGreaterThan(S.PICK_LAG)
  })

  it('a hand does only the walking jobs and an operator only the machine jobs', () => {
    const { c, hand } = fresh()
    // A job the field would take is refused for the crew; one the field would not take is refused either way.
    for (const kind of ['plant', 'hill', 'spray', 'water', 'kill', 'dig'] as const) refused(c, { t: 'job', kind, field: 0, unit: hand }, S.jobBlock(c, kind, 0) ? undefined : /field hand/)
    ok(c, { t: 'job', kind: 'spray', field: 2 })
    refused(c, { t: 'assign', id: order(c, 'spray', 2)!.id, unit: hand }, /field hand/)
    ok(c, { t: 'hire', kind: 'operator' })
    const op = c.crew.find(u => u.kind === 'operator')!.id
    for (const kind of ['scout', 'rogue', 'sample'] as const) refused(c, { t: 'job', kind, field: 0, unit: op }, S.jobBlock(c, kind, 0) ? undefined : /second tractor/)
    ok(c, { t: 'job', kind: 'scout', field: 3 })
    refused(c, { t: 'assign', id: order(c, 'scout', 3)!.id, unit: op }, /second tractor/)
    ok(c, { t: 'cancel', id: order(c, 'scout', 3)!.id })
    // Unpinned, a machine job goes to a crew that can do it, never to the hand.
    days(c, 1)
    expect(c.season!.worked).toEqual([{ kind: 'spray', field: 2, unit: op }])
    expect(crewOf(c, hand).at).toBe(-1)
  })

  it('has no operator without the second tractor, and keeps to four hands and one operator', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    refused(c, { t: 'hire', kind: 'operator' }, /second tractor/)
    refused(c, { t: 'hire', kind: 'farmer' })
    const { c: d } = fresh(S.MAX_HANDS)
    expect(d.crew.filter(u => u.kind === 'hand').map(u => u.name)).toEqual(S.HAND_NAMES.slice(0, S.MAX_HANDS))
    refused(d, { t: 'hire', kind: 'hand' }, /as many/)
    ok(d, { t: 'hire', kind: 'operator' })
    refused(d, { t: 'hire', kind: 'operator' }, /already has/)
    refused(d, { t: 'dismiss', unit: 0 }, /farmer/)
  })

  it('keeps a pinned order for its crew, and a reassigned one goes to the new crew', () => {
    const { c, hand } = fresh()
    ok(c, { t: 'job', kind: 'scout', field: 4, unit: hand })
    ok(c, { t: 'job', kind: 'scout', field: 5, unit: hand })
    const at = crewOf(c, 0).at
    days(c, 1)
    // The farmer had nothing it was allowed to take, and stayed where it was.
    expect(c.season!.worked.every(w => w.unit === hand)).toBe(true)
    expect(c.season!.worked.length).toBe(2)
    expect(crewOf(c, 0).at).toBe(at)
    ok(c, { t: 'job', kind: 'scout', field: 1, unit: hand })
    ok(c, { t: 'assign', id: order(c, 'scout', 1)!.id, unit: 0 })
    days(c, 1)
    expect(c.season!.worked).toEqual([{ kind: 'scout', field: 1, unit: 0 }])
    // A pin to a crew that is let go comes off: anyone may take the order.
    ok(c, { t: 'job', kind: 'scout', field: 2, unit: hand })
    ok(c, { t: 'dismiss', unit: hand })
    expect(order(c, 'scout', 2)!.unit).toBe(-1)
    days(c, 1)
    expect(c.season!.worked).toEqual([{ kind: 'scout', field: 2, unit: 0 }])
  })

  it('carries a drive that does not fit in what is left of the day into the next', () => {
    const { c, hand } = fresh()
    for (const f of [0, 1, 2, 3, 8]) ok(c, { t: 'job', kind: 'scout', field: f, unit: hand })
    days(c, 1)
    const w = c.season!.worked.filter(x => x.unit === hand).map(x => x.field)
    expect(w.sort()).toEqual([0, 1, 2, 3])
    // Its route, from the home yard round the four home fields in the order walked.
    const route = c.season!.worked.map(x => x.field)
    let used = S.travelDays(-1, route[0]) + route.length * S.JOB_DAYS.scout
    for (let k = 1; k < route.length; k++) used += S.travelDays(route[k - 1], route[k])
    const last = route[route.length - 1]
    const h = crewOf(c, hand)
    expect(h.travelling).toBe(true)
    expect(h.job!.field).toBe(8)
    expect([h.at, h.to]).toEqual([last, 8])
    expect(h.road).toBeCloseTo(S.travelDays(last, 8) - (1 - used), 9)
    expect(h.road).toBeGreaterThan(0)
    expect(order(c, 'scout', 8)!.done).toBe(0)
    const events = days(c, 1)
    expect(events.some(e => e.type === 'scout' && e.field === 8)).toBe(true)
    expect(crewOf(c, hand)).toMatchObject({ at: 8, travelling: false, job: null })
  })

  it('pays wages every 30 days from the day hired, and stops when the hand is let go', () => {
    const c = structuredClone(base)
    const cash = c.cash
    ok(c, { t: 'hire', kind: 'hand' })
    const hand = c.crew[1]
    expect(c.cash).toBe(cash - S.HAND_WAGE)
    expect(c.yearWages).toBe(S.HAND_WAGE)
    days(c, S.WAGE_DAYS)
    expect(c.yearWages).toBe(S.HAND_WAGE)
    days(c, 1)
    expect(c.yearWages).toBe(2 * S.HAND_WAGE)
    days(c, S.WAGE_DAYS - 1)
    expect(c.yearWages).toBe(2 * S.HAND_WAGE)
    days(c, 1)
    expect(c.yearWages).toBe(3 * S.HAND_WAGE)
    ok(c, { t: 'dismiss', unit: hand.id })
    days(c, S.WAGE_DAYS + 1)
    expect(c.yearWages).toBe(3 * S.HAND_WAGE)
    expect(c.cash - c.yearRevenue + c.yearCosts).toBeCloseTo(base.cash - base.yearRevenue + base.yearCosts, 6)
  })
})

describe('wages for a crew hired in spring', () => {
  it('are part of the plan, then fall due every 30 days of the season, and the crew carries into the next year', () => {
    const c = S.createCampaign(world, { seed: 8, startYear: 1998 })
    ok(c, { t: 'hire', kind: 'hand' })
    ok(c, { t: 'hire', kind: 'hand' })
    expect(c.yearWages).toBe(0)
    expect(S.planCosts(c).wages).toBe(2 * S.HAND_WAGE)
    ok(c, { t: 'begin' })
    expect(c.yearWages).toBe(2 * S.HAND_WAGE)
    days(c, S.WAGE_DAYS)
    expect(c.yearWages).toBe(2 * S.HAND_WAGE)
    days(c, 1)
    expect(c.yearWages).toBe(4 * S.HAND_WAGE)
    ok(c, { t: 'dismiss', unit: c.crew[2].id })
    tend(c, x => S.seasonDone(x))
    ok(c, { t: 'endSeason' })
    while (c.phase === 'cellar') ok(c, { t: 'month' })
    const h = c.history[0]
    expect(h.wages).toBe(c.yearWages)
    expect(c.cash).toBeCloseTo(h.cashStart + h.revenue - h.costs - h.note - h.living - h.interest, 6)
    ok(c, { t: 'next' })
    expect(c.crew.map(u => u.kind)).toEqual(['farmer', 'hand'])
    expect(S.planCosts(c).wages).toBe(S.HAND_WAGE)
  })
})

describe('advice', () => {
  it('covers the held fields only, and no more of a job than the crews could get round to', () => {
    const c = S.createCampaign(world, { seed: 6, startYear: 2003 })
    for (const i of [1, 3]) ok(c, { t: 'plan', field: i, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } })
    ok(c, { t: 'rent', field: 8 })
    ok(c, { t: 'rent', field: 9 })
    c.cash += S.PARCELS[8].rent + S.PARCELS[9].rent
    ok(c, { t: 'begin' })
    const plants = () => S.advise(world, c).filter(a => a.act === 'plant')
    const fit = () => [0, 1, 2, 3, 4, 5, 8, 9].filter(i => !S.fieldInfo(c, i).tooWet)
    while (plants().length === 0 || fit().length < 7) ok(c, { t: 'day' })
    // Seven or eight fields want planting; one farmer is given six at a time, in the order of the fields.
    expect(plants().map(a => a.field)).toEqual(fit().slice(0, S.ADVICE_FIELDS_PER_CREW))
    for (const a of S.advise(world, c)) expect(S.held(c, a.field) || a.field === -1).toBe(true)
    for (const a of plants()) ok(c, { t: 'job', kind: 'plant', field: a.field })
    expect(plants()).toEqual([])
    // A hand cannot plant, so it makes no room for more planting.
    ok(c, { t: 'hire', kind: 'hand' })
    expect(plants()).toEqual([])
    expect(S.fieldNeeds(world, c).length).toBe(S.FIELD_COUNT)
    for (let i = 0; i < S.FIELD_COUNT; i++) if (!S.held(c, i)) expect(S.fieldNeeds(world, c)[i]).toEqual({ need: null, hold: null })
  })
})

describe('contracts', () => {
  it('are offered the same way for the same seed and year, three buyers at prices around the variety\'s', () => {
    for (const seed of [1, 2, 20240611]) {
      for (const year of [1973, 1980, 1995, 2016, 2024]) {
        const offers = S.contractOffers(seed, year)
        expect(S.contractOffers(seed, year)).toEqual(offers)
        expect(offers.length).toBe(S.CONTRACT_OFFERS)
        expect(new Set(offers.map(o => o.buyer)).size).toBe(offers.length)
        for (const o of offers) {
          const v = S.variety(o.variety)
          expect(v.released).toBeLessThanOrEqual(year)
          const [lo, hi] = S.CONTRACT_PRICE[o.due]
          expect(o.price / v.price).toBeGreaterThanOrEqual(lo - 0.025 / v.price)
          expect(o.price / v.price).toBeLessThanOrEqual(hi + 0.025 / v.price)
          expect(o.cwt % 50).toBe(0)
          expect(o.cwt).toBeGreaterThanOrEqual(S.CONTRACT_CWT_MIN)
          expect(o.cwt).toBeLessThanOrEqual(S.CONTRACT_CWT_MAX)
          if (o.buyer === 'The chip plant' && year >= 1976) expect(o.variety).toBe('atlantic')
        }
      }
    }
    expect(S.contractOffers(1, 1990)).not.toEqual(S.contractOffers(1, 1991))
    expect(S.contractOffers(1, 1990)).not.toEqual(S.contractOffers(2, 1990))
    expect(S.createCampaign(world, { seed: 7, startYear: 1999 }).offers).toEqual(S.contractOffers(7, 1999))
  })

  it('price the chipping variety on the open market at a processing price only', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1999 })
    const atlantic = S.variety('atlantic')
    const level = S.levelNow(world, c)
    expect(S.basePrice(world, c, 'atlantic')).toBeCloseTo(atlantic.price * S.PROCESSING_PRICE * (1 + (level - 1) * 0.25), 12)
    expect(S.offerInfo(c).length).toBe(c.offers.length)
    for (const o of S.offerInfo(c)) if (o.variety === 'atlantic') expect(o.usual).toBe(atlantic.price * S.PROCESSING_PRICE)
    // A contract for it pays around its full price.
    for (const seed of [1, 2, 3, 4, 5, 6]) for (const o of S.contractOffers(seed, 1999)) if (o.variety === 'atlantic') expect(o.price).toBeGreaterThan(atlantic.price * S.PROCESSING_PRICE * 1.1)
  })

  // 2002, seed 4: the chip plant wants Atlantic from storage, the seed house Atlantic off the field, the packer
  // Kennebec from storage. All three are signed and Atlantic planted on two fields, so the chip plant's contract can
  // be delivered and the others fall short.
  const c = S.createCampaign(world, { seed: 4, startYear: 2002 })
  const offers = structuredClone(c.offers)
  const want = offers[0].variety
  expect(offers.map(o => [o.variety, o.due])).toEqual([['atlantic', 'winter'], ['atlantic', 'harvest'], ['kennebec', 'winter']])
  for (const o of offers) ok(c, { t: 'accept', offer: o.id })
  refused(c, { t: 'accept', offer: offers[0].id }, /No such offer/)
  for (const i of [0, 2]) ok(c, { t: 'plan', field: i, plan: { crop: 'potato', variety: want, seed: 'certified' } })
  ok(c, { t: 'begin' })
  const dugLot = () => S.openLots(c).find(l => l.variety === want && c.season!.fields[l.field].status === 'dug')
  tend(c, x => S.seasonDone(x) || !!dugLot())

  it('signed in spring are kept as contracts with nothing delivered yet', () => {
    expect(c.offers).toEqual([])
    expect(S.contractInfo(c).map(k => [k.id, k.delivered, k.needed, k.settled])).toEqual(offers.map(o => [o.id, 0, o.cwt, false]))
    for (const k of S.contractInfo(c)) expect(k.penalty).toBeCloseTo(k.cwt * k.price * S.CONTRACT_PENALTY, 9)
  })

  it('take US No. 1 and large tubers from a dug lot, after the storage since the dig is settled, at the contract price', () => {
    const lot = dugLot()!
    expect(lot).toBeDefined()
    const k = c.contracts[0]
    refused(c, { t: 'deliver', lot: lot.id, contract: c.contracts.find(x => x.variety !== want)?.id ?? -1 })
    const months = (c.season!.day - lot.aged) / 30
    const keep = 1 - S.SHRINK * months
    const no1 = lot.grades.no1 * keep, chef = lot.grades.chef * keep, b = lot.grades.b * keep
    const take = Math.min(no1 + chef, k.cwt)
    const rent = Math.round(S.lotCwt(lot) * S.STORE_COST * months)
    const cash = c.cash, sold = lot.sold, revenue = c.yearRevenue
    ok(c, { t: 'deliver', lot: lot.id, contract: k.id })
    expect(k.delivered).toBeCloseTo(take, 9)
    expect(lot.sold - sold).toBeCloseTo(take, 9)
    expect(lot.grades.no1 + lot.grades.chef).toBeCloseTo(no1 + chef - take, 9)
    expect(lot.grades.b).toBeCloseTo(b, 9)
    expect(c.yearContracts).toBeCloseTo(take * k.price, 9)
    expect(c.yearRevenue - revenue).toBeCloseTo(take * k.price, 9)
    expect(c.cash - cash).toBeCloseTo(take * k.price - rent, 9)
    expect(k.paid).toBeCloseTo(take * k.price, 9)
    const info = S.contractInfo(c)[0]
    expect(info.needed).toBeCloseTo(k.cwt - take, 9)
    expect(info.penalty).toBeCloseTo((k.cwt - take) * k.price * S.CONTRACT_PENALTY, 9)
  })

  it('fall due with a penalty of 30% of the value short: harvest contracts at the close of the season, winter ones in March', () => {
    // Everything the two fields can give goes to the first contract.
    tend(c, x => S.seasonDone(x))
    for (const l of S.openLots(c)) if (l.variety === want && c.contracts[0].delivered < c.contracts[0].cwt) S.apply(world, c, { t: 'deliver', lot: l.id, contract: c.contracts[0].id })
    const short = c.contracts.map(k => k.cwt - k.delivered)
    const pen = c.contracts.map((k, i) => short[i] > 1e-6 ? short[i] * k.price * S.CONTRACT_PENALTY : 0)
    // Nothing went to the seed house or the packer: each owes 30% of its whole contract.
    for (const i of [1, 2]) expect(pen[i]).toBeCloseTo(offers[i].cwt * offers[i].price * 0.3, 9)
    const costs = c.yearCosts
    const events = ok(c, { t: 'endSeason' }).events
    const harvest = c.contracts.map((k, i) => k.due === 'harvest' ? pen[i] : 0)
    expect(c.contracts.map(k => k.settled)).toEqual(c.contracts.map(k => k.due === 'harvest'))
    expect(c.yearPenalties).toBeCloseTo(harvest.reduce((a, x) => a + x, 0), 9)
    expect(events.filter(e => e.type === 'contractShort').length).toBe(harvest.filter(x => x > 0).length)
    expect(c.yearCosts - costs).toBeGreaterThanOrEqual(c.yearPenalties - 1e-9)
    refused(c, { t: 'deliver', lot: S.openLots(c)[0]?.id ?? 1, contract: c.contracts.find(k => k.settled)?.id ?? -1 })
    // Winter contracts are settled when the cellar reaches March (or when it closes, if that is sooner).
    while (c.phase === 'cellar' && c.month < S.CONTRACT_WINTER_MONTH) {
      expect(c.contracts.filter(k => k.due === 'winter').every(k => !k.settled)).toBe(true)
      ok(c, { t: 'month' })
    }
    expect(c.contracts.every(k => k.settled)).toBe(true)
    expect(c.yearPenalties).toBeCloseTo(pen.reduce((a, x) => a + x, 0), 9)
    for (const [i, k] of c.contracts.entries()) expect(k.penalty).toBeCloseTo(pen[i], 9)
    while (c.phase === 'cellar') ok(c, { t: 'month' })
    const h = c.history[0]
    expect(h.penalties).toBeCloseTo(c.yearPenalties, 9)
    expect(h.contracts).toBeCloseTo(c.yearContracts, 9)
    expect(c.cash).toBeCloseTo(h.cashStart + h.revenue - h.costs - h.note - h.living - h.interest, 6)
    ok(c, { t: 'next' })
    expect(c.contracts).toEqual([])
    expect(c.offers).toEqual(S.contractOffers(4, 2003))
  })
})

describe('views', () => {
  it('report the crew, where each is and what it is doing, without the season\'s hidden state', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    ok(c, { t: 'hire', kind: 'hand' })
    const info = S.crewInfo(c)
    expect(info.map(u => [u.id, u.kind, u.name, u.at, u.wage, u.job, u.travelling])).toEqual([
      [0, 'farmer', S.FARMER_NAME, -1, 0, null, false],
      [1, 'hand', S.HAND_NAMES[0], -1, S.HAND_WAGE, null, false],
    ])
    expect(Object.keys(info[0]).sort()).toEqual(['at', 'id', 'job', 'kind', 'name', 'road', 'to', 'travelling', 'wage'])
    expect(S.storageInfo(c)).toEqual({ houses: [{ name: 'Home potato house', at: -1, cwt: S.CELLAR_CWT }], capacity: S.CELLAR_CWT, stored: 0, free: S.CELLAR_CWT })
    const land = S.landInfo(c).find(l => l.field === 12)!
    expect(land).toMatchObject({ name: 'Dufour Middle', block: 'dufour', rent: S.PARCELS[12].rent, price: S.PARCELS[12].price, tenure: 'none', house: S.YARDS[1].cellar, haul: 0 })
    expect(land.brings).toMatch(/Dufour potato house/)
    expect(land.travel).toBeCloseTo(S.travelDays(-1, 12), 12)
  })
})
