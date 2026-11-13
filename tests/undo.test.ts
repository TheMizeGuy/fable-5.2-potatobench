// What this spring's plan bought or hired can be taken back in full until the season starts.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

function spring(): S.Campaign {
  const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
  c.cash += 40000
  return c
}

const ok = (c: S.Campaign, cmd: S.Cmd) => { const r = S.apply(world, c, cmd); expect(r.ok, r.err).toBe(true); return r }

describe('undo in the spring plan', () => {
  it('a purchase undone gives back the exact cash and leaves the farm as it was', () => {
    const c = spring()
    const before = structuredClone(c)
    const r = ok(c, { t: 'buy', upgrade: 'house2' })
    expect(r.events[0].text).toMatch(/You can undo this until the season starts\./)
    expect(c.cash).toBe(before.cash - S.UPGRADES.house2.cost)
    ok(c, { t: 'unbuy', upgrade: 'house2' })
    expect(c.cash).toBe(before.cash)
    expect(c.yearCosts).toBe(before.yearCosts)
    expect(c.upgrades).toEqual(before.upgrades)
    expect(c.buildings).toEqual(before.buildings)
    expect(S.moneyLook(world, c)).toEqual(S.moneyLook(world, before))
  })

  it('a hire undone puts the applicant back and takes their wages out of the money figure exactly', () => {
    const c = spring()
    const before = structuredClone(c)
    const money = S.moneyLook(world, c)
    const a = c.applicants[0]
    ok(c, { t: 'hire', applicant: a.id })
    const unit = c.crew[c.crew.length - 1].id
    expect(S.moneyLook(world, c)).not.toEqual(money)
    ok(c, { t: 'unhire', unit })
    expect(c.crew.map(u => u.id)).toEqual(before.crew.map(u => u.id))
    expect(c.applicants.map(x => x.id).sort()).toEqual(before.applicants.map(x => x.id).sort())
    expect(c.cash).toBe(before.cash)
    expect(S.moneyLook(world, c)).toEqual(money)
  })

  it('cannot be done once the season has started, nor for what was not bought or hired this spring', () => {
    const c = spring()
    ok(c, { t: 'buy', upgrade: 'truck' })
    ok(c, { t: 'hire', kind: 'hand' })
    const unit = c.crew[c.crew.length - 1].id
    expect(S.apply(world, c, { t: 'unbuy', upgrade: 'tractor2' }).ok).toBe(false)
    ok(c, { t: 'begin' })
    expect(c.spring).toBeUndefined()
    expect(S.apply(world, c, { t: 'unbuy', upgrade: 'truck' }).err).toMatch(/only be undone in spring/)
    expect(S.apply(world, c, { t: 'unhire', unit }).err).toMatch(/only be undone in spring/)
  })
})
