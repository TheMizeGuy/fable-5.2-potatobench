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
    needs: S.fieldNeeds(w, c).map(n => n.need), paper: '', papers: [], input: 'mouse', ...o,
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

// The coach's orders for today, as a player following the stamps gives them.
function coach(w: S.World, c: S.Campaign, skip: string[] = []): void {
  for (const a of S.advise(w, c)) {
    if (a.act === 'wait' || a.act === 'close' || a.act === 'sell' || skip.includes(a.act)) continue
    S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
  }
}

// A guided first year from the spring to the second spring: each lesson's first showing and its passing, in order.
function guidedYear(seed: number, o: { offer?: boolean } = {}): { shown: string[]; passed: string[]; g: Guide; w: S.World; c: S.Campaign } {
  const { w, c } = farm(seed)
  const g = new Guide(memory())
  g.newFarm(c.seed)
  if (o.offer !== false) g.accept()
  const shown: string[] = []
  const see = (l: Look) => { const id = hear(g, l); if (id && shown[shown.length - 1] !== id) shown.push(id) ; return id }
  see(look(w, c))
  S.apply(w, c, { t: 'begin' })
  // The opening, the idle weeks: the camera, the boards, a field, its card, a person, the clock.
  see(look(w, c))
  g.note('pan'); see(look(w, c))
  g.note('turn'); see(look(w, c))
  if (see(look(w, c)) === 'boards') g.noted('boards')
  see(look(w, c))
  see(look(w, c, { selection: [0] }))
  see(look(w, c))
  if (see(look(w, c)) === 'person') g.noted('person')
  see(look(w, c))
  see(look(w, c, { speed: 1 }))
  // The season by the stamps; a weigh ticket is a paper over the land for a moment, then answered.
  for (let n = 0; n < 320 && c.phase === 'season'; n++) {
    const l = look(w, c, { speed: 3 })
    const id = see(l)
    if (id === 'frost' || id === 'haul') g.noted(id)
    if (S.seasonDone(c)) { see(look(w, c)); S.apply(w, c, { t: 'endSeason' }); break }
    coach(w, c)
    for (const inc of [...c.incidents]) S.apply(w, c, { t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
    const r = S.apply(w, c, { t: 'day' })
    if (r.events.some(e => e.type === 'weighed')) {
      see(look(w, c, { paper: 'weighin', papers: ['weighin'] }))
      see(look(w, c))
    }
  }
  // The winter and the account book.
  see(look(w, c))
  for (let m = 0; m < 12 && c.phase === 'cellar'; m++) {
    if (m === 2) for (const lot of S.openLots(c)) S.apply(w, c, { t: 'sell', lot: lot.id, frac: 1 })
    S.apply(w, c, { t: 'month' })
    see(look(w, c))
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
    // Another farm later is not offered it again.
    g.newFarm(c.seed + 1)
    expect(g.offerFor({ ...c, seed: c.seed + 1 }, 'plan')).toBe(false)
    // Refused, a whole first year goes by with nothing shown and the clock never held.
    const run = guidedYear(99, { offer: false })
    expect(run.shown).toEqual([])
    expect(run.g.holdsClock(run.c)).toBe(false)
  })

  it('teaches the opening in order, holding the clock until the lesson that starts it', () => {
    const { w, c } = farm(99)
    const g = new Guide(memory())
    g.newFarm(c.seed)
    g.accept()
    expect(g.current(look(w, c))?.id).toBe('begin')
    S.apply(w, c, { t: 'begin' })
    expect(g.holdsClock(c)).toBe(true)
    expect(g.current(look(w, c))?.id).toBe('look')
    g.note('zoom')
    expect(g.current(look(w, c))?.id).toBe('turn')
    g.note('tip')
    expect(g.current(look(w, c))?.id).toBe('boards')
    g.noted('boards')
    expect(g.current(look(w, c))?.id).toBe('field')
    expect(g.current(look(w, c, { selection: [2] }))?.id).toBe('card')
    expect(g.current(look(w, c))?.id).toBe('person')
    expect(g.current(look(w, c, { unit: c.crew[0].id }))?.id).toBe('clock')
    expect(g.holdsClock(c)).toBe(true)
    expect(g.current(look(w, c, { speed: 1 }))?.id).toBe('fast')
    expect(g.holdsClock(c)).toBe(false)
    // The weeks go by until the soil is warm: then planting day, the order taken, and the rest planted.
    while (!S.fieldNeeds(w, c).some(n => n.need?.act === 'plant')) S.apply(w, c, { t: 'day' })
    const l = look(w, c, { speed: 1 })
    expect(g.current(l)?.id).toBe('plant')
    const i = l.needs.findIndex(a => a?.act === 'plant')
    expect(g.current(l)?.point?.(l)).toEqual({ badge: i })
    S.apply(w, c, { t: 'job', kind: 'plant', field: i })
    expect(g.current(look(w, c, { speed: 1 }))?.id).toBe('watch')
    for (let n = 0; n < 10 && !c.season!.fields.some(f => f.plantDay >= 0); n++) S.apply(w, c, { t: 'day' })
    expect(g.current(look(w, c, { speed: 1 }))?.id).toBe('rest')
    coach(w, c)
    for (let n = 0; n < 20 && S.fieldNeeds(w, c).some(x => x.need?.act === 'plant'); n++) { coach(w, c); S.apply(w, c, { t: 'day' }) }
    expect(g.current(look(w, c, { speed: 1 }))?.id).not.toBe('rest')
    for (const id of ['begin', 'look', 'turn', 'boards', 'field', 'card', 'person', 'clock', 'fast', 'plant', 'watch', 'rest']) expect(g.passed(id), id).toBe(true)
  })

  it('brings each lesson of the year the first time its moment comes, and each one passes from the farm', () => {
    const met = new Set<string>()
    const passed = new Set<string>()
    for (const seed of [99, 7, 3, 12, 41, 5]) {
      const run = guidedYear(seed)
      for (const id of run.shown) met.add(id)
      for (const id of run.passed) passed.add(id)
      // Nothing is shown twice in a year, and the opening comes first.
      expect(new Set(run.shown).size, run.shown.join(' ')).toBe(run.shown.length)
      expect(run.shown.slice(0, 2)).toEqual(['begin', 'look'])
      // The second spring's catalogue follows the account book.
      expect(run.c.phase).toBe('plan')
      expect(run.shown[run.shown.length - 1]).toBe('seed')
      if (met.has('water') && met.has('rogue') && met.has('telegram') && met.has('frost')) break
    }
    const year = ['telegram', 'scout', 'hill', 'spray', 'frost', 'sample', 'water', 'rogue', 'kill', 'dig', 'haul', 'ticket', 'close', 'cellar', 'book']
    for (const id of year) {
      expect(met.has(id), `${id} was never shown`).toBe(true)
      expect(passed.has(id), `${id} never passed`).toBe(true)
    }
    for (const id of ['begin', 'look', 'turn', 'boards', 'field', 'card', 'person', 'clock', 'fast', 'plant', 'watch']) expect(met.has(id), id).toBe(true)
  }, 120_000)

  it('teaches the second spring and the farm it opens up, each from the farm', () => {
    const run = guidedYear(99)
    const { g, w, c } = run
    expect(g.current(look(w, c))?.id).toBe('seed')
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
    const l = look(w, c)
    expect(g.current(l)?.id).toBe('hand')
    const u = c.crew.find(x => x.kind !== 'farmer')!
    expect(g.current(l)?.point?.(l)).toEqual({ unit: u.id })
    expect(g.current(look(w, c, { unit: u.id }))?.id).toBe('fell')
    const t = S.TRACTS.find(i => c.fields[i].tenure !== 'none' && (c.fields[i].cover === 'woods' || c.fields[i].cover === 'brush'))!
    S.apply(w, c, { t: 'job', kind: 'fell', field: t })
    c.cash += 60000
    c.logs = 20
    c.stone = 20
    const next = g.current(look(w, c))?.id
    expect(next).toBe('yard')
    expect(g.current(look(w, c, { yard: S.HOME_YARD }))?.id).not.toBe('yard')
    expect(g.passed('yard')).toBe(true)
  })

  it('never keeps a player who runs ahead behind a lesson: what the farm shows done is passed over', () => {
    const { w, c } = farm(7)
    const g = new Guide(memory())
    g.newFarm(c.seed)
    g.accept()
    S.apply(w, c, { t: 'begin' })
    // The clock started, a field picked, people met and the camera moved before any of them was asked.
    g.current(look(w, c, { speed: 3, selection: [1], unit: c.crew[0].id }))
    g.note('pan')
    g.note('turn')
    while (!S.fieldNeeds(w, c).some(n => n.need?.act === 'plant')) S.apply(w, c, { t: 'day' })
    // Every field planted on the first warm day, before the guide says a word about planting.
    coach(w, c)
    for (let n = 0; n < 20 && S.fieldNeeds(w, c).some(x => x.need?.act === 'plant'); n++) { coach(w, c); S.apply(w, c, { t: 'day' }) }
    for (let n = 0; n < 5; n++) S.apply(w, c, { t: 'day' })
    const shown = g.current(look(w, c, { speed: 3 }))?.id ?? ''
    // Only what still needs saying is left: the boards, which are read rather than done.
    expect(['boards']).toContain(shown)
    for (const id of ['begin', 'look', 'turn', 'field', 'person', 'clock', 'fast', 'plant', 'watch', 'rest']) expect(g.passed(id), id).toBe(true)
    g.noted('boards')
    expect(g.current(look(w, c, { speed: 3 }))?.part ?? 'year').not.toBe('opening')
  })

  it('gets out of the way of any paper but its own, and puts a telegram first', () => {
    const { w, c } = farm(99)
    const g = new Guide(memory())
    g.resume()
    S.apply(w, c, { t: 'begin' })
    expect(g.showing(look(w, c, { paper: 'menu', papers: ['menu'] }))).toBeNull()
    expect(g.showing(look(w, c))?.id).toBe('look')
    c.incidents.push({ id: c.nextIncident++, kind: 'breakdown', day: c.season!.day, until: c.season!.day + 2, choices: ['rush', 'wait'], unit: 0, back: c.season!.day + 3 } as S.Incident)
    expect(g.showing(look(w, c))?.id).toBe('telegram')
    S.apply(w, c, { t: 'answer', incident: c.incidents[0].id, choice: 'wait' })
    expect(g.showing(look(w, c))?.id).toBe('look')
    expect(g.passed('telegram')).toBe(true)
  })

  it('can be skipped a step at a time or as a whole, and replayed lesson by lesson', () => {
    const { w, c } = farm(99)
    const g = new Guide(memory())
    g.resume()
    S.apply(w, c, { t: 'begin' })
    expect(g.current(look(w, c))?.id).toBe('look')
    g.skip('look')
    expect(g.p.passed.look).toBe('skip')
    expect(g.current(look(w, c))?.id).toBe('turn')
    g.stop()
    expect(g.current(look(w, c))).toBeNull()
    expect(g.holdsClock(c)).toBe(false)
    // Replayed while the guide is off: that one lesson, and no other.
    g.replay('look')
    expect(g.current(look(w, c))?.id).toBe('look')
    g.note('pan')
    expect(g.current(look(w, c))).toBeNull()
    expect(g.p.replay).toEqual([])
    // A lesson replayed before its moment waits for it.
    g.replay('book')
    expect(g.current(look(w, c))).toBeNull()
    expect(g.p.replay).toEqual(['book'])
    // Read lessons replay with their "noted" forgotten.
    g.noted('boards')
    g.replay('boards')
    expect(g.current(look(w, c))?.id).toBe('boards')
    g.restart()
    expect(g.on).toBe(true)
    expect(g.current(look(w, c))?.id).toBe('look')
  })

  it('keeps its progress in its own storage key, and comes back the same after a reload', () => {
    const store = memory()
    const { w, c } = farm(99)
    const g = new Guide(store)
    g.newFarm(c.seed)
    g.accept()
    S.apply(w, c, { t: 'begin' })
    g.current(look(w, c))
    g.note('pan')
    g.skip('turn')
    g.current(look(w, c))
    const again = new Guide(store)
    expect(again.p).toEqual(g.p)
    expect(again.has('pan')).toBe(true)
    expect(again.current(look(w, c))?.id).toBe('boards')
    expect(KEY).toBe('the-county/tutorial')
    expect(KEY).not.toBe('the-county/save')
    // The farm is not written to.
    const before = JSON.stringify(c)
    again.current(look(w, c, { selection: [0], speed: 2 }))
    expect(JSON.stringify(c)).toBe(before)
    // A broken or foreign record starts afresh.
    expect(new Guide({ get: () => '{nope', set: () => {} }).p.mode).toBe('unset')
    expect(new Guide({ get: () => JSON.stringify({ v: 9, mode: 'on' }), set: () => {} }).p.mode).toBe('unset')
  })

  it('keeps every ask under 20 words and every ask with its reason under 40, in every way of playing', () => {
    if (!said.length) guidedYear(99)
    const seen = new Set(said.map(x => x.id))
    expect(seen.size).toBeGreaterThan(20)
    for (const x of said) {
      expect(countWords(x.ask), `${x.id}: ${x.ask}`).toBeLessThanOrEqual(20)
      expect(countWords(x.ask) + countWords(x.why), `${x.id}: ${x.ask} ${x.why}`).toBeLessThanOrEqual(40)
      expect(x.ask).not.toMatch(/undefined|NaN|\[object/)
    }
    // And lessons that were not met in these years, read against a season in progress.
    const { w, c } = farm(3)
    S.apply(w, c, { t: 'begin' })
    for (const x of LESSONS) for (const input of INPUTS) {
      const l = look(w, c, { input })
      expect(countWords(x.ask(l)), x.id).toBeLessThanOrEqual(20)
      expect(countWords(x.ask(l)) + countWords(x.why(l)), x.id).toBeLessThanOrEqual(40)
    }
    // Keys are taught only to someone using them.
    const field = lesson('field')!
    expect(field.ask(look(w, c, { input: 'keys' }))).toMatch(/^Press \d/)
    expect(field.ask(look(w, c, { input: 'touch' }))).toMatch(/^Tap/)
    expect(field.ask(look(w, c, { input: 'mouse' }))).toMatch(/^Click/)
  })
})
