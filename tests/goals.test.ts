import { describe, expect, it } from 'vitest'
import { goals, nextGoal } from '../src/game/goals.ts'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

describe('the ladder of goals', () => {
  it('starts at planting and moves on as the farm does', () => {
    const record = loadWorld()
    const seed = 99
    const w = S.climateWorld(record, seed)
    const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
    expect(nextGoal(c)?.id).toBe('plant')
    expect(goals(c).every(g => g.title.length > 0 && g.how.length > 0)).toBe(true)
    expect(goals(c).filter(g => g.done)).toEqual([])
    S.apply(w, c, { t: 'begin' })
    for (let n = 0; n < 300 && c.phase === 'season' && !S.seasonDone(c); n++) {
      for (const a of S.advise(w, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
      S.apply(w, c, { t: 'day' })
      if (c.season!.fields.some(f => f.plantDay >= 0)) expect(goals(c).find(g => g.id === 'plant')!.done).toBe(true)
    }
    expect(goals(c).find(g => g.id === 'dig')!.done).toBe(true)
    expect(nextGoal(c)?.id).toBe('year')
    // Help is hired in spring or while the season runs.
    const d = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
    expect(S.apply(w, d, { t: 'hire', kind: 'hand' }).ok).toBe(true)
    expect(goals(d).find(g => g.id === 'hire')!.done).toBe(true)
  })
})
