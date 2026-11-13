import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { firstSight } from '../src/ui/first-sight.ts'

describe('a first spring\'s field record', () => {
  it('offers the variety in the ground, the one that best resists blight and the earliest, never the contract-only one', () => {
    for (const year of [1975, 1990, 2020]) {
      const vs = S.availableVarieties(year)
      for (const v of vs) {
        const shown = firstSight(vs, [v.id])
        expect(shown.map(x => x.id), `${year}, ${v.id}`).toContain(v.id)
        expect(shown.length, `${year}, ${v.id}`).toBe(3)
        expect(shown.filter(x => x.contract && x.id !== v.id)).toEqual([])
        const others = shown.filter(x => x.id !== v.id)
        expect(others.some(x => x.maturity === 'early'), `${year}, ${v.id}: an early one`).toBe(true)
      }
    }
    expect(firstSight(S.availableVarieties(1990), ['katahdin']).map(v => v.name)).toEqual(['Dark Red Norland', 'Katahdin', 'Kennebec'])
  })
})
