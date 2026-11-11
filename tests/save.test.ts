import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { migrate, parseSave, serialize } from '../src/game/save.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { REPLAY, runReplay } from './replay.ts'

const world = loadWorld()
// A real version 1 save, written in the spring of a campaign's second year. It must keep loading.
const V1 = readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8')

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
