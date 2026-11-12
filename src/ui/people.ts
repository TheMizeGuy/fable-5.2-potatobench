// People: a portrait in each person's own colours, the card for one person, and the work grid with the farm's rules.
import { personLook } from '../game/looks.ts'
import * as S from '../sim/index.ts'
import { confirmPaper, EXIT_MS, patch, type Ctx } from './core.ts'
import { h, s, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME, where } from './map.ts'
import * as R from './rules.ts'

// A head and shoulders in the shirt, hat and skin the figure on the land wears.
export function portrait(id: number, cls = 'portrait'): SVGElement {
  const look = personLook(id)
  const fill = (c: string) => `fill:${c}`
  const top = look.hatKind === 'brim'
    ? [s('ellipse', { cx: 12, cy: 7.4, rx: 7.2, ry: 1.7, style: fill(look.hat) }), s('path', { d: 'M8.2 7.4c0-2.9 1.6-4.5 3.8-4.5s3.8 1.6 3.8 4.5z', style: fill(look.hat) })]
    : look.hatKind === 'cap'
      ? [s('path', { d: 'M7.3 8.6c0-3.4 2-5.3 4.7-5.3s4.7 1.9 4.7 5.3z', style: fill(look.hat) }), s('path', { d: 'M15.2 8.6h4.4c0-1-.7-1.5-1.7-1.5h-2.7z', style: fill(look.hat) })]
      : [s('path', { d: 'M7.3 9.8c-.2-3.7 2-5.8 4.7-5.8s4.9 2.1 4.7 5.8c-1.2-1.3-2.8-1.9-4.7-1.9s-3.5.6-4.7 1.9z', style: fill(look.hair) })]
  return s('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: 'M2.6 24c0-5.3 4.2-8.6 9.4-8.6s9.4 3.3 9.4 8.6z', style: fill(look.shirt) }),
    s('path', { d: 'M10.3 14.2h3.4v2.6h-3.4z', style: fill(look.skin) }),
    s('circle', { cx: 12, cy: 10.6, r: 4.5, style: fill(look.skin) }),
    top)
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
  return !!u && s0.jobs.some(j => !waits[j.id] && (j.unit < 0 || j.unit === p.id) && S.willDo(u, j.kind) && !others.has(`${j.kind}|${j.field}`))
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

function skillBar(level: number, progress: number): HTMLElement {
  return h('span', { class: 'lvl', 'aria-hidden': 'true' },
    h('i', { style: `width:${level * 10}%` }),
    level < S.SKILL_MAX && progress > 0 ? h('b', { style: `left:${level * 10}%;width:${(progress * 10).toFixed(1)}%` }) : null)
}

// The next wage a raise offers: what they asked, or a tenth more, to the nearest $10.
function raiseTo(p: S.PersonInfo): number {
  return p.wage < p.ask ? p.ask : Math.round(p.wage * 1.1 / 10) * 10
}

export interface PersonCard {
  el: HTMLElement
  update(c: S.Campaign, show: boolean): void
}

export function personCard(ctx: Ctx): PersonCard {
  const app = ctx.app
  const el = h('section', { class: 'card person-card instrument', testid: 'person-card', 'aria-label': 'Person', hidden: true })
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
    const waits = S.jobWaits(app.world, c)
    const next = p.job ? null : nextFor(c, p.id)
    const why = R.moodWhy(c, p)
    const heading = R.moodHeading(c, p)
    const sign = R.personSign(p, idleWithWork(c, p, waits))
    const blocks = S.BLOCKS.filter(b => S.PARCELS.some((x, i) => x.block === b && S.held(c, i)))
    const doing = doingText(c, p)
    const tiredWhy = R.tiredWhy(c, p)
    return [
      h('header', { class: 'card-head p-head' },
        portrait(p.id, 'portrait l'),
        h('div', null,
          h('h2', { class: 't-head', testid: 'person-name' }, farmer ? 'You, the farmer' : p.name),
          h('p', { class: 'card-sub' }, farmer ? 'Every job; no wage' : `${p.traitName}: ${p.traitText.replace(/\.$/, '').replace(/^./, x => x.toLowerCase())}`)),
        h('span', { class: 'p-map' }, where(c, p.travelling ? p.to : p.at, 40, c.crew.map(u => ({ at: u.road > 0 ? u.to : u.at, colour: personLook(u.id).shirt, ring: u.id === p.id })))),
        h('button', { class: 'nicon', type: 'button', testid: 'person-close', 'aria-label': `Close${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.selectUnit(-1) }, icon('close'))),
      h('div', { class: 'p-now' },
        h('p', { class: 'reading p-doing', testid: 'person-doing' }, icon(doingGlyph(c, p), 'ic s'), h('span', null, doing),
          next && doing === 'Nothing to do' ? h('span', { class: 'age' }, `next: ${R.jobText(next, c, next.building).toLowerCase()}`) : null),
        h('p', { class: 'p-state' },
          h('span', { class: `p-st${p.tired >= S.TIRED_SLOW_FROM ? ' warn' : ''}${p.tired >= S.HURT_TIRED ? ' bad' : ''}`, testid: 'person-tired' },
            icon('tired', 'ic s'), h('strong', null, F.upper(p.tiredWord)), tiredWhy ? h('span', { class: 'why' }, tiredWhy) : null),
          h('span', { class: `p-st${p.mood < 0.45 ? ' warn' : ''}${p.quitIn >= 0 ? ' bad' : ''}`, testid: 'person-mood' },
            icon(p.mood < 0.45 ? 'unhappy' : 'happy', 'ic s'), h('strong', null, `${F.upper(p.moodWord)}${heading ? `, ${heading}` : ''}`),
            h('span', { class: 'why' }, p.quitIn >= 0 ? `quits in ${F.plural(p.quitIn, 'day')} unless it lifts` : why.length ? why.map(x => `${x.up ? '+' : '−'} ${x.text}`).join(', ') : 'nothing pulling either way')),
          sign && sign.glyph === 'hurt' ? h('span', { class: 'p-st bad' }, icon('hurt', 'ic s'), h('strong', null, 'Hurt'), h('span', { class: 'why' }, `back on ${F.date(c.year, p.hurtUntil)}`)) : null)),
      h('div', { class: 'p-skills', role: 'group', 'aria-label': 'Skills, and the order they take work in' },
        h('span', { class: 'p-row-0', 'aria-hidden': 'true' }), h('span', { class: 't-label p-row' }, 'Skill'), h('span', { class: 't-label p-row p-row-2' }, 'Priority'),
        S.SKILLS.map(k => {
          const lvl = p.skills[k]
          const pr = p.prio[k]
          return h('div', { class: `p-skill${pr === 0 ? ' never' : ''}`, k: `skill-${k}` },
            h('span', { class: 'p-skill-name', title: ctx.touch() ? undefined : R.skillCovers(k) }, icon(R.SKILL_GLYPH[k], 'ic s'), SKILL_SHORT[k]),
            h('span', { class: 'p-lvl-row' }, skillBar(lvl, p.progress[k]),
              h('span', { class: 'p-lvl num', 'aria-label': `${R.SKILL_NAME[k]}: level ${lvl}${lvl < S.SKILL_MAX ? `, ${F.pct(p.progress[k])} of the way to ${lvl + 1}` : ''}` }, String(lvl))),
            h('button', {
              class: `prio p${pr}`, type: 'button', testid: `prio-${k}`,
              title: ctx.touch() ? undefined : `${R.skillCovers(k)}. 1 is done first; a dash is never.`,
              onclick: () => setPrio(p, k, R.prioNext(pr)),
              oncontextmenu: (e: Event) => { e.preventDefault(); setPrio(p, k, R.prioNext(pr, true)) },
              onkeydown: (e: Event) => prioKey(e as KeyboardEvent, p, k),
            }, h('span', { class: 'sr' }, `${R.SKILL_NAME[k]} work priority `), R.prioMark(pr),
            h('span', { class: 'sr' }, `: ${R.prioWord(pr)}. Press for ${R.prioWord(R.prioNext(pr))}. ${R.skillCovers(k)}.`)))
        })),
      flashed && performance.now() < flashed.until ? h('p', { class: 'card-line flash lv-warn', role: 'status' }, flashed.text) : null,
      farmer ? h('p', { class: 'card-line p-foot' }, 'You draw no wage: the household takes its share at the year end.') : h('div', { class: 'p-foot' },
        h('p', { class: 'p-wage num' }, h('strong', null, `${F.money(p.pay)} a month`), p.foreman ? ' as foreman' : '', p.ask ? h('span', { class: 'sub' }, ` asked ${F.money(p.ask)}`) : null),
        h('div', { class: 'orders p-orders' },
          h('button', {
            class: 'order', type: 'button', testid: 'person-raise', title: ctx.touch() ? undefined : 'More pay lifts their mood: about a tenth of the way for each 10% over what they asked.',
            onclick: () => run({ t: 'raise', unit: p.id, wage: raiseTo(p) }, `${R.firstName(p.name)} now earns ${F.money(raiseTo(p))} a month.`),
          }, icon('rise'), h('span', { class: 'order-name' }, 'Raise'), h('span', { class: 'order-meta num' }, `to ${F.money(raiseTo(p))}`)),
          blocks.length ? h('button', {
            class: 'order', type: 'button', testid: 'person-foreman', 'aria-expanded': String(foreman),
            title: ctx.touch() ? undefined : 'A foreman puts on the list what the fields of one block need, every working morning, and does no field work. Paid 40% more.',
            onclick: () => { foreman = !foreman; ctx.dirty() },
          }, icon('foreman'), h('span', { class: 'order-name' }, 'Foreman'), h('span', { class: 'order-meta' }, p.foreman ? BLOCK_NAME[p.foreman].replace(/^The /, '').split(',')[0] : '+40% pay')) : null,
          h('button', {
            class: 'order', type: 'button', testid: 'person-dismiss',
            onclick: async () => {
              const yes = await confirmPaper(ctx, { title: `Let ${R.firstName(p.name)} go?`, text: 'They leave today. The month already paid is not given back, and they will not come back.', yes: 'Let them go', danger: true })
              if (yes && run({ t: 'dismiss', unit: p.id }, `${p.name} is let go.`)) app.selectUnit(-1)
            },
          }, icon('go'), h('span', { class: 'order-name' }, 'Let go'), h('span', { class: 'order-meta' }, 'today'))),
        foreman ? h('div', { class: 'p-blocks', role: 'group', 'aria-label': 'Foreman of' },
          blocks.map(b => {
            const other = c.crew.find(u => u.foreman === b && u.id !== p.id)
            return h('button', {
              class: 'nbtn s', type: 'button', testid: `foreman-${b}`, 'aria-pressed': String(p.foreman === b), disabled: !!other,
              title: other ? `${other.name} is foreman there` : undefined,
              onclick: () => { foreman = false; run({ t: 'foreman', unit: p.id, block: b }, `${R.firstName(p.name)} is foreman of ${S.BLOCK_NAME[b]}.`) },
            }, BLOCK_NAME[b].replace(/^The /, '').split(',')[0])
          }),
          p.foreman ? h('button', { class: 'nbtn s', type: 'button', testid: 'foreman-none', onclick: () => { foreman = false; run({ t: 'foreman', unit: p.id, block: null }, `${R.firstName(p.name)} goes back to field work.`) } }, 'Back to field work') : null) : null),
    ]
  }

  function update(c: S.Campaign, show: boolean): void {
    const p = show ? S.peopleInfo(c).find(x => x.id === app.unit) : undefined
    if (!p) {
      if (!el.hidden && !ctx.reduced()) {
        el.classList.add('out')
        setTimeout(() => { if (!el.classList.contains('out')) return; el.hidden = true; el.classList.remove('out') }, EXIT_MS)
      } else el.hidden = true
      shownFor = -1
      foreman = false
      return
    }
    const was = el.hidden || el.classList.contains('out')
    el.classList.remove('out')
    el.hidden = false
    if (shownFor !== p.id) { shownFor = p.id; foreman = false; flashed = null }
    const s0 = c.season
    const model = {
      p, day: s0?.day, t: ctx.touch(), foreman, flash: flashed && performance.now() < flashed.until ? flashed.text : '',
      jobs: s0?.jobs.map(j => [j.id, j.unit]), crew: c.crew.map(u => [u.id, u.at, u.to, u.job, u.foreman]), sun: c.sundaysOff,
    }
    patch(el, JSON.stringify(model), () => body(c, p))
    el.setAttribute('aria-label', p.kind === 'farmer' ? 'You, the farmer' : p.name)
    if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
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
  const el = h('section', { class: 'grid-panel instrument', testid: 'work-grid', 'aria-labelledby': 'grid-title', hidden: true })
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

  function rules(c: S.Campaign): Child {
    const l = S.labourInfo(c)
    const pickFrom = F.date(c.year, S.dayIndex(c.year, S.PICKERS_FROM.month, S.PICKERS_FROM.dom), true)
    const pickTo = F.date(c.year, S.dayIndex(c.year, S.PICKERS_TO.month, S.PICKERS_TO.dom), true)
    return h('div', { class: 'rules', role: 'group', 'aria-label': 'Farm rules' },
      h('div', { class: 'rule-row' },
        h('button', {
          class: 'nbtn s', type: 'button', testid: 'rule-sundays', 'aria-pressed': String(l.sundaysOff),
          onclick: () => { const r = ctx.run({ t: 'sundays', off: !l.sundaysOff }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) },
        }, icon('sunday', 'ic s'), 'Sundays off'),
        h('p', { class: 'rule-why' }, l.sundaysOff ? 'Everyone rests a day a week. Working Sundays gains a day, and tires everyone.' : 'Sundays are worked: a day more each week, and everyone tires.')),
      h('div', { class: 'rule-row' },
        l.pickers.ok || l.pickers.on ? h('button', {
          class: 'nbtn s', type: 'button', testid: 'rule-pickers', 'aria-pressed': String(l.pickers.on),
          onclick: () => { const r = ctx.run({ t: 'pickers', on: !l.pickers.on }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) },
        }, icon('pickers', 'ic s'), 'Pickers') : h('span', { class: 'rule-off' }, icon('pickers', 'ic s'), 'Pickers'),
        h('p', { class: 'rule-why' }, `${F.money(l.pickers.perDay)} a day worked: every dig ${F.pct(l.pickers.digFaster - 1)} faster. ${pickFrom} to ${pickTo}, while the schools close.`)))
  }

  function body(c: S.Campaign): Child {
    const people = S.peopleInfo(c)
    if (at.row >= people.length) at = { row: people.length - 1, col: at.col }
    return [
      h('header', { class: 'grid-head' },
        h('h2', { class: 't-head', id: 'grid-title' }, 'Who does what'),
        h('p', { class: 'card-sub' }, '1 is done first; a dash is never.'),
        h('button', { class: 'nicon', type: 'button', testid: 'grid-close', 'aria-label': `Close the work grid${ctx.touch() ? '' : ' (G)'}`, onclick: () => toggle(false) }, icon('close'))),
      h('div', { class: 'grid-scroll', 'data-scroll': 'grid' },
        h('table', { class: 'work', role: 'grid', 'aria-labelledby': 'grid-title' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Person')),
            S.SKILLS.map(k => h('th', { scope: 'col', title: ctx.touch() ? undefined : R.skillCovers(k) }, icon(R.SKILL_GLYPH[k], 'ic s'), h('span', { class: 'w-k' }, R.SKILL_NAME[k]))))),
          h('tbody', null, people.map((p, row) => h('tr', { class: p.foreman ? 'foreman' : '', k: `row-${p.id}` },
            h('th', { scope: 'row' },
              h('button', { class: 'w-who', type: 'button', testid: `grid-person-${p.id}`, tabindex: '-1', onclick: () => { app.selectUnit(p.id) } },
                portrait(p.id, 'portrait s'), h('span', null, R.firstName(p.name)))),
            p.foreman ? h('td', { colspan: S.SKILLS.length, class: 'w-foreman' }, `Foreman of ${S.BLOCK_NAME[p.foreman]}: no field work`)
              : S.SKILLS.map((k, col) => {
                const lvl = p.skills[k]
                const pr = p.prio[k]
                const here = at.row === row && at.col === col
                return h('td', { role: 'gridcell' }, h('button', {
                  class: `cell p${pr}`, type: 'button', testid: `cell-${p.id}-${k}`, 'data-cell': `${row}-${col}`, tabindex: here ? '0' : '-1',
                  onclick: () => { at = { row, col }; set(p.id, k, R.prioNext(pr), R.firstName(p.name)) },
                  oncontextmenu: (e: Event) => { e.preventDefault(); at = { row, col }; set(p.id, k, R.prioNext(pr, true), R.firstName(p.name)) },
                  onkeydown: (e: Event) => key(e as KeyboardEvent, people, row, col),
                  onfocus: () => { if (at.row !== row || at.col !== col) { at = { row, col }; ctx.dirty() } },
                }, h('span', { class: 'cell-skill', style: `width:${lvl * 10}%` }),
                h('span', { class: 'sr' }, `${R.firstName(p.name)}, ${S.SKILL_LABEL[k]}, skill ${lvl}, priority `), h('span', { class: 'cell-v num' }, R.prioMark(pr)),
                h('span', { class: 'sr' }, `, ${R.prioWord(pr)}`)))
              })))))),
      note ? h('p', { class: 'card-line flash lv-warn', role: 'status' }, note) : null,
      rules(c),
    ]
  }

  function update(c: S.Campaign): void {
    el.hidden = !open
    if (!open) return
    const l = S.labourInfo(c)
    patch(el, JSON.stringify([c.crew.map(u => [u.id, u.name, u.prio, u.skills, u.foreman]), at, note, l.sundaysOff, l.pickers, ctx.touch()]), () => body(c))
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
