// Vine kill left to the player and not ordered: when it comes due the crew puts it on the work list itself, and one
// line says so and names how many fields, so stamps the player had not pressed are seen to go to the list.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

describe('the crew\'s own vine kill', () => {
  it('is said in one line naming every field it put on the list', () => {
    let seen = 0
    for (const seed of [7, 3, 11]) {
      const c = S.createCampaign(world, { seed, startYear: 1990 })
      expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
      if (S.routineInfo(c).some(r => r.kind === 'kill' && r.auto)) expect(S.apply(world, c, { t: 'routine', kind: 'kill', auto: false }).ok).toBe(true)
      for (let g = 0; g < 400 && !S.seasonDone(c); g++) {
        c.incidents = []
        const s = c.season!
        const had = new Set(s.jobs.filter(j => j.kind === 'kill').map(j => j.field))
        const r = S.apply(world, c, { t: 'day' })
        expect(r.ok).toBe(true)
        for (const e of r.events.filter(x => x.type === 'crewKill')) {
          seen++
          const fields = e.data!.fields as number[]
          expect(fields.length).toBeGreaterThan(0)
          for (const i of fields) expect(had.has(i)).toBe(false)
          expect(e.text).toBe(`Your crew has put the vine kill ${fields.length > 1 ? `in ${fields.length} fields` : `in ${S.FIELD_NAMES[fields[0]]}`} on the work list, so the skins set before the harvest.`)
        }
      }
    }
    expect(seen).toBeGreaterThan(0)
  })
})
