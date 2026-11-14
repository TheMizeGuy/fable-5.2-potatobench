// How the land answers the hand: a left-drag and a right-drag carried out a frame at a time, with where a corner of a
// field stood on the screen after each frame. A drag is held to this: the ground taken hold of stays under the
// pointer (within a few pixels), it stops within a frame of the hand stopping, a slow release leaves it where it was
// put and a flick lets it glide on and come to rest; a right-drag turns and tips the view and stops as cleanly; and no
// frame of either is late.
// Usage: node tools/render/drag.ts <url> [--size=1512x982]
import { chromium, type Page } from '@playwright/test'
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
// The land is taken hold of at rest: whatever move the season opened with has ended.
const moving = () => page.evaluate(() => (globalThis as unknown as { __countyField: { rig: { moving(): boolean } } }).__countyField.rig.moving())
const rest = async (what: string) => { const t0 = Date.now(); while (await moving()) { if (Date.now() - t0 > 15000) throw new Error(`the camera never came to rest ${what}`); await page.waitForTimeout(100) } return Date.now() - t0 }
await page.waitForTimeout(1500)
await rest('after the season opened')

type Pt = { x: number; y: number }
// One frame of the page, then where the field's corner stands and how long the frame took to come.
const frame = (p: Page, field: number) => p.evaluate(i => new Promise<{ x: number; y: number; gap: number }>(done => {
  const t0 = performance.now()
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const k = (globalThis as unknown as { __countyField: { corners(i: number): { x: number; y: number }[] } }).__countyField.corners(Math.floor(i / 4))[i % 4]
    done({ x: k.x, y: k.y, gap: (performance.now() - t0) / 2 })
  }))
}), field)
// A corner of a field that is on the land, clear of the boards: the point the hand takes hold of.
const grip = await page.evaluate(() => {
  const f = (globalThis as unknown as { __countyField: { corners(i: number): { x: number; y: number; visible: boolean }[] } }).__countyField
  let best: { i: number; x: number; y: number; d: number } | null = null
  for (const i of [3, 1, 2, 0, 4, 5]) for (let n = 0; n < 4; n++) {
    const k = f.corners(i)[n]
    if (!k || !k.visible || k.x < innerWidth * 0.2 || k.x > innerWidth * 0.8 || k.y < innerHeight * 0.3 || k.y > innerHeight * 0.85) continue
    if (document.elementFromPoint(k.x, k.y)?.tagName !== 'CANVAS') continue
    const d = Math.hypot(k.x - innerWidth / 2, k.y - innerHeight * 0.6)
    if (!best || d < best.d) best = { i: i * 4 + n, x: k.x, y: k.y, d }
  }
  return best
})
if (!grip) throw new Error('no corner of a field stands clear on the land')
type Hooks = { groundUnder(x: number, y: number): { x: number; z: number } | null; screenOf(x: number, z: number): Pt; home(): void }
// Open land with room to the right and above: clear of every tag and board.
const openLand = () => page.evaluate(() => {
  const clear = (x: number, y: number) => document.elementFromPoint(x, y)?.tagName === 'CANVAS'
  for (let fy = 0.5; fy < 0.8; fy += 0.03) for (let fx = 0.3; fx < 0.6; fx += 0.03) {
    const x = innerWidth * fx, y = innerHeight * fy
    if (clear(x, y) && clear(x + 150, y - 40) && clear(x + 310, y - 100) && clear(x + 280, y)) return { x, y }
  }
  return { x: innerWidth / 2, y: innerHeight * 0.6 }
})
const groundUnder = (p: Pt) => page.evaluate(([x, y]) => (globalThis as unknown as { __countyField: Hooks }).__countyField.groundUnder(x, y), [p.x, p.y])
// One frame, then where a point of the ground stands on the screen.
const seen = (g: { x: number; z: number }) => page.evaluate(p => new Promise<Pt>(done => requestAnimationFrame(() => requestAnimationFrame(() => done((globalThis as unknown as { __countyField: Hooks }).__countyField.screenOf(p.x, p.z))))), g)
let bad = 0
const say = (ok: boolean, text: string) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`) }

// A left-drag: out along a curve, a stop with the button still down, then let go.
{
  // (where the corner stands now, read after a frame: the pointer rests on it before the press)
  await page.mouse.move(grip.x, grip.y)
  for (let k = 0; k < 3; k++) { const now = await frame(page, grip.i); grip.x = now.x; grip.y = now.y; await page.mouse.move(grip.x, grip.y) }
  await page.waitForTimeout(300)
  await rest('with the pointer over the land')
  { const now = await frame(page, grip.i); grip.x = now.x; grip.y = now.y; await page.mouse.move(grip.x, grip.y) }
  const at: Pt = { x: grip.x, y: grip.y }
  // The very point of ground under the pointer, and where it stands on the screen after each frame.
  const held0 = await page.evaluate(([x, y]) => (globalThis as unknown as { __countyField: { groundUnder(x: number, y: number): { x: number; z: number } | null } }).__countyField.groundUnder(x, y), [grip.x, grip.y])
  const spot = () => page.evaluate(p => (globalThis as unknown as { __countyField: { screenOf(x: number, z: number): { x: number; y: number } } }).__countyField.screenOf(p!.x, p!.z), held0)
  await page.mouse.down()
  const errs: number[] = [], gaps: number[] = []
  for (let k = 1; k <= 70; k++) {
    const u = k / 70
    const to = { x: grip.x - 260 * Math.sin(u * Math.PI / 2) + 40 * Math.sin(u * Math.PI * 2), y: grip.y - 120 * u }
    await page.mouse.move(to.x, to.y)
    const s = await frame(page, grip.i)
    gaps.push(s.gap)
    const g = held0 ? await spot() : s
    if (k > 3) errs.push(Math.hypot(g.x - to.x, g.y - to.y))
    Object.assign(at, to)
  }
  errs.sort((a, b) => a - b)
  say(errs[errs.length - 1] <= 6, `left-drag: the ground taken hold of stays under the pointer: within ${errs[errs.length - 1].toFixed(1)} px at worst, ${errs[Math.floor(errs.length / 2)].toFixed(1)} px in the middle`)
  // The hand stops with the button down: so does the land, at once.
  const held: Pt[] = []
  for (let k = 0; k < 8; k++) held.push(await frame(page, grip.i))
  const drift = Math.max(...held.map(s => Math.hypot(s.x - held[0].x, s.y - held[0].y)))
  say(drift <= 1, `left-drag: the hand stops and the land stops with it: ${drift.toFixed(2)} px of drift over eight frames`)
  await page.mouse.up()
  const after: Pt[] = []
  for (let k = 0; k < 20; k++) after.push(await frame(page, grip.i))
  const slid = Math.hypot(after[after.length - 1].x - held[held.length - 1].x, after[after.length - 1].y - held[held.length - 1].y)
  say(slid <= 1.5, `left-drag: let go at rest, the land stays where it was put: moved ${slid.toFixed(2)} px after`)
  gaps.sort((a, b) => a - b)
  say(gaps[gaps.length - 1] < 34, `left-drag: frames ${gaps[Math.floor(gaps.length / 2)].toFixed(1)} ms in the middle, ${gaps[gaps.length - 1].toFixed(1)} ms at worst`)
}

// A flick: let go while still moving, and the land glides on a little and comes to rest.
{
  const c = await openLand()
  await page.mouse.move(c.x, c.y)
  const g = await groundUnder(c)
  if (!g) throw new Error('no ground under the open land')
  await page.mouse.down()
  for (let k = 1; k <= 12; k++) { await page.mouse.move(c.x + k * 22, c.y); await seen(g) }
  const atUp = await seen(g)
  say(Math.hypot(atUp.x - (c.x + 264), atUp.y - c.y) <= 2, `flick: the land is under the hand as it lets go (${Math.hypot(atUp.x - (c.x + 264), atUp.y - c.y).toFixed(1)} px off)`)
  await page.mouse.up()
  const after: Pt[] = [atUp]
  for (let k = 0; k < 45; k++) after.push(await seen(g))
  const last = after[after.length - 1]
  const glide = Math.hypot(last.x - atUp.x, last.y - atUp.y)
  const tail = Math.hypot(last.x - after[after.length - 6].x, last.y - after[after.length - 6].y)
  const steps = after.slice(1).map((s, i) => Math.hypot(s.x - after[i].x, s.y - after[i].y))
  const rises = steps.slice(1).filter((s, i) => s > steps[i] + 0.6).length
  say(glide > 8 && glide < 400 && last.x > atUp.x, `flick: the land glides on ${glide.toFixed(0)} px the way it was going after the hand lets go (first steps ${steps.slice(0, 4).map(n => n.toFixed(1)).join(', ')} px)`)
  say(tail < 1 && rises === 0, `flick: it slows evenly to rest (${tail.toFixed(2)} px over the last five frames, ${rises} frames faster than the one before)`)
}

// Pressed while the camera is on its way somewhere: the land stops under the hand at once, and is carried from there.
{
  await page.evaluate(() => (globalThis as unknown as { __countyField: Hooks }).__countyField.home())
  await page.waitForTimeout(250)
  const was = await moving()
  const c = await openLand()
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  const g = await groundUnder(c)
  if (!g) throw new Error('no ground under the open land')
  const still: Pt[] = []
  for (let k = 0; k < 6; k++) still.push(await seen(g))
  const drift = Math.max(...still.map(s => Math.hypot(s.x - still[0].x, s.y - still[0].y)))
  say(was && drift <= 1, `press in mid-move: the land stops under the hand (${was ? 'it was moving' : 'IT WAS NOT MOVING'}; ${drift.toFixed(2)} px of drift over six frames)`)
  let worst = 0
  for (let k = 1; k <= 30; k++) {
    const to = { x: c.x + k * 6, y: c.y + k * 2 }
    await page.mouse.move(to.x, to.y)
    const s = await seen(g)
    if (k > 2) worst = Math.max(worst, Math.hypot(s.x - to.x - (still[5].x - c.x), s.y - to.y - (still[5].y - c.y)))
  }
  say(worst <= 6, `press in mid-move: carried from there, the ground stays with the pointer (within ${worst.toFixed(1)} px)`)
  await page.mouse.up()
  await page.waitForTimeout(400)
}

// A right-drag: turn and tip, a stop with the button down, let go.
{
  // Begun on open land, clear of every tag and board.
  const c = await openLand()
  await page.mouse.move(c.x, c.y)
  const start = await frame(page, grip.i)
  await page.mouse.down({ button: 'right' })
  const steps: number[] = [], gaps: number[] = []
  let last = start
  for (let k = 1; k <= 60; k++) {
    await page.mouse.move(c.x + k * 5, c.y - k * 1.5)
    const s = await frame(page, grip.i)
    gaps.push(s.gap)
    if (k > 3) steps.push(Math.hypot(s.x - last.x, s.y - last.y))
    last = s
  }
  const turned = Math.hypot(last.x - start.x, last.y - start.y)
  // An even hand gives an even turn: no frame's step is far from its neighbours'.
  const jumps = steps.slice(1).filter((s, i) => Math.abs(s - steps[i]) > Math.max(3, steps[i] * 0.6)).length
  say(turned > 60, `right-drag: the view turns and tips with the hand (the corner moved ${turned.toFixed(0)} px across the screen)`)
  say(jumps === 0, `right-drag: it turns evenly: ${jumps} of ${steps.length} frames stepped far from the one before`)
  const held: Pt[] = []
  for (let k = 0; k < 8; k++) held.push(await frame(page, grip.i))
  const drift = Math.max(...held.map(s => Math.hypot(s.x - held[0].x, s.y - held[0].y)))
  say(drift <= 1, `right-drag: the hand stops and the view stops with it: ${drift.toFixed(2)} px of drift over eight frames`)
  await page.mouse.up({ button: 'right' })
  const after: Pt[] = []
  for (let k = 0; k < 20; k++) after.push(await frame(page, grip.i))
  const slid = Math.hypot(after[after.length - 1].x - held[held.length - 1].x, after[after.length - 1].y - held[held.length - 1].y)
  say(slid <= 1.5, `right-drag: let go at rest, the view stays as it was left: moved ${slid.toFixed(2)} px after`)
  gaps.sort((a, b) => a - b)
  say(gaps[gaps.length - 1] < 34, `right-drag: frames ${gaps[Math.floor(gaps.length / 2)].toFixed(1)} ms in the middle, ${gaps[gaps.length - 1].toFixed(1)} ms at worst`)
  // Tipped back the other way, the view comes back.
  await page.mouse.move(c.x + 300, c.y - 90)
  await page.mouse.down({ button: 'right' })
  for (let k = 1; k <= 60; k++) { await page.mouse.move(c.x + 300 - k * 5, c.y - 90 + k * 1.5); await frame(page, grip.i) }
  await page.mouse.up({ button: 'right' })
  let back = await frame(page, grip.i)
  for (let k = 0; k < 20; k++) back = await frame(page, grip.i)
  const off = Math.hypot(back.x - start.x, back.y - start.y)
  say(off <= 4, `right-drag: turned back by the same path, the view is where it began: ${off.toFixed(1)} px off`)
}
say(errors.length === 0, `${errors.length} page errors${errors.length ? `: ${errors[0]}` : ''}`)
await browser.close()
if (bad) process.exitCode = 1
