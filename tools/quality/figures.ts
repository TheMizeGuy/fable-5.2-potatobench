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
// A farm of three in July: the farmer driving the sprayer, a hand walking the rows, the others as the day has them.
await q(page, `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 30000
  c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
  for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })
  app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(6, 6), ['spray']); app.campaign.incidents = []
  // someone driving (the farmer, spraying), someone walking the rows, the rest as the day has them
  const c2 = app.campaign; for (const j of [...c2.season.jobs]) app.do({ t: 'cancel', id: j.id })
  app.do({ t: 'job', kind: 'spray', field: 0, unit: c2.crew[0].id }); app.do({ t: 'job', kind: 'scout', field: 2, unit: c2.crew[1].id })
  app.setSpeed(1)`)
await closeAll(page)
await q(page, `const { app } = q.g(); app.settings.pauseOnAlerts = false; app.campaign.incidents = []; app.setSpeed(1)`)
// the day's work under way: everyone out of the yard and at it
await page.waitForTimeout(6000)
const people = await q(page, `return q.g().app.campaign.crew.map(u => ({ id: u.id, name: u.name }))`) as { id: number; name: string }[]
const rows: string[] = []
// For each person: the card's Follow, a picture once the camera has come in, and what the figure's height on the
// screen is (from the ground under them to the point over their head), with where they are.
for (const p of people) {
  await page.evaluate(id => (globalThis as any).__county.app.selectUnit(id, 'land'), p.id)
  await page.waitForTimeout(400)
  const follow = page.getByTestId('whois-follow')
  if (!(await follow.isVisible().catch(() => false))) { rows.push(`${p.name}: no card`); continue }
  const before = await page.evaluate(id => (globalThis as any).__countyField.unitPlace(id), p.id)
  await follow.click()
  await page.waitForTimeout(2200)
  const after = await page.evaluate(id => `${(globalThis as any).__countyField.unitPlace(id)} following ${(globalThis as any).__countyField.following()}`, p.id)
  const at = await page.evaluate(id => {
    const g = globalThis as any
    const f = g.__countyField
    const { app } = g.__county
    const u = app.campaign.crew.find((x: any) => x.id === id)
    const j = app.campaign.season.jobs.find((x: any) => x.id === u.job)
    return { pin: f.unitPin(id), foot: f.unitFoot?.(id), place: g.__countyFieldPlace?.(id) ?? '', doing: j ? `${j.kind}@${j.field}` : 'idle', where: document.querySelector('#ui [data-testid="whois-where"]')?.textContent ?? '' }
  }, p.id) as { pin: { x: number; y: number; visible: boolean }; foot?: { x: number; y: number; visible: boolean }; doing: string; where: string }
  const tall = at.foot && at.pin.visible ? Math.round(at.foot.y - at.pin.y) : -1
  const name = p.name.split(' ')[0].toLowerCase()
  await page.screenshot({ path: join(out, `${name}-follow.png`) })
  rows.push(`${name} (${at.doing}): pin ${at.pin.visible ? `${Math.round(at.pin.x)},${Math.round(at.pin.y)}` : 'off'}; figure ${tall} px tall; card: ${at.where || 'on foot'}; ${before} -> ${after}`)
  await page.keyboard.press('Escape')
  await page.evaluate(() => (globalThis as any).__countyField.tier('farm'))
  await page.waitForTimeout(1500)
}
writeFileSync(join(out, 'figures.txt'), rows.join('\n') + `\nerrors: ${errors.join(' | ') || 'none'}\n`)
console.log(rows.join('\n'))
console.log(`errors: ${errors.length}`)
await browser.close()
