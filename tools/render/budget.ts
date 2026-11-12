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
//   --spring the first spring of a new farm with the days running at 1x and the interface on, as a player first has
//            it: the display's beats that reach the page in a second, the frames drawn, and the days that pass (0.7 a
//            second if the page keeps its beat), with tree cards in the fine shadow and without.
//   --close  the close views against the playing view, at the high setting: the field tier and the yard tier as the
//            game frames them, then over a field in full crop from the yard tier's distance and from the closest the
//            camera goes, each looking level across the crop (the most drawn over itself) and tipped straight down;
//            pass by pass and part by part for each build. With --lift the picture is drawn at the window's own size
//            (no limit on its pixels), so that --size=3840x2160 is four times a 1920 by 1080 picture's shading and
//            stands in for a graphics chip a quarter as quick. --shots=<dir> keeps a picture of each view.
//   --hold   the game left to follow frame time, as in a player's browser, in the playing view and then level across
//            a crop from the closest the camera goes: the setting and the picture's size it settles at in each, and
//            the frames it then draws in a second (with --lift and --size=3840x2160, on a picture four times too
//            dear). Not with --free: the display's beat is what it holds to.
//   --adapt  the game left to choose for itself, as in a player's browser: the setting it starts on from its first
//            frames timed, then the picture made nine times too dear to draw and what it does about it, then made
//            cheap again and how long it takes to come back.
// Usage: node tools/render/budget.ts <base-url> [--against=<url>] [--free] [--parts [--hide]] [--idle] [--land] [--adapt]
//          [--size=1920x1080] [--dpr=1] [--only=field,county] [--rounds=5]
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from '@playwright/test'
import { GPU } from '../quality/shared.ts'
import { bigFarm } from './farm.ts'

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
  const M = window.__perf = { gpu: [], on: false, begun: 0, lost: 0 }
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__paused === true })
  const raf = window.requestAnimationFrame.bind(window)
  let pend = [], ext = null, gl = null
  // (a page that is stopped is given its turns a few times a second: left to run free it would spin through
  // hundreds of empty ones and take the processor from the page being measured)
  const soon = fn => (window.__paused === true ? setTimeout(() => raf(fn), 150) : raf(fn))
  window.requestAnimationFrame = cb => soon(ts => {
    if (!M.on) return cb(ts)
    if (!gl) { const c = document.getElementById('field'); gl = c && c.getContext('webgl2'); if (gl) ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') }
    let q = null
    if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); M.begun++ }
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
    const timer = probe || n ? '' : `no frame was timed from outside: ${w.__perf.begun} begun, ${w.__perf.lost} lost to a break in the GPU's clock`
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
// (--nowait: the machine is shared all day and the builds are measured one after the other in the one run)
if (!flag('nowait')) await quiet('start', 12)
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
if (!flag('idle') && !flag('land') && !flag('adapt') && !flag('spring') && !flag('close') && !flag('hold')) {
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

// --close: what coming close costs.
if (flag('close')) {
  const shots = opt('shots')
  if (shots) mkdirSync(shots, { recursive: true })
  await tier('high')
  await each(async p => { await field('f.titleAt(-1)', p); await bigFarm(p); if (flag('lift')) await field('f.force({ pixels: 1e9 })', p) })
  const spot = await page.evaluate(() => {
    const f = (window as any).__countyField, st = f.info().fields as string[]
    return { field: [3, 0, 1, 2, 4, 5].find(i => st[i] === 'growing') ?? 3, yard: f.tiers().yard as number, least: 7.5 }
  })
  const framed = (name: string) => async (p: Page) => { await field('f.rig.level()', p); await at(name)(p); await p.waitForTimeout(900) }
  const over = (dist: number, lean: number) => async (p: Page) => {
    await p.evaluate(([i, dist, lean]) => {
      const f = (window as any).__countyField
      f.rig.level()
      f.view({ frame: 'field', field: i, x: 0.5, z: 0.7, dist })
      f.rig.leanBy(lean)
    }, [spot.field, dist, lean])
    await p.waitForTimeout(1600)
  }
  const near: [string, string, (p: Page) => Promise<void>][] = [
    ['field', 'field tier (the playing view)', framed('field')],
    ['yard', 'yard tier', framed('yard')],
    ['yard-level', `over the crop from ${spot.yard.toFixed(0)} m, level`, over(spot.yard, 0)],
    ['yard-down', `over the crop from ${spot.yard.toFixed(0)} m, tipped down`, over(spot.yard, 1)],
    ['close-level', 'closest (7.5 m), level across the crop', over(spot.least, 0)],
    ['close-down', 'closest (7.5 m), tipped down', over(spot.least, 1)],
    ['yard-close', 'closest (7.5 m) in the yard, level (grass, trees, buildings)', async p => { await framed('yard')(p); await field('f.view({ dist: 7.5 })', p); await p.waitForTimeout(1200) }],
  ]
  const got: Record<string, M[]> = {}
  for (const [key, label, set] of near) {
    if (only && !only.includes(key)) continue
    await each(set)
    const m = await measure(sides)
    got[label] = m
    m.forEach((x, i) => line(`${label}${sides.length > 1 ? `, ${sides[i].name}` : ''}`, x))
    for (const s of sides) {
      if (shots) { await turn(sides, s); await s.page.waitForTimeout(300); await s.page.screenshot({ path: `${shots}/${s.name.replace(/\W+/g, '-')}-${key}-${W}x${H}.png` }) }
      if (!s.probe) continue
      await turn(sides, s)
      console.log(`    ${s.name}, pass by pass:`)
      // (the window is long enough for a slow frame's timings to come back; one with none is not kept)
      const a = await window1(s, 2.2, 'parts'), b = await window1(s, 2.2, 'parts')
      breakdown(!a.rows.length ? b : !b.rows.length ? a : least(a, b))
    }
  }
  // --try: what of the frame level across the crop is the crop's, with one thing at a time taken from the picture.
  if (flag('try') && now.probe) {
    await turn(sides, now)
    await over(spot.least, 0)(page)
    const part = async (label: string) => {
      await page.waitForTimeout(2500)
      const a = await window1(now, 2.2, 'parts'), b = await window1(now, 2.2, 'parts')
      const m = !a.rows.length ? b : !b.rows.length ? a : least(a, b)
      const sum = (pick: (r: Row) => boolean) => m.rows.filter(pick).reduce((x, r) => x + r.gpu * r.share, 0)
      console.log(`    ${label.padEnd(46)} the picture ${ms(sum(r => r.name === 'scene'))} ms, of which the crop ${ms(sum(r => r.name === 'scene/fields'))}, trees ${ms(sum(r => r.name === 'scene/flora' || r.name === 'scene/cards' || r.name === 'scene/farwoods'))};  shadow maps ${ms(sum(r => /^shadow\d$/.test(r.name)))};  lens ${ms(sum(r => r.name.startsWith('post:')))}`)
    }
    console.log('  level across the crop from the closest, one thing at a time taken out (GPU ms):')
    await part('as it is')
    await field('f.force({ pixels: 1e9, msaa: 0 })'); await part('no multisampling')
    await field('f.force({ pixels: 1e9, msaa: 2 })'); await part('two samples to a pixel, not four')
    await field('f.force({ pixels: 1e9 })'); await field('f.shadowsOn(false)'); await part('no shadows')
    await field('f.shadowsOn(true)'); await field('f.force({ pixels: 1e9, ao: false, focus: false, bloom: false, shafts: 0 })'); await part('no lens passes')
    await field('f.force({ pixels: 1e9 })'); await field("f.show('fields', false)"); await part('no fields at all')
    await field("f.show('fields', true)")
  }
  // --level: what a level view is made of. The playing view, the yard tier, level over the crop from 160 m, level
  // across it from the closest and level in the yard from the closest: each whole, then with one part at a time not
  // drawn (the two turn about, the quietest kept): what the part costs, its triangles and its draw calls; and the
  // fragments of the trees' cards, the far woods, the whole trees, the grass and the crop to a pixel of the picture.
  if (flag('level')) {
    await turn(sides, now)
    const lens = flag('lift') ? '{ pixels: 1e9, ao: false, focus: false, bloom: false, shafts: 0 }' : '{ ao: false, focus: false, bloom: false, shafts: 0 }'
    const back = flag('lift') ? '{ pixels: 1e9 }' : '{}'
    const show = (name: string): [string, string, string] => [name, `f.show('${name}', false)`, `f.show('${name}', true)`]
    const parts: [string, string, string][] = [
      ['whole trees', `f.trees('whole', false)`, `f.trees('whole', true)`], ['tree cards', `f.trees('cards', false)`, `f.trees('cards', true)`], ['far woods', ...show('farwoods').slice(1)] as [string, string, string],
      ['fine shadow map redrawn', 'f.cascade(0, false)', 'f.cascade(0, true)'], ['middle shadow map redrawn', 'f.cascade(1, false)', 'f.cascade(1, true)'], ['wide shadow map redrawn', 'f.cascade(2, false)', 'f.cascade(2, true)'],
      ['terrain and land', ...show('terrain').slice(1)] as [string, string, string], ['clearing', ...show('clearing').slice(1)] as [string, string, string], show('grass'), ['buildings and yard', ...show('props').slice(1)] as [string, string, string],
      ['fields and crop', ...show('fields').slice(1)] as [string, string, string], ['people and machines', ...show('crews').slice(1)] as [string, string, string], show('sky'), ['far country', ...show('far').slice(1)] as [string, string, string],
      ['lens passes', `f.force(${lens})`, `f.force(${back})`],
    ]
    console.log(`  what each view is made of (ms from one frame to the next${free ? ', drawing as fast as it can' : ''}, the quietest of ${ROUNDS}; a part's cost is the view with it less the view without):`)
    for (const [key, label, set] of [near[0], near[1], near[2], near[4], near[6]]) {
      if (opt('views') && !opt('views')!.split(',').includes(key)) continue
      await set(page)
      await page.waitForTimeout(1500)
      const whole: M[] = []
      const rows: string[] = []
      for (const [name, off, on] of parts) {
        let a = 1e9, b = 1e9, mb: M | null = null
        for (let k = 0; k < ROUNDS; k++) {
          const w = await window1(now, 0.6)
          whole.push(w)
          a = Math.min(a, w.gap)
          await field(off)
          await page.waitForTimeout(350)
          const m = await window1(now, 0.6)
          if (m.gap < b) { b = m.gap; mb = m }
          await field(on)
          await page.waitForTimeout(350)
        }
        const w0 = whole[whole.length - 1]
        rows.push(`      ${name.padEnd(26)} ${ms(a - b)} ms   ${mega(w0.triangles - mb!.triangles)}M triangles   ${String(w0.calls - mb!.calls).padStart(4)} calls`)
      }
      const base = whole.reduce((x, y) => (y.gap < x.gap ? y : x))
      const work = await page.evaluate(() => { const f = (window as any).__countyField; return f.work ? { cards: f.work('cards'), far: f.work('farwoods'), whole: f.work('whole'), grass: f.work('grass'), crop: f.cropWork() } : null })
      console.log(`   ${label}: ${ms(base.gap)} ms, ${mega(base.triangles)}M triangles, ${base.calls} calls`)
      for (const r of rows) console.log(r)
      const w2 = (x: number[]) => `${x[0].toFixed(2)} (${x[1].toFixed(2)} in front)`
      if (work) console.log(`      fragments to a pixel of the picture: tree cards ${w2(work.cards)}, far woods ${w2(work.far)}, whole trees ${w2(work.whole)}, grass ${w2(work.grass)}, the crop's leaves ${w2(work.crop)}`)
      if (shots) await page.screenshot({ path: `${shots}/${key}-${W}x${H}.png` })
    }
  }
  // --crop=<switches>: the crop's whole plants as they are drawn now against as they are without each thing that
  // makes them cheaper (the renderer's tryWithout), the two turn about in the one page, three times each and the
  // quietest kept: the playing view, then level across the crop from 160 m and from the closest.
  if (opt('crop') && now.probe) {
    await turn(sides, now)
    const switches = opt('crop')!.split(',')
    const states: [string, string[]][] = [['as it is now', []], ...switches.map(x => [`without ${x}`, [x]] as [string, string[]]), ...(switches.length > 1 ? [['without any of them', switches] as [string, string[]]] : [])]
    console.log(`  the crop's whole plants, one way against the other in the one page (ms from one frame to the next${free ? ', drawing as fast as it can' : ''}: the quietest of ${ROUNDS} turns each, and the middle one):`)
    const frames: Record<string, number[]> = {}
    for (const [key, label, set] of [near[0], near[2], near[4]]) {
      if (opt('views') && !opt('views')!.split(',').includes(key)) continue
      await set(page)
      const gaps: number[][] = states.map(() => [])
      const tris = states.map(() => 0), work: number[][] = states.map(() => [NaN, NaN])
      for (let k = 0; k < ROUNDS; k++) {
        for (let i = 0; i < states.length; i++) {
          await page.evaluate(([all, off]) => { const f = (window as any).__countyField; for (const x of all) f.tryWithout(x, off.includes(x)) }, [switches, states[i][1]])
          await page.waitForTimeout(k === 0 ? 2500 : 500)
          const whole = await window1(now, 1.0)
          gaps[i].push(whole.gap)
          tris[i] = whole.triangles
          if (k > 0) continue
          if (shots) await page.screenshot({ path: `${shots}/${key}-${states[i][0].replace(/\W+/g, '-')}-${W}x${H}.png` })
          // (a count, not a time: the same on any machine and however busy this one is)
          work[i] = await field<number[]>('f.cropWork ? f.cropWork() : [NaN, NaN]')
        }
      }
      console.log(`   ${label}`)
      states.forEach(([name], i) => {
        const g = gaps[i].sort((x, y) => x - y)
        ;(frames[name] ??= []).push(g[0])
        console.log(`    ${name.padEnd(28)} ${ms(g[0])} ms (middle ${ms(g[g.length >> 1])});  ${mega(tris[i])}M triangles;  leaf fragments to a pixel of the picture: ${work[i][0].toFixed(2)} drawn, ${work[i][1].toFixed(2)} in front when drawn`)
      })
    }
    await page.evaluate(all => { const f = (window as any).__countyField; for (const x of all) f.tryWithout(x, false) }, switches)
    if (!opt('views')) for (const [name, g] of Object.entries(frames)) console.log(`   ${name.padEnd(28)} against the playing view: level from 160 m ${(g[1] / g[0]).toFixed(2)}x, level from the closest ${(g[2] / g[0]).toFixed(2)}x`)
  }
  const base = Object.keys(got)[0]
  console.log(`  each view against the playing view (${free ? 'ms from one frame to the next, drawing as fast as it can' : 'GPU ms a frame'}; triangles and draw calls of a frame, every pass counted):`)
  sides.forEach((s, i) => {
    console.log(`   ${s.name}`)
    for (const [label, row] of Object.entries(got)) {
      const m = row[i], b = got[base][i]
      console.log(`    ${label.padEnd(44)} ${ms(of(m))} ms (${(of(m) / of(b)).toFixed(2)}x)   GPU ${ms(m.gpu)}   ${mega(m.triangles)}M triangles (${(m.triangles / b.triangles).toFixed(2)}x)  ${String(m.calls).padStart(4)} calls   picture ${m.drawn[0]}x${m.drawn[1]}`)
    }
  })
}

// --hold: the game protecting its own frame rate.
if (flag('hold')) {
  await turn(sides, now)
  await page.evaluate(() => (window as any).__county.app.setSetting('quality', 'auto'))
  await field('f.titleAt(-1)')
  await bigFarm(page)
  if (flag('lift')) await field('f.force({ pixels: 1e9 })')
  // people at work and the clock running: frames are drawn all the while
  await page.evaluate(() => { const w = window as any; w.__county.app.setSpeed(1) })
  const spot = await page.evaluate(() => { const st = (window as any).__countyField.info().fields as string[]; return [3, 0, 1, 2, 4, 5].find(i => st[i] === 'growing') ?? 3 })
  // the gaps between the display's beats the page was called on, over two seconds
  const beats = () => page.evaluate(() => new Promise<number[]>(done => {
    const gaps: number[] = []
    let last = 0
    const until = performance.now() + 2000
    const step = (t: number) => { if (last) gaps.push(t - last); last = t; if (performance.now() < until) requestAnimationFrame(step); else done(gaps) }
    requestAnimationFrame(step)
  }))
  const watch = async (label: string, seconds: number) => {
    let was = ''
    for (let t = 0; t < seconds; t += 2) {
      const gaps = (await beats()).sort((a, b) => a - b)
      const p = await field<{ tier: string; size: number; fps: number; drawn: number[]; lowered: boolean }>('f.pace()')
      const say = `${p.tier} at ${p.size} of its side, picture ${p.drawn.join('x')}`
      if (say !== was || t + 2 >= seconds) console.log(`    ${label} ${String(t + 2).padStart(3)} s: ${say};  a frame every ${ms(gaps[gaps.length >> 1])} ms at the middle, ${ms(gaps[Math.floor(gaps.length * 0.95)])} at the 95th of a hundred;  the game reads ${p.fps} frames a second${p.lowered ? ';  the setting has come down by itself' : ''}`)
      was = say
    }
  }
  await field("f.tier('field')")
  await page.waitForTimeout(1500)
  await watch('as a test driver has it, the playing view', 4)
  await field("f.adapt(true, 'high')")
  await watch('following frame time, the playing view ', 40)
  await page.evaluate(i => { const f = (window as any).__countyField; f.rig.level(); f.view({ frame: 'field', field: i, x: 0.5, z: 0.7, dist: 7.5 }) }, spot)
  await watch('level across the crop from 7.5 m        ', 40)
  await page.evaluate(i => { const f = (window as any).__countyField; f.view({ frame: 'field', field: i, x: 0.5, z: 0.7, dist: 160 }) }, spot)
  await watch('level across the crop from 160 m        ', 40)
  await field("f.tier('field')")
  await watch('back in the playing view                ', Number(opt('back') ?? 150))
  await field("f.adapt(false, 'high')")
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
// --spring: a new farm's first days at 1x, the interface as the player has it.
if (flag('spring')) {
  for (const s of sides) await stop(s, true)
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  p.on('pageerror', e => errors.push(`spring: ${e.message}`))
  await p.goto(base)
  await p.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0, null, { timeout: 120000 })
  await p.evaluate(() => { const { app } = (window as any).__county; app.newGame(1977, 5); app.do({ t: 'begin' }); app.setSpeed(1) })
  await p.waitForTimeout(4000)
  const stretch = async (label: string) => {
    const r = await p.evaluate(async () => {
      const w = window as any, f = w.__countyField, c = w.__county.app.campaign
      let beats = 0, on = true
      const count = () => { beats++; if (on) requestAnimationFrame(count) }
      requestAnimationFrame(count)
      f.mean()
      const day0 = c.season.day, t0 = performance.now()
      await new Promise(r => setTimeout(r, 8000))
      on = false
      const secs = (performance.now() - t0) / 1000, m = f.mean(), s = f.stats()
      return { beats: beats / secs, frames: m.frames / secs, days: (c.season.day - day0) / secs, triangles: m.triangles, calls: m.calls, dist: s.camera.dist, spent: s.spent, pace: f.pace() }
    })
    console.log(`  ${label.padEnd(34)} ${r.beats.toFixed(1)} beats, ${r.frames.toFixed(1)} frames and ${r.days.toFixed(2)} days a second; ${mega(r.triangles)}M triangles, ${Math.round(r.calls)} calls; camera ${Math.round(r.dist)} m off; drawing on the CPU ${r.spent.draw} ms, crews ${r.spent.crews} ms, updates ${r.spent.update} ms; pace ${JSON.stringify(r.pace)}`)
  }
  await stretch('the first spring at 1x')
  await p.evaluate(() => (window as any).__countyField.tryWithout('cards', true))
  await stretch('  with no cards in the fine shadow')
  await p.evaluate(() => { const f = (window as any).__countyField; f.tryWithout('cards', false); f.tryWithout('lazy', true) })
  await stretch('  with the fine shadow redrawn always')
  await p.evaluate(() => (window as any).__countyField.tryWithout('lazy', false))
  await stretch('the first spring at 1x, again')
  await p.close()
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
