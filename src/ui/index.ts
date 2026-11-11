// The interface: an almanac and ledger laid over the land.
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import '@fontsource-variable/public-sans'
import './style.css'
import './screens.css'
import type { MountHud } from '../game/contracts.ts'
import * as S from '../sim/index.ts'
import { Dialogs, Toasts, type Ctx, type Level, type Screen } from './core.ts'
import { h } from './dom.ts'
import { setUnits } from './fmt.ts'
import { lotKey, showSample, showWeighIn } from './dig.ts'
import { titleScreen } from './title.ts'
import { planScreen } from './plan.ts'
import { seasonScreen } from './season.ts'
import { cellarScreen } from './cellar.ts'
import { ledgerScreen, overScreen } from './ledger.ts'

// Events that stop the clock; each gets a toast so the player sees why it stopped.
const STOPS = new Set(['watch', 'blightSeen', 'frost', 'skinSet', 'vinesDead', 'lost', 'freeze', 'dry', 'ti'])
const JOB_KEYS: Record<string, S.JobKind> = { p: 'plant', h: 'hill', c: 'scout', s: 'spray', w: 'water', r: 'rogue', t: 'sample', k: 'kill', d: 'dig' }

export const mountHud: MountHud = (root, app, view) => {
  root.classList.add('hud')
  const screenLayer = h('div', { class: 'screen-layer' })
  const labels = h('div', { class: 'labels', 'aria-hidden': 'true' })
  const toasts = new Toasts()
  const dialogLayer = h('div', { class: 'dialog-layer' })
  root.replaceChildren(screenLayer, labels, toasts.el, dialogLayer)
  const dialogs = new Dialogs(dialogLayer, [screenLayer, labels])
  const phoneQuery = matchMedia('(max-width: 760px)')

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
    memo: { estimates: [], soilT: 10, digSoilT: {}, lots: {} },
    sheet: { tab: app.settings.hints ? 'coach' : 'field', open: true },
    dirty: () => { dirty = true },
  }

  function applySettings(): void {
    setUnits(app.settings.units)
    document.documentElement.classList.toggle('reduce-motion', app.settings.reducedMotion)
  }
  applySettings()

  // Runs after every command, so when a day's events arrive this still holds the day before.
  function remember(): void {
    const c = app.campaign
    if (!c || c.phase !== 'season' || !c.season) return
    for (let i = 0; i < S.FIELD_COUNT; i++) ctx.memo.estimates[i] = S.fieldInfo(c, i).estimate
    const t = S.today(app.world, c)
    if (t) ctx.memo.soilT = t.soilT
  }

  function build(): void {
    screen?.dispose?.()
    screenLayer.replaceChildren()
    labels.replaceChildren()
    const kind = app.screen === 'title' || !app.campaign ? 'title' : app.screen
    builtFor = `${kind}|${phoneQuery.matches ? 'phone' : 'wide'}`
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

  function onEvents(events: S.GameEvent[]): void {
    const c = app.campaign
    for (const e of events) {
      if (e.type === 'sample') {
        const before = ctx.memo.estimates[e.field] ?? null
        dialogs.enqueue(showSample(ctx, e, before))
      } else if (e.type === 'dug' && c) {
        const lot = Number(e.data?.lot)
        const found = c.lots.find(l => l.id === lot)
        if (!found) continue
        ctx.memo.digSoilT[lotKey(c, lot)] = ctx.memo.soilT
        ctx.memo.lots[lotKey(c, lot)] = structuredClone(found)
        dialogs.enqueue(showWeighIn(ctx, lot))
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
        if (ctx.phone() && e.field >= 0) { ctx.sheet.tab = 'field'; ctx.sheet.open = true }
        dirty = true
        break
      case 'saved':
        if (!e.ok) toasts.show('This browser would not store the save. Export it from the menu to keep it.', 'warn')
        break
      case 'speed':
        dirty = true
        break
    }
  })

  phoneQuery.addEventListener('change', () => build())
  addEventListener('resize', () => { dirty = true })

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
    if (e.key === 'Escape') {
      if (dialogs.isOpen()) { e.preventDefault(); dialogs.closeTop(); return }
      if (app.selected >= 0) { e.preventDefault(); app.select(-1) }
      return
    }
    if (dialogs.isOpen()) return
    const t = e.target as HTMLElement
    if (t.closest('input, select, textarea, [contenteditable]')) return
    const c = app.campaign
    if (app.screen !== 'season' || !c || !c.season) return
    const onButton = t.closest('button') !== null
    const k = e.key
    if (k === ' ' && !onButton) { e.preventDefault(); app.togglePause(); return }
    if (k >= '0' && k <= '3') { e.preventDefault(); app.setSpeed(Number(k) as 0 | 1 | 2 | 3); return }
    if (k === '[' || k === ']' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault()
      const step = k === '[' || k === 'ArrowLeft' ? -1 : 1
      const n = S.FIELD_COUNT
      app.select(app.selected < 0 ? (step > 0 ? 0 : n - 1) : (app.selected + step + n) % n)
      return
    }
    const kind = JOB_KEYS[k.toLowerCase()]
    if (kind && !e.shiftKey) {
      e.preventDefault()
      if (app.selected < 0) { toasts.show('Choose a field first: [ and ] step through them.', 'info'); return }
      const r = app.do({ t: 'job', kind, field: app.selected })
      toasts.show(r.ok ? `On the work list: ${S.JOB_LABEL[kind].toLowerCase()} ${S.FIELD_NAMES[app.selected]}.` : `${S.JOB_LABEL[kind]} ${S.FIELD_NAMES[app.selected]}: ${r.err}`, r.ok ? 'info' : 'warn')
    }
  })

  build()

  return {
    frame(dt: number) {
      if (`${app.screen === 'title' || !app.campaign ? 'title' : app.screen}|${phoneQuery.matches ? 'phone' : 'wide'}` !== builtFor) build()
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
