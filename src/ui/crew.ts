// The crews: a chip for each on the unit bar, the list of orders with who holds each, and hiring and letting go.
import * as S from '../sim/index.ts'
import { gauge, patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { placeName, where } from './map.ts'
import { initial, JOB_DOING, KIND_GLYPH, KIND_NAME, kindDoes } from './rules.ts'

// What a crew is doing now, in a few words, and the glyph and place that go with it.
export interface Doing { glyph: string; text: string; place: number; progress: number }

export function doing(c: S.Campaign, u: S.CrewInfo, waits: Record<number, string>, crews: S.CrewInfo[] = []): Doing {
  const s = c.season
  if (!s) return { glyph: 'stale', text: 'Idle', place: u.at, progress: 0 }
  if (s.frozen) return { glyph: 'frost', text: 'The ground has frozen', place: u.at, progress: 0 }
  const job = u.job ? s.jobs.find(j => j.id === u.job!.id) : undefined
  if (u.travelling) return { glyph: 'go', text: `To ${placeName(u.to)}`, place: u.to, progress: 0 }
  if (job) return { glyph: job.kind, text: `${JOB_DOING[job.kind]} ${S.FIELD_NAMES[job.field]}`, place: job.field, progress: job.done / job.need }
  // Between orders: the first on the list it could take next, or why it is held up.
  const could = s.jobs.filter(j => (j.unit < 0 || j.unit === u.id) && S.canDo(u.kind, j.kind) && !crews.some(o => o.id !== u.id && o.job?.id === j.id))
  const next = could.find(j => !waits[j.id])
  if (next) return { glyph: next.kind, text: `${JOB_DOING[next.kind]} ${S.FIELD_NAMES[next.field]}`, place: next.field, progress: next.done / next.need }
  if (could.length) return { glyph: 'stale', text: `Waiting: ${waits[could[0].id]}`, place: u.at, progress: 0 }
  return { glyph: 'stale', text: u.at === S.HOME_YARD ? 'Idle' : `Idle at ${placeName(u.at)}`, place: u.at, progress: 0 }
}

// Who holds an order: the crew it is pinned to, or the one working it.
function holder(crews: S.CrewInfo[], j: S.Job): { u: S.CrewInfo; pinned: boolean } | null {
  if (j.unit >= 0) { const u = crews.find(x => x.id === j.unit); return u ? { u, pinned: true } : null }
  const u = crews.find(x => x.job?.id === j.id)
  return u ? { u, pinned: false } : null
}

export function unitBar(ctx: Ctx, el: HTMLElement): { update(c: S.Campaign): void; escape(): boolean; dispose(): void } {
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
    if (ctx.run({ t: 'assign', id, unit }).ok) ctx.announce(`${what}: ${unit < 0 ? 'any crew can take it' : `${who} takes it`}.`)
  }

  function update(c: S.Campaign): void {
    const s0 = c.season!
    const waits = S.jobWaits(app.world, c)
    const jobs = s0.jobs
    const crews = S.crewInfo(c)
    const many = crews.length > 1
    const layout = ctx.layout()
    const touch = ctx.touch()
    const head = jobs.find(j => !waits[j.id]) ?? null
    // How many orders the strip has room for before the rest fold behind a count.
    const item = many ? 58 : 46
    const room = layout === 'narrow' ? Math.max(2, Math.floor((innerWidth - 16 - (many ? 64 : 148) - 56) / item)) : layout === 'short' ? 3 : Math.floor(284 / (item + 4))
    const all = expanded || jobs.length <= room
    const list = all ? jobs : jobs.slice(0, room - 1)
    const now = crews.map(u => doing(c, u, waits, crews))
    const model = {
      j: jobs.map(j => [j.id, j.kind, j.field, j.unit, Math.round(j.done / j.need * 20), waits[j.id]]),
      u: crews.map((u, k) => [u.id, u.name, now[k].text, now[k].place, Math.round(now[k].progress * 20)]),
      pick: app.unit, expanded, pop, popWho, layout, room, touch, h: c.fields.map(f => f.tenure),
    }
    el.classList.toggle('busy', jobs.length > 0)
    el.classList.toggle('many', many)
    patch(el, JSON.stringify(model), () => [
      h('div', { class: `units${many ? ' many' : ''}`, role: 'group', 'aria-label': 'Crews' },
        crews.map((u, k) => {
          const d = now[k]
          const on = app.unit === u.id
          const said = `${u.name === S.FARMER_NAME ? 'You, the farmer' : `${u.name}, ${KIND_NAME[u.kind].toLowerCase()}`}: ${d.text}.${many ? on ? ' Picked: orders go to this crew. Press again to let any crew take them.' : ' Press to give this crew the next orders.' : ''}`
          // With one crew there is nothing to pick: the chip only says what it is doing.
          return h(many ? 'button' : 'div', {
            class: `unit${on ? ' on' : ''}`, type: many ? 'button' : null, testid: `unit-${u.id}`, 'aria-pressed': many ? String(on) : null, 'aria-label': many ? said : null,
            title: touch ? undefined : said, onclick: many ? () => app.selectUnit(on ? -1 : u.id) : null,
          },
          icon(KIND_GLYPH[u.kind], 'ic s unit-kind'),
          h('span', { class: 'unit-name' }, u.name),
          h('span', { class: 'unit-doing' }, icon(d.glyph, 'ic s'), h('span', { class: 'unit-text' }, many ? placeName(d.place) : d.text), many ? where(c, d.place) : null),
          d.progress > 0 ? gauge(d.progress, { label: d.text, text: `${F.pct(d.progress)} done` }) : null)
        }),
        h('button', { class: 'nicon s crew-open', type: 'button', testid: 'crew-open', 'aria-label': 'The crew: hire or let go', title: touch ? undefined : 'Hire or let go', onclick: () => openCrew(ctx) }, icon('crew'))),
      jobs.length ? h('ol', { class: `queue${expanded ? ' all' : ''}`, 'aria-label': 'Orders, in the order the crews take them' }, list.map((j, k) => {
        const what = `${JOB_DOING[j.kind]} ${S.FIELD_NAMES[j.field]}`
        const lockDig = j.kind === 'dig' && j.done > 0
        const who = holder(crews, j)
        const able = crews.filter(u => S.canDo(u.kind, j.kind))
        const whoSaid = who ? `${who.pinned ? 'given to' : 'taken by'} ${who.u.name === S.FARMER_NAME ? 'you' : who.u.name}` : 'for any crew'
        const choices = many && able.length > 1 ? h('div', { class: 'q-who', role: 'group', 'aria-label': `Who does ${what.toLowerCase()}` },
          [{ id: -1, name: 'Any', kind: null as S.UnitKind | null }, ...able.map(u => ({ id: u.id, name: u.name, kind: u.kind as S.UnitKind | null }))].map(x => h('button', {
            class: 'nbtn s', type: 'button', testid: `assign-${j.id}-${x.id}`, 'aria-pressed': String(j.unit === x.id),
            onclick: () => assign(j.id, x.id, what, x.name),
          }, x.kind ? icon(KIND_GLYPH[x.kind], 'ic s') : null, x.name))) : null
        return h('li', { class: 'q-item', k: `q-${j.id}` },
          h('button', {
            class: `q${j === head ? ' active' : ''}${waits[j.id] ? ' waiting' : ''}`, type: 'button', testid: `queue-${j.id}`, 'aria-expanded': touch ? String(pop === j.id) : null,
            title: touch ? undefined : `${what}, ${whoSaid}${waits[j.id] ? ` (waiting: ${waits[j.id]})` : ''}. Click to cancel${k > 0 ? ', Ctrl-click to do it first' : ''}`,
            onclick: (e: Event) => {
              const m = e as MouseEvent
              if (m.ctrlKey || m.metaKey) bump(j.id)
              else if (touch) { pop = pop === j.id ? -1 : j.id; popWho = false; ctx.dirty() }
              else cancel(j.id)
            },
            oncontextmenu: (e: Event) => { e.preventDefault(); bump(j.id) },
            onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse') app.setHover(j.field) },
            onpointerleave: () => { if (app.hover === j.field) app.setHover(-1) },
          }, icon(j.kind), where(c, j.field),
          many && who ? h('span', { class: `q-tag${who.pinned ? ' pinned' : ''}`, 'aria-hidden': 'true' }, initial(who.u.name)) : null,
          h('span', { class: 'sr' }, `${what}, ${whoSaid}${waits[j.id] ? `, waiting: ${waits[j.id]}` : j.done > 0 ? `, ${F.pct(j.done / j.need)} done` : ''}. ${touch ? 'Tap for its choices.' : `Click to cancel${k > 0 ? '; Ctrl-click to do it first' : ''}.`}`)),
          !touch ? h('span', { class: 'q-tools' },
            k > 0 ? h('button', { class: 'q-first', type: 'button', testid: `queue-first-${j.id}`, 'aria-label': `${what}: do it first`, title: 'Do it first', onclick: () => bump(j.id) }, icon('first', 'ic s')) : null,
            choices ? h('button', {
              class: 'q-first', type: 'button', testid: `queue-who-${j.id}`, 'aria-label': `${what}: choose who does it`, 'aria-expanded': String(pop === j.id), title: 'Who does it',
              onclick: () => { pop = pop === j.id ? -1 : j.id; popWho = true; ctx.dirty() },
            }, icon('crew', 'ic s')) : null) : null,
          pop === j.id ? h('div', { class: 'q-pop', role: 'group', 'aria-label': what },
            h('span', { class: 'q-pop-title' }, what),
            !popWho && k > 0 ? h('button', { class: 'nbtn', type: 'button', testid: `queue-first-${j.id}`, onclick: () => bump(j.id) }, icon('first', 'ic s'), 'First') : null,
            !popWho ? h('button', { class: 'nbtn', type: 'button', testid: `queue-cancel-${j.id}`, disabled: lockDig, onclick: () => cancel(j.id) }, icon('close', 'ic s'), 'Cancel') : null,
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

// ---------------------------------------------------------------- hiring and letting go

export function openCrew(ctx: Ctx): void {
  const app = ctx.app
  if (!app.campaign) return
  ctx.papers.open({
    title: 'The crew',
    testid: 'crew',
    size: 'medium',
    body: () => {
      const box = h('div', { class: 'crew-paper' })
      const draw = () => {
        const c = app.campaign
        if (!c) return
        const crews = S.crewInfo(c)
        const season = c.phase === 'season'
        const hire = (kind: 'hand' | 'operator') => {
          const why = S.hireBlock(c, kind)
          const wage = kind === 'hand' ? S.HAND_WAGE : S.OPERATOR_WAGE
          return h('li', { class: 'crew-row' },
            icon(KIND_GLYPH[kind], 'ic l'),
            h('div', null,
              h('h4', { class: 't-head' }, KIND_NAME[kind], h('span', { class: 'sub num' }, ` ${F.money(wage)} a month`)),
              h('p', null, kindDoes(kind)),
              kind === 'operator' ? h('p', { class: 'sub' }, `Drives the second tractor, so the machine jobs can go on in two fields at once. Without a second tractor there is nothing for an operator to drive${c.upgrades.tractor2 ? '' : ': it is bought in spring, under Equipment'}.`) : null,
              why ? h('p', { class: 'sub warn-text' }, why) : null),
            why ? null : h('button', {
              class: 'btn', type: 'button', testid: `hire-${kind}`,
              onclick: () => { const r = ctx.run({ t: 'hire', kind }); if (r.ok) { ctx.announce(F.localize(r.events[0]?.text ?? 'Hired.')); draw() } },
            }, `Hire, ${F.money(wage)}`))
        }
        box.replaceChildren(
          h('p', { class: 't-lede' }, 'You can do every job. Hired crews work the list beside you, each taking the nearest order it can do, and every drive between fields costs part of a day.'),
          h('h3', { class: 'block-head' }, 'On the farm'),
          h('ul', { class: 'crew-list' }, crews.map(u => h('li', { class: 'crew-row' },
            icon(KIND_GLYPH[u.kind], 'ic l'),
            h('div', null,
              h('h4', { class: 't-head' }, u.name === S.FARMER_NAME ? 'You' : u.name, h('span', { class: 'sub' }, ` ${KIND_NAME[u.kind].toLowerCase()}${u.wage ? `, ${F.money(u.wage)} a month` : ''}`)),
              h('p', null, kindDoes(u.kind))),
            u.kind === 'farmer' ? null : h('button', {
              class: 'btn', type: 'button', testid: `dismiss-${u.id}`,
              onclick: () => { const r = ctx.run({ t: 'dismiss', unit: u.id }); if (r.ok) { if (app.unit === u.id) app.selectUnit(-1); ctx.announce(F.localize(r.events[0]?.text ?? 'Let go.')); draw() } },
            }, 'Let go')))),
          h('h3', { class: 'block-head' }, 'Hire'),
          h('ul', { class: 'crew-list' }, hire('hand'), hire('operator')),
          h('p', { class: 'sub' }, season
            ? 'Hired now, the first month is paid at once, then a month at a time until the season closes. Letting a crew go saves the months after; the month already paid is not given back.'
            : 'Hired in spring, the first month is paid with the plan when the season begins, then a month at a time until it closes. Crews stay on from year to year until let go.'),
        )
      }
      draw()
      return box
    },
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'crew-close', autofocus: true, onclick: close }, 'Back'),
  })
}
