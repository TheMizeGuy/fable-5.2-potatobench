// What killing a field's vines today would cost against waiting for the day the kill is due (S.killOutlook): the
// tubers stop growing the day the vines die, so the cost is the bulking the field would do in the days between. Worked
// from the field's own living leaf and how far its tubers are along, at the light of the past two weeks (the weather
// ahead is not known), tapering as the leaf would die back. Nothing once the kill is due or the coach has asked for it.
import { killOutlook } from './outlook.ts'
import * as P from './params.ts'
import type { Campaign, World } from './types.ts'
import { variety } from './varieties.ts'
import { clamp, getDay } from './weather.ts'

export interface KillCost {
  cwtPerAcre: number        // what killing today gives up, in hundredweight an acre; 0 when it gives up nothing
  days: number              // how many days before the kill is due today is
  dueDay: number            // the day the kill is due
}

// The share of full-canopy bulking a field keeps on average over the last weeks before its kill is due: the leaf is
// already dying back, the days are shorter and cooler (calibrated in tests/killcost.test.ts against forward runs).
const LATE_SEASON = 0.48

export function killCostToday(world: World, c: Campaign, field: number): KillCost | null {
  const s = c.season
  const f = s?.fields[field]
  if (!s || !f || f.status !== 'growing' || f.deadDay >= 0 || f.tiDay < 0) return null
  const due = killOutlook(c, field)
  if (!due) return null
  const days = Math.max(0, due.day - s.day)
  if (days === 0 || due.asked) return { cwtPerAcre: 0, days: 0, dueDay: due.day }
  const v = variety(f.variety)
  // Today's bulking power over the field's hills: living leaf, free of blight, on tubers that are partitioning.
  let power = 0
  for (let i = 0; i < P.HILLS; i++) {
    if (!(f.hN[i] > 0) || !(f.hC[i] > 0.02)) continue
    const part = clamp((f.pdAir - f.hPd0[i] - v.tiPd) / P.PARTITION_PD, 0, 1)
    power += f.hC[i] * (1 - f.hLes[i]) * part * f.hVigor[i]
  }
  let rs = 0, n = 0
  for (let d = Math.max(0, s.day - 14); d < s.day; d++) { rs += getDay(world, s.year, d).rs; n++ }
  rs = n ? rs / n : 0
  const grams = P.BULK_G_PER_MJ * rs * v.bulk * power * days * LATE_SEASON
  const cwtPerAcre = grams * P.CWT_PER_HILL_GRAM / P.FIELD_ACRES
  return { cwtPerAcre: Math.round(cwtPerAcre), days, dueDay: due.day }
}
