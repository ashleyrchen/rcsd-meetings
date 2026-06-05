#!/usr/bin/env node
/**
 * Download board-trustee and district-leadership headshots referenced by
 * data/trustees.json (the `photoSource` fields) into artifacts/trustees/.
 *
 * Idempotent: skips files that already exist unless --force is passed.
 * artifacts/ is gitignored and synced to R2 (https://data.rcsd.info/trustees/)
 * by scripts/upload-to-r2.mjs.
 *
 * Source: RCSD Finalsite CDN headshots, mirrored for provenance + stability
 * (the district page hotlinks volatile Cloudinary transform URLs).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'artifacts/trustees');
const FORCE = process.argv.includes('--force');

const data = JSON.parse(readFileSync(resolve(ROOT, 'data/trustees.json'), 'utf-8'));

// Collect every {photo, photoSource} pair across trustees, superintendent, cabinet.
const targets = [];
for (const t of data.trustees || []) {
  if (t.photo && t.photoSource) targets.push({ file: t.photo, url: t.photoSource });
}
for (const key of ['current', 'incoming']) {
  const s = data.superintendent?.[key];
  if (s?.photo && s?.photoSource) targets.push({ file: s.photo, url: s.photoSource });
}
for (const c of data.cabinet || []) {
  if (c.photo && c.photoSource) targets.push({ file: c.photo, url: c.photoSource });
}

mkdirSync(OUT_DIR, { recursive: true });

let downloaded = 0, skipped = 0;
for (const { file, url } of targets) {
  const dest = resolve(OUT_DIR, file);
  if (existsSync(dest) && !FORCE) { skipped++; continue; }
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAIL ${file}: HTTP ${res.status} ${url}`);
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`Wrote artifacts/trustees/${file} (${(buf.length / 1024).toFixed(0)} KB)`);
  downloaded++;
}

console.log(`\nDone: ${downloaded} downloaded, ${skipped} cached. ${targets.length} total.`);
