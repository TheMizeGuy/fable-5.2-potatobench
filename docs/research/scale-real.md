# Real dimensions of an Aroostook potato farm, for rescaling The County

Research slice: true sizes from primary or authoritative sources, the field-to-building ratios they imply, and what a compressed game world has to keep true. The reference district is Aroostook County, Maine. It is the game's own setting (weather from Caribou, USW00014607), a northern, mostly rain-fed potato district of family farms. One ground unit is taken as one metre.

Evidence tags: **[P]** primary or authoritative source, opened and read this session. **[S]** the source was found but read only through a search-engine summary; treat it as likely, not confirmed. **[M]** measured this session from raw OpenStreetMap geometry (method in section 1.2). **[D]** derived by arithmetic shown here. **[U]** unverified or weak.

Conversions: 1 acre = 4,046.86 m². 1 ft = 0.3048 m. 1 in = 25.4 mm. 1 cwt = 100 lb = 45.36 kg. A Maine potato barrel is 165 lb (74.8 kg).

---

## 0. Headline numbers

| Thing | Real size (m) | Source units | Tag |
|---|---|---|---|
| Typical Aroostook field (median of measured fields of 2 acres or more) | 16.6 acres, about 6.7 ha; about 370 x 180 m at 2:1 | acres | M |
| Interquartile range of field size | 6.3 to 36.2 acres (2.5 to 14.6 ha) | acres | M |
| Small field | 2 acres = 8,094 m², about 127 x 64 m | | D |
| Large field (90th percentile of all polygons) | about 73 acres; a 60-acre field is about 600 x 400 m | | M, D |
| Potato row spacing | 0.86 to 0.91 m | 34 to 36 in | P |
| Seed spacing in the row | 0.18 to 0.30 m (0.41 m for wide-spaced russets) | 7 to 12 in (to 16 in) | P |
| General barn, Aroostook examples | 11 x 12 m to 13 x 32 m | 36.5 x 40 ft to 42 x 106 ft | S, P |
| Farmhouse footprint (measured, rural Caribou to Fort Fairfield) | median 173 m² (about 18 x 11 m, ell included) | | M |
| Whole farmstead (house, barns, yard) | about 1 acre (0.4 ha) | 1 acre | P |
| Mid-size tractor, 1960s to 80s | 3.8 to 4.0 m long, 2.3 to 2.4 m wide, 2.0 m (open) to 3.0 m (cab) high | 151 to 158.5 in | P* |
| Two-row potato harvester | 9.8 to 10.7 m long, 3.1 m wide, 3.4 m high | mm | P |
| Potato barrel | about 0.48 to 0.52 m across, 0.66 to 0.76 m high | 17 1/8 in heads, 64 in bulge; about 19 x 30 in | P, S |
| Mature trees: sugar maple / red maple / paper birch / white spruce | 27 to 37 / 18 to 27 / about 21 / 30+ m | ft and m | P |
| Neighbouring farmsteads along the road (measured) | median 286 m between building groups that include a large outbuilding (IQR 145 to 434 m) | | M |

Ratios a true-scale farm has (section 3), using a 30 m barn and a 150 m² house:

| Field | Size | Field width ÷ barn length | Field length ÷ barn length | Field area ÷ house footprint |
|---|---|---|---|---|
| Small (2 ac) | 127 x 64 m | 2.1 | 4.2 | 54 |
| Game's own 5-acre field | 201 x 101 m | 3.4 | 6.7 | 135 |
| Typical (15 ac) | 300 x 200 m | 6.7 | 10 | 405 |
| Large (60 ac) | 600 x 400 m | 13 | 20 | 1,620 |
| **The game today** | 14 x 11 units | about 1 | about 1 | about 1 |

---

## 1. Fields and farms

### 1.1 Farm size and potato acreage (statistics)

| Measure | Value | Source |
|---|---|---|
| Aroostook farms, 2022 Census of Agriculture | 720 farms, 305,052 acres in farms, **average 424 acres**, 172,979 acres cropland. Potato acres for the county withheld "(D)" | USDA NASS 2022 county profile cp23003 [S]: https://www.nass.usda.gov/Publications/AgCensus/2022/Online_Resources/County_Profiles/Maine/cp23003.pdf |
| Aroostook farms, 2017 | 766 farms, 317,082 acres, average 414 acres; 158 Aroostook farms harvested potatoes | NASS 2017 county profile and Volume 1 Chapter 2 county tables [S]: https://www.nass.usda.gov/Publications/AgCensus/2017/Full_Report/Volume_1,_Chapter_2_County_Level/Maine/ |
| Average Maine potato farm, 1990s | potato acreage per farm rose from **93 to 129 acres**; excluding farms under 15 acres, 152 (1992) to 183 (1997) | Maine Potato Board industry study [S]: https://www.mainepotatoes.com/wp-content/uploads/2020/11/StudyInd.pdf |
| Maine potato farm, 2008 cost study | 268 to 274 potato acres (101 records); farms of 15 to 95 acres had the highest cost per cwt | MPB Cost of Production Study 2008, already in the repo's `docs/research/06-economics-records.md` |
| Mid-1970s | about 1,200 Maine growers on 145,000 to 150,000 acres, **about 120 acres of potatoes per grower** [D] | Wood Prairie Family Farm essays [U, secondary] |
| Recent named Aroostook farms | 180 to 200 acres of potatoes (Bartlett Farms, 2020); 320 acres (Thibeau Farms, Fort Fairfield, 2024); 1,200 acres (Caribou, 2022) | Bangor Daily News, 2020-09-28, 2024-10-03, 2022-04-25 [S] |
| A homestead lot, 1870 | Swedish colony settlers each got a **100-acre lot**. In 1873 the Olsson farm had 6 acres in crops and 3 in grass | NRHP nomination, Anders and Johanna Olsson Farm, New Sweden (96000245) [P]: https://npgallery.nps.gov/NRHP/GetAsset/NRHP/96000245_text |
| Rotation | Potato with small grain dominates; about half the potato acreage rotates with barley and half with oats | DeFauw and Larkin, USDA ARS, NE Potato Technology Forum 2011 [P]: https://www.ars.usda.gov/research/publications/publication/?seqNo115=264649 |

**How many acres of potatoes a farm of about 100 acres grows [D].** On a two-year potato and grain rotation, half the cropland is in potatoes each year. On a three-year rotation, a third is. A farm of about 100 acres, with roughly 80 to 90 acres tillable after the farmstead, woodlot and wet ground, grows **about 30 to 45 acres of potatoes** in two to four fields. That matches the game's six fields of five acres (30 acres in all, `docs/DESIGN.md`) as a small farm of the 1970s and 80s, smaller than the 1990s Maine average of 93 to 129 potato acres.

### 1.2 Field size, measured from raw geometry [M]

No extension bulletin, census table or USDA report found this session gives the size of a potato field, as distinct from a farm, in Aroostook. The census counts farms, not fields. The Yan and Roy (2016) Landsat field-size map of the conterminous US, *Remote Sensing of Environment* 172:67-86 (https://openprairie.sdstate.edu/gsce_pubs/38/), reports a national mean of 0.193 km² (about 48 acres). Its full text was behind a bot check, so I could not get a Maine figure from it.

So I measured fields directly. I took every `landuse=farmland` polygon from OpenStreetMap (Overpass API, fetched 2026-11-11) in the potato belt between Caribou and Fort Fairfield (box 46.70 to 46.85 N, 67.80 to 68.05 W, about 19 x 17 km). For each polygon I computed its area (equirectangular projection at the local latitude, shoelace formula) and its minimum rotated bounding rectangle. The script is at `(working files, not kept in the repository) area.py`.

| Statistic (n = 384 polygons; 328 of 2 acres or more) | Acres | Metres |
|---|---|---|
| All polygons: 10th / 25th / 50th / 75th / 90th percentile | 1.4 / 3.9 / 11.8 / 31.1 / 73.5 | |
| Polygons of 2 acres or more: 25th / **median** / 75th; mean | 6.3 / **16.6** / 36.2; 31.3 | 2.5 / 6.7 / 14.6 ha |
| Area-weighted median (half of all farmland lies in fields at least this big) | 69.9 | 28 ha |
| Bounding rectangle, polygons of 2 acres or more: length 25th / median / 75th | | 286 / **386** / 594 m |
| Bounding rectangle, width 25th / median / 75th | | 120 / **214** / 346 m |
| Count by size: 2 to 5 / 5 to 10 / 10 to 20 / 20 to 40 / 40 to 80 / 80+ acres | 60 / 63 / 67 / 65 / 42 / 31 | |
| Largest | 442 | |

**Caveats.**
- These are fields as volunteer mappers drew them on 2010s and 2020s imagery. Some polygons merge neighbouring fields, which pushes up the top end and the area-weighted median.
- They are modern. Fields have been consolidated since the 1970s, so a 1970s and 80s field would sit toward the lower half of this range.
- A second sample near Easton and Mars Hill had only 12 mapped polygons: median 7.5 acres, 75th percentile 17.5 acres, median rectangle 350 x 139 m. That is consistent but too thin to lean on. Mapping near Houlton returned none.
- Medians of length and width were taken separately, so 386 x 214 m is not itself the median field.

**Corroboration.** One Aroostook grower lost "about 100 feet of the 975-foot-long rows" he had planted in a heavy rain (Bangor Daily News, 2022-04-25 [S]). That is a 297 m row, right on the measured median field length. A 15-acre field with 300 m rows is 202 m wide.

**Conclusion for the slice.**

| Class | Acres | Hectares | L x W in m (rows run the long way) |
|---|---|---|---|
| Small | 2 | 0.8 | 127 x 64 (2:1) |
| Game's design size | 5 | 2.0 | 201 x 101 (2:1) or 174 x 116 (3:2) |
| Typical | 15 to 17 | 6 to 7 | about 300 x 200 |
| Large | 40 to 75 | 16 to 30 | 60 acres = about 600 x 400 |

Strip-cropping context: the national NRCS Stripcropping standard (585) sets strip widths as multiples of the planting equipment width. Missouri's version uses cropped strips of 135 to 150 ft (41 to 46 m) on 1 to 5% slopes (https://www.nrcs.usda.gov/sites/default/files/2022-10/Stripcropping_585_CPS_Oct_2017.pdf [S]). ARS mapped about 4,400 ha of strip-cropped potato field mosaics in Aroostook [P, ARS abstract above]. Strips on a slope are a real local look, and they divide a big field into bands about 40 to 50 m wide.

### 1.3 Rows, hills and passes

| Item | Value | Source |
|---|---|---|
| Row spacing | **34 to 36 in (0.86 to 0.91 m)** | UMaine Extension Bulletin #2412, seed tables at 34 and 36 in rows [P]: https://extension.umaine.edu/publications/2412e/ ; #2419 [P]: https://extension.umaine.edu/publications/2419e/ |
| In-row seed spacing | **7 to 12 in (0.18 to 0.30 m)**. Organic bulletin: 8 to 18 in. NE Vegetable Guide: 12 to 16 in for some russets | #2412 table range; #2419; repo `docs/research/07-practice-place.md` |
| Hills per acre at 36 x 10 in | 17,424 | D |
| Hills in one 300 m row at 10 in | about 1,180 | D |
| Rows across a 200 m wide field | about 219 at 36 in | D |
| Rows per planter pass | **2** on a small farm, 4 on larger ones. Grimme GL 32 = 2 rows at 75 to 90 cm | Grimme product pages [P]: https://products.grimme.com/en/p/gl-32-f |
| Rows per digger or harvester pass | **2** (Grimme GT 170 is the 2-row elevator harvester). Modern large Maine farms run 4-row harvesters | Grimme GT 170 brochure [P]: https://www.grimme.dk/assets/files/pdf/0_Brochurer-til-download/Optagere/UK_GT-170.pdf ; repo `07-practice-place.md` (4-row, MSU P3543) |
| Passes across a typical 200 m field with 2-row tools | about 110 | D |

---

## 2. Buildings, machines, roads, water and trees

### 2.1 Buildings

| Building | Footprint | Height | Source and notes |
|---|---|---|---|
| **Farmhouse** (rural Caribou to Fort Fairfield, measured) | 252 houses: footprint 25th / median / 75th / 90th percentile **127 / 173 / 246 / 304 m²**; median bounding rectangle **18 x 11 m** (often a main block plus an ell) | 1½-storey cape: ridge about 7 to 8 m [D]. 2-storey: about 9 to 10 m [D, at about 2.7 to 3 m per storey plus roof] | [M] OSM building footprints, box 46.72 to 46.84 N, 67.86 to 67.98 W (425 buildings; script `bldg.py` beside the report). Storey counts from NRHP nominations: Olsson house 1½-storey frame [P]; Bradford house 2-storey, five-bay, double-pile, with a 1½-storey ell [P] |
| Early log house, 1871 | 20 x 14 ft (6.1 x 4.3 m) | | Olsson nomination [P] |
| Detached garage (measured) | median 107 m² (11 x 9 m) | | [M] |
| **General barn** | Donovan barn, Houlton, 1925: **36 ft 6 in x 40 ft** (11.1 x 12.2 m) with a potato storage room in its west end, plus an addition 18 ft 6 in x 40 ft (5.6 x 12.2 m). Olsson barn: 57 x 18 ft (17.4 x 5.5 m). Bradford barn (Patten, a mile outside the county): 2½-storey gable-front New England barn, **about 42 x 106 ft (12.8 x 32.3 m)** | 2½-storey gable barn about 42 ft wide: about 11 to 13 m to the ridge [D, at a 12/12 roof pitch over 5 to 6 m walls] | Donovan-Hussey Farms Historic District nomination, Houlton, NRHP 2009 [S: dimensions from the indexed text; only page 1 opened]: https://npgallery.nps.gov/GetAsset/7b413765-4a0a-4c7e-8f84-d99bc2f65e41 . Olsson [P]. Bradford Farm nomination 03000294 [P]: https://npgallery.nps.gov/NRHP/GetAsset/NRHP/03000294_text |
| Large outbuildings (measured) | Untagged buildings over 150 m²: median 305 m² (24 x 14 m), 90th percentile 826 m². The largest in the sample are 2,100 to 2,600 m² (53 x 49, 83 x 42, 85 x 33 m), probably modern potato storages | | [M] |
| **Banked potato house, Aroostook type** | Caribou grower, about 1917: **40 x 60 ft (12.2 x 18.3 m)** | Basement "usually from 8 to 12 feet or more in depth" (2.4 to 3.7 m) below a wooden superstructure. Built "on a sidehill or knoll" so the basement has a ground-level driveway at the rear and the superstructure one at the front | USDA Farmers' Bulletin 847, W. Stuart, *Potato Storage and Storage Houses*, 1917, revised 1930, pp. 15-19 [P]: https://upload.wikimedia.org/wikipedia/commons/b/bd/Potato_storage_and_storage_houses_(IA_CAT87204064).pdf . The same page gives this house's capacity as 4,500 to 5,500 bushels, "several thousand barrels" for most |
| Potato storage, building-plan service | **40 x 140 ft (12.2 x 42.7 m)** overall: a 100 ft storage section with a central driveway and bins, plus a 40 ft work and loadout section. **20,000 cwt** | Arched roof, about 6 to 7 m to the crown [D, read from the plan section] | USDA / LSU AgCenter plan ex. 5989, *Potato Storage 20,000 Cwt Arched Roof*, sheets 2 and 3 [P]: https://www.lsuagcenter.com/portals/our_offices/departments/biological-ag-engineering/extension/building_plans/horticultural/storage/potato-storage-20000-cwt-arched-roof |
| Modern storage | One 2023 building holds 5.5 million lb (55,000 cwt) | | Bangor Daily News, 2023-11-14 [S] |
| **Machine shed** | Plan-service sizes: 24 x 64 ft (7.3 x 19.5 m), 25 x 72 ft, **30 x 60 ft (9.1 x 18.3 m)**, 32 x 92 ft, 42 x 98 ft (12.8 x 29.9 m). Farm shop 32 x 56 ft | Eave about 4 m or more, to clear a 3.0 m cab and a 3.4 m harvester [D] | LSU AgCenter / Cooperative Farm Building Plan Exchange, agricultural storage index [P]: https://www.lsuagcenter.com/portals/our_offices/departments/biological-ag-engineering/extension/building_plans/agricultural/storage |
| **Bunkhouse** (six hired hands) | Federal labor-camp minimum: **50 ft² (4.6 m²) of sleeping floor per occupant**, and 100 ft² (9.3 m²) per person where people cook, live and sleep in one room. Ceiling at least 7 ft (2.13 m). Double bunks at least 48 in apart. For six people: **28 to 56 m²** of floor, for example 6 x 9 m [D] | One storey, about 4.5 to 5 m to the ridge [D] | 29 CFR 1910.142(b) [P]: https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1910/subpart-J/section-1910.142 |
| **Packing shed** | No standard size. Examples: 20 x 20 ft enclosed plus a 10 x 20 ft porch (6.1 x 6.1 m + 3 x 6.1 m); 30 x 60 ft (9.1 x 18.3 m) mixed wash, pack and store shed. Plan-service grading-and-selling stand: 28 x 24 ft (8.5 x 7.3 m) | One storey | UVM Extension case study [S]: https://www.uvm.edu/extension/produceportal/case-studies/new-clean-and-comfortable-washpack-shed ; Cornell Vegetable Program: "packing sheds can be any size" [S]; LSU roadside stand plan [P] |
| **Roadside farm stand** | **8 x 16 ft (2.4 x 4.9 m)** small stand; 28 x 24 ft covered stand; 60 x 30 ft (18.3 x 9.1 m) roadside market | | LSU AgCenter horticultural marketing plans [P]: https://www.lsuagcenter.com/portals/our_offices/departments/biological-ag-engineering/extension/building_plans/horticultural/marketing |
| **Whole farmstead** | "The house and buildings occupy approximately 1 acre" (0.4 ha, about 64 x 64 m) on a 16.4-acre village farm. The driveway to the road is 120 ft (37 m) | | Bradford Farm nomination [P] |

**Potato storage capacity per unit of floor [P, D].**
- FB 847 sizes storage at **40 lb per cubic foot**: a bin 10 ft square filled 6 ft deep holds about 400 bushels, "4 bushels to each square foot" (2.4 cwt/ft²). NDSU AS-1282 gives 48 lb/ft³ for potatoes [S].
- So floor capacity is **0.40 to 0.48 cwt per ft² for each foot of pile depth**. In metric that is 641 to 769 kg/m³, or **14 to 17 cwt per m² for each metre of pile** [D].
- An 8 ft pile holds 3.2 to 3.8 cwt/ft² (34 to 41 cwt/m²). A 12 ft pile holds 4.8 to 5.8 cwt/ft².
- The LSU plan's 20,000 cwt in a 40 x 100 ft section is **5 cwt/ft² (54 cwt/m²)**, which implies a pile about 11 to 12 ft deep [D].
- CIP (Lima) gives 1.5 to 1.6 m³ per tonne, 0.85 t/m² at a 1.3 m pile, and 3.5 to 4 m piles with forced air [S]: http://cipotato.org/wp-content/uploads/2014/09/004729.pdf
- Washington State EM2799 designs floors for 800 lb/ft² under 20 ft piles [S].
- The game's potato house holds 3,600 cwt (`docs/FARMSTEAD.md`). At 8 to 12 ft piles that needs 720 to 1,100 ft² of bin floor, so with a driveway the building is about **9 x 12 m to 12 x 15 m**, the size of the 1917 Caribou house [D].
- Thirty acres at about 300 cwt/acre is 9,000 cwt, which would need a house about 12 x 30 m [D].

### 2.2 Machines and barrels

| Item | Length | Width | Height | Source |
|---|---|---|---|---|
| John Deere 4020 (1964 to 72, about 90 hp, open station) | 151 in = **3.84 m** | 89.6 in = **2.28 m** | 77.9 in = 1.98 m to the steering wheel; 88.75 in = 2.25 m to the exhaust | TractorData (reproduces manufacturer data) [P*]: https://www.tractordata.com/farm-tractors/000/0/6/64-john-deere-4020-dimensions.html |
| John Deere 4440 (1978 to 82, Sound-Gard cab) | 158.5 in = **4.03 m**; wheelbase 2.71 m | 96 in = **2.44 m** | 117.3 in = **2.98 m** to the cab top; 3.26 m to the exhaust | TractorData [P*]: https://www.tractordata.com/farm-tractors/000/0/9/96-john-deere-4440-dimensions.html |
| Two-row potato planter, mounted (Grimme GL 32 F) | 1.81 m (2.58 m with front frame) | 1.79 m | 1.80 m | Grimme [P]: https://products.grimme.com/en/p/gl-32-f |
| Two-row planter, trailed or carried (GL 32 B) | 2.45 m | 2.25 to 2.30 m | 1.90 m | Grimme [P]: https://products.grimme.com/en/p/gl-32-b |
| Two-row harvester (Grimme GT 170 M / S) | **9.80 / 10.73 m** | **3.09 m** | **3.36 m**; 5.96 to 6.73 t | Grimme GT 170 brochure [P] |
| One-row harvester (Grimme SE 75-20), for comparison | 7.90 m | 3.00 m | 3.10 m | Grimme brochure [S] |
| Barrel, US standard for vegetables (Standard Barrel Act 1915, 15 USC 234) | staves 28½ in (0.724 m); **26 in (0.66 m) between heads** | heads 17⅛ in (0.435 m); bulge circumference 64 in, so **about 0.52 m across** [D] | 7,056 in³ (115.6 L) | 15 CFR 241 [S]: https://www.ecfr.gov/current/title-15/subtitle-B/chapter-II/subchapter-D/part-241 ; 38 Stat. 1186 |
| Maine potato barrel as used | "about 19 inches across the top and about 30 inches high" (0.48 x 0.76 m); 165 lb by Maine law | | | Maine Memory Network, Presque Isle harvest pages [S]: https://presqueisle.mainememory.net/page/974/print.html ; R.S. 1954 c.32-A §42 (repo `07-practice-place.md`) [P] |
| Farm barrel truck | A flat-body truck carried **40 barrels**. At 0.5 m per barrel, 4 across by 10 long, the bed is about 2.1 x 5.2 m (a 16 to 17 ft bed) [D] | about 2.3 to 2.4 m | cab about 2.4 to 2.6 m [U] | Maine Memory Network [S]. Ford body guide: a 16 ft body most often sits on a 120 in (3.05 m) cab-to-axle chassis [S]: https://tomsford.com/ford-body-application-guide . Overall about 8 to 8.5 m long [D, U] |
| Horse-era wagon (for scale history) | a drop-axle Taber wagon carried 75 barrels (over 6 tons) | | | Maine Memory Network [S] |

[P*] TractorData is a reference compilation of manufacturer figures, not the manufacturer's brochure. The numbers agree with PartsOnline's 4440 page.

### 2.3 Lanes, roads, walls, pond

| Item | Value | Source |
|---|---|---|
| Farm lane (NRCS Access Road, 560) | One-way: tread **10 ft (3.05 m)** within a 14 ft (4.27 m) roadbed (2 ft shoulders). Two-way: 16 ft tread (4.88 m) within 20 ft (6.1 m). Single-purpose road at least 10 ft. Vermont: 12 ft on the level, 14 ft on curves | NRCS CPS 560, Sept 2020 [S]: https://www.nrcs.usda.gov/sites/default/files/2022-08/Access_Road_560_CPS_9_2020.pdf |
| Field track / headland | No source opened. A headland must turn a 4 m tractor plus a 10 m harvester, so the turn strip is typically 2 to 3 implement lengths, about 10 to 20 m [D, U] | |
| Public gravel road | Maine DEP: gravel roads run "10 to 30 feet wide"; the manual's example road is 12 ft; older roads are one lane, newer ones two. Town ordinances set **18 to 20 ft (5.5 to 6.1 m)** traveled way for low-volume roads, and a gravel private road at 18 ft with 2 ft shoulders in a **50 ft (15.2 m)** right-of-way (Windham) | Maine DEP Gravel Road Maintenance Manual [S]: https://www.maine.gov/dep/land/watershed/camp/road/gravel_road_manual.pdf ; Maine town ordinances via the MaineDOT Local Roads Center [S]: https://www.maine.gov/dot/programs-services/cslr/mlrc/tech/local-road-resources |
| Stone wall | Most New England field walls are about thigh-high, **2 to 3 ft (0.6 to 0.9 m)**. A double wall is about **2½ ft (0.76 m)** wide at the base; "broad walls" about 10 ft (3 m), up to 30 ft | UConn Stone Wall Initiative, R. Thorson [S]: https://stonewall.uconn.edu/investigation/classification/toward-a-stone-wall-taxonomy/classes-within-the-stone-domain/stone-walls/ ; NPR transcript [S] |
| Irrigation need | Typical Maine seasons need **2 to 4 in** applied; August use is 0.18 in/day; pivots apply 0.5 in per pass | UMaine Extension #2439, *Irrigating Potatoes in Maine* [S]: https://extension.umaine.edu/publications/2439e/ |
| Pond design rule | 7 weeks x 1 in = about 0.6 acre-ft of storage per irrigated acre (drought design) | MOFGA pond guide [S]: https://www.mofga.org/resources/water-management/pond-building/ |
| Permitted Maine example | A **7.9-acre impoundment for about 146 acres** of potatoes, 8 applications, 41 acre-ft a season. That is 0.054 acre of pond per irrigated acre | Maine DACF/LUPC permit DP 4982 [S]: https://www.maine.gov/dacf/lupc/signedpermits/dp4982.pdf |
| **Pond for a few fields [D]** | 30 to 45 irrigated acres need **1.6 to 2.4 acres of pond** (0.65 to 1 ha): roughly **80 to 100 m across** if square, or about 120 x 60 m if long. At 0.6 acre-ft/acre and 10 ft mean depth, 30 acres needs 18 acre-ft, about 1.8 acres of surface | from the two rows above |

### 2.4 Trees (mature heights)

| Species | Mature height | Source |
|---|---|---|
| Sugar maple | **27 to 37 m** (90 to 120 ft), 76 to 91 cm d.b.h. | USDA Forest Service, *Silvics of North America* [P]: https://research.fs.usda.gov/silvics/sugar-maple |
| Red maple | **18 to 27 m** (60 to 90 ft) | *Silvics of North America* (Virginia Tech copy) [S]: https://dendro.cnre.vt.edu/dendrology/USDAFSSilvics/1.pdf |
| Paper birch | **about 21 m** (70 ft) in mature stands, 25 to 30 cm d.b.h. | *Silvics* [P]: https://research.fs.usda.gov/silvics/paper-birch |
| White spruce | **over 30 m** (100 ft) on good sites, 60 to 90 cm d.b.h. Site index on average boreal sites is about 22 m at age 70 | *Silvics* [P]: https://research.fs.usda.gov/silvics/white-spruce |
| Balsam fir (the other common conifer) | 12 to 27 m (40 to 90 ft) | USDA FEIS [S]: https://research.fs.usda.gov/feis/species-reviews/abibal |

For a woodlot edge behind the fields, an honest height band is **15 to 25 m**, with occasional maples or spruce to 30 m. A 200 m wide field is therefore 8 to 13 tree heights across [D]. Open-grown and edge trees in northern Maine are often below the forest-stand figures above [U].

### 2.5 Spacing of farmsteads along the road [M]

- In the same rural box (122 km² between Caribou and Fort Fairfield), I grouped OSM buildings that lie within 80 m of one another.
- That gave 196 building groups, **1.6 per km²**.
- Nearest-neighbour distance between groups: 25th / median / 75th / 90th percentile **122 / 160 / 250 / 400 m**.
- For the 88 groups that contain a building over 250 m² (a barn, storage or shop, so likely farmsteads), the nearest-neighbour distance is **145 / 286 / 434 m**.

Caveats. OSM building coverage there is incomplete, and missing buildings push the distances up. The groups include non-farm rural houses, which pull them down. Read the result as **working farmsteads roughly 0.15 to 0.45 km apart along the road, typically about 300 m**. A 100-acre homestead lot (New Sweden, 1870) is 405,000 m²; with road frontage of 300 m it runs about 1.35 km back from the road [D].

---

## 3. Ratios a true-scale farm has (arithmetic)

Reference buildings:
- **Barn length B = 30 m.** This is a 40 x 100 ft class general barn, between the Donovan (12 m) and Bradford (32 m) barns and near the measured 24 to 50 m long outbuildings. With a smaller 18 m barn (Olsson, or the 1917 Caribou potato house), multiply every width ratio below by 1.67.
- **House footprint H = 150 m²**, between a 120 m² main block and the measured 173 m² median with ell.

| Field | Area | Dimensions (2:1) | Field width ÷ B | Field length ÷ B | Field area ÷ H | Area ÷ H at 120 / 173 m² |
|---|---|---|---|---|---|---|
| Small, 2 ac | 8,094 m² | 127 x 64 m | 64/30 = **2.1** | 127/30 = **4.2** | 8,094/150 = **54** | 67 / 47 |
| Game's 5 ac | 20,234 m² | 201 x 101 m | 101/30 = **3.4** | 201/30 = **6.7** | 20,234/150 = **135** | 169 / 117 |
| Typical, 15 ac | 60,703 m² | 300 x 200 m (14.8 ac) | 200/30 = **6.7** | 300/30 = **10** | 60,703/150 = **405** | 506 / 351 |
| Large, 60 ac | 242,811 m² | 600 x 400 m (59.3 ac) | 400/30 = **13** | 600/30 = **20** | 242,811/150 = **1,619** | 2,023 / 1,404 |
| Game today | 154 m² | 14 x 11 units | about 1 (the brief says "hardly wider than the barn") | about 1 | 154/150 = **about 1** | |

Other ratios that set the look:
- **Farmstead to farm.** The house, barns and yard take about 1 acre (Bradford [P]) out of 100+ acres, so **the farmstead is about 1% of the farm's land**. In a 300 x 200 m field's worth of view, the whole yard is a 64 x 64 m patch [D].
- **Field to tractor.** A 4 m tractor is 1/75 of a 300 m row and 1/50 of a 200 m width. A 10 m two-row harvester covers 1.8 m of the field's width per pass, so about 110 passes cross a typical field [D].
- **Field to row.** A real field shows about 70 rows across (small field) to about 440 rows across (large field) at 0.91 m. A field 11 units wide shows 12 [D].
- **Field to tree.** Typical field width is 8 to 13 mature-tree heights, and a small field about 3 [D].
- **Neighbours.** The next farmstead is about 300 m off, about 1 to 1.5 typical field widths [M, D].
- **The scale factor the brief implies.** With buildings at true size, the game's 5-acre fields at true area need a linear factor of √(20,234/154) = **11.5** over today's 14 x 11. The measured typical 15-acre field needs **about 20** [D].

---

## 4. What a compressing designer must keep true, and what can shrink

### 4.1 What the perception literature says governs scale at farm distances

- **Beyond about 30 m ("vista space") only a few cues work: occlusion, height in the visual field, relative size and aerial perspective.** Binocular and motion cues fade out. Aerial perspective (haze) is "one of the few cues whose effectiveness changes only slightly with distance". Cutting and Vishton (1995), "Perceiving layout and knowing distances", in Epstein and Rogers (eds), *Perception of Space and Motion*, pp. 69-117 [S]: http://wexler.free.fr/library/files/cutting%20(0)%20perceiving%20layout%20and%20knowing%20distances.%20the%20integration,%20relative%20potency,%20and%20contextual%20use%20of%20different%20information%20about%20depth.pdf
  - A field is 60 to 600 m across, entirely in vista space. So its size is read mostly from the **relative size of known objects** (people, tractors, doors, barrels, trees) and from **haze and texture density** (row count). It is not read from the field's absolute dimensions.
- **Familiar size is a relative and cognitive cue more than an absolute one.** Gogel (1963), "The visual perception of size and distance", *Vision Research* 3:101-120 [S]: http://wexler.free.fr/library/files/gogel%20(1963)%20the%20visual%20perception%20of%20size%20and%20distance.pdf ; Epstein, Park and Casey (1961), *Psychological Bulletin* 58:491-514 [S].
  - The practical reading: viewers judge "how big is this field" by comparing it with the house, barn, people and machines **in the same view**. That is why the ratios in section 3 matter more than any absolute number. A 14 x 11 field beside a 12 m barn reads as a garden because the ratio, not the metre count, is garden-like.
- **Blur and a narrow depth band read as "miniature".** Held, Cooper, O'Brien and Banks (2010), "Using blur to affect perceived distance and size", *ACM Transactions on Graphics* 29(2) [U: known paper, not opened this session]. Strong depth-of-field blur on a high top-down camera (the tilt-shift look) makes real landscapes look like toy models. A rescale aiming at "massive" should keep far fields sharp and hazy rather than blurred.
- **Distances in rendered 3D scenes tend to be underestimated** relative to the same real distances (review: Renner, Velichkovsky and Helmert (2013), "The perception of egocentric distances in virtual environments", *ACM Computing Surveys* 46(2) [U: not opened]). A game field drawn at true size can still read somewhat smaller than real. That argues against shrinking fields below the small-field ratios.
- **Model railways use "selective compression".** Leave out what is unimportant, then shrink the large things that remain. The parts that carry human scale (doors, windows, vehicles) stay at true scale, and only overall footprints and repetitions shrink. NMRA Australasia, *Layout Planning* module [S]: https://nmra.org.au/wp-content/uploads/2022/09/Mod-3-Layout-Planning.pdf ; Model Railroad Hobbyist forum, thread 3154 [S]. This is the same plan the brief has chosen: true-size buildings, people and machines, with the land grown around them.
- **Game-design commentary** (forum and practitioner, weak [U]). Open worlds "heavily abstract and compress" scale. Travel time and frequent landmarks make a place feel bigger. Wide unbroken vistas can make a world feel smaller. Fast travel shrinks it. (askagamedev: https://askagamedev.tumblr.com/post/740234771463110656/how-do-open-world-games-manage-to-feel-so-big ; NeoGAF thread 1206648.) No peer-reviewed source on perceived farm scale in games was found.

### 4.2 Keep true (people read these as "real")

1. **The human-scale objects themselves.** People (about 1.75 m), doors (about 2 m), barrels (0.5 x 0.7 m), tractors (4 x 2.3 x 2 to 3 m), harvesters (10 x 3 x 3.4 m), trucks and fence posts all stay at true size. These are the familiar-size rulers the eye uses. The brief already keeps them.
2. **Row spacing at about 0.9 m, so row count is the in-field ruler.** Rows are the texture gradient that carries the field's size into the distance. A field showing 100 to 200 rows across reads as a real field. One showing 12 reads as a vegetable bed. If the field must be smaller than true, still draw rows at 0.9 m rather than widen them.
3. **Field width at least about 3 barn lengths, and field area at least about 100 to 150 house footprints.** That is the small-real-farm floor, at the game's own 5-acre size (201 x 101 m). The 2-acre minimum (2:1 and about 50:1) is where a field stops reading as farmland. The typical Aroostook look is about 7 barn lengths and about 400 house footprints.
4. **The farmstead stays a tight cluster** of about 1 acre: house, barn and potato house within about 60 to 70 m of one another, with fields beginning just beyond. Spreading the buildings out to fill space undoes the contrast that makes fields read as big.
5. **Trees at 15 to 25 m (to 30 m) along woodlot edges.** Tree height is the vertical ruler for the horizon. Undersized trees at a field edge make the field look larger for a moment, but they make the buildings look oversized next to them.
6. **Machines take many passes.** About 110 two-row passes across a typical field, and about 50 across a 5-acre field. A tractor crossing a whole field in a few seconds of screen time tells the eye the field is small, whatever its drawn size. That is the travel-time cue.

### 4.3 What can shrink unnoticed

1. **The number of fields, not the size of each.** Selective compression says show fewer full-size fields (the game's six), not many shrunken ones.
2. **Distance between farmsteads.** The real distance is about 300 m. One neighbour's buildings seen across a field at 150 to 300 m, with the rest implied by haze and woods, is enough. Absolute gaps beyond about 100 m are judged poorly anyway (vista space).
3. **Depth of woods, distant hills and the far landscape.** Aerial perspective, overlapping ridgelines and a horizon of 20 m trees stand in for kilometres. Haze is cheap and is one of the few cues that keeps working with distance.
4. **Road and lane lengths between places.** They can be shortened, provided lane and road **widths** stay true (lane tread 3 m, road 5.5 to 6 m with a 15 m clearing) so vehicles fit them.
5. **The pond** can sit at the small end (about 0.5 to 1 ha) without notice. Water surfaces have no texture ruler.
6. **Building counts and interior detail** (fewer outbuildings, simpler ells), as model railways do. Footprints of buildings people do not walk into can shrink 10 to 30%, but doors and windows stay true.
7. **Exact field shapes.** Real fields are irregular and many follow slope strips 40 to 50 m wide. Slightly squarer or shorter fields go unnoticed so long as rows run the long way and the width stays several barn lengths.

---

## 5. Gaps and weak points

- **No authoritative field-size statistic for Aroostook potato fields exists in the sources found.** The field numbers rest on my OSM measurement (one well-mapped 19 x 17 km sample, modern fields, possible merged polygons) and one row length in a newspaper. A NASS Cropland Data Layer or Common Land Unit analysis would be stronger. The Yan and Roy (2016) per-region figures could not be read (bot wall).
- **Farmhouse and barn heights** are derived from storey counts, not measured or quoted.
- **The Donovan-Hussey barn dimensions** come from the nomination's indexed text, not from a page I read. Only page 1 of that scan opened.
- **Truck dimensions** for a 1970s or 80s Maine farm truck are derived from a 40-barrel load and a modern Ford body guide. No period brochure was opened.
- **Packing shed:** no standard exists. The examples are New England vegetable farms, not potato farms.
- **Farmstead spacing** is from incomplete OSM building data and includes rural non-farm houses.
- **Tree heights** are forest-stand figures. Field-edge trees in Aroostook were not measured.
- **Held et al. (2010) and Renner et al. (2013)** are cited from knowledge and were not opened this session.
- Several Maine Memory Network and Maine government pages refused automated fetches (HTTP 403). Their figures carry [S].

## 6. Raw material kept beside this report

- `(working files, not kept in the repository) osm/farmland.json`: OSM farmland, Caribou to Fort Fairfield (ODbL).
- `(working files, not kept in the repository) osm/bldg.json`: OSM buildings, rural box.
- `(working files, not kept in the repository) area.py` and `(working files, not kept in the repository) bldg.py`: the measurement scripts. Run them with `python3 -I area.py osm/farmland.json field` and `python3 -I bldg.py osm/bldg.json`.
- `(working files, not kept in the repository) usda_storage.txt`: text of USDA Farmers' Bulletin 847.
- `(working files, not kept in the repository) dl_lsu/5989.pdf`: the LSU / USDA 20,000 cwt potato storage plan.
