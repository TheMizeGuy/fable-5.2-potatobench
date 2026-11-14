// What a card looks like where it lands: on a large monitor at the interface's own scale (the owner's desk: 2560 by
// 1440 at one and a half device pixels), a July farm of three, each home field picked in turn, then each person,
// then the opening. A whole-window picture of each, and for each card where it lies against the bars and tags.
// Usage: node tools/quality/corner.ts <url> <out dir> [--size=2560x1440] [--dpr=1.5]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/corner'] = args.filter(a => !a.startsWith('--'))
const opt = (name: string, d: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const size = opt('size', '2560x1440').split('x').map(Number), dpr = Number(opt('dpr', '1.5'))
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr })).newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.addInitScript(HELPER)
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })

async function rest(): Promise<void> {
  const t0 = Date.now()
  while (await page.evaluate(() => (globalThis as unknown as { __countyField: { rig: { moving(): boolean } } }).__countyField.rig.moving()) && Date.now() - t0 < 8000) await page.waitForTimeout(100)
  await page.waitForTimeout(900)
}
// Where each paper of the interface lies, and which lie over which.
const laid = () => page.evaluate(() => {
  const box = (sel: string) => [...document.querySelectorAll<HTMLElement>(`#ui ${sel}`)].filter(e => e.offsetParent !== null && !e.closest('[hidden], .gone, .leaving')).map(e => { const r = e.getBoundingClientRect(); return { sel, l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } }).filter(r => r.r > r.l && r.b > r.t)
  const card = [...box('[data-testid="card"]'), ...box('.person-card'), ...box('.whois')]
  const others = [...box('.command.bar, .mainbar, .menubar'), ...box('.timebook'), ...box('.queue'), ...box('.topbar .mount'), ...box('.topbar .goal'), ...box('.paused, [data-testid="running"]'), ...box('.plate-layer .tag-wrap:not(.gone) .tag'), ...box('.notes .alert')]
  const over: string[] = []
  for (const c of card) for (const o of others) {
    const w = Math.min(c.r, o.r) - Math.max(c.l, o.l), h = Math.min(c.b, o.b) - Math.max(c.t, o.t)
    if (w > 2 && h > 2) over.push(`${c.sel} over ${o.sel} by ${w}x${h}`)
    if (c.r > innerWidth + 1 || c.b > innerHeight + 1 || c.l < -1 || c.t < -1) over.push(`${c.sel} runs off the window`)
  }
  return { card: card.map(c => `${c.sel} ${c.l},${c.t} ${c.r - c.l}x${c.b - c.t}`), over: [...new Set(over)], zoom: getComputedStyle(document.getElementById('ui')!).zoom, bars: [...new Set(others.map(o => o.sel))] }
})
async function shot(name: string): Promise<void> {
  await rest()
  await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 80 })
  const l = await laid()
  console.log(`${name}: ${l.card.join(' | ') || 'no card'}${l.over.length ? `  OVER: ${l.over.join('; ')}` : ''}  (zoom ${l.zoom})`)
}

await q(page, `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 20000; app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'auto' })
  q.run(q.day(7, 6), ['hill', 'spray']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
await closeAll(page)
await shot('0-july')
for (let i = 0; i < 6; i++) {
  await q(page, `q.g().app.select(${i})`)
  await shot(`1-field-${i}`)
}
await q(page, `q.g().app.select(-1)`)
for (const id of [0, 1]) {
  await page.getByTestId(`unit-${id}`).click().catch(() => {})
  await shot(`2-person-${id}`)
  await page.keyboard.press('Escape')
}
// Clicked on the land itself, as a player does: each field's own ground.
for (const i of [3, 5]) {
  const at = await page.evaluate(k => (globalThis as unknown as { __countyField: { anchor(i: number): { x: number; y: number } } }).__countyField.anchor(k), i)
  await page.mouse.click(at.x, at.y + 40)
  await shot(`3-clicked-${i}`)
  await page.keyboard.press('Escape')
}
console.log(`errors: ${errors.length} ${errors.slice(0, 3).join(' ; ')}`)
await browser.close()
