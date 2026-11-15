// Work for people with nothing to do (the owner, 14 November: "ZERO intuitive direction on what im supposed to do
// next"): once the planting is ordered, whenever somebody on the farm has no order and is helping nobody, the farm
// names one job on the land to give them, and stops naming one while such a job is on the list.
import { describe, expect, it } from 'vitest'
import { App, setDays } from '../src/game/app.ts'
import { freeWork, idleWork } from '../src/game/goals.ts'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

function farm(): { app: App; c: S.Campaign } {
  const app = new App(loadWorld())
  app.settings.pauseOnAlerts = false
  app.newGame(undefined, 11)
  const c = app.campaign!
  expect(app.do({ t: 'begin' }).ok).toBe(true)
  return { app, c }
}
const day = (app: App, c: S.Campaign) => { c.incidents = []; app.do({ t: 'day' }) }

describe('work for people with nothing to do', () => {
  it('none before the word to plant is given, and none while everyone is planting or helping', () => {
    setDays('long')
    try {
      const { app, c } = farm()
      expect(freeWork(c)).toBeNull()
      app.order('plant', { fields: [app.needs().findIndex(n => n.need?.act === 'plant')] })
      app.do({ t: 'work', to: 0.5 })
      expect(c.crew.every(u => u.job >= 0 || u.help !== undefined), 'everyone is at the planting').toBe(true)
      expect(freeWork(c)).toBeNull()
    } finally { setDays('brisk') }
  })

  it('names the hedgerow of a crop on low land first, then a tract to fell, and nothing while land work is on the list', () => {
    setDays('long')
    try {
      const { app, c } = farm()
      app.order('plant', { fields: [app.needs().findIndex(n => n.need?.act === 'plant')] })
      const s = c.season!
      for (let n = 0; n < 40 && !(freeWork(c) && s.fields.filter(f => f.status === 'planted' || f.status === 'growing').length >= 4); n++) day(app, c)
      const said: string[] = []
      for (let n = 0; n < 12; n++) {
        const w = freeWork(c)
        if (!w) break
        expect(w.who.length).toBeGreaterThan(0)
        expect(S.jobBlock(c, w.kind, w.field), `${w.kind} in ${S.FIELD_NAMES[w.field]} can be ordered`).toBe('')
        said.push(`${w.kind}@${S.FIELD_NAMES[w.field]}`)
        expect(app.order(w.kind, { fields: [w.field] })[0].ok).toBe(true)
        expect(freeWork(c), 'one job on the land at a time').toBeNull()
        if (w.kind === 'fell') break
        for (let k = 0; k < 30 && s.jobs.some(j => j.kind === w.kind && j.field === w.field); k++) day(app, c)
      }
      // The low fields' hedgerows, lowest first, then the brush tract.
      expect(said.slice(0, 2).every(x => x.startsWith('brush@'))).toBe(true)
      expect(said[0]).toMatch(/Brook Field|Bottom Field/)
      expect(said[said.length - 1]).toBe('fell@Alder Swale')
      // Felling is helped: with three people free, more than one is at it.
      day(app, c)
      const fell = s.jobs.find(j => j.kind === 'fell')
      if (fell && !c.crew.some(u => u.job >= 0 && u.job !== fell.id)) expect(c.crew.filter(u => u.job === fell.id || u.help === fell.id).length).toBeGreaterThan(1)
    } finally { setDays('brisk') }
  })

  // "order it? order what?" (the owner, 14 November, of a key that said "Order it"): the jobs are offered by name,
  // at most two of them, a short one on a field and a tract to fell.
  it('offers at most two jobs, each with its place and what it is for, and none while an order waits to be taken up', () => {
    setDays('long')
    try {
      const { app, c } = farm()
      app.order('plant', { fields: [app.needs().findIndex(n => n.need?.act === 'plant')] })
      const s = c.season!
      for (let n = 0; n < 40 && !(idleWork(c) && s.fields.filter(f => f.status === 'planted' || f.status === 'growing').length >= 4); n++) day(app, c)
      const idle = idleWork(c)!
      expect(idle.who.length).toBeGreaterThan(0)
      expect(idle.options.map(o => o.kind)).toEqual(['brush', 'fell'])
      for (const o of idle.options) {
        expect(S.jobBlock(c, o.kind, o.field)).toBe('')
        expect(o.gain.length).toBeGreaterThan(20)
      }
      // An order nobody has taken up yet: the people standing are about to go to it, and nothing is offered.
      const field = s.fields.findIndex(f => f.status === 'planted' || f.status === 'growing')
      for (let n = 0; n < 60 && S.jobBlock(c, 'scout', field) !== ''; n++) day(app, c)
      for (const j of [...s.jobs]) S.apply(app.world, c, { t: 'cancel', id: j.id })
      expect(S.apply(app.world, c, { t: 'job', kind: 'scout', field }).ok).toBe(true)
      expect(idleWork(c)).toBeNull()
    } finally { setDays('brisk') }
  })
})

// Round ten's strategy player gave the idle crew a woodlot to fell ("work for people with nothing else to do") and by
// late June all three people were worn out, the farm's one driver among them: the hilling and the spraying waited
// weeks and the slip asked them to keep a worn-out crew busy.
describe('felling is for spare strength', () => {
  const world = loadWorld()
  // A season of the game's own advice with two hired hands; felling: whether a tract to fell is kept on the list.
  function season(seed: number, felling: boolean): { worn: number; cwt: number } {
    const c = S.createCampaign(world, { seed, startYear: 1987 })
    expect(S.apply(world, c, { t: 'hire', kind: 'hand' }).ok).toBe(true)
    expect(S.apply(world, c, { t: 'hire', kind: 'hand' }).ok).toBe(true)
    expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
    let worn = 0
    for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
      for (const a of S.advise(world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
      if (felling && !c.season!.jobs.some(j => j.kind === 'fell')) {
        const tract = c.fields.findIndex((_, i) => S.jobBlock(c, 'fell', i) === '')
        if (tract >= 0) S.apply(world, c, { t: 'job', kind: 'fell', field: tract })
      }
      S.apply(world, c, { t: 'day' })
      worn += c.crew.filter(u => S.resting(u)).length
    }
    return { worn, cwt: c.lots.filter(l => l.year === c.year).reduce((sum, l) => sum + S.lotCwt(l), 0) }
  }

  it('a crew with woods to fell all season is hardly ever worn out, and brings in the crop it would have without them', () => {
    for (const seed of [1, 3, 7]) {
      const woods = season(seed, true), none = season(seed, false)
      // (before the rule: about 60 person-days worn out on each of these farms, and 2,600 to 4,900 cwt)
      expect(woods.worn, `seed ${seed}: person-days worn out`).toBeLessThan(10)
      expect(woods.cwt / none.cwt, `seed ${seed}: ${Math.round(woods.cwt)} cwt with felling, ${Math.round(none.cwt)} without`).toBeGreaterThan(0.93)
    }
  })

  it('someone given the felling by name works on whatever their tiredness', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1987 })
    S.apply(world, c, { t: 'begin' })
    const u = c.crew[0]
    u.tired = 0.6
    const tract = c.fields.findIndex((_, i) => S.jobBlock(c, 'fell', i) === '')
    expect(S.apply(world, c, { t: 'job', kind: 'fell', field: tract }).ok).toBe(true)
    expect(S.sparingToday(c, u), 'tired, with felling open to anyone: resting for the crop').toBe(true)
    c.season!.jobs.find(j => j.kind === 'fell')!.unit = u.id
    expect(S.sparingToday(c, u)).toBe(false)
  })
})
