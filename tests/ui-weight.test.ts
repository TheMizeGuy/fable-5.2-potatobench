// What each control's press costs (src/ui/system/weight.ts), and that the table in docs/UI.md says the same.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { weightOf } from '../src/ui/system/weight.ts'

const ROOT = join(import.meta.dirname, '..')

test('money, time and what cannot be taken back are major', () => {
  for (const id of ['begin-season', 'end-season', 'year-next', 'month-next', 'continue', 'new-farm', 'lot-sell-3', 'lot-sell-half-3', 'lot-deliver-3', 'field-sell-2',
    'field-deliver-2', 'lot-seed-3', 'sell-logs-all', 'yard-sell-logs', 'hire-hand', 'hire-applicant-4', 'applicant-hire-4', 'dismiss-2', 'person-dismiss', 'whois-letgo',
    'person-raise', 'buy-sprayer', 'land-rent', 'land-buy', 'land-buy-cash', 'land-release', 'tract-stump', 'build-shed', 'build-shed-1', 'raise-bunk-1', 'pay-2000',
    'accept-19873', 'answer-rush', 'spray-way-auto', 'guide-accept', 'guide-refuse', 'confirm-ok', 'end-season-early', 'save-delete']) {
    expect(weightOf('btn', id), id).toBe('major')
  }
  // The ways to take a crop and a telegram's replies are major whatever they are called.
  expect(weightOf('way sys is-best', 'lot-keep-3')).toBe('major')
  expect(weightOf('reply first', '')).toBe('major')
  expect(weightOf('btn hazard', '')).toBe('major')
})

test('close, back, more and change are minor', () => {
  for (const id of ['card-close', 'paper-close', 'whois-close', 'crew-close', 'money-close', 'reckoning-close', 'incident-later', 'spray-ask-close', 'goal', 'next-goal',
    'forecast', 'materials', 'order-more', 'queue-more', 'compare-open', 'money-open', 'reckoning-open', 'track-19873', 'list-x-4', 'queue-first-4', 'queue-who-4', 'guide-stop', 'how-keys']) {
    expect(weightOf('btn go', id), id).toBe('minor')
  }
  expect(weightOf('close', '')).toBe('minor')
  expect(weightOf('btn quiet', 'anything')).toBe('minor')
  // The button that closes a ticket shares its test id with the coupon that stores the crop.
  expect(weightOf('btn', 'lot-keep-3')).toBe('minor')
})

test('everything else is a standard key', () => {
  for (const id of ['order-spray', 'order-dig', 'goal-do', 'guide-noted', 'guide-pass', 'guide-ahead', 'speed-1', 'speed-0', 'menu-open', 'whois-follow', 'whois-first-field', 'prio-field',
    'person-rest-sunday', 'unit-2', 'cell-2-field', 'almanac-farm', 'menu-continue', 'quit-title', 'raise-open', 'lot-seed-open-3', 'thing-hire', 'crew-open', 'beds-build', 'weighin-3', 'play-guided']) {
    expect(weightOf('btn', id), id).toBe('std')
  }
  // Play is the cover's strong action only when there is no farm to go on with.
  expect(weightOf('btn go wide', 'play')).toBe('major')
  expect(weightOf('cv-item lead', 'play')).toBe('std')
})

test('docs/UI.md holds the rule and its table of actions', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'UI.md'), 'utf8')
  expect(doc).toContain('## Controls: depth and weight')
  const table = doc.slice(doc.indexOf('## Controls: depth and weight'))
  for (const word of ['Start the season', 'Close out the season', 'Sell', 'Store', 'Deliver', 'Hire', 'Let go', 'End the season early', 'Delete the save', 'Show me', 'Skip ahead', 'Got it']) {
    expect(table, word).toContain(word)
  }
})
