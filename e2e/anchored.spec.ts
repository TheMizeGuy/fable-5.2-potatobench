// Click a thing, and its card opens right there, tied to it, and everything in it acts on that thing: a field by its
// ground and by its tag, a resting field, a tract, the yard and what stands in it, a person on the land and by their
// chip, a machine, a neighbour's thing, an order in the list. At three window sizes and two camera tiers at a desk; on
// a phone the card is a sheet at the foot with a notch toward the thing, which is kept in view above it.
import { mkdirSync } from 'node:fs'
import { test, type Page } from './base.ts'
import { expect, open, putAway, reach, watchErrors } from './helpers.ts'

// (1920 by 1080 and 2560 by 1440 are drawn scaled up, at 125% and 150%: src/ui/scale.ts)
const SIZES = [[1280, 720], [1512, 982], [1920, 1080], [2560, 1440]] as const
const TIERS = ['field', 'farm'] as const
// Pictures of each card open on its thing, when a folder is named for them.
const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

interface Pt { x: number; y: number }
interface Box { left: number; top: number; right: number; bottom: number }
interface Card { id: string; thing: string; side: string; rect: Box; head: string; strangers: string[]; controls: number; end: Pt | null; line: boolean; show: boolean; notch: Pt | null; notched: boolean; onTop: boolean; fits: boolean; cut: boolean; room: number[]; aside: boolean }

// Runs in the page: where things are, what a click there would pick, and which card is up.
const PROBE = `window.__a = {
  F() { return window.__countyField },
  app() { return window.__county.app },
  inWin(p, m = 6) { return !!p && p.x > m && p.y > m && p.x < innerWidth - m && p.y < innerHeight - m },
  free(p) { const e = document.elementFromPoint(p.x, p.y); return !!e && e.tagName === 'CANVAS' },
  pick(p) { return this.F().pickAt(p.x, p.y) },
  quad(i, u, v) {
    const q = this.F().corners(i)
    if (q.length !== 4 || !q.every(c => c.visible)) return null
    const a = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u }, b = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u }
    return { x: a.x + (b.x - a.x) * v, y: a.y + (b.y - a.y) * v }
  },
  fieldSpot(i) {
    for (const [u, v] of [[.5, .5], [.35, .6], [.65, .6], [.5, .75], [.3, .4], [.7, .4], [.5, .3], [.2, .7], [.8, .7], [.5, .15], [.5, .9]]) {
      const p = this.quad(i, u, v)
      if (!this.inWin(p) || !this.free(p)) continue
      const k = this.pick(p)
      if (k.field === i && k.unit < 0 && !k.thing) return p
    }
    return null
  },
  scan(ok, step = 12) {
    const out = []
    for (let y = 16; y < innerHeight - 16; y += step) for (let x = 16; x < innerWidth - 16; x += step) { const p = { x, y }; if (this.free(p)) { const k = this.pick(p); if (ok(k)) out.push({ ...p, k }) } }
    return out
  },
  // The point of a run of points nearest their middle: well inside the thing, not on its rim.
  middleOf(pts) {
    if (!pts.length) return null
    const c = { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length }
    return pts.reduce((b, p) => Math.hypot(p.x - c.x, p.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y) ? p : b)
  },
  // The tag of a field as it stands (with its stamp), or null when it is not on the land.
  tag(i) { const e = document.querySelector('#ui .plate[data-k="field-' + i + '"]'); return this.vis(e) ? this.box(e.closest('.tag-at') || e) : null },
  // A point of a tag that a press would reach (nothing lies over it there), or null.
  tagSpot(i) {
    const e = document.querySelector('#ui .plate[data-k="field-' + i + '"]')
    if (!this.vis(e)) return null
    const r = e.getBoundingClientRect()
    for (const f of [.5, .3, .7, .15, .85, .05, .95]) { const p = { x: r.left + r.width * f, y: r.top + r.height / 2 }; const hit = document.elementFromPoint(p.x, p.y); if (hit && e.contains(hit) && this.inWin(p)) return p }
    return null
  },
  yardSpot(y) { return this.middleOf(this.scan(k => k.yard === y && k.unit < 0 && !k.thing && k.field < 0)) },
  emptySpot() { return this.middleOf(this.scan(k => k.field < 0 && k.unit < 0 && !k.thing && k.yard === 0, 24)) },
  thingSpot(kinds) { const all = this.scan(k => k.unit < 0 && !!k.thing && kinds.includes(k.thing.kind), 6); const one = all[0] ? all.filter(p => p.k.thing.kind === all[0].k.thing.kind && p.k.thing.k === all[0].k.thing.k) : []; const p = this.middleOf(one); return p ? { x: p.x, y: p.y, thing: p.k.thing } : null },
  unitSpot(id) {
    const p = this.F().unitAt(id)
    if (!this.inWin(p, 12)) return null
    const e = document.elementFromPoint(p.x, p.y)
    if (!e || !(e.tagName === 'CANVAS' || e.closest('.pin'))) return null
    if (e.closest('.pin') && !e.closest('[data-testid="pin-' + id + '"]')) return null
    return this.pick(p).unit === id ? p : null
  },
  vis(e) { return e instanceof HTMLElement && !e.hidden && e.offsetParent !== null && !e.closest('[hidden], .out, .leaving, .gone') && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden' },
  box(e) { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } },
  mid(e) { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } },
  rects(sel) { return [...document.querySelectorAll('#ui ' + sel)].filter(e => this.vis(e)).map(e => this.box(e)) },
  // A handle (a tag, a chip) that a press at its middle would reach.
  // (its middle, or the nearest point of it to its middle that nothing lies over: a face pin may stand on a tag)
  handle(sel) {
    const e = document.querySelector('#ui ' + sel)
    if (!this.vis(e)) return null
    const r = e.getBoundingClientRect()
    for (const f of [.5, .3, .7, .15, .85]) {
      const p = { x: r.left + r.width * f, y: r.top + r.height / 2 }
      const hit = document.elementFromPoint(p.x, p.y)
      if (hit && e.contains(hit) && this.inWin(p)) return { ...p, box: this.box(e.closest('.tag-at') || e) }
    }
    return null
  },
  cards() {
    const out = []
    for (const id of ['card', 'yard-card', 'whois', 'person-card', 'thing-card', 'order-card']) {
      const el = document.querySelector('#ui [data-testid="' + id + '"]')
      if (!this.vis(el)) continue
      const r = el.getBoundingClientRect()
      const controls = [...el.querySelectorAll('button, a[href], input, select')].filter(e => this.vis(e))
      const part = n => { const e = document.querySelector('#ui [data-testid="' + n + '-' + id + '"]'); return this.vis(e) ? e : null }
      const end = part('tether-end'), notch = part('notch')
      const top = document.elementFromPoint(Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), Math.min(innerHeight - 2, r.top + 18))
      out.push({
        id, thing: el.dataset.thing || '', side: el.dataset.side || '', rect: this.box(el),
        head: (el.querySelector('header') || el.querySelector('.q-pop-title') || el).textContent || '',
        strangers: controls.filter(b => b.closest('[data-thing]') !== el || /^(card-spray-way|spray-ask-open|spraying-open|rule-|routine-|grid-open|crew-open|speed-)/.test(b.dataset.testid || '')).map(b => b.dataset.testid || b.className),
        controls: controls.length, end: end ? this.mid(end) : null, line: !!part('tether'), show: !!part('show'), notch: notch ? this.mid(notch) : null,
        notched: id === 'order-card' && getComputedStyle(el, '::after').content !== 'none',
        onTop: !!top && el.contains(top),
        // The whole card shows: nothing in it has to be scrolled to, and it was not cut to the room there was.
        fits: [el, ...el.querySelectorAll('[data-scroll]')].every(x => x.scrollHeight <= x.clientHeight + 1), cut: !!el.style.maxHeight,
        room: [el, ...el.querySelectorAll('[data-scroll]')].flatMap(x => [x.scrollHeight, x.clientHeight]),
        aside: el.dataset.aside === '1',
      })
    }
    return out
  },
  up(id, thing) { const c = this.cards().find(x => x.id === id && (!thing || x.thing === thing)); return !!c && !!(c.side || id === 'order-card' || c.notch || innerWidth < 900) },
  // From the next press: how long until the card for the thing stands where it is to stand, measured in the page
  // (frame by frame), in milliseconds.
  // Every line of text a sighted player reads inside a card, and each pair of lines (of different blocks) that lie
  // over one another.
  overlaps(id) {
    const el = document.querySelector('#ui [data-testid="' + id + '"]')
    if (!this.vis(el)) return ['the card is not up']
    const lines = []
    const range = document.createRange()
    for (const e of el.querySelectorAll('*')) {
      if (e.closest('.sr, [hidden], [aria-hidden="true"]') || !this.vis(e)) continue
      const cs = getComputedStyle(e)
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue
      for (const n of e.childNodes) {
        if (n.nodeType !== 3 || !(n.nodeValue || '').trim()) continue
        range.selectNodeContents(n)
        for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) lines.push({ e, r, text: (n.nodeValue || '').trim().slice(0, 28) })
      }
    }
    const out = []
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const p = lines[i], q = lines[j]
      if (p.e === q.e || p.e.contains(q.e) || q.e.contains(p.e)) continue
      // (two runs of one paragraph share its lines: only different blocks count)
      const block = x => x.closest('p, li, button, h2, td, th, dd, dt, header > div') || x
      if (block(p.e) === block(q.e)) continue
      const x = Math.min(p.r.right, q.r.right) - Math.max(p.r.left, q.r.left), y = Math.min(p.r.bottom, q.r.bottom) - Math.max(p.r.top, q.r.top)
      if (x > 2 && y > 3) out.push('"' + p.text + '" over "' + q.text + '" by ' + Math.round(x) + ' x ' + Math.round(y) + ' px')
    }
    return [...new Set(out)].slice(0, 6)
  },
  arm(id, thing) {
    const run = window.__run = {}
    window.__ms = -1
    addEventListener('pointerup', () => {
      const t0 = performance.now()
      const tick = () => { if (window.__run !== run) return; if (this.up(id, thing)) { window.__ms = performance.now() - t0; return } if (performance.now() - t0 < 3000) requestAnimationFrame(tick) }
      tick()
    }, { capture: true, once: true })
  },
  // The time arm() measured, once it has one (-1: the card never came).
  async wait(limit = 1500) {
    const t1 = performance.now()
    while (window.__ms < 0 && performance.now() - t1 < limit) await new Promise(r => requestAnimationFrame(r))
    return Math.round(window.__ms)
  },
  // Without a press to time: until the card for a thing is up (-1: never).
  async shown(id, thing, limit = 1500) {
    const t1 = performance.now()
    while (!this.up(id, thing)) { if (performance.now() - t1 > limit) return -1; await new Promise(r => requestAnimationFrame(r)) }
    return Math.round(performance.now() - t1)
  },
}`

const a = <T>(page: Page, code: string): Promise<T> => page.evaluate(`(() => { const A = window.__a, F = window.__countyField, { app, sim } = window.__county; ${code} })()`) as Promise<T>
const cards = (page: Page) => a<Card[]>(page, 'return A.cards()')
const holds = (b: Box, p: Pt, pad = 0) => p.x > b.left - pad && p.x < b.right + pad && p.y > b.top - pad && p.y < b.bottom + pad
const meets = (x: Box, y: Box) => x.left < y.right - 0.5 && x.right > y.left + 0.5 && x.top < y.bottom - 0.5 && x.bottom > y.top + 0.5
const away = (b: Box, p: Pt) => Math.hypot(Math.max(b.left - p.x, 0, p.x - b.right), Math.max(b.top - p.y, 0, p.y - b.bottom))
const apart = (x: Box, y: Box) => Math.hypot(Math.max(0, x.left - y.right, y.left - x.right), Math.max(0, x.top - y.bottom, y.top - x.bottom))
// In the page: the tether's end lies on a handle as it stands now (a tag in hand stands up a size), give or take the
// width of its pin.
const onHandle = (sel: string) => `const e = document.querySelector('#ui ${sel}'); if (!A.vis(e)) return false; const b = A.box(e.closest('.tag-at') || e); return END.x >= b.left - 8 && END.x <= b.right + 8 && END.y >= b.top - 8 && END.y <= b.bottom + 8`

// A first year with the three who asked for work taken on, into the season, stopped in June with orders on the list.
async function farm(page: Page): Promise<void> {
  await open(page, '?year=1990&seed=7')
  await reach(page, `const { app } = q.g(); const c = app.campaign; c.cash += 30000
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })`)
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('date')).toBeVisible()
  await reach(page, `const { app } = q.g(); app.setSpeed(0); app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(6, 12)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  await page.evaluate(PROBE)
  await page.waitForTimeout(600)
}

async function tier(page: Page, name: string, n?: number): Promise<void> {
  await a(page, `F.tier(${JSON.stringify(name)}${n === undefined ? '' : `, ${n}`}); F.settle()`)
  await page.waitForTimeout(450)
}

async function letGo(page: Page): Promise<void> {
  await a(page, 'app.select(-1); app.selectYard(0); app.selectUnit(-1); app.inspect(null)')
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(280)
  // (Escape with nothing up opens the menu: put it away again)
  if (await page.getByTestId('menu').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(280) }
}

interface Case {
  name: string
  // The card that opens, what it says it is about, and what its head must name.
  card: string
  thing: string
  head: (string | RegExp)[]
  at: Pt
  // The middle of the thing, which the card never covers.
  middle?: Pt | null
  // The handle that was clicked, when it was one; on: it stands on a bar at the foot.
  handle?: Box
  onBar?: boolean
  // In-page checks: the tether's end (END) lies on the thing; the thing is marked on the land.
  ends: string
  marked: string
  // People standing together share a pin that opens to a list of them: the one to press there.
  pick?: string
}

// Clicks the thing and holds its card to the rule.
async function hold(page: Page, k: Case, label: string, close: 'Escape' | 'ground'): Promise<void> {
  const say = (m: string) => `${label}, ${k.name}: ${m}`
  const cam0 = await a<string>(page, 'return JSON.stringify(F.stats().camera)')
  await a(page, `A.arm(${JSON.stringify(k.card)}, ${JSON.stringify(k.thing)})`)
  await page.mouse.click(k.at.x, k.at.y)
  // (named in the list a shared pin opens, the list goes and the card stands beside the person themselves: the rule is
  // held against where they stand, as when they are clicked alone)
  const from = k.at
  if (k.pick) {
    await page.waitForTimeout(80)
    const one = page.getByTestId(k.pick)
    if (await one.isVisible().catch(() => false)) {
      const b = (await one.boundingBox())!
      await a(page, `A.arm(${JSON.stringify(k.card)}, ${JSON.stringify(k.thing)})`)
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    }
  }
  const ms = await a<number>(page, 'return A.wait()')
  expect.soft(ms, say(`its card is up within 300 ms of the click (${ms} ms; cards: ${JSON.stringify((await cards(page)).map(c => `${c.id}:${c.thing}`))})`)).toBeGreaterThanOrEqual(0)
  expect.soft(ms, say('its card is up within 300 ms of the click')).toBeLessThanOrEqual(300)
  if (ms < 0) { await letGo(page); return }
  // (the card finishes laying itself down before it is measured)
  await page.waitForTimeout(380)
  const up = await cards(page)
  const c = up.find(x => x.id === k.card)!
  expect.soft(up.map(x => x.id), say('one card open at a time')).toEqual([k.card])
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label.replace(/[^\w]+/g, '-')}-${k.name.replace(/[^\w]+/g, '-')}.png` })
  const size = page.viewportSize()!
  const win: Box = { left: 0, top: 0, right: size.width, bottom: size.height }
  expect.soft(c.rect.left >= win.left - 0.5 && c.rect.top >= win.top - 0.5 && c.rect.right <= win.right + 0.5 && c.rect.bottom <= win.bottom + 0.5, say(`wholly inside the window (${JSON.stringify(c.rect)})`)).toBe(true)
  expect.soft(c.onTop, say('nothing lies over its head')).toBe(true)
  // Clear of the boards at the top and the bars at the foot (an order's own card stands on its list).
  const bars = await a<Box[]>(page, `return A.rects('.topbar .almanac > .mount, .topbar .bank > .mount, .topbar .goal, .timebook${k.card === 'order-card' ? '' : ', .queue'}')`)
  expect.soft(bars.filter(b => meets(c.rect, b)), say('clear of the top boards and the foot\'s bars')).toEqual([])
  if (k.onBar) {
    // A chip stands in the people bar under the list: its card stands directly over them, above the chip.
    // (or, too tall for the land over the list, beside the list and the bar: then it has stepped aside, whole)
    const tops = bars.filter(b => b.left < c.rect.right && b.right > c.rect.left && b.top > size.height / 2).map(b => b.top)
    if (!c.aside) expect.soft(Math.min(...tops) - c.rect.bottom, say('stands right over the list and the people bar')).toBeLessThanOrEqual(16)
  }
  // Beside what was clicked: the point on the land, or the handle (the tag, the chip, the order) when it was one.
  // Where the land beside it is too short for the whole card (a short window, between the slip under the date board
  // and the people bar), the card steps along that side, clear of the bar, whole and still tied: no further than 190 px,
  // or, for a thing standing over or under one of those bars, than the card's own width (to that bar's end).
  // (a chip stands on the people bar under the work list: its card stands over the list, the list's height further off)
  const reach = c.aside ? (bars.some(b => k.at.x > b.left && k.at.x < b.right) ? Math.max(190, c.rect.right - c.rect.left + 16) : 190) : k.onBar ? 100 : 60
  if (c.aside) expect.soft(c.fits && !c.cut, say('stepped aside from the point, it is whole')).toBe(true)
  if (k.onBar && c.aside) {
    // Beside the very bar its chip stands in, however wide the bar: right at its edge, or at the edge of the work
    // list that lies over the bar when the list is the wider.
    const edges = await a<Box[]>(page, `return A.rects('.timebook, .queue')`)
    expect.soft(edges.some(b => Math.abs(c.rect.left - b.right) <= 16 || Math.abs(b.left - c.rect.right) <= 16), say(`stepped aside, it stands at the edge of the people bar or its work list (card ${JSON.stringify(c.rect)}, bars ${JSON.stringify(edges)})`)).toBe(true)
  } else if (k.handle) expect.soft(apart(c.rect, k.handle), say(`its nearest edge is within ${reach} px of the handle clicked (${Math.round(apart(c.rect, k.handle))} px)`)).toBeLessThanOrEqual(reach)
  else expect.soft(away(c.rect, from), say(`its nearest edge is within ${reach} px of the point clicked (${Math.round(away(c.rect, from))} px)`)).toBeLessThanOrEqual(reach)
  expect.soft(holds(c.rect, from), say('does not cover the point clicked')).toBe(false)
  if (k.handle) expect.soft(meets(c.rect, k.handle), say('does not cover the handle clicked')).toBe(false)
  if (k.middle) expect.soft(holds(c.rect, k.middle), say(`does not cover the middle of the thing (card ${JSON.stringify(Object.values(c.rect).map(Math.round))} ${c.side}${c.aside ? ' aside' : ''}, middle ${JSON.stringify(k.middle)}, clicked ${JSON.stringify(k.at)}, pressed ${JSON.stringify(from)}, handle ${JSON.stringify(k.handle ?? null)}, now ${k.thing.startsWith('person-') ? JSON.stringify(await a(page, `return F.unitAt(${k.thing.slice(7)})`)) : ''})`)).toBe(false)
  expect.soft(c.thing, say('says which thing it is about')).toBe(k.thing)
  for (const h of k.head) {
    if (typeof h === 'string') expect.soft(c.head, say('its head names the thing and what it is')).toContain(h)
    else expect.soft(c.head, say('its head names the thing and what it is')).toMatch(h)
  }
  expect.soft(c.controls, say('has its controls')).toBeGreaterThan(0)
  expect.soft(c.strangers, say('every control in it belongs to that thing')).toEqual([])
  if (k.card === 'order-card') expect.soft(c.notched, say('a notch ties it to its order')).toBe(true)
  else {
    expect.soft(c.end, say('its tether is drawn')).not.toBeNull()
    expect.soft(c.show, say('no Show key while the thing is in the picture')).toBe(false)
    if (c.end) expect.soft(await a<boolean>(page, `const END = ${JSON.stringify(c.end)}; ${k.ends}`), say(`its tether ends on the thing (${JSON.stringify(c.end)})`)).toBe(true)
  }
  expect.soft(await a<boolean>(page, k.marked), say('the thing is marked')).toBe(true)
  // (a press on someone's chip is the one that moves it: the camera goes to them)
  if (k.name !== 'a person\'s chip') expect.soft(await a<string>(page, 'return JSON.stringify(F.stats().camera)'), say('the click moved no camera')).toBe(cam0)
  // Escape, or a click on empty ground, closes it.
  if (close === 'Escape') await page.keyboard.press('Escape')
  else {
    const spot = await a<Pt | null>(page, 'return A.emptySpot()')
    if (spot) await page.mouse.click(spot.x, spot.y)
    else await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(320)
  expect.soft((await cards(page)).map(x => x.id), say(`${close === 'Escape' ? 'Escape' : 'a click on empty ground'} closes it`)).toEqual([])
  await letGo(page)
}

// The kinds of thing, as they stand in this view. A thing out of the picture is brought into it first (its own tier).
async function cases(page: Page, t: string): Promise<{ list: Case[]; missing: string[] }> {
  const list: Case[] = []
  const missing: string[] = []
  const names = await a<string[]>(page, 'return sim.FIELD_NAMES')
  const state = await a<{ potato: number[]; rest: number[]; people: { id: number; name: string }[] }>(page, `const c = app.campaign
    const st = i => sim.fieldInfo(c, i).status
    return { potato: [0, 1, 2, 3, 4, 5].filter(i => st(i) === 'growing' || st(i) === 'planted'), rest: [0, 1, 2, 3, 4, 5].filter(i => st(i) === 'rest'), people: c.crew.filter(u => u.kind !== 'farmer').map(u => ({ id: u.id, name: u.name })) }`)
  const fieldEnds = (i: number) => `return F.pickAt(END.x, END.y).field === ${i}`
  const fieldMarked = (i: number) => `const tag = document.querySelector('#ui .plate[data-k="field-${i}"]'); return app.selection.includes(${i}) && [...document.querySelectorAll('#ui .sel-quad')].some(q => q.style.display !== 'none') && (!A.vis(tag) || tag.getAttribute('aria-pressed') === 'true')`

  // A planted field, by its ground.
  let ground = -1
  for (const i of state.potato) {
    const at = await a<Pt | null>(page, `return A.fieldSpot(${i})`)
    if (!at) continue
    ground = i
    list.push({ name: 'a planted field by its ground', card: 'card', thing: `field-${i}`, head: ['Potato field', names[i]], at, middle: await a<Pt | null>(page, `return A.quad(${i}, .5, .5)`), ends: fieldEnds(i), marked: fieldMarked(i) })
    break
  }
  if (ground < 0) missing.push('a planted field by its ground')
  // Another, by its tag.
  let tagged = -1
  for (const i of state.potato.filter(x => x !== ground)) {
    const hd = await a<(Pt & { box: Box }) | null>(page, `return A.handle('.plate[data-k="field-${i}"]')`)
    if (!hd) continue
    tagged = i
    list.push({ name: 'a planted field by its tag', card: 'card', thing: `field-${i}`, head: ['Potato field', names[i]], at: { x: hd.x, y: hd.y }, handle: hd.box, middle: await a<Pt | null>(page, `return A.quad(${i}, .5, .5)`),
      ends: onHandle(`.plate[data-k="field-${i}"]`), marked: fieldMarked(i) })
    break
  }
  if (tagged < 0) missing.push('a planted field by its tag')
  // A resting field.
  let rested = false
  for (const i of state.rest) {
    // By its ground; far out in a short window its tag can stand over all of its ground, and then by its tag. Its
    // tether ends on its ground or on its own tag, whichever the card was tied to.
    const tag = `.plate[data-k="field-${i}"]`
    const ground = await a<Pt | null>(page, `return A.fieldSpot(${i})`)
    const hd = ground ? null : await a<(Pt & { box: Box }) | null>(page, `return A.handle('${tag}')`)
    const at = ground ?? (hd ? { x: hd.x, y: hd.y } : null)
    if (!at) continue
    rested = true
    const ends = `if ((() => { ${fieldEnds(i)} })()) return true; ${onHandle(tag)}`
    list.push({ name: 'a resting field', card: 'card', thing: `field-${i}`, head: ['Resting field', names[i]], at, handle: hd?.box, middle: await a<Pt | null>(page, `return A.quad(${i}, .5, .5)`), ends, marked: fieldMarked(i) })
    break
  }
  if (!rested) missing.push('a resting field')
  // The home yard, by its tag; and what stands in it, by the land.
  const yardTag = await a<(Pt & { box: Box }) | null>(page, `return A.handle('[data-testid="yard-home"]')`)
  const yardMarked = `const tag = document.querySelector('#ui [data-testid="yard-home"]'); return app.yard === -1 && (!A.vis(tag) || tag.getAttribute('aria-pressed') === 'true')`
  if (yardTag) list.push({ name: 'the home yard by its tag', card: 'yard-card', thing: 'yard-home', head: ['home yard'], at: { x: yardTag.x, y: yardTag.y }, handle: yardTag.box,
    ends: onHandle('[data-testid="yard-home"]'), marked: yardMarked })
  else missing.push('the home yard by its tag')
  const yardAt = await a<Pt | null>(page, 'return A.yardSpot(-1)')
  if (yardAt) list.push({ name: 'a building in the yard', card: 'yard-card', thing: 'yard-home', head: ['home yard'], at: yardAt, ends: 'return F.pickAt(END.x, END.y).yard === -1', marked: yardMarked })
  else missing.push('a building in the yard')
  // A person on the land.
  let walked = false
  for (const p of state.people) {
    const at = await a<Pt | null>(page, `return A.unitSpot(${p.id})`)
    if (!at) continue
    walked = true
    list.push({ name: 'a person on the land', card: 'whois', thing: `person-${p.id}`, head: [p.name, /Field hand|Tractor operator/], at, middle: at,
      ends: `const p = F.unitAt(${p.id}); return !!p && Math.hypot(END.x - p.x, END.y - p.y) <= 40`, pick: `pin-pick-${p.id}`,
      // (their pin stands up with their name on it, where a card does not lie over it; the land rings them besides)
      marked: `const pin = document.querySelector('#ui [data-testid="pin-${p.id}"]'); return app.unit === ${p.id} && app.unitFrom === 'land' && (!A.vis(pin) || pin.getAttribute('aria-pressed') === 'true' || !!pin.querySelector('.name'))` })
    break
  }
  if (!walked) missing.push('a person on the land')
  // A person's chip in the people bar.
  const who = state.people[0]
  const chip = who ? await a<(Pt & { box: Box }) | null>(page, `return A.handle('[data-testid="unit-${who.id}"]')`) : null
  if (chip) list.push({ name: 'a person\'s chip', card: 'person-card', thing: `person-${who.id}`, head: [who.name, /Field hand|Tractor operator/], at: { x: chip.x, y: chip.y }, handle: chip.box, onBar: true,
    ends: onHandle(`[data-testid="unit-${who.id}"]`), marked: `return app.unit === ${who.id} && document.querySelector('#ui [data-testid="unit-${who.id}"]').getAttribute('aria-pressed') === 'true'` })
  else missing.push('a person\'s chip')
  // A machine nobody is on, and a neighbour's thing.
  for (const [name, kinds, head] of [['a machine', ['tractor', 'truck'], /Your (second |third )?(tractor|truck)/], ['a neighbour\'s thing', ['cow', 'deer'], /neighbour|deer/i]] as const) {
    const th = await a<(Pt & { thing: { kind: string; k: number } }) | null>(page, `return A.thingSpot(${JSON.stringify(kinds)})`)
    if (!th) { missing.push(name); continue }
    list.push({ name, card: 'thing-card', thing: `thing-${th.thing.kind}-${th.thing.k}`, head: [head], at: { x: th.x, y: th.y },
      ends: `const k = F.pickAt(END.x, END.y).thing; return !!k && k.kind === ${JSON.stringify(th.thing.kind)}`, marked: `return A.vis(document.querySelector('#ui [data-testid="thing-mark"]'))` })
  }
  // An order in the list.
  const order = await a<(Pt & { box: Box; id: number; what: string }) | null>(page, `const q = [...document.querySelectorAll('#ui .queue .q[data-testid^="queue-"]')].find(e => /^queue-\\d+$/.test(e.dataset.testid) && A.vis(e))
    if (!q) return null
    const j = app.campaign.season.jobs.find(x => x.id === Number(q.dataset.testid.slice(6)))
    return { ...A.mid(q), box: A.box(q), id: j.id, what: sim.FIELD_NAMES[j.field] || '' }`)
  if (order) list.push({ name: 'an order in the list', card: 'order-card', thing: `order-${order.id}`, head: order.what ? [order.what] : [/\w{3,}/], at: { x: order.x, y: order.y }, handle: order.box,
    ends: 'return true', marked: `return document.querySelector('#ui [data-testid="queue-${order.id}"]').getAttribute('aria-expanded') === 'true'` })
  else missing.push('an order in the list')
  void t
  // The chip goes last: its press takes the camera to the person, and the places found above are of this view.
  list.sort((p, q) => Number(p.name === 'a person\'s chip') - Number(q.name === 'a person\'s chip'))
  return { list, missing }
}

for (const [w, h] of SIZES) {
  for (const t of TIERS) {
    test(`a card opens beside the thing clicked, tied to it, ${w} by ${h}, the ${t} tier`, async ({ page, isMobile, browserName }) => {
      test.skip(isMobile || browserName !== 'chromium', 'the desk rule, read through the 3D view\'s hooks')
      test.setTimeout(240_000)
      const errors = watchErrors(page)
      await page.setViewportSize({ width: w, height: h })
      await farm(page)
      // An order on the list, whatever the day left there.
      await a(page, `if (!app.campaign.season.jobs.length) app.do({ t: 'job', kind: 'scout', field: 2 })`)
      await tier(page, t)
      const label = `${w}x${h} ${t}`
      const { list, missing } = await cases(page, t)
      let n = 0
      for (const k of list) await test.step(k.name, () => hold(page, k, label, n++ % 2 ? 'ground' : 'Escape'))
      // A tract of woods stands off the home fields: the camera is put on it, then it is clicked like the rest.
      await a(page, 'app.select(14)')
      await page.waitForTimeout(200)
      await letGo(page)
      await tier(page, 'field', 14)
      const tract = await a<Pt | null>(page, 'return A.fieldSpot(14)')
      if (tract) await test.step('a tract', async () => hold(page, { name: 'a tract', card: 'card', thing: 'field-14', head: ['Woods to clear', 'Home Woodlot'], at: tract, middle: await a<Pt | null>(page, 'return A.quad(14, .5, .5)'),
        ends: 'return F.pickAt(END.x, END.y).field === 14', marked: 'return app.selection.includes(14) && [...document.querySelectorAll("#ui .sel-quad")].some(q => q.style.display !== "none")' }, label, 'Escape'))
      else missing.push('a tract')
      // Every kind of thing was found and held to the rule (a machine with nobody on it and a neighbour's thing are
      // not in every view: the test below finds them).
      expect(missing.filter(m => !/machine|neighbour/.test(m)), `${label}: kinds of thing not found in this view`).toEqual([])
      expect(errors, errors.join('\n')).toEqual([])
    })
  }
}

test('a machine nobody is on and a neighbour\'s thing: each has its card beside it', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'the desk rule, read through the 3D view\'s hooks')
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1512, height: 982 })
  // The season's first day: the tractor stands where it was left, with nobody on it.
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('date')).toBeVisible()
  await reach(page, 'q.g().app.setSpeed(0)')
  await putAway(page)
  await page.evaluate(PROBE)
  const found = new Set<string>()
  for (const t of ['field', 'yard', 'farm'] as const) {
    await tier(page, t)
    const { list } = await cases(page, t)
    let n = 0
    for (const k of list.filter(x => /machine|neighbour/.test(x.name) && !found.has(x.name))) { found.add(k.name); await test.step(`${k.name}, the ${t} tier`, () => hold(page, k, `1512x982 ${t}`, n++ % 2 ? 'ground' : 'Escape')) }
  }
  expect([...found].sort(), 'a machine and a neighbour\'s thing were both found on the land').toEqual(['a machine', 'a neighbour\'s thing'])
})

// The planted potato fields whose tags are on the land, and the one in the middle of them.
async function potatoFields(page: Page): Promise<{ all: { i: number; tag: Box }[]; middle: number }> {
  return a(page, `const c = app.campaign
    const all = [0, 1, 2, 3, 4, 5].filter(i => ['growing', 'planted'].includes(sim.fieldInfo(c, i).status)).map(i => ({ i, tag: A.tag(i) })).filter(x => x.tag)
    const mid = t => ({ x: (t.left + t.right) / 2, y: (t.top + t.bottom) / 2 })
    const cx = all.reduce((t, x) => t + mid(x.tag).x, 0) / all.length, cy = all.reduce((t, x) => t + mid(x.tag).y, 0) / all.length
    const middle = all.slice().sort((p, q) => Math.hypot(mid(p.tag).x - cx, mid(p.tag).y - cy) - Math.hypot(mid(q.tag).x - cx, mid(q.tag).y - cy))[0]
    return { all, middle: middle ? middle.i : -1 }`)
}

// How many of the tags of the two nearest potato fields stand clear of the middle field's card, at the least, in each
// named layout. Two wherever the land has the room. Where it has not, the card (430 by 579 px, never made smaller to
// fit) still takes the place beside the click that hides the fewest tags:
//   1512 by 982, the field tier: Bottom Field's tag stands 200 px under North Ridge's and inside the card's width; a
//     card clear of it would have to end above 733 px and so begin above 154 px, over the cash board (the land begins
//     at 193 px). Upper Middle's tag is clear.
//   the farm tier, both sizes: the six home fields' tags stand within 300 px of each other, less than the card's own
//     width and half its height; no place beside the click is clear of two of them.
const CLEAR: Record<string, Record<'its ground' | 'its tag', number>> = {
  '1920x1080 field': { 'its ground': 2, 'its tag': 2 },
  '1512x982 field': { 'its ground': 1, 'its tag': 1 },
  '1512x982 farm': { 'its ground': 0, 'its tag': 1 },
  '1920x1080 farm': { 'its ground': 0, 'its tag': 1 },
}

for (const [w, h] of [[1512, 982], [1920, 1080]] as const) {
  for (const t of TIERS) {
    test(`a field's card leaves the tags of the fields next to it in reach, ${w} by ${h}, the ${t} tier`, async ({ page, isMobile, browserName }) => {
      test.skip(isMobile || browserName !== 'chromium', 'the desk rule, read through the 3D view\'s hooks')
      test.setTimeout(180_000)
      const errors = watchErrors(page)
      await page.setViewportSize({ width: w, height: h })
      await farm(page)
      await tier(page, t)
      const names = await a<string[]>(page, 'return sim.FIELD_NAMES')
      const { all, middle } = await potatoFields(page)
      expect(all.length, 'the potato fields have their tags on the land').toBeGreaterThanOrEqual(3)
      const mid = (b: Box) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 })
      const home = all.find(x => x.i === middle)!
      // The two potato fields whose tags stand nearest the middle one's.
      const near = all.filter(x => x.i !== middle).sort((p, q) => Math.hypot(mid(p.tag).x - mid(home.tag).x, mid(p.tag).y - mid(home.tag).y) - Math.hypot(mid(q.tag).x - mid(home.tag).x, mid(q.tag).y - mid(home.tag).y)).slice(0, 2)
      for (const how of ['its ground', 'its tag'] as const) {
        const at = await a<Pt | null>(page, how === 'its ground' ? `return A.fieldSpot(${middle})` : `return A.tagSpot(${middle})`)
        expect(at, `${names[middle]} can be clicked by ${how}`).not.toBeNull()
        await page.mouse.click(at!.x, at!.y)
        expect(await a<number>(page, `return A.shown('card', 'field-${middle}')`)).toBeGreaterThanOrEqual(0)
        await page.waitForTimeout(400)
        const c = (await cards(page)).find(x => x.id === 'card')!
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/tags-${w}x${h}-${t}-by-${how.replace(/\W+/g, '-')}.png` })
        // The tags as they stand now (the one in hand stands up a size; the others have not moved).
        const now = await a<{ i: number; tag: Box | null }[]>(page, `return ${JSON.stringify(all.map(x => x.i))}.map(i => ({ i, tag: A.tag(i) }))`)
        const under = now.filter(x => x.i !== middle && x.tag && meets(c.rect, x.tag)).map(x => names[x.i])
        console.log(`${w}x${h} ${t}, ${names[middle]} by ${how}: card ${JSON.stringify(Object.values(c.rect).map(Math.round))} on the ${c.side}; potato tags under it: ${under.length ? under.join(', ') : 'none'}; nearest two: ${near.map(x => names[x.i]).join(', ')}`)
        const clear = near.filter(x => !under.includes(names[x.i])).length
        expect.soft(clear, `${w}x${h} ${t}, ${names[middle]} by ${how}: of the tags of the two nearest potato fields, ${CLEAR[`${w}x${h} ${t}`][how]} at least are not under its card (under it: ${under.join(', ') || 'none'})`).toBeGreaterThanOrEqual(CLEAR[`${w}x${h} ${t}`][how])
        // Still beside what was clicked, whole, and tied.
        expect.soft(c.aside, `${names[middle]} by ${how}: the card has not stepped away from what was clicked`).toBe(false)
        expect.soft(how === 'its ground' ? away(c.rect, at!) : apart(c.rect, (await a<Box>(page, `return A.tag(${middle})`))), `${names[middle]} by ${how}: the card is still within 60 px of what was clicked`).toBeLessThanOrEqual(60)
        expect.soft(c.end, `${names[middle]} by ${how}: its tether is drawn`).not.toBeNull()
        // A tag the card does lie over: a press on the part of it that shows, or on that field's ground, still takes
        // the card to that field (one card at a time).
        const hidden = now.find(x => x.i !== middle && x.tag && under.includes(names[x.i]))
        if (hidden) {
          const spot = await a<Pt | null>(page, `return A.tagSpot(${hidden.i}) || A.fieldSpot(${hidden.i})`)
          if (spot) {
            await page.mouse.click(spot.x, spot.y)
            expect.soft(await a<number>(page, `return A.shown('card', 'field-${hidden.i}')`), `a click on what shows of ${names[hidden.i]} moves the card to it`).toBeGreaterThanOrEqual(0)
            expect.soft((await cards(page)).map(x => x.id), 'one card at a time').toEqual(['card'])
            await letGo(page)
            await page.mouse.click(at!.x, at!.y)
            expect(await a<number>(page, `return A.shown('card', 'field-${middle}')`)).toBeGreaterThanOrEqual(0)
            await page.waitForTimeout(300)
          }
        }
        // A tag the card does not lie over is reached by a press, and the card goes to that field.
        const next = near.find(x => !under.includes(names[x.i]))
        if (next) {
          const spot = await a<Pt | null>(page, `return A.tagSpot(${next.i})`)
          if (spot) {
            await page.mouse.click(spot.x, spot.y)
            expect.soft(await a<number>(page, `return A.shown('card', 'field-${next.i}')`), `a click on ${names[next.i]}'s tag moves the card to it`).toBeGreaterThanOrEqual(0)
            expect.soft((await cards(page)).map(x => x.id), 'one card at a time').toEqual(['card'])
          }
        }
        await letGo(page)
      }
      expect(errors, errors.join('\n')).toEqual([])
    })
  }
}

for (const [w, h] of [[1280, 720], [1366, 768]] as const) {
  test(`a planted field's whole card fits a short window without scrolling, ${w} by ${h}`, async ({ page, isMobile, browserName }) => {
    test.skip(isMobile || browserName !== 'chromium', 'the desk rule, read through the 3D view\'s hooks')
    test.setTimeout(240_000)
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await farm(page)
    expect(await page.getByTestId('date').textContent(), 'a day in July').toMatch(/July/i)
    const names = await a<string[]>(page, 'return sim.FIELD_NAMES')
    let tried = 0
    for (const t of TIERS) {
      await tier(page, t)
      const { all } = await potatoFields(page)
      for (const f of all) {
        for (const how of ['its ground', 'its tag'] as const) {
          const at = await a<Pt | null>(page, how === 'its ground' ? `return A.fieldSpot(${f.i})` : `return A.tagSpot(${f.i})`)
          if (!at) continue
          tried++
          const say = (m: string) => `${w}x${h} ${t}, ${names[f.i]} by ${how}: ${m}`
          await page.mouse.click(at.x, at.y)
          expect(await a<number>(page, `return A.shown('card', 'field-${f.i}')`), say('its card opens')).toBeGreaterThanOrEqual(0)
          await page.waitForTimeout(400)
          const c = (await cards(page)).find(x => x.id === 'card')!
          if (SHOTS && tried <= 4) await page.screenshot({ path: `${SHOTS}/fits-${w}x${h}-${t}-${names[f.i].replace(/\W+/g, '-')}-by-${how.replace(/\W+/g, '-')}.png` })
          // The nine orders, the crew's line and the readings: all of it in view.
          await expect.soft(page.locator('#ui [data-testid="card"] .orders.slots > .order'), say('its nine orders')).toHaveCount(9)
          await expect.soft(page.getByTestId('card-whose'), say('whose work is whose')).toBeVisible()
          await expect.soft(page.getByTestId('blight-reading'), say('its readings')).toBeVisible()
          expect.soft(c.fits, say(`nothing in it has to be scrolled to (scroll and client heights ${c.room.join(', ')})`)).toBe(true)
          expect.soft(c.cut, say('it was not cut to the room there was')).toBe(false)
          expect.soft(c.rect.left >= -0.5 && c.rect.top >= -0.5 && c.rect.right <= w + 0.5 && c.rect.bottom <= h + 0.5, say(`its box lies inside the window (${JSON.stringify(c.rect)})`)).toBe(true)
          const boards = await a<Box[]>(page, `return A.rects('.topbar .almanac > .mount, .topbar .bank > .mount, .topbar .goal')`)
          expect.soft(boards.filter(b => meets(c.rect, b)), say('clear of the date board, the cash board and the slip under it')).toEqual([])
          // The last reading's last line is inside the card's box, not under its edge.
          const last = await a<Box | null>(page, `const ps = document.querySelectorAll('#ui [data-testid="card"] .readings p'); return ps.length ? A.box(ps[ps.length - 1]) : null`)
          expect.soft(!!last && last.bottom <= c.rect.bottom + 0.5 && last.top >= c.rect.top, say('its last reading is inside the card')).toBe(true)
          await letGo(page)
        }
      }
    }
    expect(tried, 'planted fields were opened by their ground and by their tags').toBeGreaterThanOrEqual(6)
    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('clicking another thing moves the card; Shift adds a field to it; the card goes with its thing and waits at the edge with Show', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'the desk rule, read through the 3D view\'s hooks')
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1512, height: 982 })
  await farm(page)
  await tier(page, 'farm')
  const names = await a<string[]>(page, 'return sim.FIELD_NAMES')
  const spots = await a<{ i: number; at: Pt }[]>(page, `return [0, 1, 2, 3, 4, 5].map(i => ({ i, at: A.fieldSpot(i) })).filter(x => x.at)`)
  expect(spots.length).toBeGreaterThanOrEqual(3)
  // A second field, where the first one's card does not lie: the card moves to it. And a third, where the second
  // one's card does not lie, to add with Shift. Far out a card lies over more of the farm than a field does, so the
  // three are taken in an order a player could click them in.
  // (the second and third are potato fields, which can take the order given to both below; a resting field takes none)
  const free = async (not: number[]) => (await a<{ i: number; at: Pt }[]>(page, `return [0, 1, 2, 3, 4, 5].filter(i => ['growing', 'planted'].includes(sim.fieldInfo(app.campaign, i).status)).map(i => ({ i, at: A.fieldSpot(i) })).filter(x => x.at)`)).find(x => !not.includes(x.i))
  let second: { i: number; at: Pt } | undefined, third: { i: number; at: Pt } | undefined
  let c = await cards(page)
  pick: for (const one of spots) {
    const tried: number[] = []
    for (;;) {
      await page.mouse.click(one.at.x, one.at.y)
      expect(await a<number>(page, `return A.shown('card', 'field-${one.i}')`)).toBeGreaterThanOrEqual(0)
      await page.waitForTimeout(380)
      const next = await free([one.i, ...tried])
      if (!next) break
      await page.mouse.click(next.at.x, next.at.y)
      expect(await a<number>(page, `return A.shown('card', 'field-${next.i}')`)).toBeGreaterThanOrEqual(0)
      await page.waitForTimeout(380)
      c = await cards(page)
      expect(c.map(x => x.id)).toEqual(['card'])
      expect(c[0].head).toContain(names[next.i])
      expect(away(c[0].rect, next.at)).toBeLessThanOrEqual(60)
      second = next
      third = await free([one.i, next.i])
      if (third) break pick
      console.log(`${names[one.i]}, then ${names[next.i]}: no third potato field's ground shows beside its card`)
      tried.push(next.i)
      await letGo(page)
    }
    await letGo(page)
  }
  expect(second, 'a second field is in reach beside the first one\'s card').toBeTruthy()
  // Shift-click a third: one card, named for the fields, tied to the one last clicked; an order goes to all of them.
  expect(third, 'a third field is in reach').toBeTruthy()
  const two = second!, three = third!
  await page.keyboard.down('Shift')
  await page.mouse.click(three.at.x, three.at.y)
  await page.keyboard.up('Shift')
  expect(await a<number>(page, `return A.shown('card', 'fields-${two.i}+${three.i}')`)).toBeGreaterThanOrEqual(0)
  await page.waitForTimeout(380)
  c = await cards(page)
  expect(c.map(x => x.id)).toEqual(['card'])
  await expect(page.getByTestId('card-title')).toHaveText('2 fields')
  expect(away(c[0].rect, three.at), 'tied to the field last clicked').toBeLessThanOrEqual(60)
  expect(c[0].end && await a<boolean>(page, `return F.pickAt(${c[0].end!.x}, ${c[0].end!.y}).field === ${three.i}`)).toBe(true)
  const before = await a<number>(page, `return app.campaign.season.jobs.filter(j => j.kind === 'scout' && [${two.i}, ${three.i}].includes(j.field)).length`)
  await a(page, `for (const j of [...app.campaign.season.jobs]) if (j.kind === 'scout') app.do({ t: 'cancel', id: j.id })`)
  await page.keyboard.press('c')
  await expect.poll(() => a<number>(page, `return app.campaign.season.jobs.filter(j => j.kind === 'scout' && [${two.i}, ${three.i}].includes(j.field)).length`), { message: `walk ordered on both fields (${before} before)` }).toBe(2)
  // A person clicked: the field's card gives way to theirs.
  const who = await a<{ id: number; at: Pt } | null>(page, `for (const u of app.campaign.crew) { const at = A.unitSpot(u.id); if (at) return { id: u.id, at } } return null`)
  if (who) {
    await page.mouse.click(who.at.x, who.at.y)
    // (standing with someone, they share a pin that opens to a list of them: they are named there)
    await page.waitForTimeout(80)
    const row = page.getByTestId(`pin-pick-${who.id}`)
    if (await row.isVisible().catch(() => false)) await row.click()
    expect(await a<number>(page, `return A.shown('whois', 'person-${who.id}')`), `person ${who.id} clicked at ${JSON.stringify(who.at)}: ${JSON.stringify(await a(page, `return { at: F.unitAt(${who.id}), pick: F.pickAt(${who.at.x}, ${who.at.y}), unit: app.unit, from: app.unitFrom, cards: A.cards().map(c => c.id + ':' + c.thing), top: String((document.elementFromPoint(${who.at.x}, ${who.at.y}) || {}).className) }`))}`).toBeGreaterThanOrEqual(0)
    await page.waitForTimeout(380)
    expect((await cards(page)).map(x => x.id)).toEqual(['whois'])
  }
  await letGo(page)
  // One field in hand, by its ground: the camera is zoomed and panned, and the card goes with the point clicked.
  await tier(page, 'field')
  const at = (await a<{ i: number; at: Pt }[]>(page, `return [3, 0, 1, 2, 4, 5].map(i => ({ i, at: A.fieldSpot(i) })).filter(x => x.at)`))[0]
  await page.mouse.click(at.at.x, at.at.y)
  expect(await a<number>(page, `return A.shown('card', 'field-${at.i}')`)).toBeGreaterThanOrEqual(0)
  await page.mouse.move(at.at.x - 40, at.at.y + 60)
  await page.mouse.wheel(0, 240)
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(350)
  await page.keyboard.up('ArrowLeft')
  await page.waitForTimeout(1400)
  c = await cards(page)
  expect(c.map(x => x.id)).toEqual(['card'])
  expect(c[0].end, 'the tether is still drawn').not.toBeNull()
  expect(Math.hypot(c[0].end!.x - at.at.x, c[0].end!.y - at.at.y), 'the point clicked moved on the screen with the camera').toBeGreaterThan(12)
  expect(await a<boolean>(page, `return F.pickAt(${c[0].end!.x}, ${c[0].end!.y}).field === ${at.i}`), 'the tether still ends on the field').toBe(true)
  expect(away(c[0].rect, c[0].end!), 'the card is still beside the point').toBeLessThanOrEqual(60)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1512x982-moved-with-the-camera.png` })
  // The field carried out of the picture: the card waits at an edge with Show, and Show brings the field back.
  await tier(page, 'field', 13)
  await page.waitForTimeout(500)
  c = await cards(page)
  expect(c.map(x => x.id)).toEqual(['card'])
  expect(c[0].show, 'the Show key is up while the field is out of the picture').toBe(true)
  expect(c[0].end, 'no tether to a thing out of the picture').toBeNull()
  const size = page.viewportSize()!
  expect(c[0].rect.left >= 0 && c[0].rect.top >= 0 && c[0].rect.right <= size.width && c[0].rect.bottom <= size.height, 'the card is still wholly in the window').toBe(true)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1512x982-out-of-the-picture.png` })
  await page.getByTestId('show-card').click()
  await expect.poll(async () => (await cards(page))[0]?.show, { timeout: 5000 }).toBe(false)
  await expect.poll(async () => !!(await cards(page))[0]?.end, { timeout: 5000 }).toBe(true)
  expect(errors, errors.join('\n')).toEqual([])
})

// A farm with a second person, in its first May, as a player has it a few clicks in: two orders in the work list.
async function twoPeople(page: Page): Promise<void> {
  await open(page, '?year=1990&seed=7')
  await reach(page, `q.g().app.do({ t: 'hire', kind: 'hand' })`)
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('date')).toBeVisible()
  // Paused the way a player pauses: with Space. Nothing in this test resumes it until it says so.
  await page.keyboard.press('Space')
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __county: { app: { speed: number } } }).__county.app.speed)).toBe(0)
  await putAway(page)
  await page.evaluate(PROBE)
}

// Two orders in the work list and a toast at the foot, as they stood when the player clicked.
async function listAndToast(page: Page): Promise<void> {
  const n = await a<number>(page, `const c = app.campaign
    for (const j of [...c.season.jobs]) app.do({ t: 'cancel', id: j.id })
    for (const [kind, field] of [['plant', 0], ['plant', 2], ['plant', 4], ['plant', 5], ['scout', 0], ['scout', 2]]) { if (c.season.jobs.length >= 2) break; app.do({ t: 'job', kind, field }) }
    app.notice('Planting has started in South Ridge.')
    return c.season.jobs.length`)
  expect(n, 'two orders are on the work list').toBeGreaterThanOrEqual(2)
  await expect(page.locator('#ui .queue .q[data-testid^="queue-"]').first()).toBeVisible()
  await expect(page.locator('#ui [data-testid="notice"], #ui .notes .alert').first()).toBeVisible()
}

for (const [w, h] of [[1280, 800], [1280, 720]] as const) {
  test(`a person's card opened from their chip is whole, paused and running, ${w} by ${h}`, async ({ page, isMobile, browserName }) => {
    test.skip(isMobile || browserName !== 'chromium', 'the desk rule')
    test.setTimeout(180_000)
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await twoPeople(page)
    const people = await a<{ id: number; name: string }[]>(page, `return app.campaign.crew.map(u => ({ id: u.id, name: u.kind === 'farmer' ? 'You' : u.name.split(' ')[0] }))`)
    expect(people.length).toBe(2)
    for (const state of ['paused', 'running'] as const) {
      if (state === 'running') {
        await page.getByTestId('speed-1').click()
        await expect.poll(() => a<number>(page, 'return app.speed')).toBe(1)
      } else expect(await a<number>(page, 'return app.speed'), 'still paused: never resumed since the pause').toBe(0)
      for (const p of people) {
        await listAndToast(page)
        const say = (m: string) => `${w}x${h}, ${state}, ${p.name}'s chip: ${m}`
        const chip = page.getByTestId(`unit-${p.id}`)
        await chip.click()
        expect(await a<number>(page, `return A.shown('person-card', 'person-${p.id}')`), say('their card opens')).toBeGreaterThanOrEqual(0)
        await page.waitForTimeout(450)
        const c = (await cards(page)).find(x => x.id === 'person-card')!
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/chip-${w}x${h}-${state}-${p.name}.png` })
        expect.soft(c.fits, say(`nothing in it has to be scrolled to (scroll and client heights ${c.room.join(', ')})`)).toBe(true)
        expect.soft(c.cut, say('it was not cut to the room there was')).toBe(false)
        expect.soft(c.rect.bottom - c.rect.top, say('it stands at its whole height')).toBeGreaterThanOrEqual(c.room[0] - 1)
        expect.soft(c.rect.left >= -0.5 && c.rect.top >= -0.5 && c.rect.right <= w + 0.5 && c.rect.bottom <= h + 0.5, say(`its box lies inside the window (${JSON.stringify(c.rect)})`)).toBe(true)
        // The name and every control: inside the card's box and the window.
        const out = await a<string[]>(page, `const el = document.querySelector('#ui [data-testid="person-card"]'); const r = el.getBoundingClientRect()
          return [el.querySelector('[data-testid="person-name"]'), ...el.querySelectorAll('button')].filter(x => x && A.vis(x)).filter(x => { const b = x.getBoundingClientRect(); return b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5 || b.left < r.left - 0.5 || b.right > r.right + 0.5 || b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth }).map(x => x.dataset.testid || x.className)`)
        expect.soft(out, say('the name and every control are inside it and the window')).toEqual([])
        await expect.soft(page.getByTestId('person-name'), say('names them')).toContainText(p.name === 'You' ? 'You' : p.name)
        const bars = await a<Box[]>(page, `return A.rects('.timebook, .queue, .topbar .almanac > .mount, .topbar .bank > .mount')`)
        expect.soft(bars.filter(b => meets(c.rect, b)), say('not over the people bar, the work list or the boards')).toEqual([])
        expect.soft(c.end, say('its tether is drawn')).not.toBeNull()
        // The tether's line crosses no key that is not its own chip: it stops at the bar's edge, its pin on the chip.
        const crossed = await a<string[]>(page, `const line = document.querySelector('#ui [data-testid="tether-person-card"]')
          if (!A.vis(line)) return []
          const l = line.getBoundingClientRect()
          return [...document.querySelectorAll('#ui .timebook button, #ui .queue button')].filter(b => A.vis(b) && b.dataset.testid !== 'unit-${p.id}').filter(b => { const r = b.getBoundingClientRect(); return l.left < r.right - 1 && l.right > r.left + 1 && l.top < r.bottom - 1 && l.bottom > r.top + 1 }).map(b => b.dataset.testid || b.className)`)
        expect.soft(crossed, say('its tether crosses no other key')).toEqual([])
        await chip.click()
        await page.waitForTimeout(300)
        expect.soft((await cards(page)).map(x => x.id), say('a second press on the chip puts the card away')).toEqual([])
      }
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
}

for (const [w, h] of [[1280, 800], [1280, 720], [1512, 982]] as const) {
  test(`hovering a stamp never prints one text over another in a field's card, ${w} by ${h}`, async ({ page, isMobile, browserName }) => {
    test.skip(isMobile || browserName !== 'chromium', 'a pointer over a stamp')
    test.setTimeout(180_000)
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await farm(page)
    const names = await a<string[]>(page, 'return sim.FIELD_NAMES')
    const { all } = await potatoFields(page)
    let stamps = 0
    for (const f of all.slice(0, 2)) {
      const at = await a<Pt | null>(page, `return A.tagSpot(${f.i}) || A.fieldSpot(${f.i})`)
      if (!at) continue
      await page.mouse.click(at.x, at.y)
      expect(await a<number>(page, `return A.shown('card', 'field-${f.i}')`)).toBeGreaterThanOrEqual(0)
      await page.waitForTimeout(400)
      expect.soft(await a<string[]>(page, `return A.overlaps('card')`), `${w}x${h}, ${names[f.i]}: no text over another before any stamp is pointed at`).toEqual([])
      // The corner is read once the card has come to rest (the camera may still be easing the land, and the card
      // goes with its field): two readings alike.
      let corner = (await cards(page)).find(x => x.id === 'card')!.rect
      for (let k = 0; k < 40; k++) {
        await page.waitForTimeout(150)
        const next = (await cards(page)).find(x => x.id === 'card')!.rect
        const same = next.left === corner.left && next.top === corner.top
        corner = next
        if (same) break
      }
      expect.soft([corner.left % 1, corner.top % 1], `${w}x${h}, ${names[f.i]}: the card lies on whole pixels`).toEqual([0, 0])
      const ids = await a<string[]>(page, `return [...document.querySelectorAll('#ui [data-testid="card"] .orders .order')].filter(b => A.vis(b)).map(b => b.dataset.testid)`)
      for (const id of ids) {
        const b = (await page.locator(`#ui [data-testid="card"] [data-testid="${id}"]`).boundingBox())!
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
        await page.waitForTimeout(140)
        stamps++
        const over = await a<string[]>(page, `return A.overlaps('card')`)
        if (over.length && SHOTS) await page.screenshot({ path: `${SHOTS}/hover-${w}x${h}-${names[f.i].replace(/\W+/g, '-')}-${id}.png` })
        expect.soft(over, `${w}x${h}, ${names[f.i]}, the pointer over ${id}: no text printed over another`).toEqual([])
        // The stamps hold their places while the pointer moves over them: the next one is where it was aimed at.
        const now = (await cards(page)).find(x => x.id === 'card')!.rect
        expect.soft([Math.round(now.left), Math.round(now.top)], `${w}x${h}, ${names[f.i]}, the pointer over ${id}: the card's corner holds`).toEqual([Math.round(corner.left), Math.round(corner.top)])
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/hover-${w}x${h}-${names[f.i].replace(/\W+/g, '-')}.png` })
      await page.mouse.move(4, h / 2)
      await letGo(page)
    }
    expect(stamps, 'stamps were pointed at').toBeGreaterThanOrEqual(9)
    expect(errors, errors.join('\n')).toEqual([])
  })
}

// ---------------------------------------------------------------- nothing opens unasked; the yard's card; a person's card

// The cards and sheets that are up now, each with the thing it is about.
async function upNow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const vis = (e: Element | null): e is HTMLElement => e instanceof HTMLElement && !e.hidden && e.offsetParent !== null && !e.closest('[hidden], .out, .leaving') && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().height > 0
    for (const id of ['card', 'yard-card', 'whois', 'person-card', 'thing-card', 'sample-dialog', 'work-grid']) {
      const el = document.querySelector<HTMLElement>(`#ui [data-testid="${id}"]`)
      if (vis(el)) out.push(`${id}:${el.dataset.thing ?? ''}`)
    }
    return out
  })
}

interface Guided { note: string; target: string; keys: string[]; telegram: boolean; spray: boolean; ticket: string; phase: string; day: number; speed: number }
async function guidedNow(page: Page): Promise<Guided> {
  return page.evaluate(() => {
    const { app } = (globalThis as unknown as { __county: { app: { campaign: { phase: string; season?: { day: number } } | null; speed: number } } }).__county
    const ui = document.getElementById('ui')!
    const vis = (e: Element | null): e is HTMLElement => e instanceof HTMLElement && !e.closest('[hidden], .leaving, .out, .gone') && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden'
    const slip = [...ui.querySelectorAll<HTMLElement>('[data-testid="guide-slip"]')].find(vis) ?? null
    const sell = ui.querySelector<HTMLElement>('.paper-layer [data-testid^="lot-sell-"]')
    return {
      note: slip?.dataset.lesson ?? '', target: slip?.dataset.target ?? '', keys: slip ? [...slip.querySelectorAll<HTMLElement>('button')].filter(vis).map(b => b.dataset.testid ?? '') : [],
      telegram: vis(ui.querySelector('.season-screen .telegram')), spray: vis(ui.querySelector('[data-testid="spray-way-auto"]')), ticket: sell && vis(sell) ? sell.dataset.testid! : '',
      phase: app.campaign?.phase ?? 'title', day: app.campaign?.season?.day ?? -1, speed: app.speed,
    }
  })
}

// A guided first year followed as a newcomer follows it: only what each note asks, its skips ahead (which run at 8×)
// taken. at: called once when each note is first read. Ends at the first weigh ticket, or when `at` says so.
// Whenever it looks, no card or sheet is up that the run did not open itself.
async function guidedYear(page: Page, at: (note: string) => Promise<boolean | void>): Promise<string[]> {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'))
  await page.getByTestId('play').click()
  await page.getByTestId('guide-accept').click()
  const did: string[] = []
  const mine = new Set<string>()
  let quiet = 0
  const until = Date.now() + 600_000
  while (Date.now() < until) {
    const s = await guidedNow(page)
    const up = await upNow(page)
    if (!up.length) mine.clear()
    expect.soft(up.filter(x => !mine.has(x.split(':')[1])), `nothing is open that the player did not open, after ${did.slice(-5).join(' > ')} (day ${s.day})`).toEqual([])
    if (s.ticket) { did.push('ticket'); break }
    if (s.note) {
      if (did[did.length - 1] !== s.note) {
        did.push(s.note)
        await page.waitForTimeout(500)
        if (await at(s.note)) break
        continue
      }
      // A tip is never pressed: one that only tells goes by itself. What a tip points at to be done is done, as a
      // player would: the stamp, the key that skips a wait, the key that runs the days.
      if (s.target.startsWith('badge-') || ['goal-faster', 'paused-go', 'speed-0', 'speed-toggle', 'speed-2', 'speed-3', 'speed-cycle', 'end-season'].includes(s.target)) await page.locator(`#ui [data-testid="${s.target}"]`).first().click().catch(() => {})
      await page.waitForTimeout(250)
      continue
    }
    if (s.telegram) {
      did.push(s.spray ? 'spraying' : 'telegram')
      if (s.spray) await page.getByTestId('spray-way-auto').click().catch(() => {})
      else await page.locator('#ui .season-screen .telegram .reply.first').first().click().catch(() => {})
      await page.waitForTimeout(200)
      continue
    }
    // Nothing asked: the player passes the wait with the key the game offers for it, or sets the days going.
    const clock = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('#ui [data-testid="goal-faster"]'); return { speed: (globalThis as any).__county.app.speed as number, skip: !!e && e.offsetParent !== null } })
    if (++quiet >= 6) {
      quiet = 0
      if (clock.skip && clock.speed < 3) await page.locator('#ui [data-testid="goal-faster"]').first().click().catch(() => {})
      else if (clock.speed === 0) await page.keyboard.press('Space')
    }
    await page.waitForTimeout(250)
  }
  return did
}

// The yard's card held to its rule: no row cuts its words, what cannot be paid for is said once, its head and cross
// are in view, it lies inside the window and off the tutorial's note.
async function yardHolds(page: Page, label: string): Promise<void> {
  await page.evaluate(PROBE)
  let at = await a<Pt | null>(page, 'return A.yardSpot(-1)')
  if (!at) { await tier(page, 'yard'); at = await a<Pt | null>(page, 'return A.yardSpot(-1)') }
  expect(at, `${label}: the home yard is on the land to click`).not.toBeNull()
  await page.mouse.click(at!.x, at!.y)
  expect(await a<number>(page, `return A.shown('yard-card', 'yard-home')`), `${label}: the yard's card opens`).toBeGreaterThanOrEqual(0)
  // (the card laid, and the note given its moment to step off a card that had nowhere else to be)
  await page.waitForTimeout(900)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/yard-${label.replace(/\W+/g, '-')}.png` })
  const size = page.viewportSize()!
  const seen = await a<{ rect: Box; rows: string[]; said: number; once: number; head: boolean; note: Box | null; scroll: number[]; cut: string[] }>(page, `const el = document.querySelector('#ui [data-testid="yard-card"]')
    const rows = [...el.querySelectorAll('.orders .order')]
    const inWin = b => b.top >= -0.5 && b.left >= -0.5 && b.bottom <= innerHeight + 0.5 && b.right <= innerWidth + 0.5
    const close = el.querySelector('[data-testid="yard-close"]'), title = el.querySelector('[data-testid="yard-title"]')
    const cr = close.getBoundingClientRect()
    const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2)
    const note = [...document.querySelectorAll('#ui [data-testid="guide-slip"]')].find(n => A.vis(n))
    const body = el.querySelector('.card-body')
    return {
      rect: A.box(el),
      // a row whose words are taller than its box, run out of it, or run under the key's lower edge (8 px of it)
      rows: rows.filter(r => r.scrollHeight > r.clientHeight + 1 || [...r.querySelectorAll('.name, .cost, .catch')].some(x => { const b = x.getBoundingClientRect(), rb = r.getBoundingClientRect(); return b.height > 0 && (b.bottom > rb.bottom - 7.5 || b.top < rb.top - 0.5) })).map(r => r.dataset.testid),
      said: rows.filter(r => /bank won't lend/.test(r.textContent)).length,
      once: el.querySelectorAll('[data-testid="yard-short"]').length,
      head: inWin(cr) && inWin(title.getBoundingClientRect()) && !!hit && close.contains(hit),
      note: note ? A.box(note) : null,
      scroll: body ? [body.scrollHeight, body.clientHeight] : [],
      // a row the card's own edge cuts through (in view in part): only whole rows or rows scrolled out of sight
      cut: [],
    }`)
  expect.soft(seen.rows, `${label}: no row of the yard's card has words taller than its box`).toEqual([])
  expect.soft(seen.said, `${label}: no row repeats why the bank will not pay`).toBe(0)
  expect.soft(seen.once, `${label}: what the yard is short of is said once, at the head`).toBe(1)
  expect.soft(seen.head, `${label}: its name and its cross are in view, and the cross can be pressed`).toBe(true)
  expect.soft(seen.rect.left >= -0.5 && seen.rect.top >= -0.5 && seen.rect.right <= size.width + 0.5 && seen.rect.bottom <= size.height + 0.5, `${label}: the card lies inside the window (${JSON.stringify(seen.rect)})`).toBe(true)
  expect.soft(seen.note, `${label}: the tutorial's note is up`).not.toBeNull()
  if (seen.note) expect.soft(meets(seen.rect, seen.note), `${label}: the card does not lie over the tutorial's note (card ${JSON.stringify(seen.rect)}, note ${JSON.stringify(seen.note)})`).toBe(false)
  const boards = await a<Box[]>(page, `return A.rects('.topbar .almanac > .mount, .topbar .bank > .mount, .timebook')`)
  expect.soft(boards.filter(b => meets(seen.rect, b)), `${label}: clear of the boards and the people bar`).toEqual([])
  // Scrolled to its foot, the last building's row is whole too.
  if (seen.scroll.length && seen.scroll[0] > seen.scroll[1] + 1) {
    await a(page, `const b = document.querySelector('#ui [data-testid="yard-card"] .card-body'); b.scrollTop = b.scrollHeight`)
    await page.waitForTimeout(150)
    const last = await a<boolean>(page, `const el = document.querySelector('#ui [data-testid="yard-card"]'); const rows = el.querySelectorAll('.orders .order'); const r = rows[rows.length - 1].getBoundingClientRect(), c = el.getBoundingClientRect(); return r.bottom <= c.bottom + 0.5 && r.top >= c.top`)
    expect.soft(last, `${label}: scrolled inside itself, the last row is whole and inside the card`).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/yard-${label.replace(/\W+/g, '-')}-foot.png` })
  }
  await page.getByTestId('yard-close').click()
  await page.waitForTimeout(350)
  expect.soft(await upNow(page), `${label}: its cross closes it`).toEqual([])
}

test('a guided first year to the first weigh ticket: nothing opens that the player did not open, and the yard\'s card holds its rows, 1280 by 800', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'a desk window')
  test.setTimeout(900_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  let yard = false
  const did = await guidedYear(page, async note => {
    // With a tip up that only tells (planting day's), as a player had it: a click in the yard.
    if (note === 'plantday' && !yard) { yard = true; await yardHolds(page, '1280x800 guided') }
  })
  console.log(`followed: ${did.join(' > ')}`)
  expect(yard, 'the tip about planting day came up, and the yard was opened under it').toBe(true)
  expect(did[did.length - 1], `the run reached the first weigh ticket (${did.join(' > ')})`).toBe('ticket')
  expect(errors, errors.join('\n')).toEqual([])
})

test('the yard\'s card holds its rows and keeps off the tutorial\'s note, 1280 by 720', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'a desk window')
  test.setTimeout(600_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  let yard = false
  await guidedYear(page, async note => {
    if (note !== 'plantday') return false
    yard = true
    await yardHolds(page, '1280x720 guided')
    return true
  })
  expect(yard, 'the tip about planting day came up, and the yard was opened under it').toBe(true)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a test dig is offered, not laid over the land; a telegram hides an open tray and gives it back; a person\'s page does not come back by itself', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'a desk window')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await farm(page)
  expect(await upNow(page)).toEqual([])
  // The crew lifts a test hill: nothing opens. A slip at the foot offers it.
  await reach(page, `const { app } = q.g(); app.do({ t: 'job', kind: 'sample', field: 2 }); app.do({ t: 'bump', id: app.campaign.season.jobs.at(-1).id }); app.do({ t: 'day' }); app.setSpeed(0)`)
  const offer = page.locator('#ui [data-testid="alert"]', { hasText: 'test dig' })
  await expect(offer).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  expect(await upNow(page), 'the test dig\'s tray is not laid by itself').toEqual([])
  await expect(offer).toContainText('Show me')
  await offer.click()
  const tray = page.getByTestId('sample-dialog')
  await expect(tray).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tray-asked-for.png` })
  // A telegram comes: it holds the floor alone, and the tray is back as it was when it is answered.
  await reach(page, `const { app, sim } = q.g(); const c = app.campaign
    const p = sim.applicantsFor(c.seed, c.year, new Set(c.crew.map(u => u.name)), 1, c.season.day)[0]
    c.incidents.push({ id: c.nextIncident++, kind: 'applicant', day: c.season.day, until: c.season.day + 4, choices: ['hire', 'pass'], applicant: p })
    app.setSpeed(1); app.setSpeed(0)`)
  const wire = page.getByTestId('incident')
  await expect(wire).toBeVisible()
  await page.waitForTimeout(300)
  expect(await upNow(page), 'nothing else is up with the telegram').toEqual([])
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/telegram-alone.png` })
  await wire.getByTestId('answer-pass').click()
  await expect(wire).toBeHidden()
  await reach(page, 'q.g().app.setSpeed(0)')
  await expect(tray).toBeVisible()
  // Closed by the player, it stays closed: the next days and the next test dig do not bring it back.
  await page.getByTestId('sample-close').click()
  await expect(tray).toHaveCount(0)
  await reach(page, `const { app } = q.g(); app.do({ t: 'job', kind: 'sample', field: 0 }); app.do({ t: 'bump', id: app.campaign.season.jobs.at(-1).id }); app.do({ t: 'day' }); app.do({ t: 'day' }); app.setSpeed(0)`)
  await page.waitForTimeout(1800)
  expect(await upNow(page), 'a second test dig lays nothing by itself').toEqual([])
  // A person's page, then a field by its number: the field's card takes its place (orders there go to them). The
  // field's card put away, nothing is left open, and nobody is left picked.
  await putAway(page)
  await page.getByTestId('unit-1').click()
  await expect(page.getByTestId('person-card')).toBeVisible()
  await page.keyboard.press('Digit3')
  await expect(page.getByTestId('card')).toBeVisible()
  await expect(page.getByTestId('person-card')).toBeHidden()
  await page.getByTestId('card-close').click()
  await page.waitForTimeout(500)
  expect(await upNow(page), 'the person\'s page does not come back when the field\'s card is closed').toEqual([])
  expect(await a<number>(page, 'return app.unit'), 'nobody is left picked with no card to say so').toBe(-1)
  // The same from the land: someone clicked, then a field, then the field's card closed.
  const who = await a<{ id: number; at: Pt } | null>(page, `for (const u of app.campaign.crew) { const at = A.unitSpot(u.id); if (at) return { id: u.id, at } } return null`)
  if (who) {
    await page.mouse.click(who.at.x, who.at.y)
    const pick = page.getByTestId(`pin-pick-${who.id}`)
    await page.waitForTimeout(100)
    if (await pick.isVisible().catch(() => false)) await pick.click()
    await expect(page.getByTestId('whois')).toBeVisible()
    await page.keyboard.press('Digit3')
    await expect(page.getByTestId('card')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    expect(await upNow(page), 'their card does not come back when the field\'s card is closed').toEqual([])
    // And a click on them opens it again, as ever.
    const again = await a<Pt | null>(page, `return A.unitSpot(${who.id})`)
    if (again) {
      await page.mouse.click(again.x, again.y)
      await page.waitForTimeout(100)
      if (await pick.isVisible().catch(() => false)) await pick.click()
      await expect(page.getByTestId('whois')).toBeVisible()
    }
  }
  expect(errors, errors.join('\n')).toEqual([])
})

for (const [w, h] of [[1280, 800], [1280, 720]] as const) {
  test(`a hired hand's card is whole from their chip, from the land and from the grid, ${w} by ${h}`, async ({ page, isMobile, browserName }) => {
    test.skip(isMobile || browserName !== 'chromium', 'a desk window')
    test.setTimeout(240_000)
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await farm(page)
    const hands = await a<{ id: number; name: string }[]>(page, `return app.campaign.crew.filter(u => u.kind !== 'farmer').map(u => ({ id: u.id, name: u.name }))`)
    expect(hands.length).toBeGreaterThanOrEqual(2)
    // Whole: at its own height, nothing to scroll to, its name and every key inside it and the window.
    const whole = async (id: string, thing: string, must: string[], how: string) => {
      expect(await a<number>(page, `return A.shown(${JSON.stringify(id)}, ${JSON.stringify(thing)})`), `${w}x${h}, ${how}: the card opens`).toBeGreaterThanOrEqual(0)
      await page.waitForTimeout(450)
      const c = (await cards(page)).find(x => x.id === id)!
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/hand-${w}x${h}-${how.replace(/\W+/g, '-')}.png` })
      expect.soft(c.fits && !c.cut, `${w}x${h}, ${how}: nothing in it has to be scrolled to, and it was not cut (heights ${c.room.join(', ')})`).toBe(true)
      expect.soft(c.rect.left >= -0.5 && c.rect.top >= -0.5 && c.rect.right <= w + 0.5 && c.rect.bottom <= h + 0.5, `${w}x${h}, ${how}: inside the window (${JSON.stringify(c.rect)})`).toBe(true)
      expect.soft(c.onTop, `${w}x${h}, ${how}: nothing lies over its head (${JSON.stringify(c.rect)})`).toBe(true)
      const out = await a<string[]>(page, `const el = document.querySelector('#ui [data-testid="${id}"]'); const r = el.getBoundingClientRect()
        const keys = [...el.querySelectorAll('button')].filter(x => A.vis(x))
        const bad = keys.filter(x => { const b = x.getBoundingClientRect(); return b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5 || b.left < r.left - 0.5 || b.right > r.right + 0.5 || b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth }).map(x => { const b = x.getBoundingClientRect(); return (x.dataset.testid || x.className) + ' at ' + [b.left, b.top, b.right, b.bottom].map(n => Math.round(n * 10) / 10).join(',') + ' in ' + [r.left, r.top, r.right, r.bottom].map(n => Math.round(n * 10) / 10).join(',') })
        const have = new Set(keys.map(x => x.dataset.testid))
        return [...bad, ...${JSON.stringify(must)}.filter(k => !have.has(k)).map(k => 'missing ' + k)]`)
      expect.soft(out, `${w}x${h}, ${how}: every key is inside it and the window, ${must.join(' and ')} among them`).toEqual([])
      const bars = await a<Box[]>(page, `return A.rects('.timebook, .queue, .topbar .almanac > .mount, .topbar .bank > .mount')`)
      expect.soft(bars.filter(b => meets(c.rect, b)), `${w}x${h}, ${how}: off the bars and the boards`).toEqual([])
    }
    // From their chip in the people bar.
    const p = hands[0]
    await page.getByTestId(`unit-${p.id}`).click()
    await whole('person-card', `person-${p.id}`, ['person-foreman', 'person-dismiss', 'person-raise'], 'from the chip')
    await letGo(page)
    // From the land: on their body or their pin.
    await tier(page, 'field')
    let on: { id: number; at: Pt } | null = null
    for (const t of ['field', 'farm', 'yard']) {
      await tier(page, t)
      on = await a<{ id: number; at: Pt } | null>(page, `for (const id of ${JSON.stringify(hands.map(x => x.id))}) { const at = A.unitSpot(id); if (at) return { id, at } } return null`)
      if (on) break
    }
    expect(on, 'a hired hand is on the land to click').not.toBeNull()
    await page.mouse.click(on!.at.x, on!.at.y)
    await page.waitForTimeout(100)
    const pick = page.getByTestId(`pin-pick-${on!.id}`)
    if (await pick.isVisible().catch(() => false)) await pick.click()
    await whole('whois', `person-${on!.id}`, ['whois-letgo', 'whois-more', 'whois-follow'], 'from the land')
    // Details, from that card: their whole page, the Foreman key with it.
    await page.getByTestId('whois-more').click()
    await whole('person-card', `person-${on!.id}`, ['person-foreman', 'person-dismiss'], 'from Details')
    await letGo(page)
    // From the grid of who does what.
    await page.keyboard.press('g')
    await expect(page.getByTestId('work-grid')).toBeVisible()
    await page.waitForTimeout(400)
    await page.getByTestId(`grid-person-${p.id}`).click()
    await whole('person-card', `person-${p.id}`, ['person-foreman', 'person-dismiss'], 'from the grid')
    const grid = (await page.getByTestId('work-grid').boundingBox())!
    const c = (await cards(page)).find(x => x.id === 'person-card')!
    expect.soft(meets(c.rect, { left: grid.x, top: grid.y, right: grid.x + grid.width, bottom: grid.y + grid.height }), `${w}x${h}, from the grid: the card does not lie over the grid it was opened from`).toBe(false)
    expect(errors, errors.join('\n')).toEqual([])
  })
}

for (const [w, h] of [[1280, 720], [1366, 768]] as const) {
  test(`in spring a field's record is given a middle of use: 200 px of it or all of it, ${w} by ${h}`, async ({ page, isMobile, browserName }) => {
    test.skip(isMobile || browserName !== 'chromium', 'a desk window')
    test.setTimeout(180_000)
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await open(page, '?year=1990&seed=7')
    await page.evaluate(PROBE)
    // (the land at rest: the opening's move to the farm is over before a tag is aimed at)
    await a(page, 'F.settle()')
    await page.waitForTimeout(500)
    const names = await a<string[]>(page, 'return sim.FIELD_NAMES')
    const potato = await a<number[]>(page, `return [0, 1, 2, 3, 4, 5].filter(i => app.campaign.plans[i].crop === 'potato')`)
    expect(potato.length).toBeGreaterThanOrEqual(3)
    for (const f of potato) {
      // By its tag where a press reaches it, and by its number as the keys pick it.
      for (const how of ['its tag', 'its number'] as const) {
        const at = how === 'its tag' ? await a<Pt | null>(page, `return A.tagSpot(${f})`) : null
        if (how === 'its tag' && !at) continue
        if (at) await page.mouse.click(at.x, at.y)
        else await a(page, `app.select(${f})`)
        const card = page.getByTestId('plan-card')
        await expect(card).toBeVisible()
        // Read once it has come to rest beside its field.
        let last = ''
        for (let k = 0; k < 30; k++) {
          await page.waitForTimeout(200)
          const now = JSON.stringify(await card.boundingBox())
          if (now === last) break
          last = now
        }
        const say = (m: string) => `${w}x${h}, ${names[f]} by ${how}: ${m}`
        const seen = await a<{ rect: Box; mid: number[]; head: boolean; foot: boolean; sheet: Box | null; point: boolean }>(page, `const el = document.querySelector('#ui [data-testid="plan-card"]'), m = el.querySelector('[data-testid="record-scroll"]')
          const inside = x => { if (!x) return false; const b = x.getBoundingClientRect(), r = el.getBoundingClientRect(); return b.height > 0 && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5 }
          const sheet = document.querySelector('#ui [data-testid="spring"]')
          return { rect: A.box(el), mid: m ? [m.clientHeight, m.scrollHeight] : [], head: inside(el.querySelector('[data-testid="card-title"]')) && inside(el.querySelector('[data-testid="card-close"]')), foot: inside(el.querySelector('[data-testid="record-foot"]')), sheet: sheet ? A.box(sheet) : null, point: false }`)
        if (SHOTS && how === 'its number') await page.screenshot({ path: `${SHOTS}/record-${w}x${h}-${names[f].replace(/\W+/g, '-')}.png` })
        expect.soft(seen.mid.length, say('it has a middle that scrolls between its head and its seed')).toBe(2)
        expect.soft(seen.mid[0] >= 200 || seen.mid[1] <= seen.mid[0] + 1, say(`its middle is 200 px tall or whole (${seen.mid[0]} px of ${seen.mid[1]})`)).toBe(true)
        expect.soft(seen.head && seen.foot, say('its head, its cross and its seed are in view')).toBe(true)
        expect.soft(seen.rect.left >= -0.5 && seen.rect.top >= -0.5 && seen.rect.right <= w + 0.5 && seen.rect.bottom <= h + 0.5, say(`inside the window (${JSON.stringify(seen.rect)})`)).toBe(true)
        if (seen.sheet) expect.soft(meets(seen.rect, seen.sheet), say('off the Spring sheet')).toBe(false)
        const boards = await a<Box[]>(page, `return A.rects('.topbar .almanac > .mount, .topbar .bank > .mount')`)
        expect.soft(boards.filter(b => meets(seen.rect, b)), say('off the boards')).toEqual([])
        if (at) expect.soft(holds(seen.rect, at), say('not over the point clicked')).toBe(false)
        // Scrolled to its end, the last variety is in view in the middle (nothing is lost under the notes after it).
        const end = await a<boolean>(page, `const m = document.querySelector('#ui [data-testid="record-scroll"]'); m.scrollTop = m.scrollHeight; const r = m.getBoundingClientRect(), l = [...m.querySelectorAll('.vbox')].pop().getBoundingClientRect(); return l.bottom <= r.bottom + 1 && l.bottom > r.top`)
        expect.soft(end, say('scrolled to its end, the last variety is in view')).toBe(true)
        await page.keyboard.press('Escape')
        await expect(card).toBeHidden()
      }
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
}

for (const [w, h] of [[1280, 800], [1280, 720]] as const) {
  test(`a hired hand's card keeps its head in view: its name, its cross and the way to them never scroll or cut away, ${w} by ${h}`, async ({ page, isMobile, browserName }) => {
    test.skip(isMobile || browserName !== 'chromium', 'a desk window')
    test.setTimeout(300_000)
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await farm(page)
    // As a player had it: the goal slip under the date board, and four orders in the work list over the people bar.
    await a(page, `const c = app.campaign; for (const j of [...c.season.jobs]) app.do({ t: 'cancel', id: j.id }); for (const f of [0, 2, 4, 5]) app.do({ t: 'job', kind: 'scout', field: f })`)
    await expect(page.getByTestId('goal')).toBeVisible()
    await expect(page.locator('#ui .queue .q[data-testid^="queue-"]')).toHaveCount(4)
    const hands = await a<{ id: number; name: string }[]>(page, `return app.campaign.crew.filter(u => u.kind !== 'farmer').map(u => ({ id: u.id, name: u.name }))`)
    // What is in view of a card: inside its box and the window, with nothing lying over its middle.
    const inView = (id: string, keys: string[]) => a<string[]>(page, `const el = document.querySelector('#ui [data-testid="${id}"]'); const r = el.getBoundingClientRect()
      return ${JSON.stringify(keys)}.filter(k => { const x = el.querySelector('[data-testid="' + k + '"]'); if (!x || !A.vis(x)) return true
        const b = x.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
        return b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5 || b.top < 0 || b.bottom > innerHeight + 0.5 || b.left < 0 || b.right > innerWidth + 0.5 || !hit || !(x.contains(hit) || hit.contains(x)) })`)
    const head = async (id: string, keys: string[], how: string) => {
      const out = await inView(id, keys)
      expect.soft(out, `${w}x${h}, ${how}: ${keys.join(', ')} are in view, in the card and the window, with nothing over them`).toEqual([])
      const c = (await cards(page)).find(x => x.id === id)!
      const over = await a<Box[]>(page, `return A.rects('.topbar .almanac > .mount, .topbar .bank > .mount, .topbar .goal, .timebook')`)
      expect.soft(over.filter(b => meets(c.rect, b)), `${w}x${h}, ${how}: the card is not under the slip, the boards or the people bar`).toEqual([])
      expect.soft(c.rect.top >= -0.5 && c.rect.bottom <= h + 0.5 && c.rect.left >= -0.5 && c.rect.right <= w + 0.5, `${w}x${h}, ${how}: inside the window (${JSON.stringify(c.rect)})`).toBe(true)
    }
    // A hand's whole page: the Foreman key is asked for, and its choices open; the head stays.
    const page2 = async (id: number, name: string, how: string) => {
      expect(await a<number>(page, `return A.shown('person-card', 'person-${id}')`), `${w}x${h}, ${how}: the card opens`).toBeGreaterThanOrEqual(0)
      await page.waitForTimeout(500)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/head-${w}x${h}-${how.replace(/\W+/g, '-')}.png` })
      await head('person-card', ['person-name', 'person-close', 'person-show'], how)
      await expect.soft(page.getByTestId('person-name'), `${w}x${h}, ${how}: names them`).toHaveText(name)
      // The Foreman key: in view at once, or after the body under the head is scrolled, the head still in view.
      const reach = async () => {
        if (!(await inView('person-card', ['person-foreman'])).length) return true
        await a(page, `const k = document.querySelector('#ui [data-testid="person-card"] [data-testid="person-foreman"]'); const b = k.closest('[data-scroll]'); if (b) b.scrollTop = b.scrollHeight`)
        await page.waitForTimeout(150)
        return !(await inView('person-card', ['person-foreman'])).length
      }
      expect.soft(await reach(), `${w}x${h}, ${how}: the Foreman key can be reached`).toBe(true)
      await head('person-card', ['person-name', 'person-close', 'person-show'], `${how}, with the Foreman key in view`)
      // Asked for: its choices open, are ringed and brought into view (the card's own help scrolls for them).
      await page.getByTestId('person-foreman').click()
      await expect(page.getByTestId('foreman-home')).toBeVisible()
      await page.waitForTimeout(1300)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/head-${w}x${h}-${how.replace(/\W+/g, '-')}-foreman.png` })
      await head('person-card', ['person-name', 'person-close', 'person-show'], `${how}, the foreman's choices open`)
      expect.soft(await inView('person-card', ['foreman-home', 'person-foreman', 'person-dismiss', 'person-raise']), `${w}x${h}, ${how}: the foreman's choices and the keys at the foot are in view`).toEqual([])
      // Whatever scrolls the card itself (as the help once did) cannot carry its head away.
      await a(page, `const el = document.querySelector('#ui [data-testid="person-card"]'); el.scrollTop = 9999; el.querySelector('[data-testid="person-dismiss"]').scrollIntoView({ block: 'end' })`)
      await page.waitForTimeout(200)
      await head('person-card', ['person-name', 'person-close', 'person-show'], `${how}, after the card is asked to scroll`)
      await page.getByTestId('person-foreman').click()
      await page.waitForTimeout(200)
    }
    for (const p of hands) {
      await page.getByTestId(`unit-${p.id}`).click()
      await page2(p.id, p.name, `${p.name.split(' ')[0]} from the chip`)
      await letGo(page)
    }
    // From the land.
    let on: { id: number; at: Pt } | null = null
    for (const t of ['field', 'farm', 'yard']) {
      await tier(page, t)
      on = await a<{ id: number; at: Pt } | null>(page, `for (const id of ${JSON.stringify(hands.map(x => x.id))}) { const at = A.unitSpot(id); if (at) return { id, at } } return null`)
      if (on) break
    }
    expect(on, 'a hired hand is on the land to click').not.toBeNull()
    await page.mouse.click(on!.at.x, on!.at.y)
    await page.waitForTimeout(100)
    const pick = page.getByTestId(`pin-pick-${on!.id}`)
    if (await pick.isVisible().catch(() => false)) await pick.click()
    expect(await a<number>(page, `return A.shown('whois', 'person-${on!.id}')`)).toBeGreaterThanOrEqual(0)
    await page.waitForTimeout(500)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/head-${w}x${h}-from-the-land.png` })
    await head('whois', ['whois-name', 'whois-close', 'whois-follow', 'whois-more', 'whois-letgo'], 'from the land')
    await a(page, `const el = document.querySelector('#ui [data-testid="whois"]'); el.scrollTop = 9999; el.querySelector('[data-testid="whois-letgo"]').scrollIntoView({ block: 'end' })`)
    await page.waitForTimeout(200)
    await head('whois', ['whois-name', 'whois-close', 'whois-follow'], 'from the land, after the card is asked to scroll')
    await page.getByTestId('whois-more').click()
    await page2(on!.id, hands.find(x => x.id === on!.id)!.name, 'from Details on the land')
    await letGo(page)
    // From the grid.
    await page.keyboard.press('g')
    await expect(page.getByTestId('work-grid')).toBeVisible()
    await page.waitForTimeout(400)
    await page.getByTestId(`grid-person-${hands[0].id}`).click()
    await page2(hands[0].id, hands[0].name, 'from the grid')
    expect(errors, errors.join('\n')).toEqual([])
  })
}

for (const [w, h] of [[1440, 900], [1280, 800], [1280, 720]] as const) {
  test(`every key of a person's page can be pressed, and its body stays where the wheel put it, ${w} by ${h}`, async ({ page, isMobile, browserName }) => {
    test.skip(isMobile || browserName !== 'chromium', 'a desk window')
    test.setTimeout(420_000)
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await farm(page)
    // One of the hands worked to the bone: their page has the most to say, and Rest is the key that matters.
    await a(page, 'app.campaign.crew[1].tired = 0.97; app.do({ t: "priority", unit: app.campaign.crew[1].id, work: "pack", level: app.campaign.crew[1].prio.pack })')
    const hands = await a<{ id: number; name: string }[]>(page, `return app.campaign.crew.filter(u => u.kind !== 'farmer').map(u => ({ id: u.id, name: u.name.split(' ')[0] }))`)
    // Every key the card shows can be pressed as a player presses it: Playwright's own test of a click (in view after
    // scrolling to it, holding still, nothing over it), without the press.
    const pressable = async (id: string, how: string) => {
      const keys = await a<string[]>(page, `return [...document.querySelectorAll('#ui [data-testid="${id}"] button')].filter(b => A.vis(b) && !b.disabled).map(b => b.dataset.testid)`)
      expect(keys.length, `${w}x${h}, ${how}: the card has its keys`).toBeGreaterThanOrEqual(5)
      const stuck: string[] = []
      for (const k of keys) {
        const ok = await page.locator(`#ui [data-testid="${id}"] [data-testid="${k}"]`).click({ trial: true, timeout: 3000 }).then(() => true, () => false)
        if (!ok) stuck.push(k)
      }
      if (stuck.length) {
        console.log(`${w}x${h}, ${how}: ` + await a<string>(page, `const el = document.querySelector('#ui [data-testid="${id}"]'); const r = x => { if (!x) return null; const b = x.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }
          const body = el.querySelector(':scope > .card-body'); return JSON.stringify({ card: r(el), max: el.style.maxHeight, side: el.dataset.side, aside: el.dataset.aside, head: r(el.querySelector(':scope > header')), body: r(body), bodyScroll: body ? [body.scrollHeight, body.clientHeight, body.scrollTop] : null, foot: r(el.querySelector(':scope > .card-foot')) })`))
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/keys-${w}x${h}-${how.replace(/\W+/g, '-')}.png` })
      }
      expect.soft(stuck, `${w}x${h}, ${how}: every key can be pressed (of ${keys.join(', ')})`).toEqual([])
      return keys
    }
    // The body between the head and the foot: wheeled down, it stays there through two seconds of the game's updates.
    const wheeled = async (id: string, how: string) => {
      const body = page.locator(`#ui [data-testid="${id}"] > .card-body`)
      const room = await body.evaluate(b => [b.scrollHeight, b.clientHeight])
      if (room[0] <= room[1] + 1) return
      const b = (await body.boundingBox())!
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await page.mouse.wheel(0, 60)
      await page.waitForTimeout(250)
      const put = await body.evaluate(x => x.scrollTop)
      expect.soft(put, `${w}x${h}, ${how}: the body scrolls under the wheel`).toBeGreaterThan(0)
      await a(page, 'app.setSpeed(1)')
      await page.waitForTimeout(2000)
      await a(page, 'app.setSpeed(0); app.campaign.incidents = []')
      await page.waitForTimeout(300)
      expect.soft(await body.evaluate(x => x.scrollTop), `${w}x${h}, ${how}: after two seconds of the game the body is where the wheel put it`).toBe(put)
      // A whole row of keys shows at once in the body.
      expect.soft(room[1], `${w}x${h}, ${how}: the body has room for a row of keys and the line over it (${room[1]} px)`).toBeGreaterThanOrEqual(72)
    }
    for (const p of hands) {
      await page.getByTestId(`unit-${p.id}`).click()
      expect(await a<number>(page, `return A.shown('person-card', 'person-${p.id}')`)).toBeGreaterThanOrEqual(0)
      await page.waitForTimeout(500)
      const keys = await pressable('person-card', `${p.name} from the chip`)
      for (const must of ['person-rest-now', 'person-foreman', 'person-dismiss', 'person-close']) expect.soft(keys, `${w}x${h}, ${p.name} from the chip`).toContain(must)
      await wheeled('person-card', `${p.name} from the chip`)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/keys-${w}x${h}-${p.name}-from-the-chip-after.png` })
      await letGo(page)
    }
    // Beside someone on the land.
    let on: { id: number; at: Pt } | null = null
    for (const t of ['field', 'farm', 'yard']) {
      await tier(page, t)
      on = await a<{ id: number; at: Pt } | null>(page, `for (const id of ${JSON.stringify(hands.map(x => x.id))}) { const at = A.unitSpot(id); if (at) return { id, at } } return null`)
      if (on) break
    }
    expect(on, 'a hired hand is on the land to click').not.toBeNull()
    await page.mouse.click(on!.at.x, on!.at.y)
    await page.waitForTimeout(100)
    const pick = page.getByTestId(`pin-pick-${on!.id}`)
    if (await pick.isVisible().catch(() => false)) await pick.click()
    expect(await a<number>(page, `return A.shown('whois', 'person-${on!.id}')`)).toBeGreaterThanOrEqual(0)
    await page.waitForTimeout(500)
    const keys = await pressable('whois', 'from the land')
    for (const must of ['whois-rest-now', 'whois-follow', 'whois-letgo', 'whois-close']) expect.soft(keys, `${w}x${h}, from the land`).toContain(must)
    await wheeled('whois', 'from the land')
    await letGo(page)
    // From the grid of who does what.
    await page.keyboard.press('g')
    await expect(page.getByTestId('work-grid')).toBeVisible()
    await page.waitForTimeout(400)
    for (const p of hands.slice(0, 2)) {
      await page.getByTestId(`grid-person-${p.id}`).click()
      expect(await a<number>(page, `return A.shown('person-card', 'person-${p.id}')`)).toBeGreaterThanOrEqual(0)
      await page.waitForTimeout(500)
      await pressable('person-card', `${p.name} from the grid`)
      await wheeled('person-card', `${p.name} from the grid`)
    }
    // With the grid still open, from a chip in the people bar: the card is not squeezed between the grid and the list.
    for (const p of [hands[2], hands[0]]) {
      await page.getByTestId(`unit-${p.id}`).click()
      expect(await a<number>(page, `return A.shown('person-card', 'person-${p.id}')`)).toBeGreaterThanOrEqual(0)
      await page.waitForTimeout(500)
      await expect(page.getByTestId('work-grid')).toBeVisible()
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/keys-${w}x${h}-${p.name}-from-the-chip-grid-open.png` })
      const keys = await pressable('person-card', `${p.name} from the chip, the grid open`)
      expect.soft(keys, `${w}x${h}, ${p.name} from the chip, the grid open`).toContain('person-rest-now')
      const c = (await cards(page)).find(x => x.id === 'person-card')!
      const g = (await page.getByTestId('work-grid').boundingBox())!
      expect.soft(meets(c.rect, { left: g.x, top: g.y, right: g.x + g.width, bottom: g.y + g.height }), `${w}x${h}, ${p.name} from the chip, the grid open: the card is off the grid`).toBe(false)
      await wheeled('person-card', `${p.name} from the chip, the grid open`)
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('on a phone the card is a sheet at the foot, headed with the thing, notched toward it, and the thing stays in view above it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone\'s sheet')
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await farm(page)
  const size = page.viewportSize()!
  const names = await a<string[]>(page, 'return sim.FIELD_NAMES')
  const sheet = async (id: string, thing: string, head: (string | RegExp)[], pin: string, name: string) => {
    expect(await a<number>(page, `return A.shown(${JSON.stringify(id)}, ${JSON.stringify(thing)})`), `${name}: its sheet is up`).toBeGreaterThanOrEqual(0)
    // (the land is framed above the sheet, and comes to rest)
    await page.waitForTimeout(1600)
    const up = await cards(page)
    const c = up.find(x => x.id === id)!
    expect.soft(up.map(x => x.id), `${name}: one sheet at a time`).toEqual([id])
    expect.soft(c.rect.bottom > size.height * 0.6 && c.rect.left >= 0 && c.rect.right <= size.width && c.rect.bottom <= size.height + 0.5, `${name}: a sheet at the foot, inside the window (${JSON.stringify(c.rect)})`).toBe(true)
    expect.soft(c.thing, `${name}: says which thing it is about`).toBe(thing)
    for (const h of head) { if (typeof h === 'string') expect.soft(c.head, `${name}: its head names the thing`).toContain(h); else expect.soft(c.head, `${name}: its head names the thing`).toMatch(h) }
    expect.soft(c.strangers, `${name}: every control in it belongs to that thing`).toEqual([])
    expect.soft(c.notch, `${name}: a notch on the sheet`).not.toBeNull()
    const at = await a<{ x: number; y: number; visible: boolean } | null>(page, pin)
    expect.soft(!!at && at.visible && at.y < c.rect.top && at.y > 0, `${name}: the thing is in view above the sheet (${JSON.stringify(at)}, sheet top ${Math.round(c.rect.top)})`).toBe(true)
    if (c.notch && at) {
      expect.soft(Math.abs(c.notch.y - c.rect.top), `${name}: the notch stands on the sheet's top edge`).toBeLessThanOrEqual(14)
      expect.soft(Math.abs(c.notch.x - Math.max(c.rect.left + 22, Math.min(c.rect.right - 22, at.x))), `${name}: the notch points at the thing`).toBeLessThanOrEqual(40)
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-${name.replace(/[^\w]+/g, '-')}.png` })
  }
  // (on a phone the tags are put again once the camera has come to rest: the tap is aimed once they hold still)
  const tagsAt = () => a<string>(page, `return JSON.stringify([...document.querySelectorAll('#ui .plate')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)] }))`)
  await expect.poll(async () => { const was = await tagsAt(); await page.waitForTimeout(300); return was === await tagsAt() }, { timeout: 10_000 }).toBe(true)
  // A field, by its tag.
  const i = await a<number>(page, `return [3, 0, 2, 4, 5, 1].find(i => !!A.handle('.plate[data-k="field-' + i + '"]'))`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-as-it-stands.png` })
  expect(i, `a field's tag can be tapped (${JSON.stringify(await a(page, `return [...document.querySelectorAll('#ui .plate')].map(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [e.dataset.k, A.vis(e), Math.round(r.left), Math.round(r.top), Math.round(r.width), hit ? String(hit.className).slice(0, 40) : ''] })`))})`).toBeDefined()
  const tag = (await a<Pt | null>(page, `return A.handle('.plate[data-k="field-${i}"]')`))!
  // Where on the tag the tap lands, from its left edge: the notch points at that point of it, wherever the tag goes.
  const dx = await a<number>(page, `return ${tag.x} - document.querySelector('#ui .plate[data-k="field-${i}"]').getBoundingClientRect().left`)
  await page.touchscreen.tap(tag.x, tag.y)
  // (tapped by its tag, the sheet's notch points at the point of the tag that was tapped; the field itself is in view
  // above the sheet with it)
  await sheet('card', `field-${i}`, [/Potato field|Resting field/, names[i]], `const e = document.querySelector('#ui .plate[data-k="field-${i}"]'); const b = e.getBoundingClientRect(); return { x: b.left + Math.min(b.width, ${dx}), y: b.top + b.height / 2, visible: A.vis(e) && F.anchor(${i}).visible }`, 'a field')
  const anchor = await a<{ x: number; y: number; visible: boolean }>(page, `return F.anchor(${i})`)
  expect(anchor.visible && anchor.y < (await cards(page))[0].rect.top, 'the field is in view above its sheet').toBe(true)
  await page.getByTestId('card-close').tap()
  await page.waitForTimeout(400)
  expect((await cards(page)).map(x => x.id), 'the cross closes the sheet').toEqual([])
  // The yard.
  const yardTag = await a<Pt | null>(page, `return A.handle('[data-testid="yard-home"]')`)
  if (yardTag) await page.touchscreen.tap(yardTag.x, yardTag.y)
  if (await a<number>(page, 'return app.yard') !== -1) await a(page, 'app.selectYard(-1)')
  await sheet('yard-card', 'yard-home', ['home yard'], 'return F.yardPin(-1)', 'the yard')
  await page.getByTestId('yard-close').tap()
  await page.waitForTimeout(400)
  // A person on the land.
  const id = await a<number>(page, `const u = app.campaign.crew.find(u => u.kind !== 'farmer' && F.unitPlace(u.id) !== 'away') || app.campaign.crew.find(u => F.unitPlace(u.id) !== 'away'); return u ? u.id : -1`)
  expect(id, 'someone is out on the land').toBeGreaterThanOrEqual(0)
  const pin = page.getByTestId(`pin-${id}`)
  if (await pin.isVisible().catch(() => false)) await pin.tap().catch(() => a(page, `app.select(-1); app.selectYard(0); app.selectUnit(${id}, 'land')`))
  if (await a<number>(page, 'return app.unit') !== id) await a(page, `app.select(-1); app.selectYard(0); app.selectUnit(${id}, 'land')`)
  const name = await a<string>(page, `return app.campaign.crew.find(u => u.id === ${id}).name`)
  await sheet('whois', `person-${id}`, [name], `return F.unitPin(${id})`, 'a person')
  await page.getByTestId('whois-close').tap()
  await page.waitForTimeout(400)
  expect((await cards(page)).map(x => x.id)).toEqual([])
  expect(errors, errors.join('\n')).toEqual([])
})
