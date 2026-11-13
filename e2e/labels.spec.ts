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

test('in April with the soil too cold, the Plant stamp warns on its second line and under the pointer, and still plants', async ({ page }) => {
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
  await expect(plant).toHaveAttribute('title', /rots in cold soil.*wait until about (April|May|June) \d+/i)
  await expect(plant).toHaveAccessibleName(/rots in cold soil/i)
  await plant.hover()
  await expect(page.locator('#ui [data-testid="card-line"]')).toContainText(/rots in cold soil/i)
  await shot(page, '1-plant-cold')
  await plant.click()
  await expect(page.getByTestId('order-plant-given')).toBeVisible()
  expect(await game<number>(page, `app.campaign.season.jobs.filter(j => j.kind === 'plant' && j.field === ${field}).length`)).toBe(1)
  expect(errors, errors.join('\n')).toEqual([])
})

// Every tag on the land with its box, and its field's outline on the screen.
interface Laid { field: number; box: { l: number; t: number; r: number; b: number }; outline: { x: number; y: number }[]; gap: number; owed: number }
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
      out.push({ field, box, outline, gap: gapOf(box), owed })
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

function check(tags: Laid[], what: string): void {
  if (process.env.TAGS_DEBUG) for (const t of tags) console.log(`  ${t.field}: box ${[t.box.l, t.box.t, t.box.r, t.box.b].map(Math.round).join(',')} outline ${t.outline.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}`)
  console.log(`${what}: ${tags.length} tags; gaps ${tags.map(t => `${t.field}:${t.gap === Infinity ? 'inf' : Math.round(t.gap)}${t.owed ? ` (${Math.round(t.owed)} under the boards)` : ''}`).join(' ')}`)
  expect(tags.length, `${what}: tags on the land`).toBeGreaterThan(0)
  for (const t of tags) expect.soft(t.gap - t.owed, `${what}: the tag of field ${t.field} lies ${Math.round(t.gap)}px from its field (${Math.round(t.owed)} under the boards) ${JSON.stringify(t.box)} ${JSON.stringify(t.outline.map(p => [Math.round(p.x), Math.round(p.y)]))}`).toBeLessThanOrEqual(NEAR_PX)
  for (const a of tags) for (const b of tags) {
    if (a.field >= b.field) continue
    const over = a.box.l < b.box.r - 0.5 && a.box.r > b.box.l + 0.5 && a.box.t < b.box.b - 0.5 && a.box.b > b.box.t + 0.5
    expect.soft(over, `${what}: the tags of fields ${a.field} and ${b.field} overlap`).toBe(false)
  }
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
  check(await laid(page), 'the first season, as it opens')
  await zoomedOut(page, 4, 80)
  await shot(page, '2-mid-first-season')
  check(await laid(page), 'the first season, part way out')
  await zoomedOut(page)
  await shot(page, '2-far-first-season')
  check(await laid(page), 'the first season, farthest out')
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
