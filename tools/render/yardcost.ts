// What the buildings and yards cost to draw: GPU time, triangles and draw calls of a frame with them and without, in
// the opening, the home view and close on the yard, with nothing built and with every building standing.
// Usage: node tools/render/yardcost.ts <base-url>
import { chromium, type Page } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const base = process.argv[2] ?? 'http://localhost:5317/'

// Before the page runs: time every animation frame on the GPU where the extension exists.
const INSTRUMENT = `(() => {
  const M = window.__perf = { gpu: [], on: false }
  const raf = window.requestAnimationFrame.bind(window)
  let pend = [], ext = null, gl = null
  window.requestAnimationFrame = cb => raf(ts => {
    if (!gl) { const c = document.getElementById('field'); gl = c && c.getContext('webgl2'); if (gl) ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') }
    let q = null
    if (M.on && ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q) }
    try { cb(ts) } finally {
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

interface M { gpu: number; triangles: number; calls: number }
const median = (xs: number[]) => { const a = xs.slice().sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : NaN }

async function once(page: Page): Promise<M> {
  await page.waitForTimeout(300)
  await page.evaluate(() => { const M = (window as any).__perf; M.gpu = []; M.on = true })
  await page.waitForTimeout(1200)
  const r = await page.evaluate(() => {
    const M = (window as any).__perf
    M.on = false
    const s = (window as any).__countyField.stats()
    return { gpu: M.gpu, triangles: s.triangles, calls: s.calls }
  })
  return { gpu: median(r.gpu), triangles: r.triangles, calls: r.calls }
}
// The GPU is shared with other checks on the machine, which only ever adds time: of a few windows, keep the quietest.
async function measure(page: Page): Promise<M> {
  let best = await once(page)
  for (let k = 0; k < 3; k++) { const m = await once(page); if (m.gpu < best.gpu) best = m }
  return best
}

async function farm(page: Page, built: boolean): Promise<void> {
  await page.evaluate(built => {
    const { app, sim } = (window as any).__county
    app.newGame(1977, 5)
    const c = app.campaign
    c.cash = Math.max(c.cash, 600000)
    if (built) {
      for (const f of [10, 11]) { app.do({ t: 'rent', field: f }); app.do({ t: 'plan', field: f, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } }) }
      for (const kind of sim.BUILDING_KINDS) for (const yard of sim.BUILDINGS[kind].dufour ? [-1, -2] : [-1]) {
        c.buildings.push({ id: c.nextBuilding++, kind, yard, done: sim.BUILDINGS[kind].days, need: sim.BUILDINGS[kind].days, built: true })
      }
      for (const u of ['boom', 'harvester', 'reel', 'tractor2', 'tractor3', 'truck']) c.upgrades[u] = true
      for (let k = 0; k < 3; k++) app.do({ t: 'hire', kind: 'hand' })
    }
    app.do({ t: 'begin' })
    while (c.phase === 'season' && c.season.day < 196) {
      for (const a of sim.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && a.act !== 'build') app.do({ t: 'job', kind: a.act, field: a.field })
      if (!app.do({ t: 'day' }).ok) break
    }
    for (let n = 0; n < 30 && sim.today(app.world, c).sky !== 'clear'; n++) app.do({ t: 'day' })
    if (built) { c.logs = 60; c.stone = 60; app.emit({ type: 'change' }) }
  }, built)
}

const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.addInitScript({ content: INSTRUMENT })
await page.goto(base)
await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0)
await page.evaluate(() => {
  const { app } = (window as any).__county
  for (const el of [...document.body.children]) if (el.id !== 'field' && el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT') (el as HTMLElement).style.display = 'none'
  const set = app.setInsets.bind(app)
  app.setInsets = () => set(56, 0, 150, 0)
  set(56, 0, 150, 0)
})
const settle = () => page.evaluate(() => (window as any).__countyField.settle())
const show = (on: boolean) => page.evaluate(on => (window as any).__countyField.show('props', on), on)
const YARD = { x: 28, z: -5, dist: 34, yaw: 0.55, pitch: 0.36 }

const views: [string, () => Promise<void>][] = [
  ['opening', async () => { await page.evaluate(() => (window as any).__county.app.quitToTitle()); await settle() }],
  ['home view, nothing built', async () => { await farm(page, false); await settle() }],
  ['yard close, nothing built', async () => { await page.evaluate(v => (window as any).__countyField.view({ frame: 'home', ...v }), YARD); await settle() }],
  ['home view, everything built', async () => { await farm(page, true); await settle() }],
  ['yard close, everything built', async () => { await page.evaluate(v => (window as any).__countyField.view({ frame: 'home', ...v }), YARD); await settle() }],
]
for (const tier of ['high', 'medium', 'low']) {
  await page.evaluate(t => (window as any).__county.app.setSetting('quality', t), tier)
  for (const [label, set] of views) {
    await set()
    const all = await measure(page)
    await show(false)
    const none = await measure(page)
    await show(true)
    console.log(`  ${tier.padEnd(6)} ${label.padEnd(30)} frame ${all.gpu.toFixed(2).padStart(6)} ms, ${(all.triangles / 1e6).toFixed(2)}M triangles, ${String(all.calls).padStart(3)} calls;  buildings and yards: ${(all.gpu - none.gpu).toFixed(2).padStart(5)} ms, ${String(all.triangles - none.triangles).padStart(7)} triangles, ${String(all.calls - none.calls).padStart(3)} calls`)
  }
}
console.log(errors.length ? `  page errors: ${errors.join(' | ')}` : '  no page errors')
await browser.close()
