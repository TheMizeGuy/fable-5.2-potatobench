// What the people, machines and animals cost: a farm of twelve at spring work with three tractors and the truck, from
// the playing view and close up, at each quality tier, with them drawn and with them hidden.
// Usage: node tools/render/crewcost.ts <base-url> [--size=1920x1080]
import { chromium, type Page } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const base = process.argv[2] ?? 'http://localhost:5317/'
const sizeArg = process.argv.find(a => a.startsWith('--size='))
const [W, H] = (sizeArg ? sizeArg.slice(7) : '1920x1080').split('x').map(Number)

// Before the page runs: time every animation frame on the GPU where the extension exists (as tools/render/budget.ts does).
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
interface M { gpu: number; cpu: number; triangles: number; calls: number; crews: number; parts: number }

async function window1(page: Page): Promise<M> {
  await page.waitForTimeout(300)
  await page.evaluate(() => { const M = (window as any).__perf; M.gpu = []; M.cpu = []; M.on = true })
  await page.waitForTimeout(1200)
  const r = await page.evaluate(() => {
    const M = (window as any).__perf
    M.on = false
    const f = (window as any).__countyField, s = f.stats()
    return { gpu: M.gpu, cpu: M.cpu, triangles: s.triangles, calls: s.calls, crews: s.spent.crews, parts: f.info().parts }
  })
  return { ...r, gpu: median(r.gpu), cpu: median(r.cpu) }
}
// The GPU is shared: of a few windows, keep the quietest.
async function measure(page: Page): Promise<M> {
  let best = await window1(page)
  for (let k = 0; k < 3; k++) { const m = await window1(page); if (m.gpu < best.gpu) best = m }
  return best
}

const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
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
// Twelve people: three planting, rocks in two fields, felling in two tracts, brush, building; the day held at its middle.
const worked: string = await page.evaluate(() => {
  const { app, sim } = (window as any).__county
  app.newGame(1977, 5)
  const c = app.campaign
  c.cash = 900000
  const put = (kind: string, yard: number) => c.buildings.push({ id: c.nextBuilding++, kind, yard, done: 10, need: 10, built: true })
  put('bunk', -1); app.do({ t: 'rent', field: 10 }); put('bunk', -2); put('shed', -1)
  for (const u of ['tractor2', 'tractor3', 'truck']) app.do({ t: 'buy', upgrade: u })
  for (let k = 0; k < 11; k++) app.do({ t: 'hire', kind: 'hand' })
  for (const u of c.crew) for (const w of ['machine', 'field', 'woods', 'build', 'pack']) app.do({ t: 'priority', unit: u.id, work: w, level: 2 })
  app.do({ t: 'begin' })
  while (c.season.day < 139) app.do({ t: 'day' })
  const jobs: [string, number, number][] = [['plant', 0, 0], ['plant', 2, 1], ['plant', 4, 2], ['rocks', 1, 3], ['fell', 14, 4], ['brush', 5, 5], ['rocks', 3, 6], ['fell', 15, 7], ['fell', 14, 8]]
  for (const [kind, field, unit] of jobs) app.do({ t: 'job', kind, field, unit })
  app.do({ t: 'build', kind: 'packing', yard: -1 })
  void sim
  return `${c.crew.length} people`
})
const f = (fn: string, ...args: unknown[]) => page.evaluate(([fn, args]) => (window as any).__countyField[fn as string](...(args as unknown[])), [fn, args] as [string, unknown[]])
await f('settle')
await page.evaluate(() => { const { app } = (window as any).__county; app.do({ t: 'day' }); app.do({ t: 'day' }) })
await page.waitForTimeout(300)
const did: string = await page.evaluate(() => (window as any).__county.app.campaign.season.worked.map((w: any) => `${w.unit}:${w.kind}`).join(' '))
console.log(`${W}x${H}  ${worked}; the day's work: ${did}`)
const views: [string, () => Promise<void>][] = [
  ['playing view', async () => { await f('home') }],
  ['close on the farmer', async () => { const t = await page.evaluate(() => (window as any).__countyField.info().tractor); await f('view', { x: t.x, z: t.z, dist: 14, yaw: 0.9, pitch: 0.3 }) }],
]
for (const [label, set] of views) {
  for (const tier of ['high', 'medium', 'low']) {
    await page.evaluate(t => (window as any).__county.app.setSetting('quality', t), tier)
    await set()
    await page.waitForTimeout(900)
    await f('seek', 0.55, 0.004)
    await page.waitForTimeout(1500)
    const on = await measure(page)
    await f('show', 'crews', false)
    const off = await measure(page)
    await f('show', 'crews', true)
    console.log(`  ${label.padEnd(20)} ${tier.padEnd(6)} GPU ${on.gpu.toFixed(2)} ms (without them ${off.gpu.toFixed(2)})  CPU ${on.cpu.toFixed(2)} ms, of it their placing ${on.crews} ms  ${(on.triangles / 1e6).toFixed(2)}M triangles (${((on.triangles - off.triangles) / 1e3).toFixed(0)}k theirs)  ${on.calls} calls (${on.calls - off.calls} theirs)  ${on.parts} parts`)
  }
}
console.log(errors.length ? `  page errors: ${errors.join(' | ')}` : '  no page errors')
await browser.close()
