// How the interface behaves: selecting and ordering, what it says and does not say, and every size it has to hold at.
import { test, type Page } from '@playwright/test'
import { expect, look, noSidewaysScroll, open, putAway, reach, startSeason, watchErrors } from './helpers.ts'

// A label and its amount on a money line, however the sheet sets what lies between them (a space, "with rent $3,500").
const line = (label: string, amount: string): RegExp => new RegExp(`${label}.{0,40}?${amount.replace(/[$.]/g, '\\$&')}(?![\\d,])`)

const PRESSED = '#ui .plate[aria-pressed="true"]'

// A figure read from the running game: an expression over app and sim.
async function game<T>(page: Page, expr: string): Promise<T> {
  return page.evaluate(`(() => { const { app, sim } = window.__county; return ${expr} })()`) as Promise<T>
}

function money(usd: number): string {
  return `$${Math.round(usd).toLocaleString('en-US')}`
}

// A first year with the three who asked for work in spring taken on (a bunkhouse given, so all three have a bed),
// into the season and stopped in June.
async function farmWithPeople(page: Page): Promise<void> {
  await open(page, '?year=1990&seed=7')
  await reach(page, `const { app } = q.g(); const c = app.campaign; c.cash += 30000
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })`)
  await page.getByTestId('begin-season').click()
  await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run(q.day(5, 12)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1)`)
  await putAway(page)
}

// Runs the days on to the weigh ticket as a player would: a stop the game makes on the way (the frost warning over
// the barrels the evening before a frost) is gone on from with the clock's own Go on.
async function untilTicket(page: Page): Promise<void> {
  const ticket = page.getByTestId('weighin')
  const until = Date.now() + 90_000
  while (Date.now() < until && !(await ticket.isVisible().catch(() => false))) {
    const go = page.getByTestId('paused-go')
    if (await go.isVisible().catch(() => false) && !(await page.locator('#ui .dialog').count())) await go.click().catch(() => {})
    await page.waitForTimeout(300)
  }
  await expect(ticket).toBeVisible()
}

// Words a sighted player is given to read, counted the way tools/quality/capture.ts counts them, and which elements
// carry them, so a count over the limit says where the words are.
async function wordsOnScreen(page: Page): Promise<{ n: number; by: string }> {
  return page.evaluate(() => {
    let words = 0
    const by: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('#ui *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
      // A screen on its way out is a picture fading, not words given to read.
      if (el.closest('.leaving, [inert]')) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue
      let here = 0
      for (const n of el.childNodes) if (n.nodeType === 3) here += (n.nodeValue ?? '').trim().split(/\s+/).filter(Boolean).length
      words += here
      if (here >= 3) by.push(`${el.dataset.testid ?? el.className}: ${here}`)
    }
    return { n: words, by: by.join('; ') }
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
  const potato = await page.locator('#ui .plate').evaluateAll(els => els.filter(e => !/resting/.test(e.textContent ?? '')).length)
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

test('every crop order has its place on the card; one that cannot be given is greyed and says why', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  await page.getByTestId('field-0').click()
  const orders = page.locator('#ui [data-testid="card"] button.order:not(.is-off):not(.is-given)')
  await expect(page.locator('#ui [data-testid="card"] .orders.slots > .order')).toHaveCount(9)
  // An unplanted field can only be planted.
  await expect(orders).toHaveCount(1)
  await expect(page.getByTestId('order-plant')).toContainText('Plant')
  await expect(page.getByTestId('order-plant')).toContainText('$150')
  // Hilling is greyed in its place; asked for by its key or a press, the card says why not.
  await page.keyboard.press('h')
  await expect(page.getByTestId('card-line')).toContainText('Hill: Nothing planted yet.')
  await page.getByTestId('order-water-off').click()
  await expect(page.getByTestId('card-line')).toContainText('Water:')
  // The coach still says why it would wait.
  await page.keyboard.press('Escape')
  await page.getByTestId('field-0').click()
  // The coach says why it would wait; or, when the soil says now, planting is the suggested order, filled, with the fist.
  const holding = await game<boolean>(page, '!!app.needs()[0].hold')
  if (holding) await expect(page.getByTestId('card-line')).toContainText('Hold off planting')
  else await expect(page.getByTestId('order-plant')).toHaveClass(/is-suggested/)
  // Given, the order joins the crew's list, and its place on the card holds still for a moment.
  await page.getByTestId('order-plant').click()
  await expect.poll(async () => (await look(page)).queue).toBe(1)
  await expect(page.locator('#ui [data-testid="card"] .order.is-given')).toHaveCount(1)
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
  // A click on an order only opens its choices; its cross takes it off, says so, and the slip puts it back.
  await items.first().click()
  expect((await look(page)).queue).toBe(2)
  await page.locator('#ui .queue [data-testid^="list-x-"]').first().click()
  await expect.poll(async () => (await look(page)).queue).toBe(1)
  await expect(items.first()).toContainText('Planting North Ridge')
  const undo = page.locator('#ui [data-testid="alert"]', { hasText: 'taken off the list' })
  await expect(undo).toBeVisible()
  await undo.click()
  await expect.poll(async () => (await look(page)).queue).toBe(2)
  await page.locator('#ui .queue [data-testid^="list-x-"]').last().click()
  await expect.poll(async () => (await look(page)).queue).toBe(1)
  // A resting field offers nothing and says so in one line.
  await page.getByTestId('field-1').click()
  await expect(orders).toHaveCount(0)
  await expect(page.getByTestId('card-line')).toContainText('Resting in oats and clover')
  expect(errors, errors.join('\n')).toEqual([])
})

test('the crop orders hold their places when one is given, and under 80 words with nothing selected', async ({ page }) => {
  await startSeason(page)
  { const w = await wordsOnScreen(page); expect(w.n, w.by).toBeLessThan(80) }
  await reach(page, `q.run(q.day(6, 12))`)
  await putAway(page)
  await page.waitForTimeout(300)
  { const w = await wordsOnScreen(page); expect(w.n, w.by).toBeLessThan(80) }
  await page.getByTestId('field-2').click()
  const slots = page.locator('#ui [data-testid="card"] .orders.slots > .order')
  await expect(slots).toHaveCount(9)
  const at = () => slots.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return `${e.getAttribute('data-k')} ${Math.round(r.left)},${Math.round(r.top)}` }))
  // (once the card has finished laying itself down)
  await page.waitForTimeout(700)
  const before = await at()
  // An order given, or one refused with its reason, moves no other order.
  for (const k of ['c', 'w']) { await page.keyboard.press(k); await page.waitForTimeout(250); expect(await at()).toEqual(before) }
  // A reading a week old is marked as old (with the walks switched to "ask me", so nobody walks it by themselves).
  await reach(page, `const { app } = q.g(); app.do({ t: 'routine', kind: 'scout', auto: false }); for (const j of [...app.campaign.season.jobs]) if (j.kind === 'scout') app.do({ t: 'cancel', id: j.id })
    for (let k = 0; k < 9; k++) app.do({ t: 'day' })`)
  await putAway(page)
  await expect(page.getByTestId('blight-reading')).toHaveClass(/stale/)
  await expect(page.getByTestId('estimate')).toContainText('–')
})

test('a test dig is a tray beside the land, does not stop the clock, and can be reopened', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  // Spraying settled for the season first, as a player would when the question comes, so the days can run.
  await reach(page, `q.g().app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(6, 28), ['sample'])`)
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
  // The ticket comes once the crop is hauled in and weighed.
  await reach(page, `const { app } = q.g(); q.run(999, ['sell'], 'lot'); const s = app.campaign.season; for (let k = 0; k < 10 && !s.fields.some(f => f.weighed); k++) app.do({ t: 'day' })`)
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
  // The stored crop is on its field's card, with the ticket and the sale, once the last barrel is in.
  await putAway(page)
  await reach(page, `const { app } = q.g(); const s = app.campaign.season; for (let k = 0; k < 10 && s.fields.some(f => f.status === 'dug' && !f.weighed); k++) app.do({ t: 'day' }); app.setSpeed(0)`)
  await putAway(page)
  const field = await page.locator('#ui .plate', { hasText: ', dug' }).first().getAttribute('data-testid')
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
      // Picked by its number, as a field the camera may not have in frame is: the land is brought round to it.
      if (selected) await page.keyboard.press('Digit3')
      await page.waitForTimeout(1500)
      const found = await page.evaluate(sel => {
        const out: string[] = []
        const shown = (e: Element | null): e is HTMLElement => !!e && (e as HTMLElement).offsetParent !== null && (e as HTMLElement).offsetHeight > 0
        const rect = (q: string) => [...document.querySelectorAll<HTMLElement>(`#ui ${q}`)].filter(shown).map(e => e.getBoundingClientRect())
        // What the interface lays over the land: the two boards and the goal slip, the bar, the time book and its list,
        // the alerts, the clock at the thumb.
        const parts = ['.topbar .almanac > .mount', '.topbar .goal', '.topbar .bank > .mount', '.command', '.timebook', '.queue', '.notes .alert', '.clock-slot', '.paused']
        const boxes = parts.flatMap(rect)
        const desk = innerWidth >= 900 && innerHeight > 500
        // On a phone held upright the top is one board, no more than a fifth of the height (design/season.phone.html).
        const board = rect('.topbar .almanac > .mount')[0]
        if (innerWidth < 900 && innerHeight > 500 && board && board.bottom > innerHeight / 5 + 2) out.push(`the top board takes ${Math.round(board.bottom)} of ${innerHeight} px`)
        // At least half the window is land on a desk, whatever is selected.
        if (desk) {
          let free = 0, all = 0
          for (let y = 5; y < innerHeight; y += 10) for (let x = 5; x < innerWidth; x += 10) {
            all++
            if (!boxes.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) free++
          }
          if (free < all * 0.5) out.push(`the land has ${Math.round(free / all * 100)}% of the window${sel ? ' with a field selected' : ''}`)
        }
        // The field in hand is never under the interface: its tag is on the land, clear of everything, and so is the
        // middle of its near edge, where the land shows it.
        if (sel) {
          const tag = document.querySelector<HTMLElement>('#ui [data-testid="field-2"]')
          const r = tag && shown(tag) ? tag.getBoundingClientRect() : null
          if (!r) out.push('the tag of the field in hand is not on the land')
          else if (boxes.some(b => r.left < b.right - 1 && r.right > b.left + 1 && r.top < b.bottom - 1 && r.bottom > b.top + 1)) out.push('the tag of the field in hand is under the interface')
          const a = (globalThis as unknown as { __countyField?: { anchor?: (i: number) => { x: number; y: number; visible: boolean } } }).__countyField?.anchor?.(2)
          const over = a?.visible ? parts.find(q => rect(q).some(b => a.x > b.left && a.x < b.right && a.y > b.top && a.y < b.bottom)) : undefined
          if (over) out.push(`the field in hand is under the interface (${over})`)
        }
        if (document.documentElement.scrollWidth > innerWidth) out.push('the page scrolls sideways')
        for (const q of ['.topbar', '.command', '.timebook', '.queue', '.clock-slot', '.notes']) {
          for (const r of rect(q)) if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5 || r.top < -0.5) out.push(`${q} runs off the window`)
        }
        for (const el of document.querySelectorAll<HTMLElement>('#ui .topbar *, #ui .command *, #ui .timebook *, #ui .queue *')) {
          const text = [...el.childNodes].some(n => n.nodeType === 3 && (n.nodeValue ?? '').trim())
          if (text && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && !el.matches('.sr')) out.push(`clipped: ${el.className}`)
        }
        const spans = [...document.querySelectorAll<HTMLElement>('#ui .topbar > *')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0)
        for (let a = 0; a < spans.length; a++) for (let b = a + 1; b < spans.length; b++) {
          const x = Math.min(spans[a].right, spans[b].right) - Math.max(spans[a].left, spans[b].left)
          const y = Math.min(spans[a].bottom, spans[b].bottom) - Math.max(spans[a].top, spans[b].top)
          if (x > 1 && y > 1) out.push('parts of the top overlap')
        }
        if (matchMedia('(pointer: coarse)').matches) {
          for (const el of document.querySelectorAll<HTMLElement>('#ui button')) {
            const r = el.getBoundingClientRect()
            if (r.width && r.height && (r.width < 39.5 || r.height < 39.5)) out.push(`small target: ${el.dataset.testid ?? el.className}`)
          }
        }
        // The crop's nine orders each in its place, and the card's cross in the window with nothing over it.
        if (sel && document.querySelectorAll('#ui .command .orders.slots > .order').length !== 9) out.push('the crop orders are not all in their places')
        const x = sel ? document.querySelector<HTMLElement>('#ui [data-testid="card-close"]') : null
        if (sel) {
          const r = x && shown(x) ? x.getBoundingClientRect() : null
          if (!r || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) out.push('the card\'s cross is out of the window')
          else if (!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-testid="card-close"]')) out.push('something lies over the card\'s cross')
        }
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
  // The home six, and none of the land beyond them.
  for (let i = 0; i < 6; i++) await expect(page.getByTestId(`field-${i}`)).toHaveCount(1)
  for (let i = 6; i < 14; i++) await expect(page.getByTestId(`field-${i}`)).toHaveCount(0)
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
  // The figures come from the game, so a retuned price does not break the test.
  const rent = money(await game<number>(page, 'sim.PARCELS[10].rent'))
  const hand = money(await game<number>(page, 'sim.HAND_WAGE'))
  const plan = async () => money(await game<number>(page, 'sim.planCosts(app.campaign).total'))
  const before = await plan()
  await expect(page.locator('#ui .tag-at.is-land .plate').first()).toBeVisible()
  await page.getByTestId('land-10').click()
  const card = page.getByTestId('plan-card')
  await expect(card).toContainText('Dufour Upper')
  await expect(card).toContainText('Dufour potato house comes with it')
  await expect(card.getByTestId('land-rent')).toContainText(`${rent} a year`)
  await card.getByTestId('land-rent').click()
  await expect(page.getByTestId('field-10')).toHaveCount(1)
  await expect(page.getByTestId('plan-money')).toContainText(line('rent', rent))
  await expect(page.getByTestId('plan-money')).toContainText(line('This plan', await plan()))
  // The rented field is the seventh the farm holds, so the 7 key picks it.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Digit7')
  await expect(card.getByTestId('card-title')).toHaveText('Dufour Upper')
  await expect(card.getByTestId('tenure')).toContainText(`Rented, ${rent} this year`)
  await card.getByTestId('land-release').click()
  await expect(page.getByTestId('field-10')).toHaveCount(0)
  await expect(page.getByTestId('plan-money')).toContainText(line('This plan', before))
  await expect(card.getByTestId('land-rent')).toBeVisible()
  // The crew and the contracts are a press away; neither is needed to start.
  await page.keyboard.press('Escape')
  await page.getByTestId('crew-open').click()
  const crew = page.getByTestId('crew')
  // The spring's people come with their skills and asking wage; the hall has hands at the standard wage.
  await expect(crew).toContainText('hiring hall')
  await expect(crew.getByTestId('hire-hand')).toContainText(hand)
  await crew.getByTestId('hire-hand').click()
  await expect(crew).toContainText('Lucien')
  await page.getByTestId('crew-close').click()
  await expect(page.getByTestId('plan-money')).toContainText(line('wages', hand))
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
  await expect(page.getByTestId('person-card')).toBeVisible()
  // The person's page lies over the land, tags and all (a tag never moves aside for a card): the field by its key.
  await page.keyboard.press('Digit3')
  await expect(page.getByTestId('card-title')).toHaveText(await game<string>(page, 'sim.FIELD_NAMES[2]'))
  // Only what Lucien does can be given: the rest are greyed in their places.
  const orders = page.locator('#ui [data-testid="card"] button.order:not(.is-off):not(.is-given)')
  const kinds = await orders.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.testid))
  expect(kinds.every(k => ['order-scout', 'order-rogue', 'order-sample'].includes(k!))).toBe(true)
  await expect(page.locator('#ui .order-who')).toContainText('Lucien')
  await page.keyboard.press('h')
  await expect(page.getByTestId('card-line')).toContainText('Lucien is a field hand')
  await page.keyboard.press('c')
  const id = await page.evaluate(() => (globalThis as unknown as { __county: { app: { campaign: { season: { jobs: { id: number; kind: string; field: number; unit: number }[] } } } } }).__county.app.campaign.season.jobs.find(j => j.kind === 'scout' && j.field === 2)!.id)
  await expect(page.getByTestId(`queue-${id}`).locator('.q-tag.pinned')).toHaveText('L')
  // Any crew may take it again, from the choices above the order.
  // The choices above an order show under the pointer, and to the keyboard when the order has the focus.
  await page.getByTestId(`queue-${id}`).focus()
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
    app.do({ t: 'begin' }); app.setSpeed(0); q.run(999, ['sell'], 'lot')
    // A crop is delivered once it is hauled in and weighed.
    for (let k = 0; k < 10 && c.season.fields.some(f => f.status === 'dug' && !f.weighed); k++) app.do({ t: 'day' }); app.setSpeed(0)`)
  const ticket = page.getByTestId('weighin')
  await expect(ticket).toBeVisible({ timeout: 30_000 })
  const deliver = ticket.locator('[data-testid^="lot-deliver-"]')
  await expect(deliver).toContainText('Deliver to the fry plant')
  await expect(ticket.locator('.choice')).toContainText(/market/)
  await expect(ticket.getByTestId('store-houses')).toContainText('The potato house holds')
  await deliver.click()
  // Once the delivery slip has torn off, what is left can be sold or stored.
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
  await expect(page.getByTestId('plan-money')).toContainText(line('This plan', '$39,300'))
  await page.getByTestId('field-0').click()
  const card = page.getByTestId('plan-card')
  await expect(card).toContainText('North Ridge')
  await card.getByTestId('plan-variety-kennebec').check({ force: true })
  await expect(page.getByTestId('field-0')).toContainText('Kennebec')
  await card.getByTestId('plan-crop-rest').check({ force: true })
  await expect(page.getByTestId('field-0')).toContainText('Rest year')
  await expect(page.getByTestId('plan-money')).toContainText(line('This plan', '$29,850'))
  await card.getByTestId('plan-crop-potato').check({ force: true })
  // With seed in the cellar the choice appears, and says what it carries.
  await reach(page, `const a = q.g().app; a.campaign.seedStock = [{ variety: 'kennebec', fields: 1, virus: 0.3, blight: 0 }]; a.do({ t: 'plan', field: 0, plan: { crop: 'potato', variety: 'kennebec', seed: 'certified' } })`)
  await expect(card.getByTestId('seed-note')).toContainText('about 30% of plants')
  await card.getByTestId('plan-seed-saved').check({ force: true })
  await expect(page.getByTestId('plan-money')).toContainText(line('This plan', '$37,600'))
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
  await expect(menu).toContainText('Year 1 of 5')
  await expect(menu.getByTestId('quality-now')).toContainText('Drawing')
  await menu.getByTestId('units-metric').check({ force: true })
  await menu.getByTestId('how-open').click()
  await expect(page.getByTestId('how')).toContainText('Every key and order')
  await page.getByTestId('how-close').click()
  await menu.getByTestId('end-season-early').click()
  const confirm = page.getByTestId('confirm')
  await expect(confirm).toContainText('never planted')
  await expect(confirm).toContainText(money(await game<number>(page, 'sim.NOTE_PAYMENT + sim.LIVING')))
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('forecast')).toBeVisible()
  // Metric reaches the instruments.
  await page.getByTestId('field-0').click()
  await expect(page.getByTestId('card')).toContainText('°C')
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
  await expect(sheet).toContainText('The soil going into year 2')
  await page.getByTestId('year-next').click()
  await expect(page.getByTestId('begin-season')).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('the goal line says the one next thing, opens the ladder, and moves on when the goal is met', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  // Planting asked of the player (switched to "ask me"), so the goal can point at a field to plant.
  await reach(page, `q.g().app.do({ t: 'routine', kind: 'plant', auto: false })`)
  const goal = page.getByTestId('goal')
  await expect(goal).toContainText('Plant')
  const of = await game<number>(page, 'app.campaign.season.fields.filter((f, i) => sim.isField(app.campaign, i) && f.status === "idle").length')
  // Before the ground is fit the line says how long until it is; once it is, how many fields are planted.
  if (await page.getByTestId('goal-wait').count()) await expect(page.getByTestId('goal-wait')).toContainText('day')
  else await expect(goal).toContainText(`0/${of}`)
  await goal.click()
  const ladder = page.getByTestId('goals')
  await expect(ladder).toContainText('The way ahead')
  await expect(ladder).toContainText('Seed goes in once the soil has warmed')
  // The long goals wait until a year is behind the farm.
  await expect(ladder).not.toContainText('Long goals')
  await page.keyboard.press('Escape')
  await expect(ladder).toHaveCount(0)
  // Once the soil is warm the goal points at a field that can be planted.
  await reach(page, `const { app } = q.g(); for (let k = 0; k < 40 && !app.needs().some(n => n.need && n.need.act === 'plant'); k++) app.do({ t: 'day' }); app.setSpeed(0)`)
  await putAway(page)
  await expect(goal).toContainText(`Plant the fields0/${of}`)
  await goal.click()
  await page.getByTestId('goal-show').click()
  expect(await game<string>(page, 'app.needs()[app.selected]?.need?.act')).toBe('plant')
  // Every field planted: the line strikes through and the next goal writes itself in.
  await reach(page, `const { app, sim } = q.g(); const c = app.campaign
    for (let k = 0; k < 60 && c.season.fields.some((f, i) => sim.isField(c, i) && f.status === 'idle'); k++) { for (const a of sim.advise(app.world, c)) if (a.act === 'plant') app.order('plant', { fields: [a.field] }); app.do({ t: 'day' }) }
    app.setSpeed(0)`)
  await expect(page.getByTestId('goal')).toContainText('Walk a field for blight', { timeout: 5000 })
  expect(errors, errors.join('\n')).toEqual([])
})

test('people: a chip opens the card, priorities set by click and key, a raise, a foreman, and letting go', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  await expect(page.locator('#ui .unit.person')).toHaveCount(4)
  await page.getByTestId('unit-1').click()
  const card = page.getByTestId('person-card')
  await expect(card).toBeVisible()
  const name = await game<string>(page, 'app.campaign.crew.find(u => u.id === 1).name')
  await expect(card.getByTestId('person-name')).toHaveText(name)
  await expect(card.getByTestId('person-mood')).toContainText(/happy|content|fed up|unhappy|quit/i)
  await expect(card.getByTestId('person-tired')).toBeVisible()
  // A click makes the work come one step sooner (1 is first; past it, never); a digit sets it; nought is never.
  const prio = (k: string) => game<number>(page, `app.campaign.crew.find(u => u.id === 1).prio.${k}`)
  const was = await prio('machine')
  await card.getByTestId('prio-machine').click()
  expect(await prio('machine')).toBe(was === 1 ? 0 : was === 0 ? 4 : was - 1)
  await card.getByTestId('prio-field').focus()
  await page.keyboard.press('0')
  expect(await prio('field')).toBe(0)
  await expect(card.getByTestId('prio-field')).toContainText('priority –')
  await page.keyboard.press('1')
  expect(await prio('field')).toBe(1)
  // A raise goes to what they asked, or a tenth more.
  const wage = await game<number>(page, 'app.campaign.crew.find(u => u.id === 1).wage')
  await card.getByTestId('person-raise').click()
  expect(await game<number>(page, 'app.campaign.crew.find(u => u.id === 1).wage')).toBeGreaterThan(wage)
  await card.getByTestId('person-foreman').click()
  await card.getByTestId('foreman-home').click()
  expect(await game<string>(page, 'app.campaign.crew.find(u => u.id === 1).foreman')).toBe('home')
  await expect(card.getByTestId('person-doing')).toContainText('Foreman')
  await card.getByTestId('person-dismiss').click()
  await page.getByTestId('confirm-ok').click()
  await expect.poll(() => game<number>(page, 'app.campaign.crew.length')).toBe(3)
  expect(await game<number>(page, 'app.unit')).toBe(-1)
  await expect(card).toBeHidden()
  // Escape puts a person's card away.
  await page.getByTestId('unit-2').click()
  await expect(card).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  expect(errors, errors.join('\n')).toEqual([])
})

test('a person clicked on the land: their card opens beside them, says who and what, takes an order, and goes on Escape', async ({ page, isMobile }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  const name = await game<string>(page, 'app.campaign.crew.find(u => u.id === 1).name')
  const pin = page.getByTestId('pin-1')
  // Their own pin when it stands alone; standing with others, what a click on the land does (tools/quality/people.ts
  // clicks every body and pin at every tier).
  if (await pin.isVisible().catch(() => false)) await pin.click()
  else await page.evaluate(() => (globalThis as unknown as { __county: { app: { selectUnit(id: number, from: string): void } } }).__county.app.selectUnit(1, 'land'))
  const card = page.getByTestId('whois')
  await expect(card).toBeVisible()
  await expect(card.getByTestId('whois-name')).toHaveText(name)
  await expect(card.getByTestId('whois-now')).not.toBeEmpty()
  // The page at the foot stays shut: this card is the one beside them.
  await expect(page.getByTestId('person-card')).toBeHidden()
  if (!isMobile) {
    const a = await page.evaluate(() => (globalThis as unknown as { __countyField: { unitPin(id: number): { x: number; y: number; visible: boolean } } }).__countyField.unitPin(1))
    const r = (await card.boundingBox())!
    if (a.visible && a.x >= 0 && a.x <= page.viewportSize()!.width && a.y >= 0 && a.y <= page.viewportSize()!.height) {
      const dx = Math.max(r.x - a.x, 0, a.x - (r.x + r.width)), dy = Math.max(r.y - a.y, 0, a.y - (r.y + r.height))
      expect(Math.hypot(dx, dy)).toBeLessThan(240)
    }
  }
  // One press puts a kind of work first for them.
  await card.getByTestId('whois-first-field').click()
  expect(await game<number>(page, 'app.campaign.crew.find(u => u.id === 1).prio.field')).toBe(1)
  await expect(card.getByTestId('whois-first-field')).toHaveAttribute('aria-pressed', 'true')
  // Their page opens from it.
  await card.getByTestId('whois-more').click()
  await expect(page.getByTestId('person-card')).toBeVisible()
  await expect(card).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('person-card')).toBeHidden()
  // And back on the land, Escape puts it away.
  await page.evaluate(() => (globalThis as unknown as { __county: { app: { selectUnit(id: number, from: string): void } } }).__county.app.selectUnit(1, 'land'))
  await expect(card).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  expect(errors, errors.join('\n')).toEqual([])
})

test('the work grid: G opens it, a click or a key sets a cell, and the farm rules say their cost and catch', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  await page.keyboard.press('g')
  const grid = page.getByTestId('work-grid')
  await expect(grid).toBeVisible()
  await expect(grid.locator('tbody tr')).toHaveCount(4)
  const prio = (id: number, k: string) => game<number>(page, `app.campaign.crew.find(u => u.id === ${id}).prio.${k}`)
  const was = await prio(2, 'woods')
  await grid.getByTestId('cell-2-woods').click()
  expect(await prio(2, 'woods')).toBe(was === 1 ? 0 : was === 0 ? 4 : was - 1)
  // The grid says which way a click goes.
  await expect(grid.getByTestId('grid-how')).toContainText('A click makes the work come sooner')
  // The arrow keys walk the grid and a digit sets the cell under the focus.
  await grid.getByTestId('cell-2-woods').focus()
  await page.keyboard.press('ArrowRight')
  await expect(grid.getByTestId('cell-2-build')).toBeFocused()
  await page.keyboard.press('4')
  expect(await prio(2, 'build')).toBe(4)
  await page.keyboard.press('ArrowDown')
  await expect(grid.getByTestId('cell-3-build')).toBeFocused()
  await page.keyboard.press('Delete')
  expect(await prio(3, 'build')).toBe(0)
  await expect(grid).toContainText('Working Sundays gains a day')
  // Pickers come forward only near the harvest break; in June there is nothing to decide about them.
  await expect(grid.getByTestId('rule-pickers')).toHaveCount(0)
  await grid.getByTestId('rule-sundays').click()
  expect(await game<boolean>(page, 'app.campaign.sundaysOff')).toBe(false)
  await expect(grid.getByTestId('rule-sundays')).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Escape')
  await expect(grid).toBeHidden()
  expect(errors, errors.join('\n')).toEqual([])
})

test('building: Y opens the yard, a building is chosen and ordered, and it goes up with people on it', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  await reach(page, `const { app } = q.g(); app.campaign.cash += 40000; app.select(-1)`)
  await page.keyboard.press('y')
  const yard = page.getByTestId('yard-card')
  await expect(yard).toBeVisible()
  await expect(yard.getByTestId('yard-title')).toHaveText('The home yard')
  // Each building is an order on the yard's bar: its cost in dollars, logs and crew-days, then its catch.
  const stand = yard.getByTestId('build-stand')
  await expect(stand).toContainText('Catch:')
  await expect(stand).toContainText(/crew-days?/)
  await stand.click()
  expect(await game<number>(page, 'app.campaign.buildings.filter(b => b.kind === "stand").length')).toBe(1)
  await expect(yard.getByTestId('going-stand')).toBeVisible()
  // The order is on the list, and it cannot be cancelled: it is paid for.
  await expect(page.locator('#ui .queue [data-testid^="queue-"]').first()).toBeVisible()
  await reach(page, `const { app } = q.g(); for (let k = 0; k < 12 && !app.campaign.buildings.find(b => b.kind === 'stand').built; k++) app.do({ t: 'day' }); app.setSpeed(0)`)
  await expect(yard.getByTestId('built-stand')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(yard).toBeHidden()
  expect(errors, errors.join('\n')).toEqual([])
})

test('an incident is one card with its choices and what each does; put away, it waits on the people bar', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  await reach(page, `const { app, sim } = q.g(); const c = app.campaign; c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    const a = sim.applicantsFor(c.seed, c.year, new Set(c.crew.map(u => u.name)), 1, c.season.day)[0]
    c.incidents.push({ id: c.nextIncident++, kind: 'applicant', day: c.season.day, until: c.season.day + 4, choices: ['hire', 'pass'], applicant: a })
    app.setSpeed(1); app.setSpeed(0)`)
  const card = page.getByTestId('incident')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Someone asks for work')
  await expect(card.getByTestId('answer-hire')).toContainText('starts at')
  await expect(card.getByTestId('answer-pass')).toContainText('elsewhere')
  await expect(card).toContainText('Unanswered')
  // Each reply says what it costs against the other, in plain words.
  await expect(card.getByTestId('answer-hire')).toContainText('a month in wages')
  await expect(card.getByTestId('answer-pass')).toContainText('Costs nothing')
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  await page.getByTestId('incident-open').click()
  await expect(card).toBeVisible()
  const before = await game<number>(page, 'app.campaign.crew.length')
  await card.getByTestId('answer-hire').click()
  await expect(card).toBeHidden()
  expect(await game<number>(page, 'app.campaign.crew.length')).toBe(before + 1)
  await expect(page.getByTestId('incident-open')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a tract cleared through the interface: felled, the stumps pulled, the rocks picked', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  await reach(page, `const { app } = q.g(); app.campaign.cash += 20000; app.select(14)`)
  const card = page.getByTestId('card')
  await expect(card.getByTestId('card-title')).toHaveText('Home Woodlot')
  await expect(card.getByTestId('clear-track')).toContainText('Fell')
  await expect(card.getByTestId('clear-track')).toHaveAttribute('aria-label', /standing/)
  await expect(card).toContainText('loads of logs')
  // X fells, for the axe.
  await page.keyboard.press('x')
  expect(await game<number>(page, 'app.campaign.season.jobs.filter(j => j.kind === "fell" && j.field === 14).length')).toBe(1)
  await reach(page, `const { app } = q.g(); const c = app.campaign; c.fields[14].felled = 39.8
    for (let k = 0; k < 10 && c.fields[14].cover === 'woods'; k++) app.do({ t: 'day' }); app.setSpeed(0)`)
  await expect(card.getByTestId('clear-track')).toHaveAttribute('aria-label', /felled/)
  await expect(page.getByTestId('materials')).toBeVisible()
  await card.getByTestId('order-stump').click()
  expect(await game<string>(page, 'app.campaign.fields[14].works?.kind')).toBe('stump')
  await reach(page, `const { app } = q.g(); const c = app.campaign; for (let k = 0; k < 14 && c.fields[14].cover !== 'open'; k++) app.do({ t: 'day' }); app.setSpeed(0)`)
  await expect(card.getByTestId('clear-track')).toHaveAttribute('aria-label', /stumped/)
  await page.keyboard.press('o')
  await reach(page, `const { app, sim } = q.g(); const c = app.campaign; for (let k = 0; k < 14 && c.fields[14].stones >= sim.ROCKS_ADVISE; k++) app.do({ t: 'day' }); app.setSpeed(0)`)
  await expect(card.getByTestId('clear-track')).toHaveAttribute('aria-label', /picked/)
  expect(errors, errors.join('\n')).toEqual([])
})

test('Start the season runs the clock at 1x with no click; a weigh ticket stops it and answering goes on at the speed set', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('forecast')).toBeVisible()
  // Running, at 1x, with nothing to dismiss and the days going by.
  const start = await look(page)
  expect(start.paused).toBe(false)
  expect(start.speed).toBe(1)
  await expect(page.getByTestId('paused')).toBeHidden()
  // The clock's state is said in the same place either way: running, at what speed.
  await expect(page.getByTestId('running')).toContainText('1×')
  await expect(page.getByTestId('idle-note')).toHaveCount(0)
  const day0 = await game<number>(page, 'app.campaign.season.day')
  await expect.poll(() => game<number>(page, 'app.campaign.season.day'), { timeout: 10_000 }).toBeGreaterThan(day0)
  // The goal line says what comes next: planting, or how long until the soil is warm enough.
  await expect(page.getByTestId('goal')).toContainText(/Plant/)
  // Brought to the first dig, set to 2x by its button, the clock runs the dig and the haul until the ticket stops it.
  await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run('digging', ['sell'], 'status'); app.campaign.incidents = []; app.do({ t: 'sprayWay', way: 'ask' })`)
  await putAway(page)
  await page.getByTestId('speed-2').click()
  const ticket = page.getByTestId('weighin')
  await untilTicket(page)
  expect((await look(page)).paused).toBe(true)
  await ticket.locator('[data-testid^="lot-sell-"]').first().click()
  await expect(ticket).toHaveCount(0)
  await expect.poll(async () => (await look(page)).speed).toBe(2)
  expect(errors, errors.join('\n')).toEqual([])
})

test('tags and stamps hold still when a card opens or closes and when an order is given, so the next click lands where it was aimed', async ({ page }) => {
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await startSeason(page)
  // Late August, stopped, with the player's calls (spray, the vine kill) left as stamps on the fields.
  await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run(q.day(7, 28), ['spray', 'kill', 'sell']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1)`)
  await putAway(page)
  // Where every tag and stamp on the land is now, by test id.
  const where = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>('#ui .plate[data-testid^="field-"], #ui [data-testid^="badge-"]')]
    .filter(e => !e.closest('.gone, [hidden]')).map(e => { const r = e.getBoundingClientRect(); return [e.dataset.testid!, [Math.round(r.left), Math.round(r.top)]] })))
  const moved = (a: Record<string, number[]>, b: Record<string, number[]>) => Object.keys(a).filter(k => b[k] && Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]) > 2)
  const before = await where()
  const stamps = Object.keys(before).filter(k => k.startsWith('badge-') && k !== 'badge-0').map(k => Number(k.slice(6)))
  expect(stamps.length).toBeGreaterThan(1)
  const selects = () => game<number>(page, 'window.__selects ?? 0')
  await page.evaluate(() => { const { app } = (globalThis as any).__county; (globalThis as any).__selects = 0; app.on((e: any) => { if (e.type === 'select') (globalThis as any).__selects++ }) })
  // The camera at rest first: tags go with their fields while it moves, as they should.
  const still = async () => { let a = '', b = '-'; while (a !== b) { a = b; await page.waitForTimeout(300); b = JSON.stringify(await page.evaluate(() => [0, 1, 2, 9].map(i => { const p = (globalThis as any).__countyField.anchor(i); return [Math.round(p.x), Math.round(p.y)] }))) } }
  for (const [n, close] of [[stamps[0], 'Escape'], [stamps[1], 'cross']] as const) {
    await still()
    const was = await where()
    await page.getByTestId('field-0').click()
    await expect(page.getByTestId('card-title')).toHaveText('North Ridge')
    await page.waitForTimeout(500)
    expect(moved(was, await where()), `a card opening moves nothing on the land (settled: ${await page.evaluate(() => document.querySelector<HTMLElement>('#ui .plate-layer')?.dataset.settled)})`).toEqual([])
    // An order by its letter key: the tags stay put though North Ridge's tag now says "on the list".
    const cam0 = await page.evaluate(() => JSON.stringify((globalThis as any).__countyField.stats().camera))
    await page.keyboard.press('s')
    await page.waitForTimeout(300)
    const cam1 = await page.evaluate(() => JSON.stringify((globalThis as any).__countyField.stats().camera))
    expect(cam1, 'an order leaves the camera where it was').toBe(cam0)
    expect(moved(was, await where()), `an order moves nothing on the land (settled: ${await page.evaluate(() => document.querySelector<HTMLElement>('#ui .plate-layer')?.dataset.settled)})`).toEqual([])
    // The card's cross is in view and nothing lies over it.
    const x = (await page.getByTestId('card-close').boundingBox())!
    expect(await page.evaluate(([cx, cy]) => !!document.elementFromPoint(cx, cy)?.closest('[data-testid="card-close"]'), [x.x + x.width / 2, x.y + x.height / 2])).toBe(true)
    if (close === 'Escape') await page.keyboard.press('Escape')
    else await page.mouse.click(x.x + x.width / 2, x.y + x.height / 2)
    await expect(page.locator(PRESSED)).toHaveCount(0)
    await page.waitForTimeout(500)
    expect(moved(was, await where()), 'a card closing moves nothing on the land').toEqual([])
    // The stamp is still where it was aimed at, and the click on it gives its order without selecting anything.
    const kind = await game<string>(page, `app.needs()[${n}].need.act`)
    const b = was[`badge-${n}`]
    const box = (await page.getByTestId(`badge-${n}`).boundingBox())!
    const at0 = await selects()
    const over = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y) as HTMLElement | null; return `${e?.tagName}.${e?.className} ${e?.closest('[data-testid]')?.getAttribute('data-testid')}` }, [b[0] + box.width / 2, b[1] + box.height / 2])
    expect(over, 'the stamp is what lies at the point').toContain(`badge-${n}`)
    await page.mouse.click(b[0] + box.width / 2, b[1] + box.height / 2)
    await expect.poll(() => game<string>(page, `app.campaign.season.jobs.filter(j => j.field === ${n}).map(j => j.kind).join(',') + ' | ' + (document.querySelector('#ui .notes')?.textContent ?? '')`), { timeout: 2000 }).toContain(kind)
    expect(await selects() - at0, 'the stamp click selected nothing').toBe(0)
    expect(await game<number[]>(page, 'app.selection')).toEqual([])
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('every order on the list says who takes it and when, or why nobody will', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  // Nobody on the farm will do machine work: a spray order has no taker, and the list says so.
  await reach(page, `const { app } = q.g(); const c = app.campaign; for (const j of [...c.season.jobs]) app.do({ t: 'cancel', id: j.id })
    for (const u of c.crew) app.do({ t: 'priority', unit: u.id, work: 'machine', level: 0 })
    app.do({ t: 'job', kind: 'spray', field: 0 })`)
  const id = await game<number>(page, `app.campaign.season.jobs.find(j => j.kind === 'spray').id`)
  await expect(page.getByTestId(`nobody-${id}`)).toBeVisible()
  await page.getByTestId(`queue-${id}`).click()
  await expect(page.getByTestId(`fate-${id}`)).toContainText(/Nobody|will not/)
  // Put back to the work, someone takes it, and the list says who.
  await reach(page, `const { app } = q.g(); app.do({ t: 'priority', unit: app.campaign.crew[0].id, work: 'machine', level: 1 })`)
  await expect(page.getByTestId(`nobody-${id}`)).toHaveCount(0)
  await expect(page.getByTestId(`queue-${id}`)).toHaveAttribute('title', /takes it|is on it|Waiting|Sunday/)
  expect(errors, errors.join('\n')).toEqual([])
})

test('blight weather asks once how to spray this season, and a worn-out hand can be rested', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  // The first blight weather of the season: one question, with what keeping the fields sprayed would cost.
  await reach(page, `const { app } = q.g(); const c = app.campaign; let n = 0
    while (c.season.watchDay < 0 && n++ < 120) { q.run(c.season.day + 1, ['spray']); c.incidents = [] }
    app.setSpeed(0)`)
  test.skip(await game<number>(page, 'app.campaign.season.watchDay') < 0, 'no blight weather this year')
  // Asked by itself, on the telegram card, with the clock stopped.
  await reach(page, `q.g().app.setSpeed(1)`)
  const ask = page.getByTestId('spray-ask')
  await expect(ask).toBeVisible()
  expect((await look(page)).paused).toBe(true)
  // Decide later: the days go on, and the card does not come straight back.
  const day0 = await game<number>(page, 'app.campaign.season.day')
  await page.keyboard.press('Escape')
  await expect(ask).toBeHidden()
  await expect.poll(() => game<number>(page, 'app.campaign.season.day'), { timeout: 15_000 }).toBeGreaterThan(day0)
  await expect(ask).toBeHidden()
  await reach(page, `q.g().app.setSpeed(0)`)
  // (a test dig the crew made while the days ran is put away first)
  if (await page.getByTestId('sample-close').isVisible().catch(() => false)) await page.getByTestId('sample-close').click()
  // Asked again from a field's card or Who does what.
  await page.keyboard.press('g')
  await page.getByTestId('spray-ask-open').click()
  await expect(ask).toBeVisible()
  await expect(ask).toContainText('Keep the fields sprayed')
  await ask.getByTestId('spray-way-auto').click()
  await expect(ask).toBeHidden()
  expect(await game<boolean>(page, `sim.routineInfo(app.campaign).find(r => r.kind === 'spray').auto`)).toBe(true)
  await page.keyboard.press('Escape')
  // The crew then sprays by itself, and no stamp or chip asks for spraying.
  await reach(page, `const { app } = q.g(); const c = app.campaign; for (let k = 0; k < 4; k++) { c.incidents = []; app.do({ t: 'day' }) } app.setSpeed(0)`)
  expect(await game<number>(page, `app.campaign.season.jobs.filter(j => j.kind === 'spray' && j.by === 'routine').length + app.campaign.season.fields.reduce((t, f) => t + (f.sprays ?? 0), 0)`)).toBeGreaterThan(0)
  expect(await page.evaluate(() => [...document.querySelectorAll('#ui [data-testid^="badge-"]')].filter(b => /spray/i.test(b.getAttribute('title') ?? b.textContent ?? '')).length)).toBe(0)
  expect(await page.evaluate(() => /spray/i.test(document.querySelector('#ui [data-testid="pressing"]')?.textContent ?? ''))).toBe(false)
  // Asked once: it does not come back by itself; Who does what asks it again.
  await page.waitForTimeout(400)
  await expect(page.getByTestId('spray-ask')).toBeHidden()
  if (await page.getByTestId('sample-close').isVisible().catch(() => false)) await page.getByTestId('sample-close').click()
  await page.keyboard.press('g')
  await page.getByTestId('spray-ask-open').click()
  await page.getByTestId('spray-ask').getByTestId('spray-way-ask').click()
  expect(await game<boolean>(page, `sim.routineInfo(app.campaign).find(r => r.kind === 'spray').auto`)).toBe(false)
  await page.keyboard.press('Escape')
  // A hand worked to the bone: their page says so and rests them on a press.
  await reach(page, `const { app } = q.g(); app.campaign.crew[1].tired = 0.97`)
  await page.getByTestId('unit-1').click()
  const card = page.getByTestId('person-card')
  await expect(card.getByTestId('person-tired')).toContainText(/worn out|resting/)
  await card.getByTestId('person-rest-now').click()
  expect(await game<string>(page, 'app.campaign.crew[1].rest')).toBe('now')
  await expect(card.getByTestId('person-rest-now')).toHaveAttribute('aria-pressed', 'true')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a field says which work the crew does by itself and which waits for the player, and the first planting is said with Show me', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  // Days run until the crew takes up planting by itself: a note says so, and Show me goes to who is planting.
  await reach(page, `const { app } = q.g(); const c = app.campaign; for (let k = 0; k < 90 && !c.season.jobs.some(j => j.kind === 'plant' && c.crew.some(u => u.job === j.id)); k++) { c.incidents = []; app.do({ t: 'day' }) } app.setSpeed(0)`)
  const note = page.locator('#ui [data-testid="alert"]', { hasText: 'Planting by itself' })
  await expect(note).toBeVisible()
  await note.click()
  await expect(page.getByTestId('whois')).toBeVisible()
  await page.keyboard.press('Escape')
  // A field's card: the crew's work on it and when, and the kinds of work that are the player's.
  const field = await game<number>(page, `app.campaign.season.jobs.find(j => j.kind === 'plant').field`)
  await reach(page, `q.g().app.select(${field})`)
  await expect(page.getByTestId('card-whose')).toContainText('The crew')
  await expect(page.getByTestId('card-whose')).toContainText(/Yours: .*spray/i)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the clock and the keys as a player meets them: Space just after an answer keeps the days going, a press on the land holds them, Escape after a ticket opens no menu', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.setSpeed(0); app.do({ t: 'sprayWay', way: 'ask' }); q.run('digging', ['sell'], 'status'); app.campaign.incidents = []`)
  await putAway(page)
  await page.getByTestId('speed-2').click()
  const ticket = page.getByTestId('weighin')
  await untilTicket(page)
  // Answered, the days go on by themselves; a Space a moment later is not taken back as a pause.
  await ticket.locator('[data-testid^="lot-sell-"]').first().click()
  await expect(ticket).toHaveCount(0)
  await page.keyboard.press('Space')
  expect((await look(page)).speed).toBe(2)
  // Escape just after the ticket went opens no menu.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('menu')).toHaveCount(0)
  // A press held on open land holds the days.
  const spot = await page.evaluate(() => { const land = document.getElementById('field'); for (let fy = 0.3; fy < 0.8; fy += 0.03) for (let fx = 0.15; fx < 0.85; fx += 0.04) { const x = innerWidth * fx, y = innerHeight * fy; if (document.elementFromPoint(x, y) === land) return { x, y } } return null })
  expect(spot).not.toBeNull()
  await page.mouse.move(spot!.x, spot!.y)
  await page.mouse.down()
  const d0 = await game<number>(page, 'app.campaign.season.day')
  await page.waitForTimeout(2500)
  expect(await game<number>(page, 'app.campaign.season.day')).toBe(d0)
  await page.mouse.up()
  await expect.poll(() => game<number>(page, 'app.campaign.season.day'), { timeout: 15_000 }).toBeGreaterThan(d0)
  expect(errors, errors.join('\n')).toEqual([])
})
