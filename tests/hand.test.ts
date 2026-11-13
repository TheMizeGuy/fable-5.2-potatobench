// A hired field hand at the hiring hall's settings: work enough to be worth his wage through a first summer, a word on
// hiring of what he will do, and a slip when he stands idle while work waits that he is set never to do.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const record = loadWorld()

describe('a hired field hand', () => {
  it('works on at least a fifth of the working days of a first summer, and is told what he will do', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const world = S.climateWorld(record, seed)
      const c = S.createCampaign(world, { seed, startYear: S.FARM_YEAR0 + 1 })
      const hired = S.apply(world, c, { t: 'hire', kind: 'hand' })
      const hand = c.crew[1]
      expect(hired.events[0].text).toMatch(new RegExp(`${hand.name.split(' ')[0]} will scout, pull blighted plants and do test digs, so you can stay on the tractor\\.$`))
      S.apply(world, c, { t: 'begin' })
      let days = 0, worked = 0
      for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
        c.incidents = []
        for (const a of S.advise(world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && a.field >= 0) S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
        const s = c.season!
        const summer = S.workday(c, s) && s.day >= S.dayIndex(s.year, 5, 1) && s.day < S.dayIndex(s.year, 8, 1)
        S.apply(world, c, { t: 'day' })
        if (!summer) continue
        days++
        if (s.worked.some(w => w.unit === hand.id)) worked++
      }
      expect(worked / days, `seed ${seed}: ${worked} of ${days}`).toBeGreaterThanOrEqual(0.2)
    }
  })

  it('idle three working days in a row while a spray waits that he is set never to do: one slip says so, with what would use him', () => {
    const world = record
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    S.apply(world, c, { t: 'hire', kind: 'hand' })
    S.apply(world, c, { t: 'begin' })
    S.apply(world, c, { t: 'sprayWay', way: 'ask' })
    const hand = c.crew[1]
    const said: S.GameEvent[] = []
    for (let g = 0; g < 400 && !S.seasonDone(c) && said.length < 2; g++) {
      c.incidents = []
      const s = c.season!
      // blight weather: the spray waits for the farmer, who is laid up resting; nothing else is on the list
      if (s.watchDay >= 0) {
        c.crew[0].rest = 'now'
        c.crew[0].tired = 0.99
        for (const j of [...s.jobs]) if (j.kind !== 'spray') S.apply(world, c, { t: 'cancel', id: j.id })
        if (!s.jobs.some(j => j.kind === 'spray')) S.apply(world, c, { t: 'job', kind: 'spray', field: 0 })
      }
      const r = S.apply(world, c, { t: 'day' })
      said.push(...r.events.filter(e => e.type === 'idleNever'))
      if (s.day > (s.watchDay >= 0 ? s.watchDay + 30 : Infinity)) break
    }
    expect(said).toHaveLength(1)
    expect(said[0].text).toBe(`${hand.name.split(' ')[0]} has had nothing to do for 3 days. Let ${hand.name.split(' ')[0]} drive?`)
    expect(said[0].data).toMatchObject({ unit: hand.id, work: 'machine' })
  })
})
