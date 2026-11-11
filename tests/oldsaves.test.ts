// Saves written by the build that was live before the bigger farm (version 2: six fields, one farmer, a real start
// year). A player's browser may still hold one, so each must load and play on.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { parseSave } from '../src/game/save.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

function playOn(c: S.Campaign, years: number): number {
  const until = c.year + years
  let refused = 0
  const go = (cmd: S.Cmd) => { if (!S.apply(world, c, cmd).ok) refused++ }
  for (let k = 0; k < 4000 && c.phase !== 'over' && c.year < until; k++) {
    if (c.phase === 'plan') go({ t: 'begin' })
    else if (c.phase === 'season') {
      if (S.seasonDone(c) || c.season!.frozen) go({ t: 'endSeason' })
      else {
        for (const a of S.advise(world, c)) {
          if (a.field >= 0 && a.act !== 'wait' && a.act !== 'sell' && a.act !== 'close') go({ t: 'job', kind: a.act, field: a.field })
        }
        go({ t: 'day' })
      }
    } else if (c.phase === 'cellar') {
      for (const l of S.openLots(c)) go({ t: 'sell', lot: l.id, frac: 1 })
      go({ t: 'month' })
    } else if (c.phase === 'ledger') go({ t: 'next' })
  }
  return refused
}

describe('saves from the build before the bigger farm', () => {
  for (const [name, phase] of [['season', 'season'], ['cellar', 'cellar'], ['spring', 'plan']] as const) {
    it(`a version 2 save made in the ${name} loads where it was left and plays on for two years`, () => {
      const text = readFileSync(new URL(`./fixtures/save-v2-${name}.json`, import.meta.url), 'utf8')
      expect(JSON.parse(text).v).toBe(2)
      const file = parseSave(text)
      expect(file).not.toBeNull()
      const c = file!.campaign
      expect(c.v).toBe(S.SAVE_VERSION)
      expect(c.phase).toBe(phase)
      expect(c.fields.length).toBe(S.FIELD_COUNT)
      expect(S.isFarmYear(c.startYear)).toBe(false)
      const year = c.year
      expect(playOn(c, 2)).toBe(0)
      expect(c.phase === 'over' || c.year === year + 2).toBe(true)
      expect(Number.isFinite(c.cash) && Number.isFinite(S.netWorth(c))).toBe(true)
      expect(() => S.hashCampaign(c)).not.toThrow()
    })
  }
})
