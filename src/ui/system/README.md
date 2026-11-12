# src/ui/system: the farm's own papers, in the game

The interface's identity (docs/UI.md) as code. The specification is `design/` (frames, `design/README.md` for the
rules, `design/kit.sheet.html` for every component). A screen is right when it matches its frame.

## What is where

| File | What it is |
| --- | --- |
| `system.css` | `design/system.css` carried over by `node tools/ui/port.ts` (fonts from `public/fonts`, `font-display: swap`, flat sample colours for the frames' photographs). Never edit it: change `design/system.css`, run the tool. `tests/ui-system.test.ts` fails if they drift. |
| `game.css` | What a live screen needs beyond the frames: pointer events, every size, live states. Placement only, no new looks. |
| `grain.png` | The paper grain, the one texture (a static tile). |
| `people.ts` | `portrait(person, size)`, `pin(person, state)`. |
| `parts.ts` | `order()`, `need()`, `tag()`, `stamp()`, `key()`, `fist()`, `fold()`, `coupon()`, `meter()`, `range()`, `tens()`, `slip()`, `tip()`. |
| `kit.ts` | The living kit: open the game with `?kit`. Capture state `kit` in `tools/quality/capture.ts`. |
| `../icons.ts` | `icon(name, cls)` from the sprite `design/icons.svg` (106 drawings); `mountSprites()` puts both sprites in the page. |
| `../../game/looks.ts` | `personLook(name)`: a person's colours and portrait cut, keyed on the name. |
| `public/fonts` | Libre Caslon Text (roman, italic), League Gothic, Big Shoulders Stencil, with their SIL OFL texts. The title's faces are preloaded in `index.html`. |

## How to make each thing

- **Icon**: `icon('spray')` (20 px, class `ic`); in a system component use class `i` and size with `--i`: `icon('spray', 'i')`.
- **Person**: `portrait(unit, 46)` (anything with a `name`; the farmer's name is `You`). `pin(unit, 'rest' | 'picked' | 'needs' | 'hurt', { label })` for the land: place it with `transform: translate3d(x, y, 0)` from `unitAnchor`, never scale it.
- **Field tag**: `tag({ name, icon: stageGlyph(f), selected, listed: { icon }, need: need({ ink, icon, label, next }) })`. Inks: `red` blight or loss, `ochre` the suggested next order (`next: true` rings it), `blue` water, `ink` other work due. Place with a transform from `fieldAnchor`.
- **Order on a command bar**: `order({ key: 'S', icon: 'spray', name: 'Spray', cost: '¼ day · $110', catch: 'Before the rain', suggested, given })` inside `div.orders` inside `section.command.sheet.sys`.
- **Selection on the land**: an SVG `.select` with a dashed `.line` polygon round the field and a `.reg` mark at each corner (see `design/tools/regmarks.py`).
- **Sheet**: any surface is `.sheet` (lifted) or `.sheet.laid`; `.s-buff` only for the weigh ticket, `.s-canary` only for the goal; boards are `.mount` round a `.face`.
- **Buttons**: `.btn`, `.btn.go` (the one strong action on a sheet), `.btn.quiet`, `.btn.hazard` (cannot be undone: Let go, End the season early). Real form inputs: `.check-in` (checkbox over `.tick`), `.seg-in` (radios), `.slider-in` (range).
- **The rest**: `fold()`, `coupon()` (inside `.ways`), `meter()`, `range()`, `tens()`, `slip()`, `tip()`, `stamp()`.
- Every component root carries `.sys`: the old stylesheets (`instruments.css`, `papers.css`, `screens.css`) cannot reach inside it (each of their selectors ends in `:not(.sys, .sys *)`). Put `.sys` on the root of each rebuilt screen part.

## Rules

Always: one family of stock; a keyline round every sheet, tag, stamp and pin; Caslon for words, gothic for labels,
keys and figures, stencil for tags; captions 14 px or more, labels 13 or more; orders are buttons showing key, cost,
catch; selection drawn on the land; the five marks mean one thing each (stamp on the land: needs you; pencil: what you
did; the fist: the one next thing; canary: the goal; violet: what a machine or clerk stamped); textures are static
tiles; motion is transform and opacity with the tokens in `system.css` (MOTION.md).

Never: a state in colour alone; a stamp as decoration; stains, torn edges, fake age; translucent paper or a blur
behind a sheet; an icon from anywhere but the sprite; a pin or tag that scales with the camera; a value forked from
`design/system.css`.

## Aliases to delete

In `src/ui/style.css`, each the old name of a new token or component, kept while old screens use it. Delete each with
its last user:

- Tokens: `--paper-hi`, `--ink-3`, `--rule-strong`, `--good`, `--good-ink`, `--warn`, `--warn-ink`, `--bad`, `--cold`,
  `--cold-ink`, `--bad-wash`, `--warn-wash`, `--cold-wash`, `--scrim`, `--night`, `--night-solid`, `--night-2`,
  `--night-line`, `--night-edge`, `--cream`, `--cream-2`, `--gold`, `--ember`, `--ice`, `--sage`, `--serif`, `--sans`,
  `--t-small`, `--t-lede`, `--t-moment`, `--t-display-min`, `--sp-h`, `--sp-1` to `--sp-7`, `--radius`, `--shadow`,
  `--hit`, `--hit-s`, `--t-quick`, `--t-base`, `--t-move`, `--t-exit`, `--t-reveal`, `--stagger`, `--ease-move`.
  (`--rule` keeps its name but is now the account book's faint blue line.)
- Classes: `.btn.primary` (`.btn.go`), `.btn.danger` (`.btn.hazard`), `.btn.small`, `.btn.big`, `.link` (`.btn.quiet`),
  `.icon-btn` (`.iconbtn`), `.t-small`, `.t-lede`, `.t-moment`, `.note`, `.sub`, `.bad-text`, `.warn-text`,
  `.good-text`, `.cold-text`, `.double`, `kbd` (`.key`), `.gauge` (`.meter`), `.seg`/`.seg-opt` (`.seg-in`), `.check`
  with an input (`.check-in`), `.slider` with an input (`.slider-in`), `.money`.
- `src/ui/face.ts` `face(look)` and `src/ui/people.ts` `portrait(who, cls)` now draw the system's portrait; use
  `portrait()` from `people.ts` here instead.
- `src/ui/contracts.ts` `tracker()` keeps the spring sheet's list of contracts; the season and the cellar show them on
  the bank board.
- The packages `@fontsource-variable/fraunces` and `@fontsource-variable/public-sans` are no longer imported; remove
  them from `package.json` with npm when convenient.

## Done here, left for the screen writers

Rebuilt end to end: the title (`title.ts`, design/title.html) and the top of every screen (`top.ts`: the almanac board
and the bank board, design/season.html), with the clock's behaviour and every test id unchanged. Everything else is
an old layout in the new materials until it is rebuilt: the field card (to the command bar), the plates (to tags and
need stamps), the crew strip (to the time book and pins), the incident card (to the telegram), the weigh ticket and
the scale, the spring plan, the cellar, the ledger, the menu and how to play, the almanac, the person card and the
work grid. Phone: the season screen's clock slot (`clock(ctx, true, onMenu)`) already carries the menu at the thumb.
