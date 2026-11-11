// Walks every screen at desktop and phone size, saves named screenshots, runs axe, and fails on any console error.
// Usage: node src/ui/dev/shots.ts [output folder]
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, type Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { createServer } from 'vite'
import type { App } from '../../game/app.ts'
import type * as Sim from '../../sim/index.ts'

type Hook = { app: App; sim: typeof Sim }
declare global { interface Window { __county: Hook } }

const root = resolve(import.meta.dirname, '../../..')
const out = resolve(process.argv[2] ?? join(root, 'test-results', 'shots', String(Date.now())))
mkdirSync(out, { recursive: true })

const server = await createServer({ root, logLevel: 'error', server: { port: 5730, strictPort: false } })
await server.listen()
const base = server.resolvedUrls!.local[0]

const errors: string[] = []
const axeReport: string[] = []
const shots: string[] = []

async function shot(page: Page, tag: string, name: string): Promise<void> {
  await page.waitForTimeout(350)
  const file = join(out, `${tag}-${name}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
}

async function axe(page: Page, tag: string, name: string): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  axeReport.push(`${tag} ${name}: ${bad.length} serious or critical${bad.length ? `: ${bad.map(v => `${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`).join('; ')}` : ''}`)
}

async function closeDialogs(page: Page): Promise<void> {
  for (let k = 0; k < 20; k++) {
    if (!(await page.locator('.dialog').count())) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(40)
  }
}

// Plays the reference practice forward inside the page until `stop` says so. Test digs are skipped so no tray opens.
async function play(page: Page, stop: 'day' | 'dug' | 'done', until = 0): Promise<void> {
  await page.evaluate(({ stop, until }) => {
    const { app, sim } = window.__county
    const c = app.campaign!
    let guard = 0
    while (c.phase === 'season' && c.season && !sim.seasonDone(c) && guard++ < 400) {
      if (stop === 'day' && c.season.day >= until) break
      if (stop === 'dug' && Array.from({ length: 6 }, (_, i) => sim.fieldInfo(c, i).status).includes('dug')) break
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || a.act === 'sell' || a.act === 'sample') continue
        app.do({ t: 'job', kind: a.act, field: a.field })
      }
      app.do({ t: 'day' })
    }
  }, { stop, until })
  await page.waitForTimeout(200)
}

async function walk(tag: string, width: number, height: number): Promise<void> {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const context = await browser.newContext({ viewport: { width, height } })
  const page = await context.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`) })
  page.on('pageerror', e => errors.push(`${tag} page: ${e.message}`))
  await page.goto(base)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('new-farm').waitFor()
  await shot(page, tag, '01-title')
  await axe(page, tag, 'title')

  await page.getByTestId('new-farm').click()
  await page.getByTestId('start-year-1977').click()
  await shot(page, tag, '02-new-farm')
  await page.getByTestId('start-confirm').click()
  await page.getByTestId('begin-season').waitFor()
  await page.evaluate(() => window.__county.app.newGame(1977, 5))
  await page.getByTestId('begin-season').waitFor()
  await shot(page, tag, '03-plan')
  await axe(page, tag, 'plan')
  if (width < 600) {
    await page.locator('.sheet').evaluate(el => { el.scrollTop = el.scrollHeight })
    await shot(page, tag, '03b-plan-foot')
  }

  await page.getByTestId('begin-season').click()
  await page.getByTestId('speed-0').waitFor()
  await shot(page, tag, '04-season-start')

  await play(page, 'day', await page.evaluate(() => window.__county.sim.dayIndex(1977, 6, 22)))
  await closeDialogs(page)
  await page.getByTestId('field-2').click()
  for (const kind of ['water', 'scout', 'sample']) {
    const b = page.getByTestId(`act-${kind}`)
    if (await b.isEnabled()) await b.click()
  }
  if (width < 600) await page.getByTestId('tab-field').click()
  else await page.locator('.fieldpanel').evaluate(el => { el.scrollTop = 0 })
  await shot(page, tag, '05-season-field')
  await axe(page, tag, 'season')
  if (width < 600) {
    await page.getByTestId('tab-work').click()
    await shot(page, tag, '05b-season-work')
    await page.getByTestId('tab-weather').click()
    await shot(page, tag, '05c-season-weather')
    await page.getByTestId('tab-coach').click()
    await shot(page, tag, '05d-season-coach')
  }

  const sampleJob = await page.evaluate(() => window.__county.app.campaign!.season!.jobs.find(j => j.kind === 'sample' && j.field === 2)?.id ?? -1)
  if (sampleJob >= 0) {
    await page.evaluate(id => { const { app } = window.__county; app.do({ t: 'bump', id }); app.do({ t: 'day' }) }, sampleJob)
    await page.getByTestId('sample-dialog').waitFor()
    await page.waitForTimeout(800)
    await shot(page, tag, '06-test-dig')
    await page.getByTestId('sample-close').click()
  } else errors.push(`${tag}: could not queue a test dig`)

  await play(page, 'dug')
  const lot = await page.evaluate(() => window.__county.app.campaign!.lots[0]?.id ?? -1)
  await page.getByTestId('weighin').waitFor()
  await page.waitForTimeout(900)
  await shot(page, tag, '07-weigh-in')
  await page.getByTestId(`lot-keep-${lot}`).click()
  await closeDialogs(page)

  await play(page, 'done')
  await closeDialogs(page)
  await page.getByTestId('end-season').waitFor()
  await shot(page, tag, '08-season-done')
  await page.getByTestId('end-season').click()
  await page.getByTestId('month-next').waitFor()
  await closeDialogs(page)
  await shot(page, tag, '09-cellar')
  await axe(page, tag, 'cellar')

  const open = await page.evaluate(() => window.__county.sim.openLots(window.__county.app.campaign!).map(l => l.id))
  if (open.length) await page.getByTestId(`lot-sell-half-${open[0]}`).click()
  for (let k = 0; k < 9 && !(await page.getByTestId('year-next').count()); k++) {
    await page.getByTestId('month-next').click()
    await page.waitForTimeout(60)
    if (k === 3) await shot(page, tag, '09b-cellar-february')
  }
  await page.getByTestId('year-next').waitFor()
  await shot(page, tag, '10-ledger')

  await page.getByTestId('how-open').click()
  await shot(page, tag, '11-how-it-works')
  await page.keyboard.press('Escape')
  await page.getByTestId('settings-open').click()
  await shot(page, tag, '12-settings')
  await page.getByTestId('units-metric').check()
  await page.keyboard.press('Escape')
  await shot(page, tag, '13-ledger-metric')
  await page.getByTestId('settings-open').click()
  await page.getByTestId('units-us').check()
  await page.keyboard.press('Escape')

  await page.getByTestId('year-next').click()
  await page.getByTestId('begin-season').waitFor()
  await shot(page, tag, '14-plan-year-two')

  await page.evaluate(() => {
    const { app } = window.__county
    app.do({ t: 'begin' })
    app.do({ t: 'endSeason' })
    for (let k = 0; k < 10 && app.campaign!.phase === 'cellar'; k++) app.do({ t: 'month' })
  })
  await closeDialogs(page)
  await page.getByTestId('year-next').waitFor()
  await shot(page, tag, '15-ledger-lost')
  await page.getByTestId('year-next').click()
  await page.getByTestId('over-title').waitFor()
  await shot(page, tag, '16-over')

  await page.getByTestId('over-title').click()
  await page.getByTestId('continue').waitFor()
  await shot(page, tag, '17-title-continue')
  await browser.close()
}

let failed = false
try {
  await walk('wide', 1440, 900)
  await walk('phone', 390, 844)
} catch (e) {
  failed = true
  console.error(e)
} finally {
  await server.close()
}
console.log(`screenshots in ${out}`)
for (const s of shots) console.log(`  ${s}`)
console.log('axe:')
for (const line of axeReport) console.log(`  ${line}`)
if (errors.length) {
  console.log('console errors:')
  for (const e of errors) console.log(`  ${e}`)
}
if (failed || errors.length) process.exit(1)
console.log('ok: no console errors')
