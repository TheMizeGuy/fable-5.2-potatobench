# How the papers move and sound

Paper is light and quick, and it never floats. Every movement here is one a real sheet makes when a hand puts it
down, tears it off, stamps it or takes it away. Nothing bounces for fun, nothing glows, nothing loops. The tokens
live in `system.css` (section 2) and on the kit sheet.

## Tokens

| Token | Value | Used for |
| --- | --- | --- |
| `--t-tap` | 90 ms | a key or a box answering a press |
| `--t-stamp` | 140 ms | a stamp coming down |
| `--t-slip` | 220 ms | a slip, a tag's "on the list" line, a tooltip arriving |
| `--t-sheet` | 320 ms | a card or sheet laid down |
| `--t-leave` | 200 ms | anything taken away (always quicker than it came) |
| `--t-tear` | 260 ms | the calendar leaf torn off at midnight; a coupon torn off the weigh ticket |
| `--t-sweep` | 1400 ms | the scale's needle sweeping round to the gross weight |
| `--ease-out` | `cubic-bezier(.2, .7, .2, 1)` | most arrivals: fast, then settling |
| `--ease-paper` | `cubic-bezier(.3, 1.25, .5, 1)` | a sheet laid down: a 2 to 3 px overshoot, the paper landing flat |
| `--ease-in` | `cubic-bezier(.5, 0, .9, .4)` | leaving: it picks up speed as it goes |

Only `transform`, `opacity`, `clip-path` and `stroke-dashoffset` are animated, so every movement stays cheap beside
the WebGL scene. No filter or blur is ever animated.

## A selection and an order (the RTS answer, under 100 ms)

- **Selecting a field** draws its dashed outline round the field on the land (`stroke-dashoffset`, 180 ms) with the
  four registration marks landing at the corners at once; the command bar is laid in from the right edge (16 px,
  `--t-sheet`, `--ease-paper`). Selecting another field moves the outline; the bar stays and its contents change
  in place (no re-entry).
- **Giving an order** (a click, its key, or a right-click on the field): the button presses (`--t-tap`), the "On the
  list" stamp comes down on the order line and on the field's tag (`--t-stamp`, from scale 1.15, a 4 degree turn),
  and the person who will do it gets a Next slip over their time-book cell (`--t-slip`). Sound: the game's knock
  for 'order', then a rubber stamp's thump under 100 ms.
- **A refused order** shakes nothing: its catch line turns red and says why, at once.

## A sheet arrives and leaves

- **A card** (a field's command bar, a person's page, the work grid) is laid down: it starts 14 px out, at full
  opacity (paper is never translucent), and comes to rest in `--t-sheet` on `--ease-paper`.
- **A sheet** (the catalogue, the ledger, the office file) slides in from the edge it belongs to over 28 px.
- **A telegram** arrives from 30 px above with a 1.5 degree turn; the "Stopped for you" tag drops from under the
  clock in the same moment (`--t-slip`) and the veil comes over the land (`--t-sheet`).
- **Leaving**, everything goes the way it came, in `--t-leave` on `--ease-in`.

## Dig day

1. **The scale.** The platform scale's face is laid down over the dimmed land. The needle sweeps from 0 round the
   rim in `--t-sweep`, slowing as it nears the gross weight (`--ease-out`); as it passes each grade's band on the
   rim the band inks in, with a soft clack of the grader per band. The figure under the dial counts with it.
2. **The ticket prints.** The buff ticket feeds out from the slot under the dial (`clip-path`, 500 ms), then the face
   lifts away and the ticket is laid flat in its place (`--t-sheet`).
3. **The machine figures.** The violet net weight arrives digit by digit like a numbering machine (at most 600 ms,
   left to right). Then the "Weighed" stamp comes down in the corner (`--t-stamp`, from scale 1.2, the one heavy
   stamp of the season, with its sound).
4. **Taking the crop.** The chosen way tears off along its perforation (`--t-tear`): it drops 6 px and turns 3
   degrees as a `clip-path` opens along the dashed edge, then the ticket leaves.

Reduced motion: the needle stands at its weight, the ticket is simply there, the stamp is already on it.

## Stamps (only where the moment earns them)

Weighed, paid, a decision lapsing, an order on the list. Each comes down once, in `--t-stamp`, and never animates
again. Nothing else on screen is a stamp.

## A number changes

- **The balance** changes at once; a sale or a wage also brings a brief pencil tick beside it (`--t-slip`, gone in
  1.2 s).
- **Stamped figures** (weights) step through like a numbering machine; every other figure changes at once.

## A goal is met

The canary slip's text is struck through in pencil from left to right (`--t-slip`), the slip lifts and turns away
(`--t-leave`), and the next goal's slip is hung in its place (`--t-slip` on `--ease-paper`).

## A day passes

The calendar leaf's number changes with a short tear (`--t-tear`) at 1×; at 2× and 3× it simply changes. The season
track's pencil line grows in the same moment.

## An alert comes in

A slip is pushed up from the foot beside the time book (`--t-slip`, `--ease-out`), the ones above it moving up by its
height. A bad one arrives with its red rule drawn down its left edge (120 ms) and the game's alert sound.

## People on the land

A face pin never scales with the camera. When picked it gains its ring and name tag (`--t-slip`); when it needs you
the red badge comes down (`--t-stamp`); when hurt it tips over (`--t-sheet`). Pins never bob or pulse.

## Reduced motion

Every arrival and departure is a cross-fade of 120 ms; stamps, ticks, outlines and rings appear complete; the
needle, the leaf and the figures change at once. The sounds stay, since they carry the answer that motion would
have given.
