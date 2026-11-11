import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h, icon, s } from './dom.ts'
import * as F from './fmt.ts'
import { openHelp } from './help.ts'
import { openSettings } from './settings.ts'

export const PHASE_LABEL: Record<S.Phase, string> = {
  plan: 'Spring plan', season: 'Growing season', cellar: 'In the cellar', ledger: 'Year end', over: 'The end',
}

const SPEED_LABEL = ['Pause', 'Run slowly, about a day a second', 'Run faster, two or three days a second', 'Run fast, eight days a second']

export function dateText(c: S.Campaign, short = false): string {
  if (c.phase === 'season' && c.season) return short ? `${F.weekday(c.year, c.season.day, true)}, ${F.date(c.year, c.season.day)}, ${c.year}` : `${F.dateLong(c.year, c.season.day)}, ${c.year}`
  if (c.phase === 'cellar') return `${S.CELLAR_MONTHS[c.month]} ${c.month < 2 ? c.year : c.year + 1}`
  if (c.phase === 'plan') return `Spring ${c.year}`
  if (c.phase === 'ledger') return `Year end ${c.year}`
  return `${c.year}`
}

function seasonStrip(c: S.Campaign): SVGElement | null {
  const ss = c.season
  if (!ss) return null
  const y = c.year
  const a = S.dayIndex(y, S.SEASON_START.month, S.SEASON_START.dom)
  const b = S.dayIndex(y, S.SEASON_LAST.month, S.SEASON_LAST.dom)
  const W = 300
  const x = (d: number) => ((d - a) / (b - a)) * W
  const now = Math.min(ss.day, b)
  const kids: SVGElement[] = [
    s('rect', { class: 'strip-track', x: 0, y: 7, width: W, height: 6, rx: 1 }),
    s('rect', { class: 'strip-fill', x: 0, y: 7, width: Math.max(0, x(now)).toFixed(1), height: 6, rx: 1 }),
  ]
  for (let m = 4; m <= 10; m++) {
    const d = S.dayIndex(y, m, 1)
    kids.push(s('line', { class: 'strip-tick', x1: x(d).toFixed(1), x2: x(d).toFixed(1), y1: 5, y2: 15 }))
    kids.push(s('text', { class: 'strip-label', x: (x(d) + 3).toFixed(1), y: 25 }, F.monthName(m, true)))
  }
  for (const e of ss.log) {
    if (e.type === 'frost') kids.push(s('rect', { class: 'strip-frost', x: (x(e.day) - 1).toFixed(1), y: 3, width: 2, height: 14 }))
  }
  if (ss.watchDay >= 0) {
    const wx = x(ss.watchDay)
    kids.push(s('path', { class: 'strip-watch', d: `M${(wx - 4).toFixed(1)} 0h8l-4 6z` }))
  }
  kids.push(s('rect', { class: 'strip-now', x: (x(now) - 1.5).toFixed(1), y: 2, width: 3, height: 16 }))
  return s('svg', {
    class: 'strip', viewBox: `0 0 ${W} 28`, preserveAspectRatio: 'none', role: 'img',
    'aria-label': `Season from ${F.date(y, a)} to ${F.date(y, b)}: ${Math.round(((now - a) / (b - a)) * 100)}% gone${ss.watchDay >= 0 ? `, blight watch since ${F.date(y, ss.watchDay)}` : ''}`,
  }, kids)
}

export function topBar(ctx: Ctx): { el: HTMLElement; update(): void } {
  const el = h('header', { class: 'topbar paper' })
  const app = ctx.app
  function update(): void {
    const c = app.campaign
    if (!c) return
    const season = c.phase === 'season' && !!c.season
    const done = season && S.seasonDone(c)
    const model = {
      p: c.phase, y: c.year, i: c.yearIdx, g: c.goalYears, d: dateText(c), cash: Math.round(c.cash), sp: app.speed, done,
      day: c.season?.day, w: c.season?.watchDay, f: c.season?.log.filter(e => e.type === 'frost').length, u: app.settings.units, ph: ctx.phone(),
    }
    patch(el, JSON.stringify(model), () => [
      h('div', { class: 'tb-id' },
        h('span', { class: 'wordmark' }, 'The County'),
        h('span', { class: 'tb-phase' }, h('span', { testid: 'phase' }, PHASE_LABEL[c.phase]), ' · ',
          c.yearIdx < c.goalYears ? `${ctx.phone() ? '' : 'season '}${c.yearIdx + 1} of ${c.goalYears}` : `year ${c.yearIdx + 1}`)),
      h('div', { class: 'tb-date' },
        h('span', { class: 'date', testid: 'date' }, dateText(c, ctx.phone())),
        season ? seasonStrip(c) : null),
      season ? h('div', { class: 'clock', role: 'group', 'aria-label': 'Clock' },
        [0, 1, 2, 3].map(k => h('button', {
          class: 'clock-btn', type: 'button', testid: `speed-${k}`, 'aria-pressed': String(app.speed === k), 'aria-label': SPEED_LABEL[k],
          title: `${SPEED_LABEL[k]} (${k === 0 ? 'Space' : k})`, onclick: () => app.setSpeed(k as 0 | 1 | 2 | 3),
        }, k === 0 ? icon('pause') : speedGlyph(k)))) : null,
      h('div', { class: 'tb-cash' },
        h('span', { class: 'label' }, 'Cash'),
        h('span', { class: `cash${c.cash < 0 ? ' neg' : ''}`, testid: 'cash' }, F.money(c.cash))),
      done ? h('button', { class: 'btn primary end', type: 'button', testid: 'end-season', onclick: () => ctx.run({ t: 'endSeason' }) }, 'Close out the season') : null,
      h('div', { class: 'tb-menu' },
        h('button', { class: 'icon-btn', type: 'button', testid: 'how-open', 'aria-label': 'How it works', title: 'How it works', onclick: () => openHelp(ctx) }, icon('help')),
        h('button', { class: 'icon-btn', type: 'button', testid: 'settings-open', 'aria-label': 'Menu and settings', title: 'Menu and settings', onclick: () => openSettings(ctx) }, icon('menu'))),
    ])
  }
  return { el, update }
}

function speedGlyph(k: number): SVGElement {
  const w = 6 + 6 * k
  const paths: SVGElement[] = []
  for (let i = 0; i < k; i++) paths.push(s('path', { d: `M${3 + i * 6} 5l6 5-6 5z` }))
  return s('svg', { class: 'ic speed', viewBox: `0 0 ${w + 4} 20`, 'aria-hidden': 'true', style: `width:${(w + 4) * 0.9}px` }, paths)
}
