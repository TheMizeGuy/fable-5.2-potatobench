// Pictures of the landing as it comes up and once it has settled, at a desk's sizes and a phone's, and how the frames
// came while it stood: the landing must cost the picture nothing.
// Usage: node tools/quality/title.ts <base url> <out dir>
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { GPU } from './shared.ts'

const [base, out] = process.argv.slice(2)
if (!base || !out) throw new Error('usage: title.ts <base url> <out dir>')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: GPU })
let bad = 0
for (const [w, h, ratio, name] of [[1440, 900, 1, 'desk'], [1280, 720, 1, 'small'], [1920, 1080, 1, 'wide'], [1512, 982, 2, 'laptop'], [390, 844, 3, 'phone']] as const) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: ratio })
  const page = await context.newPage()
  const errors: string[] = []
  let shot = 0
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(base)
  await page.locator('#ui [data-testid="play"]').waitFor({ timeout: 40000 })
  for (const ms of [300, 600, 600, 700, 1800]) { await page.waitForTimeout(ms); await page.screenshot({ path: `${out}/${name}-${String(shot++).padStart(2, '0')}.png` }) }
  // Frames while the landing's film runs: the gaps between pictures over fifteen seconds, its first cut among them.
  const gaps = await page.evaluate(() => new Promise<number[]>(done => {
    const g: number[] = []
    let last = performance.now()
    const t0 = last
    const step = (t: number) => { g.push(t - last); last = t; if (t - t0 < 15000) requestAnimationFrame(step); else done(g.slice(1)) }
    requestAnimationFrame(step)
  }))
  gaps.sort((a, b) => a - b)
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const p99 = gaps[Math.floor(gaps.length * 0.99)], worst = gaps[gaps.length - 1]
  const over = gaps.filter(x => x > 33.4).length
  const ok = !errors.length && over <= 1 && p99 <= 22
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${w}x${h}@${ratio}: ${Math.round(1000 / mean)} fps, 99th ${p99.toFixed(1)} ms, worst ${worst.toFixed(1)} ms, ${over} over 33 ms of ${gaps.length}; ${errors.length} errors ${errors.join(' | ')}`)
  await page.screenshot({ path: `${out}/${name}-settled.png` })
  await context.close()
}
await browser.close()
if (bad) process.exitCode = 1
