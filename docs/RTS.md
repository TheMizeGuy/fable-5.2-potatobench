# The game is paced from the unit outward

14 November. The owner, after playing the builds whose clock was set from the calendar (a day of four seconds; then
of three and a half minutes with 50× and 400× above it; then of three minutes with empty days skipped and 6× and 60×):

> "The game should feel and play like an RTS it doesnt need farming realism think games like stardew valley,
> rimworld, factorio etc"
>
> "make it play like a true fun RTS watching all your guys the farmer managing your farm make the speed go around
> the gameplay this is a game not a backend simulator with some art slapped on"

## What was wrong

Every clock so far began from the farm's calendar and asked how fast its days should go by. A strategy game begins
from the unit: how long one order takes to watch, how many units there are to watch, and how often there is
something to decide; the day is whatever those come to. Three things followed from starting at the wrong end:

- **One order took either an instant or three minutes.** Neither is a strategy game's order.
- **There was one unit.** A new farm was the farmer alone; anyone hired with no order of their own stood still.
- **The speeds were 6× and 60×**, because the first speed was too slow to play at.

## The reference games' own timings

Fetched from each game's wiki on 14 November (page stated the value unless marked):

| | RimWorld | Stardew Valley | Factorio |
|---|---|---|---|
| Real minutes to a day at normal speed | 16.7 (60 ticks a second, 60,000 a day) | 14 (0.7 s a game minute, 6 am to 2 am) | 7 (25,200 ticks) |
| Speed steps | pause, ×1, ×3, ×6 | none; time stops in menus | none in normal play |
| One basic ordered job | sow a plant 2.8 s, harvest 3.3 s, plus the walk | not stated | craft a part 0.5 s; mine an ore about 2 s (derived) |
| Units at the start | 3, chosen from 8 | 1 | 1 |
| A unit's pace | 4.6 cells a second | not stated | 8.9 tiles a second |
| Planting a staple to harvesting it | potato 5.8 growing days (about 97 to 178 minutes) | potato 6 days (84 minutes at most) | no farming |
| A unit with nothing to do | wanders; an alert says "1 colonist idle" | | |

Sources: rimworldwiki.com/wiki/Time, /Move_speed, /Potato_plant, /Plants, /Crashlanded, /Work;
stardewvalleywiki.com/Day_Cycle, /Seasons, /Potato, /Parsnip; wiki.factorio.com/Game-tick, /Character, /Console,
/Mining. What they have in common, and this game did not: an ordered job is seconds long and is watched; speeds
are a step or two apart; nobody stands idle without the game saying so; more than one thing is going on.

## The budget, and the meter

`tests/longday.ts` plays a first year at the first speed a frame at a time without a picture, a player giving every
order the farm asks for each morning, and counts (its `feel`): the real minutes the season takes; the minutes to
the first weigh ticket; how long each stretch of machine work lasts; the share of the time nobody on the farm is
at anything (dead air); and each person's share of the time at something. `tests/longday.test.ts` holds a season
to the budget.

| | budget | calendar clock (`live-50`) | paced from the unit |
|---|---|---|---|
| speed steps | a step apart | 1×, 6×, 60× | 1×, 2×, 3× |
| a stretch of machine work, usual | under 30 s | 41 s | 14 s |
| a stretch of machine work, longest | a minute | 180 s | 60 s |
| a first season at the first speed | under an hour | 137 min | 54 min (farmer alone); see below with a crew |
| the first weigh ticket | within a sitting | not measured | 44 min |
| people on a new farm | 3 | 1 | 3 |
| time nobody is at anything | under a fifth | 5% (of a season more than twice as long) | 14% |
| a machine's pace at work | one pace for every job | 5 m/s | 14 to 18 m/s |
| steps nobody could make, figures slid, ground changed out of its time | 0 | 0 | 0 |

## What it is now

- **The clock.** A day of work is a minute at 1×; 2× and 3× are twice and three times that; the work is watched
  lane by lane at every one of them. A field is planted in a minute, hilled in half, sprayed in a quarter. Time
  with no work in it (a day nobody works, the rest of a day once its work is done) goes by at six seconds a day at
  1×. `src/game/app.ts`: `DAY_SECONDS`, `QUIET_S`.
- **The pace.** Machines work at about 15 m/s and go by the lane at up to 26; people go at up to 5.5. A field is
  planted in four lanes, hilled in two, sprayed in one pass, dug in eight over two days. `src/render/work.ts`:
  `LANES`, `LIVE_PACE`.
- **Three people.** A new farm is the farmer and two field hands, their first season's wages already in the
  farm's hand (`START_HANDS` in `src/game/app.ts`).
- **Many hands.** Someone with no order of their own goes and helps with a job that is being worked, on foot, and
  the job goes faster for each helper there (`HELP_RATE`, `HELPERS_MOST` in `src/sim/params.ts`; the rule is in
  `src/sim/season.ts`, the crews' day). Real work comes first: a helper given an order leaves to do it.
- **The light** holds a morning or an evening through the days, as it did before days were long: a night every
  minute would be a strobe.

## What was given up

- The three-minute day in which a tractor went at a tractor's pace (docs/LONGDAY.md): at a minute a day the
  machines go at a game's pace, three times that.
- The light going through the day.
- Farming's proportions: six lanes do not plant five acres, and nobody drives at 50 km/h through a potato field.

## Known limits

- The browser tests of everything but the day itself run on the old short-day clock (`e2e/base.ts`) and on a farm
  of one: they hold the interface and the rules, not this pacing. `e2e/longday.spec.ts` and
  `tests/longday.test.ts` hold the pacing.
- The farm's own work list still reads as a calendar's: "Nothing to do until the weigh ticket". The player's
  verbs are the ones the game had; this round changed what is watched and how fast, not what there is to decide.
