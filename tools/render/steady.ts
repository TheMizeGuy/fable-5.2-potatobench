// Whether the light holds still on the farmhouse while the camera moves. The house is seen from three distances and
// the land under it carried across the screen one pixel at a time; each picture is laid over the one before, moved
// back by that pixel, and what still differs between them is light that did not hold still: a pattern too fine for
// the picture breaking up, a shadow or a shade that crawls. The same is measured with parts of the lighting put out,
// to say which part it comes from.
// Usage: node tools/render/steady.ts <url> <out dir> [--size=1512x982] [--dists=70,190,420] [--only=name]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from '../quality/shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/steady'] = args.filter(a => !a.startsWith('--'))
const size = (args.find(a => a.startsWith('--size='))?.slice(7) ?? '1512x982').split('x').map(Number)
const dists = (args.find(a => a.startsWith('--dists='))?.slice(8) ?? '70,190,420').split(',').map(Number)
const only = args.find(a => a.startsWith('--only='))?.slice(7)
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: GPU })
const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const bench = await ctx.newPage()
await page.bringToFront()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.addInitScript(HELPER)
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })
await q(page, `q.start(1987, 3); q.run(q.day(7, 6)); const { app } = q.g(); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
await closeAll(page)
// The picture alone: the interface is put out of sight (the land still takes the pointer).
await page.addStyleTag({ content: '#ui, #ui * { visibility: hidden !important; transition: none !important; animation: none !important }' })
const hook = <T>(f: string) => page.evaluate(`(() => { const h = globalThis.__countyField; return ${f} })()`) as Promise<T>
const rest = async (ms = 1200) => { const t0 = Date.now(); while (await hook<boolean>('h.rig.moving()') && Date.now() - t0 < 15000) await page.waitForTimeout(100); await page.waitForTimeout(ms) }
const beat = () => page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
console.log(`quality ${await hook<string>('h.stats().tier')}`)

const W = 300, H = 230, STEPS = 20
// The land carried one pixel at a time; each picture against the one before it, moved back by that pixel.
async function crawl(name: string): Promise<number> {
  const foot = await hook<{ x: number; y: number }>('h.house(0)'), mid = await hook<{ x: number; y: number }>('h.house(3.5)')
  const clip = { x: Math.round(mid.x - W / 2), y: Math.round(mid.y - H * 0.55), width: W + STEPS + 2, height: H }
  await page.mouse.move(foot.x, foot.y)
  await page.mouse.down()
  // (the first move only takes hold)
  await page.mouse.move(foot.x + 8, foot.y)
  await beat()
  const shots: string[] = []
  for (let k = 0; k <= STEPS; k++) {
    await page.mouse.move(foot.x + 8 + k, foot.y)
    await beat()
    shots.push((await page.screenshot({ type: 'png', clip })).toString('base64'))
  }
  await page.mouse.up()
  await page.mouse.move(foot.x, foot.y + 200)
  const r = await bench.evaluate(async ([list, w, h]) => {
    const px: ImageData[] = []
    for (const b64 of list as string[]) {
      const i = new Image(); i.src = `data:image/png;base64,${b64}`; await i.decode()
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height
      const g = c.getContext('2d')!; g.drawImage(i, 0, 0); px.push(g.getImageData(0, 0, i.width, i.height))
    }
    const lum = (d: ImageData, x: number, y: number) => { const k = (y * d.width + x) * 4; return 0.3 * d.data[k] + 0.59 * d.data[k + 1] + 0.11 * d.data[k + 2] }
    const heat = new Float32Array((w as number) * (h as number))
    let sum = 0, n = 0, over = 0
    for (let k = 1; k < px.length; k++) for (let y = 0; y < (h as number); y++) for (let x = 0; x < (w as number); x++) {
      // the land moved k pixels to the right by picture k: the same point of it is at x + k
      const d = Math.abs(lum(px[k], x + k, y) - lum(px[k - 1], x + k - 1, y))
      sum += d; n++
      if (d > 12) over++
      heat[y * (w as number) + x] += d
    }
    const c = document.createElement('canvas'); c.width = (w as number) * 2; c.height = h as number
    const g = c.getContext('2d')!
    g.putImageData(px[0], 0, 0, 0, 0, w as number, h as number)
    const img = g.createImageData(w as number, h as number)
    for (let k = 0; k < heat.length; k++) { const v = heat[k] / (px.length - 1); img.data[k * 4] = Math.min(255, v * 16); img.data[k * 4 + 1] = Math.min(255, v * 5); img.data[k * 4 + 2] = 24; img.data[k * 4 + 3] = 255 }
    g.putImageData(img, w as number, 0)
    return { mean: sum / n, share: over / n, sheet: c.toDataURL('image/png').split(',')[1] }
  }, [shots, W, H])
  writeFileSync(`${out}/${name}.png`, Buffer.from(r.sheet, 'base64'))
  console.log(`  ${name.padEnd(26)} what does not hold still: ${r.mean.toFixed(2)} of 255 on average; ${(r.share * 100).toFixed(2)}% of points change by more than 12 from one picture to the next`)
  return r.mean
}

const variants: [string, string, string][] = [
  ['as it is', '', ''],
  ['no contact shade', 'h.force({ ao: false })', 'h.force({})'],
  ['no shadows', 'h.shadowsOn(false)', 'h.shadowsOn(true)'],
  ['no soft focus', 'h.force({ focus: false })', 'h.force({})'],
]
for (const d of dists) {
  console.log(`from ${d} m:`)
  for (const [name, on, off] of variants) {
    if (only && name.replace(/ /g, '-') !== only) continue
    await page.evaluate(x => (globalThis as unknown as { __countyField: { atHouse(d: number): void } }).__countyField.atHouse(x), d)
    if (on) await hook(on)
    await rest()
    await crawl(`${d}m ${name}`.replace(/ /g, '-'))
    if (off) await hook(off)
  }
}
console.log(`${errors.length} page errors${errors.length ? `: ${errors[0]}` : ''}`)
await browser.close()
