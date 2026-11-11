// How to play, on one screen: the controls and the nine orders.
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h, kbd } from './dom.ts'
import { icon } from './icons.ts'
import { JOB_KEY, JOB_VERB, jobWhat, jobWhen } from './rules.ts'

const REPO = 'https://github.com/TheMizeGuy/the-county'

export function openHelp(ctx: Ctx): void {
  const touch = ctx.touch()
  const row = (keys: (string | HTMLElement)[], what: string) => h('tr', null, h('th', { scope: 'row' }, keys), h('td', null, what))
  const k = (...names: string[]) => names.map(n => kbd(n))
  const land = touch ? [
    row(['Tap a field or its plate'], 'Select it. The card at the bottom shows what is known and the orders it can take.'),
    row(['Tap a badge'], 'Give the field the order it needs now.'),
    row(['Press and hold a field'], 'The same: the order it needs.'),
    row(['Drag, pinch, twist'], 'Move over the land, zoom, and turn the view.'),
    row(['Tap an order on the crew’s list'], 'Do it first, or cancel it.'),
  ] : [
    row(['Click a field or its plate'], 'Select it. Shift-click adds a field; double-click takes every field in the same state.'),
    row(['Click a badge'], 'Give the field the order it needs now. A right-click on the field does the same.'),
    row(['Drag, wheel, right-drag'], 'Move over the land, zoom, and turn the view.'),
    row(['Click an order on the crew’s list'], 'Cancel it. Ctrl-click does it first.'),
  ]
  const keys = touch ? [] : [
    row(k('1', '–', '6'), 'Select a field. With Shift, add it.'),
    row(k('Tab'), 'The next field that needs something.'),
    row(k('Enter'), 'Give the selection the order it needs.'),
    row(k('P', 'H', 'C', 'S', 'W', 'R', 'T', 'K', 'D'), 'An order for the selection. With Shift, it goes first.'),
    row(k('Backspace'), 'Take the last order off the list.'),
    row(k('Space'), 'Pause, or run.'),
    row(k('+', '−'), 'Faster, slower.'),
    row(k('F'), 'Run until something needs you.'),
    row(k('I'), 'The almanac: forecast, blight watch, readings, diary, prices.'),
    row(k('M'), 'This menu. Escape clears the selection first.'),
    row(k('Arrows', 'Q', 'E', 'Home'), 'Move, turn, and frame the whole farm.'),
  ]
  ctx.papers.open({
    title: 'How to play',
    testid: 'how',
    size: 'wide',
    cls: 'help',
    body: () => [
      h('p', { class: 't-lede help-lede' }, 'The crop grows underground, where you cannot see it. You give the orders, the crew works them a day at a time, and dig day tells the truth. Keep the farm for five seasons and it is yours.'),
      h('div', { class: 'help-cols' },
        h('section', null,
          h('h3', { class: 'block-head' }, 'The controls'),
          h('table', { class: 'keys' }, h('tbody', null, land, keys))),
        h('section', null,
          h('h3', { class: 'block-head' }, 'The nine orders'),
          h('table', { class: 'orders-help' }, h('tbody', null, S.JOBS.map(kind => h('tr', null,
            h('th', { scope: 'row' }, icon(kind), h('span', null, JOB_VERB[kind]), touch ? null : kbd(JOB_KEY[kind])),
            h('td', null, jobWhat(kind), ' ', h('span', { class: 'sub' }, jobWhen(kind))))))))),
      h('p', { class: 'sub help-foot' },
        'Every season is a real year, on the weather NOAA recorded at Caribou, Maine. Yields and prices are USDA\'s. Each rule and its source is in the ',
        h('a', { class: 'link', href: `${REPO}/blob/main/docs/MODEL.md`, target: '_blank', rel: 'noopener' }, 'model notes'), '.'),
    ],
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'how-close', autofocus: true, onclick: close }, ctx.app.screen === 'title' ? 'Back' : 'Back to the farm'),
  })
}
