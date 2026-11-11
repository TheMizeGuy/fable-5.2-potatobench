// Winter: each stored crop is a card, and the months turn one at a time.
import * as S from '../sim/index.ts'
import { deals, deliver, tracker, versusMarket } from './contracts.ts'
import { count, gauge, patch, type Ctx, type Screen } from './core.ts'
import { h, s, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import * as R from './rules.ts'
import { topBar } from './top.ts'

const MONTH_SHORT = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']
const LAST = S.MONTH_CURVE.length - 1

// The price in any month of this winter: months already passed are what the market did.
function priceIn(world: S.World, c: S.Campaign, id: S.VarietyId, month: number): number {
  return S.basePrice(world, { ...c, month, phase: 'cellar' }, id)
}

// The winter so far as a line, and the usual winter ahead as a band that widens with the months.
function priceLine(ctx: Ctx, c: S.Campaign, id: S.VarietyId): SVGElement {
  const world = ctx.app.world
  const v = S.variety(id)
  const past = Array.from({ length: c.month + 1 }, (_, m) => priceIn(world, c, id, m))
  const now = past[c.month]
  const ahead = Array.from({ length: LAST - c.month + 1 }, (_, k) => {
    const mid = v.contract ? now : now * S.MONTH_CURVE[c.month + k] / S.MONTH_CURVE[c.month]
    const spread = v.contract ? 0 : 0.035 * Math.sqrt(k) * 1.5
    return { m: c.month + k, lo: mid * (1 - spread), hi: mid * (1 + spread) }
  })
  const all = [...past, ...ahead.map(a => a.lo), ...ahead.map(a => a.hi)]
  const lo = Math.min(...all) * 0.98, hi = Math.max(...all) * 1.02
  const W = 220, H = 56
  const x = (m: number) => 4 + (m / LAST) * (W - 8)
  const y = (p: number) => 4 + (1 - (p - lo) / (hi - lo || 1)) * (H - 22)
  const path = (pts: [number, number][]) => pts.map(([m, p], k) => `${k ? 'L' : 'M'}${x(m).toFixed(1)} ${y(p).toFixed(1)}`).join('')
  const band = ahead.length > 1 ? `${path(ahead.map(a => [a.m, a.hi]))}${path(ahead.map(a => [a.m, a.lo] as [number, number]).reverse()).replace('M', 'L')}z` : ''
  const april = ahead.find(a => a.m === 5)
  return s('svg', {
    class: 'price-line', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': v.contract ? `${v.name}: ${F.price(now)} now, a processing price off contract. It barely moves through the winter.`
      : `${v.name}: ${F.price(now)} now.${april ? ` A usual winter would put April between ${F.price(april.lo)} and ${F.price(april.hi)}.` : ''}`,
  },
  band ? s('path', { class: 'pl-band', d: band }) : null,
  past.length > 1 ? s('path', { class: 'pl-past', d: path(past.map((p, m) => [m, p])) }) : null,
  MONTH_SHORT.map((_, m) => s('path', { class: 'pl-tick', d: `M${x(m).toFixed(1)} ${H - 14}v3` })),
  s('text', { class: 'pl-end', x: 4, y: H - 1 }, MONTH_SHORT[0]),
  s('text', { class: 'pl-end', x: W - 4, y: H - 1, 'text-anchor': 'end' }, MONTH_SHORT[LAST]),
  s('rect', { class: 'pl-now', x: (x(c.month) - 3).toFixed(1), y: (y(now) - 3).toFixed(1), width: 6, height: 6 }))
}

interface Before { month: number; cash: number; storage: number; cwt: number; value: Record<number, number>; price: Record<string, number> }

// The potato houses side by side, each as wide as what it holds, and the piles in store filled in across them.
function houses(st: S.StorageInfo): HTMLElement {
  const share = st.capacity > 0 ? Math.min(1, st.stored / st.capacity) : 0
  return h('div', { class: 'houses', testid: 'houses' },
    gauge(share, { label: 'In store', text: `${F.mass(st.stored)} of ${F.mass(st.capacity)}`, cls: st.stored > st.capacity + 0.5 ? 'warn' : '' }),
    st.houses.length > 1 ? h('div', { class: 'house-marks', 'aria-hidden': 'true' }, st.houses.map(x => h('span', { style: `flex-grow:${x.cwt}` }))) : null,
    h('ul', { class: 'house-list' }, st.houses.map(x => h('li', null, icon('house', 'ic s'), h('span', null, x.name), h('span', { class: 'num' }, F.mass(x.cwt))))),
    st.stored > st.capacity + 0.5 ? h('p', { class: 'warn-text' }, `${F.mass(st.stored - st.capacity)} more than the houses hold.`) : null)
}

export function cellarScreen(ctx: Ctx, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const sheet = h('section', { class: 'paper sheet cellar-sheet', 'aria-label': 'The cellar', 'data-scroll': 'sheet' })
  const track = tracker(ctx)
  const notesSlot = h('div', { class: 'notes-slot top-left' }, track.el)
  const el = h('main', { class: 'sheet-screen cellar' }, top.el, notesSlot, sheet)
  const seedOpen: Record<number, boolean> = {}
  const seedN: Record<number, number> = {}
  // What the last turn of the month did, in the player's own figures.
  let did: string[] = []
  let before: Before | null = null
  let counted = -1

  function snapshot(c: S.Campaign): Before {
    const lots = S.openLots(c)
    return {
      month: c.month, cash: c.cash, storage: c.yearStorage, cwt: lots.reduce((a, l) => a + S.lotCwt(l), 0),
      value: Object.fromEntries(lots.map(l => [l.id, S.lotValue(app.world, c, l)])),
      price: Object.fromEntries([...new Set(lots.map(l => l.variety))].map(id => [id, S.basePrice(app.world, c, id)])),
    }
  }

  function nextMonth(): void {
    const c = app.campaign
    if (!c) return
    const was = snapshot(c)
    const r = ctx.run({ t: 'month' })
    if (!r.ok || c.phase !== 'cellar') return
    before = was
    const lots = S.openLots(c)
    const cwt = lots.reduce((a, l) => a + S.lotCwt(l), 0)
    did = [
      `Storage for ${S.CELLAR_MONTHS[was.month]}: ${F.money(c.yearStorage - was.storage)}.`,
      was.cwt - cwt >= 0.5 ? `The piles shrank ${F.mass(was.cwt - cwt)}.` : '',
      ...Object.entries(was.price).map(([id, p]) => {
        const now = S.basePrice(app.world, c, id as S.VarietyId)
        const d = now / p - 1
        return `${S.variety(id as S.VarietyId).name}: ${Math.abs(d) < 0.005 ? 'no change' : `${d > 0 ? 'up' : 'down'} ${F.num(Math.abs(d) * 100, 1)}%`}, to ${F.price(now)}.`
      }),
      ...r.events.filter(e => e.type === 'sprout' || e.type === 'breakdown' || e.type === 'contractShort' || e.type === 'contractFilled').map(e => F.localize(e.text)),
    ].filter(Boolean)
    ctx.announce(`${S.CELLAR_MONTHS[c.month]}. ${did.join(' ')}`)
  }

  function lotCard(c: S.Campaign, lot: S.Lot, storageSoFar: number): HTMLElement {
    const v = S.variety(lot.variety)
    const value = S.lotValue(app.world, c, lot)
    const seedMax = Math.floor((lot.grades.b + lot.grades.no1) / S.SEED_CWT_PER_FIELD)
    const n = Math.max(1, Math.min(seedMax, seedN[lot.id] ?? 1))
    const sell = (frac: number) => { ctx.run({ t: 'sell', lot: lot.id, frac }) }
    const m = R.sproutMonth(lot.year, lot.dugDay, lot.variety, c.upgrades.vent)
    const next = c.month < LAST ? S.MONTH_CURVE[c.month + 1] / S.MONTH_CURVE[c.month] - 1 : 0
    const heading: [string, string] = v.contract ? ['flat', 'Off contract, a processing price that barely moves']
      : c.month >= LAST ? ['flat', 'May is the last month']
        : [next > 0.004 ? 'rise' : next < -0.004 ? 'fall' : 'flat', `${S.CELLAR_MONTHS[c.month + 1]} usually runs ${next >= 0 ? `${F.num(next * 100, 1)}% higher` : `${F.num(-next * 100, 1)}% lower`}`]
    const grewWith = c.season?.fields[lot.field]?.seedVirus
    const rent = Math.round(S.lotCwt(lot) * S.STORE_COST)
    const deal = deals(app.world, c, lot)[0]
    return h('article', { class: 'lot', 'aria-labelledby': `lot-h-${lot.id}`, k: `lot-${lot.id}` },
      h('header', { class: 'lot-head' },
        h('div', null,
          h('h3', { id: `lot-h-${lot.id}`, class: 't-head' }, S.FIELD_NAMES[lot.field]),
          h('p', { class: 'sub' }, `${v.name} · ${F.mass(S.lotCwt(lot))}${lot.seedHeld ? ` · seed held for ${F.plural(lot.seedHeld, 'field')}` : ''}`)),
        h('div', { class: 'lot-worth' },
          h('span', { class: 'figure num', testid: `lot-value-${lot.id}`, 'data-lot': lot.id }, F.money(value)),
          h('span', { class: 'sub num' }, `${F.price(S.basePrice(app.world, c, lot.variety))} for No. 1`))),
      h('div', { class: 'lot-facts' },
        priceLine(ctx, c, lot.variety),
        h('ul', null,
          h('li', null, icon(heading[0], 'ic s'), h('span', null, heading[1])),
          lot.sprouted ? h('li', { class: 'warn-text' }, icon('sprout', 'ic s'), h('span', null, 'Sprouting: worth 15% less, and shrinking faster'))
            : h('li', null, icon('sprout', 'ic s'), h('span', null, m > c.month ? F.upper(R.sproutText(m)) : 'Sprouting soon')),
          lot.broke ? h('li', { class: 'bad-text' }, icon('blight', 'ic s'), h('span', null, 'Rot ran through it')) : null,
          h('li', null, icon('dig', 'ic s'), h('span', null, `Storage ${F.money(rent)} a month; about ${F.money(storageSoFar)} so far`)))),
      deal ? h('p', { class: 'sub lot-deal' }, `${deal.k.buyer} takes ${F.mass(deal.take)} of No. 1 at ${F.price(deal.k.price)}: ${versusMarket(deal)}.`) : null,
      h('div', { class: 'lot-actions' },
        deal ? h('button', { class: 'btn primary', type: 'button', testid: `lot-deliver-${lot.id}`, onclick: () => deliver(ctx, lot, deal) }, `Deliver to ${deal.k.buyer.replace(/^The /, 'the ')}`, h('span', { class: 'sub num' }, F.money(deal.pays))) : null,
        h('button', { class: 'btn', type: 'button', testid: `lot-sell-${lot.id}`, onclick: () => sell(1) }, 'Sell', h('span', { class: 'sub num' }, F.money(value))),
        h('button', { class: 'btn', type: 'button', testid: `lot-sell-half-${lot.id}`, onclick: () => sell(0.5) }, 'Sell half'),
        seedMax >= 1 && !lot.broke ? h('button', {
          class: 'btn', type: 'button', testid: `lot-seed-open-${lot.id}`, 'aria-expanded': String(!!seedOpen[lot.id]),
          onclick: () => { seedOpen[lot.id] = !seedOpen[lot.id]; ctx.dirty() },
        }, 'Hold back seed') : null),
      seedOpen[lot.id] && seedMax >= 1 && !lot.broke ? h('div', { class: 'seed-box' },
        h('div', { class: 'seed-row' },
          h('div', { class: 'stepper', role: 'group', 'aria-label': 'Fields of seed to hold back' },
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One field fewer', k: `seed-dn-${lot.id}`, disabled: n <= 1, onclick: () => { seedN[lot.id] = n - 1; ctx.dirty() } }, icon('back')),
            h('span', { class: 'num', 'aria-live': 'polite' }, F.plural(n, 'field')),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One field more', k: `seed-up-${lot.id}`, disabled: n >= seedMax, onclick: () => { seedN[lot.id] = n + 1; ctx.dirty() } }, icon('next'))),
          h('button', {
            class: 'btn primary', type: 'button', testid: `lot-seed-${lot.id}`,
            onclick: () => { if (ctx.run({ t: 'seed', lot: lot.id, fields: n }).ok) { seedOpen[lot.id] = false; ctx.say(`${F.mass(n * S.SEED_CWT_PER_FIELD)} of ${v.name} held back to plant ${F.plural(n, 'field')} next spring.`, 'good') } },
          }, `Hold back ${F.mass(n * S.SEED_CWT_PER_FIELD)}`)),
        h('p', { class: 'sub', testid: `seed-cost-${lot.id}` },
          `Held-back seed is free next spring (certified costs ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)} a field), but it carries this crop's virus and more every year it is saved, and any blight that went into the cellar comes back up in the field.`,
          grewWith !== undefined ? ` This crop grew from seed with about ${F.pct(grewWith)} virus; ${v.name} ${R.seedWord(v)}.` : '')) : null)
  }

  return {
    el,
    notes: notesSlot,
    update() {
      const c = app.campaign
      if (!c) return
      top.update()
      track.update()
      const lots = S.openLots(c)
      const st = S.storageInfo(c)
      const stored = st.stored
      const cap = st.capacity
      const last = c.month >= LAST || lots.length === 0
      const sales = c.lots.reduce((a, l) => a + l.revenue, 0)
      // What the close of the season did: the storage bill since the dig, the oats and clover, anything that would not fit.
      const closing = (c.season?.log ?? []).filter(e => e.type === 'stored' || e.type === 'rest' || e.type === 'overflow' || e.type === 'contractShort' || e.type === 'contractFilled').map(e => F.localize(e.text))
      const lines = c.month === 0 && !did.length ? closing : did
      // The year's storage bill shared out by how much each pile has held and for how long, so the cards add up to it.
      const weight = (l: S.Lot) => (S.lotCwt(l) + l.sold) * Math.max(0.2, (S.dayIndex(l.year, 10, 1) - l.dugDay) / 30 + l.months)
      const weights = c.lots.reduce((a, l) => a + weight(l), 0)
      const model = { m: c.month, lots, cash: c.cash, seedN, seedOpen, u: app.settings.units, lines, st: c.yearStorage, h: st.houses, k: c.contracts.map(k => [k.id, Math.round(k.delivered), k.settled]) }
      patch(sheet, JSON.stringify(model), () => [
        h('header', { class: 'sheet-head double' },
          h('h2', { class: 't-title' }, 'The cellar'),
          h('ol', { class: 'months', 'aria-label': 'Winter months' }, MONTH_SHORT.map((m, k) => h('li', { class: k === c.month ? 'now' : k < c.month ? 'past' : '', 'aria-current': k === c.month ? 'true' : undefined }, m)))),
        h('div', { class: 'cellar-sum' },
          h('p', null, h('span', { class: 't-label' }, 'In store'), h('strong', { class: 'num' }, F.mass(stored)), h('span', { class: 'sub num' }, `of ${F.mass(cap)}`)),
          h('p', null, h('span', { class: 't-label' }, 'Sold so far'), h('strong', { class: 'num' }, F.money(sales))),
          h('p', null, h('span', { class: 't-label' }, 'Storage so far'), h('strong', { class: 'num' }, F.money(c.yearStorage)))),
        houses(st),
        h('ul', { class: 'this-month', 'aria-label': c.month === 0 ? 'At the close of the season' : 'What the month did', testid: 'this-month' }, lines.slice(0, 5).map(t => h('li', null, t))),
        lots.length ? h('div', { class: 'lots' }, lots.map(l => lotCard(c, l, weights > 0 ? c.yearStorage * weight(l) / weights : 0)))
          : h('p', { class: 'empty' }, 'The cellar is empty. Nothing is left to sell from this crop.'),
        h('footer', { class: 'sheet-foot' },
          h('p', { class: 'sub' }, last
            ? lots.length ? 'May is the last month. Whatever is left is sold at May prices when the year closes.' : 'With the cellar empty, the year can close.'
            : 'Each month the storage bill comes, the piles shrink a little, and prices move.'),
          h('button', { class: 'btn primary big', type: 'button', testid: 'month-next', onclick: nextMonth },
            last ? (lots.length ? 'Sell the rest and close the year' : 'Close the year') : `Next month: ${S.CELLAR_MONTHS[c.month + 1]}`)),
      ] as Child)
      // After a month turns, the figures count from what they were.
      if (before && counted !== c.month) {
        counted = c.month
        for (const node of sheet.querySelectorAll<HTMLElement>('[data-lot]')) {
          const was = before.value[Number(node.dataset.lot)]
          const lot = lots.find(l => l.id === Number(node.dataset.lot))
          if (was !== undefined && lot) count(node, was, S.lotValue(app.world, c, lot), n => F.money(n))
        }
      }
    },
    insets() {
      const t = top.el.getBoundingClientRect().bottom
      const r = sheet.getBoundingClientRect()
      return ctx.layout() === 'narrow' ? [t, 0, innerHeight - r.top, 0] : [t, innerWidth - r.left, 0, 0]
    },
  }
}
