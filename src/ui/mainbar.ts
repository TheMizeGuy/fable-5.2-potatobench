// The menu that is always up: one row of tabs at the foot of the season screen, each opening its own sheet, in the
// manner of a colony game's main bar. "To do" says what waits on the player and goes there; Fields and People list
// the farm, and a row pressed takes the camera to it.
import { nextGoal, waitingFor } from '../game/goals.ts'
import * as S from '../sim/index.ts'
import { openContracts } from './contracts.ts'
import type { Ctx } from './core.ts'
import { openCrew, ringFor } from './crew.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import './mainbar.css'
import { heldFields, isTract } from './map.ts'
import { personNow } from './now.ts'
import { ringed } from './system/people.ts'

// order: the one press that deals with it, where there is one, with what it costs.
export interface Todo { field: number; glyph: string; text: string; why: string; urgent: boolean; go: () => void; order?: { label: string; cost: number; run: () => void } }

interface Hooks {
  todo: () => Todo[]
  goField: (i: number) => void
  goUnit: (id: number) => void
  onWork: () => void
  onMoney: () => void
  onAlmanac: () => void
  onMenu: () => void
}

export function mainBar(ctx: Ctx, o: Hooks): { el: HTMLElement; update(c: S.Campaign): void; openTodo(): void } {
  const app = ctx.app
  const el = h('nav', { class: 'mainbar sys', 'aria-label': 'The farm\'s menu' })
  let key = ''

  function openTodo(): void {
    ctx.papers.open({
      title: 'To do',
      testid: 'todo',
      size: 'medium',
      kicker: 'What waits on you',
      body: close => {
        const c = app.campaign
        if (!c) return null
        const list = o.todo()
        const orders = list.filter(t => t.order)
        const all = orders.reduce((n, t) => n + t.order!.cost, 0)
        const goal = nextGoal(c)
        const wait = c.phase === 'season' ? waitingFor(c) : null
        return h('div', { class: 'mb-sheet' },
          list.length
            ? h('ul', { class: 'mb-list' }, list.map((t, k) => h('li', null,
              h('div', { class: `mb-row${t.urgent ? ' urgent' : ''}` },
                icon(t.glyph, 'i'), h('span', { class: 'mb-what' }, h('b', null, t.text), h('span', { class: 't-caption' }, t.why)),
                h('span', { class: 'mb-keys' },
                  h('button', { class: 'btn quiet', type: 'button', testid: `todo-go-${k}`, onclick: () => { close(); t.go() } }, 'Go there'),
                  t.order ? h('button', { class: 'btn', type: 'button', testid: `todo-do-${k}`, onclick: () => { close(); t.order!.run() } }, t.order.label, h('span', { class: 'num mb-cost' }, F.money(t.order.cost))) : null))))
            // Several at once: one press orders them all, and says what that comes to.
            .concat(orders.length > 1 ? [h('li', { class: 'mb-all' }, h('button', { class: 'btn go', type: 'button', testid: 'todo-all', onclick: () => { close(); for (const t of orders) t.order!.run() } },
              `Order all ${orders.length}`, h('span', { class: 'num mb-cost' }, F.money(all))))] : []))
            : h('p', { class: 'mb-none' }, 'Nothing is waiting on you. Your crew is working through the work list.'),
          wait ? h('p', { class: 'mb-next' }, h('span', { class: 't-label' }, 'Coming up'), ' ', wait.title, wait.when ? `, ${wait.when}` : '', '.') : null,
          goal ? h('p', { class: 'mb-next' }, h('span', { class: 't-label' }, 'Next goal'), ' ', goal.title, '. ', h('span', { class: 't-caption' }, goal.why)) : null)
      },
    })
  }

  function openFields(): void {
    ctx.papers.open({
      title: 'Fields',
      testid: 'fields',
      size: 'wide',
      kicker: 'Your land',
      body: close => {
        const c = app.campaign
        if (!c) return null
        const needs = c.phase === 'season' ? app.needs() : []
        const pct = (v: number) => F.pct(v)
        return h('table', { class: 'mb-table' },
          h('thead', null, h('tr', null, ['Field', 'Growing', 'Stage', 'Leaf', 'Water', 'Protection', 'Needs'].map(t => h('th', { scope: 'col', class: 't-label' }, t)))),
          h('tbody', null, heldFields(c).map(i => {
            const f = S.fieldInfo(c, i)
            const live = f.status === 'growing' || f.status === 'planted'
            const tract = isTract(i) && (f.cover !== 'open' || f.status === 'off')
            const need = needs[i]?.need
            return h('tr', null,
              h('th', { scope: 'row' }, h('button', { class: 'mb-name', type: 'button', testid: `fields-go-${i}`, onclick: () => { close(); o.goField(i) } }, f.name)),
              h('td', null, tract ? f.coverWord : f.crop === 'rest' || f.status === 'rest' ? 'Oats and clover' : f.variety),
              h('td', null, tract ? '' : f.status === 'rest' ? 'Resting' : f.stage),
              h('td', { class: 'num' }, live ? pct(f.canopy) : ''),
              h('td', null, live ? f.moistureLabel : ''),
              h('td', { class: 'num' }, f.status === 'growing' ? pct(f.protect) : ''),
              h('td', null, need && need.act !== 'wait' ? F.localize(need.text) : ''))
          })))
      },
    })
  }

  function openPeople(): void {
    ctx.papers.open({
      title: 'People',
      testid: 'people',
      size: 'medium',
      kicker: 'Who is on the farm',
      body: close => {
        const c = app.campaign
        if (!c) return null
        const waits = c.phase === 'season' ? S.jobWaits(app.world, c) : {}
        return h('ul', { class: 'mb-list' }, c.crew.map(u => {
          const now = c.phase === 'season' ? personNow(c, u.id, waits) : null
          return h('li', null, h('button', { class: 'mb-row', type: 'button', testid: `people-go-${u.id}`, onclick: () => { close(); o.goUnit(u.id) } },
            ringed({ name: u.name }, ringFor(c, u.id), 34),
            h('span', { class: 'mb-what' }, h('b', null, u.kind === 'farmer' ? 'You' : u.name), h('span', { class: 't-caption' }, now ? now.line : u.kind === 'farmer' ? 'The farmer' : 'On the farm')),
            h('span', { class: 'mb-go t-label' }, 'Go there')))
        }))
      },
      foot: close => [
        h('button', { class: 'btn', type: 'button', testid: 'people-work', onclick: () => { close(); o.onWork() } }, 'Who does what'),
        h('button', { class: 'btn', type: 'button', testid: 'people-hire', onclick: () => { close(); openCrew(ctx) } }, 'Hiring'),
      ],
    })
  }

  const TABS: [string, string, () => void][] = [
    ['todo', 'To do', openTodo],
    ['fields', 'Fields', openFields],
    ['people', 'People', openPeople],
    ['work', 'Work', () => o.onWork()],
    ['money', 'Money', () => o.onMoney()],
    ['contracts', 'Contracts', () => openContracts(ctx)],
    ['almanac', 'Almanac', () => o.onAlmanac()],
    ['menu', 'Menu', () => o.onMenu()],
  ]

  return {
    el,
    openTodo,
    update(c: S.Campaign): void {
      const n = c.phase === 'season' ? o.todo().length : 0
      const k = `${c.phase}|${n}`
      if (k === key) return
      key = k
      el.replaceChildren(...TABS.map(([id, name, open]) => h('button', { class: `mb-tab${id === 'todo' && n ? ' has' : ''}`, type: 'button', testid: `bar-${id}`, onclick: open },
        name, id === 'todo' && n ? h('span', { class: 'mb-n num', 'aria-label': `${n} waiting` }, String(n)) : null)))
    },
  }
}
