// The measurement table, the cue table and the comparisons, as text for the terminal and as Markdown for the
// write-up.
import { LIMITS } from '../../src/audio/dev/plan.ts'
import type { Compared, VoiceResult } from '../../src/audio/dev/report.ts'
import { CUES } from '../../src/audio/director.ts'

const num = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-inf')
const pct = (x: number) => (x * 100 < 0.05 ? '0' : (x * 100).toFixed(x < 0.1 ? 1 : 0))
const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf')

const HEAD = ['render', 'LUFS', 'mom', 'dBTP', 'pk@max', 'clicks', 'DC dB', '<80%', '2-5k%', '>8k%', 'L/R', 'loop', 'rhythm', 'att ms', 'dec ms', 'own bed dB', '>500 Hz', 'storm dB']

export function row(r: VoiceResult): string[] {
  const m = r.m
  const rep = (x: typeof m.wave) => (x ? `${num(x.salience, 2)}@${num(x.lag, 1)}s` : '')
  return [
    r.name,
    num(m.lufs), num(m.momentary), num(m.truePeak), db(r.peakMax),
    m.clicks.count ? `${m.clicks.count} (x${num(m.clicks.worst, 0)} @${num(m.clicks.at, 2)}s/${m.clicks.scale})` : '0',
    db(m.dc), pct(m.sub80), pct(m.harsh), pct(m.hiss), num(m.corr, 2),
    rep(m.wave), rep(m.rhythm),
    m.shape ? num(m.shape.attackMs, 0) : '', m.shape ? num(m.shape.decayMs, 0) : '',
    m.mask ? `${num(m.mask.snrBest, 0)} @${num(m.mask.bestHz, 0)} (${m.mask.bandsOver})` : '',
    m.mask ? `${num(m.mask.snrSmall, 0)} @${num(m.mask.smallHz, 0)}` : '',
    m.worst ? `${num(m.worst.snrBest, 0)} @${num(m.worst.bestHz, 0)} (${m.worst.bandsOver})` : '',
  ]
}

export function text(results: VoiceResult[]): string {
  const rows = [HEAD, ...results.map(row)]
  const w = HEAD.map((_, i) => Math.max(...rows.map(r => r[i].length)))
  return rows.map(r => r.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ')).join('\n')
}

export function markdown(results: VoiceResult[]): string {
  const line = (c: string[]) => `| ${c.join(' | ')} |`
  return [line(HEAD), line(HEAD.map((_, i) => (i === 0 ? '---' : '---:'))), ...results.map(r => line(row(r)))].join('\n')
}

export const LEGEND = `LUFS: integrated loudness (ITU-R BS.1770-4, gated) at the default volume. mom: loudest 400 ms. dBTP: true peak
(4x oversampled) at the default volume. pk@max: sample peak with the volume slider at its top. clicks: discontinuities found
(worst one: how many times the largest neighbouring break, when, and the spacing in samples at which it shows).
DC dB: mean offset. <80%, 2-5k%, >8k%: share of the energy in those bands. L/R: stereo correlation.
loop, rhythm: how far the strongest repeat of the waveform, and of the pattern of events, stands above the rest of
the autocorrelation, and its period. att, dec: 10-90% rise, and peak to the last moment within 20 dB of it.
own bed, storm: the cue's loudest 170 ms against the mean of the bed, in the third-octave band where it stands
clearest, with that band, and (in brackets) how many bands it tops the bed by 6 dB or more. >500 Hz: the same
against its own bed, in the clearest band a phone's speaker can play.`

const RANK = ['a pick', 'routine', 'notable', 'must not be missed']

// Every cue the director can sound: what it answers, what is heard, and what was measured of it.
export function cueSheet(results: VoiceResult[], compared: Compared | null): string {
  const head = ['cue', 'answers', 'what is heard', 'weight', 'least gap s', 'long ms', 'loudest 400 ms LUFS', 'clear of its bed dB', 'nearest other cue']
  const line = (c: string[]) => `| ${c.join(' | ')} |`
  const rows = CUES.map(spec => {
    const r = results.find(x => x.cue === spec.id)
    const near = compared?.nearest.find(p => p.a === spec.id)
    return line([
      spec.id, spec.on, spec.what, RANK[spec.rank], String(spec.gap),
      r?.m.shape ? num(r.m.shape.lengthMs, 0) : '', r ? num(r.m.momentary) : '',
      r?.m.mask ? `${num(r.m.mask.snrBest, 0)} @${num(r.m.mask.bestHz, 0)} Hz` : '',
      near ? `${near.b}: ${num(near.level)} dB apart, rhythm ${num(near.rhythm, 2)}` : '',
    ])
  })
  return [line(head), line(head.map((_, i) => (i < 4 ? '---' : '---:'))), ...rows].join('\n')
}

export const CUE_LEGEND = `least gap: the cue is not sounded again sooner than this. long: from the first to the last moment within 40 dB of
its peak. clear of its bed: the cue's loudest 170 ms over the bed it is most often heard on, in the third-octave band
where it stands clearest. nearest other cue: the cue of another family closest to it in spectrum among those with
something of its rhythm, with how far apart their spectra are (root mean square across third-octave bands) and how
alike their rhythms (1 is the same pattern of blows). Two are counted as confusable under ${LIMITS.alikeLevel} dB with rhythm over ${LIMITS.alikeRhythm}.`

// The seasons against each other, and the key moments against the short cues that can sound over them.
export function comparedText(c: Compared, md: boolean): string {
  const line = (cells: string[]) => (md ? `| ${cells.join(' | ')} |` : cells.map((x, i) => (i < 2 ? x.padEnd(14) : x.padStart(10))).join('  '))
  const head = ['one', 'other', 'spectrum dB', 'movement dB', 'together dB']
  const pair = (p: Compared['between'][number]) => line([p.a, p.b, num(p.level), num(p.move), num(p.both)])
  const out = [md ? '' : 'The four seasons, each against each:', line(head)]
  if (md) out.push(line(head.map((_, i) => (i < 2 ? '---' : '---:'))))
  out.push(...c.between.map(pair))
  out.push(...c.within.map(p => line([p.a, 'itself, another day', num(p.level), num(p.move), num(p.both)])))
  out.push('')
  const khead = ['key moment', 'most covered by', 'still clear by dB', 'at Hz']
  out.push(md ? '' : 'The moments that must not be missed, against the short cues that can sound over them:', line(khead))
  if (md) out.push(line(khead.map((_, i) => (i < 2 ? '---' : '---:'))))
  out.push(...c.covered.map(k => line([k.cue, k.by, num(k.db), num(k.hz, 0)])))
  return out.filter((l, i) => !(md && l === '' && i === 0)).join('\n')
}
