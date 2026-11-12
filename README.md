# The County

**Fable 5.2 - PotatoBench.** This game is Fable 5.2's entry in PotatoBench, the
benchmark made by TheMizeGuy: one prompt, "make and ship a full browser-based
potato farming game", and the model owns everything after that. The design, the
simulation, the art, the sound, the tests and the deployment were all made by
Fable 5.2 (Anthropic's Claude), working in Claude Code.

A potato farming game you play like a strategy game.

You start with six fields, one farmer and a note at the bank. The camera sits
over the land; you select fields and give orders, and your people go and do
them. The crop grows underground where you cannot see it, the weather does what
it likes, and you find out what you grew on the day you dig.

From there the farm is yours to build: rent or buy more land, clear woods into
fields, hire people with skills and tempers of their own, put up a potato
house, a machine shed, a packing shed, and sign contracts you then have to fill.

**Play it:** https://themizeguy.github.io/fable-5.2-potatobench/

## Playing

- **The crew works by itself.** What the spring plan chose gets planted, hilled,
  walked, test-dug, dug and hauled without an order. You make the calls: spray,
  water, kill the vines, sell or store, and everything in spring. "Who does
  what" switches each job between "by itself" and "ask me".
- **Camera:** drag to pan, wheel to zoom, right-drag sideways or Q and E to
  turn, right-drag up and down or Page Up and Page Down to tip the view toward
  straight down, Home to level it and step out a tier.
- **Select:** click a field for its card; click a person, a machine or a
  building for theirs; Shift-click for more fields; double-click for every
  field in the same state.
- **Order:** click the stamp a field shows when it wants a decision, use the
  card and its letter keys, or Tab and Enter to step through what needs you.
- **Time:** Space pauses and goes on; 1x, 2x and 3x set the speed. The clock
  stops by itself only for a weigh ticket, a telegram, a frost on crop still in
  barrels, and the season's end.
- **First time?** A new farm offers a guided first year, which can be skipped
  at any step and replayed lesson by lesson from the menu.
- **Depth:** press I for the almanac: the forecast, the blight watch, prices.

## What is in the repository

| Path | What |
| --- | --- |
| `src/sim` | The simulation: deterministic, no browser in it, the same code in the game, the tests and the bots |
| `src/game` | The running game: clock, selection, orders, saves |
| `src/render` | The land, drawn with three.js |
| `src/ui` | The instruments and papers over the land |
| `src/audio` | Sound, synthesized with Web Audio |
| `tools/balance` | Bots that play fairly, and the tournament that checks every mechanic matters |
| `tools/quality` | Captures every screen at every size for review |
| `docs/DESIGN.md` | What the game is and the gates it must pass |
| `docs/DIRECTION.md` | How it plays and looks |
| `docs/FARMSTEAD.md` | People, land and buildings |
| `docs/MODEL.md` | Every rule of the simulation and where it comes from |

## Develop

```
npm ci
npm run dev        # play locally
npm test           # simulation tests
npm run build      # production build in dist/
```

Browser tests (`npm run test:e2e`) and the balance tournament (`npm run balance`)
are heavy; `tools/remote/pc2.sh` runs them on another machine.
