// Captures every screen of the game, in every state and at every size, on the real GPU, for review.
// Usage: node tools/quality/capture.ts <base url> <out dir> [name filter]
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const [base, out, filter = ''] = process.argv.slice(2)
if (!base || !out) throw new Error('usage: capture.ts <base url> <out dir> [name filter]')
mkdirSync(out, { recursive: true })

interface Size { width: number; height: number; touch?: boolean; scale?: number }
const SIZES: Record<string, Size> = {
  desk: { width: 1440, height: 900 },
  phone: { width: 390, height: 844, touch: true, scale: 2 },
  wide: { width: 1920, height: 1080 },
  laptop: { width: 1280, height: 720 },
  small: { width: 1024, height: 700 },
  tablet: { width: 820, height: 1180, touch: true },
  land: { width: 844, height: 390, touch: true, scale: 2 },
  tiny: { width: 320, height: 640, touch: true, scale: 2 },
}
const MAIN = ['desk', 'phone']
const ALL = Object.keys(SIZES)

type Step = (page: Page, size: string) => Promise<void>
interface State { name: string; what: string; sizes: string[]; run: Step }

const isPhone = (size: string) => SIZES[size].width <= 760

async function selectField(page: Page, size: string, i: number): Promise<void> {
  await page.getByTestId(`field-${i}`).first().click()
  if (isPhone(size)) await page.getByTestId('tab-field').click().catch(() => {})
}

const july: Step = async page => { await q(page, `q.start(1987, 3); q.run(q.day(6, 12))`); await closeAll(page) }

const STATES: State[] = [
  { name: 'title', what: 'Title screen, first visit', sizes: ALL, run: async () => {} },
  { name: 'title-continue', what: 'Title screen with a saved farm', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(q.day(5, 1)); q.g().app.quitToTitle()`) } },
  { name: 'new-farm', what: 'New farm: choosing the first year', sizes: [...MAIN, 'small', 'land'], run: async page => { await page.getByTestId('new-farm').click() } },
  { name: 'how-it-works', what: 'How it works', sizes: MAIN, run: async page => { await page.getByRole('button', { name: 'How it works' }).first().click() } },
  { name: 'menu', what: 'Menu and settings, opened in season', sizes: MAIN, run: async page => { await july(page, ''); await page.getByTestId('settings-open').first().click() } },
  { name: 'plan-first', what: 'Spring plan, first year', sizes: ALL, run: async page => { await q(page, `q.g().app.newGame(1987, 3)`) } },
  { name: 'plan-second', what: 'Spring plan, second year, after a full season', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.year(3); q.g().app.do({ t: 'next' })`); await closeAll(page) } },
  { name: 'season-first-day', what: 'April 20: the season opens and nothing can be done yet', sizes: [...MAIN, 'small'], run: async page => { await q(page, `q.start(1987, 3)`) } },
  { name: 'season-planting', what: 'Planting day', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run('plant', [], 'work')`); await closeAll(page) } },
  { name: 'season-june', what: 'June: rows emerging, first hilling', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(q.day(5, 22))`); await closeAll(page) } },
  { name: 'season-july-field', what: 'July: in bloom, a field selected', sizes: ALL, run: async (page, size) => { await july(page, size); await selectField(page, size, 2) } },
  { name: 'season-worklist', what: 'July: a full work list', sizes: MAIN, run: async (page, size) => {
    await july(page, size)
    await q(page, `const { app } = q.g(); for (const k of ['scout', 'spray', 'sample']) for (let i = 0; i < 6; i++) app.do({ t: 'job', kind: k, field: i })`)
    await page.getByTestId(`field-0`).first().click()
    if (isPhone(size)) await page.getByTestId('tab-work').click().catch(() => {})
  } },
  { name: 'season-blight', what: 'August 1979, never sprayed: blight found and spreading', sizes: MAIN, run: async (page, size) => { await q(page, `q.start(1979, 3); q.run(q.day(7, 15), ['spray', 'rogue'])`); await closeAll(page); await selectField(page, size, 4) } },
  { name: 'season-drought', what: 'August 1995: drought', sizes: MAIN, run: async (page, size) => { await q(page, `q.start(1995, 3); q.run(q.day(7, 10), ['water'])`); await closeAll(page); await selectField(page, size, 0) } },
  { name: 'season-fog', what: 'A fog morning in July', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(q.day(6, 1)); q.run(['fog'], [], 'sky')`); await closeAll(page) } },
  { name: 'season-rain', what: 'A day of rain in July', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(q.day(6, 1)); q.run(['rain', 'storm'], [], 'sky')`); await closeAll(page) } },
  { name: 'season-frost', what: 'Late September 2020, vines still green: first frost', sizes: MAIN, run: async page => { await q(page, `q.start(2020, 3); q.run(q.day(8, 21), ['kill', 'dig'])`); await closeAll(page) } },
  { name: 'season-dead-vines', what: 'Mid September: vines dead, skins setting', sizes: MAIN, run: async (page, size) => { await q(page, `q.start(1987, 3); q.run(q.day(8, 16))`); await closeAll(page); await selectField(page, size, 2) } },
  { name: 'season-digging', what: 'Dig day in progress', sizes: MAIN, run: async page => {
    await q(page, `q.start(1987, 3); q.run('digging', ['sell'], 'status')`)
    await closeAll(page)
    await q(page, `q.g().app.setSpeed(1)`)
    await page.waitForTimeout(1300)
    await q(page, `q.g().app.setSpeed(0)`)
    await closeAll(page)
  } },
  { name: 'test-dig', what: 'Test dig: one hill lifted', sizes: [...MAIN, 'small', 'land'], run: async (page, size) => {
    await q(page, `q.start(1987, 3); q.run(q.day(6, 28), ['sample'])`)
    await closeAll(page)
    await q(page, `const { app } = q.g(); app.do({ t: 'job', kind: 'sample', field: 2 }); app.do({ t: 'bump', id: app.campaign.season.jobs.at(-1).id }); app.do({ t: 'day' })`)
    await page.getByTestId('sample-dialog').waitFor({ timeout: 5000 }).catch(() => {})
    void size
  } },
  { name: 'weigh-in', what: 'Dig day: the weigh-in', sizes: ALL, run: async (page, size) => {
    await q(page, `q.start(1987, 3); q.run(999, ['sell'], 'lot')`)
    await closeAll(page)
    const lot = await q(page, `const c = q.g().app.campaign; const l = c.lots.find(l => l.open); return { id: l.id, field: l.field }`) as { id: number; field: number }
    await selectField(page, size, lot.field)
    await page.getByTestId(`weighin-${lot.id}`).click()
    await page.getByTestId('weighin').waitFor({ timeout: 5000 }).catch(() => {})
  } },
  { name: 'season-done', what: 'Everything dug: closing out the season', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(999, ['sell'])`); await closeAll(page) } },
  { name: 'end-early', what: 'Ending the season early: the confirmation', sizes: MAIN, run: async (page, size) => {
    await july(page, size)
    await page.getByTestId('settings-open').first().click()
    await page.getByTestId('end-season-early').click()
  } },
  { name: 'cellar-november', what: 'The cellar in November', sizes: ALL, run: async page => { await q(page, `q.start(1987, 3); q.run(999, ['sell']); q.winter(0, 9)`); await closeAll(page) } },
  { name: 'cellar-march', what: 'The cellar in March, four months in', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(999, ['sell']); q.winter(4, 9)`); await closeAll(page) } },
  { name: 'ledger', what: 'Year-end ledger after a first season', sizes: ALL, run: async page => { await q(page, `q.start(1987, 3); q.year(3)`); await closeAll(page) } },
  { name: 'ledger-fifth', what: 'The fifth ledger: the farm is kept (or not)', sizes: MAIN, run: async page => {
    await q(page, `const { app } = q.g(); app.newGame(2012, 3); for (let y = 0; y < 5; y++) { app.do({ t: 'begin' }); q.year(4); if (y < 4) app.do({ t: 'next' }) }`)
    await closeAll(page)
  } },
  { name: 'ledger-lost', what: 'The ledger when the bank calls the note', sizes: MAIN, run: async page => {
    await q(page, `const { app } = q.g(); app.newGame(1990, 3); for (let y = 0; y < 5 && app.campaign.outcome === ''; y++) { if (y) app.do({ t: 'next' }); app.do({ t: 'begin' }); app.do({ t: 'endSeason' }); q.winter(12, 0) }`)
    await closeAll(page)
  } },
  { name: 'over', what: 'After the farm is lost', sizes: MAIN, run: async page => {
    await q(page, `const { app } = q.g(); app.newGame(1990, 3); for (let y = 0; y < 5 && app.campaign.outcome === ''; y++) { if (y) app.do({ t: 'next' }); app.do({ t: 'begin' }); app.do({ t: 'endSeason' }); q.winter(12, 0) } app.do({ t: 'next' })`)
    await closeAll(page)
  } },
  { name: 'metric', what: 'July with metric units', sizes: MAIN, run: async (page, size) => { await july(page, size); await q(page, `q.g().app.setSetting('units', 'metric')`); await selectField(page, size, 2) } },
]

// Runs in the page: what styles are actually in use on screen, and what overflows.
const AUDIT = `(() => {
  const out = { size: {}, color: {}, bg: {}, radius: {}, weight: {}, family: {}, small: [], clipped: [], tiny: [], words: 0, controls: 0,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1 }
  const name = el => (el.dataset.testid || el.className || el.tagName).toString().slice(0, 40)
  const touch = matchMedia('(pointer: coarse)').matches
  for (const el of document.querySelectorAll('#ui *')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    const text = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())
    if (el.matches('button, a[href], input, select, [role=button], [role=tab]')) out.controls++
    if (text) {
      for (const n of el.childNodes) if (n.nodeType === 3) out.words += n.nodeValue.trim().split(/\\s+/).filter(Boolean).length
      bump(out.size, cs.fontSize); bump(out.color, cs.color); bump(out.weight, cs.fontWeight); bump(out.family, cs.fontFamily.split(',')[0].trim())
      if (parseFloat(cs.fontSize) < 12) out.small.push(name(el) + ' ' + cs.fontSize)
      if (cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1) out.clipped.push(name(el))
    }
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bump(out.bg, cs.backgroundColor)
    if (cs.borderTopLeftRadius !== '0px') bump(out.radius, cs.borderTopLeftRadius)
    if (touch && el.matches('button, a, input, select, [role=button]') && (r.width < 40 || r.height < 40)) out.tiny.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
  }
  return out
})()`

interface Audit { size: Record<string, number>; color: Record<string, number>; bg: Record<string, number>; radius: Record<string, number>; weight: Record<string, number>; family: Record<string, number>; small: string[]; clipped: string[]; tiny: string[]; words: number; controls: number; overflowX: number }
const audits: Record<string, Audit> = {}

const browser = await chromium.launch({ args: GPU })
const index: { file: string; state: string; size: string; what: string; errors: string[] }[] = []

async function shoot(ctx: BrowserContext, state: State, size: string): Promise<void> {
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  try {
    await page.goto(base)
    await page.waitForFunction(() => '__county' in globalThis)
    await page.evaluate(() => localStorage.clear())
    await state.run(page, size)
    await page.evaluate(() => (globalThis as unknown as { __countyField?: { settle?: () => void } }).__countyField?.settle?.())
    await page.waitForTimeout(900)
    audits[`${state.name}.${size}`] = await page.evaluate(AUDIT) as Audit
  } catch (e) {
    errors.push(`capture: ${String(e).split('\n')[0]}`)
  }
  const file = `${state.name}.${size}.png`
  await page.screenshot({ path: join(out, file) })
  index.push({ file, state: state.name, size, what: state.what, errors })
  await page.close()
}

await Promise.all(ALL.map(async size => {
  const s = SIZES[size]
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale ?? 1, hasTouch: !!s.touch, isMobile: !!s.touch && s.width < 900 })
  await ctx.addInitScript(HELPER)
  for (const state of STATES) {
    if (!state.sizes.includes(size) || !state.name.includes(filter)) continue
    await shoot(ctx, state, size)
  }
  await ctx.close()
}))
await browser.close()

index.sort((a, b) => a.file.localeCompare(b.file))
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n')
const total: Record<string, Record<string, number>> = { size: {}, color: {}, bg: {}, radius: {}, weight: {}, family: {} }
const problems: Record<string, string[]> = {}
for (const [frame, a] of Object.entries(audits)) {
  for (const k of Object.keys(total)) for (const [v, n] of Object.entries(a[k as 'size'])) total[k][v] = (total[k][v] ?? 0) + n
  const p = [...(a.overflowX > 1 ? [`page scrolls sideways by ${a.overflowX}px`] : []), ...[...new Set(a.clipped)].map(x => `clipped text: ${x}`),
    ...[...new Set(a.small)].map(x => `text under 12px: ${x}`), ...[...new Set(a.tiny)].map(x => `touch target under 40px: ${x}`)]
  if (p.length) problems[frame] = p
}
const ranked = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1]))
writeFileSync(join(out, 'styles.json'), JSON.stringify({
  distinct: Object.fromEntries(Object.entries(total).map(([k, v]) => [k, Object.keys(v).length])),
  inUse: Object.fromEntries(Object.entries(total).map(([k, v]) => [k, ranked(v)])),
  problems,
  // How much the player is asked to read and choose between on each frame.
  load: Object.fromEntries(Object.entries(audits).map(([f, a]) => [f, { words: a.words, controls: a.controls }])),
}, null, 1) + '\n')
console.log('distinct in use:', Object.entries(total).map(([k, v]) => `${k} ${Object.keys(v).length}`).join(', '), `| frames with layout problems: ${Object.keys(problems).length}`)
const bad = index.filter(x => x.errors.length)
console.log(`${index.length} frames in ${out}; ${bad.length} with errors`)
for (const x of bad) console.log(`  ${x.file}: ${x.errors[0]}`)
