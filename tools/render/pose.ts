// Checks that nobody is ever drawn stiff: every figure the picture holds (the farm's people on foot, driving and at
// each kind of work, callers, pickers, the men asking for work) is watched on every frame through a first year and
// into a second, at each speed and paused, with someone followed, on a day off, over a hire, a change of screen and a
// saved game opened again. A frame fails where a figure's two arms are both held straight out to its sides (the
// letter T), or both straight out in front with nothing in its hands, or where a figure is carried over the ground
// faster than a slow walk while its legs are not stepping and it is not sat on anything (it slides as it stands).
// Usage: node tools/render/pose.ts <base-url> <out dir> [--seconds=6]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from '../quality/shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/pose'] = args.filter(a => !a.startsWith('--'))
const SECONDS = Number(args.find(a => a.startsWith('--seconds='))?.slice(10) ?? 6)
mkdirSync(out, { recursive: true })
let failed = 0
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))

// In the page: every frame, each figure drawn is judged by its arms.
const WATCH = `(() => {
  const SHOW = ${args.includes('--show')}
  const P = window.__pose = { label: '', by: {}, first: {}, show: SHOW }
  let was = [], wasT = 0
  const tick = now => {
    requestAnimationFrame(tick)
    const f = window.__countyField
    if (!f || !f.figureRows || !P.label) return
    const rows = f.figureRows()
    const b = P.by[P.label] ??= { frames: 0, figures: 0, tee: 0, front: 0, most: 0, slid: 0, fastest: 0 }
    b.frames++
    const dt = (now - wasT) / 1000
    wasT = now
    for (const r of rows) {
      b.figures++
      const [x, y, z, s, extL, sideL, fwdL, , extR, sideR, fwdR, , flags] = r
      const out = Math.min(extL * sideL, extR * sideR)
      if (out > b.most) b.most = out
      const tee = extL > 0.9 && extR > 0.9 && sideL > 0.7 && sideR > 0.7
      const front = !flags && extL > 0.93 && extR > 0.93 && fwdL > 0.85 && fwdR > 0.85
      if (tee) b.tee++
      if (front) b.front++
      // The same figure a frame ago is the nearest one then, if any stood within a metre and a half; one that has
      // slid for five frames running is counted.
      let near = null, best = 1.5
      for (const o of was) { const d = Math.hypot(o[0] - x, o[2] - z); if (d < best) { best = d; near = o } }
      const v = near && dt > 0.004 && dt < 0.1 ? best / dt : 0
      const sliding = v > 0.6 && !(flags & 16) && !(flags & 32)
      r.run = sliding ? ((near && near.run) || 0) + 1 : 0
      if (r.run === 5) { b.slid++; if (v > b.fastest) b.fastest = v }
      // The first stiff figure of a state is looked at where it is, on the frame it was found: the clock stopped and
      // the camera brought to it. (--show: the first figure seen covering ground on its feet, to look at as well.)
      const show = P.show && !P.first[P.label] && v > 2.5 && (flags & 16) && (r.strode = ((near && near.strode) || 0) + 1) === 8
      if ((tee || front || r.run === 5 || show) && !P.first[P.label]) {
        P.first[P.label] = { x, y, z, s, kind: tee ? 'T' : front ? 'front' : show ? 'walks at ' + v.toFixed(1) + ' m/s' : 'slides at ' + v.toFixed(1) + ' m/s', row: r.map(v => +v.toFixed(2)), speed: window.__county.app.speed }
        window.__county.app.setSpeed(0)
        f.view({ x, z, dist: 11, pitch: 0.28 })
        f.settle()
      }
    }
    was = rows
  }
  requestAnimationFrame(tick)
})()`

type Sum = { frames: number; figures: number; tee: number; front: number; most: number; slid: number; fastest: number }
type First = { x: number; y: number; z: number; s: number; kind: string; row: number[]; speed: number }
async function open(): Promise<void> {
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0, null, { timeout: 180000 })
  await page.evaluate(HELPER)
  await page.evaluate(WATCH)
  await page.evaluate(() => (window as any).__countyField.figures(true))
}
// Watches for a while under a name; a stiff figure found is looked at where it stands.
async function watch(label: string, seconds = SECONDS): Promise<void> {
  await page.evaluate(l => { (window as any).__pose.label = l }, label)
  await page.waitForTimeout(seconds * 1000)
  await page.evaluate(() => { (window as any).__pose.label = '' })
  const [b, first] = await page.evaluate(l => { const P = (window as any).__pose; return [P.by[l], P.first[l] ?? null] }, label) as [Sum | undefined, First | null]
  if (!b) { check(false, `${label}: nothing was watched`); return }
  if (first) {
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/${label.replace(/[^\w]+/g, '-')}.png` })
    await page.evaluate(s => (window as any).__county.app.setSpeed(s), first.speed)
    await page.evaluate(() => { const f = (window as any).__countyField; f.tier('farm'); f.settle() })
  }
  check(b.tee === 0 && b.front === 0 && b.slid === 0, `${label}: ${b.figures} figures over ${b.frames} frames, ${b.tee} held as a T, ${b.front} with both arms straight out in front, ${b.slid} slid as they stood${b.slid ? ` (to ${b.fastest.toFixed(1)} m/s)` : ''}, the nearest to a T ${b.most.toFixed(2)} of 1${first ? `; ${first.kind} at (${first.x.toFixed(0)}, ${first.z.toFixed(0)}): ${first.row.join(' ')}` : ''}`)
}
const speed = (s: number) => page.evaluate(s => (window as any).__county.app.setSpeed(s), s)
const farmView = () => page.evaluate(() => { const f = (window as any).__countyField; f.tier('farm'); f.settle() })
const clear = async () => { await closeAll(page); await q(page, `const { app } = q.g(); if (app.campaign) app.campaign.incidents = []`) }

await open()
await watch('the opening', 4)

// A farm of four people (a bunkhouse given, every applicant hired), spraying settled so no question stops the clock.
const FARM = `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 30000
  c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
  for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })`
await q(page, FARM)
await page.waitForTimeout(600)
await watch('the spring plan', 3)
await q(page, `const { app } = q.g(); app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'ask' }); app.settings.pauseOnAlerts = false; app.setSpeed(0)`)
await clear()
await farmView()
await watch('the first day, paused', 3)

// Planting: the word given, the crew out with the planter.
await q(page, `const { app } = q.g(); const c = app.campaign; q.run(q.day(5, 16)); c.incidents = []
  for (const f of c.fields.map((x, i) => i).filter(i => c.plans[i]?.crop === 'potato' && c.season.fields[i].status === 'off').slice(0, 4)) app.do({ t: 'job', kind: 'plant', field: f })`)
for (const s of [1, 2, 3]) { await clear(); await speed(s); await watch(`planting at ${['', '1x', '3x', '8x'][s]}`) }
await speed(0)
await watch('planting, paused', 3)

// July: spraying with one tractor (someone waits for it), a hand scouting, the others as the day has them.
await q(page, `const { app } = q.g(); app.do({ t: 'sundays', off: false }); q.run(q.day(7, 10), ['spray']); app.campaign.incidents = []
  for (const j of [...app.campaign.season.jobs]) app.do({ t: 'cancel', id: j.id })
  for (const f of [0, 2, 4, 5]) app.do({ t: 'job', kind: 'spray', field: f })
  app.do({ t: 'job', kind: 'scout', field: 1 })`)
for (const s of [1, 2, 3]) { await clear(); await speed(s); await watch(`a spraying day at ${['', '1x', '3x', '8x'][s]}`) }
// Each person followed in turn.
const people = await q(page, `return q.g().app.campaign.crew.map(u => u.id)`) as number[]
await clear(); await speed(1)
for (const id of people) {
  await page.evaluate(id => { (window as any).__county.app.selectUnit(id, 'land'); (window as any).__countyField.follow?.(id) }, id)
  await page.evaluate(id => { const v = (window as any).__county; const b = document.querySelector('[data-testid="whois-follow"]') as HTMLElement | null; if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); void v; void id }, id)
  await watch(`person ${id} followed`, 4)
}
await page.evaluate(() => { (window as any).__county.app.selectUnit(-1); const b = document.querySelector('[data-testid="whois-follow"]') as HTMLElement | null; if (b?.getAttribute('aria-pressed') === 'true') b.click() })
await farmView()
// Someone new taken on in the season.
await q(page, `const { app } = q.g(); const c = app.campaign; const r = app.do({ t: 'hire', kind: 'hand' }); return r.ok`)
await clear(); await speed(1)
await watch('a hand hired in the season', 4)
// A day off: everyone at home.
await q(page, `const { app, sim } = q.g(); const c = app.campaign; app.do({ t: 'sundays', off: true }); app.setSpeed(0)
  for (let n = 0; n < 8 && sim.weekday(c.year, c.season.day + 1) !== 6; n++) app.do({ t: 'day' })
  c.incidents = []`)
await clear(); await speed(1)
await watch('into a day off at 1x', 8)
await page.evaluate(() => { const f = (window as any).__countyField; f.tier('yard'); f.settle() }).catch(() => {})
await watch('the yard on a day off', 4)
await farmView()

// The dig and the haul in late September.
await q(page, `const { app } = q.g(); app.do({ t: 'sundays', off: false }); q.run(q.day(9, 24), ['sell']); app.campaign.incidents = []`)
for (const s of [1, 2, 3]) { await clear(); await speed(s); await watch(`the dig and the haul at ${['', '1x', '3x', '8x'][s]}`) }
await speed(0)
await watch('the dig, paused', 3)

// The saved game opened again.
await page.evaluate(() => (window as any).__county.app.save())
await open()
const cont = page.getByTestId('continue')
if (await cont.waitFor({ timeout: 20000 }).then(() => true, () => false)) await cont.click()
await page.waitForTimeout(400)
await watch('a saved game just opened', 4)
await clear(); await speed(1)
await watch('a saved game running again', 5)

// Winter, and the second year: its spring and a week of planting at 8x.
await q(page, `const { app } = q.g(); const c = app.campaign; q.run(999, ['sell']); c.incidents = []; app.setSpeed(0)`)
await clear()
await watch('the season closed', 3)
await q(page, `const { app } = q.g(); const c = app.campaign; if (c.phase === 'season') app.do({ t: 'endSeason' })
  for (const u of c.crew) app.do({ t: 'winter', unit: u.id, work: 'woods', field: 14 })`)
await page.waitForTimeout(500)
await watch('the winter sheet', 3)
await q(page, `const { app } = q.g(); q.winter(12, 3); app.do({ t: 'next' })`)
await page.waitForTimeout(500)
await watch('the second spring plan', 3)
await q(page, `const { app } = q.g(); const c = app.campaign; app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'auto' }); q.run(q.day(5, 16)); c.incidents = []
  for (const f of c.fields.map((x, i) => i).filter(i => c.plans[i]?.crop === 'potato' && c.season.fields[i].status === 'off').slice(0, 4)) app.do({ t: 'job', kind: 'plant', field: f })`)
await clear(); await farmView(); await speed(3)
await watch('the second year, planting at 8x', 8)

check(errors.length === 0, `no page errors (${errors.join('; ').slice(0, 200)})`)
await browser.close()
if (failed) process.exitCode = 1
