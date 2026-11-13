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

**C. Every note pauses the game, and its keys say what they do to the clock.** The moment a note appears in a
season the game pauses, and it stays paused until the note is dealt with: its control pressed, Got it, a
"Fast-forward to", Skip, or Turn off the tutorial. The note says "Paused". Got it carries a second line, "resumes at
1×" (or 3×, 8×), and does exactly that: it puts the game back at the speed on the clock just before the note, never
one remembered from earlier. If the player had paused the game themselves, the line reads "stays paused" and it
does. Space resumes at that same speed (the hold writes it to the clock, so the clock's marked key agrees). The
clock's keys are the player's: Space or a speed key pressed in the second and a half after a key or click of theirs
closes the note and runs the game; the game starting the clock by itself (a paper closing, a telegram answered) is
paused again at once. A note never appears, changes or moves under a running clock.

**C3. A note that asks for a press leaves the game paused.** Some notes only tell (the summer, the work list, the
harvest); some ask the player to do something on the land (give the word to plant, click a ringed stamp, click a
hand's face). An asking note's Got it reads "stays paused" and does that: the pause becomes the player's own, the
clock shows "Resume at 8×", and Space or the clock resumes at the speed the game had. Doing the thing asked does
not resume it either: a press on a stamp never changes the speed. Round seven's players had Got it resume at 8× so
that the press it had just asked for landed on a moving scene, and a click on the water stamp restarted the game by
itself (the hold let go when the lesson passed: `hold()` in `src/ui/tutorial.ts`). When a telling note follows the
press at once (the word to plant, then "You gave the word"), that note's Got it resumes as usual.

**C2. A notice pauses only the first time it teaches something.** In the guided year a kind of notice that asks
nothing (frost forecast on the barrels) comes once as a note, which pauses like any note; after that it arrives as
a toast and the game keeps running. Outside the tutorial it never pauses: the game stops itself only for a card
that needs an answer (a weigh ticket, a telegram, the spraying question) and for the season's end, unless the
player turned on "Pause on alerts". Round six's players were being stopped about once a month from May to October by
"Frost tonight" with nothing to answer, the tutorial on or off, because the frost warning was on the list of things
the clock always stops for (`STOP_FOR`, `src/game/app.ts`); it has been taken off that list.

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
cash. Each other piece appears when it first matters, introduced by the one note that holds the clock for it:

| Piece | Hidden until | Introduced by |
| --- | --- | --- |
| The fields' tags | the first day | "Your fields" |
| The stamps on fields | the soil ready to plant | "Give the word to plant" |
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
each weigh ticket. A note with a wait after it carries "Fast-forward to <the next thing>", with "runs at 8×" under
it: named for what it does, since it does not jump. It sets the clock to 8× and the next note or card pauses it.
The speed stays where the key put it, as the clock shows, until the player changes it (it used to drop back to the
earlier speed after the next note, which players read as the game changing speed on them). A telegram or a weigh
ticket on the way pauses as always and resumes at 8×. No telegram comes in a farm's first year before its
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
| 1 | How a year works (card) | the first plan | The five phases as a picture; "At the end of each year you owe $19,000 to the bank and your family, so your crop needs to earn at least that. You and anyone you hire do the field work, and you make the big decisions. I'll pause the game to explain each one." (with people hired: "You and your crew do the field work...") | Begin |
| 2 | Start the first season | the first plan | "Your plan is ready, with 4 fields of potatoes. Click Start the season. The bank's spring loan covers the cost, and your crop pays it back." | the key itself |
| 3 | Your fields (brings the tags) | the first day | "These tags mark your fields. This year 4 will grow potatoes and 2 are resting. It's too cold to plant yet. When the soil warms, planting waits for your word." | Got it |
| 4 | Look around | after 3 | "Drag to move around the farm, and scroll to zoom in. The soil should be warm enough to plant in about 9 days." | Fast-forward to planting day |
| 5 | Give the word to plant (brings the stamps; asks) | the soil ready, the Plant stamps up | "The soil is ready, and planting waits for your word. Click the ringed Plant stamp on North Ridge. Your crew then plants the other 3 fields on its own." | the stamp; Got it stays paused |
| 5b | Planting day (brings the people) | the word given, or three days gone with none | "You gave the word. Your crew will plant the other 3 fields too. You're on the crew, and your face at the bottom shows what you're doing. The same face on the land is you." (with no word: "You gave no word, so your crew started planting on its own. ...") | Fast-forward to the end of planting |
| 6 | The summer | every field planted | "Planting is done. All summer your crew hills the rows (piles soil over them) and checks for disease. You don't need to do anything until blight weather arrives. That'll be your first big decision." | Fast-forward to your first decision |
| 7 | Blight weather (brings the forecast) | the blight watch begins | "Blight weather is coming. Blight is a disease that can wipe out a field in one wet week. The forecast marks it with a red leaf. Spraying protects a field for about a week." | Got it, then the spraying question, the usual choice marked |
| 8 | The work list (brings the list) | the crew's first spray on the list | "Your crew now sprays on its own. The work list at the bottom shows their jobs in order. Each spray costs about $X a field. You don't need to do anything else." | Fast-forward to the next decision |
| 8b | A decision on a field (brings the stamps and the list) | a call that is the player's ("ask me", or water) | "A ringed stamp means a field needs a decision from you. This one: <the need>. Click the stamp to order it. The job goes on the work list." | the stamp, or Got it |
| 9 | Kill the vines (brings the stamps) | the kill in sight | "The crop is nearly ready. Killing the vines stops the growth, so the skins toughen for harvest. Your crew will do this automatically on <day>. Click a stamp to do it sooner." | Fast-forward to the harvest |
| 10 | Frost on the barrels (only if it comes; later warnings are toasts) | the evening's frost warning, with crop still in barrels | "Frost tonight ruins a fifth of the potatoes still out in barrels. Haul it in now sends whoever can bring in the most from <field> by dark, day off or not." | Haul it in now (answered by the game: "You're hauling <field> now. One tractor brings in about 900 cwt by dark, so about 450 cwt will stay out."); Got it; Show me (the field) |
| 11 | The harvest | digging begun | "The harvest has started. Your crew digs the potatoes into barrels and hauls them to the potato house. You don't need to do anything. Each field is weighed when its barrels are in." | Fast-forward to the weigh ticket |
| 12 | The first weigh ticket (the agent's line inside it) | the first field weighed | "This is your first weigh ticket. It shows what the field grew and what was lost. Sell now is the safe choice." | Sell or store |
| 13 | The year-end bills (brings the figure) | the ticket answered | "Your first crop is weighed. "After year-end bills" at the top right is what's left after paying the $19,000. It counts the crop still in the ground, so it'll change until every field is in." | Fast-forward to the next ticket |
| 14 | Close out the season | the season done | "The crop is in, so the season is over. Click Close out the season. Winter comes next, and that's when you can sell what you stored." | the key itself |

The first telegram carries, inside it: "Paused until you pick a reply."

After the season: Winter in the cellar, Fell woods in winter, Put up a building, The ledger; then the second
spring (pick a field, choose what it grows, People, who to hire, Land, the money, Start the second season) and its
season (Your decisions this season, Meet your hired hand, Who does what, Name a foreman), in the same voice.

**A spring step waits for its own thing.** Each step of the second spring's walk passes when the player has done
it or says Skip or Got it; none passes on a timer or on a click elsewhere. Picking a field opens its record, and the
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
  one pays.
- `e2e/tutorial.spec.ts` (Chromium and the phone): a guided first year played from Play to the first sale by
  pressing only what the notes ask (their "Skip to", Got it, the control they point at, a card's usual reply),
  holding every budget above at every step; Space putting a note away, the next note holding the days again; the offer centred, under the keyboard, answered by click and by keys 1
  and 2; Skip the tutorial showing the whole interface and no note; a guided farm started from the title; a reload keeping
  its place; axe with the offer, the year card and a note showing. From round six (`docs/quality/players/round-6.md`):
  the goal slip's figure never on its words at six widths, a note up or not; the second spring played by its notes
  with the slip and its ring never showing beside one, and the slip back in the season; a foreman explained on the
  slip and the note, the key in view and ringed, naming one answered on the card and by a note; the winter note's
  words against the key's own; "Planting has started" not said before planting, its Show me selecting the field;
  a frost warning leaving the game running, tutorial off and (once explained) on; Got it saying and doing "resumes
  at", the fast key saying "runs at 8×"; a note's keys live on its first frame, and a double-click answering one note.
  From round seven (`docs/quality/players/round-7.md`): the crew standing ready with a toast, the slip and the
  stamps, one press planting the rest, and the crew's own start after three days; the guided year asking for the
  word and answering the press; an asking note's Got it and a stamp's press leaving the game paused; a farm with one
  hand never asked for a foreman; the spring walk held for ten seconds on an open field record; a card laid half
  over a stamp said to be in the way; the first spring sheet's line about a usual first year.
- `tools/quality/capture.ts`: the states `guide-*` (the offer, the year card, the plan's note, the first guided
  day, each note of the year, the spraying question, the first telegram and weigh ticket, the cellar, the account
  book, the second spring, the guide's paper) at all eight sizes.

## Known limits

- With one tractor a frost can catch barrels the crew could not bring in, and the forecast misses some nights; the
  frost note's key hauls now, and its answer says how much will stay out. Making the lone digger dig
  only what he can haul whenever the game would warn of frost was tried in the simulation and put back: over 120
  hands-off first years it cut what froze in barrels by two thirds (14.8 to 4.7 cwt a farm) but caught more fields at
  freeze-up (17 to 22 half dug, none to 1 lost in the ground), with the year's revenue unchanged.
- After Got it on an asking note, or a press on the stamp it asked for, the game is paused with only the clock's
  "Resume at 8×" saying how to go on. A telling note that comes after the player's own pause says "stays paused".
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
