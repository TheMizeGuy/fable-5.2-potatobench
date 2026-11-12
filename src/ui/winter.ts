// Winter's work: who stays on and what they do until spring, one line each, and what the yard holds and is raising.
import { personLook } from '../game/looks.ts'
import * as S from '../sim/index.ts'
import { gauge, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import { face } from './face.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'

const WORK_LABEL: Record<S.WinterWork, string> = { off: 'Off', woods: 'Woods', pack: 'Pack', build: 'Build' }
const WORK_SKILL: Record<Exclude<S.WinterWork, 'off'>, S.Skill> = { woods: 'woods', pack: 'pack', build: 'build' }

// Months of winter work still to come, this one included.
function monthsLeft(c: S.Campaign): number {
  return Math.max(0, S.WINTER_MONTHS - c.month)
}

// Crew-days a month this person puts into their winter work, at their skill.
function monthly(c: S.Campaign, u: S.Unit, p: S.PersonInfo): number {
  if (u.winter === 'off') return 0
  return (u.kind === 'farmer' ? S.FARMER_WINTER_DAYS : S.WINTER_DAYS) * p.speed[WORK_SKILL[u.winter]]
}

// "by February", or "by spring" when it takes the whole winter or more.
function byMonth(c: S.Campaign, months: number): string {
  const m = c.month + Math.ceil(months) - 1
  return m < S.WINTER_MONTHS - 1 ? `by the end of ${S.CELLAR_MONTHS[m]}` : 'by spring'
}

// What the winter's work comes to by spring, for this person, counted with everyone else on the same work.
function outcome(c: S.Campaign, u: S.Unit, people: S.PersonInfo[]): string {
  const left = monthsLeft(c)
  const p = people.find(x => x.id === u.id)!
  const pay = u.kind === 'farmer' ? 'unpaid' : `${F.money(S.payOf(u))} a month`
  if (u.winter === 'off') return u.kind === 'farmer' ? 'Resting till spring.' : 'Laid off: unpaid, back in spring.'
  const crew = c.crew.filter(x => x.winter === u.winter && (u.winter !== 'woods' || x.winterField === u.winterField))
  const rate = crew.reduce((a, x) => a + monthly(c, x, people.find(y => y.id === x.id)!), 0)
  if (u.winter === 'woods') {
    const need = S.fellLeft(c, u.winterField)
    const logs = need > 0 ? Math.min(need, rate * left) / S.FELL_DAYS[c.fields[u.winterField].cover as 'woods' | 'brush'] * S.TIMBER[c.fields[u.winterField].cover as 'woods' | 'brush'] * S.fellYield(u) : 0
    const done = rate > 0 && rate * left >= need
    return `${S.FIELD_NAMES[u.winterField]}: ${done ? `felled ${byMonth(c, need / rate)}` : `about ${F.pct(Math.min(1, (rate * left) / Math.max(1, need)))} of what stands`}, ${Math.round(logs)} loads of logs. ${F.upper(pay)}.`
  }
  if (u.winter === 'pack') {
    const cwt = Math.min(S.unpacked(c), rate * left * S.PACK_PER_DAY)
    return `About ${F.mass(cwt)} packed by spring, at ${F.money(S.PACK_CHARGE)} a hundredweight. ${F.upper(pay)}.`
  }
  const going = c.buildings.filter(b => !b.built && (b.yard === S.HOME_YARD || S.holdsDufour(c)))
  const need = going.reduce((a, b) => a + b.need - b.done, 0)
  const first = going[0]
  return `${first ? `The ${S.BUILDINGS[first.kind].name.toLowerCase()}${going.length > 1 ? ` and ${going.length - 1} more` : ''}` : 'Building'}: ${rate > 0 && rate * left >= need ? `up ${byMonth(c, need / rate)}` : `${Math.round(rate * left)} of ${Math.round(need)} crew-days by spring`}. ${F.upper(pay)}.`
}

function personRow(ctx: Ctx, c: S.Campaign, u: S.Unit, people: S.PersonInfo[], choices: S.WinterChoice[]): HTMLElement {
  const tracts = S.timberTracts(c)
  const set = (work: S.WinterWork, field?: number) => {
    if (u.winter === work && (work !== 'woods' || u.winterField === field)) return
    if (ctx.run({ t: 'winter', unit: u.id, work, field }).ok) ctx.dirty()
  }
  const name = u.kind === 'farmer' ? 'You' : u.name
  return h('li', { class: 'wrow', testid: `winter-${u.id}` },
    face(personLook(u.id), 32),
    h('div', { class: 'wrow-main' },
      h('div', { class: 'wrow-top' },
        h('span', { class: 'wrow-name' }, name),
        h('div', { class: 'wseg', role: 'group', 'aria-label': `${name} this winter` }, choices.map(ch => {
          const on = u.winter === ch.work
          return h('button', {
            class: `wseg-b${on ? ' on' : ''}`, type: 'button', testid: `winter-${u.id}-${ch.work}`, 'aria-pressed': String(on), disabled: !ch.ok && !on, title: ch.why || undefined,
            onclick: () => set(ch.work, ch.work === 'woods' ? (on ? tracts[(tracts.indexOf(u.winterField) + 1) % tracts.length] : tracts[0]) : undefined),
          }, WORK_LABEL[ch.work])
        }))),
      h('p', { class: 'wrow-out' }, outcome(c, u, people))))
}

// The yard's materials, with logs one click from the mill.
function yardLine(ctx: Ctx, c: S.Campaign): Child {
  const m = S.materialsInfo(c)
  if (m.logs < 0.5 && m.stone < 0.5) return null
  const loads = Math.floor(m.logs)
  return h('div', { class: 'wyard', testid: 'yard-materials' },
    icon('tree', 'ic s'),
    h('span', null, `In the yard: ${F.plural(Math.round(m.logs), 'load')} of logs, ${F.plural(Math.round(m.stone), 'load')} of fieldstone.`),
    loads >= 1 && !m.sellWhy ? h('button', { class: 'btn small', type: 'button', testid: 'sell-logs', onclick: () => { if (ctx.run({ t: 'sellLogs', loads }).ok) ctx.dirty() } },
      `Sell ${loads}`, h('span', { class: 'sub num' }, F.money(loads * m.logPrice))) : null)
}

// Buildings going up, each with how far along it is.
function going(c: S.Campaign): Child {
  const up = S.buildingInfo(c).filter(b => b.state === 'building')
  if (!up.length) return null
  const builders = c.crew.filter(u => u.winter === 'build').map(u => u.kind === 'farmer' ? 'you' : u.name)
  return h('ul', { class: 'wbuild' }, up.map(b => h('li', { testid: `building-${b.kind}` },
    icon('house', 'ic s'),
    h('span', null, `${b.name}, ${b.yardName}`),
    gauge(b.progress, { label: `${b.name} built`, text: `${F.pct(b.progress)}, ${Math.ceil(b.daysLeft)} crew-days left` }),
    h('span', { class: 'sub num' }, builders.length ? `${F.pct(b.progress)} · ${F.list(builders)}` : `${F.pct(b.progress)} · nobody on it`))))
}

// What could be raised this winter, for someone kept on to build.
export function buildList(ctx: Ctx, c: S.Campaign): Child {
  const rows = S.buildingInfo(c).filter(b => b.state === 'none' && (b.yard === S.HOME_YARD || S.holdsDufour(c)))
  return h('ul', { class: 'equip build-list' }, rows.map(b => {
    const bought = [b.buyLogs > 0 ? `${Math.ceil(b.buyLogs)} logs` : '', b.buyStone > 0 ? `${Math.ceil(b.buyStone)} stone` : ''].filter(Boolean)
    return h('li', { testid: `raise-${b.kind}-${-b.yard}` },
      h('div', null,
        h('h4', { class: 'eq-name' }, b.name, b.yard !== S.HOME_YARD ? h('span', { class: 'sub' }, `, ${b.yardName}`) : null),
        h('p', { class: 'sub' }, b.does),
        h('p', { class: 'sub warn-text' }, b.catch),
        h('p', { class: 'sub num' }, `${F.money(b.cash)}, ${b.logs} logs, ${b.stone} stone${bought.length ? ` (${F.list(bought)} bought)` : ''}; ${b.days} crew-days.`)),
      h('button', { class: 'btn small', type: 'button', testid: `build-${b.kind}-${-b.yard}`, disabled: !b.ok, title: b.why || undefined, onclick: () => { if (ctx.run({ t: 'build', kind: b.kind, yard: b.yard }).ok) ctx.dirty() } },
        'Build', h('span', { class: 'sub num' }, F.money(b.total))))
  }))
}

// The whole of winter's work for the cellar sheet. raise: whether the list of buildings is open.
export function winterWork(ctx: Ctx, c: S.Campaign, raise: boolean, onRaise: () => void): Child {
  const w = S.winterInfo(c)
  const people = S.peopleInfo(c)
  const m = S.mortgageInfo(c)
  const canRaise = S.buildingInfo(c).some(b => b.state === 'none' && (b.yard === S.HOME_YARD || S.holdsDufour(c)))
  return h('section', { class: 'winter', 'aria-labelledby': 'winter-h', testid: 'winter' },
    h('header', { class: 'winter-head' },
      h('h3', { class: 'block-head', id: 'winter-h' }, 'The winter\'s work'),
      h('span', { class: 'sub num' }, w.monthly ? `${F.money(w.monthly)} a month in wages` : 'Nobody paid this winter')),
    h('ul', { class: 'wrows' }, c.crew.map(u => personRow(ctx, c, u, people, w.people.find(p => p.id === u.id)!.choices))),
    yardLine(ctx, c),
    going(c),
    canRaise ? h('button', { class: 'fold-row wraise', type: 'button', testid: 'raise-open', 'aria-expanded': String(raise), onclick: onRaise },
      icon('house', 'ic fold-ic'), h('span', { class: 'fold-name' }, 'Raise a building'), h('span', { class: 'fold-state' }, 'built by whoever you set to Build'), h('span', null), icon(raise ? 'up' : 'next', 'ic s fold-chev')) : null,
    raise && canRaise ? buildList(ctx, c) : null,
    m.owed > 0 ? h('p', { class: 'wbank sub', testid: 'winter-mortgage' }, icon('bank', 'ic s'),
      `${F.money(m.owed)} owed on the land. At the year end the bank takes ${F.money(m.principal + m.interest)}; extra can be paid in spring.`) : null)
}
