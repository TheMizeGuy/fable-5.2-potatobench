// Checks the player's tilt of the view: Page Down and a right-drag upward tip it toward straight down, a field is
// still picked where it is drawn, and Home levels it.
// Usage: node tools/render/tilt.ts <base-url> <out dir>
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const [base = 'http://localhost:5317/', out = 'out/tilt'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
let failed = 0
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(base)
await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0)
await page.evaluate(() => { const { app } = (window as any).__county; app.newGame(1977, 5); app.do({ t: 'begin' }); app.setSpeed(0) })
const settle = () => page.evaluate(() => (window as any).__countyField.settle())
// How steeply the camera looks down, from its own matrix.
const down = () => page.evaluate(() => { const e = (window as any).__countyField.rig.camera.matrixWorld.elements; return Math.asin(Math.min(1, Math.max(-1, e[9]))) })
const selected = () => page.evaluate(() => (window as any).__county.app.selection.slice())
await settle()
await page.waitForTimeout(800)
const level = await down()
await page.screenshot({ path: `${out}/1-level.png` })
await page.mouse.move(500, 400)
await page.keyboard.down('PageDown'); await page.waitForTimeout(700); await page.keyboard.up('PageDown')
await page.waitForTimeout(700)
const half = await down()
await page.screenshot({ path: `${out}/2-half.png` })
await page.keyboard.down('PageDown'); await page.waitForTimeout(1500); await page.keyboard.up('PageDown')
await page.waitForTimeout(700)
const full = await down()
await page.screenshot({ path: `${out}/3-down.png` })
check(half > level + 0.15 && full > half + 0.15 && full > 1.2, `Page Down tips the view: ${level.toFixed(2)} -> ${half.toFixed(2)} -> ${full.toFixed(2)} rad`)
const at = await page.evaluate(() => {
  const f = (window as any).__countyField
  for (let i = 0; i < 6; i++) {
    const c = f.corners(i) as { x: number; y: number; visible: boolean }[]
    const x = c.reduce((s, p) => s + p.x, 0) / c.length, y = c.reduce((s, p) => s + p.y, 0) / c.length
    if (c.every(p => p.visible) && x > 520 && x < 1050 && y > 260 && y < 700) return { i, x, y }
  }
  return null
})
if (at) {
  await page.evaluate(() => { for (const el of [...document.body.children]) if (el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT') (el as HTMLElement).style.visibility = 'hidden' })
  console.log('   would pick', JSON.stringify(await page.evaluate(([x, y]) => (window as any).__countyField.pickAt(x, y).field, [at.x, at.y])))
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(300)
  const s = await selected()
  check(s.length === 1 && s[0] === at.i, `tipped down, a click on field ${at.i} selects it (selection ${JSON.stringify(s)})`)
  await page.evaluate(() => { for (const el of [...document.body.children]) (el as HTMLElement).style.visibility = '' })
} else check(false, 'a field is in view when tipped down')
await page.keyboard.down('PageUp'); await page.waitForTimeout(2500); await page.keyboard.up('PageUp')
await page.waitForTimeout(700)
check(Math.abs(await down() - level) < 0.02, `Page Up brings it back (${(await down()).toFixed(2)} rad)`)
// A right-drag upward tips it; sideways still turns.
await page.mouse.move(700, 600); await page.mouse.down({ button: 'right' }); await page.mouse.move(700, 380, { steps: 12 }); await page.mouse.up({ button: 'right' })
await page.waitForTimeout(700)
const dragged = await down()
await page.screenshot({ path: `${out}/4-dragged.png` })
check(dragged > level + 0.3, `a right-drag upward tips the view (${dragged.toFixed(2)} rad)`)
await page.keyboard.press('Home')
await page.waitForTimeout(1800)
await settle()
const home = await down()
check(home < dragged - 0.3, `Home levels it (${home.toFixed(2)} rad)`)
// The closest and the furthest views tipped right over.
for (const tier of ['yard', 'county']) {
  await page.evaluate(t => (window as any).__countyField.tier(t), tier)
  await settle()
  await page.keyboard.down('PageDown'); await page.waitForTimeout(2200); await page.keyboard.up('PageDown')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/5-${tier}-down.png` })
  await page.keyboard.press('Home'); await page.waitForTimeout(400)
}
check(errors.length === 0, `no page errors (${errors.join('; ').slice(0, 200)})`)
await browser.close()
if (failed) process.exitCode = 1
