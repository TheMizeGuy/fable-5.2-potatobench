// The guided first year as a newcomer meets it: offered on a new farm from the title, taken, and played to the first
// planting by doing only what the county agent's slip says, at the control its fist points at. Refused, nothing shows.
import AxeBuilder from '@axe-core/playwright'
import { test, type Page } from '@playwright/test'
import { expect, look, noSidewaysScroll, watchErrors } from './helpers.ts'

interface Box { x: number; y: number; width: number; height: number }
const meets = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

async function fresh(page: Page): Promise<void> {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'))
}

// What the slip says now: its lesson and the test id of what its fist points at.
async function slip(page: Page): Promise<{ id: string; target: string }> {
  return page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('#ui [data-testid="guide-slip"]:not([hidden])')
    return { id: s?.dataset.lesson ?? '', target: s?.dataset.target ?? '' }
  })
}

// A point on open land, with open land all round it out to r: nothing of the interface where the fingers go.
async function land(page: Page, r = 0): Promise<{ x: number; y: number; r: number }> {
  return page.evaluate(want => {
    const canvas = document.getElementById('field')
    const open = (x: number, y: number) => document.elementFromPoint(x, y) === canvas
    // The widest circle of open land that can be found, down to a third of the one asked for.
    for (const r of want ? [want, want * 0.75, want * 0.55, want * 0.4, want * 0.3] : [0]) {
      for (let fy = 0.12; fy < 0.9; fy += 0.02) for (let fx = 0.1; fx < 0.9; fx += 0.03) {
        const x = Math.round(innerWidth * fx), y = Math.round(innerHeight * fy)
        if (!open(x, y)) continue
        if (r && ![0, 0.5, 1, 1.5, 2, 2.5, 3].every(a => open(x + Math.cos(a) * r, y + Math.sin(a) * r) && open(x - Math.cos(a) * r, y - Math.sin(a) * r))) continue
        return { x, y, r }
      }
    }
    return { x: Math.round(innerWidth / 2), y: Math.round(innerHeight * 0.6), r: want }
  }, r)
}

// One touch gesture, finger by finger, frame by frame: each entry of steps is where the fingers are.
async function fingers(page: Page, steps: { x: number; y: number }[][]): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const send = (type: string, points: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) })
  await send('touchStart', steps[0])
  for (const s of steps.slice(1)) { await send('touchMove', s); await page.waitForTimeout(16) }
  await send('touchEnd', [])
  await cdp.detach()
}

// Two quick taps on one spot, as fast as a finger gives them.
async function doubleTap(page: Page, p: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  for (let k = 0; k < 2; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 0 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await cdp.detach()
}

// Drag the land: the mouse's left button, or one finger.
async function drag(page: Page, mobile: boolean, far = 1): Promise<void> {
  const p = await land(page, mobile ? 30 : 0)
  if (mobile) {
    await fingers(page, Array.from({ length: 13 }, (_, k) => [{ x: p.x - k * 10 * far, y: p.y - k * 5 * far }]))
    return
  }
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.mouse.move(p.x - 160 * far, p.y - 60 * far, { steps: 12 })
  await page.mouse.up()
}

// Turn the view: the right button dragged sideways, or two fingers twisted.
async function turn(page: Page, mobile: boolean, far = 1): Promise<void> {
  const p = await land(page, mobile ? 60 : 0)
  if (mobile) {
    const at = (a: number) => [{ x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r }, { x: p.x - Math.cos(a) * p.r, y: p.y - Math.sin(a) * p.r }]
    await fingers(page, Array.from({ length: 13 }, (_, k) => at(k * 0.06 * far)))
    return
  }
  await page.mouse.move(p.x, p.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(p.x + 120 * far, p.y, { steps: 14 })
  await page.mouse.up({ button: 'right' })
}

// The slip never lies over what it points at, the clock, a command bar, a telegram or a paper.
async function clear(page: Page, target: string): Promise<void> {
  // What slides in (a card, a telegram) is given the moment it takes to arrive; a slip with no room is hidden.
  await page.waitForTimeout(400)
  const s = page.locator('#ui [data-testid="guide-slip"]:not([hidden]):not(.gone)')
  if (!(await s.count())) return
  const sb = await s.first().boundingBox({ timeout: 2000 }).catch(() => null)
  if (!sb) return
  const others = await page.evaluate(t => [...document.querySelectorAll<HTMLElement>(`#ui .clock, #ui .command, #ui .telegram, #ui .paper-layer .dialog${t ? `, #ui [data-testid="${t}"]` : ''}`)]
    .filter(e => !e.closest('.guide, .leaving, [hidden], .out') && e.offsetParent !== null)
    .map(e => { const r = e.getBoundingClientRect(); return { name: e.dataset.testid ?? e.className, x: r.x, y: r.y, width: r.width, height: r.height } })
    .filter(r => r.width > 0 && r.height > 0), target)
  // In spring the slip sits in the catalogue itself, beside its own order blank.
  for (const o of others) if (!String(o.name).includes('catalogue')) expect(meets(sb, o), `the slip lies over ${o.name}`).toBe(false)
  expect(await covers(page, target)).toEqual([])
}

// What the guide covers that it must not: the panel holding what it points at (the list, an open fold, a card), and,
// under the pointing hand, any words, figure, face or control a player reads or presses.
async function covers(page: Page, target: string): Promise<string[]> {
  return page.evaluate(t => {
    const out: string[] = []
    const meet = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    const seen = (e: Element | null): e is HTMLElement => !!e && e instanceof HTMLElement && e.offsetParent !== null && !e.closest('.leaving, [hidden], .out')
    const slip = document.querySelector<HTMLElement>('#ui [data-testid="guide-slip"]:not([hidden]):not(.gone)')
    const tgt = t ? document.querySelector(`#ui [data-testid="${t}"]`) : null
    const panel = tgt?.closest('.queue, .cat-open, .command, .person-card, .work, .telegram, .paper-layer .dialog') ?? null
    if (seen(slip)) for (const e of [tgt, panel]) if (seen(e) && !slip.contains(e) && meet(slip.getBoundingClientRect(), e.getBoundingClientRect())) out.push(`the slip lies over ${e.dataset.testid ?? e.className}`)
    // In spring: no row of the catalogue and no applicant, as much of each as its scrolling list shows.
    const shown = (e: HTMLElement) => {
      let r = e.getBoundingClientRect()
      for (let p = e.parentElement; p; p = p.parentElement) {
        if (!/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) continue
        const c = p.getBoundingClientRect()
        r = new DOMRect(r.x, Math.max(r.top, c.top), r.width, Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)))
      }
      return r
    }
    if (seen(slip)) for (const e of document.querySelectorAll<HTMLElement>('#ui .catalogue .cat-fold > .fold, #ui .catalogue .fold.more, #ui .catalogue .applicant')) {
      const r = shown(e)
      if (seen(e) && !slip.contains(e) && r.height > 0 && meet(slip.getBoundingClientRect(), r)) out.push(`the slip lies over the catalogue's ${e.dataset.testid ?? e.className}`)
    }
    const fist = document.querySelector<HTMLElement>('#ui [data-testid="guide-fist"]:not([hidden])')
    if (seen(fist)) {
      // Read from the elements themselves: the layers over the land let the pointer through.
      const f = fist.getBoundingClientRect()
      const busy = 'svg, img, button, a, input, label, .tag, .need, .pin, .portrait, .key, .t-figure'
      const range = document.createRange()
      for (const el of document.querySelectorAll<HTMLElement>('#ui *')) {
        if (el.closest('.guide-layer, .leaving, [hidden], .gone, .sr')) continue
        const boxes: DOMRect[] = []
        if (el.matches(busy)) { if (!el.parentElement?.closest(busy)) boxes.push(el.getBoundingClientRect()) }
        else for (const n of el.childNodes) if (n.nodeType === 3 && (n.nodeValue ?? '').trim()) { range.selectNodeContents(n); boxes.push(range.getBoundingClientRect()) }
        for (const b of boxes) if (b.width > 0 && b.height > 0 && meet(f, b)) out.push(`the hand lies on ${el.dataset.testid ?? el.className ?? el.tagName}`)
      }
    }
    return [...new Set(out)]
  }, target)
}

// Bring the land closer: the wheel at a desk, two fingers spread on a phone.
async function closer(page: Page, mobile: boolean): Promise<void> {
  const p = await land(page, mobile ? 40 : 0)
  if (mobile) {
    await fingers(page, Array.from({ length: 13 }, (_, k) => [{ x: p.x - p.r * (0.4 + k * 0.05), y: p.y }, { x: p.x + p.r * (0.4 + k * 0.05), y: p.y }]))
    return
  }
  await page.mouse.move(p.x, p.y)
  for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(60) }
}

const HOLDING = new Set(['watch', 'plant', 'rest', 'scout', 'hill', 'spray', 'sample', 'water', 'rogue', 'kill', 'dig'])

test('a guided first year: offered on a new farm, taken, and followed through the opening by what it says alone', async ({ page, isMobile }) => {
  test.setTimeout(900_000)
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()
  const offer = page.getByTestId('guide-offer')
  await expect(offer).toBeVisible()
  // The offer does not take the keyboard from the season's start.
  await expect(page.getByTestId('begin-season')).toBeVisible()
  await offer.getByTestId('guide-accept').click()
  await expect(offer).toHaveCount(0)

  const did: string[] = []
  const passed = (id: string) => page.evaluate(i => (globalThis as unknown as { __countyGuide: { passed(id: string): boolean } }).__countyGuide.passed(i), id)
  // Planting begun, as the "watch" note counts it: a field planted, or a planting order under way.
  const sown = () => page.evaluate(() => {
    const s = (globalThis as unknown as { __county: { app: { campaign: { season: { fields: { plantDay: number }[]; jobs: { kind: string; done: number }[] } | null } } } }).__county.app.campaign.season
    return !!s && (s.fields.some(f => f.plantDay >= 0) || s.jobs.some(j => j.kind === 'plant' && j.done > 0))
  })
  // The opening is followed to its end: the first planting watched and the field's card read.
  const finished = async () => (await passed('card')) || ((await passed('field')) && (await sown()))
  for (let step = 0; step < 60 && !(await finished()); step++) {
    // Each lesson is waited for as a player would: it is on the screen, or the days are running toward it. A later
    // telegram has no lesson of its own (the first one taught it): it is answered as that one was.
    await expect.poll(async () => {
      if (!(await slip(page)).id && (await look(page)).incidents) await page.locator('#ui [data-testid^="answer-"]').first().click().catch(() => {})
      // Blight weather's spraying question with no note beside it: answered as the play-through answers it.
      if (!(await slip(page)).id && await page.getByTestId('spray-ask').isVisible().catch(() => false)) await page.getByTestId('spray-way-ask').click().catch(() => {})
      // A paper a lesson's click opened (the almanac from the forecast) is closed as a player would, and the days go on.
      if (!(await slip(page)).id && (await look(page)).paper) await page.keyboard.press('Escape')
      else if (!(await slip(page)).id && (await look(page)).paused && !(await look(page)).incidents) await page.keyboard.press('Space')
      return (await finished()) ? 'done' : (await slip(page)).id
    }, { timeout: 120_000, message: `after ${did.join(' ')}` }).not.toBe('')
    if (await finished()) break
    const { id } = await slip(page)
    let { target } = await slip(page)
    console.log(`${id} at ${(await look(page)).speed}×`)
    if (!id) continue
    if (did[did.length - 1] !== id) did.push(id)
    await clear(page, target)
    // A lesson that asks for a click on something the days move holds the clock, and says so.
    if (HOLDING.has(id)) {
      await expect.poll(async () => (await look(page)).paused, { message: `${id} holds the clock` }).toBe(true)
      await expect(page.getByTestId('guide-held')).toBeVisible()
    }
    // Something lies over what it asks for: the slip offers Show me, which brings that field into frame.
    if (await page.getByTestId('guide-hidden').isVisible().catch(() => false)) {
      await expect(page.getByTestId('guide-fist')).toBeHidden()
      await page.getByTestId('guide-show').click()
      await page.waitForTimeout(1500)
      continue
    }
    // What it asks for lies under a card: the slip says so and marks the card's cross, which is pressed first.
    target = (await slip(page)).target
    if (/-close$/.test(target)) {
      await expect(page.getByTestId('guide-under')).toBeVisible()
      await page.getByTestId(target).first().click()
      await page.waitForTimeout(600)
      continue
    }
    // Where a field it points at is on the screen with nothing over it, the fist is beside it.
    const there = /^(field|badge)-/.test(target) && await page.locator(`#ui [data-testid="${target}"]`).first().isVisible().catch(() => false)
    if (there && !(await page.getByTestId('guide-hidden').isVisible().catch(() => false))) await expect(page.getByTestId('guide-fist'), `${id}: the fist is on ${target}`).toBeVisible()
    switch (id) {
      case 'begin':
        await page.getByTestId(target).click()
        await expect(page.getByTestId('date').first()).toBeVisible()
        // The clock is held for the opening, and the slip says so.
        await expect(page.getByTestId('guide-held')).toBeVisible()
        expect((await look(page)).paused).toBe(true)
        break
      case 'watch':
        for (let k = 1; k <= 4 && (await slip(page)).id === id; k++) { await closer(page, isMobile); await page.waitForTimeout(1200) }
        break
      case 'turn':
        // As a player would, again and a little further if the land did not seem to move the first time.
        for (let k = 1; k <= 5 && (await slip(page)).id === id; k++) {
          await turn(page, isMobile, Math.min(k, 3))
          await page.waitForTimeout(1500)
          console.log(`${id} ${k}: ${await page.evaluate(() => JSON.stringify((globalThis as unknown as { __countyGuide: { p: { facts: string[] } } }).__countyGuide.p.facts))}`)
        }
        break
      case 'almanac':
        // It says the cross closes it: the almanac is opened and put away again.
        await page.locator(`#ui [data-testid="${target}"]`).first().click()
        await expect(page.getByTestId('almanac')).toBeVisible()
        await page.getByTestId('almanac-close').click()
        await expect(page.getByTestId('almanac')).toHaveCount(0)
        break
      case 'field': {
        // It asks for a field's tag: the one its fist marks, or any on the screen.
        let marked = page.locator(`#ui [data-testid="${target}"]`).first()
        // The tags settle again when the view moves: the slip names the field it means now.
        if (!(await marked.isVisible())) { await page.waitForTimeout(800); marked = page.locator(`#ui [data-testid="${(await slip(page)).target}"]`).first() }
        if (!(await marked.isVisible())) {
          // Out of view, the slip says how to bring the farm back.
          await expect(page.getByTestId('guide-lost')).toBeVisible()
          // Show me brings the field it means into frame.
          await page.getByTestId('guide-show').click()
          await page.waitForTimeout(1500)
          for (let k = 0; k < 3 && !(await marked.isVisible()) && !(await page.locator('#ui .plate[data-testid^="field-"]:visible').count()); k++) {
            if (isMobile) await doubleTap(page, await land(page)); else await page.keyboard.press('Home')
            await page.waitForTimeout(1500)
          }
        }
        await ((await marked.isVisible()) ? marked : page.locator('#ui .plate[data-testid^="field-"]:visible').first()).click({ timeout: 15_000 })
        break
      }
      case 'clock': case 'plant': case 'rest':
        await page.locator(`#ui [data-testid="${target}"]`).first().click(); break
      case 'telegram':
        await page.locator('#ui [data-testid^="answer-"]').first().click(); break
      default: {
        // Any other lesson: what its fist marks, or Noted.
        // With the days running under a note to read, a note that holds the clock may come in front of it first.
        const marked = target ? page.locator(`#ui [data-testid="${target}"]`).first() : null
        const book = target.startsWith('pin-') ? page.locator(`#ui [data-testid="unit-${target.slice(4)}"]`).first() : null
        if (page.getByTestId('guide-noted') && await page.getByTestId('guide-noted').count() && !(marked && await marked.isVisible() && id === 'person')) await page.getByTestId('guide-noted').click({ timeout: 5_000 }).catch(() => {})
        else if (marked && await marked.isVisible()) await marked.click()
        else if (book && await book.isVisible()) await book.click()
        // Out of reach for now: a player may skip it, as the slip offers.
        else await page.getByTestId('guide-skip').click()
      }
    }
    await expect.poll(async () => (await finished()) ? '' : (await slip(page)).id, { timeout: 120_000, message: `${id} did not pass` }).not.toBe(id)
  }
  console.log(`followed: ${did.join(' > ')}`)
  expect(await sown()).toBe(true)
  // The opening is only what is needed to watch the first planting: no tour before the first days run.
  expect(did.slice(0, 3)).toEqual(['money', 'begin', 'clock'])
  // A face clicked: your own, or a hand's when one was hired in the first days (the same click, the same card).
  expect(did).toContain('watch')
  const face = did.findIndex(id => id === 'person' || id === 'hand')
  expect(face, 'a face is clicked in the opening').toBeGreaterThanOrEqual(0)
  expect(face).toBeLessThan(did.indexOf('turn') < 0 ? 999 : did.indexOf('turn'))
  // Once the opening's held lessons pass, the clock goes on at the speed it had.
  await noSidewaysScroll(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('refused, it shows nothing: Straight in, then a first season to its first planting with no slip and no fist', async ({ page }) => {
  test.setTimeout(420_000)
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()
  await page.getByTestId('guide-offer').getByTestId('guide-refuse').click()
  await expect(page.getByTestId('guide-offer')).toHaveCount(0)
  await page.getByTestId('begin-season').click()
  // Straight in starts the days at once, as it always has.
  await expect.poll(async () => (await look(page)).running, { timeout: 20_000 }).toBe(true)
  await page.getByTestId('speed-3').first().click().catch(async () => { await page.getByTestId('speed-cycle').click() })
  for (let k = 0; k < 120; k++) {
    expect(await page.locator('#ui [data-testid="guide-slip"]').count()).toBe(0)
    expect(await page.getByTestId('guide-fist').isVisible()).toBe(false)
    const s = await look(page)
    if (s.incidents) await page.locator('#ui [data-testid^="answer-"]').first().click()
    if (s.badges.length) break
    await page.waitForTimeout(500)
  }
  expect((await look(page)).badges.length).toBeGreaterThan(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the progress survives a reload, and any lesson can be shown again from How to play and the menu', async ({ page }) => {
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()
  await page.getByTestId('guide-accept').click()
  await expect.poll(async () => (await slip(page)).id).toBe('money')
  await page.getByTestId('guide-noted').click()
  await expect.poll(async () => (await slip(page)).id, { timeout: 10_000 }).toBe('begin')
  await page.getByTestId('begin-season').click()
  await expect.poll(async () => (await slip(page)).id, { timeout: 10_000 }).toBe('clock')
  await page.reload()
  await page.getByTestId('continue').click()
  await expect.poll(async () => (await slip(page)).id, { timeout: 10_000 }).toBe('clock')
  // Skip one step, then put the whole guide away: nothing shows.
  await page.getByTestId('guide-skip').click()
  await expect.poll(async () => (await slip(page)).id).toBe('')
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __countyGuide: { passed(id: string): boolean } }).__countyGuide.passed('clock'))).toBe(true)
  await page.getByTestId('menu-open').first().click()
  await page.getByTestId('guide-open').click()
  await expect(page.getByTestId('guide')).toBeVisible()
  // The tick is drawn over the box: the label is what a player clicks.
  await page.locator('#ui label.guide-on').click()
  await expect(page.getByTestId('guide-on')).not.toBeChecked()
  // From the menu: one lesson again, with the guide off.
  await page.getByTestId('guide-again-clock').click()
  await expect(page.getByTestId('guide')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await slip(page)).id, { timeout: 10_000 }).toBe('clock')
  await page.locator(`#ui [data-testid="${(await slip(page)).target}"]`).first().click()
  await expect.poll(async () => (await slip(page)).id).toBe('')
  // From How to play: the guide back on.
  await page.keyboard.press('Space')
  await page.getByTestId('menu-open').first().click()
  await page.getByTestId('how-open').click()
  await page.getByTestId('how-guide').click()
  await expect(page.getByTestId('guide')).toBeVisible()
  await page.locator('#ui label.guide-on').click()
  await expect(page.getByTestId('guide-on')).toBeChecked()
  await page.getByTestId('guide-close').click()
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __countyGuide: { on: boolean } }).__countyGuide.on)).toBe(true)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the axe checks pass with the offer, a lesson and the guide\'s paper showing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'axe is run once, at the desk')
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
  const serious = async () => {
    await page.waitForTimeout(600)
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join('; ')})`)
  }
  await fresh(page)
  await page.getByTestId('play').click()
  await expect(page.getByTestId('guide-offer')).toBeVisible()
  expect(await serious(), 'the offer').toEqual([])
  await page.getByTestId('guide-accept').click()
  expect(await serious(), 'the spring lesson').toEqual([])
  await page.getByTestId('guide-noted').click()
  await page.getByTestId('begin-season').click()
  await expect.poll(async () => (await slip(page)).id, { timeout: 10_000 }).toBe('clock')
  expect(await serious(), 'a lesson on the land').toEqual([])
  await page.getByTestId('menu-open').first().click()
  await page.getByTestId('guide-open').click()
  expect(await serious(), 'the guide\'s paper').toEqual([])
})
