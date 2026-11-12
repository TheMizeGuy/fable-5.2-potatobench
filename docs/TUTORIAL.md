# The County: the guided first year

The owner, after playing the live build: "we need a full tutorial", and "UX needs to be much more intuitive". This file
is the tutorial's design: who speaks, how it behaves, every lesson with what starts it and what ends it, and why they
come in this order. The code is `src/game/tutorial.ts` (the lessons and their state, no DOM), `src/ui/tutorial.ts`
(the slip, the fist, the guide's own paper) and `src/ui/system/tutorial.css`; the tests are `tests/tutorial.test.ts`
and `e2e/tutorial.spec.ts`.

## What it is

The **county agent's notes**: a printed slip, one of the farm's own papers, that says one thing at a time in the real
game on the player's own first farm. Each note asks for one thing in under 20 words and gives its reason in under 20
more. The printer's fist sits beside the one control the note means (the code's mark for "the one next thing"), on a
paper disc with a keyline so it reads over any land. There is no slideshow, no sandbox and no wall of text.

- **Teach by doing.** A note ends when the farm or the app shows the thing done: a field picked (`app.selection`), a
  person picked (`app.unit`), the clock running (`app.speed`), an order on the list or carried out (the campaign), the
  camera moved (measured from the scene's anchors, `fieldAnchor`). Only notes that ask the player to read something
  carry a button, "Noted". A note whose thing is already done is passed over without being shown, so a player who runs
  ahead is never held behind it.
- **When it first matters.** A short opening (about five minutes) uses the idle weeks: a season opens on 20 April
  about four weeks before the soil is warm enough to plant. Every later note comes the first time its moment does in
  year one (a telegram, the rows up, blight weather, a frost, the dig, the weigh ticket, the cellar, the account book),
  then the second spring's catalogue and the farm it opens up.
- **Refusable.** A new farm started from the title carries the offer once, tucked into the seed catalogue above Start
  the season: "Guide my first year" or "Straight in". It never blocks: pressing Start the season without answering is
  straight in. Every note has Skip and "Stop the guide". The guide's own paper (from the menu, and from How to play)
  lists every lesson with a pencil tick for those behind the player, turns the guide on and off, and shows any lesson
  again ("Again": it comes back the next time its moment does, guide on or off). Progress is kept in the browser under
  its own key, `the-county/tutorial`, apart from the save, and survives a reload.
- **Never fights the player.** Nothing is locked; there is no modal over the land. The guide never changes the clock's
  speed. In the guided first season Start the season leaves the clock stopped until the note that starts it, and the
  slip says "Clock held" while it is. A paper puts the notes away until it closes; the weigh ticket's own note is the
  one shown over its paper, set beside it. A telegram's note comes first and lies beside it, never over it.
- **Placed where it covers nothing it is about.** In spring the slip sits in the catalogue. Elsewhere it floats at
  the first clear place nearest the top middle of the land, keeping off the boards, the time book and every panel; if
  there is no such place it keeps at least off what it points at, the fist, the clock, a command bar, a telegram, a
  paper, a test-dig tray and a person's card, giving up its reason line (compact) if it must; with no room even then
  it stays hidden and its words are still read out. It stays put until something comes over it.
- **For everyone.** Words differ for a mouse, a touch screen and the keyboard, chosen by what the player last used:
  keys are taught only to someone using them. Each note is read out once to a screen reader, politely. Reduced motion
  stills the slip's arrival and the fist's nudge. The slip's buttons are 44 px tall.
- **Quiet beside the old tips.** While the guide is on, the one-line first-time tips for each order keep quiet: the
  notes say the same thing at the same moment.

## The lessons

"Starts" is the moment it can be shown; "ends" is what passes it. All of them are passed over, unshown, once what
ends them is already true.

### The opening (first spring and the idle weeks)

| # | Lesson | Starts | Ends | Points at |
| --- | --- | --- | --- | --- |
| 1 | Start the first season | The first spring's plan | The season begins | Start the season |
| 2 | Look round the land | The season screen | The camera panned or zoomed | (the land) |
| 3 | Turn and tip the view | The season screen | The camera turned or tipped | (the land) |
| 4 | Read the boards | The season screen | Noted, or three days run | The forecast |
| 5 | Pick a field | The season screen | A field picked | The first potato field's tag |
| 6 | Read a field's card | A field picked before planting is possible | Noted, the card put away, or planting begun | The card |
| 7 | Meet your people | The season screen | Noted, a person picked, or four days run | Your face pin |
| 8 | Start the clock | The season screen | The clock running | 1× (or the play key) |
| 9 | Hurry the quiet weeks | The clock running before the soil is warm | 3× chosen, or planting possible | 3× |
| 10 | Give the first order | A field can be planted | A planting order on the list | That field's ringed stamp |
| 11 | See the order taken | A planting order on the list, nothing planted | A field planted | You, on the land |
| 12 | Plant the rest | One field planted, others to plant | Every field planted, or several picked at once | The next stamp |

Why this order: the clock is held until lesson 8, so that the first things learned are the ones a player needs to
see anything at all (the camera), then to know where they are and what is coming (the boards and the goal slip), then
the land as the interface (pick a field, read its card), then who does the work. Lesson 6 exists because in April the
card offers Plant and seed in cold ground rots: the card itself says hold off, and the note makes sure that is read.
Only then do the days run, faster through the wait, until the ringed stamp of planting day, which is the first order
(10), seen taken (11) and repeated with the shortcut that gives one order to many fields (12). Lessons 10 to 12 come
ahead of any of 2 to 9 not yet passed, because planting day matters more than the camera.

### The first year (each the first time it comes)

| Lesson | Starts | Ends | Points at |
| --- | --- | --- | --- |
| Answer a telegram | A question waiting (it stops the clock) | That question answered or lapsed | The first reply |
| Walk a field for blight | The first scouting stamp | A walk ordered or done | Its stamp |
| Hill the rows | The first hilling stamp | Hilling ordered or done | Its stamp |
| Spray before the blight | The first spraying stamp (blight weather) | Spraying ordered or done | Its stamp |
| Frost in the forecast | Frost likely within two days, with plants up or barrels out | Noted, or the frost days past | The forecast |
| Lift a test hill | The first test-dig stamp | A test dig ordered or done | Its stamp |
| Water a dry field | The first watering stamp | Watering ordered | Its stamp |
| Pull blighted plants | The first roguing stamp | Roguing ordered | Its stamp |
| Kill the vines | The first vine-kill stamp | Vines ordered killed or killed | Its stamp |
| Dig the crop | The first digging stamp | Digging ordered or begun | Its stamp |
| Bring the crop in | Barrels in a field | Noted, or the crop weighed | The field |
| Sell or store the crop | The first weigh ticket open | The ticket answered (closed), or a sale | (the ticket's own fist) |
| Close out the season | The ground frozen | The season closed | Close out the season |
| Winter in the cellar | The cellar | A month gone by | On to the next month |
| The account book | The year end | The next spring planned | Plan year 2 |

The telegram, the weigh ticket and closing the season come ahead of everything: the clock has stopped for them. The
others come in the crop's own order, which is also reference practice's (`src/sim/advice.ts`), so each arrives the
day its stamp first appears on the land and points at that stamp.

### The second spring, and the farm it opens up

| Lesson | Starts | Ends | Points at |
| --- | --- | --- | --- |
| Choose seed for a field | A later spring | A field picked in the plan | The first potato field |
| Hire a hand | A later spring | People opened, or someone hired | People |
| Rent or buy land | A later spring | Land opened, or land beyond the home six taken | Land |
| The money and the loan | A later spring | The money opened | The money |
| Start the second season | A later spring | The season begins | Start the season |
| Give a hand an order | The season, with someone hired | A hand picked | Their face |
| Clear woods into a field | A later season, woods or brush held | Felling ordered or under way | The tract's tag |
| Raise a building | A later season, a building affordable | The yard picked, or a building ordered | The home yard |

Why: the first year teaches the crop with the farm as it is given; the catalogue's seed, people, land and the bank's
loan are left for when a year's result makes them choices. Machines and contracts are left out: the catalogue's own
words cover them, and the goals ladder (`src/game/goals.ts`) brings them forward.

## Words

The words are the county agent's: plain, second person, the game's own terms, no real place and no calendar year.
`tests/tutorial.test.ts` holds every lesson to 20 words for the ask and 40 with its reason, in all three ways of
playing, in every state a guided year shows it in.

## How it is checked

- `tests/tutorial.test.ts`: the opening in order with the clock held; every year lesson starting and passing from real
  simulated seasons (several seeds, until each has come); the second spring; a player who runs ahead passed over
  every step already done; papers and telegrams; skipping, stopping, replaying; storage round trips; the word limits.
- `e2e/tutorial.spec.ts` (Chromium and the phone): a new farm from the title, the guide taken, followed to the first
  planting by doing only what each note says at the control its fist marks, checking the slip never lies over its
  target, the clock, a command bar, a telegram or a paper; refused, a season to its first planting with nothing shown;
  a reload, a skip, the guide stopped and a lesson shown again from the menu and from How to play; axe with the offer,
  a note and the guide's paper showing.
- `tools/quality/capture.ts`: the states `guide-*` at all eight sizes.

## Known limits

- The camera lessons end on the scene's anchors moving, so a camera moved by something else (an alert clicked that
  brings a field into frame) can pass them.
- With one person on the farm, a click on your own face does nothing yet; "Meet your people" is therefore read and
  noted, and passes by itself if a person is picked once that click does something.
- The weigh ticket's note shows only where the ticket leaves room beside it; on a phone it is read out instead.
