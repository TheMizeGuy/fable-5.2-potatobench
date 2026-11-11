import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { parseSave, serialize } from '../src/game/save.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { REPLAY, runReplay } from './replay.ts'

const world = loadWorld()
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8')) as { startYear: number; seed: number; hash: string; commands: number; years: number }

describe('determinism', () => {
  const full = runReplay(S, world, REPLAY)

  it('plays all five seasons of the scripted campaign', () => {
    expect(full.done).toBe(true)
    expect(full.campaign.history.length).toBe(5)
  })

  it('gives the same hash for the same seed and the same commands', () => {
    expect(runReplay(S, world, REPLAY).hash).toBe(full.hash)
    const c = S.createCampaign(world, { seed: REPLAY.seed, startYear: REPLAY.startYear })
    for (const cmd of full.cmds) S.apply(world, c, cmd)
    expect(S.hashCampaign(c)).toBe(full.hash)
  })

  it('gives a different hash for a different seed', () => {
    expect(runReplay(S, world, { ...REPLAY, seed: REPLAY.seed + 1 }).hash).not.toBe(full.hash)
  })

  it('matches the defaults built into runReplay', () => {
    expect(runReplay(S, world).hash).toBe(full.hash)
  })

  it('continues to the same hash after a save round trip in mid-season', () => {
    const july = (c: S.Campaign) => c.yearIdx === 1 && c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 6, 15)
    const first = runReplay(S, world, { ...REPLAY, stopAt: july })
    expect(first.done).toBe(false)
    const file = parseSave(serialize(first.campaign, 0))
    expect(file).not.toBeNull()
    expect(S.hashCampaign(file!.campaign)).toBe(first.hash)
    const rest = runReplay(S, world, { campaign: file!.campaign })
    expect(rest.hash).toBe(full.hash)
  })

  it('continues to the same hash after a save round trip in the cellar', () => {
    const cellar = (c: S.Campaign) => c.yearIdx === 2 && c.phase === 'cellar' && c.month === 3
    const first = runReplay(S, world, { ...REPLAY, stopAt: cellar })
    const file = parseSave(serialize(first.campaign, 0))!
    expect(runReplay(S, world, { campaign: file.campaign }).hash).toBe(full.hash)
  })

  it('matches the golden hash in tests/golden.json (regenerate with node tests/golden.ts --write)', () => {
    expect({ startYear: golden.startYear, seed: golden.seed }).toEqual(REPLAY)
    expect(full.cmds.length).toBe(golden.commands)
    expect(full.hash).toBe(golden.hash)
  })
})
