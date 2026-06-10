#!/usr/bin/env node
/**
 * Translate board policy TITLES (and section names) to Spanish via the
 * Claude API, for the /politicas/ interactive browser.
 *
 * Input:  data/policies-index.json (from scrape-board-policies.mjs)
 * Output: data/policy-titles-es.json
 *   {
 *     _metadata: { source, method, model, generatedAt, note },
 *     sections:  { "0000": { en, es }, ... },   // keyed by section code
 *     titles:    { "0100-BP": { en, es }, ... } // keyed by `${code}-${type}`
 *   }
 *
 * Idempotent: re-runs only translate entries that are missing from the
 * cache or whose stored English title no longer matches the index (i.e.
 * the policy was renamed upstream). Use --force to retranslate everything.
 *
 * Duplicate English titles (e.g. "Dress And Grooming" appears under four
 * codes) are translated once and fanned out, so wording stays consistent.
 *
 * Requires ANTHROPIC_API_KEY (.env).
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INDEX_PATH = resolve(ROOT, 'data', 'policies-index.json');
const OUTPUT_PATH = resolve(ROOT, 'data', 'policy-titles-es.json');

const FORCE = process.argv.includes('--force');

// Task spec for this dataset names Sonnet explicitly; Claude model ids have
// no date suffix (claude-api skill, models table cached 2026-05-26).
const MODEL = 'claude-sonnet-4-6';
// Titles are short; 50/request keeps each response well under max_tokens
// while amortizing the (cached) system prompt.
const BATCH_SIZE = 50;
const MAX_TOKENS = 4096;
// Pricing per million tokens for claude-sonnet-4-6, from the claude-api
// skill's model table (cached 2026-05-26): $3 input / $15 output.
const INPUT_USD_PER_MTOK = 3.0;
const OUTPUT_USD_PER_MTOK = 15.0;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set. Add it to .env or export it.');
  process.exit(1);
}

const SYSTEM_PROMPT = `You translate the titles of school board policy documents for the Redwood City School District (a TK-8 public district in Redwood City, California) from English to Spanish.

Audience: Spanish-speaking families in Redwood City, California. The site's register is plain, colloquial Californian Spanish — but these are legal document names, so accuracy comes first; a formal-ish title is fine.

Rules:
- Translate the meaning precisely. Do not summarize, expand, or editorialize.
- Use standard Spanish capitalization: capitalize the first word and proper nouns only.
- Keep proper nouns, program names, and law names recognizable (e.g. "Williams", "Title IX", "Brown Act"). Keep "Charter" as "Charter" — that is what local families call these schools.
- "Board" here is the school board: use "Mesa Directiva" when it appears.
- Prefer terms California districts actually use with families (e.g. "Asistencia escolar" for attendance, "Quejas" for complaints).
- "Uniform Complaint Procedures" is California's UCP, where "uniform" means standardized — translate as "Procedimientos uniformes de quejas", never as clothing uniforms. Apply the same reading to other "Uniform ... Procedures" titles.
- Return ONLY the translations in the requested JSON structure, one entry per input id, same ids.`;

// Structured-output schema: guarantees parseable JSON from the model.
// (Count/id validation still happens client-side per batch.)
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          es: { type: 'string' },
        },
        required: ['id', 'es'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
};

const client = new Anthropic();

const usageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

async function translateBatch(items, attempt = 1) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // No cache_control: the prompt prefix is ~350 tokens, below Sonnet 4.6's
    // 2048-token cacheable minimum, so a breakpoint would silently no-op.
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{
      role: 'user',
      content: `Translate these policy titles to Spanish:\n${JSON.stringify(items, null, 1)}`,
    }],
  });

  usageTotals.input += response.usage.input_tokens;
  usageTotals.output += response.usage.output_tokens;
  usageTotals.cacheRead += response.usage.cache_read_input_tokens || 0;
  usageTotals.cacheWrite += response.usage.cache_creation_input_tokens || 0;

  const text = response.content.find(b => b.type === 'text')?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    parsed = null;
  }

  // Validate: exactly the requested ids, each exactly once, non-empty Spanish.
  const wanted = new Set(items.map(it => it.id));
  const got = parsed?.translations || [];
  const valid =
    got.length === items.length &&
    got.every(t => wanted.has(t.id) && typeof t.es === 'string' && t.es.trim().length > 0) &&
    new Set(got.map(t => t.id)).size === got.length;

  if (!valid) {
    if (attempt >= 2) {
      throw new Error(`Batch failed validation twice (wanted ${items.length}, got ${got.length}).`);
    }
    console.warn(`  Batch validation failed (attempt ${attempt}), retrying...`);
    return translateBatch(items, attempt + 1);
  }

  return Object.fromEntries(got.map(t => [t.id, t.es.trim()]));
}

async function main() {
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
  const sections = index.sections || [];
  const policies = index.policies || [];

  // Load prior run (cache). An entry is reusable if its stored English title
  // still matches the current index — otherwise the policy was renamed and
  // we retranslate it.
  let cache = { sections: {}, titles: {} };
  if (!FORCE && existsSync(OUTPUT_PATH)) {
    const prev = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    cache = { sections: prev.sections || {}, titles: prev.titles || {} };
  }

  const outSections = {};
  const outTitles = {};

  // Collect unique English strings still needing translation.
  // pendingByEn: english string -> list of {kind, key} slots to fill.
  const pendingByEn = new Map();
  const addPending = (en, slot) => {
    if (!pendingByEn.has(en)) pendingByEn.set(en, []);
    pendingByEn.get(en).push(slot);
  };

  for (const sec of sections) {
    const cached = cache.sections[sec.code];
    if (cached && cached.en === sec.name) {
      outSections[sec.code] = cached;
    } else {
      addPending(sec.name, { kind: 'section', key: sec.code });
    }
  }

  for (const pol of policies) {
    const key = `${pol.code}-${pol.type}`;
    const cached = cache.titles[key];
    if (cached && cached.en === pol.title) {
      outTitles[key] = cached;
    } else {
      addPending(pol.title, { kind: 'title', key });
    }
  }

  const uniqueEn = [...pendingByEn.keys()];
  console.log(`Sections: ${sections.length}, policies: ${policies.length}.`);
  console.log(`Cached: ${Object.keys(outSections).length + Object.keys(outTitles).length} entries; ` +
    `${uniqueEn.length} unique strings to translate (covering ` +
    `${[...pendingByEn.values()].reduce((n, s) => n + s.length, 0)} entries).`);

  if (uniqueEn.length > 0) {
    const items = uniqueEn.map((en, i) => ({ id: `T${String(i).padStart(4, '0')}`, en }));
    const idToEn = new Map(items.map(it => [it.id, it.en]));

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      console.log(`Translating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)} (${batch.length} titles)...`);
      const translations = await translateBatch(batch);
      for (const [id, es] of Object.entries(translations)) {
        const en = idToEn.get(id);
        for (const slot of pendingByEn.get(en)) {
          const entry = { en, es };
          if (slot.kind === 'section') outSections[slot.key] = entry;
          else outTitles[slot.key] = entry;
        }
      }
    }
  }

  // Sanity: every section and policy in the index must now be covered.
  const missing = [
    ...sections.filter(s => !outSections[s.code]).map(s => `section ${s.code}`),
    ...policies.filter(p => !outTitles[`${p.code}-${p.type}`]).map(p => `${p.code}-${p.type}`),
  ];
  if (missing.length > 0) {
    throw new Error(`Missing translations after run: ${missing.slice(0, 10).join(', ')}`);
  }

  const output = {
    _metadata: {
      source: 'data/policies-index.json (scraped from https://simbli.eboardsolutions.com/Policy/PolicyListing.aspx?S=36030397)',
      method: `AI translation of policy titles and section names via the Claude API (scripts/translate-policy-titles.mjs); batched ${BATCH_SIZE}/request with structured JSON output; duplicate English titles translated once for consistency`,
      model: MODEL,
      generatedAt: new Date().toISOString(),
      note: 'Machine-generated Spanish translations of official English policy titles. Titles only — policy body text is not translated. May contain errors; the English titles and Simbli are authoritative.',
    },
    sections: Object.fromEntries(Object.entries(outSections).sort(([a], [b]) => a.localeCompare(b))),
    titles: Object.fromEntries(Object.entries(outTitles).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true }))),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(outTitles).length} titles + ${Object.keys(outSections).length} sections to ${OUTPUT_PATH}`);

  const cost = (usageTotals.input * INPUT_USD_PER_MTOK + usageTotals.output * OUTPUT_USD_PER_MTOK) / 1e6;
  console.log(`Token usage: ${usageTotals.input} in (${usageTotals.cacheRead} cache-read, ${usageTotals.cacheWrite} cache-write), ${usageTotals.output} out ≈ $${cost.toFixed(4)} (${MODEL} at $${INPUT_USD_PER_MTOK}/$${OUTPUT_USD_PER_MTOK} per MTok)`);
}

main().catch(err => {
  console.error('Translation failed:', err.message);
  process.exit(1);
});
