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

**Known faults after `live-44`**: a field's card that stands just right of the work list is pushed a few pixels
aside when orders given from it lengthen the list under it (the list is a thing the card keeps off), so the order
keys shift under the hand; `e2e/interface.spec.ts:153` shows it in the full twelve-file run and not alone, because
where the card is first laid depends on how fast the frames come. Letting the list wrap at the card's edge held the
card still in a slowed browser and with eight copies at once, but with it the guide's clock test
(`e2e/tutorial.spec.ts:1403`) began to fail one run in three, so it was not kept. The guided first year
(`e2e/tutorial.spec.ts:122`) is sensitive to the same load: what the guide shows of the dig depends on who is still in
the field when it looks. The light on the buildings was checked in stills only: no measure was found that tells a
flicker from ordinary edges moving across the picture.

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
triangles and draw calls do not move. (The table is from the commit before `main` was last merged in. The same run
on the merged build fell in a busy stretch, with single cells at two and three times their value in both builds and
no order among the settings; its counts of triangles and draw calls were the same to the last digit shown.)

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

### Frames that come late (after `live-14`)

`tools/render/hitch.ts` keeps the series and not the mean: a July farm with the crop full and people at work is
zoomed from the field tier to the closest the camera goes, a wheel step at a time, then panned, turned and tipped
there for twenty seconds, with the clock at 1x and paused, and again with the page's thread slowed four times. Every
frame's interval, the page's work in it (part by part, from User Timing marks: `src/render/laps.ts`) and the GPU's
time are kept, and each late frame is laid to what the frame before it held, with the browser's own trace of the
same seconds (layout, style, garbage collection, tasks, the functions the page's thread was in).

**What made frames late**, largest first:

- Shaders made the first time something close was seen: 250 to 320 ms and 67 to 83 ms, the page's thread waiting on
  the compiler (`getProgramInfoLog`). Three programs: the crop's own shadow shader and one of the lens passes, once
  for each load; and the grass's, every time the camera came down again, because every square of grass was let go on
  the way up and its program with it (100 to 180 ms each time, some of it in the GPU's own process).
- Grass laid out as the camera came down: 43 to 50 squares a zoom, two a frame, 6 to 25 ms of the page's thread in
  each such frame (50 to 93 ms with the thread slowed four times).
- The pace on a display faster than sixty a second (simulated, `tests/pace.test.ts`: no such display is on the test
  box). A frame was drawn on every second beat by count, so one whose work ran past a single beat (8.3 ms at 120 a
  second) waited a whole beat more and came 25 ms after the last; and the count itself swung between one and two
  beats as the cost of a frame swung about one beat. At 120 a second: 8 ms a frame, 276 of 882 frames off their
  time; 8.5 ms, 481 of 898 with five changes of pace; a cost swinging between 6 and 11 ms, 348 of 1045 with nineteen
  changes; one frame in twelve at 14 ms, every one of those late.
- Thrown out, by measurement: the interface (0.2 to 0.6 ms a frame, no layout forced in a frame, 0.15 ms of style);
  the crop's window of whole plants (uniforms only, 0.05 ms); trees changing level (450 patches a zoom, 0.1 ms; their
  buffers go to the GPU once); the shadow maps (never two in a frame at the high and middle settings; a frame with
  the wide one costs 0.3 ms more of the page and 2 to 3 ms more of the GPU, the fine one 0.5 and 0.6).
- Not the land's, and left for their owners: the game's sound starts at the first key or click and holds the page's
  thread 130 to 190 ms then (at the opening, in a player's hands); its textures are built the first time each is
  wanted (`texture()` in `src/audio/synth.ts`, from `seasons.ts` and `work.ts`: 14 ms, 38 ms slowed four times); and
  with the thread slowed four times a day's turn that brings an alert is one task of 100 to 150 ms (the day's own
  step 26 to 49 ms, the interface's redrawing 37 to 60 ms and 7 to 18 ms of layout, the land's 15 to 19 ms).

**What was changed.** The shadow passes' shaders and the lens's are compiled with the scene's before the first
frame (which itself now draws in 0.2 s where it took 0.5 to 0.7), and the grass's with them: a patch of grass with
nothing in it is kept, so the program is never let go. Grass is laid out a few rows of a square at a time in the
time the browser has to spare between frames (2 ms of a frame where it tells of none), from half as high again as
grass is first drawn, and a square once laid is kept (the furthest are let go past 160). A frame is due by the time
gone since the last and not by a count of beats, and the pace and the picture's size are not put up while the camera
moves. At the low setting the fine and the middle shadow maps could fall in one frame; no two now do at any setting.

**Before and after** (mizepc2, RTX 2080 Ti, the page's thread at full speed; `before` is `live-14`, the two builds
turn about in one run; the 99th of a hundred frame intervals, the longest, and the frames over one and a half times
the middle interval; the middle is 16.7 ms in every row):

| 1512 by 982 at 2 | before: 99th, longest, late | after: 99th, longest, late |
| --- | --- | --- |
| zooming in, clock at 1x | 16.8, 317 ms, 3 of 382 | 16.8, 16.8 ms, 0 of 382 |
| zooming in, paused | 33.4, 183 ms, 10 of 384 | 16.8, 16.8 ms, 0 of 382 |
| moving at the closest, 1x | 16.8, 200 ms, 1 of 1268 | 16.8, 200 ms, 1 of 1264 |
| moving at the closest, paused | 16.8, 16.8 ms, 0 of 1263 | 16.8, 16.8 ms, 0 of 1265 |

| 1920 by 1080 at 1 | before | after |
| --- | --- | --- |
| zooming in, clock at 1x | 33.2, 250 ms, 2 of 198 | 16.8, 16.8 ms, 0 of 203 |
| zooming in, paused | 16.8, 16.8 ms, 0 of 202 | 16.8, 16.8 ms, 0 of 201 |
| moving at the closest, 1x | 16.8, 167 ms, 1 of 1261 | 16.8, 133 ms, 1 of 1262 |
| moving at the closest, paused | 16.8, 16.8 ms, 0 of 1259 | 16.8, 50 ms, 1 of 1261 |

The one late frame of each "moving, 1x" row is the sound starting at the tool's first key (the tool now starts it
before it times anything). The 50 ms frame had 11.7 ms of the page's work in it and 6.6 of the GPU's: the box was
shared with other checks all day. With the page's thread slowed four times the longest task while zooming in fell
from 274 and 199 ms to 39 and 42 ms (1512 by 982); a frame's own work there is 15 to 20 ms, so a third of the frames
miss a beat in either build, and a day's turn with an alert is still a task of 100 ms and more.

**The pace, simulated at 120 a second** (twenty seconds; frames whose interval is not a sixtieth of a second):

| a frame's work | before | after |
| --- | --- | --- |
| 3, 6 ms | 0 | 0 |
| 7.5 ms | 93 of 973 | 0 |
| 8 ms | 276 of 882 | 0 |
| 8.5 ms | 481 of 898, 5 changes of pace | 0 |
| 9 ms | 187 of 1113 | 0 |
| 10, 12, 15 ms | 0 | 0 |
| swinging 6 to 11 ms | 348 of 1045, 19 changes | 0 |
| one in twelve at 14 ms | 81 of 978 | 0 |

### The close view: a low frame rate near the ground (after `live-14`)

The owner's fault, in their words: a low frame rate once the camera is close to the ground and the land is drawn in
its close detail, on a MacBook at two device pixels to one. `tools/render/budget.ts --close` measures the close views
against the playing view at the high setting: the field and yard tiers as the game frames them, then over a field
in full crop from the yard tier's distance and from the closest the camera goes (7.5 m), each level across the crop
and tipped straight down. With `--lift --size=3840x2160` the picture is four times a 1920 by 1080 one (8.3 million
pixels against the 2.07 million the high setting draws on any screen), to stand in for a graphics chip a quarter as
quick: the 2080 Ti hides the fault at the laptop's own size.

**What each view costs** (ms from one frame to the next, drawing as fast as it can, and against the playing view;
one run for each size; triangles and draw calls of a frame, every pass counted):

| view | 2.07 M pixels | 8.3 M pixels | triangles | calls |
| --- | --- | --- | --- | --- |
| field tier (the playing view) | 4.4 | 16.5 | 1.56M | 262 |
| yard tier | 5.6 (1.27x) | 16.0 (0.97x) | 3.15M | 259 |
| over the crop from 160 m, level | 5.5 (1.25x) | 25.6 (1.55x) | 2.26M | 238 |
| over the crop from 160 m, tipped down | 2.6 (0.59x) | 12.5 (0.75x) | 2.03M | 121 |
| closest, level across the crop | 7.0 (1.59x) | 18.8 (1.14x) | 2.95M | 158 |
| closest, tipped down | 2.6 (0.60x) | 9.1 (0.55x) | 2.50M | 70 |

The box was shared with other checks all day and whole-frame figures moved by half from run to run (the playing
view at 8.3 M pixels read 10.7, 16.5, 16.8 and 23.9 ms in four runs; at 1512 by 982 and two to one, which is the same
2.07 M pixel picture, it read 8.1 and 15.6). The renderer's own timer for each part moved less, and says where the
close view's cost is. Level across the crop from the closest, at 8.3 M pixels, in four runs: the picture 18.7 to
24 ms, of which **the crop's whole plants 10.1 to 13.7 ms** (0.85M triangles in five draws), trees 5 to 7 (whole
trees 2.4, cards 1.5 to 2.6, far woods 1.2), the land 0.04; shadow maps 0.1; the lens 2.5 (its soft focus is on only
this close). The playing view at the same size: the picture 8.8 to 12.3 ms (land 2.3, far woods 2.3, cards 1.5 to
2.5, sky 0.8, the fields painted 0.8), shadow maps 0.4 to 0.9, the lens 1.7. So the close view is the playing view
with the crop's whole plants laid over it: 2.6 ms of GPU time at the laptop's picture size on this card, where the
painted crop of the playing view is 0.3. The view level over the crop from 160 m is dear for another reason: woods
fill a third of it (far woods 4.3 ms, the crop painted across the foreground 4.4, cards 2.2, whole trees thrown into
the fine shadow map 2.0 to 2.6).

**Pixels against geometry.** The playing view costs 3.7 times as much for four times the pixels: all of it is
shading. The crop's plants, by the part timer, go from 2.6 to 10 to 13 ms: shading too. A whole plant is leaves on
cut-out cards, each lit in full (sun and its shadow, sky, haze, light through the leaf), and level across a crop a
pixel has many behind one another. Taking one thing at a time from that frame (8.3 M pixels, the crop's ms): as it
is 13.1; no shadows 11.1; no lens passes 11.8; no multisampling 11.8; two samples to a pixel 8.6 (with the trees
falling from 7.0 to 4.1 in the same reading). No one of them is the cost: it is the number of leaf fragments lit.

**Tried, measured and taken out.** The plants drawn nearest first for the way the camera looks (so a leaf in front
would hide the ones behind before they were lit): 12.0 ms against 13.7, inside the spread between runs. The leaves
drawn into the picture's depth first, then lit: 10.9 ms against 10.1, with half a million more triangles. Neither
pays because a cut-out leaf has to be shaded before the graphics card knows where it is: it cannot be hidden early.
The way that would work is to light, in a second pass, only what the first pass left in front (the depth test set to
"equal", no cut-out in the lit pass); that needs the two passes to place every leaf to the last bit alike, which
could be tried here but not on the laptop's own graphics system, where a mismatch would be holes in every plant. It
is left for a round with that machine to hand, with a cheaper light for leaves (most of it worked out at the leaf's
corners and not at every pixel) and the window's slots culled to the picture in blocks.

**What was changed in the close view's drawing.**

- Whole plants threw no shadow of their own and were drawn into the fine shadow map all the same: the sun's pass
  measured each plant's distance from the sun's side, far past where plants are drawn, and gave every one no size,
  0.26M triangles each time the map was drawn again for nothing on the map. That pass is not run. The picture is
  as it was. A frame's triangles, closest and level across the crop: 2.95M to 2.65M; tipped down, 2.50M to 2.23M;
  closest in the yard, 2.3M to 1.9M. In a quieter stretch at the laptop's size the new build's playing view read
  3.9 ms and the closest level view 5.8 (1.47 times).
- A slot of the plant window with nothing to draw (outside its field, past the window's edge, or more than a step
  behind the camera: the window lies round the camera's nearest ground and a quarter to a third of it is behind the
  eye) is done with before its hill is read, where every vertex of it read three textures. No change to the picture;
  on this card too small to time.

**The game protects its own frame rate.** Frame time is followed whenever frames are drawn at full pace, camera
still or moving (under a test driver it is off; `budget.ts --hold` turns it on). A second and a half of frames is a
stretch, and slow is the 73rd frame of a hundred taking more than 1.23 times its time.

- Two slow stretches running: the picture is drawn smaller at once, by as many sizes as the frames are late (the
  pixels in proportion: a picture twice too dear is at its smallest in one step, where it was walked down in four,
  twelve seconds). The sizes are 1, 0.92, 0.84, 0.77 and 0.7 of the side; **the floor is 0.7, half the pixels**.
- At the floor and slow for six seconds more, or frames taking over 2.3 times their time for two stretches: the
  setting comes down a step (high, medium, low) and begins at its floor. Only where the setting was left to choose for itself: one the
  player chose is kept, and its picture still shrinks.
- In time for a while: a size larger, after a wait that doubles each time going up did not hold; and once back at
  its full size and in time for a minute, a setting that came down by itself goes up a step again, beginning at its
  floor, with a wait that doubles (to an hour) each time that did not hold. Going up waits until the camera has
  stopped; coming down does not.
- The menu can say so: `quality()` now gives the picture's size as a share of the setting's, the floor, and whether
  the setting came down by itself (the line in `src/ui/menu.ts` is for the interface's owner to write).

**It engages** (2080 Ti, 3840 by 2160 with the pixel limit lifted, clock running, 60 beats a second; three runs
of `budget.ts --hold`, forty seconds in each view, on a box that was quiet in one and shared in the others; where it
settled, and every row then held 16.7 ms at the middle frame and 16.7 to 16.8 at the 95th of a hundred):

| view | quiet run | shared run | busiest run |
| --- | --- | --- | --- |
| the playing view | high at its full size (it kept its beat untouched) | high at 0.77 of the side, 2956 by 1663 (from 30 frames a second to 60 in 8 s) | medium at 0.7, 2688 by 1512 (33 to 83 ms a frame at the start) |
| level across the crop from 7.5 m | high at 0.77 (to the floor in one step within 8 s, then up a size) | high at 0.84, 3225 by 1814 | medium at 0.84 |
| level across the crop from 160 m | high at 0.84 | high between 0.92 and 0.7 (up a size after 28 s, beats missed, down again in one step) | medium at 0.7 |

So at four times the laptop's pixels the close views hold sixty a second at the high setting with the picture at
0.77 to 0.84 of its side, and the playing view at 0.77 to 1. In the quiet run something else took the machine for a
quarter of a minute after the last view (33 to 50 ms a frame at any size) and the setting fell from high to low in
twelve seconds; a setting now has to be slow at its floor for six seconds, not three, before it comes down, and
goes up again as above. A fourth run, with that in: high throughout; the playing view at 0.77, the close view at
0.84, the view from 160 m at 0.92, and back in the playing view at its full size within twelve seconds and for the
minute it was watched, 16.7 ms at the middle and at the 95th. At 1512 by 982 and two to one, the laptop's own size, the 2080 Ti is never slow and the
setting stays high at its full picture (1786 by 1160) in every view.

**Not measured, and what to expect on an Apple-silicon MacBook.** Nothing here ran on one. Its picture at the high
setting is the 2.07 M pixel one, so the 8.3 M pixel runs stand for a chip a quarter as quick as the 2080 Ti at
shading: there the playing view is at the edge of sixty a second and the close level views are not, by a fifth to a
half. A chip about a third to a half as quick would hold the playing view and miss beats close in, which is what
was reported. With this build the picture should shrink within three or four seconds of coming close (to 0.84 or
0.77 of its side by these runs, softer but whole) and hold sixty; if the setting was left on automatic and that is
not enough it comes down to medium, whose window of whole plants is three fifths the size, with two samples to a
pixel and no contact shade. On a 120-a-second display a frame that runs past one beat is no longer late by a beat
and a half. What has to be read on the machine itself: the frame rate and size the menu's line would show close in;
whether its graphics chip is short of shading (then the size is the cure) or of vertex work (2.95M triangles close
in against 1.56M, which a smaller picture does not help and only the setting or the cuts left for later do); and
whether the first seconds close in, before the picture has shrunk, are still felt.

### The crop's whole plants, counted, and lit at their corners

The section above laid the close view's cost to the crop's whole plants, "many behind one another", from the
renderer's part timer. Counted, that is not so. `cropWork()` (a tool's hook; `budget.ts --crop` prints it) draws
the leaves alone, each fragment adding to its pixel, and reads the sum back: a count, the same on any machine
however busy. Level across a full crop in flower from the closest distance, **1.40 leaf fragments are drawn to each
pixel of the picture** (1.05 of them in front of what was drawn before), about two and a half deep where the crop
is and not a dozen. And with every plant drawn at no size (its triangles still sent) that frame took 4.98 ms where
it took 5.34 with them: on the 2080 Ti the leaves' fragments are a third of a millisecond at the laptop's picture
size. What the part timer called the crop was mostly the sending and placing of 0.6M triangles of plant.

**What a level view costs, in a quiet stretch** (1512 by 982 at two to one, a 2.07 M pixel picture, high setting,
frame time not followed; ms from one frame to the next drawing as fast as it can, the old way and the new turn
about in the one page, the quietest of four turns and the middle one):

| view | as it was | as it is | triangles | leaf fragments to a pixel |
| --- | --- | --- | --- | --- |
| the playing view | 3.3 (4.3) | 3.3 (3.3) | 1.34M | none |
| level over the crop from 160 m | 5.3 (5.4) | 5.3 (5.3) | 2.25M | none: the crop is painted there |
| closest, level across the crop | 6.7 (6.7) | 5.8 (6.2) | 2.65M | 1.40 before, 1.23 after |

One at a time, in the closest view: leaves lit at every pixel again, 6.4 ms (the corners save 0.6); every plant
drawn however far, 6.05; every leaf, 6.2; the window as deep in a level view as in any, 6.3.

**So the done line is not met**: level views cost 1.6 and 1.8 times the playing view at this size, and it is not
the crop that makes them dear. The view from 160 m has no whole plant in it and costs 1.6 times the playing view:
a level camera has the woods across a third of the picture (cards and far woods), 0.9M more triangles (whole trees
and what they throw into the fine shadow map), and the sky. That is the next thing to cut, and it was not this
round's brief. At 8.3 M pixels the one way could not be read against the other: the box was too busy all afternoon
(the playing view between 11 and 24 ms from turn to turn). What can be said there is from `budget.ts --hold` in a
quiet stretch at the end, with this build, frame time followed, forty seconds in each view at 60 beats a second:
the playing view, the view level across the crop from the closest and the one from 160 m each kept its beat at the
high setting with the picture at its full 3840 by 2160 (16.7 ms at the middle frame, 16.7 to 16.8 at the 95th of a
hundred), and the picture's size was never touched. In the runs before this round the close views had needed 0.77
to 0.84 of the side, in one of them while the playing view held its full size.

**What was changed in the plants.**

- A leaf is lit at its corners (`corners` in the shared material patch): the sun, the cloud's shadow, the sky's
  light, the light through the leaf and the haze are worked out in the vertex shader for each face of the card and
  carried across it; a pixel reads the cut-out, the colour and the sun's shadow. A leaf has no shine of its own
  now: the faint sheen on the nearest leaves under a clear sky is gone, and nothing else in the pair differs.
- Past 18 m from the eye one plant in two along the row is drawn and past 30 m one in four, each as wide as those
  it stands for and carrying their flowers; past 24 m a plant has every other leaf, each a little larger; and in a
  level view the painted rows take over at 27 m from the eye and not 38 (looked down on, the window is as it was).
  The first settings tried (10 and 20 m, 14 m) thinned the middle of the field to the eye, the flowers most of
  all; with these the far band of whole plants is a little coarser and there is less of it.
- A plant not drawn is not lit either.

**Not known.** What a leaf fragment and a plant vertex cost on the MacBook's graphics chip. A chip of that kind
is slowed more by what each pixel works out than this card is, so lighting at the corners should count for more
there than the 9% here; it cannot be read from this box.

### What a level view is made of

`budget.ts --close --level` takes each view whole and then with one part at a time not drawn, and counts the
fragments of the trees' cards, the far woods, the whole trees, the grass and the crop to a pixel of the picture
(`work()`, the counting hook made general: a cut-out counts for as much of a pixel as it covers; nothing is counted
that the picture's own camera does not draw). Triangles, draw calls and fragments do not depend on how busy the box
is; the times of this round's runs did (a part's cost read between -6 and +4 ms), and none is given.

**Triangles of a frame, by part** (millions, every pass counted; 1512 by 982 at two to one, high setting; before
this round's change):

| part | playing view | yard tier | level from 160 m | closest, level over a crop | closest, level in the yard |
| --- | --- | --- | --- | --- | --- |
| the whole frame | 1.35 (236 calls) | 3.36 (271) | 2.25 (226) | 2.65 (158) | 2.29 (193) |
| whole and simpler trees | 0 | 1.65 | 0.65 | 0.42 | 0.20 |
| tree cards | 0.13 | 0.07 | 0.06 | 0.05 | 0.06 |
| far woods | 0.09 | 0.05 | 0.04 | 0.05 | 0.05 |
| terrain and land | 0.72 | 0.69 | 0.74 | 0.73 | 0.73 |
| clearing | 0.36 | 0.45 | 0.43 | 0.42 | 0.43 |
| fields and crop | 0 | 0.05 | 0.19 | 0.87 | 0.06 |
| grass | 0 | 0.20 | 0.04 | 0.04 | 0.61 |
| buildings and yard | 0.08 | 0.12 | 0.08 | 0.05 | 0.09 |
| far country, people, sky | 0.14 | 0.10 | 0.10 | 0.10 | 0.11 |
| (of all these, drawn into the fine shadow map) | 0.11 | 0.82 | 0.88 | 0.33 | 0.29 |

**The 0.9M triangles a level view from 160 m has over the playing view**: 0.65M are simpler trees drawn into the
fine shadow map and nowhere else (a patch of wood drawn as cards kept its simpler trees standing in that map, and
from 160 m the map is still narrow enough to want them); 0.19M are the field's rows drawn as shapes in the ground;
the rest is a little more of the clearing and the terrain. The yard tier's are its whole trees (1.65M with what they
throw into the fine map) and its grass; the closest view's are the crop's plants (0.6M of the fields' 0.87M), whole
trees at the field's edge and their shadows.

**Fragments to a pixel of the picture** (drawn, and of those the ones in front of what was drawn before):

| | playing view | yard tier | level from 160 m | closest, over a crop | closest, in the yard |
| --- | --- | --- | --- | --- | --- |
| whole and simpler trees | 0 | 0.20 (0.11) | 0.04 (0.02) | 9.96 (1.87) | 1.05 (0.44) |
| tree cards | 0.61 (0.26) | 0.73 (0.20) | 1.73 (0.54) | 0.26 (0.08) | 0.68 (0.10) |
| far woods (cards alone) | 1.25 (0.29) | 1.75 (0.19) | 2.20 (0.28) | 2.83 (0.20) | 2.04 (0.13) |
| the crop's leaves | 0 | 0 | 0 | 1.23 (0.93) | 0 |
| grass | 0 | 0.01 | 0.01 | 0.01 | 0.41 (0.29) |

**This is what a level view costs a chip that is slowed by shading.** The woods are a strip across the horizon, a
fifth of the picture or less, and in that strip trees stand behind trees. Level across a crop from the closest, the
whole and simpler trees at the field's edge (a hundred to two hundred metres off, the front seventy metres of the
wood) are **ten fragments to every pixel of the whole picture**, four in five of them behind a leaf already drawn;
the far woods behind them are 2.8, of which 0.2 are in front. With the crop's leaves that view draws 14.3 fragments
of leaf and card to a pixel where the playing view draws 1.9. From 160 m it is the cards (1.7) and the far woods
(2.2); in the yard the far woods (2.0), the trees (1.1) and the grass (0.4). A leaf of a whole tree is lit at every
pixel and a card is the dearest fragment in the game (three readings of its atlas and the whole of the light), and
a cut-out cannot be hidden before it is shaded. The crop's leaves, which the last two rounds went after, are 1.2.

**What was changed.** A far patch's cards now throw its shadow into the fine map from the yard tier's distance out
(the map 55 m in radius or more), where they did so only from the farm tier's (160 m): the simpler trees that stood
in that map for a patch two hundred metres off and more are not drawn. A frame's triangles: level from 160 m, 2.25M to 1.67M (the playing view has 1.34M, so 1.25 times
it); the yard tier, 3.36M to 2.83M; the closest views as they were (2.65M and 2.29M). The one way against the other
in the one page, in a quiet stretch (ms from one frame to the next, the quietest of three and the middle): the
playing view 4.30 either way; level from 160 m 5.53 (5.75) with it and 5.44 (5.55) without; the closest 6.21 and
6.25. So on this card the 0.6M triangles are worth nothing to time, and the level views stand at 1.3 and 1.45 times
the playing view (2.85, 3.89, 5.17 and 5.73 ms for the playing view, the yard tier, 160 m and the closest in
another quiet stretch of the same run: 1.4, 1.8 and 2.0 times). The picture pairs are the same to the eye: what
changes is the shadow a wood two hundred metres off throws on its own floor.

**Not done, and why.** The done line (each level view within 1.15 times the playing view, triangles within a fifth
more) is not met and this round's change does not meet it. What would: (0) for a low camera, whole and simpler
trees only in the front of a wood (a patch with trees between it and the camera drawn as cards, and within a patch
the rows behind the first two left out or drawn as cards): that is the ten fragments. (1) Not shading the cards
behind the front of a wood for a low camera. Thinning the far woods by distance when the camera is level would halve them, but the trees
that make the skyline are the far ones on the ridge and they would thin first; it wants the cards ordered so that
the crest is kept, or a first pass that writes the cards' depth and a second that lights only what is left in front
(the depth test set to equal: cards are flat and placed alike in both passes, and a check at start-up could put the
one pass back on a machine where the two do not agree to the last bit). (2) The yard tier's 1.65M triangles of whole
trees cannot come within a fifth of the playing view's frame without taking whole trees out of the yard's own view.
(3) The closest view's plant window sends 0.6M triangles of which half are behind the camera or past the reach:
its slots want ordering from the middle out so that a level camera draws the inner part of them.

### Level views: what was cut

Four changes, each of which a tool can switch off (`tryWithout`), so the old way and the new are timed turn about
in one page (`budget.ts --close --crop=twopass,cardshadow,treereach,corners,thin,half,reach --pair`).

- **Cut-outs in two passes** (`pass` in the shared material patch; the trees' cards, the far woods and, from low
  down, a hardwood's leaves). The first pass draws them into the picture's depth with the cut-out and no light; the
  second lights them with the depth test set to equal and no depth written, so only what the first left in front
  is shaded. Both passes run the same vertex shader text for text. (The second keeps its cut-out. Without it, where
  two cards crossed at one depth the one that was clear there drew its nothing as a speck too bright to look at:
  seen in the first pictures of this round and gone in the last.) At start-up a patch of each kind is drawn into a
  small picture in one pass and in two and the pixels counted (`checkTwoPass`): where they do not agree to within
  half a hundredth the cards and leaves go back to one pass. `tools/render/twopass.ts` tests the check in a
  browser: on the test box conifer cards leave 14321 pixels either way, hardwood cards 12803, leaves 26090 and
  26162; with the first pass pushed off by two parts in ten thousand of the depth they leave 0, 2 and 6 and the
  check says no; with the push taken away it says yes again. No skyline is thinned: every card is still drawn.
  A first pass must draw exactly the trees its mesh draws. As first shipped, felling a tract took its trees out of
  the mesh and left them in the first pass, which wrote their depth with nothing to light it: a felled tract stood
  as a black shape of its trees (a player's second spring, after a winter in the woods). Both counts are now set
  in one place (`draw` in `flora.ts`); `tests/flora.test.ts` holds every pair to it through felling and each
  setting, and `tools/render/felled.ts` looks at felled tracts in a browser for any patch of near black.
- **Trees whole beside the camera, not a hundred metres off.** Whole within 60 m and simpler to 150 m of a camera
  that is down among them (it was 100 and 200), less as it climbs, none whole under a camera 70 m up; and whole
  beside what a higher camera looks at where that is a yard, so the yard tier keeps the yard's own trees.
- **The plant window's slots go from the middle out**, and a level camera is sent the inner square of them (22 m to
  a side from the middle, where whole plants end at 27 m from the eye).
- (From the round before: far patches' cards in the fine shadow map from the yard tier's distance.)

**Before and after** (1512 by 982 at two to one, 2.07 M pixels, high setting, frame time not followed, the box
quiet; ms from one frame to the next drawing as fast as it can, the quietest of six turns and the middle one;
triangles of a frame, every pass):

| view | time before | time after | against the playing view after | triangles before | after |
| --- | --- | --- | --- | --- | --- |
| the playing view | 4.18 (4.25) | 3.38 (3.46) | | 1.34M | 1.43M |
| yard tier | 4.23 (4.24) | 3.07 (3.57) | 0.91 (1.03) | 3.35M | 2.58M |
| level over a crop from 160 m | 4.84 (4.87) | 3.70 (4.02) | 1.10 (1.16) | 2.25M | 1.71M |
| closest, level over a crop | 5.37 (5.69) | 4.53 (4.64) | 1.34 (1.34) | 2.66M | 2.21M |
| closest, level in the yard | 3.14 (3.26) | 3.41 (3.63) | 1.01 (1.05) | 2.29M | 2.29M |
| level down the lane at dusk | 3.42 (3.80) | 3.07 (3.35) | 0.91 (0.97) | 2.40M | 2.54M |

(The playing view reads about 3.4 or about 4.0 ms from one run to the next, old way or new: in the run before this
one it read 3.69 (3.95) and the same views stood at 0.98, 1.09, 1.27 and 0.79 times it.)

**Fragments to a pixel of the picture** (trees, their cards and the far woods together):

| view | lit, before | lit, after | drawn into depth alone, after |
| --- | --- | --- | --- |
| the playing view | 1.86 | 0.33 | 1.86 |
| yard tier | 2.72 | 0.31 | 2.52 |
| level over a crop from 160 m | 3.97 | 0.31 | 3.95 |
| closest, level over a crop | 14.3 with the crop's leaves, 13.1 without | 1.34 | 5.13 |
| closest, level in the yard | 3.81 | 0.44 | 3.44 |

(The crop's leaves are 1.23 beside these, lit at their corners. A fragment of the first pass reads the card's atlas
and writes a depth: no sun, shadow, sky or haze.)

**Against the lines set.** Lit fragments: under 4 from the closest (1.3) and under 3 from 160 m (0.3). Time: the
yard tier, the closest view in the yard and the lane are within the line and the view from 160 m at it (1.02 to
1.16 times over two runs); **the closest level view over a crop is 1.22 to 1.34 times the playing view, where 1.15
was asked** (it was 1.45 to 1.65; in milliseconds 5.4 to 5.8 before and 4.5 to 4.8 after). Triangles:
the view from 160 m is within a fifth of the playing view's (1.71M to 1.43M); **the closest over a crop is 1.55
times (2.21M), the closest in the yard 1.6 times (2.29M), the yard tier 1.8 times (2.58M) where 1.5 was allowed**.
What is left in them is the land and terrain (0.73M in every view), the clearing (0.43M), the crop's plants and
rows (0.5M close over a crop), the grass (0.6M close in the yard) and the yard's own whole trees with their shadows:
to go lower is to take whole plants, grass or the yard's trees out of the picture they are the subject of, and
that was not done. The playing view itself has 0.09M more than it had (the cards' first pass) and its time is the
same to within the spread.

**Not done**: within a patch, the rows of trees behind the first two are still drawn (into depth only, from low
down); a patch behind another is cards by distance, not by what stands before it.

### Work that is seen (after `live-27`)

Round seven's players never saw a machine at work: "only status words, never a tractor or harvester working", and
Follow led to someone on foot. What was drawn was measured before anything was changed. `tools/render/seen.ts`
plays the farm a first player has (the farmer, one hired hand, one tractor, the routine doing the ordering) to the
evening before each kind of work is first done, runs the days at each clock from the view the season opens with,
and at 1x with Follow, and reads every frame where the game has the work and where the machines and people are
drawn.

**What was drawn at `05b7f52`.** At 1x no machine was on a field of its work at any time it went on when
planting, hilling, digging with the harvester or hauling, and with the digger for 17 of each hundred; when spraying
or killing vines one was there for 93 and stood still (0 m/s): it had been left there. At 3x and 8x one was there
for none to 97 of each hundred, standing, or crossing the field at whatever pace the place it was drawn at was
chasing the script. With Follow the camera held someone crossing the farm on foot. Nothing made a step it could
not have made; the work was simply never where the picture was. (The contractor's bulldozer was not drawn.)

**The cause.** Since `1f9d045` each person and machine is drawn at a place that chases where the day's script has
them at no more than a walker's or a driver's pace (9 and 28 m/s: `follow` in `src/render/units.ts`), so that
nobody jumps. The script, written before that, crossed the farm as fast as the days go: a way was cut to its
start and its last stretch, and a day is four seconds at 1x and half a second at 8x. The seen places could not
keep up. A driver whose seen place was the length of the farm from the machine was drawn walking to it while the
machine waited (the same file, where the machines are placed), and by the time they were there the script was
three days on. And with one tractor, the farm's day gives it to two people in the same hours (`rigFor` in
`src/sim/season.ts` counts the tractors held at that moment, and a quarter-day's spraying is done and the tractor
let go inside one turn); the one without it was drawn walking the rows on foot.

**What changed** (`units.ts`, `work.ts`, `stage.ts`, `tractor.ts`, `state.ts`, `index.ts`):

- The script's ways keep within what is seen: no faster on foot or driving than the seen places go (half as fast
  again at 3x, two and a half times at 8x), for no longer than 2.4, 1.5 and 1.1 seconds at the three clocks. A way
  too long for that is cut, and now the cut is seen as one: those on it go from sight as they pull away, and are
  next seen, small and growing, where it brings them in, with the seen place set there. A long walk to a machine is
  cut the same way to its setting off.
- Each part of a day's work is seen for at least 4.4, 3.2 and 2.6 seconds at the three clocks, the machine going
  along the leading row at a pace that reads from where the camera is. The picture then falls behind the days: the
  newest work waits its turn, what was not seen is passed over, and the ground keeps the days' time (at 1x it waits
  for the machine that is being seen at it, and no other).
- One tractor two people each had a turn on is seen with whoever holds it, over all of that ground; the other
  stands by at the end of the rows of their own part. The state says both are spraying: that is the state's doing,
  and is reported to whoever has the simulation.
- Whoever would take the first order that can be worked today (on the list, or one the routine will put there)
  sets out as the clock is set going or the order is given: a few steps toward the machine, then in its seat with
  the implement on and rolling down the lane, 30 m in the four seconds before the first day is counted at 1x.
- With the clock stopped by the player the way and the row in hand wait where they are. A day a question stopped
  is planned as the running day it was. Only what the interface is waiting to see keeps the day's time: a test dig,
  and the digging of a field whose crop has just been weighed.
- Found from across the farm: dust, the spray's mist, the flail's chaff, the smoke of a working engine, lamps and,
  in sun, a glint are drawn larger and denser the further off they are seen from (as drawn before from within a
  field's length); the slash is burnt behind the felling; the contractor's bulldozer, which was not drawn at all,
  works the line the torn ground has reached, its dust pale against the woods.
- Follow on someone off the land frames the house from 58 m. Among a tract's trees it looks from higher and
  steeper.

**After** (the same check; 1280 by 800, the box quiet; shares are of the time the game has the work going, and of
what a machine is seen at it for in the five seconds after):

| work | 1x: on its field, working | 3x | 8x | Follow at 1x: in the picture | far mark, pixels |
| --- | --- | --- | --- | --- | --- |
| planting | 86%, 63% | 86%, 60% | 83%, 60% | 92% | 747 |
| hilling | 79%, 68% | 82%, 57% | 77%, 64% | 100% | 525 |
| spraying | 81%, 64% | 82%, 59% | 94%, 68% | 100% | 1120 |
| killing the vines | 85%, 57% | 83%, 57% | 82%, 66% | 100% | 789 |
| digging, the digger | 80%, 67% | 66%, 49% | 63%, 46% | 100% | 526 |
| digging, the harvester | 80%, 68% | 80%, 71% | 68%, 47% | 94% | 460 |
| hauling, with the truck | to be seen 53%, at the field 40% | 54%, 49% | 36%, 26% | 95% | **60 to 160** |
| felling | whoever fells at the tract 100% | 83% | 83% | 96% | 615 |
| stumping (a contractor) | | | | | 374 |

"On its field" is the machine's footprint inside the field's outline on the screen; "working", at 1x, at this work
by its own account, and at the faster clocks at any (behind the days it may be the work before); for digging, the
tractor bringing in what it dug counts. The machine goes 8 m/s along the rows from the opening view (12 to 23
pixels a second) and 2.3 to 3 m/s under Follow. No step that nobody could make at any clock; a way is cut 5 to 23
times in a run. The far mark is the pixels of the field's picture, from the opening view on a fair dry afternoon, that
differ by more than a tenth with the people, machines and what they leave in the air taken out (floor 300; the
machine itself is 5 to 9 pixels long). **Hauling's far mark is under the floor**: 151, 127 and 160 with the load
standing at the field and 107 and 60 as it pulls in, over five runs; readings of 552 to 2890 in earlier runs were
the digger's dust in the same field. The check has 42 lines and 41 hold; at `05b7f52` 27 of them fail: every
kind of row work at every clock from the opening view, hauling at 1x, five of the seven Follows with a machine,
and the far mark of planting, felling and stumping (felling, on foot, was seen where it was).
`tests/seen.test.ts` runs the people and machines without a picture and holds the same at each clock, and that a
stopped clock set going again leaves a machine at its work: 22 pass, and all 22 fail on `05b7f52`'s code.

**The frame budget, as it was.** This build and the live one, turn about in one page (`budget.ts --against`, 1512
by 982 at ratio 2, high, drawing as fast as it can; other agents' browsers were on the GPU for part of it, which
falls on both alike): the playing view 3.46 ms from frame to frame against 3.49, level over the crop from 160 m
3.98 against 4.02, the closest level view over a crop 4.65 against 4.63, the closest tipped down 2.32 against
2.30, the closest in the yard 3.40 against 3.55; the same triangles and draw calls in each; what hangs in the air
0.12 to 0.14 ms in both. The lit fragments to a pixel of trees, their cards and the far woods (`--close --level`)
are what they were: 0.33 in the playing view, 0.31 from the yard tier, 0.31 level from 160 m, 1.34 from the closest
over a crop, 0.44 from the closest in the yard; the crop's leaves 1.22 (0.86 in front). The opening shot's machine
is drawn as it was (no far signs there: its camera comes down to what it first saw from far off).

**What it does not do.** A load at the field's end is not found from the opening view by anything of its own but
the face pinned to whoever hauls: the truck, its barrels and the smoke of its engine change 60 to 160 pixels. In
rain and fog the far signs are the lamps and the face the interface pins to whoever
works: the far mark there is under the floor. With one tractor the crop is handed up by the barrel at the field's
end while the tractor digs, and a load is seen on the lane only once there is a machine for it. A feller under the
boughs of the next tree to fall is hidden by them, from the side and from above. At 8x the picture is of what the
farm is doing, some seconds (as many as a dozen days) behind the calendar and the words on the people's cards.

### How frames come, and nobody slid as they stand (after `live-29`)

The owner, after playing `live-29`: "theres sitll disjointed logic fps lag characters t-posing", and then: "Theres also
slight FPS even on my windows machine with a 4090 which would hint toward a rendering bug". Two tools were written
before anything was changed. `tools/render/pose.ts` watches every figure drawn, on every frame, through a first year
and into a second (each clock, paused, someone followed, a hire, a day off, a saved game opened again, winter) and
fails on a figure held as a T, with both arms straight out in front, or carried over the ground faster than a slow
walk while its legs are not stepping. `tools/render/flow.ts` keeps every animation frame of ten seconds in each state
a player spends time in (when it came, the page's work in it part by part, whether a picture was drawn, its size, the
day, each pin and the camera) and gives the series, not the mean; `--throttle=4` slows the page's thread, `--hz`
stands in for a faster display.

**Nobody was ever held as a T.** The figures are posed every frame from what they are doing; the nearest any arm
came to a T in 28 states was 0.10 of one. What the owner saw was people sliding: since `1f9d045` each person is
drawn at a place that chases where the day's script has them, and their pose came from the script alone. Arrived
in the script and still being carried there in the picture, they were drawn standing (or bent to their work) and
slid over the ground at up to 9, 13.5 and 21.6 m/s at the three clocks: eleven of the twelve cases in
`tests/slide.test.ts` (planting, spraying, digging, scouting at each clock) fail with the fix switched off, and
`pose.ts` found it in planting and spraying at 1x and 8x and in the dig at 1x. Now anyone carried over the ground
faster than 0.45 m/s without stepping is seen walking there, facing the way they go (`figure` in
`src/render/units.ts`). The scarecrow in the kitchen garden, a man-sized coat on a cross by the house, had his
arms let down. A person followed was also followed in lurches (the camera waited until they were a step and a
half off and then made a timed move after them: steps of up to 1.65 m a frame against a usual 0.07); the camera
now goes as they go, every frame.

**The frame rate on a fast display was held down, and could be taken for slowness.** `src/render/pace.ts` drew a
display faster than sixty a second on every second, third or fourth of its beats: 72 pictures a second at 144, 55
at 165, 60 at 240 and 60 on a 120-a-second laptop, whatever the machine. And the test for a machine that cannot keep
up was the time between two pictures: on such a display a picture waits one beat more whenever a call falls just
short (the page's thread missing a beat of a 240-a-second display is enough), which read as late frames, made the
picture smaller a size at a time and then brought the setting down. A stand-in for it on the test box (an RTX
2080 Ti with every frame to spare) went from high at full size to low at seven tenths of the side in 36 seconds,
at 47 pictures a second. Now:

- how long the browser took to call again says whether the machine keeps up, not the pace chosen (`Pace.gap`);
- a fast display is tried on its every beat once frames have been in time for six seconds at the full size, and
  kept there for as long as that gives seventy pictures a second or better; two slow stretches put it back to
  about sixty, and the wait before the next try doubles each time a try did not hold (`Rate`).

**The page's own work.** On the test box at full speed (an i9-9900K) both `live-29` and this build hold sixty a
second in every state: gaps 16.7 / 16.8 / 16.8 ms at the middle, 95th and 99th, one picture in about 650 late.
The page works 3.5 to 4 ms a frame, 2.8 of it sending the picture (354 draw calls, 4,308 things in the scene) and
under half a millisecond in the interface, except:

- **the land dragged**: the tags were settled again every few frames at 13 ms a time (3.6 ms a frame, more than
  the picture). Each field's place on the screen was worked out afresh every time it was asked for (several
  hundred times in a settling, each one measuring the window), and a tag with no room on its field tried thousands
  of places in full. Each place is now worked out once a picture (`src/render/index.ts`), and places that could
  neither stand on the free land nor point at the field are passed over untried (`spot` in `src/ui/plates.ts`);
- **a day's turn**: the day itself (4 to 7 ms with what listens to it), the land made again (3 to 4) and the
  interface drawn again (10 to 25, most of it the browser's own style and layout after the boards, the tags and
  the cards are rebuilt) fell in one frame. See the next part.

#### A day's turn, a part a frame

Read by function with the page's thread slowed four times (`flow.ts --turns --profile` on a build made with
`--minify false`), a day's turn was mostly not the day. The next day was played out on a copy of the farm three
times over: `jobOutlook` once for the time book, again inside `pressing` for the same caller, and a third time
for the board's calls, the first two in the day's own frame because the note that says when the vines will be
killed asked for them there. Each is a copy of the whole farm and a day of the simulation.

- `jobOutlook` asked again of a farm that has not changed answers from its last reckoning (the farm as text is
  the key, so nothing can be stale), and `pressing` takes the outlook its caller has (`src/sim/outlook.ts`). The
  kill-date note asks only for those dates (`killsAhead`), which need no day played out.
- With the clock running a day's turn is spread over the frames after it: the day itself; the land made again
  (`rebuild` in `src/render/index.ts` waits one frame); then the screen a part a frame (`drawn` in
  `src/ui/season.ts`, stepped by `src/ui/index.ts`): the orders' fates, the boards, the tags, the time book, the
  pins, the cards, the grid and telegram with the insets. Anything else that changes meanwhile draws the whole at
  once as before, and with the clock stopped nothing is spread.
- The save waits until well into a day (`tick` in `src/game/app.ts`).

Days never come several to a frame (a day at 8x is about 48 frames; `tick` allows three only after a stall).

On mizepc2 with other suites running beside it (no quiet run was to be had): at full speed every frame of a turn
is 4 to 13 ms of the page's work at 1x, 3x and 8x and none loses a beat; with a field card open the last part
(the insets measured after the last writes) is 13 to 24 ms on some turns. Slowed four times a turn's frames are
20 to 47 ms of work, the worst 58 (before: two frames of 59 to 73 on a quiet box), so beats are still lost there:
the boards' part alone is 15 to 26 ms slowed, and the picture's own 15 to 21 leaves it no room. Not mended: the
boards drawn in two parts, and the picture's upkeep (three.js composes and multiplies the matrix of each of the
4,308 things every frame, about a sixth of the page's work in the profile, though almost none of them move).

## Wave three: bugs and UX, checked by players who see only pictures

After live-5 the owner asked for a camera that tips down, lighter rendering, a card for anyone clicked, a far more
intuitive interface and a full tutorial, then for bugs and UX only. The work was steered by rounds of blind
first-time players (`tools/quality/player.mjs`: a fresh agent with a character and no knowledge of the game sends a
few mouse and keyboard actions at a time and gets back only a picture). Each round's findings, the players' own
notes and the record of every move are in `docs/quality/players/`.

Scores out of ten, rounds one to five (live-5, the first routine build, the second, live-9, live-13):

| Player | Knowing what to do next | Looks | Wanting to keep playing |
| --- | --- | --- | --- |
| Strategy veteran | 6, 5, 5, 7, 7 | 9, 9, 9, 9, 9 | 7, 7, 7, 8, 8 |
| Careful casual | 6, 6, 7, 7, 7 | 9, 9, 9, 9, 9 | 8, 7, 8, 7, 8 |
| Impatient explorer (turns the guide down) | 3, 4, 4, 6, 6 | 9, 9, 8, 9, 9 | 6, 6, 6, 7, 7 |

The final build (live-14) has the fixes made after round five and has not been played by a round of its own.

### The final build's checks (mizepc2, RTX 2080 Ti, the box otherwise idle)

- Unit tests: 620 of 620.
- Browser suite, Chromium and the phone project (`e2e/tutorial`, `play`, `interface`, `a11y`, `foot`): 52 passed,
  3 skipped, 0 failed, in 7.5 minutes.
- Saves from three earlier formats (v2 season, cellar and spring; the live-4 v7 save) open and play with 0 errors.
- `tools/render/tilt.ts`: 6 of 6.

Not run on the final build: Firefox and WebKit; the capture sweep at eight sizes for every state (each writer
captured the states they touched); the GPU budget; anything on a MacBook or integrated graphics.

### Open, from round five and the writers' reports

- A contract's forecast in the season reads the tubers in the ground today, not the crop expected at the dig, and
  counts every grade against a No. 1 promise: it can fall far below what was promised with no reason shown.
- With a person selected, a right-click on a field does not send them to its work.
- A click on a worker can change the speed; "Stopped: ... wants an answer" can stay after the answer.
- Plant is offered in cold ground with no warning on the button, and the weigh ticket does not name cold planting.
- The crew's kill date is on the field's card and in notes, not on its tag; resting fields do not say what grows.
- Zoomed out, tags float away from their fields; the Home flag failed once on a second press.
- Follow was not seen for someone driving; someone passing through a door stayed out of sight for a moment.
- The guide's spring note still sits in the sheet on an upright phone, over all but one applicant.
- A sheet that grows moves its Back button; a telegram arriving can take a click aimed elsewhere; the "Takes first"
  icons have no labels.
- One pin click in eighteen misses a person walking out from under their pin.
- The guide's opening is not steady when repeated: in the guide writer's last run of its browser test three times on
  each project, three of six guided openings failed (on a phone the boards note's slip lay over the forecast, and a
  field tag the test fell back to was covered; in Chromium one click on a note's target hung). They came once notes
  that are only read stopped holding the clock. The single run in the final gate passed on both projects.
- Start-up: about 6 s to the first frame on a quiet test box, nearly all of it one shader's compile; the splash
  says what it is waiting for but stands still for the first 3 s. A plan is in the start-up writer's report.
- Balance gates G2 and G3 still fail (traps: foreman, bunkhouse, second and third tractor; one build order best).

## What the game says against what the farm holds (after `live-29`)

The owner, after playing: "theres sitll disjointed logic". `tools/quality/agree.ts` plays two years on the fixed farm
as the game asks (the word to plant, the spraying answered on its card, every stamp that is the player's pressed, a
hand hired and a sprayer bought the second spring) and on every game day reads the page beside the farm's state: each
person's chip, pin and card, the goal slip, every slip that comes up, each field's stamp, need and card, the work
list, the money board and its reason, the phase strip, each weigh ticket, the ledgers. Its rules count each way two
places told it differently (`--check <days.jsonl>` runs the rules alone over readings already taken).

On main before the fixes it found nine kinds, 210 times in the two years:

| Kind | Times | Cause, and the one source it reads now |
| --- | --- | --- |
| Someone called "Idle" after a day's work | 104 | `personNow` (src/ui/now.ts) read only the order held between days, so work begun and finished within a day left "Idle". With nothing ahead it now says the work finished ("Sprayed Bottom Field", "Walked the rows in South Ridge") from the day's record of work. |
| An ask left up after it was met | 35 | A note stayed for its time whatever was done. src/ui/index.ts keeps what each ask or barrel warning stands on and takes it down once no field needs it. |
| "then sign a contract" in a season | 27 | The slip named the next goal whether or not it could be taken; it is named only while it can. |
| "Nothing for you until blight weather" after spraying began | 19 | `waitingFor` (src/game/goals.ts) knew only the first blight weather; after the first spray it says "Your next decision is a spray". |
| A money reason for something days old | 8 | `moneyCause` compared today with the look the last line was said from, so "Vines killed in South Ridge" was said 26 days after the kill. A field's event is the cause only if it happened since the look of the day before. |
| A slip title ending in a period, the crew's job as the player's "then" | 6, 5 | The slip printed the advice's sentence whole, and "then do a test dig (your crew handles it automatically)". |
| Tickets numbered by the lot's id | 4 | "No. 2-5" was the second year's first ticket: `ticketPlace` (src/ui/ticket-words.ts) numbers them in the order they are cut, from 1 each year. |
| "Your next decision is killing the vines, due since Sep 8" with the kills on the work list | 2 | `waitingFor` now says "Killing the vines: 2 of 4 fields". |

Also made one: the ledger's "ended $4,650 down" beside "most years end $4,000 to $24,000 down" (two different figures:
it is "in debt" now); a hired person's ledger line ("Hired at $550 a month" as a sentence of its own); "harvested" for
a field whose barrels were still out ("all dug"); blight found where the crew keeps the fields sprayed, with nothing
saying why (the find now says "Rain washed the spray off", "Sprayed 9 days ago, worn off" or "Spray slows blight, it
can't stop it all"); the frost key pressed with every barrel in (it says so); an answer shown beside the pointer and
in the tutorial's note at once.

After the fixes the same reading finds none. `tests/agree.test.ts` holds the pure ones over seeded two-year farms.

Left, and whose it is: the season's spraying question comes with the first blight weather, after four rounds of spray
stamps on the fixed farm's first year (the tutorial's lessons key on the same day); a person's chip opens the short
card on a farm of one and the full page on a farm of several; the date board and the chips stand at the morning of a
day while the land replays the day before; the planting countdown follows the forecast and can go from 3 days back
to 9; a hired field hand has work on about one day in four.
