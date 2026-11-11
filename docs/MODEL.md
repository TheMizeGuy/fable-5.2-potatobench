# The County: the model and where each rule comes from

The simulation is in `src/sim`. This file lists every rule it applies, with one
of three tags:

- **Sourced**: the rule or number is taken from a published source. The source is
  named here; the URL and the passage read are in the research report cited.
- **Derived**: arithmetic on sourced numbers.
- **Invented**: a number or rule chosen for the game. The reason is given. These
  are the places to distrust first.

Research reports are in `docs/research/`. Constants are in `src/sim/params.ts`
and `src/sim/varieties.ts`.

## 1. Weather

| Rule | Tag | Source |
| --- | --- | --- |
| Daily maximum, minimum, precipitation, snow at Caribou, ME, 1973 to 2024 | Sourced | NOAA GHCN-Daily, station USW00014607 (`00-weather-data.md`) |
| Hours at or above 90% relative humidity, noon to noon, and the mean temperature in them | Derived | NOAA ISD-Lite hourly temperature and dew point, Magnus formula (`00-weather-data.md`, rules 4 to 6) |
| Overnight dew points missing from the archive in 1973-79 and 1983-96 are interpolated; each year's dew points are shifted so the rain-time dew-point gap matches a reference | Invented correction | `00-weather-data.md` rules 5 and 6, with the test that justifies each. Uncorrected totals are kept in the dataset's `qa` block. |
| Reference evapotranspiration by Hargreaves-Samani | Sourced | FAO-56 eq. 52, with extraterrestrial radiation from eq. 21 to 25 |
| Solar radiation recovered from the stored evapotranspiration | Derived | FAO-56 eq. 50 (Hargreaves radiation, kRs 0.16) |
| Soil temperature follows air temperature by 20% of the gap per day; the ridge runs 1°C warmer and the bottom land 1°C colder | Invented | Stands in for a soil-temperature record the station does not have. Checked: the 50°F planting rule falls in mid May in the median year, matching NASS usual planting dates (`07-practice-place.md`). The offsets by position are invented. |
| A field is colder than the station on still, clear nights: 1.6°C in the bottom land, 0.5°C mid slope, 0.4°C warmer on the ridge | Invented | Cold-air drainage is real and well known; the sizes are chosen. |
| The 5-day forecast is the real weather to come plus an error that grows with lead time. The forecaster calls each day wet or dry and is sometimes wrong in both directions, more often further out | Invented | Error sizes chosen to feel like a public forecast. A test checks that a dry forecast is sometimes followed by rain and a wet one by none. |
| 1996 and 2025 are not playable | Sourced | The hourly archive lacks July 1996 humidity and ends in August 2025. |

## 2. Development and growth

| Rule | Tag | Source |
| --- | --- | --- |
| Thermal time in P-days: cardinal temperatures 7, 21 and 30°C; four-point daily weighting 5, 8, 8, 3 over 24 | Sourced | Sands, Hackett and Nix (1979), as implemented in the Oregon State and PNW models (`01-crop-growth.md`) |
| Emergence after about 130 P-days of soil thermal time, spread 85% to 120% between hills | Derived / invented | Idaho reports 20 to 25 days at 50°F soil (`01-crop-growth.md`). The game's soil warms as fast as the air, so the threshold was raised to bring emergence closer to NASS's dates; it still runs about a week early (`docs/verification/model-vs-record.md`). The spread between hills is invented. |
| Seed pieces rot in soil below 7°C: 1.6% of unemerged hills a day, 4% below 4.5°C, doubled when the ground is wet | Invented magnitudes | The trigger is sourced (extension planting guidance); no published hazard rate was found |
| Tuber initiation 120 to 175 P-days after emergence by variety; senescence from 450 (early) to 850 (Russet Burbank) | Sourced / invented | Manitoba P-day tables give three cultivars; the rest are placed within their maturity class (`01`, `03-varieties.md`) |
| Varieties differ in daily growth (1.0 to 1.25 of the base rate, fastest for the earlies) and in how much dry soil slows them | Sourced ranking, invented sizes | Yield and drought rankings from `03-varieties.md`; the early varieties' rate was raised so they finish a worthwhile crop by August |
| Canopy grows logistically, about 40 days from emergence to closed rows in midsummer | Derived | Matches full cover at about 650°C·d after emergence (LINTUL-POTATO-DSS) |
| Daily tuber growth = 1.2 g per hill per MJ/m² of sunlight × green cover × temperature efficiency × water stress × partitioning | Derived | Equivalent to about 1.05 g dry matter per MJ of global radiation at 20% dry matter, inside the published 1.0 to 1.5; set so reference practice averages about 300 cwt/acre |
| Partitioning to tubers rises from 0 at initiation to full over 120 P-days | Invented | Simplifies a harvest index that rises through the season |
| Frost blackens leaf from -1°C at the field and kills it by -3°C | Sourced / invented | Foliage is killed at -2.2°C (28°F) (`01`); the partial-damage ramp is invented |
| Tubers per hill by variety, cut by dry soil at initiation, 15% fewer on a virus-infected plant | Invented magnitudes | Direction is sourced (`01`: early water and tuber number) |
| Never hilled by row closure: 10% less growth (weeds) | Invented | Hilling is also the cultivation pass |

## 3. Water

| Rule | Tag | Source |
| --- | --- | --- |
| One-bucket root-zone balance; crop coefficient from 0.4 (bare) to 1.15 (full canopy); depletion fraction 0.35; stress factor Ks = (TAW - Dr) / ((1 - p) TAW) | Sourced | FAO-56 chapters 6 and 8 |
| Available water 93 mm in the bottom land, 84 mid slope, 72 on the ridge | Sourced / invented | SSURGO Caribou gravelly loam gives about 93 mm over 18 in; the slope positions are invented |
| Irrigation applies 25 mm; without a reel it takes the farmer a full day and $300 a field, with one half a day and $200; the reel costs $30,000 | Sourced / invented | An inch per set is standard practice. The costs are invented and were set by the balance tournament so that irrigation pays only in dry eras, as in Aroostook, where most potatoes are rain-fed (`07`). |
| Growth falls to 30% of normal, not zero, when the root zone is empty | Invented | Brings the model's irrigation response (+15%) to the UMaine trials' (+17%) |
| The ground is too wet to work above 11 mm of surface wetness, which drains at 28% (bottom) to 55% (ridge) a day | Invented | Tuned toward NASS's average of 5.3 workable days a week (`07`) |
| Standing water cuts growth by 40% that day and builds rot | Invented magnitudes | Direction sourced (`01`, `04`) |

## 4. Late blight

| Rule | Tag | Source |
| --- | --- | --- |
| Daily severity value 0 to 4 from wet hours and their temperature | Sourced | Wallin's table as used in Blitecast (Krause, Massie and Hyre 1975) (`02-late-blight.md`); tested cell by cell |
| The game counts total wet hours in the noon-to-noon day; the published table uses the longest continuous run | Departure | The station data is reduced to totals. Totals are equal or higher than the longest run, so the game's blight watch can come earlier than the true Blitecast would. |
| Blight watch at 18 accumulated severity values | Sourced | Blitecast first-spray threshold |
| Severity values count from May 25 for the whole farm | Departure | Maine's NoBlight counts from 50% emergence of each field; one date keeps one watch for the farm |
| Outside spores can arrive only after the watch threshold, more often as the season's severity total grows; blight also jumps to random hills in the same field and to other fields | Invented | Stands in for regional inoculum and wind-borne spread, and keeps a focus from being contained by pulling plants alone |
| A walk finds 60% of the hills with visible lesions; latent infections cannot be seen | Invented | Lesions low in a closed canopy are easy to miss |
| Blight shows from the road once 8% of a field's leaf is gone; from then, hills with a fifth of their leaf blighted are known without a walk | Invented | By then it can be seen from the headland |
| Latent period 4 days, 6 when cool | Sourced | About 4 days at 13 to 23°C, 7 below 10°C (`02`) |
| Lesions grow on days with a severity value, and slowly (0.6% a day) on other days at 80% humidity or more; they spread to hills up to two away only on severity days; hot dry days (29°C and few wet hours) stop both | Sourced direction, invented rates | Rates set so an unsprayed average variety goes from 1% to 90% in roughly three to four weeks of favourable weather, the range MacKenzie (1981) and Fry (1978) report |
| Variety foliage susceptibility 0.48 (Kennebec) to 1.38 (Superior) | Sourced | Penn State 2018 trial, area under the disease curve relative to Atlantic (`03`) |
| Protectant stops up to 95% of new infections, slows lesion growth by up to 30%, wears off 10% a day and faster while the canopy is adding leaf, washes off as exp(-0.56 × rain in cm), and does not cure | Sourced / invented | Residue model in `02`; dilution by new leaf and the slowing of lesions are invented. The game uses a second-order rational form of the exponential so the core needs no `exp` |
| The bottom fields count two extra wet hours, the ridge one fewer; watering adds three that day | Invented | Low ground and wet canopies stay humid longer |
| Tuber blight: rain washes spores from a blighted canopy to the tubers, less under a full hill; digging under live blighted vines adds more; half of blighted tubers are caught at the picking table and the rest go into the pile | Sourced direction, invented rates | Soil cover and the 14 to 21 day wait after vine kill are sourced (`02`) |
| Blight comes back from the cellar in saved seed | Sourced direction | Seed-to-shoot transmission is documented (`02`); the rate is invented |

## 5. Dig day

| Rule | Tag | Source |
| --- | --- | --- |
| US No. 1 needs 1-7/8 in (about 70 g for a round tuber), No. 2 and B size 1-1/2 in (36 g) | Sourced | USDA potato grade standards, 2011 (`04-harvest-storage.md`) |
| Greening: about 1% under a full hill, rising with tuber size and thin hills, more for varieties that set high | Sourced anchors | About 2% hilled against 10% unhilled (`04`) |
| Common scab from dry soil in the five weeks after tuber initiation, by variety | Sourced direction and variety ranking | AHDB moisture window; Penn State variety indices; the share per dry day is invented |
| Hollow heart by variety on large tubers, worse after cold soil in the first four weeks of tuber growth or a dry spell broken by rain | Sourced | Maine trial incidence for Atlantic, Russet Burbank and Caribou Russet; trigger from `04` |
| Knobs and growth cracks after a dry spell of five days or more is broken | Sourced direction | `04` |
| Skins set 14 days after the vines die; unset skins cost grade and keeping quality | Sourced | `04` |
| A test dig lifts one plant: it stops growing and its tubers go in with the crop | Design choice | One plant in a field is no loss worth modelling; the dig is there for what it shows |
| The yield estimate is what a grower would expect from the leaf seen, the weather and the calendar, times a personal error fixed at planting (within 30% either way); each test dig pulls it toward the truth and narrows the range | Invented | The estimate reads no hidden tuber weight except through a test dig; a test holds it to that |
| Bruising when the soil is below 8°C at digging | Sourced | Pulp below 45 to 50°F (`04`) |
| Tubers freeze in the hill at an air minimum of -4.4°C, less under a full hill or snow | Invented threshold | `07` proposes 24°F; tuber tissue freezes near 30°F |
| The ground freezes for good when soil temperature falls to 0.5°C after October 1, or on November 10 | Invented | Ends the season |

## 6. Cellar and market

| Rule | Tag | Source |
| --- | --- | --- |
| Price through the year from mid August: September 0.887, October 0.878, November 0.922, rising to 1.105 in April | Sourced | Maine monthly prices over the season average, 1979 to 2013, USDA NASS (`06-economics-records.md`) |
| A new-crop premium before that: 1.4 on July 1 falling to 1.05 by mid August | Invented | Anchored on the US fresh new-crop premium of 1.32 to 1.44 (`06`); Maine's own August average is only 0.966. It is what makes an early variety worth growing. |
| Each year's price level is that year's real Maine season-average price over its nine-year trend, limited to 0.55 to 1.6 | Derived | USDA NASS annual price, `data/records/maine_potato_nass.csv` |
| Variety base prices (13 to 16.20 dollars per cwt of No. 1) | Invented | Ordered by market class; fresh sells above the all-potato price and processing below it (`06`). Yukon Gold, Russet Burbank and Atlantic were last set by the balance tournament so no single variety wins most years (`docs/balance/README.md`) |
| The chipping variety (Atlantic) sells on the open market only at a processing price: 0.8 of its price, moved a quarter as far as the market by the year's price level. Against a chip contract it fetches the contract price (section 9) | Invented | A chipping potato has few buyers off contract, so it is worth growing only against one |
| Money is in constant present-day dollars | Design choice | Fifty years of nominal prices would make eras incomparable |
| Shrink 1.2% a month, 0.7% with ventilation; the cellar costs $0.30 per cwt per month. Both run from the day of the dig, and are settled when a crop is sold or when the season closes | Sourced / invented | About 6% shrink over eight months (`04`, `06`). The storage charge is invented, of the order of the recorded $0.81 per cwt for six months in 1980 dollars (`06`). |
| Hidden rot roughly doubles each month and breaks a pile down past 22% | Invented | Anchored to "5% late blight is the limit of storable" (`04`) |
| Dormancy by variety, 60 days (Norland) to 160 (Russet Burbank), counted from the dig, plus 40 days for a cellar held at 39°F and 25 more with ventilation | Sourced / invented | Russet Burbank from Idaho data at 45°F; others scaled or placed by class (`03`). Idaho reports about 20 days gained per 3°F cooler; the ventilation gain is invented. |
| Culls bring one dollar a hundredweight | Sourced | `06` |
| Grade prices relative to US No. 1: B size 0.55, No. 2 0.45, large tubers 1.15 for the two russets and 0.8 for other varieties | Invented | Direction from market reports: count-carton russets carry a premium, oversize round whites a discount |
| Thin-skinned tubers sell at the No. 1 price as new potatoes within six days of the dig and up to September 5; otherwise at the No. 2 price | Invented | The new-potato trade is real; the dates are chosen |
| A sprouted lot sells 15% lower and shrinks 3% more a month; unset skins add up to 3% shrink in the first month and seed 1.2% rot | Invented | Direction from `04` |
| The home potato house holds 3,600 cwt, 6,400 with ventilation; what does not fit in all the farm's potato houses together is sold at the close of the season | Invented | About the crop of two and a half fields, so storing is a choice between lots. The other houses are in section 9 |
| The year's price level becomes known gradually between August 1 and November 1; winter prices then wander by about 3.5% a month, within 15% | Invented | The season-average price is not known until the crop is in |

## 7. Money and the bank

All invented. Money is in constant present-day dollars. The values marked
"tournament" were set by the balance runs recorded in `docs/balance/README.md`.

| Rule | Tag | Source |
| --- | --- | --- |
| The farm starts with $18,000 | Invented | |
| A potato field costs $8,000 a season to grow, plus $1,700 for 100 cwt of certified seed; a rest year in oats and clover costs $250 and brings $900 | Invented, tournament | The field cost was scanned against how often reference practice keeps the farm. Of the order of Maine's recorded $2,300 to $3,000 an acre in 2006-08 (`06`) at a reduced scale. |
| Jobs cost: plant $150, hill $60, spray $110, vine kill $120, dig $500 a field; water $300, or $200 with the reel; scouting, roguing and test digs cost only time | Invented | |
| Equipment: boom sprayer $6,000, two-row harvester $12,000, cellar ventilation $7,000, irrigation reel $30,000, second tractor $16,000, second potato house $18,000 | Invented, tournament for the first four | The reel's price was set so irrigation pays only in dry eras. The last two are starting points for the balance pass |
| Land beyond the home six, by the year or to buy: the intervale lots $1,300 or $15,000, the ridge lots $900 or $10,000, each Dufour field $1,100 or $12,500 | Invented | `src/sim/farm.ts`. Starting points for the balance pass |
| Wages: a field hand $450 a month, the tractor operator $800 | Invented | Starting points for the balance pass |
| The spring plan's cost, on the operating loan, is each held field's growing cost, the year's rent, and the first month of every hired wage. Land and equipment are bought from cash, never on the loan | Invented | |
| Each year end the note takes $10,000 and the household $10,500 | Invented, tournament | The household draw was set so that following the coach keeps the farm about seven times in ten |
| The bank lends up to $75,000 for the spring, repaid from the crop; debt carried past the year end pays 10% interest; below -$20,000 at year end the bank calls the note | Invented | ERS records farm loan rates near 12.7% in 1980 (`06`) |
| The ledger books, as parts of the year's revenue and costs: rest income, storage, wages, rent, land bought, money from contracts, and contract penalties | Design choice | Every dollar that moves goes through revenue or costs, so the year closes to the cent |
| Net worth, for comparing bots, counts equipment at half its price and land the farm bought at its price | Invented | Land does not wear out; buying a field leaves net worth where it was |

## 8. Between years

| Rule | Tag | Source |
| --- | --- | --- |
| Continuous potato yields 7% less in total, with more scab and black scurf, against a two-year rotation | Sourced | Larkin 2022, USDA-ARS Presque Isle long-term trials (`05-pests-soil-seed.md`) |
| The odds that a plant carries Verticillium wilt multiply by 2.3 with each potato crop and by 0.75 with each rest year; an infected plant dies at two thirds of its normal season | Invented rates | Early-dying loss reaching 45% at full incidence is from Powelson (1980); the build-up and decay rates are invented |
| Saved seed: virus next year = 0.85 × this year + 0.22 × variety susceptibility × the healthy share; an infected hill yields 30% less | Sourced | Spread without aphid control and PVY yield loss (`05`) |
| Certified seed starts at 1% virus | Sourced | Maine certification tolerance is 5%; clean lots run lower |
| The game lets a five-acre field be planted with saved seed | Departure | Maine now requires certified seed above one acre (`05`). The game keeps the older practice because the decision is worth having. |

## 9. The bigger farm: land, crews, distance, contracts

All game rules, chosen for the decisions they make, not sourced. Constants are in
`src/sim/params.ts` (from `TRAVEL_DAYS_PER_UNIT` on) and the land in `src/sim/farm.ts`.

| Rule | Tag | Source |
| --- | --- | --- |
| Fourteen fields in four blocks: the home six, owned from the start; two intervale lots across the brook; two ridge lots to the north; four Dufour fields up the road with their own yard and potato house. Each field's slope position comes from its parcel | Invented | `docs/DIRECTION.md`, "The bigger farm" |
| Land beyond the home six is rented for a year or bought outright. A rented field stays rented into the next spring until it is released; the rent is paid when the season begins. Bought land is never sold back | Invented | So the player need not re-rent each spring |
| Land the farm does not hold this year has no crop, takes no orders, earns no rest income, and keeps its soil record unchanged | Invented | Its owner's use of it is outside the game |
| New land starts rested (soil 1, no potato years) with 2 to 8% of plants carrying Verticillium, a little more on the old Dufour potato ground | Invented | Ground long in hay |
| Blight jumps between the home six as before (full rate within two places on the list, half otherwise); between any other pair at the full rate within 30 ground units by road, half beyond | Invented | Keeps the home farm's spread as it was |
| Crews: the farmer does every job; a field hand only the walking jobs (scouting, pulling blighted plants, test digs); the tractor operator only the machine jobs (planting, hilling, spraying, watering, vine kill, digging), and only once the farm has a second tractor. At most four hands and one operator | Invented | |
| Wages are paid for 30 days at a time from the day a unit is hired; a unit hired in spring is paid its first month with the plan. A hired unit stays on into the next year until let go; no wages run outside the season | Invented | |
| Each crew has one day of work a day. Travel costs it 0.0016 of a day per ground unit by the farm roads (east-west plus north-south distance): about 0.03 of a day between neighbouring home fields, 0.11 from the home yard to the Dufour yard. A drive that does not fit in the day carries into the next. Crews start the season and spend the winter in the home yard, and otherwise end each day where they worked | Invented | |
| The day's order: first every crew carries on (finishes a drive, then works the order it holds if it is still wanted, still allowed to it and the weather allows; otherwise lets it go, keeping the work done). Then the crew with the most of its day left takes the next order, hands before the operator before the farmer on a tie: of the first three orders on the list it can do, may take (pins), that no other crew holds and the weather allows, the one with the least travel plus 0.07 of a day for each place down the list. Two crews never work the same order | Invented | No two home fields are 0.07 of a day apart, so on the home farm one farmer works the list in order, as before; across blocks a crew prefers the work where it is |
| A dig takes longer for the haul to the nearest potato house the farm has: by 1.4% for each ground unit beyond 51, the haul the home six already need. The longest haul, Spruce Lot to the home yard, adds 41%; the Dufour fields haul to the Dufour house | Invented | The base dig time already includes the home farm's own haul, so the home six dig as before |
| The farm's potato houses: the home house; a second one at home once built, holding as much as the first; the Dufour house, 2,400 cwt, while any Dufour field is held. They are one store for the overflow rule, and ventilation sets the shrink and rot of all of it | Invented | |
| Each spring three of four buyers (a chip plant, a fry plant, a packer, a seed house) offer contracts, from the campaign seed and the year: a variety out that year (the chip plant always the chipping variety once it is out), 1,000 to 2,000 cwt of US No. 1 and large tubers in steps of 50, at the variety's average-year price times 0.92 to 1.02 for delivery off the field by the close of the season, or 1.02 to 1.12 from storage by the end of February. Offers lapse when the season begins | Invented | Quantities are about the No. 1 crop of one or two home fields. The price does not depend on the year's real price level, which no one knows in spring |
| A delivery takes US No. 1 and large tubers of the contract's variety from a lot already dug, up to what the contract still needs, at the contract price; storage since the dig is settled first, as for a sale. What is undelivered at the due date (the close of the season, or when the cellar reaches March) costs 30% of its contract value | Invented | |
| Reference practice (the coach and the reference bot) tends every field the farm holds but says nothing about land, hiring or contracts, and at any time asks for no more of one job than six fields per crew able to do it, counting what is already on the list | Invented | Six is the home farm, so one farmer on the home six is advised exactly as before |

## 10. Things the model leaves out

Colorado potato beetle, early blight, fertility, weeds as a separate system,
machinery failure, hail, and everything else on the cut list in `docs/DESIGN.md`. The record of what the model gets right and
wrong against USDA's yields and the documented blight years is in
`docs/verification/model-vs-record.md`; the balance gates are in
`docs/balance/latest.md`.
