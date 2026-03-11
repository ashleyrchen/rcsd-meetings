#!/usr/bin/env node
/**
 * Generate concise per-school board meeting summaries from raw agenda item titles.
 * Uses Claude Haiku to rewrite verbose titles into short, school-focused summaries.
 * Output: data/school-board-summaries.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const rawItems = JSON.parse(readFileSync('/tmp/board-items-raw.json', 'utf-8'));

const client = new Anthropic();

// Build per-school item lists
const bySchool = {};
for (const item of rawItems) {
  for (const slug of item.schools) {
    if (!bySchool[slug]) bySchool[slug] = [];
    bySchool[slug].push({ date: item.date, title: item.title });
  }
}

const SCHOOL_NAMES = {
  'adelante-selby': 'Adelante Selby',
  'clifford': 'Clifford',
  'garfield': 'Garfield',
  'henry-ford': 'Henry Ford',
  'hoover': 'Hoover',
  'kennedy': 'Kennedy',
  'mckinley-mit': 'McKinley',
  'north-star': 'North Star',
  'orion': 'Orion',
  'roosevelt': 'Roosevelt',
  'roy-cloud': 'Roy Cloud',
  'taft': 'Taft',
};

const result = {};

for (const [slug, items] of Object.entries(bySchool)) {
  const schoolName = SCHOOL_NAMES[slug];
  console.log(`Processing ${schoolName} (${items.length} items)...`);

  const itemList = items.map((it, i) =>
    `${i + 1}. [${it.date}] ${it.title}`
  ).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are summarizing school board agenda items for ${schoolName} School's profile page on a public school district website.

For each item below, write a concise summary (1 short sentence, max ~15 words) focused on what's relevant to ${schoolName} specifically. Also write the Spanish translation.

Rules:
- Focus on what matters for THIS school. If the item covers multiple schools, only mention what affects ${schoolName}.
- Use plain language (no jargon, no resolution numbers, no contract legalese).
- Drop dollar amounts unless they're specific to this school.
- For HVAC/construction items, just say what was done (e.g., "HVAC Phase 1 completed" not the full contract details).
- For safety plans that cover all schools, just say "Annual safety plan approved."
- For presentations, say "Annual school presentation to the Board."
- Keep it factual and neutral.

Items:
${itemList}

Respond with a JSON array in this exact format (no markdown, just raw JSON):
[
  { "date": "YYYY-MM-DD", "en": "Concise English summary", "es": "Resumen conciso en español" },
  ...
]

Return exactly ${items.length} entries in the same order as the input.`
    }]
  });

  const text = response.content[0].text.trim();
  let summaries;
  try {
    summaries = JSON.parse(text);
  } catch (e) {
    // Try extracting JSON from markdown code block
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      summaries = JSON.parse(match[0]);
    } else {
      console.error(`Failed to parse response for ${slug}:`, text.slice(0, 200));
      continue;
    }
  }

  if (summaries.length !== items.length) {
    console.warn(`Warning: ${slug} got ${summaries.length} summaries for ${items.length} items`);
  }

  // Key by "date|original-title" for matching in build script
  for (let i = 0; i < Math.min(summaries.length, items.length); i++) {
    const key = items[i].date + '|' + items[i].title;
    if (!result[key]) result[key] = {};
    result[key][slug] = {
      en: summaries[i].en,
      es: summaries[i].es,
    };
  }
}

const outPath = resolve(ROOT, 'data/school-board-summaries.json');
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\nWrote ${Object.keys(result).length} item summaries to ${outPath}`);
