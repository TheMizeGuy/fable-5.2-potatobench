// The slip under the date when somebody on the farm has nothing to do: a farm of three with its potatoes planted
// and nothing ordered, at a small desk and at a large one. A picture of each, and the boxes of the board, the slip
// and its key, before and after the key is pressed.
// Usage: node tools/quality/slip.ts <url> <out dir>
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/slip'] = args.filter(a => !a.startsWith('--'))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: GPU })
for (const [w, h, dpr] of [[1280, 720, 1], [1920, 1080, 1], [2560, 1440, 1.5]]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.addInitScript(HELPER)
  await page.goto(base)
  await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })
  await q(page, `const { app, sim } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 20000; app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'auto' })
    for (let k = 0; k < 90 && c.season.fields.some((f, i) => sim.isField(c, i) && f.status === 'idle'); k++) { c.incidents = []; for (const a of sim.advise(app.world, c)) if (a.act === 'plant') app.order('plant', { fields: [a.field] }); app.do({ t: 'day' }) }
    c.incidents = []; app.do({ t: 'day' }); app.setSpeed(0); app.select(-1); app.selectUnit(-1)`)
  await closeAll(page)
  await page.waitForTimeout(1500)
  const boxes = () => page.evaluate(() => Object.fromEntries(['.topbar .almanac > .mount', '[data-testid="goal"]', '[data-testid="goal-do"]', '.goal-row'].map(sel => { const r = document.querySelector(`#ui ${sel}`)?.getBoundingClientRect(); return [sel, r ? `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` : 'none'] })))
  const said = () => page.evaluate(() => (document.querySelector('#ui [data-testid="goal"]') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') ?? '')
  await page.screenshot({ path: `${out}/${w}-free.jpg`, type: 'jpeg', quality: 82 })
  console.log(`${w}x${h} free: "${await said()}" ${JSON.stringify(await boxes())}`)
  const go = page.getByTestId('goal-do')
  if (await go.count()) { await go.click(); await page.waitForTimeout(1200) }
  await page.screenshot({ path: `${out}/${w}-given.jpg`, type: 'jpeg', quality: 82 })
  console.log(`${w}x${h} given: "${await said()}" ${JSON.stringify(await boxes())}  errors ${errors.length} ${errors.slice(0, 2).join(' ; ')}`)
  await page.context().close()
}
await browser.close()
