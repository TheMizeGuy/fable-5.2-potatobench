# The County: design record

A potato farming game played on the real weather of Aroostook County, Maine.
This file is the reference for what the game is, what it refuses to be, and how
we know it works. Change it when the design changes.

## What the game is about

A potato crop is underground. The grower manages what they cannot see, against
weather they cannot control, with a fixed number of working hours, and learns the
truth on the day they dig. The whole game is built to make that one situation
felt.

## Pillars

1. **You cannot see the crop.** Tuber count, size and health are hidden. The
   player infers them from the canopy, the weather, and test digs, and every
   estimate on screen carries its uncertainty.
2. **The weather happened.** Each season is a real year at Caribou, Maine, from
   NOAA's station record. The forecast is uncertain; the almanac afterwards is
   not.
3. **Hours are the currency.** One farmer, one day's work per day. Rain closes
   the field. Every job delays another job.
4. **Dig day tells the truth.** The harvest is graded tuber by tuber, and every
   pound lost is attributed to its cause, which is always a decision or a day.

A feature belongs only if it puts pressure on a decision under one of these.

## The loop

- **Spring plan.** For each of six fields: potatoes (which variety, certified or
  saved seed) or a rest year in oats and clover. Buy equipment if there is cash.
- **Season** (late April to freeze-up, one day per tick, pausable). Queue jobs
  for the farmer: plant, hill, scout, spray, water, rogue, test dig, kill vines,
  dig. The farmer works the queue in order, skipping what the weather forbids.
- **Dig.** Each field's crop is revealed and graded. Sell from the field or put
  it in the cellar.
- **Cellar** (November to May, one month per tick). Prices rise through winter
  while the pile shrinks, sprouts or rots. Sell, hold, or hold back seed.
- **Year end.** Pay the note and the household. Five seasons kept is a win;
  the farm continues afterwards for anyone who wants it.

## What carries from year to year

- Cash and the note.
- Each field's soil health: potatoes after potatoes wear it down, rest restores it.
- Saved seed: free, but it carries more virus every generation, and any blight
  that went into the cellar comes back out in spring.
- Equipment.

## The fields

Six fields of five acres on a slope. The ridge fields drain fast, warm early and
dry out; the bottom fields hold water, stay wet after rain and collect frost.
Each field is drawn and simulated as a grid of hills, so blight spreads plant to
plant and a test dig lifts one real hill.

## Honesty rules for the simulation

- Every rule cites its source in `docs/MODEL.md`. A constant we tuned is marked
  **invented** there, with the reason.
- The core is deterministic and uses only exact arithmetic (`+ - * /`, `sqrt`,
  integer hashing). Anything needing `exp`, `log` or trigonometry is computed in
  the weather pipeline and stored as integers.
- The interface never shows hidden truth. Views that the UI may read are the
  functions in `src/sim/view.ts`; the renderer may read hill state only through
  them.

## Cut list

Things a potato game could have and this one deliberately does not, because they
repeat a decision the game already asks or add content without pressure:

| Cut | Why |
| --- | --- |
| Colorado potato beetle, early blight, wireworm | A second and third scout-and-spray loop with the same shape as late blight. One enemy, modelled properly. |
| Fertilizer management | A dial with a known best setting; no uncertainty, no timing. |
| Other crops, livestock, crafting, cooking | The game is about one crop. The rest year is a rotation decision, not a second crop to play. |
| Characters, quests, dialogue | The neighbour is the reference practice for that real year, reported as what was seen from the road. Nothing else needs a voice. |
| Walking an avatar | The farmer's time is the resource; steering them is not a decision. |
| ~~Contracts~~ | Restored in "The bigger farm": spring contracts with a fixed price, a date and a penalty. |
| Machinery breakdowns, random disasters | The weather record supplies enough misfortune, and it is real. |
| ~~Unlockable land~~ | Restored in "The bigger farm" (docs/DIRECTION.md): the owner asked for a larger map and more to manage. |

## Verification gates

Ship only when these hold, or the exception is recorded here. Results: gates 1 to 4 in
`docs/balance/latest.md`, gate 5 in `docs/verification/model-vs-record.md`, gates 6 to 8 and
the summary in `docs/VERIFICATION.md`. The quality of every screen is judged separately,
by `docs/QUALITY.md`.

**Exception on record.** Gate 2 fails for one verb: in bot play a test dig is worth nothing
($0.3k, interval -$0.2k to $1.0k over 24 seeds), because the decisions it could inform
(when to kill the vines, whether to store) turn out not to depend on it. It stays in the
game because it is the player's only look at the hidden crop, which is the first pillar,
and the blind playtesters named it the best moment of the season. It is a known weakness
of the design, not a solved one.

1. **Skill gradient.** Over many real years and seeds: expert bot > reference
   bot > naive bot on five-season survival and net worth.
2. **Every verb earns its place.** Removing any one verb from the expert bot
   lowers its result.
3. **No dominant plan.** No single variety, and no fixed calendar, wins in most
   years.
4. **Losable and winnable.** The naive bot usually loses the farm; the expert
   usually keeps it.
5. **External record.** Model yields under reference practice are compared with
   USDA's recorded Maine yields year by year, and the blight forecast with the
   documented epidemic years. Reported whatever the result.
6. **Determinism.** One replay gives one state hash in Node, Chromium, Firefox
   and WebKit.
7. **Live site.** End-to-end play, save and reload pass against the deployed URL
   in three engines, with no console errors and no serious accessibility
   violations.
8. **Blind play.** Testers who are given only the URL can plant, tend and dig a
   crop, and their confusions are fixed or recorded.
