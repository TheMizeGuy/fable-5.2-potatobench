# 04. Harvest, grading, tuber defects and storage

Research slice for "The County". Scope: USDA grades and size classes, how a crop splits into
size classes, the tuber defects a player could have prevented, vine kill and skin set, digging
conditions, frost in the ground, and the cellar (curing, holding, shrink, sprouting, sweetening
and rot spread). Written 2026-11-11.

Every rule below carries one of three labels:

- **SOURCED**: the rule or number is stated in a source I opened (section 3 lists them).
- **DERIVED**: my arithmetic on sourced numbers; the working is shown.
- **INVENTED**: a design constant with no published value. It is anchored to sourced facts, and
  the anchors are listed so it can be retuned. `docs/MODEL.md` should carry the same label.

Units: the sources are American, so rules are given in °F, inches, ounces and cwt (100 lb) with
metric in brackets. DESIGN.md requires the core to use only `+ - * /`, `sqrt` and integer
hashing, so every curve below is given as a lookup table or a piecewise-linear rule; nothing
needs `exp`, `log` or a fractional power at run time.

---

## 1. What the simulation should implement

### 1.1 Tuber sizes inside a hill

**Framework (SOURCED).** Within a crop, tuber size is described by a two-parameter
distribution: a mean size set by yield and tuber number, and a spread whose ratio to the mean
(the coefficient of variation, COV) stays roughly constant as yield rises (Travis 1987, as
summarised by Smart 2017: "The standard deviation increases as yield and mean tuber size
increase, but the ratio between the standard deviation and the mean tuber size remains stable";
"Typical values of the COV of tuber size range from c. 12-20 %"). Smart's COV is weighted by
yield (the normal curve is fitted to yield, not tuber count). Weibull, gamma and normal curves
are all in use; Mhango et al. (2021) fitted Weibull curves to five UK fields and got shape
parameters of 3.4 to 5.15 for the distribution of tuber *numbers* by diameter and 6.46 to 8.52
for the distribution of *yield* by diameter.

**Rule for the game (DERIVED, with one INVENTED choice).**

1. Each hill gets a fresh yield `Y` (g) and a tuber count `n` from the growth model (another
   slice). Mean tuber weight is `Y / n`.
2. Each tuber's weight is `(Y / n) * q / 1000`, where `q` is read from the table below by
   hashing (hill id, tuber index) into one of 20 equal-probability bins. Rescale so the hill's
   tubers sum exactly to `Y`.
3. Diameter is never needed at run time: grade boundaries are converted to weights once, using
   `w = c * d^3`.

Relative tuber weight table, `q` = 1000 × (tuber weight / mean tuber weight), 20 equal-probability
bins of a Weibull distribution of diameter by number. Computed offline (DERIVED); each row sums
to 20,000.

| Shape k | Yield-weighted size COV | q for bins 1..20 |
|---|---|---|
| 5 | 0.173 | 124, 243, 336, 419, 496, 570, 643, 715, 789, 865, 943, 1025, 1112, 1207, 1312, 1431, 1571, 1746, 1992, 2461 |
| 6 | 0.151 | 180, 316, 414, 497, 572, 642, 710, 776, 842, 909, 977, 1047, 1121, 1201, 1287, 1383, 1495, 1633, 1823, 2175 |
| 8 | 0.121 | 284, 433, 530, 607, 675, 736, 794, 849, 903, 956, 1009, 1063, 1119, 1177, 1240, 1309, 1388, 1483, 1610, 1835 |

Which k (INVENTED choice inside a sourced range): use **k = 6** for round whites and reds
(yield-weighted COV 0.15, the middle of Smart's 12-20 %) and **k = 8** for long russets. The
k = 8 figure comes from fitting the 2017 Aroostook Research Farm data for Russet Burbank
(Porter and Ocaya 2018: 10-18 % of yield under 2 in and 11-17 % over 10 oz across Tables 1 and
2). Fitting targets of 15 % under 2 in and 14 % over 10 oz with `c = 0.00105` gives k = 8.5 and a
mean tuber weight of 183 g (6.4 oz). At 300 cwt/A and 16 in seed spacing that is 6.5 tubers per
plant, assuming 34 in rows (the report does not give row width), which is plausible for Russet
Burbank. The UK fits (k 3.4 to 5.15 by number) are wider than the Maine
russet data; k = 5 is in the table for high-set varieties if the growth slice wants it.

Weight-diameter constant `c` (g per mm³), DERIVED:

- Round types: the USDA standard pairs diameters with weights: 2-1/2 in ↔ 6 oz (Size A
  footnote), 2-3/4 in ↔ 8 oz (Chef), 3 in ↔ 10 oz (Large). These give c = 0.00064 to 0.00067.
  Use **c_round = 0.00066**.
- Long types: AH-66 (Voss) gives "a weight minimum of 118 g (4 oz) for long potatoes" as the
  equivalent of the 1-7/8 to 2 in minimum, so c ≈ 118 / 47.6³ = **c_long ≈ 0.0011** (0.00105 was
  used for the Maine fit; the difference is within the noise).

Grade boundaries in grams, DERIVED from `c * d^3`:

| Boundary | Round (g) | Long (g) |
|---|---|---|
| 1-1/2 in (38 mm), U.S. No. 2 minimum, Size B minimum | 37 | 58 |
| 1-5/8 in, creamer maximum | 46 | 74 |
| 1-7/8 in (48 mm), U.S. No. 1 minimum | 71 | 118 (AH-66's 4 oz) |
| 2-1/4 in, Size B maximum | 123 | 196 |
| 2-1/2 in or 6 oz, Size A 40 % test | 170 (6 oz) | 170 (6 oz) |
| 10 oz, "Large" minimum | 284 | 284 |

What the model then produces (DERIVED from the table, k = 6, round types, shares by weight,
which is the basis USDA uses for tolerances): at a mean tuber weight of 90 g, 80 % of yield is
at least 1-7/8 in and 13 % is 6 oz or larger; at 120 g, 91 % and 37 %; at 150 g, 95 % and 57 %.
So a lot passes the Size A test (40 % at least 2-1/2 in or 6 oz) once mean tuber weight reaches
about 125 g. Fewer tubers per hill, from wide spacing, skips or
low stem number, means bigger tubers.

### 1.2 USDA grading (SOURCED, U.S. Standards for Grades of Potatoes, effective 2011)

Grade each tuber, then grade the lot against tolerances.

Per tuber:

- **U.S. No. 1**: similar varietal characteristics; firm; fairly clean; fairly well shaped; free
  from freezing, blackheart, late blight, southern bacterial wilt, ring rot, soft rot and wet
  breakdown; free from **damage** by any other cause; at least 1-7/8 in diameter unless
  otherwise specified (§51.1541).
- **U.S. Commercial**: as No. 1, but free only from *serious* damage by dirt, russet scab and
  Rhizoctonia (§51.1542).
- **U.S. No. 2**: not seriously misshapen; free from freezing, blackheart, late blight, wilt,
  ring rot, soft rot and wet breakdown; free from **serious damage**; at least 1-1/2 in
  (§51.1543).
- Otherwise a **cull**.
- "Damage" means a defect costing more than 5 % of tuber weight to remove, or one that
  materially detracts from appearance or quality; "serious damage" is the same at 10 %
  (§51.1560-51.1561). Freezing, late blight, ring rot, wilt, soft rot and wet breakdown are
  serious damage "in any degree" (Table III footnote).

Defect thresholds the game needs (Tables III, V, VII):

| Defect | Damage (fails No. 1) | Serious damage (fails No. 2) |
|---|---|---|
| Greening | removal > 5 % of weight, or green > 25 % of surface | removal > 10 %, or green > 50 % of surface |
| Growth cracks | > 1/2 the length (round) or > 1/3 (long), or depth beyond Table V (1/4 in on a 2-2.5 in tuber) | > 3/4 the length, or deeper than Table V |
| Hollow heart / brown center | larger than a 1/2 in circle in a 2-1/2 in tuber | larger than a 3/4 in circle |
| Surface scab | > 5 % of surface | > 25 % of surface |
| Pitted scab | > 1/2 in aggregate area on a 2-1/2 in (6 oz) tuber, or > 5 % weight | > 1 in aggregate area, or > 10 % weight |
| Bruises (impact) | > 5 % of surface or > 5 % weight lost to removal | > 10 % |
| Second growth (knobs) | materially detracts | seriously detracts |
| Sprouts | > 5 % of lot with any sprout > 1/4 in at shipping point | > 10 % of lot with sprouts > 1/2 in |
| Freezing | any (serious) | any |

Lot tolerances (§51.1546):

| Grade | Total defects | External | Internal | Frozen or soft rot |
|---|---|---|---|---|
| U.S. No. 1, shipping point | 8 % | 5 % | 5 % | 1 % |
| U.S. No. 1, en route/destination | 10 % | 7 % | 7 % | 2 % |
| U.S. Commercial | 20 % (10 % failing No. 2) | 6 % | 6 % | 1 % |
| U.S. No. 2, shipping point | 10 % | 6 % | 6 % | 1 % |

Off-size: no more than 3 % of the lot under the stated minimum (5 % if the minimum is 2-1/4 in
or 5 oz or more), and no more than 10 % over a stated maximum.

Size designations (Table I): **Creamer** 3/4 to 1-5/8 in; **Size B** 1-1/2 to 2-1/4 in;
**Size A** at least 1-7/8 in with at least 40 % of the lot 2-1/2 in or 6 oz or larger; **Chef**
2-3/4 to 4-1/2 in (8 to 28 oz); Small 1-3/4 to 2-1/2 in (max 6 oz); Medium 2-1/4 to 3-1/4 in
(5 to 10 oz); Large 3 to 4-1/2 in (10 to 28 oz). Count sizes (Table II) run from "Under 50" to
"Over 140" with a weight range per tuber; they are normally packed in 50 lb cartons (AH-66).

Skinning descriptors (§51.1549, SOURCED): "Practically no skinning" means no more than 5 % of
tubers with more than 1/10 of the skin missing or feathered; "slightly skinned" no more than
10 % with more than 1/4 missing; "moderately skinned" no more than 10 % with more than 1/2
missing; "badly skinned" more than 10 % with more than 1/2 missing.

Game rule (DERIVED): sort tubers into No. 1, No. 2 and cull; a lot sells as No. 1 only if the
defect and off-size shares fit the table above. Otherwise it is sold as No. 2 or processing, or
the player pays for sorting. That gives one price lever with the real mechanism behind it.

Real outcomes, for calibration (SOURCED):

- Aroostook Research Farm 2017, Russet Burbank N trial: total 257 cwt/A, U.S. No. 1 218 cwt/A
  (85 %), 18 % of yield under 2 in, 17 % over 10 oz, 14.2 % external defects (misshapes),
  1.4 % hollow heart in tubers over 10 oz. Caribou Russet in the same trial: 303 and 296 cwt/A
  (98 %), 2.1 % external defects. Planted May 23, vines killed Sept 15, dug Oct 4.
- Same farm 2017, Russet Burbank K/Ca/B trial: 312 to 363 cwt/A total, U.S. No. 1 at 93-95 %
  of total, 10-16 % under 2 in, external defects 4.4-7.0 %, hollow heart in tubers over 10 oz
  from 0 % to 11.1 % by treatment. Vines killed Sept 22, dug Oct 5-6.
- Idaho Russet Burbank: "40 to 80% U.S. No. 1" (Garner et al., UI CIS, 1978).
- Alaska hilling trial, four varieties: 86.4 % U.S. No. 1 when hilled, 78.7 % when not.

### 1.3 Defects the player could have prevented

Each entry gives the trigger (what the player controls), the window, a rule and the typical
share of the crop affected.

#### Greening (light on shallow tubers)

- SOURCED cause: "sunlight directly contacts tubers growing at or near the soil surface or
  reaches tubers through cracks in the soil surface" (OSU EM 8948). "Potatoes with minimal soil
  cover during the growing season tend to have higher concentrations of glycoalkaloids than
  those planted deeply and kept well-covered. Good hilling of potato rows ensures tubers are not
  exposed to light" (OSU EM 9407). Immature and small tubers make more glycoalkaloid under light
  (EM 9407).
- SOURCED magnitudes, Alaska 1988-89 (Carling and Walworth 1990, Table 1, averaged over four
  varieties): green tubers were 1.5 t/A out of 15.0 t/A total with no hilling (DERIVED: 10 % of
  yield), against 0.3 to 0.6 t/A out of 16.3 to 17.0 t/A when hilled (1.8 to 3.7 %). High hills
  (about 9 in) did best; low, late hills (about 6 in) were worst of the hilled treatments.
  Superior and Kennebec "produced some green tubers under all hilling treatments, indicating
  these two varieties are predisposed to greening"; Bake-King produced almost none. Hilled plots
  also yielded more in total and in U.S. No. 1.
- SOURCED (search abstract only, not opened): planting seed at 8 cm gave more field greening
  than 15 or 23 cm in Russet Burbank, Frontier Russet and Shepody (American Potato Journal,
  doi 10.1007/BF02872222).
- After harvest: greening "may occur in part of a tuber exposed to light"; bright light during
  handling, or 1 to 2 weeks of low light, can green tubers (AH-66). Under 13 µmol m⁻² s⁻¹ of
  white or blue light at 20 °C, tubers began to green after 4 days and all were green by day 8
  (Foods 2025 review). Store in the dark.
- Rule (INVENTED constants, sourced anchors): green share of a hill's yield =
  `g_hill * g_variety`, with g_hill = 0.10 if never hilled, 0.035 for one low or late hilling,
  0.02 for a full hill (anchors: Alaska Table 1). g_variety = 1.5 for Superior and Kennebec, 1.0
  for most, 0.3 for resistant types (anchor: Alaska Table 2 ranking). Assign greening to the
  hill's shallowest tubers first; the growth slice decides which tubers are shallow. Multiply by
  1.5 for a hill whose cover was washed off by heavy rain before canopy closure (INVENTED; the
  Tanios 2018 review lists erosion as a cause). A green tuber fails No. 1 when green covers
  more than 25 % of its surface; most are culled at grading (AH-66).
- Glycoalkaloids, for text only: market potatoes should be under 200 mg/kg; a green tuber has
  250 to 280 mg/kg (OSU EM 9407; that page's "12-20 mg/kg" for normal tubers looks like a units
  slip and should not be used).

#### Hollow heart and brown center

- SOURCED cause and window: brown center is "Initiated by COOL TEMPERATURES from TI to four weeks
  after TI", "Increased by HIGH SOIL MOISTURE", with "Severity increased by RAPID TUBER GROWTH"
  (Hiller and Koller 1982, WSU). Tubers are most susceptible from tuber initiation to about
  2 oz (Hiller and Koller 1981).
- SOURCED thresholds, which disagree slightly: soil "below 55°F for 5 to 7 days during early
  tuber development" and available soil moisture "above 80 to 85%" (Wang, UW-Madison 2025);
  soil under 56 °F for 5-8 straight days, or available soil moisture over 80 % (UF HS945); "The
  critical temperature at which BC is greatly reduced appears to be around 60°F" (Hiller and
  Koller 1982). Use **55 °F (12.8 °C) for 5 or more consecutive days**, with 60 °F as the upper
  bound.
- SOURCED multipliers: wet areas of fields "had nearly twice as much BC as the dry spots" (Hiller
  and Koller 1981, 27 commercial fields); "64% of the largest or fastest growing tubers exhibited
  BC whereas only 18% of the smaller tubers" (same paper). Wide spacing makes larger tubers and
  more hollow heart (UF HS945); planter skips let plants grow too fast (Hiller and Koller 1981).
  Early cool plantings exceeded 20 % brown center in 1980 (Hiller and Koller 1981).
- SOURCED late type: bud-end hollow heart forms late in bulking. In Lemhi, heavy irrigation after
  a late-season water stress raised hollow heart sharply, and "the heavy water application
  following the stress actually was more important" (Hiller and Koller 1982).
- SOURCED: brown center and hollow heart "will NOT occur after vine kill" (Wang 2025).
- Rule (INVENTED constants): for each hill, count the longest run of days from tuber initiation
  (TI) to TI + 28 with tuber-zone soil under 55 °F. If the run is 5 days or longer, the hill is
  "triggered". Per-tuber probability of hollow heart = `0.05` if triggered, else `0.005`; ×2 if
  soil water was above 80 % of field capacity on most days of the window (anchor: "nearly
  twice"); ×3.5 for tubers in the top quarter of the hill's sizes (anchor: 64 % vs 18 %). Late
  type: a rewetting event (see growth cracks) in bulking adds 0.03 for tubers over 10 oz. Check:
  a triggered, wet hill gives 35 % of its large tubers, matching the >20 % seen in cool early
  plantings, while an untriggered hill gives about 1.75 % of large tubers, close to Maine's
  1.4 %. Hollow heart is internal and invisible until cut: it counts against the internal
  tolerance.

#### Growth cracks and second growth (knobs)

- SOURCED: "Both of these physiological problems are related to fluctuations in soil moisture
  and rapid, uneven uptake of water. Dry periods or periods of high temperature followed by rain
  can also cause growth malformations" (OSU EM 8948). Growth cracks come when poor growing
  conditions switch rapidly to good ones; "Soil temperature as low as 75 F (24 C) can stimulate
  this disorder, while soil temperature held at 82 F (28 C) for a month or 90 F (32 C) for one
  week has resulted in consistent and significant second growth" (NDSU A1987). Russet Burbank is
  prone to "second growth, jelly end and hollow heart" (UI 1978). AH-66 groups hollow heart,
  sugar ends and internal necrosis as "production problems related to irregular growth,
  inadequate water availability, or widely fluctuating temperatures".
- SOURCED share: 14.2 % external defects (mostly misshapes) for Russet Burbank against 2.1 % for
  Caribou Russet in the dry 2017 season at Presque Isle, unirrigated (July 1.84 in rain, August
  1.74 in).
- Rule (INVENTED constants): a **rewetting event** is available soil water rising from below
  50 % to above 90 % within 3 days during bulking. Each tuber then has crack probability
  `0.04 * v`, with v = 2 for Russet Burbank and 0.3 for Caribou Russet (anchor: the 14 % vs 2 %
  ratio), applied to tubers past 2 oz. Second growth: count days with tuber-zone soil at or above
  75 °F; when the stress ends (soil back under 75 °F with water above 60 %), each tuber
  becomes misshapen with probability `0.01 * hot days` (cap 0.3) × v. In Caribou weather
  second growth should be rare; the 82 °F-for-a-month anchor is a check on that. Irrigation is
  how the player prevents rewetting shocks; heavy irrigation after drought causes them.

#### Common scab

- SOURCED: Streptomyces "infects young developing tubers through the lenticels"; "controlled or
  greatly suppressed at soil pH levels of 5.2 or lower"; keep soil moisture "above -0.4 bars (near
  field capacity)" for "the 2 to 6 weeks following tuber initiation" (Cornell, McGrath 2021).
  Superior is "the standard for resistance in the Northeast"; Russet Burbank is moderately
  resistant (Cornell). Manure and red clover raise scab (Cornell).
- SOURCED, AHDB Seasonal Water Management (2018): "The critical period for control is between
  one and three weeks after TI"; keep the correct soil moisture deficit (SMD) "for three to four
  weeks after TI"; "Ceasing irrigation two weeks after TI allows pathogens to multiply rapidly";
  TI is "stolon ends swelling to twice the width of the stolon". Maximum SMD (mm, top 25 cm of
  the ridge) for scab control:

  | Soil | Group 1 v. susceptible | 2 susceptible | 3 intermediate | 4 resistant |
  |---|---|---|---|---|
  | Sandy silt loam | 14.4 | 19.0 | 23.0 | 27.7 |
  | Silt loam | 16.3 | 21.5 | 26.2 | 31.4 |
  | Sandy loam | 13.4 | 17.8 | 21.5 | 25.8 |

  Aroostook's Caribou loam is closest to the first two rows. The Aroostook Research Farm field
  in 2017 had pH 5.8 (Porter and Ocaya 2018), above the 5.2 suppression level.
- Rule (INVENTED constants): from TI to TI + 28 days, each day whose root-zone SMD exceeds the
  table value for the variety's group is a scab day; days 7 to 21 count double (AHDB critical
  window). pH factor 0.1 at pH ≤ 5.2, 0.5 at 5.2-5.5, 1.0 above 5.5. A tuber's scab cover (% of
  surface) = `1.5 * weighted scab days * pH factor * variety factor` (variety factor 0.3 for
  Superior, 0.6 for Russet Burbank, 1.0 for susceptible). It fails No. 1 above 5 % surface
  (surface scab) and No. 2 above 25 %. No source gave a typical downgraded share for scab, so
  the 1.5 must be tuned against play; see section 4.

#### Bruising at harvest (shatter and blackspot)

- SOURCED: "Low temperatures (below 50°F) during harvest and handling cause tubers to shatter
  bruise easily"; "when potatoes are to be handled, the pulp temperature should not be lower
  than 45°F"; blackspot appears "from 24 to 48 hours after impact" and cannot be seen until
  peeled; any variety is more susceptible to blackspot "when soil moisture at harvest is low and
  tubers are dehydrated"; "Hydrated or turgid potatoes (those harvested from a wet soil) are
  susceptible to shatter bruise" (MSU E-2074, 1987).
- SOURCED: "The percentage of bruised potatoes increases dramatically when tuber pulp
  temperatures fall below 45F"; tuber temperature "(or 4-inch soil temperature) should be above
  45º and below 65º during all digging and transfer operations"; bruising is highest in early
  morning and lowest mid-afternoon; "up to 50 percent of tubers delivered in some lots show
  evidence of bruise damage"; a tuber that grades No. 1 "may lose 5 to 6 percent of its weight on
  the trim line after peeling"; about 30 % of bruising happens in trucking and piling (UI
  Bulletin 725, 1991).
- SOURCED: "at 65-70°F, crisp potatoes have a relatively low amount of total damage; at
  45-50°F, total damage is high" (Hiller and Pelter 1975). Ideal pulp is 50-55 °F, acceptable
  45-65 °F (Olsen, Thornton and Nolte, Idaho Potato Commission). "Adequate soil moisture for
  cushioning is critical for bruise reduction"; soil lumps cause bruises (Johnson, UMaine).
- Pulp temperature proxy (SOURCED): use soil temperature at 4 in (UI Bulletin 725). How to get
  that from air temperature belongs to the soil slice; if none is supplied, use the 3-day mean of
  daily mean air temperature, plus 2 °F when digging in the afternoon (INVENTED).
- Rule (INVENTED constants): share of tubers with a damage-level bruise =
  `0.04 * m_T * m_soil * m_variety`, capped at 0.5 (anchor: "up to 50 percent"). m_T = 1.0 for
  pulp 50-65 °F; 1 + 0.1 × (50 − T) for 45-50 °F; 1.5 + 0.3 × (45 − T) below 45 °F (3.0 at 40 °F;
  anchor: "increases dramatically" below 45 °F). m_soil = 1.5 if the soil is dry and cloddy
  (blackspot), 1.3 if wet (shatter), else 1.0. m_variety 0.5 for bruise-resistant varieties
  (Caribou Russet is "resistant to shatter and blackspot bruise", Porter and Ocaya 2018). Every
  bruised tuber is also a wound for storage rot (1.6).

#### Frost in the ground

- SOURCED: "Potatoes freeze at approximately -1 °C (30 °F)"; freezing "whether in the field or in
  storage, typically results in a distinct demarcation between affected and unaffected tissue",
  with water-soaked tissue that breaks down on thawing (AH-66). Freezing point 30.9 °F (UMaine
  Bulletin 4135). "Snow during harvest or hard freezes that may go down a couple inches into the
  soil will invariably lead to low-temperature injury", and frozen soil clods damage tubers at
  digging (Johnson, UMaine storage presentation). Freezing is serious damage in any degree, and
  the No. 1 lot tolerance for frozen plus soft rot is 1 % (USDA).
- SOURCED dates for Caribou: average first freeze (32 °F) September 20 for 1981-2010; earliest on
  record September 3, 1976; latest first freeze September 30, 2001 (NWS Caribou). September 23
  by NOAA NOWData as cited on Wikipedia. Maine fall potato harvest: begins September 6, most
  active September 20 to October 10, ends October 17; planting May 9 to June 9 (USDA NASS 2010;
  begin and end mean 5 % and 95 % complete). So the first air frost usually arrives just as
  digging gets busy, but tuber injury needs a harder freeze that reaches into the hill; the risk
  grows through October for crops still in the ground.
- Rule (INVENTED thresholds, sourced freezing point): a tuber freezes if its zone falls to 30 °F.
  Tubers with less than 2 in of soil cover (the same shallow tubers that green) freeze when the
  air minimum is 28 °F or lower (UNCONFIRMED: 28 °F for several hours is the widely quoted value;
  see section 4). Covered tubers freeze only when the soil at tuber depth reaches 30 °F; if the
  soil slice cannot supply that, use "two consecutive days with air maximum at or below 32 °F, or
  an air minimum at or below 20 °F". Bottom fields collect frost (DESIGN.md), so subtract 2 °F
  from air minima there (INVENTED). Frozen tubers go into the cellar as soft-rot sources (1.6).

#### Harvest-time rot risk (wet rots)

- SOURCED: leak (Pythium) symptoms appear when pulp reaches 65 °F, can show "in as few as 36
  hours", stop below 50 °F and multiply above 77 °F; avoid digging at pulp 65 °F or higher
  (UMaine 2446). "If harvesting occurs at air temperatures over 75 to 80 Fahrenheit, expect to get
  Pythium" (Johnson). Pulp above 65-70 °F "dramatically" increases leak risk; pink rot risk rises
  with wounding above 60 °F pulp and "tremendously" at 70 °F (Olsen et al., IPC).
- SOURCED: tubers dug above 80 °F "can be predisposed to soft rot"; wet, muddy harvests raise soft
  rot in storage (UMaine 2493). Lenticels swell when tubers sit in very moist soil or standing
  water "for several days" and then admit soft rot bacteria (UNL G2203). Harvest "only during dry
  weather" (Olsen and Miller).
- Rule (INVENTED constants): latent soft-rot fraction at digging = 0.002, plus 0.01 if the soil was
  saturated on 3 or more of the previous 5 days (swollen lenticels), plus 0.01 if dug wet, plus
  0.01 × (pulp − 65 °F) per °F above 65 °F. Leak fraction = 0.003 × (pulp − 65 °F) per °F above
  65 °F where soil inoculum exists. Pink rot comes from the disease slice; if it supplies none,
  0.002 per °F of pulp above 60 °F on wounded tubers. These feed the cellar rules in 1.6.

### 1.4 Vine kill and skin set

- SOURCED intervals, which disagree: harvest "at least two weeks (preferably three weeks) after
  the vines die down" (UMaine 2417); wait "a minimum of seven days after the vines are totally
  dead" (UMaine 2493); skins set "for at least 10-14 days before harvesting" (UMass); "kill or
  remove plants up to 3 weeks before harvest" (UI Bulletin 725); vines "dead for 10 to 21 days"
  depending on vine greenness and variety (Delaware, Johnson 2008); a top killer "at least 10 to
  14 days before harvest helps reduce skinning" (MSU E-2074); vine kill "a week to ten days" before
  harvest (WSU EB 0717). In late-blight fields, do not dig "until 14 days after frost or
  herbicides kill vines completely" (PNW Handbook). The Maine trials used 13-19 days.
- SOURCED modifiers: early red-skinned varieties are "notorious for having poor skin set", and a
  wet spell after vine kill can reactivate the phellogen so skins slip again (Delaware 2008).
  "Soil drying and vine death enhance skin set" (AH-66). Green vines at digging carry late blight
  spores onto tubers (Alaska late blight plan; PNW).
- Rule (DERIVED from the sourced ranges, constants INVENTED): skin set `s` runs from 0 at vine
  death (vine kill, frost-kill or blight-kill) to 1 after `D_set` days. **D_set = 14** for russets
  and late whites, 21 for early reds and early whites. A day with saturated soil adds no
  progress. Digging with `s < 1`: the share of tubers skinned is `0.6 × (1 − s)` (INVENTED).
  Each skinned tuber (a) doubles its first-month shrink, (b) counts as a wound for dry rot and
  soft rot, and (c) feeds the USDA skinning descriptor. Digging with green vines in a
  late-blighted field moves 2 % of tubers to latent late blight (INVENTED; the disease slice may
  own this).
- Consequences of unset skin (SOURCED): shrink "may be two times higher than estimated ... if the
  potatoes are immature or have a high degree of harvest damage" (UI BUL 1081); "The damaged
  surface area of a potato can lose up to 500% more water compared to an undamaged area" (IPC);
  soft rot and leak enter through abrasions "especially if the tuber is immature and has not set
  its skin" (UNL G2203); Fusarium enters only through wounds (MSU E-2992); skin set problems
  cause "reduced tuber quality and potential load rejections" (Delaware 2008).
- Brown center and hollow heart stop at vine kill (Wang 2025), and vine kill stops growth, so
  vine-kill timing trades yield against skin set, frost risk and defects.

### 1.5 Digging-day rule summary

| Pulp temperature (≈ 4 in soil) | Effect | Source |
|---|---|---|
| ≤ 30 °F tuber tissue | frozen, serious damage | AH-66, USDA |
| < 45 °F | bruise "increases dramatically" | UI Bul. 725, MSU E-2074 |
| 45-50 °F | shatter bruise elevated; dry-rot-prone varieties should wait for > 50 °F | MSU E-2074, IPC |
| 50-55 °F | ideal | IPC (Olsen, Thornton, Nolte) |
| 55-65 °F | acceptable; pink rot risk rises above 60 °F on wounded tubers | IPC, UMaine 2417 |
| ≥ 65 °F | leak symptoms, avoid digging | UMaine 2446 |
| > 80 °F | predisposed to soft rot | UMaine 2493 |

Also dig dry soil, not saturated soil (Olsen and Miller; UMaine 2493). The Nebraska bulletin's
advice to dig below 50 °F pulp (UNL G2203) conflicts with the bruise guidance; use the 45-65 °F
window, which UMaine, Idaho and the Olsen and Miller checklist all give.

### 1.6 The cellar (monthly rules)

DESIGN.md runs the cellar one month per tick from November. Digging ends in September or October,
so **curing happens in the daily season phase** and the first cellar tick is month 1 of holding.

#### Curing (daily, first 14 days after digging)

- SOURCED: "Optimal curing conditions are 50 to 55 degrees Fahrenheit with high humidity—95-100%
  is optimal, for two weeks", with fresh air throughout (Johnson, UMaine). UC IPM: 50-55 °F, RH
  above 95 %, "a minimum of two weeks". UMass: 50-60 °F, 95 % RH, 10-14 days. AH-66: optimum
  near 20 °C but "Curing at 15 °C (59 °F) is commonly recommended to minimize decay", and curing is
  "markedly slower" below 12 °C (54 °F) and when RH is under 80 %. WSU: 50 °F for at least a month
  for processing stock. Lots with heavy soft rot are cured at 50 °F or lower with no added
  humidity (Johnson).
- Rule: cured = 14 days with pile at 50-55 °F and RH ≥ 95 % (SOURCED). If the pile is below 45 °F
  or RH below 90 % the wounds heal slowly: wound infection probability for dry rot rises from
  0.05 to 0.25 (INVENTED; anchors: Johnson on dry years and Fusarium, IPC on harvesting below
  50 °F).
- Cooling after curing (SOURCED, Johnson, UMaine): 3-4 °F per week for seed, 1-2 °F per week for
  processing, 2-3 °F per week for tablestock. UC IPM says 0.5 °F per day or less. (AH-66 says
  1-2 °C per day, which is much faster than both; ignore it.)

#### Holding temperature by end use (SOURCED, choose UC IPM)

| End use | UC IPM 2019 | UMass 2013 | Other |
|---|---|---|---|
| Seed | 37-40 °F | 38-40 °F | AH-66: 4-5 °C (40 °F) |
| Tablestock | 38-45 °F | 38-40 °F | UMaine 4135: late crop 38-40 °F, 90-95 % RH, 5-10 months |
| French fry | 45-50 °F | 50-55 °F | Idaho (Summit Russet): processing 45 °F, 48 °F after a stressful season |
| Chip | 50-55 °F | 45-50 °F | AH-66: 15-20 °C for older chip varieties |

UMass swaps fry and chip relative to UC IPM, Idaho and AH-66; use UC IPM. RH 95 % throughout
(UC IPM, Idaho), "95 to 99% RH is required at all times to minimize shrink and pressure bruising"
(AH-66); RH should be "greater than 90 percent throughout the storage period" to avoid pressure
bruise (MSU E-2074).

Chilling and cold limits (SOURCED, AH-66): mahogany browning at 1-2 °C (34-36 °F); "3 to 4 °C (37
to 39 °F) typically result in increased reducing sugar levels that are not reversible with
reconditioning"; respiration is lowest at 2-3 °C. UMaine 4135: lowest safe temperature 38 °F,
injury below that is sweetening.

#### Shrink (monthly weight loss)

- SOURCED formula, ASAE EP475.3 as given in UI BUL 1081 (2024): weekly loss
  `L (% of original weight per week) = (A + 0.1 × S) × D`, where A = 0.7 for the first two weeks
  of storage and 0.2 after; S = sprouts as % of weight; `D = PS × (1.00 − RH)`, PS being the
  saturation vapour pressure of water at the pile temperature in mmHg. BUL 1081's own example:
  two weeks at 59 °F and 95 % RH gives 0.45 % per week. Loss "may be two times higher than
  estimated by using this formula if the potatoes are immature or have a high degree of harvest
  damage". VPD at 90 % RH is twice that at 95 %.
- PS lookup (SOURCED, BUL 1081 Table 1, kPa; × 7.50062 for mmHg): 41.0 °F 0.872; 42.8 °F 0.935;
  44.6 °F 1.001; 46.4 °F 1.072; 48.2 °F 1.147; 50.0 °F 1.227; 51.8 °F 1.312; 53.6 °F 1.402;
  55.4 °F 1.497; 57.2 °F 1.598; 59.0 °F 1.704; 60.8 °F 1.817. Interpolate linearly.
- Monthly values from the formula (DERIVED, A = 0.2, 4.35 weeks):

  | Pile | RH 90 % | RH 95 % | RH 98 % |
  |---|---|---|---|
  | 38 °F | 0.51 % | 0.25 % | 0.10 % |
  | 42 °F | 0.59 % | 0.30 % | 0.12 % |
  | 45 °F | 0.66 % | 0.33 % | 0.13 % |
  | 48 °F | 0.74 % | 0.37 % | 0.15 % |
  | 50 °F | 0.80 % | 0.40 % | 0.16 % |
  | 55 °F | 0.96 % | 0.48 % | 0.19 % |

- SOURCED measurement: Russet Burbank at Kimberly, Idaho lost on average 6.1 % in eight months at
  42, 45 or 48 °F and 95 % RH over 15 years (Wang, Brandt and Olsen 2016; from the search
  abstract, paper not opened). The formula gives 3.3 % for that schedule (14 days at 55 °F,
  cooling 0.5 °F per day to 45 °F, holding to eight months), so **multiply the formula by 1.84**
  (DERIVED calibration) to match the measurement. With the factor: curing fortnight about 1.4 %,
  then about 0.6 % per month at 45 °F and 95 % RH, 1.2 % at 90 % RH.
- Rule: `monthly shrink = 1.84 × (A + 0.1 S) × D × 4.35`, doubled for the first month if more
  than 20 % of tubers are skinned or bruised (SOURCED factor 2, INVENTED 20 % cut-off). The
  cellar's RH is 95 % with a humidifier, else 90 % (INVENTED default).

#### Dormancy and sprouting

- SOURCED: "Sprouting accelerates at temperatures >4 °C (40 °F)" (AH-66). End of dormancy is "the
  number of days after harvest when 80 percent of the tubers in a sample have one or more eyes
  producing sprouts 0.1 to 0.2 inches in length" (UI CIS 1123).
- SOURCED dormancy, days after harvest (Kleinkopf and Olsen 2003, reproduced in UI CIS 1120):

  | Variety | 42 °F | 45 °F | 48 °F |
  |---|---|---|---|
  | Russet Burbank | 150 | 135 | 120 |
  | Ranger Russet | 75 | 60 | 50 |
  | Gem Russet | 135 | 115 | 90 |
  | Summit Russet | 150 | 125 | 100 |
  | Umatilla Russet | 140 | 120 | 80 |
  | Bannock Russet | 135 | 110 | 80 |

  CIS 1123 (three later seasons) gives Russet Burbank 175, 155 and 135 days, and Summit 200, 145
  and 110. Other varieties: Atlantic "Dormancy 8–10 weeks" (Potatoes USA guide 2022, temperature
  not stated); Russet Burbank "will store at 45°F for 5 months without sprout inhibition" (UI
  1978). Katahdin "medium" and Kennebec "long" dormancy came only from trade or agency summaries
  in search results (section 4).
- Rule (DERIVED fit to the table): `dormancy(T) = D45 × (1 − 0.04 × (T − 45 °F))`, with D45 =
  135 for Russet Burbank, 60 for Ranger. This fits Russet Burbank within 2 days and Ranger, Gem
  and Summit within 12 days; Umatilla and Bannock fall off faster at 48 °F (errors up to 26
  days), so give those varieties their own table row if they are used. Use D45 = 63 for Atlantic (DERIVED: middle of 8-10 weeks, temperature assumed
  45 °F) and pick the rest from section 4 when the variety list is fixed.
- After dormancy ends (INVENTED): sprout length grows 0.25 mm per day at 45 °F, scaled by the
  factor f(T) below (sprout length starts at 4 mm at dormancy end, the CIS 1123 definition). A
  lot crosses the USDA No. 1 limit (sprouts over 1/4 in, 6.4 mm, on more than 5 % of tubers) about
  10 days after dormancy ends at 45 °F. Sprout weight `S` (% of tuber weight) = 0.02 × sprout
  length in mm (INVENTED) feeds the shrink formula. A sprout inhibitor, if the game offers one,
  holds sprouts at zero for the season: one application of CIPC "arrested sprout development for
  10 months" (UI CIS 1123). Never on seed.

#### Cold-induced sweetening (processing lots only)

- SOURCED: sugar accumulation is higher at lower temperatures, and "potatoes are most susceptible
  to sugar accumulation during the first month or two in storage" (WSU EB 0717). Processing
  holding temperatures as above; "A concentration of 0.1 percent glucose in the tuber tissue, by
  fresh weight, often is considered the upper limit for acceptable French fries"; Summit Russet
  at 42 °F reached unacceptable USDA fry color 3 "at approximately 70 days after harvest" (UI CIS
  1123). Reconditioning: storage at 60-70 °F (WSU), or "above 50°F for three weeks" (UC IPM); it
  works better in spring (WSU), and not at all after 37-39 °F storage (AH-66).
- Rule (INVENTED rate, sourced anchors): sugar index rises each month by `0.25 × (T_cis − T)`
  per °F below the variety's threshold T_cis (45 °F for Russet Burbank and fry types, 50 °F for
  chip types), doubled in the first two months; the lot fails processing at index 3.0. Check: 3 °F
  below threshold gives 0.25 × 3 × (2 + 2 + 0.3) ≈ 3.2 by day 70, so the lot fails at about 65-70
  days, matching the CIS 1123 anchor. Each month above 55 °F lowers the index by 1.5; storage below
  39 °F makes half the accumulated index permanent.

#### Rot in the pile

What the sources say (SOURCED):

- "A potato storage is not a hospital": rot management happens in the field and at digging
  (Johnson).
- Late blight: "our modern storages can handle a 5% late blight, but only about 1% pink rot"
  (Johnson, UMaine). "A 5% infection level is considered a 'do not store' guideline"; "Temperature
  near 38 degrees will retard decay whereas 48 degrees F and above will likely result in extensive
  decay" (Alaska late blight plan, adapted from Idaho's). Spores spread in storage "if temperatures
  are above 40°F" and infect new tubers "if there is free moisture on tubers for 12 hours or more";
  soft rot bacteria then rot infected tubers and "spread to other tubers below in the pile"; tuber
  symptoms usually show in the first month (PNW Handbook 2026). Late blight "can spread from tuber
  to tuber" and lots should be graded before storage (UMaine 2417).
- Pink rot: "Infection of 5 percent of tubers in storage is considered unmanageable"; it "may
  spread from tuber to tuber in storage if tubers are wet"; infected tubers "often rot within two
  weeks" once soft rot invades (UNL G2203). It "can spread rapidly, especially with warm potatoes"
  (Johnson).
- Leak: "doesn't transfer from tuber to tuber well in storage" (UMaine 2446); infected tubers are
  attacked by soft rot and spread with it (UNL G2203).
- Soft rot: decay between 45 and 90 °F, rising sharply above 70 °F, slowed below 50 °F; "a film of
  water will induce anaerobic conditions" (UMaine 2493). "With a high percentage after curing,
  it's time to move the potatoes any way possible. Generally, they don't last 60 days" (Johnson).
  Condensation from warm air on cold tubers "encourages disease" (UC IPM).
- Fusarium dry rot: enters only through wounds; develops fastest at high humidity and 60-70 °F,
  slowly at storage temperatures, "noticeably faster during the latter half of the storage
  season"; "more than 60 percent of tubers can be infected in storage" (MSU E-2992). Bruised and
  inoculated tubers held at 45 °F decayed 15.6 % (Russet Burbank) and 6.1 % (Summit Russet) over
  two seasons (UI CIS 1123).

Monthly rule (INVENTED constants, tuned to the anchors above):

1. **Load-in state** for each lot (from the field and digging): latent late blight `pLB`, pink
   rot `pPR`, leak `pLK`, soft rot `pSR` (wet digging, swollen lenticels, frozen tubers), and
   wounded share `w` (bruised + skinned).
2. **Curing period** (the 14 days after digging, daily phase): lose `pLK + pPR + pSR + 0.75 pLB`
   of the lot. Set the wet-rot load `W = pLK + pPR + pSR + 0.25 pLB` (a quarter of blighted tubers
   go on to soft rot).
3. **Each cellar month**: secondary soft rot takes
   `new = H × min(0.6, k × W × f(T) × wet)` of the healthy share H, where k = 0.5 if W ≤ 0.015 and
   k = 6 if W > 0.015 (the pile's ventilation copes with up to 1.5 % wet rot, then is
   overwhelmed), wet = 2 if the cellar had condensation or the lot went in wet, else 1. In month 1
   the remaining `0.25 pLB` also expresses. Then set `W = new + 0.25 × (late blight expressed this
   month)`.
4. **Dry rot**: lose `w × p_wound × 0.015 × f(T)` per month, doubled after month 4 (latter half of
   storage), times a variety factor (1.0 Russet Burbank, 0.4 Summit-like). `p_wound` = 0.05 if
   cured properly, 0.25 if not, 1.0 for the inoculated anchor. Check: 1.0 × 1.0 × 0.015 × (4 + 2 ×
   3) ≈ 15 % for Russet Burbank at 45 °F over seven months, against the measured 15.6 %.
5. Temperature factor `f(T)`, a lookup table (INVENTED, doubling every 5 °F around 45 °F; anchors:
   38 °F retards, 48 °F and above extensive, soft rot slowed below 50 °F and sharply faster above
   70 °F):

   | °F | ≤ 38 | 40 | 42 | 45 | 48 | 50 | 55 | ≥ 60 |
   |---|---|---|---|---|---|---|---|---|
   | f | 0.38 | 0.5 | 0.66 | 1.0 | 1.5 | 2.0 | 4.0 | 8.0 |

   Interpolate linearly between columns.

What this produces (DERIVED by running the rule; cumulative % of the lot lost to rot, 45 °F
unless stated; dry rot and shrink not included):

| Load-in | After curing | Cellar month 1 | 2 | 3 | 7 | Matches |
|---|---|---|---|---|---|---|
| 1 % pink rot | 1.0 | 1.5 | 1.7 | 1.9 | 2.0 | "handle ... about 1% pink rot" |
| 5 % pink rot | 5.0 | 33.5 | 73 | 89 | 98 | "5 percent ... unmanageable"; "don't last 60 days" |
| 5 % late blight | 3.8 | 5.6 | 6.0 | 6.2 | 6.4 | "can handle a 5% late blight" |
| 5 % late blight at 38 °F | 3.8 | 5.2 | 5.3 | 5.3 | 5.3 | "near 38 degrees will retard decay" |
| 5 % late blight at 50 °F | 3.8 | 6.2 | 23 | 69 | 99 | "48 degrees F and above ... extensive decay" |
| 8 % late blight | 6.0 | 19 | 68 | 87 | 98 | above the 5 % "do not store" line |
| 3 % soft rot after curing | 3.0 | 20 | 68 | 87 | 98 | "don't last 60 days" |
| 1 % pink rot, wet cellar | 1.0 | 2.0 | 3.0 | 3.9 | 7.2 | spread "if tubers are wet" |
| 0.5 % leak | 0.5 | 0.7 | 0.9 | 0.9 | 1.0 | leak does not spread by itself |

The player's levers are all real: dig dry and at 45-65 °F pulp, wait for skin set, grade out rot
going in, cure properly, keep the pile cold and dry when blight came in, sell a breaking lot early.

#### Selling out of the cellar

Regrade at sale with the USDA rules (1.2). Rotted tubers are removed (they are weight lost);
sprouts, pressure bruises and dry-rot lesions count against tolerances. Johnson suggests warming
pink-rot lots "for at least a day to a day and a half, maybe two days before shipping or bagging"
so breakdown shows before bagging.

#### Heat load, for flavour text or a ventilation verb

Heat load at harvest is "30+ BTU/cwt/day" (IPC). Respiration of mature cured tubers is 6-18 mg
CO2/kg/h at 5 °C, 13-19 at 10 °C and 14-29 at 20 °C; immature tubers 24 at 5 °C and up to 81 at
20 °C; heat in BTU per ton per day = mg CO2/kg/h × 220 (AH-66).

### 1.7 Calendar for the county (SOURCED)

- Planting May 9 to June 9, most active May 14 to June 3; digging September 6 to October 17, most
  active September 20 to October 10 (NASS 2010, Maine fall potatoes, 55,500 acres in 2009).
- First 32 °F freeze at Caribou: average September 20 (1981-2010), range September 3 to
  September 30 (NWS); average freeze-free season 130 days, last spring freeze May 15 (Wikipedia
  citing NOWData).
- Research-farm practice: plant May 23 to June 1, kill vines at 113-115 days after planting
  (September 15-22), dig 13-19 days later (October 4-6) (Porter and Ocaya 2018).
- Storage season: late crop 5-10 months at 38-40 °F (UMaine 4135); quality tubers store 2 to 12
  months (AH-66).

---

## 2. Parameter table

| Name | Value | Unit | Label | Source |
|---|---|---|---|---|
| U.S. No. 1 minimum diameter | 1-7/8 (47.6) | in (mm) | SOURCED | USDA §51.1541 |
| U.S. No. 2 minimum diameter | 1-1/2 (38.1) | in (mm) | SOURCED | USDA §51.1543 |
| Long-type No. 1 weight minimum | 4 (118) | oz (g) | SOURCED | AH-66, Voss |
| Size A | ≥ 1-7/8 in, 40 % of lot ≥ 2-1/2 in or 6 oz | | SOURCED | USDA Table I |
| Size B | 1-1/2 to 2-1/4 | in | SOURCED | USDA Table I |
| Creamer | 3/4 to 1-5/8 | in | SOURCED | USDA Table I |
| Chef | 2-3/4 to 4-1/2 in, 8 to 28 oz | | SOURCED | USDA Table I |
| No. 1 total defect tolerance, shipping point | 8 (5 ext, 5 int, 1 frozen/soft rot) | % | SOURCED | USDA §51.1546 |
| No. 2 total defect tolerance, shipping point | 10 (6, 6, 1) | % | SOURCED | USDA §51.1546 |
| Undersize tolerance | 3 (5 if min ≥ 2-1/4 in) | % of lot | SOURCED | USDA §51.1546(b) |
| Damage / serious damage removal loss | 5 / 10 | % of tuber weight | SOURCED | USDA §51.1560-61 |
| Greening damage / serious | 25 / 50 | % of surface | SOURCED | USDA Table III |
| Surface scab damage / serious | 5 / 25 | % of surface | SOURCED | USDA Table III |
| Hollow heart damage / serious | 1/2 / 3/4 | in circle in a 2-1/2 in tuber | SOURCED | USDA Table VII |
| Sprout damage at shipping point | > 1/4 in on > 5 % of lot | | SOURCED | USDA Table III |
| Size COV, yield-weighted | 0.12-0.20 | ratio | SOURCED | Smart 2017 (Travis 1987) |
| Weibull shape by number, UK fields | 3.4-5.15 | | SOURCED | Mhango et al. 2021 |
| Weibull shape used: round / long | 6 / 8 | | INVENTED within range; long fitted to Maine | Porter and Ocaya 2018 |
| c_round, c_long (w = c d³) | 0.00066 / 0.0011 | g mm⁻³ | DERIVED | USDA Table I; AH-66 |
| Green share of yield: no hill / hilled / high hill | 10 / 2-3.7 / 2 | % | DERIVED | Carling and Walworth 1990 |
| Brown center cool trigger | < 55 °F (12.8 °C) soil for 5-7 days, TI to TI+4 wk | | SOURCED | Wang 2025; Hiller and Koller 1982 |
| BC wet-area multiplier | ~2 | × | SOURCED | Hiller and Koller 1981 |
| BC in fast vs slow tubers | 64 vs 18 | % | SOURCED | Hiller and Koller 1981 |
| BC/HH soil moisture trigger | > 80-85 | % of field capacity / available | SOURCED | Wang 2025; UF HS945 |
| Second growth soil temperature | ≥ 75 stimulates; 82 for 30 d or 90 for 7 d consistent | °F | SOURCED | NDSU A1987 |
| Scab suppression pH | ≤ 5.2 | pH | SOURCED | Cornell 2021 |
| Scab protection window | TI to TI+3-4 wk (critical 1-3 wk) | | SOURCED | AHDB 2018 |
| Scab max SMD, silt loam, groups 1-4 | 16.3 / 21.5 / 26.2 / 31.4 | mm | SOURCED | AHDB 2018 Fig. 1 |
| Bruise-safe pulp window | 45-65 (ideal 50-55) | °F | SOURCED | UI Bul. 725; IPC |
| Bruised tubers in bad lots | up to 50 | % of tubers | SOURCED | UI Bul. 725 |
| Trim loss on a bruised No. 1 | 5-6 | % of weight | SOURCED | UI Bul. 725 |
| Leak pulp threshold | 65 (stops < 50, fast > 77) | °F | SOURCED | UMaine 2446 |
| Soft rot predisposition | dug > 80 °F; decay 45-90 °F | °F | SOURCED | UMaine 2493 |
| Tuber freezing point | 30 (-1 °C); 30.9 listed | °F | SOURCED | AH-66; UMaine 4135 |
| Vine death to dig | 14 (range 7-21) | days | SOURCED range, DERIVED choice | UMaine 2417, 2493; UMass; Delaware |
| Late-blight field: vine death to dig | ≥ 14 | days | SOURCED | PNW Handbook |
| Curing | 50-55 °F, ≥ 95 % RH, 14 days | | SOURCED | Johnson UMaine; UC IPM |
| Cool-down rate seed / table / processing | 3-4 / 2-3 / 1-2 | °F per week | SOURCED | Johnson UMaine |
| Holding: seed / table / fry / chip | 37-40 / 38-45 / 45-50 / 50-55 | °F | SOURCED | UC IPM 2019 |
| Holding RH | 95 (95-99) | % | SOURCED | UC IPM; AH-66 |
| Irreversible sweetening below | 37-39 (3-4 °C) | °F | SOURCED | AH-66 |
| Fry glucose limit | 0.1 | % fresh weight | SOURCED | UI CIS 1123 |
| Shrink formula | L = (A + 0.1 S) × PS × (1 − RH); A = 0.7 first 2 wk, 0.2 after | % per week | SOURCED | ASAE EP475.3 via UI BUL 1081 |
| Shrink calibration factor | 1.84 | × | DERIVED | Wang et al. 2016 (6.1 % in 8 months) |
| Shrink multiplier, immature/damaged | up to 2 | × | SOURCED | UI BUL 1081 |
| Dormancy, Russet Burbank at 42/45/48 °F | 150/135/120 (CIS 1123: 175/155/135) | days after harvest | SOURCED | Kleinkopf and Olsen 2003; CIS 1123 |
| Dormancy temperature slope | −4 % of D45 per °F | | DERIVED | fit to Kleinkopf and Olsen table |
| Atlantic dormancy | 8-10 | weeks | SOURCED | Potatoes USA 2022 |
| Late blight storable limit | ~5 | % of tubers | SOURCED | Johnson; Alaska plan |
| Pink rot storable limit | ~1 (5 unmanageable) | % of tubers | SOURCED | Johnson; UNL G2203 |
| Late blight spread conditions in storage | > 40 °F and ≥ 12 h free moisture | | SOURCED | PNW Handbook |
| Wet-rot capacity of a ventilated pile | 1.5 | % of tubers rotting per month | INVENTED | tuned to the two lines above |
| Secondary soft rot k (below / above capacity) | 0.5 / 6 | per month | INVENTED | tuned |
| Rot temperature factor f(T) | 0.38 at 38 °F … 1 at 45 °F … 8 at 60 °F | × | INVENTED | Alaska plan; UMaine 2493 |
| Dry rot rate on wounds at 45 °F | 0.015, doubled after month 4 | per month | INVENTED | calibrated to CIS 1123 15.6 % |

---

## 3. Sources

Opened and read (full text unless noted):

1. USDA AMS, *United States Standards for Grades of Potatoes*, effective June 3, 2011.
   https://www.ams.usda.gov/sites/default/files/media/Potato_Standard%5B1%5D.pdf (WebFetch got
   403; downloaded with curl and read in full). §51.1541-51.1566, Tables I-VII.
2. Voss, R.E., "Potato", in USDA ARS Agriculture Handbook 66, *The Commercial Storage of Fruits,
   Vegetables, and Florist and Nursery Stocks* (2016), pp. 505-509.
   https://www.ars.usda.gov/arsuserfiles/oc/np/commercialstorage/commercialstorage.pdf. Grades,
   curing, holding temperatures, chilling, freezing, respiration table, disorders.
3. Johnson, S.B., *Basics of Potato Storage Management*, UMaine Cooperative Extension (transcript,
   12 pp.). https://extension.umaine.edu/potatoes/wp-content/uploads/sites/49/2020/12/Basics-of-Potato-Storage-Management.pdf.
   Curing, cooling rates, 5 % late blight / 1 % pink rot, soft rot "don't last 60 days", Pythium
   at 75-80 °F air, frost.
4. Ozturk, I.K., UMaine Bulletin #2417, *Protecting Potato Tubers from Late Blight*.
   https://extension.umaine.edu/publications/2417e/ (read through WebFetch's summary).
5. Johnson, S.B., UMaine Bulletin #2446, *Potato Leak* (2018, 2020).
   https://extension.umaine.edu/publications/2446e/ (WebFetch summary).
6. Johnson, S.B., UMaine Bulletin #2493, *Blackleg and Bacterial Soft Rot* (1999, 2015).
   https://extension.umaine.edu/publications/2493e/ (WebFetch summary).
7. Gast, K.L.B., UMaine Bulletin #4135, *Storage Conditions: Fruits and Vegetables*.
   https://extension.umaine.edu/publications/wp-content/uploads/sites/52/2015/04/4135.pdf. Potato
   rows: 38-40 °F, 90-95 % RH, 5-10 months, freezing point 30.9 °F.
8. Porter, G.A. and Ocaya, P.C., *Nitrogen, calcium, boron, and potassium effects on potato
   quality*, report to the Maine Potato Board, January 2018.
   https://www.mainepotatoes.com/wp-content/uploads/2019/04/Nitrogen-calcium-boron-and-potassium-effects-on-potato-quality.pdf.
   Tables 1-2: yields, U.S. No. 1, size, external defects, hollow heart, dates.
9. Porter, G.A. and Ocaya, P.C., *Evaluation of New Potato Varieties (2018 Growing Season)*.
   https://www.mainepotatoes.com/wp-content/uploads/2019/04/Evaluation-of-New-Potato-Varieties-2018-Growing-Season.pdf.
   Variety traits (Caribou Russet bruise resistance, scab, hollow heart notes).
10. Chase, R.W. and Silva, G.H., MSU Extension Bulletin E-2074, *Potato Bruising* (1987).
    https://archive.lib.msu.edu/DMC/extension_publications/e2074/E2074_1987.pdf.
11. National Potato Anti-Bruise Committee, UI Bulletin 725, *Bruise-Free Potatoes: Our Goal*
    (1991). https://objects.lib.uidaho.edu/uiext/uiext1442.pdf (OCR garbled; figures unreadable,
    text quotes used).
12. Olsen, N., Thornton, M. and Nolte, P., *Harvest Temperature Consequences*, Idaho Potato
    Commission. https://idahopotato.com/uploads/media/harvest-temperature-consequences.pdf.
13. Hiller, L.K. and Pelter, G.Q., *Conditioning Potatoes for Harvest*, Proc. 14th Washington
    State Potato Conf. (1975). https://www.nwpotatoresearch.com/images/documents/LKHillerandGQPelter1975.pdf.
14. Hiller, L.K. and Koller, D.C., *Brown Center/Hollow Heart of Potatoes: What Do We Know*, Proc.
    20th WA Potato Conf. (1981). https://www.nwpotatoresearch.com/images/documents/LarryKHillerandDavidCKoller1981.pdf.
15. Hiller, L.K. and Koller, D.C., *Brown Center and Hollow Heart as a Quality Factor*, Proc. 21st
    WA Potato Conf. (1982). https://www.nwpotatoresearch.com/images/documents/LarryKHillerandDCKoller1982.pdf.
16. Zotarelli, L. et al., UF/IFAS HS945, *Potato Physiological Disorders: Brown Center and Hollow
    Heart* (2012). https://ufdcimages.uflib.ufl.edu/IR/00/00/09/74/00001/HS19700.pdf.
17. Wang, Y., *Internal Potato Tuber Defects: Hollow Heart and Heat Necrosis*, UW-Madison
    (September 2025). https://vegpath.plantpath.wisc.edu/resources/articles/internal-potato-tuber-defects-hollow-heart-and-heat-necrosis/
    (WebFetch summary).
18. Selman, L. et al., OSU EM 8948, *What's Wrong with my Potato Tubers?* (2008).
    https://extension.oregonstate.edu/sites/extd8/files/documents/em8948.pdf.
19. Torabian, S. et al., OSU EM 9407, *Glycoalkaloids in Potato Tubers* (2023).
    https://extension.oregonstate.edu/sites/extd8/files/catalog/auto/EM9407.pdf.
20. Carling, D.E. and Walworth, J.L., *The Effect of Hilling on Yield and Quality of Potatoes*,
    Univ. of Alaska AFES Research Progress Report 16 (1990).
    https://www.uaf.edu/afes/publications/database/research-progress-reports/files/pdfs/RPR-16.pdf.
21. *Light-Quality-Dependent Greening and Steroidal Glycoalkaloid Accumulation in Potato Tubers*,
    Foods 14(19):3394 (2025). https://pmc.ncbi.nlm.nih.gov/articles/PMC12523430/ (first 100,000
    characters, WebFetch summary).
22. Robinson, A. and Banks, E., NDSU A1987, *Potato Tuber Second Growth* (2020).
    https://www.ndsu.edu/agriculture/sites/default/files/2024-04/a1987%20(1).pdf.
23. McGrath, M.T. (update of Loria), *Potato Scab*, Cornell Vegetable MD Online (April 2021).
    https://www.vegetables.cornell.edu/pest-management/disease-factsheets/potato-scab/ (WebFetch
    summary).
24. AHDB, *Seasonal Water Management for Potatoes*, 2nd ed. (2018).
    https://projectbluearchive.blob.core.windows.net/media/Default/Potato%20knowledge%20library/Seasonal%20Water%20Management%20for%20Potatoes_2018.pdf.
    Figure 1 SMD table, scab key points. Also the AHDB web page on early-season water management
    (WebFetch summary).
25. Hamm, P.B. and Ocamb, C.M., *Potato: Late Blight*, PNW Plant Disease Management Handbook
    (revised March 2026). https://pnwhandbooks.org/plantdisease/host-disease/potato-solanum-tuberosum-late-blight
    (WebFetch summary).
26. Campbell, W.L., *Late Blight Management Plan for Alaska* (1998, adapted from the Idaho action
    plan). https://plants.alaska.gov/pdf/LateBlight1998.pdf.
27. Olsen, N. and Miller, J., *Checklist for Managing Late Blight Approaching Harvest and Into
    Storage* (2015). https://millerresearch.com/wp-content/uploads/2019/01/Checklist-for-Managing-Late-Blight-Approaching-Harvest-and-Into-Storage-2015.pdf.
28. Pavlista, A.D., UNL G2203, *Wet Rots of Potato in Storage* (2013).
    https://extensionpubs.unl.edu/publication/g2203/2013/pdf/view/g2203-2013.pdf.
29. Wharton, P., Hammerschmidt, R. and Kirk, W., MSU E-2992, *Fusarium Dry Rot* (2007).
    https://archive.lib.msu.edu/DMC/extension_publications/e2992/e2992.pdf.
30. UC IPM, *Potato: Storage*, Pest Management Guidelines, UC ANR Pub. 3463 (updated 08/19).
    https://ipm.ucanr.edu/agriculture/potato/storage/ (WebFetch summary).
31. Hazzard, R. and Cavanagh, C., *Potato Harvest and Storage*, UMass Extension (updated January
    2013). https://www.umass.edu/agriculture-food-environment/vegetable/fact-sheets/potato-harvest-storage
    (WebFetch summary).
32. Teixeira, G.H.A., Xanthopoulos, G.T., Paytosh, S. and Olsen, N., UI BUL 1081, *Understanding
    Weight Loss of Potato Tuber in Storage* (December 2024).
    https://content-hub.uidaho.edu/api/public/content/8e2cc32a9f424178825a14703a9f4495?v=a6a1a037.
    EP475.3 formula, vapour pressure table.
33. Frazier, M.J., Olsen, N. and Kleinkopf, G., UI CIS 1120, *Organic and Alternative Methods for
    Potato Sprout Control in Storage*. https://objects.lib.uidaho.edu/uiext/uiext31381.pdf. Table 1
    dormancy (Kleinkopf and Olsen 2003; OCR partly garbled, rows reconstructed).
34. Brandt, T.L., Kleinkopf, G., Olsen, N. and Love, S.L., UI CIS 1123, *Storage Management for
    Summit Russet Potatoes* (2004). https://www.nwpotatoresearch.com/images/documents/SummitRussetstorageCIS1123.pdf.
35. Iritani, W.M. and Weller, L.D., WSU EB 0717, *Sugar Development in Potatoes*.
    https://rex.libraries.wsu.edu/view/pdfCoverPage?instCode=01ALLIANCE_WSU&filePid=13333020950001842&download=true.
36. Garner, J.G., Pavek, J.J. and Corsini, D.L., UI CIS, *Potato Varieties for Idaho* (1978).
    https://objects.lib.uidaho.edu/uiext/uiext28779.pdf.
37. Potatoes USA, *Guide to U.S. Potato Varieties* (2022).
    https://potatoesusa.com/wp-content/uploads/2022-Guide-to-US-Potato-Varieties-English.pdf.
38. Smart, S.E.H., *Variation in Tuber Size: Multiple Scales, Myriad Causes*, Proc. WA-OR Potato
    Conf. (2017). https://www.nwpotatoresearch.com/images/documents/Smart%202017.pdf.
39. Mhango, J.K. et al., *Comparison of potato tuber size distribution fitting methods ...*,
    J. Agric. Sci. (2021), doi 10.1017/S0021859621000952.
    https://hau.repository.guildhe.ac.uk/id/eprint/17790/1/Jim%20Monaghan%20Comparison%20of%20potato%20UPLOAD.pdf.
40. USDA NASS, *Field Crops Usual Planting and Harvesting Dates* (October 2010), New England page.
    https://esmis.nal.usda.gov/sites/default/release-files/vm40xr56k/dv13zw65p/w9505297d/planting-10-29-2010.pdf
    (the nass.gov copy returned 404).
41. NWS Caribou, *September Climate Outlook* (2017). https://www.weather.gov/car/September2017
    (WebFetch summary).
42. Wikipedia, *Caribou, Maine*, climate section citing NOAA NOWData.
    https://en.wikipedia.org/wiki/Caribou,_Maine.
43. Johnson, G., *Skin Set in Potato*, University of Delaware Weekly Crop Update (July 18, 2008).
    https://sites.udel.edu/weeklycropupdate/?p=334 (WebFetch summary).

Seen only as search-result snippets (not opened; numbers from these are marked in the text):

- Wang, Y., Brandt, T.L. and Olsen, N. (2016), *A Historical Look at Russet Burbank Potato Quality
  Under Different Storage Regimes*, Am. J. Potato Res. 93:474-484 (6.1 % weight loss in eight
  months). Springer redirected to a login.
- *Effect of planting depth and hilling practices on total, U.S. No. 1, and field greening tuber
  yields*, Am. Potato J., doi 10.1007/BF02872222.
- Tanios, S. et al. (2018), *Potato Tuber Greening: a Review*, Am. J. Potato Res. 95:248-257.
- Red Norland skin-set study, Am. J. Potato Res. 89(6) (skin set 0.40 N at 18 days after vine
  kill). ResearchGate returned 403.
- NDSU, *Checklist of Potato Emergence Problems* (soil below 28 °F for several hours kills shallow
  tuber tissue; chilling 31-34 °F). Returned 403 to WebFetch and curl.

Could not open: UF/IFAS HS925 vine killing (403); ScienceDirect weight-loss paper (403);
BMC/Springer Katahdin cold-sweetening paper (captcha, then login); UTAS greening fact sheet (403);
UNL CropWatch growth-crack and scab pages (404); MSU CANR copy of the dry rot bulletin (stub page;
the archive copy was read instead).

---

## 4. Unconfirmed items and gaps

- **Field frost threshold for tubers.** The 28 °F "for several hours" figure is from an NDSU page
  I could not open and from trade press; only the tuber freezing point (30-30.9 °F) and Johnson's
  "a couple inches into the soil" are confirmed. The air-to-soil rule in 1.3 is invented; the soil
  slice should supply tuber-zone temperature if it can.
- **Typical downgraded share for common scab.** No source gave a percentage of crop or tubers
  downgraded. Cornell says scab "does not usually affect total yields"; the harm is market grade.
  The scab cover coefficient (1.5 % per weighted dry day) is invented and must be tuned.
- **Dormancy of the Maine varieties.** Only Russet Burbank, the Idaho russets and Atlantic (8-10
  weeks, no temperature) are sourced. Katahdin "medium" and Kennebec "long" dormancy, and
  Superior's 80-90 day keeping, came from search summaries of PotatoPro, CFIA and a UMaine
  museum page (not opened). UNCONFIRMED: Superior and Norland have short dormancy (from memory).
- **Sprout growth rate after dormancy**, sprout weight per mm and the sweetening rate are invented,
  each with one sourced anchor.
- **Weight loss measurement.** The 6.1 % in eight months (and so the 1.84 calibration) comes from
  search abstracts of Wang et al. 2016, not the paper.
- **Rot spread.** No source gives a spread rate within a pile. The monthly rot rule is invented and
  tuned to four sourced anchors (5 % late blight storable, 1 % pink rot storable, 5 % pink rot
  unmanageable, 38 °F retards / 48 °F extensive decay, high soft rot lasts under 60 days). The
  sources disagree on whether 5 % late blight is storable (Johnson) or the do-not-store line
  (Alaska/Idaho); the rule puts the cliff just above 6 %.
- **Weibull shape for Maine round whites.** The k = 6 choice is the middle of the published COV
  range, not a Maine fit. A Maine round-white trial with grade breakdown (for example from the
  NE-1731 regional reports at potatoes.ncsu.edu) would let it be fitted like the russet.
- **Hollow heart, growth crack, bruise and greening per-tuber probabilities** are invented, each
  with the anchors listed. Real incidence ranges found: hollow heart 0-11 % of large tubers (Maine
  2017), >20 % brown center in cool early plantings (WSU); external defects 2-21 % (Maine 2017);
  green tubers 2-10 % of yield (Alaska); bruise evidence on up to 50 % of tubers (Idaho).
- **Conflicts noted and resolved**: chip vs fry holding temperature (UMass vs UC IPM, Idaho,
  AH-66; used UC IPM); cooling rate (AH-66's 1-2 °C per day vs 0.5 °F per day and 1-4 °F per
  week; used Johnson's Maine numbers); harvest pulp ceiling for wet rots (UNL's 50 °F vs 65 °F
  elsewhere; used 45-65 °F); greening glycoalkaloid baseline in OSU EM 9407 (apparent units slip,
  not used).
- **Greening losses in retail** of "14–17% annual postharvest losses" (Foods 2025 review) are a
  secondary claim with no primary data seen; do not use them for field calibration.
- Not covered by this slice: tuber number and yield per hill (growth slice), soil temperature and
  water (soil slice), late blight epidemiology and tuber infection rates (disease slice), prices.
