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
| Soil temperature follows air temperature by 20% of the gap per day | Invented | Stands in for a soil-temperature record the station does not have. Checked: the 50°F planting rule falls in mid May in the median year, matching NASS usual planting dates (`07-practice-place.md`). |
| A field is colder than the station on still, clear nights: 1.6°C in the bottom land, 0.5°C mid slope, 0.4°C warmer on the ridge | Invented | Cold-air drainage is real and well known; the sizes are chosen. |
| The 5-day forecast is the real weather to come plus an error that grows with lead time | Invented | Error sizes chosen to feel like a public forecast. |
| 1996 and 2025 are not playable | Sourced | The hourly archive lacks July 1996 humidity and ends in August 2025. |

## 2. Development and growth

| Rule | Tag | Source |
| --- | --- | --- |
| Thermal time in P-days: cardinal temperatures 7, 21 and 30°C; four-point daily weighting 5, 8, 8, 3 over 24 | Sourced | Sands, Hackett and Nix (1979), as implemented in the Oregon State and PNW models (`01-crop-growth.md`) |
| Emergence after about 130 P-days of soil thermal time, spread 85% to 120% between hills | Derived / invented | Idaho reports 20 to 25 days at 50°F soil (`01-crop-growth.md`). The game's soil warms as fast as the air, so the threshold was raised to bring emergence closer to NASS's dates; it still runs about a week early (`docs/verification/model-vs-record.md`). The spread between hills is invented. |
| Seed pieces rot in soil below 7°C when it is wet (1.2% of unemerged hills a day, 3% below 4.5°C) | Invented magnitudes | The trigger is sourced (extension planting guidance); no published hazard rate was found |
| Tuber initiation 130 to 175 P-days after emergence by variety; senescence from 450 (early) to 850 (Russet Burbank) | Sourced / invented | Manitoba P-day tables give three cultivars; the rest are placed within their maturity class (`01`, `03-varieties.md`) |
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
| Outside spores can arrive only after the watch threshold, more often as the season's severity total grows; blight also jumps to random hills in the same field and to other fields | Invented | Stands in for regional inoculum and wind-borne spread, and keeps a focus from being contained by pulling plants alone |
| A walk finds 60% of the hills with visible lesions; latent infections cannot be seen | Invented | Lesions low in a closed canopy are easy to miss |
| Latent period 4 days, 6 when cool | Sourced | About 4 days at 13 to 23°C, 7 below 10°C (`02`) |
| Lesions grow, and spread to hills up to two away, only on days with a severity value; hot dry days (29°C and few wet hours) stop both | Sourced direction, invented rates | Rates set so an unsprayed average variety goes from 1% to 90% in roughly three to four weeks of favourable weather, the range MacKenzie (1981) and Fry (1978) report |
| Variety foliage susceptibility 0.48 (Kennebec) to 1.38 (Superior) | Sourced | Penn State 2018 trial, area under the disease curve relative to Atlantic (`03`) |
| Protectant stops up to 95% of new infections, wears off 10% a day, washes off as exp(-0.56 × rain in cm), and does not cure | Sourced | Residue model in `02`; the game uses a second-order rational form of the exponential so the core needs no `exp` |
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
| A chip contract moves a quarter as much as the market | Invented | Contracts fix most of the price before planting |
| Money is in constant present-day dollars | Design choice | Fifty years of nominal prices would make eras incomparable |
| Shrink 1.2% a month, 0.7% with ventilation; the cellar costs $0.30 per cwt per month | Sourced / invented | About 6% shrink over eight months (`04`, `06`). The storage charge is invented, of the order of the recorded $0.81 per cwt for six months in 1980 dollars (`06`). |
| Hidden rot roughly doubles each month and breaks a pile down past 22% | Invented | Anchored to "5% late blight is the limit of storable" (`04`) |
| Dormancy by variety, 60 days (Norland) to 160 (Russet Burbank) | Sourced / invented | Russet Burbank from Idaho data; others scaled or placed by class (`03`) |
| Culls bring one dollar a hundredweight | Sourced | `06` |

## 7. Between years

| Rule | Tag | Source |
| --- | --- | --- |
| Continuous potato yields 7% less in total, with more scab and black scurf, against a two-year rotation | Sourced | Larkin 2022, USDA-ARS Presque Isle long-term trials (`05-pests-soil-seed.md`) |
| The odds that a plant carries Verticillium wilt multiply by 2.3 with each potato crop and by 0.75 with each rest year; an infected plant dies at two thirds of its normal season | Invented rates | Early-dying loss reaching 45% at full incidence is from Powelson (1980); the build-up and decay rates are invented |
| Saved seed: virus next year = 0.85 × this year + 0.22 × variety susceptibility × the healthy share; an infected hill yields 30% less | Sourced | Spread without aphid control and PVY yield loss (`05`) |
| Certified seed starts at 1% virus | Sourced | Maine certification tolerance is 5%; clean lots run lower |
| The game lets a five-acre field be planted with saved seed | Departure | Maine now requires certified seed above one acre (`05`). The game keeps the older practice because the decision is worth having. |

## 8. Things the model leaves out

Colorado potato beetle, early blight, fertility, weeds as a separate system,
machinery failure, contracts by volume, labour hire, hail, and everything else
on the cut list in `docs/DESIGN.md`. The record of what the model gets right and
wrong against USDA's yields and the documented blight years is in
`docs/VERIFICATION.md`.
