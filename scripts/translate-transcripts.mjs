#!/usr/bin/env node
/**
 * Translate meeting transcripts from English to plain Californian Spanish.
 *
 * For each slim transcript, sends all utterances to Claude Sonnet for
 * translation, preserving the exact structure (start, end, speaker).
 * Translated text replaces English text; everything else stays the same.
 *
 * Output: artifacts/transcripts-slim/{date}-es.json (cached locally)
 *       → R2 transcripts/{date}-es.json (when --upload is passed)
 *
 * Usage:
 *   node scripts/translate-transcripts.mjs                    # all untranslated
 *   node scripts/translate-transcripts.mjs --date 2026-02-26  # single meeting
 *   node scripts/translate-transcripts.mjs --force            # retranslate all
 *   node scripts/translate-transcripts.mjs --upload           # generate + upload to R2
 *
 * Requires ANTHROPIC_API_KEY in environment.
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SLIM_DIR = resolve(ROOT, 'artifacts/transcripts-slim');

const args = process.argv.slice(2);
const force = args.includes('--force');
const doUpload = args.includes('--upload');
const dateFilter = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a professional translator specializing in plain, accessible Spanish for California communities. You translate English board meeting transcripts into Spanish.

STYLE GUIDELINES:
- Write at a sixth-grade reading level
- Use natural Californian Spanish — the kind spoken by families in Redwood City
- Prefer common borrowed English terms over formal literary Spanish (e.g., "budget" not "presupuesto general", "email" not "correo electrónico", "staff" is fine)
- Keep it conversational, matching the speaker's register (formal for superintendent, casual for parents)
- District jargon stays in English with natural integration: LCAP, SPSA, SARC, CAASPP, IEP, PBIS, MTSS, TK
- School names stay in English: Roosevelt, Hoover, Adelante Selby, McKinley, etc.
- Personal names stay exactly as-is
- "Board" = "Junta" or "Mesa Directiva", "Superintendent" = "Superintendente", "Trustee" = "Miembro de la Junta"
- "Roll call" = "Pasar lista", "Public comment" = "Comentario público"
- Dollar amounts, dates, and numbers stay in their original format

TASK:
You will receive a JSON array of utterances. Each has an index number and English text.
Return a JSON array of the SAME length with the Spanish translation for each utterance, in the same order.
Return ONLY the JSON array, no markdown fences or explanation.

Example input:
[{"i":0,"t":"Good evening, everyone. Let's call the meeting to order."},{"i":1,"t":"Here."}]

Example output:
["Buenas noches a todos. Vamos a iniciar la reunión.","Presente."]`;

async function translateMeeting(date) {
  const enPath = resolve(SLIM_DIR, `${date}.json`);
  const esPath = resolve(SLIM_DIR, `${date}-es.json`);

  if (!existsSync(enPath)) return null;
  if (!force && existsSync(esPath)) return 'cached';

  const en = JSON.parse(readFileSync(enPath, 'utf-8'));
  if (!en.utterances || en.utterances.length === 0) return 'empty';

  // Build compact input: just index + text
  const input = en.utterances.map((u, i) => ({ i, t: u.text }));
  const inputJson = JSON.stringify(input);

  // For very long transcripts, split into batches
  const MAX_CHARS = 30000; // Translate in medium-sized batches (~30k chars) to optimize speed and stay within output limits
  const batches = [];
  let currentBatch = [];
  let currentSize = 0;

  for (const item of input) {
    const itemSize = JSON.stringify(item).length;
    if (currentSize + itemSize > MAX_CHARS && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }
    currentBatch.push(item);
    currentSize += itemSize;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  const allTranslations = [];
  let totalInput = 0, totalOutput = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const batchJson = JSON.stringify(batch);

    // Use streaming to handle long requests
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 65536,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: batchJson }],
    });

    const response = await stream.finalMessage();
    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    const text = response.content[0].text;
    let translations;
    try {
      // Extract JSON array from response
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array in response');
      translations = JSON.parse(match[0]);
    } catch (err) {
      // Try to repair truncated JSON
      let repaired = text;
      const arrMatch = repaired.match(/\[[\s\S]*/);
      if (arrMatch) {
        repaired = arrMatch[0];
        // Remove trailing incomplete string
        repaired = repaired.replace(/,\s*"[^"]*$/, '');
        if (!repaired.endsWith(']')) repaired += ']';
        try {
          translations = JSON.parse(repaired);
        } catch {
          console.error(`  Batch ${b + 1}/${batches.length} FAILED: ${err.message}`);
          // Fill with original English as fallback
          translations = batch.map(item => item.t);
        }
      } else {
        translations = batch.map(item => item.t);
      }
    }

    // Pad if LLM returned fewer translations than expected
    while (translations.length < batch.length) {
      translations.push(batch[translations.length].t);
    }

    allTranslations.push(...translations.slice(0, batch.length));

    if (batches.length > 1) {
      process.stdout.write(`  batch ${b + 1}/${batches.length} `);
    }
  }

  // Build Spanish transcript with same structure
  const es = {
    ...en,
    lang: 'es',
    translatedFrom: 'en',
    utterances: en.utterances.map((u, i) => ({
      ...u,
      text: allTranslations[i] || u.text,
    })),
  };

  writeFileSync(esPath, JSON.stringify(es));

  const cost = (totalInput * 3 + totalOutput * 15) / 1_000_000;
  return { utterances: en.utterances.length, inputTokens: totalInput, outputTokens: totalOutput, cost };
}

// ---- Main ----

async function main() {
  const files = readdirSync(SLIM_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/) && !f.includes('-es'))
    .map(f => f.replace('.json', ''))
    .sort();

  const toProcess = dateFilter ? files.filter(d => d === dateFilter) : files;
  let translated = 0, cached = 0, errors = 0;
  let totalCost = 0;

  // Filter to uncached
  const needsWork = [];
  for (const date of toProcess) {
    const esPath = resolve(SLIM_DIR, `${date}-es.json`);
    const enPath = resolve(SLIM_DIR, `${date}.json`);
    if (!existsSync(enPath)) continue;
    if (!force && existsSync(esPath)) { cached++; continue; }
    needsWork.push(date);
  }

  console.log(`${needsWork.length} to translate (${cached} cached, ${toProcess.length} total)`);

  // Process in parallel batches of CONCURRENCY
  const CONCURRENCY = 10;
  for (let i = 0; i < needsWork.length; i += CONCURRENCY) {
    const batch = needsWork.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(date => translateMeeting(date)));

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const date = batch[j];
      if (r.status === 'rejected') {
        console.error(`${date}: ERROR ${r.reason?.message || r.reason}`);
        errors++;
        continue;
      }
      const result = r.value;
      if (result === 'cached') { cached++; continue; }
      if (result === null || result === 'empty') continue;
      if (typeof result === 'object') {
        translated++;
        totalCost += result.cost;
        console.log(`${date}: ${result.utterances} utt ($${result.cost.toFixed(3)})`);
      }
    }
    console.log(`  [${Math.min(i + CONCURRENCY, needsWork.length)}/${needsWork.length}] $${totalCost.toFixed(2)} so far`);
  }

  console.log(`\nDone: ${translated} translated, ${cached} cached, ${errors} errors`);
  console.log(`Total cost: $${totalCost.toFixed(2)}`);

  // Upload if requested
  if (doUpload) {
    let uploaded = 0;
    for (const date of toProcess) {
      const esPath = resolve(SLIM_DIR, `${date}-es.json`);
      if (!existsSync(esPath)) continue;
      try {
        execFileSync('npx', [
          'wrangler', 'r2', 'object', 'put',
          `rcsd-meetings/transcripts/${date}-es.json`,
          '--file', esPath,
          '--content-type', 'application/json',
          '--remote',
        ], { cwd: ROOT, timeout: 30000 });
        uploaded++;
      } catch (err) {
        console.error(`  Upload failed for ${date}: ${err.message}`);
      }
    }
    console.log(`Uploaded ${uploaded} Spanish transcripts to R2`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
