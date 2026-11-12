// The season: the land, a plate on each field, the people bar, and one card for whatever is selected.
import type { Goal } from '../game/goals.ts'
import { nextGoal } from '../game/goals.ts'
import * as S from '../sim/index.ts'
import { yardCard, YARD_TITLE } from './build.ts'
import { commandCard } from './card.ts'
import { tracker } from './contracts.ts'
import { EXIT_MS, patch, unname, type Ctx, type Screen } from './core.ts'
import { openCrew, unitBar } from './crew.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { incidentCard } from './incident.ts'
import { ticket, trayPaper } from './dig.ts'
import { digitFor, fieldForDigit, isTract } from './map.ts'
import { personCard, workGrid } from './people.ts'
import { plates, type PlateModel } from './plates.ts'
import { BUILD_GLYPH, hint as hintText, isJob, isStale, jobText, JOB_VERB, KEY_JOB, stageGlyph } from './rules.ts'
import { clock, topBar } from './top.ts'

const HINTS_KEY = 'the-county/hints'
const HINT_MS = 45000

function hintsSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HINTS_KEY) ?? '[]') as string[]) } catch { return new Set() }
}

// Where a goal is reached: the field that can take the step now, a tract, the yard, the hiring hall, or a person.
type Target = { field: number } | { yard: number } | { hire: true } | { unit: number } | null

const GOAL_ACT: Record<string, S.JobKind> = { plant: 'plant', walk: 'scout', hill: 'hill', spray: 'spray', sample: 'sample', kill: 'kill', dig: 'dig' }
const COVER_GLYPH: Record<S.Cover, string> = { woods: 'woods', brush: 'brush', stumps: 'stump', open: 'rocks' }

export function seasonScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void; onAlmanac: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, { ...o, show: g => show(target(g)), canShow: g => !!target(g) })
  const crew = h('section', { class: 'crew instrument', 'aria-label': 'People, and the list of orders' })
  const track = tracker(ctx)
  const clockSlot = h('div', { class: 'clock-slot instrument' })
  const notesSlot = h('div', { class: 'notes-slot' })
  const trayHost = h('div', { class: 'tray-host' })
  const paused = h('p', { class: 'paused instrument', testid: 'paused', hidden: true })
  let tray: { el: HTMLElement; field: number; day: number } | null = null

  const openTicket = (lot: number) => ctx.papers.open(ticket(ctx, lot, { fresh: false }))
  const card = commandCard(ctx, { onTray: field => showTray(field), onTicket: openTicket })
  const person = personCard(ctx)
  const yard = yardCard(ctx)
  const grid = workGrid(ctx)
  const incident = incidentCard(ctx)
  notesSlot.append(track.el)
  const el = h('main', { class: 'season' }, top.el, paused, notesSlot, incident.el, grid.el,
    h('div', { class: 'bottom' }, trayHost, card.el, person.el, yard.el, clockSlot, crew))

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

  // When the clock last changed pace and when the last order was given, so the days do not race off under a hand.
  let pacedAt = 0
  let orderedAt = 0
  let frostWarned = -1
  const off = app.on(ev => {
    if (ev.type === 'speed') { pacedAt = performance.now(); setTimeout(() => ctx.dirty(), 4200) }
    else if (ev.type === 'order') { orderedAt = performance.now(); setTimeout(() => ctx.dirty(), 2700) }
    else if (ev.type === 'yard' || ev.type === 'unit') ctx.dirty()
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

  // ------------------------------------------------------------ plates, badges and the nine sentences

  const seen = hintsSeen()
  // first: nothing has been taught yet, so this tip also says how an order is given.
  let hint: { kind: S.JobKind; field: number; at: number; first: boolean } | null = null

  function updateHint(c: S.Campaign): void {
    const needs = app.needs()
    if (hint && (needs[hint.field]?.need?.act !== hint.kind || performance.now() - hint.at > HINT_MS || !app.settings.hints)) hint = null
    if (!hint && app.settings.hints) {
      for (let i = 0; i < needs.length; i++) {
        const act = needs[i].need?.act
        if (!isJob(act) || seen.has(act)) continue
        hint = { kind: act, field: i, at: performance.now(), first: seen.size === 0 }
        // A sentence nobody has time to read teaches nothing.
        if (app.speed > 1) app.setSpeed(1)
        seen.add(act)
        try { localStorage.setItem(HINTS_KEY, JSON.stringify([...seen])) } catch { /* storage blocked: the tip may show again */ }
        ctx.announce(hintText(act))
        setTimeout(() => ctx.dirty(), HINT_MS + 100)
        break
      }
    }
    // The tip sits with the alerts, wearing its badge's glyph, so it never covers a field.
    if (hint) {
      const kind = hint.kind
      const how = hint.first ? ` ${ctx.touch() ? 'Tap' : 'Click'} the lit badge, or right-click the field.` : ''
      ctx.notes.pin({ key: `tip-${kind}`, glyph: kind, text: `${hintText(kind)}${how}`, tile: true, onClose: () => { hint = null; ctx.dirty() } })
    } else if (app.speed === 0 && !S.seasonDone(c) && !c.season!.jobs.length && !needs.some(n => n.need)) {
      // Stopped with nothing to do: the one thing to say is that the days have to run.
      ctx.notes.pin({ key: 'idle', glyph: 'play', text: `Nothing needs doing now. ${ctx.touch() ? 'Run the clock.' : 'Press Space to let the days run.'}` })
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
    if (f.inField >= 0.5) {
      const frost = frostAt[i] ?? 0
      marks.push({ glyph: 'haul', cls: frost >= 30 ? 'bad' : '', n: F.massValue(f.inField) >= 1000 ? `${F.num(F.massValue(f.inField) / 1000, 1)}k` : F.num(F.massValue(f.inField)) })
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
      ? { glyph: need.act as string, label: `${F.localize(need.text)} ${F.localize(need.why)}`, urgent: need.urgent }
      : need && need.act === 'sell' && lot ? { glyph: 'ticket', label: `${F.localize(need.text)} ${F.localize(need.why)}`, urgent: need.urgent } : null
    const key = digitFor(c, i)
    const what = tract ? (f.cover === 'open' ? 'new ground, ready next spring' : f.coverWord) : f.status === 'rest' ? 'resting in oats and clover' : `${f.variety}, ${f.stage.toLowerCase()}`
    return {
      name: f.name,
      glyph: tract ? COVER_GLYPH[f.cover] : stageGlyph(f),
      marks, queue, badge, key, cls: tract ? 'tract' : undefined,
      said: `${f.name}, ${key ? `key ${key}` : f.block === 'home' ? 'the home farm' : 'beyond the home farm'}: ${what}${said.length ? `; ${said.join('; ')}` : ''}${badge ? `. Needs: ${F.localize(need!.text)}` : '.'}`,
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

  const P = plates(ctx, plateLayer, { model: plateModel, onBadge })

  // ------------------------------------------------------------ the yards on the land

  const yardMarks = [S.HOME_YARD, S.DUFOUR_YARD].map(y => {
    const wrap = h('div', { class: 'plate-wrap yard-wrap gone', hidden: true })
    plateLayer.append(wrap)
    return { y, wrap, key: '' }
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
        class: `plate yard${sel ? ' on' : ''}${goalYard === m.y ? ' goal-ring' : ''}`, type: 'button', testid: m.y === S.HOME_YARD ? 'yard-home' : 'yard-dufour', 'aria-pressed': String(sel),
        'aria-label': `${YARD_TITLE[m.y]}${up ? `: ${S.BUILDINGS[up.kind].name.toLowerCase()} going up, ${F.pct(up.done / up.need)} built` : ''}. Build here${ctx.touch() ? '' : ' (Y)'}.`,
        onclick: () => app.selectYard(sel ? 0 : m.y),
      }, h('span', { class: 'plate-in' }, icon('yard', 'ic s plate-glyph'), h('span', { class: 'plate-name' }, name),
        up ? h('span', { class: 'plate-queue' }, icon(BUILD_GLYPH[up.kind], 'ic s active'), h('span', { class: 'num yard-pct' }, F.pct(up.done / up.need))) : null)))
    }
  }

  function placeYards(): void {
    for (const m of yardMarks) {
      if (m.wrap.hidden) continue
      const a = ctx.view.yardAnchor(m.y)
      const ok = a.visible && Number.isFinite(a.x) && Number.isFinite(a.y) && a.y > app.insets.top + 40 && a.y < innerHeight - app.insets.bottom
      m.wrap.classList.toggle('gone', !ok)
      if (ok) m.wrap.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, -100%)`
    }
  }

  // ------------------------------------------------------------ the people bar and the list

  const units = unitBar(ctx, crew, {
    waiting: () => app.campaign ? incident.waiting(app.campaign) : [],
    onIncident: () => incident.open(),
    gridOpen: () => grid.isOpen(),
    onGrid: () => grid.toggle(),
    hireShown: () => { const c = app.campaign; return !!c && (c.crew.length > 1 || c.history.length > 0 || c.season!.fields.some(f => f.plantDay >= 0)) },
    goal: () => { const c = app.campaign; const g = c ? nextGoal(c) : null; return g?.id === 'hire' ? 'hire' : g?.id === 'foreman' ? 'person' : '' },
  })

  // ------------------------------------------------------------ keys

  // Tab walks the fields that need something, Shift-Tab walks back. last: on a plate, so after the end of them the
  // keyboard goes on into the instruments instead of coming round again.
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
    const onPlate = !!plate || !!t.closest?.('.badge')
    const at = plate ? Number(plate.dataset.testid?.split('-')[1]) : -1
    // On the plate of the one selected field, Enter and Space are the game's keys: pressing the plate again would do nothing.
    const onSelected = at >= 0 && app.selection.length === 1 && app.selected === at
    const onControl = !!t.closest?.('button, input, a') && !onSelected
    const k = e.key
    if (k === 'Escape') {
      if (top.escape()) return true
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
      const i = fieldForDigit(c, Number(digit[1]))
      if (i >= 0) { app.select(i, e.shiftKey); if (!ctx.view.fieldAnchor(i).visible) app.focus(i) }
      return true
    }
    if (e.ctrlKey && !KEY_JOB[k.toLowerCase()]) return false
    if (k === '+' || k === '=') { if (!S.seasonDone(c)) { ctx.clock.auto = false; app.setSpeed(Math.min(3, app.speed + 1) as 1 | 2 | 3) } return true }
    if (k === '-' || k === '_') { if (app.speed > 1) { ctx.clock.auto = false; app.setSpeed((app.speed - 1) as 1 | 2) } return true }
    if (k === 'Backspace' || k === 'Delete') {
      const jobs = c.season.jobs.filter(j => j.kind !== 'haul' && j.kind !== 'build')
      const mine = app.selection.length ? jobs.filter(j => app.selection.includes(j.field)) : jobs
      const last = mine[mine.length - 1]
      if (!last) ctx.say('Nothing on the list to take off.')
      else if (ctx.run({ t: 'cancel', id: last.id }).ok) ctx.announce(`${jobText(last)}: taken off the list.`)
      return true
    }
    const low = k.toLowerCase()
    if (low === 'f' && !e.ctrlKey) { if (!S.seasonDone(c)) { ctx.clock.auto = true; app.runUntilNeeded() } return true }
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
      const people = c.crew.length > 1
      const personUp = people && app.unit >= 0 && !app.selection.length && app.yard === 0
      el.classList.toggle('selected', app.selection.length > 0 || personUp || app.yard !== 0)
      el.classList.toggle('tray-up', !!tray)
      el.classList.toggle('low-h', innerHeight < 760)
      // What the goal points at: the field it lights, the yard it rings.
      const g = nextGoal(c)
      const tgt = target(g)
      goalField = tgt && 'field' in tgt ? tgt.field : -1
      frostAt = Object.fromEntries(S.haulInfo(app.world, c).map(x => [x.field, x.frostChance]))
      top.update()
      // On a phone the clock sits by the thumb, with the crew.
      const low = layout === 'narrow' || layout === 'short'
      el.classList.toggle('tight', layout === 'narrow' && innerHeight < 720 && (app.selection.length > 0 || !!tray || personUp || app.yard !== 0))
      clockSlot.hidden = !low
      if (low) patch(clockSlot, JSON.stringify([app.speed, app.running, ctx.clock.auto, S.seasonDone(c), ctx.awaiting, ctx.touch()]), () => clock(ctx, true))
      const now = performance.now()
      const quiet = !app.needs().some(n => n.need && n.need.act !== 'close') && c.season.jobs.length === 0
      if (ctx.clock.auto && app.speed === 1 && quiet && !tray && !incident.isUp() && !S.seasonDone(c) && !ctx.papers.isOpen() && now - pacedAt > 4000 && now - orderedAt > 2500) app.runUntilNeeded()
      const stopped = app.speed === 0 && !S.seasonDone(c)
      paused.hidden = !stopped
      el.classList.toggle('is-paused', stopped)
      if (stopped) patch(paused, String(ctx.touch()), () => [icon('pause', 'ic s'), 'Paused', ctx.touch() ? null : h('span', { class: 'key' }, 'Space')])
      updateHint(c)
      track.update()
      P.update()
      updateYards(c, tgt && 'yard' in tgt ? tgt.yard : 0)
      units.update(c)
      card.update(c)
      person.update(c, personUp)
      yard.update(c)
      if (c.crew.length < 3 && grid.isOpen()) grid.toggle(false)
      grid.update(c)
      incident.update(c)
      el.classList.toggle('incident-up', incident.isUp())
      ctx.notes.limit(low ? 1 : 3)
      ctx.notes.maxAge = layout === 'short' ? 9000 : 0
      ctx.notes.prune(c.season.day)
    },
    insets() {
      const t = top.el.getBoundingClientRect().bottom
      const narrow = ctx.layout() === 'narrow'
      const parts = [crew, clockSlot, card.el, person.el, yard.el, ...(narrow && tray ? [trayHost] : [])]
      const tops = parts.filter(x => x.offsetParent !== null && x.offsetHeight > 0).map(x => x.getBoundingClientRect().top)
      // On an upright phone a row above the instruments is kept for the latest alert, and the contracts, so the land
      // never shifts for them.
      const row = narrow ? 48 + (track.el.hidden ? 0 : track.el.offsetHeight + 4) : 8
      return [t, 0, innerHeight - Math.min(...tops, innerHeight) + row, 0]
    },
    frame: () => { P.frame(); placeYards() },
    dispose() {
      off()
      P.dispose()
      units.dispose()
      for (const m of yardMarks) m.wrap.remove()
    },
  }
}
