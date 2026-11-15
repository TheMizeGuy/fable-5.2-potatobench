// Work for people with nothing to do (the owner, 14 November: "ZERO intuitive direction on what im supposed to do
// next"): once the planting is ordered, whenever somebody on the farm has no order and is helping nobody, the farm
// names one job on the land to give them, and stops naming one while such a job is on the list.
import { describe, expect, it } from 'vitest'
import { App, setDays } from '../src/game/app.ts'
import { freeWork } from '../src/game/goals.ts'
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
})
