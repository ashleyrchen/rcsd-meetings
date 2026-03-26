#!/usr/bin/env node
/**
 * Generate slim transcript JSONs from AAI transcripts and upload to R2.
 *
 * Each transcript is keyed by meeting date (not YouTube ID) for stable URLs.
 * Slim format: audio_duration + utterances (start, end, speaker, text) +
 * speaker map from chapter markers.
 *
 * Output: artifacts/transcripts-slim/{date}.json → R2 transcripts/{date}.json
 *
 * Usage:
 *   node scripts/publish-transcripts.mjs              # generate all
 *   node scripts/publish-transcripts.mjs --upload      # generate + upload to R2
 *   node scripts/publish-transcripts.mjs --date 2026-02-26
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const AAI_DIR = resolve(ROOT, 'artifacts/transcripts-aai');
const SLIM_DIR = resolve(ROOT, 'artifacts/transcripts-slim');
const DATA_PATH = resolve(ROOT, 'data/meetings-data.json');
const CHAPTER_PATH = resolve(ROOT, 'data/chapter-markers.json');

mkdirSync(SLIM_DIR, { recursive: true });

const args = process.argv.slice(2);
const doUpload = args.includes('--upload');
const filterDate = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

// Load meetings and chapter markers
const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
const chapterMarkers = existsSync(CHAPTER_PATH)
  ? JSON.parse(readFileSync(CHAPTER_PATH, 'utf-8'))
  : {};

let generated = 0;
let uploaded = 0;
let totalSize = 0;

for (const m of data.meetings) {
  if (filterDate && m.date !== filterDate) continue;
  if (!m.youtube || !m.hasTranscript) continue;

  const aaiPath = resolve(AAI_DIR, `${m.youtube}.json`);
  if (!existsSync(aaiPath)) continue;

  const aai = JSON.parse(readFileSync(aaiPath, 'utf-8'));
  if (!aai.utterances || aai.utterances.length === 0) continue;

  // Build speaker map from chapter markers (slug-keyed, with date fallback)
  const cm = chapterMarkers[m.slug] || chapterMarkers[m.date];
  const speakers = cm?.speakers || {};

  const slim = {
    date: m.date,
    type: m.type,
    videoId: m.youtube,
    audioDuration: Math.round(aai.audio_duration || 0),
    speakers,
    utterances: aai.utterances.map(u => ({
      start: u.start,
      end: u.end,
      speaker: u.speaker,
      text: u.text,
    })),
  };

  const json = JSON.stringify(slim);
  const outPath = resolve(SLIM_DIR, `${m.date}.json`);
  writeFileSync(outPath, json);
  totalSize += json.length;
  generated++;

  if (doUpload) {
    try {
      execFileSync('npx', [
        'wrangler', 'r2', 'object', 'put',
        `rcsd-meetings/transcripts/${m.date}.json`,
        '--file', outPath,
        '--content-type', 'application/json',
        '--remote',
      ], { cwd: ROOT, timeout: 30000 });
      uploaded++;
    } catch (err) {
      console.error(`  Upload failed for ${m.date}: ${err.message}`);
    }
  }
}

console.log(`Generated ${generated} slim transcripts (${(totalSize / 1024 / 1024).toFixed(1)}MB total)`);
if (doUpload) {
  console.log(`Uploaded ${uploaded} to R2 at transcripts/{date}.json`);
}
console.log(`Output: ${SLIM_DIR}`);
