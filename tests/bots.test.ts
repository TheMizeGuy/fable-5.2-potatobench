// The bots must play fair: they see only what a player sees. And each ablation must really take its mechanic away.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { ABLATIONS, EXPERT, expert, expertWith, naive, play, reference } from '../tools/balance/bots.ts'
import { loadWorld } from '../tools/balance/world.ts'

const SOURCE = readFileSync(new URL('../tools/balance/bots.ts', import.meta.url), 'utf8')

// Hidden truth on a field (hill arrays, true blight, the estimate's bias, frost in the tubers, the defect
// tallies) and on a lot (its rot, seed blight and virus). Lots' loss tallies and the varieties' published
// traits share some of these names, so property reads off `loss.` and `variety(...)` are allowed.
const HIDDEN_ALWAYS = ['hLes', 'hLat', 'hMass', 'hN', 'hTb', 'hC', 'hState', 'hVigor', 'hEmergeAt', 'hPd0', 'sev', 'sevPeak', 'estBias', 'frostT', 'blightSeed', 'seedVirus', 'pdAir', 'pdSoil', 'ksAvg', 'dr', 'logDays', 'dryRun']
const HIDDEN_UNLESS_PUBLIC = ['scab', 'hollow', 'knob', 'rot', 'virus']

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

export function leaks(src: string): string[] {
  const code = strip(src)
  const out: string[] = []
  for (const name of HIDDEN_ALWAYS) {
    for (const m of code.matchAll(new RegExp(`(?:\\.|\\[['"\`])${name}\\b`, 'g'))) out.push(`${name} at ${m.index}`)
  }
  for (const name of HIDDEN_UNLESS_PUBLIC) {
    for (const m of code.matchAll(new RegExp(`([A-Za-z0-9_$)\\]!?]+)\\s*(?:\\.|\\[['"\`])${name}\\b`, 'g'))) {
      const before = code.slice(Math.max(0, m.index - 80), m.index + m[1].length)
      if (/\bloss$/.test(m[1]) || /variety\([^()]*(\([^()]*\))?[^()]*\)$/.test(before)) continue
      out.push(`${name} at ${m.index}: ${before.slice(-30)}`)
    }
  }
  // The season's field records and the farm's soil records are only read through fieldInfo().
  for (const m of code.matchAll(/\b(season!?|s)\.fields\b|\bc\.fields\b/g)) out.push(`${m[0]} at ${m.index}`)
  // No peeking at weather, prices or records beyond today's: only today() and forecast().
  for (const m of code.matchAll(/\bgetDay\(|\bforecastFor\(|\.weather\b|\.priceLevel\b|\.records\b|\.neighbor\b/g)) out.push(`${m[0]} at ${m.index}`)
  return out
}

describe('bots see only what a player sees', () => {
  it('tools/balance/bots.ts reads no hidden state', () => {
    expect(leaks(SOURCE)).toEqual([])
  })

  it('the check catches reads of hidden state', () => {
    const bad = [
      'const m = f.hMass[3]', 'x = c.season!.fields[0].sev', 'if (lot.rot > 0.1) sell()', "y = lot['virus']",
      'const b = l.blightSeed', 'w = f.estBias', 'for (const f of s.fields) {}', 'const d = S.getDay(world, y, d + 3)',
      'const p = world.priceLevel[y]', 'if (f.frostT > 0) dig()', 'const k = f.hollow',
    ]
    for (const b of bad) expect(leaks(b), b).not.toEqual([])
    const fine = ['const c = lot.loss.rot + l.loss.scab', 'const v = S.variety(c.plans[i].variety).hollow', 'S.variety(id).virus <= 0.5', 'const t = S.today(world, c)']
    for (const g of fine) expect(leaks(g), g).toEqual([])
  })
})

describe('bots play the generated farms', () => {
  const record = loadWorld()
  const YEAR1 = S.FARM_YEAR0 + 1
  const farm = (seed: number) => S.climateWorld(record, seed)
  const w2 = farm(2)

  it('the naive grower loses the farm, and the expert keeps it ten years and ends ahead of the reference', () => {
    const n = play(w2, 'naive', naive(), YEAR1, 2, 10)
    const r = play(w2, 'reference', reference(), YEAR1, 2, 10)
    const e = play(w2, 'expert', expert(EXPERT), YEAR1, 2, 10)
    expect(n.kept5).toBe(false)
    expect(e.kept).toBe(true)
    expect(e.years).toBe(10)
    expect(e.worth.length).toBe(10)
    expect(e.netWorth).toBeGreaterThan(r.netWorth)
  })

  it('is deterministic', () => {
    expect(play(w2, 'expert', expert(EXPERT), YEAR1, 2, 6)).toEqual(play(w2, 'expert', expert(EXPERT), YEAR1, 2, 6))
  })

  it('the naive and reference growers keep to the home six with the farmer alone, and build and sign nothing', () => {
    for (const r of [play(w2, 'naive', naive(), YEAR1, 2, 4), play(w2, 'reference', reference(), YEAR1, 2, 4)]) {
      expect(r.held.every(n => n === S.HOME_FIELDS)).toBe(true)
      expect(r.hands.every(n => n === 0)).toBe(true)
      expect([r.signed, r.rent, r.land, r.wages]).toEqual([0, 0, 0, 0])
      expect(r.buildings).toEqual([])
      expect(r.tally.stumped + r.tally.felled).toBe(0)
    }
  })

  it('the expert uses the farmstead: people, buildings, cleared land, the truck, winter work', () => {
    const e = play(w2, 'expert', expert(EXPERT), YEAR1, 2, 10)
    expect(Math.max(...e.held)).toBeGreaterThan(S.HOME_FIELDS)
    expect(e.tally.hires).toBeGreaterThan(0)
    expect(e.buildings.length).toBeGreaterThanOrEqual(4)
    expect(e.tally.stumped).toBeGreaterThan(0)
    expect(e.jobs.rocks).toBeGreaterThan(0)
    expect(e.upgrades).toContain('truck')
    expect(e.tally.pickerDays).toBeGreaterThan(0)
  })

  const run = (name: string, years = 7) => {
    const a = ABLATIONS.find(x => x.name === name)!
    return play(w2, name, expert(expertWith(a.cfg, a.farm ?? {})), YEAR1, 2, years)
  }

  it('an ablation of the crop and the bigger farm takes its decision away', () => {
    expect(run('no-spray', 4).jobs.spray).toBe(0)
    expect(run('no-water', 4).jobs.water).toBe(0)
    const home = run('no-expansion')
    expect(home.rent + home.land).toBe(0)
    const alone = run('no-hire')
    expect(alone.hands.every(n => n === 0)).toBe(true)
    expect(alone.spend.wages.reduce((a, x) => a + x, 0)).toBe(alone.spend.pickers.reduce((a, x) => a + x, 0))
    expect(run('no-contracts', 4).signed).toBe(0)
  }, 20000)

  it('an ablation of the farmstead\'s machinery, buildings and land takes it away', () => {
    expect(run('no-truck').upgrades).not.toContain('truck')
    expect(run('no-tractor2').upgrades).not.toContain('tractor2')
    for (const b of ['stand', 'road', 'shed', 'bunk'] as const) expect(run(`no-${b === 'bunk' ? 'bunkhouse' : b}`).buildings).not.toContain(b)
    const uncleared = run('no-clearing')
    expect(uncleared.tally.stumped + uncleared.tally.felled).toBe(0)
    expect(run('no-rocks').jobs.rocks).toBe(0)
    expect(run('no-brush').jobs.brush).toBe(0)
    expect(run('no-tile').tally.tiled).toBe(0)
  }, 20000)

  it('an ablation of the farmstead\'s people and rules takes it away', () => {
    const e = play(w2, 'expert', expert(EXPERT), YEAR1, 2, 7)
    expect(run('no-pickers').tally.pickerDays).toBe(0)
    expect(run('all-sundays-off').tally.sundaysWorked).toBe(0)
    expect(run('work-sundays').tally.sundaysWorked).toBeGreaterThan(e.tally.sundaysWorked)
    expect(run('no-winter').spend.winterWages.reduce((a, x) => a + x, 0)).toBe(0)
    const quiet = run('default-incidents')
    expect(quiet.tally.rushParts + quiet.tally.matched + quiet.tally.midHires + quiet.tally.buyerTaken).toBe(0)
    const hall = run('no-applicants')
    expect(hall.tally.hires).toBeGreaterThan(0)
    expect(hall.tally.applicants).toBe(0)
    expect(e.tally.applicants).toBeGreaterThan(0)
  }, 20000)
})
