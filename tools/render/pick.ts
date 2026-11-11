// Checks picking on the bigger farm with real clicks: land to be had in spring, the farm's own fields, a crew, empty ground.
// Usage: node tools/render/pick.ts <base-url>
import { chromium, type Page } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const base = process.argv[2] ?? 'http://localhost:5317/'
let failed = 0
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }

const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(base)
await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0)
await page.evaluate(() => { for (const el of [...document.body.children]) if (el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT') (el as HTMLElement).style.display = 'none' })
const settle = () => page.evaluate(() => (window as any).__countyField.settle())
// The middle of a field on screen (a little up from its plate's pin).
const centre = (p: Page, i: number) => p.evaluate(i => {
  const f = (window as any).__countyField
  const a = f.anchor(i)
  return a.visible ? { x: a.x, y: a.y - 20 } : null
}, i)
const click = async (pt: { x: number; y: number } | null) => { if (pt) { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(400) } }
const state = () => page.evaluate(() => { const { app } = (window as any).__county; return { sel: app.selection.slice(), unit: app.unit } })

// Spring: the whole map, so every parcel is on screen.
await page.evaluate(() => { const { app } = (window as any).__county; app.newGame(1977, 5) })
await settle()
await page.evaluate(() => (window as any).__countyField.home())
await settle()
for (const i of [3, 7, 9, 12]) {
  await click(await centre(page, i))
  const s = await state()
  check(s.sel.length === 1 && s.sel[0] === i, `spring: a click on parcel ${i} (${i < 6 ? 'the farm’s' : 'to be had'}) selects it (selection ${JSON.stringify(s.sel)})`)
}
// The season: land not held cannot be picked; a crew can.
await page.evaluate(() => {
  const { app } = (window as any).__county
  app.newGame(1977, 5)
  app.campaign.cash = 400000
  app.do({ t: 'hire', kind: 'hand' })
  app.do({ t: 'begin' })
  for (let n = 0; n < 6; n++) app.do({ t: 'day' })
})
await settle()
await page.evaluate(() => (window as any).__countyField.home())
await settle()
await click(await centre(page, 10))
check((await state()).sel.length === 0, 'season: a click on land the farm does not hold selects nothing')
await click(await centre(page, 2))
check((await state()).sel[0] === 2, 'season: a click on a field of the farm selects it')
const units: { id: number }[] = await page.evaluate(() => (window as any).__countyField.info().units)
for (const u of units) {
  const at = await page.evaluate(id => (window as any).__countyField.unitAt(id), u.id)
  await click(at)
  const s = await state()
  check(s.unit === u.id, `season: a click on crew ${u.id} picks it (picked ${s.unit})`)
}
await click({ x: 1430, y: 60 })
const s = await state()
check(s.unit === -1 && s.sel.length === 0, `a click on empty ground lets the field and the crew go (${JSON.stringify(s)})`)
console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors')
await browser.close()
process.exit(failed ? 1 : 0)
