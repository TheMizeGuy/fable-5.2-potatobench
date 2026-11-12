// How long the game takes from the address to its first drawn frame, in a fresh browser each time.
// Usage: node tools/quality/loadtime.mjs <url> [runs]
import { chromium } from '@playwright/test'

const [url, runs = '3'] = process.argv.slice(2)
const out = []
for (let k = 0; k < Number(runs); k++) {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const t0 = Date.now()
  await page.goto(url, { timeout: 90000 })
  await page.waitForFunction(() => (globalThis.__countyField?.stats?.().firstFrame ?? 0) > 0, null, { timeout: 90000, polling: 100 })
  const first = await page.evaluate(() => globalThis.__countyField.stats().firstFrame)
  out.push({ wall: Date.now() - t0, first: Math.round(first) })
  await browser.close()
}
console.log(`${url}: first frame after ${out.map(o => `${(o.first / 1000).toFixed(1)} s`).join(', ')} (page clock); ${out.map(o => `${(o.wall / 1000).toFixed(1)} s`).join(', ')} from the address`)
