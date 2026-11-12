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
  ahead is never held behind it. A note to read is never passed by the days running: it waits for Noted. The slip
  carries no "n of m" count (round three saw it jump as lessons were passed over); it names the part of the year.
- **When it first matters.** The opening is only what a player needs to watch the first planting: the money and
  Start the season in spring, the clock, then planting day itself. Everything else (the forecast, the almanac, the
  list, the camera's turn, a field's card) comes the first time it is wanted, and every later note the first time its
  moment does in year one (a telegram, blight weather, a frost, the dig, the weigh ticket, the cellar, the account
  book), then the second spring and the farm it opens up. Round two of first-time players had the first real order at
  request 29 of 90 behind a tour of the camera, boards, almanac, card and face; that tour is gone.
- **Refusable.** A new farm started from the title carries the offer once, tucked into the seed catalogue above Start
  the season: "Guide my first year" or "Straight in". It never blocks: pressing Start the season without answering is
  straight in. Every note has Skip and "Stop the guide". The guide's own paper (from the menu, and from How to play)
  lists every lesson with a pencil tick for those behind the player, turns the guide on and off, and shows any lesson
  again ("Again": it comes back the next time its moment does, guide on or off). Progress is kept in the browser under
  its own key, `the-county/tutorial`, apart from the save, and survives a reload.
- **Holds the clock for a click, and says so.** In the guided first season Start the season leaves the clock stopped
  until the note that starts it. A note that asks for a click on something the days move (a need's stamp, a face on
  the land) or to watch something happen (the first planting) stops the clock while it shows, says "Clock held", and
  lets the clock go on at the speed it had once it passes. While it holds, a line under the clock itself says "Held
  for the agent's note. Any speed goes on." Any speed key starts the clock at once, and a player who starts it is not
  stopped again for that note. Only the player's own press counts: the game
  setting the clock going again (a paper closing, a telegram answered) while a note holds it is held again. The line
  goes under the clock, else over it, else under the "Go on" key, and never over a face, the list or a panel. The clock's own stops (a telegram, a weigh ticket, frost on barrels, the season's end) are
  explained the first time, under the clock's tag. A paper puts the notes away until it closes; the weigh ticket's own
  note is the one shown over its paper, set beside it. A telegram's note comes first and lies beside it, never over it.
- **One at a time, never a step ahead.** The note on show keeps its place until it passes; only an urgent one (a
  telegram, a weigh ticket, the clock stopping) comes in front, and the one it interrupted comes back after it. After a
  note passes the next waits a moment, and waits while a panel its click opened (a catalogue fold, a paper, a person's
  card, the grid) is still open, so People is not left half read for Land, for eight seconds at most: a card left open
  never silences the guide. A note that cuts in (urgent, or one that holds the clock) is the only kind that takes over
  from a note on show.
- **Placed where it covers nothing it is about.** In spring the slip sits in the catalogue; while a fold the note is
  not about is open (Equipment, say) it shrinks to its one line, so the fold keeps its room. Elsewhere it floats at
  the first clear place nearest the top middle of the land, keeping off the boards, the time book and every panel; it
  never lies over what it points at, the list or panel holding that, the fist, the clock, a command bar, a telegram,
  a paper, a test-dig tray or a person's card. Where it must lie over a panel it goes short (its reason line folded)
  and over the top boards before a sheet of words; with no room even then it stays hidden and its words are read out.
  It stays put until something comes over it, and moves the frame a card, a clock or a telegram slides over it.
- **The fist only where it is clear.** It sits beside what it means (left, right, then toward the middle of the
  screen), on bare land or a sheet's empty ground only: never on words, a figure, a face, a key, a tag or a control.
  Where no such place exists (a reply inside a telegram, Start the season under the order blank on a phone) it is
  left out and the slip's words do alone. When a field it points at is out of view, the slip adds how to bring the
  farm back (Home, or a double-click or double-tap on open ground).
- **A card in the way.** When what a note points at lies under a card (a person's card, a field's card, the grid),
  or on a phone a card covers half the land during a note about the land itself, the fist goes to the card's cross
  and the slip says "A card is in the way: its cross puts it away."
- **Points only at what is there.** A note that names a control another part of the game may not show (a foreman's
  button, the seed choice) completes from the farm's state and keeps its words when the control is missing; no note
  sends the player to a long goal the farm cannot do now (`S.goalCosts`).
- **For everyone.** Words differ for a mouse, a touch screen and the keyboard, chosen by what the player last used:
  keys are taught only to someone stepping through the screen with Tab or Enter (Space, a speed key or a letter
  is not enough). Each note is read out once to a screen reader, politely. Reduced motion
  stills the slip's arrival and the fist's nudge. The slip's buttons are 44 px tall.
- **Quiet beside the old tips.** While the guide is on, the one-line first-time tips for each order keep quiet: the
  notes say the same thing at the same moment.

## The lessons

"Starts" is the moment it can be shown; "ends" is what passes it. All of them are passed over, unshown, once what
ends them is already true. "Holds" marks a note that stops the clock while it shows.

### The opening: what the first planting needs

| # | Lesson | Starts | Ends | Points at |
| --- | --- | --- | --- | --- |
| 1 | The money | The first spring's plan | Noted, The money opened, or the season begun | The plan's money lines |
| 2 | Start the first season | The first spring's plan | The season begins | Start the season |
| 3 | Start the clock | The season, the clock held | The clock running | Let the weeks go: 3× (or 3×) |
| 4 | Watch the first planting (holds) | Planting on the list by the one planting rule, or just begun | The camera brought closer or moved, or three days run | You, on the land; says the routine began it with no order |
| 5 | Meet your people (holds) | After 4 | You picked, or Noted | Your face |
| 6 | Give the first order (holds) | A planting stamp ("ask me" only) | A planting order on the list | That field's stamp |
| 7 | Routine work and your calls | A job the routine listed, after 5 | Noted | The list |
| 8 | Plant the rest (holds) | One field planted, more stamps ("ask me" only) | Every field planted, or several picked at once | The next stamp |
| 9 | The list of orders | After 5, with orders waiting | Noted | The list |
| 10 | Turn and tip the view | After 5 | The camera turned or tipped (or turned out of view) | (the land) |
| 11 | Pick a field | After 5 | A field picked | Whichever potato field's tag is on screen |
| 12 | Read a field's card | After 11, with a field picked | Noted, or the card put away | The card |

Why: the money is said before the first Start the season because round two's players never understood it. The clock
is held until 3 so that nothing runs past a newcomer; 3 points at the goal's own "Let the weeks go" key. Planting day
holds the clock so the planting can be watched rather than missed at 3×, and "Meet your people" asks for the click on
your own face while it is held. 7 to 12 come after the planting is under way, when there is something to see on the
list, a reason to turn the view and a crop to read on a card.

### The first year (each the first time it comes)

| Lesson | Starts | Ends | Points at |
| --- | --- | --- | --- |
| How spraying is done (urgent) | Blight weather's spraying question on the telegram card (`spray-ask`) | Answered or put away | Its first reply (`spray-way-auto`) |
| Answer a telegram (urgent) | A question waiting (it stops the clock) | That question answered or lapsed | The first reply |
| Why the clock stopped (urgent) | The clock stopped by itself, not by the guide | Noted, or the clock going on | (the note at the foot) |
| Read the forecast | After the opening's planting, when the forecast first shows rain, frost or blight risk | Noted | The forecast |
| Open the almanac | After the forecast | The almanac opened | The forecast |
| Work that cannot wait | `S.pressing` lists work nobody will take | Noted, or nothing pressing | (the note at the foot) |
| Walk, hill, test dig, pull blighted plants, dig (holds) | Their stamp ("ask me" only; the routine does them) | Ordered or done | Its stamp |
| Spray before the blight (holds) | The first spraying stamp | Spraying ordered or done | Its stamp |
| Leave spraying to the crew | After the first spray, spraying not by itself | It is set to by itself, or Noted | (words: `S.sprayOutlook`'s passes and dollars) |
| Frost in the forecast | Frost likely within two days, with plants up or barrels out | Noted, or the frost days past | The forecast |
| Water a dry field (holds) | The first watering stamp | Watering ordered | Its stamp |
| Kill the vines (holds) | The first vine-kill stamp | Vines ordered killed or killed | Its stamp; says the trade (small tubers stay small, skins set, safe from frost) and the day the crew kills them by itself, as `S.pressing` words it |
| What the year end takes | Digging begins, before the first weigh ticket | Noted, or the season closed | The pass book; says what the farm would end with (`S.moneyNow().after`) |
| Bring the crop in | Barrels in a field | Noted, or the crop weighed | The field |
| Sell or store the crop (urgent) | The first weigh ticket open | The ticket answered (closed), or a sale | (the ticket's own fist) |
| Close out the season (urgent) | The season done | The season closed | Close out the season |
| Winter in the cellar | The cellar | A month gone by | On to the next month |
| Fell woods in winter | The cellar, after its note, woods or brush held | Someone set to Woods, or Noted | Your Woods key in the winter's work |
| Raise a building | The cellar, after its note, a building the farm can raise (`S.goalCosts`) | Raise a building opened, or a building ordered | Raise a building |
| The account book | The year end | The next spring planned | Plan year 2 |

### The second spring, and the farm it opens up

| Lesson | Starts | Ends | Points at |
| --- | --- | --- | --- |
| Choose a variety for a field | A later spring | A field picked in the plan | A potato field's tag; speaks of seed only when there is saved seed |
| Hire a hand | A later spring | People opened, or someone hired | People |
| Rent or buy land | A later spring, once People is closed | Land opened, or land beyond the home six taken | Land |
| The money and the loan | A later spring | The money opened | The money |
| Start the second season | A later spring | The season begins | Start the season |
| The season's calls | The second season | Noted | The forecast |
| Meet a hand (holds) | The season, with someone hired, after the calls | A hand picked | Their face |
| Who does what | The season, three or more on the farm | The work grid opened | The grid at the foot |
| Name a foreman | After a hand was picked, with land beyond the home six and a hand to name | Noted, or a foreman named | Foreman on their card, where it shows |

Why: year two teaches the season's real work first (the calls), then people. Long projects come when the farm can
pay for them and the season has room: felling and building are taught in the winter, when the woodlot's own card says
felling is best done, never in May.

## Words

The words are the county agent's: plain, second person, the game's own terms, no real place and no calendar year.
`tests/tutorial.test.ts` holds every lesson to 20 words for the ask and 40 with its reason, in all three ways of
playing, in every state a guided year shows it in.

## How it is checked

- `tests/tutorial.test.ts`: the opening of only money, start, clock and planting day, with the planting and the first
  click held; every year lesson starting and passing from real simulated seasons (several seeds, the routine on and
  every kind on "ask me"); the money said before the first sale; the kill's trade; why the clock stopped; the second
  spring with the calls before people and blocks, and felling kept out of the season; a player who runs ahead passed
  over every step already done; papers and telegrams; skipping, stopping, replaying; storage; the word limits.
- `e2e/tutorial.spec.ts` (Chromium and the phone): a new farm from the title, the guide taken, followed through the
  whole opening by doing only what each note says at the control its fist marks. For every lesson reached it checks
  that the slip never lies over what it points at, the list or panel holding it, the clock, a command bar, a telegram
  or a paper; that the pointing hand lies on no words, figure, face, key, tag or control; and that a lesson asking for
  a click on something the days move holds the clock and says so. Refused, a season to its first planting with
  nothing shown; a reload, a skip, the guide stopped and a lesson shown again from the menu and from How to play; axe
  with the offer, a note and the guide's paper showing.
- `tools/quality/capture.ts`: the states `guide-*` (the offer, the money, the clock, planting day, you, the list, a
  field and its card, the first call, a telegram, the weigh ticket, the cellar, felling in winter, the account book,
  the second spring, the guide's paper) at all eight sizes.

## Known limits

- The camera lessons end on the scene's anchors moving, so a camera moved by something else (an alert clicked that
  brings a field into frame) can pass them; a gesture that turns the farm out of view counts as the gesture asked for.
- The weigh ticket's note sits over the boards beside the scale; on a phone it covers the date board while the ticket
  is up.
- On the cellar and the account book at a desk there is no clear land above the sheet, so the slip lies short over
  the top edge of the sheet.
- A telegram can arrive in the first days; once it is answered the game goes on with the clock by itself (main's
  rule since the routine), so the held opening clock can start then, and "Start the clock" is passed over.
- Later telegrams of the same year have no note: the first one taught them.
- A two-finger twist that starts on a field tag does not turn the view (the tag takes the touch).
- "How spraying is done" keys on the question's test ids (`spray-ask`, `spray-way-*`); if the interface's question
  changes them, the note keeps its words and loses its fist.
- The vine-kill note reads the crew's kill day out of `S.pressing`'s words ("kills the vines on <day>"); if that
  wording changes, the note drops the day and keeps the trade.
