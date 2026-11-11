# Balance tooling

`npm run balance` plays every bot below over every start year in `startYears(world)` with 24 seeds,
five-season campaigns, and judges verification gates 1 to 4 of `docs/DESIGN.md`. Results are in
`latest.md` (tables) and `latest.json` (the same, plus each bot's median net worth by start year). The
whole run takes about 50 seconds on sixteen worker threads (`SEEDS` and `WORKERS` override).

The tournament used six seeds until the third pass, when a gate passed on seeds 1 to 6 and failed to
repeat on any other six (see the tuning log below). At 24 seeds the gate verdicts no longer turn on the
seed draw.

The code is in `tools/balance/`: `bots.ts` (the bots and the campaign driver), `run.ts` (the
tournament and the gate verdicts), `stats.ts`, `world.ts`.

The gates are judged against these targets:

1. Expert > reference > naive on kept farms, and on net worth with each 95% interval above zero; the
   expert keeps at least 90% of farms, the reference 65% to 80%, the naive bot at most 10%.
2. Every ablation of the expert loses net worth, with the 95% interval above zero.
3. No single-variety expert wins more than half of the start years or of the single seasons it can
   play, at least four varieties win some years (over campaigns and over seasons), and the
   fixed-calendar expert loses to the expert in most years.
4. The naive bot loses more than half of its farms and the expert keeps more than half.

## Fair play

A bot reads the game only as a player can: `fieldInfo`, `fieldActions`, `today`, `forecast`,
`jobWaits` and `advise`; the market quote (`basePrice`, `gradePrice`, `lotValue`, `newPotatoWindow`,
which use only a lot's public grades and today's price); the public campaign fields; the published
rules in `src/sim/params.ts` and `src/sim/varieties.ts` (storage charge, shrink, dormancy in a cool
cellar, the soil warming a degree earlier on the ridge and later on the bottom land, rotation, prices);
and the events each command and each day report (planting, tuber set, test-dig tubers, scouting finds
and so on). It never reads a field's hill arrays or true blight, the estimate's bias, a lot's rot, seed
blight or virus, future weather, the year's price level or the records. `tests/bots.test.ts` checks
the source of `bots.ts` for those names and checks that the check catches them.

## The bots

| Bot | What it does |
|---|---|
| naive | Plants all six fields to certified Katahdin on May 20, does nothing else, digs on September 20 whatever state the vines are in, and sells each lot as soon as it is dug. |
| reference | Follows `advise()` as given with the default plans, no equipment, keeps every lot in the cellar and sells in March (month 4). Without an irrigation reel the advice waters only a wilting field, so the reference is in effect a dryland grower, as most of Aroostook is. |
| expert | The best fair play found, described below. |
| no-hill, no-scout (scouting and roguing), no-spray, no-water, no-sample (test digs), no-kill (the vines die on their own or are dug green from September 15), no-store (sells at the dig), no-rotation (potatoes on all six fields every year), saved-seed (holds back seed every year and plants saved seed wherever there is stock), no-equipment | The expert with one verb or decision taken away. Without test digs the expert times the vine kill from the yield estimate and the variety's usual tuber set instead. |
| only-*variety* | The expert with every potato field in one variety. It plays only the start years in which its variety had been released. Dark Red Norland goes to the early market, as the expert would grow it. |
| calendar | The expert held to the same dates every year: planting May 12-18 by slope, hilling 30 and 44 days after planting, weekly spraying from July 1, one watering on July 25, a test dig on August 5, vine kill on August 28 and digging from September 12. |

### The expert

- **Spring.** Buys cellar ventilation when cash allows and two or more seasons remain, and from 2015
  on also the irrigation reel when three or more remain. Plans each field by enumerating every
  potato-or-rest sequence for the seasons left, valuing a potato year by the field's visible wilt and
  soil (`fieldInfo`), the published rotation rules (`SOIL_AFTER_POTATO`, `VERT_GROW`, `VERT_REST`) and
  the published field and seed costs. Grows Katahdin on the two ridge fields and Yukon Gold on the four
  lower ones (Kennebec until Gold's release in 1980). From Caribou Russet's release in 2015 it grows
  Caribou on the four upper fields and Atlantic on the two bottom fields: the contract crop sells at the
  dig for the price it will fetch all winter, which leaves the cellar to the russet. Plants
  first-generation saved seed of the low-virus varieties (Katahdin, Kennebec) when a clean lot grown
  from certified seed was held back; certified seed otherwise.
- **Planting.** From May 3 when the field's own soil reaches 8 C (the station reading, a degree more on
  the ridge and a degree less on the bottom land) and the field is workable, ridge first, holding off
  when heavy rain is forecast into soil under 11 C. Seed sitting in soil under 7 C rots.
- **Through the season.** Hills at 6% and 38% leaf cover. Scouts every 4 days once the blight watch is
  on (every 5 once blight is found) and pulls blighted hills while a field has two or fewer; past
  that it sprays. Otherwise sprays only in a season of 30 or more severity values, ahead of a bad
  blight day. With the reel it waters at the UMaine pivot triggers (below 65% of available water for
  35 days after tuber set, 60% after); without it, when a watering takes the whole day, below 75%
  and 65%. Either way it waits when the next two days' forecast gives rain a 60% chance and 12 mm or
  more; the forecast is sometimes wrong both ways.
- **Test digs and vine kill.** Lifts one hill three days before the vines are due to be killed. Kills
  on blight of 15% or more or tuber blight in the dig; otherwise 15 days after the vines start going
  down, or from September 10 at four days a field, bottom land first. It holds a due kill for up to
  14 days while the crop's value still grows by 0.4% a day and no frost is forecast; the value comes
  from the growth of the yield estimate and the tuber size the test dig shows (or, without a dig, the
  yield estimate spread over the variety's usual set) priced by grade, B size and oversize included.
  Kills ahead of a forecast frost from September 5.
- **Early market.** Dark Red Norland, when grown, is dug green once its value at the falling
  early-market price stops rising (by August 26 at the latest) and sold off the field.
- **Digging and selling.** Digs once the skins are set, before a forecast frost late in September, and
  in any case from October 8, keeping the job list in order of urgency every day. Reads the year's
  price level off the quote, compares the price today with each lot's best month in the cellar, and
  sells at the dig when the cellar cannot beat it. A lot's cellar value counts the storage charge and
  shrink from the day of the dig, sprouting once the lot has been out of the ground longer than its
  dormancy plus the cool cellar's 40 days (65 with ventilation), rot started by the blighted tubers
  seen on the picking table, and for a contract variety one price all winter. When everything is in it
  sells what the cellar cannot hold, the poorest keepers first. In the cellar each lot is sold in its
  best month.

## How the expert's thresholds were set

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

## Economy tuning log

Each pass rebuilt the expert first, then tuned the economy within the listed parameters, each round a
parameter change and a rerun.

### Second pass (after `c639003`)

At most ten rounds. Price moves for gate 3 were sized beforehand from the single-variety runs of the
previous round (net worth moved by revenue times the price change), which predicted round 1's gate 3
wins exactly. Six seeds.

| Round | Change | Gate 1 (kept: expert / reference / naive) | Gate 2 | Gate 3 | Gate 4 |
|---|---|---|---|---|---|
| 0 | None: the rebuilt expert on the commit's economy | FAIL: 100% / 60% / 0% | FAIL: test digs -$1k (-$2k to $1k) | FAIL: Yukon Gold wins 26 of 36 campaigns and 27 of 44 seasons | PASS |
| 1 | `LIVING` 15,000 to 11,500; large tubers of the non-russets 0.8 to 0.6 of No. 1; Yukon Gold $16.50 to $16.20, Russet Burbank $13.50 to $14.00, Atlantic $12.50 to $13.75 | FAIL: 100% / 80% (just over the target) / 0% | FAIL: test digs -$1k (-$2k to $1k); spraying $2k ($0k to $4k) | PASS: campaigns Burbank 13/43, Katahdin 11/43, Gold 11/36; seasons Burbank 18/51, Atlantic 15/48, Gold 11/44 | PASS |
| 2 | Large-tuber factor back to 0.8 (it gave test digs nothing); `LIVING` 11,500 to 13,000, read off a sweep of the household draw for the reference (15,000: 60% kept, 14,500: 61%, 14,000: 66%, 13,500: 70%, 13,000: 74%, 12,500: 77%, 11,500: 84%); the expert retuned | PASS: 100% / 74% / 0% | FAIL: test digs -$1k (-$2k to $1k) | PASS | PASS |

### Third pass (after `c5faac7`)

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

## What the gates show

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

### Why test digs still do not pay

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
