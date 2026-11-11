import type { NeighborYear, WeatherData, World, YearRecord } from './types.ts'

export interface WorldExtras {
  priceLevel?: Record<string, number>
  records?: Record<string, YearRecord>
  neighbor?: Record<string, NeighborYear>
  notes?: Record<string, string>
}

export function makeWorld(weather: WeatherData, extras: WorldExtras = {}): World {
  return {
    weather,
    priceLevel: extras.priceLevel ?? {},
    records: extras.records ?? {},
    neighbor: extras.neighbor ?? {},
    notes: extras.notes ?? {},
  }
}
