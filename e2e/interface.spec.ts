// How the interface behaves: selecting and ordering, what it says and does not say, and every size it has to hold at.
import { test, type Page } from '@playwright/test'
import { expect, look, noSidewaysScroll, open, putAway, reach, startSeason, watchErrors } from './helpers.ts'

const PRESSED = '#ui .plate[aria-pressed="true"]'

// Words a sighted player is given to read, counted the way tools/quality/capture.ts counts them.
async function wordsOnScreen(page: Page): Promise<number> {
  return page.evaluate(() => {
    let words = 0
    for (const el of document.querySelectorAll('#ui *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue
      for (const n of el.childNodes) if (n.nodeType === 3) words += (n.nodeValue ?? '').trim().split(/\s+/).filter(Boolean).length
    }
    return words
  })
}

test('fields are selected with a click, Shift, a double-click and the number keys', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  await expect(page.getByTestId('card')).toBeHidden()
  await page.getByTestId('field-0').click()
  await expect(page.locator(PRESSED)).toHaveCount(1)
  await expect(page.getByTestId('card-title')).toHaveText('North Ridge')
  await page.getByTestId('field-2').click({ modifiers: ['Shift'] })
  await expect(page.locator(PRESSED)).toHaveCount(2)
  await expect(page.getByTestId('card-title')).toHaveText('2 fields')
  // Shift on a selected field lets it go again.
  await page.getByTestId('field-2').click({ modifiers: ['Shift'] })
  await expect(page.locator(PRESSED)).toHaveCount(1)
  // A double-click takes every field in the same state: here, every potato field not yet planted.
  const potato = await page.locator('#ui .plate').evaluateAll(els => els.filter(e => !/resting/.test(e.getAttribute('aria-label') ?? '')).length)
  expect(potato).toBeGreaterThan(1)
  await page.getByTestId('field-0').dblclick()
  await expect(page.locator(PRESSED)).toHaveCount(potato)
  await expect(page.getByTestId('card-title')).toHaveText(`${potato} fields`)
  await page.keyboard.press('Escape')
  await expect(page.locator(PRESSED)).toHaveCount(0)
  await page.keyboard.press('Digit3')
  await page.keyboard.press('Shift+Digit1')
  await expect(page.locator(PRESSED)).toHaveCount(2)
  await expect(page.getByTestId('field-2')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('field-0')).toHaveAttribute('aria-pressed', 'true')
  expect(errors, errors.join('\n')).toEqual([])
})

test('only the orders that can be given are offered, and one that cannot says why', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  await page.getByTestId('field-0').click()
  const orders = page.locator('#ui [data-testid="card"] button.order')
  // An unplanted field can only be planted.
  await expect(orders).toHaveCount(1)
  await expect(page.getByTestId('order-plant')).toContainText('Plant')
  await expect(page.getByTestId('order-plant')).toContainText('$150')
  // Hilling has no button here; asked for by its key, the card says why not.
  await page.keyboard.press('h')
  await expect(page.getByTestId('card-line')).toContainText('Hill: Nothing planted yet.')
  // The coach still says why it would wait.
  await page.keyboard.press('Escape')
  await page.getByTestId('field-0').click()
  await expect(page.getByTestId('card-line')).toContainText('Hold off planting')
  // Given, the order joins the crew's list, and its place on the card holds still for a moment.
  await page.getByTestId('order-plant').click()
  await expect.poll(async () => (await look(page)).queue).toBe(1)
  await expect(page.locator('#ui [data-testid="card"] .order.given')).toHaveCount(1)
  await page.keyboard.press('p')
  await expect(page.getByTestId('card-line')).toContainText('Already on the list')
  // A second field, then that order is put first with Ctrl, and the first is cancelled with a click.
  await page.keyboard.press('Digit3')
  await page.keyboard.press('p')
  await expect.poll(async () => (await look(page)).queue).toBe(2)
  const items = page.locator('#ui .queue .q:not(.more)')
  await expect(items.first()).toContainText('Planting North Ridge')
  await items.nth(1).click({ modifiers: ['Control'] })
  await expect(items.first()).toContainText('Planting Upper Middle')
  await items.first().click()
  await expect.poll(async () => (await look(page)).queue).toBe(1)
  await expect(items.first()).toContainText('Planting North Ridge')
  // A resting field offers nothing and says so in one line.
  await page.getByTestId('field-1').click()
  await expect(orders).toHaveCount(0)
  await expect(page.getByTestId('card-line')).toContainText('Resting in oats and clover')
  expect(errors, errors.join('\n')).toEqual([])
})

test('never more than five orders, and under 80 words with nothing selected', async ({ page }) => {
  await startSeason(page)
  expect(await wordsOnScreen(page)).toBeLessThan(80)
  await reach(page, `q.run(q.day(6, 12))`)
  await putAway(page)
  await page.waitForTimeout(300)
  expect(await wordsOnScreen(page)).toBeLessThan(80)
  await page.getByTestId('field-2').click()
  const orders = page.locator('#ui [data-testid="card"] button.order:not(.more)')
  await expect(orders.first()).toBeVisible()
  expect(await orders.count()).toBeLessThanOrEqual(5)
  // The rest are one press away, and the letter keys reach them all.
  if (await page.getByTestId('order-more').count()) {
    const first = await orders.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.testid))
    await page.getByTestId('order-more').click()
    await expect(page.getByTestId('order-more')).toHaveAttribute('aria-pressed', 'true')
    const rest = await orders.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.testid))
    expect(rest.length).toBeGreaterThan(0)
    expect(rest.some(x => first.includes(x))).toBe(false)
  }
  // A reading a week old is marked as old.
  await reach(page, `const { app } = q.g(); for (let k = 0; k < 9; k++) app.do({ t: 'day' })`)
  await putAway(page)
  await expect(page.getByTestId('blight-reading')).toHaveClass(/stale/)
  await expect(page.getByTestId('estimate')).toContainText('–')
})

test('a test dig is a tray beside the land, does not stop the clock, and can be reopened', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  await reach(page, `q.run(q.day(6, 28), ['sample'])`)
  await putAway(page)
  await page.getByTestId('field-2').click()
  await page.keyboard.press('Shift+t')
  await expect.poll(async () => (await look(page)).queue).toBeGreaterThan(0)
  await page.getByTestId('speed-1').click()
  const tray = page.getByTestId('sample-dialog')
  await expect(tray).toBeVisible({ timeout: 30_000 })
  expect((await look(page)).paused).toBe(false)
  await expect(tray).toContainText('one hill of')
  expect(await tray.locator('.tuber').count()).toBeGreaterThan(0)
  // It is not a modal: the land and the instruments stay in reach behind it.
  await page.getByTestId('speed-0').click()
  await page.keyboard.press('Escape')
  await expect(tray).toHaveCount(0)
  await page.getByTestId('sample-again').click()
  await expect(tray).toBeVisible()
  await expect(tray.locator('.narrowing')).toContainText('The tick is this hill')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a weigh ticket wants an answer: it cannot be tapped away, and closing it stores the crop', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  await reach(page, `q.run(999, ['sell'], 'lot')`)
  const ticket = page.getByTestId('weighin')
  // The ticket waits for the land to finish showing the dig, which a slow engine takes a while over.
  await expect(ticket).toBeVisible({ timeout: 30_000 })
  await expect(ticket).toContainText('Weigh ticket')
  await expect(ticket.getByTestId('carried')).toContainText('The field gave')
  await expect(ticket.locator('.losses')).toBeVisible()
  await expect(ticket.locator('[data-testid^="lot-sell-"]')).toContainText('$')
  await expect(ticket.locator('.choice')).toContainText('Storing costs')
  await page.waitForTimeout(700)
  await page.mouse.click(4, 300)
  await expect(ticket).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(ticket).toHaveCount(0)
  await expect(page.locator('#ui [data-testid="notice"]')).toContainText('went into the cellar')
  // The stored crop is on its field's card, with the ticket and the sale.
  await putAway(page)
  const field = await page.locator('#ui .plate[aria-label*=", dug"]').first().getAttribute('data-testid')
  await page.getByTestId(field!).click()
  await expect(page.locator('#ui [data-testid^="field-sell-"]')).toContainText('$')
  await page.locator('#ui [data-testid^="weighin-"]').click()
  await expect(ticket).toBeVisible()
  await ticket.getByTestId('reckoning-open').click()
  await expect(page.getByTestId('reckoning')).toContainText('of the No. 1 price')
  expect(errors, errors.join('\n')).toEqual([])
})

for (const [w, h] of [[320, 640], [390, 844], [844, 390], [820, 1180], [1024, 700], [1280, 720], [1920, 1080]]) {
  test(`the season screen holds together at ${w} by ${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await startSeason(page)
    await reach(page, `q.run(q.day(6, 12))`)
    await putAway(page)
    for (const selected of [false, true]) {
      if (selected) await page.getByTestId('field-2').click()
      await page.waitForTimeout(500)
      const found = await page.evaluate(sel => {
        const out: string[] = []
        const box = (q: string) => { const e = document.querySelector<HTMLElement>(`#ui ${q}`); return e && e.offsetParent !== null && e.offsetHeight > 0 ? e.getBoundingClientRect() : null }
        const top = box('.topbar')!
        const low = ['.card', '.crew', '.clock-slot'].map(box).filter((r): r is DOMRect => !!r)
        const free = Math.min(...low.map(r => r.top)) - top.bottom
        if (free < innerHeight * 0.5) out.push(`the land has ${Math.round(free)} of ${innerHeight} px${sel ? ' with a field selected' : ''}`)
        if (document.documentElement.scrollWidth > innerWidth) out.push('the page scrolls sideways')
        for (const q of ['.topbar', '.card', '.crew', '.clock-slot']) {
          const r = box(q)
          if (r && (r.left < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)) out.push(`${q} runs off the window`)
        }
        for (const el of document.querySelectorAll<HTMLElement>('#ui .topbar *, #ui .card *, #ui .crew *')) {
          const text = [...el.childNodes].some(n => n.nodeType === 3 && (n.nodeValue ?? '').trim())
          if (text && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && !el.matches('.sr, .unit-text, .unit-name')) out.push(`clipped: ${el.className}`)
        }
        const spans = [...document.querySelectorAll<HTMLElement>('#ui .topbar > *')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0)
        for (let a = 0; a < spans.length; a++) for (let b = a + 1; b < spans.length; b++) {
          const x = Math.min(spans[a].right, spans[b].right) - Math.max(spans[a].left, spans[b].left)
          const y = Math.min(spans[a].bottom, spans[b].bottom) - Math.max(spans[a].top, spans[b].top)
          if (x > 1 && y > 1) out.push('parts of the top bar overlap')
        }
        if (matchMedia('(pointer: coarse)').matches) {
          for (const el of document.querySelectorAll<HTMLElement>('#ui button')) {
            const r = el.getBoundingClientRect()
            if (r.width && r.height && (r.width < 39.5 || r.height < 39.5)) out.push(`small target: ${el.dataset.testid ?? el.className}`)
          }
        }
        if (sel && document.querySelectorAll('#ui .card button.order:not(.more)').length > 5) out.push('more than five orders')
        return out
      }, selected)
      expect(found, found.join('; ')).toEqual([])
    }
    await noSidewaysScroll(page)
  })
}

test('Play starts a farm of its own, counted in years of its own, and a new farm asks before it replaces one', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page)
  await expect(page.getByTestId('choose-year')).toHaveCount(0)
  await page.getByTestId('play').click()
  await expect(page.getByTestId('begin-season')).toBeVisible()
  await expect(page.locator('#ui main:not(.leaving) .tb-year')).toHaveText('Year 1')
  await expect(page.locator('#ui [data-testid^="field-"].plate')).toHaveCount(6)
  await page.getByTestId('menu-open').click()
  await page.getByTestId('quit-title').click()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('confirm')).toContainText('replaces the farm saved in this browser')
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('continue')).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('spring land: a marker opens a card, renting puts a plate and the rent on the money line, and it can be released', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  await expect(page.locator('#ui .plate.land').first()).toBeVisible()
  await page.getByTestId('land-10').click()
  const card = page.getByTestId('plan-card')
  await expect(card).toContainText('Dufour Upper')
  await expect(card).toContainText('Dufour potato house comes with it')
  await expect(card.getByTestId('land-rent')).toContainText('$1,100 a year')
  await card.getByTestId('land-rent').click()
  await expect(page.getByTestId('field-10')).toHaveCount(1)
  await expect(page.getByTestId('plan-money')).toContainText('rent $1,100')
  await expect(page.getByTestId('plan-money')).toContainText('This plan $50,100')
  // The rented field is the seventh the farm holds, so the 7 key picks it.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Digit7')
  await expect(card.getByTestId('card-title')).toHaveText('Dufour Upper')
  await expect(card.getByTestId('tenure')).toContainText('Rented, $1,100 this year')
  await card.getByTestId('land-release').click()
  await expect(page.getByTestId('field-10')).toHaveCount(0)
  await expect(page.getByTestId('plan-money')).toContainText('This plan $39,300')
  await expect(card.getByTestId('land-rent')).toBeVisible()
  // The crew and the contracts are a press away; neither is needed to start.
  await page.keyboard.press('Escape')
  await page.getByTestId('crew-open').click()
  const crew = page.getByTestId('crew')
  await expect(crew).toContainText('An operator needs a second tractor')
  await crew.getByTestId('hire-hand').click()
  await expect(crew).toContainText('Lucien')
  await page.getByTestId('crew-close').click()
  await expect(page.getByTestId('plan-money')).toContainText('wages $450')
  await page.getByTestId('contracts-open').click()
  const contracts = page.getByTestId('contracts')
  await expect(contracts.getByTestId('offer-19903')).toContainText('Off contract Atlantic sells 20% under')
  await contracts.getByTestId('accept-19903').click()
  await expect(contracts.locator('.offer.signed')).toHaveCount(1)
  await page.getByTestId('contracts-close').click()
  await expect(page.getByTestId('tracker')).toContainText('Atlantic')
  await expect(page.getByTestId('tracker')).toContainText('by fall')
  expect(errors, errors.join('\n')).toEqual([])
})

test('crews: a picked crew takes the next orders, an order it cannot do says why, and an order can be given to one crew', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the who-does-it control is reached by hovering')
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('crew-open').click()
  await page.getByTestId('crew').getByTestId('hire-hand').click()
  await page.getByTestId('crew-close').click()
  await page.getByTestId('begin-season').click()
  await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run(q.day(6, 12)); for (const j of [...app.campaign.season.jobs]) app.do({ t: 'cancel', id: j.id })`)
  await putAway(page)
  await expect(page.locator('#ui .unit')).toHaveCount(2)
  await page.getByTestId('unit-1').click()
  await expect(page.getByTestId('unit-1')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('field-2').click()
  const orders = page.locator('#ui [data-testid="card"] button.order:not(.more)')
  const kinds = await orders.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.testid))
  expect(kinds.every(k => ['order-scout', 'order-rogue', 'order-sample'].includes(k!))).toBe(true)
  await expect(page.locator('#ui .order-who')).toContainText('Lucien')
  await page.keyboard.press('h')
  await expect(page.getByTestId('card-line')).toContainText('Lucien is a field hand')
  await page.keyboard.press('c')
  const id = await page.evaluate(() => (globalThis as unknown as { __county: { app: { campaign: { season: { jobs: { id: number; kind: string; field: number; unit: number }[] } } } } }).__county.app.campaign.season.jobs.find(j => j.kind === 'scout' && j.field === 2)!.id)
  await expect(page.getByTestId(`queue-${id}`).locator('.q-tag.pinned')).toHaveText('L')
  // Any crew may take it again, from the choices above the order.
  await page.getByTestId(`queue-${id}`).hover()
  await page.getByTestId(`queue-who-${id}`).click()
  await page.getByTestId(`assign-${id}--1`).click()
  await expect(page.getByTestId(`queue-${id}`).locator('.q-tag.pinned')).toHaveCount(0)
  await page.getByTestId('unit-1').click()
  await expect(page.getByTestId('unit-1')).toHaveAttribute('aria-pressed', 'false')
  expect(errors, errors.join('\n')).toEqual([])
})

test('Tab and Shift-Tab walk the fields that need something, both ways', async ({ page }) => {
  await startSeason(page)
  // With the list cleared, every field reference practice has something for shows its need again.
  await reach(page, `const { app } = q.g(); q.run(q.day(6, 12)); for (const j of [...app.campaign.season.jobs]) app.do({ t: 'cancel', id: j.id })`)
  await putAway(page)
  const want = await page.evaluate(() => (globalThis as unknown as { __county: { app: { needs(): { need: { act: string } | null }[] } } }).__county.app.needs().map((n, i) => n.need && n.need.act !== 'close' ? i : -1).filter(i => i >= 0))
  test.skip(want.length < 2, 'fewer than two fields need something on this day')
  const sel = () => page.evaluate(() => (globalThis as unknown as { __county: { app: { selected: number } } }).__county.app.selected)
  await page.mouse.click(5, 400)
  await page.keyboard.press('Tab')
  expect(await sel()).toBe(want[0])
  await page.keyboard.press('Tab')
  expect(await sel()).toBe(want[1])
  await page.keyboard.press('Shift+Tab')
  expect(await sel()).toBe(want[0])
})

test('a crop a contract wants: the weigh ticket delivers it and the tracker counts it', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  await reach(page, `const { app } = q.g(); const c = app.campaign; app.do({ t: 'accept', offer: 19901 })
    for (let i = 0; i < 6; i++) if (c.plans[i].crop === 'potato') app.do({ t: 'plan', field: i, plan: { crop: 'potato', variety: 'kennebec', seed: 'certified' } })
    app.do({ t: 'begin' }); app.setSpeed(0); q.run(999, ['sell'], 'lot')`)
  const ticket = page.getByTestId('weighin')
  await expect(ticket).toBeVisible({ timeout: 30_000 })
  const deliver = ticket.locator('[data-testid^="lot-deliver-"]')
  await expect(deliver).toContainText('Deliver to the fry plant')
  await expect(ticket.locator('.choice')).toContainText(/market/)
  await expect(ticket.getByTestId('store-houses')).toContainText('The potato house holds')
  await deliver.click()
  await expect(ticket.locator('[data-testid^="lot-keep-"]')).toContainText('Store the rest')
  await ticket.locator('[data-testid^="lot-keep-"]').click()
  await expect(ticket).toHaveCount(0)
  await expect(page.locator('#ui .track-n')).not.toHaveText(/^0\//)
  expect(errors, errors.join('\n')).toEqual([])
})

test('spring: the plan is on the plates, a card changes it, and saved seed says what it costs', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  await expect(page.getByTestId('field-0')).toContainText('Katahdin')
  await expect(page.getByTestId('field-1')).toContainText('Rest year')
  await expect(page.getByTestId('plan-money')).toContainText('This plan $39,300')
  await page.getByTestId('field-0').click()
  const card = page.getByTestId('plan-card')
  await expect(card).toContainText('North Ridge')
  await card.getByTestId('plan-variety-kennebec').check({ force: true })
  await expect(page.getByTestId('field-0')).toContainText('Kennebec')
  await card.getByTestId('plan-crop-rest').check({ force: true })
  await expect(page.getByTestId('field-0')).toContainText('Rest year')
  await expect(page.getByTestId('plan-money')).toContainText('This plan $29,850')
  await card.getByTestId('plan-crop-potato').check({ force: true })
  // With seed in the cellar the choice appears, and says what it carries.
  await reach(page, `const a = q.g().app; a.campaign.seedStock = [{ variety: 'kennebec', fields: 1, virus: 0.3, blight: 0 }]; a.do({ t: 'plan', field: 0, plan: { crop: 'potato', variety: 'kennebec', seed: 'certified' } })`)
  await expect(card.getByTestId('seed-note')).toContainText('about 30% of plants')
  await card.getByTestId('plan-seed-saved').check({ force: true })
  await expect(page.getByTestId('plan-money')).toContainText('This plan $37,600')
  // The detail is one press further.
  await card.getByTestId('compare-open').click()
  await expect(page.getByTestId('compare')).toContainText('Leaf blight')
  await page.getByTestId('compare-close').click()
  await page.getByTestId('money-open').click()
  await expect(page.getByTestId('money')).toContainText('After planting')
  await page.getByTestId('money-close').click()
  await page.getByTestId('equipment-open').click()
  await expect(page.getByTestId('equipment')).toContainText('Boom sprayer')
  await page.getByTestId('equipment-close').click()
  expect(errors, errors.join('\n')).toEqual([])
})

test('the menu: settings take effect, ending early says what is lost, and the save is deleted only when confirmed', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  await page.getByTestId('menu-open').click()
  const menu = page.getByTestId('menu')
  await expect(menu).toContainText('year 1 of 5')
  await expect(menu.getByTestId('quality-now')).toContainText('Drawing')
  await menu.getByTestId('units-metric').check({ force: true })
  await menu.getByTestId('how-open').click()
  await expect(page.getByTestId('how')).toContainText('The nine orders')
  await page.getByTestId('how-close').click()
  await menu.getByTestId('end-season-early').click()
  const confirm = page.getByTestId('confirm')
  await expect(confirm).toContainText('never planted')
  await expect(confirm).toContainText('$20,500')
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('forecast')).toBeVisible()
  // Metric reaches the instruments.
  await page.getByTestId('field-0').click()
  await expect(page.locator('#ui [data-testid="card"] .card-known')).toContainText('°C')
  await page.keyboard.press('Escape')
  await page.keyboard.press('m')
  await page.getByTestId('save-delete').click()
  await expect(confirm).toContainText('cannot be brought back')
  await page.getByTestId('confirm-cancel').click()
  await expect(menu).toBeVisible()
  await page.getByTestId('save-delete').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('play')).toBeVisible()
  await expect(page.getByTestId('continue')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('winter: each stored crop is a card, seed can be held back, and the year closes on one sheet', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  await reach(page, `q.run(999, ['sell']); q.winter(0, 9)`)
  await putAway(page)
  await expect(page.getByTestId('date')).toHaveText('November')
  const lots = page.locator('#ui .lot')
  await expect(lots.first()).toContainText('Storage')
  await expect(lots.first()).toContainText(/sprout/i)
  // A pile with a field's worth of sound tubers in it can give up seed.
  const seedLot = lots.filter({ has: page.locator('[data-testid^="lot-seed-open-"]') }).first()
  await seedLot.locator('[data-testid^="lot-seed-open-"]').click()
  await expect(seedLot.locator('[data-testid^="seed-cost-"]')).toContainText('virus')
  await seedLot.locator('.seed-row .btn.primary').click()
  await expect(page.locator('#ui .lot', { hasText: 'seed held for 1 field' })).toHaveCount(1)
  await page.getByTestId('month-next').click()
  await expect(page.getByTestId('date')).toHaveText('December')
  await expect(page.getByTestId('this-month')).toContainText('Storage for November')
  await lots.first().locator('[data-testid^="lot-sell-half-"]').click()
  for (let i = 0; i < 8 && !(await page.getByTestId('year-next').count()); i++) {
    await page.getByTestId('month-next').click()
    await page.waitForTimeout(200)
  }
  await expect(page.getByTestId('outcome')).toBeVisible()
  const sheet = page.locator('#ui .ledger-sheet')
  await expect(sheet).toContainText('Cash at year end')
  await expect(sheet).toContainText('The neighbor')
  await expect(sheet).toContainText('The soil going into 1991')
  await page.getByTestId('year-next').click()
  await expect(page.getByTestId('begin-season')).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})
