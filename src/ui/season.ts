// The season: the land, a plate on each field, and five small instruments.
import * as S from '../sim/index.ts'
import { commandCard } from './card.ts'
import { tracker } from './contracts.ts'
import { EXIT_MS, patch, unname, type Ctx, type Screen } from './core.ts'
import { unitBar } from './crew.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { ticket, trayPaper } from './dig.ts'
import { digitFor, fieldForDigit } from './map.ts'
import { plates, type PlateModel } from './plates.ts'
import { hint as hintText, isJob, isStale, JOB_DOING, JOB_VERB, KEY_JOB, stageGlyph } from './rules.ts'
import { clock, topBar } from './top.ts'

const HINTS_KEY = 'the-county/hints'
const HINT_MS = 45000

function hintsSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HINTS_KEY) ?? '[]') as string[]) } catch { return new Set() }
}

export function seasonScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void; onAlmanac: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const crew = h('section', { class: 'crew instrument', 'aria-label': 'The crews and the list of orders' })
  const track = tracker(ctx)
  const clockSlot = h('div', { class: 'clock-slot instrument' })
  const notesSlot = h('div', { class: 'notes-slot' })
  const trayHost = h('div', { class: 'tray-host' })
  const paused = h('p', { class: 'paused instrument', testid: 'paused', hidden: true })
  let tray: { el: HTMLElement; field: number; day: number } | null = null

  const openTicket = (lot: number) => ctx.papers.open(ticket(ctx, lot, { fresh: false }))
  const card = commandCard(ctx, { onTray: field => showTray(field), onTicket: openTicket })
  notesSlot.append(track.el)
  const el = h('main', { class: 'season' }, top.el, paused, notesSlot, h('div', { class: 'bottom' }, trayHost, card.el, clockSlot, crew))

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
  const off = app.on(ev => {
    if (ev.type === 'speed') { pacedAt = performance.now(); setTimeout(() => ctx.dirty(), 4200) }
    else if (ev.type === 'order') { orderedAt = performance.now(); setTimeout(() => ctx.dirty(), 2700) }
    else if (ev.type === 'events') for (const e of ev.events) if (e.type === 'sample') { const staged = app.speed < 3; void ctx.view.whenShown('sample', e.field).then(() => { if (app.screen === 'season') openTray(e, staged) }) }
  })

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
      const how = hint.first ? ` ${ctx.touch() ? 'Tap' : 'Click'} the lit badge.` : ''
      ctx.notes.pin({ key: `tip-${kind}`, glyph: kind, text: `${hintText(kind)}${how}`, tile: true, onClose: () => { hint = null; ctx.dirty() } })
    } else if (app.speed === 0 && !S.seasonDone(c) && !c.season!.jobs.length && !needs.some(n => n.need)) {
      // Stopped with nothing to do: the one thing to say is that the days have to run.
      ctx.notes.pin({ key: 'idle', glyph: 'play', text: 'Nothing needs doing now. Let the days run.' })
    } else ctx.notes.unpin()
  }

  function plateModel(i: number): PlateModel | null {
    const c = app.campaign!
    const s0 = c.season!
    if (!S.held(c, i)) return null
    const f = S.fieldInfo(c, i)
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
    const waits = S.jobWaits(app.world, c)
    const head = s0.jobs.find(j => !waits[j.id])
    const queue = s0.jobs.filter(j => j.field === i).map(j => ({ glyph: j.kind as string, active: j === head }))
    if (queue.length) said.push(`on the list: ${F.list(s0.jobs.filter(j => j.field === i).map(j => JOB_VERB[j.kind].toLowerCase()))}`)
    const lot = f.lot >= 0 ? c.lots.find(l => l.id === f.lot) : undefined
    const badge = need && isJob(need.act)
      ? { glyph: need.act as string, label: `${F.localize(need.text)} ${F.localize(need.why)}`, urgent: need.urgent }
      : need && need.act === 'sell' && lot ? { glyph: 'ticket', label: `${F.localize(need.text)} ${F.localize(need.why)}`, urgent: need.urgent } : null
    const key = digitFor(c, i)
    return {
      name: f.name,
      glyph: stageGlyph(f),
      marks, queue, badge, key,
      said: `${f.name}, ${key ? `key ${key}` : f.block === 'home' ? 'the home farm' : 'beyond the home farm'}: ${f.status === 'rest' ? 'resting in oats and clover' : `${f.variety}, ${f.stage.toLowerCase()}`}${said.length ? `; ${said.join('; ')}` : ''}${badge ? `. Needs: ${F.localize(need!.text)}` : '.'}`,
      taught: !!hint && !!badge && need?.act === hint.kind,
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

  // ------------------------------------------------------------ the crews and the list

  const units = unitBar(ctx, crew)

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
      if (units.escape()) return true
      if (tray) { closeTray(); return true }
      if (app.selection.length) { app.select(-1); (document.activeElement as HTMLElement | null)?.blur?.(); return true }
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
      const jobs = c.season.jobs
      const mine = app.selection.length ? jobs.filter(j => app.selection.includes(j.field)) : jobs
      const last = mine[mine.length - 1]
      if (!last) ctx.say('Nothing on the list to take off.')
      else if (ctx.run({ t: 'cancel', id: last.id }).ok) ctx.announce(`${JOB_DOING[last.kind]} ${S.FIELD_NAMES[last.field]}: taken off the list.`)
      return true
    }
    const low = k.toLowerCase()
    if (low === 'f' && !e.ctrlKey) { if (!S.seasonDone(c)) { ctx.clock.auto = true; app.runUntilNeeded() } return true }
    const kind = KEY_JOB[low]
    if (kind) { card.give(kind, e.ctrlKey || e.shiftKey); return true }
    return false
  }

  return {
    el,
    notes: notesSlot,
    key,
    update() {
      const c = app.campaign
      if (!c || !c.season) return
      const layout = ctx.layout()
      el.dataset.layout = layout
      el.classList.toggle('selected', app.selection.length > 0)
      el.classList.toggle('tray-up', !!tray)
      top.update()
      // On a phone the clock sits by the thumb, with the crew.
      const low = layout === 'narrow' || layout === 'short'
      el.classList.toggle('tight', layout === 'narrow' && innerHeight < 720 && (app.selection.length > 0 || !!tray))
      clockSlot.hidden = !low
      if (low) patch(clockSlot, JSON.stringify([app.speed, app.running, ctx.clock.auto, S.seasonDone(c), ctx.awaiting, ctx.touch()]), () => clock(ctx, true))
      const now = performance.now()
      const quiet = !app.needs().some(n => n.need && n.need.act !== 'close') && c.season.jobs.length === 0
      if (ctx.clock.auto && app.speed === 1 && quiet && !tray && !S.seasonDone(c) && !ctx.papers.isOpen() && now - pacedAt > 4000 && now - orderedAt > 2500) app.runUntilNeeded()
      const stopped = app.speed === 0 && !S.seasonDone(c)
      paused.hidden = !stopped
      el.classList.toggle('is-paused', stopped)
      if (stopped) patch(paused, String(ctx.touch()), () => [icon('pause', 'ic s'), 'Paused', ctx.touch() ? null : h('span', { class: 'key' }, 'Space')])
      updateHint(c)
      track.update()
      P.update()
      units.update(c)
      card.update(c)
      ctx.notes.limit(low ? 1 : 3)
      ctx.notes.maxAge = layout === 'short' ? 9000 : 0
      ctx.notes.prune(c.season.day)
    },
    insets() {
      const t = top.el.getBoundingClientRect().bottom
      const narrow = ctx.layout() === 'narrow'
      const parts = narrow && tray ? [crew, clockSlot, card.el, trayHost] : [crew, clockSlot, card.el]
      const tops = parts.filter(x => x.offsetParent !== null && x.offsetHeight > 0).map(x => x.getBoundingClientRect().top)
      // On an upright phone a row above the instruments is kept for the latest alert, and the contracts, so the land
      // never shifts for them.
      const row = narrow ? 48 + (track.el.hidden ? 0 : track.el.offsetHeight + 4) : 8
      return [t, 0, innerHeight - Math.min(...tops, innerHeight) + row, 0]
    },
    frame: () => P.frame(),
    dispose() {
      off()
      P.dispose()
      units.dispose()
    },
  }
}
