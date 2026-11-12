// Where start-up goes, from the address to the first drawn frame, stage by stage, in a fresh browser each run (no
// shader kept from a visit before): the page and its script fetched and run, the simulation's world, each part of
// the scene built, the shaders compiled (which was ready when), the first frame, and every stretch the page's own
// thread was held for more than 50 ms. Several builds are run turn about, so that whatever else the machine is doing
// falls on each alike; how busy its processors were just before each run is given beside it.
//   --serial        the shaders compiled one at a time, each timed alone (slower in all; says which are dear);
//                   with --reverse, in the other order
//   --shots=<dir>   the picture 1 s, 3 s and 10 s after the address, for each build's first run
// Usage: node tools/render/startup.ts <url> [<url> ...] [--runs=3] [--serial] [--shots=<dir>]
import { mkdirSync } from 'node:fs'
import { cpus } from 'node:os'
import { chromium } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const urls = process.argv.slice(2).filter(a => !a.startsWith('--'))
const opt = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const runs = Number(opt('runs') ?? 3)
const serial = process.argv.includes('--serial'), reverse = process.argv.includes('--reverse')
const shots = opt('shots')
if (shots) mkdirSync(shots, { recursive: true })

// How busy the machine's processors are, over half a second (1: every one of them at work).
async function busy(): Promise<number> {
  const read = () => cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { idle: a.idle + c.times.idle, all: a.all + t } }, { idle: 0, all: 0 })
  const a = read()
  await new Promise(r => setTimeout(r, 500))
  const b = read()
  return 1 - (b.idle - a.idle) / Math.max(1, b.all - a.all)
}

const WATCH = `(() => {
  const held = window.__held = []
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) held.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true }) } catch {}
})()`

interface Run {
  first: number; wall: number; busy: number
  marks: [string, number][]; built: [string, number][]; began: number; shaders: [string, number][]; firstDraw: number[]
  fetched: number; script: { name: string; end: number; kb: number }[]; held: [number, number][]; ready: number; errors: string[]
}

async function one(url: string, name: string, shoot: boolean): Promise<Run> {
  const load = await busy()
  const browser = await chromium.launch({ args: GPU })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript({ content: WATCH })
  const t0 = Date.now()
  const going = page.goto(serial ? `${url}${url.includes('?') ? '&' : '?'}compile=serial${reverse ? '&reverse' : ''}` : url, { timeout: 120000 })
  if (shoot && shots) {
    for (const s of [1, 3, 10]) {
      await new Promise(r => setTimeout(r, Math.max(0, t0 + s * 1000 - Date.now())))
      await page.screenshot({ path: `${shots}/${name}-${s}s.png` }).catch(() => {})
    }
  }
  await going
  await page.waitForFunction(() => ((globalThis as any).__countyField?.stats?.().firstFrame ?? 0) > 0, null, { timeout: 120000, polling: 50 })
  const wall = Date.now() - t0
  // When the farm is whole (everything built and its shaders ready), where the build says so.
  const ready = await page.evaluate(async () => {
    const f = (globalThis as any).__countyField
    if (!f.whole) return -1
    await f.whole
    return performance.now()
  })
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => {
    const s = (globalThis as any).__countyField.stats()
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return {
      first: s.firstFrame as number, built: (s.built ?? []) as [string, number][], began: (s.began ?? 0) as number, shaders: (s.shadersAt ?? []) as [string, number][], firstDraw: (s.firstDraw ?? [0, 0]) as number[],
      marks: performance.getEntriesByType('mark').filter(m => m.name.startsWith('county:')).map(m => [m.name.slice(7), m.startTime] as [string, number]),
      fetched: nav ? nav.responseEnd : 0,
      script: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(e => /\.(js|ts)(\?|$)/.test(e.name)).map(e => ({ name: e.name.split('/').pop() ?? '', end: e.responseEnd, kb: e.encodedBodySize / 1024 })),
      held: ((globalThis as any).__held ?? []) as [number, number][],
    }
  })
  await browser.close()
  return { ...r, wall, busy: load, ready, errors }
}

const ms = (x: number) => `${Math.round(x)}`.padStart(6)
function show(name: string, r: Run): void {
  console.log(`  ${name}: first frame ${(r.first / 1000).toFixed(2)} s on the page's clock, ${(r.wall / 1000).toFixed(2)} s from the address${r.ready > 0 ? `; the farm whole at ${(r.ready / 1000).toFixed(2)} s` : ''}; processors ${(r.busy * 100).toFixed(0)}% busy before it${r.errors.length ? `; page errors: ${r.errors.join(' | ')}` : ''}`)
  const rows: [string, number][] = [['the page fetched', r.fetched]]
  for (const s of r.script) rows.push([`script ${s.name} fetched (${s.kb.toFixed(0)} KB)`, s.end])
  for (const [n, t] of r.marks) rows.push([n === 'script' ? 'script run to its start' : n === 'world' ? "the simulation's world made" : n === 'app' ? 'the game made' : n === 'view' ? 'the scene built (all below)' : n === 'interface' ? 'sound and the interface mounted' : n, t])
  for (const [n, t] of r.built) rows.push([`  scene: ${n}`, r.began + t])
  rows.push(['the first frame drawn', r.first])
  rows.sort((a, b) => a[1] - b[1])
  let was = 0
  for (const [n, t] of rows) { console.log(`    ${ms(t)} ms  (+${ms(t - was).trim()})  ${n}`); was = t }
  console.log(`    the first frame's own drawing ${r.firstDraw[0]} ms, ${r.firstDraw[1]} shaders by its end`)
  if (r.shaders.length) {
    const list = serial ? r.shaders.slice().sort((a, b) => b[1] - a[1]) : r.shaders.slice().sort((a, b) => a[1] - b[1])
    const total = serial ? r.shaders.reduce((a, s) => a + s[1], 0) : 0
    console.log(serial ? `    shaders, each compiled alone (${r.shaders.length} materials, ${total} ms in all):` : `    shaders, when each was ready (ms since the scene was begun; ${r.shaders.length} materials):`)
    // (in the order they were compiled when one at a time; the last dozen to be ready otherwise)
    for (const [n, t] of serial ? r.shaders.filter(s => s[1] >= 15) : list.slice(-12)) console.log(`      ${ms(t)} ms  ${n}`)
  }
  const held = r.held.filter(h => h[1] >= 50)
  console.log(`    the page's thread held for more than 50 ms: ${held.length ? held.map(([at, d]) => `${d} ms at ${at}`).join(', ') : 'never'}`)
}

const all: Run[][] = urls.map(() => [])
for (let k = 0; k < runs; k++) {
  for (let i = 0; i < urls.length; i++) {
    const r = await one(urls[i], `build${i + 1}`, k === 0)
    all[i].push(r)
    console.log(`run ${k + 1}, ${urls[i]}`)
    show(`build ${i + 1}`, r)
  }
}
console.log('first frame, seconds from the address (the page\'s clock in brackets):')
urls.forEach((u, i) => console.log(`  ${u}: ${all[i].map(r => `${(r.wall / 1000).toFixed(1)} (${(r.first / 1000).toFixed(1)})`).join(', ')}; quickest ${(Math.min(...all[i].map(r => r.first)) / 1000).toFixed(2)} s`))
