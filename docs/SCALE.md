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
  2.5 to 5.6 acres where the district's typical field is 15), fewer rows of woods, shorter roads, nearer neighbours.
- **Not compressed at all:** the distance to the horizon. Country goes on past the map.

## The numbers

Two factors take the scene from what it was to the standard (`src/render/scale.ts`):

- **S = 2.2** on everything made or grown that was drawn small: buildings, roads, walls, trees, row spacing. After
  it, one unit is one metre.
- **K between 8 and 12** on the land: where things are. At 8 a field is about 115 by 87 m (1.0 ha, 2.5 acres), 6
  to 9 barn lengths wide and about 100 house footprints in area, and the whole map about 1.3 km by 0.6 km. At 12 it
  is about 173 by 131 m, 5.6 acres, which is what the simulation has always said a field is (`FIELD_ACRES = 5`: the
  weigh ticket prints "5 acres"), and the map is about 1.9 km by 0.85 km. K is chosen from a blockout at 8, 10
  and 12: the largest at which the playing view still holds the farm and the people stay findable, because a
  field that is the size the ticket says it is leaves nothing to explain.
- The farm's own slope grows by the square root of K, so the land rolls without becoming a hillside.

The simulation is not touched: it knows parcels by its own plan coordinates (`src/sim/farm.ts`), and travel and
hauling are worked out from those. Only the renderer's mapping from plan to ground changes, so the balance holds.
One simulated hill (a field is 8 by 12 of them) then covers about 10 by 11 m and about 450 plants at K 8 (14 by
16 m and about 1,000 at K 12); its blight,
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

### Phase A: one metre for everything, and the blockout K is chosen from

`src/render/scale.ts` holds `K` (12, chosen as below; `VITE_K` builds another), `KV` (its square root, for the
farm's own relief) and `S` (2.2). `layout.ts` is written in metres through them: the simulation's parcels times K;
each yard a true-size island (its plan times S about a frame that moves with K); every width true (farm lane 3 m,
farm road 3.6 m, town road 5.8 m, walls about a metre); rows at 0.9 m and plants at 0.3 m whatever the field's size.
People and machines are drawn at true size and nothing is drawn larger from far off.

Measured by `tests/scale.test.ts` (the same at every K unless said): a person 1.81 m; the house door 0.97 by
1.98 m; the tractor 3.38 m long, 1.95 m wide; the farm lane 1.54 tractor widths; a machine-shed bay 4.69 m wide,
6.82 m deep, 3.30 m to the eave; the barn 9.5 by 13.2 m and 9.7 m to the ridge; the house 6.6 by 7.9 m, 120 m2 with
its ells.

| K | field | acres (the ticket says 5) | rows | barn lengths wide | houses with ells in area | land |
|---|---|---|---|---|---|---|
| 8 | 115 by 87 m | 2.48 | 97 at 0.897 m | 8.7 | 84 | 1.25 by 0.57 km |
| 10 | 144 by 109 m | 3.87 | 121 at 0.899 m | 10.9 | 131 | 1.56 by 0.71 km |
| 12 | 173 by 131 m | 5.57 | 145 at 0.900 m | 13.1 | 189 | 1.87 by 0.85 km |

Whole plants are drawn from one pool in a window round the foot of the picture (72 by 54 m at the high tier), with
painted rows everywhere else; grass is laid in 36 m squares as the camera nears them; whole trees stand along the
front of each wood and thinner ones behind, under a cap. On the RTX 2080 Ti at 1920 by 1080, high tier, home view
with ten fields in crop: 10.8 ms of GPU at K 8, 15.2 ms at K 10, 10.0 to 15.7 ms at K 12 (the machine was shared
for some runs), with 5.2, 8.9 and 11.9 million triangles over all passes; the scene builds in 1.6 s at K 12 and the
first frame comes 4.7 to 7.9 s after the page is asked for, most of it shaders compiling.

**K is 12.** Chosen from the three blockouts (seven fixed views each, with a 100 m scale bar on the plan): it is the
one size at which the drawn field is the field the simulation has always described and the weigh ticket prints (5.57
acres against 5; K 10 gives 3.87 and K 8 gives 2.48); the field is 13 barn lengths wide; from eye level beside the
barn it runs away to the hills as a real one does; and it costs no more per frame than K 10, because detail follows
the camera. What it costs is in the default view: with the whole home farm in frame the barn is about 35 pixels
long and a person 5, so the default view moves in to the field tier (three to five fields in frame) and every
person carries a marker of constant size.

### Phase B: the buildings to the standard

Every building is now the size of a real one, held by `tests/scale.test.ts` (sizes are in `src/render/measures.ts`,
which the drawings and the yards' plan both read): the farmhouse 8.0 by 11.0 m and 8.7 m to the ridge (166 m2 with
its ell and back house, against a measured median of 173); the barn 12.0 by 18.0 m and 10.9 m to the ridge with a
4.1 m door; the banked potato house 12.0 by 18.0 m; the machine shed 9.0 by 18.0 m in four bays of 4.5 m, 4.1 m to
the eave; the bunkhouse 6.2 by 9.2 m (57 m2 for six); the packing shed 9.2 by 15.8 m; the second potato house 10.6
by 15.4 m; the stand 4.8 by 2.9 m; a pole 9.5 m. A field is 9.6 barn lengths wide and 136 houses in area. The yards
were replanned for them and stay compact: house, barn and potato house within 75 m, the whole home yard under a
hectare, shade maples of 15 to 22 m over the house, an orchard, a fenced pasture, a windbreak. Neighbours stand
about every 300 m along both roads; a village with a 30 m spire and a siding with a water tower stand on the horizon.

Not yet done (phase B): the barn and the house are still shorter than the standard's (13.2 m and 7.9 m), markers for
people, the camera's tiers, far trees as impostors, the hill squares' edges, and the viewers' estimates.

### Phase B, the land

- **The crop.** The rows are painted with every stripe averaged over the pixel it falls in, so they carry to the
  field tier without shimmer and fade to a tone beyond it; where whole plants are not drawn each row is a ridge of
  leaf in the ground itself, so the window of plants has no edge. A simulated hill's numbers are read smoothly
  between hills: blight is a ragged dark focus with a yellow halo, dead vine ends at a ragged line, dug ground ends
  along the digger's pairs of rows, frost takes the low places first, and a test dig is a trampled patch with a rag
  on a lath. Fields have headlands at the rows' ends and the sprayer's wheelings every twenty rows.
- **Far fields** are drawn in a few broad faces (past 260 m at the high setting, 90 m at the low).
- **Trees** have three levels (whole within 150 m, simpler to 300 m, simplest beyond, with shadows only in the wide
  cascade); the low setting draws half the far woods. Old pasture trees, a row of maples down the lane, wall-line
  brush and alder along the brook stand on the farm's open ground.
- **The land's end.** The terrain reaches 6.4 km past the farm's own country and the far hills stand at its edge;
  the neighbours' quilt thins to woods by distances that scale with K.

### Phase B, the land, second round

- **Far trees are cards.** Each kind of tree is drawn once, from three heights of eye, into an atlas that keeps what
  the tree's own material colours it from (where on the tree, which way it faces, its shade, leaf or wood); a card
  is then coloured and lit by the tree's own code, so it turns with the season and takes the day's light and the
  snow. Whole trees within 100 m, simpler ones to 200 m, cards beyond (75 and 150 m, 45 and 90 m at the lower
  settings). Trees throw the fine shadow as meshes and the two wider shadows as cards. `src/render/cards.ts`.
- **The ground** is a ten-metre grid over the country, five over the home farm, finer over the yards and the brook.
- **The crop from above.** Rows are kept wherever one is a pixel wide; past that a field keeps the line where each
  pass of the planter met the next, a grain along its rows, and the lie of its ground (rank and dark in the low
  places, thin and pale on the knolls, held back under the woods). Bare ground shows the harrow's bouts; planted
  ground is ridged from the day it is planted.

### Phase B, the land, third round

- **Winter** (`src/render/snow.ts`). New snow lies thin and even and what stands on the ground shows through it;
  deep snow buries that under drifts laid down the wind; going, it lies in the drifts' cores, the hollows and the
  ditches. Trees take snow bough by bough; a bare hardwood is its twigs, drawn as lines close to and as a thin dark
  mass from far off. Walls, lanes, the yard's trodden paths and the brook's open lead stand dark out of it.
- **Tree shadows.** The two wide cascades are redrawn only when the sun or the ground they cover has moved; a wood
  throws them from two cards in five, each half as wide again; none on the low setting (`shadows.ts`, `cards.ts`).
- **Ways are benched into the slope**: level across the tread within 2 m, the ground cut and filled out to 8.5 m.
- **Whole plants end by distance from the eye**, an arc across the field, over a band.
