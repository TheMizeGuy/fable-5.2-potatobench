# The County: the guided first year

## Tips, not a narrator (14 November)

The owner, after five rounds of the same complaint: "the tutorial thing should help as you play, not do one action and
spam before you realize what even happened to the next", "it shouldn't be obnoxious", and before that "the game is just
too fast and too much at once". Every earlier round changed the narrator's words or its speed. This one removed the
narrator. What follows in this section is the rule; where a later section says a note holds the clock, the guide runs
the clock or the guide frames a piece of work, that section is history.

**What a new player got before** (`tools/quality/ftue.ts`, a first year played by someone who takes the tutorial and
then does only what the game asks): 8 notes of 257 words, the longest 34; all 8 stopped the game (41 s stopped); 7
presses that only put a note away against 6 that played the game; the clock changed without the player's hand 26
times and the camera moved without it 13 times; 4 of the 8 notes said that nothing needed doing.

**What they get now**: 5 tips of about 90 words, the longest 20; none stops the game; no press is needed for any;
the camera never moves without the player's hand, and the clock only to go at 1x while a tip is up.

The rules, each held by `e2e/tutorial.spec.ts` ("a first year with tips") or `tests/tutorial.test.ts`:

- *A tip never stops the game.* The game stops itself only for a decision (`SELF_PAUSES` in `src/game/app.ts`), with
  its own line saying why. A tip may stand beside that decision and point at it; the pause stays the game's.
- *A tip never needs a press.* One that points at something to do goes when it is done. One that only tells goes by
  itself after long enough to read it twice (5 to 10 seconds, by its words). Each carries a quiet "Got it" or "Skip"
  and "No more tips", and none of them has to be used.
- *The clock and the camera are the player's.* The tips never move the view, never stop the days and never speed
  them up. One thing only: while a tip is up the days go no faster than 1x, so it can be read beside what it is
  about (the owner, earlier: "it just needs to pause when the things pop up so you can see it"), and when it goes
  they go back to the speed they had, Skip ahead included. A speed the player sets while a tip is up is kept. Empty
  stretches are the player's to pass: the season's first tip points at **Skip ahead** while the soil warms, and one
  after planting points at the fastest speed. (Offering Skip ahead beside the goal slip all season was tried and
  taken out: it put four more words on a full screen and took room from the test-dig tray on a short window.)
- *Only what the player acts on is taught, when it comes up.* Cut: "the summer" and "blight weather", which said that
  nothing needed doing (the goal slip says what is next, and the spraying card explains itself). Kept, shortened:
  skip ahead, the word to plant, run the days, planting day, the fastest speed, the work list, a ringed stamp, the
  vine kill, frost on the barrels, the harvest, the year-end figure.
- *Short.* Twenty words at the most for a tip shown while the days run, both lines together.
- *One at a time, and not back to back.* At least six seconds lie between one tip that only tells and the next.
- *The game's own guidance stays up.* The goal slip and the line that says why the game is paused are no longer
  hidden while a tip shows.

Checked against George Fan's rules for the Plants vs. Zombies tutorial (GDC 2012): blend it into the game; do rather
than read; spread the teaching out; a few words at a time; messages that never block; show a hint when it is needed;
never take control from the player.

Not yet done: the second spring's walk through the plan sheet is as it was.

The owner, after playing the live build with the first guide in it: "it just needs to pause when the things pop up so
you can see it and be more obvious to start the tutorial", and then: "The game is just too fast and too much at once
theres all these things happening and even with the tutorial you have no idea why theres all this text on thes creen
you dont know why your doing what your doing ever". And after round eight: "we should start the tutorial when
planting is ready and accelerate time during the tutorial where needed to help explain things". This file is the
guide's design after that: a calm first year that says why, that begins at the first thing the player does, and
that runs the clock itself between its notes (rule I). The code is `src/game/tutorial.ts` (the lessons and their state, no DOM), `src/ui/tutorial.ts` (the
cards, the note, the pointing hand, the clock's hold, the guide's own paper) and `src/ui/system/tutorial.css`; the
tests are `tests/tutorial.test.ts` and `e2e/tutorial.spec.ts`.

The narrator's code has since been removed: the guide running the clock between tips (`driving`, `runClock`), the
scenes that moved the camera to show work, the drive line, the clock's hold, and the "Set the speed for me" option in
the guide's paper. Progress saved with the old `clock:guide` or `clock:player` facts still loads; the facts are ignored.

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

**C. Every note pauses the game, and its keys say what they do to the clock.** The moment a note appears in a
season the game pauses, and it stays paused until the note is dealt with: its control pressed, Got it, or Turn off
the tutorial. The note says "Paused". Got it carries a second line that says what it does to the clock. While the
guide runs the clock (rule I) it reads "time runs on", and a moment after the note goes the guide sets the days
going. Once the clock is the player's it reads "resumes at 1×" (or 3×, 8×), and does exactly that: it puts the
game back at the speed on the clock just before the note, never one remembered from earlier. If the player had
paused the game themselves, or the note asks for a press (C3), the line reads "stays paused" and it does. Space
resumes at that same speed (the hold writes it to the clock, so the clock's marked key agrees). The
clock's keys are the player's: Space or a speed key pressed in the second and a half after a key or click of theirs
closes the note and runs the game; the game starting the clock by itself (a paper closing, a telegram answered) is
paused again at once. A note never appears, changes or moves under a running clock.

**C3. A note that asks for a press leaves the game paused.** Some notes only tell (the summer, the work list, the
harvest); some ask the player to do something on the land (give the word to plant, click a ringed stamp, click a
hand's face). An asking note's Got it reads "stays paused" and does that. A press on a stamp never changes the
speed: three frames after it the game is as paused as it was. Round seven's players had Got it resume at 8× so
that the press it had just asked for landed on a moving scene, and a click on the water stamp restarted the game by
itself (the hold let go when the lesson passed: `hold()` in `src/ui/tutorial.ts`). What happens next depends on
whose the clock is (rule I). With the clock the player's, the pause becomes their own: the clock shows "Resume at
8×", and Space or the clock resumes at the speed the game had. With the guide running the clock, the guide waits
for the press, saying so ("Planting waits for your word. Click a ringed Plant stamp."), and sets the days going a
moment after the last stamp asked for is pressed, or when the player presses "Go on without it". When a telling
note follows the press at once (the word to plant, then "You gave the word"), that note's Got it reads "time runs
on".

**C2. A notice pauses only the first time it teaches something.** In the guided year a kind of notice that asks
nothing (frost forecast on the barrels) comes once as a note, which pauses like any note; after that it arrives as
a toast and the game keeps running. Outside the tutorial it never pauses: the game stops itself only for a decision
that waits on the player (C4 lists every one) and for the season's end, unless the player turned on "Pause on
alerts". Round six's players were being stopped about once a month from May to October by
"Frost tonight" with nothing to answer, the tutorial on or off, because the frost warning was on the list of things
the clock always stops for (`STOP_FOR`, `src/game/app.ts`); it has been taken off that list.

**C4. A decision that waits for the player pauses the game, with the tutorial or without.** Round eight: all
three players missed the word to plant in year two. They pressed "Skip ahead at 8×" under "Plant when the soil
reaches 50°F", three days are a second and a half at 8×, and the crew started by itself. The game now pauses itself
the moment the crew asks for the word (the soil ready, the stamps up), in every year, with the tutorial on or off and
whatever "Pause on alerts" says. The pause says why and what to do in its own line, which stays for as long as it
waits: "Paused: the soil is ready. Press a ringed Plant stamp, or resume and your crew starts in 3 days." If none of
the stamps is on the screen the whole farm is shown. "Skip ahead" and the guide's own running of the clock (rule I)
only set the speed, so they stop there too. The three days are counted in days that run, so they begin when the player resumes
without pressing. A press on a stamp answers the pause and leaves the game paused (C3). In the guided first year the
agent's own note ("The soil is ready, and planting waits for your word...") is what says it, once.

The same rule holds for the other moments the year waits on the player's own decision and loses something if it is
missed, and for nothing else. Every cause that can pause the game by itself is one list, `SELF_PAUSES` in
`src/game/app.ts`, held by `tests/clock.test.ts`:

| Cause | The decision it waits on |
| --- | --- |
| The word to plant (`plantAsk`) | Start planting now, or let the crew start in three days. |
| A vine kill that is the player's to give (`killCall`) | Only where no kill would happen without them: they keep the vines up (said two days before the last day a kill still sets the skins), or the kill and the dig are both the player's own orders (said the day it comes due). The kill the crew does on its own date pauses nothing. |
| The season's spraying question (`spray`) | How spraying is done this season, at the first blight weather. |
| A crop weighed in (`weighed`) | Sell it now or store it. |
| A telegram (`incident`) | Its reply. |
| The season is over (`over`) | No days are left to run until it is closed out. |
| "Pause on alerts" (`alerts`) | Only for a player who turned it on: anything new that needs doing. |

In the guided first year each note also pauses while it is up (C). Opening a paper (the almanac, the menu) pauses
while it is open, by the player's own act. Nothing else pauses: frost on the barrels, a job the crew handles and
every other notice are toasts (C2), because the owner's round-six complaint about a pause a month that asks nothing
still holds.

**D. One voice.** At most one thing asks for attention: the guide's note, or a card that needs an answer (a
telegram, the spraying question, a weigh ticket, the offer). While a card is up the guide says nothing beside it;
the first telegram and the first weigh ticket carry one line from the agent inside the card. In the guided first
year: no hint toasts, no toast for news that is not bad (the crew starting work, the kill dates), no test-dig tray
laid on the land unasked, no goal slip in the season (the notes say what is next; it contradicted them: "Spray
before blight arrives" under a note saying there was nothing to do), and no "Needs your order" chip for a vine kill the
crew will do by itself. In any later year, while the agent has a note for the screen (showing, or waiting its turn
between two notes) the goal slip stands down whole, in its place, and so does the ring and the "... here" label it
puts on a fold of the spring sheet; when the agent has nothing to say the slip is back. They take turns rather than
say the same step because they are two different lists: the tutorial walks the spring sheet in the order a newcomer
reads it (a variety, People, Land, the money, Start), while the slip follows the farm's goals (a machine, a hand, a
contract, more land), and round six's players were shown "Buy a machine" beside "click a field's tag" and "Hire a
hand" just after "you don't have to hire". The slip never loses a part of itself: taking only its pointing hand
away (as the first calm year did) let its words slide into the hand's 34 px column, one word to a line, with the
days figure printed over them. For every player: toasts and the "Go on" and "Days running" keys are hidden while a note or
a card is up, the spraying question is three short replies, and the first-time tip for an order is five words
("Spray: click the ringed stamp.").

**E. Each note says what, why and what to do.** What the thing is, why it matters as a consequence, and what to do
now (often: nothing). 35 words at most, in the voice of `docs/VOICE.md`: no term is used before a note has said
what it is (blight is "a disease that can wipe out a field in one wet week" the first time it is named, hilling is
"(piles soil over them)", a foreman "orders the work on your fields away from home each morning").

**E2. A note says only what the screen and the game bear out.**
- It names a control by the words on it: the winter sheet's building list is 'Under Put up a building, click "8 to
  choose from"', not "Open Raise a building".
- It names the field whose stamp is on the screen. Of several fields that want the same thing, the note takes one
  whose stamp is in view and keeps to it while it is up; the pointing hand and "Show me" go to that same field.
- It is told once. The answer to a press is shown beside the pointer while a note is up (the notes at the side are
  hidden then); when the note itself says that sentence ("You gave the word. Your crew will plant the other 3
  fields too."), the answer beside the pointer is left out (round eight: it showed twice at once).
- A "Show me" goes to the thing its sentence is about: a field's stamp to the field, the foreman's key to that
  person's card with the key scrolled into view and ringed. The toast "Planting has started in <field>. Show me"
  (for players without the tutorial) waits until planting has been done there, not for an order held while the soil
  is still cold, and its Show me selects that field.
- It promises nothing the game may not do. The frost note used to say "Your crew will haul them in first, so you
  don't need to do anything", and then 100 to 200 cwt froze: the crew does haul first, but one tractor moves about
  900 cwt a day, the forecast misses some nights, and what is dug after the haul stays out. It now says what a frost
  does ("ruins a fifth of the potatoes still out in barrels") and carries the one thing the player can do about it,
  as its key: "Haul it in now". That is the same order, in the same words, as the frost toast's key for players
  without the tutorial (the `haulNow` command): it puts the haul first today for whoever brings in the most by dark,
  day off or not, and the game's own answer says how much comes in and how much stays out. There is one way to order
  the haul, not two.

**F. The screen grows with the year.** In the guided first year the season opens on the land, the date and the
cash, with the guide's line saying the weeks are passing (rule I). Each other piece appears when it first matters,
introduced by the one note that holds the clock for it:

| Piece | Hidden until | Introduced by |
| --- | --- | --- |
| The fields' tags and the stamps on them | the soil ready to plant | "Give the word to plant" |
| The people (faces on the land, the time book) | the word given | "Planting day" |
| The forecast | blight weather | "Blight weather" |
| The list of work | the crew's first spray, or the first call | "The work list" / "A decision on a field" |
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

**G. Few decisions, no dead time, and one act that is the player's.** The crew hills, walks, digs and hauls by
itself, and plants too, but each year's first planting waits for the player's word (round seven: two of three players
said the year ran without them; "let me start planting myself, or at least tell me the crew did it"). When the soil
is ready the crew says it stands ready, a ringed Plant stamp goes up on every planned potato field that is fit, and
the goal slip reads "Give the word to plant". One press (the stamp, Plant on the field's card, or P) starts planting
there and the crew carries on through the other planned fields by itself, with a note that says exactly that: "You
gave the word. Your crew will plant the other 3 fields too." With no press in three days the crew starts by itself
and says so; nothing is lost but those days. This is the simulation's rule, in every year and with the tutorial off
(`plantAsked`, `standingOrders` and `wordToPlant` in `src/sim/advice.ts`, `plantWordGiven` in `src/sim/season.ts`,
`PLANT_WORD_DAYS`); a save from before it, taken with planting ordered or begun, carries on. It is one deliberate
act, not a return to ordering everything. The first year also asks for
the spraying question (with "Keep the fields sprayed" marked the usual choice), the telegrams the year sends, and
each weigh ticket. No note carries a key to run the game fast: the waits between them are the guide's to run (rule
I). (Notes used to carry "Fast-forward to <the next thing>"; round eight's players pressed it and the planting, and
most of the season, went by before they saw it.) No telegram comes in a farm's first year before its
first planting is finished (before mid-June; `QUIET_UNTIL`, `drawIncidents` in `src/sim/season.ts`), so nothing asks
a question before the player has seen a field planted.

**H. About a dozen notes.** The guided first year to the first sale is the list below. Later lessons (the cellar,
the account book, the second spring) are as they were, held to 40 words.

**I. The tutorial starts when planting is ready, and the guide runs the clock.** The owner: "we should start the
tutorial when planting is ready and accelerate time during the tutorial where needed to help explain things".

- *It starts at the first thing the player does.* After Start the season no note comes until the soil is fit. The
  guide carries the player there itself: the days tick on the date board and the land thaws for two or three
  seconds (five times the clock's fastest: `OPENING_PACE`), under one line, "A few weeks pass while the soil
  warms. Next: planting, on your word." The game then pauses itself for the word (C4) and the season's first note
  is the ask: the ringed Plant stamp. What the opening tip used to teach is cut to what the first act needs: the
  tags arrive with their stamps and the note names the one to press; how to move the camera is said at the moment
  the guide first moves it (the planter); the money owed is on the year card.
- *Between notes the guide runs time on,* at half again the clock's fastest (`RUN_PACE`: three days a second), and
  says what is passing and what comes next in a line each: "Your crew is planting the other 3 fields. Next: the
  plants come up.", "Your crew hills the rows and walks the fields. Next: blight weather, your first big
  decision.", "Your crew is digging and hauling. Next: the first weigh ticket." A player who presses only what a
  note asks (Got it, the stamp it names, a card's reply) reaches the first weigh ticket with no speed key pressed.
  While the player has a card of their own open (a field, a person, a yard) the days go at 1×, so what they are
  reading does not change under them.
- *Where watching explains the thing it slows down and frames it.* The first day each kind of work is done in a
  first year (planting, hilling, a spray pass, a test dig, the vine kill, the dig, the haul), and the day the plants
  come up, the guide drops to 1× for four and a half seconds and follows whoever is doing it (or frames the field),
  saying who and where: "You're planting North Ridge." It says "is spraying" only of someone whose order is still on
  the list and theirs, in that field, and prefers such a one; of work that day finished it says "Bernadette sprayed
  North Ridge ahead of the blight." (`stillAt`, the rule the time book's word for a person follows in `ui/now.ts`:
  the line once had Bernadette spraying while the time book had her waiting). Someone who has gone on to other work
  is not followed: the field the work was done in is framed instead (the line once said Jeannette killed the vines in
  Brook Field over a picture of Bottom Field, where she was by then). Work is shown on a working day only (on a
  Sunday off the time book has everyone at home, and the line once said "You're planting North Ridge" beside it), and
  nobody worn out or hurt is said to be at work. And nobody is followed while they are indoors
  (the camera would show the house): the work is shown once they are out, that day or the next it is done. Then the
  whole farm again, and on. Each is shown once
  (`seen:<kind>` in the guide's own storage), and only while the player has nothing of their own open (no field,
  person or yard selected).
- *It never runs past a decision.* The guide only sets the speed (and `App.pace`, a multiplier on it). Every pause
  the game makes itself (C4's list), every card and every note stops it as they stop anyone, and it never ends a
  pause the game made or the player's own. A press the year is waiting on that no note is asking for (the word to
  plant with its note put away, a ringed stamp, a vine kill that is the player's) stops it too: the guide pauses
  and says what it waits for ("Water Brook Field. Click its ringed stamp."), with "Go on without it". An ask sent
  on is not asked again: the word to plant until the crew has started (its stamps come and go with the weather, and a
  day's turn takes them down for a frame), any other until its stamp has been gone two seconds. Waiting, the guide
  shows the whole farm, as it does when a note or a card cuts a showing short, so the stamp asked for is in view; a
  stamp that is still off the screen or under something a second and a half on (on a phone a person's pin can stand
  over it) has its field brought up close, once, and the whole farm comes back when the wait is over.
- *The player keeps the clock.* A speed set, a pause (Space included) or "Take the clock" on the guide's line takes
  it, and the guide does not start again by itself. A note then offers it back with a quiet key, "Run the clock
  for me", and the guide's paper has the same as a tick box. "Turn off the tutorial" stops it with everything
  else. Nothing runs the clock with the tutorial off.
- *Year two.* The short spring walk stays. In the season the guide is quiet except for firsts and does not run the
  clock unless the player hands it over (the notes offer; the paper's tick box).

The guide's line is not a note: nothing is paused for it, it carries no Got it, and it stands down for a note or a
card. It is the guide's voice all the same, so the goal slip stands down for it as for a note (D), and its words
count in the screen's budgets below. The rule is `driving()` in `src/game/tutorial.ts` (no DOM: what the guide
wants of the clock for a farm as it stands) and `runClock()` in `src/ui/tutorial.ts` (which carries it out).

The line never lies over what it is about (`placeDrive()`): not over the one the camera is following, who is brought
to the middle of the free land, and not over the stamp it waits on. On a desktop it stands at the top of the land
between the boards. On a phone the land is a strip some 300 px tall and a followed worker's head comes near its top,
so while the clock runs the line lies along the foot of the land, as wide as the window, its keys beside its words;
waiting on a stamp it takes the first free place clear of that stamp.

## Budgets, and where they are held

| Budget | Limit | Held by |
| --- | --- | --- |
| A note's words (what it asks and why) | 35 | `tests/tutorial.test.ts` (every first-year note, three ways of playing, real seasons), `e2e/tutorial.spec.ts` (as shown) |
| A later lesson's words | 40 | `tests/tutorial.test.ts` |
| A card's words (the offer, what a year is) | 80 | `e2e/tutorial.spec.ts` |
| Words in view on the season screen with a note up (boards, land, list, people and the note with its keys, or the guide's line while it runs the clock; field names aside): the first guided day, while the weeks pass and at the word | 80 | `e2e/tutorial.spec.ts` |
| The same, any moment of the guided first year | 100 | `e2e/tutorial.spec.ts` |
| The same with a telegram or the spraying question up instead of a note | 120 | `e2e/tutorial.spec.ts` |
| Things asking for attention at once (note, offer, telegram or spraying card, weigh ticket or other paper, toast, test-dig tray, pressing-work pop) | 1 | `e2e/tutorial.spec.ts`, at every step |
| The clock's speed while a note or a card is up | 0 | `e2e/tutorial.spec.ts`, at every step |
| Notes from Play to the first sale | 16 kinds | `e2e/tutorial.spec.ts`; `tests/tutorial.test.ts` holds a whole simulated first year to 18 |
| The guide's line: what is passing and what comes next | 18 words; a line that shows work, 14 | `tests/tutorial.test.ts` |
| From Start the season to the word to plant, nothing pressed | 15 s (it takes about 3) | `e2e/tutorial.spec.ts` |
| From Start the season to the first weigh ticket, pressing only what notes ask and no speed key | 4 minutes | `e2e/tutorial.spec.ts` |
| Whoever is at the work the guide shows, the middle of their body inside the window with nothing of the interface over it | 2 s of the 4.5 | `e2e/tutorial.spec.ts` (planting, a spray pass, the dig; desktop and phone) |

The budgets are held by cutting the screen, not by raising the number. The weigh ticket is the one paper allowed to
be rich (a field's whole account: about 215 words); it is laid over the screen and is not counted in the screen's
words.

## The guided first year, note by note

Words are for a mouse; a touch screen says "Tap" and "pinch", the keyboard its keys.

| # | Note | When | It says | Then |
| --- | --- | --- | --- | --- |
| 0 | The offer (card) | Play, a new farm | "First time on the farm? I can walk you through your first year one step at a time, pausing the game to explain each one." 1 Start the tutorial / 2 Skip the tutorial | |
| 1 | How a year works (card) | the first plan | The five phases as a picture; "At the end of each year you owe $19,000 to the bank and your family, so your crop needs to earn at least that. You and anyone you hire do the field work, and you make the big decisions. I'll pause the game to explain each one." (with people hired: "You and your crew do the field work...") | Begin |
| 2 | Start the first season | the first plan | "Your plan is ready, with 4 fields of potatoes. Click Start the season. The bank's spring loan covers the cost, and your crop pays it back." | the key itself |
| | *the guide runs the weeks before planting: two or three seconds* | Start the season | (its line) "A few weeks pass while the soil warms. Next: planting, on your word." | the game pauses itself the day the soil is fit |
| 3 | Give the word to plant (brings the tags and their stamps; asks; the season's first note) | the soil ready, the Plant stamps up | "The soil is ready, and planting waits for your word. Click the ringed Plant stamp on North Ridge. Your crew then plants the other 3 fields on its own." | the stamp; Got it stays paused, and the guide waits |
| 4 | Planting day (brings the people) | the word given, or three days gone with none | "You gave the word. Your crew will plant the other 3 fields too. You're on the crew, and your face at the bottom shows what you're doing. The same face on the land is you." (with no word: "You gave no word, so your crew started planting on its own. ...") | Got it, time runs on |
| | *the guide shows the planter: 4.5 s at 1×, followed* | the first day planting is done | "You're planting North Ridge. Drag to look around, and scroll to zoom." | then "Your crew is planting the other 3 fields. Next: the plants come up." |
| 5 | The summer | every field planted | "Planting is done. All summer your crew hills the rows (piles soil over them) and checks for disease. You don't need to do anything until blight weather arrives. That'll be your first big decision." | Got it, time runs on |
| | *the guide shows the plants up, then the hilling; runs the weeks to blight weather in about fifteen seconds* | | "The plants are up in North Ridge." "You're hilling North Ridge, piling soil over the rows." "Your crew hills the rows and walks the fields. Next: blight weather, your first big decision." | |
| 6 | Blight weather (brings the forecast) | the blight watch begins | "Blight weather is coming. Blight is a disease that can wipe out a field in one wet week. The forecast marks it with a red leaf. Spraying protects a field for about a week." | Got it, then the spraying question, the usual choice marked |
| 7 | The work list (brings the list) | the crew's first spray on the list | "Your crew now sprays on its own. The work list at the bottom shows their jobs in order. Each spray costs about $X a field. You don't need to do anything else." | Got it, time runs on |
| | *the guide shows a spray pass and a test dig, and runs the summer* | | "You're spraying North Ridge ahead of the blight." "Your crew sprays when blight weather comes. Next: killing the vines, near September." | |
| 7b | A decision on a field (brings the stamps and the list) | a call that is the player's ("ask me", or water) | "A ringed stamp means a field needs a decision from you. This one: <the need>. Click the stamp to order it. The job goes on the work list." | the stamp; the guide runs on a moment after the last one |
| 8 | Kill the vines (brings the stamps) | the kill in sight | "The crop is nearly ready. Killing the vines stops the growth, so the skins toughen for harvest. Your crew will do this automatically on <day>. Click a stamp to do it sooner." | Got it, time runs on |
| | *the guide shows the vine kill; runs to the harvest* | | "You're killing the vines in North Ridge." "The vines are dying back and the skins are toughening. Next: the harvest." | |
| 9 | Frost on the barrels (only if it comes; later warnings are toasts) | the evening's frost warning, with crop still in barrels | "Frost tonight ruins a fifth of the potatoes still out in barrels. Haul it in now sends whoever can bring in the most from <field> by dark, day off or not." | Haul it in now (answered by the game: "You're hauling <field> now. One tractor brings in about 900 cwt by dark, so about 450 cwt will stay out."); Got it; Show me (the field) |
| 10 | The harvest | digging begun | "The harvest has started. Your crew digs the potatoes into barrels and hauls them to the potato house. You don't need to do anything. Each field is weighed when its barrels are in." | Got it, time runs on |
| | *the guide shows the digger, then the haul* | | "You're digging North Ridge into barrels." "You're hauling North Ridge's barrels to the potato house." "Your crew is digging and hauling. Next: the first weigh ticket." | |
| 11 | The first weigh ticket (the agent's line inside it) | the first field weighed | "This is your first weigh ticket. It shows what the field grew and what was lost. Sell now is the safe choice." | Sell or store |
| 12 | The year-end bills (brings the figure) | the ticket answered | "Your first crop is weighed. "After year-end bills" at the top right is what's left after paying the $19,000. It counts the crop still in the ground, so it'll change until every field is in." | Got it, time runs on |
| 13 | Close out the season | the season done | "The crop is in, so the season is over. Click Close out the season. Winter comes next, and that's when you can sell what you stored." | the key itself |

The first telegram carries, inside it: "Paused until you pick a reply."

After the season: Winter in the cellar, Fell woods in winter, Put up a building, The ledger; then the second
spring (pick a field, choose what it grows, People, who to hire, Land, look over the land, the money, Start the
second season) and its season (Your decisions this season, Meet your hired hand, Who does what, Name a foreman), in
the same voice.

**Nothing before the first thing the player does.** Round eight's players met two tips back to back on the first
day with the game paused ("These tags mark your fields", then "Drag to move around"); they became one note, and
that note is gone too. Between Start the season and the word to plant, the first thing done on the land, there is
no note at all: the guide runs the weeks (rule I). The fields' tags arrive with the stamp the word's note points
at; how to look round is said when the guide first moves the camera, to the planter.

**The second spring's walk** (round eight):
- Every note has a Got it. A note that points at a control (a field's tag, People, Land, The money, Start the
  season) used to carry only Skip; its Got it passes the step without doing it, and the next comes at once.
- The agent never goes quiet over a fold it asked for. With Land open there is a note for it, as there is for
  People: "Each lot lists its rent for the year, then its price to buy. More land is a choice, and the land you have
  is enough for now. Click Got it when you've looked, and I'll go on." It stays for as long as the fold is open. (A
  player opened Land, the tutorial vanished without a word, and they could not tell whether the tour was over.) A
  step done inside an open fold (someone hired) lets the next step come.
- It ends on a closing line the player sees: "That's the plan. Click Start the season when you're ready."
- The slip never asks for what a note just called a choice. The hire step says "You can also wait, because you can
  farm alone for another year", so "Hire a hand" is on the goals ladder only once the farm's work needs one: more
  than four potato fields, or fields away from home (`needsHand`, `src/game/goals.ts`). Until then the slip's "then"
  line names another step.
- The season's first note says the new rule: "It's a new season. The game pauses when the soil is ready, and
  planting waits for your word."

**The goal slip in a season says what is the player's.** After the word is given it reads "Planting: 1 of 4 fields"
and counts up, never "Plant when the soil reaches 50°F" again. While the next step of the crop is the crew's own
work (walking for blight, hilling, a test dig, the dig, the haul) it says what the player is waiting for: "Nothing
for you until blight weather", "Your next decision is killing the vines, due around September 8", "Nothing for you
until the weigh ticket" (`waitingFor`, `src/game/goals.ts`). Rounds seven and eight: "Walk a field for blight, your
crew handles it automatically" as the player's goal read as a job they were failing to do.

**A spring step waits for its own thing.** Each step of the second spring's walk passes when the player has done
it or says Got it; none passes on a timer or on a click elsewhere. Picking a field opens its record, and the
step that follows ("Choose potatoes or a rest year for North Ridge, and which variety to grow. Take your time...")
stays for as long as the record is open: round seven's players had the walk move on to People and Land a second
after they clicked the tag, before they had chosen anything. The next step waits while a fold or a paper the last
click opened is still open, however long that is (it used to give up after eight seconds).

**A note never points at a stamp something half covers.** What a note points at is checked at its middle and at
each corner; with a card over any of it the note says "A card is in the way. Click its X to close it." and the
pointing hand goes to that X (a player's stamp was half under a person's card with nothing said).

**Name a foreman** is offered only where one pays: at least two hired hands, so one can be spared from field work,
and fields away from home for a foreman to run. Without both, the goal is not on the ladder, the slip never names
it, no person is ringed for it and the tutorial has no step for it (round seven: all three players were pushed to
make their only hand a foreman, 40% more pay to take him out of the field). Where it is offered the note says why it
pays, without the word "block": "A foreman orders the work on your fields away from home each morning, so nothing
out there waits for you. Name one with Foreman on <name>'s card. They earn 40% more and stop field work." The
Foreman key's second line says both costs: "+40% pay, no field work", broken after the comma so it takes two short lines and the card needs no scrolling at 1280 by 720. Its Show me opens that person's card with
the Foreman key scrolled into view and ringed. For every player, tutorial or not: the slip glosses the word where it
first shows ("then name a foreman (a hand who runs your fields away from home)"); a hand's card opened while the
slip asks for a foreman brings the key into view, ringed; pressing it opens the groups of fields under it, in view,
with what a foreman does and costs; and naming one answers at once on the card (its heading reads "Foreman, the home farm", the key shows
the fields they run, a line under it says what they now do, the pay line reads "as foreman") and as a note where the player
is looking.

## How it behaves

- **Refusable at every step.** Every note has "Turn off the tutorial" and Got it, and the guide's line while it
  runs the clock has "Take the clock". The
  guide's paper ("Guided first year", from the menu and How to play) lists every lesson, turns the tutorial on and
  off ("Show the tutorial"), says whose the clock is ("Run the clock for me"), and replays any lesson
  ("Replay"). Progress
  is kept in the browser under `the-county/tutorial`, apart from the save, and survives a reload.
- **The cards take the keyboard.** While the offer or the year card is up, the layers behind are inert and keys
  other than the card's own are taken by nothing.
- **Placed where it covers nothing it is about.** The note floats at the first clear place nearest the top middle of
  the land, off the boards, the list and every panel, and never over what it points at. In spring it lies over no
  row of the catalogue; on a phone it sits in the sheet above the order blank.
- **The pointing hand only where it is clear.** Beside what it means, on bare land or a sheet's empty ground; left
  out where there is none.
- **A press meant for it never falls through, and its keys are never dead.** A note's keys take a press from the
  frame it is shown. (They used to ignore presses for 450 ms after a note came, with nothing to show it: a round-six
  player's first click on a key did nothing.) What is guarded instead is the one case that guard was for: the second
  click of a double-click does not answer a note or card that came between the two. For half a second after a note
  goes, a press where it lay is taken by nothing.
- **For everyone.** Words differ for a mouse, a touch screen and the keyboard. Each note is read out once to a
  screen reader. Reduced motion stills its arrival. Its keys are 44 px tall.

## How it is checked

- `tests/tutorial.test.ts`: the offer made once; the opening's order on three farms; every piece of the screen held
  back and brought by its note, and never held back off the guide or past the first year; "ask me" and "by itself"
  each explained; the word limits in every way of playing; storage, skipping, replaying; the simulation's rule
  that no telegram comes before the first planting is finished; and, from round six: the frost note on real frost
  evenings promising nothing, its key being the one order that hauls the barrels in now (`haulNow`), a stamp's note naming the field whose stamp is in view, the fast keys named "Fast-forward".
  `tests/clock.test.ts`: frost forecast on the barrels does not pause a running game, and does for a player with
  "Pause on alerts" on. From round seven: the planting note as the ask for the word, the note after the press and
  after three days with none, which notes ask and which tell, the first card's words alone and with a crew, the
  spring step held while a field's record is open, the foreman step only with two hands and fields away from home.
  `tests/routine.test.ts`: no planting before the word within three days; one press plants every planned field in
  turn; the crew's own start after three days, said, and a crop for a farm that never presses; an old save in the
  middle of planting; planting on "ask me" unchanged. `tests/goals.test.ts`: the foreman goal off the ladder until
  one pays. From round eight: `tests/clock.test.ts` holds the pause at the ask in years one and two, at 1×, 3× and
  8×, with "Pause on alerts" on and off, the crew's start three days after a resume without a press, a stamp's press
  answering the pause without changing the speed, the list of every self-pause cause against a whole year at 8×, and
  the two vine kills that are the player's; `tests/goals.test.ts` what the player is waiting for at each stage of a
  season and the hire step off the ladder until the work needs a hand; `tests/tutorial.test.ts` the one opening
  tip, the Land note, the closing line.
  For the guide running the clock (rule I): the weeks before planting at one pace and under four seconds on three
  farms, with the wait at the ask; each kind of work shown once, in order, with someone to follow and a line of 14
  words or fewer; whose the clock is in a first year, after it is taken, handed back, with the tutorial off and in a
  second year; a ringed stamp waited for, and not once pressed or waved through; no lesson carrying a fast key.
- `e2e/tutorial.spec.ts` (Chromium and the phone): a guided first year played from Play to the first sale by
  pressing only what the notes ask (Got it, the stamp they name, the control they point at, a card's usual reply)
  and no speed key, in under four minutes from Start the season to the first weigh ticket, with whoever the guide
  shows planting, spraying and digging inside the window for two seconds or more, holding every budget above at
  every step; the tutorial starting at planting (Start the season, the guide's line over the land alone, the word
  to plant within 15 seconds as the first note of the season, then the planter followed at 1×); the clock taken by
  "Take the clock", by a pause and by a speed key, never started again by the guide, handed back from a note's
  quiet key, and nothing running it with the tutorial off; the guide stopped at the word (its note put away), by a
  telegram and by the spraying question; a stamp's press changing nothing for three frames and the guide running on
  a moment after the last one; Space putting a note away, the next note holding the days again; the offer centred, under the keyboard, answered by click and by keys 1
  and 2; Skip the tutorial showing the whole interface and no note; a guided farm started from the title; a reload keeping
  its place; axe with the offer, the year card and a note showing. From round six (`docs/quality/players/round-6.md`):
  the goal slip's figure never on its words at six widths, a note up or not; the second spring played by its notes
  with the slip and its ring never showing beside one, and the slip back in the season; a foreman explained on the
  slip and the note, the key in view and ringed, naming one answered on the card and by a note; the winter note's
  words against the key's own; "Planting has started" not said before planting, its Show me selecting the field;
  a frost warning leaving the game running, tutorial off and (once explained) on; Got it saying what it does to the
  clock ("stays paused", "time runs on" under the guide, "resumes at 8×" once the clock is the player's) and doing
  it; a note's keys live on its first frame, and a double-click answering one note.
  From round seven (`docs/quality/players/round-7.md`): the crew standing ready with a toast, the slip and the
  stamps, one press planting the rest, and the crew's own start after three days; the guided year asking for the
  word and answering the press; an asking note's Got it and a stamp's press leaving the game paused; a farm with one
  hand never asked for a foreman; the spring walk held for ten seconds on an open field record; a card laid half
  over a stamp said to be in the way; the first spring sheet's line about a usual first year. From round eight
  (`docs/quality/players/round-8.md`): the game paused at the ask after "Skip ahead" in year one, at 1×, in year
  two at 3× with the camera elsewhere (the stamps brought into view) and in year two with the tutorial on, each with
  the pause's own line, nothing planted, and the crew's start after a resume; the slip counting the planting up after
  the word and then saying what the player waits for; "You gave the word" shown in one place; every note with a Got
  it, the Land note held while the fold is open, the closing line, and no "hire a hand" on the slip after it.
- `tools/quality/capture.ts`: the states `guide-*` (the offer, the year card, the plan's note, the first guided
  day, each note of the year, the spraying question, the first telegram and weigh ticket, the cellar, the account
  book, the second spring, the guide's paper) at all eight sizes.

## Known limits

- With one tractor a frost can catch barrels the crew could not bring in, and the forecast misses some nights; the
  frost note's key hauls now, and its answer says how much will stay out. Making the lone digger dig
  only what he can haul whenever the game would warn of frost was tried in the simulation and put back: over 120
  hands-off first years it cut what froze in barrels by two thirds (14.8 to 4.7 cwt a farm) but caught more fields at
  freeze-up (17 to 22 half dug, none to 1 lost in the ground), with the year's revenue unchanged.
- "Resume and your crew starts in 3 days" counts working mornings with the soil still fit: a Sunday or a cold snap
  makes it four or five.
- The pause for a vine kill that is the player's to give is held by unit tests only; no browser test reaches it.
- With the clock the player's: after Got it on an asking note, or a press on the stamp it asked for, the game is
  paused with only the clock's "Resume at 8×" saying how to go on. A telling note that comes after the player's own
  pause says "stays paused".
- The guide's line calls a pause or a speed key "taking the clock" only in a toast after the fact ("The clock is
  yours now. I'll still pause to explain things."): a player who pauses to look round has to hand the clock back
  from the next note's quiet key, or the guide's paper, to have the guide run it again.
- While the guide runs the days at three a second, or the weeks before planting at ten, the picture of who is
  where falls behind the calendar, as it does at 8× for any player; the work it slows down for is shown at 1×.
- The work the guide shows is whatever the crew did on the day it first happened: with a hired hand it may be the
  hand, not the farmer, who is followed. A kind of work first done while the player has a card open is shown the
  next day it is done.
- A season come back to with Continue is paused; the guide runs it on by itself about two seconds later.
- The Plant stamps go up the evening the first field is fit; fields still too wet show none until they dry, and the
  crew plants them in turn after the word.
- A new season opens at 1×, whatever speed the last one ended at (`src/ui/plan.ts`), so the first note of a second
  year says "resumes at 1×".
- The vine-kill note reads the crew's kill day out of `S.pressing`'s words (the first "on <Month> <day>" after
  "vines" in the same sentence, as in "kills the vines on <day>"); if that wording changes past that, the note
  drops the day and keeps the trade.
- A farm that plants nothing before mid-June gets its telegrams from then on.
- Later telegrams and tickets of the first year carry no line from the agent: the first one taught them.
- In the guided first year the test-dig tray is not laid on the land by itself; it is on the field's card.

## With long days (14 November)

A day at 1× is three and a half minutes (docs/LONGDAY.md), and the speeds are 1×, 50× and 400×. Two things follow
for the tips:

- The tip for running the days faster comes once planting has begun, with the clock at 1×: "Watch the work, or run
  the days faster: click 50× or 400×." It points at the next speed and names the fastest, and goes when a faster speed has been
  used. It no longer waits for every field to be planted: at 1× that is a quarter of an hour.
- The tests of the tips run on the short-day clock (four seconds a day at its first speed), where the speeds are
  named 1×, 3× and 8×. The words of a tip that names a speed are read from the clock, so they are right on both.

