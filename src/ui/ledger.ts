// Year end: one sheet. And the two occasions: the farm kept after five seasons, and the farm lost.
import * as S from '../sim/index.ts'
import { count, patch, type Ctx, type Screen } from './core.ts'
import { h, s, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { soilWord, varietyName, yearName, yearShort, yearSpan, yearWord } from './rules.ts'
import { nextGoal } from '../game/goals.ts'
import { startNewFarm } from './title.ts'
import { topBar } from './top.ts'

function yieldBars(ctx: Ctx, y: S.YearSummary): HTMLElement {
  const nb = ctx.app.world.neighbor[String(y.year)]
  const rows: [string, number, string][] = [['Your farm', y.yieldCwtAcre, 'you']]
  if (nb) rows.push([`The neighbor, ${varietyName(nb.variety)}`, nb.yieldCwtAcre, 'nb'])
  const max = Math.max(...rows.map(r => r[1]), 1) * 1.1
  return h('table', { class: 'yield-bars' },
    h('caption', { class: 'sr' }, 'Yield sold per acre'),
    h('tbody', null, rows.map(([label, v, cls]) => h('tr', { class: cls },
      h('th', { scope: 'row' }, label),
      h('td', { class: 'bar-cell' }, h('span', { class: 'gauge' }, h('i', { style: `width:${(v / max * 100).toFixed(1)}%` }))),
      h('td', null, F.perArea(v))))))
}

function moneyTable(y: S.YearSummary, lost: boolean, c?: S.Campaign): HTMLElement {
  const rest = y.restIncome ?? 0
  const storage = y.storage ?? 0
  const contracts = y.contracts ?? 0
  const wages = y.wages ?? 0, rent = y.rent ?? 0, land = y.land ?? 0, penalties = y.penalties ?? 0
  const logs = y.logs ?? 0, stand = y.stand ?? 0, mortgage = y.mortgage ?? 0, works = y.works ?? 0, building = y.building ?? 0, packing = y.packing ?? 0
  const line = (label: string, v: number, testid?: string, sub?: string) => v ? h('tr', { testid }, h('th', { scope: 'row' }, label, sub ? h('span', { class: 'sub' }, ` ${sub}`) : null), h('td', null, F.money(v))) : null
  // Who is on the books now, for the wages line: the year's wages are not kept person by person.
  const paid = c ? c.crew.filter(u => u.kind !== 'farmer').map(u => `${u.name.split(' ')[0]} ${F.money(S.payOf(u))}`) : []
  return h('table', { class: 'money' },
    h('tbody', null,
      h('tr', null, h('th', { scope: 'row' }, 'Cash at the start'), h('td', null, F.money(y.cashStart))),
      h('tr', null, h('th', { scope: 'row' }, contracts ? 'Sold on the market' : y.cwtSold >= 0.5 ? `Potato sales, ${F.mass(y.cwtSold)}` : 'Potato sales'), h('td', null, y.cwtSold >= 0.5 ? F.money(y.revenue - rest - contracts - logs - stand) : 'none')),
      line('Delivered on contract', contracts, 'ledger-contracts'),
      line('The farm stand', stand, 'ledger-stand'),
      line('Logs to the mill', logs, 'ledger-logs'),
      rest ? h('tr', null, h('th', { scope: 'row' }, 'Oats and clover'), h('td', null, F.money(rest))) : null,
      h('tr', null, h('th', { scope: 'row' }, 'Growing: seed, fields, work, equipment'), h('td', null, F.money(-(y.costs - storage - wages - rent - land - penalties - mortgage - works - building - packing)))),
      line('Wages', -wages, 'ledger-wages', paid.length ? `now ${F.list(paid)} a month` : ''),
      line('Rent', -rent, 'ledger-rent'),
      line('Land, the quarter down', -land, 'ledger-land'),
      line('The land mortgage', -mortgage, 'ledger-mortgage', 'principal and interest'),
      line('Buildings', -building, 'ledger-building', 'cash and materials bought'),
      line('Contractors', -works, 'ledger-works', 'stumps and tile'),
      line('Packing', -packing, 'ledger-packing'),
      line('Contract penalties', -penalties, 'ledger-penalties'),
      storage ? h('tr', null, h('th', { scope: 'row' }, 'Storage'), h('td', null, F.money(-storage))) : null,
      h('tr', null, h('th', { scope: 'row' }, 'The note'), h('td', null, F.money(-y.note))),
      h('tr', null, h('th', { scope: 'row' }, 'The household'), h('td', null, F.money(-y.living))),
      y.interest ? h('tr', null, h('th', { scope: 'row' }, `Interest, ${F.pct(S.CREDIT_RATE)} on debt carried`), h('td', null, F.money(-y.interest))) : null,
      h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Cash at year end'), h('td', { class: y.cashEnd < 0 ? 'neg' : '' }, F.money(y.cashEnd))),
      lost ? h('tr', { class: 'call' }, h('th', { scope: 'row' }, 'The bank calls the note below'), h('td', null, F.money(S.CREDIT_LIMIT))) : null))
}

// What the farm owns beyond the home place under the note: the land bought, the machines, the buildings, less what is
// owed on the land. A second potato house at home is counted once, with the equipment.
function worthTable(c: S.Campaign): HTMLElement {
  const ids = Object.keys(S.UPGRADES) as S.UpgradeId[]
  const equip = ids.reduce((a, id) => a + (c.upgrades[id] ? S.UPGRADES[id].cost * 0.5 : 0), 0)
  let land = 0
  for (let i = S.HOME_FIELDS; i < S.FIELD_COUNT; i++) if (c.fields[i].tenure === 'owned') land += S.PARCELS[i].price * S.LAND_WORTH
  const standing = c.buildings.filter(b => b.built && !(b.kind === 'house' && b.yard === S.HOME_YARD))
  const built = standing.reduce((a, b) => a + S.BUILDINGS[b.kind].cash, 0)
  const owed = S.mortgageOwed(c)
  const r = (label: string, v: number, cls = '') => h('tr', { class: cls || null }, h('th', { scope: 'row' }, label), h('td', { class: v < 0 && cls === 'total' ? 'neg' : null }, F.money(v)))
  return h('table', { class: 'money', testid: 'ledger-worth' },
    h('tbody', null,
      r('Cash', c.cash),
      land ? r('Land bought, at its price', land) : null,
      equip ? r('Equipment, at half what it cost', equip) : null,
      built ? r(`${F.plural(standing.length, 'building')}, at their cash cost`, built) : null,
      owed ? r('Owed on the land', -owed) : null,
      r('What the farm is worth', S.netWorth(c) + built, 'total')))
}

// What next spring brings, in a few lines; the step up the ladder stands in the sheet's foot.
function yearAhead(c: S.Campaign): HTMLElement | null {
  const tired = S.FIELD_NAMES.filter((_, i) => S.isField(c, i) && c.plans[i].crop === 'potato' && c.fields[i].streak >= 2)
  const standing = S.tractInfo(c).filter(t => t.tenure !== 'none' && t.stage !== 'done').map(t => t.name)
  const m = S.mortgageInfo(c)
  const lines = [
    `${S.APPLICANTS} people will ask for work, buyers will bring contracts, and land comes up to rent or buy.`,
    tired.length ? `${F.list(tired)} ${tired.length === 1 ? 'has' : 'have'} had two potato years running: the plan rests ${tired.length === 1 ? 'it' : 'them'}.` : '',
    standing.length ? `${F.list(standing)} still ${standing.length === 1 ? 'stands' : 'stand'} to be cleared into ${standing.length === 1 ? 'a field' : 'fields'}.` : '',
    m.owed > 0 ? `The land mortgage takes ${F.money(m.principal + m.interest)} at the next year end.` : '',
  ].filter(Boolean)
  return h('section', { class: 'ahead', testid: 'year-ahead' },
    h('h3', { class: 'block-head' }, 'The year ahead'),
    h('ul', { class: 'deeds' }, lines.map(t => h('li', null, t))))
}

const SKILL_UP = /^(.*) is better at (.*): level (\d+)\.$/

// What happened to the farm and its people this year, from the year's own record.
function yearDeeds(c: S.Campaign): string[] {
  const log = c.season?.log ?? []
  const out: string[] = []
  for (const e of log) if (['built', 'felled', 'stumped', 'quit', 'poached', 'dismissed', 'hurt', 'hired'].includes(e.type)) out.push(F.localize(e.text.split('. ')[0].replace(/\.$/, '') + '.'))
  const learned = new Map<string, Map<string, number>>()
  for (const e of log) {
    const m = e.type === 'skillUp' ? SKILL_UP.exec(e.text) : null
    if (!m) continue
    const who = m[1] === S.FARMER_NAME ? 'You' : m[1]
    if (!learned.has(who)) learned.set(who, new Map())
    learned.get(who)!.set(m[2], Math.max(Number(m[3]), learned.get(who)!.get(m[2]) ?? 0))
  }
  for (const [who, skills] of learned) out.push(`${who} got better at ${F.list([...skills].map(([k, n]) => `${k} (${n})`))}.`)
  return out
}

// The farm as it stands: what was built up, for the sheets that close the game.
function farmBuilt(c: S.Campaign): HTMLElement | null {
  const held = S.FIELD_NAMES.filter((_, i) => S.isField(c, i)).length
  const cleared = S.TRACTS.filter(i => c.fields[i].tenure !== 'none' && c.fields[i].cover === 'open').length
  const standing = c.buildings.filter(b => b.built).map(b => S.BUILDINGS[b.kind].name.toLowerCase())
  const people = c.crew.filter(u => u.kind !== 'farmer').map(u => u.name)
  const machines = (Object.keys(S.UPGRADES) as S.UpgradeId[]).filter(id => c.upgrades[id] && id !== 'house2').map(id => S.UPGRADES[id].name.toLowerCase())
  const rows: [string, string][] = [
    ['Fields', `${held} worked${held > S.HOME_FIELDS ? `, ${held - S.HOME_FIELDS} beyond the home six` : ''}`],
    ...(cleared ? [['Cleared', `${F.plural(cleared, 'tract')} of woods and brush made into fields`] as [string, string]] : []),
    ...(standing.length ? [['Built', F.upper(F.list(standing))] as [string, string]] : []),
    ...(people.length ? [['People', F.list(people)] as [string, string]] : []),
    ...(machines.length ? [['Machines', F.upper(F.list(machines))] as [string, string]] : []),
  ]
  if (rows.length < 2) return null
  return h('section', { class: 'built', testid: 'farm-built' },
    h('h3', { class: 'block-head' }, 'What you built'),
    h('dl', { class: 'built-facts' }, rows.map(([k, v]) => h('div', null, h('dt', { class: 't-label' }, k), h('dd', null, v)))))
}

// Cash at each year end against the line the bank calls the note at.
function cashLine(c: S.Campaign): SVGElement {
  const pts = [c.history[0].cashStart, ...c.history.map(y => y.cashEnd)]
  const lo = Math.min(S.CREDIT_LIMIT, ...pts) - 4000, hi = Math.max(...pts, 0) + 4000
  const W = 520, H = 150, L = 8, Rt = 28
  const x = (k: number) => L + (k / (pts.length - 1)) * (W - L - Rt)
  const y = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (H - 34)
  const d = pts.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join('')
  return s('svg', {
    class: 'cash-line', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Cash at each year end: ${c.history.map(z => `${yearWord(z.year)} ${F.money(z.cashEnd)}`).join(', ')}. The bank calls the note below ${F.money(S.CREDIT_LIMIT)}.`,
  },
  s('path', { class: 'cl-zero', d: `M${L} ${y(0).toFixed(1)}H${W - Rt}` }),
  s('text', { class: 'cl-label', x: L, y: (y(0) - 4).toFixed(1) }, F.money(0)),
  s('path', { class: 'cl-call', d: `M${L} ${y(S.CREDIT_LIMIT).toFixed(1)}H${W - Rt}` }),
  s('text', { class: 'cl-label call', x: L, y: (y(S.CREDIT_LIMIT) - 4).toFixed(1) }, `${F.money(S.CREDIT_LIMIT)}: the bank calls the note`),
  s('path', { class: 'cl-path', d, pathLength: 1 }),
  pts.map((v, k) => k ? s('rect', { class: `cl-dot${v < 0 ? ' neg' : ''}`, x: (x(k) - 3).toFixed(1), y: (y(v) - 3).toFixed(1), width: 6, height: 6 }) : null),
  c.history.map((z, k) => s('text', { class: 'cl-year', x: x(k + 1).toFixed(1), y: H - 6 }, yearShort(z.year))))
}

// Every year played, set against the neighbor's crop.
function historyTable(ctx: Ctx, c: S.Campaign, write: boolean): HTMLElement[] {
  const world = ctx.app.world
  const cell = (x: number | null | undefined) => x != null ? F.num(F.perAreaValue(x), F.metric() ? 1 : 0) : '–'
  return [
    h('div', { class: 'table-wrap', tabindex: '0', role: 'group', 'aria-label': 'The farm year by year' }, h('table', { class: `money history${write ? ' write' : ''}` },
      h('caption', { class: 'sr' }, 'The farm year by year'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, 'Year'), h('th', { scope: 'col' }, 'Came in'), h('th', { scope: 'col' }, 'Went out'), h('th', { scope: 'col' }, 'Year end'),
        h('th', { scope: 'col' }, 'Yield'), h('th', { scope: 'col' }, 'Neighbor'))),
      h('tbody', null, c.history.map((y, k) => h('tr', { style: `--n:${k}` },
        h('th', { scope: 'row' }, yearShort(y.year)),
        h('td', null, F.money(y.revenue)),
        h('td', null, F.money(y.costs + y.note + y.living + y.interest)),
        h('td', { class: y.cashEnd < 0 ? 'neg' : '' }, F.money(y.cashEnd)),
        h('td', null, y.potatoFields ? cell(y.yieldCwtAcre) : '–'),
        h('td', null, cell(world.neighbor[String(y.year)]?.yieldCwtAcre))))))),
    h('p', { class: 'sub' }, `Yields in ${F.perAreaUnit()} sold. The neighbor is the farm next door, under ordinary good practice on the same weather.`),
  ]
}

// The year's own sheet: what came in, what went out, where the farm stands.
function yearSheet(ctx: Ctx, c: S.Campaign, y: S.YearSummary, lost: boolean): Child {
  const app = ctx.app
  const nb = app.world.neighbor[String(y.year)]
  const deeds = lost ? [] : yearDeeds(c)
  const grown = c.crew.length > 1 || c.buildings.length > 0 || c.mortgages.length > 0 || S.TRACTS.some(i => c.fields[i].cover !== S.PARCELS[i].cover) || Object.values(c.upgrades).some(Boolean)
  return [
    h('div', { class: 'ledger-cols' },
      h('section', null,
        h('h3', { class: 'block-head' }, 'The money'),
        moneyTable(y, lost, c),
        y.cashEnd < 0 && !lost ? h('p', { class: 'warn-text' }, `In debt. The bank calls the note below ${F.money(S.CREDIT_LIMIT)}.`) : null),
      h('section', null,
        h('h3', { class: 'block-head' }, 'The crop'),
        y.potatoFields ? [yieldBars(ctx, y), h('p', { class: 'sub' }, `Sold per acre of potatoes. ${F.mass(y.cwtCulled)} culled.`)]
          : h('p', null, `No potatoes were planted in ${yearWord(y.year)}, so there was no crop to sell.`),
        nb ? h('p', { class: 'sub' }, `From the road, the neighbor planted ${F.date(y.year, nb.plant)}, sprayed ${F.plural(nb.sprays, 'time')} and dug from ${F.date(y.year, nb.dig)}.`) : null,
      )),
    deeds.length ? h('section', { testid: 'ledger-deeds' },
      h('h3', { class: 'block-head' }, 'The year on the farm'),
      h('ul', { class: 'deeds' }, deeds.map(t => h('li', null, t)))) : null,
    grown && !lost ? h('section', null,
      h('h3', { class: 'block-head' }, 'What the farm is worth'),
      worthTable(c)) : null,
    h('section', null,
      h('h3', { class: 'block-head' }, `The soil going into ${yearWord(y.year + 1)}`),
      h('ul', { class: 'soil' }, Array.from({ length: S.FIELD_COUNT }, (_, i) => S.fieldInfo(c, i)).filter(f => f.tenure !== 'none' && f.cover === 'open').map(f => h('li', { class: f.soil < 0.4 ? 'worn' : '' },
        h('strong', null, f.name),
        h('span', { class: f.soil < 0.4 ? 'warn-text' : '' }, `soil ${soilWord(f.soil)}`),
        h('span', { class: `sub${f.vert >= 0.15 ? ' warn-text' : ''}` }, `early dying ${F.pct(f.vert)}`)))),
      h('p', { class: 'sub' }, 'Potatoes after potatoes wear the soil and build up early dying. A rest year puts the soil back at once and wears early dying down slowly.')),
    lost ? null : yearAhead(c),
  ]
}

export function ledgerScreen(ctx: Ctx, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const sheet = h('section', { class: 'paper sheet ledger-sheet', 'aria-label': 'The year end', 'data-scroll': 'sheet' })
  const el = h('main', { class: 'sheet-screen ledger' }, top.el, sheet)
  let staged = ''
  return {
    el,
    update() {
      const c = app.campaign
      if (!c) return
      top.update()
      const y = c.history[c.history.length - 1]
      if (!y) return
      const kept = c.outcome === 'kept'
      const lost = c.outcome === 'lost'
      // The year the fifth season closes is the farm's own moment; after it the ledger is an ordinary one again.
      const won = kept && c.yearIdx + 1 === c.goalYears
      const left = c.goalYears - (c.yearIdx + 1)
      const more = app.world.weather.playable.includes(c.year + 1)
      const occasion = won || lost
      el.classList.toggle('occasion', occasion)
      el.classList.toggle('is-lost', lost)
      const closest = c.history.reduce((a, z) => z.cashEnd < a.cashEnd ? z : a, c.history[0])
      const goal = nextGoal(c)
      const key = JSON.stringify([c.year, c.history.length, c.outcome, app.settings.units, goal?.id])
      patch(sheet, key, () => [
        occasion ? h('header', { class: 'occasion-head', testid: won ? 'kept-moment' : 'lost-moment' },
          h('span', { class: 't-label' }, yearSpan(c.startYear, c.year)),
          h('h2', { class: 't-display' }, won ? 'The farm is yours' : 'The farm is sold'),
          h('p', { class: 't-lede', testid: 'outcome' }, won
            ? `Five seasons, and the bank is paid every one of them. You finish with ${F.money(y.cashEnd)}.`
            : `The bank has called the note. After ${F.plural(c.history.length, 'season')} the land, the house and the potato house go to auction.`),
          c.history.length > 1 ? [
            cashLine(c),
            h('p', { class: 'sub' }, won
              ? `Cash at each year end. ${yearName(closest.year)} was the nearest thing: ${closest.cashEnd < 0 ? `${F.money(-closest.cashEnd)} in debt` : `${F.money(closest.cashEnd)} in hand`}, with the bank's line at ${F.money(S.CREDIT_LIMIT)}.`
              : `Cash at each year end, and the line at ${F.money(S.CREDIT_LIMIT)} where the bank calls the note.`),
            historyTable(ctx, c, true),
          ] : null) : h('header', { class: 'sheet-head double' },
          h('h2', { class: 't-title' }, `The ledger, ${yearWord(y.year)}`),
          h('p', { class: 't-lede', testid: 'outcome' }, kept ? 'The farm is yours, and the bank is satisfied.'
            : `The bank is satisfied. ${F.upper(F.plural(left, 'season'))} to go.`)),
        occasion ? farmBuilt(c) : null,
        occasion ? h('h3', { class: 't-title year-title' }, `The ledger, ${yearWord(y.year)}`) : null,
        yearSheet(ctx, c, y, lost),
        h('footer', { class: 'sheet-foot' },
          // A year closes on the next thing worth reaching for.
          !lost && goal ? h('p', { class: 'next-goal', testid: 'next-goal' }, h('span', { class: 't-label' }, 'Next'), h('strong', null, goal.title), h('span', { class: 'sub' }, goal.how)) : null,
          kept ? h('button', { class: 'btn big', type: 'button', testid: 'new-farm', onclick: () => startNewFarm(ctx) }, 'Start a new farm') : null,
          h('button', { class: 'btn big primary', type: 'button', testid: 'year-next', onclick: () => ctx.run({ t: 'next' }) },
            lost ? 'Close the book' : !more ? 'See how it ended' : won ? `Farm on: plan ${yearWord(y.year + 1)}` : `Plan ${yearWord(y.year + 1)}`)),
      ])
      // The year-end figure counts up once, when the sheet first arrives.
      if (staged !== key) {
        staged = key
        const total = sheet.querySelector<HTMLElement>('.money .total td')
        if (total && !occasion) count(total, y.cashStart, y.cashEnd, n => F.money(n))
      }
    },
    insets() {
      const t = top.el.getBoundingClientRect().bottom
      const r = sheet.getBoundingClientRect()
      if (el.classList.contains('occasion')) return [t, 0, 0, 0]
      return ctx.layout() === 'narrow' ? [t, 0, innerHeight - r.top, 0] : [t, innerWidth - r.left, 0, 0]
    },
  }
}

export function overScreen(ctx: Ctx, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const sheet = h('section', { class: 'paper sheet ledger-sheet', 'aria-label': 'The end', 'data-scroll': 'sheet' })
  const el = h('main', { class: 'sheet-screen ledger occasion' }, top.el, sheet)
  return {
    el,
    update() {
      const c = app.campaign
      if (!c) return
      top.update()
      const lost = c.outcome === 'lost'
      el.classList.toggle('is-lost', lost)
      const last = c.history[c.history.length - 1]
      const years = c.history.length
      patch(sheet, JSON.stringify([c.history.length, c.outcome, app.settings.units]), () => [
        h('header', { class: 'occasion-head' },
          h('span', { class: 't-label' }, yearSpan(c.startYear, c.year)),
          h('h2', { class: 't-display' }, lost ? 'The farm is sold' : 'The farm is yours'),
          h('p', { class: 't-lede', testid: 'outcome' }, lost
            ? `After ${F.plural(years, 'season')} the bank called the note. The land, the house and the potato house went at auction${last ? ` with the farm ${F.money(-last.cashEnd)} in debt` : ''}.`
            : `You kept the farm through ${F.plural(years, 'season')}${last ? `, and finished with ${F.money(last.cashEnd)}` : ''}. This is as far as the farm's years go.`),
          years > 1 ? cashLine(c) : null,
          farmBuilt(c),
          historyTable(ctx, c, false),
          last && lost ? [h('h3', { class: 'block-head' }, `The last year, ${yearWord(last.year)}`), moneyTable(last, true)] : null),
        h('footer', { class: 'sheet-foot' },
          h('button', { class: 'btn big', type: 'button', testid: 'over-title', onclick: () => app.quitToTitle() }, 'Back to the title'),
          h('button', { class: 'btn primary big', type: 'button', testid: 'new-farm', onclick: () => startNewFarm(ctx) }, 'Start a new farm')),
      ])
    },
    insets() {
      return [top.el.getBoundingClientRect().bottom, 0, 0, 0]
    },
  }
}
