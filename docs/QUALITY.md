# The County: the quality bar

What "finished" means for every surface of the game, how it is judged, and
what the judges said. `docs/ART.md` says what the game should look like; this
file says how good it has to be and how we know.

## The bar

A player who opens any screen, at any size, in any state, should not be able to
find the part that got less care. The game is a painted miniature of a real
place with an almanac laid over it, and every surface is either the miniature,
the almanac, or nothing.

Each surface is scored 1 to 5 on eight questions. The floor is 4 on every
question for every surface. The four key moments need 5 on the first six.

| | Question | A 5 looks like |
| --- | --- | --- |
| 1 | **Reads at a glance.** Is the one thing this screen is for the first thing seen? | The eye lands on it without help; nothing competes. |
| 2 | **Composition.** Are the land and the paper placed on purpose at this size? | Nothing clipped, crowded, floating or dead; the farm is whole and as large as the room allows. |
| 3 | **Type and rhythm.** One scale, one grid? | Baselines and edges line up; figures are tabular; no orphan, no ragged wrap, no text that grows its container. |
| 4 | **Colour and light.** Does the palette hold, and does the scene's light tell the day? | Only `ART.md` colours; season and weather are readable from light alone; text meets AA. |
| 5 | **Craft.** Does every element look made, in every state? | Hover, focus, pressed, disabled, empty and error states all designed; no element that looks like a browser or library default. |
| 6 | **Motion.** Does every change move with a reason? | Nothing pops, strobes, or shifts under the pointer; reduced motion is honoured everywhere. |
| 7 | **Voice.** Is the copy plain, true and in one voice? | Reads like a farm almanac; every claim matches what the game does. |
| 8 | **Belongs.** Could this screen be told apart from the others by the hand that made it? | No: one type system, one spacing system, one way of drawing a rule, a button, a number. |

## Key moments

These get the most craft, because they are where the game's idea lands:

1. **The first minute**: title, choosing a year, the first spring plan, the first
   day of the season.
2. **The test dig**: one hill lifted, real tubers on the tray, the estimate
   moving.
3. **Dig day**: the crop coming out of the ground and the weigh-in.
4. **The fifth ledger**: keeping the farm, or losing it.

## The surface

Everything `tools/quality/capture.ts` captures is in scope, and nothing is out
of scope because it is rare:

- Title (first visit and with a save), new farm, how it works, menu and
  settings, every confirmation.
- Spring plan, first and later years.
- The season in every condition the field can show: first day, planting, rows
  emerging, bloom, a full work list, blight, drought, fog, rain, frost, dead
  vines, digging, done.
- The test dig and the weigh-in.
- The cellar early and late, the ledger, the fifth ledger, the lost ledger, the
  end screen.
- Metric units, reduced motion, the no-WebGL fallback.
- Eight window sizes, from a 320 px phone to a 1920 px desktop, including a
  phone held sideways.
- Motion between states (`tools/quality/motion.ts`) and the sound
  (`tools/audio`).

## How it is judged

Nobody who built a surface scores it.

1. **Capture.** `node tools/quality/capture.ts <url> <folder>` renders every
   state at every size on the real GPU. The set captured from the live site
   before the pass began is the "before".
2. **Critique.** Independent critics see only frames and this file. Each scores
   its slice of the surface on the eight questions and names exact changes.
3. **Fix.** One direction for the whole game, then the changes.
4. **Blind comparison.** Judges who have never seen the game get unlabelled
   pairs of frames of the same state, before and after, in random order, and
   choose the better. They also score the after frames on the eight questions
   without seeing any before.
5. **Measured gates.** No sideways overflow at any size; no serious
   accessibility violation; AA contrast; the count of distinct type sizes,
   colours and radii in use (`styles.json` from the capture); frame time on the
   GPU; all end-to-end tests in three engines.

Results, with every score and every surface that stayed below the floor, are at
the end of this file.

## What cannot be judged here

Nothing in this process can hear. The sound is checked for measurable faults
(clipping, clicks, silence, harsh spectra) and rendered to files for a person
to listen to. Whether it is pleasant is for a person with ears.

## Results

The build tagged `live-5` (the land at true scale, twelve times larger each way; the interface rebuilt as the farm's
own papers; the farmstead game; the clock as pause and three speeds), checked on the Windows box with an RTX 2080 Ti.

**Browser suite** (interface, accessibility, play-throughs, determinism; Chromium, Firefox, WebKit and a phone
profile; 114 tests). The full run on the merged build: 90 passed, 16 skipped, 8 failed. The eight were four tests:
in spring the new sheet's root took the clicks meant for the field tags (a real fault from joining two rebuilds:
fixed); the almanac page could not be scrolled from the keyboard (fixed); and two tests read a money line whose
wording the rebuild changed (the tests now read it as it is). After the fixes those four were rerun, not the whole
suite: in Chromium and WebKit, 8 runs passed; one of them failed once in Firefox under load and passed three times
out of three alone. The play-throughs were rerun on the phone profile and WebKit with two late fixes in (a test-dig
tray that grew past a phone's window; a tract's tag dropped when under a sheet): 5 passed, 1 skipped.

**Captures**: 75 frames of the key screens at eight sizes, no layout faults and no page errors; the live page's
title, first day and telegram, 16 frames, the same.

**Saves**: a save written by the build live before this one, and by the two before that, each opened in a browser
with the new build: Continue offered, the game played on, no errors.

**The live page**: comes up without page errors; a new farm hires a hand, fells a tract and plays ninety days.

**Frame time** on the live page at 1920 by 1080, with the GPU still shared at the start of the run (so these read
high): the playing view (field tier) 11.9 ms at the high setting, 12.7 at medium, 5.5 at low; the yard tier 8.6,
9.0 and 4.7; the opening's last pose 5.8, 5.8 and 3.7; the farm tier 14.8, 15.0 and 13.0; the county tier 15.7,
15.9 and 15.5; the opening from far off 16.1, 15.9 and 15.5. The target of 12 ms is met in the playing view, the
yard and the opening's end, and missed in the far views, where the lower settings save almost nothing. Medium saves
nothing anywhere.

**Not checked**: anything on integrated graphics or a MacBook; motion (the opening's move, the tiers, trees changing
level, the scale's needle), seen only as stills; the sound, which nobody has heard; the blind pairs of old against
new, the five-second test and first-time players, which have not been run on this build.

**Known faults**: a small dark bar hangs in the sky in some yard-tier views (one of the yard's own drawings; not
found); bare hardwood twigs are scribble close up in winter; tags crowd the lower left in spring and a few are cut
by the sheet's edge; a field off screen has no tag and is picked by its number; the balance gates for the farmstead
are partly unmet (`docs/balance/README.md`).
