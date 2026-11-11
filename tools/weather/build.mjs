#!/usr/bin/env node
// Builds src/data/weather/caribou.json from the raw NOAA files in data/raw/.
//   node tools/weather/build.mjs --date YYYY-MM-DD [--report]
//   node tools/weather/build.mjs --check
// --report also rewrites the generated tables in docs/research/00-weather-data.md.
// Every definition and fill rule is documented in that file.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'src', 'data', 'weather', 'caribou.json');
const REPORT = join(ROOT, 'docs', 'research', '00-weather-data.md');

export const FIRST_YEAR = 1973;
export const LAST_YEAR = 2025;
const NORMALS_YEARS = [1991, 2020];
// Years whose hourly dew point is complete; used to validate the overnight fill.
const NIGHT_VALIDATION_YEARS = [1997, 2024];
const GHCN_ID = 'USW00014607';
const ISD_ID = '727120-14607';
const NEIGHBOR_ISD_ID = '727130-14604';
const UTC_OFFSET_H = -5;
const TZ_MERIDIAN_W = 75;
const SIZE_TARGET_BYTES = 1300000;

export const MISSING = -9999;
const HOUR_MS = 3600000;

// Hourly gap rules (hours = length of the run of missing values).
export const SHORT_GAP_H = 3;
export const NIGHT_GAP_MAX_H = 12;
// Tenths of a degree C added to the interpolated dew point before capping it at the air temperature.
export const NIGHT_TD_OFFSET = 0;
export const WET_RH = 90;
// Magnus coefficients over water (Alduchov and Eskridge 1996).
const MAGNUS_A = 17.625;
const MAGNUS_B = 243.04;
// A noon-to-noon window needs this many hours with RH (after all filling) or wetH is estimated.
export const MIN_WINDOW_HOURS = 18;
// Bit 4 is set when the day or its window has fewer measured or short-interpolated RH hours.
const MIN_HUMIDITY_HOURS = 18;
// ISD-Lite hourly extremes stand in for a missing GHCN max/min only with this many hourly temperatures.
const MIN_TEMP_HOURS = 18;

// Dew-point homogenization: in steady rain the air at screen height is close to
// saturation, so the mean dew-point depression during rain hours measures how far
// the hygrometer reads from saturation. Rain hour: >= 1.0 mm in the hour, T >= 2 C.
const RAIN_MIN_P1 = 10;
const RAIN_MIN_T = 20;
const RAIN_MIN_HOURS = 50;
// Years whose sensor reported T == Td in at least this share of rain hours set the reference depression.
const SATURATING_SHARE = 0.2;
const SHIFT_MIN_SE = 2;

export const Q = { TEMP_FILLED: 1, PRCP_FILLED: 2, HUMIDITY_SPARSE: 4, WETH_ESTIMATED: 8, WETH_NIGHT_FILLED: 16 };

// Blitecast severity values (Krause, Massie and Hyre 1975) for one noon-to-noon day.
// Band: mean temperature of the wet hours, tenths of a degree C, inclusive.
// hours: the wetH thresholds; severity = how many of them wetH reaches.
export const BLITECAST_SEVERITY = [
  { tLo: 72, tHi: 116, hours: [16, 19, 22] },
  { tLo: 117, tHi: 150, hours: [13, 16, 19, 22] },
  { tLo: 151, tHi: 266, hours: [10, 13, 16, 19] },
];

export function blitecastSeverity(wetH, wetT) {
  if (wetH <= 0) return 0;
  for (const band of BLITECAST_SEVERITY) {
    if (wetT >= band.tLo && wetT <= band.tHi) return band.hours.filter((h) => wetH >= h).length;
  }
  return 0;
}

// ISD-Lite sky cover codes 0-8 are oktas; 9 (sky obscured) counts as 8; 10-19 are treated as missing.
const SKY_OKTAS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 8];

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysIn = (y) => (isLeap(y) ? 366 : 365);
// Normals slot: 0..365 with Feb 29 at 59, so March 1 is 60 in every year.
export const slotOf = (y, i) => (!isLeap(y) && i >= 59 ? i + 1 : i);
export const rnd = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
const monthOf = (y, i) => new Date(Date.UTC(y, 0, 1 + i)).getUTCMonth() + 1;
const doyOf = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000;
const isoDate = (y, i) => new Date(Date.UTC(y, 0, 1 + i)).toISOString().slice(0, 10);
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Hour index 0 is 1972-12-31 00:00 local standard time.
const BASE_UTC_MS = Date.UTC(1972, 11, 31, -UTC_OFFSET_H);
export const N_HOURS = (Date.UTC(LAST_YEAR + 1, 0, 2, -UTC_OFFSET_H) - BASE_UTC_MS) / HOUR_MS;
export const dayStartHour = (y, i) => (Date.UTC(y, 0, 1 + i, -UTC_OFFSET_H) - BASE_UTC_MS) / HOUR_MS;
const hourIndexUtc = (y, m, d, h) => (Date.UTC(y, m - 1, d, h) - BASE_UTC_MS) / HOUR_MS;
const YEAR_OF_HOUR = (() => {
  const a = new Int16Array(N_HOURS);
  for (let k = 0; k < N_HOURS; k++) a[k] = new Date(BASE_UTC_MS + k * HOUR_MS + UTC_OFFSET_H * HOUR_MS).getUTCFullYear();
  return a;
})();

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------- raw input

export function readManifest() {
  const path = join(RAW, 'MANIFEST.json');
  if (!existsSync(path)) throw new Error(`${path} not found; run node tools/weather/fetch.mjs first`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readRaw(manifest, file) {
  const entry = manifest.files.find((f) => f.file === file);
  if (!entry) throw new Error(`${file} is not in data/raw/MANIFEST.json; re-run fetch.mjs`);
  const buf = readFileSync(join(RAW, file));
  if (buf.length !== entry.bytes || sha256(buf) !== entry.sha256) {
    throw new Error(`${file} does not match its MANIFEST.json size and sha256; re-run fetch.mjs`);
  }
  return buf;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const GHCN_ELEMENTS = { tmax: 'TMAX', tmin: 'TMIN', prcp: 'PRCP', snow: 'SNOW', snwd: 'SNWD' };

// Per-year Float64Arrays (NaN = missing or failed GHCN quality control) and station metadata.
export function readGhcn(manifest) {
  const text = readRaw(manifest, `${GHCN_ID}.csv`).toString('utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const head = parseCsvLine(lines[0]);
  const col = (name) => {
    const k = head.indexOf(name);
    if (k < 0) throw new Error(`GHCN column ${name} missing`);
    return k;
  };
  const cDate = col('DATE');
  const cMeta = { lat: col('LATITUDE'), lon: col('LONGITUDE'), elev: col('ELEVATION'), name: col('NAME') };
  const cols = Object.fromEntries(
    Object.entries(GHCN_ELEMENTS).map(([k, e]) => [k, { v: col(e), a: col(`${e}_ATTRIBUTES`) }]),
  );
  const years = {};
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    years[y] = Object.fromEntries(Object.keys(GHCN_ELEMENTS).map((k) => [k, new Float64Array(daysIn(y)).fill(NaN)]));
  }
  const qcRejected = Object.fromEntries(Object.keys(GHCN_ELEMENTS).map((k) => [k, 0]));
  let meta = null;
  for (let r = 1; r < lines.length; r++) {
    const f = parseCsvLine(lines[r]);
    const date = f[cDate];
    const y = Number(date.slice(0, 4));
    if (y < FIRST_YEAR || y > LAST_YEAR) continue;
    meta = { lat: Number(f[cMeta.lat]), lon: Number(f[cMeta.lon]), elev: Number(f[cMeta.elev]), name: f[cMeta.name] };
    const i = doyOf(y, Number(date.slice(5, 7)), Number(date.slice(8, 10)));
    for (const [k, c] of Object.entries(cols)) {
      const raw = f[c.v].trim();
      if (raw === '') continue;
      const qflag = (f[c.a] ?? '').split(',')[1] ?? '';
      if (qflag.trim() !== '') {
        qcRejected[k]++;
        continue;
      }
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new Error(`GHCN ${date} ${k}: bad value ${raw}`);
      years[y][k][i] = v;
    }
  }
  return { years, meta, qcRejected };
}

function parseIsdLine(line) {
  const num = (a, b) => Number(line.slice(a, b));
  const rec = [num(0, 4), num(5, 7), num(8, 10), num(11, 13), num(13, 19), num(19, 25), num(25, 31), num(31, 37), num(37, 43), num(43, 49), num(49, 55), num(55, 61)];
  const split = line.trim().split(/\s+/).map(Number);
  if (split.length !== 12 || split.some((v, k) => v !== rec[k])) throw new Error(`ISD-Lite line does not match the fixed-width layout: ${line}`);
  return rec;
}

// Hourly series on the local-standard-time grid. NaN = missing.
// tSrc/tdSrc: 0 missing, 1 measured, 2 short-gap interpolation, 3 overnight dew-point fill.
export function readIsd(manifest, isdId) {
  const H = {
    T: new Float64Array(N_HOURS).fill(NaN),
    Td: new Float64Array(N_HOURS).fill(NaN),
    ws: new Float64Array(N_HOURS).fill(NaN),
    wd: new Float64Array(N_HOURS).fill(NaN),
    sky: new Float64Array(N_HOURS).fill(NaN),
    p1: new Float64Array(N_HOURS).fill(NaN),
    tSrc: new Uint8Array(N_HOURS),
    tdSrc: new Uint8Array(N_HOURS),
  };
  const stats = { files: 0, lines: 0, duplicates: 0, skyCodes: {} };
  const seen = new Uint8Array(N_HOURS);
  for (const entry of manifest.files) {
    const m = entry.file.match(/^(\d{6}-\d{5})-(\d{4})\.gz$/);
    if (!m || m[1] !== isdId) continue;
    stats.files++;
    const text = gunzipSync(readRaw(manifest, entry.file)).toString('latin1');
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      const [yy, mo, d, h, t, td, , wd, ws, sky, p1] = parseIsdLine(line);
      const k = hourIndexUtc(yy, mo, d, h);
      stats.lines++;
      if (k < 0 || k >= N_HOURS) continue;
      if (seen[k]) {
        stats.duplicates++;
        continue;
      }
      seen[k] = 1;
      if (t !== MISSING) {
        H.T[k] = t;
        H.tSrc[k] = 1;
      }
      if (td !== MISSING) {
        H.Td[k] = td;
        H.tdSrc[k] = 1;
      }
      if (ws !== MISSING) H.ws[k] = ws;
      if (wd !== MISSING) H.wd[k] = wd;
      if (p1 !== MISSING) H.p1[k] = Math.max(0, p1);
      if (sky !== MISSING) {
        stats.skyCodes[sky] = (stats.skyCodes[sky] ?? 0) + 1;
        if (sky >= 0 && sky <= 9) H.sky[k] = SKY_OKTAS[sky];
      }
    }
  }
  return { H, stats };
}

const cloneH = (H) => Object.fromEntries(Object.entries(H).map(([k, v]) => [k, v.slice()]));

// ---------------------------------------------------------------- dew-point homogenization

// Per local-calendar year: rain hours, mean dew-point depression in hundredths of a degree C,
// and the per-mille share of rain hours reported exactly saturated (T == Td).
export function rainHourDiagnostics(H) {
  const acc = {};
  for (let k = 0; k < N_HOURS; k++) {
    if (H.tSrc[k] !== 1 || H.tdSrc[k] !== 1 || !(H.p1[k] >= RAIN_MIN_P1) || H.T[k] < RAIN_MIN_T) continue;
    const a = (acc[YEAR_OF_HOUR[k]] ??= { n: 0, sum: 0, sq: 0, sat: 0 });
    const dd = H.T[k] - H.Td[k];
    a.n++;
    a.sum += dd;
    a.sq += dd * dd;
    if (dd === 0) a.sat++;
  }
  const out = {};
  for (const [y, a] of Object.entries(acc)) {
    const mean = a.sum / a.n;
    const sd = a.n > 1 ? Math.sqrt(Math.max(0, (a.sq - a.n * mean * mean) / (a.n - 1))) : 0;
    out[y] = { n: a.n, dd: rnd(mean * 10), se: rnd((sd / Math.sqrt(a.n)) * 10), sat: rnd((a.sat * 1000) / a.n) };
  }
  return out;
}

// Reference depression = median over years whose sensor still reported saturation in rain.
// A year's dew points are shifted by (its depression - reference) when that difference
// exceeds twice the standard error of the year's mean; smaller shifts would only move
// hours that sit on the 90 percent line back and forth with sampling noise.
export function tdCalibration(diag, refDd) {
  const healthy = Object.entries(diag)
    .filter(([, d]) => d.n >= RAIN_MIN_HOURS && d.sat >= SATURATING_SHARE * 1000)
    .map(([y]) => Number(y));
  const ref = refDd ?? rnd(median(healthy.map((y) => diag[y].dd)));
  const adj = {};
  for (const [y, d] of Object.entries(diag)) {
    const diff = d.dd - ref;
    adj[y] = d.n >= RAIN_MIN_HOURS && Math.abs(diff) > SHIFT_MIN_SE * d.se ? diff : 0;
  }
  return { refDd: ref, healthyYears: healthy, adj };
}

// adj in hundredths of a degree C; applied to measured dew points, capped at the air temperature.
export function applyTdAdjust(H, adj) {
  for (let k = 0; k < N_HOURS; k++) {
    if (H.tdSrc[k] !== 1) continue;
    const a = adj[YEAR_OF_HOUR[k]] ?? 0;
    if (a === 0) continue;
    const v = H.Td[k] + a / 10;
    H.Td[k] = Number.isNaN(H.T[k]) ? v : Math.min(H.T[k], v);
  }
}

// ---------------------------------------------------------------- hourly processing

export function fillShortGaps(v, src, maxGap) {
  let last = -1;
  for (let i = 0; i < v.length; i++) {
    if (Number.isNaN(v[i])) continue;
    const gap = i - last - 1;
    if (last >= 0 && gap > 0 && gap <= maxGap) {
      for (let k = last + 1; k < i; k++) {
        v[k] = v[last] + ((v[i] - v[last]) * (k - last)) / (i - last);
        src[k] = 2;
      }
    }
    last = i;
  }
}

// Dew point is nearly conserved overnight while the air cools: interpolate it
// across a 4-12 hour gap and cap it at the known air temperature.
export function fillNightDewPoint(T, Td, src, offset = NIGHT_TD_OFFSET) {
  let last = -1;
  for (let i = 0; i < Td.length; i++) {
    if (Number.isNaN(Td[i])) continue;
    const gap = i - last - 1;
    if (last >= 0 && gap > SHORT_GAP_H && gap <= NIGHT_GAP_MAX_H) {
      let tKnown = true;
      for (let k = last + 1; k < i && tKnown; k++) tKnown = !Number.isNaN(T[k]);
      if (tKnown) {
        for (let k = last + 1; k < i; k++) {
          const lin = Td[last] + ((Td[i] - Td[last]) * (k - last)) / (i - last) + offset;
          Td[k] = Math.min(T[k], lin);
          src[k] = 3;
        }
      }
    }
    last = i;
  }
}

export function magnusRh(tC, tdC) {
  const g = (x) => (MAGNUS_A * x) / (MAGNUS_B + x);
  return Math.min(100, 100 * Math.exp(g(tdC) - g(tC)));
}

export function prepareHourly(H, { tdAdj, nightOffset } = {}) {
  if (tdAdj) applyTdAdjust(H, tdAdj);
  fillShortGaps(H.T, H.tSrc, SHORT_GAP_H);
  fillShortGaps(H.Td, H.tdSrc, SHORT_GAP_H);
  fillNightDewPoint(H.T, H.Td, H.tdSrc, nightOffset);
  // From 2013 the hours between 3-hourly synoptic reports lack sky cover mostly when it is cloudy.
  fillShortGaps(H.sky, new Uint8Array(N_HOURS), SHORT_GAP_H);
  H.rh = new Float64Array(N_HOURS).fill(NaN);
  for (let k = 0; k < N_HOURS; k++) {
    if (!Number.isNaN(H.T[k]) && !Number.isNaN(H.Td[k])) H.rh[k] = magnusRh(H.T[k] / 10, H.Td[k] / 10);
  }
  return H;
}

// Noon-to-noon window for date (y, i): hourly values stamped 13:00 the day before through 12:00 that day.
export function wetWindow(H, y, i) {
  const s = dayStartHour(y, i);
  let valid = 0;
  let firm = 0;
  let night = 0;
  let wet = 0;
  let wetTSum = 0;
  for (let k = s - 11; k <= s + 12; k++) {
    if (k < 0 || k >= N_HOURS || Number.isNaN(H.rh[k])) continue;
    valid++;
    if (H.tdSrc[k] === 3) night++;
    else firm++;
    if (H.rh[k] >= WET_RH) {
      wet++;
      wetTSum += H.T[k];
    }
  }
  return { valid, firm, night, wet, wetT: wet > 0 ? rnd(wetTSum / wet) : MISSING };
}

// wetH for a window with enough hours (missing hours take the window's wet share), else null.
export function windowWet(w) {
  if (w.valid < MIN_WINDOW_HOURS) return null;
  const wetH = w.valid === 24 ? w.wet : Math.min(24, rnd((w.wet * 24) / w.valid));
  return { wetH, wetT: wetH > 0 ? w.wetT : MISSING };
}

function seasonSeverity(H, y) {
  let sev = 0;
  let valid = 0;
  const jun1 = doyOf(y, 6, 1);
  const sep15 = doyOf(y, 9, 15);
  for (let i = jun1; i <= sep15; i++) {
    const x = windowWet(wetWindow(H, y, i));
    if (!x) continue;
    valid++;
    sev += blitecastSeverity(x.wetH, x.wetT);
  }
  return { sev, valid, days: sep15 - jun1 + 1 };
}

// Per mille of June-August days (>= 12 measured or short-interpolated RH hours) whose highest RH reaches 97 percent.
function nearSaturationShare(H, y) {
  let days = 0;
  let hit = 0;
  for (let i = doyOf(y, 6, 1); i <= doyOf(y, 8, 31); i++) {
    const s = dayStartHour(y, i);
    let n = 0;
    let mx = 0;
    for (let k = s; k < s + 24; k++) {
      if (Number.isNaN(H.rh[k]) || H.tdSrc[k] === 3) continue;
      n++;
      mx = Math.max(mx, H.rh[k]);
    }
    if (n < 12) continue;
    days++;
    if (mx >= 97) hit++;
  }
  return days ? rnd((hit * 1000) / days) : MISSING;
}

// Mean wind speed by month and local hour over days with all 24 hours reported.
function windDiurnal(H) {
  const sum = Array.from({ length: 13 }, () => new Float64Array(24));
  const cnt = new Float64Array(13);
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    for (let i = 0; i < daysIn(y); i++) {
      const s = dayStartHour(y, i);
      let full = true;
      for (let h = 0; h < 24 && full; h++) full = !Number.isNaN(H.ws[s + h]);
      if (!full) continue;
      const m = monthOf(y, i);
      for (let h = 0; h < 24; h++) sum[m][h] += H.ws[s + h];
      cnt[m]++;
    }
  }
  return sum.map((row, m) => (m === 0 ? null : Array.from(row, (v) => v / cnt[m])));
}

// Daily mean wind; with missing hours, the mean of the reported hours is scaled by the
// month's climatological ratio of the full-day mean to the mean over those same hours.
function dayWindMean(ws, s, month, diurnal) {
  let sum = 0;
  let n = 0;
  let cSel = 0;
  for (let h = 0; h < 24; h++) {
    if (Number.isNaN(ws[s + h])) continue;
    sum += ws[s + h];
    n++;
    cSel += diurnal[month][h];
  }
  if (n === 0) return { mean: NaN, n };
  if (n === 24) return { mean: sum / 24, n };
  const cAll = diurnal[month].reduce((a, v) => a + v, 0) / 24;
  return { mean: (sum / n) * (cAll / (cSel / n)), n };
}

// Deletes wind at 22:00-05:00 LST on complete May-October days and compares daily means.
function validateWindAdjust(H, diurnal) {
  let n = 0;
  let biasPlain = 0;
  let biasAdj = 0;
  let maeAdj = 0;
  for (let y = NIGHT_VALIDATION_YEARS[0]; y <= NIGHT_VALIDATION_YEARS[1]; y++) {
    for (let i = doyOf(y, 5, 1); i <= doyOf(y, 10, 31); i++) {
      const s = dayStartHour(y, i);
      const full = dayWindMean(H.ws, s, monthOf(y, i), diurnal);
      if (full.n !== 24) continue;
      const ws = H.ws.slice(s, s + 24);
      let plain = 0;
      let np = 0;
      for (let h = 0; h < 24; h++) {
        if (h >= 22 || h <= 5) ws[h] = NaN;
        else {
          plain += ws[h];
          np++;
        }
      }
      const adj = dayWindMean(ws, 0, monthOf(y, i), diurnal).mean;
      n++;
      biasPlain += plain / np - full.mean;
      biasAdj += adj - full.mean;
      maeAdj += Math.abs(adj - full.mean);
    }
  }
  return { days: n, biasPlainMs: Number((biasPlain / n / 10).toFixed(2)), biasAdjMs: Number((biasAdj / n / 10).toFixed(2)), maeAdjMs: Number((maeAdj / n / 10).toFixed(2)) };
}

// ---------------------------------------------------------------- solar geometry (FAO-56)

let PHI = (46.87049 * Math.PI) / 180;
let LON_W = 68.01723;
const GSC = 0.082;

export function solar(J) {
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * J); // eq 23
  const delta = 0.409 * Math.sin(((2 * Math.PI) / 365) * J - 1.39); // eq 24
  const ws = Math.acos(-Math.tan(PHI) * Math.tan(delta)); // eq 25
  const ra = ((24 * 60) / Math.PI) * GSC * dr * (ws * Math.sin(PHI) * Math.sin(delta) + Math.cos(PHI) * Math.cos(delta) * Math.sin(ws)); // eq 21, MJ m-2 day-1
  const N = (24 / Math.PI) * ws; // eq 34, hours
  const b = (2 * Math.PI * (J - 81)) / 364; // eq 33
  const sc = 0.1645 * Math.sin(2 * b) - 0.1255 * Math.cos(b) - 0.025 * Math.sin(b); // eq 32, hours
  return { raMm: 0.408 * ra, N, ws, sc };
}

// Sun above the horizon at clock hour h (local standard time): FAO-56 eq 31 hour angle within +-ws.
function isDaylight(sol, h) {
  const omega = (Math.PI / 12) * (h + 0.06667 * (TZ_MERIDIAN_W - LON_W) + sol.sc - 12);
  return Math.abs(omega) < sol.ws;
}

export function hargreaves(tmax10, tmin10, raMm) {
  const tmax = tmax10 / 10;
  const tmin = tmin10 / 10;
  const et0 = 0.0023 * raMm * ((tmax + tmin) / 2 + 17.8) * Math.sqrt(Math.max(0, tmax - tmin));
  return Math.max(0, rnd(et0 * 10));
}

// ---------------------------------------------------------------- normals

// Mean by normals slot over NORMALS_YEARS, 15-day centered running mean (circular), Feb 29 from its neighbours.
export function normalsOf(get) {
  const sum = new Float64Array(366);
  const cnt = new Float64Array(366);
  for (let y = NORMALS_YEARS[0]; y <= NORMALS_YEARS[1]; y++) {
    for (let i = 0; i < daysIn(y); i++) {
      const s = slotOf(y, i);
      const v = get(y, i);
      if (s === 59 || Number.isNaN(v)) continue;
      sum[s] += v;
      cnt[s]++;
    }
  }
  const slots365 = [];
  for (let s = 0; s < 366; s++) if (s !== 59) slots365.push(s);
  const mean = slots365.map((s) => {
    if (cnt[s] === 0) throw new Error(`no normals data for slot ${s}`);
    return sum[s] / cnt[s];
  });
  const out = new Array(366);
  for (let j = 0; j < 365; j++) {
    let acc = 0;
    for (let d = -7; d <= 7; d++) acc += mean[(j + d + 365) % 365];
    out[slots365[j]] = acc / 15;
  }
  out[59] = (out[58] + out[60]) / 2;
  return out.map(rnd);
}

// ---------------------------------------------------------------- wetH estimation rule

const PRCP_CLASSES = [0, 1, 25, 100]; // tenths of mm: 0 | 0.1-2.4 mm | 2.5-9.9 mm | >= 10 mm
const DTR_CLASSES = [0, 40, 60, 80, 100, 120, 140, 160]; // tenths of a degree C
const MIN_CELL_DAYS = 20;
const classOf = (v, edges) => {
  let c = 0;
  for (let k = 1; k < edges.length; k++) if (v >= edges[k]) c = k;
  return c;
};
const warmSeason = (m) => m >= 4 && m <= 10;

// Cell for a noon-to-noon window: season, precipitation class of the wetter of the
// two calendar days it touches, and that day's temperature range.
export function estimationCell(D, y, i) {
  const p = Math.max(D.prcpPrev(y, i), D.prcp(y, i));
  return `${warmSeason(monthOf(y, i)) ? 'warm' : 'cold'}|${classOf(p, PRCP_CLASSES)}|${classOf(D.tmax(y, i) - D.tmin(y, i), DTR_CLASSES)}`;
}

export function fitWetRule(samples) {
  const cells = {};
  const coarse = {};
  for (const s of samples) {
    const [season, pc] = s.cell.split('|');
    for (const [map, key] of [[cells, s.cell], [coarse, `${season}|${pc}`]]) {
      const c = (map[key] ??= { n: 0, wet: 0, nT: 0, dT: 0 });
      c.n++;
      c.wet += s.wetH;
      if (s.wetH > 0) {
        c.nT++;
        c.dT += s.wetT - s.tmin;
      }
    }
  }
  const finish = (c) => ({ n: c.n, wetH: rnd(c.wet / c.n), dT: c.nT > 0 ? rnd(c.dT / c.nT) : 0 });
  return {
    cells: Object.fromEntries(Object.entries(cells).filter(([, c]) => c.n >= MIN_CELL_DAYS).map(([k, c]) => [k, finish(c)])),
    coarse: Object.fromEntries(Object.entries(coarse).map(([k, c]) => [k, finish(c)])),
  };
}

export function applyWetRule(rule, cell, tmin) {
  const [season, pc] = cell.split('|');
  const c = rule.cells[cell] ?? rule.coarse[`${season}|${pc}`];
  if (!c) throw new Error(`wetH rule has no cell for ${cell}`);
  const wetH = Math.min(24, Math.max(0, c.wetH));
  return { wetH, wetT: wetH > 0 ? tmin + c.dT : MISSING };
}

function crossValidateWetRule(samples) {
  let n = 0;
  let abs = 0;
  let bias = 0;
  let absBase = 0;
  for (const r of [0, 1]) {
    const train = samples.filter((s) => s.y % 2 !== r);
    const test = samples.filter((s) => s.y % 2 === r && s.m >= 5 && s.m <= 10);
    const rule = fitWetRule(train);
    const warm = train.filter((s) => s.m >= 5 && s.m <= 10);
    const base = warm.reduce((a, s) => a + s.wetH, 0) / warm.length;
    for (const s of test) {
      const e = applyWetRule(rule, s.cell, s.tmin).wetH - s.wetH;
      n++;
      abs += Math.abs(e);
      bias += e;
      absBase += Math.abs(base - s.wetH);
    }
  }
  return { days: n, maeH: Number((abs / n).toFixed(2)), biasH: Number((bias / n).toFixed(2)), baselineMaeH: Number((absBase / n).toFixed(2)) };
}

// ---------------------------------------------------------------- validation

const ranks = (arr) => {
  const idx = arr.map((v, k) => [v, k]).sort((p, q) => p[0] - q[0]);
  const r = new Array(arr.length);
  for (let a = 0; a < idx.length; ) {
    let b = a;
    while (b + 1 < idx.length && idx[b + 1][0] === idx[a][0]) b++;
    for (let c = a; c <= b; c++) r[idx[c][1]] = (a + b) / 2;
    a = b + 1;
  }
  return r;
};
const pearson = (x, y) => {
  const n = x.length;
  const mx = x.reduce((a, v) => a + v, 0) / n;
  const my = y.reduce((a, v) => a + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < n; k++) {
    sxy += (x[k] - mx) * (y[k] - my);
    sxx += (x[k] - mx) ** 2;
    syy += (y[k] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
};
const spearman = (x, y) => pearson(ranks(x), ranks(y));
const r3 = (v) => Number(v.toFixed(3));

// Deletes the dew point at 22:00-05:00 LST (03-10 UTC) every night, as in 1973-1996,
// re-runs the hourly pipeline, and compares wetH and Blitecast severity with the full data.
function validateNightFill(rawH, tdAdj, truth) {
  const masked = cloneH(rawH);
  for (let k = 0; k < N_HOURS; k++) {
    const utcHour = (((k - UTC_OFFSET_H) % 24) + 24) % 24;
    if (utcHour >= 3 && utcHour <= 10) {
      masked.Td[k] = NaN;
      masked.tdSrc[k] = 0;
    }
  }
  prepareHourly(masked, { tdAdj });
  let n = 0;
  let abs = 0;
  let bias = 0;
  let exact = 0;
  const seasons = [];
  for (let y = NIGHT_VALIDATION_YEARS[0]; y <= NIGHT_VALIDATION_YEARS[1]; y++) {
    const jun1 = doyOf(y, 6, 1);
    const sep15 = doyOf(y, 9, 15);
    let sevT = 0;
    let sevF = 0;
    let complete = true;
    for (let i = doyOf(y, 5, 1); i <= doyOf(y, 10, 31); i++) {
      const a = wetWindow(truth, y, i);
      const b = wetWindow(masked, y, i);
      if (a.valid !== 24 || a.night > 0 || b.valid !== 24) {
        if (i >= jun1 && i <= sep15) complete = false;
        continue;
      }
      n++;
      abs += Math.abs(b.wet - a.wet);
      bias += b.wet - a.wet;
      if (b.wet === a.wet) exact++;
      if (i >= jun1 && i <= sep15) {
        sevT += blitecastSeverity(a.wet, a.wetT);
        sevF += blitecastSeverity(b.wet, b.wetT);
      }
    }
    if (complete) seasons.push({ y, measured: sevT, filled: sevF });
  }
  const m = seasons.length;
  return {
    years: NIGHT_VALIDATION_YEARS,
    maskedLst: '22:00-05:00',
    days: n,
    wetHMae: Number((abs / n).toFixed(2)),
    wetHBias: Number((bias / n).toFixed(2)),
    wetHExactShare: r3(exact / n),
    seasons: m,
    severityMeanMeasured: Number((seasons.reduce((a, s) => a + s.measured, 0) / m).toFixed(1)),
    severityBias: Number((seasons.reduce((a, s) => a + s.filled - s.measured, 0) / m).toFixed(1)),
    severityMae: Number((seasons.reduce((a, s) => a + Math.abs(s.filled - s.measured), 0) / m).toFixed(1)),
    severitySpearman: r3(spearman(seasons.map((s) => s.measured), seasons.map((s) => s.filled))),
    perSeason: seasons,
  };
}

// Season severity at Caribou and at Presque Isle (20 km away), each homogenized against
// the same reference depression, before and after homogenization.
function validateAgainstNeighbor(manifest, carRaw, carAdj, refDd) {
  const { H: nb, stats } = readIsd(manifest, NEIGHBOR_ISD_ID);
  if (stats.files === 0) return null;
  const nbDiag = rainHourDiagnostics(nb);
  const nbCal = tdCalibration(nbDiag, refDd);
  const nbRaw = prepareHourly(cloneH(nb));
  const nbAdj = prepareHourly(nb, { tdAdj: nbCal.adj });
  const rows = [];
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    const s = [seasonSeverity(carRaw, y), seasonSeverity(carAdj, y), seasonSeverity(nbRaw, y), seasonSeverity(nbAdj, y)];
    if (s.some((x) => x.valid < 0.95 * x.days)) continue;
    rows.push({ y, carRaw: s[0].sev, car: s[1].sev, nbRaw: s[2].sev, nb: s[3].sev, nbDd: nbDiag[y]?.dd ?? MISSING, nbSat: nbDiag[y]?.sat ?? MISSING });
  }
  const col = (k) => rows.map((r) => r[k]);
  const mad = (a, b) => rows.reduce((s, r) => s + Math.abs(r[a] - r[b]), 0) / rows.length;
  return {
    station: `Presque Isle, ME, ISD ${NEIGHBOR_ISD_ID}`,
    seasons: rows.length,
    pearsonRaw: r3(pearson(col('carRaw'), col('nbRaw'))),
    pearsonAdj: r3(pearson(col('car'), col('nb'))),
    spearmanRaw: r3(spearman(col('carRaw'), col('nbRaw'))),
    spearmanAdj: r3(spearman(col('car'), col('nb'))),
    meanAbsDiffRaw: Number(mad('carRaw', 'nbRaw').toFixed(1)),
    meanAbsDiffAdj: Number(mad('car', 'nb').toFixed(1)),
    perSeason: rows,
  };
}

// Monthly 1991-2020 means of the output arrays against NOAA's published normals for the station.
function compareOfficialNormals(manifest, out) {
  const file = `${GHCN_ID}-normals-monthly-1991-2020.csv`;
  if (!manifest.files.some((f) => f.file === file)) return null;
  const lines = readRaw(manifest, file).toString('utf8').split(/\r?\n/).filter((l) => l.length > 0);
  const head = parseCsvLine(lines[0]);
  const col = (n) => head.indexOf(n);
  const rows = [];
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const month = Number(f[col('month')]);
    let tx = 0;
    let tn = 0;
    let nd = 0;
    let p = 0;
    for (let y = NORMALS_YEARS[0]; y <= NORMALS_YEARS[1]; y++) {
      const o = out[y];
      for (let i = 0; i < o.n; i++) {
        if (monthOf(y, i) !== month) continue;
        tx += o.tmax[i];
        tn += o.tmin[i];
        p += o.prcp[i];
        nd++;
      }
    }
    const nYears = NORMALS_YEARS[1] - NORMALS_YEARS[0] + 1;
    const fToC = (v) => ((Number(v) - 32) * 5) / 9;
    rows.push({
      month,
      tmaxC: Number((tx / nd / 10).toFixed(2)),
      tmaxNoaaC: Number(fToC(f[col('MLY-TMAX-NORMAL')]).toFixed(2)),
      tminC: Number((tn / nd / 10).toFixed(2)),
      tminNoaaC: Number(fToC(f[col('MLY-TMIN-NORMAL')]).toFixed(2)),
      prcpMm: Number((p / nYears / 10).toFixed(1)),
      prcpNoaaMm: Number((Number(f[col('MLY-PRCP-NORMAL')]) * 25.4).toFixed(1)),
    });
  }
  const maxAbs = (a, b) => Number(Math.max(...rows.map((r) => Math.abs(r[a] - r[b]))).toFixed(2));
  return {
    source: 'NOAA NCEI U.S. Climate Normals 1991-2020, monthly, USW00014607',
    maxAbsDiffTmaxC: maxAbs('tmaxC', 'tmaxNoaaC'),
    maxAbsDiffTminC: maxAbs('tminC', 'tminNoaaC'),
    maxAbsDiffPrcpMm: maxAbs('prcpMm', 'prcpNoaaMm'),
    perMonth: rows,
  };
}

// ---------------------------------------------------------------- build

export function build({ date, nightOffset } = {}) {
  const manifest = readManifest();
  const ghcn = readGhcn(manifest);
  PHI = (ghcn.meta.lat * Math.PI) / 180;
  LON_W = -ghcn.meta.lon;
  const { H: rawH, stats: isdStats } = readIsd(manifest, ISD_ID);
  const G = ghcn.years;
  const years = [];
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) years.push(y);

  const diag = rainHourDiagnostics(rawH);
  const cal = tdCalibration(diag);
  const Hraw = prepareHourly(cloneH(rawH), { nightOffset });
  const H = prepareHourly(cloneH(rawH), { tdAdj: cal.adj, nightOffset });

  const nTmax = normalsOf((y, i) => G[y].tmax[i]);
  const nTmin = normalsOf((y, i) => G[y].tmin[i]);
  const nPrcp = normalsOf((y, i) => G[y].prcp[i]);

  // Offsets from hourly extremes to GHCN daily extremes, fitted on days with 24 measured hourly temperatures.
  const hourlyExtremes = (y, i, measuredOnly) => {
    const s = dayStartHour(y, i);
    let n = 0;
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = s; k < s + 24; k++) {
      if (Number.isNaN(H.T[k]) || (measuredOnly && H.tSrc[k] !== 1)) continue;
      n++;
      hi = Math.max(hi, H.T[k]);
      lo = Math.min(lo, H.T[k]);
    }
    return { n, hi, lo };
  };
  let offN = 0;
  let offMax = 0;
  let offMin = 0;
  for (const y of years) {
    for (let i = 0; i < daysIn(y); i++) {
      const e = hourlyExtremes(y, i, true);
      if (e.n === 24 && !Number.isNaN(G[y].tmax[i]) && !Number.isNaN(G[y].tmin[i])) {
        offN++;
        offMax += G[y].tmax[i] - e.hi;
        offMin += G[y].tmin[i] - e.lo;
      }
    }
  }
  offMax = rnd(offMax / offN);
  offMin = rnd(offMin / offN);

  // Daily GHCN fields with gap filling.
  const out = {};
  const fills = {};
  for (const y of years) {
    const n = daysIn(y);
    const o = (out[y] = { n, q: new Array(n).fill(0) });
    for (const k of ['tmax', 'tmin', 'prcp', 'snow', 'snwd']) o[k] = new Array(n);
    const f = (fills[y] = { tmaxHourly: 0, tmaxNormal: 0, tminHourly: 0, tminNormal: 0, prcp: 0, snow: 0, snwd: 0 });
    const g = G[y];
    for (let i = 0; i < n; i++) {
      const s = slotOf(y, i);
      let tmax = g.tmax[i];
      let tmin = g.tmin[i];
      const maxFilled = Number.isNaN(tmax);
      const minFilled = Number.isNaN(tmin);
      if (maxFilled || minFilled) {
        const e = hourlyExtremes(y, i, false);
        const useHourly = e.n >= MIN_TEMP_HOURS;
        if (maxFilled) {
          tmax = useHourly ? rnd(e.hi + offMax) : nTmax[s];
          f[useHourly ? 'tmaxHourly' : 'tmaxNormal']++;
        }
        if (minFilled) {
          tmin = useHourly ? rnd(e.lo + offMin) : nTmin[s];
          f[useHourly ? 'tminHourly' : 'tminNormal']++;
        }
        if (tmax < tmin) {
          if (maxFilled) tmax = tmin;
          else tmin = tmax;
        }
        o.q[i] |= Q.TEMP_FILLED;
      }
      o.tmax[i] = tmax;
      o.tmin[i] = tmin;
      if (Number.isNaN(g.prcp[i])) {
        o.prcp[i] = 0;
        o.q[i] |= Q.PRCP_FILLED;
        f.prcp++;
      } else o.prcp[i] = g.prcp[i];
      if (Number.isNaN(g.snow[i])) {
        o.snow[i] = 0;
        f.snow++;
      } else o.snow[i] = g.snow[i];
    }
  }
  // Snow depth: linear interpolation between the nearest reported days, nearest value at the ends.
  {
    const flat = [];
    for (const y of years) for (let i = 0; i < daysIn(y); i++) flat.push({ y, i, v: G[y].snwd[i] });
    let last = -1;
    for (let j = 0; j <= flat.length; j++) {
      if (j < flat.length && Number.isNaN(flat[j].v)) continue;
      for (let k = last + 1; k < j; k++) {
        const a = last >= 0 ? flat[last].v : flat[j].v;
        const b = j < flat.length ? flat[j].v : a;
        flat[k].fill = rnd(last >= 0 && j < flat.length ? a + ((b - a) * (k - last)) / (j - last) : a);
        fills[flat[k].y].snwd++;
      }
      last = j;
    }
    for (const d of flat) out[d.y].snwd[d.i] = d.fill ?? d.v;
  }

  const D = {
    tmax: (y, i) => out[y].tmax[i],
    tmin: (y, i) => out[y].tmin[i],
    prcp: (y, i) => out[y].prcp[i],
    prcpPrev: (y, i) => (i > 0 ? out[y].prcp[i - 1] : y > FIRST_YEAR ? out[y - 1].prcp.at(-1) : out[y].prcp[0]),
  };

  // Humidity windows; the wetH estimation rule is fitted on fully observed windows.
  const win = {};
  const samples = [];
  for (const y of years) {
    win[y] = [];
    for (let i = 0; i < daysIn(y); i++) {
      const w = wetWindow(H, y, i);
      win[y].push(w);
      if (w.valid === 24 && w.night === 0) {
        samples.push({ y, cell: estimationCell(D, y, i), wetH: w.wet, wetT: w.wetT, tmin: out[y].tmin[i], m: monthOf(y, i) });
      }
    }
  }
  const rule = fitWetRule(samples);
  const ruleCv = crossValidateWetRule(samples);

  // Calendar-day humidity and wind; their 1991-2020 climatologies fill days with no hourly data.
  const diurnal = windDiurnal(H);
  const dayRh = {};
  const dayWind = {};
  for (const y of years) {
    dayRh[y] = [];
    dayWind[y] = [];
    for (let i = 0; i < daysIn(y); i++) {
      const s = dayStartHour(y, i);
      let rs = 0;
      let rn = 0;
      let rFirm = 0;
      for (let k = s; k < s + 24; k++) {
        if (!Number.isNaN(H.rh[k])) {
          rs += H.rh[k];
          rn++;
          if (H.tdSrc[k] !== 3) rFirm++;
        }
      }
      dayRh[y].push({ mean: rn > 0 ? rs / rn : NaN, n: rn, firm: rFirm });
      dayWind[y].push(dayWindMean(H.ws, s, monthOf(y, i), diurnal));
    }
  }
  const climRh = normalsOf((y, i) => dayRh[y][i].mean);
  const climWind = normalsOf((y, i) => dayWind[y][i].mean);

  const humidityFills = {};
  for (const y of years) {
    const o = out[y];
    for (const k of ['wetH', 'wetT', 'rh', 'wind', 'wdir', 'cloud', 'et0', 'dayl']) o[k] = new Array(o.n);
    const hf = (humidityFills[y] = { rhClim: 0, windClim: 0, wdirMissing: 0, cloudMissing: 0, windowScaled: 0 });
    for (let i = 0; i < o.n; i++) {
      const w = win[y][i];
      const sol = solar(i + 1);
      const x = windowWet(w);
      if (x) {
        if (w.valid < 24) hf.windowScaled++;
        o.wetH[i] = x.wetH;
        o.wetT[i] = x.wetT;
        if (w.night > 0) o.q[i] |= Q.WETH_NIGHT_FILLED;
      } else {
        const est = applyWetRule(rule, estimationCell(D, y, i), o.tmin[i]);
        o.wetH[i] = est.wetH;
        o.wetT[i] = est.wetT;
        o.q[i] |= Q.WETH_ESTIMATED;
      }
      const dr = dayRh[y][i];
      if (w.firm < MIN_HUMIDITY_HOURS || dr.firm < MIN_HUMIDITY_HOURS) o.q[i] |= Q.HUMIDITY_SPARSE;
      if (dr.n > 0) o.rh[i] = rnd(dr.mean);
      else {
        o.rh[i] = climRh[slotOf(y, i)];
        hf.rhClim++;
      }
      const dw = dayWind[y][i];
      if (dw.n > 0) o.wind[i] = rnd(dw.mean);
      else {
        o.wind[i] = climWind[slotOf(y, i)];
        hf.windClim++;
      }
      // Speed-weighted vector mean direction; calms add nothing to the vector.
      const s = dayStartHour(y, i);
      let u = 0;
      let v = 0;
      let nDir = 0;
      let skySum = 0;
      let skyN = 0;
      for (let k = s; k < s + 24; k++) {
        const sp = H.ws[k];
        const dir = H.wd[k];
        if (sp > 0 && dir >= 1 && dir <= 360) {
          const a = (dir * Math.PI) / 180;
          u += sp * Math.sin(a);
          v += sp * Math.cos(a);
          nDir++;
        }
        if (!Number.isNaN(H.sky[k]) && isDaylight(sol, k - s)) {
          skySum += H.sky[k];
          skyN++;
        }
      }
      if (nDir > 0 && Math.hypot(u, v) > 1e-6) {
        let deg = rnd((Math.atan2(u, v) * 180) / Math.PI);
        if (deg <= 0) deg += 360;
        o.wdir[i] = deg;
      } else {
        o.wdir[i] = MISSING;
        hf.wdirMissing++;
      }
      if (skyN > 0) o.cloud[i] = rnd((skySum / skyN) * 10);
      else {
        o.cloud[i] = MISSING;
        hf.cloudMissing++;
      }
      o.et0[i] = hargreaves(o.tmax[i], o.tmin[i], sol.raMm);
      o.dayl[i] = rnd(sol.N * 60);
    }
  }

  // wetH normals from windows that were not estimated.
  const nWetH = normalsOf((y, i) => ((out[y].q[i] & Q.WETH_ESTIMATED) === 0 ? out[y].wetH[i] : NaN));

  const qa = {};
  const playable = [];
  for (const y of years) {
    qa[y] = yearQa(out[y], y, { H, Hraw, diag: diag[y], adj: cal.adj[y] ?? 0, fills: { ...fills[y], ...humidityFills[y] } });
    if (isPlayable(out[y].q, y)) playable.push(y);
  }

  return {
    station: {
      name: 'Caribou, Maine (GHCN-Daily: CARIBOU WEATHER FORECAST OFFICE, ME US; ISD: CARIBOU MUNICIPAL AIRPORT)',
      ghcn: GHCN_ID,
      isd: ISD_ID,
      lat: ghcn.meta.lat,
      lon: ghcn.meta.lon,
      elevM: rnd(ghcn.meta.elev),
      utcOffsetH: UTC_OFFSET_H,
    },
    sources: manifest.files.filter((f) => f.role === 'data').map((f) => f.url),
    built: date,
    fields: FIELDS,
    years: Object.fromEntries(years.map((y) => [y, Object.fromEntries(YEAR_KEYS.map((k) => [k, out[y][k]]))])),
    normals: { tmax: nTmax, tmin: nTmin, prcp: nPrcp, wetH: nWetH },
    playable,
    qa,
    qaFields: QA_FIELDS,
    method: {
      shortGapH: SHORT_GAP_H,
      nightGapMaxH: NIGHT_GAP_MAX_H,
      nightTdOffset: nightOffset ?? NIGHT_TD_OFFSET,
      minWindowHours: MIN_WINDOW_HOURS,
      tempFromHourlyOffset: { tmax: offMax, tmin: offMin, days: offN },
      dewPointHomogenization: { refDd: cal.refDd, healthyYears: cal.healthyYears, rainMinP1: RAIN_MIN_P1, rainMinT: RAIN_MIN_T, saturatingShare: SATURATING_SHARE, shiftMinSe: SHIFT_MIN_SE },
      wetRule: rule,
      wetRuleCv: ruleCv,
      nightFillValidation: validateNightFill(rawH, cal.adj, H),
      windValidation: validateWindAdjust(H, diurnal),
      neighborValidation: validateAgainstNeighbor(manifest, Hraw, H, cal.refDd),
      officialNormalsCheck: compareOfficialNormals(manifest, out),
      ghcnQcRejected: ghcn.qcRejected,
      isdSkyCodes: isdStats.skyCodes,
      isdDuplicates: isdStats.duplicates,
    },
  };
}

function isPlayable(q, y) {
  const may1 = doyOf(y, 5, 1);
  const oct31 = doyOf(y, 10, 31);
  let b1 = 0;
  let b8 = 0;
  for (let i = may1; i <= oct31; i++) {
    if (q[i] & Q.TEMP_FILLED) b1++;
    if (q[i] & Q.WETH_ESTIMATED) b8++;
  }
  const days = oct31 - may1 + 1;
  return b8 < 0.05 * days && b1 < 0.02 * days;
}

const YEAR_KEYS = ['n', 'tmax', 'tmin', 'prcp', 'snow', 'snwd', 'wetH', 'wetT', 'rh', 'wind', 'wdir', 'cloud', 'et0', 'dayl', 'q'];

const FIELDS = {
  n: 'days in the calendar year (365 or 366); every array has n entries, index 0 = January 1, days in local standard time (UTC-5, no daylight saving)',
  tmax: 'daily maximum air temperature, tenths of a degree C (GHCN-Daily TMAX, midnight to midnight local standard time)',
  tmin: 'daily minimum air temperature, tenths of a degree C (GHCN-Daily TMIN)',
  prcp: 'daily precipitation, tenths of a mm (GHCN-Daily PRCP; trace = 0)',
  snow: 'daily snowfall, mm (GHCN-Daily SNOW)',
  snwd: 'snow depth, mm (GHCN-Daily SNWD)',
  wetH: 'hours with relative humidity >= 90 percent among the hourly values stamped 13:00 the previous day through 12:00 this day, local standard time (the noon-to-noon blight period), 0-24; hourly RH from homogenized dew points',
  wetT: 'mean air temperature during the wetH hours, tenths of a degree C; -9999 exactly when wetH is 0',
  rh: 'mean relative humidity over the calendar day (hourly Magnus RH from ISD-Lite temperature and homogenized dew point), percent',
  wind: 'mean wind speed over the calendar day (ISD-Lite hourly, calms included; when hours are missing, the mean of the reported hours is scaled by the month\'s climatological diurnal cycle), tenths of a m/s',
  wdir: 'speed-weighted vector-mean wind direction over the calendar day, degrees 1-360 (direction the wind blows from); -9999 when no non-calm hour has a direction',
  cloud: 'mean total sky cover over daylight hours (sun above the horizon at the observation hour; gaps of up to 3 hours interpolated), oktas x 10 (0-80); -9999 when no daylight observation. From 1999 the automated station reports only cloud below about 3.6 km, and daytime means run about 2 oktas lower than the human observations before',
  et0: 'reference evapotranspiration, Hargreaves-Samani 0.0023 Ra (Tmean + 17.8) sqrt(Tmax - Tmin), Ra from FAO-56 eq 21-25, tenths of a mm per day',
  dayl: 'day length, minutes (FAO-56 eq 34)',
  q: 'quality bits: 1 tmax or tmin filled; 2 prcp filled (set to 0); 4 humidity for the calendar day or its noon-to-noon window rests on fewer than 18 measured or short-gap-interpolated hourly values; 8 wetH and wetT estimated from temperature range and precipitation (fewer than 18 of the 24 window hours had RH); 16 the wetH window includes hours whose dew point came from the overnight fill',
  normals: 'normals.<field>[slot]: 1991-2020 mean by calendar date, 15-day centered running mean; slot 0 = Jan 1, slot 59 = Feb 29 (mean of its neighbours), slot 60 = Mar 1, so in a non-leap year day index i >= 59 maps to slot i + 1; tmax and tmin tenths of a degree C, prcp tenths of a mm per day, wetH hours',
  playable: 'years in which, May 1 to October 31, fewer than 5 percent of days carry q bit 8 and fewer than 2 percent carry q bit 1',
};

const QA_FIELDS = {
  b1: 'per mille of May-October days with q bit 1 (b2, b4, b8, b16 likewise)',
  tmean: 'May 1-September 30 mean of (tmax + tmin) / 2, tenths of a degree C',
  prcp: 'May 1-September 30 total precipitation, tenths of a mm',
  wetH: 'May 1-September 30 total wetH, hours',
  lastFrost: 'day index of the last date before August 1 with tmin <= 0 C; -9999 if none',
  firstFrost: 'day index of the first date from August 1 on with tmin <= 0 C; -9999 if none',
  sev: 'Blitecast severity total, June 1-September 15 (from the wetH and wetT arrays)',
  sevEst: 'days June 1-September 15 whose wetH was estimated (q bit 8)',
  sevRaw: 'the same severity total computed without the dew-point homogenization (windows with enough hours only)',
  rainN: 'rain hours (>= 1.0 mm in the hour, T >= 2 C) with measured T and Td in the year',
  rainDd: 'mean dew-point depression in those rain hours, hundredths of a degree C, before homogenization',
  rainSe: 'standard error of rainDd, hundredths of a degree C',
  rainSat: 'per mille of those rain hours reported saturated (T == Td)',
  tdAdj: 'dew-point shift applied to every measured hourly dew point of the year (rainDd minus the reference, or 0 when within twice rainSe of it), hundredths of a degree C',
  sat97Raw: 'per mille of June-August days whose highest measured RH reaches 97 percent, before homogenization; -9999 if no data',
  sat97: 'the same after homogenization',
  hrT: 'per mille of the year\'s hours with a measured air temperature',
  hrTd: 'per mille of the year\'s hours with a measured dew point',
  fill: 'counts of filled values in the year: tmax/tmin from hourly extremes or normals, prcp, snow, snwd, rh and wind from climatology, missing wdir and cloud, windows scaled from 18-23 hours',
};

function yearQa(o, y, { H, Hraw, diag, adj, fills }) {
  const may1 = doyOf(y, 5, 1);
  const oct31 = doyOf(y, 10, 31);
  const sep30 = doyOf(y, 9, 30);
  const jun1 = doyOf(y, 6, 1);
  const sep15 = doyOf(y, 9, 15);
  const aug1 = doyOf(y, 8, 1);
  const bits = { b1: 0, b2: 0, b4: 0, b8: 0, b16: 0 };
  for (let i = may1; i <= oct31; i++) {
    for (const b of [1, 2, 4, 8, 16]) if (o.q[i] & b) bits[`b${b}`]++;
  }
  for (const k of Object.keys(bits)) bits[k] = rnd((bits[k] * 1000) / (oct31 - may1 + 1));
  let tSum = 0;
  let p = 0;
  let wet = 0;
  for (let i = may1; i <= sep30; i++) {
    tSum += (o.tmax[i] + o.tmin[i]) / 2;
    p += o.prcp[i];
    wet += o.wetH[i];
  }
  let lastFrost = MISSING;
  let firstFrost = MISSING;
  for (let i = 0; i < aug1; i++) if (o.tmin[i] <= 0) lastFrost = i;
  for (let i = aug1; i < o.n; i++) {
    if (o.tmin[i] <= 0) {
      firstFrost = i;
      break;
    }
  }
  let sev = 0;
  let sevEst = 0;
  for (let i = jun1; i <= sep15; i++) {
    sev += blitecastSeverity(o.wetH[i], o.wetT[i]);
    if (o.q[i] & Q.WETH_ESTIMATED) sevEst++;
  }
  const s0 = dayStartHour(y, 0);
  const s1 = dayStartHour(y + 1, 0);
  let hT = 0;
  let hTd = 0;
  for (let k = s0; k < s1 && k < N_HOURS; k++) {
    if (H.tSrc[k] === 1) hT++;
    if (H.tdSrc[k] === 1) hTd++;
  }
  return {
    ...bits,
    tmean: rnd(tSum / (sep30 - may1 + 1)),
    prcp: p,
    wetH: wet,
    lastFrost,
    firstFrost,
    sev,
    sevEst,
    sevRaw: seasonSeverity(Hraw, y).sev,
    rainN: diag?.n ?? 0,
    rainDd: diag?.dd ?? MISSING,
    rainSe: diag?.se ?? MISSING,
    rainSat: diag?.sat ?? MISSING,
    tdAdj: adj,
    sat97Raw: nearSaturationShare(Hraw, y),
    sat97: nearSaturationShare(H, y),
    hrT: rnd((hT * 1000) / (s1 - s0)),
    hrTd: rnd((hTd * 1000) / (s1 - s0)),
    fill: fills,
  };
}

// ---------------------------------------------------------------- output

export function serialize(result) {
  const j = JSON.stringify;
  const parts = [];
  for (const k of ['station', 'sources', 'built', 'fields']) parts.push(`${j(k)}:${j(result[k])}`);
  const yearLines = Object.entries(result.years).map(([y, o]) => `${j(y)}:{\n${YEAR_KEYS.map((k) => `${j(k)}:${j(o[k])}`).join(',\n')}}`);
  parts.push(`"years":{\n${yearLines.join(',\n')}}`);
  parts.push(`"normals":{\n${Object.entries(result.normals).map(([k, v]) => `${j(k)}:${j(v)}`).join(',\n')}}`);
  parts.push(`"playable":${j(result.playable)}`);
  parts.push(`"qa":{\n${Object.entries(result.qa).map(([y, v]) => `${j(y)}:${j(v)}`).join(',\n')}}`);
  parts.push(`"qaFields":${j(result.qaFields)}`);
  parts.push(`"method":${j(result.method)}`);
  return `{\n${parts.join(',\n')}\n}\n`;
}

// ---------------------------------------------------------------- check

export function check(text) {
  const errors = [];
  const err = (m) => {
    if (errors.length < 50) errors.push(m);
  };
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return [`not valid JSON: ${e.message}`];
  }
  const walk = (v, path) => {
    if (v === null) err(`${path} is null`);
    else if (typeof v === 'number' && !Number.isFinite(v)) err(`${path} is not finite`);
    else if (Array.isArray(v)) v.forEach((x, k) => walk(x, `${path}[${k}]`));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(data, '$');
  for (const k of ['station', 'sources', 'built', 'fields', 'years', 'normals', 'playable', 'qa']) if (!(k in data)) err(`missing top-level key ${k}`);
  if (errors.length) return errors;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.built))) err(`built is not an ISO date: ${data.built}`);
  const years = Object.keys(data.years).map(Number);
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) if (!years.includes(y)) err(`year ${y} missing`);
  const ints = (arr, path) => {
    const k = arr.findIndex((v) => !Number.isInteger(v));
    if (k >= 0) err(`${path}[${k}] = ${arr[k]} is not an integer`);
  };
  const playable = [];
  for (const y of years) {
    const o = data.years[y];
    const n = daysIn(y);
    if (o.n !== n) err(`${y}: n = ${o.n}, calendar says ${n}`);
    let ok = true;
    for (const k of YEAR_KEYS.slice(1)) {
      if (!Array.isArray(o[k]) || o[k].length !== n) {
        err(`${y}.${k} must be an array of ${n} entries`);
        ok = false;
        continue;
      }
      ints(o[k], `${y}.${k}`);
    }
    if (!ok) continue;
    for (let i = 0; i < n; i++) {
      const at = `${y} day ${i} (${isoDate(y, i)})`;
      if (!(o.tmax[i] >= o.tmin[i])) err(`${at}: tmax ${o.tmax[i]} < tmin ${o.tmin[i]}`);
      if (!(o.wetH[i] >= 0 && o.wetH[i] <= 24)) err(`${at}: wetH ${o.wetH[i]} outside 0-24`);
      if ((o.wetT[i] === MISSING) !== (o.wetH[i] === 0)) err(`${at}: wetT ${o.wetT[i]} with wetH ${o.wetH[i]}`);
      if (!(o.prcp[i] >= 0)) err(`${at}: prcp ${o.prcp[i]} < 0`);
      if (!(o.snow[i] >= 0 && o.snwd[i] >= 0)) err(`${at}: negative snow or snow depth`);
      if (!(o.rh[i] >= 0 && o.rh[i] <= 100)) err(`${at}: rh ${o.rh[i]} outside 0-100`);
      if (!(o.wind[i] >= 0)) err(`${at}: wind ${o.wind[i]} < 0`);
      if (!(o.wdir[i] === MISSING || (o.wdir[i] >= 1 && o.wdir[i] <= 360))) err(`${at}: wdir ${o.wdir[i]}`);
      if (!(o.cloud[i] === MISSING || (o.cloud[i] >= 0 && o.cloud[i] <= 80))) err(`${at}: cloud ${o.cloud[i]}`);
      if (!(o.et0[i] >= 0)) err(`${at}: et0 ${o.et0[i]} < 0`);
      if (!(o.dayl[i] > 0 && o.dayl[i] < 1440)) err(`${at}: dayl ${o.dayl[i]}`);
      if (!(o.q[i] >= 0 && o.q[i] <= 31)) err(`${at}: q ${o.q[i]} outside 0-31`);
    }
    if (isPlayable(o.q, y)) playable.push(y);
  }
  for (const k of ['tmax', 'tmin', 'prcp', 'wetH']) {
    const v = data.normals[k];
    if (!Array.isArray(v) || v.length !== 366) err(`normals.${k} must have 366 entries`);
    else ints(v, `normals.${k}`);
  }
  if (JSON.stringify(playable) !== JSON.stringify(data.playable)) err(`playable ${JSON.stringify(data.playable)} does not match the q bits (${JSON.stringify(playable)})`);
  return errors;
}

// ---------------------------------------------------------------- report

const fmtDay = (y, i) => (i === MISSING ? 'none' : isoDate(y, i).slice(5));
const c1 = (tenths) => (tenths / 10).toFixed(1);
const c2 = (hundredths) => (hundredths === MISSING ? '-' : (hundredths / 100).toFixed(2));
const pm = (v) => (v === MISSING ? '-' : (v / 10).toFixed(1));

export function spotCheck(result) {
  let tSum = 0;
  let tN = 0;
  let pSum = 0;
  for (let y = NORMALS_YEARS[0]; y <= NORMALS_YEARS[1]; y++) {
    const o = result.years[y];
    const jul1 = doyOf(y, 7, 1);
    for (let i = jul1; i < jul1 + 31; i++) {
      tSum += (o.tmax[i] + o.tmin[i]) / 2;
      tN++;
    }
    for (let i = doyOf(y, 5, 1); i <= doyOf(y, 9, 30); i++) pSum += o.prcp[i];
  }
  return { julyMeanC: Number((tSum / tN / 10).toFixed(2)), maySepPrcpMm: Number((pSum / (NORMALS_YEARS[1] - NORMALS_YEARS[0] + 1) / 10).toFixed(1)) };
}

export function rankings(result) {
  const { qa, playable } = result;
  const ranked = playable.map((y) => ({ y, sev: qa[y].sev, prcp: qa[y].prcp }));
  const bySev = [...ranked].sort((a, b) => b.sev - a.sev || a.y - b.y);
  const byPrcp = [...ranked].sort((a, b) => a.prcp - b.prcp || a.y - b.y);
  return {
    highestSeverity: bySev.slice(0, 8).map((r) => `${r.y} (${r.sev})`),
    lowestSeverity: bySev.slice(-8).reverse().map((r) => `${r.y} (${r.sev})`),
    driest: byPrcp.slice(0, 5).map((r) => `${r.y} (${c1(r.prcp)} mm)`),
    wettest: byPrcp.slice(-5).reverse().map((r) => `${r.y} (${c1(r.prcp)} mm)`),
    excluded: Object.keys(qa).map(Number).filter((y) => !playable.includes(y)),
  };
}

function replaceBlock(doc, name, body) {
  const begin = `<!-- BEGIN GENERATED: ${name} -->`;
  const end = `<!-- END GENERATED: ${name} -->`;
  const a = doc.indexOf(begin);
  const b = doc.indexOf(end);
  if (a < 0 || b < a) throw new Error(`report is missing the ${name} markers`);
  return `${doc.slice(0, a + begin.length)}\n${body}\n${doc.slice(b)}`;
}

function writeReport(result) {
  if (!existsSync(REPORT)) throw new Error(`${REPORT} not found`);
  const { qa, playable, method: m } = result;
  const years = Object.keys(qa).map(Number);
  const yesNo = (y) => (playable.includes(y) ? 'yes' : 'no');

  const quality = [
    '| Year | Hourly T measured % | Hourly Td measured % | May-Oct bit 1 % | bit 2 % | bit 4 % | bit 8 % | bit 16 % | Playable |',
    '|---|---|---|---|---|---|---|---|---|',
    ...years.map((y) => {
      const q = qa[y];
      return `| ${y} | ${pm(q.hrT)} | ${pm(q.hrTd)} | ${pm(q.b1)} | ${pm(q.b2)} | ${pm(q.b4)} | ${pm(q.b8)} | ${pm(q.b16)} | ${yesNo(y)} |`;
    }),
  ].join('\n');

  const sanity = [
    '| Year | Mean temp May-Sep (C) | Precip May-Sep (mm) | wetH May-Sep (h) | Last spring frost | First autumn frost | Blitecast severity Jun 1-Sep 15 | Estimated wetH days in that span | Severity without homogenization |',
    '|---|---|---|---|---|---|---|---|---|',
    ...years.map((y) => {
      const q = qa[y];
      return `| ${y}${playable.includes(y) ? '' : ' (not playable)'} | ${c1(q.tmean)} | ${c1(q.prcp)} | ${q.wetH} | ${fmtDay(y, q.lastFrost)} | ${fmtDay(y, q.firstFrost)} | ${q.sev} | ${q.sevEst} | ${q.sevRaw} |`;
    }),
  ].join('\n');

  const r = rankings(result);
  const lists = [
    `Ranked among the ${playable.length} playable years.`,
    '',
    `- Highest Blitecast severity totals (June 1-September 15): ${r.highestSeverity.join(', ')}`,
    `- Lowest: ${r.lowestSeverity.join(', ')}`,
    `- Driest May-September: ${r.driest.join(', ')}`,
    `- Wettest May-September: ${r.wettest.join(', ')}`,
    '',
    `Not playable: ${r.excluded.join(', ') || 'none'}.`,
  ].join('\n');

  const h = m.dewPointHomogenization;
  const nv = m.neighborValidation;
  const nbByYear = Object.fromEntries((nv?.perSeason ?? []).map((s) => [s.y, s]));
  const homog = [
    `Reference rain-hour depression: ${c2(h.refDd)} C, the median of the ${h.healthyYears.length} years whose sensor reported saturation in at least ${h.saturatingShare * 100} percent of rain hours (${h.healthyYears.join(', ')}). A year is shifted only when its depression differs from the reference by more than ${h.shiftMinSe} standard errors.`,
    '',
    '| Year | Rain hours | Mean T-Td in rain (C) | Standard error (C) | Rain hours saturated % | Td shift applied (C) | Jun-Aug days reaching 97% RH, before % | after % | Severity before | after | Presque Isle severity before | after |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...years.map((y) => {
      const q = qa[y];
      const nb = nbByYear[y];
      return `| ${y} | ${q.rainN} | ${c2(q.rainDd)} | ${c2(q.rainSe)} | ${pm(q.rainSat)} | ${c2(q.tdAdj)} | ${pm(q.sat97Raw)} | ${pm(q.sat97)} | ${q.sevRaw} | ${q.sev} | ${nb ? nb.nbRaw : '-'} | ${nb ? nb.nb : '-'} |`;
    }),
  ].join('\n');

  const v = m.nightFillValidation;
  const spot = spotCheck(result);
  const rule = m.wetRule;
  const pcName = ['0 (or trace)', '0.1-2.4 mm', '2.5-9.9 mm', '>= 10 mm'];
  const ruleRows = ['| Season | Wetter day precip | Range < 4 C | 4-6 | 6-8 | 8-10 | 10-12 | 12-14 | 14-16 | >= 16 C |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const season of ['warm', 'cold']) {
    for (let pc = 0; pc < PRCP_CLASSES.length; pc++) {
      const cells = DTR_CLASSES.map((_, dc) => {
        const c = rule.cells[`${season}|${pc}|${dc}`];
        return c ? `${c.wetH} h / ${c.dT >= 0 ? '+' : ''}${c1(c.dT)} C` : `(${rule.coarse[`${season}|${pc}`]?.wetH ?? '-'} h)`;
      });
      ruleRows.push(`| ${season === 'warm' ? 'Apr-Oct' : 'Nov-Mar'} | ${pcName[pc]} | ${cells.join(' | ')} |`);
    }
  }
  const fits = [
    `- Hourly-extreme offsets (GHCN minus the ISD-Lite hourly extreme, ${m.tempFromHourlyOffset.days} days with 24 measured hours): tmax ${c1(m.tempFromHourlyOffset.tmax)} C, tmin ${c1(m.tempFromHourlyOffset.tmin)} C.`,
    `- Overnight dew-point fill, tested on ${v.years[0]}-${v.years[1]} (May-October, ${v.days} days, dew point deleted ${v.maskedLst} LST every night and refilled): wetH mean absolute error ${v.wetHMae} h per day, bias ${v.wetHBias} h, identical on ${(v.wetHExactShare * 100).toFixed(1)} percent of days. Blitecast season totals (${v.seasons} complete seasons): mean ${v.severityMeanMeasured} measured, bias ${v.severityBias}, mean absolute error ${v.severityMae}, Spearman rank correlation ${v.severitySpearman}.`,
    `- Daily mean wind with the overnight hours (22:00-05:00 LST) deleted on ${m.windValidation.days} complete May-October days of ${v.years[0]}-${v.years[1]}: the plain mean of the remaining hours is biased by ${m.windValidation.biasPlainMs} m/s; the diurnal-cycle scaling leaves a bias of ${m.windValidation.biasAdjMs.toFixed(2)} m/s and a mean absolute error of ${m.windValidation.maeAdjMs.toFixed(2)} m/s.`,
    `- wetH estimation rule, two-fold cross-validation by odd and even years on May-October days (${m.wetRuleCv.days} days): mean absolute error ${m.wetRuleCv.maeH} h, bias ${m.wetRuleCv.biasH} h, against ${m.wetRuleCv.baselineMaeH} h for always predicting the May-October mean.`,
    nv
      ? `- Neighbor check against ${nv.station} (${nv.seasons} seasons where both stations have at least 95 percent of June 1-September 15 windows): Blitecast season totals correlate at Pearson ${nv.pearsonRaw} (Spearman ${nv.spearmanRaw}) before homogenization and ${nv.pearsonAdj} (Spearman ${nv.spearmanAdj}) after; mean absolute difference ${nv.meanAbsDiffRaw} before, ${nv.meanAbsDiffAdj} after.`
      : '- Presque Isle check: not run (no neighbor files).',
    `- Spot check, 1991-2020 from the output arrays: July mean temperature ${spot.julyMeanC} C; May-September precipitation ${spot.maySepPrcpMm} mm per year.`,
    ...(m.officialNormalsCheck
      ? [
          `- Against NOAA's published 1991-2020 monthly normals for the station: largest monthly difference ${m.officialNormalsCheck.maxAbsDiffTmaxC} C in mean tmax, ${m.officialNormalsCheck.maxAbsDiffTminC} C in mean tmin, ${m.officialNormalsCheck.maxAbsDiffPrcpMm} mm in monthly precipitation (NOAA's temperature normals include homogenization adjustments; these arrays are unadjusted).`,
          '',
          '| Month | Mean tmax (C) | NOAA | Mean tmin (C) | NOAA | Precip (mm) | NOAA |',
          '|---|---|---|---|---|---|---|',
          ...m.officialNormalsCheck.perMonth.map((r) => `| ${r.month} | ${r.tmaxC.toFixed(2)} | ${r.tmaxNoaaC.toFixed(2)} | ${r.tminC.toFixed(2)} | ${r.tminNoaaC.toFixed(2)} | ${r.prcpMm.toFixed(1)} | ${r.prcpNoaaMm.toFixed(1)} |`),
          '',
        ]
      : []),
    `- GHCN values rejected for a quality flag (1973-2025): ${Object.entries(m.ghcnQcRejected).map(([k, n]) => `${k} ${n}`).join(', ')}. ISD-Lite sky cover codes seen: ${Object.entries(m.isdSkyCodes).map(([k, n]) => `${k}: ${n}`).join(', ')}. Duplicate ISD-Lite hours dropped: ${m.isdDuplicates}.`,
    '',
    'wetH estimation table (estimated wetH / wetT minus that day\'s tmin):',
    '',
    ruleRows.join('\n'),
    '',
    `Cells with fewer than ${MIN_CELL_DAYS} training days fall back to the season and precipitation class mean, shown in parentheses.`,
    '',
    '| Year | Severity with measured overnight dew point | With the overnight fill |',
    '|---|---|---|',
    ...v.perSeason.map((s) => `| ${s.y} | ${s.measured} | ${s.filled} |`),
  ].join('\n');

  let doc = readFileSync(REPORT, 'utf8');
  doc = replaceBlock(doc, 'quality', quality);
  doc = replaceBlock(doc, 'sanity', sanity);
  doc = replaceBlock(doc, 'rankings', lists);
  doc = replaceBlock(doc, 'homogenization', homog);
  doc = replaceBlock(doc, 'fits', fits);
  writeFileSync(REPORT, doc);
}

// ---------------------------------------------------------------- main

function argValue(name) {
  const k = process.argv.indexOf(name);
  return k >= 0 ? process.argv[k + 1] : undefined;
}

function main() {
  if (process.argv.includes('--check')) {
    if (!existsSync(OUT)) throw new Error(`${OUT} does not exist`);
    const text = readFileSync(OUT, 'utf8');
    const errors = check(text);
    const bytes = statSync(OUT).size;
    const data = JSON.parse(text);
    let repro = 'skipped (data/raw not present)';
    if (existsSync(join(RAW, 'MANIFEST.json')) && existsSync(join(RAW, `${GHCN_ID}.csv`))) {
      const same = serialize(build({ date: data.built })) === text;
      repro = same ? 'rebuild from data/raw is byte-identical' : 'MISMATCH: rebuilding from data/raw gives different output';
      if (!same) errors.push(repro);
    }
    const nDays = Object.values(data.years ?? {}).reduce((a, o) => a + o.n, 0);
    process.stdout.write(
      `check: ${Object.keys(data.years ?? {}).length} years, ${nDays} days, ${bytes} bytes${bytes > SIZE_TARGET_BYTES ? ' (over the 1.3 MB target)' : ''}; ${data.playable?.length ?? 0} playable; ${repro}\n`,
    );
    if (errors.length) {
      process.stderr.write(`check FAILED (${errors.length} problems):\n${errors.map((e) => `  ${e}`).join('\n')}\n`);
      process.exit(1);
    }
    process.stdout.write('check: all invariants hold\n');
    return;
  }
  const date = argValue('--date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    process.stderr.write('usage: node tools/weather/build.mjs --date YYYY-MM-DD [--report] | --check\n');
    process.exit(2);
  }
  const result = build({ date });
  const text = serialize(result);
  const errors = check(text);
  if (errors.length) {
    process.stderr.write(`build produced invalid output:\n${errors.map((e) => `  ${e}`).join('\n')}\n`);
    process.exit(1);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  const spot = spotCheck(result);
  process.stdout.write(
    `build: wrote ${OUT} (${Buffer.byteLength(text)} bytes); ${result.playable.length} of ${Object.keys(result.years).length} years playable; 1991-2020 July mean ${spot.julyMeanC} C, May-Sep precipitation ${spot.maySepPrcpMm} mm\n`,
  );
  if (process.argv.includes('--report')) {
    writeReport(result);
    process.stdout.write(`build: updated the generated tables in ${REPORT}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`build failed: ${err.message}\n`);
    process.exit(1);
  }
}
