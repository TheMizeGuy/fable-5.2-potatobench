// Measures the field view on the real GPU: triangles and draw calls on idle screens, then frame times through a season at top speed.
// Usage: node tools/render/perf.ts <base-url> [year] [seed]
import { chromium, type Page } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:5317/'
const year = Number(process.argv[3] ?? 1987)
const seed = Number(process.argv[4] ?? 42)

// Before the page runs: catch the three.js renderer, time every animation frame on the CPU and, where the extension exists, on the GPU.
const INSTRUMENT = `(() => {
  // Each sample is [milliseconds, season day].
  const M = window.__perf = { renderer: null, cpu: [], gap: [], gpu: [], on: false }
  const devtools = new EventTarget()
  devtools.addEventListener('observe', e => { if (e.detail && e.detail.isWebGLRenderer) M.renderer = e.detail })
  window.__THREE_DEVTOOLS__ = devtools
  const raf = window.requestAnimationFrame.bind(window)
  let last = 0, pend = [], ext = null
  window.requestAnimationFrame = cb => raf(ts => {
    const gl = M.renderer && M.renderer.getContext()
    if (gl && !ext) ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') || false
    const c = window.__county && window.__county.app.campaign
    const day = c && c.season ? c.season.day : -1
    let q = null
    if (M.on && ext) { q = gl.createQuery(); q.day = day; gl.beginQuery(ext.TIME_ELAPSED_EXT, q) }
    const t0 = performance.now()
    try { cb(ts) } finally {
      const t1 = performance.now()
      if (M.on) { M.cpu.push([t1 - t0, day]); if (last) M.gap.push([t0 - last, day]) }
      last = t0
      if (q) {
        gl.endQuery(ext.TIME_ELAPSED_EXT)
        pend.push(q)
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
        pend = pend.filter(p => {
          if (!gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)) return true
          if (!disjoint) M.gpu.push([gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6, p.day])
          gl.deleteQuery(p)
          return false
        })
      }
    }
  })
})()`

async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(n => new Promise<void>(res => { let k = 0; const t = () => (++k >= n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t) }), n)
}

async function triangles(page: Page, label: string): Promise<void> {
  await frames(page, 4)
  await page.evaluate(() => (window as any).__countyField.settle())
  await frames(page, 30)
  const r = await page.evaluate(() => { const i = (window as any).__perf.renderer.info.render; return { calls: i.calls, triangles: i.triangles } })
  console.log(`${label.padEnd(12)} triangles ${String(r.triangles).padStart(9)}  draw calls ${r.calls}`)
}

// Samples are [milliseconds, season day]. Spring is before the canopy fills (day 170), summer after.
function summary(xs: [number, number][]): string {
  if (!xs.length) return 'n/a'
  const med = (v: number[]) => { const a = v.slice().sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)].toFixed(2) : '-' }
  const a = xs.slice().sort((p, q) => p[0] - q[0])
  const p99 = a[Math.min(a.length - 1, Math.floor(a.length * 0.99))][0]
  const worst = a[a.length - 1]
  return `median ${med(xs.map(x => x[0]))} (spring ${med(xs.filter(x => x[1] < 170).map(x => x[0]))}, summer ${med(xs.filter(x => x[1] >= 170).map(x => x[0]))})  p99 ${p99.toFixed(2)}  worst ${worst[0].toFixed(2)} on day ${worst[1]}  (${a.length} frames)`
}

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.addInitScript({ content: INSTRUMENT })
await page.goto(base)
await page.waitForFunction(() => (window as any).__countyField !== undefined && (window as any).__perf.renderer)
console.log('GPU:', await page.evaluate(() => {
  const gl = (window as any).__perf.renderer.getContext()
  const e = gl.getExtension('WEBGL_debug_renderer_info')
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'
}))
await page.evaluate(() => (window as any).__county.app.setInsets(0, 0, 0, 346))
await triangles(page, 'title')
await page.evaluate(({ year, seed }) => (window as any).__county.app.newGame(year, seed), { year, seed })
await triangles(page, 'spring plan')
await page.evaluate(({ year, seed }) => {
  const { app, sim } = (window as any).__county
  app.newGame(year, seed)
  app.do({ t: 'begin' })
  const c = app.campaign
  while (c.phase === 'season' && c.season.day < 196) {
    for (const a of sim.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
    if (!app.do({ t: 'day' }).ok) break
  }
}, { year, seed })
await triangles(page, 'midsummer')

// A whole season at the top speed, with the reference practice queued as it comes up.
await page.evaluate(({ year, seed }) => {
  const { app, sim } = (window as any).__county
  app.setSetting('pauseOnAlerts', false)
  app.newGame(year, seed)
  app.do({ t: 'begin' })
  ;(window as any).__driver = setInterval(() => {
    const c = app.campaign
    if (!c || c.phase !== 'season' || sim.seasonDone(c)) return
    for (const a of sim.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
    if (app.speed !== 3) app.setSpeed(3)
  }, 100)
}, { year, seed })
await frames(page, 30)
await page.evaluate(() => { (window as any).__perf.on = true })
const t0 = Date.now()
let day = 0
for (;;) {
  await page.waitForTimeout(1000)
  const st = await page.evaluate(() => { const { app, sim } = (window as any).__county; const c = app.campaign; return { day: c.season ? c.season.day : -1, done: c.phase !== 'season' || sim.seasonDone(c) } })
  day = st.day
  if (st.done || Date.now() - t0 > 150000) break
}
const perf = await page.evaluate(() => { const M = (window as any).__perf; M.on = false; clearInterval((window as any).__driver); return { cpu: M.cpu, gap: M.gap, gpu: M.gpu } })
console.log(`season ${year} at top speed, ${((Date.now() - t0) / 1000).toFixed(0)} s, to season day ${day}`)
console.log(`  frame interval (ms)   ${summary(perf.gap)}`)
console.log(`  CPU per frame (ms)    ${summary(perf.cpu)}`)
console.log(`  GPU per frame (ms)    ${summary(perf.gpu)}`)
console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors')
await browser.close()
