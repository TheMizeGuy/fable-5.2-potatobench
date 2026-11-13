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
        const tags = [...document.querySelectorAll<HTMLElement>('#ui .tag-wrap:not(.gone) .tag-at, #ui .yard-at:not(.gone) .yard-tag')].map(e => e.getBoundingClientRect())
        // With a pin of their own, the click is aimed just over their head, where a player aims: the pin is there,
        // whatever tag lies there too. Sharing one, the click goes to the shared pin.
        const p = own ? { x: a.x, y: a.y - 8 } : { x: head.left + head.width / 2, y: head.top + head.height / 2 }
        let tag = !!own && tags.some(b => p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom)
        let top = !!document.elementFromPoint(p.x, p.y)?.closest('.pin')
        // where the pin's face and a tag overlap, the pin is on top
        for (const b of tags) {
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

test('two lots weighed on the same day: each ticket is up the moment the game stops for it, one after the other', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await farmWithPeople(page)
  // Days run on until the next one weighs two lots (looked at on a copy of the farm first).
  const found = await game<boolean>(page, `(() => { const c = app.campaign
    for (let g = 0; g < 200 && !sim.seasonDone(c); g++) {
      c.incidents = []
      for (const a of sim.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
      const peek = structuredClone(c)
      if (sim.apply(app.world, peek, { t: 'day' }).events.filter(e => e.type === 'weighed').length >= 2) return true
      app.do({ t: 'day' })
      for (const l of c.lots) if (l.open) app.do({ t: 'sell', lot: l.id, frac: 1 })
    }
    return false })()`)
  test.skip(!found, 'no day weighs two lots this season')
  await putAway(page)
  // How long after the game stops each ticket is on the screen.
  await page.evaluate(() => {
    const g = globalThis as any
    g.__ticketWait = []
    let stoppedAt = -1
    let ran = false
    const tick = () => {
      const up = !!document.querySelector('#ui [data-testid="weighin"]')
      if (g.__county.app.speed > 0) ran = true
      if (ran && g.__county.app.speed === 0 && stoppedAt === -1) stoppedAt = performance.now()
      if (stoppedAt >= 0 && up) { g.__ticketWait.push(Math.round(performance.now() - stoppedAt)); stoppedAt = -2 }
      if (stoppedAt === -2 && !up) stoppedAt = performance.now()
      if (g.__ticketWait.length < 2) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await reach(page, `q.g().app.setSpeed(1)`)
  const ticket = page.getByTestId('weighin')
  // One ticket, then the other the moment the first is answered.
  const sold: string[] = []
  for (let k = 0; k < 2; k++) {
    const sell = page.locator('#ui .dialog:not(.out) [data-testid^="lot-sell-"]').first()
    await expect(sell).toBeVisible({ timeout: 15_000 })
    const id = (await sell.getAttribute('data-testid'))!
    expect(sold).not.toContain(id)
    sold.push(id)
    await sell.click()
    await expect(page.getByTestId(id)).toHaveCount(0)
  }
  const waits = await page.evaluate(() => (globalThis as any).__ticketWait as number[])
  expect(waits).toHaveLength(2)
  for (const w of waits) expect(w, `the ticket was up ${w} ms after the game stopped for it`).toBeLessThan(500)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the frost warning on a Sunday with barrels out is a key: the haul goes first and someone drives that day', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('begin-season').click()
  // tests/haulnow.test.ts: the farmer alone, to the first Sunday off with crop out in barrels.
  const field = await game<number>(page, `(() => { const c = app.campaign; app.setSpeed(0)
    for (let g = 0; g < 400 && !sim.seasonDone(c); g++) {
      c.incidents = []
      const s = c.season
      const f = s.fields.findIndex(x => x.inField >= 200 && !x.weighed)
      if (f >= 0 && !sim.workday(c, s)) return f
      app.do({ t: 'day' })
    }
    return -1 })()`)
  test.skip(field < 0, 'no Sunday with barrels out')
  await reach(page, 'q.g().app.setSpeed(0)')
  await putAway(page)
  const name = await game<string>(page, `sim.FIELD_NAMES[${field}]`)
  // The warning, as the evening before a frost brings it.
  await page.evaluate(([f, n]) => { const { app } = (globalThis as any).__county; const c = app.campaign
    app.alert(c, { day: c.season.day, type: 'frostBarrels', field: -1, level: 'warn', text: `Frost is forecast for the crop still in barrels: ${Math.round(c.season.fields[f].inField)} cwt in ${n}. Your crew hauls it in first, Sundays included, until it's all in.` }) }, [field, name] as const)
  const warning = notes(page).filter({ hasText: 'Frost tonight' })
  await expect(warning).toBeVisible()
  // The remedy is a key on the slip, weighed as every key is.
  const key = warning.getByTestId('alert-key')
  await expect(key).toHaveText('Haul it in now')
  await expect(key).toHaveAttribute('data-w', 'std')
  await key.click()
  expect(await game<{ kind: string; field: number }>(page, '({ kind: app.campaign.season.jobs[0].kind, field: app.campaign.season.jobs[0].field })')).toEqual({ kind: 'haul', field })
  // Answered at once, with who, how much and what the day off costs.
  await expect(notes(page).filter({ hasText: `You're hauling ${name} now. It's a day off, so it tires you as a working day does. One tractor brings in about` })).toBeVisible({ timeout: 1000 })
  await reach(page, `q.g().app.do({ t: 'day' }); q.g().app.setSpeed(0)`)
  expect(await game<boolean>(page, `app.campaign.season.worked.some(w => w.kind === 'haul' && w.field === ${field})`)).toBe(true)
  expect(errors, errors.join('\n')).toEqual([])
})

// The farmer alone, run to the first day `until` holds (c, s and f, the field with barrels out, in hand), and the frost
// warning brought up as the evening before a frost brings it. -1 when the season has no such day.
async function frostWhen(page: Page, until: string): Promise<{ field: number; name: string }> {
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('begin-season').click()
  const field = await game<number>(page, `(() => { const c = app.campaign; app.setSpeed(0)
    for (let g = 0; g < 400 && !sim.seasonDone(c); g++) {
      c.incidents = []
      const s = c.season
      const f = s.fields.findIndex(x => x.inField >= 200 && !x.weighed)
      if (f >= 0 && (${until})) return f
      app.do({ t: 'day' })
    }
    return -1 })()`)
  if (field < 0) return { field, name: '' }
  await reach(page, 'q.g().app.setSpeed(0)')
  await putAway(page)
  const name = await game<string>(page, `sim.FIELD_NAMES[${field}]`)
  await page.evaluate(([f, n]) => { const { app } = (globalThis as any).__county; const c = app.campaign
    app.alert(c, { day: c.season.day, type: 'frostBarrels', field: -1, level: 'warn', text: `Frost is forecast for the crop still in barrels: ${Math.round(c.season.fields[f].inField)} cwt in ${n}. Your crew hauls it in first, Sundays included, until it's all in.` }) }, [field, name] as const)
  return { field, name }
}

test('the frost key with the only tractor out digging: the digger stops for the haul, and the answer says so at once', async ({ page }) => {
  const errors = watchErrors(page)
  const { field, name } = await frostWhen(page, `sim.workday(c, s) && c.crew[0].rig === 'tractor' && s.jobs.some(j => j.id === c.crew[0].job && j.kind === 'dig')`)
  test.skip(field < 0, 'no day digging with barrels out')
  const dug = await game<number>(page, `app.campaign.season.jobs.find(j => j.id === app.campaign.crew[0].job).field`)
  const where = dug === field ? 'there' : await game<string>(page, `sim.FIELD_NAMES[${dug}]`)
  await notes(page).filter({ hasText: 'Frost tonight' }).getByTestId('alert-key').click()
  await expect(notes(page).filter({ hasText: `You're hauling ${name} now. You stop digging ${where} for it. One tractor brings in about` })).toBeVisible({ timeout: 1000 })
  expect(await game<{ kind: string; unit: number }>(page, '({ kind: app.campaign.season.jobs[0].kind, unit: app.campaign.season.jobs[0].unit })')).toEqual({ kind: 'haul', unit: 0 })
  expect(errors, errors.join('\n')).toEqual([])
})

test('the frost key with nobody able to drive says exactly why the barrels stay out', async ({ page }) => {
  const errors = watchErrors(page)
  const { field, name } = await frostWhen(page, 'true')
  test.skip(field < 0, 'no day with barrels out')
  await page.evaluate(() => { (globalThis as any).__county.app.campaign.crew[0].rest = 'now' })
  await notes(page).filter({ hasText: 'Frost tonight' }).getByTestId('alert-key').click()
  await expect(notes(page).filter({ hasText: `You're resting, worn out. The barrels in ${name} stay out tonight.` })).toBeVisible({ timeout: 1000 })
  expect(errors, errors.join('\n')).toEqual([])
})

test('the frost key pressed as a paper comes up: the answer is beside the pointer at once, and is the note once the paper is put away', async ({ page }) => {
  const errors = watchErrors(page)
  const { field, name } = await frostWhen(page, 'true')
  test.skip(field < 0, 'no day with barrels out')
  const key = notes(page).filter({ hasText: 'Frost tonight' }).getByTestId('alert-key')
  await expect(key).toBeVisible()
  const box = (await key.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  // The press lands in the moment the almanac opens over the notes.
  await page.keyboard.press('i')
  await expect(page.locator('#ui .dialog:not(.out)')).toBeVisible()
  await page.evaluate(() => (document.querySelector('#ui [data-testid="alert-key"]') as HTMLButtonElement).click())
  const tip = page.getByTestId('answer-tip')
  await expect(tip).toBeVisible({ timeout: 1000 })
  await expect(tip).toContainText(`hauling ${name} now.`)
  await page.keyboard.press('Escape')
  await expect(page.locator('#ui .dialog:not(.out)')).toHaveCount(0)
  await expect(notes(page).filter({ hasText: `hauling ${name} now.` })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('a right-click with nobody picked is answered: the field\'s order, or why not and how to send someone', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  await reach(page, `const { app } = q.g(); app.selectUnit(-1); app.select(-1)`)
  const rest = await game<number>(page, `app.campaign.season.fields.findIndex(f => f.status === 'rest')`)
  const spot = await landOf(page, rest)
  await page.mouse.click(spot.x, spot.y, { button: 'right' })
  await expect(notes(page).filter({ hasText: 'Nothing needs doing here right now. To send someone here, select them first.' })).toBeVisible({ timeout: 1000 })
  expect(errors, errors.join('\n')).toEqual([])
})

test('Escape undoes the nearest thing first: a popover, a card, Follow, then the menu; and a paper before its card', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  const id = await game<number>(page, `app.campaign.crew.find(u => u.kind === 'hand').id`)
  // Following someone, with a field's card open and the goals open over it.
  await reach(page, `const { app } = q.g(); app.selectUnit(${id}, 'land')`)
  await page.getByTestId('whois').getByTestId('whois-follow').click()
  const followed = () => page.evaluate(() => (globalThis as any).__countyField.following())
  expect(await followed()).toBe(id)
  await reach(page, `const { app } = q.g(); app.selectUnit(-1); app.select(0)`)
  await expect(page.getByTestId('card')).toBeVisible()
  await page.getByTestId('goal').click()
  const ladder = () => page.evaluate(() => document.querySelector('#ui [data-testid="goal"]')?.getAttribute('aria-expanded'))
  expect(await ladder()).toBe('true')
  await page.keyboard.press('Escape')
  expect(await ladder()).toBe('false')
  await expect(page.getByTestId('card')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('card')).toBeHidden()
  expect(await followed()).toBe(id)
  await page.keyboard.press('Escape')
  expect(await followed()).toBe(-1)
  await expect(page.getByTestId('menu')).toHaveCount(0)
  await page.waitForTimeout(1600)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  // A paper over a card goes first.
  await reach(page, `q.g().app.select(0)`)
  await page.keyboard.press('i')
  await expect(page.locator('#ui .dialog:not(.out)')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#ui .dialog:not(.out)')).toHaveCount(0)
  expect(await game<number[]>(page, 'app.selection')).toEqual([0])
  expect(errors, errors.join('\n')).toEqual([])
})

test('four stamps pressed in a row are answered by one line', async ({ page }) => {
  const errors = watchErrors(page)
  await farmWithPeople(page)
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(7, 30), ['spray', 'kill', 'sell']); app.setSpeed(0); app.campaign.incidents = []; app.select(-1)`)
  await putAway(page)
  const fields = (await game<number[]>(page, `app.needs().map((n, i) => n.need?.act === 'spray' && !app.campaign.season.jobs.some(j => j.field === i) ? i : -1).filter(i => i >= 0)`)).slice(0, 4)
  expect(fields.length).toBeGreaterThanOrEqual(3)
  for (const i of fields) await page.getByTestId(`badge-${i}`).dispatchEvent('click')
  await expect(notes(page).filter({ hasText: `Spraying ${fields.length} fields is on the work list.` })).toBeVisible()
  expect(await notes(page).filter({ hasText: /^Spraying [A-Z]/ }).count()).toBe(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the answer to a right-click is seen while a tutorial note is up, and before planting it says why', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'))
  await page.getByTestId('play').click()
  await page.getByTestId('guide-accept').click()
  // The notes before the season are answered as e2e/tutorial.spec.ts follows them: the note's own key, or what it
  // points at. In the season nothing is pressed: the guide runs the cold weeks itself, and the first note there is the
  // word to plant.
  for (let k = 0; k < 30 && !(await game<boolean>(page, `app.screen === 'season'`)); k++) {
    const slip = page.locator('#ui [data-testid="guide-slip"]').first()
    const key = slip.locator('[data-testid="guide-noted"]').first()
    const target = await slip.getAttribute('data-target').catch(() => null)
    if (await key.isVisible().catch(() => false)) await key.click({ timeout: 3000 }).catch(() => {})
    else if (target) await page.locator(`#ui [data-testid="${target}"]`).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
  await expect(page.locator('#ui [data-testid="guide-slip"][data-lesson="word"]')).toBeVisible({ timeout: 20_000 })
  expect(await game<string>(page, `app.screen + ' ' + document.getElementById('ui').className + ' ' + (document.querySelector('#ui [data-testid="guide-slip"]')?.getAttribute('data-lesson') ?? '')`)).toMatch(/^season .*noting/)
  // (The tutorial starts when planting is ready, so the season's first note is the word to plant: the soil is fit.
  // A field with nothing to order is asked about here, and the cold weeks before planting in the test below.)
  const rest = await game<number>(page, `app.campaign.plans.findIndex((p, i) => p.crop === 'rest' && sim.held(app.campaign, i))`)
  const at = await landOf(page, rest)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const tip = page.getByTestId('answer-tip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('To send someone here, select them first.')
  expect(errors, errors.join('\n')).toEqual([])
})

test('before planting, a right-click on a potato field says why it is too early', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page)
  // A guided first season stopped on its first day, the clock the test's (as a player's who took it from the guide).
  await reach(page, `const guide = window.__countyGuide; guide.reset(); guide.skipTo('word'); guide.takeClock(); const { app } = q.g(); app.newGame(1987, 3); app.do({ t: 'begin' }); app.campaign.incidents = []; app.setSpeed(0)`)
  await putAway(page)
  const field = await game<number>(page, `app.campaign.plans.findIndex((p, i) => p.crop === 'potato' && sim.held(app.campaign, i) && sim.fieldInfo(app.campaign, i).status === 'idle')`)
  const name = await game<string>(page, `sim.FIELD_NAMES[${field}]`)
  const at = await landOf(page, field)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await expect(page.locator('#ui [data-testid="answer-tip"], #ui .notes .alert').filter({ hasText: `It's too early to plant ${name}.` }).first()).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})
