// The opening: the land, the name, one line, Play.
import { confirmPaper, patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import { seasonCount } from './rules.ts'
import { PHASE_LABEL } from './top.ts'

// Starts a farm of its own, with seasons made for it. A farm still in play is not replaced unasked.
export async function startNewFarm(ctx: Ctx): Promise<void> {
  const app = ctx.app
  const saved = app.savedGame()?.campaign
  if (saved && saved.phase !== 'over' && saved.outcome !== 'lost') {
    const ok = await confirmPaper(ctx, {
      title: 'Start a new farm?',
      text: h('p', null, `It replaces the farm saved in this browser: ${seasonCount(saved)}, ${PHASE_LABEL[saved.phase].toLowerCase()}. Export it from the menu first if you want to keep it.`),
      yes: 'Start a new farm', no: 'Keep the farm', danger: true,
    })
    if (!ok) return
  }
  ctx.papers.closeAll()
  app.newGame()
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
        h('p', { class: 't-lede premise' }, 'Six fields of potatoes to start and more to rent or buy, five seasons of weather nobody can know, and a crop you cannot see until you dig it.'),
        h('div', { class: 'title-actions' },
          c ? h('button', { class: 'nbtn primary big', type: 'button', testid: 'continue', onclick: () => { if (!app.continueGame()) ctx.say('The save could not be read.', 'warn') } },
            'Continue', h('span', { class: 'sub num' }, seasonCount(c))) : null,
          h('button', { class: `nbtn big${c ? '' : ' primary'}`, type: 'button', testid: 'play', onclick: () => { void startNewFarm(ctx) } }, c ? 'New farm' : 'Play')),
        h('p', { class: 'title-links' },
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
