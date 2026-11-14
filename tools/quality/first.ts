// What someone who presses Play sees, with no tips: the window a second after Play, at the first thing the game asks,
// after that is answered, and some seconds into the first work. A whole-window picture of each, with the words on show.
// Usage: node tools/quality/first.ts <url> <out dir> [--size=2533x1295] [--dpr=1.5] [--tips]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { GPU } from './shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/first'] = args.filter(a => !a.startsWith('--'))
const opt = (name: string, d: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const size = opt('size', '2533x1295').split('x').map(Number), dpr = Number(opt('dpr', '1.5')), tips = args.includes('--tips')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr })).newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })

type G = { __county: { app: { speed: number; pauseCause: string; campaign: { phase: string; season?: { day: number; jobs: { kind: string }[] } } | null } } }
const game = () => page.evaluate(() => { const a = (globalThis as unknown as G).__county.app; return { speed: a.speed, cause: a.pauseCause, phase: a.campaign?.phase ?? '', day: a.campaign?.season?.day ?? -1, jobs: a.campaign?.season?.jobs.map(j => j.kind).join(',') ?? '' } })
// The words a player can read, outside the 3D view: every visible text in the interface, in reading order.
const words = () => page.evaluate(() => {
  const seen: string[] = []
  const walk = document.createTreeWalker(document.getElementById('ui')!, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement!, t = (n.textContent ?? '').trim()
    if (!t || el.closest('[hidden], [aria-hidden="true"], .sr, .gone')) continue
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || Number(cs.opacity) < 0.1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
    seen.push(t)
  }
  return { n: seen.join(' ').split(/\s+/).length, text: seen.join(' | ').slice(0, 900), keys: [...document.querySelectorAll<HTMLElement>('#ui button, #ui [role="button"]')].filter(e => e.offsetParent !== null && !e.closest('[hidden]')).length }
})
let k = 0
async function shot(name: string): Promise<void> {
  await page.screenshot({ path: `${out}/${k}-${name}.jpg`, type: 'jpeg', quality: 80 })
  const w = await words(), g = await game()
  console.log(`${k++}-${name}: ${w.n} words, ${w.keys} keys; ${g.phase} day ${g.day} speed ${g.speed} ${g.cause} jobs[${g.jobs}]\n    ${w.text}`)
}
const t0 = Date.now()
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
await page.getByTestId('play').first().click()
await page.waitForTimeout(1200)
const offer = page.getByTestId(tips ? 'guide-accept' : 'guide-refuse')
if (await offer.count()) { await shot('offer'); await offer.click(); await page.waitForTimeout(1200) }
await shot(`after-play-${since()}`)
const begin = page.getByTestId('begin-season')
if ((await game()).phase === 'plan' && await begin.count()) { await begin.click(); await page.waitForTimeout(1500); await shot(`after-start-${since()}`) }
// The first thing the game stops for.
for (let n = 0; n < 600 && (await game()).speed !== 0; n++) await page.waitForTimeout(100)
await page.waitForTimeout(1200)
await shot(`first-stop-${since()}`)
// Answer it the way the screen asks: the first ringed stamp.
const stamp = page.locator('#ui [data-testid^="badge-"]').first()
if (await stamp.count()) { await stamp.click(); await page.waitForTimeout(1500); await shot(`answered-${since()}`) }
if ((await game()).speed === 0) await page.keyboard.press('Space')
await page.waitForTimeout(12000)
await shot(`twelve-seconds-on-${since()}`)
await page.waitForTimeout(30000)
await shot(`forty-seconds-on-${since()}`)
console.log(`errors: ${errors.length} ${errors.slice(0, 3).join(' ; ')}`)
await browser.close()
