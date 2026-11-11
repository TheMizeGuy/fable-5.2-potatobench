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

// What a person gained in version 4.
const PERSON_KEYS = ['skills', 'xp', 'trait', 'tired', 'mood', 'ask', 'prio', 'foreman', 'winter', 'winterField', 'low', 'rig']

// What a field's land record gained in version 5.
const LAND_KEYS = ['cover', 'stones', 'raw', 'felled', 'brushed', 'tiled', 'works']
const V4_PARCELS = 14

// DOWN[n] takes a campaign saved at version n + 1 back to what a version n build saved.
const DOWN: Record<number, (o: Raw) => void> = {
  // Version 5 added the land under the crop, the tracts, materials and the mortgage.
  4: o => {
    o.fields = o.fields.slice(0, V4_PARCELS)
    for (const f of o.fields) for (const k of LAND_KEYS) delete f[k]
    o.plans = o.plans.slice(0, V4_PARCELS)
    for (const k of ['logs', 'stone', 'mortgages', 'yearLogs', 'yearMortgage', 'yearWorks']) delete o[k]
    const noStone = (lots: unknown) => { for (const l of (lots as { loss: Record<string, unknown> }[]) ?? []) delete l.loss.stone }
    noStone(o.lots)
    for (const h of o.history) { for (const k of ['logs', 'mortgage', 'works']) delete h[k]; noStone(h.lots) }
    if (o.season) o.season.fields = o.season.fields.slice(0, V4_PARCELS)
  },
  // Version 4 made the crew people.
  3: o => {
    for (const u of o.crew as Record<string, unknown>[]) for (const k of PERSON_KEYS) delete u[k]
    delete o.applicants
    delete o.sundaysOff
    if (o.season) delete (o.season as Record<string, unknown>).pickers
  },
  // Version 3 added the land beyond the home six, the crew, contracts and their books.
  2: o => {
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
  },
}

// A campaign as a build of version v saved it.
function toV(c: S.Campaign, v: number): Raw {
  const o = JSON.parse(JSON.stringify(c)) as Raw
  for (let n = S.SAVE_VERSION - 1; n >= v; n--) DOWN[n](o)
  o.v = v
  return o
}

// A campaign as a version 2 build saved it: the home six only, one farmer, and none of what version 3 added.
// Only for a campaign that has used none of it.
function toV2(c: S.Campaign): Raw {
  expect(c.fields.slice(S.HOME_FIELDS, V4_PARCELS).every(f => f.tenure === 'none')).toBe(true)
  expect(c.crew.length).toBe(1)
  expect(c.contracts).toEqual([])
  return toV(c, 2)
}

// What every campaign migrated from version 2 or before must have: what versions 3 and on added, as a new game has it.
function expectV3(c: S.Campaign): void {
  const fresh = S.createCampaign(world, { seed: c.seed, startYear: c.year })
  expect(c.v).toBe(S.SAVE_VERSION)
  expect(c.fields.length).toBe(S.FIELD_COUNT)
  expect(c.plans.length).toBe(S.FIELD_COUNT)
  expect(c.fields.map(f => f.tenure)).toEqual(fresh.fields.map(f => f.tenure))
  for (let i = S.HOME_FIELDS; i < S.FIELD_COUNT; i++) {
    expect(c.fields[i]).toEqual(fresh.fields[i])
    expect(c.plans[i].crop).toBe('rest')
    expect(S.fieldInfo(c, i).status).toBe('off')
  }
  for (let i = 0; i < S.HOME_FIELDS; i++) expect([c.fields[i].cover, c.fields[i].stones, c.fields[i].works]).toEqual(['open', S.PARCELS[i].stones, null])
  expect([c.logs, c.stone, c.mortgages, c.yearLogs, c.yearMortgage, c.yearWorks]).toEqual([0, 0, [], 0, 0, 0])
  // The farmer is the farmer of a new game: in the home yard, with the farmer's own skills and everything at priority 2.
  expect(c.crew).toEqual(fresh.crew)
  expect([c.nextUnit, c.offers, c.contracts]).toEqual([1, [], []])
  expect(c.applicants).toEqual(c.phase === 'plan' ? fresh.applicants : [])
  expect(c.sundaysOff).toBe(true)
  expect([c.upgrades.tractor2, c.upgrades.house2]).toEqual([false, false])
  expect([c.yearWages, c.yearRent, c.yearLand, c.yearContracts, c.yearPenalties]).toEqual([0, 0, 0, 0, 0])
  for (const h of c.history) expect([h.wages, h.rent, h.land, h.penalties, h.contracts]).toEqual([0, 0, 0, 0, 0])
  if (c.season) {
    expect(c.season.fields.length).toBe(S.FIELD_COUNT)
    expect(c.season.fields.slice(S.HOME_FIELDS).every(f => f.status === 'off' && f.hState.length === 0)).toBe(true)
    expect('workLeft' in c.season).toBe(false)
    expect(c.season.pickers).toBe(false)
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
    expect(c.fields.slice(0, S.HOME_FIELDS)).toEqual(JSON.parse(V1).campaign.fields.map((f: object, i: number) => ({
      ...f, tenure: 'owned', cover: 'open', stones: S.PARCELS[i].stones, raw: false, felled: 0, brushed: -1, tiled: false, works: null,
    })))
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
    const r = runReplay(S, world, { ...REPLAY, plain: true, stopAt: c => c.yearIdx === 1 && c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 6, 20) && c.season!.jobs.length > 0 && c.season!.worked.length > 0 })
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
    // A version 2 save knew no stone at the dig: what stones bruised comes back as nothing.
    const noStone = <T,>(x: T): T => JSON.parse(JSON.stringify(x), (k, v) => k === 'stone' && typeof v === 'number' ? 0 : v)
    expect([c.cash, c.lots, c.history, c.seedStock, c.rng]).toEqual(noStone([r.campaign.cash, r.campaign.lots, r.campaign.history, r.campaign.seedStock, r.campaign.rng]))
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

  it('migrates a version 3 save made in mid-season: the crew become people as the hiring hall has them, and it plays on', () => {
    const r = runReplay(S, world, { ...REPLAY, stopAt: c => c.yearIdx === 1 && c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 6, 25) && c.crew.length > 1 })
    expect(r.done).toBe(false)
    const v3 = toV(r.campaign, 3)
    expect((v3.crew as Record<string, unknown>[])[1].skills).toBeUndefined()
    const file = parseSave(JSON.stringify({ v: 3, savedAt: 11, campaign: v3 }))
    expect(file).not.toBeNull()
    const c = file!.campaign
    expect(c.v).toBe(S.SAVE_VERSION)
    const [farmer, hand] = c.crew
    expect([farmer.skills, farmer.prio, farmer.trait, farmer.ask]).toEqual([S.FARMER_SKILLS, { machine: 2, field: 2, woods: 2, build: 2, pack: 2 }, '', 0])
    expect([hand.kind, hand.skills, hand.ask, hand.wage, hand.prio.machine, hand.prio.field]).toEqual(['hand', S.HAND_SKILLS, S.HAND_WAGE, S.HAND_WAGE, 0, 1])
    expect(S.TRAIT_LIST).toContain(hand.trait)
    for (const u of c.crew) expect([u.tired, u.mood, u.foreman, u.winter, u.low, u.rig]).toEqual([0, S.MOOD_START, '', 'off', 0, ''])
    expect([c.sundaysOff, c.applicants, c.season!.pickers]).toEqual([true, [], false])
    // The crop, the list and the books are as they were.
    expect(c.season!.fields).toEqual(r.campaign.season!.fields)
    expect(c.season!.jobs).toEqual(r.campaign.season!.jobs)
    expect([c.cash, c.lots, c.rng]).toEqual([r.campaign.cash, r.campaign.lots, r.campaign.rng])
    const done = runReplay(S, world, { campaign: c })
    expect(done.done).toBe(true)
    expect(done.campaign.history.length).toBe(5)
    for (const h of done.campaign.history) expect(Number.isFinite(h.cashEnd)).toBe(true)
  })

  it('migrates a version 4 save made in mid-season: the land gets its stones and the tracts, and it plays on', () => {
    const r = runReplay(S, world, { ...REPLAY, stopAt: c => c.yearIdx === 1 && c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 7, 5) && c.lots.length > 0 })
    expect(r.done).toBe(false)
    const v4 = toV(r.campaign, 4)
    expect(v4.fields.length).toBe(14)
    const c = parseSave(JSON.stringify({ v: 4, savedAt: 12, campaign: v4 }))!.campaign
    expect(c.v).toBe(S.SAVE_VERSION)
    const fresh = S.createCampaign(world, { seed: c.seed, startYear: c.startYear })
    expect(c.fields.length).toBe(S.FIELD_COUNT)
    expect(c.fields.slice(14)).toEqual(fresh.fields.slice(14))
    for (let i = 0; i < 14; i++) {
      expect([c.fields[i].cover, c.fields[i].stones, c.fields[i].raw, c.fields[i].works]).toEqual(['open', S.PARCELS[i].stones, false, null])
      expect([c.fields[i].tenure, c.fields[i].soil, c.fields[i].streak]).toEqual([r.campaign.fields[i].tenure, r.campaign.fields[i].soil, r.campaign.fields[i].streak])
    }
    expect(c.season!.fields.slice(14).every(f => f.status === 'off')).toBe(true)
    expect(c.season!.fields.slice(0, 14)).toEqual(r.campaign.season!.fields.slice(0, 14))
    for (const l of c.lots) expect(l.loss.stone).toBe(0)
    expect([c.logs, c.stone, c.mortgages]).toEqual([0, 0, []])
    const done = runReplay(S, world, { campaign: c })
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
