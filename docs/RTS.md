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
order the farm asks for each morning, and counts (its `feel`), on a farm of three: the real minutes the season takes; the minutes to
the first weigh ticket; how long each stretch of machine work lasts; the share of the time nobody on the farm is
at anything (dead air); and each person's share of the time at something. `tests/longday.test.ts` holds a season
to the budget.

| | budget | calendar clock (`live-50`) | paced from the unit |
|---|---|---|---|
| speed steps | a step apart | 1×, 6×, 60× | 1×, 2×, 3× |
| a stretch of machine work, usual | under 30 s | 41 s | 14 s |
| a stretch of machine work, longest | a minute | 180 s | 60 s |
| a first season at the first speed | under an hour | 137 min | 43 min |
| the first weigh ticket | within a sitting | not measured | 37 min |
| people on a new farm | 3 | 1 | 3 |
| time nobody is at anything | under a fifth | 5% (of a season three times as long) | 15% |
| each person's time at something | most of it | farmer 95%; hired hands 38% and 27% | farmer 69%, hands 64% and 49% |
| a machine's pace at work | one pace for every job | 5 m/s | about 17 m/s, 26 at most |
| steps nobody could make, figures slid, ground changed out of its time | 0 | 0 | 0 |

## What it is now

- **The clock.** (As first built; see "The loop on the screen" below for what it is now: 1×, 3×, 6×, and no day
  hurried by itself.) A day of work is a minute at 1×; 2× and 3× are twice and three times that; the work is watched
  lane by lane at every one of them. A field is planted in a minute, hilled in half, sprayed in a quarter. Time
  with no work in it (a day nobody works, the rest of a day once its work is done) goes by at six seconds a day at
  1×. `src/game/app.ts`: `DAY_SECONDS`, `QUIET_S`.
- **The pace.** Machines work at about 17 m/s and go by the lane at up to 26; people go at up to 5.5. A field is
  planted in two lanes, hilled in two, sprayed in one pass, dug in four over two days: few enough that a machine
  with a full crew helping, at twice its own rate, still goes at a pace that reads. `src/render/work.ts`: `LANES`,
  `LIVE_PACE`.
- **Three people.** A new farm is the farmer and two field hands, their first season's wages already in the
  farm's hand (`START_HANDS` in `src/game/app.ts`).
- **Many hands.** Someone with no order of their own goes and helps with a job that is being worked, on foot, and
  the job goes faster for each helper there (`HELP_RATE`, `HELPERS_MOST` in `src/sim/params.ts`; the rule is in
  `src/sim/season.ts`, the crews' day). Real work comes first: a helper given an order leaves to do it. Planting,
  digging, hauling, felling, picking rocks, cutting brush and building can be helped; a planting with two helpers
  goes about 1.7 times as fast. A helper's card says "Helping", and they are seen on foot in the rows beside the
  machine, or at the work's place with the others.
- **An hour at a time.** The crews' work is counted in eleven stretches a day however the day is asked for
  (`DAY_STRETCHES`), so a day stepped at once, a day counted as it is watched and a day worked out ahead for the
  picture are the same day.
- **The light** holds a morning or an evening through the days, as it did before days were long: a night every
  minute would be a strobe.

## The opening, and what to do next

The owner, the same evening, with a picture of the first spring's plan (seventeen tags, a sheet of six folds, "Start
the season"):

> "I just click start game there is ZERO intuitive direction on what im supposed to do next"

- **Play goes onto the land.** A first spring's plan is the usual one and is not shown: Play (after the question of
  tips, the first time in a browser) starts the season. Planning is the second spring's, when there is a year
  behind it to plan from. `src/ui/title.ts`, `straightIn` in `src/ui/tutorial.ts`.
- **The farm opens on its first decision.** The weeks before the soil is fit are gone through at once, and the
  first thing on the screen is the game stopped for the word to plant. A farm started from Play has a fair working
  day for that morning and the day after it (a seed is tried up to 24 times for one), so the first picture is the
  farm in good light and the first order is seen through. `toTheWord`, `fairOpening` in `src/game/app.ts`.
- **What to press says what it does.** While the game stands waiting for an order (the word to plant, a vine kill
  that is the player's), one stamp is a key with the order's name on it: "PLANT", in ochre with its ring breathing,
  beside the field the slip points at. (Every field's stamp as a key crowded the tags at a small desk; one press is
  the word for every field.) The tags are put again once when the key comes, so it lies under none. `need(..., word)` in `src/ui/system/parts.ts`, `src/ui/plates.ts`.
- **Answering the game sets it going.** A press that gives the order a pause was waiting for resumes the days at
  the speed they had, as answering a card does. (It used to leave the game standing, with a tip pointing at Space.)
  `answered` in `src/game/app.ts`.
- **People with nothing to do are given work from the slip.** Once planting is ordered, whenever the player is
  waiting on the crew and somebody has no order and is helping nobody, the slip under the date says so with the
  fist ("Everyone is idle: cut brush at Brook Field") and a key beside it, Order it, gives that order. Not while
  an order on the list has nobody at it yet: those people are about to go to it. One job on the land at a time: the hedgerow round a crop on low ground first, then stones
  where a field is stony, then a tract to fell. Work on the crop still comes first: anyone needed there leaves the
  land work for it. `freeWork` in `src/game/goals.ts`, `tests/free.test.ts`.

## The loop on the screen

The owner, later the same evening, with a picture of the farm a few minutes in (the slip "Everyone is idle", a key
"Order it", the money board half blank, tags hung at the fields' edges):

> "menus need another ux pass and the icons stay over the character at too close of a range and block their models
> and its still unclear what your supposed to actually be doing and the freedom like whats building etc how do you
> get upgrades like think rimworld think cities skylines think factorio think frostpunk think stardew valley"
>
> "everyone is idle? ok and then the time randomly changes.... order it? order what? huge blank box sentence that
> doesnt make sense huge as uncentered labels all over the farm and no sense of direction"

The games he names carry their loop on three fixtures: objectives that always name a next step, a build menu that is
always open with prices and locks, and upgrades that say what they unlock. This game had the things to buy and no
place that showed them, and its first year could buy none of them. What changed, each from the screen he sent and
from two viewers who knew nothing of the game (docs/quality/five-second.md):

- **One loop, said on the screen.** Grow and sell potatoes; spend on buildings, machines, people and land; keep
  what is left after the year-end bills above nothing, five years. The money board says the last of it under its
  figure ("Goal: keep this above $0 · year 1 of 5").
- **Build, first on the bar.** One sheet with every building, machine, kind of hire and tract to clear: what it
  does, what it costs, and either the one press that gets it or the few words that say why not ("Needs the machine
  shed", "No bed free: a bunkhouse adds six"). Three figures across its top: what can be spent, the logs and stone
  in the yard, the year-end forecast. `src/ui/buildmenu.ts`. The bar is Build, To do, Fields, People, Money, Menu;
  Work is under People, and contracts and the almanac are in the menu.
- **A first year can build.** Once the season is under way the bank lends for a building, a machine or a
  contractor until the farm owes $30,000 in all (`BUILD_CREDIT`), and machines are bought in any part of the year.
  Before, both came out of cash, and a first year is on the loan from its first day. `spendable`, `spendBlock` in
  `src/sim/buildings.ts`.
- **Idle people are offered work by name.** Under the slip, one line on canary: who is idle, and each job they can
  be given as a key that names it ("Cut brush", "Cut trees"); the key's slip and the order's toast say where, and
  the camera goes there. It never moves the land when it comes or goes, and it steps down while a card is open.
  The goal slip itself never says there is nothing to do ("The crop is growing").
- **The clock changes only when the player changes it.** Every day is a minute at 1×, twenty seconds at 3×, ten at
  6× (RimWorld's steps), whoever is or is not working. Days with no work in them no longer go by in seconds by
  themselves; the one fast run is the player's own Skip ahead. `src/game/app.ts`.
- **Nothing is hidden in a guided year.** The tips used to bring the forecast, the people and the year-end figure
  onto the screen one at a time, each keeping its place blank until then.
- **Tags are small, and on a wide desk stand on their fields.** A quarter smaller everywhere. Where a card has its
  own place at the right (a desk 1530 wide or more in the interface's pixels: 1920 by 1080 and up), a tag stands on
  the middle of what shows of its field. On a smaller window a card stands beside its tag on the field's own
  ground, and the tag still hangs at the field's near edge to leave that ground free. `fieldAnchorNow` in
  `src/render/index.ts`, `app.centerTags`.
- **From near, a person is their own figure.** Once someone stands taller on the screen than their face pin, the
  pin gives way to their name over their head; at every range it stands clear above the head. `src/ui/pins.ts`.
- **The interface is drawn smaller on a large screen**: at its own size up to 1920 by 1080, a quarter larger at
  2560 by 1440 (it was half as large again). `src/ui/scale.ts`.

## What was given up

- The three-minute day in which a tractor went at a tractor's pace (docs/LONGDAY.md): at a minute a day the
  machines go at a game's pace, three times that.
- The light going through the day.
- Farming's proportions: six lanes do not plant five acres, and nobody drives at 50 km/h through a potato field.

## Known limits

- The browser tests of everything but the day itself run on the old short-day clock (`e2e/base.ts`) and on a farm
  of one: they hold the interface and the rules, not this pacing. `e2e/longday.spec.ts` and
  `tests/longday.test.ts` hold the pacing.
- The player's verbs are the ones the game had. With everyone at work, or with no work on the land left to give,
  the slip still says what the player is waiting for ("Nothing to do until the weigh ticket").
- A first spring's choices (what each field grows, a contract, who is hired) are no longer the player's: the first
  year is the usual plan. A farm started from the address bar (`?year=1987`) still opens on its plan.
