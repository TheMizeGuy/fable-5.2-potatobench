#!/usr/bin/env node
// Downloads the raw NOAA weather files for Caribou, ME into data/raw/ and
// writes data/raw/MANIFEST.json (url, bytes, sha256 per file).
// Files already present are kept; only their hashes are recomputed.
// Validation-only files: Presque Isle hourly data (20 km away) for the humidity
// homogenization, and NOAA's official 1991-2020 monthly normals for Caribou.
// Usage: node tools/weather/fetch.mjs [--force]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'data', 'raw');
const FIRST_YEAR = 1973;
const LAST_YEAR = 2025;
const ISD_ID = '727120-14607';
const GHCN_ID = 'USW00014607';
const NEIGHBOR_ISD_ID = '727130-14604';
const NEIGHBOR_FIRST_YEAR = 2004;
const USER_AGENT = 'weather-data-pipeline/1.0';
const CONCURRENCY = 6;

const isdLite = (id, first, role) =>
  Array.from({ length: LAST_YEAR - first + 1 }, (_, i) => {
    const y = first + i;
    return { file: `${id}-${y}.gz`, url: `https://noaa-isd-pds.s3.amazonaws.com/isd-lite/data/${y}/${id}-${y}.gz`, role };
  });

const SOURCES = [
  {
    file: `${GHCN_ID}.csv`,
    url: `https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/${GHCN_ID}.csv`,
    role: 'data',
  },
  ...isdLite(ISD_ID, FIRST_YEAR, 'data'),
  ...isdLite(NEIGHBOR_ISD_ID, NEIGHBOR_FIRST_YEAR, 'validation'),
  {
    file: `${GHCN_ID}-normals-monthly-1991-2020.csv`,
    url: `https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/${GHCN_ID}.csv`,
    role: 'validation',
  },
];

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function download(src) {
  const res = await fetch(src.url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${src.url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`${src.url}: empty body`);
  if (src.file.endsWith('.gz') && !(buf[0] === 0x1f && buf[1] === 0x8b)) {
    throw new Error(`${src.url}: not a gzip file`);
  }
  const dest = join(RAW, src.file);
  const part = `${dest}.part`;
  writeFileSync(part, buf);
  renameSync(part, dest);
  return { lastModified: res.headers.get('last-modified') ?? null };
}

async function main() {
  const force = process.argv.includes('--force');
  mkdirSync(RAW, { recursive: true });
  const manifestPath = join(RAW, 'MANIFEST.json');
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { files: [] };
  const prevByFile = new Map(previous.files.map((f) => [f.file, f]));

  const entries = new Array(SOURCES.length);
  let downloaded = 0;
  let skipped = 0;
  const queue = SOURCES.map((src, i) => ({ src, i }));
  async function worker() {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { src, i } = job;
      const dest = join(RAW, src.file);
      let lastModified = prevByFile.get(src.file)?.lastModified ?? null;
      if (!force && existsSync(dest) && statSync(dest).size > 0) {
        skipped++;
      } else {
        let attempt = 0;
        for (;;) {
          try {
            ({ lastModified } = await download(src));
            break;
          } catch (err) {
            if (++attempt >= 3) throw err;
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
        downloaded++;
        process.stdout.write(`downloaded ${src.file}\n`);
      }
      const buf = readFileSync(dest);
      entries[i] = { file: src.file, url: src.url, role: src.role, bytes: buf.length, sha256: sha256(buf), lastModified };
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const manifest = {
    station: { ghcn: GHCN_ID, isd: ISD_ID, name: 'CARIBOU MUNICIPAL AIRPORT, ME US' },
    neighbor: { isd: NEIGHBOR_ISD_ID, name: 'NORTHERN MAINE REGIONAL AIRPORT AT PRESQUE ISLE, ME US' },
    note: 'role "data" files feed caribou.json; role "validation" files (Presque Isle hourly data, NOAA 1991-2020 monthly normals) are only used for checks in the report. lastModified is the HTTP Last-Modified header at download time; the GHCN-Daily file is updated continuously.',
    files: entries,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const total = entries.reduce((s, e) => s + e.bytes, 0);
  process.stdout.write(
    `fetch: ${entries.length} files (${downloaded} downloaded, ${skipped} already present), ${total} bytes; manifest ${manifestPath}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`fetch failed: ${err.message}\n`);
  process.exit(1);
});
