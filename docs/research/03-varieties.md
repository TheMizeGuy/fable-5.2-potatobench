# 03 · Potato varieties grown in Maine, 1973–2025

Research slice for "The County". The report covers 13 cultivars: Katahdin, Kennebec, Superior, Russet Burbank, Atlantic, Green Mountain, Irish Cobbler, Yukon Gold, Shepody, Caribou Russet, Norland / Red Norland / Dark Red Norland, Snowden and Chieftain. For each it gives the published traits, the numbers a daily-step simulation can use, and a recommended six-variety roster.

How to read the evidence tags used throughout:

| Tag | Meaning |
|---|---|
| **[S]** | Sourced: I opened the source and read the value (URL and quote or table given). |
| **[S-sum]** | Seen only in a search-engine summary of the source; the page itself would not open. Treat as likely but unverified. |
| **[D]** | Derived: plain arithmetic on [S] numbers (the arithmetic is shown). |
| **[INV]** | Invented: a game calibration choice. It is anchored to a qualitative source where one exists, but the number itself is mine. |
| **[UNC]** | Unconfirmed, from memory. Never present as sourced. |

Short source keys such as `CFIA-Kennebec` or `PSU2018` are expanded with full URLs in section 3.

---

## 1. What the simulation should implement

### 1.1 Variety record

Each variety is one record. All multipliers are relative, with Atlantic = 1.00 for disease indices and Russet Burbank = 1.00 for yield, so the crop, disease and storage models from the other research slices keep their own absolute scales and the variety only scales them.

```
Variety {
  id, name, skin, flesh, shape, marketClasses[]      // tablestock-white | tablestock-red | yellow | russet-baker | chip | fry | seed
  releaseYear, availableFromSeason                   // era lock (1.10)
  maturityDays                                       // planting -> natural vine senescence (1.2)
  bulkT50, bulkSlope                                 // logistic bulking curve (1.2)
  yieldIndex, us1Frac                                // vs Russet Burbank (1.3)
  setClass, spacingIn                                // tuber number and size (1.4)
  sgBase                                             // specific gravity at harvest (1.5)
  lbFoliar, lbTuber, scab, earlyBlight, vertSus      // disease multipliers (1.6)
  pvySus, pvySymptom, plrvNetNecrosis                // virus (1.7)
  hhBase, secondGrowth, ihnSus, greening, bruise     // defects (1.8)
  droughtSens                                        // (1.9)
  dormancy45F, storeQuality, chipStorageDays         // storage (1.11)
}
```

### 1.2 Maturity and bulking

**Maturity classes.** The Canadian Food Inspection Agency defines five maturity classes [S] (CFIA-MAT: "Very early: 65 to 70 days", "Early: 70 to 90 days", "Mid-season: 90 to 110 days", "Late: 110 to 130 days", "Very late: 130 days and more"). The page does not say whether the count starts at planting or at emergence. I treat it as days after planting (DAP), because the North American variety patents use DAP for "Maturity Class" [S-sum].

`maturityDays` is the day natural vine senescence ends tuber growth. After that day, yield stops rising, skin set starts and the vines die.

**Aroostook reality check.** In a 2017 trial at Aroostook Research Farm the crop was "planted on May 23, vinekilled on September 15 (115 days after planting), and harvested on October 4" [S] (MPB-N2017, p. 4). A second trial was planted June 1 and vine-killed September 22, at 113 DAP [S]. Commercial Aroostook seasons therefore end around 110–120 DAP by vine kill or frost. Very late varieties such as Russet Burbank (late to very late, about 135 days) normally do not reach natural maturity in Maine, so the vine-kill decision matters for them.

**Bulking curve.** Michigan State's dates-of-harvest study is the only source I found that dug the same varieties at three dates: 90–100, 110–120 and 130–140 DAP, on irrigated plots planted from about May 5 [S] (MSU-E2222, Tables 3–4). The fraction of the final total yield reached at each dig is:

| Variety | Total cwt/A at 90–100 / 110–120 / 130–140 DAP [S] | Fraction of max at ~95 / ~115 DAP [D] |
|---|---|---|
| Superior | 338 / 329 / 343 | 0.99 / 0.96 (plateaued by 95 DAP) |
| Yukon Gold | 339 / 383 / 396 | 0.86 / 0.97 |
| Atlantic | 390 / 476 / 474 | 0.82 / 1.00 |
| Snowden | 370 / – / 494 | 0.75 / – |
| Russet Burbank | 341 / 433 / 456 | 0.75 / 0.95 |
| Shepody | 286 / 472 / 465 | 0.61 / 1.00 |

MSU says of these data: "Russet Burbank did not increase in U.S. No. 1 yield from mid-season to late harvest, but it is still considered late-maturing" [S].

Suggested rule (logistic, in DAP):

```
bulkFrac(t) = 1 / (1 + exp(-(t - bulkT50) / bulkSlope))     // 0..1, multiply into potential tuber yield
growth stops at t = maturityDays, or at vine kill or killing frost
```

Fitting the logistic through two MSU points per variety [D] gives:

| Variety | bulkT50 (DAP) | bulkSlope (d) | Fit points |
|---|---|---|---|
| Russet Burbank | 83 | 10.8 | 0.75 @ 95, 0.95 @ 115 |
| Atlantic | 85 | 6.5 | 0.82 @ 95, 0.99 @ 115 |
| Yukon Gold | 73 | 12.5 | 0.86 @ 95, 0.97 @ 115 |
| Shepody | 93 | 4.8 | 0.61 @ 95, 0.99 @ 115 |
| Snowden | 82.5 | 11.4 | 0.75 @ 95, 0.99 @ 135 |
| Superior | ≤70 **[INV]** | 7 **[INV]** | only satisfies 0.98 @ 95 |

These fits are Michigan calendar days. If the crop model runs on thermal time, keep the shape and convert. Varieties without MSU data take class defaults **[INV]**: early t50 65, slope 7; mid 75, slope 10; mid-late 83, slope 8; late 85, slope 11; very late 85, slope 11.

### 1.3 Yield potential and US No. 1 fraction

```
totalYield = sitePotential * yieldIndex[v] * bulkFrac(t_end) * (stress, disease and spacing modifiers from other slices)
us1Yield   = totalYield * us1Frac[v] * (1 - defect losses from 1.8)
```

Maine anchors:

- In Maine trials, Caribou Russet (as AF3362-1) "Total yields ... averaging 354 cwt/A (109% of Russet Burbank)" and "US#1 yields averaged 327 cwt/A (126% of Russet Burbank)" [S] (NE1231).
  - Russet Burbank in the same Maine trials is therefore ≈ 354 / 1.09 ≈ 325 cwt/A total and ≈ 327 / 1.26 ≈ 260 cwt/A US#1 [D].
- Sebec averaged "365 cwt/A (105% of Atlantic)" with US#1 "310 cwt/A (107% of Atlantic)" [S] (NE1231). Atlantic in Maine trials is therefore ≈ 348 cwt/A total and ≈ 290 cwt/A US#1 [D].
- The release article for Caribou Russet states: "US#1 yields have averaged 130% of Russet Burbank in side-by-side trials" and "122% those of the fresh market standard, Russet Norkotah" [S] (MPB-CR).
- 2017 was a dry year at Presque Isle, with no irrigation and "Only 1.84 inches of rain ... in July". That year Russet Burbank made 257 cwt/A total and 218 US#1; Caribou Russet made 303 total and 296 US#1 [S] (MPB-N2017, Table 1).

`yieldIndex` (full-season total, Russet Burbank = 1.00) and `us1Frac` (US No. 1 share of total, unstressed) per variety are in Table 2B. Sections 2 and 3 give the derivation for each.

### 1.4 Tuber set, size and spacing

Published spacing advice and tuber-set notes encode the tuber-number differences directly:

- Kennebec "needs close spacing of 15 to 20 cm and vine killing, otherwise tubers may become oversized and rough" [S] (CFIA-Kennebec).
- Russet Burbank: "For large tubers, plants should be spaced 30 to 45 cm apart" [S] (CFIA-RussetBurbank).
- Snowden: close spacing gives "a large number of smaller tubers", so the recommended spacing is "30 to 38 cm (12 to 15 inches)" [S] (CFIA-Snowden). MSU: "It is a heavy setter and prefers a wider spacing" [S].
- Caribou Russet was "spaced at 10 inches to compensate for its lower tuber set" while Russet Burbank was at 16 in. [S] (MPB-N2017).
- Atlantic: "good tuber set and uniform tuber size". Close spacing and moderate fertilization avoid oversized tubers, which "might have hollow heart" [S] (CFIA-Atlantic).
- Chieftain: "Undersizing can be a problem" when soil moisture is short [S] (CFIA-Chieftain).
- Superior: "Tubers size early" with a "uniform size" [S] (CFIA-Superior).

Suggested rule **[INV]**:

```
tubersPerHill = setBase[setClass] * (spacingIn / spacingRef[v])^0.5
    setBase: few 6, few-medium 7, medium 9, many 12      // ECPD "Tubers per plant" classes; the numbers are invented
meanTuberOz = hillYieldOz / tubersPerHill
oversizeFrac rises steeply once meanTuberOz exceeds about 10 oz   // 10 oz is MSU's long-type grade break [S]
```

### 1.5 Specific gravity

`sgBase[v]` (Table 2B) is the harvest specific gravity under normal nitrogen. Management modifiers from Maine 2017:

- Nitrogen. Averaged over three varieties, specific gravity fell from 1.091 at 0 lb N/A to 1.084 at 300 lb N/A while total yield rose from 133 to 303 cwt/A [S] (MPB-N2017, Table 1). That is about −0.0023 per 100 lb N/A [D].
- Potash. The high potash rate gave "a 27 cwt/A yield ... increase" and lowered specific gravity "by 0.002" [S] (MPB-N2017).

Use classes and dry matter come from MSU Table 1 [S] (MSU-E2222):

| Specific gravity | Total solids % | MSU "best use" |
|---|---|---|
| < 1.060 | < 15.9 | salads, canning |
| 1.061–1.070 | 16.0–18.1 | pan fry, boil |
| 1.071–1.080 | 18.1–20.2 | boilers, mashers, fair chips |
| 1.081–1.090 | 20.2–22.3 | "Good bakers, chippers, french fries" |
| > 1.090 | > 22.3 | bakers, fries, chips (brittle chips, sloughing) |

`dryMatterPct = 24.182 + 211.04 * (SG - 1.0988)` reproduces MSU's 1.060 → 15.9 % and 1.090 → 22.3 %. The formula itself is the von Scheele relation, which I quote from memory **[UNC]**; MSU's table is the sourced check.

### 1.6 Fungal and bacterial disease multipliers

**Late blight, foliage.** This is the only same-trial, same-pathogen ranking I found for 11 of the 13 varieties. Penn State 2018 inoculated with "a mixture of four isolates of *Phytophthora infestans* clonal lineage US-23", used Atlantic as the susceptible spreader row, and expressed severity as AUDPC [S] (PSU2018, p. 41). "Kennebec was the moderately resistant check", and LSD = 159 [S].

```
lbFoliar[v] = AUDPC[v] / AUDPC[Atlantic]          // multiply the blight model's infection or lesion-growth rate
```

| | Kennebec | R. Burbank | Yukon Gold | Katahdin | Shepody | Atlantic | Snowden | Chieftain | D.R. Norland | Superior |
|---|---|---|---|---|---|---|---|---|---|---|
| AUDPC [S] | 240 | 353 | 440 | 465 | 467 | 504 | 518 | 559 | 579 | 697 |
| index [D] | 0.48 | 0.70 | 0.87 | 0.92 | 0.93 | 1.00 | 1.03 | 1.11 | 1.15 | 1.38 |

One LSD (159) is 0.32 index units. Kennebec is significantly more resistant than Atlantic, and Superior is in the most-susceptible statistical group.

Not in that trial:

- Caribou Russet is "SUS-23" (UMaine 1094) and susceptible to "foliar late blight" (UW-CaribouRusset). Use 1.00 **[INV]**.
- Green Mountain is "highly susceptible: late blight" (CFIA-GreenMountain). Use 1.30 **[INV]**.
- Irish Cobbler is susceptible (CFIA-IrishCobbler). Use 1.10 **[INV]**.

**Era caveat.** Older ratings reflect race-specific (R-gene) resistance that the modern lineages defeat:

- Chieftain's 1968 release paper says it "has shown immunity to the common races of late blight" [S] (AJP-Chieftain1968), but in 2018 against US-23 it scored 1.11.
- Kennebec was "highly resistant to common races (R1 gene resistance)" [S] (UW-Kennebec) and still keeps partial field resistance under US-23 (0.48).
- CFIA's "moderately resistant: late blight" for Atlantic predates US-8; UMaine now rates Atlantic "SUS-23" [S] (UMaine 1094).

For every 1973–2025 season, use the US-23-era indices above. The blight slice may want to swap in a US-1-era table for pre-1990s seasons, but I found no same-trial US-1 data.

**Late blight, tubers.** This is a separate trait: foliage and tuber resistance "are not reliably correlated" [S-sum] (Dorrance & Inglis 1997/1998). `lbTuber` multiplies the chance that blight on the foliage infects tubers (spores washed into the soil, or contact at digging). The values in Table 2B are **[INV]**, set from these qualitative ratings:

- Kennebec: the release paper claims "a high degree of resistance to late blight in both vines and tubers" [S] (AJP-Kennebec1948), and ECPD's laboratory tuber test says "High" [S]. CFIA, however, lists "tuber late blight" as susceptible [S]. Conflicting; use 0.6.
- Russet Burbank: ECPD laboratory tuber test "Very low to low" resistance [S], CFIA susceptible [S].
- Katahdin had "a significantly lower incidence of tuber blight" than foliar-resistant NY clones [S-sum] (CJPP NY trial), and its ECPD laboratory tuber rating is "Medium to high" [S].
- Medina et al. (1999) tested 12 cultivars and found US-8 "more aggressive on tuber tissue than US-1". "All cultivars except Yukon Gold developed significantly more surface necrosis from US-8" [S-sum]. Per-cultivar tuber rot of Superior 29 % / 67 %, Snowden 34 % / 46 % and Yukon Gold 15 % / 20 % (US-1 / US-8) came from a search summary only [S-sum].

**Common scab.** Penn State 2018 rated scab in a naturally infested field (severity index 0–100, LSD 6.7) [S] (PSU2018, p. 40). Russet Burbank was a tolerant check and Shepody the susceptible check.

```
scab[v] = severity[v] / severity[Atlantic]       // multiplies scab incidence and severity from the soil-pH and moisture model
```

| | R. Burbank | D.R. Norland | Superior | Atlantic | Chieftain | Snowden | Yukon Gold | Katahdin | Shepody | Kennebec |
|---|---|---|---|---|---|---|---|---|---|---|
| severity [S] | 3.7 | 4.5 | 4.9 | 7.8 | 8.5 | 8.9 | 10.3 | 11.1 | 18.2 | 19.1 |
| index [D] | 0.47 | 0.58 | 0.63 | 1.00 | 1.09 | 1.14 | 1.32 | 1.42 | 2.33 | 2.45 |

Maine's own ratings agree on direction: Russet Burbank "R", Dark Red Norland "R", Caribou Russet "MR", Atlantic "S", Snowden "S" [S] (UMaine 1094). Caribou Russet → 0.60 **[INV]**. Green Mountain and Irish Cobbler are susceptible (CFIA) → 1.40 **[INV]**.

**Early blight.** Penn State 2018 ran this trial with Dark Red Norland as the susceptible spreader, LSD 175 [S] (PSU2018, p. 42).

| | R. Burbank | Katahdin | Kennebec | Snowden | Atlantic | Yukon Gold | Shepody | Chieftain | D.R. Norland | Superior |
|---|---|---|---|---|---|---|---|---|---|---|
| AUDPC [S] | 83 | 117 | 157 | 250 | 277 | 388 | 515 | 539 | 582 | 1120 |
| index [D] | 0.30 | 0.42 | 0.57 | 0.90 | 1.00 | 1.40 | 1.86 | 1.95 | 2.10 | 4.04 |

Early blight AUDPC is partly a maturity effect, because early varieties senesce first. The disease slice should not double-count senescence.

**Verticillium wilt / early dying.**

- Highly susceptible: Kennebec, Superior, Irish Cobbler [S] (CFIA). MSU says Superior "is very susceptible to early die disease" [S].
- Susceptible: Russet Burbank, Shepody, Norland [S] (CFIA).
- Moderately resistant: Katahdin, Atlantic, Chieftain [S] (CFIA); Caribou Russet [S] (UMaine 1094).
- Resistant: Green Mountain [S] (CFIA).
- UMaine rates Dark Red Norland "MR", against CFIA's "susceptible" for Norland.

### 1.7 Viruses: PVY, leafroll and net necrosis

The game needs three separate numbers, because they drive three different decisions (seed source, scouting and roguing, and quality grading):

```
pvySus[v]      // chance an exposed plant becomes infected (aphid pressure from another slice)
pvySymptom[v]  // chance a scout sees an infected plant (0..1): drives roguing success and seed-lot latent infection
plrvNetNecrosis[v] // chance current-season leafroll causes tuber net necrosis (a grade defect, mainly for fry russets)
```

Evidence:

- **Kennebec.** CFIA lists PVA and PVY as "Field resistant" [S]. Foliar PVY symptoms are "None-Mild" across 13 isolates [S] (GW2018). Tuber net necrosis: "Resistant" [S] (CFIA).
- **Katahdin.** CFIA rates PVY "moderately resistant" [S], but symptoms are "Variable / Severe" with tuber necrosis "Yes" [S] (GW2018). The 1931 paper says resistant to "mild mosaic" but not leaf roll [S].
- **Superior.** PVX, PVY and leafroll susceptible [S] (CFIA, UW). Symptoms "Variable / Moderate-Severe" [S] (GW2018).
- **Russet Burbank.**
  - PVY "S" (CFIA), "MS" (UMaine 1094).
  - Symptoms "Moderate" [S] (GW2018). Porter: "Russet Burbank had fair to good symptom expression during 2017" [S] (MPB-2017eval).
  - Tuber net necrosis susceptible [S] (CFIA).
- **Atlantic.**
  - "Immune: tuber net necrosis, PVX" [S] (CFIA).
  - PLRV "I"; PVY "MS"; PVY-NWi tuber necrosis "Yes" [S] (UMaine 1094).
  - Symptoms "Mild-Moderate" [S] (GW2018).
- **Shepody.** PVY susceptible. It "shows poor symptoms expression of PVY", so "roguing should be done under cloudy conditions" [S] (CFIA-Shepody). Symptoms "Mild-Moderate" [S] (GW2018).
- **Yukon Gold.** "Plants are susceptible to virus Y" and only "slightly susceptible to virus leafroll" [S] (AJP-YukonGold1981). Symptoms "Severe" [S] (GW2018).
- **Snowden.**
  - PVY "MS" with PVY-NWi tuber necrosis [S] (UMaine 1094).
  - Symptoms "None-Moderate" [S] (GW2018).
  - CFIA: "very mild leaf roll symptoms", so it is hard to rogue [S].
- **Norland / Dark Red Norland.**
  - Norland: PVA highly resistant; PVX, PVY and leafroll susceptible [S] (CFIA).
  - Dark Red Norland: PVY-O "S", PVY-N-Wi and NTN "MR" [S] (UMaine 1094).
  - Red Norland symptoms "Variable" [S] (GW2018).
- **Chieftain.** PVX, PVY and leafroll susceptible [S] (CFIA). Symptoms "Variable / Severe" [S] (GW2018). Potatoes USA instead lists "Resistances: Common scab, PVY, PLRV" [S] (PUSA). The sources conflict; I follow CFIA plus the 2018 inoculation data.
- **Caribou Russet.** Susceptible to "potato leafroll virus, tuber net necrosis, and potato virus Y" [S] (UW-CaribouRusset); PVY "S" for all strains [S] (UMaine 1094).
- **Green Mountain.** Susceptible to leaf roll, tuber net necrosis, PVX and PVY [S] (CFIA). Its net-necrosis susceptibility ended its dominance in Aroostook (1.12).
- **Irish Cobbler.** PVA highly resistant; PVX, PVY and leafroll susceptible [S] (CFIA).

Numeric values in Table 2B are an **[INV]** mapping of these classes:

- `pvySus`: R 0.3, MR 0.5, MS 0.75, S 1.0.
- `pvySymptom`: None-Mild 0.2, poor expression 0.3, None-Moderate 0.4, Mild-Moderate 0.5, Moderate 0.6, Variable 0.7, Severe 0.9.

### 1.8 Tuber defects

**Hollow heart.** Maine trial incidence is the anchor [S] (NE1231):

- Atlantic: "3.5% versus 15.4% for Atlantic" (Sebec versus Atlantic).
- Russet Burbank: "2.1% versus 13.8% for Russet Burbank" (Easton versus Russet Burbank).
- Caribou Russet: "3.0% versus 13.8% for Russet Burbank".

```
P(hollow heart | tuber) = hhBase[v] * oversizeFactor(meanTuberOz) * growthSurgeFactor(rain or irrigation after water stress)
```

- `hhBase` for Atlantic 0.154, Russet Burbank 0.138 and Caribou Russet 0.030 is [S].
- Other `hhBase` values are **[INV]**, ordered by the qualitative sources:
  - Yukon Gold: "Large tubers are slightly susceptible to hollow heart" (CFIA); "Sus. to HH" (MSU).
  - Snowden "has less internal defects compared with Atlantic" (MSU).
  - Superior "not subject to internal defects" (CFIA).
  - Norland "Seldom produces tubers that are irregular... not subject to internal defects" (CFIA).
  - ECPD hollow-heart tendency: Kennebec "Medium / Low", Shepody "Low", Atlantic "High".
- Penn State's cut-tuber counts are percent of 10–12 tubers, mostly large ones, in a hot or very wet year, so they read high: Atlantic 63 %, Snowden 67 %, Yukon Gold 67 %, Katahdin 25 %, Superior 33 %, Dark Red Norland 42 %, Chieftain 17 %, Russet Burbank 83 % [S] (PSU2017, Tables 6, 8, 10). Use them for ranking only.
- Both triggers in the formula are about growth rate. The Maine potash study saw hollow heart in large tubers rise to 11.1 % under low potash plus a mid-season calcium-nitrate sidedress, against 0.0–2.5 % in other treatments [S] (MPB-N2017).

**Knobs and second growth (Russet Burbank's signature defect).** CFIA says Russet Burbank needs "a uniform moisture supply and long growing season" to avoid "knobbiness and second growth" [S]. In 2017 at Presque Isle, Russet Burbank had 14.2 % external defects (misshapes) against Caribou Russet's 2.1 % [S] (MPB-N2017). Shepody has "Good resistance to second growth" [S] (CFIA). ECPD rates secondary growth High–Medium for Russet Burbank, Low for Kennebec and Very low for Irish Cobbler [S].

Suggested rule **[INV]**: when soil water recovers sharply after a stress period during bulking, move `secondGrowth[v] × stressDays` of the US No. 1 fraction to culls.

**Internal heat necrosis.**

- Atlantic tubers are "susceptible to internal heat necrosis ... particularly in sandy soils under warm dry growing seasons" [S] (UW-Atlantic).
- Caribou Russet is "Highly susceptible to internal heat necrosis" in regions where the defect is common [S] (UW-CaribouRusset), "except for internal heat necrosis in southern areas" [S] (MPB-2017eval).

Aroostook summers rarely trigger this. Gate it on hot and dry conditions **[INV]**.

**Greening and sunburn (the hilling decision).**

- Katahdin: "Because tubers form high in the hill, the page recommends building a large hill early. A final hilling after tuber set prevents sunburn" [S] (CFIA-Katahdin, paraphrased by the fetch tool).
- Kennebec: "Tubers turn green quickly when exposed to light" [S] (CFIA-Kennebec).

Give these two a greening multiplier above 1 **[INV]**. Unhilled or eroded hills expose their tubers more often.

**Bruising and skinning (the dig-date decision).**

- Irish Cobbler is "highly susceptible to bruising" [S] (CFIA).
- Norland: skinning and bruising happen "if harvested before maturity" [S] (CFIA).
- Superior is "resistant to skinning during harvest and grading" [S] (UW).
- Snowden is "Moderately susceptible to bruising" [S] (CFIA).
- Caribou Russet has "moderate tolerance to shatter and blackspot bruising" [S] (UW).

### 1.9 Drought and heat

Ranked qualitative evidence, applied as `droughtSens[v]`, a multiplier on whatever water-stress yield penalty the crop slice computes **[INV]**:

| Variety | Evidence | droughtSens [INV] |
|---|---|---|
| Kennebec | ECPD drought resistance "High to very high / Very high" [S] | 0.8 |
| Katahdin | CFIA: widely adapted and handles drought well [S, fetch-tool paraphrase]. The 1931 release paper's summary says it is not thought suitable for regions with summer droughts [S, paraphrase]. Conflict. | 0.9 |
| Irish Cobbler | ECPD drought resistance "High" [S] | 0.9 |
| Green Mountain | "grows well in light soils" [S] (CFIA) | 0.95 |
| Superior, Yukon Gold, Shepody, Caribou Russet | no drought statement found | 1.0 |
| Atlantic | "Widely adapted but not recommended for dry sandy soils" [S] (CFIA) | 1.1 |
| Russet Burbank | needs "uniform moisture" (CFIA); "must be irrigated" for home gardens (MSU) [S]. The main effect is the shape defects in 1.8. | 1.1 |
| Snowden | "needs high levels of moisture" [S] (CFIA) | 1.15 |
| Chieftain | "Undersizing can be a problem" in dry soil [S] (CFIA) | 1.2 |
| Norland / D.R. Norland | "Sensitive to drought" [S] (CFIA, UW) | 1.3 |

### 1.10 Era availability

A variety becomes plantable from its release year. A seed build-up lag **[INV]** of 2–3 seasons with limited, pricier seed fits the record:

- Caribou Russet was released in 2015.
- National certified seed acreage was "Caribou Russet (347, 42)" in the 2017 report and "(448, 32)" in the 2018 report [S] (NE1731).
- Maine certified seed acreage reached 1,498 acres in 2024, the largest of any variety [S] (UMaine 1094).

At the start of the 1973 season, Atlantic (1976), Shepody (1980), Yukon Gold (1980/81), Snowden (1990) and Caribou Russet (2015) are not yet available.

### 1.11 Dormancy and storage

**Russet Burbank anchor.** University of Idaho storage trials over 14 years: Russet Burbank dormancy averaged "180 days at 42°F, 160 days at 45°F, and 140 days at 48°F" [S] (Olsen2013). Dormancy break was defined as "80 percent of potatoes have at least one sprout =5 mm" [S]. A patent table gives Russet Burbank "~130 days" at 48°F and "~140 days" at 45°F [S] (US6855669). Use the Idaho numbers.

```
dormancyDays[v](T_F) = dormancy45F[v] * (1 + 0.042 * (45 - T_F))   // [D]: reproduces 180/160/140 at 42/45/48°F; 20 days per 3°F
after dormancy ends: sprouting begins, weight loss and quality loss accelerate (storage slice)
```

Relative evidence for the other varieties:

- Texas study, counted from vine kill [S] (Jiao2026):
  - At 4 °C: Atlantic 115 days; Russet Burbank 151–193 days; Yukon Gold 110–120 days.
  - At 18 °C: Atlantic about 70 days; Yukon Gold 50–85 days.
  - Genomic estimates put Chieftain close to Atlantic.
- Atlantic: "Dormancy 8–10 weeks" (PUSA, temperature not stated) [S]. "Medium dormancy" (CFIA), "medium to long" (UW), "short" (NCSU-VCD). The sources conflict.
- Long: Kennebec (CFIA), Yukon Gold (CFIA), Green Mountain (NCSU-VCD).
- Medium: Katahdin (CFIA), Shepody (NCSU-VCD; ECPD "Medium to long"), Chieftain (PUSA).
- Short: Superior (CFIA, UW), Caribou Russet (UW), Irish Cobbler (NCSU-VCD), Norland ("short" CFIA; "very short" NCSU-VCD).
- Snowden: "short" (CFIA, UW), "medium" (NCSU-VCD), "Medium to long" (ECPD). Conflicting.

`dormancy45F` values other than Russet Burbank's are derived or invented (Table 2B).

**Storage and processing windows.**

- Atlantic: "Chips well two months in storage" [S] (PUSA). "Atlantic does not have ideal storage characteristics" [S] (MSU).
- Snowden "produces excellent chip color following 45 F storage" [S] (MSU). It is "the main storage chipping cultivar since 1993" [S] (NCSU-VCD).
- Caribou Russet fry color "compared favorably with Russet Burbank at 120 days or less of storage" [S] (MPB-CR).
- Shepody has "Good storage quality" but "needs through-the-pile ventilation" [S] (CFIA). It is "the main cultivar for early-harvest french fries" [S] (NCSU-VCD).
- Norland "Slowly loses color" in storage [S] (PUSA).
- Katahdin storability "excellent" and Kennebec storage quality "excellent" [S] (CFIA).

### 1.12 Market classes (for the economy slice)

| Market class | Varieties | Source notes |
|---|---|---|
| Round-white tablestock | Katahdin, Kennebec, Green Mountain, Irish Cobbler, Superior (early) | Katahdin "long the standard for round white fresh-market potatoes" (NCSU-VCD) |
| Early-market tablestock (dug in summer) | Superior, Norland/D.R. Norland, Irish Cobbler | "early fresh market" (CFIA for all three) |
| Chip contract | Atlantic (field and short storage), Snowden (storage), Superior (out of field), Kennebec and Irish Cobbler (early) | Atlantic "the standard for potato chip quality in Canada and United States" (CFIA) |
| Fry processing | Russet Burbank, Shepody (early/out of field), Caribou Russet, Kennebec | |
| Russet tablestock (bakers) | Russet Burbank, Caribou Russet | |
| Red tablestock | Norland/Dark Red Norland, Chieftain | |
| Yellow specialty | Yukon Gold | "often sold under its variety name" (CFIA) |
| Seed export | Kennebec, Chieftain | listed as main markets (CFIA) |
| Not chippable | Green Mountain, Yukon Gold, Shepody | "unacceptable" / "unsuitable for chipping" (CFIA) |

I did not research price differentials between these classes; that belongs to the economy slice (section 4).

### 1.13 Maine variety history

This history is useful for era flavour and for which varieties a 1973 farmer would actually choose:

- Green Mountain was about four-fifths of the Aroostook crop in 1928–30. It was dominant "From 1900 until the late 1930's, when Green Mountains began showing great susceptibility to net necrosis". Katahdin "was introduced to Aroostook in 1932" and was "now the most prominent" variety around 1959 [S] (County2009).
- Kennebec's release paper (1948) says it "should replace Katahdin in some sections" [S] (AJP-Kennebec1948).
- Percent of Maine acres planted [S-sum]: the NASS New England bulletins would not open, so these come from search summaries.
  - Russet Burbank: 29.1 % (2001) rising to 46.2 % (2018).
  - Superior: 8.9 % (2001) falling to 1.2 % (2018).
  - Katahdin: 3.9 % (2001), about 1 % (2011–2013).
  - Shepody: 11.4 % (2001), 7.2 % (2005).
  - Atlantic: 3.0–3.6 % (2001–2005).
- 2024 Maine certified seed acres [S] (UMaine 1094): Caribou Russet 1,498, Russet Burbank 1,183, Lamoka 620, Atlantic 467, Waneta 413, Snowden 367, Dark Red Norland 234, Norwis 234.

---

## 2. Parameter tables

### 2A. Per-variety comparison table (13 varieties, one source set per row)

Abbreviations: R resistant, MR moderately resistant, MS moderately susceptible, S susceptible, HS highly susceptible, I immune, SG specific gravity, LB late blight, HH hollow heart, IHN internal heat necrosis, NN net necrosis, ME Maine. "Index" values are relative to Atlantic = 1.00 from Penn State 2018 (higher means more disease).

| Variety | Breeder, release | Maturity | Yield | Tuber set and size | Skin / flesh / shape | Market | SG | LB foliage | LB tuber | Common scab | PVY / leafroll | HH and internal defects | Drought / heat | Dormancy / storage | Distinctive grower notes | PVP / TM | Sources |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Katahdin** | USDA (Clark, Stuart, Stevenson), Presque Isle ME; CFIA "1923" cross; described 1931, introduced 1932 | Late (CFIA); "vines late, tubers set rather early" (1931) | Medium–high (CFIA); 0.95× Atlantic total (PA 2017) | Few–medium per plant, large (ECPD); sets high in hill | Buff / white / round–oblong, very shallow eyes | Fresh tablestock; also fit to chip and fry | Medium (CFIA); 1.071–1.076 (PA 2017) | S (CFIA); index 0.92 | ECPD lab "Medium to high"; lower tuber incidence than foliar-R clones (NY) [S-sum] | S (CFIA); index 1.42 | PVA R; PVY, PVX, PVS MR; leafroll S; NN MR (CFIA). PVY symptoms "Variable/Severe", tuber necrosis (GW2018) | HH 0 % (PA 2018), 25 % (PA 2017); internal bruising "Very low" resistance (ECPD) | Drought-tolerant (CFIA) vs unsuited to summer-drought regions (1931); both paraphrased | Medium dormancy, "excellent" storability (CFIA) | Build a big hill early and re-hill after set to stop sunburn; slow early growth; Maine's signature variety | None (pre-1995) | CFIA-Katahdin; AJP-Katahdin1931; ECPD; PSU2017/2018; GW2018; County2009 |
| **Kennebec** | USDA + Maine AES; selected Presque Isle 1941; released 1948 | Mid-season to late (CFIA); "late maturing in Maine" (1948) | High (CFIA, PUSA, 1948); ECPD "High to very high" | Few–medium, large to very large; plant 15–20 cm and vine-kill or tubers oversize and roughen (CFIA) | Creamy buff / white / elliptical–oblong | Tablestock, chip, fry, seed export (CFIA, PUSA) | "high total solids" (CFIA); "medium to high" (UW); no number found | MR (CFIA), R1 gene (UW); index 0.48, the MR check | 1948: "high degree of resistance ... in both vines and tubers"; ECPD lab High; CFIA lists tuber LB as S | S (CFIA, UW); index 2.45, worst | PVA, PVY field R; leafroll S; NN R (CFIA). PVY symptoms "None-Mild" (GW2018), so infections stay latent | HH "Medium / Low" (ECPD); misshapes "under warmer growing conditions" (UW) | ECPD drought "High to very high" | Long dormancy, "excellent" storage (CFIA); greens quickly in light | Verticillium HS; tubers detach readily; flowers abort before opening (UW) | None; PUSA "Not protected" | CFIA-Kennebec; UW-Kennebec; AJP-Kennebec1948; PUSA; ECPD; PSU2018; GW2018 |
| **Superior** | Univ. Wisconsin (G.H. Rieman); selected 1951; released 1961/62 | Early to mid (CFIA); early (MSU); "medium-maturing" in the 1962 title | Medium (CFIA), "moderately high" (UW); MSU 343 cwt/A total at 130–140 DAP vs Atlantic 474, plateaued by 95 DAP | Uniform, medium; "Tubers size early" (CFIA) | Buff, lightly flaked / white / oval–oblong | Early fresh market, chips out of field | "Medium" (CFIA) vs "high" (UW); 1.071–1.073 (MSU), 1.072 (PA 2017) | S; index 1.38, the most susceptible group | Tuber rot 29 % US-1 / 67 % US-8 [S-sum] | MR (CFIA, UW); index 0.63 | PVX, PVY, leafroll S (CFIA); PVY symptoms Variable (GW2018) | "not subject to internal defects" (CFIA) | Verticillium HS (early dying, MSU) | Short dormancy; "tubers store well" (UW) | Resists skinning; washes well; early blight index 4.04 | None | CFIA-Superior; UW-Superior; AJP-Superior1962; MSU-E2222; PSU2017/2018; GW2018 |
| **Russet Burbank** | Sport of Luther Burbank's Burbank; released as "May's Netted Gem" by L.L. May & Co. 1902 (Lou Sweet ~1914 story rejected) | Late to very late (CFIA) | Medium–high (CFIA); ME trials ≈325 cwt/A total, ≈260 US#1 [D]; 2017 dry ME 257/218 | Few–medium, large, long; plant 30–45 cm for large tubers (CFIA) | Netted russet / white / long cylindrical | Bakers; French fry processing | High solids (CFIA); 1.081 ME trials; 1.082 ME 2017; 1.077–1.081 MSU | S (CFIA); "SUS-8 / MSUS-23" (UMaine); index 0.70 | ECPD lab "Very low to low"; CFIA S | MR (CFIA, UW), R (UMaine); index 0.47, best | PVX, PVY, leafroll S; NN S (CFIA); PVY MS (UMaine); symptoms Moderate | HH 13.8 % (ME trials); knobs and second growth; 14.2 % misshapes (ME 2017); US#1 only 60–66 % (MSU) | Needs uniform moisture and a long season (CFIA) | Long dormancy: 180/160/140 d at 42/45/48 °F; stores well | Maine's leading variety (29–46 % of acres 2001–18 [S-sum]); early blight index 0.30, best | None | CFIA-RussetBurbank; UW-RussetBurbank; Bethke2014; NE1231; MPB-N2017; MSU-E2222; UMaine 1094; Olsen2013; PSU2018 |
| **Atlantic** | USDA-ARS Beltsville (Webb et al.) with FL, VA, NJ, ME stations; cross 1969; released 1976 (paper 1978) | Mid (CFIA, UW); "med-late" (MSU); "Early" (PUSA, outlier) | High; ME ≈348 cwt/A total [D]; 1.04× Russet Burbank (MSU) | "good tuber set", uniform; oversizes at wide spacing or high N (CFIA) | White, netted to scaly / white / round | Chip standard of the US and Canada | High; 1.089 (ME trials); 1.085–1.088 (MSU); 1.096 (PA 2017) | CFIA "MR" (pre-US-8); PUSA S; "SUS-23" (UMaine); index 1.00 (spreader row) | ECPD lab "Low" | S (UMaine, MSU), MR (CFIA); index 1.00 | PVX and NN immune (CFIA); PLRV I; PVY MS with NWi tuber necrosis (UMaine) | HH 15.4 % (ME trials), ECPD "High"; IHN S (UW, MSU) | "not recommended for dry sandy soils" (CFIA); IHN worse in hot dry years | Dormancy "medium" / "medium to long" / "short" / "8–10 weeks"; "chips well two months in storage" (PUSA); "poor storability" (MSU) | Metribuzin injury (UW); golden nematode Ro1 R | None; PUSA "Not protected" | CFIA-Atlantic; UW-Atlantic; AJP-Atlantic1978; NE1231; MSU-E2222; UMaine 1094; PUSA; PSU2017/2018; Jiao2026 |
| **Green Mountain** | O.H. Alexander, Charlotte VT; Dunmore × Excelsior; bred 1878 (CFIA); 1885 [S-sum] | Late (CFIA) | High (CFIA); ECPD "High to very high" | Few, large (ECPD) | Buff, often netted / white / oblong, flattened | Tablestock; "unacceptable for chipping" (CFIA) | "suitable for starch" (CFIA), "high tuber solids" (NCSU-VCD) | HS (CFIA); ECPD "Very low" resistance | ECPD "Very low" | S (CFIA) | PVX, PVY, leafroll, NN all S (CFIA) | not stated | "grows well in light soils" (CFIA) | Long dormancy (NCSU-VCD); "stores well" (CFIA) | ~4/5 of the Aroostook crop 1928–30; net necrosis ended its run by the late 1930s | None | CFIA-GreenMountain; NCSU-VCD; ECPD; County2009 |
| **Irish Cobbler** | US, unknown parents, "may be a mutant of Early Rose" (CFIA); 1870s [UNC] | Early (CFIA); "Very early" (ECPD) | Medium–high (CFIA) | Medium–large, round; "shallow to deep" eyes | Creamy white / white / round, flattened ends | Early fresh market, early chips, home gardens | "high specific gravity" (CFIA) | S (CFIA); ECPD lab "Low" | ECPD lab "Very low to low" | S (CFIA) | PVA HR; PVX, PVY, leafroll S (CFIA) | ECPD internal rust spot "Very infrequent" | ECPD drought "High" | Short dormancy (NCSU-VCD) | "highly susceptible to bruising" (CFIA); Verticillium HS | None | CFIA-IrishCobbler; NCSU-VCD; ECPD |
| **Yukon Gold** | Univ. Guelph + Agriculture Canada (Johnston, Rowberry); Norgleam × W5279-4; selected 1966; registered 1980; paper 1981 | Mid (CFIA); "medium-early" (1981) | Medium–high (CFIA); "similar to Russet Burbank's" in Ontario (1981); 0.87× Russet Burbank (MSU) | Not stated; HH in large tubers | Yellow-white, pink eyes / light yellow / oval, flattened | Yellow tablestock; "not suitable for chips" | High (CFIA); 1.078–1.079 (MSU); 1.086 (PA 2017) | Index 0.87 | US-8 surface necrosis no worse than US-1, "except Yukon Gold" [S-sum]; ECPD lab "Low" | S (CFIA), moderately S (1981); index 1.32 | PVA HR, leafroll MR (CFIA); PVY S; symptoms "Severe" with tuber necrosis | "Large tubers are slightly susceptible to hollow heart" (CFIA); S (MSU, UW) | Air pollution S (CFIA) | "Excellent storability; long dormancy" (CFIA); 110–120 d at 4 °C (TX) | Keeps yellow colour when cooked; "slow early growth" (MSU) | None (pre-PBR) [UNC] | CFIA-YukonGold; UW-YukonGold; AJP-YukonGold1981; MSU-E2222; GW2018; PSU2017/2018; Jiao2026 |
| **Shepody** | Agriculture Canada, Fredericton NB (Young, Tarn, Davies); Bake King × F58050; selected 1969; registered 1980; paper 1983 | Mid (CFIA); "Kennebec maturity" (1983); "early-medium" (NCSU-VCD) | High, "high percentage of large tubers" (CFIA); peaks 472 cwt/A at 110–120 DAP (MSU) | Uniform, large; 30–40 cm for processing (CFIA) | Buff / white / long | Fries, especially early harvest out of field; fresh | High (CFIA); 1.078–1.083 (MSU) | S (CFIA); index 0.93 | S (CFIA); ECPD lab "Medium" | S (CFIA); index 2.33 (the S check) | PVY S with "poor symptoms expression"; leafroll S (CFIA); NN R (NCSU-VCD) | "Good resistance to second growth" (CFIA); ECPD HH "Low" | not stated | Medium dormancy; "needs through-the-pile ventilation" (CFIA) | Foliage "very sensitive" to metribuzin; rogue PVY on cloudy days | None | CFIA-Shepody; AJP-Shepody1983; NCSU-VCD; MSU-E2222; PSU2018; GW2018 |
| **Norland / Red Norland / Dark Red Norland** | N. Dakota Agric. College (Johansen et al.); Redkote × ND626; released 1957 (paper 1959); Red Norland darker selection 1965; DRN a further selection (year not found) | Early (CFIA, UW, PUSA); "very early" (NCSU-VCD) | "High" (CFIA) vs DRN "Medium" (PUSA); Norland 415 cwt/A (MSU, single dig); DRN 0.86× Chieftain (PA 2017) | "high numbers of US#1 grade tubers early" (UW) | Red (fades as tubers mature) / white / oblong, flattened | Early red tablestock | Low (CFIA, PUSA); 1.065 (MSU); 1.063 (PA 2017) | S (CFIA, 1959); DRN "SUS-23"; index 1.15 | DRN ECPD lab "Very low to low" | MR (CFIA, 1959); R (UMaine); index 0.58 | PVA HR; PVX, PVY, leafroll S (CFIA); DRN PVY-O S, N strains MR (UMaine) | Not subject to internal defects (CFIA); silver scurf HS | "Sensitive to drought" (CFIA, UW) | Short dormancy (CFIA); storage good; "Slowly loses color" (PUSA) | Skinning and bruising if dug immature; early blight index 2.10 | None; PUSA DRN "Not Protected" | CFIA-Norland; UW-Norland; AJP-Norland1959; PUSA; UMaine 1094; PSU2017/2018; GW2018 |
| **Snowden** | Univ. Wisconsin (Peloquin, Kichefski); Lenape (B5141-6) × Wischip; named 1990; CFIA registration 1997 | Late (CFIA, UW, MSU) | High (CFIA); 1.08× Russet Burbank (MSU); 0.99× Atlantic (PA 2017) | Heavy set; small tubers if close; 30–38 cm (CFIA) | Buff, slightly netted / white / round | Chips, especially from storage | High; 1.080–1.082 (MSU); 1.091 (PA 2017) | S (UW); "SUS-8 / MSUS-23" (UMaine); index 1.03 | not found | MR (CFIA) vs S (UMaine); index 1.14 | PVY MS with NWi tuber necrosis (UMaine); "very mild leaf roll symptoms" (CFIA) | "less internal defects compared with Atlantic" (MSU), yet 67–80 % HH in PA cut samples | "needs high levels of moisture" (CFIA) | Short (CFIA, UW) vs medium (NCSU-VCD); chips from 45 °F storage (MSU) | Attracts Colorado potato beetle (MSU); bruise MS | None; PUSA "Not Protected" | CFIA-Snowden; UW-Snowden; MSU-E2222; UMaine 1094; PUSA; NCSU-VCD; PSU2017/2018 |
| **Chieftain** | Iowa State + USDA (Weigle, Kehr, Akeley, Horton); selected 1957; released 1966 (PUSA) / 1968 (paper) | Mid (CFIA, 1968) | High (CFIA); 545 cwt/A total, the top red (PA 2017) | Undersizes in dry soil (CFIA) | Bright red / white / oval–oblong | Red tablestock, seed export, pre-peeled | Medium (CFIA); 1.062–1.075 (PA) | 1968: "immunity to the common races"; MR (CFIA); index 1.11 under US-23 | not found | MR (CFIA); "medium to high" (1968); index 1.09 | PVX, PVY, leafroll S (CFIA); PVY symptoms Variable/Severe; NN tuber resistance (1968) | HH 0–17 % (PA) | Undersizing when dry | Medium dormancy (PUSA); "Good storability" (CFIA) | Broad adaptability; no acceptable chips after cold storage (1968) | None; PUSA "Not protected" | CFIA-Chieftain; AJP-Chieftain1968; PUSA; PSU2017/2018; GW2018; Jiao2026 |
| **Caribou Russet** | Univ. Maine (G.A. Porter) + Maine Potato Board; Reeves Kingpin × Silverton Russet; cross 2001 Presque Isle; released 2015 | "mid-season" (MPB-CR); "medium-late" (MPB-2017eval); "late" (CFIA-PBR); "Mid to late-season" (UW) | US#1 130 % of Russet Burbank (MPB-CR); ME trials 354 cwt/A total (109 %), 327 US#1 (126 %); 2017 dry 303/296 | Lower tuber set (spaced 10 in vs 16 in); large, long | Light brown, lightly russeted / white / long | Dual: fresh market and French fry | 1.082–1.083 (ME trials, ME 2017) | S (UW); "SUS-23" (UMaine) | not found | MR (UMaine, UW, MPB) | PVY, PLRV and NN all S (UW, UMaine) | HH 3.0 % vs 13.8 % for Russet Burbank; misshapes 2.1 % vs 14.2 %; IHN HS in southern areas | "excellent early vigor" (MPB-CR) | Short dormancy (UW); good fry colour up to 120 days of storage | N optimum 200 lb/A vs Russet Burbank 300 (ME 2017); shatter and blackspot bruise tolerant; Maine #1 seed acreage 2024 | US PVP application "underway" in 2015 (status not confirmed); Canadian PBR certificate 5702, granted 2018-03-26, ends 2038-03-26 | MPB-CR; UW-CaribouRusset; NE1231; MPB-2017eval; MPB-N2017; UMaine 1094; CFIA-PBR-CR |

### 2B. Numeric game parameters per variety

Each column's source or derivation is given under the table. Russet Burbank = 1.00 for `yieldIndex`; Atlantic = 1.00 for the disease indices.

| Variety | release | maturityDays | yieldIndex | us1Frac | sgBase | lbFoliar | lbTuber | scab | earlyBlight | pvySus | pvySymptom | hhBase | droughtSens | dormancy45F (d) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Irish Cobbler | 1870s | 85 | 0.80 | 0.85 | 1.078 | 1.10 | 1.2 | 1.40 | 1.5 | 1.0 | 0.7 | 0.05 | 0.9 | 70 |
| Dark Red Norland | 1957/65 | 80 | 0.85 | 0.90 | 1.064 | 1.15 | 1.2 | 0.58 | 2.10 | 0.9 | 0.7 | 0.03 | 1.3 | 60 |
| Superior | 1962 | 90 | 0.80 | 0.90 | 1.072 | 1.38 | 1.2 | 0.63 | 4.04 | 1.0 | 0.7 | 0.03 | 1.0 | 75 |
| Yukon Gold | 1980 | 98 | 0.90 | 0.90 | 1.080 | 0.87 | 0.8 | 1.32 | 1.40 | 1.0 | 0.9 | 0.12 | 1.0 | 110 |
| Shepody | 1980 | 100 | 1.00 | 0.76 | 1.081 | 0.93 | 0.9 | 2.33 | 1.86 | 1.0 | 0.3 | 0.04 | 1.0 | 110 |
| Chieftain | 1966/68 | 100 | 0.95 | 0.88 | 1.068 | 1.11 | 0.9 | 1.09 | 1.95 | 1.0 | 0.8 | 0.03 | 1.2 | 105 |
| Atlantic | 1976 | 108 | 1.05 | 0.88 | 1.089 | 1.00 | 1.1 | 1.00 | 1.00 | 0.75 | 0.5 | 0.154 | 1.1 | 100 |
| Kennebec | 1948 | 112 | 1.05 | 0.88 | 1.078 | 0.48 | 0.6 | 2.45 | 0.57 | 0.3 | 0.2 | 0.08 | 0.8 | 140 |
| Caribou Russet | 2015 | 115 | 1.09 | 0.92 | 1.082 | 1.00 | 1.0 | 0.60 | 1.5 | 1.0 | 0.6 | 0.030 | 1.0 | 80 |
| Snowden | 1990 | 120 | 1.05 | 0.86 | 1.085 | 1.03 | 1.0 | 1.14 | 0.90 | 0.75 | 0.4 | 0.10 | 1.15 | 90 |
| Katahdin | 1932 | 120 | 0.95 | 0.90 | 1.074 | 0.92 | 0.7 | 1.42 | 0.42 | 0.5 | 0.8 | 0.05 | 0.9 | 120 |
| Green Mountain | 1878/85 | 125 | 0.95 | 0.85 | 1.080 | 1.30 | 1.3 | 1.40 | 2.0 | 1.0 | 0.7 | 0.06 | 0.95 | 140 |
| Russet Burbank | 1902 | 135 | 1.00 | 0.75 | 1.081 | 0.70 | 1.1 | 0.47 | 0.30 | 0.85 | 0.6 | 0.138 | 1.1 | 160 |

Derivation by column:

- **maturityDays.** The CFIA class (each variety's CFIA page) placed inside the CFIA-MAT day band [S class, INV point]. Early = 80–90, mid = 98–108, mid-late = 112–115, late = 120–125, late-to-very-late = 135. Kennebec sits at the late end of mid-late because the 1948 paper says it is "late maturing in Maine". Caribou Russet's sources range from mid-season to late, so it uses 115.
- **yieldIndex.**
  - Russet Burbank 1.00 and Caribou Russet 1.09 [S] (NE1231).
  - Atlantic 1.05 [D]: MSU 474/456 = 1.04 and Maine 348/325 = 1.07.
  - Snowden 1.05 [D]: MSU 494/456 = 1.08; PA 2017 0.99× Atlantic.
  - Shepody 1.00 [D]: MSU 465/456 = 1.02.
  - Yukon Gold 0.90 [D]: MSU 396/456 = 0.87; "similar to Russet Burbank's" in Ontario.
  - Superior 0.80 [D/INV]: MSU 343/456 = 0.75, but PA 2017 was 1.02× Atlantic, so the evidence spans a range.
  - Dark Red Norland 0.85 [D/INV]: MSU 415/456 = 0.91 at a single dig; PUSA "Medium".
  - Katahdin 0.95 and Kennebec 1.05 [INV]: ordered by the 1948 paper's claim that Kennebec yields more than Katahdin, and by PA 2017 (Katahdin 0.95× Atlantic).
  - Chieftain 0.95, Green Mountain 0.95 and Irish Cobbler 0.80 [INV]: from CFIA "high" and "medium to high".
- **us1Frac.**
  - Russet Burbank 0.75 [D]: between MSU 0.60–0.66 and Maine 0.80–0.85.
  - Caribou Russet 0.92 [S]: 327/354.
  - Atlantic 0.88 [D]: MSU 432/474 = 0.91; Maine 290/348 = 0.83.
  - Superior and Yukon Gold 0.90 [S]: MSU 89–92 %.
  - Snowden 0.86 [D]: 424/494.
  - Shepody 0.76 [S]: MSU 72–80 %.
  - Norland 0.90 [D]: 378/415.
  - All others [INV].
- **sgBase.**
  - [S]: Atlantic 1.089, Russet Burbank 1.081 and Caribou Russet 1.082 (Maine trials); Superior 1.072 (MSU, PA); Dark Red Norland 1.064 (MSU 1.065, PA 1.063).
  - [D] means of the published ranges: Yukon Gold 1.080, Shepody 1.081, Snowden 1.085, Katahdin 1.074, Chieftain 1.068.
  - [INV] from CFIA's words: Kennebec 1.078 ("high total solids"), Green Mountain 1.080 ("suitable for starch"), Irish Cobbler 1.078 ("high specific gravity").
- **lbFoliar, scab, earlyBlight.** [D] from PSU2018 where the variety was in the trial; otherwise [INV] from the CFIA or UMaine class, as listed in 1.6.
- **lbTuber, pvySus, pvySymptom.** [INV] mappings of the qualitative ratings in 1.6 and 1.7.
- **hhBase.** Atlantic, Russet Burbank and Caribou Russet are [S] Maine trial incidence. All others are [INV], ordered by the 1.8 sources.
- **droughtSens.** [INV], ordered by the 1.9 table.
- **dormancy45F.**
  - Russet Burbank 160 [S].
  - Atlantic 100, Yukon Gold 110 and Chieftain 105 [D]: Texas cold-storage ratios to Russet Burbank, about 0.6–0.76, times 160.
  - All others [INV], from the CFIA, UW and NCSU-VCD classes (short ≈ 60–80, medium ≈ 100–120, long ≈ 140).

### 2C. Global and Maine anchor parameters

| Name | Value | Unit | Source (quote or table) |
|---|---|---|---|
| Very early maturity | 65–70 | days | CFIA-MAT "Very early: 65 to 70 days" [S] |
| Early maturity | 70–90 | days | CFIA-MAT [S] |
| Mid-season maturity | 90–110 | days | CFIA-MAT [S] |
| Late maturity | 110–130 | days | CFIA-MAT [S] |
| Very late maturity | ≥130 | days | CFIA-MAT "130 days and more" [S] |
| Aroostook trial season, planting to vine kill | 115 (May 23 → Sep 15) | DAP | MPB-N2017 p. 4 [S] |
| Russet Burbank total yield, Maine trials | ≈325 | cwt/A | [D] from NE1231 "354 cwt/A (109% of Russet Burbank)" |
| Russet Burbank US#1, Maine trials | ≈260 | cwt/A | [D] from NE1231 "327 cwt/A (126% of Russet Burbank)" |
| Atlantic total yield, Maine trials | ≈348 | cwt/A | [D] from NE1231 "365 cwt/A (105% of Atlantic)" |
| Caribou Russet total / US#1, Maine trials | 354 / 327 | cwt/A | NE1231 [S] |
| Russet Burbank / Caribou Russet, dry 2017, no irrigation | 257 / 303 total; 218 / 296 US#1 | cwt/A | MPB-N2017 Table 1 [S] |
| Specific gravity fall with N, 0 → 300 lb N/A | 1.091 → 1.084 | SG | MPB-N2017 Table 1 [S] |
| Yield rise with N, 0 → 300 lb N/A (3-variety mean) | 133 → 303 | cwt/A | MPB-N2017 Table 1 [S] |
| N rate maximizing yield: Caribou Russet / Russet Burbank | 200 / 300 | lb N/A | MPB-N2017 "maximized at a lower N rate (200 lbs/A) ... Russet Burbank (300 lbs/A)" [S] |
| High potash effect on SG | −0.002 | SG | MPB-N2017 [S] |
| HH incidence: Atlantic / Russet Burbank / Caribou Russet, Maine trials | 15.4 / 13.8 / 3.0 | % | NE1231 [S] |
| Russet Burbank dormancy at 42 / 45 / 48 °F | 180 / 160 / 140 | days | Olsen2013 (Idaho, 14-yr mean) [S] |
| Dormancy temperature coefficient | ≈6.7 (20 per 3 °F) | days per °F | [D] from the row above |
| Atlantic dormancy, from vine kill: 4 °C / 18 °C | 115 / ~70 | days | Jiao2026 (Texas) [S] |
| Atlantic chip storage window | ~2 | months | PUSA "Chips well two months in storage" [S] |
| Caribou Russet good fry colour window | ≤120 | days in storage | MPB-CR [S] |
| SG ↔ total solids | 1.060 → 15.9 %, 1.070 → 18.1 %, 1.080 → 20.2 %, 1.090 → 22.3 % | – | MSU-E2222 Table 1 [S] |
| Maine certified seed acres, 2024 (top) | Caribou R. 1,498; R. Burbank 1,183; Atlantic 467; Snowden 367; D.R. Norland 234 | acres | UMaine 1094 Table 1 [S] |
| Green Mountain share of the Aroostook crop, 1928–30 | ~80 | % | County2009 "nearly four-fifths" [S] |
| Late blight foliar AUDPC LSD (PSU 2018, US-23) | 159 (= 0.32 index) | AUDPC | PSU2018 [S] |
| Common scab severity LSD (PSU 2018) | 6.7 (= 0.86 index) | severity | PSU2018 [S] |

---

## 3. Recommended six varieties for the game

The criteria are contrast on maturity, late blight resistance, yield, storability and market price class. A second goal is that the roster works for nearly the whole 1973–2025 span. All six are documented Maine varieties.

| # | Variety | Maturity (d) | lbFoliar | yieldIndex | Dormancy and storage | Market class | Its decision role |
|---|---|---|---|---|---|---|---|
| 1 | **Dark Red Norland** | 80 (early) | 1.15 | 0.85 | Short (≈60 d) | Early red tablestock | Dig early for colour and the early market, before blight. The red fades with maturity and immature skins scuff, so dig date is a real trade-off. Drought-sensitive (rewards irrigation); low SG (no chip option); scab-resistant. |
| 2 | **Superior** | 90 (early) | 1.38 (worst) | 0.80 | Short (≈75 d) | Early round-white; chips out of field | The most blight-susceptible variety, so it only works if you plant early and dig before the epidemic. Bulking plateaus by ~95 DAP, so waiting gains nothing. Scab-tolerant; high early-dying (Verticillium) risk. |
| 3 | **Atlantic** | 108 (mid / mid-late) | 1.00 | 1.05 | Medium; chip window ~2 months | Chip contract (SG-graded) | Highest specific gravity, so nitrogen and potash choices (which lower SG) and contract grading matter. Hollow heart in oversized tubers punishes wide spacing and growth surges. Scab-susceptible. Available from 1976. |
| 4 | **Kennebec** | 112 (mid-late; late in Maine) | 0.48 (best) | 1.05 | Long (≈140 d), excellent storage | Round-white tablestock, also chip, fry and seed | The blight-resistant workhorse: fewer sprays. Weak points that keep it honest: worst scab (2.45), highly susceptible to Verticillium, big tubers that need close spacing and timely vine kill, quick greening (hilling). PVY shows few symptoms, so infections hide in saved seed. |
| 5 | **Katahdin** | 120 (late) | 0.92 | 0.95 | Medium dormancy, excellent storage | Round-white tablestock (Maine's own) | Sets tubers high in the hill, so hilling is a decision with real consequences. Good early-blight and Verticillium tolerance, but scab-susceptible. A drought-tolerance claim that the sources dispute. The 1973 incumbent that Kennebec was bred to replace, which gives a natural "old standard versus blight-resistant newcomer" choice. |
| 6 | **Russet Burbank** | 135 (very late) | 0.70 | 1.00 | Longest dormancy (160 d at 45 °F) | Fry processing; russet bakers | The long game: never reaches natural maturity in Aroostook, so vine kill and frost timing matter most here. Best scab and early-blight resistance and the longest storage. Low US No. 1 share, knobs and second growth under uneven moisture (rewards irrigation), hollow heart, net necrosis from leafroll. |

**Why these six.**

- **Range.** They span 80–135 days to maturity and the full measured late blight range (0.48–1.38). Dormancy runs from about 60 to 160 days at 45 °F.
- **Markets.** They cover five market classes: early red, early round white, chip, main-season round white, and fry/russet.
- **Weak points.** Each one has a different weakness, so no variety dominates:
  - Superior: blight.
  - Kennebec: scab and Verticillium.
  - Atlantic: hollow heart.
  - Russet Burbank: shape defects and lateness.
  - Dark Red Norland: drought.
  - Katahdin: scab and greening.
- **Availability.** Five of the six were available to Maine growers in 1973; Atlantic arrives in 1976.

**Alternates and era unlocks.**

- **Caribou Russet (2015 unlock).** The modern Maine-bred upgrade path. It beats Russet Burbank on US No. 1 yield (126–130 %), hollow heart (3.0 % vs 13.8 %), misshapes and scab. It loses on dormancy (short), blight (susceptible) and PVY. Its seed is scarce in the first seasons. It shows the arc of Aroostook from Katahdin to Caribou Russet.
- **Yukon Gold (1980 unlock).** Adds a yellow specialty price class with moderate blight (0.87), severe PVY symptoms (easy to rogue, heavy damage when infected) and hollow heart in big tubers. Swap it in for Katahdin if the economy slice wants a sixth distinct price class rather than the heritage-variety story.
- **Not recommended for the core roster:**
  - Snowden (1990): too close to Atlantic in decision space.
  - Shepody: too close to Russet Burbank, except that it is an early fry option.
  - Chieftain: too close to Dark Red Norland.
  - Green Mountain and Irish Cobbler: historically important but out of commercial use for most of 1973–2025. The County history and the NASS shares list neither in the modern era.

---

## 4. Plant variety protection and trademarks

- **US PVP.** The Plant Patent Act excludes potatoes: plant patents cover asexually reproduced varieties "other than a tuber propagated plant", and the MPEP explains the reason as "propagated by the same part of the plant that is sold as food" [S] (MPEP1601). The PVP Act did not cover tuber-propagated crops until the 1994 amendments, effective 1995 [S-sum] (Lexology summary; the statute page 108 Stat. 3136 was not opened). So every variety in this report released before 1995 cannot hold US PVP. That covers 12 of the 13, including Snowden (1990). Potatoes USA lists Atlantic, Chieftain, Dark Red Norland, Kennebec and Snowden as "Not protected" [S] (PUSA).
- **Caribou Russet (2015)** is the only protected variety found:
  - Canadian Plant Breeders' Rights certificate 5702, holder "University of Maine Board of Trustees", granted 2018-03-26, ends 2038-03-26 [S] (CFIA-PBR-CR).
  - A US PVP application was "underway" in 2015 [S] (MPB-CR) and is cited by UW. I did not confirm a US certificate number; the USDA PVP database was not queried.
- **Trademarks.** I found no evidence that any of the 13 names is a registered trademark. They are cultivar denominations. The USPTO trademark database was not searched, so this is a negative result only.
- **Naming note for the game.** Using these variety names in a game is ordinary descriptive use of public cultivar names. Several are Maine place names: Katahdin (the mountain), Kennebec (the river), Caribou (the city).

---

## 5. Sources

A note on quotation fidelity. CFIA, UMaine, Maine Potato Board web pages and Springer abstracts were read through a fetch tool that returns a model-written digest, with page wording quoted in fragments of 125 characters or fewer. Quoted strings in this report are what the tool returned as page wording; a few are flagged as paraphrase. The PDFs (MSU-E2222, PSU2017, PSU2018, MPB-N2017, MPB-2017eval, GW2018, PUSA) and the ECPD pages were downloaded and text-extracted locally, so their numbers and quotes are verbatim.

Opened and read, by the key used above:

| Key | URL | What I read |
|---|---|---|
| CFIA-Katahdin | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/katahdin | Full description: "late season", drought, dormancy medium, storability excellent, hilling advice, disease lists |
| CFIA-Kennebec | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/kennebec | Full description: "mid-season to late", 15–20 cm spacing and vine kill, long dormancy, greening, disease lists |
| CFIA-Superior | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/superior | "early to mid-season", brief dormancy, "not subject to internal defects", disease lists |
| CFIA-RussetBurbank | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/russet-burbank | "late to very late", uniform moisture, 30–45 cm, long dormancy, disease lists |
| CFIA-Atlantic | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/atlantic | "mid-season", chip standard, hollow heart in oversize, not for dry sandy soils, immunities |
| CFIA-GreenMountain | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/green-mountain | "late", 1878, highly susceptible to late blight, not for chips |
| CFIA-IrishCobbler | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/irish-cobbler | "early", bruising, disease lists |
| CFIA-YukonGold | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/yukon-gold | "mid-season", long dormancy, hollow heart in large tubers, disease lists |
| CFIA-Shepody | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/shepody | "mid-season", second-growth resistance, ventilation, PVY expression, metribuzin |
| CFIA-Norland | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/norland | "early", drought-sensitive, short dormancy, low solids, Red/Dark Red selections |
| CFIA-Snowden | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/snowden | "late", heavy set, 30–38 cm, short dormancy, chip from storage |
| CFIA-Chieftain | https://inspection.canada.ca/en/plant-health/potatoes/potato-varieties/chieftain | "mid-season", undersizing, disease lists |
| CFIA-MAT | https://inspection.canada.ca/en/plant-health/potatoes/characteristics | Maturity class day bands |
| CFIA-PBR-CR | https://active.inspection.gc.ca/english/plaveg/pbrpov/cropreport/pot/app00010213e.shtml | Caribou Russet PBR record: holder, certificate 5702, dates, "late", plant heights |
| UW-index | https://seedpotato.russell.wisc.edu/obtaining-seed-potatoes/potato-fact-sheets/ | Fact-sheet index |
| UW-CaribouRusset | https://seedpotato.russell.wisc.edu/2019/06/25/caribou-russet/ | Pedigree, maturity, resistances, IHN, hollow heart, short dormancy |
| UW-Kennebec | https://seedpotato.russell.wisc.edu/2019/06/25/kennebec-fact-sheet/ | 1948 release, R1 gene, Verticillium, misshapes |
| UW-RussetBurbank | https://seedpotato.russell.wisc.edu/2019/06/25/russet-burbank-fact-sheet/ | L.L. May 1902, disease list, moisture and knobs |
| UW-Norland | https://seedpotato.russell.wisc.edu/2019/06/25/norland-fact-sheet/ | Norland 1957, Red Norland 1965, colour fade, drought |
| UW-Superior | https://seedpotato.russell.wisc.edu/2018/05/14/superior-potato-fact-sheet/ | 1962, short dormancy, scab MR, Verticillium HS |
| UW-Atlantic | https://seedpotato.russell.wisc.edu/2017/08/31/atlantic-potato-fact-sheet/ | 1976, HH in oversize, IHN, dormancy "medium to long" |
| UW-Snowden | https://seedpotato.russell.wisc.edu/2017/08/31/snowden-potato-fact-sheet/ | 1990, short dormancy, storage chip, scab statements that conflict |
| UW-YukonGold | https://seedpotato.russell.wisc.edu/2018/05/14/yukon-gold-potato-fact-sheet-3/ | 1981, PVY, scab, HH susceptible |
| UMaine 1094 | https://extension.umaine.edu/publications/1094e/ | Top 10 Maine varieties 2024 (seed acres); disease table incl. LB vs US-8/US-23, PVY strains, scab |
| UMaine 2077 | https://extension.umaine.edu/publications/2077e/ | Home-garden variety table (season class); planting and storage notes |
| MPB-CR | https://mainepotatoes.com/the-university-of-maine-and-the-maine-potato-board-release-the-new-potato-variety-caribou-russet/ | Caribou Russet release: 130 % and 122 % yields, hollow heart, fry colour ≤120 d, PVP "underway" |
| MPB-2017eval | https://www.mainepotatoes.com/wp-content/uploads/2019/04/Evaluation-of-New-Potato-Varieties-2017Growing-Season.pdf | Porter & Ocaya 2018: Caribou Russet profile; PVY expression of Russet Burbank |
| MPB-N2017 | https://www.mainepotatoes.com/wp-content/uploads/2019/04/Nitrogen-calcium-boron-and-potassium-effects-on-potato-quality.pdf | Presque Isle 2017: dates, rainfall, Table 1 yields, SG, defects; N, K and Ca effects |
| NE1231 | https://nimss.org/projects/view/SAES/14336 | Maine trial means: Caribou Russet vs Russet Burbank; Sebec vs Atlantic; HH % |
| NE1731 | https://nimss.org/projects/view/SAES/18322 | National seed acreage of Caribou Russet 2017–2018; Atlantic seed acres |
| MSU-E2222 | https://sanweb.lib.msu.edu/DMC/extension_publications/e2222/E2222-1990.PDF | Chase et al. 1990: Tables 1–6 (SG classes, variety traits, dates-of-harvest yields and SG) |
| PSU2018 | https://plantpath.psu.edu/research/areas/plant-disease-management/penn-state-potato-research-program/pennsylvania-potato-research-reports/pennsylvania-potato-research-report-2018 | Late blight (US-23) and early blight AUDPC, common scab severity, trial yields, HH |
| PSU2017 | https://plantpath.psu.edu/research/areas/plant-disease-management/penn-state-potato-research-program/pennsylvania-potato-research-reports/pennsylvania-potato-research-report-2017 | Rock Springs yields, SG, vine maturity class, HH % per variety |
| GW2018 | https://bpb-us-e1.wpmucdn.com/blogs.cornell.edu/dist/5/6962/files/2018/06/Cultivar-tables-combined-2018-4-1jzk90c.pdf | Gray & Whitworth 2018 PVY foliar symptom severity by strain; PMTV sensitivity |
| PUSA | https://potatoesusa.com/wp-content/uploads/2022-Guide-to-US-Potato-Varieties-English.pdf | Potatoes USA 2022 guide: Atlantic, Chieftain, DRN, Kennebec, Snowden entries incl. "Status" |
| ECPD | https://www.europotato.org/varieties/view/Kennebec-E (same pattern for the others) | European Cultivated Potato Database trait ranges (multiple national sources); Caribou Russet page has no data |
| NCSU-VCD | https://cucurbitbreeding.wordpress.ncsu.edu/2016/06/03/potato/ | Vegetable Cultivar Descriptions for North America: origin, maturity, dormancy, use |
| AJP-Kennebec1948 | https://doi.org/10.1007/BF02883336 | Akeley, Stevenson, Schultz, Am. Potato J. 25:351–361. Abstract read (Springer page) |
| AJP-Atlantic1978 | https://doi.org/10.1007/BF02852087 | Webb et al., Am. Potato J. 55:141–145. Preview only; no abstract shown |
| AJP-YukonGold1981 | https://doi.org/10.1007/BF02853905 | Johnston & Rowberry, Am. Potato J. 58:241–244. Abstract read |
| AJP-Superior1962 | https://doi.org/10.1007/BF02912628 | Rieman, Am. Potato J. 39:19–28. Preview only (title, keywords) |
| AJP-Shepody1983 | https://doi.org/10.1007/BF02853799 | Young, Tarn, Davies, Am. Potato J. 60:109–114. Abstract read ("Kennebec maturity") |
| AJP-Norland1959 | https://doi.org/10.1007/BF02877209 | Johansen et al., Am. Potato J. 36:12–15. Summary read |
| AJP-Chieftain1968 | https://doi.org/10.1007/BF02850285 | Weigle et al., Am. Potato J. 45:293–296. Summary read ("immunity to the common races") |
| AJP-Katahdin1931 | https://doi.org/10.1007/BF02878595 | Clark, Stuart, Stevenson, Am. Potato J. 8:121–125. Summary read |
| Bethke2014 | https://doi.org/10.1007/s12230-014-9397-5 | AJPR 91:594–609. Abstract read: Netted Gem released 1902 by L.L. May & Co. |
| Olsen2013 | https://www.potatogrower.com/2013/09/understanding-dormancy | Idaho Russet Burbank dormancy 180/160/140 d; definition of dormancy break (tables are images, not readable) |
| US6855669 | https://patents.google.com/patent/US6855669B2/en | Table 1: Russet Burbank dormancy ~130 d (48 °F), ~140 d (45 °F) |
| Jiao2026 | https://pmc.ncbi.nlm.nih.gov/articles/PMC12919731/ | Texas dormancy (days from vine kill) for Russet Burbank, Atlantic, Yukon Gold; genomic estimates for Chieftain |
| County2009 | https://thecounty.me/2009/08/25/living/a-history-of-potatoes-in-aroostook-county/ | Green Mountain ~4/5 (1928–30), net necrosis, Katahdin 1932 |
| MPEP1601 | https://blueironip.com/mpep/mpep-1601/ | 35 U.S.C. 161 tuber exclusion and its rationale (mirror of the USPTO MPEP) |
| CSU-list | https://extension.colostate.edu/tissue-culture-lab/2025-active-potato-cultivar-list/ | Accession years only; no PVP column |
| CrossRef | https://api.crossref.org/works/10.1080/07060669909501176 (and the DOIs above) | Citation metadata for the release papers and Medina et al. 1999 |

Tried and could not open:

- **NASS New England bulletins** (variety-share tables), e.g. https://www.nass.usda.gov/nh/P053-P056-2005FallPotatoes.pdf and the 2014/2018 annual bulletins. NASS returned an HTML 404 page, and the Wayback Machine blocked automated fetches. Shares are therefore [S-sum].
- **Dorrance & Inglis 1997/1998, *Plant Disease*** 81:1206 and 82:442 (apsjournals PDFs, HTTP 403).
- **Medina, Platt & Peters 1999, *Can. J. Plant Pathol.*** 21:388–390 (Taylor & Francis, 403). Abstract content via search summary only.
- **Univ. of Idaho CIS 1120** (file exceeded the fetch size limit).
- **Cornell Upstate NY trial report** doc_273.pdf (download failed).
- **CFIA pages for Dark Red Norland and Caribou Russet** (HTTP 410 Gone).
- **Springer full texts** (paywalled; only abstracts or previews read).
- **potatoes.ncsu.edu/NEReports.html** (redirects to the site home; the Maine annual variety reports were not reached).

---

## 6. Unconfirmed items and gaps

1. **NASS Maine percent-of-acres-by-variety (2001–2018).** All values in 1.13 are [S-sum]. I found nothing at all for 1973–2000. Katahdin's 1970s dominance rests on qualitative statements only (County2009; the USDA marketing publication summary).
2. **Days-to-maturity numbers.** These are CFIA class bands with points I chose [INV]. CFIA does not state whether days count from planting or emergence. MSU harvest-date data exist for only six varieties, and they are from Michigan.
3. **Dormancy days.** Only Russet Burbank has a sourced temperature table. Atlantic, Yukon Gold and Chieftain are derived from Texas ratios. All others come from class words, and the class words conflict for Atlantic and Snowden. Atlantic's "8–10 weeks" (PUSA) against "medium to long" (UW) is unresolved; the game value of 100 d at 45 °F sits between them.
4. **Tuber late blight** per variety is a qualitative mapping [INV]. Medina et al. 1999 per-cultivar numbers are [S-sum]. Kennebec tuber resistance conflicts (1948 paper and ECPD "high" against CFIA "susceptible").
5. **US-1-era late blight ratings.** I found no same-trial data for 1973–1990s pathogen populations. The game uses US-23-era indices throughout.
6. **Kennebec, Green Mountain and Irish Cobbler specific gravity.** No measured values were found; the game values are [INV].
7. **Tubers per hill.** Class names come from ECPD and CFIA; the counts are [INV].
8. **Dark Red Norland release year** was not found. Green Mountain's 1885 release and Irish Cobbler's 1870s origin are [S-sum] / [UNC].
9. **Caribou Russet US PVP certificate.** Not confirmed; only the 2015 "underway" statement and the Canadian PBR record were found. The USDA PVP database and USPTO trademarks were not searched.
10. **The 1994 PVPA amendment and its 1995 effective date** are [S-sum]. Canada's Plant Breeders' Rights Act year (1990), used to argue that Yukon Gold has no PBR, is [UNC].
11. **The von Scheele SG → dry-matter formula** is [UNC], though it is consistent with MSU Table 1, which I opened.
12. **Fry et al. (1983, *Phytopathology*)** reportedly integrated cultivar resistance classes (S, MS, MR) into blight-unit spray thresholds [UNC]. I did not open it. The disease slice should check it if it wants published spray-timing thresholds by resistance class instead of my AUDPC multipliers.
13. **Price differentials** between market classes (early, red, yellow, chip contract, fry contract) were not researched; they belong to the economy slice.
14. **Conflicts between sources, left visible on purpose:**
    - Atlantic late blight: CFIA "MR" against UMaine and PUSA "S".
    - Atlantic maturity: PUSA "Early" against "mid" and "med-late" elsewhere.
    - Snowden scab: CFIA "MR" against UMaine "S"; UW lists both.
    - Snowden hollow heart: MSU "fewer than Atlantic" against PA counts of 67–80 %.
    - Chieftain PVY: PUSA "resistant" against CFIA "susceptible" and the 2018 inoculation data.
    - Katahdin drought: CFIA against the 1931 paper.
    - Caribou Russet maturity: from "mid-season" to "late".
    - Superior SG: CFIA "medium" against UW "high"; measured 1.071–1.073.
    - Dark Red Norland Verticillium: UMaine "MR" against CFIA's "susceptible" for Norland.
15. **Penn State 2017 and 2018 were unusual years.** 2018 had "the highest [rainfall] over the last 124 years" in July–August, and specific gravity and yields were depressed. Its indices are used for ranking only; Maine or MSU numbers set the absolute levels.
