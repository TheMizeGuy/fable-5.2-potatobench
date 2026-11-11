// The command card: what is selected, what is known about it, and the orders it can take now.
import * as S from '../sim/index.ts'
import { gauge, patch, type Ctx, type Level } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { JOB_KEY, JOB_VERB, jobWhat } from './rules.ts'

const MAX_ORDERS = 5
const HOLD_MS = 1400
const FLASH_MS = 5000

// The stage as the card's second line says it; the reading below gives the rest.
const SHORT_STAGE: Record<string, string> = { 'Planted, not up': 'planted', 'Vines dead, skins setting': 'vines dead', 'Vines dead, skins set': 'vines dead' }

interface Offer { kind: S.JobKind; fields: number[]; days: number; cost: number; score: number }

export interface Card {
  el: HTMLElement
  update(c: S.Campaign): void
  // Gives an order to the selection, by button or by key.
  give(kind: S.JobKind, first: boolean): void
  // Gives each selected field what reference practice has for it.
  suggested(): void
  flash(text: string, level?: Level): void
}

function isJob(act: S.Advice['act'] | undefined): act is S.JobKind {
  return !!act && act !== 'wait' && act !== 'sell' && act !== 'close'
}

// How much an order matters here now, to choose five when more than five can be given.
function score(kind: S.JobKind, f: S.FieldInfo, s: S.Season, suggested: boolean): number {
  if (suggested) return 100
  switch (kind) {
    case 'plant': return 90
    case 'rogue': return 80
    case 'hill': return 70
    case 'water': return f.moistureLabel === 'dry' || f.moistureLabel === 'wilting' || f.moistureLabel === 'drying' ? 65 : 20
    case 'spray': return 60
    case 'scout': return 55
    case 'sample': return 50
    case 'kill': return s.fields[f.index].matureDay >= 0 || f.blightKnown >= 0.05 || s.day >= S.dayIndex(s.year, 7, 20) ? 45 : 25
    case 'dig': return f.status === 'dead' ? 85 : 10
  }
}

export function commandCard(ctx: Ctx, o: { onTray: (field: number) => void; onTicket: (lot: number) => void }): Card {
  const app = ctx.app
  const el = h('section', { class: 'card instrument', 'aria-label': 'Selected', testid: 'card', hidden: true })
  let page = 0
  let shownFor = ''
  let flashed: { text: string; level: Level; until: number } | null = null
  // After an order is given its button holds its place for a moment, so a second tap never lands on a neighbour.
  let held: { until: number; kinds: S.JobKind[]; given: S.JobKind[] } | null = null

  function offers(c: S.Campaign, sel: number[]): Offer[] {
    const s = c.season!
    const needs = app.needs()
    const by = new Map<S.JobKind, Offer>()
    for (const i of sel) {
      const f = S.fieldInfo(c, i)
      const need = needs[i]?.need?.act
      for (const a of S.fieldActions(app.world, c, i)) {
        if (!a.ok) continue
        const sc = score(a.kind, f, s, need === a.kind)
        const x = by.get(a.kind)
        if (x) { x.fields.push(i); x.days += a.days; x.cost += a.cost; x.score = Math.max(x.score, sc) }
        else by.set(a.kind, { kind: a.kind, fields: [i], days: a.days, cost: a.cost, score: sc })
      }
    }
    return S.JOBS.filter(k => by.has(k)).map(k => by.get(k)!)
  }

  function flash(text: string, level: Level = 'warn'): void {
    flashed = { text: F.localize(text), level, until: performance.now() + FLASH_MS }
    ctx.announce(flashed.text)
    setTimeout(() => ctx.dirty(), FLASH_MS + 50)
    ctx.dirty()
  }

  function give(kind: S.JobKind, first: boolean): void {
    const c = app.campaign
    if (!c || !c.season) return
    if (!app.selection.length) { ctx.say(ctx.touch() ? 'Tap a field first, then give it an order.' : 'Select a field first: click it, or press 1 to 6.'); return }
    const before = shown(offers(c, app.selection)).map(x => x.kind)
    const res = app.order(kind, { first })
    const took = res.filter(r => r.ok)
    if (!took.length) {
      flash(res.length === 1 ? `${JOB_VERB[kind]}: ${res[0].err}` : `${JOB_VERB[kind]}: ${res.map(r => `${S.FIELD_NAMES[r.field]}. ${r.err}`).join(' ')}`)
      return
    }
    flashed = null
    held = { until: performance.now() + HOLD_MS, kinds: held && performance.now() < held.until ? held.kinds : before, given: [...(held?.given ?? []), kind] }
    setTimeout(() => ctx.dirty(), HOLD_MS + 50)
    ctx.announce(`${JOB_VERB[kind]}: ${first ? 'first on the list' : 'on the list'} for ${F.list(took.map(r => S.FIELD_NAMES[r.field]))}.`)
  }

  function suggested(): void {
    const c = app.campaign
    if (!c || !c.season) return
    if (!app.selection.length) { ctx.say(ctx.touch() ? 'Tap a field first.' : 'Select a field first: click it, or press 1 to 6.'); return }
    const fails: string[] = []
    const took: number[] = []
    for (const i of [...app.selection]) {
      const r = app.smartOrder(i)
      if (r.ok) took.push(i)
      else fails.push(app.selection.length > 1 ? `${S.FIELD_NAMES[i]}. ${r.err}` : r.err)
    }
    if (took.length) ctx.announce(`The suggested order is on the list for ${F.list(took.map(i => S.FIELD_NAMES[i]))}.`)
    else flash(fails.join(' '), 'info')
  }

  // The five to show, in the order of the season.
  function shown(all: Offer[]): Offer[] {
    if (all.length <= MAX_ORDERS) return all
    const top = [...all].sort((a, b) => b.score - a.score).slice(0, MAX_ORDERS).map(x => x.kind)
    return all.filter(x => page === 0 ? top.includes(x.kind) : !top.includes(x.kind))
  }

  function orderRow(c: S.Campaign, sel: number[], suggestedKind: S.JobKind | null): Child {
    const all = offers(c, sel)
    const now = performance.now()
    if (held && now >= held.until) held = null
    const live = shown(all)
    const kinds = held ? held.kinds : live.map(x => x.kind)
    const touch = ctx.touch()
    const tight = ctx.layout() === 'narrow' || ctx.layout() === 'short'
    const cells = kinds.map(kind => {
      const x = all.find(y => y.kind === kind)
      if (!x) {
        const given = held?.given.includes(kind)
        return h('span', { class: `order ghost${given ? ' given' : ''}`, k: `order-${kind}` }, given ? [icon('check'), h('span', { class: 'order-name' }, 'On the list')] : null)
      }
      const part = x.fields.length < sel.length ? `${x.fields.length} of ${sel.length}` : ''
      // Where five orders share a phone's width, the time and cost are set close.
      const meta = tight ? `${F.days(x.days).replace(/ days?$/, 'd')}${x.cost ? ` ${F.money(x.cost)}` : ''}` : `${F.days(x.days)}${x.cost ? ` · ${F.money(x.cost)}` : ''}`
      return h('button', {
        class: `order${kind === suggestedKind ? ' suggested' : ''}`, type: 'button', testid: `order-${kind}`, 'aria-keyshortcuts': JOB_KEY[kind],
        title: touch ? undefined : jobWhat(kind),
        onclick: (e: Event) => give(kind, (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey),
        oncontextmenu: (e: Event) => { e.preventDefault(); give(kind, true) },
      },
      icon(kind),
      h('span', { class: 'order-name' }, tight && kind === 'kill' ? 'Kill' : JOB_VERB[kind], part ? h('span', { class: 'order-part num' }, ` ${part}`) : null),
      touch ? null : h('span', { class: 'key', 'aria-hidden': 'true' }, JOB_KEY[kind]),
      h('span', { class: 'order-meta num' }, ` ${meta}`),
      h('span', { class: 'sr' }, `. ${jobWhat(kind)}${kind === suggestedKind ? ' Suggested now.' : ''}`))
    })
    const more = all.length > MAX_ORDERS && !held ? h('button', {
      class: 'order more', type: 'button', testid: 'order-more', 'aria-label': page === 0 ? 'More orders' : 'Back to the first orders', 'aria-pressed': String(page === 1),
      onclick: () => { page = page === 0 ? 1 : 0; ctx.dirty() },
    }, icon(page === 0 ? 'more' : 'back')) : null
    return cells.length || more ? h('div', { class: 'orders', role: 'group', 'aria-label': 'Orders' }, cells, more) : null
  }

  function line(text: Child, cls = ''): HTMLElement {
    return h('p', { class: `card-line ${cls}`, testid: 'card-line' }, text || null)
  }

  // Why now, why wait, or why nothing can be done: one line, always in the same place.
  function adviceLine(c: S.Campaign, sel: number[], canAny: boolean): HTMLElement {
    if (flashed && performance.now() < flashed.until) return line(flashed.text, `flash lv-${flashed.level}`)
    const s = c.season!
    const needs = app.needs()
    if (sel.length === 1) {
      const i = sel[0]
      const { need, hold } = needs[i] ?? { need: null, hold: null }
      if (need && isJob(need.act)) return line([h('strong', null, `${JOB_VERB[need.act]}. `), F.localize(need.why)], need.urgent ? 'urgent' : 'need')
      if (need && need.act === 'sell') return line([h('strong', null, 'Sell. '), F.localize(need.why)], 'need')
      if (hold) return line(`${F.localize(hold.text)} ${F.localize(hold.why)}`)
      if (!canAny) {
        const f = S.fieldInfo(c, i)
        const job = s.jobs.find(j => j.kind === 'dig' && j.field === i)
        return line(s.frozen ? 'The ground has frozen. Nothing more can be done in the field.'
          : f.status === 'rest' ? `Resting in oats and clover. It earns ${F.money(S.REST_INCOME)} in the fall and puts the soil back.`
            : f.status === 'planted' ? 'Planted. Nothing to do here until the rows are up.'
              : f.status === 'digging' ? `Being dug: ${job ? F.pct(job.done / job.need) : 'part'} of the rows are out. The weigh ticket comes with the last row.`
                : f.status === 'lost' ? 'This crop is lost.'
                  : 'Everything this field can take is already on the list.')
      }
      return line('')
    }
    const want = sel.filter(i => isJob(needs[i]?.need?.act))
    if (want.length) return line(`${F.list(want.map(i => S.FIELD_NAMES[i]))} ${want.length === 1 ? 'has' : 'have'} a suggested order. ${ctx.touch() ? 'Tap a badge to give it.' : 'Enter gives each its own.'}`, 'need')
    if (!canAny) return line(s.frozen ? 'The ground has frozen. Nothing more can be done in the field.' : 'None of these fields can take an order now.')
    return line('')
  }

  function gauges(c: S.Campaign, f: S.FieldInfo): HTMLElement {
    const s = c.season!
    const watch = s.watchDay >= 0
    const waterCls = f.moistureLabel === 'wilting' ? 'bad' : f.moistureLabel === 'dry' ? 'warn' : f.tooWet ? 'cold' : ''
    const waterWord = f.moistureLabel === 'standing water' ? 'flooded' : f.moistureLabel
    // Each gauge has its name in words where there is room, and as a glyph where there is not.
    const cell = (label: string, glyph: string, value: string, g: HTMLElement, cls = '') => h('div', { class: `g ${cls}` },
      h('span', { class: 'g-head' }, icon(glyph, 'ic s g-ic'), h('span', { class: 't-label g-label' }, label), h('span', { class: 'g-v num' }, value)), g)
    return h('div', { class: 'gauges' },
      cell('Leaf', 'leaf', F.pct(f.canopy), gauge(f.canopy, { label: 'Leaf cover', cls: 'leaf' })),
      cell('Water', 'water', waterWord, gauge(Math.min(1, f.moisture), { label: 'Soil water', text: `${f.moistureLabel}, ${F.pct(f.moisture)} of what plants can use`, cls: waterCls }), waterCls),
      cell('Protection', 'shield', f.protect > 0.02 ? F.pct(f.protect) : 'none', gauge(f.protect, { label: 'Protectant on the leaf', cls: watch && f.protect < 0.35 ? 'warn' : '' }), watch && f.protect < 0.35 && f.status === 'growing' ? 'warn' : ''),
      cell('Hill', 'hill', `${f.hillPasses} of 2`, gauge(f.hillPasses / 2, { label: 'Hilled', text: f.hillPasses >= 2 ? 'twice' : f.hillPasses === 1 ? 'once, of two' : 'not yet', mark: 0.5 })))
  }

  // Blight as last seen, and how old that is. Before the rows are up, the soil; once the vines are dead, the skins.
  function reading(c: S.Campaign, f: S.FieldInfo): HTMLElement {
    const s = c.season!
    if (f.status === 'idle' || f.status === 'planted') {
      const t = S.today(app.world, c)
      const soil = (t ? t.soilT : 0) + S.SOIL_T_OFFSET[f.elev]
      return h('p', { class: 'reading' }, icon('planted', 'ic s'), h('span', null, `Soil ${F.temp(soil)} here. Seed wants ${F.temp(10)}.`))
    }
    if (f.status === 'dead') {
      const left = Math.ceil((1 - f.skin) * S.SKIN_DAYS)
      return h('p', { class: 'reading' }, icon('dead', 'ic s'), h('span', null, f.skin >= 1 ? 'Skins are set.' : `Skins ${F.pct(f.skin)} set, about ${F.plural(left, 'day')} to go.`))
    }
    if (f.status === 'digging') {
      const job = s.jobs.find(j => j.kind === 'dig' && j.field === f.index)
      return h('p', { class: 'reading' }, icon('dig', 'ic s'), h('span', null, `${job ? F.pct(job.done / job.need) : 'Part'} of the rows are out.`))
    }
    const age = f.scoutAge
    const stale = age < 0 || age >= 7
    const seen = f.blightHills > 0
    return h('p', { class: `reading${seen ? ' blight' : ''}${stale ? ' stale' : ''}`, testid: 'blight-reading' },
      icon(seen ? (stale ? 'blight-old' : 'blight') : stale ? 'stale' : 'check', 'ic s'),
      h('span', null, seen ? `Blight on ${F.plural(f.blightHills, 'hill')}` : age < 0 ? 'Not walked yet' : 'No blight seen'),
      age >= 0 ? h('span', { class: 'age' }, `walked ${F.ago(age)}`) : seen ? h('span', { class: 'age' }, 'seen from the road') : null)
  }

  function estimate(c: S.Campaign, f: S.FieldInfo): HTMLElement {
    const e = f.estimate
    if (!e) return h('p', { class: 'reading quiet' }, icon('bulk', 'ic s'), h('span', null, 'No yield estimate until the tubers set.'))
    const max = Math.max(500, Math.ceil(e.hi / 100) * 100)
    const sample = [...(c.season?.log ?? [])].reverse().find(x => x.type === 'sample' && x.field === f.index)
    return h('div', { class: 'estimate', testid: 'estimate' },
      h('span', { class: 't-label' }, 'Yield'),
      h('span', { class: 'gauge range', role: 'img', 'aria-label': `Yield estimate ${F.perAreaSpan(e.lo, e.hi)}, ${e.digs ? `from ${F.plural(e.digs, 'test dig')}` : 'by eye'}` },
        h('i', { style: `left:${(e.lo / max * 100).toFixed(1)}%;width:${Math.max(2, (e.hi - e.lo) / max * 100).toFixed(1)}%` })),
      h('span', { class: 'est-v num' }, F.perAreaSpan(e.lo, e.hi)),
      sample ? h('button', {
        class: 'nicon s', type: 'button', testid: 'sample-again', 'aria-label': `See the test dig of ${F.date(c.year, sample.day)}`, title: ctx.touch() ? undefined : `See the test dig of ${F.date(c.year, sample.day)}`,
        onclick: () => o.onTray(f.index),
      }, icon('sample', 'ic s')) : h('span', { class: 'est-by' }, 'by eye'))
  }

  function head(title: string, sub: string, k: string): HTMLElement {
    return h('header', { class: 'card-head' },
      h('div', null, h('h2', { class: 't-head', testid: 'card-title' }, title), h('p', { class: 'card-sub' }, sub)),
      h('button', { class: 'nicon', type: 'button', testid: 'card-close', k, 'aria-label': `Deselect${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.select(-1) }, icon('close')))
  }

  function one(c: S.Campaign, i: number): Child {
    const f = S.fieldInfo(c, i)
    const need = app.needs()[i]?.need
    const lot = f.lot >= 0 ? c.lots.find(l => l.id === f.lot) : undefined
    if (f.status === 'dug' && lot) {
      const value = lot.open ? S.lotValue(app.world, c, lot) : 0
      const cull = (['green', 'blight', 'frost', 'rot', 'small'] as S.Cause[]).reduce((a, k) => a + lot.loss[k], 0)
      return [
        head(f.name, `${f.variety} · dug ${F.date(c.year, lot.dugDay, true)}`, 'close'),
        h('div', { class: 'card-main' },
          h('p', { class: 'reading' }, icon('dig', 'ic s'), h('span', null, lot.open
            ? `${F.mass(S.lotCwt(lot))} in the cellar, worth ${F.money(value)} today.${lot.sold > 0 ? ` ${F.mass(lot.sold)} sold for ${F.money(lot.revenue)}.` : ''}`
            : lot.sold > 0 ? `${F.mass(lot.sold)} sold for ${F.money(lot.revenue)}. ${F.mass(cull)} culled.` : 'Nothing was fit to sell.')),
          need && need.act === 'sell' ? line([h('strong', null, 'Sell. '), F.localize(need.why)], 'need') : line('')),
        h('div', { class: 'orders' },
          lot.open ? h('button', { class: 'order wide', type: 'button', testid: `field-sell-${lot.id}`, onclick: () => ctx.run({ t: 'sell', lot: lot.id, frac: 1 }) },
            icon('check'), h('span', { class: 'order-name' }, 'Sell'), h('span', { class: 'order-meta num' }, F.money(value))) : null,
          h('button', { class: 'order wide', type: 'button', testid: `weighin-${lot.id}`, onclick: () => o.onTicket(lot.id) },
            icon('ticket'), h('span', { class: 'order-name' }, 'Ticket'), h('span', { class: 'order-meta' }, 'the weigh-in'))),
      ]
    }
    const rows = orderRow(c, [i], need && isJob(need.act) ? need.act : null)
    if (f.status === 'rest' || f.status === 'lost') {
      return [head(f.name, f.status === 'rest' ? 'Oats and clover · resting' : `${f.variety} · lost`, 'close'), h('div', { class: 'card-main' }, adviceLine(c, [i], false))]
    }
    return [
      head(f.name, `${f.variety} · ${(SHORT_STAGE[f.stage] ?? f.stage).toLowerCase()}`, 'close'),
      gauges(c, f),
      h('div', { class: 'card-main' }, h('div', { class: 'card-known' }, reading(c, f), estimate(c, f)), adviceLine(c, [i], !!rows)),
      rows,
    ]
  }

  function many(c: S.Campaign, sel: number[]): Child {
    const rows = orderRow(c, sel, null)
    return [
      head(`${sel.length} fields`, F.list(sel.map(i => S.FIELD_NAMES[i])), 'close'),
      h('div', { class: 'card-main' }, adviceLine(c, sel, !!rows)),
      rows,
    ]
  }

  function update(c: S.Campaign): void {
    const sel = app.selection.filter(i => i >= 0 && i < S.FIELD_COUNT)
    const was = el.hidden
    if (!sel.length) {
      // The card leaves as it came: nothing cuts out on one frame.
      if (!el.hidden && shownFor !== '' && !ctx.reduced()) {
        el.classList.remove('in')
        el.classList.add('out')
        setTimeout(() => { if (!app.selection.length) { el.hidden = true; el.classList.remove('out'); ctx.dirty() } }, 160)
      } else if (!el.classList.contains('out')) el.hidden = true
      shownFor = ''
      return
    }
    el.classList.remove('out')
    el.hidden = false
    const key = sel.join(',')
    if (key !== shownFor) { shownFor = key; page = 0; held = null; flashed = null }
    const s = c.season!
    const model = {
      sel, layout: ctx.layout(), day: s.day, jobs: s.jobs.map(j => [j.id, j.kind, j.field, Math.round(j.done * 20)]), u: app.settings.units, t: ctx.touch(), page,
      held: held && performance.now() < held.until ? [held.kinds, held.given] : 0, flash: flashed && performance.now() < flashed.until ? flashed.text : '',
      f: sel.map(i => { const f = S.fieldInfo(c, i); return [f.status, f.stage, Math.round(f.canopy * 100), Math.round(f.moisture * 50), f.moistureLabel, Math.round(f.protect * 100), f.hillPasses, f.blightHills, f.scoutAge, f.estimate ? [Math.round(f.estimate.lo), Math.round(f.estimate.hi), f.estimate.digs] : 0, Math.round(f.skin * 100), f.lot] }),
      n: app.needs().filter((_, i) => sel.includes(i)).map(x => [x.need?.id, x.need?.why, x.hold?.id, x.hold?.why]),
      lots: c.lots.filter(l => sel.includes(l.field)).map(l => [l.id, l.open, Math.round(S.lotCwt(l)), Math.round(l.sold), l.open ? Math.round(S.lotValue(app.world, c, l)) : 0]),
      frozen: s.frozen, w: s.watchDay >= 0, soil: Math.round(s.soilT * 2),
    }
    patch(el, JSON.stringify(model), () => sel.length === 1 ? one(c, sel[0]) : many(c, sel))
    el.setAttribute('aria-label', sel.length === 1 ? `Selected: ${S.FIELD_NAMES[sel[0]]}` : `Selected: ${sel.length} fields`)
    if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
  }

  return { el, update, give, suggested, flash }
}
