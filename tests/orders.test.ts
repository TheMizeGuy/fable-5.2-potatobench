// A person picked, then a right-click on a field: the most useful work there that they can do is theirs, or why not.
import { describe, expect, it } from 'vitest'
import { App, setDays, type AppEvent } from '../src/game/app.ts'

setDays('brisk')
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

// The fixed farm with the three who asked for work in spring taken on, run as reference practice would to a summer day,
// spraying left as the player's call when asked.
function summer(m: number, d: number, ask = true): App {
  const app = new App(loadWorld())
  app.newGame(1990, 7)
  const c = app.campaign!
  c.cash += 30000
  c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
  for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })
  app.do({ t: 'begin' })
  if (ask) app.do({ t: 'sprayWay', way: 'ask' })
  const until = S.dayIndex(c.year, m, d)
  for (let n = 0; n < 400 && c.season!.day < until; n++) {
    for (const a of S.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && !(ask && a.act === 'spray')) app.do({ t: 'job', kind: a.act, field: a.field })
    c.incidents = []
    app.do({ t: 'day' })
  }
  c.incidents = []
  app.setSpeed(0)
  return app
}

const crew = (app: App, kind: S.Unit['kind']) => app.campaign!.crew.find(u => u.kind === kind)!

describe('a right-click with someone picked', () => {
  it('gives them the suggested order there, named to them, and says who is going', () => {
    const app = summer(7, 30)
    const c = app.campaign!
    const field = app.needs().findIndex(n => n.need?.act === 'spray')
    expect(field).toBeGreaterThanOrEqual(0)
    const op = crew(app, 'operator')
    const sent: AppEvent[] = []
    app.on(e => { if (e.type === 'sent') sent.push(e) })
    app.selectUnit(op.id, 'land')
    const r = app.orderAt(field)
    expect(r.ok, r.err).toBe(true)
    expect(c.season!.jobs.find(j => j.field === field && j.kind === 'spray')?.unit).toBe(op.id)
    expect(sent).toEqual([{ type: 'sent', field, kind: 'spray', unit: op.id }])
  })

  it('sends them to the work the routine sees to, when there is no order to suggest', () => {
    const app = summer(6, 30, false)
    const c = app.campaign!
    const field = app.needs().findIndex(n => !n.need && !!n.hold && /don't need to order/.test(n.hold.why))
    expect(field).toBeGreaterThanOrEqual(0)
    const hand = crew(app, 'hand')
    app.selectUnit(hand.id, 'land')
    const r = app.orderAt(field)
    expect(r.ok, r.err).toBe(true)
    expect(c.season!.jobs.some(j => j.field === field && j.unit === hand.id)).toBe(true)
  })

  it('says why in one sentence when they cannot do the work there, and gives no order', () => {
    const app = summer(7, 30)
    const c = app.campaign!
    const field = app.needs().findIndex(n => n.need?.act === 'spray')
    const hand = crew(app, 'hand')
    // Set to never do machine work, nor anything else there.
    for (const work of ['machine', 'field'] as const) app.do({ t: 'priority', unit: hand.id, work, level: 0 })
    const before = c.season!.jobs.length
    app.selectUnit(hand.id, 'land')
    const r = app.orderAt(field)
    expect(r.ok).toBe(false)
    expect(r.err).toMatch(/machine work/)
    expect(c.season!.jobs.length).toBe(before)
  })

  it('a resting field has nothing for them; a field someone else has says who', () => {
    const app = summer(7, 30)
    const c = app.campaign!
    const resting = c.season!.fields.findIndex(f => f.status === 'rest')
    const field = app.needs().findIndex(n => n.need?.act === 'spray')
    const [a, b] = c.crew.filter(u => u.kind === 'operator')
    app.selectUnit(a.id, 'land')
    expect(app.orderAt(resting)).toEqual({ field: resting, ok: false, err: 'Nothing needs doing here right now.' })
    while (app.orderAt(field).ok) { /* everything there is theirs */ }
    app.selectUnit(b.id, 'land')
    const r = app.orderAt(field)
    expect(r.ok).toBe(false)
    expect(r.err).toBe(`${a.name.split(' ')[0]} already has this field's work on the work list.`)
  })
})

describe('a right-click with nobody picked', () => {
  it('orders the field\'s own work, or says why not and how to send someone', () => {
    const app = summer(7, 30)
    const c = app.campaign!
    const resting = c.season!.fields.findIndex(f => f.status === 'rest')
    const field = app.needs().findIndex(n => n.need?.act === 'spray')
    expect(app.unit).toBe(-1)
    expect(app.orderAt(resting)).toEqual({ field: resting, ok: false, err: 'Nothing needs doing here right now. To send someone here, select them first.' })
    expect(app.orderAt(field).ok).toBe(true)
    expect(c.season!.jobs.some(j => j.field === field && j.kind === 'spray')).toBe(true)
  })
})

describe('a stamp pressed', () => {
  it('is the field\'s order: the person picked takes it when they can, and whoever can when they cannot', () => {
    const app = summer(7, 30)
    const c = app.campaign!
    const [one, two] = app.needs().map((n, i) => n.need?.act === 'spray' ? i : -1).filter(i => i >= 0)
    const hand = crew(app, 'hand')
    const op = crew(app, 'operator')
    for (const work of ['machine', 'field'] as const) app.do({ t: 'priority', unit: hand.id, work, level: 0 })
    const sent: AppEvent[] = []
    app.on(e => { if (e.type === 'sent') sent.push(e) })
    // The hand never does machine work: the spray goes on the list for anyone, and the answer says why.
    app.selectUnit(hand.id, 'land')
    expect(app.smartOrder(one).ok).toBe(true)
    expect(c.season!.jobs.find(j => j.field === one && j.kind === 'spray')?.unit).toBe(-1)
    expect(sent.at(-1)).toEqual({ type: 'sent', field: one, kind: 'spray', unit: -1, instead: hand.id })
    // An operator picked takes it themselves.
    app.selectUnit(op.id, 'land')
    expect(app.smartOrder(two).ok).toBe(true)
    expect(c.season!.jobs.find(j => j.field === two && j.kind === 'spray')?.unit).toBe(op.id)
    expect(sent.at(-1)).toEqual({ type: 'sent', field: two, kind: 'spray', unit: op.id })
  })

  it('with nobody picked goes on the list for anyone and is answered', () => {
    const app = summer(7, 30)
    const field = app.needs().findIndex(n => n.need?.act === 'spray')
    const sent: AppEvent[] = []
    app.on(e => { if (e.type === 'sent') sent.push(e) })
    expect(app.smartOrder(field).ok).toBe(true)
    expect(sent).toEqual([{ type: 'sent', field, kind: 'spray', unit: -1 }])
  })
})
