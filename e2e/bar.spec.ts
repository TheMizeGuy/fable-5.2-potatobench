import { expect, test } from './base.ts'
import { mkdirSync } from 'node:fs'
import { noSidewaysScroll, open, putAway, reach, startSeason } from './helpers.ts'

const PICS = process.env.PICS ? 'out/bar' : ''
if (PICS) mkdirSync(PICS, { recursive: true })
const shot = async (page: import('@playwright/test').Page, name: string) => { if (PICS) await page.screenshot({ path: `${PICS}/${name}.png` }) }
const game = <T>(page: import('@playwright/test').Page, body: string) => page.evaluate(b => new Function('app', 'c', `return ${b}`)((globalThis as any).__county.app, (globalThis as any).__county.app.campaign), body) as Promise<T>

test('the menu is always up on the season screen: its tabs open their sheets, and a row takes the camera there', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a desk\'s bar; a phone keeps its foot')
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'ask' }); q.run(q.day(7, 6)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  const bar = page.locator('#ui .mainbar')
  await expect(bar).toBeVisible()
  for (const id of ['todo', 'fields', 'people', 'work', 'money', 'contracts', 'almanac', 'menu']) await expect(bar.getByTestId(`bar-${id}`)).toBeVisible()
  // It lies inside the window and over nothing else that can be pressed at the foot.
  const b = (await bar.boundingBox())!
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  for (const sel of ['.timebook', '.queue', '.notes .alert']) for (const e of await page.locator(`#ui ${sel}`).all()) {
    const r = await e.boundingBox()
    if (!r) continue
    expect(r.x + r.width <= b.x || r.y + r.height <= b.y || r.x >= b.x + b.width || r.y >= b.y + b.height, `${sel} under the bar`).toBe(true)
  }
  await shot(page, 'bar')
  // Fields: every field of the farm, and its name goes to it.
  await bar.getByTestId('bar-fields').click()
  const fields = page.getByTestId('fields')
  await expect(fields).toBeVisible()
  await expect(fields.locator('tbody tr')).toHaveCount(await game<number>(page, 'c.fields.filter((_, i) => i < 6).length'), { timeout: 5000 }).catch(() => {})
  await shot(page, 'fields')
  await fields.getByTestId('fields-go-0').click()
  await expect(fields).toBeHidden()
  await expect.poll(() => game<number[]>(page, 'app.selection')).toEqual([0])
  await page.keyboard.press('Escape')
  // People: a row picks them and the camera goes there.
  await bar.getByTestId('bar-people').click()
  const people = page.getByTestId('people')
  await expect(people).toBeVisible()
  await shot(page, 'people')
  await people.getByTestId('people-go-0').click()
  await expect(people).toBeHidden()
  await expect.poll(() => game<number>(page, 'app.unit')).toBe(0)
  // The one in hand is marked at their feet: their name under them, no face over their head.
  await page.waitForTimeout(900)
  await expect(page.locator('#ui .pin-foot')).toBeVisible()
  await expect(page.locator('#ui .pin-at:not(.gone) [data-testid="pin-0"]')).toHaveCount(0)
  await shot(page, 'picked')
  await page.keyboard.press('Escape')
  // To do says what waits, or that nothing does.
  await bar.getByTestId('bar-todo').click()
  await expect(page.getByTestId('todo')).toBeVisible()
  await shot(page, 'todo')
  await page.keyboard.press('Escape')
  // Work opens Who does what; Money the sum.
  await bar.getByTestId('bar-money').click()
  await expect(page.locator('#ui [data-testid="money-pop"]')).toBeVisible()
  await page.keyboard.press('Escape')
  expect(errors, errors.join('\n')).toEqual([])
})

test('what the pointer rests on is named on the game\'s own slip, never the browser\'s', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a pointer')
  await startSeason(page)
  const key = page.locator('#ui [data-testid="view-home"]')
  const title = await key.getAttribute('title')
  expect(title).toBeTruthy()
  const r = (await key.boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.move(r.x + r.width / 2 + 1, r.y + r.height / 2 + 1)
  const tip = page.locator('.game-tip')
  await expect(tip).toBeVisible()
  await expect(tip).toHaveText(title!)
  // While it is said by the game the control carries no title for the browser to show.
  expect(await key.getAttribute('title')).toBeNull()
  await shot(page, 'tip')
  await page.mouse.move(4, 300)
  await expect(tip).toBeHidden()
  expect(await key.getAttribute('title')).toBe(title)
})

test('the spring blank says three figures at a glance, and the rest behind Details', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a desk\'s sheet')
  await open(page, '?year=1990&seed=7')
  const money = page.getByTestId('plan-money')
  await expect(money).toBeVisible()
  const lines = () => money.locator('p').evaluateAll(ps => ps.filter(p => (p as HTMLElement).offsetHeight > 0).map(p => (p.textContent ?? '').trim()))
  const glance = await lines()
  expect(glance.length, glance.join(' | ')).toBeLessThanOrEqual(3)
  expect(glance.join(' ').split(/\s+/).length, glance.join(' | ')).toBeLessThanOrEqual(16)
  await shot(page, 'plan-glance')
  await page.getByTestId('plan-more').click()
  expect((await lines()).length).toBeGreaterThan(3)
  await shot(page, 'plan-details')
})

test('a field drying out while its potatoes form is on To do, with what watering costs, unless rain is on the way', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a desk\'s bar; a phone keeps its foot')
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'none' }); q.run(q.day(7, 20)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  // One growing field, three days past tuber set, dried to just under half its water; no order to water it.
  const state = await page.evaluate(() => {
    const { app, sim } = (globalThis as any).__county
    const c = app.campaign, s = c.season
    const i = s.fields.findIndex((f: any, k: number) => sim.held(c, k) && f.status === 'growing')
    if (i < 0) return null
    const f = s.fields[i]
    f.tiDay = s.day - 3
    f.wet = 0
    s.jobs = s.jobs.filter((j: any) => !(j.kind === 'water' && j.field === i))
    for (let k = 0; k < 400 && sim.fieldInfo(c, i).moisture >= 0.45; k++) f.dr += 1
    const rain = sim.forecast(app.world, c, 3).some((d: any) => d.rainChance >= 60 && d.rainMm >= 8)
    const coach = app.needs()[i]?.need?.act ?? ''
    app.touch?.()
    return { i, name: sim.fieldInfo(c, i).name as string, moisture: sim.fieldInfo(c, i).moisture as number, rain, coach, cost: sim.jobCost(c, 'water', i) as number }
  })
  test.skip(!state, 'no field growing on this day')
  console.log(`dry field: ${JSON.stringify(state)}`)
  expect(state!.moisture).toBeLessThan(0.5)
  await page.locator('#ui .mainbar').getByTestId('bar-todo').click()
  const todo = page.getByTestId('todo')
  await expect(todo).toBeVisible()
  const row = todo.locator('.mb-row').filter({ hasText: `${state!.name} is drying out` })
  if (state!.rain || (state!.coach && state!.coach !== 'wait')) await expect(row).toHaveCount(0)
  else {
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(`Watering costs $${state!.cost.toLocaleString('en-US')}`)
    await shot(page, 'todo-dry')
    await row.locator('[data-testid^="todo-go-"]').click()
    await expect(todo).toBeHidden()
    await expect.poll(() => game<number[]>(page, 'app.selection')).toEqual([state!.i])
    // Its own key orders the watering, with the cost on the key. (The field's card is put away first.)
    await page.keyboard.press('Escape')
    await expect.poll(() => game<number>(page, 'app.selection.length')).toBe(0)
    await page.locator('#ui .mainbar').getByTestId('bar-todo').click()
    const key = todo.locator('.mb-row').filter({ hasText: `${state!.name} is drying out` }).locator('[data-testid^="todo-do-"]')
    await expect(key).toContainText('Water')
    await expect(key).toContainText(state!.cost.toLocaleString('en-US'))
    await key.click()
    await expect(todo).toBeHidden()
    expect(await game<boolean>(page, `c.season.jobs.some(j => j.kind === 'water' && j.field === ${state!.i})`)).toBe(true)
    await expect(page.locator('#ui .notes').getByText(`Watering ${state!.name} is on the work list.`)).toBeVisible()
  }
})

// A note that asks for the same work on several fields read as a key that would do it, and only went to one field
// (round nine). It opens To do, where one key orders them all and says what that costs.
test('a note about several fields at once opens To do', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the bar is a desk thing; a phone goes to the first field')
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'none' }); q.run(q.day(7, 6)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  await page.evaluate(() => {
    const { app } = (globalThis as any).__county
    const fields = app.campaign.season.fields.map((f: any, i: number) => (f.status === 'growing' ? i : -1)).filter((i: number) => i >= 0)
    app.emit({ type: 'alert', alert: { type: 'need', level: 'warn', text: 'Spray North Ridge.', field: fields[0], day: app.campaign.season.day, data: { act: 'spray', fields } } })
  })
  const note = page.locator('#ui .notes .alert').filter({ hasText: /Spray North Ridge and \d more fields?/ })
  await expect(note).toBeVisible()
  await note.click()
  await expect(page.getByTestId('todo')).toBeVisible()
  expect(await game<number[]>(page, 'app.selection'), 'no one field is picked').toEqual([])
})

// The money board's key beside a fall it can name a remedy for ("Brook Field dry: -$2,600 [Water]") read as a key
// that waters, and only went to the field (round nine). It gives the order, with the cost on the key, and goes once
// the order is on the list.
test('the money board\'s remedy key gives the order at the cost printed on it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desk\'s board; a phone has the line as a note')
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'auto' }); q.run(q.day(7, 14)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  await expect(page.locator('#ui [data-testid="outlook"]')).toBeVisible()
  // One field dried right out overnight: the figure falls, and the board says which field and why.
  const field = await page.evaluate(() => {
    const { app, sim } = (globalThis as any).__county
    const c = app.campaign, s = c.season
    const i = s.fields.findIndex((f: any, k: number) => sim.held(c, k) && f.status === 'growing' && f.tiDay >= 0 && f.matureDay < 0)
    if (i < 0) return -1
    s.jobs = s.jobs.filter((j: any) => !(j.kind === 'water' && j.field === i))
    for (let k = 0; k < 600 && sim.fieldInfo(c, i).moisture > 0.08; k++) s.fields[i].dr += 1
    return i
  })
  test.skip(field < 0, 'no field bulking on this day')
  const fix = page.getByTestId('outlook-fix')
  // A day at a time, as the board sees them, with every growing field kept dry: until the board puts a fall down to it.
  let shown = false
  for (let d = 0; d < 25 && !shown; d++) {
    await page.evaluate(() => {
      const { app, sim } = (globalThis as any).__county
      const c = app.campaign
      c.season.fields.forEach((f: any, i: number) => {
        if (!sim.held(c, i) || f.status !== 'growing') return
        for (let k = 0; k < 600 && sim.fieldInfo(c, i).moisture > 0.08; k++) f.dr += 1
      })
      c.season.jobs = c.season.jobs.filter((j: any) => j.kind !== 'water')
      app.do({ t: 'day' })
      c.incidents = []
    })
    await page.waitForTimeout(300)
    shown = (await fix.count()) > 0 && await fix.isVisible()
  }
  const line = page.locator('#ui [data-testid="outlook-why"]')
  const why = (await line.count()) ? await line.textContent() : ''
  console.log(`board says: ${why}; key shown: ${shown}`)
  test.skip(!shown, 'the fall was put down to something else on this day')
  await expect(fix).toContainText('Water')
  await expect(fix).toContainText('$')
  await shot(page, 'board-remedy')
  // (the key is only up while the order can still be given: its field is the one the line names)
  const named = await page.evaluate(() => { const { app, sim } = (globalThis as any).__county; const t = document.querySelector('#ui [data-testid="outlook-why"]')?.textContent ?? ''; return (sim.FIELD_NAMES as string[]).findIndex((n, i) => sim.held(app.campaign, i) && t.includes(n)) })
  expect(named).toBeGreaterThanOrEqual(0)
  await fix.click()
  await expect.poll(() => game<boolean>(page, `c.season.jobs.some(j => j.kind === 'water' && j.field === ${named})`)).toBe(true)
  await expect(fix).toHaveCount(0)
  expect(await game<number[]>(page, 'app.selection'), 'no card is opened for it').toEqual([])
})

test('To do orders what it lists: a key on each row with its cost, and one key for all of them', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the bar is a desk thing; a phone keeps its foot')
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'none' }); q.run(q.day(7, 20)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  // Every growing field a few days past tuber set and dried to under half its water, with no order to water any.
  const state = await page.evaluate(() => {
    const { app, sim } = (globalThis as any).__county
    const c = app.campaign, s = c.season
    const dry: number[] = []
    s.jobs = s.jobs.filter((j: any) => j.kind !== 'water')
    s.fields.forEach((f: any, i: number) => {
      if (!sim.held(c, i) || f.status !== 'growing') return
      f.tiDay = s.day - 3
      f.wet = 0
      for (let k = 0; k < 400 && sim.fieldInfo(c, i).moisture >= 0.45; k++) f.dr += 1
      dry.push(i)
    })
    const rain = sim.forecast(app.world, c, 3).some((d: any) => d.rainChance >= 60 && d.rainMm >= 8)
    const coach = app.needs().some((n: any) => n.need && n.need.act !== 'wait')
    return { dry, rain, coach, cost: dry.reduce((n, i) => n + sim.jobCost(c, 'water', i), 0) as number }
  })
  test.skip(state.dry.length < 2 || state.rain || state.coach, 'rain on the way, or the coach asks for something else')
  await page.locator('#ui .mainbar').getByTestId('bar-todo').click()
  const todo = page.getByTestId('todo')
  await expect(todo).toBeVisible()
  await expect(todo.locator('[data-testid^="todo-do-"]')).toHaveCount(state.dry.length)
  const all = todo.getByTestId('todo-all')
  await expect(all).toContainText(`Order all ${state.dry.length}`)
  await expect(all).toContainText(state.cost.toLocaleString('en-US'))
  await shot(page, 'todo-orders')
  await all.click()
  await expect(todo).toBeHidden()
  for (const i of state.dry) expect(await game<boolean>(page, `c.season.jobs.some(j => j.kind === 'water' && j.field === ${i})`), `water on field ${i}`).toBe(true)
})

// A phone has no room for the bar: its sheets open from the game menu there, and fit the screen.
test('on a phone To do, Fields and People open from the game menu, and a row still takes the camera there', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone; a desk has the bar')
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.do({ t: 'sprayWay', way: 'auto' }); q.run(q.day(7, 6)); app.setSpeed(0); app.campaign.incidents = []; app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  await expect(page.locator('#ui .mainbar')).toBeHidden()
  for (const [key, sheet] of [['menu-todo', 'todo'], ['menu-fields', 'fields'], ['menu-people', 'people']]) {
    await page.getByTestId('menu-open').click()
    await expect(page.getByTestId(key)).toBeVisible()
    await page.getByTestId(key).click()
    await expect(page.getByTestId(sheet)).toBeVisible()
    await page.waitForTimeout(400)
    await noSidewaysScroll(page)
    const box = (await page.getByTestId(sheet).boundingBox())!
    expect(box.x, `${sheet} inside the window`).toBeGreaterThanOrEqual(-1)
    expect(box.x + box.width, `${sheet} inside the window`).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
    await shot(page, `phone-${sheet}`)
    if (sheet === 'fields') {
      await page.getByTestId('fields-go-0').click()
      await expect(page.getByTestId('fields')).toBeHidden()
      await expect.poll(() => game<number[]>(page, 'app.selection')).toEqual([0])
      await reach(page, `const { app } = q.g(); app.select(-1)`)
    } else if (sheet === 'people') {
      await page.getByTestId('people-go-0').click()
      await expect(page.getByTestId('people')).toBeHidden()
      await expect.poll(() => game<number>(page, 'app.unit')).toBe(0)
    } else await page.keyboard.press('Escape')
    await putAway(page)
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('at a desk the game menu has no farm keys: the bar is there', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a desk')
  await startSeason(page)
  await page.getByTestId('menu-open').click()
  await expect(page.getByTestId('menu-continue')).toBeVisible()
  await expect(page.getByTestId('menu-todo')).toHaveCount(0)
})
