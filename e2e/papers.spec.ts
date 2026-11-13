// The weigh ticket's first reading and two sheets at a desk's height. The ticket says what was dug, what it weighs and
// the ways to take it in few words, with every grade and every loss one press away; the farm words on it and behind
// it carry their meaning; the test-dig tray and the field record keep inside the window, the middle scrolling between
// a head and a foot that stay in view.
import { test, type Page } from '@playwright/test'
import { expect, look, open, putAway, reach, startSeason, watchErrors } from './helpers.ts'

// The most words the ticket shows before anything is pressed, its ways and the note under them counted (round 6,
// item 19: "each weigh ticket is a full screen of numbers"; the round-6 ticket showed about 210). A contract's
// delivery coupon, a third way, may add 25.
const TICKET_WORDS = 120
const CONTRACT_WORDS = 25

// Words a player can see in a part of the page: not a screen reader's, not a term's held-back meaning, not the
// lettering of a drawn stamp.
function words(page: Page, sel: string): Promise<{ n: number; text: string }> {
  return page.evaluate(s => {
    const from = document.querySelector(s)
    const out: string[] = []
    if (from) {
      const walk = document.createTreeWalker(from, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const p = n.parentElement
        const t = n.textContent?.trim()
        if (!p || !t || p.closest('.sr, [hidden], svg')) continue
        if (!p.checkVisibility({ opacityProperty: true, visibilityProperty: true } as CheckVisibilityOptions)) continue
        out.push(t)
      }
    }
    const text = out.join(' ')
    return { n: text.split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length, text }
  }, sel)
}

// A rectangle's edges, read from the page.
type Box = { top: number; bottom: number; left: number; right: number }
function box(page: Page, sel: string): Promise<Box | null> {
  return page.evaluate(s => {
    const e = document.querySelector(s)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  }, sel)
}

// With PICTURES set, the state is kept as a picture in out/papers for a reader to look at.
async function snap(page: Page, name: string): Promise<void> {
  if (process.env.PICTURES) await page.screenshot({ path: `out/papers/${name}.png` })
}

async function ticketUp(page: Page): Promise<void> {
  const ticket = page.getByTestId('weighin')
  await expect(ticket).toBeVisible({ timeout: 30_000 })
  // The scale's reveal has run: the ticket is laid down and stamped.
  await expect(page.locator('#ui .dig-day:not(.revealing) .ticket:not(.is-waiting)')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('#ui .dig-paper .weighed:not(.is-up)')).toBeVisible()
  await page.waitForTimeout(1200)
}

test.describe('at a desk, 1280 by 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the weigh ticket reads in few words, explains cwt by the weight, and keeps every grade and loss one press away', async ({ page }) => {
    const errors = watchErrors(page)
    await startSeason(page)
    await reach(page, `const { app } = q.g(); q.run(999, ['sell'], 'lot'); const s = app.campaign.season; for (let k = 0; k < 10 && !s.fields.some(f => f.weighed); k++) app.do({ t: 'day' })`)
    await ticketUp(page)
    await snap(page, 'ticket-1280x800')
    const first = await words(page, '#ui .dig-paper')
    console.log(`the weigh ticket: ${first.n} words: ${first.text}`)
    expect(first.n, first.text).toBeLessThanOrEqual(TICKET_WORDS)
    // The whole first reading, the ways with it, stands in the window without scrolling.
    const ways = await box(page, '#ui .dig-paper .ways')
    expect(ways!.bottom).toBeLessThanOrEqual(800)
    // cwt is said in words beside the weight, before any way to take the crop.
    const cwt = page.getByTestId('ticket-cwt')
    await expect(cwt).toHaveText('A cwt is a hundredweight (100 lb).')
    expect((await box(page, '#ui [data-testid="ticket-cwt"]'))!.bottom).toBeLessThan(ways!.top)
    // The grade strip in words, its farm word explained in place; the biggest loss is a farm word with its meaning.
    const no1 = page.locator('#ui .dig-paper .tk-top .term')
    await expect(no1).toHaveText(/^US No\. 1/)
    await expect(no1).toHaveAttribute('data-tip', /top grade/)
    const loss = page.locator('#ui .dig-paper .losses th .term')
    if (await loss.count()) await expect(loss.first()).toHaveAttribute('data-tip', /\w/)
    await expect(page.locator('#ui .dig-paper .losses tbody tr')).toHaveCount(1)
    // Behind it, every grade and every loss, each grade named with its meaning.
    await page.getByTestId('reckoning-open').click()
    const reck = page.getByTestId('reckoning')
    await expect(reck).toContainText('of the No. 1 price')
    await page.waitForTimeout(400)
    await snap(page, 'breakdown-1280x800')
    for (const g of await reck.locator('.reck-grades tbody th').all()) await expect(g.locator('.term')).toHaveAttribute('data-tip', /\w/)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('with a contract the ticket has three ways and stays as short, and after a delivery too', async ({ page }) => {
    const errors = watchErrors(page)
    await open(page, '?year=1990&seed=7')
    await reach(page, `const { app } = q.g(); const c = app.campaign; app.do({ t: 'accept', offer: 19901 })
      for (let i = 0; i < 6; i++) if (c.plans[i].crop === 'potato') app.do({ t: 'plan', field: i, plan: { crop: 'potato', variety: 'kennebec', seed: 'certified' } })
      app.do({ t: 'begin' }); app.setSpeed(0); q.run(999, ['sell'], 'lot')
      for (let k = 0; k < 10 && c.season.fields.some(f => f.status === 'dug' && !f.weighed); k++) app.do({ t: 'day' }); app.setSpeed(0)`)
    await ticketUp(page)
    await expect(page.locator('#ui .dig-paper .way')).toHaveCount(3)
    await snap(page, 'ticket-contract-1280x800')
    const three = await words(page, '#ui .dig-paper')
    console.log(`the weigh ticket with a contract: ${three.n} words: ${three.text}`)
    expect(three.n, three.text).toBeLessThanOrEqual(TICKET_WORDS + CONTRACT_WORDS)
    await page.locator('#ui [data-testid^="lot-deliver-"]').click()
    await expect(page.getByTestId('ticket-left')).toBeVisible()
    const left = await words(page, '#ui .dig-paper')
    console.log(`the weigh ticket after a delivery: ${left.n} words`)
    expect(left.n, left.text).toBeLessThanOrEqual(TICKET_WORDS + CONTRACT_WORDS)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

for (const [w, h] of [[1280, 800], [1280, 720]] as const) {
  test.describe(`${w} by ${h}`, () => {
    test.use({ viewport: { width: w, height: h } })

    test('the test-dig tray keeps inside the window: its head and the estimate in view, the tray and tally scroll between', async ({ page }) => {
      const errors = watchErrors(page)
      await startSeason(page)
      await reach(page, `q.g().app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(8, 4), ['sample'])`)
      await putAway(page)
      await page.getByTestId('field-2').click()
      await page.keyboard.press('Shift+t')
      await expect.poll(async () => (await look(page)).queue).toBeGreaterThan(0)
      await page.getByTestId('speed-1').click()
      // The result is offered on a slip, or kept on the field's card once the slip has gone; the tray opens when it is
      // asked for.
      const offer = page.locator('#ui [data-testid="alert"]', { hasText: 'test dig' })
      const again = page.getByTestId('sample-again')
      await expect(offer.or(again).first()).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('speed-0').click()
      if (await offer.isVisible()) await offer.click()
      else await again.click()
      const tray = page.getByTestId('sample-dialog')
      await expect(tray).toBeVisible()
      await page.waitForTimeout(1500)
      const paper = (await box(page, '#ui [data-testid="sample-dialog"]'))!
      const host = (await box(page, '#ui .tray-host'))!
      const head = (await box(page, '#ui .tray-paper > .tray-head'))!
      const est = (await box(page, '#ui .tray-paper > .narrowing'))!
      const mid = (await box(page, '#ui [data-testid="tray-scroll"]'))!
      // Inside the window and inside the room it is given, nothing cut off by the host.
      expect(paper.top).toBeGreaterThanOrEqual(0)
      expect(paper.bottom).toBeLessThanOrEqual(h)
      expect(paper.bottom).toBeLessThanOrEqual(host.bottom + 1)
      // The head at the top, the estimate at the foot, both whole; the middle between them.
      expect(head.top).toBeGreaterThanOrEqual(paper.top - 1)
      expect(est.bottom).toBeLessThanOrEqual(paper.bottom + 1)
      expect(mid.top).toBeGreaterThanOrEqual(head.bottom - 1)
      expect(mid.bottom).toBeLessThanOrEqual(est.top + 1)
      await expect(tray.locator('.narrowing')).toContainText('Now')
      // Whatever the middle holds is reached by scrolling it: the tally's last line comes into its view.
      const last = await page.evaluate(() => {
        const m = document.querySelector<HTMLElement>('#ui [data-testid="tray-scroll"]')!
        m.scrollTop = m.scrollHeight
        const l = [...m.querySelectorAll('.tally .lead')].pop()!.getBoundingClientRect()
        const r = m.getBoundingClientRect()
        return { scrolls: m.scrollHeight > m.clientHeight + 1, inside: l.top >= r.top - 1 && l.bottom <= r.bottom + 1 }
      })
      await snap(page, `test-dig-${w}x${h}`)
      console.log(`the tray at ${w} by ${h}: ${Math.round(paper.bottom - paper.top)} px tall, ${last.scrolls ? 'its middle scrolls' : 'whole'}`)
      expect(last.inside).toBe(true)
      expect(errors, errors.join('\n')).toEqual([])
    })

    test('the field record keeps inside the window: its head and seed in view, the crop and varieties scroll between', async ({ page }) => {
      const errors = watchErrors(page)
      await open(page, '?year=1990&seed=7')
      // First with the three varieties of a first spring, then with all of them once the comparison has been seen.
      for (const all of [false, true]) {
      if (all) {
        await page.evaluate(() => (globalThis as any).__county.app.select(0))
        await page.getByTestId('compare-open').click()
        await page.getByTestId('compare-close').click()
      }
      let seen = 0
      for (const field of [0, 1, 2, 3, 4, 5]) {
        const potato = await page.evaluate(f => { const { app } = (globalThis as any).__county; app.select(f); return app.campaign.plans[f].crop === 'potato' }, field)
        if (!potato) continue
        const card = page.getByTestId('plan-card')
        await expect(card).toBeVisible()
        await expect(card.getByTestId('card-title')).toBeVisible()
        // Read once the card has come to rest beside its field (it is laid, then held to the land's room).
        let last = ''
        await expect.poll(async () => { const now = JSON.stringify(await box(page, '#ui [data-testid="plan-card"]')); const same = now === last; last = now; return same }, { intervals: [300] }).toBe(true)
        const [c, foot] = await page.evaluate(() => ['plan-card', 'record-foot'].map(id => {
          const r = document.querySelector(`#ui [data-testid="${id}"]`)!.getBoundingClientRect()
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
        }))
        const at = `field ${field} at ${w} by ${h}${all ? ', every variety' : ''}`
        expect(c.top, at).toBeGreaterThanOrEqual(0)
        expect(c.bottom, at).toBeLessThanOrEqual(h + 0.5)
        // The seed at the foot, whole inside the card; the middle above it.
        expect(foot.bottom, at).toBeLessThanOrEqual(c.bottom + 1)
        expect(await page.evaluate(() => { const m = document.querySelector<HTMLElement>('#ui [data-testid="record-scroll"]')!; return m.offsetTop + m.offsetHeight - m.nextElementSibling!.clientTop - (m.nextElementSibling as HTMLElement).offsetTop }), at).toBeLessThanOrEqual(1)
        await expect(card.getByTestId('plan-seed-certified'), at).toBeInViewport()
        // Nothing hidden past the card's edge: what does not fit is in the middle, which scrolls to its end.
        const fit = await page.evaluate(() => {
          const card = document.querySelector<HTMLElement>('#ui [data-testid="plan-card"]')!
          const m = card.querySelector<HTMLElement>('[data-testid="record-scroll"]')!
          m.scrollTop = m.scrollHeight
          const r = m.getBoundingClientRect()
          const l = [...m.querySelectorAll('.vbox')].pop()!.getBoundingClientRect()
          return { cut: card.scrollHeight - card.clientHeight, scrolls: m.scrollHeight > m.clientHeight + 1, inside: l.bottom <= r.bottom + 1 && l.bottom > r.top }
        })
        expect(fit.cut, at).toBeLessThanOrEqual(1)
        expect(fit.inside, at).toBe(true)
        if (fit.scrolls) seen++
        if (field === 0) await snap(page, `field-record-${w}x${h}${all ? '-all' : ''}`)
        console.log(`the field record, ${at}: ${Math.round(c.bottom - c.top)} px tall, ${fit.scrolls ? 'its middle scrolls' : 'whole'}`)
      }
      if (h <= 720 && all) expect(seen, 'a short window has a field record whose middle scrolls').toBeGreaterThan(0)
      }
      expect(errors, errors.join('\n')).toEqual([])
    })
  })
}

test.describe('on a phone, 390 by 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the weigh ticket keeps its budget, and its ways come straight after the weight', async ({ page }) => {
    const errors = watchErrors(page)
    await startSeason(page)
    await reach(page, `const { app } = q.g(); q.run(999, ['sell'], 'lot'); const s = app.campaign.season; for (let k = 0; k < 10 && !s.fields.some(f => f.weighed); k++) app.do({ t: 'day' })`)
    await ticketUp(page)
    await snap(page, 'ticket-phone')
    const first = await words(page, '#ui .dig-paper')
    expect(first.n, first.text).toBeLessThanOrEqual(TICKET_WORDS)
    const ways = (await box(page, '#ui .dig-paper .ways'))!
    const grades = (await box(page, '#ui .dig-paper .grades'))!
    expect(ways.top).toBeLessThan(grades.top)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('the test dig and the field record keep inside the screen', async ({ page }) => {
    const errors = watchErrors(page)
    await open(page, '?year=1990&seed=7')
    await page.evaluate(() => (globalThis as any).__county.app.select(0))
    await expect(page.getByTestId('plan-card')).toBeVisible()
    await page.waitForTimeout(600)
    await snap(page, 'field-record-phone')
    const card = (await box(page, '#ui [data-testid="plan-card"]'))!
    expect(card.bottom).toBeLessThanOrEqual(844 + 0.5)
    await expect(page.getByTestId('plan-seed-certified')).toBeInViewport()
    await page.evaluate(() => (globalThis as any).__county.app.select(-1))
    await page.getByTestId('begin-season').click()
    await expect(page.getByTestId('date')).toBeVisible()
    await reach(page, `const { app } = q.g(); app.setSpeed(0); app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(8, 4), ['sample']); app.setSpeed(0)
      app.do({ t: 'job', kind: 'sample', field: 2 }); app.do({ t: 'bump', id: app.campaign.season.jobs.at(-1).id }); app.do({ t: 'day' }); app.setSpeed(0)`)
    const offer = page.locator('#ui [data-testid="alert"]', { hasText: 'test dig' })
    await expect(offer).toBeVisible({ timeout: 30_000 })
    await offer.click()
    const tray = page.getByTestId('sample-dialog')
    await expect(tray).toBeVisible()
    await page.waitForTimeout(2600)
    await snap(page, 'test-dig-phone')
    const paper = (await box(page, '#ui [data-testid="sample-dialog"]'))!
    expect(paper.top).toBeGreaterThanOrEqual(0)
    expect(paper.bottom).toBeLessThanOrEqual(844)
    await expect(tray.locator('.narrowing')).toBeInViewport()
    expect(errors, errors.join('\n')).toEqual([])
  })
})

// The spring sheet (round 7, items 14 and 20).

// What each fold's first item is, and the key on it.
const FOLDS: { open: string; body: string; item: string; key: string }[] = [
  { open: 'fields-open', body: 'fields', item: '.cat-list > li', key: '[data-testid^="fold-field-"]' },
  { open: 'crew-open', body: 'crew', item: '.applicant, .hall-row', key: 'button' },
  { open: 'land-open', body: 'land', item: '.cat-list > li', key: '[data-testid^="fold-land-"]' },
  { open: 'contracts-open', body: 'contracts', item: '.cat-offer', key: 'button, .range' },
  { open: 'equipment-open', body: 'equipment', item: '.cat-equip > li', key: 'button, .stamp' },
]

// A second spring, after a first year played by the advice and the cellar sold at its usual month.
const YEAR_TWO = `q.start(1990, 7); q.year(3); q.g().app.do({ t: 'next' })`

interface FoldSeen { region: number; holds: boolean; item: boolean; key: boolean; start: boolean; totals: boolean; lead: number; text: string; where: string; strip: number }

async function foldSeen(page: Page, f: (typeof FOLDS)[number]): Promise<FoldSeen> {
  return page.evaluate(({ body, item, key }) => {
    const inView = (e: Element | null, inside?: DOMRect) => {
      if (!e) return false
      const r = e.getBoundingClientRect()
      const ok = r.width > 0 && r.height > 0 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5
      return ok && (!inside || (r.top >= inside.top - 0.5 && r.bottom <= inside.bottom + 0.5))
    }
    const region = document.querySelector<HTMLElement>(`#ui [data-testid="${body}"]`)!
    const box = region.getBoundingClientRect()
    const first = region.querySelector(item)
    const lead = region.querySelector(':scope > .t-caption')
    return {
      region: Math.round(region.clientHeight), holds: region.scrollHeight <= region.clientHeight + 1,
      item: inView(first, box), key: inView(first?.querySelector(key) ?? (first?.matches(key) ? first : null), box),
      start: inView(document.querySelector('#ui [data-testid="begin-season"]')),
      totals: inView(document.querySelector('#ui [data-testid="plan-money"] .big')) && inView(document.querySelector('#ui [data-testid="plan-due"]')),
      lead: ((lead as HTMLElement | null)?.innerText ?? '').trim().split(/\s+/).filter(Boolean).length, text: ((lead as HTMLElement | null)?.innerText ?? '').trim(),
      strip: new Set([...document.querySelectorAll<HTMLElement>('#ui .fold.more.strip > .btn')].map(b => Math.round(b.getBoundingClientRect().top))).size,
      where: `room ${Math.round(box.top)} to ${Math.round(box.bottom)}, first item ${first ? (({ top, bottom, left, right }) => `${Math.round(top)} to ${Math.round(bottom)}, ${Math.round(left)} to ${Math.round(right)}`)(first.getBoundingClientRect()) : 'none'}`,
    }
  }, f)
}

for (const [w, h] of [[1280, 800], [1280, 720]] as const) {
  test.describe(`the spring sheet at ${w} by ${h}`, () => {
    test.use({ viewport: { width: w, height: h } })

    for (const year of [1, 2]) {
      test(`year ${year}: each fold opened has room to be used, its first item and key in view, the totals and Start the season kept`, async ({ page }) => {
        test.setTimeout(180_000)
        const errors = watchErrors(page)
        await open(page, '?year=1990&seed=7')
        if (year === 2) { await reach(page, YEAR_TWO); await putAway(page) }
        await expect(page.getByTestId('begin-season')).toBeVisible()
        for (const f of FOLDS) {
          await page.getByTestId(f.open).click()
          const body = page.getByTestId(f.body)
          await expect(body).toBeVisible()
          await page.waitForTimeout(400)
          const s = await foldSeen(page, f)
          const at = `year ${year}, ${f.body}, ${w} by ${h}`
          console.log(`${at}: room ${s.region} px${s.holds ? ', holds it all' : ''}; first item ${s.item ? 'whole' : 'cut'}; opening ${s.lead} words`)
          await snap(page, `spring-y${year}-${f.body}-${w}x${h}`)
          expect(s.item, `${at}: the first item whole in view (${s.where})`).toBe(true)
          expect(s.key, `${at}: its key in view`).toBe(true)
          expect(s.region >= 300 || s.holds, `${at}: a room of 300 px or all of it (${s.region} px)`).toBe(true)
          expect(s.start, `${at}: Start the season in view`).toBe(true)
          expect(s.strip, `${at}: the other folds on one line`).toBeLessThanOrEqual(1)
          expect(s.totals, `${at}: This plan and what is due in view`).toBe(true)
          if (f.body === 'contracts') expect(s.lead, `${at}: ${s.text}`).toBeLessThanOrEqual(30)
          // One sentence opens each fold.
          if (s.text) expect(s.text.split(/(?<=[.!?])\s+(?=[A-Z])/).length, `${at}: ${s.text}`).toBe(1)
          await page.getByTestId(f.open).click()
          await expect(body).toHaveCount(0)
        }
        expect(errors, errors.join('\n')).toEqual([])
      })
    }
  })
}

test.describe('the spring sheet on a phone, 390 by 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('each fold opened shows its first item, with Start the season and the totals kept', async ({ page }) => {
    test.setTimeout(180_000)
    const errors = watchErrors(page)
    await open(page, '?year=1990&seed=7')
    await expect(page.getByTestId('begin-season')).toBeVisible()
    for (const f of FOLDS) {
      await page.getByTestId(f.open).click()
      await expect(page.getByTestId(f.body)).toBeVisible()
      await page.waitForTimeout(400)
      const s = await foldSeen(page, f)
      const at = `phone, ${f.body}`
      console.log(`${at}: room ${s.region} px${s.holds ? ', holds it all' : ''}; first item ${s.item ? 'whole' : 'cut'}`)
      await snap(page, `spring-y1-${f.body}-phone`)
      expect(s.item, `${at}: the first item whole in view (${s.where})`).toBe(true)
      expect(s.start, `${at}: Start the season in view`).toBe(true)
      expect(s.totals, `${at}: This plan and what is due in view`).toBe(true)
      await page.getByTestId(f.open).click()
      await expect(page.getByTestId(f.body)).toHaveCount(0)
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('the spring sheet, first sight', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a first spring\'s field record shows three varieties, and the comparison shows them all', async ({ page }) => {
    const errors = watchErrors(page)
    await open(page, '?year=1990&seed=7')
    const all = await page.evaluate(() => { const { app, sim } = (globalThis as any).__county; return sim.availableVarieties(app.campaign.year).length as number })
    await page.evaluate(() => (globalThis as any).__county.app.select(0))
    const card = page.getByTestId('plan-card')
    await expect(card.locator('.vbox')).toHaveCount(3)
    await expect(card.locator('.vbox input:checked')).toHaveCount(1)
    await snap(page, 'field-record-first-sight')
    await card.getByTestId('compare-open').click()
    await expect(page.locator('#ui [data-testid="compare"] tbody tr')).toHaveCount(all)
    await page.getByTestId('compare-close').click()
    await expect(card.locator('.vbox')).toHaveCount(all)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('a hire at the year end is said in one sentence', async ({ page }) => {
    test.setTimeout(180_000)
    const errors = watchErrors(page)
    await open(page, '?year=1990&seed=7')
    // Hired in the season, so the year's own record says it as well as the books.
    await reach(page, `const { app } = q.g(); app.do({ t: 'begin' }); q.run(q.day(5, 20)); app.do({ t: 'hire', kind: 'operator' }); q.year(3)`)
    await putAway(page)
    const name = await page.evaluate(() => { const c = (globalThis as any).__county.app.campaign; return c.crew.filter((u: any) => u.kind !== 'farmer').at(-1).name as string })
    const line = page.locator('#ui .b-people .ppl', { hasText: name }).first()
    await expect(line).toBeVisible({ timeout: 30_000 })
    const text = (await line.textContent())!.trim()
    console.log(`the hire at the year end: ${text}`)
    expect(text.match(/hired/gi)?.length, text).toBe(1)
    expect(text.split(/(?<=\.)\s+(?=[A-Z])/).length, text).toBe(1)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('the test dig asked for, with a field card open', () => {
  for (const [w, h] of [[1280, 800], [1280, 720]] as const) {
    test(`${w} by ${h}: the tray is whole and a card's tether passes under it`, async ({ page }) => {
      test.setTimeout(180_000)
      const errors = watchErrors(page)
      await page.setViewportSize({ width: w, height: h })
      await startSeason(page)
      await reach(page, `const { app } = q.g(); app.setSpeed(0); app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(7, 12), ['sample']); app.setSpeed(0); app.campaign.incidents = []`)
      await putAway(page)
      for (const field of [2, 0, 4]) {
        await page.evaluate(f => { const { app } = (globalThis as any).__county; app.select(f); app.focus(f) }, field)
        await reach(page, `const { app } = q.g(); app.do({ t: 'job', kind: 'sample', field: ${field} }); app.do({ t: 'bump', id: app.campaign.season.jobs.at(-1).id }); app.do({ t: 'day' }); app.setSpeed(0)`)
        // The dig is in when the field's record has it; the slip at the foot then offers it.
        await page.waitForFunction(f => { const c = (globalThis as any).__county.app.campaign; if (!c.season.log.some((e: any) => e.type === 'sample' && e.field === f && e.day >= c.season.day - 1)) { (globalThis as any).__county.app.do({ t: 'day' }); (globalThis as any).__county.app.setSpeed(0); return false } return true }, field, { polling: 500, timeout: 20_000 })
        const tray = page.getByTestId('sample-dialog')
        const offer = page.locator('#ui [data-testid="alert"]', { hasText: /test dig/i }).last()
        await expect(offer.or(tray).first()).toBeVisible({ timeout: 20_000 })
        if (!(await tray.isVisible())) await offer.click()
        await expect(tray).toBeVisible()
        await page.evaluate(f => { const { app } = (globalThis as any).__county; if (app.selected !== f) app.select(f) }, field)
        await expect(page.getByTestId('card')).toBeVisible()
        await page.waitForTimeout(2800)
        await snap(page, `tray-with-card-f${field}-${w}x${h}`)
        const seen = await page.evaluate(() => {
          const paper = document.querySelector<HTMLElement>('#ui [data-testid="sample-dialog"]')!
          const r = paper.getBoundingClientRect()
          const t = document.querySelector<HTMLElement>('#ui [data-testid="tether-card"]')
          let crossing = 0, over = 0
          if (t && !t.hidden) {
            // The tether lets presses through; for this look it takes them, so the topmost thing at each point is known.
            t.style.pointerEvents = 'auto'
            const m = new DOMMatrix(getComputedStyle(t).transform)
            for (let k = 1; k < 40; k++) {
              const x = m.e + m.a * 100 * (k / 40), y = m.f + m.b * 100 * (k / 40)
              if (x < r.left + 2 || x > r.right - 2 || y < r.top + 2 || y > r.bottom - 2) continue
              crossing++
              if (document.elementFromPoint(x, y) === t) over++
            }
            t.style.pointerEvents = ''
          }
          // Wherever a tether may run, it is drawn under the tray: the tray stands at least as high and after it.
          const host = paper.parentElement!
          const z = (e: Element) => Number(getComputedStyle(e).zIndex) || 0
          const under = !!t && z(host) >= z(t) && !!(t.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING)
          return { top: r.top, bottom: r.bottom, crossing, over, under }
        })
        console.log(`the tray with field ${field}'s card at ${w} by ${h}: ${Math.round(seen.top)} to ${Math.round(seen.bottom)} px; the tether crosses it at ${seen.crossing} points, over it at ${seen.over}`)
        expect(seen.top).toBeGreaterThanOrEqual(0)
        expect(seen.bottom).toBeLessThanOrEqual(h)
        await expect(tray.locator('.narrowing')).toBeInViewport({ ratio: 1 })
        expect(seen.over, 'the tether passes under the tray').toBe(0)
        expect(seen.under, 'the tray stands over any tether').toBe(true)
        await page.keyboard.press('Escape')
      }
      expect(errors, errors.join('\n')).toEqual([])
    })
  }
})
