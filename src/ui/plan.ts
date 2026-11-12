// Spring, on the map: each plate shows the plan, a selected field or lot opens a small card, and the spring sheet
// beside the land holds the one button that matters, Start the season, under the offers that grow the farm.
import * as S from '../sim/index.ts'
import { tracker } from './contracts.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { digitFor, fieldForDigit, heldFields, step } from './map.ts'
import { plates, type PlateModel } from './plates.ts'
import * as R from './rules.ts'
import { fieldCost, landCard, springFolds, tenureRow, tractCard, type Fold } from './spring.ts'
import { topBar } from './top.ts'

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
    testid: 'compare',
    size: 'wide',
    body: () => [
      h('p', { class: 't-lede' }, 'What each variety is like, from the same facts the fields are grown by. No one of them wins every year.'),
      h('div', { class: 'table-wrap', tabindex: '0', role: 'group', 'aria-label': 'Varieties side by side' }, h('table', { class: 'compare' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Variety'), cols.map(([label]) => h('th', { scope: 'col' }, label)))),
        h('tbody', null, vs.map(v => h('tr', null,
          h('th', { scope: 'row' }, h('span', { class: 'v-name' }, v.name), h('span', { class: 'sub' }, v.market)),
          cols.map(([label, text]) => h('td', { 'data-label': label, class: label === 'Price' && v.contract ? 'warn-text' : null }, text(v)))))))),
      h('p', { class: 'sub' }, `Price is for US No. 1 in a usual year, averaged over the season; harvest prices run below it and spring prices above. A contract price does not move with the season. The chipping variety finds only a processing price off contract, ${R.offContract()} its usual price. Large tubers, over ${F.grams(S.SIZE_CHEF)}, sell over or under that price. Keeps until is the last cellar month before sprouting, for a crop dug around September 25${c.upgrades.vent ? ', with the ventilation' : ''}. Yield is what a full season can make, before weather, blight and the kill date take their share.`),
    ],
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'compare-close', autofocus: true, onclick: close }, 'Back to the plan'),
  })
}

function row(label: string, value: number, o: { testid?: string; cls?: string } = {}): HTMLElement {
  return h('tr', { class: o.cls ?? null }, h('th', { scope: 'row' }, label), h('td', { testid: o.testid, class: value < 0 && o.cls === 'total' ? 'neg' : null }, F.money(value)))
}

// The money behind the one line: what the plan costs, what the bank lends, what comes due.
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
    title: `The money: ${R.yearName(c.year)}, spring`,
    testid: 'money',
    size: 'medium',
    body: () => [
      h('table', { class: 'money' },
        h('tbody', null,
          row(c.cash < 0 ? 'Owed from last year' : 'Cash on hand', c.cash),
          row(`${F.plural(potato, 'potato field')} at ${F.money(S.FIELD_COST)}`, -potato * S.FIELD_COST),
          cert ? row(`Certified seed for ${cert}`, -cert * S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT) : null,
          rest ? row(`${rest} resting at ${F.money(S.REST_COST)}`, -rest * S.REST_COST) : null,
          pc.rent ? row(`Rent for ${F.plural(rented, 'field')}`, -pc.rent) : null,
          pc.wages ? row(`The first month's wages, ${F.plural(paid, 'person', 'people')}`, -pc.wages) : null,
          row('This plan', -pc.total, { testid: 'plan-cost', cls: 'subtotal' }),
          row('After planting', after, { testid: 'plan-after', cls: 'total' }))),
      h('p', null, after < S.OPERATING_LIMIT
        ? `The bank lends up to ${F.money(-S.OPERATING_LIMIT)} for the spring. Rest a field, or plant saved seed: it is free, but it carries virus.`
        : after < 0 ? `The bank's spring loan covers ${F.money(-after)}, repaid from the crop. The spring loan itself is free.` : 'No spring borrowing is needed.'),
      pc.wages ? h('p', { class: 'sub' }, `Then ${F.money(pc.wages)} in wages every month until the season closes, and for anyone kept on over the winter.`) : null,
      h('h3', { class: 'block-head' }, 'Due at year end'),
      h('table', { class: 'money' },
        h('tbody', null,
          row('The note on the farm', S.NOTE_PAYMENT),
          row('The household', S.LIVING),
          m.owed > 0 ? row(`The land mortgage, ${F.money(m.owed)} owed`, Math.round(m.principal + m.interest)) : null,
          row('Due', S.NOTE_PAYMENT + S.LIVING + Math.round(m.principal + m.interest), { cls: 'total' }))),
      h('p', { class: 'sub' }, `Debt left after those is carried into next year at ${F.pct(S.CREDIT_RATE)} interest, and the bank calls the note if it is more than ${F.money(-S.CREDIT_LIMIT)}. Each job in the field is charged as it is done, wages by the month, and the cellar by the month. Land, buildings and equipment are bought from cash.`),
      y ? [
        h('h3', { class: 'block-head' }, `Last year, ${R.yearWord(y.year)}`),
        h('table', { class: 'money' },
          h('tbody', null,
            row('Potato sales', y.revenue - y.restIncome - y.contracts - y.logs - y.stand),
            y.contracts ? row('Delivered on contract', y.contracts) : null,
            y.stand ? row('The farm stand', y.stand) : null,
            y.logs ? row('Logs to the mill', y.logs) : null,
            y.restIncome ? row('Oats and clover', y.restIncome) : null,
            row('Growing and storage', -(growing + y.storage + y.packing)),
            y.wages ? row('Wages', -y.wages) : null,
            y.rent ? row('Rent', -y.rent) : null,
            y.land ? row('Land, the quarter down', -y.land) : null,
            y.mortgage ? row('The land mortgage', -y.mortgage) : null,
            y.building ? row('Buildings', -y.building) : null,
            y.works ? row('Contractors', -y.works) : null,
            y.penalties ? row('Contract penalties', -y.penalties) : null,
            row('Note, household and interest', -(y.note + y.living + y.interest)),
            row('Cash at year end', y.cashEnd, { cls: 'total' }))),
        h('p', { class: 'sub' }, `${y.potatoFields ? `Your yield sold: ${F.perArea(y.yieldCwtAcre)}.` : 'No potatoes were grown.'}${nb ? ` The neighbor sold ${F.perArea(nb.yieldCwtAcre)}.` : ''}`),
      ] : null,
    ],
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'money-close', autofocus: true, onclick: close }, 'Back to the plan'),
  })
}

const TRACT_GLYPH: Record<S.Cover, string> = { open: 'idle', woods: 'tree', brush: 'tree', stumps: 'stump' }

export function planScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const card = h('section', { class: 'card plan-card instrument', 'aria-label': 'The selected field', testid: 'plan-card', hidden: true })
  // The contracts signed stand under the folds: they are money promised.
  const track = tracker(ctx)
  const head = h('header', { class: 'spring-head' })
  const rows = h('div', { class: 'spring-rows' })
  const foot = h('footer', { class: 'spring-foot' })
  const body = h('div', { class: 'spring-body', 'data-scroll': 'spring' }, head, rows, track.el)
  const sheet = h('section', { class: 'paper spring-sheet', 'aria-label': 'The spring plan', testid: 'spring' }, body, foot)
  const notesSlot = h('div', { class: 'notes-slot' })
  const el = h('main', { class: 'season plan spring' }, top.el, notesSlot, h('div', { class: 'bottom' }, card), sheet)
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

  function toggle(id: Fold): void {
    open = open === id ? null : id
    ctx.dirty()
    if (open) requestAnimationFrame(() => rows.querySelector<HTMLElement>(`[data-k="fold-${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: ctx.reduced() ? 'auto' : 'smooth' }))
  }

  function plateModel(i: number): PlateModel | null {
    const c = app.campaign!
    if (!S.held(c, i)) {
      const l = S.landInfo(c).find(x => x.field === i)
      return l ? { name: l.name, glyph: S.standing(l.cover) ? 'tree' : 'land', marks: [], queue: [], badge: null, land: true, said: `${l.name}, ${l.block === 'home' ? 'by the home farm' : 'beyond the home farm'}: ${l.rentable ? `to rent at ${F.money(l.rent)} a year or ` : ''}to buy for ${F.money(l.price)}.` } : null
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
      sub: potato ? v.name : 'Rest year',
      marks: [...(potato && p.seed === 'saved' ? [{ glyph: 'sprout', cls: 'warn' }] : []), ...(rented ? [{ glyph: 'land', cls: '' }] : [])],
      queue: [], badge: null, key,
      said: `${S.FIELD_NAMES[i]} ${potato ? v.name : 'Rest year'}: ${key ? `key ${key}, ` : ''}${rented ? 'rented, ' : ''}${potato ? `on ${p.seed} seed` : 'in oats and clover'}, ${F.money(fieldCost(p))}.`,
    }
  }
  const P = plates(ctx, plateLayer, { model: plateModel, onBadge: () => {} })

  function varietyCard(c: S.Campaign, v: S.Variety, on: boolean): HTMLElement {
    return h('label', { class: 'vcard' },
      h('input', { type: 'radio', name: 'variety', value: v.id, checked: on, testid: `plan-variety-${v.id}`, k: `v-${v.id}`, 'aria-describedby': `v-more-${v.id}`, onchange: () => setPlan({ variety: v.id }) }),
      h('span', { class: 'vcard-in' },
        h('span', { class: 'v-name' }, v.name),
        h('span', { class: 'v-marks' },
          h('span', null, icon('stale', 'ic s'), v.maturity),
          h('span', null, icon('bulk', 'ic s'), R.yieldWord(v).split(',')[0]),
          v.contract ? h('span', { class: 'v-contract' }, icon('contract', 'ic s'), 'contract only') : h('span', null, icon('blight-old', 'ic s'), R.blightWord(v, true))),
        h('span', { class: 'v-price num' }, F.price(v.price))),
      h('span', { class: 'sr', id: `v-more-${v.id}` }, varietyTraits(v, c, app.world).join(', ')))
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
      h('header', { class: 'card-head plan-head' },
        h('div', null,
          h('h2', { class: 't-head', testid: 'card-title' }, one ? info.name : `${sel.length} fields`),
          h('p', { class: 'card-sub' }, one
            ? `${R.POSITION_NOTE[info.elev]} ${F.plural(info.streak, 'year')} in potatoes, soil ${R.soilWord(info.soil)}, early dying in ${F.pct(info.vert)} of plants.${info.raw ? ' New ground: a first potato crop grows less unless it rests a year.' : ''}`
            : F.list(sel.map(j => S.FIELD_NAMES[j])))),
        h('div', { class: 'plan-row' },
          h('div', { class: 'nseg', role: 'radiogroup', 'aria-label': 'Crop' },
            (['potato', 'rest'] as const).map(crop => h('label', { class: 'nseg-opt' },
              h('input', { type: 'radio', name: 'crop', value: crop, checked: same('crop') && p.crop === crop, testid: `plan-crop-${crop}`, k: `crop-${crop}`, onchange: () => setPlan({ crop }) }),
              h('span', null, crop === 'potato' ? 'Potatoes' : 'Rest year')))),
          h('span', { class: 'plan-cost num', testid: 'field-cost' }, F.money(cost)),
          potato ? h('button', { class: 'nbtn', type: 'button', testid: 'compare-open', onclick: () => openCompare(ctx) }, 'Compare') : null),
        h('button', { class: 'nicon', type: 'button', testid: 'card-close', 'aria-label': 'Deselect', onclick: () => app.select(-1) }, icon('close'))),
      potato ? [
        h('div', { class: 'vcards', role: 'radiogroup', 'aria-label': 'Variety' }, vs.map(x => varietyCard(c, x, same('variety') && x.id === p.variety))),
        h('p', { class: 'card-line note' }, same('variety') ? `${v.blurb}${v.contract ? ` Off contract it sells ${R.offContract()} its usual price.` : ''}` : 'These fields are in different varieties.'),
        saved > 0 || p.seed === 'saved' ? h('div', { class: 'plan-row' },
          h('div', { class: 'nseg', role: 'radiogroup', 'aria-label': 'Seed' },
            (['certified', 'saved'] as const).map(seed => h('label', { class: 'nseg-opt' },
              h('input', { type: 'radio', name: 'seed', value: seed, checked: same('seed') && p.seed === seed, testid: `plan-seed-${seed}`, k: `seed-${seed}`, onchange: () => setPlan({ seed }) }),
              h('span', null, seed === 'certified' ? `Certified seed, ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)}` : `Saved seed, free (enough for ${saved})`)))),
          h('p', { class: `card-line${p.seed === 'saved' ? ' urgent' : ''}`, testid: 'seed-note' }, R.savedSeedText(stock))) : null,
      ] : h('p', { class: 'card-line' }, `Oats and clover: costs ${F.money(S.REST_COST)}, earns ${F.money(S.REST_INCOME)} in the fall. A rest year puts the soil back at once and wears early dying down slowly.`),
      one ? tenureRow(ctx, c, i, onTry) : null,
      note ? h('p', { class: 'card-line flash lv-warn', role: 'alert' }, note) : null,
    ]
  }

  // The sheet's heading: where the farm stands, in a line.
  function drawHead(c: S.Campaign): Child {
    const first = c.history.length === 0
    const y = c.history[c.history.length - 1]
    const open = heldFields(c).filter(i => c.fields[i].cover === 'open')
    const potato = open.filter(i => c.plans[i].crop === 'potato')
    const kinds = [...new Set(potato.map(i => c.plans[i].variety))]
    const said = `${F.upper(F.plural(potato.length, 'field'))} ${kinds.length === 1 ? `of ${S.variety(kinds[0]).name}` : 'of potatoes'}${open.length > potato.length ? ` and ${open.length - potato.length} resting` : ''}.`
    return [
      h('span', { class: 't-label' }, R.seasonCount(c)),
      h('h2', { class: 't-title' }, first ? 'Your first spring' : 'Spring'),
      h('p', { class: 'spring-lede' }, first
        ? `${said} Click a field to change it.`
        : `${y ? `Last year ended with ${F.money(Math.abs(y.cashEnd))}${y.cashEnd < 0 ? ' owed' : ' in hand'}. ` : ''}${said}`),
    ]
  }

  function drawRows(c: S.Campaign): Child {
    const folds = springFolds(ctx, c, onTry, () => { open = null; ctx.dirty() })
    const first = c.history.length === 0
    return folds.map((f, k) => {
      const on = open === f.id
      return [
        // In the first spring the ways to grow the farm wait under one quiet line.
        first && k === 1 ? h('p', { class: 'fold-group', k: 'fold-group' }, 'When you want more') : null,
        h('div', { class: `fold${on ? ' open' : ''}`, k: `fold-${f.id}` },
          h('button', { class: 'fold-row', type: 'button', testid: f.open, 'aria-expanded': String(on), 'aria-controls': on ? `fold-${f.id}` : null, onclick: () => toggle(f.id) },
            icon(f.glyph, 'ic fold-ic'),
            h('span', { class: 'fold-name' }, f.name),
            h('span', { class: 'fold-state' }, f.state),
            h('span', { class: 'fold-fig num' }, f.figure ?? ''),
            icon(on ? 'up' : 'next', 'ic s fold-chev')),
          on ? h('div', { class: 'fold-body', id: `fold-${f.id}`, testid: f.testid }, f.body()) : null),
      ]
    })
  }

  function drawFoot(c: S.Campaign): Child {
    const pc = S.planCosts(c)
    const after = c.cash - pc.total
    const over = after < S.OPERATING_LIMIT
    const m = S.mortgageInfo(c)
    const due = S.NOTE_PAYMENT + S.LIVING + Math.round(m.principal + m.interest)
    return [
      h('div', { class: 'spring-money' },
        h('p', { class: `plan-money${over ? ' over' : ''}`, testid: 'plan-money' },
          h('span', { class: 'pm-main' }, 'This plan ', h('strong', { class: 'num' }, F.money(pc.total))),
          pc.rent || pc.wages ? h('span', { testid: 'plan-rent' }, `with ${F.list([pc.rent ? `rent ${F.money(pc.rent)}` : '', pc.wages ? `wages ${F.money(pc.wages)}` : ''].filter(Boolean))}`) : null,
          h('span', null, over ? 'more than the bank will lend' : after < 0 ? 'on the spring loan ' : 'from cash, leaving ', over ? null : h('strong', { class: 'num' }, F.money(Math.abs(after)))),
          h('span', null, `due at year end ${F.money(due)}`)),
        h('button', { class: 'tlink', type: 'button', testid: 'money-open', onclick: () => openMoney(ctx) }, 'The money')),
      over ? h('p', { class: 'spring-warn', role: 'alert' }, 'Rest a field or plant saved seed: the bank will not lend more for the spring.') : null,
      h('button', { class: 'btn primary big spring-start', type: 'button', testid: 'begin-season', onclick: begin }, 'Start the season', icon('play', 'ic s')),
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
      const onPlate = !!t.closest?.('.plate')
      const onControl = !!t.closest?.('button, input, a')
      if (e.key === 'Escape') {
        if (app.selection.length) { app.select(-1); return true }
        if (open) { open = null; ctx.dirty(); return true }
        return false
      }
      if (e.key === 'Tab' && (!onControl || onPlate) && app.selection.length) {
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
      patch(head, JSON.stringify(state), () => drawHead(c))
      // On a phone the folds stand as a row of chips until one is opened, so the land keeps its room.
      rows.classList.toggle('chips', layout === 'narrow' && !open)
      patch(rows, JSON.stringify([...state, open, c.applicants.map(a => a.id), c.crew.map(u => [u.id, u.wage]), c.offers.map(x => x.id), c.contracts.map(k => k.id),
        c.upgrades, c.mortgages.map(m => Math.round(m.owed)), c.sundaysOff, Math.round(c.cash), c.buildings.length]), () => drawRows(c))
      patch(foot, JSON.stringify([S.planCosts(c), Math.round(c.cash), c.mortgages.map(m => Math.round(m.owed)), app.settings.units]), () => drawFoot(c))
      el.style.setProperty('--sheet-h', `${Math.round(sheet.offsetHeight)}px`)
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
      const low = card.hidden ? innerHeight : card.getBoundingClientRect().top
      if (ctx.layout() === 'narrow') return [t, 0, innerHeight - Math.min(s.top, low) + 8, 0]
      return [t, innerWidth - s.left + 8, innerHeight - low + (card.hidden ? 0 : 8), 0]
    },
    frame: () => P.frame(),
    dispose() { P.dispose() },
  }
}
