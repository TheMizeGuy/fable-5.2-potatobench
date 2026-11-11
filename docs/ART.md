# The County: art and interface direction

One look for the 3D field and the interface, so they read as one thing.

## The picture

Northern Maine, a small potato farm on a slope, seen from above and to one side
as a cut-out block of land: a diorama. Six fields step down from a spruce ridge
at the back to a brook at the front. The cut faces of the block show the soil.
A farmhouse and a potato house (the low, banked storage barn of Aroostook) sit
at one side beside a farm road. Nothing else: no town, no map, no characters.

The field is the status display. A player should be able to read the farm
without opening a panel:

- soil colour says wet or dry; standing water shines;
- plant size says canopy; drooping says drought; pale and small says virus;
- white and pale-lilac blossom marks the weeks when tubers set;
- yellowing says the vines are going down; grey-brown says dead;
- brown-black patches that spread plant to plant are blight, shown only where
  the grower has seen it;
- ridged rows say hilled, and how many times;
- mist lying in the low fields is blight weather; white rime is frost;
- the tractor is the farmer's time: where it is, is what is getting done.

## Mood and palette

Quiet, late light, a working landscape. Not a toy and not a cartoon: closer to
a painted relief map or a model railway than to a mobile farming game.

| Use | Colour |
| --- | --- |
| Caribou loam, dry | `#7a5a43` |
| Caribou loam, wet | `#4a3528` |
| Potato leaf | `#3f7d48` (young `#6fa355`, old `#8f9a4a`) |
| Blossom | `#f2ecf7` with `#c9b6e0` |
| Blight | `#4b3324` to `#241a14` |
| Frost | `#dfeaf2` |
| Spruce | `#22382f` |
| Sky, fair | `#bcd3e0` to `#e9eee6` at the horizon |
| Sky, overcast | `#9aa4a6` |
| Evening light | `#f3c98b` |
| Paper (panels) | `#f3ecdc` |
| Ink (text) | `#22271f` |
| Rule lines | `#c9bfa6` |
| Accent, good | `#3f7d48` |
| Accent, warning | `#b7791f` |
| Accent, bad (blight, loss) | `#9c3b25` |
| Accent, cold (frost) | `#4b78a0` |
| Night panel (over the field) | `#1d2a24` at 88% |

## Interface

The interface is a farm almanac and ledger laid over the land: cream paper
panels, dark ink, thin rules, small capitals for labels, tabular figures for
every number. A serif with some character for headings and dates, a plain
humanist sans for body text, both bundled with the game (no font requests to
other sites).

- No emoji anywhere. Icons are small inline SVG line drawings in ink.
- No gradients for decoration, no glass blur, no neon, no drop-shadow stacks.
  Depth comes from paper on land, one soft shadow at most.
- Numbers are honest: an estimate is drawn as a range, never a single figure;
  anything last seen days ago says how many days.
- Fahrenheit, inches, hundredweight and acres by default (it is Maine), with a
  metric switch.
- Every control works by keyboard and has a visible focus ring. Text contrast
  meets WCAG AA. Motion respects the reduced-motion setting.
- At phone width the field stays visible on top and the panels become a bottom
  sheet; nothing scrolls sideways.

## The two moments that matter

1. **The test dig.** One hill lifted: its real tubers laid out on a tray at true
   relative size, with any green, scab or rot visible. The estimate range
   narrows as the player watches.
2. **Dig day.** The digger goes down the rows and the crop comes out of the
   ground for the first time. Then the weigh-in: bars filling by grade, and under
   them every hundredweight lost, by cause, each cause in the player's own
   decisions and days.
