// The yard's command bar (design/yard.html): what stands there, what is going up and who is on it, and what can be
// raised, each building an order numbered with its key, its cost in dollars, logs, stone and crew-days, then its catch.
import * as S from '../sim/index.ts'
import { EXIT_MS, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { ringFor } from './crew.ts'
import { BUILD_GLYPH, firstName } from './rules.ts'
import { meter, order } from './system/parts.ts'
import { ringed } from './system/people.ts'

export const YARD_TITLE: Record<number, string> = { [S.HOME_YARD]: 'The home yard', [S.DUFOUR_YARD]: 'The Dufour yard' }

export interface YardCard {
  el: HTMLElement
  update(c: S.Campaign, suggest?: S.BuildingKind | null): void
  // Orders the building numbered n on the bar (the keys 1 to 9). False when the bar is not up or there is no such one.
  pick(n: number): boolean
}

function loads(n: number): string {
  const r = Math.round(n * 10) / 10
  return `${F.num(r, r % 1 ? 1 : 0)}`
}

export function yardCard(ctx: Ctx): YardCard {
  const app = ctx.app
  const el = h('section', { class: 'command sheet sys yard-card compact', testid: 'yard-card', 'aria-label': 'Yard', hidden: true })
  let shownFor = 0
  let flashed: { kind: S.BuildingKind | null; text: string; until: number } | null = null
  let can: S.BuildingInfo[] = []

  function build(b: S.BuildingInfo): void {
    if (!b.ok) { flashed = { kind: b.kind, text: F.localize(b.why), until: performance.now() + 5000 }; ctx.announce(flashed.text); setTimeout(() => ctx.dirty(), 5100); ctx.dirty(); return }
    const r = app.do({ t: 'build', kind: b.kind, yard: b.yard })
    if (!r.ok) { flashed = { kind: b.kind, text: F.localize(r.err), until: performance.now() + 5000 }; ctx.announce(flashed.text); setTimeout(() => ctx.dirty(), 5100); ctx.dirty(); return }
    flashed = null
    ctx.announce(F.localize(r.events[0]?.text ?? `${b.name} started.`))
  }

  // Who is on a building now: the people holding its order.
  function builders(c: S.Campaign, kind: S.BuildingKind, yard: number): S.Unit[] {
    const b = S.buildingAt(c, kind, yard)
    const job = b ? c.season?.jobs.find(j => j.kind === 'build' && j.building === b.id) : undefined
    return job ? c.crew.filter(u => u.job === job.id) : []
  }

  // A building's cost as its order prints it: dollars, then what the yard must find, then the days of work.
  function costOf(b: S.BuildingInfo): string {
    return [F.money(b.cash), b.logs ? `${b.logs} logs` : '', b.stone ? `${b.stone} stone` : '', `${b.days} ${b.days === 1 ? 'crew-day' : 'crew-days'}`].filter(Boolean).join(' · ')
  }

  function body(c: S.Campaign, yard: number, suggest: S.BuildingKind | null): Child {
    const all = S.buildingInfo(c).filter(b => b.yard === yard)
    const up = all.filter(b => b.state === 'building')
    can = all.filter(b => b.state === 'none')
    const m = S.materialsInfo(c)
    const houses = S.storageInfo(c).houses.filter(x => x.at === yard)
    const built = all.filter(b => b.state === 'built' && b.kind !== 'house')
    const pond = S.pondInfo(app.world, c)
    const stand = S.standInfo(c)
    const extra = (b: S.BuildingInfo) => b.kind === 'pond' && pond.built ? `${F.num(Math.floor(pond.waterings))} of ${pond.capacity} waterings` : b.kind === 'stand' && stand.built ? `${stand.open ? 'open' : 'shut'}, ${F.money(stand.sales)} this year` : ''
    const best = suggest && can.some(b => b.kind === suggest && b.ok) ? suggest : null
    const keys = !ctx.touch()
    const flash = flashed && performance.now() < flashed.until ? flashed : null
    return [
      h('header', { class: 'command-head' },
        h('div', null,
          h('p', { class: 't-label num' }, `${yard === S.HOME_YARD ? 'The home farm' : 'The Dufour place'} · ${loads(m.logs)} logs, ${loads(m.stone)} stone in the yard`),
          h('h2', { class: 't-title', testid: 'yard-title' }, YARD_TITLE[yard])),
        h('button', { class: 'close', type: 'button', testid: 'yard-close', 'aria-label': `Close${keys ? ' (Escape)' : ''}`, onclick: () => app.selectYard(0) }, icon('close', 'i'))),
      h('div', { class: 'builds', role: 'list', 'aria-label': 'Standing and going up' },
        houses.map(x => h('div', { class: 'build-row', role: 'listitem' }, icon('store', 'i'), h('span', null, h('span', { class: 't-label' }, 'Standing'), ' ', h('b', null, F.upper(x.name.replace(/^Home /, ''))), ' ', h('span', { class: 'quiet num' }, `holds ${F.mass(x.cwt)}`)), h('span'))),
        built.map(b => h('div', { class: 'build-row', role: 'listitem', testid: `built-${b.kind}` }, icon(BUILD_GLYPH[b.kind], 'i'), h('span', null, h('span', { class: 't-label' }, 'Standing'), ' ', h('b', null, b.name), extra(b) ? [' ', h('span', { class: 'quiet' }, extra(b))] : null), h('span'))),
        up.map(b => {
          const who = builders(c, b.kind, yard)
          return h('div', { class: 'build-row', role: 'listitem', testid: `going-${b.kind}` },
            icon('build', 'i'),
            h('span', null, h('span', { class: 't-label' }, 'Going up'), ' ', h('b', null, b.name), ' ', h('span', { class: 'quiet num' }, `${F.pct(b.progress)} · ${F.num(Math.ceil(b.daysLeft))} crew-days`)),
            h('span', { class: 'who' }, who.length ? who.slice(0, 3).map(u => [ringed(u, ringFor(c, u.id), 24), h('span', null, firstName(u.name))])
              : h('span', { class: 'quiet it' }, c.phase === 'season' ? 'waiting for a builder' : 'built in the season or over the winter')),
            meter(b.progress, { label: `${b.name} built`, text: `${F.pct(b.progress)} built` }))
        }),
        !houses.length && !built.length && !up.length ? h('div', { class: 'build-row', role: 'listitem' }, h('span', { class: 'quiet it' }, 'Nothing stands here yet.')) : null),
      m.logs >= 1 && !m.sellWhy ? h('div', { class: 'orders sell-logs', role: 'group', 'aria-label': 'Logs' },
        order({
          key: '', icon: 'logs', name: `Sell ${F.plural(Math.floor(m.logs), 'load')} of logs`, cost: F.money(Math.floor(m.logs) * m.logPrice), testid: 'yard-sell-logs',
          catch: `The mill pays ${F.money(m.logPrice)} a load; a building short of logs buys them back at ${F.money(m.millPrice)}.`,
          onclick: () => { const r = ctx.run({ t: 'sellLogs', loads: Math.floor(m.logs) }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) },
        })) : null,
      can.length ? h('div', { class: 'orders', role: 'group', 'aria-label': 'Raise a building' },
        can.map((b, k) => order({
          key: keys && k < 9 ? String(k + 1) : '', icon: '', name: b.name, cost: costOf(b), suggested: b.kind === best, testid: `build-${b.kind}`,
          catch: flash?.kind === b.kind ? flash.text : !b.ok ? F.localize(b.why) : `Catch: ${b.catch.replace(/^./, x => x.toLowerCase())}`,
          refused: flash?.kind === b.kind || !b.ok,
          title: keys ? b.does : undefined,
          said: `${b.does} ${F.money(b.total)} in all${b.buyLogs > 0 || b.buyStone > 0 ? `, with ${[b.buyLogs > 0 ? `${loads(b.buyLogs)} logs` : '', b.buyStone > 0 ? `${loads(b.buyStone)} stone` : ''].filter(Boolean).join(' and ')} bought in` : ''}.`,
          onclick: () => build(b),
        }))) : h('p', { class: 'note' }, 'Every building this yard can hold stands here.'),
    ]
  }

  function update(c: S.Campaign, suggest: S.BuildingKind | null = null): void {
    const yard = app.yard
    if (yard === 0) {
      if (!el.hidden && !ctx.reduced()) {
        el.classList.add('out')
        setTimeout(() => { if (!el.classList.contains('out')) return; el.hidden = true; el.classList.remove('out') }, EXIT_MS)
      } else el.hidden = true
      shownFor = 0
      can = []
      return
    }
    const was = el.hidden || el.classList.contains('out')
    el.classList.remove('out')
    el.hidden = false
    if (shownFor !== yard) { shownFor = yard; flashed = null }
    const s0 = c.season
    const model = {
      yard, cash: Math.round(c.cash), logs: Math.round(c.logs * 10), stone: Math.round(c.stone * 10), t: ctx.touch(), u: app.settings.units, suggest,
      b: c.buildings.map(b => [b.id, b.kind, b.yard, Math.round(b.done * 10), b.built]), pond: Math.round(c.pond * 10), stand: Math.round(c.yearStand),
      j: s0?.jobs.filter(j => j.kind === 'build').map(j => j.id), crew: c.crew.map(u => [u.id, u.job]), phase: c.phase,
      flash: flashed && performance.now() < flashed.until ? flashed.text : '',
    }
    patch(el, JSON.stringify(model), () => body(c, yard, suggest))
    el.setAttribute('aria-label', YARD_TITLE[yard])
    if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
  }

  function pick(n: number): boolean {
    if (el.hidden || !can[n - 1]) return false
    build(can[n - 1])
    return true
  }

  return { el, update, pick }
}
