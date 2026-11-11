// Screenshots of the field view in named states, for checking the look by eye.
// Usage: node tools/render/shots.ts <base-url> <out-dir> [name ...] [--soft]
// Start a server first: npx vite --port 5317 --strictPort   (or npm run build && npx vite preview --port 5317)
// Renders on the real GPU; --soft uses SwiftShader instead (slow, for machines without one).
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from '@playwright/test'

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const soft = process.argv.includes('--soft')
const base = args[0] ?? 'http://localhost:5317/'
const out = args[1] ?? 'shots'
const only = new Set(args.slice(2))
mkdirSync(out, { recursive: true })

interface Insets { top?: number; right?: number; bottom?: number; left?: number }

interface Shot {
  name: string
  size?: [number, number]
  // Screen edges covered by the interface; drawn as grey stand-in panels. Default: a left panel on a desktop, a bottom sheet on a phone.
  insets?: Insets
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

// Keep playing, a day at a time, until a field shows frost-blackened leaf (or the season ends).
async function playToFrost(page: Page, skip: string[]): Promise<string> {
  return page.evaluate(skip => {
    const { app, sim } = (window as any).__county
    const c = app.campaign
    for (let n = 0; n < 120 && c.phase === 'season'; n++) {
      const hit = [0, 1, 2, 3, 4, 5].map(i => sim.fieldInfo(c, i)).filter((f: any) => f.frosted > 0.2 && f.rime)
      if (hit.length) return `day ${c.season.day}: ${hit.map((f: any) => `${f.name} ${Math.round(f.frosted * 100)}% frosted`).join(', ')}`
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || skip.includes(a.act)) continue
        if (a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
      }
      if (!app.do({ t: 'day' }).ok) break
    }
    return 'no frost found'
  }, skip)
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

// Set how many times each field has been hilled (a test-only edit of the campaign) and redraw.
async function hilled(page: Page, passes: number[]): Promise<void> {
  await page.evaluate(passes => {
    const { app } = (window as any).__county
    passes.forEach((p, i) => { const f = app.campaign.season.fields[i]; if (f.status !== 'rest') f.hillPasses = p })
    app.emit({ type: 'change' })
  }, passes)
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
const july = (page: Page) => playTo(page, 1977, 5, 184)
// The wide layout's panels at 1440 x 900: header, coach and weather on the left, fields and work on the right, field cards below.
const RAILS: Insets = { top: 80, left: 322, right: 390, bottom: 110 }

const shots: Shot[] = [
  { name: '01-title', setup: async page => { await page.evaluate(() => (window as any).__county.app.quitToTitle()); await settle(page); await frames(page, 20) } },
  { name: '02-spring-plan', setup: async page => { await page.evaluate(() => (window as any).__county.app.newGame(1977, 5)); await settle(page) } },
  { name: '03-planting', setup: async page => { await playTo(page, 1977, 5, 139); await select(page, 4); await settle(page); await step(page); await seek(page, 0.62, 6) } },
  { name: '04-june-emerging', setup: async page => { await playTo(page, 1977, 5, 160); await settle(page) } },
  { name: '05-july-bloom', setup: async page => { await july(page); await settle(page) } },
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
  { name: '14-selected-field', setup: async page => { await july(page); await select(page, 3); await settle(page) } },
  { name: '14b-test-dig', setup: async page => { await playTo(page, 1977, 5, 203); await select(page, 2); await settle(page); await step(page); await seek(page, 0.27, 3) } },
  { name: '15-phone-title', size: [390, 844], setup: async page => { await page.evaluate(() => (window as any).__county.app.quitToTitle()); await settle(page); await frames(page, 10) } },
  { name: '16-phone-july', size: [390, 844], setup: async page => { await july(page); await settle(page) } },

  // Hilling: the same fields on the same day, never hilled, hilled once and hilled twice, then side by side; the panels as on a laptop.
  ...[0, 1, 2].map(p => ({ name: `20-hilling-${p}`, insets: RAILS, setup: async (page: Page) => { await playTo(page, 1977, 5, 166, ['hill']); await hilled(page, [p, p, p, p, p, p]); await settle(page) } })),
  { name: '20-hilling-mixed', insets: RAILS, setup: async page => { await playTo(page, 1977, 5, 166, ['hill']); await hilled(page, [0, 1, 2, 0, 1, 2]); await settle(page) } },
  { name: '20-hilling-mixed-early', insets: RAILS, setup: async page => { await playTo(page, 1977, 5, 152, ['hill']); await hilled(page, [0, 1, 2, 0, 1, 2]); await settle(page) } },

  // Frost: late September 2020, vines not killed, the first night that blackens leaf; the bottom fields freeze first.
  {
    name: '21-frost-morning', setup: async page => {
      await playTo(page, 2020, 5, 255, ['kill', 'dig'])
      console.log('  ', await playToFrost(page, ['kill', 'dig']))
      await settle(page)
    },
  },
  { name: '21b-frost-before', setup: async page => { await playTo(page, 2020, 5, 255, ['kill', 'dig']); await settle(page) } },
  {
    name: '21c-frost-two-days-on', setup: async page => {
      await playTo(page, 2020, 5, 255, ['kill', 'dig'])
      await playToFrost(page, ['kill', 'dig'])
      await step(page, ['kill', 'dig']); await step(page, ['kill', 'dig'])
      await settle(page)
    },
  },

  // A thin stand: seed planted early into cold, wet ground, with gaps where it rotted.
  {
    name: '22-thin-stand', setup: async page => {
      await page.evaluate(() => {
        const { app, sim } = (window as any).__county
        app.newGame(1977, 5)
        app.do({ t: 'begin' })
        const c = app.campaign
        for (let i = 0; i < 6; i++) app.do({ t: 'job', kind: 'plant', field: i })
        while (c.phase === 'season' && c.season.day < 178) {
          for (const a of sim.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && a.act !== 'plant') app.do({ t: 'job', kind: a.act, field: a.field })
          if (!app.do({ t: 'day' }).ok) break
        }
        console.log('stand', [0, 1, 2, 3, 4, 5].map(i => sim.fieldInfo(c, i).stand.toFixed(2)).join(' '))
      })
      await settle(page)
    },
  },

  // Sizes: the farm kept visible and as large as the free area allows, with a field selected too.
  ...([
    ['30-size-320x640', [320, 640], {}],
    ['31-size-320x640-sheet', [320, 640], { top: 60, bottom: 330 }],
    ['32-size-390x844-sheet', [390, 844], { top: 110, bottom: 300 }],
    ['33-size-844x390-right', [844, 390], { top: 50, right: 420 }],
    ['34-size-1024x700-rails', [1024, 700], { top: 80, left: 320, right: 390 }],
    ['35-size-1440x900', [1440, 900], {}],
    ['36-size-1440x900-rails', [1440, 900], RAILS],
  ] as [string, [number, number], Insets][]).flatMap(([name, size, insets]) => [
    { name, size, insets, setup: async (page: Page) => { await july(page); await settle(page) } },
    { name: `${name}-selected`, size, insets, setup: async (page: Page) => { await july(page); await select(page, 0); await settle(page) } },
  ]),
]

const browser = await chromium.launch({
  args: soft ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const errors: string[] = []
for (const shot of shots) {
  if (only.size && !only.has(shot.name) && ![...only].some(o => o.endsWith('*') && shot.name.startsWith(o.slice(0, -1)))) continue
  const [w, h] = shot.size ?? [1440, 900]
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  page.on('console', m => { if (m.type() === 'error') errors.push(`${shot.name}: ${m.text()}`); else if (m.text().startsWith('stand')) console.log('  ', m.text()) })
  page.on('pageerror', e => errors.push(`${shot.name}: ${e.message}`))
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__countyField !== undefined)
  // Stand in for the interface: the real panels are hidden and grey blocks mark the screen edges they would cover.
  const insets = shot.insets ?? (w < 600 ? { bottom: Math.round(h * 0.42) } : { left: 346 })
  await page.evaluate(i => {
    const { app } = (window as any).__county
    ;(document.getElementById('ui') as HTMLElement).style.display = 'none'
    const t = i.top ?? 0, r = i.right ?? 0, b = i.bottom ?? 0, l = i.left ?? 0
    // The hidden interface would report no panels at all; hold the stand-in edges instead.
    const set = app.setInsets.bind(app)
    app.setInsets = () => set(t, r, b, l)
    set(t, r, b, l)
    const box = (css: string) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;background:rgba(243,236,220,0.82);border:1px solid #c9bfa6;pointer-events:none;${css}`; document.body.append(d) }
    if (t) box(`left:0;right:0;top:0;height:${t}px`)
    if (b) box(`left:0;right:0;bottom:0;height:${b}px`)
    if (l) box(`left:0;top:${t}px;bottom:${b}px;width:${l}px`)
    if (r) box(`right:0;top:${t}px;bottom:${b}px;width:${r}px`)
  }, insets)
  await shot.setup(page)
  const path = `${out}/${shot.name}.png`
  await page.screenshot({ path })
  const info = await page.evaluate(() => {
    const f = (window as any).__countyField
    const anchors = [0, 1, 2, 3, 4, 5].map(i => f.anchor(i))
    return { ...f.info(), anchors: anchors.map((a: any) => (a.visible ? `${Math.round(a.x)},${Math.round(a.y)}` : 'off')).join(' '), triangles: f.stats ? f.stats().triangles : undefined }
  })
  console.log(path, JSON.stringify(info))
  await page.close()
}
await browser.close()
if (errors.length) {
  console.log('console errors:')
  for (const e of errors) console.log('  ' + e)
}
