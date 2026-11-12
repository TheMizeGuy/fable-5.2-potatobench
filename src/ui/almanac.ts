// The almanac: the depth nobody needs to play. The forecast in full, the blight watch, every reading, the diary, the prices.
import * as S from '../sim/index.ts'
import { gauge, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME, heldFields, roadTime } from './map.ts'
import * as R from './rules.ts'

type Page = 'forecast' | 'blight' | 'fields' | 'farm' | 'people' | 'buildings' | 'incidents' | 'diary' | 'prices'
const PAGES: [Page, string][] = [
  ['forecast', 'Forecast'], ['blight', 'Blight watch'], ['fields', 'Fields'], ['farm', 'Land'], ['people', 'People'], ['buildings', 'Buildings'],
  ['incidents', 'Incidents'], ['diary', 'Diary'], ['prices', 'Prices'],
]

// A mechanic in two lines: what it gives, and its catch.
function rules(list: [string, string, string][]): HTMLElement {
  return h('dl', { class: 'rules' }, list.map(([name, gives, catches]) => h('div', null,
    h('dt', null, name), h('dd', null, gives), h('dd', { class: 'catch' }, catches))))
}

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
    h('p', null, `Late blight needs long, damp, mild spells. From ${F.date(c.year, start)} each day of that weather adds severity values. Once the total reaches ${S.SV_THRESHOLD} the watch is on, and spores can land on any day of blight weather.`),
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

// The land the farm holds by block, its tracts, what is owed on it, and how land works.
function farmPage(ctx: Ctx, c: S.Campaign): Child {
  const mine = heldFields(c)
  const blocks = [...new Set(mine.map(i => S.PARCELS[i].block))]
  const st = S.storageInfo(c)
  const m = S.mortgageInfo(c)
  const tracts = S.tractInfo(c).filter(t => t.tenure !== 'none' && t.stage !== 'done')
  return [
    h('table', { class: 'money' }, h('tbody', null, blocks.map(b => {
      const here = mine.filter(i => S.PARCELS[i].block === b)
      const rent = here.filter(i => c.fields[i].tenure === 'rented').reduce((a, i) => a + S.PARCELS[i].rent, 0)
      const far = Math.max(...here.map(i => S.travelDays(S.HOME_YARD, i)))
      return h('tr', null, h('th', { scope: 'row' }, BLOCK_NAME[b], h('span', { class: 'sub' }, ` ${F.list(here.map(i => S.FIELD_NAMES[i]))}${b === 'home' ? '' : `; ${roadTime(far)} from the home yard`}`)), h('td', null, rent ? `${F.money(rent)} rent` : 'owned'))
    }))),
    tracts.length ? h('ul', { class: 'deeds' }, tracts.map(t => h('li', null, `${t.name}, ${t.coverWord}: ${t.next}`))) : null,
    h('p', { class: 'sub' }, `${m.owed > 0 ? `${F.money(m.owed)} is owed on the land; this year end the bank takes ${F.money(m.principal + m.interest)}. ` : ''}Storage: ${F.list(st.houses.map(x => `${x.name.replace(/^(Home|Second)/, w => w.toLowerCase())} ${F.mass(x.cwt)}`))}.`),
    h('h3', { class: 'block-head' }, 'How land works'),
    rules([
      ['Renting', 'A field for the year, paid when the season begins.', 'The rent comes every year it is kept.'],
      ['Buying', `${F.pct(S.MORTGAGE_DOWN)} down and the rest on the land mortgage: the field is the farm's for good.`, `Each year end the bank takes a tenth of the loan and ${F.pct(S.MORTGAGE_RATE)} interest, besides the note.`],
      ['Clearing a tract', `Fell it, have the stumps pulled (${F.money(S.STUMP_FEE)}), pick the rocks: woods and brush become a field.`, 'New ground is stony, and its first potato crop grows less unless it rests a year.'],
      ['Shelter', 'Standing woods shelter the field beside them: less water lost, sprays in more wind.', 'And an hour more blight weather, and colder frosts.'],
      ['Stones', 'Picking the rocks speeds the planter and the digger and saves the crop from bruising.', 'Frost heaves more up every winter, and picking takes people and time with no crop in.'],
      ['Brush', 'Cutting the hedgerows lets damp and frost drain off a bottom or mid-slope field.', `The wind dries it more, and they grow back in ${S.BRUSH_YEARS} years.`],
      ['Tile drains', 'Bottom land drains like the slope.', `${F.money(S.TILE_FEE)} for a contractor, only under the farm's own land, with no crop in.`],
      ['Logs and stone', `Felling brings logs and picking rocks brings fieldstone: both build, and logs sell at ${F.money(S.LOG_PRICE)} a load.`, `What a building lacks is bought at ${F.money(S.MILL_PRICE)} a load of logs and ${F.money(S.QUARRY_PRICE)} of stone.`],
    ]),
  ]
}

function peoplePage(c: S.Campaign): Child {
  const people = S.peopleInfo(c)
  return [
    h('table', { class: 'money' }, h('tbody', null, people.map(p => {
      const best = S.bestSkill(p.skills)
      return h('tr', null,
        h('th', { scope: 'row' }, p.kind === 'farmer' ? 'You' : p.name,
          h('span', { class: 'sub' }, ` ${p.traitName ? `${p.traitName.toLowerCase()}, ` : ''}best at ${S.SKILL_LABEL[best]} (${p.skills[best]}); ${p.tiredWord}, ${p.moodWord}${p.pay ? `; ${F.money(p.pay)} a month` : ''}`)),
        h('td', null, p.doing))
    }))),
    h('h3', { class: 'block-head' }, 'How people work'),
    rules([
      ['Skills', 'Five, from 0 to 10: machines, field, woods, building, packing. Skill makes work faster and better.', `It comes from doing: level L to L + 1 takes ${S.XP_BASE} + ${S.XP_PER_LEVEL}L days of that work.`],
      ['Traits', 'Everyone hired has one: a strong back, an early riser, sharp eyes.', 'Read it before hiring: careless people bruise the crop, a homebody will not work winters.'],
      ['Priorities', 'Each person takes work in their own order: 1 first to 4 last, or never.', 'An order can still be given to one person, who does it whatever their order.'],
      ['Tiredness', 'A day off rests. Fresh people work at full speed.', 'Worn out, they slow down, sour, and get hurt in the woods or on a machine.'],
      ['Mood', 'Pay over what they asked, a bunk, rest and a good harvest lift it; content people work faster.', `A week near the bottom and a hired person quits.`],
      ['Sundays off', 'Everyone rests one day in seven.', 'Working Sundays gains a day a week and tires everyone.'],
      ['A foreman', 'Puts on the list what a block\'s fields need, every working day.', `Paid ${F.pct(S.FOREMAN_PAY - 1)} more, does no field work, and is careful rather than clever.`],
      ['Pickers', `In the harvest break a picking crew makes every dig ${F.pct(S.PICKER_DIG - 1)} faster.`, `${F.money(S.PICKER_DAY)} for each day worked.`],
      ['Winter', `Kept on, people fell, pack or build, ${S.WINTER_DAYS} days a month.`, 'They are paid every month; laid off, they cost nothing and come back in spring.'],
    ]),
  ]
}

function buildingsPage(c: S.Campaign): Child {
  const all = S.buildingInfo(c).filter(b => b.yard === S.HOME_YARD || S.holdsDufour(c))
  const up = all.filter(b => b.state !== 'none')
  return [
    up.length ? h('table', { class: 'money' }, h('tbody', null, up.map(b => h('tr', null,
      h('th', { scope: 'row' }, b.name, h('span', { class: 'sub' }, `, ${b.yardName}`)),
      h('td', null, b.state === 'built' ? 'standing' : `${F.pct(b.progress)} built`))))) : h('p', null, 'No buildings yet beyond the home place. Select a yard on the land to raise one.'),
    h('h3', { class: 'block-head' }, 'What each building does'),
    rules(S.BUILDING_KINDS.map(k => {
      const spec = S.BUILDINGS[k]
      return [spec.name, `${spec.does} ${F.money(spec.cash)}, ${spec.logs} logs, ${spec.stone} stone, ${spec.days} days of building.`, spec.catch]
    })),
  ]
}

function incidentsPage(c: S.Campaign): Child {
  const open = S.incidentInfo(c)
  return [
    open.length ? h('ul', { class: 'deeds' }, open.map(i => h('li', null, `${i.title}: ${F.localize(i.text)} ${i.daysLeft ? `${F.plural(i.daysLeft, 'day')} left to answer.` : ''}`)))
      : h('p', null, 'Nothing is waiting for an answer.'),
    h('h3', { class: 'block-head' }, 'What can happen'),
    rules([
      ['Someone asks for work', 'Take them on with their own skills and trait, or let them look elsewhere.', `They wait ${S.INCIDENT_DAYS} days for an answer.`],
      ['A neighbour wants one of your people', `Match the offer, ${F.pct(S.POACH_RAISE)} more, or let them choose.`, 'Unhappy people take it and go.'],
      ['A tractor breaks down', `${S.BREAK_DAYS} days out, or a rush part for ${F.money(S.RUSH_PART)}; someone at machines ${S.MECHANIC} has it going in a day.`, 'Long, tired hours make it likelier; a machine shed halves it.'],
      ['Someone is hurt', `Out ${S.HURT_DAYS[0]} to ${S.HURT_DAYS[1]} days.`, 'Only when working worn out in the woods or on a machine: rest prevents it.'],
      ['A buyer stops in', `${F.pct(S.BUYER_PREMIUM)} over the market for a whole lot, this week only.`, 'Sold, the lot is gone: nothing held for the spring price.'],
    ]),
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
  const ids = [...new Set(c.plans.filter((p, i) => p.crop === 'potato' && S.isField(c, i)).map(p => p.variety))]
  const lots = S.openLots(c)
  const ks = S.contractInfo(c)
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
    ks.length ? [
      h('h3', { class: 'block-head' }, 'Contracts'),
      h('table', { class: 'money' }, h('tbody', null, ks.map(k => h('tr', null,
        h('th', { scope: 'row' }, `${k.buyer}, ${k.varietyName}`, h('span', { class: 'sub' }, ` ${F.mass(k.delivered)} of ${F.mass(k.cwt)} at ${F.price(k.price)}, ${k.dueBy}`)),
        h('td', { class: k.penalty > 0 ? 'neg' : '' }, k.penalty > 0 ? `short ${F.money(-k.penalty)}` : 'filled'))))),
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
        const pages: Record<Page, () => Child> = {
          forecast: () => forecastPage(ctx, c), blight: () => blightPage(ctx, c), fields: () => fieldsPage(ctx, c), farm: () => farmPage(ctx, c),
          people: () => peoplePage(c), buildings: () => buildingsPage(c), incidents: () => incidentsPage(c), diary: () => diaryPage(c), prices: () => pricesPage(ctx, c),
        }
        body.replaceChildren(h('div', null, pages[page]()))
      }
      draw()
      return [tabs, body]
    },
  })
}
