// Winter (design/winter.html): one sheet over the land. The winter's work on its left, the crop in store on its right,
// and the months turning one at a time from its foot.
import * as S from '../sim/index.ts'
import { deals, deliver, versusMarket } from './contracts.ts'
import { count, patch, type Ctx, type Screen } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { GLOSSARY, term } from './glossary.ts'
import { icon } from './icons.ts'
import * as R from './rules.ts'
import { meter } from './system/parts.ts'
import { topBar } from './top.ts'
import { winterWork } from './winter.ts'
import { priceBand } from './store-band.ts'

const LAST = S.MONTH_CURVE.length - 1

interface Before { month: number; cash: number; storage: number; cwt: number; value: Record<number, number>; price: Record<string, number> }

// The potato houses filling: one meter for what is in store, each house beside it with what it holds.
function houses(st: S.StorageInfo): HTMLElement {
  const share = st.capacity > 0 ? Math.min(1, st.stored / st.capacity) : 0
  const over = st.stored > st.capacity + 0.5
  return h('div', { class: 'c-houses', testid: 'houses' },
    h('p', { class: 'lead' }, h('span', { class: 't-label' }, 'In store'), h('span', { class: 'dots' }),
      h('b', { class: 'num' }, F.mass(st.stored)), h('span', { class: 'quiet num' }, `of ${F.mass(st.capacity)}`)),
    meter(share, { label: 'In store', text: `${F.mass(st.stored)} of ${F.mass(st.capacity)}`, kind: over ? 'warn' : undefined }),
    h('ul', { class: 'c-house-list' }, st.houses.map(x => h('li', null, icon('store', 'i'), h('span', null, x.name), h('span', { class: 'num quiet' }, F.mass(x.cwt))))),
    over ? h('p', { class: 'c-ochre' }, `${F.mass(st.stored - st.capacity)} more than the houses hold.`) : null)
}

export function cellarScreen(ctx: Ctx, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const sheet = h('section', { class: 'winter cellar-sheet sheet sys', 'aria-labelledby': 'winter-h' })
  const notesSlot = h('div', { class: 'notes-slot' })
  const el = h('main', { class: 'cellar-screen' }, h('div', { class: 'veil' }), top.el, notesSlot, sheet)
  const seedOpen: Record<number, boolean> = {}
  const seedN: Record<number, number> = {}
  // What the last turn of the month did, in the player's own figures.
  let did: string[] = []
  let before: Before | null = null
  let counted = -1
  let raise = false

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
      ...r.events.filter(e => ['sprout', 'breakdown', 'contractShort', 'contractFilled', 'felled', 'built', 'skillUp', 'winterIdle'].includes(e.type)).map(e => F.localize(e.text)),
    ].filter(Boolean)
    ctx.announce(`${S.CELLAR_MONTHS[c.month]}. ${did.join(' ')}`)
  }

  // A pile in store: what it is worth now and which way its price is heading, and what can be done with it.
  function lotCard(c: S.Campaign, lot: S.Lot, storageSoFar: number): HTMLElement {
    const v = S.variety(lot.variety)
    const value = S.lotValue(app.world, c, lot)
    const seedMax = Math.floor((lot.grades.b + lot.grades.no1) / S.SEED_CWT_PER_FIELD)
    const n = Math.max(1, Math.min(seedMax, seedN[lot.id] ?? 1))
    const sell = (frac: number) => { ctx.run({ t: 'sell', lot: lot.id, frac }) }
    const m = R.sproutMonth(lot.year, lot.dugDay, lot.variety, c.upgrades.vent)
    // Kept another month, or to the best month ahead: what it would bring after the charge, shrink and sprouting.
    const o = S.storeOutlook(app.world, c, lot)
    const nx = o.months[0]
    const gain = nx ? nx.net - value : 0
    // The usual curve is a guess: a month's price can wander a tenth from it, so a move inside that is called flat.
    const spread = nx ? Math.round((nx.net * priceBand(1)) / 10) * 10 : 0
    const heading: [string, string] = !nx ? ['flat', 'May is the last month: what is left is sold at its end']
      : [gain > spread ? 'up' : gain < -spread ? 'fall' : 'flat', `Kept to ${nx.name}: usually about ${F.money(nx.net)}, give or take ${F.money(spread)}; ${Math.abs(gain) < 0.5 ? 'the same as selling now' : `${F.money(Math.abs(gain))} ${gain > 0 ? 'more' : 'less'} than selling now`}${o.best && o.best !== nx && o.best.net > Math.max(value, nx.net) + Math.max(25, value * 0.01) ? `; ${o.best.name} is usually the best, about ${F.money(o.best.net)}` : ''}`]
    const grewWith = c.season?.fields[lot.field]?.seedVirus
    const rent = Math.round(S.lotCwt(lot) * S.STORE_COST)
    const deal = deals(app.world, c, lot)[0]
    const canSeed = seedMax >= 1 && !lot.broke
    return h('article', { class: 'lot', 'aria-labelledby': `lot-h-${lot.id}`, k: `lot-${lot.id}` },
      h('header', { class: 'lot-head' },
        h('h3', { id: `lot-h-${lot.id}` }, S.FIELD_NAMES[lot.field]),
        h('span', { class: 'lot-value num', testid: `lot-value-${lot.id}`, 'data-lot': lot.id, title: ctx.touch() ? undefined : 'What selling it today pays' }, F.money(value))),
      h('p', { class: 'lot-sub quiet' }, `${v.name} · ${F.mass(S.lotCwt(lot))}${lot.seedHeld ? ` · seed held for ${F.plural(lot.seedHeld, 'field')}` : ''}`,
        h('span', { class: 'num' }, ` · ${F.price(S.basePrice(app.world, c, lot.variety))} for No. 1`)),
      h('ul', { class: 'lot-facts' },
        h('li', null, icon(heading[0], 'i'), h('span', null, heading[1])),
        lot.sprouted ? h('li', { class: 'c-ochre' }, icon('sprout', 'i'), h('span', null, 'Sprouting: worth 15% less, and shrinking faster'))
          : h('li', null, icon('sprout', 'i'), h('span', null, m > c.month ? F.upper(R.sproutText(m)) : 'Sprouting soon')),
        lot.broke ? h('li', { class: 'c-red' }, icon('blight', 'i'), h('span', null, 'Rot ran through it')) : null,
        lot.packed > 0.005 ? h('li', { testid: `lot-packed-${lot.id}` }, icon('box', 'i'), h('span', null, `${F.pct(lot.packed)} of its No. 1 and B size packed: No. 1 ${F.pct(S.PACK_NO1)} more, B size ${F.pct(S.PACK_B)} of the No. 1 price`)) : null,
        h('li', null, icon('store', 'i'), h('span', null, `Storage ${F.money(rent)} a month; about ${F.money(storageSoFar)} so far`))),
      deal ? h('p', { class: 'lot-deal' }, `${deal.k.buyer} takes ${F.mass(deal.take)} of No. 1 at ${F.price(deal.k.price)}: ${versusMarket(deal)}.`) : null,
      h('div', { class: 'lot-actions' },
        deal ? h('button', { class: 'btn', type: 'button', testid: `lot-deliver-${lot.id}`, onclick: () => deliver(ctx, lot, deal) },
          icon('deliver', 'i'), `Deliver to ${deal.k.buyer.replace(/^The /, 'the ')}`, h('span', { class: 'sub num' }, F.money(deal.pays))) : null,
        h('button', { class: 'btn', type: 'button', testid: `lot-sell-${lot.id}`, onclick: () => sell(1) }, icon('sell', 'i'), 'Sell', h('span', { class: 'sub num' }, F.money(value))),
        h('button', { class: 'btn', type: 'button', testid: `lot-sell-half-${lot.id}`, onclick: () => sell(0.5) }, 'Sell half'),
        canSeed ? h('button', {
          class: 'btn', type: 'button', testid: `lot-seed-open-${lot.id}`, title: ctx.touch() ? undefined : GLOSSARY['hold back seed'], 'aria-expanded': String(!!seedOpen[lot.id]), 'aria-controls': seedOpen[lot.id] ? `seed-${lot.id}` : undefined,
          onclick: () => { seedOpen[lot.id] = !seedOpen[lot.id]; ctx.dirty() },
        }, 'Hold back seed') : null),
      seedOpen[lot.id] && canSeed ? h('div', { class: 'seed-box', id: `seed-${lot.id}` },
        h('div', { class: 'seed-row' },
          h('div', { class: 'stepper', role: 'group', 'aria-label': 'Fields of seed to hold back' },
            h('button', { class: 'btn', type: 'button', 'aria-label': 'One field fewer', k: `seed-dn-${lot.id}`, disabled: n <= 1, onclick: () => { seedN[lot.id] = n - 1; ctx.dirty() } }, icon('back', 'i')),
            h('span', { class: 'num', 'aria-live': 'polite' }, F.plural(n, 'field')),
            h('button', { class: 'btn', type: 'button', 'aria-label': 'One field more', k: `seed-up-${lot.id}`, disabled: n >= seedMax, onclick: () => { seedN[lot.id] = n + 1; ctx.dirty() } }, icon('next', 'i'))),
          // .primary marks the answer for the checks that read the sheet; inside .sys it draws as a plain box.
          h('button', {
            class: 'btn primary', type: 'button', testid: `lot-seed-${lot.id}`,
            onclick: () => { if (ctx.run({ t: 'seed', lot: lot.id, fields: n }).ok) { seedOpen[lot.id] = false; ctx.say(`${F.mass(n * S.SEED_CWT_PER_FIELD)} of ${v.name} held back to plant ${F.plural(n, 'field')} next spring.`, 'good') } },
          }, `Hold back ${F.mass(n * S.SEED_CWT_PER_FIELD)}`)),
        h('p', { class: 't-caption', testid: `seed-cost-${lot.id}` },
          `Held-back seed is free next spring (certified costs ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)} a field), but it carries this crop's virus and more every year it is saved, and any blight that went into the cellar comes back up in the field.`,
          grewWith !== undefined ? ` This crop grew from seed with about ${F.pct(grewWith)} virus; ${v.name} ${R.seedWord(v)}.` : '')) : null)
  }

  const screen: Screen = {
    el,
    notes: notesSlot,
    update() {
      const c = app.campaign
      if (!c) return
      top.update()
      const layout = ctx.layout()
      sheet.dataset.layout = layout
      notesSlot.classList.toggle('top-left', layout === 'narrow' || layout === 'short')
      const lots = S.openLots(c)
      const st = S.storageInfo(c)
      const last = c.month >= LAST || lots.length === 0
      const sales = c.lots.reduce((a, l) => a + l.revenue, 0)
      // What the close of the season did: the storage bill since the dig, the oats and clover, anything that would not fit.
      const closing = (c.season?.log ?? []).filter(e => e.type === 'stored' || e.type === 'rest' || e.type === 'overflow' || e.type === 'contractShort' || e.type === 'contractFilled').map(e => F.localize(e.text))
      const lines = c.month === 0 && !did.length ? closing : did
      // The year's storage bill shared out by how much each pile has held and for how long, so the cards add up to it.
      const weight = (l: S.Lot) => (S.lotCwt(l) + l.sold) * Math.max(0.2, (S.dayIndex(l.year, 10, 1) - l.dugDay) / 30 + l.months)
      const weights = c.lots.reduce((a, l) => a + weight(l), 0)
      const model = {
        m: c.month, lots, cash: c.cash, seedN, seedOpen, u: app.settings.units, lines, st: c.yearStorage, h: st.houses, k: c.contracts.map(k => [k.id, Math.round(k.delivered), k.settled]),
        w: c.crew.map(u => [u.id, u.winter, u.winterField, u.wage]), logs: Math.round(c.logs * 10), stone: Math.round(c.stone * 10), b: c.buildings.map(b => [b.kind, b.yard, Math.round(b.done * 10)]),
        mo: c.mortgages.map(x => Math.round(x.owed)), f: c.fields.map(f => [f.cover, Math.round(f.felled)]), raise,
      }
      const wages = S.winterInfo(c).monthly
      const month = S.CELLAR_MONTHS[c.month]
      patch(sheet, JSON.stringify(model), () => [
        h('header', { class: 'winter-head' },
          h('div', null,
            h('p', { class: 't-label' }, `${month} · ${R.yearName(c.year)} · `, term('The cellar months', 'the cellar months')),
            h('h2', { class: 't-title', id: 'winter-h' }, 'The winter\'s work')),
          h('p', { class: 'num w-wages' }, wages ? [h('b', null, F.money(wages)), ' a month in wages'] : 'Nobody paid this winter')),
        h('div', { class: `w-body${c.crew.length <= 1 ? ' few' : ''}`, 'data-scroll': 'winter' },
          winterWork(ctx, c, raise, () => { raise = !raise; ctx.dirty() }, [
            lines.length ? h('div', { class: 'sec-h' }, h('h2', null, c.month === 0 && !did.length ? 'At the close of the season' : `What ${S.CELLAR_MONTHS[Math.max(0, c.month - 1)]} did`)) : null,
            h('ul', { class: 'c-month', testid: 'this-month' }, lines.slice(0, 6).map(t => h('li', null, t)))]),
          h('section', { class: 'w-cellar', 'aria-labelledby': 'cellar-h' },
            h('div', { class: 'sec-h' }, h('h2', { id: 'cellar-h' }, 'The crop in store'),
              h('span', { class: 't-caption num' }, `sold ${F.money(sales)} · storage ${F.money(c.yearStorage)} so far`)),
            houses(st),
            // Said once where the button stands, for every lot that has one.
            lots.some(l => !l.broke && Math.floor((l.grades.b + l.grades.no1) / S.SEED_CWT_PER_FIELD) >= 1)
              ? h('p', { class: 't-caption c-seed-note', testid: 'seed-explained' }, term('Hold back seed', 'hold back seed'), `: keep some of a lot as next spring's seed. It is free to plant, where certified seed costs ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)} a field, but it carries this crop's virus.`)
              : null,
            lots.length ? h('div', { class: 'lots' }, lots.map(l => lotCard(c, l, weights > 0 ? c.yearStorage * weight(l) / weights : 0)))
              : h('p', { class: 'quiet c-empty' }, 'The cellar is empty. Nothing is left to sell from this crop.'))),
        h('footer', { class: 'winter-next' },
          h('p', { class: 't-caption' }, last
            ? lots.length ? 'May is the last month. Whatever is left is sold at May prices when the year closes.' : 'With the cellar empty, the year can close.'
            : `Each month the storage bill comes${wages ? `, ${F.money(wages)} of wages is paid` : ''}, the piles shrink a little, and prices move.`),
          h('button', { class: 'btn go', type: 'button', testid: 'month-next', onclick: nextMonth },
            last ? (lots.length ? 'Sell the rest and close the year' : 'Close the year') : `On to ${S.CELLAR_MONTHS[c.month + 1]}`, icon('arrow', 'i'))),
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
      // On a phone the sheet is the lower part of the screen and the land shows above it; on a desk the land lies
      // behind the sheet, as in the frame.
      const layout = ctx.layout()
      if (layout !== 'narrow' && layout !== 'short') return [t, 0, 0, 0]
      return [t, 0, Math.max(0, innerHeight - sheet.getBoundingClientRect().top), 0]
    },
  }
  // Drawn at once, so the way on is there the moment the last screen's is gone.
  screen.update()
  return screen
}
