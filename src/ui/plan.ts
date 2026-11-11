import * as S from '../sim/index.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { topBar } from './top.ts'

export const POSITION_NOTE = [
  'Bottom land: holds water, stays wet after rain, collects frost.',
  'Mid slope: middling on water and frost.',
  'Ridge: drains fast and warms early, but dries out.',
]

export function soilWord(soil: number): string {
  return soil >= 0.85 ? 'rested' : soil >= 0.4 ? 'tired' : 'worn'
}

export function varietyTraits(v: S.Variety): string[] {
  const blight = v.blightLeaf < 0.6 ? 'resists leaf blight' : v.blightLeaf < 0.95 ? 'some leaf blight resistance' : v.blightLeaf < 1.2 ? 'blight-prone leaf' : 'very blight-prone leaf'
  const scab = v.scab < 0.7 ? 'resists scab' : v.scab < 1.1 ? 'average on scab' : v.scab < 1.8 ? 'scab-prone' : 'very scab-prone'
  const dry = v.drought >= 0.55 ? 'rides out dry spells' : v.drought >= 0.35 ? 'average in a dry spell' : 'suffers in a dry spell'
  const months = Math.round(v.dormancy / 30)
  return [
    `${v.maturity === 'very late' ? 'very late' : v.maturity} maturing`,
    v.market.toLowerCase(),
    blight, scab, dry,
    `sprouts after about ${months} ${months === 1 ? 'month' : 'months'} in store`,
    `${F.price(v.price)} in an average year${v.contract ? ', on contract' : ''}`,
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
      return ctx.phone() ? [t, 0, innerHeight - r.top, 0] : [t, innerWidth - r.left, 0, 0]
    },
  }
}

export function planScreen(ctx: Ctx): Screen {
  const app = ctx.app
  const L = sheetLayout(ctx, 'plan')
  let err = ''
  const fieldErr: string[] = []

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
    const saved = c.seedStock.filter(x => x.variety === p.variety).reduce((a, x) => a + x.fields, 0)
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
        h('span', { class: `nowrap${info.vert >= 0.15 ? ' warn-text' : ''}` }, `wilt in ${F.pct(info.vert)} of plants`), '.'),
      app.settings.hints && potato && info.streak >= 2 ? h('p', { class: 'hint' }, 'Potatoes after potatoes: this ground is worn. Expect less yield, more scab and more wilt; a rest year puts it back.') : null,
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
            h('span', null, seed === 'certified' ? `Certified, ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)}` : `Saved seed (${saved} in cellar)`)))) : null,
        potato && saved < 1 && p.seed !== 'saved' ? h('span', { class: 'sub' }, `Certified seed, ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)}`) : null),
      fieldErr[i] ? h('p', { class: 'error-text', role: 'alert' }, fieldErr[i]) : null,
      potato ? h('p', { class: 'pf-traits' }, varietyTraits(v).join(' · ')) : h('p', { class: 'pf-traits' }, `Oats and clover: costs ${F.money(S.REST_COST)}, earns ${F.money(S.REST_INCOME)} in the fall, restores the soil and lowers wilt.`),
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
          h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'After planting'), h('td', { class: `num${after < 0 ? ' neg' : ''}`, testid: 'plan-after' }, F.money(after))))),
      h('p', { class: over ? 'error-text' : 'sub' }, over
        ? `The bank lends up to ${F.money(-S.OPERATING_LIMIT)} for the spring. Rest a field or use saved seed.`
        : after < 0 ? `${F.money(-after)} of that comes from the bank's spring loan, paid back from the crop.` : 'No spring borrowing needed.'),
      h('p', { class: 'due' }, h('span', { class: 'label' }, 'Due at year end'),
        h('span', null, `the note ${F.money(S.NOTE_PAYMENT)} and the household ${F.money(S.LIVING)}: `, h('strong', { class: 'num' }, F.money(S.NOTE_PAYMENT + S.LIVING)))),
      h('p', { class: 'sub' }, `The bank calls the note if a year ends more than ${F.money(-S.CREDIT_LIMIT)} in debt.`))
  }

  function equipment(c: S.Campaign): HTMLElement {
    return h('section', { class: 'card' },
      h('h3', null, 'Equipment'),
      h('ul', { class: 'equip' }, (Object.keys(S.UPGRADES) as S.UpgradeId[]).map(id => {
        const u = S.UPGRADES[id]
        const own = c.upgrades[id]
        return h('li', null,
          h('div', null, h('strong', null, u.name), h('p', { class: 'sub' }, u.blurb)),
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
    return h('section', { class: 'card' },
      h('h3', null, `Last year, ${y.year}`),
      h('table', { class: 'ledger-table' },
        h('tbody', null,
          h('tr', null, h('th', { scope: 'row' }, 'Sales'), h('td', { class: 'num' }, F.money(y.revenue))),
          h('tr', null, h('th', { scope: 'row' }, 'Costs'), h('td', { class: 'num' }, F.money(-y.costs))),
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
          h('h2', null, `Spring plan, ${c.year}`),
          h('p', { class: 'sub' }, `Six fields of ${F.area(S.FIELD_ACRES)} each. Choose what each one grows this year.`)),
        app.settings.hints && c.yearIdx === 0 ? h('p', { class: 'hint' },
          'A first spring: Katahdin on certified seed is the safe Maine choice, and the two worn fields are already set to rest. Read down the fields, then begin the season.') : null,
        c.seedStock.length ? h('p', { class: 'sub' }, 'Saved seed in the cellar: ', F.list(c.seedStock.map(x => `${S.variety(x.variety).name}, ${x.fields === 1 ? 'one field’s' : `${x.fields} fields’`} worth`)), '.') : null,
        h('div', { class: 'plan-body' },
          h('div', { class: 'plan-fields' }, c.plans.map((_, i) => fieldRow(c, i))),
          h('div', { class: 'plan-side' }, money(c), lastYear(c), equipment(c))),
        h('footer', { class: 'sheet-foot' },
          err ? h('p', { class: 'error-text', role: 'alert', testid: 'begin-error' }, err) : null,
          h('button', { class: 'btn primary big', type: 'button', testid: 'begin-season', onclick: begin }, `Begin the ${c.year} season`)),
      ])
    },
    insets: L.insets,
  }
}
