// The top of the screen (design/season.html): two anchored boards. On the left the almanac board: the date leaf, six
// days of forecast and the season ruled under them, with the canary goal slip hung below. On the right the bank
// board: the balance, the clock's keys and the menu, and the contracts as ranges.
import { goals, nextGoal, type Goal } from '../game/goals.ts'
import * as S from '../sim/index.ts'
import { contractRows } from './contracts.ts'
import { count, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLIGHT_RISK, forecastSky, plantingIn, SKY_WORD, yearName } from './rules.ts'
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
    return h('div', { class: 'clock done' }, h('button', { class: 'btn go wide', type: 'button', testid: 'end-season', onclick: () => ctx.run({ t: 'endSeason' }) }, 'Close out the season', icon('arrow', 'i')),
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
    return h('div', { class: 'clock compact', role: 'group', 'aria-label': 'Clock' }, pause,
      h('button', { class: 'k speed-x num', type: 'button', testid: 'speed-cycle', 'aria-pressed': String(!paused), onclick: () => app.setSpeed(next) },
        `${at}×`, h('span', { class: 'sr' }, ` speed${paused ? ', paused' : ''}. Change to ${SPEED_NAME[next]}`)),
      onMenu ? menuKey(ctx, onMenu) : null)
  }
  return h('div', { class: 'clock', role: 'group', 'aria-label': 'Clock' }, pause,
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

const MOMENT_MS = 1600
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
  let shown: Goal | null = null
  let met: { goal: Goal; until: number } | null = null
  let fresh = ''
  let pop: '' | 'goals' | 'materials' = ''
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
    const row = (x: Goal, cls: string) => h('li', { class: `gl ${cls}`, k: `gl-${x.id}` },
      x.done ? h('i', { class: 'tick on', 'aria-hidden': 'true' }) : cls === 'now' ? fist() : h('i', { class: 'tick', 'aria-hidden': 'true' }),
      h('span', { class: `gl-t${x.done ? ' struck' : ''}` }, x.title),
      x.progress ? h('span', { class: 'gl-n num' }, progressText(x)) : null,
      cls === 'now' ? h('span', { class: 'gl-why' }, x.why, !x.now ? ` ${x.when}.` : '') : cls === 'later' ? h('span', { class: 'gl-when' }, x.when) : null,
      cls === 'now' && o.show && o.canShow?.(x) ? h('button', { class: 'btn', type: 'button', testid: 'goal-show', onclick: () => { pop = ''; o.show!(x); ctx.dirty() } }, icon('arrow', 'i'), 'Show me') : null)
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
      h('p', { class: 't-caption' }, `The mill pays ${F.money(m.logPrice)} a load. A building that lacks them buys them back at ${F.money(m.millPrice)}.`),
      m.sellWhy ? h('p', { class: 't-caption' }, m.sellWhy) : h('div', { class: 'mat-sell' },
        some >= 1 && some < m.logs - 0.05 ? h('button', { class: 'btn', type: 'button', testid: 'sell-logs-some', onclick: () => sell(some) }, `Sell ${some}`, h('span', { class: 'sub num' }, F.money(some * m.logPrice))) : null,
        h('button', { class: 'btn', type: 'button', testid: 'sell-logs-all', onclick: () => sell(m.logs) }, 'Sell all', h('span', { class: 'sub num' }, F.money(m.logs * m.logPrice)))),
      h('p', { class: 'mat-row' }, icon('stone', 'i'), h('b', { class: 'num' }, `${F.num(m.stone, m.stone % 1 && m.stone < 10 ? 1 : 0)} loads of fieldstone`)),
      h('p', { class: 't-caption' }, `For building. Bought at the quarry it costs ${F.money(m.quarryPrice)} a load.`))
  }

  // The canary slip: the one next thing, with the fist; a goal just met is struck through above it.
  function goalSlip(c: S.Campaign, g: Goal | null, gone: Goal | null, season: boolean): Child {
    const line = g ?? gone
    if (!line) return null
    // Before the ground is fit, the planting goal says plainly how long it will be, counting down by the day.
    const wait = g && g.id === 'plant' && season && !app.needs().some(n => n.need?.act === 'plant') ? plantingIn(app.world, c) : -1
    const title = wait > 0 ? `Plant when the soil reaches ${F.temp(10)}` : g?.title ?? ''
    const n = wait > 0 ? `about ${F.plural(wait, 'day')}` : g ? progressText(g) : ''
    const when = !g ? null : !g.now ? h('span', { class: 'goal-when' }, g.when.toLowerCase())
      : c.phase === 'plan' && CROP_STEPS.has(g.id) ? h('span', { class: 'goal-when' }, 'once the season starts')
        // While the soil warms there is nothing to do but wait: a quiet word that the days can go faster.
        : wait > 0 && app.speed > 0 && app.speed < 3 ? h('span', { class: 'goal-when', testid: 'goal-faster' }, ctx.touch() ? 'tap 1× to go faster' : 'F goes faster') : null
    return h('button', {
      class: `goal${gone ? ' met' : g && g.id === fresh ? ' fresh' : ''}`, type: 'button', testid: 'goal', k: `goal-${g?.id ?? ''}${gone ? `-was-${gone.id}` : ''}`,
      'aria-expanded': String(pop === 'goals'), title: ctx.touch() || !g ? undefined : g.why,
      onclick: () => { pop = pop === 'goals' ? '' : 'goals'; ctx.dirty() },
    },
    gone ? h('span', { class: 'was struck' }, h('span', { class: 'sr' }, 'Done: '), gone.title) : null,
    g ? [fist(), h('span', { class: 'goal-body' },
      h('span', { class: 'sr' }, 'Next goal: '), h('b', { class: 'goal-t' }, title), when),
    n ? h('span', { class: 'count goal-n num', testid: wait > 0 ? 'goal-wait' : undefined }, n) : null,
    h('span', { class: 'sr' }, `. ${g.why} Open the goals.`)] : null)
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
    const mats = c.logs >= 0.05 || c.stone >= 0.05
    if (pop === 'materials' && !mats) pop = ''
    const stopped = season && app.speed === 0 && (c.incidents.length > 0 || ctx.awaiting > 0)
    const model = {
      p: c.phase, y: c.year, day: c.season?.day, m: c.month, cash: Math.round(c.cash), sp: app.speed, at: app.resumeSpeed, done: season && S.seasonDone(c) && !ctx.awaiting, layout,
      w: c.season?.watchDay, f: c.season?.log.filter(e => e.type === 'frost').length, u: app.settings.units, t: ctx.touch(), days, withClock, withMenu, stopped,
      g: g ? [g.id, progressText(g), g.now] : 0, gone: gone?.id ?? '', fresh, pop, wait: season && g?.id === 'plant' ? plantingIn(app.world, c) : -1, mats: mats ? [Math.round(c.logs * 10), Math.round(c.stone * 10)] : 0,
      ladder: pop === 'goals' ? goals(c).map(x => [x.id, x.done, progressText(x)]) : 0, show: pop === 'goals' && g ? !!o.canShow?.(g) : false,
      k: season || c.phase === 'cellar' ? contracts.key() : 0,
    }
    el.dataset.phase = c.phase
    el.dataset.layout = layout
    // On an upright phone in the season there is one board: the balance is its third column (design/season.phone.html).
    const phone = season && layout === 'narrow'
    patch(el, JSON.stringify(model), () => {
    const balance = h('div', { class: 'balance' },
      h('span', { class: 't-label when' }, c.cash < 0 ? 'On the loan' : 'Balance'),
      h('span', {
        class: `t-figure cash${c.cash < 0 ? ' neg' : ''}`, testid: 'cash',
        title: ctx.touch() || c.cash >= 0 ? undefined : 'Owed on the spring operating loan: the crop pays it back. The bank calls the note if the year closes too far under.',
      }, h('span', { class: 'sr' }, 'Cash: '), h('span', { class: 'cash-v num' }, F.money(c.cash))))
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
