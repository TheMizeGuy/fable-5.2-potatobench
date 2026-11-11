# 01: Crop development, growth and water

Research slice for "The County". Scope: thermal time and phenology, planting and emergence, frost, canopy and bulking, tuber number and size, water balance. Written 2026-11-11.

Labels used everywhere in this report:

- **[S]** sourced: I opened the source and the value or rule is in it (quote or table reference given).
- **[U]** unconfirmed: from memory, or seen only in a search-engine snippet of a page I could not open. Do not present as sourced.
- **[I]** invented: a design choice or placeholder number made for the game. It must be labelled as invented in game docs and code.

Unit conversions used: 1 cwt/acre = 112.085 kg/ha (100 lb / 0.404686 ha); 1 t/ha = 8.92 cwt/acre; °C = (°F − 32) × 5/9.

---

## 1. What the simulation should implement

### 1.0 The recommended model in one paragraph

Run three thermal clocks from the daily Tmax/Tmin: **P-days** (Sands et al. 1979, exact daily formula below) for development stages and harvest-index progress, **°C·d base 0** (LINTUL-POTATO-DSS) for canopy expansion, and the **Firman et al. (1992)** sprout model for planting-to-emergence. Canopy cover drives light interception; daily dry matter = intercepted global radiation × light-use efficiency 1.25 g/MJ (temperature-limited) × water-stress factor Ks (FAO-56). Tuber dry matter = harvest index × total dry matter, with the HI rising linearly from 0 at tuber initiation to 0.75 at the variety's maturity (LINTUL-POTATO-DSS). Fresh yield = tuber dry matter ÷ dry-matter concentration, which rises from 11 % at tuber initiation to the variety value (16 to 26 %). Tuber number per hill is fixed in the week after tuber initiation from stems per seed piece (seed age, planting date) and early-season water. Water is an FAO-56 single-Kc root-zone bucket on the real Caribou gravelly loam (SSURGO data pulled for this report). Everything above has a published source; the couplings between them and a few hazard magnitudes are invented and labelled.

### 1.1 Daily inputs and derived drivers

| Derived value | Rule | Label |
|---|---|---|
| Tmean | (Tmax + Tmin) / 2 | standard |
| Soil temperature at seed depth (pre-emergence) | Use Tmean of air. LINTUL-POTATO uses "the mean daily air temperature" when soil temperature is not available. | [S] Kooman & Haverkort 1995, p. 44 |
| Soil-temperature caveat | LINTUL-POTATO-DSS warns that in cold continental springs "the soil temperature often lacks behind due to the still frozen undersoil" and recommends real soil temperature or a reduced sprout growth rate. Aroostook is exactly that case. Optional: use a 5-day running mean of Tmean as the soil proxy. | caveat [S] Haverkort et al. 2015, "Emergence and Crop Development" section; 5-day smoothing [I] |
| Global radiation Rs (MJ/m²/day) | Not a game input. Derive from cloud cover with the FAO-56 Ångström formula Rs = (0.25 + 0.50 n/N) Ra (Eq. 35, defaults a_s = 0.25, b_s = 0.50), Ra from latitude and day (Eq. 21 to 25), N = (24/π) ω_s (Eq. 34). Clear-sky cap Rso = (0.75 + 2×10⁻⁵ z) Ra (Eq. 37). Approximating sunshine fraction n/N by (1 − cloud fraction) is [I]. The weather slice may own this. | Ångström [S] FAO-56 ch. 3; cloud mapping [I] |
| Daylength N | FAO-56 Eq. 34, N = 24 ω_s / π, ω_s = arccos(−tan φ tan δ), δ = 0.409 sin(2πJ/365 − 1.39). Caribou φ ≈ 46.87° N [U]. | [S] FAO-56 ch. 3 |
| ETo | Game input (reference evapotranspiration, FAO-56 grass). | input |

### 1.2 Thermal clocks

#### 1.2.1 P-days (Sands, Hackett and Nix 1979), exact daily form

Rate function of temperature T in °C:

```
P(T) = 0                                  if T < 7
P(T) = 10 * (1 - (T - 21)^2 / (21 - 7)^2) if 7 <= T < 21     # (21-7)^2 = 196
P(T) = 10 * (1 - (T - 21)^2 / (30 - 21)^2) if 21 <= T <= 30  # (30-21)^2 = 81
P(T) = 0                                  if T > 30
(clamp negative results to 0)
```

Daily P-day value, weighting four temperatures across the day:

```
T1 = Tmin
T2 = (2*Tmin + Tmax) / 3
T3 = (Tmin + 2*Tmax) / 3
T4 = Tmax
Pday = (5*P(T1) + 8*P(T2) + 8*P(T3) + 3*P(T4)) / 24
```

Source [S]: Oregon State IPPC "Degree-Day Calculation Methods" (uspest.org mirror at mint.ippc.orst.edu/CalcMethods.html) and pnwpest.org/wea/wea3.html, both of which publish the code with the comment "the daily approx version of equation 2 by Sands", the line `$ddtmp = 1 / 24 * ( 5 * $dp1 + 8 * $dp2 + 8 * $dp3 + 3 * $dp4 );`, `10 * ( 1 - ( $t - 21 )**2 / 196 )` for 7 to 21 and `10 * ( 1 - ( $t - 21 )**2 / 81 )` for 21 to 30, and zero below 7 or above 30. The cardinal temperatures 7, 21 and 30 °C are also stated by Manitoba Agriculture ("minimum ... 7 °C (45 °F)", growth stops at "30 °C (86 °F)"). I could not open the original paper (Field Crops Research 2: 309 to 331, paywalled) [U for the paper itself]. A 1989 American Potato Journal paper reports that this original derivation "significantly overpredicted" true P-days by about 1 to 6 % (search snippet only, paywalled) [U]. Accept that error; the published thresholds were all derived with this same formula.

Test vectors (computed by me with the formula above, for unit tests):

| Tmin °C | Tmax °C | P-day | °C·d base 0 | GDD base 7 |
|---|---|---|---|---|
| −2 | 10 | 0.48 | 4.0 | 0.0 |
| 3 | 15 | 2.65 | 9.0 | 2.0 |
| 5 | 17 | 4.28 | 11.0 | 4.0 |
| 8 | 20 | 6.39 | 14.0 | 7.0 |
| 10 | 21 | 7.57 | 15.5 | 8.5 |
| 12 | 24 | 8.56 | 18.0 | 11.0 |
| 14 | 27 | 8.69 | 20.5 | 13.5 |
| 18 | 32 | 6.89 | 25.0 | 18.0 |

Note the last row: hot days give fewer P-days than warm days. That is the built-in heat penalty, and it is why P-days are the right clock for tuber development and HI progress.

#### 1.2.2 Other base temperatures in the literature (for context and cross-checks)

| Clock | Base / upper | Used for | Label |
|---|---|---|---|
| °C·d base 0 (mean temp) | 0 °C | All processes in LINTUL-POTATO-DSS: "the base temperature for the various processes is 0 °C" | [S] Haverkort et al. 2015, "Emergence and Crop Development" |
| °C·d base 2 | 2 °C (2.2 °C in LINTUL 1.0) | LINTUL-POTATO crop development; FAO-66 says "A base temperature of 2 °C has been used in some potato crop models" | [S] Kooman & Haverkort 1995 Table 2; Haverkort et al. 2015 introduction; FAO-66 p. 186 |
| AquaCrop GDD | Tbase 2 °C, Tupper 26 °C, method 3 (cap Tmax at Tupper, then average) | Canopy, phenology in AquaCrop | [S] AquaCrop v7.3 Annex I §I.3 and Ch. 3 §3.3.3 |
| GDD base 7 °C (45 °F) | 7 °C | Simple GDD attributed to Sands et al. 1979 in a Florida State Hort. Soc. paper (site under maintenance, snippet only) | [U] |
| GDD base 40 °F (4.4 °C) | 4.4 °C | Some US extension potato GDD tables | [U] from memory |

Recommendation: P-days for stages and HI, °C·d base 0 for canopy (because the 650 °C·d constant is defined on that base), Firman for emergence. Do not convert constants between clocks; each rule keeps the clock its source used.

### 1.3 Stages and thermal thresholds by maturity class

#### 1.3.1 Published anchor points

Manitoba Agriculture, "Heat units for potato production in Manitoba", Table 1, P-days [S]. Sebago and Kennebec counted from 50 % emergence; Russet Burbank counted from planting.

| Stage | Sebago (from emergence) | Kennebec (from emergence) | Russet Burbank (from planting) | Russet Burbank converted to "from emergence" (minus 155) |
|---|---|---|---|---|
| 50 % emergence | 0 | 0 | 155 | 0 |
| Tuber initiation | 118 | 130 | 330 | 175 |
| Start of tuber growth | 236 | 260 | 440 | 285 |
| Maximum bulking | 460 | 420 | not given | |
| Cessation of bulking | 600 | 550 | not given | |
| Tuber maturity | 850 | not given | approx. 1000 | approx. 845 |

Same page [S]: roots reach about 40 cm after about 400 P-days and their maximum 65 to 80 cm after about 700 P-days; "the canopy covers the ground after about 450 P-days" (start point not stated). Seasonal P-days in southern Manitoba (wheat seeding to first fall frost, 1961 to 1990) average 850 to 950; 75 % probability about 65 fewer; 90 % probability about 60 fewer again.

Manitoba's potato area is at a similar latitude and daylength to Aroostook (about 49 to 50° N vs 46.9° N [U]), so these thresholds already include long-day effects on tuber initiation (Regel and Sands 1983 report critical photoperiods of 14.1 h for Sebago and 15.5 h for Kennebec above which tuber formation is retarded, as cited in Kooman & Haverkort 1995 p. 46 [S]).

Other anchors [S]:

- University of Maine Extension Bulletin #5087: early blight risk "is typically elevated after canopy closure and tuber bulking begins", which corresponds to roughly 300 P-days. The page does not say where counting starts; standard early-blight practice counts from emergence [U, search snippet]. UW-Madison vegetable pathology: "A Potato Physiological Day or P-Day value of ≥300 indicates the threshold for early blight risk".
- O'Brien, Allen & Firman 1998 (J. Agric. Sci. 130: 251 to 270): "tuber initiation commences at a similar interval after plant emergence for a wide range of husbandry and environmental conditions ... For photoperiods ranging between c. 13 and 17 h, this interval normally varied only from c. 14 to 21 days". Duration of initiation "was c. 1 week", up to c. 2 weeks for early plantings, "within 3–4 days" in rapid growth from mid-May.
- LINTUL-POTATO-DSS Table 1: "Day of tuber initiation after emergence 15, 5–20 days after emergence, maturity type dependent".
- University of Idaho BUL 789 (King & Stark, Potato Irrigation Management): stage I planting to emergence 20 to 35 days; stage II emergence to tuber initiation 15 to 25 days; stage III tuberization over a 10 to 14 day period, LAI 1 to 2 (50 to 80 % row closure); stage IV bulking, tuber growth "approximately linear with time over a 30-to-60-day period", LAI reaches a maximum of 3.5 to 6.0 near its end; stage V senescence.
- AquaCrop v7.3 Annex I, potato (GDD base 2/upper 26): sowing to emergence 150 to 250 GDD; start of yield formation at emergence + 350 to 650 GDD; start of canopy senescence at emergence + 850 to 1000 GDD; maturity at emergence + 800 to 1800 GDD (cultivar).
- FAO-56 Table 11, potato stage lengths in days (Init/Dev/Mid/Late/Total): "Continental Climate", May planting 25/30/45/30/130; "Europe", April 30/35/50/30/145; "Idaho, USA", Apr/May 45/30/70/20/165.
- Caribou series OSD: frost-free season 90 to 120 days.

#### 1.3.2 Recommended game thresholds (P-days after 50 % emergence)

| Stage | Early class | Mid class | Late class | Basis |
|---|---|---|---|---|
| Tuber initiation (TI) | 110 | 130 | 175 | Mid = Kennebec [S]; Late = Russet Burbank [S]; Early [I] (below Sebago's 118) |
| Tuber number fixed | TI + 7 days | TI + 7 days | TI + 7 days | O'Brien et al. 1998 "c. 1 week" [S] |
| Start of linear bulking | 220 | 260 | 285 | Mid, Late [S]; Early [I] |
| Canopy decline starts | 380 | 420 | 460 | Manitoba "maximum bulking" points [S], used here as the start of canopy decline [I interpretation] |
| Natural maturity ("crop end") | 650 | 750 | 850 | Late = Sebago 850 and Russet Burbank about 845 [S]; Mid between Kennebec's 550 cessation of bulking and 850 [I]; Early [I] |

Check against Caribou climate (my rough estimate [I], to be replaced by a NOAA run): early-June emergence, about 7.5 P-days/day in June, 8.5 in July, 8 in August and 6 in early September gives about 780 P-days to mid-September. So late varieties usually do not reach natural maturity before vine kill or frost in Aroostook, which matches the practice of vine-killing long-season crops (FAO-56 Table 12 footnote 4 refers to "long season potatoes with vine kill" [S]).

### 1.4 Planting and emergence

#### 1.4.1 Planting soil temperature guidance (for in-game advice and seed-decay risk)

| Statement | Source |
|---|---|
| "Average of 50 degrees in soil temperature is the recommended temperature for planting the potato seeds" to minimize seed decay (six-inch soil temps, Aroostook Research Farm, Presque Isle) | [S] UMaine Extension soil temperature page |
| "As soon as the soil warms up to 50 degrees F, potato seed can be planted." Earlier planting in cold wet soil is susceptible to decay. | [S] UMaine Bulletin #2077 |
| "soil temperatures at seed piece depth should be above 45oF and climbing"; "Soil temperatures below 45oF prevent wound healing."; Russet Burbank "emerge in 20 to 25 days at 50oF but take more than 40 days at 45oF"; "the longer a seed piece sits in the cold soil, the more likely that it will decay" | [S] Thornton & Olsen (University of Idaho), Potato Country, 16 Mar 2020 |
| "Seed piece decay is more common when planted in cool (< 45 °F) wet soils."; soils should be 50 to 60 °F | [S] Utah State Extension vegetable guide |
| "it is undesirable to plant when soil temperatures are below 48°F" | [S] Iritani & Thornton, PNW 248 |
| "Excess soil water at planting promotes seed piece decay and delays emergence due to decreased soil temperature" | [S] Idaho BUL 789 |
| Sprout growth optimum c. 20 to 25 °C; growth reduced above 22 °C; "at > 30 °C rotting of tubers may occur" (Sale 1979) | [S] Firman et al. 1992 introduction |

#### 1.4.2 Emergence model: Firman, O'Brien & Allen (1992), recommended

Field-validated for cv. Estima (controlled environment plus field trials; field emergence ranged 10 to 51 days). Two phases:

1. **Lag** (slow growth until sprouts have grown about 10 mm). Requirement in °C·d above 1 °C:
   `L = L0 + b * c^S` with L0 = 60, b = 276, c = 0.652, S = sprout length of cold seed at planting (mm). Seed warmed before planting: L0 = 58. [S] Firman et al. 1992 Eq. 2 and Fig. 2.
2. **Linear elongation** at rate R(T) mm/day until the sprout has grown the planting depth D (mm, seed to soil surface):
   `R(T) = R0 * (1 - ((T - Tb) / (Ta - Tb))^2)` with base Ta = 6.3 °C, optimum Tb = 19.8 °C, R0 = 17.7 mm/day in wet soil (near field capacity) and 12.1 mm/day in dry soil (half the water). Above 19.8 °C substitute To = 37 °C for Ta (Sands 1989). Clamp R ≥ 0. [S] Firman et al. 1992 Eq. 1, Eq. 3, Fig. 3.

Daily-step implementation [S form, daily discretisation is standard]:

```
if lag_done < L:  lag_done += max(0, Tsoil - 1)
else:             sprout   += R(Tsoil, wet = (Dr <= RAW))   # wet/dry switch [I]
emerged when sprout >= D
```

Worked results (computed with the published constants, D = 100 mm, constant temperature):

| Soil T | Sprout 3 mm at planting | Sprout 10 mm at planting |
|---|---|---|
| 7.2 °C (45 °F) | 66 days | 54 days |
| 10 °C (50 °F) | 27 days | 19 days |
| 12 °C | 21 days | 14 days |
| 15 °C | 16 days | 11 days |

These reproduce Thornton & Olsen's field statements (20 to 25 days at 50 °F, more than 40 days at 45 °F), which is the external check for this rule.

Firman's own caveats [S]: field emergence was "usually later than predicted (on average 4 days)", "particularly with shallow planting", and using the dry-soil rate improved predictions for shallow plantings in dry surface soil.

Simpler alternative [S]: LINTUL-POTATO-DSS uses sprout growth 0.7 mm per °C·d above 0 °C with planting depth measured "from tuber to hill top" (example 17.5 cm). LINTUL-POTATO 1.0 used 1 mm per °C·d above 2 °C (MacKerron & Waister 1985). Sale (1979, cited by Firman) found about 450 °C·d above 2 °C for Sebago and Sequoia at 75 mm depth. The simple form does not reproduce the strong slow-down at 45 °F, so prefer Firman.

Game mapping of seed state to S [I]: physiologically young, cold-stored seed with just-broken sprouts S ≈ 3 mm; aged or pre-sprouted seed S ≈ 10 to 20 mm. Iritani & Thornton Table 1 [S]: young seed has "Slow emergence", old seed "Rapid emergence". UMaine #2412 [S]: "Larger seed pieces usually emerge faster than smaller ones"; "The more cut surface area on the seed piece, the greater the seed decay potential, the slower the emergence".

Planting depth D [S]: UMaine #2077 "furrow four to six inches deep", seed covered with two inches initially and then hilled; Idaho BUL 1114 "6"–8" deep" (commercial, to hill top); FAO-66 "sowing depth is generally 5 to 10 cm". Hilling after planting increases D for any sprout not yet emerged [I].

#### 1.4.3 Seed-piece decay (hazard model is invented; triggers are sourced)

No published daily decay-rate model was found. Recommended structure [I], with each trigger traced:

```
daily_decay_prob = base
  * (Tsoil < 7.2 °C ? k_cold : 1)        # <45 °F: no wound healing (Thornton & Olsen), decay in cool wet soil (Utah State)
  * (soil wet ? k_wet : 1)               # excess water at planting (Idaho BUL 789), cold wet soil (UMaine #2077)
  * (Tsoil > 30 °C ? k_hot : 1)          # rotting above 30 °C (Sale 1979 via Firman 1992)
  * (cut seed ? k_cut : 1)               # more cut surface, more decay (UMaine #2412)
applied every day until emergence, so slow (cold) emergence accumulates more risk (Thornton & Olsen)
```

Placeholder magnitudes [I], to tune for fun: base 0.001/day, k_cold 3, k_wet 3, k_hot 5, k_cut 1.5. "Soil wet" [I]: root-zone depletion below 10 % of TAW, or ≥ 15 mm rain in the last 3 days. Seed-borne disease interactions (Fusarium dry rot worse in dry soil per Ojala 1987 [S]; soft rot under anaerobic flooding, Rhizoctonia favoured by cool soil per Thornton & Olsen [S]) belong to the disease slice.

### 1.5 Frost on emerged foliage

| Threshold (screen air Tmin) | Effect | Label |
|---|---|---|
| ≤ 1 °C | "The temperature for frost or cold stress for potato is considered 1 °C and less" | [S] FAO-66 potato chapter p. 186 |
| 29 to 32 °F (−1.7 to 0 °C) | "Temperatures between 29-32 °F will cause minor injury" | [S] Univ. of Delaware Weekly Crop Update, G. Johnson, 15 May 2020 |
| below 28 °F (−2.2 °C) | "temperatures below 28 °F may kill the plant to the ground" | [S] same |
| −3 °C (leaf tissue) | "Solanum tuberosum leaves get frost killed at -3 °C and are unable to frost harden" | [S] Stegner, Schäfernolte & Neuner 2019, Applied Sciences 9: 819 (abstract via Europe PMC) |

Regrowth [S, Delaware]: "If the apical meristem is killed, the growing point will move to an axilliary bud(s) lower on the stem"; seed pieces are deep enough not to be harmed; "Potatoes will grow out of this damage with little effect on yield"; plants "may be set back by a few days". Thornton & Olsen [S]: "a frost event after emergence can completely wipe out any advantage of early planting".

Recommended rule:

- Tmin ≤ −2.2 °C: green canopy cover → 0 [S threshold].
  - Before TI: regrow from below-ground buds. Reset canopy to the emergence value and repeat the canopy thermal time already accumulated minus a 7-day set-back [I magnitude; "a few days" is S]. Draw down a seed-reserve counter; a second kill before TI reduces stems per hill by 30 % [I].
  - After TI: no meaningful regrowth [I]; the frost acts as vine kill (HI and DMC frozen at their current values, see 1.8).
- −2.2 < Tmin ≤ 0 °C: lose 10 to 30 % of green canopy cover, scaled linearly with Tmin [I magnitudes; "minor injury" is S].
- Leaf temperature vs screen temperature: on clear, calm nights the canopy can run colder than the 2 m screen reading [U]. Optional [I]: subtract 1 °C from Tmin when cloud cover < 20 % and wind < 2 m/s.
- Tubers in the soil are not killed by an air frost unless the soil freezes (gardening sources only) [U].

### 1.6 Canopy cover

#### 1.6.1 Potential canopy expansion

LINTUL-POTATO-DSS [S] (Haverkort et al. 2015, "Emergence and Crop Development", "Crop Ecological Parameters", Table 1):

- Light interception is linear in LAI: "no radiation intercepted at LAI=0 and 100% radiation intercepted at an LAI of 3 and above".
- "the value of 650 °Cd between the day of emergence and the day of canopy closure best matches the actual value in crops not subjected to biotic and abiotic stress", at 4 plants/m², base 0 °C.
- Early relative leaf-area extension 0.013 cm² cm⁻² (°C·d)⁻¹ until LAI 0.75; specific leaf area 270 cm²/g.

FAO-56 ch. 5 [S] agrees on the anchor: full cover is reached when "LAI reaches three".

Recommended form: AquaCrop's canopy-cover shape [S, AquaCrop Ch. 3 Eq. 3.4a/b] with its time axis set so CC reaches 0.98 CCx at 650 °C·d (base 0) after emergence [I calibration of a sourced shape to a sourced constant]:

```
CC = CC0 * exp(CGC * t)                         if CC <= CCx/2
CC = CCx - 0.25 * (CCx^2 / CC0) * exp(-CGC * t)  if CC >  CCx/2
t = °C·d base 0 since emergence
CC0 = (10 to 20 cm²/plant) * plants per m² / 10000   # AquaCrop Annex I: cc0 10–20 cm²/plant [S]
CGC solved so that CC(650) = 0.98 * CCx             # [I]
```

Example [I]: 36-inch rows and 10-inch spacing give 4.3 plants/m²; with 15 cm²/plant, CC0 = 0.0065 and CGC ≈ 0.0116 per °C·d.

Simpler alternative [S reading of DSS]: interception fraction f = min(1, TT0_since_emergence / 650).

Cross-checks: UMaine #5087 places canopy closure at about 300 P-days (about 35 to 40 days after emergence in a Caribou summer [I estimate]); AquaCrop CGC 0.017 to 0.020 per GDD (base 2/26) gives full cover sooner (about 410 GDD with the example CC0 [computed]); Manitoba gives "about 450 P-days". Sources disagree by up to two weeks; 650 °C·d is the middle.

Maximum cover: AquaCrop "Almost entirely covered" for normal stands [S]; FAO-66: "ranges from 45 percent to nearly 100 percent" [S]. Maximum LAI 3.5 to 6.0 (Idaho BUL 789) [S]. Missing hills lower CCx in proportion to the empty area [I].

#### 1.6.2 Water stress on expansion (AquaCrop, potato) [S]

AquaCrop v7.3 Annex I §I.3 and Ch. 3 Eq. 3.2b: expansion is unaffected until root-zone depletion reaches 0.20 of TAW and stops at 0.60 of TAW, shape factor 3:

```
Srel  = clamp((Dr/TAW - 0.20) / (0.60 - 0.20), 0, 1)
Ksexp = 1 - (exp(3*Srel) - 1) / (exp(3) - 1)
canopy expansion increment *= Ksexp
```

FAO-66 [S]: "Although leaf growth is very sensitive to water deficit, if the deficit is moderate and short, leaf growth after the deficit is released ... can compensate". Ojala 1987 [S]: "The rate of leaf enlargement may not return to normal after the water stress is removed."

#### 1.6.3 Canopy decline

- Natural decline begins at the class threshold in 1.3.2 and follows AquaCrop Eq. 3.4c [S form]: `CC = CCx * (1 - 0.05 * (exp(3.33 * CDC * t / (CCx + 2.29)) - 1))`, t in P-days since decline start. AquaCrop's potato CDC is 0.002 per GDD (base 2/26) [S]. For the game, set CDC per class so CC reaches 0 at the class maturity: CDC = ln(21) × (CCx + 2.29) / (3.33 × T), T = maturity minus decline start (P-days) [I]. Late class, CCx = 1: CDC ≈ 0.0077 per P-day.
- Drought-accelerated senescence: AquaCrop threshold "psen" 0.70 of TAW, shape 3 [S]. Above it, add a decline of 0.02 × (1 − Kssen) per day to CC [I magnitude]. Idaho BUL 789 [S]: "Water stress hastens leaf senescence and interrupts new leaf formation, resulting in an unrecoverable loss of tuber bulking."
- Leaf loss from frost (1.5), late blight, early blight or beetles (other slices) is subtracted from CC directly. Interception falls with it at once, because DSS makes interception a direct function of green cover.
- Vine kill (player action) sets CC to 0 and freezes HI and DMC; tuber growth stops [I in timing; DSS treats haulm killing as "crop end" for yield, S].

### 1.7 Rooting depth

| Value | Source |
|---|---|
| FAO-56 Table 22 potato max root depth 0.4 to 0.6 m | [S] |
| UMaine #2439: effective depth "about 18 to 20 inches" (0.46 to 0.51 m); tables use 18 in | [S] |
| Idaho BUL 789: "shallow, 18-24 inches, with the majority of roots in the surface 12 inches" | [S] |
| FAO-66: "70 percent of the total water uptake occurs from the upper 0.30 m and nearly 100 percent from the upper 0.40 to 0.60 m"; extraction deeper than 1.8 m has been observed | [S] |
| Manitoba: about 40 cm at 400 P-days; maximum 65 to 80 cm at about 700 P-days | [S] |
| AquaCrop: minimum effective rooting depth Zn 0.30 m, maximum "Up to 1.80" m | [S] |

Recommended [I interpolation between sourced anchors]: Zr = 0.30 m from planting to emergence, then linear to 0.46 m at 400 P-days after emergence, then constant.

### 1.8 Dry matter production and its partitioning to tubers

#### 1.8.1 Daily dry matter (LINTUL-POTATO-DSS, recommended)

```
dW (g DM / m² / day) = LUE(Tmean) * f_int * min(Rs, 24) * Ks
f_int = CC                                     # green cover = intercepted fraction (DSS, S)
LUE(Tmean): 0 if Tmean < 3; rises linearly to 1.25 at 15; 1.25 from 15 to 20; falls linearly to 0 at 28; 0 above 28
```

- LUE 1.25 g DM per MJ of intercepted global radiation, with cardinal mean temperatures 3/15/20/28 °C [S] (Haverkort et al. 2015 Table 1: "LUE=0 if Taverage <3 °C", optimum between 15 and 20, "LUE=0 if Taverage >28 °C"). Linear interpolation between those points is my reading [I].
- Original LINTUL [S] (Kooman & Haverkort 1995): 2.5 g/MJ on a PAR basis, "only uses daily values up to a maximum of 12 MJ m⁻² (Kooman 1995)" of PAR. PAR ≈ 0.5 × global radiation [U], so the two LUEs agree and the cap is about 24 MJ/m² global, as used above.
- Optional CO₂ term [S] (DSS Eq. 11, from Haverkort et al. 2013): LUE = 1.25 + (CO₂ ppm − 360) × 0.001875. Over 1973 to 2025 (about 330 to 425 ppm [U]) this moves LUE from about 1.19 to 1.37: a real, sourced reason why later seasons yield more.
- Water: DSS Eq. 1 "Yatt = Ypot × Wav/ETP"; the FAO-56 equivalent is multiplying by Ks (1.9.4) [S].
- Kooman & Haverkort 1995 [S]: a decline in crop LUE above 20 °C "with a slope of about −0.02 per °C" (Haverkort & Harris 1987; Manrique et al. 1991). This is consistent with the DSS trapezoid.

Cross-check, AquaCrop water-productivity form [S] (Ch. 3 Eq. 3.10a/b/c, 3.11a; Annex I potato): `m = WP* × Tr/ETo`, `Tr = Ks × CC* × KcTr,x × ETo`, `CC* = 1.72 CC − CC² + 0.30 CC³`, WP* = 18 to 20 g/m², KcTr,x = 1.10. At full cover and no stress this gives 19.8 to 22 g/m²/day of total dry matter, the same range as LUE 1.25 × 16 to 18 MJ/m². Two independent FAO and Wageningen parameterisations agree, which is evidence the potential rate is right.

#### 1.8.2 Harvest index and tuber dry matter (LINTUL-POTATO-DSS) [S]

"HI is assumed to have a value of 0, for a number of days after emergence ... and reaches 0.75 at crop end"; "the HI in the model is linearly correlated to thermal time after tuber initiation"; "Inserting an earlier harvest date leads to lower calculated yields."

```
HI(t)        = 0.75 * min(1, (PD_since_emergence - PD_TI) / (PD_maturity - PD_TI))   # 0 before TI
tuber_DM     = HI * W_total
HI frozen at vine kill, frost kill after TI, or total canopy loss
```

Using P-days as the HI clock, instead of DSS's base-0 °C·d, is [I]. Reason: P-days fall above 21 °C and reach 0 at 30 °C, so hot spells slow tuber filling, which matches the literature in 1.8.4.

HI value range: DSS 0.75 "At crop end for all crops" [S]; AquaCrop HIo 70 to 85 % (cultivar) [S]. Use 0.75 default, 0.80 for high-HI cultivars [I choice within S range].

#### 1.8.3 Tuber dry-matter concentration and fresh yield [S]

DSS Eq. 4: `Tdmc = a × HI + 11 %`, so tubers have 11 % DM at initiation (the DM of stolons) and the variety's expected value at crop end; "at maturity often varies between 16 and 26%". So `a = (DMC_end − 11) / 0.75`. FAO-66: "Dry matter content of fresh tubers normally varies between 20-25 percent". AquaCrop: conversion factor "20% to 25%". Fresh tuber yield = tuber_DM / Tdmc.

Optional environmental shifts of end DMC (DSS Eqs. 5 to 10, single-study regressions, [S] but narrow): temperature `Tdmc = 28.0 − 0.450 × TEMPmean` (Rwanda, season means 15 to 22 °C); water `Tdmc = 22.9 − 0.0117 × Wapp` (Australia, 250 to 600 mm seasonal irrigation); N `25.0 − 0.0254 × N kg/ha`; K₂O `24.3 − 0.0340 × K`. Use them as deviation slopes around the variety's mean, as DSS Eq. 10 does.

#### 1.8.4 Heat effects on tuberization and bulking

| Finding | Source |
|---|---|
| Relative tuber growth rate: maximum between 16 and 24 °C; at 10 and 30 °C half the optimum; zero at 4 and 35 °C (Ingram & McCloud 1984). Literature minimum 0 to 4.4, optimum 15 to 22, maximum 25 to 35 °C. | [S] Kooman & Haverkort 1995 p. 47 |
| Tuber initiation rate: minimum 0 to 7, optimum 15 to 20, maximum 25 to 30 °C | [S] Kooman & Haverkort 1995 p. 47 |
| "Optimum soil temperature for tuber growth is 15 to 18 °C"; day 25 to 32 °C and night 12 to 18 °C; as temperature rises "tuber initiation and growth begin to be suppressed"; heat stress "35 °C or higher" | [S] FAO-66 p. 186 |
| Ideal conditions: "Long, warm days (85ºF–95ºF), and short, cool nights (50ºF–60ºF)"; heat stress causes "second growth, growth cracks, and sugar accumulation" | [S] Idaho BUL 1114 |
| Haulm growth fastest at 20 to 25 °C; tuberization and tuber growth best at 15 to 20 °C; heat inhibits tuberization and partitioning to tubers. 15 days at 35/25 °C (day/night) in the second half of June cut yield by 24 % on average, and over 35 % with drought; later heat periods mattered less. Heat with good moisture gave taller haulms, more deformations, and heat sprouting late. | [S] Rykaczewska 2015, Am. J. Potato Res. 92: 339 to 349 |
| Night temperatures above about 20 °C suppress tuber initiation and partitioning (Levy & Veilleux 2007, Am. J. Potato Res. 84: 487 to 506) | [U] secondary citations only; abstract not available |

Implementation: the P-day HI clock and the LUE trapezoid already carry most of the heat response [S functions]. Optional extra [I]: for each day in the window TI − 3 days to TI + 7 days with Tmin > 20 °C, delay TI by 1 day and reduce tuber set by 3 % [I magnitudes; threshold U]. Warm nights are rare at Caribou [U], so this mainly matters for a "hot year" event.

### 1.9 Water

#### 1.9.1 Soil: Caribou gravelly loam (raw NRCS data pulled for this report)

USDA NRCS Soil Data Access (SSURGO tabular, queried 2026-11-11) for map unit CgB "Caribou gravelly loam, 2 to 8 percent slopes" [S]:

| Survey area | Horizon | Depth cm | AWC low / rep / high (cm/cm) | Ksat rep µm/s | Sand/silt/clay % | OM % | Bulk density g/cm³ |
|---|---|---|---|---|---|---|---|
| ME607 (Aroostook NE, mukey 301813) | H1 | 0 to 18 | 0.17 / 0.24 / 0.30 | 9.17 | 44.7 / 40.8 / 14.5 | 5.5 | 1.13 |
| | H2 | 18 to 48 | 0.15 / 0.18 / 0.20 | 9.17 | 42 / 37.5 / 20.5 | 3.25 | 1.25 |
| | H3 | 48 to 152 | 0.09 / 0.13 / 0.16 | 9.17 | 42 / 37.5 / 20.5 | 0.5 | 1.48 |
| ME608 (Aroostook S, mukey 614154) | H1 | 0 to 23 | 0.17 / 0.24 / 0.30 | 9.17 | 44.7 / 40.8 / 14.5 | 5.5 | 1.13 |
| | H2 | 23 to 66 | 0.15 / 0.18 / 0.20 | 9.17 | 42 / 37.5 / 20.5 | 3.25 | 1.25 |
| | H3 | 66 to 165 | 0.09 / 0.13 / 0.16 | 9.17 | 26.4 / 53.1 / 20.5 | 0.5 | 1.48 |

Map-unit aggregates (muaggatt, cm of available water): CgB ME607: 0 to 25 cm 5.53, 0 to 50 cm 9.91, 0 to 100 cm 16.18; ME608: 5.81 / 10.25 / 17.22. Drainage "Well drained", hydrologic group B. Caribou is 87 to 89 % of each CgB map unit.

Official Series Description [S]: very deep, well drained, "Permeability is moderate"; typical pedon gravelly loam with 25 to 30 % rock fragments to 65 in; "Most areas are cultivated and used primarily for potatoes"; precipitation 36 to 40 in; frost-free season 90 to 120 days.

UMaine Bulletin #2439 (Sexton, Porter & Johnson 2008) Table 1 [S]: "Caribou – silt loam", 0.21 in water per in of soil, 22 % gravel and stones, 2.95 in available in 18 in (75 mm).

Recommended [I choice between S values]: layered SSURGO representative AWC (0.24 / 0.18 / 0.13). TAW at Zr = 0.457 m (18 in) is 18 cm × 0.24 + 27.7 cm × 0.18 = 93 mm (ME607). The UMaine extension figure for the same depth is 75 mm; the SSURGO low values give 72 mm. A "dry field" variant could use the UMaine number. Ksat 9.17 µm/s ≈ 33 mm/h, so water above field capacity drains within a day on this soil.

#### 1.9.2 Root-zone water balance (FAO-56) [S]

FAO-56 ch. 8:

```
TAW = 1000 * (θFC - θWP) * Zr        (Eq. 82)  -> here sum of AWC_layer * thickness within Zr (mm)
RAW = p * TAW                         (Eq. 83)
p   = 0.35 + 0.04 * (5 - ETc), clamp 0.1..0.8     (Table 22 potato p = 0.35; adjustment rule)
Dr,i = Dr,i-1 - (P - RO)i - Ii - CRi + ETc,i + DPi   (Eq. 85); Dr >= 0, excess = deep percolation
Ks  = 1 if Dr <= RAW else (TAW - Dr) / ((1 - p) * TAW)   (FAO-56 Eq. 84; quoted as Eq. 32 in Allen et al. 2005)
ETc,adj = Ks * Kc * ETo
```

When roots deepen, the newly added layer enters the bucket at its own water content. Treat it as at field capacity at planting [I], which is LINTUL-DSS's assumption: "At time of planting, the soil water balance is assumed to be at field capacity" [S]. Runoff: DSS assumes "Only 80% of the rainfall is assumed to infiltrate" [S]; FAO-56 RO can be set to 0 on this well-drained B soil for small storms [I].

Field guidance that agrees with p ≈ 0.35 [S]:

- Idaho BUL 789: available soil water "should be maintained above 65 percent to avoid yield and quality losses", average 65 to 85 % in active growth; 70 to 80 % at planting; let it fall to 60 to 65 % at vine kill.
- UMaine #2439: stress at about 60 % available; center-pivot thresholds 55 % (emergence to 10 Jul), 65 % (10 Jul to 28 Aug), 60 % (28 Aug to 10 Sep).
- FAO-66: "TAW should not be depleted by more than 30 to 50 percent".

Conflict to note: AquaCrop's potato stomatal threshold is 0.60 of TAW (shape 3) [S]. That is a different model convention. Use FAO-56 p = 0.35 for the growth Ks, because Idaho and UMaine field data both show losses below 60 to 65 % available water.

#### 1.9.3 Crop coefficient (FAO-56 single Kc) [S]

- Table 12, potato: Kc ini 0.50, Kc mid 1.15, Kc end 0.75, maximum height 0.6 m; footnote 4: "The Kc end value for potatoes is about 0.40 for long season potatoes with vine kill."
- Stage definitions (FAO-56 ch. 5): initial "from planting date to approximately 10% ground cover"; development "from 10% ground cover to effective full cover"; mid-season "from effective full cover to the start of maturity"; late "from the start of maturity to harvest or full senescence". Kc is constant in the initial and mid stages and linear between stages (Eq. 66).
- Climate adjustment of Kc mid and Kc end (used when Kc end > 0.45): `Kc = Kc_table + [0.04 (u2 − 2) − 0.004 (RHmin − 45)] (h/3)^0.3`, with 1 ≤ u2 ≤ 6 m/s and 20 ≤ RHmin ≤ 80 % (FAO-56 Eq. 62/65; text form confirmed in Allen et al. 2005 Eq. 5). For h = 0.6 m, (h/3)^0.3 = 0.617.

Game mapping [I, sourced definitions]: stage boundaries come from simulated CC, not from calendar days. Initial while CC < 0.10; development from 0.10 to 0.98 CCx; mid until canopy decline starts; late until maturity (Kc → 0.75) or, after vine kill, linear to 0.40 over the 2 to 3 weeks before harvest. FAO-56's 25/30/45/30-day "Continental Climate" row is a cross-check on the stage lengths the sim produces.

Ky (yield response) [S]: FAO Annex II (Irrigation scheduling) Table 12, potato row: "0.45", "0.8", "0.7", "0.2", "1.1". The FAO Land & Water summary (search snippet [U]) maps them to: early vegetative 0.45; stolonization and tuber initiation 0.8; yield formation (bulking) 0.7; ripening 0.2; whole season 1.1. FAO-66 Ch. 2 Table 1: seasonal potato Ky 1.1. FAO-66 Eq. 1: `(1 − Ya/Yx) = Ky (1 − ETa/ETx)`. FAO-66 Ch. 2 Table 2 lists a potato row from FAO and IAEA deficit trials (1.10 whole season; 0.60 FAO vs 0.40 IAEA for initial-stage deficit; 0.70 vs 0.46 mid-season; 0.20 late). Its column alignment in the PDF text is ambiguous [U].

Use of Ky: do not multiply Ky into the daily model, which already scales growth by Ks. Use it as a validation target: a season with a 20 % ET deficit during bulking should lose about 0.7 × 20 = 14 % of yield [S rule, I test].

Stage sensitivity, all [S]:

- FAO-66: "Water deficit in the early stages, during stolon formation, tuber initiation, and after tuber initiation have the greatest adverse effect on final yield".
- UMaine #2439: establishment up to tuber initiation is the most drought-resistant period; "Drought stress during mid-bulking has the greatest effect on total yield"; late bulking less.
- Ojala 1987 (Idaho Potato School): a one-time mild stress early or late has little effect on Russet Burbank total yield, mid-season stress the most; mild early stress cuts US No. 1 percentage.

Treat these as consistent: early stress hits tuber number and shape (1.10, 1.11); mid-bulking stress hits tonnage.

#### 1.9.4 How stress enters the daily model [S rules, I wiring]

1. Growth: dW × Ks (1.8.1).
2. Canopy expansion: × Ksexp (1.6.2).
3. Drought senescence: above 0.70 depletion (1.6.3).
4. Tuber number: water in the emergence-to-TI window (1.10).
5. Emergence: dry-soil sprout rate when Dr > RAW (1.4.2).

#### 1.9.5 Waterlogging

[S] Idaho BUL 789:

- "Saturation of the soil profile for more than 8-12 hours can cause root damage due to a lack of oxygen".
- Excess water at planting causes seed-piece decay and delayed emergence.
- Over-irrigation "during vegetative growth and tuber initiation" raises brown center and hollow heart.
- High late-season soil water gives "enlarged lenticels that provide openings for soft rot bacteria", and more pink rot and Pythium leak.
- After 12 to 48 hours, drainage falls to a negligible rate (field capacity).

[S] AquaCrop rates potato "Moderately tolerant to water logging". [U] A laboratory study on harvested tubers (Academia.edu, not opened) reported damage after more than 24 h of waterlogging.

Daily model [I]: the Caribou soil drains in under a day, so true waterlogging needs a saturating event. Flag a "saturated day" when rain plus irrigation exceeds Dr + 40 mm [I]. Each saturated day after emergence costs 5 % of green CC [I]. Each saturated day after TI raises a soft-rot / pink-rot / lenticel risk counter passed to the disease and storage slices [I].

### 1.10 Stems, tuber number and tuber size

| Finding | Source |
|---|---|
| Russet Burbank seed stored at 38 to 40 °F averages about 2.5 stems per seed piece; at higher storage temperatures over 4.0, with an 11 ton/acre loss of US No. 1 and 5.5 ton/acre more undersize | [S] Iritani & Thornton PNW 248 summary |
| Table 2 (Columbia Basin), stems per seed piece by storage temp × planting date (Mar 31 / Apr 20 / May 12): 38 °F 2.4/2.7/2.9; 42 °F 2.5/3.4/3.3; 48 °F 2.8/3.6/3.4; 42→60 °F 2.9/3.3/3.5; 60→42 °F 3.2/3.8/4.2; yields 25.0/24.0/21.0 t/acre | [S] PNW 248 Table 2 |
| "between two and three stems per seed piece would be optimum for high yields. This number of stems would set 8-14 tubers per hill." Higher germination temperature (50 to 60 °F) increases stems. | [S] PNW 248 |
| Young seed: slow emergence, few stems, fewer tubers per hill, long bulking, large tubers, high yield. Old seed: rapid emergence, many stems, many tubers, rapid bulking, smaller tubers, early senescence, lower yield. | [S] PNW 248 Table 1; UMaine #2412; Idaho CIS 1031 Table 2 |
| Seed piece ideal 1.5 to 2 oz (about 1.75 oz); Russet Burbank 2 to 2.5 oz; under 1.5 oz should not be used; over 3 oz feeds poorly in planters; rows 34 to 36 in, in-row 7 to 12 in | [S] UMaine #2412 |
| 42, 64 and 85 g seed at 20, 30 and 40 cm in-row: bigger seed gives higher total yield at any spacing; wider spacing (20 to 40 cm) gives lower total and US No. 1 yield; equal seed weight per ha (2.28 Mg/ha) gives equal yields | [S] Bohl, Stark & McIntosh 2011, Am. J. Potato Res. (abstract) |
| Stem density rises linearly with plant density; tuber density reaches a maximum of 190 tubers/m²; yield is hyperbolic in stem density, maximum 86 Mg/ha; average tuber size follows the inverse yield law, maximum average size > 200 g; size distribution fits a Weibull distribution | [S] Bussan et al. 2007, Crop Science 47 (abstract) |
| Early drought (water withheld from emergence) "greatly reduced" stolons per stem; drought from tuber initiation had no effect on stolon or tuber number; 13 years of field data showed a "highly significant linear relationship" between tubers per stem and rainfall in the first 40 days after planting (range 17.5 to 120 mm) | [S] Haverkort, van de Waart & Bodlaender 1990, Potato Research 33 (abstract) |
| Many reports of stress at TI reducing tuber number, "although not all research consistently demonstrates this trend" (Miller & Martin 1987: no effect on number, but smaller tubers and lower specific gravity) | [S] Ojala 1987 |
| Number of tubers can be increased "by ample availability of soil water at tuber initiation"; tuber number "so far cannot be predicted with any accuracy" | [S] Haverkort et al. 2015 |
| "a near maximum number of tubers > 10 mm can be produced within 1 week" | [S] O'Brien et al. 1998 |
| FAO-66: water shortage reduces "tuber yield, number and size" | [S] |

Recommended rules:

```
stems_per_seed_piece = base_by_seed_age_and_storage   # PNW 248 Table 2 values [S]
                     + 0.4 if planted after May 1 [I, from Table 2 trend S]
                     * size_factor (1.5 oz 0.9, 2 oz 1.0, 3 oz 1.2) [I; direction S]
tubers_per_stem_base = 4.0   # [I] derived: 8–14 tubers from 2–3 stems (PNW 248) gives 4.0–4.7
water_factor = 0.80 + 0.20 * clamp((rain_plus_irrigation_first_40_DAP - 17.5) / (120 - 17.5), 0, 1)
               # [I] slope; window, range and direction from Haverkort et al. 1990 [S]
tubers_per_hill = round(stems * tubers_per_stem_base * water_factor * frost_factor)
cap: tubers per m² <= 190   # Bussan et al. 2007 [S]
fix tuber count at TI + 7 days (O'Brien et al. 1998 [S])
```

Per-hill allocation and size distribution [I]:

- A hill's share of field tuber DM is proportional to its own green canopy (its stems × survival), so gaps next to a hill give it more light. The magnitude is invented.
- Each tuber gets a sink weight drawn at TI from a Weibull distribution (shape about 2 [I]; distribution family from Bussan [S]).
- Tuber fresh mass = hill tuber fresh mass × weight share.
- Constraint check: average tuber size should fall as tubers per m² rise (inverse yield law [S]).

### 1.11 Quality hooks caused by water and temperature (for other slices)

| Trigger | Effect | Source |
|---|---|---|
| Soil below 55 °F (12.8 °C) for 5 to 7 days during early tuber development | Brown center can be initiated | [S] Thornton & Olsen 2020 |
| High soil moisture during TI | More brown center, which can develop into hollow heart | [S] Ojala 1987; Idaho BUL 789 |
| Dry soil in the 2 to 7 weeks after emergence | Common scab favoured; 75 % available moisture in the top 9 in suppresses it (Davis & Garner 1978) | [S] Ojala 1987 |
| Widely fluctuating soil water | Knobs, dumbbells, bottlenecks, pointed ends, growth cracks | [S] Idaho BUL 789; UMaine #2439 ("second growth, knobs, and growth cracks") |
| Early-season water stress | Lower specific gravity, more translucent end, more rough tubers, lower US No. 1 | [S] Idaho BUL 789 |
| Late-season stress | Specific gravity increased in all cultivars tested | [S] Ojala 1987 (Stark & Dwelle 1989 data) |
| Dry tubers at harvest (< 60 % ASW) / turgid tubers | Blackspot bruise / shatter bruise and thumbnail cracks | [S] Idaho BUL 789 |

### 1.12 What, other than the developers, shows the result is right

Run the sim on the real NOAA Caribou weather and compare with these independent published observations:

1. **Irrigation response at the Aroostook Research Farm, 1992 to 2003** (UMaine #2439) [S]. Irrigated minus non-irrigated averaged 49 cwt/acre (17 %). Yearly gains: 1992 4 %, 1993 8 %, 1994 26 %, 1995 37 %, 1996 16 %, 1997 23 %, 1998 23 %, 1999 7 %, 2000 19 %, 2002 16 %, 2003 6 % (read from Figure 2). Regression on rain between 15 July and 31 August: Y (cwt/acre response) = 122.8 − 18.2 X (inches), r² = 0.64. This is the strongest test of the water model, because the weather years are in the game's dataset.
2. **Crop water use by month** (UMaine #2439) [S]: 0.08 in/day (20 to 31 May), 0.10 (June), 0.19 (July), 0.18 (August), 0.10 (1 to 15 September). Simulated monthly mean ETc under irrigation should match within about 20 % [I tolerance].
3. **Emergence days**: 20 to 25 days at 50 °F and more than 40 at 45 °F (Thornton & Olsen) [S]; field range 10 to 51 days (Firman et al.) [S].
4. **Canopy closure and bulking onset at about 300 P-days after emergence** (UMaine #5087) [S]. UMaine also publishes in-season P-day values [S, linked from #5087; not pulled].
5. **Bulking rate**: Russet Burbank "add 6–10 cwt/A/day" during bulking (Idaho BUL 1114) [S], that is 0.67 to 1.12 t/ha/day fresh; Idaho BUL 840 uses an average 7 cwt/acre/day [S]. Potential-rate arithmetic: 1.25 g/MJ × 15 to 24 MJ/m² = 188 to 300 kg DM/ha/day; at 85 % to tubers [I] and 20 % DM this is 7 to 11 cwt/acre/day [computed].
6. **Yield ceiling and level**: Bussan et al. 2007 maximum 86 Mg/ha [S]; FAO-66 temperate "good yield" more than 40 to 50 t/ha [S]; Maine statewide yields of about 260 to 350 cwt/acre (NASS, snippet only [U], to be confirmed by the yields/markets slice).
7. **Yield response factor**: stage-wise deficits should reproduce FAO-33 Ky (1.9.3).
8. **Heat**: a 15-day 35/25 °C spell in late June should cost about a quarter of yield, more with drought (Rykaczewska 2015) [S].
9. **Tubers**: 8 to 14 per hill at 2 to 3 stems (PNW 248) [S]; tuber DM 20 to 25 % (FAO-66) [S]; HI 0.70 to 0.85 (AquaCrop) [S].

### 1.13 Order of daily operations (reference pseudocode)

```
for each day:
  read Tmin, Tmax, P, ETo, cloud, wind, RH  -> Tmean, Rs (Ångström), Pday, TT0
  water: Kc from canopy stage; ETc = Kc*ETo; update Dr (FAO-56 Eq. 85); Ks; drainage; saturated-day flag
  if planted and not emerged:
      seed decay hazard (1.4.3); Firman lag/elongation (1.4.2); emergence check
  if emerged and canopy alive:
      frost check (1.5)
      PD_e += Pday; TT0_e += TT0; root depth (1.7)
      canopy: expand (1.6.1 × Ksexp) or decline (1.6.3); subtract pest/disease defoliation (other slices)
      dW = LUE(Tmean) * CC * min(Rs, 24) * Ks;  W_total += dW
      if PD_e >= PD_TI: TI reached -> open 7-day tuber-number window, then fix tubers/hill (1.10)
      HI = 0.75 * clamp((PD_e - PD_TI)/(PD_mat - PD_TI)); tuber_DM = HI * W_total
      DMC = a*HI + 11; fresh = tuber_DM / DMC
      quality-trigger counters (1.11)
  if vine kill or killing frost after TI: freeze HI, DMC, tuber mass; canopy = 0; Kc ramps toward 0.40
```

---

## 2. Parameter table

| Parameter | Value | Unit | Source | Label |
|---|---|---|---|---|
| P-day cardinal temperatures | 7 / 21 / 30 | °C | Sands et al. 1979 via OSU IPPC CalcMethods code; Manitoba Agriculture | S |
| P-day peak daily rate | 10 | P-day/day | OSU IPPC code (`10 * (1 - ...)`) | S |
| P-day daily weights (Tmin, ⅔Tmin+⅓Tmax, ⅓Tmin+⅔Tmax, Tmax) | 5, 8, 8, 3 (÷24) | n/a | OSU IPPC code | S |
| P-days emergence → TI | 118 (Sebago), 130 (Kennebec), 175 (Russet Burbank) | P-day | Manitoba Table 1 (RB converted from planting) | S |
| P-days emergence → start tuber growth | 236, 260, 285 | P-day | Manitoba Table 1 | S |
| P-days emergence → maximum bulking | 460 (Sebago), 420 (Kennebec) | P-day | Manitoba Table 1 | S |
| P-days emergence → cessation of bulking | 600 (Sebago), 550 (Kennebec) | P-day | Manitoba Table 1 | S |
| P-days emergence → maturity | 850 (Sebago); about 1000 from planting (RB) | P-day | Manitoba Table 1 | S |
| Planting → 50 % emergence, Russet Burbank | 155 | P-day | Manitoba Table 1 | S |
| Canopy closure / bulking onset / early blight threshold | about 300 | P-day (from emergence: start point U) | UMaine #5087; UW-Madison | S |
| Emergence → onset of TI | 14 to 21 | days | O'Brien et al. 1998 | S |
| Duration of tuber initiation | about 7 (3 to 14) | days | O'Brien et al. 1998; Idaho BUL 789 says 10 to 14 | S |
| Firman lag L0, b, c | 60 (58 warmed seed), 276, 0.652 | °C·d > 1 °C, n/a | Firman et al. 1992 Eq. 2 | S |
| Firman sprout base Ta / optimum Tb / maximum To | 6.3 / 19.8 / 37 | °C | Firman et al. 1992 | S |
| Firman maximum sprout rate R0 (wet / dry soil) | 17.7 / 12.1 | mm/day | Firman et al. 1992 | S |
| DSS sprout growth rate | 0.7 | mm per °C·d (base 0) | Haverkort et al. 2015 | S |
| Planting soil temperature, recommended | 50 (10) | °F (°C) | UMaine soil-temperature page; UMaine #2077 | S |
| Wound-healing / decay threshold | 45 (7.2) | °F (°C) | Thornton & Olsen 2020; Utah State | S |
| Foliage minor injury | 29 to 32 (−1.7 to 0) | °F (°C) | Univ. of Delaware 2020 | S |
| Foliage killed to ground | < 28 (−2.2) | °F (°C) | Univ. of Delaware 2020 | S |
| Leaf lethal temperature; no hardening | −3 | °C | Stegner et al. 2019 | S |
| Canopy closure thermal time | 650 | °C·d base 0 from emergence | Haverkort et al. 2015 | S |
| Full interception at LAI | 3 | m²/m² | Haverkort et al. 2015; FAO-56 ch. 5 | S |
| Maximum LAI | 3.5 to 6.0 | m²/m² | Idaho BUL 789 | S |
| AquaCrop cc0 per plant | 10 to 20 | cm²/plant | AquaCrop v7.3 Annex I | S |
| AquaCrop CGC / CDC | 0.017 to 0.020 / 0.002 | per GDD (base 2, upper 26) | AquaCrop v7.3 Annex I | S |
| Canopy expansion water-stress thresholds | 0.20 → 0.60 of TAW, shape 3 | fraction | AquaCrop v7.3 Annex I | S |
| Drought senescence threshold | 0.70 of TAW, shape 3 | fraction | AquaCrop v7.3 Annex I | S |
| Light-use efficiency | 1.25 | g DM per MJ intercepted global radiation | Haverkort et al. 2015 | S |
| LUE temperature points (zero / optimum low / optimum high / zero) | 3 / 15 / 20 / 28 | °C (daily mean) | Haverkort et al. 2015 Table 1 | S |
| Radiation cap | 12 PAR (about 24 global) | MJ/m²/day | Kooman & Haverkort 1995 | S (PAR fraction U) |
| CO₂ effect on LUE | +0.001875 per ppm above 360 | g/MJ per ppm | Haverkort et al. 2015 Eq. 11 | S |
| Harvest index at crop end | 0.75 (range 0.70 to 0.85) | fraction | Haverkort et al. 2015; AquaCrop Annex I | S |
| Tuber DM at TI | 11 | % | Haverkort et al. 2015 | S |
| Tuber DM at maturity | 16 to 26 (typical 20 to 25) | % | Haverkort et al. 2015; FAO-66 | S |
| Tuber growth temperature response | 0 at 4, 0.5 at 10, 1 at 16 to 24, 0.5 at 30, 0 at 35 | relative, °C | Kooman & Haverkort 1995 (Ingram & McCloud 1984) | S |
| Bulking rate, Russet Burbank | 6 to 10 (0.67 to 1.12) | cwt/acre/day (t/ha/day) | Idaho BUL 1114 | S |
| FAO-56 Kc ini / mid / end | 0.50 / 1.15 / 0.75 (0.40 with vine kill) | n/a | FAO-56 Table 12 | S |
| FAO-56 stage lengths, continental, May planting | 25 / 30 / 45 / 30 (130) | days | FAO-56 Table 11 | S |
| Maximum crop height | 0.6 | m | FAO-56 Table 12 | S |
| Root depth (FAO / Maine effective) | 0.4 to 0.6 / 0.46 to 0.51 | m | FAO-56 Table 22; UMaine #2439 | S |
| Depletion fraction p | 0.35 (adjusted ±0.04 per mm/day of ETc from 5) | fraction of TAW | FAO-56 Table 22 | S |
| Ky by stage (early veg / stolonization-TI / bulking / ripening / season) | 0.45 / 0.8 / 0.7 / 0.2 / 1.1 | n/a | FAO Annex II Table 12; FAO-66 Table 1 | S (stage labels U) |
| AWC Caribou gravelly loam, by horizon (rep) | 0.24 / 0.18 / 0.13 | cm/cm | USDA SSURGO via Soil Data Access, CgB | S |
| TAW to 0.457 m (18 in) | 93 (SSURGO rep), 75 (UMaine), 72 (SSURGO low) | mm | SSURGO; UMaine #2439 Table 1 | S |
| Ksat Caribou | 9.17 (about 33 mm/h) | µm/s | SSURGO | S |
| Saturation causing root damage | > 8 to 12 | hours | Idaho BUL 789 | S |
| Stems per seed piece | 2.4 to 4.2 (2.5 typical, young RB) | stems | Iritani & Thornton PNW 248 | S |
| Tubers per hill at 2 to 3 stems | 8 to 14 | tubers | PNW 248 | S |
| Maximum tuber density | 190 | tubers/m² | Bussan et al. 2007 | S |
| Rainfall window for tuber number | first 40 days after planting, 17.5 to 120 mm range | mm | Haverkort et al. 1990 | S |
| Seed piece size | 1.5 to 2.0 (RB 2.0 to 2.5) | oz | UMaine #2412 | S |
| Seed-decay hazard multipliers | base 0.001/day; ×3 cold, ×3 wet, ×5 hot, ×1.5 cut | n/a | none | I |
| Frost set-back before TI | 7 | days | "a few days" (Delaware) | I |
| Water factor on tuber number | 0.80 → 1.00 | multiplier | direction from Haverkort 1990 | I |

---

## 3. Sources

Opened and read (value-bearing):

1. USDA NRCS Official Series Description, CARIBOU: https://soilseries.sc.egov.usda.gov/OSD_Docs/C/CARIBOU.html. Read: pedon horizons and rock fragments, drainage, permeability, use for potatoes, climate (36 to 40 in precipitation, 90 to 120 day frost-free season).
2. USDA NRCS Soil Data Access, SSURGO tabular REST service: https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest. Queried legend, mapunit, component, chorizon and muaggatt for ME607 and ME608, map unit CgB. Read: AWC low/rep/high, Ksat, texture, OM, bulk density, water retention, AWS 0 to 25/50/100/150 cm.
3. Oregon State IPPC, "Degree-Day Calculation Methods": https://mint.ippc.orst.edu/CalcMethods.html. Read: P-day code (rate function, 5/8/8/3 weights, 1/24).
4. PNW Pest, "Degree-Day Calculation formulas for IPM models": https://pnwpest.org/wea/wea3.html. Read: the same P-day code, "(7,21,30)".
5. Manitoba Agriculture, "Heat units for potato production in Manitoba": https://manitoba.ca/agriculture/weather/heat-units-for-potato-production-in-mb.html. Read: Table 1 P-days by stage, root and canopy P-days, seasonal P-day totals.
6. FAO-56 (Allen et al. 1998), ch. 3: https://www.fao.org/4/x0490e/x0490e07.htm (Ångström Eq. 35, Rso Eq. 36/37, Ra components); ch. 5: https://www.fao.org/4/x0490e/x0490e0a.htm (stage definitions, LAI 3 full cover); ch. 6: https://www.fao.org/4/x0490e/x0490e0b.htm (Tables 11 and 12, footnote 4, Eq. 62 variables, Eq. 66); ch. 8: https://www.fao.org/4/x0490e/x0490e0e.htm (Table 22 potato Zr 0.4 to 0.6 m and p 0.35, p adjustment, Eq. 82, 83, 85).
7. Allen, Pereira, Smith, Raes & Wright 2005, "FAO-56 Dual Crop Coefficient Method..." (J. Irrig. Drain. Eng.), Nevada DWR copy: https://water.nv.gov/mapping/et/Docs/Annex_1.pdf. Read: Ks = (TAW − Dr)/((1 − p) TAW) (Eq. 32); Kc climate-adjustment term (Eq. 5).
8. FAO, Annex II Irrigation scheduling, Table 12 Ky: https://www.fao.org/4/x5647E/x5647e0e.htm. Read: potato row 0.45, 0.8, 0.7, 0.2, 1.1.
9. FAO Irrigation and Drainage Paper 66 (Steduto et al. 2012), ch. 2: https://www.fao.org/4/i2800e/i2800e02.pdf. Read: Eq. 1, Table 1 (potato Ky 1.1), Table 2 potato row.
10. FAO-66 ch. 3.4, Potato (Quiroz et al.): https://www.fao.org/4/i2800e/i2800e07.pdf. Read: planting depth and density, emergence, rooting and uptake depth, water requirement 350 to 650 mm, WP 4 to 11 kg/m³ fresh, TAW depletion 30 to 50 %, stage sensitivity, frost ≤ 1 °C, heat ≥ 35 °C, temperature optima, DM 20 to 25 %, yields.
11. AquaCrop v7.3 Reference Manual Annex I (FAO, July 2026): https://www.fao.org/docs/aquacroplibraries/default-document-library/annexesaquacropv73.pdf. Read: §I.3 potato parameter tables.
12. AquaCrop v7.3 Reference Manual ch. 3: https://ees.kuleuven.be/en/aquacrop/resources/reference-manual/chapter3aquacropv73.pdf. Read: Eq. 3.2a/b/c stress shapes, §3.3 GDD methods, Eq. 3.4a/b/c canopy, Eq. 3.10a/b/c transpiration, Eq. 3.11a/b biomass.
13. Kooman & Haverkort 1995, "Modelling development and growth of the potato crop influenced by temperature and daylength: LINTUL-POTATO", in Potato Ecology and Modelling of Crops under Conditions Limiting Growth, pp. 41 to 60: https://edepot.wur.nl/215990. Read: sprout rate 1 mm/°C·d > 2 °C, temperature ranges for leaf, TI and tuber growth, Ingram & McCloud response, LUE 2.5 g/MJ PAR, 12 MJ cap, LUE slope −0.02/°C, leaf longevity 1000 to 1700 °C·d, Table 2.
14. Haverkort, Franke, Steyn, Pronk, Caldiz & Kooman 2015, "A Robust Potato Model: LINTUL-POTATO-DSS", Potato Research 58: 313 to 327 (open access; University of Pretoria repository copy): https://repository.up.ac.za/bitstreams/e919a80e-8258-4b3f-b201-6b31ddbe9d7c/download. Read: whole text including Table 1, Eqs. 1 to 11.
15. Firman, O'Brien & Allen 1992, "Predicting the emergence of potato sprouts", J. Agric. Sci. 118: 55 to 61: https://www.niab.com/uploads/files/Predicting_sprout_emergence_Firman_et_al_1992.pdf. Read: Eqs. 1 to 3, parameters, Tables 3 and 4, introduction (Sale 1979, MacKerron 1984/85).
16. O'Brien, Allen & Firman 1998, "A review of some studies into tuber initiation in potato", J. Agric. Sci. 130: 251 to 270: https://www.niab.com/uploads/files/Tuber_initiation_review_O'Brien_et_al_1998.pdf. Read: emergence-to-initiation interval 14 to 21 days, duration of initiation.
17. University of Idaho BUL 789, King & Stark, "Potato Irrigation Management": https://content-hub.uidaho.edu/api/public/content/f3c59e137d2b49b8831f5f8a501522d8?v=d34906a5. Read: growth stages I to V, LAI, rooting, ASW thresholds, waterlogging, Table 1 soil water.
18. University of Idaho BUL 1114, "Idaho Potatoes": https://content-hub.uidaho.edu/api/public/content/9b5bd954d5294d12b94650c713952750?v=96e68b78. Read: 6 to 10 cwt/A/day, ideal temperatures, heat-stress defects, seed piece size and depth.
19. University of Idaho Bul 840, Stark, Westermann & Hopkins, "Nutrient Management Guidelines for Russet Burbank Potatoes": https://objects.lib.uidaho.edu/uiext/uiext25485.pdf. Read: "average tuber bulking rate of 7 cwt/acre/day" (text extraction garbled).
20. University of Idaho CIS 1031, Bohl, Nolte & Kleinkopf, "Potato Seed Management: Seed Size and Age": https://objects.lib.uidaho.edu/uiext/uiext31026.pdf. Read: seed size guidance, young vs old seed table (text extraction garbled; numbers used only where also in PNW 248 or UMaine #2412).
21. Iritani & Thornton, PNW 248 "Potatoes: Influencing Seed Tuber Behavior": https://www.nwpotatoresearch.com/images/documents/PotatoesInfluencingSeedTuberBehavior.pdf. Read: summary, Table 1, Table 2, stems and tubers per hill.
22. Ojala 1987, "Effect of Water Stress on Potato Growth and Development" (Idaho Potato School): https://www.nwpotatoresearch.com/images/documents/EffectOfWaterStressOnPotatoGrowthandDevelopment.pdf. Read: vegetative, TI, bulking and maturation stress effects; scab; brown center; specific gravity.
23. UMaine Extension Bulletin #2439, Sexton, Porter & Johnson 2008, "Irrigating Potatoes in Maine": https://extension.umaine.edu/publications/2439e/. Read: Table 1 Caribou 0.21 in/in, 22 % gravel, 2.95 in to 18 in; depletion thresholds; water use by month; irrigation response by year; regression.
24. UMaine Extension Bulletin #2412, Johnson, "Selecting, Cutting and Handling Potato Seed": https://extension.umaine.edu/publications/2412e/. Read: seed size, curing, emergence, physiological age.
25. UMaine Extension Bulletin #2077, "Growing Potatoes in the Home Garden": https://extension.umaine.edu/publications/2077e/. Read: 50 °F planting, spacing, depth, hilling.
26. UMaine Extension, soil temperatures at six inches, Presque Isle: https://extension.umaine.edu/potatoes/weather/soil-temps-six-inches-presque-isle/. Read: 50 °F recommendation (data table did not render).
27. UMaine Extension Bulletin #5087, "Early Blight of Potatoes and Tomatoes": https://extension.umaine.edu/ipm/ipddl/publications/5087e/. Read: about 300 P-days ≈ canopy closure and bulking onset.
28. UW-Madison Vegetable Pathology update: https://vegpath.plantpath.wisc.edu/?p=1544. Read: P-day ≥ 300 threshold; 2022 site totals.
29. Thornton & Olsen, "Early Planting Risks", Potato Country, 16 Mar 2020: https://potatocountry.com/2020/03/16/early-planting-risks/. Read: 45/50 °F emergence times, wound healing, decay, brown center 55 °F.
30. Utah State University Extension, potato seed handling: https://extension.usu.edu/vegetableguide/potato/potato-seed-handling-treament. Read: < 45 °F wet soil decay; 50 to 60 °F planting.
31. University of Delaware Weekly Crop Update, G. Johnson, 15 May 2020: https://sites.udel.edu/weeklycropupdate/?p=14871. Read: 29 to 32 °F minor injury, < 28 °F kill to ground, regrowth.
32. Stegner, Schäfernolte & Neuner 2019, "New Insights in Potato Leaf Freezing by Infrared Thermography", Applied Sciences 9: 819, abstract via Europe PMC REST (PMC6914373). Read: −3 °C leaf kill, no frost hardening.
33. Haverkort, van de Waart & Bodlaender 1990, "The effect of early drought stress on numbers of tubers and stolons of potato...", Potato Research 33. Springer abstract page: https://link.springer.com/article/10.1007/BF02358133. Read: abstract.
34. Rykaczewska 2015, "The Effect of High Temperature Occurring in Subsequent Stages of Plant Development on Potato Yield and Tuber Physiological Defects", Am. J. Potato Res. 92: 339 to 349: https://link.springer.com/article/10.1007/s12230-015-9436-x. Read: abstract and summary of results.
35. Bohl, Stark & McIntosh 2011, Am. J. Potato Res., DOI 10.1007/s12230-011-9213-4. Abstract via Europe PMC.
36. Bussan, Mitchell, Copas & Drilias 2007, Crop Science, DOI 10.2135/cropsci2007.01.0026. Abstract via Europe PMC.
37. NDAWN potato page: https://ndawn.ndsu.nodak.edu/potato-late-blight.html. Opened; contains no formula, so not used for values.

Could not open (not used as sourced):

- Sands, Hackett & Nix 1979, Field Crops Research 2: 309 to 331 (ScienceDirect 403; Semantic Scholar has the abstract elided). The formula is taken from the OSU and PNW implementations instead.
- "Are physiological days of potato calculated accurately?", American Potato Journal 1989 (Springer paywall).
- Florida State Horticultural Society paper on potato GDD and P-days (site under maintenance).
- Levy & Veilleux 2007, Am. J. Potato Res. 84 (abstract elided at Crossref and Semantic Scholar).
- MDPI frost follow-up paper and the MDPI page of Stegner et al. (403); PMC page (browser check). The Europe PMC abstract was used instead.
- Love & Thompson-Johns 1999, HortScience (403).
- Potato Association of America handbook (Bohl & Johnson 2010): both URLs returned HTML, not the PDF.
- FAO Land & Water crop-information potato page (404; seen only as a search snippet).
- NDSU "Checklist of Potato Emergence Problems" (403).
- Kooman 1995 thesis scan (edepot.wur.nl/199013: image-only PDF, no text).
- Downloaded but not read: Idaho "Potato Production with Limited Water Supply"; FAO-66 ch. 3.3 AquaCrop guide (skimmed headings only).

---

## 4. Unconfirmed items and gaps

1. **Original Sands et al. (1979) paper not read.** The P-day formula comes from two independent public implementations (OSU IPPC, PNW Pest) that cite "equation 2 by Sands". The original bulking model (a maximum bulking rate b of 0.036 to 0.103 t ha⁻¹ P-day⁻¹, seen only in a search snippet of Part VI) is [U] and not used.
2. **P-day thresholds exist for only three cultivars** (Sebago, Kennebec, Russet Burbank, Manitoba). The early class and the mid-class maturity value are [I]. Maturity-class membership of named varieties (Kennebec mid, Russet Burbank late, Superior early) is common knowledge and from a UMass guide snippet [U]. The varieties slice should confirm it.
3. **Manitoba's "canopy covers the ground after about 450 P-days"** does not say whether it counts from planting or emergence. Canopy-closure timing varies by up to two weeks across DSS (650 °C·d), AquaCrop (CGC) and UMaine (about 300 P-days); 650 °C·d was chosen.
4. **Seed-piece decay rates**: no quantitative model found. Triggers are [S]; all magnitudes are [I].
5. **Frost**: the thresholds are [S], but partial-damage fractions, the regrowth set-back, the post-TI no-regrowth rule and the screen-to-leaf temperature offset are [I] or [U]. Tuber survival in unfrozen soil comes from gardening sources only [U].
6. **Night-temperature threshold for tuberization (about 20 °C)**: secondary citations only [U]. Whether Caribou ever sees Tmin > 20 °C in the TI window is [U]; check against the NOAA record.
7. **Water and tuber number**: the window and direction are [S] (Haverkort 1990), but the slope is not in the abstract; the 0.8 to 1.0 factor is [I]. The magnitude found in a snippet (Bolivia, −17 %) was not opened [U]. Evidence on whether stress at TI itself cuts number is mixed (Ojala 1987).
8. **Ky stage labels**: values [S] (FAO Annex II); mapping the first two values to "early vegetative" and "stolonization/TI" comes from the FAO Land & Water page seen only as a snippet [U]. FAO-66 Table 2 column alignment is ambiguous [U].
9. **AquaCrop vs FAO-56 stomatal threshold** (0.60 vs 0.35): a real conflict between model conventions; FAO-56 chosen for agreement with Idaho and UMaine field thresholds.
10. **TAW for Caribou**: SSURGO representative (93 mm to 18 in) and UMaine (75 mm) differ by about 20 %. Both [S]; SSURGO chosen. UMaine labels the soil "Caribou silt loam", while the OSD and SSURGO say gravelly loam [S discrepancy].
11. **Radiation from cloud cover**: the Ångström form is [S]; using (1 − cloud fraction) for sunshine fraction is [I]. PAR ≈ 0.5 × global is [U]. The weather slice should own and validate this against a Caribou radiation record (NSRDB or similar [U]).
12. **Bulking-rate validation for Maine specifically**: no Maine source found for daily bulking. Idaho values are used. Maine yields (NASS, about 260 to 350 cwt/acre) are snippet-only [U].
13. **Specific gravity and size-grade numbers** belong to the quality and markets slices; only the triggers are given here.
14. **Weibull parameters for tuber size** (Bussan et al. 2007) are not in the abstract; shape about 2 is [I].
15. **Waterlogging**: duration thresholds for field yield loss are not found beyond Idaho's "8-12 hours" root damage; the daily saturated-day rule and its penalties are [I].
16. **Partitioning coupling**: using P-days (rather than DSS's base-0 °C·d) as the HI clock, the 85 % marginal partitioning used in one sanity calculation, and per-hill allocation by canopy share are all [I].
17. **CO₂ by year (1973 to 2025)** for the optional LUE term needs a data source (for example the NOAA Mauna Loa annual means [U]).
