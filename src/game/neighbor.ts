// The neighbor: reference practice played through the same year of weather on a farm like the home farm,
// so the player's season has something honest to stand beside.
import { advise, apply, createCampaign, fieldInfo, hash32, lotCwt, seasonDone, variety, FIELD_ACRES, type NeighborYear, type World } from '../sim/index.ts'

export function neighborYear(world: World, seed: number, year: number): NeighborYear | null {
  try {
    const c = createCampaign(world, { seed: hash32(seed, year, 4242), startYear: year })
    if (!apply(world, c, { t: 'begin' }).ok) return null
    const out: NeighborYear = { plant: -1, hill1: -1, hill2: -1, firstSpray: -1, sprays: 0, kill: -1, dig: -1, yieldCwtAcre: 0, blightPct: 0, variety: '' }
    let sprays = 0, peak = 0
    for (let guard = 0; guard < 280 && c.phase === 'season' && !seasonDone(c); guard++) {
      // Each field gets the order the advice has for it, as the reference bot plays.
      const done = new Set<number>()
      for (const a of advise(world, c)) {
        if (a.act === 'wait' || a.act === 'close' || a.act === 'sell' || done.has(a.field)) continue
        done.add(a.field)
        apply(world, c, { t: 'job', kind: a.act, field: a.field })
      }
      const r = apply(world, c, { t: 'day' })
      if (!r.ok) break
      for (const e of r.events) {
        if (e.type === 'planted' && out.plant < 0) out.plant = e.day
        else if (e.type === 'hilled') { if (out.hill1 < 0) out.hill1 = e.day; else if (out.hill2 < 0 && e.day > out.hill1 + 5) out.hill2 = e.day }
        else if (e.type === 'sprayed') { sprays++; if (out.firstSpray < 0) out.firstSpray = e.day }
        else if (e.type === 'killed' && out.kill < 0) out.kill = e.day
        else if (e.type === 'dug' && out.dig < 0) out.dig = e.day
      }
      for (let i = 0; i < c.fields.length; i++) {
        const b = fieldInfo(c, i).blightKnown
        if (b > peak) peak = b
      }
    }
    const fields = c.plans.filter((p, i) => p.crop === 'potato' && c.fields[i].tenure !== 'none').length
    const cwt = c.lots.reduce((a, l) => a + lotCwt(l) + l.sold, 0)
    out.sprays = fields ? Math.round(sprays / fields) : 0
    out.yieldCwtAcre = fields ? Math.round(cwt / (fields * FIELD_ACRES)) : 0
    out.blightPct = Math.round(peak * 100)
    const first = c.plans.find(p => p.crop === 'potato')
    out.variety = first ? variety(first.variety).name : ''
    return out
  } catch {
    return null
  }
}
