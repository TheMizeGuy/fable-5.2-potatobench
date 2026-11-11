// Renders every voice through an OfflineAudioContext and publishes peak and RMS on window.__audioReport.
// Driven by tools/audio/check.ts; also readable by opening this page in the dev server.
import { Ambience, Birds, phrase } from '../ambience.ts'
import * as cue from '../cues.ts'
import { sceneFor, type Scene, type SceneInput } from '../scene.ts'
import { createRig, volumeGain, type Rig } from '../synth.ts'
import { PEAK_LIMIT, SILENT_PEAK, type Report, type VoiceResult } from './report.ts'

const SR = 48000

interface Case { name: string; seconds: number; solo: boolean; play(rig: Rig, seconds: number): void }

type Layer = 'wind' | 'rain' | 'birds' | 'crickets'

function only(s: Scene, keep: Layer[]): Scene {
  return {
    ...s,
    wind: keep.includes('wind') ? s.wind : 0,
    cold: keep.includes('wind') ? s.cold : 0,
    rain: keep.includes('rain') ? s.rain : 0,
    heavy: keep.includes('rain') ? s.heavy : 0,
    birds: keep.includes('birds') ? s.birds : 0,
    crickets: keep.includes('crickets') ? s.crickets : 0,
  }
}

function season(month: number, wind: number, prcp: number, sky: NonNullable<SceneInput['weather']>['sky'], tmean: number): SceneInput {
  return { place: 'season', month, weather: { wind, prcp, sky, tmean } }
}

function ambient(name: string, seconds: number, input: SceneInput, keep: Layer[] | null, engine: [number, number] = [0, 0]): Case {
  return {
    name, seconds, solo: keep !== null && keep.length === 1,
    play(rig, secs) {
      const a = new Ambience(rig, 0)
      const s = sceneFor(input)
      a.setScene(keep ? only(s, keep) : s, 0)
      a.setEngine(engine[0], engine[1], 0)
      a.schedule(0, secs)
    },
  }
}

function tractor(name: string, level: number, load: number): Case {
  return {
    name, seconds: 8, solo: true,
    play(rig, secs) {
      const a = new Ambience(rig, 0)
      a.setScene(only(sceneFor({ place: 'title', month: 5, weather: null }), []), 0)
      a.setEngine(level, load, 0)
      a.schedule(0, secs)
    },
  }
}

function bird(name: string, song: Parameters<typeof phrase>[3]): Case {
  return {
    name, seconds: 4, solo: true,
    play(rig) {
      const b = new Birds(rig)
      phrase(rig, b.out, 0.1, song, 1, 0)
    },
  }
}

function oneShot(name: string, seconds: number, play: (rig: Rig) => void): Case {
  return { name, seconds, solo: true, play }
}

const CASES: Case[] = [
  ambient('ambience: title screen', 20, { place: 'title', month: 5, weather: null }, null),
  ambient('ambience: spring plan', 12, { place: 'plan', month: 3, weather: null }, null),
  ambient('ambience: cellar, January', 12, { place: 'cellar', month: 0, weather: null }, null),
  ambient('ambience: June, fair', 20, season(5, 3.2, 0, 'clear', 17), null),
  ambient('ambience: August night', 12, season(7, 2.5, 0, 'clear', 19), null),
  ambient('wind: breeze, 3.2 m/s', 12, season(5, 3.2, 0, 'overcast', 15), ['wind']),
  ambient('wind: gale, 11 m/s, October', 12, season(9, 11, 0, 'overcast', 6), ['wind']),
  {
    name: 'wind: cold whistle alone', seconds: 12, solo: true,
    play(rig, secs) {
      const a = new Ambience(rig, 0)
      a.setScene({ ...only(sceneFor({ place: 'title', month: 0, weather: null }), []), cold: 0.7 }, 0)
      a.schedule(0, secs)
    },
  },
  ambient('rain: light, 3 mm', 10, season(6, 2, 3, 'rain', 16), ['rain']),
  ambient('rain: heavy, 18 mm', 10, season(6, 4, 18, 'rain', 16), ['rain']),
  ambient('rain: storm, 45 mm', 10, season(7, 8, 45, 'storm', 18), ['rain']),
  ambient('birds: May morning', 24, season(4, 2, 0, 'clear', 12), ['birds']),
  bird('bird: white-throated sparrow', 'sparrow'),
  bird('bird: chickadee', 'chickadee'),
  bird('bird: robin', 'robin'),
  bird('bird: trill', 'trill'),
  ambient('crickets: August, 20 C', 10, season(7, 2, 0, 'clear', 20), ['crickets']),
  tractor('tractor: working', 1, 1),
  tractor('tractor: idling (work on foot)', 0.4, 0),
  oneShot('cue: planted', 1.5, r => cue.planted(r, 0.05)),
  oneShot('cue: hilled', 1.5, r => cue.hilled(r, 0.05)),
  oneShot('cue: sprayed', 1.5, r => cue.sprayed(r, 0.05)),
  oneShot('cue: watered', 1.5, r => cue.watered(r, 0.05)),
  oneShot('cue: test dig (6 tubers)', 3, r => { cue.barrel(r, 0.05, 'sample', 6) }),
  oneShot('cue: dug', 4, r => { cue.barrel(r, 0.05, 'dig', 0) }),
  oneShot('cue: sold', 1.5, r => cue.sold(r, 0.05)),
  oneShot('cue: warning, frost', 6, r => cue.chime(r, 0.05, 261.6)),
  oneShot('cue: warning, blight watch', 6, r => cue.chime(r, 0.05, 220)),
  oneShot('cue: warning, blight seen', 6, r => cue.chime(r, 0.05, 196)),
  oneShot('cue: warning, dry', 6, r => cue.chime(r, 0.05, 164.8)),
  oneShot('cue: warning, lost', 6, r => cue.chime(r, 0.05, 146.8)),
  oneShot('cue: year-end ledger', 6, r => { cue.cadence(r, 0.05, 'ledger') }),
  oneShot('cue: five seasons kept', 7, r => { cue.cadence(r, 0.05, 'kept') }),
  {
    name: 'stress: storm, gale, tractor and every cue at once', seconds: 8, solo: false,
    play(rig, secs) {
      const a = new Ambience(rig, 0)
      const s = sceneFor(season(9, 12, 60, 'storm', 4))
      a.setScene({ ...s, birds: 6, crickets: 1, chirps: 2.5, month: 5 }, 0)
      a.setEngine(1, 1, 0)
      a.schedule(0, secs)
      for (const t of [2.5, 4.5]) {
        cue.planted(rig, t); cue.hilled(rig, t); cue.sprayed(rig, t); cue.watered(rig, t)
        cue.barrel(rig, t, 'dig', 0); cue.barrel(rig, t, 'sample', 8); cue.sold(rig, t)
        cue.chime(rig, t, 146.8); cue.chime(rig, t, 261.6); cue.cadence(rig, t, 'kept')
      }
    },
  },
]

async function render(c: Case, master: boolean): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(c.seconds * SR), SR)
  const rig = createRig(ctx, ctx.destination, { seed: 20260611, master })
  rig.volume.gain.value = volumeGain(1)
  c.play(rig, c.seconds)
  return ctx.startRendering()
}

function measure(b: AudioBuffer): { peak: number; rms: number; loudest: number } {
  const win = Math.floor(0.05 * b.sampleRate)
  let peak = 0, sum = 0, loudest = 0
  const chans = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i))
  let w = 0, wn = 0
  for (let i = 0; i < b.length; i++) {
    for (const d of chans) {
      const x = d[i]
      const a = Math.abs(x)
      if (a > peak) peak = a
      sum += x * x
      w += x * x
    }
    if (++wn === win) {
      loudest = Math.max(loudest, Math.sqrt(w / (win * chans.length)))
      w = 0
      wn = 0
    }
  }
  return { peak, rms: Math.sqrt(sum / (b.length * chans.length)), loudest }
}

async function run(): Promise<Report> {
  const results: VoiceResult[] = []
  for (const c of CASES) {
    const out = measure(await render(c, true))
    const raw = measure(await render(c, false))
    results.push({ name: c.name, seconds: c.seconds, solo: c.solo, peak: out.peak, rms: out.rms, loudest: out.loudest, rawPeak: raw.peak })
  }
  return { results, error: '' }
}

const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf').padStart(6)

run().then(
  report => {
    ;(window as unknown as { __audioReport: Report }).__audioReport = report
    document.getElementById('out')!.textContent = report.results
      .map(r => `${r.name.padEnd(52)} peak ${db(r.peak)} dB  rms ${db(r.rms)} dB  raw ${db(r.rawPeak)} dB` +
        (r.peak > PEAK_LIMIT || (r.solo && r.rawPeak > PEAK_LIMIT) ? '  CLIPS' : r.peak < SILENT_PEAK ? '  SILENT' : ''))
      .join('\n')
  },
  (err: unknown) => {
    ;(window as unknown as { __audioReport: Report }).__audioReport = { results: [], error: String(err instanceof Error ? err.stack ?? err.message : err) }
  },
)
