// People (design/people.html): a page of the time book for one person, and the work grid with the farm's rules.
import * as S from '../sim/index.ts'
import { keepSprayedLine } from './spray-words.ts'
import { confirmPaper, EXIT_MS, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME } from './map.ts'
import * as R from './rules.ts'
import { tens } from './system/parts.ts'
import { portrait as bust, ringed, ringOf } from './system/people.ts'

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

// What a person is doing, as a glyph: their order, the road, a day of rest, a foreman's rounds, or nothing.
export function doingGlyph(c: S.Campaign, p: S.PersonInfo): string {
  if (p.foreman) return 'foreman'
  if (p.hurtUntil >= 0) return 'hurt'
  const s0 = c.season
  if (s0 && c.phase === 'season' && !s0.frozen && !S.workday(c, s0)) return 'sunday'
  if (p.travelling) return 'go'
  return p.job ? p.job.kind : lastWorked(c, p.id)?.kind ?? 'stale'
}

// What a person is doing in words: their order, or what they were at on the last day worked.
export function doingText(c: S.Campaign, p: S.PersonInfo): string {
  if (p.job || p.foreman || p.hurtUntil >= 0 || p.travelling || p.doing !== 'Nothing to do') return p.doing
  const w = lastWorked(c, p.id)
  return w ? R.jobText(w) : 'Nothing to do'
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

// The next order a person would take from the list by their own priorities, or null.
function nextFor(c: S.Campaign, id: number): S.Job | null {
  const s0 = c.season
  const u = c.crew.find(x => x.id === id)
  if (!s0 || !u || c.phase !== 'season') return null
  const held = new Set(c.crew.filter(x => x.id !== id).map(x => x.job))
  let best: S.Job | null = null
  for (const j of s0.jobs) {
    if (held.has(j.id) || j.id === u.job || (j.unit >= 0 && j.unit !== id) || !S.willDo(u, j.kind)) continue
    if (!best || u.prio[S.jobSkill(j.kind)] < u.prio[S.jobSkill(best.kind)]) best = j
  }
  return best
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
  if (u && S.resting(u) && c.phase === 'season') return u.rest === 'now' ? 'resting until fresh' : 'worn out: resting today, back when fresh'
  if (p.tired >= S.HURT_TIRED) return u?.rest === 'push' ? 'worn out and working on: slower, and a fall is likelier' : 'worn out: rests tomorrow'
  return p.tired >= S.TIRED_SLOW_FROM ? 'slower for it; a rest day brings them back' : 'fit for work'
}

// When a person rests: by themselves once worn out (the farm's way unless told), now until fresh, or never.
export function restControl(ctx: Ctx, c: S.Campaign, id: number, testid: string): HTMLElement | null {
  const u = c.crew.find(x => x.id === id)
  if (!u || c.phase !== 'season') return null
  const mode = u.rest ?? 'auto'
  const name = u.kind === 'farmer' ? 'You' : R.firstName(u.name)
  const opt = (m: S.RestMode, word: string, tip: string) => h('button', {
    class: `btn${mode === m ? ' is-on' : ''}`, type: 'button', testid: `${testid}-${m}`, 'aria-pressed': String(mode === m), title: ctx.touch() ? undefined : tip,
    onclick: () => { const r = ctx.run({ t: 'rest', unit: id, mode: m }); if (r.ok) ctx.announce(`${name}: ${word.toLowerCase()}.`) },
  }, word)
  return h('div', { class: 'rest-keys', role: 'group', 'aria-label': name === 'You' ? 'When you rest' : `When ${name} rests`, testid },
    h('span', { class: 't-label' }, 'Rest'),
    opt('auto', 'When worn out', 'Rests by themselves once worn out, then back to work.'),
    opt('now', 'Rest now', 'Takes days off until fresh.'),
    opt('push', 'Work on', 'Works on worn out: slower, and a fall is likelier.'))
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
  if (way === 'ask') return 'A stamp on a field when it wants spraying; the order is yours.'
  if (way === 'none') return 'No spraying and no stamps for it. Blight, if it comes, goes unchecked.'
  return keepSprayedLine(ctx.app.world, c)
}

export function answerSpray(ctx: Ctx, c: S.Campaign, way: SprayWay): void {
  const r = sprayWay(c) === way ? { ok: true } : ctx.run({ t: 'sprayWay', way })
  if (r.ok) ctx.announce(way === 'auto' ? 'Spraying: the crew keeps the fields sprayed by itself.' : way === 'ask' ? 'Spraying: you are asked each time.' : 'No spraying this year.')
  putSprayAway(ctx)
}

export function personCard(ctx: Ctx): PersonCard {
  const app = ctx.app
  const el = h('section', { class: 'person-card sheet sys', testid: 'person-card', 'aria-label': 'Person', hidden: true })
  let foreman = false
  let shownFor = -1
  let flashed: { text: string; until: number } | null = null

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
    const next = p.job ? null : nextFor(c, p.id)
    const why = R.moodWhy(c, p)
    const heading = R.moodHeading(c, p)
    const blocks = S.BLOCKS.filter(b => S.PARCELS.some((x, i) => x.block === b && S.held(c, i)))
    const doing = doingText(c, p)
    const tiredWhy = R.tiredWhy(c, p)
    const best = Math.max(...S.SKILLS.map(k => p.skills[k]))
    const tiredCls = p.tired >= S.HURT_TIRED ? 'c-red' : p.tired >= S.TIRED_SLOW_FROM ? 'c-ochre' : ''
    const moodCls = p.quitIn >= 0 ? 'c-red' : p.mood < 0.45 ? 'c-ochre' : ''
    return [
      h('header', { class: 'pc-head' },
        ringed(p, ringOfId(c, p.id), 64),
        h('div', null,
          h('h2', { class: 't-title pc-name', testid: 'person-name' }, farmer ? 'You, the farmer' : p.name),
          h('p', { class: 'pc-trait' }, farmer ? h('span', { class: 'quiet' }, 'Every job; no wage.') : [h('b', null, `${p.traitName}:`), ' ', h('span', { class: 'quiet' }, p.traitText.replace(/^./, x => x.toLowerCase()))])),
        h('span', { class: 'pc-tools' },
          h('button', { class: 'iconbtn', type: 'button', testid: 'person-show', 'aria-label': 'Show them on the land', title: ctx.touch() ? undefined : 'Show them on the land', onclick: () => { app.selectUnit(p.id, 'land'); ctx.view.follow(p.id) } }, icon('scout', 'i')),
          h('button', { class: 'close', type: 'button', testid: 'person-close', 'aria-label': `Close${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.selectUnit(-1) }, icon('close', 'i')))),
      h('p', { class: 'pc-doing', testid: 'person-doing' }, icon(doingGlyph(c, p), 'i'), h('span', null, doing),
        next && doing === 'Nothing to do' ? h('span', { class: 'quiet it' }, ` next: ${R.jobText(next, c, next.building).toLowerCase()}`) : null),
      h('table', { class: 'skills' },
        h('caption', { class: 'sr' }, 'Skills out of ten, and the order they take work in: 1 is done first, a dash is never'),
        h('tbody', null, S.SKILLS.map(k => {
          const lvl = p.skills[k]
          const pr = p.prio[k]
          return h('tr', { class: lvl === best && best >= 5 ? 'best' : '', k: `skill-${k}` },
            h('th', { scope: 'row', title: ctx.touch() ? undefined : R.skillCovers(k) }, icon(SKILL_CUT[k], 'i'), SKILL_SHORT[k]),
            h('td', { class: 'lv num' }, String(lvl)),
            h('td', null, tens(lvl, lvl < S.SKILL_MAX ? p.progress[k] : 0, { best: lvl === best && best >= 5, label: `${R.SKILL_NAME[k]}: level ${lvl}${lvl < S.SKILL_MAX ? `, ${F.pct(p.progress[k])} of the way to ${lvl + 1}` : ''}` })),
            h('td', { class: 'pr' }, h('button', {
              class: `prio key${pr === 0 ? ' never' : ''}${pr === 1 ? ' first' : ''}`, type: 'button', testid: `prio-${k}`,
              title: ctx.touch() ? undefined : `${R.skillCovers(k)}. 1 is done first; a dash is never. A click makes it sooner, a right-click later.`,
              onclick: () => setPrio(p, k, R.prioNext(pr, true)),
              oncontextmenu: (e: Event) => { e.preventDefault(); setPrio(p, k, R.prioNext(pr)) },
              onkeydown: (e: Event) => prioKey(e as KeyboardEvent, p, k),
            }, h('span', { class: 'sr' }, `${R.SKILL_NAME[k]} work priority `), R.prioMark(pr),
            h('span', { class: 'sr' }, `: ${R.prioWord(pr)}. Press for ${R.prioWord(R.prioNext(pr, true))}. ${R.skillCovers(k)}.`))))
        }))),
      h('dl', { class: 'state' },
        h('div', { testid: 'person-tired' }, h('dt', { class: tiredCls }, F.upper(p.tiredWord)), h('dd', null, p.tired >= S.TIRED_SLOW_FROM ? `${restWords(c, p)}${tiredWhy ? `; ${tiredWhy}` : ''}` : tiredWhy || 'rested enough')),
        h('div', { testid: 'person-mood' }, h('dt', { class: moodCls }, `${F.upper(p.moodWord)}${heading ? `, ${heading}` : ''}`),
          h('dd', null, p.quitIn >= 0 ? `quits in ${F.plural(p.quitIn, 'day')} unless it lifts` : why.length ? why.map(x => `${x.up ? '' : 'not: '}${x.text}`).join('; ') : 'nothing pulling either way')),
        p.hurtUntil >= 0 ? h('div', null, h('dt', { class: 'c-red' }, 'Hurt'), h('dd', null, `back on ${F.date(c.year, p.hurtUntil)}`)) : null),
      restControl(ctx, c, p.id, 'person-rest'),
      flashed && performance.now() < flashed.until ? h('p', { class: 'pc-flash c-red', role: 'status' }, flashed.text) : null,
      farmer ? h('p', { class: 'pay quiet it' }, 'You draw no wage: the household takes its share at the year end.') : [
        h('p', { class: 'pay lead' }, h('span', null, h('b', { class: 'num' }, F.money(p.pay)), ` a month${p.foreman ? ' as foreman' : ''}`), h('span', { class: 'dots' }), p.ask ? h('span', { class: 'quiet num' }, `asked ${F.money(p.ask)}`) : null),
        h('div', { class: 'pc-actions' },
          h('button', {
            class: 'btn', type: 'button', testid: 'person-raise', title: ctx.touch() ? undefined : 'More pay lifts their mood: about a tenth of the way for each 10% over what they asked.',
            onclick: () => run({ t: 'raise', unit: p.id, wage: raiseTo(p) }, `${R.firstName(p.name)} now earns ${F.money(raiseTo(p))} a month.`),
          }, icon('raise', 'i'), h('span', null, 'Raise', h('span', { class: 'sub num' }, `to ${F.money(raiseTo(p))}`))),
          blocks.length ? h('button', {
            class: `btn${foreman ? ' is-on' : ''}`, type: 'button', testid: 'person-foreman', 'aria-expanded': String(foreman),
            title: ctx.touch() ? undefined : 'A foreman puts on the list what the fields of one block need, every working morning, and does no field work. Paid 40% more.',
            onclick: () => { foreman = !foreman; ctx.dirty() },
          }, icon('foreman', 'i'), h('span', null, 'Foreman', h('span', { class: 'sub' }, p.foreman ? BLOCK_NAME[p.foreman].replace(/^The /, '').split(',')[0] : '+40% pay'))) : h('span'),
          h('button', {
            class: 'btn hazard', type: 'button', testid: 'person-dismiss',
            onclick: async () => {
              const yes = await confirmPaper(ctx, { title: `Let ${R.firstName(p.name)} go?`, text: 'They leave today. The month already paid is not given back, and they will not come back.', yes: 'Let them go', danger: true })
              if (yes && run({ t: 'dismiss', unit: p.id }, `${p.name} is let go.`)) app.selectUnit(-1)
            },
          }, icon('letgo', 'i'), h('span', null, 'Let go', h('span', { class: 'sub' }, 'today')))),
        foreman ? h('div', { class: 'pc-blocks', role: 'group', 'aria-label': 'Foreman of' },
          blocks.map(b => {
            const other = c.crew.find(u => u.foreman === b && u.id !== p.id)
            return h('button', {
              class: 'btn', type: 'button', testid: `foreman-${b}`, 'aria-pressed': String(p.foreman === b), disabled: !!other,
              title: other ? `${other.name} is foreman there` : undefined,
              onclick: () => { foreman = false; run({ t: 'foreman', unit: p.id, block: b }, `${R.firstName(p.name)} is foreman of ${S.BLOCK_NAME[b]}.`) },
            }, BLOCK_NAME[b].replace(/^The /, '').split(',')[0])
          }),
          p.foreman ? h('button', { class: 'btn', type: 'button', testid: 'foreman-none', onclick: () => { foreman = false; run({ t: 'foreman', unit: p.id, block: null }, `${R.firstName(p.name)} goes back to field work.`) } }, 'Back to field work') : null) : null,
      ],
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
    if (shownFor !== p.id) { shownFor = p.id; foreman = false; flashed = null }
    const s0 = c.season
    const model = {
      p, day: s0?.day, t: ctx.touch(), foreman, flash: flashed && performance.now() < flashed.until ? flashed.text : '',
      jobs: s0?.jobs.map(j => [j.id, j.unit]), crew: c.crew.map(u => [u.id, u.at, u.to, u.job, u.foreman, u.rest]), sun: c.sundaysOff,
    }
    patch(el, JSON.stringify(model), () => body(c, p))
    el.setAttribute('aria-label', p.kind === 'farmer' ? 'You, the farmer' : p.name)
    layIn(ctx, el, was)
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
      routine.length ? h('div', { class: 'routine', role: 'group', 'aria-label': 'Done by the crew without asking' },
        h('p', { class: 't-label' }, 'By itself, or ask me'),
        c.season && c.season.watchDay >= 0 ? h('button', { class: 'btn quiet spray-again', type: 'button', testid: 'spray-ask-open', onclick: () => askSpray(ctx) },
          icon('spray', 'i'), 'Spraying this season: ', h('b', null, sprayWay(c) === 'auto' ? 'kept sprayed' : sprayWay(c) === 'none' ? 'not this year' : 'ask me'), h('span', { class: 'quiet' }, ' · change')) : null,
        h('div', { class: 'routine-keys' }, routine.map(r => h('button', {
          class: `btn${r.auto ? ' is-on' : ''}`, type: 'button', testid: `routine-${r.kind}`, 'aria-pressed': String(r.auto),
          title: ctx.touch() ? undefined : r.auto ? `${R.JOB_VERB[r.kind]}: the crew puts it on the list by itself. Press to be asked instead.` : `${R.JOB_VERB[r.kind]}: waits for you. Press to let the crew do it by itself.`,
          onclick: () => { const res = ctx.run({ t: 'routine', kind: r.kind as S.RoutineKind, auto: !r.auto }); if (res.ok) ctx.announce(`${R.JOB_VERB[r.kind]}: ${r.auto ? 'ask me' : 'by itself'}.`) },
        }, icon(r.kind, 'i'), R.JOB_VERB[r.kind], h('span', { class: 'sub' }, r.auto ? 'by itself' : r.kind === 'kill' ? 'your call; the crew does it a week after it is due' : 'ask me'))))) : null,
      rule('rule-sundays', l.sundaysOff, 'Sundays off', l.sundaysOff ? 'Everyone rests a day a week. Working Sundays gains a day, and tires everyone.' : 'Sundays are worked: a day more each week, and everyone tires.'),
      // Pickers come forward a few weeks before the harvest break, when they can be thought about.
      l.pickers.ok || l.pickers.on || pickersNear(c)
        ? rule('rule-pickers', l.pickers.on, 'Pickers', `${F.money(l.pickers.perDay)} a day worked: every dig ${F.pct(l.pickers.digFaster - 1)} faster. ${pickFrom} to ${pickTo}, while the schools close.`, l.pickers.ok || l.pickers.on) : null)
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
        h('div', null, h('h2', { class: 't-title', id: 'grid-title' }, 'Who does what'), h('p', { class: 't-caption', testid: 'grid-how' }, `1 is done first; a dash is never. ${ctx.touch() ? 'A tap makes the work come sooner' : 'A click makes the work come sooner, a right-click later'}; a digit sets it. The bar is the skill.`)),
        h('button', { class: 'close', type: 'button', testid: 'grid-close', 'aria-label': `Close the work grid${ctx.touch() ? '' : ' (G)'}`, onclick: () => toggle(false) }, icon('close', 'i'))),
      h('div', { class: 'grid-scroll', 'data-scroll': 'grid' },
        h('table', { class: 'grid', role: 'grid', 'aria-labelledby': 'grid-title' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Person')),
            S.SKILLS.map(k => h('th', { scope: 'col', title: ctx.touch() ? undefined : R.skillCovers(k) }, icon(SKILL_CUT[k], 'i'), h('span', { class: 't-label' }, SKILL_SHORT[k]))))),
          h('tbody', null, people.map((p, row) => h('tr', { class: `${p.foreman ? 'foreman' : ''}${app.unit === p.id ? ' is-picked' : ''}`.trim(), k: `row-${p.id}` },
            h('th', { scope: 'row' },
              h('button', { class: 'w-who', type: 'button', testid: `grid-person-${p.id}`, tabindex: '-1', onclick: () => { app.selectUnit(p.id) } },
                ringed(p, ringOfId(c, p.id), 28), h('span', null, R.firstName(p.name)))),
            p.foreman ? h('td', { colspan: S.SKILLS.length, class: 'w-foreman' }, `Foreman of ${S.BLOCK_NAME[p.foreman]}: no field work`)
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
