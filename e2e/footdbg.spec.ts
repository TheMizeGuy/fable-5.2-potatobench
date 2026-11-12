import { test } from '@playwright/test'
import { putAway, reach, startSeason } from './helpers.ts'

test('foot debug', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 })
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run(q.day(7, 20), ['spray', 'kill', 'sell']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
  const ask = page.getByTestId('spray-way-ask')
  if (await ask.isVisible().catch(() => false)) await ask.click()
  await putAway(page)
  await page.getByTestId('pressing').click()
  await page.keyboard.press('Home')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'outdbg2/home.png' })
  console.log(await page.evaluate(() => JSON.stringify({
    ins: (globalThis as any).__county.app.insets,
    pop: (() => { const r = document.querySelector('#ui .q-pop')?.getBoundingClientRect(); return r ? `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` : 'none' })(),
    layer: document.querySelector('#ui .plate-layer')?.className,
    settled: (document.querySelector('#ui .plate-layer') as HTMLElement)?.dataset.settled,
    tags: [...document.querySelectorAll<HTMLElement>('#ui .tag-wrap')].filter(w => !w.hidden && !w.classList.contains('gone')).map(w => { const r = w.getBoundingClientRect(); return `${w.querySelector('[data-testid]')?.getAttribute('data-testid')} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} ${w.className}` }),
    hits: [...document.querySelectorAll<HTMLElement>('#ui .plate[data-testid], #ui [data-testid^="badge-"]')].map(e => { const b = e.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) as HTMLElement | null; return `${e.dataset.testid}@${Math.round(b.left)},${Math.round(b.top)}->${h?.tagName}.${String(h?.className).slice(0, 40)}` }),
    anchors: [0, 1, 2, 3, 4, 5].map(i => { const a = (globalThis as any).__countyField.anchor(i); return `${i}:${Math.round(a.x)},${Math.round(a.y)},${a.visible}` }),
  })))
})
