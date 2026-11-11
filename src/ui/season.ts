import * as S from '../sim/index.ts'
import { meter, patch, type Ctx, type Screen } from './core.ts'
import { h, icon, kbd } from './dom.ts'
import * as F from './fmt.ts'
import { showWeighIn } from './dig.ts'
import { fieldLabels } from './labels.ts'
import { soilWord } from './plan.ts'
import { topBar } from './top.ts'

export const JOB_KEY: Record<S.JobKind, string> = { plant: 'P', hill: 'H', scout: 'C', spray: 'S', water: 'W', rogue: 'R', sample: 'T', kill: 'K', dig: 'D' }
export const JOB_VERB: Record<S.JobKind, string> = {
  plant: 'Plant', hill: 'Hill', scout: 'Scout', spray: 'Spray', water: 'Water', rogue: 'Rogue', sample: 'Test dig', kill: 'Kill vines', dig: 'Dig',
}

const TABS = [['coach', 'Coach'], ['field', 'Field'], ['work', 'Work'], ['weather', 'Weather'], ['diary', 'Diary']] as const

type Info = S.FieldInfo

function waterClass(f: Info): string {
  switch (f.moistureLabel) {
    case 'standing water': case 'wet': return 'cold'
    case 'dry': return 'warn'
    case 'wilting': return 'bad'
    default: return 'ok'
  }
}

function hillWord(n: number): string {
  return n >= 2 ? 'twice' : n === 1 ? 'once' : 'not yet'
}

// The part of a chip's spoken name that its little marks show to the eye.
function chipMarksText(f: Info, queued: number): string {
  const parts: string[] = []
  if (f.status === 'growing' || f.status === 'planted') {
    parts.push(`soil ${f.moistureLabel}`)
    parts.push(f.blightHills > 0 ? `blight seen on ${F.plural(f.blightHills, 'hill')}` : 'no blight seen')
    parts.push(f.protect > 0.02 ? `protectant ${F.pct(f.protect)}` : 'no protectant')
  }
  if (queued) parts.push(`${F.plural(queued, 'job')} queued`)
  return parts.length ? `: ${parts.join(', ')}` : ''
}

function lastLog(c: S.Campaign, field: number, type: string): S.GameEvent | undefined {
  const log = c.season?.log ?? []
  for (let k = log.length - 1; k >= 0; k--) if (log[k].field === field && log[k].type === type) return log[k]
  return undefined
}

// Advice items that say the same thing about several fields become one line with one button.
interface Group { act: S.Advice['act']; fields: number[]; lot: number; text: string; why: string; urgent: boolean }

function groupAdvice(list: S.Advice[]): Group[] {
  const out: Group[] = []
  for (const a of list) {
    const g = a.act !== 'sell' && a.act !== 'close' ? out.find(x => x.act === a.act && x.why === a.why && x.urgent === a.urgent) : undefined
    if (g) g.fields.push(a.field)
    else out.push({ act: a.act, fields: a.field >= 0 ? [a.field] : [], lot: a.lot, text: a.text, why: a.why, urgent: a.urgent })
  }
  for (const g of out) {
    if (g.fields.length < 2) continue
    const first = S.FIELD_NAMES[g.fields[0]]
    const names = F.list(g.fields.map(i => S.FIELD_NAMES[i]))
    g.text = g.text.replace(first, names).replace(/ is too wet/, ' are too wet')
  }
  return out
}

export function seasonScreen(ctx: Ctx, labelsLayer: HTMLElement): Screen {
  const app = ctx.app
  const phone = ctx.phone()
  const top = topBar(ctx)
  const coach = h('section', { class: 'card coach', 'aria-labelledby': 'coach-h' })
  const weather = h('section', { class: 'card weather', 'aria-labelledby': 'weather-h' })
  const diary = h('section', { class: 'card diary', 'aria-labelledby': 'diary-h' })
  const panel = h('section', { class: 'card fieldpanel', 'aria-label': 'Field' })
  const work = h('section', { class: 'card worklist', 'aria-labelledby': 'work-h' })
  const chips = h('nav', { class: 'chips', 'aria-label': 'Fields' })
  const sections: Record<string, HTMLElement> = { coach, field: panel, work, weather, diary }

  let el: HTMLElement
  let leftRail: HTMLElement | null = null
  let rightRail: HTMLElement | null = null
  let sheet: HTMLElement | null = null
  let tabs: HTMLElement | null = null
  let body: HTMLElement | null = null
  if (phone) {
    tabs = h('div', { class: 'sheet-tabs', role: 'group', 'aria-label': 'Show' })
    body = h('div', { class: 'sheet-body', 'data-scroll': 'sheet', id: 'sheet-body' })
    sheet = h('section', { class: 'bottom-sheet paper', 'aria-label': 'Farm panels' }, chips, tabs, body)
    el = h('main', { class: 'season-screen phone' }, top.el, sheet)
  } else {
    leftRail = h('aside', { class: 'rail left', 'aria-label': 'Coach, weather and diary' }, coach, weather, diary)
    rightRail = h('aside', { class: 'rail right', 'aria-label': 'Field and work list' }, panel, work)
    el = h('main', { class: 'season-screen' }, top.el, leftRail, chips, rightRail)
  }

  const placeLabels = fieldLabels(ctx, labelsLayer, i => S.FIELD_NAMES[i])

  // ------------------------------------------------------------ chips

  function updateChips(c: S.Campaign): void {
    const s0 = c.season!
    const infos = Array.from({ length: S.FIELD_COUNT }, (_, i) => S.fieldInfo(c, i))
    const model = infos.map(f => [f.variety, f.stage, f.status, f.moistureLabel, f.blightHills, Math.round(f.protect * 20), s0.jobs.filter(j => j.field === f.index).length, app.selected === f.index])
    patch(chips, JSON.stringify(model), () => infos.map(f => {
      const queued = s0.jobs.filter(j => j.field === f.index).length
      const growing = f.status === 'growing' || f.status === 'planted'
      return h('button', {
        class: `chip${app.selected === f.index ? ' on' : ''}${f.status === 'rest' ? ' resting' : ''}`, type: 'button',
        testid: `field-${f.index}`, 'aria-pressed': String(app.selected === f.index),
        onclick: () => app.select(app.selected === f.index ? -1 : f.index),
      },
      h('span', { class: 'chip-name' }, f.name),
      h('span', { class: 'chip-crop' }, f.status === 'rest' ? 'Oats and clover' : f.variety),
      h('span', { class: 'chip-row' },
        h('span', { class: 'chip-stage' }, f.stage),
        h('span', { class: 'chip-marks', 'aria-hidden': 'true' },
          growing ? h('span', { class: `mark water-${waterClass(f)}`, title: `Soil ${f.moistureLabel}` }, icon('drop')) : null,
          f.blightHills > 0 ? h('span', { class: 'mark blight', title: `Blight seen on ${f.blightHills} hills` }, icon('spot'), String(f.blightHills)) : null,
          growing && f.protect > 0.02 ? h('span', { class: `mark ${f.protect >= 0.35 ? 'prot' : 'prot-low'}`, title: `Protectant ${F.pct(f.protect)}` }, icon('shield')) : null,
          queued ? h('span', { class: 'mark queued', title: `${queued} jobs queued` }, icon('list'), String(queued)) : null)),
      h('span', { class: 'visually-hidden' }, chipMarksText(f, queued)))
    }))
  }

  // ------------------------------------------------------------ field panel

  function reading(label: string, visual: HTMLElement | null, value: HTMLElement | string, extra?: string | null): HTMLElement {
    return h('div', { class: 'reading' },
      h('span', { class: 'label' }, label),
      visual,
      h('span', { class: 'reading-value' }, value),
      extra ? h('span', { class: 'sub' }, extra) : null)
  }

  function waterGauge(f: Info): HTMLElement {
    const steps: S.Moisture[] = ['wilting', 'dry', 'drying', 'good', 'wet', 'standing water']
    const at = steps.indexOf(f.moistureLabel)
    return h('div', { class: 'gauge', role: 'img', 'aria-label': `Soil water: ${f.moistureLabel}, ${F.pct(f.moisture)} of the water plants can use` },
      steps.map((_, k) => h('span', { class: `gauge-step g-${k}${k === at ? ' at' : ''}` })))
  }

  function estimateBar(e: S.Estimate, scaleMax: number, cls = ''): HTMLElement {
    const lo = F.perAreaValue(e.lo), hi = F.perAreaValue(e.hi), max = F.perAreaValue(scaleMax)
    return h('div', { class: `band ${cls}`, role: 'img', 'aria-label': `Estimated yield ${F.perArea(e.lo)} to ${F.perArea(e.hi)}` },
      h('span', { class: 'range-band', style: `left:${(lo / max * 100).toFixed(1)}%;width:${Math.max(1.5, (hi - lo) / max * 100).toFixed(1)}%` }),
      h('span', { class: 'range-axis' }, h('span', null, '0'), h('span', null, `${F.num(max)} ${F.perAreaUnit()}`)))
  }

  // Jobs that can be queued get full rows; the rest sit in a compact list, each with the reason it cannot be done.
  function actionList(c: S.Campaign, i: number): (HTMLElement | null)[] {
    const acts = S.fieldActions(app.world, c, i)
    const all = Array.from({ length: S.FIELD_COUNT }, (_, k) => S.fieldActions(app.world, c, k))
    const open = acts.filter(a => a.ok)
    const shut = acts.filter(a => !a.ok)
    return [
      open.length ? h('ul', { class: 'actions' }, open.map(a => row(a))) : h('p', { class: 'sub' }, 'Nothing can be done here today.'),
      shut.length ? h('ul', { class: 'actions-off', 'aria-label': 'Not possible now' }, shut.map(a => h('li', null,
        h('button', { class: 'act-off', type: 'button', testid: `act-${a.kind}`, disabled: true, 'aria-describedby': `act-meta-${a.kind}` }, JOB_VERB[a.kind]),
        h('span', { class: 'act-why', id: `act-meta-${a.kind}` }, a.why)))) : null,
    ]
    function row(a: S.ActionInfo): HTMLElement {
      const k = acts.indexOf(a)
      const where = all.map((list, fi) => list[k].ok ? fi : -1).filter(fi => fi >= 0)
      const meta = `${F.days(a.days)}${a.cost ? ` · ${F.money(a.cost)}` : ''}${a.wait ? ` · today: ${a.wait}` : ''}`
      return h('li', { class: 'action' },
        h('button', {
          class: 'act', type: 'button', testid: `act-${a.kind}`, 'aria-keyshortcuts': JOB_KEY[a.kind],
          'aria-describedby': `act-meta-${a.kind}`,
          onclick: () => { ctx.run({ t: 'job', kind: a.kind, field: i }) },
        }, icon(a.kind), h('span', { class: 'act-label' }, JOB_VERB[a.kind]), kbd(JOB_KEY[a.kind])),
        h('span', { class: 'act-meta', id: `act-meta-${a.kind}` }, meta),
        where.length >= 2 ? h('button', {
          class: 'btn small all', type: 'button', testid: `act-all-${a.kind}`,
          title: `${JOB_VERB[a.kind]}: ${F.list(where.map(fi => S.FIELD_NAMES[fi]))}`,
          onclick: () => { for (const fi of where) app.do({ t: 'job', kind: a.kind, field: fi }) },
        }, h('span', { class: 'visually-hidden' }, `${JOB_VERB[a.kind]} `), `All ${where.length}`,
        h('span', { class: 'visually-hidden' }, ` fields: ${F.list(where.map(fi => S.FIELD_NAMES[fi]))}`)) : null)
    }
  }

  function updatePanel(c: S.Campaign): void {
    const i = app.selected
    if (i < 0) {
      patch(panel, `none|${phone}`, () => [
        h('h2', { class: 'panel-title' }, 'Fields'),
        h('p', { class: 'empty' }, phone ? 'Tap a field above to see it and give the farmer work there.' : 'Choose a field below, or click one on the land, to see it and give the farmer work there.'),
        h('p', { class: 'sub' }, 'Keys: ', kbd('['), ' and ', kbd(']'), ' step through the fields.'),
      ])
      return
    }
    const f = S.fieldInfo(c, i)
    const s0 = c.season!
    const acts = S.fieldActions(app.world, c, i)
    const sprayed = lastLog(c, i, 'sprayed')
    const lot = f.lot >= 0 ? c.lots.find(l => l.id === f.lot) : undefined
    const value = lot && lot.open ? S.lotValue(app.world, c, lot) : 0
    const allOk = Array.from({ length: S.FIELD_COUNT }, (_, k) => S.fieldActions(app.world, c, k).map(a => a.ok))
    const model = {
      i, f: { ...f, moisture: Math.round(f.moisture * 100), canopy: Math.round(f.canopy * 100), protect: Math.round(f.protect * 100), blightKnown: Math.round(f.blightKnown * 1000), stunted: Math.round(f.stunted * 100), bloom: Math.round(f.bloom * 4), wilt: 0, estimate: f.estimate ? [Math.round(f.estimate.lo), Math.round(f.estimate.hi), f.estimate.digs] : null },
      acts, allOk, sp: sprayed?.day, lot: lot ? [lot.open, Math.round(value)] : null, day: s0.day, u: app.settings.units, phone,
    }
    patch(panel, JSON.stringify(model), () => {
      const head = h('header', { class: 'panel-head' },
        h('div', null,
          h('h2', { class: 'panel-title' }, f.name),
          h('p', { class: 'sub' }, `${f.position[0].toUpperCase()}${f.position.slice(1)} · ${f.status === 'rest' ? 'oats and clover' : f.variety} · soil ${soilWord(f.soil)}, wilt ${F.pct(f.vert)}`)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Close ${f.name}`, testid: 'field-close', onclick: () => app.select(-1) }, icon('close')))
      if (f.status === 'rest') {
        return [head, h('p', { class: 'stage' }, 'Resting'),
          h('p', null, `Oats and clover this year. It earns ${F.money(S.REST_INCOME)} in the fall and puts the soil back for next year.`),
          h('p', { class: 'sub' }, `${F.plural(f.streak, 'potato year')} behind it; wilt in ${F.pct(f.vert)} of plants.`)]
      }
      const up = f.status === 'growing' || f.status === 'dead' || f.status === 'digging'
      const stage = f.daysIn > 0 && f.status !== 'dug' && f.status !== 'lost' ? `${f.stage}, day ${f.daysIn} since planting` : f.stage
      const readings: HTMLElement[] = []
      if (f.status === 'growing' || f.status === 'planted') {
        readings.push(reading('Canopy', meter(f.canopy, { label: 'Canopy', cls: 'leaf' }), F.pct(f.canopy), f.bloom > 0.2 ? 'in flower' : 'of the ground'))
        readings.push(reading('Soil water', waterGauge(f),
          h('span', { class: f.tooWet ? 'cold-text' : f.moistureLabel === 'dry' || f.moistureLabel === 'wilting' ? 'warn-text' : '' }, `${f.moistureLabel[0].toUpperCase()}${f.moistureLabel.slice(1)}`),
          f.tooWet ? 'too wet to work' : f.wilt > 0.3 ? 'plants drooping' : null))
        readings.push(reading('Hilled', h('span', { class: 'pips', role: 'img', 'aria-label': `Hilled ${hillWord(f.hillPasses)}` }, [0, 1].map(k => h('span', { class: `pip${k < f.hillPasses ? ' on' : ''}` }))),
          hillWord(f.hillPasses)[0].toUpperCase() + hillWord(f.hillPasses).slice(1), f.hillPasses < 2 ? 'of two' : null))
        readings.push(reading('Protectant', meter(f.protect, { label: 'Protectant on the leaf', cls: 'prot' }),
          f.protect > 0.02 ? `${F.pct(f.protect)} left` : 'None', sprayed ? `sprayed ${F.ago(s0.day - sprayed.day)}` : 'never sprayed'))
      }
      if (up || f.status === 'planted') {
        readings.push(reading('Blight', null, h('span', { class: f.blightHills > 0 ? 'bad-text' : '' },
          f.blightHills > 0 ? `${F.plural(f.blightHills, 'hill')}, ${(f.blightKnown * 100).toFixed(f.blightKnown < 0.01 ? 1 : 0)}% of leaf` : f.scoutAge < 0 ? 'Not looked for' : 'None seen'),
          f.scoutAge < 0 ? 'never walked' : `walked ${F.ago(f.scoutAge)}`))
        readings.push(reading('Virus', null, f.stunted > 0 ? `${F.pct(f.stunted)} stunted` : 'None stunted', 'seen from the rows'))
      }
      const est = f.estimate
      const scaleMax = est ? Math.max(500, Math.ceil(est.hi / 100) * 100) : 500
      const span = (lo: number, hi: number) => `${F.num(F.perAreaValue(lo), F.metric() ? 1 : 0)}–${F.perArea(hi)}`
      const massSpan = (lo: number, hi: number) => `${F.num(F.massValue(lo), F.metric() ? 1 : 0)}–${F.mass(hi)}`
      return [
        head,
        h('p', { class: 'stage' }, stage),
        readings.length ? h('div', { class: 'readings' }, readings) : null,
        est ? h('div', { class: 'estimate' },
          h('div', { class: 'est-head' }, h('span', { class: 'label' }, 'Yield estimate'), h('span', { class: 'sub' }, est.digs ? `${F.plural(est.digs, 'test dig')}` : 'by eye, no test digs')),
          estimateBar(est, scaleMax),
          h('p', { class: 'est-text' }, h('strong', { class: 'num' }, span(est.lo, est.hi)),
            h('span', { class: 'sub' }, ` · ${massSpan(est.lo * S.FIELD_ACRES, est.hi * S.FIELD_ACRES)} for the field`))) : (f.status === 'growing' ? h('p', { class: 'sub est-none' }, 'No estimate until the tubers set.') : null),
        f.deadDays >= 0 && f.status !== 'dug' && f.status !== 'lost' ? h('div', { class: 'skin' },
          h('div', { class: 'est-head' }, h('span', { class: 'label' }, 'Skin set'), h('span', { class: 'sub' }, `vines dead ${F.plural(f.deadDays, 'day')}`)),
          meter(f.skin, { label: 'Skin set', cls: 'skin-fill' }),
          h('p', { class: 'sub' }, f.skin >= 1 ? 'Skins are set: the crop will dig clean and keep.' : `${F.pct(f.skin)} set. About ${F.plural(Math.ceil((1 - f.skin) * S.SKIN_DAYS), 'day')} more before the skins are tough.`)) : null,
        lot ? h('div', { class: 'lot-box' },
          h('p', null, h('strong', null, `Dug ${F.date(c.year, lot.dugDay)}: `), `${F.mass(S.lotCwt(lot) + lot.sold)} to sell, ${F.mass(lot.grades.cull)} culled.`),
          h('div', { class: 'row-wrap' },
            h('button', { class: 'btn small', type: 'button', testid: `weighin-${lot.id}`, onclick: () => ctx.dialogs.open(showWeighIn(ctx, lot.id)) }, 'See the weigh-in'),
            lot.open ? h('button', { class: 'btn small primary', type: 'button', testid: `field-sell-${lot.id}`, onclick: () => ctx.run({ t: 'sell', lot: lot.id, frac: 1 }) }, `Sell now, ${F.money(value)}`)
              : h('span', { class: 'sub' }, lot.sold > 0 ? `Sold for ${F.money(lot.revenue)}.` : 'Nothing left to sell.'))) : null,
        f.status === 'dug' || f.status === 'lost' ? null : h('h3', { class: 'sub-title' }, 'Give the farmer work here'),
        f.status === 'dug' || f.status === 'lost' ? null : actionList(c, i),
      ]
    })
  }

  // ------------------------------------------------------------ work list

  function updateWork(c: S.Campaign): void {
    const s0 = c.season!
    const waits = S.jobWaits(app.world, c)
    const total = s0.jobs.reduce((a, j) => a + (j.need - j.done), 0)
    const model = { j: s0.jobs, w: waits, wk: s0.worked, f: s0.frozen, u: app.settings.units }
    patch(work, JSON.stringify(model), () => [
      h('div', { class: 'card-head' },
        h('h2', { id: 'work-h' }, 'Work list'),
        h('span', { class: 'sub' }, s0.jobs.length ? `about ${F.days(total)} of work` : '')),
      s0.worked.length ? h('p', { class: 'sub worked' }, 'Last day worked: ', F.list(s0.worked.filter((w, k, a) => a.findIndex(x => x.kind === w.kind && x.field === w.field) === k).map(w => `${S.JOB_LABEL[w.kind].toLowerCase()} ${S.FIELD_NAMES[w.field]}`)), '.') : null,
      s0.jobs.length === 0
        ? h('p', { class: 'empty' }, s0.frozen ? 'The ground has frozen. The season is over.' : 'Nothing on the list, so the farmer is idle. Choose a field and give them a job.')
        : h('ol', { class: 'jobs' }, s0.jobs.map((j, k) => {
          const wait = waits[j.id]
          const started = j.done > 0
          const lockDig = j.kind === 'dig' && started
          return h('li', { class: `job${wait ? ' waiting' : ''}` },
            h('div', { class: 'job-main' },
              h('span', { class: 'job-title' }, icon(j.kind), h('strong', null, S.JOB_LABEL[j.kind]), ` · ${S.FIELD_NAMES[j.field]}`),
              meter(j.done / j.need, { label: `${S.JOB_LABEL[j.kind]} ${S.FIELD_NAMES[j.field]} progress`, cls: 'job-meter', text: `${F.pct(j.done / j.need)} done` }),
              h('span', { class: `job-state${wait ? ' warn-text' : ''}` },
                `${wait ? `Waiting today: ${wait}` : started ? `${F.pct(j.done / j.need)} done` : k === 0 ? 'Next up' : 'Queued'} · ${F.days(j.need)}`)),
            h('div', { class: 'job-btns' },
              h('button', { class: 'icon-btn', type: 'button', testid: `job-bump-${j.id}`, k: `bump-${j.id}`, disabled: k === 0, 'aria-label': `Do ${S.JOB_LABEL[j.kind].toLowerCase()} ${S.FIELD_NAMES[j.field]} first`, title: 'Move to the front', onclick: () => ctx.run({ t: 'bump', id: j.id }) }, icon('up')),
              h('button', { class: 'icon-btn', type: 'button', testid: `job-cancel-${j.id}`, k: `cancel-${j.id}`, disabled: lockDig, 'aria-label': `Cancel ${S.JOB_LABEL[j.kind].toLowerCase()} ${S.FIELD_NAMES[j.field]}`, title: lockDig ? 'The digger is already in the field.' : 'Cancel', onclick: () => ctx.run({ t: 'cancel', id: j.id }) }, icon('close'))))
        })),
    ])
  }

  // ------------------------------------------------------------ weather

  function updateWeather(c: S.Campaign): void {
    const t = S.today(app.world, c)
    if (!t) return
    const fc = S.forecast(app.world, c, 5)
    const s0 = c.season!
    const year = c.year
    const svStart = S.dayIndex(year, S.SV_START.month, S.SV_START.dom)
    const model = { d: s0.day, sv: s0.sv, w: s0.watchDay, u: app.settings.units }
    patch(weather, JSON.stringify(model), () => {
      const d = t.day
      const skyWord: Record<string, string> = { clear: 'Clear', cloud: 'Some cloud', overcast: 'Overcast', rain: 'Rain', storm: 'Heavy rain', fog: 'Fog and damp', snow: 'Snow' }
      const blightWord = ['none', 'some', 'high', 'severe']
      const range = (x: number, sd: number) => `${F.degrees(x - sd)}–${F.degrees(x + sd)}`
      const watchBox = s0.day < svStart
        ? h('p', { class: 'sub' }, `Severity values start counting on ${F.date(year, svStart)}.`)
        : h('div', null,
          h('div', { class: 'watch-meter' },
            meter(Math.min(1, s0.sv / S.SV_THRESHOLD), { label: 'Blight severity values toward the watch', cls: s0.watchDay >= 0 ? 'bad-fill' : 'warn-fill', text: `${s0.sv} of ${S.SV_THRESHOLD}` }),
            h('span', { class: 'num watch-count' }, `${s0.sv} / ${S.SV_THRESHOLD}`)),
          h('p', { class: s0.watchDay >= 0 ? 'bad-text watch-text' : 'sub' }, s0.watchDay >= 0
            ? `Watch on since ${F.date(year, s0.watchDay)}. Spores can land any day; keep protectant on the leaf.`
            : `${S.SV_THRESHOLD - s0.sv} more and the watch goes on.${t.severity > 0 ? ` Today's weather adds ${t.severity}.` : ''}`))
      return [
        h('div', { class: 'card-head' }, h('h2', { id: 'weather-h' }, 'Weather'), h('span', { class: 'sub' }, 'Caribou station')),
        h('div', { class: 'today' },
          icon(t.sky, 'ic sky'),
          h('div', null,
            h('p', { class: 'today-sky' }, skyWord[t.sky] ?? t.sky),
            h('p', { class: 'num' }, `High ${F.temp(d.tmax)} · low ${F.temp(d.tmin)}`),
            h('p', { class: 'num sub' }, `Rain ${F.rain(d.prcp)} · soil ${F.temp(t.soilT)}`))),
        h('table', { class: 'forecast' },
          h('caption', null, `Next five days (${F.tempUnit()})`),
          h('thead', null, h('tr', null, h('td'), fc.map(x => h('th', { scope: 'col' }, h('span', { class: 'fc-wd' }, F.weekday(year, x.day, true)), h('span', { class: 'fc-dom' }, String(F.dayOfMonth(year, x.day))))))),
          h('tbody', null,
            h('tr', null, h('th', { scope: 'row' }, 'High'), fc.map(x => h('td', { class: 'num' }, range(x.hi, x.spread)))),
            h('tr', null, h('th', { scope: 'row' }, 'Low'), fc.map(x => h('td', { class: 'num' }, range(x.lo, x.spread)))),
            h('tr', null, h('th', { scope: 'row' }, 'Rain'), fc.map(x => h('td', { class: `num${x.rainChance >= 60 ? ' cold-text' : ''}` }, `${x.rainChance}%`))),
            h('tr', null, h('th', { scope: 'row' }, F.metric() ? 'mm' : 'Inches'), fc.map(x => h('td', { class: 'num sub' }, x.rainMm > 0 ? F.rain(x.rainMm).replace(/ (in|mm)$/, '') : '0'))),
            h('tr', null, h('th', { scope: 'row' }, 'Blight'), fc.map(x => h('td', { class: `risk risk-${x.blight}` }, blightWord[x.blight]))),
            h('tr', null, h('th', { scope: 'row' }, 'Frost'), fc.map(x => h('td', { class: `num${x.frostChance >= 30 ? ' cold-text strong' : x.frostChance > 0 ? '' : ' sub'}` }, `${x.frostChance}%`))))),
        h('div', { class: 'watch' }, h('h3', { class: 'sub-title' }, 'Blight watch'), watchBox),
      ]
    })
  }

  // ------------------------------------------------------------ coach

  function doAdvice(g: Group): void {
    if (g.act === 'sell') { ctx.run({ t: 'sell', lot: g.lot, frac: 1 }); return }
    if (g.act === 'close') { ctx.run({ t: 'endSeason' }); return }
    if (g.act === 'wait') return
    const fails: string[] = []
    for (const fi of g.fields) {
      const r = app.do({ t: 'job', kind: g.act, field: fi })
      if (!r.ok) fails.push(`${S.FIELD_NAMES[fi]}: ${r.err}`)
    }
    if (fails.length) ctx.toast(fails.join(' '), 'warn')
  }

  function updateCoach(c: S.Campaign): void {
    if (!app.settings.hints) {
      patch(coach, 'off', () => [
        h('div', { class: 'card-head' }, h('h2', { id: 'coach-h' }, 'Coach')),
        h('p', { class: 'sub' }, 'The coach is off. Turn it on in the menu.'),
      ])
      return
    }
    const groups = groupAdvice(S.advise(app.world, c)).slice(0, 3)
    const done = S.seasonDone(c)
    const model = { g: groups, sp: app.speed, done, q: c.season!.jobs.length, u: app.settings.units }
    let first = true
    patch(coach, JSON.stringify(model), () => [
      h('div', { class: 'card-head' }, h('h2', { id: 'coach-h' }, 'Coach'), h('span', { class: 'sub' }, 'what a careful grower would do')),
      groups.length === 0
        ? h('p', { class: 'empty' }, 'Nothing pressing. Let the days run, and walk each field about once a week.')
        : h('ol', { class: 'advice' }, groups.map(g => {
          const label = g.act === 'sell' ? 'Sell now' : g.act === 'close' ? 'Close out the season' : g.fields.length > 1 ? `Add all ${g.fields.length} to the list` : 'Add to the work list'
          let testid: string | undefined
          if (g.act !== 'wait') { testid = first ? 'advice-do' : undefined; first = false }
          return h('li', { class: `advice-item${g.urgent ? ' urgent' : ''}${g.act === 'wait' ? ' wait' : ''}` },
            h('p', { class: 'advice-text' }, g.urgent ? h('span', { class: 'tag' }, 'Now') : null, F.localize(g.text)),
            h('p', { class: 'advice-why' }, F.localize(g.why)),
            g.act !== 'wait' ? h('button', { class: `btn small${g.urgent || g.act === 'close' ? ' primary' : ''}`, type: 'button', testid, k: `adv-${g.act}-${g.fields.join('.')}-${g.lot}`, onclick: () => doAdvice(g) }, label) : null)
        })),
      !done && app.speed === 0 ? h('p', { class: 'clock-note' }, icon('pause'), c.season!.jobs.length
        ? 'The clock is stopped. Press Space or a speed button to let the days run. It stops itself when something needs you.'
        : 'The clock is stopped. Queue some work, then press Space or a speed button to let the days run.') : null,
    ])
  }

  // ------------------------------------------------------------ diary

  function updateDiary(c: S.Campaign): void {
    const log = c.season!.log
    const last = log[log.length - 1]
    patch(diary, JSON.stringify([log.length, last?.day, last?.text, app.settings.units]), () => [
      h('div', { class: 'card-head' }, h('h2', { id: 'diary-h' }, 'Diary')),
      log.length === 0 ? h('p', { class: 'empty' }, 'Nothing has happened yet.') :
        h('ol', { class: 'log', 'data-scroll': 'diary', tabindex: '0', 'aria-label': 'Diary, newest first' }, log.slice(-60).reverse().map(e => h('li', { class: `lv-${e.level}` },
          h('span', { class: 'log-date' }, F.date(c.year, e.day, true)),
          e.level === 'bad' ? icon('spot', 'ic lv-bad') : e.level === 'warn' ? icon('warn', 'ic lv-warn') : null,
          h('span', null, F.localize(e.text))))),
    ])
  }

  // ------------------------------------------------------------ phone sheet

  function updateSheet(): void {
    if (!tabs || !body || !sheet) return
    const avail = TABS.filter(([k]) => k !== 'coach' || app.settings.hints)
    if (!avail.some(([k]) => k === ctx.sheet.tab)) ctx.sheet.tab = 'field'
    const c = app.campaign!
    patch(tabs, JSON.stringify([ctx.sheet.tab, ctx.sheet.open, avail.length, c.season!.jobs.length]), () => [
      avail.map(([k, label]) => h('button', {
        class: 'tab', type: 'button', 'aria-pressed': String(ctx.sheet.tab === k && ctx.sheet.open), testid: `tab-${k}`,
        onclick: () => { ctx.sheet.tab = k; ctx.sheet.open = true; ctx.dirty() },
      }, label, k === 'work' && c.season!.jobs.length ? h('span', { class: 'count' }, String(c.season!.jobs.length)) : null)),
      h('button', {
        class: 'icon-btn sheet-toggle', type: 'button', testid: 'sheet-toggle', 'aria-expanded': String(ctx.sheet.open), 'aria-controls': 'sheet-body',
        'aria-label': ctx.sheet.open ? 'Fold the panels down to see more of the farm' : 'Open the panels',
        onclick: () => { ctx.sheet.open = !ctx.sheet.open; ctx.dirty() },
      }, icon(ctx.sheet.open ? 'down' : 'up')),
    ])
    sheet.classList.toggle('closed', !ctx.sheet.open)
    const want = sections[ctx.sheet.tab]
    if (body.firstElementChild !== want) {
      body.replaceChildren(want)
      body.scrollTop = 0
    }
  }

  return {
    el,
    update() {
      const c = app.campaign
      if (!c || !c.season) return
      top.update()
      updateChips(c)
      updatePanel(c)
      updateWork(c)
      updateWeather(c)
      updateCoach(c)
      updateDiary(c)
      updateSheet()
    },
    insets() {
      const t = top.el.getBoundingClientRect().bottom
      if (phone && sheet) return [t, 0, innerHeight - sheet.getBoundingClientRect().top, 0]
      return [t, innerWidth - rightRail!.getBoundingClientRect().left, innerHeight - chips.getBoundingClientRect().top, leftRail!.getBoundingClientRect().right]
    },
    frame: placeLabels,
    dispose() {
      labelsLayer.replaceChildren()
    },
  }
}
