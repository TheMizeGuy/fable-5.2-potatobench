// The red row of work that cannot wait stands at the foot of the land while it lasts. On a phone it is three lines
// tall; a field's tag and stamp left under it could not be pressed (a phone play-through stuck on 27 August, pressing
// a vine-kill stamp the row lay over).
import { test, type Page } from '@playwright/test'
import { expect, putAway, reach, startSeason, watchErrors } from './helpers.ts'

// Every tag and stamp on the land that the row lies over, and whether a press at its middle reaches it.
function under(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('#ui [data-testid="pressing"]')
    if (!row || row.offsetParent === null) return ['no row']
    const r = row.getBoundingClientRect()
    const out: string[] = []
    for (const e of document.querySelectorAll<HTMLElement>('#ui .plate[data-testid], #ui [data-testid^="badge-"]')) {
      if (e.closest('.gone, [hidden]')) continue
      const b = e.getBoundingClientRect()
      if (!b.width || b.left >= r.right || b.right <= r.left || b.top >= r.bottom || b.bottom <= r.top) continue
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      if (!hit?.closest(`[data-testid="${e.dataset.testid}"]`)) out.push(e.dataset.testid!)
    }
    return out
  })
}

for (const [w, h] of [[412, 839], [390, 844]] as const) {
  test(`no tag or stamp is left under the row of work that cannot wait, ${w} by ${h}`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await startSeason(page)
    // Blight weather with nobody spraying: the row says so, and the calls stand as stamps.
    await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run(q.day(7, 20), ['spray', 'kill', 'sell']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
    await putAway(page)
    await expect(page.getByTestId('pressing')).toBeVisible()
    // The whole farm, as Home frames it, and then each field brought into frame in turn.
    await page.keyboard.press('Home')
    await page.waitForTimeout(1500)
    expect(await under(page)).toEqual([])
    for (const f of [5, 3, 1]) {
      await page.evaluate(`window.__county.app.focus(${f})`)
      await page.waitForTimeout(1500)
      expect(await under(page), `field ${f} brought into frame`).toEqual([])
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
}
