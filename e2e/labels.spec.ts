// Labels a first-time player reads off a picture: the Plant stamp in cold ground, field tags far out, a person's
// "First priority" keys, and what grows on a resting field.
import { mkdirSync } from 'node:fs'
import { test, type Page } from '@playwright/test'
import { expect, open, putAway, reach, startSeason, watchErrors } from './helpers.ts'

const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }) }

// How far a tag's box may lie from its own field's outline on the screen, in px, beyond what the boards force: a
// tag stays on the free land, so a field lying under a board has its tag at the free land's edge nearest it.
const NEAR_PX = 12

async function game<T>(page: Page, expr: string): Promise<T> {
  return page.evaluate(`(() => { const { app, sim } = window.__county; return ${expr} })()`) as Promise<T>
}

test('in April with the soil too cold, the Plant stamp warns on its second line and under the pointer, and still plants', async ({ page, isMobile }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  const field = await game<number>(page, `app.campaign.plans.findIndex((p, i) => p.crop === 'potato' && sim.held(app.campaign, i))`)
  expect(await game<boolean>(page, `sim.plantReady(app.world, app.campaign, ${field}).ok`), 'the soil is still too cold').toBe(false)
  expect(await game<number>(page, 'sim.monthDay(app.campaign.year, app.campaign.season.day).month'), 'in April').toBe(3)
  await page.getByTestId(`field-${field}`).click()
  const plant = page.getByTestId('order-plant')
  await expect(plant).toBeVisible()
  await expect(plant).not.toHaveClass(/is-off/)
  await expect(plant.locator('.cost')).toHaveText(/too cold/i)
  // Under the pointer at a desk; to a screen reader everywhere.
  if (!isMobile) await expect(plant).toHaveAttribute('title', /seed needs 50°F or it can rot, so wait until about (April|May|June) \d+\. Planting now is up to you/)
  await expect(plant).toHaveAccessibleName(/seed needs 50°F or it can rot, so wait until about (April|May|June) \d+\. Planting now is up to you/)
  if (!isMobile) {
    await plant.hover()
    await expect(page.locator('#ui [data-testid="card-line"]')).toContainText(/can rot/i)
  }
  await shot(page, '1-plant-cold')
  await plant.click()
  await expect(page.getByTestId('order-plant-given')).toBeVisible()
  expect(await game<number>(page, `app.campaign.season.jobs.filter(j => j.kind === 'plant' && j.field === ${field}).length`)).toBe(1)
  expect(errors, errors.join('\n')).toEqual([])
})

// The words a player can see in the field's card: not a screen reader's, not a hover title.
function cardText(page: Page): Promise<string> {
  return page.locator('#ui [data-testid="card"]').evaluate(from => {
    const out: string[] = []
    const walk = document.createTreeWalker(from, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const p = n.parentElement
      const t = n.textContent?.trim()
      if (!p || !t || p.closest('.sr, [hidden]')) continue
      if (!p.checkVisibility({ opacityProperty: true, visibilityProperty: true } as CheckVisibilityOptions)) continue
      out.push(t)
    }
    return out.join(' ')
  })
}

for (const [w, h] of [[1280, 800], [1280, 720]] as const) {
  test(`April in a later year, ${w} by ${h}: an unplanted field's card says why it waits once, and is whole with its rocks row`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    await open(page)
    await reach(page, `q.start(1987, 3); q.year(3); const { app } = q.g(); app.do({ t: 'next' }); app.do({ t: 'begin' }); app.setSpeed(0); app.campaign.incidents = []`)
    await putAway(page)
    // A potato field the rocks row is offered for, not yet planted, in cold soil.
    const field = await game<number>(page, `[...Array(sim.FIELD_COUNT).keys()].find(i => sim.held(app.campaign, i) && app.campaign.plans[i].crop === 'potato' && !sim.plantReady(app.world, app.campaign, i).ok && sim.fieldInfo(app.campaign, i).stones >= 0.3) ?? -1`)
    expect(field, 'an unplanted potato field with stones').toBeGreaterThanOrEqual(0)
    // Picked by its tag, as a player does.
    await page.getByTestId(`field-${field}`).click()
    await expect(page.getByTestId('card-title')).toBeVisible()
    await page.mouse.move(2, Math.round(h / 2))
    await page.waitForTimeout(600)
    await shot(page, `1-april-card-${w}x${h}`)
    await expect(page.locator('#ui [data-testid="card"] [data-k="order-rocks"]')).toBeVisible()
    const text = await cardText(page)
    console.log(`the April card, ${w}x${h}: ${text}`)
    // The reason, with its number and its date, once.
    expect(text.match(/can rot/g)?.length ?? 0, text).toBe(1)
    expect(text.match(/The soil here is/g)?.length ?? 0, text).toBe(1)
    expect(text).toMatch(/The soil here is \d+°F and seed needs 50°F or it can rot, so wait until about (April|May|June) \d+\./)
    expect(text).not.toMatch(/Hold off planting/)
    await expect(page.getByTestId('order-plant').locator('.cost')).toHaveText(/^Too cold/)
    // Whole: nothing in the card has to be scrolled to.
    const room = await page.locator('#ui [data-testid="card"]').evaluate(el => [el, ...el.querySelectorAll<HTMLElement>('[data-scroll]')].map(x => [x.scrollHeight, x.clientHeight]))
    const parts = await page.locator('#ui [data-testid="card"] .card-body').evaluate(b => [...b.children].map(x => `${x.className || x.tagName}:${Math.round(x.getBoundingClientRect().height)}`).join(' '))
    console.log(`the April card's parts, ${w}x${h}: ${parts}; heights ${JSON.stringify(room)}`)
    for (const [sh, ch] of room) expect(sh, `the card scrolls: ${JSON.stringify(room)}`).toBeLessThanOrEqual(ch + 1)
    const card = (await page.getByTestId('card').boundingBox())!
    expect(card.y + card.height, 'the card ends inside the window').toBeLessThanOrEqual(h)
    expect(errors, errors.join('\n')).toEqual([])
  })
}

// The Kill vines stamp of field i, read off its card.
async function killStamp(page: Page, i: number): Promise<{ cost: string; title: string; name: string; risk: boolean; given: boolean }> {
  await game(page, `(() => { app.select(-1); app.focus(${i}) })()`)
  await page.waitForTimeout(1500)
  await game(page, `app.select(${i})`)
  await expect(page.getByTestId('card-title')).toBeVisible()
  await page.waitForTimeout(400)
  return page.evaluate(() => {
    const k = document.querySelector<HTMLElement>('#ui [data-testid="card"] [data-k="order-kill"]')!
    return { cost: k.querySelector('.cost')?.textContent ?? '', title: k.title, name: k.textContent ?? '', risk: k.classList.contains('is-risk'), given: k.classList.contains('is-given') }
  })
}

test('a week before the vines are due, Kill vines warns with what it gives up; on the due day, and with blight winning, it does not', async ({ page, isMobile }) => {
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await startSeason(page)
  // The coach's season, nothing killed, until the potato fields are a week short of their kill.
  await reach(page, `const { app, sim } = q.g(); const c = app.campaign; app.setSpeed(0); app.do({ t: 'sprayWay', way: 'auto' })
    const early = () => [...Array(sim.FIELD_COUNT).keys()].filter(i => { const k = sim.killCostToday(app.world, c, i); return k && k.days === 7 && k.cwtPerAcre >= 5 })
    for (let n = 0; n < 200 && early().length < 2; n++) { c.incidents = []; q.run(c.season.day + 1, ['kill', 'sell']) }
    app.setSpeed(0); c.incidents = []; window.__early = early()`)
  await putAway(page)
  const [a, b] = await game<number[]>(page, 'window.__early')
  expect(b, 'two fields a week short of their kill').toBeGreaterThanOrEqual(0)
  // A week early: the warning on the stamp's second line, and the cost under the pointer and to a screen reader.
  const lost = await game<{ cwtPerAcre: number; dueDay: number }>(page, `sim.killCostToday(app.world, app.campaign, ${a})`)
  const due = await game<string>(page, `sim.formatDay(app.campaign.year, ${lost.dueDay})`)
  let k = await killStamp(page, a)
  expect(k.risk).toBe(true)
  expect(k.cost).toBe('7 days early')
  // Its words under the pointer at a desk, and to a screen reader (the stamp's own text) everywhere.
  for (const said of isMobile ? [k.name] : [k.title, k.name]) {
    expect(said).toContain(`The potatoes are still growing, so killing the vines 7 days early gives up about ${lost.cwtPerAcre} cwt/acre.`)
    expect(said).toContain(`on ${due}.`)
  }
  await expect(page.getByTestId('order-kill')).toHaveAccessibleName(new RegExp(`gives up about ${lost.cwtPerAcre} cwt/acre`))
  if (!isMobile) {
    await page.getByTestId('order-kill').hover()
    await expect(page.locator('#ui [data-testid="card-line"]')).toContainText(`gives up about ${lost.cwtPerAcre} cwt/acre`)
  }
  await shot(page, '1-kill-early')
  // Pressed anyway: the order is given, and the note says what was chosen.
  await page.getByTestId('order-kill').click()
  await expect(page.locator('#ui [data-testid="card-line"]')).toContainText(`You're killing the vines 7 days early, which gives up about ${lost.cwtPerAcre} cwt/acre.`)
  expect(await game<number>(page, `app.campaign.season.jobs.filter(j => j.kind === 'kill' && j.field === ${a}).length`)).toBe(1)
  await game(page, `(() => { for (const j of [...app.campaign.season.jobs]) if (j.kind === 'kill') app.do({ t: 'cancel', id: j.id }) })()`)
  // Blight winning on the other field: the coach asks for the kill, so no warning.
  await game(page, `(() => { app.campaign.season.fields[${b}].knownSev = 0.3; app.revision++; app.select(-1) })()`)
  k = await killStamp(page, b)
  expect(k.risk, 'no warning with blight winning').toBe(false)
  expect(`${k.title} ${k.name}`).not.toContain('days early gives up about')
  await shot(page, '1-kill-blight')
  // On the due day: no warning.
  await reach(page, `const { app } = q.g(); const c = app.campaign; app.select(-1); c.incidents = []; q.run(${lost.dueDay}, ['kill', 'sell']); app.setSpeed(0); c.incidents = []
    for (const j of [...c.season.jobs]) if (j.kind === 'kill') app.do({ t: 'cancel', id: j.id })`)
  await putAway(page)
  expect(await game<number>(page, 'app.campaign.season.day')).toBe(lost.dueDay)
  k = await killStamp(page, a)
  expect(k.risk, 'no warning on the due day').toBe(false)
  expect(`${k.title} ${k.name}`).not.toContain('days early gives up about')
  await shot(page, '1-kill-due')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a field planted in cold soil: its weigh ticket names the rotted seed once, as its biggest loss, and the ways stay in view', async ({ page, isMobile }) => {
  const errors = watchErrors(page)
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 800 })
  await startSeason(page)
  // Every potato field planted on the season's first day, in cold soil, and a third of each one's seed left to rot (the
  // cold April of 1990 rots only a few percent); then the coach's season to the first ticket.
  await reach(page, `const { app } = q.g(); const c = app.campaign; const s = c.season
    for (let i = 0; i < c.plans.length; i++) if (c.plans[i].crop === 'potato' && q.g().sim.held(c, i)) app.do({ t: 'job', kind: 'plant', field: i })
    for (let k = 0; k < 20 && s.fields.some((f, i) => c.plans[i]?.crop === 'potato' && f.plantDay < 0); k++) app.do({ t: 'day' })
    for (const f of s.fields) if (f.plantDay >= 0) for (let h = 0; h < f.hState.length / 3; h++) f.hState[h] |= 128
    q.run(999, ['sell'], 'lot'); for (let k = 0; k < 10 && !s.fields.some(f => f.weighed); k++) app.do({ t: 'day' })`)
  const ticket = page.getByTestId('weighin')
  await expect(ticket).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('#ui .dig-day:not(.revealing) .ticket:not(.is-waiting)')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1200)
  const cold = page.getByTestId('ticket-cold')
  await expect(cold).toBeVisible()
  await expect(cold).toHaveText(/^Rotted seed−[\d,]+ cwt\d+% after a cold planting on April \d+$/)
  await expect(page.locator('#ui .dig-paper .losses caption')).toHaveText('Biggest loss')
  await expect(page.locator('#ui .dig-paper .losses tbody tr')).toHaveCount(1)
  // Said once: no other line on the ticket's face speaks of rotted seed or the cold planting.
  expect(await page.locator('#ui .dig-paper').evaluate(e => (e.textContent ?? '').match(/rotted|cold planting|cold soil/gi)?.length ?? 0)).toBe(2)
  // Both ways to take the crop in the window without scrolling.
  const ways = await page.locator('#ui .dig-paper .ways .way').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } }))
  expect(ways.length).toBeGreaterThanOrEqual(2)
  for (const w of ways) expect(w.bottom, 'a way to take the crop runs past the window').toBeLessThanOrEqual(page.viewportSize()!.height)
  const scrolled = await page.locator('#ui .dig-paper .dlg-body').evaluate(e => e.scrollTop)
  expect(scrolled).toBe(0)
  // Within the ticket's word budget (e2e/papers.spec.ts, 120), counted the same way.
  const said = await page.locator('#ui .dig-paper').evaluate(from => {
    const out: string[] = []
    const walk = document.createTreeWalker(from, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const p = n.parentElement
      const t = n.textContent?.trim()
      if (!p || !t || p.closest('.sr, [hidden], svg')) continue
      if (!p.checkVisibility({ opacityProperty: true, visibilityProperty: true } as CheckVisibilityOptions)) continue
      out.push(t)
    }
    return out.join(' ')
  })
  const n = said.split(/\s+/).filter(x => /[A-Za-z0-9$]/.test(x)).length
  console.log(`the cold-planted ticket: ${n} words: ${said}`)
  expect(n, said).toBeLessThanOrEqual(120)
  await shot(page, `2-ticket-cold-${isMobile ? 'phone' : '1280x800'}`)
  expect(errors, errors.join('\n')).toEqual([])
})

// Every tag on the land with its box, and its field's outline on the screen.
// eye: how far the tag's eyelet, the end it points from, lies from the outline (0 inside it).
interface Laid { field: number; box: { l: number; t: number; r: number; b: number }; outline: { x: number; y: number }[]; gap: number; eye: number; owed: number; eyeOwed: number }
async function laid(page: Page): Promise<Laid[]> {
  return page.evaluate(() => {
    const F = (globalThis as unknown as { __countyField: { corners(i: number): { x: number; y: number; visible: boolean }[]; anchor(i: number): { visible: boolean } } }).__countyField
    const ins = (globalThis as unknown as { __county: { app: { insets: { top: number; right: number; bottom: number; left: number } } } }).__county.app.insets
    const out: Laid[] = []
    // Distance from a point to a segment, and whether a point is inside a polygon.
    const seg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x, dy = b.y - a.y
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
    }
    const inside = (p: { x: number; y: number }, poly: { x: number; y: number }[]) => {
      let c = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c
      }
      return c
    }
    for (const wrap of document.querySelectorAll<HTMLElement>('#ui .plate-layer .tag-wrap')) {
      if (wrap.hidden || wrap.classList.contains('gone')) continue
      const tag = wrap.querySelector<HTMLElement>('.tag')
      const id = tag?.dataset.testid ?? ''
      if (!tag || !id.startsWith('field-')) continue
      const field = Number(id.slice(6))
      if (!F.anchor(field).visible) continue
      const rects = [tag, wrap.querySelector<HTMLElement>('.need')].filter((e): e is HTMLElement => !!e).map(e => e.getBoundingClientRect())
      const box = { l: Math.min(...rects.map(r => r.left)), t: Math.min(...rects.map(r => r.top)), r: Math.max(...rects.map(r => r.right)), b: Math.max(...rects.map(r => r.bottom)) }
      const outline = F.corners(field).map(p => ({ x: p.x, y: p.y }))
      // From a box to the outline: 0 where they touch. Edges crossing with no corner of either inside the other are
      // caught by sampling each edge.
      const gapOf = (r: { l: number; t: number; r: number; b: number }) => {
        const cs = [{ x: r.l, y: r.t }, { x: r.r, y: r.t }, { x: r.r, y: r.b }, { x: r.l, y: r.b }]
        const inBox = (p: { x: number; y: number }) => p.x >= r.l && p.x <= r.r && p.y >= r.t && p.y <= r.b
        if (outline.some(inBox) || cs.some(p => inside(p, outline))) return 0
        let g = Infinity
        for (let i = 0; i < outline.length; i++) {
          const a = outline[i], b = outline[(i + 1) % outline.length]
          for (let k = 0; k <= 40; k++) { const p = { x: a.x + (b.x - a.x) * k / 40, y: a.y + (b.y - a.y) * k / 40 }; if (inBox(p)) return 0 }
          for (const p of cs) g = Math.min(g, seg(p, a, b))
          for (const p of [a, b]) g = Math.min(g, Math.hypot(Math.max(r.l - p.x, 0, p.x - r.r), Math.max(r.t - p.y, 0, p.y - r.b)))
        }
        return g
      }
      const owed = gapOf({ l: ins.left, t: ins.top, r: innerWidth - ins.right, b: innerHeight - ins.bottom })
      const e = tag.querySelector('.eyelet')!.getBoundingClientRect()
      const ex = (e.left + e.right) / 2, ey = (e.top + e.bottom) / 2
      // An eyelet stands half a tag's height inside the free land at the nearest.
      const half = tag.getBoundingClientRect().height / 2
      const eyeOwed = gapOf({ l: ins.left, t: ins.top + half, r: innerWidth - ins.right, b: innerHeight - ins.bottom - half })
      out.push({ field, box, outline, gap: gapOf(box), eye: gapOf({ l: ex, t: ey, r: ex, b: ey }), owed, eyeOwed })
    }
    return out
  })
}

// The wheel turned over the middle of the free land, as a player zooms out: steps notches of delta each.
async function zoomedOut(page: Page, steps = 30, delta = 500): Promise<void> {
  const dist = () => page.evaluate(() => (globalThis as unknown as { __countyField: { stats(): { camera: { dist: number } } } }).__countyField.stats().camera.dist)
  const size = page.viewportSize()!
  const ins = await game<{ top: number; right: number; bottom: number; left: number }>(page, 'app.insets')
  await page.mouse.move(Math.round((ins.left + size.width - ins.right) / 2), Math.round((ins.top + size.height - ins.bottom) / 2))
  let last = -1
  for (let k = 0; k < steps; k++) {
    await page.mouse.wheel(0, delta)
    await page.waitForTimeout(120)
    const d = await dist()
    if (Math.abs(d - last) < 0.01) break
    last = d
  }
  // At rest: the camera's own easing done and the tags settled for where it stopped.
  await page.waitForTimeout(1500)
  await page.mouse.move(2, Math.round(size.height / 2))
  await page.waitForTimeout(400)
  console.log(`camera at ${Math.round(await dist())} m; the tags' layer: ${await page.locator('#ui .plate-layer').getAttribute('class')}`)
}

// held: the tags are to stay by their fields here (far out); elsewhere their gaps are only printed.
function check(tags: Laid[], what: string, held = true): void {
  if (process.env.TAGS_DEBUG) for (const t of tags) console.log(`  ${t.field}: box ${[t.box.l, t.box.t, t.box.r, t.box.b].map(Math.round).join(',')} outline ${t.outline.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}`)
  console.log(`${what}: ${tags.length} tags; gaps ${tags.map(t => `${t.field}:${t.gap === Infinity ? 'inf' : Math.round(t.gap)}${t.owed ? ` (${Math.round(t.owed)} under the boards)` : ''}`).join(' ')}`)
  expect(tags.length, `${what}: tags on the land`).toBeGreaterThan(0)
  if (!held) return
  for (const t of tags) expect.soft(t.gap - t.owed, `${what}: the tag of field ${t.field} lies ${Math.round(t.gap)}px from its field (${Math.round(t.owed)} under the boards) ${JSON.stringify(t.box)} ${JSON.stringify(t.outline.map(p => [Math.round(p.x), Math.round(p.y)]))}`).toBeLessThanOrEqual(NEAR_PX)
  for (const a of tags) for (const b of tags) {
    if (a.field >= b.field) continue
    const over = a.box.l < b.box.r - 0.5 && a.box.r > b.box.l + 0.5 && a.box.t < b.box.b - 0.5 && a.box.b > b.box.t + 0.5
    expect.soft(over, `${what}: the tags of fields ${a.field} and ${b.field} overlap`).toBe(false)
  }
}

// Each face pin on the land that a tag lies over (by what a press at its head would reach).
function covered(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#ui .pin-at:not(.gone) .pin')].flatMap(p => {
    const r = (p.querySelector('.head') ?? p).getBoundingClientRect()
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
    return hit?.closest('.tag-wrap') ? [p.dataset.testid ?? 'pin'] : []
  }))
}

// Nearer in: each tag's eyelet on or inside its own field (where the field shows on the free land), no two tags
// overlapping, no face pin under a tag.
function pointing(tags: Laid[], what: string): void {
  console.log(`${what}: ${tags.length} tags; eyelets ${tags.map(t => `${t.field}:${Math.round(t.eye)}${t.eyeOwed ? ` (${Math.round(t.eyeOwed)} under the bars)` : ''}`).join(' ')}`)
  expect(tags.length, `${what}: tags on the land`).toBeGreaterThan(0)
  for (const t of tags) expect.soft(t.eye - t.eyeOwed, `${what}: the eyelet of field ${t.field}'s tag lies ${Math.round(t.eye)}px from its field (${Math.round(t.eyeOwed)} under the bars) ${JSON.stringify(t.box)} ${JSON.stringify(t.outline.map(p => [Math.round(p.x), Math.round(p.y)]))}`).toBeLessThanOrEqual(NEAR_PX)
  for (const a of tags) for (const b of tags) {
    if (a.field >= b.field) continue
    const over = a.box.l < b.box.r - 0.5 && a.box.r > b.box.l + 0.5 && a.box.t < b.box.b - 0.5 && a.box.b > b.box.t + 0.5
    expect.soft(over, `${what}: the tags of fields ${a.field} and ${b.field} overlap`).toBe(false)
  }
}

for (const [w, h] of [[1280, 800], [1512, 982]] as const) {
  test(`nearer in, ${w} by ${h}: every tag points at its own field, none overlap, and no face pin is under a tag`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'a desk window')
    const errors = watchErrors(page)
    await page.setViewportSize({ width: w, height: h })
    // June on a farm with its people hired, as the cards' checks have it.
    await open(page, '?year=1990&seed=7')
    await reach(page, `const { app } = q.g(); const c = app.campaign; c.cash += 30000
      c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
      for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })`)
    await page.getByTestId('begin-season').click()
    await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run(q.day(6, 12)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
    await putAway(page)
    await page.mouse.move(2, Math.round(h / 2))
    await page.waitForTimeout(1200)
    for (const [n, label] of [[0, 'as it opens'], [2, 'a little out'], [3, 'further out']] as const) {
      if (n) await zoomedOut(page, n, 90)
      const what = `${w}x${h}, ${label}`
      await shot(page, `3-near-${w}x${h}-${label.replace(/\W+/g, '-')}`)
      const tags = await laid(page)
      pointing(tags, what)
      expect.soft(tags.map(t => t.field).sort((p, q) => p - q), `${what}: every field in view keeps its tag`).toEqual(await game<number[]>(page, '[...Array(sim.FIELD_COUNT).keys()].filter(i => !!document.querySelector(`#ui .tag-wrap [data-testid="field-${i}"]`) && window.__countyField.anchor(i).visible)'))
      expect.soft(await covered(page), `${what}: face pins under a tag`).toEqual([])
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('zoomed all the way out, every tag sits on or beside its own field, and no two tags overlap', async ({ page }) => {
  const errors = watchErrors(page)
  // The first season: the six home fields, as the season opens, part way out, and all the way out.
  await startSeason(page)
  await page.mouse.move(2, 300)
  await page.waitForTimeout(800)
  console.log(`insets ${JSON.stringify(await game(page, 'app.insets'))}, window ${JSON.stringify(page.viewportSize())}`)
  if (process.env.TAGS_DEBUG) console.log(await page.evaluate(() => { const F = (globalThis as any).__countyField; return [0, 1, 2, 3, 4, 5].map(i => { const a = F.anchor(i); return `${i}: anchor ${Math.round(a.x)},${Math.round(a.y)} ${a.visible} corners ${F.corners(i).map((p: any) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}` }).join('\n') }))
  await shot(page, '2-near-first-season')
  check(await laid(page), 'the first season, as it opens', false)
  await zoomedOut(page, 4, 80)
  await shot(page, '2-mid-first-season')
  check(await laid(page), 'the first season, part way out', /\bfar\b/.test(await page.locator('#ui .plate-layer').getAttribute('class') ?? ''))
  await zoomedOut(page)
  await shot(page, '2-far-first-season')
  const far = await laid(page)
  check(far, 'the first season, farthest out')
  expect(far.map(t => t.field).sort(), 'every home field keeps its tag').toEqual([0, 1, 2, 3, 4, 5])
  // A later season: the woods and brush to clear have tags too.
  await open(page)
  await reach(page, `q.start(1987, 3); q.year(3); const { app } = q.g(); app.do({ t: 'next' }); app.do({ t: 'begin' }); app.setSpeed(0); app.campaign.incidents = []`)
  await putAway(page)
  await page.waitForTimeout(1500)
  expect(await game<number>(page, 'app.campaign.history.length'), 'a year behind the farm').toBeGreaterThan(0)
  await zoomedOut(page)
  await shot(page, '2-far-second-season')
  check(await laid(page), 'the second season, farthest out')
  expect(errors, errors.join('\n')).toEqual([])
})

test("each of a person's First priority keys has its name on it, a hover title and an accessible name, and the chosen one reads as chosen", async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  await reach(page, `const { app } = q.g(); const c = app.campaign; c.cash += 30000
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })`)
  await page.getByTestId('begin-season').click()
  await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run(q.day(5, 12)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(1, 'land')`)
  const card = page.getByTestId('whois')
  await expect(card).toBeVisible()
  const keys = card.locator('[data-testid^="whois-first-"]')
  await expect(keys).toHaveCount(5)
  const names: Record<string, RegExp> = { machine: /machine/i, field: /field/i, woods: /woods/i, build: /build/i, pack: /pack/i }
  for (const [k, re] of Object.entries(names)) {
    const key = card.getByTestId(`whois-first-${k}`)
    await expect(key.locator('.key-name')).toBeVisible()
    await expect(key.locator('.key-name')).toHaveText(re)
    await expect(key).toHaveAttribute('title', re)
    await expect(key).toHaveAccessibleName(re)
  }
  // Every name lies inside its own key, and the keys stay on the card.
  const fit = await card.evaluate(c => {
    const r = c.getBoundingClientRect()
    return [...c.querySelectorAll<HTMLElement>('[data-testid^="whois-first-"]')].map(k => {
      const b = k.getBoundingClientRect(), n = k.querySelector<HTMLElement>('.key-name')!.getBoundingClientRect()
      return n.left >= b.left - 0.5 && n.right <= b.right + 0.5 && b.left >= r.left && b.right <= r.right
    })
  })
  expect(fit).toEqual([true, true, true, true, true])
  await card.getByTestId('whois-first-field').click()
  const chosen = card.getByTestId('whois-first-field')
  await expect(chosen).toHaveAttribute('aria-pressed', 'true')
  await expect(chosen).toHaveAccessibleName(/field/i)
  await page.mouse.move(2, 300)
  await page.waitForTimeout(500)
  const faces = await card.evaluate(c => [...c.querySelectorAll<HTMLElement>('[data-testid^="whois-first-"]')].map(k => `${k.getAttribute('aria-pressed')} ${getComputedStyle(k).backgroundColor}`))
  // Several kinds of work can share first place: every chosen key has one face, and no other key has it.
  const on = faces.filter(f => f.startsWith('true')).map(f => f.slice(5))
  const off = faces.filter(f => f.startsWith('false')).map(f => f.slice(6))
  expect(on.length).toBeGreaterThanOrEqual(1)
  expect(new Set(on).size, `the chosen keys share a face: ${faces.join(', ')}`).toBe(1)
  expect(off.every(f => f !== on[0]), `the chosen keys' face differs from the rest: ${faces.join(', ')}`).toBe(true)
  await shot(page, '3-first-priority')
  expect(errors, errors.join('\n')).toEqual([])
})

test("a resting field's tag says what grows there when it is hovered or selected", async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  const rest = await game<number>(page, `app.campaign.plans.findIndex((p, i) => p.crop === 'rest' && sim.held(app.campaign, i))`)
  expect(rest, 'a resting field this year').toBeGreaterThanOrEqual(0)
  const wrap = page.locator('#ui .plate-layer .tag-wrap', { has: page.getByTestId(`field-${rest}`) })
  const named = wrap.locator('.hover-name')
  await expect(named).toBeHidden()
  await page.getByTestId(`field-${rest}`).hover()
  await expect(named).toBeVisible()
  await expect(named).toHaveText(/resting: oats and clover/i)
  await shot(page, '4-resting-hover')
  await page.mouse.move(2, 300)
  await expect(named).toBeHidden()
  await game(page, `app.select(${rest})`)
  await expect(named).toBeVisible()
  await expect(named).toHaveText(/resting: oats and clover/i)
  // A potato field's tag says nothing more.
  const potato = await game<number>(page, `app.campaign.plans.findIndex((p, i) => p.crop === 'potato' && sim.held(app.campaign, i))`)
  await page.getByTestId(`field-${potato}`).hover()
  await expect(page.locator('#ui .plate-layer .tag-wrap', { has: page.getByTestId(`field-${potato}`) }).locator('.hover-name')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})
