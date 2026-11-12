// Finds what throws a shade over the picture: from a view (by default the county tier tipped straight down, on a
// spring day), the colour of the picture's middle and of a band along its top with each part of the scene hidden in
// turn, with no shadows at all, and with one or another of the renderer's shortcuts off. Sunlit ground is warm (red
// over blue well above 1); ground in shade is blue.
// Usage: node tools/render/shade.ts <base-url> [--tier=county] [--level] [--summer]
import { chromium } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const base = process.argv[2] ?? 'http://localhost:5317/'
const tier = process.argv.find(a => a.startsWith('--tier='))?.slice(7) ?? 'county'
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(base)
await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0)
await page.evaluate(summer => {
  const { app } = (window as any).__county
  app.newGame(1977, 5); app.do({ t: 'begin' }); app.setSpeed(0)
  if (summer) while (app.campaign.season.day < 196) app.do({ t: 'day' })
}, process.argv.includes('--summer'))
await page.evaluate(([tier, level]) => {
  const f = (window as any).__countyField
  f.settle(); f.tier(tier)
  if (!level) f.rig.leanBy(1)
  f.settle()
}, [tier, process.argv.includes('--level')] as const)
await page.waitForTimeout(1200)

// The mean colour of two pieces of the picture, read from the canvas in the same turn as it is drawn.
const read = () => page.evaluate(() => {
  const f = (window as any).__countyField
  f.settle()
  const c = document.getElementById('field') as HTMLCanvasElement
  const d = document.createElement('canvas')
  d.width = c.width; d.height = c.height
  const g = d.getContext('2d')!
  g.drawImage(c, 0, 0)
  const mean = (x: number, y: number, w: number, h: number) => {
    const p = g.getImageData(Math.round(x * c.width), Math.round(y * c.height), Math.round(w * c.width), Math.round(h * c.height)).data
    let r = 0, gr = 0, b = 0
    for (let i = 0; i < p.length; i += 4) { r += p[i]; gr += p[i + 1]; b += p[i + 2] }
    const n = p.length / 4
    return [r / n, gr / n, b / n].map(v => Math.round(v))
  }
  const s = f.stats()
  return { middle: mean(0.3, 0.4, 0.3, 0.3), top: mean(0.35, 0.02, 0.3, 0.05), dist: Math.round(s.camera.dist), height: Math.round(s.camera.y) }
})
const say = (label: string, r: { middle: number[]; top: number[] }) =>
  console.log(`  ${label.padEnd(40)} middle ${r.middle.join(',').padEnd(12)} red/blue ${(r.middle[0] / Math.max(1, r.middle[2])).toFixed(2)}   top ${r.top.join(',').padEnd(12)} red/blue ${(r.top[0] / Math.max(1, r.top[2])).toFixed(2)}`)

const whole = await read()
console.log(`the ${tier} tier${process.argv.includes('--level') ? '' : ', tipped straight down'}: camera ${whole.dist} m off, ${whole.height} m up`)
say('everything', whole)
const f = (code: string) => page.evaluate(`(() => { const f = window.__countyField; ${code} })()`)
const trial = async (label: string, set: string, back: string) => { await f(set); say(label, await read()); await f(back) }
await trial('no shadows at all', 'f.shadowsOn(false)', 'f.shadowsOn(true)')
for (const k of [0, 1, 2]) {
  await trial(`the ${['fine', 'second', 'widest'][k]} shadow map drawn empty`, `f.emptyCascade(${k}, true)`, `f.emptyCascade(${k}, false)`)
}
await trial('no cards in the fine shadow', `f.tryWithout('cards', true)`, `f.tryWithout('cards', false)`)
const parts = await page.evaluate(() => (window as any).__countyField.parts()) as string[]
for (const n of parts) await trial(`without ${n}`, `f.show('${n}', false)`, `f.show('${n}', true)`)
console.log(errors.length ? `  page errors: ${errors.join(' | ')}` : '  no page errors')
await browser.close()
