// The season (design/season.html): the land, with a stencilled tag on each field and a face pin on each person; the
// two boards at the top; the time book of people at the foot with the alerts beside it; and, for whatever is
// selected, its card beside the point clicked and tied to it (tie.ts), with the selection drawn on the land itself.
import type { Goal } from '../game/goals.ts'
import { SPEED_X } from '../game/app.ts'
import { nextGoal } from '../game/goals.ts'
import { laps } from '../render/laps.ts'
import * as S from '../sim/index.ts'
import { yardCard, YARD_TITLE } from './build.ts'
import { commandCard } from './card.ts'
import { EXIT_MS, patch, unname, type Ctx, type Screen } from './core.ts'
import { fates, openCrew, unitBar } from './crew.ts'
import { h, s } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { incidentCard } from './incident.ts'
import { ticket, trayPaper } from './dig.ts'
import { digitFor, fieldForDigit, isTract } from './map.ts'
import { askSpray, personCard, sprayAsking, sprayWay, workGrid } from './people.ts'
import { mainBar, type Todo } from './mainbar.ts'
import { pins } from './pins.ts'
import { plates, type PlateModel } from './plates.ts'
import { anchored, ties, type Land, type Mode } from './tie.ts'
import { hint as hintText, isJob, isStale, jobText, JOB_VERB, KEY_JOB, stageGlyph } from './rules.ts'
import type { Ink } from './system/parts.ts'
import { clock, topBar } from './top.ts'
import { guidedYear, mayAsk, quietTips } from './tutorial.ts'
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

// The height of the list of orders over the time book, with its gap: the land is framed as if it were always there.
const LIST_ROOM = 52

export function seasonScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void; onAlmanac: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, { ...o, show: g => show(target(g)), canShow: g => !!target(g) })
  const crew = h('div', { class: 'crew sys' })
  const clockSlot = h('div', { class: 'clock-slot dock sys' })
  const notesSlot = h('div', { class: 'notes-slot sys' })
  const trayHost = h('div', { class: 'tray-host sys' })
  const paused = h('p', { class: 'paused sys', testid: 'paused', hidden: true })
  // In the same place while the days run: the clock's state is said at a glance either way, and after a sheet's Back
  // or a telegram's answer sets the days going, the chip that says so is lit for a moment.
  const running = h('p', { class: 'paused running sys', testid: 'running', hidden: true })
  let ranAt = 0
  const veil = h('div', { class: 'veil sys', hidden: true })
  // The way back from a zoom, a pan or a tilt, always in the same place: what the Home key does.
  const homeKey = h('button', { class: 'iconbtn view-home sys', type: 'button', testid: 'view-home', 'aria-label': 'Show the whole farm (Home)', title: 'Show the whole farm (Home)', onclick: () => ctx.view.home() }, icon('land', 'i'))
  let tray: { el: HTMLElement; field: number; day: number } | null = null

  const openTicket = (lot: number) => { const spec = ticket(ctx, lot, { fresh: false }); if (spec) ctx.papers.open(spec) }
  const card = commandCard(ctx, { onTray: field => showTray(field), onTicket: openTicket })
  const person = personCard(ctx)
  const yard = yardCard(ctx)
  const grid = workGrid(ctx)
  const incident = incidentCard(ctx)
  // Each card opens beside the thing it is about and stays tied to it.
  const tied = { card: anchored(ctx, card.el), yard: anchored(ctx, yard.el), person: anchored(ctx, person.el) }
  // The menu that is always up, and what waits on the player for its first tab.
  function todo(): Todo[] {
    const c = app.campaign
    const s0 = c?.season
    if (!c || !s0) return []
    const out: Todo[] = []
    const needs = app.needs()
    const go = (i: number) => () => { app.selectUnit(-1); app.select(i); app.focus(i) }
    for (let i = 0; i < needs.length; i++) {
      const need = needs[i]?.need
      if (!need || !S.held(c, i)) continue
      if (need.act === 'sell') { out.push({ field: i, glyph: 'ticket', text: F.localize(need.text), why: F.localize(need.why), urgent: need.urgent, go: () => openTicket(need.lot) }); continue }
      if (!isJob(need.act) || (need.act === 'spray' && sprayWay(c) === 'none') || s0.jobs.some(j => j.kind === need.act && j.field === i)) continue
      out.push({ field: i, glyph: need.act, text: F.localize(need.text), why: F.localize(need.why), urgent: need.urgent, go: go(i) })
    }
    // Dry soil in the weeks after the potatoes form sets scab, and the crew's routine does not water: said here so
    // the player hears of it while watering can still help.
    for (let i = 0; i < s0.fields.length; i++) {
      const fs = s0.fields[i]
      if (!S.held(c, i) || fs.status !== 'growing' || fs.tiDay < 0 || s0.day - fs.tiDay > S.SCAB_DAYS) continue
      const f = S.fieldInfo(c, i)
      if (f.moisture >= 0.5 || out.some(t => t.field === i) || s0.jobs.some(j => j.kind === 'water' && j.field === i)) continue
      out.push({ field: i, glyph: 'water', text: `Water ${f.name}`, why: 'The soil is dry while the potatoes form, which sets scab.', urgent: false, go: go(i) })
    }
    for (const x of fates(app.world, c).pressing) {
      if (x.job < 0 || !x.inWay) continue
      out.push({ field: x.field, glyph: x.kind, text: `${JOB_VERB[x.kind]} ${S.FIELD_NAMES[x.field] ?? ''} is held up`, why: F.localize(x.inWay), urgent: true, go: go(x.field) })
    }
    return out.sort((p, q) => Number(q.urgent) - Number(p.urgent))
  }
  const bar = mainBar(ctx, {
    todo,
    goField: i => { app.selectUnit(-1); app.select(i); app.focus(i) },
    goUnit: id => { app.select(-1); app.selectYard(0); app.selectUnit(id, 'land'); ctx.view.show?.({ unit: id }) },
    onWork: () => grid.toggle(true),
    onMoney: () => top.el.querySelector<HTMLElement>('[data-testid="outlook-key"]')?.click(),
    onAlmanac: o.onAlmanac,
    onMenu: o.onMenu,
  })
  const el = h('main', { class: 'season-screen' }, veil, top.el, paused, running, homeKey, bar.el, tied.card.parts, tied.yard.parts, tied.person.parts, card.el, yard.el, person.el, grid.el, trayHost,
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

  function offerTray(e: S.GameEvent, staged: boolean): void {
    const name = S.FIELD_NAMES[e.field] ?? ''
    // The same field dug again: the tray the player has open is brought up to date, since they asked for it.
    if (tray && tray.field === e.field) { openTray(e, staged); return }
    // The foot has one place for a slip: a tip about a stamp gives it up to the offer, which comes only once.
    if (hint) { hint = null; ctx.notes.unpin() }
    ctx.notes.push({
      level: 'info', glyph: 'sample', ttl: 20000, field: e.field, day: e.day,
      text: `The test dig at ${name} is in. Show me`,
      full: `The test dig at ${name} is in. Press to see what came up.`,
      go: () => openTray(e, false), offer: true,
    })
  }

  function showTray(field: number): void {
    const c = app.campaign
    const e = [...(c?.season?.log ?? [])].reverse().find(x => x.type === 'sample' && x.field === field)
    if (e) openTray(e, false)
  }

  let foot = { key: '', bottom: 0 }
  // The foot of the boards themselves, without the slip that hangs from one.
  let board = 0
  // An alert that lies over a tag or a stamp lets the press through to it, faded: a press meant for a stamp never
  // opens what an alert goes to (10).
  let clearAt = 0
  function clearLand(): void {
    const now = performance.now()
    if (now - clearAt < 120) return
    clearAt = now
    const tags = P.boxes()
    for (const a of notesSlot.querySelectorAll<HTMLElement>('.alert')) {
      const r = a.getBoundingClientRect()
      // (a slip that offers to show something is there to be pressed: it stays whole and in reach)
      const offer = !!a.querySelector(':scope > span:not(.sr)')?.textContent?.trim().endsWith('Show me')
      const over = !offer && !!r.width && tags.some(t => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top)
      a.classList.toggle('over-land', over)
    }
  }
  // The wheel over the list and the time book zooms the land, as it does over the land itself; a pop that scrolls
  // keeps its own wheel.
  crew.addEventListener('wheel', (e: WheelEvent) => {
    const t = e.target as HTMLElement
    if (t.closest?.('.q-pop')) return
    const land = document.getElementById('field')
    if (!land) return
    e.preventDefault()
    land.dispatchEvent(new WheelEvent('wheel', { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, bubbles: true, cancelable: true }))
  }, { passive: false })
  // The first dig the crew starts by itself this season is said, with a way to see it.
  const startedSaid = new Set<string>()
  function sayCrewStarts(c: S.Campaign): void {
    const s0 = c.season
    if (!s0 || guidedYear(c)) return
    // (planting says its own start: the player's word, or the crew's start without one, src/sim/advice.ts)
    {
      const kind = 'dig'
      const key = `${c.seed}.${c.year}.${kind}`
      if (startedSaid.has(key)) return
      // Work done today, not an order someone holds while it waits for warm soil; and not work the player ordered.
      const j = s0.worked.find(x => x.kind === kind && !s0.jobs.some(o => o.kind === kind && o.field === x.field && o.by !== 'routine'))
      if (!j) return
      startedSaid.add(key)
      const u = c.crew.find(x => x.id === j.unit)
      const who = !u || u.kind === 'farmer' ? 'You\'re' : `${u.name.split(' ')[0]} is`
      ctx.notes.push({
        level: 'info', glyph: kind, ttl: 12000, field: j.field, day: s0.day,
        text: `Digging has started in ${S.FIELD_NAMES[j.field]}. Show me`,
        full: `Digging has started in ${S.FIELD_NAMES[j.field]} without an order from you. ${who} working there. Press to see.`,
        // To the field the sentence names, where the work shows.
        go: () => { app.selectUnit(-1); app.select(j.field); app.focus(j.field) }, offer: true,
      })
    }
  }
  const killSaid = new Set<string>()
  function sayKillDates(c: S.Campaign): void {
    const s0 = c.season
    if (!s0 || guidedYear(c)) return
    const tomorrow = S.formatDay(s0.year, s0.day + 1)
    for (const p of S.killsAhead(app.world, c)) {
      const date = /on ([A-Z][a-z]+ \d+)/.exec(p.inWay)?.[1] ?? ''
      const soon = date === tomorrow
      const key = `${c.seed}.${c.year}.${p.field}.${soon ? 'soon' : 'set'}`
      if (killSaid.has(key)) continue
      killSaid.add(key)
      const name = S.FIELD_NAMES[p.field]
      const due = S.killOutlook(c, p.field)
      ctx.notes.push({
        level: soon ? 'warn' : 'info', glyph: 'kill', ttl: 14000, field: p.field, day: s0.day,
        text: `${name}: ${due && date && !soon ? `vine kill due around ${S.formatDay(s0.year, due.day, true)}. Your crew does it on ${date}` : `your crew will kill the vines ${soon ? 'tomorrow' : date ? `on ${date}` : 'soon'}`}. Show me`,
        full: `${F.localize(p.inWay)} Press to see the field, where you can tell the crew to keep the vines up.`,
        go: () => { app.select(p.field); app.focus(p.field) }, offer: !soon,
      })
    }
  }
  // The spraying question, once a season, when blight weather first comes over leaves that are up: the clock stops
  // for it as for a telegram. Put away unanswered, it is not asked again by itself.
  let sprayAsked = ''
  function askSprayOnce(c: S.Campaign): void {
    const s0 = c.season
    const key = `${c.seed}.${c.year}`
    if (!s0 || s0.watchDay < 0 || sprayAsked === key || sprayWay(c) || S.seasonDone(c) || sprayAsking() || !s0.fields.some(f => f.status === 'growing')) return
    // In the guided first year the question waits for the note that says what blight is.
    if (!mayAsk(c, 'blight')) return
    sprayAsked = key
    if (S.routineInfo(c).some(r => r.kind === 'spray' && r.auto)) return
    askSpray(ctx)
    app.stopFor('You need to decide how to handle spraying this season.', 'spray')
  }
  // A pause that waits for a press on a stamp (the word to plant, a vine kill that is the player's): unless every
  // field that carries one is on the screen itself (a tag waiting at the edge for land out of view is not the
  // field), the whole farm is shown.
  function showStamps(act: 'plant' | 'kill'): void {
    const onScreen = () => app.needs().every((n, i) => {
      if (n.need?.act !== act) return true
      const a = ctx.view.fieldAnchor(i)
      const r = document.querySelector(`#ui .plate-layer [data-testid="badge-${i}"]`)?.getBoundingClientRect()
      return a.visible && a.x >= 0 && a.y >= 0 && a.x <= innerWidth && a.y <= innerHeight && !!r && r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
    })
    setTimeout(() => { if (app.screen === 'season' && app.speed === 0 && !onScreen()) app.focus(-1) }, 400)
  }
  const off = app.on(ev => {
    if (ev.type === 'yard' || ev.type === 'unit' || ev.type === 'select') ctx.dirty()
    else if (ev.type === 'speed' && ev.speed === 0 && (app.pauseCause === 'plantAsk' || app.pauseCause === 'killCall')) showStamps(app.pauseCause === 'plantAsk' ? 'plant' : 'kill')
    else if (ev.type === 'events') {
      // In the guided first year the test dig is on the field's card, not laid on the land unasked.
      // A test dig's result is offered, never laid over what the player is doing: a slip at the foot with Show me
      // (and the field's own card has it). In the guided first year the guide speaks for the slips.
      for (const e of ev.events) if (e.type === 'sample' && !guidedYear(app.campaign)) { const staged = app.speed < 3; void ctx.view.whenShown('sample', e.field).then(() => { if (app.screen === 'season') offerTray(e, staged) }) }
      const c0 = app.campaign
      if (c0) { sayCrewStarts(c0); sayKillDates(c0) }
    }
  })

  // ------------------------------------------------------------ tags, stamps and the tips

  const seen = hintsSeen()
  // first: nothing has been taught yet, so this tip also says how an order is given.
  let hint: { kind: S.JobKind; field: number; at: number; first: boolean } | null = null

  function updateHint(): void {
    const needs = app.needs()
    if (hint && (needs[hint.field]?.need?.act !== hint.kind || performance.now() - hint.at > HINT_MS || !app.settings.hints)) hint = null
    if (!hint && app.settings.hints && !quietTips()) {
      for (let i = 0; i < needs.length; i++) {
        const act = needs[i].need?.act
        // (the planting that waits for the player's word is said by the crew itself, with what to press)
        if (!isJob(act) || seen.has(act) || (act === 'plant' && !!app.campaign && S.awaitsWord(app.campaign, 'plant', i))) continue
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
      // Five words at the foot; the field's card has the rest.
      ctx.notes.pin({ key: `tip-${kind}`, glyph: kind, text: `${ctx.touch() ? 'Tap' : 'Click'} the ringed stamp to ${JOB_VERB[kind].toLowerCase()}.`, onClose: () => { hint = null; ctx.dirty() } })
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
      said.push(`blight seen on ${F.plural(f.blightHills, 'plant')}${f.scoutAge >= 0 ? `, scouted ${F.ago(f.scoutAge)}` : ''}`)
    }
    const anyBlight = s0.fields.some((_, k) => S.fieldInfo(c, k).blightHills > 0)
    if (f.status === 'growing' && f.protect < 0.35 && (s0.watchDay >= 0 || anyBlight)) { marks.push({ glyph: 'bare', cls: 'warn' }); said.push('leaves unprotected') }
    let sub: string | undefined
    if (f.inField >= 0.5) {
      const frost = frostAt[i] ?? 0
      sub = `${F.massValue(f.inField) >= 1000 ? `${F.num(F.massValue(f.inField) / 1000, 1)}k` : F.num(F.massValue(f.inField))} in barrels`
      said.push(`${F.mass(f.inField)} in barrels${frost >= 30 ? `, ${frost}% chance of frost tonight` : ''}`)
    }
    if (f.works) { marks.push({ glyph: f.works.kind, cls: '' }); said.push(f.works.kind === 'stump' ? 'stumps being pulled' : 'tile drains going in') }
    if (tract && f.cover !== 'open' && c.fields[i].felled > 0 && f.clearing) said.push(`${F.pct(f.clearing.felled)} felled`)
    const waits = S.jobWaits(app.world, c)
    const head = s0.jobs.find(j => !waits[j.id])
    const queue = queued.map(j => ({ glyph: j.kind as string, active: j === head }))
    if (queue.length) said.push(`on the work list: ${F.list(queued.map(j => JOB_VERB[j.kind].toLowerCase()))}`)
    const lot = f.lot >= 0 ? c.lots.find(l => l.id === f.lot) : undefined
    // Spraying the player said not to do this year carries no stamp.
    const badge = need && isJob(need.act) && !(need.act === 'spray' && sprayWay(c) === 'none')
      ? { glyph: need.act as string, label: `${F.localize(need.text)} ${F.localize(need.why)}`, urgent: need.urgent, ink: inkFor(need.act, need.urgent, f) }
      : need && need.act === 'sell' && lot ? { glyph: 'ticket', label: `${F.localize(need.text)} ${F.localize(need.why)}`, urgent: need.urgent, ink: 'ink' as Ink } : null
    const key = digitFor(c, i)
    const what = tract ? (f.cover === 'open' ? 'new ground, ready to plant next spring' : f.coverWord) : f.status === 'rest' ? 'resting in oats and clover' : `${f.variety}, ${f.stage.toLowerCase()}`
    return {
      name: f.name,
      glyph: tract ? COVER_GLYPH[f.cover] : stageGlyph(f),
      sub, marks, queue, badge, key, cls: tract ? 'tract' : undefined, hoverName: !tract && f.status === 'rest' ? 'Resting: oats and clover' : undefined,
      said: `${key ? `Key ${key}` : f.block === 'home' ? 'The home farm' : 'Beyond the home farm'}: ${what}${said.length ? `, ${said.join(', ')}` : ''}${badge ? `. Needs: ${F.localize(need!.text)}` : '.'}`,
      taught: !!badge && ((!!hint && need?.act === hint.kind) || goalField === i),
    }
  }

  function onBadge(i: number): void {
    const c = app.campaign
    if (!c) return
    const need = app.needs()[i]?.need
    if (need && need.act === 'sell') { openTicket(need.lot); return }
    const r = app.smartOrder(i)
    if (r.ok) ctx.announce(`${need ? F.localize(need.text) : 'Order given.'} It's on the work list.`)
    else ctx.say(`${S.FIELD_NAMES[i]}: ${r.err}`, 'info')
  }

  // What floats over the land: nothing on the land is left under it.
  const floating = () => [card.el, yard.el, person.el, grid.el, incident.el, trayHost.firstElementChild as HTMLElement | null, paused, running]
  // Read once a frame, before anything on the land is moved, so the frame never forces a second layout.
  let coverCache: DOMRect[] | null = null
  const covers = (): DOMRect[] => coverCache ?? floating().filter((x): x is HTMLElement => !!x && !x.hidden && x.offsetParent !== null).map(x => x.getBoundingClientRect())
  // What a tag moved by its field steps clear of: each person on the land, head to foot, and the yards' tags.
  const keep = (): DOMRect[] => [
    ...(app.campaign?.crew ?? []).flatMap(u => {
      const a = ctx.view.unitAnchor(u.id), f = ctx.view.unitFoot(u.id)
      return a.visible && f.visible ? [new DOMRect(f.x - 12, Math.min(a.y, f.y - 24), 24, f.y + 2 - Math.min(a.y, f.y - 24))] : []
    }),
    ...yardMarks.filter(m => !m.wrap.hidden && m.at).map(m => new DOMRect(m.at!.x - m.w / 2, m.at!.y - 22, m.w, 44)),
  ]
  const P = plates(ctx, plateLayer, { model: plateModel, onBadge, covers, keep })
  const people = pins(ctx, plateLayer, {
    covers,
    stopped: () => stoppedBy(app.campaign),
    board: () => board,
    stamps: () => P.byField().filter(t => t.need).map(t => new DOMRect(t.box.right - 52, t.box.top, 52, t.box.height)),
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
        'aria-label': `${YARD_TITLE[m.y]}${up ? `, where the ${S.BUILDINGS[up.kind].name.toLowerCase()} is ${F.pct(up.done / up.need)} built` : ''}. Press to build here${ctx.touch() ? '' : ' (Y)'}.`,
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
      // The yard in hand keeps its tag: its own card stands beside it, never on it.
      const ok = a.visible && Number.isFinite(a.x) && Number.isFinite(a.y) && a.y > (app.yard === m.y ? Math.min(ins.top, board) : ins.top) + 40 && a.y < innerHeight - ins.bottom && a.x > ins.left + 60 && a.x < innerWidth - ins.right - 60 &&
        (app.yard === m.y || !cv.some(r => a.x > r.left - 80 && a.x < r.right + 80 && a.y > r.top - 20 && a.y < r.bottom + 20))
      m.wrap.classList.toggle('gone', !ok)
      m.at = ok ? { x: a.x, y: a.y } : null
      if (ok) m.wrap.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`
    }
  }

  // ------------------------------------------------------------ where a card may stand

  // What a card keeps off: the list and the time book at the foot, the clock's chip under the boards, the work grid
  // and a test-dig tray. Read once after each change, not every frame.
  let landNow: Land | null = null
  function land(): Land {
    if (landNow) return landNow
    const ins = app.insets
    const bars = [...crew.querySelectorAll<HTMLElement>('.queue, .timebook'), clockSlot, paused, running, homeKey, grid.el, trayHost.firstElementChild as HTMLElement | null]
    const blocks = bars.filter((x): x is HTMLElement => !!x && !x.hidden && x.offsetParent !== null && x.offsetHeight > 0).map(x => { const r = x.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } })
    // The land runs up to the boards themselves; the slip that hangs from one is a thing to keep off, not a line
    // across the whole window, so a card clear of it has that much more room.
    for (const x of top.el.querySelectorAll<HTMLElement>('.goal, .tb-pop')) {
      if (x.offsetParent === null || !x.offsetHeight) continue
      const r = x.getBoundingClientRect()
      blocks.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
    }
    // At a desk the two boards are things to keep off as well: between them, and beside the shorter one, the land
    // runs on up, so a card there has that much more room.
    let line = (board > 0 ? Math.min(ins.top, board) : ins.top) + 8
    const mounts = ctx.layout() === 'narrow' || ctx.layout() === 'short' ? [] : [...top.el.querySelectorAll<HTMLElement>('.almanac > .mount, .bank > .mount')]
    if (mounts.length === 2) {
      for (const x of mounts) { const r = x.getBoundingClientRect(); blocks.push({ left: r.left, top: Math.min(0, r.top), right: r.right, bottom: r.bottom }) }
      line = 8
    }
    landNow = { win: { left: 8, top: line, right: innerWidth - 8, bottom: innerHeight - 8 }, blocks }
    return landNow
  }
  // What a card hides as little of as it can: the field tags, the yards' tags and people's pins.
  // A field with a crop in the ground, or a stamp on its tag, is the next thing a player reaches for: its tag counts
  // three times a resting field's, and six times a face (a person is also reached by their place in the people bar).
  function marks(): { left: number; top: number; right: number; bottom: number; weight: number }[] {
    const c = app.campaign
    const of = (r: DOMRect, weight: number) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, weight })
    const out = P.byField().map(t => {
      const st = c ? S.fieldInfo(c, t.field).status : 'off'
      return of(t.box, t.need || st === 'growing' || st === 'planted' || st === 'dead' || st === 'digging' ? 3 : 1)
    })
    // The menu bar: a card keeps off it where it can, and lies over it before it is cut.
    if (bar.el.offsetHeight > 0) out.push(of(bar.el.getBoundingClientRect(), 4))
    for (const m of yardMarks) if (!m.wrap.hidden && m.at) out.push(of(new DOMRect(m.at.x - m.w / 2, m.at.y - 22, m.w, 44), 1))
    // The alerts' place beside the time book, whether or not a slip lies there now: a card keeps off it before any
    // tag, so a slip that comes is not under the card; but it lies there rather than be cut short (a person's page
    // opened from the people bar has nowhere else to be whole in a short window). Under 1400 the alerts wait while
    // a field is in hand.
    const book = crew.querySelector<HTMLElement>('.timebook')
    if (book && book.offsetParent !== null && !(ctx.layout() === 'mid' && el.classList.contains('selected'))) {
      const b = book.getBoundingClientRect()
      out.push(of(new DOMRect(b.right + 8, b.bottom - 56, Math.min(innerWidth - 8, b.right + 536) - b.right - 8, 56), 4))
    }
    for (const u of c?.crew ?? []) {
      const a = ctx.view.unitAnchor(u.id)
      if (a.visible && Number.isFinite(a.x) && Number.isFinite(a.y)) out.push(of(new DOMRect(a.x - 20, a.y - 52, 40, 52), 0.5))
    }
    return out
  }
  // The tutorial's note is the thing the player was told to read: a card keeps off it before any tag (the note steps
  // off a card that has nowhere else to be whole).
  function withNote(): { left: number; top: number; right: number; bottom: number; weight: number }[] {
    const out = marks()
    const note = document.querySelector<HTMLElement>('.guide-layer .guide:not([hidden]):not(.gone), .guide-slot .guide.docked')
    if (note && note.offsetParent !== null) { const r = note.getBoundingClientRect(); if (r.width > 0) out.push({ left: r.left - 6, top: r.top - 6, right: r.right + 6, bottom: r.bottom + 6, weight: 8 }) }
    return out
  }
  ties().setLand(() => ({ ...land(), tags: withNote }))
  function placeCards(): void {
    const layout = ctx.layout()
    const quiet = incident.isUp()
    const bar: Mode = layout === 'narrow' ? 'sheet' : layout === 'short' ? 'side' : 'float'
    tied.card.frame(bar, quiet)
    tied.yard.frame(bar, quiet)
    tied.person.frame(layout === 'narrow' ? 'sheet' : layout === 'short' ? 'plain' : 'float', quiet)
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
    ctx.announce(`${S.FIELD_NAMES[next]} selected. ${F.localize(n.text)} ${F.localize(n.why)} Press Enter to give the order.`)
    return true
  }

  // What Escape closes on this screen, nearest first (the order across the interface is in index.ts).
  const escapes = {
    // a popover or breakdown: the money board's, a shared pin's list of people, an order's choices
    popover: (): boolean => top.escape() || people.escape() || units.escape(),
    // a card: the work grid, a telegram, a test-dig tray, and what a selection shows (a field's, the yard's, a person's)
    card: (): boolean => {
      if (grid.isOpen()) { grid.toggle(false); return true }
      if (incident.putAway()) return true
      if (tray) { closeTray(); return true }
      if (app.selection.length) { app.select(-1); (document.activeElement as HTMLElement | null)?.blur?.(); return true }
      if (app.yard !== 0) { app.selectYard(0); return true }
      if (app.unit >= 0) { app.selectUnit(-1); return true }
      return false
    },
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
    if (k === 'Escape') return escapes.popover() || escapes.card()
    if (k === 'Tab') {
      if (e.ctrlKey || (!!t.closest?.('button, input, a') && !onPlate)) return false
      const from = at >= 0 ? at : app.selected >= 0 ? app.selected : e.shiftKey ? S.FIELD_COUNT : -1
      return nextNeed(from, onPlate, e.shiftKey)
    }
    if (k === ' ') {
      // Space is the clock wherever the focus rests on this screen, so a button left focused never takes it instead.
      if (e.ctrlKey || t.closest?.('input, textarea, select, [role="slider"], .dialog')) return false
      if (onControl) (t.closest?.('button, a') as HTMLElement | null)?.blur()
      // Just after an answer set the days going by themselves, Space is taken as "go on", not as a pause: the chip
      // that says the days are running is lit again instead.
      if (app.speed > 0 && performance.now() - app.resumedAt < 1000) { ranAt = performance.now(); ctx.dirty(); ctx.announce(`The game is running at ${SPEED_X[app.speed]}.`); return true }
      app.togglePause()
      return true
    }
    if (k === 'Enter') {
      if (onControl || e.ctrlKey) return false
      card.suggested()
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
      if (!last) ctx.say('There\'s nothing on the work list to remove.')
      else if (ctx.run({ t: 'cancel', id: last.id }).ok) ctx.announce(`${jobText(last)} was taken off the work list.`)
      return true
    }
    const low = k.toLowerCase()
    if (low === 'f' && !e.ctrlKey) { if (!S.seasonDone(c)) app.cycleSpeed(); return true }
    if (low === 'g' && !e.ctrlKey) { if (c.crew.length >= 3) grid.toggle(); else ctx.say('Who does what opens once you have three people on the farm.'); return true }
    if (low === 'y' && !e.ctrlKey) {
      if (yardShown(c)) app.selectYard(app.yard === S.HOME_YARD ? 0 : S.HOME_YARD)
      else ctx.say('You can build once the farm can afford a building.')
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
    // Frost on the barrels: the haul of the biggest pile first, today.
    if (a.type === 'frostBarrels') return () => { const h = app.campaign ? S.haulInfo(app.world, app.campaign).sort((x, y) => y.cwt - x.cwt)[0] : undefined; if (h) app.haulAhead(h.field); else ctx.say('The barrels are all in. Nothing is left out tonight.', 'good') }
    if (a.type === 'barrelsOut' && a.field >= 0) { const field = a.field; return () => app.haulAhead(field) }
    // Someone idle with work waiting that they are set never to do: the press lets them, last in their order.
    if (a.type === 'idleNever' && unit >= 0 && typeof a.data?.work === 'string') {
      const work = a.data.work as S.Skill
      return () => {
        const u = app.campaign?.crew.find(x => x.id === unit)
        if (!u || !ctx.run({ t: 'priority', unit, work, level: S.PRIORITY_MAX }).ok) return
        ctx.say(`${u.name.split(' ')[0]} will now take ${S.SKILL_LABEL[work]} when nothing else needs them.`)
      }
    }
    if (unit >= 0 && a.type !== 'poached' && a.type !== 'quit') return () => { if (app.campaign?.crew.some(u => u.id === unit)) { app.select(-1); app.selectUnit(unit) } }
    if (a.type === 'built' || a.type === 'building' || a.type === 'pondDry') {
      const b = typeof a.data?.building === 'number' ? c.buildings.find(x => x.id === a.data!.building) : undefined
      const y = b?.yard ?? S.HOME_YARD
      return () => app.selectYard(y)
    }
    return null
  }

  // Everything on the screen drawn from the game as it stands: at once (update), or a part at a time over the frames
  // after a day's turn (steps), each part what one frame can carry on a slow machine.
  function* drawn(): Generator<void> {
    const c = app.campaign
    if (!c || !c.season) return
    // Each order's fate, which the time book, the board and the cards all ask for: the next day played on a copy of
    // the farm, a frame's work by itself.
    fates(app.world, c)
    laps.end('interface: fates')
    yield
    const layout = ctx.layout()
    el.dataset.layout = layout
    const many = c.crew.length > 1
    // A person's page opens from the time book; picked on the land, their card opens beside them instead (whois.ts).
    const personUp = many && app.unit >= 0 && app.unitFrom === 'list' && !app.selection.length && app.yard === 0
    const selected = app.selection.length > 0 || app.yard !== 0
    el.classList.toggle('selected', selected)
    el.classList.toggle('person-up', personUp || grid.isOpen())
    el.classList.toggle('tray-up', !!tray)
    // What the goal points at: the field it lights, the yard it rings.
    const g = nextGoal(c)
    const tgt = target(g)
    goalField = tgt && 'field' in tgt ? tgt.field : -1
    frostAt = Object.fromEntries(S.haulInfo(app.world, c).map(x => [x.field, x.frostChance]))
    laps.end('interface: goal')
    top.update()
    laps.end('interface: boards')
    yield
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
      icon('play', 'i'), h('span', { class: 'sr' }, 'Paused. '), `Resume at ${SPEED_X[app.resumeSpeed || 1]}`, ctx.touch() ? null : h('span', { class: 'key' }, 'Space')))
    const wasRunning = !running.hidden
    running.hidden = app.speed === 0 || S.seasonDone(c) || (stoppedFor && layout !== 'narrow') || (layout === 'narrow' && app.selection.length > 0)
    if (!running.hidden && !wasRunning) ranAt = performance.now()
    if (!running.hidden) {
      patch(running, JSON.stringify([ctx.touch(), app.speed]), () => h('button', { class: 'paused-go btn', type: 'button', testid: 'running-stop', onclick: () => app.togglePause() },
        icon('pause', 'i'), `Running at ${SPEED_X[app.speed]}`, ctx.touch() ? null : h('span', { class: 'key' }, 'Space')))
      running.classList.toggle('lit', performance.now() - ranAt < 2400)
      if (performance.now() - ranAt < 2400) setTimeout(() => ctx.dirty(), 2450)
    }
    updateHint()
    askSprayOnce(c)
    laps.end('interface: clock, hint')
    P.update()
    updateYards(c, tgt && 'yard' in tgt ? tgt.yard : 0)
    laps.end('interface: tags drawn')
    yield
    units.update(c)
    laps.end('interface: time book, list')
    yield
    people.update(c)
    laps.end('interface: pins drawn')
    yield
    card.update(c)
    laps.end('interface: field card')
    tied.card.update(card.el.hidden ? null : ties().field())
    person.update(c, personUp)
    tied.person.update(personUp ? ties().unit() : null)
    const build = g?.id === 'build' ? (S.buildingInfo(c).filter(b => b.yard === app.yard && b.state === 'none' && b.ok).sort((a, b) => a.total - b.total)[0]?.kind ?? null) : null
    yard.update(c, build)
    tied.yard.update(ties().yard())
    landNow = null
    if (c.crew.length < 3 && grid.isOpen()) grid.toggle(false)
    laps.end('interface: person, yard')
    yield
    grid.update(c)
    bar.update(c)
    incident.update(c)
    laps.end('interface: grid, telegram')
    const up = incident.isUp()
    veil.hidden = !up
    el.classList.toggle('incident-up', up)
    ctx.notes.limit(1)
    ctx.notes.maxAge = layout === 'short' ? 9000 : 0
    ctx.notes.prune(c.season.day)
  }

  return {
    el,
    notes: notesSlot,
    key,
    escapes,
    goFor,
    update() { const all = drawn(); while (!all.next().done); },
    steps: drawn,
    insets() {
      const layout = ctx.layout()
      // Where things rest, not where a card being laid down happens to be this frame: offsets ignore transforms.
      const box = (x: HTMLElement) => {
        let l = 0, t0 = 0
        for (let e: HTMLElement | null = x; e && e !== el; e = e.offsetParent as HTMLElement | null) { l += e.offsetLeft; t0 += e.offsetTop }
        return { left: l, top: t0, right: l + x.offsetWidth, bottom: t0 + x.offsetHeight }
      }
      const t = Math.max(top.el.getBoundingClientRect().bottom, ...[...top.el.querySelectorAll<HTMLElement>('.almanac > .mount, .bank > .mount')].map(x => x.getBoundingClientRect().bottom))
      board = Math.max(0, ...[...top.el.querySelectorAll<HTMLElement>('.almanac > .mount, .bank > .mount')].map(x => x.getBoundingClientRect().bottom))
      const vis = (x: HTMLElement) => !x.hidden && x.offsetParent !== null && x.offsetHeight > 0
      // The time book and its list at the foot, and the clock with them on a phone. Not the alerts: they come and go,
      // and the picture is centred on the free land, so counting them would move the land under the pointer (at
      // the middle widths they make way for a selected field's card instead, season.css).
      // The list's row is kept whether or not it holds an order, so the first order given moves nothing on the land.
      // Measured once for each window, layout and number of people: a cell's words wrapping, a slip over a cell or a
      // stamp on the book never move the land.
      const book = crew.querySelector<HTMLElement>('.timebook')
      const footKey = `${innerWidth}x${innerHeight} ${layout} ${app.campaign?.crew.length ?? 0} ${vis(clockSlot)} ${!!book && vis(book)}`
      if (footKey !== foot.key) {
        const low = [...(book && vis(book) ? [box(book).top - LIST_ROOM] : []), ...[clockSlot].filter(vis).map(x => box(x).top)]
        foot = { key: footKey, bottom: innerHeight - Math.min(...low, innerHeight) + 6 }
      }
      let bottom = foot.bottom
      // On a phone the clock's chip under the top board frames the land as the board does.
      el.style.setProperty('--board', `${Math.round(t)}px`)
      const chip = [paused, running].find(x => !x.hidden && x.offsetParent !== null)
      const tAll = (layout === 'narrow' || layout === 'short') && chip ? Math.max(t, chip.getBoundingClientRect().bottom + 4) : t
      // On a phone or a short window there is no pointer to keep still, and little land: everything standing over the
      // foot frames it at its real height (the list however many rows it takes, its pop, the alerts and hint, the
      // Home key), so no tag is left under them.
      if (layout === 'narrow' || layout === 'short') {
        const over = [...crew.querySelectorAll<HTMLElement>('.queue, .timebook, .q-pop'), clockSlot, ...notesSlot.querySelectorAll<HTMLElement>('.alert')]
          .filter(x => x.offsetParent !== null && x.offsetHeight > 0).map(x => x.getBoundingClientRect().top)
        const raw = innerHeight - Math.min(...over, innerHeight) + 6
        el.style.setProperty('--foot', `${Math.round(raw)}px`)
        bottom = raw + (vis(homeKey) ? homeKey.offsetHeight + 10 : 0)
      }
      // Only what always stands frames the land: a card, a page or the grid opening on a click never moves the camera
      // (a card opens beside what it belongs to, never on it; it lies over the tags). On a phone the card is a sheet
      // over half the land, so there the land is framed above it.
      const sheet = layout === 'narrow' ? [card.el, yard.el].find(vis) : undefined
      return [tAll, 0, sheet ? innerHeight - box(sheet).top + 6 : bottom, 0]
    },
    frame: () => {
      coverCache = null; coverCache = covers(); laps.end('interface: covers')
      P.frame(); laps.end('interface: tags')
      placeYards(); placeCards(); laps.end('interface: cards')
      people.frame(); laps.end('interface: pins')
      drawSelection(); clearLand(); laps.end('interface: selection')
      coverCache = null
    },
    dispose() {
      off()
      P.dispose()
      people.dispose()
      units.dispose()
      ties().setLand(null)
      for (const t of Object.values(tied)) t.dispose()
      selLayer.remove()
      for (const m of yardMarks) m.wrap.remove()
    },
  }
}
