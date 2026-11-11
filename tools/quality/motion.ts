// Captures each change of state as a strip of frames, so motion can be reviewed as pictures.
// Usage: node tools/quality/motion.ts <base url> <out dir> [name filter]
import { chromium, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const [base, out, filter = ''] = process.argv.slice(2)
if (!base || !out) throw new Error('usage: motion.ts <base url> <out dir> [name filter]')
mkdirSync(out, { recursive: true })

interface Strip { name: string; what: string; frames: number; gap: number; setup: (p: Page) => Promise<void>; go: (p: Page) => Promise<void> }
const july = async (p: Page) => { await q(p, `q.start(1987, 3); q.run(q.day(6, 12))`); await closeAll(p) }

const STRIPS: Strip[] = [
  { name: 'dialog-open', what: 'Title: the new-farm dialog opens', frames: 6, gap: 60, setup: async () => {}, go: async p => { await p.getByTestId('choose-year').click({ noWaitAfter: true }) } },
  { name: 'begin-season', what: 'Spring plan gives way to the season', frames: 8, gap: 120, setup: async p => { await q(p, `q.g().app.newGame(1987, 3)`) }, go: async p => { await p.getByTestId('begin-season').click({ noWaitAfter: true }) } },
  { name: 'field-select', what: 'Selecting a field: the camera and the panel', frames: 8, gap: 120, setup: july, go: async p => { await p.getByTestId('field-4').first().click({ noWaitAfter: true }) } },
  { name: 'days-running', what: 'The clock running at normal speed in July', frames: 10, gap: 180, setup: july, go: async p => { await q(p, `q.g().app.setSpeed(1)`) } },
  { name: 'test-dig', what: 'A test dig result arrives', frames: 8, gap: 120, setup: async p => { await q(p, `q.start(1987, 3); q.run(q.day(6, 28), ['sample'])`); await closeAll(p); await q(p, `const { app } = q.g(); app.do({ t: 'job', kind: 'sample', field: 2 }); app.do({ t: 'bump', id: app.campaign.season.jobs.at(-1).id })`) }, go: async p => { await q(p, `q.g().app.do({ t: 'day' })`) } },
  { name: 'digging', what: 'The digger at work: tubers coming out', frames: 10, gap: 200, setup: async p => { await q(p, `q.start(1987, 3); q.run('digging', ['sell'], 'status')`); await closeAll(p) }, go: async p => { await q(p, `q.g().app.setSpeed(1)`) } },
  { name: 'weigh-in', what: 'Dig day: the weigh-in arrives', frames: 8, gap: 120, setup: async p => { await q(p, `q.start(1987, 3); q.run('digging', ['sell'], 'status'); const { app } = q.g(); let n = 0; while (!app.campaign.lots.some(l => l.open) && n++ < 3) { if (app.campaign.season.jobs[0].need - app.campaign.season.jobs[0].done <= 1) break; app.do({ t: 'day' }) }`); await closeAll(p) }, go: async p => { await q(p, `q.g().app.do({ t: 'day' })`) } },
  { name: 'to-cellar', what: 'Closing the season: the cellar opens', frames: 8, gap: 120, setup: async p => { await q(p, `q.start(1987, 3); q.run(999, ['sell'])`); await closeAll(p) }, go: async p => { await p.getByTestId('end-season').first().click({ noWaitAfter: true }) } },
  { name: 'month', what: 'The cellar: on to the next month', frames: 6, gap: 100, setup: async p => { await q(p, `q.start(1987, 3); q.run(999, ['sell']); q.winter(0, 9)`); await closeAll(p) }, go: async p => { await p.getByTestId('month-next').click({ noWaitAfter: true }) } },
]

const browser = await chromium.launch({ args: GPU })
const index: { strip: string; what: string; files: string[]; ms: number[]; errors: string[] }[] = []
for (const strip of STRIPS) {
  if (!strip.name.includes(filter)) continue
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(HELPER)
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  const files: string[] = [], ms: number[] = []
  try {
    await page.goto(base)
    await page.waitForFunction(() => '__county' in globalThis)
    await strip.setup(page)
    await page.waitForTimeout(1200)
    const t0 = Date.now()
    await strip.go(page)
    for (let k = 0; k < strip.frames; k++) {
      const file = `${strip.name}.${String(k).padStart(2, '0')}.png`
      await page.screenshot({ path: join(out, file) })
      files.push(file); ms.push(Date.now() - t0)
      await page.waitForTimeout(strip.gap)
    }
  } catch (e) {
    errors.push(String(e).split('\n')[0])
  }
  index.push({ strip: strip.name, what: strip.what, files, ms, errors })
  await ctx.close()
}
await browser.close()
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n')
for (const s of index) console.log(`${s.strip}: ${s.files.length} frames at ${s.ms.join(', ')} ms${s.errors.length ? '  ERROR ' + s.errors[0] : ''}`)
