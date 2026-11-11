import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { migrate, parseSave, serialize } from '../src/game/save.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { REPLAY, runReplay } from './replay.ts'

const world = loadWorld()
// A real version 1 save, written in the spring of a campaign's second year. It must keep loading.
const V1 = readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8')

type Raw = Record<string, unknown> & {
  fields: Record<string, unknown>[]; plans: unknown[]; upgrades: Record<string, unknown>; history: Record<string, unknown>[]
  season: { fields: Record<string, unknown>[]; jobs: Record<string, unknown>[]; worked: Record<string, unknown>[]; workLeft?: number } | null
}

// A campaign as a version 2 build saved it: the home six only, one farmer, and none of what version 3 added.
// Only for a campaign that has used none of it.
function toV2(c: S.Campaign): Raw {
  expect(c.fields.slice(S.HOME_FIELDS).every(f => f.tenure === 'none')).toBe(true)
  expect(c.crew.length).toBe(1)
  expect(c.contracts).toEqual([])
  const o = JSON.parse(JSON.stringify(c)) as Raw
  o.v = 2
  o.fields = o.fields.slice(0, S.HOME_FIELDS)
  for (const f of o.fields) delete f.tenure
  o.plans = o.plans.slice(0, S.HOME_FIELDS)
  delete o.upgrades.tractor2
  delete o.upgrades.house2
  for (const k of ['crew', 'nextUnit', 'offers', 'contracts', 'yearWages', 'yearRent', 'yearLand', 'yearContracts', 'yearPenalties']) delete o[k]
  for (const h of o.history) for (const k of ['wages', 'rent', 'land', 'penalties', 'contracts']) delete h[k]
  if (o.season) {
    o.season.fields = o.season.fields.slice(0, S.HOME_FIELDS)
    o.season.workLeft = 0.4
    for (const j of o.season.jobs) { expect(j.unit).toBe(-1); delete j.unit }
    for (const w of o.season.worked) delete w.unit
  }
  return o
}

// What every migrated campaign must have from version 3.
function expectV3(c: S.Campaign): void {
  expect(c.v).toBe(S.SAVE_VERSION)
  expect(c.fields.length).toBe(S.FIELD_COUNT)
  expect(c.plans.length).toBe(S.FIELD_COUNT)
  expect(c.fields.map(f => f.tenure)).toEqual(S.PARCELS.map((_, i) => i < S.HOME_FIELDS ? 'owned' : 'none'))
  for (let i = S.HOME_FIELDS; i < S.FIELD_COUNT; i++) {
    expect(c.fields[i]).toEqual({ elev: S.PARCELS[i].elev, soil: 1, vert: S.PARCELS[i].vert, streak: 0, tenure: 'none' })
    expect(c.plans[i].crop).toBe('rest')
    expect(S.fieldInfo(c, i).status).toBe('off')
  }
  expect(c.crew).toEqual([{ id: 0, kind: 'farmer', name: S.FARMER_NAME, at: -1, wage: 0, job: -1, to: -1, road: 0, paidTo: 0 }])
  expect([c.nextUnit, c.offers, c.contracts]).toEqual([1, [], []])
  expect([c.upgrades.tractor2, c.upgrades.house2]).toEqual([false, false])
  expect([c.yearWages, c.yearRent, c.yearLand, c.yearContracts, c.yearPenalties]).toEqual([0, 0, 0, 0, 0])
  for (const h of c.history) expect([h.wages, h.rent, h.land, h.penalties, h.contracts]).toEqual([0, 0, 0, 0, 0])
  if (c.season) {
    expect(c.season.fields.length).toBe(S.FIELD_COUNT)
    expect(c.season.fields.slice(S.HOME_FIELDS).every(f => f.status === 'off' && f.hState.length === 0)).toBe(true)
    expect('workLeft' in c.season).toBe(false)
    for (const j of c.season.jobs) expect(j.unit).toBe(-1)
    for (const w of c.season.worked) expect(w.unit).toBe(0)
  }
}

describe('migrate', () => {
  it('rejects anything that is not a campaign', () => {
    for (const bad of [null, undefined, 0, 42, 'save', true, [], {}, { v: '1' }, { v: 1 }, { v: 1, fields: [], plans: [], year: '1987', phase: 'plan' },
      { v: 1, fields: {}, plans: [], year: 1987, phase: 'plan' }, { v: 1, fields: [], plans: null, year: 1987, phase: 'plan' }, { v: 1, fields: [], plans: [], year: 1987, phase: 3 }]) {
      expect(migrate(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('rejects versions before the first and after the current one', () => {
    // Versions as a save file can carry them: JSON has no NaN, and 1e999 parses to Infinity.
    const body = JSON.stringify(JSON.parse(V1).campaign)
    for (const v of ['0', '-1', '0.5', String(S.SAVE_VERSION + 1), String(S.SAVE_VERSION + 0.5), '99', '1e999', '-1e999']) {
      const c = JSON.parse(body.replace(/^\{"v":1,/, `{"v":${v},`))
      expect(c.v).not.toBe(1)
      expect(migrate(c), v).toBeNull()
    }
  })

  it('accepts the current version as it is', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    expect(migrate(JSON.parse(JSON.stringify(c)))).toEqual(c)
  })
})

describe('parseSave', () => {
  it('rejects malformed text', () => {
    for (const text of ['', '{', 'null', '42', '"save"', '[]', '{}', '{"v":1}', '{"campaign":null}', '{"campaign":{"v":1}}']) {
      expect(parseSave(text), text).toBeNull()
    }
  })

  it('rejects a save from a future version', () => {
    const file = JSON.parse(V1)
    file.v = S.SAVE_VERSION + 1
    file.campaign.v = S.SAVE_VERSION + 1
    expect(parseSave(JSON.stringify(file))).toBeNull()
  })

  it('loads a version 1 save and plays on from it', () => {
    const file = parseSave(V1)
    expect(file).not.toBeNull()
    const c = file!.campaign
    expect(c.v).toBe(S.SAVE_VERSION)
    expect(file!.savedAt).toBe(1762819200000)
    expect(c.phase).toBe('plan')
    expect(c.history.length).toBe(1)
    expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
    for (let d = 0; d < 120; d++) expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    expect(Number.isFinite(c.cash)).toBe(true)
  })

  it('migrates the version 1 save: the fields versions 2 and 3 added are there, and a whole year plays on from it', () => {
    const c = parseSave(V1)!.campaign
    expect(JSON.parse(V1).campaign.yearRest).toBeUndefined()
    expect([c.yearRest, c.yearStorage]).toEqual([0, 0])
    for (const h of c.history) expect([h.restIncome, h.storage]).toEqual([0, 0])
    expectV3(c)
    expect(c.fields.slice(0, S.HOME_FIELDS)).toEqual(JSON.parse(V1).campaign.fields.map((f: object) => ({ ...f, tenure: 'owned' })))
    expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
    for (let guard = 0; c.phase === 'season' && guard < 400; guard++) {
      for (const a of S.advise(world, c)) {
        if (a.act === 'sell') S.apply(world, c, { t: 'sell', lot: a.lot, frac: 1 })
        else if (a.act !== 'wait' && a.act !== 'close') S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
      }
      S.apply(world, c, S.seasonDone(c) ? { t: 'endSeason' } : { t: 'day' })
    }
    for (let m = 0; m < 10 && c.phase === 'cellar'; m++) S.apply(world, c, { t: 'month' })
    expect(c.phase).toBe('ledger')
    expect(c.history.length).toBe(2)
    const h = c.history[1]
    expect(h.restIncome).toBe(2 * S.REST_INCOME)
    expect(h.storage).toBeGreaterThan(0)
    expect(c.cash).toBeCloseTo(h.cashStart + h.revenue - h.costs - h.note - h.living - h.interest, 6)
    expect(S.apply(world, c, { t: 'next' }).ok).toBe(true)
  })

  it('migrates a version 1 save made in mid-season and plays the season out', () => {
    const r = runReplay(S, world, { ...REPLAY, plain: true, stopAt: c => c.yearIdx === 1 && c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 7, 1) })
    const v2 = toV2(r.campaign)
    // Back to the version 1 shape: none of the fields version 2 added either.
    v2.v = 1
    delete v2.yearRest
    delete v2.yearStorage
    for (const h of v2.history) { delete h.restIncome; delete h.storage }
    for (const f of v2.season!.fields) for (const k of ['eye', 'seedBlight', 'frostDay', 'frostShare', 'rimeDay']) delete f[k]
    const c = parseSave(JSON.stringify({ v: 1, savedAt: 7, campaign: v2 }))!.campaign
    expect(c.v).toBe(S.SAVE_VERSION)
    expect([c.yearRest, c.yearStorage]).toEqual([0, 0])
    for (const h of c.history) expect([h.restIncome, h.storage]).toEqual([0, 0])
    for (const f of c.season!.fields.slice(0, S.HOME_FIELDS)) {
      expect(f.eye).toBe(f.hMass.reduce((a, b) => a + b, 0))
      expect([f.seedBlight, f.frostDay, f.frostShare, f.rimeDay, f.samples, f.sampleN]).toEqual([0, -1, 0, -1, [], []])
    }
    expectV3(c)
    const growing = [0, 1, 2, 3, 4, 5].filter(i => S.fieldInfo(c, i).estimate)
    expect(growing.length).toBeGreaterThan(0)
    for (const i of growing) expect(Number.isFinite(S.fieldInfo(c, i).estimate!.mean)).toBe(true)
    const rest = runReplay(S, world, { campaign: c })
    expect(rest.done).toBe(true)
    expect(rest.campaign.history.length).toBe(5)
    for (const h of rest.campaign.history) expect(Number.isFinite(h.cashEnd)).toBe(true)
  })

  it('migrates a version 2 save made in mid-season, keeps the crop as it was, and plays on with the new land and crews', () => {
    const r = runReplay(S, world, { ...REPLAY, plain: true, stopAt: c => c.yearIdx === 1 && c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 6, 20) && c.season!.jobs.length > 0 })
    const v2 = toV2(r.campaign)
    expect(v2.season!.worked.length).toBeGreaterThan(0)
    const file = parseSave(JSON.stringify({ v: 2, savedAt: 9, campaign: v2 }))
    expect(file).not.toBeNull()
    const c = file!.campaign
    expectV3(c)
    expect(file!.savedAt).toBe(9)
    // Everything the version 2 save held is as it was.
    expect(c.season!.fields.slice(0, S.HOME_FIELDS)).toEqual(r.campaign.season!.fields.slice(0, S.HOME_FIELDS))
    expect(c.season!.jobs).toEqual(r.campaign.season!.jobs)
    expect([c.cash, c.lots, c.history, c.seedStock, c.rng]).toEqual([r.campaign.cash, r.campaign.lots, r.campaign.history, r.campaign.seedStock, r.campaign.rng])
    // It plays on: the season, then a spring with the new land, crews and contracts on offer.
    for (let d = 0; d < 20; d++) expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    expect(S.apply(world, c, { t: 'hire', kind: 'hand' }).ok).toBe(true)
    const rest = runReplay(S, world, { campaign: c, stopAt: x => x.yearIdx === 2 && x.phase === 'plan' })
    expect(rest.done).toBe(false)
    expect(rest.campaign.offers.length).toBe(S.CONTRACT_OFFERS)
    expect(S.apply(world, rest.campaign, { t: 'rent', field: 7 }).ok).toBe(true)
    const done = runReplay(S, world, { campaign: rest.campaign })
    expect(done.done).toBe(true)
    expect(done.campaign.history.length).toBe(5)
    for (const h of done.campaign.history) expect(Number.isFinite(h.cashEnd)).toBe(true)
  })

  it('round-trips a campaign in every phase exactly', () => {
    const at = [
      (c: S.Campaign) => c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 7, 20),
      (c: S.Campaign) => c.phase === 'cellar' && c.month === 2,
      (c: S.Campaign) => c.phase === 'ledger',
      (c: S.Campaign) => c.yearIdx === 1 && c.phase === 'plan',
    ]
    for (const stopAt of at) {
      const r = runReplay(S, world, { ...REPLAY, stopAt })
      expect(r.done).toBe(false)
      const back = parseSave(serialize(r.campaign, 5))!
      expect(back.savedAt).toBe(5)
      expect(back.campaign).toEqual(r.campaign)
      expect(S.hashCampaign(back.campaign)).toBe(r.hash)
    }
  })
})
