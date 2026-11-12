// Land beyond the home farm, as the spring card shows it: what it is, what it costs to rent or buy, and what it brings.
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME, BLOCK_NOTE, roadTime } from './map.ts'
import { POSITION_NOTE, soilWord } from './rules.ts'

const GROW = S.FIELD_COST + S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT

export function landOf(c: S.Campaign, field: number): S.LandInfo | undefined {
  return S.landInfo(c).find(l => l.field === field)
}

// What the land is, in a line, for the marker on the map and its card.
export function landSaid(l: S.LandInfo): string {
  return `${l.name}, ${BLOCK_NAME[l.block].toLowerCase()}. You can rent it for ${F.money(l.rent)} a year or buy it for ${F.money(l.price)}.`
}

// The facts a grower weighs before taking on a field: its ground, the drive, the haul, and what comes with it.
function facts(l: S.LandInfo): string {
  const haul = l.haul > 0.005 ? ` Digging it takes ${F.pct(l.haul)} longer because of the haul to the potato house.` : ''
  return `The soil is ${soilWord(l.soil)}, with early dying in ${F.pct(l.vert)} of plants. It's ${roadTime(l.travel)} each way by road from the home yard.${haul}`
}

// The card for land the farm does not hold: Rent or Buy. note: why the last try was refused.
export function landCard(ctx: Ctx, c: S.Campaign, field: number, note: string, o: { onTry: (err: string) => void }): Child {
  const l = landOf(c, field)
  if (!l) return null
  const tryCmd = (cmd: S.Cmd) => {
    const r = ctx.app.do(cmd)
    o.onTry(r.ok ? '' : r.err)
    if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? 'Done.'))
  }
  return [
    h('header', { class: 'card-head plan-head' },
      h('div', null,
        h('h2', { class: 't-head', testid: 'card-title' }, l.name),
        h('p', { class: 'card-sub' }, `${BLOCK_NAME[l.block]}. ${POSITION_NOTE[l.elev]}`)),
      h('button', { class: 'nicon', type: 'button', testid: 'card-close', 'aria-label': 'Deselect', onclick: () => ctx.app.select(-1) }, icon('close'))),
    h('p', { class: 'card-line note' }, `${BLOCK_NOTE[l.block]}${l.brings ? ` ${l.brings}` : ''}`),
    h('p', { class: 'card-line', testid: 'land-facts' }, facts(l)),
    h('div', { class: 'plan-row land-row' },
      h('button', { class: 'nbtn primary', type: 'button', testid: 'land-rent', onclick: () => tryCmd({ t: 'rent', field }) }, 'Rent', h('span', { class: 'sub num' }, `${F.money(l.rent)} a year`)),
      h('button', { class: 'nbtn', type: 'button', testid: 'land-buy', onclick: () => tryCmd({ t: 'buyLand', field }) }, 'Buy', h('span', { class: 'sub num' }, F.money(l.price))),
      h('p', { class: 'card-line' }, `You pay rent when the season starts. Growing a crop on it costs ${F.money(GROW)} more, or ${F.money(S.REST_COST)} if you rest it. Land is bought with cash, and you have ${F.money(Math.max(0, c.cash))} now.`)),
    note ? h('p', { class: 'card-line flash lv-warn', role: 'alert' }, note) : null,
  ]
}

// On the plan card of land the farm rents or bought: how it is held, and the way to give it up or buy it.
export function tenureRow(ctx: Ctx, c: S.Campaign, field: number, o: { onTry: (err: string) => void }): Child {
  const fp = c.fields[field]
  if (field < S.HOME_FIELDS && fp.tenure === 'owned') return null
  const p = S.PARCELS[field]
  const tryCmd = (cmd: S.Cmd) => {
    const r = ctx.app.do(cmd)
    o.onTry(r.ok ? '' : r.err)
    if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? 'Done.'))
  }
  if (fp.tenure === 'owned') return h('p', { class: 'card-line', testid: 'tenure' }, `${BLOCK_NAME[p.block]}. The farm owns it.`)
  return h('div', { class: 'plan-row land-row', testid: 'tenure' },
    h('p', { class: 'card-line' }, `${BLOCK_NAME[p.block]}. Rented, ${F.money(p.rent)} this year.`),
    h('button', { class: 'nbtn', type: 'button', testid: 'land-release', onclick: () => tryCmd({ t: 'release', field }) }, 'Release'),
    h('button', { class: 'nbtn', type: 'button', testid: 'land-buy', onclick: () => tryCmd({ t: 'buyLand', field }) }, 'Buy', h('span', { class: 'sub num' }, F.money(p.price))))
}
