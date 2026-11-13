// Contracts: the spring offers, the small tracker of what is signed, and delivering a crop against one.
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { range } from './system/parts.ts'
import { offContract, yearWord } from './rules.ts'

const DUE_SHORT: Record<S.Due, string> = { harvest: 'by fall', winter: 'by March' }

// What delivering this lot against each open contract for its variety would take, pay, and fetch on the market today.
export interface Deal { k: S.ContractInfo; take: number; pays: number; market: number }

export function deals(world: S.World, c: S.Campaign, lot: S.Lot): Deal[] {
  if (!lot.open || (c.phase !== 'season' && c.phase !== 'cellar')) return []
  if (c.phase === 'season' && c.season?.fields[lot.field]?.status === 'digging') return []
  const have = lot.grades.no1 + lot.grades.chef
  if (have <= 1e-6) return []
  return S.contractInfo(c).filter(k => !k.settled && k.needed > 1e-6 && k.variety === lot.variety).map(k => {
    const take = Math.min(have, k.needed)
    const share = take / have
    const market = share * (lot.grades.no1 * S.gradePrice(world, c, lot, 'no1') + lot.grades.chef * S.gradePrice(world, c, lot, 'chef'))
    return { k, take, pays: take * k.price, market }
  })
}

// "$2,100 more than selling it today", or less.
export function versusMarket(d: Deal): string {
  const gap = d.pays - d.market
  return Math.abs(gap) < 50 ? 'about what the market pays today' : `${F.money(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than the market pays today`
}

export function deliver(ctx: Ctx, lot: S.Lot, d: Deal): boolean {
  const r = ctx.run({ t: 'deliver', lot: lot.id, contract: d.k.id })
  if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? 'Delivered.'))
  return r.ok
}

// Potato fields planned to a variety on land the farm holds.
function plannedFields(c: S.Campaign, id: S.VarietyId): number {
  let n = 0
  c.plans.forEach((p, i) => { if (S.held(c, i) && p.crop === 'potato' && p.variety === id) n++ })
  return n
}

function inHand(c: S.Campaign, id: S.VarietyId): number {
  return S.openLots(c).filter(l => l.variety === id).reduce((a, l) => a + l.grades.no1 + l.grades.chef, 0)
}

function growing(c: S.Campaign, id: S.VarietyId): number {
  const s = c.season
  if (!s || c.phase !== 'season') return 0
  return s.fields.filter(f => f.variety === id && (f.status === 'planted' || f.status === 'growing' || f.status === 'dead' || f.status === 'digging')).length
}

// What the farm has toward a contract of this variety, in words.
function farmHas(c: S.Campaign, id: S.VarietyId): string {
  const name = S.variety(id).name
  if (c.phase === 'plan') {
    const n = plannedFields(c, id)
    return n ? `Your plan has ${F.plural(n, 'field')} of ${name}, good for about ${F.mass(n * S.CONTRACT_CWT_MIN)} of No. 1 in a usual year.`
      : `Your plan has no ${name}, so give it a field on the map before the season starts.`
  }
  const have = inHand(c, id), out = growing(c, id)
  return `You have ${F.mass(have)} of No. 1 ${name} on hand${out ? ` and ${F.plural(out, 'field')} still to dig` : ''}.`
}

// What the fields of a contract's variety look like giving: in spring, the plan's fields at a usual crop and either
// side of it; in the season, what is delivered plus the estimates still in the ground.
function giving(c: S.Campaign, id: S.VarietyId, delivered = 0): { lo: number; hi: number; n: number } | null {
  if (c.phase === 'plan') {
    const n = plannedFields(c, id)
    return n ? { lo: n * S.CONTRACT_CWT_MIN * 0.7, hi: n * S.CONTRACT_CWT_MIN * 1.3, n } : null
  }
  if (c.phase !== 'season' || !c.season) return null
  let lo = 0, hi = 0, n = 0
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    if (!S.held(c, i)) continue
    const f = S.fieldInfo(c, i)
    if (f.variety !== S.variety(id).name || !f.estimate) continue
    lo += f.estimate.lo * S.FIELD_ACRES
    hi += f.estimate.hi * S.FIELD_ACRES
    n++
  }
  return n ? { lo: delivered + lo, hi: delivered + hi, n } : null
}

// Whether a contract's shortfall is real yet: once it has closed, or when even the top of what its fields look like
// giving falls short, or when nothing of its variety is left in the ground. Before that, "short today" is only what
// the farm has not yet dug, and is not said.
export function shortReal(c: S.Campaign, k: S.ContractInfo): boolean {
  if (k.settled) return k.penalty > 0
  if (c.phase === 'plan' || k.needed <= 1e-6 || k.penalty <= 0) return false
  const g = giving(c, k.variety, k.delivered)
  if (g) return g.hi < k.cwt
  return c.phase !== 'season' || growing(c, k.variety) === 0
}

// What the bar on a contract shows, for its hover: the three marks it is drawn with.
export const BAR_SAYS = 'The hatched band is what your fields look likely to produce, from low to high. The upright line is what you\'ve promised, and the violet mark is what you\'ve delivered so far.'

// The bar explained under the pointer and to a screen reader, where it stands.
function barHover(el: HTMLElement): HTMLElement {
  el.title = BAR_SAYS
  return el
}

// A contract as a range: what is promised (the rule) against what the fields look like giving (the hatching), and
// what is delivered (the violet mark).
function contractRange(c: S.Campaign, id: S.VarietyId, cwt: number, delivered: number): { el: HTMLElement; said: string } {
  const g = giving(c, id, delivered)
  const max = Math.max(cwt, g?.hi ?? 0, delivered) * 1.15
  const said = g ? `your fields look likely to produce ${F.mass(g.lo)} to ${F.mass(g.hi)}, and you've promised ${F.mass(cwt)}` : `nothing is planted for it, and you've promised ${F.mass(cwt)}`
  return { el: range({ lo: g?.lo ?? 0, hi: g?.hi ?? 0, max, mark: delivered > 0 ? delivered : undefined, promise: cwt, label: said }), said }
}

function signedCard(c: S.Campaign, k: S.ContractInfo): HTMLElement {
  const r = contractRange(c, k.variety, k.cwt, k.delivered)
  return h('article', { class: 'offer signed cat-offer', testid: `contract-${k.id}` },
    h('p', { class: 'lead' }, icon(k.needed <= 1e-6 ? 'check' : 'contract', 'i'), h('b', null, k.buyer), h('span', { class: 'it quiet' }, k.varietyName), h('span', { class: 'dots' }),
      h('span', { class: 'num' }, F.price(k.price))),
    barHover(r.el),
    h('p', { class: 't-caption' }, `${F.mass(k.delivered)} of ${F.mass(k.cwt)} delivered, due ${k.dueBy}. ${F.upper(r.said)}.`,
      k.settled || k.needed <= 1e-6 ? null : ' On the due date the buyer takes whatever you still owe from your potato house at the contract price, and you only pay a penalty on what\'s still missing after that.',
      shortReal(c, k) ? h('span', { class: 'c-red' }, ` ${k.settled ? 'Penalty' : 'Short right now'}: ${F.money(-k.penalty)}.`) : null))
}

function offerCard(ctx: Ctx, c: S.Campaign, o: S.OfferInfo, after: () => void): HTMLElement {
  const v = S.variety(o.variety)
  const vs = o.price / o.usual - 1
  const r = contractRange(c, o.variety, o.cwt, 0)
  return h('article', { class: 'offer cat-offer', testid: `offer-${o.id}` },
    h('p', { class: 'lead' }, icon('contract', 'i'), h('b', null, o.buyer), h('span', { class: 'it quiet' }, o.varietyName), h('span', { class: 'dots' }),
      h('span', { class: 'num' }, F.price(o.price))),
    barHover(r.el),
    h('p', { class: 't-caption' }, `${F.mass(o.cwt)} of No. 1 ${o.dueBy} for ${F.money(o.value)} in all, `,
      h('span', { class: vs < -0.015 ? 'c-ochre' : null }, `${F.versus(o.price / o.usual)} ${v.contract ? 'the processing price' : 'a usual year'}`), '. ', farmHas(c, o.variety)),
    v.contract ? h('p', { class: 't-caption c-ochre' }, `Without a contract ${v.name} sells ${offContract()} its usual price.`) : null,
    h('button', {
      class: 'btn', type: 'button', testid: `accept-${o.id}`,
      onclick: () => { if (ctx.run({ t: 'accept', offer: o.id }).ok) { ctx.announce(`Signed with ${o.buyer.toLowerCase()}.`); after() } },
    }, 'Accept'))
}

// What is signed, and in spring what is offered. after: redraws whatever holds them.
function contractCards(ctx: Ctx, c: S.Campaign, after: () => void): Child {
  const offers = S.offerInfo(c)
  const signed = S.contractInfo(c)
  return [
    h('p', { class: 't-caption' }, `A contract pays a fixed price for No. 1 potatoes delivered by a set date. The hatched band is what your fields look likely to produce and the line is what you've promised. On the due date the buyer takes what you owe from your potato house, and anything still missing costs you ${F.pct(S.CONTRACT_PENALTY)} of its contract price.${F.cwtNote()}`),
    signed.length ? [h('p', { class: 't-label cat-sub' }, 'Signed'), h('div', { class: 'offers' }, signed.map(k => signedCard(c, k)))] : null,
    c.phase === 'plan' ? [
      h('p', { class: 't-label cat-sub' }, offers.length ? 'Offered this spring' : 'No more offers this spring'),
      offers.length ? h('div', { class: 'offers' }, offers.map(o => offerCard(ctx, c, o, after))) : null,
      h('p', { class: 't-caption' }, 'Offers expire when the season starts.'),
    ] : h('p', { class: 't-caption' }, 'You can deliver from the weigh ticket, a dug field\'s card or the cellar. Harvest contracts close when the season ends, and winter ones at the end of February.'),
  ]
}

// The contracts as the spring plan shows them, in place.
export function springContracts(ctx: Ctx, c: S.Campaign): Child {
  return contractCards(ctx, c, () => ctx.dirty())
}

// In the season and the winter: what is signed. Signed contracts are delivered against from a weigh ticket, a dug
// field's card or a cellar card.
export function openContracts(ctx: Ctx): void {
  const app = ctx.app
  if (!app.campaign) return
  ctx.papers.open({
    title: `Contracts, ${yearWord(app.campaign.year)}`,
    testid: 'contracts',
    size: 'wide',
    body: () => {
      const box = h('div', { class: 'contracts-body' })
      const draw = () => {
        const c = app.campaign
        if (!c) return
        box.replaceChildren(...h('div', null, contractCards(ctx, c, draw)).childNodes)
      }
      draw()
      return box
    },
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'contracts-close', autofocus: true, onclick: close }, 'Back'),
  })
}

// The contracts on the bank board (top.ts): each as a range, what is promised marked against what the fields of its
// variety look like giving (delivered so far plus the yield estimates still in the ground), with the date it is due.
export function contractRows(ctx: Ctx): { key(): unknown; part(c: S.Campaign): Child } {
  const growing = (c: S.Campaign, k: S.ContractInfo) => giving(c, k.variety, k.delivered)
  return {
    key() {
      const c = ctx.app.campaign
      return c ? [S.contractInfo(c).map(k => [k.id, Math.round(k.delivered), Math.round(k.penalty), k.settled]), c.season?.day, c.phase === 'plan' ? c.plans : 0, ctx.app.settings.units] : 0
    },
    part(c) {
      const ks = S.contractInfo(c)
      if (!ks.length) return null
      return h('div', { class: 'contracts', testid: 'tracker', role: 'group', 'aria-label': 'Contracts' }, ks.map(k => {
        const done = k.needed <= 1e-6
        const g = growing(c, k)
        const max = Math.max(k.cwt, g?.hi ?? 0, k.delivered) * 1.15
        const said = `${k.buyer}: ${F.mass(k.delivered)} of ${F.mass(k.cwt)} ${k.varietyName} delivered, due ${k.dueBy}${g ? `, and your fields look likely to produce ${F.mass(g.lo)} to ${F.mass(g.hi)} in all` : ''}${k.settled ? ', closed' : done ? ', filled' : shortReal(c, k) ? `. Short right now: ${F.money(k.penalty)}` : ''}. ${BAR_SAYS}`
        return h('button', { class: `contract${done ? ' done' : ''}`, type: 'button', testid: `track-${k.id}`, title: ctx.touch() ? undefined : said, onclick: () => openContracts(ctx) },
          h('span', { class: 'who' }, icon(done ? 'check' : 'contract', 'i'), h('b', null, k.buyer.replace(/^The /, '')), `: ${k.varietyName}`),
          h('span', { class: 't-label due' }, k.settled ? 'closed' : DUE_SHORT[k.due]),
          h('span', { class: 'range', 'aria-hidden': 'true' },
            g ? h('span', { class: 'band', style: `left:${(g.lo / max * 100).toFixed(1)}%;width:${((g.hi - g.lo) / max * 100).toFixed(1)}%` }) : null,
            h('span', { class: 'mark', style: `left:${(k.delivered / max * 100).toFixed(1)}%` }),
            h('span', { class: 'promise', style: `left:${(k.cwt / max * 100).toFixed(1)}%` })),
          h('span', { class: 'says num' },
            h('b', { class: 'track-n' }, `${F.num(F.massValue(k.delivered))}/${F.mass(k.cwt)}`),
            g ? ` · ${F.num(F.massValue(g.lo))}–${F.num(F.massValue(g.hi))} growing` : null, !done && shortReal(c, k) ? h('span', { class: 'c-red' }, ` · short ${F.money(k.penalty)}`) : null),
          h('span', { class: 'sr' }, `. ${said} Opens your contracts.`))
      }))
    },
  }
}

// The contracts as a block of their own, for a sheet that lists them (the spring plan).
export function tracker(ctx: Ctx): { el: HTMLElement; update(): void } {
  const rows = contractRows(ctx)
  const el = h('section', { class: 'tracker sys', 'aria-label': 'Signed contracts', hidden: true })
  return {
    el,
    update() {
      const c = ctx.app.campaign
      el.hidden = !c || !S.contractInfo(c).length
      if (c) patch(el, JSON.stringify(rows.key()), () => rows.part(c))
    },
  }
}
