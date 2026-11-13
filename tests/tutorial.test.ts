import { describe, expect, it } from 'vitest'
import { countWords, Guide, KEY, LESSONS, lesson, PIECES, type Input, type Look, type Store } from '../src/game/tutorial.ts'
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
    needs: S.fieldNeeds(w, c).map(n => n.need), paper: '', papers: [], input: 'mouse', stopped: '', wait: 12, ...o,
  }
}

const INPUTS: Input[] = ['mouse', 'touch', 'keys']
// Every note's words in every state it was shown in, for the word limit.
const said: { id: string; ask: string; why: string }[] = []
function hear(g: Guide, l: Look): string | null {
  const x = g.current(l)
  if (x) for (const input of INPUTS) { const v = { ...l, input }; said.push({ id: x.id, ask: x.ask(v), why: x.why(v) }) }
  return x?.id ?? null
}

const planted = (c: S.Campaign) => c.plans.every((p, i) => p?.crop !== 'potato' || c.fields[i].tenure === 'none' || c.season!.fields[i].plantDay >= 0)

// A guided first year from the first spring to the second, played as a player following the guide would: each note is
// read and put away, the spraying question answered the way given, the season and the year closed when asked.
function guidedYear(seed: number, way: S.SprayWay = 'auto'): { shown: string[]; g: Guide; w: S.World; c: S.Campaign; hid: Record<string, string[]> } {
  const { w, c } = farm(seed)
  const g = new Guide(memory())
  g.newFarm(c.seed)
  g.accept()
  const shown: string[] = []
  const hid: Record<string, string[]> = {}
  const see = (l: Look) => {
    const id = hear(g, l)
    if (id && !shown.includes(id)) { shown.push(id); hid[id] = g.hidden(c, l.screen) }
    return id
  }
  const read = (l: () => Look) => { for (let k = 0; k < 6; k++) { const id = see(l()); if (!id || !lesson(id)!.read) return id; g.noted(id) } return null }
  expect(read(() => look(w, c))).toBe('begin')
  S.apply(w, c, { t: 'begin' })
  for (let n = 0; n < 320 && c.phase === 'season'; n++) {
    const id = read(() => look(w, c, { speed: 1 }))
    if (id === 'close') { S.apply(w, c, { t: 'endSeason' }); break }
    // The spraying question comes once its note is read.
    if (g.passed('blight') && S.sprayWayNow(c) === null) S.apply(w, c, { t: 'sprayWay', way })
    if (way === 'ask') S.fieldNeeds(w, c).forEach((x, field) => { const a = x.need; if (a && a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(w, c, { t: 'job', kind: a.act, field }) })
    for (const inc of [...c.incidents]) S.apply(w, c, { t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
    for (const lot of S.openLots(c)) if (c.season!.fields[lot.field]?.weighed) S.apply(w, c, { t: 'sell', lot: lot.id, frac: 1 })
    S.apply(w, c, { t: 'day' })
  }
  for (let m = 0; m < 12 && c.phase === 'cellar'; m++) { read(() => look(w, c)); S.apply(w, c, { t: 'month' }) }
  read(() => look(w, c))
  if (c.phase === 'ledger') S.apply(w, c, { t: 'next' })
  return { shown, g, w, c, hid }
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
    S.apply(w, c, { t: 'begin' })
    expect(g.current(look(w, c))).toBeNull()
    expect(g.hidden(c, 'season')).toEqual([])
  })

  it('opens on what the game is, then the land, then planting day: a dozen notes or so, each from the farm', () => {
    for (const seed of [3, 11, 42]) {
      const { shown, c } = guidedYear(seed)
      expect(shown.slice(0, 6), `seed ${seed}`).toEqual(['frame', 'begin', 'fields', 'look', 'plantday', 'tend'])
      // What every year brings, whatever its weather.
      for (const id of ['kill', 'dig', 'bills', 'close', 'cellar', 'book']) expect(shown, `seed ${seed}: ${id}`).toContain(id)
      const first = shown.filter(id => lesson(id)!.part !== 'spring')
      expect(first.length, `seed ${seed}: ${first.join(' ')}`).toBeLessThanOrEqual(18)
      expect(c.history.length).toBe(1)
    }
  })

  it('brings the screen in piece by piece: the land alone, then each piece with the note that introduces it', () => {
    const { hid, g, c, shown } = guidedYear(11)
    // Its first note is shown over the land with only the field tags brought in.
    expect(hid.fields).toEqual(PIECES.filter(p => p !== 'tags'))
    expect(hid.plantday).not.toContain('people')
    expect(hid.plantday).toContain('forecast')
    expect(hid.plantday).toContain('list')
    if (shown.includes('blight')) expect(hid.blight).not.toContain('forecast')
    // By the dig everything but the year-end figure is in, and that comes with the first crop weighed.
    expect(hid.dig).toEqual(['after'])
    expect(hid.bills).toEqual([])
    expect(g.hidden(c, 'season')).toEqual([])
  })

  it('holds nothing back off the guide, after it is stopped, or past the first year', () => {
    const { w, c } = farm(5)
    const g = new Guide(memory())
    g.newFarm(c.seed)
    g.accept()
    S.apply(w, c, { t: 'begin' })
    expect(g.hidden(c, 'season').length).toBe(PIECES.length)
    g.stop()
    expect(g.hidden(c, 'season')).toEqual([])
    g.resume()
    expect(g.hidden({ ...c, history: [{}] } as unknown as S.Campaign, 'season')).toEqual([])
  })

  it('a note skipped still brings its pieces in', () => {
    const { w, c } = farm(5)
    const g = new Guide(memory())
    g.newFarm(c.seed)
    g.accept()
    S.apply(w, c, { t: 'begin' })
    expect(g.current(look(w, c))?.id).toBe('fields')
    g.skip('fields')
    expect(g.hidden(c, 'season')).not.toContain('tags')
  })

  it('with spraying left to the player, the first stamp is explained and brings the stamps and the list in', () => {
    const { shown, hid } = guidedYear(11, 'ask')
    expect(shown).toContain('stamp')
    expect(hid.stamp).not.toContain('stamps')
    expect(hid.stamp).not.toContain('list')
  })

  it('with spraying left to the crew, the list is explained when the first spray is on it', () => {
    const { shown } = guidedYear(11, 'auto')
    if (shown.includes('blight')) expect(shown).toContain('list')
  })

  it('says each thing in 35 words or fewer, in every way of playing, and never names what the crew does as the player\'s to do', () => {
    for (const seed of [3, 42]) { guidedYear(seed, 'ask'); guidedYear(seed, 'auto') }
    const first = said.filter(x => lesson(x.id)!.part !== 'spring')
    expect(first.length).toBeGreaterThan(40)
    for (const x of first) {
      const n = countWords(`${x.ask} ${x.why}`)
      expect(n, `${x.id}: ${x.ask} ${x.why}`).toBeLessThanOrEqual(35)
    }
    // The later lessons keep to the limit they were written to.
    for (const x of said) expect(countWords(`${x.ask} ${x.why}`), `${x.id}: ${x.ask} ${x.why}`).toBeLessThanOrEqual(40)
  })

  it('every lesson has a name, and the first year is short', () => {
    for (const x of LESSONS) expect(x.name.length).toBeGreaterThan(3)
    expect(LESSONS.filter(x => x.part !== 'spring').length).toBeLessThanOrEqual(20)
  })

  it('keeps its progress in its own key, and takes it up again after a reload', () => {
    const store = memory()
    const { w, c } = farm(21)
    const g = new Guide(store)
    g.newFarm(c.seed)
    g.accept()
    expect(g.current(look(w, c))?.id).toBe('frame')
    g.noted('frame')
    expect(KEY).toBe('the-county/tutorial')
    const again = new Guide(store)
    expect(again.on).toBe(true)
    expect(again.passed('frame')).toBe(true)
    expect(again.current(look(w, c))?.id).toBe('begin')
  })

  it('shows a lesson again when asked, whether or not the guide is on', () => {
    const { w, c } = farm(21)
    const g = new Guide(memory())
    g.refuse()
    S.apply(w, c, { t: 'begin' })
    expect(g.current(look(w, c))).toBeNull()
    g.replay('fields')
    expect(g.current(look(w, c))?.id).toBe('fields')
    g.noted('fields')
    expect(g.current(look(w, c))).toBeNull()
  })
})

describe('the farm\'s first weeks', () => {
  it('no telegram comes in a farm\'s first year before its first planting is finished', () => {
    let after = 0
    for (const seed of [3, 7, 11, 21, 42, 99]) {
      const { w, c } = farm(seed)
      S.apply(w, c, { t: 'begin' })
      for (let n = 0; n < 220 && c.phase === 'season' && !S.seasonDone(c); n++) {
        const was = planted(c)
        if (!was) expect(c.incidents.length, `seed ${seed}, day ${c.season!.day}`).toBe(0)
        else after += c.incidents.length
        for (const inc of [...c.incidents]) S.apply(w, c, { t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
        S.apply(w, c, { t: 'day' })
      }
    }
    // Once the fields are in, telegrams come as they did.
    expect(after).toBeGreaterThan(0)
  })
})

describe('what a note says against what the game does (round six)', () => {
  // A hands-off first year with the crew spraying, stopped on each evening's frost warning.
  function frostEvenings(seed: number, year: number, each: (w: S.World, c: S.Campaign) => void): void {
    const c = S.createCampaign(record, { seed, startYear: year })
    S.apply(record, c, { t: 'begin' })
    S.apply(record, c, { t: 'sprayWay', way: 'auto' })
    for (let n = 0; n < 400 && c.phase === 'season' && !S.seasonDone(c); n++) {
      for (const inc of [...c.incidents]) S.apply(record, c, { t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
      for (const lot of S.openLots(c)) if (c.season!.fields[lot.field]?.weighed) S.apply(record, c, { t: 'sell', lot: lot.id, frac: 1 })
      const r = S.apply(record, c, { t: 'day' })
      if (r.events.some(e => e.type === 'frostBarrels')) each(record, c)
    }
  }
  const cold = (w: S.World, c: S.Campaign) => S.haulInfo(w, c).filter(x => S.frostOnBarrels(w, c, x.field))

  it('the frost note promises nothing the night can break: it says what the crew does and what a tractor hauls, and warns when that is not enough', () => {
    const frost = lesson('frost')!
    let warned = 0, short = 0
    for (const [year, seeds] of [[1985, [2, 8, 11, 12]], [1995, [7, 8, 12]], [2008, [2]]] as const) {
      for (const seed of seeds) {
        frostEvenings(seed, year, (w, c) => {
          const g = new Guide(memory())
          g.skipTo('frost')
          const l = look(w, c, { speed: 3 })
          // The warning brings the note by itself: the game is not paused for it first.
          expect(g.current(l)?.id, `${year}/${seed}`).toBe('frost')
          warned++
          const days = cold(w, c).reduce((t, x) => t + x.daysToHaul, 0)
          for (const input of INPUTS) {
            const said = `${frost.ask({ ...l, input })} ${frost.why({ ...l, input })}`
            expect(said).not.toMatch(/don't need to do anything|will haul them in|before the frost/)
            expect(said).toMatch(/a fifth/)
            expect(said).toMatch(/may freeze|can still catch/)
            expect(countWords(said)).toBeLessThanOrEqual(35)
            if (days > 0.9) expect(said, `${days.toFixed(2)} days of hauling`).toMatch(/may freeze/)
          }
          if (days > 0.9) short++
          // The hauling is on the list: nothing for the player to order, so the note offers no order.
          expect(frost.act!(l)).toBeNull()
          expect(frost.show!(l)).toEqual({ field: [...cold(w, c)].sort((a, b) => b.cwt - a.cwt)[0].field })
        })
      }
    }
    expect(warned).toBeGreaterThan(4)
    expect(short).toBeGreaterThan(0)
  })

  it('with hauling off the crew\'s routine, the frost note says so and its key orders the haul', () => {
    const frost = lesson('frost')!
    let seen = 0
    frostEvenings(8, 1985, (w, c0) => {
      if (seen) return
      const c = structuredClone(c0)
      expect(S.apply(w, c, { t: 'routine', kind: 'haul', auto: false }).ok).toBe(true)
      // (a haul already ordered cannot be cancelled by a player: taken off here to stand for one never ordered)
      c.season!.jobs = c.season!.jobs.filter(j => j.kind !== 'haul')
      for (const u of c.crew) u.job = -1
      const l = look(w, c)
      expect(frost.why(l)).toMatch(/until you order it/)
      const act = frost.act!(l)!
      expect(act.label).toBe('Order the haul')
      for (const cmd of act.cmds) expect(S.apply(w, c, cmd).ok).toBe(true)
      expect(frost.act!(look(w, c))).toBeNull()
      seen++
    })
    expect(seen).toBe(1)
  })

  it('a note about a stamp names the field whose stamp is on the screen, and its Show me goes there', () => {
    const { w, c } = farm(11)
    S.apply(w, c, { t: 'begin' })
    S.apply(w, c, { t: 'sprayWay', way: 'ask' })
    const stamp = lesson('stamp')!
    let l = look(w, c)
    for (let n = 0; n < 200 && l.needs.filter(a => a?.act === 'spray').length < 2; n++) { S.apply(w, c, { t: 'day' }); l = look(w, c) }
    const fields = l.needs.map((a, i) => (a?.act === 'spray' ? i : -1)).filter(i => i >= 0)
    expect(fields.length).toBeGreaterThan(1)
    const last = fields[fields.length - 1]
    // Nothing known of the screen: the first. A later field's stamp in view: that one, in the words, the fist and Show me.
    expect(stamp.ask(l)).toContain(S.FIELD_NAMES[fields[0]])
    const seen = { ...l, inView: [last] }
    expect(stamp.ask(seen)).toContain(S.FIELD_NAMES[last])
    expect(stamp.ask(seen)).not.toContain(S.FIELD_NAMES[fields[0]])
    expect(stamp.point!(seen)).toEqual({ badge: last })
    expect(stamp.show!(seen)).toEqual({ field: last })
  })

  it('the keys that run the game fast say so, and no spring note argues with the goal slip', () => {
    const { w, c } = farm(11)
    S.apply(w, c, { t: 'begin' })
    const l = look(w, c)
    let keys = 0
    for (const x of LESSONS) {
      const skip = x.skip?.(l)
      if (skip) { keys++; expect(skip, x.id).toMatch(/^Fast-forward to /) }
    }
    expect(keys).toBeGreaterThan(0)
    for (const id of ['hire', 'begin2']) expect(`${lesson(id)!.ask(l)} ${lesson(id)!.why(l)}`).not.toMatch(/don't have to hire/)
    // The notes reworded this round keep the 35 words, however they are played.
    S.apply(w, c, { t: 'hire', kind: 'hand' })
    for (const id of ['yard', 'foreman', 'frost']) for (const input of INPUTS) {
      const v = { ...look(w, c), input }
      expect(countWords(`${lesson(id)!.ask(v)} ${lesson(id)!.why(v)}`), id).toBeLessThanOrEqual(35)
    }
    // A control is named by the words on it: the winter sheet's heading, and its key's count.
    expect(lesson('yard')!.ask(look(w, c))).toMatch(/^Under Put up a building, click "\d+ to choose from"/)
    expect(lesson('foreman')!.ask(look(w, c))).toMatch(/^A foreman is a hired hand who orders a block's field work for you each morning\./)
  })
})
