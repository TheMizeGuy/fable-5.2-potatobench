// How the field tags behave while the camera moves: a pan, a zoom and a turn carried out a frame at a time, with where
// every tag stood against its own field after each frame. A tag is held to this: it goes with its field (it never
// jumps from one place beside it to another between two frames), it comes and goes by fading, never by popping, it
// stands on whole pixels once the camera is at rest, and no frame is late.
// Usage: node tools/render/labels.ts <url> [--size=1512x982]
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from '../quality/shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/'] = args.filter(a => !a.startsWith('--'))
const size = (args.find(a => a.startsWith('--size='))?.slice(7) ?? '1512x982').split('x').map(Number)

const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 })).newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.addInitScript(HELPER)
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })
await q(page, `q.start(1987, 3); q.run(q.day(6, 12)); const { app } = q.g(); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
await closeAll(page)
await page.waitForTimeout(1500)
const moving = () => page.evaluate(() => (globalThis as unknown as { __countyField: { rig: { moving(): boolean } } }).__countyField.rig.moving())
const rest = async () => { const t0 = Date.now(); while (await moving()) { if (Date.now() - t0 > 15000) throw new Error('the camera never came to rest'); await page.waitForTimeout(100) } await page.waitForTimeout(700) }
await rest()

type Seen = { i: number; x: number; y: number; ax: number; ay: number; op: number }
type Frame = { tags: Seen[]; gap: number; settled: string }
// Every frame the page draws is written down in the page itself, so none is missed between two of the tool's steps:
// every tag that can be seen, where its face stands, where its field's point is and how solid it is drawn.
await page.evaluate(() => {
  const g = globalThis as unknown as { __rec: { on: boolean; frames: Frame[] }; __countyField: { anchor(i: number): { x: number; y: number; visible: boolean } } }
  g.__rec = { on: false, frames: [] }
  let last = performance.now()
  const tick = () => {
    const t = performance.now()
    if (g.__rec.on) {
      const tags: Seen[] = []
      for (const wrap of document.querySelectorAll<HTMLElement>('.plate-layer .tag-wrap')) {
        const b = wrap.querySelector<HTMLElement>('.tag')
        const i = Number(b?.dataset.k?.slice(6))
        if (!b || !Number.isFinite(i) || wrap.hidden) continue
        const cs = getComputedStyle(wrap)
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        const r = b.getBoundingClientRect(), a = g.__countyField.anchor(i)
        tags.push({ i, x: r.left, y: r.top, ax: a.visible ? a.x : NaN, ay: a.visible ? a.y : NaN, op: Number(cs.opacity) })
      }
      g.__rec.frames.push({ tags, gap: t - last, settled: document.querySelector<HTMLElement>('.plate-layer')?.dataset.settled ?? '' })
    }
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const record = () => page.evaluate(() => { const r = (globalThis as unknown as { __rec: { on: boolean; frames: Frame[] } }).__rec; r.frames = []; r.on = true })
const recorded = () => page.evaluate(() => { const r = (globalThis as unknown as { __rec: { on: boolean; frames: Frame[] } }).__rec; r.on = false; return r.frames })
// One frame of the page.
const frame = () => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => done())))
const frames = async (n: number) => { for (let k = 0; k < n; k++) await frame() }
const openLand = () => page.evaluate(() => {
  const clear = (x: number, y: number) => document.elementFromPoint(x, y)?.tagName === 'CANVAS'
  for (let fy = 0.5; fy < 0.8; fy += 0.03) for (let fx = 0.3; fx < 0.6; fx += 0.03) {
    const x = innerWidth * fx, y = innerHeight * fy
    if (clear(x, y)) return { x, y }
  }
  return { x: innerWidth / 2, y: innerHeight * 0.6 }
})

let bad = 0
const say = (ok: boolean, text: string) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`) }

// What a run of frames shows of the tags. A tag goes with its field, or is held where it is (at the edge of the free
// land, for a field under the boards), or glides to another place beside it: a jump is a step in one frame that is
// none of those, further than a glide goes in a frame. And a tag comes and goes by fading: it is never there whole in
// one frame and absent in the next.
// (a glide of the longest kind, 130 px, reaches 16 px in a frame, and a little more while the land itself is zooming)
function read(name: string, frames: Frame[], hop = 24): void {
  let worst = 0, hops = 0, pops = 0, steps = 0, moved = 0, faint = 0, all = 0
  const movedBy = new Map<number, number>()
  const big: { d: number; say: string }[] = [], popped: string[] = []
  for (let k = 1; k < frames.length; k++) {
    const was = new Map(frames[k - 1].tags.map(t => [t.i, t])), now = new Map(frames[k].tags.map(t => [t.i, t]))
    all += now.size
    for (const [i, t] of now) {
      const p = was.get(i)
      if (!p) { if (t.op > 0.85) { pops++; popped.push(`${i} came at frame ${k}, drawn ${t.op.toFixed(2)} solid [${frames[k].settled.slice(0, 60)}]`) } continue }
      // A tag that is whole in one frame and faint in the next was taken from one place and is fading in at another.
      if (p.op > 0.9 && t.op < 0.5) { moved++; movedBy.set(i, (movedBy.get(i) ?? 0) + 1) }
      if (t.op < 0.95) faint++
      // (a tag still faint is coming or going: where it does so is not a move the eye follows)
      if (t.op < 0.5 || p.op < 0.5) continue
      // (across and up and down apart: a tag at the foot of the free land goes with its field across and is held up and down)
      const seen = Number.isFinite(t.ax) && Number.isFinite(p.ax)
      const ox = t.x - p.x, oy = t.y - p.y
      const rx = seen ? ox - (t.ax - p.ax) : ox, ry = seen ? oy - (t.ay - p.ay) : oy
      const d = Math.hypot(Math.min(Math.abs(ox), Math.abs(rx)), Math.min(Math.abs(oy), Math.abs(ry))), rel = Math.hypot(rx, ry)
      steps++
      if (d > worst) worst = d
      if (d > hop) { hops++; big.push({ d, say: `${i} stepped ${d.toFixed(0)} px at frame ${k} (${ox.toFixed(0)},${oy.toFixed(0)} on the screen; ${rx.toFixed(0)},${ry.toFixed(0)} against its field; before that ${(p.x - p.ax).toFixed(0)},${(p.y - p.ay).toFixed(0)} from it, drawn ${t.op.toFixed(2)}) [${frames[k].settled.slice(0, 70)}]` }) }
    }
    for (const [i, p] of was) if (!now.has(i) && p.op > 0.85) { pops++; popped.push(`${i} went at frame ${k}, drawn ${p.op.toFixed(2)} solid the frame before [${frames[k].settled.slice(0, 60)}]`) }
  }
  if (process.env.LABELS_DEBUG && big.length) {
    const top = big.sort((a, b) => b.d - a.d)[0]
    const [i, k] = [Number(top.say.split(' ')[0]), Number(/frame (\d+)/.exec(top.say)![1])]
    for (let n = Math.max(0, k - 6); n < Math.min(frames.length, k + 8); n++) { const t = frames[n].tags.find(x => x.i === i); console.log(`       dbg ${n} tag ${i}: ${t ? `${t.x.toFixed(1)},${t.y.toFixed(1)} field ${t.ax.toFixed(1)},${t.ay.toFixed(1)} op ${t.op.toFixed(2)}` : 'not there'} [${frames[n].settled.slice(0, 50)}]`) }
  }
  // (the first frame written down waited for the tool, not for the page)
  const late = frames.map((f, k) => ({ k, gap: f.gap })).slice(1).filter(f => f.gap > 34)
  if (late.length) console.log(`       late frames: ${late.slice(0, 8).map(f => `frame ${f.k} ${f.gap.toFixed(0)} ms`).join(', ')}`)
  const gaps = frames.slice(1).map(f => f.gap).sort((a, b) => a - b)
  const settles = new Set(frames.map(f => f.settled)).size - 1
  say(hops === 0, `${name}: no tag jumps: ${hops} of ${steps} steps were over ${hop} px that were neither with the field nor a tag held still (the largest ${worst.toFixed(1)} px); the tags were put again ${settles} times`)
  say(pops === 0, `${name}: tags come and go by fading: ${pops} came or went at full strength`)
  // A tag is whole nearly all the time it is there, and is seldom taken up and put down far off.
  say(moved <= 6 && faint <= all * 0.15, `${name}: tags stay whole: ${moved} times a tag was taken up and faded in elsewhere (${[...movedBy].map(([i, n]) => `tag ${i} ${n}`).join(', ') || 'none'}); a tag was faint in ${faint} of ${all} tag-frames`)
  for (const w of [...big.sort((a, b) => b.d - a.d).slice(0, 8).map(b => b.say), ...popped.slice(0, 6)]) console.log(`       ${w}`)
  // (the page is also writing every frame down for this tool, which costs it a little: one frame in a run may be a beat late)
  say(late.length <= 1 && gaps[gaps.length - 1] < 50, `${name}: ${frames.length} frames, ${gaps[Math.floor(gaps.length / 2)].toFixed(1)} ms in the middle, ${gaps[gaps.length - 1].toFixed(1)} ms at worst`)
}

// At rest every tag stands on whole pixels, so its letters are drawn sharp.
async function crisp(name: string): Promise<void> {
  await page.waitForTimeout(900)
  await record()
  await frames(2)
  const f = (await recorded()).at(-1)!
  const off = f.tags.filter(t => Math.abs(t.x - Math.round(t.x)) > 0.02 || Math.abs(t.y - Math.round(t.y)) > 0.02)
  say(off.length === 0, `${name}: at rest ${f.tags.length - off.length} of ${f.tags.length} tags stand on whole pixels${off.length ? ` (tag ${off[0].i} at ${off[0].x.toFixed(2)}, ${off[0].y.toFixed(2)})` : ''}`)
}

// A pan: the land carried a long way across and back.
{
  const c = await openLand()
  await page.mouse.move(c.x, c.y)
  await record()
  await page.mouse.down()
  for (let k = 1; k <= 180; k++) { await page.mouse.move(c.x - 420 * Math.sin((k / 180) * Math.PI), c.y - 80 * Math.sin((k / 180) * Math.PI * 2) - k / 2); await frame() }
  await page.mouse.up()
  await frames(40)
  read('pan', await recorded())
  await crisp('pan')
}

// A zoom: the wheel turned in, and out again past where it began, and back.
{
  const c = await openLand()
  await page.mouse.move(c.x, c.y)
  await record()
  for (let k = 0; k < 14; k++) { await page.mouse.wheel(0, -90); await frames(3) }
  for (let k = 0; k < 30; k++) { await page.mouse.wheel(0, 90); await frames(3) }
  for (let k = 0; k < 16; k++) { await page.mouse.wheel(0, -90); await frames(3) }
  await frames(50)
  read('zoom', await recorded())
  await page.evaluate(() => (globalThis as unknown as { __countyField: { home(): void } }).__countyField.home())
  await rest()
  await crisp('zoom')
}

// A turn: the view swung round with the right button and tipped.
{
  await page.evaluate(() => (globalThis as unknown as { __countyField: { home(): void } }).__countyField.home())
  await rest()
  const c = await openLand()
  await page.mouse.move(c.x, c.y)
  await record()
  await page.mouse.down({ button: 'right' })
  for (let k = 1; k <= 140; k++) { await page.mouse.move(c.x + k * 2, c.y - k * 0.6); await frame() }
  await page.mouse.up({ button: 'right' })
  await frames(40)
  read('turn', await recorded())
  await crisp('turn')
}
say(errors.length === 0, `${errors.length} page errors${errors.length ? `: ${errors[0]}` : ''}`)
await browser.close()
if (bad) process.exitCode = 1
