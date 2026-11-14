import { expect, test } from './base.ts'
import { startSeason } from './helpers.ts'

test('the pointer is the game\'s own, and nothing is picked up as text', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a pointer')
  await startSeason(page)
  const look = await page.evaluate(() => {
    const cur = (el: Element | null) => (el ? getComputedStyle(el).cursor : '')
    return {
      body: cur(document.body),
      key: cur(document.querySelector('#ui [data-testid="speed-1"]')),
      land: cur(document.querySelector('canvas')),
      select: getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect,
    }
  })
  expect(look.body).toMatch(/^url\(.*\) 5 3, default$/)
  expect(look.key).toMatch(/^url\(.*\) 13 3, pointer$/)
  expect(look.land).toMatch(/^url\(.*\) \d+ \d+, (grab|pointer)$/)
  expect(look.select).toBe('none')
  // A drag across the boards and a double click on a figure leave nothing selected.
  await page.mouse.move(60, 60)
  await page.mouse.down()
  await page.mouse.move(360, 120, { steps: 6 })
  await page.mouse.up()
  await page.mouse.dblclick(1300, 60)
  expect(await page.evaluate(() => String(getSelection() ?? ''))).toBe('')
})
