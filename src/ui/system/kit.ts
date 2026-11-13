// The living kit (the game opened with ?kit): every component of the system in every state, drawn with the same
// helpers the screens use, beside the specimen it must match (design/kit.sheet.html). The page the screen writers
// and the checks look at.
import './system.css'
import './game.css'
import './weight.css'
import { personLook, type PortraitCut } from '../../game/looks.ts'
import { h, type Child } from '../dom.ts'
import { icon, ICON_NAMES, mountSprites } from '../icons.ts'
import { coupon, fist, fold, key, meter, need, order, range, slip, stamp, tag, tens, tip } from './parts.ts'
import { pin, portrait } from './people.ts'

const sec = (n: string, title: string, note: string, ...kids: Child[]) =>
  h('section', { class: 'k-sec sheet', 'aria-labelledby': `k-${n}` }, h('h2', { class: 'k-h', id: `k-${n}` }, h('span', { class: 'k-n' }, n), title, note ? h('span', { class: 'k-note' }, note) : null), kids)
const lab = (t: string) => h('span', { class: 'k-lab' }, t)
const state = (l: string, el: Child) => h('div', null, lab(l), el)

const STOCKS: [string, string, string, string][] = [
  ['Paper', '--paper', '#f6f1e4', 'every sheet, card and instrument'], ['Paper, ruled', '--paper-2', '#efe7d2', 'a cell, a stub, a pressed key'],
  ['Manila', '--manila', '#d8c08e', 'tags on the land, the menu key'], ['Buff', '--buff', '#e7d7a8', 'the weigh ticket'],
  ['Canary', '--canary', '#f3dc6a', 'the goal slip, and nothing else'], ['Telegraph', '', '#efe3bf', 'a decision from outside the farm'],
]
const INKS: [string, string, string, string][] = [
  ['Ink', '--ink', 'everything printed', '15.1 · 11.9 · 12.4'], ['Second ink', '--ink-2', 'captions; never under 13 px', '8.3 · 6.6 · 6.8'],
  ['Red', '--red', 'blight, loss, danger, money out', '6.4 · 5.1 · 5.2'], ['Ochre fill', '--st-ochre', 'the suggested next thing; ink on it 7.7', 'fill only'],
  ['Blue', '--blue', 'water; the focus ring', '7.3 · 5.8 · 5.9'], ['Violet', '--violet', 'what a machine or a clerk stamped', '8.0 · 6.3 · 6.5'],
  ['Green', '--green', 'the seed company’s second colour; a best skill', '7.5 · 5.9 · 6.1'], ['Pencil', '--pencil', 'what the player did or chose', '6.4 · 5.1 · 5.3'],
  ['Keyline', '--edge', 'round every sheet, tag and stamp: 8.1 on snow', 'edges'],
]
const SKIES: [string, string][] = [['July', '#4f7a34'], ['Snow', '#e2e5e8'], ['Night', '#3a4a6a']]
const CUTS: [PortraitCut, string][] = [['farmer', 'You'], ['cap-moustache', 'Normand Nadeau'], ['felt-beard', 'Alcide Theriault'], ['kerchief', 'Verna Bubar'], ['curls', 'Lucien'], ['cap-glasses', 'Wendell']]

// One paper with every weight on it in every state, beside what is only read. The words are specimens.
type KeyState = [label: string, cls: string, more?: { disabled?: boolean; pressed?: boolean; title?: string }]
const REST: KeyState[] = [['rest', ''], ['hover', 'is-hover'], ['pressed', 'is-pressed'], ['focused', 'is-focus']]
const OFF: KeyState = ['greyed, says why', '', { disabled: true, title: 'Not enough cash: $18,271' }]
const BUSY: KeyState = ['busy', 'is-busy']
function keyOf(w: 'major' | 'std' | 'minor', cls: string, st: KeyState, kids: Child[]): HTMLElement {
  const [label, more, o] = st
  return state(label, h('button', { class: `${cls}${more ? ` ${more}` : ''}`, type: 'button', 'data-w': w, disabled: o?.disabled, title: o?.title, 'aria-pressed': o?.pressed ? 'true' : null }, kids))
}
function weights(name: string, cls: string): HTMLElement {
  const row = (...kids: Child[]) => h('div', { class: 'row' }, kids)
  return h('figure', { class: `k-paper sheet ${cls}` },
    h('figcaption', { class: 't-label' }, name),
    lab('major, filled: the one the game would press'),
    row([...REST, BUSY].map(st => keyOf('major', 'btn go', st, ['Sell now', h('span', { class: 'sub num' }, '$18,271 today')]))),
    lab('major: money, time, or it cannot be taken back'),
    row([...REST, OFF].map(st => keyOf('major', 'btn', st, ['Store it', h('span', { class: 'sub num' }, '$310 a month')]))),
    lab('major, destroying: striped, and it asks once more'),
    row([REST[0], REST[1], REST[2]].map(st => keyOf('major', 'btn hazard', st, [icon('letgo', 'i'), 'Let go', h('span', { class: 'sub' }, 'today')]))),
    lab('standard: a plain key, its cost small at the side'),
    row([...REST, BUSY, OFF].map(st => keyOf('std', 'btn', st, [icon('scout', 'i'), 'Follow']))),
    row(keyOf('std', 'btn', ['on, chosen', '', { pressed: true }], [icon('scout', 'i'), 'Following']),
      keyOf('std', 'btn is-suggested', ['suggested', ''], [fist(), 'Spray', h('span', { class: 'sub num' }, '$110')]),
      keyOf('std', 'btn', ['with its cost', ''], ['Sell 2', h('span', { class: 'sub num' }, '$180')])),
    lab('minor: close, back, more, change'),
    row([...REST, OFF].map(st => keyOf('minor', 'btn', st, [icon('back', 'i'), 'Back'])),
      keyOf('minor', 'btn quiet', ['an underlined word', ''], ['The full reckoning']),
      state('close', h('button', { class: 'close', type: 'button', 'data-w': 'minor', style: 'margin:0', 'aria-label': 'Close' }, icon('close', 'i')))),
    lab('only read: ink on the paper, no edge, no shadow'),
    h('div', { class: 'k-facts' },
      h('p', { class: 'lead' }, h('span', null, 'Net weight'), h('span', { class: 'dots' }), h('b', { class: 'num' }, '1,374 cwt')),
      h('p', null, h('span', { class: 't-label' }, 'Press '), key('S'), ' to spray: a printed key is read, not pressed.')))
}

function sky(name: string, colour: string): HTMLElement {
  return h('figure', { class: 'k-back', style: `background:${colour}` },
    h('div', { class: 'row' },
      need({ ink: 'red', icon: 'rogue', label: 'Rogue: blight on 2 hills' }),
      need({ ink: 'ochre', icon: 'spray', label: 'Spray: the suggested next order', next: true }),
      need({ ink: 'blue', icon: 'water', label: 'Water: drying out' }),
      need({ ink: 'ink', icon: 'hill', label: 'Hill the rows' }),
      h('span', { class: 'k-pin' }, pin('Verna Bubar', 'needs', { label: 'Verna, worn out: needs you' }))),
    h('figcaption', { class: 'k-cap' }, `${name}: every stamp carries its cut, a paper rim and a keyline`))
}

export function mountKit(root: HTMLElement): void {
  mountSprites()
  // The kit scrolls as a document; the game's page does not.
  document.documentElement.style.cssText = 'height:auto;overflow:auto'
  document.body.classList.add('kitbody')
  document.body.style.cssText = 'height:auto;overflow:visible'
  document.title = 'The County - the system'
  const skyHost = h('div', { class: 'k-backs' })
  let at = 0
  const drawSkies = () => skyHost.replaceChildren(sky(...SKIES[at]))
  const skyKeys = h('div', { class: 'seg-in', role: 'radiogroup', 'aria-label': 'Backdrop' }, SKIES.map(([n], i) => h('label', null,
    h('input', { type: 'radio', name: 'k-sky', checked: i === 0, onchange: () => { at = i; drawSkies() } }), h('span', null, n))))
  drawSkies()

  const page = h('main', { class: 'kit sys' },
    h('header', { class: 'k-mast sheet' },
      h('p', { class: 't-label c-red' }, 'The County · the interface · src/ui/system'),
      h('h1', null, 'The system, in the game'),
      h('p', { class: 'it', style: 'font-size:19px;margin-bottom:12px' }, 'Every component in every state, drawn by the helpers the screens use. It matches design/kit.sheet.html.'),
      h('hr', { class: 'rule oxford' })),

    sec('1', 'Stocks and inks', 'one cream for everything read; two tinted stocks with one job each',
      h('div', { class: 'k-swatches' }, STOCKS.map(([n, t, c, use]) => h('figure', { class: 'k-sw sheet laid', style: `background-color:${c}` }, h('b', null, n), h('span', { class: 'k-code' }, `${t} ${c}`.trim()), h('span', { class: 'it' }, use))),
        h('figure', { class: 'k-sw mount', style: 'color:var(--board-ink)' }, h('b', null, 'Board'), h('span', { class: 'k-code', style: 'color:var(--board-ink)' }, '--board #3b3127'), h('span', { class: 'it' }, 'the two mounts, the time book'))),
      h('table', { class: 'k-table', style: 'margin-top:18px' }, h('tbody', null, INKS.map(([n, t, use, ratio]) => h('tr', null,
        h('td', null, h('i', { class: 'k-inkchip', style: `background:var(${t})` })), h('td', null, h('b', null, n), ' ', h('span', { class: 'k-code' }, t)), h('td', null, use), h('td', { class: 'r num' }, ratio)))))),

    sec('2', 'On every sky', 'a flat sample of the scene; stamps by kind, never colour alone', skyKeys, skyHost),

    sec('3', 'Type', 'Caslon for words, a condensed gothic for labels and figures, a stencil for tags',
      h('div', { class: 'k-type' },
        h('p', { class: 'spec' }, lab('.t-display 64 · gothic'), h('span', { class: 't-display' }, 'Spring 12')),
        h('p', { class: 'spec' }, lab('.t-title 30 · Caslon bold'), h('span', { class: 't-title' }, 'The ledger, year 1')),
        h('p', { class: 'spec' }, lab('.t-head 22 · Caslon bold'), h('span', { class: 't-head' }, 'Upper Middle')),
        h('p', { class: 'spec' }, lab('body 15 · Caslon'), h('span', null, 'Pulls soil over the row to cover the tubers.')),
        h('p', { class: 'spec' }, lab('.t-caption 14 · italic'), h('span', { class: 't-caption' }, 'Katahdin, in bloom')),
        h('p', { class: 'spec' }, lab('.t-label 13 · gothic caps'), h('span', { class: 't-label' }, 'Field record · Balance · Next')),
        h('p', { class: 'spec' }, lab('.t-figure 28 · Caslon bold'), h('span', { class: 't-figure num' }, '−$22,820')),
        h('p', { class: 'spec' }, lab('.stamped · gothic violet'), h('span', { class: 'stamped', style: 'font-size:46px' }, '1,374')))),

    sec('4', 'Controls: depth and weight', 'what can be pressed stands off the paper; how far says what the press costs (data-w)',
      h('div', { class: 'k-weights' }, weights('On paper', ''), weights('On the weigh ticket', 'buff'), weights('On a telegram', 'wire')),
      h('div', { class: 'k-states' },
        state('the strong action, with its arrow', h('button', { class: 'btn go', type: 'button', 'data-w': 'major' }, 'Start the season', icon('arrow', 'i'))),
        state('destroying, hover', h('button', { class: 'btn hazard is-hover', type: 'button', 'data-w': 'major' }, icon('skip', 'i'), 'End the season early')),
        state('armed: where the clock goes on from', h('div', { class: 'clock sheet laid', style: 'width:270px', role: 'group', 'aria-label': 'Clock, stopped' },
          h('button', { class: 'k stopped', type: 'button', 'aria-pressed': 'true', 'aria-label': 'Paused' }, icon('play')),
          [1, 2, 3].map(k => h('button', { class: `k num${k === 1 ? ' armed' : ''}`, type: 'button', 'aria-pressed': 'false' }, `${k}×`)),
          h('button', { class: 'menu', type: 'button', 'aria-label': 'Menu' }, icon('menu'))))),
      h('div', { class: 'k-states', style: 'border-bottom:0;margin-bottom:0' },
        state('key()', h('span', { style: 'display:flex;gap:6px' }, key('S'), key('1'), key('Space'))),
        state('check: a real checkbox', h('span', { style: 'display:flex;gap:14px' },
          h('span', { class: 'check-in' }, h('input', { type: 'checkbox', 'aria-label': 'Off' }), h('i', { class: 'tick' })),
          h('span', { class: 'check-in' }, h('input', { type: 'checkbox', checked: true, 'aria-label': 'On' }), h('i', { class: 'tick on' })))),
        state('choice: real radios', h('div', { class: 'seg-in', style: 'width:300px', role: 'radiogroup', 'aria-label': 'Picture' },
          ['Auto', 'High', 'Medium', 'Low'].map((n, i) => h('label', null, h('input', { type: 'radio', name: 'k-pic', checked: i === 0 }), h('span', null, n))))),
        state('slider: a real range', h('div', { class: 'slider', style: 'width:240px' }, h('input', { class: 'slider-in', type: 'range', min: 0, max: 100, value: 70, style: '--fill:70%', 'aria-label': 'Volume' }), h('b', { class: 'num' }, '70'))),
        state('the clock: 1× running', h('div', { class: 'clock sheet laid', style: 'width:270px', role: 'group', 'aria-label': 'Clock' },
          h('button', { class: 'k', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Pause' }, icon('pause')),
          [1, 2, 3].map(k => h('button', { class: 'k num', type: 'button', 'aria-pressed': String(k === 1) }, `${k}×`)),
          h('button', { class: 'menu', type: 'button', 'aria-label': 'Menu' }, icon('menu')))))),

    h('section', { class: 'k-sec sheet k-two', 'aria-label': 'Orders and the land' },
      h('div', null,
        h('h2', { class: 'k-h' }, h('span', { class: 'k-n' }, '5'), 'Orders', h('span', { class: 'k-note' }, 'order(): key, name, cost, then the catch')),
        h('div', { class: 'orders', style: 'padding:0 0 0 52px' },
          order({ key: 'S', icon: 'spray', name: 'Spray', cost: '¼ day · $110', catch: 'Before Wednesday’s rain: suggested, filled, with the fist.', suggested: true }),
          order({ key: 'W', icon: 'water', name: 'Water', cost: '1 day · $300', catch: 'Rain may do it on Wednesday.' }),
          order({ key: 'T', icon: 'sample', name: 'Test dig', cost: '⅒ day', catch: 'Your only look at the crop.' }),
          order({ key: 'C', icon: 'scout', name: 'Scout', catch: 'Given: on the list, in pencil.', given: true }),
          order({ key: 'K', icon: 'kill', name: 'Kill vines', cost: '¼ day · $120', catch: 'Not now: disabled.', disabled: true }))),
      h('div', null,
        h('h2', { class: 'k-h' }, 'The land', h('span', { class: 'k-note' }, 'tag(), need(), pin()')),
        h('div', { class: 'k-row', style: 'padding:16px;background:#4f7a34;box-shadow:0 0 0 1px var(--edge)' },
          tag({ name: 'Bottom Field', icon: 'bloom', need: need({ ink: 'ink', icon: 'hill', label: 'Hill the rows' }) }),
          tag({ name: 'Upper Middle', icon: 'bloom', selected: true, listed: { icon: 'scout' } }),
          tag({ name: 'Brook Field', icon: 'planted', variety: 'Katahdin' })),
        h('div', { class: 'k-pins', style: 'margin-top:12px' },
          ([['rest', 'You'], ['picked', 'Normand Nadeau'], ['needs', 'Verna Bubar'], ['hurt', 'Alcide Theriault']] as const).map(([st, n]) =>
            h('figure', { style: 'background:#4f7a34' }, h('span', { class: 'k-pin' }, pin(n, st, { name: st === 'picked' })), h('span', { class: 'k-cap' }, `pin(…, '${st}')`)))),
        lab('A pin is 36 px whatever the zoom; place it with a transform, its foot at its own 0,0.'))),

    h('section', { class: 'k-sec sheet k-two', 'aria-label': 'Meters, folds, coupons, slips' },
      h('div', null,
        h('h2', { class: 'k-h' }, h('span', { class: 'k-n' }, '6'), 'Meters'),
        h('div', { class: 'gauges sheet laid', style: 'margin-bottom:12px' },
          h('div', { class: 'gauge' }, h('span', { class: 't-label' }, 'Leaf'), h('b', null, '82%'), meter(0.82, { label: 'Leaf cover' })),
          h('div', { class: 'gauge warn' }, h('span', { class: 't-label' }, 'Water'), h('b', null, 'dry'), meter(0.34, { label: 'Soil water', text: 'dry', kind: 'warn' })),
          h('div', { class: 'gauge bad' }, h('span', { class: 't-label' }, 'Protection'), h('b', null, 'none'), meter(0, { label: 'Protectant', kind: 'bad' })),
          h('div', { class: 'gauge' }, h('span', { class: 't-label' }, 'Hill'), h('b', null, 'once'), meter(0.5, { label: 'Hilled', text: 'once of two', half: true }))),
        h('p', { style: 'display:grid;grid-template-columns:80px 1fr 24px;gap:10px;align-items:center' }, h('span', null, 'Woods'), tens(8, 0.25, { best: true }), h('b', null, '8')),
        h('p', { style: 'display:grid;grid-template-columns:80px 1fr 24px;gap:10px;align-items:center;margin-top:6px' }, h('span', null, 'Machine'), tens(3, 0.4), h('b', null, '3')),
        lab('tens(): levels inked, the next box in pencil as far as the work has gone'),
        h('p', { style: 'margin-top:12px' }, range({ lo: 1150, hi: 1600, max: 2000, promise: 1500, mark: 0, label: '1,500 promised; 1,150 to 1,600 growing' })),
        lab('range(): a contract, promised (the rule) against what is growing (the hatch)'),
        h('h2', { class: 'k-h sp' }, 'Folds and coupons'),
        fold({ icon: 'people', name: 'People', state: '3 asking', figure: '$450 a month', open: true }),
        fold({ icon: 'land', name: 'Land', state: '8 to rent, 10 for sale', open: false }),
        h('div', { class: 'ways', style: 'padding-top:34px' },
          coupon({ icon: 'deliver', label: 'Deliver to the packer', amount: '$12,846', does: '1,028 cwt at $12.50.', take: 'Deliver', key: '1', best: true }),
          coupon({ icon: 'sell', label: 'Sell now', amount: '$12,348', does: '$10.29/cwt today.', take: 'Sell', key: '2' }))),
      h('div', null,
        h('h2', { class: 'k-h' }, 'Tooltip, slip, confirmation'),
        h('div', { class: 'k-row', style: 'align-items:start' },
          tip('k-tip', h('b', { class: 'c-ochre' }, 'Soil water: dry'), h('span', null, '34% of what plants can use')),
          slip('North Ridge: blight on 2 hills', { icon: 'blight', kind: 'bad' }),
          slip('Brook Field: drying out', { icon: 'water', kind: 'water' }),
          slip('Scout: on the list for Upper Middle', { icon: 'check' })),
        h('div', { class: 'sheet', style: 'max-width:440px;padding:14px 18px 16px;margin-top:18px;display:grid;gap:8px', role: 'alertdialog', 'aria-label': 'Let Normand Nadeau go today?' },
          h('p', { class: 't-label c-red' }, 'Cannot be undone'),
          h('b', { style: 'font-size:21px' }, 'Let Normand Nadeau go today?'),
          h('p', { class: 'quiet' }, 'He leaves the farm today and does not come back.'),
          h('div', { style: 'display:flex;gap:10px;margin-top:4px;align-items:flex-end' }, h('button', { class: 'btn hazard', type: 'button' }, 'Let him go'), h('button', { class: 'btn is-focus', type: 'button' }, 'Keep him on'))),
        h('h2', { class: 'k-h sp' }, 'Stamps', h('span', { class: 'k-note' }, 'only where the moment earns them')),
        h('div', { class: 'k-row' }, stamp('Weighed', { ink: 'violet' }), stamp('Paid', { ink: 'violet' }), stamp('Lapses Jul 16', { ink: 'violet', small: true }), stamp('On the list', { small: true }),
          h('p', { class: 'stopped-tag', style: 'position:relative;right:auto;top:auto' }, icon('pause', 'i'), 'Stopped for you')),
        h('h2', { class: 'k-h sp' }, 'The code'),
        h('table', { class: 'k-table' }, h('tbody', null,
          h('tr', null, h('td', null, h('span', { class: 'need red', style: 'transform:none;width:36px;height:36px' }, icon('rogue'))), h('td', null, h('b', null, 'A stamp on the land'), ': something needs you, inked by kind, always its cut.')),
          h('tr', null, h('td', null, h('i', { class: 'tick on' })), h('td', null, h('b', null, 'Pencil'), ': what you did or chose.')),
          h('tr', null, h('td', null, icon('fist', 'i k-fist')), h('td', null, h('b', null, 'The printer’s fist'), ': the one next thing.')),
          h('tr', null, h('td', null, h('span', { class: 'sheet laid s-canary', style: 'display:block;width:40px;height:26px' })), h('td', null, h('b', null, 'Canary'), ': the goal slip, and only that.')),
          h('tr', null, h('td', null, h('span', { class: 'stamped', style: 'font-size:28px' }, '1,374')), h('td', null, h('b', null, 'Violet'), ': what a machine or a clerk stamped.')))))),

    sec('7', 'Portraits', 'portrait(person, size): one engraver’s hand, tinted in the colours each person wears on the land',
      h('div', { class: 'k-busts' }, CUTS.map(([cut, name]) => h('figure', null, portrait({ ...personLook(name), cut }, 72), h('span', null, `bust-${cut}`), lab(name)))),
      h('div', { class: 'k-busts small', style: 'margin-top:12px' }, ['Lucien', 'Marie', 'Gerald', 'Theresa', 'Roland', 'Dot', 'Wendell', 'Aurele', 'Hazel Cyr', 'Leon Daigle', 'Rita Sirois', 'Carl Haines'].map(n => h('figure', null, portrait(n, 44), h('span', null, `${n.split(' ')[0]} · ${personLook(n).cut}`))))),

    sec('8', 'The cuts', `icon(name): ${ICON_NAMES.length} drawings on one 24 unit grid, a 1.7 unit square-ended line`,
      h('div', { class: 'k-icons' }, ICON_NAMES.map(n => h('figure', null, icon(n, 'i'), h('span', null, n))))),
    h('footer', { class: 'k-foot' }, 'Libre Caslon Text, League Gothic and Big Shoulders Stencil, under the SIL Open Font Licence (public/fonts).'))
  root.replaceChildren(page)
}
