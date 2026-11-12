// Reports which GPU headless Chromium draws the game on here, the frame rate, and the quality tier the game starts at
// when left to choose and the one it has settled on after a quarter of a minute of the opening.
// Usage: node tools/quality/gpu.ts <base url> [width] [height] [seconds]
import { chromium } from '@playwright/test'
import { GPU } from './shared.ts'

const [base, w = '1440', h = '900', seconds = '15'] = process.argv.slice(2)
if (!base) throw new Error('usage: gpu.ts <base url> [width] [height]')
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } })
const t0 = Date.now()
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis)
const out = await page.evaluate(ms => new Promise(resolve => {
  const gl = document.createElement('canvas').getContext('webgl2')
  const ext = gl?.getExtension('WEBGL_debug_renderer_info')
  const renderer = gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'webgl2') : 'none'
  const times: number[] = []
  let last = performance.now()
  const start = last
  const tick = (now: number) => {
    times.push(now - last); last = now
    if (now - start < ms) requestAnimationFrame(tick)
    else {
      const late = times.slice(Math.floor(times.length / 2)).sort((a, b) => a - b)
      const s = (globalThis as any).__countyField?.stats?.() ?? {}
      resolve({ renderer, frames: times.length, medianMs: late[Math.floor(late.length / 2)], worstMs: late[late.length - 1], startedAt: s.startedAt, settledOn: s.tier, drawn: s.drawn })
    }
  }
  requestAnimationFrame(tick)
}), Number(seconds) * 1000)
console.log(JSON.stringify({ platform: process.platform, loadMs: Date.now() - t0 - Number(seconds) * 1000, size: `${w}x${h}`, ...(out as object) }))
await browser.close()
