// Renders every voice, cue, change and scene to a WAV, a spectrogram and a row of measurements.
// Usage: node tools/audio/render.ts <output folder> [case id prefix ...]
// Writes <n>-<id>.wav, <n>-<id>.png (and -zoom.png where a close-up helps), small/<id>.png, metrics.json,
// table.txt, table.md, features.txt, failures.txt and (for a full run) instruments.txt, compared.json, compared.md
// and cues.md. tools/audio/sheet.ts puts the Markdown into docs/quality/sound.md.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { judge, judgeCompared } from '../../src/audio/dev/plan.ts'
import type { Compared, Lab, Rendered, VoiceResult } from '../../src/audio/dev/report.ts'
import { CUE_LEGEND, LEGEND, comparedText, cueSheet, markdown, text } from './table.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))
const [outArg, ...only] = process.argv.slice(2)
if (!outArg) {
  console.error('usage: node tools/audio/render.ts <output folder> [case id prefix ...]')
  process.exit(2)
}
const out = resolve(outArg)
mkdirSync(join(out, 'small'), { recursive: true })

const server = await createServer({ root, configFile: false, logLevel: 'warn', server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } })
await server.listen()
const browser = await chromium.launch()
const results: VoiceResult[] = []
const features: string[] = []
let compared: Compared | null = null
const image = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')

try {
  const page = await browser.newPage()
  page.on('pageerror', e => { console.error(`page error: ${e.message}`); process.exitCode = 1 })
  await page.goto(`${server.resolvedUrls!.local[0]}src/audio/dev/render.html`)
  await page.waitForFunction(() => '__lab' in window, null, { timeout: 60_000 })
  const cases = await page.evaluate(() => (window as unknown as { __lab: Lab }).__lab.cases)
  if (!only.length) {
    const self = await page.evaluate(() => (window as unknown as { __lab: Lab }).__lab.selfTest())
    writeFileSync(join(out, 'instruments.txt'), `${[...self.report, ...self.fails.map(f => `FAIL ${f}`)].join('\n')}\n`)
    console.log(self.report.join('\n'))
    for (const f of self.fails) { console.error(`self-test: ${f}`); process.exitCode = 1 }
  }
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    if (only.length && !only.some(p => c.id.startsWith(p))) continue
    const r = await page.evaluate(k => (window as unknown as { __lab: Lab }).__lab.run(k, true), i) as Rendered
    const stem = `${String(i + 1).padStart(2, '0')}-${c.id}`
    writeFileSync(join(out, `${stem}.wav`), Buffer.from(r.wav, 'base64'))
    writeFileSync(join(out, `${stem}.png`), image(r.png))
    writeFileSync(join(out, 'small', `${c.id}.png`), image(r.small))
    if (r.zoom) writeFileSync(join(out, `${stem}-zoom.png`), image(r.zoom))
    results.push(r.result)
    if (r.result.features.length) features.push(`${c.name}\n${r.result.features.map(l => `  ${l}`).join('\n')}`)
    console.log(`${stem}  ${r.result.m.lufs.toFixed(1)} LUFS`)
  }
  if (!only.length) compared = await page.evaluate(() => (window as unknown as { __lab: Lab }).__lab.compare())
} finally {
  await browser.close()
  await server.close()
}

writeFileSync(join(out, 'metrics.json'), JSON.stringify(results, null, 1))
writeFileSync(join(out, 'table.txt'), `${text(results)}\n\n${LEGEND}\n`)
writeFileSync(join(out, 'table.md'), `${markdown(results)}\n\n${LEGEND}\n`)
writeFileSync(join(out, 'features.txt'), `${features.join('\n\n')}\n`)
const failures = results.flatMap(judge)
if (compared) {
  failures.push(...judgeCompared(compared))
  writeFileSync(join(out, 'compared.json'), JSON.stringify(compared, null, 1))
  writeFileSync(join(out, 'compared.md'), `${comparedText(compared, true)}\n`)
  writeFileSync(join(out, 'cues.md'), `${cueSheet(results, compared)}\n\n${CUE_LEGEND}\n`)
  console.log(`\n${comparedText(compared, false)}`)
}
writeFileSync(join(out, 'failures.txt'), failures.length ? `${failures.join('\n')}\n` : 'none\n')
console.log(`\n${text(results)}\n\n${features.join('\n\n')}\n\nOutside the plan (${failures.length}):\n${failures.map(f => `  ${f}`).join('\n')}\n\nWritten to ${out}`)
