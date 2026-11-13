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
  // The note lying over the stamp or control it points at.
  overTarget: boolean
  // The guide's line while it runs the clock (not a note: nothing is paused for it): its words, the work it is
  // showing and who is doing it, whether that person's pin is inside the window, and the field whose stamp it waits on.
  drive: string; scene: string; unit: number; inView: boolean; waitField: number
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
    // The guide's line while it runs the clock is on the screen too: its words count.
    const drive = ui.querySelector<HTMLElement>('[data-testid="guide-drive"]')
    const driving = vis(drive) ? drive : null
    const text = `${read(screen)} | ${land} | ${slip && !slip.classList.contains('guide-card') ? read(slip) : ''}${driving ? ` | ${read(driving)}` : ''}`
    const unit = Number(driving?.dataset.unit ?? -1)
    // The one the guide is showing: the middle of their body as the land draws it, inside the window with nothing of
    // the interface over it but their own pin (the guide's line least of all).
    const body = unit >= 0 ? (globalThis as unknown as { __countyField: { unitAt(id: number): { x: number; y: number } | null } }).__countyField.unitAt(unit) : null
    const over = body && body.x >= 0 && body.y >= 0 && body.x <= innerWidth && body.y <= innerHeight ? document.elementFromPoint(body.x, body.y) : null
    const inView = !!over && (!over.closest('#ui') || !!over.closest('.pin-at'))
    const asking: string[] = []
    if (slip) asking.push('note')
    if (vis(ui.querySelector('[data-testid="guide-offer"]'))) asking.push('offer')
    if (vis(ui.querySelector('.season-screen .telegram'))) asking.push('telegram')
    if (ui.querySelector('.paper-layer > .dialog:not(.out)')) asking.push('paper')
    if ([...ui.querySelectorAll('.notes .alert')].some(vis)) asking.push('toast')
    if (vis(ui.querySelector('.press-pop'))) asking.push('pop')
    if (vis(ui.querySelector('.tray-paper'))) asking.push('tray')
    const sell = ui.querySelector<HTMLElement>('.paper-layer [data-testid^="lot-sell-"]')
    const aim = slip?.dataset.target ? ui.querySelector<HTMLElement>(`[data-testid="${slip.dataset.target}"]`) : null
    const sb = slip?.getBoundingClientRect(), ab = aim && vis(aim) ? aim.getBoundingClientRect() : null
    return {
      drive: driving ? read(driving) : '', scene: driving?.dataset.scene ?? '', unit, waitField: driving?.dataset.wait ? Number(driving.dataset.wait) : -1,
      inView,
      overTarget: !!sb && !!ab && !slip!.contains(aim) && sb.left < ab.right && sb.right > ab.left && sb.top < ab.bottom && sb.bottom > ab.top,
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
  expect(s.overTarget, `the note ${s.note} lies over what it points at (${s.target}) ${at}`).toBe(false)
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

  // What a year is, then Start the season. A new farm is the farmer alone, and the card says the work as it is.
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="frame"]')).toBeVisible()
  await expect(page.locator('#ui .gc-year li')).toHaveCount(5)
  await expect(page.locator('#ui .guide-card.frame')).toContainText('You and anyone you hire do the field work')
  await expect(page.locator('#ui .guide-card.frame')).not.toContainText('Your crew handles')
  const did: string[] = []
  let first = true
  const words: number[] = []
  let cardMost = 0
  let quiet = 0
  // The whole season at the first speed is ten minutes. The guide runs the clock itself: no speed key is pressed here,
  // and from Start the season to the first weigh ticket takes under four minutes.
  const until = Date.now() + 720_000
  let moved = { day: -1, at: Date.now() }
  let begun = 0
  let ticketAt = 0
  // For each kind of work the guide slows to show: how long the one doing it was inside the window, in ms.
  const watched: Record<string, number> = {}
  let last = { scene: '', at: 0 }
  const shot: Record<string, boolean> = {}
  const since: Record<string, number> = {}
  let shows = 0
  while (Date.now() < until) {
    let s = await see(page)
    check(s, did)
    if (s.sold > 0) break
    expect(s.phase === 'plan' || s.phase === 'season', `still in the first season (${s.phase})`).toBe(true)
    if (s.phase === 'season' && !begun) begun = Date.now()
    if (s.scene && s.unit >= 0) {
      const t = Date.now()
      if (last.scene === s.scene && s.inView) watched[s.scene] = (watched[s.scene] ?? 0) + (t - last.at)
      else watched[s.scene] ??= 0
      // A picture of each, half way through.
      since[s.scene] ??= t
      if (!(s.scene in shot) && t - since[s.scene] > 2200) { shot[s.scene] = true; await picture(page, `g4-scene-${s.scene}-${page.viewportSize()?.width}`) }
      last = { scene: s.inView ? s.scene : '', at: t }
    } else last = { scene: '', at: 0 }
    // The guide waits on a ringed stamp no note is asking for: the stamp is pressed, as its line says (a toast up
    // beside it asks nothing).
    if (!s.note && !s.asking.some(a => a !== 'toast') && s.waitField >= 0) {
      did.push(`wait-${s.waitField}`)
      await page.locator(`#ui [data-testid="badge-${s.waitField}"]`).first().click()
      await page.waitForTimeout(150)
      continue
    }
    if (s.day !== moved.day || s.asking.length) moved = { day: s.day, at: Date.now() }
    expect(Date.now() - moved.at, `the days stand with nothing asked, after ${did.join(' > ')} (day ${s.day}, speed ${s.speed}, the guide: ${s.drive})`).toBeLessThan(20_000)
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
        // Round eight (10): every note has a Got it (the year card's own key is Begin).
        if (s.note !== 'frame') expect(s.keys.some(k => k === 'guide-noted' || k === 'guide-pass'), `${s.note} has a Got it (${s.keys.join(' ')})`).toBe(true)
        // Round eight (1): the ask for the word comes on the day the crew asks, the game paused there by itself.
        if (s.note === 'word') expect(await page.evaluate(() => { const c = (globalThis as unknown as { __county: { app: any } }).__county.app.campaign; return [c.season.day - c.season.plantAsk, c.season.jobs.filter((j: any) => j.kind === 'plant').length] })).toEqual([0, 0])
        // The first day of a guided season the player is asked anything is the day the soil is ready: the land, the
        // date and the cash, the tags with their stamps, and one note.
        if (s.note === 'word' && first) {
          first = false
          console.log(`the first guided day: ${s.words} words on the screen; held back: ${s.hidden.join(', ')}; ${Date.now() - begun} ms after Start the season`)
          expect(s.words, s.text).toBeLessThanOrEqual(FIRST_DAY_WORDS)
          expect(s.hidden.sort()).toEqual(['after', 'forecast', 'list', 'people'])
          await expect(page.getByTestId('guide-held')).toBeVisible()
        }
        // No note carries a key to run the game fast: the guide runs the clock.
        expect(s.keys, `${s.note}: its keys`).not.toContain('guide-ahead')
      }
      // Only what the note asks: the stamp it says to click, its Got it, or the control it points at.
      const stamp = (s.note === 'stamp' || s.note === 'word' || s.note === 'kill') && s.target.startsWith('badge-')
      // A note that asks for a press says the game stays paused, and the press itself does not change the speed.
      if (stamp) await expect(page.locator('#ui [data-testid="guide-slip"] [data-testid="guide-resumes"]')).toHaveText('stays paused')
      const key = stamp ? '' : s.keys.includes('guide-noted') ? 'guide-noted' : ''
      // "Something is covering it. Show me": pressed as the note says, and the stamp is looked for again.
      if (stamp && s.keys.includes('guide-show') && shows++ < 6) { await page.locator('#ui [data-testid="guide-slip"] [data-testid="guide-show"]').first().click(); await page.waitForTimeout(900); continue }
      if (key) await page.locator(`#ui [data-testid="guide-slip"] [data-testid="${key}"]`).first().click()
      else await page.locator(`#ui [data-testid="${s.target}"]`).first().click()
      await page.waitForTimeout(120)
      if (stamp) expect((await see(page)).speed, `the speed after a press on the stamp of ${s.note}`).toBe(0)
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
    if (s.ticketSell) { quiet = 0; ticketAt ||= Date.now(); did.push('ticket'); console.log(`the weigh ticket: ${s.paperWords} words`); await page.locator(`#ui [data-testid="${s.ticketSell}"]`).click(); await page.waitForTimeout(300); continue }
    if (s.asking.includes('tray')) { await page.getByTestId('sample-close').click().catch(() => {}); continue }
    // Nothing asks: the days run by themselves. A clock stopped with nothing said would be a fault.
    if (s.speed === 0 && !s.asking.length) expect(++quiet, `the clock stands with nothing on the screen saying why (${s.stopped}), after ${did.join(' > ')}`).toBeLessThan(40)
    else quiet = 0
    await page.waitForTimeout(250)
  }
  console.log(`followed: ${did.join(' > ')}`)
  console.log(`words on the screen at each note: ${words.join(' ')}; the most with a telegram up: ${cardMost}`)
  expect((await see(page)).sold, `a crop sold, after ${did.join(' > ')}`).toBeGreaterThan(0)
  // The opening: what the game is, Start the season, and then the word to plant, with no note between: the tutorial
  // starts when planting is ready. Then planting day and the year.
  expect(did.slice(0, 4)).toEqual(['frame', 'begin', 'word', 'plantday'])
  for (const id of ['tend', 'dig', 'ticket']) expect(did).toContain(id)
  expect(new Set(did).size, 'about a dozen notes').toBeLessThanOrEqual(17)
  // The guide ran the clock: from Start the season to the first weigh ticket in under four minutes, no speed key pressed.
  console.log(`Start the season to the first weigh ticket: ${Math.round((ticketAt - begun) / 1000)} s; watched (ms in the window): ${JSON.stringify(watched)}`)
  expect(ticketAt - begun, 'from Start the season to the first weigh ticket').toBeLessThan(240_000)
  // Where watching explains the thing the guide slowed and framed it: whoever was planting, spraying and digging was
  // inside the window for two seconds or more.
  for (const id of ['plant', 'dig']) expect(Object.keys(watched), `the guide showed the ${id}`).toContain(id)
  for (const id of ['plant', 'spray', 'dig']) if (id in watched) expect(watched[id], `the one at the ${id} was in the window`).toBeGreaterThanOrEqual(2000)
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
  // The guide carries the player to the day the soil is ready; its first note of the season is the word to plant.
  await expect(note).toHaveAttribute('data-lesson', 'word', { timeout: 15_000 })
  await expect(page.getByTestId('guide-held')).toBeVisible()
  expect((await see(page)).speed).toBe(0)
  const day = (await see(page)).day
  await page.waitForTimeout(600)
  await page.keyboard.press('Space')
  // The note is put away and the days run: the press on the clock is the player's, and so is the clock from here.
  await expect(note).toHaveCount(0)
  await expect.poll(async () => (await see(page)).speed).toBeGreaterThan(0)
  await expect(page.getByTestId('guide-drive')).toHaveCount(0)
  expect(await page.evaluate(() => { const w = globalThis as unknown as { __county: { app: any }; __countyGuide: any }; return w.__countyGuide.drives(w.__county.app.campaign) })).toBe(false)
  // No word was given, so the crew starts on its own three days on, and the note that says so holds the days again.
  await expect(note).toHaveAttribute('data-lesson', 'plantday', { timeout: 90_000 })
  await expect.poll(async () => (await see(page)).speed).toBe(0)
  expect((await see(page)).day).toBeGreaterThan(day)
  await page.waitForTimeout(600)
  // Space again: the note goes and the days run.
  await page.keyboard.press('Space')
  await expect.poll(async () => (await see(page)).speed).toBeGreaterThan(0)
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="plantday"]:not([hidden])')).toHaveCount(0)
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
  // The guide's line while it carries the player through the weeks before planting, then its first note of the season.
  await expect(page.getByTestId('guide-drive')).toBeVisible({ timeout: 5000 })
  await scan('the guide running the clock')
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="word"]')).toBeVisible({ timeout: 15_000 })
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
    // What the note lies over: the strip of folds, or the control it points at.
    const nb = slipNote?.getBoundingClientRect()
    const hits = (e: Element | null | undefined) => { if (!nb || !vis(e)) return false; const r = e.getBoundingClientRect(); return nb.left < r.right && nb.right > r.left && nb.top < r.bottom && nb.bottom > r.top }
    const aim = slipNote?.dataset.target ? ui.querySelector(`[data-testid="${slipNote.dataset.target}"]`) : null
    const strip = [...ui.querySelectorAll('.catalogue .fold.more.strip')].filter(vis)
    return {
      over: strip.some(hits) ? 'the strip of folds' : hits(aim) ? `its target ${slipNote!.dataset.target}` : '', strip: strip.length,
      phase: app.campaign.phase as string, note: slipNote?.dataset.lesson ?? '', target: slipNote?.dataset.target ?? '', said: slipNote?.querySelector('.guide-ask')?.textContent ?? '',
      got: !!slipNote?.querySelector('[data-testid="guide-noted"]'), pass: !!slipNote?.querySelector('[data-testid="guide-pass"]'), slip: vis(goal) ? (goal.querySelector('.goal-t')?.textContent ?? 'slip') : '', ring: ring ? ring.textContent ?? 'ring' : '',
      paper: !!ui.querySelector('.paper-layer > .dialog:not(.out)'),
    }
  })
  const two: string[] = []
  const noGot: string[] = []
  const covers: string[] = []
  const notes: string[] = []
  let strips = 0
  let pictured = false
  let idle = 0
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
    // No step while a fold the last step opened is still open: read, it is closed, as a player moving on would.
    if (!v.note) { const open = page.locator('#ui .catalogue .fold.open'); if (++idle >= 2 && await open.count()) { await open.first().click(); idle = 0 } continue }
    idle = 0
    if (notes[notes.length - 1] !== v.note) notes.push(v.note)
    // Round eight (10): every note has a Got it, whether it is read or points at a control.
    if (!v.got && !v.pass) noGot.push(v.note)
    if (v.over) covers.push(`the note ${v.note} lies over ${v.over}`)
    if (v.strip) { if (!strips) await picture(page, 'b-spring-strip-1280'); strips++ }
    if (!pictured && v.note === 'seed') { pictured = true; await picture(page, 'b-spring-note-1280') }
    // Round seven (9): with the field's record open the walk waits on that field. Nothing else comes for ten seconds
    // (longer than any timer the walk ever had), and it goes on when the record is closed.
    if (v.note === 'crop') {
      await expect(page.getByTestId('plan-card')).toBeVisible()
      for (let k = 0; k < 20; k++) {
        await page.waitForTimeout(500)
        expect((await voices()).note, `the step ${k / 2}s after the field's record opened`).toBe('crop')
      }
      await page.locator('#ui [data-testid="plan-card"] button.close').first().click()
      await expect(page.getByTestId('plan-card')).toBeHidden()
      continue
    }
    // Round eight (10): with Land open the agent has a note for it, and keeps it for as long as the fold is open.
    if (v.note === 'lots') {
      await expect(page.locator('#ui .catalogue [data-testid="land"]').first()).toBeVisible()
      for (let k = 0; k < 8; k++) {
        await page.waitForTimeout(500)
        expect((await voices()).note, `the step ${k / 2}s after Land opened`).toBe('lots')
      }
      await expect(note(page, 'lots')).toContainText('More land is a choice')
    }
    // The walk's closing line.
    if (v.note === 'begin2') await expect(note(page, 'begin2')).toContainText('That\'s the plan. Click Start the season when you\'re ready.')
    if (v.note === 'hire') await expect(note(page, 'hire')).toContainText('you can farm alone for another year')
    // What the note asks: its Got it, or the control it points at.
    if (v.got) await page.locator('#ui [data-testid="guide-slip"]:not([hidden]) [data-testid="guide-noted"]').first().click()
    else await page.locator(`#ui [data-testid="${v.target}"]`).first().click()
    await page.waitForTimeout(200)
  }
  console.log(`the second spring's notes: ${notes.join(' > ')}`)
  expect([...new Set(two)], 'two voices at once').toEqual([])
  expect([...new Set(covers)], 'a note over the strip of folds or over what it points at').toEqual([])
  expect(strips, 'notes seen with the strip of folds showing').toBeGreaterThan(0)
  expect(notes).toEqual(['seed', 'crop', 'people', 'hire', 'land', 'lots', 'loan', 'begin2'])
  expect(noGot, 'notes with no Got it').toEqual([])
  // The season: its first note, the slip down; read, and the slip is the one voice.
  await expect(note(page, 'calls2')).toBeVisible({ timeout: 15_000 })
  expect((await voices()).slip).toBe('')
  await note(page, 'calls2').getByTestId('guide-noted').click()
  await expect.poll(async () => (await voices()).slip, { timeout: 10_000 }).not.toBe('')
  // Round eight (10): the agent said hiring is a choice, so the slip does not ask for a hand (one person can farm
  // this plan).
  await expect(page.getByTestId('goal')).not.toContainText(/hire a hand/i)
  await picture(page, 'b-season-slip-1280')
  expect(errors, errors.join('\n')).toEqual([])
})

// Round seven (7): a foreman is not offered to a farm with one hand, by the slip, the ring or the tutorial.
test('a farm with one hired hand is never asked to name a foreman, and the key says what it costs in work as well as pay', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk, at the players\' size')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await secondSpring(page, null, `app.do({ t: 'hire', kind: 'hand' }); c.cash = 400`)
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('date')).toBeVisible()
  const hand = await game<number>(page, 'c.crew.find(u => u.kind !== "farmer").id')
  // With the tutorial on and every step before it behind the player: still no foreman step.
  await page.evaluate(() => { const w = globalThis as unknown as Win; w.__countyGuide.skipTo('foreman'); w.__county.app.setSpeed(3) })
  const until = Date.now() + 12_000
  while (Date.now() < until) {
    expect(await page.getByTestId('goal').textContent(), 'the goal slip').not.toMatch(/foreman/i)
    await expect(note(page, 'foreman')).toHaveCount(0)
    expect(await page.locator('#ui .person.goal-ring').count(), 'a person ringed for the foreman goal').toBe(0)
    await page.waitForTimeout(500)
  }
  // The key is still on the hand's card for a player who wants one, and says both costs.
  await page.evaluate(() => { const w = globalThis as unknown as Win; w.__countyGuide.stop(); w.__county.app.setSpeed(0) })
  await page.getByTestId(`unit-${hand}`).click()
  await expect(page.getByTestId('person-card')).toBeVisible()
  await expect(page.getByTestId('person-foreman')).toContainText('+40% pay, no field work')
  await expect(page.locator('#ui [data-testid="person-foreman"].goal-ring')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

// C (13), and round seven (7): what a foreman is and why it pays, where the key is, and what naming one did.
test('naming a foreman: the slip says what one is, the key comes into view lit, and the card and a note answer at once', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk, at the players\' size')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  // Two hands hired, a field rented away from home, and too little in hand to build or buy: the next goal is the foreman.
  await secondSpring(page, null, `app.do({ t: 'rent', field: 6 }); c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'hire', kind: 'hand' }); c.cash = 400`)
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('date')).toBeVisible()
  const hand = await game<number>(page, 'c.crew.find(u => u.kind !== "farmer").id')
  const first = await game<string>(page, 'c.crew.find(u => u.kind !== "farmer").name.split(" ")[0]')
  // The slip names the goal and says what it is.
  await expect(page.getByTestId('goal')).toContainText('name a foreman')
  await expect(page.getByTestId('goal')).toContainText('a hand who runs your fields away from home')
  await picture(page, 'c-slip-1280')
  // The tutorial's own note for it (turned on here): what a foreman is, and a Show me to the key.
  await page.evaluate(() => { const g = (globalThis as unknown as Win).__countyGuide; g.skipTo('foreman') })
  await expect(note(page, 'foreman')).toBeVisible({ timeout: 10_000 })
  await expect(note(page, 'foreman')).toContainText('A foreman orders the work on your fields away from home each morning, so nothing out there waits for you.')
  await expect(note(page, 'foreman')).not.toContainText(/block/i)
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
  await expect(page.getByTestId('person-foreman')).toContainText('+40% pay, no field work')
  await picture(page, 'c-key-1280')
  // Pressed: what it will do, and the block to pick, in view.
  await page.getByTestId('person-foreman').click()
  await expect(page.getByTestId('foreman-what')).toContainText('A foreman orders the work on one group of fields for you each morning, which pays once you farm fields away from home')
  await expect(page.getByTestId('foreman-what')).not.toContainText(/block/i)
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
// A farm without the tutorial, stopped on the evening the crew first stands ready to plant.
async function soilReady(page: Page): Promise<{ fit: number[]; potato: number[] }> {
  await open(page)
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.refuse(); const { app } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); app.setSpeed(0)`)
  await putAway(page)
  for (let day = 0; day < 90; day++) {
    const asked = await page.evaluate(() => {
      const { app } = (globalThis as unknown as Win).__county
      const c = app.campaign
      if (c.season.plantAsk !== undefined) return true
      c.incidents = []
      app.do({ t: 'day' })
      app.setSpeed(0)
      return c.season.plantAsk !== undefined
    })
    if (asked) break
    expect(await game<number>(page, `c.season.jobs.filter(j => j.kind === 'plant').length`), `planting on the list on day ${day}, before the crew asked`).toBe(0)
  }
  await page.waitForTimeout(400)
  return {
    fit: await game<number[]>(page, `app.needs().map((n, i) => n.need && n.need.act === 'plant' ? i : -1).filter(i => i >= 0)`),
    potato: await game<number[]>(page, `c.plans.map((p, i) => p && p.crop === 'potato' && c.fields[i].tenure !== 'none' ? i : -1).filter(i => i >= 0)`),
  }
}
// A day passed by the test, the game left paused.
const aDay = (page: Page) => page.evaluate(() => { const { app } = (globalThis as unknown as Win).__county; app.campaign.incidents = []; app.do({ t: 'day' }); app.setSpeed(0) })

// Round seven (1): the year's first planting waits for the player's word.
test('the crew stands ready and says so; one press on a Plant stamp starts planting and the crew plants the rest, with a note that says so', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  const { fit, potato } = await soilReady(page)
  expect(fit.length, 'fields fit to plant').toBeGreaterThan(0)
  // Said where the player looks: a toast, the goal slip, and a ringed Plant stamp on each field that is fit.
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'The soil is ready. Press a ringed Plant stamp to give the word' })).toBeVisible()
  await expect(page.getByTestId('goal')).toContainText('Give the word to plant')
  for (const i of fit) await expect(page.locator(`#ui [data-testid="badge-${i}"]`), `the Plant stamp on field ${i}`).toBeVisible()
  await expect(page.locator('#ui .plate-layer .need.is-next')).toHaveCount(1)
  // Nothing starts without the word: two more days, and still no planting on the list.
  for (let k = 0; k < 2; k++) { await aDay(page); expect(await game<number>(page, `c.season.jobs.filter(j => j.kind === 'plant').length + c.season.fields.filter(f => f.plantDay >= 0).length`)).toBe(0) }
  await picture(page, 'r7-ready-1280')
  // One press. The speed is not changed by it.
  const first = (await game<number[]>(page, `app.needs().map((n, i) => n.need && n.need.act === 'plant' ? i : -1).filter(i => i >= 0)`))[0]
  await page.locator(`#ui [data-testid="badge-${first}"]`).click()
  expect(await game<number>(page, 'app.speed')).toBe(0)
  await expect(page.locator('#ui .notes .alert').filter({ hasText: `You gave the word. Your crew will plant the other ${potato.length - 1} fields too.` })).toBeVisible()
  expect(await game<[number, string][]>(page, `c.season.jobs.filter(j => j.kind === 'plant').map(j => [j.field, j.by])`)).toEqual([[first, 'you']])
  await picture(page, 'r7-word-toast-1280')
  // The rest follows with no other order from the player.
  for (let day = 0; day < 30 && (await game<number>(page, `c.season.fields.filter(f => f.plantDay >= 0).length`)) < potato.length; day++) await aDay(page)
  expect(await game<number[]>(page, `c.season.fields.map((f, i) => f.plantDay >= 0 ? i : -1).filter(i => i >= 0)`)).toEqual(potato)
  expect(await game<string>(page, 'c.season.plantWordBy')).toBe('you')
  expect(errors, errors.join('\n')).toEqual([])
})

test('with no word in three days the crew starts planting by itself and says so, and the note leads to the field', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await soilReady(page)
  const asked = await game<number>(page, 'c.season.plantAsk')
  let started = -1
  for (let day = 0; day < 6 && started < 0; day++) {
    await aDay(page)
    if (await game<boolean>(page, 'c.season.plantWord !== undefined')) started = await game<number>(page, 'c.season.plantWord')
    else expect(await game<number>(page, `c.season.jobs.filter(j => j.kind === 'plant').length`)).toBe(0)
  }
  expect(started - asked, 'days from the ask to the crew\'s own start').toBeGreaterThanOrEqual(3)
  expect(started - asked).toBeLessThanOrEqual(4)
  expect(await game<string>(page, 'c.season.plantWordBy')).toBe('crew')
  const toast = page.locator('#ui .notes .alert').filter({ hasText: 'You gave no word in 3 days, so your crew has started planting on its own.' })
  await expect(toast).toBeVisible()
  const field = await game<number>(page, `c.season.log.find(e => e.type === 'plantWord').field`)
  await toast.first().click()
  await expect.poll(() => game<number[]>(page, 'app.selection')).toEqual([field])
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
      // (the clock is the test's here, as a player's who took it from the guide: what a frost does to the speed is read)
      if (guided) { w.__countyGuide.skipTo('bills'); w.__countyGuide.takeClock() } else w.__countyGuide.refuse()
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

// The guided first day the player is asked anything, as a player reaches it: the guide has run the weeks before
// planting, and its first note of the season (the word to plant) is up.
async function firstGuidedDay(page: Page): Promise<void> {
  await fresh(page)
  await page.getByTestId('play').click()
  await page.getByTestId('guide-accept').click()
  await page.locator('#ui [data-testid="guide-slip"] [data-testid="guide-noted"]').click()
  await page.getByTestId('begin-season').click()
  await expect(note(page, 'word')).toBeVisible({ timeout: 15_000 })
}

// G (18): a key that touches the clock says what it does. (The owner, after round eight: the guide runs the clock
// itself, so no note carries a fast-forward key. Got it on a note that only tells says time runs on, and the guide
// sets the days going; with the clock the player's it says the speed it resumes at, and resumes at that speed.)
test('Got it says what it does to the clock: time runs on under the guide, and the speed it resumes at once the clock is the player\'s', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await firstGuidedDay(page)
  await expect(page.getByTestId('guide-held')).toHaveText('Paused')
  // Round seven (8): a note that asks for a press on the land says the game stays paused, and Got it leaves it so.
  expect(await game<number>(page, 'app.speed')).toBe(0)
  await expect(note(page, 'word').getByTestId('guide-resumes')).toHaveText('stays paused')
  await expect(page.getByTestId('guide-ahead')).toHaveCount(0)
  await page.waitForTimeout(500)
  await note(page, 'word').getByTestId('guide-noted').click()
  await expect(note(page, 'word')).toHaveCount(0)
  // The guide does not run on past the word: it waits, says what for, and offers to go on without it.
  const line = page.getByTestId('guide-drive-line')
  await expect(line).toHaveText('Planting waits for your word. Click a ringed Plant stamp.')
  await page.waitForTimeout(2500)
  expect(await game<[number, number]>(page, `[app.speed, c.season.jobs.filter(j => j.kind === 'plant').length]`)).toEqual([0, 0])
  // Sent on without it: the days run, the crew starts in three days, and the note that tells it pauses the game.
  await page.getByTestId('guide-wave').click()
  await expect.poll(() => game<number>(page, 'app.speed')).toBe(3)
  await expect(note(page, 'plantday')).toBeVisible({ timeout: 90_000 })
  await expect(note(page, 'plantday')).toContainText('You gave no word, so your crew started planting on its own.')
  expect(await game<number>(page, 'app.speed')).toBe(0)
  await expect(note(page, 'plantday').getByTestId('guide-resumes')).toHaveText('time runs on')
  await page.waitForTimeout(500)
  await note(page, 'plantday').getByTestId('guide-noted').click()
  await expect.poll(() => game<number>(page, 'app.speed'), { timeout: 5000 }).toBeGreaterThan(0)
  await expect(page.getByTestId('guide-drive')).toBeVisible()
  // The player takes the clock by setting a speed: the next note says the speed it resumes at, offers the clock
  // back, and Got it resumes at that speed within three frames.
  await page.getByTestId('speed-3').click()
  await expect(page.getByTestId('guide-drive')).toHaveCount(0)
  await expect(note(page, 'tend')).toBeVisible({ timeout: 90_000 })
  expect(await game<number>(page, 'app.speed')).toBe(0)
  await expect(note(page, 'tend').getByTestId('guide-resumes')).toHaveText('resumes at 8×')
  await expect(note(page, 'tend').getByTestId('guide-give')).toHaveText('Run the clock for me')
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => new Promise<number>(resolve => {
    document.querySelector<HTMLElement>('#ui [data-testid="guide-slip"][data-lesson="tend"] [data-testid="guide-noted"]')!.click()
    const app = (globalThis as unknown as Win).__county.app
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(app.speed))))
  }))
  expect(after, 'the speed after Got it').toBe(3)
  expect(errors, errors.join('\n')).toEqual([])
})

// A first-year farm with every potato field planted (the word given by the test), the game paused.
const PLANTED = `const { app } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); const c = app.campaign
  for (let n = 0; n < 120 && c.season.fields.some((f, i) => c.plans[i].crop === 'potato' && c.fields[i].tenure !== 'none' && f.plantDay < 0); n++) {
    c.incidents = []; const at = app.needs().findIndex(x => x.need && x.need.act === 'plant'); if (at >= 0) app.do({ t: 'job', kind: 'plant', field: at }); app.do({ t: 'day' }) }
  c.incidents = []; app.setSpeed(0)`

// H (8): a note's keys take a press from the frame the note is shown, and a double-click is one press.
// (The opening has no tip between Start the season and the word, so the two notes that follow one another at once are
// made here: planting day's note, then the summer's, on a farm already planted.)
test('a note\'s keys work from the first frame it is shown, and a double-click answers one note, not two', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await open(page)
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.skipTo('plantday'); ${PLANTED}; app.setSpeed(1)`)
  await expect(note(page, 'plantday')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(700)
  // A double-click on Got it: the note under the same spot stays.
  const got = (await note(page, 'plantday').getByTestId('guide-noted').boundingBox())!
  await page.mouse.dblclick(got.x + got.width / 2, got.y + got.height / 2)
  await expect(note(page, 'tend')).toBeVisible()
  await page.waitForTimeout(700)
  await expect(note(page, 'tend')).toBeVisible()
  // Planting day's note again (replayed: it takes the summer's place, which waits on it): on the frame it comes, the
  // point at the middle of its Got it is that key.
  const firstFrame = await page.evaluate(() => new Promise<{ hit: boolean; x: number; y: number; dim: string; key: string }>(resolve => {
    ;(globalThis as unknown as Win).__countyGuide.replay('plantday')
    const look = () => {
      const slip = document.querySelector<HTMLElement>('#ui [data-testid="guide-slip"][data-lesson="plantday"]:not([hidden])')
      const key = slip?.querySelector<HTMLElement>('[data-testid="guide-noted"]')
      if (!key) { requestAnimationFrame(look); return }
      const r = key.getBoundingClientRect()
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      const at = document.elementFromPoint(x, y)
      resolve({ hit: !!at && key.contains(at), x, y, dim: getComputedStyle(key.closest('.guide-foot')!).pointerEvents, key: key.dataset.testid ?? '' })
    }
    requestAnimationFrame(look)
  }))
  expect(firstFrame.dim, 'the keys take presses').not.toBe('none')
  expect(firstFrame.hit, 'the key is under the pointer on its first frame').toBe(true)
  // And a press there, at once, is taken: the note goes and the summer's comes back; put away, the guide sets the
  // days going.
  await page.mouse.click(firstFrame.x, firstFrame.y)
  await expect(note(page, 'plantday')).toHaveCount(0)
  await expect(note(page, 'tend')).toBeVisible()
  await page.waitForTimeout(600)
  await note(page, 'tend').getByTestId('guide-noted').click()
  await expect.poll(() => game<number>(page, 'app.speed'), { timeout: 5000 }).toBeGreaterThan(0)
  expect(errors, errors.join('\n')).toEqual([])
})

// ---------------------------------------------------------------- round seven (docs/quality/players/round-7.md)

// The guided first year at the players' size, carried by the guide to the morning the soil is ready.
async function toTheWord(page: Page): Promise<number> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await firstGuidedDay(page)
  await page.waitForTimeout(700)
  return Number(((await note(page, 'word').getAttribute('data-target')) ?? '').replace('badge-', ''))
}

// (1): in the guided year the planting note is the ask for the press, and the press is the first thing done on the land.
test('the guided year asks for the word to plant, and the press starts planting with a note that says what follows', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk, at the players\' size')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  const field = await toTheWord(page)
  const name = await page.evaluate(i => (globalThis as unknown as Win).__county.sim.FIELD_NAMES[i], field)
  await expect(note(page, 'word')).toContainText(`The soil is ready, and planting waits for your word. Click the ringed Plant stamp on ${name}.`)
  await expect(note(page, 'word')).toContainText('Your crew then plants the other 3 fields on its own.')
  await expect(page.getByTestId('guide-held')).toHaveText('Paused')
  // The stamp it names is on the screen, ringed, and nothing lies over it: not the note, not the pointing hand.
  const stamp = page.locator(`#ui [data-testid="badge-${field}"]`)
  await expect(stamp).toBeVisible()
  expect(await reachable(page, `badge-${field}`)).toBe('in view')
  expect((await see(page)).overTarget).toBe(false)
  expect(await game<number>(page, `c.season.jobs.filter(j => j.kind === 'plant').length`)).toBe(0)
  await picture(page, 'r7-ask-1280')
  await stamp.click()
  // The press: planting on the list there, the speed unchanged, and the note that says what the crew does next.
  await expect(note(page, 'plantday')).toBeVisible()
  await expect(note(page, 'plantday')).toContainText('You gave the word. Your crew will plant the other 3 fields too.')
  expect(await game<number>(page, 'app.speed')).toBe(0)
  expect(await game<[number, string][]>(page, `c.season.jobs.filter(j => j.kind === 'plant').map(j => [j.field, j.by])`)).toEqual([[field, 'you']])
  // The guide runs the clock: Got it on a note that only tells says time runs on.
  await expect(note(page, 'plantday').getByTestId('guide-resumes')).toHaveText('time runs on')
  await page.waitForTimeout(700)
  // Round eight (2): the sentence is told once. The answer beside the pointer does not repeat what the note says.
  await expect(page.getByTestId('answer-tip')).toBeHidden()
  expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#ui *')].filter(e => !e.closest('.sr') && [...e.childNodes].some(n => n.nodeType === 3 && /You gave the word/.test(n.nodeValue ?? ''))
    && e.checkVisibility({ opacityProperty: true, visibilityProperty: true } as CheckVisibilityOptions)).length), 'places that say "You gave the word"').toBe(1)
  await picture(page, 'r7-after-press-1280')
  expect(errors, errors.join('\n')).toEqual([])
})

// (9): a stamp half under a card is not one the player can be sent to: the note says a card is in the way.
test('a note never points at a stamp that something half covers: it says a card is in the way', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  const field = await toTheWord(page)
  await expect(page.getByTestId('guide-under')).toHaveCount(0)
  // A card laid over the lower half of the stamp, as a person's card was in the players' pictures.
  await page.evaluate(i => {
    const r = document.querySelector<HTMLElement>(`#ui [data-testid="badge-${i}"]`)!.getBoundingClientRect()
    const card = document.createElement('section')
    card.className = 'sheet person-card sys'
    card.dataset.testid = 'a-card-over'
    card.style.cssText = `position:fixed; z-index:60; left:${r.left - 40}px; top:${r.top + r.height / 2}px; width:260px; height:160px; margin:0; max-height:none; bottom:auto; transform:none; pointer-events:auto;`
    const close = document.createElement('button')
    close.className = 'close'
    close.type = 'button'
    close.textContent = 'x'
    close.style.cssText = 'position:absolute; right:8px; top:8px; width:32px; height:32px;'
    close.onclick = () => card.remove()
    card.append(close)
    document.getElementById('ui')!.append(card)
  }, field)
  await expect(page.getByTestId('guide-under')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('guide-under')).toContainText('A card is in the way')
  // Closed, the note points at the stamp again.
  await page.locator('#ui [data-testid="a-card-over"] button.close').click()
  await expect(page.getByTestId('guide-under')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

// A guided first year with spraying left to the player, run by the test to the first spray stamps, the game at 8x.
// clock: whose the clock is between notes there.
const TO_STAMPS = (clock: 'guide' | 'player') => `const guide = window.__countyGuide; guide.reset(); guide.skipTo('stamp'); ${clock === 'player' ? 'guide.takeClock();' : ''} const { app } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'ask' })
    const c = app.campaign
    for (let n = 0; n < 200 && !app.needs().some(x => x.need && x.need.act === 'spray'); n++) { c.incidents = []; app.do({ t: 'day' }) }
    c.incidents = []; app.setSpeed(3)`

// (8): the press the note asks for never changes the speed, with the note up or after it. With the clock the
// player's, the game then stays paused until they resume.
test('a press on a stamp never changes the speed: with the clock the player\'s, the game stays paused until the player resumes', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await open(page)
  await reach(page, TO_STAMPS('player'))
  await expect(note(page, 'stamp')).toBeVisible({ timeout: 15_000 })
  await expect(note(page, 'stamp').getByTestId('guide-resumes')).toHaveText('stays paused')
  expect(await game<number>(page, 'app.speed')).toBe(0)
  // Each stamp the note names is pressed, as it asks, until it has no more to ask.
  for (let k = 0; k < 8 && await note(page, 'stamp').count(); k++) {
    const target = (await note(page, 'stamp').getAttribute('data-target')) ?? ''
    if (!target.startsWith('badge-')) break
    await page.locator(`#ui [data-testid="${target}"]`).first().click()
    await page.waitForTimeout(500)
    expect(await game<number>(page, 'app.speed'), `the speed after pressing ${target}`).toBe(0)
  }
  await expect(note(page, 'stamp')).toHaveCount(0)
  await page.waitForTimeout(1500)
  expect(await game<[number, string]>(page, '[app.speed, app.pauseReason]')).toEqual([0, ''])
  expect(await game<number>(page, `c.season.jobs.filter(j => j.kind === 'spray').length`)).toBeGreaterThan(0)
  // The way on is the player's, at the speed the game had.
  await expect(page.getByTestId('paused-go')).toContainText('Resume at 8×')
  await page.keyboard.press('Space')
  await expect.poll(() => game<number>(page, 'app.speed')).toBe(3)
  expect(errors, errors.join('\n')).toEqual([])
})

// The same with the guide running the clock: the press itself still changes nothing, and a moment after the last
// stamp the note asked for is pressed the guide sets the days going again, saying what is passing.
test('with the guide running the clock, a press on a stamp does not change the speed, and the guide runs on a moment after the last one', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await open(page)
  await reach(page, TO_STAMPS('guide'))
  await expect(note(page, 'stamp')).toBeVisible({ timeout: 15_000 })
  await expect(note(page, 'stamp').getByTestId('guide-resumes')).toHaveText('stays paused')
  expect(await game<number>(page, 'app.speed')).toBe(0)
  // Three frames after each press the speed is what it was: paused.
  for (let k = 0; k < 8 && await note(page, 'stamp').count(); k++) {
    const target = (await note(page, 'stamp').getAttribute('data-target')) ?? ''
    if (!target.startsWith('badge-')) break
    const speed = await page.evaluate(id => new Promise<number>(resolve => {
      document.querySelector<HTMLElement>(`#ui [data-testid="${id}"]`)!.click()
      const app = (globalThis as unknown as Win).__county.app
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(app.speed))))
    }), target)
    expect(speed, `the speed three frames after pressing ${target}`).toBe(0)
    await page.waitForTimeout(350)
  }
  // Every stamp the year was waiting on is pressed (the guide names any the note did not), and then it runs on.
  for (let k = 0; k < 8; k++) {
    const wait = await page.evaluate(() => document.querySelector<HTMLElement>('#ui [data-testid="guide-drive"]')?.dataset.wait ?? '')
    if (!wait) break
    await page.locator(`#ui [data-testid="badge-${wait}"]`).first().click()
    await page.waitForTimeout(400)
  }
  await expect(note(page, 'stamp')).toHaveCount(0)
  await expect.poll(() => game<number>(page, 'app.speed'), { timeout: 6000 }).toBeGreaterThan(0)
  await expect(page.getByTestId('guide-drive')).toBeVisible()
  await expect(page.getByTestId('guide-wave')).toHaveCount(0)
  expect(await game<number>(page, `c.season.jobs.filter(j => j.kind === 'spray').length + c.season.fields.reduce((t, f) => t + (f.sprays ?? 0), 0)`)).toBeGreaterThan(0)
  expect(errors, errors.join('\n')).toEqual([])
})

// (20): the first spring sheet says what a usual first year looks like without the fright.
test('the first spring sheet says a usual first year and that the loan carries it', async ({ page }) => {
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()
  await page.getByTestId('guide-refuse').click()
  const line = page.getByTestId('plan-usual')
  await expect(line).toBeVisible()
  await expect(line).toHaveText('The loan covers usual first-year losses: $4,000 to $24,000.')
  expect(errors, errors.join('\n')).toEqual([])
})

// ---------------------------------------------------------------- round eight (docs/quality/players/round-8.md)

// (1): a decision that waits for the player pauses the game. Whatever ran the days (a speed key, "Skip ahead", a
// "Fast-forward to ..." key), the game is paused the day the crew asks for the word, with the stamps in view and
// nothing planted, and says why in the pause's own words. Telegrams on the way are answered with their defaults.
async function atTheAsk(page: Page, what: string, shot = ''): Promise<number[]> {
  await expect.poll(() => game<string>(page, `(() => { for (const i of [...c.incidents]) app.do({ t: 'answer', incident: i.id, choice: sim.defaultChoice(i) }); return app.speed === 0 ? app.pauseCause : '' })()`),
    { timeout: 150_000, intervals: [250], message: `${what}: the game pauses for the word` }).toBe('plantAsk')
  const at = await game<{ day: number; ask: number; jobs: number; planted: number; fit: number[] }>(page, `({ day: c.season.day, ask: c.season.plantAsk, jobs: c.season.jobs.filter(j => j.kind === 'plant').length,
    planted: c.season.fields.filter(f => f.plantDay >= 0).length, fit: app.needs().map((n, i) => n.need && n.need.act === 'plant' ? i : -1).filter(i => i >= 0) })`)
  expect(at.day, `${what}: paused on the day the crew asks`).toBe(at.ask)
  expect([at.jobs, at.planted], `${what}: planting has not started`).toEqual([0, 0])
  expect(at.fit.length, `${what}: fields fit to plant`).toBeGreaterThan(0)
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'Paused: the soil is ready. Press a ringed Plant stamp, or resume and your crew starts in 3 days.' }), what).toBeVisible()
  if (shot) { await page.waitForTimeout(2500); await picture(page, shot) }
  await expect.poll(async () => {
    const out: string[] = []
    for (const i of at.fit) { const r = await reachable(page, `badge-${i}`); if (r !== 'in view') out.push(`badge-${i} ${r}`) }
    // The fields themselves are on the screen: a tag waiting at the window's edge stands for land out of view.
    const edge = await page.evaluate(fit => fit.filter(i => { const r = document.querySelector(`#ui [data-testid="field-${i}"]`)?.getBoundingClientRect(); return !r || r.left < 40 || r.right > innerWidth - 40 }), at.fit)
    for (const i of edge) out.push(`field-${i} at the edge`)
    return out
  }, { timeout: 10_000, message: `${what}: the Plant stamps are in view, on fields that are on the screen` }).toEqual([])
  await expect(page.getByTestId('goal')).toContainText('Give the word to plant')
  return at.fit
}

test('the game pauses itself the day the crew asks for the word: year one without the tutorial, Skip ahead pressed while the soil is cold', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page)
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.refuse(); const { app } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); app.campaign.incidents = []`)
  await putAway(page)
  // The key the players pressed, under "Plant when the soil reaches 50°F".
  await expect(page.getByTestId('goal')).toContainText('Plant when the soil reaches')
  await page.getByTestId('goal-faster').click()
  expect(await game<number>(page, 'app.speed')).toBe(3)
  await atTheAsk(page, 'year one, Skip ahead')
  // The way on is the player's: resumed without a press, the crew starts three days later, says so, and nothing
  // pauses for it.
  await expect(page.getByTestId('paused-go')).toContainText('Resume at 8×')
  const asked = await game<number>(page, 'c.season.plantAsk')
  await page.getByTestId('paused-go').click()
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'Paused: the soil is ready' })).toHaveCount(0)
  await expect.poll(() => game<string>(page, 'c.season.plantWordBy ?? ""'), { timeout: 30_000, intervals: [100] }).toBe('crew')
  const started = await game<number>(page, 'c.season.plantWord')
  expect(started - asked, 'days from the ask to the crew\'s own start').toBeGreaterThanOrEqual(3)
  expect(started - asked).toBeLessThanOrEqual(7)
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'You gave no word in 3 days, so your crew has started planting on its own.' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('at 1x the game pauses the same way, two days after the test leaves it running', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page)
  // The days are passed by the test to two before the ask (found on a copy of the farm), then run at 1x.
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.refuse(); const { app, sim } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); const c = app.campaign
    const copy = structuredClone(c); let n = 0
    while (copy.season.plantAsk === undefined && n < 120) { copy.incidents = []; sim.apply(app.world, copy, { t: 'day' }); n++ }
    app.setSpeed(0); for (let k = 0; k < n - 2; k++) { c.incidents = []; app.do({ t: 'day' }) }`)
  await putAway(page)
  expect(await game<boolean>(page, 'c.season.plantAsk === undefined')).toBe(true)
  await page.getByTestId('speed-1').click()
  expect(await game<number>(page, 'app.speed')).toBe(1)
  await atTheAsk(page, 'year one at 1x')
  await expect(page.getByTestId('paused-go')).toContainText('Resume at 1×')
  expect(errors, errors.join('\n')).toEqual([])
})

// The pictures the report shows: year two, the tutorial off, the camera left close in on one corner of the farm.
test('year two without the tutorial at 3x: paused at the ask with the stamps brought into view; one press, and the slip says how far the planting is', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk, at the players\' size')
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await secondSpring(page, null)
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('date')).toBeVisible()
  const potato = await game<number[]>(page, `c.plans.map((p, i) => p && p.crop === 'potato' && c.fields[i].tenure !== 'none' ? i : -1).filter(i => i >= 0)`)
  // The camera taken close in to the home woodlot, so that a potato field's tag is off the screen.
  await reach(page, `const { app } = q.g(); app.setSpeed(0); app.campaign.incidents = []; app.focus(14)`)
  await page.waitForTimeout(1200)
  await page.mouse.move(640, 520)
  for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, -600); await page.waitForTimeout(120) }
  await page.waitForTimeout(900)
  const away = await page.evaluate(list => list.filter(i => { const r = document.querySelector(`#ui [data-testid="field-${i}"]`)?.getBoundingClientRect(); return !r || r.left < 40 || r.right > innerWidth - 40 || r.width === 0 }), potato)
  expect(away.length, 'potato fields off the screen before the ask (their tags wait at the edge)').toBeGreaterThan(0)
  await page.getByTestId('speed-2').click()
  expect(await game<number>(page, 'app.speed')).toBe(2)
  const fit = await atTheAsk(page, 'year two at 3x', 'r8-pause-year2-1280')
  await expect(page.getByTestId('paused-go')).toContainText('Resume at 3×')
  // One press on a ringed stamp: the word, said once; the speed unchanged; the pause the player's own.
  await page.locator(`#ui [data-testid="badge-${fit[0]}"]`).click()
  await expect(page.locator('#ui .notes .alert').filter({ hasText: /^You gave the word/ })).toBeVisible()
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'Paused: the soil is ready' })).toHaveCount(0)
  expect(await game<[number, string, string]>(page, '[app.speed, app.pauseReason, c.season.plantWordBy]')).toEqual([0, '', 'you'])
  // (2): the slip does not go back to the soil. It says how far the planting is, and counts up.
  const goal = page.getByTestId('goal')
  await expect(goal).toContainText(`Planting: 0 of ${potato.length} fields`)
  await expect(goal).toContainText('your crew plants the rest on its own')
  await expect(goal).not.toContainText('Plant when the soil reaches')
  await expect(goal).not.toContainText('any day now')
  await page.waitForTimeout(400)
  await picture(page, 'r8-after-word-1280')
  const said = new Set<string>()
  for (let day = 0; day < 40; day++) {
    const planted = await game<number>(page, `c.season.fields.filter(f => f.plantDay >= 0).length`)
    if (planted >= potato.length) break
    await expect(goal).toContainText(`Planting: ${planted} of ${potato.length} fields`)
    await expect(goal).not.toContainText(/Plant when the soil|any day now/)
    said.add(`${planted}`)
    await aDay(page)
  }
  expect(said.size, `the count went up (${[...said].join(' ')})`).toBeGreaterThan(1)
  // Then it moves on: to what the player is waiting for, not to a job of the crew's (11).
  await expect(goal).not.toContainText('Planting:')
  await expect(goal).not.toContainText(/Walk a field for blight|handles it automatically/)
  expect(errors, errors.join('\n')).toEqual([])
})

test('year two with the tutorial on: Skip ahead under the slip stops at the ask, as the pause says', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await secondSpring(page, 'calls2')
  await page.getByTestId('begin-season').click()
  await expect(note(page, 'calls2')).toBeVisible({ timeout: 15_000 })
  await expect(note(page, 'calls2')).toContainText('The game pauses when the soil is ready, and planting waits for your word.')
  await page.waitForTimeout(500)
  await note(page, 'calls2').getByTestId('guide-noted').click()
  await expect(note(page, 'calls2')).toHaveCount(0)
  // As the players went: "Skip ahead at 8x" under "Plant when the soil reaches 50°F".
  await expect(page.getByTestId('goal')).toContainText('Plant when the soil reaches', { timeout: 10_000 })
  await page.getByTestId('goal-faster').click()
  await atTheAsk(page, 'year two with the tutorial, Skip ahead')
  await expect(page.locator('#ui [data-testid="guide-slip"]:not([hidden])')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

// (11): while the next step is the crew's, the slip says what the player is waiting for.
test('the slip never gives the crew\'s job as the player\'s goal: after planting it says what the player is waiting for', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk, at the players\' size')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page)
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.refuse(); ${PLANTED}`)
  await putAway(page)
  const goal = page.getByTestId('goal')
  await expect(goal).toContainText('Nothing for you until blight weather')
  await expect(goal).toContainText('your crew tends the fields on its own')
  await expect(page.locator('#ui [data-testid="goal"][data-waiting="crew"]')).toHaveCount(1)
  await picture(page, 'r8-waiting-1280')
  // Through the weeks the crew walks, hills and digs test hills, the slip never names one of those as the goal.
  for (let k = 0; k < 20 && await game<boolean>(page, 'c.season.watchDay < 0'); k++) {
    await expect(goal).not.toContainText(/Walk a field for blight|Hill the rows|Do a test dig|handles it automatically/)
    await aDay(page)
  }
  // Spraying decided: the next decision that is the player's, and when.
  await reach(page, `q.g().app.do({ t: 'sprayWay', way: 'auto' })`)
  await putAway(page)
  if (!(await game<boolean>(page, 'sim.pressing(app.world, c).length > 0 || app.needs().some(n => n.need && ["rogue", "spray", "kill", "water"].includes(n.need.act))'))) {
    await expect(goal).toContainText('Your next decision is killing the vines')
    await expect(goal).toContainText(/due (around|since) [A-Z][a-z]+ \d+/)
  }
  await expect(goal).not.toContainText(/Walk a field for blight|Hill the rows|Do a test dig|handles it automatically/)
  expect(errors, errors.join('\n')).toEqual([])
})

// ---------------------------------------------------------------- the guide runs the clock (the owner, after round eight)
// "we should start the tutorial when planting is ready and accelerate time during the tutorial where needed to help
// explain things". The guided-year walk at the top of this file is the whole of it, played by a player who presses
// only what notes ask; these hold its parts.

// (1): from Guided first year and Start the season, with no other press, the game reaches the planting ask: paused,
// the stamps in view, in under 15 seconds, and the first note the player must act on is the word to plant.
test('the tutorial starts when planting is ready: Start the season, a few seconds of weeks passing, and the word to plant', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk, at the players\' size')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await fresh(page)
  await page.getByTestId('play-guided').click()
  await expect(note(page, 'frame')).toBeVisible()
  await page.locator('#ui [data-testid="guide-slip"] [data-testid="guide-noted"]').click()
  await expect(note(page, 'begin')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('begin-season').click()
  const started = Date.now()
  // The run: the guide's line says what is passing and what comes next, with the key that takes the clock. The land
  // alone is on the screen under it.
  const line = page.getByTestId('guide-drive-line')
  await expect(line).toHaveText('A few weeks pass while the soil warms.', { timeout: 5000 })
  await expect(page.getByTestId('guide-drive-next')).toHaveText('Next: planting, on your word.')
  await expect(page.getByTestId('guide-take')).toHaveText('Take the clock')
  const running = await see(page)
  expect(running.speed).toBe(3)
  expect(running.asking, 'nothing asks while the weeks pass').toEqual([])
  expect(running.words, running.text).toBeLessThanOrEqual(FIRST_DAY_WORDS)
  expect(running.hidden.sort()).toEqual(['after', 'forecast', 'list', 'people', 'stamps', 'tags'])
  // (the picture once the spring sheet has gone, if the weeks are still passing)
  await page.waitForFunction(() => !document.querySelector('#ui .screen-layer > main.leaving'), null, { timeout: 3000 }).catch(() => {})
  await picture(page, 'g4-opening-run-1280')
  // The ask: paused the day the crew asks, nothing planted, the stamp the note names in view with nothing over it.
  await expect(note(page, 'word')).toBeVisible({ timeout: 15_000 })
  const took = Date.now() - started
  console.log(`Start the season to the word to plant: ${took} ms`)
  expect(took, 'from Start the season to the planting ask').toBeLessThan(15_000)
  await page.waitForTimeout(900)
  const at = await game<{ speed: number; day: number; ask: number; jobs: number; shown: string[] }>(page, `({ speed: app.speed, day: c.season.day, ask: c.season.plantAsk, jobs: c.season.jobs.filter(j => j.kind === 'plant').length,
    shown: Object.keys(window.__countyGuide.p.since) })`)
  expect([at.speed, at.day - at.ask, at.jobs]).toEqual([0, 0, 0])
  // The first note of the season, and the first that asks anything of the player.
  expect(at.shown).toEqual(['frame', 'begin', 'word'])
  await expect(page.getByTestId('guide-drive')).toHaveCount(0)
  await expect(page.getByTestId('guide-held')).toHaveText('Paused')
  const field = Number(((await note(page, 'word').getAttribute('data-target')) ?? '').replace('badge-', ''))
  expect(await reachable(page, `badge-${field}`)).toBe('in view')
  const s = await see(page)
  check(s, ['frame', 'begin', 'word'])
  expect(s.words, s.text).toBeLessThanOrEqual(FIRST_DAY_WORDS)
  await picture(page, 'g4-ask-1280')
  // The press, the note that says what follows, and then the guide shows the planter: slowed to the first speed,
  // the one planting followed and inside the window.
  await page.locator(`#ui [data-testid="badge-${field}"]`).click()
  await expect(note(page, 'plantday')).toBeVisible()
  await expect(note(page, 'plantday').getByTestId('guide-resumes')).toHaveText('time runs on')
  await page.waitForTimeout(500)
  await note(page, 'plantday').getByTestId('guide-noted').click()
  await expect(page.locator('#ui [data-testid="guide-drive"][data-scene="plant"]')).toBeVisible({ timeout: 20_000 })
  // (planted, if that day finished the field: the line says what the time book says of them)
  await expect(line).toContainText(/^You('re planting| planted) /)
  await expect(page.getByTestId('guide-drive-next')).toHaveText('Drag to look around, and scroll to zoom.')
  expect(await game<number>(page, 'app.speed')).toBe(1)
  // Looked at twice with them in the window both times: in it for the time between.
  let inside = 0
  let was = -1
  for (let k = 0; k < 40; k++) {
    const now = await see(page)
    const t = Date.now()
    if (now.scene !== 'plant') break
    if (now.inView && was >= 0) inside += t - was
    was = now.inView ? t : -1
    if (k === 2) { await picture(page, 'g4-planter-1280'); was = -1 }
    await page.waitForTimeout(150)
  }
  expect(inside, 'ms the planter was inside the window while shown').toBeGreaterThanOrEqual(2000)
  // Then it runs on, fast, saying what is passing.
  await expect(page.locator('#ui [data-testid="guide-drive"][data-scene=""]')).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => game<number>(page, 'app.speed'), { timeout: 5000 }).toBe(3)
  expect(errors, errors.join('\n')).toEqual([])
})

// (3): the player keeps control. Setting a speed, pausing, or "Take the clock" stops the guide's driving, and it does
// not start again by itself; a note offers to take the clock back, without nagging.
test('the player keeps the clock: a speed set, a pause or Take the clock stops the guide driving, and only the player hands it back', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page)
  const drives = () => page.evaluate(() => { const w = globalThis as unknown as Win; return w.__countyGuide.drives(w.__county.app.campaign) as boolean })
  // A guided first year, planted, with the summer's note behind the player: the guide is running the clock.
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.skipTo('blight'); ${PLANTED}`)
  await putAway(page)
  const drive = page.getByTestId('guide-drive')
  await expect(drive).toBeVisible({ timeout: 8000 })
  await expect.poll(() => game<number>(page, 'app.speed'), { timeout: 8000 }).toBeGreaterThan(0)
  expect(await drives()).toBe(true)
  // "Take the clock": the line goes, the game runs on at the first speed, and nothing of the guide's touches it.
  await page.getByTestId('guide-take').click()
  await expect(drive).toHaveCount(0)
  expect(await drives()).toBe(false)
  expect(await game<[number, number]>(page, '[app.speed, app.pace]')).toEqual([1, 1])
  await page.waitForTimeout(2500)
  expect(await game<[number, number]>(page, '[app.speed, app.pace]')).toEqual([1, 1])
  await expect(drive).toHaveCount(0)
  // Paused by the player: it stays paused.
  await page.keyboard.press('Space')
  await page.waitForTimeout(2500)
  expect(await game<number>(page, 'app.speed')).toBe(0)
  // Handed back (as from the guide's own paper): it runs again. Then a speed key takes it, as a pause does.
  await page.evaluate(() => (globalThis as unknown as Win).__countyGuide.giveClock())
  await expect(drive).toBeVisible({ timeout: 8000 })
  await expect.poll(() => game<number>(page, 'app.speed'), { timeout: 8000 }).toBeGreaterThan(0)
  await page.getByTestId('speed-2').click()
  await expect(drive).toHaveCount(0)
  expect(await drives()).toBe(false)
  await page.waitForTimeout(2000)
  expect(await game<[number, number]>(page, '[app.speed, app.pace]')).toEqual([2, 1])
  // The next note offers to take the clock back, as a quiet key; taken, the guide runs on after Got it.
  await page.evaluate(() => (globalThis as unknown as Win).__countyGuide.replay('tend'))
  await expect(note(page, 'tend')).toBeVisible({ timeout: 10_000 })
  await expect(note(page, 'tend').getByTestId('guide-resumes')).toHaveText('resumes at 3×')
  await note(page, 'tend').getByTestId('guide-give').click()
  await expect(note(page, 'tend').getByTestId('guide-give')).toHaveCount(0)
  await expect(note(page, 'tend').getByTestId('guide-resumes')).toHaveText('time runs on')
  await page.waitForTimeout(300)
  await note(page, 'tend').getByTestId('guide-noted').click()
  await expect(drive).toBeVisible({ timeout: 8000 })
  expect(await drives()).toBe(true)
  // With the tutorial turned off nothing runs the clock.
  await page.evaluate(() => { const w = globalThis as unknown as Win; w.__countyGuide.stop(); w.__county.app.setSpeed(0) })
  await expect(drive).toHaveCount(0)
  await page.waitForTimeout(2500)
  expect(await game<[number, number]>(page, '[app.speed, app.pace]')).toEqual([0, 1])
  expect(errors, errors.join('\n')).toEqual([])
})

// (4): the guide only ever sets the speed, so every pause the game makes by itself stops it: the word to plant (with
// its note already behind the player), the spraying question, a telegram, a weigh ticket.
test('the guide never runs past a decision: the word to plant, the spraying question and a telegram each stop it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page)
  // A guided first year whose opening notes are behind the player (the word's among them): the guide runs to the ask.
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.skipTo('plantday'); const { app } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); app.campaign.incidents = []`)
  await putAway(page)
  await expect.poll(() => game<string>(page, 'app.speed === 0 && c.season.plantAsk !== undefined ? "asked" : ""'), { timeout: 20_000, intervals: [100] }).toBe('asked')
  const asked = await game<{ day: number; ask: number; jobs: number }>(page, `({ day: c.season.day, ask: c.season.plantAsk, jobs: c.season.jobs.filter(j => j.kind === 'plant').length })`)
  expect([asked.day - asked.ask, asked.jobs]).toEqual([0, 0])
  // It waits there, saying what for, for as long as the player leaves it.
  await expect(page.getByTestId('guide-drive-line')).toHaveText('Planting waits for your word. Click a ringed Plant stamp.')
  await page.waitForTimeout(4000)
  expect(await game<[number, number, number]>(page, `[app.speed, c.season.day, c.season.jobs.filter(j => j.kind === 'plant').length]`)).toEqual([0, asked.day, 0])
  // The press: the note that says what follows; after it the guide runs to the summer, then to blight weather.
  const wait = await page.evaluate(() => document.querySelector<HTMLElement>('#ui [data-testid="guide-drive"]')!.dataset.wait)
  await page.locator(`#ui [data-testid="badge-${wait}"]`).first().click()
  // Every note is read and put away; the spraying question, when it comes, is the thing looked at.
  const ask = page.getByTestId('spray-ask')
  let seen = ''
  const until = Date.now() + 150_000
  while (Date.now() < until && !seen) {
    if (await ask.isVisible().catch(() => false)) { seen = 'spray'; break }
    const telegram = page.locator('#ui .season-screen .telegram:not(.spray-card) .reply.first').first()
    if (await game<number>(page, 'c.incidents.length') > 0 && await telegram.isVisible().catch(() => false)) {
      // A telegram on the way: the days stand while it is up, however long.
      const day = await game<number>(page, 'c.season.day')
      await page.waitForTimeout(1500)
      expect(await game<[number, number]>(page, '[app.speed, c.season.day]'), 'a telegram stops the guide').toEqual([0, day])
      await telegram.click()
      await expect.poll(() => game<number>(page, 'c.incidents.length')).toBe(0)
      await page.waitForTimeout(500)
      continue
    }
    const got = page.locator('#ui [data-testid="guide-slip"]:not([hidden]) [data-testid="guide-noted"]').first()
    if (await got.isVisible().catch(() => false)) { await got.click(); await page.waitForTimeout(200); continue }
    await page.waitForTimeout(200)
  }
  test.skip(!seen && await game<boolean>(page, 'c.season.watchDay < 0'), 'no blight weather this year')
  expect(seen, 'the spraying question came').toBe('spray')
  // The question: the days stand for it, and the guide's line is away while it is asked.
  const day = await game<number>(page, 'c.season.day')
  await page.waitForTimeout(3000)
  expect(await game<[number, number]>(page, '[app.speed, c.season.day]')).toEqual([0, day])
  await expect(page.getByTestId('guide-drive')).toHaveCount(0)
  // Answered, the guide runs on.
  await page.getByTestId('spray-way-auto').click()
  await expect(ask).toBeHidden()
  for (let k = 0; k < 6; k++) {
    const got = page.locator('#ui [data-testid="guide-slip"]:not([hidden]) [data-testid="guide-noted"]').first()
    if (await got.isVisible().catch(() => false)) await got.click()
    if (await game<number>(page, 'app.speed') > 0) break
    await page.waitForTimeout(700)
  }
  await expect.poll(() => game<number>(page, 'app.speed'), { timeout: 8000 }).toBeGreaterThan(0)
  expect(errors, errors.join('\n')).toEqual([])
})
