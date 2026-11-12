// Spring's offers, each folded to one line until it is opened: the fields, people asking for work, land to rent or
// buy, contracts, equipment, the land mortgage and the farm's rules. And the cards for land and tracts on the map.
import { personLook } from '../game/looks.ts'
import * as S from '../sim/index.ts'
import { springContracts } from './contracts.ts'
import type { Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import { face, skillBars } from './face.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME, BLOCK_NOTE, heldFields, roadTime } from './map.ts'
import { POSITION_NOTE, soilWord } from './rules.ts'

export type Fold = 'fields' | 'people' | 'land' | 'contracts' | 'equipment' | 'bank' | 'rules'

export interface FoldRow {
  id: Fold
  open: string              // testid of the row that opens it
  testid: string            // testid of what it opens to
  glyph: string
  name: string
  state: string             // the one line it folds to
  figure?: string
  body: () => Child
}

export function fieldCost(p: S.FieldPlan): number {
  return p.crop === 'potato' ? S.FIELD_COST + (p.seed === 'certified' ? S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT : 0) : S.REST_COST
}

// Shows a parcel on the land and opens its card.
function look(ctx: Ctx, i: number): void {
  ctx.app.select(i)
  ctx.app.focus(i)
}

function closer(testid: string, onClose: () => void): HTMLElement {
  return h('div', { class: 'fold-end' }, h('button', { class: 'btn small', type: 'button', testid, onclick: onClose }, 'Done'))
}

function tryRun(ctx: Ctx, cmd: S.Cmd, onTry: (err: string) => void): boolean {
  const r = ctx.app.do(cmd)
  onTry(r.ok ? '' : r.err)
  if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? 'Done.'))
  ctx.dirty()
  return r.ok
}

// ---------------------------------------------------------------- the fields

const TRACT_GLYPH: Record<S.Cover, string> = { open: 'idle', woods: 'tree', brush: 'tree', stumps: 'stump' }

function fieldsBody(ctx: Ctx, c: S.Campaign): Child {
  const tracts = S.tractInfo(c)
  return h('ul', { class: 'fold-list' }, heldFields(c).map(i => {
    const fp = c.fields[i]
    const p = c.plans[i]
    let glyph: string, what: string, figure: string
    if (fp.cover !== 'open') {
      const t = tracts.find(x => x.field === i)
      glyph = TRACT_GLYPH[fp.cover]
      what = `${F.upper(fp.cover === 'stumps' ? 'stumps to pull' : S.COVER_WORD[fp.cover])}: ${t?.stage === 'fell' ? `${Math.ceil(t.fellLeft)} crew-days to fell` : t?.stage === 'stump' ? 'a contractor pulls them' : 'rocks to pick'}`
      figure = ''
    } else {
      glyph = p.crop === 'potato' ? 'planted' : 'rest'
      what = p.crop === 'potato' ? `${S.variety(p.variety).name}${p.seed === 'saved' ? ', saved seed' : ''}` : fp.raw ? 'Rest year: new ground' : 'Rest year'
      figure = F.money(fieldCost(p))
    }
    return h('li', null, h('button', { class: 'fold-item', type: 'button', testid: `fold-field-${i}`, onclick: () => look(ctx, i) },
      icon(glyph, 'ic s'), h('span', { class: 'fi-name' }, S.FIELD_NAMES[i]), h('span', { class: 'fi-what' }, what), h('span', { class: 'fi-fig num' }, figure)))
  }))
}

// ---------------------------------------------------------------- people

function bedText(c: S.Campaign): string {
  const L = S.labourInfo(c)
  if (L.hireWhy) return L.hireWhy
  return L.hired < S.HOUSED_OUT ? 'Would live out' : `A bunk is free: ${L.housing - L.hired} of ${L.beds}`
}

function applicantCard(ctx: Ctx, c: S.Campaign, a: S.ApplicantInfo, onTry: (err: string) => void): HTMLElement {
  return h('article', { class: 'person-card', testid: `applicant-${a.id}` },
    h('header', { class: 'pc-head' }, face(personLook(a.id), 40),
      h('div', null,
        h('h4', { class: 'pc-name' }, a.name),
        h('p', { class: 'pc-trait' }, h('strong', null, a.traitName), ` · ${a.suits === 'operator' ? 'drives' : a.best === 'woods' ? 'woods' : a.best === 'build' ? 'builds' : a.best === 'pack' ? 'packs' : 'field work'}`))),
    skillBars(a.skills, a.best),
    h('p', { class: 'pc-text' }, a.traitText),
    h('div', { class: 'pc-foot' },
      h('p', null, h('strong', { class: 'num' }, F.money(a.ask)), h('span', { class: 'sub' }, ' a month')),
      h('button', {
        class: 'btn', type: 'button', testid: `applicant-hire-${a.id}`, disabled: !!a.why, title: a.why || undefined,
        onclick: () => tryRun(ctx, { t: 'hire', applicant: a.id }, onTry),
      }, 'Hire')))
}

function peopleBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  const L = S.labourInfo(c)
  const people = S.applicantInfo(c)
  const hired = S.peopleInfo(c).filter(p => p.kind !== 'farmer')
  const hall = (kind: 'hand' | 'operator') => {
    const why = S.hireBlock(c, kind)
    const wage = kind === 'hand' ? S.HAND_WAGE : S.OPERATOR_WAGE
    return h('button', { class: 'btn small', type: 'button', testid: `hire-${kind}`, disabled: !!why, title: why || undefined, onclick: () => tryRun(ctx, { t: 'hire', kind }, onTry) },
      kind === 'hand' ? 'A field hand' : 'An operator', h('span', { class: 'sub num' }, F.money(wage)))
  }
  return [
    h('p', { class: 'fold-lede' }, `Paid by the month from the start of the season. ${bedText(c)}.`),
    people.length ? h('div', { class: 'person-cards' }, people.map(a => applicantCard(ctx, c, a, onTry))) : h('p', { class: 'sub' }, 'Nobody else is asking for work this spring.'),
    h('div', { class: 'hall' }, h('span', { class: 'sub' }, 'Or from the hiring hall, average at their work:'), hall('hand'), hall('operator')),
    hired.length ? [
      h('h4', { class: 'fold-sub' }, `On the farm, ${L.hired} of ${L.housing} places`),
      h('ul', { class: 'fold-list' }, hired.map(p => h('li', { class: 'hired' },
        face(personLook(p.id), 28),
        h('span', { class: 'fi-name' }, p.name),
        h('span', { class: 'fi-what' }, `${p.traitName}, ${F.money(p.pay)} a month`),
        h('button', { class: 'btn small', type: 'button', testid: `dismiss-${p.id}`, onclick: () => { if (tryRun(ctx, { t: 'dismiss', unit: p.id }, onTry) && ctx.app.unit === p.id) ctx.app.selectUnit(-1) } }, 'Let go')))),
    ] : null,
    closer('crew-close', onClose),
  ]
}

// ---------------------------------------------------------------- land

function landBody(ctx: Ctx, c: S.Campaign, onClose: () => void): Child {
  const land = S.landInfo(c).filter(l => l.tenure === 'none')
  const blocks = [...new Set(land.map(l => l.block))]
  return [
    h('p', { class: 'fold-lede' }, 'Pick a lot here or on the land: its card says what it costs and what it brings.'),
    blocks.map(b => [
      h('h4', { class: 'fold-sub' }, BLOCK_NAME[b]),
      h('ul', { class: 'fold-list' }, land.filter(l => l.block === b).map(l => h('li', null, h('button', { class: 'fold-item', type: 'button', testid: `fold-land-${l.field}`, onclick: () => look(ctx, l.field) },
        icon(S.standing(l.cover) ? 'tree' : 'land', 'ic s'),
        h('span', { class: 'fi-name' }, l.name),
        h('span', { class: 'fi-what' }, S.standing(l.cover) ? `${l.cover === 'woods' ? 'Woods' : 'Brush'} to clear` : l.rentable ? `${F.money(l.rent)} a year` : ''),
        h('span', { class: 'fi-fig num' }, F.money(l.price)))))),
    ]),
    closer('land-close', onClose),
  ]
}

// The card for land the farm does not hold: rent it, or buy it on the mortgage or outright. note: why the last try failed.
export function landCard(ctx: Ctx, c: S.Campaign, field: number, note: string, onTry: (err: string) => void): Child {
  const l = S.landInfo(c).find(x => x.field === field)
  if (!l) return null
  const m = S.mortgageInfo(c)
  const first = l.loan * (m.rate + S.MORTGAGE_PRINCIPAL)
  const haul = l.haul > 0.005 ? ` The haul to a potato house adds ${F.pct(l.haul)} to its harvest.` : ''
  const tract = S.standing(l.cover)
  return [
    h('header', { class: 'card-head plan-head' },
      h('div', null,
        h('h2', { class: 't-head', testid: 'card-title' }, l.name),
        h('p', { class: 'card-sub' }, `${BLOCK_NAME[l.block]}. ${tract ? 'A tract to clear into a field.' : POSITION_NOTE[l.elev]}`)),
      h('button', { class: 'nicon', type: 'button', testid: 'card-close', 'aria-label': 'Deselect', onclick: () => ctx.app.select(-1) }, icon('close'))),
    h('p', { class: 'card-line note' }, `${tract ? '' : `${BLOCK_NOTE[l.block]} `}${l.brings}`.trim()),
    h('p', { class: 'card-line', testid: 'land-facts' }, tract
      ? `Cleared, it is stony new ground: its first potato crop grows less unless it rests a year first.`
      : `Soil ${soilWord(l.soil)}, early dying in ${F.pct(l.vert)} of plants, stones ${stoneWord(l.stones)}. ${F.upper(roadTime(l.travel))} on the road from home.${haul}`),
    h('div', { class: 'plan-row land-row' },
      l.rentable ? h('button', { class: 'nbtn primary', type: 'button', testid: 'land-rent', disabled: !!l.rentWhy, onclick: () => tryRun(ctx, { t: 'rent', field }, onTry) },
        'Rent', h('span', { class: 'sub num' }, `${F.money(l.rent)} a year`)) : null,
      h('button', { class: `nbtn${l.rentable ? '' : ' primary'}`, type: 'button', testid: 'land-buy', onclick: () => tryRun(ctx, { t: 'buyLand', field }, onTry) },
        'Buy', h('span', { class: 'sub num' }, `${F.money(l.down)} down`)),
      c.cash >= l.price ? h('button', {
        class: 'nbtn', type: 'button', testid: 'land-buy-cash',
        onclick: () => { if (tryRun(ctx, { t: 'buyLand', field }, onTry)) tryRun(ctx, { t: 'payMortgage', amount: l.loan }, onTry) },
      }, 'Buy outright', h('span', { class: 'sub num' }, F.money(l.price))) : null),
    h('p', { class: 'card-line' }, [
      l.rentable ? `Rent is paid when the season begins, and the lot is yours for the year. ` : '',
      `Bought, ${F.money(l.loan)} goes on the land mortgage: the bank takes about ${F.money(first)} at the year end, less each year after.`,
    ].join('')),
    note ? h('p', { class: 'card-line flash lv-warn', role: 'alert' }, note) : null,
  ]
}

export function stoneWord(stones: number): string {
  return stones >= 0.6 ? 'heavy' : stones >= 0.35 ? 'middling' : 'light'
}

// On the plan card of land the farm rents or bought: how it is held, and the way to give it up or buy it.
export function tenureRow(ctx: Ctx, c: S.Campaign, field: number, onTry: (err: string) => void): Child {
  const fp = c.fields[field]
  if (field < S.HOME_FIELDS && fp.tenure === 'owned') return null
  const p = S.PARCELS[field]
  if (fp.tenure === 'owned') {
    const loan = S.mortgageInfo(c).loans.find(x => x.field === field)
    return h('p', { class: 'card-line', testid: 'tenure' }, `${BLOCK_NAME[p.block]}. The farm owns it${loan ? `, ${F.money(loan.owed)} still owed on it` : ''}.`)
  }
  return h('div', { class: 'plan-row land-row', testid: 'tenure' },
    h('p', { class: 'card-line' }, `${BLOCK_NAME[p.block]}. Rented, ${F.money(p.rent)} this year.`),
    h('button', { class: 'nbtn', type: 'button', testid: 'land-release', onclick: () => tryRun(ctx, { t: 'release', field }, onTry) }, 'Release'),
    h('button', { class: 'nbtn', type: 'button', testid: 'land-buy', onclick: () => tryRun(ctx, { t: 'buyLand', field }, onTry) }, 'Buy', h('span', { class: 'sub num' }, `${F.money(Math.round(p.price * S.MORTGAGE_DOWN))} down`)))
}

const STAGES: [S.ClearStage, string][] = [['fell', 'Fell'], ['stump', 'Stumps'], ['rocks', 'Rocks'], ['done', 'Field']]

// The card for a tract the farm holds: where its clearing stands, what the next step takes and yields, its shelter.
export function tractCard(ctx: Ctx, c: S.Campaign, field: number, note: string, onTry: (err: string) => void): Child {
  const t = S.tractInfo(c).find(x => x.field === field)
  if (!t) return null
  const at = STAGES.findIndex(([k]) => k === t.stage)
  const logs = Math.round(t.timber * (1 - t.felled))
  return [
    h('header', { class: 'card-head plan-head' },
      h('div', null,
        h('h2', { class: 't-head', testid: 'card-title' }, t.name),
        h('p', { class: 'card-sub' }, `${F.upper(t.coverWord)}. ${BLOCK_NAME[t.block]}.`)),
      h('button', { class: 'nicon', type: 'button', testid: 'card-close', 'aria-label': 'Deselect', onclick: () => ctx.app.select(-1) }, icon('close'))),
    h('ol', { class: 'clear-track', 'aria-label': `Clearing: ${STAGES[at][1].toLowerCase()} next` }, STAGES.map(([k, label], n) =>
      h('li', { class: n < at ? 'done' : n === at ? 'now' : '', 'aria-current': n === at ? 'step' : undefined }, label))),
    h('p', { class: 'card-line note' }, t.next || 'Cleared: a field from next spring.'),
    t.stage === 'fell' ? h('p', { class: 'card-line' }, `About ${logs} loads of logs come off it: ${F.money(logs * S.LOG_PRICE)} at the mill, or wood for buildings. Felling goes at half speed in the season; someone kept on this winter fells it at full speed.`) : null,
    t.shelters.length ? h('p', { class: 'card-line' }, `It shelters ${F.list(t.shelters.map(i => S.FIELD_NAMES[i]))}: less water lost and sprays in more wind, but an hour more blight weather and a colder frost.`) : null,
    t.stage === 'stump' && !t.works ? h('div', { class: 'plan-row land-row' },
      h('button', { class: 'nbtn primary', type: 'button', testid: 'tract-stump', disabled: !!t.stumpWhy, title: t.stumpWhy || undefined, onclick: () => tryRun(ctx, { t: 'stump', field }, onTry) },
        'Pull the stumps', h('span', { class: 'sub num' }, F.money(t.stumpFee))),
      h('p', { class: 'card-line' }, `A contractor with a bulldozer, about ${S.STUMP_DAYS} season days.`)) : null,
    note ? h('p', { class: 'card-line flash lv-warn', role: 'alert' }, note) : null,
  ]
}

// ---------------------------------------------------------------- equipment

function equipNeeds(c: S.Campaign, id: S.UpgradeId): string {
  const u = S.UPGRADES[id]
  if ((id === 'tractor2' || id === 'tractor3') && !S.hasBuilt(c, 'shed')) return 'Needs the machine shed built first.'
  if (id === 'tractor3' && !c.upgrades.tractor2) return 'Needs the second tractor first.'
  if (id === 'house2' && S.buildingAt(c, 'house', S.HOME_YARD)) return 'A second potato house is standing or going up.'
  if (c.cash < u.cost) return `Needs ${F.money(u.cost)} in hand; the bank does not lend for it.`
  return ''
}

function equipmentBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  const ids = (Object.keys(S.UPGRADES) as S.UpgradeId[])
  return [
    h('p', { class: 'fold-lede' }, `Bought from cash, ${F.money(Math.max(0, c.cash))} now.`),
    h('ul', { class: 'equip' }, ids.map(id => {
      const u = S.UPGRADES[id]
      const why = c.upgrades[id] ? '' : equipNeeds(c, id)
      return h('li', null,
        h('div', null, h('h4', { class: 'eq-name' }, u.name), h('p', { class: 'sub' }, F.localize(u.blurb)), why ? h('p', { class: 'sub warn-text' }, why) : null),
        c.upgrades[id] ? h('span', { class: 't-label owned' }, 'Owned')
          : h('button', { class: 'btn small', type: 'button', testid: `buy-${id}`, disabled: !!why, onclick: () => tryRun(ctx, { t: 'buy', upgrade: id }, onTry) }, `Buy, ${F.money(u.cost)}`))
    })),
    closer('equipment-close', onClose),
  ]
}

// ---------------------------------------------------------------- the land mortgage

function bankBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  const m = S.mortgageInfo(c)
  const pay = (amount: number, label: string) => h('button', {
    class: 'btn small', type: 'button', testid: `pay-${Math.round(amount)}`, disabled: !!m.payWhy || c.cash < amount,
    onclick: () => tryRun(ctx, { t: 'payMortgage', amount }, onTry),
  }, label, h('span', { class: 'sub num' }, F.money(amount)))
  return [
    h('ul', { class: 'fold-list' }, m.loans.map(x => h('li', null,
      icon('land', 'ic s'), h('span', { class: 'fi-name' }, x.name), h('span', { class: 'fi-what' }, `of ${F.money(x.loan)} borrowed`), h('span', { class: 'fi-fig num' }, F.money(x.owed))))),
    h('p', { class: 'fold-lede' }, `At the year end the bank takes ${F.money(m.principal)} off the loans and ${F.money(m.interest)} interest, ${F.pct(m.rate)} on what is owed. Extra paid now saves the interest on it every year after, but it is cash the season may want.`),
    h('div', { class: 'hall' }, m.owed > 5000 ? pay(5000, 'Pay') : null, m.owed > 20000 ? pay(20000, 'Pay') : null, pay(Math.round(m.owed), 'Pay it all')),
    closer('bank-close', onClose),
  ]
}

// ---------------------------------------------------------------- the farm's rules

function rulesBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  return [
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Sundays' },
      ([true, false] as const).map(off => h('label', { class: 'seg-opt' },
        h('input', { type: 'radio', name: 'sundays', checked: c.sundaysOff === off, testid: `rule-sundays-${off ? 'off' : 'on'}`, onchange: () => tryRun(ctx, { t: 'sundays', off }, onTry) }),
        h('span', null, off ? 'Sundays off' : 'Work Sundays')))),
    h('p', { class: 'fold-lede' }, c.sundaysOff ? 'Everyone rests one day in seven and comes back fresh.' : 'A day more each week, and everyone tires: tired people slow down, sour, and have accidents.'),
    closer('rules-close', onClose),
  ]
}

// ---------------------------------------------------------------- the rows

// The folds this spring has: the fields first, then each way to grow the farm that is real for it now.
export function springFolds(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): FoldRow[] {
  const mine = heldFields(c)
  const open = mine.filter(i => c.fields[i].cover === 'open')
  const potato = open.filter(i => c.plans[i].crop === 'potato').length
  const tracts = mine.length - open.length
  const pc = S.planCosts(c)
  const L = S.labourInfo(c)
  const asking = c.applicants.length
  const land = S.landInfo(c).filter(l => l.tenure === 'none')
  const forRent = land.filter(l => l.rentable).length
  const offers = c.offers.length
  const signed = c.contracts.length
  const ids = Object.keys(S.UPGRADES) as S.UpgradeId[]
  const owned = ids.filter(id => c.upgrades[id]).length
  const reach = ids.filter(id => !c.upgrades[id] && !equipNeeds(c, id)).length
  const m = S.mortgageInfo(c)
  const rows: FoldRow[] = [{
    id: 'fields', open: 'fields-open', testid: 'fields', glyph: 'planted', name: 'Fields',
    state: [`${potato} in potatoes`, `${open.length - potato} resting`, tracts ? F.plural(tracts, 'tract') : ''].filter(Boolean).join(' · '),
    figure: F.money(pc.fields), body: () => fieldsBody(ctx, c),
  }]
  rows.push({
    id: 'people', open: 'crew-open', testid: 'crew', glyph: 'crew', name: 'People',
    state: [asking ? `${asking} asking for work` : 'Nobody asking', L.hired ? `${L.hired} hired` : ''].filter(Boolean).join(' · '),
    figure: pc.wages ? `${F.money(pc.wages)}/mo` : undefined, body: () => peopleBody(ctx, c, onTry, onClose),
  }, {
    id: 'land', open: 'land-open', testid: 'land', glyph: 'land', name: 'Land',
    state: land.length ? `${forRent} to rent · ${land.length} for sale` : 'The farm holds it all', body: () => landBody(ctx, c, onClose),
  }, {
    id: 'contracts', open: 'contracts-open', testid: 'contracts', glyph: 'contract', name: 'Contracts',
    state: [offers ? `${offers} offered` : 'No more offers', signed ? `${signed} signed` : ''].filter(Boolean).join(' · '),
    body: () => [springContracts(ctx, c), closer('contracts-close', onClose)],
  }, {
    id: 'equipment', open: 'equipment-open', testid: 'equipment', glyph: 'tractor', name: 'Equipment',
    state: [owned ? `${owned} owned` : '', `${reach} within reach`].filter(Boolean).join(' · '),
    body: () => equipmentBody(ctx, c, onTry, onClose),
  })
  if (m.owed > 0) rows.push({
    id: 'bank', open: 'bank-open', testid: 'bank', glyph: 'bank', name: 'Mortgage',
    state: `${F.money(m.owed)} owed`, figure: F.money(m.principal + m.interest), body: () => bankBody(ctx, c, onTry, onClose),
  })
  if (L.hired > 0 || c.history.length > 0) rows.push({
    id: 'rules', open: 'rules-open', testid: 'rules', glyph: 'calendar', name: 'Farm rules',
    state: c.sundaysOff ? 'Sundays off' : 'Working Sundays', body: () => rulesBody(ctx, c, onTry, onClose),
  })
  return rows
}
