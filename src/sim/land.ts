// The land beyond the crop: tracts and their clearing, shelter, stones, hedgerows, tile drains, and what each does to
// a field's water, wet hours and frost.
import { PARCELS, TRACTS } from './farm.ts'
import * as P from './params.ts'
import { resultLevel } from './people.ts'
import { withCommas } from './calendar.ts'
import type { Campaign, Cover, Day, Unit } from './types.ts'

export const COVER_WORD: Record<Cover, string> = { open: 'open ground', woods: 'standing woods', brush: 'brush', stumps: 'stumps' }

export function isOpen(c: Campaign, i: number): boolean {
  return c.fields[i].cover === 'open'
}

// A field the farm can crop: held and open.
export function isField(c: Campaign, i: number): boolean {
  const f = c.fields[i]
  return !!f && f.tenure !== 'none' && f.cover === 'open'
}

export function standing(cover: Cover): cover is 'woods' | 'brush' {
  return cover === 'woods' || cover === 'brush'
}

// The tract whose standing woods or brush shelter this field, or -1. Only held fields are sheltered, by any tract
// within SHELTER_RANGE ground units in a straight line, whoever holds it; the nearest counts.
export function shelterOf(c: Campaign, i: number): number {
  if (!isField(c, i)) return -1
  const p = PARCELS[i]
  let best = -1, bestD = P.SHELTER_RANGE * P.SHELTER_RANGE
  for (const t of TRACTS) {
    if (t === i || !standing(c.fields[t].cover)) continue
    const dx = PARCELS[t].x - p.x, dz = PARCELS[t].z - p.z
    const d2 = dx * dx + dz * dz
    if (d2 <= bestD) { best = t; bestD = d2 }
  }
  return best
}

// The held fields a tract's standing cover shelters now.
export function sheltered(c: Campaign, tract: number): number[] {
  const out: number[] = []
  for (let i = 0; i < c.fields.length; i++) if (shelterOf(c, i) === tract) out.push(i)
  return out
}

// Hedgerows cut back this year or in the BRUSH_YEARS - 1 before it.
export function brushedNow(c: Campaign, i: number): boolean {
  const b = c.fields[i].brushed
  return b >= 0 && c.year - b < P.BRUSH_YEARS
}

export interface FieldEnv {
  taw: number               // mm of plant-available water the root zone holds
  drain: number             // share of surface wetness left the next day
  humid: number             // extra wet hours a day for blight
  frost: number             // C the field runs from the station on a still, clear night (negative is colder)
  colder: number            // C colder still on a frost night, from shelter
  et: number                // share of the usual water lost to the air
  wind: number              // m/s: the most wind a spray can go on in
  shelter: number           // the sheltering tract, or -1
  brushed: boolean
}

// How a field's place, shelter, hedgerows and drains set its water, wet hours and frost.
export function fieldEnv(c: Campaign, i: number): FieldEnv {
  const fp = c.fields[i]
  const e = fp.elev
  const sh = shelterOf(c, i)
  const br = brushedNow(c, i)
  let humid = P.HUMID_BONUS[e]
  if (br && humid > 0) humid = 0
  if (sh >= 0) humid += P.SHELTER_WET_HOURS
  return {
    taw: P.TAW_MM[e] * (fp.tiled ? P.TILE_TAW : 1),
    drain: fp.tiled ? P.DRAIN[1] : P.DRAIN[e],
    humid,
    frost: P.FROST_OFFSET[e] * (br ? 0.5 : 1),
    colder: sh >= 0 ? P.SHELTER_FROST : 0,
    et: (sh >= 0 ? P.SHELTER_WATER : 1) * (br ? P.BRUSH_WATER : 1),
    wind: P.SPRAY_WIND * (sh >= 0 ? P.SHELTER_WIND : 1),
    shelter: sh,
    brushed: br,
  }
}

// The night's low at the field: colder than the station on a still, clear night by the field's offset.
export function envTmin(d: Day, env: FieldEnv): number {
  const still = d.wind < 3 ? 1 : d.wind < 5 ? 0.6 : 0.25
  const clear = d.cloud < 0 ? 0.7 : 1 - 0.6 * d.cloud
  return d.tmin + env.frost * still * clear - env.colder
}

// Planting and digging speed on stony ground, relative to the home farm's usual stones.
export function stoneSpeed(stones: number): number {
  return (1 - P.STONE_SLOW * stones) / (1 - P.STONE_SLOW * P.STONE_BASE)
}

// Share of tubers bruised by stones when this person digs a field this stony.
export function stoneBruise(stones: number, u: Unit | null): number {
  if (stones <= P.STONE_BRUISE_FROM) return 0
  let k = 1
  if (u) {
    k = Math.max(0, P.BRUISE_SKILL_BASE - P.BRUISE_SKILL_PER * resultLevel(u, 'machine'))
    if (u.trait === 'careless') k *= P.CARELESS_BRUISE
  }
  return Math.min(0.5, P.STONE_BRUISE * (stones - P.STONE_BRUISE_FROM) * k)
}

// Share of a tract's timber a person's felling brings out as logs.
export function fellYield(u: Unit): number {
  return P.FELL_YIELD_BASE + P.FELL_YIELD_PER * u.skills.woods
}

// Crew-days of felling a tract still needs (0 once it is down).
export function fellLeft(c: Campaign, i: number): number {
  const cover = c.fields[i].cover
  return standing(cover) ? Math.max(0, P.FELL_DAYS[cover] - c.fields[i].felled) : 0
}

// Fells days of standard work on a tract for this person: logs to the yard in proportion to the work. True when the
// tract is down.
export function fell(c: Campaign, i: number, days: number, u: Unit): boolean {
  const fp = c.fields[i]
  if (!standing(fp.cover)) return false
  const cover = fp.cover
  const use = Math.min(days, fellLeft(c, i))
  fp.felled += use
  c.logs += use / P.FELL_DAYS[cover] * P.TIMBER[cover] * fellYield(u)
  if (fp.felled >= P.FELL_DAYS[cover] - 1e-6) {
    fp.cover = 'stumps'
    fp.felled = P.FELL_DAYS[cover]
    return true
  }
  return false
}

// The stumps are out: the tract is a field, owned, rested, almost free of early dying, and stony.
export function stumped(c: Campaign, i: number): void {
  const fp = c.fields[i]
  fp.cover = 'open'
  fp.stones = PARCELS[i].stones
  fp.raw = true
  fp.soil = 1
  fp.streak = 0
  fp.vert = P.NEW_GROUND_VERT
}

export type ClearStage = 'fell' | 'stump' | 'rocks' | 'done'

// Where a tract stands in its clearing, and the next step in plain words.
export function clearing(c: Campaign, i: number): { stage: ClearStage; next: string } {
  const fp = c.fields[i]
  const name = PARCELS[i].name
  if (standing(fp.cover)) {
    return { stage: 'fell', next: `Fell the ${fp.cover === 'woods' ? 'woods' : 'brush'} on ${name}: about ${Math.ceil(fellLeft(c, i))} crew-days of woods work, best done in winter.` }
  }
  if (fp.cover === 'stumps') {
    return { stage: 'stump', next: fp.works?.kind === 'stump' ? `The bulldozer is pulling stumps: ${fp.works.left} more season days.` : `Have the stumps pulled: a contractor, $${withCommas(P.STUMP_FEE)}, about ${P.STUMP_DAYS} season days.` }
  }
  if (fp.stones >= P.ROCKS_ADVISE) return { stage: 'rocks', next: `Pick the rocks off ${name} when no crop is up: it is new ground and stony.` }
  return { stage: 'done', next: '' }
}
