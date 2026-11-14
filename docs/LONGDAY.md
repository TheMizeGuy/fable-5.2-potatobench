# The long day

14 November. The owner, of the game as published that morning (a day lasted four seconds at 1×):

> "Why do events like planting etc happen instantly still"
>
> "days should last like 3-4 minutes at 1x you should be able to watch everyone on your farm working etc"
>
> "I want full real genuine animations like for example the farmer on his tractor plowing the field workers moving
> around with realism doing things etc. I want a deeper version of this task, not a bigger one."

## What was wrong

A day was four seconds, and what the land showed was the day *before*, replayed while the next was counted: an
order had no effect until the day turned, and then its whole day's work was shown in a few seconds, cut and
hurried. A planting changed the field only when it was finished, all at once. None of that could be fixed by
drawing better: a day's work cannot be watched in four seconds.

## What it is now

**The clock.** Pause and three speeds: 1× is a day of 210 seconds, 50× a day of 4 seconds (what 1× was), 400× a
season in under two minutes. A pause keeps its place in the day. The date shows the hour (a working day from six
to five) and the light goes through the day: the morning's low sun, higher toward noon, over the top to the
afternoon's, the evening's, and a few seconds of night as the day turns.

**The simulation.** A day's crew work can be run in stretches (`work` in `src/sim/campaign.ts`, `workDay` and
`runCrews` in `src/sim/season.ts`): the morning's standing orders are given when the day begins, and an order
given at eleven first brings the farm up to eleven, so it is worked in what is left of that day by whoever is free
then. A whole day counted in one step is bit for bit what it was (the golden replay in `tests/golden.json` is
unchanged), so every balance test and the 50× and 400× clocks stand as they were.

**The picture.** At a day of 30 seconds or longer the land plays today's work in today's time
(`src/render/index.ts`, `planLive` in `src/render/units.ts`, `planDay` in `src/render/work.ts`):

- When the day begins the game works out the day as it will go on a copy of the farm (`app.today()`), and
  everyone's day is laid out from that: the same hours the simulation gives each stretch of work. When an order
  changes the day, it is laid out again; what was already under way is not moved.
- A machine works a field in fixed lanes (`lanePoly`), there and back with a turn on the headland, and how far
  along them it is is how far the job has got. So a job taken up the next morning goes on from where the machine
  stood, and the ground changes where the implement has just been, hill by hill.
- A planting, a hilling and a vine kill that are part done show on the ground where the machine has been
  (`src/render/state.ts`). The simulation still plants a field when the planting is finished; the picture no
  longer waits for that.
- The day breaks on people already on the last of their way to the first work (the night covers the rest), so a
  morning begins with work and not with a drive.
- Days of seconds (50×, 400×) keep the picture they had.

## What cannot be literal, and what was chosen

A day is shown in 210 seconds and stands for eleven hours: 190 to one. A real two-row planter makes about seventy
crossings of a five-acre field in its day; shown at a tractor's real speed it would make two. So:

- **Lanes are fewer than real passes.** Six for planting, three for hilling, two for spraying and vine killing,
  eight for digging (two days to a field), each one's ground the band about it. The machine's pace then comes out
  at what reads as a tractor at work: 4 to 8 m/s, against a real 1 to 2.
- **Ways are quick and short.** On the lane a tractor goes at about 12 m/s and a person at a brisk walk; a way too
  long for its time is cut (they go from sight and come into sight again over its last stretch).

The source for how the work was done, by job, with what is sourced and what is estimated, is
`docs/research/farm-work-practice.md`.

## What it is held to

`tests/longday.test.ts` runs the real game at 1× a frame at a time without a picture (`tests/longday.ts`), through
planting (two days, with an order given at eleven on the first), hilling, four days of digging and hauling, and a
walk through the crop. As measured on 14 November:

| | limit | measured |
|---|---|---|
| steps nobody could make, in sight | 0 | 0 |
| figures slid over the ground as they stood | 0 | 0 |
| hills whose ground changed only when the day turned | 0 | 0 of 195 (planting), 96 (hilling), 130 (digging) |
| ground shown worked that the day's end did not have worked | 0 | 0 |
| a machine at row work, median pace | 2.5 to 9 m/s | 6.2 planting, 6.7 hilling, 4.0 digging |
| a machine anywhere, fastest kept up for a second | 16 m/s | 15.5 |
| on foot, fastest kept up for a second | 4.5 m/s | 3.3 |
| a stretch of planting seen being done in its field, share of its hours | over 90% | 100%, 99.5% |
| moved by a new plan when someone else was given an order | under 1 m | 0.3 m |

`e2e/longday.spec.ts` is the same day in a browser on the game's own clock: the clock's keys, the hour, the
planter at its rows within half a minute, the ground sown behind it and not all at once, a pause that holds
everyone still, an order given at mid-morning set out for within seconds.

`tools/render/day.ts` films a day and prints each person's plan and every jump: `node tools/render/day.ts <url>
<out> --job=plant --pace=1 --follow=45`.

Every other test runs on the short-day clock the game had before (`setDays('brisk')`, `e2e/base.ts`): they are
tests of the game's rules and its interface, and a test that waits for a day should wait four seconds.

## Known limits

- The farm's own count (the work list, a field's tag) has the day's work when the day is over, or when an order
  is given: through a long day the land is ahead of it.
- A swath is wider than the implement drawn: six lanes plant a field that seventy real passes would.
- Someone with nothing to do moves about the dooryard; the simulation has no work for them to be seen at.
- Hauling is so many whole loads in its hours; a stretch too short for a load is seen loading only.
- A change of clock between 1× and the faster speeds brings everyone into sight again where the new clock's day
  has them (a quick fade), since the two pictures are not the same day.
