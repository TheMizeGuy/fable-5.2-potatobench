// Before and after, side by side: for every picture of the same name in two folders, one picture with the first
// folder's on the left and the second's on the right, each at its own size.
// Usage: node tools/render/pairs.ts <before dir> <after dir> <out dir>
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const [before, after, out] = process.argv.slice(2)
if (!before || !after || !out) throw new Error('usage: pairs.ts <before dir> <after dir> <out dir>')
mkdirSync(out, { recursive: true })
const names = readdirSync(before).filter(n => n.endsWith('.png') && existsSync(`${after}/${n}`)).sort()
const data = (dir: string, n: string) => `data:image/png;base64,${readFileSync(`${dir}/${n}`).toString('base64')}`
const browser = await chromium.launch()
for (const n of names) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  await page.setContent(`<body style="margin:0;background:#151515;color:#d8d8d8;font:16px/28px sans-serif">
    <div style="display:flex;gap:8px;width:max-content">
      <figure style="margin:0"><figcaption>&nbsp;before: ${n}</figcaption><img style="display:block" src="${data(before, n)}"></figure>
      <figure style="margin:0"><figcaption>&nbsp;after</figcaption><img style="display:block" src="${data(after, n)}"></figure>
    </div></body>`)
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0))
  const size = await page.evaluate(() => { const d = document.body.firstElementChild as HTMLElement; return { w: d.offsetWidth, h: d.offsetHeight } })
  await page.setViewportSize({ width: size.w, height: size.h })
  await page.screenshot({ path: `${out}/${n}` })
  console.log(`${out}/${n}  ${size.w}x${size.h}`)
  await page.close()
}
console.log(`${names.length} pairs`)
await browser.close()
