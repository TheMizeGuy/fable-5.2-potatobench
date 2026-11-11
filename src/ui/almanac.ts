// The almanac: the depth nobody needs to play. The forecast in full, the blight watch, every reading, the diary, the prices.
import * as S from '../sim/index.ts'
import { gauge, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { doing } from './crew.ts'
import { BLOCK_NAME, heldFields, roadTime } from './map.ts'
import * as R from './rules.ts'

type Page = 'forecast' | 'blight' | 'fields' | 'farm' | 'diary' | 'prices'
const PAGES: [Page, string][] = [['forecast', 'Forecast'], ['blight', 'Blight watch'], ['fields', 'Fields'], ['farm', 'Land and crews'], ['diary', 'Diary'], ['prices', 'Prices']]

function forecastPage(ctx: Ctx, c: S.Campaign): Child {
  const t = S.today(ctx.app.world, c)
  if (!t) return null
  const fc = S.forecast(ctx.app.world, c, 5)
  const d = t.day
  const range = (x: number, sd: number) => `${F.degrees(x - sd)}–${F.degrees(x + sd)}`
  // A forecast amount is a guess: it is shown rounded and labelled as about.
  const about = (mm: number) => mm <= 0 ? 'none' : F.metric() ? `about ${Math.round(mm)} mm` : mm / 25.4 < 0.05 ? 'a trace' : `about ${F.num(mm / 25.4, 1)} in`
  return [
    h('div', { class: 'almanac-today' },
      icon(t.sky, 'ic l'),
      h('div', null,
        h('p', { class: 't-head' }, `${R.SKY_WORD[t.sky]} today`),
        h('p', { class: 'num' }, `High ${F.temp(d.tmax)}, low ${F.temp(d.tmin)}. Rain ${F.rain(d.prcp)}. Soil ${F.temp(t.soilT)} on the mid slope, a degree colder on the bottom land and warmer on the ridge.`))),
    h('div', { class: 'table-wrap', tabindex: '0', role: 'group', 'aria-label': 'The next five days' }, h('table', { class: 'money forecast-table' },
      h('caption', { class: 'sr' }, 'The next five days'),
      h('thead', null, h('tr', null, ['Day', `High, ${F.tempUnit()}`, `Low, ${F.tempUnit()}`, 'Rain', 'How much', 'Blight weather', 'Frost'].map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', null, fc.map(x => h('tr', null,
        h('th', { scope: 'row' }, `${F.weekday(c.year, x.day, true)} ${F.dayOfMonth(c.year, x.day)}`),
        h('td', null, range(x.hi, x.spread)),
        h('td', null, range(x.lo, x.spread)),
        h('td', { class: x.rainChance >= 60 ? 'cold-text' : '' }, `${x.rainChance}%`),
        h('td', null, about(x.rainMm)),
        h('td', { class: x.blight >= 2 ? 'bad-text' : '' }, R.BLIGHT_RISK[x.blight]),
        h('td', { class: x.frostChance >= 30 ? 'cold-text' : '' }, `${x.frostChance}%`)))))),
    h('p', { class: 'sub' }, 'Highs and lows are ranges, and they widen with each day ahead. Rain is a chance, and the forecast can be wrong both ways. The frost chance is for the coldest field, down on the bottom land.'),
  ]
}

function blightPage(ctx: Ctx, c: S.Campaign): Child {
  const s0 = c.season!
  const t = S.today(ctx.app.world, c)
  const start = S.dayIndex(c.year, S.SV_START.month, S.SV_START.dom)
  const on = s0.watchDay >= 0
  const leaf = s0.fields.some(f => f.status === 'growing')
  return [
    s0.day < start
      ? h('p', { class: 't-lede' }, `Severity values start counting on ${F.date(c.year, start)}.`)
      : on ? h('p', { class: 't-lede bad-text' }, `The watch has been on since ${F.date(c.year, s0.watchDay)}: ${s0.sv} severity values so far.`)
        : h('div', { class: 'watch-meter' },
          h('p', { class: 't-lede num' }, `${s0.sv} of ${S.SV_THRESHOLD} severity values`),
          gauge(Math.min(1, s0.sv / S.SV_THRESHOLD), { label: 'Severity values toward the blight watch', text: `${s0.sv} of ${S.SV_THRESHOLD}`, cls: 'warn' }),
          h('p', null, `${S.SV_THRESHOLD - s0.sv} more and the watch goes on.${t && t.severity > 0 ? ` Today's weather adds ${t.severity}.` : ''}`)),
    h('p', null, `Late blight needs long, damp, mild spells. The game adds up severity values for that weather from ${F.date(c.year, start)}, as the Blitecast system does. Once the total reaches ${S.SV_THRESHOLD} the watch is on, and spores can land on any day of blight weather.`),
    h('p', null, 'Protectant stops spores taking hold; it does not cure a blighted plant, so it has to be on the leaf first. It wears off day by day, faster as new leaf grows, and rain washes it off.'),
    h('p', null, on && !leaf ? 'No field has leaf up, so there is nothing to protect yet.' : 'Blight shows only up close. A field that has not been walked for a week is a guess: it can be clean, or it can be a week into an outbreak.'),
  ]
}

function fieldsPage(ctx: Ctx, c: S.Campaign): Child {
  const s0 = c.season!
  const t = S.today(ctx.app.world, c)
  return h('div', { class: 'field-cards' }, heldFields(c).map(i => {
    const f = S.fieldInfo(c, i)
    const rows: [string, string][] = []
    const add = (k: string, v: string) => rows.push([k, v])
    add('Ground', `${f.position}; soil ${R.soilWord(f.soil)}; early dying in ${F.pct(f.vert)} of plants`)
    if (f.status === 'rest') add('This year', `Oats and clover. It earns ${F.money(S.REST_INCOME)} in the fall.`)
    else {
      add('Stage', f.daysIn > 0 && f.status !== 'dug' && f.status !== 'lost' ? `${f.stage}, day ${f.daysIn} since planting` : f.stage)
      if (f.status === 'idle' || f.status === 'planted') add('Soil here', `${F.temp((t ? t.soilT : 0) + S.SOIL_T_OFFSET[f.elev])}; seed wants about ${F.temp(10)}`)
      if (f.status === 'growing' || f.status === 'planted') {
        add('Leaf', `${F.pct(f.canopy)} of the ground${f.bloom > 0.2 ? ', in flower' : ''}${f.frosted >= 0.05 ? `; ${F.pct(f.frosted)} blackened by frost` : ''}`)
        add('Hilled', R.hillWord(f.hillPasses))
        add('Protectant', f.protect > 0.02 ? `${F.pct(f.protect)} left` : 'none')
      }
      if (f.status !== 'dug' && f.status !== 'lost') add('Soil water', `${f.moistureLabel}${f.tooWet ? ', too wet to work' : f.wilt > 0.3 ? ', plants drooping' : ''}`)
      if (f.status === 'growing' || f.status === 'dead') {
        add('Blight', `${f.blightHills > 0 ? `${F.plural(f.blightHills, 'hill')}, ${(f.blightKnown * 100).toFixed(f.blightKnown < 0.01 ? 1 : 0)}% of leaf` : 'none seen'}; ${f.scoutAge < 0 ? 'never walked' : `walked ${F.ago(f.scoutAge)}`}`)
        add('Virus', f.stunted > 0.005 ? `${F.pct(f.stunted)} of plants stunted` : 'none stunted')
        if (f.stand < 0.995) add('Stand', `${F.pct(f.stand)} of the seed came up`)
      }
      if (f.estimate) {
        add('Yield', `${F.perAreaSpan(f.estimate.lo, f.estimate.hi)}, ${f.estimate.digs ? `from ${F.plural(f.estimate.digs, 'test dig')}` : 'by eye'}`)
        if (f.tubers) add('Tuber size', `${F.num(f.tubers.perHill, 0)} to a hill in the test ${f.tubers.digs === 1 ? 'dig' : 'digs'}, so about ${F.gramsSpan(f.tubers.lo, f.tubers.hi)} each. US No. 1 starts at ${F.grams(S.SIZE_A)}; over ${F.grams(S.SIZE_CHEF)} is large, ${R.largeRule(ctx.app.world, c, c.plans[i].variety)}.`)
      }
      if (f.status === 'dead') add('Skins', f.skin >= 1 ? 'set' : `${F.pct(f.skin)} set; vines dead ${F.plural(f.deadDays, 'day')}`)
      const jobs = s0.jobs.filter(j => j.field === i)
      if (jobs.length) add('On the list', F.list(jobs.map(j => R.JOB_VERB[j.kind].toLowerCase())))
    }
    return h('article', { class: 'field-card' },
      h('h3', { class: 't-head' }, icon(R.stageGlyph(f)), f.name, h('span', { class: 'sub' }, f.status === 'rest' ? 'resting' : f.variety)),
      h('dl', null, rows.map(([k, v]) => [h('dt', { class: 't-label' }, k), h('dd', null, v)])))
  }))
}

// The land the farm holds by block, who works it, and what is promised to whom.
function farmPage(ctx: Ctx, c: S.Campaign): Child {
  const mine = heldFields(c)
  const blocks = [...new Set(mine.map(i => S.PARCELS[i].block))]
  const waits = S.jobWaits(ctx.app.world, c)
  const crews = S.crewInfo(c)
  const ks = S.contractInfo(c)
  const st = S.storageInfo(c)
  return [
    h('h3', { class: 'block-head' }, 'Land'),
    h('table', { class: 'money' }, h('tbody', null, blocks.map(b => {
      const here = mine.filter(i => S.PARCELS[i].block === b)
      const rent = here.filter(i => c.fields[i].tenure === 'rented').reduce((a, i) => a + S.PARCELS[i].rent, 0)
      const far = Math.max(...here.map(i => S.travelDays(S.HOME_YARD, i)))
      return h('tr', null, h('th', { scope: 'row' }, BLOCK_NAME[b], h('span', { class: 'sub' }, ` ${F.list(here.map(i => S.FIELD_NAMES[i]))}${b === 'home' ? '' : `; ${roadTime(far)} from the home yard`}`)), h('td', null, rent ? `${F.money(rent)} rent` : 'owned'))
    }))),
    h('p', { class: 'sub' }, `Rented land is paid for the year when the season begins and stays rented until it is released in spring. A dig far from a potato house takes longer for the haul. Storage: ${F.list(st.houses.map(x => `${x.name.replace(/^(Home|Second)/, w => w.toLowerCase())} ${F.mass(x.cwt)}`))}.`),
    h('h3', { class: 'block-head' }, 'Crews'),
    h('table', { class: 'money' }, h('tbody', null, crews.map(u => h('tr', null,
      h('th', { scope: 'row' }, u.name, h('span', { class: 'sub' }, ` ${R.KIND_NAME[u.kind].toLowerCase()}: ${R.kindDoes(u.kind).toLowerCase().replace(/\.$/, '')}`)),
      h('td', null, doing(c, u, waits, crews).text))))),
    h('p', { class: 'sub' }, `Each day every crew takes the earliest order it can do, nearest first, unless an order is given to one crew. The drive between fields comes out of the working day. Hands are ${F.money(S.HAND_WAGE)} a month, the operator ${F.money(S.OPERATOR_WAGE)}.`),
    h('h3', { class: 'block-head' }, 'Contracts'),
    ks.length ? h('table', { class: 'money' }, h('tbody', null, ks.map(k => h('tr', null,
      h('th', { scope: 'row' }, `${k.buyer}, ${k.varietyName}`, h('span', { class: 'sub' }, ` ${F.mass(k.delivered)} of ${F.mass(k.cwt)} at ${F.price(k.price)}, ${k.dueBy}`)),
      h('td', { class: k.penalty > 0 ? 'neg' : '' }, k.penalty > 0 ? `short ${F.money(-k.penalty)}` : 'filled'))))) : h('p', null, 'None signed this year.'),
    h('p', { class: 'sub' }, `Contracts are signed in spring. What is short on the due date costs ${F.pct(S.CONTRACT_PENALTY)} of its contract value.`),
  ]
}

function diaryPage(c: S.Campaign): Child {
  const log = c.season?.log ?? []
  if (!log.length) return h('p', null, 'Nothing has happened yet.')
  return h('ol', { class: 'diary' }, [...log].reverse().map(e => h('li', { class: `lv-${e.level}` },
    h('span', { class: 'diary-date num' }, F.date(c.year, e.day, true)),
    h('span', null, F.localize(e.text)))))
}

function pricesPage(ctx: Ctx, c: S.Campaign): Child {
  const world = ctx.app.world
  const ids = [...new Set(c.plans.filter(p => p.crop === 'potato').map(p => p.variety))]
  const lots = S.openLots(c)
  return [
    h('p', { class: 't-lede' }, R.moodText(world, c)),
    h('table', { class: 'money' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Variety'), h('th', { scope: 'col' }, 'US No. 1 today'), h('th', { scope: 'col' }, 'A usual year'))),
      h('tbody', null, ids.map(id => {
        const v = S.variety(id)
        return h('tr', null, h('th', { scope: 'row' }, v.name, v.contract ? h('span', { class: 'sub' }, ' off contract, a processing price') : null), h('td', null, F.price(S.basePrice(world, c, id))), h('td', null, F.price(v.price)))
      }))),
    h('p', null, R.outlookText(c)),
    h('p', { class: 'sub' }, `The cellar charges ${F.storeRate(S.STORE_COST)} from the day of the dig, and the potato houses hold ${F.mass(S.cellarCapacity(c))}.`),
    lots.length ? [
      h('h3', { class: 'block-head' }, 'In the cellar'),
      h('table', { class: 'money' }, h('tbody', null, lots.map(l => h('tr', null,
        h('th', { scope: 'row' }, `${S.variety(l.variety).name} from ${S.FIELD_NAMES[l.field]}, ${F.mass(S.lotCwt(l))}`),
        h('td', null, F.money(S.lotValue(world, c, l))))))),
      h('p', { class: 'sub' }, 'Worth today. Select a dug field to sell its crop or see its weigh ticket.'),
    ] : null,
  ]
}

export function openAlmanac(ctx: Ctx, first: Page = 'forecast'): void {
  const app = ctx.app
  const c = app.campaign
  if (!c || !c.season) return
  let page = first
  ctx.papers.open({
    title: `The almanac, ${F.date(c.year, c.season.day)}`,
    testid: 'almanac',
    size: 'wide',
    cls: 'almanac',
    body: () => {
      const tabs = h('nav', { class: 'tabs', 'aria-label': 'Pages of the almanac' })
      const body = h('div', { class: 'almanac-page' })
      const draw = (focus = false) => {
        tabs.replaceChildren(...PAGES.map(([k, label]) => h('button', {
          class: 'tab', type: 'button', testid: `almanac-${k}`, 'aria-current': page === k ? 'page' : null, autofocus: page === k,
          onclick: () => { page = k; draw(true) },
        }, label)))
        if (focus) tabs.querySelector<HTMLElement>('[aria-current]')?.focus()
        body.replaceChildren(h('div', null, page === 'forecast' ? forecastPage(ctx, c) : page === 'blight' ? blightPage(ctx, c) : page === 'fields' ? fieldsPage(ctx, c) : page === 'farm' ? farmPage(ctx, c) : page === 'diary' ? diaryPage(c) : pricesPage(ctx, c)))
      }
      draw()
      return [tabs, body]
    },
  })
}
