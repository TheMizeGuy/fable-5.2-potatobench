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
import './buildmenu.css'

type State = 'can' | 'no' | 'have' | 'doing'
interface Item { id: string; glyph: string; name: string; does: string; price: string; sub?: string; state: State; why: string; label: string; run?: () => void }

const UPGRADE_GLYPH: Record<S.UpgradeId, string> = { boom: 'spray', harvester: 'dig', vent: 'store', reel: 'water', tractor2: 'machine', house2: 'store', tractor3: 'machine', truck: 'haul' }
// What a machine's purchase waits on, said as the thing to do first.
const first = (why: string): string => /machine shed/i.test(why) ? 'Needs the machine shed' : /second tractor first/i.test(why) ? 'Needs the second tractor' : /can't afford|costs \$/i.test(why) ? 'Not enough money yet' : why.replace(/\.$/, '')

function items(ctx: Ctx, c: S.Campaign, done: (text: string, ok: boolean) => void): { title: string; note: string; list: Item[] }[] {
  const app = ctx.app
  const run = (cmd: S.Cmd) => { const r = ctx.run(cmd); done(r.ok ? F.localize(r.events[0]?.text ?? 'Done.') : F.localize(r.err), r.ok) }
  const costs = S.goalCosts(c)
  const loads = (n: number) => F.num(Math.ceil(n))
  const buildings: Item[] = S.buildingInfo(c).filter(b => b.yard === S.HOME_YARD).map(b => {
    const mats = [b.logs > 0 ? `${loads(b.logs)} logs` : '', b.stone > 0 ? `${loads(b.stone)} stone` : ''].filter(Boolean).join(' and ')
    const bought = b.buyLogs > 0 || b.buyStone > 0
    return {
      id: `build-${b.kind}`, glyph: BUILD_GLYPH[b.kind], name: b.name, does: b.does,
      price: F.money(b.total),
      sub: `${F.num(b.days)} crew-days of building${mats ? ` · uses ${mats}${bought ? ' (the price buys what your yard lacks)' : ' from your yard'}` : ''}`,
      state: b.state === 'built' ? 'have' : b.state === 'building' ? 'doing' : b.ok ? 'can' : 'no',
      why: b.state === 'built' ? 'Built' : b.state === 'building' ? `Going up: ${F.pct(b.progress)} built` : b.ok ? '' : first(b.why),
      label: 'Build', run: () => run({ t: 'build', kind: b.kind, yard: S.HOME_YARD }),
    }
  })
  const machines: Item[] = (Object.keys(S.UPGRADES) as S.UpgradeId[]).map(id => {
    const u = S.UPGRADES[id], g = costs.find(x => x.id === `buy:${id}`)
    const have = !!c.upgrades[id]
    return {
      id: `buy-${id}`, glyph: UPGRADE_GLYPH[id], name: u.name, does: u.blurb, price: F.money(u.cost),
      state: have ? 'have' : g?.can ? 'can' : 'no', why: have ? 'Owned' : g?.can ? '' : first(g?.why ?? ''),
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
  land.push({ id: 'more-land', glyph: 'land', name: 'More fields', does: 'Fields to rent for a year, and land and woodlots to buy on a mortgage.', price: '', state: 'no', why: 'Rented and bought each spring, on the spring plan', label: '' })
  return [
    { title: 'Buildings', note: 'Your crew builds them, between the crop\'s work. Logs come from felling and stone from picking rocks; what the yard lacks is bought.', list: buildings },
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
        const row = (x: Item): HTMLElement => h('li', { class: `bm-row is-${x.state}`, testid: x.id },
          icon(x.glyph, 'i bm-ic'),
          h('div', { class: 'bm-what' }, h('b', { class: 'bm-name' }, x.name), h('span', { class: 'bm-does' }, x.does), x.sub ? h('span', { class: 'bm-sub t-caption' }, x.sub) : null),
          h('div', { class: 'bm-get' },
            x.state === 'can' && x.run ? h('button', { class: 'btn go bm-key', type: 'button', testid: `${x.id}-go`, onclick: x.run }, x.label, x.price && x.price !== 'No cost' ? h('span', { class: 'num bm-price' }, x.price) : null)
              : [x.price ? h('span', { class: 'num bm-price' }, x.price) : null, h('span', { class: `bm-why${x.state === 'have' ? ' ok' : ''}` }, x.state === 'have' ? [icon('check', 'i'), x.why] : x.why)]))
        const groups = items(ctx, c, (text, ok) => { said = { text, ok }; draw() })
        const head = h('div', { class: 'bm-head' },
          h('div', { class: 'bm-fig', testid: 'build-spend' }, h('span', { class: 't-label' }, 'You can spend'), h('b', { class: 'num' }, F.money(Math.floor(S.spendable(c)))),
            h('span', { class: 't-caption' }, c.phase === 'plan' ? 'your cash' : c.cash >= 0 ? 'your cash, and what the bank will lend' : 'what the bank will still lend')),
          h('div', { class: 'bm-fig' }, h('span', { class: 't-label' }, 'In the yard'), h('b', { class: 'num' }, `${F.num(Math.floor(c.logs))} logs · ${F.num(Math.floor(c.stone))} stone`), h('span', { class: 't-caption' }, 'from felling and picking rocks')),
          money ? h('div', { class: 'bm-fig' }, h('span', { class: 't-label' }, 'Year-end forecast'), h('b', { class: `num${money.after < 0 ? ' c-red' : ''}` }, F.money(money.after)), h('span', { class: 't-caption' }, 'after the bills; what you spend comes off it')) : null)
        const parts: (Node | null)[] = [head as Node,
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
