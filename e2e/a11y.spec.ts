// axe at serious and critical on every screen and every paper.
import AxeBuilder from '@axe-core/playwright'
import { test, type Page } from '@playwright/test'
import { expect, open, putAway, reach } from './helpers.ts'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function serious(page: Page): Promise<string[]> {
  // Papers and instruments fade in; contrast is measured once they have arrived.
  await page.waitForTimeout(600)
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map(n => `${n.target.join(' ')} [${[...n.any, ...n.all, ...n.none].map(c => c.message).join(' ')}]`).join('; ')})`)
}

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'chromium', 'axe is run once, in Chromium')
})

test('the opening, the year picker, the help and the settings', async ({ page }) => {
  await open(page)
  expect(await serious(page), 'opening').toEqual([])
  await page.getByTestId('choose-year').click()
  expect(await serious(page), 'choose the year').toEqual([])
  await page.keyboard.press('Escape')
  await page.getByTestId('how-open').click()
  expect(await serious(page), 'how to play').toEqual([])
  await page.keyboard.press('Escape')
  await page.getByTestId('menu-open').click()
  expect(await serious(page), 'settings').toEqual([])
})

test('spring: the map, the plan card and its papers', async ({ page }) => {
  await open(page, '?year=1990&seed=7')
  expect(await serious(page), 'spring').toEqual([])
  await reach(page, `q.g().app.campaign.seedStock = [{ variety: 'katahdin', fields: 2, virus: 0.2, blight: 0 }]`)
  await page.getByTestId('field-0').click()
  expect(await serious(page), 'plan card').toEqual([])
  await page.getByTestId('compare-open').click()
  expect(await serious(page), 'compare').toEqual([])
  await page.getByTestId('compare-close').click()
  await page.getByTestId('money-open').click()
  expect(await serious(page), 'the money').toEqual([])
  await page.getByTestId('money-close').click()
  await page.getByTestId('equipment-open').click()
  expect(await serious(page), 'equipment').toEqual([])
})

test('the season: instruments, the card, the almanac, the menu and its confirmation', async ({ page }) => {
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('begin-season').click()
  await reach(page, `q.g().app.setSpeed(0); q.run(q.day(6, 20))`)
  await putAway(page)
  expect(await serious(page), 'season').toEqual([])
  await page.getByTestId('field-2').click()
  expect(await serious(page), 'a field selected').toEqual([])
  await page.getByTestId('field-4').click({ modifiers: ['Shift'] })
  expect(await serious(page), 'two fields selected').toEqual([])
  await page.keyboard.press('i')
  for (const tab of ['forecast', 'blight', 'fields', 'diary', 'prices']) {
    await page.getByTestId(`almanac-${tab}`).click()
    expect(await serious(page), `almanac: ${tab}`).toEqual([])
  }
  await page.keyboard.press('Escape')
  await expect(page.locator('#ui .dialog')).toHaveCount(0)
  await page.keyboard.press('m')
  await expect(page.getByTestId('menu')).toBeVisible()
  expect(await serious(page), 'menu').toEqual([])
  await page.getByTestId('end-season-early').click()
  expect(await serious(page), 'end the season early').toEqual([])
})

test('the test-dig tray, the weigh ticket and the reckoning', async ({ page }) => {
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('begin-season').click()
  await reach(page, `q.g().app.setSpeed(0); q.run(q.day(6, 28), ['sample']); const { app } = q.g(); app.do({ t: 'job', kind: 'sample', field: 2 }); app.do({ t: 'bump', id: app.campaign.season.jobs.at(-1).id }); app.do({ t: 'day' })`)
  await expect(page.getByTestId('sample-dialog')).toBeVisible()
  expect(await serious(page), 'tray').toEqual([])
  await reach(page, `q.run(999, ['sell'], 'lot')`)
  await expect(page.getByTestId('weighin')).toBeVisible()
  await page.waitForTimeout(2600)
  expect(await serious(page), 'weigh ticket').toEqual([])
  await page.getByTestId('reckoning-open').click()
  expect(await serious(page), 'reckoning').toEqual([])
})

test('winter, the year end, the farm kept and the farm lost', async ({ page }) => {
  await open(page, '?year=2012&seed=3')
  await page.getByTestId('begin-season').click()
  await reach(page, `q.g().app.setSpeed(0); q.run(999, ['sell']); q.winter(0, 9)`)
  await putAway(page)
  expect(await serious(page), 'cellar').toEqual([])
  await page.locator('#ui [data-testid^="lot-seed-open-"]').first().click()
  expect(await serious(page), 'holding back seed').toEqual([])
  await reach(page, `q.winter(12, 4)`)
  await expect(page.getByTestId('year-next')).toBeVisible()
  expect(await serious(page), 'year end').toEqual([])
  await reach(page, `const { app } = q.g(); for (let y = 1; y < 5; y++) { app.do({ t: 'next' }); app.do({ t: 'begin' }); q.year(4) }`)
  await putAway(page)
  await expect(page.getByTestId('outcome')).toBeVisible()
  expect(await serious(page), 'the fifth year end').toEqual([])
  await reach(page, `const { app } = q.g(); app.newGame(1990, 3); for (let y = 0; y < 5 && app.campaign.outcome === ''; y++) { if (y) app.do({ t: 'next' }); app.do({ t: 'begin' }); app.do({ t: 'endSeason' }); q.winter(12, 0) }`)
  await putAway(page)
  await expect(page.getByTestId('lost-moment')).toBeVisible()
  expect(await serious(page), 'the farm lost').toEqual([])
  await page.getByTestId('year-next').click()
  await expect(page.getByTestId('over-title')).toBeVisible()
  expect(await serious(page), 'the end').toEqual([])
})
