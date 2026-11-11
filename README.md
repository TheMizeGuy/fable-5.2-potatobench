# The County

A potato farming game played on the real weather of Aroostook County, Maine.

You farm six fields through real years (1973 to 2024). The weather is NOAA's
record at Caribou. The crop is underground: you manage what you cannot see,
with one farmer's hours, and find out the truth on dig day.

- Design record: [docs/DESIGN.md](docs/DESIGN.md)
- Art direction: [docs/ART.md](docs/ART.md)
- Research the model is built on: [docs/research](docs/research)

## Develop

```
npm ci
npm run dev        # play locally
npm test           # simulation tests
npm run build      # production build in dist/
```

The simulation core in `src/sim` is deterministic and has no dependency on the
browser, so the same code runs in tests, in the balance tools and in the game.
