// The opening (design/title.html): the farm almanac's cover over the land, a third of the frame, with the menu set
// as its contents and the benchmark's credit printed as its imprint.
import cut from '../../design/src/cut.svg?raw'
import { confirmPaper, patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import { seasonCount } from './rules.ts'
import { PHASE_LABEL } from './top.ts'
import { guidedFarm, startedFarm } from './tutorial.ts'

// Starts a farm of its own, with seasons made for it. A farm still in play is not replaced unasked.
export async function startNewFarm(ctx: Ctx, guided = false): Promise<void> {
  const app = ctx.app
  const saved = app.savedGame()?.campaign
  if (saved && saved.phase !== 'over' && saved.outcome !== 'lost') {
    const ok = await confirmPaper(ctx, {
      title: 'Start a new farm?',
      text: h('p', null, `This replaces the farm saved in this browser (${seasonCount(saved)}, ${PHASE_LABEL[saved.phase].toLowerCase()}). Save a copy from the menu first if you want to keep it.`),
      yes: 'Start a new farm', no: 'Keep this farm', danger: true,
    })
    if (!ok) return
  }
  ctx.papers.closeAll()
  app.newGame()
  if (!app.campaign) return
  if (guided) guidedFarm()
  else startedFarm(app.campaign.seed)
}

function engraving(): HTMLElement {
  const box = h('span', { class: 'cv-plate' })
  box.innerHTML = cut
  return box
}

export function titleScreen(ctx: Ctx, o: { onMenu: () => void; onHelp: () => void }): Screen {
  const app = ctx.app
  const menu = h('nav', { class: 'cv-menu', 'aria-label': 'The County' })
  const cover = h('section', { class: 'cover sheet sys', 'aria-label': 'The County' },
    h('p', { class: 'cv-top', 'aria-hidden': 'true' }, h('span', null, 'Potatoes'), h('i', { class: 'orn' }), h('span', null, 'Five seasons')),
    h('h1', { class: 'cv-name title-name' }, h('span', { class: 'the' }, 'The'), h('span', { class: 'county' }, 'County')),
    h('hr', { class: 'rule oxford' }),
    h('figure', { class: 'cv-cut' }, engraving(),
      h('p', null, 'Grow a crop you can\'t see until you dig it up. Hire help, clear woods, raise barns, and keep the farm for five years.'),
      h('figcaption', { class: 'it' }, 'Fig. 1. The crop you can\'t see until you dig it up.')),
    menu,
    h('footer', { class: 'imprint', testid: 'credit' },
      h('p', { class: 'a' }, 'Fable 5.2 - PotatoBench'),
      h('p', { class: 'b' }, 'PotatoBench made by TheMizeGuy')))
  const el = h('main', { class: 'title-screen sys' }, h('div', { class: 'title-shade' }), cover)
  let focused = false
  return {
    el,
    update() {
      const c = app.savedGame()?.campaign
      const layout = ctx.layout()
      el.dataset.layout = layout
      patch(menu, JSON.stringify([c?.year, c?.phase, c?.yearIdx, c?.outcome]), () => [
        h('p', { class: 't-label' }, 'Contents'),
        // The strong action is the one most players want: go on with the farm they have, or start one.
        c ? h('button', { class: 'btn go wide', type: 'button', testid: 'continue', onclick: () => { if (!app.continueGame()) ctx.say('The saved farm couldn\'t be loaded. Start a new farm to play.', 'warn') } },
          h('span', null, 'Continue', h('span', { class: 'sub-go' }, `${seasonCount(c)}, ${PHASE_LABEL[c.phase].toLowerCase()}`)), icon('arrow', 'i'))
          : h('button', { class: 'btn go wide', type: 'button', testid: 'play', onclick: () => { void startNewFarm(ctx) } }, 'Play', icon('arrow', 'i')),
        c ? h('button', { class: 'cv-item lead', type: 'button', testid: 'play', onclick: () => { void startNewFarm(ctx) } },
          h('b', null, 'New farm'), h('span', { class: 'dots' }), h('span', { class: 'it quiet' }, 'from the first spring')) : null,
        h('button', { class: 'cv-item lead', type: 'button', testid: 'play-guided', onclick: () => { void startNewFarm(ctx, true) } },
          h('b', null, 'Guided first year'), h('span', { class: 'dots' }), h('span', { class: 'it quiet' }, 'a new farm with a tutorial')),
        h('button', { class: 'cv-item lead', type: 'button', testid: 'how-open', onclick: () => o.onHelp() }, h('b', null, 'How to play'), h('span', { class: 'dots' }), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')),
        h('button', { class: 'cv-item lead', type: 'button', testid: 'menu-open', onclick: () => o.onMenu() }, h('b', null, 'Settings'), h('span', { class: 'dots' }), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')),
      ])
      // The strong action is under the keyboard from the start; the focus is tried again until the land is up and it takes.
      if (!focused && !ctx.papers.isOpen()) {
        const go = menu.querySelector<HTMLElement>('.btn.go')
        go?.focus({ preventScroll: true })
        focused = document.activeElement === go
        if (!focused) setTimeout(() => ctx.dirty(), 200)
      }
    },
    insets() {
      // The cover takes the left of the frame; on a phone, the whole of it but the sky above.
      const r = cover.getBoundingClientRect()
      return r.width > innerWidth * 0.7 ? [0, 0, Math.max(0, innerHeight - r.top), 0] : [0, 0, 0, Math.max(0, r.right)]
    },
  }
}
