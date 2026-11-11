import * as S from '../sim/index.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { sheetLayout, soilWord } from './plan.ts'
import { varietyName } from './rules.ts'
import { openNewFarm } from './title.ts'

function yieldBars(ctx: Ctx, y: S.YearSummary): HTMLElement {
  const rec = ctx.app.world.records[y.year]
  const nb = ctx.app.world.neighbor[y.year]
  const rows: [string, number, string][] = [['Your farm', y.yieldCwtAcre, 'you']]
  if (rec?.yieldCwtAcre != null) rows.push(['Maine average (USDA)', rec.yieldCwtAcre, 'usda'])
  if (nb) rows.push([`The neighbor (${varietyName(nb.variety)})`, nb.yieldCwtAcre, 'nb'])
  const max = Math.max(...rows.map(r => r[1]), 1) * 1.1
  return h('table', { class: 'yield-bars' },
    h('caption', { class: 'visually-hidden' }, 'Yield sold per acre'),
    h('tbody', null, rows.map(([label, v, cls]) => h('tr', { class: cls },
      h('th', { scope: 'row' }, label),
      h('td', { class: 'wbar-cell' }, h('span', { class: 'wbar' }, h('span', { class: 'wbar-fill', style: `width:${(v / max * 100).toFixed(1)}%` }))),
      h('td', { class: 'num' }, F.perArea(v))))))
}

// Every year played, set against USDA's record for Maine and the neighbor's crop.
function historyTable(ctx: Ctx, c: S.Campaign): HTMLElement[] {
  const world = ctx.app.world
  const cell = (x: number | null | undefined) => x != null ? F.num(F.perAreaValue(x)) : '–'
  return [
    h('table', { class: 'history-table' },
      h('caption', { class: 'visually-hidden' }, 'The farm year by year'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, 'Year'), h('th', { scope: 'col' }, 'Income'), h('th', { scope: 'col' }, 'Costs'), h('th', { scope: 'col' }, 'Cash at year end'),
        h('th', { scope: 'col' }, 'Your yield'), h('th', { scope: 'col' }, 'Maine'), h('th', { scope: 'col' }, 'Neighbor'))),
      h('tbody', null, c.history.map(y => h('tr', null,
        h('th', { scope: 'row' }, String(y.year)),
        h('td', { class: 'num' }, F.money(y.revenue)),
        h('td', { class: 'num' }, F.money(y.costs + y.note + y.living + y.interest)),
        h('td', { class: `num${y.cashEnd < 0 ? ' neg' : ''}` }, F.money(y.cashEnd)),
        h('td', { class: 'num' }, y.potatoFields ? F.num(F.perAreaValue(y.yieldCwtAcre)) : '–'),
        h('td', { class: 'num' }, cell(world.records[y.year]?.yieldCwtAcre)),
        h('td', { class: 'num' }, cell(world.neighbor[y.year]?.yieldCwtAcre)))))),
    h('p', { class: 'sub' }, `Yields are in ${F.perAreaUnit()} sold. Income is potato sales with the oats and clover. Costs include growing, storage, the note, the household and interest. Maine is USDA's recorded state average for the year; the neighbor is the farm next door under ordinary good practice.`),
  ]
}

export function ledgerScreen(ctx: Ctx): Screen {
  const app = ctx.app
  const L = sheetLayout(ctx, 'ledger')
  return {
    el: L.el,
    update() {
      const c = app.campaign
      if (!c) return
      L.top.update()
      const y = c.history[c.history.length - 1]
      if (!y) return
      const note = app.world.notes[y.year]
      const rec = app.world.records[y.year]
      const nb = app.world.neighbor[y.year]
      const kept = c.outcome === 'kept'
      const lost = c.outcome === 'lost'
      // The year the fifth season closes is the farm's own moment; after it the ledger is an ordinary one again.
      const won = kept && c.yearIdx + 1 === c.goalYears
      const left = c.goalYears - (c.yearIdx + 1)
      const more = app.world.weather.playable.includes(c.year + 1)
      const rest = y.restIncome ?? 0
      const storage = y.storage ?? 0
      patch(L.sheet, JSON.stringify([c.year, c.history.length, c.outcome, app.settings.units]), () => [
        h('header', { class: 'sheet-head' },
          h('h2', null, `The ${y.year} ledger`),
          h('p', { class: `verdict ${lost ? 'bad-text' : kept ? 'good-text' : ''}`, testid: 'outcome' },
            lost ? 'The bank has called the note. The farm goes to auction.'
              : won ? 'Five seasons, and the farm is still yours.'
                : kept ? 'The farm is yours, and the bank is satisfied.'
                  : `The bank is satisfied. The farm carries on: ${F.plural(left, 'season')} to go.`)),
        won ? h('section', { class: 'card kept', testid: 'kept-moment' },
          h('h3', { class: 'kept-title' }, `Five seasons, ${c.startYear} to ${c.year}`),
          h('p', { class: 'kept-line' }, `You kept the farm through all five and finished with ${F.money(y.cashEnd)}. Here is how each year went, beside what Maine grew and what the neighbor dug.`),
          historyTable(ctx, c)) : null,
        h('div', { class: 'ledger-cols' },
          h('section', { class: 'card' },
            h('h3', null, 'Money'),
            h('table', { class: 'ledger-table' },
              h('tbody', null,
                h('tr', null, h('th', { scope: 'row' }, 'Cash at the start'), h('td', { class: 'num' }, F.money(y.cashStart))),
                h('tr', null, h('th', { scope: 'row' }, `Potato sales (${F.mass(y.cwtSold)})`), h('td', { class: 'num' }, F.money(y.revenue - rest))),
                h('tr', null, h('th', { scope: 'row' }, 'Oats and clover from the rest fields'), h('td', { class: 'num' }, F.money(rest))),
                h('tr', null, h('th', { scope: 'row' }, 'Growing: seed, fields, work and equipment'), h('td', { class: 'num' }, F.money(-(y.costs - storage)))),
                h('tr', null, h('th', { scope: 'row' }, 'Storage: the cellar bills'), h('td', { class: 'num' }, F.money(-storage))),
                h('tr', null, h('th', { scope: 'row' }, 'The note'), h('td', { class: 'num' }, F.money(-y.note))),
                h('tr', null, h('th', { scope: 'row' }, 'The household'), h('td', { class: 'num' }, F.money(-y.living))),
                h('tr', null, h('th', { scope: 'row' }, 'Interest'), h('td', { class: 'num' }, F.money(-y.interest))),
                h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Cash at year end'), h('td', { class: `num${y.cashEnd < 0 ? ' neg' : ''}` }, F.money(y.cashEnd))))),
            h('p', { class: 'sub' }, `Interest is ${F.pct(S.CREDIT_RATE)} on debt carried past the year end, after the note and the household are paid.${y.interest ? '' : ' There was none to carry this year.'}`),
            y.cashEnd < 0 && !lost ? h('p', { class: 'warn-text' }, `In debt. The bank calls the note below ${F.money(S.CREDIT_LIMIT)}.`) : null),
          h('section', { class: 'card' },
            h('h3', null, 'The crop'),
            y.potatoFields ? yieldBars(ctx, y) : h('p', null, 'No potatoes were grown this year.'),
            h('p', { class: 'sub' }, `Sold per acre of potatoes. ${F.mass(y.cwtCulled)} culled.`),
            rec?.priceUsdCwt != null ? h('p', { class: 'sub' }, `USDA recorded a Maine price of ${F.price(rec.priceUsdCwt)} in ${y.year}, in that year's dollars. The game's prices are in constant dollars.`) : null,
            nb ? h('p', { class: 'sub' }, `From the road, the neighbor planted ${F.date(y.year, nb.plant)}, sprayed ${F.plural(nb.sprays, 'time')} and dug from ${F.date(y.year, nb.dig)}.`) : null,
            note ? h('p', { class: 'note' }, note) : null)),
        h('section', { class: 'card' },
          h('h3', null, 'The soil now'),
          h('table', { class: 'soil-table' },
            h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Field'), h('th', { scope: 'col' }, 'Soil'), h('th', { scope: 'col' }, 'Potato years running'), h('th', { scope: 'col' }, 'Early dying'))),
            h('tbody', null, Array.from({ length: S.FIELD_COUNT }, (_, i) => S.fieldInfo(c, i)).map(f => h('tr', null,
              h('th', { scope: 'row' }, f.name),
              h('td', { class: f.soil < 0.4 ? 'warn-text' : '' }, soilWord(f.soil)),
              h('td', { class: 'num' }, String(f.streak)),
              h('td', { class: `num${f.vert >= 0.15 ? ' warn-text' : ''}` }, F.pct(f.vert)))))),
          h('p', { class: 'sub' }, 'Potatoes after potatoes wear the soil and build up early dying, the share of plants that go down a third early. A rest year puts the soil back at once and wears early dying down slowly, by about a quarter; each potato crop more than doubles it.')),
        h('footer', { class: 'sheet-foot' },
          h('button', { class: `btn big${won ? '' : ' primary'}`, type: 'button', testid: 'year-next', onclick: () => ctx.run({ t: 'next' }) },
            lost || !more ? 'See how it ended' : won ? `Farm on: plan ${y.year + 1}` : `Plan ${y.year + 1}`),
          kept ? h('button', { class: 'btn big', type: 'button', testid: 'new-farm', onclick: () => openNewFarm(ctx) }, 'Start a new farm') : null),
      ])
    },
    insets: L.insets,
  }
}

export function overScreen(ctx: Ctx): Screen {
  const app = ctx.app
  const L = sheetLayout(ctx, 'over')
  return {
    el: L.el,
    update() {
      const c = app.campaign
      if (!c) return
      L.top.update()
      const lost = c.outcome === 'lost'
      const last = c.history[c.history.length - 1]
      const years = c.history.length
      patch(L.sheet, JSON.stringify([c.history.length, c.outcome, app.settings.units]), () => [
        h('header', { class: 'sheet-head' },
          h('h2', null, lost ? 'The farm is sold' : 'The farm is yours'),
          h('p', { class: `verdict ${lost ? 'bad-text' : 'good-text'}`, testid: 'outcome' }, lost
            ? `After ${F.plural(years, 'season')} the bank called the note. The land, the house and the potato house went at auction${last ? ` with the farm ${F.money(-last.cashEnd)} in debt` : ''}.`
            : `You kept the farm through ${F.plural(years, 'season')}, ${c.startYear} to ${c.year}${last ? `, and finished with ${F.money(last.cashEnd)}` : ''}. The weather record ends here.`)),
        historyTable(ctx, c),
        h('footer', { class: 'sheet-foot' },
          h('button', { class: 'btn primary big', type: 'button', testid: 'new-farm', onclick: () => openNewFarm(ctx) }, 'New farm'),
          h('button', { class: 'btn big', type: 'button', testid: 'over-title', onclick: () => app.quitToTitle() }, 'Back to the title')),
      ])
    },
    insets: L.insets,
  }
}
