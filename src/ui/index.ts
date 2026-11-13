// The interface: the farm's own papers over the land (src/ui/system), and the screens built from them.
import './system/system.css'
import './system/game.css'
import './system/sheets.css'
import './system/ticket.css'
import './system/book.css'
import './style.css'
import './legacy.css'
import './papers.css'
import './screens.css'
import type { MountHud } from '../game/contracts.ts'
import * as S from '../sim/index.ts'
import { openAlmanac } from './almanac.ts'
import { cellarScreen } from './cellar.ts'
import { EXIT_MS, layoutNow, Notes, Papers, unname, type Ctx, type Level, type Screen } from './core.ts'
import { lotKey, ticket } from './dig.ts'
import { h } from './dom.ts'
import { mountSprites } from './icons.ts'
import { setUnits } from './fmt.ts'
import { openHelp } from './help.ts'
import { ledgerScreen, overScreen } from './ledger.ts'
import { openMenu } from './menu.ts'
import { planScreen } from './plan.ts'
import { alertShort, countYearsFrom, firstName } from './rules.ts'
import { seasonScreen } from './season.ts'
import { titleScreen } from './title.ts'
import { guidedYear, HOLD, mountGuide, openGuide, quietAlert } from './tutorial.ts'
import { mountTies } from './tie.ts'
import { whois } from './whois.ts'
// Last, after every screen's own stylesheet: the control rule fitted to the live game.
import './system/weight.css'

// What someone sent to a field by a right-click is going to do there: "Ruth will scout North Ridge."
const SENT: Record<S.JobKind, string> = {
  plant: 'plant', hill: 'hill', scout: 'scout', spray: 'spray', water: 'water', rogue: 'rogue', sample: 'do a test dig in',
  kill: 'kill the vines in', dig: 'dig', fell: 'fell the trees in', rocks: 'pick rocks in', brush: 'cut brush around',
  build: 'build in', haul: 'haul the crop in from',
}

export const mountHud: MountHud = (root, app, view, sound) => {
  mountSprites()
  root.classList.add('hud', 'waiting')
  const plateLayer = h('div', { class: 'plate-layer' })
  const screenLayer = h('div', { class: 'screen-layer' })
  const floating = h('div', { class: 'notes-slot floating' })
  const paperLayer = h('div', { class: 'paper-layer' })
  const whoLayer = h('div', { class: 'who-layer' })
  const guideLayer = h('div', { class: 'guide-layer' })
  const notes = new Notes()
  root.replaceChildren(plateLayer, screenLayer, floating, whoLayer, notes.liveRegion, paperLayer, guideLayer)
  const papers = new Papers(paperLayer, [screenLayer, plateLayer, floating], app)
  const touchQuery = matchMedia('(pointer: coarse)')

  let dirty = true
  let held = false
  let heldAt = 0
  let screen: Screen | null = null
  let sinceTick = 0
  // The line that says why the game paused itself, taken down once it runs again.
  let pauseSaid = ''

  const ctx: Ctx = {
    app, view, papers, notes,
    say: (text: string, level: Level = 'info') => notes.push({ text, level, ttl: level === 'bad' ? 12000 : level === 'warn' ? 9000 : 6000 }),
    announce: (text: string) => { notes.liveRegion.textContent = text },
    cue: (id: string) => sound?.cue?.(id),
    run(cmd) {
      const r = app.do(cmd)
      if (!r.ok) notes.push({ text: r.err, level: 'warn', ttl: 9000 })
      return r
    },
    layout: layoutNow,
    touch: () => touchQuery.matches,
    reduced: () => app.settings.reducedMotion,
    awaiting: 0,
    memo: { estimates: [], soilT: 10, digSoilT: {}, lots: {}, seen: [], digEst: {}, digSeen: {}, sampleBefore: {} },
    dirty: () => { dirty = true },
  }

  notes.onGo = field => { app.select(field); app.focus(field) }
  const tying = mountTies(ctx, root)
  const who = whois(ctx, whoLayer)

  const menu = () => openMenu(ctx, { onHelp: () => openHelp(ctx), onAlmanac: () => openAlmanac(ctx), onGuide: () => openGuide(ctx) })
  const almanac = () => openAlmanac(ctx)

  function applySettings(): void {
    setUnits(app.settings.units)
    document.documentElement.classList.toggle('reduce-motion', app.settings.reducedMotion)
  }
  applySettings()

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

  // A screen change is one movement: the old instruments leave, the land moves, the new ones arrive.
  function build(): void {
    if (app.campaign) countYearsFrom(app.campaign)
    const old = screen
    const oldEl = old?.el
    old?.dispose?.()
    const kind = app.screen === 'title' || !app.campaign ? 'title' : app.screen
    screen = kind === 'title' ? titleScreen(ctx, { onMenu: menu, onHelp: () => openHelp(ctx) })
      : kind === 'plan' ? planScreen(ctx, plateLayer, { onMenu: menu })
        : kind === 'season' ? seasonScreen(ctx, plateLayer, { onMenu: menu, onAlmanac: almanac })
          : kind === 'cellar' ? cellarScreen(ctx, { onMenu: menu })
            : kind === 'ledger' ? ledgerScreen(ctx, { onMenu: menu })
              : overScreen(ctx, { onMenu: menu })
    if (oldEl && !ctx.reduced()) {
      oldEl.classList.add('leaving')
      oldEl.inert = true
      // For its last moment the old screen is only a picture: nothing in it can be found or focused.
      if (oldEl.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
      unname(oldEl)
      setTimeout(() => oldEl.remove(), EXIT_MS)
      screen.el.classList.add('arriving')
    } else oldEl?.remove()
    screenLayer.append(screen.el)
    ;(screen.notes ?? floating).append(notes.el)
    root.dataset.screen = kind
    resized.disconnect()
    for (const p of screen.el.children) resized.observe(p)
    dirty = true
  }

  // Instruments change size as fonts load and content wraps; the field view must hear about it.
  const resized = new ResizeObserver(() => { dirty = true })
  document.fonts?.ready.then(() => { dirty = true })

  function onEvents(events: S.GameEvent[]): void {
    const c = app.campaign
    if (!c) return
    for (const e of events) {
      if (e.type === 'sample') {
        ctx.memo.sampleBefore[`${c.seed}:${c.year}:${e.field}:${e.day}`] = ctx.memo.estimates[e.field] ?? null
      } else if (e.type === 'dug') {
        // What was known before the digger went in; the ticket itself waits for the last barrel to be weighed.
        const key = lotKey(c, Number(e.data?.lot))
        ctx.memo.digSoilT[key] = ctx.memo.soilT
        ctx.memo.digEst[key] = ctx.memo.estimates[e.field] ?? null
        ctx.memo.digSeen[key] = ctx.memo.seen[e.field] ?? null
      } else if (e.type === 'weighed') {
        const lot = Number(e.data?.lot)
        const found = c.lots.find(l => l.id === lot)
        if (!found) continue
        const key = lotKey(c, lot)
        ctx.memo.lots[key] = structuredClone(found)
        const staged = app.speed < 3
        ctx.awaiting++
        void view.whenShown('dig', e.field).then(() => {
          ctx.awaiting--
          const spec = app.campaign === c && app.screen === 'season' ? ticket(ctx, lot, { fresh: true, staged }) : null
          if (spec) papers.enqueue(spec)
          dirty = true
        })
      }
    }
  }

  app.on(e => {
    if (app.campaign) countYearsFrom(app.campaign)
    switch (e.type) {
      case 'screen':
        papers.closeAll()
        notes.clear()
        build()
        break
      case 'events':
        onEvents(e.events)
        dirty = true
        break
      case 'alert': {
        const a = e.alert
        // The tray and the ticket speak for themselves, and a clean walk shows on the field's own card.
        if (app.screen !== 'season' || a.type === 'sample' || a.type === 'weighed' || (a.type === 'scout' && a.level !== 'bad')) break
        // In the guided first year the guide speaks: news that asks nothing goes to the almanac's diary alone, but for
        // a kind of notice the guide has explained once, which then comes as a toast. A player who asked to be paused
        // on alerts is shown what paused the game.
        if (quietAlert(app.campaign, a.type, a.level) && !app.settings.pauseOnAlerts) break
        const short = alertShort(a)
        // Frost over barrels names no one field: the note goes to the biggest haul, where the barrels and the hauler show.
        const field = a.type === 'frostBarrels' && app.campaign ? S.haulInfo(app.world, app.campaign).sort((x, y) => y.cwt - x.cwt)[0]?.field ?? -1 : a.field
        notes.push({ level: a.level, glyph: short.glyph, text: short.text, full: a.text, field, day: a.day, go: screen?.goFor?.(a) })
        break
      }
      case 'change':
        remember()
        dirty = true
        break
      case 'settings':
        applySettings()
        dirty = true
        break
      case 'select':
      case 'unit':
      case 'inspect':
        dirty = true
        break
      case 'notice':
        notes.push({ text: e.text, level: 'info', ttl: 7000 })
        break
      case 'saved':
        if (!e.ok) notes.push({ text: 'This browser couldn\'t save your game. Export it from the menu to keep it.', level: 'warn', ttl: 12000 })
        break
      case 'speed': {
        // The clock stopped itself for something nothing on screen has said: say what. A card that needs an answer
        // says so itself, and a line queued behind it would only show once it had been answered.
        const c = app.campaign
        if (e.speed > 0 && pauseSaid) { notes.forget(pauseSaid); pauseSaid = '' }
        if (e.speed === 0 && app.holding) ctx.announce(app.pauseReason)
        else if (e.speed === 0 && app.pauseReason && app.pauseReason !== HOLD && !guidedYear(c) && app.screen === 'season' && c && !S.seasonDone(c) && !papers.isOpen() && !notes.has(app.pauseReason)) {
          pauseSaid = `Paused: ${app.pauseReason}`
          notes.push({ text: pauseSaid, level: 'info', ttl: 9000 })
        }
        dirty = true
        break
      }
      case 'sent': {
        const u = app.campaign?.crew.find(x => x.id === e.unit)
        if (u) notes.push({ text: `${u.kind === 'farmer' ? 'You\'ll' : `${firstName(u.name)} will`} ${SENT[e.kind]} ${S.placeName(e.field)}.`, level: 'info', ttl: 7000 })
        break
      }
    }
  })

  addEventListener('resize', () => { dirty = true })
  touchQuery.addEventListener('change', () => { dirty = true })

  // While a button is pressed its section is not rebuilt, so a click is never lost to a re-render.
  root.addEventListener('pointerdown', () => { held = true; heldAt = performance.now() }, true)
  const release = () => { if (held) { held = false; dirty = true } }
  document.addEventListener('pointerup', release, true)
  document.addEventListener('pointercancel', release, true)

  // A mouse click leaves focus on the button; drop it so Space goes back to the clock. A control that names a sound
  // (data-sound: every major one does) has it asked of the sound, which plays the cues it knows.
  root.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button')
    const cue = (e.target as HTMLElement).closest<HTMLElement>('[data-sound]')?.dataset.sound
    if (cue) ctx.cue(cue)
    if (b && e.detail > 0 && !b.closest('.dialog')) b.blur()
  })

  document.addEventListener('keydown', e => {
    const t = e.target as HTMLElement
    if (e.key === 'Escape') {
      if (papers.isOpen()) { e.preventDefault(); papers.closeTop(); return }
      if (who.escape()) { e.preventDefault(); return }
      if (screen?.key?.(e)) { e.preventDefault(); return }
      if (performance.now() - papers.closedAt < 1500) { e.preventDefault(); return }
      if (app.screen !== 'title' && app.campaign) { e.preventDefault(); menu() }
      return
    }
    // A paper on its way out no longer takes keys; only a second Escape waits for it to be gone.
    if (papers.top()) return
    if (screen?.key?.(e)) { e.preventDefault(); return }
    if (e.ctrlKey || e.metaKey || e.altKey || t.closest?.('input')) return
    const k = e.key.toLowerCase()
    if (k === 'm' && app.screen !== 'title' && app.campaign) { e.preventDefault(); menu() }
    else if (k === 'i' && app.screen === 'season') { e.preventDefault(); almanac() }
  })

  build()
  const guided = mountGuide(ctx, guideLayer)
  // Until the land can be drawn the name stands alone, where the title will set it; then the ground gives way to the land.
  const splash = document.getElementById('splash')
  const splashName = splash?.querySelector<HTMLElement>('.splash-name')
  let waiting = true
  function placeSplash(): void {
    const name = root.querySelector('.title-name')
    if (!splashName || !name) return
    const r = name.getBoundingClientRect()
    splashName.style.left = `${r.left}px`
    splashName.style.top = `${r.top}px`
    splashName.style.bottom = 'auto'
  }
  void view.ready.then(() => {
    waiting = false
    placeSplash()
    root.classList.remove('waiting')
    if (!splash) return
    splash.classList.add('gone')
    setTimeout(() => splash.remove(), 700)
  })

  return {
    frame(dt: number) {
      if (held && performance.now() - heldAt > 1500) held = false
      sinceTick += dt
      guided.frame(dt)
      notes.hush(papers.isOpen() || !!app.holding)
      if (sinceTick > 500) { sinceTick = 0; if (notes.count()) notes.prune(app.campaign?.season && app.screen === 'season' ? app.campaign.season.day : -1) }
      if (dirty && !held && screen) {
        dirty = false
        root.dataset.layout = layoutNow()
        root.classList.toggle('touch', touchQuery.matches)
        screen.update()
        who.update()
        // One voice: no toast under a card that wants an answer.
        root.classList.toggle('voice', !!root.querySelector('.screen-layer .telegram:not([hidden]), .paper-layer > .dialog:not(.out)'))
        const [t, r, b0, l] = screen.insets().map(x => Math.max(0, Math.round(x)))
        const b = Math.max(b0, Math.round(who.inset()))
        app.setInsets(t, r, b, l)
        root.style.setProperty('--top', `${t}px`)
        root.style.setProperty('--bottom', `${b}px`)
        if (waiting) placeSplash()
      }
      tying.frame()
      screen?.frame?.(dt)
      who.frame()
    },
    dispose() {
      screen?.dispose?.()
      tying.dispose()
      guided.dispose()
      root.replaceChildren()
    },
  }
}
