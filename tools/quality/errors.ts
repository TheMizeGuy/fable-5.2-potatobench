// Opens the game, optionally runs a little code in it, and prints every console error and page error with its stack.
// Usage: node tools/quality/errors.ts <base url> [code run in the page through the capture helper]
import { chromium } from '@playwright/test'
import { GPU, HELPER, q } from './shared.ts'

const [base, code = ''] = process.argv.slice(2)
if (!base) throw new Error('usage: errors.ts <base url> [code]')
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(HELPER)
const seen: string[] = []
page.on('console', async m => {
  if (m.type() !== 'error' && m.type() !== 'warning') return
  // A warning that carries an error is printed with the error's stack.
  const stacks = await Promise.all(m.args().map(a => a.evaluate(v => v instanceof Error ? v.stack ?? String(v) : '').catch(() => '')))
  seen.push(`${m.type()}: ${m.text()}${stacks.filter(Boolean).map(s => `\n  ${s}`).join('')}`)
})
page.on('pageerror', e => seen.push(`page: ${e.stack ?? String(e)}`))
await page.goto(base)
const up = await page.waitForFunction(() => '__county' in globalThis, null, { timeout: 15000 }).then(() => true, () => false)
if (up && code) await q(page, code).catch(e => seen.push(`code: ${String(e)}`))
await page.waitForTimeout(1500)
console.log(up ? 'the game is up' : 'the game did not come up')
for (const s of seen) console.log(s)
await browser.close()
