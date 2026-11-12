// Year end (design/ledger.html): the account book, open over the land. The money and the people on its left page,
// what the farm is worth, its crop beside the neighbor's, its cash and its goals on the right. The two occasions (the
// farm kept after five seasons, the farm lost) and the end are the same book: the years as rows, the cash at each
// year end as an ink line, what was built. On a phone the book shows one page at a time.
import * as S from '../sim/index.ts'
import { count, patch, type Ctx, type Screen } from './core.ts'
import { h, s, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { term } from './glossary.ts'
import { icon } from './icons.ts'
import { soilWord, varietyName, yearName, yearShort, yearSpan, yearWord } from './rules.ts'
import { goals, nextGoal } from '../game/goals.ts'
import { startNewFarm } from './title.ts'
import { openForeman } from './spring.ts'
import { topBar } from './top.ts'
import { fist, stamp } from './system/parts.ts'
import { portrait } from './system/people.ts'

const phoneLike = (ctx: Ctx) => ctx.layout() === 'narrow' || ctx.layout() === 'short'

// ---------------------------------------------------------------- the left page: the cash book

// A line of the cash book: money in on the left column, money out on the right, in red.
function cashLine(label: Child, v: number, o: { testid?: string; always?: boolean; none?: boolean } = {}): HTMLElement | null {
  if (!v && !o.always) return null
  const figure = o.none ? h('span', { class: 'it quiet' }, 'none') : F.num(Math.abs(Math.round(v)))
  return h('tr', { testid: o.testid },
    h('th', { scope: 'row' }, label),
    h('td', { class: 'm num' }, v >= 0 || o.none ? figure : null),
    h('td', { class: 'm num out' }, v < 0 && !o.none ? figure : null))
}

// The year in a sentence: what the farm began with, what it ends with, and why the one became the other.
// The three largest reasons are the simulation's (S.yearStory); land and buildings bought are named, since the farm keeps them.
export function yearSentence(y: S.YearSummary): string {
  const st = S.yearStory(y)
  const kept = (y.land ?? 0) + (y.building ?? 0) + (y.works ?? 0)
  const reasons = st.reasons.map(r => `${r.label.toLowerCase()} ${r.amount < 0 ? 'took' : 'brought'} ${F.money(Math.abs(Math.round(r.amount)))}`)
  const gap = Math.round(st.ended - st.began)
  const head = `You began the year with ${F.money(st.began)} and end it with ${F.money(st.ended)}: ${gap === 0 ? 'the same' : `${F.money(Math.abs(gap))} ${gap < 0 ? 'less' : 'more'}`}.`
  const keep = kept && gap < 0 ? ` Of what went out, ${F.money(kept)} bought land, buildings and clearing, which the farm keeps.` : ''
  return `${head} The largest reasons: ${reasons.join('; ')}.${keep}`
}

function cashBook(y: S.YearSummary, lost: boolean): HTMLElement {
  const rest = y.restIncome ?? 0
  const storage = y.storage ?? 0
  const contracts = y.contracts ?? 0
  const wages = y.wages ?? 0, rent = y.rent ?? 0, land = y.land ?? 0, penalties = y.penalties ?? 0
  const logs = y.logs ?? 0, stand = y.stand ?? 0, mortgage = y.mortgage ?? 0, works = y.works ?? 0, building = y.building ?? 0, packing = y.packing ?? 0
  const sold = y.cwtSold >= 0.5
  return h('table', { class: 'cashbook' },
    h('caption', { class: 'sr' }, `The money, ${yearWord(y.year)}`),
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, h('span', { class: 't-label' }, 'The money')),
      h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, 'In')),
      h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, 'Out')))),
    h('tbody', null,
      cashLine('Cash at the start', y.cashStart, { always: true }),
      cashLine(contracts ? 'Sold on the market' : sold ? `Potato sales, ${F.mass(y.cwtSold)}` : 'Potato sales', sold ? y.revenue - rest - contracts - logs - stand : 0, { always: true, none: !sold }),
      cashLine('Delivered on contract', contracts, { testid: 'ledger-contracts' }),
      cashLine('The farm stand', stand, { testid: 'ledger-stand' }),
      cashLine('Logs to the mill', logs, { testid: 'ledger-logs' }),
      cashLine('Oats and clover', rest),
      cashLine('Growing: seed, fields, work, equipment', -(y.costs - storage - wages - rent - land - penalties - mortgage - works - building - packing), { always: true }),
      cashLine('Wages', -wages, { testid: 'ledger-wages' }),
      cashLine('Rent', -rent, { testid: 'ledger-rent' }),
      cashLine('Land, the quarter down', -land, { testid: 'ledger-land' }),
      cashLine('The land mortgage', -mortgage, { testid: 'ledger-mortgage' }),
      cashLine('Buildings', -building, { testid: 'ledger-building' }),
      cashLine('Contractors', -works, { testid: 'ledger-works' }),
      cashLine('Packing', -packing, { testid: 'ledger-packing' }),
      cashLine('Contract penalties', -penalties, { testid: 'ledger-penalties' }),
      cashLine('Storage', -storage),
      cashLine([term('The note', 'the note'), y.note > 0 && !lost ? stamp('Paid', { ink: 'violet', small: true }) : null], -y.note, { always: true }),
      cashLine(term('The household', 'the household'), -y.living, { always: true }),
      cashLine('Interest on debt carried', -y.interest)),
    h('tfoot', null,
      h('tr', { class: 'total' }, h('td', null, 'Cash at year end'), h('td', { class: `m num${y.cashEnd < 0 ? ' c-red' : ''}`, colspan: 2, 'data-cash': '' }, F.money(y.cashEnd))),
      lost ? h('tr', { class: 'call' }, h('td', null, 'The bank calls the note below'), h('td', { class: 'm num', colspan: 2 }, F.money(S.CREDIT_LIMIT))) : null))
}

const SKILL_UP = /^(.*) is better at (.*): level (\d+)\.$/
const SOMEONE = /^(.*?) (is|has|takes) (.*)$/

interface Deed { who: string | null; text: string; icon?: string }

// What happened to the farm and its people this year, from the year's own record.
function yearDeeds(c: S.Campaign): Deed[] {
  const log = c.season?.log ?? []
  const out: Deed[] = []
  const FARM_ICON: Record<string, string> = { built: 'build', felled: 'fell', stumped: 'stump' }
  for (const e of log) {
    if (!['built', 'felled', 'stumped', 'quit', 'poached', 'dismissed', 'hurt', 'hired'].includes(e.type)) continue
    const text = F.localize(e.text.split('. ')[0].replace(/\.$/, '') + '.')
    const m = FARM_ICON[e.type] ? null : SOMEONE.exec(text)
    out.push(m ? { who: m[1], text: `${m[2]} ${m[3]}` } : { who: null, text, icon: FARM_ICON[e.type] })
  }
  const learned = new Map<string, Map<string, number>>()
  for (const e of log) {
    const m = e.type === 'skillUp' ? SKILL_UP.exec(e.text) : null
    if (!m) continue
    const who = m[1] === S.FARMER_NAME ? 'You' : m[1]
    if (!learned.has(who)) learned.set(who, new Map())
    learned.get(who)!.set(m[2], Math.max(Number(m[3]), learned.get(who)!.get(m[2]) ?? 0))
  }
  for (const [who, skills] of learned) out.push({ who, text: `got better at ${F.list([...skills].map(([k, n]) => `${k} (${n})`))}.` })
  return out
}

// The year on the farm: a line for each person, their portrait beside it, then what was built and cleared.
function yearOnFarm(c: S.Campaign): HTMLElement | null {
  const deeds = yearDeeds(c)
  const people = new Map<string, string[]>()
  for (const u of c.crew) if (u.kind !== 'farmer') people.set(u.name, [])
  for (const d of deeds) if (d.who) { if (!people.has(d.who)) people.set(d.who, []); people.get(d.who)!.push(d.text) }
  // Who is on the books now: the year's wages are not kept person by person.
  const paid = new Map(c.crew.filter(u => u.kind !== 'farmer').map(u => [u.name, `at ${F.money(S.payOf(u))} a month; ${u.winter === 'off' ? 'laid off for the winter' : 'kept on through the winter'}.`]))
  const farm = deeds.filter(d => !d.who)
  if (!deeds.length && !people.size) return null
  return h('section', { class: 'b-people', testid: deeds.length ? 'ledger-deeds' : undefined },
    h('div', { class: 'sec-h' }, h('h2', null, 'The year on the farm')),
    [...people].map(([who, lines]) => {
      const pay = paid.get(who)
      const said = [...lines, ...(pay ? [lines.length ? F.upper(pay) : pay] : [])].map((t, k) => k ? F.upper(t) : t).join(' ')
      return h('p', { class: 'ppl' }, portrait(who, 30), h('span', null, h('b', null, who), lines.length ? ` ${said}` : `, ${said}`))
    }),
    farm.map(d => h('p', { class: 'ppl' }, icon(d.icon ?? 'yard', 'i'), h('span', null, d.text))))
}

// ---------------------------------------------------------------- the right page

// What the farm owns beyond the home place under the note: the land bought, the machines, the buildings, less what is
// owed on the land. A second potato house at home is counted once, with the equipment.
function worth(c: S.Campaign): HTMLElement {
  const ids = Object.keys(S.UPGRADES) as S.UpgradeId[]
  const equip = ids.reduce((a, id) => a + (c.upgrades[id] ? S.UPGRADES[id].cost * 0.5 : 0), 0)
  let land = 0
  for (let i = S.HOME_FIELDS; i < S.FIELD_COUNT; i++) if (c.fields[i].tenure === 'owned') land += S.PARCELS[i].price * S.LAND_WORTH
  const standing = c.buildings.filter(b => b.built && !(b.kind === 'house' && b.yard === S.HOME_YARD))
  const built = standing.reduce((a, b) => a + S.BUILDINGS[b.kind].cash, 0)
  const owed = S.mortgageOwed(c)
  const total = S.netWorth(c) + built
  const line = (label: string, v: number) => h('p', { class: 'lead' }, h('span', null, label), h('span', { class: 'dots' }), h('span', { class: `num${v < 0 ? ' c-red' : ''}` }, F.money(v)))
  return h('section', { class: 'worth', testid: 'ledger-worth' },
    h('div', null, h('p', { class: 't-label' }, 'The farm is worth'), h('p', { class: `t-display num${total < 0 ? ' c-red' : ''}` }, F.money(total))),
    h('p', { class: 'it quiet b-worth-note' }, 'what it holds,', h('br'), 'less what is owed'),
    h('div', { class: 'lines' },
      land ? line('Land bought, at its price', land) : null,
      equip ? line('Equipment, at half what it cost', equip) : null,
      built ? line(`${F.plural(standing.length, 'building')}, at their cash cost`, built) : null,
      owed ? line('Owed on the land', -owed) : null,
      line('Cash', c.cash)))
}

// The crop beside the neighbor's, as bars in the printer's tints.
function crop(ctx: Ctx, y: S.YearSummary): HTMLElement {
  const nb = ctx.app.world.neighbor[String(y.year)]
  const head = h('div', { class: 'sec-h' }, h('h2', null, 'The crop'), h('span', { class: 't-caption' }, `${F.metric() ? 't a hectare' : 'cwt an acre'} sold, on the same weather`))
  if (!y.potatoFields) return h('section', { class: 'compare' }, head, h('p', { class: 'b-plain' }, `No potatoes were planted in ${yearWord(y.year)}, so there was no crop to sell.`))
  const rows: [string, number, string][] = [['Your farm', y.yieldCwtAcre, '']]
  if (nb) rows.push(['The neighbor', nb.yieldCwtAcre, ' n'])
  const max = Math.max(...rows.map(r => r[1]), 1) * 1.1
  return h('section', { class: 'compare' }, head,
    rows.map(([label, v, cls]) => h('p', null, h('span', null, label),
      h('span', { class: `cbar${cls}`, role: 'img', 'aria-label': `${label}: ${F.perArea(v)}` }, h('i', { style: `width:${(v / max * 100).toFixed(1)}%` })),
      h('b', { class: 'num' }, F.num(F.perAreaValue(v), F.metric() ? 1 : 0)))),
    h('p', { class: 't-caption' }, `${F.mass(y.cwtCulled)} culled.${nb ? ` The neighbor grew ${varietyName(nb.variety)}: planted ${F.date(y.year, nb.plant)}, sprayed ${F.plural(nb.sprays, 'time')}, dug from ${F.date(y.year, nb.dig)}.` : ''}`))
}

const kilo = (v: number) => v === 0 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v / 1000)}k`

// Cash at the start and at each year end, an ink line against the line the bank calls the note at. The book keeps
// nothing finer, so nothing finer is drawn.
function cashChart(c: S.Campaign): HTMLElement {
  const pts = [c.history[0].cashStart, ...c.history.map(y => y.cashEnd)]
  const step = 20000
  const lo = Math.floor((Math.min(S.CREDIT_LIMIT, ...pts) - 2000) / step) * step
  const hi = Math.ceil((Math.max(...pts, 0) + 2000) / step) * step
  const W = 440, H = 176, L = 46, Rt = 434, T = 10, B = H - 24
  const x = (k: number) => L + (k / Math.max(1, pts.length - 1)) * (Rt - L)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (B - T)
  const grid: number[] = []
  for (let v = hi; v >= lo; v -= step) grid.push(v)
  const label = (k: number) => k === 0 ? 'Start' : yearName(c.history[k - 1].year)
  return h('section', { class: 'chart' },
    h('div', { class: 'sec-h' }, h('h2', null, 'Cash at each year end')),
    s('svg', {
      viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': `Cash at the start, ${F.money(pts[0])}; then at each year end: ${c.history.map(z => `${yearWord(z.year)} ${F.money(z.cashEnd)}`).join(', ')}. The bank calls the note below ${F.money(S.CREDIT_LIMIT)}.`,
    },
    grid.map(v => [
      s('line', { class: v === 0 ? 'zero' : v === S.CREDIT_LIMIT ? 'ax' : 'grid-l', x1: L, x2: Rt, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }),
      s('text', { x: L - 6, y: (y(v) + 4).toFixed(1), 'text-anchor': 'end' }, kilo(v))]),
    s('text', { class: 'lab', x: L + 6, y: (y(S.CREDIT_LIMIT) + 16).toFixed(1), style: 'paint-order:stroke;stroke:var(--paper);stroke-width:4px' }, 'the bank calls the note below this line'),
    pts.map((_, k) => s('text', { x: x(k).toFixed(1), y: H - 4, 'text-anchor': k === 0 ? 'start' : k === pts.length - 1 ? 'end' : 'middle' }, label(k))),
    s('polyline', { class: 'ln', points: pts.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ') }),
    pts.map((v, k) => s('circle', { cx: x(k).toFixed(1), cy: y(v).toFixed(1), r: 3.5, style: `fill:var(${k === pts.length - 1 && v < 0 ? '--red' : '--ink'})` }))),
    h('p', { class: 't-caption' }, c.history.length > 1 ? 'The book keeps the cash at each year end, not month by month.' : 'The book keeps the cash at the start of the year and at its end, not month by month.'))
}

// The goals met so far, struck through in pencil.
function goalsMet(c: S.Campaign): HTMLElement | null {
  const met = goals(c).filter(g => g.done && !g.long)
  if (!met.length) return null
  const shown = met.slice(-4)
  return h('section', { class: 'b-goals' },
    h('div', { class: 'sec-h' }, h('h2', null, 'Goals met')),
    h('p', null, h('span', { class: 'struck' }, shown.map(g => g.title).join(' · ')),
      met.length > shown.length ? h('span', { class: 'quiet' }, `, and ${met.length - shown.length} before them`) : null))
}

// What next spring brings, in a few lines, and the soil it starts from.
function yearAhead(c: S.Campaign, y: S.YearSummary): HTMLElement {
  const tired = S.FIELD_NAMES.filter((_, i) => S.isField(c, i) && c.plans[i].crop === 'potato' && c.fields[i].streak >= 2)
  const standing = S.tractInfo(c).filter(t => t.tenure !== 'none' && t.stage !== 'done').map(t => t.name)
  const m = S.mortgageInfo(c)
  const lines = [
    `${S.APPLICANTS} people will ask for work, buyers will bring contracts, and land comes up to rent or buy.`,
    tired.length ? `${F.list(tired)} ${tired.length === 1 ? 'has' : 'have'} had two potato years running: the plan rests ${tired.length === 1 ? 'it' : 'them'}.` : '',
    standing.length ? `${F.list(standing)} still ${standing.length === 1 ? 'stands' : 'stand'} to be cleared into ${standing.length === 1 ? 'a field' : 'fields'}.` : '',
    m.owed > 0 ? `The land mortgage takes ${F.money(m.principal + m.interest)} at the next year end.` : '',
  ].filter(Boolean)
  const fields = Array.from({ length: S.FIELD_COUNT }, (_, i) => S.fieldInfo(c, i)).filter(f => f.tenure !== 'none' && f.cover === 'open')
  return h('section', { class: 'b-ahead', testid: 'year-ahead' },
    h('div', { class: 'sec-h' }, h('h2', null, 'The year ahead')),
    h('ul', { class: 'b-lines' }, lines.map(t => h('li', null, t))),
    h('p', { class: 't-label b-soil-h' }, `The soil going into ${yearWord(y.year + 1)}`),
    h('ul', { class: 'b-soil' }, fields.map(f => h('li', null,
      h('b', null, f.name), ' ', h('span', { class: f.soil < 0.4 ? 'c-ochre' : '' }, `soil ${soilWord(f.soil)}`),
      h('span', { class: `num${f.vert >= 0.15 ? ' c-ochre' : ' quiet'}` }, `, early dying ${F.pct(f.vert)}`)))),
    h('p', { class: 't-caption' }, 'Potatoes after potatoes wear the soil and build up ', term('early dying'), '. A rest year puts the soil back at once and wears it down slowly.'))
}

// ---------------------------------------------------------------- the occasions and the end

// Every year played, set against the neighbor's crop.
function yearsTable(ctx: Ctx, c: S.Campaign): HTMLElement {
  const world = ctx.app.world
  const cell = (x: number | null | undefined) => x != null ? F.num(F.perAreaValue(x), F.metric() ? 1 : 0) : '–'
  return h('section', { class: 'b-years' },
    h('div', { class: 'sec-h' }, h('h2', null, 'The farm year by year')),
    h('div', { class: 'b-years-wrap', tabindex: '0', role: 'group', 'aria-label': 'The farm year by year' },
      h('table', { class: 'cashbook years' },
        h('caption', { class: 'sr' }, 'The farm year by year'),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, h('span', { class: 't-label' }, 'Year')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, 'In')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, 'Out')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, 'Year end')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, 'Yield')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, 'Neighbor')))),
        h('tbody', null, c.history.map(y => h('tr', null,
          h('th', { scope: 'row' }, yearShort(y.year)),
          h('td', { class: 'm num' }, F.num(Math.round(y.revenue))),
          h('td', { class: 'm num out' }, F.num(Math.round(y.costs + y.note + y.living + y.interest))),
          h('td', { class: `m num${y.cashEnd < 0 ? ' c-red' : ''}` }, F.money(y.cashEnd)),
          h('td', { class: 'm num' }, y.potatoFields ? cell(y.yieldCwtAcre) : '–'),
          h('td', { class: 'm num' }, cell(world.neighbor[String(y.year)]?.yieldCwtAcre))))))),
    h('p', { class: 't-caption' }, `Yields in ${F.perAreaUnit()} sold. The neighbor is the farm next door, under ordinary good practice on the same weather.`))
}

// The farm as it stands: what was built up, for the sheets that close the game.
function farmBuilt(c: S.Campaign): HTMLElement | null {
  const held = S.FIELD_NAMES.filter((_, i) => S.isField(c, i)).length
  const cleared = S.TRACTS.filter(i => c.fields[i].tenure !== 'none' && c.fields[i].cover === 'open').length
  const standing = c.buildings.filter(b => b.built).map(b => S.BUILDINGS[b.kind].name.toLowerCase())
  const people = c.crew.filter(u => u.kind !== 'farmer').map(u => u.name)
  const machines = (Object.keys(S.UPGRADES) as S.UpgradeId[]).filter(id => c.upgrades[id] && id !== 'house2').map(id => S.UPGRADES[id].name.toLowerCase())
  const rows: [string, string, string][] = [
    ['field', 'Fields', `${held} worked${held > S.HOME_FIELDS ? `, ${held - S.HOME_FIELDS} beyond the home six` : ''}`],
    ...(cleared ? [['stump', 'Cleared', `${F.plural(cleared, 'tract')} of woods and brush made into fields`] as [string, string, string]] : []),
    ...(standing.length ? [['build', 'Built', F.upper(F.list(standing))] as [string, string, string]] : []),
    ...(people.length ? [['people', 'People', F.list(people)] as [string, string, string]] : []),
    ...(machines.length ? [['machine', 'Machines', F.upper(F.list(machines))] as [string, string, string]] : []),
  ]
  if (rows.length < 2) return null
  return h('section', { class: 'b-built', testid: 'farm-built' },
    h('div', { class: 'sec-h' }, h('h2', null, 'What you built')),
    h('dl', null, rows.map(([ic, k, v]) => h('div', null, h('dt', null, icon(ic, 'i'), h('span', { class: 't-label' }, k)), h('dd', null, v)))))
}

// The head of a closing book: the years, what became of the farm, its stamp, and the bank's last word.
function closingHead(c: S.Campaign, o: { won: boolean; testid?: string; outcome: string }): HTMLElement {
  return h('header', { class: 'book-head', testid: o.testid },
    h('p', { class: 't-label' }, yearSpan(c.startYear, c.year)),
    h('div', { class: 'b-title-row' },
      h('h1', { class: 't-title book-title' }, o.won ? 'The farm is yours' : 'The farm is sold'),
      o.won ? stamp('Kept', { ink: 'violet' }) : stamp('Called', { ink: 'red' })),
    h('p', { class: 'it b-verdict', testid: 'outcome' }, o.outcome))
}

// ---------------------------------------------------------------- the book

interface BookParts { tabs: [string, string]; left: Child; right: Child; foot: Child }

// The book over the land: two pages side by side on a desk, one at a time on a phone with the page names above to
// turn them, and the foot (the next goal, the way on) always in reach.
function bookLeaves(ctx: Ctx, book: HTMLElement, p: BookParts): Child {
  const turn = (k: number) => {
    const leaves = book.querySelector<HTMLElement>('.book-leaves')
    if (!leaves) return
    leaves.scrollTo({ left: k * leaves.clientWidth, behavior: ctx.reduced() ? 'auto' : 'smooth' })
    mark(k)
  }
  const mark = (k: number) => {
    book.querySelectorAll<HTMLElement>('.book-tabs .btn').forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)))
  }
  const onScroll = (e: Event) => {
    const x = e.currentTarget as HTMLElement
    if (x.clientWidth) mark(Math.round(x.scrollLeft / x.clientWidth))
  }
  return [
    h('div', { class: 'book-tabs seg', role: 'group', 'aria-label': 'Pages' },
      p.tabs.map((t, k) => h('button', { class: 'btn', type: 'button', k: `page-${k}`, 'aria-pressed': String(k === 0), onclick: () => turn(k) }, t))),
    h('div', { class: 'book-leaves', onscroll: onScroll },
      // Each page scrolls when it runs long, so each can take the keyboard's focus.
      h('div', { class: 'page-l', 'data-scroll': 'page-l', tabindex: '0', role: 'region', 'aria-label': p.tabs[0] }, p.left),
      h('div', { class: 'page-r' },
        h('div', { class: 'page-body', 'data-scroll': 'page-r', tabindex: '0', role: 'region', 'aria-label': p.tabs[1] }, p.right),
        h('footer', { class: 'book-next' }, p.foot))),
  ]
}

// The next goal at the foot of the book. One that can be taken here (naming a foreman) is a button to it; one that waits
// for spring says so, without the fist.
function nextGoalSlip(ctx: Ctx, c: S.Campaign): HTMLElement | null {
  const goal = nextGoal(c)
  if (!goal) return null
  const here = goal.id === 'foreman' && c.crew.some(u => u.kind !== 'farmer')
  const body = [here || goal.now ? fist() : null, h('span', null, h('span', { class: 'b-next-w' }, 'Next: '), h('b', null, goal.title),
    h('span', { class: 't-caption b-how' }, here ? `${goal.how} Name one now.` : goal.now ? goal.how : `${goal.how} ${goal.when}.`))]
  return here
    ? h('button', { class: 'next-goal sheet laid s-canary', type: 'button', testid: 'next-goal', onclick: () => openForeman(ctx) }, body)
    : h('p', { class: 'next-goal sheet laid s-canary', testid: 'next-goal' }, body)
}

function bookInsets(ctx: Ctx, top: HTMLElement, book: HTMLElement): [number, number, number, number] {
  const t = top.getBoundingClientRect().bottom
  // On a desk the land lies behind the open book, as in the frame; on a phone it shows above the page.
  return phoneLike(ctx) ? [t, 0, Math.max(0, innerHeight - book.getBoundingClientRect().top), 0] : [t, 0, 0, 0]
}

export function ledgerScreen(ctx: Ctx, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const book = h('section', { class: 'book ledger-sheet sys', 'aria-label': 'The year end' })
  const el = h('main', { class: 'ledger-screen' }, top.el, book)
  let counted = ''
  const screen: Screen = {
    el,
    update() {
      const c = app.campaign
      if (!c) return
      top.update()
      const y = c.history[c.history.length - 1]
      if (!y) return
      const layout = ctx.layout()
      book.dataset.layout = layout
      const kept = c.outcome === 'kept'
      const lost = c.outcome === 'lost'
      // The year the fifth season closes is the farm's own moment; after it the ledger is an ordinary one again.
      const won = kept && c.yearIdx + 1 === c.goalYears
      const left = c.goalYears - (c.yearIdx + 1)
      const more = app.world.weather.playable.includes(c.year + 1)
      const occasion = won || lost
      book.classList.toggle('occasion', occasion)
      book.classList.toggle('is-lost', lost)
      book.setAttribute('aria-label', occasion ? (won ? 'The farm is yours' : 'The farm is sold') : `The ledger, ${yearWord(y.year)}`)
      const closest = c.history.reduce((a, z) => z.cashEnd < a.cashEnd ? z : a, c.history[0])
      const goal = nextGoal(c)
      const key = JSON.stringify([c.year, c.history.length, c.outcome, app.settings.units, goal?.id, layout])
      const foot = [
        !lost ? nextGoalSlip(ctx, c) : null,
        kept ? h('button', { class: 'btn', type: 'button', testid: 'new-farm', onclick: () => startNewFarm(ctx) }, 'Start a new farm') : null,
        h('button', { class: 'btn go', type: 'button', testid: 'year-next', onclick: () => ctx.run({ t: 'next' }) },
          lost ? 'Close the book' : !more ? 'See how it ended' : won ? `Farm on: plan ${yearWord(y.year + 1)}` : `Plan ${yearWord(y.year + 1)}`, icon('arrow', 'i')),
      ]
      patch(book, key, () => {
        if (occasion) {
          return bookLeaves(ctx, book, {
            tabs: [won ? 'Five seasons' : 'The years', `The ledger, ${yearWord(y.year)}`],
            left: [
              closingHead(c, {
                won, testid: won ? 'kept-moment' : 'lost-moment',
                outcome: won ? `Five seasons, and the bank is paid every one of them. You finish with ${F.money(y.cashEnd)}.`
                  : `The bank has called the note. After ${F.plural(c.history.length, 'season')} the land, the house and the potato house go to auction.`,
              }),
              cashChart(c),
              c.history.length > 1 ? h('p', { class: 'b-plain' }, won
                ? `${yearName(closest.year)} was the nearest thing: ${closest.cashEnd < 0 ? `${F.money(-closest.cashEnd)} in debt` : `${F.money(closest.cashEnd)} in hand`}, with the bank's line at ${F.money(S.CREDIT_LIMIT)}.`
                : `The line at ${F.money(S.CREDIT_LIMIT)} is where the bank calls the note.`) : null,
              yearsTable(ctx, c),
            ],
            right: [
              farmBuilt(c),
              h('div', { class: 'sec-h' }, h('h2', null, `The ledger, ${yearWord(y.year)}`)),
              cashBook(y, lost),
              won ? yearAhead(c, y) : null,
            ],
            foot,
          })
        }
        return bookLeaves(ctx, book, {
          tabs: ['The money', 'The farm'],
          left: [
            h('header', { class: 'book-head' },
              h('p', { class: 't-label' }, `Year ${c.yearIdx + 1} of ${c.goalYears}`),
              h('h1', { class: 't-title book-title' }, `The ledger, ${yearWord(y.year)}`),
              h('p', { class: 'it b-verdict', testid: 'outcome' }, kept ? 'The farm is yours, and the bank is satisfied.' : `The bank is satisfied. ${F.upper(F.plural(left, 'season'))} to go.`),
              h('p', { class: 'b-plain', testid: 'year-sentence' }, yearSentence(y))),
            cashBook(y, false),
            y.cashEnd < 0 ? h('p', { class: 'b-debt' }, h('b', { class: 'c-red' }, 'In debt,'), ` inside the bank's limit: it calls the note only below `, h('span', { class: 'num nowrap' }, F.money(S.CREDIT_LIMIT)), '.') : null,
            yearOnFarm(c),
            yearAhead(c, y),
          ],
          right: [worth(c), crop(ctx, y), cashChart(c), goalsMet(c)],
          foot,
        })
      })
      // The year-end figure counts up once, when the book first opens.
      const year = `${c.year}:${c.history.length}`
      if (counted !== year && book.isConnected) {
        counted = year
        const total = book.querySelector<HTMLElement>('[data-cash]')
        if (total && !occasion) count(total, y.cashStart, y.cashEnd, n => F.money(n))
      }
    },
    insets: () => bookInsets(ctx, top.el, book),
  }
  // Drawn at once, so the way on is there the moment the last screen's is gone.
  screen.update()
  return screen
}

export function overScreen(ctx: Ctx, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const book = h('section', { class: 'book ledger-sheet occasion sys', 'aria-label': 'The end' })
  const el = h('main', { class: 'ledger-screen' }, top.el, book)
  const screen: Screen = {
    el,
    update() {
      const c = app.campaign
      if (!c) return
      top.update()
      const layout = ctx.layout()
      book.dataset.layout = layout
      const lost = c.outcome === 'lost'
      book.classList.toggle('is-lost', lost)
      const last = c.history[c.history.length - 1]
      const years = c.history.length
      patch(book, JSON.stringify([c.history.length, c.outcome, app.settings.units, layout]), () => bookLeaves(ctx, book, {
        tabs: ['The years', lost && last ? `The last year, ${yearWord(last.year)}` : 'What you built'],
        left: [
          closingHead(c, {
            won: !lost,
            outcome: lost
              ? `After ${F.plural(years, 'season')} the bank called the note. The land, the house and the potato house went at auction${last ? ` with the farm ${F.money(-last.cashEnd)} in debt` : ''}.`
              : `You kept the farm through ${F.plural(years, 'season')}${last ? `, and finished with ${F.money(last.cashEnd)}` : ''}. This is as far as the farm's years go.`,
          }),
          years ? cashChart(c) : null,
          years ? yearsTable(ctx, c) : null,
        ],
        right: [
          farmBuilt(c),
          last && lost ? [h('div', { class: 'sec-h' }, h('h2', null, `The last year, ${yearWord(last.year)}`)), cashBook(last, true)] : null,
        ],
        foot: [
          h('button', { class: 'btn', type: 'button', testid: 'over-title', onclick: () => app.quitToTitle() }, 'Back to the title'),
          h('button', { class: 'btn go', type: 'button', testid: 'new-farm', onclick: () => startNewFarm(ctx) }, 'Start a new farm', icon('arrow', 'i')),
        ],
      }))
    },
    insets: () => bookInsets(ctx, top.el, book),
  }
  // Drawn at once, so the way on is there the moment the last screen's is gone.
  screen.update()
  return screen
}
