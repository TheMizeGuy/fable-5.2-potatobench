// The bots must play fair: they see only what a player sees.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ABLATIONS, EXPERT, expert, naive, play, reference } from '../tools/balance/bots.ts'
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

describe('bots play', () => {
  const world = loadWorld()

  it('the naive grower loses the farm and the expert keeps it, in the same years', () => {
    const n = play(world, 'naive', naive(), 1987, 1)
    const r = play(world, 'reference', reference(), 1987, 1)
    const e = play(world, 'expert', expert(EXPERT), 1987, 1)
    expect(n.kept).toBe(false)
    expect(e.kept).toBe(true)
    expect(e.netWorth).toBeGreaterThan(r.netWorth)
    expect(r.netWorth).toBeGreaterThan(n.netWorth)
    expect(e.years).toBe(5)
  })

  it('an ablation really drops its verb', () => {
    const noSpray = play(world, 'no-spray', expert({ ...EXPERT, spray: false }), 2011, 2)
    const noWater = play(world, 'no-water', expert({ ...EXPERT, water: false }), 1995, 2)
    expect(noSpray.jobs.spray).toBe(0)
    expect(noWater.jobs.water).toBe(0)
    expect(play(world, 'expert', expert(EXPERT), 1995, 2).jobs.water).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    expect(play(world, 'expert', expert(EXPERT), 2003, 4)).toEqual(play(world, 'expert', expert(EXPERT), 2003, 4))
  })
})
