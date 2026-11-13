// The guided first year on screen (src/game/tutorial.ts holds the lessons): the county agent's printed slip, one at a
// time, set where it covers nothing it is about, and the printer's fist on the one control it asks for. In spring the
// slip is tucked into the seed catalogue above the order blank; elsewhere it floats over the land.
import { SPEED_X } from '../game/app.ts'
import { driving, Guide, lesson, LESSONS, localStore, openAsks, PART_NAME, PIECES, SCENE_SECONDS, type Input, type Lesson, type Look, type Part, type Point, type Show } from '../game/tutorial.ts'
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { plantingIn } from './rules.ts'
import { showForemanKey } from './people.ts'
import { fist, key } from './system/parts.ts'
import './system/tutorial.css'

export const guide = new Guide(localStore())
// Set by the mounted guide: a key on a note takes effect on the next frame, not the next look round.
let poke: () => void = () => {}
// The pause reason the guide's own hold leaves on the clock.
export const HOLD = 'Paused for a tip from the county agent.'
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
        h('label', { class: 'check guide-on' },
          h('span', { class: 'check-in' }, h('input', {
            type: 'checkbox', checked: guide.drives(ctx.app.campaign), disabled: !guide.on, testid: 'guide-clock',
            onchange: (e: Event) => { if ((e.target as HTMLInputElement).checked) guide.giveClock(); else guide.takeClock(); draw(); ctx.dirty() },
          }), h('i', { class: `tick${guide.drives(ctx.app.campaign) ? ' on' : ''}` })),
          h('span', null, h('b', null, 'Run the clock for me'), ' ', h('span', { class: 'quiet' }, 'time runs on between tips and stops at each decision'))),
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

function holdLine(): HTMLElement {
  return h('span', { class: 't-label guide-held', testid: 'guide-held' }, icon('pause', 'i'), 'Paused')
}

// lost: what it points at is on the land but out of view, so the slip says how to bring the farm back.
// back: the speed the game resumes at when the note is closed (0: it stays paused, because it was paused before or
// because the note asks for a press on the land; -1: no clock here).
// go: where the lesson's own Show me leads, when what it is about is not on the screen.
// clock: whose the clock is between notes in this season ('' out of one): the guide runs it on by itself, or it is
// the player's and the note offers to take it back.
function slipBody(ctx: Ctx, x: Lesson, l: Look, held: boolean, lost = false, under = false, show = -1, clock: 'guide' | 'player' | '' = '', back = -1, go: Show | null = null): (HTMLElement | null)[] {
  const again = guide.replaying(x.id)
  const where = PART_NAME[x.part]
  const done = () => { guide.noted(x.id); poke(); ctx.dirty() }
  const act = x.act?.(l) ?? null
  // Each key that touches the clock says what it does to it.
  const resumes = back < 0 ? null : h('span', { class: 'sub', testid: 'guide-resumes' }, back <= 0 ? 'stays paused' : clock === 'guide' ? 'time runs on' : `resumes at ${SPEED_X[back]}`)
  const lead = (s: Show) => { if ('field' in s) { ctx.app.select(s.field); ctx.app.focus(s.field) } else { if (s.foreman) showForemanKey(); ctx.app.selectUnit(s.unit); ctx.dirty() } }
  return [
    h('header', { class: 'guide-head' },
      h('p', { class: 't-label' }, 'The county agent'),
      held ? holdLine() : h('p', { class: 't-label guide-n' }, where)),
    h('p', { class: 'guide-ask', id: 'guide-ask' }, x.ask(l)),
    h('p', { class: 'guide-why t-caption' }, x.why(l)),
    lost ? h('p', { class: 'guide-lost t-caption', testid: 'guide-lost' }, icon('field', 'i'), by(l.input, 'It\'s off screen. Press Home or double-click open ground to see the farm again.', 'It\'s off screen. Double-tap open ground to see the farm again.', 'It\'s off screen. Press Home to see the farm again.')) : null,
    show >= 0 && !lost ? h('p', { class: 'guide-lost t-caption', testid: 'guide-hidden' }, icon('field', 'i'), 'Something is covering it. ',
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-show', onclick: () => ctx.app.focus(show) }, 'Show me')) : null,
    show >= 0 && lost ? h('p', { class: 'guide-lost t-caption' }, h('button', { class: 'btn quiet', type: 'button', testid: 'guide-show', onclick: () => ctx.app.focus(show) }, 'Show me')) : null,
    under ? h('p', { class: 'guide-lost t-caption', testid: 'guide-under' }, icon('close', 'i'), by(l.input, 'A card is in the way. Click its X to close it.', 'A card is in the way. Tap its X to close it.', 'A card is in the way. Use its X to close it.')) : null,
    h('footer', { class: 'guide-foot' },
      act ? h('button', { class: 'btn guide-ok', type: 'button', testid: 'guide-act', onclick: () => { let said = ''; for (const cmd of act.cmds) { const r = ctx.run(cmd); said = (r.ok ? r.events[0]?.text : r.err) ?? said } const text = act.done ?? said; if (text) ctx.say(F.localize(text), 'good'); done() } }, icon('check', 'i'), act.label) : null,
      // Every note has a Got it. On one that points at a control (guide-pass) it passes the step without doing it.
      x.read || again ? h('button', { class: `btn${act ? '' : ' guide-ok'}`, type: 'button', testid: 'guide-noted', onclick: done }, icon('check', 'i'), h('span', { class: 'two' }, 'Got it', resumes))
        : h('button', { class: 'btn', type: 'button', testid: 'guide-pass', onclick: () => { guide.skip(x.id); poke(); ctx.dirty() } }, icon('check', 'i'), h('span', { class: 'two' }, 'Got it', resumes)),
      go && show < 0 ? h('button', { class: 'btn quiet', type: 'button', testid: 'guide-show', onclick: () => lead(go) }, 'Show me') : null,
      // The clock is the player's: the guide offers, once a note, to run it again.
      clock === 'player' ? h('button', { class: 'btn quiet', type: 'button', testid: 'guide-give', onclick: () => { guide.giveClock(); poke(); ctx.dirty() } }, 'Run the clock for me') : null,
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-stop', onclick: () => { guide.stop(); poke(); ctx.say('The tutorial is off. You can turn it back on from the menu.'); ctx.dirty() } }, 'Turn off the tutorial')),
  ]
}

// The guide's line while it runs the clock: what is passing and what comes next, and the key that takes the clock.
// waits: it is waiting for a press instead, and the player can send it on without one.
function driveBody(ctx: Ctx, line: string, next: string, waits: (() => void) | null, take: () => void): HTMLElement[] {
  return [
    h('p', { class: 'gd-line', testid: 'guide-drive-line' }, line),
    h('p', { class: 'gd-next t-caption', testid: 'guide-drive-next' }, next),
    h('footer', { class: 'guide-foot' },
      waits ? h('button', { class: 'btn quiet', type: 'button', testid: 'guide-wave', onclick: () => { waits(); poke(); ctx.dirty() } }, 'Go on without it') : null,
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-take', onclick: () => { take(); poke(); ctx.dirty() } }, 'Take the clock')),
  ]
}

// The offer: a card in the middle of the screen, as a telegram is, with two numbered replies.
function offerCard(ctx: Ctx): HTMLElement {
  const keys = !ctx.touch()
  const reply = (n: number, id: string, title: string, does: string, usual: boolean, go: () => void) => h('button', {
    class: `reply${usual ? ' first usual' : ''}`, type: 'button', testid: id, 'aria-keyshortcuts': keys ? String(n) : null, onclick: () => { go(); poke(); ctx.dirty() },
  }, key(String(n)), h('b', { class: 'c-title' }, title, usual ? fist() : null), h('span', { class: 'c-does' }, does))
  return h('section', { class: 'guide-card offer telegram sheet sys', testid: 'guide-offer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-offer-h' },
    h('header', { class: 'gc-head' }, h('p', { class: 't-label' }, 'From the county agent'), h('h2', { class: 't-title', id: 'guide-offer-h' }, 'First time on the farm?')),
    h('p', { class: 'gc-lead' }, 'I can walk you through your first year one step at a time, pausing the game to explain each one.'),
    h('div', { class: 'replies', role: 'group', 'aria-label': 'Your answer' },
      reply(1, 'guide-accept', 'Start the tutorial', 'The usual choice. You can turn it off any time.', true, () => guide.accept()),
      reply(2, 'guide-refuse', 'Skip the tutorial', 'Play without tips. You can turn it on later from the menu.', false, () => guide.refuse())))
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
  // The guide's line while it runs the clock between notes. It is not a note: nothing is paused for it.
  const driveEl = h('aside', { class: 'guide-drive sheet sys', 'aria-label': 'The county agent is running the clock', hidden: true })
  layer.append(cardVeil, cardSlot, slip, driveEl, hand)
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
  // When the player last touched the clock themselves: a clock the game sets going (a paper closing) is held again.
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
      stopped: app.pauseReason === HOLD ? '' : app.pauseReason,
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

  // Every note pauses the game the moment it comes, and closing it puts the game back at the speed it had just
  // before: the speed on the clock then, never one remembered from earlier. A game the player had paused stays
  // paused. The player's own press on the clock closes the note (a note only to be read is noted; one that asks is
  // skipped) and runs the game. due: the note that is owed, shown or waiting behind a card.
  // stay: the note asks for a press on the land, so the game stays paused when the note goes, whether by Got it or
  // by the thing being done: a press on a stamp never changes the speed. The player resumes when they're ready.
  let holding: { id: string; speed: number; stay: boolean } | null = null
  let due: Lesson | null = null
  // The speed it had is the speed the clock's own keys resume at, Space included.
  const waitsOnLand = () => app.pauseCause === 'plantAsk' || app.pauseCause === 'killCall'
  function stopNow(): void { if (app.speed > 0) app.resumeSpeed = app.speed; app.setSpeed(0); app.pauseReason = HOLD; ctx.dirty() }
  function hold(l: Look): void {
    const t = performance.now()
    const want = due && app.screen === 'season' ? due.id : ''
    const stay = !!want && !!due!.asks?.(l)
    if (holding && want && app.speed > 0) {
      if (t - pressedAt < 1500 && now) {
        // The player's press: the note goes, and the days are theirs.
        if (now.read) guide.noted(now.id); else guide.skip(now.id)
        holding = null
        stale = true
        return
      }
      // The game set the clock going itself (a telegram answered, a paper closed): paused again, and that speed is
      // the one the note goes back to.
      holding.speed = app.speed
      stopNow()
      return
    }
    if (want && !holding) {
      // Running: paused here. Paused by the game for a card: the speed it would resume at. Paused by the player: it
      // stays so.
      const speed = app.speed > 0 ? app.speed : app.pauseReason && app.pauseReason !== HOLD ? app.resumeSpeed || 1 : 0
      holding = { id: want, speed, stay }
      if (app.speed > 0) stopNow()
      // The game's own pause for the decision this note asks for (app.ts, SELF_PAUSES) is the note's from here.
      else if ((app.pauseCause === 'plantAsk' && want === 'word') || (app.pauseCause === 'killCall' && want === 'kill')) { app.pauseReason = HOLD; app.pauseCause = ''; ctx.dirty() }
    } else if (want && holding) { holding.id = want; holding.stay = stay }
    else if (!want && holding) {
      const back = holding.speed
      const stays = holding.stay
      holding = null
      const c = app.campaign
      if (stays) {
        // The pause becomes the player's own: Space, or the clock, resumes at the speed the game had.
        if (app.speed === 0 && app.pauseReason === HOLD) { app.pauseReason = ''; ctx.dirty() }
        return
      }
      // Where the guide runs the clock, it sets the days going itself a moment after the note (runClock).
      if (guide.drives(c)) return
      // A card still up keeps the clock.
      // So does a pause the game made for a decision on the land: only the player's own resume runs past that.
      if (back > 0 && app.speed === 0 && app.pauseReason !== '' && !waitsOnLand() && !app.holding && app.screen === 'season' && c && !S.seasonDone(c) && !cardUp(lookNow())) app.setSpeed(back as 1 | 2 | 3)
    }
  }

  // The guide runs the clock between its notes (game/tutorial.ts, driving): fast where nothing teaches, slowed and
  // framed the first time each kind of work is done, stopped for a press the year waits on. It only ever sets the
  // speed: every pause the game makes itself (app.ts, SELF_PAUSES), every card and every note stops it as they stop
  // anyone. The player's own hand on the clock (a speed, a pause, "Take the clock") takes it for good; a note
  // offers to take it back.
  let driven = false
  let scene: { id: string; unit: number; line: string; until: number } | null = null
  // Not before this: a moment after a note goes or a press is answered, so the answer is read before the days run.
  let beatAt = 0
  let seenPress = pressedAt
  let onScreen: string = app.screen
  let hadNote = false
  let hadWait = false
  let waitOn = ''
  let waitSince = 0
  let waitFramed = false
  let driveKey = ''
  let driveShown = false
  let driveSaid = ''
  let drivePlace: { x: number; y: number } | null = null
  let drivePlacedFor = ''
  let driveChecked = 0
  // Asks the player sent the guide on without, for as long as each stays open.
  const waved = new Set<string>()
  const wavedGone = new Map<string, number>()
  function endScene(home: boolean): void {
    if (!scene) return
    if (scene.unit >= 0 && ctx.view.followed() === scene.unit) ctx.view.follow(-1)
    if (home && app.screen === 'season') app.focus(-1)
    scene = null
  }
  function letGo(): void {
    endScene(false)
    if (driven) { app.pace = 1; driven = false }
  }
  function takeClock(): void {
    guide.takeClock()
    letGo()
    if (app.speed > 1) app.setSpeed(1)
    ctx.say(app.speed > 0 ? 'The clock is yours, and it\'s running at 1×.' : 'The clock is yours.')
  }
  // wait: the ask the guide is waiting on ('' when it runs), and the field its stamp is on.
  function showDrive(line: string, next: string, wait: string, field = -1): void {
    const key = JSON.stringify([line, next, wait, input])
    if (key !== driveKey || driveEl.hidden) {
      driveKey = key
      driveEl.hidden = false
      driveEl.dataset.testid = 'guide-drive'
      driveEl.dataset.scene = scene?.id ?? ''
      driveEl.dataset.unit = String(scene?.unit ?? -1)
      driveEl.dataset.wait = wait ? String(field) : ''
      // Sent on without the press: that is the player's answer to a pause the game made for it, too.
      const wave = () => { waved.add(wait); if (app.speed === 0 && (app.pauseCause === 'plantAsk' || app.pauseCause === 'killCall')) { app.pauseReason = HOLD; app.pauseCause = '' } }
      driveEl.replaceChildren(...driveBody(ctx, line, next, wait ? wave : null, takeClock))
    }
    driveShown = true
    if (line !== driveSaid) { driveSaid = line; ctx.announce(`${line} ${next}`) }
  }
  function hideDrive(): void {
    driveShown = false
    if (driveEl.hidden) return
    driveEl.hidden = true
    delete driveEl.dataset.testid
    driveEl.replaceChildren()
    driveKey = ''
    drivePlace = null
  }
  function runClock(l: Look, carded: boolean): void {
    const c = app.campaign
    const t = performance.now()
    // The player's own hand on the clock takes it.
    if (pressedAt > seenPress) {
      seenPress = pressedAt
      if (app.screen === 'season' && guide.drives(c)) { guide.takeClock(); letGo(); ctx.say('The clock is yours now. I\'ll still pause to explain things.') }
    }
    const noted = !!due || !!holding
    if (noted) hadNote = true
    else if (hadNote) { hadNote = false; beatAt = Math.max(beatAt, t + 700) }
    // A season come back to (Continue) is paused: the guide says what is passing a moment before it runs on.
    if (app.screen !== onScreen) { if (app.screen === 'season' && app.speed === 0) beatAt = Math.max(beatAt, t + 1800); onScreen = app.screen }
    const open = app.screen === 'season' ? openAsks(l) : []
    // An ask waved through is not asked again: the word to plant until the crew has started (its stamps come and go
    // with the weather), any other until it has been gone two seconds (a day's turn takes the stamps down a moment).
    for (const id of [...waved]) {
      if (open.some(a => a.id === id) || (id === 'word' && c?.season && !S.plantWordGiven(c.season))) { wavedGone.delete(id); continue }
      const gone = wavedGone.get(id) ?? t
      wavedGone.set(id, gone)
      if (t - gone > 2000) { waved.delete(id); wavedGone.delete(id) }
    }
    const d = !offer && !noted && !carded && !app.holding && app.screen === 'season' ? driving(l, guide, waved) : null
    // A note or a card that cuts a showing short gets the whole farm back, where the stamps it may point at are in
    // view; the player's own hand on the clock leaves the picture where they are watching it.
    if (!d) { if (scene && guide.drives(c)) endScene(true); letGo(); hideDrive(); return }
    if (d.waits) {
      // A press the year waits on: the guide stops its own clock and says what it is waiting for, over the whole farm.
      endScene(true)
      if (app.speed > 0) { app.resumeSpeed = app.speed; app.setSpeed(0); app.pauseReason = HOLD; ctx.dirty() }
      app.pace = 1
      driven = false
      hadWait = true
      showDrive(d.line, d.next, d.waits.id, d.waits.field)
      // The stamp it asks for must be there to press. Off the screen or under something once the picture has
      // settled (on a phone a person's pin can stand over it): its field is brought up close, once.
      if (waitOn !== d.waits.id) { waitOn = d.waits.id; waitSince = t; waitFramed = false }
      if (!waitFramed && t - waitSince > 1400) {
        const el = root.querySelector<HTMLElement>(`[data-testid="badge-${d.waits.field}"]`)
        if (!shown(el) || hiddenAt({ el, at: box(el.getBoundingClientRect()) })) { waitFramed = true; app.focus(d.waits.field) }
      }
      return
    }
    if (hadWait) { hadWait = false; waitOn = ''; if (waitFramed) app.focus(-1); beatAt = Math.max(beatAt, t + 900) }
    if (scene && t >= scene.until) { endScene(true); beatAt = Math.max(beatAt, t + 300) }
    // Work is watched only while the player is looking at nothing of their own: no card open, nobody picked. And
    // someone is followed only while they are out on the land (indoors, the camera would show the house).
    if (!scene && d.scene && t >= beatAt && app.selection.length === 0 && app.unit < 0 && app.yard === 0 && (d.scene.unit < 0 || ctx.view.unitPlace(d.scene.unit) !== 'away')) {
      guide.note(`seen:${d.scene.id}`)
      scene = { id: d.scene.id, unit: d.scene.unit, line: d.scene.line, until: t + SCENE_SECONDS * 1000 }
      if (scene.unit >= 0) ctx.view.follow(scene.unit); else app.focus(d.scene.field)
    }
    // The planter is the first thing the guide moves the camera to: the hands for moving it are said there.
    const line = scene ? scene.line : d.line
    const next = scene ? (scene.id === 'plant' ? by(input, 'Drag to look around, and scroll to zoom.', 'Drag to look around, and pinch to zoom.', 'The arrow keys look around.') : 'I\'ll go on in a moment.') : d.next
    if (app.speed === 0) {
      // A pause the game made (a decision, the season's end) or one the player's own is never the guide's to end;
      // only its own, and the one a note that asked for a press left behind.
      const own = app.pauseCause === '' && (app.pauseReason === '' || app.pauseReason === HOLD)
      if (!own) { letGo(); hideDrive(); return }
      showDrive(line, next, '')
      if (t < beatAt) return
    }
    // While the player has a card of their own open (a field, a person, a yard) the days go at the first speed, so
    // what they are reading does not change under them.
    const slow = !!scene || app.selection.length > 0 || app.unit >= 0 || app.yard !== 0
    const want = slow ? 1 : d.speed
    if (app.speed !== want) app.setSpeed(want)
    if (app.speed === 0) { hideDrive(); return }
    app.pace = slow ? 1 : d.pace
    driven = true
    showDrive(line, next, '')
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
      if (lastId && guide.passed(lastId)) { restUntil = t + 1200; waitFor = said ? [] : panelsOpen() }
      lastId = x?.id ?? ''
    }
    // In a season the next note follows at once and takes over the hold: no days run between two notes. Out of it,
    // the next waits a moment, and while a panel the last click opened is still open.
    if (!x || app.screen === 'season' || x.urgent || x.paper || x.follows || x.card) return x
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
    const owed = offer ? null : guide.current(l)
    due = paced(owed)
    now = due && carded ? null : due
    hold(l)
    runClock(l, carded)
    // The guide's line while it runs the clock is its voice too: the goal slip stands down for it as for a note.
    const speaks = offer || !!owed || driveShown
    if (speaking !== speaks) { speaking = speaks; ctx.dirty() }
    root.classList.toggle('agent', speaking)
    root.classList.toggle('driven', driveShown)
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
    const held = !!now && app.screen === 'season' && app.speed === 0
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
    // Whose the clock is in this season: the guide's own Got it says time runs on (unless a press is still waited on).
    const clock = app.screen !== 'season' || !guide.on ? '' : guide.drives(c) ? 'guide' : 'player'
    const back = app.screen === 'season' && now ? (now.asks?.(l) || waitsOnLand() ? 0 : clock === 'guide' ? (openAsks(l).some(a => !waved.has(a.id)) ? 0 : 3) : holding?.speed ?? 0) : -1
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
        on && now ? h('section', { class: 'guide docked', testid: 'guide-slip', 'data-lesson': now.id, 'data-target': target, 'aria-labelledby': 'guide-ask' }, slipBody(ctx, now, l, held, lost, !!cover, -1, '', -1, go)) : null)
      if (on && now) slot.querySelector<HTMLElement>('.guide')?.setAttribute('data-target', target)
    }
    const floating = !!now && !docked
    slip.hidden = !floating
    if (floating && now) {
      const season = app.screen === 'season'
      patch(slip, JSON.stringify([now.id, now.ask(l), now.why(l), held, guide.replaying(now.id), input, lost, !!cover, showField, season && clock, back, go, now.act?.(l)?.label]), () => slipBody(ctx, now!, l, held, lost, !!cover, showField, season ? clock : '', back, go))
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
      const s = 44, g = 6
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
        hand.style.transform = `translate3d(${fit[0].toFixed(1)}px, ${fit[1].toFixed(1)}px, 0)`
        hand.dataset.to = fit[2]
        if (t.id !== picked) { picked = t.id; if (!slip.hidden) slip.dataset.target = target = t.id }
      }
    }
    hand.hidden = !fistBox
    const noteBox: Box | null = null
    if (slip.hidden) return
    const key = `${l.id}|${innerWidth}x${innerHeight}|${slip.offsetWidth}x${slip.offsetHeight}`
    const t0 = performance.now()
    // Every frame: nothing it must never cover has come over it (a card sliding in, a telegram).
    const cat = app.screen === 'plan' ? root.querySelector('.catalogue') : null
    const catBox = cat && shown(cat) ? [box(cat.getBoundingClientRect())] : []
    const must = [...hardOnes(root), ...catBox, ...(t.at ? [pad(t.at, 10)] : []), ...(fistBox ? [pad(fistBox, 4)] : []), ...(noteBox ? [noteBox] : [])]
    const at = place ? { left: place.x, top: place.y, right: place.x + slip.offsetWidth, bottom: place.y + slip.offsetHeight } : null
    if (placedFor === key && t0 - checked < 250 && (!at || !must.some(a => meets(at, a)))) return
    checked = t0
    const { hard, soft, costs } = obstacles(root)
    hard.push(...catBox)
    if (t.at) hard.push(pad(t.at, 10))
    if (fistBox) hard.push(pad(fistBox, 4))
    if (noteBox) hard.push(noteBox)
    const w = slip.offsetWidth, ht = slip.offsetHeight
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
      found = findPlace(slip.offsetWidth, slip.offsetHeight, [...(k === 0 ? [...hard, ...soft] : k === 1 ? hard : must2), ...also].map(a => pad(a, 8)), k === 0 ? [] : costs)
      if (found) { tier = k; break }
    }
    slip.classList.toggle('gone', !found)
    place = found
    placedFor = `${l.id}|${innerWidth}x${innerHeight}|${slip.offsetWidth}x${slip.offsetHeight}`
    placedAt = t0
    if (found) slip.style.transform = `translate3d(${found.x}px, ${found.y}px, 0)`
  }

  // The guide's line: the first free place nearest the top of the land and its middle, off every panel. It stays put
  // while that place is clear, so it does not jump as tags pass under it.
  function placeDrive(): void {
    if (driveEl.hidden) return
    const t = performance.now()
    const w = driveEl.offsetWidth, ht = driveEl.offsetHeight
    const ins = app.insets
    const narrow = ctx.layout() === 'narrow'
    const wait = driveEl.dataset.wait ?? ''
    const key = `${innerWidth}x${innerHeight}|${w}x${ht}|${scene?.id ?? ''}|${wait}|${narrow ? `${ins.top} ${ins.bottom}` : ''}`
    if (drivePlace && key === drivePlacedFor && t - driveChecked < 500) return
    driveChecked = t
    const { hard, soft, costs } = obstacles(root)
    // Never over what the line is about: the one the camera is following, who is brought to the middle of the free
    // land with their pin over them, and the stamp it waits on.
    const keep: Box[] = []
    const cy = (ins.top + innerHeight - ins.bottom) / 2
    if (scene && scene.unit >= 0) { const cx = (ins.left + innerWidth - ins.right) / 2; keep.push({ left: cx - 80, top: cy - 140, right: cx + 80, bottom: cy + 30 }) }
    const stamp = wait ? root.querySelector<HTMLElement>(`[data-testid="badge-${wait}"]`) : null
    if (stamp && shown(stamp)) keep.push(pad(box(stamp.getBoundingClientRect()), 10))
    const here = drivePlace ? { left: drivePlace.x, top: drivePlace.y, right: drivePlace.x + w, bottom: drivePlace.y + ht } : null
    if (here && key === drivePlacedFor && ![...hard, ...soft].some(a => meets(here, pad(a, 6))) && !keep.some(a => meets(here, a))) return
    // On a phone the land is a strip between the boards, and its top is where a followed worker's head comes: while
    // the clock runs the line lies along the foot of the land, over the boards there.
    const low = narrow && !wait ? { x: Math.round((innerWidth - w) / 2), y: Math.round(innerHeight - ins.bottom - ht - 8) } : null
    const lowBox = low ? { left: low.x, top: low.y, right: low.x + w, bottom: low.y + ht } : null
    const found = (low && lowBox && low.y > cy && !hard.some(a => meets(lowBox, pad(a, 4))) ? low : null)
      ?? findPlace(w, ht, [...hard, ...soft].map(a => pad(a, 8)).concat(keep))
      ?? findPlace(w, ht, hard.map(a => pad(a, 8)).concat(keep), costs)
      ?? findPlace(w, ht, hard.map(a => pad(a, 8)), costs)
    driveEl.classList.toggle('gone', !found)
    drivePlace = found
    drivePlacedFor = key
    if (found) driveEl.style.transform = `translate3d(${found.x}px, ${found.y}px, 0)`
  }

  return {
    frame(dt: number) {
      since += dt
      if (stale || since > 300) {
        stale = false
        since = 0
        render()
      }
      if (now && (now.id === 'watch' || now.id === 'turn') && app.screen === 'season') watchCamera()
      placeAll()
      placeDrive()
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
      letGo()
      slip.remove()
      driveEl.remove()
      hand.remove()
    },
  }
}

