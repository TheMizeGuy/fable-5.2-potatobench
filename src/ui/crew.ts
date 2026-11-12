// The time book (design/season.html): a cell for each person along the foot of the screen, their portrait in their
// ring, their name and what they are doing in a word; the list of orders with who holds each; and the hiring hall.
import * as S from '../sim/index.ts'
import { confirmPaper, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { placeName, where } from './map.ts'
import { doingGlyph, idleWithWork, sprayWay } from './people.ts'
import { firstName, initial, JOB_DOING, JOB_VERB, jobText, KIND_GLYPH, KIND_NAME, kindDoes, personSign, SKILL_NAME, type Sign } from './rules.ts'
import { portrait, ringed, ringOf } from './system/people.ts'

// What a crew is doing now, in a few words, and the glyph and place that go with it.
export interface Doing { glyph: string; text: string; place: number; progress: number }

export function doing(c: S.Campaign, u: S.CrewInfo, waits: Record<number, string>, crews: S.CrewInfo[] = []): Doing {
  const s = c.season
  if (!s) return { glyph: 'stale', text: 'Idle', place: u.at, progress: 0 }
  if (s.frozen) return { glyph: 'frost', text: 'The ground has frozen', place: u.at, progress: 0 }
  const job = u.job ? s.jobs.find(j => j.id === u.job!.id) : undefined
  if (u.travelling) return { glyph: 'go', text: `To ${placeName(u.to)}`, place: u.to, progress: 0 }
  if (job) return { glyph: job.kind, text: jobText(job, c, job.building), place: job.field, progress: job.need > 0 ? job.done / job.need : 0 }
  // Between orders: the first on the list it could take next, or why it is held up.
  const unit = c.crew.find(x => x.id === u.id)
  const could = s.jobs.filter(j => (j.unit < 0 || j.unit === u.id) && (!unit || S.willDo(unit, j.kind)) && !crews.some(o => o.id !== u.id && o.job?.id === j.id))
  const next = could.find(j => !waits[j.id])
  if (next) return { glyph: next.kind, text: jobText(next, c, next.building), place: next.field, progress: next.need > 0 ? next.done / next.need : 0 }
  if (could.length) return { glyph: 'stale', text: `Waiting: ${waits[could[0].id]}`, place: u.at, progress: 0 }
  return { glyph: 'stale', text: u.at === S.HOME_YARD ? 'Idle' : `Idle at ${placeName(u.at)}`, place: u.at, progress: 0 }
}

// What a person is doing, as the time book prints it: one word under their name.
const WORD: Partial<Record<string, string>> = { foreman: 'Foreman', hurt: 'Hurt', sunday: 'Sunday', go: 'On the road', stale: 'Idle', frost: 'Frozen' }
export function doingWord(c: S.Campaign, p: S.PersonInfo): string {
  const g = doingGlyph(c, p)
  if (WORD[g]) return WORD[g]!
  const kind = g as S.JobKind
  return JOB_DOING[kind] ? JOB_DOING[kind].replace(/ (in|from|round)$/, '') : 'Idle'
}

// Each person's ring, by the order they joined the farm.
export function ringFor(c: S.Campaign, id: number): string {
  return ringOf(Math.max(0, c.crew.findIndex(u => u.id === id)))
}

// Who holds an order: the crew it is pinned to, or the one working it.
function holder(crews: S.CrewInfo[], j: S.Job): { u: S.CrewInfo; pinned: boolean } | null {
  if (j.unit >= 0) { const u = crews.find(x => x.id === j.unit); return u ? { u, pinned: true } : null }
  const u = crews.find(x => x.job?.id === j.id)
  return u ? { u, pinned: false } : null
}

export interface BarHooks {
  // Incidents waiting for an answer whose telegram is put away, and the way back to the first of them.
  waiting(): S.IncidentInfo[]
  onIncident(): void
  gridOpen(): boolean
  onGrid(): void
  // Whether hiring is in reach yet, and whether the goal points at it.
  hireShown(): boolean
  goal(): 'hire' | 'person' | ''
}

const NEXT_MS = 2600

// Each order's fate (who takes it and when, or why nobody will) and the work the season cannot wait for, worked out
// once for each state of the list and the people: it plays the next day on a copy of the farm.
let fate: { key: string; of: Map<number, S.JobOutlook>; pressing: S.Pressing[] } = { key: '', of: new Map(), pressing: [] }
export function fates(world: S.World, c: S.Campaign): { of: Map<number, S.JobOutlook>; pressing: S.Pressing[] } {
  const s = c.season
  if (!s) return { of: new Map(), pressing: [] }
  const key = JSON.stringify([c.seed, c.year, s.day, s.watchDay, s.jobs.map(j => [j.id, j.unit, j.kind, j.field, j.done > 0]), c.crew.map(u => [u.id, u.prio, u.rest, u.foreman, u.out, u.job, Math.round(u.tired * 20)]), c.routine])
  if (key !== fate.key) fate = { key, of: new Map(S.jobOutlook(world, c).map(o => [o.id, o])), pressing: S.pressing(world, c) }
  return fate
}

// The one press that clears the way for pressing work, in words.
function fixWord(c: S.Campaign, p: S.Pressing): string {
  const f = p.fix
  if (!f) return ''
  if (f.t === 'job') return `${JOB_VERB[p.kind]} ${S.FIELD_NAMES[p.field] ?? ''}`.trim()
  if (f.t === 'priority') { const u = c.crew.find(x => x.id === f.unit); return u ? `${firstName(u.name)}: ${SKILL_NAME[f.work].toLowerCase()} work first` : 'Put it first' }
  return 'Clear the way'
}

export function unitBar(ctx: Ctx, el: HTMLElement, hooks: BarHooks): { update(c: S.Campaign): void; escape(): boolean; dispose(): void } {
  const app = ctx.app
  let expanded = false
  // The order whose choices are open, and whether only the choice of crew is shown (from the mouse) or all of them.
  let pop = -1
  let popWho = false
  // The Next slip over the cell of whoever will take an order just given.
  let next: { unit: number; kind: S.JobKind; field: number; until: number } | null = null
  const closePop = (e: Event) => {
    if ((pop >= 0 || expanded) && !(e.target as HTMLElement).closest?.('.timebook, .queue')) { pop = -1; expanded = false; ctx.dirty() }
  }
  document.addEventListener('pointerdown', closePop, true)
  const off = app.on(e => {
    if (e.type !== 'order') return
    const c = app.campaign
    const s0 = c?.season
    if (!c || !s0) return
    const j = [...s0.jobs].reverse().find(x => e.fields.includes(x.field))
    if (!j) return
    const crews = S.crewInfo(c)
    const waits = S.jobWaits(app.world, c)
    const who = j.unit >= 0 ? crews.find(u => u.id === j.unit) : crews.find(u => { const d = doing(c, u, waits, crews); return d.place === j.field && d.glyph === j.kind })
    if (!who || c.crew.length < 2) return
    next = { unit: who.id, kind: j.kind, field: j.field, until: performance.now() + (ctx.reduced() ? NEXT_MS : NEXT_MS) }
    setTimeout(() => ctx.dirty(), NEXT_MS + 40)
    ctx.dirty()
  })

  function cancel(id: number): void {
    pop = -1
    const c = app.campaign
    const j = c?.season?.jobs.find(x => x.id === id)
    if (!c || !j) return
    const was = { kind: j.kind, field: j.field, unit: j.unit }
    if (!ctx.run({ t: 'cancel', id }).ok) return
    const what = jobText(j, c, j.building)
    ctx.notes.push({ level: 'info', glyph: j.kind, text: `${what}: taken off the list. Put it back`, full: `${what}: taken off the list. Press to put it back.`,
      ttl: 9000, go: () => { if (ctx.run({ t: 'job', kind: was.kind, field: was.field, unit: was.unit >= 0 ? was.unit : undefined }).ok) ctx.announce(`${what}: back on the list.`) } })
  }
  function bump(id: number): void { pop = -1; ctx.run({ t: 'bump', id }) }
  function assign(id: number, unit: number, what: string, who: string): void {
    pop = -1
    if (ctx.run({ t: 'assign', id, unit }).ok) ctx.announce(`${what}: ${unit < 0 ? 'anyone can take it' : `${who} takes it`}.`)
  }

  function cell(c: S.Campaign, p: S.PersonInfo, d: Doing, sign: Sign, many: boolean, goal: boolean, needsYou: boolean): HTMLElement {
    const on = app.unit === p.id && app.unitFrom === 'list'
    const name = firstName(p.name)
    const ring = ringFor(c, p.id)
    const said = `${p.kind === 'farmer' ? 'You, the farmer' : p.name}: ${d.text}${sign ? `; ${sign.text}` : ''}.`
    const bad = sign?.cls === 'bad' || needsYou
    // Between orders, the work the list holds for them today, never IDLE while there is some.
    const plain = doingWord(c, p)
    const ahead = plain === 'Idle' && (S.JOBS as string[]).includes(d.glyph) ? JOB_DOING[d.glyph as S.JobKind].replace(/ (in|from|round)$/, '') : plain
    const word = sign?.cls === 'bad' ? F.upper(sign.text) : needsYou ? 'Stopped' : ahead
    const slip = next && next.unit === p.id && performance.now() < next.until
      ? h('span', { class: 'next tip', 'aria-hidden': 'true' }, h('span', { class: 't-label' }, 'Next'), ' ', h('span', null, icon(next.kind, 'i'), ` ${S.FIELD_NAMES[next.field]}`)) : null
    const kids: Child[] = [
      ringed(p, ring, 46),
      h('span', { class: 'nm unit-name' }, name),
      h('span', { class: `doing${bad ? ' bad' : ''}` }, icon(doingGlyph(c, p), 'i'), h('span', { class: 'unit-text' }, word)),
      bad ? h('span', { class: 'flag' }, h('span', { class: 'badge-dot', 'aria-hidden': 'true' }, '!')) : null,
      d.progress > 0 && !many ? h('span', { class: 'meter', role: 'meter', 'aria-label': d.text, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(d.progress * 100), 'aria-valuetext': `${F.pct(d.progress)} done` }, h('i', { style: `width:${(d.progress * 100).toFixed(1)}%` })) : null,
      slip,
    ]
    // What the cell prints is its name to a screen reader too, with the rest of what is known after it.
    return h('button', {
      class: `person unit${many ? '' : ' solo'}${on ? ' is-picked' : ''}${bad ? ' needs' : ''}${goal ? ' goal-ring' : ''}`, type: 'button', testid: `unit-${p.id}`, 'aria-pressed': String(on), style: `--c:${ring}`,
      title: ctx.touch() ? undefined : said, onclick: () => { if (on) app.selectUnit(-1); else { app.select(-1); app.selectYard(0); app.selectUnit(p.id) } },
    }, kids, h('span', { class: 'sr' }, `. ${said} ${on ? 'Their card is open. Press again to close it.' : 'Press for their card; orders given now go to them.'}`))
  }

  // Work the season cannot wait for that nobody will take, or that is not ordered: what it is, what is in its way,
  // and the one press that clears it.
  function pressingRow(c: S.Campaign, list: S.Pressing[]): Child {
    if (!list.length) return null
    return h('div', { class: 'pressing sys', role: 'group', 'aria-label': 'Work that cannot wait', testid: 'pressing' }, list.slice(0, 2).map(p =>
      h('p', { class: 'press' }, icon(p.kind, 'i'),
        h('span', { class: 'press-text' }, h('b', null, `${JOB_VERB[p.kind]} ${S.FIELD_NAMES[p.field] ?? ''}`.trim()), `: ${p.why}. ${F.localize(p.inWay)}`),
        p.fix ? h('button', {
          class: 'btn', type: 'button', testid: `pressing-fix-${p.kind}-${p.field}`,
          onclick: () => { const r = ctx.run(p.fix!); if (r.ok) ctx.announce(`${fixWord(c, p)}: done.`) },
        }, fixWord(c, p)) : null)))
  }

  function queue(c: S.Campaign, jobs: S.Job[], crews: S.CrewInfo[], people: S.PersonInfo[], waits: Record<number, string>, many: boolean, room: number, of: Map<number, S.JobOutlook>): Child {
    if (!jobs.length) return null
    const touch = ctx.touch()
    const head = jobs.find(j => !waits[j.id]) ?? null
    const all = expanded || jobs.length <= room
    const list = all ? jobs : jobs.slice(0, room - 1)
    return h('ol', { class: `queue${expanded ? ' all' : ''}`, 'aria-label': 'Orders, in the order the crews take them' },
      h('li', { class: 'q-label t-label', 'aria-hidden': 'true' }, 'On the list'),
      list.map((j, k) => {
        const what = jobText(j, c, j.building)
        const lockDig = (j.kind === 'dig' && j.done > 0) || j.kind === 'haul' || j.kind === 'build'
        const by = j.by ?? 'you'
        const who = holder(crews, j)
        // Who will take it and when, or why nobody will.
        const o = of.get(j.id)
        const taker = o && o.unit >= 0 ? c.crew.find(u => u.id === o.unit) : undefined
        const fateSaid = o ? F.localize(o.why) : ''
        const able = people.filter(p => S.unitBlock(c, j.kind, p.id) === '')
        const whoSaid = who ? `${who.pinned ? 'given to' : 'taken by'} ${who.u.name === S.FARMER_NAME ? 'you' : who.u.name}` : 'for anyone'
        const choices = many && able.length > 1 ? h('div', { class: 'q-who', role: 'group', 'aria-label': `Who does ${what.toLowerCase()}` },
          [{ id: -1, name: 'Anyone' }, ...able.map(u => ({ id: u.id, name: firstName(u.name) }))].map(x => h('button', {
            class: 'btn', type: 'button', testid: `assign-${j.id}-${x.id}`, 'aria-pressed': String(j.unit === x.id),
            onclick: () => assign(j.id, x.id, what, x.name),
          }, x.id >= 0 ? ringed(x, ringFor(c, x.id), 22) : null, x.name))) : null
        return h('li', { class: 'q-item', k: `q-${j.id}` },
          h('button', {
            class: `q${j === head ? ' active' : ''}${waits[j.id] || o?.when === 'waiting' ? ' waiting' : ''}${o && o.unit < 0 ? ' nobody' : ''} by-${by}`, type: 'button', testid: `queue-${j.id}`, 'aria-expanded': String(pop === j.id),
            title: touch ? undefined : `${what}. ${fateSaid || whoSaid} Click for its choices${k > 0 ? '; Ctrl-click to do it first' : ''}`,
            onclick: (e: Event) => {
              const m = e as MouseEvent
              if (m.ctrlKey || m.metaKey) bump(j.id)
              else { pop = pop === j.id ? -1 : j.id; popWho = false; ctx.dirty() }
            },
            oncontextmenu: (e: Event) => { e.preventDefault(); bump(j.id) },
            onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse' && j.field >= 0) app.setHover(j.field) },
            onpointerleave: () => { if (app.hover === j.field) app.setHover(-1) },
          }, icon(j.kind, 'i'), where(c, j.field),
          o && o.unit < 0 ? h('span', { class: 'q-tag q-nobody', testid: `nobody-${j.id}`, 'aria-hidden': 'true' }, '!')
            : taker && many ? h('span', { class: `q-tag${who?.pinned ? ' pinned' : ''} q-${o!.when}`, style: `--c:${ringFor(c, taker.id)}`, 'aria-hidden': 'true' }, initial(taker.name))
              : many && who ? h('span', { class: `q-tag${who.pinned ? ' pinned' : ''}`, style: `--c:${ringFor(c, who.u.id)}`, 'aria-hidden': 'true' }, initial(who.u.name)) : null,
          o && o.when === 'waiting' && o.unit >= 0 ? h('span', { class: 'q-wait', 'aria-hidden': 'true' }, icon('stale', 'i')) : null,
          by !== 'you' ? h('span', { class: 'q-by', title: touch ? undefined : by === 'routine' ? 'Put on the list by the crew\'s routine' : 'Put on the list by the foreman' }, icon(by === 'routine' ? 'sprout' : 'foreman', 'i')) : null,
          h('span', { class: 'sr' }, `${what}, ${by === 'routine' ? 'put on the list by the routine, ' : by === 'foreman' ? 'put on the list by the foreman, ' : ''}${whoSaid}${j.done > 0 && j.need > 0 ? `, ${F.pct(j.done / j.need)} done` : ''}. ${fateSaid} ${touch ? 'Tap' : 'Click'} for its choices.`)),
          !lockDig ? h('button', { class: 'q-x', type: 'button', testid: `list-x-${j.id}`, 'aria-label': `${what}: take it off the list`, title: touch ? undefined : 'Take it off the list', onclick: () => cancel(j.id) }, icon('close', 'i')) : null,
          !touch ? h('span', { class: 'q-tools' },
            k > 0 ? h('button', { class: 'q-first', type: 'button', testid: `queue-first-${j.id}`, 'aria-label': `${what}: do it first`, title: 'Do it first', onclick: () => bump(j.id) }, icon('first', 'i')) : null,
            choices ? h('button', {
              class: 'q-first', type: 'button', testid: `queue-who-${j.id}`, 'aria-label': `${what}: choose who does it`, 'aria-expanded': String(pop === j.id), title: 'Who does it',
              onclick: () => { pop = pop === j.id ? -1 : j.id; popWho = true; ctx.dirty() },
            }, icon('people', 'i')) : null) : null,
          pop === j.id ? h('div', { class: 'q-pop sheet', role: 'group', 'aria-label': what },
            h('span', { class: 't-label q-pop-title' }, what),
            fateSaid ? h('span', { class: `q-fate${o && o.unit < 0 ? ' c-red' : ''}`, testid: `fate-${j.id}` }, fateSaid) : null,
            !popWho && k > 0 ? h('button', { class: 'btn', type: 'button', testid: `queue-first-${j.id}`, onclick: () => bump(j.id) }, icon('first', 'i'), 'First') : null,
            !popWho && !lockDig ? h('button', { class: 'btn', type: 'button', testid: `queue-cancel-${j.id}`, onclick: () => cancel(j.id) }, icon('close', 'i'), 'Cancel') : null,
            choices) : null)
      }),
      jobs.length > room ? h('li', { class: 'q-item' }, h('button', {
        class: 'q more', type: 'button', testid: 'queue-more', 'aria-expanded': String(expanded),
        onclick: () => { expanded = !expanded; ctx.dirty() },
      }, expanded ? icon('back', 'i') : h('span', { class: 'num', 'aria-hidden': 'true' }, `+${jobs.length - list.length}`),
      h('span', { class: 'sr' }, expanded ? 'Show fewer orders' : `Show all ${jobs.length} orders`))) : null)
  }

  function update(c: S.Campaign): void {
    const s0 = c.season!
    const waits = S.jobWaits(app.world, c)
    const jobs = s0.jobs
    const f = fates(app.world, c)
    const crews = S.crewInfo(c)
    const people = S.peopleInfo(c)
    const many = people.length > 1
    const layout = ctx.layout()
    const touch = ctx.touch()
    const waiting = hooks.waiting()
    const goal = hooks.goal()
    const stopped = new Set(c.incidents.filter(i => i.kind === 'breakdown' && i.unit !== undefined).map(i => i.unit!))
    // How many orders the list has room for before the rest fold behind a count.
    const room = layout === 'narrow' ? Math.max(3, Math.floor((innerWidth - 120) / 52)) : layout === 'short' ? 4 : 7
    const now = crews.map(u => doing(c, u, waits, crews))
    const signs = people.map(p => personSign(p, idleWithWork(c, p, waits)))
    if (next && performance.now() >= next.until) next = null
    const model = {
      j: jobs.map(j => [j.id, j.kind, j.field, j.unit, Math.round(j.need > 0 ? j.done / j.need * 20 : 0), waits[j.id]]),
      u: crews.map((u, k) => [u.id, u.name, now[k].text, now[k].place, Math.round(now[k].progress * 20), signs[k]?.glyph, signs[k]?.cls, doingGlyph(c, people[k]), doingWord(c, people[k])]),
      pick: app.unit, expanded, pop, popWho, layout, room, touch, h: c.fields.map(f => f.tenure), w: waiting.map(x => x.id), grid: hooks.gridOpen(), hire: hooks.hireShown(), goal,
      next: next ? [next.unit, next.kind, next.field] : 0, stopped: [...stopped],
      fate: [...f.of.values()].map(o => [o.id, o.unit, o.when, o.why]), press: f.pressing.map(p => [p.kind, p.field, p.why, p.inWay]),
    }
    el.classList.toggle('busy', jobs.length > 0)
    el.classList.toggle('many', many)
    patch(el, JSON.stringify(model), () => [
      pressingRow(c, f.pressing.filter(p => !(p.kind === 'spray' && sprayWay(c) === 'none'))),
      queue(c, jobs, crews, people, waits, many, room, f.of),
      h('section', { class: 'timebook mount sys', 'aria-label': 'People' },
        h('div', { class: `page units${many ? ' many' : ''}${people.length > 5 ? ' crowded' : ''}`, role: 'group', 'aria-label': 'People' },
          people.map((p, k) => cell(c, p, now[k], signs[k], many, goal === 'person' && k === 1, stopped.has(p.id))),
          h('div', { class: 'tools bar-tools' },
            waiting.length ? h('button', {
              class: 'iconbtn inc-mark', type: 'button', testid: 'incident-open', 'aria-label': `${waiting[0].title}: waiting for an answer`, title: touch ? undefined : waiting[0].title,
              onclick: () => hooks.onIncident(),
            }, icon('ask', 'i'), waiting.length > 1 ? h('span', { class: 'inc-n num', 'aria-hidden': 'true' }, String(waiting.length)) : null) : null,
            people.length >= 3 ? h('button', {
              class: `iconbtn${hooks.gridOpen() ? ' is-on' : ''}`, type: 'button', testid: 'grid-open', 'aria-pressed': String(hooks.gridOpen()), 'aria-label': `Who does what${touch ? '' : ' (G)'}`,
              title: touch ? undefined : 'Who does what (G)', onclick: () => hooks.onGrid(),
            }, icon('grid', 'i')) : null,
            hooks.hireShown() ? h('button', {
              class: `iconbtn crew-open${goal === 'hire' ? ' goal-ring' : ''}`, type: 'button', testid: 'crew-open', 'aria-label': 'Hire someone', title: touch ? undefined : 'Hire someone',
              onclick: () => openCrew(ctx),
            }, icon('hire', 'i')) : null))),
    ])
  }

  return {
    update,
    escape() {
      if (pop >= 0 || expanded) { pop = -1; expanded = false; ctx.dirty(); return true }
      return false
    },
    dispose() { document.removeEventListener('pointerdown', closePop, true); off() },
  }
}

// ---------------------------------------------------------------- the hiring hall

// Five skills in a ruled row, the best in the seed company's green (design/spring.html).
function skillRow(skills: Record<S.Skill, number>): HTMLElement {
  const best = Math.max(...S.SKILLS.map(k => skills[k]))
  return h('ul', { class: 'skill-row', 'aria-label': S.SKILLS.map(k => `${SKILL_NAME[k]} ${skills[k]}`).join(', ') },
    S.SKILLS.map(k => h('li', { class: skills[k] === best && best >= 5 ? 'best' : '', 'aria-hidden': 'true' }, h('span', null, k === 'machine' ? 'Machine' : k === 'build' ? 'Build' : k === 'pack' ? 'Pack' : SKILL_NAME[k]), h('b', { class: 'num' }, String(skills[k])))))
}

export function openCrew(ctx: Ctx): void {
  const app = ctx.app
  if (!app.campaign) return
  ctx.papers.open({
    title: 'Hiring',
    testid: 'crew',
    size: 'medium',
    body: () => {
      const box = h('div', { class: 'crew-paper sys' })
      const draw = () => {
        const c = app.campaign
        if (!c) return
        const season = c.phase === 'season'
        const l = S.labourInfo(c)
        const room = S.hireRoom(c)
        const hired = (r: S.Result) => { if (r.ok) { ctx.announce(F.localize(r.events[0]?.text ?? 'Hired.')); draw() } else { ctx.say(r.err, 'warn') } }
        const hall = (kind: 'hand' | 'operator') => {
          const wage = kind === 'hand' ? S.HAND_WAGE : S.OPERATOR_WAGE
          return h('article', { class: 'applicant hall' },
            h('span', { class: 'hall-ic' }, icon(KIND_GLYPH[kind], 'i')),
            h('div', { class: 'who' }, h('h3', null, KIND_NAME[kind]), h('p', null, kind === 'hand' ? `${kindDoes('hand')} Set never to drive.` : `${kindDoes('operator')} Set never to walk the rows.`)),
            skillRow(kind === 'hand' ? S.HAND_SKILLS : S.OPERATOR_SKILLS),
            h('p', { class: 'price' }, h('b', { class: 'num' }, F.money(wage)), h('span', null, 'a month')),
            room ? null : h('button', { class: 'btn', type: 'button', testid: `hire-${kind}`, onclick: () => hired(ctx.run({ t: 'hire', kind })) }, 'Hire', h('span', { class: 'sr' }, `, ${F.money(wage)} a month`)))
        }
        const applicants = S.applicantInfo(c)
        box.replaceChildren(h('div', { class: 'crew-in' },
          h('p', { class: 't-caption' }, 'Everyone works the list by their own priorities. Skill makes the work quicker and better.'),
          h('p', { class: `beds${room ? ' c-red' : ''}`, testid: 'beds' }, icon('bunk', 'i'),
            room ? F.localize(room) : `${l.hired} hired; room for ${l.housing}. ${S.HOUSED_OUT} live out, and a bunkhouse beds ${S.BUNK_BEDS}.`,
            room && S.buildingInfo(c).some(b => b.kind === 'bunk' && b.state === 'none') ? h('button', { class: 'btn', type: 'button', testid: 'beds-build', onclick: () => { ctx.papers.closeTop(); app.selectYard(S.HOME_YARD) } }, icon('bunk', 'i'), 'Build a bunkhouse') : null),
          applicants.length ? [
            h('h3', { class: 't-label crew-h' }, 'Asking for work this spring'),
            applicants.map(a => h('article', { class: 'applicant' },
              portrait(a, 52),
              h('div', { class: 'who' }, h('h3', null, a.name), h('p', null, h('b', null, a.traitName), `: ${a.traitText.replace(/^./, x => x.toLowerCase())}`)),
              skillRow(a.skills),
              h('p', { class: 'price' }, h('b', { class: 'num' }, F.money(a.ask)), h('span', null, 'a month')),
              a.why ? null : h('button', { class: 'btn', type: 'button', testid: `hire-applicant-${a.id}`, onclick: () => hired(ctx.run({ t: 'hire', applicant: a.id })) }, 'Hire'))),
          ] : null,
          h('h3', { class: 't-label crew-h' }, applicants.length ? 'Or from the hiring hall' : 'From the hiring hall'),
          hall('hand'), hall('operator'),
          c.crew.length > 1 ? [
            h('h3', { class: 't-label crew-h' }, 'On the farm'),
            c.crew.filter(u => u.kind !== 'farmer').map(u => h('article', { class: 'applicant' },
              ringed(u, ringFor(c, u.id), 52),
              h('div', { class: 'who' }, h('h3', null, u.name), h('p', null, KIND_NAME[u.kind])),
              skillRow(u.skills),
              h('p', { class: 'price' }, h('b', { class: 'num' }, F.money(S.payOf(u))), h('span', null, 'a month')),
              h('button', {
                class: 'btn hazard', type: 'button', testid: `dismiss-${u.id}`,
                onclick: async () => {
                  const yes = await confirmPaper(ctx, { title: `Let ${firstName(u.name)} go?`, text: 'They leave today. The month already paid is not given back, and they will not come back.', yes: 'Let them go', danger: true })
                  if (!yes) return
                  const r = ctx.run({ t: 'dismiss', unit: u.id })
                  if (r.ok) { if (app.unit === u.id) app.selectUnit(-1); ctx.announce(F.localize(r.events[0]?.text ?? 'Let go.')); draw() }
                },
              }, icon('letgo', 'i'), 'Let go'))),
          ] : null,
          h('p', { class: 't-caption crew-foot' }, season
            ? 'Hired now, the first month is paid at once, then a month at a time until the season closes. The month already paid is not given back.'
            : 'Hired in spring, the first month is paid when the season begins. People stay on from year to year until let go.'),
        ))
      }
      draw()
      return box
    },
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'crew-close', autofocus: true, onclick: close }, 'Back', icon('arrow', 'i')),
  })
}
