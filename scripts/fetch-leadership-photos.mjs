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
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'artifacts/trustees');
const FORCE = process.argv.includes('--force');

const data = JSON.parse(readFileSync(resolve(ROOT, 'data/trustees.json'), 'utf-8'));

// Collect every {photo, photoSource, photoCrop} across trustees, superintendent, cabinet.
const targets = [];
for (const t of data.trustees || []) {
  if (t.photo && t.photoSource) targets.push({ file: t.photo, url: t.photoSource, crop: t.photoCrop });
}
for (const key of ['current', 'incoming']) {
  const s = data.superintendent?.[key];
  if (s?.photo && s?.photoSource) targets.push({ file: s.photo, url: s.photoSource, crop: s.photoCrop });
}
for (const c of data.cabinet || []) {
  if (c.photo && c.photoSource) targets.push({ file: c.photo, url: c.photoSource, crop: c.photoCrop });
}

mkdirSync(OUT_DIR, { recursive: true });

// Center-crop an image to a "W:H" aspect ratio in place, using macOS `sips`.
// Some upstream headshots are 16:9 environmental portraits; the cards are
// portrait, so we crop to match the others rather than squashing in CSS.
// execFileSync (no shell) — args passed as an array, so the file path can't
// inject shell metacharacters even though it's project-controlled.
function cropToAspect(dest, ratio) {
  const [rw, rh] = ratio.split(':').map(Number);
  if (!rw || !rh) return;
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', dest]).toString();
  const w = +(out.match(/pixelWidth:\s*(\d+)/) || [])[1];
  const h = +(out.match(/pixelHeight:\s*(\d+)/) || [])[1];
  if (!w || !h) return;
  // Largest centered rectangle of the target ratio that fits the source.
  let cw = w, ch = Math.round(w * rh / rw);
  if (ch > h) { ch = h; cw = Math.round(h * rw / rh); }
  execFileSync('sips', ['-c', String(ch), String(cw), dest, '--out', dest], { stdio: 'ignore' });
}

let downloaded = 0, skipped = 0;
for (const { file, url, crop } of targets) {
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
  if (crop) cropToAspect(dest, crop);
  console.log(`Wrote artifacts/trustees/${file}${crop ? ` (cropped ${crop})` : ''}`);
  downloaded++;
}

console.log(`\nDone: ${downloaded} downloaded, ${skipped} cached. ${targets.length} total.`);
