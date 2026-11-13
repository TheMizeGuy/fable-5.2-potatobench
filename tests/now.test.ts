// One account of what a person is doing now: the time book's word and the card's line come from the same state, and a
// word for work at a field is said only of someone who is there.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { JOB_DOING } from '../src/ui/rules.ts'
import { personNow } from '../src/ui/now.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()
const WORK = new Map(S.JOBS.map(k => [JOB_DOING[k].replace(/ (in|from|around)$/, ''), k]))

describe('what a person is doing now', () => {
  it('agrees with itself for every person on every day of a season, and puts no one at work where they are not', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    c.cash += 30000
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    for (const a of [...c.applicants]) S.apply(world, c, { t: 'hire', applicant: a.id })
    expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
    const seen = new Set<string>()
    for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
      c.incidents = []
      const s = c.season!
      const waits = S.jobWaits(world, c)
      for (const u of c.crew) {
        const n = personNow(c, u.id, waits)
        seen.add(n.word)
        // the card's line is the word and the rest of it, both from the one call
        expect(n.line).toBe(n.rest ? `${n.word} ${n.rest}` : n.word)
        const kind = WORK.get(n.word)
        if (kind && n.word !== 'Next') {
          // working at a field: they are there, not on the road, and the work is on the list
          expect(u.road, `${u.name} on day ${s.day}: ${n.line}`).toBeLessThanOrEqual(0)
          expect(u.at, `${u.name} on day ${s.day}: ${n.line}`).toBe(n.place)
          expect(s.jobs.some(j => j.kind === kind && j.field === n.place)).toBe(true)
        }
        if (n.word === 'Heading') expect(n.rest).toMatch(/^to /)
        if (n.word === 'Idle') expect(s.jobs.some(j => (j.unit < 0 || j.unit === u.id) && S.willDo(u, j.kind) && !c.crew.some(o => o !== u && o.job === j.id))).toBe(false)
      }
      for (const a of S.advise(world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
      expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    }
    // a season shows the person at work, on the way, waiting, idle and on a Sunday
    for (const w of ['Planting', 'Digging', 'Hauling', 'Sunday', 'Idle']) expect([...seen]).toContain(w)
  })
})
