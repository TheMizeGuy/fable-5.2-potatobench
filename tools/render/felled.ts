// Checks that a tract whose trees are down is drawn as ground, stumps and whatever still stands, and never as a dark
// shape where its trees were: the Home Woodlot felled over the first winter by the farm's own people and seen in the
// spring of year two, the Alder Swale a winter later in year three, and a bought and a rented woodland part felled.
// Each is looked at by day from the playing view and from the tract's own, and no patch of the picture may be near
// black (under 8 of 255) over 400 pixels that touch.
// Usage: node tools/render/felled.ts <base-url> <out dir>
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { GPU, HELPER, q } from '../quality/shared.ts'

const [base = 'http://localhost:5317/', out = 'out/felled'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const DARK = 8, MOST = 400
let failed = 0
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(base)
await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0, null, { timeout: 180000 })
await page.evaluate(HELPER)

type Dark = { mean: number; dark: number; most: number; box: number[] }
// The picture's mean brightness, and its largest patch of near-black pixels that touch (how many, and where).
async function darkest(shot: Buffer): Promise<Dark> {
  return page.evaluate(async ([s, limit]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob())
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const g = c.getContext('2d')!
    g.drawImage(bmp, 0, 0)
    const w = bmp.width, h = bmp.height, p = g.getImageData(0, 0, w, h).data
    const is = new Uint8Array(w * h)
    let sum = 0, dark = 0
    for (let i = 0; i < w * h; i++) {
      const l = 0.2126 * p[i * 4] + 0.7152 * p[i * 4 + 1] + 0.0722 * p[i * 4 + 2]
      sum += l
      if (l < (limit as number)) { is[i] = 1; dark++ }
    }
    let most = 0, box = [0, 0, 0, 0]
    const stack = new Int32Array(w * h)
    for (let i = 0; i < w * h; i++) {
      if (is[i] !== 1) continue
      let top = 0, n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0
      stack[top++] = i
      is[i] = 2
      while (top) {
        const k = stack[--top], x = k % w, y = (k - x) / w
        n++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        if (x > 0 && is[k - 1] === 1) { is[k - 1] = 2; stack[top++] = k - 1 }
        if (x < w - 1 && is[k + 1] === 1) { is[k + 1] = 2; stack[top++] = k + 1 }
        if (y > 0 && is[k - w] === 1) { is[k - w] = 2; stack[top++] = k - w }
        if (y < h - 1 && is[k + w] === 1) { is[k + w] = 2; stack[top++] = k + w }
      }
      if (n > most) { most = n; box = [x0, x1, y0, y1] }
    }
    return { mean: sum / (w * h), dark, most, box }
  }, [shot.toString('base64'), DARK] as [string, number])
}

const frames = (n: number) => page.evaluate(n => new Promise<void>(res => { let k = 0; const tick = () => (++k >= n ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick) }), n)
const bare = (on: boolean) => page.evaluate(on => { for (const el of [...document.body.children]) if (el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT') (el as HTMLElement).style.visibility = on ? 'hidden' : '' }, on)
// The picture alone, by the light of mid afternoon, from the playing view or from a tract's own.
async function look(name: string, tract: number | null): Promise<void> {
  await page.evaluate(i => {
    const f = (window as any).__countyField
    f.tune({ hour: 0.72 })
    if (i === null) f.tier('farm'); else f.tier('field', i)
    f.settle()
  }, tract)
  await page.waitForTimeout(900)
  await frames(6)
  await bare(true)
  const shot = await page.screenshot({ path: `${out}/${name}.png` })
  await bare(false)
  const d = await darkest(shot)
  const where = d.most ? `, the largest ${d.most} pixels at (${d.box[0]}..${d.box[1]}, ${d.box[2]}..${d.box[3]})` : ''
  check(d.mean > 40 && d.most < MOST, `${name}: lit by day (mean ${d.mean.toFixed(0)} of 255), ${d.dark} near-black pixels${where}`)
}
// What stands of each tract, as the game has it.
const tracts = (): Promise<string> => q(page, `const { app, sim } = q.g(); const c = app.campaign
  return [14, 15, 16, 17].map(i => sim.PARCELS[i].name + ' ' + c.fields[i].cover + ' ' + c.fields[i].felled.toFixed(1) + ' days felled (' + c.fields[i].tenure + ')').join('; ')`) as Promise<string>
// (spring: what is done at the spring plan, before the season begins)
const winter = (spring = '') => `const said = []
  if (c.phase === 'season') app.do({ t: 'endSeason' })
  for (const u of c.crew) { const tract = [14, 15, 16, 17].find(i => c.fields[i].tenure !== 'none' && (c.fields[i].cover === 'woods' || c.fields[i].cover === 'brush')); const r = app.do({ t: 'winter', unit: u.id, work: 'woods', field: tract }); said.push(u.name + ' to tract ' + tract + (r.ok ? '' : ': ' + r.err)) }
  q.winter(12, 3); const next = app.do({ t: 'next' }); ${spring}; app.do({ t: 'begin' }); q.run(q.day(4, 20)); app.setSpeed(0)
  return said.join(', ') + '; next ' + next.ok + '; year ' + (c.year - 1976) + ', day ' + c.season.day + ', ' + sim.today(app.world, c).sky`

// Year one by the reference practice, the winter in the woods, and the spring of year two.
console.log('  ', await q(page, `const { app, sim } = q.g(); q.start(1977, 5); const c = app.campaign; q.run(999, ['sell']); c.cash += 60000; ${winter()}`))
console.log('  ', await tracts())
await look('1-year-two-playing-view', null)
await look('1-year-two-home-woodlot', 14)

// Year two the same way, a second winter in the woods, and the spring of year three, when woodland is bought and rented.
const LAND = `c.cash += 60000; for (const [t, i] of [['buyLand', 16], ['rent', 17]]) { const r = app.do({ t, field: i }); said.push(t + ' ' + sim.PARCELS[i].name + (r.ok ? '' : ': ' + r.err)) }`
console.log('  ', await q(page, `const { app, sim } = q.g(); const c = app.campaign; q.run(999, ['sell']); c.cash += 60000; ${winter(LAND)}`))
console.log('  ', await tracts())
await look('2-year-three-playing-view', null)
await look('2-year-three-home-woodlot', 14)
await look('2-year-three-alder-swale', 15)

// That woodland part felled (a test's edit of how far the felling has gone, and of whose it is where the game would
// not let it be taken).
await q(page, `const { app, sim } = q.g(); const c = app.campaign
  if (c.fields[16].tenure === 'none') c.fields[16].tenure = 'owned'
  if (c.fields[17].tenure === 'none') c.fields[17].tenure = 'rented'
  c.fields[16].felled = sim.FELL_DAYS.woods * 0.5; c.fields[17].felled = sim.FELL_DAYS.woods * 0.75
  app.emit({ type: 'change' })`)
console.log('  ', await tracts())
await look('3-bought-burnt-hill-half-felled', 16)
await look('3-rented-back-lot-three-quarters-felled', 17)
await look('3-playing-view', null)

check(errors.length === 0, `no page errors (${errors.join('; ').slice(0, 200)})`)
await browser.close()
if (failed) process.exitCode = 1
