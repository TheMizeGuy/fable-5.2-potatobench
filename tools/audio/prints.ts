// Prints the print of each rendered WAV named (src/audio/dev/analyze.ts: its level in each third-octave band under
// its strongest, and how much each band comes and goes), side by side, to see where two beds differ. No browser.
// Usage: node tools/audio/prints.ts <a.wav> <b.wav> ...
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { THIRD_OCTAVES, bedProfile, fingerprint, pdb, printDistance } from '../../src/audio/dev/analyze.ts'

function read(path: string): { chans: Float32Array[]; sr: number } {
  const b = readFileSync(path)
  let at = 12
  let sr = 48000, nch = 2
  while (at + 8 <= b.length) {
    const id = b.toString('latin1', at, at + 4), size = b.readUInt32LE(at + 4)
    if (id === 'fmt ') { nch = b.readUInt16LE(at + 10); sr = b.readUInt32LE(at + 12) }
    if (id === 'data') {
      const n = Math.floor(size / (2 * nch))
      const chans = Array.from({ length: nch }, () => new Float32Array(n))
      for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) chans[c][i] = b.readInt16LE(at + 8 + 2 * (i * nch + c)) / 32768
      return { chans, sr }
    }
    at += 8 + size + (size & 1)
  }
  throw new Error(`no samples in ${path}`)
}

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node tools/audio/prints.ts <a.wav> <b.wav> ...')
  process.exit(2)
}
const waves = files.map(read)
const prints = waves.map(w => fingerprint(w.chans, w.sr, 6))
// The level of each one's strongest band, in dBFS, which the prints leave out.
const tops = waves.map(w => pdb(Math.max(...bedProfile(w.chans, w.sr, 6))))
const names = files.map(f => basename(f).replace(/^\d+-/, '').replace(/\.wav$/, '').slice(0, 14))
console.log(['Hz'.padStart(6), ...names.map(n => n.padStart(16))].join(' '))
THIRD_OCTAVES.forEach((hz, b) => {
  console.log([hz.toFixed(0).padStart(6), ...prints.map(p => `${p.level[b].toFixed(0).padStart(5)} dB ~${p.move[b].toFixed(1).padStart(4)}`.padStart(16))].join(' '))
})
console.log(['top'.padStart(6), ...tops.map(t => `${t.toFixed(1)} dBFS`.padStart(16))].join(' '))
for (let i = 0; i < prints.length; i++) for (let j = i + 1; j < prints.length; j++) {
  const d = printDistance(prints[i], prints[j])
  console.log(`${names[i]} and ${names[j]}: spectrum ${d.level.toFixed(1)} dB, movement ${d.move.toFixed(1)} dB, together ${d.both.toFixed(1)} dB`)
}
