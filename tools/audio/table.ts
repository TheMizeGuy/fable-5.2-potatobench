// The measurement table, as text for the terminal and as Markdown for the write-up.
import type { VoiceResult } from '../../src/audio/dev/report.ts'

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
