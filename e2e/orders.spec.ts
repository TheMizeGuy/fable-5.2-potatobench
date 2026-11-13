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
      // their body on the land, or a pin standing over it (theirs, or the one they share with whoever stands with them)
      const top = document.elementFromPoint(p.x, p.y)
      return top?.tagName === 'CANVAS' || top?.closest('.pin') ? p : null
    }, id) as { x: number; y: number } | null
    if (!at) { await page.waitForTimeout(250); continue }
    await page.mouse.click(at.x, at.y)
    const pick = page.getByTestId(`pin-pick-${id}`)
    // the list of who stands there goes with them as they walk: the row is pressed where it is
    if (await pick.isVisible().catch(() => false)) await pick.dispatchEvent('click')
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

test('a stamp is the field\'s order: a hand who never does machine work leaves it for someone else, a capable person takes it, and every press is answered', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(7, 30), ['spray', 'kill', 'sell']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1)`)
  await putAway(page)
  const fields = await game<number[]>(page, `app.needs().map((n, i) => n.need?.act === 'spray' && !app.campaign.season.jobs.some(j => j.field === i) ? i : -1).filter(i => i >= 0)`)
  expect(fields.length).toBeGreaterThanOrEqual(3)
  const [one, two, three] = fields
  const name = (i: number) => game<string>(page, `sim.FIELD_NAMES[${i}]`)
  const hand = await game<{ id: number; name: string }>(page, `(() => { const u = app.campaign.crew.find(u => u.kind === 'hand'); app.do({ t: 'priority', unit: u.id, work: 'machine', level: 0 }); return { id: u.id, name: u.name } })()`)
  const op = await game<{ id: number; name: string }>(page, `app.campaign.crew.filter(u => u.kind === 'operator').map(u => ({ id: u.id, name: u.name }))[0]`)
  const spray = (i: number) => game<number>(page, `app.campaign.season.jobs.find(j => j.field === ${i} && j.kind === 'spray')?.unit ?? -9`)
  // A person's card may lie over a stamp on the land: the stamp is pressed as its own button.
  const press = (i: number) => page.getByTestId(`badge-${i}`).dispatchEvent('click')
  await reach(page, `q.g().app.selectUnit(${hand.id}, 'land')`)
  await press(one)
  await expect.poll(() => spray(one)).toBe(-1)
  await expect(notes(page).filter({ hasText: `${hand.name.split(' ')[0]} doesn't do machine work, so spraying ${await name(one)} is on the work list for someone else.` })).toBeVisible()
  await reach(page, `q.g().app.selectUnit(${op.id}, 'land')`)
  await press(two)
  await expect.poll(() => spray(two)).toBe(op.id)
  await expect(notes(page).filter({ hasText: `${op.name.split(' ')[0]} will spray ${await name(two)}.` })).toBeVisible()
  await reach(page, `q.g().app.selectUnit(-1)`)
  await press(three)
  await expect.poll(() => spray(three)).toBe(-1)
  await expect(notes(page).filter({ hasText: `Spraying ${await name(three)} is on the work list.` })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('a person\'s pin stands over them above a tag or the yard\'s tag, and a click there picks the person', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  await reach(page, `const { app } = q.g(); const c = app.campaign; c.cash += 30000; app.do({ t: 'hire', applicant: c.applicants[0].id })`)
  await page.getByTestId('begin-season').click()
  await reach(page, `const { app } = q.g(); app.setSpeed(0); app.campaign.incidents = []; app.select(-1)`)
  await putAway(page)
  let over = 0
  for (const tier of ['farm', 'yard', 'field']) {
    await page.evaluate(t => (globalThis as any).__countyField.tier(t), tier)
    await page.waitForTimeout(2000)
    for (const id of await game<number[]>(page, 'app.campaign.crew.map(u => u.id)')) {
      await page.evaluate(() => { const { app } = (globalThis as any).__county; app.selectUnit(-1); app.selectYard(0); app.select(-1) })
      await page.waitForTimeout(200)
      // Their pin (or the one they share with whoever stands with them), over their head: is a tag or the yard's tag
      // under it, and is the pin what a click there meets?
      const at = await page.evaluate(id => {
        const { app } = (globalThis as any).__county
        const a = (globalThis as any).__countyField.unitPin(id)
        if (!a.visible || a.x < 20 || a.y < 120 || a.x > innerWidth - 20 || a.y > innerHeight - 120) return null
        const u = app.campaign.crew.find((x: any) => x.id === id)
        const name = u.kind === 'farmer' ? 'You' : u.name.split(' ')[0]
        const own = document.querySelector<HTMLElement>(`#ui .pin-at:not(.gone) [data-testid="pin-${id}"]`)
        const pin = own ?? [...document.querySelectorAll<HTMLElement>('#ui .pin-at:not(.gone) button.pin.is-many')].find(b => (b.textContent ?? '').includes(name))
        const head = pin?.querySelector('.head svg')?.getBoundingClientRect()
        if (!head) return { x: 0, y: 0, tag: false, top: false, none: true }
        const p = { x: head.left + head.width / 2, y: head.top + head.height / 2 }
        // where the pin's face and a tag overlap, the pin is on top
        let tag = false, top = !!document.elementFromPoint(p.x, p.y)?.closest('.pin')
        for (const e of document.querySelectorAll<HTMLElement>('#ui .tag-wrap:not(.gone) .tag-at, #ui .yard-at:not(.gone) .yard-tag')) {
          const b = e.getBoundingClientRect()
          const l = Math.max(b.left, head.left), r = Math.min(b.right, head.right), t = Math.max(b.top, head.top), d = Math.min(b.bottom, head.bottom)
          if (r - l < 4 || d - t < 4) continue
          tag = true
          top &&= !!document.elementFromPoint((l + r) / 2, (t + d) / 2)?.closest('.pin')
        }
        return { ...p, tag, top, none: false }
      }, id) as { x: number; y: number; tag: boolean; top: boolean; none: boolean } | null
      if (!at || at.none) continue
      expect(at.top, `${tier}: person ${id}'s pin is on top, over any tag it meets`).toBe(true)
      if (at.tag) over++
      await page.mouse.click(at.x, at.y)
      const pick = page.getByTestId(`pin-pick-${id}`)
      if (await pick.isVisible().catch(() => false)) await pick.click()
      expect(await game<number>(page, 'app.unit'), `${tier}: person ${id}${at.tag ? ', over a tag' : ''}`).toBe(id)
      expect(await game<number>(page, 'app.yard')).toBe(0)
      await page.keyboard.press('Escape')
    }
  }
  expect(over, 'at least one pin met a tag').toBeGreaterThan(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('in the harvest rain both can stand waiting: the time book says Waiting and for what, and each chip says in words what it holds and who its ringed letter is', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  // tests/idle.test.ts: a farm of its own, seed 1, the first applicant set never to do machine work, to the first
  // harvest morning the ground is too wet to dig.
  await reach(page, `const { app, sim } = q.g(); app.newGame(undefined, 1); const c = app.campaign
    app.do({ t: 'hire', applicant: c.applicants[0].id }); app.do({ t: 'begin' }); app.setSpeed(0)
    app.do({ t: 'priority', unit: c.crew[1].id, work: 'machine', level: 0 })
    for (let g = 0; g < 400; g++) {
      c.incidents = []
      const s = c.season
      if (s.day >= sim.dayIndex(s.year, 9, 1) && s.jobs.some(j => j.kind === 'dig') && c.crew.every(u => u.job < 0) && Object.values(sim.jobWaits(app.world, c)).every(w => w)) break
      app.do({ t: 'day' })
    }
    app.setSpeed(0); c.incidents = []`)
  await putAway(page)
  expect(await game<string[]>(page, 'Object.values(sim.jobWaits(app.world, app.campaign))')).toContain('ground too wet')
  const you = page.getByTestId('unit-0')
  await expect(you).toContainText('Waiting')
  await expect(you).toHaveAttribute('title', /Waiting for the ground to dry out/)
  const chips = page.locator('#ui .queue button.q[data-testid^="queue-"]:not([data-testid="queue-more"])')
  expect(await chips.count()).toBeGreaterThan(0)
  for (const chip of await chips.all()) {
    const title = await chip.getAttribute('title')
    const label = await chip.evaluate(e => (e.querySelector('.sr')?.textContent ?? '').trim())
    for (const said of [title, label]) {
      expect(said).toMatch(/^(Digging|Hauling from) \w+ \w+: (you|nobody yet)\./)
      expect(said).toMatch(/Waiting|Sunday|will do it|get to this|working on it/)
    }
    if (await chip.locator('.q-tag:not(.q-nobody)').count()) expect(title).toContain('The ringed Y stands for you.')
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('a purchase in the spring plan is answered with how to undo it, and undone it gives back the exact cash', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  const cash = () => game<number>(page, 'app.campaign.cash')
  const before = await cash()
  await page.getByTestId('equipment-open').click()
  await page.getByTestId('buy-boom').click()
  expect(await cash()).toBe(before - 6000)
  await expect(notes(page).filter({ hasText: 'You bought the boom sprayer for $6,000. You can undo this until the season starts.' })).toBeVisible()
  await page.getByTestId('unbuy-boom').click()
  expect(await cash()).toBe(before)
  await expect(page.getByTestId('buy-boom')).toBeVisible()
  await page.getByTestId('equipment-close').click()
  // A hire says a month and what it comes to by the year end, and is undone the same way.
  await page.getByTestId('crew-open').click()
  const a = await game<{ id: number; name: string }>(page, 'app.campaign.applicants.map(a => ({ id: a.id, name: a.name }))[0]')
  await expect(page.getByTestId(`applicant-${a.id}`)).toContainText(/a month.*to the year end/)
  await page.getByTestId(`applicant-hire-${a.id}`).click()
  await expect(notes(page).filter({ hasText: `${a.name} is hired` }).filter({ hasText: 'You can undo this until the season starts.' })).toBeVisible()
  const unit = await game<number>(page, 'app.campaign.crew.at(-1).id')
  await page.getByTestId(`unhire-${unit}`).click()
  await expect(page.getByTestId(`applicant-${a.id}`)).toBeVisible()
  expect(await cash()).toBe(before)
  expect(errors, errors.join('\n')).toEqual([])
})

test('no key cap reads as close: Fell\'s key is L', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  const tract = await game<number>(page, 'app.campaign.fields.findIndex((f, i) => f.tenure !== "none" && f.cover === "woods")')
  expect(tract).toBeGreaterThanOrEqual(0)
  await reach(page, `q.g().app.select(${tract})`)
  const fell = page.locator('#ui [data-testid="card"] [data-k="order-fell"]')
  await expect(fell).toBeVisible()
  await expect(fell.locator('.key')).toHaveText('L')
  expect(await page.evaluate(() => [...document.querySelectorAll('#ui .key, #ui kbd')].map(e => e.textContent?.trim()).filter(t => t === 'X'))).toEqual([])
  expect(errors, errors.join('\n')).toEqual([])
})
