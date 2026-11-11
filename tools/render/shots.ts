// Screenshots of the field view in named states, for checking the look by eye.
// Usage: node tools/render/shots.ts <base-url> <out-dir> [name ...]
// Start a server first: npx vite --port 5317 --strictPort   (or npm run build && npx vite preview --port 5317)
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:5317/'
const out = process.argv[3] ?? 'shots'
const only = new Set(process.argv.slice(4))
mkdirSync(out, { recursive: true })

interface Shot {
  name: string
  size?: [number, number]
  setup: (page: Page) => Promise<void>
}

// Play a year under reference practice up to (not including) a day, optionally skipping some advice.
async function playTo(page: Page, year: number, seed: number, until: number, skip: string[] = []): Promise<void> {
  await page.evaluate(({ year, seed, until, skip }) => {
    const { app, sim } = (window as any).__county
    app.newGame(year, seed)
    app.do({ t: 'begin' })
    const c = app.campaign
    while (c.phase === 'season' && c.season.day < until) {
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || skip.includes(a.act)) continue
        if (a.act === 'sell') app.do({ t: 'sell', lot: a.lot, frac: 1 })
        else app.do({ t: 'job', kind: a.act, field: a.field })
      }
      if (!app.do({ t: 'day' }).ok) break
    }
  }, { year, seed, until, skip })
}

// One more day of work, left for the field view to play out.
async function step(page: Page, skip: string[] = []): Promise<void> {
  await page.evaluate(skip => {
    const { app, sim } = (window as any).__county
    const c = app.campaign
    for (const a of sim.advise(app.world, c)) {
      if (a.act === 'wait' || a.act === 'close' || skip.includes(a.act)) continue
      if (a.act === 'sell') app.do({ t: 'sell', lot: a.lot, frac: 1 })
      else app.do({ t: 'job', kind: a.act, field: a.field })
    }
    app.do({ t: 'day' })
  }, skip)
}

async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(n => new Promise<void>(res => {
    let k = 0
    const tick = () => (++k >= n ? res() : requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  }), n)
}

async function settle(page: Page): Promise<void> {
  await frames(page, 2)
  await page.evaluate(() => (window as any).__countyField.settle())
  await frames(page, 3)
}

async function seek(page: Page, t: number, wait: number): Promise<void> {
  await frames(page, 2)
  await page.evaluate(t => (window as any).__countyField.seek(t), t)
  await frames(page, wait)
}

const select = (page: Page, i: number) => page.evaluate(i => (window as any).__county.app.select(i), i)

const shots: Shot[] = [
  { name: '01-title', setup: async page => { await page.evaluate(() => (window as any).__county.app.quitToTitle()); await settle(page); await frames(page, 20) } },
  { name: '02-spring-plan', setup: async page => { await page.evaluate(() => (window as any).__county.app.newGame(1977, 5)); await settle(page) } },
  { name: '03-planting', setup: async page => { await playTo(page, 1977, 5, 139); await select(page, 4); await settle(page); await step(page); await seek(page, 0.62, 6) } },
  { name: '04-june-emerging', setup: async page => { await playTo(page, 1977, 5, 160); await settle(page) } },
  { name: '05-july-bloom', setup: async page => { await playTo(page, 1977, 5, 184); await settle(page) } },
  { name: '06-rain', setup: async page => { await playTo(page, 1977, 5, 205); await settle(page); await frames(page, 6) } },
  { name: '07-fog-morning', setup: async page => { await playTo(page, 1977, 5, 172); await settle(page); await frames(page, 4) } },
  { name: '08-august-blight', setup: async page => { await playTo(page, 1979, 5, 226, ['spray', 'rogue']); await settle(page); await select(page, 4); await settle(page) } },
  { name: '09-drought', setup: async page => { await playTo(page, 1995, 5, 222, ['water']); await settle(page) } },
  { name: '10-september-dead-vines', setup: async page => { await playTo(page, 1977, 5, 254); await settle(page) } },
  { name: '11-dig-day', setup: async page => { await playTo(page, 1977, 5, 264); await select(page, 0); await settle(page); await step(page); await seek(page, 0.42, 8) } },
  {
    name: '11b-dig-closeup', setup: async page => {
      await playTo(page, 1977, 5, 264); await select(page, 0); await settle(page)
      await page.mouse.move(900, 400)
      for (let k = 0; k < 5; k++) await page.mouse.wheel(0, -300)
      await step(page); await seek(page, 0.36, 8)
    },
  },
  { name: '12-first-frost', setup: async page => { await playTo(page, 1995, 5, 258); await settle(page) } },
  {
    name: '13-winter-cellar', setup: async page => {
      await playTo(page, 1977, 5, 400)
      await page.evaluate(() => { const { app } = (window as any).__county; if (app.campaign.phase === 'season') app.do({ t: 'endSeason' }); app.do({ t: 'month' }); app.do({ t: 'month' }) })
      await settle(page); await frames(page, 6)
    },
  },
  {
    name: '13b-ledger-thaw', setup: async page => {
      await playTo(page, 1977, 5, 400)
      await page.evaluate(() => { const { app } = (window as any).__county; if (app.campaign.phase === 'season') app.do({ t: 'endSeason' }); for (let k = 0; k < 12 && app.campaign.phase === 'cellar'; k++) app.do({ t: 'month' }) })
      await settle(page); await frames(page, 4)
    },
  },
  { name: '14-selected-field', setup: async page => { await playTo(page, 1977, 5, 184); await select(page, 3); await settle(page) } },
  { name: '14b-test-dig', setup: async page => { await playTo(page, 1977, 5, 203); await select(page, 2); await settle(page); await step(page); await seek(page, 0.27, 3) } },
  { name: '15-phone-title', size: [390, 844], setup: async page => { await page.evaluate(() => (window as any).__county.app.quitToTitle()); await settle(page); await frames(page, 10) } },
  { name: '16-phone-july', size: [390, 844], setup: async page => { await playTo(page, 1977, 5, 184); await settle(page) } },
]

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors: string[] = []
for (const shot of shots) {
  if (only.size && !only.has(shot.name)) continue
  const [w, h] = shot.size ?? [1440, 900]
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  page.on('console', m => { if (m.type() === 'error') errors.push(`${shot.name}: ${m.text()}`) })
  page.on('pageerror', e => errors.push(`${shot.name}: ${e.message}`))
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__countyField !== undefined)
  // Stand in for the interface: a panel down the left on a desktop, a bottom sheet on a phone.
  await page.evaluate(phone => {
    const { app } = (window as any).__county
    if (phone) {
      (document.getElementById('ui') as HTMLElement).style.display = 'none'
      app.setInsets(0, 0, Math.round(innerHeight * 0.42), 0)
    } else app.setInsets(0, 0, 0, 346)
  }, w < 600)
  await shot.setup(page)
  const path = `${out}/${shot.name}.png`
  await page.screenshot({ path })
  const info = await page.evaluate(() => (window as any).__countyField.info())
  console.log(path, JSON.stringify(info))
  await page.close()
}
await browser.close()
if (errors.length) {
  console.log('console errors:')
  for (const e of errors) console.log('  ' + e)
}
