# 02 — Late blight (Phytophthora infestans): forecasting and epidemiology

Research slice for "The County". Scope: Blitecast and its parts (Wallin severity values, Hyre rain-favorable days, spray matrix), the UK and Irish rules, epidemic parameters for a daily step over a grid of hills, initial inoculum, protectant fungicides, cultivar resistance, tuber blight, and the Maine and Northeast years used to validate the result.

Labels used throughout:

- **[SOURCED]**: the number or rule appears in a source I opened, with the location given.
- **[DERIVED]**: plain arithmetic on sourced numbers. The arithmetic is shown.
- **[INVENTED]**: a game-design choice with no source behind it. It must stay labelled as invented in the game.
- **[UNCONFIRMED]**: remembered, or seen only in a search-result snippet, and not confirmed in an opened source.

Units: SV means a Wallin/Blitecast daily severity value (0 to 4). "RH90 hours" means hours with relative humidity at or above 90 percent. T_w is the mean air temperature during those hours.

---

## 1. What the simulation should implement

### 1.0 The recommended model in one page

The model has three layers. All three run off the daily inputs the project already has: Tmax, Tmin, precipitation, RH90 hours with T_w, wind, cloud and ET0.

1. **Forecast layer.** This is what a Maine grower actually saw. Each day it computes the Wallin severity value (SV) from RH90 hours and T_w, the Hyre rain-favorable day, and the 7-day and since-emergence SV totals. From those it gives the Blitecast or NoBlight spray advice. The player sees this as the extension advisory, and none of it is invented (sections 1.1 to 1.3).
2. **Epidemic layer.** This runs on the grid of hills. Each hill carries a blighted-foliage fraction, a queue of latent infections and a protectant residue. New infection on a hill on a given day is driven by three things:
   - the day's SV, which is the weather gate;
   - the spores arriving from infectious hills through a Laplace dispersal kernel, plus outside inoculum;
   - a cultivar factor and the protectant protection on that hill.

   Latent infections become infectious after a temperature-dependent latent period. Protectant residue decays daily and washes off with rain (sections 1.4 and 1.5).
3. **Calibration anchor.** MacKenzie (1981) gives the field-scale relation: in a uniform field, the logit of the blighted fraction rises by about **r_SV × SV** per day. r_SV is about 0.5 per SV for susceptible cultivars, about 0.3 for "average" ones and 0.2 for resistant ones. Fry (1977, 1978) gives the matching rates per day in favorable weather: 0.2 to 0.7 per day unsprayed, and roughly 0.12 to 0.16 per day under a weekly protectant. Tune the hill model until a large uniform grid reproduces these numbers (section 1.6).

Tuber blight and storage are handled at harvest-relevant moments, covering spores washed into the soil, hilling depth, the vine-kill interval and the storage regime (section 1.7). Initial inoculum comes from three sources the player can influence: seed source, cull piles, and the regional level for the year (section 1.8).

### 1.1 Wallin severity values (the core of Blitecast and of Maine's NoBlight)

**Rule [SOURCED].** One severity value is assigned per period of continuous RH ≥ 90 percent, from its duration in hours and its mean temperature. Values accumulate from emergence.

| Mean temperature during the RH≥90 period | SV 0 | SV 1 | SV 2 | SV 3 | SV 4 |
|---|---|---|---|---|---|
| 7.2–11.6 °C (45–53 °F) | ≤15 h | 16–18 | 19–21 | 22–24 | 25+ |
| 11.7–15.0 °C (54–59 °F) | ≤12 h | 13–15 | 16–18 | 19–21 | 22+ |
| 15.1–26.6 °C (60–80 °F) | ≤9 h | 10–12 | 13–15 | 16–18 | 19+ |
| below 7.2 °C or above 26.6 °C | 0 | | | | |

Sources:

- UC IPM model 12 (Wallin) gives exactly these °C bands and hours.
- MacKenzie 1981 (Plant Disease 65:394, Fig. 1) gives the °F bands "45–53", "54–59", "60–80 °F".
- UMaine Bulletin 2418 Table 1 prints the same hour bands with °F bands 45–54, 55–59 and 60–81. It labels the zero column "<15", "<12" and "<9", which leaves the boundary hour ambiguous. UC IPM's "15 or fewer" resolves it.

**Compact formula [DERIVED; it reproduces every cell of the table above]:**

```
k = 4 if 7.2 <= T_w < 11.7 ; 3 if 11.7 <= T_w < 15.1 ; 2 if 15.1 <= T_w <= 26.6 ; else SV = 0
SV = clamp( floor((H - 1) / 3) - k , 0 , 4 )      # H = continuous RH>=90 hours
```

Check: warm band, H=9 gives floor(8/3)−2 = 0, H=10 gives 1, H=19 gives 4. Cool band, H=15 gives 0 and H=16 gives 1.

**NoBlight extension (Maine) [SOURCED, UMaine 2418].**

- Above the table, SV = (H − 1)/3 − 4 for the cool band above 27 h, − 3 for the middle band above 24 h, and − 2 for the warm band above 21 h. NoBlight therefore does not cap SV at 4, so 22–24 h in the warm band gives 5.
- NoBlight keeps a period going until RH falls below **76.5 percent**, not 90 percent. The bulletin says this "adds a half hour or more onto the typical Wallin hours" and makes the values "more conservative".
- Accumulation starts at **50 percent emergence**.
- The bulletin's worked example is an 18-hour period. It gives 3 SV at 65 °F, 2 at 56 °F, 1 at 50 °F, and 0 at 40 °F or 85 °F. "Three separate six-hour periods ... will not accumulate any severity values."

**Implementation notes for the game.**

- The daily input "RH90 hours" must be the longest *continuous* run, not the day's total. Separate short wet spells give 0 SV (UMaine 2418). Pass this to the weather-pipeline researcher.
- Day boundary: Fry's Simcast uses a 24-hour window from **noon to noon** (UC IPM model 3: "Blight unit estimation period is 24 hr (noon to noon)"). That captures a whole humid night in one day. I could not confirm the boundary that the original Blitecast (Krause et al. 1975) used, because the paper is not online. Recommendation: compute the day's RH90 run over noon to noon [DERIVED from Simcast practice].

### 1.2 Hyre rain-favorable days and the Blitecast spray advice

**Rain-favorable day, Blitecast version [SOURCED, MacKenzie 1981 p.396 and UC IPM model 10/11].** A day is rain-favorable when two conditions hold:

- the 5-day average temperature is **below 25.5 °C** (77.9 °F);
- the rainfall total for the previous 10 days is **3 cm or more** (1.18 in).

A day with a minimum below **7.2 °C** (45 °F) is unfavorable whatever the rain.

**Hyre's own 1954 rule [SOURCED, Hyre 1954, Plant Disease Reporter 38:245–253, opened via archive.org].** Hyre's original rule used a 7-day mean temperature not exceeding **77 °F**. He tested 75, 77 and 79 °F and found 75 °F the least accurate. Rain was favorable when the 10-day rainfall was at or above the 10-day normal, which was 1.21 in for Connecticut. Blight was forecast after **10 consecutive favorable days**. That was "83 percent correct in the 52-year period of 1902-53". Blitecast replaced Hyre's 7-day mean with the 5-day mean and fixed the rain threshold at 3 cm.

**Blitecast first spray [SOURCED].** Accumulation runs from "distinct green rows" to vine kill. The first spray is recommended when either trigger fires:

- **10 rain-favorable days** (MacKenzie: "10 consecutive blight-favorable days");
- **18 severity values** (UC IPM gives 18; MacKenzie gives "18–20 units").

Blight itself is expected 7–14 days later (UC IPM). Maine's NoBlight uses the SV trigger only: 18 SV from 50 percent emergence (UMaine 2418; UMaine Fungicide Schedule 2024).

**Blitecast spray matrix, applied weekly from the last 7 days [SOURCED, UC IPM model 10; the same content is in MacKenzie 1981 Table 1].**

| Rain-favorable days in last 7 | 7-day SV <3 | 3 | 4 | 5 | 6 | >6 |
|---|---|---|---|---|---|---|
| fewer than 5 ("low rainfall") | −1 | −1 | 0 | 1 | 1 | 2 |
| 5 or more ("high rainfall") | −1 | 0 | 1 | 2 | 2 | 2 |

The message codes mean:

- −1: no spray;
- 0: alert, recheck in 2–3 days, and go to 7-day sprays if blight weather is forecast;
- 1: 7-day schedule ("moderate spray" in MacKenzie);
- 2: 5-day schedule ("heavy spray").

UC IPM adds: "Some researchers have advised reverting to a regular spray schedule at 1% disease severity." MacKenzie gives the same rule as Blitecast's second threshold: "CEASE FORECASTING AT 1.0%".

**NoBlight spray interval (Maine) [SOURCED, UMaine 2418 Table 2].**

| 7-day SV, rain < 1.18 in | 7-day SV, rain ≥ 1.18 in | Interval |
|---|---|---|
| ≥ 6 | ≥ 5 | 5 days |
| ≥ 5 and < 6 | ≥ 4 and < 5 | 7 days |
| > 4 and < 5 | > 3 and < 4 | 10 days |
| ≤ 4 (printed "≥4") | ≤ 3 (printed "≥3") | 10–14 days |

The last row is printed with "≥", which must be a typo for "≤" because otherwise the rows overlap. Read it as ≤ [DERIVED].

### 1.3 Other rules for comparison (all [SOURCED] unless marked)

- **Smith Period (England and Wales, Smith 1956)** (UC IPM model 14): two consecutive days, each with minimum temperature ≥ 10 °C and at least 11 hours of RH ≥ 90 percent. In trials it gave the same number of sprays as routine programs in high-risk areas and "3 to 5 fewer sprays" in low-risk areas. The day boundary, which I remember as 24 h ending 0900 GMT, is **[UNCONFIRMED]**.
- **Hutton Criteria (GB national system since 2017, replaced Smith)** (AHDB project page): "two consecutive days with a minimum temperature of 10°C" and "at least 6 hours each day with a relative humidity ≥90%". It was adopted because experiments with contemporary isolates found "significant levels of infection under drier (less humid) conditions" than Smith assumed. Corteva's "near miss" variant (5 h, or a 9 °C minimum) appears only in a search snippet **[UNCONFIRMED]**.
- **Beaumont rule (England)** (MacKenzie 1981 p.395–396): at least 48 consecutive hours with RH above 75 percent and temperature above 10 °C. Outbreaks are expected 2–3 weeks later.
- **Irish Rules (Bourke 1953)** (UC IPM model 13):
  - A spell starts after 12 h of RH ≥ 90 percent and T ≥ 10 °C, provided rain falls between hours 7 and 15. Without rain the spell needs 16 h.
  - Effective blight hours (EBH) then accumulate at 1 EBH per hour for as long as the conditions hold. Spells separated by 5 h or less are merged.
  - "25 EBH or more during the preceding 10 days" signals significant development.
  - Warnings are issued at intervals of no less than two weeks, because sprays "generally protect crops for two weeks".
- **Cook (Virginia)** (UC IPM model 15): favorable when cumulative rain is above a critical rainfall line and the 7-day mean is below 75 °F. Two consecutive favorable weeks are needed.
- **Fry/Simcast "simulation forecast" (Fry, Apple and Bruhn 1983)** (UC IPM model 3). This one is worth implementing as an alternate advisory because it encodes **cultivar resistance** and **fungicide weathering**.
  - **Blight units (BU)** per noon-to-noon day come from the consecutive RH ≥ 90 hours and their mean temperature, read from the table below.
  - **Fungicide units (FU)** for chlorothalonil come from the day's rain in mm and the days since the last spray, read from the second table below.
  - Spray when more than 5 days have passed since the last spray, *and* either BU since the last spray exceeds **30 (S), 35 (MS) or 40 (MR)**, or FU exceeds **15, 20 or 25**.

  Blight units (S = susceptible, MS = moderately susceptible, MR = moderately resistant). Each cell gives the hours of consecutive RH ≥ 90 that produce that many BU. A blank means that BU value does not occur for that row. Below 3 °C and above 27 °C the BU is always 0.

  | T_w (°C) | Class | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
  |---|---|---|---|---|---|---|---|---|---|
  | 23–27 | S | ≤6 | 7–9 | 10–12 | 13–15 | 16–18 | 19–24 | | |
  | 23–27 | MS | ≤9 | 10–18 | 19–24 | | | | | |
  | 23–27 | MR | ≤15 | 16–24 | | | | | | |
  | 13–22 | S | ≤6 | | | | | 7–9 | 10–12 | 13–24 |
  | 13–22 | MS | ≤6 | 7 | 8 | 9 | 10 | 11–12 | 13–24 | |
  | 13–22 | MR | ≤6 | 7 | 8 | 9 | 10–12 | 13–24 | | |
  | 8–12 | S | ≤6 | 7 | 8–9 | 10 | 11–12 | 13–15 | 16–24 | |
  | 8–12 | MS | ≤6 | 7–9 | 10–12 | 13–15 | 16–18 | 19–24 | | |
  | 8–12 | MR | ≤9 | 10–12 | 13–15 | 16–24 | | | | |
  | 3–7 | S | ≤9 | 10–12 | 13–15 | 16–18 | 19–24 | | | |
  | 3–7 | MS | ≤12 | 13–24 | | | | | | |
  | 3–7 | MR | ≤18 | 19–24 | | | | | | |

  Fungicide units for chlorothalonil. Each cell gives the daily rain in mm that produces that many FU on that day.

  | Days since spray | 1 FU | 2 FU | 3 FU | 4 FU | 5 FU | 6 FU | 7 FU |
  |---|---|---|---|---|---|---|---|
  | 1 | <1 | | | 1 | 2–3 | 4–6 | >6 |
  | 2 | <1 | | 1 | 2–4 | 5–8 | >8 | |
  | 3 | <1 | | 1–2 | 3–5 | >5 | | |
  | 4–5 | <1 | | 1–3 | 3–8 | >8 | | |
  | 6–9 | <1 | | 1–4 | >4 | | | |
  | 10–14 | <1 | 1 | 2–8 | >8 | | | |
  | >14 | <1 | 1–8 | >8 | | | | |

  The table above is my reading of the HTML table on the UC IPM page, which lost its alignment when converted to text. The column placement in the 13–22 °C S row (≤6 → 0, then 7–9 → 5) agrees with my memory of the published Simcast table.

### 1.4 Epidemic layer on the hill grid

The order of the daily step and the formulas follow. Everything that comes from a paper is marked. The structure (which compartments, which order) is a design choice [INVENTED], built to reproduce the published field-scale behaviour in section 1.6.

**State per hill i:**

- foliage area A_i, from the crop-model slice;
- blighted fraction x_i in [0, 1];
- a latent queue L_i[k] holding new infections by age in days;
- infectious lesion area I_i;
- protectant residue R_i in [0, 1];
- foliage protected at the last spray, A_sprayed,i;
- tuber state (healthy or blighted per tuber, or a blighted fraction).

**Daily steps:**

1. **Weather gates.**
   - SV_day from section 1.1.
   - `wetDay = SV_day > 0`.
   - `hot = Tmax ≥ 32 °C` [DERIVED from Wallin and Waggoner 1950: cyclic sporulation and infection continue "providing the daily maximum temperatures remain well below 90° F", and sporangia are susceptible "to injury at temperatures above 80° F. and relative humidities below 90%"].
   - `sunny = cloud cover low`. The project's cloud input maps to the solar-radiation classes in step 5.
2. **Latent progression.**
   - Each latent cohort ages one day.
   - A cohort becomes infectious when its age reaches LP(T_mean), using the table in this step [DERIVED from the points listed below].
   - The newly infectious area joins I_i.
   - Lesions keep enlarging for a few days and then die. Bruhn and Fry 1981 have lesions expand for (10 − LP) days, sporulate for (15 − LP) days, and all lesions are finished by day 15.

   | Daily mean T | LP (days) |
   |---|---|
   | < 10 °C | 7 |
   | 10–13 °C | 5–6 |
   | 13–23 °C | 4 |
   | > 23 °C | 4–5 (rising) |

   The table is derived from these points:
   - BLIGHTSIM: minimum latent period 57 h (US-23 isolate), "57.5 to 118.5 h (with an average of 77 h) depending on temperature", optimum near 22–23 °C;
   - UMaine 2441: "lesions appear on leaves in about 7 days after infection. Under ideal conditions ... as little as 5 days", and "About 7 days after infection, the lesion will sporulate";
   - Johnson 2010: latent period "5 to 6 days" on young stems;
   - Skelsey: λ fixed at 5 days;
   - Fry et al. 2013: the cycle "can be completed within 96 hours under conditions optimal for the pathogen".
3. **Lesion expansion within a hill** (no new spores needed). Each infectious or expanding lesion grows radially at ρ(T, cultivar).
   - Skelsey Table 4 (leaflets at 15 °C) gives Bintje (Dutch rating 3, very susceptible) 4.75 × 10⁻³ m/day, Remarka (6.5) 2.71–3.92 × 10⁻³, and Aziza (7.5) 0.30–3.05 × 10⁻³.
   - The temperature optimum for lesion growth is 24 °C (BLIGHTSIM).
   - In the hill model this can be a growth of x_i by a factor proportional to ρ for up to (10 − LP) days per cohort [DERIVED from Bruhn and Fry 1981].
4. **Sporulation** happens only on wet days.
   - Spores from hill j = I_j × σ × s(T_w) × [wetDay], and zero on `hot` days.
   - UMaine 2441: "Older lesions will sporulate only when temperatures are between 60°F and 70°F with more than 10 hours of high relative humidity."
   - Harrison and Lowe 1989: abundant sporangia at 90–100 percent RH in still air, "but not at 85 or 80% RH".
   - s(T) peaks at 15–18 °C. Mizubuti and Fry 1998 put the maximum at 15 °C, and Becktell et al. 2005 report that sporulation was "greatest ... at 18°C and was nearly absent at 28°C".
   - Sporulation density σ is about 2 × 10⁸ to 4.5 × 10⁸ sporangia per m² of lesion. Skelsey Table 4 gives Bintje 2.31–4.55 × 10⁸. Becktell gives 20,000–24,000 per cm², which is 2.0–2.4 × 10⁸ per m² [DERIVED]. UMaine says a typical lesion produces "up to 250,000 spores per day".
5. **Dispersal and survival.**
   - Within the field, use a radial Laplace kernel K(d) = (α² / 2π) · e^(−α·d). The normalization is the standard one for a 2-D Laplace kernel [DERIVED]. α = **0.82 m⁻¹** (mean dispersal distance 2.44 m) in non-irrigated potatoes and **2.1 m⁻¹** (0.95 m) in irrigated potatoes. Skelsey thesis ch. 2 parameterized these from Paysour and Fry 1983. Skelsey also notes: "Most airborne sporangia are deposited within several meters of the inoculum source."
   - Spores that escape the field are lost.
   - Spores arriving from outside the field are a separate term Q_ext (section 1.8).
   - Survival in transit depends on sun:
     - On sunny days (above 600 W/m²) "the viability of sporangia decreased by approximately 95%" after 1 h. The time to kill 95 percent was 1.1 h and the dose was 2.6 MJ/m². On overcast days (below 300 W/m²) "survival after 3 h was reduced only slightly" (Mizubuti, Aylor and Fry 2000).
     - Survival fraction = exp(−1.15 × solar dose in MJ/m² during transport) [DERIVED: −ln(0.05)/2.6].
     - Within the canopy and under cloud, survival ≈ 1. On a sunny day, external inoculum ≈ 0.
   - Dried sporangia have a half-life of 5.5 h at 15–20 °C. At 30 °C the half-life is 1.4 h at 40 percent RH and 3.8 h at 88 percent RH (Minogue and Fry 1981).
6. **Infection** happens only on wet days, for each hill i.

   ```
   pressure_i = Σ_j K(d_ij)·Spores_j·cellArea + Q_ext,i
   newInf_i   = (1 - x_i) · [1 - exp( -β · c_cult · (1 - P_i) · g(SV_day) · pressure_i )]
   ```

   - g(SV) = SV / 4 [INVENTED shape: the weather gate scales with Wallin's severity, which was built to reflect the hours of favorable humidity and temperature the pathogen needs].
   - c_cult is the cultivar factor from section 1.9.
   - P_i is the protectant protection from section 1.5.
   - β is a single calibration constant, tuned so the uniform-field behaviour matches section 1.6 [INVENTED value, SOURCED target].
   - Infection-efficiency evidence:
     - Becktell 2005 found 13–23 °C "generally were conducive to establishment. Very little establishment occurred at 28°C", with "minimum leaf wetness period ... 2 h" and "most establishment occurred within 6 h".
     - Crosier 1934, cited by Skelsey, gives a minimum of 2–3 h of leaf wetness at an optimum of 20 °C.
     - Skelsey measured infection efficiency ι at 0.02–0.033 on susceptible cultivars and 0.0007–0.01 on resistant ones.
     - A stricter alternative gate from Skelsey (after Rotem et al. 1970) treats an "infection-hour" as any hour at 10–27 °C with RH above 90 percent. Infection completes only after 12 consecutive infection-hours at 10–15 °C, 18 at 15–20 °C, or 24 at 20–27 °C. Below 10 °C and above 27 °C there is none. I recommend the Wallin gate because Maine used it and it uses the project's inputs directly.
   - New infections go into latent cohort 0.
7. **Leaf death and removal.** Blighted area is removed from the crop model's green leaf area every day. Blighted area includes lesions past their sporulating age, which die at age 15 days (Bruhn and Fry 1981). Fry et al. 2013: "A heavily infected leaflet can become completely necrotic and dry up within a few days of becoming symptomatic."
8. **Persistence through hot, dry spells.**
   - In hot, dry weather there are no new infections and no sporulation, but infected stems keep the pathogen alive. Fry et al. 2013: "the pathogen can survive longer in stems, presumably as long as the stem contains some living cells and moisture." Dry leaflets do not carry it: "We are aware of no reports of hyphae or sporangia surviving in such dry tissue."
   - So during a dry spell, keep a small "stem reservoir" on each infected hill that resumes sporulating on the next wet day [DERIVED].
   - Field evidence: in the Netherlands in 1994, "Due to hot and dry weather in July, disease intensities decreased and almost no newly infested potato sites were found. After this dry period ... actively sporulating foliar lesions were found" (Zwankhuizen thesis ch. 2).

### 1.5 Protectant fungicides

**Residue decay and rain wash-off [SOURCED, Bruhn and Fry 1981].**

```
R_t = 0.90 · R_(t-1) · exp(-0.56 · rain_cm)
```

The paper writes this as r_t = k·r_(t−1)·e^(b·rain), with "k equals 0.90 and b equals −0.56 per centimeter of rain", for a chlorothalonil-like protectant deposited at 2.5 µg a.i./cm². Consequences [DERIVED]:

- Half-life without rain is 6.6 days.
- 1 cm of rain removes 43 percent of the remaining residue.
- 1 in (2.54 cm) removes 76 percent.
- 2 in removes 94 percent.

A gentler rule of thumb comes from Wisconsin Extension (Gevens, UW Vegetable Pathology Update 8, 7 July 2024): "roughly 50% of fungicide residues are typically washed off with 1 inch of rain" and "~100% of residues are washed off with 2+ inches of rain". I would use the Bruhn and Fry formula, which is potato-specific and published, and note the range.

**Protection from residue.**

- Bruhn and Fry's dose response is "linear on a log10 concentration-probit proportion inhibition scale with an intercept of 7.60 and slope of 2.07".
- With deposit = 2.5 µg/cm² × R: P = Φ(7.60 + 2.07·log10(2.5·R) − 5) [DERIVED from the sourced coefficients].
- That gives P ≈ 0.9997 at R = 1, 0.91 at R = 0.1, and 0.24 at R = 0.01.
- The authors caution that "certain features of fungicide deposition and loss were oversimplified" and that the results "should not be used for making specific management recommendations".
- A simpler alternative from Skelsey (fluazinam): infection efficiency drops to 1 percent of maximum on the spray day and recovers following ι = ι_min + (ι_max − ι_min)/(1 + (t50/(t − ta))^β), with t50 = 9 days and β = 20.

**New foliage is unprotected [SOURCED].**

- Skelsey eq. 7 dilutes protection by new leaf area: ι = min(ι_max, (LAI·ι + ΔLAI·ι_max)/(LAI + ΔLAI)).
- UMaine Fungicide Schedule 2024: "When growing rapidly, potato plants can double their leaf area in five days or less. This could leave half of the leaf area unprotected."
- UMaine checklist: "Late blight usually starts in the tops of plants that were missed or outgrew the fungicide."
- Game rule: P_i,effective = P_i × A_sprayed,i / A_i [DERIVED].

**Protectants work only before infection [SOURCED].**

- Chlorothalonil, mancozeb and copper are listed as "Protectant" in UMaine's 2024 schedule, as opposed to "Locally systemic" or "Systemic".
- Skelsey models protectants as reducing infection efficiency only.
- Fry 1977: "Because mancozeb does not persist long on leaves ... plots sprayed according to the 1.27 cm of rain technique or 'Blitecast' were unprotected during this initial period when the environment was especially conducive", and the gap persisted to season end.
- UMaine 2441: "once late blight reaches a high proportion in the field, fungicides will not control the pathogen and the field will likely reach 100 percent infection."
- Game rule: a spray does nothing to infections already in the latent queue or already infectious [DERIVED].
- A spray on a day with heavy rain mostly washes off. Labels require drying time of "30 minutes to 2 hours" (Gevens 2024).

**Percent control (field trials) [SOURCED].**

- Fry 1977, Table 1, Katahdin, Ithaca NY, 1974:

  | Treatment | Sprays | Final foliar blight | Tuber blight | Yield (kg/ha) |
  |---|---|---|---|---|
  | Untreated | 0 | 89.0% | 59.2% | 24,400 |
  | 7-day mancozeb 1.79 kg/ha | 9 | <0.1% | 3.2% | 37,500 |
  | Blitecast | 5 | <0.1% | 7.8% | 40,000 |

  On final foliage this is about 99.9 percent control [DERIVED].
- Fry 1978, Table 1: weekly mancozeb on Hudson cut relative AUDPC from 0.54 untreated to 0.28, 0.25, 0.15 and 0.04 at 0.22, 0.44, 0.89 and 1.79 kg/ha. Final disease went from 0.98 to 0.35. Full rate weekly is about 93 percent AUDPC control [DERIVED].
- Fry 1977, Table 3: under weekly protection the apparent infection rate r fell to 0.112–0.157 per day, against 0.469 (Russet Rural) and 0.233 (Sebago) in adjacent unsprayed plots.
- Copper: no comparative efficacy figure found **[gap]**. UMaine lists the coppers as M1 protectants and says to "Apply no more than 7-10 day intervals" and, "Under conditions of severe disease, consider using high rates and tank-mixing". In the game copper should be a weaker protectant [INVENTED magnitude].

**Spray intervals and seasonal counts in Maine [SOURCED].**

- Chlorothalonil has been "the principal fungicide" against late blight since the 1970s, with "15 to 20 applications made in a season" historically. Today growers typically use "fewer than 12-15 applications" (Bangor Daily News, 19 Sep 2019, quoting UMaine's S. Johnson). It "might need to be sprayed weekly to maintain 'protective coverage'".
- In 1971, 96 percent of the potato acreage in the northeastern USA was sprayed with protectant fungicide (Fry 1977, citing USDA ERS).
- High-risk years: in 2024 "all areas should spray every five days" (BDN, 12 Aug 2024). In 2025 growers were told to "stay on a five-day protectant spray" (The County, 7 Jul 2025) and to keep "a 5-day spray schedule" (Maine Public, 1 Jul 2025).
- 2024 label limits from the UMaine schedule:
  - chlorothalonil 0.6 lb a.i./A for the first spray, then 0.75–1.125 lb a.i./A, with "Do not exceed 11.25 lbs ai/A per year". At the full rate that is a cap of about 10 sprays [DERIVED].
  - mancozeb "Do not apply more than 11.2 lb a.i./A per year". The preharvest interval is 3 days in Maine, and "Vine kill should occur 14 days before harvest".
- Forecast-timed vs calendar (Fry 1977): 7-day schedules used 9–11 sprays per season, against 5–7 under Blitecast, with equal yield. In Pennsylvania in 1974–76, Blitecast would have saved 1.2–2.9 sprays per season (MacKenzie 1981 Table 2).

**Cost per application and per season across eras [SOURCED; currency of the year].**

| Year and place | Figure | Source |
|---|---|---|
| 1974–76, Pennsylvania | $19/ha per application (≈ $7.7/acre [DERIVED]); 2.3 kg/ha fungicide | MacKenzie 1981 Table 2 footnote |
| c. 1980, New York (simulation) | $19.77/ha per application | Bruhn and Fry 1981 |
| 1994–95, Columbia Basin, WA/OR | sprays rose from 2.5 (light year 1994) to 10 (severe year 1995) at $450/ha | Fry and Goodwin 1997 |
| 1995, Columbia Basin, WA/OR | fungicide material $4.90/acre (copper hydroxide) to $36.00/acre (propamocarb + chlorothalonil); season protection $106.77–110.08 (early/mid) and $149.30–226.75 (late) per acre; vine desiccation $34.48/acre | Johnson et al. 1997 abstract |
| 2006–2008, Maine | all chemicals $228–263/acre; 2008 estimate $429/acre; "In 2007, weather was relatively good, enabling growers to keep input costs, primarily chemical applications, to a minimum. In 2008 ... the weather and threat of blight required larger and more frequent applications" | Maine Potato Board Cost of Production Study 2008, Table 3 |
| 2022/23, Manitoba | 11 contact fungicide applications at CAD $8.00/acre, 2 systemic at $23.00, 3 phosphorous acid at $31.00 | Manitoba Agriculture Cost of Production, irrigated potato |

Guenthner, Michael and Nolte 2001 (US average of $507/ha in fungicide plus lost revenue) is **[UNCONFIRMED]**: I saw it only in a search summary and could not open the paper.

### 1.6 Calibration targets for the epidemic layer [SOURCED]

These are the behaviours a large uniform grid of hills should reproduce.

1. **Logit per severity value (MacKenzie 1981, Fig. 4 and text).**
   - Blitecast assumes an epidemic starts at 0.0001 percent ("one lesion on one plant in a thousand", logit −13.82) and progresses "as a compound interest epidemic".
   - The time axis is SV, "rather than days".
   - Lines are drawn for "r" = 0.5, 0.3 and 0.2 per SV. Russet Rural, Superior and "Bentje" sit on the steep line. Kennebec, Sebago, Green Mountain and Katahdin sit on the middle group. This is read from the figure labels.
   - "Those not possessing a measure of rate-limiting resistance (such as Russet Rural) can reach the spray threshold by 12 severity values and 1.0% disease severity by 18."
   - For an average cultivar, about 18–20 SV are needed to reach 0.1 percent and "about 8-10 severity values" more to go from 0.1 to 1 percent.
   - The Table 2 footnote uses "0.5 units/units/day for the susceptible cultivar and ... 0.2 units/units/day for the resistant cultivar".
   - Uniform-field rule: Δlogit(x) per day = r_SV × SV_day. From 0.0001 to 0.1 percent takes 13.8 SV at r_SV = 0.5, 23 SV at 0.3 and 34.5 SV at 0.2 [DERIVED].
2. **Apparent infection rate per day, unsprayed, favorable weather.**
   - Fry 1978 Table 2 (Ithaca, 1976):

     | Cultivar | r per day |
     |---|---|
     | Superior | 0.68 |
     | Hudson | 0.47 |
     | Russet Burbank | 0.35 |
     | Katahdin | 0.33 |
     | Kennebec | 0.24 |
     | Sebago | 0.21 |
     | Green Mountain | 0.20 |
     | L-521-7 (breeding line) | 0.12 |

   - Fry 1977: unsprayed Katahdin in 1974 "had an average apparent infection rate (r) of 0.55 per unit per day. The proportion of tissue affected increased from about 1% to about 90% during the last 18 days of the season." Russet Rural 0.469, Sebago 0.233 (1975).
   - Bruhn and Fry 1981 (observed, Freeville NY), days from inoculation to 50 percent blight:

     | Cultivar | 1977 | 1978 | 1979 |
     |---|---|---|---|
     | Monona | 20 | | 26 |
     | Katahdin | 28–30 | | 28–30 |
     | Kennebec | 34–38 | 29–32 | |
     | Sebago | 37–38 | 27–32 | 32–34 |

3. **How fast an unprotected susceptible field is destroyed.**
   - Wallin and Waggoner 1950 (Iowa): blight appeared within 7 days of inoculation, and "At the end of three weeks, 100 percent of the potato plants in the peat plot were diseased". At Clear Lake the "extensity of blight very nearly doubled every seven days", and "Five weeks after initial sporulation 100 percent of the plants were infected".
   - UMaine 2441: in cool, wet weather blight "may move rapidly from leaves to petioles and stems and infect an entire field in only a few days".
   - Target for the game: unsprayed susceptible foliage goes from first-noticed (~1 percent) to ~90 percent in about 2.5 weeks of favorable weather [DERIVED from Fry 1977].
4. **Season totals.**
   - Cumulative Blitecast SV in Pennsylvania, 1974–76: "81% of the BLITECAST stations ... had cumulative severity values below 90, with 42% below 60" (MacKenzie 1981 Fig. 3).
   - One Pennsylvania station accumulated about 92 SV in 1976, about 73 in 1975 and about 35 in 1974 by September (read from Fig. 2).
   - Running Caribou weather through the SV code should give totals of a similar order. If Caribou routinely produces several hundred SV, the RH90 input is probably counting non-continuous hours.
5. **Growers usually notice blight at about 1 percent severity** (MacKenzie: "Most growers discover blight at about 1.0% disease severity"). Use this as the scouting detection threshold for a field, and lower it for a careful scout.

### 1.7 Tuber blight, hilling, vine kill and storage

**How spores reach tubers [SOURCED, UMaine 2441].**

- "Tuber infection occurs when the spores from the foliage are washed into the soil."
- Zoospores "predominate at soil temperatures between 40°F and 55°F", and "Tuber infections with soil temperatures greater than 65°F are not common."
- "Sporangia can survive for days or even weeks in the soil but, most commonly, tuber infection occurs soon after sporangia movement into the soil."
- At harvest, infection comes from "contact between tubers and spores ... with infected green foliage", and "Skinning of the tubers during harvest greatly increases the risk."
- Soil survival: US-8 and US-11 sporangia "survived a maximum of 23 to 30 days" in soil, longer in wet soil, and shorter unshaded and in dry soil (Porter et al. 2007, Plant Disease 91:835).

**Daily tuber hazard for hill i [DERIVED structure; INVENTED constants].**

```
soilSpores_i += w · Spores washed from hill i and neighbours   when rain (or irrigation) ≥ threshold
soilSpores_i *= survival per day                               (gone within ~23–30 days; faster when dry/sunny)
tuberInfection_i = 1 - exp( -γ · soilSpores_i · depthFactor · soilTempFactor · cultivarTuberFactor )
soilTempFactor: 1 at 4–13 °C (40–55 °F), tapering to ~0 at ≥ 18 °C (65 °F)
```

**Hilling and depth [SOURCED].**

- Glass et al. 2001: tubers "covered with more than 15 cm of soil had a lower incidence of blight (1 to 14%) than tubers with less soil cover (13 to 59%)". Hill-size treatments "had little effect" overall, and black-film mulch cut incidence (32 percent against 56 percent, and 9 against 20 percent).
- Nyankanga et al. 2008: "Tubers set at a soil depth of more than 7 cm had lower tuber blight incidence", and "hilling provided partial protection of tubers but its effectiveness was limited in the presence of favourable conditions".
- Porter et al. 2005: "infection was rare on tubers at 5 cm or deeper" (pot study).
- UMaine checklist: "Make the final hill big ... Shallow tubers are more susceptible."
- depthFactor ≈ 0.25 for a well-hilled crop and 1 for shallow or unhilled tubers [DERIVED from the Glass ranges, which give ratios of about 0.1–0.25].

**Vine kill and the wait before digging [SOURCED].**

- UMaine 2441: "A minimum of two weeks—preferably three weeks—after vine kill should occur before harvest. This allows the skin to set and lowers the numbers of viable spores in the soil."
- UMaine 2417 says the same, adds that "Green digging ... significantly increases the risk of late blight incidence", and prefers chemical vine kill or flaming over mechanical.
- NDSU: kill vines completely "two to three weeks before harvest".
- Miller et al. 2002: "Killing potato haulms 2 to 3 weeks prior to harvesting tubers is recommended ... to eliminate the foliage as a source of tuber blight inoculum."
- UMaine checklist: "If late blight is present, consider killing vines before heavy rains occur ... pushing a few more days ... can be lead to disastrous levels of tuber infection."
- Game rule: harvest-contact infection probability scales with the infectious foliage still alive at digging and with soilSpores remaining. Soil spores decay over the interval since vine kill, at roughly 1/2 every 5 days [INVENTED, consistent with the 23–30 day maximum survival].

**Calibration targets for the share of tubers blighted [SOURCED].**

- Unsprayed Katahdin 59.2 percent (Fry 1977, NY 1974).
- Unsprayed Russet Rural 34 percent and Sebago 9.1 percent (Fry 1977, 1975).
- Protected plots 1.7–11.3 percent (Fry 1977 Tables 1 and 4).
- New York trials 1–40 percent and Michigan 0–15 percent across years (Kirk et al., tuber blight model validation abstract, Crop Protection 2011).

**Storage [SOURCED].**

- UMaine 2441: "Under cool, dry storage conditions, tuber lesions develop slowly as typical dry rots. Often, secondary organisms invade ... complete breakdown", and "Under proper storage management, tuber-to-tuber spread of late blight is minimal or absent."
- UMaine 2417: cool "to the curing temperature of 50 °F as quickly as possible", and store suspect tubers "at 38 °F with 85% humidity". "Before storage, tubers need to be graded for late blight."
- UMaine checklist: "Late blight will progress rapidly and develop into soft rot on wet, warm potatoes."
- Fry and Goodwin 1997 (northeastern US, 1994): one farmer "had just discarded 300 metric tons of potatoes—only 8 days after harvest ... decomposing rapidly due to bacterial soft rot in the late-blighted potatoes."
- Game rule [INVENTED magnitudes]: blighted tubers are lost. If the harvest is wet and warm and the store is not cooled quickly, a soft-rot multiplier spreads loss to neighbouring tubers. Grading before storage removes visible blight.

### 1.8 Initial inoculum and how growers reduce it [SOURCED]

- **Sources in Maine.** UMaine 2441: "In Maine, the organism ... typically overwinters in infected tubers in cull piles, infected volunteer plants, or in seed." UMaine 2418: "The main sources of initial inoculum are cull piles or infected seed." The pathogen "cannot survive in soil or dead plant debris" (UMaine 2441, for the asexual A1/A2-separate situation). Oospores are a separate case: AHDB says sexual reproduction is "less common in GB" and that oospores "can persist in soil".
- **Normal year.** UMaine Fungicide Schedule 2024: "In a normal year, the expectation is that there would be little or no initial inoculum from Maine seed ... Importing seed from areas where late blight has occurred in the previous season changes the assumption of low initial inoculum."
- **Seed transmission.**
  - Johnson 2010 (greenhouse): the proportion of infected shoots from infected tubers was "0.210 to 0.261 in a moist environment versus 0.013 to 0.052 in a nonmist environment".
  - Fry et al. 2013: "the vast majority of planted infected seed tubers do not lead to an epidemic".
  - Fry and Goodwin 1997: "most infected seed tubers probably do not lead to infections in the foliage, some do".
  - MacKenzie 1981: "two tons of seed are needed to plant a hectare, the likelihood of initial inoculum coming from seed is quite high".
- **Cull and refuse piles.**
  - Bonde and Schultz 1943 (Maine; American Potato Journal 20:112–118, and Maine Agricultural Experiment Station Bulletin 416) first showed cull piles as an inoculum source. I confirmed only the citation and could not open the paper.
  - In Flevoland (Zwankhuizen 1998), 74 percent of commercial fields with early foci were clearly tied to nearby infested refuse piles. Seed tubers, volunteers and gardens "appeared to be of minor importance".
  - The share of refuse piles carrying diseased plants tracked the weather: 9 of 62 (17 percent) in favorable 1994, 2 of 124 in 1995, and 0 of 79 in dry 1996.
  - Gradients downwind of refuse piles (point sources) had a mean exponential slope of **−0.35 m⁻¹**. Downwind of infested organic fields (area sources) the slope was **−0.0045 m⁻¹**, and the region gradient was "approximately 4 km" long. A refuse pile infected fields "up to 900 m away" (Skelsey, summarizing Zwankhuizen).
- **Volunteers.** These were minor in the Netherlands: densities below 1,000 per ha in 1994 and 1996, and about 5,500 per ha in 1995, with no significant disease on them. The UMaine checklist still says to check rock piles and last year's fields for volunteers.
- **What Maine growers do (UMaine checklist).**
  - "Freeze culls. The late blight pathogen requires living tissue to survive."
  - "Field spreading of cull potatoes in Aroostook County must be completed by March 15 or March 30, depending on location."
  - Warm and test seed lots, use mancozeb seed treatments, "Avoid precutting seed", destroy volunteers, and kill infected patches early.
  - Fry and Goodwin 1997: bury culls "in deep pits covered by at least two feet of soil, or (in northern latitudes) ... spread the tubers on the soil surface and allow them to freeze".
- **Game rules [INVENTED magnitudes, SOURCED mechanisms].**
  1. Seed source sets the infected seed-piece fraction: certified Maine seed ≈ 0 to very low, uncertified or imported from a blight area higher. Each infected piece yields a sporulating shoot with probability 0.01–0.05, or 0.2–0.26 if the early season is wet.
  2. A cull pile the player leaves unfrozen and uncovered becomes an infected point source with a weather-dependent probability. Its spores reach the field with weight e^(−0.35·d).
  3. Regional inoculum Q_ext for the year comes from the documented-year list in section 1.10. It arrives only on wet days and is cut to ≈ 0 on sunny days.

### 1.9 Cultivar resistance [SOURCED]

- **Scales.**
  - US forecasts use three classes: susceptible (S), moderately susceptible (MS) and moderately resistant (MR). Simcast thresholds are BU 30/35/40 and FU 15/20/25 (UC IPM model 3).
  - European variety lists use a **1–9 scale** (1 = very susceptible, 9 = very resistant). Examples: Bintje 3, Sante 4.5, Agria 5.5, Remarka 6.5, Aziza 7.5 (Skelsey Table 4 footnote, Dutch National variety list).
- **How resistance changes the epidemic.**
  - It lowers the apparent infection rate: r per SV of 0.5 / 0.3 / 0.2 (MacKenzie), and r per day as in the Fry 1978 table in section 1.6.
  - It works through lower infection efficiency, slower lesion growth and fewer spores (Skelsey Table 4: Aziza against Bintje, ι 0.07 against 2.65 × 10⁻², ρ 0.30 against 4.75 × 10⁻³ m/day).
  - Resistance and fungicide "were additive". "The difference in general resistance between the most resistant and most susceptible clones was estimated to be equivalent to weekly applications of about 0.7 kg mancozeb (a.i.)/ha" (Fry 1978).
  - Bruhn and Fry 1981 simulations: "A 10-day schedule minimized average costs for Monona, the most susceptible cultivar, while fungicide application every 14 days was the most cost-effective alternative for Katahdin and Kennebec."
- **Game mapping [DERIVED].** c_cult = r_cultivar / r_reference, with Katahdin = 1.0 (r 0.33/day). That gives Superior ≈ 2.1, Russet Burbank ≈ 1.06, Kennebec ≈ 0.73, Sebago ≈ 0.64, Green Mountain ≈ 0.61, all from Fry 1978. Ratings for modern Maine cultivars (for example Caribou Russet or Defender) were not found **[gap]**.

### 1.10 Validation years for Maine and the Northeast (1973–2025)

| Year | What is documented | Source (opened) |
|---|---|---|
| 1974–76 | Pennsylvania SV totals by station; "1975, a severe late blight year in southeastern Pennsylvania" | MacKenzie 1981 Table 2 footnote, Fig. 2 and 3 |
| 1974 | Ithaca, NY: unsprayed Katahdin 89 percent foliar blight, r 0.55/day | Fry 1977 |
| 1975 | Ithaca, NY: weather "very conducive" 3–17 Aug; unsprayed Russet Rural reached 100 percent | Fry 1977 |
| 1993 | US-8 was found "in 1993 only in Maine" | Fry and Goodwin 1997 |
| 1994 | "late blight was especially severe in the northeastern United States in 1994. Destruction of foliage was common ... accompanied by severe tuber blight" | Fry and Goodwin 1997 |
| 1994 | Potato chronology entry: severe in "New York, Maine and Pennsylvania" | Tucker, *A Potato Chronology* (secondary) |
| 1995 | "The severity of loss suffered in 1994 in the northeastern United States was usually not repeated ... in 1995, because 1995 was drier and because growers had intensified their late blight management" | Fry and Goodwin 1997 |
| 1990s | Maine and neighbouring provinces had epidemics "through most of the 1990s" across much of 110,000 acres | Journal of Extension, Dec 2006, IMMPACT article. **[UNCONFIRMED]**: search snippet only; the page would not resolve |
| 2006–08 | Over 90 percent of diseased samples came from potato fields in northern and central Aroostook, so blight was present | Olanya, Larkin and Honeycutt 2015 (USDA-ARS abstract page) |
| 2007 / 2008 | 2007: good weather, minimal chemical applications. 2008: "threat of blight required larger and more frequent applications" | Maine Potato Board Cost of Production Study 2008 |
| 2009 | Statewide outbreak from infected tomato transplants. Potato finds near Fort Kent, Fort Fairfield, Houlton, Easton and Hodgdon, but "not been in droves at all". It "really didn't affect commercial agricultural scale people". Fry et al. 2013: commercial potatoes were "largely unaffected in early 2009" | BDN 16 Jul 2009; Spudman May 2011; Olanya 2015; Fry et al. 2013 |
| 2010 | "there were no reports of late blight in 2010" (Maine); "very few disease samples" | Spudman 2011; Olanya 2015 |
| 2011 | Found in Bridgewater, Caribou, Fort Fairfield, Limestone and Caswell, "by no means an epidemic". Caribou had 7.93 in of rain in July (a record) and 9.03 in in June | BDN 11 Aug 2011 |
| 2024 | Found 9 Aug in a commercial field in Presque Isle; all areas told to go to 5-day sprays | BDN 12 Aug 2024 |
| 2025 | Spores trapped across Aroostook at the end of June; "No late blight infections have been confirmed"; risk high | Maine Public 1 Jul 2025; The County 7 Jul 2025 |

**Gaps in this record.**

- No opened source covers Maine years 1973–1992 one by one.
- No opened source covers 1996–2005 or 2012–2023 (2022 is mentioned only in a photo caption saying blight was not detected).
- UMaine's Potato Pest Alert archives and Maine Potato Board reports are the likely sources.

---

## 2. Parameter table

| Name | Value | Unit | Source |
|---|---|---|---|
| Wallin SV bands, cool / mid / warm | 7.2–11.6 / 11.7–15.0 / 15.1–26.6 | °C | UC IPM model 12; MacKenzie 1981 Fig. 1 (45–53, 54–59, 60–80 °F) |
| Hours for SV 1 (cool / mid / warm) | 16–18 / 13–15 / 10–12 | h of continuous RH≥90 | UC IPM; UMaine 2418 Table 1 |
| SV step | +1 per 3 extra hours, max 4 (Wallin) or uncapped (NoBlight) | SV | UC IPM; UMaine 2418 |
| NoBlight period end | RH < 76.5 | % | UMaine 2418 |
| SV start | green row (Blitecast) / 50% emergence (NoBlight) | – | UC IPM model 10; UMaine 2418 |
| First-spray SV threshold | 18 (18–20) | SV | UC IPM; MacKenzie 1981; UMaine 2418 |
| Hyre rain-favorable day | 5-day mean < 25.5 °C and 10-day rain ≥ 3 cm; Tmin < 7.2 °C is unfavorable | °C, cm | MacKenzie 1981 p.396; UC IPM model 11 |
| Rain-favorable first-spray trigger | 10 (consecutive) days | days | MacKenzie 1981; UC IPM |
| High-rainfall week (Blitecast) | ≥ 5 rain-favorable days of 7 | days | MacKenzie 1981 p.396 |
| NoBlight rain modifier | 1.18 | in per 7 days | UMaine 2418 Table 2 |
| Spray intervals offered | 5, 7, 10, 10–14 | days | UMaine 2418; UC IPM |
| Smith Period | Tmin ≥ 10 °C and ≥ 11 h RH≥90, on 2 consecutive days | °C, h | UC IPM model 14 |
| Hutton Criteria | Tmin ≥ 10 °C and ≥ 6 h RH≥90 each day, on 2 consecutive days | °C, h | AHDB project page |
| Irish Rules | 12 h (with rain) / 16 h (dry) at RH≥90 and T≥10 °C, then EBH; 25 EBH in 10 days is significant | h | UC IPM model 13 |
| Simcast BU thresholds S/MS/MR | 30 / 35 / 40 | BU since last spray | UC IPM model 3 |
| Simcast FU thresholds S/MS/MR | 15 / 20 / 25 | FU since last spray | UC IPM model 3 |
| Logit rate per SV (S / avg / R) | 0.5 / 0.3 / 0.2 | per SV | MacKenzie 1981 Fig. 4, Table 2 |
| Blitecast initial disease | 0.0001 | % | MacKenzie 1981 |
| Detection by growers | ≈ 1 | % severity | MacKenzie 1981 |
| r unsprayed, favorable (Superior … Green Mtn) | 0.68 … 0.20 | per day | Fry 1978 Table 2 |
| r unsprayed Katahdin, 1974 | 0.55 (1→90% in 18 days) | per day | Fry 1977 |
| r under weekly protectant | 0.11–0.16 | per day | Fry 1977 Table 3 |
| Latent period | 57.5–118.5 h (lab); 5 days (model); ~5–7 days (Maine field) | h / days | BLIGHTSIM; Skelsey; UMaine 2441 |
| Fastest full cycle | 96 | h | Fry et al. 2013 |
| Lesion life (expand to 10 − LP days, sporulate to 15 − LP days, gone by day 15) | 15 | days | Bruhn and Fry 1981 |
| Initial lesion size | 0.8 | mm² | Bruhn and Fry 1981 |
| Radial lesion growth, susceptible (Bintje, 15 °C) | 4.75 | mm/day | Skelsey thesis Table 4 |
| Radial lesion growth, resistant (Aziza) | 0.30–3.05 | mm/day | Skelsey thesis Table 4 |
| Lesion growth temperature optimum | 24 | °C | BLIGHTSIM |
| Infection efficiency, susceptible | 0.02–0.033 | fraction | Skelsey thesis Table 4 |
| Minimum leaf wetness for infection | 2 (most within 6) | h | Becktell et al. 2005 |
| Infection temperature range | 13–23 conducive; very little at 28 | °C | Becktell et al. 2005 |
| Infection-hour definition (alternative) | 10–27 °C and RH > 90% | °C, % | Zwankhuizen thesis; Skelsey |
| Sporulation RH | ≥ 90 (still air); none at 80–85 | % | Harrison and Lowe 1989 |
| Sporulation for older lesions in field | 60–70 °F with > 10 h high RH | °F, h | UMaine 2441 |
| Sporulation temperature optimum; upper limit | 15–18; nearly absent at 28 | °C | Mizubuti and Fry 1998; Becktell 2005 |
| Sporulation density | 2.0–4.5 × 10⁸ | sporangia per m² of lesion | Skelsey Table 4; Becktell 2005 |
| Spores per lesion per day | up to 250,000 | per day | UMaine 2441 |
| Dispersal kernel α (dry / irrigated) | 0.82 / 2.1 (mean 2.44 / 0.95 m) | m⁻¹ | Skelsey, after Paysour and Fry 1983 |
| Gradient from refuse pile / infested field | −0.35 / −0.0045 | m⁻¹ (exponential slope) | Zwankhuizen thesis ch. 2 |
| Sporangia death, sunny (> 600 W/m²) | 95% in 1.1 h; LD95 = 2.6 MJ/m² | h, MJ/m² | Mizubuti et al. 2000 |
| Dried sporangia half-life | 5.5 (15–20 °C); 1.4 (30 °C, 40% RH); 3.8 (30 °C, 88% RH) | h | Minogue and Fry 1981 |
| Hot-weather limit | sporangia injured > 80 °F at RH < 90%; cycles need Tmax "well below 90° F" | °F | Wallin and Waggoner 1950 |
| Protectant residue decay | ×0.90 per day, × e^(−0.56 × rain cm) | – | Bruhn and Fry 1981 |
| Wash-off rule of thumb | ~50% at 1 in, ~100% at ≥ 2 in | % | Gevens, UW Update 8, 2024 |
| Protectant dose response | probit = 7.60 + 2.07·log10(µg/cm²); full deposit 2.5 µg/cm² | probit | Bruhn and Fry 1981 |
| Leaf-area doubling during rapid growth | ≤ 5 | days | UMaine Fungicide Schedule 2024 |
| Maine sprays per season | 15–20 (historic), < 12–15 (2019) | sprays | BDN 19 Sep 2019 (S. Johnson) |
| Chlorothalonil / mancozeb annual cap | 11.25 / 11.2 | lb a.i./A/yr | UMaine Fungicide Schedule 2024 |
| Seed-to-shoot transmission | 0.013–0.052 (dry) / 0.21–0.26 (wet) | fraction of infected tubers | Johnson 2010 |
| Refuse piles with blight (fav. / unfav. / dry year) | 17 / ~2 / 0 | % | Zwankhuizen thesis ch. 2 |
| Soil sporangia survival | max 23–30 | days | Porter et al. 2007 |
| Tuber infection soil temperature | zoospores 40–55 °F; uncommon > 65 °F | °F | UMaine 2441 |
| Tuber blight by cover | > 15 cm: 1–14% vs 13–59% shallower | % tubers | Glass et al. 2001 |
| Vine kill to harvest | ≥ 14, preferably 21 | days | UMaine 2441, 2417; NDSU; Miller et al. 2002 |
| Storage for suspect tubers | 38 °F, 85% RH; cure at 50 °F | °F, % | UMaine 2417 |
| Untreated tuber blight (Katahdin / Russet Rural / Sebago) | 59.2 / 34 / 9.1 | % tubers | Fry 1977 |
| Cost per application, 1974–76 / c. 1980 | 19 / 19.77 | $/ha | MacKenzie 1981; Bruhn and Fry 1981 |
| Fungicide material, 1995 | 4.90 (Cu) – 36.00 | $/acre per application | Johnson et al. 1997 |
| Season cost, severe year 1995 | 106.77–226.75 | $/acre | Johnson et al. 1997 |

---

## 3. Sources

### Opened and read

**Forecast rules**

1. UC IPM, "Models: Late Blight of Potato" (16 models), https://ipm.ucanr.edu/DISEASE/DATABASE/potatolateblight.html. Downloaded and read in full: Wallin table, Hyre, Blitecast matrix and message codes, Fry/Simcast BU and FU tables and decision rules, Smith, Irish Rules, Cook, WISDOM.
2. UMaine Extension Bulletin #2418, *Potato Facts: Late Blight Prediction in Maine* (S. B. Johnson; © 2005, 2020), https://extension.umaine.edu/publications/2418e/. Read in full: NoBlight, Table 1 SVs and the extension formula, Table 2 spray intervals, the 76.5 percent RH rule, 50 percent emergence.
3. MacKenzie, D. R. 1981, "Scheduling fungicide applications for potato late blight with BLITECAST", *Plant Disease* 65:394–399. APS back-issue PDF at https://www.apsnet.org/publications/plantdisease/backissues/Documents/1981Articles/PlantDisease65n05_394.pdf, read as page images, pages 1–5: Fig. 1 SV bands in °F, Table 1, the rain-favorable definition, Fig. 2–4, logit and r per SV, Table 2 costs.
4. Hyre, R. A. 1954, "Progress in forecasting late blight of potato and tomato", *Plant Disease Reporter* 38:245–253. Archive.org OCR of sim_plant-disease_1954-04-15_38_4: 77 °F 7-day temperature, 10-day rain at or above the mean, 10 consecutive favorable days, 83 percent correct over 1902–53.
5. Wallin, J. R. and Waggoner, P. E. 1950, *Plant Disease Reporter* Supplement 190:19–33. Archive.org OCR of sim_plant-disease_1950-01-30_supplement-190: sporangia injury above 80 °F and below 90 percent RH, maxima "well below 90° F", 5–7 day cycles, 100 percent of plants diseased in 3 weeks.
6. AHDB, "Development and implementation of a new national warning system ... (Hutton Criteria)", https://potatoes.ahdb.org.uk/development-and-implementation-of-a-new-national-warning-system-for-potato-late-blight-in-great-britain-hutton-criteria. Hutton definition and why Smith was replaced.
7. AHDB knowledge library, "Late blight disease and its management in potatoes". Hutton wording, inoculum sources, oospores.
8. IPM Decisions, "Factsheet Hutton Criteria". Hutton wording and the crop-cover limitation.
9. r4pde, "Warning systems", https://r4pde.net/prediction-warning-systems. Wallin table as code.
10. Shock et al. 2002, Oregon State Malheur Experiment Station report on predicting late blight (page images 1–2). Context only.

**Epidemiology and modelling**

11. Fry, W. E. 1977, *Phytopathology* 67:415–420, APS back-issue PDF (text). Tables 1–4: r values, sprays per method, yields, tuber blight.
12. Fry, W. E. 1978, *Phytopathology* 68:1650–1655, APS back-issue PDF (text). Table 1 mancozeb dose response; Table 2 r by cultivar.
13. Bruhn, J. A. and Fry, W. E. 1981, *Phytopathology* 71:612–616, APS back-issue PDF read as page images, pages 1–4. Model structure, lesion ages, fungicide decay and probit, cultivar validation tables, costs.
14. Minogue, K. P. and Fry, W. E. 1981, *Phytopathology* 71:1181–1184. Abstract page image: sporangia half-lives.
15. Paysour, R. E. and Fry, W. E. 1983, *Phytopathology* 73:1014–1020. Abstract page image only.
16. Narouei-Khandan et al. 2020, BLIGHTSIM, *Pathogens* 9:659. Full text via Europe PMC (PMC7459445): latent period range, temperature optima, RH sporulation function f2 = 1/(1 + 1.86e16·exp(−0.43482·RH)).
17. Skelsey, P. 2008, PhD thesis, Wageningen, https://edepot.wur.nl/122020. Full text: Laplace kernels, infection-hour rules, Table 4 (ι, ρ, σ by cultivar), fungicide Weibull, survival summaries.
18. Zwankhuizen, M. J. 1998, PhD thesis, Wageningen, https://edepot.wur.nl/201594. Chapters 2 and 5: refuse piles, gradients, 1994–96 seasons, infection-hours 10–27 °C and RH above 90 percent.
19. Fry, W. E. and Goodwin, S. B. 1997, "Re-emergence of potato and tomato late blight in the United States", *Plant Disease* 81:1349–1357. PDF at https://www.ars.usda.gov/ARSUserFiles/50200500/Feature.PDF: US-8 in Maine 1993, the Northeast in 1994–95, costs, storage loss, cull disposal.
20. Fry, W. E. et al. 2013, "The 2009 late blight pandemic in the eastern United States", *Plant Disease* 97:296–306. PDF from the Ristaino lab site: survival in air, stems, 96 h cycle, 2009–2011.

**Abstracts (Europe PMC, USDA-ARS)**

21. Mizubuti, Aylor and Fry 2000, *Phytopathology* 90:78–84.
22. Johnson 2010, *Plant Disease* 94:18–23.
23. Johnson et al. 1997, *Plant Disease* 81:103–106.
24. Porter et al. 2007, *Plant Disease* 91:835.
25. Harrison and Lowe 1989, *Plant Pathology* 38.
26. Mizubuti and Fry 1998, *Phytopathology* 88.
27. Becktell et al. 2005, *Plant Disease* 89:975.
28. Nyankanga et al. 2008, *Potato Research*.
29. Porter et al. 2005, *Plant Disease* 89:146.
30. Glass et al. 2001, *Plant Disease* 85:521.
31. Miller et al. 2002, *Plant Disease* 86:264.
32. Kirk et al. 2011, *Crop Protection* (tuber blight model validation).
33. Haulm-killing and cultivar study, *Potato Research* 2007.
34. Andrade-Piedra et al. 2005, *Phytopathology* 95:1191.
35. Aylor et al. 2001, *Phytopathology* 91:1189.
36. Shakya et al. 2015, *Phytopathology*.
37. Grünwald et al. 2002, *Plant Disease* 86:1163.
38. Olanya, Larkin and Honeycutt 2015, USDA-ARS publication page.

**Extension (Maine and other)**

39. UMaine Bulletin #2441, *Potato Late Blight* (PDF).
40. UMaine *Late Blight Control Checklist* (PDF).
41. UMaine *Fungicide Schedule for Potatoes*, April 2024 (PDF).
42. UMaine Bulletin #2417, *Protecting Potato Tubers from Late Blight*.
43. NDSU, *Late Blight in Potato*.
44. Gevens, UW Vegetable Pathology Update 8, 7 July 2024.

**Maine record, news and economics**

45. Bangor Daily News, 16 Jul 2009.
46. Bangor Daily News, 11 Aug 2011.
47. Bangor Daily News, 19 Sep 2019.
48. Bangor Daily News, 12 Aug 2024.
49. The County, 7 Jul 2025.
50. Maine Public, 1 Jul 2025.
51. Spudman, May 2011.
52. USDA *Agricultural Research* magazine, May 1997.
53. Tucker, *A Potato Chronology* (2013 PDF; secondary).
54. Maine Potato Board, *Cost of Production Study*, 2008 final report.
55. Manitoba Agriculture, *Cost of Production — Irrigated Potato 2022/23*.

### Could not open

- APS journal article pages and full texts at apsjournals.apsnet.org returned 403. That blocked the full text of Mizubuti 2000, Andrade-Piedra 2005 (Part I equations for LP, LGR and SR against temperature), Zwankhuizen et al. 1998 (I used the thesis instead) and Shakya 2015.
- Krause, Massie and Hyre 1975 (*Plant Disease Reporter* 59:95–98): archive.org holds only the 1975 index, so the exact Blitecast day boundary is unconfirmed.
- Springer papers (Bonde and Schultz 1943; Sunseri et al. 2002; Guenthner et al. 2001) redirected to a login.
- The Journal of Extension IMMPACT article (2006): the archive.joe.org host did not resolve.
- MSU "Fungicide properties and weather conditions" returned an empty page.
- The Research Square preprint "Top 10 Potato Varieties in Maine" returned an empty page.
- Fry 2008, *Molecular Plant Pathology*, review: Europe PMC returned no full text.

---

## 4. Unconfirmed items and gaps

1. **Day boundary for Blitecast severity values.** It is not confirmed in the original paper. Simcast uses noon to noon (UC IPM), and I recommend noon to noon. The weather pipeline must supply the *longest continuous* run of RH ≥ 90 hours and the mean temperature during it, not a daily total.
2. **Latent period against temperature as an equation.** The Andrade-Piedra 2005 equations could not be opened. The LP table in section 1.4 is derived from the BLIGHTSIM range, Maine field statements and Skelsey's fixed 5 days.
3. **Smith Period day definition** (24 h to 0900 GMT): from memory **[UNCONFIRMED]**. Corteva's Hutton "near miss" definition was seen only in a snippet **[UNCONFIRMED]**.
4. **Rotem et al. 1970 infection-hour rule** (12, 18 or 24 consecutive hours by temperature band). It is cited from Skelsey's thesis, not from the original. It looks counter-intuitive, needing more hours at warmer temperatures, so do not use it as the primary gate.
5. **Copper efficacy relative to chlorothalonil or mancozeb.** No number found. Copper's weaker effect in the game is invented.
6. **Cost per application in Maine for specific eras.** Only 1974–76 Pennsylvania, c. 1980 New York, 1995 Columbia Basin, Maine all-chemical totals for 2006–08, and Manitoba 2022/23 were found. Guenthner et al. 2001 ($507/ha including losses) is unconfirmed. USDA NASS Chemical Use surveys hold Maine application counts by active ingredient in Quick Stats, but I did not retrieve them.
7. **Maine validation years.** 1973–1992, 1996–2005 and 2012–2023 are not documented year by year in anything I opened. The "epidemics through most of the 1990s" statement (JOE 2006) is snippet-only. UMaine Potato Pest Alert archives and Maine Potato Board reports should fill this, as should running the SV code on Caribou weather and checking that the bad years (1994, 2009, 2011, 2024) rank high.
8. **Modern Maine cultivar resistance ratings** (Caribou Russet, Russet Burbank today, Superior, Shepody, Defender and others). Only Fry 1978's 1970s rates were found. The 2024 "Top 10 Potato Varieties in Maine" preprint would have these but did not load.
9. **Yield-loss link.** Bruhn and Fry give d_t = d_(t−1) + (3.3 − 0.0285 t)(x_t − x_(t−1)), from MacKenzie and Petruzzo, but I could not confirm the units of d and t. Better to let the crop model lose green leaf area to blight.
10. **Invented constants that need tuning against section 1.6:**
    - β, the infection scaling;
    - g(SV) = SV/4;
    - the hot-day cut at Tmax ≥ 32 °C (derived from Wallin and Waggoner);
    - tuber γ and soil spore decay;
    - the cull-pile infection probability;
    - the regional inoculum level per year;
    - the storage soft-rot multiplier.
11. **Oospores and soil-borne inoculum** are left out. That fits Maine with clonal populations (UMaine: the pathogen "cannot survive in soil or dead plant debris"), but it is an assumption for years when both mating types were present (the 1990s, US-8 as A2 alongside A1 lineages).
