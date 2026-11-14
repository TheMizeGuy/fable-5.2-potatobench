// How to play (design/howto.html), from the almanac: three pictures made of the interface's own pieces (a field's tag,
// a need's stamp, the clock's keys) and three verbs, the code of the stamps, the year in a line, and the keys folded.
import { SPEED_X } from '../game/app.ts'
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import { JOB_KEY, JOB_VERB, orderHelp } from './rules.ts'
import { fist, key, tag } from './system/parts.ts'
import { openGuide } from './tutorial.ts'

const REPO = 'https://github.com/TheMizeGuy/fable-5.2-potatobench'

// The pictures are the land's own tag, stamp and clock, held still: inert, so nothing in them takes a click or the focus.
function figs(touch: boolean): HTMLElement {
  const fig = (n: number, pic: HTMLElement, title: string, text: string) => h('div', { class: 'fig' },
    h('div', { class: 'plate-area', 'aria-hidden': 'true', inert: true }, pic),
    h('h3', null, h('span', { class: 'n' }, String(n)), title),
    h('p', null, text))
  const spray = h('span', { class: 'need ochre is-next' }, icon('spray'))
  return h('div', { class: 'figs' },
    fig(1, tag({ name: 'North Ridge', icon: 'bloom', selected: true, still: true }), 'Pick a field', touch ? 'Tap a field or its tag, and a card opens showing what it needs.' : 'Click a field or its tag, and a card opens showing what it needs.'),
    fig(2, tag({ name: 'Upper Middle', icon: 'bloom', need: spray, still: true }), 'Give an order', touch ? 'Tap the stamp to order the job the field needs.' : 'Click the stamp or right-click the field to order the job it needs.'),
    fig(3, h('div', { class: 'clock' }, h('span', { class: 'k' }, icon('pause', 'i')), h('span', { class: 'k', 'aria-pressed': 'true' }, SPEED_X[1]), h('span', { class: 'k' }, SPEED_X[2]), h('span', { class: 'k' }, SPEED_X[3])),
      'Let time pass', touch ? 'Time runs at the speed you pick, and the game pauses when something needs you.' : 'Time runs at the speed you pick, and the game pauses when something needs you. Press Space to pause it yourself.'))
}

export const CODE: [string, string, string, string][] = [
  ['red', 'rogue', 'Red', 'blight or a loss, so act now.'],
  ['ochre', 'spray', 'Yellow', 'the next thing to do.'],
  ['blue', 'water', 'Blue', 'the field is drying out.'],
  ['', 'hill', 'Black', 'work that\'s due.'],
]

const YEAR: [string, string][] = [
  ['Spring', 'Plan your fields, and hire or rent if you like.'],
  ['The season', 'Plant, hill, scout, spray, dig.'],
  ['Harvest', 'Read the weigh ticket, then deliver, sell or store.'],
  ['Winter', 'Sell from the cellar, clear woods and build.'],
  ['Year end', 'Your yearly bank payment is due.'],
]

export function openHelp(ctx: Ctx): void {
  const touch = ctx.touch()
  const keys = (...names: string[]) => names.map(n => key(n))
  const row = (ks: (string | HTMLElement)[], what: string) => h('tr', null, h('th', { scope: 'row' }, ks), h('td', null, what))
  let more = false
  ctx.papers.open({
    title: 'How to play',
    testid: 'how',
    plain: true,
    cls: 'how-dialog',
    body: close => {
      const box = h('div', { class: 'keys-box' })
      const chev = h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')
      const toggle = h('button', { class: 'keys-fold', type: 'button', testid: 'how-keys', 'aria-expanded': 'false', onclick: () => { more = !more; draw() } },
        icon('key', 'i'), h('b', null, touch ? 'Every order' : 'Every key and order'), h('span', { class: 'quiet' }, 'for when you need them'), chev)
      const draw = () => {
        toggle.setAttribute('aria-expanded', String(more))
        chev.textContent = '›'
        box.replaceChildren(...(more ? [h('div', { class: 'keys-cols' },
          touch ? null : h('section', null,
            h('p', { class: 't-label' }, 'Keys'),
            h('table', { class: 'keys-t' }, h('tbody', null,
              row(keys('1', '–', '9', '0'), 'Select one of your first ten fields. Hold Shift to add it to the selection.'),
              row(keys('Tab'), 'Jump to the next field that needs something.'),
              row(keys('Enter'), 'Order what the selected field needs.'),
              row(keys('Space', 'F', '+', '−'), `Pause or resume, cycle through ${SPEED_X[1]}, ${SPEED_X[2]} and ${SPEED_X[3]}, speed up, and slow down.`),
              row(keys('Backspace'), 'Cancel the last order on the work list.'),
              row(keys('I', 'M', 'Esc'), 'Open the almanac, open the menu, and close or deselect.'),
              row(keys('Arrows', 'Q', 'E', 'Home'), 'Move the view, rotate it, and center the farm.'),
              row(keys('PgDn', 'PgUp'), 'Tilt the view down toward the ground, and back up.'),
              row(['Drag, wheel, right-drag'], 'Drag to move, scroll to zoom, and right-drag to rotate (sideways) or tilt (up and down).')))),
          h('section', null,
            h('p', { class: 't-label' }, 'Orders'),
            h('table', { class: 'keys-t' }, h('tbody', null, S.JOBS.map(kind => h('tr', null,
              h('th', { scope: 'row' }, h('span', { class: 'order-k' }, touch || !JOB_KEY[kind] ? null : key(JOB_KEY[kind]), icon(kind, 'i'), h('b', null, JOB_VERB[kind]))),
              h('td', null, orderHelp(kind)))))))),
        ] : []))
      }
      draw()
      return h('section', { class: 'howto sheet sys' },
        h('header', { class: 'howto-head' },
          h('div', null, h('p', { class: 't-label' }, 'From the almanac'), h('p', { class: 't-title', 'aria-hidden': 'true' }, 'How to play')),
          h('button', { class: 'close', type: 'button', testid: 'how-close', autofocus: true, 'aria-label': ctx.app.screen === 'title' ? 'Back (Escape)' : 'Back to the farm (Escape)', onclick: close }, icon('close', 'i'))),
        h('p', { class: 'howto-lead' }, 'Plant potatoes, give your crew orders, and sell the harvest. Test digs show how the crop is doing. Keep the farm going for five years.'),
        figs(touch),
        h('div', { class: 'code-row' }, CODE.map(([ink, glyph, word, what]) => h('div', null,
          h('span', { class: `need${ink ? ` ${ink}` : ''}`, 'aria-hidden': 'true' }, icon(glyph)), h('p', null, h('b', null, word), `: ${what}`)))),
        h('div', { class: 'year-row' }, YEAR.map(([b, t]) => h('div', null, h('b', null, b), t))),
        toggle, box,
        h('button', { class: 'keys-fold how-guide', type: 'button', testid: 'how-guide', onclick: () => openGuide(ctx) },
          fist(), h('b', null, 'Guided first year'), h('span', { class: 'quiet' }, 'replay any tutorial lesson'), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')),
        h('p', { class: 't-caption howto-foot' }, 'Every farm gets its own weather, and the forecast is all you\'ll see of what\'s coming. ',
          h('a', { class: 'btn quiet', href: REPO, target: '_blank', rel: 'noopener' }, 'The County on GitHub'), '.'))
    },
  })
}
