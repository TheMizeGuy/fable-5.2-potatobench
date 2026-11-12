// Screenshots of static design frames: every .html file in a folder, for judging a look before it is built.
// Usage: node tools/quality/frames.ts <folder of .html> <out dir>
//   name.html        a desktop frame, 1440 by 900            -> name.desk.png
//   name.phone.html  a phone frame, 390 by 844 at 2x          -> name.phone.png
//   name.sheet.html  a sheet of parts, 1440 wide, full height -> name.sheet.png
// The files are opened from disk, so they must carry their own styles, fonts and pictures by relative path.
import { mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const [dir, out] = process.argv.slice(2)
if (!dir || !out) throw new Error('usage: frames.ts <folder of .html> <out dir>')
mkdirSync(out, { recursive: true })
const files = readdirSync(dir).filter(f => f.endsWith('.html')).sort()
if (!files.length) throw new Error(`no .html files in ${dir}`)
const browser = await chromium.launch()
let bad = 0
for (const file of files) {
  const phone = file.endsWith('.phone.html'), sheet = file.endsWith('.sheet.html')
  const name = file.replace(/(\.phone|\.sheet)?\.html$/, '')
  const context = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const seen: string[] = []
  page.on('console', m => { if (m.type() === 'error') seen.push(m.text()) })
  page.on('pageerror', e => seen.push(String(e)))
  page.on('requestfailed', r => seen.push(`not loaded: ${r.url()}`))
  await page.goto(pathToFileURL(resolve(join(dir, file))).href)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  // Anything wider than its frame is a fault of the frame, and worth knowing before anyone judges it.
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const to = join(out, `${name}.${phone ? 'phone' : sheet ? 'sheet' : 'desk'}.png`)
  await page.screenshot({ path: to, fullPage: sheet })
  const notes = [...seen, ...(over > 1 ? [`${over}px wider than the frame`] : [])]
  console.log(`${to}${notes.length ? `  !! ${notes.join('; ')}` : ''}`)
  if (notes.length) bad++
  await context.close()
}
await browser.close()
console.log(`${files.length} frames, ${bad} with problems`)
