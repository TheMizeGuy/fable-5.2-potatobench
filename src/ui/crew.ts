// The people bar: a chip for each person in their own colours, the list of orders with who holds each, and the hiring hall.
import * as S from '../sim/index.ts'
import { gauge, patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { placeName, where } from './map.ts'
import { doingGlyph, idleWithWork, portrait } from './people.ts'
import { firstName, initial, jobText, KIND_GLYPH, KIND_NAME, kindDoes, personSign, SKILL_NAME, type Sign } from './rules.ts'

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

// Who holds an order: the crew it is pinned to, or the one working it.
function holder(crews: S.CrewInfo[], j: S.Job): { u: S.CrewInfo; pinned: boolean } | null {
  if (j.unit >= 0) { const u = crews.find(x => x.id === j.unit); return u ? { u, pinned: true } : null }
  const u = crews.find(x => x.job?.id === j.id)
  return u ? { u, pinned: false } : null
}

export interface BarHooks {
  // Incidents waiting for an answer whose card is put away, and the way back to the first of them.
  waiting(): S.IncidentInfo[]
  onIncident(): void
  gridOpen(): boolean
  onGrid(): void
  // Whether hiring is in reach yet, and whether the goal line points at it.
  hireShown(): boolean
  goal(): 'hire' | 'person' | ''
}

export function unitBar(ctx: Ctx, el: HTMLElement, hooks: BarHooks): { update(c: S.Campaign): void; escape(): boolean; dispose(): void } {
  const app = ctx.app
  let expanded = false
  // The order whose choices are open, and whether only the choice of crew is shown (from the mouse) or all of them.
  let pop = -1
  let popWho = false
  const closePop = (e: Event) => {
    if ((pop >= 0 || expanded) && !(e.target as HTMLElement).closest?.('.crew')) { pop = -1; expanded = false; ctx.dirty() }
  }
  document.addEventListener('pointerdown', closePop, true)

  function cancel(id: number): void { pop = -1; ctx.run({ t: 'cancel', id }) }
  function bump(id: number): void { pop = -1; ctx.run({ t: 'bump', id }) }
  function assign(id: number, unit: number, what: string, who: string): void {
    pop = -1
    if (ctx.run({ t: 'assign', id, unit }).ok) ctx.announce(`${what}: ${unit < 0 ? 'anyone can take it' : `${who} takes it`}.`)
  }

  function chip(c: S.Campaign, p: S.PersonInfo, d: Doing, sign: Sign, many: boolean, goal: boolean): HTMLElement {
    const on = app.unit === p.id
    const name = firstName(p.name)
    const said = `${p.kind === 'farmer' ? 'You, the farmer' : p.name}: ${d.text}${sign ? `; ${sign.text}` : ''}.`
    if (!many) {
      return h('div', { class: 'unit solo', testid: `unit-${p.id}`, title: ctx.touch() ? undefined : said },
        portrait(p.id, 'portrait'),
        h('span', { class: 'unit-doing' }, icon(d.glyph, 'ic s'), h('span', { class: 'unit-text' }, d.text)),
        d.progress > 0 ? gauge(d.progress, { label: d.text, text: `${F.pct(d.progress)} done` }) : null)
    }
    return h('button', {
      class: `unit person${on ? ' on' : ''}${sign ? ` sign-${sign.cls}` : ''}${goal ? ' goal-ring' : ''}`, type: 'button', testid: `unit-${p.id}`, 'aria-pressed': String(on),
      'aria-label': `${said} ${on ? 'Their card is open. Press again to close it.' : 'Press for their card; orders given now go to them.'}`,
      title: ctx.touch() ? undefined : said, onclick: () => { if (on) app.selectUnit(-1); else { app.select(-1); app.selectYard(0); app.selectUnit(p.id) } },
    },
    h('span', { class: 'pp' }, portrait(p.id),
      h('span', { class: 'pp-do' }, icon(doingGlyph(c, p), 'ic s')),
      sign ? h('span', { class: `pp-sign ${sign.cls}` }, icon(sign.glyph, 'ic s')) : null),
    h('span', { class: 'unit-name' }, name),
    d.progress > 0 ? gauge(d.progress, { label: d.text, text: `${F.pct(d.progress)} done` }) : null)
  }

  function update(c: S.Campaign): void {
    const s0 = c.season!
    const waits = S.jobWaits(app.world, c)
    const jobs = s0.jobs
    const crews = S.crewInfo(c)
    const people = S.peopleInfo(c)
    const many = people.length > 1
    const layout = ctx.layout()
    const touch = ctx.touch()
    const head = jobs.find(j => !waits[j.id]) ?? null
    const waiting = hooks.waiting()
    const goal = hooks.goal()
    // How many orders the strip has room for before the rest fold behind a count.
    const item = many ? 58 : 46
    const room = layout === 'narrow' ? Math.max(2, Math.floor((innerWidth - 16 - (many ? 64 : 148) - 56) / item)) : layout === 'short' ? 3 : Math.floor(284 / (item + 4))
    const all = expanded || jobs.length <= room
    const list = all ? jobs : jobs.slice(0, room - 1)
    const now = crews.map(u => doing(c, u, waits, crews))
    const signs = people.map(p => personSign(p, idleWithWork(c, p, waits)))
    const model = {
      j: jobs.map(j => [j.id, j.kind, j.field, j.unit, Math.round(j.need > 0 ? j.done / j.need * 20 : 0), waits[j.id]]),
      u: crews.map((u, k) => [u.id, u.name, now[k].text, now[k].place, Math.round(now[k].progress * 20), signs[k]?.glyph, signs[k]?.cls, doingGlyph(c, people[k])]),
      pick: app.unit, expanded, pop, popWho, layout, room, touch, h: c.fields.map(f => f.tenure), w: waiting.map(x => x.id), grid: hooks.gridOpen(), hire: hooks.hireShown(), goal,
    }
    el.classList.toggle('busy', jobs.length > 0)
    el.classList.toggle('many', many)
    patch(el, JSON.stringify(model), () => [
      h('div', { class: `units${many ? ' many' : ''}`, role: 'group', 'aria-label': 'People' },
        people.map((p, k) => chip(c, p, now[k], signs[k], many, goal === 'person' && k === 1)),
        h('span', { class: 'bar-tools' },
          waiting.length ? h('button', {
            class: 'nicon s inc-mark', type: 'button', testid: 'incident-open', 'aria-label': `${waiting[0].title}: waiting for an answer`, title: touch ? undefined : waiting[0].title,
            onclick: () => hooks.onIncident(),
          }, icon('ask'), waiting.length > 1 ? h('span', { class: 'inc-n num', 'aria-hidden': 'true' }, String(waiting.length)) : null) : null,
          people.length >= 3 ? h('button', {
            class: 'nicon s', type: 'button', testid: 'grid-open', 'aria-pressed': String(hooks.gridOpen()), 'aria-label': `Who does what${touch ? '' : ' (G)'}`,
            title: touch ? undefined : 'Who does what (G)', onclick: () => hooks.onGrid(),
          }, icon('grid')) : null,
          hooks.hireShown() ? h('button', {
            class: `nicon s crew-open${goal === 'hire' ? ' goal-ring' : ''}`, type: 'button', testid: 'crew-open', 'aria-label': 'Hire someone', title: touch ? undefined : 'Hire someone',
            onclick: () => openCrew(ctx),
          }, icon('hire')) : null)),
      jobs.length ? h('ol', { class: `queue${expanded ? ' all' : ''}`, 'aria-label': 'Orders, in the order the crews take them' }, list.map((j, k) => {
        const what = jobText(j, c, j.building)
        const lockDig = (j.kind === 'dig' && j.done > 0) || j.kind === 'haul' || j.kind === 'build'
        const who = holder(crews, j)
        const able = people.filter(p => S.unitBlock(c, j.kind, p.id) === '')
        const whoSaid = who ? `${who.pinned ? 'given to' : 'taken by'} ${who.u.name === S.FARMER_NAME ? 'you' : who.u.name}` : 'for anyone'
        const choices = many && able.length > 1 ? h('div', { class: 'q-who', role: 'group', 'aria-label': `Who does ${what.toLowerCase()}` },
          [{ id: -1, name: 'Anyone' }, ...able.map(u => ({ id: u.id, name: firstName(u.name) }))].map(x => h('button', {
            class: 'nbtn s', type: 'button', testid: `assign-${j.id}-${x.id}`, 'aria-pressed': String(j.unit === x.id),
            onclick: () => assign(j.id, x.id, what, x.name),
          }, x.id >= 0 ? portrait(x.id, 'portrait xs') : null, x.name))) : null
        return h('li', { class: 'q-item', k: `q-${j.id}` },
          h('button', {
            class: `q${j === head ? ' active' : ''}${waits[j.id] ? ' waiting' : ''}`, type: 'button', testid: `queue-${j.id}`, 'aria-expanded': touch ? String(pop === j.id) : null,
            title: touch ? undefined : `${what}, ${whoSaid}${waits[j.id] ? ` (waiting: ${waits[j.id]})` : ''}. ${lockDig ? 'It stays on the list until it is done' : 'Click to cancel'}${k > 0 ? ', Ctrl-click to do it first' : ''}`,
            onclick: (e: Event) => {
              const m = e as MouseEvent
              if (m.ctrlKey || m.metaKey) bump(j.id)
              else if (touch) { pop = pop === j.id ? -1 : j.id; popWho = false; ctx.dirty() }
              else cancel(j.id)
            },
            oncontextmenu: (e: Event) => { e.preventDefault(); bump(j.id) },
            onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse' && j.field >= 0) app.setHover(j.field) },
            onpointerleave: () => { if (app.hover === j.field) app.setHover(-1) },
          }, icon(j.kind), where(c, j.field),
          many && who ? h('span', { class: `q-tag${who.pinned ? ' pinned' : ''}`, 'aria-hidden': 'true' }, initial(who.u.name)) : null,
          h('span', { class: 'sr' }, `${what}, ${whoSaid}${waits[j.id] ? `, waiting: ${waits[j.id]}` : j.done > 0 && j.need > 0 ? `, ${F.pct(j.done / j.need)} done` : ''}. ${touch ? 'Tap for its choices.' : `${lockDig ? 'It stays on the list until it is done' : 'Click to cancel'}${k > 0 ? '; Ctrl-click to do it first' : ''}.`}`)),
          !touch ? h('span', { class: 'q-tools' },
            k > 0 ? h('button', { class: 'q-first', type: 'button', testid: `queue-first-${j.id}`, 'aria-label': `${what}: do it first`, title: 'Do it first', onclick: () => bump(j.id) }, icon('first', 'ic s')) : null,
            choices ? h('button', {
              class: 'q-first', type: 'button', testid: `queue-who-${j.id}`, 'aria-label': `${what}: choose who does it`, 'aria-expanded': String(pop === j.id), title: 'Who does it',
              onclick: () => { pop = pop === j.id ? -1 : j.id; popWho = true; ctx.dirty() },
            }, icon('crew', 'ic s')) : null) : null,
          pop === j.id ? h('div', { class: 'q-pop', role: 'group', 'aria-label': what },
            h('span', { class: 'q-pop-title' }, what),
            !popWho && k > 0 ? h('button', { class: 'nbtn', type: 'button', testid: `queue-first-${j.id}`, onclick: () => bump(j.id) }, icon('first', 'ic s'), 'First') : null,
            !popWho && !lockDig ? h('button', { class: 'nbtn', type: 'button', testid: `queue-cancel-${j.id}`, onclick: () => cancel(j.id) }, icon('close', 'ic s'), 'Cancel') : null,
            choices) : null)
      }),
      jobs.length > room ? h('li', { class: 'q-item' }, h('button', {
        class: 'q more', type: 'button', testid: 'queue-more', 'aria-expanded': String(expanded),
        onclick: () => { expanded = !expanded; ctx.dirty() },
      }, expanded ? icon('back') : h('span', { class: 'num', 'aria-hidden': 'true' }, `+${jobs.length - list.length}`),
      h('span', { class: 'sr' }, expanded ? 'Show fewer orders' : `Show all ${jobs.length} orders`))) : null) : null,
    ])
  }

  return {
    update,
    escape() {
      if (pop >= 0 || expanded) { pop = -1; expanded = false; ctx.dirty(); return true }
      return false
    },
    dispose() { document.removeEventListener('pointerdown', closePop, true) },
  }
}

// ---------------------------------------------------------------- the hiring hall

function skillsLine(skills: Record<S.Skill, number>): HTMLElement {
  return h('span', { class: 'hall-skills num' }, S.SKILLS.map(k => h('span', { class: skills[k] >= 6 ? 'good' : '' }, `${SKILL_NAME[k]} ${skills[k]}`)))
}

export function openCrew(ctx: Ctx): void {
  const app = ctx.app
  if (!app.campaign) return
  ctx.papers.open({
    title: 'Hiring',
    testid: 'crew',
    size: 'medium',
    body: () => {
      const box = h('div', { class: 'crew-paper' })
      const draw = () => {
        const c = app.campaign
        if (!c) return
        const season = c.phase === 'season'
        const l = S.labourInfo(c)
        const room = S.hireRoom(c)
        const hired = (r: S.Result) => { if (r.ok) { ctx.announce(F.localize(r.events[0]?.text ?? 'Hired.')); draw() } else { ctx.say(r.err, 'warn') } }
        const hall = (kind: 'hand' | 'operator') => {
          const wage = kind === 'hand' ? S.HAND_WAGE : S.OPERATOR_WAGE
          return h('li', { class: 'crew-row' },
            icon(KIND_GLYPH[kind], 'ic l'),
            h('div', null,
              h('h4', { class: 't-head' }, KIND_NAME[kind], h('span', { class: 'sub num' }, ` ${F.money(wage)} a month`)),
              skillsLine(kind === 'hand' ? S.HAND_SKILLS : S.OPERATOR_SKILLS),
              h('p', { class: 'sub' }, kind === 'hand' ? `${kindDoes('hand')} Set never to drive.` : `${kindDoes('operator')} Set never to walk the rows.`)),
            room ? null : h('button', { class: 'btn', type: 'button', testid: `hire-${kind}`, onclick: () => hired(ctx.run({ t: 'hire', kind })) }, `Hire, ${F.money(wage)}`))
        }
        const applicants = S.applicantInfo(c)
        box.replaceChildren(h('div', { class: 'crew-in' },
          h('p', { class: 't-lede' }, 'Everyone works the list by their own priorities. Skill makes the work quicker and better.'),
          h('p', { class: `beds${room ? ' warn-text' : ''}`, testid: 'beds' }, icon('bunk', 'ic s'),
            room ? F.localize(room) : `${l.hired} hired; room for ${l.housing}. ${S.HOUSED_OUT} live out, and a bunkhouse beds ${S.BUNK_BEDS}.`),
          applicants.length ? [
            h('h3', { class: 'block-head' }, 'Asking for work this spring'),
            h('ul', { class: 'crew-list' }, applicants.map(a => h('li', { class: 'crew-row' },
              icon('hire', 'ic l'),
              h('div', null,
                h('h4', { class: 't-head' }, a.name, h('span', { class: 'sub num' }, ` asks ${F.money(a.ask)} a month`)),
                skillsLine(a.skills),
                h('p', { class: 'sub' }, `${a.traitName}: ${a.traitText}`)),
              a.why ? null : h('button', { class: 'btn', type: 'button', testid: `hire-applicant-${a.id}`, onclick: () => hired(ctx.run({ t: 'hire', applicant: a.id })) }, 'Hire')))),
          ] : null,
          h('h3', { class: 'block-head' }, applicants.length ? 'Or from the hiring hall' : 'From the hiring hall'),
          h('ul', { class: 'crew-list' }, hall('hand'), hall('operator')),
          c.crew.length > 1 ? [
            h('h3', { class: 'block-head' }, 'On the farm'),
            h('ul', { class: 'crew-list' }, c.crew.filter(u => u.kind !== 'farmer').map(u => h('li', { class: 'crew-row' },
              icon(KIND_GLYPH[u.kind], 'ic l'),
              h('div', null, h('h4', { class: 't-head' }, u.name, h('span', { class: 'sub num' }, ` ${F.money(S.payOf(u))} a month`)), skillsLine(u.skills)),
              h('button', {
                class: 'btn', type: 'button', testid: `dismiss-${u.id}`,
                onclick: () => { const r = ctx.run({ t: 'dismiss', unit: u.id }); if (r.ok) { if (app.unit === u.id) app.selectUnit(-1); ctx.announce(F.localize(r.events[0]?.text ?? 'Let go.')); draw() } },
              }, 'Let go')))),
          ] : null,
          h('p', { class: 'sub' }, season
            ? 'Hired now, the first month is paid at once, then a month at a time until the season closes. The month already paid is not given back.'
            : 'Hired in spring, the first month is paid when the season begins. People stay on from year to year until let go.'),
        ))
      }
      draw()
      return box
    },
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'crew-close', autofocus: true, onclick: close }, 'Back'),
  })
}

