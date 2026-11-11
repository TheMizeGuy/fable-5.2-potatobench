# Balance tooling

`npm run balance` plays every bot below over every start year in `startYears(world)` with six seeds,
five-season campaigns, and judges verification gates 1 to 4 of `docs/DESIGN.md`. Results are in
`latest.md` (tables) and `latest.json` (the same, plus each bot's median net worth by start year). The
whole run takes about 17 seconds on eight worker threads.

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
which use only a lot's public grades and today's price); the public campaign fields; and the events
each command and each day report (planting, tuber set, test-dig tubers, scouting finds and so on). It
never reads a field's hill arrays or true blight, a lot's rot, seed blight or virus, future weather,
the year's price level or the records. `tests/bots.test.ts` checks the source of `bots.ts` for those
names and checks that the check catches them.

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
  on also the irrigation reel when three or more remain: in the trials the reel paid only in the
  2015-2024 seasons and cost slightly more than it saved before that. Plans each field by enumerating
  every potato-or-rest sequence for the seasons left, valuing a potato year by the field's visible
  wilt and soil (`fieldInfo`), the published rotation rules (`SOIL_AFTER_POTATO`, `VERT_GROW`,
  `VERT_REST`) and the published field and seed costs. Grows Katahdin on the two ridge fields and
  Yukon Gold on the four lower ones (Kennebec until Gold's release in 1980), and Caribou Russet on
  every field from its release in 2015. Plants first-generation saved seed of the low-virus varieties
  (Katahdin, Kennebec) when a clean lot grown from certified seed was held back; certified seed
  otherwise.
- **Planting.** From May 3 when the soil reaches 7 C and the field is workable, ridge first, holding
  off when heavy rain is forecast into cold soil.
- **Through the season.** Hills at 6% and 38% leaf cover. Scouts every 4 days once the blight watch is
  on (every 5 once blight is found) and pulls blighted hills while a field has two or fewer; past
  that it sprays. Otherwise sprays only in a season of 30 or more severity values, ahead of a bad
  blight day. With the reel it waters at the UMaine pivot triggers (below 65% of available water for
  35 days after tuber set, 60% after); without it, when a watering takes the whole day, below 75%
  and 65%.
- **Test digs and vine kill.** Lifts one hill three days before the vines are due to be killed. Kills
  on blight of 15% or more or tuber blight in the dig; otherwise 15 days after the vines start going
  down, or from September 10 at four days a field, bottom land first. It holds a due kill for up to
  14 days while the crop's value still grows by 0.4% a day and no frost is forecast; the value comes
  from the tuber size the test dig shows (or, without a dig, the yield estimate spread over the
  variety's usual set) priced by grade, B size and oversize included. Kills ahead of a forecast frost
  from September 5.
- **Early market.** Dark Red Norland, when grown, is dug green once its value at the falling
  early-market price stops rising (by August 26 at the latest) and sold off the field.
- **Digging and selling.** Digs once the skins are set, before a forecast frost late in September, and
  in any case from October 8, keeping the job list in order of urgency every day. Reads the year's
  price level off the quote, compares the price today with each lot's best month in the cellar
  (shrink, sprouting at the variety's dormancy, rot started by the blighted tubers seen on the picking
  table, and the cellar charge), sells at the dig when the cellar cannot beat it, and sells the
  poorest keepers when the cellar would overflow. In the cellar each lot is sold in its best month.

## How the expert's thresholds were set

Trial runs over all 43 start years, six seeds, one change at a time from the final expert, on the
final economy (mean net worth after five seasons; every setting kept 100% of farms):

| Change from the final expert | Mean net worth | Difference (95% interval) |
|---|---|---|
| final expert | $116.2k | |
| sprays from 40 severity values instead of 30 | $114.7k | -$1.6k (-$3.0k to -$0.1k) |
| sprays from 20 severity values (12 seeds: +$0.6k, -$0.7k to $2.2k) | $117.5k | +$1.3k (-$0.3k to $3.2k) |
| sprays once blight is on the farm, ahead of any blight day | $113.6k | -$2.6k (-$3.9k to -$1.1k) |
| sprays on the NoBlight interval from the blight watch | $95.1k | -$21.1k (-$23.4k to -$18.4k) |
| pulls up to 12 blighted hills before spraying | $109.2k | -$7.0k (-$8.9k to -$5.2k) |
| never pulls, sprays on any find | $104.5k | -$11.7k (-$14.6k to -$9.2k) |
| scouts every 5 days, every 3 once blight is found | $115.4k | -$0.9k (-$2.4k to $0.7k) |
| test dig 40 days after tuber set instead of just before the kill | $114.2k | -$2.0k (-$3.5k to -$0.6k) |
| three test digs instead of one | $114.8k | -$1.4k (-$2.6k to -$0.3k) |
| no holding of the kill for a crop still sizing | $116.0k | -$0.3k (-$1.3k to $0.8k) |
| also kills early once value grows under 0.5% a day | $116.4k | +$0.2k (-$0.6k to $0.9k) |
| buys the reel in every era | $114.0k | -$2.2k (-$3.4k to -$1.0k) |
| never buys the reel | $115.5k | -$0.7k (-$1.6k to $0.0k) |
| no cellar ventilation | $100.3k | -$16.0k (-$17.7k to -$14.1k) |
| also buys the boom sprayer | $115.1k | -$1.1k (-$2.2k to $0.2k) |
| also buys the two-row harvester | $111.2k | -$5.1k (-$5.5k to -$4.6k) |
| waters by hand at the pivot triggers (65%, 60%) | $115.6k | -$0.6k (-$2.1k to $0.8k) |
| plants at 8 C | $114.4k | -$1.8k (-$2.9k to -$0.6k) |
| Kennebec on every field until 2015 (the previous expert's plan) | $86.4k | -$29.8k (-$35.5k to -$23.4k) |
| Yukon Gold on every field until 2015 | $113.9k | -$2.3k (-$4.3k to $0.0k) |
| Katahdin on every field until 2015 | $110.2k | -$6.0k (-$8.1k to -$4.1k) |
| Russet Burbank on one ridge field | $115.9k | -$0.3k (-$1.5k to $1.0k) |
| Atlantic on the two bottom fields | $110.1k | -$6.1k (-$9.1k to -$3.7k) |
| one field of Norland for the early market | $107.4k | -$8.8k (-$10.9k to -$7.1k) |
| one field of Superior for the early market | $107.2k | -$9.0k (-$11.2k to -$6.7k) |
| Yukon Gold dug green for the early market | $102.4k | -$13.8k (-$17.4k to -$9.7k) |
| rotation valued at $20,000 a healthy field instead of $25,000 | $111.6k | -$4.6k (-$7.8k to -$2.0k) |
| rotation valued at $30,000 a healthy field | $110.8k | -$5.4k (-$7.3k to -$3.6k) |

For the single-variety bots, the early market raised all-Norland campaigns by $4.6k (-$0.6k to $8.9k)
and lowered all-Superior campaigns by $7.2k, so only Norland goes to it.

## Economy tuning log

After the retune of the simulation (`c639003`) the expert was rebuilt first, then the economy was
tuned within the listed parameters, each round a parameter change and a rerun, at most ten. Price
moves for gate 3 were sized beforehand from the single-variety runs of the previous round (net worth
moved by revenue times the price change), which predicted round 1's gate 3 wins exactly.

| Round | Change | Gate 1 (kept: expert / reference / naive) | Gate 2 | Gate 3 | Gate 4 |
|---|---|---|---|---|---|
| 0 | None: the rebuilt expert on the commit's economy | FAIL: 100% / 60% / 0% | FAIL: test digs -$1k (-$2k to $1k) | FAIL: Yukon Gold wins 26 of 36 campaigns and 27 of 44 seasons | PASS |
| 1 | `LIVING` 15,000 to 11,500; large tubers of the non-russets 0.8 to 0.6 of No. 1; Yukon Gold $16.50 to $16.20, Russet Burbank $13.50 to $14.00, Atlantic $12.50 to $13.75 | FAIL: 100% / 80% (just over the target) / 0% | FAIL: test digs -$1k (-$2k to $1k); spraying $2k ($0k to $4k) | PASS: campaigns Burbank 13/43, Katahdin 11/43, Gold 11/36; seasons Burbank 18/51, Atlantic 15/48, Gold 11/44 | PASS |
| 2 | Large-tuber factor back to 0.8 (it gave test digs nothing, below); `LIVING` 11,500 to 13,000, read off a sweep of the household draw for the reference (15,000: 60% kept, 14,500: 61%, 14,000: 66%, 13,500: 70%, 13,000: 74%, 12,500: 77%, 11,500: 84%); the expert retuned (spraying from 30 severity values, scouting every 4 days, hand watering at 75% and 65%, planting at 7 C, the reel from 2015) | PASS: 100% / 74% / 0% | FAIL: test digs -$1k (-$2k to $1k) | PASS: campaigns Burbank 16/43, Gold 11/36, Katahdin 7/43; seasons Atlantic 17/48, Gold 15/44, Burbank 14/51 | PASS |

Round 2 is the final economy.

## What the gates show

See `latest.md` for the current numbers. At the time of writing:

- Gate 1 passes: the expert keeps 100% of farms, the reference 74% and the naive bot none; the expert
  leads the reference by $112k ($106k to $119k) and the reference leads the naive bot by $44k ($37k
  to $52k).
- Gate 2 fails for **test digs** only: -$1k (-$2k to $1k). Every other verb earns its place, the
  smallest being spraying at $5k ($2k to $8k) and scouting and roguing at $8k ($5k to $11k). A test
  dig no longer costs the hill, but what it shows changes no decision worth money. The kill date
  matters little once the vines are going down (killing five days later, from September 15 or 20
  days after the vines start down, moved the mean by about -$1k), and as tubers size
  the price of a gram falls by at most 0.8% for each 1% of growth even with oversize at 0.4 of the
  No. 1 price, so more weight always pays. The tuber size the dig reveals is also close to what the
  yield estimate and the variety's published set already give. In round 1, with oversize non-russets
  at 0.6 of the No. 1 price, every kill rule tried (kill once value growth falls under 0.2%, 0.5% or
  0.8% a day; hold the kill while it is over 0.4%; one hill or three; just before the kill or 40 days
  after tuber set) did no better with digs than the same rule on the prior tuber size, from -$5.8k to
  +$0.6k. Digging blighted fields every 5 to 14 days to catch tuber blight lost $2k to $5k, and timing
  the early-market dig from test digs did no better than a fixed date.
- Gate 3 passes: Russet Burbank wins 16 of 43 campaigns, Yukon Gold 11 of 36, Katahdin 7, Atlantic 5,
  Kennebec 2 and Caribou Russet 2 of 6; over single seasons Atlantic wins 17 of 48, Yukon Gold 15 of
  44, Russet Burbank 14 of 51, Caribou Russet 3 of 10, Norland and Superior one each. The fixed
  calendar never beats the expert.
- Gate 4 passes: the naive bot loses every farm and the expert keeps every one.
