// Gate 7: a player can start a farm, work a season, dig, sell, close the year, and find the save again.
import { test } from '@playwright/test'
import { cash, closeDialogs, expect, open, playUntil, watchErrors } from './helpers.ts'

test('a first season from title to the next spring, with a save that survives a reload', async ({ page }) => {
  const errors = watchErrors(page)
  const phone = (page.viewportSize()?.width ?? 1000) < 700
  await open(page)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => '__county' in globalThis)

  await page.getByTestId('new-farm').click()
  await page.getByTestId('start-year-1987').click()
  await page.getByTestId('start-confirm').click()
  await expect(page.getByTestId('begin-season')).toBeVisible()
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('speed-0')).toBeVisible()

  // The clock runs when asked and the date moves.
  const day0 = await page.evaluate(() => (globalThis as any).__county.app.campaign.season.day)
  await page.getByTestId('speed-3').click()
  await page.waitForFunction(d => (globalThis as any).__county.app.campaign.season.day >= d + 3, day0, { timeout: 30_000 })
  await page.getByTestId('speed-0').click()

  // The coach's advice can be taken with one click and lands on the work list.
  await playUntil(page, 'firstDig')
  await closeDialogs(page)
  expect(await page.evaluate(() => (globalThis as any).__county.app.campaign.lots.length)).toBeGreaterThan(0)

  // Save, reload, continue: same day, same cash.
  const before = await page.evaluate(() => { const a = (globalThis as any).__county.app; a.save(); return { day: a.campaign.season.day, cash: a.campaign.cash, year: a.campaign.year } })
  await page.reload()
  await page.waitForFunction(() => '__county' in globalThis)
  await page.getByTestId('continue').click()
  const after = await page.evaluate(() => { const a = (globalThis as any).__county.app; return { day: a.campaign.season.day, cash: a.campaign.cash, year: a.campaign.year } })
  expect(after).toEqual(before)
  expect(await cash(page)).toMatch(/\d/)

  // Finish the season, sell through the winter, close the year.
  await playUntil(page, 'seasonDone')
  await closeDialogs(page)
  if (phone) await page.getByTestId('tab-coach').click().catch(() => {})
  await page.getByTestId('end-season').first().click()
  await expect(page.getByTestId('month-next')).toBeVisible()
  for (let i = 0; i < 9; i++) {
    await closeDialogs(page)
    const phase = await page.evaluate(() => (globalThis as any).__county.app.campaign.phase)
    if (phase !== 'cellar') break
    await page.getByTestId('month-next').click()
    await page.waitForTimeout(120)
  }
  await expect(page.getByTestId('year-next')).toBeVisible()
  const history = await page.evaluate(() => (globalThis as any).__county.app.campaign.history.length)
  expect(history).toBe(1)
  await page.getByTestId('year-next').click()
  if (await page.getByTestId('begin-season').count()) await expect(page.getByTestId('begin-season')).toBeVisible()

  // Nothing scrolls sideways and nothing errored.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a job can be given by hand and the keyboard drives the clock', async ({ page }) => {
  const errors = watchErrors(page)
  const phone = (page.viewportSize()?.width ?? 1000) < 700
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('begin-season').click()
  await page.getByTestId('field-0').click()
  if (phone) await page.getByTestId('tab-field').click()
  await page.getByTestId('act-plant').click()
  const jobs = await page.evaluate(() => (globalThis as any).__county.app.campaign.season.jobs.map((j: any) => j.kind))
  expect(jobs).toContain('plant')
  if (!phone) {
    await page.keyboard.press('Escape')
    await page.locator('body').click({ position: { x: 5, y: 450 } }).catch(() => {})
    await page.keyboard.press('2')
    expect(await page.evaluate(() => (globalThis as any).__county.app.speed)).toBe(2)
    await page.keyboard.press('Space')
    expect(await page.evaluate(() => (globalThis as any).__county.app.speed)).toBe(0)
  }
  expect(errors, errors.join('\n')).toEqual([])
})
