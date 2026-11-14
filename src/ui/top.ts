// The top of the screen (design/season.html): two anchored boards. On the left the almanac board: the date leaf, six
// days of forecast and the season ruled under them, with the canary goal slip hung below. On the right the bank
// board: the balance, the clock's keys and the menu, and the contracts as ranges.
import { goals, nextGoal, seasonStep, waitingFor, type Goal } from '../game/goals.ts'
import { SPEED_X } from '../game/app.ts'
import * as S from '../sim/index.ts'
import { contractRows } from './contracts.ts'
import { count, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BORROWED_SAYS, causeLine, LOAN_NOTE, loanNoteNow, rangeSays, REMEDY, signedMoney, sumLines } from './money-words.ts'
import { BLIGHT_RISK, firstName, forecastSky, JOB_DOING, JOB_VERB, jobText, plantingIn, SKY_WORD, yearName } from './rules.ts'
import { fist } from './system/parts.ts'

export const PHASE_LABEL: Record<S.Phase, string> = {
  plan: 'Spring plan', season: 'Growing season', cellar: 'In the cellar', ledger: 'Year end', over: 'The end',
}

const SPEED_NAME = ['Paused', `${SPEED_X[1]} speed`, `${SPEED_X[2]} speed`, `${SPEED_X[3]} speed`]

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
  // On a phone the board has no room for a row of phases: the track's own ends say where the year is, and what is next.
  const at = PHASES.findIndex(p => p.id === phaseNow(c))
  const ends = (month: string, phase: string) => h('span', { class: 't-label' }, h('span', { class: 'mo' }, month), h('span', { class: 'ph' }, phase))
  return h('div', { class: 'season-track' },
    ends(F.monthName(S.SEASON_START.month, true), PHASES[at]?.short ?? ''),
    h('span', {
      class: 'bar', role: 'img',
      'aria-label': `The season runs from ${F.date(y, a)} to ${F.date(y, b)}, and it's ${Math.round(((now - a) / (b - a)) * 100)}% done.${ss.watchDay >= 0 ? ` The blight watch started on ${F.date(y, ss.watchDay)}.` : ''}`,
    },
    h('i', { style: `width:${x(now)}` }),
    frosts.map(d => h('u', { class: 'frost', style: `left:${x(d)}` })),
    ss.watchDay >= 0 ? h('u', { class: 'watch', style: `left:${x(ss.watchDay)}` }) : null,
    h('b', { style: `left:${x(now)}` })),
    ends(F.monthName(S.SEASON_LAST.month, true), PHASES[at + 1] ? `then ${PHASES[at + 1].short}` : ''))
}

// What the year asks, in order: where the farm is in it, and what comes next. For every player.
const PHASES: { id: string; glyph: string; name: string; short: string; from: [number, number]; says: string }[] = [
  { id: 'plant', glyph: 'plant', name: 'Plant', short: 'Plant', from: [S.SEASON_START.month, S.SEASON_START.dom], says: 'Plant. In May, once the soil is warm enough, your crew plants each field when you give the word.' },
  { id: 'tend', glyph: 'hill', name: 'Tend', short: 'Tend', from: [6, 1], says: 'Tend. Your crew hills and scouts the fields. Spraying is your decision when blight weather arrives.' },
  { id: 'kill', glyph: 'kill', name: 'Kill the vines', short: 'Kill', from: [9, 1], says: 'Kill the vines. This happens in September, so the skins toughen up for harvest.' },
  { id: 'dig', glyph: 'dig', name: 'Harvest', short: 'Dig', from: [9, 20], says: 'Harvest. Your crew digs and hauls each field, and the crop is weighed at the potato house.' },
  { id: 'sell', glyph: 'ticket', name: 'Sell or store', short: 'Sell', from: [10, 20], says: 'Sell or store. You can sell each weighed crop right away, or store it to sell over the winter.' },
]

// The phase the farm is in, by what the fields show, not by the date alone.
export function phaseNow(c: S.Campaign): string {
  const ss = c.season
  if (!ss) return ''
  const pot = c.plans.map((p, i) => (p?.crop === 'potato' && S.held(c, i) ? i : -1)).filter(i => i >= 0)
  const f = (i: number) => ss.fields[i]
  if (pot.some(i => f(i).plantDay < 0 && f(i).status !== 'dug')) return 'plant'
  if (pot.length && pot.every(i => f(i).weighed || f(i).status === 'off')) return 'sell'
  if (pot.some(i => f(i).status === 'digging' || f(i).status === 'dug' || f(i).inField >= 0.5)) return 'dig'
  if (pot.some(i => f(i).killDay >= 0 || f(i).status === 'dead' || !!S.killOutlook(c, i)?.asked)) return 'kill'
  return 'tend'
}

function phaseRow(c: S.Campaign): HTMLElement | null {
  if (!c.season) return null
  const y = c.year
  const now = phaseNow(c)
  const at = PHASES.findIndex(p => p.id === now)
  const end = S.dayIndex(y, S.SEASON_LAST.month, S.SEASON_LAST.dom)
  const start = (k: number) => (k < PHASES.length ? S.dayIndex(y, PHASES[k].from[0], PHASES[k].from[1]) : end)
  return h('ol', { class: 'phases', testid: 'phases', 'aria-label': `The stages of the year. Now: ${PHASES[at]?.name ?? ''}.${PHASES[at + 1] ? ` Next: ${PHASES[at + 1].name}.` : ''}` },
    PHASES.map((p, k) => h('li', {
      class: `term${k === at ? ' now' : k < at ? ' past' : ''}`, style: `flex:${start(k + 1) - start(k)} 0 auto`, tabindex: '0', 'data-tip': p.says, 'aria-current': k === at ? 'step' : null,
    }, icon(p.glyph, 'i'), k === at ? p.short : h('span', { class: 'sr' }, p.name))))
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
    'aria-label': paused ? `Paused. Resume at ${SPEED_X[at]}${keys ? ' (Space)' : ''}` : `Pause${keys ? ' (Space)' : ''}`,
    title: keys ? (paused ? `Resume at ${SPEED_X[at]} (Space)` : 'Pause (Space)') : undefined,
    onclick: () => { if (!app.pressPause()) ctx.announce(`The game is running at ${SPEED_X[app.speed]}.`) },
  }, icon(paused ? 'play' : 'pause'))
  if (compact) {
    const next = (at % 3 + 1) as 1 | 2 | 3
    return h('div', { class: 'clock sys compact', role: 'group', 'aria-label': 'Game speed' }, pause,
      h('button', { class: 'k speed-x num', type: 'button', testid: 'speed-cycle', 'aria-pressed': String(!paused), onclick: () => app.setSpeed(next) },
        SPEED_X[at], h('span', { class: 'sr' }, ` speed${paused ? ', paused' : ''}. Change to ${SPEED_NAME[next]}`)),
      onMenu ? menuKey(ctx, onMenu) : null)
  }
  return h('div', { class: 'clock sys', role: 'group', 'aria-label': 'Game speed' }, pause,
    ([1, 2, 3] as const).map(k => h('button', {
      class: `k speed-x num${paused && k === at ? ' armed' : ''}`, type: 'button', testid: `speed-${k}`, 'aria-pressed': String(app.speed === k),
      title: keys ? `${SPEED_NAME[k]} (press F to cycle through the speeds, or + and − to change it)` : undefined,
      onclick: () => app.setSpeed(k),
    }, SPEED_X[k], h('span', { class: 'sr' }, ` speed${paused && k === at ? ', the speed the game will resume at' : ''}`))),
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
export interface Outlook {
  figure: number; label: string; before: boolean; risk: S.MoneyNow['callRisk']; look: S.MoneyLook
  lines: S.MoneyPart[]             // the sum from the year's opening cash to the figure, each to the $100
  head: string                     // what the sum assumes
  spread: number                   // half the range while crop is still unweighed, else 0
  reach: boolean                   // the range reaches past the bank's limit: the board shows its give-or-take
  says: string                     // the range and the bank's verdict, in sentences
  why: string                      // all of it in words, for a screen reader
}

export function outlook(ctx: Ctx, c: S.Campaign): Outlook {
  const world = ctx.app.world
  const m = S.moneyNow(world, c)
  const s = c.season
  const figure = Math.round(m.after / 100) * 100
  const lines = sumLines(m.parts, figure)
  // The crop is counted from the season's first day (S.moneyNow), so the only warning is the bank's own: callRisk.
  const limit = F.money(-S.CREDIT_LIMIT)
  const verdict = m.callRisk === 'likely' ? ` Even a good crop would leave you more than ${limit} in the red, so the bank would foreclose.`
    : m.callRisk === 'possible' ? ` With an average crop you'd end the year more than ${limit} in the red, which is the bank's limit.` : ''
  // While some crop is not yet weighed, where the figure is likely to end (S.moneyNow's range); none once all is in.
  const unweighed = c.phase === 'season' && !!s && s.fields.some((f, i) => S.isField(c, i) && f.status !== 'rest' && f.status !== 'off' && f.status !== 'lost' && !f.weighed)
  const spread = unweighed ? Math.round((m.range.hi - m.range.lo) / 2 / 100) * 100 : 0
  const range = spread ? rangeSays(m.range) : ''
  const head = c.phase === 'cellar' ? 'If you sold everything in storage today:' : 'If the crop sold today:'
  const says = `${range}${verdict}`.trim()
  return {
    figure, before: false, spread, risk: m.callRisk, label: 'After year-end bills', look: S.moneyLook(world, c), lines, head, says,
    reach: !!spread && m.range.lo < S.CREDIT_LIMIT,
    why: `${head} ${lines.map(p => `${p.label} ${signed(p.amount)}`).join(', ')}, which makes ${F.money(figure)} after year-end bills. ${says}`.trim(),
  }
}

// A part of the sum with its sign: "+$43,700", "−$19,000".
const signed = (n: number) => `${n > 0 ? '+' : ''}${F.money(n)}`

// Said before logs are sold: the buildings not yet up that would take them, and what buying them back costs.
export function logsWanted(c: S.Campaign): string {
  const want = S.BUILDING_KINDS.filter(k => S.BUILDINGS[k].logs > 0 && !S.buildingAt(c, k, S.HOME_YARD))
    .map(k => ({ name: S.BUILDINGS[k].name.toLowerCase(), logs: S.BUILDINGS[k].logs })).sort((a, b) => b.logs - a.logs).slice(0, 2)
  if (!want.length) return ''
  return `Keep some for building. ${F.upper(F.list(want.map(w => `${S.article(w.name)} ${w.name} takes ${w.logs} loads`)))}, and logs cost ${F.money(S.MILL_PRICE)} a load to buy back.`
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
// How many season days the cause of a move of the year-end figure stays under it.
const WHY_DAYS = 7
// A point in the year to time that by: the season's day, or past it, the winter's month.
const stampOf = (c: S.Campaign) => c.phase === 'cellar' ? 1000 + c.month : c.season?.day ?? 0
// The goals that are a field's job: put on the list by the player, or by the crew's routine.
const GOAL_ROUTINE: Record<string, S.JobKind> = { plant: 'plant', walk: 'scout', hill: 'hill', sample: 'sample', dig: 'dig', haul: 'haul', spray: 'spray', kill: 'kill' }
// The season's calls that are the player's to make (the routine sees to the rest), first to last.
const CALLS: Partial<Record<string, number>> = { rogue: 0, spray: 1, kill: 2, water: 3 }
// A call on the slip: what it is, where, why it cannot wait, and the one command that sees to it when there is one.
interface Call { id: string; act: string; field: number; text: string; why: string; fix: S.Cmd | null; fixLabel: string; line?: string; done?: string }

// Who a priority fix puts first, as the slip says it: "You" for the farmer, else their first name.
function whoFirst(c: S.Campaign, fix: S.Cmd): string {
  const u = c.crew.find(x => x.id === (fix as { unit: number }).unit)
  return !u ? 'Someone' : u.kind === 'farmer' ? 'You' : firstName(u.name)
}

// Brings a control forward once the screen has drawn it: in view, ringed, under the keyboard.
export function light(selector: string, o: { open?: boolean; top?: boolean } = { open: true }): void {
  let tries = 0
  const go = () => {
    const el = document.querySelector<HTMLElement>(`#ui ${selector.split(', ').join(', #ui ')}`)
    if (!el) { if (++tries < 20) requestAnimationFrame(go); return }
    if (o.open && el.getAttribute('aria-expanded') === 'false') el.click()
    el.classList.add('goal-ring')
    el.scrollIntoView({ block: o.top ? 'start' : 'nearest' })
    el.focus({ preventScroll: true })
    setTimeout(() => el.classList.remove('goal-ring'), 4000)
  }
  requestAnimationFrame(go)
}
// Where a spring goal's Show me ends: the fold that holds its control, brought to the top of the sheet and ringed.
const FOLD_OF: Partial<Record<string, string>> = { tool: 'equipment-open', hire: 'crew-open', contract: 'contracts-open', land: 'land-open' }
// A goal named by a word a newcomer has not met says what it is, in a clause.
const GLOSS: Partial<Record<string, string>> = { foreman: 'a hand who runs your fields away from home' }
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
  let pop: '' | 'goals' | 'materials' | 'money' = ''
  // The money breakdown opened by the pointer resting on its key closes when the pointer leaves; a press keeps it.
  let popBy: 'press' | 'hover' = 'press'
  let callShown = ''
  let callsFor: unknown = null
  let callList: Call[] = []
  let callsJobs = -1
  let viewFor: unknown = null
  let viewNow: ReturnType<typeof outlook> | null = null
  let viewCash = 0
  let whyNow: { text: string; at: number; ask: boolean; cause: S.MoneyCause } | null = null
  // The look the last cause was said from, the year the sum was first opened (until then a cause offers "Why?"), and
  // the year the loan's note was said.
  let watch: S.MoneyWatch | null = null
  let openedIn = -1
  let loanSaid = -1
  const closePop = (e: Event) => { if (pop && !(e.target as HTMLElement).closest?.('.tb-pop, .goal, .materials, .after-key, .why-key, [data-testid="bar-money"]')) { pop = ''; ctx.dirty() } }
  const openMoney = (by: 'press' | 'hover') => { if (pop === 'money' && by === 'press' && popBy === 'press') pop = ''; else { pop = 'money'; popBy = by; openedIn = app.campaign?.year ?? -1; if (whyNow) whyNow.ask = false } ctx.dirty() }
  // A cause's remedy: its field, with its card open and the order that helps lit.
  const fix = (why: S.MoneyCause) => {
    if (why.field === undefined || !why.remedy) return
    app.select(why.field)
    app.focus(why.field)
    light(`[data-testid="order-${why.remedy}"]`, { open: false })
  }
  // Whether the remedy the board offers is already on the work list, or can no longer be ordered (rain has wet the
  // ground since): its key goes.
  const remedied = (c: S.Campaign): boolean => !!whyNow?.cause.remedy && whyNow.cause.field !== undefined
    && (!!c.season?.jobs.some(j => j.kind === whyNow!.cause.remedy && j.field === whyNow!.cause.field) || S.jobBlock(c, whyNow.cause.remedy, whyNow.cause.field) !== '')
  // The board's own key for it gives the order, at the cost printed on the key. If the order cannot be given (it is on
  // the list already, nobody can do it), the field is shown instead, with why.
  const order = (why: S.MoneyCause) => {
    if (why.field === undefined || !why.remedy) return
    const r = app.order(why.remedy, { fields: [why.field], unit: -1 })[0]
    if (r?.ok) ctx.say(`${JOB_DOING[why.remedy]} ${S.FIELD_NAMES[why.field]} is on the work list.`, 'info')
    else { fix(why); if (r?.err) ctx.say(`${S.FIELD_NAMES[why.field]}: ${r.err}`, 'info') }
  }
  let leaving = 0
  const leaveMoney = () => { if (pop !== 'money' || popBy !== 'hover') return; clearTimeout(leaving); leaving = window.setTimeout(() => { if (pop === 'money' && popBy === 'hover' && !el.querySelector('.money-pop:hover, .after-key:hover')) { pop = ''; ctx.dirty() } }, 250) }
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
      h('p', { class: 't-label' }, 'Your goals'),
      h('ol', { class: 'gls' },
        reached.length > 3 ? h('li', { class: 'gl done more' }, h('i', { class: 'tick on', 'aria-hidden': 'true' }), h('span', { class: 'gl-t' }, `${reached.length - 3} more done`)) : null,
        reached.slice(-3).map(x => row(x, 'done')),
        g && !g.long ? row(g, 'now') : null,
        ahead.map(x => row(x, 'later'))),
      c.history.length ? [h('p', { class: 't-label' }, 'Long-term goals'),
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
      h('p', { class: 't-caption' }, `Used for building. It costs ${F.money(m.quarryPrice)} a load to buy at the quarry.`))
  }

  // The season's call that cannot wait for a goal: a field's spray, water, roguing or vine kill, or any work marked
  // urgent. The one shown stays while it is still wanted, so the slip never swaps between two.
  // First the simulation's pressing work (not ordered, or nobody will take it), with its one-click fix; then a field's
  // own call from the advice.
  function pressing(c: S.Campaign): Call | null {
    if (c.phase !== 'season' || !c.season) { callShown = ''; return null }
    // Worked out again only when the farm has changed (the advice is cached on the same revision).
    const needs = app.needs()
    const jobs = c.season.jobs.length
    if (needs !== callsFor || jobs !== callsJobs) { callsFor = needs; callsJobs = jobs; callList = callsNow(c) }
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
      fix: p.fix, fixLabel: p.fix?.t === 'job' ? 'Order it' : p.fix?.t === 'priority' ? (whoFirst(c, p.fix) === 'You' ? 'Do it yourself next' : `Have ${whoFirst(c, p.fix)} do it next`) : 'Show me',
      done: p.fix?.t === 'priority' ? `${jobText(p)} is next for ${whoFirst(c, p.fix) === 'You' ? 'you' : whoFirst(c, p.fix)}.` : p.fix?.t === 'job' ? `${jobText(p)} is on the work list.` : undefined,
    }))
    const calls: Call[] = app.needs().map((n, field) => ({ need: n.need!, field }))
      .filter(x => x.need && x.need.act !== 'close' && x.need.act !== 'wait' && x.need.act !== 'sell' && (CALLS[x.need.act] !== undefined || x.need.urgent))
      .sort((a, b) => (CALLS[a.need.act] ?? 9) - (CALLS[b.need.act] ?? 9) || Number(b.need.urgent) - Number(a.need.urgent))
      .map(x => ({ id: x.need.id, act: x.need.act, field: x.field, text: F.localize(x.need.text), why: F.localize(x.need.why), fix: null, fixLabel: 'Show me' }))
    return [...urgent, ...calls.filter(x => !urgent.some(u => u.act === x.act && u.field === x.field))]
  }

  function takeCall(call: Call): void {
    // What the fix did is said where the player looks, not only to a screen reader.
    if (call.fix) { const r = ctx.run(call.fix); if (r.ok) ctx.say(call.done ?? F.localize(r.events[0]?.text ?? `Done: ${call.text}.`), 'good') }
    if (call.field >= 0) { app.select(call.field); app.focus(call.field) }
    ctx.dirty()
  }

  // Why a goal is not the fist's to point at now, in a few words.
  function notYet(c: S.Campaign, g: Goal): string {
    const act = GOAL_ROUTINE[g.id]
    if (!g.now) return lowerFirst(g.when)
    if (g.block) return F.localize(g.block).replace(/\.$/, '')
    if (act && c.season?.jobs.some(j => j.kind === act)) return 'on the work list'
    // The vine kill: the day the coach expects to ask for it on the first field due (S.killOutlook).
    if (g.id === 'kill' && c.season) {
      const due = c.season.fields.map((_, i) => S.isField(c, i) ? S.killOutlook(c, i) : null).filter((k): k is S.KillOutlook => !!k).sort((a, b) => a.day - b.day)[0]
      if (due) return due.asked ? `due since ${F.date(c.year, due.day, true)}` : `due around ${F.date(c.year, due.day, true)}`
    }
    if (act && S.routineInfo(c).some(r => r.kind === act && r.auto)) return 'your crew handles it automatically'
    if (g.id === 'hire') { const why = S.hireRoom(c); if (why) return F.localize(why).replace(/\.$/, '').toLowerCase() }
    return lowerFirst(g.when)
  }

  // A goal's "Show me": to the control where it is reached. A foreman is named on the person's card, its key lit.
  function showGoal(g: Goal): void {
    pop = ''
    o.show?.(g)
    ctx.dirty()
    if (g.id === 'foreman') light('[data-testid="person-foreman"], .cat-foreman .btn')
    else if (FOLD_OF[g.id] && app.campaign?.phase === 'plan') light(`[data-testid="${FOLD_OF[g.id]}"]`, { top: true })
  }

  // The fist's slip: the one next thing, with the fist; a goal just met is struck through above it.
  function goalSlip(c: S.Campaign, g: Goal | null, gone: Goal | null, season: boolean): Child {
    const line = g ?? gone
    if (!line) return null
    // In a later season the crop's own next step comes ahead of a farmstead goal, which waits in the line under it.
    let later: Goal | null = null
    if (season && g && !CROP_STEPS.has(g.id)) { const st = seasonStep(c); if (st) { later = g; g = st } }
    // The line under it names the farmstead goal only while that goal can be taken: not a contract in July.
    const then = later && later.now && !later.block ? `then ${later.title.toLowerCase()}${GLOSS[later.id] ? ` (${GLOSS[later.id]})` : ''}` : ''
    const gloss = g && GLOSS[g.id] ? GLOSS[g.id]! : ''
    // Before the ground is fit, the planting goal says plainly how long it will be, counting down by the day.
    // (Once the word is given the planting is under way: the slip says how far along it is, not the soil again.)
    const wait = g && g.id === 'plant' && season && !(c.season && S.plantWordGiven(c.season)) && !app.needs().some(n => n.need?.act === 'plant') ? plantingIn(app.world, c) : -1
    // The one planting rule (S.plantReady) gives the temperature and the reason, as the field's card and the guide do.
    const first = season ? c.plans.findIndex((p, i) => S.isField(c, i) && p.crop === 'potato') : -1
    const ready = wait > 0 && first >= 0 ? S.plantReady(app.world, c, first) : null
    // The soil fit and the crew standing ready: the year's first planting waits for the player's word.
    const word = !!g && g.id === 'plant' && season && !!c.season && !S.plantWordGiven(c.season) && app.needs().some(n => n.need?.act === 'plant')
    // On the spring plan the one way on is Start the season: the slip names that key, not what comes after it.
    const toStart = c.phase === 'plan' && !!g && CROP_STEPS.has(g.id) && g.now
    const title = toStart ? 'Start the season' : ready ? `Plant when the soil reaches ${F.temp(ready.need)}` : word ? 'Start planting' : g?.title ?? ''
    const n = wait > 1 ? `about ${F.plural(wait, 'day')}` : wait === 1 ? 'any day now' : g ? progressText(g) : ''
    const when = !g ? null : !g.now ? h('span', { class: 'goal-when' }, lowerFirst(g.when))
      : toStart ? h('span', { class: 'goal-when' }, 'your plan is ready, and the rest is optional')
        : ready && !then ? h('span', { class: 'goal-when' }, `it's ${F.temp(ready.soilT)} today`)
          : null
    // While the soil warms there is nothing to do but wait: a key beside the slip lets the weeks go by at 3x.
    const faster = wait > 0 && app.speed < 3 && !S.seasonDone(c)
      ? h('button', { class: 'btn goal-go', type: 'button', testid: 'goal-faster', title: ctx.touch() ? undefined : 'Runs fast until there\'s something for you to decide, then goes back to the speed you had', onclick: () => app.skipAhead() },
        icon('fast', 'i'), `Skip ahead at ${SPEED_X[3]}`) : null
    // The fist points only at what can be done now and paid for: the season's pressing call first (a long goal waits
    // in the quiet line under it), then the goal when its control can be reached; anything else is said quietly.
    const reach = !!g && wait <= 0 && g.now && !g.block && (o.canShow?.(g) ?? false)
    const call = season ? pressing(c) : null
    const callFirst = call && !(g && reach && GOAL_ROUTINE[g.id] === call.act)
    // The next step is the crew's own: what the player is waiting for, in their terms, never the crew's job, whether
    // or not a "Show me" could reach it. With something asked of the player now, that comes first.
    const mine = !call && season && g && wait <= 0 && CROP_STEPS.has(g.id) ? waitingFor(c, app.world) : null
    // What comes after the pressing call: the next goal, unless that is work the crew does by itself.
    const crewOwn = (x: Goal) => { const act = GOAL_ROUTINE[x.id]; return !!act && S.routineInfo(c).some(r => r.kind === act && r.auto) }
    if (callFirst || mine || (season && g && !reach && wait <= 0)) {
      const quiet = h('button', {
        class: `goal${callFirst ? '' : ' later'}`, type: 'button', testid: 'goal', k: callFirst ? `goal-call-${call!.id}` : `goal-later-${g!.id}`, 'data-waiting': mine ? 'crew' : undefined, 'aria-expanded': String(pop === 'goals'),
        title: ctx.touch() ? undefined : callFirst ? F.localize(call!.why) : g!.why,
        onclick: () => { pop = pop === 'goals' ? '' : 'goals'; ctx.dirty() },
      }, callFirst ? fist() : null, h('span', { class: 'goal-body' }, h('span', { class: 'sr' }, callFirst ? 'Now: ' : 'Next goal: '),
        h('b', { class: 'goal-t' }, callFirst ? F.localize(call!.text).replace(/\.$/, '') : mine ? mine.title : g!.title),
        callFirst ? (call!.line ? h('span', { class: 'goal-when' }, call!.line) : g && !crewOwn(g) ? h('span', { class: 'goal-when' }, `then ${g.title.toLowerCase()}${reach ? '' : ` (${notYet(c, g)})`}`) : null) : h('span', { class: 'goal-when' }, `${mine ? F.localize(mine.when) : notYet(c, g!)}${then ? ` · ${then}` : ''}`)),
      h('span', { class: 'sr' }, `. ${callFirst ? F.localize(call!.why) : g!.why} Press to open your goals.`))
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
      h('span', { class: 'sr' }, 'Next goal: '), h('b', { class: 'goal-t' }, title), quiet ? h('span', { class: 'goal-when' }, `${notYet(c, g)}${then ? ` · ${then}` : ''}`) : when ?? (then || gloss ? h('span', { class: 'goal-when' }, then || gloss) : null)),
    n ? h('span', { class: 'count goal-n num', testid: wait > 0 ? 'goal-wait' : undefined }, n) : null,
    h('span', { class: 'sr' }, `. ${g.why} Press to open your goals.`)] : null)
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
    if (counted && (app.needs() !== viewFor || viewCash !== Math.round(c.cash))) {
      // The first time in a season the spring loan grows, a note says what it is.
      if (loanNoteNow(c, viewCash, loanSaid)) { loanSaid = c.year; ctx.notes.push({ text: LOAN_NOTE, offer: true }) }
      viewFor = app.needs(); viewCash = Math.round(c.cash)
      viewNow = outlook(ctx, c)
      // A move of the year-end figure since the last one said, however slowly it came, says its cause under it for a
      // week of the season or the winter's month; the first in a year offers the breakdown with "Why?".
      const r = S.moneyWatch(watch, viewNow.look)
      watch = r.watch
      const why = r.cause
      // A move that only takes back the last one said is no change of the figure: its line goes, and nothing is said.
      if (r.cancel) whyNow = null
      const ask = !!why && openedIn !== c.year
      // An upright phone's board has no room for it (a fifth of the height): there it is an alert, which goes to the
      // field on the order that helps, or else opens the sum.
      if (why && season && low) ctx.notes.push({ text: causeLine(why, true), go: () => why.remedy ? fix(why) : openMoney('press'), offer: true })
      else if (why) whyNow = { text: causeLine(why), at: stampOf(c), ask, cause: why }
    }
    if (whyNow && (!counted || stampOf(c) - whyNow.at > (season ? WHY_DAYS : 0) || stampOf(c) < whyNow.at)) whyNow = null
    if (pop === 'money' && !counted) pop = ''
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
      call: season ? pressing(c)?.id ?? '' : '', block: g?.block ?? '', view: view?.why ?? '', moved: moved?.text ?? '', last: lastMoved, why: whyNow ? [whyNow.text, whyNow.ask, remedied(c)] : '', by: popBy,
      jobs: season ? [...new Set(c.season!.jobs.map(j => j.kind))].sort().join() : '', auto: season ? S.routineInfo(c).filter(r => r.auto).map(r => r.kind).join() : '',
      k: season || c.phase === 'cellar' ? contracts.key() : 0, ph: season ? phaseNow(c) : '', mine: season ? waitingFor(c, app.world) : 0,
    }
    el.dataset.phase = c.phase
    el.dataset.layout = layout
    // On an upright phone in the season there is one board: the balance is its third column (design/season.phone.html).
    const phone = season && layout === 'narrow'
    // A low window's board keeps to its figures: its lines are said by the alerts, and it never grows or shrinks.
    const lines = !(season && low)
    patch(el, JSON.stringify(model), () => {
      // Through the season and the winter, beside the cash and at its weight: what the farm has after the year-end
      // bills, so the cash is never read as what the farm will keep.
      // Its label is the key to the sum that makes it; the give-or-take shows only while it reaches the bank's limit.
      const after = view ? h('div', { class: `after${view.risk === 'likely' ? ' bad' : view.risk === 'possible' ? ' warn' : ''}`, testid: 'outlook' },
        h('button', {
          class: 'after-key t-label', type: 'button', testid: 'outlook-key', 'aria-expanded': String(pop === 'money'), 'aria-controls': 'money-pop',
          onclick: () => openMoney('press'), onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse' && pop !== 'money') openMoney('hover') }, onpointerleave: leaveMoney,
        }, h('span', { class: 'long' }, view.label), h('span', { class: 'short', 'aria-hidden': 'true' }, view.before ? 'Before crop' : 'After bills'), h('span', { class: 'sr' }, '. Press to see how it is made up.')),
        h('span', { class: 't-figure num' }, F.money(view.figure)),
        view.reach ? h('span', { class: 'give num', testid: 'outlook-spread', 'aria-hidden': 'true' }, `±${F.money(view.spread)}`) : h('span', { class: 'give idle', 'aria-hidden': 'true' }, '\u00a0'),
        h('span', { class: 'sr' }, `. ${view.why}`)) : null
      // Cash below zero through the season and the winter is what the bank has lent, said as that, not as a loss.
      const borrowed = !!after && c.cash < 0
      const balance = h('div', { class: `balance${after ? ' two' : ''}` },
        h('span', { class: `t-label when${c.cash < 0 ? ' owed' : ''}` }, borrowed ? 'Borrowed' : c.cash < 0 ? 'In the red' : after ? 'Cash' : 'Balance'),
        h('span', {
          class: `t-figure cash${c.cash < 0 && !borrowed ? ' neg' : ''}${c.cash < 0 ? ' owed' : ''}`, testid: 'cash',
          title: ctx.touch() ? undefined : `${c.cash >= 0 ? '' : borrowed ? BORROWED_SAYS : 'You owe this on the spring loan, and the crop pays it back. The bank will foreclose if you end the year too far in the red.'}${lastMoved ? `${c.cash >= 0 ? '' : ' '}Last change: ${lastMoved}.` : ''}` || undefined,
        }, h('span', { class: 'sr' }, borrowed ? 'Borrowed: ' : 'Cash: '), h('span', { class: 'cash-v num' }, F.money(borrowed ? -c.cash : c.cash))),
        moved && lines ? h('span', { class: 'cash-moved', testid: 'cash-moved', role: 'status' }, moved.text) : null,
        // The cash's line and the figure's line keep their rows whether they say anything or not, so the keys under
        // the board never move.
        after && lines && !moved ? h('span', { class: 'cash-moved idle', 'aria-hidden': 'true' }, '\u00a0') : null,
        after,
        after && lines ? h('span', { class: `after-why${whyNow ? '' : ' idle'}`, testid: whyNow ? 'outlook-why' : undefined, role: whyNow ? 'status' : undefined, 'aria-hidden': whyNow ? undefined : 'true' },
          whyNow ? [h('span', { class: 'why-t' }, whyNow.cause.text), Math.abs(whyNow.cause.amount) < 0.5 ? null : h('span', { class: 'why-amt num' }, `: ${signedMoney(whyNow.cause.amount)}`),
            whyNow.cause.remedy && !remedied(c) ? [' ', h('button', { class: 'why-key fix-key', type: 'button', testid: 'outlook-fix', onclick: () => (REMEDY[whyNow!.cause.remedy!] ? order(whyNow!.cause) : fix(whyNow!.cause)) },
              REMEDY[whyNow.cause.remedy] ? [REMEDY[whyNow.cause.remedy], ' ', h('span', { class: 'num' }, F.money(S.jobCost(c, whyNow.cause.remedy, whyNow.cause.field ?? -1)))] : 'Show me')] : null,
            whyNow.ask ? [' ', h('button', { class: 'why-key', type: 'button', testid: 'outlook-why-open', 'aria-label': 'Why?', title: ctx.touch() ? undefined : 'Why?', 'aria-expanded': String(pop === 'money'), onclick: () => openMoney('press') }, icon('help', 'i'))] : null]
            : '\u00a0') : null)
      // The sum that makes the figure, under the board, clear of the speed keys.
      const money = pop === 'money' && view ? h('div', {
        class: 'tb-pop money-pop sheet', id: 'money-pop', testid: 'money-pop', role: 'dialog', 'aria-label': 'How the year-end figure is made up',
        onpointerleave: leaveMoney,
      }, h('p', { class: 'mp-head it' }, view.head),
      h('table', { class: 'mp-sum' }, h('tbody', null, view.lines.map((p, i) => h('tr', { class: p.id === 'spent' ? 'spent' : null },
        h('th', { scope: 'row' }, p.label, p.of?.length ? h('span', { class: 'mp-of' }, ` (${p.of.map(q => `${q.label} ${F.money(q.amount)}`).join(', ')})`) : null),
        h('td', { class: 'num' }, i ? signed(p.amount) : F.money(p.amount))))),
      h('tfoot', null, h('tr', { class: 'total' }, h('th', { scope: 'row' }, view.label), h('td', { class: 'num' }, F.money(view.figure))))),
      view.says ? h('p', { class: 't-caption' }, view.says) : null) : null
      return [
        h('section', { class: 'almanac', 'aria-label': 'Date, weather and your next goal' },
          h('div', { class: 'mount' },
            h('div', { class: `face${season ? '' : ' plain'}` },
              leaf(c),
              season ? h('button', { class: 'forecast', type: 'button', testid: 'forecast', onclick: () => o.onAlmanac?.() },
                // The figures are for the eye; a screen reader gets the days in words.
                h('span', { class: 'sr' }, `${fc.map(x => x.said).join(' ')} Press to open the almanac for the full forecast.`),
                fc.slice(0, days).map(x => h('span', { class: 'd', 'aria-hidden': 'true' },
                  h('span', { class: 't-label' }, x.day),
                  icon(x.sky, 'i'),
                  h('span', { class: 'hi num' }, `${F.degrees(x.hi)}°`),
                  h('span', { class: 'wet num' },
                    x.rain >= 30 ? h('span', { class: 'pct' }, `${x.rain}%`) : null,
                    x.blight > 0 ? icon('blight', 'i risk') : null,
                    x.frost >= 30 ? icon('frost', 'i cold') : null)))) : null,
              phone ? balance : null),
            season ? seasonTrack(c) : null,
            season ? phaseRow(c) : null),
          // (in a holder as wide as the board and no wider: whatever the slip says, the board keeps its own width)
          h('div', { class: 'goal-hang' }, goalSlip(c, g, gone, season)),
          pop === 'goals' ? ladder(c, g) : null,
          phone ? money : null),
        phone ? null : h('section', { class: 'bank', 'aria-label': 'Money, game speed and contracts' },
          h('div', { class: 'mount' },
            h('div', { class: 'face' },
              balance,
              withClock ? clock(ctx, layout === 'mid' && innerWidth < 1100, withMenu ? o.onMenu : undefined)
                : withMenu ? h('div', { class: 'clock plan' }, h('span', { class: 't-label season-word' }, PHASE_LABEL[c.phase]), menuKey(ctx, o.onMenu)) : null,
              mats ? h('button', {
                class: 'materials', type: 'button', testid: 'materials', 'aria-expanded': String(pop === 'materials'),
                onclick: () => { pop = pop === 'materials' ? '' : 'materials'; ctx.dirty() },
              }, c.logs >= 0.05 ? [icon('logs', 'i'), h('span', { class: 'num' }, F.plural(Math.floor(c.logs), 'log'))] : null,
              c.logs >= 0.05 && c.stone >= 0.05 ? h('span', { class: 'sr' }, ' and ') : null, c.stone >= 0.05 ? [icon('stone', 'i'), h('span', { class: 'num' }, `${F.num(Math.floor(c.stone))} stone`)] : null,
              h('span', { class: 'sr' }, ' in the yard, counted in loads. Press to see them or sell logs.')) : null,
              season || c.phase === 'cellar' ? contracts.part(c) : null)),
          pop === 'materials' && mats ? materials(c) : null,
          money,
          stopped ? h('p', { class: 'stopped-tag', role: 'status' }, icon('pause', 'i'), 'Waiting for you') : null),
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
