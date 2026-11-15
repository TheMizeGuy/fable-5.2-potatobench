// The owner, 15 November: "You cant move around easily if zoomed in on a plot for example as the mouse cant get a
// handle and then also if you zoom in fast or zoom out fast there a noticeable hitch/stutter". Both, measured on a
// July farm with the interface up, at the owner's window:
//   1. Fast zooms: the wheel run from the farm tier to the closest view and back in about half a second each way,
//      several times, every frame's interval kept with the game's own parts of it (src/render/laps.ts) and what it did
//      that not every frame does (a shadow map drawn again, grass laid, a patch of trees changed, a shader made).
//   2. A left-drag with the view close on a field, begun at five heights of the window: how far the land under the
//      pointer came with it (1 = it stayed under the pointer, 0 = the drag did nothing).
// The farm is left with calls unanswered (sprays and hillings asked for, each a stamp on its field's tag), as a farm
// in play usually is: with no stamps the tags are cheap to put and nothing comes late.
// Usage: node tools/render/zoomhitch.ts <url> [--size=2507x1308] [--dpr=1.5] [--passes=4]
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from '../quality/shared.ts'

const args = process.argv.slice(2)
const base = args.find(a => !a.startsWith('--')) ?? 'http://localhost:5317/'
const opt = (name: string, d: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const [W, H] = opt('size', '2507x1308').split('x').map(Number)
const DPR = Number(opt('dpr', '1.5'))
const PASSES = Number(opt('passes', '4'))

const INSTRUMENT = `(() => {
  const M = window.__zh = { on: false, rows: [] }
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = cb => raf(ts => {
    if (!M.on) return cb(ts)
    const t0 = performance.now()
    try { cb(ts) } finally {
      const f = window.__countyField
      M.rows.push([ts, performance.now() - t0, ...(f && f.drew ? f.drew() : [])])
    }
  })
})()`

const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })).newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.addInitScript(INSTRUMENT)
await page.addInitScript(HELPER)
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })
await q(page, `const g = window.__countyGuide; if (g) { g.reset(); g.refuse() } const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 20000; app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'ask' })
  q.run(q.day(7, 6), ['hill', 'spray']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
await closeAll(page)
await page.waitForTimeout(2500)

const f1 = (x: number) => x.toFixed(1)
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? NaN }
const dist = () => page.evaluate(() => (globalThis as any).__countyField.stats().camera.dist as number)

// Where a potato field's middle is on the screen: what the wheel zooms to.
// (or, with a card lying over that, the nearest point of bare land along the window's middle)
const aim = () => page.evaluate(() => {
  const k = (globalThis as any).__countyField.corners(0) as { x: number; y: number }[]
  const mid = { x: k.reduce((t, p) => t + p.x, 0) / k.length, y: k.reduce((t, p) => t + p.y, 0) / k.length }
  const land = (x: number, y: number) => document.elementFromPoint(x, y)?.tagName === 'CANVAS'
  if (land(mid.x, mid.y)) return mid
  for (let d = 40; d < innerWidth; d += 40) for (const x of [mid.x + d, mid.x - d]) if (x > 20 && x < innerWidth - 20 && land(x, innerHeight * 0.6)) return { x, y: innerHeight * 0.6 }
  return mid
})
// 1. Fast zooms, onto a field.
// What is open over the land while the wheel is run: nothing, a field's card, a person's card, a telegram.
const STATES: [string, string][] = [
  ['nothing open, paused', `app.setSpeed(0); app.select(-1); app.selectUnit(-1)`],
  ['nothing open, 1x', `app.setSpeed(1); app.select(-1); app.selectUnit(-1)`],
  ['a field\'s card open', `app.setSpeed(0); app.selectUnit(-1); app.select(0)`],
  ['a person\'s card open', `app.setSpeed(0); app.select(-1); app.selectUnit(app.campaign.crew[0].id)`],
  ['the spraying question up', `app.setSpeed(0); app.select(-1); app.selectUnit(-1); app.campaign.sprayWay = undefined; app.select(0); app.select(-1)`],
]
for (const [clock, setup] of STATES) {
  await q(page, `const { app } = q.g(); ${setup}`)
  await page.waitForTimeout(400)
  console.log(`  (over the land: ${await page.evaluate(() => [...document.querySelectorAll('#ui .command, #ui .person-card, #ui .telegram')].filter(e => (e as HTMLElement).offsetParent !== null && !(e as HTMLElement).hidden).map(e => String((e as HTMLElement).className).split(' ').slice(0, 2).join('.')).join(', ') || 'nothing')})`)
  await page.keyboard.press('Home')
  await page.waitForTimeout(1800)
  const on = await aim()
  await page.mouse.move(on.x, on.y)
  // From as far out as the camera goes: every tag on the screen, the whole range crossed.
  for (let k = 0; k < 40; k++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(16) }
  await page.waitForTimeout(1500)
  const far = await dist()
  await page.evaluate(() => { const w = globalThis as any; w.__countyField.laps?.(true); performance.clearMeasures(); w.__zh.rows = []; w.__zh.on = true })
  const marks: [string, number][] = []
  const now = () => page.evaluate(() => performance.now())
  let near = far
  for (let n = 0; n < PASSES; n++) {
    marks.push([`in ${n}`, await now()])
    for (let k = 0; k < 40; k++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(16) }
    await page.waitForTimeout(900)
    near = await dist()
    marks.push([`out ${n}`, await now()])
    for (let k = 0; k < 40; k++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(16) }
    await page.waitForTimeout(900)
  }
  marks.push(['end', await now()])
  const got = await page.evaluate(() => {
    const w = globalThis as any
    w.__zh.on = false
    w.__countyField.laps?.(false)
    return { rows: w.__zh.rows as number[][], laps: performance.getEntriesByType('measure').filter(m => m.name.startsWith('county:')).map(m => [m.name.slice(7), m.startTime, m.duration] as [string, number, number]) }
  })
  const rows = got.rows
  const gaps = rows.slice(1).map((r, k) => r[0] - rows[k][0])
  const m = med(gaps)
  console.log(`\nfast zooms, ${clock}: ${far.toFixed(0)} m to ${near.toFixed(1)} m and back, ${PASSES} times; ${rows.length} frames; frame to frame median ${f1(m)} ms, longest ${f1(Math.max(...gaps))} ms; over 1.5x the median: ${gaps.filter(g => g > m * 1.5).length}, over 2.5x: ${gaps.filter(g => g > m * 2.5).length}`)
  console.log(`  the page's own work in a frame: median ${f1(med(rows.map(r => r[1])))} ms, longest ${f1(Math.max(...rows.map(r => r[1])))} ms`)
  // Each late frame: when (which zoom), how long, and what the frame before the gap held.
  const NAMES = ['shadow maps', 'grass laid', 'tree patches', 'geometries']
  const late = gaps.map((g, k) => ({ g, k })).filter(x => x.g > m * 1.8).sort((a, b) => b.g - a.g).slice(0, 14)
  for (const x of late) {
    const r = rows[x.k], next = rows[x.k + 1]
    const at = r[0]
    const mark = [...marks].reverse().find(mk => mk[1] <= at)
    const parts = new Map<string, number>()
    for (const [name, start, dur] of got.laps) if (start >= r[0] - 1 && start < next[0] - 1) parts.set(name, (parts.get(name) ?? 0) + dur)
    const top = [...parts].filter(p => p[1] >= 0.5).sort((a, b) => b[1] - a[1]).slice(0, 6).map(p => `${p[0]} ${f1(p[1])}`).join(', ')
    // drew(): frameNo, picture width, beats, programs, shadows redrawn, grass laid, flora swaps, geometries
    const d = (i: number) => (next[2 + i] ?? 0) - (r[2 + i] ?? 0)
    const did = [d(3) ? `${d(3)} shader made` : '', d(4) ? `shadows +${d(4)}` : '', d(5) ? `grass +${d(5)}` : '', d(6) ? `trees +${d(6)}` : '', d(7) ? `geometries ${d(7) > 0 ? '+' : ''}${d(7)}` : ''].filter(Boolean).join(', ')
    console.log(`  ${f1(x.g).padStart(6)} ms  ${String(mark?.[0] ?? '').padEnd(6)} +${((at - (mark?.[1] ?? at)) / 1000).toFixed(2)} s  page ${f1(r[1])} / next ${f1(next[1])} ms${top ? `  parts: ${top}` : ''}${did ? `  did: ${did}` : ''}`)
  }
  void NAMES
}

// 2. A left-drag with the view close on a field.
await q(page, `const { app } = q.g(); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
await closeAll(page)
await page.keyboard.press('Home')
await page.waitForTimeout(1500)
{ const on = await aim(); await page.mouse.move(on.x, on.y) }
for (let k = 0; k < 28; k++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(16) }
await page.waitForTimeout(1500)
const cam = () => page.evaluate(() => { const c = (globalThis as any).__countyField.stats().camera; return { x: c.x as number, z: c.z as number, dist: c.dist as number, pitch: c.pitch as number } })
const start = await cam()
console.log(`\ndrags with the view ${start.dist.toFixed(1)} m out (pitch ${start.pitch?.toFixed?.(2) ?? '?'}): 160 px to the left and 100 px down, begun at five heights`)
for (const fy of [0.15, 0.3, 0.45, 0.6, 0.8]) {
  const a = await cam()
  const x0 = W * 0.5, y0 = H * fy
  const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.tagName === 'CANVAS' ? 'the land' : `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).split(' ')[0]}`) : 'nothing' }, [x0, y0])
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let k = 1; k <= 10; k++) { await page.mouse.move(x0 - 16 * k, y0 + 10 * k); await page.waitForTimeout(24) }
  await page.waitForTimeout(150)
  await page.mouse.up()
  await page.waitForTimeout(700)
  const b = await cam()
  const moved = Math.hypot(b.x - a.x, b.z - a.z)
  console.log(`  begun ${Math.round(fy * 100)}% down the window (over ${under}): the camera moved ${moved.toFixed(1)} m (${(moved / a.dist).toFixed(2)} of its distance out)`)
}
console.log(`errors: ${errors.length} ${errors.slice(0, 3).join(' ; ')}`)
await browser.close()
