// The build menu: everything money and work can add to the farm, in one sheet that is always a press away (the
// owner, 14 November: "the freedom like whats building etc how do you get upgrades"; think of RimWorld's Architect
// and the toolbar of Cities: Skylines). Buildings the crew puts up, machines, people, and land to clear: each with
// what it changes, what it costs, and either the one press that gets it or the plain reason it cannot be had yet.
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { openCrew } from './crew.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BUILD_GLYPH } from './rules.ts'
import { equipNeeds } from './spring.ts'
import './buildmenu.css'

type State = 'can' | 'no' | 'have' | 'doing'
// cost: what it takes from the year-end forecast, where that is a plain sum. tag: a word of advice beside its name.
// gist: what it changes, in a few words, beside its name (two viewers of the menu: "give each building one short
// effect line"); the sentence under it says the rest.
interface Item { id: string; glyph: string; name: string; gist?: string; does: string; price: string; cost?: number; tag?: string; sub?: string; state: State; why: string; label: string; run?: () => void }

// The trade's words, said plainly where a newcomer meets them first (two viewers who knew nothing of potatoes: "cwt",
// "intervale field", "No. 1", "B size").
const plain = (t: string): string => t.replace(/\bcwt\b/g, 'hundredweight').replace(/a home or intervale field/, 'a field near the pond').replace('Packed No. 1 sells for 15% more, and packed B size sells for three quarters of the No. 1 price.', 'Packed potatoes sell for 15% more, and the small ones sell too.')
// (each from the catalogue's own figures: src/sim/params.ts, BUILDINGS and UPGRADES)
const BUILD_GIST: Record<S.BuildingKind, string> = {
  house: '+3,600 hundredweight of storage', shed: 'Machine work 15% faster', bunk: '+6 beds for hired people', packing: '+15% sale price in winter',
  pond: 'Stores six waterings', stand: 'Sells at twice the market price', station: 'Better forecasts', road: 'Travel and hauling 30% faster',
}
// When a building is worth its price, from what it does in the game (src/sim/params.ts, BUILDINGS; two hired people
// can live out, HOUSED_OUT; the home cellar holds CELLAR_CWT). No sum of money is put on one the game has no sum for.
const BUILD_WHEN: Record<S.BuildingKind, string> = {
  house: 'Worth it when you grow more than your cellar holds',
  shed: 'Worth it before a second tractor, which needs it',
  bunk: 'Worth it when you want a third hired person',
  packing: 'Worth it if you store the crop and sell in winter',
  pond: 'Worth it in a dry summer',
  stand: 'Worth it every year from the first harvest',
  station: 'Worth it if you order the spraying yourself',
  road: 'Worth it with fields far from the yard',
}
const UPGRADE_GIST: Record<S.UpgradeId, string> = {
  boom: 'Spraying 2.5\u00d7 faster', harvester: 'Digging 1.6\u00d7 faster', vent: 'More storage, less rot', reel: 'Watering 2\u00d7 faster',
  tractor2: 'Two machines at work at once', house2: 'Double the storage, built at once', tractor3: 'Three machines at work at once', truck: 'Hauling 2\u00d7 faster',
}
const UPGRADE_GLYPH: Record<S.UpgradeId, string> = { boom: 'spray', harvester: 'dig', vent: 'store', reel: 'water', tractor2: 'machine', house2: 'store', tractor3: 'machine', truck: 'haul' }
// What a machine's purchase waits on, said as the thing to do first.
const first = (why: string): string => /Dufour place/i.test(why) ? 'Needs a Dufour field first' : /machine shed/i.test(why) ? 'Needs the machine shed' : /second tractor first/i.test(why) ? 'Needs the second tractor' : /can't afford|costs \$|You need \$/i.test(why) ? 'Not enough money yet' : why.replace(/\.$/, '')

function items(ctx: Ctx, c: S.Campaign, done: (text: string, ok: boolean) => void): { title: string; note: string; list: Item[] }[] {
  const app = ctx.app
  const run = (cmd: S.Cmd) => { const r = ctx.run(cmd); done(r.ok ? F.localize(r.events[0]?.text ?? 'Done.') : F.localize(r.err), r.ok) }
  const loads = (n: number) => F.num(Math.ceil(n))
  // What the stand takes in a day over selling the same potatoes at the market's price (src/sim/season.ts, standSales).
  const grown = c.plans.find(p => p?.crop === 'potato')?.variety
  const standExtra = grown ? Math.round(S.STAND_CWT * S.basePrice(app.world, c, grown) * (S.STAND_PRICE - 1) / 10) * 10 : 0
  const buildings: Item[] = S.buildingInfo(c).filter(b => b.yard === S.HOME_YARD).map(b => {
    const mats = [b.logs > 0 ? `${loads(b.logs)} logs` : '', b.stone > 0 ? `${loads(b.stone)} stone` : ''].filter(Boolean).join(' and ')
    const bought = b.buyLogs > 0 || b.buyStone > 0
    const crewDays = Math.max(1, Math.ceil(b.days / Math.max(1, c.crew.length)))
    return {
      id: `build-${b.kind}`, glyph: BUILD_GLYPH[b.kind], name: b.name, gist: b.kind === 'stand' && standExtra > 0 ? `About +${F.money(standExtra)} a day after harvest` : BUILD_GIST[b.kind], does: `${plain(b.does)}${mats ? ` It takes ${mats}${bought ? ', bought for you in the price' : ' from your yard'}.` : ''}`,
      price: F.money(b.total), cost: b.total,
      tag: b.kind === 'stand' && b.state === 'none' ? 'The cheapest building: a good first one' : undefined,
      // (its materials are on its slip with the sentence: "30 logs and 25 stone, included in the price" beside a
      // yard of none read as a thing still to be got)
      sub: `${BUILD_WHEN[b.kind]} · built in about ${F.plural(crewDays, 'day')}${mats && !bought ? ` with ${mats} from your yard` : ''}`,
      state: b.state === 'built' ? 'have' : b.state === 'building' ? 'doing' : b.ok ? 'can' : 'no',
      why: b.state === 'built' ? 'Built' : b.state === 'building' ? `Going up: ${F.pct(b.progress)} built` : b.ok ? '' : first(b.why),
      label: 'Build', run: () => run({ t: 'build', kind: b.kind, yard: S.HOME_YARD }),
    }
  })
  const machines: Item[] = (Object.keys(S.UPGRADES) as S.UpgradeId[]).map(id => {
    const u = S.UPGRADES[id]
    const have = !!c.upgrades[id]
    const why = have ? '' : equipNeeds(c, id)
    return {
      id: `buy-${id}`, glyph: UPGRADE_GLYPH[id], name: u.name, gist: UPGRADE_GIST[id], does: plain(u.blurb.replace(/ You need the machine shed[^.]*\./, '')), price: F.money(u.cost), cost: u.cost,
      state: have ? 'have' : why ? 'no' : 'can', why: have ? 'Owned' : why ? first(why) : '',
      label: 'Buy', run: () => run({ t: 'buy', upgrade: id }),
    }
  })
  const room = S.hireBlock(c, 'hand')
  const hire = (kind: 'hand' | 'operator', name: string, wage: number, does: string): Item => ({
    id: `hire-${kind}`, glyph: kind === 'hand' ? 'hand' : 'machine', name, does, price: `${F.money(wage)} a month`,
    state: room ? 'no' : 'can', why: room ? (/bunkhouse/i.test(room) ? 'No bed free: a bunkhouse adds six' : first(room)) : '', label: 'Hire', run: () => run({ t: 'hire', kind }),
  })
  const crew: Item[] = [
    hire('hand', 'Field hand', S.HAND_WAGE, 'Works on foot: scouting, pulling blighted plants, felling, picking rocks, building, and helping at the planter and digger.'),
    hire('operator', 'Tractor operator', S.OPERATOR_WAGE, 'Drives the machines: planting, hilling, spraying, digging and hauling. With a second tractor, two fields are worked at once.'),
    { id: 'hire-list', glyph: 'people', name: 'People asking for work', does: 'Named people with their own skills and wages.', price: '', state: c.applicants.length ? 'can' : 'no', why: c.applicants.length ? '' : 'Nobody is asking now: they come each spring', label: 'See them', run: () => openCrew(ctx) },
  ]
  const season = c.phase === 'season' && !!c.season
  const land: Item[] = S.tractInfo(c).filter(t => t.tenure !== 'none').flatMap((t): Item[] => {
    const listed = season && c.season!.jobs.some(j => j.kind === 'fell' && j.field === t.field)
    if (t.stage === 'fell') {
      const why = season ? S.jobBlock(c, 'fell', t.field) : 'Felling is ordered during the season, or set as winter work'
      return [{
        id: `fell-${t.field}`, glyph: 'woods', name: `Clear ${t.name}`, does: `Your crew fells it. The logs go to your yard for building, or to the mill at ${F.money(S.LOG_PRICE)} a load. Then the stumps come out, and it is a new field.`,
        price: 'No cost', sub: 'Work for people with nothing else to do: they leave it when the crop needs them.',
        state: listed ? 'doing' : why && !listed ? 'no' : 'can', why: listed ? `On the work list${t.felled > 0 ? `: ${F.pct(t.felled)} felled` : ''}` : why ? first(why) : '', label: 'Fell it',
        run: () => { const r = app.order('fell', { fields: [t.field] })[0]; done(r?.ok ? `Felling ${t.name} is on the work list.` : r?.err ?? 'That can\'t be ordered now.', !!r?.ok); if (r?.ok) app.focus(t.field) },
      }]
    }
    if (t.stage === 'stump') {
      return [{
        id: `stump-${t.field}`, glyph: 'stump', name: `Pull the stumps on ${t.name}`, does: `A contractor's bulldozer clears it in about ${S.STUMP_DAYS} days. Then it can be picked of rocks and farmed.`,
        price: F.money(t.stumpFee), state: t.works ? 'doing' : t.stumpWhy ? 'no' : 'can', why: t.works ? 'The contractor is at work' : t.stumpWhy ? first(t.stumpWhy) : '', label: 'Hire the contractor', run: () => run({ t: 'stump', field: t.field }),
      }]
    }
    return []
  })
  // Woods and brush for sale: bought in any part of the year, a quarter down and the rest on the land mortgage.
  for (const l of S.landInfo(c).filter(x => S.standing(x.cover) && x.price > 0)) {
    const down = Math.round(l.price * S.MORTGAGE_DOWN)
    land.push({
      id: `land-${l.field}`, glyph: 'woods', name: `Buy ${l.name}`, does: F.localize(l.brings || 'Land to clear into a new field.'),
      price: `${F.money(down)} down`, cost: down, sub: `${F.money(l.price)} in all: a quarter now, the rest on a land mortgage paid at each year end.`,
      state: l.buyWhy ? 'no' : 'can', why: l.buyWhy ? first(l.buyWhy) : '', label: 'Buy',
      run: () => { const r = ctx.run({ t: 'buyLand', field: l.field }); done(r.ok ? F.localize(r.events[0]?.text ?? 'Done.') : F.localize(r.err), r.ok); if (r.ok) app.focus(l.field) },
    })
  }
  land.push({ id: 'more-land', glyph: 'land', name: 'More fields', does: 'Fields ready to plant, to rent for a year or to buy.', price: '', state: 'no', why: 'Rented and bought each spring, on the spring plan', label: '' })
  return [
    { title: 'Buildings', note: 'Your crew builds them, between the crop\'s work. A hundredweight is 100 lb of potatoes.', list: buildings },
    { title: 'Machines', note: 'Delivered the day you buy them.', list: machines },
    { title: 'People', note: '', list: crew },
    { title: 'Land', note: '', list: land },
  ]
}

export function openBuild(ctx: Ctx): void {
  const app = ctx.app
  let off: (() => void) | null = null
  ctx.papers.open({
    title: 'Build',
    testid: 'build',
    size: 'wide',
    kicker: 'Buildings, machines, people and land',
    onClose: () => { off?.(); off = null },
    body: () => {
      const box = h('div', { class: 'bm' })
      let said: { text: string; ok: boolean } | null = null
      const draw = (): void => {
        const c = app.campaign
        if (!c) return
        const money = c.phase === 'season' || c.phase === 'cellar' ? S.moneyNow(app.world, c) : null
        const row = (x: Item): HTMLElement => h('li', { class: `bm-row is-${x.state}${x.tag && x.state === 'can' ? ' is-pick' : ''}`, testid: x.id, title: x.gist && !ctx.touch() ? x.does : undefined },
          icon(x.glyph, 'i bm-ic'),
          h('div', { class: 'bm-what' }, h('b', { class: 'bm-name' }, x.name, x.gist ? h('span', { class: 'bm-gist' }, x.gist) : null, x.tag && x.state === 'can' ? h('span', { class: 'bm-tag' }, x.tag) : null), x.gist ? null : h('span', { class: 'bm-does' }, x.does), x.sub ? h('span', { class: 'bm-sub t-caption' }, x.sub) : null),
          h('div', { class: 'bm-get' },
            x.state === 'can' && x.run ? [h('button', { class: 'btn go bm-key', type: 'button', testid: `${x.id}-go`, onclick: x.run }, x.label, x.price && x.price !== 'No cost' ? h('span', { class: 'num bm-price' }, x.price) : null),
              // What the purchase leaves of the year-end forecast, so its price is read against the goal.
              money && x.cost ? h('span', { class: `bm-left t-caption num${money.after - x.cost < 0 ? ' c-red' : ''}`, testid: `${x.id}-left` }, 'Year-end cash ', h('span', { class: 'bm-was' }, F.money(Math.round(money.after / 100) * 100)), ' \u2192 ', h('b', { class: money.after - x.cost < 0 ? 'c-red' : 'bm-ok' }, F.money(Math.round((money.after - x.cost) / 100) * 100))) : null]
              : [x.price ? h('span', { class: 'num bm-price' }, x.price) : null, h('span', { class: `bm-why${x.state === 'have' ? ' ok' : ''}` }, x.state === 'have' ? [icon('check', 'i'), x.why] : x.why)]))
        const groups = items(ctx, c, (text, ok) => { said = { text, ok }; draw() })
        const head = h('div', { class: 'bm-head' },
          h('div', { class: 'bm-fig', testid: 'build-spend' }, h('span', { class: 't-label' }, c.phase !== 'plan' && c.cash < 0 ? 'The bank will lend you' : 'You can spend'), h('b', { class: 'num' }, F.money(Math.floor(S.spendable(c)))),
            h('span', { class: 't-caption' }, c.phase === 'plan' ? 'your cash' : c.cash >= 0 ? 'your cash, and what the bank will lend' : 'for buildings, machines and land; the crop pays it back')),
          h('div', { class: 'bm-fig' }, h('span', { class: 't-label' }, 'Your own materials'), h('b', { class: 'num' }, `${F.num(Math.floor(c.logs))} logs · ${F.num(Math.floor(c.stone))} stone`), h('span', { class: 't-caption' }, 'from cutting trees and picking rocks; the price covers what you lack')))
        const jump = h('nav', { class: 'bm-jump', 'aria-label': 'Go to' }, groups.map((g, k) => h('button', { class: 'btn quiet', type: 'button', testid: `build-jump-${k}`, onclick: () => box.querySelectorAll('.bm-group')[k]?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, g.title)))
        const parts: (Node | null)[] = [head as Node, jump,
          said ? h('p', { class: `bm-said${said.ok ? '' : ' c-red'}`, testid: 'build-said', role: 'status' }, said.text) : null,
          ...groups.map(g => h('section', { class: 'bm-group' },
            h('h3', { class: 'bm-title t-label' }, g.title), g.note ? h('p', { class: 'bm-note t-caption' }, g.note) : null,
            h('ul', { class: 'bm-list' }, g.list.map(row))))]
        box.replaceChildren(...parts.filter((x): x is Node => !!x))
      }
      draw()
      off = app.on(e => { if (e.type === 'change' || (e.type === 'events' && e.dayPassed)) draw() })
      return box
    },
  })
}
