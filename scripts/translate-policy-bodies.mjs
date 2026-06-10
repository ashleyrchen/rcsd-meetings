#!/usr/bin/env node
/**
 * Translate board policy BODY TEXT (contentText) to Spanish via the
 * Claude API, for the /politicas/ interactive browser.
 *
 * Input:  data/board-policies/{code}-{type}.json (from scrape-board-policies.mjs)
 *         data/policy-titles-es.json             (from translate-policy-titles.mjs)
 * Output: data/board-policies-es/{code}-{type}.json — one file per policy,
 *         mirroring the data/board-policies/ filenames:
 *   {
 *     code, type,
 *     titleEs,         // from policy-titles-es.json, for consistency
 *     contentTextEs,   // the translated body
 *     _metadata: { model, generatedAt, method, sourceFile, sourceHash, note }
 *   }
 *
 * Footnotes / legal citations and crossRefs are NOT translated — statute
 * names and code strings stay as-is (the prompt also pins citation strings
 * embedded in the body text verbatim).
 *
 * One policy per API request (bodies are long; batching policies into one
 * request risks truncation and cross-contamination). Policies over
 * CHUNK_THRESHOLD_CHARS are split into chunks at paragraph boundaries and
 * reassembled with their original separators, byte-exact.
 *
 * Idempotent: a policy is skipped when its ES file exists AND the stored
 * _metadata.sourceHash matches the sha256 of the current English
 * contentText. Use --force to retranslate everything. Partial output is
 * fine — the site falls back to English for any policy without an ES file.
 *
 * Flags: --force        retranslate even when the cache is fresh
 *        --limit N      only process the first N pending policies (testing)
 *
 * Requires ANTHROPIC_API_KEY (.env).
 */

import 'dotenv/config';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INPUT_DIR = resolve(ROOT, 'data', 'board-policies');
const OUTPUT_DIR = resolve(ROOT, 'data', 'board-policies-es');
const TITLES_PATH = resolve(ROOT, 'data', 'policy-titles-es.json');

const FORCE = process.argv.includes('--force');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity;

// Task spec for this dataset names Sonnet explicitly; Claude model ids have
// no date suffix (claude-api skill, models table cached 2026-05-26).
const MODEL = 'claude-sonnet-4-6';
// Pricing per million tokens for claude-sonnet-4-6, from the claude-api
// skill's model table (cached 2026-05-26): $3 input / $15 output.
const INPUT_USD_PER_MTOK = 3.0;
const OUTPUT_USD_PER_MTOK = 15.0;

// Bodies over this size are split at paragraph boundaries and translated in
// multiple requests. 20KB English ≈ ~5K tokens in and ~7K tokens out
// (Spanish runs ~10-25% longer), comfortably under MAX_TOKENS. This is more
// conservative than the task spec's 30KB trigger; only a handful of the 619
// policies exceed it (the largest, 5144.1-AR, is 51KB → 3 chunks).
const MAX_CHUNK_CHARS = 20000;
// Output ceiling per request. The largest unchunked body (~30KB ≈ 7.5K
// tokens) translates to well under this; streaming avoids HTTP timeouts at
// this size (claude-api skill: stream anything that may run long).
const MAX_TOKENS = 32000;
// Six requests in flight at once (task spec). Single-threaded JS, so the
// shared usage/cost counters need no locking.
const CONCURRENCY = 6;

// Validation bounds (task spec): translated length must be 0.5x-2.0x the
// source, paragraph count within ±30%, and the text must not open with
// translator meta-commentary.
const LEN_RATIO_MIN = 0.5;
const LEN_RATIO_MAX = 2.0;
const PARA_RATIO_TOLERANCE = 0.3;
const META_COMMENTARY_RE =
  /^(here (is|are)|here's|i('ve| have) translated|sure[,!]|certainly|aqu[ií] (est[aá]|tienes)|esta es la traducci[oó]n|a continuaci[oó]n,? (se presenta|la traducci[oó]n))/i;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set. Add it to .env or export it.');
  process.exit(1);
}

const SYSTEM_PROMPT = `You translate the body text of school board policy documents for the Redwood City School District (a TK-8 public district in Redwood City, California) from English to Spanish.

Audience: Spanish-speaking families in Redwood City, California. Use plain, natural Spanish as spoken in California / Mexico (es-MX). These are legal policy documents, so accuracy comes first: translate faithfully and plainly — do not simplify, summarize, embellish, or editorialize.

Rules:
- Translate the COMPLETE text. Never summarize, condense, or skip passages.
- Preserve the document structure exactly: keep every paragraph break where the original has one, and keep list markers, numbering, and lettering schemes unchanged ((a), (b), 1., 2., A., i., "- " bullets, etc.).
- Keep legal citation strings VERBATIM in English, exactly as written: e.g. "Education Code 35160", "20 USC 6312", "5 CCR 4622", "Government Code 54950", court case names, and bill numbers. Do not translate the names of codes, statutes, or regulations.
- Keep proper nouns, program names, and law names recognizable (e.g. "Williams", "Title IX", "Brown Act", "ESEA"). Keep "Charter" as "Charter" — that is what local families call these schools.
- "Board" here is the school board: use "Mesa Directiva" when it appears. "Superintendent" is "Superintendente".
- Prefer terms California districts actually use with families (e.g. "Asistencia escolar" for attendance, "Quejas" for complaints, "Procedimientos uniformes de quejas" for Uniform Complaint Procedures).
- Output ONLY the translated text. No preamble, no notes, no meta-commentary, no markdown fences.`;

const client = new Anthropic();

const usageTotals = { input: 0, output: 0 };

function runningCost() {
  return (usageTotals.input * INPUT_USD_PER_MTOK + usageTotals.output * OUTPUT_USD_PER_MTOK) / 1e6;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function paragraphCount(text) {
  return text.split(/\n{2,}/).filter(p => p.trim().length > 0).length;
}

/**
 * Split text into chunks at paragraph boundaries, remembering the separator
 * that followed each chunk so reassembly reproduces the original layout
 * byte-exactly: chunks.map((c, i) => translated[i] + c.sep).join('').
 * A single paragraph larger than maxChars stays whole (still far below
 * MAX_TOKENS); no such paragraph exists in the current corpus.
 */
function splitIntoChunks(text, maxChars) {
  if (text.length <= maxChars) return [{ text, sep: '' }];
  const parts = text.split(/(\n{2,})/); // [para, sep, para, sep, ..., para]
  const units = [];
  for (let i = 0; i < parts.length; i += 2) {
    units.push({ para: parts[i], sep: parts[i + 1] || '' });
  }
  const groups = [];
  let cur = [];
  let curLen = 0;
  for (const u of units) {
    if (curLen > 0 && curLen + u.para.length > maxChars) {
      groups.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(u);
    curLen += u.para.length + u.sep.length;
  }
  if (cur.length > 0) groups.push(cur);
  return groups.map(g => ({
    // Trailing separator is held out of the request (models trim trailing
    // whitespace) and restored at reassembly.
    text: g.map((u, i) => (i === g.length - 1 ? u.para : u.para + u.sep)).join(''),
    sep: g[g.length - 1].sep,
  }));
}

async function translateChunk(text) {
  // Streaming keeps long responses clear of SDK HTTP timeouts; no system
  // cache_control — the prompt prefix is ~500 tokens, below Sonnet 4.6's
  // 2048-token cacheable minimum, so a breakpoint would silently no-op.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Translate this board policy text to Spanish:\n\n${text}`,
    }],
  });
  const response = await stream.finalMessage();

  usageTotals.input += response.usage.input_tokens;
  usageTotals.output += response.usage.output_tokens;

  if (response.stop_reason !== 'end_turn') {
    throw new Error(`unexpected stop_reason "${response.stop_reason}"`);
  }
  const out = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  if (!out.trim()) throw new Error('empty translation');
  return out.trim();
}

/** Validate the assembled translation against the English source. */
function validateTranslation(source, translated) {
  if (!translated.trim()) return 'empty output';
  const ratio = translated.length / source.length;
  if (ratio < LEN_RATIO_MIN || ratio > LEN_RATIO_MAX) {
    return `length ratio ${ratio.toFixed(2)} outside ${LEN_RATIO_MIN}-${LEN_RATIO_MAX}`;
  }
  const srcParas = paragraphCount(source);
  const outParas = paragraphCount(translated);
  const lo = Math.floor(srcParas * (1 - PARA_RATIO_TOLERANCE));
  const hi = Math.ceil(srcParas * (1 + PARA_RATIO_TOLERANCE));
  if (outParas < lo || outParas > hi) {
    return `paragraph count ${outParas} outside ±30% of source ${srcParas} (${lo}-${hi})`;
  }
  if (META_COMMENTARY_RE.test(translated.trimStart())) {
    return `starts with meta-commentary: "${translated.slice(0, 60)}..."`;
  }
  return null;
}

async function translatePolicy(source) {
  const chunks = splitIntoChunks(source, MAX_CHUNK_CHARS);
  const translated = [];
  for (const chunk of chunks) {
    translated.push(await translateChunk(chunk.text));
  }
  const assembled = translated.map((t, i) => t + chunks[i].sep).join('');
  const problem = validateTranslation(source, assembled);
  if (problem) throw new Error(problem);
  return { assembled, chunkCount: chunks.length };
}

async function main() {
  const titlesData = JSON.parse(readFileSync(TITLES_PATH, 'utf-8'));
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = readdirSync(INPUT_DIR).filter(f => f.endsWith('.json')).sort();
  console.log(`Found ${files.length} policy files in data/board-policies/.`);

  const pending = [];
  let cached = 0;
  let emptySources = 0;

  for (const file of files) {
    const policy = JSON.parse(readFileSync(resolve(INPUT_DIR, file), 'utf-8'));
    const source = policy.contentText || '';
    if (!source.trim()) {
      console.warn(`  Skipping ${file}: empty contentText (nothing to translate; site falls back to English).`);
      emptySources++;
      continue;
    }
    const hash = sha256(source);
    const outPath = resolve(OUTPUT_DIR, file);
    if (!FORCE && existsSync(outPath)) {
      const prev = JSON.parse(readFileSync(outPath, 'utf-8'));
      if (prev._metadata?.sourceHash === hash) {
        cached++;
        continue;
      }
    }
    pending.push({ file, policy, source, hash, outPath });
  }

  const work = pending.slice(0, LIMIT);
  console.log(`Cached (source unchanged): ${cached}. Empty sources: ${emptySources}. To translate: ${work.length}${Number.isFinite(LIMIT) ? ` (of ${pending.length} pending, --limit ${LIMIT})` : ''}.`);

  let done = 0;
  let written = 0;
  const failures = [];
  let next = 0;

  async function worker() {
    while (next < work.length) {
      const job = work[next++];
      const { file, policy, source, hash, outPath } = job;
      const key = file.replace(/\.json$/, '');
      const titleEs = titlesData.titles?.[key]?.es ?? null;
      if (titleEs === null) {
        console.warn(`  ${key}: no Spanish title in policy-titles-es.json; titleEs will be null.`);
      }

      let result = null;
      let lastError = null;
      // Retry once on failure or validation miss, then skip (partial output
      // is fine per the contract — the site falls back to English).
      for (let attempt = 1; attempt <= 2 && !result; attempt++) {
        try {
          result = await translatePolicy(source);
        } catch (err) {
          lastError = err.message;
          if (attempt === 1) console.warn(`  ${key}: attempt 1 failed (${err.message}), retrying...`);
        }
      }

      done++;
      if (!result) {
        failures.push({ key, reason: lastError });
        console.warn(`  ${key}: FAILED after retry (${lastError}) — skipped.`);
        continue;
      }

      const output = {
        code: policy.code,
        type: policy.type,
        titleEs,
        contentTextEs: result.assembled,
        _metadata: {
          model: MODEL,
          generatedAt: new Date().toISOString(),
          method: `AI translation of contentText via the Claude API (scripts/translate-policy-bodies.mjs); one policy per request, bodies over ${MAX_CHUNK_CHARS / 1000}KB split at paragraph boundaries into ${result.chunkCount > 1 ? result.chunkCount + ' chunks' : 'chunks'} and reassembled; validated for length, paragraph structure, and meta-commentary`,
          sourceFile: `data/board-policies/${file}`,
          sourceHash: hash,
          note: 'Machine translation. The English Simbli version is authoritative.',
        },
      };
      writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
      written++;
      console.log(`  [${done}/${work.length}] ${key} (${source.length} chars${result.chunkCount > 1 ? `, ${result.chunkCount} chunks` : ''}) — running cost $${runningCost().toFixed(2)}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log('\n=== Summary ===');
  console.log(`Written: ${written}. Cached: ${cached}. Empty sources skipped: ${emptySources}. Failures: ${failures.length}.`);
  for (const f of failures) console.log(`  FAILED ${f.key}: ${f.reason}`);
  const cost = runningCost();
  console.log(`Token usage: ${usageTotals.input} in, ${usageTotals.output} out ≈ $${cost.toFixed(2)} (${MODEL} at $${INPUT_USD_PER_MTOK}/$${OUTPUT_USD_PER_MTOK} per MTok)`);
}

main().catch(err => {
  console.error('Translation failed:', err.message);
  process.exit(1);
});
