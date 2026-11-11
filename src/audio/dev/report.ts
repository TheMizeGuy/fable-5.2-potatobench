export interface VoiceResult {
  name: string
  seconds: number
  solo: boolean          // a single voice: its raw level must stay under the ceiling without help from the limiter
  peak: number           // through the full master chain at the loudest volume setting
  rms: number
  loudest: number        // RMS of the loudest 50 ms window, through the master chain
  rawPeak: number        // before the master volume, compressor and ceiling
}

export interface Report { results: VoiceResult[]; error: string }

export const PEAK_LIMIT = 0.98
export const SILENT_PEAK = 0.002
