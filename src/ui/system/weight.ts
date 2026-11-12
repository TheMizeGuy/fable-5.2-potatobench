// What a press costs, for every control in the game (docs/UI.md, "Controls: depth and weight"). The weight is
// carried on the control as data-w and design/system.css draws it: how far the key stands off the paper, how far it
// travels, how big it is. h() asks here for every button and link it makes; a control may also say its own data-w.
export type Weight = 'major' | 'std' | 'minor'

// Major: money, time, or it cannot be taken back. By test id; the first that matches is the answer.
const MAJOR: RegExp[] = [
  // the year moves on
  /^(continue|begin-season|end-season|year-next|month-next|new-farm)$/,
  // the crop: sell, store, deliver, hold back for seed
  /^(lot|field)-(sell|sell-half|deliver)-/, /^lot-seed-(?!open-)/, /^(sell-logs|sell-logs-some|sell-logs-all|yard-sell-logs)$/,
  // people: hire, let go, pay more
  /^(hire|hire-applicant|applicant-hire|dismiss)-/, /^(person-raise|person-dismiss|whois-letgo)$/,
  // machines, land, buildings, the bank
  /^buy-/, /^(land-rent|land-buy|land-buy-cash|land-release|tract-stump|order-stump)$/, /^build-/, /^raise-(?!open$)/, /^pay-/,
  // a contract signed, a telegram answered, a step confirmed
  /^accept-/, /^answer-/, /^spray-way-/, /^guide-(accept|refuse)$/, /^confirm-ok$/,
  // destroying: these also carry the hazard stripes and ask once more
  /^(end-season-early|save-delete)$/,
]
// Minor: close, back, more, change, a goal's list, put away.
const MINOR: RegExp[] = [
  /-close$/, /^(card-close|paper-close|hint-close|incident-later|spray-ask-close)$/, /^lot-keep-/, /^(how-keys|how-guide)$/,
  /^(goal|next-goal|forecast|materials|sample-again|order-more|queue-more|compare-open|money-open|reckoning-open|spray-ask-open|card-spray-way)$/,
  /^(track|list-x|queue-first|queue-who|help|guide-again|grid-person)-/, /^(guide-skip|guide-stop|guide-show)$/,
]
const MAJOR_CLASS = /(^| )(way|reply|hazard)( |$)/
const MINOR_CLASS = /(^| )(close|quiet|keys-fold|q-x|q-first|q-help|w-who|contract|est-by)( |$)/

export function weightOf(cls: string, testid: string): Weight {
  // Play is the cover's strong action only while there is no farm to go on with; beside Continue it is a line of
  // the contents.
  if (testid === 'play') return /(^| )go( |$)/.test(cls) ? 'major' : 'std'
  if ((testid && MAJOR.some(r => r.test(testid))) || MAJOR_CLASS.test(cls)) return 'major'
  if ((testid && MINOR.some(r => r.test(testid))) || MINOR_CLASS.test(cls)) return 'minor'
  return 'std'
}

// Marks a control with its weight, and a major one with the sound its press may make (the interface's click
// listener passes data-sound to the sound's cue).
export function weigh(el: HTMLElement): void {
  if (!el.dataset.w) el.dataset.w = weightOf(el.className, el.dataset.testid ?? '')
  if (el.dataset.w === 'major' && el.dataset.sound === undefined) el.dataset.sound = 'press'
}
