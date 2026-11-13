# The County: the interface's identity

What the interface is, how that was decided, and what every screen is rebuilt from.

## Why this exists

The owner, after playing the build with the bigger map: "ALL game menus still need a MASSIVE quality upgrade". The
interface by then said the right things in the right places (few words, the land as the interface, one thing to do
next) and looked like a careful web app laid over a game: flat dark bars, a cream sheet, system type, a generic line
icon set. It had no identity.

## How the direction was chosen

Three art directors worked alone from real farm paper and print (ledgers, seed catalogues, almanacs, weigh
tickets, bank books) and from frames of shipped games' menus, each from a different starting point, and each built
the same twelve finished frames in HTML and CSS over captures of the game's own scene:

- **The farm's own papers**: everything the player reads is a piece of the farm's paper and print.
- **The instrument**: the interface as a maker's machine of gauges, drums, keys and lamps.
- **The almanac print**: a bold printed poster language in a few flat inks.

Five judges then ranked the three and the interface as it stood, blind (neutral letters, eleven screens each, a
different reading order per judge, not told which was the existing one), each through one lens. Scores are out of
ten against shipped games in the genre, not against each other.

| Judge's lens | Ranking, best first | Papers | Print | Instrument | As it stood |
| --- | --- | --- | --- | --- | --- |
| Game UI art director | papers, print, instrument, as it stood | 8 | 7.5 | 6.5 | 4.5 |
| First-time player | papers, print, instrument, as it stood | 8 | 7.5 | 6 | 5 |
| Looks templated or generated? | papers, print, instrument, as it stood | 8 | 7 | 5.5 | 5 |
| Usability and accessibility | print, papers, instrument, as it stood | 7 | 7.5 | 6 | 5 |
| The owner's stated standard | print, papers, instrument, as it stood | 7.4 | 7.6 | 6 | 4.3 |
| **Mean** | | **7.7** | **7.4** | **6.0** | **4.8** |

All five put the interface as it stood last ("a web-app settings aesthetic", "an admin dashboard over a 3D scene").
All five also said that none of the four would yet pass beside the best shipped games without another round, and
that papers and print were each one disciplined pass from it. The two that preferred print did so for command feel
and legibility; the three that preferred papers did so for the idea, the craft and the room it leaves the land.
The comparison has one known weakness: the frames of the interface as it stood sat on a different capture of the
scene from the three proposals, so a judge could have guessed which it was.

## The decision

**The interface is the farm's own paper and print**, with the print direction's command clarity grafted in and
two ideas taken from the instrument. In one line: the papers' world, the print's discipline.

From the papers direction (the base):

- The date as a seed company's tear-off calendar with the season ruled under it; money in the bank's pass book
  with its date stamp; fields as stencilled manila tags; people in a time book; alerts as slips from an order book.
- The next goal as a canary slip: the last goal struck through in pencil, the next written under it.
- A strict code of five marks: a red rubber stamp for "needs you now"; pencil for what the player did or chose; the
  printer's pointing hand for the one next thing; canary paper only for the goal; violet for whatever a machine or
  a clerk stamped.
- A decision arriving as a telegram with reply forms. The year's end as an open account book with In and Out
  columns, stamps and goals struck off. The spring plan as a catalogue with index tabs and an order blank. The
  title as an almanac cover with an engraved cut.
- Caslon for text, a condensed gothic for labels and figures, a stencil for field tags; real rules, dot leaders and
  tabular figures; fine grain and a dark keyline round every sheet, never stains or fake age.

Grafted from the print direction:

- **Orders are buttons, and the next one is lit.** A field's card is a set of orders, not a list of text; the
  suggested order is filled and carries the pointing hand; each order shows its key, its cost, then its catch.
- **A card opens beside the thing clicked, tied to it.** The print direction docked the command bar at the right
  edge; the owner, playing it, found menus opening "out in narnia" with nothing to say which thing they belonged
  to. The rule since (`src/ui/anchor.ts` for the geometry, `src/ui/tie.ts` for the tie, `e2e/anchored.spec.ts`):
  click a field, its tag, a tract, the yard, a building, a person, their chip, a machine or an order, and its card
  opens 14 px from the pointer, to the right and level by preference, flipped to stay in the window, off the bars
  and off the thing's own middle; a tether runs from the card to the thing, which is marked on the land; the card
  says which thing it is about (`data-thing`) and holds only that thing's business (what the whole farm does, such
  as how spraying is done this season, stands with the people at the foot); it goes with the thing as the camera
  moves, and waits at the nearest edge with a Show key when the thing leaves the picture; one card at a time,
  closed by Escape, its cross or a click on empty ground. On a phone the card is a sheet at the foot with a notch
  on its edge toward the thing, which is kept in view above it. Of the places beside the click the card takes the
  one that lies over the fewest other tags and faces (a field that takes orders counts three times a resting one,
  a face half), slid up or down its side to step clear of them and never further from the click to do it; once
  laid it keeps its place as the camera carries the land by. A card cut short is the last resort: where a bar
  under the click or the slip over it leaves too little room, the card steps along that side, whole, on a longer
  tether (190 px at most; a thing standing right over or under the bar that cuts its card, such as someone at the
  foot of the land over the people bar, may send it to that bar's end, up to the card's own width along). The two
  boards at the top are things to keep off, not a line across the window: between them the land runs on up, and a
  card there has that room. At 800 px of window height or less the field card's own spacing is tighter, so a
  planted field's whole card fits a 720-line window.
- **Selection is drawn on the land**: a dashed outline with registration marks at the field's corners.
- **Colour as signal on the land**: a need's stamp is inked by kind (blight and loss red, the suggested next thing
  ochre, water blue), always with its icon, never colour alone.
- **People on the land are small face pins** that match their portraits and never change size with the camera
  (rest, picked, needs you, hurt), not lettered flags.
- The weigh ticket's spine with its number and a "Brings most" tab on the best way to take the crop; the three
  ways as real tear-off buttons.
- A decision's cost stated as a difference in plain words, its choices numbered with their keys, a count of days
  left, and a "Stopped for you" tag under the clock.
- The ledger's headline worth and its comparison with the neighbour.
- On a phone, each applicant by their best skill only.

Taken from the instrument direction:

- The weigh scale's needle sweeping round a dial of grades as the reveal, before the ticket prints.
- The contract as a range: what was promised marked against what the fields look like giving.
- Hazard stripes on the two destructive controls (let someone go, end the season early); How to play built from
  real pieces of the interface.

Faults the judges found that the rebuild must not carry over:

- The season screen as a collage in four corners in five paper stocks: it becomes two anchored groups in one
  family of stock, with one place for the eye to rest.
- The pencil ring on the ticket crossing out the line beneath; sale choices with no affordance.
- Small italic captions under about 13 px; month strips and rain chances that cannot be read.
- Stamps and texture as decoration: stamps only at the moments that earn them (weighed, paid, a decision lapsing,
  an order on the list), no speckle, no torn edges.
- A menu that walls off the land: menus are sheets over the live scene.
- Any state carried by colour alone.

## What stays from before

The nine principles the interface was already held to (`docs/DIRECTION.md`, "The hook"): one thing to do next,
reveal by reach, the land is the interface, every number has a why, few words (under 80 on the season screen with
nothing selected), it answers, short loops inside long ones, one hand, works everywhere (keyboard, phone, reduced
motion, screen readers). The clock is Pause and three speeds and never changes speed by itself.

## Controls: depth and weight

The owner, after playing: "the papers cool but its hard to distinguish like should I click this", and "the more
important an action the button should almost imply the weight of the choice". Every control was a printed box one
pixel deep, the same whether it closed a card or sold the year's crop, and some lines of plain text were buttons.

**What can be pressed stands off the paper. What is only read is ink on it.** A control is a key cut from card: a
face inside an ink rim, the card's own edge showing under the face, a shadow on the paper below. Under the pointer
it stands a pixel higher; under the press the edge closes and a shadow as deep as the edge opens along the top (the
key's box never moves, so a press on its very edge still lands); a focus ring goes round it; the pointer is a hand. A fact has no rim that looks like a key, no edge, no shadow and no hand. A word that is pressed is
underlined. A printed key cap (`key()`) is flat, because it is read.

How far a key stands, and how big it is, says what its press costs. The weight is on the control as `data-w`:

| Weight | What the press costs | How it looks |
| --- | --- | --- |
| `major` | Money, time, or it cannot be taken back | The biggest key on its paper: at least 56 px high (12 px more than a standard key), a 2 px rim, a 6 px edge, gothic capitals, its price or what follows on a second line. One on a paper may be filled in ink: the one the game would press. It carries `data-sound`. A destroying one has hazard stripes round it and asks once more. |
| `std` | An order, an answer, a choice that can be changed | A plain key 40 px high wherever it is (44 px under a finger), a 1 px rim, a 3 px edge, its key letter where it has one, its cost small at the side. An order on a command bar is the same key two lines high. |
| `minor` | Nothing: close, back, more, change | A small quiet key (34 px, a grey rim, a 2 px edge) or an underlined word. It never competes. |

States, each of which looks unlike the others and unlike a filled major key:

| State | How it looks |
| --- | --- |
| On, chosen | The key stays down and is filled in pencil grey, the mark for what the player chose. A chosen reply is ringed in pencil instead, so its words stay ink on paper; a picked person keeps a bar of ink along the foot. |
| Open | A key that holds a part of a sheet open stays down, unfilled. |
| Armed | The speed the clock goes on from: a broken bar along the foot of a key that still stands. |
| Stopped | The pause key while the game is paused: down and red. |
| Suggested | Ochre, with the printer's fist. |
| Busy | Half down, a broken line along its foot, the pointer a wait. |
| Greyed | Flat and hatched, the pointer a no-entry, and it says why under the pointer (`title`) or in its own catch line. |
| Given | An order already on the list: flat, in pencil, stamped. |

Every action in the game and its weight (`src/ui/system/weight.ts` is the table the game reads):

| Action | Where | Weight |
| --- | --- | --- |
| Continue; Play, when there is no farm to go on with | The cover | major, filled |
| Start the season | The spring plan's order blank | major, filled |
| Close out the season | The bank board, once everything is dug | major, filled |
| On to the next month; Close the year; Sell the rest and close the year | Winter | major, filled |
| Plan next year; See how it ended; Close the book | The account book | major, filled |
| Start a new farm | The account book; after the farm is lost (filled there) | major |
| Sell, Sell half, Deliver, Store, Hold back seed | The weigh ticket's coupons (the one that brings most is filled), a dug field's card, winter's piles | major |
| Sell logs | The yard, winter, the stock on the bank board | major |
| Hire | The spring catalogue, the crew paper | major |
| Raise (a wage) | A person's page | major |
| Let go | A person's card and page, the crew paper, the spring catalogue | major, destroying: asks once more |
| Buy a machine | The spring catalogue | major |
| Undo (a machine bought or a person hired this spring, taken back in full until the season starts) | The spring catalogue | std |
| Rent, Buy, Buy for cash, Release (land); Pull stumps | A piece of land's card | major |
| Build, raise a building | The yard's card, winter | major |
| Pay down the mortgage | The spring catalogue's bank fold | major |
| Accept a contract | The contracts | major |
| A telegram's replies; the spraying question's replies; the tutorial's offer | The telegram | major |
| The step itself, on a paper that asks once more | The confirmation | major (striped when it destroys) |
| End the season early | The menu | major, destroying: asks once more |
| Delete the save | The menu | major, destroying: asks once more |
| A field's orders: Plant, Hill, Scout, Spray, Water, Rogue, Test dig, Kill vines, Dig, Haul | The command bar | std |
| Order it, and the other fixes of a need | The work list, the goal slip | std |
| Show me | The goal slip, the goals | std |
| Skip ahead; Got it; Begin; Restart the tutorial | The tutorial's note and paper | std |
| The answer keys of a choice that can be changed: winter work, foreman of a block, by itself or ask me, farm rules, varieties, seed, Sundays | Winter, a person's page, the work grid, the spring cards | std |
| Follow; Details; Hiring; See who has it | A person's or a thing's card | std |
| Rest choices; what a person takes first; the priority keys and cells | A person's card and page, the work grid | std |
| Pause and the three speeds; the menu key | The clock | std |
| A field's tag, a need's stamp, a yard's tag, a person's pin | The land | std (they keep their own shapes) |
| A person in the time book; a job on the work list | The time book | std |
| Who does what; Hire someone; A question waiting; Back to the whole farm; Show them on the land | The time book's tools, the land | std |
| The catalogue's folds and their rows; the almanac's index tabs | Spring, the almanac | std |
| The almanac; Save a copy; Load a saved farm; How to play; The guided first year; Continue; Quit to the title | The menu | std |
| New farm, Guided first year, How to play, Settings | The cover's contents | std |
| Cancel, Keep it | The confirmation | std |
| The ticket; Hold back seed (opens it); the stepper | A dug field's card, winter | std |
| Close, Deselect, Decide later, Put away | Every card, paper and tray | minor |
| Back, Done, Back to the plan, Back to the ticket | The foot of a paper | minor |
| The goal slip and the next goal (they open the goals) | The almanac board, the account book | minor |
| The forecast, a contract, the stock (each opens its paper) | The boards | minor |
| More orders; the rest of the work list; All the keys | The command bar, the work list, How to play | minor |
| Take it off the list; Do it first; Who does it; Let them help | The work list's small keys | minor |
| Compare them all; The money; The full reckoning; change the spraying; see the test dig; Show me in a tutorial note | Underlined words | minor |
| Skip; Turn off the tutorial; Again | The tutorial | minor |

A destroying control is never the one in focus when its question opens: the other answer is.

Where it lives: the rule is `design/system.css` § 7 (ported to `src/ui/system/system.css`); what only the live game
has is fitted in `src/ui/system/weight.css`; `h()` marks every button and link it makes with its weight from
`src/ui/system/weight.ts`, and a helper (`order`, `fold`, `slip`) or a screen may say `data-w` itself. A key's edge
is marked important, so a screen changes a key through the `--w-` properties (`--w-up`, `--w-rim`, `--w-line`,
`--w-side`, `--w-mark`) and never through `box-shadow`. The kit page (`?kit`) shows each weight in each state on
each paper; `e2e/weight.spec.ts` reads the rule off the live game on each main paper at a desk and on a phone.

Known gaps: a major key has its price or consequence on a second line only where the screen already printed one in
the button (the coupons, the replies, Sell, Deliver, Buy, Build, Raise, Let go on a person's page, Continue); Hire,
Accept, Start the season and the season's and the year's closing keys have one line. `data-sound` names the cue
`press`, which the sound does not have yet. The design folder's still frames were drawn before this rule and show
the old printed boxes.

## Where the system lives

- `design/`: the reference frames, the kit sheet (tokens, every control in every state, the icon family, the
  portraits and pins), `MOTION.md`, `REFERENCES.md` and the fonts with their licences. The frames are the
  specification: a screen in the game is right when it matches its frame.
- `src/ui/`: the game's interface, rebuilt from that system.

## How the result is checked

- Blind pairs, the old interface against the new, for every screen, by judges not told which is which.
- First-time players in a real browser with no instructions: seconds to the first order, and whether a first
  season is finished unaided.
- Zero layout faults at eight window sizes in three browser engines; zero accessibility violations; measured
  contrast; 44 px touch targets; word counts.
- An audit for anything that looks default or generated.

## Results

The rebuild is in the game: the system as code (`src/ui/system`, with a kit page at `?kit` and a test that fails if
it drifts from `design/system.css`), the title, the season screen (boards, field tags and need stamps by kind, face
pins that cluster, each thing's card beside the thing with the selection drawn on the field, the time book, the
person card and work grid, the yard and tract bars, the telegram) and every sheet (the spring catalogue, the weigh
ticket with the scale's reveal and its sound, winter, the account book at the year's end, the menu, how to play, the
almanac).

Checked so far: each screen set beside its frame by the writer who rebuilt it and by the creative director for the
title, the season screen, the command bar, the telegram, the spring sheet and the weigh ticket; captures of the key
screens at eight sizes with no layout faults and no page errors; the browser suite (see `docs/QUALITY.md` for the
counts of the build that shipped).

Known to fall short of the frames: a selected yard has no dashed outline on the land; tags with nothing needed are a
size smaller than drawn; the person card keeps a priority column the frame does not show; the menu lacks the
frame's "saved" note; some old rules still load from `src/ui/legacy.css`, `papers.css` and `screens.css`.

Not yet run: the blind pairs of the old interface against the new, first-time players in a real browser, measured
contrast in the live game, and the audit for anything that looks default.
