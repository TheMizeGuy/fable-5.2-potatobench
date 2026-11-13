// Work that loses crop when it waits, against work that can wait: twelve seeded two-year farms of their own, the
// reference practice, a field hand hired in year two and a woodlot ordered felled. For checking the crews' choice.
// Usage: node tools/balance/urgency.ts
import * as S from '../../src/sim/index.ts'
import { play, reference, type BotFactory } from './bots.ts'
import { loadWorld } from './world.ts'

const record = loadWorld()
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1)

let felled = false
function practice(): BotFactory {
  const base = reference()
  return () => {
    const bot = base()
    return {
      ...bot,
      plan(world, c) {
        if (c.history.length === 1) S.apply(world, c, { t: 'hire', kind: 'hand' })
        bot.plan(world, c)
      },
      day(world, c, events) {
        bot.day(world, c, events)
        const tract = S.timberTracts(c)[0]
        if (c.history.length === 1 && !felled && tract !== undefined && S.apply(world, c, { t: 'job', kind: 'fell', field: tract }).ok) felled = true
      },
    }
  }
}

interface Row { sprayLate: number; killLate: number; frozen: number; idle: number; cash: number }

function measure(seed: number): Row {
  const world = S.climateWorld(record, seed)
  felled = false
  const born = new Map<number, { kind: S.JobKind; day: number }>()
  let sprayLate = 0, killLate = 0, frozen = 0, idle = 0
  let before: S.Campaign | null = null
  const out = play(world, 'urgency', practice(), S.FARM_YEAR0 + 1, seed, 2, (c, events) => {
    const s = c.season
    if (!s) return
    for (const e of events) if (e.type === 'frozenInField') frozen += Number(e.data?.cwt ?? 0)
    // orders' waiting: days a spray or a kill stood on the list after the day it was ordered
    for (const j of s.jobs) if ((j.kind === 'spray' || j.kind === 'kill') && !born.has(j.id)) born.set(j.id, { kind: j.kind, day: s.day })
    for (const [id, b] of born) {
      if (s.jobs.some(j => j.id === id)) { if (s.day > b.day + 1) { if (b.kind === 'spray') sprayLate++; else killLate++ } } else born.delete(id)
    }
    // people idle on a working day with work on the list they would do and the day allowed
    if (before?.season && S.workday(before, before.season)) {
      const waits = S.jobWaits(world, before)
      for (const u of before.crew) {
        if (u.foreman || S.hurt(u, before.season.day) || S.resting(u) || s.worked.some(w => w.unit === u.id)) continue
        if (before.season.jobs.some(j => !waits[j.id] && (j.unit < 0 || j.unit === u.id) && S.willDo(u, j.kind) && S.jobSkill(j.kind) !== 'machine')) idle++
      }
    }
    before = structuredClone(c)
  })
  return { sprayLate, killLate, frozen, idle, cash: out.cashBy[out.cashBy.length - 1] ?? out.cash }
}

const rows = SEEDS.map(measure)
const sum = (k: keyof Row) => rows.reduce((a, r) => a + r[k], 0)
console.log(`spray days late ${sum('sprayLate')}, kill days late ${sum('killLate')}, frozen ${Math.round(sum('frozen'))} cwt, idle person-days with field work waiting ${sum('idle')}, year-two cash $${Math.round(sum('cash') / rows.length)}`)
console.log('  by seed: ' + rows.map((r, i) => `${SEEDS[i]}:${r.sprayLate}/${r.killLate}/${Math.round(r.frozen)}/${r.idle}/$${Math.round(r.cash / 100) * 100}`).join(' '))
