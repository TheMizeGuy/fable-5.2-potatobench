// Gate 6: one scripted five-season campaign must end in the same state hash in every browser engine as in Node.
import { readFileSync } from 'node:fs'
import { test } from '@playwright/test'
import { runReplay } from '../tests/replay.ts'
import { expect, open } from './helpers.ts'

const golden = JSON.parse(readFileSync(new URL('../tests/golden.json', import.meta.url), 'utf8')) as { hash: string; commands: number }

test('the scripted campaign reaches the golden hash in this engine', async ({ page, browserName }) => {
  await open(page)
  const got = await page.evaluate(`(() => { const r = (${runReplay.toString()})(__county.sim, __county.app.world); return { hash: r.hash, commands: r.cmds.length } })()`) as { hash: string; commands: number }
  test.info().annotations.push({ type: 'hash', description: `${browserName}: ${got.hash} after ${got.commands} commands (Node: ${golden.hash})` })
  expect(got.commands).toBe(golden.commands)
  expect(got.hash).toBe(golden.hash)
})
