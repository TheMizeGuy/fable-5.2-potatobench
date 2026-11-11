# The County: the sound

**No one has listened to any of this.** Every sound in the game is synthesized
in the browser, was written by an agent that cannot hear, and was revised by
another that cannot hear. What follows is the evidence a sound designer would
take in place of ears: spectrograms that were looked at, measurements of the
faults ears catch, and comparison with published descriptions of the real
sounds. It shows where pitch, rhythm, spectrum and level match published
figures and where they do not, and that the renders are free of clicks,
clipping and audible loops. It does not show that the sounds are pleasant,
that a listener would name the bird or the barrel, that the cadence feels
earned, or that half an hour of it is restful. Those need a person, and the
listening sheet near the end is for that person.

Everything here is reproducible: `node tools/audio/render.ts <folder>` writes
the WAVs, pictures and tables; `node tools/audio/check.ts chromium firefox
webkit` holds every render to the limits below in three engines.

## What was done

1. **See it.** `tools/audio/render.ts` renders 57 cases offline at the default
   volume: 14 beds, 18 voices alone, 15 cues, six changes (weather, tractor,
   mute, places, every cue in a row, every loop wrapping), three one-minute
   scenes played through the same frame loop and event director as the live
   game, and a stress case. Each becomes a 16-bit WAV and a picture: spectrogram
   on a log axis from 40 Hz to 16 kHz, the average spectrum beside it, the
   waveform under it. Birds and crickets also get a linear close-up.
2. **Measure it.** `src/audio/dev/analyze.ts`, on every render:
   - *Loudness*: ITU-R BS.1770 K-weighting with the standard's 48 kHz
     coefficients, 400 ms blocks at 75% overlap, gates at -70 LUFS and 10 LU
     under the ungated mean. Integrated, loudest 400 ms, loudest 3 s. The meter
     is checked against a -6 dBFS 997 Hz stereo sine, which must read -6.0.
   - *True peak*: the largest value after 4x windowed-sinc oversampling.
   - *Clicks*: the second difference of the waveform, taken 1, 4, 16 and 64
     samples apart, against every other such value within 80 ms. Six times the
     fourth-largest neighbour counts as a click. The test is calibrated on each
     run by planting steps in clean renders: it finds a one-sample step from
     -56 dBFS in a chime or under the tractor and from -44 dBFS in a
     fair-weather bed. A step smeared over a millisecond is found only from
     -34 dBFS in a chime and -22 dBFS under the tractor, and not at all in
     noise.
   - *DC offset*; share of energy under 80 Hz, from 2 to 5 kHz, over 8 kHz;
     left-right correlation.
   - *Repeats*: normalised autocorrelation of the waveform (a noise loop
     coming round) and of the level in 20 ms steps (a pattern of events coming
     round), at lags from 1 s to half the render, as the height of the strongest
     peak over the 99.5th percentile of the rest.
   - *Cues*: 10 to 90% rise, time from peak to the last moment within 20 dB,
     and masking: the cue's loudest 170 ms against the bed's mean level in each
     third-octave band from 50 Hz to 12.5 kHz, reported for the band where the
     cue stands clearest, for the clearest band at 500 Hz or above (what a phone
     speaker plays), and against the loudest bed in the game.
   - *Features for comparison*: note onsets, lengths and pitches of each bird;
     pulse and chirp timing of a cricket; spectral lines and octave bands of
     the tractor; onset times and levels of each knock.
3. **Compare it** with published descriptions of the real sounds (below).
4. **Fix it**, eight rounds: render, look at the pictures, measure, change.
   Round 1 is the sound as it shipped. Round 2 rebuilt the noise, the stereo,
   the tractor, the barrel and the closes, and turned the loudness the right
   way up. Round 3 matched the birds, crickets, wind, rain and tractor to the
   references. Round 4 made every fade even to the ear and gave each layer
   noise of its own. Round 5 put the birds in bouts and slowed the weather's
   crossfades. Round 6 took out the compressor (see "One soundscape"). Rounds
   7 and 8 re-centred levels; round 8 is what is committed.

The limits are in `src/audio/dev/plan.ts`. They are choices, not standards,
except where a standard is named.

## The loudness plan

All figures are LUFS at the default volume setting (0.6, a gain of 0.54). The
slider's top is 8.9 dB above that.

| Layer | Target | Why |
| --- | --- | --- |
| Title, plan, ledger | -48 to -35 integrated | A breeze and a bird now and then. |
| Cellar | -50 to -40 | Close to silence. |
| Fair-weather beds | -45 to -33 | A breeze, birds or crickets. |
| Tractor working, alone | -41 to -33 | Hours of it must be ignorable. |
| Rain | light -45 to -36, heavy -35 to -28, storm -32 to -25 | |
| Gale | -32 to -26 | |
| Loudest bed (storm, gale, tractor) | -29 to -22 | Nothing continuous goes above this. |
| One bird's song | -38 to -27, loudest 400 ms | Under the cues. |
| Job cues: planted, hilled, sprayed, watered, sold | -31 to -24, loudest 400 ms | About 10 LU over a fair bed. |
| Warnings | -28 to -22 | Distinct, never the loudest thing. |
| Test dig, dig day | -28 to -21 | The key moments are the loudest cues. |
| Year end -28 to -21, farm kept -26 to -20, farm lost -30 to -23 | | The loss is the quietest close. |
| A minute of play | -38 to -29 integrated | |
| True peak | under -6 dBTP at default, under 0.98 full scale at the slider's top | |

For scale: EBU R 128 sets programme loudness at -23 LUFS and Sony's ASWG-R001
sets games at -24 (home) and -18 (portable). A minute of this game at the
default volume measures -32 to -35, so about 10 LU under a television
programme, and at the slider's top about level with one. That is what "modest"
means here. Speech is kept 10 to 15 LU over its bed in broadcast practice
(Torcoli et al. 2019); the job cues sit about 10 LU over a fair-weather bed.
ISO 7731 calls a signal clearly audible at 13 dB over the masking noise in a
third-octave band, and every cue is held to that against the bed it plays
over. Warnings and the two dig cues must also stand 3 dB clear of the loudest
bed and 6 dB clear of their own bed at 500 Hz and above.

Other limits: no click; DC under -60 dBFS; no repeat standing more than 0.2
(waveform) or 0.35 (rhythm) above the rest of the autocorrelation; in a bed,
no more than 30% of the energy under 80 Hz, 45% between 2 and 5 kHz (birds and
crickets excepted: that band is where they live) and 10% over 8 kHz; left and
right never out of phase; a cue fully decayed before its render ends.

No published limit was found for the share of energy between 2 and 5 kHz that
a listener tolerates for half an hour. The limit here leans on the ear's
sensitivity peaking near 3 kHz (ISO 226) and sharpness weighting rising from
3 kHz (DIN 45692). It is a guard, not a finding.

## Final measurements

Round 8, Chromium, at the default volume. Firefox and WebKit agree to within
0.3 LU on every row (`node tools/audio/check.ts chromium firefox webkit`
prints all three).

| render | LUFS | mom | dBTP | pk@max | clicks | DC dB | <80% | 2-5k% | >8k% | L/R | loop | rhythm | att ms | dec ms | own bed dB | >500 Hz | storm dB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bed: title screen | -38.5 | -31.8 | -27.7 | -18.8 | 0 | -131.8 | 0 | 66 | 0 | 0.69 | 0.04@12.5s | 0.04@1.0s |  |  |  |  |  |
| bed: spring plan | -41.1 | -34.3 | -28.8 | -19.9 | 0 | -131.2 | 0 | 46 | 0 | 0.57 | 0.04@5.8s | 0.01@8.8s |  |  |  |  |  |
| bed: June, fair | -37.9 | -31.6 | -26.6 | -17.8 | 0 | -133.0 | 0 | 42 | 0 | 0.48 | 0.03@12.5s | 0.06@1.0s |  |  |  |  |  |
| bed: June, fair, tractor working | -34.2 | -30.4 | -21.7 | -12.8 | 0 | -119.4 | 17 | 12 | 0 | 0.80 | 0.04@6.0s | 0.04@1.1s |  |  |  |  |  |
| bed: August, steady rain, 9 mm | -35.0 | -33.7 | -23.1 | -14.2 | 0 | -76.5 | 0.1 | 30 | 2.3 | 0.12 | 0.01@2.6s | 0.02@1.0s |  |  |  |  |  |
| bed: August, drizzle, tractor working | -35.2 | -33.9 | -21.8 | -13.0 | 0 | -83.0 | 20 | 7.8 | 0.1 | 0.86 | 0.08@1.4s | 0.09@1.0s |  |  |  |  |  |
| bed: August, fair and warm, crickets | -42.2 | -38.6 | -26.9 | -18.1 | 0 | -141.5 | 0.1 | 53 | 0 | 0.51 | 0.03@8.6s | 0.04@1.7s |  |  |  |  |  |
| bed: late September, fair | -35.5 | -32.3 | -23.6 | -14.7 | 0 | -136.5 | 0 | 18 | 0.1 | 0.22 | 0.01@11.5s | 0.03@1.0s |  |  |  |  |  |
| bed: late September, digging | -33.2 | -31.0 | -21.2 | -12.3 | 0 | -115.6 | 14 | 7.9 | 0 | 0.64 | 0.07@9.6s | 0.06@1.0s |  |  |  |  |  |
| bed: October gale, 11 m/s | -28.0 | -24.4 | -16.4 | -7.5 | 0 | -131.7 | 0 | 35 | 0.1 | 0.21 | 0.01@20.6s | 0.02@1.0s |  |  |  |  |  |
| bed: storm, 45 mm, tractor working (the loudest bed) | -24.3 | -21.7 | -12.5 | -3.7 | 0 | -78.9 | 3.0 | 30 | 3.3 | 0.24 | 0.02@19.2s | 0.03@1.0s |  |  |  |  |  |
| bed: cellar, November | -45.3 | -41.1 | -30.4 | -21.6 | 0 | -158.1 | 0.1 | 4.4 | 0 | 0.21 | 0.01@19.8s | 0.02@1.0s |  |  |  |  |  |
| bed: cellar, January | -43.1 | -39.1 | -28.8 | -19.9 | 0 | -149.6 | 0.1 | 6.8 | 0 | 0.21 | 0.01@19.8s | 0.02@1.0s |  |  |  |  |  |
| bed: ledger and year end | -38.5 | -31.3 | -28.4 | -19.6 | 0 | -143.1 | 0 | 77 | 0 | 0.49 | 0.14@10.2s | 0.11@5.1s |  |  |  |  |  |
| wind: breeze, 3.2 m/s, 90 s | -42.6 | -38.1 | -28.1 | -19.2 | 0 | -150.2 | 0.1 | 11 | 0 | 0.21 | 0.01@32.0s | 0.03@1.0s |  |  |  |  |  |
| wind: gale, 11 m/s, October | -28.0 | -24.4 | -16.4 | -7.5 | 0 | -131.7 | 0 | 35 | 0.1 | 0.21 | 0.01@20.6s | 0.02@1.0s |  |  |  |  |  |
| wind: the spruce ridge alone, 3.2 m/s | -43.5 | -39.2 | -30.2 | -21.3 | 0 | -164.0 | 0 | 14 | 0 | 0.21 | 0.01@19.3s | 0.03@1.0s |  |  |  |  |  |
| wind: the spruce ridge alone, 7.5 m/s and over | -29.6 | -25.4 | -17.9 | -9.0 | 0 | -150.5 | 0 | 44 | 0 | 0.22 | 0.00@19.4s | 0.03@1.0s |  |  |  |  |  |
| wind: cold whistle alone | -48.6 | -43.6 | -34.4 | -25.6 | 0 | -189.8 | 0 | 0.7 | 0 | 0.22 | 0.02@22.5s | 0.02@1.0s |  |  |  |  |  |
| rain: light, 3 mm | -40.6 | -39.5 | -28.0 | -19.4 | 0 | -78.5 | 0.1 | 56 | 4.4 | 0.01 | 0.00@8.8s | 0.02@1.0s |  |  |  |  |  |
| rain: heavy, 18 mm | -32.0 | -31.2 | -23.3 | -14.5 | 0 | -76.6 | 0 | 37 | 8.5 | -0.00 | 0.01@11.0s | 0.01@1.0s |  |  |  |  |  |
| rain: storm, 45 mm | -29.1 | -28.3 | -20.5 | -11.6 | 0 | -79.7 | 0 | 29 | 10 | -0.00 | 0.01@11.2s | 0.01@1.0s |  |  |  |  |  |
| birds: May morning, 60 s | -35.3 | -31.3 | -29.8 | -21.0 | 0 | -161.4 | 0 | 100 | 0 | 0.63 | 0.07@11.3s | 0.03@24.4s |  |  |  |  |  |
| bird: white-throated sparrow, rising form | -32.7 | -30.3 | -32.4 | -23.5 | 0 | -147.7 | 0 | 100 | 0 | 0.99 |  |  |  |  |  |  |  |
| bird: white-throated sparrow, falling form | -32.3 | -30.0 | -32.5 | -23.6 | 0 | -152.2 | 0 | 100 | 0 | 1.00 |  |  |  |  |  |  |  |
| bird: black-capped chickadee | -34.1 | -31.9 | -32.6 | -23.8 | 0 | -154.7 | 0 | 100 | 0 | 0.99 |  |  |  |  |  |  |  |
| bird: American robin, one group of phrases | -37.2 | -35.3 | -33.4 | -24.6 | 0 | -150.3 | 0 | 77 | 0 | 0.99 |  |  |  |  |  |  |  |
| bird: dark-eyed junco | -36.6 | -35.0 | -33.9 | -25.1 | 0 | -131.3 | 0 | 44 | 0 | 1.00 |  |  |  |  |  |  |  |
| crickets: August, 20 C | -43.2 | -39.6 | -29.7 | -20.8 | 0 | -176.7 | 0 | 99 | 0 | 0.93 | 0.04@10.2s | 0.05@4.3s |  |  |  |  |  |
| crickets: one cricket, 20 C | -44.9 | -41.7 | -32.2 | -23.3 | 0 | -168.3 | 0 | 100 | 0 | 1.00 | 0.11@2.8s | 0.04@2.4s |  |  |  |  |  |
| tractor: working | -37.2 | -36.5 | -24.8 | -15.9 | 0 | -135.6 | 24 | 0.1 | 0 | 1.00 | 0.05@6.5s | 0.08@1.0s |  |  |  |  |  |
| tractor: idling (work on foot) | -40.5 | -39.9 | -24.3 | -15.5 | 0 | -107.3 | 24 | 0 | 0 | 1.00 | 0.10@2.4s | 0.06@1.0s |  |  |  |  |  |
| cue: planted | -27.0 | -26.0 | -12.5 | -3.6 | 0 | -105.6 | 0 | 0 | 0 | 1.00 |  |  | 5 | 219 | 21 @198 (7) | 12 @500 | 20 @198 (5) |
| cue: hilled | -29.4 | -27.7 | -15.0 | -6.1 | 0 | -125.0 | 0 | 4.0 | 0 | 1.00 |  |  | 66 | 239 | 22 @1260 (10) | 22 @1260 | 12 @500 (7) |
| cue: sprayed | -27.8 | -26.1 | -12.7 | -3.8 | 0 | -164.6 | 0 | 64 | 3.8 | 1.00 |  |  | 13 | 230 | 29 @8000 (11) | 29 @8000 | 12 @5040 (5) |
| cue: watered | -28.8 | -27.9 | -13.5 | -4.6 | 0 | -111.0 | 0 | 0 | 0 | 0.99 |  |  | 3 | 187 | 28 @500 (6) | 28 @500 | 19 @500 (5) |
| cue: test dig (6 tubers on the tray) | -27.7 | -25.8 | -11.1 | -2.3 | 0 | -96.2 | 0.1 | 0.1 | 0 | 1.00 |  |  | 304 | 297 | 40 @125 (12) | 30 @500 | 21 @250 (9) |
| cue: dug (a basket into the barrel) | -28.1 | -23.2 | -15.0 | -6.1 | 0 | -82.2 | 2.5 | 0 | 0 | 1.00 |  |  | 15 | 1559 | 22 @79 (11) | 14 @500 | 22 @79 (9) |
| cue: sold | -27.7 | -26.0 | -12.3 | -3.5 | 0 | -101.4 | 0 | 58 | 0 | 0.99 |  |  | 3 | 233 | 42 @5040 (8) | 42 @5040 | 18 @315 (5) |
| cue: warning, frost (C4) | -29.3 | -23.7 | -18.4 | -9.6 | 0 | -136.4 | 0 | 0 | 0 | 0.97 |  |  | 12 | 2951 | 32 @250 (5) | 20 @500 | 20 @250 (2) |
| cue: warning, blight watch (A3) | -30.4 | -24.4 | -18.6 | -9.7 | 0 | -133.2 | 0 | 0 | 0 | 0.98 |  |  | 14 | 2468 | 33 @198 (6) | 16 @500 | 19 @198 (4) |
| cue: warning, blight seen (G3) | -29.1 | -23.6 | -18.7 | -9.8 | 0 | -124.7 | 0 | 0 | 0 | 0.98 |  |  | 11 | 2909 | 34 @198 (5) | 14 @630 | 20 @198 (2) |
| cue: warning, dry (E3) | -29.8 | -24.1 | -18.7 | -9.8 | 0 | -128.9 | 0 | 0 | 0 | 0.99 |  |  | 12 | 2840 | 19 @157 (5) | 15 @500 | 18 @157 (4) |
| cue: warning, a field lost (D3) | -30.2 | -24.3 | -18.7 | -9.8 | 0 | -129.0 | 0 | 0 | 0 | 0.98 |  |  | 14 | 2718 | 35 @157 (6) | 11 @630 | 18 @157 (4) |
| cue: year-end ledger | -26.8 | -22.8 | -15.1 | -6.3 | 0 | -155.9 | 0 | 0 | 0 | 0.99 |  |  | 232 | 3310 | 49 @79 (11) | 19 @630 | 23 @79 (8) |
| cue: five seasons kept | -25.5 | -22.1 | -12.3 | -3.4 | 0 | -158.4 | 0 | 0 | 0 | 0.99 |  |  | 3374 | 4388 | 49 @79 (12) | 20 @630 | 23 @79 (8) |
| cue: the farm lost | -30.1 | -24.9 | -17.0 | -8.1 | 0 | -153.8 | 18 | 0 | 0 | 0.99 |  |  | 215 | 7146 | 49 @63 (12) | 17 @630 | 22 @79 (9) |
| change: fair, then storm, then fair again | -30.2 | -24.7 | -17.2 | -8.4 | 0 | -89.0 | 0 | 33 | 4.2 | 0.16 |  |  |  |  |  |  |  |
| change: tractor starts, works, idles, stops | -38.8 | -36.7 | -24.7 | -15.8 | 0 | -125.5 | 23 | 0 | 0 | 1.00 |  |  |  |  |  |  |  |
| change: sound off and on again, tab hidden and shown | -35.3 | -32.8 | -22.1 | -14.9 | 0 | -110.0 | 17 | 14 | 0 | 0.84 |  |  |  |  |  |  |  |
| change: title, plan, season, cellar, ledger with its close | -32.6 | -22.8 | -15.1 | -6.2 | 0 | -133.5 | 0 | 11 | 0 | 0.91 |  |  |  |  |  |  |  |
| change: every cue once, in the order of a year | -27.6 | -22.0 | -7.4 | -0.4 | 0 | -94.8 | 0.2 | 4.2 | 0 | 0.96 |  |  |  |  |  |  |  |
| seam: every looped buffer wrapping round | -33.9 | -30.6 | -20.3 | -11.5 | 0 | -110.7 | 5.6 | 11 | 2.0 | 0.34 |  |  |  |  |  |  |  |
| scene: fair June morning, the farmer planting | -34.9 | -25.3 | -10.7 | -1.9 | 0 | -122.4 | 14 | 11 | 0 | 0.77 | 0.04@18.9s | 0.04@1.0s |  |  |  |  |  |
| scene: wet August day, blight warning, spraying | -34.0 | -23.6 | -12.3 | -3.5 | 0 | -79.1 | 6.7 | 13 | 0.7 | 0.72 | 0.13@1.0s | 0.07@1.0s |  |  |  |  |  |
| scene: dig day in late September, then a sale | -32.4 | -21.9 | -11.4 | -2.5 | 0 | -92.3 | 6.7 | 9.3 | 0 | 0.64 | 0.02@19.9s | 0.04@1.0s |  |  |  |  |  |
| stress: storm, gale, tractor and every cue at once | -18.0 | -14.1 | -2.0 | -0.3 | 0 | -78.5 | 0.6 | 4.8 | 0.3 | 0.91 |  |  |  |  |  |  |  |

LUFS: integrated loudness (ITU-R BS.1770-4, gated) at the default volume. mom: loudest 400 ms. dBTP: true peak
(4x oversampled) at the default volume. pk@max: sample peak with the volume slider at its top. clicks: discontinuities found
(worst one: how many times the largest neighbouring break, when, and the spacing in samples at which it shows).
DC dB: mean offset. <80%, 2-5k%, >8k%: share of the energy in those bands. L/R: stereo correlation.
loop, rhythm: how far the strongest repeat of the waveform, and of the pattern of events, stands above the rest of
the autocorrelation, and its period. att, dec: 10-90% rise, and peak to the last moment within 20 dB of it.
own bed, storm: the cue's loudest 170 ms against the mean of the bed, in the third-octave band where it stands
clearest, with that band, and (in brackets) how many bands it tops the bed by 6 dB or more. >500 Hz: the same
against its own bed, in the clearest band a phone's speaker can play.

Before and after (round 1 against round 8; loudness is integrated for beds
and voices, loudest 400 ms for cues):

| render | LUFS before | after | loop before | after | under 80 Hz % before | after | L/R before | after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bed: title screen | -31.3 | -38.5 int | 0.64 | 0.04 | 2 | 0 | 0.17 | 0.69 |
| bed: spring plan | -32.3 | -41.1 int | 0.76 | 0.04 | 2 | 0 | 0.04 | 0.57 |
| bed: June, fair | -28.0 | -37.9 int | 0.60 | 0.03 | 2 | 0 | 0.09 | 0.48 |
| bed: June, fair, tractor working | -27.0 | -34.2 int | 0.07 | 0.04 | 34 | 17 | 0.46 | 0.80 |
| bed: August, steady rain, 9 mm | -25.6 | -35.0 int | 0.58 | 0.01 | 2 | 0 | 0.01 | 0.12 |
| bed: August, drizzle, tractor working | -28.7 | -35.2 int | 0.09 | 0.08 | 42 | 20 | 0.54 | 0.86 |
| bed: August, fair and warm, crickets | -31.7 | -42.2 int | 0.52 | 0.03 | 2 | 0 | 0.11 | 0.51 |
| bed: late September, fair | -23.7 | -35.5 int | 0.89 | 0.01 | 2 | 0 | 0.01 | 0.22 |
| bed: late September, digging | -23.6 | -33.2 int | 0.43 | 0.07 | 18 | 14 | 0.21 | 0.64 |
| bed: October gale, 11 m/s | -18.4 | -28.0 int | 0.56 | 0.01 | 2 | 0 | 0.01 | 0.21 |
| bed: storm, 45 mm, tractor working (the loudest bed) | -16.2 | -24.3 int | 0.54 | 0.02 | 6 | 3 | 0.06 | 0.24 |
| bed: cellar, November | -35.0 | -45.3 int | 0.47 | 0.01 | 1 | 0 | 0.00 | 0.21 |
| bed: cellar, January | -33.5 | -43.1 int | 0.51 | 0.01 | 2 | 0 | 0.01 | 0.21 |
| bed: ledger and year end | -31.8 | -38.5 int | 0.67 | 0.14 | 2 | 0 | 0.13 | 0.49 |
| wind: breeze, 3.2 m/s, 90 s | -29.4 | -42.6 int | 0.60 | 0.01 | 2 | 0 | 0.01 | 0.21 |
| wind: gale, 11 m/s, October | -18.4 | -28.0 int | 0.56 | 0.01 | 2 | 0 | 0.01 | 0.21 |
| wind: the spruce ridge alone, 3.2 m/s | - | -43.5 int | - | 0.01 | - | 0 | - | 0.21 |
| wind: the spruce ridge alone, 7.5 m/s and over | - | -29.6 int | - | 0.00 | - | 0 | - | 0.22 |
| wind: cold whistle alone | -36.7 | -48.6 int | 0.32 | 0.02 | 0 | 0 | -0.01 | 0.22 |
| rain: light, 3 mm | -38.3 | -40.6 int | 0.78 | 0.00 | 0 | 0 | -0.00 | 0.01 |
| rain: heavy, 18 mm | -23.7 | -32.0 int | 0.85 | 0.01 | 1 | 0 | 0.00 | -0.00 |
| rain: storm, 45 mm | -19.6 | -29.1 int | 0.93 | 0.01 | 2 | 0 | 0.00 | -0.00 |
| birds: May morning, 60 s | -26.1 | -35.3 int | 0.13 | 0.07 | 0 | 0 | 0.95 | 0.63 |
| bird: white-throated sparrow, rising form | -26.2 | -32.7 int | - | - | 0 | 0 | 0.99 | 0.99 |
| bird: white-throated sparrow, falling form | - | -32.3 int | - | - | - | 0 | - | 1.00 |
| bird: black-capped chickadee | -26.9 | -34.1 int | - | - | 0 | 0 | 0.99 | 0.99 |
| bird: American robin, one group of phrases | -30.0 | -37.2 int | - | - | 0 | 0 | 0.98 | 0.99 |
| bird: dark-eyed junco | -34.6 | -36.6 int | - | - | 0 | 0 | 0.99 | 1.00 |
| crickets: August, 20 C | -36.7 | -43.2 int | 0.11 | 0.04 | 0 | 0 | 0.69 | 0.93 |
| crickets: one cricket, 20 C | -42.3 | -44.9 int | 0.22 | 0.11 | 0 | 0 | 1.00 | 1.00 |
| tractor: working | -35.1 | -37.2 int | 0.09 | 0.05 | 78 | 24 | 1.00 | 1.00 |
| tractor: idling (work on foot) | -44.3 | -40.5 int | 0.17 | 0.10 | 84 | 24 | 1.00 | 1.00 |
| cue: planted | -32.6 | -26.0 mom | - | - | 0 | 0 | 1.00 | 1.00 |
| cue: hilled | -35.9 | -27.7 mom | - | - | 0 | 0 | 1.00 | 1.00 |
| cue: sprayed | -32.4 | -26.1 mom | - | - | 0 | 0 | 1.00 | 1.00 |
| cue: watered | -36.6 | -27.9 mom | - | - | 0 | 0 | 0.98 | 0.99 |
| cue: test dig (6 tubers on the tray) | -28.3 | -25.8 mom | - | - | 0 | 0 | 1.00 | 1.00 |
| cue: dug (a basket into the barrel) | -28.3 | -23.2 mom | - | - | 0 | 3 | 1.00 | 1.00 |
| cue: sold | -32.3 | -26.0 mom | - | - | 0 | 0 | 1.00 | 0.99 |
| cue: warning, frost (C4) | -25.0 | -23.7 mom | - | - | 0 | 0 | 0.97 | 0.97 |
| cue: warning, blight watch (A3) | -25.9 | -24.4 mom | - | - | 0 | 0 | 0.98 | 0.98 |
| cue: warning, blight seen (G3) | -24.9 | -23.6 mom | - | - | 0 | 0 | 0.98 | 0.98 |
| cue: warning, dry (E3) | -25.5 | -24.1 mom | - | - | 0 | 0 | 1.00 | 0.99 |
| cue: warning, a field lost (D3) | -25.7 | -24.3 mom | - | - | 0 | 0 | 0.98 | 0.98 |
| cue: year-end ledger | -26.8 | -22.8 mom | - | - | 0 | 0 | 0.99 | 0.99 |
| cue: five seasons kept | -26.3 | -22.1 mom | - | - | 0 | 0 | 0.99 | 0.99 |
| cue: the farm lost | - | -24.9 mom | - | - | - | 18 | - | 0.99 |
| change: fair, then storm, then fair again | -18.2 | -30.2 int | - | - | 2 | 0 | 0.01 | 0.16 |
| change: tractor starts, works, idles, stops | -37.2 | -38.8 int | - | - | 80 | 23 | 1.00 | 1.00 |
| change: sound off and on again, tab hidden and shown | -28.4 | -35.3 int | - | - | 40 | 17 | 0.58 | 0.84 |
| change: title, plan, season, cellar, ledger with its close | -29.6 | -32.6 int | - | - | 2 | 0 | 0.10 | 0.91 |
| seam: every looped buffer wrapping round | -19.0 | -33.9 int | - | - | 8 | 6 | 0.10 | 0.34 |
| scene: fair June morning, the farmer planting | -27.7 | -34.9 int | 0.16 | 0.04 | 30 | 14 | 0.42 | 0.77 |
| scene: wet August day, blight warning, spraying | -27.1 | -34.0 int | 0.33 | 0.13 | 16 | 7 | 0.25 | 0.72 |
| scene: dig day in late September, then a sale | -24.4 | -32.4 int | 0.55 | 0.02 | 13 | 7 | 0.16 | 0.64 |
| stress: storm, gale, tractor and every cue at once | -15.7 | -18.0 int | - | - | 4 | 1 | 0.23 | 0.91 |

The before figures for masking are not shown: round 1 was measured with an
earlier version of the masking test that counted bands where the cue was
barely present. Round 1's cues were also rendered a tenth of a second into a
fresh context, while the compressor then in the chain was still opening, and
read about 1 dB low.

What the first round's numbers showed, in the designer's terms:

- **The beds were louder than the cues.** A fair June bed sat at -28 LUFS and
  an October gale at -18, while the planted cue's loudest moment was about
  -32. The plan is now the other way up.
- **Every noise bed was a 5-second loop** (repeat 0.5 to 0.9 at 5.0 s), and
  light rain a 6-second one. Listeners pick out repeated noise up to cycles
  of 10 to 20 s (Kaernbach 2004). Noise now comes from three passes over a
  32-second buffer at speeds that wander by 1%, so no pass lines up with the
  last; the strongest repeat left anywhere is 0.14.
- **Wind and rain leaned left.** They were made stereo by delaying the right
  channel 11 to 31 ms, which the ear hears as a source on the left with an
  echo on the right, and which combs when summed to mono. They are now a
  middle and a side made from separate noise.
- **The tractor was a 14.5 Hz buzz** with 78% of its energy under 80 Hz,
  where a laptop plays nothing.
- **The tubers were a drum**: one resonance near 200 Hz, a bright click on
  top, evenly spaced.

## Each sound and what it was matched to

Numbers under "render" were measured from the final WAVs, not read from the
code, except ranges given "by bird" or "by cricket" and figures marked "as
written", which are the code's. Note lengths are taken within 14 dB of each
song's peak. Sources are listed at the end; the notes there say which were
read first hand and which through research agents.

### White-throated sparrow

![](sound/bird-sparrow.png)

| | Published | Render |
| --- | --- | --- |
| Tone | Clear whistles, steady in pitch, nearly pure (Borror and Gunn 1965; Riede and Suthers 2009) | Sine with a second harmonic at -30 dB; each note within 0.5% of its pitch |
| Lowest whistle | 3206 Hz mean in Maine, range 2600 to 3900 | 2800 to 3700 Hz by bird; this one 3203 |
| Step between the long whistles | Ratio 1.26 (Grunst et al. 2018); Maine mean 2.6 semitones, range 0.4 to 6.6 | 1.6 to 5.2 semitones by bird; this one 4015 / 3203 = 1.25 |
| First whistle | 0.68 s mean, 0.27 to 1.17; about half of songs scoop up into a note | 0.73 s here (0.72 s give or take 7%); half the birds scoop the first from 6% under, this one from 3057 Hz |
| Second whistle, gaps | 0.52 to 0.62 s; gaps 0.17 to 0.20 s (Weary and Weisman 1992) | 0.58 s; gaps 0.22 and 0.17 s |
| Triplet | 0.39 s mean (0.24 to 0.63), three equal parts split by breaks of 0.02 s or less | Parts 93 to 95 ms, starting 125 ms apart, 0.34 s in all |
| Triplets in a song | Mean 1.8, Maine 1.4, range 0 to 7; pitch sinks half a semitone through them | 1 to 3, the last sometimes dropped; 3966 then 3918 Hz |
| Whole song | 2.87 s mean | 2.5 s (rising), 3.1 s (falling, with a third whistle) |
| Form | Maine in the 1960s: 82% rising, 2% falling; New York in 2018: 46% and 44% | 80% of birds rising |
| Between songs | 5 to 10 s; one pattern and one pitch per male | 5 to 10 s; a bird keeps its song |

The song that shipped had its whistles 0.6 and 0.5 s long with an 80 ms gap,
and every triplet note slid down by the same 60 Hz. Still different: the
two-note ending that has spread from the west is left out (148 of 150 recent
songs from Quebec and the Maritimes still end in triplets); real notes wander
more within themselves than these do.

### Black-capped chickadee

![](sound/bird-chickadee.png)

| | Published (Weisman et al. 1990, 132 birds; Ficken et al. 1978) | Render |
| --- | --- | --- |
| Fee | 3814 Hz falling to 3609 over its first 184 ms (ratio 1.056) | 3784 to 3603 Hz (1.050) |
| Bee | 3183 Hz; fee end to bee 1.134 | 3177 Hz; 1.134 |
| Lengths | Fee 0.34 s, gap 0.135 s, bee 0.37 s | 0.31, 0.15, 0.35 s |
| Bee | A dip or a 0.05 s break near the middle, in every bird | Two halves of 151 ms with a 51 ms break |

It shipped with a fee that fell 30 Hz, not 200, and a wobble in pitch where
the bee should dip in loudness. Still different: a real male shifts his whole
song by about 330 Hz every 30 or 40 songs; a bird here sings three to five and
goes quiet. Chickadees whistle little after morning, so it is the rarest of
the four.

### American robin

![](sound/bird-robin.png)

| | Published (Johnson 2006; Bent 1949) | Render |
| --- | --- | --- |
| Range | 1.5 to 4 kHz | 1.74 to 2.96 kHz in this group; 1.65 to 3.9 allowed |
| Phrase | 150 to 350 ms; 1 to 4 notes, usually 2 or 3, each sliding 300 to 1500 Hz | 2 or 3 notes of 35 to 99 ms sliding 290 to 870 Hz |
| Pace | About two phrases a second | Phrases start 0.57, 0.49, 0.57 s apart |
| Grouping | Groups of 2 to 5 phrases, about a second between groups | Groups of 3 to 7, 0.8 to 1.5 s between; a bird sings 2 to 4 groups |
| Repertoire | About 10 phrase types a male, sung in favoured orders, alternating up and down | 8 to 13 types a bird, alternating rising and falling |

It shipped as four identical up-and-down sweeps. Still different: the slides
are straight lines where a robin's curve; the high, thin "hisselly" phrases of
the dawn song are left out.

### Dark-eyed junco

![](sound/bird-junco.png)

The trill that shipped was "like a chipping sparrow or junco": 10 to 16 chips
at 15 a second, lasting about a second. The junco is the bird of the spruce
edge and is the one modelled now.

| | Published (Titus 1998; Konishi 1964; AAB) | Render |
| --- | --- | --- |
| Trill | 1.5 s (1.2 to 1.6); 9 to 21 notes; about 9 a second, 13.6 in a Newfoundland bird | 1.20 s; 11 notes; 8.8 a second (8.5 to 13.5 by bird) |
| Note | 80 ms with a 36 to 40 ms gap; most notes have more than one part | About 65 ms and 48 ms; a falling part of 35 ms and a shorter one above it |
| Range | 3.4 to 6.5 kHz | 5.6 down to 4.1 kHz, then a note at 5.2 (written to span 3.7 to 5.9) |

### Field crickets

![](sound/cricket-one.png)

The code that shipped used Dolbear's law. That law was measured on the snowy
tree cricket, which keeps strict time, sings near 3 kHz, and does not live in
Aroostook County (no record north of 44.7 N). The cricket of a Maine potato
field in August is the fall field cricket, *Gryllus pennsylvanicus*.

| | Published | Render, one cricket at 20 C |
| --- | --- | --- |
| Carrier | 4.16 to 5.11 kHz between males, mean 4.65 to 4.7 (Bertram et al. 2013; Harrison et al. 2013; SINA) | 4350 to 5000 Hz by cricket; this one 4349 |
| Within a pulse | Falls about 215 Hz (measured on the SINA recording) | Falls 4.6% |
| Pulses in a chirp | 3 to 5, usually 4 | 3 2 4 4 4 4 4 4 4 4 |
| Pulse spacing | 41, 46, 52 ms through a chirp at 24.4 C; 34 to 42 ms at 29 C | 53 ms mean at 20 C, each gap longer than the last |
| Pulse length | 18.4 ms, 14.6 to 22.4 | 0.41 of the spacing: 22 ms at 20 C |
| Swell | -7.3, -2.4, -0.5, -0.1 dB through a four-pulse chirp | The same |
| Chirp rate | 1.25 a second at 24.4 C (SINA); 2 to 3 in field accounts; 2.5 to 4 at 29 C (Alexander 1957) | 1.4 a second at 20 C on average, each cricket 0.65 to 1.35 of that; this one 1.51 |
| Regularity | "An irregular chirper"; gaps vary by 21% | Gaps vary by 22% |
| Together | No synchrony reported | Each keeps its own pace |

Temperature: chirp rate goes as (T - 6 C) and pulse rate as (T + 6 C), the
shape measured in *G. firmus* (Pires and Hoy 1992), anchored at 1.9 chirps a
second at 25 C and 46 ms at 24.4 C. No such curve was found for
*G. pennsylvanicus* itself. They are silent under about 12 C. Still
different: four crickets, where a field has hundreds; no difference between
day and night.

### Rain

![](sound/rain-light.png)
![](sound/rain-storm.png)

No calibrated spectrum of rain heard in air was found, so this is matched to
descriptions. Rain raises the level across the spectrum, most between 0.6 and
1.2 kHz and between 4.4 and 5.6 kHz where drops strike leaves (Metcalf et al.
2020; Bedoya et al. 2017); in light rain single drops are heard, and as it
gets heavy they run together into steady noise (Brown et al. 2018); heavy
rain lifts the 0.6 to 1.2 kHz band by 8 to 21 dB in three forest recordings
and hardly at all on a city balcony (read off the hardRain paper's figure).

In the render, light rain is separate ticks (a few cycles each, centred on
3.6 kHz and spread an octave either way) over a faint hiss from 0.6 to
6.5 kHz. As rain gets heavy the hiss grows and opens to 8 kHz, and a band
around 850 Hz comes up under it. Measured, the 0.6 to 1.2 kHz band rises 12 dB
from light rain to heavy and 17 dB to a storm; the 4.4 to 5.6 kHz band rises
8 and 10 dB.

What shipped was a 6-second loop of ticks with a hard upper edge at 5.6 kHz,
and for heavy rain a rumble under 160 Hz that rain does not make. Still
different: no drip from a roof, no thunder; the ring of drops on standing
water is a guess at 3 to 7 kHz from one paper on a dripping tap.

### Wind

![](sound/wind-breeze.png)
![](sound/wind-gale.png)

| | Published (Bolin 2009; Fegeant 2002; Boersma 1997) | Render |
| --- | --- | --- |
| Conifers | A band peaking at 0.2 x wind speed / needle thickness: 200 Hz per m/s for spruce, about an octave and a half wide | Band-pass of that width centred on 200 Hz x speed. The ridge alone peaks at 697 Hz at 3.2 m/s (3 dB down at 404 and 1195) and at 1693 Hz at 7.5 m/s and over (996 and 2648); gusts, which are louder and higher, pull both above the plain 640 and 1500 |
| Leaves | Rustle around 4 kHz from leaves touching | Band from 2.6 to 5.2 kHz, mostly in gusts |
| Level against speed | 9 to 12 dB for each doubling | 14.6 dB from 3.2 m/s to 7.5 m/s and over (1.2 doublings: 11 to 15 dB by the published slopes) |
| Gusts | Level wanders 2.3 to 5.2 dB (standard deviation) on a scale of about 10 s | 2.8 dB in a breeze and 2.7 dB in a gale, second by second; a new gust every 3 to 9 s |

Under those two sits a broad low rush, the air itself over open ground, and in
cold months a thin pitched whistle of wind at a gap. Neither has a reference;
they are a designer's layers. What shipped was low-passed noise with most of
its energy between 70 and 500 Hz, at -18 LUFS in a gale.

### Tractor

![](sound/tractor-working.png)
![](sound/tractor-idle.png)

The tractor in the scene is small and red. Flatcars of Farmalls came into
Presque Isle around 1950, and the Farmall H is the model here: four
cylinders, four-stroke, 152 cubic inches, governed at 1650 rpm (Nebraska Test
333), low idle about 450. A four-stroke four fires twice a turn: 55 Hz at
work, 15 a second at idle.

| | Reference | Render |
| --- | --- | --- |
| Firing, at work | 55 Hz and its multiples | Lines at 54.8, 109.9, 164.9, 219.8 Hz |
| Between them | Half orders from uneven cylinders, weaker; no published level | 41.1, 68.6, 96.1 Hz and so on, 11 to 12 dB under |
| Idle | 13 to 15 firings a second, heard as a putter, not a pitch | Lines every 15.0 Hz |
| Speed under load | Governor holds within 4% | Wanders within 2%, as written |
| Octave bands from 63 Hz to 4 kHz, dB against the 125 Hz band, open exhaust (Bies and Hansen, in Guyer) | -6, 0, -4, -12, -16, -22, -32 | -2.8, 0, -2.5, -12.8, -15.5, -20.6, -32.7 |

What shipped fired at 29 Hz, which is this engine's crank speed and half its
firing rate, with its strongest line at 14.5 Hz, and was low-passed at 230 Hz.
Still different: no starter, no gear whine, no change with distance as it
crosses the field beyond a slow drift from side to side. The level of the half
orders is a guess.

### Tubers on wood: the test dig and dig day

![](sound/cue-test-dig.png)
![](sound/cue-dug.png)

The Aroostook barrel is cedar staves and ash hoops, 48 cm across and 76 cm
deep, 165 pounds full, and a picker fills it with about four baskets of 30
pounds. Dig day's cue is one basket going in.

| | Reference | Render |
| --- | --- | --- |
| The blow | A 200 g tuber stays in contact about 5 ms (Hertz contact, potato stiffness 3 MPa), so it drives the wood mostly under 250 Hz | Rise 3 to 5 ms as written; a thud falling from 131 to 82 Hz, strongest at 95 Hz |
| Wood | Decay time falls as frequency rises, at a loss factor near 0.02 for a free plate; listeners call it rubber near 0.1 (Klatzky et al. 2000; Giordano and McAdams 2006) | Modes written at 196, 338, 527, 806 Hz dying in 50, 30, 19, 12 ms, a loss factor of 0.032 at each; lines measured at 197, 325 to 345 and 520 to 549 Hz |
| The hollow | Air in the barrel rings at 95 Hz empty, 120, 163, 250 Hz at a quarter, half, three-quarters full | A band rising from 105 to 255 Hz through the run, as written |
| The run | A basket tips in a rush and the last tubers roll to rest | 16 to 19 tubers: a tumble of 0.7 s, then gaps of 151, 154, 198, 183 and 322 ms, the knocks falling from -18 to -32 dB |
| Filling | Later tubers land on tubers | Wood modes fall to under half and shorten by a third as it fills, as written |

The contact time says a real tuber puts almost nothing into the wood above
300 Hz. A laptop speaker plays little under 200 Hz and a phone little under
500. The upper modes are therefore kept, 4 to 16 dB under the lowest, so that
the knock survives on small speakers: this is a choice for legibility, against
the physics. The test dig lays each tuber on a wooden tray, as the screen
shows: thinner wood, higher modes (262 to 1130 Hz), no hollow, one knock for
each tuber in the hill, unhurried: gaps of 213 to 294 ms. The tray has no
reference.

### The warning

![](sound/cue-warn-watch.png)

One struck chime for every warning, at a pitch for each kind, lower for worse:
frost C4, blight weather A3, blight seen G3, dry E3, a field lost D3. Soft
mallet: 12 ms rise, the fundamental dying over 3 s. It is the only cue meant to
be noticed over rain, so it carries partials at 2, 3, 4 and 6 times the note:
a phone cannot play 147 Hz but can play 588 and 884, and the ear fills in the
note under them. The blight-weather chime stands 33 dB clear of a steady-rain
bed at its fundamental, and each warning 11 to 20 dB clear of its own bed above
500 Hz. A second warning within 2.5 s is not sounded.

### The closes: year end, farm kept, farm lost

![](sound/cue-ledger.png)
![](sound/cue-kept.png)
![](sound/cue-lost.png)

A parlour reed organ: two reeds a few cents apart and a soft octave, low-passed
at 1.5 kHz. All three begin on the same B flat chord.

- **Year end**: IV to I in F, the plain amen. 3.4 s.
- **Farm kept**: IV, I over its fifth, a suspended fourth on V that resolves,
  then home, the top voice climbing D, F, F, E, F to the keynote. 6.2 s. It
  replaces IV, V, I with an added sixth in 4 s. Whether five chords with a
  suspension sound earned and three sounded like a jingle is exactly what
  cannot be measured.
- **Farm lost**: the same opening chord held longer, then down to D with no
  third in it, 2 LU quieter than the year end, left to die over 10 s. No
  chime. Before, the loss had the low warning chime and no close at all.

### Job cues

Planted: two soft pats on earth. Hilled: two sweeps of soil. Sprayed: two
breaths of a nozzle. Watered: two drops. Sold: two coins on a wooden counter.
None has a reference. Each now varies in pitch, spacing and weight from one
time to the next, and at the fastest clock (eight days a second) a job is
heard once a second at most, not once a field.

![](sound/cue-planted.png)
![](sound/cue-hilled.png)
![](sound/cue-sprayed.png)
![](sound/cue-watered.png)
![](sound/cue-sold.png)

### The scenes

Each a minute, driven as the game drives the engine: the scene re-read every
150 ms, timed sounds scheduled 0.4 s ahead, events through the same director.

A fair June bed with nobody working:

![](sound/bed-june.png)

June morning: a white-throated sparrow and a junco, the tractor from 6 to 46 s,
planting at 24 and 41 s, a robin at the end.

![](sound/scene-june.png)

Wet August: rain, the blight-weather chime at 12 s, rain easing at 24 s and the
crickets starting, the tractor at 30 s, the sprayer at 44 s, the blight chime
at 52 s as the tractor stops.

![](sound/scene-august.png)

Dig day: wind in gusts, the tractor, a basket into the barrel at 20 and 40 s as
the clock stops, the cellar from 47 s, a sale at 54 s.

![](sound/scene-dig.png)

## One soundscape

- **Nothing repeats exactly.** Every random choice comes from the session's
  seeded generator. A bird is an individual with its own song, pitch, place
  and distance, and sings a bout at its species' pace before another takes
  over; two lanes of birds, near and far, overlap. Crickets each have a
  carrier, a pulse count and a pace. Gusts, engine revs, drops and every cue
  draw their timing and pitch fresh.
- **Every change is a fade.** Bed levels move through two gains in series
  toward the square root of the target, so a sound rising from silence starts
  with no slope; gusts and the ridge's pitch glide in equal ratios. Weather crosses over
  in about three seconds. The master fades in over a quarter of a second after
  the first gesture and out in a tenth when sound is switched off or the tab is
  hidden.
- **The limiter is a soft ceiling and nothing else.** The chain ends in a
  fixed gain and a wave-shaping ceiling: unity up to 0.7 of full scale, bending
  to 0.97 and never past it. There was a compressor before it. The
  three-engine check showed that Firefox's let the first tenth of a second of
  any sound that followed quiet through 3 to 5 dB low, so the planted cue
  measured -30.6 LUFS there against -26.0 in Chromium and WebKit, alone or
  four seconds into a render. Without it the three engines agree on every cue
  to 0.2 LU. At the default volume the chain is a plain gain of 5.8 dB: it
  changes no peak in any render, and the highest true peak anywhere is
  -7.4 dBTP. With the slider at its top, a minute of ordinary play peaks at
  0.67 to 0.80 of full scale, at or just over the knee; every cue of the year
  inside 40 seconds reaches 0.96, about 2 dB into the ceiling; everything at
  once sits on it at 0.97.
- **Cost.** Every continuous voice runs whatever the weather. 48 seconds of
  a gale renders in 1.7 s on the laptop that wrote this, building the engine
  included.

## What is still not known

- Whether any of it is pleasant, or tiring over half an hour.
- Whether the birds, the tractor and the barrel are recognised for what they
  are. Matching pitch, rhythm and spectrum is necessary for that and may not
  be enough: timbre lives in detail these tables do not hold.
- Whether the cadence for keeping the farm lands, and whether the loss is
  sober or merely dull.
- The balance on real loudspeakers. Masking was estimated band by band from
  levels, not with a model of hearing, and small-speaker behaviour was
  inferred from published roll-offs, not measured on a device.
- Live behaviour on a phone. The live engine is exercised in headless
  Chromium, Firefox and WebKit (autoplay gate, volume, mute, hidden tab);
  iOS Safari's own rules were not, nor the cost on a slow phone.
- Soft thumps. The click test finds true breaks in the waveform; a step
  smeared over a millisecond passes it unless it is large (see "What was
  done"). Nothing in the code makes one, but the test would not have said.
- Chromium ends a `setTargetAtTime` fade about 6.5 time constants in, a step
  some 56 dB under where the fade began. In the longest cue that is under
  -89 dBFS.
- The offline renders and the live game share every voice, the event
  director and the frame loop's timing, but the live game was only checked
  for level, not recorded and measured.

## Listening sheet

The WAVs are in
`/private/tmp/claude-501/-Users-mize-Dev-PotatoBench-Fable52PotatoBench/4fbad3a2-df50-4a92-9e03-701d40befb51/scratchpad/quality/sound/8/`
(a scratch folder; `node tools/audio/render.ts <folder>` makes them again
anywhere). They are at the game's default volume, so they are quiet: set the
system volume where speech from a video is comfortable and leave it there.

| File | Listen for |
| --- | --- |
| `54-scene-june.wav` | Start here. A minute of a fair June morning: a white-throated sparrow and a junco, the tractor coming in at 6 s and stopping at 46 s, planting at 24 and 41 s, a robin at the end. Is the tractor a tractor, and can you ignore it? Do the planting pats read as earth? Is anything too loud? |
| `55-scene-august.wav` | Steady rain, a warning at 12 s, rain easing at 24 s, crickets, the tractor from 30 s, the sprayer at 44 s, a lower warning at 52 s. Is the warning clear over the rain without startling? Does the rain end naturally? |
| `56-scene-dig.wav` | Dig day: wind, the tractor, a basket into the barrel at 20 and 40 s, the cellar from 47 s, a sale at 54 s. Does the barrel sound like wood and weight? Does the run slow and settle? |
| `38-cue-dug.wav`, `37-cue-test-dig.wav` | The two key moments alone. Wood, or a drum? Potatoes, or stones? |
| `46-cue-kept.wav`, `47-cue-lost.wav`, `45-cue-ledger.wav` | Earned, sober, plain? Does the organ's slow beating sound warm or seasick? |
| `41-cue-warn-watch.wav` and `40`, `42` to `44` | One chime at five pitches. Restrained? Is the lowest still a note on your speakers? |
| `24-bird-sparrow.wav`, `25-bird-sparrow-falling.wav` | "Old Sam Peabody, Peabody." If you know the bird: is it one? Too pure? |
| `26-bird-chickadee.wav`, `27-bird-robin.wav`, `28-bird-junco.wav` | Fee-bee; a robin's carol; a junco's trill. The robin is the least certain. |
| `23-birds-may.wav` | A minute of birds alone. Too many, too few, too regular? |
| `30-cricket-one.wav`, `29-crickets.wav`, `07-bed-august-evening.wav` | A field cricket, not a phone. Is a steady 4.7 kHz tolerable for minutes? |
| `31-tractor-working.wav`, `32-tractor-idle.wav`, `49-change-tractor.wav` | Engine or hum? Does the idle putter? Does it start and stop without a bump? |
| `20-rain-light.wav`, `21-rain-heavy.wav`, `22-rain-storm.wav` | Drops, then a hiss, then a roar. Any hiss that tires the ear? |
| `15-wind-breeze.wav` (90 s), `16-wind-gale.wav`, `19-wind-cold.wav` | Does anything come round? Do the gusts breathe? Is the cold whistle too much of an effect? (`17` and `18` are the ridge layer alone.) |
| `48-change-weather.wav`, `51-change-places.wav`, `50-change-mute.wav` | Every change of weather and of screen: any step, bump or hole? |
| `52-change-cues.wav` | Every cue in the order of a year. Do they belong to one game? |
| `33` to `36`, `39` | Planted, hilled, sprayed, watered, sold. |
| `01` to `14` | Each bed for half a minute or more. |
| `57-stress.wav` | Everything at once. It should be ugly and must not crackle. |

## Sources

Read first hand by the agent that wrote this file: Bolin 2009 (pages 607 to
611), the TractorData page for the Farmall H, the SINA page for the fall field
cricket, and Klatzky et al. 2000 (page 4). Everything else was read by three
research agents, which opened the pages and returned figures with quotations;
their reading is what is cited. Where a figure is their own arithmetic or
their own reading of a recording it is said so above.

Birds
- Borror and Gunn 1965, Variation in White-throated Sparrow songs, Auk 82:26. https://sora.unm.edu/sites/default/files/journals/auk/v082n01/p0026-p0047.pdf
- Weary and Weisman 1992, Condor 94:1013. https://sora.unm.edu/sites/default/files/journals/condor/v094n04/p1013-p1016.pdf
- Grunst et al. 2018, Ecology and Evolution 8:1369. https://pmc.ncbi.nlm.nih.gov/articles/PMC5773301/
- Riede and Suthers 2009. https://pmc.ncbi.nlm.nih.gov/articles/PMC2826496/
- Otter et al. 2020, Current Biology; McKenna 2017 (thesis, UNBC), for where the triplet ending still holds. https://www.unbc.ca/sites/default/files/sections/ken-otter/mckenna-finalthesis2017.pdf
- Weisman, Ratcliffe, Johnsrude and Hurly 1990, Condor 92:118. https://sora.unm.edu/sites/default/files/journals/condor/v092n01/p0118-p0124.pdf
- Ficken, Ficken and Witkin 1978, Auk 95:34. https://sora.unm.edu/sites/default/files/journals/auk/v095n01/p0034-p0048.pdf
- Horn et al. 1992, Auk 109:847. https://sora.unm.edu/sites/default/files/journals/auk/v109n04/p0847-p0852.pdf
- Johnson 2006, Wilson Journal of Ornithology 118:341. https://zenodo.org/records/16564679
- Bent 1949, the robin account. https://www.birdsbybent.com/ch31-40/robin.html
- Titus 1998, Auk 115:386. https://sora.unm.edu/sites/default/files/journals/auk/v115n02/p0386-p0393.pdf
- Konishi 1964, Condor 66:423. https://sora.unm.edu/sites/default/files/journals/condor/v066n05/p0423-p0436.pdf
- Cornell Lab, All About Birds, sounds pages for each species. https://www.allaboutbirds.org/guide/White-throated_Sparrow/sounds

Crickets
- Singing Insects of North America, *Gryllus pennsylvanicus*, with a recording at 24.4 C. https://orthsoc.org/sina/489a.htm
- Bertram et al. 2013, PLoS ONE 8:e69247. https://pdfs.semanticscholar.org/6947/4df962ec00d302af14f21cf3fcbd52be63de.pdf
- Harrison et al. 2013, PLoS ONE 8:e60356. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0060356
- Alexander 1957, the field crickets of the eastern United States. https://orthsoc.org/sina/g464la57.pdf
- Weissman and Gray 2019. https://orthsoc.org/sina/s464wg-gpennsylvanicus.pdf
- Dolbear 1897, The cricket as a thermometer, American Naturalist 31:970; Walker 1962, for which cricket it describes. https://orthsoc.org/sina/s576lw62.pdf
- Martin, Gray and Cade 2000, and Pires and Hoy 1992 (abstract), for temperature. https://www.csun.edu/~dgray/pdfs/Martinetal2000CJZtemp.pdf

Rain and wind
- Metcalf et al. 2020, hardRain (preprint). https://eprints.lancs.ac.uk/138438/1/Metcalf_et_al._hardRain_preprint.pdf
- Brown et al. 2018. https://arxiv.org/html/1804.05502v1
- Ferroudj et al. 2014. https://eprints.qut.edu.au/76561/
- Phillips and Jordan, The annoying dripping tap, Physics Today. https://physicstoday.aip.org/quick-study/the-annoying-dripping-tap
- Bolin 2009, Prediction method for wind-induced vegetation noise, Acta Acustica 95:607. https://dael.euracoustics.org/bin/EAA/aaua_dl?document_id=64838
- Fegeant 2002, KTH report 2002:12. https://www.osti.gov/etdeweb/servlets/purl/20354687
- Boersma 1997, JASA 101:2104 (abstract). https://pubs.aip.org/asa/jasa/article-abstract/101/4/2104/558502/

Tractor and barrel
- Nebraska Tractor Test 333, Farmall H, 1939. https://digitalcommons.unl.edu/tractormuseumlit/102/
- TractorData, Farmall H engine. https://www.tractordata.com/farm-tractors/000/2/9/290-farmall-h-engine.html
- Guyer, Introduction to sound level data for mechanical and electrical equipment (unmuffled exhaust, Table 18). https://www.cedengineering.com/userfiles/Intro%20to%20Sound%20Level%20Data%20for%20Mech%20&%20Elec%20Equip.pdf
- Maine Memory Network: tractor delivery, Presque Isle, about 1950 (item 22415); potato barrels (items 12957, 12952); picking (item 19015). https://www.mainememory.net/record/22415
- Celik et al. 2019, potato stiffness. https://eprints.lancs.ac.uk/id/eprint/133807/1/J_Food_Proc_Eng_Apr2019_Potato_Collision_Rev_012.pdf
- Klatzky, Pai and Krotkov 2000, Perception of material from contact sounds. https://www.cs.ubc.ca/labs/lci/papers/docs2000/pai-KlaPai00.pdf
- Giordano and McAdams 2006, JASA 119:1171. https://www.mcgill.ca/mpcl/files/mpcl/blg_smc_2006_jasa.pdf
- Aramaki et al. 2011, IEEE TASLP 19:301.

Hearing and loudness
- ITU-R BS.1770; EBU R 128 and Tech 3343. https://tech.ebu.ch/docs/r/r128.pdf
- Sony ASWG-R001. https://gameaudiopodcast.com/ASWG-R001.pdf
- Torcoli et al. 2019, JAES, on speech over background.
- ISO 7731 (audibility of a signal in noise); ISO 226:2003; DIN 45692.
- Guttman and Julesz 1963, JASA 35:610; Kaernbach 2004, The memory of noise, Experimental Psychology 51:240.
- Notebookcheck speaker measurements, for where laptops and phones stop playing.
