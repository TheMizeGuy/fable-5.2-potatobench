// Spring (design/spring.html): the land with its tags, and the seed and supply catalogue at the right with its folds
// and its order blank, where Start the season always is. A field, a lot or a tract picked on the land opens its card.
import * as S from '../sim/index.ts'
import { tracker } from './contracts.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { GLOSSARY, term } from './glossary.ts'
import { icon } from './icons.ts'
import { digitFor, fieldForDigit, heldFields, step } from './map.ts'
import { plates, type PlateModel } from './plates.ts'
import * as R from './rules.ts'
import { cardHead, fieldCost, landCard, springFolds, tenureRow, tractCard, type Fold } from './spring.ts'
import { fold } from './system/parts.ts'
import { topBar } from './top.ts'
import { usualFirstYear } from './usual-year.ts'
import { nextGoal } from '../game/goals.ts'
import { springSlot } from './tutorial.ts'

function varietyTraits(v: S.Variety, c: S.Campaign, world: S.World): string[] {
  return [
    `${v.maturity} maturing`,
    v.market.toLowerCase(),
    `yield: ${R.yieldWord(v)}`,
    ...(R.setWord(v) ? [R.setWord(v)] : []),
    R.blightWord(v), R.scabWord(v), R.droughtWord(v),
    `keeps until ${R.keepsUntil(c.year, v.id, c.upgrades.vent)}`,
    R.seedWord(v),
    v.contract ? `${F.price(v.price)} on a chip plant's contract and ${R.offContract()} that without one` : `${F.price(v.price)} in a usual year`,
    `large potatoes ${R.largeRule(world, c, v.id)}`,
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
    ['Yield', v => `${F.upper(R.yieldWord(v))}${R.setWord(v) ? `. ${F.upper(R.setWord(v))}` : ''}`],
    ['Leaf blight', v => F.upper(R.blightWord(v, true))],
    ['Scab', v => F.upper(R.scabWord(v, true))],
    ['Dry spell', v => F.upper(R.droughtWord(v, true))],
    ['Keeps until', v => R.keepsUntil(c.year, v.id, c.upgrades.vent)],
    ['Saved seed', v => F.upper(R.seedWord(v, true))],
    ['Price', v => v.contract ? `${F.price(v.price)} on contract, but only ${F.price(v.price * S.PROCESSING_PRICE)} without one` : F.price(v.price)],
    ['Large potatoes', v => F.upper(R.largeRule(app.world, c, v.id, true))],
  ]
  ctx.papers.open({
    title: `Varieties for ${R.yearWord(c.year)}`,
    kicker: 'From the seed catalogue',
    testid: 'compare',
    size: 'wide',
    body: () => [
      h('p', { class: 'dlg-lead' }, 'Here\'s how each variety behaves, using the same numbers the game grows your fields with. No single variety wins every year.'),
      h('div', { class: 'table-scroll', tabindex: '0', role: 'group', 'aria-label': 'Varieties side by side' }, h('table', { class: 'compare-t' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', class: 't-label' }, 'Variety'), cols.map(([label]) => h('th', { scope: 'col', class: 't-label' }, label)))),
        h('tbody', null, vs.map(v => h('tr', null,
          h('th', { scope: 'row' }, h('b', null, v.name), h('span', { class: 't-caption' }, v.market)),
          cols.map(([label, text]) => h('td', { 'data-label': label, class: label === 'Price' && v.contract ? 'c-ochre' : null }, text(v)))))))),
      h('p', { class: 't-caption' }, `Price is for US No. 1 in a usual year, averaged over the season. Harvest prices run lower and spring prices higher, but a contract price stays the same all season. Without a contract the chipping variety only gets a processing price, ${R.offContract()} its usual price. Large potatoes, over ${F.grams(S.SIZE_CHEF)}, sell for more or less than the No. 1 price, depending on the variety. "Keeps until" is the last cellar month before a crop dug around September 25 starts to sprout${c.upgrades.vent ? ', with the ventilation' : ''}. Yield is what a full season can produce before weather, blight and the kill date cut into it.${F.cwtNote()}`),
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
    title: `The money, ${R.yearName(c.year)}`,
    kicker: 'Your spring plan in full',
    testid: 'money',
    size: 'medium',
    body: () => [
      h('div', { class: 'ledger-lines' },
        line(c.cash < 0 ? 'Owed from last year' : 'Cash on hand', c.cash),
        line(`${F.upper(F.plural(potato, 'potato field'))} at ${F.money(S.FIELD_COST)}`, -potato * S.FIELD_COST),
        cert ? line(`Certified seed for ${F.plural(cert, 'field')}`, -cert * S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT) : null,
        rest ? line(`${F.upper(F.plural(rest, 'resting field'))} at ${F.money(S.REST_COST)}`, -rest * S.REST_COST) : null,
        pc.rent ? line(`Rent for ${F.plural(rented, 'field')}`, -pc.rent) : null,
        pc.wages ? line(`First month's wages for ${F.plural(paid, 'person', 'people')}`, -pc.wages) : null,
        line(h('b', null, 'This plan'), -pc.total, { testid: 'plan-cost', cls: 'sub-total' }),
        line(h('b', null, 'After planting'), after, { testid: 'plan-after', cls: 'total' })),
      h('p', { class: 't-caption' }, after < S.OPERATING_LIMIT
        ? `The bank only lends up to ${F.money(-S.OPERATING_LIMIT)} for the spring, so rest a field or plant saved seed. Saved seed is free, but it carries virus.`
        : after < 0 ? `The bank's spring loan covers ${F.money(-after)} at no interest, and you repay it from the crop.` : 'You don\'t need to borrow this spring.',
      pc.wages ? ` After that, wages are ${F.money(pc.wages)} every month until the season ends, and you keep paying anyone you keep on over the winter.` : ''),
      h('p', { class: 't-label dlg-sub' }, 'Due at the end of the year'),
      h('div', { class: 'ledger-lines' },
        after < 0 && after >= S.OPERATING_LIMIT ? line('Spring loan repayment', -after) : null,
        line(term('The yearly bank payment', 'the note'), S.NOTE_PAYMENT),
        line(term('Your family\'s living costs', 'the household'), S.LIVING),
        m.owed > 0 ? line(`The land mortgage, ${F.money(m.owed)} owed`, Math.round(m.principal + m.interest)) : null,
        line(h('b', null, 'Due'), (after < 0 && after >= S.OPERATING_LIMIT ? -after : 0) + S.NOTE_PAYMENT + S.LIVING + Math.round(m.principal + m.interest), { cls: 'total' })),
      h('p', { class: 't-caption' }, `Any debt left after that carries into next year at ${F.pct(S.CREDIT_RATE)} interest, and if it's more than ${F.money(-S.CREDIT_LIMIT)} the bank calls in the loan and you lose the farm. Land, buildings and equipment have to be paid for in cash.`),
      y ? [
        h('p', { class: 't-label dlg-sub' }, `Last year, ${R.yearWord(y.year)}`),
        h('div', { class: 'ledger-lines' },
          line('Potato sales', y.revenue - y.restIncome - y.contracts - y.logs - y.stand),
          y.contracts ? line('Delivered on contract', y.contracts) : null,
          y.stand ? line('The farm stand', y.stand) : null,
          y.logs ? line('Logs sold to the mill', y.logs) : null,
          y.restIncome ? line('Oats and clover', y.restIncome) : null,
          line('Growing and storage', -(growing + y.storage + y.packing)),
          y.wages ? line('Wages', -y.wages) : null,
          y.rent ? line('Rent', -y.rent) : null,
          y.land ? line('Land, down payments', -y.land) : null,
          y.mortgage ? line('The land mortgage', -y.mortgage) : null,
          y.building ? line('Buildings', -y.building) : null,
          y.works ? line('Contractors', -y.works) : null,
          y.penalties ? line('Contract penalties', -y.penalties) : null,
          line('Bank payment, living costs and interest', -(y.note + y.living + y.interest)),
          line(h('b', null, 'Cash at year end'), y.cashEnd, { cls: 'total' })),
        h('p', { class: 't-caption' }, `${y.potatoFields ? `You sold ${F.perArea(y.yieldCwtAcre)}.` : 'You didn\'t grow potatoes.'}${nb ? ` Your neighbor sold ${F.perArea(nb.yieldCwtAcre)}.` : ''}`),
      ] : null,
    ],
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'money-close', autofocus: true, onclick: close }, 'Back to the plan', icon('arrow', 'i')),
  })
}

const TRACT_GLYPH: Record<S.Cover, string> = { open: 'idle', woods: 'woods', brush: 'woods', stumps: 'stump' }

export function planScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  // A spring goal's "Show me" opens the fold where it is reached, or picks the tract it is about.
  const goalFold: Partial<Record<string, Fold>> = { tool: 'equipment', hire: 'people', contract: 'contracts', land: 'land', foreman: 'people' }
  const goalTract = (id: string) => {
    const c = app.campaign
    const stage = id === 'stump' ? 'stump' : id === 'fell' ? 'fell' : ''
    return c && stage ? S.tractInfo(c).find(t => t.tenure !== 'none' && t.stage === stage)?.field ?? -1 : -1
  }
  const top = topBar(ctx, {
    ...o,
    canShow: g => {
      const c = app.campaign
      if (!c || c.phase !== 'plan') return false
      if (g.id === 'foreman') return c.crew.some(u => u.kind !== 'farmer')
      return !!goalFold[g.id] || goalTract(g.id) >= 0
    },
    show: g => {
      const t = goalTract(g.id)
      if (t >= 0) { app.select(t); return true }
      const f = goalFold[g.id]
      if (!f) return false
      // Opened outright: the control it leads to is then scrolled into view (light, in top.ts), not held in place.
      if (open !== f) { open = f; ctx.dirty() }
      return true
    },
  })
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
    const r = ctx.run({ t: 'begin' })
    if (!r.ok) return
    app.setSpeed(1)
  }

  // A fold opened or closed stays where it was under the pointer: the sheet scrolls by what moved above it, and when
  // closing leaves too little below to scroll back, a spacer holds the rows still until the pointer leaves the sheet.
  function toggle(id: Fold): void {
    const head = () => rows.querySelector<HTMLElement>(`[data-k="fold-${id}"]`)
    const was = head()?.getBoundingClientRect().top
    open = open === id ? null : id
    ctx.dirty()
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const now = head()?.getBoundingClientRect().top
      if (was === undefined || now === undefined) return
      const shift = now - was
      if (Math.abs(shift) < 1) return
      const room = body.scrollHeight - body.clientHeight - body.scrollTop
      if (shift > room) body.style.paddingBottom = `${Math.ceil(shift - room)}px`
      body.scrollTop += shift
    }))
  }
  sheet.addEventListener('pointerleave', () => { if (body.style.paddingBottom) body.style.paddingBottom = '' })

  function plateModel(i: number): PlateModel | null {
    const c = app.campaign!
    if (!S.held(c, i)) {
      const l = S.landInfo(c).find(x => x.field === i)
      return l ? { name: l.name, glyph: S.standing(l.cover) ? 'woods' : 'land', marks: [], queue: [], badge: null, land: true, said: `${l.name}, ${l.block === 'home' ? 'by the home farm' : 'beyond the home farm'}. You can ${l.rentable ? `rent it for ${F.money(l.rent)} a year or ` : ''}buy it for ${F.money(l.price)}.` } : null
    }
    const key = digitFor(c, i)
    const fp = c.fields[i]
    if (fp.cover !== 'open') {
      return {
        name: S.FIELD_NAMES[i], glyph: TRACT_GLYPH[fp.cover], sub: F.upper(fp.cover === 'stumps' ? 'stumps' : fp.cover), marks: [], queue: [], badge: null, key,
        said: `${S.FIELD_NAMES[i]}, ${S.COVER_WORD[fp.cover]}. A tract you can clear into a field.`,
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
      said: `${S.FIELD_NAMES[i]}. ${potato ? `${v.name} on ${p.seed} seed` : 'Rest year in oats and clover'}${rented ? ', rented' : ''}, ${F.money(fieldCost(p))}.${key ? ` Press ${key} to select it.` : ''}`,
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
        h('span', { class: v.contract ? 'c-ochre' : null, title: v.contract ? GLOSSARY['contract only'] : undefined }, v.contract ? 'contract only' : R.blightWord(v, true)),
        h('span', { class: 'num' }, F.price(v.price))),
      h('span', { class: 'sr', id: `v-more-${v.id}` }, varietyTraits(v, c, app.world).join(', ')))
  }

  function choice(name: string, label: string, opts: [string, string, boolean, () => void, string?][]): HTMLElement {
    return h('div', { class: 'seg-in', role: 'radiogroup', 'aria-label': label }, opts.map(([value, text, on, set, off]) => h('label', { title: off || undefined },
      h('input', { type: 'radio', name, value, checked: on, disabled: !!off, testid: `plan-${name}-${value}`, k: `${name}-${value}`, onchange: set }),
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
        ? [`${R.POSITION_NOTE[info.elev]} ${info.streak > 1 ? `Potatoes ${info.streak} years in a row` : info.streak ? 'Potatoes last year' : 'No potatoes last year'}. The soil is ${R.soilWord(info.soil)} and `, term('early dying'), ` hits ${F.pct(info.vert)} of plants.${info.raw ? ' It\'s new ground, so a first crop will be smaller unless it rests a year.' : ''}`]
        : F.list(sel.map(j => S.FIELD_NAMES[j]))),
      h('div', { class: 'card-crop' },
        choice('crop', 'Crop', [['potato', 'Potatoes', same('crop') && potato, () => setPlan({ crop: 'potato' })], ['rest', 'Rest year', same('crop') && !potato, () => setPlan({ crop: 'rest' })]]),
        h('p', { class: 'card-cost' }, h('span', { class: 't-label' }, sel.length > 1 ? 'Together' : 'Costs'), h('b', { class: 'num', testid: 'field-cost' }, F.money(cost)))),
      potato ? [
        h('div', { class: 'vgrid', role: 'radiogroup', 'aria-label': 'Variety' }, vs.map(x => varietyBox(c, x, same('variety') && x.id === p.variety))),
        h('p', { class: 'note card-note' }, same('variety') ? `${v.blurb}${v.contract ? ` Without a contract it sells ${R.offContract()} its usual price.` : ''}` : 'These fields are planted with different varieties.',
          ' ', h('button', { class: 'btn quiet', type: 'button', testid: 'compare-open', onclick: () => openCompare(ctx) }, 'Compare them all')),
        // Where the seed comes from is always on the card: saved seed is free once some is held back in the cellar.
        h('div', { class: 'card-seed' },
          h('p', { class: 't-label' }, 'Seed'),
          choice('seed', 'Seed', [
            ['certified', `Certified, ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)}`, same('seed') && p.seed === 'certified', () => setPlan({ seed: 'certified' })],
            ['saved', saved > 0 ? `Saved, free (enough for ${saved})` : 'Saved, free', same('seed') && p.seed === 'saved', () => setPlan({ seed: 'saved' }),
              saved > 0 || p.seed === 'saved' ? '' : `You have no saved ${v.name} seed in the cellar`]]),
          h('p', { class: `t-caption${p.seed === 'saved' ? ' c-ochre' : ''}`, testid: 'seed-note' }, saved > 0 || p.seed === 'saved' ? R.savedSeedText(stock)
            : [`You have no saved ${v.name} seed in the cellar. To save some, `, term('hold some back', 'hold back seed'), ' from a stored crop over the winter. It\'s free to plant next spring, but it carries virus.'])),
      ] : h('p', { class: 'note card-note' }, `Oats and clover cost ${F.money(S.REST_COST)} and earn ${F.money(S.REST_INCOME)} in the fall. A rest year restores the soil right away and slowly reduces early dying.`),
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
    // The fold where the slip's goal is reached is ringed, and says so, so it is found without the slip.
    const g = nextGoal(c)
    const goalAt = g && g.now && !g.block ? goalFold[g.id] : undefined
    return [
      folds.filter(f => !later.includes(f)).map(f => {
        const on = open === f.id
        const el = fold({ icon: f.glyph, name: f.name, state: goalAt === f.id && !on ? `${g!.title} here` : phone ? f.short ?? f.state : f.state, figure: f.figure, open: on, controls: on ? `fold-${f.id}` : undefined, testid: f.open, onclick: () => toggle(f.id) })
        if (goalAt === f.id && !on) el.classList.add('goal-ring')
        return h('div', { class: 'cat-fold', k: `fold-${f.id}` }, el,
          on ? h('div', { class: 'cat-open', id: `fold-${f.id}`, testid: f.testid }, f.body()) : null)
      }),
      later.length ? h('div', { class: 'fold more', role: 'group', 'aria-label': 'More sections', k: 'fold-more' },
        later.map(f => h('button', { class: `btn${goalAt === f.id ? ' goal-ring' : ''}`, type: 'button', testid: f.open, 'aria-expanded': 'false', onclick: () => toggle(f.id) }, icon(f.glyph, 'i'), f.name))) : null,
    ]
  }

  function drawFoot(c: S.Campaign): Child {
    const pc = S.planCosts(c)
    const after = c.cash - pc.total
    const over = after < S.OPERATING_LIMIT
    // What the year end takes, whatever the crop (S.moneyNow): the spring loan back, the note, the household, the land
    // mortgage. Whatever raises the loan (a field, a hand, a machine bought from cash) raises what is due by as much.
    const mn = S.moneyNow(app.world, c)
    const loan = over ? 0 : mn.loan
    const due = over ? mn.due.total - mn.due.loan : mn.due.total
    const what = pc.rent || pc.wages ? `with ${F.list([pc.rent ? `rent ${F.money(pc.rent)}` : '', pc.wages ? `wages ${F.money(pc.wages)}` : ''].filter(Boolean))}` : ''
    const parts = F.list([loan ? 'the spring loan' : '', `${F.money(mn.due.note)} for the yearly bank payment`, `${F.money(mn.due.household)} for your family's living costs`, mn.due.mortgage > 0 ? `${F.money(Math.round(mn.due.mortgage))} for the land mortgage` : ''].filter(Boolean))
    return [
      h('div', { class: `plan-money${over ? ' over' : ''}`, testid: 'plan-money' },
        h('p', { class: 'lead quiet pm-cash' }, h('span', { class: 'it' }, c.cash < 0 ? 'Owed from last year' : 'You have'), h('span', { class: 'dots' }),
          h('span', { class: `num${c.cash < 0 ? ' c-red' : ''}`, testid: 'plan-cash' }, F.money(c.cash))),
        h('p', { class: 'lead' }, h('span', null, 'This plan', what ? h('span', { class: 'it quiet', testid: 'plan-rent' }, ` ${what}`) : null), h('span', { class: 'dots' }),
          h('b', { class: 'num big' }, F.money(pc.total))),
        h('p', { class: 'lead quiet pm-loan' }, h('span', { class: 'it' }, over ? 'More than the bank will lend' : after < 0 ? term('The bank\'s spring loan', 'spring loan') : 'Left in cash'), h('span', { class: 'dots' }),
          over ? null : h('span', { class: 'num', testid: 'plan-loan' }, F.money(Math.abs(after)))),
        h('p', { class: 'lead quiet' }, h('span', { class: 'it' }, term('Due at the end of the year', 'due at the year end'), ctx.layout() === 'narrow' ? null : ', from your crop'), h('span', { class: 'dots' }),
          h('span', { class: 'num c-red', testid: 'plan-due' }, F.money(due))),
        h('p', { class: 't-caption pm-parts' }, `That's ${parts}. You keep whatever's left.`),
        c.history.length ? null : h('p', { class: 't-caption pm-usual', testid: 'plan-usual', title: ctx.touch() ? undefined : usualFirstYear(mn.due.note + mn.due.household).full }, usualFirstYear(mn.due.note + mn.due.household).short)),
      over ? h('p', { class: 't-caption c-red', role: 'alert' }, 'Rest a field or plant saved seed, because the bank won\'t lend any more this spring.') : null,
      h('div', { class: 'blank-go' },
        h('button', { class: 'btn go wide', type: 'button', testid: 'begin-season', onclick: begin }, 'Start the season', icon('arrow', 'i')),
        h('button', { class: 'btn quiet', type: 'button', testid: 'money-open', onclick: () => openMoney(ctx) }, 'See the money')),
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
      patch(rows, JSON.stringify([...state, open, nextGoal(c)?.id, c.applicants.map(a => a.id), c.crew.map(u => [u.id, u.wage, u.foreman]), c.offers.map(x => x.id), c.contracts.map(k => k.id),
        c.upgrades, c.mortgages.map(m => Math.round(m.owed)), c.sundaysOff, Math.round(c.cash), c.buildings.length]), () => drawRows(c))
      patch(foot, JSON.stringify([S.planCosts(c), Math.round(c.cash), c.mortgages.map(m => Math.round(m.owed)), app.settings.units, layout]), () => drawFoot(c))
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
