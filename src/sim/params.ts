// Every tunable number in the simulation. docs/MODEL.md gives the source of each, or marks it invented.
import type { Cause, Grade, JobKind, UpgradeId } from './types.ts'

export const SAVE_VERSION = 2

export const FIELD_COUNT = 6
export const ROWS = 8
export const COLS = 12
export const HILLS = ROWS * COLS
export const FIELD_ACRES = 5
export const PLANTS_PER_ACRE = 17424          // 36 in rows, 10 in between seed pieces
export const GRAMS_PER_CWT = 45359.237
export const CWT_PER_HILL_GRAM = (FIELD_ACRES * PLANTS_PER_ACRE) / HILLS / GRAMS_PER_CWT

export const SEASON_START = { month: 3, dom: 20 }   // April 20
export const SEASON_LAST = { month: 10, dom: 10 }   // November 10
export const GOAL_YEARS = 5

// Thermal time (Sands, Hackett and Nix 1979).
export const PD_MIN = 7
export const PD_OPT = 21
export const PD_MAX = 30
export const EMERGE_PD = 130
export const SOIL_T_OFFSET = [-1, 0, 1]          // C: the bottom land warms late, the ridge early
export const SOIL_T_GAIN = 0.2                 // daily pull of soil temperature toward air temperature

// Canopy.
export const CANOPY_START = 0.03
export const CANOPY_RATE = 0.17                // logistic rate per day at the temperature optimum
export const SENESCE_RATE = 0.05
export const CLOSURE = 0.85

// Tuber growth.
export const BULK_G_PER_MJ = 1.2              // g fresh tuber per hill per MJ/m2 of sunlight at full canopy
export const PARTITION_PD = 120
export const UNWEEDED_FACTOR = 0.9

// Water (FAO-56).
export const TAW_MM = [93, 84, 72]             // by field position: bottom, mid, ridge
export const DEPLETION_P = 0.35
export const KC_BARE = 0.4
export const KC_FULL = 1.15
export const DRAIN = [0.72, 0.6, 0.45]         // share of surface wetness left next day
export const WORKABLE_WET_MM = 11
export const WATERLOG_MM = 34
export const IRRIGATION_MM = 25
export const STRESS_FLOOR = 0.3               // growth left when the root zone is empty

// Frost.
export const FROST_OFFSET = [-1.6, -0.5, 0.4]  // C on a calm clear night, by field position
export const LEAF_FROST_START = -1
export const LEAF_FROST_SPAN = 2
export const TUBER_FROST_START = -4.4
export const FREEZE_UP_SOIL_T = 0.5

// Late blight.
export const SV_THRESHOLD = 18                 // Blitecast: first spray
export const SV_START = { month: 4, dom: 25 }  // severity values count from May 25
export const ARRIVE_PER_SEV = 0.09             // chance per field per day that outside spores land, per severity value
export const LATENT_DAYS = 4
export const LESION_START = 0.03
export const LESION_GROW = 0.06                // lesion share added per day per severity value
export const SPREAD = 0.9
export const JUMP = 0.03
export const PROTECT = 0.95                    // best share of infections a fresh protectant stops
export const RESIDUE_DECAY = 0.9
export const ROAD_SEV = 0.08                   // field blight share visible without scouting
export const SCOUT_DETECT = 0.6
export const HUMID_BONUS = [2, 0, -1]          // extra wet hours by field position

// Hills and defects.
export const COVER_BY_PASSES = [0.5, 0.8, 1]
export const STORM_MM = 35
export const STORM_EROSION = 0.07
export const SKIN_DAYS = 14
export const NEW_POTATO_LAST = { month: 8, dom: 5 }   // September 5
export const BRUISE_SOIL_T = 8
export const BRUISE_PER_C = 0.035

// Tuber grades by weight, grams.
export const SIZE_SMALL = 36          // 1-1/2 in, the US No. 2 minimum
export const SIZE_A = 70              // 1-7/8 in, the US No. 1 minimum
export const SIZE_CHEF = 300

// Labor: share of a working day each job takes on one field.
export const JOB_DAYS: Record<JobKind, number> = {
  plant: 1, hill: 0.5, scout: 0.2, spray: 0.25, water: 1, rogue: 0.25, sample: 0.1, kill: 0.25, dig: 2,
}
export const JOB_COST: Record<JobKind, number> = {
  plant: 150, hill: 60, scout: 0, spray: 110, water: 300, rogue: 0, sample: 0, kill: 120, dig: 500,
}
export const UPGRADES: Record<UpgradeId, { name: string; cost: number; blurb: string }> = {
  boom: { name: 'Boom sprayer', cost: 6000, blurb: 'Spraying a field takes a tenth of a day instead of a quarter.' },
  harvester: { name: 'Two-row harvester', cost: 12000, blurb: 'Digging a field takes a day and a quarter instead of two days.' },
  vent: { name: 'Cellar ventilation', cost: 7000, blurb: 'The cellar holds more, shrinks less, and rot spreads more slowly.' },
  reel: { name: 'Irrigation reel', cost: 30000, blurb: 'A pump, pipe and a travelling gun. Watering a field takes half a day instead of a whole one, and costs less.' },
}

// Money, in constant dollars.
export const START_CASH = 18000
export const NOTE_PAYMENT = 10000
export const LIVING = 13000
export const CREDIT_LIMIT = -20000            // carried past year end, the bank forecloses below this
export const OPERATING_LIMIT = -75000         // the spring operating loan, repaid from the crop
export const CREDIT_RATE = 0.1
export const FIELD_COST = 8000                 // fertilizer, fuel, repairs and insurance for a potato field
export const SEED_CWT_PER_FIELD = 100
export const CERT_SEED_PER_CWT = 17
export const REST_COST = 250
export const REST_INCOME = 900

export const CELLAR_CWT = 3600
export const CELLAR_CWT_VENT = 6400
export const STORE_COST = 0.3                 // dollars per cwt per month in the cellar: power, sprout control, labour
export const SHRINK = 0.012
export const SHRINK_VENT = 0.007
export const ROT_GROW = 1.1
export const ROT_GROW_VENT = 0.6
export const ROT_BREAK = 0.22
export const SPROUT_SHRINK = 0.03
export const COOL_CELLAR_DAYS = 40             // dormancy gained by holding at 39F instead of the 45F the variety figures assume
export const VENT_DAYS = 25

export const SOIL_AFTER_POTATO = -0.5        // two potato years running bring the full continuous-potato penalty
export const SOIL_YIELD = 0.07               // total yield lost in continuous potato (Larkin 2022: 0.93x)
export const SOIL_SCAB = 0.19                // extra scab in continuous potato (1.19x)
export const SOIL_SCURF = 0.08               // share of tubers downgraded by black scurf and scab in worn soil
export const VERT_GROW = 2.3                 // odds of Verticillium multiply by this per potato crop
export const VERT_REST = 0.75                // and by this per rest year
export const VERT_EARLY = 0.66               // an infected plant senesces at this share of its normal thermal time
export const VIRUS_CERTIFIED = 0.01
export const VIRUS_SPREAD = 0.22             // share of healthy plants infected in a season without aphid control
export const VIRUS_KEEP = 0.85
export const VIRUS_VIGOR = 0.7               // a PVY-infected hill yields 30% less

// Price of a hundredweight relative to US No. 1, by grade.
export const GRADE_PRICE: Record<Grade, number> = { no1: 1, chef: 1.1, b: 0.55, no2: 0.45, cull: 0 }
export const CULL_PRICE = 1                  // dollars per cwt, at the starch factory
// Price through the year relative to the season average.
// Maine monthly price over the season average, 1979-2013 (USDA NASS).
// From mid August on these are the record; the new-crop premium before that is invented (see docs/MODEL.md).
export const SEASON_CURVE: [number, number][] = [   // [day of year, factor]
  [182, 1.4], [196, 1.32], [213, 1.2], [227, 1.05], [244, 0.93], [258, 0.887], [288, 0.878], [319, 0.922],
]
export const MONTH_CURVE = [0.922, 0.962, 0.983, 1.015, 1.062, 1.105, 1.099]   // November to May
export const CELLAR_MONTHS = ['November', 'December', 'January', 'February', 'March', 'April', 'May']

export const CAUSES: Cause[] = ['green', 'scab', 'hollow', 'knob', 'skin', 'bruise', 'blight', 'frost', 'rot', 'small']
export const GRADES: Grade[] = ['no1', 'chef', 'b', 'no2', 'cull']
export const JOBS: JobKind[] = ['plant', 'hill', 'scout', 'spray', 'water', 'rogue', 'sample', 'kill', 'dig']
