// How to play (design/howto.html), from the almanac: three pictures made of the interface's own pieces (a field's tag,
// a need's stamp, the clock's keys) and three verbs, the code of the stamps, the year in a line, and the keys folded.
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import { JOB_KEY, JOB_VERB, orderHelp } from './rules.ts'
import { key, tag } from './system/parts.ts'

const REPO = 'https://github.com/TheMizeGuy/fable-5.2-potatobench'

// The pictures are the land's own tag, stamp and clock, held still: inert, so nothing in them takes a click or the focus.
function figs(touch: boolean): HTMLElement {
  const fig = (n: number, pic: HTMLElement, title: string, text: string) => h('div', { class: 'fig' },
    h('div', { class: 'plate-area', 'aria-hidden': 'true', inert: true }, pic),
    h('h3', null, h('span', { class: 'n' }, String(n)), title),
    h('p', null, text))
  const spray = h('span', { class: 'need ochre is-next' }, icon('spray'))
  return h('div', { class: 'figs' },
    fig(1, tag({ name: 'North Ridge', icon: 'bloom', selected: true, still: true }), 'Pick a field', touch ? 'Tap its tag, or the field. Its card opens with what it needs.' : 'Click its tag, or the field. Its card opens at the right with what it needs.'),
    fig(2, tag({ name: 'Upper Middle', icon: 'bloom', need: spray, still: true }), 'Give the order', touch ? 'Tap the stamp: it gives the order the field needs.' : 'Click the stamp, or right-click the field: it gives the order the field needs.'),
    fig(3, h('div', { class: 'clock' }, h('span', { class: 'k' }, icon('pause', 'i')), h('span', { class: 'k', 'aria-pressed': 'true' }, '1×'), h('span', { class: 'k' }, '2×'), h('span', { class: 'k' }, '3×')),
      'Let the days run', touch ? 'The days run at the speed you set, and stop when a card needs you.' : 'The days run at the speed you set, and stop when a card needs you. Space pauses.'))
}

const CODE: [string, string, string, string][] = [
  ['red', 'rogue', 'Red', 'blight or a loss. Act now.'],
  ['ochre', 'spray', 'Ochre', 'the next thing to do.'],
  ['blue', 'water', 'Blue', 'the field is drying out.'],
  ['', 'hill', 'Black', 'work that is due.'],
]

const YEAR: [string, string][] = [
  ['Spring', 'Plan the fields, hire, rent if you like.'],
  ['The season', 'Plant, hill, scout, spray, dig.'],
  ['Dig day', 'The weigh ticket: deliver, sell or store.'],
  ['Winter', 'Sell from the cellar; fell and build.'],
  ['Year end', 'The bank wants its note.'],
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
        icon('key', 'i'), h('b', null, touch ? 'Every order' : 'Every key and order'), h('span', { class: 'quiet' }, 'for when you want them'), chev)
      const draw = () => {
        toggle.setAttribute('aria-expanded', String(more))
        chev.textContent = '›'
        box.replaceChildren(...(more ? [h('div', { class: 'keys-cols' },
          touch ? null : h('section', null,
            h('p', { class: 't-label' }, 'Keys'),
            h('table', { class: 'keys-t' }, h('tbody', null,
              row(keys('1', '–', '9', '0'), 'Select one of the first ten fields. With Shift, add it.'),
              row(keys('Tab'), 'The next field that needs something.'),
              row(keys('Enter'), 'Give the selection the order it needs.'),
              row(keys('Space', 'F', '+', '−'), 'Pause and go on; step through 1×, 2×, 3×; faster; slower.'),
              row(keys('Backspace'), 'Take the last order off the list.'),
              row(keys('I', 'M', 'Esc'), 'The almanac; the menu; let go.'),
              row(keys('Arrows', 'Q', 'E', 'Home'), 'Move, turn, and frame the farm.'),
              row(keys('PgDn', 'PgUp'), 'Tip the view down toward the ground, and back up.'),
              row(['Drag, wheel, right-drag'], 'Move over the land, zoom; turn (sideways) and tip (up and down).')))),
          h('section', null,
            h('p', { class: 't-label' }, 'The orders'),
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
        h('p', { class: 'howto-lead' }, 'The crop grows where you cannot see it. Give the orders, let the days run, and dig day tells the truth. Keep the farm five seasons and it is yours.'),
        figs(touch),
        h('div', { class: 'code-row' }, CODE.map(([ink, glyph, word, what]) => h('div', null,
          h('span', { class: `need${ink ? ` ${ink}` : ''}`, 'aria-hidden': 'true' }, icon(glyph)), h('p', null, h('b', null, word), `: ${what}`)))),
        h('div', { class: 'year-row' }, YEAR.map(([b, t]) => h('div', null, h('b', null, b), t))),
        toggle, box,
        h('p', { class: 't-caption howto-foot' }, 'Every farm gets seasons of its own, and the forecast is all you see of them ahead. ',
          h('a', { class: 'btn quiet', href: REPO, target: '_blank', rel: 'noopener' }, 'The County on GitHub'), '.'))
    },
  })
}
