# The County: scale

How big things are, why, and how that is checked. Written before the world was rescaled; the "as built" section at
the end is filled in by the pass that does it.

## Why this exists

The owner, after playing: "fields need to be much bigger in comparison to the homes etc think real farm but within
reason the landscape needs to feel massive and much bigger".

Measured from the scene's own code before the rescale: a field was 14.4 by 10.9 units, 2.4 barn lengths wide and
about the area of fifteen farmhouses. On a real farm in northern potato country a field is 7 barn lengths wide
(typical) and 400 house footprints in area. The world had also been authored at about 0.45 of true size and only
partly corrected: a person stood 1.8 units and a tractor was 3.4 long, but the farmhouse door was 0.9 high, the farm
road 1.4 wide and a row of potatoes 0.34 from the next. A farmer was twice the height of the front door.

## The standard

**One ground unit is one metre, for everything.**

| Thing | Size | Source |
| --- | --- | --- |
| Person | 1.8 m | |
| Tractor | 3.5 to 4.0 m long, 2.0 to 2.3 m wide | John Deere 4020: 3.84 by 2.28 m |
| Farm truck | about 6 m long | |
| Two-row digger or planter pass | 1.8 m | two rows at 0.9 m |
| Potato rows | 0.86 to 0.91 m apart, seed 0.18 to 0.30 m in the row | 34 to 36 in rows, 7 to 12 in seed |
| House door | 2.0 m high, 0.9 m wide | |
| Farmhouse | about 8 by 11 m, 8 to 9 m to the ridge (measured median footprint 173 m2 with its ells) | 252 measured farmhouses |
| Barn | 11 by 12 m up to 13 by 32 m, 10 to 12 m to the ridge, a 4 m door | register nominations |
| Banked potato house | 12 by 18 m, floor 2.5 to 3.5 m below the bank | USDA Farmers' Bulletin 847 |
| Machine shed | 9 by 18 m, bays 4 m wide and high | building-plan services |
| Farm lane | 3 m tread; town gravel road 5.5 to 6 m | NRCS and town road standards |
| Field-stone wall | 0.8 to 1.2 m high, about 0.8 m wide | |
| Spruce and fir | 15 to 25 m; maple and birch 18 to 25 m | USDA Silvics |
| A field (real) | 2 acres is 127 by 64 m; 5 acres 201 by 101 m; the district's median 16.6 acres, 386 by 214 m | 384 measured fields |

The full tables, with every source and how well each figure is supported, are in `docs/research/scale-real.md`;
what shipped games do is in `docs/research/scale-games.md`; the audit of the scene's code is in
`docs/research/scale-code.md`.

## What is compressed, and what is not

Every strategy game compresses the land; the choice is where. Shipped games put a field at 3 to 5 building lengths
(Manor Lords and Ostriv measured at 4 to 5); reality is 7 and up. People read scale from a few things they know the
size of, so those stay true and the compression is taken where it is least seen:

- **True size, always:** people, machines, doors, buildings, roads, walls, trees, and the spacing of the potato rows
  (the rows across a field are the ruler the eye uses).
- **Compressed in number, not in size:** the farm has fewer and smaller fields than a real one (a field here is
  about 2.5 acres where the district's typical field is 15), fewer rows of woods, shorter roads, nearer neighbours.
- **Not compressed at all:** the distance to the horizon. Country goes on past the map.

## The numbers

Two factors take the scene from what it was to the standard (`src/render/scale.ts`):

- **S = 2.2** on everything made or grown that was drawn small: buildings, roads, walls, trees, row spacing. After
  it, one unit is one metre.
- **K = 8** on the land: where things are. A field becomes about 115 by 87 m (1.0 ha, 2.5 acres), 6 to 9 barn
  lengths wide and about 100 house footprints in area; the six home fields with their lanes cover about 250 by
  290 m; the whole map is about 1.3 km by 0.6 km. K is chosen from a blockout at 6, 8 and 10 and may move within
  that range.
- The farm's own slope grows by the square root of K, so the land rolls without becoming a hillside.

The simulation is not touched: it knows parcels by its own plan coordinates (`src/sim/farm.ts`), and travel and
hauling are worked out from those. Only the renderer's mapping from plan to ground changes, so the balance holds.
One simulated hill (a field is 8 by 12 of them) then covers about 10 by 11 m and about 450 plants; its blight,
wilt and digging are drawn as ragged patches and worked strips inside it, never as squares.

## What the bigger land needs

- **Detail follows the camera, not the land.** Whole plants, grass and whole trees are drawn from fixed pools in a
  window round the camera; beyond it rows are strips, then paint; trees are simpler, then impostors, then canopy.
  The cost of a frame then does not depend on K.
- **A camera in tiers:** yard, field (the default: three to five fields in frame, the one in hand about a third of
  the width), farm, and county.
- **People stay findable:** at the default view a person is about ten pixels tall, so each carries a marker of
  constant size on screen in their own colours, and picking is generous.
- **Big, not empty:** walls and tree lines on field edges, lanes that run to a vanishing point, lone trees, poles
  and wire, neighbours' farmsteads, cloud shadow crossing, haze by real distance, and country beyond the map.
- **No miniature look:** no strong shallow focus from the playing view (it makes a landscape read as a model).

## How it is checked

- `tests/scale.test.ts` asserts the standard from the layout's own numbers: a door 2.0 m (within 0.2) against a
  1.8 m person; a farm lane at least 1.3 tractor widths; rows 0.86 to 0.91 m; a field at least 6 barn lengths wide
  and 80 house footprints in area; a machine-shed bay that takes the tractor.
- The simulation's tests pass unchanged, which shows the simulation was not touched.
- `tools/render/framing.ts` checks the camera's tiers at six window sizes without a browser.
- Frame time, triangles and draw calls from `tools/render/budget.ts` on the RTX 2080 Ti at each tier, and the low
  tier on integrated graphics.
- Fresh viewers given one frame are asked how large the field is; the answers before and after are recorded here.
- Blind pairs, before against after: which landscape is larger, and which is more like a real farm.

## As built

(Filled in by the rescale: the K chosen and the frames it was chosen from, the measured ratios, the budgets, the
viewers' estimates, and what remains compressed.)
