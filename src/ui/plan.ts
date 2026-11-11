import * as S from '../sim/index.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { fieldLabels } from './labels.ts'
import * as R from './rules.ts'
import { topBar } from './top.ts'

export const POSITION_NOTE = [
  'Bottom land: holds water, stays wet after rain, warms late, collects frost and stays damp for blight.',
  'Mid slope: middling on water and frost.',
  'Ridge: drains fast and warms early, but dries out.',
]

export function soilWord(soil: number): string {
  return soil >= 0.85 ? 'rested' : soil >= 0.4 ? 'tired' : 'worn'
}

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

export function sheetLayout(ctx: Ctx, cls: string): { el: HTMLElement; top: ReturnType<typeof topBar>; sheet: HTMLElement; insets: () => [number, number, number, number] } {
  const top = topBar(ctx)
  const sheet = h('section', { class: `sheet paper ${cls}-sheet`, 'data-scroll': 'sheet' })
  const el = h('main', { class: `sheet-screen ${cls}` }, top.el, sheet)
  return {
    el, top, sheet,
    insets: () => {
      const t = top.el.getBoundingClientRect().bottom
      const r = sheet.getBoundingClientRect()
      return ctx.layout() === 'phone' ? [t, 0, innerHeight - r.top, 0] : [t, innerWidth - r.left, 0, 0]
    },
  }
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
    ['Price', v => `${F.price(v.price)}${v.contract ? ', on contract: it does not move with the season' : ''}`],
    ['Large tubers', v => F.upper(R.largeRule(app.world, c, v.id, true))],
  ]
  ctx.dialogs.open({
    title: `Varieties for ${c.year}`,
    testid: 'compare',
    wide: true,
    cls: 'compare-dialog',
    body: () => [
      h('p', { class: 'dialog-lede' }, 'What each variety is like, from the same facts the fields are grown by. No one of them wins every year.'),
      h('table', { class: 'compare' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Variety'), cols.map(([label]) => h('th', { scope: 'col' }, label)))),
        h('tbody', null, vs.map(v => h('tr', null,
          h('th', { scope: 'row' }, v.name, h('span', { class: 'sub' }, v.market)),
          cols.map(([label, text]) => h('td', { 'data-label': label }, text(v))))))),
      h('p', { class: 'sub' }, `Price is for US No. 1 in a usual year, averaged over the season; harvest prices run below it and spring prices above. Large tubers, over ${F.grams(S.SIZE_CHEF)}, sell over or under that price. Keeps until is the last cellar month before sprouting, for a crop dug around September 25${c.upgrades.vent ? ', with the ventilation' : ''}; an earlier dig sprouts earlier. Yield is what a full season can make, before weather, blight and the kill date take their share.`),
    ],
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'compare-close', autofocus: true, onclick: close }, 'Back to the plan'),
  })
}

export function planScreen(ctx: Ctx, labelsLayer: HTMLElement): Screen {
  const app = ctx.app
  const L = sheetLayout(ctx, 'plan')
  const placeLabels = fieldLabels(ctx, labelsLayer, i => {
    const p = app.campaign?.plans[i]
    return !p || ctx.layout() !== 'wide' ? S.FIELD_NAMES[i] : `${S.FIELD_NAMES[i]}: ${p.crop === 'rest' ? 'rest' : S.variety(p.variety).name}`
  }, () => ctx.layout() === 'phone' || innerHeight <= 500)
  let err = ''
  const fieldErr: string[] = []
  let shown = app.selected

  function setPlan(i: number, plan: S.FieldPlan): void {
    const r = app.do({ t: 'plan', field: i, plan })
    fieldErr[i] = r.ok ? '' : r.err
    err = ''
    ctx.dirty()
  }

  function begin(): void {
    const r = app.do({ t: 'begin' })
    err = r.ok ? '' : r.err
    ctx.dirty()
  }

  function fieldRow(c: S.Campaign, i: number): HTMLElement {
    const info = S.fieldInfo(c, i)
    const p = c.plans[i]
    const vs = S.availableVarieties(c.year)
    const v = S.variety(p.variety)
    const stock = c.seedStock.filter(x => x.variety === p.variety && x.fields > 0)
    const saved = stock.reduce((a, x) => a + x.fields, 0)
    const potato = p.crop === 'potato'
    const cost = potato ? S.FIELD_COST + (p.seed === 'certified' ? S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT : 0) : S.REST_COST
    const name = `${info.name}`
    return h('article', { class: `plan-field${potato ? '' : ' resting'}`, 'aria-labelledby': `pf-${i}` },
      h('div', { class: 'pf-head' },
        h('h3', { id: `pf-${i}` }, name),
        h('span', { class: 'pf-cost num' }, F.money(cost))),
      h('p', { class: 'pf-soil' },
        POSITION_NOTE[info.elev], ' ',
        h('span', { class: 'nowrap' }, `${F.plural(info.streak, 'year')} in potatoes`), ', ',
        h('span', { class: 'nowrap' }, `soil ${soilWord(info.soil)}`), ', ',
        h('span', { class: `nowrap${info.vert >= 0.15 ? ' warn-text' : ''}` }, `early dying in ${F.pct(info.vert)} of plants`), '.'),
      app.settings.hints && potato && info.streak >= 2 ? h('p', { class: 'hint' }, 'Potatoes after potatoes: this ground is worn. Expect less yield, more scab and more early dying. A rest year puts the soil back at once; early dying wears down slowly, over several.') : null,
      h('div', { class: 'pf-choice' },
        h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `${name}: crop` },
          (['potato', 'rest'] as const).map(crop => h('label', { class: 'seg-opt' },
            h('input', { type: 'radio', name: `crop-${i}`, value: crop, checked: p.crop === crop, testid: `plan-crop-${i}-${crop}`, k: `crop-${i}-${crop}`, onchange: () => setPlan(i, { ...p, crop }) }),
            h('span', null, crop === 'potato' ? 'Potatoes' : 'Rest year')))),
        potato ? h('label', { class: 'select' },
          h('span', { class: 'visually-hidden' }, `${name}: variety`),
          h('select', { testid: `plan-variety-${i}`, k: `variety-${i}`, onchange: (e: Event) => setPlan(i, { ...p, variety: (e.target as HTMLSelectElement).value as S.VarietyId, seed: 'certified' }) },
            vs.map(x => h('option', { value: x.id, selected: x.id === p.variety }, x.name)))) : null,
        potato && (saved > 0 || p.seed === 'saved') ? h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `${name}: seed` },
          (['certified', 'saved'] as const).map(seed => h('label', { class: 'seg-opt' },
            h('input', { type: 'radio', name: `seed-${i}`, value: seed, checked: p.seed === seed, testid: `plan-seed-${i}-${seed}`, k: `seed-${i}-${seed}`, onchange: () => setPlan(i, { ...p, seed }) }),
            h('span', null, seed === 'certified' ? `Certified, ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)}` : `Saved seed, free (${saved} in cellar)`)))) : null,
        potato && saved < 1 && p.seed !== 'saved' ? h('span', { class: 'sub' }, `Certified seed, ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)}`) : null),
      potato && saved > 0 ? h('p', { class: `seed-note${p.seed === 'saved' ? ' warn-text' : ' sub'}`, testid: `seed-note-${i}` }, R.savedSeedText(stock)) : null,
      fieldErr[i] ? h('p', { class: 'error-text', role: 'alert' }, fieldErr[i]) : null,
      potato ? h('p', { class: 'pf-traits' }, varietyTraits(v, c, app.world).join(' · '))
        : h('p', { class: 'pf-traits' }, `Oats and clover: costs ${F.money(S.REST_COST)}, earns ${F.money(S.REST_INCOME)} in the fall. A rest year puts the soil back at once and wears early dying down slowly.`),
      potato ? h('p', { class: 'pf-blurb' }, v.blurb) : null)
  }

  function money(c: S.Campaign): HTMLElement {
    const cost = S.planCost(c)
    const after = c.cash - cost
    const potato = c.plans.filter(p => p.crop === 'potato').length
    const cert = c.plans.filter(p => p.crop === 'potato' && p.seed === 'certified').length
    const rest = S.FIELD_COUNT - potato
    const over = after < S.OPERATING_LIMIT
    return h('section', { class: 'card' },
      h('h3', null, 'The money'),
      h('table', { class: 'ledger-table' },
        h('tbody', null,
          h('tr', null, h('th', { scope: 'row' }, 'Cash on hand'), h('td', { class: 'num' }, F.money(c.cash))),
          h('tr', null, h('th', { scope: 'row' }, `${potato} potato ${potato === 1 ? 'field' : 'fields'} at ${F.money(S.FIELD_COST)}`), h('td', { class: 'num' }, F.money(-potato * S.FIELD_COST))),
          cert ? h('tr', null, h('th', { scope: 'row' }, `Certified seed for ${cert}`), h('td', { class: 'num' }, F.money(-cert * S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT))) : null,
          rest ? h('tr', null, h('th', { scope: 'row' }, `${rest} resting at ${F.money(S.REST_COST)}`), h('td', { class: 'num' }, F.money(-rest * S.REST_COST))) : null,
          h('tr', { class: 'subtotal' }, h('th', { scope: 'row' }, 'This plan'), h('td', { class: 'num', testid: 'plan-cost' }, F.money(-cost))),
          h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'After planting'), h('td', { class: `num${after < 0 ? ' neg' : ''}`, testid: 'plan-after' }, F.money(after))))),
      h('p', { class: over ? 'error-text' : 'sub' }, over
        ? `The bank lends up to ${F.money(-S.OPERATING_LIMIT)} for the spring. Rest a field, or plant saved seed: it is free, but it carries virus.`
        : after < 0 ? `${F.money(-after)} of that comes from the bank's spring loan, paid back from the crop. The spring loan itself is free.` : 'No spring borrowing needed.'),
      h('p', { class: 'due' }, h('span', { class: 'label' }, 'Due at year end'),
        h('span', null, `the note ${F.money(S.NOTE_PAYMENT)} and the household ${F.money(S.LIVING)}: `, h('strong', { class: 'num' }, F.money(S.NOTE_PAYMENT + S.LIVING)))),
      h('p', { class: 'sub' }, `Any debt left after those is carried into next year at ${F.pct(S.CREDIT_RATE)} interest, and the bank calls the note if it is more than ${F.money(-S.CREDIT_LIMIT)}. Each job in the field is charged as it is done, and the cellar by the month.`))
  }

  function equipment(c: S.Campaign): HTMLElement {
    return h('section', { class: 'card' },
      h('h3', null, 'Equipment'),
      h('ul', { class: 'equip' }, (Object.keys(S.UPGRADES) as S.UpgradeId[]).map(id => {
        const u = S.UPGRADES[id]
        const own = c.upgrades[id]
        return h('li', null,
          h('div', null, h('strong', null, u.name), h('p', { class: 'sub' }, F.localize(u.blurb))),
          own ? h('span', { class: 'owned' }, 'Owned')
            : h('button', {
              class: 'btn small', type: 'button', testid: `buy-${id}`, disabled: c.cash < u.cost,
              title: c.cash < u.cost ? 'Not enough cash. The bank will not lend for equipment.' : undefined,
              onclick: () => { const r = ctx.run({ t: 'buy', upgrade: id }); if (r.ok) ctx.toast(`Bought: ${u.name}.`, 'good') },
            }, `Buy ${F.money(u.cost)}`))
      })))
  }

  function lastYear(c: S.Campaign): HTMLElement | null {
    const y = c.history[c.history.length - 1]
    if (!y) return null
    const rec = app.world.records[y.year]
    const rest = y.restIncome ?? 0
    return h('section', { class: 'card' },
      h('h3', null, `Last year, ${y.year}`),
      h('table', { class: 'ledger-table' },
        h('tbody', null,
          h('tr', null, h('th', { scope: 'row' }, 'Potato sales'), h('td', { class: 'num' }, F.money(y.revenue - rest))),
          rest ? h('tr', null, h('th', { scope: 'row' }, 'Oats and clover'), h('td', { class: 'num' }, F.money(rest))) : null,
          h('tr', null, h('th', { scope: 'row' }, 'Growing and storage'), h('td', { class: 'num' }, F.money(-y.costs))),
          h('tr', null, h('th', { scope: 'row' }, 'Note, household, interest'), h('td', { class: 'num' }, F.money(-(y.note + y.living + y.interest)))),
          h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Cash at year end'), h('td', { class: 'num' }, F.money(y.cashEnd))),
          h('tr', null, h('th', { scope: 'row' }, 'Your yield sold'), h('td', { class: 'num' }, y.potatoFields ? F.perArea(y.yieldCwtAcre) : 'no potatoes')),
          rec?.yieldCwtAcre != null ? h('tr', null, h('th', { scope: 'row' }, 'Maine average (USDA)'), h('td', { class: 'num' }, F.perArea(rec.yieldCwtAcre))) : null)))
  }

  return {
    el: L.el,
    update() {
      const c = app.campaign
      if (!c) return
      L.top.update()
      const model = { p: c.plans, cash: c.cash, u: c.upgrades, st: c.seedStock, h: c.history.length, err, fieldErr, units: app.settings.units, hints: app.settings.hints }
      patch(L.sheet, JSON.stringify(model), () => [
        h('header', { class: 'sheet-head' },
          h('div', { class: 'sheet-head-row' },
            h('h2', null, `Spring plan, ${c.year}`),
            h('button', { class: 'btn small', type: 'button', testid: 'compare-open', onclick: () => openCompare(ctx) }, 'Compare varieties')),
          h('p', { class: 'sub' }, `Six fields of ${F.area(S.FIELD_ACRES)} each. Choose what each one grows this year.`)),
        app.settings.hints && c.yearIdx === 0 ? h('p', { class: 'hint' },
          'A first spring: Katahdin on certified seed is the safe Maine choice, and the two worn fields are already set to rest. Read down the fields, then begin the season.') : null,
        c.seedStock.some(x => x.fields > 0) ? h('p', { class: 'sub' }, 'Saved seed in the cellar: ',
          F.list(c.seedStock.filter(x => x.fields > 0).map(x => `${S.variety(x.variety).name}, ${x.fields === 1 ? 'one field’s' : `${x.fields} fields’`} worth (about ${F.pct(x.virus)} will come up stunted)`)), '.') : null,
        h('div', { class: 'plan-body' },
          h('div', { class: 'plan-fields' }, c.plans.map((_, i) => fieldRow(c, i))),
          h('div', { class: 'plan-side' }, money(c), lastYear(c), equipment(c))),
        h('footer', { class: 'sheet-foot' },
          err ? h('p', { class: 'error-text', role: 'alert', testid: 'begin-error' }, err) : null,
          h('button', { class: 'btn primary big', type: 'button', testid: 'begin-season', onclick: begin }, `Begin the ${c.year} season`)),
      ])
      if (app.selected !== shown) {
        shown = app.selected
        document.getElementById(`pf-${shown}`)?.closest('article')?.scrollIntoView({ block: 'nearest', behavior: app.settings.reducedMotion ? 'auto' : 'smooth' })
      }
    },
    insets: L.insets,
    frame: placeLabels,
  }
}
