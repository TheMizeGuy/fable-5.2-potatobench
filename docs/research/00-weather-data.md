# Weather data: Caribou, Maine, 1973-2025

The County runs one season per real year. Each simulated day reads one row of
observed weather for Caribou, Maine (Aroostook County), from
`src/data/weather/caribou.json`. Everything the simulation would otherwise compute
with `exp`, `log`, `sin` or `pow` (relative humidity, solar radiation, day length,
evapotranspiration, blight weather) is computed here and stored as integers, so the
simulation core only adds, compares and looks up.

Rebuild from scratch:

```
node tools/weather/fetch.mjs                          # data/raw/ + data/raw/MANIFEST.json
node tools/weather/build.mjs --date 2026-11-11 --report   # writes caribou.json, refreshes the tables below
node tools/weather/build.mjs --check                  # invariants, plus a byte-for-byte rebuild when data/raw/ is present
```

`build.mjs` refuses raw files whose size or sha256 differ from `MANIFEST.json`, never
reads the clock (the `built` field is the `--date` argument), and produces the same
bytes on every run. The tables between the `GENERATED` markers below are written by
`--report`; edit the prose, not the tables.

## Sources

| Source | What it supplies | Notes |
|---|---|---|
| GHCN-Daily `USW00014607` ([csv](https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00014607.csv)) | tmax, tmin, prcp, snow, snwd | The authority for daily extremes and totals. Observation day is midnight to midnight local standard time. Values carrying a GHCN quality flag (QFLAG) are discarded. Complete for tmax, tmin and prcp from 1973 except one missing row (2025-04-29). |
| ISD-Lite `727120-14607` (`https://noaa-isd-pds.s3.amazonaws.com/isd-lite/data/<YEAR>/727120-14607-<YEAR>.gz`) | hourly temperature, dew point, wind, sky cover, 1-hour precipitation | Fixed-width layout confirmed against NOAA's ISD-Lite format document (`isd-lite-format.pdf`, 2006); `build.mjs` parses by column and cross-checks every line against a whitespace split. The archive stops at 2025-08-27 04 UTC. |
| ISD-Lite `727130-14604`, Presque Isle, 2004-2025 | validation only | 20 km south of Caribou. Used to test the dew-point homogenization. |
| NOAA 1991-2020 monthly normals for `USW00014607` ([csv](https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/USW00014607.csv)) | validation only | Checks the temperature and precipitation arrays against NOAA's published normals. |

ISD-Lite sky cover codes (from the format document): 0-8 are oktas, 9 is "sky obscured
or cannot be estimated", 10-19 are older partial-obscuration and layer-type codes. Wind
direction 0 with speed 0 is calm. Trace precipitation is coded -1.

## Time base

All dates are local standard time, UTC-5, with no daylight saving. ISD-Lite hours are
UTC and are shifted by 5 hours. Array index 0 is January 1; a year has 365 or 366
entries as the calendar says.

The blight period is noon to noon: `wetH` for a date counts the hourly values stamped
13:00 the previous day through 12:00 that day (24 values), so one wet night falls in
one period. ISD-Lite stamps each observation to the nearest whole hour.

## Fields

All array values are integers.

| Field | Unit | Definition |
|---|---|---|
| tmax, tmin | 0.1 C | GHCN-Daily daily maximum and minimum |
| prcp | 0.1 mm | GHCN-Daily precipitation; trace is 0 |
| snow | mm | GHCN-Daily snowfall |
| snwd | mm | GHCN-Daily snow depth |
| wetH | hours, 0-24 | hours with relative humidity of 90 percent or more in the noon-to-noon period ending on that date |
| wetT | 0.1 C | mean air temperature during those hours; -9999 exactly when wetH is 0 |
| rh | percent | mean relative humidity over the calendar day |
| wind | 0.1 m/s | mean wind speed over the calendar day, calms included |
| wdir | degrees 1-360 | speed-weighted vector-mean wind direction (direction the wind blows from); -9999 when no non-calm hour has a direction |
| cloud | oktas x 10 | mean total sky cover over daylight hours; -9999 when there is no daylight observation |
| et0 | 0.1 mm/day | Hargreaves-Samani reference evapotranspiration |
| dayl | minutes | day length |
| q | bits | data quality, below |

Quality bits in `q`:

| Bit | Meaning |
|---|---|
| 1 | tmax or tmin was filled |
| 2 | prcp was filled (set to 0) |
| 4 | humidity for the calendar day, or for its noon-to-noon window, rests on fewer than 18 measured or short-gap-interpolated hourly values |
| 8 | the window had fewer than 18 hours with humidity after all filling, so wetH and wetT were estimated from the day's temperature range and precipitation |
| 16 | the window includes hours whose dew point came from the overnight fill (rule 5) |

`normals.tmax`, `normals.tmin`, `normals.prcp` (0.1 mm per day) and `normals.wetH` are
1991-2020 means by calendar date, smoothed with a 15-day centered running mean that
wraps around the year end. They have 366 slots: slot 59 is February 29 (the mean of
its two neighbours) and slot 60 is March 1 in every year, so in a non-leap year day
index `i >= 59` reads slot `i + 1`. Temperature and precipitation normals use only
reported GHCN values; the wetH normal skips estimated (bit 8) days.

`playable` lists the years in which, from May 1 to October 31, fewer than 5 percent of
days carry bit 8 and fewer than 2 percent carry bit 1. `qa` holds per-year statistics
(defined in `qaFields` inside the JSON) and `method` holds every fitted parameter and
validation result quoted on this page.

## Processing rules

1. **GHCN quality control.** A GHCN value with any QFLAG is treated as missing.
   Since 1973 this removes only a handful of snow values.
2. **Missing tmax or tmin** (bit 1): taken from the ISD-Lite hourly maximum or minimum
   of that local day when at least 18 hourly temperatures exist, corrected by the mean
   offset between GHCN extremes and hourly extremes (fitted on every day with 24
   measured hours; values under "Fitted rules and validation"); otherwise the date's
   normal. If a filled value would cross the other extreme, it is set equal to it.
3. **Missing precipitation** (bit 2): 0. Missing snowfall: 0. Missing snow depth:
   linear interpolation between the nearest reported days.
4. **Short hourly gaps.** Temperature, dew point and sky cover are interpolated
   linearly across runs of up to 3 missing hours (the early years report some
   elements every 3 hours). Longer gaps stay missing, except as in rule 5.
5. **Overnight dew-point fill (not in the original brief).** In 1973-1979 and
   1983-July 1996 the station reported no dew point between about 22:00 and 05:00
   local time; temperature was still reported (hourly, or 3-hourly in 1973-1976). The
   full ISD records checked for 1990 carry only temperature and precipitation in those
   hours, so the gap is in the source, not in the ISD-Lite subset. Those are the hours
   when the air saturates, so leaving them missing would undercount wet hours in 21
   seasons and turn those years into artificially blight-free ones. Instead, for any dew-point gap of 4
   to 12 hours with temperature known throughout, the dew point is interpolated
   linearly between the two reports around the gap and capped at the air temperature
   (dew point is nearly conserved overnight, and when the air cools to it, dew or fog
   forms and the two fall together). The fill was tested by deleting 22:00-05:00
   dew points from every night of 1997-2024 and refilling them; results are in
   "Fitted rules and validation". Windows that use filled hours carry bit 16, and the
   calendar days carry bit 4.
6. **Dew-point homogenization (not in the original brief).** The station's humidity
   sensor drifts. The test: during steady rain (at least 1.0 mm in the hour, air
   temperature at least 2 C) the air at screen height is close to saturation, so the
   mean dew-point depression in rain hours shows how far the hygrometer reads from
   saturation, whatever the weather of that year. At Caribou it ranges from 0.43 C to
   2.36 C between years. In 2015 and 2018-2021 not one of the 988 rain hours was
   reported saturated; in 2015 and 2017-2021 no June-August day reached 97 percent RH;
   and the raw Blitecast totals fall to 1-3 per season in 2019-2021. Presque Isle's
   sensor read dry in different years (2004-2015, mostly healthy from 2016), which
   marks the drift as a sensor fault rather than weather.
   Method: per calendar year, the mean rain-hour depression `dd` (from measured hours
   only) is compared with a reference, the median `dd` over the years whose sensor
   still reported saturation in at least 20 percent of rain hours. When `dd` differs
   from the reference by more than twice its standard error, every measured dew point
   of the year is shifted by `dd - reference` (capped at the air temperature) before
   any interpolation, fill or RH calculation; smaller differences are left alone,
   because the reported temperatures move in steps of 1 F (0.56 C) and a sub-step
   shift only flips hours that sit on the 90 percent line. The shift is stored per
   year in `qa.tdAdj` and the uncorrected season severity in `qa.sevRaw`.
   Validation: season severity totals at Caribou and at Presque Isle, each
   homogenized against the same reference, go from uncorrelated to clearly correlated
   (numbers under "Fitted rules and validation"). A coarser check, not used in the
   calibration: the share of June-August days whose RH reaches 97 percent rises from
   0-14 percent to 42-70 percent in the drifted years 2010-2024, against 34-49 percent
   in the unshifted years 1998-2001, 2003 and 2009 (this share also moves in 1 F
   steps). Limits: one shift per calendar year, so a sensor swap during a season is
   averaged; the shift is calibrated near saturation and also moves the drier daytime
   hours, which affects `rh` slightly.
7. **Relative humidity** is computed for each hour from temperature and dew point with
   the Magnus formula over water, `RH = 100 exp(17.625 Td / (243.04 + Td) - 17.625 T /
   (243.04 + T))` (Alduchov and Eskridge 1996), capped at 100.
8. **wetH and wetT.** A window with all 24 hours counts its hours with RH of 90
   percent or more. A window with 18 to 23 hours scales the count to 24 hours (missing
   hours take the window's wet share). A window with fewer than 18 hours is estimated
   (bit 8) from a lookup table fitted on every fully observed window (24 measured or
   short-interpolated hours): season (April-October or November-March), the
   precipitation class of the wetter of the two calendar days the window touches, and
   the day's temperature range. The table gives the mean wetH of the cell and the mean
   of (wetT - tmin); cells with fewer than 20 training days use the season and
   precipitation mean. The table and its cross-validated error are in "Fitted rules
   and validation". This mostly affects July 1996 and September-December 2025.
9. **rh, wind, wdir.** rh is the mean over the calendar day of all hours with RH
   (including filled ones). wind is the mean of the reported hours; when some hours are
   missing, that mean is scaled by the month's climatological ratio between the
   full-day mean and the mean over the same hours (the early years lack the calm
   overnight hours, which otherwise inflates their daily wind by about 13 percent in
   summer). wdir is the direction of the speed-weighted resultant vector of all non-calm
   hours. A day with no hourly data takes the 1991-2020 smoothed climatology for rh and
   wind and -9999 for wdir and cloud.
10. **cloud.** Codes 0-8 are oktas, 9 (obscured) counts as 8 oktas, 10-19 are treated
    as missing (only 10, partial obscuration, occurs, 18 times). Daylight means the sun
    is above the horizon at the observation hour, from FAO-56 equations 31-33 (solar
    time angle with the equation of time, standard meridian 75 W). From 2013 the hours
    between the 3-hourly synoptic reports carry sky cover mostly when it is clear, so
    without rule 4 the May-September daytime mean would read 1.0-1.3 oktas too clear;
    interpolation restores it.
11. **et0** is Hargreaves-Samani, `0.0023 Ra (Tmean + 17.8) sqrt(Tmax - Tmin)` in mm per
    day, with Tmean = (Tmax + Tmin) / 2 and Ra the extraterrestrial radiation from
    FAO-56 equations 21-25 (latitude from the GHCN station record, J = day of year,
    Gsc = 0.0820 MJ m-2 min-1, converted to mm with 0.408), floored at 0. **dayl** is
    FAO-56 equation 34, N = 24 ws / pi.
12. **Blitecast severity** per noon-to-noon day uses the table in
    `BLITECAST_SEVERITY` in `build.mjs`, as given in the brief (a researcher is
    confirming it against Krause, Massie and Hyre 1975). Mean wet-hour temperature
    7.2-11.6 C: up to 15 h = 0, 16-18 = 1, 19-21 = 2, 22-24 = 3. 11.7-15.0 C: up to 12 h
    = 0, 13-15 = 1, 16-18 = 2, 19-21 = 3, 22 or more = 4. 15.1-26.6 C: up to 9 h = 0,
    10-12 = 1, 13-15 = 2, 16-18 = 3, 19 or more = 4. Outside 7.2-26.6 C: 0. It reads the
    stored integer wetH and wetT, so the game can reproduce every total exactly.

## Known inhomogeneities left in the data

- **Cloud.** From 1999 the automated station reports only cloud below about 3.6 km
  (12,000 ft), and the May-September daytime mean drops from about 5.5 oktas to about
  3.5-4 oktas at that change. Not corrected: there is no reference series to correct
  against. Treat cloud as relative within an era.
- **Wind.** Daily mean wind in 1973-1995 runs roughly 0.5-1.3 m/s higher than after
  the automated station took over, beyond what the overnight scaling explains
  (instrument and siting changes). Not corrected.
- **Temperature.** The arrays are unadjusted GHCN values. NOAA's published normals,
  which include homogenization adjustments, run about 0.2 C warmer in every month.
- **Humidity sensor.** Rule 6 removes the large drift. It cannot remove noise within a
  year, and the 1973-1976 overnight temperatures are themselves interpolated from
  3-hourly reports.

## Fitted rules and validation

<!-- BEGIN GENERATED: fits -->
- Hourly-extreme offsets (GHCN minus the ISD-Lite hourly extreme, 17402 days with 24 measured hours): tmax 0.3 C, tmin -0.4 C.
- Overnight dew-point fill, tested on 1997-2024 (May-October, 5138 days, dew point deleted 22:00-05:00 LST every night and refilled): wetH mean absolute error 0.89 h per day, bias 0.25 h, identical on 56.6 percent of days. Blitecast season totals (22 complete seasons): mean 54.1 measured, bias 0.3, mean absolute error 1.8, Spearman rank correlation 0.982.
- Daily mean wind with the overnight hours (22:00-05:00 LST) deleted on 4650 complete May-October days of 1997-2024: the plain mean of the remaining hours is biased by 0.38 m/s; the diurnal-cycle scaling leaves a bias of 0.00 m/s and a mean absolute error of 0.23 m/s.
- wetH estimation rule, two-fold cross-validation by odd and even years on May-October days (5823 days): mean absolute error 4.26 h, bias -0.32 h, against 5.11 h for always predicting the May-October mean.
- Neighbor check against Presque Isle, ME, ISD 727130-14604 (18 seasons where both stations have at least 95 percent of June 1-September 15 windows): Blitecast season totals correlate at Pearson 0.147 (Spearman 0.011) before homogenization and 0.719 (Spearman 0.545) after; mean absolute difference 31.3 before, 11.7 after.
- Spot check, 1991-2020 from the output arrays: July mean temperature 19.09 C; May-September precipitation 473.1 mm per year.
- Against NOAA's published 1991-2020 monthly normals for the station: largest monthly difference 0.2 C in mean tmax, 0.26 C in mean tmin, 0.1 mm in monthly precipitation (NOAA's temperature normals include homogenization adjustments; these arrays are unadjusted).

| Month | Mean tmax (C) | NOAA | Mean tmin (C) | NOAA | Precip (mm) | NOAA |
|---|---|---|---|---|---|---|
| 1 | -6.39 | -6.22 | -16.55 | -16.33 | 75.0 | 74.9 |
| 2 | -4.57 | -4.39 | -15.57 | -15.33 | 61.4 | 61.5 |
| 3 | 1.12 | 1.28 | -9.34 | -9.11 | 70.5 | 70.4 |
| 4 | 8.52 | 8.72 | -1.65 | -1.44 | 76.0 | 75.9 |
| 5 | 17.05 | 17.22 | 4.99 | 5.22 | 87.9 | 87.9 |
| 6 | 22.12 | 22.28 | 10.13 | 10.33 | 98.8 | 98.8 |
| 7 | 24.89 | 25.06 | 13.29 | 13.50 | 107.5 | 107.4 |
| 8 | 24.13 | 24.28 | 12.07 | 12.28 | 91.6 | 91.7 |
| 9 | 19.46 | 19.61 | 7.51 | 7.72 | 87.3 | 87.4 |
| 10 | 11.61 | 11.78 | 1.91 | 2.17 | 101.4 | 101.3 |
| 11 | 4.00 | 4.17 | -3.77 | -3.56 | 85.1 | 85.1 |
| 12 | -2.68 | -2.50 | -11.14 | -10.94 | 91.5 | 91.4 |

- GHCN values rejected for a quality flag (1973-2025): tmax 0, tmin 0, prcp 0, snow 4, snwd 8. ISD-Lite sky cover codes seen: 0: 117416, 1: 5723, 2: 27015, 3: 4351, 4: 15405, 5: 4562, 6: 19048, 7: 21535, 8: 137902, 9: 5001, 10: 18. Duplicate ISD-Lite hours dropped: 0.

wetH estimation table (estimated wetH / wetT minus that day's tmin):

| Season | Wetter day precip | Range < 4 C | 4-6 | 6-8 | 8-10 | 10-12 | 12-14 | 14-16 | >= 16 C |
|---|---|---|---|---|---|---|---|---|---|
| Apr-Oct | 0 (or trace) | (3 h) | 2 h / +1.5 C | 3 h / +1.4 C | 2 h / +1.4 C | 3 h / +1.9 C | 4 h / +1.8 C | 3 h / +1.4 C | 4 h / +1.5 C |
| Apr-Oct | 0.1-2.4 mm | 7 h / +0.9 C | 6 h / +1.3 C | 6 h / +2.1 C | 6 h / +2.5 C | 5 h / +2.5 C | 5 h / +2.6 C | 5 h / +3.0 C | 4 h / +2.0 C |
| Apr-Oct | 2.5-9.9 mm | 10 h / +1.2 C | 11 h / +1.9 C | 10 h / +2.5 C | 9 h / +3.0 C | 8 h / +3.4 C | 8 h / +3.7 C | 7 h / +3.1 C | 6 h / +3.1 C |
| Apr-Oct | >= 10 mm | 13 h / +1.4 C | 13 h / +2.3 C | 13 h / +3.2 C | 13 h / +3.8 C | 12 h / +4.1 C | 10 h / +4.1 C | 9 h / +3.6 C | 9 h / +3.9 C |
| Nov-Mar | 0 (or trace) | 4 h / +0.9 C | 2 h / +1.3 C | 2 h / +2.1 C | 2 h / +2.7 C | 1 h / +3.8 C | 1 h / +2.6 C | 2 h / +4.0 C | 1 h / +4.1 C |
| Nov-Mar | 0.1-2.4 mm | 7 h / +1.5 C | 5 h / +2.4 C | 4 h / +3.3 C | 3 h / +4.9 C | 3 h / +5.7 C | 3 h / +6.7 C | 2 h / +6.7 C | 3 h / +10.3 C |
| Nov-Mar | 2.5-9.9 mm | 11 h / +1.4 C | 8 h / +2.5 C | 8 h / +4.0 C | 7 h / +5.8 C | 6 h / +7.1 C | 6 h / +9.4 C | 7 h / +10.2 C | 6 h / +13.6 C |
| Nov-Mar | >= 10 mm | 12 h / +1.5 C | 12 h / +3.2 C | 10 h / +5.2 C | 9 h / +6.4 C | 9 h / +6.5 C | 9 h / +9.8 C | 10 h / +10.2 C | 8 h / +13.7 C |

Cells with fewer than 20 training days fall back to the season and precipitation class mean, shown in parentheses.

| Year | Severity with measured overnight dew point | With the overnight fill |
|---|---|---|
| 1999 | 58 | 58 |
| 2000 | 42 | 44 |
| 2001 | 57 | 59 |
| 2003 | 55 | 57 |
| 2004 | 62 | 63 |
| 2005 | 43 | 41 |
| 2006 | 35 | 38 |
| 2007 | 34 | 33 |
| 2008 | 59 | 59 |
| 2009 | 58 | 62 |
| 2010 | 51 | 49 |
| 2011 | 86 | 88 |
| 2012 | 53 | 53 |
| 2015 | 64 | 62 |
| 2017 | 44 | 45 |
| 2018 | 37 | 34 |
| 2019 | 43 | 43 |
| 2020 | 32 | 35 |
| 2021 | 50 | 47 |
| 2022 | 44 | 47 |
| 2023 | 110 | 109 |
| 2024 | 74 | 72 |
<!-- END GENERATED: fits -->

## Dew-point homogenization by year

`Td shift` is the amount added to every measured dew point of the year. "Days
reaching 97% RH" counts June-August days whose highest measured or short-interpolated
RH reaches 97 percent; it is not used in the calibration. In years with the overnight
gap it is computed from daytime and evening hours only. Presque Isle columns appear
where both stations have at least 95 percent of June 1-September 15 windows.

<!-- BEGIN GENERATED: homogenization -->
Reference rain-hour depression: 0.72 C, the median of the 18 years whose sensor reported saturation in at least 20 percent of rain hours (1973, 1976, 1978, 1982, 1986, 1987, 1988, 1989, 1990, 1997, 1998, 1999, 2000, 2001, 2002, 2007, 2008, 2009). A year is shifted only when its depression differs from the reference by more than 2 standard errors.

| Year | Rain hours | Mean T-Td in rain (C) | Standard error (C) | Rain hours saturated % | Td shift applied (C) | Jun-Aug days reaching 97% RH, before % | after % | Severity before | after | Presque Isle severity before | after |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1973 | 161 | 0.67 | 0.08 | 48.4 | 0.00 | 37.0 | 37.0 | 86 | 86 | - | - |
| 1974 | 114 | 2.36 | 0.08 | 0.0 | 1.64 | 0.0 | 27.2 | 1 | 62 | - | - |
| 1975 | 110 | 1.45 | 0.13 | 11.8 | 0.73 | 10.9 | 48.9 | 43 | 76 | - | - |
| 1976 | 185 | 0.84 | 0.06 | 29.7 | 0.00 | 26.1 | 26.1 | 58 | 58 | - | - |
| 1977 | 171 | 1.52 | 0.08 | 5.8 | 0.80 | 13.0 | 44.6 | 53 | 86 | - | - |
| 1978 | 119 | 1.18 | 0.11 | 20.2 | 0.46 | 25.0 | 33.7 | 43 | 53 | - | - |
| 1979 | 174 | 1.13 | 0.06 | 14.4 | 0.41 | 15.2 | 39.1 | 50 | 66 | - | - |
| 1980 | 207 | 1.41 | 0.10 | 17.4 | 0.69 | 56.5 | 83.7 | 49 | 77 | - | - |
| 1981 | 247 | 1.50 | 0.09 | 11.3 | 0.78 | 54.3 | 73.9 | 31 | 64 | - | - |
| 1982 | 176 | 1.17 | 0.10 | 21.0 | 0.45 | 41.3 | 60.9 | 27 | 39 | - | - |
| 1983 | 135 | 1.48 | 0.07 | 2.2 | 0.76 | 8.7 | 45.7 | 21 | 48 | - | - |
| 1984 | 154 | 1.87 | 0.09 | 1.3 | 1.15 | 5.4 | 54.3 | 27 | 79 | - | - |
| 1985 | 121 | 1.73 | 0.14 | 4.1 | 1.01 | 9.8 | 63.0 | 25 | 54 | - | - |
| 1986 | 134 | 0.46 | 0.08 | 64.9 | -0.26 | 47.8 | 47.8 | 73 | 58 | - | - |
| 1987 | 128 | 0.43 | 0.09 | 73.4 | -0.29 | 51.1 | 51.1 | 59 | 48 | - | - |
| 1988 | 135 | 0.61 | 0.11 | 57.8 | 0.00 | 65.2 | 65.2 | 86 | 86 | - | - |
| 1989 | 126 | 0.61 | 0.07 | 34.9 | 0.00 | 23.9 | 23.9 | 43 | 43 | - | - |
| 1990 | 168 | 0.84 | 0.07 | 22.0 | 0.00 | 16.3 | 16.3 | 41 | 41 | - | - |
| 1991 | 144 | 1.09 | 0.09 | 4.2 | 0.37 | 19.6 | 35.9 | 28 | 35 | - | - |
| 1992 | 142 | 1.03 | 0.09 | 9.2 | 0.31 | 15.2 | 47.8 | 46 | 64 | - | - |
| 1993 | 194 | 1.19 | 0.09 | 10.8 | 0.47 | 21.7 | 51.1 | 41 | 61 | - | - |
| 1994 | 147 | 1.26 | 0.09 | 2.7 | 0.54 | 10.9 | 42.4 | 39 | 63 | - | - |
| 1995 | 119 | 1.43 | 0.13 | 8.4 | 0.71 | 10.9 | 50.0 | 20 | 36 | - | - |
| 1996 | 220 | 0.85 | 0.06 | 13.6 | 0.13 | 33.7 | 55.4 | 45 | 68 | - | - |
| 1997 | 176 | 1.08 | 0.13 | 23.3 | 0.36 | 39.1 | 57.6 | 47 | 62 | - | - |
| 1998 | 191 | 0.64 | 0.06 | 32.5 | 0.00 | 41.3 | 41.3 | 52 | 52 | - | - |
| 1999 | 226 | 0.82 | 0.07 | 23.5 | 0.00 | 46.7 | 46.7 | 58 | 58 | - | - |
| 2000 | 198 | 0.70 | 0.06 | 33.8 | 0.00 | 48.9 | 48.9 | 42 | 42 | - | - |
| 2001 | 140 | 0.73 | 0.08 | 35.7 | 0.00 | 39.1 | 39.1 | 57 | 57 | - | - |
| 2002 | 167 | 0.53 | 0.06 | 49.7 | -0.19 | 48.9 | 48.9 | 41 | 35 | - | - |
| 2003 | 230 | 0.76 | 0.04 | 17.4 | 0.00 | 33.7 | 33.7 | 55 | 55 | - | - |
| 2004 | 185 | 0.87 | 0.05 | 12.4 | 0.15 | 34.8 | 76.1 | 46 | 62 | 10 | 61 |
| 2005 | 275 | 0.87 | 0.04 | 8.0 | 0.15 | 12.0 | 50.0 | 28 | 43 | 1 | 33 |
| 2006 | 241 | 1.10 | 0.04 | 3.7 | 0.38 | 5.4 | 47.8 | 25 | 35 | 0 | 67 |
| 2007 | 190 | 0.96 | 0.08 | 20.0 | 0.24 | 8.7 | 37.0 | 26 | 34 | 3 | 56 |
| 2008 | 214 | 0.57 | 0.05 | 38.8 | -0.15 | 53.3 | 53.3 | 68 | 59 | 45 | 97 |
| 2009 | 232 | 0.75 | 0.06 | 22.8 | 0.00 | 42.4 | 42.4 | 58 | 58 | 21 | 75 |
| 2010 | 273 | 1.02 | 0.05 | 6.6 | 0.30 | 9.8 | 53.3 | 41 | 51 | 1 | 43 |
| 2011 | 244 | 1.21 | 0.05 | 2.0 | 0.49 | 10.9 | 47.8 | 57 | 86 | 5 | 69 |
| 2012 | 213 | 1.40 | 0.06 | 0.5 | 0.68 | 3.3 | 56.5 | 23 | 53 | - | - |
| 2013 | 267 | 1.17 | 0.04 | 1.9 | 0.45 | 14.1 | 60.9 | 54 | 76 | - | - |
| 2014 | 231 | 1.37 | 0.05 | 3.0 | 0.65 | 5.5 | 70.3 | 20 | 57 | - | - |
| 2015 | 213 | 1.67 | 0.05 | 0.0 | 0.95 | 0.0 | 69.6 | 14 | 64 | 0 | 53 |
| 2016 | 217 | 1.46 | 0.05 | 0.5 | 0.74 | 2.2 | 62.0 | 17 | 61 | 39 | 57 |
| 2017 | 233 | 1.61 | 0.06 | 0.9 | 0.89 | 0.0 | 55.4 | 17 | 44 | 40 | 53 |
| 2018 | 173 | 1.56 | 0.06 | 0.0 | 0.84 | 0.0 | 42.4 | 16 | 37 | 29 | 38 |
| 2019 | 224 | 1.65 | 0.05 | 0.0 | 0.93 | 0.0 | 48.9 | 2 | 43 | 33 | 47 |
| 2020 | 171 | 2.03 | 0.07 | 0.0 | 1.31 | 0.0 | 44.6 | 1 | 32 | 17 | 56 |
| 2021 | 207 | 2.04 | 0.07 | 0.0 | 1.32 | 0.0 | 58.7 | 3 | 50 | 52 | 52 |
| 2022 | 228 | 1.37 | 0.04 | 0.0 | 0.65 | 2.2 | 56.5 | 10 | 44 | 47 | 47 |
| 2023 | 238 | 1.29 | 0.04 | 0.4 | 0.57 | 7.6 | 57.6 | 58 | 110 | 116 | 116 |
| 2024 | 191 | 1.39 | 0.05 | 1.0 | 0.67 | 4.3 | 65.2 | 37 | 74 | 75 | 75 |
| 2025 | 140 | 1.04 | 0.07 | 7.1 | 0.32 | 35.6 | 69.0 | 30 | 43 | - | - |
<!-- END GENERATED: homogenization -->

## Per-year quality

Percentages of May-October days carrying each quality bit, and the share of the
year's hours with measured temperature and dew point.

<!-- BEGIN GENERATED: quality -->
| Year | Hourly T measured % | Hourly Td measured % | May-Oct bit 1 % | bit 2 % | bit 4 % | bit 8 % | bit 16 % | Playable |
|---|---|---|---|---|---|---|---|---|
| 1973 | 76.7 | 68.4 | 0.0 | 0.0 | 100.0 | 0.0 | 100.0 | yes |
| 1974 | 77.8 | 69.4 | 0.0 | 0.0 | 100.0 | 0.0 | 100.0 | yes |
| 1975 | 77.8 | 69.5 | 0.0 | 0.0 | 98.4 | 0.0 | 100.0 | yes |
| 1976 | 77.2 | 69.0 | 0.0 | 0.0 | 98.4 | 0.0 | 100.0 | yes |
| 1977 | 99.9 | 71.3 | 0.0 | 0.0 | 99.5 | 0.0 | 100.0 | yes |
| 1978 | 99.9 | 71.6 | 0.0 | 0.0 | 98.4 | 0.0 | 99.5 | yes |
| 1979 | 100.0 | 71.5 | 0.0 | 0.0 | 97.8 | 0.0 | 100.0 | yes |
| 1980 | 100.0 | 95.0 | 0.0 | 0.0 | 3.8 | 0.0 | 19.6 | yes |
| 1981 | 100.0 | 95.6 | 0.0 | 0.0 | 0.5 | 0.0 | 15.8 | yes |
| 1982 | 96.9 | 92.6 | 0.0 | 0.0 | 7.6 | 0.0 | 17.4 | yes |
| 1983 | 97.3 | 60.2 | 0.0 | 0.0 | 98.4 | 0.0 | 100.0 | yes |
| 1984 | 99.9 | 68.4 | 0.0 | 0.0 | 98.9 | 0.0 | 99.5 | yes |
| 1985 | 99.9 | 69.4 | 0.0 | 0.0 | 98.9 | 0.0 | 98.9 | yes |
| 1986 | 99.7 | 69.6 | 0.0 | 0.0 | 98.9 | 0.0 | 100.0 | yes |
| 1987 | 99.8 | 69.9 | 0.0 | 0.0 | 95.1 | 0.0 | 97.8 | yes |
| 1988 | 99.9 | 69.5 | 0.0 | 0.0 | 96.2 | 0.0 | 97.3 | yes |
| 1989 | 99.9 | 69.5 | 0.0 | 0.0 | 98.4 | 0.5 | 98.4 | yes |
| 1990 | 100.0 | 69.2 | 0.0 | 0.0 | 99.5 | 0.0 | 99.5 | yes |
| 1991 | 99.9 | 69.3 | 0.0 | 0.0 | 100.0 | 0.0 | 100.0 | yes |
| 1992 | 100.0 | 69.6 | 0.0 | 0.0 | 99.5 | 0.0 | 99.5 | yes |
| 1993 | 100.0 | 69.9 | 0.0 | 0.0 | 100.0 | 0.0 | 100.0 | yes |
| 1994 | 100.0 | 69.9 | 0.0 | 0.0 | 98.9 | 0.0 | 99.5 | yes |
| 1995 | 100.0 | 70.4 | 0.0 | 0.0 | 98.9 | 0.0 | 99.5 | yes |
| 1996 | 97.5 | 82.4 | 0.0 | 0.0 | 48.9 | 15.8 | 33.7 | no |
| 1997 | 99.7 | 99.7 | 0.0 | 0.0 | 0.5 | 0.5 | 0.0 | yes |
| 1998 | 99.8 | 99.8 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 1999 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2000 | 100.0 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2001 | 100.0 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2002 | 99.7 | 99.7 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2003 | 99.6 | 99.5 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2004 | 99.8 | 99.7 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2005 | 99.9 | 99.8 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2006 | 99.9 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2007 | 100.0 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2008 | 100.0 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2009 | 99.8 | 99.6 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2010 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2011 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2012 | 100.0 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2013 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2014 | 99.7 | 99.7 | 0.0 | 0.0 | 0.5 | 0.5 | 0.0 | yes |
| 2015 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2016 | 99.3 | 99.3 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2017 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2018 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2019 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2020 | 99.9 | 99.7 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2021 | 99.9 | 99.7 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2022 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2023 | 99.9 | 99.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2024 | 99.8 | 99.8 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | yes |
| 2025 | 64.2 | 64.2 | 0.0 | 0.0 | 35.9 | 35.9 | 0.0 | no |
<!-- END GENERATED: quality -->

## Sanity table

May 1-September 30 unless noted. Frost dates are the last day before August 1 and the
first day from August 1 on with tmin at or below 0 C. Blitecast severity is the season
total from June 1 to September 15. "Severity without homogenization" is the same total
from the raw dew points (rule 6 skipped).

<!-- BEGIN GENERATED: sanity -->
| Year | Mean temp May-Sep (C) | Precip May-Sep (mm) | wetH May-Sep (h) | Last spring frost | First autumn frost | Blitecast severity Jun 1-Sep 15 | Estimated wetH days in that span | Severity without homogenization |
|---|---|---|---|---|---|---|---|---|
| 1973 | 15.5 | 441.2 | 1336 | 05-08 | 09-21 | 86 | 0 | 86 |
| 1974 | 14.4 | 436.9 | 1116 | 05-21 | 09-24 | 62 | 0 | 1 |
| 1975 | 15.8 | 358.5 | 1150 | 05-10 | 09-15 | 76 | 0 | 43 |
| 1976 | 14.8 | 594.1 | 1062 | 05-05 | 09-03 | 58 | 0 | 58 |
| 1977 | 14.8 | 516.3 | 1201 | 05-09 | 09-25 | 86 | 0 | 53 |
| 1978 | 15.3 | 405.3 | 969 | 05-06 | 09-14 | 53 | 0 | 43 |
| 1979 | 15.8 | 526.0 | 1143 | 05-06 | 09-24 | 66 | 0 | 50 |
| 1980 | 14.7 | 407.2 | 1272 | 05-05 | 09-16 | 77 | 0 | 49 |
| 1981 | 15.5 | 620.5 | 1245 | 05-19 | 10-06 | 64 | 0 | 31 |
| 1982 | 14.9 | 413.8 | 957 | 05-23 | 10-03 | 39 | 0 | 27 |
| 1983 | 15.2 | 473.8 | 1027 | 05-18 | 09-15 | 48 | 0 | 21 |
| 1984 | 14.6 | 490.9 | 1170 | 05-19 | 09-17 | 79 | 0 | 27 |
| 1985 | 14.7 | 371.7 | 1071 | 05-09 | 09-12 | 54 | 0 | 25 |
| 1986 | 13.7 | 428.3 | 1104 | 05-09 | 09-18 | 58 | 0 | 73 |
| 1987 | 14.7 | 391.7 | 1033 | 05-25 | 09-26 | 48 | 0 | 59 |
| 1988 | 15.3 | 355.0 | 1288 | 05-15 | 09-23 | 86 | 0 | 86 |
| 1989 | 15.6 | 457.1 | 1110 | 04-27 | 09-04 | 43 | 1 | 43 |
| 1990 | 15.4 | 489.0 | 875 | 05-24 | 10-04 | 41 | 0 | 41 |
| 1991 | 15.2 | 422.8 | 867 | 05-23 | 09-22 | 35 | 0 | 28 |
| 1992 | 14.8 | 474.9 | 1047 | 05-19 | 09-24 | 64 | 0 | 46 |
| 1993 | 15.1 | 490.0 | 1166 | 05-14 | 09-20 | 61 | 0 | 41 |
| 1994 | 15.0 | 508.8 | 1199 | 05-28 | 10-02 | 63 | 0 | 39 |
| 1995 | 15.5 | 253.6 | 885 | 05-07 | 09-16 | 36 | 0 | 20 |
| 1996 (not playable) | 14.9 | 501.7 | 1171 | 05-16 | 09-27 | 68 | 29 | 45 |
| 1997 | 14.3 | 480.4 | 1180 | 05-09 | 09-22 | 62 | 1 | 47 |
| 1998 | 15.9 | 450.1 | 1075 | 04-28 | 10-06 | 52 | 0 | 52 |
| 1999 | 17.0 | 534.7 | 1040 | 05-15 | 10-04 | 58 | 0 | 58 |
| 2000 | 14.1 | 447.8 | 930 | 05-20 | 09-26 | 42 | 0 | 42 |
| 2001 | 16.2 | 401.2 | 926 | 05-07 | 09-30 | 57 | 0 | 57 |
| 2002 | 14.8 | 450.8 | 1002 | 06-04 | 09-29 | 35 | 0 | 41 |
| 2003 | 15.5 | 476.9 | 1063 | 05-09 | 10-03 | 55 | 0 | 55 |
| 2004 | 14.5 | 452.2 | 1204 | 05-10 | 09-14 | 62 | 0 | 46 |
| 2005 | 15.4 | 476.5 | 1002 | 05-14 | 09-25 | 43 | 0 | 28 |
| 2006 | 15.8 | 489.9 | 1048 | 05-08 | 09-11 | 35 | 0 | 25 |
| 2007 | 14.9 | 366.2 | 850 | 05-22 | 09-17 | 34 | 0 | 26 |
| 2008 | 15.2 | 558.9 | 1080 | 05-03 | 09-18 | 59 | 0 | 68 |
| 2009 | 14.8 | 422.0 | 1029 | 05-19 | 09-17 | 58 | 0 | 58 |
| 2010 | 16.6 | 548.1 | 931 | 05-13 | 10-04 | 51 | 0 | 41 |
| 2011 | 16.0 | 875.7 | 1319 | 05-02 | 10-06 | 86 | 0 | 57 |
| 2012 | 16.4 | 467.0 | 1100 | 05-07 | 09-28 | 53 | 0 | 23 |
| 2013 | 15.6 | 801.2 | 1212 | 05-19 | 10-06 | 76 | 0 | 54 |
| 2014 | 16.1 | 437.7 | 1135 | 05-13 | 09-18 | 57 | 1 | 20 |
| 2015 | 16.4 | 462.1 | 1167 | 04-24 | 09-26 | 64 | 0 | 14 |
| 2016 | 16.4 | 524.1 | 1114 | 05-16 | 09-30 | 61 | 0 | 17 |
| 2017 | 16.2 | 426.9 | 1001 | 04-25 | 09-30 | 44 | 0 | 17 |
| 2018 | 16.6 | 338.0 | 831 | 05-19 | 09-24 | 37 | 0 | 16 |
| 2019 | 15.3 | 406.2 | 969 | 05-28 | 09-18 | 43 | 0 | 2 |
| 2020 | 16.6 | 246.5 | 768 | 06-02 | 09-18 | 32 | 0 | 1 |
| 2021 | 16.6 | 468.9 | 1042 | 05-28 | 10-25 | 50 | 0 | 3 |
| 2022 | 16.1 | 452.5 | 996 | 05-09 | 09-30 | 44 | 0 | 10 |
| 2023 | 16.5 | 543.6 | 1315 | 05-23 | 10-23 | 110 | 0 | 58 |
| 2024 | 17.6 | 425.9 | 1133 | 05-10 | 10-09 | 74 | 0 | 37 |
| 2025 (not playable) | 15.9 | 433.1 | 995 | 05-01 | 09-21 | 43 | 20 | 30 |
<!-- END GENERATED: sanity -->

<!-- BEGIN GENERATED: rankings -->
Ranked among the 51 playable years.

- Highest Blitecast severity totals (June 1-September 15): 2023 (110), 1973 (86), 1977 (86), 1988 (86), 2011 (86), 1984 (79), 1980 (77), 1975 (76)
- Lowest: 2020 (32), 2007 (34), 2006 (35), 2002 (35), 1991 (35), 1995 (36), 2018 (37), 1982 (39)
- Driest May-September: 2020 (246.5 mm), 1995 (253.6 mm), 2018 (338.0 mm), 1988 (355.0 mm), 1975 (358.5 mm)
- Wettest May-September: 2011 (875.7 mm), 2013 (801.2 mm), 1981 (620.5 mm), 1976 (594.1 mm), 2008 (558.9 mm)

Not playable: 1996, 2025.
<!-- END GENERATED: rankings -->

## Where this departs from the brief

- Rules 5 and 6 (overnight dew-point fill, dew-point homogenization) and q bit 16 are
  additions. Without them, the blight weather of 1973-1996 and 2005-2024 would mostly
  measure the state of the humidity sensor.
- Bit 8 is set when a window has fewer than 18 of 24 hours with humidity, not only
  when it has none; windows with 18-23 hours are scaled (rule 8).
- Sky cover is interpolated across short gaps like temperature (rules 4 and 10), and
  wind is scaled for missing hours (rule 9).
- The JSON carries two extra top-level keys, `qaFields` (definitions of the `qa`
  numbers) and `method` (fitted parameters and validation results). `station.lat` and
  `station.lon` are decimal degrees, the only non-integer numbers outside `method`.
- The brief expected 1991-2020 May-September precipitation near 480-520 mm. The arrays
  give 473 mm, which matches NOAA's published 1991-2020 normal for the station (18.63
  in, 473.2 mm), so the expectation was slightly high, not the data.
