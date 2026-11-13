// Two parts of the game never tell it two ways: over seeded two-year farms played as the game asks (the word to plant,
// every stamp that is the player's pressed, a hand hired the second spring), what is said of a person, on the goal
// slip, under the year-end figure and on a weigh ticket is held against what the farm holds that day.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { waitingFor } from '../src/game/goals.ts'
import { verdictSays } from '../src/ui/money-words.ts'
import { personNow } from '../src/ui/now.ts'
import { ticketPlace } from '../src/ui/ticket-words.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

// One season, a day at a time: before each day the player's own orders are given, after it `each` reads the farm.
function season(c: S.Campaign, each: (events: S.GameEvent[]) => void): void {
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  for (let g = 0; g < 420 && c.phase === 'season' && !S.seasonDone(c); g++) {
    for (const x of [...c.incidents]) S.apply(world, c, { t: 'answer', incident: x.id, choice: x.choices[x.choices.length - 1] })
    const auto = new Set(S.routineInfo(c).filter(r => r.auto).map(r => r.kind))
    for (const a of S.advise(world, c)) {
      if (a.act === 'wait' || a.act === 'close' || a.act === 'sell') continue
      if (a.act === 'plant' ? S.plantWordGiven(c.season!) : auto.has(a.act)) continue
      S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
    }
    const r = S.apply(world, c, { t: 'day' })
    expect(r.ok).toBe(true)
    each(r.ok ? r.events : [])
  }
  for (const l of S.openLots(c)) S.apply(world, c, { t: 'sell', lot: l.id, frac: 1 })
  S.apply(world, c, { t: 'endSeason' })
  for (let k = 0; k < 14 && c.phase === 'cellar'; k++) S.apply(world, c, { t: 'month' })
}

function twoYears(seed: number, each: (c: S.Campaign, events: S.GameEvent[]) => void): S.Campaign {
  const c = S.createCampaign(world, { seed, startYear: 1990 })
  season(c, e => each(c, e))
  if (c.phase === 'ledger') S.apply(world, c, { t: 'next' })
  S.apply(world, c, { t: 'hire', kind: 'hand' })
  if (c.phase === 'plan') season(c, e => each(c, e))
  return c
}

describe('what the game says agrees with what the farm holds', () => {
  it('nobody who worked the day through is called idle', () => {
    let worked = 0
    for (const seed of [7, 3]) {
      twoYears(seed, c => {
        const s = c.season!
        if (c.phase !== 'season') return
        const waits = S.jobWaits(world, c)
        for (const u of c.crew) {
          const did = s.worked.some(w => w.unit === u.id)
          const n = personNow(c, u.id, waits)
          if (did) worked++
          if (n.word === 'Idle') expect(did, `${u.name}, seed ${seed}, day ${s.day}: "${n.line}" after ${s.worked.filter(w => w.unit === u.id).map(w => w.kind).join(', ')}`).toBe(false)
        }
      })
    }
    expect(worked).toBeGreaterThan(100)
  })

  it('the slip\'s waiting line holds: no "until blight weather" once a spray is on, no "next decision" for a kill already ordered', () => {
    const said = new Set<string>()
    for (const seed of [7, 3, 11]) {
      twoYears(seed, c => {
        const s = c.season!
        if (c.phase !== 'season' || S.seasonDone(c)) return
        const w = waitingFor(c)
        if (!w) return
        said.add(w.title.replace(/\d+/g, 'N'))
        const at = `seed ${seed}, day ${s.day}: "${w.title} / ${w.when}"`
        if (/until blight weather/.test(w.title)) expect(s.fields.some(f => f.lastSpray >= 0), at).toBe(false)
        if (/^Your next decision is killing the vines/.test(w.title)) {
          expect(s.jobs.some(j => j.kind === 'kill'), at).toBe(false)
          expect(w.when, at).not.toMatch(/due since/)
        }
        if (/^Killing the vines/.test(w.title)) expect(s.jobs.some(j => j.kind === 'kill'), at).toBe(true)
        if (/^Planting:/.test(w.title)) expect(S.plantWordGiven(s), at).toBe(true)
      })
    }
    expect([...said].some(t => /next spray/.test(t))).toBe(true)
  })

  it('the year-end figure\'s reason names a vine kill, a test dig or tubers setting only on the day it happened', () => {
    let named = 0
    for (const seed of [7, 3, 11, 5]) {
      let watch: S.MoneyWatch | null = null
      const facts = new Map<number, { killed: boolean; samples: number; set: boolean }>()
      twoYears(seed, c => {
        const s = c.season!
        if (c.phase !== 'season') { watch = null; return }
        const r = S.moneyWatch(watch, S.moneyLook(world, c))
        watch = r.watch
        const was = new Map(facts)
        s.fields.forEach((f, i) => facts.set(i, { killed: f.killDay >= 0, samples: f.samples.length, set: f.tiDay >= 0 }))
        const text = r.cause?.text ?? ''
        const i = S.FIELD_NAMES.findIndex(n => text.includes(n))
        if (i < 0) return
        const now = facts.get(i)!, before = was.get(i)
        const at = `seed ${seed}, day ${s.day}: "${text}"`
        if (/^Vines killed in /.test(text)) { named++; expect(now.killed && !before?.killed, at).toBe(true) }
        if (/test dig came/.test(text)) { named++; expect(now.samples > (before?.samples ?? 0), at).toBe(true) }
        if (/^Tubers set in /.test(text)) { named++; expect(now.set && !before?.set, at).toBe(true) }
      })
    }
    expect(named).toBeGreaterThan(3)
  })

  it('weigh tickets are numbered in the order they are cut, from 1 each year', () => {
    let tickets = 0
    for (const seed of [7, 3]) {
      const cut = new Map<number, number>()
      twoYears(seed, (c, events) => {
        for (const e of events) {
          if (e.type !== 'weighed') continue
          const lot = c.lots.find(l => l.id === Number(e.data?.lot))!
          const n = (cut.get(c.year) ?? 0) + 1
          cut.set(c.year, n)
          tickets++
          expect(ticketPlace(c, lot), `seed ${seed}, year ${c.year}, lot ${lot.id}`).toBe(n)
        }
      })
    }
    expect(tickets).toBeGreaterThan(8)
  })

  it('a year that ends owing says "in debt", and keeps "down" for cash against the year\'s start', () => {
    const y = { cashEnd: -4650, cashStart: 16444 } as S.YearSummary
    expect(verdictSays(y, 3, false)).toBe('You ended $4,650 in debt, inside what the bank allows, so it carries you another year. 3 seasons to go.')
    expect(verdictSays(y, 0, true)).not.toMatch(/ down/)
  })
})
