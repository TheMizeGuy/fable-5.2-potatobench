import * as S from '../sim/index.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { openHelp } from './help.ts'
import { openSettings } from './settings.ts'
import { PHASE_LABEL } from './top.ts'

export function titleScreen(ctx: Ctx): Screen {
  const app = ctx.app
  const card = h('div', { class: 'title-card paper' })
  const el = h('main', { class: 'title-screen' }, card)
  return {
    el,
    update() {
      const saved = app.savedGame()
      const c = saved?.campaign
      patch(card, JSON.stringify([c?.year, c?.phase, c?.cash, c?.yearIdx, app.settings.units]), () => [
        h('h1', { class: 'title-name' }, 'The County'),
        h('p', { class: 'premise' }, 'Six fields of potatoes in Aroostook County, Maine, farmed through the weather of real years, with a crop you cannot see until you dig it.'),
        h('div', { class: 'title-actions' },
          h('button', { class: 'btn primary big', type: 'button', testid: 'new-farm', onclick: () => openNewFarm(ctx) }, 'New farm'),
          c ? h('button', { class: 'btn big continue', type: 'button', testid: 'continue', onclick: () => { if (!app.continueGame()) ctx.toast('The save could not be read.', 'warn') } },
            h('span', null, 'Continue'),
            h('span', { class: 'sub' }, `${c.year}, ${c.yearIdx < c.goalYears ? `season ${c.yearIdx + 1} of ${c.goalYears}` : `year ${c.yearIdx + 1}`} · ${PHASE_LABEL[c.phase]} · ${F.money(c.cash)}`)) : null,
          h('div', { class: 'row-wrap' },
            h('button', { class: 'btn', type: 'button', testid: 'how-open', onclick: () => openHelp(ctx) }, 'How it works'),
            h('button', { class: 'btn', type: 'button', testid: 'settings-open', onclick: () => openSettings(ctx) }, 'Settings'))),
        h('p', { class: 'credit' }, 'Weather: NOAA, Caribou station, 1973 to 2024. Yields and prices: USDA NASS.'),
      ])
    },
    insets() {
      const r = card.getBoundingClientRect()
      return ctx.phone() ? [0, 0, innerHeight - r.top, 0] : [0, 0, 0, r.right]
    },
  }
}

export function openNewFarm(ctx: Ctx): void {
  const app = ctx.app
  const years = app.startYears()
  let pick = years[Math.floor(Math.random() * years.length)]
  const saved = app.savedGame()?.campaign
  const gaps = years.some((y, k) => k > 0 && y !== years[k - 1] + 1)
  let closeIt = () => {}
  const confirm = h('button', { class: 'btn primary big', type: 'button', testid: 'start-confirm', onclick: () => { closeIt(); app.newGame(pick) } })
  const buttons: HTMLButtonElement[] = []
  let draw = () => {}
  ctx.dialogs.open({
    title: 'A new farm',
    testid: 'new-farm-dialog',
    wide: true,
    cls: 'newfarm',
    foot: () => [
      h('button', { class: 'btn', type: 'button', testid: 'start-random', onclick: () => { pick = years[Math.floor(Math.random() * years.length)]; draw(); buttons.find(b => b.textContent === String(pick))?.focus() } }, 'Another year at random'),
      confirm,
    ],
    body: close => {
      closeIt = close
      const detail = h('div', { class: 'year-detail', 'aria-live': 'polite' })
      const grid = h('div', { class: 'year-grid', role: 'group', 'aria-label': 'First year' })
      const decades = new Map<number, number[]>()
      for (const y of years) {
        const d = Math.floor(y / 10) * 10
        if (!decades.has(d)) decades.set(d, [])
        decades.get(d)!.push(y)
      }
      for (const [d, ys] of decades) {
        grid.append(h('div', { class: 'decade' },
          h('span', { class: 'decade-label' }, `${d}s`),
          h('div', { class: 'decade-years' }, ys.map(y => {
            const b = h('button', { class: 'year', type: 'button', testid: `start-year-${y}`, 'aria-pressed': 'false', autofocus: y === pick, onclick: () => { pick = y; draw() } }, String(y))
            buttons.push(b)
            return b
          }))))
      }
      if (gaps) grid.append(h('p', { class: 'sub' }, 'A farm needs five seasons in a row, so a year is left out where the Caribou record has a gap within the five after it.'))
      draw = () => {
        for (const b of buttons) b.setAttribute('aria-pressed', String(b.textContent === String(pick)))
        // Only what a grower would know going in: the year before. The chosen year's own record waits for its ledger.
        const before = app.world.records[pick - 1]
        const last = pick + S.GOAL_YEARS - 1
        const known = before?.yieldCwtAcre != null || before?.priceUsdCwt != null
        detail.replaceChildren(h('div', { class: 'year-detail-in' },
          h('h3', { class: 'year-big' }, String(pick)),
          known ? h('dl', { class: 'facts', testid: 'year-before' },
            before?.yieldCwtAcre != null ? [h('dt', null, `Maine yield the year before, ${pick - 1}`), h('dd', null, `${F.perArea(before.yieldCwtAcre)} (USDA)`)] : null,
            before?.priceUsdCwt != null ? [h('dt', null, `Maine price the year before, ${pick - 1}`), h('dd', null, `${F.price(before.priceUsdCwt)} in ${pick - 1} dollars (USDA)`)] : null)
            : h('p', { class: 'sub', testid: 'year-before' }, `The record we hold has no Maine yield or price for ${pick - 1}, the year before.`),
          known && !F.metric() ? h('p', { class: 'sub' }, 'A cwt is a hundredweight: 100 lb of potatoes.') : null,
          h('p', null, `Five seasons follow, ${pick} to ${last}, each on the weather recorded at Caribou that year. You will not see it coming; the forecast is all you get.`),
          saved ? h('p', { class: 'warn-text' }, `Starting replaces the farm saved in this browser (${saved.year}, ${PHASE_LABEL[saved.phase].toLowerCase()}).`) : null,
        ))
        confirm.textContent = `Start in ${pick}`
      }
      draw()
      return [
        h('p', { class: 'dialog-lede' }, 'Choose the first year. Its weather, and the four years after it, are the ones the farm gets.'),
        h('div', { class: 'newfarm-cols' }, grid, detail),
      ]
    },
  })
}
