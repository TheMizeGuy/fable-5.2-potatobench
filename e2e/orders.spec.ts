// Orders and the clock as a strategy player gives them: pick someone, right-click a field, and they go; a click on a
// person only picks them; a pause line goes once what it was for is answered.
import { test, type Page } from '@playwright/test'
import { expect, look, open, putAway, reach, watchErrors } from './helpers.ts'

async function game<T>(page: Page, expr: string): Promise<T> {
  return page.evaluate(`(() => { const { app, sim } = window.__county; return ${expr} })()`) as Promise<T>
}

// The fixed farm with the three who asked for work in spring taken on, into the season and paused in June.
async function farmWithPeople(page: Page): Promise<void> {
  await open(page, '?year=1990&seed=7')
  await reach(page, `const { app } = q.g(); const c = app.campaign; c.cash += 30000
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })`)
  await page.getByTestId('begin-season').click()
  await reach(page, `const { app } = q.g(); app.setSpeed(0); q.run(q.day(6, 12)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1)`)
  await putAway(page)
}

// A point of open land inside a field, with nothing of the interface over it; the field brought into frame if need be.
async function landOf(page: Page, field: number): Promise<{ x: number; y: number }> {
  const find = () => page.evaluate(i => {
    const f = (globalThis as any).__countyField
    const k = f.corners(i) as { x: number; y: number; visible: boolean }[]
    const mid = { x: k.reduce((t, p) => t + p.x, 0) / k.length, y: k.reduce((t, p) => t + p.y, 0) / k.length }
    const ring = [mid, ...k, ...k.map((p, n) => ({ x: (p.x + k[(n + 1) % k.length].x) / 2, y: (p.y + k[(n + 1) % k.length].y) / 2 }))]
    for (const s of [0, 0.15, 0.3, 0.45, 0.6, 0.75]) for (const p of ring) {
      const x = mid.x + (p.x - mid.x) * s, y = mid.y + (p.y - mid.y) * s
      if (x < 4 || y < 4 || x > innerWidth - 4 || y > innerHeight - 4) continue
      if (document.elementFromPoint(x, y)?.tagName === 'CANVAS' && f.pickAt(x, y).field === i) return { x, y }
    }
    return null
  }, field)
  let at = await find()
  if (!at) {
    await page.evaluate(i => (globalThis as any).__county.app.focus(i), field)
    await page.waitForTimeout(1500)
    at = await find()
  }
  expect(at, `open land in field ${field}`).not.toBeNull()
  return at!
}

// A click on a person's body on the land, as a player aims it: their place taken just before the click.
async function clickPerson(page: Page, id: number): Promise<boolean> {
  for (let k = 0; k < 4; k++) {
    const at = await page.evaluate(id => {
      const p = (globalThis as any).__countyField.unitAt(id)
      if (!p || p.x < 4 || p.y < 4 || p.x > innerWidth - 4 || p.y > innerHeight - 4) return null
      return document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS' ? p : null
    }, id) as { x: number; y: number } | null
    if (!at) { await page.waitForTimeout(250); continue }
    await page.mouse.click(at.x, at.y)
    if (await page.getByTestId('whois').isVisible().catch(() => false) && await game<number>(page, 'app.unit') === id) return true
    // a miss (they walked on): nothing is left in hand, and no key is pressed that could open the menu
    await page.evaluate(() => { const { app } = (globalThis as any).__county; app.select(-1); app.selectUnit(-1) })
  }
  return false
}

const notes = (page: Page) => page.locator('#ui .notes .alert')

test('someone picked and a field right-clicked: its suggested order goes on the list as theirs, and a note says who is going; a field with nothing to do says why', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  // Late July with spraying left to the player: the growing fields' cards suggest Spray.
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(7, 30), ['spray', 'kill', 'sell']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1)`)
  await putAway(page)
  const field = await game<number>(page, `app.needs().findIndex((n, i) => n.need?.act === 'spray' && !app.campaign.season.jobs.some(j => j.field === i))`)
  expect(field).toBeGreaterThanOrEqual(0)
  const op = await game<{ id: number; name: string }>(page, `app.campaign.crew.filter(u => u.kind === 'operator').map(u => ({ id: u.id, name: u.name }))[0]`)
  const first = op.name.split(' ')[0]
  const name = await game<string>(page, `sim.FIELD_NAMES[${field}]`)
  // The field's card fills Spray in ochre: that is the order the right-click gives.
  await reach(page, `q.g().app.select(${field})`)
  await expect(page.locator('#ui [data-testid="card"] [data-testid="order-spray"]')).toHaveClass(/is-suggested/)
  await reach(page, `const { app } = q.g(); app.select(-1); app.selectUnit(${op.id}, 'land')`)
  await expect(page.getByTestId('whois')).toBeVisible()
  const at = await landOf(page, field)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await expect.poll(() => game<number>(page, `app.campaign.season.jobs.find(j => j.field === ${field} && j.kind === 'spray')?.unit ?? -9`)).toBe(op.id)
  const id = await game<number>(page, `app.campaign.season.jobs.find(j => j.field === ${field} && j.kind === 'spray').id`)
  await expect(page.getByTestId(`queue-${id}`).locator('.q-tag.pinned')).toHaveText(first[0])
  await expect(notes(page).filter({ hasText: `${first} will spray ${name}.` })).toBeVisible()
  // A resting field has nothing for them: one sentence says so, and nothing goes on the list.
  const rest = await game<number>(page, `app.campaign.season.fields.findIndex(f => f.status === 'rest')`)
  const before = await game<number>(page, 'app.campaign.season.jobs.length')
  const spot = await landOf(page, rest)
  await page.mouse.click(spot.x, spot.y, { button: 'right' })
  await expect(notes(page).filter({ hasText: 'Nothing needs doing here right now.' })).toBeVisible()
  expect(await game<number>(page, 'app.campaign.season.jobs.length')).toBe(before)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a click on a person picks them and opens their card, and leaves the clock as it was: paused, stopped by the game, or at 3x', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  // Spraying answered, so the question that comes with blight weather does not stop the clock while it runs.
  await reach(page, `q.g().app.do({ t: 'sprayWay', way: 'auto' })`)
  const id = await game<number>(page, `app.campaign.crew.find(u => u.kind === 'hand').id`)
  const clock = () => game<{ speed: number; reason: string }>(page, '({ speed: app.speed, reason: app.pauseReason })')
  // Paused by the player.
  expect((await look(page)).paused).toBe(true)
  expect(await clickPerson(page, id)).toBe(true)
  expect(await clock()).toEqual({ speed: 0, reason: '' })
  await page.keyboard.press('Escape')
  // Stopped by the game: the click, and a paper raised from their card and put away, leave it stopped.
  await reach(page, `const { app } = q.g(); app.setSpeed(1); app.stopFor('Frost tonight.')`)
  expect(await clickPerson(page, id)).toBe(true)
  expect(await clock()).toEqual({ speed: 0, reason: 'Frost tonight.' })
  await page.getByTestId('whois').getByTestId('whois-letgo').click()
  await expect(page.locator('#ui .dialog:not(.out)')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#ui .dialog:not(.out)')).toHaveCount(0)
  await page.waitForTimeout(400)
  expect(await clock()).toEqual({ speed: 0, reason: 'Frost tonight.' })
  expect((await look(page)).paused).toBe(true)
  await page.keyboard.press('Escape')
  // At 3x.
  await reach(page, `const { app } = q.g(); app.selectUnit(-1); app.setSpeed(3)`)
  expect(await clickPerson(page, id)).toBe(true)
  expect((await clock()).speed).toBe(3)
  expect((await look(page)).speed).toBe(3)
  expect(errors, errors.join('\n')).toEqual([])
})

test('once what the game paused for is answered, no line says it needs an answer, and the clock shows how it stands', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  const seen = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#ui *')]
    .filter(e => !e.closest('.sr') && [...e.childNodes].some(n => n.nodeType === 3 && /needs an answer|Paused: /.test(n.nodeValue ?? '')) && e.checkVisibility({ opacityProperty: true, visibilityProperty: true } as CheckVisibilityOptions))
    .map(e => e.textContent))
  const after = async () => {
    for (let k = 0; k < 8; k++) {
      expect(await seen()).toEqual([])
      await page.waitForTimeout(250)
    }
    // Either way the clock says how it stands, and how to go on when it is paused.
    if ((await look(page)).paused) await expect(page.getByTestId('paused-go')).toBeVisible()
    else await expect(page.getByTestId('running')).toBeVisible()
  }
  // The first blight weather while the days run: the game pauses to ask how to spray this season.
  await reach(page, `const { app } = q.g(); const c = app.campaign; let n = 0
    while (c.season.watchDay < 0 && n++ < 120) { q.run(c.season.day + 1, ['spray']); c.incidents = [] }
    app.setSpeed(0)`)
  test.skip(await game<number>(page, 'app.campaign.season.watchDay') < 0, 'no blight weather this year')
  await reach(page, `q.g().app.setSpeed(1)`)
  const ask = page.getByTestId('spray-ask')
  await expect(ask).toBeVisible()
  // The player tries to resume before answering: the question is what stands in the way.
  await page.getByTestId('speed-1').click()
  await page.waitForTimeout(300)
  expect((await look(page)).paused).toBe(true)
  await ask.getByTestId('spray-way-auto').click()
  await expect(ask).toBeHidden()
  await after()
  // And a telegram: someone asks for work while the days run.
  await reach(page, `const { app, sim } = q.g(); const c = app.campaign
    const a = sim.applicantsFor(c.seed, c.year, new Set(c.crew.map(u => u.name)), 1, c.season.day)[0]
    c.incidents.push({ id: c.nextIncident++, kind: 'applicant', day: c.season.day, until: c.season.day + 4, choices: ['hire', 'pass'], applicant: a })
    app.setSpeed(1); app.stopFor('Someone asks for work.')`)
  const card = page.getByTestId('incident')
  await expect(card).toBeVisible()
  await page.getByTestId('speed-1').click()
  await page.waitForTimeout(300)
  expect((await look(page)).paused).toBe(true)
  await card.getByTestId('answer-pass').click()
  await expect(card).toBeHidden()
  await after()
  expect(errors, errors.join('\n')).toEqual([])
})
