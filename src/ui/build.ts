// The yard's card: what stands there, what is going up and who is on it, and what can be built, with what each costs
// against what the farm has.
import * as S from '../sim/index.ts'
import { EXIT_MS, gauge, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { portrait } from './people.ts'
import { BUILD_GLYPH, firstName } from './rules.ts'

export const YARD_TITLE: Record<number, string> = { [S.HOME_YARD]: 'The home yard', [S.DUFOUR_YARD]: 'The Dufour yard' }

export interface YardCard {
  el: HTMLElement
  update(c: S.Campaign): void
}

function loads(n: number): string {
  const r = Math.round(n * 10) / 10
  return `${F.num(r, r % 1 ? 1 : 0)}`
}

export function yardCard(ctx: Ctx): YardCard {
  const app = ctx.app
  const el = h('section', { class: 'card yard-card instrument', testid: 'yard-card', 'aria-label': 'Yard', hidden: true })
  let chosen: S.BuildingKind | null = null
  let shownFor = 0
  let flashed: { text: string; until: number } | null = null

  function order(b: S.BuildingInfo): void {
    const r = app.do({ t: 'build', kind: b.kind, yard: b.yard })
    if (!r.ok) { flashed = { text: F.localize(r.err), until: performance.now() + 5000 }; ctx.announce(flashed.text); setTimeout(() => ctx.dirty(), 5100); ctx.dirty(); return }
    flashed = null
    chosen = null
    ctx.announce(F.localize(r.events[0]?.text ?? `${b.name} started.`))
  }

  // Who is on a building now: the people holding its order.
  function builders(c: S.Campaign, kind: S.BuildingKind, yard: number): S.Unit[] {
    const b = S.buildingAt(c, kind, yard)
    const job = b ? c.season?.jobs.find(j => j.kind === 'build' && j.building === b.id) : undefined
    return job ? c.crew.filter(u => u.job === job.id) : []
  }

  function body(c: S.Campaign, yard: number): Child {
    const all = S.buildingInfo(c).filter(b => b.yard === yard)
    const up = all.filter(b => b.state === 'building')
    const can = all.filter(b => b.state === 'none')
    const m = S.materialsInfo(c)
    const houses = S.storageInfo(c).houses.filter(x => x.at === yard)
    const built = all.filter(b => b.state === 'built' && b.kind !== 'house')
    const pond = S.pondInfo(app.world, c)
    const stand = S.standInfo(c)
    if (!chosen || !can.some(b => b.kind === chosen)) chosen = (can.find(b => b.ok) ?? can[0])?.kind ?? null
    const pick = can.find(b => b.kind === chosen) ?? null
    const extra = (b: S.BuildingInfo) => b.kind === 'pond' && pond.built ? `${F.num(Math.floor(pond.waterings))} of ${pond.capacity} waterings` : b.kind === 'stand' && stand.built ? `${stand.open ? 'open' : 'shut'}, ${F.money(stand.sales)} this year` : ''
    return [
      h('header', { class: 'card-head' },
        h('div', null,
          h('h2', { class: 't-head', testid: 'yard-title' }, YARD_TITLE[yard]),
          h('p', { class: 'card-sub num' }, `Logs ${loads(m.logs)} · stone ${loads(m.stone)} · cash ${F.money(c.cash)}`)),
        h('button', { class: 'nicon', type: 'button', testid: 'yard-close', 'aria-label': `Close${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.selectYard(0) }, icon('close'))),
      h('div', { class: 'yard-stands', role: 'list', 'aria-label': 'Standing here' },
        houses.map(x => h('span', { class: 'stand-chip', role: 'listitem' }, icon('house', 'ic s'), `${x.name.replace(/^Home /, '')}, ${F.mass(x.cwt)}`)),
        built.map(b => h('span', { class: 'stand-chip', role: 'listitem', testid: `built-${b.kind}` }, icon(BUILD_GLYPH[b.kind], 'ic s'), b.name, extra(b) ? h('span', { class: 'sub' }, ` ${extra(b)}`) : null))),
      up.map(b => {
        const who = builders(c, b.kind, yard)
        return h('div', { class: 'going-up', testid: `going-${b.kind}` },
          icon(BUILD_GLYPH[b.kind], 'ic s'),
          h('span', { class: 'gu-name' }, b.name),
          gauge(b.progress, { label: `${b.name} built`, text: `${F.pct(b.progress)} built` }),
          h('span', { class: 'gu-left num' }, `${F.num(Math.ceil(b.daysLeft))} crew-days left`),
          h('span', { class: 'gu-who' }, who.length ? who.map(u => h('span', { class: 'gu-p', title: u.name }, portrait(u.id, 'portrait s'), h('span', { class: 'sr' }, firstName(u.name))))
            : h('span', { class: 'sub' }, c.phase === 'season' ? 'waiting for a builder' : 'built in the season or over the winter')))
      }),
      can.length ? h('div', { class: 'build-pick', role: 'group', 'aria-label': 'What can be built here' },
        can.map(b => h('button', {
          class: `bp${b.ok ? '' : ' short'}`, type: 'button', testid: `build-pick-${b.kind}`, 'aria-pressed': String(b.kind === chosen),
          onclick: () => { chosen = b.kind; ctx.dirty() },
        }, icon(BUILD_GLYPH[b.kind], 'ic s'), h('span', { class: 'bp-name' }, b.name), h('span', { class: 'bp-cost num' }, F.moneyShort(b.total))))) : null,
      pick ? h('div', { class: 'build-detail', testid: 'build-detail' },
        h('p', { class: 'bd-does' }, pick.does),
        h('p', { class: 'bd-catch' }, h('strong', null, 'Catch: '), pick.catch),
        h('p', { class: 'bd-cost num' },
          h('span', null, `${F.money(pick.cash)} cash`),
          pick.logs ? h('span', { class: pick.buyLogs > 0 ? 'short' : '' }, `${pick.logs} logs${pick.buyLogs > 0 ? `, ${loads(pick.buyLogs)} bought at ${F.money(m.millPrice)}` : ''}`) : null,
          pick.stone ? h('span', { class: pick.buyStone > 0 ? 'short' : '' }, `${pick.stone} stone${pick.buyStone > 0 ? `, ${loads(pick.buyStone)} bought at ${F.money(m.quarryPrice)}` : ''}`) : null,
          h('span', null, `${pick.days} crew-days of building`)),
        flashed && performance.now() < flashed.until ? h('p', { class: 'card-line flash lv-warn', role: 'status' }, flashed.text) : null,
        pick.ok ? h('div', { class: 'orders' }, h('button', { class: 'order wide suggested', type: 'button', testid: `build-${pick.kind}`, onclick: () => order(pick) },
          icon('build'), h('span', { class: 'order-name' }, `Build the ${pick.name.toLowerCase()}`), h('span', { class: 'order-meta num' }, `${F.money(pick.total)} in all`)))
          : h('p', { class: 'card-line', testid: 'build-why' }, F.localize(pick.why))) : null,
      !can.length && !up.length ? h('p', { class: 'card-line' }, 'Every building this yard can hold stands here.') : null,
    ]
  }

  function update(c: S.Campaign): void {
    const yard = app.yard
    if (yard === 0) {
      if (!el.hidden && !ctx.reduced()) {
        el.classList.add('out')
        setTimeout(() => { if (!el.classList.contains('out')) return; el.hidden = true; el.classList.remove('out') }, EXIT_MS)
      } else el.hidden = true
      shownFor = 0
      return
    }
    const was = el.hidden || el.classList.contains('out')
    el.classList.remove('out')
    el.hidden = false
    if (shownFor !== yard) { shownFor = yard; chosen = null; flashed = null }
    const s0 = c.season
    const model = {
      yard, chosen, cash: Math.round(c.cash), logs: Math.round(c.logs * 10), stone: Math.round(c.stone * 10), t: ctx.touch(), u: app.settings.units,
      b: c.buildings.map(b => [b.id, b.kind, b.yard, Math.round(b.done * 10), b.built]), pond: Math.round(c.pond * 10), stand: Math.round(c.yearStand),
      j: s0?.jobs.filter(j => j.kind === 'build').map(j => j.id), crew: c.crew.map(u => [u.id, u.job]), phase: c.phase,
      flash: flashed && performance.now() < flashed.until ? flashed.text : '',
    }
    patch(el, JSON.stringify(model), () => body(c, yard))
    el.setAttribute('aria-label', YARD_TITLE[yard])
    if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
  }

  return { el, update }
}
