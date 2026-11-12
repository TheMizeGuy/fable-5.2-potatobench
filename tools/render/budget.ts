// What each view costs at each quality setting: GPU time per frame (the renderer's own timer, pass by pass:
// src/render/probe.ts), the triangles and draw calls of a frame as the mean over many (the shadow maps are redrawn on
// different frames, so one frame's count says little) and the size of the picture drawn, for the opening and for the
// camera's four tiers (yard, field, farm, county) with ten fields in crop and people at work.
//   --against=<url>  another build of the game (the one that is live, say) is opened beside this one and the two are
//            measured turn about, a second or so each, in the one run; the one not being measured draws nothing.
//            Other work on the GPU then falls on both alike. A build without the renderer's timer is timed frame by
//            frame from outside it.
//   --free   the browser draws as fast as it can, not on the display's beat, and the time from one frame to the next
//            is given too: that is what a frame costs the whole of the machine (the page's own work, the browser's
//            and the GPU's), where the GPU's timer alone can be thrown by whatever else waits on the display's beat.
//            It keeps the GPU busy for as long as it runs: other work on the machine goes slower meanwhile.
//   --parts  at the high setting, each view pass by pass and part by part (each shadow map, the land, the trees, the
//            crop, each lens pass), and one thing changed at a time against the whole (half the pixels, no
//            multisampling, no shadow map redrawn; with --hide, each part hidden), the two taken turn about.
//   --idle   frames drawn and GPU time spent in a second: the opening left alone, the game paused with the camera
//            still, the game paused while the camera turns, and the game running.
//   --land   what the land's own parts cost in four views at each setting.
//   --adapt  the game left to choose for itself, as in a player's browser: the setting it starts on from its first
//            frames timed, then the picture made nine times too dear to draw and what it does about it, then made
//            cheap again and how long it takes to come back.
// Usage: node tools/render/budget.ts <base-url> [--against=<url>] [--free] [--parts [--hide]] [--idle] [--land] [--adapt]
//          [--size=1920x1080] [--dpr=1] [--only=field,county] [--rounds=5]
import { execFileSync } from 'node:child_process'
import { chromium, type Page } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const base = process.argv[2] ?? 'http://localhost:5317/'
const flag = (name: string) => process.argv.includes(`--${name}`)
const opt = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const [W, H] = (opt('size') ?? '1920x1080').split('x').map(Number)
const DPR = Number(opt('dpr') ?? 1)
const only = opt('only')?.split(',')
const free = flag('free')
const against = opt('against')
// How many times each measurement is taken (the quietest is kept): more when the GPU is shared.
const ROUNDS = Number(opt('rounds') ?? 5)

// Before a page runs: a switch that stops its drawing (the renderer draws nothing while the document is hidden), and
// a timer round each animation frame for a build that has none of its own.
const INSTRUMENT = `(() => {
  const M = window.__perf = { gpu: [], on: false, begun: 0, lost: 0, error: 0 }
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__paused === true })
  const raf = window.requestAnimationFrame.bind(window)
  let pend = [], ext = null, gl = null
  window.requestAnimationFrame = cb => raf(ts => {
    if (!M.on) return cb(ts)
    if (!gl) { const c = document.getElementById('field'); gl = c && c.getContext('webgl2'); if (gl) ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') }
    let q = null
    if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); M.begun++; const e = gl.getError(); if (e) M.error = e }
    try { cb(ts) } finally {
      if (q) {
        gl.endQuery(ext.TIME_ELAPSED_EXT)
        pend.push(q)
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
        pend = pend.filter(p => {
          if (!gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)) return true
          if (!disjoint) M.gpu.push(gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6); else M.lost++
          gl.deleteQuery(p)
          return false
        })
      }
    }
  })
})()`

interface Row { name: string; gpu: number; cpu: number; tris: number; calls: number; share: number }
interface M {
  gpu: number; cpu: number; triangles: number; calls: number; tier: string; rows: Row[]
  drawn: [number, number]; samples: number; canvas: [number, number]; fps: number; perSec: number; gap: number
  spent: { crews: number; update: number; draw: number }; objects: number
}
// A build of the game open in a page. probe: it has the renderer's own timer.
interface Side { name: string; page: Page; probe: boolean }

const ms = (x: number, w = 6) => x.toFixed(2).padStart(w)
const mega = (x: number) => (x / 1e6).toFixed(2).padStart(5)
const wait = (n: number) => new Promise(r => setTimeout(r, n))

// One stretch of frames. `gpu`: the mean of the GPU's time for a frame (the frames differ: a frame that redraws a wide
// shadow map costs more than its neighbours). `gap`: the time from one frame drawn to the next.
// how: 'whole', each frame timed as one from outside the renderer, the same way for every build; 'passes' or 'parts',
// by the renderer's own timer (a build that has one), which breaks the frame up and so reads a little higher.
async function window1(s: Side, seconds = 1.5, how: 'whole' | 'passes' | 'parts' = 'whole'): Promise<M> {
  const probe = s.probe && how !== 'whole'
  await s.page.waitForTimeout(300)
  await s.page.evaluate(([probe, byPart, has]) => {
    const w = window as any, f = w.__countyField
    if (probe) { f.probe(true, byPart); f.cost() } else { if (has) f.probe(false); w.__perf.gpu = []; w.__perf.on = true }
    f.mean()
    w.__t0 = performance.now()
  }, [probe, how === 'parts', s.probe])
  await s.page.waitForTimeout(seconds * 1000)
  const r = await s.page.evaluate(probe => {
    const w = window as any, f = w.__countyField, st = f.stats(), mean = f.mean(), secs = (performance.now() - w.__t0) / 1000
    let rows: Row[] = [], sum = 0, n = 0
    if (probe) { const c = f.cost(); rows = c.rows; sum = c.sum; n = c.frames; f.probe(false) } else { w.__perf.on = false; n = w.__perf.gpu.length; for (const g of w.__perf.gpu) sum += g }
    const timer = probe || n ? '' : `no frame was timed from outside: ${w.__perf.begun} begun, ${w.__perf.lost} lost to a break in the GPU's clock, error ${w.__perf.error}`
    return { timer, rows, sum, n, mean, secs, tier: st.tier, spent: st.spent, objects: st.objects, drawn: st.drawn, samples: st.samples ?? -1, canvas: [st.width, st.height] }
  }, probe)
  if (r.timer) console.log(`    (${s.name}: ${r.timer})`)
  // Timed from outside, every beat of the display is timed, whether or not a frame was drawn on it: the time is shared among the frames drawn.
  const frames = probe ? r.n : r.mean.frames, gpu = frames ? r.sum / frames : NaN, fps = r.mean.frames / r.secs
  return {
    gpu, cpu: r.rows.length ? r.rows.reduce((a, x) => a + x.cpu * x.share, 0) : r.spent.draw, triangles: r.mean.triangles, calls: Math.round(r.mean.calls), tier: r.tier, rows: r.rows,
    drawn: r.drawn, samples: r.samples, canvas: r.canvas as [number, number], fps, perSec: frames ? gpu * fps : 0, gap: 1000 / Math.max(fps, 1e-3), spent: r.spent, objects: r.objects,
  }
}

// The better of two measurements: other work on the machine only ever adds time.
const of = (m: M) => (free ? m.gap : m.gpu)
const least = (a: M | null, b: M) => (!a || of(b) < of(a) ? b : a)

const stop = (s: Side, on: boolean) => s.page.evaluate(on => { (window as any).__paused = on }, on)

// Only one side draws at a time: the others are stopped while `s` has its turn.
async function turn(sides: Side[], s: Side): Promise<void> {
  for (const o of sides) if (o !== s) await stop(o, true)
  await stop(s, false)
}

// Each side measured in turn, `rounds` times over; the quietest of each kept.
async function measure(sides: Side[], rounds = ROUNDS, seconds = 0.8): Promise<M[]> {
  const best: (M | null)[] = sides.map(() => null)
  for (let k = 0; k < rounds; k++) {
    for (let i = 0; i < sides.length; i++) {
      await turn(sides, sides[i])
      // a page that has just begun to draw again draws its first frames whole (every shadow map at once)
      if (sides.length > 1) await sides[i].page.waitForTimeout(400)
      best[i] = least(best[i], await window1(sides[i], seconds))
    }
  }
  return best as M[]
}

const line = (label: string, m: M) =>
  console.log(`  ${label.padEnd(42)} ${m.tier.padEnd(6)} GPU ${ms(m.gpu)} ms${free ? `  frame to frame ${ms(m.gap)} ms` : ''}  drawing on the CPU ${ms(m.cpu, 5)} ms  ${mega(m.triangles)}M triangles  ${String(m.calls).padStart(4)} calls`
    + `  picture ${m.drawn[0]}x${m.drawn[1]}${m.samples > 0 ? ` x${m.samples}` : ''} = ${(m.drawn[0] * m.drawn[1] / 1e6).toFixed(2)}M pixels, canvas ${m.canvas[0]}x${m.canvas[1]}  (${m.fps.toFixed(0)} frames a second; crews ${m.spent.crews} ms, updates ${m.spent.update} ms, ${m.objects} objects)`)

// A measurement pass by pass, and inside each pass part by part: what each costs a frame on average (its cost when it
// is drawn, times the share of frames it is drawn in).
const ORDER = ['skymap', 'shadow0', 'shadow1', 'shadow2', 'shadow', 'scene']
function breakdown(m: M): void {
  const passes = new Map<string, Row[]>()
  for (const r of m.rows) {
    const p = r.name.split('/')[0]
    if (!passes.has(p)) passes.set(p, [])
    passes.get(p)!.push(r)
  }
  const rank = (p: string) => { const k = ORDER.indexOf(p); return k < 0 ? ORDER.length : k }
  const names = [...passes.keys()].sort((a, b) => rank(a) - rank(b))
  let whole = 0
  for (const p of names) {
    const rows = passes.get(p)!
    const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r) * r.share, 0)
    const share = Math.max(...rows.map(r => r.share))
    whole += sum(r => r.gpu)
    console.log(`      ${p.padEnd(22)} ${ms(sum(r => r.gpu))} ms  cpu ${ms(sum(r => r.cpu), 5)}  ${mega(sum(r => r.tris))}M  ${String(Math.round(sum(r => r.calls))).padStart(4)} calls${share < 0.97 ? `   (drawn in ${(share * 100).toFixed(0)}% of frames)` : ''}`)
    const inside = rows.filter(r => r.name.includes('/')).sort((a, b) => b.gpu * b.share - a.gpu * a.share)
    for (const r of inside) {
      if (r.gpu * r.share < 0.02 && r.tris * r.share < 2000) continue
      console.log(`        ${r.name.split('/')[1].padEnd(20)} ${ms(r.gpu * r.share)} ms  cpu ${ms(r.cpu * r.share, 5)}  ${mega(r.tris * r.share)}M  ${String(Math.round(r.calls * r.share)).padStart(4)} calls`)
    }
  }
  console.log(`      (each at its middle cost: ${ms(whole)} ms in all)`)
}

// Ten fields in crop: the home six (two of them in their rest year) and six more taken on, with a second tractor and two hands.
async function bigFarm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { app, sim } = (window as any).__county
    app.newGame(1977, 5)
    const c = app.campaign
    c.cash = Math.max(c.cash, 400000)
    const kinds = ['katahdin', 'superior', 'kennebec', 'norland', 'atlantic']
    for (const f of [6, 7, 10, 11, 12, 13]) {
      app.do({ t: 'rent', field: f })
      app.do({ t: 'plan', field: f, plan: { crop: 'potato', variety: kinds[f % kinds.length], seed: 'certified' } })
    }
    app.do({ t: 'buy', upgrade: 'tractor2' }); app.do({ t: 'hire', kind: 'operator' })
    app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'hire', kind: 'hand' })
    app.do({ t: 'begin' })
    while (c.phase === 'season' && c.season.day < 196) {
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || a.act === 'sell') continue
        app.do({ t: 'job', kind: a.act, field: a.field })
      }
      if (!app.do({ t: 'day' }).ok) break
    }
    for (let n = 0; n < 30 && sim.today(app.world, c).sky !== 'clear'; n++) app.do({ t: 'day' })
    // A day's work for everyone, left part way through: people and machines out on the land.
    for (const a of sim.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
    app.do({ t: 'day' })
  })
  await page.evaluate(() => (window as any).__countyField.settle())
  await page.evaluate(() => (window as any).__countyField.seek(0.5, 0.003))
}

// Other browsers on the GPU (other checks running on the same machine) make every number here high: wait them out.
function browsersOnGpu(): number {
  try {
    const all = execFileSync('nvidia-smi', [], { encoding: 'utf8' })
    return (all.match(/chrome-headless-shell|firefox|webkit|MiniBrowser|msedge/gi) ?? []).length
  } catch { return 0 }
}
let mine = 0
async function quiet(label: string, tries = 6): Promise<boolean> {
  for (let k = 0; k < tries; k++) {
    if (browsersOnGpu() <= mine) return true
    await wait(10000)
  }
  console.log(`  (the GPU was still shared at ${label}: these numbers are high)`)
  return false
}
await quiet('start', 12)
const browser = await chromium.launch({ args: free ? [...GPU, '--disable-gpu-vsync', '--disable-frame-rate-limit'] : GPU })
const errors: string[] = []
const sides: Side[] = []
async function open(name: string, url: string): Promise<Side> {
  for (const o of sides) await stop(o, true)
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`) })
  await page.addInitScript({ content: INSTRUMENT })
  await page.goto(url)
  try {
    await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0, null, { timeout: 120000 })
  } catch (err) {
    const state = await page.evaluate(() => { const f = (window as any).__countyField; return { hooks: typeof f, flat: f?.flat, stats: f?.stats?.(), title: document.title } }).catch(() => null)
    console.log(`  ${name} (${url}) drew no frame: ${JSON.stringify(state)}; page errors: ${errors.join(' | ') || 'none'}`)
    throw err
  }
  const loaded = await page.evaluate(() => {
    const f = (window as any).__countyField
    const probe = typeof f.probe === 'function', timed = probe ? f.probe(true) : true
    if (probe) f.probe(false)
    return { first: f.stats().firstFrame, built: f.stats().built as [string, number][], K: f.scale?.K, probe, timed }
  })
  console.log(`  ${name} (${url}): K ${loaded.K}, the first frame ${(loaded.first / 1000).toFixed(2)} s after the page was asked for; the scene built by (ms) ${(loaded.built ?? []).map(([n, t]) => `${n} ${t}`).join(', ')}`)
  if (!loaded.timed) console.log('  (this browser gives no GPU timer: every GPU time below is 0, and only the counts mean anything)')
  await page.evaluate(free => {
    const { app } = (window as any).__county
    for (const el of [...document.body.children]) if (el.id !== 'field' && el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT') (el as HTMLElement).style.display = 'none'
    const set = app.setInsets.bind(app)
    app.setInsets = () => set(56, 0, 150, 0)
    set(56, 0, 150, 0)
    if (free) (window as any).__countyField.uncap?.(true)
  }, free)
  const side = { name, page, probe: loaded.probe }
  sides.push(side)
  return side
}
if (against) await open('the other', against)
const now = await open(against ? 'this build' : 'the game', base)
mine = browsersOnGpu()
const page = now.page
const gpuName = await page.evaluate(() => {
  const gl = (document.getElementById('field') as HTMLCanvasElement).getContext('webgl2')!
  const e = gl.getExtension('WEBGL_debug_renderer_info')
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'
})
console.log(`${W}x${H} at pixel ratio ${DPR}  ${gpuName}${free ? '  (drawing as fast as it can)' : ''}`)
const field = <T>(code: string, p = page): Promise<T> => p.evaluate(`(() => { const f = window.__countyField; return ${code} })()`) as Promise<T>
const each = async (fn: (p: Page) => Promise<unknown>) => { for (const s of sides) { await turn(sides, s); await fn(s.page) } }
const settle = (p: Page) => field('f.settle()', p)
const tier = (t: string) => each(p => p.evaluate(t => (window as any).__county.app.setSetting('quality', t), t))

const at = (name: string) => async (p: Page) => { await p.evaluate(name => (window as any).__countyField.tier(name), name); await p.waitForTimeout(500) }
const views: [string, string, (p: Page) => Promise<void>][] = [
  ['far', 'opening, from far off', async p => { await p.evaluate(() => { (window as any).__county.app.quitToTitle(); (window as any).__countyField.titleAt(0) }); await settle(p) }],
  ['road', 'opening, by the road', async p => { await field('f.titleAt(1)', p); await settle(p) }],
  ['yard', 'yard tier', async p => { await field('f.titleAt(-1)', p); await bigFarm(p); await at('yard')(p) }],
  ['field', 'field tier (the playing view)', at('field')],
  ['farm', 'farm tier', at('farm')],
  ['county', 'county tier', at('county')],
]

// One thing changed at a time against the whole picture, at the high setting. The whole and the change are measured
// turn about, three times each, and the quietest of each kept.
async function oneAtATime(): Promise<void> {
  const first = await window1(now, 1)
  const pixels = first.drawn[0] * first.drawn[1]
  const names: string[] = flag('hide') ? await field('f.parts()') : []
  const trials: [string, string, string][] = [
    ['half the pixels', `f.force({ pixels: ${pixels / 2} })`, 'f.force({})'],
    ['no multisampling', 'f.force({ msaa: 0 })', 'f.force({})'],
    ['no lens passes but the last', 'f.force({ ao: false, focus: false, bloom: false, shafts: 0 })', 'f.force({})'],
    ['no shadow map redrawn', '[0, 1, 2].forEach(k => f.cascade(k, false))', '[0, 1, 2].forEach(k => f.cascade(k, true))'],
    ['the land and sky not drawn last', `f.tryWithout('order', true)`, `f.tryWithout('order', false)`],
    ['no cards in the fine shadow', `f.tryWithout('cards', true)`, `f.tryWithout('cards', false)`],
    ['the fine shadow redrawn always', `f.tryWithout('lazy', true)`, `f.tryWithout('lazy', false)`],
    ['contact shade at any distance', `f.tryWithout('contact', true)`, `f.tryWithout('contact', false)`],
    ...names.map(n => [`without ${n}`, `f.show('${n}', false)`, `f.show('${n}', true)`] as [string, string, string]),
  ]
  console.log('      one thing changed, against the whole measured beside it')
  for (const [label, set, back] of trials) {
    let whole: M | null = null, changed: M | null = null
    for (let k = 0; k < 3; k++) {
      whole = least(whole, await window1(now, 0.8))
      await field(set)
      await page.waitForTimeout(250)
      changed = least(changed, await window1(now, 0.8))
      await field(back)
      await page.waitForTimeout(250)
    }
    console.log(`        ${label.padEnd(36)} GPU ${ms(whole!.gpu)} -> ${ms(changed!.gpu)} ms${free ? `, frame to frame ${ms(whole!.gap)} -> ${ms(changed!.gap)} ms` : ''}, ${mega(whole!.triangles)}M -> ${mega(changed!.triangles)}M triangles, ${whole!.calls} -> ${changed!.calls} calls`)
  }
}

const table: Record<string, Record<string, M[]>> = {}
if (!flag('idle') && !flag('land') && !flag('adapt')) {
  for (const [key, label, set] of views) {
    for (const t of ['high', 'medium', 'low']) {
      await tier(t)
      await each(set)
      if (only && !only.includes(key)) continue
      await quiet(label, against ? 1 : 6)
      const got = await measure(sides)
      got.forEach((m, i) => line(`${label}${sides.length > 1 ? `, ${sides[i].name}` : ''}`, m))
      ;(table[label] ??= {})[t] = got
      if (browsersOnGpu() > mine) console.log('    (another browser started on the GPU during this measurement)')
      if (flag('parts') && t === 'high' && now.probe) {
        await turn(sides, now)
        breakdown(least(await window1(now, 1.5, 'parts'), await window1(now, 1.5, 'parts')))
        await oneAtATime()
      }
    }
  }
  console.log(`  the settings against each other (${free ? 'ms from one frame to the next, drawing as fast as it can' : 'GPU ms a frame'}; medium and low as a share of high; triangles and calls at each):`)
  sides.forEach((s, i) => {
    console.log(`   ${s.name}`)
    for (const [label, row] of Object.entries(table)) {
      const h = row.high[i], m = row.medium[i], l = row.low[i]
      console.log(`    ${label.padEnd(34)} high ${ms(of(h))}  medium ${ms(of(m))} (${(of(m) / of(h) * 100).toFixed(0)}%)  low ${ms(of(l))} (${(of(l) / of(h) * 100).toFixed(0)}%)   ${mega(h.triangles)}M ${h.calls} calls | ${mega(m.triangles)}M ${m.calls} | ${mega(l.triangles)}M ${l.calls}`)
    }
  })
}

// --idle: what a second costs when nothing is asked of the picture, and when something is.
if (flag('idle')) {
  await tier('high')
  const second = async (label: string) => {
    const got = await measure(sides, 2, 3)
    const paces: ({ every: number; halved: boolean } | null)[] = []
    for (const s of sides) paces.push(await field('f.pace ? f.pace() : null', s.page))
    got.forEach((m, i) => console.log(`  ${`${label}${sides.length > 1 ? `, ${sides[i].name}` : ''}`.padEnd(52)} ${m.fps.toFixed(1).padStart(5)} frames a second, ${m.perSec.toFixed(0).padStart(4)} ms of GPU time a second (${ms(m.gpu, 5)} ms a frame)${paces[i] ? `   one beat in ${paces[i]!.every * (paces[i]!.halved ? 2 : 1)} drawn` : ''}`))
  }
  await each(async p => { await p.evaluate(() => { (window as any).__county.app.quitToTitle(); (window as any).__countyField.titleAt(-1) }); await p.waitForTimeout(1500) })
  await second('the opening, playing')
  await each(async p => {
    await bigFarm(p)
    // the day's work played out to its end, and nobody's hand on anything
    await settle(p)
    await at('field')(p)
    await p.evaluate(() => (window as any).__county.app.setSpeed(0))
  })
  // Each side left alone in turn until it has come to rest (a stopped page's clock does not run).
  for (const s of sides) {
    await turn(sides, s)
    await s.page.waitForTimeout(9000)
    const m = least(await window1(s, 4), await window1(s, 4))
    console.log(`  ${`paused, the camera still${sides.length > 1 ? `, ${s.name}` : ''}`.padEnd(52)} ${m.fps.toFixed(1).padStart(5)} frames a second, ${m.perSec.toFixed(0).padStart(4)} ms of GPU time a second (${ms(m.gpu, 5)} ms a frame)   pace ${JSON.stringify(await field('f.pace ? f.pace() : null', s.page))}`)
    // The player's hand on the camera: every frame is drawn again while it turns, from the first.
    const before = await field<number>('f.stats().ambient', s.page)
    const turning = s.page.evaluate(async () => {
      const rig = (window as any).__countyField.rig, vp = { w: innerWidth, h: innerHeight, top: 56, right: 0, bottom: 150, left: 0 }
      const t0 = performance.now()
      while (performance.now() - t0 < 6000) { rig.turnBy(0.004, vp); await new Promise(r => requestAnimationFrame(r)) }
    })
    await s.page.waitForTimeout(700)
    const t = await window1(s, 3)
    const after = await field<number>('f.stats().ambient', s.page)
    console.log(`  ${`paused, the camera turning${sides.length > 1 ? `, ${s.name}` : ''}`.padEnd(52)} ${t.fps.toFixed(1).padStart(5)} frames a second, ${t.perSec.toFixed(0).padStart(4)} ms of GPU time a second (${ms(t.gpu, 5)} ms a frame); the wind and water's clock ran ${(after - before).toFixed(1)} s in those 4 s`)
    await turning
  }
  await each(async p => { await p.evaluate(() => (window as any).__county.app.setSpeed(1)); await p.waitForTimeout(1200) })
  await second('the game running')
  await each(p => p.evaluate(() => (window as any).__county.app.setSpeed(0)))
}

// --land: what the land's own parts cost (the frame with the part hidden, against the whole) in each tier of view and
// at each quality setting.
if (flag('land')) {
  const LAND_VIEWS: [string, Record<string, unknown>][] = [
    ['yard tier', { frame: 'field', field: 5, x: 0.72, z: 0.62, dist: 30, yaw: -0.95, pitch: 0.3 }],
    ['field tier', { frame: 'land', x: 8, z: -1, dist: 27, yaw: -0.44 }],
    ['farm tier', { frame: 'land', x: 9, z: 1, dist: 96 }],
    ['county tier', { frame: 'land', x: 22, z: 6, dist: 190 }],
  ]
  const MINE = ['terrain', 'flora', 'farwoods', 'grass', 'fields', 'clearing']
  await turn(sides, now)
  const steady = async () => least(await window1(now, 0.9), await window1(now, 0.9))
  await bigFarm(page)
  await settle(page)
  for (const t of ['high', 'medium', 'low']) {
    await tier(t)
    for (const [label, v] of LAND_VIEWS) {
      await page.evaluate(v => (window as any).__countyField.view(v), v)
      await page.waitForTimeout(700)
      const all = await steady()
      const cost: string[] = []
      for (const n of MINE) {
        await page.evaluate(n => (window as any).__countyField.show(n, false), n)
        const m = await steady()
        cost.push(`${n} ${(all.gpu - m.gpu).toFixed(1)} ms ${((all.triangles - m.triangles) / 1e6).toFixed(2)}M ${all.calls - m.calls}c`)
        await page.evaluate(n => (window as any).__countyField.show(n, true), n)
      }
      // and what the trees cost in the picture alone: the frame with no shadows drawn, with and without them
      await field('f.shadowsOn(false)')
      const bare = await steady()
      await field(`f.show('flora', false)`)
      const bareNo = await steady()
      await field(`(f.show('flora', true), f.shadowsOn(true))`)
      cost.push(`all shadows ${(all.gpu - bare.gpu).toFixed(1)} ms`, `trees with no shadows drawn ${(bare.gpu - bareNo.gpu).toFixed(1)} ms`)
      console.log(`  land ${t.padEnd(6)} ${label.padEnd(11)} whole frame GPU ${all.gpu.toFixed(2).padStart(6)} ms ${(all.triangles / 1e6).toFixed(2)}M ${all.calls}c | ${cost.join(' | ')}`)
    }
  }
}
// --adapt: the game's own following of what frames cost.
if (flag('adapt')) {
  await turn(sides, now)
  await field('f.probe(false)')
  const pace = async (label: string) => console.log(`  ${label.padEnd(44)} ${JSON.stringify(await field('f.pace()'))}  picture ${(await field<{ drawn: number[] }>('f.stats()')).drawn.join('x')}, remembered ${await page.evaluate(() => localStorage.getItem('the-county/gpu'))}`)
  await page.evaluate(() => (window as any).__county.app.setSetting('quality', 'auto'))
  await views[0][2](page)
  await field('f.titleAt(-1)')
  await pace('as a test driver has it')
  // forget what was remembered and time the first frames again
  await field('f.adapt(true, null)')
  await page.waitForTimeout(2500)
  await pace('timed on its first frames')
  // a picture of nine times the pixels (a test box with a strong card keeps its beat at four): every frame late
  await field('f.force({ pixels: 1.87e7, scale: 3, ratio: 3 })')
  for (let k = 1; k <= 16; k++) { await page.waitForTimeout(2500); await pace(`too dear for ${(k * 2.5).toFixed(0)} s`) }
  await field('f.force({})')
  for (let k = 1; k <= 32; k++) { await page.waitForTimeout(5000); await pace(`cheap again for ${k * 5} s`) }
  await field('f.adapt(false)')
}
for (const s of sides) if (s.probe) await field('f.probe(false)', s.page)
console.log(errors.length ? `  page errors: ${errors.join(' | ')}` : '  no page errors')
await browser.close()
