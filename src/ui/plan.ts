// Spring, on the map: each plate shows the plan, a selected field opens a small card, and one button starts the season.
// Land the farm could rent or buy carries a quiet marker; its card says what it is and what it costs.
import * as S from '../sim/index.ts'
import { openContracts, tracker } from './contracts.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { openCrew } from './crew.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { landCard, landOf, landSaid, tenureRow } from './land.ts'
import { digitFor, fieldForDigit, heldFields, step } from './map.ts'
import { plates, type PlateModel } from './plates.ts'
import * as R from './rules.ts'
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

function fieldCost(p: S.FieldPlan): number {
  return p.crop === 'potato' ? S.FIELD_COST + (p.seed === 'certified' ? S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT : 0) : S.REST_COST
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
    title: `Varieties for ${c.year}`,
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
  const mine = heldFields(c)
  const potato = mine.filter(i => c.plans[i].crop === 'potato').length
  const cert = mine.filter(i => c.plans[i].crop === 'potato' && c.plans[i].seed === 'certified').length
  const rest = mine.length - potato
  const rented = mine.filter(i => c.fields[i].tenure === 'rented').length
  const crews = c.crew.filter(u => u.wage > 0).length
  const y = c.history[c.history.length - 1]
  const rec = y ? app.world.records[y.year] : undefined
  ctx.papers.open({
    title: `The money, spring ${c.year}`,
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
          pc.wages ? row(`The first month's wages, ${F.plural(crews, 'hand')}`, -pc.wages) : null,
          row('This plan', -pc.total, { testid: 'plan-cost', cls: 'subtotal' }),
          row('After planting', after, { testid: 'plan-after', cls: 'total' }))),
      h('p', null, after < S.OPERATING_LIMIT
        ? `The bank lends up to ${F.money(-S.OPERATING_LIMIT)} for the spring. Rest a field, or plant saved seed: it is free, but it carries virus.`
        : after < 0 ? `The bank's spring loan covers ${F.money(-after)}, repaid from the crop. The spring loan itself is free.` : 'No spring borrowing is needed.'),
      h('h3', { class: 'block-head' }, 'Due at year end'),
      h('table', { class: 'money' },
        h('tbody', null,
          row('The note on the farm', S.NOTE_PAYMENT),
          row('The household', S.LIVING),
          row('Due', S.NOTE_PAYMENT + S.LIVING, { cls: 'total' }))),
      h('p', { class: 'sub' }, `Debt left after those is carried into next year at ${F.pct(S.CREDIT_RATE)} interest, and the bank calls the note if it is more than ${F.money(-S.CREDIT_LIMIT)}. Each job in the field is charged as it is done, wages by the month, and the cellar by the month. Land and equipment are bought from cash.`),
      y ? [
        h('h3', { class: 'block-head' }, `Last year, ${y.year}`),
        h('table', { class: 'money' },
          h('tbody', null,
            row('Potato sales', y.revenue - y.restIncome - y.contracts),
            y.contracts ? row('Delivered on contract', y.contracts) : null,
            y.restIncome ? row('Oats and clover', y.restIncome) : null,
            row('Growing and storage', -(y.costs - y.wages - y.rent - y.land - y.penalties)),
            y.wages ? row('Wages', -y.wages) : null,
            y.rent ? row('Rent', -y.rent) : null,
            y.land ? row('Land bought', -y.land) : null,
            y.penalties ? row('Contract penalties', -y.penalties) : null,
            row('Note, household and interest', -(y.note + y.living + y.interest)),
            row('Cash at year end', y.cashEnd, { cls: 'total' }))),
        h('p', { class: 'sub' }, `${y.potatoFields ? `Your yield sold: ${F.perArea(y.yieldCwtAcre)}.` : 'No potatoes were grown.'}${rec?.yieldCwtAcre != null ? ` Maine averaged ${F.perArea(rec.yieldCwtAcre)} (USDA).` : ''}`),
      ] : null,
    ],
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'money-close', autofocus: true, onclick: close }, 'Back to the plan'),
  })
}

function openEquipment(ctx: Ctx): void {
  const app = ctx.app
  ctx.papers.open({
    title: 'Equipment',
    testid: 'equipment',
    size: 'medium',
    body: () => {
      const box = h('div', null)
      const draw = () => {
        const c = app.campaign
        if (!c) return
        box.replaceChildren(
          h('p', { class: 'sub' }, `Bought from cash in hand, ${F.money(Math.max(0, c.cash))} now. The bank does not lend for equipment.`),
          h('ul', { class: 'equip' }, (Object.keys(S.UPGRADES) as S.UpgradeId[]).map(id => {
            const u = S.UPGRADES[id]
            const own = c.upgrades[id]
            return h('li', null,
              h('div', null, h('h3', { class: 't-lede' }, u.name), h('p', null, F.localize(u.blurb)),
                id === 'tractor2' ? h('p', { class: 'sub' }, `The operator is hired on the crew, at ${F.money(S.OPERATOR_WAGE)} a month.`) : null,
                id === 'house2' ? h('p', { class: 'sub' }, `The farm stores ${F.mass(S.cellarCapacity(c))} now.`) : null),
              own ? h('span', { class: 't-label owned' }, 'Owned')
                : h('button', {
                  class: 'btn', type: 'button', testid: `buy-${id}`, disabled: c.cash < u.cost,
                  onclick: () => { if (ctx.run({ t: 'buy', upgrade: id }).ok) { ctx.announce(`Bought: ${u.name}.`); draw() } },
                }, `Buy, ${F.money(u.cost)}`))
          })))
      }
      draw()
      return box
    },
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'equipment-close', autofocus: true, onclick: close }, 'Back to the plan'),
  })
}

export function planScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const card = h('section', { class: 'card plan-card instrument', 'aria-label': 'Plan for the selected field', testid: 'plan-card', hidden: true })
  const bar = h('section', { class: 'plan-bar instrument', 'aria-label': 'The plan' })
  const notesSlot = h('div', { class: 'notes-slot' })
  const track = tracker(ctx)
  notesSlot.append(track.el)
  const el = h('main', { class: 'season plan' }, top.el, notesSlot, h('div', { class: 'bottom' }, card, bar))
  let note = ''
  let focused = false

  function setPlan(change: Partial<S.FieldPlan>): void {
    const c = app.campaign
    if (!c) return
    note = ''
    for (const i of app.selection) {
      if (!S.held(c, i)) continue
      const p = { ...c.plans[i], ...change }
      if (change.variety && change.variety !== c.plans[i].variety) p.seed = 'certified'
      const r = app.do({ t: 'plan', field: i, plan: p })
      if (!r.ok) note = r.err
    }
    if (note) ctx.announce(note)
    ctx.dirty()
  }

  function onTry(err: string): void {
    note = err
    if (err) ctx.announce(err)
    ctx.dirty()
  }

  function begin(): void {
    const r = ctx.run({ t: 'begin' })
    if (!r.ok) return
    ctx.clock.auto = true
    app.runUntilNeeded()
  }

  function plateModel(i: number): PlateModel | null {
    const c = app.campaign!
    if (!S.held(c, i)) {
      const l = landOf(c, i)
      return l ? { name: l.name, glyph: 'land', marks: [], queue: [], badge: null, land: true, said: landSaid(l) } : null
    }
    const p = c.plans[i]
    const potato = p.crop === 'potato'
    const v = S.variety(p.variety)
    const rented = c.fields[i].tenure === 'rented'
    const key = digitFor(c, i)
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
    if (!S.held(c, i)) return landCard(ctx, c, i, note, { onTry })
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
            ? `${R.POSITION_NOTE[info.elev]} ${F.plural(info.streak, 'year')} in potatoes, soil ${R.soilWord(info.soil)}, early dying in ${F.pct(info.vert)} of plants.`
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
      one ? tenureRow(ctx, c, i, { onTry }) : null,
      note ? h('p', { class: 'card-line flash lv-warn', role: 'alert' }, note) : null,
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
        if (!app.selection.length) return false
        app.select(-1)
        return true
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
      // Land the farm does not hold is looked at one parcel at a time.
      const shown = sel.length > 1 && !S.held(c, sel[sel.length - 1]) ? [sel[sel.length - 1]] : sel.filter(i => S.held(c, i) || sel.length === 1)
      const was = card.hidden
      card.hidden = shown.length === 0
      el.classList.toggle('selected', shown.length > 0)
      if (shown.length) {
        patch(card, JSON.stringify([shown, c.plans, c.seedStock, note, app.settings.units, c.year, c.fields.map(f => f.tenure), Math.round(c.cash)]), () => drawCard(c, shown))
        if (was && !ctx.reduced()) { card.classList.remove('in'); void card.offsetWidth; card.classList.add('in') }
      } else note = ''
      const pc = S.planCosts(c)
      const after = c.cash - pc.total
      const over = after < S.OPERATING_LIMIT
      const offers = c.offers.length
      patch(bar, JSON.stringify([pc, c.cash, c.year, app.settings.units, layout, offers, c.contracts.length, c.crew.length]), () => [
        h('p', { class: `plan-money${over ? ' over' : ''}`, testid: 'plan-money' },
          h('span', null, 'This plan ', h('strong', { class: 'num' }, F.money(pc.total))),
          pc.rent || pc.wages ? h('span', { testid: 'plan-rent' }, `with ${F.list([pc.rent ? `rent ${F.money(pc.rent)}` : '', pc.wages ? `wages ${F.money(pc.wages)}` : ''].filter(Boolean))}`) : null,
          h('span', null, after < 0 ? 'on the bank\'s spring loan ' : 'from cash, leaving ', h('strong', { class: 'num' }, F.money(Math.abs(after)))),
          h('span', null, 'the note and household, at year end ', h('strong', { class: 'num' }, F.money(S.NOTE_PAYMENT + S.LIVING)))),
        h('div', { class: 'plan-actions' },
          h('button', { class: 'nbtn', type: 'button', testid: 'money-open', onclick: () => openMoney(ctx) }, 'The money'),
          h('button', { class: 'nbtn', type: 'button', testid: 'equipment-open', onclick: () => openEquipment(ctx) }, 'Equipment'),
          h('button', { class: 'nbtn', type: 'button', testid: 'crew-open', onclick: () => openCrew(ctx) }, icon('crew', 'ic s'), 'Crew', c.crew.length > 1 ? h('span', { class: 'sub num' }, String(c.crew.length)) : null),
          h('button', { class: 'nbtn', type: 'button', testid: 'contracts-open', onclick: () => openContracts(ctx) }, icon('contract', 'ic s'), 'Contracts', offers ? h('span', { class: 'sub num' }, `${offers} offered`) : null),
          h('button', { class: 'nbtn primary', type: 'button', testid: 'begin-season', onclick: begin }, 'Start the season')),
      ])
      // The one thing to do here is under the keyboard from the start.
      if (!focused && !ctx.papers.isOpen()) {
        const start = bar.querySelector<HTMLElement>('[data-k="begin-season"]')
        const at = document.activeElement
        const free = !at || at === document.body || !!at.closest('[inert]')
        if (free) start?.focus({ preventScroll: true })
        focused = document.activeElement === start || !free
        if (!focused) setTimeout(() => ctx.dirty(), 200)
      }
    },
    insets() {
      const t = top.el.getBoundingClientRect().bottom
      const tops = [bar, card].filter(x => !x.hidden).map(x => x.getBoundingClientRect().top)
      return [t, 0, innerHeight - Math.min(...tops, innerHeight) + 8, 0]
    },
    frame: () => P.frame(),
    dispose() { P.dispose() },
  }
}
