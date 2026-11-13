# The County: the farm's own papers

The specification every screen of the game is rebuilt from (`docs/UI.md`): the papers' world, the print's
discipline. A screen in the game is right when it matches its frame here.

Everything the player reads is a piece of the farm's own paper and print, mounted, stamped and pencilled the way a
farm office would. On the season screen there are two mounted boards and a time book: the **almanac board** (the
date leaf, six days of forecast, the season ruled under them, and the canary goal slip hung below) and the **bank
board** (the balance, the clock's keys and the menu, the contract under them), with the **time book** of people at
the foot. Fields carry stencilled manila **tags**; a field's needs are **stamps** inked by kind; people are **face
pins**. Selecting a thing draws it on the land and docks its **command bar** at the right edge. Decisions arrive as
**telegrams**; dig day is the **platform scale** and its **weigh ticket**; spring is the **seed catalogue**; winter is
a page of the **time book**; the year's end is the **account book**, open; the menu is the **office file**; the title
is the **almanac's cover**.

## The code: five marks, each meaning one thing, everywhere

| Mark | Means | Never |
| --- | --- | --- |
| A round stamp on the land, inked by kind (red: blight or loss; ochre: the suggested next order, ringed; blue: water; black: other work due), its order's cut reversed out, a paper rim and a keyline | something needs you | colour alone; a stamp without its cut |
| Pencil (grey line, tick, ring, strike-through) | what the player did or chose | anything the game says |
| The printer's fist | the one next thing: the goal, the suggested order, what brings most | more than two on screen |
| Canary paper | the goal slip | any other surface |
| Violet | what a machine or a clerk stamped: weights, ticket numbers, paid, a lapse date | a call to act |

Rubber stamps appear only at the moments that earn them: weighed, paid, a decision lapsing, an order on the list.

## Always

- One family of stock: `--paper` cream for everything read, `--paper-2` for a cell or a stub, manila only for tags
  and the menu key, buff only for the weigh ticket, canary only for the goal, the dark board only for the mounts.
- Every sheet, tag, stamp and pin has a dark keyline (`--edge`, 8.1 : 1 on snow) and every stamp a paper rim (7.9 : 1
  at night, 4.5 : 1 on July green), so nothing depends on what is behind it.
- Caslon for words, League Gothic for labels, keys and figures that carry a screen, Big Shoulders Stencil for field
  tags. Labels are gothic capitals at 13 px or more; captions are italic at 14 px or more; body 15 px.
- Orders are buttons: key, name, cost, then the catch. The suggested one is filled ochre and carries the fist.
- Selection is drawn on the land: a dashed line round the thing, a registration mark at each corner.
- A person is the same everywhere: portrait, pin ring and time-book cell in the colours their 3D figure wears.
- A step that cannot be undone wears a red hazard border (Let go, End the season early, Delete the save) and asks
  once more.
- What can be pressed stands off the paper as a key cut from card (a rim, the card's edge under the face, a shadow);
  what is only read is ink on the paper. How far a key stands and how big it is says what its press costs: `data-w`
  is `major`, `std` or `minor` (`system.css` § 7; docs/UI.md, "Controls: depth and weight"). The still frames here
  were drawn before this rule and show the old printed boxes: the live kit (`?kit` in the game) is the reference for
  controls.
- A range is always a range; money is right-aligned; a negative figure carries its minus sign.
- The clock is Pause and three speeds and never changes speed by itself; when it stops for you it says so.
- Menus are sheets over the live land (a plain veil, never a blur behind a sheet).

## Never

- No stains, burns, torn edges, speckle, tape, fake age; no texture beyond the fine grain.
- No state carried by colour alone; no text under 4.5 : 1 against what is actually behind it.
- No icon library: 65 cuts drawn on one grid (`icons.svg`); no emoji; no real place; no calendar year.
- No panel over the middle of the land without cause; nothing over the field a card belongs to (the command bar
  docks left when the selection lies on the right).

## The files

| File | What it is |
| --- | --- |
| `system.css` | The one stylesheet: tokens (stocks, inks, type scale, spacing, depth, motion), then every component and state |
| `icons.svg` | The icon sprite, 65 symbols, `<svg class="i"><use href="#i-name"/></svg>`, printed in `currentColor` |
| `portraits.svg` | The portrait sprite, 6 heads, tinted by `--shirt --hat --skin --hair` |
| `kit.sheet.html` | Tokens with contrast, every control in every state, the code, both indexes |
| `MOTION.md` | How everything moves and sounds; reduced motion |
| `REFERENCES.md` | The sources and what was taken from each |
| `src/` | The frames as written, with shared parts in `src/parts/` (`<!--@part k="v"-->`) and the engraving `src/cut.svg` |
| `tools/assemble.py` | Writes the frames from `src/` (`python3 tools/assemble.py design`); the other tools draw the icons, portraits, pins, the dial, the chart and the selection marks |

**Dead files: do not load them.** `papers.css`, `sheets.css`, `phone.css`, `kit.css`, `icons.css`, `ink.css` and
`src/busts.svg` are one-line stubs left from earlier rounds. No frame loads them and the rebuild must not: everything
they held is in `system.css`, `icons.svg` and `portraits.svg`. They can be removed.

## Components, and the frame that shows each

| Component (class) | Frames |
| --- | --- |
| Almanac board: `.almanac .mount .face .leaf .forecast .season-track`; goal slip `.goal` | season, season-card, people, incident, yard, tract, season.phone |
| Bank board: `.bank .balance .clock .k .menu .contract .range`; `.stopped-tag` | season, incident, ticket, ticket-reveal, menu; spring (planning form) |
| Time book: `.timebook .person .doing .next`; states `.is-picked .needs` | season, season-card, people, incident, yard, tract, season.phone |
| Alerts `.alert .bad .water` | season, season-card, season.phone |
| Field tag `.tag-at .tag .nm .listed .var`, `.is-sel`; yard tag `.yard-tag` | every land frame; spring |
| Need stamp `.need .red .ochre .blue`, `.is-next` | season, season-card, tract, yard, howto, kit |
| Selection on the land `.select` (tools/regmarks.py) | season-card, yard, tract |
| Face pin `.pin`, `.is-picked .needs .is-hurt`, `.badge .name` | season, people, incident, yard, tract, season.phone, kit |
| Command bar `.command .command-head .gauges .readings .orders .order`, `.is-suggested .is-given`, `.docked-left`, `.steps`, `.builds` | season-card, tract, yard |
| Person card `.person-card .skills .tens .state .pc-actions`; work grid `.work .grid .cell .first` | people |
| Telegram `.telegram .tg-head .days .replies .reply .lapse` | incident |
| Weigh ticket `.ticket .stub .tk .weighed .stamped .grades .losses .ways .way .is-best .brings .take` | ticket |
| Platform scale `.scale-face .dial .printing` (tools/dial.py) | ticket-reveal |
| Catalogue `.catalogue .masthead .fold .applicant .skill-row .skill-one .order-blank` | spring, spring.phone |
| Account book `.book .page-l .page-r .cashbook .worth .compare .chart` | ledger |
| Office file `.file .file-pages .menu-list .f-row .seg .check .slider` | menu |
| How to play `.howto .figs .fig .code-row .year-row .keys-fold` | howto |
| Winter `.winter .wrow .seg .raise .yard-stock` | winter |
| Cover `.cover .cv-name .cv-cut .cv-menu .imprint` | title, title-snow, title-night |
| Controls `.btn .go .quiet .hazard .key .tick .seg .slider .iconbtn .close .tip` | kit (every state), and throughout |

## Fonts and licences

All under the SIL Open Font Licence 1.1 (`fonts/OFL-*.txt`), subset to Latin-1, about 110 KB together:
Libre Caslon Text roman and italic (all words), League Gothic (labels, figures, keys, the strong action, the
wordmark), Big Shoulders Stencil (field tags and yard tags). Courier Prime (`fonts/courier-prime.woff2`) is no longer
used. Images beyond the backdrops: `img/grain.png` 35 KB.

## Where it still falls short

- The portraits and pins are tested against today's land, not the coming one where a person is ten pixels tall; the
  pins need a crowding rule (eight people on one field) that no frame shows.
- The engraving on the cover is drawn small and simple by intent (under 5 KB); it is honest but not an engraver's
  plate.
- On a phone the spring sheet folds Land, Contracts and Equipment into one row of three buttons to keep three
  applicants above the order blank; a fourth applicant would scroll.
- The work grid's skill bars are quiet by design and easy to miss; whether players read them needs a test.
- Motion and sound are written (MOTION.md), not shown.
