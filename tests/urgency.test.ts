// Work whose delay loses crop before work that can wait: a tractor operator whose first kind of work is the woods
// kills the vines that are due before felling, unless the felling was pinned to him.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

// The fixed farm with an operator hired, run as reference practice would (vine kill left to the player) to the first
// working day a growing field's kill is advised; then the farmer is kept off machine work and the operator put to the
// woods first, with a felling and the kill both on the list.
function killDue(): { c: S.Campaign; op: S.Unit; field: number; fell: number } {
  const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
  c.cash += 30000
  expect(S.apply(world, c, { t: 'hire', kind: 'operator' }).ok).toBe(true)
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  if (S.routineInfo(c).some(r => r.kind === 'kill' && r.auto)) expect(S.apply(world, c, { t: 'routine', kind: 'kill', auto: false }).ok).toBe(true)
  for (let g = 0; g < 400 && !S.seasonDone(c); g++) {
    c.incidents = []
    const s = c.season!
    const kill = S.advise(world, c).find(a => a.act === 'kill' && s.fields[a.field].deadDay < 0)
    if (kill && S.workday(c, s)) {
      const op = c.crew.find(u => u.kind === 'operator')!
      const tract = S.timberTracts(c)[0]
      expect(tract).toBeDefined()
      const r = S.apply(world, c, { t: 'priority', unit: 0, work: 'machine', level: 0 })
      expect(r.ok, r.err).toBe(true)
      for (const [work, level] of [['woods', 1], ['machine', 2]] as const) {
        const p = S.apply(world, c, { t: 'priority', unit: op.id, work, level })
        expect(p.ok, p.err).toBe(true)
      }
      expect(S.apply(world, c, { t: 'job', kind: 'fell', field: tract }).ok).toBe(true)
      if (!s.jobs.some(j => j.kind === 'kill' && j.field === kill.field)) expect(S.apply(world, c, { t: 'job', kind: 'kill', field: kill.field }).ok).toBe(true)
      return { c, op, field: kill.field, fell: tract }
    }
    for (const a of S.advise(world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && a.act !== 'kill') S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
  }
  throw new Error('no working day with a kill due')
}

describe('urgent work first', () => {
  it('the operator kills the vines that are due before he fells', () => {
    const { c, op, field } = killDue()
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    const his = c.season!.worked.filter(w => w.unit === op.id)
    expect(his.some(w => w.kind === 'kill' && w.field === field)).toBe(true)
    expect(his.some(w => w.kind === 'fell')).toBe(false)
  })

  it('a felling pinned to him is still his to do first', () => {
    const { c, op, fell } = killDue()
    const job = c.season!.jobs.find(j => j.kind === 'fell' && j.field === fell)!
    expect(S.apply(world, c, { t: 'assign', id: job.id, unit: op.id }).ok).toBe(true)
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    expect(c.season!.worked.some(w => w.unit === op.id && w.kind === 'fell')).toBe(true)
  })
})
