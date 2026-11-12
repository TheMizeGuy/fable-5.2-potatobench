# The County: rescaling the land, code slice

Read-only research. Sources: `src/render`, `src/sim/{farm,params,crew}.ts` in the main checkout, plus the four in-flight worktrees under `.claude/worktrees/`:

- **L**: `agent-ae94324962d3e3d73`, light, sky, lens and camera
- **T**: `agent-a194636ccfaf65765`, terrain, layout, woods, crops and water
- **B**: `agent-adc5f791a00b601c4`, buildings and yards
- **P**: `agent-a95e4ef9f8963cdaa`, people and machines

A cited line is from the worktree that owns the file. Main has the same constants unless a line says otherwise.

Measured numbers come from three sources:
- Two node scripts that ran the real constructors without a browser: `scratchpad/scale/tools/count.ts` and `trees.ts`. They built T's `Grass`, `Flora`, `buildTerrain` and geometry and counted instances and triangles.
- L's own browserless check `tools/render/framing.ts`.
- Reading the source.

Anything else is marked as an estimate or as unverified.

---

## 0. The finding that changes the plan

The brief says buildings, people and machines are at true size (1 unit = 1 m). **Only people, machines and plants are.** Everything built or grown in the landscape is drawn at about **0.4 of true size**.

`src/render/units.ts:988-990` (P) says why: "The models are built small (a figure 0.82 tall, the tractor 1.61 long, the truck 2.94): drawn at this size a person stands 1.8, the tractor is 3.4 long and the truck 6.2." `TRUE_SIZE = 2.1`. The whole world was first authored at about 0.45 scale. People and machines were then multiplied up to true size. The buildings, roads, walls, trees and crop rows were not.

| Thing | In the scene | True (Aroostook, 1980s) | Scene / true |
|---|---|---|---|
| Person | 1.81 m (0.82 × 2.1 × FIGURE 1.05; P `units.ts:990-992`) | 1.75-1.8 m | 1.0 |
| Tractor | 3.4 m long; rear wheel radius 0.37×2.1 = 0.78 m; rear track ±0.36×2.1 → ~1.5 m, ~1.95 m overall (P `tractor.ts:557-558`) | 3.5-4 m long, 2-2.3 m wide | ~1.0 |
| Potato plant | 0.8×size wide, 0.56×size high, size ≤ ~1.16 → ~0.93 × 0.65 m (T `fields.ts:69-72`) | 0.6-0.9 m high | ~1.0 |
| Row spacing | `ROW = 0.34` (T `layout.ts:7`) | 0.86-0.91 m (34-36 in, UMaine) | **0.38** |
| In-row spacing | `PLANT = 0.3` (T `layout.ts:8`) | 0.18-0.30 m (7-12 in) | 1.0-1.6 |
| Farmhouse front door | 0.44 × 0.90 m (B `farmstead.ts:51`) | ~0.9 × 2.0 m | **0.45** |
| Farmhouse | 3.0 × 3.6 m footprint, 2.05 m wall + 1.15 m roof = 3.2 m, two storeys of ~1 m (B `farmstead.ts:33-36`) | ~8 × 11 m, 8-9 m to ridge | **0.35-0.4** |
| Barn | 4.3 × 6.0 m, wall 2.5 + rise 1.9 = 4.4 m; great door 1.9 × 1.88 m (B `farmstead.ts:135-143`) | ~12 × 24-30 m, 10-12 m to ridge, 4 m door | **0.35-0.45** |
| Machine shed | 3.1 × 6.4 m, wall 1.5 m, three bays 2.13 m wide (B `sites.ts:180`, B `layout.ts` `BAYS`) | bays ~4 × 4 m | **~0.4** (a 1.95 m tractor barely fits; walls are lower than the tractor) |
| Farm road | 1.42 / 1.35 m wide; track 1.3 m (T `terrain.ts:420-421`) | 4-5 m; track 3 m | **0.3-0.4** (narrower than the tractor) |
| Town road | 2.4 m (T `terrain.ts:428-429`) | 6-7 m | **0.37** |
| Ridge spruce | s = (5.4-9.2) × size(0.58-1) × tall(0.74-1.3): ~4-12 m (T `flora.ts:268-277`) | 15-25 m | **~0.45** |
| Dooryard maple | 6.6 m (T `flora.ts:302`) | 20-25 m | **~0.3** |
| Field-stone wall | stones 0.2-0.4 m, one or two courses (T `terrain.ts:540-542`) | 0.8-1.2 m high | **~0.35** |
| Field | 14.4 × 10.88 m = 157 m² | 4-16 ha (10-40 acres) [unverified] | 0.001-0.004 |

What this means for the plan:
- Growing only the land by K, with buildings left as they are, makes the field-to-barn ratio look like a farm. But every close view then shows a 1.8 m farmer twice the height of the front door, a tractor that cannot pass through its barn door, and a road narrower than the tractor.
- A professional fix puts everything at one scale. Multiply the **made and grown things by S ≈ 2.2-2.5** (buildings, roads, walls, trees, row spacing) and the **land by K**. People, machines and plants stay as they are.
- The cost of S is mostly the buildings writer's (B) and the woods writer's (T). It is a scale on the builder and on tree `s`. It is not new modelling.

---

## 1. The scene as it is

### 1a. Metrics

| Quantity | Value | Where |
|---|---|---|
| Hill grid per field | 12 cols × 8 rows = 96 hills | `src/sim/params.ts:9-11` |
| Plants per hill | `SUB = 4` each way → 16 | T `layout.ts:6` |
| Hill size | `SX = 4 × 0.3 = 1.2` m (along the row) × `SZ = 4 × 0.34 = 1.36` m | T `layout.ts:9-10` |
| Field | `FW = 14.4` m (x, along the rows) × `FD = 10.88` m | T `layout.ts:11-12` |
| Planted rows / plants per row | 32 / 48 | T `layout.ts:13-14` |
| Plants per field | 1,536 | T `fields.ts:22` |
| Parcel spacing (sim) | x: −8.4 / 7.8 (16.2 apart, gap 1.8); z rows: −14.2 / −1 / 12.2 (13.2 apart, gap 2.32); intervale 38; tracts −27.4; Dufour x 58 / 74.2 | `src/sim/farm.ts:33-58` |
| Yards (sim) | home (26, −4), Dufour (90, −6) | `src/sim/farm.ts:68-71` |
| Home farm walls | `FARM` x −18.4..32.6 (B: ..42.5), z −22.6..25.5 | T `layout.ts:27`, B `layout.ts:27` |
| Playable land (camera bound) | `LAND` x −56..100, z −24..47 (156 × 71 m) | T `layout.ts:37`; bound in L `camera.ts:271-272` |
| Terrain mesh | 0.6 m grid over LAND + 4.2 m in x and ±64.2 m in z, cells growing ×1.065 out to 3,600 m. **186,589 verts, 371,448 tris** (measured) | T `terrain.ts:122` |
| Slope profile | knots from −3,600 to +3,600 m; through the fields 5.24 m at z −22 down to 0.95 m at z 18.5 (**~10.7 % slope**); brook z 22.6 | T `layout.ts:43-47` |
| Far ridges | rings at 4,700 / 6,100 / 7,900 m, base 95-380 m, rise 135-280 m | L `far.ts:10-14` |
| Brook | half-width 1.3 ± 0.32 m (2.6 m wide); ribbon x −460..470 | T `layout.ts:108-110`, `terrain.ts:447` |
| Building footprints / heights | house 3.0×3.6, 3.2 m; little house 2.3×3.0, 2.27 m; back house 2.5×2.8, 2.4 m; barn 4.3×6.0, 4.4 m; home potato house 4.2×6.2, wall 1.15 + rise 1.25, banked; Dufour cape 3.2×4.4, 2.7 m; Dufour barn 3.8×5.0, 3.7 m; Dufour potato house 3.6×5.0, 2.1 m; machine shed 3.1×6.4, 2.22 m; bunkhouse 3.2×5.0, 2.12 m; packing shed 4.0×6.0, 2.85 m; second potato house site 4.0×6.0 | B `farmstead.ts:33-36, 66-69, 110-113, 135-138, ~309, 274-277, 332, 355`; B `sites.ts:180, 220, 263, 325` |
| Person | 1.81 m | P `units.ts:988-992`, `crew.ts:3` |
| Tractor / truck | 3.4 m / 6.2 m long; machines enlarged with distance up to 2.9/2.1 = 1.38×, people up to 1.8× | P `units.ts:468-470` |
| Trees | ridge front: spacing 1.9 m, hardwood s 3.9-6.7 and conifer 5.4-9.2 m before multipliers. Back of the ridge: spacing 2.7 m, s 4.4-7.2 / 5.8-9.6 m. Brush 0.7-1.8 m. Country: `reach 1500`, cap 11,000, whole trees inside 95 m | T `flora.ts:268-345` |
| Tree counts (measured) | near-capable 1,709 (22 chunks of 64 m) + tract stands 298; back-of-ridge 1,076; far/distant 11,038 | `trees.ts` |
| Grass (measured) | 23,793 clumps: sward 17,962, rank 5,831; 73 patches of 22 m; 1.28 M tris if every clump drew; built in 51 ms | `count.ts`; T `grass.ts:20-23, 88` |
| Stone walls (measured) | 2,457 stones × 80 tris = 197 k tris, one InstancedMesh | T `terrain.ts:531-594` |
| Field soil mesh | 49 × 257 verts per field (8 verts per planted row) → 12.6 k per field, 227 k for all 18 | T `fields.ts:375` |
| Roads | farm road 1.42 m, spurs 1.35 m, track 1.3 m, town and hill roads 2.4 m out to ±1,500 m | T `terrain.ts:420-429` |
| Default home view, 1920×1080 | **distance 42 m**, pitch ≈ 0.328 rad (18.8°), tilt ≈ 0.142, fov ≈ 42.8°, camera ~13.5 m above the focus. Whole-map view **75 m**. (`framing.ts` ran) | L `camera.ts:22-24, 161-206`, `tools/render/framing.ts` |
| Camera limits | `MIN_DIST 7.5`; fit clamp 16..420; field view `clamp(home×0.5, 22, 46)`; near = dist×0.04 (0.2..3); far 9,000; pitch/lens table keyed to absolute distances 7.5 .. 300 | L `camera.ts:13, 22-24, 104, 126, 202, 239` |
| Screen scale at home view | 32.8 px/m: person 59 px, field 472 px, hill 39 px | derived |
| Shadow cascades | radius r0 = 10 × 1.3^n stepped by 0.64×dist, capped at 66; r1 = 3.4×r0 capped at 230; r2 = 3.6×r1 capped at 820. Light pulled back 160 / 320 / 700 m. Maps 3072/2048/2048 high, 2048/1024/1024 medium, 1024/1024/512 low. **At the home view: r0 28.6, r1 97, r2 350 m; texels 1.9 / 9.5 / 34 cm** | L `shadows.ts:11, 48-86`; L `index.ts:46-49` |
| Haze | `uHaze.x` per metre: 0.0006 default, 0.00065 title, 0.0008 clear, 0.0009 cloud, 0.001 overcast, 0.0015 rain, 0.0016 fog, 0.002 storm, 0.0026 snow, +0.0002 harvest dust. Falloff 0.0085 per metre of height. **Faded in only between 60 and 320 m of path** ("the farm itself stands in clear air"). Koschmieder visibility 3.912/β: 0.0006 → 6.5 km | L `env.ts:53, 67-73, 107, 163`; L `index.ts:436`; L `shaders.ts:31, 150` |
| Mist | density (0.36 − 0.24·deep)·mist, falloff 2.6 − 1.5·deep per metre, base 0.2 + 1.9·deep m, patchiness 0.8. Path capped at 400 m. Bank noise at 0.0071 and 0.031 per metre (~140 m and ~32 m banks) | L `index.ts:440`; L `shaders.ts:153-155` |
| Clouds and gusts | cloud layer `CLOUD_H = 420` m, field at 0.0015 per metre (~670 m clouds); gust fronts at 0.021 / 0.0078 per metre (~48 m) | L `shaders.ts:104-117` |
| Crop level of detail | whole plants out to near 36 / 26 / 17 m, clumps to far 280 / 180 / 110 m (high / medium / low), then rows painted on the soil. Chosen per field, by distance to the nearest point of the field rectangle | T `fields.ts:37, 918-926, 978-1010` |
| Geometry triangle counts (measured) | plant 72, clump 28, blossom 40, oat tuft 36, grass clump 54; trees 38-720 depending on model | `count.ts` |
| A day's replay | 3.4 s; segments split the day evenly (travel weight 0.6) whatever their length | P `index.ts:31`; P `work.ts:398-406` |

### 1b. Present ratios

- Field width to barn length: 14.4 / 6.0 = **2.4**. Field width to house length: 14.4 / 3.6 = 4.0. A real farm is about 10-25 [unverified].
- Person height to field width: 1.81 / 14.4 = **0.126**: a field is 8 people wide. Real: 1.8 / 150-300 m ≈ 0.006-0.012.
- Tractor length to field width: 3.4 / 14.4 = 0.24.
- Person to door height: 1.81 / 0.90 = **2.0**. Real: 0.9.
- Road width to tractor width: 1.42 / 1.95 ≈ 0.73. Real: about 2.
- The tractor's wheels straddle 4.4 rows at 0.34 m. A real tractor at 1.83 m track straddles 2 rows at 0.91 m.

---

## 2. How the simulation uses parcel coordinates, and how to grow the land without touching it

### 2a. What the simulation reads

Parcel and yard `x, z` (`src/sim/farm.ts:33-71`) reach the simulation through one function: `distance(a, b)`, the Manhattan distance "by the farm roads" (`farm.ts:85-89`, through `placeXZ` at 80-82). Its users:

- `travelDays = distance × TRAVEL_DAYS_PER_UNIT (0.0016)` (`crew.ts:15-17`, `params.ts:116`). Used by `buildings.ts:102`, `view.ts:498`, `ui/almanac.ts:119`, and by the renderer only to turn the crew's remaining road into a 0..1 `along` (`render/state.ts:202-210`).
- The haul surcharge `1 + HAUL × max(0, haulDistance − HAUL_FREE)` with HAUL 0.014 and HAUL_FREE 51 (`season.ts:134-140`, `params.ts:130-131`).
- The blight jump rate: full within `JUMP_NEAR = 30`, half beyond (`season.ts:964-967`, `params.ts:72`).
- The 2D map, `ui/map.ts:63`, through `placeXZ`.
- Hills: `HILLS = ROWS × COLS` is an abstract grid. The simulation never sees hill metres.

**So the simulation has no metric dependence on the renderer.** Its unit is a "plan unit" that today happens to equal the renderer's metre. The renderer can map plan to world any way it likes, as long as topology is kept (which field is next to which; the yards beside their blocks). The 2D map keeps drawing in plan units and stays consistent. The only change on the simulation side is the comment in `farm.ts:2`, which should then say plan units, not "the field view's ground units".

The renderer never derives timing from route length. A segment's progress is a share of the day (P `units.ts:640-660`), so longer world routes cost nothing in the simulation.

### 2b. The clean mapping

Add one module, `src/render/scale.ts`, owned by the layout writer:

```ts
export const K = 8                 // land: plan units (the simulation's) to metres
export const KV = Math.sqrt(K)     // relief: heights of the farm's own slope (10.7% today -> ~3.8% at K 8)
export const S = 2.2               // made and grown things: from today's ~0.45 scale to true size
export const land = (v: number) => v * K
// An island: a yard drawn at true size round its anchor, which sits where the land puts it.
export const island = (P: {x:number;z:number}) => (p: {x:number;z:number}) => ({ x: K * P.x + S * (p.x - P.x), z: K * P.z + S * (p.z - P.z) })
```

Then in `layout.ts`:

1. **Fields**: `cx = land(p.x)`, `cz = land(p.z)`, `FW = land(14.4)`, `FD = land(10.88)`. `FIELDS`, `fieldAt`, `hillPos` (with `SX = FW/COLS`, `SZ = FD/ROWS`), `fieldMask`, picking quads (L `index.ts:368-372`) and the 2D fallback (T `fallback.ts:41-45`, which fits to the FIELDS bounds) all follow with no further edits.
2. **Rows decoupled from hills.** `ROW = 0.91` and `PLANT = 0.25`, the UMaine figures. `PLANTED_ROWS = round(FD/ROW)`, `PLANTS_PER_ROW = round(FW/PLANT)`. The plant shader already finds its hill from world position (`huv = (aAt.xz − uRect.xy) × uRect.zw`, T `fields.ts:61`), so dropping the integer `SUB` per hill costs nothing there. `SUB` now only feeds `SX`/`SZ`.
3. **Plan-unit layout numbers**, all × K: lanes (`LANE_*`, T `layout.ts:161`), headland x (−16.4, −0.3, 15.8), `WALLS`, `BLOCKS`, `LAND`, `FARM`, `HOME_WOODS`, `WOOD_GAP`, `SADDLE`, `FORD.x`, `brookZ` path, `townRoadZ`/`hillRoadZ` offsets, tract lines, `parkSpot` corners. **Widths, radii and heights stay true** and take S: road ribbons, brook half-width, pads' rx/rz, wall stones, route's 2.5 m short hop, `parkSpot`'s 1.0/2.9/0.62 offsets.
4. **Yards as islands**: `yardHome = island({x: 23.7, z: -6.6})`, `yardDufour = island({x: 93, z: -6})`. Everything in a yard maps through it:
   - in T and B `layout.ts`: `HOUSE`, `BARN`, `POTATO_HOUSE`, `DUFOUR_*`, `PADS`, `YARD_AT` boxes, `SITES`, `BAYS`, `LOG_DECKS`, `STONE_PILE`, `TRUCK_SPOT`, `IMPLEMENT_SPOTS`, `KEEP_CLEAR`, `YARD_WAYS`, `SHED_SPOT`, `yardSpot`, `POND`/`POND_AT`
   - in P: `work.ts` `DOORYARD`, `GATE`, `CALLER`, `BUYER`, build spots; `units.ts` `DOOR`, `PORCH`
   - in T: `flora.ts` dooryard maples and spruce; `terrain.ts` trodden-yard centres 23.6/91.5 and 'trod' 21,−5

   Polylines that join an island to the land (`ROAD`, `DUFOUR_ROAD`, `DUFOUR_DRIVE`) need each point tagged with its frame (`land` or `yard`).
5. **Relief**: `fieldBaseY(z) = KV × profile(z / K)` inside the farm. Re-author `KNOTS` in metres: near knots (|z| ≤ ~150 plan) at (K·z, KV·y); the far ridge and hills kept where they are physically (−1,500 / −2,300 / −3,600 m and 1,500 / 3,600 m), pushed out only where the scaled near range now overlaps them (at K 8 the near range reaches about −1,200 m).
6. **The country**: `regionAt` and `QUILT_GLSL` share `REGION = 120`, but the strip width `12 + 14·hash` and the woods `smoothstep(700, 2400)` are written twice (T `layout.ts:495-499`, T `terrain.ts:74-77`). The neighbours' strips must grow with our fields, so REGION and width go × K, or neighbours farm garden plots beside our big fields. Put the numbers in one exported object that both read.

### 2c. What a simulated hill covers at K

| K | Field (m) | Field area | Hill (m) | Plants per hill, today's spacing 0.30×0.34 | Plants per hill, true rows 0.25×0.91 | Screen px of a hill at home view (framing kept) |
|---|---|---|---|---|---|---|
| 1 (today) | 14.4 × 10.9 | 157 m² | 1.2 × 1.36 | 16 | (6) | 39 |
| 4 | 58 × 44 | 0.25 ha (0.62 ac) | 4.8 × 5.4 | 256 | 115 | ~39 |
| 6 | 86 × 65 | 0.56 ha (1.4 ac) | 7.2 × 8.2 | 576 | 258 | ~39 |
| 8 | 115 × 87 | 1.0 ha (2.5 ac) | 9.6 × 10.9 | 1,024 | 459 | ~39 |
| 10 | 144 × 109 | 1.57 ha (3.9 ac) | 12 × 13.6 | 1,600 | 718 | ~39 |
| 12 | 173 × 131 | 2.26 ha (5.6 ac) | 14.4 × 16.3 | 2,304 | 1,034 | ~39 |

Because the camera fit keeps the farm's framing, a hill stays about 39 px on screen at the home view whatever K is. Hill-level information stays readable at the strategic view. What breaks is how it reads close up: a 10 m square of uniform state is plainly a grid. Keeping the hill grid readable without looking blocky:

- **Blight, yellowing, wilt and stunting**: these are continuous shares per hill (`G = 8` values per hill in two RGBA 12×8 DataTextures, T `fields.ts:20-21, 61-63`).
  - Sample the hill textures at a domain-warped point: `huv + (noise(world×0.2) − 0.5) × 0.5 texel`. Hill boundaries then become ragged.
  - Turn a share into the fraction of plants showing it. A plant shows blight when `own < blight × focus(world)`, where `focus` is low-frequency noise. Lesions then sit in foci that grow, not in checkerboards.
  - Use the same lookup in the painted-rows path (`cropColor`, T `fields.ts:218-248`) so near and far agree.
- **Digging**: `dug` is binary per hill and revealed by arc length along the work path (P `work.ts:357-366`, `units.ts:680-690`).
  - At K 8 a hill row is 10.9 m deep, about 12 planted rows, so a 2-row digger (1.8 m) needs about 6 passes. Make `serpentine` (P `work.ts:206-224`) lay `ceil(SZ / implementWidth)` passes per simulated row.
  - Keep the simulation's per-hill reveal, but open the soil in render-only strips behind the machine. A hill is shown dug up to the pass the tractor has finished.
- **Test digs** lift one hill. Stage them on one plant at the hill's centre, and add a screen-space flag or stake so a test dig shows from the strategic view, where a plant is 3-4 px.
- **Tramlines** are hard-coded at planted rows 7.5 and 23.5 (T `fields.ts:77-81`). They become every N rows, with N matching an 18-24 m sprayer boom.
- **Option**: a faint 12×8 hill grid on the selected field at strategic zoom. This is how RTS games make a cell grid legible.

---

## 3. Everything K touches: the work list

Legend:
- **K**: scales with the land
- **T**: stays true size (and takes S if it is today a made or grown thing at ~0.45 scale)
- **R**: needs redesign, not scaling

### Layout and terrain (owner: T, the terrain, layout, woods, crops and water writer)

| File:line | Item | Class |
|---|---|---|
| `layout.ts:6-14` | `SUB`, `ROW`, `PLANT`, `SX`, `SZ`, `FW`, `FD`, `PLANTED_ROWS`, `PLANTS_PER_ROW` | R (decouple rows from hills; true rows) |
| `layout.ts:19-22` | `FIELDS` from `PARCELS` | K |
| `layout.ts:27-37` | `FARM`, `FARM_CENTER`, `BLOCKS`, `LAND` | K |
| `layout.ts:43-70` | `KNOTS`, `profile` | R (re-author in metres; near × K and × KV) |
| `layout.ts:72-101` | `outside`, `ridgeRise` (x/85, z/150, −34..−250), `wander` (520, 1100, ×70), `macroY` (220, 1400, 340, 90) | K for distances tied to the farm (the ridge's z band); T for the country's noise wavelengths |
| `layout.ts:103-116` | `brookZ` wiggle wavelengths, `brookHalf`, `FORD` | path K; width T × S |
| `layout.ts:118-148` | `HOUSE`, `BARN`, `POTATO_HOUSE`, `DUFOUR_*`, `YARD_AT`, `PADS` | island (anchor K, local T × S) |
| `layout.ts:161-213` | `LANE_*`, `ROAD`, `SPURS`, `DUFOUR_*`, `WAYS` | K, except yard points (island) |
| `layout.ts:227, 323` | `wayDist` reach 4; `route` short hop 2.5 | T |
| `layout.ts:388-414` | `groundY`: brook bank 7 m, pads, road blend 0.6-1.6, fieldMask pads 0.7/7/15, swells at x×0.045 / z×0.06, bumps ×0.23 | blends T; swell wavelengths K or √K (meadow swells between bigger blocks) |
| `layout.ts:433-442` | `WALLS` | ends K; stones T × S |
| `layout.ts:453-467` | `SHED_SPOT`, `yardSpot`, `parkSpot` | island / T offsets from a field corner |
| `layout.ts:471-518` | `REGION`, `HOME_WOODS`, `WOOD_GAP`, `regionAt` width 12+14, `openCountry` (−26, +4, −6..10) | K (and keep in step with `terrain.ts` QUILT) |
| `layout.ts:521-554` | `TRACT_LINE`, `woodFront` bays (×0.043 wavelength, 9 m depth), `ridgeWoodAt` margins | wavelength and depth K or √K; margins T |
| `layout.ts:579` | `POND` | island |
| `terrain.ts:122` | grid 0.6 m out to LAND ± 4.2 and ±64.2, growth 1.065 to 3,600 | **R**: at K 8 the inner grid alone is 2,192 × 1,712 = 3.75 M verts (~180 MB of attributes). Needs a camera-centred clipmap or CDLOD over a baked heightmap |
| `terrain.ts:129-142` | `home` box ±64.5, yard centres 23.6/91.5, gravel 2.2/4, wall 3 | box K; yard island; blends T |
| `terrain.ts:56-81, 206-212` | QUILT REGION, woods smoothstep 700-2400, strip width; meadow rect (LAND.x0 − 10, −112, LAND.x1 + 6, −20) | K (single source with layout) |
| `terrain.ts:286` | wildflowers' `fwidth` fade | T |
| `terrain.ts:373` | snow 'trod' circle at (21, −5), 16-26 m | island |
| `terrain.ts:420-429` | ribbon widths 1.42 / 1.35 / 1.3 / 2.4; long roads ±1,500 m step 6 | widths T × S (4 / 3 / 6.5 m); length beyond the scaled land |
| `terrain.ts:447` | brook ribbon x −460..470, fine within 90 m of x 20 | K for the range |
| `terrain.ts:531-594` | walls 0.17 / 0.21 m stone spacing; ruined wall x −18..16; boulders at x 6..42, z −26..−78 | **R**: at K 8 about 19.7 k stones and 1.6 M tris. Instanced stones within ~100 m, a textured ribbon beyond. Areas K, stones T × S |
| `fields.ts:37` | `LOD` near/far by tier | **R** (camera-local plant window, below) |
| `fields.ts:42-46` | `PIXEL`, `UI_GAIN`, `MARK_WIDE` | T (screen-based); `MARK_WIDE`'s divisor is fixed in L `index.ts` |
| `fields.ts:77-81` | tramlines at rows 7.5 / 23.5 | R (every N rows by boom width) |
| `fields.ts:165, 411` | soil rim `min(f) × FW/FD` | follows FW/FD |
| `fields.ts:375` | soil mesh nx 48, nz = 8 × planted rows | **R**: K 8 with true rows gives 49 × 769 per field (678 k verts in all). Ridged geometry only in a camera patch; flat with normal or parallax relief beyond |
| `fields.ts:561-660` | per-field instanced plants, clumps and blossoms (all `PLANTS`) | **R** (fixed pool round the camera, procedural lattice) |
| `fields.ts:785` | oats step 0.27 over the whole field | R (same pool scheme) |
| `fields.ts:918-1010` | `lodFor`, `applyLod`, shadow layers | R |
| `geometry.ts:24-218` | plant, clump, blossom, oat, grass shapes | T (true size already); add a "row hedge" strip for the middle band |
| `grass.ts:20-113` | CPU-built over all of LAND at 0.38 m step; CELL 22; REACH 26/170/84 | **R**: grows with K² (1.52 M clumps and 4,672 patches at K 8). Make it GPU-procedural in camera tiles, density from a baked land-use mask |
| `grass.ts:41-47` | clear zones around yards (3.6 m), pond, brook | island / T |
| `flora.ts:234-235` | `CELL 64`, `NEAR_AT 70/50/30` | R (impostor tiers) |
| `flora.ts:264-300` | stand sizes and spacing 1.9 / 2.7; canopy-roll noise ×0.055 / ×0.07 | sizes and spacing T × S; noise √K |
| `flora.ts:302-325` | dooryard trees, Dufour trees, the trees along the road x 33..48, brook-side x −150..170 | island / K for runs |
| `flora.ts:327-345` | country: reach 1,500, cap 11,000, near < 95, far < 330/340, `grow = 1 + d/520` | **R**: the scaled land swallows most of this ring. Reach about 6 km, octahedral impostors, the terrain's canopy shell beyond |
| `flora.ts:348-358` | hedgerows over x −150..200, z −18..150, 1.05 m step | K for the area; R (impostors; grows with K²) |
| `flora.ts:520-541` | tract stand step 1.5 / 0.98 | T × S spacing; stand count grows with K² (each felled tree can stand for several in the simulation's `felled` share) |
| `flora.ts:641-645` | neighbours' `FARMSTEADS` | K (positions); buildings T × S |
| `clearing.ts:206-246`, `pond.ts` | piles along a tract and the pond, from FW/FD and fixed offsets | spans follow FW/FD; offsets T |

### Light, sky, lens, camera (owner: L)

| File:line | Item | Class |
|---|---|---|
| `camera.ts:13` | `MIN_DIST 7.5` | T (walker's eye) |
| `camera.ts:22-24` | `VIEW` pitch, tilt and fov keyed to absolute 7.5..300 | **R**: re-key to `dist / homeDist` (and to `MIN_DIST` at the low end). Otherwise at K ≥ 6 the home view (~250-340 m) takes the 300 m row (pitch 1 rad), looks straight down and loses the horizon, which is the core "massive landscape" image |
| `camera.ts:19` | `CREST 0.082` | re-measure against the new far relief |
| `camera.ts:87-92` | `FARM_MARKS`, `ALL_MARKS` literal points (27.4, −20.5; 96, −6; …) | island / K |
| `camera.ts:97-101` | `TITLE` poses (x, z, dist) | K (positions, dist) |
| `camera.ts:122, 256, 365` | `profile(clamp(z, −40, 50))` | K for the clamp, then follow the new profile |
| `camera.ts:126-127` | near 0.04×dist clamped 0.2..3; far 9,000 | R: at ~1 km with near 3, depth resolution ≈ z²/(near·2²⁴) ≈ 2 cm, which fights road lifts of 0.035 m. Use a reversed depth buffer (three supports one; check 0.187's flag) or raise lifts and polygonOffset |
| `camera.ts:202, 239, 273` | fit clamp 16..420; field view 22..46; bound ≥ 70 | K |
| `camera.ts:259` | `ground()` far = dist×3.2 + 40 | +40 → ×K |
| `shadows.ts:50-54, 75` | r0 cap 66, r1 230, r2 820; holdsFarm r0 > 44; back 160/320/700 | **R**: at K 8 home (~336 m) all three caps bind and the farm's shadows come from the 820 m map (0.8 m texels). Raise the caps to about r0 0.4×dist (≤ 250), r1 ≤ 900, r2 ≤ 3,000, with back distances to match. Only the plant window casts into cascade 0 |
| `shaders.ts:31, 150` | haze density; clear-air ramp 60→320 m | density **T (physical)**: lower it toward 0.00015-0.0003 per metre (visibility 13-26 km) so a 1 km farm gets 10-25 % aerial perspective, not 40 %. Ramp → ×K or drop it |
| `shaders.ts:153-155` | mist bank noise 0.0071/0.031; path cap 400 | banks ×√K; cap ×K. Falloff and base heights T |
| `shaders.ts:104-110` | gust fronts ~48 m | ×√K..K ("broad enough to follow over a field") |
| `shaders.ts:115-117` | `CLOUD_H 420`, cloud scale 0.0015 | T: move toward physical (cloud base 1,000-1,500 m); keep the cloud size. Cloud shadows crossing 100 m fields help the scale read |
| `env.ts:67-73, 107, 163` | haze by sky | T (as above) |
| `far.ts:10-14` | far ridge rings 4.7-7.9 km | T (physical); maybe push out once the near land reaches 1.2 km |
| `index.ts:321` (T `index.ts:297`) | `FD × 0.8` "far" move test | follows FD |
| `index.ts:573, 583, 587` | weather `span = dist/26`, `MARK_WIDE = dist/42`, harvest `dist/30` | R: divide by the home distance, not a literal |
| `index.ts:46-49` | tier table (shadow sizes, density) | add the plant-window, grass-pool and impostor budgets per tier |
| `sky.ts:175-176` | sky haze uses the same `uHaze` / `uMist` | follows |
| `birds.ts:27` | flocks at x 16-60, height 11-20 | K for range; height T |
| `weather.ts:57, 76, 95` | rain and snow boxes 70×44×70 × span | follow `span` |
| `post.ts:49` | AO radius 0.85 | T |

### Buildings and yards (owner: B)

| File | Item | Class |
|---|---|---|
| `layout.ts` (B) `YARD_AT`, `SITES`, `POND_AT`, `LOG_DECKS`, `STONE_PILE`, `BAYS`, `TRUCK_SPOT`, `IMPLEMENT_SPOTS`, `KEEP_CLEAR`, `YARD_WAYS`, `PADS` | the yard plan | island |
| `farmstead.ts`, `sites.ts`, `arch.ts`, `builder.ts`, `yard.ts`, `props.ts` | every dimension | **T × S**: a scale on the builder (`b.at` / `push` with a uniform scale) is cheaper than editing numbers, but finish detail (window bars, trims, shingle) then needs a look |
| `tests/yardplan.test.ts` | sites clear of roads and each other | follows the island; keep it as the check |

### People and machines (owner: P)

| File:line | Item | Class |
|---|---|---|
| `units.ts:468-470` | enlargement with distance: machines up to 1.38×, people up to 1.8×, targets 64 px / 50 px | **R**: at K 8 home view (~4 px/m) a person is 7 px true and 13 px boosted; a tractor 14 px and 19 px boosted. Needs a screen-space icon and marker layer at strategic zoom (the ring and paper "sign" already exist, `units.ts:111-122` in main), with the true model as you zoom in |
| `units.ts:474` | `far = smooth(22, 55, dist)` | divide by home distance |
| `units.ts:125, 313, 993-995` | deer at (6.5, −22.3), the pickers' road from (23.4, −15.6), `DOOR`, `PORCH` | K / island |
| `units.ts:646` | travel share `(lw + lt) / 150` | ×K, or the drive eats 40 % of every work segment |
| `work.ts:130-155` | `DOORYARD`, `GATE`, `CALLER`, `BUYER`, `OFF_FARM`, build spots | island (these build spots also disagree with B's `SITES`, a merge item between writers) |
| `work.ts:206-234` | `serpentine` one pass per simulated row; headland swing ≤ 1.1 m; scout walk with 1.2 m margins | R (passes by implement width; true turning radius ~5-6 m on 10-15 m headlands) |
| `work.ts:398-406` | segments split the day evenly | unchanged. At K 8 movement close up is K× faster in m/s. On screen at the home view it is identical, because the camera is K× further back |
| `tractor.ts:446-475` | bounce and shake from distance moved; dust every 0.05 s, cap 900 (`particles.ts:8`) | T. Dust trails go dotted at K× speed (minor) |
| `stage.ts`, `crew.ts`, `prims.ts`, `animals.ts` | site staging scaled by `big` | T |
| `harvest.ts:122, 162` | tuber scatter ± SZ×0.8 | R: SZ becomes 10 m. Use the implement width |

### Tools (all owners)

| File | Item | Class |
|---|---|---|
| `tools/render/shots.ts` | 11 poses in main, 14 in L, 24 in T, 32 in B, 43 in P, with literal x/z/dist; field centres hard-coded (`[[−8.4, −14], …]`) | **R**: let `__countyField.view()` take plan coordinates or a field index with (u, v) and convert through `scale.ts`. Then every pose survives a change of K |
| `tools/render/budget.ts:144`, `perf.ts:107` | "close along the rows" at {x 5, z 12.4, dist 9} | same |
| `tools/render/framing.ts` (L) | asserts the home and whole fits | keep; it is the browserless check for the camera work |

---

## 4. Triangle and instance counts at K 4, 6 and 8

### 4a. Under the present schemes, scaled

Measured base (K = 1, T worktree): plants 1,536 per field; grass 23,793 clumps; trees 1,709 near-capable + 298 stand + 1,076 back + 11,038 far; terrain 371 k tris; walls 197 k tris.

**Crop, worst normal view** (camera low in a field, high tier, blossom season, today's spacing 0.30×0.34). Whole plants 72 tris, clumps 28 tris at half density, blossom 40 tris.

| K | Plants per field | Whole-plant field | Clump fields within 280 m | Blossom | Crop total (main pass) | With shadow passes |
|---|---|---|---|---|---|---|
| 1 | 1,536 | 0.11 M | 17 × 21.5 k = 0.37 M | ~0.58 M | ~1.06 M | ~1.4 M |
| 4 | 24,576 | 1.77 M | ~8 × 344 k = 2.75 M | ~1.4 M | **~5.9 M** | ~9 M |
| 6 | 55,296 | 3.98 M | ~6 × 774 k = 4.6 M | ~3.1 M | **~11.7 M** | ~17 M |
| 8 | 98,304 | 7.08 M | ~5 × 1.38 M = 6.9 M | ~5.4 M | **~19.4 M** | ~28 M |

With true rows (0.25 × 0.91 = 0.2275 m² per plant against 0.102 today) divide by 2.2: K 8 is still about 9 M plus shadows. The instance buffers for all 18 fields at K 8 come to 1.77 M plants (28 MB of `aAt`). Field counts within 280 m are estimates from the scaled layout.

**Grass** (built over the whole land; clump count grows with K²; build time scales from the measured 51 ms):

| K | Clumps built | Patches (draw objects) | Build time (estimate) | Visible tris, camera low in the meadow |
|---|---|---|---|---|
| 1 | 23.8 k | 73 | 51 ms | ~0.3-0.8 M |
| 4 | 381 k | 1,168 | ~0.8 s | ~3-5 M |
| 6 | 857 k | 2,628 | ~1.8 s | ~4-5 M |
| 8 | 1.52 M | 4,672 | ~3.3 s+ | ~5 M |

Visible tris saturate because sward stops at 84 m and thins as (26/d). Once meadow surrounds the camera, the visible load is about 8 clumps/m² × 11.6 k m² × 54 tris ≈ 5 M. Each patch also owns its own material object.

**Trees** (today's sizes and densities, grown with K² over the ridge woods, the back of the ridge and the stands; the far ring stays capped):

| K | Near-capable | Back | Stands | If all were in view (far models, ~120-190 tris) | In a typical home-view frustum (~40 %) plus shadows |
|---|---|---|---|---|---|
| 1 | 1.7 k | 1.1 k | 0.3 k | 0.53 M (all three classes) | — |
| 4 | 27 k | 17 k | 4.8 k | ~7.8 M | ~3 M + shadows |
| 6 | 62 k | 39 k | 11 k | ~17.6 M | ~7 M + shadows |
| 8 | 109 k | 69 k | 19 k | ~31 M | ~12 M + shadows |

At true size (S = 2.2, so density ÷ ~4.8), K 8 drops to about 6.4 M tris if all were in view. That is still too much without impostors.

**Terrain** at today's 0.6 m inner grid: K 4 about 0.94 M verts, K 6 about 2.1 M, K 8 about 3.75 M (7.5 M tris). **Walls** at K 8: about 19.7 k stones, 1.6 M tris.

**Verdict**: under today's schemes K 4 already lands near 15-20 M tris in a bad frame. That is well past a 60 fps budget on an RTX 2080 Ti in WebGL with alpha-to-coverage foliage, and an order of magnitude past integrated graphics. The ceiling is the schemes, not K.

### 4b. A scheme that holds 60 fps at 1920×1080 on a 2080 Ti and still runs on integrated graphics

The principle, as Farming Simulator's foliage system and most open-world grass renderers do it: **detail is budgeted round the camera, never per field or per land area.** The land's state lives in textures (the 12×8 hill maps, a land-use mask, a heightmap). Geometry is drawn from a fixed pool whose positions are computed in the vertex shader from the instance id and a camera-snapped origin.

| Layer | High (2080 Ti) | Low (integrated) | Tris high / low |
|---|---|---|---|
| Crop, whole plants | lattice window radius 30 m round the camera's nearest ground: ≤ 12.4 k plants (true rows); drawn only where `fieldAt` and hill state say so | radius 12 m, half density: ~1 k plants | 0.9 M / 0.07 M |
| Crop, middle band | 30-100 m: one "row hedge" strip per row (canopy cards, ~4 tris per 2 m per row; ~35 km of row in the annulus) | 12-40 m | ~0.07 M / ~0.02 M |
| Crop, far | painted rows (they exist) plus parallax relief at grazing angles, 0 tris | painted only | 0 |
| Blossom | inside the plant window only; painted flecks beyond (exists) | same | ≤ 0.5 M / 0.04 M |
| Crop shadows | plant window into cascade 0 only | none (painted contact shade) | 0.9 M / 0 |
| Grass | GPU-procedural pool ≤ 25 k clumps within 60 m; the terrain shader's meadow beyond (it already moves with the gusts) | ≤ 6 k within 30 m | 1.35 M / 0.32 M |
| Trees | whole ≤ 120 m (~1-2 k), low-poly 120-350 m (~4 k), octahedral impostors beyond (≤ 60 k × 2 tris), canopy shell in the terrain past ~2 km | whole ≤ 50 m, impostors from 150 m | ~1.3 M / ~0.3 M |
| Terrain | CDLOD or clipmap, 4-5 rings of 128², heights from a baked 1 m map of the farm (K 8: about 1,300 × 600 m → 0.8 M texels, ~3 MB R32F) and coarse beyond | 3 rings | ~0.15 M / 0.08 M |
| Walls | instanced stones ≤ 100 m, ribbon beyond | ≤ 40 m | ~0.2 M / 0.05 M |

Main pass totals: about **3.5-4.5 M tris on high** with about 1.5 M in shadow passes, and **under 1 M on low**. The count is independent of K, so K becomes a tuning knob, not a cost.

At the strategic view (camera ~250-340 m) the nearest ground is ~150-200 m from the eye. The plant window and grass pool are then empty and the cost is lowest exactly where the whole farm is on screen.

Startup work leaves the main thread. Grass and plants need no CPU build. Trees need only a placement list, which can be generated per chunk on demand.

These budgets are design estimates. They need measuring with `tools/render/perf.ts` and `budget.ts` on mizepc2's GPU (renderer.info triangle and call counts, frame time) and on one integrated-graphics machine.

---

## 5. Risks and recommended order

### Risks

1. **Scale premise.** The made and grown things are at ~0.4 scale (section 0). Rescaling the land alone makes close views absurd. Decide S at the same time as K.
2. **Four writers are in the same files now.** `layout.ts` is changed in T and B. `index.ts` and `tools/render/shots.ts` are changed in all four. Yard positions are duplicated and already disagree (P `work.ts:145-155` build spots against B `layout.ts` `SITES`). A K change spread across these worktrees would conflict everywhere. Merge or freeze them first, then do the rescale with one owner of `scale.ts` and `layout.ts`.
3. **Cost grows with K² under today's schemes.** Crop, grass, trees, terrain and walls (section 4a). The camera-local redesign is the critical path. Without it even K 3-4 is not shippable on integrated graphics.
4. **The camera's pitch table is absolute.** At K ≥ 6 it would turn the home view top-down and lose the horizon. Re-key it first: it is the cheapest change and the one most visible to the owner.
5. **Readability at the strategic view.** People and machines drop to 7-19 px at K 8. Units need screen-space icons; order and selection marks need screen-sized widths. Hill squares need ragged edges close up.
6. **Duplicated numbers.** QUILT in GLSL against `regionAt` (woods versus painted woods). Yard points in five files. The camera's literal marks. `profile` clamps in the camera. One missed site misplaces trees, people or framing.
7. **Depth precision** at 1 km with near clamped at 3 m (road and track ribbons fight the ground).
8. **Shadow caps** leave strategic-view shadows to the coarse 820 m map. The holdsFarm switch must be re-derived.
9. **Haze tuned for a 150 m world.** It fades in between 60 and 320 m and uses 6.5 km visibility. Over a 1 km farm, haze is either absent at the near edge or heavy at the far edge.
10. **Load time.** CPU-built grass, trees and terrain grow with K² (a measured 0.3 s total today, an estimated 4-6 s at K 8 on a laptop).
11. **Capture and regression tools.** More than 100 literal poses across the worktrees break at once.
12. **What is not at risk**: the simulation. It reads only plan-unit Manhattan distances (section 2a). The simulation test suite (`tests/farm.test.ts`, `properties.test.ts`, `regressions.test.ts`, `save.test.ts`, `bots.test.ts`) should pass unchanged, which proves the simulation was not touched.

### Recommended order

1. **Decide S, K and KV against a blockout.** Land plane, field rectangles, box buildings at S 1 and S 2.2, a figure and a tractor, all at K 6, 8 and 10. Show it on mizepc2 before any writer starts. My recommendation is **S 2.2, K 8 (1 ha fields, field-to-barn ≈ 115/13 ≈ 9), KV ≈ √K**, tunable 6-10.
2. **Land the four in-flight worktrees** (or freeze them).
3. **`scale.ts` and `layout.ts`** (T): fields, plan-unit layout, islands, relief, quilt in one place, true road and brook widths. Check: the simulation suite unchanged; `tests/yardplan.test.ts` passing through the island; a new scale-audit test that asserts:
   - door height 2.0 ± 0.2 m against a 1.8 m person
   - road width ≥ 1.8 × tractor width
   - rows 0.86-0.91 m
   - field ≥ 7 × barn length
4. **Camera** (L): `VIEW` re-keyed, clamps, field view, title, bounds, depth. Check: `node tools/render/framing.ts` passes at all six window sizes.
5. **Terrain** (T): clipmap or CDLOD, field soil, roads, walls with level of detail.
6. **Crop** (T): true rows, plant window, hedge band, painted and parallax rows, ragged hill lookups, tramlines.
7. **Grass and trees** (T): procedural grass pool; true-size trees with impostors; country reach.
8. **Buildings** (B): S on the builder; yard islands; machine-shed bays that fit the tractor.
9. **People and machines** (P): icon layer, enlargement caps against home distance, serpentine by implement width, harvest scatter, island spots.
10. **Light** (L): cascades, physical haze and mist, cloud height, gusts.
11. **Tools**: poses in plan or field coordinates; then measure with `perf.ts` and `budget.ts` on mizepc2 at 1920×1080 (target 60 fps) and on one integrated GPU.

### What shows the result is right, other than the owner or me

- `tools/render/framing.ts` (browserless) for the camera.
- The scale-audit unit test above: real-world ratios as assertions.
- The untouched simulation suite.
- `renderer.info` triangle and draw-call counts and frame times from `perf.ts` on the 2080 Ti box and an integrated GPU, against the budgets in 4b.
- A side-by-side of a top-down frame against an aerial photo of an Aroostook farm at the same metres per pixel: field, row, road and building sizes should line up.

### Unverified

- Real field and farm sizes for 1980s Aroostook.
- True building, road and tree sizes (from domain knowledge, not fetched).
- All of section 4b's budgets.
- The build-time scaling for grass and trees.
- Field counts within 280 m at each K.
- Whether three 0.187 exposes a reversed depth buffer on WebGL2.

The row and in-row spacing come from UMaine Extension Bulletins #2412 and #2419 (34-36 in rows; 7-12 in, organic 8-18 in, in the row):
- https://extension.umaine.edu/publications/2412e/
- https://extension.umaine.edu/publications/2419e/
