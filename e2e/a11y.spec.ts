import AxeBuilder from '@axe-core/playwright'
import { test } from '@playwright/test'
import { closeDialogs, expect, open, playUntil } from './helpers.ts'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function serious(page: import('@playwright/test').Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.length} node(s), ${v.help}`)
}

test('no serious accessibility violations on the main screens', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'axe is run once, in Chromium')
  await open(page)
  expect(await serious(page), 'title').toEqual([])
  await page.getByTestId('new-farm').click()
  expect(await serious(page), 'new farm').toEqual([])
  await page.getByTestId('start-year-1987').click()
  await page.getByTestId('start-confirm').click()
  expect(await serious(page), 'plan').toEqual([])
  await page.getByTestId('begin-season').click()
  await page.getByTestId('field-2').click()
  expect(await serious(page), 'season').toEqual([])
  await playUntil(page, 'firstDig')
  expect(await serious(page), 'weigh-in').toEqual([])
  await closeDialogs(page)
  await playUntil(page, 'seasonDone')
  await closeDialogs(page)
  await page.getByTestId('end-season').first().click()
  expect(await serious(page), 'cellar').toEqual([])
})
