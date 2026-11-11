// Loads the game world from src/data for Node tools and tests.
import { readFileSync } from 'node:fs'
import * as S from '../../src/sim/index.ts'

const root = new URL('../../', import.meta.url)

export function repoPath(p: string): URL {
  return new URL(p, root)
}

export function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(repoPath(p), 'utf8')) as T
}

export function loadWorld(): S.World {
  return S.makeWorld(readJson<S.WeatherData>('src/data/weather/caribou.json'), {
    priceLevel: readJson<Record<string, number>>('src/data/prices.json'),
    records: readJson<Record<string, S.YearRecord>>('src/data/records.json'),
    neighbor: readJson<Record<string, S.NeighborYear>>('src/data/neighbor.json'),
    notes: readJson<Record<string, string>>('src/data/notes.json'),
  })
}
