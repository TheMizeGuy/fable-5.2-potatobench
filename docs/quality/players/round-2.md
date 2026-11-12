# Round two: what first-time players found in the build with the routine, the people card and the guide

Three fresh blind players (same three characters, 90 requests each, pictures only) played main at 59b1a46. Their
folders, with every picture and their notes: players/q1 (strategy veteran, took the guide), players/q2 (careful
casual, took the guide and followed it), players/q3 (impatient, turned the guide down), under
/private/tmp/claude-501/-Users-mize-Dev-PotatoBench-Fable52PotatoBench/4fbad3a2-df50-4a92-9e03-701d40befb51/scratchpad/players .
The harness's record of every request is in players/logs2.

**The scores did not move.** Knowing what to do next: 5, 6, 4 (round one: 6, 6, 3). Looks: 9, 9, 9. Wanting to keep
playing: 7, 7, 6 (7, 8, 6). They got further (one into year three) and liked the guide's pointing hand and "Show me",
but the same class of fault is still there and new ones came with the new work. Nothing ships as "more intuitive"
until a third round of players says so.

Already fixed on main since they played (b5b193d and after; do not redo): a farmer working alone answers a click on
their face or chip; a card opening or closing no longer re-fits the camera in a season and the camera no longer
glides to a "key moment"; the frost-on-barrels warning comes once per cold spell and hauling ahead of a frost goes on
through a Sunday; the guide no longer says "the ground has frozen" when the season simply finished; Space is always
the clock on the season screen; the clock goes on once the last telegram is answered by any route; "Pause on alerts"
is off for a new player (the owner asked for a steady RTS clock; do not turn it on by default).

## A. Clicks that do not land (all three players; the worst fault twice running)

1. **The mouse goes dead after an order's letter key** (q1: 038 to 044, 085). S pressed on a field's card; then
   Escape, the card's cross and a stamp click all did nothing, until Space ran the clock; the same after K. Giving
   the same order with the mouse did not cause it. Reproduce it first (it may be an interaction with a paused
   clock: the players' browser only runs frames while their actions are carried out, but a real paused game must
   behave the same); it is the most serious fault in the build.
2. **Field tags and stamps move when something else changes** (q1: 030, 033, 084; q3: 028, 035, 036, 065; q2: 039,
   049, 051). Queueing one field moved another's tag 31 px; closing a card made the tags spread; tags sat on top
   of each other and hid names (q1: 013, 032, 036, 047, 083, 089). A tag stays where its field is; it may only
   move when the camera does. Crowding is solved without moving a tag the player may be reaching for (a fixed
   offset per field, smaller tags, or fold the far ones), and never while the pointer is within reach of it.
3. **Rows inside a field's card move** (q3: 029, 071; q2: 037). A paragraph appeared and a Water click landed on
   text; the Hill row vanished, everything shifted up, and a Spray click hit Water ($300). Every order has a
   fixed place on the card, present or greyed with its reason, in every state of the field.
4. **The field card runs off the bottom at 1280 by 800** (q1: 037 to 039): the fifth order cut off; scrolling hid
   the cross; Escape did not close it. The card fits the window at every size, with the cross always in view.
5. **The wheel does nothing over a tag** (q1: 021; q2: 033): zooming must work wherever the pointer is on the land.
6. A click on a stamp while the clock ran at 3x did nothing (q1: 028).
7. "Back" on the hiring sheet started the clock, so the next Space paused it (q1: 026). Answering a telegram also
   goes on by itself (that is the design), so the clock's state must be unmistakable at a glance.

## B. Orders whose fate nobody can see

8. **Queued orders vanish** (q3: 065 to 072): five spray orders on the list, then gone, the stamps back, protection
   "none". Everyone had been set to woods work first, so nobody took them; a hand wore out and was hurt; a field
   lost crop to blight. Every order on the list says who will take it and when, or why nobody will; an order that
   leaves the list says why; and when work the season cannot wait for (spray under a blight watch, planting, the
   haul before a frost) is behind work that can wait, the game says so and offers the fix in one click.
9. **Spraying is a treadmill** (q2: 035 to 057; q1 section 4): asked again every few days, four moving stamps each
   time, about $1,500, and nobody found the "by itself" switch. When blight weather first comes the player is
   asked once how to handle it for the season (keep the fields sprayed by itself, at about what cost; ask me each
   time; not this year), and can change it where the question is asked again.
10. **A hand "worn out" then hurt, with no warning and no way to rest them** (q2: 087 to 090; q3: 072, 087).
11. **People cannot be watched working** (q1: 053, 079): zoomed in on a pin while hauling there was no person, no
    truck, no barrels, and the pin vanished; the tractor's card said "In the shed" while it stood at the field's edge.

## C. The yellow slip and the goals

12. **A goal that cannot be done**: "Pull the stumps" all through year two with $6,000 the farm did not have (q1:
    076 to 089); "Name a foreman" at both year ends with no way found to do it, the "Next: Name a foreman" box
    dead to a click and no foreman control on the People sheet or the hand's card (q3: 048, 050, 051, 087 to 090;
    q2: 087); "Fell a woodlot" all summer while blight came and nothing said spray (q3: 054 to 072), and in May
    with the potatoes not planted (q2: 090).
13. **It flip-flops and goes stale** (q1: 030, 031, 043, 045): "Spray Upper Middle" after the spray was queued;
    kill the vines, then spray, then kill the vines; "Spray before the blight: not yet in reach" with blight
    weather showing and no way to act (q2: 035; q3: 019, 022).
14. **What the coach says and what the ticket says disagree**: the game asked for the vines to be killed in early
    September and the weigh ticket then listed "Too small: the vines were killed on Sep 5, before these sized"
    (q1: 048, 054; round one too). The guide said "Planting day" while the field's card said "Hold off planting...
    below 45°F the seed rots", soil 47°F (q2: 020). "Blight on one hill" while the card said "No blight seen" and
    no rogue order showed (q2: 050, 052). Scout, spray and water on the list for a field whose vines were dead
    (q1: 043). A red stamp turned black and nobody knew what either colour meant (q2: 045, 048; q3: 028, 033).

## D. Money

15. **Nobody understood the money** (all three, both rounds). $24,000 at the start, a plan costing $39,300, "on
    the loan", "$19,000 due" in red, then "balance"; the year ended with less than it began although the bank was
    "satisfied"; one player out-yielded the neighbour and still ended lower. The page "The money" explains it
    well and was found in year two. Before the first Start the season, in three lines: what the farm starts with,
    what the spring loan is, what comes due at the year end and from what. Through the season one figure answers
    "am I all right?" (what the farm would have after the year-end bills if the crop sold today, with its why on
    hover). At the year end, a plain sentence: you began with X, you end with Y, because Z.
16. Logs sold for $2,035 two requests before the building list said a potato house needs 30 of them, bought back
    at $95 a load (q3: 084, 086).
17. Buying a sprayer raised the spring loan by $6,000 while "due at the year end" stayed $19,000 (q1: 071).

## E. The guide

18. The tour (camera, boards, almanac, card, face, clock) came before any decision: the first real order was at
    request 29 of 90 (q1). Keep the opening to what is needed to watch the first planting, and teach the rest when
    it is first wanted.
19. Its box covered the list it had just sent the player to (q2: 078; q1: 070, 074); its pointing hand sat on the
    wages line and on the player's own portrait (q1: 075, 076) and on the date (q2: 010).
20. It asked for a click on a stamp while the clock ran at 3x (q1: 027, 028); a lesson passed unseen while time ran
    (q1: cards 11 and 12; q2: 020 "watch you go out and plant": it happened during a wait).
21. Right-drag did not complete the camera lesson; Home did (q1: 007, 008).
22. It raced a step ahead on any click (q2), and went on to Land before People was done (q1: 074).
23. In year two it sent the player to fell and hire in May (the woodlot's own card says felling is best done in
    winter), then to an unaffordable goal, and said nothing about the season's real work (q1, q2).
24. "Choose variety and seed": no seed choice could be found (q1: 072; q2: 076). "Name a hand foreman": no control
    found (q2: 087). The year-end money lesson came after the first sale (q2: 062).
25. It never said why the clock stopped, or what the money meant (q2).

## F. Things that gave no answer, and words

26. The farmhouse (q3: 005). "Follow" on an idle person's card (q3: 017). The "Next: Name a foreman" box (q3: 088).
27. The priority grid: a left click made a number bigger, which means less important; right-click lowers it;
    nobody was told (q3: 057, 059).
28. Still unexplained: "not yet in reach", "the note", "the household's keep", "a block", "foreman of a block",
    "machine 6", "contract only", "Before 69-136", "hold back seed", "the cellar months", stamp colours, "1 more
    orders", early dying, lesions, hollow heart.

## What they liked (keep)

The weigh ticket and the scale; the test-dig drawing; "Show me"; the pointing hand; the crew planting by itself;
tractors seen close in the rows; the winter market; the ledger against the neighbour; the tilt; Tab and Enter.
