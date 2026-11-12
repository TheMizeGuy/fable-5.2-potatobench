# What first-time players of live-5 found

How it was done: `tools/quality/player.mjs` holds a browser open on the live game on the test box; a fresh agent
with a character and no knowledge of the game (`brief.md`) sends a few mouse and keyboard actions at a time and gets
back only a picture of the screen; the game stands still while it thinks. Each player's own notes and the
harness's record of every request (`live-5-p*.jsonl`: actions, phase, day, cash) are beside this file.

Three fresh agents played the live game blind (pictures only, 90 requests each, no code, no documents). Two have
reported; the third will be added at the end of this file. Their folders, with every picture and their notes:
players/p1 (a strategy-game veteran) and players/p3 (impatient, pokes at everything), beside this folder
(/private/tmp/claude-501/-Users-mize-Dev-PotatoBench-Fable52PotatoBench/4fbad3a2-df50-4a92-9e03-701d40befb51/scratchpad/players).
Both finished year one and reached the summer of year two. Scores out of ten: knowing what to do next 6 and 3;
looks 9 and 9; wanting to keep playing 7 and 6.

## The decision taken from this (the creative director's)

**The crew works to the routine by itself; the player makes the calls.** Both players found people standing idle
with work due unless every job on every field was ordered by hand ("Workers stand idle unless I order every job, all
season"; weeks lost at 3x; late planting both years). The owner asked for people "RimWorld kinda". From now on:

- Each working morning, routine work the fields need is put on the list automatically for every held field:
  plant (what the spring plan chose, when the ground is fit), hill, walk the field (scout), pull blighted hills
  (rogue), test dig, dig once the skins are set, haul. These are "standing orders", on by default.
- The calls stay the player's, as a stamp on the field answered with one click: spray, water, kill the vines (and
  selling, and everything in spring). Each job's standing order can be switched between "by itself" and "ask me".
- A foreman still does what a foreman did: on their block every job is ordered, the calls included.
- The player can still order anything by hand, earlier than the routine would, cancel it, or put it first.

In code (the simulation writer is building this now; the names are fixed so the interface can be written against
them): `Campaign.routine` (which job kinds are ordered by themselves), the command
`{ t: 'routine', kind: JobKind, auto: boolean }`, `S.routineInfo(c): { kind: JobKind; auto: boolean }[]`, and on each
job `by: 'you' | 'routine' | 'foreman'` (who put it on the list). `S.fieldNeeds` goes on returning, per field, the
need that still wants the player (now only the calls, and routine jobs switched to "ask me").

## For the interface (season screen, sheets, input)

1. **The camera moves under the player's clicks** (both players, their worst or second-worst problem). A click on a
   field's tag or a need's stamp glides the camera to it, so the next click lands on something else (p1: 025, 029,
   030, 082, 085; p3: 025, 035, 041, 044, 070). A single click must never move the camera: only a double-click,
   "Show me", a key meant for it, or a field that is off screen.
2. **The layout shifts when the game pauses**: the "Go on at 3x" box pushes things down (p3: 025). Nothing may move
   when the clock state changes.
3. **The yellow slip is read as an instruction and was wrong**: it said "Kill the vines" from late July (small
   type: "In September") while the field's card said it was too soon; the player did it and lost crop (p3: 031,
   043 to 045, 052). In year two it said "Pull the stumps", which neither player could do (p1: 069 to 075; p3:
   078). The slip with the pointing hand must only ever name something the player can do now, with the control for
   it one click away; the longer goal belongs in a second, quieter line.
4. **Dead ends**: "Pull the stumps" has no button in the season (the tract's record says "Next: have the stumps
   pulled: a contractor, $6,000", right-click says "Nothing needs doing here now", "Show me" only flies there, the
   almanac explains it without a control). "Walk a field for blight" with no way to do it (p1: 018 to 020). "Frost
   tonight, 396 cwt in barrels" with no haul-now (p1: 049, 051; 350 cwt froze). Wherever the game names a job, the
   button for it is right there, or the reason it cannot be done.
5. **The foreman gives no sign of life**: the button goes dark, its second line is hidden under the portrait bar,
   nothing says what the foreman will now do or is waiting for (p1: 077 to 079; p3: 072 to 086). (In the simulation
   the foreman does put orders on the list; the players could not tell.)
6. **Pausing is not predictable**: Space pressed with a telegram up let the game run three days (p1: 080); the game
   ran at 3x with a telegram on screen and no "Stopped for you" (p1: 083); answering a telegram resumes play, so the
   next Space pauses instead of resuming (p3: 016); "Pause on alerts" is off by default and both wished it on.
   While a telegram or a ticket wants an answer the clock stands, and says so.
7. **The almanac traps the keyboard**: Tab and Enter opened it unasked, then Escape and Space did nothing (p3: 089,
   090).
8. **Right-click**: on a field it gave only an outline, not the order How to play promises (p3: 085); on open
   ground with a person selected, nothing (p1: 011). A strategy player expects: select a person, right-click a
   field, and that person goes and does what the field needs (or is told why not).
9. **Silent or unexplained answers**: "hilling dropped" with no reason (p3: 036); red dig stamps with no hover text
   (p1: 041, 042); several stamp clicks in a row where only the first took (p3: 035, 038, 041, 044).
10. **People's chips say IDLE while their card says they are planting** (p1: 017, 027, 028).
11. **Found late or never**: How to play and the keys (only in the menu; p3 at 079), "Who does what" (p1 at 055,
    p3 at 074), the almanac's forecast (year two), Tab and Enter to step through what needs doing, the hotkeys on a
    field's card, that resting fields earn. The person card's Raise, Foreman and Let go buttons are cut off by the
    portrait bar (p1: 076, 077); the field record is cut off at the bottom (p1: 032); opening a field record in
    spring makes the map's tags jump into a column (p1: 004).
12. **The money surprised them**: at the year's end $10,000 for "the note" and $9,000 for "the household" came off
    with no warning during the year (p3: 063). What is owed at the year's end is on the pass book all season.
13. **Words nobody explained**: cwt, $/cwt, US No. 1, US No. 2, B size, culls, the variety names, hill and
    hilling, rogue, kill the vines, skins set, protection, the note, the household, crew-days, foreman, tract, rest
    year, bulking, setting tubers, blight watch, sheltered, homebody, hatching, the rule. Each gets a plain-words
    explanation on hover or tap, in place.
14. **Hiring is greyed with "any more need a bed in a bunkhouse"** and no way from there to build one (p3: 049, 065).

What they liked and must not be lost: clicking a person and getting exactly what an RTS player expects (p1: 010);
the stamps appearing on fields and one click answering them; the weigh tickets with the losses and their reasons;
the test dig card; telegrams answered with one key; the ledger against the neighbour; the land through the seasons.

## For the simulation

- The routine (above).
- The same telegram again and again: "A neighbour wants Albert/Leon" four times in a year and a half for each
  player, hiring telegrams four times (p1: 021, 033, 079, 080; p3: 017, 022, 069, 083).
- Frost on barrels left in the field: hauling is not urgent enough and nothing stops for it.
- Numbers that disagree: the ticket's "Sell now $18,695" then "sold for $18,658"; the yard's 9 logs against the
  top bar's 8 (18 and 17, 39 and 38); "Year 1" still shown from January to April.
- "Usually about 25% above by April" on the ticket, where one player's stored crop was worth less in February and
  March than at the dig, after paying storage.

## For the tutorial

Everything above is what an untaught player does not find. The tutorial teaches the calls (spray, kill the vines,
sell or store), the routine and how to change it, reading a person, the camera, the clock, and where the forecast
and the keys are; it does not teach ordering every job by hand, because that is no longer how the game is played.

## The third player (players/p2: careful, casual, mouse only, reads everything)

Finished year one and reached the second spring. Scores: knowing what to do next 6, looks 9, wanting to keep
playing 8. Confirms the above (camera flying under clicks was their worst problem too: 036, 051, 056, 062; "I only
got reliable orders through Tab+Enter"; the game running past new jobs at 3x; idle people with orders queued; the
foreman hard to find, 077 to 082; found the camera controls only at request 083 and the almanac after the year was
over) and adds:

For the interface:
- **A click on the "On the list" strip silently removes orders** (039: a click meant to cancel an accidental Water
  took Water, and Hill and Scout for that field went too, 040; the ticket later read "Greened -84 cwt, hilled
  once", 063). Removing an order needs a visible control (a small cross on each), says what was removed, and can be
  undone. The player never found a clear way to cancel one order.
- **Buttons on the field's card shift between clicks**, which ordered Water ($300) by accident (037, 038).
- **The soil-temperature words contradict themselves**: "Soil 51°F here. Seed wants 50°F" beside "Hold off
  planting... The soil is 50°F" (024, 026); "Soil 48°F here" beside a button reading "The soil is 50°F and fit to
  work" (027). And "Plant when the soil reaches 50°F, about 1 day" said the same on 15 May and on 25 May (022, 023).
- **The slip asked for what the game refused**: "Walk a field for blight" with no Scout button, right-click
  "Nothing needs doing here now", C "Scout: Nothing is up yet" (031, 033, 034).
- **The red Play key did not resume after a telegram** (021); Escape then Space left the clock paused (089).
- The field prices are cut off at the sheet's edge in spring ("$9,", 006); a Hire click after scrolling hit empty
  space (011); the foreman's small print is cut off at the bottom (082); the People list has no way to name a
  foreman though the ledger says to (077 to 081).
- Never understood: the numbered boxes beside a person's skills, the "2 more orders" link, the "2" badge on a pin,
  the hatch mark on the contract's range.
- More words: prone, early dying, protectant, lesions, greened, knobs and cracks, tuber blight, certified seed,
  hiring hall, can live out, packer, seed house, fry plant, lapse, the full reckoning.

For the simulation:
- **Speed is not even**: at 3x, fifteen seconds gave three days at one point (020) and four seconds gave ten days
  at another (023). (Probably the clock standing for a telegram part of the time; find out.)
- **Paid amounts differ from the ticket** again: Deliver $14,465 then "delivered for $14,442" (070); ticket $15,013
  then "sold for $14,989" (072, 073).
- **The contract and the cellar do not connect**: 356 cwt in the cellar, 400 short on the contract, no way to
  deliver from the cellar; $1,649 of penalties (074, 077).
- "December usually runs 4.3% higher", then Kennebec fell 3.0% (074, 075).
- Made money but ended poorer ($24,000 at the start, $17,420 at the year's end) with a larger spring loan, and no
  plain statement of it (077, 078).

Liked: the weigh tickets with a reason for each loss and "Brings most"; the test-dig drawing; the sale slip
tearing; the loan turning into a balance; "The money" page; "The way ahead"; the ledger against the neighbour; the
hire offers; Tab and Enter once found.
