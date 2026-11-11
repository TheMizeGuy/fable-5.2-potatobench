import * as S from '../sim/index.ts'
import { meter, patch, type Ctx, type Screen } from './core.ts'
import { h, icon, s } from './dom.ts'
import * as F from './fmt.ts'
import { sheetLayout } from './plan.ts'

const MONTH_SHORT = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']

// Prices seen so far this winter, by crop year and variety, so the chart can draw the path the market took.
const seen = new Map<string, number[]>()

function priceChart(ctx: Ctx, c: S.Campaign, id: S.VarietyId): HTMLElement {
  const v = S.variety(id)
  const now = S.basePrice(ctx.app.world, c, id)
  const key = `${c.seed}:${c.year}:${id}`
  const path = seen.get(key) ?? []
  path[c.month] = now
  seen.set(key, path)
  const m0 = path.findIndex(p => p !== undefined)
  const usual = S.MONTH_CURVE.map(k => path[m0] * k / S.MONTH_CURVE[m0])
  const val = (p: number) => F.metric() ? p / 0.0453592 : p
  const known = path.map((p, m) => [m, p] as const).filter(([, p]) => p !== undefined)
  const lo = Math.min(...usual, ...known.map(k => k[1])) * 0.95, hi = Math.max(...usual, ...known.map(k => k[1])) * 1.04
  const W = 280, H = 96, padL = 34, padB = 18
  const x = (m: number) => padL + 12 + (m / 6) * (W - padL - 26)
  const y = (p: number) => 6 + (1 - (p - lo) / (hi - lo)) * (H - padB - 6)
  const line = (pts: (readonly [number, number])[]) => pts.map(([m, p], k) => `${k ? 'L' : 'M'}${x(m).toFixed(1)} ${y(p).toFixed(1)}`).join('')
  const ahead = usual.map((p, m) => [m, p] as const).filter(([m]) => m >= m0)
  const vsUsual = now / usual[c.month] - 1
  return h('figure', { class: 'price-chart' },
    s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${v.name}: ${F.price(now)} now. From ${S.CELLAR_MONTHS[m0]}'s price, a usual winter would reach ${F.price(usual[5])} by April.` },
      [lo + (hi - lo) * 0.12, lo + (hi - lo) * 0.88].map(p => [
        s('line', { class: 'grid', x1: padL, x2: W - 4, y1: y(p).toFixed(1), y2: y(p).toFixed(1) }),
        s('text', { class: 'axis', x: padL - 4, y: (y(p) + 3).toFixed(1), 'text-anchor': 'end' }, `$${F.num(val(p), F.metric() || hi - lo > 3 ? 0 : 1)}`),
      ]),
      MONTH_SHORT.map((m, k) => s('text', { class: `axis${k === c.month ? ' now' : ''}`, x: x(k).toFixed(1), y: H - 4, 'text-anchor': 'middle' }, m)),
      s('path', { class: 'usual', d: line(ahead) }),
      known.length > 1 ? s('path', { class: 'actual', d: line(known) }) : null,
      s('circle', { class: 'now-dot', cx: x(c.month).toFixed(1), cy: y(now).toFixed(1), r: 4.5 })),
    h('figcaption', null,
      h('strong', null, v.name), ` ${F.price(now)} now for US No. 1. `,
      h('span', { class: 'sub' }, `Dashed: a usual winter from ${S.CELLAR_MONTHS[m0]}'s price (USDA, 1979 to 2013)${c.month > m0 ? `; this one is running ${Math.abs(vsUsual) < 0.01 ? 'on it' : `${F.pct(Math.abs(vsUsual))} ${vsUsual > 0 ? 'above' : 'below'}`}` : ''}.`)))
}

export function cellarScreen(ctx: Ctx): Screen {
  const app = ctx.app
  const L = sheetLayout(ctx, 'cellar')
  const seedN: Record<number, number> = {}

  function lotCard(c: S.Campaign, lot: S.Lot): HTMLElement {
    const v = S.variety(lot.variety)
    const value = S.lotValue(app.world, c, lot)
    const cwt = S.lotCwt(lot)
    const seedMax = Math.floor((lot.grades.b + lot.grades.no1) / S.SEED_CWT_PER_FIELD)
    const n = Math.max(1, Math.min(seedMax, seedN[lot.id] ?? 1))
    const sell = (frac: number) => { const r = ctx.run({ t: 'sell', lot: lot.id, frac }); if (r.ok) ctx.dirty() }
    const rows: [string, number][] = [['US No. 1', lot.grades.no1], ['Large', lot.grades.chef], ['B size', lot.grades.b], ['US No. 2', lot.grades.no2], ['Thin-skinned', lot.skinned]]
    const monthsLeft = Math.max(0, Math.round(v.dormancy / 30) - lot.months)
    return h('article', { class: 'lot', 'aria-labelledby': `lot-h-${lot.id}` },
      h('header', { class: 'lot-head' },
        h('h3', { id: `lot-h-${lot.id}` }, `${v.name}`, h('span', { class: 'sub' }, ` from ${S.FIELD_NAMES[lot.field]}`)),
        h('span', { class: 'num lot-value', testid: `lot-value-${lot.id}` }, F.money(value))),
      h('p', { class: 'lot-flags' },
        h('span', null, lot.months ? `${F.plural(lot.months, 'month')} in store` : 'Just in'),
        lot.sprouted ? h('span', { class: 'warn-text' }, icon('sprout'), 'Sprouting: worth 15% less') : h('span', { class: 'sub' }, monthsLeft > 0 ? `sprouts in about ${F.plural(monthsLeft, 'month')}` : 'sprouting soon'),
        lot.broke ? h('span', { class: 'bad-text' }, icon('spot'), 'Rot ran through it') : null,
        lot.seedHeld ? h('span', null, `Seed held for ${F.plural(lot.seedHeld, 'field')}`) : null),
      h('table', { class: 'grades' },
        h('thead', null, h('tr', null, rows.filter(r => r[1] >= 0.5).map(r => h('th', { scope: 'col' }, r[0])), h('th', { scope: 'col' }, 'Total'))),
        h('tbody', null, h('tr', null, rows.filter(r => r[1] >= 0.5).map(r => h('td', { class: 'num' }, F.mass(r[1]))), h('td', { class: 'num strong' }, F.mass(cwt))))),
      h('div', { class: 'lot-actions' },
        h('div', { class: 'row-wrap' },
          h('button', { class: 'btn primary small', type: 'button', testid: `lot-sell-${lot.id}`, onclick: () => sell(1) }, `Sell all, ${F.money(value)}`),
          h('button', { class: 'btn small', type: 'button', testid: `lot-sell-half-${lot.id}`, onclick: () => sell(0.5) }, `Sell half, ${F.money(value / 2)}`),
          h('button', { class: 'btn small', type: 'button', testid: `lot-sell-quarter-${lot.id}`, onclick: () => sell(0.25) }, `A quarter, ${F.money(value / 4)}`)),
        seedMax >= 1 ? h('div', { class: 'seed-row' },
          h('span', { class: 'label' }, 'Seed for next spring'),
          h('div', { class: 'stepper', role: 'group', 'aria-label': 'Fields of seed to hold back' },
            h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'One field fewer', k: `seed-dn-${lot.id}`, disabled: n <= 1, onclick: () => { seedN[lot.id] = n - 1; ctx.dirty() } }, '−'),
            h('span', { class: 'num', 'aria-live': 'polite' }, F.plural(n, 'field')),
            h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'One field more', k: `seed-up-${lot.id}`, disabled: n >= seedMax, onclick: () => { seedN[lot.id] = n + 1; ctx.dirty() } }, '+')),
          h('button', {
            class: 'btn small', type: 'button', testid: `lot-seed-${lot.id}`,
            onclick: () => { const r = ctx.run({ t: 'seed', lot: lot.id, fields: n }); if (r.ok) ctx.toast(`${F.mass(n * S.SEED_CWT_PER_FIELD)} of ${v.name} held back to plant ${F.plural(n, 'field')} next spring.`, 'good') },
          }, `Hold back ${F.mass(n * S.SEED_CWT_PER_FIELD)}`)) : null))
  }

  return {
    el: L.el,
    update() {
      const c = app.campaign
      if (!c) return
      L.top.update()
      const lots = S.openLots(c)
      const varieties = [...new Set(lots.map(l => l.variety))]
      const stored = lots.reduce((a, l) => a + S.lotCwt(l), 0)
      const cap = S.cellarCapacity(c)
      const last = c.month >= S.MONTH_CURVE.length - 1 || lots.length === 0
      const sales = c.lots.reduce((a, l) => a + l.revenue, 0)
      const model = { m: c.month, lots, cash: c.cash, seedN, u: app.settings.units, hints: app.settings.hints }
      patch(L.sheet, JSON.stringify(model), () => [
        h('header', { class: 'sheet-head' },
          h('h2', null, `The cellar, ${S.CELLAR_MONTHS[c.month]}`),
          h('ol', { class: 'months', 'aria-label': 'Winter months' }, MONTH_SHORT.map((m, k) => h('li', { class: k === c.month ? 'now' : k < c.month ? 'past' : '', 'aria-current': k === c.month ? 'true' : undefined }, m)))),
        app.settings.hints ? h('p', { class: 'hint' },
          'Prices usually climb through the winter, but the pile shrinks a little every month, faster once it sprouts, and rot can run through a pile that went in with blight. Sell some, hold some.') : null,
        h('div', { class: 'cellar-summary' },
          h('div', { class: 'cellar-top' },
            h('div', { class: 'capacity' },
              h('span', { class: 'label' }, 'In store'),
              meter(stored / cap, { label: 'Cellar space used', text: `${F.mass(stored)} of ${F.mass(cap)}` }),
              h('span', { class: 'num' }, `${F.mass(stored)} of ${F.mass(cap)}`)),
            h('p', null, `Sold so far from the ${c.year} crop: `, h('strong', { class: 'num' }, F.money(sales)), '.'),
            h('p', { class: 'sub' }, `The cellar holds ${F.mass(cap)}${c.upgrades.vent ? ', with ventilation' : '; ventilation would let it hold more and keep better'}.`)),
          varieties.length ? h('div', { class: 'charts' }, varieties.map(id => priceChart(ctx, c, id))) : null),
        lots.length ? h('div', { class: 'lots' }, lots.map(l => lotCard(c, l))) : h('p', { class: 'empty' }, 'The cellar is empty. Nothing left to sell from this crop.'),
        h('footer', { class: 'sheet-foot' },
          h('p', { class: 'sub' }, last
            ? lots.length ? 'May is the last month. Whatever is left is sold at May prices when the year closes.' : 'With the cellar empty, the year can close.'
            : `Next month the pile shrinks a little and prices move.`),
          h('button', { class: 'btn primary big', type: 'button', testid: 'month-next', onclick: () => ctx.run({ t: 'month' }) },
            last ? (lots.length ? 'Sell the rest and close the year' : 'Close the year') : `On to ${S.CELLAR_MONTHS[c.month + 1]}`)),
      ])
    },
    insets: L.insets,
  }
}
