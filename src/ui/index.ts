// The interface: the farm's own papers over the land (src/ui/system), and the screens built from them.
import { laps } from '../render/laps.ts'
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
import { localize, setUnits } from './fmt.ts'
import { openHelp } from './help.ts'
import { mountTips } from './tip.ts'
import { ledgerScreen, overScreen } from './ledger.ts'
import { openMenu } from './menu.ts'
import { planScreen } from './plan.ts'
import { alertShort, blightWhy, countYearsFrom, firstName, JOB_DOING, jobText } from './rules.ts'
import { seasonScreen } from './season.ts'
import { titleScreen } from './title.ts'
import { guidedYear, HOLD, mountGuide, openGuide, quietAlert } from './tutorial.ts'
import { mountTies } from './tie.ts'
import { whois } from './whois.ts'
// Last, after every screen's own stylesheet: the control rule fitted to the live game.
import './system/weight.css'
import './system/cursor.css'

// What someone sent to a field by a right-click is going to do there: "Ruth will scout North Ridge."
const SENT: Record<S.JobKind, string> = {
  plant: 'plant', hill: 'hill', scout: 'scout', spray: 'spray', water: 'water', rogue: 'rogue', sample: 'do a test dig in',
  kill: 'kill the vines in', dig: 'dig', fell: 'fell the trees in', rocks: 'pick rocks in', brush: 'cut brush around',
  build: 'build in', haul: 'haul the crop in from',
}

// The answer to a stamp or a right-click: who will do what where, or that it's on the work list and why not the one picked.
// fields: more than one pressed in a row, said together ("Killing vines in 4 fields is on the work list.").
function sentText(c: S.Campaign, e: { field: number; kind: S.JobKind; unit: number; instead?: number }, fields = 1): string {
  // The year's first planting order is the word the crew waited for: the answer is what follows from it, however
  // many Plant stamps are pressed after it.
  const word = e.kind === 'plant' ? c.season?.log.find(x => x.type === 'plantWord' && x.day === c.season!.day && c.season!.plantWordBy === 'you') : undefined
  if (word) return word.text
  const where = fields > 1 ? `${fields} fields` : S.placeName(e.field)
  const u = c.crew.find(x => x.id === e.unit)
  if (u) return `${u.kind === 'farmer' ? 'You\'ll' : `${firstName(u.name)} will`} ${SENT[e.kind]} ${where}.`
  const what = fields > 1 ? `${JOB_DOING[e.kind]} ${where}` : jobText(e)
  const not = c.crew.find(x => x.id === e.instead)
  if (!not) return `${what} is on the work list.`
  const why = not.foreman ? `${firstName(not.name)} is a foreman` : `${not.kind === 'farmer' ? 'You don\'t' : `${firstName(not.name)} doesn't`} do ${S.SKILL_LABEL[S.jobSkill(e.kind)]}`
  const other = c.crew.some(x => x.id !== not.id && !x.foreman && S.willDo(x, e.kind))
  return `${why}, so ${what.replace(/^./, x => x.toLowerCase())} is on the work list ${other ? 'for someone else' : 'until someone on the farm does'}.`
}

// How close together presses of the same order come to be answered by one line.
const JOIN_MS = 2500
// How long the answer to a press stays: long enough to be read after a glance at the land.
const ANSWER_MS = 15000

// The alerts whose one remedy is a press, and the words on its key.
const KEYED: Partial<Record<string, string>> = { frostBarrels: 'Haul it in now', barrelsOut: 'Haul them in now', idleNever: 'Let them help' }

export const mountHud: MountHud = (root, app, view, sound) => {
  mountSprites()
  mountTips(root)
  root.classList.add('hud', 'waiting')
  const plateLayer = h('div', { class: 'plate-layer' })
  const screenLayer = h('div', { class: 'screen-layer' })
  const floating = h('div', { class: 'notes-slot floating' })
  const paperLayer = h('div', { class: 'paper-layer' })
  const whoLayer = h('div', { class: 'who-layer' })
  const guideLayer = h('div', { class: 'guide-layer' })
  const notes = new Notes()
  root.replaceChildren(plateLayer, screenLayer, floating, whoLayer, notes.liveRegion, paperLayer, guideLayer)

  // The answer to the player's own press (an order, or why not) is a note, kept long enough to be read after a glance
  // away; while a tutorial note or a paper hides the notes it is also shown beside the pointer, and the note itself
  // shows once the paper has gone.
  let pressedAt = { x: innerWidth / 2, y: innerHeight / 2 }
  document.addEventListener('pointerdown', e => { pressedAt = { x: e.clientX, y: e.clientY } }, true)
  const tip = h('p', { class: 'alert answer-tip sys', testid: 'answer-tip', role: 'status', hidden: true, style: 'position:absolute;max-width:320px;margin:0;pointer-events:none' })
  guideLayer.append(tip)
  let tipTimer = 0
  // While a weigh ticket's own stop is made: the ticket says why, so no pause line is printed for it.
  let ticketing = false
  let lastSent: { kind: S.JobKind; unit: number; instead?: number; fields: number[]; at: number; text: string } | null = null
  function answer(text: string): void {
    notes.push({ text, level: 'info', ttl: ANSWER_MS })
    if (!root.classList.contains('noting') && !papers.isOpen() && !app.holding) return
    // One telling: the tip is not shown, or is taken back, when the note that is up says the same words.
    const told = () => [...guideLayer.children].some(x => x !== tip && (x.textContent ?? '').replace(/\s+/g, ' ').includes(localize(text).replace(/\s+/g, ' ').slice(0, 28)))
    if (told()) return
    setTimeout(() => { if (told()) tip.hidden = true }, 500)
    tip.textContent = localize(text)
    tip.hidden = false
    tip.style.left = `${Math.max(8, Math.min(innerWidth - 328, pressedAt.x + 14))}px`
    tip.style.top = `${Math.max(8, Math.min(innerHeight - 96, pressedAt.y + 14))}px`
    clearTimeout(tipTimer)
    tipTimer = window.setTimeout(() => { tip.hidden = true }, 8000)
  }
  const papers = new Papers(paperLayer, [screenLayer, plateLayer, floating], app)
  const touchQuery = matchMedia('(pointer: coarse)')

  let dirty = true
  let dayTurned = false
  // A day's turn with the clock running, drawn over the frames after it: 1 while the land is made again, 2 while the
  // screen draws itself a part a frame (steps).
  let turn = 0
  let steps: Iterator<void> | null = null
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

  // An ask stands while one of its fields still needs that order and has none on the list; a warning about barrels,
  // while barrels are out. Once it no longer holds it is taken down, so nothing on screen asks for what is done.
  const standing: { full: string; act: string; fields: number[] }[] = []
  function settle(): void {
    const c = app.campaign
    if (!standing.length) return
    const s0 = c?.phase === 'season' ? c.season : null
    const needs = s0 ? app.needs() : []
    for (let k = standing.length - 1; k >= 0; k--) {
      const x = standing[k]
      const holds = !!s0 && (x.act === 'haul'
        ? (x.fields.length ? x.fields : s0.fields.map((_, i) => i)).some(i => (s0.fields[i]?.inField ?? 0) >= 0.5)
        : x.fields.some(i => needs[i]?.need?.act === x.act && !s0.jobs.some(j => j.kind === x.act && j.field === i)))
      if (!holds) { notes.forget(x.full); standing.splice(k, 1) }
    }
  }

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
  // (in the middle of a day's turn the insets are measured when its last part is drawn)
  const resized = new ResizeObserver(() => { if (!turn) dirty = true })
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
        // The ticket comes up the moment the lot is weighed, so the game never stands paused for one that isn't on
        // screen; a ticket already up keeps it waiting its turn behind.
        const spec = app.screen === 'season' ? ticket(ctx, lot, { fresh: true, staged: app.speed < 3 }) : null
        // The game stops for it as for any card that needs an answer (so answering it sets the days going again), with no
        // line of its own: the ticket is the answer's place.
        if (spec) { ticketing = true; app.stopFor(e.text, 'weighed'); ticketing = false; papers.enqueue(spec) }
        dirty = true
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
        // A day's turn is the dearest frame there is: the day itself, then the land made again in the frame after
        // (render/index.ts), and what is drawn here of it in the frames after that, never all in one long frame.
        if (e.dayPassed && app.speed > 0) dayTurned = true
        break
      case 'alert': {
        const a = e.alert
        // The tray and the ticket speak for themselves, and a clean walk shows on the field's own card.
        if (app.screen !== 'season' || a.type === 'sample' || a.type === 'weighed' || (a.type === 'scout' && a.level !== 'bad')) break
        // In the guided first year the guide speaks: news that asks nothing goes to the almanac's diary alone, but for
        // a kind of notice the guide has explained once, which then comes as a toast. A player who asked to be paused
        // on alerts is shown what paused the game.
        if (quietAlert(app.campaign, a.type, a.level) && !app.settings.pauseOnAlerts) break
        // A decision the game pauses for is said by the pause itself, once.
        if ((a.type === 'plantAsk' || a.type === 'killCall') && app.speed > 0) break
        const short = alertShort(a)
        // Frost over barrels names no one field: the note goes to the biggest haul, where the barrels and the hauler show.
        const field = a.type === 'frostBarrels' && app.campaign ? S.haulInfo(app.world, app.campaign).sort((x, y) => y.cwt - x.cwt)[0]?.field ?? -1 : a.field
        const go = screen?.goFor?.(a)
        // Blight found where the spraying is left to the crew: why it got in, by how the leaf stood when it was found.
        const why = a.type === 'scout' && a.level === 'bad' && app.campaign && a.field >= 0 ? blightWhy(app.campaign, a.field) : ''
        notes.push({ level: a.level, glyph: short.glyph, text: why ? `${short.text}. ${why}` : short.text, full: why ? `${a.text} ${why}.` : a.text, field, day: a.day, go, key: go ? KEYED[a.type] : undefined })
        // What an ask or a warning stands on, so it comes down once that is no longer so.
        if (a.type === 'need' && typeof a.data?.act === 'string') standing.push({ full: why ? `${a.text} ${why}.` : a.text, act: a.data.act, fields: Array.isArray(a.data.fields) ? a.data.fields as number[] : [a.field] })
        else if (a.type === 'frostBarrels' || a.type === 'barrelsOut') standing.push({ full: a.text, act: 'haul', fields: a.type === 'barrelsOut' ? [a.field] : [] })
        break
      }
      case 'change':
        remember()
        settle()
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
        answer(e.text)
        break
      case 'saved':
        if (!e.ok) notes.push({ text: 'This browser couldn\'t save your game. Export it from the menu to keep it.', level: 'warn', ttl: 12000 })
        break
      case 'speed': {
        // The clock stopped itself for something nothing on screen has said: say what. A card that needs an answer
        // says so itself, and a line queued behind it would only show once it had been answered.
        const c = app.campaign
        // Taken down once the game runs again, or once the order it waited for is given.
        if (pauseSaid && (e.speed > 0 || !app.pauseReason)) { notes.forget(pauseSaid); pauseSaid = '' }
        // A pause for a decision on the land (the word to plant, a vine kill) stays said for as long as it waits. In
        // the guided first year the agent's note says it, when one comes: the line waits a moment to see.
        const asks = app.pauseCause === 'plantAsk' || app.pauseCause === 'killCall'
        const sayPause = (why: string) => {
          if (app.speed !== 0 || app.pauseReason !== why || app.screen !== 'season' || !app.campaign || S.seasonDone(app.campaign) || papers.isOpen() || notes.has(why)) return
          pauseSaid = `Paused: ${why}`
          notes.push({ text: pauseSaid, level: 'info', glyph: app.pauseCause === 'plantAsk' ? 'plant' : app.pauseCause === 'killCall' ? 'kill' : undefined, ttl: asks ? 0 : 9000 })
        }
        if (e.speed === 0 && app.holding) ctx.announce(app.pauseReason)
        else if (!ticketing && e.speed === 0 && app.pauseReason && app.pauseReason !== HOLD) {
          const why = app.pauseReason
          if (!guidedYear(c)) sayPause(why)
          else if (asks) setTimeout(() => sayPause(why), 700)
        }
        dirty = true
        break
      }
      case 'sent': {
        const c = app.campaign
        if (!c) break
        // Presses of the same order within a moment of each other are answered by one line.
        const now = performance.now()
        const same = lastSent && now - lastSent.at < JOIN_MS && lastSent.kind === e.kind && lastSent.unit === e.unit && lastSent.instead === e.instead && !lastSent.fields.includes(e.field)
        const fields = same ? [...lastSent!.fields, e.field] : [e.field]
        if (same) notes.forget(lastSent!.text)
        const text = sentText(c, e, fields.length)
        lastSent = { kind: e.kind, unit: e.unit, instead: e.instead, fields, at: now, text }
        answer(text)
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
      // Escape undoes the nearest thing first: a popover or breakdown, a paper, a card (a selection's card among them),
      // Follow. Only with nothing open does it open the menu.
      const steps: (() => boolean)[] = [
        () => !papers.isOpen() && !!screen?.escapes?.popover(),
        () => { if (!papers.isOpen()) return false; papers.closeTop(); return true },
        () => who.escape() || (screen?.escapes ? screen.escapes.card() : !!screen?.key?.(e)),
        () => { if (app.screen !== 'season' || view.followed() < 0) return false; view.follow(-1); ctx.announce('Stopped following.'); return true },
      ]
      if (steps.some(step => step())) { e.preventDefault(); return }
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
      laps.end('interface: guide')
      notes.hush(papers.isOpen() || !!app.holding)
      if (sinceTick > 500) { sinceTick = 0; if (notes.count() || notes.held()) notes.prune(app.campaign?.season && app.screen === 'season' ? app.campaign.season.day : -1) }
      const before = (): void => {
        root.dataset.layout = layoutNow()
        root.classList.toggle('touch', touchQuery.matches)
      }
      const after = (): void => {
        if (!screen) return
        who.update()
        laps.end('interface: card on the land')
        // One voice: no toast under a card that wants an answer.
        root.classList.toggle('voice', !!root.querySelector('.screen-layer .telegram:not([hidden]), .paper-layer > .dialog:not(.out)'))
        const [t, r, b0, l] = screen.insets().map(x => Math.max(0, Math.round(x)))
        const b = Math.max(b0, Math.round(who.inset()))
        app.setInsets(t, r, b, l)
        root.style.setProperty('--top', `${t}px`)
        root.style.setProperty('--bottom', `${b}px`)
        if (waiting) placeSplash()
      }
      // Anything else that changes in the middle of a day's turn, or a hand held on the land: the whole is drawn at
      // once, as ever.
      if (turn && (dirty || held || !screen)) { turn = 0; steps = null; dirty = true }
      if (dirty && dayTurned) { dayTurned = false; dirty = false; turn = 1 }
      else if (dirty && !held && screen) {
        dirty = false
        before()
        screen.update()
        laps.end('interface: screen')
        after()
      } else if (turn === 1) turn = 2
      else if (turn === 2 && screen) {
        if (!steps) { before(); steps = screen.steps?.() ?? null }
        if (!steps) screen.update()
        if (!steps || steps.next().done) { laps.end('interface: screen'); after(); steps = null; turn = 0 }
      }
      laps.end('interface: drawn again')
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
