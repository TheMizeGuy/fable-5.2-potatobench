import { describe, expect, it } from 'vitest'
import { goals, nextGoal, seasonStep, type Goal } from '../src/game/goals.ts'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const record = loadWorld()
const seed = 99
const w = S.climateWorld(record, seed)

function farm(): S.Campaign {
  return S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
}

function goal(c: S.Campaign, id: string): Goal {
  const g = goals(c).find(x => x.id === id)
  if (!g) throw new Error(`no goal ${id}`)
  return g
}

// A year already behind the farm, as the ledger records it: only the figures the ladder reads.
function pastYear(c: S.Campaign, o: Partial<S.YearSummary> = {}): void {
  c.history.push({ year: c.year, wages: 0, contracts: 0, rent: 0, land: 0, cwtSold: 1000, ...o } as S.YearSummary)
}

// Runs the season the way the coach would, stopping when the test says.
function play(c: S.Campaign, stop: (c: S.Campaign) => boolean): void {
  for (let n = 0; n < 300 && c.phase === 'season' && !S.seasonDone(c) && !stop(c); n++) {
    for (const a of S.advise(w, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
    S.apply(w, c, { t: 'day' })
  }
}

describe('the ladder of goals', () => {
  it('starts at planting, with every goal named in a few words and a reason, and nothing reached', () => {
    const c = farm()
    expect(nextGoal(c)?.id).toBe('plant')
    for (const g of goals(c)) {
      expect(g.title.split(' ').length).toBeLessThanOrEqual(5)
      expect(g.why.length).toBeGreaterThan(10)
      expect(g.when.length).toBeGreaterThan(0)
    }
    expect(goals(c).filter(g => g.done)).toEqual([])
    expect(new Set(goals(c).map(g => g.id)).size).toBe(goals(c).length)
  })

  it('is worked out from the farm and never written into it', () => {
    const c = farm()
    S.apply(w, c, { t: 'begin' })
    const before = JSON.stringify(c)
    goals(c)
    nextGoal(c)
    expect(JSON.stringify(c)).toBe(before)
  })

  it('follows the first season step by step: plant, walk, hill, spray, a test hill, kill, dig, haul, sell', () => {
    const c = farm()
    S.apply(w, c, { t: 'begin' })
    const plant = goal(c, 'plant')
    expect(plant.progress).toEqual({ n: 0, of: plant.progress!.of })
    expect(plant.progress!.of).toBeGreaterThan(0)
    play(c, x => x.season!.fields.some(f => f.plantDay >= 0))
    expect(goal(c, 'plant').done).toBe(false)
    expect(goal(c, 'plant').progress!.n).toBeGreaterThan(0)
    play(c, x => x.season!.fields.filter((f, i) => S.isField(x, i) && f.status !== 'rest' && f.status !== 'off').every(f => f.plantDay >= 0))
    expect(goal(c, 'plant').done).toBe(true)
    expect(nextGoal(c)?.id).toBe('walk')
    play(c, x => x.season!.fields.some(f => f.lastScout >= 0))
    expect(goal(c, 'walk').done).toBe(true)
    play(c, x => x.season!.fields.some(f => f.hillPasses > 0))
    expect(goal(c, 'hill').done).toBe(true)
    play(c, x => x.season!.fields.some(f => f.weighed))
    for (const id of ['plant', 'walk', 'hill', 'spray', 'sample', 'kill', 'dig', 'haul']) expect(goal(c, id).done, id).toBe(true)
    expect(nextGoal(c)?.id).toBe('sell')
    const lot = c.lots.find(l => l.open && c.season!.fields[l.field].weighed)!
    expect(S.apply(w, c, { t: 'sell', lot: lot.id, frac: 1 }).ok).toBe(true)
    expect(goal(c, 'sell').done).toBe(true)
    expect(nextGoal(c)?.id).toBe('year')
  })

  it('counts a step behind the farm once a later one is done', () => {
    const c = farm()
    S.apply(w, c, { t: 'begin' })
    c.season!.fields[0].status = 'digging'
    for (const id of ['plant', 'walk', 'hill', 'spray', 'sample', 'kill', 'dig']) expect(goal(c, id).done, id).toBe(true)
    expect(goal(c, 'haul').done).toBe(false)
  })

  it('keeps the year once it is closed, and not when the farm is lost', () => {
    const c = farm()
    pastYear(c)
    expect(goal(c, 'year').done).toBe(true)
    c.outcome = 'lost'
    expect(goal(c, 'year').done).toBe(false)
  })

  it('opens the farmstead after the first year: a machine, a hand, a contract, more land', () => {
    const c = farm()
    pastYear(c)
    expect(nextGoal(c)?.id).toBe('tool')
    c.upgrades.boom = true
    expect(goal(c, 'tool').done).toBe(true)
    expect(nextGoal(c)?.id).toBe('hire')
    expect(S.apply(w, c, { t: 'hire', kind: 'hand' }).ok).toBe(true)
    expect(goal(c, 'hire').done).toBe(true)
    expect(nextGoal(c)?.id).toBe('contract')
    expect(S.apply(w, c, { t: 'accept', offer: c.offers[0].id }).ok).toBe(true)
    expect(goal(c, 'contract').done).toBe(true)
    expect(nextGoal(c)?.id).toBe('land')
    expect(S.apply(w, c, { t: 'rent', field: 6 }).ok).toBe(true)
    expect(goal(c, 'land').done).toBe(true)
    // A tract the farm already owns is not more land.
    const d = farm()
    pastYear(d)
    expect(d.fields[14].tenure).toBe('owned')
    expect(goal(d, 'land').done).toBe(false)
  })

  it('in the season, a step that waits for spring gives way to one that can be taken now', () => {
    const c = farm()
    pastYear(c)
    S.apply(w, c, { t: 'begin' })
    expect(goal(c, 'tool').done).toBe(false)
    expect(goal(c, 'tool').now).toBe(false)
    expect(nextGoal(c)?.id).toBe('hire')
    // At the year end nothing on the farm can be done: the line says what spring brings.
    const d = farm()
    pastYear(d)
    d.phase = 'ledger'
    expect(nextGoal(d)?.id).toBe('tool')
  })

  it('follows a tract through its clearing: felled, stumped, picked, cropped', () => {
    const c = farm()
    pastYear(c)
    S.apply(w, c, { t: 'begin' })
    const t = 14
    expect(goal(c, 'fell').progress).toBeNull()
    c.fields[t].felled = 10
    expect(goal(c, 'fell').progress).toEqual({ n: 25, of: 100 })
    c.fields[t].cover = 'stumps'
    expect(goal(c, 'fell').done).toBe(true)
    expect(goal(c, 'stump').done).toBe(false)
    c.fields[t].cover = 'open'
    c.fields[t].stones = 0.75
    c.fields[t].raw = true
    expect(goal(c, 'stump').done).toBe(true)
    expect(goal(c, 'rocks').done).toBe(false)
    c.fields[t].stones = 0.35
    expect(goal(c, 'rocks').done).toBe(true)
    expect(goal(c, 'newfield').done).toBe(false)
    c.fields[t].raw = false
    expect(goal(c, 'newfield').done).toBe(true)
  })

  it('a building raised, a foreman named, five years kept', () => {
    const c = farm()
    pastYear(c)
    c.cash = 50000
    expect(S.apply(w, c, { t: 'build', kind: 'stand', yard: S.HOME_YARD }).ok).toBe(true)
    expect(goal(c, 'build').done).toBe(false)
    expect(goal(c, 'build').progress).toEqual({ n: 0, of: S.BUILDINGS.stand.days })
    c.buildings[0].built = true
    expect(goal(c, 'build').done).toBe(true)
    // A foreman is a step only where one pays (round seven: it was pushed on farms with one hand): two hired hands,
    // and fields away from home for a foreman to run. Until then it is not on the ladder at all.
    const onLadder = () => goals(c).some(g => g.id === 'foreman')
    expect(onLadder()).toBe(false)
    expect(S.apply(w, c, { t: 'hire', kind: 'hand' }).ok).toBe(true)
    expect(onLadder()).toBe(false)
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: S.HOME_YARD, done: 1, need: 1, built: true })
    expect(S.apply(w, c, { t: 'hire', kind: 'hand' }).ok).toBe(true)
    expect(onLadder()).toBe(false)
    c.fields[6].tenure = 'rented'
    expect(goal(c, 'foreman').now).toBe(true)
    expect(goal(c, 'foreman').why).toMatch(/fields away from home/)
    expect(goal(c, 'foreman').why).toMatch(/40% more and stop doing field work/)
    expect(`${goal(c, 'foreman').title} ${goal(c, 'foreman').why} ${goal(c, 'foreman').when}`).not.toMatch(/block/i)
    expect(S.apply(w, c, { t: 'foreman', unit: c.crew[1].id, block: 'home' }).ok).toBe(true)
    expect(goal(c, 'foreman').done).toBe(true)
    expect(goal(c, 'five').progress).toEqual({ n: 1, of: 5 })
    c.outcome = 'kept'
    expect(goal(c, 'five').done).toBe(true)
  })

  it('a step the farm cannot pay for says what it costs and is passed over for the next one', () => {
    const c = farm()
    pastYear(c)
    S.apply(w, c, { t: 'begin' })
    // The farmstead's first steps behind the farm, a woodlot felled to its stumps, and the cash run low.
    c.upgrades.boom = true
    c.crew.push({ ...c.crew[0], id: 77, kind: 'hand', name: 'A hand' })
    c.history[0].contracts = 1
    c.history[0].rent = 1
    c.fields[14].cover = 'stumps'
    c.cash = 1000
    const stump = goal(c, 'stump')
    expect(stump.cost).toBe(S.STUMP_FEE)
    expect(stump.short).toBe(S.STUMP_FEE - 1000)
    expect(nextGoal(c)?.id).not.toBe('stump')
    c.cash = S.STUMP_FEE + 1
    expect(goal(c, 'stump').short).toBe(0)
    expect(nextGoal(c)?.id).toBe('stump')
  })

  it('felling waits until the crop is planted; equipment says what the cheapest piece costs', () => {
    const c = farm()
    pastYear(c)
    S.apply(w, c, { t: 'begin' })
    expect(goal(c, 'fell').now).toBe(false)
    for (const f of c.season!.fields) f.plantDay = c.season!.day
    expect(goal(c, 'fell').now).toBe(true)
    const d = farm()
    expect(goal(d, 'tool').cost).toBe(Math.min(...(['boom', 'harvester', 'vent', 'reel', 'house2', 'truck'] as S.UpgradeId[]).map(id => S.UPGRADES[id].cost)))
    d.cash = 100
    expect(goal(d, 'tool').short).toBe(goal(d, 'tool').cost - 100)
  })

  it('a machine is not a goal while buying one would leave less than the note in hand', () => {
    const c = farm()
    pastYear(c)
    c.cash = 6515
    expect(goal(c, 'tool').block).toMatch(/would leave \$515/)
    expect(nextGoal(c)?.id).not.toBe('tool')
    c.cash = 24000
    expect(goal(c, 'tool').block).toBe('')
    expect(nextGoal(c)?.id).toBe('tool')
  })

  it('the year end shows the goal the coming spring opens on', () => {
    const c = farm()
    pastYear(c)
    S.apply(w, c, { t: 'hire', kind: 'hand' })
    c.phase = 'ledger'
    const spring = nextGoal({ ...c, phase: 'plan' })
    expect(nextGoal(c)?.id).toBe(spring?.id)
  })

  it('in a later season the crop\'s own next step is there for the slip, ahead of the farmstead', () => {
    const c = farm()
    pastYear(c)
    S.apply(w, c, { t: 'begin' })
    expect(seasonStep(c)?.id).toBe('plant')
    play(c, x => x.season!.fields.filter((f, i) => S.isField(x, i) && f.status !== 'rest' && f.status !== 'off').every(f => f.plantDay >= 0))
    expect(seasonStep(c)?.id).not.toBe('plant')
  })

  it('the long goals count toward their ends: every tract, the whole map, a crew of ten, every building', () => {
    const c = farm()
    expect(goals(c).filter(g => g.long).map(g => g.id)).toEqual(['cleared', 'map', 'crew', 'every'])
    expect(goal(c, 'cleared').progress).toEqual({ n: 0, of: 4 })
    for (const t of S.TRACTS) c.fields[t].cover = 'open'
    expect(goal(c, 'cleared').done).toBe(true)
    expect(goal(c, 'map').progress).toEqual({ n: 8, of: S.FIELD_COUNT })
    for (const f of c.fields) f.tenure = 'owned'
    expect(goal(c, 'map').done).toBe(true)
    for (let k = 1; k < 10; k++) c.crew.push({ ...c.crew[0], id: k, kind: 'hand', name: `Hand ${k}` })
    expect(goal(c, 'crew').done).toBe(true)
    for (const kind of S.BUILDING_KINDS) c.buildings.push({ id: c.nextBuilding++, kind, yard: S.HOME_YARD, done: 1, need: 1, built: true })
    expect(goal(c, 'every').done).toBe(true)
    // A long goal never takes the line from a step that can be taken.
    expect(nextGoal(c)?.long).toBe(false)
  })
})
