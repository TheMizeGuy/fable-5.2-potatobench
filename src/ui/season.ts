// The season (design/season.html): the land, with a stencilled tag on each field and a face pin on each person; the
// two boards at the top; the time book of people at the foot with the alerts beside it; and, for whatever is
// selected, a command bar docked at the edge of the land with the selection drawn on the land itself.
import type { Goal } from '../game/goals.ts'
import { nextGoal } from '../game/goals.ts'
import * as S from '../sim/index.ts'
import { yardCard, YARD_TITLE } from './build.ts'
import { commandCard } from './card.ts'
import { EXIT_MS, patch, unname, type Ctx, type Screen } from './core.ts'
import { openCrew, unitBar } from './crew.ts'
import { h, s } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { incidentCard } from './incident.ts'
import { ticket, trayPaper } from './dig.ts'
import { digitFor, fieldForDigit, isTract } from './map.ts'
import { personCard, workGrid } from './people.ts'
import { pins } from './pins.ts'
import { plates, type PlateModel } from './plates.ts'
import { hint as hintText, isJob, isStale, jobText, JOB_VERB, KEY_JOB, stageGlyph } from './rules.ts'
import type { Ink } from './system/parts.ts'
import { clock, topBar } from './top.ts'
import './season.css'

const HINTS_KEY = 'the-county/hints'
const HINT_MS = 45000

function hintsSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HINTS_KEY) ?? '[]') as string[]) } catch { return new Set() }
}

// Where a goal is reached: the field that can take the step now, a tract, the yard, the hiring hall, or a person.
type Target = { field: number } | { yard: number } | { hire: true } | { unit: number } | null

const GOAL_ACT: Record<string, S.JobKind> = { plant: 'plant', walk: 'scout', hill: 'hill', spray: 'spray', sample: 'sample', kill: 'kill', dig: 'dig' }
const COVER_GLYPH: Record<S.Cover, string> = { woods: 'woods', brush: 'brush', stumps: 'stump', open: 'rocks' }

// The people a decision has stopped: whoever was on the tractor that broke down.
export function stoppedBy(c: S.Campaign | null): Set<number> {
  return new Set((c?.incidents ?? []).filter(i => i.kind === 'breakdown' && i.unit !== undefined).map(i => i.unit!))
}

// A need's stamp is inked by kind: blight and loss red, water blue, any other work due in ink.
function inkFor(act: string, urgent: boolean, f: S.FieldInfo): Ink {
  if (act === 'water') return 'blue'
  if (act === 'rogue' || (urgent && (f.blightHills > 0 || act === 'kill' || act === 'dig'))) return 'red'
  return 'ink'
}

// The four corners of a field on the screen to a CSS matrix that lays a 1000 px square on them, so the selection is
// drawn on the land and follows the camera by its transform alone (a projective map, Heckbert's unit square to quad).
const SQ = 1000
function quadMatrix(p: { x: number; y: number }[]): string {
  const [p0, p1, p2, p3] = p
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y
  let a: number, b: number, c: number, d: number, g = 0, hh = 0
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) {
    a = p1.x - p0.x; b = p1.y - p0.y; c = p3.x - p0.x; d = p3.y - p0.y
  } else {
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y
    const den = dx1 * dy2 - dx2 * dy1
    if (Math.abs(den) < 1e-9) return ''
    g = (sx * dy2 - dx2 * sy) / den
    hh = (dx1 * sy - sx * dy1) / den
    a = p1.x - p0.x + g * p1.x; b = p1.y - p0.y + g * p1.y
    c = p3.x - p0.x + hh * p3.x; d = p3.y - p0.y + hh * p3.y
  }
  const k = 1 / SQ
  if (![a, b, c, d, g, hh].every(Number.isFinite)) return ''
  return `matrix3d(${[a * k, b * k, 0, g * k, c * k, d * k, 0, hh * k, 0, 0, 1, 0, p0.x, p0.y, 0, 1].map(v => +v.toFixed(7)).join(',')})`
}

export function seasonScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void; onAlmanac: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, { ...o, show: g => show(target(g)), canShow: g => !!target(g) })
  const crew = h('div', { class: 'crew sys' })
  const clockSlot = h('div', { class: 'clock-slot dock sys' })
  const notesSlot = h('div', { class: 'notes-slot sys' })
  const trayHost = h('div', { class: 'tray-host sys' })
  const paused = h('p', { class: 'paused sys', testid: 'paused', hidden: true })
  const veil = h('div', { class: 'veil sys', hidden: true })
  let tray: { el: HTMLElement; field: number; day: number } | null = null

  const openTicket = (lot: number) => { const spec = ticket(ctx, lot, { fresh: false }); if (spec) ctx.papers.open(spec) }
  const card = commandCard(ctx, { onTray: field => showTray(field), onTicket: openTicket })
  const person = personCard(ctx)
  const yard = yardCard(ctx)
  const grid = workGrid(ctx)
  const incident = incidentCard(ctx)
  const el = h('main', { class: 'season-screen' }, veil, top.el, paused, card.el, yard.el, person.el, grid.el, trayHost,
    h('div', { class: 'foot' }, h('div', { class: 'foot-book' }, crew, clockSlot), notesSlot), incident.el)

  // The selection drawn on the land: a dashed line round each selected field laid on its corners, a registration mark
  // at each corner. Under the tags and pins, over the land.
  const selLayer = h('div', { class: 'sel-layer', 'aria-hidden': 'true' })
  plateLayer.prepend(selLayer)
  const selDrawn = new Map<number, { quad: SVGElement; marks: HTMLElement[]; unit: number }>()

  function drawSelection(): void {
    const want = new Set(app.selection)
    for (const [i, d] of selDrawn) if (!want.has(i)) { d.quad.remove(); for (const m of d.marks) m.remove(); selDrawn.delete(i) }
    const ins = app.insets
    for (const i of want) {
      let d = selDrawn.get(i)
      if (!d) {
        const quad = s('svg', { class: 'select sel-quad sys', width: SQ, height: SQ, viewBox: `0 0 ${SQ} ${SQ}` },
          s('rect', { class: 'under', x: 0, y: 0, width: SQ, height: SQ }), s('rect', { class: 'line', x: 0, y: 0, width: SQ, height: SQ }))
        const marks = [0, 1, 2, 3].map(() => h('span', { class: 'reg-at' }, s('svg', { class: 'select sel-mark sys', width: 30, height: 30, viewBox: '-15 -15 30 30' }, s('g', { class: 'reg' },
          s('path', { class: 'u', d: 'M-13 0h26M0 -13v26' }), s('circle', { class: 'u', r: 7 }), s('circle', { r: 7 }), s('path', { d: 'M-13 0h26M0 -13v26' })))))
        selLayer.append(quad, ...marks)
        d = { quad, marks, unit: 0 }
        selDrawn.set(i, d)
      }
      const p = ctx.view.fieldCorners(i)
      // Only a field wholly in front of the camera is outlined: a corner behind it would fold the outline over.
      const ok = p.length === 4 && p.every(q => q.visible && Number.isFinite(q.x) && Number.isFinite(q.y) && Math.abs(q.x) < innerWidth * 4 && Math.abs(q.y) < innerHeight * 4)
      const m3 = ok ? quadMatrix(p) : ''
      d.quad.style.display = m3 ? '' : 'none'
      if (!m3) { for (const m of d.marks) m.style.display = 'none'; continue }
      d.quad.style.transform = m3
      // The line keeps its printed weight whatever the field's size on the screen.
      const across = Math.max(30, Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y), Math.hypot(p[3].x - p[0].x, p[3].y - p[0].y))
      const unit = SQ / across
      if (Math.abs(unit - d.unit) > d.unit * 0.12) { d.unit = unit; d.quad.style.setProperty('--u', unit.toFixed(2)) }
      p.forEach((q, k) => {
        const m = d!.marks[k]
        const seen = q.x > ins.left - 8 && q.x < innerWidth - ins.right + 8 && q.y > ins.top - 8 && q.y < innerHeight - ins.bottom + 8
        m.style.display = seen ? '' : 'none'
        if (seen) m.style.transform = `translate3d(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px, 0)`
      })
    }
  }

  // ------------------------------------------------------------ the goal, and where it is reached

  function target(g: Goal | null): Target {
    const c = app.campaign
    if (!c || !g || c.phase !== 'season' || !c.season) return null
    const s0 = c.season
    const act = GOAL_ACT[g.id]
    if (act) {
      const i = app.needs().findIndex(n => n.need?.act === act)
      return i >= 0 ? { field: i } : null
    }
    const tract = (ok: (t: S.TractInfo) => boolean) => { const t = S.tractInfo(c).find(x => x.tenure !== 'none' && ok(x)); return t ? { field: t.field } : null }
    switch (g.id) {
      case 'haul': { const i = s0.fields.findIndex(f => f.inField >= 0.5); return i >= 0 ? { field: i } : null }
      case 'sell': { const lot = c.lots.find(l => l.open && s0.fields[l.field]?.weighed); return lot ? { field: lot.field } : null }
      case 'hire': return S.hireRoom(c) ? null : { hire: true }
      case 'fell': return tract(t => t.stage === 'fell')
      case 'stump': return tract(t => t.stage === 'stump')
      case 'rocks': return tract(t => t.stage === 'rocks')
      case 'build': return { yard: S.HOME_YARD }
      case 'foreman': { const u = c.crew.find(x => x.kind !== 'farmer'); return u ? { unit: u.id } : null }
    }
    return null
  }

  function show(t: Target): boolean {
    if (!t) return false
    if ('field' in t) { app.select(t.field); app.focus(t.field) }
    else if ('yard' in t) app.selectYard(t.yard)
    else if ('hire' in t) openCrew(ctx)
    else { app.select(-1); app.selectUnit(t.unit) }
    return true
  }

  // ------------------------------------------------------------ the test-dig tray

  function closeTray(): void {
    if (!tray) return
    const old = tray.el
    tray = null
    if (ctx.reduced()) old.remove()
    else { old.classList.add('out'); unname(old); setTimeout(() => old.remove(), EXIT_MS) }
    ctx.dirty()
  }

  function openTray(e: S.GameEvent, staged: boolean): void {
    const c = app.campaign!
    const before = ctx.memo.sampleBefore[`${c.seed}:${c.year}:${e.field}:${e.day}`] ?? null
    tray?.el.remove()
    const paper = trayPaper(ctx, e, before, { staged, onClose: closeTray })
    trayHost.replaceChildren(paper)
    tray = { el: paper, field: e.field, day: e.day }
    ctx.dirty()
  }

  function showTray(field: number): void {
    const c = app.campaign
    const e = [...(c?.season?.log ?? [])].reverse().find(x => x.type === 'sample' && x.field === field)
    if (e) openTray(e, false)
  }

  let frostWarned = -1
  const off = app.on(ev => {
    if (ev.type === 'yard' || ev.type === 'unit' || ev.type === 'select') ctx.dirty()
    else if (ev.type === 'events') {
      for (const e of ev.events) if (e.type === 'sample') { const staged = app.speed < 3; void ctx.view.whenShown('sample', e.field).then(() => { if (app.screen === 'season') openTray(e, staged) }) }
      if (ev.dayPassed) warnFrost()
    }
  })

  // A frost forecast over barrels still in the field is worth saying, once a day, where the player is looking.
  function warnFrost(): void {
    const c = app.campaign
    const s0 = c?.season
    if (!c || !s0 || frostWarned === s0.day) return
    const worst = S.haulInfo(app.world, c).filter(x => x.frostChance >= 40).sort((a, b) => b.cwt - a.cwt)[0]
    if (!worst) return
    frostWarned = s0.day
    ctx.notes.push({ level: 'warn', glyph: 'frost', text: `${worst.name}: frost tonight, ${F.mass(worst.cwt)} in barrels`, full: `A ${worst.frostChance}% chance of frost tonight, with ${F.mass(worst.cwt)} still in barrels in ${worst.name}. A hard frost takes a fifth of it.`, field: worst.field, day: s0.day })
  }

  // ------------------------------------------------------------ tags, stamps and the tips

  const seen = hintsSeen()
  // first: nothing has been taught yet, so this tip also says how an order is given.
  let hint: { kind: S.JobKind; field: number; at: number; first: boolean } | null = null

  function updateHint(): void {
    const needs = app.needs()
    if (hint && (needs[hint.field]?.need?.act !== hint.kind || performance.now() - hint.at > HINT_MS || !app.settings.hints)) hint = null
    if (!hint && app.settings.hints) {
      for (let i = 0; i < needs.length; i++) {
        const act = needs[i].need?.act
        if (!isJob(act) || seen.has(act)) continue
        hint = { kind: act, field: i, at: performance.now(), first: seen.size === 0 }
        seen.add(act)
        try { localStorage.setItem(HINTS_KEY, JSON.stringify([...seen])) } catch { /* storage blocked: the tip may show again */ }
        ctx.announce(hintText(act))
        setTimeout(() => ctx.dirty(), HINT_MS + 100)
        break
      }
    }
    // The tip is a slip with the alerts, wearing its stamp's cut, so it never covers a field.
    if (hint) {
      const kind = hint.kind
      const how = hint.first ? ` ${ctx.touch() ? 'Tap' : 'Click'} the ringed stamp.` : ''
      ctx.notes.pin({ key: `tip-${kind}`, glyph: kind, text: `${hintText(kind)}${how}`, onClose: () => { hint = null; ctx.dirty() } })
    } else ctx.notes.unpin()
  }

  // Woods and brush to clear come forward once the farm has a year behind it, or as soon as the player starts on them.
  function tractsShown(c: S.Campaign): boolean {
    return c.history.length > 0 || S.TRACTS.some(t => c.fields[t].cover !== S.PARCELS[t].cover || c.fields[t].felled > 0 || !!c.fields[t].works)
  }

  // The yard comes forward when the farm could pay for a building, or the goals reach one, or something is built.
  function yardShown(c: S.Campaign): boolean {
    return c.buildings.length > 0 || app.yard !== 0 || nextGoal(c)?.id === 'build' || S.buildingInfo(c).some(b => b.ok)
  }

  let goalField = -1
  let frostAt: Record<number, number> = {}

  function plateModel(i: number): PlateModel | null {
    const c = app.campaign!
    const s0 = c.season!
    if (!S.held(c, i)) return null
    const f = S.fieldInfo(c, i)
    const queued = s0.jobs.filter(j => j.field === i)
    const tract = isTract(i) && (f.cover !== 'open' || f.status === 'off')
    if (tract && !tractsShown(c) && !app.selection.includes(i) && !queued.length) return null
    const need = app.needs()[i]?.need ?? null
    const live = f.status === 'growing' || f.status === 'planted'
    const marks: PlateModel['marks'] = []
    const said: string[] = []
    if (live && (f.moistureLabel === 'dry' || f.moistureLabel === 'wilting')) { marks.push({ glyph: 'dry', cls: f.moistureLabel === 'wilting' ? 'bad' : 'warn' }); said.push(`soil ${f.moistureLabel}`) }
    if (f.blightHills > 0 && (live || f.status === 'dead')) {
      marks.push({ glyph: isStale(f) ? 'blight-old' : 'blight', cls: 'bad' })
      said.push(`blight seen on ${F.plural(f.blightHills, 'hill')}${f.scoutAge >= 0 ? `, walked ${F.ago(f.scoutAge)}` : ''}`)
    }
    const anyBlight = s0.fields.some((_, k) => S.fieldInfo(c, k).blightHills > 0)
    if (f.status === 'growing' && f.protect < 0.35 && (s0.watchDay >= 0 || anyBlight)) { marks.push({ glyph: 'bare', cls: 'warn' }); said.push('leaves unprotected') }
    let sub: string | undefined
    if (f.inField >= 0.5) {
      const frost = frostAt[i] ?? 0
      sub = `${F.massValue(f.inField) >= 1000 ? `${F.num(F.massValue(f.inField) / 1000, 1)}k` : F.num(F.massValue(f.inField))} in barrels`
      said.push(`${F.mass(f.inField)} in barrels${frost >= 30 ? `, ${frost}% frost tonight` : ''}`)
    }
    if (f.works) { marks.push({ glyph: f.works.kind, cls: '' }); said.push(f.works.kind === 'stump' ? 'stumps being pulled' : 'tile going in') }
    if (tract && f.cover !== 'open' && c.fields[i].felled > 0 && f.clearing) said.push(`${F.pct(f.clearing.felled)} felled`)
    const waits = S.jobWaits(app.world, c)
    const head = s0.jobs.find(j => !waits[j.id])
    const queue = queued.map(j => ({ glyph: j.kind as string, active: j === head }))
    if (queue.length) said.push(`on the list: ${F.list(queued.map(j => JOB_VERB[j.kind].toLowerCase()))}`)
    const lot = f.lot >= 0 ? c.lots.find(l => l.id === f.lot) : undefined
    const badge = need && isJob(need.act)
      ? { glyph: need.act as string, label: `${F.localize(need.text)} ${F.localize(need.why)}`, urgent: need.urgent, ink: inkFor(need.act, need.urgent, f) }
      : need && need.act === 'sell' && lot ? { glyph: 'ticket', label: `${F.localize(need.text)} ${F.localize(need.why)}`, urgent: need.urgent, ink: 'ink' as Ink } : null
    const key = digitFor(c, i)
    const what = tract ? (f.cover === 'open' ? 'new ground, ready next spring' : f.coverWord) : f.status === 'rest' ? 'resting in oats and clover' : `${f.variety}, ${f.stage.toLowerCase()}`
    return {
      name: f.name,
      glyph: tract ? COVER_GLYPH[f.cover] : stageGlyph(f),
      sub, marks, queue, badge, key, cls: tract ? 'tract' : undefined,
      said: `${key ? `key ${key}` : f.block === 'home' ? 'the home farm' : 'beyond the home farm'}: ${what}${said.length ? `; ${said.join('; ')}` : ''}${badge ? `. Needs: ${F.localize(need!.text)}` : '.'}`,
      taught: !!badge && ((!!hint && need?.act === hint.kind) || goalField === i),
    }
  }

  function onBadge(i: number): void {
    const c = app.campaign
    if (!c) return
    const need = app.needs()[i]?.need
    if (need && need.act === 'sell') { openTicket(need.lot); return }
    const r = app.smartOrder(i)
    if (r.ok) ctx.announce(`${need ? F.localize(need.text) : 'Order given.'} On the list.`)
    else ctx.say(`${S.FIELD_NAMES[i]}: ${r.err}`, 'info')
  }

  // What floats over the land: nothing on the land is left under it.
  const floating = () => [card.el, yard.el, person.el, grid.el, incident.el, trayHost.firstElementChild as HTMLElement | null]
  // Read once a frame, before anything on the land is moved, so the frame never forces a second layout.
  let coverCache: DOMRect[] | null = null
  const covers = (): DOMRect[] => coverCache ?? floating().filter((x): x is HTMLElement => !!x && !x.hidden && x.offsetParent !== null).map(x => x.getBoundingClientRect())
  const P = plates(ctx, plateLayer, { model: plateModel, onBadge, covers })
  const people = pins(ctx, plateLayer, {
    tags: () => [...P.boxes(), ...yardMarks.filter(m => !m.wrap.hidden && m.at).map(m => new DOMRect(m.at!.x - m.w / 2, m.at!.y - 22, m.w, 44))], covers,
    stopped: () => stoppedBy(app.campaign),
  })

  // ------------------------------------------------------------ the yards on the land

  const yardMarks = [S.HOME_YARD, S.DUFOUR_YARD].map(y => {
    const wrap = h('div', { class: 'yard-at gone', hidden: true })
    plateLayer.append(wrap)
    return { y, wrap, w: 150, at: null as { x: number; y: number } | null }
  })

  function updateYards(c: S.Campaign, goalYard: number): void {
    const shown = yardShown(c)
    for (const m of yardMarks) {
      const on = shown && (m.y === S.HOME_YARD || S.holdsDufour(c))
      m.wrap.hidden = !on
      if (!on) continue
      const up = c.buildings.find(b => b.yard === m.y && !b.built)
      const sel = app.yard === m.y
      const name = m.y === S.HOME_YARD ? 'Home yard' : 'Dufour yard'
      patch(m.wrap, JSON.stringify([sel, up ? [up.kind, Math.round(up.done / up.need * 100)] : 0, goalYard === m.y, ctx.touch()]), () => h('button', {
        class: `yard-tag sys plate yard${sel ? ' is-sel on' : ''}${goalYard === m.y ? ' goal-ring' : ''}`, type: 'button', testid: m.y === S.HOME_YARD ? 'yard-home' : 'yard-dufour', 'aria-pressed': String(sel),
        'aria-label': `${YARD_TITLE[m.y]}${up ? `: ${S.BUILDINGS[up.kind].name.toLowerCase()} going up, ${F.pct(up.done / up.need)} built` : ''}. Build here${ctx.touch() ? '' : ' (Y)'}.`,
        onclick: () => app.selectYard(sel ? 0 : m.y),
      }, icon('yard', 'i'), name, up ? h('span', { class: 'yard-pct num' }, F.pct(up.done / up.need)) : null))
      m.w = (m.wrap.firstElementChild as HTMLElement | null)?.offsetWidth || m.w
    }
  }

  function placeYards(): void {
    const cv = covers()
    for (const m of yardMarks) {
      if (m.wrap.hidden) continue
      const a = ctx.view.yardAnchor(m.y)
      const ins = app.insets
      const ok = a.visible && Number.isFinite(a.x) && Number.isFinite(a.y) && a.y > ins.top + 40 && a.y < innerHeight - ins.bottom && a.x > ins.left + 60 && a.x < innerWidth - ins.right - 60 &&
        !cv.some(r => a.x > r.left - 80 && a.x < r.right + 80 && a.y > r.top - 20 && a.y < r.bottom + 20)
      m.wrap.classList.toggle('gone', !ok)
      m.at = ok ? { x: a.x, y: a.y } : null
      if (ok) m.wrap.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`
    }
  }

  // ------------------------------------------------------------ the bar's side: never over the thing it belongs to

  let side: 'right' | 'left' = 'right'
  function placeBar(): void {
    const layout = ctx.layout()
    const bar = !card.el.hidden ? card.el : !yard.el.hidden ? yard.el : null
    const leftTaken = grid.isOpen() || !person.el.hidden
    if (!bar || layout === 'narrow' || leftTaken) { if (side !== 'right') { side = 'right'; el.classList.remove('docked-left'); ctx.dirty() } return }
    // Where the thing selected lies on the screen.
    let box: { l: number; r: number } | null = null
    if (bar === card.el && app.selection.length) {
      const xs = app.selection.flatMap(i => ctx.view.fieldCorners(i).filter(q => q.visible && Number.isFinite(q.x)).map(q => q.x))
      if (xs.length) box = { l: Math.min(...xs), r: Math.max(...xs) }
    } else if (bar === yard.el) {
      const a = ctx.view.yardAnchor(app.yard)
      if (a.visible) box = { l: a.x - 90, r: a.x + 90 }
    }
    if (!box) return
    const w = bar.offsetWidth + 16
    const overRight = Math.max(0, box.r - (innerWidth - w)), overLeft = Math.max(0, w - box.l)
    const span = Math.max(1, box.r - box.l)
    const want = side === 'right' ? (overRight > span * 0.25 && overLeft < overRight ? 'left' : 'right') : (overLeft > span * 0.25 && overRight < overLeft ? 'right' : 'left')
    if (want !== side) { side = want; el.classList.toggle('docked-left', side === 'left'); ctx.dirty() }
  }

  // ------------------------------------------------------------ the time book and the list

  const units = unitBar(ctx, crew, {
    waiting: () => app.campaign ? incident.waiting(app.campaign) : [],
    onIncident: () => incident.open(),
    gridOpen: () => grid.isOpen(),
    onGrid: () => grid.toggle(),
    hireShown: () => { const c = app.campaign; return !!c && (c.crew.length > 1 || c.history.length > 0 || c.season!.fields.some(f => f.plantDay >= 0)) },
    goal: () => { const c = app.campaign; const g = c ? nextGoal(c) : null; return g?.id === 'hire' ? 'hire' : g?.id === 'foreman' ? 'person' : '' },
  })

  // ------------------------------------------------------------ keys

  // Tab walks the fields that need something, Shift-Tab walks back. last: on a tag, so after the end of them the
  // keyboard goes on into the boards instead of coming round again.
  function nextNeed(from: number, last: boolean, back: boolean): boolean {
    const needs = app.needs()
    const want = needs.map((n, i) => (n.need && n.need.act !== 'close' ? i : -1)).filter(i => i >= 0)
    const next = back
      ? [...want].reverse().find(i => i < from) ?? (last ? undefined : want[want.length - 1])
      : want.find(i => i > from) ?? (last ? undefined : want[0])
    if (next === undefined) return false
    app.select(next)
    app.focus(next)
    plateLayer.querySelector<HTMLElement>(`[data-k="field-${next}"]`)?.focus({ preventScroll: true })
    const n = needs[next].need!
    ctx.announce(`${S.FIELD_NAMES[next]} selected. ${F.localize(n.text)} ${F.localize(n.why)} Enter gives the order.`)
    return true
  }

  function key(e: KeyboardEvent): boolean {
    if (e.altKey || e.metaKey) return false
    const c = app.campaign
    if (!c || !c.season) return false
    const t = e.target as HTMLElement
    const plate = t.closest?.<HTMLElement>('.plate')
    const onPlate = !!plate || !!t.closest?.('.need')
    const at = plate?.dataset.testid?.startsWith('field-') ? Number(plate.dataset.testid.split('-')[1]) : -1
    // On the tag of the one selected field, Enter and Space are the game's keys: pressing the tag again would do nothing.
    const onSelected = at >= 0 && app.selection.length === 1 && app.selected === at
    const onControl = !!t.closest?.('button, input, a') && !onSelected
    const k = e.key
    if (k === 'Escape') {
      if (top.escape()) return true
      if (people.escape()) return true
      if (units.escape()) return true
      if (grid.isOpen()) { grid.toggle(false); return true }
      if (incident.putAway()) return true
      if (tray) { closeTray(); return true }
      if (app.selection.length) { app.select(-1); (document.activeElement as HTMLElement | null)?.blur?.(); return true }
      if (app.yard !== 0) { app.selectYard(0); return true }
      if (app.unit >= 0) { app.selectUnit(-1); return true }
      return false
    }
    if (k === 'Tab') {
      if (e.ctrlKey || (!!t.closest?.('button, input, a') && !onPlate)) return false
      const from = at >= 0 ? at : app.selected >= 0 ? app.selected : e.shiftKey ? S.FIELD_COUNT : -1
      return nextNeed(from, onPlate, e.shiftKey)
    }
    if (k === 'Enter' || k === ' ') {
      if (onControl || e.ctrlKey) return false
      if (k === ' ') app.togglePause()
      else card.suggested()
      return true
    }
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code)
    if (digit && !e.ctrlKey) {
      const n = Number(digit[1])
      // A telegram's replies and a yard's buildings are numbered: while one is up, its numbers are its own.
      if (incident.isUp() && n >= 1 && incident.reply(n)) return true
      if (app.yard !== 0 && n >= 1 && yard.pick(n)) return true
      const i = fieldForDigit(c, n)
      if (i >= 0) { app.select(i, e.shiftKey); if (!ctx.view.fieldAnchor(i).visible) app.focus(i) }
      return true
    }
    if (e.ctrlKey && !KEY_JOB[k.toLowerCase()]) return false
    if (k === '+' || k === '=') { if (!S.seasonDone(c)) app.setSpeed(Math.min(3, (app.speed || app.resumeSpeed) + 1) as 1 | 2 | 3); return true }
    if (k === '-' || k === '_') { if (app.speed > 1) app.setSpeed((app.speed - 1) as 1 | 2); return true }
    if (k === 'Backspace' || k === 'Delete') {
      const jobs = c.season.jobs.filter(j => j.kind !== 'haul' && j.kind !== 'build')
      const mine = app.selection.length ? jobs.filter(j => app.selection.includes(j.field)) : jobs
      const last = mine[mine.length - 1]
      if (!last) ctx.say('Nothing on the list to take off.')
      else if (ctx.run({ t: 'cancel', id: last.id }).ok) ctx.announce(`${jobText(last)}: taken off the list.`)
      return true
    }
    const low = k.toLowerCase()
    if (low === 'f' && !e.ctrlKey) { if (!S.seasonDone(c)) app.cycleSpeed(); return true }
    if (low === 'g' && !e.ctrlKey) { if (c.crew.length >= 3) grid.toggle(); else ctx.say('The work grid opens once three people are on the farm.'); return true }
    if (low === 'y' && !e.ctrlKey) {
      if (yardShown(c)) app.selectYard(app.yard === S.HOME_YARD ? 0 : S.HOME_YARD)
      else ctx.say('Building opens once the farm can pay for one.')
      return true
    }
    const kind = KEY_JOB[low]
    if (kind) { card.give(kind, e.ctrlKey || e.shiftKey); return true }
    return false
  }

  // ------------------------------------------------------------ alerts that go somewhere other than a field

  function goFor(a: { type: string; field: number; data?: S.GameEvent['data'] }): (() => void) | null {
    const c = app.campaign
    if (!c) return null
    const unit = typeof a.data?.unit === 'number' ? a.data.unit : -1
    if (a.type === 'incident' && typeof a.data?.incident === 'number') { const id = a.data.incident; return () => incident.open(id) }
    if (unit >= 0 && a.type !== 'poached' && a.type !== 'quit') return () => { if (app.campaign?.crew.some(u => u.id === unit)) { app.select(-1); app.selectUnit(unit) } }
    if (a.type === 'built' || a.type === 'building' || a.type === 'pondDry') {
      const b = typeof a.data?.building === 'number' ? c.buildings.find(x => x.id === a.data!.building) : undefined
      const y = b?.yard ?? S.HOME_YARD
      return () => app.selectYard(y)
    }
    return null
  }

  return {
    el,
    notes: notesSlot,
    key,
    goFor,
    update() {
      const c = app.campaign
      if (!c || !c.season) return
      const layout = ctx.layout()
      el.dataset.layout = layout
      const many = c.crew.length > 1
      const personUp = many && app.unit >= 0 && !app.selection.length && app.yard === 0
      const selected = app.selection.length > 0 || app.yard !== 0
      el.classList.toggle('selected', selected)
      el.classList.toggle('person-up', personUp || grid.isOpen())
      el.classList.toggle('tray-up', !!tray)
      // What the goal points at: the field it lights, the yard it rings.
      const g = nextGoal(c)
      const tgt = target(g)
      goalField = tgt && 'field' in tgt ? tgt.field : -1
      frostAt = Object.fromEntries(S.haulInfo(app.world, c).map(x => [x.field, x.frostChance]))
      top.update()
      // On a phone the clock sits by the thumb, over the time book.
      const low = layout === 'narrow' || layout === 'short'
      clockSlot.hidden = !low
      if (low) patch(clockSlot, JSON.stringify([app.speed, app.resumeSpeed, S.seasonDone(c), ctx.awaiting, ctx.touch()]), () => clock(ctx, false, o.onMenu))
      // Stopped by the player, the one obvious way on: a press goes on at the speed the clock had. Stopped for a
      // decision, the bank board's own tag says so instead.
      const stoppedFor = c.incidents.length > 0 || ctx.awaiting > 0
      const stopped = app.speed === 0 && !S.seasonDone(c)
      paused.hidden = !stopped || (stoppedFor && layout !== 'narrow')
      el.classList.toggle('is-paused', !paused.hidden)
      if (!paused.hidden) patch(paused, JSON.stringify([ctx.touch(), app.resumeSpeed]), () => h('button', { class: 'paused-go btn', type: 'button', testid: 'paused-go', onclick: () => app.togglePause() },
        icon('play', 'i'), h('span', { class: 'sr' }, 'Paused. '), `Go on at ${app.resumeSpeed || 1}×`, ctx.touch() ? null : h('span', { class: 'key' }, 'Space')))
      updateHint()
      P.update()
      updateYards(c, tgt && 'yard' in tgt ? tgt.yard : 0)
      units.update(c)
      people.update(c)
      card.update(c)
      person.update(c, personUp)
      const build = g?.id === 'build' ? (S.buildingInfo(c).filter(b => b.yard === app.yard && b.state === 'none' && b.ok).sort((a, b) => a.total - b.total)[0]?.kind ?? null) : null
      yard.update(c, build)
      if (c.crew.length < 3 && grid.isOpen()) grid.toggle(false)
      grid.update(c)
      incident.update(c)
      const up = incident.isUp()
      veil.hidden = !up
      el.classList.toggle('incident-up', up)
      ctx.notes.limit(1)
      ctx.notes.maxAge = layout === 'short' ? 9000 : 0
      ctx.notes.prune(c.season.day)
    },
    insets() {
      const layout = ctx.layout()
      // Where things rest, not where a card being laid down happens to be this frame: offsets ignore transforms.
      const box = (x: HTMLElement) => {
        let l = 0, t0 = 0
        for (let e: HTMLElement | null = x; e && e !== el; e = e.offsetParent as HTMLElement | null) { l += e.offsetLeft; t0 += e.offsetTop }
        return { left: l, top: t0, right: l + x.offsetWidth, bottom: t0 + x.offsetHeight }
      }
      const t = Math.max(top.el.getBoundingClientRect().bottom, ...[...top.el.querySelectorAll<HTMLElement>('.almanac > .mount, .bank > .mount')].map(x => x.getBoundingClientRect().bottom))
      const vis = (x: HTMLElement) => !x.hidden && x.offsetParent !== null && x.offsetHeight > 0
      // The time book, its list and the alerts at the foot; the clock with them on a phone.
      const low = [...(crew.children as HTMLCollectionOf<HTMLElement>), clockSlot, notesSlot, ...(layout === 'narrow' && tray ? [trayHost] : [])].filter(vis).map(x => box(x).top)
      const bottom = innerHeight - Math.min(...low, innerHeight) + 6
      // The bar docked at its edge; on a phone it is a sheet over the foot.
      const bar = [card.el, yard.el].find(vis)
      let right = 0, left = 0
      if (bar && layout !== 'narrow') {
        const r = box(bar)
        if (side === 'left') left = r.right + 8
        else right = innerWidth - r.left + 8
      }
      if (bar && layout === 'narrow') return [t, 0, innerHeight - box(bar).top + 6, 0]
      // A person's page and the work grid stand at the left on a desk: the land is framed beside them.
      if (layout === 'wide' || layout === 'mid') for (const x of [person.el, grid.el]) if (vis(x)) left = Math.max(left, box(x).right + 8)
      return [t, right, bottom, left]
    },
    frame: () => { coverCache = null; coverCache = covers(); placeBar(); P.frame(); placeYards(); people.frame(); drawSelection(); coverCache = null },
    dispose() {
      off()
      P.dispose()
      people.dispose()
      units.dispose()
      selLayer.remove()
      for (const m of yardMarks) m.wrap.remove()
    },
  }
}
