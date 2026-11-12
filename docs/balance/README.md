# Balance tooling

`npm run balance` plays every bot below on farms with seasons of their own, made from each farm's seed the way the
shipped game makes them (`climateWorld` in `src/sim/climate.ts`), ten-season campaigns from Year 1, every bot on every
farm, and judges the gates below. A smaller run plays the naive, reference and expert bots over the record's real
start years (five seasons, six seeds), for comparison with the passes before the farmstead. Results are in `latest.md`
(tables) and `latest.json` (the same, plus each bot's spending and counts). The run is not made on the laptop: on the
Windows box mizepc2, `tools/remote/pc2.sh w2bal 'set SEEDS=200&& npm run balance' docs/balance <local folder>`
(`SEEDS`, `YEARS`, `RECORD_SEEDS` and `WORKERS` override) takes about fifteen minutes on fourteen worker threads.

The code is in `tools/balance/`: `bots.ts` (the bots and the campaign driver, which also tallies what each campaign
spent and what happened on the farm), `run.ts` (the tournament and the gate verdicts), `trial.ts` (variants of the
expert against each other on the same farms, for setting its thresholds), `stats.ts`, `world.ts`.

## The gates

Wave 2 replaced the gates of the earlier passes with four that ask about the whole farmstead game:

- **G1, the first-time player's game.** The naive bot keeps at most 10% of farms through the game's own goal of
  five seasons, and the reference bot (the coach's practice) 60% to 80%; the expert beats the reference and the
  reference beats the naive bot on ten-year net worth, each interval above zero.
- **G2, every mechanic earns its place.** For each mechanic of the farmstead and the bigger farm, the expert using it
  as well as it can beats the same expert without it on ten-year net worth, the 95% interval above zero. A mechanic
  whose interval lies below zero is a trap; one inside it is unproven. Each row also shows where the mechanic's catch
  turns up as a cost (the spending lines that are higher when it is used, and the counts that change). The crop's
  verbs (hilling, scouting, spraying and the rest) are reported the same way but do not gate.
- **G3, no dominant plan.** No fixed plan is always right: of five building orders (the expert's own and four
  others) and five hiring rules (the expert's fit for each opening, the hiring hall only, always the best at machine
  work, always the best at field work, always the cheapest), none does best on more than half the farms; holding a
  block of land every year beats the home farm alone on 20% to 80% of farms; and no farmstead rule or building is
  worth having on 90% of farms or more (winter work, which is the whole winter's labour, and the bigger farm's land
  and hiring at all are not counted as rules).
- **G4, the long game holds.** The expert's median net worth rises every year to year ten, it still invests (over
  $2,000 a year in land, buildings, equipment or contractors) in at least three of years six to ten, and its median
  cash at year ten is under half its median net worth.

Intervals are 95% bootstrap intervals over farms, 2,000 resamples; each farm is its own weather and prices, so farms
are independent.

## Fair play

A bot reads the game only as a player can: `fieldInfo`, `fieldActions`, `today`, `forecast`, `jobWaits` and
`advise`; for the bigger farm and the farmstead `peopleInfo`, `applicantInfo`, `labourInfo`, `landInfo`,
`tractInfo`, `buildingInfo`, `materialsInfo`, `mortgageInfo`, `storageInfo`, `standInfo`, `pondInfo`, `winterInfo`,
`offerInfo`, `contractInfo`, `planCosts`, `cellarCapacity` and `buildCost`; the incidents waiting for an answer (whose
person, lot and applicant the question names); the published land table, building table, equipment prices and the
rest of the published rules in `src/sim/params.ts` and `src/sim/varieties.ts`; the market quote; the public campaign
fields; and the events each command and each day report. It never reads a field's hill arrays or true blight, the
estimate's bias, a lot's rot, seed blight or virus, future weather, the year's price level or the records.
`tests/bots.test.ts` checks the source of `bots.ts` for those names, checks that the check catches them, and checks
that each ablation really takes its mechanic away.

## The bots

| Bot | What it does |
|---|---|
| naive | Plants the six home fields to certified Katahdin on May 20, does nothing else, digs on September 20 whatever state the vines are in, and sells each lot once it is weighed. |
| reference | The coach's practice: every day each field gets the order the advice has for it, which is what a player gets by giving every field its smart order (right-click); the advice's sales are made; every incident takes its default. The default plans, no land, people, buildings, equipment or contracts, and the crop is kept in the cellar and sold in March. |
| expert | The best fair play found, described below. |
| ablations | The expert with one mechanic taken away (or, for the foreman, which the expert does not use, added), listed in the G2 table. |
| with-brook, with-ridge, with-dufour | The expert holding that block every year, rented or bought as it would. |
| order-*, hire-* | The expert held to a fixed building order or hiring rule, for G3. |
| only-*variety*, all-contracts, calendar | As in the earlier passes: one variety on every field, every contract signed, the same dates every year. |

### The expert

The crop play is the expert of the third pass (planting by each field's own soil temperature, hilling at 6% and
38% leaf cover, scouting and pulling blighted hills, spraying in a bad blight year ahead of a bad blight day, watering
at the pivot triggers, one test dig before the kill, the kill held while the crop is still gaining value, digging once
the skins are set, selling each lot in its best month), now on Caribou Russet everywhere since every generated year is
past its release. It plans each field's rotation over the seasons left (up to six), and keeps the farm from swinging
between all potatoes and all rest: a field that gives up less than $4,000 against its best rotation is planted until
half the farm is in potatoes.

On the farmstead:

- **People.** It wants someone to walk the fields once more than five potato fields are grown (another for each
  eight more), and on a farm of fifteen potato fields or more a driver for each tractor beyond the first. Each opening goes to the applicant whose speed at
  that work, at $1,000 a month a point of speed, most exceeds their wage, if that beats the hiring hall; otherwise
  the hall. People are kept from year to year while there is a role for them. A driver is set to machine work first,
  a walker to field work first and to mind the stand; the farmer drives first once someone walks the fields. At a
  peak of machine work (more than 18 days due within a month for each person who drives) a tractor operator from the
  hall drives what would otherwise stand idle, a tractor or the truck, and goes when his paid month is up and the
  work has fallen under 12 days each. Someone near quitting gets a raise; a neighbour's offer is matched for
  someone unhappy enough to go, before the harvest is under way; raises go back to the asking wage each spring.
  Someone asking for work in the season is taken on when a role is short. No foreman (see G2).
- **Sundays and pickers.** Works Sundays while two or more orders wait on the list and nobody is more tired than
  0.5. Pickers come while four or more days of digging wait, the day is fit to dig, the barrels hold under 500 cwt
  and no frost is forecast.
- **Land.** Each spring, for each field beyond the home six, it plans the seasons left with the field rented (each
  year potatoes, rest or given back) or bought on the mortgage (potatoes or rest, at the interest on the loan as it
  is paid down), and takes the better when it beats leaving the field, best first, as far as the spring loan goes.
  It buys only with five or more seasons left, when the down payment and the spring's planting leave at least $60,000
  of the loan, and when the year end, as far as the spring can tell (a potato field sure of $15,000), still leaves
  $30,000. In spring, cash the year end would leave beyond $40,000 goes off the mortgage.
- **Tracts.** The farmer fells the home woodlot (then Burnt Hill, the swale and the back lot) in winter, unpaid; the
  stumps are pulled the next spring with three or more seasons left; Burnt Hill and the back lot are bought, one at
  a time, when there is cash. New ground rests its first year and has its rocks picked while it is over 0.35.
- **Rocks, brush, tile.** Rocks are picked when no crop is in: on a field over 0.45 resting or dug, over 0.6 in
  spring before planting. Hedgerows on bottom land are cut each time they grow back. Owned bottom land is tiled with
  four or more seasons left.
- **Buildings.** In the order stand, weather station, machine shed, bunkhouse, potato house, road, pond, packing
  shed, each when it is wanted: the stand and the station from the start; the shed once the farm grows ten potato
  fields or wants a driver; the bunkhouse once more than two hired people are wanted; a potato house once the crop
  overflowed the cellar by 1,500 cwt; the road once the yard holds most of its stone or the Dufour place is held; the
  pond once a season needed three waterings without a reel; the packing shed once 3,000 cwt is stored. It orders over
  the winter as the crop is sold, keeping what the year end will take and $5,000 more, or in spring while the plan
  fits the loan and the year end. Logs beyond what the wanted buildings need are sold.
- **Machinery.** The second tractor (once the shed stands) at twelve potato fields, the third at fifteen, the truck
  at eight, each from cash while the spring loan and the year end allow.
- **Winter.** The farmer builds whatever is going up, otherwise fells, otherwise packs. Hired people are kept on to
  build or fell while there is work, or to pack when packing pays their wage; homebodies are laid off.
- **Hauling.** The haul order goes to the top of the list every day.
- **Incidents.** A rush part when planting, digging or hauling has two days of machine work waiting; a buyer's offer
  taken when 10% over today's price beats the lot's best month in the cellar; applicants and neighbours' offers as
  above.
- **The stand.** A season that is done stays open while the stand is open, until October 31, as long as it sells
  more than the hired people's wages.

## Wave 2 tuning log

The farmstead simulation (people, tracts, buildings, the truck, hauling, winter work, incidents) landed on the economy
of the third pass. Round 0 is the rebuilt bots on that economy; each later round is a change of named constants in
`src/sim/params.ts` and `src/sim/farm.ts`, with the expert's own fixes listed beside them (a better player, not a
weaker one). At most eight rounds; seven were used. Rounds 0 to 3 ran 60 or 100 farms, rounds 4 and 5 150, rounds 6
and 7 200.

The reference's keep rate was read off a sweep before round 1 (100 farms, five seasons, nothing else changed):
household draw 11,000: 43%; 9,000: 58%; 8,000: 64%; 7,000: 71%; start cash 25,000 alone: 54%; draw 9,000 with start cash
24,000: 68%; hauling at 1,400 cwt a day instead of 900: 42% (the haul does not decide a newcomer's farm). Slower rest and
a stronger tiredness slowdown (rounds 3 and 7) left it at 68%: a farmer alone on six fields is never worn down.

| Round | Change | G1 (kept 5 yr: naive / reference / expert) | G2 (mechanics that earn, of 29; traps) | G3 | G4 |
|---|---|---|---|---|---|
| 0 | None: the rebuilt bots on the merged economy (60 farms) | FAIL: 0% / 38% / 82% | FAIL: 7; traps foreman, bunkhouse, pickers, tile, shed, truck, second tractor | FAIL: the expert's building order best on 31 of 60; blocks beat the home farm alone on 3% to 10% of farms | FAIL: cash at year ten more than half of net worth |
| 1 | `LIVING` 11,000 to 9,000, `START_CASH` 18,000 to 24,000; rents and prices: intervale 6,000/72,000 to 3,000/38,000, ridge 8,500/102,000 to 4,500/55,000, Dufour 6,250/75,000 to 3,500/44,000; `TILE_FEE` 4,000 to 2,000, `TILE_TAW` 0.94 to 0.97; `PACK_NO1` 0.08 to 0.15, `PACK_CHARGE` 0.5 to 0.4; `STAND_CWT` 4 to 6; `MOOD_TIRED` 0.6 to 1. Expert: hall operators for machine-work peaks, pickers only for a backlog (100 farms) | PASS: 0% / 68% / 94% | FAIL: 12; traps priorities, foreman, bunkhouse, mortgage, third tractor | FAIL: building order 62 of 100; ridge 86% | PASS |
| 2 | Ridge rent 4,500 to 5,500; prices about ten years' rent (intervale 30,000, Dufour 35,000); `MORTGAGE_PRINCIPAL` 0.1 to 0.07; `POACH_CHANCE` 0.006 to 0.01, `POACH_MOOD` 0.6 to 0.7; `PICKER_DAY` 160 to 130, `PICKER_DIG` 1.4 to 1.5; `SHED_SPEED` 1.1 to 1.15; truck 14,000 to 11,000, third tractor 16,000 to 11,000. Expert: priorities only lift each person's own work | PASS: 0% / 68% / 96% | FAIL: 12; traps foreman, bunkhouse, working every Sunday better than choosing, mortgage, shed, second and third tractor | FAIL: building order 56; blocks in band | FAIL: idle cash |
| 3 | `REST_PER_DAY` 0.3 to 0.15, `TIRE_PER_DAY` 0.07 to 0.08 (tiredness builds over a long run of work; before, a person's tiredness at harvest averaged 0.04); `OPERATOR_WAGE` 800 to 700; packing shed 12,000 to 8,000, `PACK_PER_DAY` 30 to 40; `PICKER_DAY` to 110. Expert: keeps a finished season open while the stand pays, raises go back to the ask each spring, bought land valued without a year off | PASS: 0% / 68% / 93% | FAIL: 13; raises and packing now earn | FAIL: building order 57; clearing and prompt hauling right on 90% or more | PASS |
| 4 | `STUMP_FEE` 3,000 to 6,000; `MORTGAGE_RATE` 0.08 to 0.06; `ROAD_SPEED` 0.8 to 0.7; `PICKER_DAY` to 90; truck and third tractor to 8,000; weather station 1,800 to 1,000. Expert: Sundays worked while orders wait and nobody is worn, a season driver only on a big farm, more careful land buying (150 farms) | PASS: 0% / 70% / 96% | FAIL: 16; mortgage, stand, Sundays-off rule earn; traps bunkhouse, shed, truck, second and third tractor | FAIL: building order 77 of 150 | FAIL: idle cash |
| 5 | `HAND_WAGE` 450 to 380, `OPERATOR_WAGE` 700 to 550, `ASK_BASE` 100 to 70; `HURT_CHANCE` 0.05 to 0.08. Expert: pays idle cash off the mortgage, the second walker and second tractor later | PASS: 0% / 70% / 99% | FAIL: 16; traps bunkhouse, second and third tractor | FAIL: building order 112 of 150 | PASS |
| 6 | `MOOD_BED` 0.1 to 0.2; `TILE_FEE` to 1,000; potato house 9,000 to 7,000; the road 60 loads of stone to 40; truck to 6,000. Expert: second tractor at twelve potato fields, third at fifteen, a third person only on the biggest farms (200 farms) | PASS: 0% / 69% / 97% | FAIL: 22; traps bunkhouse, working every Sunday better than choosing, second and third tractor | FAIL: building order 166 of 200 | PASS |
| 7 | `HURT_CHANCE` back to 0.05 (0.08 broke a held rule test of the breakdown odds and bought nothing); `TIRED_SLOW` 0.3 to 0.6; `BREAK_TIRED` 2 to 3 | PASS: 0% / 69% / 98% | FAIL: 20; traps foreman, bunkhouse, third tractor; unproven: never resting Sundays, pickers, potato house, shed, stand, second tractor | FAIL: building order 169 of 200; clearing 94%, prompt hauling 93% | PASS |

Round 7 is the final economy. The thresholds of the expert's farmstead play were set by trial runs (`trial.ts`, 100
farms, against the expert as it stood before round 5): the second tractor at 12 potato fields instead of 7, +$14.0k
($0.3k to $29.4k); at 10, +$10.4k (-$1.5k to $24.6k); peak hires at 24 days a driver instead of 18, +$3.9k (-$0.8k to
$9.0k); no truck, +$10.1k ($4.7k to $15.4k) and no shed, +$29.8k ($14.5k to $46.2k) at the round 4 prices, which round 5
and 6 then changed; working every Sunday, +$11.0k (-$5.3k to $28.7k); resting Sundays when anyone is over 0.7 instead of
0.5, +$0.6k (-$8.9k to $10.5k); no bunkhouse, +$20.5k ($16.1k to $25.1k).

## What the gates show

See `latest.md` for every number. At round 7, 200 farms:

- **G1 passes.** The naive bot keeps no farm; the reference keeps 69% through the game's five seasons and 5% through
  ten, so a newcomer following the coach survives the first years and needs the deeper systems to go on (its yields
  fall from wilt and stones it does nothing about: it rests a field only every other year and picks rocks only past
  0.6). The expert keeps 98% and 97%. Expert over reference $418k ($396k to $441k), reference over naive $9k ($7k to
  $11k). On the record's real years (five seasons, 258 campaigns) the reference keeps 86%: the generated seasons are
  harder than the record, so the band is judged where the shipped game is played.
- **G2 fails, honestly.** 20 of 29 mechanics earn their place, each with its catch showing as a cost: clearing
  ($96.6k; stumping fees, wages, the mortgage on the land it lets the farm buy), winter work ($248k), rocks ($49.5k),
  brush ($46.8k), the pond ($62.3k; dry spells), hauling before frost ($166k against hauling last), the mortgage
  ($31.5k; interest), contracts ($34.8k), raises and matching ($23.7k; wages), answering incidents ($30.1k), work
  priorities ($14.1k), tile ($14.2k), the packing shed ($11.5k; winter wages and the charge), the road ($14.5k), the
  weather station ($9.4k), the truck ($9.4k), applicants over the hall, land beyond the home six, hiring at all, and
  working Sundays at all against never ($30.8k). Still traps: **the foreman** (-$136k against an expert who gives its
  own orders: the foreman's upside is the player's attention, which no bot runs short of, so no number makes it pay
  here); **the bunkhouse** (-$3.9k, -$6.9k to -$0.9k: a third and fourth hired person cost more than they add on a farm
  that tops out near 15 fields, whose work is lumpy and mostly idle outside planting and the harvest); **the third
  tractor** (-$4.7k, -$6.7k to -$2.8k, for the same reason). Unproven (interval spans zero): never resting on Sundays
  against the expert's choice (-$2.7k, -$12.6k to $7.8k: the Sundays-off rule costs and saves about equally), pickers
  ($0.7k), the potato house ($5.4k), the machine shed (-$0.8k), the stand ($7.3k, -$0.1k to $14.4k) and the second
  tractor (-$3.7k). None is free money: every mechanic that earns shows a higher cost line or a count where its catch
  bites (see the last two columns of the G2 table). The crop's verbs all earn except test digs (-$1.2k), as in the
  third pass.
- **G3 fails on two counts.** The expert's own building order (stand, station, shed, bunkhouse, potato house, road,
  pond, packing shed) is best on 169 of 200 farms: putting the cheap, quick-paying buildings first is always right.
  Clearing the tracts (better on 94% of farms) and hauling before frost (93%) are near-certain. Hiring passes (the
  best fixed hiring rule, always the best machine hand, wins 66 of 200), and every block of land is a real choice
  (holding it every year beats the home farm alone on 42% of farms for the intervale, 67% for the ridge lots, 61% for
  the Dufour place). For information: Yukon Gold is the best single variety on 80 farms, Caribou Russet on 68,
  Russet Burbank 26, Katahdin 25; signing every contract beats choosing on 28%; the fixed calendar on 1%.
- **G4 passes.** The expert's median net worth rises every year: $26k, $63k, $70k, $107k, $147k, $191k, $247k, $283k,
  $331k, $387k; it invests in land, buildings, equipment and contractors until year eight, and its median cash at
  year ten ($180k) is under half its net worth. But from year seven the farm holds 15 of the 18 parcels and every
  building it wants, and the money's only use left is paying off the mortgage early (which it does): cash then piles
  up. Sinks it should have: more land to buy beyond the eighteen parcels, upkeep on buildings and machinery that grows
  with the farm, and a household draw that grows with net worth.

## Wave 3: the routine

First-time players found people idle unless every job was ordered by hand. The crew now works to a routine
(standing orders, `docs/FARMSTEAD.md` section 8): planting, hilling, walking the fields, pulling blighted hills, test
digs, digging and hauling go on the list by themselves; spraying, watering and killing the vines stay the player's
calls. The bots: `untended` gives no order, answers nothing and sells nothing; `calls-only` leaves the routine to
itself and answers only the calls (each field's spray, water or kill need), makes the advice's sales and sells the
cellar in March; `reference` is the coach's practice. Each was also played with every standing order switched off,
which is the game before the routine. The naive bot switches the routine off (it does nothing but plant and dig on
its dates), and the expert keeps its own list (only hauling by itself, and not even that when hauling late).

200 farms, ten seasons, after the change (the "off" rows are the game before it):

| Player | Routine | Kept 1 yr | Kept 5 yr | Kept 10 yr | Year-one revenue | Ten-year net worth, median | Mean |
|---|---|---|---|---|---|---|---|
| untended | on | 72% | 0% | 0% | $34k | -$32k | -$38k |
| untended | off | 0% | 0% | 0% | $2k | -$36k | -$36k |
| calls only | on | 100% | 69% | 5% | $64k | -$28k | -$30k |
| calls only | off | 0% | 0% | 0% | $2k | -$36k | -$36k |
| reference | on | 100% | 67% | 3% | $63k | -$27k | -$29k |
| reference | off | 100% | 67% | 3% | $63k | -$28k | -$30k |

- An untended farm now brings in a crop: $34k in year one instead of $2k, and 72% see the second spring instead of
  none. It still loses every farm within five years, and 28% in the first: with no vine kill the crop is dug late into
  the frost, with no spray blight reaches the tubers, and with nothing sold the stored crop rots through the cellar
  (in 11 of the first 12 farms' untended first years at least one pile broke down with rot; storage is a call
  too). Neglect is ruinous, but no longer by planting nothing.
- The calls are worth making: answering them is worth $30k of revenue in year one ($64k against $34k), 69% of
  farms kept five seasons against none, and $8k of ten-year net worth on the mean (both lose the long game without
  the deeper systems, as the reference does).
- The reference is unchanged in effect (it ordered every job anyway): 67% kept five seasons, as before the routine.

The gates against round 7 of wave 2 (the same 200 farms):

| Gate | Wave 2, round 7 | With the routine |
|---|---|---|
| G1 | PASS: reference 69% kept five seasons, expert 98%; expert over reference $418k | PASS: reference 67%, expert 97%; expert over reference $425k, reference over naive $25k (was $9k: the naive bot plants and digs on its dates, the reference now also gets the late dig) |
| G2 | FAIL: 20 of 29 earn; traps foreman, bunkhouse, third tractor | FAIL: 16 of 29 earn; traps the same three. Four that had earned by a narrow margin are now unproven, their intervals overlapping the old ones: work priorities $4.4k (-$2.8k to $12.0k; was $14.1k), the stand -$3.5k (was $7.3k), the road -$1.4k (was $14.5k), the truck $4.0k (was $9.4k). Raises fell from $23.7k to $13.1k because the neighbour now asks for a person once a year |
| G3 | FAIL: building order 169 of 200; clearing 94%, prompt hauling 93% | FAIL: building order 165 of 200; clearing 92%, prompt hauling 97% |
| G4 | PASS | PASS: median net worth $29k to $398k; cash at year ten $182k |

What changed underneath the expert besides the routine: the crop in the potato house is charged and shrinks every
night instead of at the sale or the close; a contract falling due takes what is owed from the potato house; ahead of
a frost drivers leave other machine work for the barrels; the yard's logs count in whole loads; and the year's
telegrams are bounded. No constant was retuned in this wave.

### What storage really nets

`node tools/balance/storage.ts` (200 generated farms, ten years each, a sound lot dug on October 1 into the cool
cellar without ventilation, against selling it at the dig):

- Katahdin's price in April stands a median 22% above October 1 (middle half 15% to 29%, one year in ten under 9%).
  Each month's move matches the usual curve on average, and goes the other way in one year in ten or more (November
  to December: +4.3% on the curve, median +4.4%, down in 12% of years).
- But a stored lot does not get the price alone. Sold in April, after shrink, sprouting and the charge: Katahdin
  -14% (it sprouts in March), Caribou Russet -17% (February), Kennebec +5%, Russet Burbank +5%. Sold in its own best
  month: Katahdin +6% (March in half the years), Caribou +4% (February in 41%), Kennebec +7%, Burbank +7%.
- So "usually about 25% above by April" is true of the price and wrong of the crop. `storeOutlook(world, c, lot)`
  gives, for a lot, what keeping it to each cellar month usually nets and its best month; the ticket's words should
  come from it.

## Earlier passes

The passes before the farmstead played five seasons over the record's real start years, on the fourteen-field game.
Their gates (expert over reference over naive; every verb earns; no single variety, block or calendar dominates;
losable and winnable) and tuning are kept here as history.

### How the expert's thresholds were set

Trial runs over all 43 start years, 24 seeds, one change at a time from the final expert, on the
final economy (mean net worth after five seasons; every setting kept 100% of farms):

| Change from the final expert | Mean net worth | Difference (95% interval) |
|---|---|---|
| final expert | $115.8k | |
| plants by the station soil reading at 7 C (the previous expert) | $112.5k | -$3.4k (-$4.7k to -$2.2k) |
| plants by the station soil reading at 8 C | $112.9k | -$2.9k (-$3.9k to -$1.9k) |
| plants at 7 C by field position | $112.2k | -$3.6k (-$5.2k to -$2.2k) |
| plants at 9 C by field position | $114.2k | -$1.7k (-$2.7k to -$0.5k) |
| watering waits for 8 mm of forecast rain instead of 12 | $114.9k | -$0.9k (-$1.4k to -$0.5k) |
| waters by hand at the pivot triggers (65%, 60%) | $114.9k | -$0.9k (-$1.6k to -$0.3k) |
| sprays from 40 severity values instead of 30 | $113.3k | -$2.5k (-$3.5k to -$1.4k) |
| sprays from 20 severity values | $116.6k | +$0.7k (-$0.4k to $1.9k) |
| sprays once blight is on the farm, ahead of any blight day | $112.4k | -$3.4k (-$4.3k to -$2.4k) |
| sprays on the NoBlight interval from the blight watch | $94.1k | -$21.7k (-$23.9k to -$19.4k) |
| pulls up to 12 blighted hills before spraying | $107.8k | -$8.0k (-$9.5k to -$6.7k) |
| never pulls, sprays on any find | $103.8k | -$12.0k (-$14.5k to -$9.6k) |
| scouts every 5 days, every 3 once blight is found | $114.2k | -$1.7k (-$2.5k to -$0.8k) |
| test dig 40 days after tuber set instead of just before the kill | $113.5k | -$2.4k (-$3.0k to -$1.7k) |
| three test digs instead of one | $115.0k | -$0.9k (-$1.6k to -$0.2k) |
| no holding of the kill for a crop still sizing | $115.9k | +$0.1k (-$0.5k to $0.7k) |
| also kills early once value grows under 0.5% a day | $115.0k | -$0.8k (-$1.5k to -$0.2k) |
| buys the reel in every era | $113.1k | -$2.7k (-$3.8k to -$1.7k) |
| never buys the reel | $115.2k | -$0.7k (-$1.5k to $0.0k) |
| no cellar ventilation | $105.5k | -$10.4k (-$12.2k to -$8.6k) |
| also buys the boom sprayer | $113.2k | -$2.6k (-$3.3k to -$1.9k) |
| also buys the two-row harvester | $109.9k | -$5.9k (-$6.3k to -$5.6k) |
| Kennebec on every field until 2015 | $83.8k | -$32.0k (-$38.2k to -$26.0k) |
| Yukon Gold on every field until 2015 | $109.0k | -$6.8k (-$8.5k to -$5.1k) |
| Katahdin on every field until 2015 | $109.9k | -$5.9k (-$8.3k to -$3.6k) |
| Russet Burbank on one ridge field | $115.1k | -$0.8k (-$1.5k to $0.0k) |
| Atlantic on the two bottom fields until 2015 | $111.1k | -$4.7k (-$6.8k to -$3.0k) |
| Caribou Russet on every field from 2015 (the previous expert) | $114.9k | -$0.9k (-$1.6k to -$0.3k) |
| one field of Norland for the early market | $109.8k | -$6.1k (-$7.5k to -$4.7k) |
| one field of Superior for the early market | $108.9k | -$6.9k (-$8.6k to -$5.3k) |
| Yukon Gold dug green for the early market | $106.4k | -$9.4k (-$12.8k to -$6.4k) |
| rotation valued at $20,000 a healthy field instead of $25,000 | $111.1k | -$4.7k (-$8.0k to -$1.5k) |
| rotation valued at $30,000 a healthy field | $109.2k | -$6.7k (-$8.1k to -$5.3k) |

Spraying from 20 severity values came out ahead in every pass (+$1.3k, +$0.6k, +$0.7k) and inside the
interval every time, so the expert keeps 30.

What the third pass changed in the expert, each measured against the expert as it stood (six seeds
unless stated): the cellar value from the day of the dig, with sprouting by days out of the ground and
the contract's flat price, +$3.4k on the same campaigns; planting by each field's own soil temperature at 8 C, +$3.1k ($1.7k to
$4.6k), confirmed on seeds 7 to 24 at +$3.0k ($1.8k to $4.3k); Atlantic on the two bottom fields from
2015, +$1.4k ($0.4k to $2.6k) on eight seeds and +$0.4k (-$0.5k to $1.2k) on seeds 7 to 24; the
watering hold-off at 12 mm of forecast rain instead of 8, +$0.6k (-$0.2k to $1.4k) and on seeds 7 to 24
+$1.1k ($0.6k to $1.7k).

### Economy tuning log

Each pass rebuilt the expert first, then tuned the economy within the listed parameters, each round a
parameter change and a rerun.

#### Second pass (after `c639003`)

At most ten rounds. Price moves for gate 3 were sized beforehand from the single-variety runs of the
previous round (net worth moved by revenue times the price change), which predicted round 1's gate 3
wins exactly. Six seeds.

| Round | Change | Gate 1 (kept: expert / reference / naive) | Gate 2 | Gate 3 | Gate 4 |
|---|---|---|---|---|---|
| 0 | None: the rebuilt expert on the commit's economy | FAIL: 100% / 60% / 0% | FAIL: test digs -$1k (-$2k to $1k) | FAIL: Yukon Gold wins 26 of 36 campaigns and 27 of 44 seasons | PASS |
| 1 | `LIVING` 15,000 to 11,500; large tubers of the non-russets 0.8 to 0.6 of No. 1; Yukon Gold $16.50 to $16.20, Russet Burbank $13.50 to $14.00, Atlantic $12.50 to $13.75 | FAIL: 100% / 80% (just over the target) / 0% | FAIL: test digs -$1k (-$2k to $1k); spraying $2k ($0k to $4k) | PASS: campaigns Burbank 13/43, Katahdin 11/43, Gold 11/36; seasons Burbank 18/51, Atlantic 15/48, Gold 11/44 | PASS |
| 2 | Large-tuber factor back to 0.8 (it gave test digs nothing); `LIVING` 11,500 to 13,000, read off a sweep of the household draw for the reference (15,000: 60% kept, 14,500: 61%, 14,000: 66%, 13,500: 70%, 13,000: 74%, 12,500: 77%, 11,500: 84%); the expert retuned | PASS: 100% / 74% / 0% | FAIL: test digs -$1k (-$2k to $1k) | PASS | PASS |

#### Third pass (after `c5faac7`)

The commit charged storage from the day of the dig, aged lots from the dig, gave the contract crop one
price, made the yield estimate a model of what the grower can see, let the forecast miss, rotted more
seed in cold soil and warmed the soil by field position; Atlantic's price went back to $12.50 with the
flat contract. At most eight rounds; three were used. The only economy change is the household draw.

| Round | Change | Gate 1 (kept: expert / reference / naive) | Gate 2 | Gate 3 | Gate 4 |
|---|---|---|---|---|---|
| 0 | None: the re-tuned expert on the commit's economy (24 seeds) | FAIL: 100% / 52% / 0% | FAIL: test digs $0k (-$0k to $1k) | PASS: campaigns Katahdin 14/43, Burbank 10/43, Atlantic 9/40, Gold 8/36; seasons Atlantic 17/48, Burbank 15/51, Gold 13/44 | PASS |
| 1 | `LIVING` 13,000 to 10,500, read off a sweep for the reference alone (six seeds: 13,000: 53% kept, 12,000: 60%, 11,500: 63%, 11,000: 66%, 10,500: 71%, 10,000: 72%; the other levers at 13,000: `STORE_COST` 0.20: 65%, 0.15: 71%; `START_CASH` 24,000: 62%; `FIELD_COST` 7,500: 66%). The storage charge stays: $0.30 a cwt a month is about 2% of the price a month, the share the 1980 Maine record gives (`06`). Six seeds. | PASS: 100% / 71% / 0% | PASS on these six seeds, test digs $2k ($1k to $4k), but not on any other six: seeds 7-12 $0.0k (-$1.1k to $1.0k), 13-18 -$0.8k, 19-24 -$0.6k | PASS | PASS |
| 2 | No economy change. The tournament moved to 24 seeds, and the watering hold-off to 12 mm | PASS: 100% / 69% / 0% | FAIL: test digs $0.3k (-$0.2k to $1.0k) | PASS: campaigns Katahdin 14/43, Burbank 10/43, Gold 8/36, Atlantic 8/40, Caribou 2/6, Kennebec 1/43; seasons Atlantic 17/48, Burbank 15/51, Gold 13/44, Norland 4/51, Caribou 1/10, Kennebec 1/51 | PASS |

Round 2 is the final economy.

### What the gates show

See `latest.md` for the current numbers. At the time of writing (24 seeds):

- Gate 1 passes: the expert keeps 100% of farms, the reference 69% and the naive bot none; the expert
  leads the reference by $116k ($109k to $123k) and the reference leads the naive bot by $38k ($31k
  to $46k).
- Gate 2 fails for **test digs** only: $0.3k (-$0.2k to $1.0k). Every other verb earns its place, the
  smallest being spraying at $6k ($3k to $8k) and scouting and roguing at $10k ($8k to $13k).
- Gate 3 passes: over campaigns Katahdin wins 14 of 43 start years, Russet Burbank 10, Yukon Gold 8 of
  36, Atlantic 8 of 40, Caribou Russet 2 of 6 and Kennebec 1; over single seasons Atlantic wins 17 of
  48, Burbank 15 of 51, Gold 13 of 44, Norland 4, Caribou and Kennebec one each. The fixed calendar
  beats the expert in no start year and in one single season of 51.
- Gate 4 passes: the naive bot loses every farm and the expert keeps every one.

#### Why test digs still do not pay

The commit made the yield estimate genuinely uncertain: on the expert's fields, the estimate on the
last day before the dig ran 17% (one standard deviation) from the crop that came out without a test
dig and 13% with one. The dig informs; the question is whether any decision worth money turns on what
it shows. This pass measured the most that each candidate decision could gain, over 43 start years
(three seeds for the tallies, 24 for the comparisons).

- **The vine kill, from tuber size and growth.** A scratch copy of the expert was given the true
  average tuber weight and the true daily growth of every field (hidden state no fair bot can read)
  and no test digs. With the true size it made $115.5k, the same as the expert without digs; with the
  true size and growth, $115.6k. Re-tuning its kill rule for that knowledge (kill below 0.3% or 0.5%
  value growth a day, hold the kill while growth stays over 0.2% or 0.6%) left it $0.2k to $1.1k behind
  the expert. Perfect knowledge of the crop under the hill is worth nothing to the kill date, so no
  estimate a dig sharpens can be.
- **Sell or store from dug-corrected estimates.** With storage charged from the dig the expert now sells
  about 2,300 cwt a season at the dig and holds the rest; when everything is in it sells what the
  cellar cannot take, about 1,000 cwt a season. Deciding that overflow at its dig instead, which needs
  a forecast of the fields still to come, would have fetched 0.999 times the price it got: -$15 a
  season.
- **Which field to dig first before a frost.** In 3,225 expert fields no field was lost to frost or
  freeze-up, and frost culled 1 cwt a field. There is nothing for the dig order to save.
- **Tuber blight.** Everything tuber blight cost the expert was 3.7 cwt a field culled at the picking
  table and 2.6 cwt carried hidden into the pile, under $100 a field, so killing early on a dig's
  evidence has little to save; digging blighted fields every 5 to 14 days lost $2k to $5k in the
  second pass.

Each bound is below what 1,032 campaigns can tell from zero, so gate 2 stays failed for test digs. Two
things in the game hold the dig's value down: the kill date matters little once the vines are going
down, since more weight nearly always pays even with oversize at 0.8 of the No. 1 price; and a dug lot
sold before the season closes pays no storage charge and does not shrink, however long ago it was dug
(both are booked only on what is still held at the close), so the overflow is always sold with the whole
crop in sight.

