// Whether a person can be seen as a figure on the land when the camera comes right in on their pin: for each person
// at work in a season, the camera follows them and is wheeled in at their pin, step by step, and a picture is taken at
// each step with where their pin, their body and the drawn figure are. Pictures: <out>/<person>-<step>.png.
// Usage: node tools/quality/figures.ts <base url> [out dir]
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const [base, out = 'out/figures'] = process.argv.slice(2)
if (!base) throw new Error('usage: figures.ts <base url> [out dir]')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
await page.addInitScript(HELPER)
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis)
await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 30_000 }).catch(() => {})
// A farm of three in June, everyone at work: spraying, hilling, walking the rows.
await q(page, `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 30000
  c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
  for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })
  app.do({ t: 'begin' }); q.run(q.day(6, 20)); app.campaign.incidents = []; app.setSpeed(1)`)
await closeAll(page)
await page.waitForTimeout(3000)
const people = await q(page, `return q.g().app.campaign.crew.map(u => ({ id: u.id, name: u.name }))`) as { id: number; name: string }[]
const rows: string[] = []
for (const p of people) {
  // the camera follows them, by the person card's own control
  await page.evaluate(id => (globalThis as any).__county.app.selectUnit(id, 'land'), p.id)
  await page.waitForTimeout(400)
  const follow = page.getByTestId('whois-follow')
  if (await follow.isVisible().catch(() => false)) await follow.click()
  await page.waitForTimeout(1500)
  await page.keyboard.press('Escape')
  for (let step = 0; step < 6; step++) {
    const at = await page.evaluate(id => { const f = (globalThis as any).__countyField; return { pin: f.unitPin(id), body: f.unitAt(id) } }, p.id) as { pin: { x: number; y: number; visible: boolean }; body: { x: number; y: number } | null }
    const name = `${p.name.split(' ')[0].toLowerCase()}-${step}`
    await page.screenshot({ path: join(out, `${name}.png`) })
    rows.push(`${name}: pin ${at.pin.visible ? `${Math.round(at.pin.x)},${Math.round(at.pin.y)}` : 'off'}; body ${at.body ? `${Math.round(at.body.x)},${Math.round(at.body.y)}` : 'none'}`)
    const x = at.body?.x ?? at.pin.x, y = at.body?.y ?? at.pin.y
    if (Number.isFinite(x) && Number.isFinite(y)) { await page.mouse.move(x, y); await page.mouse.wheel(0, -500); await page.waitForTimeout(700) }
  }
  await page.evaluate(() => (globalThis as any).__countyField.tier('farm'))
  await page.waitForTimeout(1200)
}
writeFileSync(join(out, 'figures.txt'), rows.join('\n') + `\nerrors: ${errors.join(' | ') || 'none'}\n`)
console.log(rows.join('\n'))
console.log(`errors: ${errors.length}`)
await browser.close()
