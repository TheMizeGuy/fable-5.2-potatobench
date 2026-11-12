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
  if (!o.passes || !o.fields) return 'The crew sprays when it wears thin.'
  const each = Math.round(o.passes / o.fields)
  const usual = Math.round(neighbourSprays(world))
  const more = usual > 0 && each > usual * 1.25
  return `The crew sprays each field when it wears thin: about ${F.plural(each, 'pass', 'passes')} on each of ${F.plural(o.fields, 'field')}, ${F.money(o.dollars)} this season.${usual ? ` The neighbor makes about ${usual} a field in a season${more ? ', and asked each time you can spray only when blight weather comes' : ''}.` : ''}`
}
