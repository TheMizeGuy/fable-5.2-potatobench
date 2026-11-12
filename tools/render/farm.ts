// A farm for the tools that time the picture: reached through the real game, the same for each of them.
import type { Page } from '@playwright/test'

// Ten fields in crop: the home six (two of them in their rest year) and six more taken on, with a second tractor and two hands.
export async function bigFarm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { app, sim } = (window as any).__county
    app.newGame(1977, 5)
    const c = app.campaign
    c.cash = Math.max(c.cash, 400000)
    const kinds = ['katahdin', 'superior', 'kennebec', 'norland', 'atlantic']
    for (const f of [6, 7, 10, 11, 12, 13]) {
      app.do({ t: 'rent', field: f })
      app.do({ t: 'plan', field: f, plan: { crop: 'potato', variety: kinds[f % kinds.length], seed: 'certified' } })
    }
    app.do({ t: 'buy', upgrade: 'tractor2' }); app.do({ t: 'hire', kind: 'operator' })
    app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'hire', kind: 'hand' })
    app.do({ t: 'begin' })
    while (c.phase === 'season' && c.season.day < 196) {
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || a.act === 'sell') continue
        app.do({ t: 'job', kind: a.act, field: a.field })
      }
      if (!app.do({ t: 'day' }).ok) break
    }
    for (let n = 0; n < 30 && sim.today(app.world, c).sky !== 'clear'; n++) app.do({ t: 'day' })
    // A day's work for everyone, left part way through: people and machines out on the land.
    for (const a of sim.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
    app.do({ t: 'day' })
  })
  await page.evaluate(() => (window as any).__countyField.settle())
  await page.evaluate(() => (window as any).__countyField.seek(0.5, 0.003))
}
