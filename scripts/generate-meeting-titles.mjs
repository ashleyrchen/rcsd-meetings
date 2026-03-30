#!/usr/bin/env node
/**
 * Generate short 2-5 word titles for each board meeting.
 * Uses Claude Haiku via the Anthropic API for cost efficiency.
 *
 * Input: data/meeting-summaries.json, data/meetings-data.json
 * Output: data/meeting-titles.json
 *
 * Format: {"2026-04-01": {"en": "Roy Cloud & Clifford", "es": "Roy Cloud y Clifford"}, ...}
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const summaries = JSON.parse(readFileSync(resolve(ROOT, 'data/meeting-summaries.json'), 'utf-8'));
const meetingsData = JSON.parse(readFileSync(resolve(ROOT, 'data/meetings-data.json'), 'utf-8'));

// Build a map from summary key to meeting metadata
const meetingsByKey = {};
for (const m of meetingsData.meetings) {
  // The summary key is either the slug (for multi-meeting dates) or the date
  const sameDateCount = meetingsData.meetings.filter(x => x.date === m.date).length;
  const key = sameDateCount > 1 ? m.slug : m.date;
  meetingsByKey[key] = m;
}

const client = new Anthropic();

// Process in batches to avoid rate limits
const BATCH_SIZE = 30;
const keys = Object.keys(summaries);

const titles = {};

console.log(`Generating titles for ${keys.length} meetings...`);

for (let i = 0; i < keys.length; i += BATCH_SIZE) {
  const batch = keys.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(keys.length / BATCH_SIZE);
  console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} meetings)...`);

  // Build the prompt with all meetings in this batch
  const entries = batch.map(key => {
    const m = meetingsByKey[key];
    const type = m ? m.type : 'Regular';
    const summary = summaries[key];
    return `KEY: ${key}\nTYPE: ${type}\nSUMMARY: ${summary}`;
  }).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Generate short 2-5 word titles (ideally 3 words) for each board meeting below. The title should capture the most distinctive/newsworthy item, not routine business.

Rules:
1. 2-5 words, ideally 3
2. Capture the most distinctive/newsworthy item, not routine business
3. Use school short names (Taft, Roy Cloud, Kennedy, MIT, Orion, Adelante Selby, Clifford, Hoover, Roosevelt, Henry Ford, Garfield, North Star) when school presentations are the main event
4. For meetings with multiple big items, pick the most significant one
5. Don't include "Board Meeting" or dates
6. For closed sessions that only discuss superintendent evaluation, use "Superintendent Evaluation"
7. For officer rotation meetings, use "Officer Rotation"
8. For retreats, use "Board Retreat" or topic if clear
9. For study sessions, use the topic discussed
10. Keep proper nouns (school names, program names) in English

For each meeting, provide BOTH English and Spanish titles. Spanish titles should:
- Keep school names and proper nouns in English
- Translate connectors: "&" → "y", "and" → "y"
- Translate common words: "Budget" → "Presupuesto", "Vote" → "Voto", "Search" → "Búsqueda", etc.
- Keep it natural and short

Respond with ONLY a JSON object, no other text. Format:
{"KEY1": {"en": "English Title", "es": "Spanish Title"}, "KEY2": ...}

Here are the meetings:

${entries}`
    }]
  });

  // Parse the response
  const text = response.content[0].text.trim();
  let parsed;
  try {
    // Try to extract JSON from the response (may have markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (e) {
    console.error(`Failed to parse batch ${batchNum}:`, e.message);
    console.error('Response text:', text.slice(0, 500));
    continue;
  }

  // Merge into titles
  for (const [key, value] of Object.entries(parsed)) {
    titles[key] = value;
  }

  // Small delay between batches to be polite to the API
  if (i + BATCH_SIZE < keys.length) {
    await new Promise(r => setTimeout(r, 500));
  }
}

console.log(`Generated ${Object.keys(titles).length} titles`);

// Write output
const outputPath = resolve(ROOT, 'data/meeting-titles.json');
writeFileSync(outputPath, JSON.stringify(titles, null, 2) + '\n');
console.log(`Wrote ${outputPath}`);
