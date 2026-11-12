// The almanac: the depth nobody needs to play. The forecast in full, the blight watch, every reading, the diary, the prices.
// A printed almanac's pages, with a thumb index down the fore-edge; no frame draws it, so it is made of the kit's parts.
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME, heldFields, roadTime } from './map.ts'
import * as R from './rules.ts'
import { meter, need } from './system/parts.ts'
import { portrait } from './system/people.ts'

type Page = 'forecast' | 'blight' | 'fields' | 'farm' | 'people' | 'buildings' | 'incidents' | 'diary' | 'prices'
const PAGES: [Page, string, string][] = [
  ['forecast', 'Forecast', 'sun'], ['blight', 'Blight watch', 'blight'], ['fields', 'Fields', 'field'], ['farm', 'Land', 'land'],
  ['people', 'People', 'people'], ['buildings', 'Buildings', 'build'], ['incidents', 'Incidents', 'alert'], ['diary', 'Diary', 'calendar'],
  ['prices', 'Prices', 'money'],
]

const sec = (title: string) => h('h4', { class: 'alm-sec t-label' }, title)

// A mechanic in two lines: what it gives, and its catch.
function rules(list: [string, string, string][]): HTMLElement {
  return h('dl', { class: 'alm-rules' }, list.map(([name, gives, catches]) => h('div', null,
    h('dt', null, name), h('dd', null, gives), h('dd', { class: 'catch' }, catches))))
}

// A cash-book table: words on the left, the money column ruled in red on the right.
function book(rows: [Child, Child, string?][], head?: [string, string]): HTMLElement {
  return h('table', { class: 'cashbook alm-book' },
    head ? h('thead', null, h('tr', null, h('th', { scope: 'col' }, head[0]), h('th', { scope: 'col', class: 'm' }, head[1]))) : null,
    h('tbody', null, rows.map(([what, m, cls]) => h('tr', null, h('td', null, what), h('td', { class: `m${cls ? ` ${cls}` : ''}` }, m)))))
}

const sub = (text: string) => h('span', { class: 'alm-note' }, text)

function forecastPage(ctx: Ctx, c: S.Campaign): Child {
  const t = S.today(ctx.app.world, c)
  if (!t) return null
  const fc = S.forecast(ctx.app.world, c, 5)
  const d = t.day
  const range = (x: number, sd: number) => `${F.degrees(x - sd)}–${F.degrees(x + sd)}`
  // A forecast amount is a guess: it is shown rounded and labelled as about.
  const about = (mm: number) => mm <= 0 ? 'none' : F.metric() ? `about ${Math.round(mm)} mm` : mm / 25.4 < 0.05 ? 'a trace' : `about ${F.num(mm / 25.4, 1)} in`
  return [
    h('div', { class: 'alm-today' },
      icon(t.sky, 'i'),
      h('div', null,
        h('p', { class: 't-head' }, `${R.SKY_WORD[t.sky]} today`),
        h('p', null, `High ${F.temp(d.tmax)}, low ${F.temp(d.tmin)}, rain ${F.rain(d.prcp)}. The soil is ${F.temp(t.soilT)} on the mid slope, a degree colder on the bottom land and a degree warmer on the ridge.`))),
    h('div', { class: 'alm-scroll', tabindex: '0', role: 'group', 'aria-label': 'The next five days' }, h('table', { class: 'alm-t' },
      h('caption', { class: 'sr' }, 'The next five days'),
      h('thead', null, h('tr', null, ['Day', `High, ${F.tempUnit()}`, `Low, ${F.tempUnit()}`, 'Rain', 'How much', 'Blight weather', 'Frost'].map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', null, fc.map(x => h('tr', null,
        h('th', { scope: 'row' }, `${F.weekday(c.year, x.day, true)} ${F.dayOfMonth(c.year, x.day)}`),
        h('td', null, range(x.hi, x.spread)),
        h('td', null, range(x.lo, x.spread)),
        h('td', { class: x.rainChance >= 60 ? 'c-blue' : '' }, `${x.rainChance}%`),
        h('td', null, about(x.rainMm)),
        h('td', { class: x.blight >= 2 ? 'c-red' : '' }, R.BLIGHT_RISK[x.blight]),
        h('td', { class: x.frostChance >= 30 ? 'c-blue' : '' }, `${x.frostChance}%`)))))),
    h('p', { class: 't-caption' }, 'Highs and lows are ranges that get wider the further ahead you look. Rain is a chance, and the forecast can be wrong in either direction. The frost chance is for the coldest field, down on the bottom land.'),
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
      ? h('p', { class: 'alm-lead' }, `Blight severity values start counting on ${F.date(c.year, start)}.`)
      : on ? h('div', { class: 'alm-watch on' },
        need({ ink: 'red', icon: 'blight', label: 'The blight watch is on' }),
        h('p', { class: 'alm-lead c-red' }, `The watch has been on since ${F.date(c.year, s0.watchDay)}, with ${s0.sv} severity values so far.`))
        : h('div', { class: 'alm-watch' },
          h('p', { class: 'alm-lead' }, h('b', { class: 't-figure' }, String(s0.sv)), ` of ${S.SV_THRESHOLD} severity values`),
          meter(Math.min(1, s0.sv / S.SV_THRESHOLD), { label: 'Severity values toward the blight watch', text: `${s0.sv} of ${S.SV_THRESHOLD}`, kind: 'warn' }),
          h('p', null, `${S.SV_THRESHOLD - s0.sv} more and the blight watch starts.${t && t.severity > 0 ? ` Today's weather adds ${t.severity}.` : ''}`)),
    h('p', null, `Late blight needs long spells of damp, mild weather. From ${F.date(c.year, start)}, each day of that weather adds severity values. Once the total reaches ${S.SV_THRESHOLD} the blight watch starts, and after that spores can land on any day of blight weather.`),
    h('p', null, 'Spray stops spores from taking hold, but it can\'t cure a plant that\'s already blighted, so it has to be on the leaves first. It wears off day by day, faster while new leaves are growing, and rain washes it off.'),
    h('p', null, on && !leaf ? 'No field has leaves up yet, so there\'s nothing to protect.' : 'You can only see blight up close. If nobody has walked a field for a week you\'re guessing, because it could be clean or a week into an outbreak.'),
  ]
}

function fieldsPage(ctx: Ctx, c: S.Campaign): Child {
  const s0 = c.season!
  return h('div', { class: 'alm-fields' }, heldFields(c).map(i => {
    const f = S.fieldInfo(c, i)
    const rows: [string, string][] = []
    const add = (k: string, v: string) => rows.push([k, v])
    add('Ground', `${f.position}, soil ${R.soilWord(f.soil)}, early dying in ${F.pct(f.vert)} of plants`)
    if (f.status === 'rest') add('This year', `Oats and clover, which earn ${F.money(S.REST_INCOME)} in the fall`)
    else {
      add('Stage', f.daysIn > 0 && f.status !== 'dug' && f.status !== 'lost' ? `${f.stage}, day ${f.daysIn} since planting` : f.stage)
      if (f.status === 'idle' || f.status === 'planted') { const pr = S.plantReady(ctx.app.world, c, i); add('Soil here', `${F.temp(pr.soilT)}. Seed needs ${F.temp(pr.need)}, and it rots below ${F.temp(pr.rots)}`) }
      if (f.status === 'growing' || f.status === 'planted') {
        add('Leaves', `cover ${F.pct(f.canopy)} of the ground${f.bloom > 0.2 ? ', in flower' : ''}${f.frosted >= 0.05 ? `, ${F.pct(f.frosted)} blackened by frost` : ''}`)
        add('Hilled', R.hillWord(f.hillPasses))
        add('Spray', f.protect > 0.02 ? `${F.pct(f.protect)} left` : 'none')
      }
      if (f.status !== 'dug' && f.status !== 'lost') add('Soil water', `${f.moistureLabel}${f.tooWet ? ', too wet to work' : f.wilt > 0.3 ? ', plants drooping' : ''}`)
      if (f.status === 'growing' || f.status === 'dead') {
        add('Blight', `${f.blightHills > 0 ? `${F.plural(f.blightHills, 'hill')}, ${(f.blightKnown * 100).toFixed(f.blightKnown < 0.01 ? 1 : 0)}% of the leaves` : 'none seen'}, ${f.scoutAge < 0 ? 'never walked' : `last walked ${F.ago(f.scoutAge)}`}`)
        add('Virus', f.stunted > 0.005 ? `${F.pct(f.stunted)} of plants stunted` : 'none stunted')
        if (f.stand < 0.995) add('Stand', `${F.pct(f.stand)} of the seed came up`)
      }
      if (f.estimate) {
        add('Yield', `${F.perAreaSpan(f.estimate.lo, f.estimate.hi)}, ${f.estimate.digs ? `from ${F.plural(f.estimate.digs, 'test dig')}` : 'by eye'}`)
        if (f.tubers) add('Potato size', `${F.num(f.tubers.perHill, 0)} per hill in the test ${f.tubers.digs === 1 ? 'dig' : 'digs'}, so about ${F.gramsSpan(f.tubers.lo, f.tubers.hi)} each. US No. 1 starts at ${F.grams(S.SIZE_A)}, and anything over ${F.grams(S.SIZE_CHEF)} counts as large and sells ${R.largeRule(ctx.app.world, c, c.plans[i].variety)}.`)
      }
      if (f.status === 'dead') add('Skins', f.skin >= 1 ? 'set' : `${F.pct(f.skin)} set, vines dead for ${F.plural(f.deadDays, 'day')}`)
      const jobs = s0.jobs.filter(j => j.field === i)
      if (jobs.length) add('On the work list', F.list(jobs.map(j => R.JOB_VERB[j.kind].toLowerCase())))
    }
    return h('article', { class: 'alm-field' },
      h('h4', null, icon(R.stageGlyph(f), 'i'), h('span', { class: 'nm' }, f.name), h('span', { class: 't-caption' }, f.status === 'rest' ? 'resting' : f.variety)),
      h('dl', null, rows.map(([k, v]) => h('div', null, h('dt', { class: 't-label' }, k), h('dd', null, v)))))
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
    book(blocks.map(b => {
      const here = mine.filter(i => S.PARCELS[i].block === b)
      const rent = here.filter(i => c.fields[i].tenure === 'rented').reduce((a, i) => a + S.PARCELS[i].rent, 0)
      const far = Math.max(...here.map(i => S.travelDays(S.HOME_YARD, i)))
      return [[h('b', null, BLOCK_NAME[b]), sub(` ${F.list(here.map(i => S.FIELD_NAMES[i]))}${b === 'home' ? '' : `, ${roadTime(far)} from the home yard`}`)], rent ? `${F.money(rent)} rent` : 'owned']
    }), ['Your land', 'Per year']),
    tracts.length ? h('ul', { class: 'alm-list' }, tracts.map(t => h('li', null, h('b', null, `${t.name}, ${t.coverWord}`), `: ${t.next}`))) : null,
    h('p', { class: 't-caption' }, `${m.owed > 0 ? `You owe ${F.money(m.owed)} on the land, and the bank takes ${F.money(m.principal + m.interest)} at the end of this year. ` : ''}Storage: ${F.list(st.houses.map(x => `${x.name.replace(/^(Home|Second)/, w => w.toLowerCase())} ${F.mass(x.cwt)}`))}.`),
    sec('How land works'),
    rules([
      ['Renting', 'You get a field for the year and pay when the season starts.', 'You pay the rent again every year you keep it.'],
      ['Buying', `You pay ${F.pct(S.MORTGAGE_DOWN)} down, the rest goes on the land mortgage, and the field is yours for good.`, `At the end of each year the bank takes a tenth of the loan plus ${F.pct(S.MORTGAGE_RATE)} interest, on top of the yearly bank payment.`],
      ['Clearing a tract', `Fell the trees, have the stumps pulled (${F.money(S.STUMP_FEE)}) and pick the rocks, and woods or brush becomes a field.`, 'New ground is stony, and its first potato crop is smaller unless it rests a year first.'],
      ['Shelter', 'Standing woods shelter the field next to them, so it loses less water and you can spray in more wind.', 'It also gets an hour more blight weather and colder frosts.'],
      ['Stones', 'Picking rocks speeds up planting and digging and saves the crop from bruising.', 'Frost pushes more stones up every winter, and picking takes people and time while no crop is in the field.'],
      ['Brush', 'Cutting the hedgerows lets damp air and frost drain off a bottom or mid-slope field.', `The wind dries the field out more, and the hedgerows grow back in ${S.BRUSH_YEARS} years.`],
      ['Tile drains', 'They make bottom land drain like the slope.', `A contractor charges ${F.money(S.TILE_FEE)}, and only on land you own with no crop in it.`],
      ['Logs and stone', `Felling gives you logs and picking rocks gives you fieldstone. Both go into buildings, and logs also sell for ${F.money(S.LOG_PRICE)} a load.`, `Whatever a building is short of you buy, at ${F.money(S.MILL_PRICE)} a load of logs and ${F.money(S.QUARRY_PRICE)} a load of stone.`],
    ]),
  ]
}

function peoplePage(c: S.Campaign): Child {
  const people = S.peopleInfo(c)
  return [
    h('table', { class: 'alm-t alm-people' }, h('tbody', null, people.map(p => {
      const best = S.bestSkill(p.skills)
      const who = p.kind === 'farmer' ? 'You' : p.name
      return h('tr', null,
        h('td', { class: 'alm-face' }, portrait(who, 40)),
        h('th', { scope: 'row' }, h('b', null, who),
          sub(` ${p.traitName ? `${p.traitName.toLowerCase()}, ` : ''}best at ${S.SKILL_LABEL[best]} (${p.skills[best]}), ${p.tiredWord}, ${p.moodWord}${p.pay ? `, ${F.money(p.pay)} a month` : ''}`)),
        h('td', null, p.doing))
    }))),
    sec('How people work'),
    rules([
      ['Skills', 'There are five, each from 0 to 10: machines, field, woods, building and packing. More skill means faster, better work.', `People learn by doing. Going from level L to L + 1 takes ${S.XP_BASE} + ${S.XP_PER_LEVEL} × L days of that work.`],
      ['Traits', 'Everyone you hire has one, like a strong back, an early riser or sharp eyes.', 'Read it before you hire, because careless people bruise the crop and a homebody won\'t work winters.'],
      ['Priorities', 'Each person picks up work in their own order, from 1 (first) to 4 (last), or never.', 'You can still give an order to one person, and they\'ll do it whatever their priorities are.'],
      ['Tiredness', 'A day off rests people, and rested people work at full speed.', 'Worn-out people slow down, lose heart and get hurt in the woods or on a machine.'],
      ['Mood', 'Paying more than they asked, a bunk, rest and a good harvest all lift it, and content people work faster.', 'A hired person whose mood stays near the bottom for a week quits.'],
      ['Sundays off', 'Everyone gets one day off a week.', 'Working Sundays gains a day a week but tires everyone out.'],
      ['A foreman', 'Adds what a block\'s fields need to the work list every working day.', `A foreman is paid ${F.pct(S.FOREMAN_PAY - 1)} more, does no field work and is careful rather than clever.`],
      ['Pickers', `During the harvest break a picking crew makes digging ${F.pct(S.PICKER_DIG - 1)} faster.`, `They cost ${F.money(S.PICKER_DAY)} for each day they work.`],
      ['Winter', `People you keep on can fell, pack or build for ${S.WINTER_DAYS} days a month.`, 'You pay them every month. If you lay them off they cost nothing and come back in spring.'],
    ]),
  ]
}

function buildingsPage(c: S.Campaign): Child {
  const all = S.buildingInfo(c).filter(b => b.yard === S.HOME_YARD || S.holdsDufour(c))
  const up = all.filter(b => b.state !== 'none')
  return [
    up.length ? h('ul', { class: 'alm-built' }, up.map(b => h('li', null,
      h('span', { class: 'lead' }, h('b', null, b.name), sub(b.yardName), h('span', { class: 'dots' }), h('span', null, b.state === 'built' ? 'standing' : `${F.pct(b.progress)} built`)),
      b.state === 'built' ? null : meter(b.progress, { label: `${b.name} built`, text: `${F.pct(b.progress)} built` }))))
      : h('p', { class: 'alm-empty' }, icon('build', 'i'), 'You have no buildings yet beyond the ones you started with. Select a yard on the map to put one up.'),
    sec('What each building does'),
    rules(S.BUILDING_KINDS.map(k => {
      const spec = S.BUILDINGS[k]
      return [spec.name, `${spec.does} It costs ${F.money(spec.cash)}, ${spec.logs} logs, ${spec.stone} stone and ${spec.days} days of building.`, spec.catch]
    })),
  ]
}

function incidentsPage(c: S.Campaign): Child {
  const open = S.incidentInfo(c)
  return [
    open.length ? h('ul', { class: 'alm-list' }, open.map(i => h('li', null, h('b', null, i.title), `: ${F.localize(i.text)} `,
      i.daysLeft ? h('span', { class: 'c-red' }, `${F.plural(i.daysLeft, 'day')} left to answer.`) : null)))
      : h('p', { class: 'alm-empty' }, icon('check', 'i'), 'Nothing needs an answer right now.'),
    sec('What can happen'),
    rules([
      [F.localize(S.INCIDENT_TITLE.applicant), 'Hire them, with their own skills and trait, or let them look elsewhere.', `They'll wait ${S.INCIDENT_DAYS} days for an answer.`],
      [F.localize(S.INCIDENT_TITLE.poach), `Match the offer, which is ${F.pct(S.POACH_RAISE)} more pay, or let them decide.`, 'Unhappy people take the offer and leave.'],
      ['A tractor breaks down', `It's out for ${S.BREAK_DAYS} days, or you can pay ${F.money(S.RUSH_PART)} for a rush part. Someone with machine skill ${S.MECHANIC} or higher gets it running in a day.`, 'Long hours with tired people make breakdowns more likely, and a machine shed halves the risk.'],
      ['Someone is hurt', `They're out for ${S.HURT_DAYS[0]} to ${S.HURT_DAYS[1]} days.`, 'It only happens to worn-out people working in the woods or on a machine, so rest prevents it.'],
      [F.localize(S.INCIDENT_TITLE.buyer), `They offer ${F.pct(S.BUYER_PREMIUM)} over the market price for a whole stored crop, this week only.`, 'Once it\'s sold it\'s gone, so you can\'t hold it for the spring price.'],
    ]),
  ]
}

function diaryPage(c: S.Campaign): Child {
  const log = c.season?.log ?? []
  if (!log.length) return h('p', { class: 'alm-empty' }, icon('calendar', 'i'), 'Nothing has happened yet.')
  const ink: Record<S.GameEvent['level'], string> = { info: '', good: 'c-green', warn: 'c-ochre', bad: 'c-red' }
  return h('ol', { class: 'alm-diary' }, [...log].reverse().map(e => h('li', { class: ink[e.level] },
    h('span', { class: 'when' }, F.date(c.year, e.day, true)),
    h('span', null, F.localize(e.text)))))
}

function pricesPage(ctx: Ctx, c: S.Campaign): Child {
  const world = ctx.app.world
  const ids = [...new Set(c.plans.filter((p, i) => p.crop === 'potato' && S.isField(c, i)).map(p => p.variety))]
  const lots = S.openLots(c)
  const ks = S.contractInfo(c)
  return [
    h('p', { class: 'alm-lead' }, R.moodText(world, c)),
    h('table', { class: 'cashbook alm-book' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Variety'), h('th', { scope: 'col', class: 'm' }, 'US No. 1 today'), h('th', { scope: 'col', class: 'm' }, 'A usual year'))),
      h('tbody', null, ids.map(id => {
        const v = S.variety(id)
        return h('tr', null, h('td', null, h('b', null, v.name), v.contract ? sub(' without a contract, a processing price') : null), h('td', { class: 'm' }, F.price(S.basePrice(world, c, id))), h('td', { class: 'm' }, F.price(v.price)))
      }))),
    h('p', null, R.outlookText(c)),
    h('p', { class: 't-caption' }, `Storage costs ${F.storeRate(S.STORE_COST)} from the day of the harvest, and your potato houses hold ${F.mass(S.cellarCapacity(c))}.${F.cwtNote()}`),
    lots.length ? [
      sec('In the cellar'),
      book(lots.map(l => [`${S.variety(l.variety).name} from ${S.FIELD_NAMES[l.field]}, ${F.mass(S.lotCwt(l))}`, F.money(S.lotValue(world, c, l))])),
      h('p', { class: 't-caption' }, 'This is what each would sell for today. Select a dug field to sell its crop or see its weigh ticket.'),
    ] : null,
    ks.length ? [
      sec('Contracts'),
      book(ks.map(k => [[h('b', null, `${k.buyer}, ${k.varietyName}`), sub(` ${F.mass(k.delivered)} of ${F.mass(k.cwt)} at ${F.price(k.price)}, ${k.dueBy}`)],
        k.penalty > 0 ? `short ${F.money(-k.penalty)}` : 'filled', k.penalty > 0 ? 'out' : undefined])),
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
    plain: true,
    cls: 'almanac-dialog',
    body: close => {
      const index = h('nav', { class: 'alm-index', 'aria-label': 'Almanac pages' })
      const leaf = h('article', { class: 'alm-page', 'data-scroll': '', tabindex: '0', role: 'region', 'aria-label': 'The almanac page' })
      const draw = (focus = false) => {
        index.replaceChildren(...PAGES.map(([k, label, glyph]) => h('button', {
          class: `alm-tab${page === k ? ' on' : ''}`, type: 'button', testid: `almanac-${k}`, 'aria-current': page === k ? 'page' : null, autofocus: page === k,
          onclick: () => { page = k; draw(true) },
        }, icon(glyph, 'i'), h('span', null, label))))
        if (focus) index.querySelector<HTMLElement>('[aria-current]')?.focus()
        const pages: Record<Page, () => Child> = {
          forecast: () => forecastPage(ctx, c), blight: () => blightPage(ctx, c), fields: () => fieldsPage(ctx, c), farm: () => farmPage(ctx, c),
          people: () => peoplePage(c), buildings: () => buildingsPage(c), incidents: () => incidentsPage(c), diary: () => diaryPage(c), prices: () => pricesPage(ctx, c),
        }
        const name = PAGES.find(p => p[0] === page)![1]
        leaf.replaceChildren(h('h3', { class: 'alm-title' }, name), h('div', { class: 'alm-text' }, pages[page]()))
        leaf.scrollTop = 0
      }
      draw()
      return h('section', { class: 'alm sheet sys', 'data-layout': ctx.layout() },
        h('header', { class: 'alm-head' },
          h('div', null,
            h('p', { class: 't-label' }, `${R.seasonCount(c)} · ${F.date(c.year, c.season!.day)}`),
            h('p', { class: 'alm-mark', 'aria-hidden': 'true' }, h('span', { class: 'the' }, 'The'), 'Almanac')),
          h('button', { class: 'close', type: 'button', testid: 'almanac-close', 'aria-label': 'Back to the farm (Escape)', onclick: close }, icon('close', 'i'))),
        leaf, index)
    },
  })
}
