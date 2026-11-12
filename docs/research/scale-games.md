# How shipped games scale farmland against buildings and people, with a recommendation for The County

Research slice for the County rescale. Read-only; nothing in the repository was changed.

## 0. The County today: read from the code

The baseline matters, because the brief's premise ("one ground unit treated as one metre") does not match what the code draws.

| Thing | Source | Size in units |
|---|---|---|
| Field (one parcel) | `src/render/layout.ts`: `FW = COLS*SX = 12*1.2`, `FD = ROWS*SZ = 8*1.36` | 14.4 x 10.9 |
| Planted row spacing | `ROW = 0.34` | 0.34 |
| Big house | `props.ts` `gabled(3.0, 3.6, wall 2.05 ...)` | 3.0 x 3.6, two storeys in 2.05 |
| Barn | `props.ts` `gabled(4.3, 6.0, wall 2.5 ...)` | 4.3 x 6.0 |
| Person | `crew.ts` "about 0.64 tall", `Walker` scales the figure by 1.2 | about 0.77 tall |
| Home block | `FARM` rect | 47.4 x 48.1 |
| Camera | `camera.ts`: lens 27 deg vertical, `MIN_DIST 7.5`, pitch curve to `FAR_DIST 96`, fit clamp 20..420, default goal dist 90 | |

What these numbers imply:

- **People, buildings and rows already agree with each other at about 1 unit = 2.3 m, not 1 m.** A 0.77-unit person is 1.75 m tall at 2.27 m per unit. On that scale the barn is 9.8 x 13.6 m (a small real barn), the house 6.8 x 8.2 m (a real Cape or farmhouse), the rows 0.77 m apart (real potato rows are 0.86 to 0.91 m) and a door 0.86 units = 1.95 m. Only the land is out of scale: a field is 33 x 25 m, or 0.08 ha.
- If "true size" means "leave buildings, people and machines as they are", the land factor should be chosen against those objects, not against a metre. Doubling a field to 29 units makes it 65 m wide in real terms. That is still a small field.
- **The ratio to beat: field width to barn length is 14.4 / 6.0 = 2.4** (3.3 against the barn's width). Field to house width is 4.8. Field to person height is 19.
- At the default distance of 90 the visible ground is about 77 units across at the target (vertical lens 27 deg, 16:9). A field is about 19% of the screen width and the barn about 8%. The farm reads as a garden because the barn is a third of a field.
- Unit readability already depends on distance thresholds written in absolute units, and these must scale with the land. In `units.ts` the presence scale-up runs `smooth(26, 120, dist)`, rings fade in over 34..70, and markers over 40..85. In `camera.ts`, `pitchFor` has 7.5..96 and 110..240, the field-focus clamp is 24..60, and the fit clamp is 20..420.

## 1. Method

- For every game I pulled the Steam store screenshot list from `store.steampowered.com/api/appdetails` (162 shots), made per-game contact sheets, and downloaded 17 full-size representative shots. These are in `(working files, not kept in the repository) shots/`. Gridded copies with 5% lines are in `(working files, not kept in the repository) shots/grid/`, and the source address of each shot is in `(working files, not kept in the repository) shots/sources.txt`.
- I measured each shot by reading the grid: the share of screen width taken by a field and by a house or barn at about the same depth. The ratio of those two is a fair measure of the world ratio, because objects at the same depth share one perspective scale. Absolute screen shares say less, because store shots are framed by marketing and are not the default camera.
- Footprints come from wikis and community measurement, cited inline. Where a figure rests on one community post, the text says so.

## 2. Game by game

Ratios are linear (side against side), not area.

### Farming Simulator 25 (GIANTS): the 1:1 metre end
- Scale: true metres. The base map Riverbend Springs is 2 x 2 km with 76 to 92 field plots ([findyour.farm](https://findyour.farm/maps/fs25-riverbend-springs), [FS wiki](https://farmingsimulator.wiki.gg/wiki/Riverbend_Springs/Farming_Simulator_25)). Fields run from about 1 ha to custom fields of 19 ha ([Steam thread](https://steamcommunity.com/app/2300320/discussions/0/596263009070912356)).
- Measured (`2300320_11`, a high view over a village): a farmhouse at mid-depth takes about 8% of the screen width, while the field on the left at a similar depth runs off the frame at 35% or more. Field to house is at least 4 to 5x on screen. A real 100 to 300 m field against a 20 to 30 m barn is 5 to 15x.
- Making big land read as big: the map stands inside a **background terrain mesh, 8 tiles round the playable square** ([maps4fs docs](https://maps4fs.gitbook.io/docs/advanced-topics/background_terrain)). Modders plant a dense forest only in a 512 m strip outside the map, "beyond that it appears as dots on the horizon" ([FarmerBoys forum](https://farmerboysmodding.com/index.php?/topic/2563-background-trees/)). Heavy aerial haze, tree lines along field edges, power lines and roads all serve as scale rulers.
- Small things: the vehicle is the readable unit. People hardly matter at strategic distance.

### Manor Lords (Slavic Magic): realistic scale on purpose
- Scale: the developer keeps "the scale realistic", with narrow passages and tiny doors, and rejects the usual trick of widening them ([One Year Later dev blog](https://steamcommunity.com/games/1363080/announcements/detail/573753783490708648), [GamesRadar](https://www.gamesradar.com/games/city-builder/i-remember-uploading-the-build-crossing-my-fingers-that-things-wouldnt-immediately-fall-apart-a-year-later-city-builder-mega-hit-manor-lords-has-a-bigger-dev-team-teasing-big-updates/)).
- Fields are measured in morgen. One community measurement puts a morgen at about 2,250 m² ([video](https://www.youtube.com/watch?v=HAxTuQtL4b0)); others use 2,500 m² ([Steam](https://steamcommunity.com/app/1363080/discussions/0/4344366233042663937/)). The game recommends about 1 morgen per field, and players use 0.3 to 4 ([Steam](https://steamcommunity.com/app/1363080/discussions/0/4358998116396408784/)). A 1-morgen square is about 47 m a side and a 4-morgen field about 95 m, against a 9 to 12 m long house: **about 4 to 10x**.
- Measured (`1363080_07`, a high oblique over a village): the field strips in the right foreground span 20 to 30% of the screen, and the barn in front of them 6%. That is about 4 to 5x. In `1363080_00`, a closer village view, houses take 5 to 6% of the width and about 30 buildings are in frame.
- Making big land read as big: a **mountain range far beyond the playable region** fills the top 20% of the frame, with a forest belt below it and haze over both. Strips are separated by balks and paths, and orchards and woods break up the open ground. A third-person walking camera shows the world at villager scale.

### Ostriv (single developer): the most farm-like city builder
- Scale: community posts report a field cap of about 2,500 units in area (around 50 x 50), and the house lot and fence length limit is 40 ([Steam](https://steamcommunity.com/app/773790/discussions/0/3151934575302954172/)). The posts disagree on the exact cap; I found no developer figure.
- Measured (`773790_05`, low over a field): the far edge of the field spans about 72% of the screen width. A long thatched barn at the same depth spans 14%: **field to barn about 5x**. People at the field edge are about 1% of the width. In `773790_00`, a town view, a house is 4 to 5% of the width and its kitchen-garden plot about 2x the house. The large open fields beyond the river and at top right each span 30% of the screen or more.
- Making big land read as big: the long, flat horizon with tree belts and poplar rows as vertical markers, windmills along the field edge, fences round every field, and cattle on pasture as moving texture.

### Farthest Frontier (Crate): tile-based, compressed but farm-like
- Footprints: a crop field is 5 x 5 to 12 x 12 tiles, a house (shelter) 3 x 3, a barn 4 x 6, a windmill 3 x 3, and the town centre 6 x 6 ([FF wiki: Buildings](https://farthestfrontier.wiki/wiki/Buildings), [official guide](https://www.farthestfrontier.com/guide/gameplay/farming/)). A maximum field against a house is 4x; against a barn, 2 to 3x.
- Measured: in `1044720_11` (snow, high oblique) the large field is about 33% of the screen width and the farmhouse 7%, so 4.7x. In `1044720_13` (low, over a potato field) the field is 53% and the farmhouse 17%, so 3.1x.
- Making big land read as big: **hedgerows of shrubs and small trees between fields** (`1044720_13`), split-rail fences, and a lake or forest edge closing every view. Rows are visible at mid zoom.
- Camera: the developers cap the maximum zoom for performance ([Steam](https://steamcommunity.com/app/1044720/discussions/0/3315233099219086389/)). The open-source camera mod sets `minDistanceFromTarget 35`, `maxDistanceFromTarget 425`, FOV 65 and angle 8..85 deg ([FFCameraMod Main.cs](https://github.com/seedpodsw/FFCameraMod)). These are the mod's values, so the shipped maximum is lower.

### Banished (Shining Rock): classic tile builder
- Footprints: a crop field is 4 to 15 tiles a side; a 15 x 15 field is worked by 4 farmers ([Banished Wiki: Crop Field](https://banished-wiki.com/wiki/Crop_Field)). The Colonial Charter calculator lists the wooden house at 4 x 5 ([silisoftware building list](https://www.silisoftware.com/tools/banished-colonial-charter/building/)), a mod tool that also lists the vanilla buildings. A maximum field against a house is about 3 to 3.75x; the common 10 x 12 field, about 2.5x.
- Measured (`242920_06`): the cabbage field is about 2.5 to 3x the width of the crop-field farmhouse beside it.
- Making big land read as big: strong texture contrast between neighbouring crops (cabbage, grain, orchard rows), fences, and orchards in a grid. The farm still reads as a large garden.

### Foundation (Polymorph): freeform zones
- Measured (`690830_09`, high oblique): field patches take 15 to 20% of the screen width each, farm buildings 5 to 6%, houses about 3%. That gives **field to barn about 3x and field to house about 5x**. About 8 to 10 field patches are on screen around a walled town.
- Making big land read as big: **low stone walls and hedges round every field**, a continuous forest ring, a river and a distant shoreline. Crops are stylised gold masses at distance, not single plants.

### Anno 1800 (Ubisoft Mainz): big fields as a backdrop
- Footprints: a grain farm needs 144 field tiles at 1 x 1 each and a potato farm 72; the farm building is 3 x 3 ([Anno wiki: Grain Farm](https://anno1800.fandom.com/wiki/Grain_Farm), [Potato Farm](https://anno1800.fandom.com/wiki/Potato_Farm)). One grain farm's field is equivalent to 12 x 12 tiles, about 4x a 3 x 3 residence. Players merge many farms into continuous fields.
- Measured (`916440_04`): the grain field on the hill behind the city spans about 37% of the screen width, while residences at the same depth are about 3%. **That is over 10x.** Several windmills stand inside the field.
- Making big land read as big: **windmills and lone farmhouses as landmarks inside the gold field**, and hills, cliffs and the sea beyond. The terrain is a baked, decal-layered virtual texture: two global tint and grit maps plus per-tile baked node textures ([frame analysis](https://blog.thomaspoulet.fr/posts/anno-1800-frame-analysis/)), so a field at distance costs a texture, not geometry.
- Camera: preset zoom steps (F2 to F4) or free zoom. "Increased camera distance" is off by default, and Update 4 extended the zoom-out because players asked for it ([DSOGaming](https://www.dsogaming.com/news/anno-1800-update-4-releases-on-july-30th-will-improve-camera-zoom-out-will-optimize-performance/), [Steam](https://steamcommunity.com/app/916440/discussions/0/595142234675916014/)).

### Cities: Skylines (Colossal Order): metric cells
- Footprints: a cell is 8 m. Industries crop fields are 4 x 8, 8 x 8 and 8 x 16 cells, i.e. 32 x 64 to 64 x 128 m ([CS wiki: Industry areas](https://skylines.paradoxwikis.com/Industry_areas)). Farm house and barn lots are commonly 4 x 4 cells, 32 m with yard ([Workshop](https://steamcommunity.com/sharedfiles/filedetails?id=416754603)). A large field against the building is **4 to 8x** by footprint, more against the building itself.
- The map is about 17 x 17 km. Farmland sits at the edge of a city view, not at the centre of play.

### Age of Empires IV (Relic): the RTS convention
- Footprints: one source gives the farm and the house both as 2 x 2 tiles, with a tile of 4 m in the editor ([search summary of the AoE wiki and forums](https://ageofempires.fandom.com/wiki/House_(Age_of_Empires_IV))). Players argue about building scale and the empty footprint space round buildings ([AoE forum](https://forums.ageofempires.com/t/the-building-scale-is-wrong-but-its-deeper-than-that/135077)).
- Measured (`1466860_01`): a wheat farm is about 13% of the screen width and a house about 9%, so about 1.4x. A villager is about 1.5% of the width and 3% of the height, oversized against both.
- Units are not to scale: buildings are shrunk and units enlarged so all clickable things are of a similar size ([TV Tropes summary](https://tvtropes.org/pmwiki/pmwiki.php/Main/UnitsNotToScale), [GameDev.net](https://www.gamedev.net/forums/topic/628824-realitive-size-in-games/4964662/)). This is the opposite of what the owner wants. It shows the cost of the County's choice: true-size people need a marker system.

### Against the Storm (Eremite): extreme compression
- Footprints: a field is one 1 x 1 tile. A Small Farm is 2 x 2 and works an 8 x 8 area; a Homestead is 3 x 3 and works 23 x 23 ([official wiki: Homestead](https://wiki.hoodedhorse.com/Against_the_Storm/Homestead), [Small Farm](https://wiki.hoodedhorse.com/Against_the_Storm/Small_Farm)). One field is a third of a house side.
- Measured (`1336490_09`): the farm plots are small green patches, 5 to 10% of the screen, among large buildings. This is farmland as an icon, and the worst model for this game.

### Stardew Valley (ConcernedApe): the top-down garden
- Footprints: the farmhouse is a 9 x 5 footprint ([wiki](https://stardewvalleywiki.com/Farmhouse)). The largest continuous tillable rectangle on the Standard Farm is 63 x 31, with 3,427 tillable tiles ([Farm Maps](https://stardewvalleywiki.com/Farm_Maps)). A farmer is 1 tile wide and about 2 tall.
- Measured (`413150_06`): a tile is about 3.2% of the screen width, so about 31 tiles across at 1080p. The farmhouse takes about 30% of the width; the 3 x 3 crop beds take about 10% each.
- Fields are as big as the player tills them, up to 7x the house, but they are never seen whole at the play camera. The game is a garden on purpose.

### RimWorld (Ludeon): for completeness
- A tile is about 1 to 1.5 m by fan estimate, with no official figure ([Ludeon forum](https://ludeon.com/forums/index.php?topic=30830.0)). Growing zones are freeform, pawns are 1 tile, and a bedroom is about 4 x 4. Fields are 3 to 6x a room side. It is a top-down base builder, and its land never reads as a landscape.

### Camera zoom ranges (data points)
- The County today: 7.5 to 96 on the pitch curve, fit up to 420, so about 13:1 in use.
- Farthest Frontier camera mod: 35 to 425 (12:1), FOV 65. The shipped game is narrower.
- Going Medieval: `heightRange` 9 to 210, i.e. 23:1 ([Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2506656884)).
- C&C Generals: camera height 120 to 310, i.e. 2.6:1, the classic narrow RTS range ([Steam discussion](https://steamcommunity.com/app/2732960/discussions/0/4290313152640193525/)).
- Anno 1800: stepped presets, with the far step opt-in.
- Games with true-size people and big land (Manor Lords, FS, Ostriv) all pair a wide zoom range with a different look at each end: the person and the street up close, a map-like landscape far off.

## 3. Summary table

| Game | Field : house | Field : barn or farm building | Field share of screen (measured shot) | How land reads as large |
|---|---|---|---|---|
| Farming Simulator 25 | 10-30x (real) | 5-15x | field 35%+ vs house 8% | background terrain, forest strip, haze, tree lines |
| Manor Lords | 4-10x | 4-5x measured | strips 20-30% vs barn 6% | mountain backdrop, forest belts, balks |
| Ostriv | 5x+ | about 5x measured | field 72% vs barn 14% | flat horizon, poplar rows, windmills, fences |
| Anno 1800 (backdrop fields) | over 10x | over 10x | field 37% vs house 3% | windmills in fields, hills, sea |
| Cities: Skylines | 4-8x | 4-8x | (edge of city) | metric map, distant city |
| Farthest Frontier | 4x max | 2-3x by footprint, 3-4.7x measured | 33-53% vs 7-17% | hedgerows, forest edge |
| Foundation | about 5x | about 3x | 15-20% vs 5-6% | stone walls, forest ring |
| Banished | 3-3.75x | 2.5-3x | about 3x the building | crop texture contrast, fences |
| Age of Empires IV | about 1.4x | about 1.4x | 13% vs 9% | none; units oversized |
| Against the Storm | 0.33x | 0.33x | patches 5-10% | none; fields are icons |
| Stardew Valley | up to 7x | n/a | beds 10% vs house 30% | none; a garden |
| **The County today** | **4.8x** | **2.4x** | **19% vs barn 8%** | |

The pattern: games where farming is a side economy compress fields to 0.3 to 3x a building (AoE IV, Against the Storm, Banished). Builders that want a farm look sit at 3 to 5x (Farthest Frontier, Foundation, Ostriv, Manor Lords). Games that sell a massive landscape show fields at 10x or more of the buildings, either at true scale (Farming Simulator) or as a vista behind the town (Anno, Manor Lords). The County sits at 2.4x, with Banished, which is why it reads as a garden.

## 4. Recommendation for The County

### 4.1 Ratio: field width 6 to 9 times the barn's length, aim at about 7.5x
- Today it is 2.4x. The evidence above puts "reads as a farm" at 4 to 5x and "reads as a massive landscape" at 10x or more. Fields are the County's main object of play, not a side economy, so they should sit above the city-builder band. "Within reason" argues against FS-true 15x, where a field can never be seen whole with its people.
- With the barn at 6.0 units this means **a field 36 to 54 units wide, so a land factor of 2.5x to 3.75x; I recommend 3x**. A 3x field is 43 x 33 units, about 98 x 74 m (0.73 ha) on the scale the people and buildings actually use. That is a small but credible real potato field; Aroostook fields run to several hectares. Field to house width becomes 14x, and a field becomes about 56 person-heights across, against 19 today.
- If the owner wants more after seeing 3x, 3.75x (field about 54 x 41, 1.1 ha) is still inside the evidence band. I would not go past 4x without the backdrop and marker work below already in place.
- A caution for the implementer: the brief's "1 unit = 1 m" is not how the assets are built (section 0). Pick the factor against the barn and the person, not against metres. Do not re-scale buildings to "real metres" (2.3x larger); that would cancel the change.

### 4.2 On screen at the default playing camera: 3 to 5 fields, one of them dominant
- The comparable shots (Manor Lords 07, Farthest Frontier 11, Foundation 09, Ostriv 05) show 3 to 10 fields at their default or working heights. The main field takes 20 to 50% of the screen width, and buildings 3 to 8%.
- For the County: at the default working camera the active field should take about 30 to 40% of the screen width. Its neighbours should be partly in frame, the barn about 3 to 5% of the width, and the edges should show more land beyond, as the comment above `FIELD_MARKS` already intends. That is about 3 whole fields and 2 to 4 partial ones.
- The whole home block (six fields plus the farmstead) belongs to a farm tier one step out, not to the default framing.

### 4.3 Zoom tiers (W = field width; at 3x, W = 43)
Ground width visible at the target is about 0.86 x dist with the 27 deg lens at 16:9.

| Tier | Ground across the screen | dist at 3x | What shows | People |
|---|---|---|---|---|
| Yard / close | 0.3-0.8 W (13-35 u) | 15-40 | plants, rows, faces of buildings, crews at work | true size, 3-8% of screen height |
| Field (default play) | 1.5-2.5 W (65-110 u) | 75-130 | one field dominant, neighbours, the farmstead | true size, scale-up starting, ring on |
| Farm | 3.5-5 W (150-215 u) | 175-250 | all six home fields, brook, woodlot | marker plus ring; machines still visible |
| County | 8-12 W (350-520 u) | 400-600 | every block, the Dufour place, backdrop ridges | markers only; crops as texture |

- `MIN_DIST` can stay close to 7.5 to 15, because people and buildings do not change size. Every distance threshold tied to the land should be multiplied by the factor: `FAR_DIST`, the `pitchFor` 110..240 band, the fit clamp 20..420 (to about 60..1300), the field-focus clamp 24..60, the presence 26..120, rings 34..70, markers 40..85, grass thinning, haze density per unit, the camera far plane (9000 is fine) and shadow camera extents.
- Consider presets as in Anno (keys or a button cycling Field, Farm and County) on top of the free wheel. They make the tiers deliberate and give the scale a known "home" for each job.

### 4.4 Techniques worth taking, in order of payoff
1. **Land beyond the playable area.** Taken from Manor Lords' mountain backdrop and the FS background terrain ring with forest dots on the horizon. Today `LAND` ends close to the blocks. After a 3x scale-up the camera at the farm and county tiers sees much further, and empty edges would undo the effect. Add a low-detail band at least 3 to 5 W deep: spruce ridges and other farms' fields as flat painted patches, with a far ridge line. Hand off to haze beyond it.
2. **Field-edge structure that rules the distance.** Taken from Farthest Frontier's hedgerows, Foundation's stone walls, Ostriv's fences and poplar rows, and Manor Lords' balks. The County already has stone walls (`WALLS`) and headlands. At 3x the edges carry the scale: stone walls with tree lines (Aroostook spruce, alder and rock piles), headland tracks, a power-pole line along the road. Their regular spacing tells the eye how far it is.
3. **Landmarks inside the open land.** Taken from Anno's windmills standing in the grain. A big field with nothing in it reads as empty, not large. Use objects of known size: a lone elm or maple left in a field, a rock pile, the potato house, a pole line, a parked truck. One or two per block is enough.
4. **Crop level of detail by distance.** Taken from Anno's baked terrain texture and how Farthest Frontier and Foundation fields read as stripes or colour masses far off. Field area grows 9x at 3x, so instanced plants cannot cover it all. Draw plant meshes in the yard and field tiers and a row-striped ground texture or shell beyond. The stripes converge in perspective, which is itself a strong scale cue.
5. **Atmospheric perspective tuned to the new distances.** Seen in FS25 and Manor Lords. The haze in `env.ts` is set per unit of distance. Rescale it so the far fields lose contrast and shift toward the sky colour across the farm tier, not inside one field.
6. **Findable people without oversizing them.** The County already scales units up with distance (`presence`, up to 2.1x), fades in a ground ring and shows screen-space markers. Keep that model. AoE IV shows the alternative, oversized people, which kills the scale. Rescale the thresholds and make sure markers hold a constant pixel size at the farm and county tiers. Let the tractor, the largest moving thing, carry readability at the farm tier, as FS does.
7. **Do not grow the buildings or their yards.** The AoE IV complaint is that footprint space round buildings crowds the view. Keep the farmstead compact, so its small size against the fields is what reads as "real farm".

### 4.5 What would show the result is right (independent of me or the owner)
- Measure screenshots of the rescaled County the same way as here: field to barn width at the same depth should come out at 6 to 9x, and the default camera should show 3 to 5 fields with the barn at 3 to 5% of the screen width.
- Compare against the real farmland the slice-mates are using (aerial imagery of Aroostook farms). The field to barn proportion should land between the city builders (3 to 5x) and the real thing (10 to 20x).
- Clickability check: at each tier a crew must be found and picked within a hit radius of at least 24 px at 1080p.

## 5. What stayed unverified
- Several footprints rest on a single community source: the Ostriv field cap, the Manor Lords morgen of 2,250 m², the AoE IV farm and house tile sizes, the Banished wooden house (from a mod calculator), and the Stardew 80 x 65 farm size.
- I found no shipped default zoom distances for Manor Lords, Farthest Frontier, Banished or Anno. The Farthest Frontier numbers are a mod's.
- Screen shares come from store screenshots, which are framed for marketing. The within-shot ratios (field against a building at the same depth) are the trustworthy part; the absolute shares are only a guide to default framing.
- I found no developer talk that gives explicit field-to-building ratios. The Manor Lords dev blog (realistic scale) and the Anno frame analysis (terrain texture technique) are the only first-party or technical sources here.
