// The interface: an almanac and ledger laid over the land.
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import '@fontsource-variable/public-sans'
import './style.css'
import './screens.css'
import type { MountHud } from '../game/contracts.ts'
import * as S from '../sim/index.ts'
import { Dialogs, Toasts, type Ctx, type Layout, type Level, type Screen } from './core.ts'
import { h } from './dom.ts'
import { plural, setUnits } from './fmt.ts'
import { lotKey, showSample, showWeighIn } from './dig.ts'
import { titleScreen } from './title.ts'
import { planScreen } from './plan.ts'
import { seasonScreen } from './season.ts'
import { cellarScreen } from './cellar.ts'
import { ledgerScreen, overScreen } from './ledger.ts'

// Events that stop the clock; each gets a toast so the player sees why it stopped.
const STOPS = new Set(['watch', 'blightSeen', 'frost', 'skinSet', 'vinesDead', 'lost', 'freeze', 'dry', 'ti'])
const JOB_KEYS: Record<string, S.JobKind> = { p: 'plant', h: 'hill', c: 'scout', s: 'spray', w: 'water', r: 'rogue', t: 'sample', k: 'kill', d: 'dig' }

// Two rails need about 1200 px. Below that one tabbed panel sits beside the land, or under it where the window is
// tall and narrow. A phone on its side always gets the panel beside the land.
function layoutNow(): Layout {
  const w = innerWidth, h = innerHeight
  if (h <= 500 && w > h) return 'side'
  if (w <= 760 || (w <= 900 && h >= w * 1.15)) return 'phone'
  return w < 1200 ? 'side' : 'wide'
}

// The top bar: everything on one line, one line without the masthead, or two short rows.
function barNow(): string {
  const w = innerWidth, h = innerHeight
  if (h <= 500 && w > h) return 'row'
  return w < 700 ? 'stack' : w < 1100 ? 'row' : 'full'
}

export const mountHud: MountHud = (root, app, view) => {
  root.classList.add('hud')
  const screenLayer = h('div', { class: 'screen-layer' })
  const labels = h('div', { class: 'labels', 'aria-hidden': 'true' })
  const toasts = new Toasts()
  const dialogLayer = h('div', { class: 'dialog-layer' })
  root.replaceChildren(screenLayer, labels, toasts.el, dialogLayer)
  const dialogs = new Dialogs(dialogLayer, [screenLayer, labels])
  const phoneQuery = matchMedia('(max-width: 760px)')
  const touchQuery = matchMedia('(pointer: coarse)')

  let dirty = true
  let held = false
  let heldAt = 0
  let screen: Screen | null = null
  let builtFor = ''

  const ctx: Ctx = {
    app, view, dialogs,
    toast: (text: string, level: Level = 'info') => toasts.show(text, level),
    run(cmd) {
      const r = app.do(cmd)
      if (!r.ok) toasts.show(r.err, 'warn')
      return r
    },
    phone: () => phoneQuery.matches,
    layout: layoutNow,
    touch: () => touchQuery.matches,
    memo: { estimates: [], soilT: 10, digSoilT: {}, lots: {}, seen: [], digEst: {}, digSeen: {}, sampleBefore: {}, keptTold: {} },
    sheet: { tab: app.settings.hints ? 'coach' : 'field', open: true },
    dirty: () => { dirty = true },
  }

  function applySettings(): void {
    setUnits(app.settings.units)
    document.documentElement.classList.toggle('reduce-motion', app.settings.reducedMotion)
  }
  applySettings()

  function frameSize(): void {
    root.dataset.bar = barNow()
    root.classList.toggle('short', innerHeight <= 500)
    // Not much height under the land: the field chips drop their stage line.
    root.classList.toggle('tight', innerHeight <= 500 || (layoutNow() === 'phone' && innerHeight < 700))
    root.classList.toggle('touch', touchQuery.matches)
    toasts.compact = layoutNow() === 'phone' || innerHeight <= 500
  }
  frameSize()

  // Runs after every command, so when a day's events arrive this still holds the day before.
  function remember(): void {
    const c = app.campaign
    if (!c || c.phase !== 'season' || !c.season) return
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const f = S.fieldInfo(c, i)
      ctx.memo.estimates[i] = f.estimate
      if (f.status === 'growing' || f.status === 'dead') ctx.memo.seen[i] = { stunted: f.stunted, stand: f.stand }
      else if (f.status === 'idle' || f.status === 'planted' || f.status === 'rest') ctx.memo.seen[i] = null
    }
    const t = S.today(app.world, c)
    if (t) ctx.memo.soilT = t.soilT
  }

  function shape(): string {
    return `${app.screen === 'title' || !app.campaign ? 'title' : app.screen}|${layoutNow()}`
  }

  function build(): void {
    screen?.dispose?.()
    screenLayer.replaceChildren()
    labels.replaceChildren()
    const kind = app.screen === 'title' || !app.campaign ? 'title' : app.screen
    builtFor = shape()
    root.dataset.layout = layoutNow()
    screen = kind === 'title' ? titleScreen(ctx)
      : kind === 'plan' ? planScreen(ctx, labels)
        : kind === 'season' ? seasonScreen(ctx, labels)
          : kind === 'cellar' ? cellarScreen(ctx)
            : kind === 'ledger' ? ledgerScreen(ctx)
              : overScreen(ctx)
    screenLayer.append(screen.el)
    root.dataset.screen = kind
    resized.disconnect()
    for (const p of screen.el.querySelectorAll('.paper, .rail, .chips')) resized.observe(p)
    dirty = true
  }

  // Panels change size as fonts load and content wraps; the field view must hear about it.
  const resized = new ResizeObserver(() => { dirty = true })
  document.fonts?.ready.then(() => { dirty = true })

  // What the last batch of events already told the player, so a stop is not explained twice.
  let told = new Set<string>()

  function onEvents(events: S.GameEvent[]): void {
    const c = app.campaign
    told = new Set()
    for (const e of events) {
      told.add(e.text)
      if (e.type === 'sample' && c) {
        const before = ctx.memo.estimates[e.field] ?? null
        ctx.memo.sampleBefore[`${c.seed}:${c.year}:${e.field}:${e.day}`] = before
        dialogs.enqueue(showSample(ctx, e, before))
      } else if (e.type === 'dug' && c) {
        const lot = Number(e.data?.lot)
        const found = c.lots.find(l => l.id === lot)
        if (!found) continue
        const key = lotKey(c, lot)
        ctx.memo.digSoilT[key] = ctx.memo.soilT
        ctx.memo.lots[key] = structuredClone(found)
        ctx.memo.digEst[key] = ctx.memo.estimates[e.field] ?? null
        ctx.memo.digSeen[key] = ctx.memo.seen[e.field] ?? null
        dialogs.enqueue(showWeighIn(ctx, lot, true))
      } else if (e.type === 'watch' && c?.season && !c.season.fields.some(f => f.status === 'growing')) {
        toasts.show(`${e.text} Nothing is up yet, so there is nothing to protect.`, e.level)
      } else if (e.level === 'bad' || e.level === 'warn' || STOPS.has(e.type) || e.type === 'sold' || e.type === 'kept') {
        toasts.show(e.text, e.level)
      }
    }
  }

  app.on(e => {
    switch (e.type) {
      case 'screen':
        if (e.screen !== 'season' && e.screen !== 'title') dialogs.closeAll()
        toasts.clear()
        build()
        break
      case 'events':
        onEvents(e.events)
        dirty = true
        break
      case 'change':
        remember()
        dirty = true
        break
      case 'settings':
        applySettings()
        dirty = true
        break
      case 'select':
        if (ctx.layout() !== 'wide' && e.field >= 0) { ctx.sheet.tab = 'field'; ctx.sheet.open = true }
        dirty = true
        break
      case 'saved':
        if (!e.ok) toasts.show('This browser would not store the save. Export it from the menu to keep it.', 'warn')
        break
      case 'speed':
        // The clock stopped itself for something no toast or dialog has explained: say what.
        if (e.speed === 0 && app.pauseReason && !told.has(app.pauseReason)) toasts.show(`The clock stopped: ${app.pauseReason}`, 'info')
        told = new Set()
        dirty = true
        break
    }
  })

  addEventListener('resize', () => { frameSize(); dirty = true })
  touchQuery.addEventListener('change', () => { frameSize(); build() })

  // While a button is pressed its section is not rebuilt, so a click is never lost to a re-render.
  root.addEventListener('pointerdown', () => { held = true; heldAt = performance.now() }, true)
  const release = () => { if (held) { held = false; dirty = true } }
  document.addEventListener('pointerup', release, true)
  document.addEventListener('pointercancel', release, true)

  // A mouse click leaves focus on the button; drop it so Space goes back to pausing the clock.
  root.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button')
    if (b && e.detail > 0 && !b.closest('.dialog')) b.blur()
  })

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target as HTMLElement
    const c = app.campaign
    const inSeason = app.screen === 'season' && !!c && !!c.season
    if (e.key === 'Escape') {
      if (dialogs.isOpen()) { e.preventDefault(); dialogs.closeTop(); return }
      if (app.selected >= 0) { e.preventDefault(); app.select(-1) }
      // Let go of whatever button had the focus, so Space is the clock's again.
      if (inSeason && t.closest('button')) t.blur()
      return
    }
    // 0 stops the clock wherever the focus is, even with a window open.
    if (e.key === '0' && inSeason && !t.closest('input:not([type="radio"]):not([type="checkbox"]), select, textarea, [contenteditable]')) {
      e.preventDefault()
      app.setSpeed(0)
      return
    }
    if (dialogs.isOpen()) return
    if (t.closest('input, select, textarea, [contenteditable]')) return
    if (!inSeason || !c) return
    const onButton = t.closest('button') !== null
    const k = e.key
    if (k === ' ' && !onButton) { e.preventDefault(); app.togglePause(); return }
    if (k >= '1' && k <= '3') { e.preventDefault(); app.setSpeed(Number(k) as 1 | 2 | 3); return }
    if (k === '[' || k === ']' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault()
      const step = k === '[' || k === 'ArrowLeft' ? -1 : 1
      const n = S.FIELD_COUNT
      app.select(app.selected < 0 ? (step > 0 ? 0 : n - 1) : (app.selected + step + n) % n)
      return
    }
    const kind = JOB_KEYS[k.toLowerCase()]
    // With Shift the job goes to every field that can take it.
    if (kind && e.shiftKey) {
      e.preventDefault()
      const fields = Array.from({ length: S.FIELD_COUNT }, (_, i) => i).filter(i => S.jobBlock(c, kind, i) === '')
      for (const i of fields) app.do({ t: 'job', kind, field: i })
      toasts.show(fields.length ? `On the work list: ${S.JOB_LABEL[kind].toLowerCase()} in ${plural(fields.length, 'field')}.` : `${S.JOB_LABEL[kind]}: no field can take it now.`, fields.length ? 'info' : 'warn')
      return
    }
    if (kind) {
      e.preventDefault()
      if (app.selected < 0) { toasts.show('Choose a field first: [ and ] step through them.', 'info'); return }
      const r = app.do({ t: 'job', kind, field: app.selected })
      toasts.show(r.ok ? `On the work list: ${S.JOB_LABEL[kind].toLowerCase()} ${S.FIELD_NAMES[app.selected]}.` : `${S.JOB_LABEL[kind]} ${S.FIELD_NAMES[app.selected]}: ${r.err}`, r.ok ? 'info' : 'warn')
    }
  })

  build()

  return {
    frame(dt: number) {
      if (shape() !== builtFor) build()
      if (held && performance.now() - heldAt > 1500) held = false
      if (dirty && !held && screen) {
        dirty = false
        screen.update()
        const [t, r, b, l] = screen.insets().map(x => Math.max(0, Math.round(x)))
        app.setInsets(t, r, b, l)
        toasts.place(t, r, l)
      }
      screen?.frame?.(dt)
    },
    dispose() {
      screen?.dispose?.()
      root.replaceChildren()
    },
  }
}
