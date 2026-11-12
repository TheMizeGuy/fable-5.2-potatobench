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
async function land(page: Page, r = 0): Promise<{ x: number; y: number }> {
  return page.evaluate(r => {
    const canvas = document.getElementById('field')
    const open = (x: number, y: number) => document.elementFromPoint(x, y) === canvas
    for (let fy = 0.3; fy < 0.85; fy += 0.04) for (let fx = 0.2; fx < 0.8; fx += 0.04) {
      const x = Math.round(innerWidth * fx), y = Math.round(innerHeight * fy)
      if (!open(x, y)) continue
      if (r && ![0, 0.5, 1, 1.5, 2, 2.5, 3].every(a => open(x + Math.cos(a) * r, y + Math.sin(a) * r) && open(x - Math.cos(a) * r, y - Math.sin(a) * r))) continue
      return { x, y }
    }
    return { x: Math.round(innerWidth / 2), y: Math.round(innerHeight * 0.6) }
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
    const at = (a: number) => [{ x: p.x + Math.cos(a) * 60, y: p.y + Math.sin(a) * 60 }, { x: p.x - Math.cos(a) * 60, y: p.y - Math.sin(a) * 60 }]
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
  const s = page.locator('#ui [data-testid="guide-slip"]:not([hidden])')
  if (!(await s.count())) return
  const sb = await s.first().boundingBox()
  if (!sb) return
  const others = await page.evaluate(t => [...document.querySelectorAll<HTMLElement>(`#ui .clock, #ui .command, #ui .telegram, #ui .paper-layer .dialog${t ? `, #ui [data-testid="${t}"]` : ''}`)]
    .filter(e => !e.closest('.guide, .leaving, [hidden]') && e.offsetParent !== null)
    .map(e => { const r = e.getBoundingClientRect(); return { name: e.dataset.testid ?? e.className, x: r.x, y: r.y, width: r.width, height: r.height } })
    .filter(r => r.width > 0 && r.height > 0), target)
  // In spring the slip sits in the catalogue itself, beside its own order blank.
  for (const o of others) if (!String(o.name).includes('catalogue')) expect(meets(sb, o), `the slip lies over ${o.name}`).toBe(false)
}

test('a guided first year: offered on a new farm, taken, and followed to the first planting by what it says alone', async ({ page, isMobile }) => {
  test.setTimeout(420_000)
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
  let planted = false
  const sown = () => page.evaluate(() => (globalThis as unknown as { __county: { app: { campaign: { season: { fields: { plantDay: number }[] } | null } } } }).__county.app.campaign.season?.fields.some(f => f.plantDay >= 0) ?? false)
  for (let step = 0; step < 40 && !planted; step++) {
    if (await sown()) { planted = true; break }
    // Each lesson is waited for as a player would: it is on the screen, or the days are running toward it.
    await expect.poll(async () => (await slip(page)).id, { timeout: 120_000, message: `after ${did.join(' ')}` }).not.toBe('')
    const { id, target } = await slip(page)
    // Between one lesson and the next, or under a paper a moment: look again.
    if (!id) continue
    if (did[did.length - 1] !== id) did.push(id)
    await clear(page, target)
    // Where what it points at is on the screen, the fist is beside it.
    const there = target ? await page.locator(`#ui [data-testid="${target}"]`).first().isVisible().catch(() => false) : false
    if (there) await expect(page.getByTestId('guide-fist'), `${id}: the fist is on ${target}`).toBeVisible()
    switch (id) {
      case 'begin':
        await page.getByTestId(target).click()
        await expect(page.getByTestId('date').first()).toBeVisible()
        // The clock is held for the opening, and the slip says so.
        await expect(page.getByTestId('guide-held')).toBeVisible()
        expect((await look(page)).paused).toBe(true)
        break
      case 'look': case 'turn':
        // As a player would, again and a little further if the land did not seem to move the first time.
        for (let k = 1; k <= 3 && (await slip(page)).id === id; k++) {
          await (id === 'look' ? drag(page, isMobile, k) : turn(page, isMobile, k))
          await page.waitForTimeout(1500)
          console.log(`${id} ${k}: ${await page.evaluate(() => JSON.stringify((globalThis as unknown as { __countyGuide: { p: { facts: string[] } } }).__countyGuide.p.facts))}`)
        }
        break
      case 'boards': case 'card': case 'person': case 'frost': case 'haul': case 'routine': case 'list':
        await page.getByTestId('guide-noted').click(); break
      case 'almanac':
        // It says the cross closes it: the almanac is opened and put away again.
        await page.locator(`#ui [data-testid="${target}"]`).first().click()
        await expect(page.getByTestId('almanac')).toBeVisible()
        await page.getByTestId('almanac-close').click()
        await expect(page.getByTestId('almanac')).toHaveCount(0)
        break
      case 'field': {
        // It asks for a field's tag: the one its fist marks, or any on the screen.
        const marked = page.locator(`#ui [data-testid="${target}"]`).first()
        if (!(await marked.isVisible())) {
          // Out of view, the slip says how to bring the farm back.
          await expect(page.getByTestId('guide-lost')).toBeVisible()
          if (isMobile) { const p = await land(page); await page.touchscreen.tap(p.x, p.y); await page.touchscreen.tap(p.x, p.y) } else await page.keyboard.press('Home')
          await page.waitForTimeout(1500)
        }
        await ((await marked.isVisible()) ? marked : page.locator('#ui .plate[data-testid^="field-"]:visible').first()).click()
        break
      }
      case 'clock': case 'fast': case 'plant': case 'rest':
        await page.locator(`#ui [data-testid="${target}"]`).first().click(); break
      case 'telegram':
        await page.locator('#ui [data-testid^="answer-"]').first().click(); break
      case 'watch':
        await expect.poll(sown, { timeout: 120_000 }).toBe(true)
        planted = true
        break
      default:
        throw new Error(`no step written for the lesson ${id}`)
    }
    if (await sown()) { planted = true; break }
    await expect.poll(async () => (await sown()) ? '' : (await slip(page)).id, { timeout: 120_000, message: `${id} did not pass` }).not.toBe(id)
  }
  console.log(`followed: ${did.join(' > ')}`)
  expect(planted).toBe(true)
  // The routine plants by itself once the soil is warm; at 3× the planting itself can take a moment, so seeing it is
  // not required here, only that it happened.
  for (const id of ['begin', 'look', 'turn', 'boards', 'almanac', 'field', 'card', 'person', 'clock']) expect(did).toContain(id)
  expect(did.indexOf('look')).toBeLessThan(did.indexOf('clock'))
  // Nothing was locked and the clock was never moved by the guide: it runs at the speed the player last chose.
  const s = await look(page)
  expect(s.paused || s.speed === 3).toBe(true)
  await noSidewaysScroll(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('refused, it shows nothing: Straight in, then a first season to its first planting with no slip and no fist', async ({ page }) => {
  test.setTimeout(240_000)
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

test('the progress survives a reload, and any lesson can be shown again from How to play and the menu', async ({ page, isMobile }) => {
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()
  await page.getByTestId('guide-accept').click()
  await page.getByTestId('begin-season').click()
  await expect.poll(async () => (await slip(page)).id).toBe('look')
  for (let k = 1; k <= 3 && (await slip(page)).id === 'look'; k++) { await drag(page, isMobile, k); await page.waitForTimeout(1500) }
  await expect.poll(async () => (await slip(page)).id).toBe('turn')
  await page.reload()
  await page.getByTestId('continue').click()
  await expect.poll(async () => (await slip(page)).id).toBe('turn')
  // Skip one step, then put the whole guide away: nothing shows.
  await page.getByTestId('guide-skip').click()
  await expect.poll(async () => (await slip(page)).id).toBe('boards')
  await page.getByTestId('guide-stop').click()
  await expect(page.locator('#ui [data-testid="guide-slip"]')).toHaveCount(0)
  // From the menu: the guide's own paper, and one lesson again.
  await page.getByTestId('menu-open').first().click()
  await page.getByTestId('guide-open').click()
  await expect(page.getByTestId('guide')).toBeVisible()
  await page.getByTestId('guide-again-look').click()
  await expect(page.getByTestId('guide')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await slip(page)).id).toBe('look')
  for (let k = 1; k <= 3 && (await slip(page)).id === 'look'; k++) { await drag(page, isMobile, k); await page.waitForTimeout(1500) }
  await expect.poll(async () => (await slip(page)).id).toBe('')
  // From How to play.
  await page.getByTestId('menu-open').first().click()
  await page.getByTestId('how-open').click()
  await page.getByTestId('how-guide').click()
  await expect(page.getByTestId('guide')).toBeVisible()
  await page.getByTestId('guide-on').check()
  await page.getByTestId('guide-close').click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await slip(page)).id).toBe('boards')
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
  await page.getByTestId('begin-season').click()
  await expect.poll(async () => (await slip(page)).id).toBe('look')
  expect(await serious(), 'a lesson on the land').toEqual([])
  await page.getByTestId('menu-open').first().click()
  await page.getByTestId('guide-open').click()
  expect(await serious(), 'the guide\'s paper').toEqual([])
})
