// Gate 7: a player can start a farm, work a season, dig, sell, close the year, and find the save again; and a later
// year can use the farmstead: people, land on the mortgage, a tract cleared, a building raised, winter work.
// Everything goes through the interface: Play, Start, badges, right-clicks, Space, the papers. Where a step belongs to
// the instruments' half (the card that asks an incident), it is answered there if that card is on screen, and through
// the test hook if not. Play gives a farm of its own with seasons made from a random seed, so nothing here may count
// on one year's weather, and money is read from the game rather than written into the test.
import { test, type Page } from '@playwright/test'
import { expect, look, noSidewaysScroll, putAway, reach, straightIn, watchErrors } from './helpers.ts'

const BADGE = '#ui [data-testid^="badge-"]'

// The game's own figures, read through the test hook.
function game<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(() => { const { app, sim } = window.__county; const c = app.campaign; return ${fn} })()`) as Promise<T>
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

// Answers the ticket on screen. The next field's ticket can open the moment this one closes, so what is waited for is
// this lot's own choice going, not every ticket.
async function answerTicket(page: Page, store: boolean): Promise<void> {
  const ticket = page.getByTestId('weighin')
  const keep = ticket.locator('[data-testid^="lot-keep-"]')
  const id = (await keep.first().getAttribute('data-testid'))?.replace('lot-keep-', '') ?? ''
  const mine = page.getByTestId(`lot-keep-${id}`)
  // A crop a contract wants goes to the buyer first; what is left is sold or stored.
  const deliver = ticket.getByTestId(`lot-deliver-${id}`)
  if (await deliver.count()) {
    await deliver.click()
    await page.waitForTimeout(200)
    if (!(await mine.count())) return
  }
  const sell = ticket.getByTestId(`lot-sell-${id}`)
  const advised = await ticket.locator('.choice-advice').count()
  if ((await sell.count()) && (advised || !store)) await sell.click()
  else await mine.click()
  await expect(mine).toHaveCount(0)
}

// Answers the first open incident: on its card where the instruments show one (a button named for the choice), and
// through the test hook where they do not. take: the first choice rather than the default. Returns how it was answered.
async function answerIncident(page: Page, take: boolean): Promise<'card' | 'hook' | ''> {
  // The spraying question comes on the telegram card once a season: answered as most players would, ask me each time.
  const spray = page.getByTestId('spray-way-ask')
  if (await spray.isVisible().catch(() => false)) {
    await spray.click()
    await expect(page.getByTestId('spray-ask')).toBeHidden()
    return 'card'
  }
  const inc = await game<{ id: number; choice: string; label: string } | null>(page, `(() => { const i = c.incidents[0]; if (!i) return null
    const ch = ${take} && !(i.choices[0] === 'hire' && sim.hireRoom(c)) ? i.choices[0] : i.choices[i.choices.length - 1]
    return { id: i.id, choice: ch, label: sim.CHOICE_LABEL[ch] } })()`)
  if (!inc) return ''
  const button = page.locator('#ui').getByRole('button', { name: inc.label, exact: true })
  if (await button.count() && await button.first().isVisible()) {
    await button.first().click()
    await expect.poll(() => game<number>(page, `c.incidents.filter(i => i.id === ${inc.id}).length`)).toBe(0)
    return 'card'
  }
  await page.evaluate(`window.__county.app.do({ t: 'answer', incident: ${inc.id}, choice: '${inc.choice}' })`)
  return 'hook'
}

// Answers a weigh ticket or a telegram that is up now, as a player would. True when there was one.
async function answerWhatIsUp(page: Page): Promise<boolean> {
  const s = await look(page)
  if (s.ticket) { await answerTicket(page, true); return true }
  if (s.incidents || s.spray) return (await answerIncident(page, false)) !== ''
  return false
}

// The fastest of the three speeds, from its own button, or on a phone by stepping the one speed button round.
async function fastest(page: Page): Promise<void> {
  const three = page.getByTestId('speed-3')
  await ((await three.count()) ? three : page.getByTestId('speed-cycle')).click({ timeout: 3000 }).catch(() => {})
}

// The short path through a season: what glows is given (by its badge, or by a right-click on the field), Space sets the
// days going again after a card, the clock is set to 3x for the quiet weeks, tickets and incidents are answered. Stops
// at the first ticket or when the season is done.
async function farm(page: Page, until: 'ticket' | 'done', o: { store: boolean; mobile: boolean; ms?: number; answered?: string[] }): Promise<void> {
  let given = 0
  const deadline = Date.now() + (o.ms ?? 300_000)
  while (Date.now() < deadline) {
    const s = await look(page)
    if (s.ticket) {
      if (until === 'ticket') return
      await answerTicket(page, o.store)
      continue
    }
    if (s.done) {
      if (until === 'done') return
      throw new Error('the season ended before a crop was dug')
    }
    if (s.incidents) { const how = await answerIncident(page, false); if (how) o.answered?.push(how); continue }
    if (s.spray) { await answerIncident(page, false); continue }
    if (s.paper) { await page.keyboard.press('Escape'); continue }
    if (s.hint) { await page.getByTestId('hint-close').click({ timeout: 3000 }).catch(() => {}); continue }
    if (s.tray) { await page.getByTestId('sample-close').click({ timeout: 3000 }).catch(() => {}); continue }
    if (s.badges.length) {
      const id = s.badges[0]
      // A right-click on the field gives what its badge would; a phone has the badge.
      if (!o.mobile && given++ % 2 === 0) await page.getByTestId(`field-${id.split('-')[1]}`).click({ button: 'right', timeout: 3000 }).catch(() => {})
      else await page.getByTestId(id).click({ timeout: 3000 }).catch(() => {})
      continue
    }
    if (s.paused) { await page.keyboard.press('Space'); await page.waitForTimeout(150); continue }
    if (s.speed < 3) await fastest(page)
    await page.waitForTimeout(120)
  }
  throw new Error('the season did not finish in time')
}

async function winterAndYearEnd(page: Page): Promise<void> {
  // The last weigh ticket can arrive as the season closes; it is answered first.
  await page.waitForTimeout(500)
  while (await page.getByTestId('weighin').count()) await answerTicket(page, true)
  await page.getByTestId('end-season').click()
  await expect(page.getByTestId('month-next')).toBeVisible()
  for (let i = 0; i < 9 && !(await page.getByTestId('year-next').count()); i++) {
    const half = page.locator('#ui [data-testid^="lot-sell-half-"]')
    if (i === 1 && (await half.count())) await half.first().click()
    await page.getByTestId('month-next').click()
    await page.waitForTimeout(250)
  }
  await expect(page.getByTestId('year-next')).toBeVisible()
}

test('a first season by the short path, from the opening to the next spring, with a save that survives a reload', async ({ page, isMobile }) => {
  test.setTimeout(1_200_000)
  const errors = watchErrors(page)
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  // The opening asks one thing, once in a browser: start the tutorial or skip it. Then Start: three clicks
  // from the landing page to a running season, two ever after.
  let clicks = 0
  await page.getByTestId('play').click(); clicks++
  await straightIn(page); clicks++
  await expect(page.getByTestId('begin-season')).toBeVisible()
  const held = await game<number>(page, 'c.fields.filter(f => f.tenure !== "none").length')
  await expect(page.locator('#ui [data-testid^="field-"].plate')).toHaveCount(held)
  // The first spring as a newcomer sees it: a short sheet, the offers folded.
  const words = await page.getByTestId('spring').evaluate(el => (el as HTMLElement).innerText.split(/\s+/).filter(Boolean).length)
  console.log(`the first spring paper: ${words} words`)
  // Short, and it says where the money stands before the first Start: what the farm has, the loan, what comes due.
  expect(words).toBeLessThan(115)
  await expect(page.getByTestId('crew')).toHaveCount(0)
  await page.getByTestId('begin-season').click(); clicks++
  await expect(page.getByTestId('forecast')).toBeVisible()
  await expect.poll(async () => (await look(page)).running).toBe(true)
  console.log(`clicks from the landing page to a running season: ${clicks}`)
  expect(clicks).toBe(3)

  // Start goes straight into a running game at 1x: no chip to dismiss, nothing more to press.
  expect((await look(page)).speed).toBe(1)
  await expect(page.getByTestId('paused')).toBeHidden()
  // Nothing has to be ordered: once the ground is fit the crew puts the planting on the list by itself. The clock keeps
  // the speed it was given; a question that comes meanwhile is answered on its card, as a player would, and the clock
  // goes on at 1x.
  await expect.poll(async () => {
    const s = await look(page)
    if (s.incidents) await answerIncident(page, false)
    return game<number>(page, `c.season.jobs.filter(j => j.by === 'routine').length + c.season.worked.length`)
  }, { timeout: 240_000, intervals: [500] }).toBeGreaterThan(0)
  expect(await game<number>(page, `c.season.jobs.filter(j => j.by === 'you').length`)).toBe(0)
  // An answer takes a frame to show on the clock.
  await expect.poll(async () => (await look(page)).paused).toBe(false)
  expect((await look(page)).speed).toBe(1)

  // A crop weighed in is the one thing that stops it, once the last barrel is hauled in from the field.
  await farm(page, 'ticket', { store: true, mobile: isMobile, ms: 600_000 })
  const ticket = page.getByTestId('weighin')
  await expect(ticket).toBeVisible()
  const lot = await game<{ inField: number; weighed: boolean }>(page, `(() => { const l = c.lots.find(x => x.open); const f = c.season.fields[l.field]; return { inField: f.inField, weighed: f.weighed } })()`)
  expect(lot.weighed).toBe(true)
  expect(lot.inField).toBeLessThan(0.5)
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
  // Answered, the days go on at the speed they had: the short path had set 3x. Read from the clock's own changes,
  // the first speed it takes after the answer, so that what comes next (a second ticket, a telegram) cannot be
  // mistaken for it; anything that does come first is answered as a player would.
  await page.evaluate(() => {
    const w = globalThis as unknown as { __speeds: number[]; __county: { app: { on(f: (e: { type: string; speed?: number }) => void): void } } }
    w.__speeds = []
    w.__county.app.on(e => { if (e.type === 'speed') w.__speeds.push(e.speed ?? 0) })
  })
  await answerTicket(page, true)
  await expect.poll(async () => {
    const first = await page.evaluate(() => (globalThis as unknown as { __speeds: number[] }).__speeds.find(s => s > 0) ?? 0)
    if (!first) await answerWhatIsUp(page)
    return first
  }, { timeout: 60_000, intervals: [200] }).toBe(3)

  // Stop, reload, continue: the same day and the same cash. Stopped by the player with nothing asking: a ticket or
  // a telegram that lands first is answered and the stop tried again, so the reload never meets a card half answered.
  await expect.poll(async () => {
    if (await answerWhatIsUp(page)) return false
    const mine = await game<boolean>(page, `app.speed === 0 && app.pauseReason === '' && !c.incidents.length`)
    if (mine) return !(await look(page)).paper
    const whole = page.getByTestId('speed-0')
    await ((await whole.count()) ? whole : page.getByTestId('speed-toggle')).click({ timeout: 2000 }).catch(() => {})
    return false
  }, { timeout: 120_000, intervals: [200] }).toBe(true)
  const before = await look(page)
  await page.waitForTimeout(3000)
  await page.reload()
  await page.getByTestId('continue').click()
  await expect(page.getByTestId('forecast')).toBeVisible()
  const after = await look(page)
  expect(after.date).toBe(before.date)
  expect(after.cash).toBe(before.cash)
  expect(after.paused).toBe(true)
  // Continued, the farm waits, with one way on: the Go on chip at a desk, the clock at the thumb on a phone.
  await expect(isMobile ? page.locator('#ui [data-testid="speed-0"]:visible, #ui [data-testid="speed-toggle"]:visible').first() : page.getByTestId('paused-go')).toBeVisible()

  // The rest of the season, the winter, and the year end.
  await farm(page, 'done', { store: false, mobile: isMobile })
  await winterAndYearEnd(page)
  // A made-up first year can be hard enough to lose the farm; either way the sheet says so and the game goes on.
  if (await page.getByTestId('lost-moment').count()) {
    await page.getByTestId('year-next').click()
    await expect(page.getByTestId('over-title')).toBeVisible()
  } else {
    await expect(page.getByTestId('outcome')).toContainText('The bank is happy')
    await expect(page.getByTestId('next-goal')).toBeVisible()
    await page.getByTestId('year-next').click()
    await expect(page.getByTestId('begin-season')).toBeVisible()
    await expect(page.getByTestId('date')).toHaveText('Spring')
    await expect(page.locator('#ui main:not(.leaving) .tb-year')).toHaveText('Year 2')
  }

  await noSidewaysScroll(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a later year on the farmstead: an applicant hired, land on the mortgage, a tract felled and cleared, a building raised, an incident answered, winter work set', async ({ page, isMobile }) => {
  test.setTimeout(1_200_000)
  const errors = watchErrors(page)
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('play').click()
  await straightIn(page)
  await expect(page.getByTestId('begin-season')).toBeVisible()
  // The first year is not what this is about: it is run by the reference practice, and the cash topped up before the
  // year closes so that a hard first year cannot end the farm before the second begins.
  await reach(page, `const { app } = q.g(); app.do({ t: 'begin' }); q.run(999, ['sell']); app.campaign.cash += 60000; q.winter(12, 3); app.do({ t: 'next' })`)
  await expect(page.getByTestId('begin-season')).toBeVisible()
  await expect(page.locator('#ui main:not(.leaving) .tb-year')).toHaveText('Year 2')

  // People: an applicant's card, and Hire. Someone who will work the winter is chosen.
  await page.getByTestId('crew-open').click()
  const crew = page.getByTestId('crew')
  const pick = await game<{ id: number; name: string; ask: number }>(page, `(() => { const a = c.applicants.find(x => x.trait !== 'homebody') ?? c.applicants[0]; return { id: a.id, name: a.name, ask: a.ask } })()`)
  await crew.getByTestId(`applicant-hire-${pick.id}`).click()
  await expect(crew.locator('li.cat-hired')).toContainText(pick.name)
  await expect(page.getByTestId('plan-money')).toContainText(`wages ${money(pick.ask)}`)
  await page.getByTestId('crew-close').click()
  const hand = await game<number>(page, `c.crew.find(u => u.name === ${JSON.stringify(pick.name)}).id`)

  // Land: a tract for sale, found from the land fold, bought on the mortgage from its card.
  const tract = await game<{ i: number; name: string; down: number }>(page, `(() => { const i = sim.PARCELS.findIndex(p => p.holding === 'sale'); return { i, name: sim.PARCELS[i].name, down: Math.round(sim.PARCELS[i].price * sim.MORTGAGE_DOWN) } })()`)
  await page.getByTestId('land-open').click()
  await page.getByTestId(`fold-land-${tract.i}`).click()
  const card = page.getByTestId('plan-card')
  await expect(card.getByTestId('card-title')).toHaveText(tract.name)
  await expect(card.getByTestId('land-buy')).toContainText(`${money(tract.down)} down`)
  await card.getByTestId('land-buy').click()
  await expect.poll(() => game<number>(page, 'c.mortgages.length')).toBe(1)
  await page.keyboard.press('Escape')
  await page.getByTestId('bank-open').click()
  await expect(page.getByTestId('bank')).toContainText(tract.name)
  await page.getByTestId('bank-close').click()

  // The season, with a question asked: someone looking for work turns up on the first day.
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('forecast')).toBeVisible()
  await reach(page, `const { app, sim } = q.g(); const c = app.campaign; const s = c.season
    const a = sim.applicantsFor(c.seed, c.year, new Set(c.crew.map(u => u.name)), 1, 7)[0]
    c.incidents.push({ id: c.nextIncident++, kind: 'applicant', day: s.day, until: s.day + 4, choices: ['hire', 'pass'], applicant: a }); app.setSpeed(0)`)
  const answered: string[] = []
  await expect.poll(async () => { const how = await answerIncident(page, true); if (how) answered.push(how); return game<number>(page, 'c.incidents.length') }).toBe(0)
  console.log(`incidents answered: ${answered.join(', ')}`)
  expect(answered.length).toBeGreaterThan(0)
  await farm(page, 'done', { store: true, mobile: isMobile, ms: 600_000, answered })

  // Winter: a building raised by the farm's own people, the farmer on it, the new hand felling the brush.
  await page.waitForTimeout(500)
  while (await page.getByTestId('weighin').count()) await answerTicket(page, true)
  await page.getByTestId('end-season').click()
  await expect(page.getByTestId('month-next')).toBeVisible()
  // A poor second year must not be what stops the building or, next spring, the contractor.
  await reach(page, `q.g().app.campaign.cash += 20000`)
  const winter = page.getByTestId('winter')
  await winter.getByTestId('raise-open').click()
  await winter.getByTestId('build-stand-1').click()
  await expect.poll(() => game<number>(page, `c.buildings.filter(b => b.kind === 'stand').length`)).toBe(1)
  await winter.getByTestId('winter-0-build').click()
  await expect(winter.getByTestId('winter-0-build')).toHaveAttribute('aria-pressed', 'true')
  const brush = await game<{ i: number; name: string }>(page, `(() => { const i = sim.PARCELS.findIndex(p => p.cover === 'brush'); return { i, name: sim.PARCELS[i].name } })()`)
  // Woods goes to the first tract with timber standing; pressed again it moves on to the next.
  // Each press is let land before the next: the line under the person says which tract it is.
  const tractOf = () => game<number>(page, `c.crew.find(u => u.id === ${hand}).winterField`)
  for (let k = 0; k < 4 && (await tractOf()) !== brush.i; k++) {
    const was = await tractOf()
    await winter.getByTestId(`winter-${hand}-woods`).click()
    await expect.poll(tractOf).not.toBe(was)
  }
  await expect(winter.getByTestId(`winter-${hand}`)).toContainText(brush.name)
  for (let i = 0; i < 9 && !(await page.getByTestId('year-next').count()); i++) {
    await page.getByTestId('month-next').click()
    await page.waitForTimeout(250)
  }
  await expect(page.getByTestId('year-next')).toBeVisible()
  expect(await game<boolean>(page, `c.buildings.some(b => b.kind === 'stand' && b.built)`)).toBe(true)
  expect(await game<string>(page, `c.fields[${brush.i}].cover`)).toBe('stumps')
  const sheet = page.locator('#ui .ledger-sheet')
  await expect(sheet.getByTestId('ledger-deeds')).toContainText(brush.name)
  await expect(sheet.getByTestId('ledger-mortgage')).toBeVisible()
  await expect(sheet.getByTestId('ledger-worth')).toBeVisible()
  if (await page.getByTestId('lost-moment').count()) throw new Error('the farm was lost in its second year')

  // The next spring: the stumps pulled by a contractor, ordered from the tract's own card.
  await page.getByTestId('year-next').click()
  await expect(page.getByTestId('begin-season')).toBeVisible()
  await expect(page.locator('#ui main:not(.leaving) .tb-year')).toHaveText('Year 3')
  // Found from the sheet's list of fields, which shows it on the land and opens its card.
  await page.getByTestId('fields-open').click()
  await page.getByTestId(`fold-field-${brush.i}`).click()
  await expect(card.getByTestId('card-title')).toHaveText(brush.name)
  await card.getByTestId('tract-stump').click()
  await expect.poll(() => game<string>(page, `c.fields[${brush.i}].works?.kind ?? ''`)).toBe('stump')
  await page.keyboard.press('Escape')

  // The season: once the stumps are out, the rocks are picked from the field's card, and the tract is a field.
  await page.getByTestId('begin-season').click()
  await reach(page, `const { app } = q.g(); app.setSpeed(0); for (let n = 0; n < 40 && app.campaign.fields[${brush.i}].cover !== 'open'; n++) app.do({ t: 'day' })`)
  expect(await game<string>(page, `c.fields[${brush.i}].cover`)).toBe('open')
  while (await page.getByTestId('weighin').count()) await answerTicket(page, true)
  // A telegram that came in those days holds the floor over a field's card: it is answered first, as a player would.
  for (let k = 0; k < 6 && (await look(page)).incidents; k++) await answerIncident(page, false)
  // The camera is brought round to it, as a click on its alert would, and then its plate is pressed.
  await page.evaluate(`window.__county.app.focus(${brush.i})`)
  await page.getByTestId(`field-${brush.i}`).click()
  const rocks = page.locator('#ui [data-testid="card"] [data-testid="order-rocks"]')
  if (await rocks.count()) await rocks.click()
  else await page.evaluate(`window.__county.app.order('rocks', { fields: [${brush.i}] })`)
  await reach(page, `const { app, sim } = q.g(); for (let n = 0; n < 30 && sim.tractInfo(app.campaign).find(t => t.field === ${brush.i}).stage !== 'done'; n++) app.do({ t: 'day' })`)
  expect(await game<string>(page, `sim.tractInfo(c).find(t => t.field === ${brush.i}).stage`)).toBe('done')

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

  // The focus is put on Play once the land is up, which a slow engine takes a while over.
  await expect(page.getByTestId('play')).toBeFocused({ timeout: 20_000 })
  await page.keyboard.press('Enter')
  // The offer takes the keyboard: 2 is Skip the tutorial, and the focus goes on to Start the season.
  await expect(page.getByTestId('guide-accept')).toBeFocused()
  await page.keyboard.press('Digit2')
  await expect(page.getByTestId('guide-offer')).toHaveCount(0)
  await expect(page.getByTestId('begin-season')).toBeFocused()
  // Fields are chosen with the number keys; Escape lets them go.
  await page.keyboard.press('Digit2')
  await expect(page.getByTestId('plan-card')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('plan-card')).toBeHidden()
  // A fold opens from the keyboard and Escape folds it again.
  await page.getByTestId('equipment-open').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('equipment')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('equipment')).toHaveCount(0)
  await page.getByTestId('begin-season').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('forecast')).toBeVisible()

  // Running at 1x by itself. The weeks until the soil is warm are passed through the test hook: the keys are what
  // this is about.
  expect((await look(page)).speed).toBe(1)
  await reach(page, `const { app } = q.g(); for (let k = 0; k < 90 && !app.needs().some(n => n.need && n.need.act === 'plant'); k++) { app.campaign.incidents = []; app.do({ t: 'day' }) } app.campaign.incidents = []; app.resumeAfterCard()`)
  // Tab finds the field that needs something; Enter gives it the order.
  await expect(page.locator(BADGE).first()).toBeVisible({ timeout: 30_000 })
  if (await page.getByTestId('spray-ask').isVisible().catch(() => false)) {
    await page.keyboard.press('Digit2')
    await expect(page.getByTestId('spray-ask')).toBeHidden()
    // (a Space within a second of an answer is taken as "go on", so the clock keys below wait that second out)
    await page.waitForTimeout(1100)
  }
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('card')).toBeVisible()
  await expect(page.locator('#ui .plate[aria-pressed="true"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await look(page)).queue).toBeGreaterThan(0)

  // The clock: Space, plus and minus, F stepping through the three speeds.
  expect((await look(page)).speed).toBe(1)
  await page.keyboard.press('Space')
  await expect(page.getByTestId('paused')).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByTestId('paused')).toBeHidden()
  await page.keyboard.press('+')
  await expect.poll(async () => (await look(page)).speed).toBe(2)
  await page.keyboard.press('-')
  await expect.poll(async () => (await look(page)).speed).toBe(1)
  await page.keyboard.press('Space')

  // The almanac and the menu open and close from the keyboard.
  await page.keyboard.press('Escape')
  await page.keyboard.press('i')
  await expect(page.getByTestId('almanac')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#ui .dialog')).toHaveCount(0)
  await page.keyboard.press('m')
  await expect(page.getByTestId('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#ui .dialog')).toHaveCount(0)
  await page.keyboard.press('f')
  await expect.poll(async () => (await look(page)).speed).toBe(1)
  await page.keyboard.press('f')
  await expect.poll(async () => (await look(page)).speed).toBe(2)
  await page.keyboard.press('f')
  await expect.poll(async () => (await look(page)).speed).toBe(3)
  await page.keyboard.press('f')
  await expect.poll(async () => (await look(page)).speed).toBe(1)
  expect(errors, errors.join('\n')).toEqual([])
})

// The money board says why the year-end figure moved, under it, for a week of the season: a hand taken on in July is
// their wages to the year end. An upright phone's board has no room, so there it is said by the alerts. A spray order
// moves the figure by far less than the step, so the line stays the hire's. SHOTS keeps pictures of the board with its
// line (at 1280 by 800, or the phone) and of a spring plan that leaves $8.
test('the money board says why the year-end figure moved', async ({ page, isMobile }) => {
  const errors = watchErrors(page)
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?year=1990&seed=7')
  await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'))
  // (for the pictures only: the spring plan's foot when the plan leaves $8 in cash, then the cash put back)
  if (process.env.SHOTS) {
    await reach(page, `const { app, sim } = q.g(); const c = app.campaign; window.__was = c.cash; c.cash = sim.planCosts(c).total + 8; app.do({ t: 'plan', field: 0, plan: { ...c.plans[0] } })`)
    await expect(page.getByTestId('plan-low')).toBeVisible()
    await page.screenshot({ path: `${process.env.SHOTS}/plan-low-${isMobile ? 'phone' : '1280x800'}.png` })
    await reach(page, `const { app } = q.g(); const c = app.campaign; c.cash = window.__was; app.do({ t: 'plan', field: 0, plan: { ...c.plans[0] } })`)
  }
  await reach(page, `const { app } = q.g(); app.do({ t: 'begin' }); app.setSpeed(0); q.run(q.day(6, 6)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1)`)
  await putAway(page)
  const why = isMobile ? page.locator('#ui .alert', { hasText: 'wages to year end' }) : page.locator('#ui [data-testid="outlook-why"]')
  await expect(page.locator('#ui [data-testid="outlook"]')).toBeVisible()
  await reach(page, `const { app } = q.g(); app.do({ t: 'hire', kind: 'hand' }); app.setSpeed(0)`)
  const name = await game<string>(page, `c.crew[c.crew.length - 1].name.split(' ')[0]`)
  await expect(why).toContainText(new RegExp(`−\\$[\\d,]+: ${name}'s wages to year end`))
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/money-why-${isMobile ? 'phone' : '1280x800'}.png` })
  // Its hover is the sum from the cash now to the figure.
  const tip = await page.locator('#ui [data-testid="outlook"]').getAttribute('data-tip')
  expect(tip).toMatch(/Wages to the year end −\$[\d,]+/)
  expect(tip).toMatch(/= −?\$[\d,]+ after year-end bills\./)
  if (isMobile) return expect(errors, errors.join('\n')).toEqual([])
  // A spray order is $110: the cash's line says it, and the figure's line never does.
  const field = await game<number>(page, `c.plans.findIndex((p, i) => p.crop === 'potato' && sim.held(c, i))`)
  await reach(page, `const { app } = q.g(); app.do({ t: 'job', kind: 'spray', field: ${field} }); app.setSpeed(0)`)
  await expect(why).toHaveText(new RegExp(`${name}'s wages to year end`))
  await reach(page, `const { app } = q.g(); app.do({ t: 'day' }); app.setSpeed(0)`)
  await expect(why).toHaveText(/^[+−]\$[\d,]+: \w.+$/)
  await expect(why).not.toHaveText(/field work/)
  expect(errors, errors.join('\n')).toEqual([])
})
