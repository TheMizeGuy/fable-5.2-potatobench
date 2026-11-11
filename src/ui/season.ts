import * as S from '../sim/index.ts'
import { meter, patch, type Ctx, type Screen } from './core.ts'
import { h, icon, kbd } from './dom.ts'
import * as F from './fmt.ts'
import { culledAtDig, digDays, lotKey, openCellar, showSample, showWeighIn } from './dig.ts'
import { fieldLabels } from './labels.ts'
import { soilWord } from './plan.ts'
import { JOB_KEY, JOB_VERB, jobWhat, largeRule } from './rules.ts'
import { topBar } from './top.ts'

const TABS = [['coach', 'Coach'], ['field', 'Field'], ['work', 'Work'], ['weather', 'Weather'], ['diary', 'Diary']] as const
// A chip has room for two words of stage; the field panel gives it in full.
const CHIP_STAGE: Record<string, string> = {
  'Planted, not up': 'Planted', 'Vines going down': 'Going down', 'Vines dead, skins setting': 'Skins setting', 'Vines dead, skins set': 'Skins set',
}
const HINT_KEY = 'the-county/view-hint'

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

function hintSeen(): boolean {
  try { return localStorage.getItem(HINT_KEY) !== null } catch { return true }
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
    g.text = g.text.replace(first, names).replace(/ is too wet/, ' are too wet').replace(/ is dry\./, ' are dry.')
  }
  return out
}

function groupKey(g: Group): string {
  return `${g.act}-${g.fields.join('.')}-${g.lot}`
}

export function seasonScreen(ctx: Ctx, labelsLayer: HTMLElement): Screen {
  const app = ctx.app
  const layout = ctx.layout()
  const compact = layout !== 'wide'
  const top = topBar(ctx)
  const coach = h('section', { class: 'card coach', 'aria-labelledby': 'coach-h' })
  const weather = h('section', { class: 'card weather', 'aria-labelledby': 'weather-h' })
  const diary = h('section', { class: 'card diary', 'aria-labelledby': 'diary-h' })
  const panel = h('section', { class: 'card fieldpanel', 'aria-label': 'Field' })
  const work = h('section', { class: 'card worklist', 'aria-labelledby': 'work-h' })
  const chips = h('nav', { class: 'chips', 'aria-label': 'Fields' })
  // Small standing notes over the land: what is in the cellar, and once, how to turn the view.
  const notes = h('div', { class: 'land-notes' })
  const sections: Record<string, HTMLElement> = { coach, field: panel, work, weather, diary }

  let el: HTMLElement
  let leftRail: HTMLElement | null = null
  let rightRail: HTMLElement | null = null
  let sheet: HTMLElement | null = null
  let tabs: HTMLElement | null = null
  let body: HTMLElement | null = null
  if (compact) {
    tabs = h('div', { class: 'sheet-tabs', role: 'group', 'aria-label': 'Show' })
    body = h('div', { class: 'sheet-body', 'data-scroll': 'sheet', id: 'sheet-body' })
    sheet = h('section', { class: 'bottom-sheet paper', 'aria-label': 'Farm panels' }, chips, tabs, body)
    el = h('main', { class: `season-screen ${layout}` }, top.el, notes, sheet)
  } else {
    leftRail = h('aside', { class: 'rail left', 'aria-label': 'Coach, weather and diary' }, coach, weather, diary)
    rightRail = h('aside', { class: 'rail right', 'aria-label': 'Field and work list' }, panel, work)
    el = h('main', { class: 'season-screen wide' }, top.el, leftRail, notes, chips, rightRail)
  }

  // Where the land is a narrow strip only the chosen field keeps its name tag; the chips carry all six names.
  const placeLabels = fieldLabels(ctx, labelsLayer, i => S.FIELD_NAMES[i], () => (layout === 'phone' && ctx.sheet.open) || innerHeight <= 500)

  // ------------------------------------------------------------ notes over the land

  let showHint = !hintSeen()
  if (showHint) {
    try { localStorage.setItem(HINT_KEY, '1') } catch { /* storage blocked: the hint simply shows again next time */ }
  }
  const dropHint = () => { if (showHint) { showHint = false; ctx.dirty() } }
  const hintTimer = showHint ? setTimeout(dropHint, 25000) : 0
  // Turning or zooming the land is the lesson learnt.
  const canvas = document.getElementById('field')
  let downAt: { x: number; y: number } | null = null
  const onDown = (e: Event) => { const p = e as PointerEvent; downAt = { x: p.clientX, y: p.clientY } }
  const onMove = (e: Event) => { const p = e as PointerEvent; if (downAt && Math.hypot(p.clientX - downAt.x, p.clientY - downAt.y) > 24) dropHint() }
  const onUp = () => { downAt = null }
  canvas?.addEventListener('pointerdown', onDown)
  canvas?.addEventListener('pointermove', onMove)
  canvas?.addEventListener('pointerup', onUp)
  canvas?.addEventListener('wheel', dropHint, { passive: true })

  function updateNotes(c: S.Campaign): void {
    const lots = S.openLots(c)
    const kept = lots.reduce((a, l) => a + S.lotCwt(l), 0)
    const worth = lots.reduce((a, l) => a + S.lotValue(app.world, c, l), 0)
    patch(notes, JSON.stringify([lots.length, Math.round(kept), Math.round(worth), showHint, ctx.touch(), app.settings.units]), () => [
      showHint ? h('p', { class: 'view-hint paper', testid: 'view-hint' },
        h('span', null, ctx.touch() ? 'Drag to turn, pinch to zoom, double tap to reset.' : 'Drag to turn the land, scroll to zoom, double-click to put it back.'),
        h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Dismiss this hint', testid: 'view-hint-close', onclick: dropHint }, icon('close'))) : null,
      lots.length ? h('button', { class: 'cellar-line paper', type: 'button', testid: 'cellar-line', onclick: () => openCellar(ctx) },
        icon('dig'),
        h('span', { class: 'cellar-text' },
          h('span', { class: 'label' }, 'In the cellar'),
          h('span', { class: 'num' }, `${F.mass(kept)} · ${F.money(worth)} today`))) : null,
    ])
  }

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
        h('span', { class: 'chip-stage' }, CHIP_STAGE[f.stage] ?? f.stage),
        h('span', { class: 'chip-marks', 'aria-hidden': 'true' },
          growing ? h('span', { class: `mark water-${waterClass(f)}`, title: `Soil ${f.moistureLabel}` }, icon('drop')) : null,
          f.blightHills > 0 ? h('span', { class: 'mark blight', title: `Blight seen on ${F.plural(f.blightHills, 'hill')}` }, icon('spot'), String(f.blightHills)) : null,
          growing && f.protect > 0.02 ? h('span', { class: `mark ${f.protect >= 0.35 ? 'prot' : 'prot-low'}`, title: `Protectant ${F.pct(f.protect)}` }, icon('shield')) : null,
          queued ? h('span', { class: 'mark queued', title: `${F.plural(queued, 'job')} queued` }, icon('list'), String(queued)) : null)),
      h('span', { class: 'visually-hidden' }, chipMarksText(f, queued)))
    }))
  }

  // ------------------------------------------------------------ field panel

  // The job whose description is showing by the pad. Pointing at a job previews it; a click holds it there,
  // so the pointer can cross other jobs on its way to the buttons in the description.
  let shown: S.JobKind | null = null
  let locked = false
  let shownFor = -1
  const show = (kind: S.JobKind | null) => { if (shown !== kind) { shown = kind; ctx.dirty() } }
  const dropShown = (e: Event) => { if (shown && !(e.target as HTMLElement).closest?.('.pad-wrap')) { locked = false; show(null) } }
  document.addEventListener('pointerdown', dropShown, true)

  function reading(label: string, visual: HTMLElement | null, text: (HTMLElement | string | null)[]): HTMLElement {
    return h('div', { class: 'reading' }, h('span', { class: 'label' }, label), visual ?? h('span'), h('span', { class: 'reading-value' }, text))
  }

  function waterGauge(f: Info): HTMLElement {
    const steps: S.Moisture[] = ['wilting', 'dry', 'drying', 'good', 'wet', 'standing water']
    const at = steps.indexOf(f.moistureLabel)
    return h('div', { class: 'gauge', role: 'img', 'aria-label': `Soil water: ${f.moistureLabel}, ${F.pct(f.moisture)} of the water plants can use` },
      steps.map((_, k) => h('span', { class: `gauge-step g-${k}${k === at ? ' at' : ''}` })))
  }

  function estimateBar(e: S.Estimate, scaleMax: number, cls = ''): HTMLElement {
    const lo = F.perAreaValue(e.lo), hi = F.perAreaValue(e.hi), max = F.perAreaValue(scaleMax)
    return h('div', { class: `band ${cls}`, role: 'img', 'aria-label': `Estimated yield ${F.perAreaSpan(e.lo, e.hi)}` },
      h('span', { class: 'range-band', style: `left:${(lo / max * 100).toFixed(1)}%;width:${Math.max(1.5, (hi - lo) / max * 100).toFixed(1)}%` }),
      h('span', { class: 'range-axis' }, h('span', null, '0'), h('span', null, `${F.num(max)} ${F.perAreaUnit()}`)))
  }

  // The nine jobs, always in the same nine places, so a job never slides under a finger meant for another.
  function jobPad(c: S.Campaign, i: number, acts: S.ActionInfo[]): HTMLElement {
    const s0 = c.season!
    return h('div', { class: 'pad', role: 'group', 'aria-label': `Work for the farmer in ${S.FIELD_NAMES[i]}` }, acts.map(a => {
      const job = s0.jobs.find(j => j.kind === a.kind && j.field === i)
      const state = job ? 'queued' : a.ok ? 'ok' : 'off'
      const meta = job ? 'on the list' : a.ok ? `${F.days(a.days)}${a.cost ? ` · ${F.money(a.cost)}` : ''}` : ''
      return h('button', {
        class: `job-btn ${state}${shown === a.kind ? ' shown' : ''}`, type: 'button', testid: `act-${a.kind}`,
        'aria-disabled': state === 'ok' ? null : 'true', 'aria-keyshortcuts': JOB_KEY[a.kind], 'aria-describedby': `job-desc-${a.kind}`,
        onclick: () => { shown = a.kind; locked = true; if (state === 'ok') ctx.run({ t: 'job', kind: a.kind, field: i }); ctx.dirty() },
        onfocus: () => { locked = false; show(a.kind) },
        onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse' && !locked) show(a.kind) },
      },
      icon(job ? 'check' : a.kind),
      h('span', { class: 'job-label' }, JOB_VERB[a.kind]),
      h('span', { class: 'job-meta' }, meta))
    }))
  }

  // What each job does and why it cannot be done now, for a screen reader, whatever the pointer is showing.
  function jobSaid(c: S.Campaign, i: number, acts: S.ActionInfo[]): HTMLElement {
    return h('div', { class: 'visually-hidden' }, acts.map(a => {
      const job = c.season!.jobs.some(j => j.kind === a.kind && j.field === i)
      return h('span', { id: `job-desc-${a.kind}` }, `${jobWhat(a.kind)} ${job ? 'On the work list.' : a.ok ? '' : `Not now: ${a.why}`}`)
    }))
  }

  function jobDetail(c: S.Campaign, i: number, acts: S.ActionInfo[], allOk: boolean[][]): HTMLElement {
    if (!shown) {
      return h('div', { class: 'pad-detail idle' }, h('p', { class: 'sub' }, ctx.touch()
        ? 'Tap a job to put it on the farmer’s work list. A greyed job says why when tapped.'
        : 'Point at a job to see what it does. Click it to put it on the farmer’s work list.'))
    }
    const k = acts.findIndex(a => a.kind === shown)
    const a = acts[k]
    const job = c.season!.jobs.find(j => j.kind === a.kind && j.field === i)
    const others = allOk.map((oks, fi) => fi !== i && oks[k] ? fi : -1).filter(fi => fi >= 0)
    const state = job ? (job.done > 0 ? `Under way, ${F.pct(job.done / job.need)} done.` : 'On the work list.')
      : a.ok ? `${F.upper(F.days(a.days))} of work${a.cost ? `, ${F.money(a.cost)}` : ', no charge'}.${a.wait ? ` Today it waits: ${a.wait}.` : ''}`
        : `Not now: ${a.why}`
    const all = a.ok ? [i, ...others] : others
    return h('div', { class: 'pad-detail' },
      h('p', null, h('strong', null, JOB_VERB[a.kind]), ctx.touch() ? null : [' ', kbd(JOB_KEY[a.kind])], ' ', jobWhat(a.kind)),
      h('p', { class: a.ok || job ? 'pad-state' : 'pad-state warn-text' }, state,
        job && !(job.kind === 'dig' && job.done > 0) ? h('button', {
          class: 'btn small all', type: 'button', testid: `act-cancel-${a.kind}`, onclick: () => { ctx.run({ t: 'cancel', id: job.id }) },
        }, 'Take it off') : null,
        others.length && (a.ok || job) ? h('button', {
          class: 'btn small all', type: 'button', testid: `act-all-${a.kind}`, title: `${JOB_VERB[a.kind]}: ${F.list(all.map(fi => S.FIELD_NAMES[fi]))}`,
          onclick: () => { for (const fi of all) app.do({ t: 'job', kind: a.kind, field: fi }) },
        }, a.ok ? `${F.upper(F.allOf(all.length))} fields` : others.length === 1 ? `${S.FIELD_NAMES[others[0]]} too` : `The other ${others.length} too`,
        h('span', { class: 'visually-hidden' }, `: ${JOB_VERB[a.kind].toLowerCase()} ${F.list(all.map(fi => S.FIELD_NAMES[fi]))}`)) : null))
  }

  function updatePanel(c: S.Campaign): void {
    const i = app.selected
    if (i < 0) {
      patch(panel, `none|${compact}|${ctx.touch()}`, () => [
        h('h2', { class: 'panel-title' }, 'Fields'),
        h('p', { class: 'empty' }, compact ? 'Choose a field above to see it and give the farmer work there.' : 'Choose a field below, or click one on the land, to see it and give the farmer work there.'),
        ctx.touch() ? null : h('p', { class: 'sub' }, 'Keys: ', kbd('['), ' and ', kbd(']'), ' step through the fields.'),
      ])
      return
    }
    if (i !== shownFor) { shownFor = i; shown = null; locked = false }
    const padFirst = el.classList.contains('pad-first')
    const f = S.fieldInfo(c, i)
    const s0 = c.season!
    const acts = S.fieldActions(app.world, c, i)
    const allOk = Array.from({ length: S.FIELD_COUNT }, (_, k) => S.fieldActions(app.world, c, k).map(a => a.ok))
    const sprayed = lastLog(c, i, 'sprayed')
    const sample = lastLog(c, i, 'sample')
    const lot = f.lot >= 0 ? c.lots.find(l => l.id === f.lot) : undefined
    const value = lot && lot.open ? S.lotValue(app.world, c, lot) : 0
    const digJob = s0.jobs.find(j => j.kind === 'dig' && j.field === i)
    const today = S.today(app.world, c)
    const soilT = today ? today.soilT + S.SOIL_T_OFFSET[f.elev] : 0
    const model = {
      i, f: { ...f, moisture: Math.round(f.moisture * 100), canopy: Math.round(f.canopy * 100), protect: Math.round(f.protect * 100), blightKnown: Math.round(f.blightKnown * 1000), stunted: Math.round(f.stunted * 100), stand: Math.round(f.stand * 100), frosted: Math.round(f.frosted * 100), bloom: Math.round(f.bloom * 4), wilt: f.wilt > 0.3, estimate: f.estimate ? [Math.round(f.estimate.lo), Math.round(f.estimate.hi), f.estimate.digs] : null },
      acts, allOk, sp: sprayed?.day, sm: sample?.day, lot: lot ? [lot.open, Math.round(value), Math.round(lot.sold)] : null, dig: digJob ? Math.round(digJob.done / digJob.need * 100) : -1,
      jobs: s0.jobs.filter(j => j.field === i).map(j => [j.id, j.kind, j.done > 0]), t: Math.round(soilT), day: s0.day, u: app.settings.units, compact, shown, touch: ctx.touch(), padFirst,
    }
    patch(panel, JSON.stringify(model), () => {
      const stage = f.daysIn > 0 && f.status !== 'dug' && f.status !== 'lost' ? `${f.stage}, day ${f.daysIn} since planting` : f.stage
      const head = h('header', { class: 'panel-head' },
        h('div', null,
          h('h2', { class: 'panel-title' }, f.name),
          h('p', { class: 'stage' }, stage)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Close ${f.name}`, testid: 'field-close', onclick: () => app.select(-1) }, icon('close')))
      const stageLine = h('p', { class: 'stage in-info' }, stage)
      const facts = h('p', { class: 'sub facts-line' }, `${F.upper(f.position)} · ${f.status === 'rest' ? 'oats and clover' : f.variety} · soil ${soilWord(f.soil)} · early dying in ${F.pct(f.vert)} of plants`)
      if (f.status === 'rest') {
        return [head, h('div', { class: 'panel-info' }, stageLine, facts,
          h('p', null, `Oats and clover this year. It earns ${F.money(S.REST_INCOME)} in the fall. A rest year puts the soil back at once and wears early dying down slowly.`),
          h('p', { class: 'sub' }, `${F.plural(f.streak, 'potato year')} running before this one.`))]
      }
      const up = f.status === 'growing' || f.status === 'dead' || f.status === 'digging'
      const live = f.status === 'growing' || f.status === 'planted'
      const worked = f.status !== 'dug' && f.status !== 'lost'
      const readings: HTMLElement[] = []
      if (live) {
        readings.push(reading('Canopy', meter(f.canopy, { label: 'Canopy', cls: 'leaf' }), [
          `${F.pct(f.canopy)} of the ground${f.bloom > 0.2 ? ', in flower' : ''}`,
          f.blightKnown >= 0.05 ? h('span', { class: 'bad-text' }, `; ${F.pct(f.blightKnown)} of the leaf blighted`) : null]))
      }
      if (f.status === 'growing' && (f.rime || f.frosted >= 0.05)) {
        readings.push(reading('Frost', null, [h('span', { class: 'cold-text' }, `${f.rime ? 'Froze last night' : 'Frost this week'}${f.frosted >= 0.05 ? `: ${F.pct(f.frosted)} of the leaf blackened` : ''}`)]))
      }
      if (worked) {
        readings.push(reading('Soil water', waterGauge(f), [
          h('span', { class: f.tooWet ? 'cold-text' : f.moistureLabel === 'dry' || f.moistureLabel === 'wilting' ? 'warn-text' : '' }, F.upper(f.moistureLabel)),
          f.tooWet ? ', too wet to work' : f.wilt > 0.3 ? ', plants drooping' : null]))
      }
      if (f.status === 'idle' || f.status === 'planted') {
        readings.push(reading('Soil here', null, [`${F.temp(soilT)}; seed wants about ${F.temp(10)}`]))
      }
      if (live) {
        readings.push(reading('Hilled', h('span', { class: 'pips', role: 'img', 'aria-label': `Hilled ${hillWord(f.hillPasses)}` }, [0, 1].map(k => h('span', { class: `pip${k < f.hillPasses ? ' on' : ''}` }))),
          [`${F.upper(hillWord(f.hillPasses))}${f.hillPasses < 2 ? ', of two' : ''}`]))
        readings.push(reading('Protectant', meter(f.protect, { label: 'Protectant on the leaf', cls: 'prot' }),
          [f.protect > 0.02 ? `${F.pct(f.protect)} left` : 'None', sprayed ? `, sprayed ${F.ago(s0.day - sprayed.day)}` : ', never sprayed']))
      }
      if (up || f.status === 'planted') {
        readings.push(reading('Blight', null, [
          h('span', { class: f.blightHills > 0 ? 'bad-text' : '' },
            f.blightHills > 0 ? `${F.plural(f.blightHills, 'hill')}, ${(f.blightKnown * 100).toFixed(f.blightKnown < 0.01 ? 1 : 0)}% of leaf` : f.scoutAge < 0 ? 'Not looked for' : 'None seen'),
          f.scoutAge < 0 ? ', never walked' : `, walked ${F.ago(f.scoutAge)}`]))
      }
      if (up) {
        readings.push(reading('Virus', null, [f.stunted > 0.005 ? `${F.pct(f.stunted)} of plants stunted` : 'None stunted']))
        if (f.stand < 0.995) readings.push(reading('Stand', null, [h('span', { class: f.stand < 0.92 ? 'warn-text' : '' }, `${F.pct(f.stand)} of the seed came up`)]))
      }
      const est = f.estimate
      const scaleMax = est ? Math.max(500, Math.ceil(est.hi / 100) * 100) : 500
      const days = lot ? digDays(c, lot) : null
      const dugAll = lot ? (ctx.memo.lots[lotKey(c, lot.id)] ? S.lotCwt(ctx.memo.lots[lotKey(c, lot.id)]) : S.lotCwt(lot) + lot.sold) : 0
      return [
        head,
        h('div', { class: 'panel-info', 'data-scroll': 'panel', role: 'group', 'aria-label': `What is known about ${f.name}`, tabindex: padFirst ? null : '0' },
          stageLine,
          facts,
          readings.length ? h('div', { class: 'readings' }, readings) : null,
          est && f.status !== 'digging' ? h('div', { class: 'estimate' },
            h('div', { class: 'est-head' }, h('span', { class: 'label' }, 'Yield estimate'), h('span', { class: 'sub' }, est.digs ? `${F.plural(est.digs, 'test dig')}` : 'by eye, no test digs')),
            estimateBar(est, scaleMax),
            h('p', { class: 'est-text' }, h('strong', { class: 'num' }, F.perAreaSpan(est.lo, est.hi)),
              h('span', { class: 'sub' }, ` · ${F.massSpan(est.lo * S.FIELD_ACRES, est.hi * S.FIELD_ACRES)} for the field`)),
            f.tubers
              ? h('p', { class: 'sub est-size' }, `Tuber size: ${F.num(f.tubers.perHill, 0)} to a hill in the test ${f.tubers.digs === 1 ? 'dig' : 'digs'}. The yield estimate shared among that many comes to ${F.gramsSpan(f.tubers.lo, f.tubers.hi)} a tuber on average; one hill can run well above or below it. US No. 1 starts at ${F.grams(S.SIZE_A)}; over ${F.grams(S.SIZE_CHEF)} is large, which sells at ${largeRule(app.world, c, c.plans[i].variety)}.`)
              : h('p', { class: 'sub est-size' }, 'Tuber size is unknown until a test dig.'),
            sample ? h('button', {
              class: 'btn small', type: 'button', testid: 'sample-again',
              onclick: () => ctx.dialogs.open(showSample(ctx, sample, ctx.memo.sampleBefore[`${c.seed}:${c.year}:${i}:${sample.day}`] ?? null, true)),
            }, `See the test dig of ${F.date(c.year, sample.day)}`) : null) : (f.status === 'growing' ? h('p', { class: 'sub est-none' }, 'No estimate until the tubers set.') : null),
          f.deadDays >= 0 && f.status === 'dead' ? h('div', { class: 'skin' },
            h('div', { class: 'est-head' }, h('span', { class: 'label' }, 'Skin set'), h('span', { class: 'sub' }, `vines dead ${F.plural(f.deadDays, 'day')}`)),
            meter(f.skin, { label: 'Skin set', cls: 'skin-fill' }),
            h('p', { class: 'sub' }, f.skin >= 1 ? 'Skins are set: the crop will dig clean and keep.' : `${F.pct(f.skin)} set. About ${F.plural(Math.ceil((1 - f.skin) * S.SKIN_DAYS), 'day')} more before the skins are tough.`)) : null,
          f.status === 'digging' ? h('p', { class: 'lot-box' }, `Being dug: ${digJob ? F.pct(digJob.done / digJob.need) : 'part'} of the rows lifted. The weigh-in comes when the last row is out.`) : null,
          f.status === 'lost' ? h('p', { class: 'lot-box' }, 'This crop is lost.') : null,
          lot && days && f.status === 'dug' ? h('div', { class: 'lot-box' },
            h('p', null, h('strong', null, `Dug ${F.date(c.year, days.start)}${days.end > days.start ? ` to ${F.date(c.year, days.end)}` : ''}: `), `${F.mass(dugAll)} to sell, ${F.mass(culledAtDig(lot))} culled.`),
            h('p', { class: 'sub' }, lot.open
              ? (lot.sold > 0 ? `${F.mass(lot.sold)} sold for ${F.money(lot.revenue)}; ${F.mass(S.lotCwt(lot))} is in the cellar, worth ${F.money(value)} today.` : `It is in the cellar, worth ${F.money(value)} today.`)
              : lot.sold > 0 ? `Sold for ${F.money(lot.revenue)}.` : 'Nothing left to sell.'),
            h('div', { class: 'row-wrap' },
              h('button', { class: 'btn small', type: 'button', testid: `weighin-${lot.id}`, onclick: () => ctx.dialogs.open(showWeighIn(ctx, lot.id)) }, 'See the weigh-in'),
              lot.open ? h('button', { class: 'btn small', type: 'button', testid: `field-sell-${lot.id}`, onclick: () => ctx.run({ t: 'sell', lot: lot.id, frac: 1 }) }, `Sell now, ${F.money(value)}`) : null)) : null),
        worked ? h('div', { class: 'pad-wrap', onpointerleave: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse') { locked = false; show(null) } } },
          h('div', { class: 'pad-title' },
            h('h3', null, 'Work for the farmer'),
            h('span', { class: 'sub' }, ctx.touch() ? 'tap a job for what it does' : 'point at a job for what it does')),
          jobPad(c, i, acts),
          jobDetail(c, i, acts, allOk),
          jobSaid(c, i, acts)) : null,
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
        h('span', { class: 'sub' }, s0.jobs.length ? `${F.plural(s0.jobs.length, 'job')}, about ${F.days(total)} of work` : '')),
      s0.worked.length ? h('p', { class: 'sub worked', title: 'What the farmer did on the last day worked' }, 'Last day worked: ', F.list(s0.worked.filter((w, k, a) => a.findIndex(x => x.kind === w.kind && x.field === w.field) === k).map(w => `${S.JOB_LABEL[w.kind].toLowerCase()} ${S.FIELD_NAMES[w.field]}`)), '.') : null,
      s0.jobs.length === 0
        ? h('p', { class: 'empty' }, s0.frozen ? 'The ground has frozen. The season is over.' : 'Nothing on the list, so the farmer is idle. Choose a field and give them a job.')
        : h('ol', { class: 'jobs', 'data-scroll': 'jobs', tabindex: '0', 'aria-label': 'Jobs, in the order the farmer takes them' }, s0.jobs.map((j, k) => {
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
    const leaf = s0.fields.some(f => f.status === 'growing')
    const toCome = s0.fields.some(f => f.status === 'idle' || f.status === 'planted')
    const model = { d: s0.day, sv: s0.sv, w: s0.watchDay, u: app.settings.units, leaf, toCome }
    patch(weather, JSON.stringify(model), () => {
      const d = t.day
      const skyWord: Record<string, string> = { clear: 'Clear', cloud: 'Some cloud', overcast: 'Overcast', rain: 'Rain', storm: 'Heavy rain', fog: 'Fog and damp', snow: 'Snow' }
      const blightWord = ['none', 'some', 'high', 'severe']
      const range = (x: number, sd: number) => `${F.degrees(x - sd)}–${F.degrees(x + sd)}`
      // A forecast amount is a guess: it is shown rounded and labelled as about.
      const about = (mm: number) => mm <= 0 ? '0' : F.metric() ? `${Math.round(mm)}` : mm / 25.4 < 0.05 ? '<0.1' : F.num(mm / 25.4, 1)
      const on = s0.watchDay >= 0
      const watchBox = s0.day < svStart
        ? h('p', { class: 'sub' }, `Severity values start counting on ${F.date(year, svStart)}.`)
        : h('div', null,
          on ? h('p', { class: 'watch-on' }, h('strong', null, `Watch on since ${F.date(year, s0.watchDay)}`), ` · ${s0.sv} severity values so far`)
            : h('div', { class: 'watch-meter' },
              meter(Math.min(1, s0.sv / S.SV_THRESHOLD), { label: 'Blight severity values toward the watch', cls: 'warn-fill', text: `${s0.sv} of ${S.SV_THRESHOLD}` }),
              h('span', { class: 'num watch-count' }, `${s0.sv} / ${S.SV_THRESHOLD}`)),
          h('p', { class: on && leaf ? 'bad-text watch-text' : 'sub' }, !on
            ? `${S.SV_THRESHOLD - s0.sv} more and the watch goes on.${t.severity > 0 ? ` Today's weather adds ${t.severity}.` : ''}`
            : leaf ? 'Spores can land on any day of blight weather; keep protectant on the leaf.'
              : toCome ? 'Nothing is up yet, so there is nothing to protect. It starts to matter once there is leaf.'
                : 'No green vines are left to protect.'))
      return [
        h('div', { class: 'card-head' }, h('h2', { id: 'weather-h' }, 'Weather'), h('span', { class: 'sub' }, 'Caribou station')),
        h('div', { class: 'today' },
          icon(t.sky, 'ic sky'),
          h('div', null,
            h('p', { class: 'today-sky' }, skyWord[t.sky] ?? t.sky),
            h('p', { class: 'num' }, `High ${F.temp(d.tmax)} · low ${F.temp(d.tmin)}`),
            h('p', { class: 'num sub' }, `Rain ${F.rain(d.prcp)} · soil ${F.temp(t.soilT)}`))),
        h('table', { class: 'forecast' },
          h('caption', null, `Next five days (${F.tempUnit()}, rain in ${F.metric() ? 'mm' : 'inches'})`),
          h('thead', null, h('tr', null, h('td'), fc.map(x => h('th', { scope: 'col' }, h('span', { class: 'fc-wd' }, F.weekday(year, x.day, true)), h('span', { class: 'fc-dom' }, String(F.dayOfMonth(year, x.day))))))),
          h('tbody', null,
            h('tr', null, h('th', { scope: 'row' }, 'High'), fc.map(x => h('td', { class: 'num' }, range(x.hi, x.spread)))),
            h('tr', null, h('th', { scope: 'row' }, 'Low'), fc.map(x => h('td', { class: 'num' }, range(x.lo, x.spread)))),
            h('tr', null, h('th', { scope: 'row' }, 'Rain'), fc.map(x => h('td', { class: `num${x.rainChance >= 60 ? ' cold-text' : ''}` }, `${x.rainChance}%`))),
            h('tr', null, h('th', { scope: 'row' }, 'About'), fc.map(x => h('td', { class: 'num sub' }, about(x.rainMm)))),
            h('tr', null, h('th', { scope: 'row' }, 'Blight'), fc.map(x => h('td', { class: `risk risk-${x.blight}` }, blightWord[x.blight]))),
            h('tr', null, h('th', { scope: 'row' }, 'Frost'), fc.map(x => h('td', { class: `num${x.frostChance >= 30 ? ' cold-text strong' : x.frostChance > 0 ? '' : ' sub'}` }, `${x.frostChance}%`))))),
        h('div', { class: 'watch' }, h('h3', { class: 'sub-title' }, 'Blight watch'), watchBox),
      ]
    })
  }

  // ------------------------------------------------------------ coach

  // After a tap the list holds still for a moment, with the item marked done, so the next tap lands where it was aimed.
  let hold: { day: number; at: number; items: Group[] } | null = null

  function doAdvice(g: Group, items: Group[], day: number): void {
    if (g.act === 'sell') { ctx.run({ t: 'sell', lot: g.lot, frac: 1 }); return }
    if (g.act === 'close') { ctx.run({ t: 'endSeason' }); return }
    if (g.act === 'wait') return
    hold = { day, at: performance.now(), items: hold ? hold.items : items }
    setTimeout(() => ctx.dirty(), 2600)
    const fails: string[] = []
    for (const fi of g.fields) {
      const r = app.do({ t: 'job', kind: g.act, field: fi })
      if (!r.ok) fails.push(`${S.FIELD_NAMES[fi]}: ${r.err}`)
    }
    if (fails.length) ctx.toast(fails.join(' '), 'warn')
  }

  // Why the clock is not running, and what to do about it.
  function clockNote(c: S.Campaign, actionable: boolean): HTMLElement | null {
    if (S.seasonDone(c) || app.speed !== 0) return null
    const go = ctx.touch() ? 'tap a speed button' : 'press Space or a speed button'
    const self = app.settings.pauseOnAlerts ? '' : ' It will not stop itself: that is switched off in the menu.'
    const next = c.season!.jobs.length
      ? `${F.upper(go)} to let the days run.${app.settings.pauseOnAlerts ? ' The clock stops itself when something needs you.' : self}`
      : actionable ? `Queue some work, then ${go} to let the days run.${self}`
        : `Nothing can be queued yet: ${go} and let the days run.${app.settings.pauseOnAlerts ? ' The clock stops itself when the coach has something for you.' : self}`
    return h('p', { class: 'clock-note', testid: 'clock-note' }, icon('pause'),
      h('span', null, app.pauseReason ? h('strong', null, `The clock stopped itself: ${F.localize(app.pauseReason)} `) : 'The clock is stopped. ', next))
  }

  function updateCoach(c: S.Campaign): void {
    const s0 = c.season!
    const advice = S.advise(app.world, c)
    const actionable = advice.some(a => a.act !== 'wait')
    if (!app.settings.hints) {
      patch(coach, JSON.stringify(['off', app.speed, app.pauseReason, s0.jobs.length, actionable, ctx.touch(), app.settings.pauseOnAlerts, S.seasonDone(c)]), () => [
        h('div', { class: 'card-head' }, h('h2', { id: 'coach-h' }, 'Coach')),
        h('p', { class: 'sub' }, 'The coach is off. Turn it on in the menu.'),
        clockNote(c, actionable),
      ])
      return
    }
    const cur = groupAdvice(advice).slice(0, 3)
    if (hold && (hold.day !== s0.day || performance.now() - hold.at > 2500)) hold = null
    const items = hold ? hold.items.map(g => ({ g, done: !cur.some(x => groupKey(x) === groupKey(g)) })) : cur.map(g => ({ g, done: false }))
    const done = S.seasonDone(c)
    const model = { g: items, sp: app.speed, done, q: s0.jobs.length, u: app.settings.units, why: app.pauseReason, t: ctx.touch(), ap: app.settings.pauseOnAlerts, actionable }
    let first = true
    patch(coach, JSON.stringify(model), () => [
      h('div', { class: 'card-head' }, h('h2', { id: 'coach-h' }, 'Coach'), h('span', { class: 'sub' }, 'what a careful grower would do')),
      items.length === 0
        ? h('p', { class: 'empty' }, 'Nothing pressing. Let the days run, and walk each field about once a week.')
        : h('ol', { class: 'advice' }, items.map(({ g, done: taken }) => {
          const n = g.fields.length
          const label = taken ? 'On the work list' : g.act === 'sell' ? 'Sell now' : g.act === 'close' ? 'Close out the season' : n > 1 ? `Add ${F.allOf(n)} to the list` : 'Add to the work list'
          let testid: string | undefined
          if (g.act !== 'wait' && !taken) { testid = first ? 'advice-do' : undefined; first = false }
          return h('li', { class: `advice-item${g.urgent ? ' urgent' : ''}${g.act === 'wait' ? ' wait' : ''}${taken ? ' taken' : ''}` },
            h('p', { class: 'advice-text' }, g.urgent && !taken ? h('span', { class: 'tag' }, 'Now') : null, F.localize(g.text)),
            h('p', { class: 'advice-why' }, F.localize(g.why)),
            g.act !== 'wait' ? h('button', {
              class: `btn small${!taken && (g.urgent || g.act === 'close') ? ' primary' : ''}`, type: 'button', testid, k: `adv-${groupKey(g)}`, disabled: taken,
              onclick: () => doAdvice(g, items.map(x => x.g), s0.day),
            }, taken ? icon('check') : null, label) : null)
        })),
      clockNote(c, actionable),
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

  // ------------------------------------------------------------ the tabbed panel

  function updateSheet(): void {
    if (!tabs || !body || !sheet) return
    const avail = TABS.filter(([k]) => k !== 'coach' || app.settings.hints)
    if (!avail.some(([k]) => k === ctx.sheet.tab)) ctx.sheet.tab = 'field'
    if (layout !== 'phone') ctx.sheet.open = true
    const c = app.campaign!
    // The coach tab carries a mark while the clock is stopped for something it has to say.
    const call = app.speed === 0 && !!app.pauseReason && ctx.sheet.tab !== 'coach'
    patch(tabs, JSON.stringify([ctx.sheet.tab, ctx.sheet.open, avail.length, c.season!.jobs.length, call]), () => [
      avail.map(([k, label]) => h('button', {
        class: 'tab', type: 'button', 'aria-pressed': String(ctx.sheet.tab === k && ctx.sheet.open), testid: `tab-${k}`,
        onclick: () => { ctx.sheet.tab = k; ctx.sheet.open = true; ctx.dirty() },
      }, label,
      k === 'work' && c.season!.jobs.length ? h('span', { class: 'count' }, String(c.season!.jobs.length)) : null,
      k === 'coach' && call ? h('span', { class: 'count call' }, h('span', { class: 'visually-hidden' }, 'has something for you'), '!') : null)),
      layout === 'phone' ? h('button', {
        class: 'icon-btn sheet-toggle', type: 'button', testid: 'sheet-toggle', 'aria-expanded': String(ctx.sheet.open), 'aria-controls': 'sheet-body',
        'aria-label': ctx.sheet.open ? 'Fold the panels down to see more of the farm' : 'Open the panels',
        onclick: () => { ctx.sheet.open = !ctx.sheet.open; ctx.dirty() },
      }, icon(ctx.sheet.open ? 'down' : 'up')) : null,
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
      // Where the panel is short the jobs come before the readings; where it is tall they are pinned under them.
      el.classList.toggle('pad-first', layout === 'phone' || innerHeight < 620)
      top.update()
      updateNotes(c)
      updateChips(c)
      updatePanel(c)
      // The job note flies out beside the panel, over the land, level with the pad.
      const wrap = panel.querySelector('.pad-wrap')
      if (wrap) {
        const side = (sheet ?? panel).getBoundingClientRect()
        panel.style.setProperty('--fly-right', `${Math.round(innerWidth - side.left + 8)}px`)
        panel.style.setProperty('--fly-top', `${Math.round(wrap.getBoundingClientRect().top)}px`)
        panel.style.setProperty('--fly-room', `${Math.round(side.left - 24)}px`)
      }
      updateWork(c)
      updateWeather(c)
      updateCoach(c)
      updateDiary(c)
      updateSheet()
    },
    insets() {
      const t = top.el.getBoundingClientRect().bottom
      if (sheet) {
        const r = sheet.getBoundingClientRect()
        return layout === 'phone' ? [t, 0, innerHeight - r.top, 0] : [t, innerWidth - r.left, 0, 0]
      }
      return [t, innerWidth - rightRail!.getBoundingClientRect().left, innerHeight - chips.getBoundingClientRect().top, leftRail!.getBoundingClientRect().right]
    },
    frame: placeLabels,
    dispose() {
      labelsLayer.replaceChildren()
      clearTimeout(hintTimer)
      canvas?.removeEventListener('pointerdown', onDown)
      canvas?.removeEventListener('pointermove', onMove)
      canvas?.removeEventListener('pointerup', onUp)
      canvas?.removeEventListener('wheel', dropHint)
      document.removeEventListener('pointerdown', dropShown, true)
    },
  }
}
