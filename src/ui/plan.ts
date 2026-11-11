// Spring, on the map: each plate shows the plan, a selected field opens a small card, and one button starts the season.
import * as S from '../sim/index.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { plates, type PlateModel } from './plates.ts'
import * as R from './rules.ts'
import { topBar } from './top.ts'

export function varietyTraits(v: S.Variety, c: S.Campaign, world: S.World): string[] {
  return [
    `${v.maturity} maturing`,
    v.market.toLowerCase(),
    `yield: ${R.yieldWord(v)}`,
    ...(R.setWord(v) ? [R.setWord(v)] : []),
    R.blightWord(v), R.scabWord(v), R.droughtWord(v),
    `keeps until ${R.keepsUntil(c.year, v.id, c.upgrades.vent)}`,
    R.seedWord(v),
    `${F.price(v.price)} in a usual year${v.contract ? ', on contract: the same price whenever it is delivered' : ''}`,
    `large tubers ${R.largeRule(world, c, v.id)}`,
  ]
}

function fieldCost(p: S.FieldPlan): number {
  return p.crop === 'potato' ? S.FIELD_COST + (p.seed === 'certified' ? S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT : 0) : S.REST_COST
}

// Every variety that can be planted this year, side by side.
export function openCompare(ctx: Ctx): void {
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
    ['Price', v => `${F.price(v.price)}${v.contract ? ', on contract' : ''}`],
    ['Large tubers', v => F.upper(R.largeRule(app.world, c, v.id, true))],
  ]
  ctx.papers.open({
    title: `Varieties for ${c.year}`,
    testid: 'compare',
    size: 'wide',
    body: () => [
      h('p', { class: 't-lede' }, 'What each variety is like, from the same facts the fields are grown by. No one of them wins every year.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'compare' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Variety'), cols.map(([label]) => h('th', { scope: 'col' }, label)))),
        h('tbody', null, vs.map(v => h('tr', null,
          h('th', { scope: 'row' }, h('span', { class: 'v-name' }, v.name), h('span', { class: 'sub' }, v.market)),
          cols.map(([label, text]) => h('td', { 'data-label': label }, text(v)))))))),
      h('p', { class: 'sub' }, `Price is for US No. 1 in a usual year, averaged over the season; harvest prices run below it and spring prices above. A contract price does not move with the season. Large tubers, over ${F.grams(S.SIZE_CHEF)}, sell over or under that price. Keeps until is the last cellar month before sprouting, for a crop dug around September 25${c.upgrades.vent ? ', with the ventilation' : ''}. Yield is what a full season can make, before weather, blight and the kill date take their share.`),
    ],
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'compare-close', autofocus: true, onclick: close }, 'Back to the plan'),
  })
}

// The money behind the one line: what the plan costs, what the bank lends, what comes due.
function openMoney(ctx: Ctx): void {
  const app = ctx.app
  const c = app.campaign
  if (!c) return
  const cost = S.planCost(c)
  const after = c.cash - cost
  const potato = c.plans.filter(p => p.crop === 'potato').length
  const cert = c.plans.filter(p => p.crop === 'potato' && p.seed === 'certified').length
  const rest = S.FIELD_COUNT - potato
  const y = c.history[c.history.length - 1]
  const rec = y ? app.world.records[y.year] : undefined
  ctx.papers.open({
    title: `The money, spring ${c.year}`,
    testid: 'money',
    size: 'medium',
    body: () => [
      h('table', { class: 'money' },
        h('tbody', null,
          h('tr', null, h('th', { scope: 'row' }, c.cash < 0 ? 'Owed from last year' : 'Cash on hand'), h('td', null, F.money(c.cash))),
          h('tr', null, h('th', { scope: 'row' }, `${F.plural(potato, 'potato field')} at ${F.money(S.FIELD_COST)}`), h('td', null, F.money(-potato * S.FIELD_COST))),
          cert ? h('tr', null, h('th', { scope: 'row' }, `Certified seed for ${cert}`), h('td', null, F.money(-cert * S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT))) : null,
          rest ? h('tr', null, h('th', { scope: 'row' }, `${rest} resting at ${F.money(S.REST_COST)}`), h('td', null, F.money(-rest * S.REST_COST))) : null,
          h('tr', { class: 'subtotal' }, h('th', { scope: 'row' }, 'This plan'), h('td', { testid: 'plan-cost' }, F.money(-cost))),
          h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'After planting'), h('td', { class: after < 0 ? 'neg' : '', testid: 'plan-after' }, F.money(after))))),
      h('p', null, after < S.OPERATING_LIMIT
        ? `The bank lends up to ${F.money(-S.OPERATING_LIMIT)} for the spring. Rest a field, or plant saved seed: it is free, but it carries virus.`
        : after < 0 ? `The bank's spring loan covers ${F.money(-after)}, repaid from the crop. The spring loan itself is free.` : 'No spring borrowing is needed.'),
      h('h3', { class: 'block-head' }, 'Due at year end'),
      h('table', { class: 'money' },
        h('tbody', null,
          h('tr', null, h('th', { scope: 'row' }, 'The note on the farm'), h('td', null, F.money(S.NOTE_PAYMENT))),
          h('tr', null, h('th', { scope: 'row' }, 'The household'), h('td', null, F.money(S.LIVING))),
          h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Due'), h('td', null, F.money(S.NOTE_PAYMENT + S.LIVING))))),
      h('p', { class: 'sub' }, `Debt left after those is carried into next year at ${F.pct(S.CREDIT_RATE)} interest, and the bank calls the note if it is more than ${F.money(-S.CREDIT_LIMIT)}. Each job in the field is charged as it is done, and the cellar by the month.`),
      y ? [
        h('h3', { class: 'block-head' }, `Last year, ${y.year}`),
        h('table', { class: 'money' },
          h('tbody', null,
            h('tr', null, h('th', { scope: 'row' }, 'Potato sales'), h('td', null, F.money(y.revenue - y.restIncome))),
            y.restIncome ? h('tr', null, h('th', { scope: 'row' }, 'Oats and clover'), h('td', null, F.money(y.restIncome))) : null,
            h('tr', null, h('th', { scope: 'row' }, 'Growing and storage'), h('td', null, F.money(-y.costs))),
            h('tr', null, h('th', { scope: 'row' }, 'Note, household and interest'), h('td', null, F.money(-(y.note + y.living + y.interest)))),
            h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Cash at year end'), h('td', { class: y.cashEnd < 0 ? 'neg' : '' }, F.money(y.cashEnd))))),
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
              h('div', null, h('h3', { class: 't-lede' }, u.name), h('p', null, F.localize(u.blurb))),
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
  const el = h('main', { class: 'season plan' }, top.el, notesSlot, h('div', { class: 'bottom' }, card, bar))
  let note = ''
  let focused = false

  function setPlan(change: Partial<S.FieldPlan>): void {
    const c = app.campaign
    if (!c) return
    note = ''
    for (const i of app.selection) {
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
    if (r.ok) app.runUntilNeeded()
  }

  function plateModel(i: number): PlateModel {
    const c = app.campaign!
    const p = c.plans[i]
    const potato = p.crop === 'potato'
    const v = S.variety(p.variety)
    return {
      name: S.FIELD_NAMES[i],
      glyph: potato ? 'planted' : 'rest',
      sub: potato ? v.name : 'Rest year',
      marks: potato && p.seed === 'saved' ? [{ glyph: 'sprout', cls: 'warn' }] : [],
      queue: [], badge: null,
      said: `${S.FIELD_NAMES[i]}, field ${i + 1}: ${potato ? `${v.name} on ${p.seed} seed` : 'a rest year in oats and clover'}. ${F.money(fieldCost(p))}.`,
    }
  }
  const P = plates(ctx, plateLayer, { model: plateModel, onBadge: () => {} })

  function varietyCard(c: S.Campaign, v: S.Variety, on: boolean): HTMLElement {
    return h('label', { class: 'vcard' },
      h('input', { type: 'radio', name: 'variety', value: v.id, checked: on, testid: `plan-variety-${v.id}`, k: `v-${v.id}`, 'aria-label': `${v.name}: ${varietyTraits(v, c, app.world).join(', ')}`, onchange: () => setPlan({ variety: v.id }) }),
      h('span', { class: 'vcard-in' },
        h('span', { class: 'v-name' }, v.name),
        h('span', { class: 'v-marks' },
          h('span', null, icon('stale', 'ic s'), v.maturity),
          h('span', null, icon('bulk', 'ic s'), R.yieldWord(v).split(',')[0]),
          h('span', null, icon('blight-old', 'ic s'), R.blightWord(v, true))),
        h('span', { class: 'v-price num' }, F.price(v.price))))
  }

  function drawCard(c: S.Campaign, sel: number[]): Child {
    const one = sel.length === 1
    const i = sel[0]
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
      h('header', { class: 'card-head' },
        h('div', null,
          h('h2', { class: 't-head', testid: 'card-title' }, one ? info.name : `${sel.length} fields`),
          h('p', { class: 'card-sub' }, one
            ? `${R.POSITION_NOTE[info.elev]} ${F.plural(info.streak, 'year')} in potatoes, soil ${R.soilWord(info.soil)}, early dying in ${F.pct(info.vert)} of plants.`
            : F.list(sel.map(j => S.FIELD_NAMES[j])))),
        h('button', { class: 'nicon', type: 'button', testid: 'card-close', 'aria-label': 'Deselect', onclick: () => app.select(-1) }, icon('close'))),
      h('div', { class: 'plan-row' },
        h('div', { class: 'nseg', role: 'radiogroup', 'aria-label': 'Crop' },
          (['potato', 'rest'] as const).map(crop => h('label', { class: 'nseg-opt' },
            h('input', { type: 'radio', name: 'crop', value: crop, checked: same('crop') && p.crop === crop, testid: `plan-crop-${crop}`, k: `crop-${crop}`, onchange: () => setPlan({ crop }) }),
            h('span', null, crop === 'potato' ? 'Potatoes' : 'Rest year')))),
        h('span', { class: 'plan-cost num', testid: 'field-cost' }, F.money(cost)),
        potato ? h('button', { class: 'nbtn', type: 'button', testid: 'compare-open', onclick: () => openCompare(ctx) }, 'Compare') : null),
      potato ? [
        h('div', { class: 'vcards', role: 'radiogroup', 'aria-label': 'Variety' }, vs.map(x => varietyCard(c, x, same('variety') && x.id === p.variety))),
        h('p', { class: 'card-line note' }, same('variety') ? v.blurb : 'These fields are in different varieties.'),
        saved > 0 || p.seed === 'saved' ? h('div', { class: 'plan-row' },
          h('div', { class: 'nseg', role: 'radiogroup', 'aria-label': 'Seed' },
            (['certified', 'saved'] as const).map(seed => h('label', { class: 'nseg-opt' },
              h('input', { type: 'radio', name: 'seed', value: seed, checked: same('seed') && p.seed === seed, testid: `plan-seed-${seed}`, k: `seed-${seed}`, onchange: () => setPlan({ seed }) }),
              h('span', null, seed === 'certified' ? `Certified seed, ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)}` : `Saved seed, free (enough for ${saved})`)))),
          h('p', { class: `card-line${p.seed === 'saved' ? ' urgent' : ''}`, testid: 'seed-note' }, R.savedSeedText(stock))) : null,
      ] : h('p', { class: 'card-line' }, `Oats and clover: costs ${F.money(S.REST_COST)}, earns ${F.money(S.REST_INCOME)} in the fall. A rest year puts the soil back at once and wears early dying down slowly.`),
      note ? h('p', { class: 'card-line flash lv-warn', role: 'alert' }, note) : null,
    ]
  }

  return {
    el,
    notes: notesSlot,
    key(e) {
      if (e.altKey || e.metaKey || e.ctrlKey) return false
      const t = e.target as HTMLElement
      const onPlate = !!t.closest?.('.plate')
      const onControl = !!t.closest?.('button, input, a')
      if (e.key === 'Escape') {
        if (!app.selection.length) return false
        app.select(-1)
        return true
      }
      if (e.key === 'Tab' && !e.shiftKey && (!onControl || onPlate) && app.selection.length) {
        app.select((app.selected + 1) % S.FIELD_COUNT)
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        return true
      }
      const digit = /^(?:Digit|Numpad)([1-6])$/.exec(e.code)
      if (digit && !t.closest?.('input')) { app.select(Number(digit[1]) - 1, e.shiftKey); return true }
      return false
    },
    update() {
      const c = app.campaign
      if (!c) return
      const layout = ctx.layout()
      el.dataset.layout = layout
      top.update()
      P.update()
      const sel = app.selection.filter(i => i >= 0 && i < S.FIELD_COUNT)
      const was = card.hidden
      card.hidden = sel.length === 0
      el.classList.toggle('selected', sel.length > 0)
      if (sel.length) {
        patch(card, JSON.stringify([sel, c.plans, c.seedStock, note, app.settings.units, c.year]), () => drawCard(c, sel))
        if (was && !ctx.reduced()) { card.classList.remove('in'); void card.offsetWidth; card.classList.add('in') }
      } else note = ''
      const cost = S.planCost(c)
      const after = c.cash - cost
      const over = after < S.OPERATING_LIMIT
      patch(bar, JSON.stringify([cost, c.cash, c.year, app.settings.units, layout]), () => [
        h('p', { class: `plan-money${over ? ' over' : ''}`, testid: 'plan-money' },
          h('span', null, 'This plan ', h('strong', { class: 'num' }, F.money(cost))),
          h('span', null, after < 0 ? 'the bank lends ' : 'from cash, leaving ', h('strong', { class: 'num' }, F.money(Math.abs(after)))),
          h('span', null, 'due at year end ', h('strong', { class: 'num' }, F.money(S.NOTE_PAYMENT + S.LIVING)))),
        h('div', { class: 'plan-actions' },
          h('button', { class: 'nbtn', type: 'button', testid: 'money-open', onclick: () => openMoney(ctx) }, 'The money'),
          h('button', { class: 'nbtn', type: 'button', testid: 'equipment-open', onclick: () => openEquipment(ctx) }, 'Equipment'),
          h('button', { class: 'nbtn primary', type: 'button', testid: 'begin-season', onclick: begin }, 'Start the season')),
      ])
      // The one thing to do here is under the keyboard from the start.
      if (!focused && !ctx.papers.isOpen()) {
        const start = bar.querySelector<HTMLElement>('[data-testid="begin-season"]')
        if (document.activeElement === document.body || document.activeElement === null) start?.focus({ preventScroll: true })
        focused = document.activeElement === start || (document.activeElement !== document.body && document.activeElement !== null)
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
