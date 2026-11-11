// Contracts: the spring offers, the small tracker of what is signed, and delivering a crop against one.
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
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
  return Math.abs(gap) < 50 ? 'about what it fetches on the market today' : `${F.money(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than the market pays today`
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
    return n ? `Your plan has ${F.plural(n, 'field')} of ${name}: about ${F.mass(n * S.CONTRACT_CWT_MIN)} of No. 1 in a usual year.`
      : `Your plan has no ${name}. Give it a field on the map before the season begins.`
  }
  const have = inHand(c, id), out = growing(c, id)
  return `${F.mass(have)} of No. 1 ${name} in hand${out ? `, and ${F.plural(out, 'field')} still to dig` : ''}.`
}

function facts(rows: [string, Child][]): HTMLElement {
  return h('dl', { class: 'offer-facts' }, rows.map(([k, v]) => h('div', null, h('dt', { class: 't-label' }, k), h('dd', null, v))))
}

function signedCard(c: S.Campaign, k: S.ContractInfo): HTMLElement {
  const short = !k.settled && k.needed > 1e-6
  return h('article', { class: 'offer signed', testid: `contract-${k.id}` },
    h('header', { class: 'offer-head' }, h('h3', { class: 't-head' }, k.buyer), h('span', { class: 'sub' }, `${k.varietyName} · ${k.settled ? 'closed' : 'signed'}`)),
    facts([
      ['Delivered', h('span', { class: 'num' }, `${F.mass(k.delivered)} of ${F.mass(k.cwt)}`)],
      ['Price', h('span', { class: 'num' }, F.price(k.price))],
      ['Due', k.dueBy],
      [k.settled ? 'Penalty' : 'Short today', h('span', { class: `num${k.penalty > 0 ? ' bad-text' : ''}` }, k.penalty > 0 ? F.money(-k.penalty) : 'none')],
    ]),
    short ? h('p', { class: 'sub' }, farmHas(c, k.variety)) : null)
}

// The offers in spring, and in season and winter what is signed. Signed contracts are delivered against from a weigh
// ticket, a dug field's card or a cellar card.
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
        const offers = S.offerInfo(c)
        const signed = S.contractInfo(c)
        box.replaceChildren(...h('div', null,
          h('p', { class: 't-lede' }, `A buyer pays a fixed price for US No. 1 and large tubers delivered by a date. What is short on the day costs ${F.pct(S.CONTRACT_PENALTY)} of its contract value.`),
          signed.length ? [h('h3', { class: 'block-head' }, 'Signed'), h('div', { class: 'offers' }, signed.map(k => signedCard(c, k)))] : null,
          c.phase === 'plan' ? [
            h('h3', { class: 'block-head' }, offers.length ? 'Offered this spring' : 'No more offers this spring'),
            offers.length ? h('div', { class: 'offers' }, offers.map(o => {
              const v = S.variety(o.variety)
              return h('article', { class: 'offer', testid: `offer-${o.id}` },
                h('header', { class: 'offer-head' }, h('h3', { class: 't-head' }, o.buyer), h('span', { class: 'sub' }, o.varietyName)),
                facts([
                  ['Wants', h('span', { class: 'num' }, F.mass(o.cwt))],
                  ['Pays', h('span', { class: 'num' }, `${F.price(o.price)}, ${F.money(o.value)} in all`)],
                  ['Due', o.dueBy],
                  ['Usual market', h('span', { class: 'num' }, `${F.price(o.usual)}${v.contract ? ', off contract' : ''}`)],
                ]),
                h('p', { class: 'sub' }, farmHas(c, o.variety)),
                v.contract ? h('p', { class: 'sub warn-text' }, `Off contract ${v.name} sells ${offContract()} its usual price.`) : null,
                h('button', {
                  class: 'btn', type: 'button', testid: `accept-${o.id}`,
                  onclick: () => { if (ctx.run({ t: 'accept', offer: o.id }).ok) { ctx.announce(`Signed with ${o.buyer.toLowerCase()}.`); draw() } },
                }, 'Accept'))
            })) : null,
            h('p', { class: 'sub' }, 'Offers lapse when the season begins.'),
          ] : h('p', { class: 'sub' }, 'Deliver from the weigh ticket when a field is dug, from a dug field\'s card, or from the cellar. Harvest contracts close with the season; winter ones at the end of February.'),
        ).childNodes)
      }
      draw()
      return box
    },
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'contracts-close', autofocus: true, onclick: close }, 'Back'),
  })
}

// The standing tracker: one row a contract, delivered of what is wanted, when, and what being short costs today.
export function tracker(ctx: Ctx): { el: HTMLElement; update(): void } {
  const el = h('section', { class: 'tracker instrument', 'aria-label': 'Contracts', testid: 'tracker', hidden: true })
  function update(): void {
    const c = ctx.app.campaign
    const ks = c ? S.contractInfo(c) : []
    el.hidden = ks.length === 0
    if (!ks.length) return
    patch(el, JSON.stringify([ks.map(k => [k.id, Math.round(k.delivered), Math.round(k.penalty), k.settled]), ctx.app.settings.units]), () => ks.map(k => {
      const done = k.needed <= 1e-6
      const said = `${k.buyer}: ${F.mass(k.delivered)} of ${F.mass(k.cwt)} ${k.varietyName} delivered, due ${k.dueBy}${k.settled ? ', closed' : done ? ', filled' : `. Short today it would cost ${F.money(k.penalty)}`}.`
      // What a sighted player reads is the start of the button's name; the rest is said after it.
      return h('button', { class: `track-row${done ? ' done' : ''}`, type: 'button', testid: `track-${k.id}`, title: ctx.touch() ? undefined : said, onclick: () => openContracts(ctx) },
        icon(done ? 'check' : 'contract', 'ic s'),
        h('span', { class: 'track-v' }, k.varietyName),
        h('span', { class: 'track-n num' }, `${F.num(F.massValue(k.delivered))}/${F.mass(k.cwt)}`),
        h('span', { class: 'track-due' }, k.settled ? 'closed' : DUE_SHORT[k.due]),
        !done && k.penalty > 0 ? h('span', { class: 'track-pen num' }, F.money(-k.penalty)) : null,
        h('span', { class: 'sr' }, `. ${said} Open the contracts.`))
    }))
  }
  return { el, update }
}
