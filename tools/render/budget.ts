// What each view costs on the GPU at each quality tier: GPU time per frame, triangles and draw calls, for the opening,
// the home view and the whole map with ten fields in crop, and a close view along the rows; and, with --parts, what each
// part of the scene costs in the home view at the high tier (the frame with that part hidden, against the whole).
// Usage: node tools/render/budget.ts <base-url> [--parts] [--size=1920x1080]
import { execFileSync } from 'node:child_process'
import { chromium, type Page } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const base = process.argv[2] ?? 'http://localhost:5317/'
const parts = process.argv.includes('--parts')
const sizeArg = process.argv.find(a => a.startsWith('--size='))
const [W, H] = (sizeArg ? sizeArg.slice(7) : '1920x1080').split('x').map(Number)

// Before the page runs: time every animation frame on the GPU where the extension exists.
const INSTRUMENT = `(() => {
  const M = window.__perf = { gpu: [], cpu: [], on: false }
  const raf = window.requestAnimationFrame.bind(window)
  let pend = [], ext = null, gl = null
  window.requestAnimationFrame = cb => raf(ts => {
    if (!gl) { const c = document.getElementById('field'); gl = c && c.getContext('webgl2'); if (gl) ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') }
    let q = null
    if (M.on && ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q) }
    const t0 = performance.now()
    try { cb(ts) } finally {
      if (M.on) M.cpu.push(performance.now() - t0)
      if (q) {
        gl.endQuery(ext.TIME_ELAPSED_EXT)
        pend.push(q)
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
        pend = pend.filter(p => {
          if (!gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)) return true
          if (!disjoint) M.gpu.push(gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6)
          gl.deleteQuery(p)
          return false
        })
      }
    }
  })
})()`

const median = (xs: number[]) => { const a = xs.slice().sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : NaN }

interface M { gpu: number; cpu: number; triangles: number; calls: number; tier: string; spent?: { crews: number; update: number; draw: number }; objects?: number }

// The GPU may be shared with other work on the machine, which only ever adds time: of a few windows, keep the quietest.
async function measure(page: Page): Promise<M> {
  let best = await window1(page)
  for (let k = 0; k < 3; k++) {
    const m = await window1(page)
    if (m.gpu < best.gpu) best = m
  }
  return best
}

async function window1(page: Page, seconds = 1.2): Promise<M> {
  await page.waitForTimeout(300)
  await page.evaluate(() => { const M = (window as any).__perf; M.gpu = []; M.cpu = []; M.on = true })
  await page.waitForTimeout(seconds * 1000)
  const r = await page.evaluate(() => {
    const M = (window as any).__perf
    M.on = false
    const s = (window as any).__countyField.stats()
    return { gpu: M.gpu, cpu: M.cpu, triangles: s.triangles, calls: s.calls, tier: s.tier, spent: s.spent, objects: s.objects }
  })
  return { gpu: median(r.gpu), cpu: median(r.cpu), triangles: r.triangles, calls: r.calls, tier: r.tier, spent: r.spent, objects: r.objects }
}

const line = (label: string, m: M) =>
  console.log(`  ${label.padEnd(34)} ${m.tier.padEnd(6)} GPU ${m.gpu.toFixed(2).padStart(6)} ms  CPU ${m.cpu.toFixed(2).padStart(5)} ms  ${(m.triangles / 1e6).toFixed(2).padStart(5)}M triangles  ${String(m.calls).padStart(4)} calls`
    + (m.spent ? `  (crews ${m.spent.crews} ms, updates ${m.spent.update} ms, drawing ${m.spent.draw} ms, ${m.objects} objects)` : ''))

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
  })
}

// Other browsers on the GPU (other checks running on the same machine) make every number here wrong: wait them out.
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
    await new Promise(r => setTimeout(r, 10000))
  }
  console.log(`  (the GPU was still shared at ${label}: these numbers are high)`)
  return false
}
await quiet('start', 12)
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.addInitScript({ content: INSTRUMENT })
await page.goto(base)
await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0)
mine = browsersOnGpu()
const gpuName = await page.evaluate(() => {
  const gl = (document.getElementById('field') as HTMLCanvasElement).getContext('webgl2')!
  const e = gl.getExtension('WEBGL_debug_renderer_info')
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'
})
console.log(`${W}x${H}  ${gpuName}`)
await page.evaluate(() => {
  const { app } = (window as any).__county
  for (const el of [...document.body.children]) if (el.id !== 'field' && el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT') (el as HTMLElement).style.display = 'none'
  const set = app.setInsets.bind(app)
  app.setInsets = () => set(56, 0, 150, 0)
  set(56, 0, 150, 0)
})
const settle = () => page.evaluate(() => (window as any).__countyField.settle())
const tier = (t: string) => page.evaluate(t => (window as any).__county.app.setSetting('quality', t), t)

const views: [string, () => Promise<void>][] = [
  ['opening', async () => { await page.evaluate(() => (window as any).__county.app.quitToTitle()); await settle() }],
  ['home view, ten fields in crop', async () => { await bigFarm(page); await settle() }],
  ['whole map, ten fields in crop', async () => { await page.evaluate(() => (window as any).__countyField.home()); await settle() }],
  ['close along the rows', async () => { await page.evaluate(() => (window as any).__countyField.view({ frame: 'field', field: 5, x: 0.3, z: 0.52, dist: 12, yaw: -1.32, pitch: 0.13 })); await settle() }],
]
for (const [label, set] of views) {
  for (const t of ['high', 'medium', 'low']) {
    await tier(t)
    await set()
    await quiet(label)
    const m = await measure(page)
    line(label, m)
    if (browsersOnGpu() > mine) console.log('    (another browser started on the GPU during this measurement)')
  }
}
if (parts) {
  await tier('high')
  await page.evaluate(() => { const f = (window as any).__countyField; f.home() })
  await settle()
  const all = await measure(page)
  line('home view, everything', all)
  const names: string[] = await page.evaluate(() => (window as any).__countyField.parts())
  for (const n of names) {
    await page.evaluate(n => (window as any).__countyField.show(n, false), n)
    const m = await measure(page)
    console.log(`    without ${n.padEnd(10)} saves ${(all.gpu - m.gpu).toFixed(2).padStart(6)} ms GPU, ${((all.triangles - m.triangles) / 1e6).toFixed(2)}M triangles, ${all.calls - m.calls} calls`)
    await page.evaluate(n => (window as any).__countyField.show(n, true), n)
  }
  await page.evaluate(() => (window as any).__countyField.shadowsOn(false))
  const ns = await measure(page)
  console.log(`    without shadows   saves ${(all.gpu - ns.gpu).toFixed(2).padStart(6)} ms GPU, ${((all.triangles - ns.triangles) / 1e6).toFixed(2)}M triangles, ${all.calls - ns.calls} calls`)
  await page.evaluate(() => (window as any).__countyField.shadowsOn(true))
}
console.log(errors.length ? `  page errors: ${errors.join(' | ')}` : '  no page errors')
await browser.close()
