// Prints the scripted replay's final state hash. With --write it records it in tests/golden.json.
// Regenerate only on purpose, when a change to the simulation is meant to change the game.
// Usage: node tests/golden.ts [--write]
import { writeFileSync } from 'node:fs'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { REPLAY, runReplay } from './replay.ts'

const r = runReplay(S, loadWorld(), REPLAY)
const golden = {
  startYear: REPLAY.startYear,
  seed: REPLAY.seed,
  hash: r.hash,
  commands: r.cmds.length,
  years: r.campaign.history.length,
  outcome: r.campaign.outcome,
}
console.log(JSON.stringify(golden))
if (process.argv.includes('--write')) {
  writeFileSync(new URL('./golden.json', import.meta.url), JSON.stringify(golden, null, 1) + '\n')
  console.log('Wrote tests/golden.json')
}
