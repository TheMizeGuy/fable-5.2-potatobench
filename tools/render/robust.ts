// Checks the field view's edges: the pointer and keys of a strategy map (click, Shift-click, double-click, right-click,
// drag, wheel, arrows, Q and E, Home), the 'focus', 'order' and 'insets' events, plate anchors, touch, reduced motion,
// a pixel-ratio change, WebGL context loss (restored, and never restored), the flat fallback without WebGL, and the
// promise that tells the interface the land has shown a test dig.
// Usage: node tools/render/robust.ts <base-url> <out-dir> [--soft]   (--soft renders with SwiftShader instead of the GPU)
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from '@playwright/test'

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const base = args[0] ?? 'http://localhost:5317/'
const out = args[1] ?? 'shots'
mkdirSync(out, { recursive: true })
const GL = process.argv.includes('--soft')
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : [process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu']
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

interface Cam { x: number; y: number; z: number; dist: number; yaw: number }
const stats = (page: Page) => page.evaluate(() => (window as any).__countyField.stats()) as Promise<{ camera: Cam; time: number; ambient: number; pixelRatio: number; width: number; height: number }>
const selection = (page: Page) => page.evaluate(() => (window as any).__county.app.selection.slice()) as Promise<number[]>
const anchors = (page: Page) => page.evaluate(() => [0, 1, 2, 3, 4, 5].map(i => (window as any).__countyField.anchor(i))) as Promise<{ x: number; y: number; visible: boolean }[]>
const settle = (page: Page) => page.evaluate(() => (window as any).__countyField.settle())
const moved = (a: Cam, b: Cam) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const startSeason = (page: Page, day = 0) => page.evaluate(day => {
  const { app } = (window as any).__county
  app.newGame(1977, 5)
  app.do({ t: 'begin' })
  while (app.campaign.season.day < day) app.do({ t: 'day' })
  ;(window as any).__countyField.settle()
}, day)

// The farm tier, settled: all six home fields in the picture.
const farmTier = async (page: Page) => { await page.evaluate(() => { const f = (window as any).__countyField; f.tier('farm'); f.settle() }); await frames(page, 3) }

// Play a year under reference practice up to (not including) a day.
const playTo = (page: Page, until: number, skip = '') => page.evaluate(([until, skip]) => {
  const { app, sim } = (window as any).__county
  app.newGame(1977, 5)
  app.do({ t: 'begin' })
  const c = app.campaign
  while (c.phase === 'season' && c.season.day < until) {
    for (const a of sim.advise(app.world, c)) {
      if (a.act === 'wait' || a.act === 'close' || a.act === skip) continue
      if (a.act === 'sell') app.do({ t: 'sell', lot: a.lot, frac: 1 })
      else app.do({ t: 'job', kind: a.act, field: a.field })
    }
    if (!app.do({ t: 'day' }).ok) break
  }
  ;(window as any).__countyField.settle()
}, [until, skip] as [number, string])

// Hide the interface and hold the screen edges it would cover, so only the field view is under test.
const panels = (page: Page, top: number, right: number, bottom: number, left: number) => page.evaluate(([t, r, b, l]) => {
  const { app } = (window as any).__county
  ;(document.getElementById('ui') as HTMLElement).style.display = 'none'
  const set = (app.__set ??= app.setInsets.bind(app))
  app.setInsets = () => set(t, r, b, l)
  set(t, r, b, l)
  ;(window as any).__countyField.settle()
}, [top, right, bottom, left])

// Count calls to app.smartOrder without changing what it does.
const spy = (page: Page) => page.evaluate(() => {
  const { app } = (window as any).__county
  const w = window as any
  w.__smart = []
  if (!app.__smartOrder) {
    app.__smartOrder = app.smartOrder.bind(app)
    app.smartOrder = (i: number) => { w.__smart.push(i); return app.__smartOrder(i) }
  }
})
const smart = (page: Page) => page.evaluate(() => (window as any).__smart.slice()) as Promise<number[]>

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

// ---- The mouse and the keys on a strategy map; anchors; events; a lost context that comes back.
{
  const { page, errors } = await open()
  // The end of May: the snow is off the ground, nothing is planted, every potato field is in the same state.
  await startSeason(page, 40)
  await panels(page, 56, 0, 150, 0)
  await spy(page)
  // The season opens on the field tier; these checks want all six home fields in the picture: the farm tier.
  const opened = await page.evaluate(() => (window as any).__countyField.info().framing)
  check(opened === 'field', `the season opens on the field tier (${opened})`)
  await farmTier(page)
  const home = (await stats(page)).camera
  const tiers = await page.evaluate(() => (window as any).__countyField.tiers()) as { yard: number; field: number; farm: number; county: number }
  let a = await anchors(page)
  check(a.every(p => p.visible && p.x > 0 && p.x < 1440 && p.y > 56 && p.y < 750), `all six field anchors inside the area the interface leaves free: ${JSON.stringify(a.map(p => [Math.round(p.x), Math.round(p.y)]))}`)
  check(a[0].y < a[2].y && a[2].y < a[4].y, 'ridge fields anchor above mid slope, mid slope above bottom land')
  const inside = (i: number) => ({ x: a[i].x, y: a[i].y - 24 })
  const EMPTY = { x: 24, y: 720 }

  await page.mouse.move(inside(0).x, inside(0).y)
  await frames(page, 2)
  const over = await page.evaluate(() => (window as any).__county.app.hover)
  await page.mouse.move(EMPTY.x, EMPTY.y)
  await frames(page, 2)
  check(over === 0 && await page.evaluate(() => (window as any).__county.app.hover) === -1, `the pointer over a field sets app.hover, and clears it on empty ground (${over})`)

  await page.mouse.click(inside(3).x, inside(3).y)
  check(JSON.stringify(await selection(page)) === '[3]', `a click selects the field under it (${JSON.stringify(await selection(page))})`)
  await page.waitForTimeout(400)
  await page.keyboard.down('Shift')
  await page.mouse.click(inside(4).x, inside(4).y)
  await page.keyboard.up('Shift')
  check(JSON.stringify(await selection(page)) === '[3,4]', `Shift-click adds a field (${JSON.stringify(await selection(page))})`)
  await page.waitForTimeout(400)
  await page.keyboard.down('Shift')
  await page.mouse.click(inside(3).x, inside(3).y)
  await page.keyboard.up('Shift')
  check(JSON.stringify(await selection(page)) === '[4]', `Shift-click on a selected field takes it out (${JSON.stringify(await selection(page))})`)
  await page.waitForTimeout(400)
  await page.mouse.click(EMPTY.x, EMPTY.y)
  check((await selection(page)).length === 0, 'a click on empty ground clears the selection')
  await page.waitForTimeout(400)

  await page.mouse.dblclick(inside(2).x, inside(2).y)
  const like = await selection(page)
  const expectLike = await page.evaluate(() => {
    const { app, sim } = (window as any).__county
    const key = (i: number) => { const f = sim.fieldInfo(app.campaign, i); return `${f.crop}|${f.status}` }
    return [0, 1, 2, 3, 4, 5].filter(i => key(i) === key(2))
  })
  check(like.length === expectLike.length && like[like.length - 1] === 2 && expectLike.every((i: number) => like.includes(i)), `a double-click selects every field in the same state (${JSON.stringify(like)})`)
  // The double-click brought the field into frame as well: back to the farm tier for the checks that follow.
  const brought = await page.evaluate(() => (window as any).__countyField.info().framing)
  check(brought === 'field', `a double-click on a field brings it into frame at the field tier (${brought})`)
  await farmTier(page)
  await page.waitForTimeout(400)

  await page.mouse.click(inside(1).x, inside(1).y, { button: 'right' })
  check(JSON.stringify(await smart(page)) === '[1]', `a right-click gives the field its order through app.smartOrder (${JSON.stringify(await smart(page))})`)
  check(JSON.stringify(await selection(page)) === JSON.stringify(like), 'a right-click does not change the selection')
  await page.mouse.click(EMPTY.x, EMPTY.y, { button: 'right' })
  check((await smart(page)).length === 1, 'a right-click on empty ground orders nothing')

  // A drag pans and never selects; a right-drag turns.
  await page.mouse.click(EMPTY.x, EMPTY.y)
  await page.waitForTimeout(400)
  await page.mouse.move(inside(3).x, inside(3).y)
  await page.mouse.down()
  await page.mouse.move(inside(3).x - 140, inside(3).y - 60, { steps: 8 })
  await page.mouse.up()
  await frames(page, 30)
  const panned = (await stats(page)).camera
  check((await selection(page)).length === 0 && moved(home, panned) > 2 && Math.abs(panned.yaw - home.yaw) < 1e-6, `a drag that starts on a field pans the land (${moved(home, panned).toFixed(1)} units) and selects nothing`)
  const a3 = (await anchors(page))[3]
  check(Math.abs(a3.x - (a[3].x - 140)) < 26 && Math.abs(a3.y - (a[3].y - 60)) < 26, `the ground stays under the pointer through a drag (field moved ${Math.round(a3.x - a[3].x)}, ${Math.round(a3.y - a[3].y)} for a drag of -140, -60)`)
  await page.mouse.move(700, 400)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(820, 400, { steps: 6 })
  await page.mouse.up({ button: 'right' })
  await frames(page, 30)
  const turned = (await stats(page)).camera
  check(Math.abs(turned.yaw - panned.yaw) > 0.3 && (await smart(page)).length === 1, `a right-drag turns the view (${(turned.yaw - panned.yaw).toFixed(2)} rad) and orders nothing`)

  // Home: from a view of the player's own to the field tier, square again; then out a tier at a time, and round.
  const framing = () => page.evaluate(() => (window as any).__countyField.info().framing) as Promise<string>
  const press = async () => { await page.keyboard.press('Home'); await page.waitForTimeout(1500); return { at: await framing(), cam: (await stats(page)).camera } }
  const h1 = await press()
  check(h1.at === 'field' && Math.abs(h1.cam.yaw - home.yaw) < 0.01 && Math.abs(h1.cam.dist / tiers.field - 1) < 0.05, `Home from a view of the player's own goes to the field tier, square again (${h1.at}, ${h1.cam.dist.toFixed(0)} m off, the tier's ${tiers.field.toFixed(0)})`)
  const h2 = await press()
  check(h2.at === 'farm' && moved(h2.cam, home) < 0.5, `Home again: the farm tier (${h2.at}, ${moved(h2.cam, home).toFixed(2)} m from where it was framed before)`)
  const h3 = await press()
  check(h3.at === 'county' && Math.abs(h3.cam.dist / tiers.county - 1) < 0.02, `Home again: the county tier (${h3.at}, ${h3.cam.dist.toFixed(0)} m off)`)
  const h4 = await press()
  check(h4.at === 'field', `and Home again: back to the field tier (${h4.at})`)
  await farmTier(page)
  const back = (await stats(page)).camera
  a = await anchors(page)
  await page.mouse.move(a[5].x, a[5].y)
  for (let k = 0; k < 5; k++) await page.mouse.wheel(0, -240)
  await frames(page, 40)
  const zoomed = (await stats(page)).camera
  const a5 = (await anchors(page))[5]
  check(zoomed.dist < back.dist * 0.6 && Math.hypot(a5.x - a[5].x, a5.y - a[5].y) < 40, `the wheel zooms toward the pointer (distance ${back.dist.toFixed(0)} -> ${zoomed.dist.toFixed(0)}, the field under the pointer moved ${Math.hypot(a5.x - a[5].x, a5.y - a[5].y).toFixed(0)} px)`)
  check((await selection(page)).length === 0, 'the wheel selects nothing')
  for (let k = 0; k < 30; k++) await page.mouse.wheel(0, -400)
  await frames(page, 60)
  const low = (await stats(page)).camera
  const ground = await page.evaluate(() => (window as any).__countyField.rig.camera.position.y)
  check(low.dist < 9 && ground > 0.5, `zoomed right in, the camera is low and still above the ground (distance ${low.dist.toFixed(1)}, height ${ground.toFixed(2)})`)
  for (let k = 0; k < 40; k++) await page.mouse.wheel(0, 500)
  await frames(page, 60)
  const far = (await stats(page)).camera
  check(far.dist >= tiers.county && far.dist < Math.max(tiers.county * 1.2, tiers.farm * 1.35, 1250), `zoomed right out, the camera stops a little beyond the county tier (${far.dist.toFixed(0)} m off; the county tier ${tiers.county.toFixed(0)})`)
  await page.mouse.dblclick(EMPTY.x, EMPTY.y)
  await page.waitForTimeout(1500)
  check(await framing() === 'field', `a double-click on empty ground does as Home does: the field tier (${await framing()})`)
  await farmTier(page)

  // Keys: arrows pan, Q and E turn; not while the player is typing. (Up and down here: the interface being replaced
  // still takes left and right for itself.)
  const k0 = (await stats(page)).camera
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(350)
  await page.keyboard.up('ArrowUp')
  await frames(page, 20)
  const k1 = (await stats(page)).camera
  check(moved(k0, k1) > 3 && Math.abs(k1.yaw - k0.yaw) < 1e-6, `an arrow key pans (${moved(k0, k1).toFixed(1)} units)`)
  await page.keyboard.down('e')
  await page.waitForTimeout(350)
  await page.keyboard.up('e')
  await frames(page, 20)
  const k2 = (await stats(page)).camera
  check(Math.abs(k2.yaw - k1.yaw) > 0.25, `E turns the view (${(k2.yaw - k1.yaw).toFixed(2)} rad)`)
  await page.keyboard.down('q')
  await page.waitForTimeout(350)
  await page.keyboard.up('q')
  await frames(page, 20)
  check(Math.abs((await stats(page)).camera.yaw - k1.yaw) < 0.12, 'Q turns it back')
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 'probe'; i.style.cssText = 'position:fixed;left:0;top:0;z-index:9'; document.body.append(i); i.focus() })
  await frames(page, 90)
  const k3 = (await stats(page)).camera
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(250)
  await page.keyboard.up('ArrowDown')
  await frames(page, 10)
  check(moved(k3, (await stats(page)).camera) < 1e-3, 'arrow keys typed into a text box do not move the camera')
  await page.evaluate(() => document.getElementById('probe')!.remove())
  await page.keyboard.press('Home')
  await page.waitForTimeout(1100)

  // The 'focus' event: a timed move to a field and back, with the plate anchors gliding, never stepping.
  await page.evaluate(() => (window as any).__county.app.focus(4))
  const track: { x: number; y: number }[] = await page.evaluate(() => new Promise(res => {
    const seen: { x: number; y: number }[] = []
    const f = (window as any).__countyField
    const tick = () => { const p = f.anchor(4); seen.push({ x: p.x, y: p.y }); if (seen.length < 130) requestAnimationFrame(tick); else res(seen) }
    requestAnimationFrame(tick)
  }))
  const jumps = track.slice(1).map((p, k) => Math.hypot(p.x - track[k].x, p.y - track[k].y))
  const whole = track.filter(p => Number.isInteger(p.x) && Number.isInteger(p.y)).length
  const settled = (await stats(page)).camera
  const a4 = (await anchors(page))[4]
  check(settled.dist < home.dist * 0.9 && Math.abs(settled.dist / tiers.field - 1) < 0.06 && Math.abs(a4.x - 720) < 260, `app.focus(4) brings the field into frame (distance ${home.dist.toFixed(0)} -> ${settled.dist.toFixed(0)}, anchor at ${Math.round(a4.x)}, ${Math.round(a4.y)})`)
  check(Math.max(...jumps) < 60 && jumps.slice(-8).every(j => j < 0.5) && whole < 8, `the anchor glides while the camera moves and comes to rest (largest step ${Math.max(...jumps).toFixed(1)} px, last ${jumps[jumps.length - 1].toFixed(3)} px)`)
  await page.evaluate(() => (window as any).__county.app.focus(-1))
  await page.waitForTimeout(1100)
  check(moved((await stats(page)).camera, home) < 0.5, 'app.focus(-1) frames the whole farm')

  // The 'order' event draws a ring on the fields ordered.
  await page.evaluate(() => (window as any).__county.app.setSetting('reducedMotion', true))
  await frames(page, 20)
  const quiet = await page.screenshot()
  await page.evaluate(() => (window as any).__county.app.emit({ type: 'order', kind: 'plant', fields: [2, 5] }))
  await frames(page, 8)
  const ringing = await page.evaluate(() => (window as any).__countyField.info().rings)
  const rung = await changed(page, quiet, await page.screenshot())
  await page.waitForTimeout(1000)
  const gone = await page.evaluate(() => (window as any).__countyField.info().rings)
  const after = await changed(page, quiet, await page.screenshot())
  await page.evaluate(() => (window as any).__county.app.setSetting('reducedMotion', false))
  check(JSON.stringify(ringing) === '[2,5]' && gone.length === 0 && rung > 0.0004 && after < rung * 0.3, `an order rings the fields it went to and the ring goes (${JSON.stringify(ringing)}, ${(rung * 100).toFixed(2)}% of pixels, then ${(after * 100).toFixed(3)}%)`)

  // Insets: the farm is framed inside what is left.
  await panels(page, 0, 0, 0, 0)
  const before = (await anchors(page))[2]
  await panels(page, 0, 0, 0, 500)
  const moreLeft = (await anchors(page))[2]
  check(moreLeft.x > before.x + 100, `an edge covered on the left moves the farm right (${Math.round(before.x)} -> ${Math.round(moreLeft.x)})`)
  await panels(page, 56, 0, 300, 0)
  a = await anchors(page)
  check(a.every(p => p.visible && p.y > 56 && p.y < 600), `a taller card at the bottom keeps every field above it (${JSON.stringify(a.map(p => Math.round(p.y)))})`)
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
  await settle(page)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/robust-after-restore.png` })
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// ---- Reduced motion: timed moves become jumps, water and cloud all but stop, rain stops; the farmer's work still plays.
{
  const { page, errors } = await open()
  await startSeason(page)
  await panels(page, 56, 0, 150, 0)
  const glide = async (reduced: boolean) => {
    await page.evaluate(r => { const { app } = (window as any).__county; app.setSetting('reducedMotion', r); app.focus(-1); (window as any).__countyField.settle() }, reduced)
    await frames(page, 3)
    await page.evaluate(() => (window as any).__county.app.focus(4))
    await frames(page, 2)
    const early = (await stats(page)).camera
    await frames(page, 70)
    const late = (await stats(page)).camera
    return moved(early, late)
  }
  const moving = await glide(false), still = await glide(true)
  check(moving > 1 && still < 1e-3, `bringing a field into frame is a timed move normally (${moving.toFixed(2)} units still to go after 2 frames) and a jump under reduced motion (${still.toFixed(4)})`)
  const resetStill = await page.evaluate(async () => {
    const f = (window as any).__countyField
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const a = f.stats().camera
    await new Promise(r => setTimeout(r, 500))
    const b = f.stats().camera
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  })
  check(resetStill < 1e-3, `Home jumps under reduced motion (${resetStill.toFixed(4)})`)
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
  check(still2 < 0.004 && moving2 > 4 * Math.max(still2, 0.001), `a rainy day: ${(moving2 * 100).toFixed(2)}% of pixels change in half a second normally, ${(still2 * 100).toFixed(3)}% under reduced motion`)
  await page.evaluate(() => { const { app } = (window as any).__county; app.setSetting('reducedMotion', true); app.quitToTitle() })
  await frames(page, 5)
  const title = await page.evaluate(async () => {
    const f = (window as any).__countyField
    const a = f.info().tractor, ca = f.stats().camera
    await new Promise(r => setTimeout(r, 1000))
    const b = f.info().tractor, cb = f.stats().camera
    return { tractor: Math.hypot(a.x - b.x, a.z - b.z), camera: Math.hypot(ca.x - cb.x, ca.y - cb.y, ca.z - cb.z) }
  })
  check(title.tractor < 1e-3 && title.camera < 1e-3, `the opening shot holds still under reduced motion (tractor moved ${title.tractor.toFixed(4)}, camera ${title.camera.toFixed(4)})`)
  await page.evaluate(() => (window as any).__county.app.setSetting('reducedMotion', false))
  await frames(page, 30)
  const drift = await page.evaluate(async () => {
    const f = (window as any).__countyField
    const ca = f.stats().camera
    await new Promise(r => setTimeout(r, 1000))
    const cb = f.stats().camera
    return Math.hypot(ca.x - cb.x, ca.y - cb.y, ca.z - cb.z)
  })
  check(drift > 0.01, `the opening shot moves otherwise (camera ${drift.toFixed(3)} units in a second)`)
  check(errors.length === 0, `reduced motion: no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// ---- The interface waits for the land: whenShown settles once the test-dig hill has been lifted, or the day's rows dug.
{
  const { page, errors } = await open()
  await playTo(page, 203)
  await panels(page, 56, 0, 150, 0)
  const shown = await page.evaluate(async () => {
    const { app } = (window as any).__county
    const f = (window as any).__countyField
    app.do({ t: 'job', kind: 'sample', field: 2 })
    const t0 = performance.now()
    app.do({ t: 'day' })
    const wait = f.whenShown('sample', 2)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const pendingAtStart = f.info().pending
    await wait
    return { ms: performance.now() - t0, pendingAtStart, pendingAtEnd: f.info().pending, segs: f.info().segs }
  })
  check(shown.pendingAtStart > 0 && shown.ms > 400 && shown.ms < 2700, `whenShown('sample', 2) settles after the hill is lifted, inside its cap (${Math.round(shown.ms)} ms, hills waiting at the start ${shown.pendingAtStart}, at the end ${shown.pendingAtEnd}, day ${JSON.stringify(shown.segs)})`)
  const idle = await page.evaluate(async () => {
    const f = (window as any).__countyField
    const t0 = performance.now()
    await f.whenShown('dig', 0)
    return performance.now() - t0
  })
  check(idle < 200, `with nothing to show it settles at once (${Math.round(idle)} ms)`)
  // A day's digging: the last row is out before the interface is let go.
  await playTo(page, 264, 'dig')
  const dug = await page.evaluate(async () => {
    const { app, sim } = (window as any).__county
    const f = (window as any).__countyField
    const job = sim.advise(app.world, app.campaign).find((a: any) => a.act === 'dig')
    if (!job) return null
    app.do({ t: 'job', kind: 'dig', field: job.field })
    const t0 = performance.now()
    app.do({ t: 'day' })
    const wait = f.whenShown('dig', job.field)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const pendingAtStart = f.info().pending
    await wait
    return { ms: performance.now() - t0, pendingAtStart, pendingAtEnd: f.info().pending, field: job.field }
  })
  check(!!dug && dug.pendingAtStart > 0 && dug.pendingAtEnd === 0 && dug.ms > 400 && dug.ms < 2700, `whenShown('dig', ${dug?.field}) settles when the last row is out, inside its cap (${Math.round(dug?.ms ?? 0)} ms, hills waiting at the start ${dug?.pendingAtStart}, at the end ${dug?.pendingAtEnd})`)
  check(errors.length === 0, `whenShown: no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// ---- A move to a denser screen: the pixel ratio changes and no resize event arrives.
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

// ---- A lost context that never comes back: the flat drawing takes over and the game stays playable.
{
  const { page, errors } = await open()
  await startSeason(page)
  await spy(page)
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
  await page.mouse.click(a.x, a.y - 20)
  check(JSON.stringify(await selection(page)) === '[2]', 'flat view: a click selects the field under it')
  const b = await page.evaluate(() => (window as any).__countyField.anchor(4))
  await page.keyboard.down('Shift')
  await page.mouse.click(b.x, b.y - 20)
  await page.keyboard.up('Shift')
  check(JSON.stringify(await selection(page)) === '[2,4]', 'flat view: Shift-click adds a field')
  await page.mouse.click(b.x, b.y - 20, { button: 'right' })
  check(JSON.stringify(await smart(page)) === '[4]', 'flat view: a right-click gives the field its order')
  await page.evaluate(() => { const { app } = (window as any).__county; app.do({ t: 'job', kind: 'plant', field: 2 }); app.do({ t: 'day' }) })
  await frames(page, 3)
  await page.screenshot({ path: `${out}/robust-context-never-restored.png` })
  check(errors.length === 0, `never restored: no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// ---- Touch on a phone: one finger pans, two pinch and twist, a tap selects, a long press orders, a drag never selects.
{
  const { page, errors } = await open({ width: 390, height: 844, touch: true })
  await startSeason(page)
  await panels(page, 52, 0, 190, 0)
  await spy(page)
  await farmTier(page)
  await frames(page, 10)
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
  let a = await anchors(page)
  check(a.every(p => p.visible && p.x > 0 && p.x < 390 && p.y > 52 && p.y < 654), `390x844, the farm tier: all six fields in the free area (${JSON.stringify(a.map(p => [Math.round(p.x), Math.round(p.y)]))})`)
  const p = { x: Math.round(a[2].x), y: Math.round(a[2].y - 10) }
  const hitCanvas = await page.evaluate(({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement | null)?.id ?? 'nothing', p)
  check(hitCanvas === 'field', `a point on a field is the canvas (${hitCanvas})`)
  const cam0 = (await stats(page)).camera
  await touch('touchStart', [[p.x, p.y]])
  for (let k = 1; k <= 10; k++) await touch('touchMove', [[p.x + k * 9, p.y + k * 5]])
  await touch('touchEnd', [])
  await frames(page, 40)
  const cam1 = (await stats(page)).camera
  check(moved(cam0, cam1) > 1 && (await selection(page)).length === 0, `a one-finger drag from a field pans the land and selects nothing (camera moved ${moved(cam0, cam1).toFixed(1)})`)
  await touch('touchStart', [[175, 330], [215, 370]])
  for (let k = 1; k <= 8; k++) await touch('touchMove', [[175 - k * 8, 330 - k * 8], [215 + k * 8, 370 + k * 8]])
  await touch('touchEnd', [])
  await frames(page, 40)
  const cam2 = (await stats(page)).camera
  check(cam2.dist < cam1.dist * 0.7 && (await selection(page)).length === 0, `a two-finger pinch zooms in (${cam1.dist.toFixed(1)} -> ${cam2.dist.toFixed(1)}) and selects nothing`)
  await touch('touchStart', [[150, 350], [240, 350]])
  for (let k = 1; k <= 8; k++) { const t = k * 0.09; await touch('touchMove', [[195 - 45 * Math.cos(t), 350 - 45 * Math.sin(t)], [195 + 45 * Math.cos(t), 350 + 45 * Math.sin(t)]]) }
  await touch('touchEnd', [])
  await frames(page, 40)
  const cam3 = (await stats(page)).camera
  check(Math.abs(cam3.yaw - cam2.yaw) > 0.4, `a two-finger twist turns the view (${(cam3.yaw - cam2.yaw).toFixed(2)} rad)`)
  await farmTier(page)
  a = await anchors(page)
  await touch('touchStart', [[Math.round(a[2].x), Math.round(a[2].y - 10)]])
  await touch('touchMove', [[Math.round(a[2].x) + 3, Math.round(a[2].y - 9)]])
  await touch('touchEnd', [])
  await frames(page, 3)
  check(JSON.stringify(await selection(page)) === '[2]', 'a tap, even with a slight wobble, selects the field')
  await touch('touchStart', [[Math.round(a[5].x), Math.round(a[5].y - 10)]])
  await page.waitForTimeout(750)
  await touch('touchEnd', [])
  await frames(page, 3)
  check(JSON.stringify(await smart(page)) === '[5]' && JSON.stringify(await selection(page)) === '[2]', `a long press gives the field its order and does not select it (${JSON.stringify(await smart(page))})`)
  check(errors.length === 0, `touch: no page errors (${errors.join(' | ')})`)
  await page.context().close()
}

// ---- No WebGL at all.
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
  await page.mouse.click(a.x, a.y - 20)
  const sel = await page.evaluate(() => (window as any).__county.app.selected)
  const tier = await page.evaluate(() => (window as any).__countyField.flat === true)
  check(sel === 3 && tier, `fallback view: drawn flat, and a click selects the field under it (${sel})`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/fallback-no-webgl.png` })
  check(errors.length === 0, `fallback view: no page errors (${errors.join(' | ')})`)
  await nogl.close()
}
await browser.close()
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
