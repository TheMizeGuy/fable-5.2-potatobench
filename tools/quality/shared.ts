// Shared by the capture tools: how to reach a state of the game through the real app.
import type { Page } from '@playwright/test'

export const GPU = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu']

// Runs in the page: ways to reach a state through the real app, following the in-game advice.
export const HELPER = `window.__q = {
  g() { return window.__county },
  day(m, d) { const { app, sim } = this.g(); return sim.dayIndex(app.campaign.year, m, d) },
  start(year, seed) { const { app } = this.g(); app.newGame(year, seed); app.do({ t: 'begin' }) },
  run(until, skip, stop) {
    const { app, sim } = this.g(); const c = app.campaign; let n = 0
    while (c.phase === 'season' && !sim.seasonDone(c) && n++ < 400) {
      const s = c.season
      if (typeof until === 'number' && s.day >= until) return
      if (stop === 'sky' && n > 1 && until.includes(sim.today(app.world, c).sky)) return
      if (stop === 'work' && s.worked.some(w => w.kind === until)) return
      if (stop === 'status' && s.fields.some(f => f.status === until)) return
      if (stop === 'lot' && c.lots.some(l => l.open && s.fields[l.field].status === 'dug')) return
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || (skip || []).includes(a.act)) continue
        if (a.act === 'sell') { if (!(skip || []).includes('sell')) app.do({ t: 'sell', lot: a.lot, frac: 1 }) }
        else app.do({ t: 'job', kind: a.act, field: a.field })
      }
      app.do({ t: 'day' })
    }
  },
  winter(months, sellAt) {
    const { app, sim } = this.g(); const c = app.campaign
    if (c.phase === 'season') app.do({ t: 'endSeason' })
    for (let k = 0; k < months && c.phase === 'cellar'; k++) {
      if (c.month >= sellAt) for (const l of sim.openLots(c)) app.do({ t: 'sell', lot: l.id, frac: 1 })
      app.do({ t: 'month' })
    }
  },
  year(sellAt) { this.run(999, ['sell']); this.winter(12, sellAt) },
}`

export const q = (page: Page, code: string) => page.evaluate(`(() => { const q = window.__q; ${code} })()`)

export async function closeAll(page: Page): Promise<void> {
  for (let i = 0; i < 24; i++) {
    if (!(await page.locator('.dialog').count())) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(80)
  }
}
