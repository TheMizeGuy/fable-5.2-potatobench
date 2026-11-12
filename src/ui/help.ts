// How to play, on one screen: three pictures and three verbs, the year in a line, and the keys folded away.
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h, kbd } from './dom.ts'
import { icon } from './icons.ts'
import { JOB_KEY, JOB_VERB, orderHelp } from './rules.ts'

const REPO = 'https://github.com/TheMizeGuy/fable-5.2-potatobench'

// The three steps, each drawn with the instrument it is about.
function steps(touch: boolean): HTMLElement {
  const pic = (...kids: (HTMLElement | SVGElement)[]) => h('div', { class: 'how-pic instrument', 'aria-hidden': 'true' }, kids)
  const plate = (name: string, glyph: string, on = false) => h('span', { class: `plate${on ? ' on' : ''}` }, h('span', { class: 'plate-in' }, icon(glyph, 'ic s plate-glyph'), h('span', { class: 'plate-name' }, name)))
  return h('ol', { class: 'how-steps' },
    h('li', null,
      pic(plate('North Ridge', 'leaf', true), h('span', { class: 'how-cursor' }, icon('first', 'ic s'))),
      h('h3', { class: 't-head' }, h('span', { class: 'how-n' }, '1'), 'Select'),
      h('p', null, touch ? 'Tap a field. Its card shows how it is doing.' : 'Click a field. Its card shows how it is doing.')),
    h('li', null,
      pic(h('span', { class: 'plate-wrap-pic' }, plate('Upper Middle', 'leaf'), h('span', { class: 'badge' }, icon('hill')))),
      h('h3', { class: 't-head' }, h('span', { class: 'how-n' }, '2'), 'Order'),
      h('p', null, touch ? 'Tap the lit badge: it gives the order the field needs. Or pick one on the card.' : 'Click the lit badge, or right-click the field: it gives the order the field needs.')),
    h('li', null,
      pic(h('span', { class: 'clock' }, h('span', { class: 'nicon' }, icon('pause')), h('span', { class: 'nicon speed-x num', 'aria-pressed': 'true' }, '1×'), h('span', { class: 'nicon speed-x num' }, '2×'), h('span', { class: 'nicon speed-x num' }, '3×'))),
      h('h3', { class: 't-head' }, h('span', { class: 'how-n' }, '3'), 'Set the pace'),
      h('p', null, touch ? 'The days run at the speed you set. A card that needs an answer stops them.' : 'The days run at the speed you set. A card that needs an answer stops them. Space pauses.')))
}

const YEAR: [string, string, string][] = [
  ['planted', 'Spring', 'Plan the fields; hire, rent and sign if you like.'],
  ['bloom', 'Season', 'Plant, hill, spray, dig.'],
  ['ticket', 'Dig day', 'The weigh ticket: sell or store.'],
  ['sprout', 'Winter', 'Sell from the cellar; fell and build.'],
  ['bank', 'Year end', 'The bank wants its note.'],
]

export function openHelp(ctx: Ctx): void {
  const touch = ctx.touch()
  const row = (keys: (string | HTMLElement)[], what: string) => h('tr', null, h('th', { scope: 'row' }, keys), h('td', null, what))
  const k = (...names: string[]) => names.map(n => kbd(n))
  let more = false
  ctx.papers.open({
    title: 'How to play',
    testid: 'how',
    size: 'wide',
    cls: 'help',
    body: () => {
      const box = h('div', { class: 'how-more-box' })
      const toggle = h('button', { class: 'fold-row how-more', type: 'button', testid: 'how-keys', 'aria-expanded': 'false' },
        icon('almanac', 'ic fold-ic'), h('span', { class: 'fold-name' }, touch ? 'Every order' : 'Every key and order'), h('span', { class: 'fold-state' }, 'for when you want them'), h('span', null), icon('next', 'ic s fold-chev'))
      const draw = () => {
        toggle.setAttribute('aria-expanded', String(more))
        toggle.querySelector('.fold-chev')?.replaceWith(icon(more ? 'up' : 'next', 'ic s fold-chev'))
        box.replaceChildren(...(more ? [h('div', { class: 'help-cols' },
          touch ? null : h('section', null,
            h('h3', { class: 'block-head' }, 'Keys'),
            h('table', { class: 'keys' }, h('tbody', null,
              row(k('1', '–', '9', '0'), 'Select one of the first ten fields. With Shift, add it.'),
              row(k('Tab'), 'The next field that needs something.'),
              row(k('Enter'), 'Give the selection the order it needs.'),
              row(k('Space', 'F', '+', '−'), 'Pause and go on; step through 1×, 2×, 3×; faster; slower.'),
              row(k('Backspace'), 'Take the last order off the list.'),
              row(k('I', 'M', 'Esc'), 'The almanac; the menu; let go.'),
              row(k('Arrows', 'Q', 'E', 'Home'), 'Move, turn, and frame the farm.'),
              row(['Drag, wheel, right-drag'], 'Move over the land, zoom, turn.')))),
          h('section', null,
            h('h3', { class: 'block-head' }, 'The orders'),
            h('table', { class: 'orders-help' }, h('tbody', null, S.JOBS.map(kind => h('tr', null,
              h('th', { scope: 'row' }, icon(kind), h('span', null, JOB_VERB[kind]), touch || !JOB_KEY[kind] ? null : kbd(JOB_KEY[kind])),
              h('td', null, orderHelp(kind)))))))),
        ] : []))
      }
      toggle.addEventListener('click', () => { more = !more; draw() })
      draw()
      return [
        h('p', { class: 't-lede help-lede' }, 'The crop grows where you cannot see it. Give the orders, let the days run, and dig day tells the truth. Keep the farm five seasons and it is yours.'),
        steps(touch),
        h('ol', { class: 'how-year', 'aria-label': 'A year on the farm' }, YEAR.map(([glyph, name, what]) => h('li', null,
          icon(glyph, 'ic s'), h('strong', null, name), h('span', null, what)))),
        h('p', { class: 'sub how-grow' }, 'As the farm grows, people ask for work, land comes up for rent and sale, woods wait to be cleared and barns to be raised. Each shows itself when you can use it.'),
        toggle,
        box,
        h('p', { class: 'sub help-foot' }, 'Every farm gets seasons of its own, and the forecast is all you see of them ahead. ',
          h('a', { class: 'link', href: REPO, target: '_blank', rel: 'noopener' }, 'The County on GitHub'), '.'),
      ]
    },
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'how-close', autofocus: true, onclick: close }, ctx.app.screen === 'title' ? 'Back' : 'Back to the farm'),
  })
}
