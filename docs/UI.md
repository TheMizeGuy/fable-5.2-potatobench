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

- **Orders are buttons, and the next one is lit.** A field's card is a command bar docked at the right edge, not a
  list of text; the suggested order is filled and carries the pointing hand; each order shows its key, its cost,
  then its catch.
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

(Filled in when the rebuild is checked.)
