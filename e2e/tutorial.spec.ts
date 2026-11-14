// The guided first year as a newcomer meets it: offered as a card on a new farm, taken, and played from Play to the
// first sale by pressing only what the notes ask. At every step: the clock stands while a note or a card is up, one
// thing at most asks for attention, a note is 35 words or fewer, and the screen stays short of words.
import AxeBuilder from '@axe-core/playwright'
import { test, type Page } from './base.ts'
import { expect, noSidewaysScroll, open, putAway, reach, watchErrors } from './helpers.ts'

// The budgets (docs/TUTORIAL.md). Words are those a player can see on the season screen, on the land's tags and in
// the note, field names aside. A card (the offer, what a year is) is all there is on the screen while it is up.
const NOTE_WORDS = 20
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
        if (!p || !t || p.closest('.sr, [hidden], .leaving, .out, .gone, .mainbar')) continue
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

// The rules the tips are held to (docs/TUTORIAL.md, "Tips, not a narrator"): a new player's first year, played by
// someone who takes the tips and then does only what the game asks, never touching a tip. The tips never stop the
// game, never need a press and never move the camera; while one is up the days go no faster than the first speed,
// and go back to the speed they had when it goes; one is up at a time, each is twenty words or fewer, and two that
// only tell never come back to back.
test('a first year with tips: they never stop the game, never need a press, never move the camera, and only slow the days while one is up', async ({ page, isMobile }) => {
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
  await page.getByTestId('guide-accept').click()
  await expect(offer).toHaveCount(0)
  // Taking the tips goes straight onto the land: the usual plan stands and the season starts.
  await expect(page.getByTestId('date')).toBeVisible({ timeout: 15_000 })

  type Now = { speed: number; pace: number; why: string; cause: string; cam: string; skip: boolean }
  const read = () => page.evaluate(() => {
    const g = globalThis as unknown as { __county: { app: { speed: number; pace: number; pauseReason: string; pauseCause: string } }; __countyField: { rig: { where(): { x: number; z: number; dist: number; yaw: number } } } }
    const w = g.__countyField.rig.where(), e = document.querySelector<HTMLElement>('#ui [data-testid="goal-faster"]')
    return { speed: g.__county.app.speed, pace: g.__county.app.pace, why: g.__county.app.pauseReason ?? '', cause: g.__county.app.pauseCause ?? '', cam: [w.x, w.z, w.dist, w.yaw].map(n => Math.round(n)).join(','), skip: !!e && e.offsetParent !== null }
  }) as Promise<Now>
  const did: string[] = []
  const tips: { id: string; words: number; came: number; went: number; asks: boolean }[] = []
  let actedAt = 0
  const act = async (what: string, sel: string) => { did.push(what); await page.locator(`#ui ${sel}`).first().click(); actedAt = Date.now() }
  const until = Date.now() + 600_000
  let begun = 0, ticketAt = 0, idle = 0, was: Now | null = null, camera = 0, stood = 0, tipUp = 0, before = 1
  const changes: { t: number; from: number; to: number; at: string }[] = []
  while (Date.now() < until) {
    const s = await see(page), n = await read()
    if (s.phase === 'season' && !begun) begun = Date.now()
    // One voice, the words it may take, and a tip never over what it points at.
    const at = `after ${did.slice(-5).join(' > ')} (day ${s.day})`
    expect(s.asking.filter(a => a !== 'toast').length, `one voice ${at}: ${s.asking.join(' + ')}`).toBeLessThanOrEqual(1)
    if (s.note) expect(s.noteWords, `${s.note} says it in ${NOTE_WORDS} words or fewer`).toBeLessThanOrEqual(NOTE_WORDS)
    expect(s.overTarget, `the tip ${s.note} lies over what it points at (${s.target}) ${at}`).toBe(false)
    // A tip never stops the game: the game is never paused in a tip's name.
    expect(n.why, `the game stopped for a tip ${at}`).not.toMatch(/tip from the county agent/i)
    // The clock and the camera move only under the player's hand. The game's own stop for a decision aside; and a
    // tip coming slows the days to the first speed, and its going puts them back as they were.
    if (was && begun) {
      const mine = Date.now() - actedAt < 1200
      if ((was.speed !== n.speed || was.pace !== n.pace) && !mine && !(n.speed === 0 && n.cause) && !(was.speed === 0 && was.cause)) changes.push({ t: Date.now(), from: was.speed, to: n.speed, at })
      if (was.cam !== n.cam && Date.now() - begun > 6000) camera++
      // While a tip is up the days go no faster than the first speed (the player's own hand on the clock aside).
      // (the tip and the clock are read in two looks: a tip going between them is looked at again, as one)
      if (s.note && tipUp >= 3 && !mine && n.speed > 1) {
        const again = await see(page), speed = (await read()).speed
        if (again.note === s.note && (await see(page)).note === s.note) expect(speed, `the days under the tip ${s.note} ${at}`).toBeLessThanOrEqual(1)
      }
    }
    tipUp = s.note ? tipUp + 1 : 0
    if (!s.note && n.speed > 0) before = n.speed
    was = n
    if (s.note !== (tips.at(-1)?.went ? '' : tips.at(-1)?.id ?? '')) {
      if (tips.length && !tips.at(-1)!.went) tips.at(-1)!.went = Date.now()
      if (s.note) { tips.push({ id: s.note, words: s.noteWords, came: Date.now(), went: 0, asks: s.target.startsWith('badge-') || ['goal-faster', 'end-season', 'paused-go', 'speed-0', 'speed-toggle', 'speed-3', 'speed-cycle'].includes(s.target) || s.keys.includes('guide-act') }); console.log(`${s.note} (day ${s.day}, ${s.noteWords} words, speed ${n.speed})`) }
    }
    if (s.sold > 0) break
    if (s.ticketSell) { ticketAt ||= Date.now(); await act('ticket', `[data-testid="${s.ticketSell}"]`); await page.waitForTimeout(300); continue }
    // What a new player does: answers what the game asks, and presses what a tip points at. Never a tip's own keys.
    if (s.asking.includes('telegram')) {
      const spray = page.getByTestId('spray-way-auto')
      if (await spray.isVisible().catch(() => false)) await act('spraying', '[data-testid="spray-way-auto"]')
      else await act('telegram', '.season-screen .telegram .reply.first')
      await page.waitForTimeout(250)
      continue
    }
    if (s.asking.includes('tray')) { await page.getByTestId('sample-close').click().catch(() => {}); continue }
    if (s.note && s.keys.includes('guide-act')) { await act(`${s.note}: its own key`, '[data-testid="guide-slip"] [data-testid="guide-act"]'); await page.waitForTimeout(250); continue }
    if (s.note && (s.target.startsWith('badge-') || ['goal-faster', 'end-season', 'paused-go', 'speed-0', 'speed-toggle', 'speed-3', 'speed-cycle'].includes(s.target))) { await act(`${s.note}: what it points at`, `[data-testid="${s.target}"]`); await page.waitForTimeout(250); continue }
    if (s.done) { await act('close out', '[data-testid="end-season"]'); await page.waitForTimeout(400); continue }
    // Nothing asked: the player uses the key the game offers for a wait, or sets the days going.
    const waiting = s.phase === 'season' && !s.note && !s.asking.some(a => a !== 'toast') && (n.speed === 0 || (n.skip && n.speed < 3))
    if (waiting) {
      if (n.speed === 0 && !n.cause) stood += 250
      if (++idle >= 10) { idle = 0; if (n.skip) await act('skip ahead', '[data-testid="goal-faster"]'); else if (n.speed === 0) { did.push('Space'); await page.keyboard.press('Space'); actedAt = Date.now() } }
    } else idle = 0
    await page.waitForTimeout(250)
  }
  console.log(`played: ${did.join(' > ')}`)
  console.log(`tips: ${tips.map(t => `${t.id} ${t.words}w`).join(', ')}; Start the season to the first weigh ticket: ${Math.round((ticketAt - begun) / 1000)} s`)
  expect(ticketAt, `the first weigh ticket was reached, after ${did.join(' > ')}`).toBeGreaterThan(0)
  expect((await see(page)).sold, 'a crop sold').toBeGreaterThan(0)
  // The one thing a tip does to the clock: the days go at the first speed while it is up, and back as they were when
  // it goes (a tip a card came over for a moment counts as one that came and went). Nothing else changes the clock.
  const forTip = (c: { t: number; from: number; to: number }) => tips.some(t => (c.to === 1 && c.from > 1 && Math.abs(c.t - t.came) < 3000) || (c.from === 1 && c.to > 1 && !!t.went && Math.abs(c.t - t.went) < 3000))
  const stray = changes.filter(c => !forTip(c))
  expect(stray.map(c => `${c.from} to ${c.to} ${c.at}`), 'the clock changed without the player\'s hand, and not for a tip').toEqual([])
  expect(camera, 'times the camera moved without the player\'s hand').toBe(0)
  // The first tips of a first year: the key for a wait while the soil warms (when it is cold), then the word to plant.
  expect(tips.map(t => t.id).filter(id => id === 'clock' || id === 'word' || id === 'plantday').slice(-2)).toEqual(['word', 'plantday'])
  for (const id of ['tend', 'blight']) expect(tips.map(t => t.id), `nothing is said only to say nothing need be done (${id})`).not.toContain(id)
  expect(tips.length, `a handful of tips in a first season: ${tips.map(t => t.id).join(' ')}`).toBeLessThanOrEqual(9)
  // Two tips that only tell never come back to back: some seconds of play lie between them.
  for (let k = 1; k < tips.length; k++) if (!tips[k].asks && tips[k - 1].went) expect(tips[k].came - tips[k - 1].went, `${tips[k - 1].id} then ${tips[k].id}`).toBeGreaterThanOrEqual(4000)
  // A tip that only tells goes by itself: none stayed up past twelve seconds.
  for (const t of tips) if (!t.asks && t.went) expect(t.went - t.came, `${t.id} was up`).toBeLessThan(12_000)
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
  // Straight onto the land: the first tip is the key that skips the wait, and with it used, the word to plant.
  const word = page.locator('#ui [data-testid="guide-slip"][data-lesson="word"]')
  await skipToWord(page)
  await page.waitForTimeout(3000)
  await page.reload()
  await page.getByTestId('continue').click()
  await expect(word).toBeVisible({ timeout: 20_000 })
  // From the title: a guided farm with no offer to answer.
  await page.evaluate(() => (globalThis as unknown as { __county: { app: any } }).__county.app.quitToTitle())
  await page.getByTestId('play-guided').click()
  await page.getByTestId('confirm-ok').click()
  await skipToWord(page)
  await expect(page.getByTestId('guide-offer')).toHaveCount(0)
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
  // The season's first tip (the key that skips the wait while the soil warms), then the word to plant.
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="clock"]')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  await scan('the first tip of the season')
  await skipToWord(page)
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
  // (the owner, 14 November: a tip stands beside the game and takes nothing from it: the slip stays up under one)
  expect((await slipLaid(page))!.shown).toBe(true)
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
  // The season: its first note. (The owner, 14 November: a tip takes nothing from the game: the slip stays up under it.)
  await expect(note(page, 'calls2')).toBeVisible({ timeout: 15_000 })
  expect((await voices()).slip).not.toBe('')
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
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'The soil is ready. Press a ringed Plant stamp to start planting' })).toBeVisible()
  await expect(page.getByTestId('goal')).toContainText('Start planting')
  for (const i of fit) await expect(page.locator(`#ui [data-testid="badge-${i}"]`), `the Plant stamp on field ${i}`).toBeVisible()
  await expect(page.locator('#ui .plate-layer .need.is-next')).toHaveCount(1)
  // Nothing starts without the word: two more days, and still no planting on the list.
  for (let k = 0; k < 2; k++) { await aDay(page); expect(await game<number>(page, `c.season.jobs.filter(j => j.kind === 'plant').length + c.season.fields.filter(f => f.plantDay >= 0).length`)).toBe(0) }
  await picture(page, 'r7-ready-1280')
  // One press. The speed is not changed by it.
  const first = (await game<number[]>(page, `app.needs().map((n, i) => n.need && n.need.act === 'plant' ? i : -1).filter(i => i >= 0)`))[0]
  await page.locator(`#ui [data-testid="badge-${first}"]`).click()
  expect(await game<number>(page, 'app.speed')).toBe(0)
  await expect(page.locator('#ui .notes .alert').filter({ hasText: `Planting has started. Your crew will plant the other ${potato.length - 1} fields too.` })).toBeVisible()
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
  const toast = page.locator('#ui .notes .alert').filter({ hasText: 'Your crew waited 3 days and has started planting on its own.' })
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
  await skipToWord(page)
}
// As a new player gets there: the key the first tip points at (Skip ahead) pressed until the game stops for the word.
async function skipToWord(page: Page): Promise<void> {
  const skip = page.locator('#ui [data-testid="goal-faster"]')
  await expect.poll(async () => {
    if (await note(page, 'word').isVisible().catch(() => false)) return true
    if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {})
    return false
  }, { timeout: 90_000, intervals: [500] }).toBe(true)
}

// G (18): a key that touches the clock says what it does. (The owner, after round eight: the guide runs the clock
// itself, so no note carries a fast-forward key. Got it on a note that only tells says time runs on, and the guide
// sets the days going; with the clock the player's it says the speed it resumes at, and resumes at that speed.)
// A first-year farm with every potato field planted (the word given by the test), the game paused.
const PLANTED = `const { app } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); const c = app.campaign
  for (let n = 0; n < 120 && c.season.fields.some((f, i) => c.plans[i].crop === 'potato' && c.fields[i].tenure !== 'none' && f.plantDay < 0); n++) {
    c.incidents = []; const at = app.needs().findIndex(x => x.need && x.need.act === 'plant'); if (at >= 0) app.do({ t: 'job', kind: 'plant', field: at }); app.do({ t: 'day' }) }
  c.incidents = []; app.setSpeed(0)`

test('a note\'s keys work from the first frame it is shown, and a double-click answers one note, not two', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await open(page)
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.skipTo('plantday'); ${PLANTED}; app.setSpeed(1)`)
  await expect(note(page, 'plantday')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(700)
  // A double-click on Got it puts that tip away and nothing else: no second tip comes under the same spot.
  const got = (await note(page, 'plantday').getByTestId('guide-noted').boundingBox())!
  await page.mouse.dblclick(got.x + got.width / 2, got.y + got.height / 2)
  await expect(note(page, 'plantday')).toHaveCount(0)
  await page.waitForTimeout(700)
  await expect(page.locator('#ui [data-testid="guide-slip"]:not([hidden])')).toHaveCount(0)
  // Planting day's tip again (replayed): on the frame it comes, the point at the middle of its Got it is that key.
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
  // And a press there, at once, is taken: the tip goes, and the days go on as the player had them.
  await page.mouse.click(firstFrame.x, firstFrame.y)
  await expect(note(page, 'plantday')).toHaveCount(0)
  expect(await game<number>(page, 'app.speed')).toBeGreaterThan(0)
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
  void name
  await expect(note(page, 'word')).toContainText('The soil is ready. Click the ringed Plant stamp.')
  await expect(note(page, 'word')).toContainText('Your crew plants the other fields too.')
  // The game stopped itself for this decision, and its own line says why: the tip stands beside it.
  expect(await game<[number, string]>(page, '[app.speed, app.pauseCause]')).toEqual([0, 'plantAsk'])
  await expect(page.getByTestId('paused')).toBeVisible()
  // The stamp it names is on the screen, ringed, and nothing lies over it: not the note, not the pointing hand.
  const stamp = page.locator(`#ui [data-testid="badge-${field}"]`)
  await expect(stamp).toBeVisible()
  expect(await reachable(page, `badge-${field}`)).toBe('in view')
  expect((await see(page)).overTarget).toBe(false)
  expect(await game<number>(page, `c.season.jobs.filter(j => j.kind === 'plant').length`)).toBe(0)
  await picture(page, 'r7-ask-1280')
  await stamp.click()
  // The press: planting on the list there and the speed unchanged. The game is still stopped, so the next tip points
  // at the way on; with the days running, some seconds later, the tip that says what the player is doing.
  expect(await game<number>(page, 'app.speed')).toBe(0)
  expect(await game<[number, string][]>(page, `c.season.jobs.filter(j => j.kind === 'plant').map(j => [j.field, j.by])`)).toEqual([[field, 'you']])
  await expect(note(page, 'run')).toBeVisible({ timeout: 10_000 })
  await expect(note(page, 'run')).toContainText('Planting is ordered. Press Space to run the days.')
  await page.keyboard.press('Space')
  await expect(note(page, 'run')).toHaveCount(0)
  await expect(note(page, 'plantday')).toBeVisible({ timeout: 15_000 })
  await expect(note(page, 'plantday')).toContainText('Planting has started.')
  expect(await game<number>(page, 'app.speed'), 'the days go on under a tip').toBe(1)
  await page.waitForTimeout(700)
  // Round eight (2): the sentence is told once. The answer beside the pointer does not repeat what the note says.
  await expect(page.getByTestId('answer-tip')).toBeHidden()
  expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#ui *')].filter(e => !e.closest('.sr') && [...e.childNodes].some(n => n.nodeType === 3 && /Planting has started/.test(n.nodeValue ?? ''))
    && e.checkVisibility({ opacityProperty: true, visibilityProperty: true } as CheckVisibilityOptions)).length), 'places that say "Planting has started"').toBe(1)
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
test('a press on a stamp never changes the speed: the days go at 1x while its tip is up, and at the player\'s speed again after', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await open(page)
  await reach(page, TO_STAMPS('player'))
  await expect(note(page, 'stamp')).toBeVisible({ timeout: 15_000 })
  // The tip does not stop the game: the days the player had at 8x go at 1x while it is up.
  await expect.poll(() => game<number>(page, 'app.speed')).toBe(1)
  expect(await game<string>(page, 'app.pauseReason')).toBe('')
  // Each stamp the tip points at is pressed until it has no more to point at: no press changes the speed.
  for (let k = 0; k < 8 && await note(page, 'stamp').count(); k++) {
    const target = (await note(page, 'stamp').getAttribute('data-target')) ?? ''
    if (!target.startsWith('badge-')) break
    await page.locator(`#ui [data-testid="${target}"]`).first().click()
    await page.waitForTimeout(500)
    if (await note(page, 'stamp').count()) expect(await game<number>(page, 'app.speed'), `the speed after pressing ${target}`).toBe(1)
  }
  await expect(note(page, 'stamp')).toHaveCount(0)
  expect(await game<number>(page, `c.season.jobs.filter(j => j.kind === 'spray').length`)).toBeGreaterThan(0)
  // With the tip gone the days go at the speed the player had.
  await expect.poll(() => game<number>(page, 'app.speed'), { timeout: 5000 }).toBe(3)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the first spring sheet says a usual first year and that the loan carries it', async ({ page, isMobile }) => {
  const errors = watchErrors(page)
  await fresh(page)
  await page.getByTestId('play').click()
  await page.getByTestId('guide-refuse').click()
  // (at a desk the blank shows three figures at a glance and this line is behind Details; a phone's sheet shows it)
  if (!isMobile) await page.getByTestId('plan-more').click()
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
  await expect(page.getByTestId('goal')).toContainText('Start planting')
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
  // (Skip ahead skipped the waiting: the way on is at the speed the game had before it, so the planting is seen)
  await expect(page.getByTestId('paused-go')).toContainText('Resume at 1×')
  const asked = await game<number>(page, 'c.season.plantAsk')
  await page.getByTestId('paused-go').click()
  await page.getByTestId('speed-3').click()
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'Paused: the soil is ready' })).toHaveCount(0)
  await expect.poll(() => game<string>(page, 'c.season.plantWordBy ?? ""'), { timeout: 30_000, intervals: [100] }).toBe('crew')
  const started = await game<number>(page, 'c.season.plantWord')
  expect(started - asked, 'days from the ask to the crew\'s own start').toBeGreaterThanOrEqual(3)
  expect(started - asked).toBeLessThanOrEqual(7)
  await expect(page.locator('#ui .notes .alert').filter({ hasText: 'Your crew waited 3 days and has started planting on its own.' })).toBeVisible()
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
  await expect(page.locator('#ui .notes .alert').filter({ hasText: /^Planting has started/ })).toBeVisible()
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
  await expect(note(page, 'calls2')).toContainText('The game pauses when the soil is ready, and planting waits for you.')
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
  await expect(goal).toContainText('Nothing to do until blight weather')
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
test('after one Plant stamp gives the word, a press where another stamp stood opens nothing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page)
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.refuse(); const { app } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); app.campaign.incidents = []`)
  await putAway(page)
  await page.getByTestId('goal-faster').click()
  const fit = await atTheAsk(page, 'year one, Skip ahead')
  expect(fit.length).toBeGreaterThan(1)
  const spots: { x: number; y: number }[] = []
  for (const i of fit) { const b = (await page.getByTestId(`badge-${i}`).boundingBox())!; spots.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 }) }
  const tags: { x: number; y: number }[] = []
  for (const i of fit) { const b = (await page.getByTestId(`field-${i}`).boundingBox())!; tags.push({ x: b.x + 20, y: b.y + b.height / 2 }) }
  await page.mouse.click(spots[0].x, spots[0].y)
  await expect.poll(() => game<boolean>(page, 'sim.plantWordGiven(c.season)')).toBe(true)
  // The run of presses a player makes across the stamps, and one on a tag itself.
  for (const s of spots.slice(1)) { await page.waitForTimeout(250); await page.mouse.click(s.x, s.y) }
  await page.mouse.click(tags[tags.length - 1].x, tags[tags.length - 1].y)
  expect(await game<number[]>(page, 'app.selection'), 'no field\'s card opened').toEqual([])
  expect(await game<number>(page, 'app.yard'), 'nor the yard\'s').toBe(0)
  expect(await game<number>(page, 'app.unit')).toBe(-1)
  // A moment later the land answers again.
  await page.waitForTimeout(1900)
  const b = (await page.getByTestId(`field-${fit[0]}`).boundingBox())!
  await page.mouse.click(b.x + 20, b.y + b.height / 2)
  await expect.poll(() => game<number[]>(page, 'app.selection')).toEqual([fit[0]])
  expect(errors, errors.join('\n')).toEqual([])
})
