// The top of the screen (design/season.html): two anchored boards. On the left the almanac board: the date leaf, six
// days of forecast and the season ruled under them, with the canary goal slip hung below. On the right the bank
// board: the balance, the clock's keys and the menu, and the contracts as ranges.
import { goals, nextGoal, seasonStep, type Goal } from '../game/goals.ts'
import * as S from '../sim/index.ts'
import { contractRows } from './contracts.ts'
import { count, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLIGHT_RISK, firstName, forecastSky, JOB_VERB, plantingIn, SKY_WORD, yearName } from './rules.ts'
import { fist } from './system/parts.ts'

export const PHASE_LABEL: Record<S.Phase, string> = {
  plan: 'Spring plan', season: 'Growing season', cellar: 'In the cellar', ledger: 'Year end', over: 'The end',
}

const SPEED_NAME = ['Paused', '1× speed', '2× speed', '3× speed']

// The date leaf: in the season the day, its month and weekday; outside it, one word for where the year is.
function leaf(c: S.Campaign): HTMLElement {
  const year = h('span', { class: 'year t-label tb-year num' }, yearName(c.year))
  if (c.phase === 'season' && c.season) {
    const d = c.season.day
    const { month, dom } = S.monthDay(c.year, d)
    return h('div', { class: 'leaf' },
      h('span', { class: 'date', testid: 'date' },
        h('span', { class: 'day num' }, String(dom)),
        h('span', { class: 'month' }, S.MONTHS[month]),
        h('span', { class: 'weekday' }, F.weekday(c.year, d))),
      year)
  }
  const word = c.phase === 'cellar' ? S.CELLAR_MONTHS[c.month] : c.phase === 'plan' ? 'Spring' : c.phase === 'ledger' ? 'Year end' : 'The end'
  return h('div', { class: 'leaf word' }, h('span', { class: 'date', testid: 'date' }, word), year)
}

// How far through the season it is, with the frosts and the start of the blight watch marked on it.
function seasonTrack(c: S.Campaign): HTMLElement | null {
  const ss = c.season
  if (!ss) return null
  const y = c.year
  const a = S.dayIndex(y, S.SEASON_START.month, S.SEASON_START.dom)
  const b = S.dayIndex(y, S.SEASON_LAST.month, S.SEASON_LAST.dom)
  const x = (d: number) => `${(Math.max(0, Math.min(1, (d - a) / (b - a))) * 100).toFixed(1)}%`
  const now = Math.min(ss.day, b)
  const frosts = ss.log.filter(e => e.type === 'frost').map(e => e.day).filter((d, k, all) => all.indexOf(d) === k)
  return h('div', { class: 'season-track' },
    h('span', { class: 't-label' }, F.monthName(S.SEASON_START.month, true)),
    h('span', {
      class: 'bar', role: 'img',
      'aria-label': `The season runs ${F.date(y, a)} to ${F.date(y, b)}: ${Math.round(((now - a) / (b - a)) * 100)}% gone${ss.watchDay >= 0 ? `. Blight watch since ${F.date(y, ss.watchDay)}` : ''}`,
    },
    h('i', { style: `width:${x(now)}` }),
    frosts.map(d => h('u', { class: 'frost', style: `left:${x(d)}` })),
    ss.watchDay >= 0 ? h('u', { class: 'watch', style: `left:${x(ss.watchDay)}` }) : null,
    h('b', { style: `left:${x(now)}` })),
    h('span', { class: 't-label' }, F.monthName(S.SEASON_LAST.month, true)))
}

interface Cell { day: string; sky: string; hi: number; rain: number; blight: number; frost: number; said: string }

function cells(ctx: Ctx, c: S.Campaign): Cell[] {
  const t = S.today(ctx.app.world, c)
  if (!t) return []
  const d = t.day
  const out: Cell[] = [{
    day: 'Today', sky: t.sky, hi: d.tmax, rain: -1, blight: Math.min(3, t.severity), frost: d.tmin <= 0 ? 100 : 0,
    said: `Today: ${SKY_WORD[t.sky].toLowerCase()}, high ${F.temp(d.tmax)}, low ${F.temp(d.tmin)}${d.prcp >= 0.5 ? `, rain ${F.rain(d.prcp)}` : ''}${t.severity > 0 ? ', blight weather' : ''}.`,
  }]
  for (const f of S.forecast(ctx.app.world, c, 5)) {
    out.push({
      day: F.weekday(c.year, f.day, true), sky: forecastSky(f), hi: f.hi, rain: f.rainChance, blight: f.blight, frost: f.frostChance,
      said: `${F.weekday(c.year, f.day)}: high about ${F.temp(f.hi)}, low about ${F.temp(f.lo)}, ${f.rainChance}% chance of rain${f.blight > 0 ? `, blight risk ${BLIGHT_RISK[f.blight]}` : ''}${f.frostChance >= 30 ? `, ${f.frostChance}% chance of frost` : ''}.`,
    })
  }
  return out
}

// The clock, as a strategy game has it: pause, and three speeds, a key each. On a phone (compact), pause and one key
// that steps through the three, and the menu beside them when onMenu is given.
export function clock(ctx: Ctx, compact: boolean, onMenu?: () => void): HTMLElement {
  const app = ctx.app
  const c = app.campaign!
  if (S.seasonDone(c) && !ctx.awaiting) {
    return h('div', { class: 'clock sys done' }, h('button', { class: 'btn go wide', type: 'button', testid: 'end-season', onclick: () => ctx.run({ t: 'endSeason' }) }, 'Close out the season', icon('arrow', 'i')),
      onMenu ? menuKey(ctx, onMenu) : null)
  }
  const keys = !ctx.touch()
  const paused = app.speed === 0
  // While paused, the speed the clock will go on at is marked, so Space is never a surprise.
  const at = paused ? app.resumeSpeed || 1 : app.speed
  const pause = h('button', {
    class: `k${paused ? ' stopped' : ''}`, type: 'button', testid: compact ? 'speed-toggle' : 'speed-0', 'aria-pressed': String(paused),
    'aria-label': paused ? `Paused. Go on at ${at}×${keys ? ' (Space)' : ''}` : `Pause${keys ? ' (Space)' : ''}`,
    title: keys ? (paused ? `Go on at ${at}× (Space)` : 'Pause (Space)') : undefined, onclick: () => app.togglePause(),
  }, icon(paused ? 'play' : 'pause'))
  if (compact) {
    const next = (at % 3 + 1) as 1 | 2 | 3
    return h('div', { class: 'clock sys compact', role: 'group', 'aria-label': 'Clock' }, pause,
      h('button', { class: 'k speed-x num', type: 'button', testid: 'speed-cycle', 'aria-pressed': String(!paused), onclick: () => app.setSpeed(next) },
        `${at}×`, h('span', { class: 'sr' }, ` speed${paused ? ', paused' : ''}. Change to ${SPEED_NAME[next]}`)),
      onMenu ? menuKey(ctx, onMenu) : null)
  }
  return h('div', { class: 'clock sys', role: 'group', 'aria-label': 'Clock' }, pause,
    ([1, 2, 3] as const).map(k => h('button', {
      class: `k speed-x num${paused && k === at ? ' armed' : ''}`, type: 'button', testid: `speed-${k}`, 'aria-pressed': String(app.speed === k),
      title: keys ? `${SPEED_NAME[k]} (F steps through the speeds; + and − too)` : undefined,
      onclick: () => app.setSpeed(k),
    }, `${k}×`, h('span', { class: 'sr' }, ` speed${paused && k === at ? ', the speed it goes on at' : ''}`))),
    onMenu ? menuKey(ctx, onMenu) : null)
}

function menuKey(ctx: Ctx, onMenu: () => void): HTMLElement {
  return h('button', { class: 'menu', type: 'button', testid: 'menu-open', 'aria-label': `Menu${ctx.touch() ? '' : ' (M)'}`, title: ctx.touch() ? undefined : 'Menu (M)', onclick: () => onMenu() }, icon('menu'))
}

// How far along a goal is, in a figure: "2/4", or "40%".
function progressText(g: Goal): string {
  return g.progress ? (g.progress.of === 100 ? `${g.progress.n}%` : `${g.progress.n}/${g.progress.of}`) : ''
}

// The one figure that answers "am I all right?" through a season: what the farm would have after the year-end bills
// if every lot and the crop in the ground sold today (S.moneyNow), with how it is made up.
// Before the tubers set there is no crop to count: the figure is then what the year end takes before the crop pays,
// said as that, not as a verdict.
export function outlook(ctx: Ctx, c: S.Campaign): { figure: number; why: string; label: string; before: boolean } {
  const world = ctx.app.world
  const m = S.moneyNow(world, c)
  const s = c.season
  const figure = Math.round(m.after / 100) * 100
  const unset = s && c.phase === 'season' ? s.fields.filter((f, i) => S.isField(c, i) && (f.status === 'growing' || f.status === 'planted' || f.status === 'idle') && !S.estimateYield(c, i)).length : 0
  const before = m.growing <= 0 && m.stored <= 0 && unset > 0
  const parts = m.parts.map(p => `${p.label} ${F.money(Math.round(p.amount))}`)
  const verdict = before ? 'The crop has not set yet, so nothing is counted for it: this is what the crop has to make up by the year end.'
    : figure >= 0 ? 'The year would end in the black.'
      : figure >= S.CREDIT_LIMIT ? `The year would end in debt, inside the bank's limit of ${F.money(S.CREDIT_LIMIT)}: it carries the debt at interest.`
        : `The year would end past the bank's limit of ${F.money(S.CREDIT_LIMIT)}: it would call the note.`
  const early = unset && !before ? ` ${F.upper(F.plural(unset, 'field'))} not yet setting tubers ${unset === 1 ? 'counts' : 'count'} for nothing yet.` : ''
  return { figure, before, label: before ? 'Year end before the crop' : 'After year-end bills', why: `${before ? 'As things stand' : c.phase === 'cellar' ? 'If what is in store sold today' : 'If everything sold today'}: ${parts.join('; ')}. ${verdict}${early}` }
}

// Said before logs are sold: the buildings not yet up that would take them, and what buying them back costs.
export function logsWanted(c: S.Campaign): string {
  const want = S.BUILDING_KINDS.filter(k => S.BUILDINGS[k].logs > 0 && !S.buildingAt(c, k, S.HOME_YARD))
    .map(k => ({ name: S.BUILDINGS[k].name.toLowerCase(), logs: S.BUILDINGS[k].logs })).sort((a, b) => b.logs - a.logs).slice(0, 2)
  if (!want.length) return ''
  return `Keep some for building: ${F.list(want.map(w => `${S.article(w.name)} ${w.name} takes ${w.logs} loads`))}. Bought back, logs cost ${F.money(S.MILL_PRICE)} a load.`
}

// A goal's when, run into a line: its first word lower-cased, a month's name left as it is.
const lowerFirst = (t: string) => t ? t[0].toLowerCase() + t.slice(1) : t

// The year's money, by what it was for, from the campaign's own running totals: what moved between two looks.
const MONEY_PARTS: [keyof S.Campaign, string, 1 | -1][] = [
  ['yearWages', 'wages', -1], ['yearStorage', 'storage', -1], ['yearRent', 'rent', -1], ['yearLand', 'land', -1], ['yearMortgage', 'mortgage', -1],
  ['yearWorks', 'contractor', -1], ['yearBuilding', 'building', -1], ['yearPacking', 'packing', -1], ['yearPenalties', 'penalty', -1],
  ['yearContracts', 'delivery', 1], ['yearLogs', 'logs', 1], ['yearStand', 'stand', 1], ['yearRest', 'oats', 1],
]
type MoneyLook = Record<string, number>

function moneyLook(c: S.Campaign): MoneyLook {
  const out: MoneyLook = { cash: c.cash, revenue: c.yearRevenue, costs: c.yearCosts }
  for (const [k] of MONEY_PARTS) out[k] = Number(c[k]) || 0
  return out
}

// What the money did between two looks, a word for each part: "wages −$380, orders −$110" (orders: seed, equipment and jobs).
export function moneyMoved(a: MoneyLook, b: MoneyLook): string {
  const parts: string[] = []
  let named = 0, namedIn = 0
  for (const [k, word, sign] of MONEY_PARTS) {
    const d = (b[k] ?? 0) - (a[k] ?? 0)
    if (Math.abs(d) < 0.5) continue
    if (sign < 0) named += d
    else namedIn += d
    parts.push(`${word} ${sign < 0 ? '−' : '+'}${F.money(Math.abs(d))}`)
  }
  const otherOut = (b.costs - a.costs) - named
  const otherIn = (b.revenue - a.revenue) - namedIn
  if (otherOut >= 0.5) parts.push(`orders −${F.money(otherOut)}`)
  if (otherIn >= 0.5) parts.push(`sales +${F.money(otherIn)}`)
  const rest = (b.cash - a.cash) - ((b.revenue - a.revenue) - (b.costs - a.costs))
  if (Math.abs(rest) >= 0.5) parts.push(`${rest < 0 ? 'bank' : 'other'} ${rest < 0 ? '−' : '+'}${F.money(Math.abs(rest))}`)
  return parts.join(', ')
}

const MOMENT_MS = 1600
const MOVED_MS = 4000
// The goals that are a field's job: put on the list by the player, or by the crew's routine.
const GOAL_ROUTINE: Record<string, S.JobKind> = { plant: 'plant', walk: 'scout', hill: 'hill', sample: 'sample', dig: 'dig', haul: 'haul', spray: 'spray', kill: 'kill' }
// The season's calls that are the player's to make (the routine sees to the rest), first to last.
const CALLS: Partial<Record<string, number>> = { rogue: 0, spray: 1, kill: 2, water: 3 }
// A call on the slip: what it is, where, why it cannot wait, and the one command that sees to it when there is one.
interface Call { id: string; act: string; field: number; text: string; why: string; fix: S.Cmd | null; fixLabel: string; line?: string }

// Brings a control forward once the screen has drawn it: in view, ringed, under the keyboard.
export function light(selector: string): void {
  let tries = 0
  const go = () => {
    const el = document.querySelector<HTMLElement>(`#ui ${selector.split(', ').join(', #ui ')}`)
    if (!el) { if (++tries < 20) requestAnimationFrame(go); return }
    if (el.getAttribute('aria-expanded') === 'false') el.click()
    el.classList.add('goal-ring')
    el.scrollIntoView({ block: 'nearest' })
    el.focus({ preventScroll: true })
    setTimeout(() => el.classList.remove('goal-ring'), 4000)
  }
  requestAnimationFrame(go)
}
// The crop's own steps: in spring they wait for the season to start.
const CROP_STEPS = new Set(['plant', 'walk', 'hill', 'spray', 'sample', 'kill', 'dig', 'haul'])

export interface TopBar {
  el: HTMLElement
  update(): void
  // Closes the goal list or the materials, if one is open.
  escape(): boolean
}

// show: takes the player to where the goal is reached (a field, the yard, the hiring), when the screen knows one.
// The phone's season screen carries the clock and the menu at the thumb (season.ts): there the bank board leaves them out.
export function topBar(ctx: Ctx, o: { onMenu: () => void; onAlmanac?: () => void; show?: (g: Goal) => boolean; canShow?: (g: Goal) => boolean }): TopBar {
  const el = h('header', { class: 'topbar sys' })
  const app = ctx.app
  const contracts = contractRows(ctx)
  let cashWas: number | null = null
  let lookWas: MoneyLook | null = null
  let moved: { text: string; until: number } | null = null
  let lastMoved = ''
  let shown: Goal | null = null
  let met: { goal: Goal; until: number } | null = null
  let fresh = ''
  let pop: '' | 'goals' | 'materials' = ''
  let callShown = ''
  let callsFor: unknown = null
  let callList: Call[] = []
  let viewFor: unknown = null
  let viewNow: ReturnType<typeof outlook> | null = null
  let viewCash = 0
  const closePop = (e: Event) => { if (pop && !(e.target as HTMLElement).closest?.('.tb-pop, .goal, .materials')) { pop = ''; ctx.dirty() } }
  document.addEventListener('pointerdown', closePop, true)

  // A goal met is marked: the line strikes through, then the next one writes itself in.
  function goalNow(c: S.Campaign): { g: Goal | null; met: Goal | null } {
    const next = nextGoal(c)
    const now = performance.now()
    if (shown && next?.id !== shown.id && goals(c).find(x => x.id === shown!.id)?.done) {
      met = { goal: shown, until: now + (ctx.reduced() ? 0 : MOMENT_MS) }
      fresh = next?.id ?? ''
      ctx.announce(`Done: ${shown.title}.${next ? ` Next: ${next.title}.` : ''}`)
      setTimeout(() => ctx.dirty(), MOMENT_MS + 30)
    }
    shown = next
    if (met && now >= met.until) met = null
    return { g: next, met: met?.goal ?? null }
  }

  function ladder(c: S.Campaign, g: Goal | null): Child {
    const all = goals(c)
    const steps = all.filter(x => !x.long)
    const reached = steps.filter(x => x.done)
    const ahead = steps.filter(x => !x.done && x.id !== g?.id).slice(0, 4)
    // Every step that can be taken now leads to its control; one the farm cannot pay for says what it costs.
    const row = (x: Goal, cls: string) => h('li', { class: `gl ${cls}`, k: `gl-${x.id}` },
      x.done ? h('i', { class: 'tick on', 'aria-hidden': 'true' }) : cls === 'now' ? fist() : h('i', { class: 'tick', 'aria-hidden': 'true' }),
      h('span', { class: `gl-t${x.done ? ' struck' : ''}` }, x.title),
      x.progress ? h('span', { class: 'gl-n num' }, progressText(x)) : null,
      cls === 'now' ? h('span', { class: 'gl-why' }, x.why, !x.now ? ` ${x.when}.` : '') : cls === 'later' ? h('span', { class: 'gl-when' }, x.block && x.now ? notYet(c, x) : x.when) : null,
      cls === 'now' && x.block ? h('span', { class: 'gl-when c-red' }, F.localize(x.block)) : null,
      !x.done && x.now && !x.block && o.show && o.canShow?.(x)
        ? h('button', { class: 'btn', type: 'button', testid: cls === 'now' ? 'goal-show' : `goal-show-${x.id}`, onclick: () => showGoal(x) }, icon('arrow', 'i'), 'Show me') : null)
    return h('div', { class: 'tb-pop goals-pop sheet', testid: 'goals', role: 'dialog', 'aria-label': 'Goals' },
      h('p', { class: 't-label' }, 'The way ahead'),
      h('ol', { class: 'gls' },
        reached.length > 3 ? h('li', { class: 'gl done more' }, h('i', { class: 'tick on', 'aria-hidden': 'true' }), h('span', { class: 'gl-t' }, `${reached.length - 3} more reached`)) : null,
        reached.slice(-3).map(x => row(x, 'done')),
        g && !g.long ? row(g, 'now') : null,
        ahead.map(x => row(x, 'later'))),
      c.history.length ? [h('p', { class: 't-label' }, 'Long goals'),
        h('ol', { class: 'gls' }, all.filter(x => x.long).map(x => row(x, x.done ? 'done' : x.id === g?.id ? 'now' : 'long')))] : null)
  }

  function materials(c: S.Campaign): Child {
    const m = S.materialsInfo(c)
    const some = Math.min(5, Math.floor(m.logs))
    const sell = (loads: number) => { const r = ctx.run({ t: 'sellLogs', loads }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) }
    return h('div', { class: 'tb-pop mat-pop sheet', testid: 'materials-pop', role: 'dialog', 'aria-label': 'Logs and stone' },
      h('p', { class: 'mat-row' }, icon('logs', 'i'), h('b', { class: 'num' }, `${F.num(m.logs, m.logs % 1 && m.logs < 10 ? 1 : 0)} loads of logs`)),
      h('p', { class: 't-caption' }, `The mill pays ${F.money(m.logPrice)} a load.`),
      logsWanted(c) ? h('p', { class: 't-caption c-red', testid: 'logs-wanted' }, logsWanted(c)) : null,
      m.sellWhy ? h('p', { class: 't-caption' }, m.sellWhy) : h('div', { class: 'mat-sell' },
        some >= 1 && some < m.logs - 0.05 ? h('button', { class: 'btn', type: 'button', testid: 'sell-logs-some', onclick: () => sell(some) }, `Sell ${some}`, h('span', { class: 'sub num' }, F.money(some * m.logPrice))) : null,
        h('button', { class: 'btn', type: 'button', testid: 'sell-logs-all', onclick: () => sell(m.logs) }, 'Sell all', h('span', { class: 'sub num' }, F.money(m.logs * m.logPrice)))),
      h('p', { class: 'mat-row' }, icon('stone', 'i'), h('b', { class: 'num' }, `${F.num(m.stone, m.stone % 1 && m.stone < 10 ? 1 : 0)} loads of fieldstone`)),
      h('p', { class: 't-caption' }, `For building. Bought at the quarry it costs ${F.money(m.quarryPrice)} a load.`))
  }

  // The season's call that cannot wait for a goal: a field's spray, water, roguing or vine kill, or any work marked
  // urgent. The one shown stays while it is still wanted, so the slip never swaps between two.
  // First the simulation's pressing work (not ordered, or nobody will take it), with its one-click fix; then a field's
  // own call from the advice.
  function pressing(c: S.Campaign): Call | null {
    if (c.phase !== 'season' || !c.season) { callShown = ''; return null }
    // Worked out again only when the farm has changed (the advice is cached on the same revision).
    const needs = app.needs()
    if (needs !== callsFor) { callsFor = needs; callList = callsNow(c) }
    const list = callList
    if (!list.length) { callShown = ''; return null }
    const pick = list.find(x => x.id === callShown) ?? list[0]
    callShown = pick.id
    return pick
  }

  function callsNow(c: S.Campaign): Call[] {
    const urgent: Call[] = S.pressing(app.world, c).map(p => ({
      id: `p-${p.kind}-${p.field}`, act: p.kind, field: p.field, text: `${JOB_VERB[p.kind]} ${S.FIELD_NAMES[p.field]}`, why: `${F.upper(p.why)}. ${p.inWay}`,
      line: p.kind === 'kill' ? p.inWay.replace(/, so .*$/, '').replace(/\.$/, '') : undefined,
      fix: p.fix, fixLabel: p.fix?.t === 'job' ? 'Order it' : p.fix?.t === 'priority' ? `${firstName(c.crew.find(u => u.id === (p.fix as { unit: number }).unit)?.name ?? 'Someone')} first` : 'Show me',
    }))
    const calls: Call[] = app.needs().map((n, field) => ({ need: n.need!, field }))
      .filter(x => x.need && x.need.act !== 'close' && x.need.act !== 'wait' && x.need.act !== 'sell' && (CALLS[x.need.act] !== undefined || x.need.urgent))
      .sort((a, b) => (CALLS[a.need.act] ?? 9) - (CALLS[b.need.act] ?? 9) || Number(b.need.urgent) - Number(a.need.urgent))
      .map(x => ({ id: x.need.id, act: x.need.act, field: x.field, text: F.localize(x.need.text), why: F.localize(x.need.why), fix: null, fixLabel: 'Show me' }))
    return [...urgent, ...calls.filter(x => !urgent.some(u => u.act === x.act && u.field === x.field))]
  }

  function takeCall(call: Call): void {
    if (call.fix) { const r = ctx.run(call.fix); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? `${call.text}: done.`)) }
    if (call.field >= 0) { app.select(call.field); app.focus(call.field) }
    ctx.dirty()
  }

  // Why a goal is not the fist's to point at now, in a few words.
  function notYet(c: S.Campaign, g: Goal): string {
    const act = GOAL_ROUTINE[g.id]
    if (!g.now) return lowerFirst(g.when)
    if (g.block) return F.localize(g.block).replace(/\.$/, '')
    if (act && c.season?.jobs.some(j => j.kind === act)) return 'on the list'
    // The vine kill: the day the coach expects to ask for it on the first field due (S.killOutlook).
    if (g.id === 'kill' && c.season) {
      const due = c.season.fields.map((_, i) => S.isField(c, i) ? S.killOutlook(c, i) : null).filter((k): k is S.KillOutlook => !!k).sort((a, b) => a.day - b.day)[0]
      if (due) return due.asked ? `kill due since ${F.date(c.year, due.day, true)}` : `kill due about ${F.date(c.year, due.day, true)}`
    }
    if (act && S.routineInfo(c).some(r => r.kind === act && r.auto)) return 'the crew sees to it by itself'
    if (g.id === 'hire') { const why = S.hireRoom(c); if (why) return F.localize(why).replace(/\.$/, '').toLowerCase() }
    return lowerFirst(g.when)
  }

  // A goal's "Show me": to the control where it is reached. A foreman is named on the person's card, its key lit.
  function showGoal(g: Goal): void {
    pop = ''
    o.show?.(g)
    ctx.dirty()
    if (g.id === 'foreman') light('[data-testid="person-foreman"], .cat-foreman .btn')
  }

  // The fist's slip: the one next thing, with the fist; a goal just met is struck through above it.
  function goalSlip(c: S.Campaign, g: Goal | null, gone: Goal | null, season: boolean): Child {
    const line = g ?? gone
    if (!line) return null
    // In a later season the crop's own next step comes ahead of a farmstead goal, which waits in the line under it.
    let later: Goal | null = null
    if (season && g && !CROP_STEPS.has(g.id)) { const st = seasonStep(c); if (st) { later = g; g = st } }
    const then = later ? `then: ${later.title.toLowerCase()}` : ''
    // Before the ground is fit, the planting goal says plainly how long it will be, counting down by the day.
    const wait = g && g.id === 'plant' && season && !app.needs().some(n => n.need?.act === 'plant') ? plantingIn(app.world, c) : -1
    // The one planting rule (S.plantReady) gives the temperature and the reason, as the field's card and the guide do.
    const first = season ? c.plans.findIndex((p, i) => S.isField(c, i) && p.crop === 'potato') : -1
    const ready = wait > 0 && first >= 0 ? S.plantReady(app.world, c, first) : null
    const title = ready ? `Plant when the soil reaches ${F.temp(ready.need)}` : g?.title ?? ''
    const n = wait > 1 ? `about ${F.plural(wait, 'day')}` : wait === 1 ? 'any day' : g ? progressText(g) : ''
    const when = !g ? null : !g.now ? h('span', { class: 'goal-when' }, lowerFirst(g.when))
      : c.phase === 'plan' && CROP_STEPS.has(g.id) ? h('span', { class: 'goal-when' }, 'once the season starts')
        : null
    // While the soil warms there is nothing to do but wait: a key beside the slip lets the weeks go by at 3x.
    const faster = wait > 0 && app.speed < 3 && !S.seasonDone(c)
      ? h('button', { class: 'btn goal-go', type: 'button', testid: 'goal-faster', title: ctx.touch() ? undefined : 'The clock stops by itself when there is work (F steps the speed)', onclick: () => app.setSpeed(3) },
        icon('fast', 'i'), 'Let the weeks go: 3×') : null
    // The fist points only at what can be done now and paid for: the season's pressing call first (a long goal waits
    // in the quiet line under it), then the goal when its control can be reached; anything else is said quietly.
    const reach = !!g && wait <= 0 && g.now && !g.block && (o.canShow?.(g) ?? false)
    const call = season ? pressing(c) : null
    const callFirst = call && !(g && reach && GOAL_ROUTINE[g.id] === call.act)
    if (callFirst || (season && g && !reach && wait <= 0)) {
      const quiet = h('button', {
        class: `goal${callFirst ? '' : ' later'}`, type: 'button', testid: 'goal', k: callFirst ? `goal-call-${call!.id}` : `goal-later-${g!.id}`, 'aria-expanded': String(pop === 'goals'),
        title: ctx.touch() ? undefined : callFirst ? F.localize(call!.why) : g!.why,
        onclick: () => { pop = pop === 'goals' ? '' : 'goals'; ctx.dirty() },
      }, callFirst ? fist() : null, h('span', { class: 'goal-body' }, h('span', { class: 'sr' }, callFirst ? 'Now: ' : 'Next goal: '),
        h('b', { class: 'goal-t' }, callFirst ? F.localize(call!.text) : g!.title),
        callFirst ? (call!.line ? h('span', { class: 'goal-when' }, call!.line) : g ? h('span', { class: 'goal-when' }, `then: ${g.title.toLowerCase()}${reach ? '' : `, ${notYet(c, g)}`}`) : null) : h('span', { class: 'goal-when' }, `${notYet(c, g!)}${then ? `; ${then}` : ''}`)),
      h('span', { class: 'sr' }, `. ${callFirst ? F.localize(call!.why) : g!.why} Open the goals.`))
      const go = callFirst ? h('button', { class: 'btn goal-go', type: 'button', testid: 'goal-do', onclick: () => takeCall(call!) }, icon(call!.fix ? 'check' : 'arrow', 'i'), call!.fixLabel) : null
      return go ? h('div', { class: 'goal-row' }, quiet, go) : quiet
    }
    const doIt = g && reach && o.show ? h('button', { class: 'btn goal-go', type: 'button', testid: 'goal-do', onclick: () => showGoal(g) }, icon('arrow', 'i'), 'Show me') : null
    // A goal that waits for another part of the year, or for money the farm has not got, is said without the fist.
    const quiet = !!g && (!g.now || !!g.block)
    const slip = h('button', {
      class: `goal${gone ? ' met' : g && g.id === fresh ? ' fresh' : ''}${quiet && !gone ? ' later' : ''}`, type: 'button', testid: 'goal', k: `goal-${g?.id ?? ''}${gone ? `-was-${gone.id}` : ''}`,
      'aria-expanded': String(pop === 'goals'), title: ctx.touch() || !g ? undefined : ready ? F.localize(ready.why) : g.why,
      onclick: () => { pop = pop === 'goals' ? '' : 'goals'; ctx.dirty() },
    },
    gone ? h('span', { class: 'was struck' }, h('span', { class: 'sr' }, 'Done: '), gone.title) : null,
    g ? [quiet ? null : fist(), h('span', { class: 'goal-body' },
      h('span', { class: 'sr' }, 'Next goal: '), h('b', { class: 'goal-t' }, title), quiet ? h('span', { class: 'goal-when' }, `${notYet(c, g)}${then ? `; ${then}` : ''}`) : when ?? (then ? h('span', { class: 'goal-when' }, then) : null)),
    n ? h('span', { class: 'count goal-n num', testid: wait > 0 ? 'goal-wait' : undefined }, n) : null,
    h('span', { class: 'sr' }, `. ${g.why} Open the goals.`)] : null)
    return faster || doIt ? h('div', { class: 'goal-row' }, slip, faster ?? doIt) : slip
  }

  function update(): void {
    const c = app.campaign
    if (!c) return
    const layout = ctx.layout()
    const season = c.phase === 'season' && !!c.season
    const low = layout === 'narrow' || layout === 'short'
    const fc = season ? cells(ctx, c) : []
    const days = layout === 'narrow' ? 3 : layout === 'short' ? 4 : 6
    // On a phone in the season the clock and the menu are at the thumb (season.ts), not on the board.
    const withClock = season && !low
    const withMenu = !(season && low)
    const { g, met: gone } = goalNow(c)
    const counted = season || c.phase === 'cellar'
    if (counted && (app.needs() !== viewFor || viewCash !== Math.round(c.cash))) { viewFor = app.needs(); viewCash = Math.round(c.cash); viewNow = outlook(ctx, c) }
    const view = counted ? viewNow : null
    // When the money moves, what moved it shows under the balance for a moment, and stays on the balance's hover.
    const look = moneyLook(c)
    const now = performance.now()
    if (lookWas && lookWas.year === c.year && Math.abs(look.cash - lookWas.cash) >= 0.5) {
      const text = moneyMoved(lookWas, look)
      if (text) { lastMoved = text; moved = { text, until: now + MOVED_MS }; setTimeout(() => ctx.dirty(), MOVED_MS + 30) }
    }
    lookWas = { ...look, year: c.year }
    if (moved && now >= moved.until) moved = null
    const mats = c.logs >= 0.05 || c.stone >= 0.05
    if (pop === 'materials' && !mats) pop = ''
    const stopped = season && app.speed === 0 && (c.incidents.length > 0 || ctx.awaiting > 0)
    const model = {
      p: c.phase, y: c.year, day: c.season?.day, m: c.month, cash: Math.round(c.cash), sp: app.speed, at: app.resumeSpeed, done: season && S.seasonDone(c) && !ctx.awaiting, layout,
      w: c.season?.watchDay, f: c.season?.log.filter(e => e.type === 'frost').length, u: app.settings.units, t: ctx.touch(), days, withClock, withMenu, stopped,
      g: g ? [g.id, progressText(g), g.now] : 0, gone: gone?.id ?? '', fresh, pop, wait: season && g?.id === 'plant' ? plantingIn(app.world, c) : -1, mats: mats ? [Math.round(c.logs * 10), Math.round(c.stone * 10)] : 0,
      ladder: pop === 'goals' ? goals(c).map(x => [x.id, x.done, progressText(x), x.block, x.now && !x.done && !!o.canShow?.(x)]) : 0, reach: g ? !!o.canShow?.(g) : false,
      call: season ? pressing(c)?.id ?? '' : '', block: g?.block ?? '', view: view?.why ?? '', moved: moved?.text ?? '', last: lastMoved,
      jobs: season ? [...new Set(c.season!.jobs.map(j => j.kind))].sort().join() : '', auto: season ? S.routineInfo(c).filter(r => r.auto).map(r => r.kind).join() : '',
      k: season || c.phase === 'cellar' ? contracts.key() : 0,
    }
    el.dataset.phase = c.phase
    el.dataset.layout = layout
    // On an upright phone in the season there is one board: the balance is its third column (design/season.phone.html).
    const phone = season && layout === 'narrow'
    patch(el, JSON.stringify(model), () => {
      // Through the season and the winter, beside the cash and at its weight: what the farm has after the year-end
      // bills, so the cash is never read as what the farm will keep.
      const after = view ? h('div', {
        class: `after term${view.before ? '' : view.figure < S.CREDIT_LIMIT ? ' bad' : view.figure < 0 ? ' warn' : ''}`, testid: 'outlook', tabindex: '0', 'data-tip': view.why,
      }, h('span', { class: 't-label' }, h('span', { class: 'long' }, view.label), h('span', { class: 'short', 'aria-hidden': 'true' }, view.before ? 'Before crop' : 'After bills')), h('span', { class: 't-figure num' }, F.money(view.figure)), h('span', { class: 'sr' }, `. ${view.why}`)) : null
      const balance = h('div', { class: `balance${after ? ' two' : ''}` },
        h('span', { class: 't-label when' }, c.cash < 0 ? 'On the loan' : after ? 'Cash' : 'Balance'),
        h('span', {
          class: `t-figure cash${c.cash < 0 ? ' neg' : ''}`, testid: 'cash',
          title: ctx.touch() ? undefined : `${c.cash >= 0 ? '' : 'Owed on the spring operating loan: the crop pays it back. The bank calls the note if the year closes too far under.'}${lastMoved ? `${c.cash >= 0 ? '' : ' '}Last moved: ${lastMoved}.` : ''}` || undefined,
        }, h('span', { class: 'sr' }, 'Cash: '), h('span', { class: 'cash-v num' }, F.money(c.cash))),
        moved && !phone ? h('span', { class: 'cash-moved', testid: 'cash-moved', role: 'status' }, moved.text) : null,
        after)
      return [
        h('section', { class: 'almanac', 'aria-label': 'Date, weather and the next goal' },
          h('div', { class: 'mount' },
            h('div', { class: `face${season ? '' : ' plain'}` },
              leaf(c),
              season ? h('button', { class: 'forecast', type: 'button', testid: 'forecast', onclick: () => o.onAlmanac?.() },
                // The figures are for the eye; a screen reader gets the days in words.
                h('span', { class: 'sr' }, `${fc.map(x => x.said).join(' ')} Open the almanac for the forecast in full.`),
                fc.slice(0, days).map(x => h('span', { class: 'd', 'aria-hidden': 'true' },
                  h('span', { class: 't-label' }, x.day),
                  icon(x.sky, 'i'),
                  h('span', { class: 'hi num' }, `${F.degrees(x.hi)}°`),
                  h('span', { class: 'wet num' },
                    x.rain >= 30 ? `${x.rain}%` : null,
                    x.blight > 0 ? icon('blight', 'i risk') : null,
                    x.frost >= 30 ? icon('frost', 'i cold') : null)))) : null,
              phone ? balance : null),
            season ? seasonTrack(c) : null),
          goalSlip(c, g, gone, season),
          pop === 'goals' ? ladder(c, g) : null),
        phone ? null : h('section', { class: 'bank', 'aria-label': 'Money, the clock and the contracts' },
          h('div', { class: 'mount' },
            h('div', { class: 'face' },
              balance,
              withClock ? clock(ctx, layout === 'mid' && innerWidth < 1100, withMenu ? o.onMenu : undefined)
                : withMenu ? h('div', { class: 'clock plan' }, h('span', { class: 't-label season-word' }, PHASE_LABEL[c.phase]), menuKey(ctx, o.onMenu)) : null,
              mats ? h('button', {
                class: 'materials', type: 'button', testid: 'materials', 'aria-expanded': String(pop === 'materials'),
                onclick: () => { pop = pop === 'materials' ? '' : 'materials'; ctx.dirty() },
              }, h('span', { class: 'sr' }, 'Logs '), c.logs >= 0.05 ? [icon('logs', 'i'), h('span', { class: 'num' }, `${F.num(Math.floor(c.logs))} logs`)] : null,
              h('span', { class: 'sr' }, ' loads, stone '), c.stone >= 0.05 ? [icon('stone', 'i'), h('span', { class: 'num' }, `${F.num(Math.floor(c.stone))} stone`)] : null, h('span', { class: 'sr' }, ' loads. Sell logs')) : null,
              season || c.phase === 'cellar' ? contracts.part(c) : null)),
          pop === 'materials' && mats ? materials(c) : null,
          stopped ? h('p', { class: 'stopped-tag', role: 'status' }, icon('pause', 'i'), 'Stopped for you') : null),
      ]
    })
    // Out of season the cash moves in a few large steps: each one counts, so it is seen to move.
    const cash = Math.round(c.cash)
    const v = el.querySelector<HTMLElement>('.cash-v')
    if (v && !season && cashWas !== null && cashWas !== cash) count(v, cashWas, cash, n => F.money(n))
    cashWas = cash
  }
  return {
    el, update,
    escape() { if (!pop) return false; pop = ''; ctx.dirty(); return true },
  }
}
