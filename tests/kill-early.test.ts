import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { killEarly, KILL_WARN_CWT } from '../src/ui/rules.ts'

const record = loadWorld()

// A season played the way the coach would, killing nothing, until a field is a week short of its due kill.
function weekBefore(seed: number): { w: S.World; c: S.Campaign; field: number } | null {
  const w = S.climateWorld(record, seed)
  const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
  S.apply(w, c, { t: 'begin' })
  S.apply(w, c, { t: 'routine', kind: 'kill', auto: false })
  for (let n = 0; n < 400 && c.phase === 'season' && !S.seasonDone(c); n++) {
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const k = S.killCostToday(w, c, i)
      if (k && k.days === 7 && k.cwtPerAcre >= KILL_WARN_CWT) return { w, c, field: i }
    }
    for (const a of S.advise(w, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && a.act !== 'kill') S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
    S.apply(w, c, { t: 'day' })
  }
  return null
}

describe('the Kill vines warning', () => {
  it("says killCostToday's own figure and the due date, a week early", () => {
    let seen = 0
    for (let seed = 1; seed <= 3; seed++) {
      const at = weekBefore(seed)
      if (!at) continue
      seen++
      const cost = S.killCostToday(at.w, at.c, at.field)!
      const k = killEarly(at.w, at.c, [at.field])!
      expect(k.cost).toEqual(cost)
      expect(k.short).toBe('7 days early')
      expect(k.why).toContain(`killing the vines 7 days early gives up about ${cost.cwtPerAcre} cwt/acre.`)
      expect(k.why).toMatch(/(Your crew will do it|It's due) on [A-Z][a-z]+ \d+\.$/)
      expect(k.did).toBe(`You're killing the vines 7 days early, which gives up about ${cost.cwtPerAcre} cwt/acre.`)
      console.log(`seed ${seed}: ${k.why}`)
      // Several fields: the worst one is named.
      const all = [...Array(S.FIELD_COUNT).keys()]
      const worst = killEarly(at.w, at.c, all)!
      expect(worst.cost.cwtPerAcre).toBe(Math.max(...all.map(i => S.killCostToday(at.w, at.c, i)?.cwtPerAcre ?? 0)))
      expect(worst.why).toContain(`in ${S.FIELD_NAMES[worst.field]} `)
    }
    expect(seen, 'a field a week short of its kill').toBeGreaterThan(0)
  })

  it('says nothing once the kill is due', () => {
    const at = weekBefore(1)!
    for (let d = 0; d < 7; d++) S.apply(at.w, at.c, { t: 'day' })
    const cost = S.killCostToday(at.w, at.c, at.field)
    expect(cost === null || cost.cwtPerAcre < KILL_WARN_CWT).toBe(true)
    expect(killEarly(at.w, at.c, [at.field])).toBeNull()
  })
})
