# 06 - Economics and recorded ground truth (Maine potatoes, 1973-2025)

Research slice: recorded yields, acreage and prices for Maine; the within-year price pattern; fresh, processing, seed and cull prices; per-acre costs by era; land, rent and debt; and how the game should present money across 50 years.

Companion data file: `data/records/maine_potato_nass.csv` (53 rows, 1973-2025, every value confirmed; see section 1.1).

How this was done: every number below was read from a document or database extract that I downloaded and opened during this session (NASS statistical bulletins, NASS annual summaries, NASS QuickStats, BLS CPI, USDA ERS and AMS reports, a Maine Potato Board study, two university papers). Numbers I computed from those records are marked **derived**. Rules I propose that no source states are marked **invented**. Items I could not open are listed in section 4.

---

## 1. What the simulation should implement

### 1.1 The ground-truth record (validation target)

**File:** `data/records/maine_potato_nass.csv`, columns `year,yield_cwt_per_acre,price_usd_per_cwt,planted_acres,harvested_acres,source_url`.

- **Coverage:** every year 1973-2024 is confirmed (52 of 52), plus 2025 (first published September 2026; NASS may still revise it in September 2027). There are no blanks.
- **What the numbers are:** Maine, all potatoes, State level, NASS final estimates. Yield = production / harvested acres (cwt/acre). Price = marketing-year (season) average price received by growers for all uses and all methods of sale, nominal $/cwt.
- **Double confirmation:** for 52 of the 53 years, I transcribed planted acres, harvested acres, yield and price from the NASS document named in `source_url`. I then compared them programmatically with a fresh NASS QuickStats extract. There were **0 mismatches** across 208 values. QuickStats production equals harvested acres x yield exactly for every year 1973-2025.
- **1983:** the one year confirmed only from QuickStats. The final-estimates bulletin for 1982-87 (Statistical Bulletin 799) is not on ESMIS. The 1978-82 bulletin (SB 709) prints a *preliminary* 1983 figure (planted 95.0, harvested 94.0 thousand acres, yield 235, production 22,090 thousand cwt, no price). The final in QuickStats is 95,000 / 94,000 acres, yield 240, price $6.25, and the CSV uses the final.
- **1984-1986:** read from the scanned September 1986 and September 1987 "Potatoes" annual summaries (page images, read visually), and agree with QuickStats.
- **Revisions:** where NASS revised a year, the CSV uses the latest published value. Example: the September 2014 annual summary gives 2011 as 57.0/54.0 thousand acres and 14,310 thousand cwt. SB 1047 (November 2014, after the 2012 Census review) gives 58.0/55.0 and 14,575, and QuickStats agrees with SB 1047.
- **Documents per year** (all open at the URL in the CSV):

| Years | Document |
|---|---|
| 1973 | NASS SB 583, Potatoes and Sweetpotatoes 1969-75 (scanned, OCR text layer) |
| 1974-1977 | NASS SB 645, Potatoes and Sweetpotatoes 1974-78 |
| 1978-1982 | NASS SB 709, Final Estimates 1978-82, Preliminary 1983 |
| 1983 | NASS QuickStats (final; see above) |
| 1984 | NASS "Potatoes", released 26 Sep 1986 (pp. 8-9, page images) |
| 1985-1986 | NASS "Potatoes", released 25 Sep 1987 (pp. 10-13, page images) |
| 1987-1991 | NASS SB 901, Final Estimates 1987-92 |
| 1992-1996 | NASS SB 962, Final Estimates 1992-97 |
| 1997-2002 | NASS SB 998 |
| 2003-2007 | NASS SB 1015 |
| 2008-2012 | NASS SB 1047 |
| 2013-2025 | NASS Potatoes Annual Summaries (Sep 2016 through Sep 2026; each year taken from the latest summary that prints it) |

**Facts in the record that the model should reproduce (derived from the CSV):**

- Yield trend (OLS, 1973-2025): **+1.78 cwt/acre per year**, from a fitted 230 cwt/acre in 1973 to 320 in 2024. The residual standard deviation is **20 cwt/acre (about 7%)**. The worst year below trend is 2020 (265, residual -49). The best above trend are 2022 (355, +38) and 1992 (300, +36).
- Era means:

| Era | Mean yield (cwt/ac) | Range | Mean price, nominal $/cwt | Mean price, 2024 $ (CPI-U) | Mean harvested acres |
|---|---|---|---|---|---|
| 1973-1982 | 239 | 210-260 | 4.67 | 23.63 | 117,400 |
| 1983-1992 | 265 | 230-300 | 5.50 | 14.66 | 84,700 |
| 1993-2002 | 264 | 220-285 | 6.41 | 12.42 | 69,700 |
| 2003-2012 | 282 | 260-310 | 8.78 | 13.13 | 57,560 |
| 2013-2024 | 317 | 265-355 | 11.69 | 13.99 | 50,950 |

- Price volatility: coefficient of variation of nominal price 0.40; standard deviation of the year-to-year log change **0.31**. Big swings are normal: 1973 $7.25, then 1974 $2.90; 1985 $2.80, then 1986 $6.00.
- Harvested/planted ratio: 0.94-1.00 (median about 0.99). The lowest years are 1990 (0.938), 1984 (0.947) and 2011 (0.948).
- In 1973 the price ($7.25 nominal) is **$51/cwt in 2024 dollars**. The real price fell by roughly two thirds from the 1970s to the 1990s and has been flat in real terms since about 1995 ($12-15 in 2024 dollars).

**Validation rule (invented, for the build/verify stage):** run the game's crop model for each season 1973-2025 with "typical management" on its reference field, and compare the simulated State-average yield to the CSV. Targets: the era means within about 5%, a positive correlation of detrended anomalies with NASS, and the known bad years low (1973 210, 1975 220, 1991 230, 1995 220, 2020 265). NASS yield is a State average over all farms and varieties, so a single well-managed field should run somewhat above it. The comparison target is the *anomaly pattern*, not the level.

### 1.2 Price the player receives

Recommended structure (the multipliers are sourced; the product form is **invented**):

```
price(year Y crop, sale month m, market k, grade g)
  = P_MY(Y)                 # Maine season-average price for crop year Y, from the CSV
  x S(m)                    # seasonal index for the month of sale (table below)
  x K(k)                    # market multiplier: table/fresh, processing contract, seed
  x G(g)                    # grade: US No.1 = 1.0; culls/low grade = flat cull price (below)
```

**S(m), Maine seasonal index (derived).** Monthly price / season-average price of the crop being sold. Maine crop years 1979-2013 (n = 35), NASS monthly prices received (QuickStats; 1978-79 also in SB 709):

| Month sold | Crop | Mean | Median | Min | Max | n |
|---|---|---|---|---|---|---|
| Aug | new crop Y | 0.966 | 0.926 | 0.81 | 1.27 | 15 |
| Sep | Y | 0.887 | 0.820 | 0.68 | 1.34 | 29 |
| Oct | Y | **0.878** (harvest low) | 0.866 | 0.74 | 1.07 | 34 |
| Nov | Y | 0.922 | 0.935 | 0.73 | 1.05 | 34 |
| Dec | Y | 0.962 | 0.977 | 0.81 | 1.06 | 34 |
| Jan | Y (stored) | 0.983 | 0.991 | 0.82 | 1.10 | 35 |
| Feb | Y | 1.015 | 1.013 | 0.84 | 1.14 | 35 |
| Mar | Y | 1.062 | 1.064 | 0.91 | 1.21 | 35 |
| Apr | Y | **1.105** (spring high) | 1.098 | 0.83 | 1.30 | 35 |
| May | Y | 1.099 | 1.096 | 0.81 | 1.41 | 35 |
| Jun | Y | 1.039 | 1.034 | 0.82 | 1.28 | 26 |
| Jul | Y (old crop) | 1.080 | 1.027 | 0.98 | 1.28 | 9 |

- **Check (derived):** weighting this index by Maine's actual monthly marketing shares (below) gives **1.004**. The index therefore reproduces the season average and does not create or destroy money on average.
- April price of the stored crop / the previous October's price (Maine crop years 1980-2013, n = 34; **derived**): mean **1.28**. Only 2 of 34 crops sold for less in April than in October (1984 and 1985). Relative to the season average, though, April ranged from 0.83 to 1.30, so the size of the gain varies widely, and storage cost and shrink (1.4) can eat it.
- For years with real monthly data (Maine 1978-2014, table in 1.6), the game can use the actual monthly prices instead of the index. For 2015 onward NASS withholds Maine monthly prices ("(D)"), so the index applied to the actual season average is the only sourced option.

**Maine monthly marketing shares** (percent of the crop sold in each month, NASS annual summaries; crop years 2011-2016, averaged; **derived**):

| Jul | Aug | Sep | Oct | Nov | Dec | Jan | Feb | Mar | Apr | May | Jun | Jul(next) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 1.2 | 7.2 | 8.8 | 8.8 | 10.5 | 10.5 | 10.0 | 11.0 | 12.3 | 8.3 | 5.8 | 5.5 |

Maine sells most of its crop out of storage: about 74% from December onward. Maine stocks held on December 1 run about 72-79% of production. Examples: 2014 crop 11,600 of 14,645 thousand cwt; 2018 crop 10,900 of 15,035; 2019 crop 12,400 of 16,738 (NASS stocks tables, dated December 1, February 1, April 1 and June 1).

**Early new-crop premium (July-August digging):**
- Maine, August price / October price of the same calendar year: mean **1.10**, median 1.06 (1990-2004, n = 15; Maine sells only about 1% of its crop in August, so NASS often has no August price).
- US fresh potatoes, 1997-2025 (n = 29): July/October **1.32** (median 1.28), August/October **1.44** (median 1.37), September/October 1.15.
- US all potatoes, 1979-2016 (n = 37): June/October 1.44, July/October 1.55, August/October 1.34. This reflects southern summer potatoes and is too high for Maine.
- **Recommendation:** early-dug Maine potatoes sold in August earn **x1.10 of the October price** (Maine data). Allow up to x1.3 in a small table-stock niche, labelled as the US fresh figure. Early digging gives up yield; another slice covers that.

### 1.3 Market, grade and seed multipliers K(k), G(g)

| Market | Multiplier on P_MY | Source / note |
|---|---|---|
| Fresh / table stock | US fresh / all-potato average = **1.27** (2003-2025) | NASS QuickStats, US MY prices |
| Processing (contract) | US processing / all = **0.86** (2003-2025); US fresh/processing ratio mean 1.49 (range 1.02-2.22) | NASS QuickStats |
| Maine, recent | fresh $13.40 vs processing $14.50 (2024); $14.30 vs $13.90 (2025) | NASS QuickStats, Maine (only years published) |
| Seed (certified, sold to other growers) | **1.46 x** same-year commercial price (Maine 1981-88 average: seed $7.08 vs commercial $4.84) | Guenthner et al. 1990, Table 1 |
| Seed (purchase price paid) | US price paid for seed potatoes / previous year's US all-potato price = **1.64** (2002-2014, range 1.56-1.74) | NASS Agricultural Prices via QuickStats |
| Culls / low grade | flat **$1.00/cwt** | ERS AER-491 (Maine, 1980); USDA AMS 2010 report (grower interviews, 2007-08). The same nominal figure 27 years apart. |

- **Recommended rule (derived):** the seed purchase price in spring of year Y = 1.5 x P_MY(Y-1), with a plausible band of 1.1-1.75. Evidence:
  - Maine seed cost $3.50/cwt in 1980, after a $3.25 crop, a ratio of 1.08.
  - $234.08 per acre / 21.28 cwt = $11.00/cwt in 1981, after a $7.25 crop, a ratio of 1.52 (ERS AER-491).
  - The US ratios above.
  - A seed price that follows the previous year's table price is what Guenthner et al.'s regression finds ("seed potato prices and commercial potato prices move together"). Their model is PS = -4.47 + 2.07 PC + 0.091 AC - 0.075 ASC(t-1) + 1.22 D, in prices deflated by the farm prices-paid index.
- **Maine mandatory certified-seed law, effective with the 1981 season:** it raised seed prices by **$1.22/cwt** and, by the authors' regression, yields by **28 cwt/acre** (Guenthner et al. 1990). A seed-source choice in the game can cite this.
- **Grading loss when packing for fresh market:** 20% of the weight out of storage (Maine round whites, 1980; ERS AER-491 Table 10). The culled share is sold at the cull price.
- **Sales mix:**
  - Maine survey farms, 1976: 46% table stock, 34% processing, 20% seed (ERS AER-491 Table 2).
  - Recent NASS: processing 4.3-7.7 million cwt of 13.5-18.4 million produced (2011-2021), i.e. 29-48% (falling from 47-48% in 2011-12 to about 30% by 2019-21).
  - Certified seed: 7,753-10,861 acres a year (2013-2023) out of about 47,000-54,000 planted, i.e. about 15-21% of acres.

### 1.4 Storage economics

- **Storage cost, Maine 1980:** **$0.814/cwt for 6 months**, broken down as follows (ERS AER-491 Table 8).
  - Variable $0.377, including interest on the stored potatoes $0.150.
  - Ownership $0.352.
  - Other $0.084.
  - Maine was the most expensive of the regions studied (eastern Idaho $0.575).
  - **Scale to other years with the PITW index (derived):** cost(Y) = 0.814 x PITW(Y)/1030. For example, $3.12/cwt in 2024. Treat this as an upper-end estimate; no newer Maine storage cost figure was found.
- **Weight loss in storage:** **5.61-6.65% over six months** (Sexauer 1976, citing Smith and Sparks & Summers). The monthly rate is highest at the start and at the end of the season.
- **Recorded shrinkage and loss as a share of Maine production** (NASS disposition tables, 1973-2025 excluding 1983; **derived**):
  - Median **7.9%**, mean 9.1%, range 3.6-25.7%.
  - Era means: 10.3% (1973-82), 10.5% (1984-92), 9.4% (1993-2002), 8.7% (2003-12), 7.1% (2013-24).
  - The extreme years are 1992 (24.4%) and 2004 (25.7%), both large crops with low prices. These include potatoes left unsold or dumped, not only storage loss.
- **Return to storage on the old Maine potato futures market:** averaged 10.67 cents/cwt/month (November-March) at a price level of about $3/cwt (Sexauer 1976). That is about 3.5% per month. It is consistent with the October-to-April index rise of 0.878 to 1.105 (+26%) less storage cost and shrink.

### 1.5 Costs per acre by era

Five Maine data points were found, all opened:

| Year | Total cost $/acre (nominal) | $/cwt | Yield basis | What is included | Source |
|---|---|---|---|---|---|
| 1980 | **835.39** | 3.34 | 250 cwt/acre | Growing and harvesting, round-white table stock, Aroostook. Includes machinery ownership, $40 cash-rent land charge, $20 overhead, 10% management charge. Excludes storage and packing. | ERS AER-491, Table 6 / App. table 1 |
| 1981 | **1,104.23** | 4.42 | 250 | Same budget, updated with price indices and the April 1981 seed price | ERS AER-491, Table 15 |
| 1981 crop | 1,175 | n/a | n/a | Farm Credit (Bob Thompson, "Agrifacts") comparative analysis of farms, quoted in a WAGM-TV 1982 report | WAGM-TV transcript (weak; garbled) |
| 2006 | **2,364** | n/a | 308 (sample avg) | 79 farm records: operating $2,024 + ownership $340 (owner living $170 + capital charge $170) | Maine Potato Board 2008, Table 3 |
| 2007 | **2,322** | n/a | 308 | 77 records: operating $1,964 + ownership $358 | same |
| 2008 (est.) | **3,027** (Table 3; Table 6 gives 3,031) | **9.89** | 306 | 2006-07 costs projected with BLS input-price changes; 101 records; per-farm range $1,775-6,878 (Table 5) | same, Tables 3, 5, 6 |

**Breakdown for the game's line items:**

*1980, Aroostook, per acre (ERS AER-491 Appendix table 1):*
- Seed: 21.28 cwt at $3.50 = $74.48. Seed treatment: 21.28 lb at $1.65 = $35.12.
- Fertilizer:
  - N: 157 lb at $0.375 = $58.88.
  - P: 193 lb at $0.285 = $55.00.
  - K: 209 lb at $0.125 = $26.12.
  - Lime: 0.35 ton at $19.30.
- Pesticides:
  - Fungicide (mancozeb): 15 lb at $1.65 = $24.75 for the season.
  - Herbicide (metribuzin): 0.25 gal at $74.00.
  - Insecticides: about $28.70.
- Fuel and repair: $45.78 preharvest, $63.42 harvest.
- Labor (operator $4.31/h, other $3.57/h): 3.86 h + 2.30 h preharvest, 4.17 h + 12.19 h harvest.
- Desiccant (DNBP): 0.75 gal at $9.75.
- Interest: 12.7% for 6 months on preharvest costs = $25.33.
- Ownership (tractors $29.07, machinery $108.41) = $137.48.
- Other:
  - Land charge (cash rent): $40.00.
  - Potato promotion tax: $4.11.
  - Management charge (10% of total cost excluding land): $72.31.

*2008 estimate, Maine industry average per acre (Maine Potato Board 2008, Table 3):*
- Chemicals $429, fertilizer $418, labor $249, fuel $247, repairs $197, seed $189.
- Depreciation $179, misc. $172, rent/lease $169, interest $127.
- Insurance $82, utilities $76, taxes $68, supplies $64.
- Owner living $193, capital charge $169.

The cash seed line ($189) is low because many growers plant their own seed. The game should charge its own seed at its opportunity value (the commercial price) and purchased seed at the seed price.

**Cost per acre in any year (derived anchors with an invented interpolation):**
- **Deflate the anchors.** Express each anchor in 2007 PITW dollars, using the NASS index of prices paid for production items, interest, taxes and wage rates (PITW, 1910-14 = 100):
  - 1980: 1,766.
  - 1981: 2,151.
  - 2006: 2,550.
  - 2007: 2,322.
  - 2008: 2,614.
- **Define the intensity curve.** Input intensity I(y), in 2007 PITW dollars per acre:
  - 1,960 up to 1980.
  - Rising linearly to 2,495 in 2007.
  - Held at 2,495 after 2007, because no Maine data after 2008 were found (**invented** extrapolation).
- **Convert to nominal:** C(y) = I(y) x PITW(y) / 2178. Results:
  - 1973: about $480.
  - 1985: $1,090.
  - 2000: $1,705.
  - 2015: $3,600.
  - 2024: **$4,520**.
- **Split by category** using the 1980 shares for early years and the 2008 shares (above) for later years.
- **Check against the record:** both surveyed periods had cost per cwt about equal to the season price.
  - 1981: cost $4.42 vs price $4.50.
  - 2008: $9.89 vs $9.75.
  - Over 1973-2025 this curve gives an average Maine farm that roughly breaks even on full economic cost at trend yield, with:
    - windfall years: 1973, 1975, 1980, 1988-89;
    - disaster years: 1985 net about -$290/acre; 2020 about -$540.
  - That is the right shape for a game in which skill and storage timing separate the player from the average.

### 1.6 Land, rent, debt and interest

- **Maine farm real estate value**, $/acre, land and buildings, statewide (NASS land values):

| 1973 | 1980 | 1985 | 1990 | 1995 | 2000 | 2005 | 2010 | 2015 | 2020 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 253 | 594 | 774 | 1,073 | 1,130 | 1,400 | 1,990 | 2,050 | 2,170 | 2,590 | 3,260 | 3,350 |

  Maine *cropland* alone: $4,600 (2025), $4,700 (2026). Earlier cropland values are suppressed ("(S)").
- **Cash rent:**
  - Maine survey farms rented 22% of potato acreage at $24.21/acre in 1976 (ERS AER-491 Table 5). The ERS 1980 budget used $40/acre.
  - NASS statewide non-irrigated cropland rent: $45 (2008), $44 (2010), $48 (2014), $57 (2017), $62 (2019), $60 (2022), $69 (2023), $75.50 (2024), $77.50 (2025); irrigated $145 (2025).
  - Potato farms' rent/lease line, which includes equipment leases, was $169/acre in 2008 (MPB). Recommendation: potato ground rents at about 2x the statewide cropland average.
- **Debt service and capital:**
  - MPB 2008: interest $127/acre/yr (term and credit-line payments) and depreciation $179/acre.
  - MPB capital charge = 5% of machinery value + 7.96% of land and building value, about $169/acre.
  - ERS 1980: interest at 12.7%/yr on operating capital for 6 months and on machinery investment. For the 1981 and 1982 projections ERS moved interest with the Production Credit Association (PCA) rate, which changed by +13.1% (relative) from 1980 to 1981 and +4.1% from 1981 to 1982 (Table 14).
- **Typical commercial farm size:**
  - 268-274 potato acres (MPB 2008 sample, 101 records).
  - About 200 acres in the 1981-88 example (Guenthner et al.).
  - Farms of 15-95 acres had the highest cost per cwt ($12.26 vs $9.89 average).

### 1.7 How to present money across 50 years

**Recommendation:**

1. **Show prices and costs in nominal dollars of the season being played** ("$7.25/cwt" in 1973, "$14.80/cwt" in 2024). These are the numbers in the NASS record, so a player can check the game against history, and "a dollar was worth more then" is part of the period flavour.
2. **Keep the player's money internally in constant 2024 dollars** using the BLS CPI-U U.S. city average, all items, annual average (series CUUR0000SA0, 1982-84 = 100). Convert at display time: nominal = real / factor(Y), where factor(Y) = CPI(2024)/CPI(Y) from the table below. A bank balance carried across years then keeps its purchasing power, and a 1973 windfall stays a windfall in 2024 terms rather than becoming trivial.
3. **Show a "(in 2024 dollars)" line beside the season's totals**, and score runs in constant dollars.
4. **Move farm input costs with the NASS PITW index, not CPI.** Farm input prices rose faster than CPI in 1973-81, 2004-08 and 2021-22, and slower in 1985-87 and 2015-20. Use PITW(Y)/PITW(ref).
5. **Interest on cash or debt:** if the game charges or pays interest, use a nominal rate on nominal balances or a real rate on real balances, never a nominal rate on real balances. No annual farm loan rate series was obtained (section 4). If needed, an **invented** placeholder of real 3-4% on debt is better than a made-up nominal path.
6. **2025 CPI caveat:** BLS published no October 2025 CPI value (the series shows "-"), but the 2025 annual average (321.943) is published, and it is used here.

**CPI-U and PITW factors, plus the Maine price in both measures:**

| Year | CPI-U annual avg (1982-84=100) | CPI factor to 2024 $ | NASS PITW (1910-14=100) | PITW factor to 2024 | Maine price nominal $/cwt | Maine price in 2024 $ (CPI) | Revenue/acre nominal (yield x price) |
|---|---|---|---|---|---|---|---|
| 1973 | 44.4 | 7.065 | 532 | 7.415 | 7.25 | 51.22 | 1,522 |
| 1974 | 49.3 | 6.363 | 605 | 6.521 | 2.90 | 18.45 | 754 |
| 1975 | 53.8 | 5.831 | 665 | 5.932 | 6.05 | 35.28 | 1,331 |
| 1976 | 56.9 | 5.513 | 709 | 5.564 | 4.95 | 27.29 | 1,213 |
| 1977 | 60.6 | 5.176 | 743 | 5.310 | 3.36 | 17.39 | 806 |
| 1978 | 65.2 | 4.811 | 806 | 4.895 | 3.86 | 18.57 | 849 |
| 1979 | 72.6 | 4.321 | 927 | 4.256 | 3.25 | 14.04 | 796 |
| 1980 | 82.4 | 3.807 | 1030 | 3.830 | 7.25 | 27.60 | 1,740 |
| 1981 | 90.9 | 3.451 | 1118 | 3.529 | 4.50 | 15.53 | 1,148 |
| 1982 | 96.5 | 3.251 | 1172 | 3.366 | 3.35 | 10.89 | 854 |
| 1983 | 99.6 | 3.149 | 1176 | 3.355 | 6.25 | 19.68 | 1,500 |
| 1984 | 103.9 | 3.019 | 1195 | 3.301 | 4.30 | 12.98 | 1,032 |
| 1985 | 107.6 | 2.915 | 1157 | 3.410 | 2.80 | 8.16 | 798 |
| 1986 | 109.6 | 2.862 | 1112 | 3.548 | 6.00 | 17.17 | 1,530 |
| 1987 | 113.6 | 2.761 | 1126 | 3.504 | 4.25 | 11.74 | 1,190 |
| 1988 | 118.3 | 2.652 | 1180 | 3.343 | 7.10 | 18.83 | 1,952 |
| 1989 | 124 | 2.530 | 1234 | 3.197 | 7.40 | 18.72 | 2,035 |
| 1990 | 130.7 | 2.400 | 1266 | 3.116 | 6.05 | 14.52 | 1,634 |
| 1991 | 136.2 | 2.303 | 1275 | 3.094 | 5.80 | 13.36 | 1,334 |
| 1992 | 140.3 | 2.236 | 1281 | 3.080 | 5.10 | 11.40 | 1,530 |
| 1993 | 144.5 | 2.171 | 1317 | 2.995 | 6.90 | 14.98 | 1,760 |
| 1994 | 148.2 | 2.117 | 1343 | 2.937 | 6.10 | 12.91 | 1,494 |
| 1995 | 152.4 | 2.058 | 1456 | 2.709 | 6.40 | 13.17 | 1,408 |
| 1996 | 156.9 | 1.999 | 1540 | 2.562 | 4.60 | 9.20 | 1,265 |
| 1997 | 160.5 | 1.954 | 1585 | 2.489 | 6.40 | 12.51 | 1,696 |
| 1998 | 163 | 1.924 | 1528 | 2.582 | 6.45 | 12.41 | 1,806 |
| 1999 | 166.6 | 1.883 | 1516 | 2.602 | 6.35 | 11.96 | 1,810 |
| 2000 | 172.2 | 1.822 | 1578 | 2.500 | 6.15 | 11.20 | 1,722 |
| 2001 | 177.1 | 1.771 | 1627 | 2.425 | 7.65 | 13.55 | 2,027 |
| 2002 | 179.9 | 1.744 | 1628 | 2.423 | 7.05 | 12.29 | 1,868 |
| 2003 | 184 | 1.705 | 1685 | 2.341 | 6.05 | 10.31 | 1,573 |
| 2004 | 188.9 | 1.661 | 1786 | 2.209 | 6.50 | 10.79 | 2,015 |
| 2005 | 195.3 | 1.606 | 1900 | 2.076 | 8.25 | 13.25 | 2,269 |
| 2006 | 201.6 | 1.556 | 2019 | 1.954 | 7.80 | 12.14 | 2,379 |
| 2007 | 207.342 | 1.513 | 2178 | 1.811 | 7.90 | 11.95 | 2,330 |
| 2008 | 215.303 | 1.457 | 2522 | 1.564 | 9.75 | 14.21 | 2,632 |
| 2009 | 214.537 | 1.462 | 2435 | 1.620 | 10.10 | 14.77 | 2,778 |
| 2010 | 218.056 | 1.439 | 2509 | 1.572 | 10.00 | 14.39 | 2,900 |
| 2011 | 224.939 | 1.395 | 2820 | 1.399 | 10.40 | 14.50 | 2,756 |
| 2012 | 229.594 | 1.366 | 2954 | 1.335 | 11.00 | 15.03 | 3,025 |
| 2013 | 232.957 | 1.347 | 3010 | 1.311 | 10.50 | 14.14 | 3,045 |
| 2014 | 236.736 | 1.325 | 3190 | 1.237 | 10.50 | 13.91 | 3,045 |
| 2015 | 237.017 | 1.323 | 3146 | 1.254 | 10.10 | 13.37 | 3,232 |
| 2016 | 240.007 | 1.307 | 2979 | 1.324 | 11.50 | 15.03 | 3,738 |
| 2017 | 245.12 | 1.280 | 2993 | 1.318 | 10.20 | 13.05 | 3,264 |
| 2018 | 251.107 | 1.249 | 3081 | 1.280 | 11.10 | 13.87 | 3,441 |
| 2019 | 255.657 | 1.227 | 3096 | 1.274 | 11.00 | 13.50 | 3,575 |
| 2020 | 258.811 | 1.212 | 3085 | 1.279 | 11.30 | 13.70 | 2,994 |
| 2021 | 270.97 | 1.158 | 3378 | 1.168 | 11.70 | 13.54 | 4,036 |
| 2022 | 292.655 | 1.072 | 3911 | 1.009 | 13.40 | 14.36 | 4,757 |
| 2023 | 304.702 | 1.029 | 3989 | 0.989 | 14.20 | 14.62 | 4,544 |
| 2024 | 313.689 | 1.000 | 3945 | 1.000 | 14.80 | 14.80 | 5,032 |
| 2025 | 321.943 | 0.974 | 4266 | 0.925 | 14.80 | 14.42 | 4,884 |

Where the CPI values come from:
- Pre-2007 CPI values are published to one decimal and 2007+ to three decimals; both are as BLS publishes them.
- I recomputed every annual value from the twelve monthly values and it matched.
- The 2025 annual value is BLS's published figure, built from 11 months.

### 1.8 Maine monthly prices received, actual record (for seasons with data)

Dollars per cwt, all Maine potatoes sold in that calendar month, regardless of crop year. NASS: SB 709 for 1978-79, QuickStats for 1980-2014. "D" means withheld by NASS to avoid disclosing individual operations; a blank cell means not published.

How to read a row:
- Jan-Jul of calendar year Y are mostly sales of crop Y-1 from storage.
- Aug-Dec are crop Y.
- The last column is the season-average price of crop Y.

| Cal. year | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | MY price of that year's crop |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1978 | 3.20 | 3.15 | 2.95 | 3.55 | 4.05 | 4.45 |  |  | 3.25 | 3.60 | 2.90 | 2.80 | 3.86 |
| 1979 | 3.85 | 3.95 | 4.15 | 4.00 | 4.55 | 3.80 |  | 5.00 | 3.00 | 3.55 | 3.55 | 3.45 | 3.25 |
| 1980 | 3.40 | 3.10 | 3.00 | 2.70 | 3.95 | 2.70 |  |  | 5.70 | 5.40 | 5.30 | 6.80 | 7.25 |
| 1981 | 7.70 | 7.70 | 8.65 | 8.25 | 8.55 |  |  |  | 4.35 | 4.15 | 3.75 | 3.85 | 4.50 |
| 1982 | 4.35 | 4.55 | 4.65 | 5.25 | 4.85 | 5.25 |  |  | 4.35 | 3.60 | 2.80 | 2.70 | 3.35 |
| 1983 | 2.75 | 2.80 | 3.05 | 4.35 | 4.30 | 4.30 |  |  | 6.10 | 5.40 | 5.50 | 6.45 | 6.25 |
| 1984 | 6.90 | 6.55 | 6.90 | 6.30 | 5.90 | 5.10 |  |  | 5.60 | 4.50 | 3.95 | 3.80 | 4.30 |
| 1985 | 4.05 | 4.20 | 4.45 | 4.00 | 4.30 | 4.30 |  |  | 3.75 | 3.00 | 2.75 | 2.45 | 2.80 |
| 1986 | 2.40 | 2.70 | 2.55 | 2.85 | 2.90 | 2.90 |  |  | 4.85 | 4.90 | 4.80 | 5.40 | 6.00 |
| 1987 | 5.50 | 6.25 | 6.55 | 7.10 | 7.85 |  |  |  | 4.65 | 4.10 | 4.00 | 3.85 | 4.25 |
| 1988 | 4.05 | 4.50 | 4.60 | 4.50 | 4.20 | 4.20 |  |  | 5.05 | 5.60 | 6.35 | 6.90 | 7.10 |
| 1989 | 6.90 | 7.35 | 8.50 | 9.00 | 10.00 |  |  |  | 5.05 | 5.90 | 6.10 | 7.45 | 7.40 |
| 1990 | 7.80 | 8.40 | 8.95 | 9.05 | 8.40 |  |  | 5.20 | 4.70 | 5.25 | 5.55 | 5.90 | 6.05 |
| 1991 | 6.05 | 6.10 | 6.25 | 6.85 | 8.00 |  |  | 5.80 | 4.90 | 5.00 | 5.45 | 5.70 | 5.80 |
| 1992 | 5.85 | 6.05 | 6.35 | 6.50 | 6.45 |  |  | 6.10 | 5.35 | 5.15 | 4.80 | 5.15 | 5.10 |
| 1993 | 5.15 | 5.25 | 5.45 | 5.45 | 4.15 |  |  | 6.20 | 5.10 | 5.15 | 6.20 | 7.00 | 6.90 |
| 1994 | 7.35 | 7.70 | 8.05 | 7.95 | 6.50 |  |  | 5.65 | 4.85 | 5.25 | 5.70 | 6.00 | 6.10 |
| 1995 | 6.20 | 6.25 | 6.60 | 6.70 | 6.15 | 6.55 |  | 5.55 | 5.25 | 5.85 | 6.25 | 6.25 | 6.40 |
| 1996 | 6.30 | 6.30 | 6.60 | 6.85 | 7.05 | 6.90 |  | 5.20 | 4.70 | 4.90 | 4.35 | 4.35 | 4.60 |
| 1997 | 4.65 | 4.50 | 4.75 | 5.05 | 4.55 | 4.00 |  | 8.10 | 5.65 | 5.70 | 6.10 | 6.30 | 6.40 |
| 1998 | 6.10 | 6.35 | 6.55 | 6.95 | 6.75 | 6.30 |  | 6.25 | 5.40 | 5.70 | 5.85 | 5.90 | 6.45 |
| 1999 | 6.15 | 6.45 | 6.90 | 7.45 | 7.05 | 6.75 |  | 5.80 | 5.30 | 5.45 | 6.35 | 6.45 | 6.35 |
| 2000 | 6.30 | 6.35 | 6.40 | 6.80 | 6.60 | 6.75 |  | 5.80 | 5.45 | 5.50 | 5.55 | 5.60 | 6.15 |
| 2001 | 5.50 | 5.90 | 6.20 | 6.80 | 7.30 | 7.00 | 7.90 | 6.20 | 5.70 | 6.05 | 6.65 | 7.50 | 7.65 |
| 2002 | 7.75 | 8.30 | 8.65 | 9.45 | 8.05 | 7.80 | 7.65 | 5.75 | 5.45 | 5.60 | 6.65 | 6.95 | 7.05 |
| 2003 | 7.10 | 7.10 | 7.45 | 8.10 | 8.15 | 7.40 | 7.15 | 6.00 | 5.25 | 5.45 | 5.85 | 5.70 | 6.05 |
| 2004 | 5.80 | 5.70 | 6.10 | 6.30 | 6.75 | 7.05 | 7.05 | 5.90 | 5.15 | 5.65 | 6.15 | 6.35 | 6.50 |
| 2005 | 5.90 | 6.55 | 6.60 | 6.95 | 7.30 | 7.40 | 7.70 |  | 5.85 | 6.30 | 7.85 | 8.20 | 8.25 |
| 2006 | 8.20 | 8.40 | 8.75 | 9.45 | 9.30 | 8.50 | 8.10 |  | 6.25 | 6.50 | 8.15 | 8.25 | 7.80 |
| 2007 | 8.35 | 7.90 | 7.60 | 8.15 | 8.20 | 8.05 | 7.65 |  | 6.20 | 6.40 | 7.25 | 7.55 | 7.90 |
| 2008 | 7.60 | 8.00 | 8.55 | 8.65 | 9.15 | 8.75 | 8.55 | D | 7.80 | 8.65 | 10.20 | 9.95 | 9.75 |
| 2009 | 9.95 | 10.40 | 11.20 | 10.60 | 9.70 | 9.15 | D | D | D | 8.80 | 9.75 | 9.75 | 10.10 |
| 2010 | 9.90 | 9.95 | 10.50 | 10.90 | 10.90 | 10.20 | D | D | D | 8.00 | 9.35 | 9.45 | 10.00 |
| 2011 | 10.00 | 10.40 | 11.30 | 11.00 | 10.50 | 10.30 | D | D | D | 8.65 | 9.70 | 10.20 | 10.40 |
| 2012 | 10.20 | 11.10 | 11.20 | 12.00 | 11.40 | D | D | D | D | 9.95 | 10.30 | 11.00 | 11.00 |
| 2013 | 10.90 | 10.90 | 11.70 | 12.20 | 12.10 | 10.80 | 11.30 | D | D | 8.80 | 9.75 | 10.70 | 10.50 |
| 2014 | 9.90 | 10.90 | 11.20 | 11.30 | 11.60 | 12.00 | D | D | D | D | D | D | 10.50 |

From 2015 on, NASS withholds every Maine month ("(D)"). NASS publishes no Maine monthly prices for 1973-1977 in the bulletins I opened. For those years the index S(m) is the only option.

---

## 2. Parameter table

| Name | Value | Unit | Source |
|---|---|---|---|
| Maine yield, price, acres 1973-2025 | per year | cwt/acre, $/cwt, acres | `data/records/maine_potato_nass.csv` (NASS bulletins and QuickStats) |
| Yield trend | +1.78 | cwt/acre/yr | derived, OLS on the CSV 1973-2025 |
| Yield residual SD about trend | 20 | cwt/acre | derived |
| Year-to-year log price change SD | 0.31 | - | derived from the CSV |
| Seasonal index Oct (harvest low) | 0.878 | x MY price | derived, NASS Maine monthly 1979-2013 |
| Seasonal index Apr (spring high) | 1.105 | x MY price | derived, same |
| Full seasonal index Aug-Jul | 0.966, 0.887, 0.878, 0.922, 0.962, 0.983, 1.015, 1.062, 1.105, 1.099, 1.039, 1.080 | x MY price | derived, same |
| Maine marketing shares Aug-Jul | 1.2, 7.2, 8.8, 8.8, 10.5, 10.5, 10.0, 11.0, 12.3, 8.3, 5.8, 5.5 | % of crop | NASS annual summaries 2014-2017 (crops 2011-2016), averaged |
| Early-dig premium (Aug vs Oct), Maine | 1.10 (median 1.06) | ratio | derived, NASS Maine 1990-2004 |
| Early-dig premium, US fresh, Jul / Aug vs Oct | 1.32 / 1.44 | ratio | derived, NASS US fresh 1997-2025 |
| Fresh vs all-potato price (US) | 1.27 | ratio | derived, NASS US MY 2003-2025 |
| Processing vs all-potato price (US) | 0.86 | ratio | derived, same |
| Seed sale price vs commercial (Maine 1981-88) | 1.46 ($7.08 vs $4.84) | ratio | Guenthner et al. 1990, Table 1 |
| Seed price paid vs prior-year US price | 1.64 (1.56-1.74) | ratio | derived, NASS Agricultural Prices 2002-2014 |
| Seed price paid, US | 10.9 (2002) to 15.53 (2014) | $/cwt | NASS QuickStats (prices paid) |
| Mandatory seed law effect (Maine, 1981+) | +1.22 $/cwt seed price; +28 cwt/acre yield | - | Guenthner et al. 1990 |
| Seed planting rate, Maine | 21.28 (1976 survey); 20 (1981-88 example); 19.6-24.0, median 21.6 (NASS 1973-2024, derived) | cwt/acre | ERS AER-491 Table 4; Guenthner et al.; NASS disposition / next-year planted acres |
| Cull / low-grade price | 1.00 | $/cwt, nominal | ERS AER-491 (1980); USDA AMS 2010 (2007-08) |
| Grading loss, fresh pack | 20 | % of weight out of storage | ERS AER-491 Table 10 (Maine 1980) |
| Storage cost, 6 months, Maine 1980 | 0.814 | $/cwt | ERS AER-491 Table 8 |
| Storage weight loss, 6 months | 5.61-6.65 | % | Sexauer 1976 (citing Smith; Sparks & Summers) |
| Shrinkage and loss, share of production | median 7.9 (3.6-25.7) | % | derived, NASS disposition tables 1973-2025 |
| Packing and selling cost, Maine 1980 | 1.934 | $/cwt | ERS AER-491 Table 9 |
| Truck Maine to New York, 1980 | 968 per 40,000-lb load (= 2.42 $/cwt) | $ | ERS AER-491 Table 12 |
| Truck Presque Isle to central PA, 2007 | 4.00 | $/cwt | USDA AMS 2010 |
| Total cost, Maine table stock, 1980 | 835.39 (3.34/cwt at 250 cwt) | $/acre | ERS AER-491 Table 6 |
| Total cost, 1981 | 1,104.23 (4.42/cwt) | $/acre | ERS AER-491 Table 15 |
| Total cost, Maine industry, 2006 / 2007 / 2008 est. | 2,364 / 2,322 / 3,027 (9.89/cwt) | $/acre | Maine Potato Board 2008, Tables 3 and 6 |
| Operating cost share 2008 | 2,665 of 3,027 | $/acre | same |
| Input intensity I(y), 2007 PITW $ | 1,960 (to 1980), linear to 2,495 (2007), flat after | $/acre | derived from anchors; post-2008 flat is invented |
| PITW index | 532 (1973) to 3,945 (2024), 4,266 (2025) | 1910-14 = 100 | NASS QuickStats (prices paid) |
| CPI-U annual average | 44.4 (1973) to 313.689 (2024), 321.943 (2025) | 1982-84 = 100 | BLS CUUR0000SA0 |
| Interest rate, operating capital, 1980 | 12.7 | %/yr | ERS AER-491 |
| Cash rent, potato land, 1976 | 24.21 | $/acre | ERS AER-491 Table 5 |
| Cash rent, Maine cropland, non-irrigated | 45 (2008) to 77.50 (2025); irrigated 145 (2025) | $/acre | NASS QuickStats |
| Rent/lease line, potato farms 2008 | 169 | $/acre | Maine Potato Board 2008 |
| Interest paid, potato farms 2008 | 127 | $/acre | same |
| Maine farm real estate value | 253 (1973) to 3,350 (2025) | $/acre | NASS QuickStats (land values) |
| Typical farm potato acreage | 268-274 (2008); 200 (1980s example) | acres | MPB 2008; Guenthner et al. |
| Price flexibility of US fall supply | 2.5-5 (% price change per 1% supply change) | - | Guenthner et al. 1990, citing literature |

---

## 3. Sources (all opened in this session unless stated otherwise in section 4)

**NASS statistical bulletins and annual summaries** (ESMIS, esmis.nal.usda.gov)

1. **NASS SB 583, Potatoes and Sweetpotatoes 1969-75** (scanned PDF with OCR text layer)
   - URL: https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/bc386p63z/12579x518/potatosweetest_Potatoes_and_Sweetpotatoes__1969-75.pdf
   - Read: "Area, yield and production by States, 1973 and 1974 crops": MAINE 138.0, 137.0, 210, 28,770.
   - Read: "Production, farm disposition, season average price ... by States, 1973 crop": MAINE price 7.25.
2. **NASS SB 645, 1974-78**
   - URL: https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/2801pm37k/0r967771w/potatosweetest_Potatoes_and_Sweetpotatoes__1974-78.pdf
   - Read: the "All potatoes: area, yield and production, by States" tables and the farm disposition and price tables for 1974-78.
3. **NASS SB 709, Final Estimates 1978-82, Preliminary 1983**
   - URL: https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/6d5701940/6682x8290/potatosweetest_Potatoes_and_Sweetpotatoes_-_Final_Estimates__1978-82__Preliminary_1983.pdf
   - Read: the state tables, and "Prices received by farmers, monthly and season average, by State" for 1978-82 (Maine monthly 1978-79 used).
4. **NASS "Potatoes", 26 Sep 1986** (image-only PDF; pages 8 and 9 read visually)
   - URL: https://esmis.nal.usda.gov/sites/default/release-files/fx719m44h/8049g7675/ff365778p/Pota-09-26-1986.pdf
   - Read (1984 crop): MAINE 94.0, 89.0, 240, 21,360; price 4.30.
5. **NASS "Potatoes", 25 Sep 1987** (image-only; pages 10-13)
   - URL: https://esmis.nal.usda.gov/sites/default/release-files/fx719m44h/vm40xv302/7p88ck174/Pota-09-25-1987.pdf
   - Read: acreage 1984-86 (94.0/100.0/87.0 planted; 89.0/99.0/86.0 harvested); yield 240/285/255; price 1985 2.80, 1986 6.00.
6. **NASS SB 901, 1987-92** (text)
   - URL: https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/2v23vz553/r781wm69b/potatosweetest_Potatoes_and_Sweetpotatoes_-_Final_Estimates__1987-92.txt
   - Read: state tables; Maine monthly prices 1987-92; stocks by date.
7. **NASS SB 962, 1992-97**
   - URL: https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/nk322j65w/wd3761520/sb962.pdf (text twin `.../st74cv497/sb962.txt`)
   - Read: state tables and monthly prices.
8. **NASS SB 998, 1997-2002**
   - URL: https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/6t053m16p/0p096b869/sb998.pdf (text twin used)
   - Read: state tables and monthly prices.
9. **NASS SB 1015, 2003-07**
   - URL: https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/dz010v35r/zc77sv41s/sb1015.pdf (text twin used)
10. **NASS SB 1047, 2008-12**
    - URL: https://esmis.nal.usda.gov/sites/default/release-files/8p58pc930/fn1072862/zg64tr15d/sb1047.pdf (text twin used)
    - Read: state tables; "Average Prices by estimated sales for the crop year" by type (US fresh/processing; Maine all only); monthly prices 2008-12.
11. **NASS Potatoes Annual Summaries, September 2014 to September 2026** (text versions)
    - URLs: listed in the CSV (`Pota-09-15-2016.txt` ... `pots0926.txt`); release list at https://esmis.nal.usda.gov/publication/potatoes-annual-summary
    - Read: area/yield/production tables; production, seed use, disposition, price and value tables; monthly marketing shares; stocks by date; certified-seed acreage; marketing-year price tables.
12. **ESMIS publication page "Potatoes and Sweet Potatoes - Final Estimates"**
    - URL: https://esmis.nal.usda.gov/publication/potatoes-and-sweet-potatoes-final-estimates
    - Used to find the bulletins. It lists no SB 799 (1982-87).

**Database extracts**

13. **NASS QuickStats**, web interface (no API key needed: POST the form fields to `/uuid/encode`, then GET `/data/spreadsheet/<uuid>.csv`). Extracts, all on 11 Nov 2026:
    - Maine potatoes, all survey items: https://quickstats.nass.usda.gov/results/9E75ACC7-9B7D-35E6-9208-73CD7BCBCACC
    - Maine potato price received (annual and monthly): uuid F82D852B-2B7C-3B44-8E31-324360D806CD
    - US potato price received (all, fall, summer, spring, fresh, processing; monthly): uuid 1F602200-4D16-39D5-AC9D-A9A54099CAAC
    - US prices paid, annual (PITW index and seed potato price paid)
    - Maine land values and cash rents
14. **BLS CPI-U** (series CUUR0000SA0, annual averages 1973-2025)
    - Source: BLS public API v1, https://api.bls.gov/publicAPI/v1/timeseries/data/
    - Response: "REQUEST_SUCCEEDED". The October 2025 value is "-" (not collected).

**Cost studies and economic papers**

15. **Zepp, G.A. "Costs of Producing Potatoes: 1980 and 1981 with Projections for 1982."** USDA ERS Agricultural Economic Report 491.
    - URL: https://ageconsearch.umn.edu/record/307921/files/aer491.pdf
    - Read: Tables 2, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15; Appendix table 1 (Aroostook round-white budget with unit quantities and prices).
16. **Planning Decisions, Inc. "Maine Potato Industry Cost of Production Study, Final Report."** For the Maine Potato Board, 21 Nov 2008.
    - URL: https://www.mainepotatoes.com/wp-content/uploads/2020/11/Potato-Cost-Study-08-Final-Report.pdf
    - Read: Tables 1, 3, 5, 6, 7; methodology for the living and capital charges.
17. **Guenthner, Plissey, Levi, Makus. "The Impact of the Mandatory Seed Law on Maine Potato Acreage, Yield and Price."** Univ. of Idaho A.E. Research Series 90-5, May 1990.
    - URL: https://ageconsearch.umn.edu/record/305065/files/aers169.pdf
    - Read: seed price equation; Table 1 (1981-88 averages); note that the NASS state seed potato price series was discontinued in 1985.
18. **Sexauer, B. "The Storage of Potatoes and the Maine Potatoes Futures Market."** Univ. of Minnesota Staff Paper P76-30, 1976.
    - URL: https://ageconsearch.umn.edu/record/13950/files/21082.pdf
    - Read: storage cost discussion; weight loss 5.61-6.65% over 6 months; return to storage 10.67 cents/month.
19. **Berney and Grajewski. "Marketing Maine Tablestock Potatoes."** USDA AMS, February 2010.
    - URL: https://www.govinfo.gov/content/pkg/GOVPUB-A88-PURL-gpo24974/pdf/GOVPUB-A88-PURL-gpo24974.pdf
    - Read: culls offered about $1.00/cwt vs $7.26 six-year Maine average; tablestock $2-3/cwt above the all-potato average 2006-08; trucking $80/ton ($4.00/cwt) to central PA in 2007.
20. **WAGM-TV, "Throwback Thursday - Cost of Potato Production"** (6 Oct 2023 rebroadcast of a 1982 report)
    - URL: https://www.wagmtv.com/2023/10/06/throwback-thursday-cost-potato-production/
    - Read: "$1175 per acre" for the 1981 crop, Farm Credit analysis. A weak, garbled transcript, used only as a cross-check on ERS 1981.
21. **Bangor Daily News reprint on Potato News Today**, 27 Nov 2023
    - URL: https://www.potatonewstoday.com/2023/11/27/maines-potato-farmers-face-ever-rising-costs-impact-on-consumer-prices-looms/
    - Opened: it has no per-acre cost figures. Not used.

---

## 4. Unconfirmed items and gaps

**Could not open:**
- **NASS SB 799** (Potatoes Final Estimates 1982-87): not listed on ESMIS. 1983 therefore rests on QuickStats alone; 1984-86 are double-sourced from the scanned annual summaries.
- **MAFES bulletins B730** (Krofta & Harlan 1977, costs and returns of Maine potato production) and **B701** (Harlan 1973): listed on the UMaine MAFES publications page, but DigitalCommons@UMaine "sunset June 30, 2026" and I found no copy in its replacement or elsewhere.
- **MAFES B834** (Westra & Boyle 1991, rotation economics with a potato enterprise budget) and **TB205** (2011, cost of supplemental irrigation):
  - core.ac.uk returned a bot challenge or 403; the Wayback Machine blocked the request; ResearchGate returned 403.
  - A search summary of TB205 reported per-acre annual irrigation costs from about $769 down to $415 as irrigated acreage grows. **UNCONFIRMED (search summary, not read).**
- **Maine Potato Board "Economic Contribution of Potatoes in Maine" (March 2024)** and its summary: the PDFs returned HTML instead.
- **FRED prime-rate series:** the connection failed. No annual farm loan interest rate series was obtained, so interest rates beyond the ERS 12.7% (1980) and the PCA changes for 1981-82 are a gap.

**Gaps in the record itself:**
- **No Maine cost-of-production figure after 2008** was found. The 2009-2025 costs in 1.5 are PITW-scaled from the 2006-08 Maine Potato Board study, holding real input intensity flat (**invented** extrapolation). A sensible band for 2024 is $4,500-5,300/acre.
- **No 1970s Maine cost study** was opened (B701/B730 inaccessible). 1973-79 costs are the 1980 ERS budget scaled back with PITW, which assumes 1970s input intensity equal to 1980's (**invented**).
- **Maine monthly prices are not published for 1973-77** (none in the bulletins opened) **or after 2014** (withheld "(D)").
- **Maine fresh vs processing prices** are published only for 2024-2025. Earlier splits use US ratios.
- **Seed potato prices:**
  - Maine prices exist only as the 1981-88 averages in Guenthner et al. and the 1980 and 1981 ERS budget values.
  - The NASS state series (to 1985) and the US price-paid series before 2002 were not obtained.
  - The US series in QuickStats stops at 2014.
- **No Maine-specific monthly storage cost newer than 1980.**
- **Storage shrink** is a two-study range (Sexauer citing Sparks/Smith), plus NASS "shrinkage and loss". The latter mixes storage loss with unmarketed potatoes, so it is not a pure storage-loss rate.
- **2025 values** are NASS's first publication (September 2026) and may be revised in September 2027. QuickStats also carries a **2026 forecast** (52,000 planted, 51,900 harvested, 340 cwt/acre) that is not final and is excluded from the CSV.
- **Interpretation risks:**
  - The early-dig premium for Maine rests on 15 August observations (1990-2004).
  - The seasonal index is a 1979-2013 average and is applied to later years by assumption.
  - The "cost per cwt about equal to price" observation rests on two survey periods (1981 and 2008).
