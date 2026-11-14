// The control rule (docs/UI.md, "Controls: depth and weight"), read off the live game on each of its main papers:
// what can be pressed stands off the paper and what is only read does not; a control's size and edge say what its
// press costs; a destroying control is striped and asks once more; every control has a name and words that can be read.
import { type Page, test } from './base.ts'
import { closeAll, q } from '../tools/quality/shared.ts'
import { expect, open, reach } from './helpers.ts'

test.skip(({ browserName }) => browserName !== 'chromium', 'read in Chromium, at a desk and as a phone')

// How much taller a major key is than a standard one, at least, in px.
const MAJOR_TALLER = 12
const JULY = `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 20000
  c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
  for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })
  app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'accept', offer: 19873 })
  app.do({ t: 'begin' }); q.run(q.day(6, 13)); c.incidents = []`

async function july(page: Page): Promise<void> {
  await reach(page, JULY)
  await closeAll(page)
}

interface Paper { name: string; scope: string; reach: (page: Page) => Promise<void> }
const PAPERS: Paper[] = [
  { name: 'the cover', scope: '#ui', reach: async page => { await reach(page, `q.start(1987, 3); q.run(q.day(5, 1)); q.g().app.quitToTitle()`); await page.getByTestId('continue').waitFor() } },
  { name: "the season screen with a field's card", scope: '#ui', reach: async page => { await july(page); await q(page, `q.g().app.select(2); q.g().app.focus(2)`); await page.getByTestId('card').waitFor() } },
  { name: "a person's card on the land", scope: '#ui', reach: async page => { await july(page); await q(page, `q.g().app.selectUnit(1, 'land')`); await page.getByTestId('whois').waitFor() } },
  { name: "a person's page and the work grid", scope: '#ui', reach: async page => { await july(page); await page.getByTestId('unit-1').click(); await page.getByTestId('grid-open').click(); await page.getByTestId('work-grid').waitFor() } },
  { name: 'the spring plan with the people fold open', scope: '#ui', reach: async page => { await reach(page, `q.g().app.newGame(1987, 3); q.g().app.do({ t: 'hire', kind: 'hand' })`); await page.getByTestId('crew-open').click(); await page.locator('[data-testid^="applicant-hire-"]').first().waitFor() } },
  { name: 'the weigh ticket', scope: '.dig-paper', reach: async page => {
    await reach(page, `q.start(1987, 3); q.run(999, ['sell'], 'lot'); { const a = q.g().app; const s = a.campaign.season; for (let k = 0; k < 12 && !s.fields.some(f => f.weighed); k++) a.do({ t: 'day' }); a.setSpeed(0) }`)
    for (let i = 0; i < 60 && !(await page.getByTestId('weighin').count()); i++) {
      if (await page.locator('.dialog').count()) await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="sample-close"]')?.click())
    await page.locator('.dig-paper .way').first().waitFor({ timeout: 20_000 })
  } },
  { name: 'a telegram', scope: '.telegram', reach: async page => {
    await july(page)
    await q(page, `const { app } = q.g(); const c = app.campaign; c.incidents.push({ id: c.nextIncident++, kind: 'breakdown', day: c.season.day, until: c.season.day + 2, choices: ['rush', 'wait'], unit: 0, back: c.season.day + 3 }); app.setSpeed(1); app.setSpeed(0)`)
    await page.locator('.telegram .reply').first().waitFor()
  } },
  { name: 'winter', scope: '#ui', reach: async page => { await reach(page, `q.start(1987, 3); q.run(999, ['sell']); q.winter(0, 9)`); await closeAll(page); await page.getByTestId('month-next').waitFor() } },
  { name: 'the account book', scope: '#ui', reach: async page => { await reach(page, `q.start(1987, 3); q.year(3)`); await closeAll(page); await page.getByTestId('year-next').waitFor() } },
  { name: 'the menu', scope: '.menu-dialog', reach: async page => { await reach(page, `q.start(1987, 3); q.run(q.day(6, 12))`); await closeAll(page); await page.getByTestId('menu-open').first().click(); await page.getByTestId('save-delete').waitFor() } },
  { name: "the guide's offer", scope: '[data-testid="guide-offer"]', reach: async page => { await reach(page, `window.__countyGuide.reset()`); await page.getByTestId('play').first().click(); await page.getByTestId('guide-offer').waitFor() } },
  { name: 'a step that cannot be undone, asked once more', scope: '[data-testid="confirm"]', reach: async page => { await july(page); await page.getByTestId('menu-open').first().click(); await page.getByTestId('end-season-early').click(); await page.getByTestId('confirm-ok').waitFor() } },
]

interface Found { faults: string[]; controls: number; major: number; filled: number; std: number; minor: number; facts: number; key: number; heights: string[] }

// Runs in the page. Reads every element under the scope and says what breaks the rule.
function audit(o: { scope: string; taller: number }): Found {
  const faults: string[] = []
  const root = document.querySelector(o.scope)
  const out: Found = { faults, controls: 0, major: 0, filled: 0, std: 0, minor: 0, facts: 0, key: 0, heights: [] }
  if (!root) { faults.push(`nothing matches ${o.scope}`); return out }
  const key = parseFloat(getComputedStyle(root).getPropertyValue('--key')) || 40
  out.key = key
  const say = (e: Element) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : ''}${(e as HTMLElement).dataset.testid ? `[${(e as HTMLElement).dataset.testid}]` : ''}`
  const shown = (e: Element): boolean => {
    const el = e as HTMLElement
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    for (let p: HTMLElement | null = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.display === 'none' || cs.visibility === 'hidden' || p.hidden) return false
      if (p.classList.contains('sr') || p.classList.contains('out')) return false
    }
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
  }
  type Shadow = { inset: boolean; x: number; y: number; blur: number; spread: number; clear: boolean }
  const shadows = (v: string): Shadow[] => v === 'none' ? [] : v.split(/,(?![^(]*\))/).map(s => {
    const col = s.match(/rgba?\([^)]*\)/)?.[0] ?? ''
    const n = (s.replace(col, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat)
    return { inset: /\binset\b/.test(s), x: n[0] ?? 0, y: n[1] ?? 0, blur: n[2] ?? 0, spread: n[3] ?? 0, clear: /,\s*0\)$/.test(col) }
  })
  // How far a key stands off the paper: the card's edge under its face, measured above its rim.
  const stands = (e: Element): number => {
    const all = shadows(getComputedStyle(e).boxShadow).filter(s => s.inset && !s.clear && s.x === 0 && s.blur === 0)
    const rim = Math.max(0, ...all.filter(s => s.y === 0).map(s => s.spread))
    const edge = Math.max(0, ...all.filter(s => s.spread === 0 && s.y < 0).map(s => -s.y))
    return Math.max(0, edge - rim)
  }
  const rgb = (v: string): [number, number, number, number] => { const m = v.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [m[0], m[1], m[2], m[3] ?? 1] }
  const lum = ([r, g, b]: number[]) => { const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ground = (e: Element): number[] => {
    for (let p: Element | null = e; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c[3] > 0.9) return c }
    return [246, 241, 228]
  }
  const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const named = (e: Element): string => {
    const el = e as HTMLElement
    const by = el.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ') ?? ''
    const label = el.tagName === 'INPUT' ? (el.closest('label')?.textContent ?? '') : ''
    return (el.getAttribute('aria-label') || by || el.textContent || label || el.title || '').trim()
  }

  const LAND = '.tag, .need, .yard-tag, .pin'
  const isControl = (e: Element) => e.matches('button, a[href], [role="button"], input:not([type="hidden"]), select, summary')
  const controls = [...root.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, summary')].filter(e => e.matches('input') || shown(e))
  const destroying = /^(whois-letgo|person-dismiss|end-season-early|save-delete)$|^dismiss-/
  for (const e of controls) {
    const el = e as HTMLElement
    const at = say(e)
    // A real form input is drawn by the face beside it.
    const face = e.matches('input') && e.getAttribute('type') !== 'range' ? e.nextElementSibling ?? e : e
    if (e.matches('input') && !shown(face)) continue
    out.controls++
    const cs = getComputedStyle(face)
    const off = (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('is-off') || el.classList.contains('is-given')
    const down = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-expanded') === 'true' || el.hasAttribute('aria-current') || /(^| )(is-on|is-picked|on)( |$)/.test(el.className) || (e as HTMLInputElement).checked === true
    if (!named(e)) faults.push(`${at}: no accessible name`)
    if (e.matches('button, a[href]')) {
      const w = el.dataset.w
      if (w !== 'major' && w !== 'std' && w !== 'minor') faults.push(`${at}: no weight (data-w)`)
      if (w === 'major') out.major++; else if (w === 'std') out.std++; else if (w === 'minor') out.minor++
    }
    if (off) {
      if (stands(face) >= 3) faults.push(`${at}: greyed, yet it stands off the paper`)
      if (/pointer$/.test(getComputedStyle(e).cursor)) faults.push(`${at}: greyed, yet the pointer says press`)
      if ((el as HTMLButtonElement).disabled && !el.title && !el.querySelector('.catch') && !el.getAttribute('aria-describedby')) faults.push(`${at}: greyed without a reason`)
      continue
    }
    if (!/pointer$/.test(getComputedStyle(e).cursor)) faults.push(`${at}: pressable, but the pointer does not say so (${getComputedStyle(e).cursor.replace(/url\([^)]*\)/, 'url()')})`)
    const word = cs.textDecorationLine.includes('underline')
    const onLand = e.matches(LAND)
    const range = e.matches('input[type="range"]')
    if (onLand) {
      const lifted = cs.boxShadow !== 'none' || getComputedStyle(el.closest('.tag-at') ?? el).filter !== 'none'
      if (!lifted) faults.push(`${at}: a mark on the land with no shadow under it`)
    } else if (!word && !range) {
      const up = stands(face)
      const rim = shadows(cs.boxShadow).some(s => s.inset && !s.clear && s.spread >= 1 && s.blur === 0) || parseFloat(cs.borderBottomWidth) >= 1
      if (down ? !rim : up < 3) faults.push(`${at}: pressable, but it lies flat on the paper (stands ${up}px)`)
      const w = el.dataset.w
      if (!down && w === 'major' && up < 7) faults.push(`${at}: major, but it stands only ${up}px`)
      if (!down && w === 'std' && e.matches('.btn') && up !== 4) faults.push(`${at}: standard, but it stands ${up}px`)
    }
    // Words on the key can be read against its face.
    if (!onLand) for (const t of [face, ...face.querySelectorAll('*')]) {
      if (!shown(t) || t.closest('.sr') || t instanceof SVGElement) continue
      if (![...t.childNodes].some(n => n.nodeType === 3 && n.nodeValue!.trim())) continue
      const tcs = getComputedStyle(t)
      if (parseFloat(tcs.opacity) < 1) continue
      const c = ratio(rgb(tcs.color), ground(t))
      if (c < 4.5) faults.push(`${at}: "${t.textContent!.trim().slice(0, 24)}" reads at ${c.toFixed(1)}:1 on its face`)
    }
    const w = el.dataset.w
    const h = el.getBoundingClientRect().height
    if (w === 'major') {
      const dark = lum(rgb(getComputedStyle(e).backgroundColor)) < 0.03 && rgb(getComputedStyle(e).backgroundColor)[3] > 0.9
      if (dark || el.classList.contains('is-best')) out.filled++
      if (h < o.taller + key - 0.5) faults.push(`${at}: major, but only ${Math.round(h)}px high beside ${key}px standard keys`)
      if ((destroying.test(el.dataset.testid ?? '') || el.classList.contains('hazard')) && !getComputedStyle(e).borderImageSource.includes('repeating-linear-gradient')) faults.push(`${at}: destroying, without its stripes`)
      out.heights.push(`${el.dataset.testid ?? at} ${Math.round(h)}`)
    } else if (destroying.test(el.dataset.testid ?? '')) faults.push(`${at}: destroying, but not major`)
    // A standard key with one line of words is the same height wherever it is.
    if (w === 'std' && e.matches('.btn') && !word) {
      const lines = new Set<number>()
      const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.nodeValue!.trim() || n.parentElement!.closest('.sr')) continue
        const r = document.createRange(); r.selectNodeContents(n)
        for (const b of r.getClientRects()) lines.add(Math.round((b.top + b.bottom) / 2 / 8))
      }
      if (lines.size <= 1 && Math.abs(h - key) > 0.5) faults.push(`${at}: standard, but ${Math.round(h)}px high where a standard key is ${key}px`)
    }
  }
  if (out.filled > 1) faults.push(`${out.filled} filled major controls on one paper`)

  // What is only read: no key's edge, no pointer that says press.
  for (const e of root.querySelectorAll('*')) {
    if (e instanceof SVGElement && e.tagName !== 'svg') continue
    if (isControl(e) || e.closest('button, a[href], [role="button"], label, summary') || !shown(e)) continue
    if (e.matches('label') || e.querySelector(':scope > input')) continue
    out.facts++
    const cs = getComputedStyle(e)
    if (/pointer$/.test(cs.cursor)) faults.push(`${say(e)}: only read, but the pointer says press`)
    if (stands(e) >= 3) faults.push(`${say(e)}: only read, but it stands off the paper like a key`)
    if ((e as unknown as { __click?: boolean }).__click && !e.matches('.hud, .veil, .shade, .paper-layer, .dialog')) faults.push(`${say(e)}: listens for a press, but is not a button`)
  }
  return out
}

async function check(page: Page, p: Paper): Promise<void> {
  // Which elements were given a click listener, for "nothing but a button is pressed".
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest: unknown[]) {
      if (type === 'click' && this instanceof Element) (this as unknown as { __click?: boolean }).__click = true
      return (add as (...a: unknown[]) => void).call(this, type, ...rest)
    } as typeof add
  })
  await open(page)
  await p.reach(page)
  await page.mouse.move(2, Math.round((page.viewportSize()?.height ?? 600) / 2))
  await page.waitForTimeout(900)
  const found = await page.evaluate(audit, { scope: p.scope, taller: MAJOR_TALLER })
  console.log(`weight: ${p.name}: ${found.controls} controls (${found.major} major, ${found.filled} filled; ${found.std} standard; ${found.minor} minor), ${found.facts} things only read, standard key ${found.key}px; majors ${found.heights.join(', ') || 'none'}; ${found.faults.length} faults`)
  expect(found.faults, found.faults.join('\n')).toEqual([])
  expect(found.controls).toBeGreaterThan(0)
}

for (const p of PAPERS) {
  test(`desk: ${p.name}: what is pressed stands off the paper, by its weight`, async ({ page }) => { await check(page, p) })
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  for (const p of PAPERS) {
    test(`phone: ${p.name}: what is pressed stands off the paper, by its weight`, async ({ page }) => { await check(page, p) })
  }
})

test('a key goes down under the press, a major one furthest, without moving from under the pointer', async ({ page }) => {
  await open(page)
  await reach(page, `q.start(1987, 3); q.run(999, ['sell']); q.winter(0, 9)`)
  await closeAll(page)
  const up = (id: string) => page.getByTestId(id).first().evaluate(e => {
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return { up: cs.getPropertyValue('--w-up').trim(), h: cs.getPropertyValue('--w-h').trim(), recess: cs.getPropertyValue('--w-in').trim(), top: r.top, sound: (e as HTMLElement).dataset.sound ?? '' }
  })
  const major = page.getByTestId('month-next')
  // The screen arrives and the sheet lays itself down first: the key is measured once nothing above it is moving.
  await page.waitForFunction(() => {
    for (let p = document.querySelector('#ui [data-testid="month-next"]'); p; p = p.parentElement) if (p.getAnimations().length) return false
    return true
  })
  const rest = await up('month-next')
  expect(rest).toMatchObject({ up: '6px', h: '6px', sound: 'press' })
  expect((await up('menu-open')).up).toBe('3px')
  // Pressed on its top row of pixels: the edge closes, a shadow as deep as the edge opens, and the key's box stays
  // under the pointer.
  const box = (await major.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 1)
  await page.mouse.down()
  await expect.poll(async () => (await up('month-next')).h).toBe('0px')
  const down = await up('month-next')
  expect(down.recess).toContain('6px')
  expect(down.top).toBe(rest.top)
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="month-next"]'), [box.x + box.width / 2, box.y + 1])).toBe(true)
  // Let go off the key: nothing is pressed, and it stands again.
  await page.mouse.move(2, 2)
  await page.mouse.up()
  await expect.poll(async () => (await up('month-next')).h).toBe('6px')
  await expect(page.getByTestId('month-next')).toBeVisible()
  // A press on the top row of pixels lands: the month turns.
  await page.mouse.click(box.x + box.width / 2, box.y + 1)
  await expect(page.getByTestId('month-next')).toContainText(/January|Jan/i)
})

test('letting someone go asks once more, wherever it is pressed', async ({ page }) => {
  await open(page)
  await reach(page, `q.g().app.newGame(1987, 3); q.g().app.do({ t: 'hire', kind: 'hand' })`)
  const crew = () => page.evaluate(() => (globalThis as unknown as { __county: { app: { campaign: { crew: unknown[] } } } }).__county.app.campaign.crew.length)
  const before = await crew()
  // In spring, from the catalogue's people fold.
  await page.getByTestId('crew-open').click()
  await page.locator('[data-testid^="dismiss-"]').first().click()
  await expect(page.getByTestId('confirm')).toBeVisible()
  await expect(page.getByTestId('confirm-cancel')).toBeFocused()
  await page.getByTestId('confirm-cancel').click()
  expect(await crew()).toBe(before)
  await page.locator('[data-testid^="dismiss-"]').first().click()
  await page.getByTestId('confirm-ok').click()
  await expect.poll(crew).toBe(before - 1)
})

test('the kit shows every weight in every state on every paper', async ({ page }) => {
  await page.goto('./?kit')
  await page.waitForSelector('.kit .k-weights')
  const seen = await page.evaluate(() => [...document.querySelectorAll('.k-weights .k-paper')].map(p => ({
    major: p.querySelectorAll('[data-w="major"]').length, std: p.querySelectorAll('[data-w="std"]').length, minor: p.querySelectorAll('[data-w="minor"]').length,
    filled: p.querySelectorAll('[data-w="major"].go').length, striped: p.querySelectorAll('.hazard').length, on: p.querySelectorAll('[aria-pressed="true"]').length,
    suggested: p.querySelectorAll('.is-suggested').length, busy: p.querySelectorAll('.is-busy').length, greyed: [...p.querySelectorAll<HTMLButtonElement>('button[disabled]')].filter(b => b.title).length,
  })))
  expect(seen).toHaveLength(3)
  for (const s of seen) {
    expect(s).toMatchObject({ on: 1, suggested: 1, striped: 3 })
    expect(s.major).toBeGreaterThanOrEqual(13)
    expect(s.std).toBeGreaterThanOrEqual(9)
    expect(s.minor).toBeGreaterThanOrEqual(7)
    expect(s.filled).toBe(5)
    expect(s.busy).toBe(2)
    expect(s.greyed).toBe(3)
  }
  // The armed key is not the key that is down: the clock is stopped, and 1× is where it goes on from.
  const clock = await page.evaluate(() => {
    const k = [...document.querySelectorAll<HTMLElement>('.k-states .clock .k')]
    return k.map(e => ({ armed: e.classList.contains('armed'), bar: getComputedStyle(e).backgroundImage.includes('repeating-linear-gradient'), face: getComputedStyle(e).backgroundColor }))
  })
  expect(clock.filter(k => k.armed && k.bar)).toHaveLength(1)
  expect(new Set(clock.map(k => k.face)).size).toBeGreaterThanOrEqual(2)
})
