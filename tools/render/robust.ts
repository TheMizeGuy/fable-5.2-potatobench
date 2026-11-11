// Checks the field view's edges: picking, label anchors, touch, reduced motion, a pixel-ratio change, WebGL context loss
// (restored, and never restored), and the flat fallback without WebGL.
// Usage: node tools/render/robust.ts <base-url> <out-dir> [--soft]   (--soft renders with SwiftShader instead of the GPU)
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from '@playwright/test'

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const base = args[0] ?? 'http://localhost:5317/'
const out = args[1] ?? 'shots'
mkdirSync(out, { recursive: true })
const GL = process.argv.includes('--soft')
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu']
let failed = 0
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }

const browser = await chromium.launch({ args: GL })

async function open(opts: { width?: number; height?: number; touch?: boolean } = {}): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 }, deviceScaleFactor: 1, hasTouch: !!opts.touch, isMobile: !!opts.touch })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__countyField !== undefined)
  return { page, errors }
}

async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(n => new Promise<void>(res => { let k = 0; const t = () => (++k >= n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t) }), n)
}

const stats = (page: Page) => page.evaluate(() => (window as any).__countyField.stats())
const selected = (page: Page) => page.evaluate(() => (window as any).__county.app.selected)
const startSeason = (page: Page, day = 0) => page.evaluate(day => {
  const { app } = (window as any).__county
  app.newGame(1977, 5)
  app.do({ t: 'begin' })
  while (app.campaign.season.day < day) app.do({ t: 'day' })
  ;(window as any).__countyField.settle()
}, day)

// Hide the interface and hold the screen edges its panels would cover, so only the field view is under test.
const panels = (page: Page, top: number, right: number, bottom: number, left: number) => page.evaluate(([t, r, b, l]) => {
  const { app } = (window as any).__county
  ;(document.getElementById('ui') as HTMLElement).style.display = 'none'
  const set = (app.__set ??= app.setInsets.bind(app))
  app.setInsets = () => set(t, r, b, l)
  set(t, r, b, l)
  ;(window as any).__countyField.settle()
}, [top, right, bottom, left])

// Share of pixels that changed between two screenshots, read back through the page's own image decoder.
async function changed(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([a, b]) => {
    const read = async (s: string) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob())
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const g = c.getContext('2d')!
      g.drawImage(bmp, 0, 0)
      return g.getImageData(0, 0, bmp.width, bmp.height).data
    }
    const [p, q] = await Promise.all([read(a), read(b)])
    let n = 0
    for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24) n++
    return n / (p.length / 4)
  }, [a.toString('base64'), b.toString('base64')])
}

// Picking, anchors, insets, and a lost context that comes back.
{
  const { page, errors } = await open()
  await startSeason(page)
  await panels(page, 80, 390, 110, 322)
  const anchors = await page.evaluate(() => { const v = (window as any).__countyField; return [0, 1, 2, 3, 4, 5].map(i => v.anchor(i)) })
  check(anchors.every((a: any) => a.visible && a.x > 322 && a.x < 1050 && a.y > 80 && a.y < 790), `all six field anchors inside the free area between the panels: ${JSON.stringify(anchors.map((a: any) => [Math.round(a.x), Math.round(a.y)]))}`)
  check(anchors[0].y < anchors[2].y && anchors[2].y < anchors[4].y, 'ridge fields anchor above mid slope, mid slope above bottom land')
  const a3 = anchors[3]
  await page.mouse.click(a3.x, a3.y + 30)
  check(await selected(page) === 3, 'clicking field 3 selects it')
  await page.mouse.click(1040, 780)
  check(await selected(page) === -1, 'clicking empty ground beside the block selects nothing')
  await page.mouse.move(a3.x, a3.y + 30)
  await page.mouse.down()
  await page.mouse.move(a3.x + 100, a3.y + 80, { steps: 6 })
  await page.mouse.up()
  await page.mouse.wheel(0, -400)
  check(await selected(page) === -1, 'a drag that starts on a field, and the wheel, do not select')
  await page.mouse.dblclick(1040, 780)
  await panels(page, 0, 0, 0, 0)
  const before = await page.evaluate(() => (window as any).__countyField.anchor(2))
  await panels(page, 0, 0, 0, 500)
  const after = await page.evaluate(() => (window as any).__countyField.anchor(2))
  check(after.x > before.x + 100, `a left panel moves the farm right (${Math.round(before.x)} -> ${Math.round(after.x)})`)
  await panels(page, 0, 0, 0, 0)
  const lost = await page.evaluate(async () => {
    const canvas = document.getElementById('field') as HTMLCanvasElement
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext
    const ext = gl.getExtension('WEBGL_lose_context')!
    ext.loseContext()
    await new Promise(r => setTimeout(r, 400))
    const wasLost = gl.isContextLost()
    ext.restoreContext()
    await new Promise(r => setTimeout(r, 1500))
    return { wasLost, now: gl.isContextLost(), flat: !!(window as any).__countyField.flat }
  })
  check(lost.wasLost && !lost.now && !lost.flat, 'context lost and restored within the grace period: the 3D view carries on')
  await page.evaluate(() => (window as any).__countyField.settle())
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/robust-after-restore.png` })
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// Reduced motion: no camera glide, no drift, rain and water all but still; the farmer's work still plays.
{
  const { page, errors } = await open()
  await startSeason(page)
  await panels(page, 80, 390, 110, 322)
  const glide = async (reduced: boolean) => {
    await page.evaluate(r => { const { app } = (window as any).__county; app.setSetting('reducedMotion', r); app.select(-1); (window as any).__countyField.settle() }, reduced)
    await frames(page, 3)
    await page.evaluate(() => (window as any).__county.app.select(4))
    await frames(page, 2)
    const early = (await stats(page)).camera
    await frames(page, 60)
    const late = (await stats(page)).camera
    return Math.hypot(early.x - late.x, early.y - late.y, early.z - late.z)
  }
  const moving = await glide(false), still = await glide(true)
  check(moving > 1 && still < 1e-3, `selecting a field glides the camera normally (${moving.toFixed(2)} units still to go after 2 frames) and jumps under reduced motion (${still.toFixed(4)})`)
  await page.evaluate(() => { const { app } = (window as any).__county; app.select(-1) })
  await frames(page, 2)
  const resetStill = await page.evaluate(async () => {
    const f = (window as any).__countyField
    const canvas = document.getElementById('field') as HTMLCanvasElement
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const a = f.stats().camera
    await new Promise(r => setTimeout(r, 500))
    const b = f.stats().camera
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  })
  check(resetStill < 1e-3, `double-click reset jumps under reduced motion (${resetStill.toFixed(4)})`)
  const clocks = await page.evaluate(async () => {
    const f = (window as any).__countyField
    const a = f.stats()
    await new Promise(r => setTimeout(r, 1000))
    const b = f.stats()
    return { time: b.time - a.time, ambient: b.ambient - a.ambient }
  })
  check(clocks.ambient < 0.05 * clocks.time, `water, cloud, mist and smoke run at ${(clocks.ambient / clocks.time * 100).toFixed(1)}% of real time under reduced motion`)
  // A rainy July day, paused and settled: two pictures half a second apart.
  await page.evaluate(() => {
    const { app } = (window as any).__county
    while (app.campaign.season.day < 205) app.do({ t: 'day' })
    ;(window as any).__countyField.settle()
  })
  const pair = async () => { await frames(page, 10); const a = await page.screenshot(); await page.waitForTimeout(500); return changed(page, a, await page.screenshot()) }
  const still2 = await pair()
  await page.evaluate(() => (window as any).__county.app.setSetting('reducedMotion', false))
  const moving2 = await pair()
  check(still2 < 0.002 && moving2 > 5 * Math.max(still2, 0.001), `a rainy day: ${(moving2 * 100).toFixed(2)}% of pixels change in half a second normally, ${(still2 * 100).toFixed(3)}% under reduced motion`)
  await page.evaluate(() => { const { app } = (window as any).__county; app.setSetting('reducedMotion', true); app.quitToTitle() })
  await frames(page, 5)
  const title = await page.evaluate(async () => {
    const f = (window as any).__countyField
    const a = f.info().tractor
    await new Promise(r => setTimeout(r, 1000))
    const b = f.info().tractor
    return Math.hypot(a.x - b.x, a.z - b.z)
  })
  check(title < 1e-3, `the title screen's tractor stands still under reduced motion (moved ${title.toFixed(4)})`)
  await page.evaluate(() => (window as any).__county.app.setSetting('reducedMotion', false))
  check(errors.length === 0, `reduced motion: no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// A move to a denser screen: the pixel ratio changes and no resize event arrives.
{
  const { page, errors } = await open()
  const cdp = await page.context().newCDPSession(page)
  await page.evaluate(() => addEventListener('resize', e => e.stopImmediatePropagation(), { capture: true }))
  const was = await stats(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
  await frames(page, 5)
  const now = await stats(page)
  check(was.width === 1440 && now.pixelRatio === 2 && now.width === 2880 && now.height === 1800, `pixel ratio 1 -> 2 with no resize event: canvas ${was.width}x${was.height} -> ${now.width}x${now.height}`)
  check(errors.length === 0, `pixel ratio: no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// A lost context that never comes back: the flat drawing takes over and the game stays playable.
{
  const { page, errors } = await open()
  await startSeason(page)
  await page.evaluate(() => {
    const canvas = document.getElementById('field') as HTMLCanvasElement
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext
    gl.getExtension('WEBGL_lose_context')!.loseContext()
  })
  await page.waitForTimeout(1500)
  check(!(await page.evaluate(() => !!(window as any).__countyField.flat)), 'a context lost for 1.5 s is still waited for')
  await page.waitForTimeout(2500)
  const flat = await page.evaluate(() => {
    const c = document.getElementById('field') as HTMLCanvasElement
    return { flat: !!(window as any).__countyField.flat, twoD: !!c.getContext('2d'), size: [c.width, c.height] }
  })
  check(flat.flat && flat.twoD, `after 4 s without a restore the field is drawn flat on a 2D canvas (${JSON.stringify(flat)})`)
  const a = await page.evaluate(() => (window as any).__countyField.anchor(2))
  await page.mouse.click(a.x, a.y + 20)
  check(await selected(page) === 2, 'flat view: a click selects the field under it')
  await page.evaluate(() => { const { app } = (window as any).__county; app.do({ t: 'job', kind: 'plant', field: 2 }); app.do({ t: 'day' }) })
  await frames(page, 3)
  await page.screenshot({ path: `${out}/robust-context-never-restored.png` })
  check(errors.length === 0, `never restored: no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// Touch on a phone: one finger turns the land, two pinch to zoom, a tap selects, and a drag never selects.
{
  const { page, errors } = await open({ width: 390, height: 844, touch: true })
  await startSeason(page)
  await frames(page, 10)
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
  const anchors = await page.evaluate(() => [0, 1, 2, 3, 4, 5].map(i => (window as any).__countyField.anchor(i)))
  const a = anchors[2]
  const p = { x: Math.round(a.x), y: Math.round(a.y + 18) }
  const hitCanvas = await page.evaluate(({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement | null)?.id ?? 'nothing', p)
  check(hitCanvas === 'field', `a point on Upper Middle is the canvas, not a panel (${hitCanvas})`)
  const cam0 = (await stats(page)).camera
  await touch('touchStart', [[p.x, p.y]])
  for (let k = 1; k <= 10; k++) await touch('touchMove', [[p.x + k * 12, p.y + k * 3]])
  await touch('touchEnd', [])
  await frames(page, 40)
  const cam1 = (await stats(page)).camera
  check(Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z) > 1 && await selected(page) === -1, `one-finger drag from a field turns the land and selects nothing (camera moved ${Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z).toFixed(1)})`)
  await touch('touchStart', [[195, 300], [215, 320]])
  for (let k = 1; k <= 8; k++) await touch('touchMove', [[195 - k * 8, 300 - k * 8], [215 + k * 8, 320 + k * 8]])
  await touch('touchEnd', [])
  await frames(page, 40)
  const cam2 = (await stats(page)).camera
  check(cam2.dist < cam1.dist * 0.85 && await selected(page) === -1, `two-finger pinch zooms in (${cam1.dist.toFixed(1)} -> ${cam2.dist.toFixed(1)}) and selects nothing`)
  await page.evaluate(() => (window as any).__countyField.settle())
  const b = await page.evaluate(() => (window as any).__countyField.anchor(2))
  await touch('touchStart', [[Math.round(b.x), Math.round(b.y + 18)]])
  await touch('touchMove', [[Math.round(b.x) + 3, Math.round(b.y + 19)]])
  await touch('touchEnd', [])
  await frames(page, 3)
  check(await selected(page) === 2, 'a tap, even with a slight wobble, selects the field')
  // On a narrow screen, selecting a field keeps every field and label where they were.
  await page.evaluate(() => document.getElementById('field')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
  await panels(page, 110, 0, 300, 0)
  const labels = () => page.evaluate(() => [0, 1, 2, 3, 4, 5].map(i => (window as any).__countyField.anchor(i)).filter((x: any) => x.visible && x.x > 30 && x.x < 360 && x.y > 122 && x.y < 532).length)
  await page.evaluate(() => { (window as any).__county.app.select(-1); (window as any).__countyField.settle() })
  const none = await labels()
  check(none === 6, `390x844 with a 300 px sheet: ${none} of 6 labels in the free area`)
  for (const f of [0, 5]) {
    await page.evaluate(f => { (window as any).__county.app.select(f); (window as any).__countyField.settle() }, f)
    const seen = await labels()
    check(seen === 6, `390x844 with a 300 px sheet, field ${f} selected: ${seen} of 6 labels in the free area`)
  }
  check(errors.length === 0, `touch: no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// No WebGL at all.
{
  const nogl = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] })
  const page = await nogl.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__county !== undefined)
  await page.evaluate(() => { const { app } = (window as any).__county; app.newGame(1977, 5); app.do({ t: 'begin' }) })
  await page.waitForTimeout(500)
  const a = await page.evaluate(() => (window as any).__countyField.anchor(3))
  await page.mouse.click(a.x, a.y + 20)
  const sel = await page.evaluate(() => (window as any).__county.app.selected)
  check(sel === 3, `fallback view: a click selects the field under it (${sel})`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/fallback-no-webgl.png` })
  check(errors.length === 0, `fallback view: no page errors (${errors.join(' | ')})`)
  await nogl.close()
}
await browser.close()
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
