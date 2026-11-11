# The County: direction for play and look

This file sets how the game is played and how it looks. It replaces the
"picture" and "interface" sections of `docs/ART.md`; the palette and the two
key moments there still hold. The simulation, its pillars and its cut list in
`docs/DESIGN.md` do not change.

## Why this changed

The first build asked the player to read before acting. Measured on the season
screen at 1440 by 900: **600 words and 26 controls** on screen at once, in six
panels, with the farm in a strip between them. The owner's verdict after
playing it: too complex, hard to understand, and it should play like a
real-time strategy game and look incredible.

## The idea in one line

The land is the interface. You look at the farm, click it, and give orders.

## How it plays

### The clock

- Time runs. One day takes about 1.7 seconds at normal speed, with a faster and
  a fastest speed, and Space pauses. Nothing stops the clock for the player's
  convenience except a decision that cannot wait (a crop just dug: sell or
  store) and the end of the season.
- When something new needs doing, the clock drops back to normal speed and the
  field shows it. "Run until needed" fast-forwards through the quiet weeks.

### The camera

- Drag the land to pan. Arrow keys pan. The wheel or a pinch zooms toward the
  pointer. Right-drag, a two-finger twist, or Q and E turn the view. Home, or a
  double-click on empty ground, frames the whole farm.
- Zoomed out, the camera looks down steeply and the whole farm is in frame.
  Zoomed in, it drops low enough to see along the rows to the horizon.

### Selecting and ordering

- Click a field to select it. Shift-click adds fields. Double-click selects
  every field in the same state. Keys 1 to 6 select fields; Tab goes to the
  next field that needs something; Escape clears.
- The **command card** at the bottom shows the selection and only the orders
  that can be given now. Orders that cannot be given are absent, not greyed.
  Each has a letter key. An order goes to every selected field that can take it.
- Each field carries one **need badge** when the reference practice has
  something for it. Clicking the badge, right-clicking the field, or pressing
  Enter with the field selected gives that order. A new player can play a good
  first season by clicking what glows; a good player acts before it glows.
- Orders join the crew's queue and the tractor or the farmer on foot goes and
  does them, in order, where the player can watch. The queue is a strip of
  icons: click one to cancel it, Ctrl-click to do it first.
- Every order is acknowledged: a ring on the field, a sound, the unit moving.

### What the player sees

Everything on the season screen, in full:

| Where | What | Words |
| --- | --- | --- |
| Top left | The date and how far through the season it is | 4 |
| Top centre | Today and five days of forecast as icons: sky, high and low, rain, blight risk, frost | figures only |
| Top right | Cash, clock speed, menu | 3 |
| On each field | A plate: its name, a glyph for its stage, small marks for dry, blight seen and unprotected, queued orders, and the need badge | 2 each |
| Bottom centre | The command card, when something is selected: name, variety, stage, four gauges (leaf, water, protection, hill), blight as last seen and how long ago, the yield estimate as a range, and the orders | about 25 |
| Bottom left | The crew: what it is doing, and the queue | 3 |
| Bottom right | The last few alerts; click one to go there | about 15 |

Target: **under 80 words with nothing selected** (it was 600), and never more
than five orders offered at once.

Everything else the first build showed (the forecast table, soil temperature
by field, the full diary, what each reading means, the price curves) lives in
one optional view, the **almanac**, opened with a key. Nobody needs it to play.

### Learning

There is no tutorial screen. The first time each kind of badge appears, one
sentence appears with it: what the order does and why now. Nine sentences over
the first season are the whole of the teaching. "How to play" in the menu is
one screen: the controls and the nine orders.

### Knowing and not knowing

The first pillar is that the crop is hidden. In strategy-game terms this is
fog of war, and it should look like it: a field that has not been walked for a
week shows its blight reading as stale; the yield is always a range; a test dig
is a reveal, staged in the world, with the hill's real tubers.

### The other screens

- **Opening.** The farm, filmed. The name, one line, Play. Play starts a farm
  in a sound first year without asking anything; choosing the year is a
  secondary option.
- **Spring.** The same map in early spring. Each plate shows the plan. Click a
  field to change crop, variety or seed on a small card. One line of money.
  One button: Start the season. The default plan is already a good one.
- **Dig day.** A weigh ticket, not a report: the weight, the value, one bar of
  grades, the three largest losses each with its cause in a phrase, and Sell
  or Store. The full reckoning is one click further.
- **Winter.** Each stored crop is a card: value now, which way the price is
  heading, how long until it sprouts; Sell, Hold, Next month.
- **Year end.** One sheet: what came in, what went out, where the farm stands,
  how the yield compares with the neighbor and with Maine.

Two materials, and only two: **instruments** (the plates, the command card,
the top bar: small, dark, cream lettering, they recede) and **papers** (the
weigh ticket, the test-dig tray, the winter cards, the ledger, the almanac:
cream paper, ink, things you read).

## How it looks

### The key frame

Every decision about the look serves one picture:

> July, about seven in the evening. The camera sits low over the brook, looking
> up the slope. The bottom fields are in blossom, white and pale lilac over dark
> green, every plant throwing a long shadow down its row. Mist is starting in
> the low ground by the water. The red tractor is coming down the farm road
> with dust behind it. Halfway up, the farmhouse windows have caught the sun;
> the potato house is a dark hump banked into the hill. Above the ridge fields
> the spruce line is nearly black against a sky that runs from gold at the
> horizon to blue. Beyond our stone walls the neighbors' strips carry on over
> the next two hills, potatoes, oats, clover, and go to haze. A cloud shadow is
> crossing the far hill.

The opening shot of the game is this frame, moving.

### A place, not a model

The cut-out block is gone. The farm sits in a landscape: the same six fields on
the same slope (two on the ridge, two mid slope, two on the bottom land by the
brook), with the country carrying on around them to a horizon, so the camera
can turn all the way round.

Each simulated hill is drawn as a patch of several plants, so a field reads as
rows of hundreds of plants.

### What makes it look real

In order of what each buys:

1. **Light.** A physical sky and sun; the sky lights the scene; filmic tone
   mapping; exposure that follows the weather. The default light is low and
   warm. The sun moves with the season, and a little within the day, and never
   strobes when the clock runs fast.
2. **Shadow and contact.** Cascaded soft shadows fine enough that a single plant
   casts one; ambient occlusion so plants and buildings sit on the ground.
3. **Air.** Haze that thickens with distance and warms toward the sun; ground
   mist on damp mornings; cloud shadows moving over the land.
4. **Leaves.** Potato plants made of leaves, lit from behind when the sun is
   behind them, moving in the wind; real blossom; oats that roll in waves;
   spruce and birch that are trees, not cones.
5. **Ground and water.** Soil that is the red-brown of Caribou loam, darker
   when wet, with standing water that reflects the sky; ridges that are
   geometry; a brook that flows.
6. **The lens.** A long lens, a shallow focus that keeps the eye on the farm,
   a restrained bloom, a touch of grain. Anti-aliasing throughout.
7. **Life.** Wheels that turn, dust in dry weather, spray drift, chimney smoke,
   birds.

The crop states the game depends on (bloom, wilt, virus, blight where seen,
frost, yellowing, dead vines, hilling at none, one and two passes, dug rows,
thin stands, wet and dry soil, rime, snow) must all be at least as readable as
before from the default camera.

### Budget

- 60 frames a second at 1440 by 900 on Apple silicon at full quality.
- Quality tiers chosen automatically from measured frame time (render scale,
  shadow resolution, occlusion, focus, plant density), with a setting to
  override. The lowest tier must still look composed.
- The first frame within about two and a half seconds on a warm cache, with
  the name of the game on screen while shaders compile.
- WebGL2. A flat 2D fallback when it is unavailable.

## How we will know

Nobody who built a part judges it.

| Claim | Evidence |
| --- | --- |
| A stranger can play it | Blind first-time testers: interactions before the first order; a season finished without opening How to play |
| It is simple | Words and controls on screen, counted by `tools/quality/capture.ts`: under 80 words on the season screen |
| The opening earns a "wow" | A five-second test: fresh judges see the opening frame once and say what it is, what they would do, and rate the picture |
| It is better | Blind before-and-after pairs against the first build |
| It runs | Frame time by tier; first-frame time |
| Nothing broke | The simulation's tests, the balance gates and the cross-engine determinism check, unchanged |

Whether the owner says "wow" is the one thing no test here can supply.
