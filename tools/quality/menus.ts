// The game as the owner sees it, cold: Play with tips, at a large desk drawn at one and a half device pixels. The
// first screen; then a July farm of three with each of the bar's sheets opened in turn, the home yard's card, the
// goals' list; and one person seen from far to very near, with the box of their badge against the box of their body.
// Usage: node tools/quality/menus.ts <url> <out dir> [--size=2507x1308] [--dpr=1.5]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/menus'] = args.filter(a => !a.startsWith('--'))
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
const shot = async (name: string) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${String(k++).padStart(2, '0')}-${name}.jpg`, type: 'jpeg', quality: 78 }); console.log(`shot ${name}`) }
// (pressed in the page itself: a sheet coming or going never holds the capture up)
const press = async (id: string) => { const ok = await page.evaluate(k => { const b = document.querySelector<HTMLElement>(`#ui [data-testid="${k}"]`); if (!b || b.offsetParent === null) return false; b.click(); return true }, id); if (!ok) console.log(`no ${id}`); return ok }

// 1. Cold: Play, with tips.
await page.getByTestId('play').first().click()
await page.waitForTimeout(1200)
if (await press('guide-accept')) await page.waitForTimeout(3500)
await shot('tips-first-screen')
if (await page.evaluate(() => { const b = document.querySelector<HTMLElement>('#ui .plate-layer .need.worded') ?? document.querySelector<HTMLElement>('#ui [data-testid^="badge-"]'); b?.click(); return !!b })) { await page.waitForTimeout(9000); await shot('tips-planting') }

// 2. A July farm of three (no tips), each sheet of the bar.
await q(page, `const g = window.__countyGuide; if (g) { g.reset(); g.refuse() } const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 20000; app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'auto' })
  q.run(q.day(7, 6), ['hill', 'spray']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
await closeAll(page)
await page.waitForTimeout(1500)
await shot('july')
const ids = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#ui .mainbar [data-testid]')].map(e => e.dataset.testid!))
console.log(`bar: ${ids.join(' ')}`)
for (const id of ids) {
  if (!(await press(id))) continue
  await shot(`bar-${id}`)
  await closeAll(page)
}
if (await press('goal')) { await shot('goals'); await press('goal') }
if (await press('work-grid-open')) { await shot('work-grid'); await page.keyboard.press('Escape') }
await q(page, `q.g().app.selectYard(1)`)
await shot('yard-card')
await page.keyboard.press('Escape')
await q(page, `q.g().app.select(0)`)
await shot('field-card')
await page.keyboard.press('Escape')

// 3. One person, from far to very near: the badge's box against the body's.
await q(page, `const { app } = q.g(); app.select(-1); app.selectUnit(-1); window.__countyField.follow && window.__countyField.follow(1)`)
await page.waitForTimeout(2500)
await q(page, `q.g().app.selectUnit(-1)`)
for (let step = 0; step < 4; step++) {
  const box = await page.evaluate(() => {
    const F = (globalThis as unknown as { __countyField: { unitPin(id: number): { x: number; y: number; visible: boolean }; unitFoot?(id: number): { x: number; y: number } } }).__countyField
    const pin = document.querySelector<HTMLElement>('#ui .plate-layer .pin-at:not(.gone) .head')?.getBoundingClientRect()
    const p = F.unitPin(1), f = F.unitFoot ? F.unitFoot(1) : null
    return { tip: p, foot: f, head: pin ? { l: Math.round(pin.left), t: Math.round(pin.top), r: Math.round(pin.right), b: Math.round(pin.bottom) } : null }
  })
  console.log(`zoom step ${step}: ${JSON.stringify(box)}`)
  await shot(`person-zoom-${step}`)
  const at = box.tip.visible ? box.tip : { x: size[0] / 2, y: size[1] / 2 }
  await page.mouse.move(at.x, at.y + 30)
  for (let n = 0; n < 3; n++) { await page.mouse.wheel(0, -500); await page.waitForTimeout(150) }
  await page.waitForTimeout(900)
}
console.log(`errors: ${errors.length} ${errors.slice(0, 3).join(' ; ')}`)
await browser.close()
