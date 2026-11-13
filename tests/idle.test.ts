// Round six, u1/034: both people idle in the harvest with three jobs on the work list. They were rightly waiting: the
// ground was too wet to dig, the haul waited for the digger, and the hired hand is set never to do machine work.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const record = loadWorld()

// A farm of its own (seed 1) with the farmer and the first applicant hired, set never to do machine work, left to its
// routine, to the first morning of the harvest when the ground is too wet to dig.
function wetHarvest(): { world: S.World; c: S.Campaign } {
  const world = S.climateWorld(record, 1)
  const c = S.createCampaign(world, { seed: 1, startYear: S.FARM_YEAR0 + 1 })
  expect(S.apply(world, c, { t: 'hire', applicant: c.applicants[0].id }).ok).toBe(true)
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  const lucien = c.crew.find(u => u.id !== 0)!
  expect(S.apply(world, c, { t: 'priority', unit: lucien.id, work: 'machine', level: 0 }).ok).toBe(true)
  for (let g = 0; g < 400; g++) {
    c.incidents = []
    const s = c.season!
    if (s.day >= S.dayIndex(s.year, 9, 1) && s.jobs.some(j => j.kind === 'dig') && c.crew.every(u => u.job < 0) && Object.values(S.jobWaits(world, c)).every(w => w)) break
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
  }
  return { world, c }
}

describe('idle with work on the list', () => {
  it('is waiting the weather out: nobody who could take a job was free to, and every order says why it waits', () => {
    const { world, c } = wetHarvest()
    const s = c.season!
    expect(s.jobs.filter(j => j.kind === 'dig').length).toBeGreaterThan(0)
    const waits = S.jobWaits(world, c)
    const outlook = S.jobOutlook(world, c)
    for (const j of s.jobs) {
      const o = outlook.find(x => x.id === j.id)!
      expect(o.when, `${j.kind} ${j.field}`).toBe('waiting')
      expect(o.why).toMatch(/^Waiting (because|for)/)
      expect(waits[j.id]).not.toBe('')
    }
    // The hand never does machine work, so the dig and the haul are the farmer's alone.
    const hand = c.crew.find(u => u.id !== 0)!
    for (const j of s.jobs) expect(S.willDo(hand, j.kind)).toBe(false)
    // The day passes with nobody on those jobs, and nobody who could have done one stood idle with it free to do.
    const day = s.day
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    expect(s.day).toBe(day + 1)
    const worked = new Set(s.worked.map(w => w.unit))
    for (const j of s.jobs) {
      if (s.worked.some(w => w.kind === j.kind && w.field === j.field)) continue
      for (const u of c.crew) if (!worked.has(u.id) && S.willDo(u, j.kind) && !waits[j.id]) throw new Error(`${u.name} could have taken ${j.kind} ${j.field}`)
    }
  })
})
