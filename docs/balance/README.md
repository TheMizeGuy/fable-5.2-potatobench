# Balance tooling

`npm run balance` plays every bot below over every start year in `startYears(world)` with six seeds,
five-season campaigns, and judges verification gates 1 to 4 of `docs/DESIGN.md`. Results are in
`latest.md` (tables) and `latest.json` (the same, plus each bot's median net worth by start year). The
whole run takes about 15 seconds on eight worker threads.

The code is in `tools/balance/`: `bots.ts` (the bots and the campaign driver), `run.ts` (the
tournament and the gate verdicts), `stats.ts`, `world.ts`.

## Fair play

A bot reads the game only as a player can: `fieldInfo`, `fieldActions`, `today`, `forecast`,
`jobWaits` and `advise`; the market quote (`basePrice`, `lotValue`, `newPotatoWindow`, which use only a
lot's public grades and today's price); the public campaign fields; and the events each command and
each day report (planting, tuber set, test-dig tubers, scouting finds and so on). It never reads a
field's hill arrays or true blight, a lot's rot, seed blight or virus, future weather, the year's price
level or the records. `tests/bots.test.ts` checks the source of `bots.ts` for those names and checks
that the check catches them.

## The bots

| Bot | What it does |
|---|---|
| naive | Plants all six fields to certified Katahdin on May 20, does nothing else, digs on September 20 whatever state the vines are in, and sells each lot as soon as it is dug. |
| reference | Follows `advise()` as given with the default plans, no equipment, keeps every lot in the cellar and sells in March (month 4). |
| expert | The best fair play found, described below. |
| no-hill, no-scout (scouting and roguing), no-spray, no-water, no-sample (test digs), no-kill (the vines die on their own or are dug green from September 15), no-store (sells at the dig), no-rotation (potatoes on all six fields every year), saved-seed (holds back seed every year and plants saved seed wherever there is stock), no-equipment | The expert with one verb or decision taken away. |
| only-*variety* | The expert with every potato field in one variety. It plays only the start years in which its variety had been released. |
| calendar | The expert held to the same dates every year: planting May 12-18 by slope, hilling 30 and 44 days after planting, weekly spraying from July 1, one watering on July 25, a test dig on August 5, vine kill on August 28 and digging from September 12. |

### The expert

- **Spring.** Buys an irrigation reel, then cellar ventilation, when cash allows and two or more seasons
  remain. Plans each field by enumerating every potato-or-rest sequence for the seasons left, valuing a
  potato year by the field's visible wilt and soil (`fieldInfo`) and the published rotation rules
  (`SOIL_AFTER_POTATO`, `VERT_GROW`, `VERT_REST`). Grows Kennebec until 2014 and Caribou Russet from 2015.
  Plants first-generation saved seed of the low-virus varieties (Katahdin, Kennebec) when a clean lot
  grown from certified seed was held back; certified seed otherwise.
- **Planting.** From May 3 when the soil reaches 8 C and the field is workable, ridge first, holding
  off when heavy rain is forecast into cold soil.
- **Through the season.** Hills at 6% and 38% leaf cover. Scouts every 5 days once the blight watch is
  on (every 3 days once blight is found) and pulls blighted hills while there are 12 or fewer. Sprays
  only in a bad blight year (40 or more severity values) ahead of a forecast blight day, or where there
  are too many blighted hills to pull. Waters at the UMaine pivot triggers: below 65% of available water
  for 35 days after tuber set, below 60% after that. Test-digs one hill only in fields where blight was
  found or the variety runs hollow, and kills early on tuber blight or oversized hollow-prone tubers.
- **Vine kill and digging.** Kills on blight of 15% or more, 15 days after the vines start going down,
  ahead of a forecast frost from September 5, or by September 10 plus four days a field, bottom land
  first. Digs once the skins are set, before a forecast frost late in September, and in any case from
  October 8. Keeps the job list in order of urgency every day.
- **Selling.** Reads the year's price level off the quote, compares the price today with each lot's
  best month in the cellar (shrink, sprouting at the variety's dormancy, and rot started by the blighted
  tubers seen on the picking table), sells at the dig when the cellar cannot beat it, and sells the
  poorest keepers when the cellar would overflow. In the cellar each lot is sold in its best month.

## How the expert's thresholds were set

Trial runs over all 43 start years, three seeds, against the final settings (mean net worth after
five seasons; every setting kept 100% of farms):

| Change from the final expert | Mean net worth |
|---|---|
| final expert | $215.6k |
| sprays on the NoBlight interval from the blight watch | $187.5k |
| sprays whenever a blight day is forecast and the protectant is thin | $202.7k |
| sprays in bad years only, on the NoBlight interval | $212.4k |
| never sprays (the no-spray ablation) | $217.2k |
| test digs in every field | $212.4k |
| no test digs (the no-sample ablation) | $218.1k |
| one field of an early variety (Superior or Norland) | $181.7k |
| Katahdin on the ridge, Caribou Russet then Kennebec mid slope, Kennebec below | $203.0k |
| also buys the two-row harvester and the boom sprayer | $207.8k |
| rotation valued at $19,500 a healthy field instead of $25,000 (rests more) | $192.3k |

Earlier trials set the rest: watering at the extension triggers instead of below 40-50% of available
water was worth about $50k a campaign; planting at 8 C rather than 9.5 C about $15k; killing vines 15
days after they start going down rather than 6 about $10k.

## What the gates show

See `latest.md` for the current numbers. At the time of writing:

- Gates 1 and 4 pass by wide margins.
- Gate 2 fails for **spraying** and **test digs**. No spray policy tried beats never spraying for an
  expert who scouts and pulls blighted hills; roguing a hill removes a whole grid cell (about 900
  plants) and stops a focus outright. A test dig destroys one of the 96 hills (about 1% of the field)
  and what it reveals (tuber size and tuber blight) rarely changes the vine-kill date, which the
  maturity and frost triggers already set.
- Gate 3 fails: Kennebec wins most five-season campaigns before 2015, Caribou Russet every one after,
  and Yukon Gold most single seasons. With irrigation removing Kennebec's scab weakness nothing offsets
  its yield and blight resistance. The early varieties lose in every year.
