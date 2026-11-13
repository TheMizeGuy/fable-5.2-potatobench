import { describe, expect, it } from 'vitest'
import { countWords, driving, Guide, KEY, LESSONS, lesson, openAsks, OPENING_PACE, PIECES, RUN_PACE, type Input, type Look, type Scene, type Store } from '../src/game/tutorial.ts'
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
    // The word to plant is given where its note points, once the note is read.
    if (g.passed('word') && !S.plantWordGiven(c.season!)) { const field = S.fieldNeeds(w, c).findIndex(x => x.need?.act === 'plant'); if (field >= 0) S.apply(w, c, { t: 'job', kind: 'plant', field }) }
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
      // (the owner, after round eight: the tutorial starts when planting is ready, so the season's first note is the
      // word to plant; the guide carries the player through the weeks before it)
      expect(shown.slice(0, 5), `seed ${seed}`).toEqual(['frame', 'begin', 'word', 'plantday', 'tend'])
      // What every year brings, whatever its weather.
      for (const id of ['kill', 'dig', 'bills', 'close', 'cellar', 'book']) expect(shown, `seed ${seed}: ${id}`).toContain(id)
      const first = shown.filter(id => lesson(id)!.part !== 'spring')
      expect(first.length, `seed ${seed}: ${first.join(' ')}`).toBeLessThanOrEqual(18)
      expect(c.history.length).toBe(1)
    }
  })

  it('brings the screen in piece by piece: the land alone, then each piece with the note that introduces it', () => {
    const { hid, g, c, shown } = guidedYear(11)
    // The season's first note (the word to plant) is shown over the land with only the tags and their stamps brought in.
    expect(hid.word).toEqual(PIECES.filter(p => p !== 'tags' && p !== 'stamps'))
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
    // The season opens on the land alone, with no note until the soil is ready.
    expect(g.current(look(w, c))).toBeNull()
    expect(g.hidden(c, 'season')).toContain('tags')
    g.skip('word')
    expect(g.hidden(c, 'season')).not.toContain('tags')
    expect(g.hidden(c, 'season')).not.toContain('stamps')
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
    expect(g.current(look(w, c))).toBeNull()
    g.replay('begin')
    expect(g.current(look(w, c))?.id).toBe('begin')
    S.apply(w, c, { t: 'begin' })
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

  it('the frost note promises nothing the night can break, and its key is the one order that hauls the barrels in now', () => {
    const frost = lesson('frost')!
    let warned = 0, short = 0
    for (const [year, seeds] of [[1985, [2, 8, 11, 12]], [1995, [7, 8, 12]], [2008, [2]]] as const) {
      for (const seed of seeds) {
        frostEvenings(seed, year, (w, c0) => {
          const c = structuredClone(c0)
          const g = new Guide(memory())
          g.skipTo('frost')
          const l = look(w, c, { speed: 3 })
          // The warning brings the note by itself: the game is not paused for it first.
          expect(g.current(l)?.id, `${year}/${seed}`).toBe('frost')
          warned++
          const most = [...cold(w, c)].sort((a, b) => b.cwt - a.cwt)[0]
          for (const input of INPUTS) {
            const said = `${frost.ask({ ...l, input })} ${frost.why({ ...l, input })}`
            expect(said).not.toMatch(/don't need to do anything|will haul them in|before the frost/)
            expect(said).toMatch(/a fifth/)
            expect(said).toContain(`Haul it in now sends whoever can bring in the most from ${S.FIELD_NAMES[most.field]} by dark`)
            expect(countWords(said)).toBeLessThanOrEqual(35)
          }
          expect(frost.show!(l)).toEqual({ field: most.field })
          // One way to order the haul: the frost toast's own command, and the game's own answer to it, which says
          // how much comes in by dark and how much stays out.
          const act = frost.act!(l)!
          expect(act.label).toBe('Haul it in now')
          expect(act.cmds).toEqual([{ t: 'haulNow', field: most.field }])
          expect(act.done).toBeUndefined()
          const r = S.apply(w, c, act.cmds[0])
          expect(r.ok).toBe(true)
          // (or that nobody can drive tonight, when the one driver is laid up)
          expect(r.events[0].text).toMatch(/hauling .* now\. .* by dark|stay out tonight/)
          if (/will stay out|stay out tonight/.test(r.events[0].text)) short++
          expect(c.season!.jobs[0]).toMatchObject({ kind: 'haul', field: most.field })
        })
      }
    }
    expect(warned).toBeGreaterThan(4)
    expect(short).toBeGreaterThan(0)
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

  it('no note carries a key to run the game fast (the guide runs the clock itself), and no spring note argues with the goal slip', () => {
    const { w, c } = farm(11)
    S.apply(w, c, { t: 'begin' })
    const l = look(w, c)
    for (const x of LESSONS) expect('skip' in x, x.id).toBe(false)
    for (const id of ['hire', 'begin2']) expect(`${lesson(id)!.ask(l)} ${lesson(id)!.why(l)}`).not.toMatch(/don't have to hire/)
    // The notes reworded this round keep the 35 words, however they are played.
    S.apply(w, c, { t: 'hire', kind: 'hand' })
    for (const id of ['yard', 'foreman', 'frost']) for (const input of INPUTS) {
      const v = { ...look(w, c), input }
      expect(countWords(`${lesson(id)!.ask(v)} ${lesson(id)!.why(v)}`), id).toBeLessThanOrEqual(35)
    }
    // A control is named by the words on it: the winter sheet's heading, and its key's count.
    expect(lesson('yard')!.ask(look(w, c))).toMatch(/^Under Put up a building, click "\d+ to choose from"/)
    // (round seven: what a foreman does and why it pays, with no "block")
    const foreman = `${lesson('foreman')!.ask(look(w, c))} ${lesson('foreman')!.why(look(w, c))}`
    expect(foreman).toMatch(/^A foreman orders the work on your fields away from home each morning, so nothing out there waits for you\./)
    expect(foreman).toMatch(/40% more and stop field work/)
    expect(foreman).not.toMatch(/block/i)
  })
})

describe('round seven: what the player is for, and what the agent asks', () => {
  // A first guided season brought to the day the soil is fit and the Plant stamps go up.
  function ready(seed = 11): { w: S.World; c: S.Campaign; g: Guide } {
    const { w, c } = farm(seed)
    const g = new Guide(memory())
    g.newFarm(c.seed)
    g.accept()
    for (const id of ['frame']) g.noted(id)
    S.apply(w, c, { t: 'begin' })
    for (let n = 0; n < 120 && !S.fieldNeeds(w, c).some(x => x.need?.act === 'plant'); n++) {
      expect(g.current(look(w, c, { speed: 3 })), `day ${n}`).toBeNull()
      S.apply(w, c, { t: 'day' })
    }
    return { w, c, g }
  }

  it('the planting note is the ask for the player\'s word: it names the stamp to press, and the press brings the note that says what followed', () => {
    const { w, c, g } = ready()
    const l = look(w, c, { speed: 3 })
    const word = g.current(l)!
    expect(word.id).toBe('word')
    const field = S.fieldNeeds(w, c).findIndex(n => n.need?.act === 'plant')
    expect(word.ask(l)).toBe(`The soil is ready, and planting waits for your word. Click the ringed Plant stamp on ${S.FIELD_NAMES[field]}.`)
    expect(word.why(l)).toBe('Your crew then plants the other 3 fields on its own.')
    expect(word.point!(l)).toEqual({ badge: field })
    // It brings the stamps onto the guided screen, and it asks: the game stays paused after Got it.
    expect(g.hidden(c, 'season')).not.toContain('stamps')
    expect(word.asks!(l)).toBe(true)
    // The stamp in view is the one named.
    const other = S.fieldNeeds(w, c).findIndex((n, i) => i !== field && n.need?.act === 'plant')
    if (other >= 0) expect(word.ask({ ...l, inView: [other] })).toContain(S.FIELD_NAMES[other])
    // No press: the note stays, however many times it is looked at. The press passes it.
    for (let k = 0; k < 5; k++) expect(g.current(look(w, c))?.id).toBe('word')
    expect(S.apply(w, c, { t: 'job', kind: 'plant', field }).ok).toBe(true)
    const after = g.current(look(w, c))!
    expect(after.id).toBe('plantday')
    expect(after.ask(look(w, c))).toBe('You gave the word. Your crew will plant the other 3 fields too. You\'re on the crew, and your face at the bottom shows what you\'re doing.')
    expect(after.asks?.(look(w, c)) ?? false).toBe(false)
    for (const input of INPUTS) for (const x of [word, after]) expect(countWords(`${x.ask({ ...l, input })} ${x.why({ ...l, input })}`), x.id).toBeLessThanOrEqual(35)
  })

  it('with the note put away and no press, the crew starts after three days and the next note says so', () => {
    const { w, c, g } = ready()
    expect(g.current(look(w, c))?.id).toBe('word')
    g.noted('word')
    for (let n = 0; n < 9 && !S.plantWordGiven(c.season!); n++) { expect(g.current(look(w, c, { speed: 1 }))).toBeNull(); S.apply(w, c, { t: 'day' }) }
    expect(c.season!.plantWordBy).toBe('crew')
    const after = g.current(look(w, c))!
    expect(after.id).toBe('plantday')
    expect(after.ask(look(w, c))).toMatch(/^You gave no word, so your crew started planting on its own\./)
  })

  it('a note that asks for a press on the land says so, and one that only tells does not', () => {
    const asking = LESSONS.filter(x => x.asks).map(x => x.id)
    expect(asking).toEqual(['word', 'stamp', 'kill', 'hand'])
    const { w, c } = farm(11)
    S.apply(w, c, { t: 'begin' })
    const l = look(w, c)
    for (const id of ['plantday', 'tend', 'blight', 'list', 'frost', 'dig', 'bills']) expect(lesson(id)!.asks?.(l) ?? false, id).toBe(false)
    expect(lesson('stamp')!.asks!(l)).toBe(true)
    // The vine kill asks only when there is a stamp to press and the crew has given no date of its own.
    expect(lesson('kill')!.asks!(l)).toBe(false)
  })

  it('the first card says who does the field work as it is: you alone, or you and your crew', () => {
    const { w, c } = farm(11)
    const frame = lesson('frame')!
    expect(c.crew.length).toBe(1)
    expect(frame.why(look(w, c))).toBe('You and anyone you hire do the field work, and you make the big decisions. I\'ll pause the game to explain each one.')
    expect(frame.why(look(w, c))).not.toMatch(/Your crew handles/)
    S.apply(w, c, { t: 'hire', kind: 'hand' })
    expect(frame.why(look(w, c))).toMatch(/^You and your crew do the field work/)
  })

  it('in the second spring a step waits for its own thing: the field\'s record open holds the walk until it is closed or the player says Got it', () => {
    const { w, c } = guidedYear(11)
    expect(c.phase).toBe('plan')
    const g = new Guide(memory())
    g.skipTo('seed')
    expect(g.current(look(w, c))?.id).toBe('seed')
    // A field picked: the step about that field, for as long as its record is open, whatever else is looked at.
    const picked = look(w, c, { selection: [0] })
    expect(g.current(picked)?.id).toBe('crop')
    expect(lesson('crop')!.ask(picked)).toBe(`Choose potatoes or a rest year for ${S.FIELD_NAMES[0]}, and which variety to grow.`)
    for (let k = 0; k < 20; k++) expect(g.current(look(w, c, { selection: [0], fold: k % 2 ? 'crew' : '' }))?.id).toBe('crop')
    // Closed: the walk goes on to People, and not before.
    expect(g.current(look(w, c))?.id).toBe('people')
    // Or the player says so with the record still open.
    const h = new Guide(memory())
    h.skipTo('seed')
    h.current(look(w, c))
    expect(h.current(picked)?.id).toBe('crop')
    h.noted('crop')
    expect(h.current(picked)?.id).toBe('people')
  })

  it('a foreman is offered only where one pays: two hired hands and fields away from home', () => {
    const { w, c } = guidedYear(11)
    S.apply(w, c, { t: 'begin' })
    const g = new Guide(memory())
    g.skipTo('foreman')
    const shown = () => g.current(look(w, c))?.id ?? ''
    expect(shown()).toBe('')
    S.apply(w, c, { t: 'hire', kind: 'hand' })
    expect(shown()).toBe('')
    c.fields[6].tenure = 'rented'
    expect(shown()).toBe('')
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: S.HOME_YARD, done: 1, need: 1, built: true })
    expect(S.apply(w, c, { t: 'hire', kind: 'hand' }).ok).toBe(true)
    expect(shown()).toBe('foreman')
  })
})

describe('the guide runs the clock between its notes', () => {
  const at = (w: S.World, c: S.Campaign, o: Partial<Look> = {}) => look(w, c, { speed: 3, wait: c.phase === 'season' ? S.plantingIn(w, c) : -1, ...o })
  function guided(seed = 11): { w: S.World; c: S.Campaign; g: Guide } {
    const { w, c } = farm(seed)
    const g = new Guide(memory())
    g.newFarm(c.seed)
    g.accept()
    g.noted('frame')
    S.apply(w, c, { t: 'begin' })
    return { w, c, g }
  }

  it('carries the player from Start the season to the day the soil is ready in a few seconds, at one pace, saying what passes', () => {
    for (const seed of [3, 11, 42]) {
      const { w, c, g } = guided(seed)
      const first = driving(at(w, c), g)!
      expect(first.speed).toBe(3)
      expect(first.line, `seed ${seed}`).toBe('A few weeks pass while the soil warms.')
      expect(first.next).toBe('Next: planting, on your word.')
      // The seconds the wait takes: each day at the pace the guide gives that day (8x is two days a second).
      let seconds = 0
      const paces = new Set<number>()
      for (let n = 0; n < 120 && c.season!.plantAsk === undefined; n++) {
        const d = driving(at(w, c), g)!
        expect(d.waits, `seed ${seed}, day ${n}`).toBeUndefined()
        expect(d.scene).toBeUndefined()
        paces.add(Math.round(d.pace * 100))
        seconds += 1 / (2 * d.pace)
        S.apply(w, c, { t: 'day' })
      }
      expect(c.season!.plantAsk, `seed ${seed}`).toBeDefined()
      expect(seconds, `seed ${seed}: seconds to the ask`).toBeLessThan(4)
      expect([...paces], `seed ${seed}: one pace`).toEqual([OPENING_PACE * 100])
      expect(OPENING_PACE).toBeGreaterThan(RUN_PACE)
      // The day of the ask it waits: the press is the player's, or theirs to wave through.
      const ask = driving(at(w, c, { speed: 0 }), g)!
      expect(ask.waits?.id).toBe('word')
      expect(ask.line).toBe('Planting waits for your word. Click a ringed Plant stamp.')
      expect(driving(at(w, c, { speed: 0 }), g, new Set(['word']))!.waits).toBeUndefined()
    }
  })

  it('slows to show each kind of work the first day it is done, once, and says who is doing it where', () => {
    const { w, c, g } = guided(11)
    const seen: Scene[] = []
    const lines = new Set<string>()
    for (let n = 0; n < 320 && c.phase === 'season' && !S.seasonDone(c); n++) {
      if (!S.plantWordGiven(c.season!)) { const field = S.fieldNeeds(w, c).findIndex(x => x.need?.act === 'plant'); if (field >= 0) S.apply(w, c, { t: 'job', kind: 'plant', field }) }
      if (c.season!.watchDay >= 0 && S.sprayWayNow(c) === null) S.apply(w, c, { t: 'sprayWay', way: 'auto' })
      for (const inc of [...c.incidents]) S.apply(w, c, { t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
      for (const lot of S.openLots(c)) if (c.season!.fields[lot.field]?.weighed) S.apply(w, c, { t: 'sell', lot: lot.id, frac: 1 })
      const d = driving(at(w, c), g)
      expect(d, `day ${n}`).not.toBeNull()
      lines.add(`${d!.line} ${d!.next}`)
      if (d!.scene) {
        seen.push(d!.scene)
        g.note(`seen:${d!.scene.id}`)
        // The same day, looked at again: that work is not shown twice.
        expect(driving(at(w, c), g)!.scene?.id).not.toBe(d!.scene.id)
      }
      S.apply(w, c, { t: 'day' })
    }
    const ids = seen.map(x => x.id)
    for (const id of ['plant', 'up', 'hill', 'kill', 'dig', 'haul']) expect(ids, ids.join(' ')).toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.indexOf('plant')).toBeLessThan(ids.indexOf('up'))
    expect(ids.indexOf('kill')).toBeLessThan(ids.indexOf('dig'))
    for (const x of seen) {
      expect(x.field, x.id).toBeGreaterThanOrEqual(0)
      if (x.id !== 'up') expect(c.crew.some(u => u.id === x.unit), `${x.id}: someone to follow`).toBe(true)
      expect(x.line).toContain(S.FIELD_NAMES[x.field])
      expect(countWords(x.line), x.line).toBeLessThanOrEqual(14)
    }
    expect(seen.find(x => x.id === 'plant')!.line).toMatch(/^You're planting /)
    // What is passing is said in a line, and what comes next in another, all year.
    expect(lines.size).toBeGreaterThan(4)
    for (const t of lines) expect(countWords(t), t).toBeLessThanOrEqual(18)
  })

  it('is the guide\'s in a first year until the player takes the clock, and the player\'s after that and in later years unless they hand it back', () => {
    const { w, c, g } = guided(11)
    expect(g.drives(c)).toBe(true)
    expect(driving(at(w, c), g)).not.toBeNull()
    g.takeClock()
    expect(g.drives(c)).toBe(false)
    expect(driving(at(w, c), g)).toBeNull()
    g.giveClock()
    expect(driving(at(w, c), g)).not.toBeNull()
    // The tutorial off: nothing runs the clock.
    g.stop()
    expect(driving(at(w, c), g)).toBeNull()
    // A second year: the guide is quiet about the clock unless asked.
    const later = guidedYear(11)
    S.apply(later.w, later.c, { t: 'begin' })
    const h = new Guide(memory())
    h.skipTo('calls2')
    expect(h.drives(later.c)).toBe(false)
    expect(driving(at(later.w, later.c), h)).toBeNull()
    h.giveClock()
    expect(driving(at(later.w, later.c), h)).not.toBeNull()
    expect(driving(at(later.w, later.c), h)!.scene).toBeUndefined()
  })

  it('waits for a ringed stamp the year is waiting on, and goes on once it is pressed or waved through', () => {
    const { w, c, g } = guided(11)
    S.apply(w, c, { t: 'sprayWay', way: 'ask' })
    let field = -1
    for (let n = 0; n < 200 && field < 0; n++) {
      if (!S.plantWordGiven(c.season!)) { const f = S.fieldNeeds(w, c).findIndex(x => x.need?.act === 'plant'); if (f >= 0) S.apply(w, c, { t: 'job', kind: 'plant', field: f }) }
      for (const inc of [...c.incidents]) S.apply(w, c, { t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
      field = S.fieldNeeds(w, c).findIndex(x => x.need?.act === 'spray')
      if (field < 0) S.apply(w, c, { t: 'day' })
    }
    expect(field).toBeGreaterThanOrEqual(0)
    const open = openAsks(at(w, c))
    expect(open.length).toBeGreaterThan(0)
    const d = driving(at(w, c), g)!
    expect(d.waits?.id).toBe(open[0].id)
    expect(d.line).toMatch(/ Click its ringed stamp\.$/)
    expect(driving(at(w, c), g, new Set(open.map(a => a.id)))!.waits).toBeUndefined()
    // Pressed, for every field that asks: nothing is waited on.
    S.fieldNeeds(w, c).forEach((x, i) => { if (x.need?.act === 'spray') S.apply(w, c, { t: 'job', kind: 'spray', field: i }) })
    expect(driving(at(w, c), g)!.waits).toBeUndefined()
  })
})

describe('round eight: the guide in the opening and in the second spring', () => {
  it('at the opening nothing stands between Start the season and the first thing the player does on the land: no note until the word', () => {
    const { w, c } = farm(11)
    const g = new Guide(memory())
    g.newFarm(c.seed)
    g.accept()
    g.noted('frame')
    expect(g.current(look(w, c))?.id).toBe('begin')
    S.apply(w, c, { t: 'begin' })
    // No note until the soil is ready, and then the ask for the word. (The owner, after round eight: "we should
    // start the tutorial when planting is ready".)
    let next = ''
    for (let n = 0; n < 120 && !next; n++) {
      next = g.current(look(w, c, { speed: 3 }))?.id ?? ''
      if (!next) S.apply(w, c, { t: 'day' })
    }
    expect(next).toBe('word')
    expect(lesson('look')).toBeUndefined()
    expect(lesson('fields')).toBeUndefined()
  })

  it('the second spring\'s walk never goes quiet over a fold it opened, says hiring and land are choices, and ends on a closing line', () => {
    const { w, c } = guidedYear(11)
    expect(c.phase).toBe('plan')
    const g = new Guide(memory())
    g.skipTo('people')
    expect(g.current(look(w, c))?.id).toBe('people')
    // People open: the note about hiring, which says it is a choice.
    g.note('fold:crew')
    const crew = look(w, c, { fold: 'crew' })
    expect(g.current(crew)?.id).toBe('hire')
    expect(lesson('hire')!.why(crew)).toMatch(/You can also wait, because you can farm alone for another year\./)
    g.noted('hire')
    expect(g.current(crew)?.id).toBe('land')
    // Land open: a note of its own, for as long as the fold is open or until Got it. The walk does not vanish.
    g.note('fold:land')
    const land = look(w, c, { fold: 'land' })
    for (let k = 0; k < 20; k++) expect(g.current(land)?.id).toBe('lots')
    expect(lesson('lots')!.read).toBe(true)
    expect(`${lesson('lots')!.ask(land)} ${lesson('lots')!.why(land)}`).toBe('Each lot lists its rent for the year, then its price to buy. More land is a choice, and the land you have is enough for now. Click Got it when you\'ve looked, and I\'ll go on.')
    g.noted('lots')
    expect(g.current(land)?.id).toBe('loan')
    g.skip('loan')
    // The closing line, which the player sees whether or not the money was opened.
    const last = g.current(land)!
    expect(last.id).toBe('begin2')
    expect(last.ask(land)).toBe('That\'s the plan. Click Start the season when you\'re ready.')
    for (const id of ['lots', 'begin2', 'calls2']) for (const input of INPUTS) {
      const v = { ...land, input }
      expect(countWords(`${lesson(id)!.ask(v)} ${lesson(id)!.why(v)}`), id).toBeLessThanOrEqual(40)
    }
    // The season's first note says the game pauses for the word.
    expect(lesson('calls2')!.ask(land)).toBe('It\'s a new season. The game pauses when the soil is ready, and planting waits for your word.')
  })
})
