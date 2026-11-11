// Walks every screen at desktop and phone size, saves named screenshots, runs axe, and fails on any console error.
// Usage: node src/ui/dev/shots.ts [output folder]    (ENGINE=firefox or ENGINE=webkit to use another browser)
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, firefox, webkit, type Page } from '@playwright/test'
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

const problems: string[] = []

// At phone width: nothing may scroll sideways, and every control must be at least 40 px square to the finger.
async function layoutCheck(page: Page, tag: string, name: string): Promise<void> {
  const r = await page.evaluate((phone) => {
    const out: string[] = []
    if (document.scrollingElement!.scrollWidth > innerWidth) out.push(`page scrolls sideways (${document.scrollingElement!.scrollWidth}px)`)
    for (const el of document.querySelectorAll<HTMLElement>('.sheet, .sheet-body, .dialog-body, .rail, .bottom-sheet, .topbar')) {
      if (el.scrollWidth <= el.clientWidth + 1) continue
      const edge = el.getBoundingClientRect().right
      const wide = [...el.querySelectorAll<HTMLElement>('*')].filter(x => x.getBoundingClientRect().right > edge + 1).map(x => x.className || x.tagName).slice(0, 4)
      out.push(`${el.className} overflows sideways by ${el.scrollWidth - el.clientWidth}px (${wide.join(', ')})`)
    }
    if (phone) {
      const top = document.querySelector('.dialog:last-of-type') ?? document
      for (const el of top.querySelectorAll<HTMLElement>('button:not(:disabled), select, label.seg-opt, label.check, input[type=range]')) {
        const b = el.getBoundingClientRect()
        if (b.width === 0 || el.closest('.visually-hidden') || el.closest('[inert]')) continue
        if (b.height < 39.5 || b.width < 39.5) out.push(`small target ${el.dataset.testid ?? el.className} ${Math.round(b.width)}x${Math.round(b.height)}`)
      }
    }
    return out
  }, tag === 'phone')
  for (const p of r) problems.push(`${tag} ${name}: ${p}`)
}

async function shot(page: Page, tag: string, name: string): Promise<void> {
  await page.waitForTimeout(350)
  const file = join(out, `${tag}-${name}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
  await layoutCheck(page, tag, name)
}

function expect(ok: boolean, what: string): void {
  if (!ok) problems.push(what)
}

// Keyboard: Space, 1 2 3, [ ] and arrows, a job letter, Escape; dialogs keep and give back focus.
async function keyboard(page: Page, tag: string): Promise<void> {
  const state = () => page.evaluate(() => ({ speed: window.__county.app.speed, sel: window.__county.app.selected, jobs: window.__county.app.campaign!.season!.jobs.map(j => `${j.kind}:${j.field}`) }))
  await page.mouse.click(5, 450)
  await page.keyboard.press('2')
  expect((await state()).speed === 2, `${tag}: key 2 did not set speed 2`)
  await page.keyboard.press(' ')
  expect((await state()).speed === 0, `${tag}: Space did not pause`)
  await page.keyboard.press(']')
  await page.keyboard.press(']')
  await page.keyboard.press('[')
  expect((await state()).sel === 0, `${tag}: [ and ] did not step to field 0`)
  await page.keyboard.press('ArrowRight')
  expect((await state()).sel === 1, `${tag}: arrow did not step to field 1`)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('p')
  expect((await state()).jobs.includes('plant:0'), `${tag}: P did not queue planting`)
  await page.keyboard.press('Escape')
  expect((await state()).sel === -1, `${tag}: Escape did not let go of the field`)
  const id = await page.evaluate(() => window.__county.app.campaign!.season!.jobs[0]?.id ?? -1)
  if (tag === 'phone') await page.getByTestId('tab-work').click()
  if (id >= 0) await page.getByTestId(`job-cancel-${id}`).click()
  expect((await state()).jobs.length === 0, `${tag}: cancel did not empty the work list`)
  await page.getByTestId('field-0').click()
  if (tag === 'phone') await page.getByTestId('tab-field').click()
  await page.getByTestId('act-plant').focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
  expect((await state()).jobs.includes('plant:0'), `${tag}: Enter on Plant did not queue it`)
  expect(await page.evaluate(() => !!document.activeElement?.closest('.fieldpanel')), `${tag}: focus was lost after queuing a job from the keyboard`)
  const id2 = await page.evaluate(() => window.__county.app.campaign!.season!.jobs[0]?.id ?? -1)
  if (tag === 'phone') await page.getByTestId('tab-work').click()
  if (id2 >= 0) await page.getByTestId(`job-cancel-${id2}`).click()
  await page.keyboard.press('Escape')
  await page.getByTestId('how-open').focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('how').waitFor()
  for (let k = 0; k < 6; k++) await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('.dialog')), `${tag}: focus left the open dialog`)
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
  expect(ring === 'solid', `${tag}: no focus ring on ${ring}`)
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid === 'how-open'), `${tag}: focus did not return to the button that opened the dialog`)
  const ins = await page.evaluate(() => window.__county.app.insets)
  insetReport.push(`${tag} season insets: top ${ins.top}, right ${ins.right}, bottom ${ins.bottom}, left ${ins.left}`)
  expect(ins.top > 0 && ins.bottom > 0 && (tag === 'phone' || (ins.left > 0 && ins.right > 0)), `${tag}: insets not set`)
}
const insetReport: string[] = []

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
  const engine = process.env.ENGINE ?? 'chromium'
  const browser = engine === 'firefox' ? await firefox.launch() : engine === 'webkit' ? await webkit.launch()
    : await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const context = await browser.newContext({ viewport: { width, height } })
  const page = await context.newPage()
  try {
    await steps(page, tag, width)
  } catch (e) {
    await page.screenshot({ path: join(out, `${tag}-failure.png`) })
    const where = await page.evaluate(() => ({ screen: window.__county.app.screen, phase: window.__county.app.campaign?.phase, month: window.__county.app.campaign?.month })).catch(() => null)
    throw new Error(`${tag} walk stopped (${JSON.stringify(where)}): ${(e as Error).message}`)
  } finally {
    await browser.close()
  }
}

async function steps(page: Page, tag: string, width: number): Promise<void> {
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
  await keyboard(page, tag)

  await play(page, 'day', await page.evaluate(() => window.__county.sim.dayIndex(1977, 6, 22)))
  await closeDialogs(page)
  await page.getByTestId('field-2').click()
  for (const kind of ['water', 'scout', 'sample']) {
    const b = page.getByTestId(`act-${kind}`)
    if (await b.isEnabled()) await b.click()
  }
  if (width < 600) {
    await page.getByTestId('tab-field').click()
    await page.locator('.sheet-body').evaluate(el => { el.scrollTop = 0 })
  } else await page.locator('.fieldpanel').evaluate(el => { el.scrollTop = 0 })
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
  for (let k = 0; k < 9 && (await page.evaluate(() => window.__county.app.campaign!.phase)) === 'cellar'; k++) {
    const before = await page.evaluate(() => window.__county.app.campaign!.month)
    await page.getByTestId('month-next').click()
    await page.waitForFunction(m => window.__county.app.campaign!.month !== m || window.__county.app.campaign!.phase !== 'cellar', before)
    if (k === 3) {
      await page.getByText('The cellar, March').waitFor()
      await shot(page, tag, '09b-cellar-march')
    }
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
for (const line of insetReport) console.log(line)
if (problems.length) {
  console.log('problems:')
  for (const p of problems) console.log(`  ${p}`)
}
if (errors.length) {
  console.log('console errors:')
  for (const e of errors) console.log(`  ${e}`)
}
if (failed || errors.length || problems.length) process.exit(1)
console.log('ok: no console errors, keyboard and layout checks passed')
