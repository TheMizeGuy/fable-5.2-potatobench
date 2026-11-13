import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { coldPlanting } from '../src/ui/rules.ts'

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
  it('says when a field was planted in cold soil and what the rotted seed cost', () => {
    let named = 0
    for (let seed = 1; seed <= 4; seed++) {
      const { c, lot } = plantedCold(seed)
      expect(lot).toBeDefined()
      const stand = S.fieldInfo(c, lot.field).stand
      const total = S.lotCwt(lot) + (['green', 'blight', 'frost', 'rot', 'small'] as S.Cause[]).reduce((a, k) => a + lot.loss[k], 0)
      const line = coldPlanting(c, lot, stand, total)
      const on = S.monthDay(lot.year, c.season!.fields[lot.field].plantDay)
      expect(on.month, `seed ${seed}: planted in April`).toBe(3)
      expect(line, `seed ${seed}`).toMatch(/^Planted in cold soil on April \d+/)
      if (stand < 0.99) {
        // The loss: what the rotted share of the seed would have grown, as the full breakdown counts it.
        const per = Math.round(total * (1 - stand) / stand / S.FIELD_ACRES)
        expect(line).toContain(`${Math.round((1 - stand) * 100)}% of the seed rotted before it came up, which cost about ${per.toLocaleString('en-US')} cwt/acre.`)
        named++
      } else expect(line).toMatch(/but the seed came up anyway\.$/)
      console.log(`seed ${seed}: ${line}`)
    }
    expect(named, 'at least one cold planting lost seed').toBeGreaterThan(0)
  })

  it('without a stand to go by, it says so without a number', () => {
    const { c, lot } = plantedCold(1)
    expect(coldPlanting(c, lot, null, 1000)).toMatch(/^Planted in cold soil on April \d+, so some of the seed may have rotted before it came up\.$/)
  })

  it('says nothing of a field the coach planted when the soil was fit and that came up whole', () => {
    const { c, warm } = plantedCold(2, true)
    expect(warm).toBeDefined()
    expect(coldPlanting(c, warm!, 1, 1000)).toBe('')
  })
})
