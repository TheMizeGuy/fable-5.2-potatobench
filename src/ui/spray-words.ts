// What keeping the fields sprayed by itself comes to, said against what a careful grower makes: the neighbour's
// passes in a usual season, field by field, so "about 36 passes" is read as nine on each of four fields.
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// The neighbour's spray passes in a usual season, over every year on record.
export function neighbourSprays(world: S.World): number {
  const years = Object.values(world.neighbor ?? {}).filter(y => typeof y.sprays === 'number')
  return years.length ? years.reduce((a, y) => a + y.sprays, 0) / years.length : 0
}

export function keepSprayedLine(world: S.World, c: S.Campaign): string {
  const o = S.sprayOutlook(world, c)
  if (!o.passes || !o.fields) return 'Your crew sprays whenever the protection wears off.'
  const each = Math.round(o.passes / o.fields)
  const usual = Math.round(neighbourSprays(world))
  const more = usual > 0 && each > usual * 1.25
  return `Your crew sprays each field whenever the protection wears off. That's about ${F.plural(each, 'spray')} on each of ${F.plural(o.fields, 'field')}, or ${F.money(o.dollars)} this season.${usual ? ` The neighbor sprays each field about ${usual} times a season${more ? ', and if you choose to be asked each time, you can spray only when blight weather comes' : ''}.` : ''}`
}
