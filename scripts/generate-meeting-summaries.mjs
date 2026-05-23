#!/usr/bin/env node
/**
 * Generate concise per-meeting summaries for meetings that don't have them yet.
 * Uses Claude Haiku to produce 1-2 sentence summaries from agenda item titles.
 * Generates both English and Spanish summaries in a single API call.
 *
 * Output: data/meeting-summaries.json (EN), data/meeting-summaries-es.json (ES)
 *
 * Idempotent — skips meetings that already have summaries in both files.
 * Rate-limited with small delays between API calls.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load .env for API key
config({ path: resolve(ROOT, '.env') });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set. Add it to .env or export it.');
  process.exit(1);
}

const client = new Anthropic();

// Load data
const meetingsData = JSON.parse(readFileSync(resolve(ROOT, 'data/meetings-data.json'), 'utf-8'));
const enPath = resolve(ROOT, 'data/meeting-summaries.json');
const esPath = resolve(ROOT, 'data/meeting-summaries-es.json');
const enSummaries = JSON.parse(readFileSync(enPath, 'utf-8'));
const esSummaries = JSON.parse(readFileSync(esPath, 'utf-8'));

// Procedural items to skip when building context for the LLM
const SKIP_PATTERNS = [
  /^roll call$/i,
  /^pledge of allegiance/i,
  /^call to order/i,
  /^adjournment/i,
  /^approval of the agenda/i,
  /^approval of agenda/i,
  /^additions.*deletions.*modifications/i,
  /^welcome by the school board/i,
  /^if you have public comment/i,
  /^closed session$/i,
  /^report out on closed session/i,
  /^changes to the agenda/i,
  /^reconvene to (open|regular)/i,
  /^recess/i,
  /^board member reports/i,
  /^superintendent.*report$/i,
  /^future (agenda|board)/i,
];

function isProceduralItem(title) {
  return SKIP_PATTERNS.some(p => p.test(title.trim()));
}

// Find meetings that need summaries
// Summaries are keyed by date string (e.g., "2024-03-06")
// When multiple meetings share a date, we use the slug as key
function getSummaryKey(meeting, allMeetings) {
  const sameDateMeetings = allMeetings.filter(m => m.date === meeting.date);
  if (sameDateMeetings.length > 1) {
    return meeting.slug;
  }
  return meeting.date;
}

const args = process.argv.slice(2);
const refreshNoMinutes = args.includes('--refresh-no-minutes') || args.includes('--refresh');
const targetDates = args.filter(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg));

const allMeetings = meetingsData.meetings;

// Delete specific entries to force regeneration if CLI args specify
for (const meeting of allMeetings) {
  const key = getSummaryKey(meeting, allMeetings);
  const hasMinutes = !!(meeting.minutes && (meeting.minutes.documents?.length > 0 || meeting.minutes.approvedAt));
  
  const shouldRefresh = 
    (refreshNoMinutes && !hasMinutes) ||
    targetDates.includes(meeting.date) ||
    targetDates.includes(meeting.slug) ||
    targetDates.includes(key);

  if (shouldRefresh) {
    delete enSummaries[key];
    delete enSummaries[meeting.date];
    delete enSummaries[meeting.slug];
    delete esSummaries[key];
    delete esSummaries[meeting.date];
    delete esSummaries[meeting.slug];
  }
}

const enKeys = new Set(Object.keys(enSummaries));
const esKeys = new Set(Object.keys(esSummaries));

const needsSummary = allMeetings.filter(m => {
  const key = getSummaryKey(m, allMeetings);
  // Also check both date and slug in case existing summaries use either
  return !(enKeys.has(key) || enKeys.has(m.date) || enKeys.has(m.slug))
      || !(esKeys.has(key) || esKeys.has(m.date) || esKeys.has(m.slug));
});

console.log(`Total meetings: ${allMeetings.length}`);
console.log(`Existing EN summaries: ${enKeys.size}`);
console.log(`Existing ES summaries: ${esKeys.size}`);
console.log(`Meetings needing summaries: ${needsSummary.length}`);

if (needsSummary.length === 0) {
  console.log('All meetings already have summaries. Nothing to do.');
  process.exit(0);
}

// Sort by date ascending (oldest first)
needsSummary.sort((a, b) => a.date.localeCompare(b.date));

let generated = 0;
let skipped = 0;
let errors = 0;

for (const meeting of needsSummary) {
  const key = getSummaryKey(meeting, allMeetings);

  // Double-check idempotency (in case we already generated it in this run)
  if (enSummaries[key] && esSummaries[key]) {
    skipped++;
    continue;
  }

  // Filter to substantive items
  const items = (meeting.items || []).filter(it => !isProceduralItem(it.title));

  if (items.length === 0) {
    // No substantive items — generate a minimal summary
    const typeLabel = meeting.type || 'meeting';
    enSummaries[key] = `${typeLabel} with no public agenda items listed.`;
    esSummaries[key] = `${typeLabel} sin puntos de agenda pública listados.`;
    generated++;
    console.log(`[${generated}] ${key} — no items, wrote minimal summary`);
    continue;
  }

  // Build item list for the prompt
  const itemList = items.map((it, i) => {
    let line = `${i + 1}. ${it.title}`;
    if (it.category && it.category !== it.title) {
      line += ` [${it.category}]`;
    }
    if (it.actionType && it.actionType !== 'Procedural') {
      line += ` (${it.actionType})`;
    }
    return line;
  }).join('\n');

  const dateStr = meeting.date;
  const typeStr = meeting.type || 'Board Meeting';

  const hasMinutes = !!(meeting.minutes && (meeting.minutes.documents?.length > 0 || meeting.minutes.approvedAt));
  const tenseInstruction = hasMinutes
    ? '8. Formal, approved meeting minutes exist for this meeting. You MUST write in a decisive past tense (e.g., "The Board approved multiple agreements..." or "The Board adopted the budget..."). Write the Spanish summary in matching decisive past tense (e.g., "La Junta aprobó múltiples acuerdos..." or "La Junta adoptó el presupuesto...").'
    : '8. No formal, approved meeting minutes exist for this meeting (either because it is scheduled in the future or because the minutes have not been approved/parsed yet). You MUST write in speculative, agenda-focused, or planned tense, describing what is scheduled, proposed, or planned to be discussed or voted on. Do NOT use decisive past-tense language like "approved" or "adopted" as the final outcome is not formally verified. Use phrases like "The agenda proposed...", "The Board was scheduled to consider...", "The Board will consider...", or "The meeting scheduled discussion of...". Write the Spanish summary in matching speculative or future tense (e.g., "La agenda propuso...", "La Junta tenía programado considerar...", "La Junta considerará...", or "La reunión programó la discusión de..."). Do NOT use "La Junta aprobó..." or "La Junta adoptó...".';

  const prompt = `You are writing a concise summary for a school board meeting card on a public website (rcsd.info) for the Redwood City School District.

Meeting date: ${dateStr}
Meeting type: ${typeStr}

Agenda items:
${itemList}

Instructions:
1. Write a 1-2 sentence summary highlighting the most notable/interesting agenda items discussed. Skip routine procedural items.
2. Be specific about topics — include school names, dollar amounts, policy numbers, program names, and resolution numbers when they appear in the items.
3. Use <strong> tags around important terms (school names, dollar amounts, policy numbers, program names) for emphasis.
4. Keep it concise — this appears as preview text on a meeting card.
5. Do NOT include HTML other than <strong> tags. No links, no lists.
6. For closed sessions: note the general topics discussed (e.g., "personnel matters", "litigation", "property negotiations") without revealing confidential details.
7. For retreats/study sessions: describe the focus topic.
8. ${tenseInstruction}

Respond with exactly this JSON format (no markdown code fences, just raw JSON):
{
  "en": "English summary here",
  "es": "Spanish summary here (sixth-grade Californian Spanish — simple, colloquial, natural)"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try extracting JSON from markdown code block
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error(`Could not parse response: ${text.slice(0, 200)}`);
      }
    }

    if (!parsed.en || !parsed.es) {
      throw new Error(`Missing en or es in response: ${JSON.stringify(parsed).slice(0, 200)}`);
    }

    enSummaries[key] = parsed.en;
    esSummaries[key] = parsed.es;
    generated++;

    console.log(`[${generated}] ${key} — ${parsed.en.slice(0, 100)}...`);

    // Rate limit: 200ms delay between calls
    await new Promise(r => setTimeout(r, 200));

    // Save periodically (every 10 meetings) in case of interruption
    if (generated % 10 === 0) {
      writeFileSync(enPath, JSON.stringify(enSummaries, null, 2) + '\n');
      writeFileSync(esPath, JSON.stringify(esSummaries, null, 2) + '\n');
      console.log(`  (saved progress: ${generated} summaries so far)`);
    }

  } catch (err) {
    errors++;
    console.error(`ERROR on ${key}: ${err.message}`);
    // Continue to next meeting
    continue;
  }
}

// Sort keys chronologically before writing
function sortSummaries(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    sorted[k] = obj[k];
  }
  return sorted;
}

// Final save
writeFileSync(enPath, JSON.stringify(sortSummaries(enSummaries), null, 2) + '\n');
writeFileSync(esPath, JSON.stringify(sortSummaries(esSummaries), null, 2) + '\n');

console.log(`\nDone. Generated: ${generated}, Skipped: ${skipped}, Errors: ${errors}`);
console.log(`EN summaries: ${Object.keys(enSummaries).length}`);
console.log(`ES summaries: ${Object.keys(esSummaries).length}`);
