// A job nobody takes: what stops each person, and each way to get it done (src/sim/remedies.ts). The ways listed are
// exactly those that get the job done, and each does when pressed.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { SUNDAY, weekday } from '../src/sim/calendar.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

// The fixed farm (with a hired field hand, or the farmer alone) in blight weather, spraying left to the player, to a
// morning a field wants spraying and the day allows it: a working day, or (sunday) a Sunday off.
function sprayMorning(hand: boolean, sunday = false): { c: S.Campaign; field: number } {
  const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
  if (hand) S.apply(world, c, { t: 'hire', kind: 'hand' })
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  S.apply(world, c, { t: 'sprayWay', way: 'ask' })
  for (let g = 0; g < 400 && !S.seasonDone(c); g++) {
    c.incidents = []
    const s = c.season!
    const field = S.fieldNeeds(world, c).findIndex(n => n.need?.act === 'spray')
    const d = S.getDay(world, s.year, s.day)
    if (field >= 0 && !S.jobWait('spray', s.fields[field], d) && (weekday(s.year, s.day) === SUNDAY) === sunday && s.frostHaul !== s.day) {
      expect(S.apply(world, c, { t: 'job', kind: 'spray', field }).ok).toBe(true)
      for (const j of [...s.jobs]) if (j.kind !== 'spray' || j.field !== field) S.apply(world, c, { t: 'cancel', id: j.id })
      return { c, field }
    }
    for (const a of S.advise(world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && a.act !== 'spray' && a.field >= 0) S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
  }
  throw new Error('no spraying morning')
}

// Whether a day's work, after the remedy's presses, gets the spray done.
function gets(c: S.Campaign, field: number, cmds: S.Cmd[]): boolean {
  const x = structuredClone(c)
  for (const cmd of cmds) { const r = S.apply(world, x, cmd); if (!r.ok) throw new Error(`${cmd.t}: ${r.err}`) }
  S.apply(world, x, { t: 'day' })
  return x.season!.worked.some(w => w.kind === 'spray' && w.field === field)
}

function check(c: S.Campaign, field: number, ids: string[]): void {
  // nobody takes it as things stand
  expect(gets(c, field, [])).toBe(false)
  const list = S.remedies(c, 'spray', field)
  expect(list.map(m => m.unit >= 0 ? `${m.id} ${m.unit}` : m.id)).toEqual(ids)
  for (const m of list) {
    if (m.id === 'wait') expect(m.cmds).toEqual([])
    else expect(gets(c, field, m.cmds), `${m.label} (${m.cost})`).toBe(true)
  }
}

describe('what would get a waiting job done', () => {
  it('the farmer worn out and a hand set never to drive: push on, let the hand drive, hire an operator, or wait', () => {
    const { c, field } = sprayMorning(true)
    c.crew[0].tired = 0.97
    const hand = c.crew.find(u => u.kind === 'hand')!
    expect(S.heldUpBy(c, 'spray')).toBe(`You're resting, worn out and ${hand.name.split(' ')[0]} is set never to drive.`)
    check(c, field, ['push 0', `let ${hand.id}`, 'hire', 'wait'])
  })

  it('a Sunday off with everyone able: work Sundays, or wait', () => {
    const { c, field } = sprayMorning(true, true)
    expect(S.workday(c, c.season!)).toBe(false)
    check(c, field, ['sunday', 'wait'])
  })

  it('nobody hired and the farmer worn out: push on, hire an operator, or wait', () => {
    const { c, field } = sprayMorning(false)
    c.crew[0].tired = 0.97
    check(c, field, ['push 0', 'hire', 'wait'])
  })

  it('someone able to do it on a working day: it waits only for the tractor, and nothing else is offered', () => {
    const { c, field } = sprayMorning(true)
    expect(S.remedies(c, 'spray', field).map(m => m.label)).toEqual(['Wait for the tractor'])
    // a tractor broken down: it waits for the repair
    c.broken = [c.season!.day + 3]
    expect(S.remedies(c, 'spray', field).map(m => [m.label, m.cost])).toEqual([['Wait for the tractor', `back on ${S.formatDay(c.season!.year, c.season!.day + 3, true)}`]])
  })
})
