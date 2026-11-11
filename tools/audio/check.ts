// Sound check in a headless browser (Chromium unless others are named):
// 1. renders every voice, bed, cue, change and scene through an OfflineAudioContext (src/audio/dev/render.html),
//    measures each, and fails on anything outside the plan in src/audio/dev/plan.ts: silence, peaks over the
//    ceiling, clicks, DC, loudness outside its window, an audible loop, a lopsided spectrum, a cue its bed covers;
// 2. loads the game, taps the live output, and checks the autoplay gate, settings, mute and hidden-tab fade.
// Usage: node tools/audio/check.ts [chromium] [firefox] [webkit] [--only=<case id prefix>]
// With --only, just the matching offline cases are rendered and judged (for work on one voice).
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit, type Page } from '@playwright/test'
import { createServer } from 'vite'
import { judge } from '../../src/audio/dev/plan.ts'
import { DEFAULT_VOLUME, PEAK_LIMIT, SILENT_PEAK, type Lab, type VoiceResult } from '../../src/audio/dev/report.ts'
import { text } from './table.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))
const failures: string[] = []
let engine = ''
const fail = (msg: string) => failures.push(`${engine}: ${msg}`)
const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf').padStart(6)

async function offline(page: Page): Promise<void> {
  page.on('pageerror', e => fail(`render page error: ${e.message}`))
  await page.goto(`${base}src/audio/dev/render.html`)
  await page.waitForFunction(() => '__lab' in window, null, { timeout: 60_000 })
  const self = only ? { fails: [], report: ['skipped'] } : await page.evaluate(() => (window as unknown as { __lab: Lab }).__lab.selfTest())
  for (const f of self.fails) fail(`self-test: ${f}`)
  const cases = await page.evaluate(() => (window as unknown as { __lab: Lab }).__lab.cases)
  const results: VoiceResult[] = []
  for (let i = 0; i < cases.length; i++) {
    if (only && !cases[i].id.startsWith(only)) continue
    results.push((await page.evaluate(k => (window as unknown as { __lab: Lab }).__lab.run(k, false), i)).result)
  }
  console.log(`\n${engine}\n\nThe instruments:\n${self.report.map(l => `  ${l}`).join('\n')}\n\nOffline renders, 48 kHz stereo, at the default volume:\n\n${text(results)}`)
  if (only) for (const r of results) console.log(`${r.name}: raw peak ${db(r.rawPeak)} dB, chain gain ${r.m.chain.gain.toFixed(1)} dB, peak ${r.m.chain.squash.toFixed(1)} dB against it, ${(r.cost * 100).toFixed(1)}% of real time to render`)
  for (const f of results.flatMap(judge)) fail(f)
}

// Wraps AudioContext so the test can find the game's context and tap what reaches the speakers.
const TAP = `
  window.__ctxs = []; window.__taps = [];
  const Orig = window.AudioContext;
  window.AudioContext = class extends Orig {
    constructor(...a) { super(...a); window.__ctxs.push(this); const an = this.createAnalyser(); an.fftSize = 2048; window.__taps.push(an) }
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) { const i = window.__ctxs.indexOf(this.context); if (i >= 0) connect.call(this, window.__taps[i]) }
    return connect.call(this, dest, ...rest);
  };
  window.__level = ms => new Promise(res => {
    const an = window.__taps[0]; const buf = new Float32Array(an.fftSize); let peak = 0, sum = 0, n = 0;
    const id = setInterval(() => { an.getFloatTimeDomainData(buf); for (const x of buf) { peak = Math.max(peak, Math.abs(x)); sum += x * x; n++ } }, 40);
    setTimeout(() => { clearInterval(id); res({ peak, rms: Math.sqrt(sum / Math.max(1, n)) }) }, ms);
  });
`

interface Level { peak: number; rms: number }

async function liveSmoke(page: Page): Promise<void> {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.addInitScript({ content: TAP })
  await page.goto(base)
  await page.waitForFunction(() => '__county' in window)
  console.log('\nLive engine in the game page:')

  const state = () => page.evaluate(() => {
    const w = window as unknown as { __ctxs: AudioContext[] }
    return w.__ctxs.map(c => c.state).join(',')
  })
  const level = (ms: number) => page.evaluate(m => (window as unknown as { __level(ms: number): Promise<Level> }).__level(m), ms)
  const run = (code: string) => page.evaluate(code)
  const expect = (what: string, ok: boolean, detail: string) => {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}: ${detail}`)
    if (!ok) fail(`live: ${what} (${detail})`)
  }

  await page.waitForTimeout(500)
  let s = await state()
  expect('no audio context before a gesture', s === '', `contexts [${s}]`)
  const vol = await run('window.__county.app.settings.volume') as number
  expect('a new player starts at the volume the plan was measured at', vol === DEFAULT_VOLUME, `setting ${vol}, plan ${DEFAULT_VOLUME}`)

  await page.mouse.click(600, 20)
  await page.waitForTimeout(400)
  s = await state()
  expect('one running context after the first click', s === 'running', `contexts [${s}]`)

  await page.waitForTimeout(3500)
  let l = await level(3000)
  expect('title bed is audible and under the ceiling', l.peak > SILENT_PEAK && l.peak <= PEAK_LIMIT, `peak ${db(l.peak)} dB, rms ${db(l.rms)} dB`)

  await run(`(() => {
    const { app } = window.__county
    app.setSetting('autoPause', false)
    const years = app.startYears()
    app.newGame(years[Math.floor(years.length / 2)], 7)
    app.do({ t: 'begin' })
    for (let i = 0; i < 6; i++) app.do({ t: 'job', kind: 'plant', field: i })
    for (let i = 0; i < 6; i++) app.do({ t: 'job', kind: 'hill', field: i })
    window.__start = app.campaign.season.day
    window.__workedFrames = 0
    window.__sampler = setInterval(() => { if (app.speed > 0 && app.campaign.season.worked.length) window.__workedFrames++ }, 100)
    app.setSpeed(2)
  })()`)
  l = await level(4000)
  const prog = await run(`(() => { clearInterval(window.__sampler); const s = window.__county.app.campaign.season
    return 'days ' + window.__start + ' to ' + s.day + ', farmer working in ' + window.__workedFrames + ' of ~40 samples, ' + s.log.filter(e => e.type === 'planted').length + ' fields planted' })()`)
  expect('season with the farmer working is audible and under the ceiling', l.peak > SILENT_PEAK && l.peak <= PEAK_LIMIT, `peak ${db(l.peak)} dB, rms ${db(l.rms)} dB; ${prog}`)

  await run(`window.__county.app.setSpeed(0); window.__county.app.setSetting('volume', 0)`)
  await page.waitForTimeout(1500)
  l = await level(800)
  expect('volume 0 goes quiet', l.peak < 0.001, `peak ${db(l.peak)} dB`)
  await run(`window.__county.app.setSetting('volume', 0.6)`)

  await run(`window.__county.app.setSetting('sound', false)`)
  await page.waitForTimeout(1000)
  s = await state()
  expect('sound off suspends the context', s === 'suspended', `contexts [${s}]`)
  await run(`window.__county.app.setSetting('sound', true)`)
  await page.waitForTimeout(500)
  s = await state()
  expect('sound on resumes it', s === 'running', `contexts [${s}]`)

  await run(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))`)
  await page.waitForTimeout(1000)
  s = await state()
  expect('hidden tab fades out and suspends', s === 'suspended', `contexts [${s}]`)
  await run(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))`)
  await page.waitForTimeout(1200)
  l = await level(1000)
  s = await state()
  expect('visible again resumes and fades in', s === 'running' && l.peak > SILENT_PEAK, `contexts [${s}], peak ${db(l.peak)} dB`)

  expect('no page errors', errors.length === 0, errors.length ? errors.join(' | ') : 'none')
}

const server = await createServer({ root, configFile: false, logLevel: 'warn', server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } })
await server.listen()
const base = server.resolvedUrls!.local[0]
const ENGINES = { chromium, firefox, webkit }
const args = process.argv.slice(2)
const only = args.find(a => a.startsWith('--only='))?.slice(7) ?? ''
const names = args.filter(a => !a.startsWith('--'))

try {
  for (const name of names.length ? names : ['chromium']) {
    const type = ENGINES[name as keyof typeof ENGINES]
    if (!type) { failures.push(`unknown browser ${name}`); continue }
    engine = name
    const browser = await type.launch()
    try {
      await offline(await browser.newPage())
      if (!only) await liveSmoke(await browser.newPage())
    } finally {
      await browser.close()
    }
  }
} finally {
  await server.close()
}

if (failures.length) {
  console.log(`\nFAIL (${failures.length})`)
  for (const f of failures) console.log(`  ${f}`)
  process.exitCode = 1
} else {
  console.log('\nPASS')
}
