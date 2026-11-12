// Checks the check that lets tree cards be drawn in two passes (their depth, then their light where the depth is
// theirs): that it ran at start-up and found the two passes to agree on this machine, that it says they do not when
// the first pass is pushed off by a hair (as on a machine whose two shaders place a card a bit apart), and that it
// says they do again when the push is taken away.
// Usage: node tools/render/twopass.ts <base-url>
import { chromium } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const base = process.argv[2] ?? 'http://localhost:5317/'
let failed = 0
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(base)
await page.waitForFunction(() => (globalThis as any).__countyField?.stats?.().firstFrame > 0, null, { timeout: 180000 })
type Found = { ok: boolean; pixels: number[]; on?: boolean }
const said = (r: Found) => `conifer cards ${r.pixels[0]} pixels in one pass and ${r.pixels[1]} in two, hardwood cards ${r.pixels[2]} and ${r.pixels[3]}, a hardwood's leaves ${r.pixels[4]} and ${r.pixels[5]}`
const first: Found = await page.evaluate(() => (globalThis as any).__countyField.twoPass())
check(first.ok && first.on === true && first.pixels.length === 6, `at start-up the two passes agree and are on: ${said(first)}`)
const pushed: Found = await page.evaluate(() => (globalThis as any).__countyField.twoPassCheck(0.0002))
check(!pushed.ok, `with the first pass pushed off the check says they do not agree: ${said(pushed)}`)
const again: Found = await page.evaluate(() => (globalThis as any).__countyField.twoPassCheck(0))
check(again.ok, `and with the push taken away, that they do: ${said(again)}`)
// off, as it would be left on a machine that failed: nothing of the first pass is drawn
const off = await page.evaluate(() => { const f = (globalThis as any).__countyField; f.tryWithout('twopass', true); const on = f.twoPass().on; f.tryWithout('twopass', false); return [on, f.twoPass().on] })
check(off[0] === false && off[1] === true, `the two passes can be put off and on (${off.join(', ')})`)
check(errors.length === 0, `no page errors (${errors.join(' | ')})`)
await browser.close()
process.exit(failed ? 1 : 0)
