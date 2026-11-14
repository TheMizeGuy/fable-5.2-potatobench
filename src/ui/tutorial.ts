// The guided first year on screen (src/game/tutorial.ts holds the lessons): the county agent's printed slip, one at a
// time, set where it covers nothing it is about, and the printer's fist on the one control it asks for. In spring the
// slip is tucked into the seed catalogue above the order blank; elsewhere it floats over the land.
import { DAYS_PER_SECOND } from '../game/app.ts'
import { Guide, lesson, LESSONS, localStore, PART_NAME, PIECES, type Input, type Lesson, type Look, type Part, type Point, type Show } from '../game/tutorial.ts'
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { plantingIn } from './rules.ts'
import { showForemanKey } from './people.ts'
import { fist, key } from './system/parts.ts'
import './system/tutorial.css'
import { toLocal, toScreen } from './scale.ts'

export const guide = new Guide(localStore())
// Set by the mounted guide: a key on a note takes effect on the next frame, not the next look round.
let poke: () => void = () => {}
// A tip that only tells goes by itself: after long enough to read it twice over, and never under five seconds.
export const tipSeconds = (words: number): number => Math.max(5, Math.min(10, 2 + words * 0.45))
// In a season, the least time between one tip being put away and the next that only tells.
const TIP_GAP_MS = 6000
// For the browser tests and the capture tool, as window.__county is.
;(globalThis as Record<string, unknown>).__countyGuide = guide

// ---------------------------------------------------------------- hooks for the screens

// A farm started from the title: its first spring carries the offer, once.
export function startedFarm(seed: number): void { guide.newFarm(seed) }

// A farm started from the title's Guided first year: the guide on from the first note, with no offer to answer.
export function guidedFarm(): void { guide.restart() }

// The guided first year: the guide speaks for the toasts, and the screen grows with the player.
export function guidedYear(c: S.Campaign | null): boolean { return guide.on && !!c && c.history.length === 0 }

// A question the season would ask by itself waits for the note that explains it.
export function mayAsk(c: S.Campaign | null, id: string): boolean { return !guidedYear(c) || guide.passed(id) }

// The agent's one line inside a card the first time its kind comes (a telegram, a weigh ticket): the card is the one
// voice, so the guide speaks in it.
const LINES: Record<string, string> = {
  telegram: 'Paused until you pick a reply.',
  ticket: 'This is your first weigh ticket. It shows what the field grew and what was lost. Sell now is the safe choice.',
}
export function agentLine(kind: 'telegram' | 'ticket', key: string | number): HTMLElement | null {
  if (!guide.on) return null
  const seen = guide.p.facts.find(f => f.startsWith(`line:${kind}:`))
  if (seen && seen !== `line:${kind}:${key}`) return null
  guide.note(`line:${kind}:${key}`)
  return h('p', { class: 'guide-line', testid: 'guide-line' }, h('span', { class: 't-label' }, 'The county agent'), ' ', LINES[kind])
}

// One voice: while the agent has a note to give on this screen (up, or waiting its turn), the goal slip and the
// fold it rings stand down. They are two lists that cannot be made to name the same step, so they take turns.
let speaking = false
export function agentSpeaking(): boolean { return speaking }

// In the guided first year the agent speaks for the news that asks nothing. A kind of notice the agent has explained
// once (frost on the barrels) comes as a toast after that, and never pauses the game again.
export function quietAlert(c: S.Campaign | null, type: string, level: string): boolean {
  if (!guidedYear(c) || level === 'bad') return false
  return !(type === 'frostBarrels' && guide.passed('frost'))
}

// The first-time tips for the orders say what the guide says; while it is on they keep quiet.
export function quietTips(): boolean { return guide.quiet() }

let slot: HTMLElement | null = null
// The place in the spring catalogue, above the order blank, where the offer and the spring's notes are tucked.
export function springSlot(): HTMLElement {
  slot = h('div', { class: 'guide-slot sys' })
  return slot
}

// ---------------------------------------------------------------- the guide's own paper: every lesson, to see again

const PARTS: Part[] = ['opening', 'year', 'spring']
const by = (i: Input, mouse: string, touch: string, keys: string) => i === 'touch' ? touch : i === 'keys' ? keys : mouse

export function openGuide(ctx: Ctx): void {
  ctx.papers.open({
    title: 'Guided first year',
    kicker: 'From the county agent',
    testid: 'guide',
    size: 'medium',
    body: close => {
      const box = h('div', { class: 'guide-list' })
      const draw = () => box.replaceChildren(
        h('label', { class: 'check guide-on' },
          h('span', { class: 'check-in' }, h('input', {
            type: 'checkbox', checked: guide.on, testid: 'guide-on',
            onchange: (e: Event) => { if ((e.target as HTMLInputElement).checked) guide.resume(); else guide.stop(); draw(); ctx.dirty() },
          }), h('i', { class: `tick${guide.on ? ' on' : ''}` })),
          h('span', null, h('b', null, 'Show the tutorial'), ' ', h('span', { class: 'quiet' }, 'a tip the first time each thing comes up'))),
        ...PARTS.map(part => h('section', { class: 'guide-part' },
          h('h3', { class: 't-label' }, PART_NAME[part]),
          h('ul', null, LESSONS.filter(x => x.part === part).map(x => {
            const state = guide.p.passed[x.id]
            return h('li', { class: 'lead' },
              h('i', { class: `tick bare${state === 'done' ? ' on' : ''}`, 'aria-hidden': 'true' }),
              h('span', { class: state ? 'pencil' : null }, x.name, h('span', { class: 'sr' }, state === 'done' ? ', done' : state === 'skip' ? ', skipped' : guide.replaying(x.id) ? ', coming up again' : ', not seen yet')),
              h('span', { class: 'dots' }),
              h('button', {
                class: 'btn quiet', type: 'button', testid: `guide-again-${x.id}`, 'aria-label': `Replay the lesson ${x.name}`,
                onclick: () => { guide.replay(x.id); close(); ctx.say(`You'll see "${x.name}" again the next time it comes up.`); ctx.dirty() },
              }, guide.replaying(x.id) ? 'Coming up' : 'Replay'))
          })))))
      draw()
      return [h('p', { class: 'dlg-lead' }, 'The tutorial explains one thing at a time, the first time it comes up. You can replay any lesson here.'), box]
    },
    foot: shut => [
      h('button', { class: 'btn', type: 'button', testid: 'guide-restart', onclick: () => { guide.restart(); shut(); ctx.say('The tutorial will start again from the beginning.'); ctx.dirty() } }, 'Restart the tutorial'),
      h('button', { class: 'btn go', type: 'button', testid: 'guide-close', autofocus: true, onclick: shut }, 'Back', icon('arrow', 'i')),
    ],
  })
}

// ---------------------------------------------------------------- where things are on the screen

interface Box { left: number; top: number; right: number; bottom: number }
const box = (r: DOMRect | Box): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
const pad = (b: Box, p: number): Box => ({ left: b.left - p, top: b.top - p, right: b.right + p, bottom: b.bottom + p })
const meets = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

function shown(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false
  if (el.closest('.leaving, [inert], .guide-layer, .out')) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
}

// On the screen and inside the window of the card that holds it, not scrolled out of it.
function inCard(el: Element | null): boolean {
  if (!shown(el)) return false
  const card = el.closest('.person-card')
  if (!card) return true
  const r = el.getBoundingClientRect(), c = card.getBoundingClientRect()
  return r.top >= c.top - 1 && r.bottom <= c.bottom + 1
}

function byTestid(root: HTMLElement, ids: string[]): HTMLElement | null {
  for (const id of ids) {
    const sel = id.endsWith('*') ? `[data-testid^="${id.slice(0, -1)}"]` : `[data-testid="${id}"]`
    for (const el of root.querySelectorAll(sel)) if (shown(el)) return el
  }
  return null
}

// What a lesson points at, as an element on screen, or a point from the scene's anchors when no element marks it.
function resolve(ctx: Ctx, root: HTMLElement, p: Point | null): { el: HTMLElement | null; at: Box | null; id: string } {
  if (!p) return { el: null, at: null, id: '' }
  const found = (ids: string[]) => { const el = byTestid(root, ids); return { el, at: el ? box(el.getBoundingClientRect()) : null, id: el?.dataset.testid ?? ids[0] } }
  if ('testid' in p) return found(p.testid)
  if ('badge' in p) { const r = found([`badge-${p.badge}`, `field-${p.badge}`]); return r.el ? r : { ...r, id: `badge-${p.badge}` } }
  if ('field' in p) return found([`field-${p.field}`])
  if ('fields' in p) return found(p.fields.map(i => `field-${i}`))
  const r = found([`pin-${p.unit}`, `unit-${p.unit}`])
  if (r.el) return r
  const a = ctx.view.unitAnchor(p.unit)
  if (a.visible && a.x > 0 && a.y > 0 && a.x < innerWidth && a.y < innerHeight) return { el: null, at: { left: a.x - 22, top: a.y - 56, right: a.x + 22, bottom: a.y }, id: `pin-${p.unit}` }
  return { el: null, at: null, id: `pin-${p.unit}` }
}

// What lies over a target, at its middle or over any part of it (a stamp half under a card is not one the player
// can be sent to): the elements found at its middle and a little in from each corner that are not its own.
function over(t: { el: HTMLElement | null; at: Box | null }): Element[] {
  if (!t.el || !t.at) return []
  const b = t.at
  const dx = Math.min(6, (b.right - b.left) / 4), dy = Math.min(6, (b.bottom - b.top) / 4)
  const pts = [[(b.left + b.right) / 2, (b.top + b.bottom) / 2], [b.left + dx, b.top + dy], [b.right - dx, b.top + dy], [b.left + dx, b.bottom - dy], [b.right - dx, b.bottom - dy]]
  const out: Element[] = []
  for (const [x, y] of pts) {
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
    const hit = document.elementFromPoint(x, y)
    if (hit && !t.el.contains(hit) && !hit.closest('.guide-layer') && !hit.contains(t.el)) out.push(hit)
  }
  return out
}

// What the player would press to see a target a card lies over: that card's close key, or null when nothing does.
function coverOf(t: { el: HTMLElement | null; at: Box | null }): HTMLElement | null {
  for (const hit of over(t)) {
    const panel = hit.closest('.person-card, .whois, .work, .sheet')
    if (!panel || panel.contains(t.el)) continue
    const close = panel.querySelector<HTMLElement>('button.close')
    if (close && shown(close)) return close
  }
  return null
}

// Whether something lies over what a note points at, so a press there would not reach it.
function hiddenAt(t: { el: HTMLElement | null; at: Box | null }): boolean {
  return over(t).length > 0
}

// Everything on the current screen the slip should not lie over: the panels themselves, not the clear boxes that hold
// them. hard: what it must never cover (a clock, a command bar, a telegram, a paper, a test-dig tray, a person's card).
function hardOnes(root: HTMLElement): Box[] {
  const hard: Box[] = []
  for (const el of root.querySelectorAll('.clock, .command, .telegram, .spray-card, .dialog, [data-testid="paused"], .tray-paper, .person-card, .work, .pin-list-at, .tb-pop, .queue, .cat-open')) {
    if (shown(el)) hard.push(box(el.getBoundingClientRect()))
  }
  return hard
}

function obstacles(root: HTMLElement): { hard: Box[]; soft: Box[]; costs: { b: Box; cost: number }[] } {
  const hard = hardOnes(root)
  const soft: Box[] = []
  const costs: { b: Box; cost: number }[] = []
  const main = root.querySelector<HTMLElement>('.screen-layer > main:not(.leaving)')
  const walk = (el: Element, depth: number) => {
    for (const k of el.children) {
      // A veil dims the land behind a telegram; it is not a panel.
      if (!shown(k) || k.classList.contains('veil')) continue
      const r = k.getBoundingClientRect()
      const cs = getComputedStyle(k)
      const clear = cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none' && cs.boxShadow === 'none'
      if (clear && depth < 4 && (r.width > innerWidth * 0.6 || r.height > innerHeight * 0.6 || k.children.length)) walk(k, depth + 1)
      else {
        soft.push(box(r))
        // The boards at the top repeat what the screen below says; a sheet of words does not.
        costs.push({ b: box(r), cost: k.closest('.topbar, .top') ? 1 : 4 })
      }
    }
  }
  if (main) walk(main, 0)
  for (const el of root.querySelectorAll('.notes .alert')) if (shown(el)) soft.push(box(el.getBoundingClientRect()))
  return { hard, soft, costs }
}

// The first free place for a box this size, nearest the top of the land and its middle; null when there is none.
// over: panels it may lie over if it must, each with what covering it costs (a board little, a sheet of words more).
function findPlace(w: number, hgt: number, avoid: Box[], over: { b: Box; cost: number }[] = []): { x: number; y: number } | null {
  const m = 12, step = 16
  let best: { x: number; y: number; s: number } | null = null
  const area = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  for (let y = m; y + hgt <= innerHeight - m; y += step) {
    for (let x = m; x + w <= innerWidth - m; x += step) {
      const b = { left: x, top: y, right: x + w, bottom: y + hgt }
      if (avoid.some(a => meets(b, a))) continue
      const s = y + Math.abs(x + w / 2 - innerWidth / 2) * 0.35 + over.reduce((t, o) => t + area(b, o.b) * o.cost / 40, 0)
      if (!best || s < best.s) best = { x, y, s }
    }
  }
  return best
}

// Everything on the screen a player reads or presses: words, figures, faces, keys, tags, stamps and controls, as boxes.
// Read from the elements themselves (the layers over the land let the pointer through, so asking the page what lies
// at a point would find only the land), and only the boxes of the words, not the paragraphs round them.
const BUSY = 'svg, img, button, a, input, label, .tag, .need, .pin, .portrait, .key, .t-figure'
export function busyBoxes(root: HTMLElement): Box[] {
  const out: Box[] = []
  const range = document.createRange()
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el.closest('.guide-layer, .leaving, [hidden], .gone, .sr')) continue
    if (el.matches(BUSY)) {
      if (el.parentElement?.closest(BUSY)) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) out.push(box(r))
      continue
    }
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !(n.nodeValue ?? '').trim()) continue
      range.selectNodeContents(n)
      const r = range.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) out.push(box(r))
    }
  }
  return out
}

// Whether a box lies over nothing a player reads or presses.
export function bareAt(busy: Box[], b: Box): boolean {
  return !busy.some(a => meets(b, a))
}

// ---------------------------------------------------------------- the slip

// lost: what it points at is on the land but out of view, so the slip says how to bring the farm back.
// go: where the lesson's own Show me leads, when what it is about is not on the screen.
function slipBody(ctx: Ctx, x: Lesson, l: Look, lost = false, under = false, show = -1, go: Show | null = null): (HTMLElement | null)[] {
  const again = guide.replaying(x.id)
  const done = () => { guide.noted(x.id); poke(); ctx.dirty() }
  const act = x.act?.(l) ?? null
  const lead = (s: Show) => { if ('field' in s) { ctx.app.select(s.field); ctx.app.focus(s.field) } else { if (s.foreman) showForemanKey(); ctx.app.selectUnit(s.unit); ctx.dirty() } }
  return [
    h('p', { class: 'guide-ask', id: 'guide-ask' }, x.ask(l)),
    h('p', { class: 'guide-why t-caption' }, x.why(l)),
    lost ? h('p', { class: 'guide-lost t-caption', testid: 'guide-lost' }, icon('field', 'i'), by(l.input, 'It\'s off screen. Press Home or double-click open ground to see the farm again.', 'It\'s off screen. Double-tap open ground to see the farm again.', 'It\'s off screen. Press Home to see the farm again.')) : null,
    show >= 0 && !lost ? h('p', { class: 'guide-lost t-caption', testid: 'guide-hidden' }, icon('field', 'i'), 'Something is covering it. ',
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-show', onclick: () => ctx.app.focus(show) }, 'Show me')) : null,
    show >= 0 && lost ? h('p', { class: 'guide-lost t-caption' }, h('button', { class: 'btn quiet', type: 'button', testid: 'guide-show', onclick: () => ctx.app.focus(show) }, 'Show me')) : null,
    under ? h('p', { class: 'guide-lost t-caption', testid: 'guide-under' }, icon('close', 'i'), by(l.input, 'A card is in the way. Click its X to close it.', 'A card is in the way. Tap its X to close it.', 'A card is in the way. Use its X to close it.')) : null,
    // A tip asks for nothing but what it points at: its own key where it has one (the order it is about), and two
    // quiet ones, to put it away now and to have no more tips. None of them has to be pressed.
    h('footer', { class: 'guide-foot' },
      act ? h('button', { class: 'btn guide-ok', type: 'button', testid: 'guide-act', onclick: () => { let said = ''; for (const cmd of act.cmds) { const r = ctx.run(cmd); said = (r.ok ? r.events[0]?.text : r.err) ?? said } const text = act.done ?? said; if (text) ctx.say(F.localize(text), 'good'); done() } }, icon('check', 'i'), act.label) : null,
      go && show < 0 ? h('button', { class: 'btn quiet', type: 'button', testid: 'guide-show', onclick: () => lead(go) }, 'Show me') : null,
      x.read || again ? h('button', { class: 'btn quiet', type: 'button', testid: 'guide-noted', onclick: done }, 'Got it')
        : h('button', { class: 'btn quiet', type: 'button', testid: 'guide-pass', onclick: () => { guide.skip(x.id); poke(); ctx.dirty() } }, 'Skip'),
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-stop', onclick: () => { guide.stop(); poke(); ctx.say('Tips are off. You can turn them back on from the menu.'); ctx.dirty() } }, 'No more tips')),
  ]
}

// The offer: a card in the middle of the screen, as a telegram is, with two numbered replies.
// Taking the tutorial in the first spring goes straight onto the land: the usual plan stands, the season starts, and
// planning is taught in the second spring, when there is a year behind it to plan from. While the season is starting
// no card of the opening is shown.
let straight = false
export function straightIn(ctx: Ctx): void {
  const c = ctx.app.campaign
  if (!c || c.phase !== 'plan' || c.history.length > 0) return
  straight = true
  let tries = 0
  const go = () => {
    const now = ctx.app.campaign
    const key = now && now.phase === 'plan' ? document.querySelector<HTMLElement>('#ui [data-testid="begin-season"]') : null
    if (key) key.click()
    if (key || !now || now.phase !== 'plan' || ++tries > 180) { straight = false; ctx.dirty(); return }
    requestAnimationFrame(go)
  }
  go()
}

function offerCard(ctx: Ctx): HTMLElement {
  const keys = !ctx.touch()
  const reply = (n: number, id: string, title: string, does: string, usual: boolean, go: () => void) => h('button', {
    class: `reply${usual ? ' first usual' : ''}`, type: 'button', testid: id, 'aria-keyshortcuts': keys ? String(n) : null, onclick: () => { go(); poke(); ctx.dirty() },
  }, key(String(n)), h('b', { class: 'c-title' }, title, usual ? fist() : null), h('span', { class: 'c-does' }, does))
  return h('section', { class: 'guide-card offer telegram sheet sys', testid: 'guide-offer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-offer-h' },
    h('header', { class: 'gc-head' }, h('p', { class: 't-label' }, 'From the county agent'), h('h2', { class: 't-title', id: 'guide-offer-h' }, 'First time on the farm?')),
    h('p', { class: 'gc-lead' }, 'I can start your first season on a usual plan and point things out as they come up. Tips never stop the game, and you never have to click one.'),
    h('div', { class: 'replies', role: 'group', 'aria-label': 'Your answer' },
      reply(1, 'guide-accept', 'Play with tips', 'The usual choice. Your first season starts right away.', true, () => { guide.accept(); straightIn(ctx) }),
      reply(2, 'guide-refuse', 'Play without tips', 'You can turn them on later from the menu.', false, () => guide.refuse())))
}

// What a year is, drawn: the five things the year asks, in order, and what it costs at the end.
const YEAR: [string, string, string][] = [['plant', 'Plant', 'May'], ['hill', 'Tend', 'summer'], ['kill', 'Kill the vines', 'September'], ['dig', 'Harvest', 'fall'], ['ticket', 'Sell or store', 'fall and winter']]
function frameCard(ctx: Ctx, x: Lesson, l: Look): HTMLElement {
  const bills = F.money(S.NOTE_PAYMENT + S.LIVING)
  return h('section', { class: 'guide-card frame telegram sheet sys', testid: 'guide-slip', 'data-lesson': x.id, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-ask' },
    h('header', { class: 'gc-head' }, h('p', { class: 't-label' }, 'From the county agent'), h('h2', { class: 't-title', id: 'guide-ask' }, 'Keep the farm five years')),
    h('ol', { class: 'gc-year', 'aria-label': 'The steps of each year, in order' },
      YEAR.map(([glyph, name, when]) => h('li', null, icon(glyph, 'i'), h('b', null, name), h('span', { class: 't-label' }, when)))),
    h('p', { class: 'gc-lead' }, `At the end of each year you owe ${bills} to the bank and your family, so your crop needs to earn at least that.`),
    h('p', { class: 'gc-deal' }, x.why(l)),
    h('footer', { class: 'guide-foot' },
      h('button', { class: 'btn go guide-ok', type: 'button', testid: 'guide-noted', onclick: () => { guide.noted(x.id); poke(); ctx.dirty() } }, 'Begin', icon('arrow', 'i')),
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-stop', onclick: () => { guide.stop(); poke(); ctx.dirty() } }, 'Turn off the tutorial')))
}

// ---------------------------------------------------------------- the camera, read from the scene's anchors

// Where each parcel's anchor is on the screen, by parcel: two of these, taken a gesture apart, say how the view moved.
type Sig = Map<number, { x: number; y: number }>

function signature(ctx: Ctx): Sig {
  const pts: Sig = new Map()
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const a = ctx.view.fieldAnchor(i)
    if (a.visible && Number.isFinite(a.x) && Number.isFinite(a.y) && Math.abs(a.x) < innerWidth * 20 && Math.abs(a.y) < innerHeight * 20) pts.set(i, { x: a.x, y: a.y })
  }
  return pts
}

// Pan, zoom, turn and tip between two signatures, over the parcels seen in both; null with fewer than two.
function moved(b: Sig, s: Sig): { pan: number; zoom: number; turn: number; tip: number } | null {
  const ids = [...b.keys()].filter(i => s.has(i))
  if (ids.length < 2) return null
  const stat = (m: Sig) => {
    const ps = ids.map(i => m.get(i)!)
    const cx = ps.reduce((t, p) => t + p.x, 0) / ps.length, cy = ps.reduce((t, p) => t + p.y, 0) / ps.length
    const sx = Math.sqrt(ps.reduce((t, p) => t + (p.x - cx) ** 2, 0) / ps.length), sy = Math.sqrt(ps.reduce((t, p) => t + (p.y - cy) ** 2, 0) / ps.length)
    const a = ps[0], z = ps[ps.length - 1]
    return { cx, cy, spread: Math.max(1, Math.hypot(sx, sy)), angle: Math.atan2(z.y - a.y, z.x - a.x), ratio: sy / Math.max(1, sx) }
  }
  const p = stat(b), q = stat(s)
  return {
    pan: Math.hypot(q.cx - p.cx, q.cy - p.cy), zoom: Math.abs(q.spread / p.spread - 1),
    turn: Math.abs(Math.atan2(Math.sin(q.angle - p.angle), Math.cos(q.angle - p.angle))), tip: Math.abs(q.ratio / Math.max(0.01, p.ratio) - 1),
  }
}

// ---------------------------------------------------------------- mounting

export function mountGuide(ctx: Ctx, layer: HTMLElement): { frame(dt: number): void; dispose(): void } {
  const app = ctx.app
  const root = layer.parentElement as HTMLElement
  const slip = h('section', { class: 'guide floating sheet sys', 'aria-labelledby': 'guide-ask', hidden: true })
  const hand = h('div', { class: 'guide-fist sys', testid: 'guide-fist', 'aria-hidden': 'true', hidden: true }, fist())
  const cardVeil = h('div', { class: 'guide-veil', hidden: true })
  const cardSlot = h('div', { class: 'guide-cardslot', hidden: true })
  layer.append(cardVeil, cardSlot, slip, hand)
  // While a card is up, the screen behind it waits: nothing there can be pressed or focused.
  const behind = () => [...root.querySelectorAll<HTMLElement>(':scope > .screen-layer, :scope > .plate-layer')]
  let cardKey = ''
  const onCardKey = (e: KeyboardEvent) => {
    if (cardSlot.hidden || e.ctrlKey || e.metaKey || e.altKey) return
    const press = (id: string) => { const b = cardSlot.querySelector<HTMLElement>(`[data-testid="${id}"]`); if (b) { e.preventDefault(); e.stopImmediatePropagation(); b.click() } }
    if (offer && e.key === '1') press('guide-accept')
    else if (offer && (e.key === '2' || e.key === 'Escape')) press('guide-refuse')
    // Nothing behind a card hears a key: only Tab, Enter and Space, which are the card's own.
    else if (!['Tab', 'Enter', ' ', 'Shift'].includes(e.key)) { if (e.key === 'Escape') e.preventDefault(); e.stopImmediatePropagation() }
  }
  document.addEventListener('keydown', onCardKey, true)

  let input: Input = ctx.touch() ? 'touch' : 'mouse'
  let stale = true
  poke = () => { stale = true }
  // When the player last touched the clock themselves.
  let pressedAt = -1e9
  const CLOCK_KEYS = [' ', 'f', 'F', '+', '=', '-', '_']
  const onKey = (e: KeyboardEvent) => {
    if (CLOCK_KEYS.includes(e.key)) pressedAt = performance.now()
    if ((e.key === 'Tab' || e.key === 'Enter') && !(e.target as HTMLElement).closest?.('input')) setInput('keys')
  }
  // A coarse pointer is a finger, whatever the event calls itself.
  const onPointer = (e: PointerEvent) => {
    if ((e.target as Element).closest?.('.clock, [data-testid="goal-faster"], [data-testid="paused"], [data-testid="running"]')) pressedAt = performance.now()
    setInput(e.pointerType === 'touch' || ctx.touch() ? 'touch' : 'mouse')
  }
  function setInput(i: Input): void { if (input !== i) { input = i; stale = true } }
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('pointerdown', onPointer, true)
  const off = app.on(() => { stale = true })

  let since = 0
  let now: Lesson | null = null
  let offer = false
  let said = ''
  let target = ''
  let cover: HTMLElement | null = null
  // Of several fields a note will take, the one the fist went beside.
  let picked = ''
  // The field a note points at, when it is out of view or something lies over it; and the spring note set aside while
  // a fold it is not about is read.
  let showField = -1
  let away = false
  // Where the slip was: for half a second after it goes, a press there is taken by nothing.
  let slipAt: Box | null = null
  let ghost: { b: Box; until: number } | null = null
  let shownId = ''
  const swallow = (e: Event) => {
    if (!ghost || performance.now() > ghost.until || (e.target as Element).closest?.('.guide, .paper-layer, .dialog, .telegram')) return
    const p = e as PointerEvent
    if (p.clientX >= ghost.b.left && p.clientX <= ghost.b.right && p.clientY >= ghost.b.top && p.clientY <= ghost.b.bottom) { e.preventDefault(); e.stopImmediatePropagation() }
  }
  for (const k of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'contextmenu']) window.addEventListener(k, swallow, true)
  // A double-click is one press: its second click (the browser counts them in detail; a key's or a script's click
  // counts 0), landing where a note has just come, does not answer that note too. Nothing else is held back, so a
  // note's keys work from the frame it is shown.
  let firstAt = -1e9
  let cameAt = 0
  const twice = (e: MouseEvent) => {
    if (e.detail >= 2 && cameAt > firstAt && (e.target as Element).closest?.('.guide, .guide-card')) { e.preventDefault(); e.stopImmediatePropagation(); return }
    if (e.detail === 1) firstAt = performance.now()
  }
  window.addEventListener('click', twice, true)
  let place: { x: number; y: number } | null = null
  let placedFor = ''
  // 0: clear of every panel; 1: clear only of what it must never cover.
  let tier = 0
  let checked = 0
  let placedAt = 0
  let busy: Box[] | null = null
  let busyAt = 0
  const cam: { base: Sig | null; until: number; kind: 'pan' | 'zoom' | 'turn' | 'two'; travel: number } = { base: null, until: 0, kind: 'pan', travel: 0 }

  // The stamps on the screen, read once a look round (not every frame), and the field the note on show has named.
  let stamps: number[] = []
  let stampKept = -1

  function papers(): string[] {
    return [...root.querySelectorAll<HTMLElement>('.paper-layer > .dialog:not(.out)')].map(d => d.dataset.testid ?? 'paper')
  }

  function lookNow(): Look {
    const ps = papers()
    return {
      c: app.campaign, world: app.world, screen: app.screen, selection: app.selection, unit: app.unit, yard: app.yard, speed: app.speed,
      needs: app.campaign?.phase === 'season' ? app.needs().map(n => n.need) : [], paper: ps[ps.length - 1] ?? '', papers: ps, input,
      stopped: app.pauseReason,
      wait: app.campaign?.phase === 'season' ? plantingIn(app.world, app.campaign) : -1,
      asking: shown(root.querySelector('[data-testid="spray-ask"]')) ? 'spray' : '',
      fold: root.querySelector<HTMLElement>('.catalogue .cat-open')?.dataset.testid ?? '',
      inView: stampKept >= 0 ? [stampKept, ...stamps] : stamps,
    }
  }

  // The camera moved by the player: drag or keys (pan), wheel or pinch (zoom), right-drag, twist or Q and E (turn), and
  // the tip. Read from the scene's anchors as each gesture on the land starts and while it goes on, so the camera's own
  // settling is never taken for the player's.
  // What the gesture was by its input (a left drag or the arrows pans, the wheel zooms, the right button, two fingers,
  // Q, E and the page keys turn or tip), and whether the land on screen really moved that way.
  function camMoved(): void {
    const b = cam.base
    if (!b) return
    const m = moved(b, signature(ctx))
    const k = cam.kind
    // The farm all but out of view, before or after: the gesture's own travel says it moved the view.
    if (!m) { if (cam.travel >= 40) guide.note(k === 'two' ? 'turn' : k); return }
    if (k === 'pan' && m.pan > 40) guide.note('pan')
    if ((k === 'zoom' || k === 'two') && m.zoom > 0.1) guide.note('zoom')
    if ((k === 'turn' || k === 'two') && m.turn > 0.1) guide.note('turn')
    if (k === 'turn' && m.tip > 0.08) guide.note('tip')
  }
  const CAM_KEYS: Record<string, 'pan' | 'turn'> = { ArrowLeft: 'pan', ArrowRight: 'pan', ArrowUp: 'pan', ArrowDown: 'pan', q: 'turn', Q: 'turn', e: 'turn', E: 'turn', PageUp: 'turn', PageDown: 'turn' }
  const touches = new Set<number>()
  function gesture(on: boolean, kind: 'pan' | 'zoom' | 'turn' | 'two'): void {
    if (app.screen !== 'season' || !(now?.id === 'watch' || now?.id === 'turn')) { cam.base = null; return }
    if (on) {
      if (!cam.base || (kind !== cam.kind && kind !== 'pan')) { cam.base = signature(ctx); cam.kind = kind; cam.travel = 0 }
      cam.until = performance.now() + 900
    } else cam.until = performance.now() + 400
  }
  const onCanvas = (e: Event) => {
    if ((e.target as Element)?.id !== 'field') return
    if (e.type === 'wheel') { gesture(true, 'zoom'); return }
    const p = e as PointerEvent
    if (p.pointerType === 'touch') { if (e.type === 'pointerdown') touches.add(p.pointerId); else if (e.type === 'pointerup') touches.delete(p.pointerId) }
    if (e.type === 'pointermove' && !p.buttons) return
    const kind = touches.size >= 2 ? 'two' : p.buttons & 2 || p.button === 2 ? 'turn' : 'pan'
    if (e.type === 'pointermove') cam.travel += Math.hypot(p.movementX || 0, p.movementY || 0)
    gesture(e.type !== 'pointerup', kind)
  }
  const onLift = (e: PointerEvent) => touches.delete(e.pointerId)
  const onCamKey = (e: KeyboardEvent) => { const k = CAM_KEYS[e.key]; if (k) { if (e.type === 'keydown') cam.travel += 20; gesture(e.type === 'keydown', k) } }
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) document.addEventListener(t, onCanvas, { capture: true, passive: true })
  document.addEventListener('pointercancel', onLift, true)
  document.addEventListener('keydown', onCamKey, true)
  document.addEventListener('keyup', onCamKey, true)
  function watchCamera(): void {
    if (!cam.base) return
    camMoved()
    if (performance.now() > cam.until) cam.base = null
  }

  function notePlan(): void {
    for (const id of ['crew', 'land']) if (root.querySelector(`.catalogue [data-testid="${id}"]`)) guide.note(`fold:${id}`)
  }

  function noteOpen(): void {
    if (shown(root.querySelector('[data-testid="work-grid"]'))) guide.note('open:work-grid')
  }

  // The note that is owed, shown or waiting behind a card.
  // A tip never stops the game. The game stops itself for a decision (app.ts, SELF_PAUSES), with its own line saying
  // why; a tip that speaks to that decision stands beside it, and the pause stays the game's.
  let due: Lesson | null = null

  // While a tip is up a day takes no less than four seconds, so it can be read beside what it is about (the
  // owner: "it just needs to pause when the things pop up so you can see it"; a tip passing at eight times speed is
  // not seen). When it goes they go back to the speed they had, Skip ahead included. The player's own hand on the
  // clock while a tip is up is kept: nothing is put back over it.
  // (the first speed where a day is four seconds; where the first speed is a long day, the second)
  const calmAt = (): 1 | 2 | 3 => ([3, 2, 1] as const).find(k => 1 / DAYS_PER_SECOND[k] >= 3.9) ?? 1
  let slowed: { back: 1 | 2 | 3; skip: 0 | 1 | 2 | 3; at: number; to: 1 | 2 | 3 } | null = null
  // The tip the player set the clock under with their own hand: it is not slowed again.
  let theirs = ''
  function calm(tip: string): void {
    const t = performance.now()
    if (slowed && pressedAt > slowed.at) { slowed = null; theirs = tip }
    if (!tip) theirs = ''
    if (tip && tip !== theirs && !slowed && app.speed > calmAt()) {
      slowed = { back: app.speed as 2 | 3, skip: app.skipBack, at: t, to: calmAt() }
      app.setSpeed(slowed.to)
    } else if (slowed && app.speed === 0 && app.pauseCause) {
      // The game stopped for a decision meanwhile: once it is answered the days go on as they would have, at the
      // speed they had, or (a decision Skip ahead was running to) at the speed before the skip.
      const landed = slowed.skip > 0 && (app.pauseCause === 'plantAsk' || app.pauseCause === 'killCall' || app.pauseCause === 'spray' || app.pauseCause === 'over')
      app.resumeSpeed = landed ? slowed.skip as 1 | 2 | 3 : slowed.back
      app.skipBack = landed ? 0 : slowed.skip
      slowed = null
    } else if (!tip && slowed) {
      if (app.speed === slowed.to) { app.setSpeed(slowed.back); app.skipBack = slowed.skip }
      slowed = null
    }
  }

  // 22: one lesson at a time and never a step ahead of the click. After one passes, the next waits a moment, and waits
  // while a panel its click opened (a catalogue fold, a paper, a person's card, the grid) is still open.
  let lastId = ''
  let restUntil = 0
  let waitFor: string[] = []
  const PANELS = ['.cat-open', '.paper-layer > .dialog:not(.out)', '.person-card:not([hidden])', '.work:not([hidden])']
  const panelsOpen = () => PANELS.filter(sel => !!root.querySelector(sel))
  function paced(x: Lesson | null): Lesson | null {
    const t = performance.now()
    if (x?.id !== lastId) {
      // Passed by the player's own word (Got it): the next step may come, and so it may after a step that was about
      // an open fold is done there (someone hired). Passed by opening something: the next waits while that is read,
      // and every fold the walk opens has a note of its own, so the agent never goes quiet over one.
      const said = !!lastId && (guide.has(`noted:${lastId}`) || guide.p.passed[lastId] === 'skip' || !!lesson(lastId)?.follows)
      if (lastId && guide.passed(lastId)) { restUntil = t + (app.screen === 'season' ? TIP_GAP_MS : 1200); waitFor = said ? [] : panelsOpen() }
      lastId = x?.id ?? ''
    }
    // What cannot wait comes at once: an urgent tip, one over a paper, one that follows the click that opened what
    // it is about. In a season any other waits until some seconds have gone by since the last was put away, so two
    // never come back to back and the player sees what came of the one before. Out of a season the next waits a
    // moment, and while a panel the last click opened is still open.
    if (!x || x.urgent || x.paper || x.follows || x.card) return x
    // (a tip that points at a decision is not one that only tells: it comes when its moment does)
    if (app.screen === 'season') { if (t < restUntil && (x.read || x.hint) && !x.asks?.(lookNow())) { stale = true; return null } return x }
    // (for as long as it is open: a step never comes on a timer over what the player is still reading)
    waitFor = waitFor.filter(sel => !!root.querySelector(sel))
    if (t < restUntil || waitFor.length > 0) { stale = true; return null }
    return x
  }
  // One voice: a card that wants an answer (a telegram, the spraying question, a paper) speaks alone.
  function cardUp(l: Look): boolean {
    return !!l.paper || l.asking === 'spray' || ctx.awaiting > 0 || ctx.papers.pending() > 0 || shown(root.querySelector('.telegram:not(.guide-card)')) || shown(root.querySelector('.tray-paper'))
  }

  function render(): void {
    const c = app.campaign
    // Started with the offer unanswered: straight in.
    if (c && app.screen === 'season' && !guide.p.offered && guide.p.offerSeed === c.seed) guide.refuse()
    if (app.screen === 'plan') notePlan()
    if (app.screen === 'season') noteOpen()
    if (shown(root.querySelector('#raise-list'))) guide.note('fold:raise')
    stamps = app.screen === 'season' ? [...root.querySelectorAll<HTMLElement>('.plate-layer [data-testid^="badge-"]')].filter(shown).map(e => Number(e.dataset.testid!.slice(6))) : []
    const l = lookNow()
    offer = guide.offerFor(c, app.screen)
    const carded = cardUp(l)
    l.carded = carded
    const owed = offer || straight ? null : guide.current(l)
    due = paced(owed)
    now = due && carded ? null : due
    const speaks = offer || !!owed
    if (speaking !== speaks) { speaking = speaks; ctx.dirty() }
    root.classList.toggle('agent', speaking)
    // The cards in the middle: the offer, and what a year is.
    const card = offer ? 'offer' : now?.card ? now.id : ''
    if (card !== cardKey) {
      cardKey = card
      if (card) cameAt = performance.now()
      cardSlot.replaceChildren(...(offer ? [offerCard(ctx)] : now?.card ? [frameCard(ctx, now, l)] : []))
      cardSlot.hidden = cardVeil.hidden = !card
      if (card) (cardSlot.querySelector<HTMLElement>('.usual, .guide-ok') ?? cardSlot.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true })
      else if (!papers().length) {
        for (const el of behind()) el.inert = false
        if (app.screen === 'plan') root.querySelector<HTMLElement>('[data-testid="begin-season"]')?.focus({ preventScroll: true })
      }
    }
    if (card) for (const el of behind()) if (!el.inert) el.inert = true
    if (now?.card) now = null
    // The screen grows with the player: what a guided first year has not brought in yet is held back, in its place.
    const hide = guide.hidden(c, app.screen)
    for (const piece of PIECES) root.classList.toggle(`st-hide-${piece}`, hide.includes(piece))
    root.classList.toggle('noting', !!now || !!card)
    root.classList.toggle('guided', guidedYear(c) && app.screen === 'season')
    // In spring the note floats beside the sheet, covering none of its rows; on a phone, where the sheet is the whole
    // width, it sits in the sheet above the order blank.
    const docked = app.screen === 'plan' && ctx.layout() === 'narrow'
    const p = now?.point?.(l) ?? null
    stampKept = p && 'badge' in p ? p.badge : -1
    const t = resolve(ctx, root, p)
    cover = app.screen === 'season' ? coverOf(t) : null
    // A note about the land itself (come closer, turn it) on a phone, with a card over half the land: the card's cross.
    if (!cover && app.screen === 'season' && ctx.layout() === 'narrow' && now?.uses?.some(u => u === 'pan' || u === 'zoom' || u === 'turn')) {
      const sheet = [...root.querySelectorAll('.person-card, .whois, .work, .command.sheet')].find(shown)
      const close = sheet?.querySelector<HTMLElement>('button.close')
      cover = close && shown(close) ? close : null
    }
    target = cover?.dataset.testid ?? (p && 'fields' in p && p.fields.some(i => `field-${i}` === picked) && shown(root.querySelector(`[data-testid="${picked}"]`)) ? picked : t.id)
    // The lesson's own Show me: to a person's control that is not on the screen, or to the field a note with nothing
    // to point at is about.
    const sh = now?.show?.(l) ?? null
    const go = !sh ? null : 'unit' in sh ? (inCard(root.querySelector('[data-testid="person-foreman"]')) ? null : sh) : now?.point ? null : sh
    // Something on the land to point at, none of it in view.
    const lost = !!p && !('testid' in p) && !t.at && app.screen === 'season'
    const fieldOf = !p ? -1 : 'field' in p ? p.field : 'badge' in p ? p.badge : 'fields' in p ? p.fields[0] ?? -1 : -1
    showField = app.screen === 'season' && fieldOf >= 0 && !cover && (lost || hiddenAt(t)) ? fieldOf : -1
    // The spring's notes go into the catalogue; everything else floats.
    if (slot) {
      const inSlot = app.screen === 'plan' && slot.isConnected
      // A fold open that the note is not about keeps all its room: the note waits until it is closed.
      const fold = root.querySelector('.catalogue .cat-open')
      away = docked && !!now && !!fold && !(t.el && fold.contains(t.el))
      const on = inSlot && docked && !away
      patch(slot, JSON.stringify([on && now ? [now.id, now.ask(l), now.why(l), guide.replaying(now.id), lost, !!go] : 0, input]), () =>
        on && now ? h('section', { class: 'guide docked', testid: 'guide-slip', 'data-lesson': now.id, 'data-target': target, 'aria-labelledby': 'guide-ask' }, slipBody(ctx, now, l, lost, !!cover, -1, go)) : null)
      if (on && now) slot.querySelector<HTMLElement>('.guide')?.setAttribute('data-target', target)
    }
    const floating = !!now && !docked
    slip.hidden = !floating
    if (floating && now) {
      patch(slip, JSON.stringify([now.id, now.ask(l), now.why(l), guide.replaying(now.id), input, lost, !!cover, showField, go, now.act?.(l)?.label]), () => slipBody(ctx, now!, l, lost, !!cover, showField, go))
      slip.dataset.lesson = now.id
      slip.dataset.target = target
      slip.dataset.testid = 'guide-slip'
    } else {
      delete slip.dataset.testid
      delete slip.dataset.lesson
      patch(slip, '', () => null)
    }
    // One telling: the answer shown beside the pointer goes when the note itself says that sentence.
    const tip = root.querySelector<HTMLElement>('[data-testid="answer-tip"]')
    if (tip && !tip.hidden && now && tip.textContent && F.localize(`${now.ask(l)} ${now.why(l)}`).includes(tip.textContent)) tip.hidden = true
    // The slip going (passed, Noted, put aside): a press that was meant for it lands on nothing.
    const showing = (floating || (!!slot?.querySelector('.guide.docked:not(.offer)'))) && now ? now.id : ''
    if (shownId && showing !== shownId && slipAt && !l.paper) ghost = { b: slipAt, until: performance.now() + 500 }
    if (showing !== shownId && showing) cameAt = performance.now()
    shownId = showing
    // Each lesson is read out once, politely.
    const words = offer ? 'First time on the farm? The county agent can walk you through your first year. Press 1 to start the tutorial, or 2 to skip it.' : cardKey ? `${due?.ask(l) ?? ''} ${due?.why(l) ?? ''}` : now ? `${now.ask(l)} ${now.why(l)}` : ''
    const key = offer ? 'offer' : cardKey || (now?.id ?? '')
    if (key && key !== said) ctx.announce(words)
    said = key
    calm(app.screen === 'season' ? showing : '')
    // A tip that only tells puts itself away once there has been time to read it: nothing has to be pressed. One that
    // points at something to do stays until it is done, or is skipped.
    if (app.screen === 'season' && now && shownId === now.id && (now.read || now.hint) && !now.asks?.(l) && !now.act?.(l) && !guide.replaying(now.id) && !document.hidden) {
      const count = `${now.ask(l)} ${now.why(l)}`.trim().split(/\s+/).length
      // (a suggestion is given twice as long: there is something to find and press)
      if (performance.now() - cameAt > tipSeconds(count) * (now.hint ? 2000 : 1000)) { if (now.read) guide.noted(now.id); else guide.skip(now.id); stale = true }
    }
  }

  function placeAll(): void {
    const l = now
    const visible = !slip.hidden ? slip : slot?.querySelector<HTMLElement>('.guide.docked:not(.offer)') ?? null
    slipAt = visible ? box(visible.getBoundingClientRect()) : slipAt
    if (!l || away || showField >= 0) { hand.hidden = true; if (!l) place = null; if (!l || away) return }
    const lk = lookNow()
    const pt = l.point?.(lk) ?? null
    const t0r = resolve(ctx, root, pt)
    // Under a card: the fist goes to the card's cross.
    let t = cover && shown(cover) ? { ...t0r, el: cover, at: box(cover.getBoundingClientRect()) } : t0r
    // The fist beside the target, pointing at it: left of it, else right, above, below.
    let fistBox: Box | null = null
    if (t.at && showField < 0) {
      const s = toScreen(44), g = 6
      // In spring the slip is in the catalogue: the fist keeps off it.
      const docked = slot?.isConnected ? slot.querySelector('.guide')?.getBoundingClientRect() : undefined
      const inside = ([x, y]: [number, number, string]) => x >= 4 && y >= 4 && x + s <= innerWidth - 4 && y + s <= innerHeight - 4
      const free = ([x, y]: [number, number, string]) => !docked || !meets({ left: x, top: y, right: x + s, bottom: y + s }, box(docked))
      // Never over another control it would hide (a clock, a command bar, a paper), nor over anything to be read.
      const hard = [...hardOnes(root), ...[...root.querySelectorAll('.goal')].filter(shown).map(e => box(e.getBoundingClientRect()))]
      const t0 = performance.now()
      if (!busy || t0 - busyAt > 250) { busy = busyBoxes(root); busyAt = t0 }
      const moving = [...root.querySelectorAll<HTMLElement>('.plate-layer, .pin-at, .pin-list-at, .yard-at')].flatMap(e => busyBoxes(e))
      const words = [...busy, ...moving]
      const clear = ([x, y]: [number, number, string]) => !hard.some(a => meets({ left: x, top: y, right: x + s, bottom: y + s }, a)) && bareAt(words, pad({ left: x, top: y, right: x + s, bottom: y + s }, 2))
      // And off the field tags where it can be, so the name of what it points at stays readable.
      const tags = [...root.querySelectorAll('.plate-layer .tag')].filter(shown).map(e => box(e.getBoundingClientRect()))
      const bare = ([x, y]: [number, number, string]) => !tags.some(a => meets({ left: x, top: y, right: x + s, bottom: y + s }, a))
      // With no clear place beside it (inside a telegram, under the order blank on a phone) the slip's words do alone.
      const small = ctx.layout() === 'narrow' || ctx.layout() === 'short'
      const fitFor = (at: Box): [number, number, string] | null => {
        const cx = (at.left + at.right) / 2, cy = (at.top + at.bottom) / 2
        const up: [number, number, string] = [cx - s / 2, at.top - s - g, 'd'], down: [number, number, string] = [cx - s / 2, at.bottom + g, 'u']
        // Beside it, else toward the middle of the screen from it.
        const tries: [number, number, string][] = [[at.left - s - g, cy - s / 2, 'r'], [at.right + g, cy - s / 2, 'l'], ...(cy < innerHeight / 2 ? [down, up] : [up, down])]
        return docked && small ? null : tries.find(f => inside(f) && free(f) && clear(f) && bare(f)) ?? tries.find(f => inside(f) && free(f) && clear(f)) ?? null
      }
      // Any of several fields will do: the first whose tag has room for the fist beside it.
      const options = !cover && pt && 'fields' in pt ? pt.fields.map(i => resolve(ctx, root, { field: i })).filter(x => !!x.at && !hiddenAt(x)) : [t]
      let fit: [number, number, string] | null = null
      for (const o of options) { fit = fitFor(o.at!); if (fit) { t = o; break } }
      if (fit) {
        fistBox = { left: fit[0], top: fit[1], right: fit[0] + s, bottom: fit[1] + s }
        hand.style.transform = `translate3d(${toLocal(fit[0]).toFixed(1)}px, ${toLocal(fit[1]).toFixed(1)}px, 0)`
        hand.dataset.to = fit[2]
        if (t.id !== picked) { picked = t.id; if (!slip.hidden) slip.dataset.target = target = t.id }
      }
    }
    hand.hidden = !fistBox
    const noteBox: Box | null = null
    if (slip.hidden) return
    const key = `${l.id}|${innerWidth}x${innerHeight}|${toScreen(slip.offsetWidth)}x${toScreen(slip.offsetHeight)}`
    const t0 = performance.now()
    // Every frame: nothing it must never cover has come over it (a card sliding in, a telegram).
    const cat = app.screen === 'plan' ? root.querySelector('.catalogue') : null
    const catBox = cat && shown(cat) ? [box(cat.getBoundingClientRect())] : []
    const must = [...hardOnes(root), ...catBox, ...(t.at ? [pad(t.at, 10)] : []), ...(fistBox ? [pad(fistBox, 4)] : []), ...(noteBox ? [noteBox] : [])]
    const at = place ? { left: place.x, top: place.y, right: place.x + toScreen(slip.offsetWidth), bottom: place.y + toScreen(slip.offsetHeight) } : null
    if (placedFor === key && t0 - checked < 250 && (!at || !must.some(a => meets(at, a)))) return
    checked = t0
    const { hard, soft, costs } = obstacles(root)
    hard.push(...catBox)
    if (t.at) hard.push(pad(t.at, 10))
    if (fistBox) hard.push(pad(fistBox, 4))
    if (noteBox) hard.push(noteBox)
    const w = toScreen(slip.offsetWidth), ht = toScreen(slip.offsetHeight)
    const here = place ? { left: place.x, top: place.y, right: place.x + w, bottom: place.y + ht } : null
    // Stay put while the place is still clear; move only when something comes over it.
    const retry = tier !== 0 && t0 - placedAt > 1000
    if (here && placedFor === key && !retry && !(tier === 0 ? [...hard, ...soft] : tier === 1 ? hard : []).some(a => meets(here, pad(a, 6)))) return
    let found: { x: number; y: number } | null = null
    // First off every panel and every field tag; then off the panels; then off only what it must never cover.
    const tags = [...root.querySelectorAll('.plate-layer .tag')].filter(shown).map(e => box(e.getBoundingClientRect()))
    // Over a panel only when it must, and then short, where it hides least.
    // Last, short, over a person's card or the list rather than not at all: a clock, a command bar, a question, a paper
    // and what it points at are still never covered.
    const must2 = [...[...root.querySelectorAll('.clock, .command, .telegram, .dialog, [data-testid="paused"], .tray-paper')].filter(shown).map(e => box(e.getBoundingClientRect())),
      ...catBox, ...(t.at ? [pad(t.at, 10)] : []), ...(fistBox ? [pad(fistBox, 4)] : []), ...(noteBox ? [noteBox] : [])]
    const holder = t.el?.closest('.queue, .cat-open, .command, .person-card, .work')
    if (holder) must2.push(box(holder.getBoundingClientRect()))
    for (const [k, compact, also] of [[0, false, tags], [0, false, []], [0, true, []], [1, true, []], [1, false, []], [2, true, []]] as const) {
      slip.classList.toggle('compact', compact)
      found = findPlace(toScreen(slip.offsetWidth), toScreen(slip.offsetHeight), [...(k === 0 ? [...hard, ...soft] : k === 1 ? hard : must2), ...also].map(a => pad(a, 8)), k === 0 ? [] : costs)
      if (found) { tier = k; break }
    }
    slip.classList.toggle('gone', !found)
    place = found
    placedFor = `${l.id}|${innerWidth}x${innerHeight}|${toScreen(slip.offsetWidth)}x${toScreen(slip.offsetHeight)}`
    placedAt = t0
    if (found) slip.style.transform = `translate3d(${+toLocal(found.x).toFixed(2)}px, ${+toLocal(found.y).toFixed(2)}px, 0)`
  }

  return {
    frame(dt: number) {
      since += dt
      // One voice: a card that comes while a tip is up (a telegram, a paper, the test-dig tray) has the tip put away
      // in the same frame, not at the next look.
      if (shownId && (ctx.awaiting > 0 || ctx.papers.pending() > 0 || shown(root.querySelector('.telegram:not(.guide-card)')) || shown(root.querySelector('.tray-paper')))) stale = true
      if (stale || since > 300) {
        stale = false
        since = 0
        render()
      }
      if (now && (now.id === 'watch' || now.id === 'turn') && app.screen === 'season') watchCamera()
      placeAll()
    },
    dispose() {
      off()
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('keydown', onCardKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      for (const k of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'contextmenu']) window.removeEventListener(k, swallow, true)
      window.removeEventListener('click', twice, true)
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) document.removeEventListener(t, onCanvas, true)
      document.removeEventListener('pointercancel', onLift, true)
      document.removeEventListener('keydown', onCamKey, true)
      document.removeEventListener('keyup', onCamKey, true)
      slip.remove()
      hand.remove()
    },
  }
}

