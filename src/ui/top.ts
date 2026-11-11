// The top bar: the date, the weather, the cash and the clock.
import * as S from '../sim/index.ts'
import { count, patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLIGHT_RISK, forecastSky, SKY_WORD } from './rules.ts'

export const PHASE_LABEL: Record<S.Phase, string> = {
  plan: 'Spring plan', season: 'Growing season', cellar: 'In the cellar', ledger: 'Year end', over: 'The end',
}

const SPEED_NAME = ['Pause', 'Normal speed', 'Fast', 'Fastest']
const SPEED_ICON = ['pause', 'play', 'fast', 'fastest']

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

// A farm of its own counts its years by seasons, winter included; one played on the record turns the year in January.
function yearText(c: S.Campaign): string {
  if (S.isFarmYear(c.year)) return S.yearLabel(c.year)
  return String(c.phase === 'cellar' && c.month >= 2 ? c.year + 1 : c.year)
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

// The clock: every speed as its own button where there is room, three buttons where there is not.
export function clock(ctx: Ctx, compact: boolean): HTMLElement {
  const app = ctx.app
  const c = app.campaign!
  if (S.seasonDone(c) && !ctx.awaiting) {
    return h('button', { class: 'nbtn primary', type: 'button', testid: 'end-season', onclick: () => ctx.run({ t: 'endSeason' }) }, 'Close out the season')
  }
  const keys = !ctx.touch()
  // Pressed while the days are racing; armed while they wait on the player and will race again by themselves.
  const armed = ctx.clock.auto && !app.running && app.speed > 0
  const run = h('button', {
    class: `nicon${armed ? ' armed' : ''}`, type: 'button', testid: 'run', 'aria-pressed': String(app.running),
    'aria-label': `Run until something needs you${armed ? ': on, and waiting for you' : ''}${keys ? ' (F)' : ''}`, title: keys ? 'Run until something needs you (F)' : undefined,
    onclick: () => { ctx.clock.auto = true; app.runUntilNeeded() },
  }, icon('run'))
  if (compact) {
    const next = (app.speed === 0 ? 1 : app.speed % 3 + 1) as 1 | 2 | 3
    return h('div', { class: 'clock', role: 'group', 'aria-label': 'Clock' },
      h('button', {
        class: 'nicon', type: 'button', testid: 'speed-toggle', 'aria-pressed': String(app.speed === 0),
        'aria-label': app.speed === 0 ? 'Paused. Run the clock' : 'Pause the clock', onclick: () => app.togglePause(),
      }, icon(app.speed === 0 ? 'play' : 'pause')),
      h('button', { class: 'nicon speed-x num', type: 'button', testid: 'speed-cycle', onclick: () => { ctx.clock.auto = false; app.setSpeed(next) } },
        h('span', { 'aria-hidden': 'true' }, `${app.speed === 0 ? 1 : app.speed}×`),
        h('span', { class: 'sr' }, `${SPEED_NAME[app.speed === 0 ? 1 : app.speed]}. Change to ${SPEED_NAME[next].toLowerCase()}`)),
      run)
  }
  return h('div', { class: 'clock', role: 'group', 'aria-label': 'Clock' },
    ([0, 1, 2, 3] as const).map(k => h('button', {
      class: 'nicon', type: 'button', testid: `speed-${k}`, 'aria-pressed': String(app.speed === k && !(k === 3 && app.running)),
      'aria-label': `${SPEED_NAME[k]}${keys && k === 0 ? ' (Space)' : ''}`, title: keys ? (k === 0 ? 'Pause (Space)' : `${SPEED_NAME[k]} (+ and −)`) : undefined,
      onclick: () => { if (k > 0) ctx.clock.auto = false; app.setSpeed(k) },
    }, icon(SPEED_ICON[k]))),
    run)
}

export function topBar(ctx: Ctx, o: { onMenu: () => void; onAlmanac?: () => void }): { el: HTMLElement; update(): void } {
  const el = h('header', { class: 'topbar instrument' })
  const app = ctx.app
  let cashWas: number | null = null
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
    const model = {
      p: c.phase, d: dateText(c, form), y: yearText(c), cash: Math.round(c.cash), sp: app.speed, run: app.running, auto: ctx.clock.auto, done: season && S.seasonDone(c) && !ctx.awaiting, layout,
      day: c.season?.day, w: c.season?.watchDay, f: c.season?.log.filter(e => e.type === 'frost').length, u: app.settings.units, t: ctx.touch(), withClock, snug,
    }
    el.dataset.phase = c.phase
    patch(el, JSON.stringify(model), () => [
      h('div', { class: 'tb-date' },
        h('span', { class: 'date', testid: 'date' }, dateText(c, form)),
        h('span', { class: 'tb-year num' }, yearText(c)),
        season ? seasonTrack(c) : null),
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
  return { el, update }
}
