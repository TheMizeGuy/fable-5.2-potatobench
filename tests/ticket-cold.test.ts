import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { coldSeed } from '../src/ui/rules.ts'

const record = loadWorld()

// A season played the way the coach would, except that the player orders Plant on the first field on the season's
// first day, in cold ground; run until that field is dug (another: and one the coach planted).
function plantedCold(seed: number, another = false): { c: S.Campaign; lot: S.Lot; warm: S.Lot | undefined } {
  const w = S.climateWorld(record, seed)
  const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
  S.apply(w, c, { t: 'begin' })
  const first = c.plans.findIndex((p, i) => p.crop === 'potato' && S.held(c, i))
  expect(S.plantReady(w, c, first).ok).toBe(false)
  expect(S.apply(w, c, { t: 'job', kind: 'plant', field: first }).ok).toBe(true)
  for (let n = 0; n < 400 && c.phase === 'season' && !S.seasonDone(c); n++) {
    if (c.lots.some(l => l.field === first) && (!another || c.lots.some(l => l.field !== first))) break
    for (const a of S.advise(w, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
    S.apply(w, c, { t: 'day' })
  }
  const lot = c.lots.find(l => l.field === first)!
  return { c, lot, warm: c.lots.find(l => l.field !== first) }
}

describe('the weigh ticket names cold planting', () => {
  it('counts the seed that rotted in cold soil as a loss, with the planting day', () => {
    let named = 0
    for (let seed = 1; seed <= 4; seed++) {
      const { c, lot } = plantedCold(seed)
      expect(lot).toBeDefined()
      const stand = S.fieldInfo(c, lot.field).stand
      const total = S.lotCwt(lot) + (['green', 'blight', 'frost', 'rot', 'small'] as S.Cause[]).reduce((a, k) => a + lot.loss[k], 0)
      const on = S.monthDay(lot.year, c.season!.fields[lot.field].plantDay)
      expect(on.month, `seed ${seed}: planted in April`).toBe(3)
      const loss = coldSeed(c, lot, stand, total)
      if (stand < 0.99) {
        // What the rotted share of the seed would have grown, as the full breakdown counts it.
        expect(loss!.cwt).toBeCloseTo(total * (1 - stand) / stand, 6)
        expect(loss!.phrase).toBe(`${Math.round((1 - stand) * 100)}% after a cold planting on April ${on.dom}`)
        named++
      } else expect(loss).toBeNull()
      console.log(`seed ${seed}: ${loss ? `${Math.round(loss.cwt)} cwt, ${loss.phrase}` : 'nothing rotted'}`)
    }
    expect(named, 'at least one cold planting lost seed').toBeGreaterThan(0)
  })

  it('says nothing without a stand to go by, or for a field the coach planted that came up whole', () => {
    const { c, lot, warm } = plantedCold(2, true)
    expect(coldSeed(c, lot, null, 1000)).toBeNull()
    expect(warm).toBeDefined()
    expect(coldSeed(c, warm!, 1, 1000)).toBeNull()
  })
})
