// How frames come, as a series and not a mean: in each of the states a player spends time in, every animation frame
// for a while is kept (when it came, how long the page worked in it and on which of its parts, whether a picture was
// drawn, the picture's size and the beats to a frame, the day), with where each person's pin and the camera stood, and
// the browser's own record of its long frames. The table gives, per state: frames drawn a second, the gaps between
// pictures (middle, 95th, 99th, longest), how many were over 20 and 33 ms after the first second, the page's work per
// frame and its dearest part, what the late frames fell on (a day's turn, the interface, the land), how often the
// picture changed size, and how many frames something on the screen stepped more than twice its usual step.
//   --throttle=4   the page's thread slowed that many times (CDP), to stand in for a laptop
//   --adapt        the game left to follow frame time as a player's browser does (the picture's size and the setting)
//   --budget       fail where a state does not keep its frames (see BUDGET below)
// Usage: node tools/render/flow.ts <url> <out dir> [--size=1512x982] [--dpr=2] [--throttle=4] [--seconds=20] [--states=a,b] [--adapt] [--budget]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from '../quality/shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/flow'] = args.filter(a => !a.startsWith('--'))
const opt = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const flag = (name: string) => args.includes(`--${name}`)
const [W, H] = (opt('size') ?? '1512x982').split('x').map(Number)
const DPR = Number(opt('dpr') ?? 2)
const THROTTLE = Number(opt('throttle') ?? 1)
const SECONDS = Number(opt('seconds') ?? 20)
const ONLY = opt('states')?.split(',')
mkdirSync(out, { recursive: true })
// What a state has to keep, with the page's thread at full speed and slowed four times.
const BUDGET = THROTTLE > 1 ? { p99: 34, over33: 2, steps: 0 } : { p99: 20, over33: 0, steps: 0 }

const INSTRUMENT = `(() => {
  const F = window.__flow = { on: false, rows: [], long: [], ids: [], fine: {} }
  const real = window.requestAnimationFrame.bind(window)
  let cbs = [], asked = false
  const run = ts => {
    asked = false
    const list = cbs; cbs = []
    const t0 = performance.now()
    for (const cb of list) cb(ts)
    const t1 = performance.now()
    if (!F.on) return
    const f = window.__countyField, a = window.__county && window.__county.app
    if (!f || !f.drew) return
    const d = f.drew(), c = a && a.campaign, cam = f.rig.cur
    const laps = { days: 0, land: 0, interface: 0, sound: 0 }
    for (const m of performance.getEntriesByType('measure')) if (m.name.startsWith('county:')) { const n = m.name.slice(7), k = n.split(':')[0]; laps[k] = (laps[k] || 0) + m.duration; if (n !== k) F.fine[n] = (F.fine[n] || 0) + m.duration }
    performance.clearMeasures()
    const row = [ts, t1 - t0, d[0], d[1], d[2], c && c.season ? c.season.day : -1, a ? a.speed : 0, laps.days, laps.land, laps.interface, laps.sound, cam.x, cam.z, cam.dist, cam.yaw]
    for (const id of F.ids) { const p = f.unitPin(id); row.push(p.visible ? p.x : NaN, p.visible ? p.y : NaN) }
    F.rows.push(row)
  }
  window.requestAnimationFrame = cb => { cbs.push(cb); if (!asked) { asked = true; real(run) } return 0 }
  try {
    new PerformanceObserver(list => { if (F.on) for (const e of list.getEntries()) F.long.push([e.startTime, e.duration, e.blockingDuration || 0, (e.scripts || []).map(s => (s.sourceFunctionName || s.invoker || '?') + ' ' + Math.round(s.duration)).join(', ')]) }).observe({ type: 'long-animation-frame', buffered: false })
  } catch {}
})()`

const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
await page.addInitScript(INSTRUMENT)
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(base + (flag('adapt') ? '?adapt' : ''))
await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0, null, { timeout: 180000 })
await page.evaluate(HELPER)
const cdp = await page.context().newCDPSession(page)
const gpu = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c?.getExtension('WEBGL_debug_renderer_info'); return e ? String(c!.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '?' })
console.log(`${base}  ${W}x${H} at ${DPR}, the page's thread ${THROTTLE > 1 ? `slowed ${THROTTLE} times` : 'at full speed'}${flag('adapt') ? ', following frame time' : ''}; ${gpu}`)

// A farm of four people in July with spraying and scouting ordered, the clock stopped.
const FARM = `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 30000
  c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
  for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })`
const JULY = `app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'auto' }); app.settings.pauseOnAlerts = false
  app.do({ t: 'sundays', off: false }); q.run(q.day(7, 10)); c.incidents = []; app.setSpeed(0)`
const farm = () => page.evaluate(() => { const f = (window as any).__countyField; f.tier('farm'); f.settle() })
const clear = async () => { await closeAll(page); await q(page, `const { app } = q.g(); if (app.campaign) app.campaign.incidents = []`) }
const speed = (s: number) => page.evaluate(s => (window as any).__county.app.setSpeed(s), s)
// Keeps telegrams and tickets from stopping the clock while a state is timed.
const keepRunning = `window.__keep = setInterval(() => { const { app } = window.__county; const c = app.campaign; if (!c) return; if (c.incidents.length) c.incidents = []; }, 400)`
const stopKeeping = `clearInterval(window.__keep)`

type Row = number[]
type State = { name: string; rows: Row[]; long: [number, number, number, string][]; ids: number[] }
const pct = (v: number[], p: number) => (v.length ? v.slice().sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))] : 0)
const results: string[] = []
let failed = 0

async function take(name: string, during: (() => Promise<void>) | null = null, seconds = SECONDS): Promise<void> {
  if (ONLY && !ONLY.includes(name)) return
  const ids = await page.evaluate(() => ((window as any).__county.app.campaign?.crew ?? []).map((u: { id: number }) => u.id)) as number[]
  await page.evaluate(ids => { const F = (window as any).__flow; F.rows = []; F.long = []; F.fine = {}; F.ids = ids; (window as any).__countyField.laps(true); performance.clearMeasures(); F.on = true }, ids)
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  const until = Date.now() + seconds * 1000
  if (during) while (Date.now() < until) await during()
  else await page.waitForTimeout(seconds * 1000)
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const got = await page.evaluate(() => { const F = (window as any).__flow; F.on = false; (window as any).__countyField.laps(false); return { rows: F.rows, long: F.long, fine: F.fine } }) as { rows: Row[]; long: State['long']; fine: Record<string, number> }
  report({ name, rows: got.rows, long: got.long, ids })
  const fine = Object.entries(got.fine).map(([k, v]) => [k, v / Math.max(1, got.rows.length)] as [string, number]).filter(x => x[1] >= 0.05).sort((a, b) => b[1] - a[1])
  if (fine.length) console.log(`       parts, ms a frame: ${fine.map(([k, v]) => `${k} ${v.toFixed(2)}`).join('; ')}`)
}

function report(s: State): void {
  const rows = s.rows
  if (rows.length < 10) { console.log(`FAIL ${s.name}: ${rows.length} frames`); failed++; return }
  const t0 = rows[0][0]
  // Pictures: the frames in which one was drawn.
  const drawn = rows.filter((r, i) => i > 0 && r[2] !== rows[i - 1][2])
  const gaps: { ms: number; row: Row; before: Row }[] = []
  for (let i = 1; i < drawn.length; i++) gaps.push({ ms: drawn[i][0] - drawn[i - 1][0], row: drawn[i], before: drawn[i - 1] })
  const settled = gaps.filter(g => g.row[0] - t0 > 1000)
  const ms = settled.map(g => g.ms)
  const span = (rows[rows.length - 1][0] - t0) / 1000
  const work = rows.map(r => r[1])
  const part = (k: number) => rows.reduce((a, r) => a + r[k], 0) / rows.length
  const parts: [string, number][] = [['days', part(7)], ['land', part(8)], ['interface', part(9)], ['sound', part(10)]]
  const worst: [string, number][] = [['days', Math.max(...rows.map(r => r[7]))], ['land', Math.max(...rows.map(r => r[8]))], ['interface', Math.max(...rows.map(r => r[9]))], ['sound', Math.max(...rows.map(r => r[10]))]]
  const late = settled.filter(g => g.ms > 33)
  // What each late picture fell on: a day's turn in the frames since the last picture, and the dearest part of them.
  const on = new Map<string, number>()
  for (const g of late) {
    const between = rows.filter(r => r[0] > g.before[0] && r[0] <= g.row[0])
    const turned = between.some(r => r[5] !== g.before[5])
    const dear = [7, 8, 9, 10].map(k => [['days', 'land', 'interface', 'sound'][k - 7], Math.max(...between.map(r => r[k]))] as [string, number]).sort((a, b) => b[1] - a[1])[0]
    const key = `${turned ? "a day's turn, " : ''}${dear[1] > 8 ? `${dear[0]} ${dear[1].toFixed(0)} ms` : 'no work of the page'}`
    on.set(key, (on.get(key) ?? 0) + 1)
  }
  const sizes = new Set(rows.map(r => r[3])), every = new Set(rows.map(r => r[4]))
  let resized = 0
  for (let i = 1; i < rows.length; i++) if (rows[i][3] !== rows[i - 1][3]) resized++
  // Steps: each pin's move from one picture to the next while the camera holds, and the camera's own.
  let stepped = 0, biggest = 0
  const stepsOf = (get: (r: Row) => number[] | null): void => {
    const d: { v: number; t: number }[] = []
    for (const g of settled) { const a = get(g.before), b = get(g.row); if (a && b && g.ms < 40) d.push({ v: Math.hypot(b[0] - a[0], b[1] - a[1]), t: g.row[0] }) }
    const moving = d.filter(x => x.v > 0.05)
    if (moving.length < 20) return
    const mid = pct(moving.map(x => x.v), 0.5)
    for (const x of moving) if (x.v > Math.max(mid * 2.5, mid + 3)) { stepped++; biggest = Math.max(biggest, x.v / mid) }
  }
  const camStill = (r: Row, b: Row) => r[11] === b[11] && r[12] === b[12] && r[13] === b[13] && r[14] === b[14]
  for (let k = 0; k < s.ids.length; k++) stepsOf(r => (Number.isFinite(r[15 + 2 * k]) ? [r[15 + 2 * k], r[16 + 2 * k]] : null))
  stepsOf(r => [r[11] * 8, r[12] * 8])
  void camStill
  const p50 = pct(ms, 0.5), p95 = pct(ms, 0.95), p99 = pct(ms, 0.99), max = ms.length ? Math.max(...ms) : 0
  const over20 = ms.filter(v => v > 20).length, over33 = late.length
  const line = `${s.name.padEnd(26)} ${(drawn.length / span).toFixed(0).padStart(3)} fps | gaps ${p50.toFixed(1)} / ${p95.toFixed(1)} / ${p99.toFixed(1)} / ${max.toFixed(0)} ms | over 20: ${over20}, over 33: ${over33} of ${ms.length} | work ${pct(work, 0.5).toFixed(1)} / ${pct(work, 0.99).toFixed(1)} / ${Math.max(...work).toFixed(0)} ms (${parts.map(p => `${p[0]} ${p[1].toFixed(1)}`).join(', ')}; worst ${worst.map(p => `${p[0]} ${p[1].toFixed(0)}`).join(', ')}) | sizes ${[...sizes].join(',')}${resized ? ` changed ${resized} times` : ''}, beats ${[...every].join(',')} | long frames ${s.long.length}${s.long.length ? ` (worst ${Math.max(...s.long.map(l => l[1])).toFixed(0)} ms)` : ''} | steps ${stepped}${stepped ? ` (to ${biggest.toFixed(1)} times the usual)` : ''}${late.length ? ` | late on: ${[...on].map(([k, n]) => `${k} x${n}`).join('; ')}` : ''}`
  const ok = !flag('budget') || (p99 <= BUDGET.p99 && over33 <= BUDGET.over33 && stepped <= BUDGET.steps)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`)
  results.push(line)
  if (!ok) failed++
  writeFileSync(`${out}/${s.name.replace(/[^\w]+/g, '-')}.json`, JSON.stringify({ rows: rows.map(r => r.map(v => (Number.isFinite(v) ? +v.toFixed(2) : null))), long: s.long }))
}

// A hand on the land: the picture dragged back and forth.
let leg = 0
const drag = async (): Promise<void> => {
  const y = H * 0.55, x0 = W * 0.4, x1 = W * 0.6
  await page.mouse.move(leg % 2 ? x1 : x0, y)
  await page.mouse.down()
  await page.mouse.move(leg % 2 ? x0 : x1, y, { steps: 40 })
  await page.mouse.up()
  leg++
}

await q(page, `${FARM}; ${JULY}`)
await clear()
await farm()
await page.waitForTimeout(1500)
await take('paused, the land dragged', drag)
await page.evaluate(keepRunning)
await clear(); await speed(1)
await take('running at 1x')
await clear(); await speed(3)
await take('running at 8x')
await clear(); await speed(1)
await page.evaluate(() => (window as any).__county.app.select(0))
await page.waitForTimeout(500)
await take('a field card open, 1x')
await speed(3)
await take('a field card open, 8x')
await page.evaluate(() => (window as any).__county.app.select(-1))
await speed(1)
const who = await q(page, `return q.g().app.campaign.crew[0].id`) as number
await page.evaluate(id => (window as any).__county.app.selectUnit(id, 'land'), who)
await page.waitForTimeout(400)
await page.evaluate(() => { const b = document.querySelector('[data-testid="whois-follow"]') as HTMLElement | null; if (b && b.getAttribute('aria-pressed') !== 'true') b.click() })
await page.waitForTimeout(1500)
await take('someone followed, 1x')
await page.evaluate(() => { const b = document.querySelector('[data-testid="whois-follow"]') as HTMLElement | null; if (b?.getAttribute('aria-pressed') === 'true') b.click(); (window as any).__county.app.selectUnit(-1) })
await page.evaluate(() => { const f = (window as any).__countyField; f.tier('field', 0); f.settle(); f.view({ dist: 12, pitch: 0.2 }); f.settle() })
await page.waitForTimeout(800)
await take('close over a crop, 1x', drag)
await farm()
await speed(0)
await page.evaluate(stopKeeping)
// A weigh ticket up.
await q(page, `const { app } = q.g(); q.run('weighed', ['sell'], 'lot'); app.setSpeed(0)`)
await page.waitForTimeout(1200)
if (await page.locator('[data-testid="weighin"]').count()) await take('a weigh ticket up', async () => { await page.mouse.move(W * 0.4 + (leg++ % 2) * 80, H * 0.5, { steps: 10 }) }, Math.min(SECONDS, 10))
else console.log('     (no weigh ticket came up)')
// The spring plan with a fold open.
await q(page, `const { app } = q.g(); const c = app.campaign; q.run(999, ['sell']); q.winter(12, 3); app.do({ t: 'next' })`)
await page.waitForTimeout(800)
const fold = page.locator('[data-testid="fold-equipment"], [data-testid="spring-equipment"], [data-k="fold-equipment"]').first()
if (await fold.count()) await fold.click().catch(() => {})
await take('the spring plan', async () => { await page.mouse.move(W * 0.3 + (leg++ % 2) * 120, H * 0.6, { steps: 10 }) }, Math.min(SECONDS, 10))

console.log(errors.length ? `FAIL page errors: ${errors.join('; ').slice(0, 300)}` : 'ok   no page errors')
if (errors.length) failed++
writeFileSync(`${out}/table.txt`, results.join('\n') + '\n')
await browser.close()
if (failed) process.exitCode = 1
