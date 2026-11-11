// The opening: the land, the name, one line, Play.
import * as S from '../sim/index.ts'
import { confirmPaper, patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { seasonCount } from './rules.ts'
import { PHASE_LABEL } from './top.ts'

// Years a first farm has a fair chance in: the neighbor's crop came in at or above its usual and blight stayed small.
function soundYears(world: S.World): number[] {
  const ys = S.startYears(world)
  const known = ys.map(y => world.neighbor[y]).filter(Boolean).map(n => n.yieldCwtAcre).sort((a, b) => a - b)
  const median = known.length ? known[Math.floor(known.length / 2)] : 0
  const good = ys.filter(y => { const n = world.neighbor[y]; return !!n && n.yieldCwtAcre >= median && n.blightPct < 5 })
  return good.length ? good : ys
}

// Starts a farm, in the year given or in one chosen for the player. A farm still in play is not replaced unasked.
export async function startNewFarm(ctx: Ctx, year?: number): Promise<void> {
  const app = ctx.app
  const saved = app.savedGame()?.campaign
  if (saved && saved.phase !== 'over' && saved.outcome !== 'lost') {
    const ok = await confirmPaper(ctx, {
      title: 'Start a new farm?',
      text: h('p', null, `It replaces the farm saved in this browser: ${saved.year}, ${seasonCount(saved)}, ${PHASE_LABEL[saved.phase].toLowerCase()}. Export it from the menu first if you want to keep it.`),
      yes: 'Start a new farm', no: 'Keep the farm', danger: true,
    })
    if (!ok) return
  }
  const pool = soundYears(app.world)
  ctx.papers.closeAll()
  app.newGame(year ?? pool[Math.floor(Math.random() * pool.length)])
}

// For anyone who wants a particular year. Only what a grower would know going in is shown: the year before.
function openYearPicker(ctx: Ctx): void {
  const app = ctx.app
  const years = app.startYears()
  let pick = years[Math.floor(Math.random() * years.length)]
  const gaps = years.some((y, k) => k > 0 && y !== years[k - 1] + 1)
  const confirm = h('button', { class: 'btn primary big', type: 'button', testid: 'start-confirm', onclick: () => { void startNewFarm(ctx, pick) } })
  const buttons: HTMLButtonElement[] = []
  let draw = () => {}
  ctx.papers.open({
    title: 'Choose the year',
    testid: 'new-farm-dialog',
    size: 'wide',
    foot: () => [
      h('button', { class: 'btn', type: 'button', testid: 'start-random', onclick: () => { pick = years[Math.floor(Math.random() * years.length)]; draw(); buttons.find(b => b.textContent === String(pick))?.focus() } }, 'Another year at random'),
      confirm,
    ],
    body: () => {
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
          h('span', { class: 't-label' }, `${d}s`),
          h('div', { class: 'decade-years' }, Array.from({ length: 10 }, (_, k) => {
            const y = d + k
            if (!ys.includes(y)) return h('span', { class: 'year gap' })
            const b = h('button', { class: 'year num', type: 'button', testid: `start-year-${y}`, 'aria-pressed': 'false', autofocus: y === pick, onclick: () => { pick = y; draw() } }, String(y))
            buttons.push(b)
            return b
          }))))
      }
      if (gaps) grid.append(h('p', { class: 'sub' }, 'A farm needs five seasons in a row, so a year is left out where the Caribou record has a gap within the five after it.'))
      draw = () => {
        for (const b of buttons) b.setAttribute('aria-pressed', String(b.textContent === String(pick)))
        const before = app.world.records[pick - 1]
        const last = pick + S.GOAL_YEARS - 1
        const known = before?.yieldCwtAcre != null || before?.priceUsdCwt != null
        detail.replaceChildren(
          h('h3', { class: 't-display year-big num' }, String(pick)),
          known ? h('dl', { class: 'facts', testid: 'year-before' },
            before?.yieldCwtAcre != null ? [h('dt', { class: 't-label' }, `Maine yield the year before, ${pick - 1}`), h('dd', { class: 'num' }, `${F.perArea(before.yieldCwtAcre)} (USDA)`)] : null,
            before?.priceUsdCwt != null ? [h('dt', { class: 't-label' }, `Maine price the year before, ${pick - 1}`), h('dd', { class: 'num' }, `${F.price(before.priceUsdCwt)} in ${pick - 1} dollars (USDA)`)] : null)
            : h('p', { class: 'sub', testid: 'year-before' }, `The record we hold has no Maine yield or price for ${pick - 1}, the year before.`),
          h('p', { class: 'sub' }, known && !F.metric() ? 'A cwt is a hundredweight: 100 lb of potatoes.' : ''),
          h('p', null, `Five seasons follow, ${pick} to ${last}, each on the weather recorded at Caribou that year. You will not see it coming; the forecast is all you get.`))
        confirm.textContent = `Start in ${pick}`
      }
      draw()
      return h('div', { class: 'year-cols' }, grid, detail)
    },
  })
}

export function titleScreen(ctx: Ctx, o: { onMenu: () => void; onHelp: () => void }): Screen {
  const app = ctx.app
  const block = h('div', { class: 'title-block' })
  const el = h('main', { class: 'title-screen' }, block)
  let focused = false
  return {
    el,
    update() {
      const saved = app.savedGame()
      const c = saved?.campaign
      patch(block, JSON.stringify([c?.year, c?.phase, c?.yearIdx, c?.outcome]), () => [
        h('h1', { class: 't-display title-name' }, 'The County'),
        h('p', { class: 't-lede premise' }, 'Six fields of potatoes in Aroostook County, Maine, farmed through the weather of real years, with a crop you cannot see until you dig it.'),
        h('div', { class: 'title-actions' },
          c ? h('button', { class: 'nbtn primary big', type: 'button', testid: 'continue', onclick: () => { if (!app.continueGame()) ctx.say('The save could not be read.', 'warn') } },
            'Continue', h('span', { class: 'sub num' }, `${c.year}, ${seasonCount(c)}`)) : null,
          h('button', { class: `nbtn big${c ? '' : ' primary'}`, type: 'button', testid: 'play', onclick: () => { void startNewFarm(ctx) } }, c ? 'New farm' : 'Play')),
        h('p', { class: 'title-links' },
          h('button', { class: 'tlink', type: 'button', testid: 'choose-year', onclick: () => openYearPicker(ctx) }, 'Choose the year'),
          h('button', { class: 'tlink', type: 'button', testid: 'how-open', onclick: () => o.onHelp() }, 'How to play'),
          h('button', { class: 'tlink', type: 'button', testid: 'menu-open', onclick: () => o.onMenu() }, 'Settings')),
      ])
      // Play is under the keyboard from the start; the focus is tried again until the land is up and it takes.
      if (!focused && !ctx.papers.isOpen()) {
        const play = block.querySelector<HTMLElement>('.nbtn.primary')
        play?.focus({ preventScroll: true })
        focused = document.activeElement === play
        if (!focused) setTimeout(() => ctx.dirty(), 200)
      }
    },
    insets() {
      const r = block.getBoundingClientRect()
      return [0, 0, Math.max(0, innerHeight - r.top), 0]
    },
  }
}
