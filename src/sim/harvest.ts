// Dig day: every tuber under a hill is weighed, graded, and any loss is put down to its cause.
import * as P from './params.ts'
import { hashUnit } from './rng.ts'
import type { Campaign, Cause, Day, FieldSeason, Lot, Season } from './types.ts'
import { variety } from './varieties.ts'
import { clamp } from './weather.ts'

export interface Tuber { w: number; mark: number }   // mark: 0 sound, otherwise 1 + index into CAUSES

function blankLoss(): Record<Cause, number> {
  return { green: 0, scab: 0, hollow: 0, knob: 0, skin: 0, bruise: 0, blight: 0, frost: 0, rot: 0, small: 0 }
}

export function newLot(c: Campaign, field: number, f: FieldSeason, day: number, register: boolean): Lot {
  const lot: Lot = {
    id: register ? c.nextLot++ : -1,
    field, variety: f.variety, year: c.year, dugDay: day,
    grades: { no1: 0, chef: 0, b: 0, no2: 0, cull: 0 },
    skinned: 0, loss: blankLoss(), rot: 0, skin: 0,
    virus: 0, blightSeed: 0, months: 0, sprouted: false, broke: false,
    sold: 0, revenue: 0, seedHeld: 0, open: false,
  }
  if (register) c.lots.push(lot)
  return lot
}

export function tuberWeights(seed: number, year: number, field: number, hill: number, mass: number, n: number): number[] {
  const raw: number[] = []
  let sum = 0
  for (let k = 0; k < n; k++) {
    const u = hashUnit(seed, year * 8 + field, hill, k * 2)
    const u2 = hashUnit(seed, year * 8 + field, hill, k * 2 + 1)
    const r = 0.22 + u + 1.6 * u2 * u2
    raw.push(r)
    sum += r
  }
  for (let k = 0; k < n; k++) raw[k] = (raw[k] / sum) * mass
  return raw
}

const MARK: Record<Cause, number> = { green: 1, scab: 2, hollow: 3, knob: 4, skin: 5, bruise: 6, blight: 7, frost: 8, rot: 9, small: 10 }

// Grades the tubers under one hill into the lot and returns them for showing.
export function gradeHill(c: Campaign, s: Season, f: FieldSeason, field: number, i: number, lot: Lot, _d: Day): Tuber[] {
  const mass = f.hMass[i]
  const n = f.hN[i]
  const out: Tuber[] = []
  if (mass <= 0 || n <= 0) return out
  const v = variety(f.variety)
  const soil = c.fields[field].soil
  const weights = tuberWeights(c.seed, s.year, field, i, mass, n)
  const sinceDead = f.deadDay < 0 ? 0 : s.day - f.deadDay
  const liveVine = sinceDead < 10 ? f.hLes[i] * 0.25 * (1 - sinceDead / 10) : 0
  const pBlight = Math.min(0.75, f.hTb[i] * v.blightTuber * 0.6 + liveVine * v.blightTuber)
  const pFrost = f.frostT
  const pRot = Math.min(0.3, f.logDays * 0.006) + (f.wet > P.WORKABLE_WET_MM * 0.8 ? 0.01 : 0)
  const pScab = Math.min(0.6, (f.scab / 35) * 0.2 * v.scab * (1 + P.SOIL_SCAB * (1 - soil)) + P.SOIL_SCURF * (1 - soil))
  const pKnob = Math.min(0.45, f.knob * 0.04 * v.rough)
  const pBruise = s.soilT < P.BRUISE_SOIL_T ? Math.min(0.4, (P.BRUISE_SOIL_T - s.soilT) * P.BRUISE_PER_C) : 0
  const k0 = (s.year * 8 + field) * 131 + 17
  for (let k = 0; k < n; k++) {
    const w = weights[k]
    const cwt = w * P.CWT_PER_HILL_GRAM
    const u = (salt: number) => hashUnit(c.seed, k0, i, k * 16 + salt)
    let mark = 0
    if (u(1) < pBlight) {
      if (u(2) < 0.5) mark = MARK.blight
      else lot.rot += cwt          // looks sound; goes into the pile
    }
    if (!mark && u(3) < pFrost) mark = MARK.frost
    if (!mark && u(4) < pRot) mark = MARK.rot
    if (!mark && u(5) < Math.min(0.7, 0.01 + v.green * (1 - f.cover) * (0.08 + w / 1500))) mark = MARK.green
    if (!mark && w < P.SIZE_SMALL) mark = MARK.small
    if (mark) {
      lot.grades.cull += cwt
      lot.loss[P.CAUSES[mark - 1]] += cwt
    } else {
      if (u(6) < pScab) mark = MARK.scab
      else if (w > 220 && u(7) < Math.min(0.6, v.hollow * (0.6 + f.hollow * 0.5))) mark = MARK.hollow
      else if (u(8) < pKnob) mark = MARK.knob
      else if (u(9) < pBruise) mark = MARK.bruise
      if (mark) {
        lot.grades.no2 += cwt
        lot.loss[P.CAUSES[mark - 1]] += cwt
      } else if (w < P.SIZE_A) lot.grades.b += cwt
      else if (w > P.SIZE_CHEF) lot.grades.chef += cwt
      else lot.grades.no1 += cwt
    }
    out.push({ w, mark })
  }
  return out
}

export function lotCwt(lot: Lot): number {
  return lot.grades.no1 + lot.grades.chef + lot.grades.b + lot.grades.no2 + lot.skinned
}

export function finishLot(c: Campaign, f: FieldSeason, lot: Lot): void {
  const total = lotCwt(lot)
  let skin = f.deadDay < 0 ? 0 : clamp((lot.dugDay - f.deadDay) / P.SKIN_DAYS, 0, 1)
  if (f.matureDay >= 0 && lot.dugDay - f.matureDay >= 10) skin = Math.min(1, skin + 0.35)
  lot.skin = skin
  const skinned = (1 - skin) * 0.4 * lot.grades.no1
  lot.grades.no1 -= skinned
  lot.skinned = skinned
  lot.loss.skin = skinned
  const hidden = total > 0 ? lot.rot / total : 0
  lot.blightSeed = hidden
  lot.rot = Math.min(0.6, hidden + 0.012 * (1 - skin))
  lot.virus = Math.min(0.9, P.VIRUS_KEEP * f.seedVirus + P.VIRUS_SPREAD * variety(f.variety).virus * (1 - f.seedVirus))
  lot.open = total > 0.5
}
