// Spring (design/spring.html): the land with its tags, and the seed and supply catalogue at the right with its folds
// and its order blank, where Start the season always is. A field, a lot or a tract picked on the land opens its card.
import * as S from '../sim/index.ts'
import { tracker } from './contracts.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { digitFor, fieldForDigit, heldFields, step } from './map.ts'
import { plates, type PlateModel } from './plates.ts'
import * as R from './rules.ts'
import { cardHead, fieldCost, landCard, springFolds, tenureRow, tractCard, type Fold } from './spring.ts'
import { fold } from './system/parts.ts'
import { topBar } from './top.ts'
import { holdsClock, springSlot } from './tutorial.ts'

function varietyTraits(v: S.Variety, c: S.Campaign, world: S.World): string[] {
  return [
    `${v.maturity} maturing`,
    v.market.toLowerCase(),
    `yield: ${R.yieldWord(v)}`,
    ...(R.setWord(v) ? [R.setWord(v)] : []),
    R.blightWord(v), R.scabWord(v), R.droughtWord(v),
    `keeps until ${R.keepsUntil(c.year, v.id, c.upgrades.vent)}`,
    R.seedWord(v),
    v.contract ? `${F.price(v.price)} on a chip plant's contract; off contract it sells ${R.offContract()} that` : `${F.price(v.price)} in a usual year`,
    `large tubers ${R.largeRule(world, c, v.id)}`,
  ]
}

// Every variety that can be planted this year, side by side.
function openCompare(ctx: Ctx): void {
  const app = ctx.app
  const c = app.campaign
  if (!c) return
  const vs = S.availableVarieties(c.year)
  const cols: [string, (v: S.Variety) => string][] = [
    ['Matures', v => F.upper(v.maturity)],
    ['Yield', v => `${F.upper(R.yieldWord(v))}${R.setWord(v) ? `; ${R.setWord(v)}` : ''}`],
    ['Leaf blight', v => F.upper(R.blightWord(v, true))],
    ['Scab', v => F.upper(R.scabWord(v, true))],
    ['Dry spell', v => F.upper(R.droughtWord(v, true))],
    ['Keeps until', v => R.keepsUntil(c.year, v.id, c.upgrades.vent)],
    ['Saved seed', v => F.upper(R.seedWord(v, true))],
    ['Price', v => v.contract ? `${F.price(v.price)} on contract. Off contract ${F.price(v.price * S.PROCESSING_PRICE)}: much less` : F.price(v.price)],
    ['Large tubers', v => F.upper(R.largeRule(app.world, c, v.id, true))],
  ]
  ctx.papers.open({
    title: `Varieties for ${R.yearWord(c.year)}`,
    kicker: 'From the seed catalogue',
    testid: 'compare',
    size: 'wide',
    body: () => [
      h('p', { class: 'dlg-lead' }, 'What each variety is like, from the same facts the fields are grown by. No one of them wins every year.'),
      h('div', { class: 'table-scroll', tabindex: '0', role: 'group', 'aria-label': 'Varieties side by side' }, h('table', { class: 'compare-t' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', class: 't-label' }, 'Variety'), cols.map(([label]) => h('th', { scope: 'col', class: 't-label' }, label)))),
        h('tbody', null, vs.map(v => h('tr', null,
          h('th', { scope: 'row' }, h('b', null, v.name), h('span', { class: 't-caption' }, v.market)),
          cols.map(([label, text]) => h('td', { 'data-label': label, class: label === 'Price' && v.contract ? 'c-ochre' : null }, text(v)))))))),
      h('p', { class: 't-caption' }, `Price is for US No. 1 in a usual year, averaged over the season; harvest prices run below it and spring prices above. A contract price does not move with the season. The chipping variety finds only a processing price off contract, ${R.offContract()} its usual price. Large tubers, over ${F.grams(S.SIZE_CHEF)}, sell over or under that price. Keeps until is the last cellar month before sprouting, for a crop dug around September 25${c.upgrades.vent ? ', with the ventilation' : ''}. Yield is what a full season can make, before weather, blight and the kill date take their share.`),
    ],
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'compare-close', autofocus: true, onclick: close }, 'Back to the plan', icon('arrow', 'i')),
  })
}

// A line of an account: the label, a dot leader, the figure right; a negative figure carries its minus sign in red.
function line(label: Child, value: number, o: { testid?: string; cls?: string } = {}): HTMLElement {
  return h('p', { class: `lead${o.cls ? ` ${o.cls}` : ''}` }, h('span', null, label), h('span', { class: 'dots' }),
    h('span', { class: `num${value < 0 ? ' c-red' : ''}`, testid: o.testid }, F.money(value)))
}

// The money behind the order blank: what the plan costs, what the bank lends, what comes due.
function openMoney(ctx: Ctx): void {
  const app = ctx.app
  const c = app.campaign
  if (!c) return
  const pc = S.planCosts(c)
  const after = c.cash - pc.total
  const mine = heldFields(c).filter(i => c.fields[i].cover === 'open')
  const potato = mine.filter(i => c.plans[i].crop === 'potato').length
  const cert = mine.filter(i => c.plans[i].crop === 'potato' && c.plans[i].seed === 'certified').length
  const rest = mine.length - potato
  const rented = mine.filter(i => c.fields[i].tenure === 'rented').length
  const paid = c.crew.filter(u => u.wage > 0).length
  const m = S.mortgageInfo(c)
  const y = c.history[c.history.length - 1]
  const nb = y ? app.world.neighbor[String(y.year)] : undefined
  const growing = y ? y.costs - y.wages - y.rent - y.land - y.penalties - y.storage - y.mortgage - y.works - y.building - y.packing : 0
  ctx.papers.open({
    title: `The money, ${R.yearName(S.yearNow(c))}`,
    kicker: 'The order blank in full',
    testid: 'money',
    size: 'medium',
    body: () => [
      h('div', { class: 'ledger-lines' },
        line(c.cash < 0 ? 'Owed from last year' : 'Cash on hand', c.cash),
        line(`${F.upper(F.plural(potato, 'potato field'))} at ${F.money(S.FIELD_COST)}`, -potato * S.FIELD_COST),
        cert ? line(`Certified seed for ${cert}`, -cert * S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT) : null,
        rest ? line(`${rest} resting at ${F.money(S.REST_COST)}`, -rest * S.REST_COST) : null,
        pc.rent ? line(`Rent for ${F.plural(rented, 'field')}`, -pc.rent) : null,
        pc.wages ? line(`The first month's wages, ${F.plural(paid, 'person', 'people')}`, -pc.wages) : null,
        line(h('b', null, 'This plan'), -pc.total, { testid: 'plan-cost', cls: 'sub-total' }),
        line(h('b', null, 'After planting'), after, { testid: 'plan-after', cls: 'total' })),
      h('p', { class: 't-caption' }, after < S.OPERATING_LIMIT
        ? `The bank lends up to ${F.money(-S.OPERATING_LIMIT)} for the spring. Rest a field, or plant saved seed: it is free, but it carries virus.`
        : after < 0 ? `The bank's spring loan covers ${F.money(-after)}, repaid from the crop. The spring loan itself is free.` : 'No spring borrowing is needed.',
      pc.wages ? ` Then ${F.money(pc.wages)} in wages every month until the season closes, and for anyone kept on over the winter.` : ''),
      h('p', { class: 't-label dlg-sub' }, 'Due at the year end'),
      h('div', { class: 'ledger-lines' },
        line('The note on the farm', S.NOTE_PAYMENT),
        line('The household', S.LIVING),
        m.owed > 0 ? line(`The land mortgage, ${F.money(m.owed)} owed`, Math.round(m.principal + m.interest)) : null,
        line(h('b', null, 'Due'), S.NOTE_PAYMENT + S.LIVING + Math.round(m.principal + m.interest), { cls: 'total' })),
      h('p', { class: 't-caption' }, `Debt left after those is carried into next year at ${F.pct(S.CREDIT_RATE)} interest, and the bank calls the note if it is more than ${F.money(-S.CREDIT_LIMIT)}. Land, buildings and equipment are bought from cash.`),
      y ? [
        h('p', { class: 't-label dlg-sub' }, `Last year, ${R.yearWord(y.year)}`),
        h('div', { class: 'ledger-lines' },
          line('Potato sales', y.revenue - y.restIncome - y.contracts - y.logs - y.stand),
          y.contracts ? line('Delivered on contract', y.contracts) : null,
          y.stand ? line('The farm stand', y.stand) : null,
          y.logs ? line('Logs to the mill', y.logs) : null,
          y.restIncome ? line('Oats and clover', y.restIncome) : null,
          line('Growing and storage', -(growing + y.storage + y.packing)),
          y.wages ? line('Wages', -y.wages) : null,
          y.rent ? line('Rent', -y.rent) : null,
          y.land ? line('Land, the quarter down', -y.land) : null,
          y.mortgage ? line('The land mortgage', -y.mortgage) : null,
          y.building ? line('Buildings', -y.building) : null,
          y.works ? line('Contractors', -y.works) : null,
          y.penalties ? line('Contract penalties', -y.penalties) : null,
          line('Note, household and interest', -(y.note + y.living + y.interest)),
          line(h('b', null, 'Cash at the year end'), y.cashEnd, { cls: 'total' })),
        h('p', { class: 't-caption' }, `${y.potatoFields ? `Your yield sold: ${F.perArea(y.yieldCwtAcre)}.` : 'No potatoes were grown.'}${nb ? ` The neighbour sold ${F.perArea(nb.yieldCwtAcre)}.` : ''}`),
      ] : null,
    ],
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'money-close', autofocus: true, onclick: close }, 'Back to the plan', icon('arrow', 'i')),
  })
}

const TRACT_GLYPH: Record<S.Cover, string> = { open: 'idle', woods: 'woods', brush: 'woods', stumps: 'stump' }

export function planScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  // A field, a lot or a tract picked on the land: its card, docked left, since the catalogue holds the right.
  const card = h('section', { class: 'command docked-left spring-card sheet sys', 'aria-label': 'The selected field', testid: 'plan-card', hidden: true })
  // The contracts signed stand under the folds: they are money promised.
  const track = tracker(ctx)
  const mast = h('header', { class: 'masthead' })
  const rows = h('div', { class: 'cat-folds' })
  const foot = h('footer', { class: 'order-blank' })
  const body = h('div', { class: 'cat-body', 'data-scroll': 'spring' }, rows, track.el)
  const sheet = h('section', { class: 'catalogue sheet sys', 'aria-label': 'The spring plan', testid: 'spring' }, mast, body, springSlot(), foot)
  const notesSlot = h('div', { class: 'notes-slot' })
  const el = h('main', { class: 'spring-screen sys' }, top.el, notesSlot, card, sheet)
  // Every fold starts shut: a newcomer's first spring is a short sheet (e2e/play.spec.ts), each fold one click away.
  let open: Fold | null = null
  let note = ''
  let focused = false

  function onTry(err: string): void {
    note = err
    if (err) ctx.announce(err)
    ctx.dirty()
  }

  function setPlan(change: Partial<S.FieldPlan>): void {
    const c = app.campaign
    if (!c) return
    note = ''
    for (const i of app.selection) {
      if (!S.isField(c, i)) continue
      const p = { ...c.plans[i], ...change }
      if (change.variety && change.variety !== c.plans[i].variety) p.seed = 'certified'
      const r = app.do({ t: 'plan', field: i, plan: p })
      if (!r.ok) note = r.err
    }
    if (note) ctx.announce(note)
    ctx.dirty()
  }

  function begin(): void {
    const held = holdsClock(app.campaign)
    const r = ctx.run({ t: 'begin' })
    if (!r.ok) return
    // The guided first season waits for its lesson on the clock.
    if (!held) app.setSpeed(1)
  }

  function toggle(id: Fold): void {
    open = open === id ? null : id
    ctx.dirty()
    if (open) requestAnimationFrame(() => rows.querySelector<HTMLElement>(`[data-k="fold-${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: ctx.reduced() ? 'auto' : 'smooth' }))
  }

  function plateModel(i: number): PlateModel | null {
    const c = app.campaign!
    if (!S.held(c, i)) {
      const l = S.landInfo(c).find(x => x.field === i)
      return l ? { name: l.name, glyph: S.standing(l.cover) ? 'woods' : 'land', marks: [], queue: [], badge: null, land: true, said: `${l.name}, ${l.block === 'home' ? 'by the home farm' : 'beyond the home farm'}: ${l.rentable ? `to rent at ${F.money(l.rent)} a year or ` : ''}to buy for ${F.money(l.price)}.` } : null
    }
    const key = digitFor(c, i)
    const fp = c.fields[i]
    if (fp.cover !== 'open') {
      return {
        name: S.FIELD_NAMES[i], glyph: TRACT_GLYPH[fp.cover], sub: F.upper(fp.cover === 'stumps' ? 'stumps' : fp.cover), marks: [], queue: [], badge: null, key,
        said: `${S.FIELD_NAMES[i]}: ${S.COVER_WORD[fp.cover]}, a tract to clear into a field.`,
      }
    }
    const p = c.plans[i]
    const potato = p.crop === 'potato'
    const v = S.variety(p.variety)
    const rented = fp.tenure === 'rented'
    return {
      name: S.FIELD_NAMES[i],
      glyph: potato ? 'planted' : 'rest',
      sub: potato ? v.name : 'Resting',
      marks: [...(potato && p.seed === 'saved' ? [{ glyph: 'sprout', cls: 'warn' }] : []), ...(rented ? [{ glyph: 'land', cls: '' }] : [])],
      queue: [], badge: null, key,
      said: `${S.FIELD_NAMES[i]} ${potato ? v.name : 'Rest year'}: ${key ? `key ${key}, ` : ''}${rented ? 'rented, ' : ''}${potato ? `on ${p.seed} seed` : 'in oats and clover'}, ${F.money(fieldCost(p))}.`,
    }
  }
  const P = plates(ctx, plateLayer, { model: plateModel, onBadge: () => {}, covers: () => card.hidden ? [] : [card.getBoundingClientRect()] })

  // A variety as a printed box to tick: its name, how it matures and yields, its price; what else it is like is said
  // to a screen reader, and in full on the comparison sheet.
  function varietyBox(c: S.Campaign, v: S.Variety, on: boolean): HTMLElement {
    return h('label', { class: 'vbox' },
      h('input', { type: 'radio', name: 'variety', value: v.id, checked: on, testid: `plan-variety-${v.id}`, k: `v-${v.id}`, 'aria-describedby': `v-more-${v.id}`, onchange: () => setPlan({ variety: v.id }) }),
      h('span', { class: 'vbox-in' },
        h('b', null, v.name),
        h('span', { class: 'it' }, `${v.maturity}, ${R.yieldWord(v).split(',')[0]}`),
        h('span', { class: v.contract ? 'c-ochre' : null }, v.contract ? 'contract only' : R.blightWord(v, true)),
        h('span', { class: 'num' }, F.price(v.price))),
      h('span', { class: 'sr', id: `v-more-${v.id}` }, varietyTraits(v, c, app.world).join(', ')))
  }

  function choice(name: string, label: string, opts: [string, string, boolean, () => void][]): HTMLElement {
    return h('div', { class: 'seg-in', role: 'radiogroup', 'aria-label': label }, opts.map(([value, text, on, set]) => h('label', null,
      h('input', { type: 'radio', name, value, checked: on, testid: `plan-${name}-${value}`, k: `${name}-${value}`, onchange: set }),
      h('span', null, text))))
  }

  function drawCard(c: S.Campaign, sel: number[]): Child {
    const i = sel[0]
    if (!S.held(c, i)) return landCard(ctx, c, i, note, onTry)
    if (c.fields[i].cover !== 'open') return tractCard(ctx, c, i, note, onTry)
    const one = sel.length === 1
    const p = c.plans[i]
    const same = (k: keyof S.FieldPlan) => sel.every(j => c.plans[j][k] === p[k])
    const potato = p.crop === 'potato'
    const info = S.fieldInfo(c, i)
    const vs = S.availableVarieties(c.year)
    const v = S.variety(p.variety)
    const stock = c.seedStock.filter(x => x.variety === p.variety && x.fields > 0)
    const saved = stock.reduce((a, x) => a + x.fields, 0)
    const cost = sel.reduce((a, j) => a + fieldCost(c.plans[j]), 0)
    return [
      cardHead(ctx, one ? 'Field record' : 'Fields', one ? info.name : `${sel.length} fields`, one
        ? `${R.POSITION_NOTE[info.elev]} ${F.upper(F.plural(info.streak, 'year'))} in potatoes, soil ${R.soilWord(info.soil)}, early dying in ${F.pct(info.vert)}.${info.raw ? ' New ground: a first crop grows less unless it rests a year.' : ''}`
        : F.list(sel.map(j => S.FIELD_NAMES[j]))),
      h('div', { class: 'card-crop' },
        choice('crop', 'Crop', [['potato', 'Potatoes', same('crop') && potato, () => setPlan({ crop: 'potato' })], ['rest', 'Rest year', same('crop') && !potato, () => setPlan({ crop: 'rest' })]]),
        h('p', { class: 'card-cost' }, h('span', { class: 't-label' }, sel.length > 1 ? 'Together' : 'Costs'), h('b', { class: 'num', testid: 'field-cost' }, F.money(cost)))),
      potato ? [
        h('div', { class: 'vgrid', role: 'radiogroup', 'aria-label': 'Variety' }, vs.map(x => varietyBox(c, x, same('variety') && x.id === p.variety))),
        h('p', { class: 'note card-note' }, same('variety') ? `${v.blurb}${v.contract ? ` Off contract it sells ${R.offContract()} its usual price.` : ''}` : 'These fields are in different varieties.',
          ' ', h('button', { class: 'btn quiet', type: 'button', testid: 'compare-open', onclick: () => openCompare(ctx) }, 'Compare them all')),
        saved > 0 || p.seed === 'saved' ? h('div', { class: 'card-seed' },
          choice('seed', 'Seed', [
            ['certified', `Certified, ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)}`, same('seed') && p.seed === 'certified', () => setPlan({ seed: 'certified' })],
            ['saved', `Saved, free (enough for ${saved})`, same('seed') && p.seed === 'saved', () => setPlan({ seed: 'saved' })]]),
          h('p', { class: `t-caption${p.seed === 'saved' ? ' c-ochre' : ''}`, testid: 'seed-note' }, R.savedSeedText(stock))) : null,
      ] : h('p', { class: 'note card-note' }, `Oats and clover: costs ${F.money(S.REST_COST)}, earns ${F.money(S.REST_INCOME)} in the fall. A rest year puts the soil back at once and wears early dying down slowly.`),
      one ? tenureRow(ctx, c, i, onTry) : null,
      note ? h('p', { class: 'card-refused c-red', role: 'alert' }, note) : null,
    ]
  }

  function drawMast(c: S.Campaign): Child {
    return [h('h1', null, 'Spring'), h('span', { class: 't-label' }, R.seasonCount(c))]
  }

  function drawRows(c: S.Campaign): Child {
    const folds = springFolds(ctx, c, onTry, () => { open = null; ctx.dirty() })
    const phone = ctx.layout() === 'narrow'
    // On a phone the folds after the people stand as one row of buttons until one is opened (design/spring.phone.html).
    const later = phone ? folds.filter(f => f.id !== 'fields' && f.id !== 'people' && f.id !== open) : []
    return [
      folds.filter(f => !later.includes(f)).map(f => {
        const on = open === f.id
        return h('div', { class: 'cat-fold', k: `fold-${f.id}` },
          fold({ icon: f.glyph, name: f.name, state: phone ? f.short ?? f.state : f.state, figure: f.figure, open: on, controls: on ? `fold-${f.id}` : undefined, testid: f.open, onclick: () => toggle(f.id) }),
          on ? h('div', { class: 'cat-open', id: `fold-${f.id}`, testid: f.testid }, f.body()) : null)
      }),
      later.length ? h('div', { class: 'fold more', role: 'group', 'aria-label': 'The other folds', k: 'fold-more' },
        later.map(f => h('button', { class: 'btn', type: 'button', testid: f.open, 'aria-expanded': 'false', onclick: () => toggle(f.id) }, icon(f.glyph, 'i'), f.name))) : null,
    ]
  }

  function drawFoot(c: S.Campaign): Child {
    const pc = S.planCosts(c)
    const after = c.cash - pc.total
    const over = after < S.OPERATING_LIMIT
    const m = S.mortgageInfo(c)
    const due = S.NOTE_PAYMENT + S.LIVING + Math.round(m.principal + m.interest)
    const what = pc.rent || pc.wages ? `with ${F.list([pc.rent ? `rent ${F.money(pc.rent)}` : '', pc.wages ? `wages ${F.money(pc.wages)}` : ''].filter(Boolean))}` : ''
    return [
      h('div', { class: `plan-money${over ? ' over' : ''}`, testid: 'plan-money' },
        h('p', { class: 'lead' }, h('span', null, 'This plan', what ? h('span', { class: 'it quiet', testid: 'plan-rent' }, ` ${what}`) : null), h('span', { class: 'dots' }),
          h('b', { class: 'num big' }, F.money(pc.total))),
        h('p', { class: 'lead quiet pm-loan' }, h('span', { class: 'it' }, over ? 'More than the bank will lend' : after < 0 ? 'On the spring loan' : 'From cash, leaving'), h('span', { class: 'dots' }),
          over ? null : h('span', { class: 'num' }, F.money(Math.abs(after)))),
        h('p', { class: 'lead quiet' }, h('span', { class: 'it' }, 'Due at the year end'), h('span', { class: 'dots' }), h('span', { class: 'num c-red' }, F.money(due)))),
      over ? h('p', { class: 't-caption c-red', role: 'alert' }, 'Rest a field or plant saved seed: the bank will not lend more for the spring.') : null,
      h('div', { class: 'blank-go' },
        h('button', { class: 'btn go wide', type: 'button', testid: 'begin-season', onclick: begin }, 'Start the season', icon('arrow', 'i')),
        h('button', { class: 'btn quiet', type: 'button', testid: 'money-open', onclick: () => openMoney(ctx) }, 'The money')),
    ]
  }

  return {
    el,
    notes: notesSlot,
    key(e) {
      if (e.altKey || e.metaKey || e.ctrlKey) return false
      const c = app.campaign
      if (!c) return false
      const t = e.target as HTMLElement
      const onTag = !!t.closest?.('.plate, .tag')
      const onControl = !!t.closest?.('button, input, a')
      if (e.key === 'Escape') {
        if (app.selection.length) { app.select(-1); return true }
        if (open) { open = null; ctx.dirty(); return true }
        return false
      }
      if (e.key === 'Tab' && (!onControl || onTag) && app.selection.length) {
        app.select(step(heldFields(c), app.selected, e.shiftKey))
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        return true
      }
      const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code)
      if (digit && !t.closest?.('input')) {
        const i = fieldForDigit(c, Number(digit[1]))
        if (i >= 0) app.select(i, e.shiftKey)
        return true
      }
      return false
    },
    update() {
      const c = app.campaign
      if (!c) return
      const layout = ctx.layout()
      el.dataset.layout = layout
      top.update()
      track.update()
      P.update()
      const sel = app.selection.filter(i => i >= 0 && i < S.FIELD_COUNT)
      // Land the farm does not hold, and tracts, are looked at one at a time.
      const last = sel[sel.length - 1]
      const shown = last === undefined ? [] : !S.isField(c, last) ? [last] : sel.filter(i => S.isField(c, i))
      const was = card.hidden
      card.hidden = shown.length === 0
      el.classList.toggle('selected', shown.length > 0)
      if (shown.length) {
        patch(card, JSON.stringify([shown, c.plans, c.seedStock, note, app.settings.units, c.year, c.fields.map(f => [f.tenure, f.cover, f.works?.left]), Math.round(c.cash), c.mortgages.length]), () => drawCard(c, shown))
        if (was && !ctx.reduced()) { card.classList.remove('in'); void card.offsetWidth; card.classList.add('in') }
      } else note = ''
      const state = [c.year, c.history.length, c.plans, c.fields.map(f => [f.tenure, f.cover]), c.seedStock.length, app.settings.units, layout]
      patch(mast, JSON.stringify([c.year, c.yearIdx]), () => drawMast(c))
      patch(rows, JSON.stringify([...state, open, c.applicants.map(a => a.id), c.crew.map(u => [u.id, u.wage]), c.offers.map(x => x.id), c.contracts.map(k => k.id),
        c.upgrades, c.mortgages.map(m => Math.round(m.owed)), c.sundaysOff, Math.round(c.cash), c.buildings.length]), () => drawRows(c))
      patch(foot, JSON.stringify([S.planCosts(c), Math.round(c.cash), c.mortgages.map(m => Math.round(m.owed)), app.settings.units]), () => drawFoot(c))
      el.style.setProperty('--foot-h', `${Math.round(foot.offsetHeight)}px`)
      // The one thing to do here is under the keyboard from the start.
      if (!focused && !ctx.papers.isOpen()) {
        const start = foot.querySelector<HTMLElement>('[data-k="begin-season"]')
        const at = document.activeElement
        const free = !at || at === document.body || !!at.closest('[inert]')
        if (free) start?.focus({ preventScroll: true })
        focused = document.activeElement === start || !free
        if (!focused) setTimeout(() => ctx.dirty(), 200)
      }
    },
    insets() {
      const t = top.el.getBoundingClientRect().bottom
      const s = sheet.getBoundingClientRect()
      if (ctx.layout() === 'narrow') {
        const low = card.hidden ? s.top : Math.min(s.top, card.getBoundingClientRect().top)
        return [t, 0, innerHeight - low + 8, 0]
      }
      // The card opening on a click never moves the camera: only the sheet, which always stands, frames the land.
      return [t, innerWidth - s.left + 8, 0, 0]
    },
    frame: () => P.frame(),
    dispose() { P.dispose() },
  }
}
