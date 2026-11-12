// Spring's catalogue (design/spring.html): its folds, each one line until it is opened (the fields with their tracts,
// people asking for work, land to rent or buy, contracts, equipment, the land mortgage, the farm's rules), and the
// cards for a field, a lot or a tract picked on the land.
import * as S from '../sim/index.ts'
import { springContracts } from './contracts.ts'
import type { Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { term } from './glossary.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME, BLOCK_NOTE, heldFields, roadTime } from './map.ts'
import { POSITION_NOTE, soilWord } from './rules.ts'
import { tens } from './system/parts.ts'
import { portrait } from './system/people.ts'

export type Fold = 'fields' | 'people' | 'land' | 'contracts' | 'equipment' | 'bank' | 'rules'

export interface FoldRow {
  id: Fold
  open: string              // testid of the fold that opens it
  testid: string            // testid of what it opens to
  glyph: string
  name: string
  state: string             // the one line it folds to
  short?: string            // the same, for a phone
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

function done(testid: string, onClose: () => void): HTMLElement {
  return h('p', { class: 'cat-done' }, h('button', { class: 'btn quiet', type: 'button', testid, onclick: onClose }, 'Done'))
}

function tryRun(ctx: Ctx, cmd: S.Cmd, onTry: (err: string) => void): boolean {
  const r = ctx.app.do(cmd)
  onTry(r.ok ? '' : r.err)
  if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? 'Done.'))
  ctx.dirty()
  return r.ok
}

// A line of a fold's list: a thing on the land with what it is and its figure; pressed, it is shown there.
function catRow(o: { icon: string; name: string; what: string; figure?: string; testid: string; onclick: () => void }): HTMLElement {
  return h('li', null, h('button', { class: 'cat-row', type: 'button', testid: o.testid, onclick: o.onclick },
    icon(o.icon, 'i'), h('b', null, o.name), h('span', { class: 'it quiet' }, o.what), h('span', { class: 'dots' }), o.figure ? h('span', { class: 'num' }, o.figure) : null))
}

// ---------------------------------------------------------------- the fields

const TRACT_GLYPH: Record<S.Cover, string> = { open: 'idle', woods: 'woods', brush: 'woods', stumps: 'stump' }

function fieldsBody(ctx: Ctx, c: S.Campaign): Child {
  const tracts = S.tractInfo(c)
  return h('ul', { class: 'cat-list' }, heldFields(c).map(i => {
    const fp = c.fields[i]
    const p = c.plans[i]
    if (fp.cover !== 'open') {
      const t = tracts.find(x => x.field === i)
      return catRow({
        icon: TRACT_GLYPH[fp.cover], name: S.FIELD_NAMES[i], testid: `fold-field-${i}`, onclick: () => look(ctx, i),
        what: `${F.upper(S.COVER_WORD[fp.cover])}, ${t?.stage === 'fell' ? `${Math.ceil(t.fellLeft)} crew-days to fell` : t?.stage === 'stump' ? 'ready for a contractor to pull' : 'rocks to pick'}`,
      })
    }
    return catRow({
      icon: p.crop === 'potato' ? 'planted' : 'rest', name: S.FIELD_NAMES[i], testid: `fold-field-${i}`, onclick: () => look(ctx, i),
      what: p.crop === 'potato' ? `${S.variety(p.variety).name}${p.seed === 'saved' ? ', saved seed' : ''}` : fp.raw ? 'Rest year, new ground' : 'Rest year',
      figure: F.money(fieldCost(p)),
    })
  }))
}

// ---------------------------------------------------------------- people

const SKILL_WORD: [S.Skill, string][] = [['machine', 'Machine'], ['field', 'Field'], ['woods', 'Woods'], ['build', 'Build'], ['pack', 'Pack']]

function bedText(c: S.Campaign): string {
  const L = S.labourInfo(c)
  if (L.hireWhy) return L.hireWhy
  return L.hired < S.HOUSED_OUT ? 'Two hired people can live off the farm.' : `Free bunks: ${L.housing - L.hired} of ${L.beds}.`
}

// An applicant as the catalogue lists them: portrait, trait in a word, five skill boxes (on a phone the best one, as
// ten boxes), the wage asked, Hire.
function applicant(ctx: Ctx, a: S.ApplicantInfo, one: boolean, onTry: (err: string) => void): HTMLElement {
  const best = SKILL_WORD.find(([k]) => k === a.best)![1]
  const text = a.traitText.replace(/\.$/, '')
  return h('article', { class: 'applicant', testid: `applicant-${a.id}` },
    portrait(a, 52),
    h('div', { class: 'who' }, h('h3', null, a.name), h('p', null, h('b', null, a.traitName), one ? null : h('span', { class: 'desc' }, `: ${text[0].toLowerCase()}${text.slice(1)}.`))),
    one
      ? h('p', { class: 'skill-one', 'aria-label': `Best at ${best.toLowerCase()}, ${a.skills[a.best]} out of 10` }, h('b', null, `${best} ${a.skills[a.best]}`), tens(a.skills[a.best], 0, { best: true }))
      : h('ul', { class: 'skill-row', 'aria-label': `Skills out of 10: ${SKILL_WORD.map(([k, w]) => `${w} ${a.skills[k]}`).join(', ')}` },
        SKILL_WORD.map(([k, w]) => h('li', { class: k === a.best ? 'best' : null, 'aria-hidden': 'true' }, h('span', null, w), h('b', null, String(a.skills[k]))))),
    h('p', { class: 'price' }, h('b', { class: 'num' }, F.money(a.ask)), h('span', null, 'a month')),
    h('button', {
      class: 'btn', type: 'button', testid: `applicant-hire-${a.id}`, disabled: !!a.why, title: a.why || undefined, 'aria-label': `Hire ${a.name} for ${F.money(a.ask)} a month`,
      onclick: () => tryRun(ctx, { t: 'hire', applicant: a.id }, onTry),
    }, 'Hire'))
}

// A hired person made foreman of a block the farm holds, or put back to field work: the same choice as their card.
export function foremanRow(ctx: Ctx, c: S.Campaign, p: S.PersonInfo, onTry: (err: string) => void): HTMLElement {
  const blocks = S.BLOCKS.filter(b => S.PARCELS.some((x, i) => x.block === b && S.held(c, i)))
  const place = (b: S.BlockId) => BLOCK_NAME[b].replace(/^The /, '').split(',')[0]
  const name = (b: S.BlockId) => F.upper(place(b))
  return h('p', { class: 'cat-foreman', role: 'group', 'aria-label': `Make ${p.name} foreman of`, testid: `spring-foreman-${p.id}` },
    h('span', { class: 't-label' }, icon('foreman', 'i'), term('Foreman', 'foreman'), ' of'),
    blocks.map(b => {
      const other = c.crew.find(u => u.foreman === b && u.id !== p.id)
      return h('button', {
        class: 'btn', type: 'button', testid: `spring-foreman-${p.id}-${b}`, 'aria-pressed': String(p.foreman === b), disabled: !!other,
        title: other ? `${other.name} is already foreman there` : `Each working morning ${p.name} adds whatever needs doing on the ${place(b)} to the work list. A foreman does no field work and is paid ${F.pct(S.FOREMAN_PAY - 1)} more.`,
        onclick: () => tryRun(ctx, p.foreman === b ? { t: 'foreman', unit: p.id, block: null } : { t: 'foreman', unit: p.id, block: b }, onTry),
      }, name(b))
    }))
}

// Naming a foreman from wherever the goal is shown outside spring and the season (the year end): a small paper with
// each hired person and the blocks.
export function openForeman(ctx: Ctx): void {
  let note = ''
  ctx.papers.open({
    title: 'Name a foreman',
    kicker: 'The way ahead',
    testid: 'foreman-paper',
    size: 'small',
    body: () => {
      const box = h('div', { class: 'cat-list' })
      const draw = () => {
        const c = ctx.app.campaign
        if (!c) return
        const hired = S.peopleInfo(c).filter(p => p.kind !== 'farmer')
        box.replaceChildren(h('div', null,
          h('p', { class: 'dlg-lead' }, 'Each working morning a ', term('foreman'), ' adds what the fields in one ', term('block'), ` need to the work list. A foreman does no field work and is paid ${F.pct(S.FOREMAN_PAY - 1)} more.`),
          hired.map(p => h('div', { class: 'cat-hired' }, portrait(p, 32), h('b', null, p.name), h('span', { class: 'it quiet' }, `${F.money(p.pay)} a month`),
            foremanRow(ctx, c, p, err => { note = err; draw() }))),
          hired.length ? null : h('p', { class: 't-caption' }, 'You haven\'t hired anyone yet. Hire someone in spring first.'),
          note ? h('p', { class: 'card-refused c-red', role: 'alert' }, note) : null))
      }
      draw()
      return box
    },
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'foreman-close', autofocus: true, onclick: close }, 'Done'),
  })
}

function peopleBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  const L = S.labourInfo(c)
  const one = ctx.layout() === 'narrow'
  const hired = S.peopleInfo(c).filter(p => p.kind !== 'farmer')
  const hall = (kind: 'hand' | 'operator') => {
    const why = S.hireBlock(c, kind)
    const wage = kind === 'hand' ? S.HAND_WAGE : S.OPERATOR_WAGE
    return h('button', { class: 'btn', type: 'button', testid: `hire-${kind}`, disabled: !!why, title: why || undefined, onclick: () => tryRun(ctx, { t: 'hire', kind }, onTry) },
      kind === 'hand' ? 'A field hand' : 'An operator', h('span', { class: 'sub num' }, F.money(wage)))
  }
  return [
    ...S.applicantInfo(c).map(a => applicant(ctx, a, one, onTry)),
    h('div', { class: 'cat-hall hall-row' }, h('p', { class: 't-label', title: 'Workers from the hiring hall are average at every job.' }, 'Or the hiring hall'), hall('hand'), hall('operator'),
      L.hireWhy ? h('p', { class: 't-caption' }, L.hireWhy) : null),
    hired.length ? [
      h('p', { class: 't-label cat-sub' }, `Your crew: ${L.hired} of ${L.housing} places filled`, L.hireWhy ? null : h('span', { class: 't-caption' }, ` ${bedText(c)}`)),
      h('ul', { class: 'cat-list' }, hired.map(p => h('li', { class: 'cat-hired' },
        portrait(p, 32),
        h('b', null, p.name),
        h('span', { class: 'it quiet' }, `${p.traitName}, ${F.money(p.pay)} a month`),
        h('button', { class: 'btn hazard', type: 'button', testid: `dismiss-${p.id}`, onclick: () => { if (tryRun(ctx, { t: 'dismiss', unit: p.id }, onTry) && ctx.app.unit === p.id) ctx.app.selectUnit(-1) } }, 'Let go'),
        foremanRow(ctx, c, p, onTry)))),
    ] : null,
    done('crew-close', onClose),
  ]
}

// ---------------------------------------------------------------- land

function landBody(ctx: Ctx, c: S.Campaign, onClose: () => void): Child {
  const land = S.landInfo(c).filter(l => l.tenure === 'none')
  const blocks = [...new Set(land.map(l => l.block))]
  return [
    h('p', { class: 't-caption' }, 'Pick a lot here or on the map, and its card will show what it costs and what comes with it.'),
    blocks.map(b => [
      h('p', { class: 't-label cat-sub' }, BLOCK_NAME[b]),
      h('ul', { class: 'cat-list' }, land.filter(l => l.block === b).map(l => catRow({
        icon: S.standing(l.cover) ? 'woods' : 'land', name: l.name, testid: `fold-land-${l.field}`, onclick: () => look(ctx, l.field),
        what: S.standing(l.cover) ? `${l.cover === 'woods' ? 'woods' : 'brush'} to clear` : l.rentable ? `${F.money(l.rent)} a year` : '',
        figure: F.money(l.price),
      }))),
    ]),
    done('land-close', onClose),
  ]
}

export function stoneWord(stones: number): string {
  return stones >= 0.6 ? 'very stony' : stones >= 0.35 ? 'fairly stony' : 'only a little stony'
}

// The head of a card on the land: what kind of record, the name, a line under it, and the way to let it go.
export function cardHead(ctx: Ctx, kind: string, name: string, caption: Child): HTMLElement {
  return h('header', { class: 'command-head' },
    h('div', null, h('p', { class: 't-label' }, kind), h('h2', { class: 't-title', testid: 'card-title' }, name), h('p', { class: 't-caption' }, caption)),
    h('button', { class: 'close', type: 'button', testid: 'card-close', 'aria-label': 'Close this card (Escape)', onclick: () => ctx.app.select(-1) }, icon('close', 'i')))
}

function noteLine(note: string): Child {
  return note ? h('p', { class: 'card-refused c-red', role: 'alert' }, note) : null
}

// The card for land the farm does not hold: rent it, or buy it on the mortgage or outright. note: why the last try failed.
export function landCard(ctx: Ctx, c: S.Campaign, field: number, note: string, onTry: (err: string) => void): Child {
  const l = S.landInfo(c).find(x => x.field === field)
  if (!l) return null
  const m = S.mortgageInfo(c)
  const first = l.loan * (m.rate + S.MORTGAGE_PRINCIPAL)
  const haul = l.haul > 0.005 ? ` Hauling the crop in adds ${F.pct(l.haul)} to its digging time.` : ''
  const tract = S.standing(l.cover)
  return [
    cardHead(ctx, l.rentable ? 'For rent or sale' : 'For sale', l.name, `${BLOCK_NAME[l.block]}. ${tract ? 'A tract you can clear into a field.' : POSITION_NOTE[l.elev]}`),
    h('div', { class: 'readings' },
      h('p', { class: 'wrap' }, icon('land', 'i'), h('span', null, `${tract ? '' : `${BLOCK_NOTE[l.block]} `}${l.brings}`.trim())),
      h('p', { class: 'wrap', testid: 'land-facts' }, icon('field', 'i'), h('span', null, tract
        ? 'Once it\'s cleared it\'s stony new ground, so its first potato crop will be smaller unless you rest it for a year first.'
        : `The soil is ${soilWord(l.soil)}, early dying hits ${F.pct(l.vert)} of plants and the ground is ${stoneWord(l.stones)}. It's ${roadTime(l.travel)} by road from home.${haul}`))),
    h('div', { class: 'orders', role: 'group', 'aria-label': 'Ways to get this land' },
      l.rentable ? h('button', { class: 'order is-suggested', type: 'button', testid: 'land-rent', disabled: !!l.rentWhy, onclick: () => tryRun(ctx, { t: 'rent', field }, onTry) },
        icon('fist', 'i fist'), h('span', { class: 'key', 'aria-hidden': 'true' }, 'R'), icon('land', 'i'), h('span', { class: 'name' }, 'Rent'), h('span', { class: 'cost num' }, `${F.money(l.rent)} a year`),
        h('span', { class: 'catch' }, 'You pay when the season starts, and it\'s yours for the year.')) : null,
      h('button', { class: `order${l.rentable ? '' : ' is-suggested'}`, type: 'button', testid: 'land-buy', onclick: () => tryRun(ctx, { t: 'buyLand', field }, onTry) },
        l.rentable ? null : icon('fist', 'i fist'), h('span', { class: 'key', 'aria-hidden': 'true' }, 'B'), icon('bank', 'i'), h('span', { class: 'name' }, 'Buy'), h('span', { class: 'cost num' }, `${F.money(l.down)} down`),
        h('span', { class: 'catch' }, `The other ${F.money(l.loan)} goes on the land mortgage, about ${F.money(first)} at the end of the year and less each year after.`)),
      c.cash >= l.price ? h('button', { class: 'order', type: 'button', testid: 'land-buy-cash', onclick: () => { if (tryRun(ctx, { t: 'buyLand', field }, onTry)) tryRun(ctx, { t: 'payMortgage', amount: l.loan }, onTry) } },
        h('span', { class: 'key', 'aria-hidden': 'true' }, 'O'), icon('money', 'i'), h('span', { class: 'name' }, 'Buy outright'), h('span', { class: 'cost num' }, F.money(l.price)),
        h('span', { class: 'catch' }, 'Paid in full from cash, so you owe nothing.')) : null),
    noteLine(note),
  ]
}

// On the card of a field the farm rents or bought: how it is held, and the way to give it up or buy it.
export function tenureRow(ctx: Ctx, c: S.Campaign, field: number, onTry: (err: string) => void): Child {
  const fp = c.fields[field]
  if (field < S.HOME_FIELDS && fp.tenure === 'owned') return null
  const p = S.PARCELS[field]
  if (fp.tenure === 'owned') {
    const loan = S.mortgageInfo(c).loans.find(x => x.field === field)
    return h('p', { class: 'card-tenure', testid: 'tenure' }, `${BLOCK_NAME[p.block]}. You own it${loan ? ` and still owe ${F.money(loan.owed)} on it` : ''}.`)
  }
  return h('div', { class: 'card-tenure', testid: 'tenure' },
    h('p', null, `${BLOCK_NAME[p.block]}. You rent it for ${F.money(p.rent)} this year.`),
    h('button', { class: 'btn', type: 'button', testid: 'land-release', onclick: () => tryRun(ctx, { t: 'release', field }, onTry) }, 'Stop renting'),
    h('button', { class: 'btn', type: 'button', testid: 'land-buy', onclick: () => tryRun(ctx, { t: 'buyLand', field }, onTry) }, 'Buy', h('span', { class: 'sub num' }, `${F.money(Math.round(p.price * S.MORTGAGE_DOWN))} down`)))
}

const STAGES: [S.ClearStage, string][] = [['fell', 'Fell'], ['stump', 'Stumps'], ['rocks', 'Rocks'], ['done', 'Field']]

// The card for a tract the farm holds (design/tract.html): where its clearing stands, what the next step takes and
// yields, its shelter.
export function tractCard(ctx: Ctx, c: S.Campaign, field: number, note: string, onTry: (err: string) => void): Child {
  const t = S.tractInfo(c).find(x => x.field === field)
  if (!t) return null
  const at = STAGES.findIndex(([k]) => k === t.stage)
  const logs = Math.round(t.timber * (1 - t.felled))
  return [
    cardHead(ctx, 'Tract record', t.name, `${F.upper(t.coverWord)}. ${BLOCK_NAME[t.block]}.`),
    h('ol', { class: 'steps', 'aria-label': `Clearing: ${STAGES[at][1].toLowerCase()} next` }, STAGES.map(([k, label], n) =>
      h('li', { class: n < at ? 'done' : n === at ? 'now' : null, 'aria-current': n === at ? 'step' : undefined, 'data-k': k }, label))),
    h('div', { class: 'readings' },
      t.stage === 'fell' ? h('p', null, icon('woods', 'i'), `${F.pct(t.felled)} felled`, h('span', { class: 'meter', style: 'flex:1', 'aria-hidden': 'true' }, h('i', { style: `width:${(t.felled * 100).toFixed(1)}%` }))) : null,
      t.stage === 'fell' ? h('p', { class: 'wrap' }, icon('logs', 'i'), h('span', null, 'About ', h('b', null, `${logs} loads`), ` of logs, worth ${F.money(logs * S.LOG_PRICE)} at the mill or useful as wood for buildings.`)) : null,
      t.shelters.length ? h('p', { class: 'wrap' }, icon('leaf', 'i'), h('span', null, `It shelters ${F.list(t.shelters.map(i => S.FIELD_NAMES[i]))}, which saves water there but adds an hour of blight weather and makes frosts colder.`)) : null),
    t.stage === 'stump' && !t.works ? h('div', { class: 'orders', role: 'group', 'aria-label': 'Orders' },
      h('button', { class: 'order is-suggested', type: 'button', testid: 'tract-stump', disabled: !!t.stumpWhy, title: t.stumpWhy || undefined, onclick: () => tryRun(ctx, { t: 'stump', field }, onTry) },
        icon('fist', 'i fist'), h('span', { class: 'key', 'aria-hidden': 'true' }, 'U'), icon('stump', 'i'), h('span', { class: 'name' }, 'Pull the stumps'), h('span', { class: 'cost num' }, F.money(t.stumpFee)),
        h('span', { class: 'catch' }, `A contractor's bulldozer takes about ${S.STUMP_DAYS} days during the season.`))) : null,
    h('p', { class: 'note' }, t.next || 'It\'s cleared and will be a field from next spring.',
      t.stage === 'fell' ? ' Felling runs at half speed during the season, so keep someone on over the winter to fell it at full speed.' : ''),
    noteLine(note),
  ]
}

// ---------------------------------------------------------------- equipment

function equipNeeds(c: S.Campaign, id: S.UpgradeId): string {
  const u = S.UPGRADES[id]
  if ((id === 'tractor2' || id === 'tractor3') && !S.hasBuilt(c, 'shed')) return 'Build the machine shed first.'
  if (id === 'tractor3' && !c.upgrades.tractor2) return 'Buy the second tractor first.'
  if (id === 'house2' && S.buildingAt(c, 'house', S.HOME_YARD)) return 'You already have a second potato house, or one is being built.'
  if (c.cash < u.cost) return `You need ${F.money(u.cost)} in cash, because the bank won't lend for equipment.`
  return ''
}

function equipmentBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  const ids = Object.keys(S.UPGRADES) as S.UpgradeId[]
  // Equipment comes out of the cash in hand; the plan still costs what it did, so the spring loan lends that much more.
  const plan = S.planCost(c)
  const loanAdds = (cost: number) => Math.max(0, plan - (c.cash - cost)) - Math.max(0, plan - c.cash)
  return [
    h('p', { class: 't-caption', testid: 'equip-cash' }, `Equipment is paid from your cash, ${F.money(Math.max(0, c.cash))} right now. Your plan still costs the same, so the spring loan covers whatever cash a machine uses up, and its price is added to what you owe at the end of the year.`),
    h('ul', { class: 'cat-list cat-equip' }, ids.map(id => {
      const u = S.UPGRADES[id]
      const why = c.upgrades[id] ? '' : equipNeeds(c, id)
      return h('li', null,
        h('div', null, h('b', null, u.name), h('p', { class: 't-caption' }, F.localize(u.blurb)), why ? h('p', { class: 't-caption c-ochre' }, why) : null),
        c.upgrades[id] ? h('span', { class: 'stamp sm' }, 'Owned')
          : h('button', {
            class: 'btn cat-buy', type: 'button', testid: `buy-${id}`, disabled: !!why,
            onclick: () => tryRun(ctx, { t: 'buy', upgrade: id }, onTry),
          }, 'Buy', h('span', { class: 'sub num' }, F.money(u.cost)), loanAdds(u.cost) >= 0.5 ? h('span', { class: 'loan-adds num' }, `+${F.money(loanAdds(u.cost))} on the loan`) : null))
    })),
    done('equipment-close', onClose),
  ]
}

// ---------------------------------------------------------------- the land mortgage

function bankBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  const m = S.mortgageInfo(c)
  const pay = (amount: number, label: string) => h('button', {
    class: 'btn', type: 'button', testid: `pay-${Math.round(amount)}`, disabled: !!m.payWhy || c.cash < amount,
    onclick: () => tryRun(ctx, { t: 'payMortgage', amount }, onTry),
  }, label, h('span', { class: 'sub num' }, F.money(amount)))
  return [
    h('ul', { class: 'cat-list' }, m.loans.map(x => h('li', null, h('p', { class: 'lead cat-loan' },
      icon('bank', 'i'), h('b', null, x.name), h('span', { class: 'it quiet' }, `of ${F.money(x.loan)}`), h('span', { class: 'dots' }), h('span', { class: 'num' }, F.money(x.owed)))))),
    h('p', { class: 't-caption' }, `At the end of the year the bank takes ${F.money(m.principal)} off the loans plus ${F.money(m.interest)} in interest, which is ${F.pct(m.rate)} of what you owe. Paying extra now saves interest every year after, but it's cash you might need this season.`),
    h('div', { class: 'cat-hall' }, m.owed > 5000 ? pay(5000, 'Pay') : null, m.owed > 20000 ? pay(20000, 'Pay') : null, pay(Math.round(m.owed), 'Pay it all')),
    done('bank-close', onClose),
  ]
}

// ---------------------------------------------------------------- the farm's rules

function rulesBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  return [
    h('div', { class: 'seg-in', role: 'radiogroup', 'aria-label': 'Sundays' },
      ([true, false] as const).map(off => h('label', null,
        h('input', { type: 'radio', name: 'sundays', checked: c.sundaysOff === off, testid: `rule-sundays-${off ? 'off' : 'on'}`, onchange: () => tryRun(ctx, { t: 'sundays', off }, onTry) }),
        h('span', null, off ? 'Sundays off' : 'Work Sundays')))),
    h('p', { class: 't-caption' }, c.sundaysOff ? 'Everyone gets one day off a week and comes back fresh.' : 'You get an extra day of work each week, but everyone gets tired, and tired people slow down, lose heart and get hurt.'),
    done('rules-close', onClose),
  ]
}

// ---------------------------------------------------------------- the folds

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
  const m = S.mortgageInfo(c)
  const rows: FoldRow[] = [{
    id: 'fields', open: 'fields-open', testid: 'fields', glyph: 'plant', name: 'Fields',
    state: [`${potato} in potatoes`, `${open.length - potato} resting`, tracts ? F.plural(tracts, 'tract') : ''].filter(Boolean).join(', '),
    short: `${potato} to plant`, figure: F.money(pc.fields), body: () => fieldsBody(ctx, c),
  }, {
    id: 'people', open: 'crew-open', testid: 'crew', glyph: 'people', name: 'People',
    state: [asking ? `${asking} asking for work` : 'Nobody asking', L.hired ? `${L.hired} hired` : ''].filter(Boolean).join(', '),
    short: asking ? `${asking} asking` : `${L.hired} hired`,
    figure: pc.wages ? `${F.money(pc.wages)} a month` : undefined, body: () => peopleBody(ctx, c, onTry, onClose),
  }, {
    id: 'land', open: 'land-open', testid: 'land', glyph: 'land', name: 'Land',
    state: land.length ? `${forRent} to rent, ${land.length} for sale` : 'You hold all of it', body: () => landBody(ctx, c, onClose),
  }, {
    id: 'contracts', open: 'contracts-open', testid: 'contracts', glyph: 'contract', name: 'Contracts',
    state: [offers ? `${offers} offered` : 'No more offers', signed ? `${signed} signed` : ''].filter(Boolean).join(', '),
    body: () => [springContracts(ctx, c), done('contracts-close', onClose)],
  }, {
    id: 'equipment', open: 'equipment-open', testid: 'equipment', glyph: 'machine', name: 'Equipment',
    state: [owned ? `${owned} owned` : '', owned < ids.length ? `${ids.length - owned} to buy` : ''].filter(Boolean).join(', '),
    body: () => equipmentBody(ctx, c, onTry, onClose),
  }]
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
