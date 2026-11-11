// The season: the land, a plate on each field, and five small instruments.
import * as S from '../sim/index.ts'
import { commandCard } from './card.ts'
import { gauge, patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { ticket, trayPaper } from './dig.ts'
import { plates, type PlateModel } from './plates.ts'
import { hint as hintText, JOB_DOING, JOB_VERB, KEY_JOB, stageGlyph } from './rules.ts'
import { clock, topBar } from './top.ts'

const HINTS_KEY = 'the-county/hints'
const HINT_MS = 45000

function isJob(act: S.Advice['act'] | undefined): act is S.JobKind {
  return !!act && act !== 'wait' && act !== 'sell' && act !== 'close'
}

function hintsSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HINTS_KEY) ?? '[]') as string[]) } catch { return new Set() }
}

export function seasonScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void; onAlmanac: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const crew = h('section', { class: 'crew instrument', 'aria-label': 'The crew and its list' })
  const clockSlot = h('div', { class: 'clock-slot instrument' })
  const notesSlot = h('div', { class: 'notes-slot' })
  const trayHost = h('div', { class: 'tray-host' })
  const paused = h('p', { class: 'paused instrument', testid: 'paused', hidden: true })
  let tray: { el: HTMLElement; field: number; day: number } | null = null

  const openTicket = (lot: number) => ctx.papers.open(ticket(ctx, lot, { fresh: false }))
  const card = commandCard(ctx, { onTray: field => showTray(field), onTicket: openTicket })
  const el = h('main', { class: 'season' }, top.el, paused, notesSlot, h('div', { class: 'bottom' }, trayHost, card.el, clockSlot, crew))

  // ------------------------------------------------------------ the test-dig tray

  function closeTray(): void {
    if (!tray) return
    const old = tray.el
    tray = null
    if (ctx.reduced()) old.remove()
    else { old.classList.add('out'); setTimeout(() => old.remove(), 160) }
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

  const off = app.on(ev => {
    if (ev.type !== 'events') return
    for (const e of ev.events) if (e.type === 'sample') openTray(e, app.speed < 3)
  })

  // ------------------------------------------------------------ plates, badges and the nine sentences

  const seen = hintsSeen()
  let hint: { kind: S.JobKind; field: number; at: number } | null = null

  function updateHint(): void {
    const needs = app.needs()
    if (hint && (needs[hint.field]?.need?.act !== hint.kind || performance.now() - hint.at > HINT_MS || !app.settings.hints)) hint = null
    if (hint || !app.settings.hints) return
    for (let i = 0; i < needs.length; i++) {
      const act = needs[i].need?.act
      if (!isJob(act) || seen.has(act)) continue
      hint = { kind: act, field: i, at: performance.now() }
      seen.add(act)
      try { localStorage.setItem(HINTS_KEY, JSON.stringify([...seen])) } catch { /* storage blocked: the tip may show again */ }
      ctx.announce(hintText(act))
      setTimeout(() => ctx.dirty(), HINT_MS + 100)
      return
    }
  }

  function plateModel(i: number): PlateModel {
    const c = app.campaign!
    const s0 = c.season!
    const f = S.fieldInfo(c, i)
    const need = app.needs()[i]?.need ?? null
    const live = f.status === 'growing' || f.status === 'planted'
    const marks: PlateModel['marks'] = []
    const said: string[] = []
    if (live && (f.moistureLabel === 'dry' || f.moistureLabel === 'wilting')) { marks.push({ glyph: 'dry', cls: f.moistureLabel === 'wilting' ? 'bad' : 'warn' }); said.push(`soil ${f.moistureLabel}`) }
    if (f.blightHills > 0 && (live || f.status === 'dead')) {
      const stale = f.scoutAge < 0 || f.scoutAge >= 7
      marks.push({ glyph: stale ? 'blight-old' : 'blight', cls: 'bad' })
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
    return {
      name: f.name,
      glyph: stageGlyph(f),
      marks, queue, badge,
      said: `${f.name}, field ${i + 1}: ${f.status === 'rest' ? 'resting in oats and clover' : `${f.variety}, ${f.stage.toLowerCase()}`}${said.length ? `; ${said.join('; ')}` : ''}${badge ? `. Needs: ${F.localize(need!.text)}` : '.'}`,
      hint: hint && hint.field === i ? { text: hintText(hint.kind), onClose: () => { hint = null; ctx.dirty() } } : undefined,
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

  // ------------------------------------------------------------ the crew and its queue

  let expanded = false
  let pop = -1
  const closePop = (e: Event) => {
    if ((pop >= 0 || expanded) && !(e.target as HTMLElement).closest?.('.crew')) { pop = -1; expanded = false; ctx.dirty() }
  }
  document.addEventListener('pointerdown', closePop, true)

  function cancel(id: number): void { pop = -1; ctx.run({ t: 'cancel', id }) }
  function bump(id: number): void { pop = -1; ctx.run({ t: 'bump', id }) }

  function updateCrew(c: S.Campaign): void {
    const s0 = c.season!
    const waits = S.jobWaits(app.world, c)
    const jobs = s0.jobs
    const head = jobs.find(j => !waits[j.id]) ?? null
    const layout = ctx.layout()
    const room = layout === 'narrow' ? Math.max(2, Math.floor((innerWidth - 16 - 148 - 56) / 46)) : layout === 'short' ? 4 : 8
    const all = expanded || jobs.length <= room
    const list = all ? jobs : jobs.slice(0, room - 1)
    const now = s0.frozen ? 'The ground has frozen' : !jobs.length ? 'Crew idle'
      : head ? `${JOB_DOING[head.kind]} ${S.FIELD_NAMES[head.field]}` : `Waiting: ${waits[jobs[0].id]}`
    const touch = ctx.touch()
    const model = { j: jobs.map(j => [j.id, j.kind, j.field, Math.round(j.done / j.need * 20), waits[j.id]]), now, expanded, pop, layout, room, touch }
    crew.classList.toggle('busy', jobs.length > 0)
    patch(crew, JSON.stringify(model), () => [
      h('p', { class: 'crew-now', testid: 'crew-now' },
        icon(head ? head.kind : jobs.length ? 'stale' : 'tractor'),
        h('span', { class: 'crew-text' }, now),
        head && head.done > 0 ? gauge(head.done / head.need, { label: `${JOB_DOING[head.kind]} ${S.FIELD_NAMES[head.field]}`, text: `${F.pct(head.done / head.need)} done` }) : null),
      jobs.length ? h('ol', { class: `queue${expanded ? ' all' : ''}`, 'aria-label': 'Orders, in the order the crew takes them' }, list.map((j, k) => {
        const what = `${JOB_DOING[j.kind]} ${S.FIELD_NAMES[j.field]}`
        const lockDig = j.kind === 'dig' && j.done > 0
        return h('li', { class: 'q-item', k: `q-${j.id}` },
          h('button', {
            class: `q${j === head ? ' active' : ''}${waits[j.id] ? ' waiting' : ''}`, type: 'button', testid: `queue-${j.id}`, 'aria-expanded': touch ? String(pop === j.id) : null,
            'aria-label': `${what}${waits[j.id] ? `, waiting: ${waits[j.id]}` : j.done > 0 ? `, ${F.pct(j.done / j.need)} done` : ''}. ${touch ? 'Tap for its choices.' : `Click to cancel${k > 0 ? '; Ctrl-click to do it first' : ''}.`}`,
            title: touch ? undefined : `${what}${waits[j.id] ? ` (waiting: ${waits[j.id]})` : ''}. Click to cancel${k > 0 ? ', Ctrl-click to do it first' : ''}`,
            onclick: (e: Event) => {
              const m = e as MouseEvent
              if (m.ctrlKey || m.metaKey) bump(j.id)
              else if (touch) { pop = pop === j.id ? -1 : j.id; ctx.dirty() }
              else cancel(j.id)
            },
            oncontextmenu: (e: Event) => { e.preventDefault(); bump(j.id) },
            onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse') app.setHover(j.field) },
            onpointerleave: () => { if (app.hover === j.field) app.setHover(-1) },
          }, icon(j.kind), h('span', { class: 'q-n num' }, String(j.field + 1))),
          !touch && k > 0 ? h('button', { class: 'q-first', type: 'button', testid: `queue-first-${j.id}`, 'aria-label': `Do ${what.toLowerCase()} first`, title: 'Do it first', onclick: () => bump(j.id) }, icon('first', 'ic s')) : null,
          touch && pop === j.id ? h('div', { class: 'q-pop', role: 'group', 'aria-label': what },
            h('span', { class: 'q-pop-title' }, what),
            k > 0 ? h('button', { class: 'nbtn', type: 'button', testid: `queue-first-${j.id}`, onclick: () => bump(j.id) }, icon('first', 'ic s'), 'First') : null,
            h('button', { class: 'nbtn', type: 'button', testid: `queue-cancel-${j.id}`, disabled: lockDig, onclick: () => cancel(j.id) }, icon('close', 'ic s'), 'Cancel')) : null)
      }),
      jobs.length > room ? h('li', { class: 'q-item' }, h('button', {
        class: 'q more', type: 'button', testid: 'queue-more', 'aria-expanded': String(expanded), 'aria-label': expanded ? 'Show fewer orders' : `Show all ${jobs.length} orders`,
        onclick: () => { expanded = !expanded; ctx.dirty() },
      }, expanded ? icon('back') : h('span', { class: 'num' }, `+${jobs.length - list.length}`))) : null) : null,
    ])
  }

  // ------------------------------------------------------------ keys

  function nextNeed(): boolean {
    const needs = app.needs()
    const want = needs.map((n, i) => (n.need && n.need.act !== 'close' ? i : -1)).filter(i => i >= 0)
    if (!want.length) return false
    const next = want.find(i => i > app.selected) ?? want[0]
    app.select(next)
    app.focus(next)
    const n = needs[next].need!
    ctx.announce(`${S.FIELD_NAMES[next]} selected. ${F.localize(n.text)} ${F.localize(n.why)} Enter gives the order.`)
    return true
  }

  function key(e: KeyboardEvent): boolean {
    if (e.altKey || e.metaKey) return false
    const c = app.campaign
    if (!c || !c.season) return false
    const t = e.target as HTMLElement
    const onPlate = !!t.closest?.('.plate, .badge')
    const onControl = !!t.closest?.('button, input, a')
    const k = e.key
    if (k === 'Escape') {
      if (pop >= 0 || expanded) { pop = -1; expanded = false; ctx.dirty(); return true }
      if (tray) { closeTray(); return true }
      if (app.selection.length) { app.select(-1); (document.activeElement as HTMLElement | null)?.blur?.(); return true }
      return false
    }
    if (k === 'Tab') {
      if (e.shiftKey || e.ctrlKey || (onControl && !onPlate)) return false
      if (!nextNeed()) return false
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      return true
    }
    if (k === 'Enter' || k === ' ') {
      if (onControl || e.ctrlKey) return false
      if (k === ' ') app.togglePause()
      else card.suggested()
      return true
    }
    const digit = /^(?:Digit|Numpad)([1-6])$/.exec(e.code)
    if (digit && !e.ctrlKey) { app.select(Number(digit[1]) - 1, e.shiftKey); return true }
    if (e.ctrlKey && !KEY_JOB[k.toLowerCase()]) return false
    if (k === '+' || k === '=') { if (!S.seasonDone(c)) app.setSpeed(Math.min(3, app.speed + 1) as 1 | 2 | 3); return true }
    if (k === '-' || k === '_') { if (app.speed > 1) app.setSpeed((app.speed - 1) as 1 | 2); return true }
    if (k === 'Backspace' || k === 'Delete') {
      const jobs = c.season.jobs
      const mine = app.selection.length ? jobs.filter(j => app.selection.includes(j.field)) : jobs
      const last = mine[mine.length - 1]
      if (!last) ctx.say('Nothing on the list to take off.')
      else if (ctx.run({ t: 'cancel', id: last.id }).ok) ctx.announce(`${JOB_DOING[last.kind]} ${S.FIELD_NAMES[last.field]}: taken off the list.`)
      return true
    }
    const low = k.toLowerCase()
    if (low === 'f' && !e.ctrlKey) { if (!S.seasonDone(c)) app.runUntilNeeded(); return true }
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
      if (low) patch(clockSlot, JSON.stringify([app.speed, app.running, S.seasonDone(c), ctx.touch()]), () => clock(ctx, true))
      const stopped = app.speed === 0 && !S.seasonDone(c)
      paused.hidden = !stopped
      el.classList.toggle('is-paused', stopped)
      if (stopped) patch(paused, String(ctx.touch()), () => [icon('pause', 'ic s'), 'Paused', ctx.touch() ? null : h('span', { class: 'key' }, 'Space')])
      updateHint()
      P.update()
      updateCrew(c)
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
      // On an upright phone a row above the instruments is kept for the latest alert, so the land never shifts for it.
      return [t, 0, innerHeight - Math.min(...tops, innerHeight) + (narrow ? 44 : 8), 0]
    },
    frame: () => P.frame(),
    dispose() {
      off()
      P.dispose()
      document.removeEventListener('pointerdown', closePop, true)
    },
  }
}
