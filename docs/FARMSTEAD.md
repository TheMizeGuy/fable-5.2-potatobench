# The County: the farmstead

People, land and buildings. This is the specification for the layer the owner
asked for after playing the strategy build: clear the trees, clean up the land
round the farm, buy more of it, put up farm buildings, hire people, and give all
of it real logic, with the depth of a colony-management game.

`docs/DIRECTION.md` says how the game is played and looks. `docs/DESIGN.md` holds
the pillars and honesty rules, which still bind: the simulation is deterministic,
its state is plain data, and nothing hidden is shown. The crop, weather, blight,
grading and market models are not changed by this document.

## The rule for every mechanic here

Each one has an upside and a downside that run through systems the game already
has (weather, water, blight, labour, money), so that using it is a decision. The
balance tournament must show that each one earns its place for a skilled player
and that none is free. Numbers below are starting points, kept as named
constants; the balance pass tunes them.

## 1. People

Everyone who works on the farm is a person, the farmer included.

| A person has | What it does |
| --- | --- |
| A name | From a fixed list of plain Aroostook names |
| Five skills, 0 to 10 | **machine** (plant, hill, spray, water, kill vines, dig, haul), **field** (scout, rogue, test dig, pick rocks, clear brush), **woods** (fell), **build**, **pack** |
| One trait | A lasting quirk with a mechanical effect (table below) |
| Tiredness, 0 to 1 | Rises with work, falls with rest; slows work; makes accidents likely |
| Mood, 0 to 1 | Follows pay, housing, rest and how the year is going; slows or speeds work; low mood for long and they quit |
| A wage | Dollars a month while employed in the season, and in winter if kept on |
| A priority for each kind of work | 0 never, 1 first, up to 4; decides what they do by themselves |

**Skill.** Work in a skill goes at 0.6 + 0.08 × level of normal speed (level 5 is
the old speed). Skill also changes results:

- field: a scout finds each blighted hill with chance 0.35 + 0.05 × level, to 0.9.
- machine: a spray lays down 0.84 + 0.02 × level of full protection, to 1; stone
  bruising at the dig is scaled by 1.3 − 0.06 × level.
- woods: felling yields 0.7 + 0.06 × level of the tract's timber.

A person gains one point in a skill for each crew-day worked in it; level L to
L + 1 takes 6 + 3L points. The farmer starts at machine 6, field 6, woods 4,
build 4, pack 3.

**Traits** (each person has one; the farmer has none):

| Trait | Effect |
| --- | --- |
| Strong back | Field and woods work 15% faster |
| Steady hands | Machine results as if two levels higher |
| Sharp-eyed | Scouting chance +0.15 |
| Early riser | All work 8% faster |
| Hard to tire | Tires 30% more slowly |
| Cheerful | Own mood never below 0.4; others' mood target +0.03 |
| Hot-headed | Mood falls twice as fast when overworked |
| Careless | Scouting chance −0.1; bruises 20% more at the dig |
| Slow and sure | 10% slower; never injured |
| Homebody | Will not work winters |

**Tiredness.** A full day's work adds 0.07 (less for part days). A day with no
work takes off 0.3. Above 0.6, speed falls in a straight line to 30% less at 1.
Above 0.85, woods and machine work risk an injury (section 6). **Sundays off** is
a farm rule, on by default: nobody works Sundays. Turning it off gains a day a
week and tires everyone.

**Mood.** Starts at 0.7 and moves each day 5% of the way to a target: 0.7, plus
0.1 for a bed in the bunkhouse (hired people), plus or minus 0.1 for each 10% the
wage is above or below what they asked, minus 0.6 × (tiredness above 0.5), plus
0.02 for each field brought in this season. Work goes at 0.85 + 0.25 × mood of
its speed. Seven days running below 0.25 and a hired person quits. `{ t: 'raise',
unit, wage }` changes a wage.

**Hiring.** Each spring three people ask for work, and one more may turn up in
the season (section 6). Each has a name, skills, a trait and an asking wage that
rises with skill. `{ t: 'hire', applicant }`, `{ t: 'dismiss', unit }`. Two hired
people can live out; more need the bunkhouse, which houses six. Anyone can do
any work they have priority for, at their skill; machine work and hauling also
need a free tractor (the farm has one and can own three), or the truck for
hauling.

**Priorities and the day.** Each morning: people who have begun a job carry on
with it. Then, taking the person with the most of the day left first, each looks
through the kinds of work in their own priority order and takes the best
available order of that kind: earliest on the list, adjusted for distance (the
existing nearest-of-the-first-few rule), not held by anyone else, allowed by the
weather, with a tractor free if it needs one. Travel still costs time. An order
can still be given to one person. Default priorities come from skill: best
skill 1, other skills above 2 at priority 2, the rest 3, nothing at 0; the farmer
starts with everything at 2.

**Foreman.** `{ t: 'foreman', unit, block }` makes a hired person foreman of a
block (one per block; `block: null` ends it). A foreman does no field work, earns
40% more, and each morning puts on the list the orders reference practice wants
for the held fields of that block. The player can still order and cancel there.
Reference practice is sound, not expert, so an attentive player still beats a
foreman.

**Harvest-break pickers.** From September 20 to October 10, while the schools
are closed for the harvest, `{ t: 'pickers', on }` hires a picking crew by the
day (about $160 a day). While they are on, every dig goes 40% faster.

**Winter.** `{ t: 'winter', unit, work, field? }` sets what a person does from
November to May: `off` (laid off, unpaid, back in spring), `woods` (felling a
named tract), `pack` (in the packing shed), or `build` (on a building that is
under way). A person kept on is paid each month and puts in 20 crew-days a month
at their skill. The farmer works winters unpaid at 10 crew-days a month. People
keep their skills over a layoff; people who are dismissed or quit are gone.

## 2. Land

**Buying and renting** is as `docs/DIRECTION.md` describes, with one change:
buying takes a quarter down and the rest goes on a **land mortgage**. Each year
end the bank takes, on top of the note, a tenth of each purchase's loan and 8%
interest on what is still owed. `{ t: 'payMortgage', amount }` pays extra in
spring. Expansion on credit can lose the farm.

**Tracts to clear.** Four tracts join the fourteen parcels (eighteen in all):

| Tract | Starts as | Whose | Becomes |
| --- | --- | --- | --- |
| Home Woodlot | Spruce behind North Ridge | The farm's | Ridge field |
| Alder Swale | Brush along the brook by Bottom Field | The farm's | Wet bottom field |
| Burnt Hill | Old pasture gone to poplar, by the ridge lots | For sale | Ridge field |
| Dufour Back Lot | Woods behind the Dufour place | With Dufour land | Mid-slope field |

Clearing is three stages, and each parcel records its `cover`:

1. **Fell** (job `fell`, woods skill): about 40 crew-days for woods, 16 for
   brush. Ruinous in the growing season, so it is winter work. Yields logs
   (about 40 loads for woods, 5 for brush, times the feller's yield).
2. **Stump** (`{ t: 'stump', field }`): a contractor with a bulldozer, a fee,
   about ten season days.
3. **Pick rocks** (job `rocks`): the tract is now a field, owned, rested, almost
   free of early dying, but stony; and its first potato crop on raw ground
   grows about 15% less unless it has had a rest year first.

**Shelter.** Standing woods and brush shelter the held fields within about
twenty ground units. A sheltered field loses about 6% less water, can be sprayed
in 30% more wind, dries more slowly (one more wet hour a day for blight) and is
0.3 °C colder on frost nights. Clearing the tract takes all four away at once.

**Stones.** Every field has stones, 0 to 1 (home fields 0.2 to 0.35, other land a
little more, new ground about 0.75). Frost heaves up about 0.04 each winter.
Stones slow planting and digging (to 30% at 1) and bruise tubers at the dig
(downgraded to No. 2, recorded under a new cause). `rocks` (field skill, about
1.5 crew-days a field, only when no crop is up) takes off about 0.4 and yields
fieldstone (about 12 loads × the stones it took).

**Brush and hedgerows** (job `brush`, field skill, about 2 crew-days, bottom and
mid-slope fields): cold and damp air drains away, so the field loses its extra
wet hours and half its frost offset, and loses 3% more water to the wind. It
grows back after four years.

**Tile drainage** (`{ t: 'tile', field }`, bottom land only, a contractor, a fee,
about eight season days): the field drains like mid-slope ground and holds 6%
less water in a drought.

## 3. Materials

Two materials come off the land and go into buildings:

- **Logs**, from felling. `{ t: 'sellLogs', loads }` sells them (about $55 a load).
- **Fieldstone**, from picking rocks.

A building that needs more than the yard holds buys the difference at the mill
or the quarry price (about $95 a load of logs, $40 of stone), so clearing your
own land is the cheap way to build.

## 4. Buildings

`{ t: 'build', kind, yard }` pays the cash part, takes the materials, and puts a
`build` job on the list. Your own people build it (build skill); it stands when
the crew-days are done. One of each kind per yard; the Dufour yard only while
Dufour land is held.

| Building | Cash | Logs | Stone | Crew-days | What it does, and its catch |
| --- | --- | --- | --- | --- | --- |
| Potato house | $9,000 | 30 | 25 | 30 | Storage for 3,600 cwt at that yard. Replaces the old `house2`. |
| Machine shed | $4,500 | 20 | 10 | 16 | Machine work 10% faster; needed before a second or third tractor; halves breakdowns. |
| Bunkhouse | $3,500 | 16 | 8 | 12 | Houses six hired people (two live out without it) and lifts their mood. |
| Packing shed | $12,000 | 24 | 15 | 24 | In winter, people set to `pack` each pack up to 600 cwt a month from store. Packed No. 1 brings 8% more and B size 0.75 of the No. 1 price, less a charge a hundredweight. Unpacked stock sells as before. |
| Irrigation pond | $6,000 | 0 | 30 | 20 | Home yard. Holds six field-waterings; a home or intervale field waters in a third of a day for little. It fills from rain and the brook; when the last 30 days brought under 40 mm the brook runs low and it empties. |
| Farm stand | $600 | 4 | 0 | 4 | From August 1 it sells about 4 cwt a day from the newest lot at twice the market price, 2.4 times for red and yellow varieties and for thin-skinned new potatoes before September 5. |
| Weather station | $1,800 | 0 | 0 | 1 | The forecast's errors are 40% smaller, and each field shows today's blight risk from its own wet hours. |
| Gravelled road | $1,500 | 0 | 60 | 12 | Travel and hauling 20% quicker. |

Equipment (bought, not built): a second and a third tractor (each needs the
machine shed), a truck (hauls at twice a tractor's rate and frees the tractor),
and what there was before (boom sprayer, harvester, cellar ventilation,
irrigation reel).

## 5. Hauling

Digging lifts the crop into barrels in the field. As hills are dug, a `haul` job
for that field appears by itself. A person with a tractor (or the truck) hauls
about 900 cwt a day at their machine speed, less with distance to the nearest
potato house. Until it is hauled the crop is exposed: a night at −2 °C or colder
freezes a fifth of what is still in the field, and each bright day greens half
a percent. The weigh ticket is cut when the field's crop is all in (`weighed`);
selling or storing waits for it. Dig time no longer includes the haul.

## 6. Incidents

A few times a season something happens that asks for a decision. Each is drawn
from the seed and the day, so a replay sees the same ones, and each waits a few
days for an answer (`{ t: 'answer', incident, choice }`) before taking its
default.

| Incident | Choices |
| --- | --- |
| Someone asks for work (name, skills, trait, wage) | Hire, or not |
| A neighbour offers your best hand more money | Match it (wage up 15%), or lose them if their mood is under 0.6 |
| A tractor breaks down (likelier with long hours and no machine shed) | Three days out, or pay for a rush part; someone with machine 7 has it going in a day |
| Someone is hurt (only when working tired in the woods or on a machine) | Out five to ten days; no choice, but rest prevents it |
| A buyer stops in with an offer for a lot at 10% over the market, this week only | Take it, or not |

## 7. What stays simple

The first spring is unchanged: one farmer, six fields, click what glows. Nobody
has to hire, clear, build or borrow. Each of these opens as the player reaches
for it.

## 8. As built: where the simulation departs from the text above

The rules as built are listed in `docs/MODEL.md` section 10 onward. Where the
text above was silent, or two of its rules collided, the build chose as follows.

**People.**

- *Part days of tiredness.* A part day moves tiredness by 0.07 x the share of the
  day worked minus 0.3 x the share not worked, so the two ends the text gives are
  one rule, and a short job does not stop someone resting.
- *Hiring by kind stays.* `{ t: 'hire', kind: 'hand' | 'operator' }` takes
  someone from the hiring hall: average at that work (level 5), at the old wage,
  set never to do the other kind's work until the player changes their
  priorities. Applicants are the way to find someone better or cheaper.
- *An operator no longer needs a second tractor.* With one tractor, an operator
  and the farmer share it: the limit on machine work is the tractors, not the
  people.
- *Housing replaces the old crew limits* (four hands, one operator): two hired
  people live out, and more need bunkhouse beds.
- *Applicants lapse when the season begins*, like contract offers; someone who
  asks for work later comes as an incident (section 6).
- *Scouting* is capped at 0.9 from skill; a sharp eye adds after that, and no
  one does better than 0.95 or worse than 0.05.
- *Cheerful* lifts every colleague's mood target by 0.03 for each cheerful person
  on the farm.
- *Winter is six months*, November to April, one for each cellar month. When the
  cellar closes early, the rest of the winter's work and pay come at the year end.
- *Pickers* are paid only for days worked (not Sundays off) and go back to school
  by themselves on October 11.
- *A foreman* orders only on working days.
- The command for the rule is `{ t: 'sundays', off: boolean }`.

**Land and materials.**

- *Positions.* The tracts sit a field's depth (13.2 ground units) behind or beside
  their blocks: Home Woodlot behind North Ridge, Alder Swale beside Bottom Field
  toward the yard, Burnt Hill behind High Lot, the Dufour Back Lot behind Dufour
  Upper. Shelter reaches 20 units in a straight line, so each tract shelters the
  one field beside it (and the woodlot and Burnt Hill shelter each other once
  either is cleared).
- *Prices.* Burnt Hill $5,000 and the back lot $4,000 (woodland, cheaper than
  cleared land). Tracts are never let. The back lot can be bought while the farm
  holds a Dufour field, and does not by itself bring the Dufour house.
- *"Ruinous in the growing season".* Felling is allowed in the season, at half
  speed; in winter it goes at full speed. The text's wish that it be winter work
  is kept by the price, not a ban.
- *Stumping fee* $3,000; *tile* $4,000. Both are paid when ordered (spring or
  season) and count season days; tile goes only under the farm's own bottom land
  with no crop in the ground.
- *Stones slow work relative to the home farm's 0.25*, so the old job times hold
  on the home six: ridge fields at 0.3 to 0.35 plant and dig 4 to 9% slower, the
  bottom fields at 0.2 4% faster. At 1 the pace is 36% of the old.
- *Stone bruising* only starts above 0.2 stones, so the home farm loses well
  under 1% of its tubers to it and new ground about 6%.
- *A tract cleared in mid season* is a field from the next spring; until then its
  rocks can be picked. Its default plan is a rest year, which also clears the
  raw-ground penalty.
- *The mortgage* is booked as part of the year's costs (the ledger's `mortgage`
  line), principal and interest together, like every other dollar.
