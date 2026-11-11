# 07 · Practice and place: what an Aroostook grower does, and when

Research slice 7 for "The County". It covers the reference-practice calendar, frost at Caribou, field workability, labor and machinery by era, almanac facts, and notable seasons from 1973 to 2025 with their outcomes.

Labels used below:

- **SOURCED**: the value comes from a source I opened. The URL and a quote or table reference are in section 3.
- **DERIVED**: I computed the value from primary data I downloaded: NOAA GHCN-Daily for Caribou (station USW00014607) and NASS yield tables. Section 3 gives the method.
- **INVENTED**: a game rule that no source states. It is tuned to match a sourced or derived target, and that target is given with it.
- **UNCONFIRMED**: a value from memory or from a search snippet whose page I could not open.

Units: inches, °F and cwt where the sources use them, with SI values alongside. 1 cwt = 100 lb. 1 Maine barrel = 165 lb = 1.65 cwt.

---

## 1. What the simulation should implement

### 1.1 Reference-practice calendar (what a good County grower does)

These rules supply the game's default schedule ("what a neighbour would do") and the benchmark the player is compared against.

#### Seed preparation (SOURCED: UMaine Bulletin #2412)

- Warm the seed before cutting. Re-warm it for **2 days** before planting.
- Seed pieces should weigh **1.5 to 2.0 oz**, with a target of about 1.75 oz. Russet Burbank pieces should be **2.0 to 2.5 oz**. Do not plant pieces under 1.5 oz. Plant tubers of 1.5 to 3 oz whole, cut 3 to 5 oz tubers in two, and cut 5 to 7 oz tubers in three.
- How far ahead seed can be cut depends on its physiological age:

  | Seed age | Unsprouted | Desprouted |
  |---|---|---|
  | Young | up to 1 to 2 months ahead, held at 50°F | up to 2 weeks ahead, held at 45°F |
  | Middle-aged | 1 to 2 weeks ahead, held at 45 to 50°F | do not precut |
  | Old | do not precut; cut only a few days before planting | do not precut |

- Curing: hold cut seed at **38 to 40°F (<45°F)** and **85 to 95% RH**, piled no more than 6 ft deep. Curing takes **6 to 10 days**.
- Game rule: cut seed that has not cured for at least 6 days, or that sits too long for its age, raises the risk of seed-piece decay. The size of that risk belongs to the disease slice. The timing comes from #2412.

#### Planting (SOURCED + DERIVED)

- **Soil temperature rule (SOURCED):** plant when the **average soil temperature at 6 in reaches 50°F (10°C)**. UMaine Extension computes the average as (high + low) / 2. Johnson (WAGM, 2021): "historically cross the 50-degree average temperature around the 15, 16, 17 of May". The NE Vegetable Management Guide gives 50 to 60°F as ideal and says not to plant cut seed into soil below 45°F.
- **Air-temperature proxy (INVENTED, checked against the record):** the game has no soil-temperature input. It should treat the soil as ready on the first day the **10-day running mean of daily mean air temperature is ≥ 10.0°C**. Over Caribou 1973 to 2025 that day falls on **May 13** in the median year, with a 10th to 90th percentile range of May 3 to May 25 (DERIVED). The median sits 2 to 4 days before Johnson's May 15 to 17. Use 10.5°C to centre it on May 15.
- **Usual planting dates for Maine potatoes (SOURCED, NASS Agricultural Handbook 628).** "Begin" is about 5% planted, "end" about 95%, and "most active" runs from 15% to 85%.

  | Edition | Begin | Most active | End |
  |---|---|---|---|
  | Dec 1997 | May 10 | May 18 to May 29 | Jun 10 |
  | Oct 2010 | May 9 | May 14 to Jun 3 | Jun 9 |

- **Planting progress curves (SOURCED, NASS), percent of Maine potato acres planted:**

  Weekly cumulative percent for individual years, 2008 to 2013 (NASS New England Annual Statistical Bulletin 2013):

  | Week ending | 2008 | 2009 | 2010 | 2011 | 2012 | 2013 |
  |---|---|---|---|---|---|---|
  | Before May 1 | 0 | 2 | 10 | 0 | 2 | 4 |
  | May 8 | 1 | 7 | 40 | 2 | 22 | 26 |
  | May 15 | 17 | 40 | 70 | 10 | 52 | 61 |
  | May 22 | 56 | 85 | 90 | 40 | 72 | 82 |
  | May 29 | 86 | 99 | 95 | 60 | 96 | 87 |
  | Jun 5 | 99 | 100 | 100 | 90 | 99 | 92 |

  Five-year averages from NASS New England weekly Crop Progress:

  | Date | 2019–2023 average (2024 reports) | 2018–2022 average (2023 reports) |
  |---|---|---|
  | May 5 | 3% | |
  | May 12 | 9% | |
  | May 14 | | 10% |
  | May 19 | 31% | |
  | May 21 | | 34% |
  | May 26 | 52% | |
  | May 28 | | 51% |
  | Jun 2 | 63% | |
  | Jun 4 | | 62% |
  | Jun 9 | 79% | |
  | Jun 11 | | 77% |

  Taken together, half the crop was planted by about **May 15** in the median 2008 to 2013 year (range May 10 in 2010 to May 26 in 2011, interpolated). In the recent 5-year averages the 50% date is about **May 26 to 28**. Recent springs were late: the last spring frost at Caribou fell on May 28 2019, Jun 2 2020 and May 28 2021.
- **Spacing (SOURCED):**
  - Rows are **34 to 36 in** apart (#2412 seed tables; #2419). The default should be 36 in (0.91 m).
  - In-row seed spacing is **7 to 12 in** (#2412 table range). The NE Guide gives 7 to 10 in for Katahdin, Superior and Russet Burbank, 12 to 16 in for Russet Burbank and GoldRush, and 6 to 8 in for Kennebec.
  - Planting depth is **2 to 4 in**, with no more than 2 in of soil over the seed piece at planting (NE Guide).
  - NASS objective-yield counts of harvested hills per acre (tubers ≥ 1.5 in), 2009 to 2013:

    | Type | Hills per acre |
    |---|---|
    | Russets | 9,638 to 10,005 |
    | Whites | 11,810 to 13,807 |
    | Reds | 12,589 to 16,275 |
    | Yellows | 11,471 to 15,617 |

  - On 36 in rows those counts equal roughly 17 in between russet hills and 13 in between white hills (DERIVED: 43,560 ft² ÷ (3 ft × hills)). Harvested hill counts are lower than seed drops because some stand is lost.
  - Game default: 36 in rows; in-row spacing of 10 in for whites/round types and 12 in for russets. The player can set 7 to 16 in.

#### Emergence (SOURCED / DERIVED)

- NASS 5-year averages for percent emerged:

  | Date | 2019–2023 average | 2018–2022 average |
  |---|---|---|
  | Jun 9 | 21% | |
  | Jun 11 | | 24% |
  | Jun 16 | 46% | |
  | Jun 18 | | 48% |
  | Jun 25 | | 66% |

- With median planting around May 26 to 28 and median emergence around Jun 17 to 19, the planting-to-emergence lag is about **3 weeks** (DERIVED).
- In 2023, NASS reported the first blooms on Jun 25 (5% blooming). The Potato Blossom Festival is held in mid-July, timed to coincide with blooming fields.
- Emergence itself is a degree-day rule from the crop-model slice. These dates are its validation target.

#### Hilling (SOURCED)

- UMaine #2419 (organic, the only Maine bulletin with explicit timing):
  - Hill once plants are "about six inches tall".
  - "Up to three hillings may be needed".
  - Finish all hilling and cultivation by the time plants are 10 in tall.
  - "The potato canopy should close within 30 to 45 days after planting."
- NE Vegetable Management Guide: "Begin hilling and cultivation operations after the plants begin to emerge and complete prior to the plants filling half of the row".
- Game rule: hilling is allowed from emergence until 50% row cover, with 1 to 3 passes (SOURCED window). INVENTED: the first pass is ideal at 4 to 6 in of plant height, and a pass after the canopy fills half the row damages foliage and roots. The crop slice sets the size of that damage.

#### Scouting (SOURCED)

- The UMaine Potato IPM program "surveyed 30 potato fields on a weekly basis during 2020". It ran five 16-ft aphid tower traps "from May through September 2020" (Northeast IPM Center, Maine IPM Report 2021).
- The program's Potato Pest Alert reports are "normally posted twice per week" during the season (UMaine Potato IPM page).
- Game rule: the reference practice is **one scouting walk per week** from emergence to vine kill. A scouting action reveals pest and disease state for the field.

#### Late blight protectant program (SOURCED, UMaine Bulletin #2418 and the NoBlight model page)

- Severity values (SV) accumulate from **50% emergence**. Each day's SV comes from the hours at RH ≥ 90% and the mean temperature during those hours:

  | Temp during RH ≥ 90% | SV 0 | SV 1 | SV 2 | SV 3 | SV 4 |
  |---|---|---|---|---|---|
  | 45–54°F | ≤15 h | 16–18 h | 19–21 h | 22–24 h | 25–27 h |
  | 55–59°F | ≤12 h | 13–15 h | 16–18 h | 19–21 h | 22–24 h |
  | 60–81°F | ≤9 h | 10–12 h | 13–15 h | 16–18 h | 19–21 h |

  Above the top row in each temperature band, #2418 gives SV = (h − 1)/3 − 4 for 45–54°F, (h − 1)/3 − 3 for 55–59°F and (h − 1)/3 − 2 for 60–81°F.
- **First spray:** "Once 18 severity values have accumulated after emergence, a fungicide application is recommended." Spray earlier after an extended wet period right after emergence, or at once if blight is in the field or nearby.
- **Maximum spray interval** (NoBlight page), set by the 7-day SV sum and 7-day rain:

  | 7-day rain < 1.2 in | 7-day rain ≥ 1.2 in | Maximum interval |
  |---|---|---|
  | SV ≥ 6 | SV ≥ 5 | 5 days |
  | 5 ≤ SV < 6 | 4 ≤ SV < 5 | 7 days |
  | 4 < SV < 5 | 3 < SV < 4 | 10 days |
  | SV ≤ 4 with rain | SV ≤ 3 | 12 days |
  | SV ≤ 4, no rain | | 14 days |

- #2418 is explicit: "Fungicide applications to control late blight should be based on weather conditions, not on a calendar".
- Recent extension advice in high-risk weeks has been a **5-day schedule**: all areas were told to spray every 5 days in Aug 2024, and growers were told to start and hold a 5-day schedule in late June 2025 (BDN, Maine Public). Those articles came from search results; I did not open them.
- This slice supplies only the start rule and the interval table. The infection model belongs to the disease slice.

#### Irrigation (how common it is) (SOURCED)

- 1959: **0%** of Maine potato acreage irrigated (USDA SB 346, Table 21).
- 1978: about **2,800** irrigated acres. 1997: about **8,600** acres, **11.8%** of the crop (1997 Census of Agriculture, quoted in the Maine Potato Board industry study).
- 2022: "about 25 percent of the potato acreage being irrigated" (Maine Potato Board via Climate Central, May 2022). That article also says most growers "still dry farm".
- 2020: "Nearly a third of the acreage is irrigated" (a grower quoted in BDN, Aug 2020). Treat this as the high end.
- Value of irrigation in UMaine trials at the Aroostook Research Farm (#2439):
  - Irrigated plots averaged **+49 cwt/acre** (about 17%) over non-irrigated plots.
  - The response fell as June to August rain rose:

    | Year | Jun–Aug rain | Yield response |
    |---|---|---|
    | 1992 | 13 in | 4% |
    | 1993 | 10.5 in | 8% |
    | 1994 | 9 in | 26% |
    | 1995 | 6.5 in | 37% |
    | 1996 | 11.5 in | 16% |
    | 1997 | 10 in | 23% |
    | 1998 | 11.2 in | 23% |
    | 1999 | 11 in | 7% |
    | 2000 | 8 in | 19% |
    | 2002 | 10 in | 16% |
    | 2003 | 11.8 in | 6% |

  - These values were read from the chart's text description.
  - Typical seasonal application is **2 to 4 in**. A very dry year needs 7 in or more, a wet year none.
  - Trigger points by plant-available water (PAW) under a center pivot:

    | Period | Irrigate below |
    |---|---|
    | Emergence to Jul 10 | 55% PAW |
    | Jul 10 to Aug 28 | 65% PAW |
    | Aug 28 to Sep 10 | 60% PAW |

    Stop irrigating after Sep 10.
- Game rule: irrigation is an option the player must buy. Era defaults for the share of neighbours who irrigate:

  | Era | Default irrigated share | Basis |
  |---|---|---|
  | Before 1980 | about 2% | DERIVED: 2,800 of 118,000 harvested acres in 1978 |
  | 1997 | about 12% | SOURCED |
  | 2020s | about 25% | SOURCED |

  Yield-response checks are in 1.7.

#### Vine kill (SOURCED)

- **Seed fields:** the Bacterial Ring Rot inspection comes "after the second inspection and before top kill (August)" (Maine DACF rules as summarised in the Maine Potato Board's 2025 testimony). Seed vines are killed in **August**.
- **Tablestock and processing:** in the week ending Sep 4, 2011, "most potato growers in Maine were applying vine killing applications to get ready for harvesting" (NASS NE Crop Weather, Sep 6 2011).
- **Interval to harvest:**
  - Harvest "at least two weeks (preferably three weeks) after the vines die down" (#2417).
  - "Slash them off 14 to 21 days before harvest" (#2419).
  - "Desiccated approximately 21 days prior to harvest to ensure good skin set" (NE Guide).
- Game rule: skin set completes **14 to 21 days** after vine kill or natural senescence. Digging earlier carries a skinning and bruise penalty; its size belongs to the storage slice.

#### Harvest (SOURCED)

- **Usual harvest dates (NASS Handbook 628):**

  | Edition | Begin | Most active | End |
  |---|---|---|---|
  | 1997 | Sep 7 | Sep 21 to Oct 7 | Oct 19 |
  | 2010 | Sep 6 | Sep 20 to Oct 10 | Oct 17 |

- **Harvest progress, 5-year averages (NASS):**
  - 2019–2023: Sep 15 38%, Sep 22 45%, Sep 29 61%, Oct 6 72%, Oct 13 83%, Oct 20 92%.
  - 2018–2022: Aug 27 11%, Sep 3 18%, Sep 10 28%, Sep 17 33%, Sep 24 41%, Oct 1 56%, Oct 8 67%, Oct 15 80%, Oct 22 88%.
  - Half the crop is dug by about **Sep 25 to Oct 1**.
  - The 10 to 30% dug by early September is early-market and processing crop dug straight from the field. In 2011 the 5-year average for early September was only 5%, so August and early-September digging has grown since.
- **Conditions:**
  - Harvest "from dry soil when the tuber pulp temperatures are between 45-65 °F" (#2417).
  - The ideal air temperature is 60 to 70°F, and below 55°F "considerable bruising is likely" (NE Guide).
  - Don Flannery of the Maine Potato Board (2019) wanted daytime highs no higher than the low 70s and nights "above 35 degrees at night so that soil does not freeze overnight". He added: "Usually we finish in the middle of October, but everything is weather-dependent."
- **School harvest break (SOURCED):**
  - Students are excused "for two to three weeks each fall", typically from late September into mid-October.
  - 2020 examples: SAD 1 (Presque Isle) Sep 18 to Oct 13; SAD 42 Sep 18 to Oct 12; SAD 45, RSU 39 and SAD 20 Sep 28 to Oct 9.
  - The tradition dates "since at least 1945" (BDN, Aug 2020).
  - RSU 39 (Caribou) moved to a **1-week break starting Sep 22, 2025**, earlier in the season "to accommodate farmers" (BDN, Dec 2024).
  - In 1984, Presque Isle area schools closed for 3 weeks, and "Roughly 65 percent of area high school and junior high school students participate" (CS Monitor). By 2016 to 2020, about 15 to 25% of high-school students worked the harvest (BDN).
- Game rule (INVENTED from the dates above): a harvest-break crew is available from the third or fourth Monday of September. It lasts 3 weeks by default. The player can choose 2 weeks, which many districts used by 2020, or 1 week, which RSU 39 adopted from 2025. The crew boosts labor capacity in hand-picking eras. No source gives a district-by-year schedule for 1973 to 2025.

#### Storage (SOURCED, for the storage slice)

- Cool harvested tubers to the **50°F curing temperature** "as quickly as possible" (#2417).
- Ideal long-term storage is **38°F at 95% RH** (#2419).

### 1.2 Frost at Caribou

All dates in this section were computed from the Caribou GHCN-Daily record, 1973 to 2025, with no missing Tmin years. Thresholds are on daily Tmin. "Spring" is the last occurrence before August; "fall" is the first occurrence from August on.

| Threshold | Median last spring | 10th–90th pct (spring) | Extreme spring | Median first fall | 10th–90th pct (fall) | Extreme fall | Median frost-free run |
|---|---|---|---|---|---|---|---|
| ≤ 32°F (0°C), frost | **May 13** | May 2 – May 25 | Jun 4 2002 | **Sep 24** | Sep 14 – Oct 6 | Sep 3 1976 | 132 d (107–160) |
| ≤ 28°F (−2.2°C), hard freeze | Apr 26 | Apr 17 – May 6 | May 13 2005 | **Oct 12** | Sep 28 – Oct 29 | Sep 19 2008 | 168 d |
| ≤ 24°F (−4.4°C) | Apr 14 | Apr 4 – Apr 25 | May 2 1974 | **Oct 30** | Oct 12 – Nov 14 | Sep 29 1980 | 192 d |

- **Strict < 32°F:** if a reading of exactly 32°F does not count (Tmin < 0.0°C), the medians move to May 9 and Sep 30.
- **NCEI 1991–2020 normals (SOURCED).** These use a fitted method. FP50 means a 50% chance the event falls later in spring, or earlier in fall, than the date. They match the strict-threshold medians:
  - 32°F: last spring 05/07 (FP90 04/27, FP10 05/24); first fall 10/01 (FP10 09/17, FP90 10/14); growing season 143 d.
  - 28°F: last spring 04/26; first fall 10/12.
  - 24°F: last spring 04/17; first fall 10/29.
  - The Old Farmer's Almanac's "May 13 / Sep 25" for Caribou is the NCEI 30% value, not the median.
- **Trend:**

  | Period | Median last spring frost (≤ 32°F) | Median first fall frost (≤ 32°F) |
  |---|---|---|
  | 1973–1990 | May 10 | Sep 19 |
  | 1991–2020 | May 14 | Sep 25 |
  | 2001–2025 | May 13 | Sep 28 |

  The fall frost has moved about 9 days later, and spring has not moved.
- **Check:** the computed first fall ≤ 32°F in 2024 is Oct 9. NWS Caribou's 2024 Annual Climate Summary states: "The first freeze was observed in Caribou on the 9th" (October).
- **Earliest fall frosts (≤ 32°F):** Sep 3 1976, Sep 4 1989, Sep 11 2006, Sep 12 1985, Sep 14 1978, Sep 14 2004.
- **Earliest hard freezes (≤ 28°F):** Sep 19 2008, Sep 21 2020, Sep 22 1973, Sep 24 2018, Sep 26 2009, Sep 28 1989.
- **Latest spring frosts (≤ 32°F):** Jun 4 2002, Jun 2 2020, May 28 in 1994, 2019 and 2021.

**Which frost hurts what:**

- **Foliage.** 32°F frost damages leaves. NWS defines a hard freeze as "the surface air temperature reaches 28°F or lower for an extended period of time", "killing most types of vegetation". Game rule: Tmin ≤ 28°F kills the vines, which ends bulking and acts like a vine kill. Tmin of 29 to 32°F burns a share of leaf area, set by the crop slice. The 28°F threshold is SOURCED from NWS; its application to potato vines is INVENTED.
- **Tubers in the hill.** Hydrated soil protects tubers until the soil around them reaches **−1.4 to −1.9°C**. Tubers held at −1.0°C for 4 to 24 h were unharmed, and "extensive tuber death occurred when soil temperatures reached -2.8 or lower at tuber depth" (Boydston et al. 2006, Am. J. Potato Res. 83:305–315, read through the USDA-ARS summary).
- **Exposed tubers.** Tubers in the harvester, in trucks, or green tubers at the hill surface freeze at about −0.6 to −0.8°C (30.5 to 30.9°F). UNCONFIRMED: from search snippets of UC Davis Postharvest and of UMaine #4135, which cites USDA Handbook 66.
- **Harvest rule (INVENTED, anchored on the sources above):**
  - No digging on a day after Tmin ≤ 28°F until the afternoon. In a daily step, that day's digging capacity is halved.
  - Tubers still in the ground take freeze damage after a night with Tmin ≤ 24°F (−4.4°C), proxying soil at 10 cm near −1.5°C. Damage is heavy below 20°F.
  - The median first ≤ 24°F night is Oct 30, with a 10th percentile of Oct 12 and an earliest of Sep 29 1980. The NASS harvest "end" of Oct 17 to 19 sits before most of that risk, which fits the rule.
  - If the soil slice provides a soil-temperature series, replace the proxy with Boydston's −1.5°C threshold at tuber depth.

### 1.3 Field workability (when it is too wet to work)

- **SOURCED method (USDA-ARS IFSM model; Rotz & Harrigan 2005):** a day is suitable when soil moisture in the top layers is below a tractability limit, given as a fraction of field capacity. The manual recommends values in Table 5.1:

  | Soil | Spring tillage/planting, top 75 mm | Spring, 75–150 mm | Fall harvest, top 75 mm | Fall harvest, 75–150 mm |
  |---|---|---|---|---|
  | Loam | 0.94 | 0.96 | 1.04 | 1.02 |
  | Sandy loam | 0.96 | 0.98 | 1.06 | 1.04 |
  | Clay loam | 0.92 | 0.94 | 1.03 | 1.01 |

  The manual also says: "Soil is generally considered tractable or suitable for field operations when soil moisture to the depth of tillage is near 95% of field capacity."
  - **Recommendation:** if the soil-water slice runs a topsoil bucket, a day is workable for planting and hilling when topsoil water is ≤ 0.95 × field capacity, and for harvest when it is ≤ 1.03 × field capacity. Aroostook potato soils are loams; use the loam row.
- **Observed calibration target (SOURCED, NASS New England weekly reports, 2023–2024):**
  - Days suitable for fieldwork averaged **5.3 days per week** across 30 planting-season and harvest-season weeks, with a range of 4 to 7.
  - These figures are New England-wide, not Maine-only.
- **Fallback rule (INVENTED, calibrated) for use without a soil bucket:**
  - A day is unworkable if that day's rain is ≥ 0.25 in (6.4 mm), or the previous day's rain was ≥ 0.5 in (12.7 mm), or the rain two days earlier was ≥ 1.0 in (25.4 mm).
  - On Caribou weather for the same weeks this rule gives 5.40 workable days per week against NASS's 5.30. The weekly correlation is r = 0.34, which is weak; that is expected because NASS covers all of New England.
  - Over 1973 to 2025 it gives a mean of 5.55 workable days per week from May 1 to Jun 10, and 5.52 from Sep 10 to Oct 20 (DERIVED).
  - In plain words: a soaking rain (over 1 in) closes a field for about 3 days, a half-inch rain for 2 days, and a quarter-inch rain for that day.
- **Evidence for the extremes (SOURCED):**
  - 2009: farmers could not get onto fields to spray infected plants; one Lincoln grower planted half his acreage: "We couldn't get on the rest of the fields" (BDN, Jul 1 2009).
  - 2011: "the saturated ground is making it difficult to get into the fields" (NASS, Sep 2011).
  - 2023: "It's so wet we can't harvest" (The County, Sep 23 2023).

### 1.4 Labor and machinery by era

| Era / operation | Value | Status |
|---|---|---|
| All operations, U.S. average, 1910–14 | **76.0** man-h/acre (yield 59.8 cwt/ac) | SOURCED, SB 346 Table 2 |
| All operations, U.S., 1935–39 / 1945–49 / 1955–59 / 1960–63 | 69.7 / 68.5 / 53.1 / 48.7 man-h/acre | SOURCED, SB 346 Table 2 |
| **Maine 1959, preharvest** (cutting, planting, cultivating and hilling, spraying) | **23** man-h/acre | SOURCED, SB 346 Table 21 |
| **Maine 1959, harvest by hand method** (machine digger, hand picking into barrels) | **44** man-h/acre | SOURCED, Table 21 |
| **Maine 1959, harvest by machine** (mechanical harvester) | **20** man-h/acre | SOURCED, Table 21 |
| Maine 1959, all harvest methods / total | 43 / **66** man-h/acre; yield 243 cwt; 0% irrigated | SOURCED, Table 21 |
| Idaho 1959, for comparison | hand harvest 38, machine harvest 11 man-h/acre | SOURCED, SB 346 text p. 7 |
| Share of Maine crop hand-picked, 1984 | "Only about 10 percent" | SOURCED, CS Monitor 1984 |
| Hand-picker output, 1984 | **20 to 30 barrels/day** (165 lb each) for a youth picker; paid 50¢/barrel plus a 5¢ season bonus | SOURCED, CS Monitor 1984 |
| Modern machine time, planting (5-row, 15 ft) | **0.27** h/acre | SOURCED, UC Davis 2023 Klamath study, Table 1 |
| Modern, cultivate/hilling | **0.17** h/acre | SOURCED, same |
| Modern, ground spray pass (post-emergence herbicide) | **0.19** h/acre | SOURCED, same |
| Modern, cut vines / roll beds | **0.17** h/acre | SOURCED, same |
| Modern, dig/harvest (4-row harvester) | **0.84** h/acre machine, plus bulk-handling labor 2.0 h/acre and hauling 2.2 h/acre | SOURCED, same |
| Modern, labor overhead on machine time | labor h = 1.2 × machine h | SOURCED, same ("20% higher") |
| ASABE D497 potato harvester | speed 1.5–4.0 mph (typical 2.5); field efficiency 55–70% (typical 60) | SOURCED, MSU P3543 Table 2 citing ASABE 2011 |
| ASABE row-crop planter | 4.0–7.0 mph (5.5); 50–75% (65) | SOURCED, same |
| ASABE row-crop cultivator (for hilling) | 3.0–7.0 mph (5.0); 70–90% (80) | SOURCED, same |
| ASABE boom sprayer | 3.0–7.0 mph (6.5); 50–80% (65) | SOURCED, same |
| Field capacity formula | acres/h = speed (mph) × width (ft) × efficiency ÷ 8.25 | SOURCED, MSU P3543 (5,280/43,560 = 1/8.25) |

Per-hill conversions for the game's small hand-worked field (DERIVED from Maine 1959 and NASS hill counts, about 13,000 hills/acre):

- Preharvest work: 23 man-h ÷ 13,000 hills ≈ **6.4 s per hill per season**.
- Hand picking behind a digger: 44 man-h/acre ≈ **12 s per hill**.
- Harvester era: 20 man-h/acre ≈ 5.5 s per hill.
- A 1984 youth picker at 25 barrels/day picks 4,125 lb/day. At 240 cwt/acre that is about 0.17 acre/day, or about 2,200 hills/day.

**Fork digging with no machine digger is not in any source I opened.** If the game needs it, mark it INVENTED. A plausible start is 2 to 3 times the hand-pick time, about 30 s per hill.

### 1.5 Place and history: almanac facts an in-game almanac can quote

All items are SOURCED unless marked otherwise.

- **The potato barrel.**
  - Maine law: "The standard weight of a barrel of flour is 196 pounds; of a barrel of potatoes in good order and fit for shipping is 165 pounds" (R.S. 1954 c. 32-A §42, as amended 1957 c. 260). The same section sets the bushel of potatoes at 60 lb.
  - The County (2009) says the 165-lb standard was set by an 1891 law.
  - The barrel "was the standard of measure for Maine potato buyers and sellers until 1989", when Maine switched to hundredweight (Portland Press Herald 2014).
  - The smaller, wagon-liftable potato barrel is credited to Houlton cooper Wilbur Horatio Harding, born in Appleton in 1861 (same article).
  - In 1915 the Legislature debated raising the barrel to 166 lb. Rep. Pierce of Houlton defended 165 as "the way it always has been" (search-result summary of the 1915 Legislative Record; PDF not opened).
- **Potato houses.**
  - "The Aroostook type of storage house, with concrete or masonry basement walls and wooden superstructure". Basements are "usually from 8 to 12 feet or more in depth", and "most of them have a capacity of several thousand barrels". Ventilation was by trapdoors in the floor above (USDA Farmers' Bulletin 847, *Potato Storage and Storage Houses*, W. Stuart, 1917, rev. 1933, reproduced by Small Farmers Journal).
  - The first frost-proof storage houses stood at rail sidings; Houlton had "eight large frost-proof receiving houses at the railway" by 1886 (The County 2009).
  - UMaine's Aroostook Farm, bought in 1913, came with "a large barn with concrete potato house in basement".
- **Maine Potato Blossom Festival.** Fort Fairfield "has hosted the gathering — one of Maine's oldest festivals — since 1947". It is timed with "the blossoming potato fields". The 2025 festival was the 78th and ran July 12 to 20 (BDN, Jul 7 2025).
- **Acreage rise and decline** (harvested acres, NASS):

  | Year | Acres | Note |
  |---|---|---|
  | 1909 | 136,000 | |
  | 1934 | 171,000 | |
  | 1943 | 200,000 | |
  | **1946** | **219,000** | peak in the 1866–1950 bulletin |
  | 1947 | 186,000 | crop worth $94.4 million |
  | 1950 | 132,000 | |
  | 1973 | 137,000 | |
  | 1985 | 99,000 | |
  | 1997 | 72,000 | |
  | 2013 | 54,000 | |
  | 2016 | **46,500** | low of the 1973–2025 period |
  | 2025 | 51,900 | |

  - Early figure (The County 2009): about 28,000 acres in 1890, "double that of 1880".
  - Idaho overtook Maine as the top potato state in **1957** (BDN 2022).
  - Yields rose as acreage fell: 1946's 358 bu/acre equals 215 cwt; 2022 reached a record **355 cwt/acre**.
- **Tablestock to processing.**
  - In 1992 Maine sold 43% of its crop fresh and 44.6% to processing. "By 2001, this pattern had reversed", with processing at 63% (Maine Potato Board industry study, Planning Decisions).
  - Processing is now "about 64 percent of an average crop" (Don Flannery, BDN Feb 2022).
  - Types planted, 2021 to 2023: russet 60 to 62%, white 31 to 33%, red/blue 4%, yellow 2 to 3% (NASS Potatoes 2023).
  - Russet Burbank was 38 to 43% of acres in 2008 to 2013 (NASS 2013 bulletin).
  - McCain acquired a French-fry plant in Washburn in **1975** and bought one in Easton in **1976** (McCain timeline).
- **Maine Potato Board.** Created by PL 1985, c. 753 (the 112th Legislature, which met in 1985–86; the board dates its founding to 1986). It is "a body corporate and politic and an incorporated public instrumentality of the State" with **11 elected members** representing tablestock, seed and processing growers, dealers and processors (36 MRSA §4603). It is funded by the potato tax, now "$.06 per hundredweight on all potatoes grown in this State" (36 MRSA §4605).
- **Other dates:**
  - **Katahdin** was first grown at Aroostook Farm in 1923 and released in 1932. **Atlantic**, the chipping variety, was released in 1976 (UMaine Aroostook Farm centennial timeline).
  - On **May 25, 1976**, the New York Mercantile Exchange "declares a default in its May Maine potato contract" (CFTC history). It was the largest default in U.S. futures history up to then, per a Congressional Record search summary I did not open.
  - Joseph Houlton planted the first Aroostook potato in June 1807 (The County 2009). This is a local-history claim.

### 1.6 Notable seasons 1973–2025 (post-season notes and validation cases)

All yields are Maine statewide NASS final estimates. "Residual" is the departure from the 1973–2025 linear trend, yield = −3291.9 + 1.785 × year (cwt/acre), which has a residual SD of 20 cwt (DERIVED). The Caribou weather values are DERIVED from GHCN-Daily.

| Year | What happened | Crop outcome | Source |
|---|---|---|---|
| 1973 | Early frost Sep 21 and hard freeze Sep 22. Summer rain near normal (247 mm). | **210 cwt/ac**, the lowest of the period (−8.5%). Price $7.25/cwt, high. | NASS 1969–75; GHCN. **The cause is not documented in what I read.** |
| 1974 | Normal season, 6 hot days. | 260 cwt (+12%), 140,000 acres, 36.4 M cwt. Price fell to $2.90. | NASS 1974–78 |
| 1976 | **Earliest fall frost on record, Sep 3.** Futures default on May 25. | 245 cwt (+4%). | GHCN; CFTC |
| 1980 | **Earliest ≤ 24°F night, Sep 29.** | 240 cwt; 4,000 planted acres not harvested. | GHCN; NASS 1978–82 |
| 1985 | Cool summer (4 days ≥ 85°F). | **285 cwt (+13.6%)**; 28.2 M cwt, the largest crop of the period. | NASS Jan 1987 summary |
| 1989 | First frost Sep 4. | 275 cwt (+6.5%). | GHCN; NASS |
| 1991 | **July rain 24 mm, the driest July in the record**; 16 hot days; wet August (171 mm). | 230 cwt (−12%). | GHCN; NASS 1987–92 |
| 1992 | Cool, wet summer (390 mm, 1 hot day). UMaine irrigation gain only 4%. | **300 cwt (+13.9%)**. | NASS; UMaine #2439 |
| 1994 | Late-blight years. Maine storage shrink exceeded 24% in the early 1990s, "caused in large part by a severe outbreak of late blight". Irrigation gain 26% (9 in rain). | 245 cwt (−8%). | MPB industry study; #2439 |
| 1995 | **Driest summer on record**: "The driest summer on record was 5.6 inches in 1995" (NWS Caribou). The GHCN Jun–Aug total, 143 mm, agrees. 24 hot days. Irrigation gain 37%. | **220 cwt (−18%)**, the worst residual of the period. | BDN Aug 2020; #2439; NASS |
| 2002 | **Latest spring frost on record, Jun 4.** August rain only 14 mm. | 265 cwt (−6%). | GHCN; NASS |
| 2004 | Cool summer (1 hot day). | 310 cwt (+8.8%). | NASS |
| 2009 | Wet June and July: "22 out of 30 days with either rain or no sun". Late blight found, and fields too wet to spray. | 275 cwt (−6%). | BDN Jul 2009; NASS |
| 2011 | **Wettest summer in the record (675 mm Jun–Aug)** and the wettest planting window. Irene on Aug 28. Late blight found around Bridgewater, Caribou and Fort Fairfield. | 265 cwt (−11%); 58,000 planted, 55,000 harvested. | NASS SB 1047; NASS Sep 2011; BDN Aug 2011 (search only) |
| 2012 | Dry July (44 mm), warm. | 275 cwt (−8%). | NASS; GHCN |
| 2018 | 25 days ≥ 85°F and a dry summer. | 310 cwt, exactly on trend. Heat alone did not sink the crop. | NASS; GHCN |
| 2020 | **Drought**: "only 4.94 inches of rain since June 1" (NWS, Aug 22). USDA drought disaster designation for Aroostook. "Maybe a 30 percent loss in yield" for some growers (Maine Potato Board). Drought "does not hurt the quality". Latest-but-one spring frost (Jun 2) and a hard freeze on Sep 21. | **265 cwt (−15.5%)**. | BDN Aug 2020; Maine Public Oct 2020; NASS |
| 2021 | Warm, moderately dry. | 345 cwt (+9.5%), 18.4 M cwt. | NASS |
| 2022 | | **355 cwt, the record**. | NASS Potatoes 2023 |
| 2023 | Very wet summer: Caribou had 6.6 in in August, its wettest August since 2011. Harvest stalled: "It's so wet we can't harvest". Some low spots were left. | 320 cwt (on trend). Growers called it "very much on par". | The County Sep and Nov 2023; NASS |
| 2024 | Second-driest September at Caribou. | 340 cwt (+6%). | NWS 2024 summary; NASS |
| 2025 | Drought "started with a dry spell in August"; USDA disaster designation for all 16 counties (Nov 21). | 330 cwt (+2%). | Maine Public Nov 2025; NASS Potatoes 2026 |

The complete year-by-year table is in 1.8.

### 1.7 What should show the model is right (validation targets from this slice)

1. **Calendar.** Under default player choices, the AI-neighbour schedule should reproduce:
   - planting 5%, 50% and 95% near May 9, May 20 and Jun 9;
   - 50% emergence near Jun 17;
   - harvest 50% near Sep 25 to Oct 1 and 95% near Oct 17 to 19.
2. **Frost.** Over 1973 to 2025, the simulated "first killing frost" should match the table in 1.2 exactly, because it is computed from the same record.
3. **Workability.** Mean workable days should be about 5.3 to 5.5 per week in the planting and harvest windows.
4. **Yield extremes.** The model need not reproduce every year: overall, the state yield residual correlates weakly with Caribou summer rain (r = 0.07, or 0.25 without 2011) and with hot days (r = −0.29). It should rank the extreme years correctly:
   - **1995 and 2020 (drought plus heat) are the two worst** relative to their era, at −18% and −15.5%.
   - **1991 (dry July) and 2011 (waterlogged) are the next worst**, at −11% to −12%.
   - **1985 and 1992 (cool, adequate rain) are among the best**, at about +14%.
   - On non-irrigated ground, irrigation should add about **+37% in 1995**, **+4% in 1992**, and about **+17% (+49 cwt) on average** (UMaine trials).
5. **Labor.** A hand-picking-era field should need about 66 man-h/acre per season in total. A harvester-era field should need about 40 to 45.

### 1.8 Year table, 1973–2025 (DERIVED from primary data)

- **Yield source by year:**

  | Years | NASS source |
  |---|---|
  | 1973–83 | Final-estimate bulletins 1969–75, 1974–78, 1978–82 |
  | 1983–84 | Potatoes & Sweetpotatoes, Sep 1985 |
  | 1985–86 | Annual Crop Summary, Jan 1987 |
  | 1987–92 | Final estimates 1987–92 |
  | 1992–97 | SB 962 |
  | 1997–2002 | SB 998 |
  | 2003–07 | SB 1015 |
  | 2008–12 | SB 1047 |
  | 2013–20 | Maine Potato Report, Feb 2023 |
  | 2021–25 | Potatoes annual summaries, 2024–2026 |

- **Weather source:** Caribou GHCN-Daily (USW00014607).
- **Column definitions:** "JJA P" is the June to August precipitation total in mm. "Hot d" is the count of days from June to September with Tmax ≥ 85°F (29.4°C). Frost dates are MM-DD on Tmin.

| Year | Planted (k ac) | Harvested (k ac) | Yield (cwt/ac) | Resid % | JJA P mm | Hot d | Last ≤32 | First ≤32 | First ≤28 | First ≤24 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1973 | 138 | 137 | 210 | -8.5 | 247 | 6 | 05-08 | 09-21 | 09-22 | 10-11 |
| 1974 | 142 | 140 | 260 | +12.4 | 259 | 6 | 05-21 | 09-24 | 09-24 | 10-19 |
| 1975 | 122 | 122 | 220 | -5.6 | 205 | 13 | 05-10 | 09-15 | 10-03 | 10-10 |
| 1976 | 116 | 112 | 245 | +4.3 | 400 | 17 | 05-05 | 09-03 | 09-25 | 10-27 |
| 1977 | 124 | 118 | 240 | +1.4 | 408 | 8 | 05-09 | 09-25 | 10-08 | 10-31 |
| 1978 | 119 | 118 | 220 | -7.7 | 285 | 14 | 05-06 | 09-14 | 10-16 | 10-17 |
| 1979 | 116 | 113 | 245 | +2.0 | 298 | 16 | 05-06 | 09-24 | 10-10 | 11-15 |
| 1980 | 108 | 104 | 240 | -0.8 | 252 | 8 | 05-05 | 09-16 | 09-24 | 09-29 |
| 1981 | 106 | 104 | 255 | +4.6 | 479 | 5 | 05-19 | 10-06 | 10-12 | 10-29 |
| 1982 | 107 | 106 | 255 | +3.8 | 308 | 8 | 05-23 | 10-03 | 10-10 | 10-23 |
| 1983 | 95 | 94 | 240 | -3.0 | 271 | 11 | 05-18 | 09-15 | 10-10 | 10-22 |
| 1984 | 94 | 89 | 240 | -3.7 | 307 | 6 | 05-19 | 09-17 | 10-05 | 10-30 |
| 1985 | 100 | 99 | 285 | +13.6 | 246 | 4 | 05-09 | 09-12 | 10-12 | 10-13 |
| 1986 | 85 | 84 | 250 | -1.1 | 283 | 2 | 05-09 | 09-18 | 10-10 | 10-11 |
| 1987 | 84 | 83 | 280 | +10.0 | 218 | 7 | 05-25 | 09-26 | 10-11 | 10-12 |
| 1988 | 81 | 80 | 275 | +7.3 | 262 | 16 | 05-15 | 09-23 | 10-07 | 10-07 |
| 1989 | 81 | 80 | 275 | +6.5 | 262 | 10 | 04-27 | 09-04 | 09-28 | 10-20 |
| 1990 | 81 | 76 | 270 | +3.9 | 303 | 12 | 05-24 | 10-04 | 10-21 | 10-28 |
| 1991 | 81 | 79 | 230 | -12.1 | 246 | 16 | 05-23 | 09-22 | 10-15 | 10-21 |
| 1992 | 82 | 81 | 300 | +13.9 | 390 | 1 | 05-19 | 09-24 | 10-15 | 10-30 |
| 1993 | 80 | 78 | 255 | -3.9 | 269 | 10 | 05-14 | 09-20 | 10-01 | 10-10 |
| 1994 | 78 | 75 | 245 | -8.2 | 308 | 4 | 05-28 | 10-02 | 10-12 | 11-20 |
| 1995 | 78 | 78 | 220 | -18.2 | 143 | 24 | 05-07 | 09-16 | 09-24 | 10-31 |
| 1996 | 78 | 77 | 275 | +1.6 | 315 | 4 | 05-16 | 09-27 | 10-04 | 10-15 |
| 1997 | 72 | 72 | 265 | -2.7 | 283 | 8 | 05-09 | 09-22 | 10-19 | 10-23 |
| 1998 | 65.5 | 64.5 | 280 | +2.1 | 276 | 8 | 04-28 | 10-06 | 10-06 | 10-07 |
| 1999 | 65 | 62.5 | 285 | +3.3 | 250 | 15 | 05-15 | 10-04 | 10-05 | 10-27 |
| 2000 | 64 | 64 | 280 | +0.8 | 292 | 1 | 05-20 | 09-26 | 09-26 | 10-16 |
| 2001 | 62.5 | 62 | 265 | -5.2 | 257 | 16 | 05-07 | 09-30 | 10-09 | 10-31 |
| 2002 | 64.5 | 64 | 265 | -5.8 | 244 | 13 | 06-04 | 09-29 | 09-30 | 10-30 |
| 2003 | 66 | 65.5 | 260 | -8.2 | 346 | 4 | 05-09 | 10-03 | 10-10 | 10-22 |
| 2004 | 63.5 | 61.5 | 310 | +8.8 | 336 | 1 | 05-10 | 09-14 | 10-05 | 10-29 |
| 2005 | 57.5 | 56.2 | 275 | -4.1 | 267 | 12 | 05-14 | 09-25 | 10-29 | 11-13 |
| 2006 | 58.5 | 57.0 | 305 | +5.7 | 290 | 4 | 05-08 | 09-11 | 10-07 | 10-27 |
| 2007 | 57.1 | 56.5 | 295 | +1.6 | 240 | 8 | 05-22 | 09-17 | 10-26 | 10-31 |
| 2008 | 56.0 | 54.7 | 270 | -7.5 | 365 | 4 | 05-03 | 09-18 | 09-19 | 10-19 |
| 2009 | 56.0 | 55.5 | 275 | -6.4 | 238 | 5 | 05-19 | 09-17 | 09-26 | 10-15 |
| 2010 | 55.5 | 55.2 | 290 | -1.9 | 337 | 17 | 05-13 | 10-04 | 10-14 | 10-31 |
| 2011 | 58.0 | 55.0 | 265 | -10.9 | 675 | 4 | 05-02 | 10-06 | 10-07 | 11-18 |
| 2012 | 59.0 | 58.5 | 275 | -8.1 | 284 | 11 | 05-07 | 09-28 | 10-09 | 11-06 |
| 2013 | 55.0 | 54.0 | 290 | -3.6 | 483 | 9 | 05-19 | 10-06 | 10-26 | 10-29 |
| 2014 | 51.0 | 50.5 | 290 | -4.2 | 291 | 9 | 05-13 | 09-18 | 10-21 | 11-08 |
| 2015 | 51.0 | 50.5 | 320 | +5.1 | 295 | 8 | 04-24 | 09-26 | 10-18 | 10-19 |
| 2016 | 47.0 | 46.5 | 325 | +6.1 | 386 | 12 | 05-16 | 09-30 | 10-15 | 11-07 |
| 2017 | 48.0 | 47.5 | 320 | +3.9 | 237 | 8 | 04-25 | 09-30 | 11-05 | 11-08 |
| 2018 | 49.0 | 48.5 | 310 | +0.0 | 234 | 25 | 05-19 | 09-24 | 09-24 | 10-19 |
| 2019 | 52.0 | 51.5 | 325 | +4.3 | 201 | 11 | 05-28 | 09-18 | 10-27 | 11-08 |
| 2020 | 51.0 | 50.8 | 265 | -15.5 | 157 | 25 | 06-02 | 09-18 | 09-21 | 10-30 |
| 2021 | 54.0 | 53.3 | 345 | +9.5 | 224 | 13 | 05-28 | 10-25 | 11-04 | 11-05 |
| 2022 | 52.0 | 51.9 | 355 | +12.0 | 317 | 10 | 05-09 | 09-30 | 10-03 | 11-15 |
| 2023 | 53.0 | 52.5 | 320 | +0.4 | 371 | 13 | 05-23 | 10-23 | 10-31 | 11-01 |
| 2024 | 54.0 | 53.9 | 340 | +6.1 | 333 | 18 | 05-10 | 10-09 | 10-17 | 10-29 |
| 2025 | 52.0 | 51.9 | 330 | +2.4 | 260 | 11 | 05-01 | 09-21 | 10-10 | 11-14 |

Means for 1973 to 2025: Jun–Aug precipitation 297 mm (median 283 mm, about 11.1 in); 10.0 days ≥ 85°F per season. Big gaps between planted and harvested acres (1976 to 1977, 1980, 1984, 1990, 2011) mark seasons with abandoned acreage. The cause is weather in 2011. For the other years it is undocumented in what I read, and may be economic.

---

## 2. Parameter table

| # | Name | Value | Unit | Source |
|---|---|---|---|---|
| 1 | Planting soil-temperature threshold | 50 (10) | °F (°C), mean of daily high and low at 6 in | UMaine Extension soil-temp page; Johnson in WAGM 2021; #2419 |
| 2 | Minimum soil temperature for cut seed | 45 | °F | NE Vegetable Management Guide |
| 3 | Air proxy for soil ready (INVENTED) | 10-day mean Tair ≥ 10.0 (median May 13) | °C | DERIVED, GHCN Caribou |
| 4 | Usual planting begin / most active / end | May 9–10 / May 14–Jun 3 / Jun 9–10 | date | NASS Ag Handbook 628 (1997, 2010) |
| 5 | Planting 50% date | about May 15, range May 10–26 (2008–13 years); May 26–28 (recent 5-yr averages) | date | NASS NE bulletin 2013; NASS weekly 2023–24 |
| 6 | Emergence 50% date | Jun 16–18 (5-yr averages) | date | NASS weekly 2023–24 |
| 7 | Seed-piece size | 1.5–2.0 (Russet 2.0–2.5) | oz | UMaine #2412 |
| 8 | Seed curing | 6–10 d at 38–40°F, 85–95% RH | d, °F, % | UMaine #2412 |
| 9 | Precut lead time | young ≤ 1–2 mo; middle 1–2 wk; old a few days | time | UMaine #2412 |
| 10 | Row spacing | 34–36 | in | UMaine #2412, #2419 |
| 11 | In-row spacing | 7–12 (russet 12–16) | in | UMaine #2412; NE Guide |
| 12 | Harvested hills per acre | russet about 9,600–10,000; white about 11,800–13,800 | hills/acre | NASS NE bulletin 2013 |
| 13 | Planting depth | 2–4 | in | NE Guide |
| 14 | Hilling window | from emergence or 6 in height to 10 in or half-row cover; up to 3 passes | in, passes | UMaine #2419; NE Guide |
| 15 | Canopy closure | 30–45 | days after planting | UMaine #2419 |
| 16 | Scouting cadence | weekly; alerts twice weekly | 1/week | NE IPM Center 2021; UMaine IPM page |
| 17 | Blight first spray | 18 cumulative SV after 50% emergence | SV | UMaine #2418 |
| 18 | Blight spray interval | 5 / 7 / 10 / 12 / 14 d by 7-day SV and rain | days | UMaine NoBlight page |
| 19 | Irrigated share | 0% (1959); 11.8% (1997); about 25% (2022) | % of acres | SB 346; MPB industry study; Climate Central 2022 |
| 20 | Irrigation yield gain (trials) | +49 cwt/ac average; 4% (wet 1992) to 37% (dry 1995) | cwt/acre, % | UMaine #2439 |
| 21 | Vine kill to harvest | 14–21 (prefer 21) | days | UMaine #2417, #2419; NE Guide |
| 22 | Seed vine kill | August | month | Maine Potato Board 2025 testimony citing DACF Ch. 252 |
| 23 | Usual harvest begin / most active / end | Sep 6–7 / Sep 20–Oct 10 / Oct 17–19 | date | NASS Ag Handbook 628 |
| 24 | Harvest pulp temperature | 45–65 | °F | UMaine #2417 |
| 25 | Harvest night minimum wanted | > 35 | °F | Maine Potato Board (Flannery) 2019 |
| 26 | Harvest break | 2–3 weeks, late Sep to mid Oct (1 week at RSU 39 from 2025) | weeks | BDN 2020, 2024; CS Monitor 1984 |
| 27 | Median last spring ≤ 32°F / first fall ≤ 32°F, Caribou | May 13 / Sep 24 (NCEI strict: May 7 / Oct 1) | date | DERIVED GHCN; NCEI normals |
| 28 | Median first fall ≤ 28°F / ≤ 24°F | Oct 12 / Oct 30 | date | DERIVED GHCN; NCEI normals |
| 29 | Hard-freeze definition | ≤ 28 | °F | NWS glossary |
| 30 | Tuber kill in soil | −1.4 to −1.9 (hydrated); extensive death ≤ −2.8 at tuber depth | °C | Boydston et al. 2006 via USDA-ARS summary |
| 31 | Workability, IFSM loam | spring 0.94 / 0.96 FC; fall harvest 1.04 / 1.02 FC | fraction of field capacity | IFSM Reference Manual Table 5.1 |
| 32 | Days suitable, observed | 5.3 (4–7) | days/week | NASS NE weekly 2023–24 |
| 33 | Workable-day rain rule (INVENTED) | ≥ 0.25 in today / ≥ 0.5 in yesterday / ≥ 1.0 in two days ago blocks the day | in | calibrated to #32 on GHCN |
| 34 | Labor, Maine 1959 | preharvest 23; hand-pick harvest 44; machine harvest 20; total 66 | man-h/acre | USDA SB 346 Table 21 |
| 35 | Labor, U.S. 1910–14 | 76.0 | man-h/acre | USDA SB 346 Table 2 |
| 36 | Machine time, modern | plant 0.27; hill 0.17; spray 0.19; vine kill 0.17; dig 0.84 | h/acre | UC Davis 2023 Klamath study |
| 37 | Potato harvester (ASABE) | 2.5 mph, 60% efficiency (1.5–4.0, 55–70) | mph, % | MSU P3543 citing ASABE D497 |
| 38 | Hand picker output, 1984 | 20–30 | barrels (165 lb) per day | CS Monitor 1984 |
| 39 | Barrel / bushel | 165 / 60 | lb | Maine R.S. 1954 c. 32-A §42 |
| 40 | Yield trend 1973–2025 | −3291.9 + 1.785 × year; SD 20 | cwt/acre | DERIVED from NASS |

---

## 3. Sources (URL and what I read there)

### Primary data downloaded and computed on

- **NOAA NCEI GHCN-Daily, Caribou WFO (USW00014607).** https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00014607.csv
  - I used daily TMAX, TMIN and PRCP for 1973 to 2025; no year had fewer than 360 Tmin days.
  - Computed from it: frost statistics (1.2), the soil-proxy date, the workable-day test, and the Jun–Aug rain, hot-day and frost columns in 1.8.
  - Check against an independent source: the 2024 first freeze, Oct 9, matches NWS Caribou's 2024 summary. 1995's Jun–Aug total of 143 mm (5.63 in) matches the NWS "5.6 inches".
- **NOAA NCEI 1991–2020 annual/seasonal normals, USW00014607.** https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/access/USW00014607.csv. I read fields ANN-TMIN-PRBLST/PRBFST/PRBGSL for T24, T28 and T32 at FP10 to FP90.
- **USDA NASS, Usual Planting and Harvesting Dates for U.S. Field Crops, Dec 1997 (Ag Handbook 628).**
  - URL: https://esmis.nal.usda.gov/sites/default/release-files/vm40xr56k/9p290c614/j9602330g/planting-12-05-1997.html
  - Maine table, potatoes: planting May 10 / May 18–May 29 / Jun 10; harvest Sep 7 / Sep 21–Oct 7 / Oct 19.
  - Definition: "Beginning dates indicate when planting or harvesting is about 5 percent complete and ending dates when operations are about 95 percent complete."
- **USDA NASS, same title, Oct 2010.**
  - URL: https://esmis.nal.usda.gov/sites/default/release-files/vm40xr56k/dv13zw65p/w9505297d/planting-10-29-2010.pdf
  - New England table, "Potatoes, fall – Maine 55.5 [k acres] May 9, May 14 - Jun 3, Jun 9, Sep 6, Sep 20 - Oct 10, Oct 17". The "most active" range is 15 to 85%. The dates rest on 20 years of crop progress data.
- **USDA NASS New England Crop Progress & Condition, weekly.** https://www.nass.usda.gov/sites/default/files/Statistics_by_State/New_England_includes/Publications/Crop_Progress_&_Condition/2024/NECW_MMDD.pdf, with the same pattern for 2023 and 2025.
  - Weeks read in 2024: 05/05 to 06/16 and 09/15 to 10/20.
  - Weeks read in 2023: 05/07 to 06/25 and 08/27 to 10/22.
  - Week read in 2025: 05/25.
  - I read the "POTATOES (ME): PLANTED / EMERGED / BLOOMING / HARVESTED" rows (this week, last week, last year, 5-year average) and the "there were N days suitable for fieldwork" lines.
  - Later 2025 weeks returned 404, which suggests the series stopped after May 2025.
- **USDA NASS New England Crop Weather, Sep 6, 2011.**
  - URL: https://www.nass.usda.gov/Statistics_by_State/New_England_includes/Publications/Crop_Progress_&_Condition/2011/weath20110905.pdf
  - Maine potatoes harvested <5% (5-yr average 5%). Quote: "most potato growers in Maine were applying vine killing applications". The Aroostook reporter comments on saturated ground after Irene.
- **NASS New England Agricultural Statistics 2013, Fall Potatoes.**
  - URL: https://www.nass.usda.gov/sites/default/files/Statistics_by_State/New_England_includes/Publications/Annual_Statistical_Bulletin/2013/fallpots2013.pdf
  - Used: the weekly planting progress table 2008–2013, variety shares, hills per acre by type 2009–2013, and grade and size tables.
- **NASS Maine Potato Report, Feb 2023.** https://www.nass.usda.gov/sites/default/files/Statistics_by_State/New_England_includes/Publications/Maine-Potatoes.pdf. Used the 2013–2022 acreage, yield and production table.
- **NASS final-estimate bulletins** (Maine rows read), all under https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/:
  - 1969–75: `bc386p63z/12579x518/potatosweetest_Potatoes_and_Sweetpotatoes__1969-75.pdf`
  - 1974–78: `2801pm37k/0r967771w/...1974-78.pdf`
  - 1978–82 and preliminary 1983: `6d5701940/6682x8290/...1978-82__Preliminary_1983.pdf`
  - 1987–92: `2v23vz553/r781wm69b/..._1987-92.txt`
  - SB 962 (1992–97): `nk322j65w/st74cv497/sb962.txt`
  - SB 998 (1997–2002): `6t053m16p/pg15bk04s/sb998.txt`
  - SB 1015 (2003–07): `dz010v35r/ng451n87p/sb1015.txt`
  - SB 1047 (2008–12): `fn1072862/hh63t088v/sb1047.txt`
- **NASS Potatoes & Sweetpotatoes, Sep 1985 (scanned).** https://esmis.nal.usda.gov/sites/default/release-files/0k225b04p/q811kn460/w3763959q/PotaSwee-09-27-1985.pdf. Page 5 read as an image: Maine 1983 95.0/94.0/240; 1984 94.0/89.0/240.
- **NASS Annual Crop Summary, Jan 1987 (scanned).** https://esmis.nal.usda.gov/sites/default/release-files/k3569432s/hd76s376t/cr56n463m/CropProdSu-01-00-1987.pdf. Pages A-53 and A-54 read as images: Maine 1985 100.0/99.0/285; 1986 85.0/84.0/250.
- **NASS Potatoes annual summaries.**
  - Sep 2024: https://esmis.nal.usda.gov/sites/default/release-files/fx719m44h/6q184c88z/2v23xm764/pots0924.txt (2021–2023 and type shares).
  - Sep 2025: …/wh248r00m/b2775v872/pots0925.txt (2024).
  - Sep 2026: https://esmis.nal.usda.gov/sites/default/release-files/796078/pots0926.txt (2025).
- **USDA Statistical Bulletin 122, Potatoes 1866–1950.** https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/bv73c459m/rv042z579/potatosweetest_Potatoes__1866-1950.pdf. Read the OCR text of the Maine table, 1909–1950: 1946 at 219k acres and 358 bu; 1947 at 186k acres and $94,395k.
- **USDA ERS Statistical Bulletin 346, Labor Used to Produce Field Crops (1964).** https://ageconsearch.umn.edu/record/153771/files/sb346.pdf
  - Table 2: U.S. potato man-hours per acre, 1910–63.
  - Table 21: Maine 1959, preharvest 23, harvest hand 44, machine 20, all 43, total 66, yield 243 cwt, irrigated 0%.
  - Text p. 7: Idaho hand 38 and machine 11.

### Extension, government and technical documents opened

- **UMaine Bulletin #2418, Late Blight Prediction in Maine (Johnson).** https://extension.umaine.edu/publications/2418e/. SV table, the 18-SV start rule, the interval table, and the "not on a calendar" quote.
- **UMaine NoBlight model explanation.** https://extension.umaine.edu/ipm/insect-lab/noblight-model-explanation/. Start at 18 DSV after emergence; 5/7/10/12/14-day maximum intervals.
- **UMaine Bulletin #2412, Selecting, Cutting and Handling Potato Seed.** https://extension.umaine.edu/publications/2412e/. Full HTML read: precut table, seed sizes, curing, re-warming, seed-per-acre tables for 34 and 36 in rows.
- **UMaine Bulletin #2419, Producing Potatoes Organically in Maine.** https://extension.umaine.edu/publications/2419e/. 50°F planting; spacing 8–18 × 34–36 in; hilling at 6 in, up to 3 passes, done by 10 in; canopy closes in 30–45 d; slash vines 14–21 d before harvest; storage 38°F and 95% RH.
- **UMaine Bulletin #2439, Irrigating Potatoes in Maine.** https://extension.umaine.edu/publications/2439e/. +49 cwt/acre; rain-versus-response by year (1992–2003); 2–4 in per season; PAW triggers.
- **UMaine Bulletin #2417, Protecting Potato Tubers from Late Blight (Ozturk, 2024).** https://extension.umaine.edu/publications/2417e/. Harvest at least 2 (preferably 3) weeks after vine death; pulp 45–65°F; curing at 50°F.
- **UMaine soil temperatures at 6 in, Presque Isle.** https://extension.umaine.edu/potatoes/weather/soil-temps-six-inches-presque-isle/. Quote: "Average of 50 degrees … recommended temperature for planting".
- **UMaine Potato IPM page.** https://extension.umaine.edu/potatoes/ipm/. Reports "normally posted twice per week".
- **Northeast IPM Center, Maine IPM Report 2021.** https://www.northeastipm.org/partners-in-ipm/regional-partners/neera/maine-ipm-report-2021/. "surveyed 30 potato fields on a weekly basis during 2020"; tower traps May to September.
- **UMaine Aroostook Farm centennial timeline.** https://umaine.edu/aroostookfarm/home/aroostook-farm-centennial/. 1913 purchase with a concrete potato house; Katahdin grown 1923 and released 1932; Atlantic 1976.
- **New England Vegetable Management Guide, Potato.** https://nevegetable.org/crops/potato. Planting soil 50–60°F, not below 45°F; in-row spacing by cultivar; depth 2–4 in; hilling window; vine kill about 21 d; harvest temperatures.
- **USDA-ARS Integrated Farm System Model Reference Manual.** https://www.ars.usda.gov/ARSUserFiles/80700000/ifsmreference.pdf. Suitable Days section (pp. 47–49) and Table 5.1 tractability coefficients (p. 53).
- **Mississippi State Extension P3543, Farm Machinery Cost Calculations.** https://extension.msstate.edu/sites/default/files/publications/P3543_web.pdf. Table 2 machine performance factors (ASABE 2011) and the field-capacity formula.
- **UC Davis, 2023 Sample Costs to Produce Potatoes, Fresh Market, Klamath Basin.** https://coststudyfiles.ucdavis.edu/2024/05/10/23PotatoFreshMktKlamath-Final.pdf. Table 1 hours per acre by operation; labor at 1.2 × machine time.
- **USDA-ARS Prosser potato accomplishments.** https://www.ars.usda.gov/ARSUserFiles/20960000/PDF/potatoaccomp.pdf. Summary of Boydston et al. 2006 on tuber freezing in soil.
- **NWS glossary, hard freeze.** https://forecast.weather.gov/glossary.php?word=hard%20freeze
- **NWS Caribou, 2024 Annual Climate Summary.** https://www.weather.gov/car/2024ClimateSummary. First freeze Oct 9; second-driest September.
- **Maine Revised Statutes 1954, c. 32-A §42.** http://lldc.mainelegislature.org/Open/RS/RS1954/RS1954_c032A_s57.pdf. Text layer extracted: barrel 165 lb, bushel 60 lb.
- **36 MRSA §4603 (Maine Potato Board) and §4605 (potato tax).**
  - https://legislature.maine.gov/legis/statutes/36/title36sec4603.html
  - https://www.legislature.maine.gov/legis/statutes/36/title36sec4605.html
- **Maine Potato Board, industry study (Planning Decisions, about 2003).** https://www.mainepotatoes.com/wp-content/uploads/2020/11/StudyInd.pdf. Irrigation 1978–1997 (Table 6); fresh versus processing split in 1992 and 2001; the late-blight shrink footnote.
- **Maine Potato Board, 2008 cost study.** https://www.mainepotatoes.com/wp-content/uploads/2020/11/Potato-Cost-Study-08-Final-Report.pdf. Gives labor cost in $/acre only, no hours, so it was not used for hours.
- **Maine Seed Potato Certification 2019 book.** https://www.mainepotatoes.com/wp-content/uploads/2019/11/2019SeedPotatoCert.pdf. Program description; no vine-kill dates.
- **Maine Potato Board testimony to the Judiciary Committee, Apr 28 2025 (Tapley).** https://legislature.maine.gov/testimony/resources/JUD20250428Tapley133912251587223080.pdf. Inspection schedule: July/August inspections "before top kill (August)", harvest Sep/Oct.
- **CFTC, History of the CFTC, 1970s.** https://www.cftc.gov/About/HistoryoftheCFTC/history_1970s.html. May 25 1976 default.
- **McCain timeline.** https://www.mccain.com/about-us/our-history/timeline/. Washburn 1975; Easton 1976.
- **USDA Farmers' Bulletin 847 (Stuart 1917, rev. 1933), as reproduced.** https://smallfarmersjournal.com/potato-storage-and-storage-houses/

### News and features opened (used only for events, quotes and local practice)

- **BDN, Aug 3 2020**, harvest break: https://www.bangordailynews.com/2020/08/03/aroostook/some-consider-aroostook-countys-long-tradition-of-harvest-break-unnecessary-but-farmers-say-they-need-it/
- **BDN, Dec 13 2024**, RSU 39 one-week break: https://www.bangordailynews.com/2024/12/13/aroostook/aroostook-education/aroostook-school-district-1-week-harvest-break-joam40zk0w/
- **BDN, Aug 23 2020**, dry weather; NWS quotes on 1995 and 2020 rain; irrigation "nearly a third": https://www.bangordailynews.com/2020/08/23/aroostook/dry-weather-dusty-fields-growing-concerns-in-potato-country/
- **BDN, Sep 28 2020**, drought harvest; harvest began Sep 14 on one farm: https://www.bangordailynews.com/2020/09/28/aroostook/how-historic-drought-affects-potato-harvest-in-aroostook-county/
- **BDN, Feb 27 2022**, acreage 186k (1947) versus 58k (2021); Idaho overtook Maine in 1957; processing about 64%: https://www.bangordailynews.com/2022/02/27/aroostook/farming-smarter-is-keeping-maines-potato-industry-alive/
- **BDN, Jul 7 2025**, Blossom Festival: https://www.bangordailynews.com/2025/07/07/aroostook/fort-fairfield-expects-thousands-78th-maine-potato-blossom-festival-joam40zk0w/
- **BDN, Jul 1 2009**, "Crops in crisis": https://www.bangordailynews.com/2009/07/01/news/state-news/crops-in-crisis/
- **Maine Public, Oct 5 2020**, 2020 losses: https://www.mainepublic.org/business-and-economy/2020-10-05/some-aroostook-county-potato-farmers-expecting-lower-yields
- **Maine Public, Nov 25 2025**, 2025 drought designation: https://www.mainepublic.org/climate/2025-11-25/the-usda-declares-maine-drought-a-natural-disaster
- **Climate Central, May 11 2022**, about 25% irrigated: https://www.climatecentral.org/partnership-journalism/the-looming-threat-for-maines-iconic-potato-industry
- **The County.**
  - Aug 25 2009, history: https://thecounty.me/2009/08/25/living/a-history-of-potatoes-in-aroostook-county/
  - Oct 5 2019, harvest conditions: https://thecounty.me/2019/10/05/news/business-news/aroostook-potato-harvest-still-on-schedule-despite-bout-of-cool-rainy-weather/
  - Sep 23 2023, wet fields: https://thecounty.me/2023/09/23/news/wet-fields-jeopardize-some-of-aroostooks-multimillion-dollar-potato-crop/
  - Nov 15 2023, 2023 yields: https://thecounty.me/2023/11/15/agriculture/aroostook-farmers-report-good-potato-yield-despite-wet-season/
- **Portland Press Herald, Nov 16 2014**, barrel and Harding: https://www.pressherald.com/2014/11/16/pie-for-breakfast-from-songs-to-ammunition-spuds-loom-large-in-maine-history/
- **Christian Science Monitor, Sep 27 1984**, picking recess: https://www.csmonitor.com/1984/0927/092750.html
- **WAGM, May 13 2021**, Johnson on soil temperature: https://www.wagmtv.com/2021/05/13/importance-of-soil-temperature-when-planting/

### Could not open (blocked, 403 or 404)

- **Springer, *Climatic Change* (2025), "Past and future changes in potato production vulnerabilities in Maine".** https://link.springer.com/article/10.1007/s10584-025-03977-6. Redirected to a login. It would be the best single paper for the yield–weather link and should be read by whoever validates the crop model.
- **Springer, Boydston et al. 2006.** I used the USDA-ARS summary instead.
- **MDPI *Sustainability* 2022, "Back to the Future: Agricultural Booms, Busts…"** Returned 403.
- **Maine Memory Network, potato house record 116472.** Returned 403.
- **Old NASS text files under nass.usda.gov/nh/.** Returned 404.
- **NASS Quick Stats.** Not used, because it requires an API key.

---

## 4. Unconfirmed items and gaps

1. **Fork-digging labor with no machine digger.** No source found. The 30 s/hill starting value in 1.4 is INVENTED.
2. **Per-operation labor before 1959.** I found only the U.S. all-operations totals (76 man-h/acre in 1910–14). The split between planting, hilling and spraying in the horse era is unconfirmed.
3. **Typical vine-kill dates for tablestock and processing fields.** Only "early September" (NASS 2011) and "August" for seed are sourced. No multi-year vine-kill progress series exists in the NASS reports I read.
4. **Freezing point of exposed tubers (30.5–30.9°F).** From search snippets of UC Davis Postharvest and UMaine #4135 (citing USDA Handbook 66). Neither page was opened.
5. **The air ≤ 24°F proxy for tubers freezing in the hill** is INVENTED. Replace it with a soil-temperature model if one exists.
6. **Workable-day rain rule** is INVENTED. It was calibrated only against New England-wide weekly days-suitable for 30 weeks in 2023–24 (r = 0.34). Maine-only weekly days-suitable exist in the national Crop Progress reports and in Quick Stats (needs an API key) and would give a better fit.
7. **Cause of the low 1973 yield (210 cwt).** Not documented in what I read. The early hard freeze on Sep 22 is a candidate, not a finding. The causes of the 1984 and 1990 abandoned acreage (5,000 acres each) are also not documented.
8. **1985–86 yields** come from the January 1987 Annual Crop Summary, a near-final estimate. I did not find a 1982–86 final-estimate bulletin, so later revisions may differ by a few cwt.
9. **2009 and 2011 late-blight notes and the 2024–25 five-day spray advice:**
   - 2011: BDN Aug 11 2011, seen only as a search-result summary.
   - 2024 and 2025: BDN and Maine Public articles, seen only as search-result summaries.
   - 2009: the July 1 2009 BDN article was opened.
10. **1891 law setting the 165-lb barrel.** Sourced only to The County's 2009 local-history piece. The 1954 statute confirms the 165-lb value, not the 1891 date. The 1915 Legislative Record PDF was not opened.
11. **"Largest default in U.S. futures history" (1976)** comes from a Congressional Record search summary I did not open. The CFTC page confirms only the date and the default.
12. **Birds Eye frozen fries at Caribou in 1947** appeared in a search snippet from the Aroostook chamber site. Not opened, and not used above.
13. **Hilling timing for conventional Aroostook growers.** The only explicit UMaine timing is in the organic bulletin #2419. A Spudman article (search snippet only) describes drag-off before emergence and hilling at or after emergence, with 3 to 4 weeks from planting to emergence.
14. **Hours per operation for modern Maine farms.** I used a 2023 UC Davis Klamath Basin budget, a comparable cool northern system but irrigated and not in Maine. No Maine budget with hours was found; the Maine Potato Board's 2008 cost study gives dollars only.
