// Close pictures of what stands on the land (field tags, stamps, the yard's tag, people's pins), at twice the size,
// for looking at how they are drawn: near, with a field in hand, far out, and the spring's land.
// Usage: node tools/render/tagshot.ts <url> <out dir> [--size=1512x982]
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from '../quality/shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/tagshots'] = args.filter(a => !a.startsWith('--'))
const size = (args.find(a => a.startsWith('--size='))?.slice(7) ?? '1512x982').split('x').map(Number)
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 2 })).newPage()
await page.addInitScript(HELPER)
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })

// The part of the window the tags stand in, with a margin.
async function shot(page: Page, name: string): Promise<void> {
  // (taken with the camera at rest and every fade over)
  const t0 = Date.now()
  while (await page.evaluate(() => (globalThis as unknown as { __countyField: { rig: { moving(): boolean } } }).__countyField.rig.moving()) && Date.now() - t0 < 15000) await page.waitForTimeout(100)
  await page.waitForTimeout(1200)
  const faint = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.plate-layer .tag-wrap:not(.gone):not(.under)')].filter(e => !e.hidden && Number(getComputedStyle(e).opacity) < 0.99).map(e => `${e.querySelector<HTMLElement>('.tag')?.dataset.k} ${getComputedStyle(e).opacity}`))
  if (faint.length) console.log(`${name}: FAINT AT REST ${faint.join(', ')}`)
  const box = await page.evaluate(() => {
    const rs = [...document.querySelectorAll<HTMLElement>('.plate-layer .tag-wrap:not(.gone) .tag-at, .plate-layer .yard-at:not(.gone) .yard-tag, .plate-layer .pin-at:not(.gone) .pin')]
      .filter(e => !e.closest('[hidden]') && getComputedStyle(e.closest('.tag-wrap, .yard-at, .pin-at')!).visibility !== 'hidden').map(e => e.getBoundingClientRect()).filter(r => r.width > 0)
    if (!rs.length) return null
    const l = Math.min(...rs.map(r => r.left)) - 40, t = Math.min(...rs.map(r => r.top)) - 40
    const r = Math.max(...rs.map(r => r.right)) + 40, b = Math.max(...rs.map(r => r.bottom)) + 40
    return { x: Math.max(0, l), y: Math.max(0, t), width: Math.min(innerWidth, r) - Math.max(0, l), height: Math.min(innerHeight, b) - Math.max(0, t) }
  })
  await page.screenshot({ path: `${out}/${name}.png`, clip: box ?? undefined })
  console.log(`${name}: ${box ? `${Math.round(box.width)} by ${Math.round(box.height)}` : 'no tags'}`)
}

await q(page, `q.start(1987, 3); q.run(q.day(7, 6), ['hill', 'spray']); const { app } = q.g(); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
await closeAll(page)
if (await page.locator('.dialog').count()) { await page.keyboard.press('1'); await page.waitForTimeout(400); await closeAll(page) }
await shot(page, '1-near')
await q(page, `q.g().app.select(1)`)
await shot(page, '2-in-hand')
await q(page, `q.g().app.select(-1)`)
await page.mouse.move(size[0] / 2, size[1] * 0.62)
for (let k = 0; k < 5; k++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120) }
await shot(page, '3-far')
for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120) }
await shot(page, '4-farther')
await q(page, `q.g().app.newGame(1987, 3)`)
await closeAll(page)
await shot(page, '5-spring')
await browser.close()
