# The County: the guided first year

The owner, after playing the live build with the first guide in it: "it just needs to pause when the things pop up so
you can see it and be more obvious to start the tutorial", and then: "The game is just too fast and too much at once
theres all these things happening and even with the tutorial you have no idea why theres all this text on thes creen
you dont know why your doing what your doing ever". This file is the guide's design after that: a calm first year
that says why. The code is `src/game/tutorial.ts` (the lessons and their state, no DOM), `src/ui/tutorial.ts` (the
cards, the note, the pointing hand, the clock's hold, the guide's own paper) and `src/ui/system/tutorial.css`; the
tests are `tests/tutorial.test.ts` and `e2e/tutorial.spec.ts`.

## The rules

**A. Offered where it cannot be missed.** Play on a new farm, in a browser that never answered, puts a card in the
middle of the screen: "First time on the farm?", one line, and two numbered replies as on a telegram: 1 "Start the
tutorial" (filled, the pointing hand, marked the usual choice, under the keyboard) and 2 "Skip the tutorial". The plan
behind it cannot be reached until it is answered. Keys 1 and 2 answer; Escape is Skip the tutorial. It is asked once
in a browser. The title's contents carry "Guided first year" under Play, which starts a guided farm outright; the menu and
How to play keep the guide's paper.

**B. What the game is, before the first season.** The guide's first card says it as a picture: the year's five
phases in a row (plant in May, tend, kill the vines in September, harvest, sell or store), the year-end bills
as their real figure ($19,000: the yearly bank payment and the family's living costs), and the deal: "Your crew
handles the field work and you make the big decisions. I'll pause the game and explain each one as it comes up." The
date board carries the same five phases all year, for
every player, the present one marked, each with a sentence on hover or tap (on a phone the present phase and the
next stand at the ends of the season's rule, to keep the top board to a fifth of the height).

**C. Every note stops the clock.** The moment a note appears in a season the days stop, and they stay stopped until
the note is dealt with: its control pressed, Got it, a "Skip to", Skip, or Turn off the tutorial. The note says
"Paused".
The days then go on at the speed they had. The clock's keys are the player's: Space or a speed key pressed in the
second and a half after a key or click of theirs puts a note away and lets the days go; the game starting the clock
by itself (a paper closing, a telegram answered) is held again at once. A note never appears, changes or moves under
a running clock: nothing is shown while the days run except what has stopped them.

**D. One voice.** At most one thing asks for attention: the guide's note, or a card that needs an answer (a
telegram, the spraying question, a weigh ticket, the offer). While a card is up the guide says nothing beside it;
the first telegram and the first weigh ticket carry one line from the agent inside the card. In the guided first
year: no hint toasts, no toast for news that is not bad (the crew starting work, the kill dates), no test-dig tray
laid on the land unasked, no goal slip in the season (the notes say what is next; it contradicted them: "Spray
before blight arrives" under a note saying there was nothing to do), and no "Needs your order" chip for a vine kill the
crew will do by itself. For every player: toasts and the "Go on" and "Days running" keys are hidden while a note or
a card is up, the spraying question is three short replies, and the first-time tip for an order is five words
("Spray: click the ringed stamp.").

**E. Each note says what, why and what to do.** What the thing is, why it matters as a consequence, and what to do
now (often: nothing). 35 words at most, in the voice of `docs/VOICE.md`: no term is used before a note has said
what it is (blight is "a disease that can wipe out a field in one wet week" the first time it is named, hilling is
"(piles soil over them)").

**F. The screen grows with the year.** In the guided first year the season opens on the land, the date and the
cash. Each other piece appears when it first matters, introduced by the one note that holds the clock for it:

| Piece | Hidden until | Introduced by |
| --- | --- | --- |
| The fields' tags | the first day | "Your fields" |
| The people (faces on the land, the time book) | planting begins | "Planting day" |
| The forecast | blight weather | "Blight weather" |
| The list of work | the crew's first spray, or the first call | "The work list" / "A decision on a field" |
| The stamps on fields | the first call that is the player's | "A decision on a field" / "Kill the vines" |
| The figure after the year-end bills | the first crop weighed | "The year-end bills" |

A hidden piece keeps its place in the layout (`visibility: hidden` on a class of the root, `st-hide-<piece>`), so
nothing moves when it arrives. A skipped or passed note still brings its pieces. Turning off the tutorial, or any year
after the first, shows everything.

What has arrived says less than it does in a later year (the root's class `guided`): the forecast gives its figures
for today and tomorrow and only the day, the sky and the blight leaf after that; an order on a field's tag is its
mark without the words "On the list"; the list of work is the next two orders and a count; the line saying what the
money just did is left out. The year's phases on the date board are, for every player, the year card's five marks
with only the present one named in a word (Plant, Tend, Kill, Dig, Sell): an ordinary season screen is held under
80 words by `e2e/interface.spec.ts`, and five names did not fit in it.

**G. Few decisions, no dead time.** The crew plants, hills, walks, digs and hauls by itself. The first year asks for
the spraying question (with "Keep the fields sprayed" marked the usual choice), the telegrams the year sends, and
each weigh ticket. A note with a wait after it carries "Skip to <the next thing>": the days run at the fastest speed
to the next note, then go back to the speed they had. A telegram on the way stops them, and answered, they run on to
the note the skip was for; a weigh ticket ends the skip, and so does the player's own hand on the clock. A stop the
guide has explained once (frost on the barrels) is not made again that year: the crew sees to it and the days go
on, so the clock never stands with nothing on the screen saying why. No telegram comes in a farm's first year before its
first planting is finished (before mid-June; `QUIET_UNTIL`, `drawIncidents` in `src/sim/season.ts`), so nothing asks
a question before the player has seen a field planted.

**H. About a dozen notes.** The guided first year to the first sale is the list below. Later lessons (the cellar,
the account book, the second spring) are as they were, held to 40 words.

## Budgets, and where they are held

| Budget | Limit | Held by |
| --- | --- | --- |
| A note's words (what it asks and why) | 35 | `tests/tutorial.test.ts` (every first-year note, three ways of playing, real seasons), `e2e/tutorial.spec.ts` (as shown) |
| A later lesson's words | 40 | `tests/tutorial.test.ts` |
| A card's words (the offer, what a year is) | 80 | `e2e/tutorial.spec.ts` |
| Words in view on the season screen with a note up (boards, land, list, people and the note with its keys; field names aside): the first guided day | 80 | `e2e/tutorial.spec.ts` |
| The same, any moment of the guided first year | 100 | `e2e/tutorial.spec.ts` |
| The same with a telegram or the spraying question up instead of a note | 120 | `e2e/tutorial.spec.ts` |
| Things asking for attention at once (note, offer, telegram or spraying card, weigh ticket or other paper, toast, test-dig tray, pressing-work pop) | 1 | `e2e/tutorial.spec.ts`, at every step |
| The clock's speed while a note or a card is up | 0 | `e2e/tutorial.spec.ts`, at every step |
| Notes from Play to the first sale | 16 kinds | `e2e/tutorial.spec.ts`; `tests/tutorial.test.ts` holds a whole simulated first year to 18 |

The budgets are held by cutting the screen, not by raising the number. The weigh ticket is the one paper allowed to
be rich (a field's whole account: about 215 words); it is laid over the screen and is not counted in the screen's
words.

## The guided first year, note by note

Words are for a mouse; a touch screen says "Tap" and "pinch", the keyboard its keys.

| # | Note | When | It says | Then |
| --- | --- | --- | --- | --- |
| 0 | The offer (card) | Play, a new farm | "First time on the farm? I can walk you through your first year one step at a time, pausing the game to explain each one." 1 Start the tutorial / 2 Skip the tutorial | |
| 1 | How a year works (card) | the first plan | The five phases as a picture; "At the end of each year you owe $19,000 to the bank and your family, so your crop needs to earn at least that. Your crew handles the field work and you make the big decisions. I'll pause the game and explain each one as it comes up." | Begin |
| 2 | Start the first season | the first plan | "Your plan is ready, with 4 fields of potatoes. Click Start the season. The bank's spring loan covers the cost, and your crop pays it back." | the key itself |
| 3 | Your fields (brings the tags) | the first day | "These tags mark your fields. This year 4 will grow potatoes and 2 are resting. It's too cold to plant yet. Your crew will start automatically when the soil warms." | Got it |
| 4 | Look around | after 3 | "Drag to move around the farm, and scroll to zoom in. Planting starts when the soil warms up, in about 9 days." | Skip to planting day |
| 5 | Planting day (brings the people) | planting begun | "Your crew has started planting. You didn't need to tell them. You're on the crew too, and your face at the bottom shows what you're doing. The same face on the land is you." | Skip to the end of planting |
| 6 | The summer | every field planted | "Planting is done. All summer your crew hills the rows (piles soil over them) and checks for disease. You don't need to do anything until blight weather arrives. That'll be your first big decision." | Skip to your first decision |
| 7 | Blight weather (brings the forecast) | the blight watch begins | "Blight weather is coming. Blight is a disease that can wipe out a field in one wet week. The forecast marks it with a red leaf. Spraying protects a field for about a week." | Got it, then the spraying question, the usual choice marked |
| 8 | The work list (brings the list) | the crew's first spray on the list | "Your crew now sprays on its own. The work list at the bottom shows their jobs in order. Each spray costs about $X a field. You don't need to do anything else." | Skip to the next decision |
| 8b | A decision on a field (brings the stamps and the list) | a call that is the player's ("ask me", or water) | "A ringed stamp means a field needs a decision from you. This one: <the need>. Click the stamp to order it. The job goes on the work list." | the stamp, or Got it |
| 9 | Kill the vines (brings the stamps) | the kill in sight | "The crop is nearly ready. Killing the vines stops the growth, so the skins toughen for harvest. Your crew will do this automatically on <day>. Click a stamp to do it sooner." | Skip to the harvest |
| 10 | Frost on the barrels (only if it comes) | the clock stopped for frost | "Frost tonight would ruin the potatoes still sitting in barrels in the field. Your crew will haul them in first, so you don't need to do anything." | Got it |
| 11 | The harvest | digging begun | "The harvest has started. Your crew digs the potatoes into barrels and hauls them to the potato house. You don't need to do anything. Each field is weighed when its barrels are in." | Skip to the weigh ticket |
| 12 | The first weigh ticket (the agent's line inside it) | the first field weighed | "This is your first weigh ticket. It shows what the field grew and what was lost. Sell now is the safe choice." | Sell or store |
| 13 | The year-end bills (brings the figure) | the ticket answered | "Your first crop is weighed. Under your cash you'll see what's left after the year-end bills of $19,000. It counts the crop still in the ground, so it'll change until every field is in." | Skip to the next ticket |
| 14 | Close out the season | the season done | "The crop is in, so the season is over. Click Close out the season. Winter comes next, and that's when you can sell what you stored." | the key itself |

The first telegram carries, inside it: "The game is paused until you pick a reply."

After the season: Winter in the cellar, Fell woods in winter, Raise a building, The ledger; then the second
spring (a variety, People, who to hire, Land, the money, Start the second season) and its season (Your decisions this
season, Meet your hired hand, Who does what, Name a foreman), in the same voice.

## How it behaves

- **Refusable at every step.** Every note has "Turn off the tutorial"; a note that asks for a press has Skip. The
  guide's paper ("Guided first year", from the menu and How to play) lists every lesson, turns the tutorial on and
  off ("Show the tutorial"), and replays any lesson ("Replay"). Progress
  is kept in the browser under `the-county/tutorial`, apart from the save, and survives a reload.
- **The cards take the keyboard.** While the offer or the year card is up, the layers behind are inert and keys
  other than the card's own are taken by nothing.
- **Placed where it covers nothing it is about.** The note floats at the first clear place nearest the top middle of
  the land, off the boards, the list and every panel, and never over what it points at. In spring it lies over no
  row of the catalogue; on a phone it sits in the sheet above the order blank.
- **The pointing hand only where it is clear.** Beside what it means, on bare land or a sheet's empty ground; left
  out where there is none.
- **A press meant for it never falls through.** A note's keys take no press for 450 ms after it appears (a click
  meant for the land under it does not answer it), and for half a second after it goes a press where it lay is
  taken by nothing.
- **For everyone.** Words differ for a mouse, a touch screen and the keyboard. Each note is read out once to a
  screen reader. Reduced motion stills its arrival. Its keys are 44 px tall.

## How it is checked

- `tests/tutorial.test.ts`: the offer made once; the opening's order on three farms; every piece of the screen held
  back and brought by its note, and never held back off the guide or past the first year; "ask me" and "by itself"
  each explained; the word limits in every way of playing; storage, skipping, replaying; and the simulation's rule
  that no telegram comes before the first planting is finished.
- `e2e/tutorial.spec.ts` (Chromium and the phone): a guided first year played from Play to the first sale by
  pressing only what the notes ask (their "Skip to", Got it, the control they point at, a card's usual reply),
  holding every budget above at every step; Space putting a note away, the next note holding the days again; the offer centred, under the keyboard, answered by click and by keys 1
  and 2; Skip the tutorial showing the whole interface and no note; a guided farm started from the title; a reload keeping
  its place; axe with the offer, the year card and a note showing.
- `tools/quality/capture.ts`: the states `guide-*` (the offer, the year card, the plan's note, the first guided
  day, each note of the year, the spraying question, the first telegram and weigh ticket, the cellar, the account
  book, the second spring, the guide's paper) at all eight sizes.

## Known limits

- The frost note keys on the clock's own stop saying "frost"; if that wording changes the note does not come.
- The vine-kill note reads the crew's kill day out of `S.pressing`'s words (the first "on <Month> <day>" after
  "vines" in the same sentence, as in "kills the vines on <day>"); if that wording changes past that, the note
  drops the day and keeps the trade.
- A farm that plants nothing before mid-June gets its telegrams from then on.
- Later telegrams and tickets of the first year carry no line from the agent: the first one taught them.
- In the guided first year the test-dig tray is not laid on the land by itself; it is on the field's card.
