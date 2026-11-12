// The top bar: the date, the weather, the cash and the clock.
import { goals, nextGoal, type Goal } from '../game/goals.ts'
import * as S from '../sim/index.ts'
import { count, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLIGHT_RISK, forecastSky, plantingIn, SKY_WORD, yearName } from './rules.ts'

export const PHASE_LABEL: Record<S.Phase, string> = {
  plan: 'Spring plan', season: 'Growing season', cellar: 'In the cellar', ledger: 'Year end', over: 'The end',
}

const SPEED_NAME = ['Paused', '1× speed', '2× speed', '3× speed']

function dateText(c: S.Campaign, form: 'long' | 'mid' | 'short' = 'long'): string {
  if (c.phase === 'season' && c.season) {
    const d = c.season.day
    return form === 'long' ? F.dateLong(c.year, d) : form === 'mid' ? `${F.weekday(c.year, d, true)}, ${F.date(c.year, d, true)}` : F.date(c.year, d, true)
  }
  if (c.phase === 'cellar') return S.CELLAR_MONTHS[c.month]
  if (c.phase === 'plan') return 'Spring'
  if (c.phase === 'ledger') return 'Year end'
  return 'The end'
}

// A farm counts its years by seasons, winter included.
function yearText(c: S.Campaign): string {
  return yearName(c.year)
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
  return h('span', {
    class: 'gauge track', role: 'img',
    'aria-label': `The season runs ${F.date(y, a)} to ${F.date(y, b)}: ${Math.round(((now - a) / (b - a)) * 100)}% gone${ss.watchDay >= 0 ? `. Blight watch since ${F.date(y, ss.watchDay)}` : ''}`,
  },
  h('i', { style: `width:${x(now)}` }),
  [4, 5, 6, 7, 8, 9, 10].map(m => h('u', { style: `left:${x(S.dayIndex(y, m, 1))}` })),
  frosts.map(d => h('u', { class: 'frost', style: `left:${x(d)}` })),
  ss.watchDay >= 0 ? h('u', { class: 'watch', style: `left:${x(ss.watchDay)}` }) : null)
}

interface Cell { sky: string; hi: number; lo: number; rain: number; blight: number; frost: number; said: string }

function cells(ctx: Ctx, c: S.Campaign): Cell[] {
  const t = S.today(ctx.app.world, c)
  if (!t) return []
  const d = t.day
  const out: Cell[] = [{
    sky: t.sky, hi: d.tmax, lo: d.tmin, rain: -1, blight: Math.min(3, t.severity), frost: d.tmin <= 0 ? 100 : 0,
    said: `Today: ${SKY_WORD[t.sky].toLowerCase()}, high ${F.temp(d.tmax)}, low ${F.temp(d.tmin)}${d.prcp >= 0.5 ? `, rain ${F.rain(d.prcp)}` : ''}${t.severity > 0 ? ', blight weather' : ''}.`,
  }]
  for (const f of S.forecast(ctx.app.world, c, 5)) {
    const sky = forecastSky(f)
    out.push({
      sky, hi: f.hi, lo: f.lo, rain: f.rainChance, blight: f.blight, frost: f.frostChance,
      said: `${F.weekday(c.year, f.day)}: high about ${F.temp(f.hi)}, low about ${F.temp(f.lo)}, ${f.rainChance}% chance of rain${f.blight > 0 ? `, blight risk ${BLIGHT_RISK[f.blight]}` : ''}${f.frostChance >= 30 ? `, ${f.frostChance}% chance of frost` : ''}.`,
    })
  }
  return out
}

// The clock, as a strategy game has it: pause, and three speeds. Where there is room each speed is its own button;
// on a phone, pause and one button that steps through the three.
export function clock(ctx: Ctx, compact: boolean): HTMLElement {
  const app = ctx.app
  const c = app.campaign!
  if (S.seasonDone(c) && !ctx.awaiting) {
    return h('button', { class: 'nbtn primary', type: 'button', testid: 'end-season', onclick: () => ctx.run({ t: 'endSeason' }) }, 'Close out the season')
  }
  const keys = !ctx.touch()
  const paused = app.speed === 0
  // While paused, the speed the clock will go on at is marked, so Space is never a surprise.
  const at = paused ? app.resumeSpeed || 1 : app.speed
  const pause = h('button', {
    class: `nicon${paused ? ' stopped' : ''}`, type: 'button', testid: compact ? 'speed-toggle' : 'speed-0', 'aria-pressed': String(paused),
    'aria-label': paused ? `Paused. Go on at ${at}×${keys ? ' (Space)' : ''}` : `Pause${keys ? ' (Space)' : ''}`,
    title: keys ? (paused ? `Go on at ${at}× (Space)` : 'Pause (Space)') : undefined, onclick: () => app.togglePause(),
  }, icon(paused ? 'play' : 'pause'))
  if (compact) {
    const next = (at % 3 + 1) as 1 | 2 | 3
    return h('div', { class: 'clock', role: 'group', 'aria-label': 'Clock' }, pause,
      h('button', { class: 'nicon speed-x num', type: 'button', testid: 'speed-cycle', onclick: () => app.setSpeed(next) },
        h('span', { 'aria-hidden': 'true' }, `${at}×`),
        h('span', { class: 'sr' }, `${SPEED_NAME[at]}${paused ? ', paused' : ''}. Change to ${SPEED_NAME[next]}`)))
  }
  return h('div', { class: 'clock', role: 'group', 'aria-label': 'Clock' }, pause,
    ([1, 2, 3] as const).map(k => h('button', {
      class: `nicon speed-x num${paused && k === at ? ' armed' : ''}`, type: 'button', testid: `speed-${k}`, 'aria-pressed': String(app.speed === k),
      title: keys ? `${SPEED_NAME[k]} (F steps through the speeds; + and − too)` : undefined,
      onclick: () => app.setSpeed(k),
    }, h('span', { 'aria-hidden': 'true' }, `${k}×`), h('span', { class: 'sr' }, `${SPEED_NAME[k]}${paused && k === at ? ', the speed it goes on at' : ''}`))))
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
export function topBar(ctx: Ctx, o: { onMenu: () => void; onAlmanac?: () => void; show?: (g: Goal) => boolean; canShow?: (g: Goal) => boolean }): TopBar {
  const el = h('header', { class: 'topbar instrument' })
  const app = ctx.app
  let cashWas: number | null = null
  let shown: Goal | null = null
  let met: { goal: Goal; until: number } | null = null
  let fresh = ''
  let pop: '' | 'goals' | 'materials' = ''
  const closePop = (e: Event) => { if (pop && !(e.target as HTMLElement).closest?.('.tb-pop, .tb-goal, .materials')) { pop = ''; ctx.dirty() } }
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
      icon(x.done ? 'check' : cls === 'now' ? 'goal' : 'flat', 'ic s'),
      h('span', { class: 'gl-t' }, x.title),
      x.progress ? h('span', { class: 'gl-n num' }, progressText(x)) : null,
      cls === 'now' ? h('span', { class: 'gl-why' }, x.why, !x.now ? ` ${x.when}.` : '') : cls === 'later' ? h('span', { class: 'gl-when' }, x.when) : null,
      cls === 'now' && o.show && o.canShow?.(x) ? h('button', { class: 'nbtn s', type: 'button', testid: 'goal-show', onclick: () => { pop = ''; o.show!(x); ctx.dirty() } }, icon('go', 'ic s'), 'Show me') : null)
    return h('div', { class: 'tb-pop goals-pop', testid: 'goals', role: 'dialog', 'aria-label': 'Goals' },
      h('p', { class: 't-label' }, 'The way ahead'),
      h('ol', { class: 'gls' },
        reached.length > 3 ? h('li', { class: 'gl done more' }, icon('check', 'ic s'), h('span', { class: 'gl-t' }, `${reached.length - 3} more reached`)) : null,
        reached.slice(-3).map(x => row(x, 'done')),
        g && !g.long ? row(g, 'now') : null,
        ahead.map(x => row(x, 'later'))),
      h('p', { class: 't-label' }, 'Long goals'),
      h('ol', { class: 'gls' }, all.filter(x => x.long).map(x => row(x, x.done ? 'done' : x.id === g?.id ? 'now' : 'long'))))
  }

  function materials(c: S.Campaign): Child {
    const m = S.materialsInfo(c)
    const some = Math.min(5, Math.floor(m.logs))
    const sell = (loads: number) => { const r = ctx.run({ t: 'sellLogs', loads }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) }
    return h('div', { class: 'tb-pop mat-pop', testid: 'materials-pop', role: 'dialog', 'aria-label': 'Logs and stone' },
      h('p', { class: 'mat-row' }, icon('logs', 'ic s'), h('strong', { class: 'num' }, `${F.num(m.logs, m.logs % 1 && m.logs < 10 ? 1 : 0)} loads of logs`)),
      h('p', { class: 'sub' }, `The mill pays ${F.money(m.logPrice)} a load. A building that lacks them buys them back at ${F.money(m.millPrice)}.`),
      m.sellWhy ? h('p', { class: 'sub' }, m.sellWhy) : h('div', { class: 'mat-sell' },
        some >= 1 && some < m.logs - 0.05 ? h('button', { class: 'nbtn s', type: 'button', testid: 'sell-logs-some', onclick: () => sell(some) }, `Sell ${some}`, h('span', { class: 'sub num' }, F.money(some * m.logPrice))) : null,
        h('button', { class: 'nbtn s', type: 'button', testid: 'sell-logs-all', onclick: () => sell(m.logs) }, 'Sell all', h('span', { class: 'sub num' }, F.money(m.logs * m.logPrice)))),
      h('p', { class: 'mat-row' }, icon('stone', 'ic s'), h('strong', { class: 'num' }, `${F.num(m.stone, m.stone % 1 && m.stone < 10 ? 1 : 0)} loads of fieldstone`)),
      h('p', { class: 'sub' }, `For building. Bought at the quarry it costs ${F.money(m.quarryPrice)} a load.`))
  }

  function update(): void {
    const c = app.campaign
    if (!c) return
    const layout = ctx.layout()
    const season = c.phase === 'season' && !!c.season
    // Between a tablet and a desktop the bar keeps everything on one line by saying the date and the clock shorter.
    const snug = layout === 'mid' && innerWidth < 1180
    const form = layout === 'wide' || (layout === 'mid' && !snug) ? 'long' : snug || (layout === 'narrow' && innerWidth >= 380) ? 'mid' : 'short'
    const fc = season ? cells(ctx, c) : []
    const withClock = season && (layout === 'wide' || layout === 'mid')
    const { g, met: gone } = goalNow(c)
    const mats = c.logs >= 0.05 || c.stone >= 0.05
    if (pop === 'materials' && !mats) pop = ''
    const model = {
      p: c.phase, d: dateText(c, form), y: yearText(c), cash: Math.round(c.cash), sp: app.speed, at: app.resumeSpeed, done: season && S.seasonDone(c) && !ctx.awaiting, layout,
      day: c.season?.day, w: c.season?.watchDay, f: c.season?.log.filter(e => e.type === 'frost').length, u: app.settings.units, t: ctx.touch(), withClock, snug,
      g: g ? [g.id, progressText(g), g.now] : 0, gone: gone?.id ?? '', fresh, pop, wait: season && g?.id === 'plant' ? plantingIn(app.world, c) : -1, mats: mats ? [Math.round(c.logs * 10), Math.round(c.stone * 10)] : 0,
      ladder: pop === 'goals' ? goals(c).map(x => [x.id, x.done, progressText(x)]) : 0, show: pop === 'goals' && g ? !!o.canShow?.(g) : false,
    }
    const line = gone ?? g
    // Before the ground is fit, the planting goal says plainly how long it will be, counting down by the day.
    const wait = line && !gone && line.id === 'plant' && season && !app.needs().some(n => n.need?.act === 'plant') ? plantingIn(app.world, c) : -1
    const lineTitle = wait > 0 ? `Plant when the soil reaches ${F.temp(10)}` : line?.title ?? ''
    const lineN = wait > 0 ? `about ${F.plural(wait, 'day')}` : line ? progressText(line) : ''
    el.dataset.phase = c.phase
    patch(el, JSON.stringify(model), () => [
      h('div', { class: 'tb-date' },
        h('span', { class: 'date', testid: 'date' }, dateText(c, form)),
        h('span', { class: 'tb-year num' }, yearText(c)),
        season ? seasonTrack(c) : null,
        line ? h('button', {
          class: `tb-goal${gone ? ' met' : line.id === fresh ? ' fresh' : ''}`, type: 'button', testid: 'goal', k: `goal-${line.id}${gone ? '-met' : ''}`, 'aria-expanded': String(pop === 'goals'),
          title: ctx.touch() ? undefined : line.why,
          onclick: () => { pop = pop === 'goals' ? '' : 'goals'; ctx.dirty() },
        }, icon(gone ? 'check' : wait > 0 ? 'stale' : 'goal', 'ic s'), h('span', { class: 'sr' }, gone ? 'Done: ' : 'Next goal: '), h('span', { class: 'goal-t' }, lineTitle),
        lineN && !gone ? h('span', { class: 'goal-n num', testid: wait > 0 ? 'goal-wait' : undefined }, lineN) : null,
        !line.now && !gone ? h('span', { class: 'goal-when' }, line.when.toLowerCase()) : c.phase === 'plan' && CROP_STEPS.has(line.id) && !gone ? h('span', { class: 'goal-when' }, 'once the season starts') : null,
        h('span', { class: 'sr' }, `. ${line.why} Open the goals.`)) : null,
        pop === 'goals' ? ladder(c, g) : null),
      season ? h('button', { class: 'forecast', type: 'button', testid: 'forecast', onclick: () => o.onAlmanac?.() },
        // The figures are for the eye; a screen reader gets the days in words.
        h('span', { class: 'sr' }, `${fc.map(x => x.said).join(' ')} Open the almanac for the forecast in full.`),
        fc.map((x, k) => h('span', { class: `fc${k === 0 ? ' today' : ''} far-${k}`, 'aria-hidden': 'true' },
        icon(x.sky),
        h('span', { class: 'fc-t num' }, h('b', null, `${F.degrees(x.hi)}°`), h('span', null, `${F.degrees(x.lo)}°`)),
        h('span', { class: 'fc-m' },
          x.rain >= 30 ? h('span', { class: 'fc-rain num' }, `${x.rain}%`) : null,
          x.blight > 0 ? h('span', { class: 'pips' }, Array.from({ length: x.blight }, () => h('i'))) : null,
          x.frost >= 30 ? icon('frost', `ic s${x.frost >= 60 ? ' sure' : ''}`) : null)))) : h('span', { class: 'tb-fill' }),
      h('div', { class: 'tb-right' },
        mats ? h('button', {
          class: 'materials num', type: 'button', testid: 'materials', 'aria-expanded': String(pop === 'materials'),
          onclick: () => { pop = pop === 'materials' ? '' : 'materials'; ctx.dirty() },
        }, h('span', { class: 'sr' }, 'Logs '), c.logs >= 0.05 ? [icon('logs', 'ic s'), h('span', null, F.num(Math.floor(c.logs)))] : null,
        h('span', { class: 'sr' }, ' loads, stone '), c.stone >= 0.05 ? [icon('stone', 'ic s'), h('span', null, F.num(Math.floor(c.stone)))] : null, h('span', { class: 'sr' }, ' loads. Sell logs')) : null,
        pop === 'materials' && mats ? materials(c) : null,
        h('span', { class: 'cash num', testid: 'cash' },
          h('span', { class: 'sr' }, c.cash < 0 ? 'Owed on the spring loan: ' : 'Cash: '),
          h('span', { class: 'cash-v' }, F.money(c.cash))),
        withClock ? clock(ctx, snug) : null,
        h('button', { class: 'nicon', type: 'button', testid: 'menu-open', 'aria-label': `Menu${ctx.touch() ? '' : ' (M)'}`, title: ctx.touch() ? undefined : 'Menu (M)', onclick: () => o.onMenu() }, icon('menu'))),
    ])
    // Out of season the cash moves in a few large steps: each one counts, so it is seen to move.
    const cash = Math.round(c.cash)
    const shown = el.querySelector<HTMLElement>('.cash-v')
    if (shown && !season && cashWas !== null && cashWas !== cash) count(shown, cashWas, cash, n => F.money(n))
    cashWas = cash
  }
  return {
    el, update,
    escape() { if (!pop) return false; pop = ''; ctx.dirty(); return true },
  }
}
