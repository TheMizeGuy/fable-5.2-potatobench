// Frames that come late: the series, not the mean. A farm in July with the crop full and people at work is zoomed in
// from the field tier to the closest the camera goes, a wheel step at a time, and then panned, turned and tipped there
// for twenty seconds, with the clock running at 1x and again paused. Every frame's interval, the page's own work in
// it and the GPU's are kept, and each late frame is laid to what the frame before it held: the frame's parts (User
// Timing marks from the game: src/render/laps.ts), what it did that not every frame does (a shadow map drawn again, a
// square of grass laid, a patch of trees changing, a shader made, the picture's size), and the browser's own record
// of the same seconds (a trace over CDP: layout, style, garbage collection, tasks, the GPU's tasks, and the functions
// the page's thread was in).
//   --against=<url>  another build is opened beside this one and put through the same, turn about, in the one run
//   --throttle=4     the page's thread slowed that many times (CDP), as well as at full speed, to stand in for a laptop
//   --trace=<dir>    the browser's traces are kept there (they open in the browser's performance panel)
//   --dear           once more with the game left to follow frame time as a player's browser does and the picture
//                    made nine times too dear to draw: what the picture's size and the beats to a frame do while the
//                    camera moves, and when it has stopped (the frame times of that run mean nothing)
//   --only=1x,paused which clocks; --notrace leaves the trace out (nothing but the timings)
// Usage: node tools/render/hitch.ts <url> [--against=<url>] [--size=1920x1080] [--dpr=1] [--throttle=4] [--trace=<dir>]
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium, type CDPSession, type Page } from '@playwright/test'
import { GPU } from '../quality/shared.ts'
import { bigFarm } from './farm.ts'

const urls = process.argv.slice(2).filter(a => !a.startsWith('--'))
const base = urls[0] ?? 'http://localhost:5317/'
const flag = (name: string) => process.argv.includes(`--${name}`)
const opt = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const [W, H] = (opt('size') ?? '1920x1080').split('x').map(Number)
const DPR = Number(opt('dpr') ?? 1)
const against = opt('against')
const throttle = Number(opt('throttle') ?? 0)
const keep = opt('trace')
const only = opt('only')?.split(',')
const tracing = !flag('notrace')
const MOVE_S = Number(opt('seconds') ?? 20)
if (keep) mkdirSync(keep, { recursive: true })

// Before the page runs: every animation frame timed (when it was due, when the page got to it, how long the page
// worked, what the GPU spent on what it was sent), and a switch that stops a page drawing while another has its turn.
const INSTRUMENT = `(() => {
  const M = window.__hitch = { on: false, rows: [], lost: 0 }
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__paused === true })
  const raf = window.requestAnimationFrame.bind(window)
  let gl = null, ext = null, pend = [], open = false
  const soon = fn => (window.__paused === true ? setTimeout(() => raf(fn), 150) : raf(fn))
  window.requestAnimationFrame = cb => soon(ts => {
    if (!M.on) return cb(ts)
    if (!gl) { const c = document.getElementById('field'); gl = c && c.getContext('webgl2'); if (gl) ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') }
    const row = [ts, performance.now(), 0, -1]
    let q = null
    if (ext && !open) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); open = true }
    try { cb(ts) } finally {
      row[2] = performance.now() - row[1]
      if (q) {
        gl.endQuery(ext.TIME_ELAPSED_EXT); open = false
        pend.push([q, row])
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
        pend = pend.filter(([p, r]) => {
          if (!gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)) return true
          if (!disjoint) r[3] = gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6; else M.lost++
          gl.deleteQuery(p)
          return false
        })
      }
      const f = window.__countyField
      if (f && f.drew) row.push(...f.drew())
      M.rows.push(row)
    }
  })
})()`

const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'v8', 'disabled-by-default-v8.gc', 'disabled-by-default-v8.cpu_profiler', 'disabled-by-default-v8.cpu_profiler.hires', 'gpu']
// What of the browser's own work is summed for each frame.
const WATCHED = ['Layout', 'UpdateLayoutTree', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'HitTest', 'EventDispatch', 'TimerFire', 'MinorGC', 'MajorGC', 'V8.GC_MC_BACKGROUND_MARKING', 'GPUTask']

interface Side { name: string; page: Page; cdp: CDPSession; laps: boolean }
interface Variant { clock: '1x' | 'paused'; throttle: number; dear?: boolean }
interface Frame {
  ts: number; start: number; script: number; gpu: number; drew: number[] | null
  laps: Map<string, number>; own: Map<string, number>; fns: Map<string, number> | null; long: [string, number][]
}
interface TraceEvent { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; id?: string; args?: any }
interface Phase {
  name: string; seconds: number; frames: Frame[]; gaps: number[]
  median: number; p95: number; p99: number; longest: number; over15: number[]; over25: number; over2: number
  task: number; tasks50: number
}

const wait = (n: number) => new Promise(r => setTimeout(r, n))
const q = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : NaN)
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '-')
function dist(xs: number[]): string {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  return `median ${f1(q(s, 0.5))}  95th ${f1(q(s, 0.95))}  99th ${f1(q(s, 0.99))}  longest ${f1(s[s.length - 1])} ms`
}

function browsersOnGpu(): number {
  try { return (execFileSync('nvidia-smi', [], { encoding: 'utf8' }).match(/chrome-headless-shell|firefox|webkit|MiniBrowser|msedge/gi) ?? []).length } catch { return -1 }
}

const browser = await chromium.launch({ args: GPU })
const errors: string[] = []
const sides: Side[] = []
const stop = (s: Side, on: boolean) => s.page.evaluate(on => { (window as any).__paused = on }, on)
async function turn(s: Side): Promise<void> {
  for (const o of sides) if (o !== s) await stop(o, true)
  await stop(s, false)
}

async function open(name: string, url: string): Promise<Side> {
  for (const o of sides) await stop(o, true)
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`))
  await page.addInitScript({ content: INSTRUMENT })
  await page.goto(url)
  await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0, null, { timeout: 180000 })
  await bigFarm(page)
  // The game's sound starts at the first key or click (a stall of a sixth of a second on this machine, at the
  // opening in a player's hands): it is started here, before anything is timed.
  await page.keyboard.press('Shift')
  await page.waitForTimeout(1200)
  const cdp = await page.context().newCDPSession(page)
  const s = { name, page, cdp, laps: await page.evaluate(() => typeof (window as any).__countyField.laps === 'function') }
  sides.push(s)
  return s
}

// The page's thread in the browser's trace, the page's clock against the trace's, and for each frame what the
// browser itself did in it and which functions the page's thread was in.
function readTrace(buf: Buffer, frames: Frame[], syncAt: number, late: Set<number>): { tasks: [number, number][]; fns: Map<string, number>; found: boolean } {
  const parsed = JSON.parse(buf.toString('utf8')) as { traceEvents: TraceEvent[] } | TraceEvent[]
  const events = Array.isArray(parsed) ? parsed : parsed.traceEvents
  const sync = events.find(e => e.name === 'hitch:sync')
  const out = { tasks: [] as [number, number][], fns: new Map<string, number>(), found: !!sync }
  if (!sync || !frames.length) return out
  const offset = sync.ts / 1000 - syncAt
  const at = (ts: number) => ts / 1000 - offset
  // the frame a moment on the page's clock falls in (from its callback's start to the next one's)
  const starts = frames.map(f => f.start)
  const frameAt = (t: number): number => {
    if (t < starts[0]) return -1
    let lo = 0, hi = starts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= t) lo = mid; else hi = mid - 1 }
    return lo
  }
  const nodes = new Map<string, Map<number, { label: string; parent: number }>>()
  const clocks = new Map<string, number>()
  for (const e of events) {
    if (e.name === 'Profile' && e.pid === sync.pid) { clocks.set(e.id ?? '', e.args?.data?.startTime ?? e.ts); continue }
    if (e.name === 'ProfileChunk' && e.pid === sync.pid) {
      const id = e.id ?? '', data = e.args?.data
      if (!nodes.has(id)) nodes.set(id, new Map())
      const mine = nodes.get(id)!
      for (const n of data?.cpuProfile?.nodes ?? []) {
        const c = n.callFrame ?? {}
        const file = String(c.url ?? '').split('/').pop()?.split('?')[0] ?? ''
        mine.set(n.id, { label: `${c.functionName || '(anonymous)'}${file ? ` ${file}:${(c.lineNumber ?? 0) + 1}` : ''}`, parent: n.parent ?? 0 })
      }
      const samples: number[] = data?.cpuProfile?.samples ?? [], deltas: number[] = data?.timeDeltas ?? []
      let t = clocks.get(id) ?? e.ts
      for (let k = 0; k < samples.length; k++) {
        t += deltas[k] ?? 0
        const k0 = frameAt(at(t))
        if (k0 < 0) continue
        const ms = (deltas[k] ?? 0) / 1000
        const seen = new Set<string>()
        for (let n = mine.get(samples[k]); n; n = mine.get(n.parent)) {
          if (seen.has(n.label)) continue
          seen.add(n.label)
          out.fns.set(n.label, (out.fns.get(n.label) ?? 0) + ms)
          if (late.has(k0)) { const f = frames[k0]; f.fns ??= new Map(); f.fns.set(n.label, (f.fns.get(n.label) ?? 0) + ms) }
        }
      }
      clocks.set(id, t)
      continue
    }
    if (e.ph !== 'X' || !e.dur) continue
    const mainThread = e.pid === sync.pid && e.tid === sync.tid
    // whatever held the page's thread for long in a frame before a late one, by the browser's own name for it
    if (mainThread && e.dur >= 3000 && e.name !== 'RunTask' && e.name !== 'v8.callFunction' && e.name !== 'FunctionCall') { const k1 = frameAt(at(e.ts)); if (late.has(k1)) frames[k1].long.push([e.name, e.dur / 1000]) }
    if (e.name === 'RunTask' && mainThread) { out.tasks.push([at(e.ts), e.dur / 1000]); continue }
    const name = /GC/.test(e.name) && mainThread ? (e.name === 'MinorGC' || e.name === 'MajorGC' ? e.name : '') : e.name
    if (!name || !WATCHED.includes(name) || (name !== 'GPUTask' && !mainThread)) continue
    const k0 = frameAt(at(e.ts))
    if (k0 >= 0) frames[k0].own.set(name, (frames[k0].own.get(name) ?? 0) + e.dur / 1000)
  }
  return out
}

function phaseOf(name: string, frames: Frame[], from: number, to: number, tasks: [number, number][]): Phase {
  const mine = frames.filter(f => f.start >= from && f.start < to)
  const gaps = mine.slice(1).map((f, k) => f.ts - mine[k].ts)
  const s = gaps.slice().sort((a, b) => a - b)
  const median = q(s, 0.5)
  const within = tasks.filter(([t]) => t >= from && t < to).map(t => t[1])
  return {
    name, seconds: (to - from) / 1000, frames: mine, gaps, median, p95: q(s, 0.95), p99: q(s, 0.99), longest: s[s.length - 1] ?? NaN,
    over15: gaps.filter(g => g > median * 1.5), over25: gaps.filter(g => g > 25).length, over2: gaps.filter(g => g > median * 2 + 0.5).length,
    task: Math.max(0, ...within), tasks50: within.filter(d => d > 50).length,
  }
}

const SHADOWS = ['fine', 'mid', 'wide']
function report(s: Side, p: Phase, traced: boolean, fns: Map<string, number>, all: number): void {
  const fr = p.frames
  console.log(`    ${p.name}, ${p.seconds.toFixed(1)} s, ${fr.length} frames`)
  if (fr.length < 3) return
  console.log(`      frame to frame    ${dist(p.gaps)};  over 1.5x the median: ${p.over15.length}${p.over15.length ? ` (${p.over15.slice().sort((a, b) => b - a).slice(0, 12).map(g => g.toFixed(0)).join(', ')})` : ''};  over twice: ${p.over2};  over 25 ms: ${p.over25}`)
  console.log(`      the page's work   ${dist(fr.map(f => f.script))}`)
  console.log(`      the GPU's         ${dist(fr.map(f => f.gpu).filter(g => g >= 0))}`)
  if (traced) console.log(`      the longest task on the page's thread ${f1(p.task)} ms; tasks over 50 ms: ${p.tasks50}`)
  const d = fr.filter(f => f.drew).map(f => f.drew!)
  if (d.length > 1) {
    const widths = [...new Set(d.map(x => x[1]))], beats = [...new Set(d.map(x => x[2]))]
    const drawn = d.filter((x, k) => k > 0 && x[0] !== d[k - 1][0])
    const share = (bit: number) => `${(100 * drawn.filter(x => x[4] & (1 << bit)).length / Math.max(1, drawn.length)).toFixed(0)}%`
    console.log(`      the picture's width: ${widths.join(' -> ')};  beats to a frame: ${beats.join(' -> ')};  frames drawn ${drawn.length} of ${d.length - 1} beats;  shaders ${d[0][3]} -> ${d[d.length - 1][3]};  grass squares laid ${d[d.length - 1][5] - d[0][5]};  tree patches changed ${d[d.length - 1][6] - d[0][6]};  geometries ${d[0][7]} -> ${d[d.length - 1][7]}`)
    console.log(`      shadow maps drawn again: ${SHADOWS.map((n, k) => `${n} in ${share(k)}`).join(', ')} of frames`)
    // what a frame costs by the shadow maps drawn again in it (the frames of a move are not all alike)
    const by = new Map<string, { n: number; page: number; gpu: number; timed: number }>()
    for (const f of fr) {
      if (!f.drew) continue
      const key = SHADOWS.filter((_, b) => f.drew![4] & (1 << b)).join('+') || 'none'
      const r = by.get(key) ?? { n: 0, page: 0, gpu: 0, timed: 0 }
      r.n++; r.page += f.script
      if (f.gpu >= 0) { r.gpu += f.gpu; r.timed++ }
      by.set(key, r)
    }
    console.log(`      a frame by the shadow maps drawn again in it (the page's work / the GPU's, mean ms): ${[...by].sort((a, b) => b[1].n - a[1].n).map(([k, r]) => `${k} ${f1(r.page / r.n)} / ${f1(r.gpu / Math.max(1, r.timed))} (${r.n})`).join(';  ')}`)
  }
  // the worst second: the one whose frames are furthest over the median in all
  let worst = 0, worstAt = 0
  for (let a = 1, b = 1, sum = 0; b < fr.length; b++) {
    sum += Math.max(0, p.gaps[b - 1] - p.median)
    while (fr[b].ts - fr[a].ts > 1000) { sum -= Math.max(0, p.gaps[a - 1] - p.median); a++ }
    if (sum > worst) { worst = sum; worstAt = a }
  }
  const strip: string[] = []
  for (let k = worstAt; k < fr.length && fr[k].ts - fr[worstAt].ts <= 1000; k++) strip.push(p.gaps[k - 1].toFixed(0))
  console.log(`      the worst second (${((fr[worstAt].start - fr[0].start) / 1000).toFixed(1)} s in): ${strip.join(' ')}`)
  // What the frame before each late one held, against the ordinary frame.
  const lateAt = p.gaps.map((g, k) => (g > p.median * 1.5 ? k : -1)).filter(k => k >= 0)
  if (!lateAt.length) return
  const before = lateAt.map(k => fr[k])
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  const med = (xs: number[]) => q(xs.slice().sort((a, b) => a - b), 0.5)
  console.log(`      the ${before.length} frames before a late one (mean), against every frame (median):`)
  console.log(`        the page's work ${f1(mean(before.map(f => f.script)))} (${f1(med(fr.map(f => f.script)))})   the GPU's ${f1(mean(before.map(f => f.gpu).filter(g => g >= 0)))} (${f1(med(fr.map(f => f.gpu).filter(g => g >= 0)))})`)
  const names = (pick: (f: Frame) => Map<string, number>) => [...new Set(fr.flatMap(f => [...pick(f).keys()]))]
  const table = (pick: (f: Frame) => Map<string, number>) => names(pick)
    .map(n => [n, mean(before.map(f => pick(f).get(n) ?? 0)), mean(fr.map(f => pick(f).get(n) ?? 0))] as [string, number, number])
    .filter(r => r[1] >= 0.05 || r[2] >= 0.05).sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]))
  if (s.laps) console.log(`        its parts, ms (mean of every frame in brackets): ${table(f => f.laps).map(r => `${r[0]} ${f2(r[1])} (${f2(r[2])})`).join(', ')}`)
  if (traced) console.log(`        the browser's own, ms: ${table(f => f.own).map(r => `${r[0]} ${f2(r[1])} (${f2(r[2])})`).join(', ') || 'nothing'}`)
  if (before.some(f => f.drew)) {
    const withMap = (bit: number) => before.filter(f => f.drew && f.drew[4] & (1 << bit)).length
    const k0 = (f: Frame) => fr.indexOf(f)
    const grew = (col: number) => before.filter(f => { const k = k0(f); return k > 0 && f.drew && fr[k - 1].drew && f.drew[col] !== fr[k - 1].drew![col] }).length
    console.log(`        of them: ${SHADOWS.map((n, k) => `${withMap(k)} drew the ${n} shadow map again`).join(', ')}; ${grew(3)} made a shader, ${grew(5)} laid grass, ${grew(6)} changed a patch of trees, ${grew(1)} changed the picture's size, ${grew(2)} the beats to a frame`)
  }
  if (traced && before.some(f => f.fns)) {
    const sum = new Map<string, number>()
    for (const f of before) for (const [n, ms] of f.fns ?? []) sum.set(n, (sum.get(n) ?? 0) + ms)
    const rows = [...sum].map(([n, ms]) => [n, ms / before.length, (fns.get(n) ?? 0) / Math.max(1, all)] as [string, number, number])
      .filter(r => !/^\((root|program|idle)\)/.test(r[0])).sort((a, b) => (b[1] - b[2]) - (a[1] - a[2])).slice(0, 14)
    console.log('        where the page\'s thread was, ms a frame, with all it called (every frame in brackets):')
    for (const r of rows) console.log(`          ${f2(r[1]).padStart(6)} (${f2(r[2])})  ${r[0]}`)
  }
  const latest = lateAt.slice().sort((a, b) => p.gaps[b] - p.gaps[a]).slice(0, 6)
  for (const k of latest) {
    const f = fr[k]
    const parts = [...f.laps].filter(x => x[1] >= 0.4).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => `${x[0]} ${f1(x[1])}`).join(', ')
    const own = [...f.own].filter(x => x[1] >= 0.3).sort((a, b) => b[1] - a[1]).map(x => `${x[0]} ${f1(x[1])}`).join(', ')
    console.log(`        ${f1(p.gaps[k])} ms at ${((f.start - fr[0].start) / 1000).toFixed(2)} s: the page ${f1(f.script)} ms, the GPU ${f1(f.gpu)}${parts ? `; ${parts}` : ''}${own ? `; browser: ${own}` : ''}${f.long.length ? `; held by: ${f.long.sort((a, b) => b[1] - a[1]).slice(0, 7).map(x => `${x[0]} ${f1(x[1])}`).join(', ')}` : ''}${f.drew ? `; shadow maps ${SHADOWS.filter((_, b) => f.drew![4] & (1 << b)).join('+') || 'none'}` : ''}`)
  }
}

interface Line { side: string; variant: string; phase: Phase }
const lines: Line[] = []

async function run(s: Side, v: Variant): Promise<void> {
  const page = s.page
  await turn(s)
  await s.cdp.send('Emulation.setCPUThrottlingRate', { rate: v.throttle })
  // The field tier, the day half gone and people at their work; somebody on the screen is what the wheel zooms to.
  const aim = await page.evaluate(async speed => {
    const w = window as any, f = w.__countyField, { app } = w.__county
    app.setSpeed(0)
    f.tier('field')
    f.seek(0.5, 0.003)
    await new Promise(r => setTimeout(r, 1200))
    const ins = app.insets
    let at: { x: number; y: number } | null = null
    for (const u of app.campaign.crew) {
      const p = f.unitAt(u.id)
      if (p && p.x > ins.left + 80 && p.x < innerWidth - ins.right - 80 && p.y > ins.top + 80 && p.y < innerHeight - ins.bottom - 80) { at = p; break }
    }
    if (speed) app.setSpeed(1)
    return at
  }, v.clock === '1x')
  await page.mouse.move(aim?.x ?? W * 0.5, aim?.y ?? H * 0.45)
  if (v.dear) await page.evaluate(() => { const f = (window as any).__countyField; f.adapt(true, 'high'); f.force({ pixels: 1.87e7, scale: 3, ratio: 3 }) })
  await page.waitForTimeout(1500)
  type Made = { id: number; kind: string; by: string[] }[]
  const shaders = (): Promise<Made> => page.evaluate(() => (window as any).__countyField.shaders?.() ?? [])
  const had = new Set((await shaders()).map(p => p.id))
  if (tracing) await browser.startTracing(page, { categories: CATEGORIES })
  const syncAt = await page.evaluate(() => {
    const w = window as any
    performance.clearMeasures()
    performance.clearMarks('hitch:sync')
    w.__countyField.laps?.(true)
    w.__hitch.rows = []
    w.__hitch.on = true
    return performance.mark('hitch:sync').startTime
  })
  const now = () => page.evaluate(() => performance.now())
  // the picture's size and the beats to a frame, asked four times a second (any build answers)
  const asked: [number, string][] = []
  let asking = true
  const asker = (async () => {
    while (asking) {
      asked.push(await page.evaluate(() => { const p = (window as any).__countyField.pace?.(); return [performance.now(), p ? `${p.tier} ${p.size} every ${p.every}` : '?'] as [number, string] }))
      await wait(250)
    }
  })()
  const camera = () => page.evaluate(() => { const r = (window as any).__countyField.rig; return [r.cur.dist, r.goal.dist] as [number, number] })
  await page.waitForTimeout(500)
  const zoomFrom = await now()
  const far = (await camera())[0]
  for (let k = 0, was = Infinity; k < 60; k++) {
    await page.mouse.wheel(0, -120)
    await wait(90)
    if (k % 3 !== 2) continue
    const goal = (await camera())[1]
    if (goal >= was - 1e-3) break
    was = goal
  }
  for (let k = 0; k < 30; k++) { const [cur, goal] = await camera(); if (cur < goal * 1.02) break; await wait(100) }
  const near = (await camera())[0]
  const moveFrom = await now()
  const hold = async (key: string, ms: number) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key) }
  const u = MOVE_S / 20
  await hold('ArrowRight', 2500 * u); await hold('ArrowUp', 2500 * u); await hold('e', 2500 * u); await hold('PageDown', 1200 * u)
  await hold('ArrowLeft', 2500 * u); await hold('q', 2500 * u); await hold('PageUp', 1200 * u); await hold('ArrowDown', 2500 * u)
  // and by hand: the land dragged under the pointer
  const cx = W * 0.5, cy = H * 0.5
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let k = 1; k <= Math.round(50 * u); k++) { await page.mouse.move(cx + k * 5, cy + k * 2); await wait(50) }
  await page.mouse.up()
  const end = await now()
  if (v.dear) await wait(6000)
  const rested = await now()
  asking = false
  await asker
  const got = await page.evaluate(() => {
    const w = window as any
    w.__hitch.on = false
    w.__countyField.laps?.(false)
    const laps = performance.getEntriesByType('measure').filter(m => m.name.startsWith('county:')).map(m => [m.name.slice(7), m.startTime, m.duration] as [string, number, number])
    performance.clearMeasures()
    return { rows: w.__hitch.rows as number[][], lost: w.__hitch.lost as number, laps, pace: w.__countyField.pace?.() ?? null, tier: w.__countyField.stats().tier as string, drawn: w.__countyField.stats().drawn as number[] }
  })
  const trace = tracing ? await browser.stopTracing() : null
  if (v.dear) await page.evaluate(() => { const f = (window as any).__countyField; f.force({}); f.adapt(false, 'high') })
  const made = (await shaders()).filter(p => !had.has(p.id))
  await s.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  // one frame for each beat of the display the page was called on (a page may ask for more than one callback a beat)
  const frames: Frame[] = []
  for (const r of got.rows) {
    const last = frames[frames.length - 1]
    if (last && last.ts === r[0]) { last.script += r[2]; if (r[3] >= 0) last.gpu = Math.max(last.gpu, r[3]); if (r.length > 4) last.drew = r.slice(4); continue }
    frames.push({ ts: r[0], start: r[1], script: r[2], gpu: r[3], drew: r.length > 4 ? r.slice(4) : null, laps: new Map(), own: new Map(), fns: null, long: [] })
  }
  for (let k = 0, at = 0; k < got.laps.length; k++) {
    const [name, t, ms] = got.laps[k]
    while (at + 1 < frames.length && frames[at + 1].start <= t) at++
    if (frames[at] && frames[at].start <= t) frames[at].laps.set(name, (frames[at].laps.get(name) ?? 0) + ms)
  }
  const pre = [phaseOf('zooming in', frames, zoomFrom, moveFrom, []), phaseOf('moving at the closest', frames, moveFrom, end, [])]
  const late = new Set<number>()
  for (const p of pre) p.gaps.forEach((g, k) => { if (g > p.median * 1.5) late.add(frames.indexOf(p.frames[k])) })
  const read = trace ? readTrace(trace, frames, syncAt, late) : { tasks: [], fns: new Map<string, number>(), found: false }
  const variant = `${v.clock}${v.throttle > 1 ? `, the page's thread ${v.throttle}x slower` : ''}${v.dear ? ', the picture made too dear' : ''}`
  console.log(`  ${s.name}: clock ${variant}; ${got.tier} setting, picture ${got.drawn.join('x')}; camera from ${far.toFixed(0)} m to ${near.toFixed(1)} m${aim ? ', on somebody at work' : ''}${got.lost ? `; ${got.lost} GPU timings lost` : ''}${trace && !read.found ? '; the trace could not be set against the page\'s clock' : ''}`)
  if (made.length) console.log(`    shaders made in it: ${made.map(p => `${p.kind} for ${p.by.length ? p.by.slice(0, 3).join(' / ') + (p.by.length > 3 ? ` and ${p.by.length - 3} more` : '') : 'nothing of the scene\'s own (a shadow pass, or a material let go since)'}`).join('; ')}`)
  if (trace && keep) writeFileSync(`${keep}/${s.name.replace(/\W+/g, '-')}-${v.clock}-${v.throttle}x-${W}x${H}@${DPR}.json`, trace)
  // the runs of answers alike, and how long each lasted
  const course = (from: number, to: number) => {
    const runs: [string, number, number][] = []
    for (const [t, say] of asked) {
      if (t < from || t >= to) continue
      const last = runs[runs.length - 1]
      if (last && last[0] === say) last[2] = t; else runs.push([say, t, t])
    }
    return runs.map(r => `${r[0]} (${((r[2] - r[1]) / 1000).toFixed(1)} s)`).join(' -> ') || '-'
  }
  console.log(`    the setting, the picture's size as a share of it and the beats to a frame: zooming in: ${course(zoomFrom, moveFrom)};  moving: ${course(moveFrom, end)}${v.dear ? `;  stopped: ${course(end, rested)}` : ''}`)
  if (v.dear) return
  for (const p of [phaseOf('zooming in', frames, zoomFrom, moveFrom, read.tasks), phaseOf('moving at the closest', frames, moveFrom, end, read.tasks)]) {
    report(s, p, read.found, read.fns, frames.length)
    lines.push({ side: s.name, variant, phase: p })
  }
}

console.log(`${W}x${H} at pixel ratio ${DPR}; other browsers on the GPU at the start: ${browsersOnGpu()}`)
if (against) await open('the other', against)
await open(against ? 'this build' : 'the game', base)
const gpuName = await sides[0].page.evaluate(() => {
  const gl = (document.getElementById('field') as HTMLCanvasElement).getContext('webgl2')!
  const e = gl.getExtension('WEBGL_debug_renderer_info')
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'
})
console.log(gpuName)
const variants: Variant[] = []
for (const rate of throttle > 1 ? [1, throttle] : [1]) for (const clock of ['1x', 'paused'] as const) if (!only || only.includes(clock)) variants.push({ clock, throttle: rate })
if (flag('dear')) variants.push({ clock: 'paused', throttle: 1, dear: true })
for (const v of variants) for (const s of sides) await run(s, v)

console.log(`in all (${W}x${H} at ${DPR}; frame to frame, ms):`)
for (const l of lines) {
  const p = l.phase
  console.log(`  ${l.side.padEnd(10)} ${l.variant.padEnd(38)} ${p.name.padEnd(22)} median ${f1(p.median).padStart(5)}  99th ${f1(p.p99).padStart(5)} (${f2(p.p99 / p.median)}x)  longest ${f1(p.longest).padStart(6)} (${f2(p.longest / p.median)}x)  late ${String(p.over15.length).padStart(3)} of ${p.gaps.length}  longest task ${f1(p.task)}`)
}
console.log(`other browsers on the GPU at the end: ${browsersOnGpu()}`)
console.log(errors.length ? `page errors: ${[...new Set(errors)].join(' | ')}` : 'no page errors')
await browser.close()
