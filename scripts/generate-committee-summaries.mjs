#!/usr/bin/env node
/**
 * Generate short bilingual (EN + ES) summaries of what each recorded committee
 * meeting actually discussed, from its transcript. Writes summaryEn / summaryEs /
 * summaryGeneratedAt onto the meeting in data/committees/<id>.json.
 *
 * AI-generated and labeled as such on the page. Idempotent: skips meetings that
 * already have a summary unless --force. Requires ANTHROPIC_API_KEY (.env).
 *
 * Usage:
 *   node scripts/generate-committee-summaries.mjs
 *   node scripts/generate-committee-summaries.mjs --force
 *   node scripts/generate-committee-summaries.mjs --date cboc-2025-11-05
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const COMMITTEES_DIR = resolve(ROOT, 'data/committees');
const SLIM_DIR = resolve(ROOT, 'artifacts/transcripts-slim');

const args = process.argv.slice(2);
const force = args.includes('--force');
const dateFilter = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

// Cap transcript text sent to the model (keeps cost bounded; a CBOC meeting is dense
// but the opening + body easily fit the gist of what was discussed).
const MAX_CHARS = 120000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set. Add it to .env or export it.');
  process.exit(1);
}
const client = new Anthropic();

function transcriptText(key) {
  const p = resolve(SLIM_DIR, `${key}.json`);
  if (!existsSync(p)) return null;
  const j = JSON.parse(readFileSync(p, 'utf-8'));
  const txt = (j.utterances || []).map((u) => u.text).join(' ');
  return txt.slice(0, MAX_CHARS);
}

async function summarize(committee, meeting) {
  const text = transcriptText(meeting.transcriptKey);
  if (!text) return null;

  const prompt = `You are writing a short summary for a public website (rcsd.info) describing what a Redwood City School District ${committee.nameEn} (CBOC) meeting on ${meeting.date} actually covered. This committee oversees Measure S and Measure T school bond spending.

Read the meeting transcript below and write a tight 2-sentence summary (about 40-55 words total) of the most important topics discussed and any decisions or votes — e.g. specific bond projects, construction/budget updates, audit or financial reports, approvals. Be concrete: name the standout project, dollar figure, or report. Skip procedural roll-call/approval-of-minutes filler. Do not start with "The committee" every time; vary phrasing. Keep it scannable for a meeting card, not exhaustive.

Return ONLY a compact JSON object: {"en": "...", "es": "..."} where "es" is a faithful Spanish translation in plain, sixth-grade Californian Spanish (keep terms families use: "CBOC", "Measure S", "bond"). No markdown, no extra keys.

Transcript:
${text}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  let raw = response.content[0].text.trim();
  // Strip accidental code fences
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const obj = JSON.parse(raw);
  if (!obj.en || !obj.es) throw new Error('missing en/es in model output');
  return obj;
}

const stamp = new Date().toISOString().slice(0, 10);
let generated = 0, skipped = 0, errors = 0;

for (const file of readdirSync(COMMITTEES_DIR).filter((f) => f.endsWith('.json'))) {
  const path = resolve(COMMITTEES_DIR, file);
  const c = JSON.parse(readFileSync(path, 'utf-8'));
  let changed = false;

  for (const m of c.meetings || []) {
    if (!m.hasTranscript || !m.transcriptKey) continue;
    if (dateFilter && m.transcriptKey !== dateFilter && m.date !== dateFilter) continue;
    if (m.summaryEn && !force) { skipped++; continue; }
    try {
      const s = await summarize(c, m);
      if (!s) { errors++; continue; }
      m.summaryEn = s.en;
      m.summaryEs = s.es;
      m.summaryGeneratedAt = stamp;
      changed = true;
      generated++;
      console.log(`  ${m.transcriptKey}: ${s.en.slice(0, 80)}…`);
    } catch (err) {
      errors++;
      console.error(`  ${m.transcriptKey}: FAILED ${err.message}`);
    }
  }

  if (changed) writeFileSync(path, JSON.stringify(c, null, 2) + '\n');
}

console.log(`\ncommittee summaries: ${generated} generated, ${skipped} cached, ${errors} errors.`);
