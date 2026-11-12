// The guided first year as a newcomer meets it: offered as a card on a new farm, taken, and played from Play to the
// first sale by pressing only what the notes ask. At every step: the clock stands while a note or a card is up, one
// thing at most asks for attention, a note is 35 words or fewer, and the screen stays short of words.
import AxeBuilder from '@axe-core/playwright'
import { test, type Page } from '@playwright/test'
import { expect, noSidewaysScroll, watchErrors } from './helpers.ts'

// The budgets (docs/TUTORIAL.md). Words are those a player can see on the season screen, on the land's tags and in
// the note, field names aside. A card (the offer, what a year is) is all there is on the screen while it is up.
const NOTE_WORDS = 35
const CARD_WORDS = 80
const FIRST_DAY_WORDS = 80
// With a note up, and with a telegram or the spraying question up (the card is the one voice then).
const SEASON_WORDS = 100
const TELEGRAM_WORDS = 120

async function fresh(page: Page): Promise<void> {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'))
}

interface Seen {
  phase: string; speed: number; day: number; sold: number; done: boolean; stopped: string
  // The guide's note: its lesson, what it points at, its words, and the keys it carries.
  note: string; target: string; noteWords: number; cardWords: number; keys: string[]
  // What asks for attention now.
  asking: string[]
  // Words a player can see on the season screen, the land's tags and the note, field names aside.
  words: number; text: string
  hidden: string[]
  ticketSell: string; paperWords: number
}

async function see(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const { app, sim } = (globalThis as unknown as { __county: { app: any; sim: any } }).__county
    const c = app.campaign
    const ui = document.getElementById('ui')!
    const vis = (e: Element | null): e is HTMLElement => {
      if (!(e instanceof HTMLElement) || e.closest('[hidden], .leaving, .out, .gone')) return false
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'
    }
    const count = (t: string) => t.trim().split(/\s+/).filter(Boolean).length
    // The words in view: not a screen reader's, not what is held back, not what is off the screen.
    const read = (from: Element | null): string => {
      if (!from) return ''
      const out: string[] = []
      const walk = document.createTreeWalker(from, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const p = n.parentElement
        const t = n.textContent?.trim()
        if (!p || !t || p.closest('.sr, [hidden], .leaving, .out, .gone')) continue
        if (!p.checkVisibility({ opacityProperty: true, visibilityProperty: true } as CheckVisibilityOptions)) continue
        const r = p.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
        out.push(t)
      }
      return out.join(' ')
    }
    const slip = [...ui.querySelectorAll<HTMLElement>('[data-testid="guide-slip"]')].find(vis) ?? null
    const screen = ui.querySelector<HTMLElement>('.season-screen:not(.leaving)')
    const said = slip ? [...slip.querySelectorAll<HTMLElement>('.guide-ask, .guide-why')].filter(vis).map(e => read(e)).join(' ') : ''
    const card = [...ui.querySelectorAll<HTMLElement>('.guide-card')].find(vis) ?? null
    // What is on the land: the tags, stamps and faces, the fields' names aside.
    let land = read(ui.querySelector('.plate-layer'))
    for (const n of sim.FIELD_NAMES as string[]) land = land.split(n).join(' ')
    const text = `${read(screen)} | ${land} | ${slip && !slip.classList.contains('guide-card') ? read(slip) : ''}`
    const asking: string[] = []
    if (slip) asking.push('note')
    if (vis(ui.querySelector('[data-testid="guide-offer"]'))) asking.push('offer')
    if (vis(ui.querySelector('.season-screen .telegram'))) asking.push('telegram')
    if (ui.querySelector('.paper-layer > .dialog:not(.out)')) asking.push('paper')
    if ([...ui.querySelectorAll('.notes .alert')].some(vis)) asking.push('toast')
    if (vis(ui.querySelector('.press-pop'))) asking.push('pop')
    if (vis(ui.querySelector('.tray-paper'))) asking.push('tray')
    const sell = ui.querySelector<HTMLElement>('.paper-layer [data-testid^="lot-sell-"]')
    return {
      phase: c?.phase ?? 'title', speed: app.speed, stopped: app.pauseReason ?? '', day: c?.season?.day ?? -1, sold: c ? c.lots.filter((l: any) => l.sold > 0).length : 0, done: !!ui.querySelector('[data-testid="end-season"]'),
      note: slip?.dataset.lesson ?? '', target: slip?.dataset.target ?? '', noteWords: count(said), cardWords: card ? count(read(card)) : 0,
      keys: slip ? [...slip.querySelectorAll<HTMLElement>('button')].filter(vis).map(b => b.dataset.testid ?? '') : [],
      asking,
      words: count(text.replace(/\|/g, ' ')), text,
      hidden: [...ui.classList].filter(k => k.startsWith('st-hide-')).map(k => k.slice(8)),
      ticketSell: sell && vis(sell) ? sell.dataset.testid! : '', paperWords: count(read(ui.querySelector('.paper-layer > .dialog:not(.out)'))),
    }
  })
}

// What must hold whenever the test looks.
function check(s: Seen, did: string[]): void {
  const at = `after ${did.slice(-6).join(' > ')} (day ${s.day})`
  expect(s.asking.length, `one voice ${at}: ${s.asking.join(' + ')}`).toBeLessThanOrEqual(1)
  if (s.phase === 'season' && s.asking.length && !s.asking.includes('toast')) expect(s.speed, `the clock stands while ${s.asking[0]} is up, ${at}`).toBe(0)
  if (s.note) expect(s.noteWords, `${s.note} says it in ${NOTE_WORDS} words or fewer`).toBeLessThanOrEqual(NOTE_WORDS)
  expect(s.cardWords, `a card of ${CARD_WORDS} words or fewer ${at}`).toBeLessThanOrEqual(CARD_WORDS)
  if (s.phase === 'season') expect(s.words, `words on the season screen ${at}: ${s.text}`).toBeLessThanOrEqual(s.asking.includes('telegram') ? TELEGRAM_WORDS : SEASON_WORDS)
}

test('a guided first year: offered as a card, taken, and followed from Play to the first sale by what the notes ask alone', async ({ page, isMobile }) => {
  test.setTimeout(900_000)
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()

  // The offer: a card in the middle of the screen, the usual choice under the keyboard, nothing behind it in reach.
  const offer = page.getByTestId('guide-offer')
  await expect(offer).toBeVisible()
  const box = (await offer.boundingBox())!
  const view = page.viewportSize()!
  expect(Math.abs(box.x + box.width / 2 - view.width / 2), 'the offer is in the middle, across').toBeLessThan(view.width * 0.08)
  expect(Math.abs(box.y + box.height / 2 - view.height / 2), 'the offer is in the middle, down').toBeLessThan(view.height * 0.2)
  await expect(page.getByTestId('guide-accept')).toBeFocused()
  await expect(page.locator('#ui > .screen-layer')).toHaveAttribute('inert', '')
  check(await see(page), ['play'])
  await page.getByTestId('guide-accept').click()
  await expect(offer).toHaveCount(0)

  // What a year is, then Start the season.
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="frame"]')).toBeVisible()
  await expect(page.locator('#ui .gc-year li')).toHaveCount(5)
  const did: string[] = []
  let first = true
  const words: number[] = []
  let cardMost = 0
  let quiet = 0
  // The whole season at the first speed is ten minutes: the skips ahead make it far less.
  const until = Date.now() + 720_000
  let moved = { day: -1, at: Date.now() }
  while (Date.now() < until) {
    let s = await see(page)
    check(s, did)
    if (s.sold > 0) break
    expect(s.phase === 'plan' || s.phase === 'season', `still in the first season (${s.phase})`).toBe(true)
    if (s.day !== moved.day || s.asking.length) moved = { day: s.day, at: Date.now() }
    expect(Date.now() - moved.at, `the days stand with nothing asked, after ${did.join(' > ')} (day ${s.day}, speed ${s.speed})`).toBeLessThan(20_000)
    if (s.note) {
      quiet = 0
      if (did[did.length - 1] !== s.note) {
        did.push(s.note)
        // Read as a player reads it: once it has settled.
        await page.waitForTimeout(600)
        s = await see(page)
        check(s, did)
        if (s.note !== did[did.length - 1]) continue
        words.push(s.words)
        console.log(`${s.note} (day ${s.day}, ${s.words} words): ${s.text}`)
        // The first day of a guided season: the land, the date and the cash, and one note.
        if (s.note === 'fields' && first) {
          first = false
          console.log(`the first guided day: ${s.words} words on the screen; held back: ${s.hidden.join(', ')}`)
          expect(s.words, s.text).toBeLessThanOrEqual(FIRST_DAY_WORDS)
          expect(s.hidden.sort()).toEqual(['after', 'forecast', 'list', 'people', 'stamps'])
          await expect(page.getByTestId('guide-held')).toBeVisible()
        }
      }
      // Only what the note asks: the stamp it says to click, its skip ahead, its Got it, or the control it points at.
      const key = s.note === 'stamp' && s.target.startsWith('badge-') ? '' : s.keys.includes('guide-ahead') ? 'guide-ahead' : s.keys.includes('guide-noted') ? 'guide-noted' : ''
      if (key) await page.locator(`#ui [data-testid="guide-slip"] [data-testid="${key}"]`).first().click()
      else await page.locator(`#ui [data-testid="${s.target}"]`).first().click()
      await page.waitForTimeout(120)
      continue
    }
    if (s.asking.includes('telegram')) cardMost = Math.max(cardMost, s.words)
    if (s.asking.includes('telegram')) {
      // A telegram or the spraying question: the usual reply (the one marked first), as the card's agent line says.
      quiet = 0
      const spray = page.getByTestId('spray-way-auto')
      if (await spray.isVisible().catch(() => false)) { did.push('spraying'); await spray.click() }
      else { did.push('telegram'); await page.locator('#ui .season-screen .telegram .reply.first').first().click() }
      await page.waitForTimeout(200)
      continue
    }
    if (s.ticketSell) { quiet = 0; did.push('ticket'); console.log(`the weigh ticket: ${s.paperWords} words`); await page.locator(`#ui [data-testid="${s.ticketSell}"]`).click(); await page.waitForTimeout(300); continue }
    if (s.asking.includes('tray')) { await page.getByTestId('sample-close').click().catch(() => {}); continue }
    // Nothing asks: the days run by themselves. A clock stopped with nothing said would be a fault.
    if (s.speed === 0 && !s.asking.length) expect(++quiet, `the clock stands with nothing on the screen saying why (${s.stopped}), after ${did.join(' > ')}`).toBeLessThan(40)
    else quiet = 0
    await page.waitForTimeout(250)
  }
  console.log(`followed: ${did.join(' > ')}`)
  console.log(`words on the screen at each note: ${words.join(' ')}; the most with a telegram up: ${cardMost}`)
  expect((await see(page)).sold, `a crop sold, after ${did.join(' > ')}`).toBeGreaterThan(0)
  // The opening: what the game is, the land, planting day; then the year.
  expect(did.slice(0, 5)).toEqual(['frame', 'begin', 'fields', 'look', 'plantday'])
  for (const id of ['tend', 'dig', 'ticket']) expect(did).toContain(id)
  expect(new Set(did).size, 'about a dozen notes').toBeLessThanOrEqual(16)
  if (!isMobile) await noSidewaysScroll(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the offer is answered by its keys, and Skip the tutorial shows no guide', async ({ page, isMobile }) => {
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()
  const offer = page.getByTestId('guide-offer')
  await expect(offer).toBeVisible()
  if (isMobile) await page.getByTestId('guide-refuse').click()
  else await page.keyboard.press('Digit2')
  await expect(offer).toHaveCount(0)
  await expect(page.locator('#ui > .screen-layer')).not.toHaveAttribute('inert', '')
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('forecast')).toBeVisible()
  // The whole interface from the first day, the clock running, and no note for a week of days.
  const s = await see(page)
  expect(s.hidden).toEqual([])
  expect(s.speed).toBeGreaterThan(0)
  await page.evaluate(() => { const { app } = (globalThis as unknown as { __county: { app: any } }).__county; for (let k = 0; k < 7; k++) app.do({ t: 'day' }) })
  await page.waitForTimeout(800)
  await expect(page.locator('#ui [data-testid="guide-slip"]:not([hidden])')).toHaveCount(0)
  // A second new farm is not asked again.
  await page.evaluate(() => (globalThis as unknown as { __county: { app: any } }).__county.app.quitToTitle())
  await page.getByTestId('play').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('begin-season')).toBeVisible()
  await expect(offer).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('key 1 takes the guide, the title starts a guided farm outright, and a reload keeps its place', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone has no keyboard')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()
  await expect(page.getByTestId('guide-offer')).toBeVisible()
  await page.keyboard.press('Digit1')
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="frame"]')).toBeVisible()
  // The card's own key is under the keyboard; Enter begins.
  await expect(page.locator('#ui [data-testid="guide-slip"] [data-testid="guide-noted"]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="begin"]')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(3000)
  await page.reload()
  await page.getByTestId('continue').click()
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="begin"]')).toBeVisible({ timeout: 15_000 })
  // From the title: a guided farm with no offer to answer.
  await page.evaluate(() => (globalThis as unknown as { __county: { app: any } }).__county.app.quitToTitle())
  await page.getByTestId('play-guided').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="frame"]')).toBeVisible()
  await expect(page.getByTestId('guide-offer')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the clock is the player\'s: Space puts a note away, the next one holds the days again, and after the last they run', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone has no keyboard')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()
  await page.getByTestId('guide-accept').click()
  await page.locator('#ui [data-testid="guide-slip"] [data-testid="guide-noted"]').click()
  await page.getByTestId('begin-season').click()
  const note = page.locator('#ui [data-testid="guide-slip"]:not([hidden])')
  await expect(note).toHaveAttribute('data-lesson', 'fields', { timeout: 15_000 })
  await expect(page.getByTestId('guide-held')).toBeVisible()
  expect((await see(page)).speed).toBe(0)
  await page.waitForTimeout(600)
  await page.keyboard.press('Space')
  // The note after it comes at once and stops the days again: none ran between the two.
  await expect(note).toHaveAttribute('data-lesson', 'look')
  const day = (await see(page)).day
  await expect.poll(async () => (await see(page)).speed).toBe(0)
  await page.waitForTimeout(600)
  await page.keyboard.press('Space')
  await expect(note).toHaveCount(0)
  await expect.poll(async () => (await see(page)).speed).toBeGreaterThan(0)
  expect((await see(page)).day).toBeGreaterThanOrEqual(day)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the axe checks pass with the offer, the year card and a note showing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  await fresh(page)
  const scan = async (what: string) => {
    const r = await new AxeBuilder({ page }).include('#ui').analyze()
    expect(r.violations.map(v => `${what}: ${v.id} ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
  await page.getByTestId('play').click()
  await expect(page.getByTestId('guide-offer')).toBeVisible()
  await scan('offer')
  await page.getByTestId('guide-accept').click()
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="frame"]')).toBeVisible()
  await scan('year card')
  await page.locator('#ui [data-testid="guide-slip"] [data-testid="guide-noted"]').click()
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="begin"]')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('begin-season').click()
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="fields"]')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(700)
  await scan('a note in the season')
})
