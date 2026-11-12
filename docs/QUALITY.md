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
profile; 114 tests). The full run on the merged build: 88 passed, 16 skipped, 10 failed (the reruns below were started in its folder while its last tests were still going, which disturbed them). Eight of the ten were four tests:
in spring the new sheet's root took the clicks meant for the field tags (a real fault from joining two rebuilds:
fixed); the almanac page could not be scrolled from the keyboard (fixed); and two tests read a money line whose
wording the rebuild changed (the tests now read it as it is). After the fixes those four were rerun, not the whole
suite: in Chromium and WebKit, 8 runs passed; one of them failed once in Firefox under load and passed three times
out of three alone. The other two were WebKit play-throughs at the very end of the run: one timed out with its trace files gone (the folder had been rebuilt under it), and one finished but logged "WebGL: INVALID_VALUE: drawBuffers: more than max draw buffers", which is not explained: it did not recur when the same tests were rerun, and it may come from the disturbance or from the tree cards' atlas, which draws to several buffers at once. The play-throughs were rerun on the phone profile and WebKit with two late fixes in (a test-dig
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

## What a frame costs

Measured after `live-5`, when the drawing was made lighter (`tools/render/budget.ts`, on the Windows box with an
RTX 2080 Ti at 1920 by 1080, pixel ratio 1; ten fields in crop and people at work in the four tiers).

**How it is measured, and why the figures above were wrong.** The frame times in Results came from a GPU timer
wrapped round each frame while the browser kept the display's beat. That timer counts whatever else waits on the
beat, and a graphics card with little to do slows itself down, so a cheap frame read as 13 to 16 ms whatever the
setting: the far views never cost 15 ms. The tool now lets the browser draw as fast as it can and takes the time from
one frame to the next, which is the whole cost of a frame (the page's own work, the browser's and the GPU's). It
opens the live build beside the new one and measures them turn about, eight times each, keeping the quietest, so
other work on the machine falls on both alike. The renderer has its own timer for each pass and each part
(`src/render/probe.ts`), used for the second table.

**Before and after** (milliseconds from one frame to the next, drawing as fast as it can; `before` is `live-5`;
triangles and draw calls are the mean of a frame, every pass counted):

| view | before: high, medium, low | after: high, medium, low | triangles at high | draw calls at high |
| --- | --- | --- | --- | --- |
| opening, from far off | 7.0, 5.6, 2.4 | 5.4, 3.6, 2.0 | 3.54M to 1.36M | 703 to 289 |
| opening, by the road | 5.2, 5.1, 1.9 | 3.9, 2.6, 1.8 | 2.96M to 2.77M | 275 to 229 |
| yard tier | 5.0, 4.3, 2.0 | 4.3, 2.9, 1.8 | 3.54M to 3.34M | 325 to 272 |
| field tier (the playing view) | 7.6, 4.8, 2.2 | 6.2, 2.9, 1.8 | 2.90M to 1.56M | 460 to 261 |
| farm tier | 6.5, 5.4, 2.5 | 5.2, 3.4, 1.9 | 3.43M to 1.38M | 666 to 277 |
| county tier | 7.0, 5.4, 2.7 | 5.5, 3.5, 2.0 | 3.61M to 1.40M | 752 to 303 |

Every view is under 12 ms at the high setting (it was before, by this measure). The middle setting now costs 47 to
67% of the high one in every view (it cost 62 to 97%), the low one 30 to 46% (28 to 41%). In a quieter stretch the
new build's playing view measured 4.4, 2.8 and 1.8 ms and the county tier 5.4 to 5.8, 3.8 and 2.1. The machine was
shared with other checks throughout, and single figures moved by a millisecond or two from run to run; the counts of
triangles and draw calls do not move.

**Where a frame at the high setting goes** (the GPU's time for each pass at its middle value, the new build):

| view | all passes | the picture | of which the land | trees as cards | shadow maps | lens |
| --- | --- | --- | --- | --- | --- | --- |
| opening, from far off | 6.0 ms | 5.5 | 2.4 | 1.2 | 0.1 | 0.4 |
| opening, by the road | 3.8 | 3.2 | 0.7 | 0.6 | 0.1 | 0.4 |
| yard tier | 4.3 | 3.4 | 1.0 | 1.0 | 0.4 | 0.4 |
| field tier | 4.1 | 3.5 | 0.9 | 1.4 | 0.1 | 0.4 |
| farm tier | 5.8 | 5.2 | 2.0 | 1.3 | 0.1 | 0.4 |
| county tier | 6.1 | 5.5 | 2.3 | 1.3 | 0.1 | 0.4 |

The land's own surface is the dearest thing in every far view; the shadow maps, which were about 1 to 2.5 ms of a
far view's frame (two million triangles of trees redrawn every other frame), are now a tenth of a millisecond. (The
field and farm tiers were measured here with their fine map redrawn only now and then; with people at work it is
redrawn every other frame again, with cards, and costs a little more than this.)

**What was changed.**

- The picture's size. The high setting draws no more than a 1920 by 1080 screen's pixels however dense the display:
  a window of 1512 by 982 at two device pixels to one was drawn at 2387 by 1550 (3.70 million pixels) and is drawn at
  1786 by 1160 (2.07 million), stretched over the 3024 by 1964 canvas along curves that keep its edges. The middle
  setting draws 1.45 million pixels and the low one 0.9 million (they drew 2.3 and 1.1).
- Frames not drawn. A display faster than sixty a second is drawn on every second or third beat. A paused game with
  nothing moving and no hand on it comes to rest after five seconds (wind, water, smoke and weather ease to a stop)
  and is drawn twice a second until something is touched: 2 frames a second where there were 60, and 18 to 69 ms of
  GPU time a second where there were 438 to 787. The first frame after a touch is drawn on the next beat and the
  land is moving at full pace again in a third of a second. An opening nobody has touched for a minute and a half
  is drawn at half pace.
- Shadows. The fine shadow map is redrawn only when the sun or the ground it covers has moved, where nothing in it
  moves to be seen (from the county tier, or with nobody at work). From the farm tier out the trees' cards throw
  that shadow, as they throw the two wider ones, in place of two million triangles of simpler trees.
- Trees. The farm's tree cards are gathered into blocks drawn as one where every patch of a block is far enough to
  be cards (several hundred draws fewer in the far views).
- The land. Its surface is drawn after what stands on it, so what they cover is never shaded, and the sky after the
  land. Its fine grid lines (the yards', the brook's) no longer run across the whole land: a third of its triangles
  are gone, with no change to its shape where the shape matters. A loop in its shading that read textures for each
  parcel reads them once.
- Contact shade is not computed where nothing in the picture is near enough to show it.
- The setting a machine starts on is chosen from its first frames timed whole, not from the graphics chip's name,
  and remembered; after that the picture's size follows whether frames keep their beat (down after two slow
  stretches, up only after a wait that doubles each time going up did not hold), and the setting comes down a step
  if at its smallest they still do not. (Under a test driver none of this runs, so that a tool's pictures do not
  depend on what else the machine was doing: `tools/render/budget.ts --adapt` turns it on to watch it work.)

**A fault found on the way.** The far woods are cards alone and threw no shadow in the fine map, so a wood was lit
inside that map's reach and shaded outside it: from straight down at the county tier, a hard light band. The cards
now throw it wherever that map is wide enough to take them (the farm tier and out). In the playing view the woods
behind the fields are a little darker than they were, and evenly so.

**Not measured.** Nothing here ran on a MacBook or on any integrated graphics. On an Apple-silicon laptop at two
device pixels to one the high setting should shade a little over half the pixels it did (2.07 million against 3.70
million), draw two fifths of the triangles in the far views, and on a 120-a-second display draw half the frames;
which setting its first frames choose, and what a frame costs there, has to be read on the machine itself (the menu
says which setting is drawing and at how many frames a second).
