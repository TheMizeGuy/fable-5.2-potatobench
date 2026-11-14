// Whether the picture of the farmhouse holds together when the view moves by less than one of its own points. The
// whole picture is shifted sideways (and then up) by half a point and by a whole one, with nothing else changed: no
// turn, no change of perspective, the wind and the clock held. A picture drawn soundly, shifted half a point, is half
// way between itself and itself shifted a whole point. Where it is not (a pattern finer than the picture broken into
// false stripes, a glint, a shade that depends on where the points of the picture fall) is what flickers and crawls
// as the camera is carried. Measured round the house by distance and hour; it asks nothing of the page but its
// camera, so it runs on any build.
// Usage: node tools/render/subpixel.ts <url> <out dir> [--size=1512x982] [--dists=45,70,120,190] [--hours=0.5,0.9]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from '../quality/shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/subpixel'] = args.filter(a => !a.startsWith('--'))
const size = (args.find(a => a.startsWith('--size='))?.slice(7) ?? '1512x982').split('x').map(Number)
const dists = (args.find(a => a.startsWith('--dists='))?.slice(8) ?? '45,70,120,190').split(',').map(Number)
const hours = (args.find(a => a.startsWith('--hours='))?.slice(8) ?? '0.5,0.9').split(',').map(Number)
// --dpr=2: a screen of twice the density, where the picture is drawn smaller than the screen and stretched over it.
const dpr = Number(args.find(a => a.startsWith('--dpr='))?.slice(6) ?? 1)
mkdirSync(out, { recursive: true })
// What is looked at: the farmhouse (src/render/layout.ts HOUSE) unless --at=x,z names another place, in metres
// (--at=-101,-255 is the near edge of the home woodlot: trees). With --at the crop is a fixed piece of the picture.
const at = args.find(a => a.startsWith('--at='))?.slice(5).split(',').map(Number)
const HOUSE = at ? { x: at[0], z: at[1] } : { x: 227.34, z: -34.42 }
const fixed = !!at

const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr })).newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.addInitScript(HELPER)
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })
await q(page, `q.start(1987, 3); q.run(q.day(7, 6)); const { app } = q.g(); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
await closeAll(page)
await page.addStyleTag({ content: '#ui, #ui * { visibility: hidden !important; transition: none !important; animation: none !important }' })
await page.waitForTimeout(1500)

type Result = { across: number; up: number; shareAcross: number; shareUp: number; same: number; sheet: string; crop: number[]; scale: number; tier: string; drawn: number[] }
const run = (dist: number, hour: number) => page.evaluate(async ([hx, hz, d, hr, fx]) => {
  type Rig = { complete(p: object): object; moveTo(p: object, still: boolean): void; offsetFor(vp: unknown): { x: number; y: number } }
  const h = (globalThis as unknown as { __countyField: { rig: Rig; screenOf(x: number, z: number, up?: number): { x: number; y: number }; settle(): void; tune(o: object): void; stats(): { drawn: number[]; width: number } } }).__countyField
  const canvas = document.getElementById('field') as HTMLCanvasElement
  const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
  h.tune({ hour: hr })
  h.rig.moveTo(h.rig.complete({ x: hx, z: hz, dist: d, pitch: 0.3 }), true)
  await wait(2500)
  // The picture shifted by so many of its own points: the camera's own way of making room for the boards is used.
  const own = Object.getPrototypeOf(h.rig).offsetFor as (vp: unknown) => { x: number; y: number }
  let nx = 0, ny = 0
  h.rig.offsetFor = vp => { const b = own.call(h.rig, vp); return { x: b.x + nx, y: b.y + ny } }
  const st = h.stats()
  const perCss = st.drawn[0] / canvas.clientWidth, onCanvas = canvas.width / st.drawn[0]
  h.settle()
  const foot = h.screenOf(hx, hz, 0), top = h.screenOf(hx, hz, 8)
  const tall = fx ? 200 : Math.max(24, Math.abs(foot.y - top.y)), s = canvas.width / canvas.clientWidth
  const cw = Math.round(Math.min(520, tall * 2.6) * s), ch = Math.round(Math.min(380, tall * 1.9) * s)
  const cx = Math.round((foot.x - Math.min(520, tall * 2.6) / 2) * s), cy = Math.round((top.y - tall * 0.45) * s)
  const pad = document.createElement('canvas'); pad.width = cw; pad.height = ch
  const pg = pad.getContext('2d', { willReadFrequently: true })!
  let first: ImageData | null = null
  const grab = (px: number, py: number): Float32Array => {
    nx = px / perCss; ny = py / perCss
    h.settle(); h.settle()
    pg.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch)
    const d0 = pg.getImageData(0, 0, cw, ch)
    first ??= d0
    const lum = new Float32Array(cw * ch)
    for (let i = 0; i < cw * ch; i++) lum[i] = 0.3 * d0.data[i * 4] + 0.59 * d0.data[i * 4 + 1] + 0.11 * d0.data[i * 4 + 2]
    return lum
  }
  // Where the picture is stretched over the screen, a shift is given in the screen's points and not the picture's:
  // one of the screen's is then a part of one of the picture's.
  const stretched = onCanvas > 1.05
  const unit = stretched ? 1 / onCanvas : 1
  const a = grab(0, 0), a2 = grab(0, 0), bx = grab((stretched ? 1 : 0.5) * unit, 0), c1 = grab((stretched ? 2 : 1) * unit, 0), by = grab(0, (stretched ? 1 : 0.5) * unit), c2 = grab(0, (stretched ? 2 : 1) * unit)
  h.rig.offsetFor = own
  nx = ny = 0
  const step = stretched ? 2 : 1
  const at = (f: Float32Array, x: number, y: number) => f[Math.max(0, Math.min(ch - 1, y)) * cw + Math.max(0, Math.min(cw - 1, x))]
  // Which way a whole point's shift carried the picture (it is the picture itself, moved by one point).
  const fit = (c: Float32Array, dx: number, dy: number) => { let e = 0, n = 0; for (let y = 4; y < ch - 4; y++) for (let x = 4; x < cw - 4; x++) { e += Math.abs(c[y * cw + x] - at(a, x - dx, y - dy)); n++ } return e / n }
  const wx = fit(c1, step, 0) < fit(c1, -step, 0) ? step : -step, wy = fit(c2, 0, step) < fit(c2, 0, -step) ? step : -step
  const heat = new Float32Array(cw * ch)
  const off = (b: Float32Array, dx: number, dy: number) => {
    let e = 0, over = 0, n = 0
    for (let y = 4; y < ch - 4; y++) for (let x = 4; x < cw - 4; x++) {
      // (stretched: the picture moved one point of the screen should be itself, moved one point)
      const v = stretched ? Math.abs(b[y * cw + x] - at(a, x - dx / 2, y - dy / 2)) : Math.abs(b[y * cw + x] - 0.5 * (a[y * cw + x] + at(a, x - dx, y - dy)))
      e += v; n++
      if (v > 8) over++
      heat[y * cw + x] += v
    }
    return { e: e / n, share: over / n }
  }
  const ax = off(bx, wx, 0), ay = off(by, 0, wy)
  let same = 0
  for (let i = 0; i < cw * ch; i++) same += Math.abs(a[i] - a2[i])
  const sheet = document.createElement('canvas'); sheet.width = cw * 2; sheet.height = ch
  const sg = sheet.getContext('2d')!
  if (first) sg.putImageData(first, 0, 0)
  const img = sg.createImageData(cw, ch)
  for (let i = 0; i < cw * ch; i++) { const v = heat[i] / 2; img.data[i * 4] = Math.min(255, v * 22); img.data[i * 4 + 1] = Math.min(255, v * 7); img.data[i * 4 + 2] = 24; img.data[i * 4 + 3] = 255 }
  sg.putImageData(img, cw, 0)
  return { across: ax.e, up: ay.e, shareAcross: ax.share, shareUp: ay.share, same: same / (cw * ch), sheet: sheet.toDataURL('image/png').split(',')[1], crop: [cw, ch], scale: onCanvas, tier: (st as unknown as { tier: string }).tier, drawn: st.drawn }
}, [HOUSE.x, HOUSE.z, dist, hour, fixed] as const) as Promise<Result>

let total = 0, n = 0
for (const hour of hours) for (const dist of dists) {
  const r = await run(dist, hour)
  writeFileSync(`${out}/h${hour}-${dist}m.png`, Buffer.from(r.sheet, 'base64'))
  total += (r.across + r.up) / 2; n++
  console.log(`hour ${String(hour).padEnd(4)} ${String(dist).padStart(3)} m: off by ${r.across.toFixed(2)} across and ${r.up.toFixed(2)} up, of 255; ${(r.shareAcross * 100).toFixed(2)}% and ${(r.shareUp * 100).toFixed(2)}% of points off by more than 8 (the same picture taken twice differs by ${r.same.toFixed(3)}; ${r.crop[0]} by ${r.crop[1]}${Math.abs(r.scale - 1) > 0.01 ? `; the picture is drawn ${r.drawn.join(' by ')}, 1/${r.scale.toFixed(2)} of the screen's points, and stretched: measured as the picture moved one screen point against itself` : ''}; quality ${r.tier})`)
}
console.log(`mean ${(total / n).toFixed(3)}; ${errors.length} page errors${errors.length ? `: ${errors[0]}` : ''}`)
await browser.close()
