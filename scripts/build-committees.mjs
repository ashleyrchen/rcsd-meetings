#!/usr/bin/env node
/**
 * Enrich data/committees/<id>.json files with discovered recordings + transcript status.
 *
 * For each committee file it:
 *   1. Merges committee-tagged entries from data/youtube-index.json (kind === committee id)
 *      into meetings[], joining by date so curated fields (time, location, descriptions,
 *      agenda/minutes) are preserved.
 *   2. Sets transcriptKey = "<id>-<date>" for any meeting that has a recording.
 *   3. Derives hasTranscript / duration / durationSeconds from the AAI cache (shared lib).
 *   4. Derives status ('past' once the date has passed, else 'scheduled').
 *   5. Sorts meetings newest-first and writes back — only if content changed (idempotent).
 *
 * Curated committee metadata (name, description, members, etc.) is never touched.
 *
 * Usage: node scripts/build-committees.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hasTranscript, getDurationFromTranscript } from './lib/aai.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const COMMITTEES_DIR = resolve(ROOT, 'data/committees');
const YT_INDEX = resolve(ROOT, 'data/youtube-index.json');

// Today (UTC date) for past/scheduled classification.
const today = new Date().toISOString().slice(0, 10);

if (!existsSync(COMMITTEES_DIR)) {
  console.log('No data/committees/ directory — nothing to build.');
  process.exit(0);
}

// Group discovered recordings by committee kind: { cboc: [{id,date,title}, ...] }
const recordingsByKind = {};
if (existsSync(YT_INDEX)) {
  const ytIndex = JSON.parse(readFileSync(YT_INDEX, 'utf-8'));
  for (const v of ytIndex) {
    const kind = v.kind ?? 'board';
    if (kind === 'board') continue;
    (recordingsByKind[kind] ||= []).push(v);
  }
}

let written = 0;
let unchanged = 0;

for (const file of readdirSync(COMMITTEES_DIR).filter((f) => f.endsWith('.json'))) {
  const path = resolve(COMMITTEES_DIR, file);
  const c = JSON.parse(readFileSync(path, 'utf-8'));
  const before = JSON.stringify(c);

  // Index curated meetings by date so discovery merges rather than duplicates.
  const byDate = new Map((c.meetings || []).map((m) => [m.date, { ...m }]));

  // Merge discovered recordings (kind === committee id) in by date.
  for (const rec of recordingsByKind[c.id] || []) {
    const m = byDate.get(rec.date) || { date: rec.date };
    if (!m.youtube) m.youtube = rec.id;
    if (!m.title) m.title = rec.title;
    byDate.set(rec.date, m);
  }

  // Enrich + normalize every meeting.
  const meetings = [...byDate.values()].map((m) => {
    const out = { ...m };
    out.status = m.date <= today ? 'past' : 'scheduled';
    if (out.youtube) {
      out.transcriptKey = `${c.id}-${out.date}`;
      out.hasTranscript = hasTranscript(out.youtube);
      const dur = getDurationFromTranscript(out.youtube);
      out.duration = dur ? dur.display : null;
      out.durationSeconds = dur ? dur.seconds : null;
    }
    return out;
  });
  meetings.sort((a, b) => b.date.localeCompare(a.date));
  c.meetings = meetings;

  // Only bump lastUpdated + rewrite when the meaningful content changed.
  const stripStamp = (obj) => {
    const clone = JSON.parse(JSON.stringify(obj));
    if (clone._metadata) delete clone._metadata.lastUpdated;
    return JSON.stringify(clone);
  };
  if (stripStamp({ ...c }) === stripStamp(JSON.parse(before))) {
    unchanged++;
    continue;
  }
  c._metadata = c._metadata || {};
  c._metadata.lastUpdated = today;
  writeFileSync(path, JSON.stringify(c, null, 2) + '\n');
  const withVideo = meetings.filter((m) => m.youtube).length;
  const withTx = meetings.filter((m) => m.hasTranscript).length;
  console.log(`  ${c.id}: ${meetings.length} meetings (${withVideo} recorded, ${withTx} transcribed)`);
  written++;
}

console.log(`build-committees: ${written} updated, ${unchanged} unchanged.`);
