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

- **Camera:** drag to pan, wheel to zoom, right-drag or Q and E to turn, Home
  for the whole farm.
- **Select:** click a field; Shift-click for more; double-click for every field
  in the same state.
- **Order:** click the badge a field shows when it needs something, or use the
  command card and its letter keys.
- **Time:** Space pauses; F runs the days until something needs you.
- **Depth:** press I for the almanac.

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
