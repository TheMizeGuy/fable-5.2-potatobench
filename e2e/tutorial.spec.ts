// The guided first year as a newcomer meets it: offered as a card on a new farm, taken, and played from Play to the
// first sale by pressing only what the notes ask. At every step: the clock stands while a note or a card is up, one
// thing at most asks for attention, a note is 35 words or fewer, and the screen stays short of words.
import AxeBuilder from '@axe-core/playwright'
import { test, type Page } from '@playwright/test'
import { expect, noSidewaysScroll, open, putAway, reach, watchErrors } from './helpers.ts'

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

// ---------------------------------------------------------------- round six: the guide and the pauses (docs/quality/players/round-6.md)

type Win = { __county: { app: any; sim: any }; __countyGuide: any }
const note = (page: Page, id: string) => page.locator(`#ui [data-testid="guide-slip"][data-lesson="${id}"]:not([hidden])`)
const game = <T>(page: Page, code: string) => page.evaluate(`(() => { const { app, sim } = window.__county; const c = app.campaign; return ${code} })()`) as Promise<T>
// Pictures for the report, at the players' size: PICS=1 writes them to out/pics.
async function picture(page: Page, name: string): Promise<void> {
  if (process.env.PICS) await page.screenshot({ path: `out/pics/${name}.png` })
}

// A farm at its second spring, the first year played out by the coach. guideAt: the lesson the tutorial is at, or
// null for a player who turned it down.
async function secondSpring(page: Page, guideAt: string | null, more = ''): Promise<void> {
  await open(page)
  await reach(page, `q.start(1987, 3); q.year(3); const { app } = q.g(); const c = app.campaign; app.do({ t: 'next' })
    const guide = window.__countyGuide; guide.reset(); ${guideAt ? `guide.skipTo(${JSON.stringify(guideAt)})` : 'guide.refuse()'}; ${more}`)
  await putAway(page)
  await expect(page.getByTestId('begin-season')).toBeVisible()
}

// Whether a control can be seen and pressed where it is: inside the window, with nothing over its middle.
const reachable = (page: Page, id: string) => page.evaluate(id => {
  const el = document.querySelector<HTMLElement>(`#ui [data-testid="${id}"]`)
  if (!el) return 'not there'
  const r = el.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  if (r.top >= 0 && r.bottom <= innerHeight && r.width > 0 && !!hit && el.contains(hit)) return 'in view'
  const card = el.closest<HTMLElement>('.person-card')
  const cb = card?.getBoundingClientRect()
  return `out of view (${Math.round(r.top)} to ${Math.round(r.bottom)} of ${innerHeight}; under ${hit ? `${hit.tagName}.${String(hit.className).split(' ').slice(0, 3).join('.')}` : 'nothing'}; its card ${cb ? `${Math.round(cb.top)} to ${Math.round(cb.bottom)}, scrolls ${card!.scrollTop} of ${card!.scrollHeight - card!.clientHeight}, max-height ${getComputedStyle(card!).maxHeight}` : 'none'})`
}, id)

// The goal slip as it is laid out: whether its figure lies on its words, and how wide its words' column is. Read from
// the boxes whether or not the slip is shown, since a slip standing down keeps its place.
const slipLaid = (page: Page) => page.evaluate(() => {
  const slip = document.querySelector<HTMLElement>('#ui [data-testid="goal"]')
  if (!slip) return null
  const n = slip.querySelector<HTMLElement>('.goal-n')
  const body = slip.querySelector<HTMLElement>('.goal-body')!
  const range = document.createRange()
  const lines: DOMRect[] = []
  for (const el of slip.querySelectorAll<HTMLElement>('.goal-t, .goal-when')) { range.selectNodeContents(el); lines.push(...range.getClientRects()) }
  const nb = n?.getBoundingClientRect()
  const sb = slip.getBoundingClientRect()
  return {
    title: slip.querySelector('.goal-t')?.textContent ?? '', figure: n?.textContent ?? '',
    over: nb ? lines.filter(r => r.left < nb.right - 0.5 && r.right > nb.left + 0.5 && r.top < nb.bottom - 0.5 && r.bottom > nb.top + 0.5).length : 0,
    rows: new Set(lines.map(r => Math.round(r.top))).size, wide: Math.round(body.getBoundingClientRect().width),
    inside: lines.every(r => r.left >= sb.left - 0.5 && r.right <= sb.right + 0.5),
    shown: getComputedStyle(slip).visibility !== 'hidden',
  }
})

// A (4): the slip's words keep their column and its days figure never lies on them, at any width, note up or not.
test('the goal slip keeps its figure off its words at every width, with a tutorial note up and without', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the sizes are set here')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await secondSpring(page, 'calls2')
  await page.getByTestId('begin-season').click()
  await expect(note(page, 'calls2')).toBeVisible({ timeout: 15_000 })
  const SIZES = [[1280, 800], [1440, 900], [1024, 700], [820, 1180], [390, 844], [320, 640]]
  const laid = async (when: string) => {
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(450)
      const m = (await slipLaid(page))!
      const at = `${when}, ${width} by ${height}: "${m.title}" in ${m.rows} rows, ${m.wide}px for its words, figure "${m.figure}"`
      expect(m.figure, at).toMatch(/about \d+ days/)
      expect(m.over, `the figure lies on the words ${at}`).toBe(0)
      expect(m.inside, `the words run out of the slip ${at}`).toBe(true)
      expect(m.wide, `the words are squeezed ${at}`).toBeGreaterThan(100)
    }
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(450)
  }
  await laid('with a note up')
  // B: while the note is up the slip stands down, in its place.
  expect((await slipLaid(page))!.shown).toBe(false)
  await picture(page, 'a-note-up-1280')
  await note(page, 'calls2').getByTestId('guide-noted').click()
  await expect(note(page, 'calls2')).toHaveCount(0)
  await expect.poll(async () => (await slipLaid(page))!.shown).toBe(true)
  await laid('with no note')
  await picture(page, 'a-slip-1280')
  expect(errors, errors.join('\n')).toEqual([])
})

// B (13): one voice at a time. Through the second spring, while the agent has notes for it, the goal slip and the fold
// it rings never speak; once the season's first note is read, the slip is back.
test('in the second spring the goal slip stands down while the agent has a note, and comes back after', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await secondSpring(page, 'seed')
  const voices = () => page.evaluate(() => {
    const vis = (e: Element | null | undefined): e is HTMLElement => e instanceof HTMLElement && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden], .leaving')
    const ui = document.getElementById('ui')!
    const slipNote = [...ui.querySelectorAll<HTMLElement>('[data-testid="guide-slip"]')].find(vis)
    const goal = ui.querySelector<HTMLElement>('[data-testid="goal"]')
    const ring = [...ui.querySelectorAll<HTMLElement>('.catalogue .goal-ring')].find(vis)
    const { app } = (globalThis as unknown as Win).__county
    return {
      phase: app.campaign.phase as string, note: slipNote?.dataset.lesson ?? '', target: slipNote?.dataset.target ?? '', said: slipNote?.querySelector('.guide-ask')?.textContent ?? '',
      got: !!slipNote?.querySelector('[data-testid="guide-noted"]'), slip: vis(goal) ? (goal.querySelector('.goal-t')?.textContent ?? 'slip') : '', ring: ring ? ring.textContent ?? 'ring' : '',
      paper: !!ui.querySelector('.paper-layer > .dialog:not(.out)'),
    }
  })
  const two: string[] = []
  const notes: string[] = []
  let pictured = false
  const until = Date.now() + 200_000
  while (Date.now() < until) {
    // Watched for a second and a half at each step, the gaps between notes included.
    let v = await voices()
    for (let k = 0; k < 10 && v.phase === 'plan'; k++) {
      if (v.slip || v.ring) two.push(`${v.note ? `note "${v.said}"` : 'between notes'} with ${v.slip ? `the slip "${v.slip}"` : ''}${v.ring ? ` the fold "${v.ring.trim()}"` : ''}`)
      await page.waitForTimeout(150)
      v = await voices()
    }
    if (v.phase !== 'plan') break
    if (v.paper) { await page.keyboard.press('Escape'); continue }
    if (!v.note) continue
    if (notes[notes.length - 1] !== v.note) notes.push(v.note)
    if (!pictured && v.note === 'seed') { pictured = true; await picture(page, 'b-spring-note-1280') }
    // What the note asks: its Got it, or the control it points at.
    if (v.got) await page.locator('#ui [data-testid="guide-slip"]:not([hidden]) [data-testid="guide-noted"]').first().click()
    else await page.locator(`#ui [data-testid="${v.target}"]`).first().click()
    await page.waitForTimeout(200)
  }
  console.log(`the second spring's notes: ${notes.join(' > ')}`)
  expect([...new Set(two)], 'two voices at once').toEqual([])
  expect(notes).toEqual(['seed', 'people', 'hire', 'land', 'loan', 'begin2'])
  // The season: its first note, the slip down; read, and the slip is the one voice.
  await expect(note(page, 'calls2')).toBeVisible({ timeout: 15_000 })
  expect((await voices()).slip).toBe('')
  await note(page, 'calls2').getByTestId('guide-noted').click()
  await expect.poll(async () => (await voices()).slip, { timeout: 10_000 }).not.toBe('')
  await picture(page, 'b-season-slip-1280')
  expect(errors, errors.join('\n')).toEqual([])
})

// C (13): what a foreman is, where the key is, and what naming one did.
test('naming a foreman: the slip says what one is, the key comes into view lit, and the card and a note answer at once', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk, at the players\' size')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  // A hand hired, and too little in hand to build: the next goal is the foreman, as it was for all three players.
  await secondSpring(page, null, `app.do({ t: 'hire', kind: 'hand' }); c.cash = 400`)
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('date')).toBeVisible()
  const hand = await game<number>(page, 'c.crew.find(u => u.kind !== "farmer").id')
  const first = await game<string>(page, 'c.crew.find(u => u.kind !== "farmer").name.split(" ")[0]')
  // The slip names the goal and says what it is.
  await expect(page.getByTestId('goal')).toContainText('name a foreman')
  await expect(page.getByTestId('goal')).toContainText('a hand who orders a block\'s work')
  await picture(page, 'c-slip-1280')
  // The tutorial's own note for it (turned on here): what a foreman is, and a Show me to the key.
  await page.evaluate(() => { const g = (globalThis as unknown as Win).__countyGuide; g.skipTo('foreman') })
  await expect(note(page, 'foreman')).toBeVisible({ timeout: 10_000 })
  await expect(note(page, 'foreman')).toContainText('A foreman is a hired hand who orders a block\'s field work for you each morning')
  await expect(note(page, 'foreman')).toContainText(`Foreman on ${first}'s card`)
  await note(page, 'foreman').getByTestId('guide-show').click()
  await expect.poll(() => game<number>(page, 'app.unit')).toBe(hand)
  await expect.poll(() => reachable(page, 'person-foreman'), { timeout: 8000 }).toBe('in view')
  await expect(page.locator('#ui [data-testid="person-foreman"].goal-ring')).toHaveCount(1)
  await picture(page, 'c-note-show-1280')
  await note(page, 'foreman').getByTestId('guide-noted').click()
  await page.evaluate(() => { const w = globalThis as unknown as Win; w.__countyGuide.stop(); w.__county.app.selectUnit(-1); w.__county.app.setSpeed(1) })
  await expect(page.getByTestId('person-card')).toBeHidden()
  // As the players went: the ringed person at the foot, then their card. The key is in view, lit.
  await page.getByTestId(`unit-${hand}`).click()
  await expect(page.getByTestId('person-card')).toBeVisible()
  await expect.poll(() => reachable(page, 'person-foreman'), { timeout: 8000 }).toBe('in view')
  await expect(page.locator('#ui [data-testid="person-foreman"].goal-ring')).toHaveCount(1)
  await picture(page, 'c-key-1280')
  // Pressed: what it will do, and the block to pick, in view.
  await page.getByTestId('person-foreman').click()
  await expect(page.getByTestId('foreman-what')).toContainText('A foreman orders the work on one block of fields for you each morning')
  await expect(page.getByTestId('foreman-what')).toContainText('40% more')
  await expect.poll(() => reachable(page, 'foreman-home'), { timeout: 8000 }).toBe('in view')
  await picture(page, 'c-choices-1280')
  await page.getByTestId('foreman-home').click()
  // Named: on the card at once, and as a note.
  expect(await game<string>(page, `c.crew.find(u => u.id === ${hand}).foreman`)).toBe('home')
  await expect(page.getByTestId('person-kind')).toHaveText('Foreman, the home farm')
  await expect(page.getByTestId('foreman-said')).toContainText('Foreman of the home farm')
  await expect.poll(() => reachable(page, 'foreman-said'), { timeout: 8000 }).toBe('in view')
  await expect.poll(() => reachable(page, 'person-foreman')).toBe('in view')
  await expect(page.getByTestId('person-foreman')).toContainText('home farm')
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'is now foreman of the home farm' })).toBeVisible()
  // And it stays there while the days run and the card is redrawn.
  await expect.poll(() => game<number>(page, 'c.season.day - app.campaign.season.startDay'), { timeout: 30_000 }).toBeGreaterThan(1)
  await page.waitForTimeout(400)
  expect(await reachable(page, 'foreman-said')).toBe('in view')
  await picture(page, 'c-named-1280')
  // Nothing but the card scrolled to show them.
  expect(await page.evaluate(() => [document.documentElement.scrollTop, document.body.scrollTop, document.getElementById('ui')!.scrollTop])).toEqual([0, 0, 0])
  expect(errors, errors.join('\n')).toEqual([])
})

// D (12): a note names a control by the words on it.
test('the winter note names the building list by the words on its key', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  const errors = watchErrors(page)
  await open(page)
  await reach(page, `q.start(1987, 3); q.run(999); const { app } = q.g(); app.campaign.cash += 40000; app.do({ t: 'endSeason' })
    const guide = window.__countyGuide; guide.reset(); guide.skipTo('yard')`)
  await putAway(page)
  await expect(note(page, 'yard')).toBeVisible({ timeout: 15_000 })
  const key = (await page.getByTestId('raise-open').locator('b').textContent())!.trim()
  const heading = (await page.locator('#ui .w-raise h2').textContent())!.trim()
  expect(key).toMatch(/^\d+ to choose from$/)
  const said = (await note(page, 'yard').locator('.guide-ask').textContent())!
  expect(said, 'the key\'s own words').toContain(`"${key}"`)
  expect(said, 'the heading over it').toContain(heading)
  expect(errors, errors.join('\n')).toEqual([])
})

// D (12): the first planting is said when it has begun, not while its order waits for warm soil, and its Show me
// goes to the field it names.
test('"Planting has started" waits for the planting, and its Show me goes to the field', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await open(page)
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.refuse(); const { app } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); app.setSpeed(0)`)
  await putAway(page)
  const toast = page.locator('#ui .notes .alert').filter({ hasText: 'Planting has started' })
  let named = ''
  for (let day = 0; day < 90 && !named; day++) {
    const begun = await page.evaluate(() => {
      const { app } = (globalThis as unknown as Win).__county
      const c = app.campaign
      for (const i of [...c.incidents]) app.do({ t: 'answer', incident: i.id, choice: i.choices[i.choices.length - 1] })
      app.do({ t: 'day' })
      app.setSpeed(0)
      return c.season.jobs.some((j: any) => j.kind === 'plant' && j.done > 0) || c.season.fields.some((f: any) => f.plantDay >= 0)
    })
    await page.waitForTimeout(120)
    const up = await toast.count()
    if (!begun) expect(up, `said on day ${day}, before any planting was done`).toBe(0)
    else if (up) named = ((await toast.first().textContent()) ?? '').match(/started in ([A-Z][a-z]+(?: [A-Z][a-z]+)?)\./)?.[1] ?? ''
    else if (begun) await page.waitForTimeout(400)
  }
  expect(named, 'the toast came once planting had begun').not.toBe('')
  await toast.first().click()
  const field = await page.evaluate(n => (globalThis as unknown as Win).__county.sim.FIELD_NAMES.indexOf(n), named)
  await expect.poll(() => game<number[]>(page, 'app.selection')).toEqual([field])
  expect(await game<number>(page, 'app.unit')).toBe(-1)
  await expect(page.getByTestId('card-title')).toHaveText(named)
  expect(errors, errors.join('\n')).toEqual([])
})

// A harvest where frost is forecast on the first barrels, before any ticket: the days run by the test to the evening
// of the warning with the game at 1x. Returns the speed after that day and why the clock says it stopped, and leaves
// the game stopped there (at 1x the next day, and its news, would come four seconds later).
async function toFrostWarning(page: Page, guided: boolean): Promise<{ speed: number; why: string; farm: string }> {
  await open(page)
  return page.evaluate(async guided => {
    const w = globalThis as unknown as Win
    const { app, sim } = w.__county
    const answer = (c: any, go: (cmd: unknown) => unknown) => { for (const i of [...c.incidents]) go({ t: 'answer', incident: i.id, choice: sim.defaultChoice(i) }) }
    for (const seed of [7, 8, 12]) {
      w.__countyGuide.reset()
      if (guided) { w.__countyGuide.skipTo('bills') } else w.__countyGuide.refuse()
      app.newGame(1995, seed)
      const c = app.campaign
      app.do({ t: 'begin' })
      app.do({ t: 'sprayWay', way: 'auto' })
      // Which day brings the warning, found on a copy of the farm.
      const copy = structuredClone(c)
      let days = -1
      for (let n = 0; n < 300 && days < 0 && !sim.seasonDone(copy) && !copy.season.fields.some((f: any) => f.weighed); n++) {
        answer(copy, cmd => sim.apply(app.world, copy, cmd))
        if (sim.apply(app.world, copy, { t: 'day' }).events.some((e: any) => e.type === 'frostBarrels')) days = n
      }
      if (days < 0) continue
      // The farm itself is brought to the day before, and the screen let settle: news of the days hurried through
      // (a test dig's offer comes a moment after its day) arrives and goes before the day this is about.
      for (let n = 0; n < days; n++) { answer(c, cmd => app.do(cmd)); app.do({ t: 'day' }) }
      app.setSpeed(0)
      await new Promise(done => setTimeout(done, 2500))
      answer(c, cmd => app.do(cmd))
      app.setSpeed(1)
      const r = app.do({ t: 'day' })
      if (!r.events.some((e: any) => e.type === 'frostBarrels')) continue
      // What the clock did by itself is read here; then it is stopped by the test, so the screen holds still to be looked at.
      const at = { speed: app.speed as number, why: app.pauseReason as string, farm: `1995, seed ${seed}, day ${c.season.day}` }
      app.setSpeed(0)
      return at
    }
    return { speed: -1, why: 'no frost warning before the first ticket', farm: '' }
  }, guided)
}

// F (18): a notice that asks nothing does not pause a player who has "Pause on alerts" off. It comes as a toast.
test('frost forecast on the barrels is a toast, not a pause, for a player without the tutorial', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  const errors = watchErrors(page)
  const at = await toFrostWarning(page, false)
  expect(at.speed, `${at.farm}: paused with "${at.why}"`).toBe(1)
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'Frost tonight' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

// F (18): in the tutorial a kind of notice pauses the first time, with its note; after that it is a toast.
test('in the guided year a frost warning the agent has explained once comes as a toast and does not pause', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  const errors = watchErrors(page)
  const at = await toFrostWarning(page, true)
  expect(at.speed, `${at.farm}: paused with "${at.why}"`).toBe(1)
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'Frost tonight' })).toBeVisible()
  await expect(page.locator('#ui [data-testid="guide-slip"]:not([hidden])')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

// The guided first day, as a player reaches it.
async function firstGuidedDay(page: Page): Promise<void> {
  await fresh(page)
  await page.getByTestId('play').click()
  await page.getByTestId('guide-accept').click()
  await page.locator('#ui [data-testid="guide-slip"] [data-testid="guide-noted"]').click()
  await page.getByTestId('begin-season').click()
  await expect(note(page, 'fields')).toBeVisible({ timeout: 15_000 })
}

// G (18): a key that touches the clock says what it does, and Got it puts the game back at the speed on the clock
// just before the note.
test('Got it says the speed it resumes at and resumes at that speed; the fast-forward key says it runs at 8x', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await firstGuidedDay(page)
  await expect(page.getByTestId('guide-held')).toHaveText('Paused')
  // The season opened at 1x, and the note says that is where it goes back to.
  await expect(note(page, 'fields').getByTestId('guide-resumes')).toHaveText('resumes at 1×')
  await note(page, 'fields').getByTestId('guide-noted').click()
  await expect(note(page, 'look')).toBeVisible()
  const ahead = note(page, 'look').getByTestId('guide-ahead')
  await expect(ahead).toContainText('Fast-forward to planting day')
  await expect(ahead).toContainText('runs at 8×')
  await ahead.click()
  await expect.poll(() => game<number>(page, 'app.speed')).toBe(3)
  // The next note pauses it, and its Got it goes back to the speed the clock showed: 8x, not the 1x of the morning.
  await expect(note(page, 'plantday')).toBeVisible({ timeout: 90_000 })
  expect(await game<number>(page, 'app.speed')).toBe(0)
  await expect(note(page, 'plantday').getByTestId('guide-resumes')).toHaveText('resumes at 8×')
  await page.waitForTimeout(500)
  // Read three frames after the press, before a day can pass and bring the next note.
  const after = await page.evaluate(() => new Promise<number>(resolve => {
    document.querySelector<HTMLElement>('#ui [data-testid="guide-slip"][data-lesson="plantday"] [data-testid="guide-noted"]')!.click()
    const app = (globalThis as unknown as Win).__county.app
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(app.speed))))
  }))
  expect(after, 'the speed after Got it').toBe(3)
  expect(errors, errors.join('\n')).toEqual([])
})

// H (8): a note's keys take a press from the frame the note is shown, and a double-click is one press.
test('a note\'s keys work from the first frame it is shown, and a double-click answers one note, not two', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await firstGuidedDay(page)
  await page.waitForTimeout(700)
  // A double-click on Got it: the note under the same spot stays.
  const got = (await note(page, 'fields').getByTestId('guide-noted').boundingBox())!
  await page.mouse.dblclick(got.x + got.width / 2, got.y + got.height / 2)
  await expect(note(page, 'look')).toBeVisible()
  await page.waitForTimeout(700)
  await expect(note(page, 'look')).toBeVisible()
  // The first note again (replayed), read with one press: on the frame the next note comes, the point at the middle
  // of its fast-forward key is that key.
  const firstFrame = await page.evaluate(() => new Promise<{ hit: boolean; x: number; y: number; dim: string }>(resolve => {
    ;(globalThis as unknown as Win).__countyGuide.replay('fields')
    const wait = () => {
      const got = document.querySelector<HTMLElement>('#ui [data-testid="guide-slip"][data-lesson="fields"]:not([hidden]) [data-testid="guide-noted"]')
      if (!got) { requestAnimationFrame(wait); return }
      got.click()
      const look = () => {
        const key = document.querySelector<HTMLElement>('#ui [data-testid="guide-slip"][data-lesson="look"]:not([hidden]) [data-testid="guide-ahead"]')
        if (!key) { requestAnimationFrame(look); return }
        const r = key.getBoundingClientRect()
        const x = r.left + r.width / 2, y = r.top + r.height / 2
        const at = document.elementFromPoint(x, y)
        resolve({ hit: !!at && key.contains(at), x, y, dim: getComputedStyle(key.closest('.guide-foot')!).pointerEvents })
      }
      requestAnimationFrame(look)
    }
    requestAnimationFrame(wait)
  }))
  expect(firstFrame.dim, 'the keys take presses').not.toBe('none')
  expect(firstFrame.hit, 'the key is under the pointer on its first frame').toBe(true)
  // And a press there, at once, runs the game fast.
  await page.mouse.click(firstFrame.x, firstFrame.y)
  await expect.poll(() => game<number>(page, 'app.speed')).toBe(3)
  expect(errors, errors.join('\n')).toEqual([])
})
