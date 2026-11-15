// The owner, 15 November: "You cant move around easily if zoomed in on a plot for example as the mouse cant get a
// handle and then also if you zoom in fast or zoom out fast there a noticeable hitch/stutter". Measured
// (tools/render/zoomhitch.ts): with the view close on a field, a drag begun in the upper half of the window did
// nothing at all, since there was no land near enough under the pointer to take hold of; and while the wheel ran, the
// field tags were put again at every step of the zoom, 25 to 55 ms a frame with a card or a telegram over the land.
import { test, type Page } from './base.ts'
import { expect, putAway, reach, startSeason, watchErrors } from './helpers.ts'

const camera = (page: Page) => page.evaluate(() => { const c = (globalThis as any).__countyField.stats().camera; return { x: c.x as number, z: c.z as number, dist: c.dist as number } })
// A point of bare land at a height of the window, the nearest to its middle.
const landAt = (page: Page, fy: number) => page.evaluate(fy => {
  const y = innerHeight * fy
  for (let d = 0; d < innerWidth / 2; d += 30) for (const x of [innerWidth / 2 + d, innerWidth / 2 - d]) if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y }
  return null
}, fy)
// The wheel run in over the middle of the first field, as far as the camera goes.
async function zoomIn(page: Page): Promise<void> {
  const mid = await page.evaluate(() => { const k = (globalThis as any).__countyField.corners(0) as { x: number; y: number }[]; return { x: k.reduce((t, p) => t + p.x, 0) / k.length, y: k.reduce((t, p) => t + p.y, 0) / k.length } })
  await page.mouse.move(mid.x, mid.y)
  for (let k = 0; k < 40; k++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(16) }
  await page.waitForTimeout(1200)
}

test('with the view close on a field, a drag begun anywhere on the land moves it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the mouse')
  const errors = watchErrors(page)
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.setSpeed(0); app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  await zoomIn(page)
  expect((await camera(page)).dist).toBeLessThan(12)
  // High in the window (the sky and the far land), in its middle, and low (the ground at the player's feet).
  for (const fy of [0.3, 0.45, 0.62, 0.8]) {
    const at = await landAt(page, fy)
    expect(at, `bare land ${fy * 100}% down the window`).not.toBeNull()
    const a = await camera(page)
    await page.mouse.move(at!.x, at!.y)
    await page.mouse.down()
    for (let k = 1; k <= 10; k++) { await page.mouse.move(at!.x - 16 * k, at!.y + 10 * k); await page.waitForTimeout(24) }
    await page.waitForTimeout(150)
    await page.mouse.up()
    await page.waitForTimeout(600)
    const b = await camera(page)
    const moved = Math.hypot(b.x - a.x, b.z - a.z)
    expect(moved, `a drag begun ${fy * 100}% down the window: metres the land moved`).toBeGreaterThan(0.8)
    // (and never thrown: a hand's travel of 190 px does not carry the view more than a few times its own distance)
    expect(moved, `a drag begun ${fy * 100}% down the window`).toBeLessThan(a.dist * 3)
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('the tags are put again once when a zoom comes to rest, not at every step of it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the wheel')
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await startSeason(page)
  // Someone's card open over the land: the tags keep clear of it, which is what made putting them dear.
  await reach(page, `const { app } = q.g(); app.setSpeed(0); app.select(-1); app.selectUnit(app.campaign.crew[0].id)`)
  await page.waitForTimeout(600)
  const settled = () => page.evaluate(() => parseInt(document.querySelector<HTMLElement>('#ui .plate-layer')?.dataset.settled ?? '0', 10) || 0)
  const at = (await landAt(page, 0.6))!
  await page.mouse.move(at.x, at.y)
  for (const dir of [-240, 240]) {
    await page.waitForTimeout(700)
    const before = await settled()
    for (let k = 0; k < 30; k++) { await page.mouse.wheel(0, dir); await page.waitForTimeout(16) }
    const during = await settled()
    expect(during - before, `tags put again while the wheel ran ${dir < 0 ? 'in' : 'out'} (the last: ${await page.evaluate(() => document.querySelector<HTMLElement>('#ui .plate-layer')?.dataset.settled)})`).toBeLessThanOrEqual(1)
    await page.waitForTimeout(1500)
    const after = await settled()
    expect(after - before, 'and once it came to rest').toBeGreaterThanOrEqual(1)
    expect(after - before).toBeLessThanOrEqual(3)
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('W, A, S and D move the view while no field is selected, and are a field\'s orders when one is', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the keyboard')
  const errors = watchErrors(page)
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.setSpeed(0); app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  const a = await camera(page)
  await page.keyboard.down('d')
  await page.waitForTimeout(500)
  await page.keyboard.up('d')
  await page.waitForTimeout(500)
  const b = await camera(page)
  expect(Math.hypot(b.x - a.x, b.z - a.z), 'metres the view moved under D').toBeGreaterThan(5)
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'Pick a field first' })).toHaveCount(0)
  // With a field in hand the letters are its orders: the view stays.
  // (by its number key: its tag may have gone off the window with the view)
  await page.keyboard.press('1')
  await expect(page.getByTestId('card-title')).toBeVisible()
  // (the view comes to the field first: it is still before the key is tried)
  let was = await camera(page)
  for (let k = 0; k < 20; k++) { await page.waitForTimeout(300); const now = await camera(page); if (Math.hypot(now.x - was.x, now.z - was.z) < 0.01) break; was = now }
  const c = await camera(page)
  await page.keyboard.down('a')
  await page.waitForTimeout(400)
  await page.keyboard.up('a')
  await page.waitForTimeout(400)
  const d = await camera(page)
  expect(Math.hypot(d.x - c.x, d.z - c.z), 'metres the view moved under A with a field selected').toBeLessThan(0.5)
  expect(errors, errors.join('\n')).toEqual([])
})
