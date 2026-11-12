// The true sizes of people, machines and animals, in metres: each model's own numbers times the factor it is drawn at.
import { COWS, COW_SCALE, DRAUGHT, HORSE } from './animals.ts'
import { FIGURE_TALL } from './crew.ts'
import { FIGURE, TRUE_SIZE } from './measures.ts'
import { TRACTOR_SIZE, TRUCK_SIZE } from './tractor.ts'

export const PERSON = { tall: FIGURE_TALL * TRUE_SIZE * FIGURE }
export const TRACTOR = { long: TRACTOR_SIZE.long * TRUE_SIZE, wide: TRACTOR_SIZE.wide * TRUE_SIZE, tall: TRACTOR_SIZE.tall * TRUE_SIZE }
export const TRUCK = { long: TRUCK_SIZE.long * TRUE_SIZE, wide: TRUCK_SIZE.wide * TRUE_SIZE }
// Animals: the shoulder height each is modelled at, times the factor each is drawn at.
export const DRAUGHT_HORSE = { shoulder: HORSE.high * TRUE_SIZE * FIGURE * DRAUGHT }
export const COW = { shoulder: COWS[0].high * TRUE_SIZE * FIGURE * COW_SCALE }
