# 05. Insects, soil health, rotation and seed quality

Research slice for "The County". Scope: (a) Colorado potato beetle, (b) seed
quality and farm-saved seed, (c) rotation, cover crops and a per-field soil-health
state, (d) early blight in brief. Written 2026-11-11.

How to read the labels used below:

- **SOURCED**: the number is printed in a source I opened; the URL and a quote or
  table reference are in the parameter table and section 3.
- **DERIVED**: plain arithmetic on sourced numbers (the arithmetic is shown).
- **INVENTED**: a constant or functional form I chose because no source gives it;
  the reason and the published range it sits inside are stated. Mark it
  **invented** in `docs/MODEL.md`.
- **UNCONFIRMED**: a number I saw only in a search-result snippet or remember, and
  could not open a source for. Do not ship it as sourced.

All formulas below use only `+ - * /` and comparisons, so they fit the DESIGN.md
rule that the core uses exact arithmetic. Where a published model is logistic, I
give it in odds form (multiply the odds), which needs no `exp` or `log`.

Two findings that bear directly on DESIGN.md before the detail:

1. **Maine requires certified seed for any planting larger than one acre**
   (UMaine Bulletin #2419: "certified seed is required for plantings larger than
   one acre"). DESIGN.md has six fields of five acres each and lets the player
   plant saved seed. Either the game shows this rule (planting saved seed on a
   five-acre field is a legal risk, or saved seed is limited to under one acre),
   or the fields shrink, or the design labels the saved-seed option as a
   deliberate departure from Maine law. I did not find when the rule was enacted,
   so I cannot say whether it applied in 1973 (UNCONFIRMED).
2. **The rest year in DESIGN.md (oats and clover) maps almost exactly onto the
   USDA-ARS "status quo" rotation** in Larkin's Presque Isle trials (barley
   underseeded with red clover, then potato), and "potatoes after potatoes" maps
   onto their continuous-potato control. That gives measured Aroostook numbers
   for both of the game's options, from the same plots, under the same weather.
   Section 1.3 builds the soil state on those numbers.

DESIGN.md currently cuts Colorado potato beetle and early blight. Section 1.1 and
1.4 give what a model would need, and say what the evidence suggests about the
cut, so the decision can be made on the record rather than on my preference.

---

## 1. What the simulation should implement

### 1.1 Colorado potato beetle (CPB)

#### 1.1.1 What makes CPB a different decision from late blight

The evidence points to two things late blight does not have:

- **Rotation distance controls it.** Overwintered beetles walk into a field that
  was in potatoes last year; a rotated field must be found by flight. Rotated
  fields had peak egg-mass density below 10% of non-rotated fields (Lashomb and
  Ng 1984, cited by Alyokhin), and potatoes after a grain crop had early-season
  adult densities reduced by 95.8% (Wright 1984, cited by Alyokhin). In southern
  Maine in 2005, non-rotated fields needed 4.78 insecticide applications against
  2.73 on rotated fields (UMaine #2424). UMaine #2419 says to plant "a tenth to a
  quarter of a mile away" from last year's potatoes.
- **Resistance is a multi-year state.** The beetle has resisted nearly every
  insecticide used on it; resistance persisted four years after a grower stopped
  using neonicotinoids (Alyokhin 2007, cited in the 2008 review). Every spray
  choice changes next year's options.

If the designers keep CPB cut, those two pressures are lost. If they want one
insect, a minimal version is: a farm-level beetle pressure that rises with
continuous potato and falls with rotation (1.1.7), one scout reading against the
UMaine threshold (1.1.5), and one spray verb whose kill fraction falls as its
mode-of-action group is reused (1.1.6). That reuses the existing scout and spray
verbs; the new decision is where to plant and which product to burn.

#### 1.1.2 Degree-day clock

University of Wisconsin model (vegento.russell.wisc.edu; UW-Extension A3678):
base 52 °F, upper threshold 86 °F, biofix = first egg mass found. SOURCED.

```
TmaxF' = min(TmaxF, 86)
DDF    = max(0, (TmaxF' + TminF) / 2 - 52)        // degree-days F, simple average method
DDC    = DDF / 1.8                                  // same thing in Celsius units, base 11.1 C
```

Note: the AgWeather calculator page uses the same base with "no upper cutoff";
the vegento table states an 86 °F upper threshold. At Caribou the cap rarely
binds; use the cap.

Stage durations from first egg mass (DD°F, base 52), SOURCED (vegento table and
A3678 Table 1):

| Stage | DD°F in stage | Accumulated DD°F | Accumulated DD°C | Treatment note (A3678) |
|---|---|---|---|---|
| Egg | 120 | 120 | 67 | not susceptible, do not treat |
| 1st instar | 65 | 185 | 103 | most effective time to apply Bt tenebrionis |
| 2nd instar | 55 | 240 | 133 | most effective time for conventional insecticides |
| 3rd instar | 60 | 300 | 167 | |
| 4th instar | 100 | 400 | 222 | "too late to prevent yield loss" for carbaryl and pyrethroids |
| Pupa (in soil) | 275 | 675 | 375 | not susceptible, do not treat |

Calendar cross-checks: eggs hatch in 4 to 9 days (A3678); larvae take 2 to 3
weeks over four instars (A3678, EPPO); in Maine larvae take "10 to 20 days" and
the pupal stage "10 to 15 days" (UMaine #2424).

#### 1.1.3 Spring emergence and colonization (overwintered adults)

- In Maine only adults overwinter (UMaine field guide). "Starting in late May,
  the overwintered beetles dig themselves out of the soil and mate" (UMaine
  #2424; statewide). SOURCED.
- First adults emerge in spring at **68 degree-days C above 10.5 °C** (EPPO
  datasheet, citing Mailloux et al. 1988 in Quebec and Lefevere et al. 1989).
  SOURCED. The accumulation start date is not stated in what I could open:
  UNCONFIRMED; use 1 January with air temperature (Caribou's frozen soil makes
  the start date almost irrelevant before April). Calibration check for the
  builder: in a typical Caribou year this should fall in early June, a little
  after the statewide "late May".
- Emergence is spread over about a month: "overwintered beetles exit diapause
  and colonize host plants over approximately one-month time window" (Alyokhin,
  potatobeetle.org). SOURCED. Use a triangular spread over 30 days starting at
  the 68 DD°C date (INVENTED shape, sourced width).
- After colonizing, beetles "feed and then oviposit within 5-6 days depending on
  temperature" (Alyokhin overview, citing Ferro et al. 1985, 1991). Overwintered
  adults live "one to two months after colonizing" (UMaine #2424). SOURCED.
- Fecundity: "roughly 600 eggs" per female (UMaine #2424); 300 to 800 (Harcourt
  1971, cited by Alyokhin); up to 2000 (EPPO). Eggs in masses of 15 to 40
  (UMaine field guide); 10 to 30 (EPPO). SOURCED. Use 600 eggs per female over 30
  days, about 25 per mass.

#### 1.1.4 Within-season cohorts and feeding

Track cohorts (eggs laid on one day) and advance each by the daily DD°F.

Mortality (only partial sources):

- Egg cannibalism by adults averages 19% (Schrod et al. 1996, cited by EPPO).
  SOURCED.
- Lady beetle *Coleomegilla maculata* killed up to 37.8% of first-generation eggs
  (Hazzard et al. 1991, cited by Alyokhin). SOURCED as an upper value.
- Heavy rain and strong wind "may lead to high mortality, especially in the
  earlier instars" (EPPO). SOURCED, qualitative.
- Overall egg-to-adult survival: not found. INVENTED. Calibrate so that an
  untreated, non-rotated field reaches complete defoliation by late July in a
  warm year, because UMaine #2424 states that "in the absence of control
  measures, Colorado potato beetle damage can result in complete defoliation of
  potato fields".

Feeding (SOURCED unless marked):

- One larva eats about **40 cm²** of potato leaf over its development (Ferro et
  al. 1985, cited by Alyokhin and EPPO).
- Split by instar: **3%, 5%, 15%, 77%** for instars 1 to 4 (Ferro et al. 1985,
  cited by EPPO). Spread each instar's share evenly over that instar's DD.
- Adults eat up to **9.65 cm² per day** (Ferro et al. 1985, cited by Alyokhin).
- Food intake is zero at 10 °C and maximal at 25 °C (EPPO). Scale adult daily
  intake by `f = clamp((Tavg - 10) / 15, 0, 1)` (DERIVED: linear between the two
  sourced points).

Defoliation fraction for a field (or a hill) on a day:

```
eaten_cm2  = sum over larvae of 40 * share(instar) * (DD today / DD of instar)
           + adults * 9.65 * f
D          = cumulative eaten / cumulative leaf area produced     // leaf area comes from the crop model
```

Plants regrow after early defoliation: in Massachusetts, plants "partially
refoliated when defoliation stopped by 55 days after planting" with no total-yield
loss (Ferro et al. 1983). So let the crop model keep growing leaves; do not treat
eaten area as permanently gone before about 55 days after planting.

Generations: "In Maine, usually a single generation is completed during the
growing season, although two generations may be possible in southern parts of
the state during especially warm years" (UMaine #2424). Diapause "is induced by
decreasing day length in early to mid August" (UMaine #2424). Summer adults need
"about 7 to 9 days to develop reproductive systems and flight muscles" before
laying (UMaine #2424). SOURCED. Rule: summer adults that finish their 7 to 9 day
maturation after 1 August (INVENTED cut date inside the sourced "early to mid
August") do not lay; they feed for a few weeks and become next year's
overwintering population.

#### 1.1.5 Yield loss from defoliation by crop stage

Sources agree on the shape; only the mid-season curve has numbers:

- "Yields were little affected by defoliation except during the middle 4-6 weeks
  of the season, when yields were reduced up to 64% by total defoliation"; in the
  last month "defoliation and yield reduction were not correlated" (Hare 1980
  abstract). SOURCED.
- Mid-season, "70% of defoliation leads to a 20% reduction in yield, while
  complete defoliation leads to a 64% reduction" (Hare 1980 as cited in Weiler et
  al. 2025; I saw this in a search result, not in the paper). UNCONFIRMED but
  consistent with the abstract's 64%.
- Potatoes "can tolerate 30-40% defoliation during early growth stages, 10-60%
  defoliation during middle growth stages, and up to 100% defoliation late in the
  season without noticeable yield reduction" (Alyokhin overview summarizing Hare
  1980, Cranshaw and Radcliffe 1980, Ferro et al. 1983, Shields and Wyman 1984,
  Zehnder and Evanylo 1988). SOURCED.
- "Flowering plants can tolerate only 5-10% defoliation; after flowering, plants
  can tolerate up to 30% defoliation before yields are affected" (A3678).
  SOURCED.
- Defoliation of "> 10% of the upper leaves" at full bloom caused significant
  yield loss in Superior and Russet Burbank; full bloom was the most sensitive
  stage (Shields and Wyman 1984 abstract). SOURCED.
- Early-season defoliation of 10 or 33% was recovered completely; 67% caused
  "only slight" reductions; defoliation in the two weeks before vine kill had no
  effect (Cranshaw and Radcliffe 1980, via search abstract text). Partly
  UNCONFIRMED (abstract seen in a search result, not opened).
- Defoliation up to 40% by 55 days after planting gave no total-yield loss
  (31 t/ha both) but No. 1 grade yield fell from 20.6 to 16.6 t/ha (Ferro et al.
  1983 abstract). SOURCED: early feeding shifts size grade even when total yield
  recovers.

Recommended piecewise-linear loss, applied to the yield the crop would otherwise
make, using the maximum defoliation reached inside each window:

| Window (from the crop model's stages) | No-loss threshold | Points (defoliation -> fraction of yield lost) | Status |
|---|---|---|---|
| Emergence to start of bloom | 33% | 33% -> 0; 67% -> 0.05; 100% -> 0.30 | threshold SOURCED; 0.05 INVENTED for "slight"; 0.30 INVENTED |
| Bloom plus 4 to 6 weeks (Hare's "middle 4-6 weeks") | 10% | 10% -> 0; 70% -> 0.20; 100% -> 0.64 | 0.64 SOURCED; 0.20 UNCONFIRMED; 10% SOURCED |
| After that, until the last month | 30% | 30% -> 0; 100% -> 0.30 | threshold SOURCED; 0.30 INVENTED (half of mid-season) |
| Last month before senescence or vine kill | none | no loss at any defoliation | SOURCED |

Plus a grade penalty for early defoliation that regrew: move about 19% of the
No. 1 yield to undersize when early defoliation reached about 40% (DERIVED from
Ferro et al. 1983: 16.6 / 20.6 = 0.81).

#### 1.1.6 Scouting, thresholds and control

UMaine action thresholds, per 50 plants scouted (UMaine field guide; UMaine
Insecticide Schedule, Nov 2024). SOURCED:

| Stage | Per 50 plants | Per plant |
|---|---|---|
| Adults | 25 | 0.5 |
| Small larvae | 200 | 4 |
| Large larvae | 75 | 1.5 |

MOFGA (organic) gives the same larval numbers and adds "consider treatment at 25
beetles per 50 plants once defoliation reaches 10%" (search result only,
UNCONFIRMED). "Spot or area treatments can be very effective and are recommended
where possible" (UMaine schedule).

Timing (SOURCED): Bt tenebrionis and novaluron at about 10% egg hatch (UW);
tolfenpyrad, spinosad, spinetoram and abamectin "when nearly 50% of egg masses
have hatched" (UW); conventional sprays at 2nd to 3rd instar (A3678); Bt
"only persist 1-2 days and should be applied weekly for 2-3 applications if used
alone" (A3678); follow-up foliar sprays 7 to 10 days apart, often 2 or 3
re-applications (UW). Eggs and pupae are not susceptible (A3678).

Kill fractions per application are not in the sources I opened. INVENTED: 0.90
of susceptible larvae in the targeted stages for a conventional product at full
label rate, 0.75 for Bt (first and second instar only), 0 for eggs and pupae.
Multiply by `(1 - R_g)` where `R_g` is that product group's resistance (below).

Control options by era (for a game year taken from the weather year):

| Game years | What a Maine grower had (sourced unless marked) | Resistance situation |
|---|---|---|
| 1973-1979 | Organophosphates (azinphos-methyl/Guthion, phorate/Thimet, disulfoton/Di-Syston) and carbamates (carbofuran/Furadan, carbaryl/Sevin, oxamyl/Vydate, methomyl/Lannate); endosulfan. UMaine #2424 Table 1 (2008) lists these as registered; that they were the 1970s tools is my inference from the resistance history (UNCONFIRMED per product). DDT had been banned (US ban 1972: UNCONFIRMED, from memory). | DDT resistance since 1952, dieldrin since 1958; "in subsequent years... numerous organophosphates and carbamates" (UMaine #2424). Northeast is "the major problem area". |
| 1980-1994 | Add pyrethroids (esfenvalerate/Asana, permethrin/Ambush, Pounce); Bt tenebrionis (Novodor etc.) and cryolite late in the period (registration years UNCONFIRMED). | Cross-resistance OP and carbamate, multiple resistance OP + carbamate + pyrethroid (Ioannidis et al. 1991, cited by Alyokhin). "Resistance problem became completely unmanageable in some areas in the early 1990s, when many potato growers completely ran out of chemical control options" (potatobeetle.org history). Oxamyl failed in its first year in some places (UMaine #2424). |
| 1995-2004 | "Arrival of neonicotinoid insecticides in 1995" (Alyokhin et al. 2008); in-furrow imidacloprid (Admire) at planting. Bt-expressing NewLeaf potatoes 1995 to 2000, then withdrawn (Alyokhin overview). Spinosad, abamectin available by 2008 (UMaine #2424 Table 1). | Relief for about a decade. |
| 2005-2015 | Rotate IRAC groups: neonicotinoids (4A), spinosyns (5), avermectins (6), Bt (11), novaluron (15), indoxacarb (22), diamides (28) all listed by 2008 (UMaine #2424). | Imidacloprid "became ineffective... on two commercial farms in Southern Maine"; growers replaced one in-furrow imidacloprid treatment with "multiple foliar applications of oxamyl and abamectin" (Alyokhin et al. 2008). |
| 2016-2025 | UMaine schedule (Nov 2024) lists groups 3A, 4A (clothianidin, imidacloprid, thiamethoxam, acetamiprid), 6, 28 (cyantraniliprole/Verimark, chlorantraniliprole), 30, azadirachtin. UW (2025) adds ledprona (Calantha). | "Colorado potato beetle populations in Maine have varying levels of resistance, which is now a problem for many growers throughout the state" (UMaine schedule 2024). |

Resistance model (INVENTED form, anchored to sourced dates):

```
R_g in [0,1] per IRAC group g, per farm, carried across years.
Each generation sprayed with group g:      R_g = R_g + s_g * R_g * (1 - R_g)   // logistic selection, arithmetic only
Each year group g is not used:             R_g = R_g * (1 - c)                   // fitness cost
Whole-field in-furrow systemic:            use s_g larger than for a threshold-based spot spray
```

Anchors: imidacloprid went from introduction (1995) to field failure on some
southern Maine farms by the mid-2000s (Alyokhin et al. 2008; a photo of failed
in-furrow imidacloprid is dated 4 August 2005 on potatobeetle.org), so about
10 years of near-universal in-furrow use moved R from low to failure; oxamyl
failed within one season in some places (UMaine #2424); resistance persisted
four years after neonicotinoids were dropped (Alyokhin 2007, cited in the 2008
review), so `c` is small (INVENTED: 0.10 per year). UMaine #2424 also says
leaving untreated refuge rows and using thresholds slows resistance; in the game,
spot-treating at threshold should use a smaller `s_g` than whole-field
in-furrow (INVENTED ratio).

#### 1.1.7 Year-to-year carryover

```
overwinter_pop(next spring) = summer_adults_entering_diapause * overwinter_survival
colonizers(field) = overwinter_pop * proximity(field)
```

- `overwinter_survival`: about 26% in undisturbed sites in Wisconsin (Milner et
  al. 1992, cited by Alyokhin; 7% when the site was disturbed); mortality
  averaged 30% and reached 83% in Ukraine (Koval 1984, cited by EPPO). The two
  sources disagree (survival 0.26 vs about 0.70). Use 0.4 (INVENTED inside the
  0.17 to 0.70 range) and keep it constant; northern Maine winters under snow
  cover have no source in this slice.
- `proximity`: 1.0 for a field in potatoes last year (non-rotated); 0.042 for a
  field rotated away (DERIVED from Wright 1984's 95.8% reduction); 0.10 if the
  game wants the gentler Lashomb and Ng number. For six adjacent fields on one
  slope, the UMaine quarter-mile advice means even "rotated" fields are close;
  INVENTED: use 0.25 for a field adjacent to last year's potatoes and 0.042 only
  for a field a quarter mile or more away.

### 1.2 Seed quality

#### 1.2.1 Virus incidence to yield

Per-plant yield loss for a plant grown from an infected seed tuber
(secondary infection), SOURCED:

- PVY: "The largest losses are when a crop is grown from infected seed tubers,
  and yield losses of 30%-64% have been reported"; "for every 1% of PVY in the
  seed, the yield was decreased by 0.18 t/ha" (Russet Norkotah, Russet Burbank,
  Shepody; Nolte et al. 2004, cited in Viruses 2020 review). Oregon, Russet
  Norkotah: total U.S. No. 1 fell from 354 to 324 cwt/acre between 2% and about
  35% PVY, "approximately 1 cwt/acre for each percent of seedborne infection
  level", not statistically significant (James et al. 2003, OSU).
- PLRV: "yield reduction of potato by 30-50% in secondary infections" (EFSA 2020,
  citing Loebenstein and Gaba 2012). "Yield reduction... is greatest for plants
  derived from infected seed tubers, followed by plants initially virus free but
  infected early in the season"; "Mature plants show resistance"; tuber net
  necrosis "occurs only from current season infection, not seedborne infection"
  (OSU EM 9275).
- Heavy PVY: "as much as 50 to 80 percent yield loss in heavily infected
  commercial lots" (Hane and Hamm 1999, cited by UW A3951). SOURCED.

Game rule:

```
yield_factor = 1 - L_PVY * I_PVY - L_PLRV * I_PLRV        // I = fraction of plants from infected seed
L_PVY  = 0.30     // DERIVED: low end of 30-64%; also 0.18 t/ha per 1% / ~55-60 t/ha healthy Idaho yield (healthy yield UNCONFIRMED)
L_PLRV = 0.40     // midpoint of sourced 30-50%
```

Applied per hill, this is simpler still: a hill grown from an infected seed piece
yields `1 - L` of a healthy hill. Neighbour compensation is ignored (the Nolte
regression already includes it at field scale, so the per-hill form slightly
overstates loss; acceptable).

#### 1.2.2 Starting incidence by seed source

- Certified seed, Maine (2019 and 2025 Maine Seed Potato Certification books,
  Maine DACF). SOURCED:
  - Field inspection maxima: leafroll 2% (1st) and 1% (2nd); mosaic 3% and 2%;
    total virus 3% and 3%; varietal mixture 1% and 0.25%; bacterial ring rot,
    spindle tuber viroid and root knot nematode zero.
  - Blackleg at the third inspection by field year: FY1 0.1%, FY2 0.2%, FY3 1.0%,
    FY4 2.0%, FY5 2.0%.
  - Post-harvest (winter) ELISA test for PVY and PLRV: Certified class "5% or
    less total virus (Mosaic and Leafroll)"; Foundation class "0.5% or less".
  - Limited generation: "restricts seed potato production to 5 years in the
    soil. Field Year 5 seed potatoes are not eligible for certification but can
    be sold as seed for table stock or processing use."
- What commercial growers actually planted: seed-borne PVY in New Brunswick
  commercial fields (next door to Aroostook) averaged "2.2% PVY-positive plants
  in 2010" falling "to only 0.6% in 2014" (Singh et al., WERA-89 report on
  NIMSS). SOURCED. Use a draw between 0.5% and 3% for certified seed, never above
  the 5% certification cap.
- New York foundation seed: total "not... in excess of 1/2 percent" (Cornell).
  SOURCED; matches Maine's foundation class.

#### 1.2.3 Farm-saved seed: how fast virus rises

Two mechanisms, both sourced:

- **Autoinfection**: a plant grown from an infected tuber does not pass virus to
  all its daughter tubers. "The percentage of virus infected daughter tubers
  harvested from secondarily infected plants was invariably less than 100%, with
  the lowest percentage of infection being 30%"; PLRV daughter-tuber infection
  was 88% at low elevation in Peru (Bertschinger et al. 2017). SOURCED.
- **Current-season spread** by aphids: in New Brunswick commercial fields,
  "Control fields that were not sprayed with either oil or insecticide showed an
  average PVY spread ranging 27% to 31%"; intensively sprayed fields averaged
  14% in 2010 and 1.2% in 2014 (Singh et al., WERA-89). SOURCED. Also: "a single
  infected tuber per acre" can start a PLRV epidemic when aphids are not
  controlled (OSU EM 9275).

Recurrence (arithmetic, per generation of saved seed):

```
I_next = a * I + s * (1 - I)
a = 0.85     // INVENTED inside sourced 0.30-1.00 (temperate lowland closer to the 0.88 Peru lowland value)
s = 0.25     // no aphid control: SOURCED range 0.27-0.31, rounded down because not all late infections reach tubers (INVENTED adjustment)
s = 0.05     // oil + insecticide program: inside SOURCED 0.012-0.14
```

Worked example (DERIVED from the rule): certified seed at 2% PVY, saved
without aphid control, gives 26.2%, 40.7%, 49.4%, 54.7% in generations 1 to 4;
with `L_PVY = 0.30` that is a yield penalty of 7.9%, 12.2%, 14.8%, 16.4%. Saved
under an oil-plus-insecticide program: 6.6%, 10.3%, 13.2%, 15.6%, a penalty of
2.0% to 4.7%. A subtropical trial reported 10.8-16.7% PVY in generation 1 and
39.2-61.7% in generation 3 (Bangladesh; search snippet only, UNCONFIRMED); the
no-control rule lands inside that range (26% and 49%). The New Brunswick
data say spread rises with the seed's own inoculum (search snippet,
UNCONFIRMED), so a constant `s` understates the late generations; acceptable
for a five-season game. The "±30% yield loss from seed degeneration" often
attributed to Thomas-Sharma et al. 2016 is from a search snippet (UNCONFIRMED).

Roguing (a DESIGN.md verb): removing symptomatic plants removes sources of
spread, but some varieties hide PVY: "Russet Norkotah is among the more difficult
varieties for visual detection of PVY symptoms" (OSU, James et al. 2003).
SOURCED qualitatively. No efficacy number found: if roguing is modelled, its
effect on `s` is INVENTED, and it should be weaker for symptomless varieties.

Other seed-borne carry-over the game already has: blackleg tolerance rises with
field year (Maine FY table above), "because seed-borne blackleg increases with
seed generations" (Maine legislative testimony on the 2016 amendment, search
snippet; UNCONFIRMED).

#### 1.2.4 Seed rate and seed price

Seed per acre, 36-inch rows (UMaine Bulletin #2419, Table 2). SOURCED:

| In-row spacing (in) | 1.75 oz pieces (cwt/acre) | 2.0 oz | 2.25 oz | Pieces per acre |
|---|---|---|---|---|
| 8 | 23.8 | 27.2 | 30.6 | 21,780 |
| 9 | 21.2 | 24.2 | 27.6 | 19,360 |
| 10 | 19.1 | 21.8 | 24.5 | 17,424 |
| 11 | 17.3 | 19.8 | 21.8 | 15,480 |
| 12 | 15.9 | 18.2 | 20.4 | 14,520 |
| 14 | 13.6 | 15.6 | 17.5 | 12,446 |
| 16 | 11.9 | 13.6 | 15.3 | 10,890 |
| 18 | 10.6 | 12.1 | 13.6 | 9,680 |

Formula behind it (DERIVED, checks the table): `pieces/acre = 43,560 * 144 /
(row_in * spacing_in)`; `cwt/acre = pieces * oz / 16 / 100`. Bulletin #2419:
cut pieces "1 3/4 to 2 1/4 ounces", whole tubers under two inches planted
whole. Budgets in practice: 21 cwt/acre (Cornell 1985), 21 to 24 (Idaho 2016),
25 (Washington 2019). For a five-acre field at 10-inch spacing and 2 oz: about
109 cwt of seed (DERIVED).

Certified seed price relative to the crop (no Maine seed price series found):

| Source | Seed price | Crop price in same budget | Ratio |
|---|---|---|---|
| Cornell A.E. Res. 85-12, Long Island 1985 | $10.50/cwt | $5.96/cwt (U.S. No. 1 size A) | 1.76 |
| Idaho BUL 917, 2016 | $13.40/cwt (G-3 Russet Burbank seed) | $7.25/cwt (commercial potatoes) | 1.85 |
| WSU TB67E, Washington 2019 | $20.00/cwt delivered, cut, treated | $175/ton = $8.75/cwt (processing) | 2.29 |

DERIVED ratios. Use **certified seed = 1.8 x the season's tablestock price per
cwt**, plus about $1.75/cwt for cutting and $0.60/cwt for seed treatment
(Idaho 2016) if the game charges for cutting. One Maine number does not fit:
the 2008 Maine cost study reports seed at $186 per acre (peer average $173)
against an assumed crop price of $8 to $9/cwt. At 20 to 23 cwt/acre that is
$8 to $9 per cwt of seed, about 1.0 times the crop price (DERIVED; the study
does not state its seed rate or whether its farms bought certified seed or grew
their own). So the sourced range is 1.0 to 2.3; 1.8 is for purchased certified
seed, and the Maine study may reflect farms producing their own seed
(UNCONFIRMED explanation).

### 1.3 Rotation and soil health

#### 1.3.1 What the Maine trials measured

USDA-ARS New England Plant, Soil and Water Laboratory trials at Presque Isle,
established 2004 (Larkin, Honeycutt, Griffin, Olanya, He, Halloran). Systems:

- **PP**: continuous potato (the game's "potatoes after potatoes").
- **SQ**: barley underseeded with red clover, then potato (2-year) (the game's
  "rest year in oats and clover").
- **SC**: barley/timothy, timothy, potato (3-year, reduced tillage).
- **SI**: SC plus compost (composted dairy manure, 45 Mg/ha/yr for 7 years,
  2004-2010, then none).
- **DS**: mustard/rapeseed green manure, sudangrass/rye, potato (3-year).

Yields and diseases after 12 to 15 years (Larkin 2022, Agronomy 12:2804,
Tables 3 to 6; Russet Burbank, mostly rainfed). SOURCED values; 4-year means and
ratios DERIVED by me:

| System | Total yield 2015/16/17/18 (Mg/ha) | 4-yr mean | x SQ | Marketable 4-yr mean (Mg/ha) | x SQ | Black scurf incidence mean (%) | x SQ | Common scab incidence mean (%) | x SQ | Soil OM (%) |
|---|---|---|---|---|---|---|---|---|---|---|
| SI | 30.1 / 49.7 / 25.7 / 27.9 | 33.35 | 1.27 | 23.50 | 1.37 | 10.7 | 0.54 | 41.2 | 0.88 | 5.65 |
| DS | 27.1 / 42.9 / 25.4 / 26.5 | 30.48 | 1.16 | 20.62 | 1.20 | 8.8 | 0.45 | 40.4 | 0.86 | 4.40 |
| SC | 27.9 / 40.4 / 22.4 / 24.9 | 28.90 | 1.10 | 18.95 | 1.10 | 14.7 | 0.75 | 43.3 | 0.93 | 4.08 |
| SQ | 25.1 / 35.7 / 21.6 / 23.0 | 26.35 | 1.00 | 17.18 | 1.00 | 19.7 | 1.00 | 46.7 | 1.00 | 3.94 |
| PP | 21.9 / 36.1 / 17.4 / 22.4 | 24.45 | 0.93 | 14.57 | 0.85 | 27.7 | 1.41 | 55.5 | 1.19 | 3.54 |

Other quotes from the same paper: "The continuous potato (PP) nonrotation control
consistently resulted in the lowest yields of all systems"; initial (2004) soil
OM averaged 3.9% and "OM content for PP was lower than all other systems, having
declined from initial values by about 0.5%"; PP had "the lowest overall
percentage of marketable tubers... 56% for PP vs. 63% to 68% for all other
systems"; SI continued to improve soil "several years after compost amendments
ended". Weather dominated year to year: 2016 yields were "nearly double those
observed in 2017".

Earlier results from the same and related Maine trials (abstracts via Europe
PMC). SOURCED:

- After full rotation cycles, all rotations reduced stem canker 10-50% versus PP;
  SQ, SC and DS reduced black scurf 18-58% and common scab 15-45%; "Irrigation
  increased black scurf and common scab but also resulted in higher yields"
  (Larkin et al. 2011, Phytopathology 101:58).
- Without irrigation SI beat all other systems on yield "by 14 to 90%"; with
  irrigation DS gave the top yields "by 11 to 35%"; irrigation raised yields in
  every system except SI "by an average of 27 to 37%"; "Every rotation
  out-yielded PP" (Larkin et al. 2021, Agronomy 11:165, ARS summary).
- "All rotations reduced soilborne diseases black scurf and common scab, and
  increased yield after one rotation cycle (3 years), but diseases increased
  overall after two rotation cycles. DS maintained lower soilborne disease
  levels... Cropping system effects became more pronounced after multiple
  cycles... Cropping system and irrigation effects were significant even after
  systems were no longer maintained" (Larkin et al. 2017, Plant Pathology).
- Ten years of 2-year rotations at Newport, ME: canola and rapeseed rotations
  reduced Rhizoctonia canker, black scurf and common scab 18-38% and gave
  6.8-8.2% higher yields than continuous potato or barley/clover; a winter rye
  cover crop further reduced black scurf 12.5% and common scab 7.2% and raised
  yield 4%; "Verticillium wilt became a prominent disease problem only after four
  full rotation cycles"; "all rotations resulted in increasing levels of common
  scab and Verticillium wilt over time" (Larkin et al. 2010, Plant Disease).
- Mustard blend (*Sinapis alba* + *Brassica juncea*) and sorghum-sudangrass green
  manures reduced Verticillium wilt 25% and 18%; metam sodium fumigation 35%;
  mustard and fumigation raised yield 12% and 18%; "by the second rotation cycle,
  disease levels were high in all rotations"; "multiple years of
  disease-suppressive crops may be needed" (Larkin, Honeycutt and Olanya 2011,
  Plant Disease).
- Mustard, sudangrass and rapeseed rotations reduced black scurf 16-27% and
  raised yield 6-11% versus barley; crops managed as green manures had 15-26%
  less disease and 6-13% more yield than other management; mustard as a green
  manure cut scurf 54% and raised yield 25% versus a soybean cover; net income up
  more than $860/ha for harvested mustard or rapeseed with incorporation versus
  barley (Larkin and Halloran 2014, Am J Potato Res).
- Canola and rapeseed green manures cut black scurf 70-80% versus an oats
  rotation; Indian mustard cut common scab 25%; ryegrass, canola, rapeseed and
  Indian mustard cut powdery scab 15-40% (Larkin and Griffin 2007, Crop
  Protection).
- Red clover cover crops "significantly reduced" black scurf and common scab "in
  some rotation cycles"; delaying tillage to spring cut yield about 12% in one
  cycle; cover crops had no effect on total yield (Griffin et al. 2009, Am J
  Potato Res).
- Maine Potato Ecosystem Project, 13 years of 2-year rotations: amended soil
  (manure, compost, green manure) yields "up to 55% higher"; in the worst year
  the amended system made 63% of its maximum versus 45% for the non-amended
  system (Mallory and Porter 2007, Agron J).
- Early blight incidence was "significantly higher with the Continuous Potato
  system" (31-64% in 2006, 12-43% in 2007) (Olanya et al. 2009, J Gen Plant
  Pathol).

Conflicts to note:

- **Red clover and scab.** Cornell: "Red clover... stimulates problems with
  common scab and should not be used in fields where scab has been a problem."
  Griffin et al. 2009 (Maine): red clover reduced black scurf and common scab in
  some cycles. The game's rest year includes clover. Use the Maine number (no
  penalty) because it is from Aroostook, and note the Cornell warning.
- **Irrigation and scab.** Cornell: keeping soil wetter than about -0.4 bar for
  the 2 to 6 weeks after tuber initiation inhibits scab. Larkin 2011 (Maine):
  irrigation increased black scurf and common scab. These measure different
  things (timed moisture during tuberization versus a season-long irrigation
  regime). Use the Cornell rule for scab infection timing and Larkin's for
  black scurf.
- **Manure and scab.** Cornell: "Applying manure to potato fields can cause an
  increase in scab infection." Larkin 2022: compost (SI) still reduced scab
  incidence versus PP and SQ. Same resolution: follow the Maine data.

#### 1.3.2 Recommended per-field soil state

Two tiers, because the sources show two speeds: Rhizoctonia and scab respond
within one rotation cycle, while soil organic matter and Verticillium move over
a decade.

State per field (DESIGN.md fields), carried from year to year:

| Variable | Meaning | Start value | Status |
|---|---|---|---|
| `yearsOut` | consecutive non-potato years before this crop (0 = potatoes after potatoes) | 1 | game bookkeeping |
| `restCrops` | what those years were (grain + clover, grass, Brassica green manure, rye cover) | grain + clover | game bookkeeping |
| `potatoStreak` | consecutive potato years | 0 | game bookkeeping |
| `som` | soil organic matter, % | 3.9 | SOURCED: Presque Isle 2004 initial value |
| `vertOdds` | Verticillium wilt incidence as odds, `p / (1 - p)` | 0.02 (p about 2%) | INVENTED |

**Fast tier (lookup, recomputed each potato year)**, SOURCED ratios from the
table above:

| History before this potato crop | Rotation yield factor (total) | Marketable factor | Black scurf factor | Common scab factor |
|---|---|---|---|---|
| Potatoes last year (yearsOut = 0) | 0.93 | 0.85 | 1.41 | 1.19 |
| One rest year, grain + clover (SQ) | 1.00 | 1.00 | 1.00 | 1.00 |
| Two rest years, grain/grass then grass (SC) | 1.10 | 1.10 | 0.75 | 0.93 |
| Two years with Brassica green manure (DS) | 1.16 | 1.20 | 0.45 | 0.86 |

Scaling notes:

- The PP row is the 12-to-15-year steady state. For the first potatoes-after-
  potatoes year, use a factor halfway between SQ and PP and step to the full PP
  row from the third consecutive potato year (INVENTED ramp; the sources show
  only the start and the long-run end). Larkin 2017 shows rotation benefits
  appear "after one rotation cycle (3 years)", which supports a fast tier.
- Add a winter rye cover after the rest crop: black scurf x0.875, scab x0.928,
  yield x1.04 (Larkin 2010, SOURCED).
- Scurf and scab factors multiply a baseline incidence, which sets the share of
  tubers downgraded at dig. Baseline for SQ: scurf 20%, scab 47% incidence
  (Larkin 2022 SQ means; these Russet Burbank plots had unusually high scab, so
  the variety and pH modifiers below matter more than the baseline).
- Scab only: scab is "controlled or greatly suppressed at soil pH levels of 5.2
  or lower" (Cornell); susceptibility "increases from about pH 5.2 to an optimum
  of between 6.0 and 7.5" (UMaine #2440). Avoiding moisture stress for the 2 to 6
  weeks after tuber initiation inhibits infection (Cornell). "Potato scab is a
  production problem that affects grade quality but has only a negligible effect
  on total yield or storability" (UMaine #2440). So scab is grade only, never
  yield.

**Slow tier**:

Soil organic matter, `som` (SOURCED endpoints after about 13 years from 3.9%:
PP 3.54, SQ 3.94, SC 4.08, DS 4.40, SI 5.65; per-year rates DERIVED so that each
system's cycle reproduces its endpoint):

```
any potato year:              som -= 0.035   // PP: about -0.46 over 13 years
grain + clover rest year:     som += 0.035   // SQ cycle nets about 0 (3.94 vs 3.9)
grass rest year:              som += 0.04    // SC: (-0.035 + 2 * 0.04) per 3 years, about +0.19 over 13 years
Brassica green manure year:   som += 0.075   // DS: (-0.035 + 2 * 0.075) per 3 years, about +0.50 over 13 years
compost application:          som += 0.25    // SI: +1.75 after 7 years at 45 Mg/ha/yr (1.75 / 7)
floor 2.5                                    // INVENTED
```

SOM yield effect: SI and SC share a rotation and differ by compost; SI made 1.154
times SC's total yield (33.35 / 28.90) with 1.57 percentage points more OM (5.65
- 4.08). That is about **+10% yield per +1% OM, rainfed** (DERIVED). The Maine
sources say this works mostly through water: SI "was essentially a substitute for
irrigation" (Larkin 2021 summary) and amended soil held yield better in dry years
(Mallory and Porter 2007). Preferred implementation: let OM raise the soil's
available water in the water-balance model instead of multiplying yield, so the
effect appears only in dry years (that conversion needs a number from the soil
water slice; I did not research it). Do not apply both the fast-tier yield
factor's SOM share and this; the fast tier already contains the SQ-to-SC-to-DS OM
differences, so apply OM effects only to OM changes the player makes beyond the
rotation (compost, or the PP decline after the PP row is reached). That split is
INVENTED to avoid double counting.

Verticillium wilt and potato early dying, `vertOdds`:

- Incidence rises with each potato crop and a single non-host year barely slows
  it: in Oregon, the apparent infection rate was 1.17 and 1.34 per year for
  Norgold Russet and Russet Burbank, "the incidence of infection by
  Verticillium more than doubled each year"; first-year fields 6.3%, fourth-year
  74%; with winter wheat as the rotation crop "incidence of V. dahliae increased
  from 4.25% to 49.25%" (Powelson 1980). SOURCED.
- Microsclerotia persist "without a host for at least 14 years" (PMC12109294,
  2025 review). SOURCED.
- In Maine 2-year rotations, wilt became prominent "only after four full rotation
  cycles" (Larkin 2010). SOURCED.

```
incidence during a potato crop:  p = vertOdds / (1 + vertOdds)
after each potato crop:          vertOdds = vertOdds * M
each rest year:                  vertOdds unchanged      // no measurable decay over game timescales (>=14-year survival)
Brassica green manure before this crop: this season's p x0.75 (mustard) or x0.82 (sudangrass); vertOdds unchanged
```

`M` in odds form is `e^r`: 3.2 to 3.8 for the Oregon rates (DERIVED; computed
offline because the core avoids `exp`). Oregon is irrigated and hot; in Maine
wilt became prominent only after four full cycles, that is in the fifth potato
crop, which sees `start * M^4`. Starting at p = 2%, reaching p = 50% there needs
M of about 2.6; starting at 6.3% needs about 2.0 (DERIVED). Use **M = 2.3 for
Aroostook** (INVENTED inside that 2.0 to 2.6 band; the only Maine anchor is
qualitative). The "x0.75 / x0.82" green manure effect is SOURCED (Larkin 2011:
only fumigation reduced soil Verticillium populations).

PED yield loss:

- In an Oregon field cropped to potatoes three of four years (95% of plants with
  early dying), yields were 45% (Russet Burbank) and 53% (Norgold Russet) below
  a field new to potatoes (Powelson 1980). With fewer than about 10% of plants
  infected, "yields would not be depressed significantly" (Powelson 1980).
  SOURCED.
- PED "can reduce potato tuber yield by 30% or higher"; "In North America, yield
  reduction in severely affected fields can exceed 50%" (PMC12109294). SOURCED.
- Thresholds: Russet Burbank "10 CFU/gram of soil dry weight" (PNW Handbook);
  5-30 CFU/g alone and 2-13 CFU/g with lesion nematodes (PMC12109294). SOURCED
  (only needed if the game ever shows a soil test).

```
PED_loss = 0.45 * max(0, p - 0.10) / 0.90      // 0 below 10% incidence, 45% at 100%
```

The 0.45 and the 10% knee are SOURCED; the straight line between them is
INVENTED. If the crop model can take it, express PED as earlier canopy death
instead of a flat multiplier (the disease is premature senescence), which also
makes irrigation and vine-kill timing interact with it as in the field; the
days-earlier conversion is not in my sources.

Double counting caution: the Larkin 2022 PP and SQ yields already include
whatever wilt those plots had in 2015-2018. Starting every field at p = 2%
(INVENTED) keeps the two from overlapping much inside a five-season game
(DERIVED with M = 2.3): potato crops 1 to 5 in a row see p = 2.0%, 4.5%, 9.7%,
19.9%, 36.4%, so PED_loss = 0, 0, 0, 4.9%, 13.2%; a field in the oats-and-clover
rotation gets three potato crops in five seasons (2.0%, 4.5%, 9.7%) and no PED
loss. The continuous-potato field then carries the fast-tier 0.93 and, from its
fourth potato crop, a PED loss on top. If the game later lets a farm run longer
than five seasons, or starts fields with a long potato history, this
combination is the least sourced part of the report; flag it in MODEL.md.

#### 1.3.3 How fast the benefit builds and decays (summary for MODEL.md)

| Effect | Builds | Decays | Source |
|---|---|---|---|
| Black scurf, stem canker, common scab | within one rotation cycle (one or two rest years) | returns within one or two potato years | Larkin 2011, 2017, 2022 |
| Yield gain from rotation | after one 3-year cycle; more pronounced after several | residual effects still significant 1-2 years after systems stopped | Larkin 2017 |
| Soil organic matter | about +0.25%/yr only with heavy compost; about 0 to +0.04%/yr from rotations | continuous potato about -0.035%/yr; compost gains persisted 5-8 years after the last application | Larkin 2022 (DERIVED rates) |
| Verticillium inoculum | more than doubles (in odds) per potato crop | does not decay on a five-year scale (>=14-year survival) | Powelson 1980; PMC12109294 |
| Brassica green manure disease suppression | the following potato crop | gone by the next cycle in a heavily infested field | Larkin 2011 |
| Colorado potato beetle pressure | adults walk into non-rotated fields | rotation away cuts colonizers about 90-96% | Alyokhin overview; UMaine #2424 |

### 1.4 Early blight (Alternaria solani), in brief

Physiological days (P-days) from daily minimum and maximum temperature (Sands
et al. 1979, as used by Pscheidt and Stevenson 1986). Formula as given by METOS,
whose page renders it garbled ("1/245P(Tmin)" and "101 – (T – 21)2"); read as:

```
P(T) = 0                                         if T < 7
P(T) = 10 * (1 - (T - 21)^2 / (21 - 7)^2)        if 7 <= T < 21
P(T) = 10 * (1 - (T - 21)^2 / (30 - 21)^2)       if 21 <= T <= 30
P(T) = 0                                         if T > 30
Pday = (1/24) * ( 5*P(Tmin) + 8*P((2*Tmin + Tmax)/3) + 8*P((Tmin + 2*Tmax)/3) + 3*P(Tmax) )   // T in C
```

The garbled rendering made me reconstruct the 1/24, the factor 5 and the factor
10; the reconstruction matches UW's statement that daily accumulation reaches
about 10 P-days (an all-day 21 °C gives exactly 10). Treat the formula as
SOURCED in structure, UNCONFIRMED in exact typesetting; the primary PDF (APS)
would not open.

Rule: start protectant sprays once P-days accumulated since 50% emergence exceed
**300** (UW AgWeather: "exceeds 300 since the 50% emergence date"; UMaine #5087:
risk elevated "at approximately 300 p-days"). Idaho times the first application
at 200 P-days (Idaho CIS 1196). SOURCED.

Yield effect: "losses rarely exceed 20%, if left uncontrolled... fungicide
treatment helps contain losses to less than 5%"; "the disease rarely develops
early and usually appears on mature foliage" (Idaho CIS 1196, adapted from MSU
E-2991). "Tuber early blight infections are uncommon in Maine" (UMaine #5087).
Continuous potato raises incidence (Olanya et al. 2009). SOURCED.

Recommendation: **keep it cut as its own loop**, consistent with DESIGN.md. Its
maximum loss (about 20%, late, on mature foliage) is smaller than late blight's,
its sprays are the same protectant sprays (chlorothalonil, mancozeb) already used
against late blight, and its trigger (P-days) is a temperature clock that adds no
new decision. If the designers want it at all, the cheapest honest version is a
passive penalty: after 300 P-days from emergence, an unsprayed field loses up to
20% of the bulking it does from then on, scaled by the fraction of days with
leaf wetness (hours of RH >= 90%), halved under any protectant program already
applied for late blight, and multiplied by 1.4 in a potatoes-after-potatoes
field. Every multiplier in that sentence except the 20%, the 300 and the
protectant effect (<5%) is INVENTED.

---

## 2. Parameter table

| Name | Value | Unit | Source (section 3 key) and status |
|---|---|---|---|
| CPB degree-day base | 52 (11.1) | °F (°C) | [UW-vegento], [A3678] SOURCED |
| CPB upper cutoff | 86 (30) | °F (°C) | [UW-vegento] SOURCED (AgWeather calculator says no cutoff) |
| CPB egg stage | 120 | DD°F | [UW-vegento], [A3678] SOURCED |
| CPB instars 1-4 | 65, 55, 60, 100 | DD°F | [UW-vegento], [A3678] SOURCED |
| CPB pupa | 275 | DD°F | [UW-vegento], [A3678] SOURCED |
| CPB spring emergence start | 68 | DD°C above 10.5 °C | [EPPO] SOURCED (citing Mailloux 1988); start date UNCONFIRMED |
| CPB emergence window | about 30 | days | [Alyokhin-overview] SOURCED |
| CPB emergence in Maine | late May onward | date | [UMaine-2424] SOURCED |
| Pre-oviposition (overwintered) | 5-6 | days | [Alyokhin-overview] SOURCED |
| Pre-oviposition (summer adults) | 7-9 | days | [UMaine-2424] SOURCED |
| Diapause induction | early to mid August | date | [UMaine-2424] SOURCED |
| Generations in Maine | 1 (2 in warm years, south) | per year | [UMaine-2424] SOURCED |
| Eggs per female | 600 (300-800; up to 2000) | eggs | [UMaine-2424]; [Alyokhin-overview]; [EPPO] SOURCED |
| Eggs per mass | 15-40 | eggs | [UMaine-FG] SOURCED |
| Egg cannibalism | 19 | % of eggs | [EPPO] SOURCED |
| Larval consumption, total | 40 | cm² per larva | [Alyokhin-overview], [EPPO] SOURCED |
| Consumption share by instar | 3 / 5 / 15 / 77 | % | [EPPO] SOURCED |
| Adult consumption | 9.65 | cm² per day | [Alyokhin-overview] SOURCED |
| Feeding temperature range | 0 at 10, max at 25 | °C | [EPPO] SOURCED |
| Mid-season loss at 100% defoliation | 64 | % yield | [Hare-1980] SOURCED |
| Mid-season loss at 70% defoliation | 20 | % yield | Hare via Weiler 2025, UNCONFIRMED |
| Bloom defoliation tolerance | 5-10 (>10% upper leaves significant) | % | [A3678]; [Shields-Wyman] SOURCED |
| Early / post-bloom tolerance | 30-40 / 30 | % | [Alyokhin-overview]; [A3678] SOURCED |
| Late-season tolerance | up to 100 | % | [Hare-1980]; [Alyokhin-overview] SOURCED |
| Grade loss after early defoliation | No. 1 yield x0.81 | ratio | [Ferro-1983] DERIVED |
| Action threshold adults | 25 per 50 plants | count | [UMaine-FG], [UMaine-Insect] SOURCED |
| Action threshold small larvae | 200 per 50 plants | count | [UMaine-FG], [UMaine-Insect] SOURCED |
| Action threshold large larvae | 75 per 50 plants | count | [UMaine-FG], [UMaine-Insect] SOURCED |
| Sprays, non-rotated vs rotated | 4.78 vs 2.73 | applications per season | [UMaine-2424] SOURCED (southern Maine 2005) |
| Rotation effect on colonizing adults | -95.8 | % | [Alyokhin-overview] citing Wright 1984 SOURCED |
| Overwinter survival | 0.26 (Wisconsin) to 0.70 (Ukraine) | fraction | [Alyokhin-overview]; [EPPO] SOURCED, conflicting |
| Neonicotinoids introduced | 1995 | year | [Alyokhin-2008] SOURCED |
| Resistance persistence after stopping | about 4 | years | [Alyokhin-2008] SOURCED |
| PVY loss per plant from infected seed | 30-64 (use 30) | % | [Viruses-2020] SOURCED |
| PVY loss per 1% seed incidence | 0.18 | t/ha | [Viruses-2020] citing Nolte 2004 SOURCED |
| PLRV loss per plant from infected seed | 30-50 (use 40) | % | [EFSA-PLRV] SOURCED |
| Maine field tolerance, leafroll | 2 / 1 | % (1st / 2nd inspection) | [ME-Cert] SOURCED |
| Maine field tolerance, mosaic | 3 / 2 | % | [ME-Cert] SOURCED |
| Maine post-harvest test, certified | <= 5 | % total virus | [ME-Cert] SOURCED |
| Maine post-harvest test, foundation | <= 0.5 | % total virus | [ME-Cert] SOURCED |
| Maine generation limit | FY1-FY5, FY5 not certifiable | field years | [ME-Cert] SOURCED |
| Maine certified-seed requirement | plantings > 1 acre | acres | [UMaine-2419] SOURCED |
| Commercial seed PVY, New Brunswick | 2.2 (2010) to 0.6 (2014) | % plants | [NIMSS-WERA89] SOURCED |
| Daughter-tuber autoinfection | 30-100 (PLRV lowland 88) | % | [Bertschinger-2017] SOURCED |
| In-season PVY spread, unsprayed | 27-31 | % | [NIMSS-WERA89] SOURCED |
| In-season PVY spread, sprayed | 1.2-14 | % | [NIMSS-WERA89] SOURCED |
| Seed rate, 36 in rows, 10 in, 2 oz | 21.8 | cwt/acre | [UMaine-2419] SOURCED |
| Certified seed : crop price | 1.76-2.29 in NY/ID/WA budgets, about 1.0 in the 2008 Maine study (use 1.8 for purchased certified seed) | ratio | [Cornell-1985], [Idaho-BUL917], [WSU-TB67E], [ME-Cost-2008] DERIVED |
| Initial soil OM, Presque Isle | 3.9 | % | [Larkin-2022] SOURCED |
| Yield factor PP / SQ / SC / DS / SI (total) | 0.93 / 1.00 / 1.10 / 1.16 / 1.27 | x SQ | [Larkin-2022] DERIVED from Table 3 |
| Marketable factor PP / SQ / SC / DS / SI | 0.85 / 1.00 / 1.10 / 1.20 / 1.37 | x SQ | [Larkin-2022] DERIVED |
| Black scurf factor PP / SQ / SC / DS | 1.41 / 1.00 / 0.75 / 0.45 | x SQ | [Larkin-2022] DERIVED from Table 4 |
| Common scab factor PP / SQ / SC / DS | 1.19 / 1.00 / 0.93 / 0.86 | x SQ | [Larkin-2022] DERIVED from Table 5 |
| Winter rye cover | scurf x0.875, scab x0.928, yield x1.04 | factor | [Larkin-2010] SOURCED |
| Brassica green manure vs Verticillium | x0.75 (mustard), x0.82 (sudangrass) | wilt | [Larkin-2011PD] SOURCED |
| OM change per potato year / grain+clover / grass / Brassica GM / compost | -0.035 / +0.035 / +0.04 / +0.075 / +0.25 | % OM per year | [Larkin-2022] DERIVED from 13-year endpoints |
| Yield per +1% OM (rainfed) | +10 | % | [Larkin-2022] DERIVED |
| Verticillium apparent infection rate | 1.17-1.34 | per year (logit) | [Powelson-1980] SOURCED |
| Verticillium odds multiplier, Maine | 2.3 | per potato crop | INVENTED (band 2.0-2.6 DERIVED) |
| Microsclerotia survival | >= 14 | years | [PED-review-2025] SOURCED |
| PED loss, severe field | 45 (RB), 53 (Norgold) | % | [Powelson-1980] SOURCED |
| PED no-loss incidence | < 10 | % plants | [Powelson-1980] SOURCED |
| Scab-suppressive pH | <= 5.2 | pH | [Cornell-scab], [UMaine-2440] SOURCED |
| Scab-critical moisture window | 2-6 weeks after tuber initiation, wetter than -0.4 bar | time, bar | [Cornell-scab] SOURCED |
| Early blight trigger | 300 (Idaho 200) | P-days from 50% emergence | [UW-AgWeather], [UMaine-5087], [Idaho-CIS1196] SOURCED |
| Early blight loss, uncontrolled / sprayed | <= 20 / < 5 | % | [Idaho-CIS1196] SOURCED |
| P-day cardinal temperatures | 7 / 21 / 30 | °C | [METOS] SOURCED (garbled rendering) |

---

## 3. Sources

Opened and read (content quoted above came from these):

- [UW-vegento] University of Wisconsin Vegetable Entomology, Colorado potato
  beetle. https://vegento.russell.wisc.edu/pests/colorado-potato-beetle . Table 1
  degree days (base 52 °F, upper 86 °F, biofix first egg mass); defoliation
  tolerance; overwintering; resistance and IRAC rotation advice; ledprona and
  novaluron at 10% hatch.
- [A3678] Delahaut, K.A. 1997. Colorado potato beetle. UW-Extension A3678.
  https://barron.extension.wisc.edu/files/2023/02/Colorado-Potato-Beetle.pdf
  (opened by local text extraction; WebFetch could not read it). Table 1 degree
  days with treatment notes; "Flowering plants can tolerate only 5-10%
  defoliation; after flowering... up to 30%"; Bt persistence 1-2 days.
- [UMaine-FG] UMaine Cooperative Extension Potato IPM field guide, Colorado potato
  beetle. https://extension.umaine.edu/potatoes/ipm/field-guide/colorado-potato-beetle/ .
  Thresholds per 50 plants; only adults overwinter in Maine; 500 eggs; masses
  of 15-40.
- [UMaine-2424] Alyokhin, Dwyer and Plant 2008. Insecticide Resistance in Colorado
  Potato Beetles, Bulletin #2424.
  https://extension.umaine.edu/publications/wp-content/uploads/sites/52/2015/04/2424.pdf
  (local text extraction). Maine life cycle (late May emergence, larvae 10-20
  days, pupae 10-15 days, 7-9 day maturation, diapause early to mid August, one
  generation); resistance history; 4.78 vs 2.73 sprays; IRAC Table 1.
- [UMaine-Insect] UMaine Insecticide Schedule for Potatoes, updated November 2024
  (Ozturk; reviewed by Alyokhin and Buzza).
  https://extension.umaine.edu/potatoes/resource/insecticide-schedule-for-potatoes/
  (local text extraction). Thresholds; "varying levels of resistance"; products
  by group.
- [Alyokhin-overview] Alyokhin, A. Colorado potato beetle biology and management.
  http://www.potatobeetle.org/overview.html (HTTPS certificate expired; read over
  HTTP). Feeding 40 cm² and 9.65 cm²/day; fecundity 300-800; tolerance 30-40 /
  10-60 / 100%; rotation effects (Lashomb and Ng, Wright 95.8%); overwinter
  survival 7% vs 26% (Milner); one-month emergence window; NewLeaf 1995-2000.
- [potatobeetle-history] http://www.potatobeetle.org/resistance/History.html .
  "completely unmanageable in some areas in the early 1990s"; neonicotinoids 1995;
  resistance reported on Long Island, Delaware, Maine, Michigan.
- [Alyokhin-2008] Alyokhin, Baker, Mota-Sanchez, Dively, Grafius 2008. Colorado
  potato beetle resistance to insecticides. Am J Potato Res 85:395-413. Full text
  at http://potatobeetle.org/AJPR_Review.html . Arsenicals, DDT from 1939,
  neonicotinoids 1995, southern Maine imidacloprid failures, 4-year persistence.
- [EPPO] EPPO datasheet Leptinotarsa decemlineata, updated 2021-06-17.
  https://gd.eppo.int/taxon/LPTNDE/download/datasheet_pdf . 68 DD°C above
  10.5 °C; feeding by instar 3/5/15/77%; intake zero at 10 °C, max at 25 °C;
  cannibalism 19%; overwinter mortality 30% (up to 83%).
- [Hare-1980] Hare, J.D. 1980. J Econ Entomol 73:369-373, abstract.
  https://academic.oup.com/jee/article-abstract/73/3/369/2213075 .
- [Ferro-1983] Ferro, Morzuch, Margolies 1983. J Econ Entomol 76:349-356,
  abstract. https://academic.oup.com/jee/article-abstract/76/2/349/2213809 .
- [Shields-Wyman] Shields and Wyman 1984. J Econ Entomol 77:1194-1199, abstract.
  https://academic.oup.com/jee/article-abstract/77/5/1194/2214262 .
- [ME-Cert] Maine Seed Potato Certification 2019 and 2025, Maine DACF.
  https://www.mainepotatoes.com/wp-content/uploads/2019/11/2019SeedPotatoCert.pdf ;
  https://www11.maine.gov/dacf/////php/seed_potato/documents/2025SeedPotatoCert.pdf .
  Certified Seed Regulations page (tolerances, post-harvest test classes, FY
  blackleg); Generation Program; field equivalency table.
- [UMaine-2419] UMaine Bulletin #2419, Producing Potatoes Organically in Maine.
  https://extension.umaine.edu/publications/2419e/ . Table 2 seed requirements;
  one-acre certified seed rule; plant a tenth to a quarter mile from last year.
- [UMaine-2412] Johnson, S.B. Selecting, Cutting and Handling Potato Seed, Bulletin
  #2412. https://extension.umaine.edu/potatoes/wp-content/uploads/sites/49/2012/03/seed-handling.pdf .
  "five percent rule" for seed-lot defects.
- [OSU-PVY] James, Rykbost, Charlton, Locke 2003. Impact of seedborne PVY on yield
  of Russet Norkotah. https://agsci.oregonstate.edu/sites/agscid7/files/coarec/attachments/6-impactseedpotatoes.pdf .
  Table 1; about 1 cwt/acre per percent.
- [OSU-EM9275] OSU EM 9275 (2020), IPM Strategic Plan for Potatoes in OR, WA, ID.
  https://extension.oregonstate.edu/sites/extd8/files/documents/em9275.pdf .
  PLRV and PVY paragraphs.
- [Viruses-2020] Torrance and Talianksy 2020. Potato Virus Y emergence and evolution...
  Viruses 12:1430 (PMC7764287, full text via Europe PMC). 30-64% from infected
  seed; 0.18 t/ha per 1% (Nolte 2004).
- [EFSA-PLRV] EFSA PLH Panel 2020. Pest categorisation of potato leafroll virus
  (non-EU isolates). EFSA J (PMC7008912). 30-50% in secondary infections.
- [Bertschinger-2017] Bertschinger et al. 2017. Incomplete infection of
  secondarily infected potato plants. Front Plant Sci 8:74 (PMC5289980).
- [NIMSS-WERA89] WERA-89 Potato Virus and Virus-Like Disease Management, NIMSS
  project page. https://nimss.org/projects/view/SAES/12516 . Singh (New Brunswick)
  spread and inoculum figures; Nolte $5.13-18.06/acre per 1% PVY (Russet Burbank).
- [UW-A3951] Management of Potato Virus Y in Wisconsin seed potatoes, A3951.
  https://cmg.extension.colostate.edu/wp-content/uploads/sites/5/2021/03/A3951.pdf .
  50-80% loss in heavily infected lots (Hane and Hamm 1999).
- [Cornell-virus] Cornell, Virus and viroid diseases of potato.
  https://www.vegetables.cornell.edu/pest-management/disease-factsheets/virus-and-viroid-diseases-of-potato/ .
- [Larkin-2022] Larkin, R.P. 2022. Long-term effects of compost amendments and
  Brassica green manures in potato cropping systems... Agronomy 12:2804.
  https://pdfs.semanticscholar.org/b82c/3e4076432d97cab1bf09de55c2c80a9aefc7.pdf
  (full PDF). Tables 3, 4, 5, 6 and text quoted above.
- Larkin and colleagues, abstracts read through Europe PMC
  (https://www.ebi.ac.uk/europepmc/webservices/rest/search, query AUTH:"Larkin RP"):
  [Larkin-2006] Phytopathology 96:68; [Larkin-Griffin-2007] Crop Prot
  doi:10.1016/j.cropro.2006.10.004; [Larkin-2008] Soil Biol Biochem
  doi:10.1016/j.soilbio.2007.03.005; [Larkin-2010] Plant Dis
  doi:10.1094/PDIS-03-10-0172; [Larkin-2011Phyto] Phytopathology
  doi:10.1094/PHYTO-04-10-0100; [Larkin-2011PD] Plant Dis
  doi:10.1094/PDIS-09-10-0670; [Larkin-Halloran-2014] Am J Potato Res
  doi:10.1007/s12230-014-9366-z; [Larkin-2017] Plant Pathol
  doi:10.1111/ppa.12584; Larkin 2024 Agronomy (2019-2022 results); [Griffin-2009]
  Am J Potato Res doi:10.1007/s12230-008-9050-2; [Olanya-2009] J Gen Plant Pathol
  doi:10.1007/s10327-009-0175-z; [Mallory-Porter-2007] Agron J
  doi:10.2134/agronj2006.0105; Halloran et al. 2005 Am J Potato Res (rotation
  economics); Griffin and Porter 2004 Biol Fertil Soils (soil C and N).
- [ARS-246480] https://www.ars.usda.gov/research/publications/publication/?seqNo115=246480
  (Larkin et al. 2010/2011 Phytopathology summary).
- [ARS-345941] https://www.ars.usda.gov/research/publications/publication/?seqNo115=345941
  (Larkin et al. 2021 Agronomy 11:165 abstract: 14-90%, 11-35%, 27-37%).
- [WSU-CSANR] https://csanr.wsu.edu/potato-cropping-systems-soilborne-disease/
  (qualitative summary of the same Maine systems; compost 20 wet tons/acre).
- [Powelson-1980] Powelson, M.L. 1980. Recent developments in understanding early
  dying of potato vines: the role of Verticillium dahliae.
  https://www.nwpotatoresearch.com/images/documents/MaryLPowelson1980.pdf .
- [PED-review-2025] Al-Mughrabi, Poirier and Khabbaz 2025, Biology (Basel). Status and best management practices of potato early dying
  disease in New Brunswick, Canada (2025). https://pmc.ncbi.nlm.nih.gov/articles/PMC12109294
  (first 100,000 characters read).
- [PNW-Vert] PNW Plant Disease Handbook, Potato Verticillium wilt.
  https://pnwhandbooks.org/plantdisease/host-disease/potato-solanum-tuberosum-verticillium-wilt-potato-early-dying .
- [UMaine-2440] Johnson and Lambert, Common Scab Disease of Potatoes, Bulletin #2440.
  https://extension.umaine.edu/publications/2440e/ .
- [Cornell-scab] Cornell, Potato scab.
  https://www.vegetables.cornell.edu/pest-management/disease-factsheets/potato-scab .
- [ME-Cost-2008] Maine Potato Industry Cost of Production Study, final report 2008.
  https://www.mainepotatoes.com/wp-content/uploads/2020/11/Potato-Cost-Study-08-Final-Report.pdf .
- [Idaho-BUL917] Eborn, B. Potato Cost of Production for Idaho 2016, BUL 917.
  https://content-hub.uidaho.edu/api/public/content/9cb246490a6e49eb83f74dc1e2d1710c?v=65ba4a83 .
  Table A-1.
- [WSU-TB67E] 2019 Cost Estimates of Producing Fresh and Processing Potatoes in
  Washington, TB67E. https://wpcdn.web.wsu.edu/cahnrs/uploads/sites/5/2020/06/TB67E.pdf .
- [Cornell-1985] Warner 1985. Enterprise budgets for potatoes... Long Island, A.E.
  Res. 85-12. https://labs.aap.cornell.edu/sites/aap-labs/files/2022-10/Warner_1985b_full.pdf .
- [Idaho-CIS1196] Wharton and Wood 2013. Early blight biology and control in
  potatoes, CIS 1196. https://objects.lib.uidaho.edu/uiext/uiext32089.pdf .
- [UMaine-5087] UMaine Bulletin #5087, Early Blight of Potatoes and Tomatoes.
  https://extension.umaine.edu/ipm/ipddl/publications/5087e/ .
- [UW-AgWeather] UW AgWeather potato thermal models.
  https://agweather.cals.wisc.edu/thermal-models/potato .
- [METOS] METOS disease models, potato. https://metos.global/en/disease-models-potato/ .

Tried and could not open (blocked, 403, 404, paywall or certificate): APS
journals PDFs (Nolte et al. 2004 Plant Dis 88:248; Larkin et al. 2011
Phytopathology and Plant Dis PDFs; Rowe and Powelson 2002 Plant Dis 86:1184;
Pscheidt and Stevenson 1986 Plant Dis 70:915; the 1999 PLRV Russet Norkotah
paper), all behind a bot wall; MDPI direct pages (Larkin 2021 Agronomy 11:165
full text, Larkin and Lynch 2018 Horticulturae 4:37, Viruses 12:1430 direct),
access denied (the Viruses paper was read via Europe PMC instead); ScienceDirect
topic pages (403); ResearchGate (403); Wiley (Larkin 2017 full text, 403);
Springer BF02853435 (login redirect); NDSU "Management of soilborne diseases of
potato" PDF (404); potatobeetle.org over HTTPS (expired certificate; read over
HTTP instead); the Maine 2024 certification PDF (served an HTML error page; 2019
and 2025 editions used instead).

---

## 4. Unconfirmed items and gaps

Unconfirmed (seen only in search snippets, or from memory):

- Hare 1980 mid-season point "70% defoliation -> 20% loss" (cited by Weiler et
  al. 2025). The 64% endpoint is confirmed from the abstract.
- Cranshaw and Radcliffe 1980 details ("10 or 33%" recovered, "67%" slight),
  from a search abstract.
- Mailloux et al. 1988 emergence: the accumulation start date and the
  56-day spread; first emergence 68 DD°C is confirmed via EPPO.
- MOFGA's 10% defoliation adult rule, and the Presque Isle research thresholds
  (1 adult, 8 small or 3 large larvae per plant; Dwyer et al. 1997).
- Registration years for pyrethroids on potato, Bt tenebrionis, spinosad,
  abamectin, ledprona (Calantha); the 1972 US DDT ban (memory).
- Nolte et al. 2004 healthy-yield baseline (needed to turn 0.18 t/ha per 1%
  into a per-plant fraction); I used the published 30% per-plant lower bound
  instead.
- Bangladesh three-generation PVY degeneration figures; the "±30% loss from seed
  degeneration" attribution to Thomas-Sharma et al. 2016; Hamm et al. "1% seed
  PVY gives about 15% current-season infection".
- Blackleg increasing with seed generation as the reason for Maine's 2016 rule
  change (legislative testimony snippet).
- When Maine's one-acre certified-seed requirement took effect.
- NDSU: V. dahliae 2- to 4-fold higher under 2-year rotation; 8 propagules/g
  threshold (PDF returned 404).
- Larkin and Honeycutt 2006 "9-12% yield increase over continuous potato"
  (secondary citation; the Europe PMC abstract does not give it).
- P-day formula typesetting (reconstructed from a garbled page; structure and
  thresholds confirmed, the 1/24 and 5/8/8/3 weights confirmed only through the
  garbled text and the 10-per-day maximum).

Gaps (nothing found; the model above marks these INVENTED):

- CPB egg-to-adult survival and per-application kill fractions.
- CPB overwinter survival under Aroostook snow cover; the two sources disagree
  (26% vs about 70%).
- A quantitative resistance-evolution rate per spray; only the imidacloprid
  timeline (about 10 years from 1995 to field failures in southern Maine) and
  the 4-year persistence anchor it.
- Verticillium build-up rate under Maine conditions; only Oregon rates and the
  qualitative "after four full rotation cycles" in Maine.
- How much soil organic matter raises available water (needed to route the OM
  effect through the water balance); belongs to the soil-water slice.
- Roguing efficacy against PVY spread.
- A Maine certified-seed price series; the 1.8 ratio comes from New York, Idaho
  and Washington budgets.
- Rhizoctonia stem canker effect on stand and yield as a separate number; the
  Larkin yield factors include it implicitly, so the model above does not add
  it separately.
- Early blight in-season progression and its interaction with leaf wetness; only
  the trigger and the loss ceiling are sourced.
