// What stands at the foot of the land (the list with its "cannot wait" chip and the chip's pop, the people, the clock)
// never lies over a field's tag or stamp. A phone play-through once stuck on 27 August pressing a vine-kill stamp that
// the red row of work that cannot wait lay over.
import { test, type Page } from './base.ts'
import { expect, putAway, reach, startSeason, watchErrors } from './helpers.ts'

const PANELS = '[data-testid="pressing"], .press-pop, .queue, .timebook, .clock, .command, .person-card, .work, .telegram, .goal'

// Every tag and stamp on the land that a panel lies over, or that a press at its middle does not reach.
function under(page: Page, panels: string): Promise<string[]> {
  return page.evaluate(sel => {
    const seen = (e: Element) => e instanceof HTMLElement && e.offsetParent !== null && !e.closest('.gone, [hidden], .leaving, .out')
    const name = (e: Element) => (e as HTMLElement).dataset?.testid ?? String(e.className).split(' ')[0]
    const boxes = [...document.querySelectorAll(`#ui :is(${sel})`)].filter(seen).map(e => ({ r: e.getBoundingClientRect(), n: name(e) }))
    const out: string[] = []
    for (const e of document.querySelectorAll<HTMLElement>('#ui .plate[data-testid], #ui [data-testid^="badge-"]')) {
      if (!seen(e)) continue
      const b = e.getBoundingClientRect()
      if (!b.width || b.right < 0 || b.left > innerWidth || b.bottom < 0 || b.top > innerHeight) continue
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      const over = boxes.find(({ r }) => b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top)
      if (!hit?.closest(`[data-testid="${e.dataset.testid}"]`)) out.push(`${e.dataset.testid} not reached: ${hit ? name(hit.closest('[data-testid], section, main') ?? hit) : 'nothing'}`)
      else if (over) out.push(`${e.dataset.testid} under ${over.n}`)
    }
    return out
  }, panels)
}

for (const [w, h] of [[412, 839], [390, 844]] as const) {
  test(`no tag or stamp lies under the list, its "cannot wait" chip or any other panel in blight weather, ${w} by ${h}`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await startSeason(page)
    // Blight weather with nobody spraying: spraying left to be asked, and no spray ordered.
    await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run(q.day(7, 20), ['spray', 'kill', 'sell']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
    const ask = page.getByTestId('spray-way-ask')
    if (await ask.isVisible().catch(() => false)) await ask.click()
    await putAway(page)
    const chip = page.getByTestId('pressing')
    await expect(chip).toBeVisible()
    for (const pop of [false, true]) {
      if (pop) { await chip.click(); await expect(page.locator('#ui .press-pop')).toBeVisible() }
      // The whole farm, as Home frames it, and then each field brought into frame in turn.
      await page.keyboard.press('Home')
      await page.waitForTimeout(1500)
      expect(await under(page, PANELS), `the whole farm${pop ? ', the pop open' : ''}`).toEqual([])
      for (const f of [5, 3, 1]) {
        await page.evaluate(`window.__county.app.focus(${f})`)
        await page.waitForTimeout(1500)
        expect(await under(page, PANELS), `field ${f} brought into frame${pop ? ', the pop open' : ''}`).toEqual([])
      }
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
}
