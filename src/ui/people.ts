// People (design/people.html): a page of the time book for one person, and the work grid with the farm's rules.
import * as S from '../sim/index.ts'
import { keepSprayedLine } from './spray-words.ts'
import { confirmPaper, EXIT_MS, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME } from './map.ts'
import { personNow } from './now.ts'
import * as R from './rules.ts'
import { tens } from './system/parts.ts'
import { portrait as bust, ringed, ringOf } from './system/people.ts'
import { nextGoal } from '../game/goals.ts'

// A head and shoulders in the colours the figure on the land wears: the system's portrait (src/ui/system/people.ts).
// Old screens size it with their own class.
export function portrait(who: { name: string }, cls = 'portrait'): SVGElement {
  return bust(who, 24, cls)
}

// What a person did on the last day worked, or null. Between days most hold no order, so this is what they are at.
function lastWorked(c: S.Campaign, id: number): { kind: S.JobKind; field: number } | null {
  const w = c.season?.worked.filter(x => x.unit === id) ?? []
  return w.length ? w[w.length - 1] : null
}

// What a person is doing, as a glyph and in words: as the time book says it (now.ts).
export function doingGlyph(c: S.Campaign, p: S.PersonInfo, waits: Record<number, string> = {}): string {
  return personNow(c, p.id, waits).glyph
}

export function doingText(c: S.Campaign, p: S.PersonInfo, waits: Record<number, string> = {}): string {
  return personNow(c, p.id, waits).line
}

// Whether someone stood idle through the last working day while orders they could take waited on the list: their
// priorities hold them back, or there was no tractor free.
export function idleWithWork(c: S.Campaign, p: S.PersonInfo, waits: Record<number, string>): boolean {
  const s0 = c.season
  if (!s0 || c.phase !== 'season' || s0.frozen || s0.day <= s0.startDay || p.job || p.travelling || p.foreman || p.hurtUntil >= 0 || !S.workday(c, s0)) return false
  if (lastWorked(c, p.id)) return false
  const u = c.crew.find(x => x.id === p.id)
  // An order someone else worked on the last day is theirs: one person holds an order at a time.
  const others = new Set(s0.worked.filter(w => w.unit !== p.id).map(w => `${w.kind}|${w.field}`))
  const held = new Set(c.crew.filter(x => x.id !== p.id).map(x => x.job))
  return !!u && s0.jobs.some(j => !waits[j.id] && !held.has(j.id) && (j.unit < 0 || j.unit === p.id) && S.willDo(u, j.kind) && !others.has(`${j.kind}|${j.field}`))
}

const SKILL_SHORT: Record<S.Skill, string> = { machine: 'Machine', field: 'Field', woods: 'Woods', build: 'Build', pack: 'Pack' }
const SKILL_CUT: Record<S.Skill, string> = { machine: 'machine', field: 'field', woods: 'woods', build: 'hammer', pack: 'pack' }

// A person's ring, by the order they joined the farm.
function ringOfId(c: S.Campaign, id: number): string {
  return ringOf(Math.max(0, c.crew.findIndex(u => u.id === id)))
}

// The next wage a raise offers: what they asked, or a tenth more, to the nearest $10.
function raiseTo(p: S.PersonInfo): number {
  return p.wage < p.ask ? p.ask : Math.round(p.wage * 1.1 / 10) * 10
}

// A card or sheet that is laid down and taken away the way MOTION.md has it.
function layIn(ctx: Ctx, el: HTMLElement, was: boolean): void {
  if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
}
function takeAway(ctx: Ctx, el: HTMLElement): void {
  if (!el.hidden && !ctx.reduced()) {
    el.classList.add('out')
    setTimeout(() => { if (!el.classList.contains('out')) return; el.hidden = true; el.classList.remove('out') }, EXIT_MS)
  } else el.hidden = true
}

export interface PersonCard {
  el: HTMLElement
  update(c: S.Campaign, show: boolean): void
}

// How rested a person is, in words, with what follows from it: resting today, or slower, or a fall likelier.
export function restWords(c: S.Campaign, p: S.PersonInfo): string {
  const u = c.crew.find(x => x.id === p.id)
  if (u && S.resting(u) && c.phase === 'season') return u.rest === 'now' ? 'resting until recovered' : 'worn out, so resting today'
  if (p.tired >= S.HURT_TIRED) return u?.rest === 'push' ? 'worn out but still working' : 'worn out, so resting tomorrow'
  return p.tired >= S.TIRED_SLOW_FROM ? (p.kind === 'farmer' ? 'you need a rest day' : 'needs a rest day') : 'fit for work'
}

// What lifts a person's mood and what lowers it, in a line: "happy about a bed in the bunkhouse, unhappy about the pay".
export function moodSaid(why: { up: boolean; text: string }[]): string {
  const ups = why.filter(x => x.up).map(x => x.text), downs = why.filter(x => !x.up).map(x => x.text)
  return [ups.length ? `happy about ${F.list(ups)}` : '', downs.length ? `unhappy about ${F.list(downs)}` : ''].filter(Boolean).join(', ')
}

// When a person rests: by themselves once worn out (the farm's way unless told), now until fresh, or never.
export function restControl(ctx: Ctx, c: S.Campaign, id: number, testid: string): HTMLElement | null {
  const u = c.crew.find(x => x.id === id)
  if (!u || c.phase !== 'season') return null
  const mode = u.rest ?? 'auto'
  const name = u.kind === 'farmer' ? 'You' : R.firstName(u.name)
  const will = name === 'You' ? 'You\'ll' : `${name} will`
  const opt = (m: S.RestMode, word: string, tip: string, said: string) => h('button', {
    class: `btn${mode === m ? ' is-on' : ''}`, type: 'button', testid: `${testid}-${m}`, 'aria-pressed': String(mode === m), title: ctx.touch() ? undefined : tip,
    onclick: () => { const r = ctx.run({ t: 'rest', unit: id, mode: m }); if (r.ok) ctx.announce(`${will} ${said}.`) },
  }, word)
  return h('div', { class: 'rest-keys', role: 'group', 'aria-label': name === 'You' ? 'When you rest' : `When ${name} rests`, testid },
    h('span', { class: 't-label' }, 'Rest'),
    opt('auto', 'When worn out', 'Takes a rest day automatically when worn out, then goes back to work.', 'rest when worn out'),
    opt('now', 'Rest now', 'Takes days off until recovered.', 'rest now until recovered'),
    opt('push', 'Push on', 'Keeps working even when worn out, which is slower and makes an injury more likely.', 'keep working when worn out'))
}

// ---------------------------------------------------------------- spraying this season, asked once

export type SprayWay = 'auto' | 'ask' | 'none'
// What the player chose for spraying this season, if asked yet (the simulation keeps it).
export function sprayWay(c: S.Campaign): SprayWay | null {
  return S.sprayWayNow(c)
}

// When blight weather first comes the player is asked once how spraying is to be done this season, on the telegram
// card with its three numbered replies (incident.ts), the clock stopped: kept up by the crew by itself (with about
// what it costs), asked each time, or not this year. It is asked again from Who does what and from a field's card.
let sprayOpen = false
export function askSpray(ctx: Ctx): void { sprayOpen = true; ctx.dirty() }
export function sprayAsking(): boolean { return sprayOpen }
export function putSprayAway(ctx: Ctx): boolean { if (!sprayOpen) return false; sprayOpen = false; ctx.dirty(); return true }

export const SPRAY_WAYS: { id: SprayWay; glyph: string; name: string }[] = [
  { id: 'auto', glyph: 'spray', name: 'Keep the fields sprayed' },
  { id: 'ask', glyph: 'ask', name: 'Ask me each time' },
  { id: 'none', glyph: 'close', name: 'Not this year' },
]

export function sprayDoes(ctx: Ctx, c: S.Campaign, way: SprayWay): string {
  if (way === 'ask') return 'A stamp appears on a field when it needs spraying, and you give the order.'
  if (way === 'none') return 'No spraying, and no stamps asking for it. If blight shows up, nothing will stop it.'
  return keepSprayedLine(ctx.app.world, c)
}

export function answerSpray(ctx: Ctx, c: S.Campaign, way: SprayWay): void {
  const r = sprayWay(c) === way ? { ok: true } : ctx.run({ t: 'sprayWay', way })
  if (r.ok) ctx.announce(way === 'auto' ? 'Your crew will keep the fields sprayed automatically.' : way === 'ask' ? 'You\'ll be asked each time a field needs spraying.' : 'No spraying this year.')
  putSprayAway(ctx)
}

// Asked for from outside the card (a tutorial note's Show me): the foreman's key, brought into view and lit.
let foremanAsked = -1e9
export function showForemanKey(): void { foremanAsked = performance.now() }

export function personCard(ctx: Ctx): PersonCard {
  const app = ctx.app
  const el = h('section', { class: 'person-card sheet sys', testid: 'person-card', 'aria-label': 'Person', hidden: true })
  let foreman = false
  let shownFor = -1
  let flashed: { text: string; until: number } | null = null
  const FOREMAN_KEY = '[data-testid="person-foreman"]'
  // A control of the foreman's ringed for a few seconds, through every redraw of the card, and brought inside the
  // card's own window: see names what must be in view (the control, or the line under it that answers it).
  let lit: { sel: string; until: number } | null = null
  function lightUp(sel: string, see = sel): void {
    const mine = lit = { sel, until: performance.now() + 4000 }
    setTimeout(() => ctx.dirty(), 4050)
    ctx.dirty()
    // The card scrolls inside itself, and is laid, sized and redrawn over several frames (a redraw can put it back
    // at its top): watched until it has held still in view for three quarters of a second, or the player scrolls it.
    let frames = 0, inside = 0
    const mineNow = () => { frames = 1e9 }
    el.addEventListener('wheel', mineNow, { once: true, passive: true })
    el.addEventListener('touchmove', mineNow, { once: true, passive: true })
    const settle = () => {
      if (lit !== mine || frames++ > 240) return
      const k = el.querySelector<HTMLElement>(see) ?? el.querySelector<HTMLElement>(sel)
      if (k && !el.hidden) {
        const kr = k.getBoundingClientRect(), cr = el.getBoundingClientRect()
        const tall = kr.height > cr.height - 24
        if (kr.top >= cr.top - 1 && (tall || kr.bottom <= cr.bottom + 1)) {
          if (++inside === 4) el.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true })
          if (inside >= 45) return
        } else { inside = 0; el.scrollTop += tall || kr.top < cr.top ? kr.top - cr.top - 12 : kr.bottom - cr.bottom + 12 }
      }
      requestAnimationFrame(settle)
    }
    requestAnimationFrame(settle)
  }
  function showLit(): void {
    for (const k of el.querySelectorAll('.goal-ring')) if (!lit || performance.now() >= lit.until || !k.matches(lit.sel)) k.classList.remove('goal-ring')
    if (!lit || performance.now() >= lit.until) { lit = null; return }
    el.querySelector<HTMLElement>(lit.sel)?.classList.add('goal-ring')
  }
  // Naming a foreman, or sending one back to the fields: said on the card (its key, and the line under it), and as
  // a note where the player is looking; the key stays in view.
  function nameForeman(p: S.PersonInfo, block: S.BlockId | null): void {
    foreman = false
    const r = app.do({ t: 'foreman', unit: p.id, block })
    if (!r.ok) { flash(r.err); return }
    ctx.say(F.localize(r.events[0]?.text ?? ''), 'good')
    lightUp(FOREMAN_KEY, '[data-testid="foreman-said"]')
  }

  function flash(text: string): void {
    flashed = { text: F.localize(text), until: performance.now() + 5000 }
    ctx.announce(flashed.text)
    setTimeout(() => ctx.dirty(), 5100)
  }

  function run(cmd: S.Cmd, said?: string): boolean {
    const r = app.do(cmd)
    if (!r.ok) { flash(r.err); return false }
    if (said) ctx.announce(said)
    return true
  }

  function setPrio(p: S.PersonInfo, skill: S.Skill, level: number): void {
    if (p.prio[skill] === level) return
    run({ t: 'priority', unit: p.id, work: skill, level }, `${R.firstName(p.name)}, ${S.SKILL_LABEL[skill]}: ${R.prioWord(level)}.`)
  }

  function prioKey(e: KeyboardEvent, p: S.PersonInfo, skill: S.Skill): void {
    const k = e.key
    if (/^[0-4]$/.test(k)) { e.preventDefault(); e.stopPropagation(); setPrio(p, skill, Number(k)) }
    else if (k === 'ArrowRight' || k === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setPrio(p, skill, R.prioNext(p.prio[skill])) }
    else if (k === 'ArrowLeft' || k === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setPrio(p, skill, R.prioNext(p.prio[skill], true)) }
  }

  function body(c: S.Campaign, p: S.PersonInfo): Child {
    const farmer = p.kind === 'farmer'
    const why = R.moodWhy(c, p)
    const heading = R.moodHeading(c, p)
    const blocks = S.BLOCKS.filter(b => S.PARCELS.some((x, i) => x.block === b && S.held(c, i)))
    const waits = S.jobWaits(app.world, c)
    const doing = doingText(c, p, waits)
    const tiredWhy = R.tiredWhy(c, p)
    const best = Math.max(...S.SKILLS.map(k => p.skills[k]))
    const tiredCls = p.tired >= S.HURT_TIRED ? 'c-red' : p.tired >= S.TIRED_SLOW_FROM ? 'c-ochre' : ''
    const moodCls = p.quitIn >= 0 ? 'c-red' : p.mood < 0.45 ? 'c-ochre' : ''
    return [
      h('header', { class: 'pc-head' },
        ringed(p, ringOfId(c, p.id), 64),
        h('div', null,
          farmer ? null : h('p', { class: 't-label', testid: 'person-kind' }, p.foreman ? `Foreman, ${S.BLOCK_NAME[p.foreman]}` : R.KIND_NAME[p.kind]),
          h('h2', { class: 't-title pc-name', testid: 'person-name' }, farmer ? 'You, the farmer' : p.name),
          h('p', { class: 'pc-trait' }, farmer ? h('span', { class: 'quiet' }, 'Does every job and draws no wage.') : [h('b', null, `${p.traitName}:`), ' ', h('span', { class: 'quiet' }, p.traitText.replace(/^./, x => x.toLowerCase()))])),
        h('span', { class: 'pc-tools' },
          h('button', { class: 'iconbtn', type: 'button', testid: 'person-show', 'aria-label': farmer ? 'Find yourself on the farm' : 'Find them on the farm', title: ctx.touch() ? undefined : farmer ? 'Find yourself on the farm' : 'Find them on the farm', onclick: () => { app.selectUnit(p.id, 'land'); ctx.view.follow(p.id) } }, icon('scout', 'i')),
          h('button', { class: 'close', type: 'button', testid: 'person-close', 'aria-label': `Close${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.selectUnit(-1) }, icon('close', 'i')))),
      h('div', { class: 'card-body', 'data-scroll': 'person' },
      h('p', { class: 'pc-doing', testid: 'person-doing' }, icon(doingGlyph(c, p, waits), 'i'), h('span', null, doing)),
      h('table', { class: 'skills' },
        h('caption', { class: 'sr' }, 'Skills out of ten, and the priority of each kind of work. 1 gets done first, and a dash means never.'),
        h('tbody', null, S.SKILLS.map(k => {
          const lvl = p.skills[k]
          const pr = p.prio[k]
          return h('tr', { class: lvl === best && best >= 5 ? 'best' : '', k: `skill-${k}` },
            h('th', { scope: 'row', title: ctx.touch() ? undefined : R.skillCovers(k) }, icon(SKILL_CUT[k], 'i'), SKILL_SHORT[k]),
            h('td', { class: 'lv num' }, String(lvl)),
            h('td', null, tens(lvl, lvl < S.SKILL_MAX ? p.progress[k] : 0, { best: lvl === best && best >= 5, label: `${R.SKILL_NAME[k]}: level ${lvl}${lvl < S.SKILL_MAX ? `, ${F.pct(p.progress[k])} of the way to ${lvl + 1}` : ''}` })),
            h('td', { class: 'pr' }, h('button', {
              class: `prio key${pr === 0 ? ' never' : ''}${pr === 1 ? ' first' : ''}`, type: 'button', testid: `prio-${k}`,
              title: ctx.touch() ? undefined : `${R.skillCovers(k)}. 1 gets done first, and a dash means never. Click to move it up, or right-click to move it down.`,
              onclick: () => setPrio(p, k, R.prioNext(pr, true)),
              oncontextmenu: (e: Event) => { e.preventDefault(); setPrio(p, k, R.prioNext(pr)) },
              onkeydown: (e: Event) => prioKey(e as KeyboardEvent, p, k),
            }, h('span', { class: 'sr' }, `${R.SKILL_NAME[k]} work priority `), R.prioMark(pr),
            h('span', { class: 'sr' }, `: ${R.prioWord(pr)}. Press for ${R.prioWord(R.prioNext(pr, true))}. ${R.skillCovers(k)}.`))))
        }))),
      h('dl', { class: 'state' },
        h('div', { testid: 'person-tired' }, h('dt', { class: tiredCls }, F.upper(p.tiredWord)), h('dd', null, p.tired >= S.TIRED_SLOW_FROM ? `${F.upper(restWords(c, p))}.${tiredWhy ? ` ${tiredWhy}` : ''}` : tiredWhy || 'Rested enough.')),
        h('div', { testid: 'person-mood' }, h('dt', { class: moodCls }, `${F.upper(p.moodWord)}${heading ? `, ${heading === 'rising' ? 'improving' : 'getting worse'}` : ''}`),
          h('dd', null, p.quitIn >= 0 ? `Will quit in ${F.plural(p.quitIn, 'day')} unless their mood improves.` : why.length ? F.upper(`${moodSaid(why)}.`) : 'No strong reasons either way.')),
        p.hurtUntil >= 0 ? h('div', null, h('dt', { class: 'c-red' }, 'Hurt'), h('dd', null, `Back on ${F.date(c.year, p.hurtUntil)}.`)) : null),
      restControl(ctx, c, p.id, 'person-rest'),
      flashed && performance.now() < flashed.until ? h('p', { class: 'pc-flash c-red', role: 'status' }, flashed.text) : null),
      h('div', { class: 'card-foot' },
      farmer ? h('p', { class: 'pay quiet it' }, 'You don\'t draw a wage. Your family\'s living costs come out at the end of the year.') : [
        h('p', { class: 'pay lead' }, h('span', null, h('b', { class: 'num' }, F.money(p.pay)), ` a month${p.foreman ? ' as foreman' : ''}`), h('span', { class: 'dots' }), p.ask ? h('span', { class: 'quiet num' }, `asked for ${F.money(p.ask)}`) : null),
        h('div', { class: 'pc-actions' },
          h('button', {
            class: 'btn', type: 'button', testid: 'person-raise', title: ctx.touch() ? undefined : 'Every 10% over what they asked for moves their mood about a tenth of the way up.',
            onclick: () => run({ t: 'raise', unit: p.id, wage: raiseTo(p) }, `${R.firstName(p.name)} now earns ${F.money(raiseTo(p))} a month.`),
          }, icon('raise', 'i'), h('span', null, 'Raise', h('span', { class: 'sub num' }, `to ${F.money(raiseTo(p))}`))),
          blocks.length ? h('button', {
            class: `btn${foreman ? ' is-on' : ''}`, type: 'button', testid: 'person-foreman', 'aria-expanded': String(foreman),
            title: ctx.touch() ? undefined : 'A foreman adds what one block\'s fields need to the work list every working morning, and doesn\'t do field work. A foreman is paid 40% more.',
            // Its choices open under it, brought into view with the first one lit.
            onclick: () => { foreman = !foreman; if (foreman) lightUp('.pc-blocks .btn', '.pc-blocks'); else lit = null; ctx.dirty() },
          }, icon('foreman', 'i'), h('span', null, 'Foreman', h('span', { class: 'sub' }, p.foreman ? BLOCK_NAME[p.foreman].replace(/^The /, '').split(',')[0] : '+40% pay'))) : h('span'),
          h('button', {
            class: 'btn hazard', type: 'button', testid: 'person-dismiss',
            onclick: async () => {
              const yes = await confirmPaper(ctx, { title: `Let ${R.firstName(p.name)} go?`, text: R.LET_GO_TEXT, yes: 'Let them go', danger: true })
              if (yes && run({ t: 'dismiss', unit: p.id }, `You let ${p.name} go.`)) app.selectUnit(-1)
            },
          }, icon('letgo', 'i'), h('span', null, 'Let go', h('span', { class: 'sub' }, 'today')))),
        p.foreman && !foreman ? h('p', { class: 'pc-fore', role: 'status', testid: 'foreman-said' }, icon('foreman', 'i'),
          h('span', null, `Foreman of ${S.BLOCK_NAME[p.foreman]}. ${R.firstName(p.name)} adds its fields' jobs to the work list each morning and doesn't do field work.`)) : null,
        foreman ? h('div', { class: 'pc-blocks', role: 'group', 'aria-label': 'Foreman of' },
          h('p', { class: 'pc-fore', testid: 'foreman-what' }, h('span', null, `A foreman orders the work on one block of fields for you each morning. ${R.firstName(p.name)} would earn 40% more and stop doing field work. Pick the block.`)),
          blocks.map(b => {
            const other = c.crew.find(u => u.foreman === b && u.id !== p.id)
            return h('button', {
              class: 'btn', type: 'button', testid: `foreman-${b}`, 'aria-pressed': String(p.foreman === b), disabled: !!other,
              title: other ? `${other.name} is already foreman there` : undefined,
              onclick: () => nameForeman(p, b),
            }, BLOCK_NAME[b].replace(/^The /, '').split(',')[0])
          }),
          p.foreman ? h('button', { class: 'btn', type: 'button', testid: 'foreman-none', onclick: () => nameForeman(p, null) }, 'Back to field work') : null) : null,
      ]),
    ]
  }

  function update(c: S.Campaign, show: boolean): void {
    const p = show ? S.peopleInfo(c).find(x => x.id === app.unit) : undefined
    if (!p) {
      takeAway(ctx, el)
      shownFor = -1
      foreman = false
      return
    }
    const was = el.hidden === true || el.classList.contains('out')
    el.classList.remove('out')
    el.hidden = false
    // Opened while the goal slip asks for a foreman: the key is brought into view, lit.
    const hand = p.kind !== 'farmer' && !p.foreman
    const asked = hand && (performance.now() - foremanAsked < 2000 || (shownFor !== p.id && nextGoal(c)?.id === 'foreman'))
    if (shownFor !== p.id) { shownFor = p.id; foreman = false; flashed = null; lit = null }
    if (asked) { foremanAsked = -1e9; lightUp(FOREMAN_KEY) }
    const s0 = c.season
    const model = {
      p, day: s0?.day, t: ctx.touch(), foreman, lit: lit && performance.now() < lit.until ? lit.sel : '', flash: flashed && performance.now() < flashed.until ? flashed.text : '',
      jobs: s0?.jobs.map(j => [j.id, j.unit]), crew: c.crew.map(u => [u.id, u.at, u.to, u.job, u.foreman, u.rest]), sun: c.sundaysOff,
    }
    patch(el, JSON.stringify(model), () => body(c, p))
    el.setAttribute('aria-label', p.kind === 'farmer' ? 'You, the farmer' : p.name)
    layIn(ctx, el, was)
    showLit()
  }

  return { el, update }
}

// ---------------------------------------------------------------- the work grid

export interface WorkGrid {
  el: HTMLElement
  update(c: S.Campaign): void
  toggle(on?: boolean): void
  isOpen(): boolean
}

export function workGrid(ctx: Ctx): WorkGrid {
  const app = ctx.app
  const el = h('section', { class: 'work sheet sys grid-panel', testid: 'work-grid', 'aria-labelledby': 'grid-title', hidden: true })
  let open = false
  let at = { row: 0, col: 0 }
  let note = ''

  function set(id: number, skill: S.Skill, level: number, name: string): void {
    const r = app.do({ t: 'priority', unit: id, work: skill, level })
    if (!r.ok) { note = F.localize(r.err); ctx.announce(note); ctx.dirty(); return }
    note = ''
    ctx.announce(`${name}, ${S.SKILL_LABEL[skill]}: ${R.prioWord(level)}.`)
  }

  function focusCell(): void {
    requestAnimationFrame(() => el.querySelector<HTMLElement>(`[data-cell="${at.row}-${at.col}"]`)?.focus({ preventScroll: true }))
  }

  function key(e: KeyboardEvent, people: S.PersonInfo[], row: number, col: number): void {
    const p = people[row]
    const skill = S.SKILLS[col]
    const k = e.key
    const move = (dr: number, dc: number) => {
      at = { row: Math.max(0, Math.min(people.length - 1, row + dr)), col: Math.max(0, Math.min(S.SKILLS.length - 1, col + dc)) }
      ctx.dirty()
      focusCell()
    }
    if (k === 'ArrowRight') move(0, 1)
    else if (k === 'ArrowLeft') move(0, -1)
    else if (k === 'ArrowDown') move(1, 0)
    else if (k === 'ArrowUp') move(-1, 0)
    else if (/^[0-4]$/.test(k)) set(p.id, skill, Number(k), R.firstName(p.name))
    else if (k === 'Delete' || k === 'Backspace' || k === '-') set(p.id, skill, 0, R.firstName(p.name))
    else if (k === 'Home') move(0, -col)
    else if (k === 'End') move(0, S.SKILLS.length - 1 - col)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  // The farm's rules, under the grid: each a box ticked in pencil, with what it costs and what it gives.
  function rules(c: S.Campaign): Child {
    const l = S.labourInfo(c)
    const pickFrom = F.date(c.year, S.dayIndex(c.year, S.PICKERS_FROM.month, S.PICKERS_FROM.dom), true)
    const pickTo = F.date(c.year, S.dayIndex(c.year, S.PICKERS_TO.month, S.PICKERS_TO.dom), true)
    const rule = (testid: string, on: boolean, name: string, why: string, ok = true) => h('button', {
      class: 'check rule', type: 'button', testid, 'aria-pressed': String(on), disabled: !ok,
      onclick: () => { const r = ctx.run(testid === 'rule-sundays' ? { t: 'sundays', off: !l.sundaysOff } : { t: 'pickers', on: !l.pickers.on }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) },
    }, h('i', { class: `tick${on ? ' on' : ''}`, 'aria-hidden': 'true' }), h('span', null, h('b', null, name), ' ', h('span', { class: 'quiet' }, why)))
    // Which jobs the crew puts on the list by itself, and which wait for the player.
    const routine = S.routineInfo(c)
    return h('div', { class: 'farm-rules', role: 'group', 'aria-label': 'Farm rules' },
      routine.length ? h('div', { class: 'routine', role: 'group', 'aria-label': 'Work your crew does without asking' },
        h('p', { class: 't-label' }, 'Automatic, or ask me'),
        c.season && c.season.watchDay >= 0 ? h('button', { class: 'btn quiet spray-again', type: 'button', testid: 'spray-ask-open', onclick: () => askSpray(ctx) },
          icon('spray', 'i'), 'Spraying this season: ', h('b', null, sprayWay(c) === 'auto' ? 'kept sprayed' : sprayWay(c) === 'none' ? 'not this year' : 'ask me'), h('span', { class: 'quiet' }, ' · change')) : null,
        h('div', { class: 'routine-keys' }, routine.map(r => h('button', {
          class: `btn${r.auto ? ' is-on' : ''}`, type: 'button', testid: `routine-${r.kind}`, 'aria-pressed': String(r.auto),
          title: ctx.touch() ? undefined : r.auto ? `${R.JOB_VERB[r.kind]}: your crew adds it to the work list automatically. Click to be asked instead.` : `${R.JOB_VERB[r.kind]}: waits for your order. Click to let your crew handle it automatically.`,
          onclick: () => { const res = ctx.run({ t: 'routine', kind: r.kind as S.RoutineKind, auto: !r.auto }); if (res.ok) ctx.announce(`${R.JOB_VERB[r.kind]}: ${r.auto ? 'ask me' : 'automatic'}.`) },
        }, icon(r.kind, 'i'), R.JOB_VERB[r.kind], h('span', { class: 'sub' }, r.auto ? 'automatic' : r.kind === 'kill' ? 'your decision, but the crew does it a week after it\'s due' : 'ask me'))))) : null,
      rule('rule-sundays', l.sundaysOff, 'Sundays off', l.sundaysOff ? 'Everyone rests one day a week. Working Sundays gains you a day, but it tires everyone out.' : 'Sundays are worked, which gives you an extra day each week but tires everyone out.'),
      // Pickers come forward a few weeks before the harvest break, when they can be thought about.
      l.pickers.ok || l.pickers.on || pickersNear(c)
        ? rule('rule-pickers', l.pickers.on, 'Pickers', `${F.money(l.pickers.perDay)} for each day worked, and every dig goes ${F.pct(l.pickers.digFaster - 1)} faster. Available ${pickFrom} to ${pickTo}, while the schools are closed.`, l.pickers.ok || l.pickers.on) : null)
  }

  function pickersNear(c: S.Campaign): boolean {
    const s0 = c.season
    return !!s0 && c.phase === 'season' && s0.day >= S.dayIndex(s0.year, S.PICKERS_FROM.month, 1) && s0.day <= S.dayIndex(s0.year, S.PICKERS_TO.month, S.PICKERS_TO.dom)
  }

  function body(c: S.Campaign): Child {
    const people = S.peopleInfo(c)
    if (at.row >= people.length) at = { row: people.length - 1, col: at.col }
    return [
      h('header', { class: 'command-head work-head' },
        h('div', null, h('h2', { class: 't-title', id: 'grid-title' }, 'Who does what'), h('p', { class: 't-caption', testid: 'grid-how' }, `1 gets done first, and a dash means never. ${ctx.touch() ? 'Tap to move work up' : 'Click to move work up, right-click to move it down, or type a number'}. The bar shows skill.`)),
        h('button', { class: 'close', type: 'button', testid: 'grid-close', 'aria-label': `Close Who does what${ctx.touch() ? '' : ' (G)'}`, onclick: () => toggle(false) }, icon('close', 'i'))),
      h('div', { class: 'grid-scroll', 'data-scroll': 'grid' },
        h('table', { class: 'grid', role: 'grid', 'aria-labelledby': 'grid-title' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Person')),
            S.SKILLS.map(k => h('th', { scope: 'col', title: ctx.touch() ? undefined : R.skillCovers(k) }, icon(SKILL_CUT[k], 'i'), h('span', { class: 't-label' }, SKILL_SHORT[k]))))),
          h('tbody', null, people.map((p, row) => h('tr', { class: `${p.foreman ? 'foreman' : ''}${app.unit === p.id ? ' is-picked' : ''}`.trim(), k: `row-${p.id}` },
            h('th', { scope: 'row' },
              h('button', { class: 'w-who', type: 'button', testid: `grid-person-${p.id}`, tabindex: '-1', onclick: () => { app.selectUnit(p.id) } },
                ringed(p, ringOfId(c, p.id), 28), h('span', null, R.firstName(p.name)))),
            p.foreman ? h('td', { colspan: S.SKILLS.length, class: 'w-foreman' }, `Foreman of ${S.BLOCK_NAME[p.foreman]}, so no field work`)
              : S.SKILLS.map((k, col) => {
                const lvl = p.skills[k]
                const pr = p.prio[k]
                const here = at.row === row && at.col === col
                return h('td', { role: 'gridcell' }, h('button', {
                  class: `cell${pr === 0 ? ' never' : ''}${pr === 1 ? ' first' : ''}`, type: 'button', style: `--sk:${lvl}`, testid: `cell-${p.id}-${k}`, 'data-cell': `${row}-${col}`, tabindex: here ? '0' : '-1',
                  onclick: () => { at = { row, col }; set(p.id, k, R.prioNext(pr, true), R.firstName(p.name)) },
                  oncontextmenu: (e: Event) => { e.preventDefault(); at = { row, col }; set(p.id, k, R.prioNext(pr), R.firstName(p.name)) },
                  onkeydown: (e: Event) => key(e as KeyboardEvent, people, row, col),
                  onfocus: () => { if (at.row !== row || at.col !== col) { at = { row, col }; ctx.dirty() } },
                }, h('span', { class: 'sr' }, `${R.firstName(p.name)}, ${S.SKILL_LABEL[k]}, skill ${lvl}, priority `), h('span', { class: 'num' }, R.prioMark(pr)),
                h('span', { class: 'sr' }, `, ${R.prioWord(pr)}`)))
              })))))),
      note ? h('p', { class: 'pc-flash c-red', role: 'status' }, note) : null,
      rules(c),
    ]
  }

  function update(c: S.Campaign): void {
    if (!open) { if (!el.hidden) takeAway(ctx, el); return }
    const was = el.hidden === true || el.classList.contains('out')
    el.classList.remove('out')
    el.hidden = false
    const l = S.labourInfo(c)
    patch(el, JSON.stringify([c.crew.map(u => [u.id, u.name, u.prio, u.skills, u.foreman]), at, note, l.sundaysOff, l.pickers, ctx.touch(), app.unit, c.routine]), () => body(c))
    layIn(ctx, el, was)
  }

  function toggle(on = !open): void {
    if (on === open) return
    open = on
    note = ''
    ctx.dirty()
    if (on) focusCell()
  }

  return { el, update, toggle, isOpen: () => open }
}
