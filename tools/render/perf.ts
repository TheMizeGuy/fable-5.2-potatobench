// Measures the field view on the real GPU: the time from navigation to the first drawn frame, then frame times
// (interval between frames, CPU time in the frame, GPU time where the browser reports it), triangles, draw calls and
// the quality tier chosen, on the opening shot, the July strategic view and a rainy day, at two window sizes.
// Usage: node tools/render/perf.ts <base-url> [year] [seed]
import { chromium, type Page } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:5317/'
const year = Number(process.argv[3] ?? 1977)
const seed = Number(process.argv[4] ?? 5)

// Before the page runs: time every animation frame on the CPU and, where the extension exists, on the GPU.
const INSTRUMENT = `(() => {
  const M = window.__perf = { cpu: [], gap: [], gpu: [], on: false }
  const raf = window.requestAnimationFrame.bind(window)
  let last = 0, pend = [], ext = null, gl = null
  window.requestAnimationFrame = cb => raf(ts => {
    if (!gl) { const c = document.getElementById('field'); gl = c && c.getContext('webgl2'); if (gl) ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') }
    let q = null
    if (M.on && ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q) }
    const t0 = performance.now()
    try { cb(ts) } finally {
      const t1 = performance.now()
      if (M.on) { M.cpu.push(t1 - t0); if (last) M.gap.push(t0 - last) }
      last = t0
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

function summary(xs: number[]): string {
  if (!xs.length) return 'not reported by this browser'
  const a = xs.slice().sort((p, q) => p - q)
  const at = (f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))]
  return `median ${at(0.5).toFixed(2)}  p95 ${at(0.95).toFixed(2)}  worst ${a[a.length - 1].toFixed(2)}  (${a.length} frames)`
}

async function measure(page: Page, label: string, seconds = 5): Promise<void> {
  await page.waitForTimeout(1500)
  await page.evaluate(() => { const M = (window as any).__perf; M.cpu = []; M.gap = []; M.gpu = []; M.on = true })
  await page.waitForTimeout(seconds * 1000)
  const r = await page.evaluate(() => {
    const M = (window as any).__perf
    M.on = false
    const s = (window as any).__countyField.stats()
    return { cpu: M.cpu, gap: M.gap, gpu: M.gpu, tier: s.tier, fps: s.fps, triangles: s.triangles, calls: s.calls, drawn: s.drawn }
  })
  console.log(`  ${label}: tier ${r.tier}, drawn at ${r.drawn.join('x')}, ${r.triangles} triangles in ${r.calls} draw calls`)
  console.log(`    frame interval (ms)  ${summary(r.gap)}`)
  console.log(`    CPU in the frame (ms) ${summary(r.cpu)}`)
  console.log(`    GPU for the frame (ms) ${summary(r.gpu)}`)
}

const browser = await chromium.launch({ args: [process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
for (const [w, h] of [[1440, 900], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.addInitScript({ content: INSTRUMENT })
  // Once to fill the cache, then the measured load.
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__countyField?.stats().firstFrame > 0)
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__countyField?.stats().firstFrame > 0)
  const first = await page.evaluate(() => ({ at: (window as any).__countyField.stats().firstFrame, gpu: (() => {
    const gl = (document.getElementById('field') as HTMLCanvasElement).getContext('webgl2')!
    const e = gl.getExtension('WEBGL_debug_renderer_info')
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })() }))
  console.log(`${w}x${h}  GPU: ${first.gpu}`)
  console.log(`  navigation to the first drawn frame, warm cache: ${Math.round(first.at)} ms`)
  await page.evaluate(() => {
    const { app } = (window as any).__county
    ;(document.getElementById('ui') as HTMLElement).style.display = 'none'
    const set = app.setInsets.bind(app)
    app.setInsets = () => set(56, 0, 150, 0)
    set(56, 0, 150, 0)
  })
  await measure(page, 'opening shot')
  const state = (rain: boolean) => page.evaluate(({ year, seed, rain }) => {
    const { app, sim } = (window as any).__county
    app.newGame(year, seed)
    app.do({ t: 'begin' })
    const c = app.campaign
    const step = () => {
      for (const a of sim.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
      return app.do({ t: 'day' }).ok
    }
    while (c.phase === 'season' && c.season.day < 190) if (!step()) break
    const want = rain ? 'rain' : 'clear'
    for (let n = 0; n < 40 && sim.today(app.world, c).sky !== want; n++) step()
    ;(window as any).__countyField.settle()
    return `day ${c.season.day}, ${sim.today(app.world, c).sky}`
  }, { year, seed, rain })
  await measure(page, `July, strategic view (${await state(false)})`)
  await measure(page, `rain (${await state(true)})`)
  await page.evaluate(() => (window as any).__countyField.view({ frame: 'field', field: 5, x: 0.3, z: 0.52, dist: 12, yaw: -1.32, pitch: 0.13 }))
  await measure(page, 'rain, close along the rows', 3)
  console.log(errors.length ? `  page errors: ${errors.join(' | ')}` : '  no page errors')
  await page.close()
}
await browser.close()
