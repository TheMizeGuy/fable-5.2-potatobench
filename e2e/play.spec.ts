// Gate 7: a player can start a farm, work a season, dig, sell, close the year, and find the save again.
// Everything here goes through the interface: clicks on badges, plates and the command card, and the keyboard.
import { test, type Page } from '@playwright/test'
import { expect, look, noSidewaysScroll, pause, watchErrors } from './helpers.ts'

const BADGE = '#ui [data-testid^="badge-"]'

async function answerTicket(page: Page, store: boolean): Promise<void> {
  const ticket = page.getByTestId('weighin')
  const sell = ticket.locator('[data-testid^="lot-sell-"]')
  const advised = await ticket.locator('.choice-advice').count()
  if ((await sell.count()) && (advised || !store)) await sell.click()
  else await ticket.locator('[data-testid^="lot-keep-"]').click()
  await expect(ticket).toHaveCount(0)
}

// Plays the days as they come: reads a tip and puts it away, gives each field what its badge asks for (every third
// one through the command card), keeps the clock running, and answers weigh tickets. Stops at the first ticket or
// when the season is done.
async function farm(page: Page, until: 'ticket' | 'done', store: boolean): Promise<void> {
  let given = 0
  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    const s = await look(page)
    if (s.ticket) {
      if (until === 'ticket') return
      await answerTicket(page, store)
      continue
    }
    if (s.done) {
      if (until === 'done') return
      throw new Error('the season ended before a crop was dug')
    }
    if (s.hint) { await page.getByTestId('hint-close').click({ timeout: 3000 }).catch(() => {}); continue }
    if (s.tray) { await page.getByTestId('sample-close').click({ timeout: 3000 }).catch(() => {}); continue }
    if (s.badges.length) {
      const id = s.badges[0]
      if (given++ % 3 === 0) {
        await page.getByTestId(`field-${id.split('-')[1]}`).click({ timeout: 3000 }).catch(() => {})
        const order = page.locator('#ui [data-testid="card"] button.order.suggested')
        if (await order.count()) await order.first().click({ timeout: 3000 }).catch(() => {})
        else await page.getByTestId(id).click({ timeout: 3000 }).catch(() => {})
        await page.getByTestId('card-close').click({ timeout: 3000 }).catch(() => {})
      } else {
        await page.getByTestId(id).click({ timeout: 3000 }).catch(() => {})
      }
      continue
    }
    if (!s.running) await page.getByTestId('run').click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(120)
  }
  throw new Error('the season did not finish in time')
}

test('a first season from the opening to the next spring, with a save that survives a reload', async ({ page }) => {
  test.setTimeout(600_000)
  const errors = watchErrors(page)
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  // The opening asks nothing: Play, then Start.
  await page.getByTestId('play').click()
  await expect(page.getByTestId('begin-season')).toBeVisible()
  await expect(page.locator('#ui [data-testid^="field-"]')).toHaveCount(6)
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('forecast')).toBeVisible()
  expect((await look(page)).running).toBe(true)

  // The first thing that needs doing slows the clock to normal speed. It does not stop it.
  await expect(page.locator(BADGE).first()).toBeVisible({ timeout: 120_000 })
  const first = await look(page)
  expect(first.paused).toBe(false)
  expect(first.running).toBe(false)
  expect(first.speed).toBe(1)

  // A crop just dug is the one thing that stops it.
  await farm(page, 'ticket', true)
  const ticket = page.getByTestId('weighin')
  await expect(ticket).toBeVisible()
  const stopped = await look(page)
  expect(stopped.paused).toBe(true)
  await page.waitForTimeout(2200)
  expect((await look(page)).date).toBe(stopped.date)
  await expect(ticket.getByTestId('ticket-weight')).toContainText(/\d/)
  await expect(ticket.locator('.gradebar')).toBeVisible()
  await ticket.getByTestId('reckoning-open').click()
  await expect(page.getByTestId('reckoning')).toContainText('Grade by grade')
  await page.getByTestId('reckoning-close').click()
  await expect(page.getByTestId('reckoning')).toHaveCount(0)
  await answerTicket(page, true)
  await expect.poll(async () => (await look(page)).paused).toBe(false)

  // Stop, reload, continue: the same day and the same cash.
  await pause(page)
  const before = await look(page)
  await page.waitForTimeout(3000)
  await page.reload()
  await page.getByTestId('continue').click()
  await expect(page.getByTestId('forecast')).toBeVisible()
  const after = await look(page)
  expect(after.date).toBe(before.date)
  expect(after.cash).toBe(before.cash)
  expect(after.paused).toBe(true)

  // The rest of the season, the winter, and the year end.
  await farm(page, 'done', false)
  await page.getByTestId('end-season').click()
  await expect(page.getByTestId('month-next')).toBeVisible()
  for (let i = 0; i < 9 && !(await page.getByTestId('year-next').count()); i++) {
    const half = page.locator('#ui [data-testid^="lot-sell-half-"]')
    if (i === 1 && (await half.count())) await half.first().click()
    await page.getByTestId('month-next').click()
    await page.waitForTimeout(250)
  }
  await expect(page.getByTestId('year-next')).toBeVisible()
  await expect(page.getByTestId('outcome')).toContainText('The bank is satisfied')
  await page.getByTestId('year-next').click()
  await expect(page.getByTestId('begin-season')).toBeVisible()
  await expect(page.getByTestId('date')).toHaveText('Spring')

  await noSidewaysScroll(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the same start by keyboard alone', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone has no keyboard')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(page.getByTestId('play')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('begin-season')).toBeFocused()
  // Fields are chosen with the number keys; Escape lets them go.
  await page.keyboard.press('Digit2')
  await expect(page.getByTestId('plan-card')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('plan-card')).toBeHidden()
  await page.getByTestId('begin-season').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('forecast')).toBeVisible()

  // Tab finds the field that needs something; Enter gives it the order.
  await expect(page.locator(BADGE).first()).toBeVisible({ timeout: 120_000 })
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('card')).toBeVisible()
  await expect(page.locator('#ui .plate[aria-pressed="true"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await look(page)).queue).toBeGreaterThan(0)

  // The clock: Space, plus and minus, F.
  await page.keyboard.press('Space')
  await expect(page.getByTestId('paused')).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByTestId('paused')).toBeHidden()
  await page.keyboard.press('+')
  expect((await look(page)).speed).toBe(2)
  await page.keyboard.press('-')
  expect((await look(page)).speed).toBe(1)
  await page.keyboard.press('Space')

  // An order by its letter; the same letter cannot be given twice, and the card says why.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Digit1')
  await page.keyboard.press('Shift+Digit3')
  await expect(page.locator('#ui .plate[aria-pressed="true"]')).toHaveCount(2)
  const queued = (await look(page)).queue
  await page.keyboard.press('Backspace')
  await expect.poll(async () => (await look(page)).queue).toBeLessThanOrEqual(queued)

  // The almanac and the menu open and close from the keyboard.
  await page.keyboard.press('i')
  await expect(page.getByTestId('almanac')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('almanac')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('#ui .plate[aria-pressed="true"]')).toHaveCount(0)
  await page.keyboard.press('m')
  await expect(page.getByTestId('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('menu')).toHaveCount(0)
  await page.keyboard.press('f')
  expect((await look(page)).running).toBe(true)
  expect(errors, errors.join('\n')).toEqual([])
})
