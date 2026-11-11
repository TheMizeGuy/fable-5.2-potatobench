// Checks the field view's edges: picking, label anchors, WebGL context loss and restore, and the flat fallback without WebGL.
// Usage: node tools/render/robust.ts <base-url> <out-dir>
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:5317/'
const out = process.argv[3] ?? 'shots'
mkdirSync(out, { recursive: true })
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
let failed = 0
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }

{
  const browser = await chromium.launch({ args: GL })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__countyField !== undefined)
  await page.evaluate(() => { const { app } = (window as any).__county; app.newGame(1977, 5); app.do({ t: 'begin' }); (window as any).__countyField.settle() })
  // Anchors: every field on screen, back fields above front fields.
  const anchors = await page.evaluate(() => { const v = (window as any).__countyField; return [0, 1, 2, 3, 4, 5].map(i => v.anchor(i)) })
  check(anchors.every((a: any) => a.visible), `all six field anchors visible: ${JSON.stringify(anchors.map((a: any) => [Math.round(a.x), Math.round(a.y)]))}`)
  check(anchors[0].y < anchors[2].y && anchors[2].y < anchors[4].y, 'ridge fields anchor above mid slope, mid slope above bottom land')
  // Click the middle of field 3's anchor, a little below it, and expect field 3 selected; click the sky and expect none.
  const a3 = anchors[3]
  await page.mouse.click(a3.x, a3.y + 40)
  check(await page.evaluate(() => (window as any).__county.app.selected) === 3, 'clicking field 3 selects it')
  await page.mouse.click(1400, 40)
  check(await page.evaluate(() => (window as any).__county.app.selected) === -1, 'clicking empty sky selects nothing')
  // Drag to orbit and wheel to zoom must not select.
  await page.mouse.move(900, 500)
  await page.mouse.down()
  await page.mouse.move(1000, 540, { steps: 6 })
  await page.mouse.up()
  await page.mouse.wheel(0, -400)
  check(await page.evaluate(() => (window as any).__county.app.selected) === -1, 'drag and wheel do not select')
  await page.mouse.dblclick(900, 500)
  // Insets: the farm moves into the free area.
  const before = anchors[2].x
  await page.evaluate(() => { const { app } = (window as any).__county; app.setInsets(0, 0, 0, 500); (window as any).__countyField.settle() })
  const after = await page.evaluate(() => (window as any).__countyField.anchor(2))
  check(after.x > before + 100, `left inset moves the farm right (${Math.round(before)} -> ${Math.round(after.x)})`)
  await page.evaluate(() => (window as any).__county.app.setInsets(0, 0, 0, 0))
  // Context loss and restore.
  const lost = await page.evaluate(async () => {
    const canvas = document.getElementById('field') as HTMLCanvasElement
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext
    const ext = gl.getExtension('WEBGL_lose_context')!
    ext.loseContext()
    await new Promise(r => setTimeout(r, 400))
    const wasLost = gl.isContextLost()
    ext.restoreContext()
    await new Promise(r => setTimeout(r, 1500))
    return { wasLost, now: gl.isContextLost() }
  })
  check(lost.wasLost && !lost.now, 'context lost and restored')
  await page.evaluate(() => (window as any).__countyField.settle())
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/robust-after-restore.png` })
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`)
  await browser.close()
}

{
  const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__county !== undefined)
  await page.evaluate(() => { const { app } = (window as any).__county; app.newGame(1977, 5); app.do({ t: 'begin' }) })
  await page.waitForTimeout(500)
  await page.mouse.click(1000, 450)
  const sel = await page.evaluate(() => (window as any).__county.app.selected)
  check(sel >= 0, `fallback view: a click selects a field (${sel})`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/fallback-no-webgl.png` })
  check(errors.length === 0, `fallback view: no page errors (${errors.join(' | ')})`)
  await browser.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
