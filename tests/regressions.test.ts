// Defects found in playtests and review, each pinned by the case that exposed it.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, JobKind } from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

// Reference practice up to the day `until` turns true, leaving the jobs in `skip` to the test. spring runs before
// the season begins.
function grow(year: number, seed: number, until: (c: Campaign) => boolean, skip: JobKind[] = ['kill', 'dig'], spring?: (c: Campaign) => void): Campaign {
  const c = S.createCampaign(world, { seed, startYear: year })
  spring?.(c)
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  for (let guard = 0; !until(c); guard++) {
    expect(guard < 400 && c.phase === 'season').toBe(true)
    for (const a of S.advise(world, c)) {
      if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && !skip.includes(a.act)) S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
    }
    S.apply(world, c, { t: 'day' })
  }
  return c
}

const FIELDS = [0, 1, 2, 3, 4, 5]

describe('a dig ordered while a vine kill is part done', () => {
  // 1990, seed 7: on August 25 three walks and a spray fill most of the day, so the kill gets only part of it.
  // The farm has a second tractor, so that an operator can work beside the farmer in the two-crew case.
  const start = grow(1990, 7, c => c.season!.day >= S.dayIndex(1990, 7, 25), ['kill', 'dig'], c => {
    c.upgrades.tractor2 = true
  })
  for (const j of [...start.season!.jobs]) S.apply(world, start, { t: 'cancel', id: j.id })
  for (const f of [2, 4, 5]) expect(S.apply(world, start, { t: 'job', kind: 'scout', field: f }).ok).toBe(true)
  expect(S.apply(world, start, { t: 'job', kind: 'spray', field: 0 }).ok).toBe(true)
  expect(S.apply(world, start, { t: 'job', kind: 'kill', field: 0 }).ok).toBe(true)
  S.apply(world, start, { t: 'day' })
  const killOf = (c: Campaign) => c.season!.jobs.find(j => j.kind === 'kill' && j.field === 0)

  // Runs two weeks with a dig ordered first on the field, checking that once digging starts nothing else is left there.
  function digOut(c: Campaign, unit = -1): S.GameEvent[] {
    const s = c.season!
    expect(S.apply(world, c, { t: 'job', kind: 'dig', field: 0, unit }).ok).toBe(true)
    S.apply(world, c, { t: 'bump', id: s.jobs.find(j => j.kind === 'dig')!.id })
    const events: S.GameEvent[] = []
    let digging = false
    for (let d = 0; d < 14; d++) {
      events.push(...S.apply(world, c, { t: 'day' }).events)
      if (S.fieldInfo(c, 0).status === 'digging') digging = true
      if (digging) expect(s.jobs.some(j => j.field === 0 && j.kind !== 'dig' && j.kind !== 'haul'), 'only the dig and the haul are left on that field').toBe(false)
    }
    expect(digging).toBe(true)
    expect(S.fieldInfo(c, 0).status).toBe('dug')
    expect(events.filter(e => e.field === 0 && e.type === 'dug').length).toBe(1)
    expect(c.lots.filter(l => l.field === 0).length).toBe(1)
    const before = S.hashCampaign(c)
    const again = S.apply(world, c, { t: 'job', kind: 'dig', field: 0 })
    expect(again.ok).toBe(false)
    expect(again.err).toBe('This field is dug.')
    expect(S.hashCampaign(c)).toBe(before)
    return events
  }

  it('starts from a kill that has had part of a day, held by the farmer', () => {
    const kill = killOf(start)
    expect(kill).toBeDefined()
    expect(kill!.done).toBeGreaterThan(0)
    expect(kill!.done).toBeLessThan(kill!.need)
    expect(S.fieldInfo(start, 0).status).toBe('growing')
    expect(S.crewInfo(start)[0].job).toEqual({ id: kill!.id, kind: 'kill', field: 0 })
  })

  it('with one crew: the farmer finishes the kill it began before the dig, and the field is dug once', () => {
    const c = structuredClone(start)
    const events = digOut(c)
    const killed = events.filter(e => e.field === 0 && e.type === 'killed')
    expect(killed.length).toBe(1)
    // On the next working day (a Sunday off does not count).
    let next = start.season!.day
    while (S.weekday(start.year, next) === S.SUNDAY) next++
    expect(killed[0].day).toBe(next)
  })

  it('with two crews: a dig the operator starts drops the kill the farmer had begun, and the field is dug once', () => {
    const c = structuredClone(start)
    expect(S.apply(world, c, { t: 'hire', kind: 'operator' }).ok).toBe(true)
    const op = c.crew.find(u => u.kind === 'operator')!
    // The kill goes to the operator too, so the farmer lets it go; the operator does the dig first.
    expect(S.apply(world, c, { t: 'assign', id: killOf(c)!.id, unit: op.id }).ok).toBe(true)
    expect(S.crewInfo(c)[0].job).toBeNull()
    const events = digOut(c, op.id)
    expect(events.filter(e => e.field === 0 && e.type === 'killed')).toEqual([])
    expect(events.some(e => e.type === 'dropped' && e.field === 0)).toBe(false)
  })
})

describe('seed held back from a pile that rot has run through', () => {
  // One field of Katahdin dug green in August, so the skins never set; without ventilation the pile breaks down in
  // the step into March.
  const c = S.createCampaign(world, { seed: 5, startYear: 1990 })
  for (let i = 1; i < 6; i++) S.apply(world, c, { t: 'plan', field: i, plan: { crop: 'rest', variety: 'katahdin', seed: 'certified' } })
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  for (let guard = 0; !S.seasonDone(c) && guard < 400; guard++) {
    const f = S.fieldInfo(c, 0)
    if (f.status === 'idle' && c.season!.day >= S.dayIndex(1990, 4, 15)) S.apply(world, c, { t: 'job', kind: 'plant', field: 0 })
    if (f.status === 'growing' && f.stage !== 'Growing leaf' && f.daysIn > 95) S.apply(world, c, { t: 'job', kind: 'dig', field: 0 })
    S.apply(world, c, { t: 'day' })
  }
  S.apply(world, c, { t: 'endSeason' })
  const lot = S.openLots(c)[0]
  let sound: Campaign | null = null
  while (c.phase === 'cellar' && !lot.broke) {
    sound = structuredClone(c)
    S.apply(world, c, { t: 'month' })
  }

  it('is accepted the month before the breakdown', () => {
    expect(lot.skin).toBe(0)
    expect(sound).not.toBeNull()
    expect(S.apply(world, sound!, { t: 'seed', lot: lot.id, fields: 1 }).ok).toBe(true)
  })

  it('is refused once the pile has broken down, though enough sound tubers are left, and changes nothing', () => {
    expect(lot.broke).toBe(true)
    expect(c.phase).toBe('cellar')
    expect(lot.grades.b + lot.grades.no1).toBeGreaterThanOrEqual(S.SEED_CWT_PER_FIELD)
    const before = S.hashCampaign(c)
    const r = S.apply(world, c, { t: 'seed', lot: lot.id, fields: 1 })
    expect(r.ok).toBe(false)
    expect(r.err).toMatch(/rot/i)
    expect(S.hashCampaign(c)).toBe(before)
    expect(lot.seedHeld).toBe(0)
  })
})

describe('the yield estimate', () => {
  // Two campaigns that differ only in the hidden tuber weights: every hill half as heavy again or more.
  const a = grow(1995, 11, c => c.season!.day >= S.dayIndex(1995, 6, 20), ['sample', 'kill', 'dig'])
  const b = structuredClone(a)
  for (const f of b.season!.fields) f.hMass = f.hMass.map((m, i) => m * (1.5 + (i % 5) / 10))
  const growing = FIELDS.filter(i => S.fieldInfo(a, i).estimate !== null)
  const same = () => {
    for (const i of growing) {
      expect(S.fieldInfo(b, i).estimate, `field ${i}`).toEqual(S.fieldInfo(a, i).estimate)
      expect(S.fieldInfo(b, i).tubers, `field ${i}`).toEqual(S.fieldInfo(a, i).tubers)
    }
  }

  it('without test digs is the same whatever the tubers underground weigh', () => {
    expect(growing.length).toBeGreaterThan(1)
    expect(growing.every(i => S.fieldInfo(a, i).estimate!.digs === 0)).toBe(true)
    same()
    for (let d = 0; d < 20; d++) { S.apply(world, a, { t: 'day' }); S.apply(world, b, { t: 'day' }) }
    expect(growing.every(i => S.fieldInfo(a, i).estimate !== null)).toBe(true)
    same()
  })

  it('moves toward the real tubers once a hill is lifted', () => {
    const i = growing[0]
    for (const c of [a, b]) expect(S.apply(world, c, { t: 'job', kind: 'sample', field: i }).ok).toBe(true)
    for (let d = 0; d < 3 && S.fieldInfo(a, i).estimate!.digs === 0; d++) { S.apply(world, a, { t: 'day' }); S.apply(world, b, { t: 'day' }) }
    expect(S.fieldInfo(a, i).estimate!.digs).toBe(1)
    expect(S.fieldInfo(b, i).estimate!.mean).toBeGreaterThan(S.fieldInfo(a, i).estimate!.mean)
  })
})

describe('the rain forecast', () => {
  it('is sometimes wrong both ways in every playable year, whatever amount it shows', () => {
    for (const y of world.weather.playable) {
      let missed = 0, falseAlarm = 0, heavyFalseAlarm = 0
      for (let d = S.dayIndex(y, S.SEASON_START.month, S.SEASON_START.dom); d <= S.dayIndex(y, S.SEASON_LAST.month, S.SEASON_LAST.dom); d++) {
        const wet = S.getDay(world, y, d).prcp >= 1
        for (let lead = 1; lead <= 5; lead++) {
          const f = S.forecastFor(world, 12345, y, d, lead)
          if (f.rainMm === 0 && wet) missed++
          if (f.rainMm > 0 && !wet) { falseAlarm++; if (f.rainMm >= 3) heavyFalseAlarm++ }
        }
      }
      expect(missed, `${y}: a dry forecast followed by rain`).toBeGreaterThan(0)
      expect(falseAlarm, `${y}: a wet forecast followed by a dry day`).toBeGreaterThan(0)
      expect(heavyFalseAlarm, `${y}: 3 mm or more forecast for a dry day`).toBeGreaterThan(0)
    }
  })
})

describe('watering', () => {
  it('is refused on ground that is already wet', () => {
    const wetField = (c: Campaign) => FIELDS.find(i => S.fieldInfo(c, i).status === 'growing' && S.fieldInfo(c, i).tooWet) ?? -1
    const c = grow(2011, 2, c => c.season!.day >= S.dayIndex(2011, 6, 1) && wetField(c) >= 0, ['water', 'kill', 'dig'])
    const i = wetField(c)
    const before = S.hashCampaign(c)
    const r = S.apply(world, c, { t: 'job', kind: 'water', field: i })
    expect(r.ok).toBe(false)
    expect(r.err).toBe('The ground is already wet.')
    expect(S.hashCampaign(c)).toBe(before)
    expect(S.fieldActions(world, c, i).find(a => a.kind === 'water')!.ok).toBe(false)
  })
})

describe('a potato field that was never planted', () => {
  it('counts as a year out of potatoes, like a rest', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    // The home six, then the land the farm does not hold, which keeps a rest-year placeholder.
    expect(c.plans.map(p => p.crop)).toEqual(['potato', 'rest', 'potato', 'rest', 'potato', 'potato', ...Array.from({ length: S.FIELD_COUNT - 6 }, () => 'rest')])
    const before = structuredClone(c.fields)
    expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
    expect(S.apply(world, c, { t: 'job', kind: 'plant', field: 0 }).ok).toBe(true)
    for (let d = 0; d < 30 && S.fieldInfo(c, 0).status === 'idle'; d++) S.apply(world, c, { t: 'day' })
    expect(S.fieldInfo(c, 0).status).not.toBe('idle')
    expect(S.fieldInfo(c, 2).status).toBe('idle')
    expect(S.apply(world, c, { t: 'endSeason' }).ok).toBe(true)
    for (let m = 0; m < 10 && c.phase === 'cellar'; m++) S.apply(world, c, { t: 'month' })
    expect(c.phase).toBe('ledger')
    const odds = (v: number) => v / (1 - v)
    // Planted: a potato year.
    expect(c.fields[0].streak).toBe(before[0].streak + 1)
    expect(c.fields[0].soil).toBe(Math.max(0, before[0].soil + S.SOIL_AFTER_POTATO))
    expect(odds(c.fields[0].vert)).toBeCloseTo(odds(before[0].vert) * S.VERT_GROW, 9)
    // Unplanted potato fields, and the rested ones: a year out.
    for (const i of [1, 2, 3, 4, 5]) {
      expect(c.fields[i].streak, `field ${i}`).toBe(0)
      expect(c.fields[i].soil, `field ${i}`).toBe(1)
      expect(odds(c.fields[i].vert), `field ${i}`).toBeCloseTo(Math.max(odds(0.01), odds(before[i].vert) * S.VERT_REST), 9)
    }
    // Land the farm did not hold is not the farm's to rest: its record does not move.
    expect(c.fields.slice(6)).toEqual(before.slice(6))
    expect(c.history[0].restIncome).toBe(2 * S.REST_INCOME)
  })
})
