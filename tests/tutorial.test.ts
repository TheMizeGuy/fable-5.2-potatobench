import { describe, expect, it } from 'vitest'
import { countWords, Guide, KEY, LESSONS, lesson, type Input, type Look, type Store } from '../src/game/tutorial.ts'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const record = loadWorld()

function memory(): Store & { text: string | null } {
  const m = { text: null as string | null, get: () => m.text, set: (t: string) => { m.text = t } }
  return m
}

function farm(seed: number): { w: S.World; c: S.Campaign } {
  const w = S.climateWorld(record, seed)
  return { w, c: S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 }) }
}

// The screen as the app would show it, read from the farm: what lessons are given to read.
function look(w: S.World, c: S.Campaign, o: Partial<Look> = {}): Look {
  return {
    c, world: w, screen: c.phase, selection: [], unit: -1, yard: 0, speed: 0,
    needs: S.fieldNeeds(w, c).map(n => n.need), paper: '', papers: [], input: 'mouse', stopped: '', ...o,
  }
}

const INPUTS: Input[] = ['mouse', 'touch', 'keys']
// Every lesson's words in every state it was shown in, for the word limits.
const said: { id: string; ask: string; why: string }[] = []
function hear(g: Guide, l: Look): string | null {
  const x = g.current(l)
  if (x) for (const input of INPUTS) { const v = { ...l, input }; said.push({ id: x.id, ask: x.ask(v), why: x.why(v) }) }
  return x?.id ?? null
}

// A player answering every stamp the land shows today (the calls, and whatever the routine leaves to them).
function stamps(w: S.World, c: S.Campaign): void {
  S.fieldNeeds(w, c).forEach((n, field) => {
    const a = n.need
    if (!a || a.act === 'wait' || a.act === 'close' || a.act === 'sell') return
    S.apply(w, c, { t: 'job', kind: a.act, field })
  })
}

// Days until something is true, a season at most.
function until(w: S.World, c: S.Campaign, ok: () => boolean, each = () => {}): void {
  for (let n = 0; n < 200 && !ok() && c.phase === 'season' && !S.seasonDone(c); n++) { each(); S.apply(w, c, { t: 'day' }) }
}
const sown = (c: S.Campaign) => c.season!.fields.some(f => f.plantDay >= 0)
const planting = (w: S.World, c: S.Campaign) => S.fieldNeeds(w, c).some(n => n.need?.act === 'plant') || c.season!.jobs.some(j => j.kind === 'plant')

// A guided first year from the spring to the second spring, played as a player following the guide would: each
// lesson's first showing, in order. Doing lessons are done; reading lessons are noted.
const READ = new Set(['money', 'boards', 'card', 'routine', 'list', 'frost', 'haul', 'owed', 'sprayauto', 'stopped', 'calls2', 'foreman'])
function guidedYear(seed: number, o: { offer?: boolean; askMe?: boolean } = {}): { shown: string[]; passed: string[]; g: Guide; w: S.World; c: S.Campaign } {
  const { w, c } = farm(seed)
  // Every kind of work switched to "ask me": the stamps for the routine's jobs come to the player as they used to.
  if (o.askMe) for (const k of S.ROUTINE_KINDS) S.apply(w, c, { t: 'routine', kind: k, auto: false })
  const g = new Guide(memory())
  g.newFarm(c.seed)
  if (o.offer !== false) g.accept()
  const shown: string[] = []
  const see = (l: Look) => {
    const id = hear(g, l)
    if (id && shown[shown.length - 1] !== id) {
      if (!shown.includes(id)) shown.push(id)
    }
    return id
  }
  // Does what the lesson now showing asks, as the player would.
  const follow = (id: string | null) => {
    if (!id) return
    if (READ.has(id)) g.noted(id)
    else if (id === 'watch') g.note('zoom')
    else if (id === 'turn') g.note('turn')
    else if (id === 'person') see(look(w, c, { unit: c.crew[0].id }))
    else if (id === 'field') { see(look(w, c, { selection: [0] })); see(look(w, c)) }
    else if (id === 'almanac') see(look(w, c, { paper: 'almanac', papers: ['almanac'] }))
    else if (id === 'fell') S.apply(w, c, { t: 'winter', unit: c.crew[0].id, work: 'woods', field: S.TRACTS.find(i => c.fields[i].tenure !== 'none' && c.fields[i].cover !== 'open') ?? S.TRACTS[0] })
  }
  follow(see(look(w, c)))
  see(look(w, c))
  S.apply(w, c, { t: 'begin' })
  see(look(w, c))
  // The season, the stamps answered; a weigh ticket is a paper over the land for a moment, then answered.
  for (let n = 0; n < 320 && c.phase === 'season'; n++) {
    for (let k = 0; k < 4; k++) follow(see(look(w, c, { speed: 3 })))
    if (S.seasonDone(c)) { see(look(w, c)); S.apply(w, c, { t: 'endSeason' }); break }
    stamps(w, c)
    for (const inc of [...c.incidents]) S.apply(w, c, { t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
    const r = S.apply(w, c, { t: 'day' })
    if (r.events.some(e => e.type === 'weighed')) {
      see(look(w, c, { paper: 'weighin', papers: ['weighin'] }))
      see(look(w, c))
    }
  }
  // The winter and the account book.
  for (let k = 0; k < 3; k++) follow(see(look(w, c)))
  for (let m = 0; m < 12 && c.phase === 'cellar'; m++) {
    if (m === 2) for (const lot of S.openLots(c)) S.apply(w, c, { t: 'sell', lot: lot.id, frac: 1 })
    S.apply(w, c, { t: 'month' })
    for (let k = 0; k < 3; k++) follow(see(look(w, c)))
  }
  see(look(w, c))
  if (c.phase === 'ledger') S.apply(w, c, { t: 'next' })
  see(look(w, c))
  return { shown, passed: Object.keys(g.p.passed), g, w, c }
}

describe('the guided first year', () => {
  it('is offered once, on the first spring of a farm started from the title, and refused shows nothing', () => {
    const { w, c } = farm(99)
    const g = new Guide(memory())
    expect(g.offerFor(c, 'plan')).toBe(false)
    g.newFarm(c.seed)
    expect(g.offerFor(c, 'plan')).toBe(true)
    expect(g.current(look(w, c))).toBeNull()
    g.refuse()
    expect(g.offerFor(c, 'plan')).toBe(false)
    g.newFarm(c.seed + 1)
    expect(g.offerFor({ ...c, seed: c.seed + 1 }, 'plan')).toBe(false)
    const run = guidedYear(99, { offer: false })
    expect(run.shown).toEqual([])
    expect(run.g.holdsClock(run.c)).toBe(false)
  })

  it('opens with only what is needed to watch the first planting: the money, the start, the clock, then planting itself', () => {
    const { w, c } = farm(99)
    const g = new Guide(memory())
    g.newFarm(c.seed)
    g.accept()
    // The money comes before the first Start the season.
    expect(g.current(look(w, c))?.id).toBe('money')
    expect(g.current(look(w, c))?.ask(look(w, c))).toMatch(/\$24,000/)
    g.noted('money')
    expect(g.current(look(w, c))?.id).toBe('begin')
    S.apply(w, c, { t: 'begin' })
    expect(g.holdsClock(c)).toBe(true)
    expect(g.current(look(w, c))?.id).toBe('clock')
    // Nothing else is asked for before the days run: no tour of the camera, the boards or the almanac.
    expect(g.current(look(w, c, { speed: 3 }))).toBeNull()
    expect(g.holdsClock(c)).toBe(false)
    // The weeks go by until the ground is fit: the routine puts planting on the list, and the guide holds the clock
    // there so the planting can be watched.
    until(w, c, () => planting(w, c))
    expect(c.season!.jobs.some(j => j.kind === 'plant' && j.by === 'routine')).toBe(true)
    const x = g.current(look(w, c, { speed: 3 }))
    expect(x?.id).toBe('watch')
    expect(x?.holds).toBe(true)
    expect(g.passed('plant')).toBe(true)
    g.note('zoom')
    expect(g.current(look(w, c))?.id).toBe('person')
    expect(lesson('person')?.holds).toBe(true)
    expect(g.current(look(w, c, { unit: c.crew[0].id }))?.id).toBe('routine')
    g.noted('routine')
    // The rest of the opening, with the forecast and the almanac where the weather first makes them worth reading.
    const order: string[] = []
    for (let k = 0; k < 12; k++) {
      const id = g.current(look(w, c))?.id
      if (!id) break
      order.push(id)
      if (id === 'boards' || id === 'list') g.noted(id)
      else if (id === 'almanac') g.current(look(w, c, { paper: 'almanac', papers: ['almanac'] }))
      else if (id === 'turn') g.note('tip')
      else if (id === 'field') { if (g.current(look(w, c, { selection: [0] }))?.id === 'card') { order.push('card'); g.noted('card') } }
      else throw new Error(`unexpected ${id}`)
    }
    expect(order.filter(id => !['boards', 'almanac'].includes(id))).toEqual(['list', 'turn', 'field', 'card'])
    for (const id of ['money', 'begin', 'clock', 'watch', 'person', 'routine', 'list', 'turn', 'field', 'card']) expect(g.passed(id), id).toBe(true)
  })

  it('with every kind switched to "ask me", asks for the first order at its ringed stamp, holding the clock for it', () => {
    const { w, c } = farm(99)
    for (const k of S.ROUTINE_KINDS) S.apply(w, c, { t: 'routine', kind: k, auto: false })
    const g = new Guide(memory())
    g.skipTo('plant')
    S.apply(w, c, { t: 'begin' })
    g.current(look(w, c, { speed: 3 }))
    until(w, c, () => planting(w, c))
    const l = look(w, c, { speed: 3 })
    const x = g.current(l)
    expect(x?.id).toBe('plant')
    expect(x?.holds).toBe(true)
    const i = l.needs.findIndex(a => a?.act === 'plant')
    expect(x?.point?.(l)).toEqual({ badge: i })
    S.apply(w, c, { t: 'job', kind: 'plant', field: i })
    until(w, c, () => sown(c))
    expect(g.current(look(w, c, { speed: 3 }))?.id).toBe('rest')
    until(w, c, () => !S.fieldNeeds(w, c).some(n => n.need?.act === 'plant'), () => stamps(w, c))
    g.current(look(w, c, { speed: 3 }))
    expect(g.passed('rest')).toBe(true)
  })

  it('brings each lesson of the year the first time its moment comes, and each one passes from the farm', () => {
    const met = new Set<string>()
    const passed = new Set<string>()
    for (const askMe of [false, true]) for (const seed of [99, 7, 3, 12, 41, 5]) {
      const run = guidedYear(seed, { askMe })
      for (const id of run.shown) met.add(id)
      for (const id of run.passed) passed.add(id)
      expect(run.shown.slice(0, 3)).toEqual(['money', 'begin', 'clock'])
      // The opening is over before anything that is not needed to watch the planting.
      expect(run.shown.indexOf("boards"), `${seed} ${askMe}: ${run.shown.join(" ")}`).toBeGreaterThan(run.shown.indexOf("person"))
      expect(run.c.phase).toBe('plan')
      expect(run.shown[run.shown.length - 1]).toBe('seed')
      // With the routine, the crew's own work is never asked for: the calls are.
      if (!askMe) for (const id of ['scout', 'hill', 'sample', 'dig', 'rogue']) expect(run.shown, id).not.toContain(id)
      // The money is said before the first sale.
      if (run.shown.includes('ticket')) expect(run.shown.indexOf('owed')).toBeLessThan(run.shown.indexOf('ticket'))
      if (['water', 'rogue', 'telegram', 'frost', 'sample', 'hill', 'fell'].every(id => met.has(id)) && met.has('routine')) break
    }
    for (const id of ['routine', 'list', 'owed', 'boards', 'almanac', 'sprayauto', 'turn', 'field', 'card']) expect(met.has(id), id).toBe(true)
    const year = ['telegram', 'scout', 'hill', 'spray', 'frost', 'sample', 'water', 'rogue', 'kill', 'dig', 'haul', 'ticket', 'close', 'cellar', 'fell', 'book']
    for (const id of year) {
      expect(met.has(id), `${id} was never shown`).toBe(true)
      expect(passed.has(id), `${id} never passed`).toBe(true)
    }
  }, 240_000)

  it('says what killing the vines trades, before the weigh ticket says the tubers stayed small', () => {
    const k = lesson('kill')!
    const { w, c } = farm(3)
    expect(k.why(look(w, c))).toMatch(/small tubers stay small/)
    expect(k.why(look(w, c))).toMatch(/frost/)
  })

  it('explains the spraying question when it is asked, ahead of why the clock stopped, and lets it go once answered', () => {
    const { w, c } = farm(99)
    const g = new Guide(memory())
    g.skipTo('sprayask')
    S.apply(w, c, { t: 'begin' })
    const asked = g.current(look(w, c, { speed: 0, stopped: 'The crew asks how spraying is to be done.', asking: 'spray' }))
    expect(asked?.id).toBe('sprayask')
    expect(asked?.ask(look(w, c))).toMatch(/one reply/)
    expect(g.current(look(w, c, { speed: 1 }))?.id).not.toBe('sprayask')
    expect(g.passed('sprayask')).toBe(true)
  })

  it('says why the clock stopped by itself, once, and not when the guide held it', () => {
    const { w, c } = farm(99)
    const g = new Guide(memory())
    g.skipTo('stopped')
    S.apply(w, c, { t: 'begin' })
    expect(g.current(look(w, c, { speed: 0, stopped: '' }))?.id).not.toBe('stopped')
    expect(g.current(look(w, c, { speed: 0, stopped: 'Frost tonight on barrels in North Ridge.' }))?.id).toBe('stopped')
    expect(g.current(look(w, c, { speed: 1 }))?.id).not.toBe('stopped')
    expect(g.passed('stopped')).toBe(true)
  })

  it('teaches the second spring, then the season\'s calls before the people and the blocks', () => {
    const run = guidedYear(99)
    const { g, w, c } = run
    expect(g.current(look(w, c))?.id).toBe('seed')
    // Seed is spoken of only where there is saved seed to choose.
    const why = g.current(look(w, c))!.why(look(w, c))
    expect(/saved/i.test(why)).toBe(c.seedStock.some(x => x.fields > 0))
    expect(g.current(look(w, c, { selection: [0] }))?.id).toBe('people')
    const a = c.applicants[0]
    if (a) S.apply(w, c, { t: 'hire', applicant: a.id })
    else S.apply(w, c, { t: 'hire', kind: 'hand' })
    expect(g.current(look(w, c))?.id).toBe('land')
    S.apply(w, c, { t: 'rent', field: 6 })
    expect(g.current(look(w, c))?.id).toBe('loan')
    expect(g.showing(look(w, c, { paper: 'money', papers: ['money'] }))).toBeNull()
    expect(g.current(look(w, c))?.id).toBe('begin2')
    S.apply(w, c, { t: 'begin' })
    // The season's real work is said first.
    expect(g.current(look(w, c))?.id).toBe('calls2')
    g.noted('calls2')
    const l = look(w, c)
    expect(g.current(l)?.id).toBe('hand')
    expect(g.current(l)?.holds).toBe(true)
    const u = c.crew.find(x => x.kind !== 'farmer')!
    expect(g.current(l)?.point?.(l)).toEqual({ unit: u.id })
    // A foreman only once there is land beyond the home farm to give one (the intervale is rented here).
    expect(g.current(look(w, c, { unit: u.id }))?.id).toBe('foreman')
    g.noted('foreman')
    // Felling is not sent for in the season: it waits for the winter.
    expect(g.current(look(w, c))?.id ?? '').not.toBe('fell')
  })

  it('never keeps a player who runs ahead behind a lesson: what the farm shows done is passed over', () => {
    const { w, c } = farm(7)
    const g = new Guide(memory())
    g.newFarm(c.seed)
    g.accept()
    g.noted('money')
    S.apply(w, c, { t: 'begin' })
    // The clock started, a field picked, a person picked and the camera moved before any of them was asked.
    g.current(look(w, c, { speed: 3, selection: [1], unit: c.crew[0].id }))
    g.note('pan')
    g.note('turn')
    until(w, c, () => sown(c) && !planting(w, c))
    for (let n = 0; n < 5; n++) S.apply(w, c, { t: 'day' })
    const x = g.current(look(w, c, { speed: 3 }))
    // Only reading is left: every lesson that asks for a doing the player already did is behind them.
    expect(x === null || !!x.read || x.id === 'almanac' || !!x.urgent, x?.id).toBe(true)
    for (const id of ['begin', 'clock', 'watch', 'person', 'turn', 'field']) expect(g.passed(id), id).toBe(true)
  })

  it('gets out of the way of any paper but its own, and puts a telegram first', () => {
    const { w, c } = farm(99)
    const g = new Guide(memory())
    g.resume()
    g.noted('money')
    S.apply(w, c, { t: 'begin' })
    expect(g.showing(look(w, c, { paper: 'menu', papers: ['menu'] }))).toBeNull()
    expect(g.showing(look(w, c))?.id).toBe('clock')
    c.incidents.push({ id: c.nextIncident++, kind: 'breakdown', day: c.season!.day, until: c.season!.day + 2, choices: ['rush', 'wait'], unit: 0, back: c.season!.day + 3 } as S.Incident)
    expect(g.showing(look(w, c))?.id).toBe('telegram')
    S.apply(w, c, { t: 'answer', incident: c.incidents[0].id, choice: 'wait' })
    expect(g.showing(look(w, c))?.id).toBe('clock')
    expect(g.passed('telegram')).toBe(true)
  })

  it('can be skipped a step at a time or as a whole, and replayed lesson by lesson', () => {
    const { w, c } = farm(99)
    const g = new Guide(memory())
    g.skipTo('turn')
    S.apply(w, c, { t: 'begin' })
    const first = g.current(look(w, c))!.id
    g.skip(first)
    expect(g.p.passed[first]).toBe('skip')
    expect(g.current(look(w, c))?.id).not.toBe(first)
    g.stop()
    expect(g.current(look(w, c))).toBeNull()
    expect(g.holdsClock(c)).toBe(false)
    // Replayed while the guide is off: that one lesson, and no other.
    g.replay('turn')
    expect(g.current(look(w, c))?.id).toBe('turn')
    g.note('turn')
    expect(g.current(look(w, c))).toBeNull()
    expect(g.p.replay).toEqual([])
    // A lesson replayed before its moment waits for it.
    g.replay('book')
    expect(g.current(look(w, c))).toBeNull()
    expect(g.p.replay).toEqual(['book'])
    // Read lessons replay with their "noted" forgotten.
    const spring = farm(5)
    const h = new Guide(memory())
    h.resume()
    h.noted('money')
    h.replay('money')
    expect(h.current(look(spring.w, spring.c))?.id).toBe('money')
    g.restart()
    expect(g.on).toBe(true)
    expect(g.current(look(w, c))?.id).toBe('clock')
  })

  it('keeps its progress in its own storage key, and comes back the same after a reload', () => {
    const store = memory()
    const { w, c } = farm(99)
    const g = new Guide(store)
    g.newFarm(c.seed)
    g.accept()
    g.noted('money')
    S.apply(w, c, { t: 'begin' })
    g.current(look(w, c))
    g.note('pan')
    g.skip('clock')
    g.current(look(w, c))
    const again = new Guide(store)
    expect(again.p).toEqual(g.p)
    expect(again.has('pan')).toBe(true)
    expect(again.passed('clock')).toBe(true)
    expect(KEY).toBe('the-county/tutorial')
    expect(KEY).not.toBe('the-county/save')
    // The farm is not written to.
    const before = JSON.stringify(c)
    again.current(look(w, c, { selection: [0], speed: 2 }))
    expect(JSON.stringify(c)).toBe(before)
    expect(new Guide({ get: () => '{nope', set: () => {} }).p.mode).toBe('unset')
    expect(new Guide({ get: () => JSON.stringify({ v: 9, mode: 'on' }), set: () => {} }).p.mode).toBe('unset')
  })

  it('keeps every ask under 20 words and every ask with its reason under 40, in every way of playing', () => {
    if (!said.length) guidedYear(99)
    const seen = new Set(said.map(x => x.id))
    expect(seen.size).toBeGreaterThan(15)
    for (const x of said) {
      expect(countWords(x.ask), `${x.id}: ${x.ask}`).toBeLessThanOrEqual(20)
      expect(countWords(x.ask) + countWords(x.why), `${x.id}: ${x.ask} ${x.why}`).toBeLessThanOrEqual(40)
      expect(x.ask).not.toMatch(/undefined|NaN|\[object/)
    }
    const { w, c } = farm(3)
    S.apply(w, c, { t: 'begin' })
    for (const x of LESSONS) for (const input of INPUTS) {
      const l = look(w, c, { input })
      expect(countWords(x.ask(l)), x.id).toBeLessThanOrEqual(20)
      expect(countWords(x.ask(l)) + countWords(x.why(l)), x.id).toBeLessThanOrEqual(40)
    }
    const field = lesson('field')!
    expect(field.ask(look(w, c, { input: 'keys' }))).toMatch(/^Press \d/)
    expect(field.ask(look(w, c, { input: 'touch' }))).toMatch(/^Tap/)
    expect(field.ask(look(w, c, { input: 'mouse' }))).toMatch(/^Click/)
  })
})
