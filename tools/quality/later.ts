// The screens after the first season, as the owner would meet them a couple of hours in, at a large desk drawn at one
// and a half device pixels and with no tips: the cellar in winter, the ledger at the year's end, the second spring's
// plan, a field's record open in it, and its Land fold.
// Usage: node tools/quality/later.ts <url> <out dir> [--size=2507x1308] [--dpr=1.5]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/later'] = args.filter(a => !a.startsWith('--'))
const opt = (name: string, d: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const size = opt('size', '2507x1308').split('x').map(Number), dpr = Number(opt('dpr', '1.5'))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr })).newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.addInitScript(HELPER)
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })
let k = 0
const shot = async (name: string) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${String(k++).padStart(2, '0')}-${name}.jpg`, type: 'jpeg', quality: 78 }); console.log(`shot ${name}`) }
const phase = () => page.evaluate(() => (globalThis as unknown as { __county: { app: { campaign: { phase: string } } } }).__county.app.campaign.phase)

// The first year played by the game's own advice, the crop held into the cellar.
await q(page, `const g = window.__countyGuide; if (g) { g.reset(); g.refuse() } q.start(1987, 3); q.run(999, ['sell']); q.g().app.do({ t: 'endSeason' })`)
await closeAll(page)
console.log(`after the season: ${await phase()}`)
await shot('cellar')
await q(page, `q.winter(12, 3)`)
await closeAll(page)
console.log(`after the winter: ${await phase()}`)
await shot('ledger')
await q(page, `const { app } = q.g(); if (app.campaign.phase !== 'plan') app.do({ t: 'next' })`)
await closeAll(page)
console.log(`then: ${await phase()}`)
await shot('second-spring')
// A field's record: the lowest potato field, whose tag is nearest the bottom of the window.
const opened = await page.evaluate(() => {
  const tags = [...document.querySelectorAll<HTMLElement>('#ui .plate-layer [data-testid^="field-"]')].filter(e => e.getClientRects().length > 0)
  const low = tags.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0]
  low?.click()
  return low?.textContent ?? ''
})
console.log(`record opened: ${opened}`)
await shot('second-spring-record')
await page.keyboard.press('Escape')
for (const fold of ['Land', 'People', 'Equipment']) {
  const press = () => page.evaluate(name => { const b = [...document.querySelectorAll<HTMLElement>('#ui .cat-folds button')].find(e => (e.textContent ?? '').trim().startsWith(name)); b?.click(); return !!b }, fold)
  if (!(await press())) { console.log(`no ${fold}`); continue }
  await shot(`second-spring-${fold.toLowerCase()}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}
console.log(`errors: ${errors.length} ${errors.slice(0, 3).join(' ; ')}`)
await browser.close()
