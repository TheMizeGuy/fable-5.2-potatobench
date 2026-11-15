// The owner, 14 November: "the freedom like whats building etc how do you get upgrades"; "the icons stay over the
// character at too close of a range and block their models"; "order it? order what?". These hold what answers them:
// the build menu a press away with a purchase one press more, a first-year farm able to build on the bank's money,
// people with nothing to do offered work by name, and a person seen from near wearing their name, not a face.
import { test, type Page } from './base.ts'
import { expect, open, putAway, reach, startSeason, watchErrors } from './helpers.ts'

async function game<T>(page: Page, expr: string): Promise<T> {
  return page.evaluate(`(() => { const { app, sim } = window.__county; const c = app.campaign; return ${expr} })()`) as Promise<T>
}

test('the build menu is one press from the season and a purchase is one more, on the bank\'s money in a first year', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the bar is a desk\'s')
  const errors = watchErrors(page)
  await startSeason(page)
  await reach(page, `q.g().app.setSpeed(0)`)
  await putAway(page)
  expect(await game<number>(page, 'c.cash'), 'a first season is on the loan').toBeLessThan(0)
  // The bar: Build first, and six tabs in all.
  expect(await page.locator('#ui .mainbar [data-testid]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.testid))).toEqual(['bar-build', 'bar-todo', 'bar-fields', 'bar-people', 'bar-money', 'bar-menu'])
  await page.getByTestId('bar-build').click()
  const sheet = page.getByTestId('build')
  await expect(sheet).toBeVisible()
  // What can be spent is said, and every building and machine is on it with its price.
  await expect(page.getByTestId('build-spend')).toContainText(/\$\d/)
  for (const id of ['build-house', 'build-shed', 'build-bunk', 'build-packing', 'build-pond', 'build-stand', 'build-station', 'build-road', 'buy-boom', 'buy-harvester', 'buy-truck', 'hire-hand', 'hire-operator']) await expect(page.getByTestId(id)).toContainText(/\$\d/)
  // Every row lies inside the sheet: no key or caption runs past its edge.
  const edge = (await sheet.boundingBox())!
  const past = await page.locator('#ui [data-testid="build"] .bm-get > *').evaluateAll((els, right) => els.filter(e => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().right > right + 0.5).map(e => (e.textContent ?? '').slice(0, 40)), edge.x + edge.width)
  expect(past, 'keys and captions past the sheet\'s right edge').toEqual([])
  // One press builds: the weather station is started, paid for with the bank's money, and on the work list.
  const owed = await game<number>(page, '-c.cash')
  await page.getByTestId('build-station-go').click()
  await expect(page.getByTestId('build-said')).toContainText('weather station is started')
  expect(await game<string[]>(page, 'c.buildings.map(b => b.kind)')).toContain('station')
  expect(await game<number>(page, '-c.cash')).toBeGreaterThan(owed + 900)
  expect(await game<boolean>(page, `c.season.jobs.some(j => j.kind === 'build')`)).toBe(true)
  await expect(page.getByTestId('build-station')).toContainText('Going up')
  // And one press buys a machine, in the season.
  await page.getByTestId('buy-boom-go').click()
  expect(await game<boolean>(page, 'c.upgrades.boom')).toBe(true)
  await expect(page.getByTestId('buy-boom')).toContainText('Owned')
  // What cannot be had says why, in a few words, where its key would be.
  await expect(page.getByTestId('buy-tractor2')).toContainText('Needs the machine shed')
  await expect(page.getByTestId('more-land')).toContainText('each spring')
  // Woods for sale are bought here too, in the season: a quarter down, and the land is the farm's to clear.
  const lot = await game<number>(page, `sim.TRACTS.find(i => sim.PARCELS[i].holding === 'sale')`)
  await expect(page.getByTestId(`land-${lot}`)).toContainText(/\$[\d,]+ down/)
  await page.getByTestId(`land-${lot}-go`).click()
  expect(await game<string>(page, `c.fields[${lot}].tenure`)).toBe('owned')
  await expect(page.getByTestId('build-said')).toContainText('is yours')
  await expect(page.getByTestId(`fell-${lot}`)).toContainText('Fell it')
  expect(errors, errors.join('\n')).toEqual([])
})

test('people with nothing to do are offered work by name, and a key gives it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desk')
  const errors = watchErrors(page)
  await startSeason(page)
  // Every potato field planted, and the farmer with no order.
  await reach(page, `const { app, sim } = q.g(); const c = app.campaign
    for (let k = 0; k < 90 && c.season.fields.some((f, i) => sim.isField(c, i) && f.status === 'idle'); k++) { c.incidents = []; for (const a of sim.advise(app.world, c)) if (a.act === 'plant') app.order('plant', { fields: [a.field] }); app.do({ t: 'day' }) }
    c.incidents = []; for (const j of [...c.season.jobs]) app.do({ t: 'cancel', id: j.id }); app.do({ t: 'routine', kind: 'scout', auto: false }); app.do({ t: 'routine', kind: 'hill', auto: false }); app.setSpeed(0)`)
  await putAway(page)
  const idle = page.getByTestId('idle')
  await expect(idle).toBeVisible({ timeout: 10_000 })
  await expect(idle).toContainText('You are idle')
  // Each job is a key that says what it is, and names its place to a reader and on its slip.
  await expect(page.getByTestId('idle-do-0')).toHaveText(/^(Cut brush|Pick rocks)$/)
  await expect(page.getByTestId('idle-do-0')).toHaveAttribute('aria-label', /^(Cut brush|Pick rocks): .+/)
  await expect(page.getByTestId('idle-do-1')).toHaveText('Cut trees')
  // It is one line under the goal, no wider than the board it hangs from.
  const row = (await idle.boundingBox())!, board = (await page.locator('#ui .topbar .almanac > .mount').boundingBox())!
  expect(row.height).toBeLessThan(52)
  expect(row.x + row.width).toBeLessThanOrEqual(board.x + board.width + 1)
  const said = (await page.getByTestId('idle-do-0').textContent())!
  const kind = /^Cut brush/.test(said) ? 'brush' : 'rocks'
  await page.getByTestId('idle-do-0').click()
  expect(await game<string[]>(page, 'c.season.jobs.map(j => j.kind)')).toContain(kind)
  await expect(idle).toHaveCount(0)
  // The slip never says there is nothing to do.
  await expect(page.getByTestId('goal')).not.toContainText(/nothing to do/i)
  // And it steps down while a card is open.
  await reach(page, `const { app } = q.g(); for (const j of [...app.campaign.season.jobs]) app.do({ t: 'cancel', id: j.id })`)
  await putAway(page)
  await expect(idle).toBeVisible()
  await page.getByTestId('field-0').click()
  await expect(page.getByTestId('card')).toBeVisible()
  await expect(idle).toBeHidden()
  expect(errors, errors.join('\n')).toEqual([])
})

test('seen from near, a person wears their name over their head and no face covers them', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'read through the 3D view\'s hooks')
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1600, height: 900 })
  await startSeason(page)
  await reach(page, `const { app } = q.g(); app.campaign.cash += 9000; app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'day' }); app.setSpeed(0); app.select(-1); app.selectUnit(-1)`)
  await putAway(page)
  // From the farm's own view a person is a face pin.
  type Hooks = { __countyField: { unitPin(id: number): { x: number; y: number; visible: boolean }; unitFoot(id: number): { x: number; y: number }; rig: { moving(): boolean } } }
  const seen = () => page.evaluate(() => {
    const F = (globalThis as unknown as Hooks).__countyField
    const w = document.querySelector<HTMLElement>('#ui .plate-layer [data-testid="pin-1"]')?.closest<HTMLElement>('.pin-at')
    const box = (e: Element | null | undefined) => { const r = e?.getBoundingClientRect(); return r && r.width > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null }
    const tip = F.unitPin(1), foot = F.unitFoot(1)
    return { near: !!w?.classList.contains('near'), gone: !w || w.classList.contains('gone'), head: box(w?.querySelector('.head')), name: box(w?.querySelector('.name')), said: w?.querySelector('.name')?.textContent ?? '', tip, foot, tall: foot.y - tip.y }
  })
  // Brought near: their row of the People sheet takes the camera to them.
  await page.getByTestId('bar-people').click()
  await page.getByTestId('people-go-1').click()
  await page.waitForTimeout(600)
  await page.waitForFunction(() => !(globalThis as unknown as Hooks).__countyField.rig.moving(), null, { timeout: 15_000 })
  await reach(page, `q.g().app.selectUnit(-1)`)
  await page.waitForTimeout(600)
  // The wheel, over them, until they stand tall on the screen.
  for (let n = 0; n < 14 && (await seen()).tall < 70; n++) {
    const at = (await seen()).tip
    await page.mouse.move(at.x, at.y + 20)
    await page.mouse.wheel(0, -500)
    await page.waitForTimeout(500)
  }
  await page.mouse.move(8, 400)
  await page.waitForTimeout(700)
  const s = await seen()
  expect(s.gone, JSON.stringify(s)).toBe(false)
  expect(s.tall, 'their height on the screen, feet to the top of the head').toBeGreaterThan(48)
  expect(s.near).toBe(true)
  expect(s.head, 'no face is drawn').toBeNull()
  expect(s.name, 'their name is').not.toBeNull()
  expect(s.said.length).toBeGreaterThan(1)
  // The name stands clear above the head: none of it lies between the top of the head and the feet.
  expect(s.name!.b, `the name's foot (${Math.round(s.name!.b)}) against the top of the head (${Math.round(s.tip.y)})`).toBeLessThanOrEqual(s.tip.y + 1)
  expect(errors, errors.join('\n')).toEqual([])
})
