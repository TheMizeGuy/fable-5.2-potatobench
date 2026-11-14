// The opening (design/title.html): the farm almanac's cover over the land, a third of the frame, with the menu set
// as its contents and the benchmark's credit printed as its imprint.
import cut from '../../design/src/cut.svg?raw'
import { confirmPaper, patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import { seasonCount } from './rules.ts'
import { PHASE_LABEL } from './top.ts'
import { guidedFarm, startedFarm, straightIn } from './tutorial.ts'
import './title.css'
import { toScreen } from './scale.ts'

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
  if (guided) { guidedFarm(); straightIn(ctx) }
  else startedFarm(app.campaign.seed)
}

let entered = false

function engraving(): HTMLElement {
  const box = h('span', { class: 'cv-plate' })
  box.innerHTML = cut
  return box
}

export function titleScreen(ctx: Ctx, o: { onMenu: () => void; onHelp: () => void }): Screen {
  const app = ctx.app
  const menu = h('nav', { class: 'cv-menu', 'aria-label': 'The County' })
  const cover = h('section', { class: 'cover sheet sys', 'aria-label': 'The County' },
    h('p', { class: 'cv-top', 'aria-hidden': 'true' }, h('span', null, 'Potato farming'), h('i', { class: 'orn' }), h('span', null, 'Northern Maine')),
    h('h1', { class: 'cv-name title-name' }, h('span', { class: 'the' }, 'The'), h('span', { class: 'county' }, 'County')),
    h('hr', { class: 'rule oxford' }),
    h('figure', { class: 'cv-cut' }, engraving(),
      h('p', null, 'Run a potato farm in northern Maine. Plant your fields, hire a crew, sell the harvest, and keep the farm going for five years.'),
      h('figcaption', { class: 'it' }, 'Fig. 1. A potato plant.')),
    menu,
    h('footer', { class: 'imprint', testid: 'credit' },
      h('p', { class: 'a' }, 'Fable 5.2 - PotatoBench'),
      h('p', { class: 'b' }, 'PotatoBench made by TheMizeGuy')))
  // The frame's dressing: bars, a little dark at its corners and behind the name, and the black the first frame comes
  // up out of. All of it lies under the name and the menu and takes no press. The picture itself is left clean.
  const barT = h('div', { class: 'cine-bar t' }), barB = h('div', { class: 'cine-bar b' })
  const el = h('main', { class: 'title-screen cine sys' }, h('div', { class: 'title-shade' }), h('div', { class: 'cine-vignette' }),
    barT, barB, cover, h('p', { class: 'cine-hint', 'aria-hidden': 'true' }, 'Enter to play'), h('div', { class: 'cine-fade' }))
  // The entrance plays once a visit, the first time the landing is shown.
  if (!entered) {
    entered = true
    const go = () => { el.classList.remove('await'); el.classList.add('intro'); setTimeout(() => el.classList.remove('intro'), 4200) }
    // It waits for the loading page to lift, so the name is set over the land and not behind the page that hid it.
    const splash = document.getElementById('splash')
    if (splash && !splash.classList.contains('gone')) {
      el.classList.add('await')
      const seen = new MutationObserver(() => { if (splash.classList.contains('gone') || !splash.isConnected) { seen.disconnect(); go() } })
      seen.observe(splash, { attributes: true, attributeFilter: ['class'] })
      if (splash.parentNode) seen.observe(splash.parentNode, { childList: true })
    } else go()
  }
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
      // (under the bars the picture is composed between them, to the right of the name)
      return r.width > innerWidth * 0.7 ? [0, 0, Math.max(0, innerHeight - r.top), 0] : [toScreen(barT.offsetHeight), 0, toScreen(barB.offsetHeight), Math.max(0, r.right)]
    },
  }
}
