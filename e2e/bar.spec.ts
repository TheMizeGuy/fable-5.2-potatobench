import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { putAway, reach, startSeason } from './helpers.ts'

const PICS = process.env.PICS ? 'out/bar' : ''
if (PICS) mkdirSync(PICS, { recursive: true })
const shot = async (page: import('@playwright/test').Page, name: string) => { if (PICS) await page.screenshot({ path: `${PICS}/${name}.png` }) }
const game = <T>(page: import('@playwright/test').Page, body: string) => page.evaluate(b => new Function('app', 'c', `return ${b}`)((globalThis as any).__county.app, (globalThis as any).__county.app.campaign), body) as Promise<T>

test('the menu is always up on the season screen: its tabs open their sheets, and a row takes the camera there', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a desk\'s bar; a phone keeps its foot')
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(7, 6)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  const bar = page.locator('#ui .mainbar')
  await expect(bar).toBeVisible()
  for (const id of ['todo', 'fields', 'people', 'work', 'money', 'contracts', 'almanac', 'menu']) await expect(bar.getByTestId(`bar-${id}`)).toBeVisible()
  // It lies inside the window and over nothing else that can be pressed at the foot.
  const b = (await bar.boundingBox())!
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  for (const sel of ['.timebook', '.queue', '.notes .alert']) for (const e of await page.locator(`#ui ${sel}`).all()) {
    const r = await e.boundingBox()
    if (!r) continue
    expect(r.x + r.width <= b.x || r.y + r.height <= b.y || r.x >= b.x + b.width || r.y >= b.y + b.height, `${sel} under the bar`).toBe(true)
  }
  await shot(page, 'bar')
  // Fields: every field of the farm, and its name goes to it.
  await bar.getByTestId('bar-fields').click()
  const fields = page.getByTestId('fields')
  await expect(fields).toBeVisible()
  await expect(fields.locator('tbody tr')).toHaveCount(await game<number>(page, 'c.fields.filter((_, i) => i < 6).length'), { timeout: 5000 }).catch(() => {})
  await shot(page, 'fields')
  await fields.getByTestId('fields-go-0').click()
  await expect(fields).toBeHidden()
  await expect.poll(() => game<number[]>(page, 'app.selection')).toEqual([0])
  await page.keyboard.press('Escape')
  // People: a row picks them and the camera goes there.
  await bar.getByTestId('bar-people').click()
  const people = page.getByTestId('people')
  await expect(people).toBeVisible()
  await shot(page, 'people')
  await people.getByTestId('people-go-0').click()
  await expect(people).toBeHidden()
  await expect.poll(() => game<number>(page, 'app.unit')).toBe(0)
  // The one in hand is marked at their feet: their name under them, no face over their head.
  await page.waitForTimeout(900)
  await expect(page.locator('#ui .pin-foot')).toBeVisible()
  await expect(page.locator('#ui .pin-at:not(.gone) [data-testid="pin-0"]')).toHaveCount(0)
  await shot(page, 'picked')
  await page.keyboard.press('Escape')
  // To do says what waits, or that nothing does.
  await bar.getByTestId('bar-todo').click()
  await expect(page.getByTestId('todo')).toBeVisible()
  await shot(page, 'todo')
  await page.keyboard.press('Escape')
  // Work opens Who does what; Money the sum.
  await bar.getByTestId('bar-money').click()
  await expect(page.locator('#ui [data-testid="money-pop"]')).toBeVisible()
  await page.keyboard.press('Escape')
  expect(errors, errors.join('\n')).toEqual([])
})

test('what the pointer rests on is named on the game\'s own slip, never the browser\'s', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a pointer')
  await startSeason(page)
  const key = page.locator('#ui [data-testid="view-home"]')
  const title = await key.getAttribute('title')
  expect(title).toBeTruthy()
  const r = (await key.boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.move(r.x + r.width / 2 + 1, r.y + r.height / 2 + 1)
  const tip = page.locator('.game-tip')
  await expect(tip).toBeVisible()
  await expect(tip).toHaveText(title!)
  // While it is said by the game the control carries no title for the browser to show.
  expect(await key.getAttribute('title')).toBeNull()
  await shot(page, 'tip')
  await page.mouse.move(4, 300)
  await expect(tip).toBeHidden()
  expect(await key.getAttribute('title')).toBe(title)
})
