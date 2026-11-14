// The long day, on the game's own clock: a day of work at the first speed is three minutes, and its work is
// watched as it is done (tests/longday.test.ts holds the motion itself to its measures, without a picture; this is
// the game in a browser: the clock's keys, the hour, a pause, an order given part way through the day).
import { expect, test, type Page } from './base.ts'
import { open, putAway, reach, watchErrors } from './helpers.ts'

test.use({ days: 'long' })

type Info = { dayT: number; pending: number; units: { id: number; x: number; z: number; foot: boolean; fade: number }[]; rigs: { key: string; x: number; z: number; work: string; fade: number }[] }
const state = (page: Page) => page.evaluate(() => {
  const g = globalThis as unknown as { __county: { app: { dayProgress: number; speed: number; daySeconds(): number; campaign: { season: { day: number; clock?: { at: number }; jobs: { kind: string; field: number; done: number }[] } } } }; __countyField: { info(): Info; plans(): string[] } }
  const s = g.__county.app.campaign.season
  return { at: g.__county.app.dayProgress, speed: g.__county.app.speed, daySec: g.__county.app.daySeconds(), day: s.day, begun: !!s.clock, upTo: s.clock?.at ?? -1, jobs: s.jobs.map(j => `${j.kind}@${j.field}`), info: g.__countyField.info(), plans: g.__countyField.plans() }
})

test('a day of work at 1× is three minutes: the planter is watched at its work, a pause holds everything where it is, and an order given at mid-morning is set out for then', async ({ page, isMobile }) => {
  test.skip(isMobile, 'run at the desk')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await open(page)
  // A farm with a hired hand, on the first day planting is wanted, the order given, the clock stopped at daybreak.
  await reach(page, `
    const { app, sim } = q.g()
    app.newGame(1987, 3)
    const c = app.campaign
    c.cash += 40000
    app.do({ t: 'hire', kind: 'hand' })
    app.do({ t: 'begin' })
    for (let n = 0; n < 300 && !sim.seasonDone(c); n++) {
      c.incidents = []
      const want = sim.advise(app.world, c).filter(a => a.act === 'plant' && a.field >= 0)
      if (want.length) { app.do({ t: 'job', kind: 'plant', field: want[0].field }); break }
      app.do({ t: 'day' })
    }
    app.setSpeed(0)`)
  await putAway(page)

  // The clock's keys say what they are: the first speed, and the two that run the days by.
  await expect(page.getByTestId('speed-1')).toHaveText(/^1×/)
  await expect(page.getByTestId('speed-2')).toHaveText(/^6×/)
  await expect(page.getByTestId('speed-3')).toHaveText(/^60×/)
  const before = await state(page)
  expect(before.daySec).toBeGreaterThanOrEqual(179.9)
  expect(before.daySec).toBeLessThanOrEqual(240)

  await page.getByTestId('speed-1').click()
  const t0 = Date.now()
  // The day begins with its morning: the hour is on the date, and the planter is at its rows within half a minute.
  await expect(page.getByTestId('hour')).toHaveText(/6 AM|7 AM/, { timeout: 10_000 })
  await expect.poll(async () => (await state(page)).info.rigs.some(r => r.work === 'plant'), { timeout: 40_000 }).toBe(true)
  const working = await state(page)
  expect(working.day, 'still the same day').toBe(before.day)
  expect(working.begun).toBe(true)
  // The day keeps the clock's time: so many seconds in, that share of the day.
  const secs = (Date.now() - t0) / 1000
  expect(working.at).toBeGreaterThan((secs / working.daySec) * 0.8 - 0.02)
  expect(working.at).toBeLessThan((secs / working.daySec) * 1.2 + 0.02)
  // The ground is sown behind the planter, not all at once: fewer hills are still to show as it goes.
  const toShow = working.info.pending
  expect(toShow).toBeGreaterThan(40)
  await page.waitForTimeout(12_000)
  const later = await state(page)
  expect(later.info.pending).toBeLessThan(toShow)
  expect(later.info.pending).toBeGreaterThan(0)
  const rigA = later.info.rigs.find(r => r.work === 'plant')!
  expect(Math.hypot(rigA.x - working.info.rigs.find(r => r.key === rigA.key)!.x, rigA.z - working.info.rigs.find(r => r.key === rigA.key)!.z), 'the planter has moved on').toBeGreaterThan(20)

  // A pause holds the day and everyone in it where they are; the day goes on from there.
  await page.keyboard.press('Space')
  await page.waitForTimeout(500)
  const held = await state(page)
  expect(held.speed).toBe(0)
  await page.waitForTimeout(2500)
  const still = await state(page)
  expect(still.at).toBe(held.at)
  for (const r of still.info.rigs) { const b = held.info.rigs.find(x => x.key === r.key)!; expect(Math.hypot(r.x - b.x, r.z - b.z), `${r.key} stands still`).toBeLessThan(0.05) }
  for (const u of still.info.units) { const b = held.info.units.find(x => x.id === u.id)!; expect(Math.hypot(u.x - b.x, u.z - b.z), `person ${u.id} stands still`).toBeLessThan(0.05) }
  await page.keyboard.press('Space')
  await expect.poll(async () => (await state(page)).at, { timeout: 5000 }).toBeGreaterThan(held.at)

  // An order given now is set out for now: the hand, who had nothing to do, is on the way within seconds, the farm's
  // own count has the morning's planting, and the planter is not moved by it.
  const idle = (await state(page)).info.units.find(u => u.id === 1)!
  const rigB = (await state(page)).info.rigs.find(r => r.work === 'plant')!
  const said = await page.evaluate(() => {
    const g = globalThis as unknown as { __county: { app: { do(c: object): { ok: boolean; err?: string }; campaign: { season: { fields: { status: string }[] } } } } }
    const f = g.__county.app.campaign.season.fields.findIndex(x => x.status === 'rest')
    return g.__county.app.do({ t: 'job', kind: 'rocks', field: f })
  })
  expect(said.ok, said.err).toBe(true)
  await page.waitForTimeout(300)
  const after = await state(page)
  expect(after.upTo, 'the farm was brought up to the moment of the order').toBeGreaterThan(0.1)
  expect(after.plans.join(' | ')).toMatch(/hand1 work: rocks@/)
  const rigC = after.info.rigs.find(r => r.key === rigB.key)!
  expect(Math.hypot(rigC.x - rigB.x, rigC.z - rigB.z), 'the planter went on as it was').toBeLessThan(12)
  await expect.poll(async () => { const u = (await state(page)).info.units.find(x => x.id === 1)!; return Math.hypot(u.x - idle.x, u.z - idle.z) }, { timeout: 8000 }).toBeGreaterThan(3)

  // The faster speeds run the days by, and the first speed is a long day again.
  // (at the second a day of work is half a minute, and still watched as it is worked)
  await page.getByTestId('speed-2').click()
  await expect.poll(async () => (await state(page)).day, { timeout: 40_000 }).toBeGreaterThan(before.day)
  await page.getByTestId('speed-1').click()
  await page.waitForTimeout(1500)
  const again = await state(page)
  expect(again.daySec).toBeGreaterThanOrEqual(179.9)
  await expect(page.getByTestId('hour')).toHaveText(/AM|PM/)
  expect(errors, errors.join('\n')).toEqual([])
})
