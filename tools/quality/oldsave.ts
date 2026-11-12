// Opens the game with a save an earlier build wrote already in the browser, presses Continue, lets it run, and
// prints every console error and page error. A player's browser may hold such a save.
// Usage: node tools/quality/oldsave.ts <base url> <out dir> <save.json>...
import { mkdirSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { chromium } from '@playwright/test'
import { GPU } from './shared.ts'

const [base, out, ...saves] = process.argv.slice(2)
if (!base || !out || !saves.length) throw new Error('usage: oldsave.ts <base url> <out dir> <save.json>...')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: GPU })
let bad = 0
for (const path of saves) {
  const name = basename(path, '.json')
  const text = readFileSync(path, 'utf8')
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(save => { if (!localStorage.getItem('the-county/save')) localStorage.setItem('the-county/save', save) }, text)
  const page = await context.newPage()
  const seen: string[] = []
  page.on('console', m => { if (m.type() === 'error') seen.push(`console: ${m.text()}`) })
  page.on('pageerror', e => seen.push(`page: ${e.stack ?? String(e)}`))
  await page.goto(base)
  await page.waitForFunction(() => '__county' in globalThis, null, { timeout: 20000 })
  const button = page.getByTestId('continue')
  const offered = await button.waitFor({ timeout: 30000 }).then(() => true, () => false)
  let state = 'no Continue offered'
  if (offered) {
    await button.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${out}/${name}-loaded.png` })
    // Run whatever phase it is in: the clock in a season, a month in the cellar, the next spring from the ledger.
    state = await page.evaluate(async () => {
      const { app, sim } = (globalThis as unknown as { __county: { app: any; sim: any } }).__county
      const c = app.campaign
      const from = `${c.phase} ${sim.yearLabel(c.year)}`
      if (c.phase === 'plan') app.do({ t: 'begin' })
      if (c.phase === 'cellar') app.do({ t: 'month' })
      if (c.phase === 'ledger') app.do({ t: 'next' })
      if (c.phase === 'season') app.setSpeed(3)
      await new Promise(r => setTimeout(r, 6000))
      app.setSpeed(0)
      return `${from} -> ${c.phase} ${sim.yearLabel(c.year)}, version ${c.v}, ${c.fields.length} fields`
    })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/${name}-played.png` })
  }
  console.log(`${name}: ${state}; ${seen.length} errors`)
  for (const s of seen) console.log(`  ${s}`)
  if (!offered || seen.length) bad++
  await context.close()
}
await browser.close()
if (bad) process.exitCode = 1
