// Winter's work (design/winter.html): a page of the time book, a line for each person with what they do until spring,
// then the yard, the mortgage and the buildings being raised.
import * as S from '../sim/index.ts'
import { type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { term } from './glossary.ts'
import { icon } from './icons.ts'
import { fold, meter } from './system/parts.ts'
import { portrait } from './system/people.ts'
import { logsWanted } from './top.ts'

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

// The words of a line, with what it is about in bold: "Home Woodlot: felled by ...".
function gets(text: string, work: S.WinterWork): Child {
  const at = text.indexOf(': ')
  if (work === 'off' || at < 0) return text
  return [h('b', null, text.slice(0, at + 1)), text.slice(at + 1)]
}

function personRow(ctx: Ctx, c: S.Campaign, u: S.Unit, p: S.PersonInfo, people: S.PersonInfo[], choices: S.WinterChoice[], shared: Set<string>): HTMLElement {
  const tracts = S.timberTracts(c)
  const set = (work: S.WinterWork, field?: number) => {
    if (u.winter === work && (work !== 'woods' || u.winterField === field)) return
    if (ctx.run({ t: 'winter', unit: u.id, work, field }).ok) ctx.dirty()
  }
  const name = u.kind === 'farmer' ? 'You' : u.name
  const homebody = u.trait === 'homebody'
  const best = S.bestSkill(p.skills)
  // Why a choice is voided, under the line; a reason that holds for everyone is said once under all the lines.
  const why = homebody ? [S.TRAITS.homebody.text] : voided(u, choices).filter(x => !shared.has(x))
  return h('li', { class: 'wrow', testid: `winter-${u.id}` },
    portrait(u, 46),
    h('p', { class: 'who' }, h('b', null, name), h('span', null, homebody ? S.TRAITS.homebody.name.toLowerCase() : term(`${best} ${p.skills[best]}`, 'skill'))),
    h('div', { class: 'seg', role: 'group', 'aria-label': `${name} this winter` }, choices.map(ch => {
      const on = u.winter === ch.work
      return h('button', {
        class: 'btn', type: 'button', testid: `winter-${u.id}-${ch.work}`, 'aria-pressed': String(on), disabled: !ch.ok && !on, title: ch.why || undefined,
        onclick: () => set(ch.work, ch.work === 'woods' ? (u.winter === 'woods' ? tracts[(tracts.indexOf(u.winterField) + 1) % tracts.length] : tracts[0]) : undefined),
      }, WORK_LABEL[ch.work])
    })),
    h('p', { class: 'gets' }, gets(outcome(c, u, people), u.winter), why.length ? h('span', { class: 'quiet' }, ` ${why.join(' ')}`) : null))
}

function voided(u: S.Unit, choices: S.WinterChoice[]): string[] {
  return [...new Set(choices.filter(ch => !ch.ok && ch.work !== u.winter).map(ch => ch.why))]
}

// The yard's materials, with logs one press from the mill.
function yardPart(ctx: Ctx, c: S.Campaign): Child {
  const m = S.materialsInfo(c)
  const loads = Math.floor(m.logs)
  const mort = S.mortgageInfo(c)
  return h('section', { class: 'w-yard' },
    h('div', { class: 'sec-h' }, h('h2', null, 'The yard')),
    m.logs >= 0.5 || m.stone >= 0.5 ? h('p', { class: 'yard-stock', testid: 'yard-materials' },
      h('span', null, icon('logs', 'i'), h('b', { class: 'num' }, F.num(Math.round(m.logs))), ` ${Math.round(m.logs) === 1 ? 'load' : 'loads'} of logs`),
      h('span', null, icon('stone', 'i'), h('b', { class: 'num' }, F.num(Math.round(m.stone))), ` ${Math.round(m.stone) === 1 ? 'load' : 'loads'} of fieldstone`))
      : h('p', { class: 'yard-stock quiet' }, 'No logs or fieldstone in the yard.'),
    loads >= 1 && !m.sellWhy ? h('button', { class: 'btn', type: 'button', testid: 'sell-logs', onclick: () => { if (ctx.run({ t: 'sellLogs', loads }).ok) ctx.dirty() } },
      icon('sell', 'i'), `Sell ${F.plural(loads, 'load')}`, h('span', { class: 'sub num' }, F.money(loads * m.logPrice))) : null,
    loads >= 1 && !m.sellWhy && logsWanted(c) ? h('p', { class: 't-caption c-red', testid: 'logs-wanted' }, logsWanted(c)) : null,
    mort.owed > 0 ? h('p', { class: 't-caption w-mortgage', testid: 'winter-mortgage' },
      `${F.money(mort.owed)} owed on the land. At the year end the bank takes ${F.money(mort.principal + mort.interest)}; extra can be paid in spring.`) : null)
}

// Buildings going up, each with how far along it is and who is on it; then what could be raised, folded.
function raisePart(ctx: Ctx, c: S.Campaign, raise: boolean, onRaise: () => void): Child {
  const info = S.buildingInfo(c)
  const up = info.filter(b => b.state === 'building')
  const rows = info.filter(b => b.state === 'none' && (b.yard === S.HOME_YARD || S.holdsDufour(c)))
  if (!up.length && !rows.length) return null
  const builders = c.crew.filter(u => u.winter === 'build').map(u => u.kind === 'farmer' ? 'you' : u.name)
  return h('section', { class: 'w-raise' },
    h('div', { class: 'sec-h' }, h('h2', null, 'Raise a building'), h('span', { class: 't-caption' }, 'built by whoever you set to Build')),
    up.length ? h('ul', { class: 'raise' }, up.map(b => h('li', { testid: `building-${b.kind}` },
      h('div', null,
        h('b', null, `${b.name}, ${b.yardName}`),
        h('p', { class: 'num' }, `${F.pct(b.progress)} · ${F.plural(Math.ceil(b.daysLeft), 'crew-day')} left · ${builders.length ? F.upper(F.list(builders)) : 'nobody on it'}`)),
      meter(b.progress, { label: `${b.name} built`, text: `${F.pct(b.progress)}, ${Math.ceil(b.daysLeft)} crew-days left` })))) : null,
    rows.length ? fold({
      icon: 'raise', name: `${rows.length} to choose from`,
      open: raise, controls: raise ? 'raise-list' : undefined, testid: 'raise-open', onclick: onRaise,
    }) : null,
    raise && rows.length ? h('ul', { class: 'raise', id: 'raise-list' }, rows.map(b => {
      const bought = [b.buyLogs > 0 ? `${Math.ceil(b.buyLogs)} logs` : '', b.buyStone > 0 ? `${Math.ceil(b.buyStone)} stone` : ''].filter(Boolean)
      return h('li', { testid: `raise-${b.kind}-${-b.yard}` },
        h('div', null,
          h('b', null, b.name, b.yard !== S.HOME_YARD ? `, ${b.yardName}` : ''),
          h('p', { class: 'num' }, `${F.money(b.cash)}, ${b.logs} logs, ${b.stone} stone${bought.length ? ` (${F.list(bought)} bought)` : ''}; ${b.days} crew-days. ${b.does}`),
          b.catch ? h('p', { class: 'c-ochre' }, b.catch) : null),
        h('button', {
          class: 'btn', type: 'button', testid: `build-${b.kind}-${-b.yard}`, disabled: !b.ok, title: b.why || undefined,
          onclick: () => { if (ctx.run({ t: 'build', kind: b.kind, yard: b.yard }).ok) ctx.dirty() },
        }, 'Build', h('span', { class: 'sub num' }, F.money(b.total))))
    })) : null)
}

// The whole of winter's work: the people's lines, then the yard and the buildings. raise: whether the list of
// buildings that could be raised is open. after: what follows them on the page.
export function winterWork(ctx: Ctx, c: S.Campaign, raise: boolean, onRaise: () => void, after: Child = null): HTMLElement {
  const w = S.winterInfo(c)
  const people = S.peopleInfo(c)
  const choicesOf = (u: S.Unit) => w.people.find(p => p.id === u.id)!.choices
  const workers = c.crew.filter(u => u.trait !== 'homebody')
  const lists = workers.map(u => voided(u, choicesOf(u)))
  const shared = new Set(workers.length > 1 ? lists[0].filter(x => lists.every(l => l.includes(x))) : [])
  return h('section', { class: 'w-work', 'aria-label': 'The winter\'s work', testid: 'winter' },
    h('ul', { class: 'w-rows' }, c.crew.map(u => personRow(ctx, c, u, people.find(p => p.id === u.id)!, people, choicesOf(u), shared))),
    shared.size ? h('p', { class: 't-caption w-why' }, [...shared].join(' ')) : null,
    h('div', { class: 'winter-foot' }, yardPart(ctx, c), raisePart(ctx, c, raise, onRaise)),
    after)
}
