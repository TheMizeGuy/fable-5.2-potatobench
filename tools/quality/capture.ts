// Captures every screen of the game, in every state and at every size, on the real GPU, for review.
// Usage: node tools/quality/capture.ts <base url> <out dir> [name filter, or several joined by commas]
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const [base, out, filter = ''] = process.argv.slice(2)
if (!base || !out) throw new Error('usage: capture.ts <base url> <out dir> [name filter]')
mkdirSync(out, { recursive: true })

interface Size { width: number; height: number; touch?: boolean; scale?: number }
const SIZES: Record<string, Size> = {
  desk: { width: 1440, height: 900 },
  phone: { width: 390, height: 844, touch: true, scale: 2 },
  wide: { width: 1920, height: 1080 },
  laptop: { width: 1280, height: 720 },
  small: { width: 1024, height: 700 },
  tablet: { width: 820, height: 1180, touch: true },
  land: { width: 844, height: 390, touch: true, scale: 2 },
  tiny: { width: 320, height: 640, touch: true, scale: 2 },
}
const MAIN = ['desk', 'phone']
const ALL = Object.keys(SIZES)

type Step = (page: Page, size: string) => Promise<void>
interface State { name: string; what: string; sizes: string[]; run: Step }

async function selectField(page: Page, _size: string, i: number): Promise<void> {
  await page.getByTestId(`field-${i}`).first().click()
}

const july: Step = async page => { await q(page, `q.start(1987, 3); q.run(q.day(6, 12))`); await closeAll(page) }

// A spring on the bigger farm: the intervale and a Dufour field rented, a hand and an operator on the second tractor,
// the packer's Kennebec contract signed and two home fields planned to Kennebec. The cash for the tractor is put in
// by hand; these frames are about the screens.
const BIGGER = `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign
  for (const f of [6, 10]) app.do({ t: 'rent', field: f })
  app.do({ t: 'hire', kind: 'hand' }); c.cash += 30000; app.do({ t: 'buy', upgrade: 'tractor2' }); app.do({ t: 'hire', kind: 'operator' })
  app.do({ t: 'accept', offer: 19873 })
  for (const f of [0, 2, 6]) app.do({ t: 'plan', field: f, plan: { crop: 'potato', variety: 'kennebec', seed: 'certified' } })`
const biggerJuly: Step = async page => { await q(page, `${BIGGER}; app.do({ t: 'begin' }); q.run(q.day(6, 12))`); await closeAll(page) }

// A first year with the three who asked for work in spring taken on (a bunkhouse given, so the third has a bed), in June.
const farmPeople: Step = async page => {
  await q(page, `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 20000
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })
    app.do({ t: 'begin' }); q.run(q.day(5, 12)); app.setSpeed(0)`)
  await closeAll(page)
}

const STATES: State[] = [
  { name: 'title', what: 'Title screen, first visit', sizes: ALL, run: async () => {} },
  { name: 'title-continue', what: 'Title screen with a saved farm', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(q.day(5, 1)); q.g().app.quitToTitle()`) } },
  { name: 'new-farm', what: 'New farm over a saved one: the question first', sizes: [...MAIN, 'small', 'land'], run: async page => { await q(page, `q.start(1987, 3); q.g().app.quitToTitle()`); await page.getByTestId('play').click() } },
  { name: 'how-it-works', what: 'How it works', sizes: MAIN, run: async page => { await page.getByTestId('how-open').first().click() } },
  { name: 'menu', what: 'Menu and settings, opened in season', sizes: MAIN, run: async page => { await july(page, ''); await page.getByTestId('menu-open').first().click() } },
  { name: 'plan-first', what: 'Spring plan, first year', sizes: ALL, run: async page => { await q(page, `q.g().app.newGame(1987, 3)`) } },
  { name: 'plan-second', what: 'Spring plan, second year, after a full season', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.year(3); q.g().app.do({ t: 'next' })`); await closeAll(page) } },
  { name: 'season-first-day', what: 'April 20: the season opens and nothing can be done yet', sizes: [...MAIN, 'small'], run: async page => { await q(page, `q.start(1987, 3)`) } },
  { name: 'season-planting', what: 'Planting day', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run('plant', [], 'work')`); await closeAll(page) } },
  { name: 'season-june', what: 'June: rows emerging, first hilling', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(q.day(5, 22))`); await closeAll(page) } },
  { name: 'season-july-field', what: 'July: in bloom, a field selected', sizes: ALL, run: async (page, size) => { await july(page, size); await selectField(page, size, 2) } },
  { name: 'season-worklist', what: 'July: a full work list', sizes: MAIN, run: async (page, size) => {
    await july(page, size)
    await q(page, `const { app } = q.g(); for (const k of ['scout', 'spray', 'sample']) for (let i = 0; i < 6; i++) app.do({ t: 'job', kind: k, field: i })`)
    await selectField(page, size, 0)
  } },
  { name: 'season-blight', what: 'August 1979, never sprayed: blight found and spreading', sizes: MAIN, run: async (page, size) => { await q(page, `q.start(1979, 3); q.run(q.day(7, 15), ['spray', 'rogue'])`); await closeAll(page); await selectField(page, size, 4) } },
  { name: 'season-drought', what: 'August 1995: drought', sizes: MAIN, run: async (page, size) => { await q(page, `q.start(1995, 3); q.run(q.day(7, 10), ['water'])`); await closeAll(page); await selectField(page, size, 0) } },
  { name: 'season-fog', what: 'A fog morning in July', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(q.day(6, 1)); q.run(['fog'], [], 'sky')`); await closeAll(page) } },
  { name: 'season-rain', what: 'A day of rain in July', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(q.day(6, 1)); q.run(['rain', 'storm'], [], 'sky')`); await closeAll(page) } },
  { name: 'season-frost', what: 'Late September 2020, vines still green: first frost', sizes: MAIN, run: async page => { await q(page, `q.start(2020, 3); q.run(q.day(8, 21), ['kill', 'dig'])`); await closeAll(page) } },
  { name: 'season-dead-vines', what: 'Mid September: vines dead, skins setting', sizes: MAIN, run: async (page, size) => { await q(page, `q.start(1987, 3); q.run(q.day(8, 16))`); await closeAll(page); await selectField(page, size, 2) } },
  { name: 'season-digging', what: 'Dig day in progress', sizes: MAIN, run: async page => {
    await q(page, `q.start(1987, 3); q.run('digging', ['sell'], 'status')`)
    await closeAll(page)
    await q(page, `q.g().app.setSpeed(1)`)
    await page.waitForTimeout(1300)
    await q(page, `q.g().app.setSpeed(0)`)
    await closeAll(page)
  } },
  { name: 'test-dig', what: 'Test dig: one hill lifted', sizes: [...MAIN, 'small', 'land'], run: async (page, size) => {
    await q(page, `q.start(1987, 3); q.run(q.day(6, 28), ['sample'])`)
    await closeAll(page)
    await q(page, `const { app } = q.g(); app.do({ t: 'job', kind: 'sample', field: 2 }); app.do({ t: 'bump', id: app.campaign.season.jobs.at(-1).id }); app.do({ t: 'day' })`)
    await page.getByTestId('sample-dialog').waitFor({ timeout: 5000 }).catch(() => {})
    // The tray sets its tubers down and narrows the estimate over about two seconds: the frame is of the end.
    await page.waitForTimeout(2600)
    void size
  } },
  { name: 'weigh-in', what: 'Dig day: the weigh-in', sizes: ALL, run: async (page, size) => {
    await q(page, `q.start(1987, 3); q.run(999, ['sell'], 'lot')`)
    await closeAll(page)
    const lot = await q(page, `const c = q.g().app.campaign; const l = c.lots.find(l => l.open); return { id: l.id, field: l.field }`) as { id: number; field: number }
    await selectField(page, size, lot.field)
    await page.getByTestId(`weighin-${lot.id}`).click()
    await page.getByTestId('weighin').waitFor({ timeout: 5000 }).catch(() => {})
  } },
  { name: 'season-done', what: 'Everything dug: closing out the season', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(999, ['sell'])`); await closeAll(page) } },
  { name: 'end-early', what: 'Ending the season early: the confirmation', sizes: MAIN, run: async (page, size) => {
    await july(page, size)
    await page.getByTestId('menu-open').first().click()
    await page.getByTestId('end-season-early').click()
  } },
  { name: 'cellar-november', what: 'The cellar in November', sizes: ALL, run: async page => { await q(page, `q.start(1987, 3); q.run(999, ['sell']); q.winter(0, 9)`); await closeAll(page) } },
  { name: 'cellar-march', what: 'The cellar in March, four months in', sizes: MAIN, run: async page => { await q(page, `q.start(1987, 3); q.run(999, ['sell']); q.winter(4, 9)`); await closeAll(page) } },
  { name: 'ledger', what: 'Year-end ledger after a first season', sizes: ALL, run: async page => { await q(page, `q.start(1987, 3); q.year(3)`); await closeAll(page) } },
  { name: 'ledger-fifth', what: 'The fifth ledger: the farm is kept (or not)', sizes: MAIN, run: async page => {
    await q(page, `const { app } = q.g(); app.newGame(2012, 3); for (let y = 0; y < 5; y++) { app.do({ t: 'begin' }); q.year(4); if (y < 4) app.do({ t: 'next' }) }`)
    await closeAll(page)
    // The five years write themselves in row by row: the frame is of the finished sheet.
    await page.waitForTimeout(1800)
  } },
  { name: 'ledger-lost', what: 'The ledger when the bank calls the note', sizes: MAIN, run: async page => {
    await q(page, `const { app } = q.g(); app.newGame(1990, 3); for (let y = 0; y < 5 && app.campaign.outcome === ''; y++) { if (y) app.do({ t: 'next' }); app.do({ t: 'begin' }); app.do({ t: 'endSeason' }); q.winter(12, 0) }`)
    await closeAll(page)
  } },
  { name: 'over', what: 'After the farm is lost', sizes: MAIN, run: async page => {
    await q(page, `const { app } = q.g(); app.newGame(1990, 3); for (let y = 0; y < 5 && app.campaign.outcome === ''; y++) { if (y) app.do({ t: 'next' }); app.do({ t: 'begin' }); app.do({ t: 'endSeason' }); q.winter(12, 0) } app.do({ t: 'next' })`)
    await closeAll(page)
  } },
  { name: 'metric', what: 'July with metric units', sizes: MAIN, run: async (page, size) => { await july(page, size); await q(page, `q.g().app.setSetting('units', 'metric')`); await selectField(page, size, 2) } },

  // The bigger farm.
  { name: 'plan-land', what: 'Spring: land to rent or buy, found from the land fold, its card open', sizes: ALL, run: async page => { await q(page, `q.g().app.newGame(1987, 3)`); await page.getByTestId('land-open').click(); await page.getByTestId('fold-land-10').click() } },
  { name: 'plan-contracts', what: 'Spring: the contracts offered', sizes: [...MAIN, 'small'], run: async page => { await q(page, `q.g().app.newGame(1987, 3)`); await page.getByTestId('contracts-open').click() } },
  { name: 'plan-crew', what: 'Spring: hiring and letting go', sizes: MAIN, run: async page => { await q(page, `q.g().app.newGame(1987, 3); q.g().app.do({ t: 'hire', kind: 'hand' })`); await page.getByTestId('crew-open').click() } },
  { name: 'plan-bigger', what: 'Spring on the bigger farm: rented land, crews, a contract signed', sizes: ALL, run: async page => { await q(page, BIGGER) } },
  { name: 'plan-bigger-field', what: 'Spring on the bigger farm: a rented field\'s card, picked by its number', sizes: MAIN, run: async page => { await q(page, BIGGER); await page.keyboard.press('7') } },
  { name: 'season-bigger', what: 'July on the bigger farm, nothing selected', sizes: ALL, run: biggerJuly },
  { name: 'season-crew-picked', what: 'July on the bigger farm: a hand picked and a field selected', sizes: [...MAIN, 'small'], run: async (page, size) => {
    await biggerJuly(page, size)
    await page.getByTestId('unit-1').click()
    await selectField(page, size, 2)
  } },
  { name: 'season-queue-who', what: 'July on the bigger farm: choosing who does an order', sizes: MAIN, run: async (page, size) => {
    await biggerJuly(page, size)
    await q(page, `const { app } = q.g(); for (const i of [0, 2, 6]) app.do({ t: 'job', kind: 'scout', field: i })`)
    const id = await q(page, `const jobs = q.g().app.campaign.season.jobs; return (jobs.find(j => j.kind === 'scout') ?? jobs[0])?.id ?? -1`) as number
    const who = page.getByTestId(`queue-who-${id}`)
    if (await who.count()) { await page.getByTestId(`queue-${id}`).focus(); await who.click() } else await page.getByTestId(`queue-${id}`).click()
  } },
  { name: 'weigh-in-deliver', what: 'Dig day on contract: the weigh ticket offers the delivery', sizes: ALL, run: async (page, size) => {
    await q(page, `${BIGGER}; for (let i = 0; i < 14; i++) if (c.plans[i].crop === 'potato' && c.fields[i].tenure !== 'none') app.do({ t: 'plan', field: i, plan: { crop: 'potato', variety: 'kennebec', seed: 'certified' } }); app.do({ t: 'begin' }); q.run(999, ['sell'], 'lot')`)
    await closeAll(page)
    const lot = await q(page, `const c = q.g().app.campaign; const l = c.lots.find(l => l.open); return { id: l.id, field: l.field }`) as { id: number; field: number }
    await q(page, `q.g().app.select(${lot.field})`)
    await page.getByTestId(`weighin-${lot.id}`).click()
    await page.getByTestId('weighin').waitFor({ timeout: 5000 }).catch(() => {})
  } },
  { name: 'cellar-houses', what: 'Winter with the Dufour potato house and a second one at home, a winter contract open', sizes: [...MAIN, 'small', 'land'], run: async page => {
    await q(page, `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; app.do({ t: 'rent', field: 10 }); c.cash += 30000; app.do({ t: 'buy', upgrade: 'house2' })
      app.do({ t: 'accept', offer: 19871 }); for (const f of [0, 2]) app.do({ t: 'plan', field: f, plan: { crop: 'potato', variety: 'atlantic', seed: 'certified' } })
      app.do({ t: 'begin' }); q.run(999, ['sell']); q.winter(0, 9)`)
    await closeAll(page)
  } },
  { name: 'ledger-bigger', what: 'Year end on the bigger farm: wages, rent and a contract', sizes: MAIN, run: async page => { await q(page, `${BIGGER}; app.do({ t: 'begin' }); q.year(3)`); await closeAll(page) } },
  { name: 'almanac-farm', what: 'The almanac: land, crews and contracts', sizes: MAIN, run: async (page, size) => { await biggerJuly(page, size); await page.keyboard.press('i'); await page.getByTestId('almanac-farm').click() } },
  { name: 'how-keys', what: 'How to play, with every key and order unfolded', sizes: MAIN, run: async page => { await page.getByTestId('how-open').first().click(); await page.getByTestId('how-keys').click() } },

  // The farmstead's papers.
  { name: 'plan-tract', what: 'Spring: the farm\'s own woodlot, its clearing and what it yields', sizes: MAIN, run: async page => { await q(page, `q.g().app.newGame(1987, 3)`); await page.getByTestId('field-14').click() } },
  { name: 'plan-equipment', what: 'Spring: the equipment fold, with what each needs first', sizes: MAIN, run: async page => { await q(page, `q.g().app.newGame(1987, 3)`); await page.getByTestId('equipment-open').click() } },
  { name: 'plan-mortgage', what: 'A later spring with land bought on the mortgage: the bank fold', sizes: MAIN, run: async page => {
    await q(page, `q.start(1987, 3); q.year(3); const { app } = q.g(); app.do({ t: 'next' }); app.campaign.cash += 40000; app.do({ t: 'buyLand', field: 6 })`)
    await closeAll(page)
    await page.getByTestId('bank-open').click()
  } },
  { name: 'plan-later', what: 'A third spring, nothing opened: the sheet as it grows', sizes: [...MAIN, 'small', 'land', 'tiny'], run: async page => {
    await q(page, `q.start(1987, 3); q.year(3); const { app } = q.g(); app.do({ t: 'next' }); app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'begin' }); q.year(3); app.do({ t: 'next' })`)
    await closeAll(page)
  } },
  { name: 'cellar-winter', what: 'Winter on the farmstead: people kept on, logs in the yard, a bunkhouse going up', sizes: [...MAIN, 'small'], run: async page => {
    await q(page, `${BIGGER}; c.cash += 20000; app.do({ t: 'build', kind: 'bunk', yard: -1 }); app.do({ t: 'begin' }); q.run(999, ['sell']); app.do({ t: 'endSeason' })
      c.logs = 14.4; c.stone = 6; const b = c.buildings.find(x => !x.built); if (b) b.done = Math.min(b.done, b.need / 3)
      app.do({ t: 'winter', unit: 0, work: 'woods', field: 14 }); app.do({ t: 'winter', unit: 1, work: 'build' })`)
    await closeAll(page)
  } },
  { name: 'ledger-farmstead', what: 'Year end on the farmstead: wages, a building, the farm\'s worth, the year on the farm', sizes: MAIN, run: async page => {
    await q(page, `${BIGGER}; c.cash += 20000; app.do({ t: 'build', kind: 'stand', yard: -1 }); app.do({ t: 'buyLand', field: 7 }); app.do({ t: 'begin' }); q.year(3)`)
    await closeAll(page)
  } },
  { name: 'almanac-people', what: 'The almanac: people, and how they work', sizes: MAIN, run: async (page, size) => { await biggerJuly(page, size); await page.keyboard.press('i'); await page.getByTestId('almanac-people').click() } },
  { name: 'almanac-buildings', what: 'The almanac: buildings', sizes: ['desk'], run: async (page, size) => { await biggerJuly(page, size); await page.keyboard.press('i'); await page.getByTestId('almanac-buildings').click() } },

  // The farmstead on the season screen: people, the work grid, building, incidents, tracts, hauling, the goals.
  { name: 'farm-goals', what: 'The first day: the goal list opened from the line under the date', sizes: ALL, run: async page => { await q(page, `q.start(1987, 3)`); await page.getByTestId('goal').first().click() } },
  { name: 'farm-people', what: 'June, four people on the farm, nothing selected', sizes: ALL, run: farmPeople },
  { name: 'farm-person', what: 'June: a hired person\'s card', sizes: ALL, run: async (page, size) => { await farmPeople(page, size); await page.getByTestId('unit-1').click() } },
  { name: 'farm-grid', what: 'June: the work grid', sizes: ALL, run: async (page, size) => { await farmPeople(page, size); await page.getByTestId('grid-open').click() } },
  { name: 'farm-yard', what: 'June: the home yard\'s card, a machine shed chosen', sizes: ALL, run: async (page, size) => {
    await farmPeople(page, size)
    await q(page, `const { app } = q.g(); app.campaign.cash += 60000; app.campaign.logs = 12; app.campaign.stone = 8; app.selectYard(-1)`)
    await page.getByTestId('build-pick-shed').click()
  } },
  { name: 'farm-building', what: 'July: a machine shed going up, people on it', sizes: ALL, run: async (page, size) => {
    await farmPeople(page, size)
    await q(page, `const { app } = q.g(); app.campaign.cash += 60000; app.do({ t: 'build', kind: 'house', yard: -1 }); app.do({ t: 'build', kind: 'shed', yard: -1 }); q.run(q.day(5, 15)); app.setSpeed(0); app.selectYard(-1)`)
    await closeAll(page)
  } },
  { name: 'farm-incident', what: 'July: a neighbor wants one of your people', sizes: ALL, run: async (page, size) => {
    await farmPeople(page, size)
    await q(page, `const { app } = q.g(); const c = app.campaign; const u = c.crew[1]
      c.incidents.push({ id: c.nextIncident++, kind: 'poach', day: c.season.day, until: c.season.day + 4, choices: ['match', 'let'], unit: u.id, wage: Math.round(u.wage * 1.15) }); app.do({ t: 'priority', unit: u.id, work: 'pack', level: 3 })`)
  } },
  { name: 'farm-tract', what: 'June: Home Woodlot being felled, its card open', sizes: ALL, run: async (page, size) => {
    await farmPeople(page, size)
    await q(page, `const { app } = q.g(); app.order('fell', { fields: [14] }); q.run(q.day(5, 26)); app.setSpeed(0); app.select(14)`)
    await closeAll(page)
  } },
  { name: 'farm-materials', what: 'Logs and fieldstone in the yard: selling logs', sizes: MAIN, run: async (page, size) => {
    await farmPeople(page, size)
    await q(page, `const c = q.g().app.campaign; c.logs = 23.4; c.stone = 9.6; dispatchEvent(new Event('resize'))`)
    await page.getByTestId('materials').click()
  } },
  { name: 'farm-barrels', what: 'Dig day: a field dug, barrels waiting to be hauled', sizes: MAIN, run: async (page, size) => {
    await q(page, `q.start(1987, 3); q.run('digging', ['sell'], 'status'); const { app } = q.g(); for (let k = 0; k < 2; k++) app.do({ t: 'day' }); app.setSpeed(0)
      const f = app.campaign.season.fields.findIndex(x => x.inField > 1); if (f >= 0) app.select(f)`)
    await closeAll(page)
    void size
  } },
  { name: 'farm-year5', what: 'Year 5: ten people, three buildings going up, an incident open', sizes: ALL, run: async page => {
    await q(page, `const { app, sim } = q.g(); app.newGame(2012, 3); const c = app.campaign
      for (let y = 0; y < 4 && c.outcome !== 'lost'; y++) { app.do({ t: 'begin' }); q.year(4); app.do({ t: 'next' }) }
      c.cash += 200000; app.do({ t: 'rent', field: 10 })
      for (const y of [-1, -2]) c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: y, done: 12, need: 12, built: true })
      for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })
      for (let k = 0; c.crew.length < 10 && k < 12; k++) app.do({ t: 'hire', kind: k % 3 ? 'hand' : 'operator' })
      app.do({ t: 'begin' }); app.setSpeed(0)
      q.run(q.day(5, 17)); for (const kind of ['house', 'shed', 'packing']) app.do({ t: 'build', kind, yard: -1 })
      q.run(q.day(5, 20)); app.setSpeed(0)
      const s = c.season; const u = c.crew[2]
      c.incidents.push({ id: c.nextIncident++, kind: 'poach', day: s.day, until: s.day + 4, choices: ['match', 'let'], unit: u.id, wage: Math.round(u.wage * 1.15) })
      app.do({ t: 'priority', unit: u.id, work: 'pack', level: u.prio.pack === 4 ? 3 : 4 })`)
    await closeAll(page)
  } },
]
// ALL_SIZES=1 takes every state at all eight sizes.
if (process.env.ALL_SIZES) for (const s of STATES) s.sizes = ALL

// Runs in the page: what styles are actually in use on screen, and what overflows.
const AUDIT = `(() => {
  const out = { size: {}, color: {}, bg: {}, radius: {}, weight: {}, family: {}, small: [], clipped: [], tiny: [], words: 0, controls: 0,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1 }
  const name = el => (el.dataset.testid || el.className || el.tagName).toString().slice(0, 40)
  const touch = matchMedia('(pointer: coarse)').matches
  for (const el of document.querySelectorAll('#ui *')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    const text = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())
    if (el.matches('button, a[href], input, select, [role=button], [role=tab]')) out.controls++
    if (text) {
      for (const n of el.childNodes) if (n.nodeType === 3) out.words += n.nodeValue.trim().split(/\\s+/).filter(Boolean).length
      bump(out.size, cs.fontSize); bump(out.color, cs.color); bump(out.weight, cs.fontWeight); bump(out.family, cs.fontFamily.split(',')[0].trim())
      if (parseFloat(cs.fontSize) < 12) out.small.push(name(el) + ' ' + cs.fontSize)
      if (cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1) out.clipped.push(name(el))
    }
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bump(out.bg, cs.backgroundColor)
    if (cs.borderTopLeftRadius !== '0px') bump(out.radius, cs.borderTopLeftRadius)
    if (touch && el.matches('button, a, input, select, [role=button]') && (r.width < 40 || r.height < 40)) out.tiny.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
  }
  return out
})()`

interface Audit { size: Record<string, number>; color: Record<string, number>; bg: Record<string, number>; radius: Record<string, number>; weight: Record<string, number>; family: Record<string, number>; small: string[]; clipped: string[]; tiny: string[]; words: number; controls: number; overflowX: number }
const audits: Record<string, Audit> = {}

const browser = await chromium.launch({ args: GPU })
const index: { file: string; state: string; size: string; what: string; errors: string[] }[] = []

async function shoot(ctx: BrowserContext, state: State, size: string): Promise<void> {
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  try {
    await page.goto(base)
    await page.waitForFunction(() => '__county' in globalThis)
    await page.evaluate(() => localStorage.clear())
    // The opening is only itself once the land is up and the name has left the splash for the title.
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 30_000 }).catch(() => {})
    await state.run(page, size)
    await page.evaluate(() => (globalThis as unknown as { __countyField?: { settle?: () => void } }).__countyField?.settle?.())
    await page.waitForTimeout(900)
    audits[`${state.name}.${size}`] = await page.evaluate(AUDIT) as Audit
  } catch (e) {
    errors.push(`capture: ${String(e).split('\n')[0]}`)
  }
  const file = `${state.name}.${size}.png`
  await page.screenshot({ path: join(out, file) })
  index.push({ file, state: state.name, size, what: state.what, errors })
  await page.close()
}

// SIZES=desk,phone keeps to those sizes. PAR sets how many sizes are drawn at once (two by default).
const only = process.env.SIZES ? process.env.SIZES.split(',') : ALL
const par = Math.max(1, Number(process.env.PAR ?? 2))
const queue = ALL.filter(size => only.includes(size))
await Promise.all(Array.from({ length: par }, async () => {
  for (let size = queue.shift(); size; size = queue.shift()) {
    const s = SIZES[size]
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale ?? 1, hasTouch: !!s.touch, isMobile: !!s.touch && s.width < 900 })
    await ctx.addInitScript(HELPER)
    for (const state of STATES) {
      if (!state.sizes.includes(size) || !filter.split(',').some(f => state.name.includes(f))) continue
      await shoot(ctx, state, size)
    }
    await ctx.close()
  }
}))
await browser.close()

index.sort((a, b) => a.file.localeCompare(b.file))
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n')
const total: Record<string, Record<string, number>> = { size: {}, color: {}, bg: {}, radius: {}, weight: {}, family: {} }
const problems: Record<string, string[]> = {}
for (const [frame, a] of Object.entries(audits)) {
  for (const k of Object.keys(total)) for (const [v, n] of Object.entries(a[k as 'size'])) total[k][v] = (total[k][v] ?? 0) + n
  const p = [...(a.overflowX > 1 ? [`page scrolls sideways by ${a.overflowX}px`] : []), ...[...new Set(a.clipped)].map(x => `clipped text: ${x}`),
    ...[...new Set(a.small)].map(x => `text under 12px: ${x}`), ...[...new Set(a.tiny)].map(x => `touch target under 40px: ${x}`)]
  if (p.length) problems[frame] = p
}
const ranked = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1]))
writeFileSync(join(out, 'styles.json'), JSON.stringify({
  distinct: Object.fromEntries(Object.entries(total).map(([k, v]) => [k, Object.keys(v).length])),
  inUse: Object.fromEntries(Object.entries(total).map(([k, v]) => [k, ranked(v)])),
  problems,
  // How much the player is asked to read and choose between on each frame.
  load: Object.fromEntries(Object.entries(audits).map(([f, a]) => [f, { words: a.words, controls: a.controls }])),
}, null, 1) + '\n')
console.log('distinct in use:', Object.entries(total).map(([k, v]) => `${k} ${Object.keys(v).length}`).join(', '), `| frames with layout problems: ${Object.keys(problems).length}`)
const bad = index.filter(x => x.errors.length)
console.log(`${index.length} frames in ${out}; ${bad.length} with errors`)
for (const x of bad) console.log(`  ${x.file}: ${x.errors[0]}`)
