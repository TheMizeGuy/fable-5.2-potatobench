// Click a thing, and its card opens right there, tied to it, and everything in it acts on that thing: a field by its
// ground and by its tag, a resting field, a tract, the yard and what stands in it, a person on the land and by their
// chip, a machine, a neighbour's thing, an order in the list. At three window sizes and two camera tiers at a desk; on
// a phone the card is a sheet at the foot with a notch toward the thing, which is kept in view above it.
import { mkdirSync } from 'node:fs'
import { test, type Page } from '@playwright/test'
import { expect, open, putAway, reach, watchErrors } from './helpers.ts'

const SIZES = [[1280, 720], [1512, 982], [1920, 1080]] as const
const TIERS = ['field', 'farm'] as const
// Pictures of each card open on its thing, when a folder is named for them.
const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

interface Pt { x: number; y: number }
interface Box { left: number; top: number; right: number; bottom: number }
interface Card { id: string; thing: string; side: string; rect: Box; head: string; strangers: string[]; controls: number; end: Pt | null; line: boolean; show: boolean; notch: Pt | null; notched: boolean; onTop: boolean }

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
        strangers: controls.filter(b => b.closest('[data-thing]') !== el || /^(card-spray-way|spray-ask-open|spray-way-open|rule-|routine-|grid-open|crew-open|speed-)/.test(b.dataset.testid || '')).map(b => b.dataset.testid || b.className),
        controls: controls.length, end: end ? this.mid(end) : null, line: !!part('tether'), show: !!part('show'), notch: notch ? this.mid(notch) : null,
        notched: id === 'order-card' && getComputedStyle(el, '::after').content !== 'none',
        onTop: !!top && el.contains(top),
      })
    }
    return out
  },
  up(id, thing) { const c = this.cards().find(x => x.id === id && (!thing || x.thing === thing)); return !!c && !!(c.side || id === 'order-card' || c.notch || innerWidth < 900) },
  // From the next press: how long until the card for the thing stands where it is to stand, measured in the page
  // (frame by frame), in milliseconds.
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
  let from = k.at
  if (k.pick) {
    await page.waitForTimeout(80)
    const one = page.getByTestId(k.pick)
    if (await one.isVisible().catch(() => false)) {
      const b = (await one.boundingBox())!
      from = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      await a(page, `A.arm(${JSON.stringify(k.card)}, ${JSON.stringify(k.thing)})`)
      await page.mouse.click(from.x, from.y)
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
    const tops = bars.filter(b => b.left < c.rect.right && b.right > c.rect.left && b.top > size.height / 2).map(b => b.top)
    expect.soft(Math.min(...tops) - c.rect.bottom, say('stands right over the list and the people bar')).toBeLessThanOrEqual(16)
  }
  // Beside what was clicked: the point on the land, or the handle (the tag, the chip, the order) when it was one.
  if (k.handle) expect.soft(apart(c.rect, k.handle), say(`its nearest edge is within 60 px of the handle clicked (${Math.round(apart(c.rect, k.handle))} px)`)).toBeLessThanOrEqual(60)
  else expect.soft(away(c.rect, from), say(`its nearest edge is within 60 px of the point clicked (${Math.round(away(c.rect, from))} px)`)).toBeLessThanOrEqual(60)
  expect.soft(holds(c.rect, from), say('does not cover the point clicked')).toBe(false)
  if (k.handle) expect.soft(meets(c.rect, k.handle), say('does not cover the handle clicked')).toBe(false)
  if (k.middle) expect.soft(holds(c.rect, k.middle), say('does not cover the middle of the thing')).toBe(false)
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
  expect.soft(await a<string>(page, 'return JSON.stringify(F.stats().camera)'), say('the click moved no camera')).toBe(cam0)
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
    const at = await a<Pt | null>(page, `return A.fieldSpot(${i})`)
    if (!at) continue
    rested = true
    list.push({ name: 'a resting field', card: 'card', thing: `field-${i}`, head: ['Resting field', names[i]], at, middle: await a<Pt | null>(page, `return A.quad(${i}, .5, .5)`), ends: fieldEnds(i), marked: fieldMarked(i) })
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
  const [one] = spots
  await page.mouse.click(one.at.x, one.at.y)
  expect(await a<number>(page, `return A.shown('card', 'field-${one.i}')`)).toBeGreaterThanOrEqual(0)
  await page.waitForTimeout(380)
  // A second field, where the first one's card does not lie: the card moves to it.
  const free = async (not: number[]) => (await a<{ i: number; at: Pt }[]>(page, `return [0, 1, 2, 3, 4, 5].map(i => ({ i, at: A.fieldSpot(i) })).filter(x => x.at)`)).find(x => !not.includes(x.i))
  const two = (await free([one.i]))!
  expect(two, 'a second field is in reach beside the first one\'s card').toBeTruthy()
  await page.mouse.click(two.at.x, two.at.y)
  expect(await a<number>(page, `return A.shown('card', 'field-${two.i}')`)).toBeGreaterThanOrEqual(0)
  await page.waitForTimeout(380)
  let c = (await cards(page))
  expect(c.map(x => x.id)).toEqual(['card'])
  expect(c[0].head).toContain(names[two.i])
  expect(away(c[0].rect, two.at)).toBeLessThanOrEqual(60)
  // Shift-click a third: one card, named for the fields, tied to the one last clicked; an order goes to all of them.
  const three = (await free([one.i, two.i]))!
  expect(three, 'a third field is in reach').toBeTruthy()
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
    expect(await a<number>(page, `return A.shown('whois', 'person-${who.id}')`)).toBeGreaterThanOrEqual(0)
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
  // A field, by its tag.
  const i = await a<number>(page, `return [3, 0, 2, 4, 5, 1].find(i => !!A.handle('.plate[data-k="field-' + i + '"]'))`)
  const tag = (await a<Pt | null>(page, `return A.handle('.plate[data-k="field-${i}"]')`))!
  await page.touchscreen.tap(tag.x, tag.y)
  // (tapped by its tag, the sheet's notch points at the tag; the field itself is in view above the sheet with it)
  await sheet('card', `field-${i}`, [/Potato field|Resting field/, names[i]], `const e = document.querySelector('#ui .plate[data-k="field-${i}"]'); const m = A.mid(e); return { x: m.x, y: m.y, visible: A.vis(e) && F.anchor(${i}).visible }`, 'a field')
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
