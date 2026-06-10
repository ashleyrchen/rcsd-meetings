#!/usr/bin/env node
/**
 * Generate one-sentence summaries (English AND Spanish) for every board
 * policy, for the redesigned /policies/ + /politicas/ index pages.
 *
 * Input:  data/board-policies/*.json (from scrape-board-policies.mjs)
 * Output: data/policy-summaries.json
 *   {
 *     _metadata: { source, method, model, generatedAt, note },
 *     summaries: {
 *       "0100-BP": {
 *         title: "Philosophy",          // English title at generation time
 *         en: "Requires the Board to ...",
 *         es: "Exige que la Mesa Directiva ...",
 *         sourceHash: "<sha256 of full contentText>"
 *       },
 *       ...
 *     }
 *   }
 *
 * One API request per policy returns BOTH languages as structured JSON,
 * so the two summaries are guaranteed to describe the same substance.
 *
 * Idempotent: entries whose stored sourceHash matches the sha256 of the
 * policy's current contentText are reused; only new/changed policies hit
 * the API. Use --force to regenerate everything. Policies with empty
 * contentText (scanned PDF exhibits with no extracted text) are skipped
 * with a warning — summarizing without source text would be guessing.
 *
 * Each summary is validated (non-empty, single sentence, length cap,
 * Spanish actually Spanish, no "This policy..." opener); one retry with
 * the validation errors fed back, then skip-with-warning.
 *
 * Requires ANTHROPIC_API_KEY (.env).
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync, openSync, closeSync, unlinkSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const POLICIES_DIR = resolve(ROOT, 'data', 'board-policies');
const OUTPUT_PATH = resolve(ROOT, 'data', 'policy-summaries.json');
const LOCK_PATH = resolve(ROOT, 'tmp', 'generate-policy-summaries.lock');

const FORCE = process.argv.includes('--force');

// Task spec for this dataset names Sonnet explicitly; Claude model ids have
// no date suffix (claude-api skill, models table cached 2026-05-26).
const MODEL = 'claude-sonnet-4-6';
// Pricing per million tokens for claude-sonnet-4-6, from the claude-api
// skill's model table (cached 2026-05-26): $3 input / $15 output.
const INPUT_USD_PER_MTOK = 3.0;
const OUTPUT_USD_PER_MTOK = 15.0;
// Two one-sentence summaries — 1024 tokens is generous headroom.
const MAX_TOKENS = 1024;
// 6 parallel requests: fast enough for ~600 policies without brushing
// against per-minute rate limits.
const CONCURRENCY = 6;
// Cost/quality tradeoff: a one-sentence summary doesn't need the whole
// legal text. Policies open with their purpose and core requirements, so
// the first ~8,000 chars (~2,000 tokens) carry the substance; the tail is
// procedure detail and boilerplate. 92 of 619 policies exceed this cap.
const CONTENT_CHAR_LIMIT = 8000;
// Ask the model for <=160 chars (fits the index-page card design);
// validation rejects only past 220 so near-misses don't burn retries.
const TARGET_CHARS = 160;
const HARD_CHAR_LIMIT = 220;
// Write partial results to disk every N completions so an interrupted run
// resumes from the cache instead of starting over.
const CHECKPOINT_EVERY = 50;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set. Add it to .env or export it.');
  process.exit(1);
}

const SYSTEM_PROMPT = `You write one-sentence summaries of school board policy documents for the Redwood City School District (a TK-8 public school district in Redwood City, California), in BOTH English and Spanish.

Audience: a busy parent reading at a sixth-grade level. Each summary answers one question: what does this policy actually do or require?

Rules for BOTH languages:
- Exactly ONE sentence, at most ${TARGET_CHARS} characters. No second sentence, no stacked clauses chained with semicolons.
- Start with the substance — usually a verb. NEVER open with "This policy...", "Esta política...", "The district...", or a restatement of the title.
  Good EN: "Requires the Board to adopt long-term district goals with measurable benchmarks."
  Good ES: "Exige que la Mesa Directiva adopte metas de largo plazo con estándares medibles."
- Be concrete and plain: say who must do what. No legal boilerplate, no "pursuant to", no Education Code section numbers.
- Avoid abbreviations written with periods (write "United States", not "U.S.") so the sentence contains exactly one period, at the end.
- BP (Board Policy) states what the Board requires or commits to; AR (Administrative Regulation) spells out how staff carry it out — reflect that in the verb you choose.

Spanish register:
- Colloquial Californian/Mexican Spanish at a sixth-grade level — the way district staff actually talk with families, not literary Spanish.
- "Board" is "la Mesa Directiva". Keep "Charter" as "Charter". Prefer borrowed terms families actually use over formal equivalents.
- Use the tú form if a sentence addresses the reader directly (most summaries won't address anyone).
- The Spanish summary must carry the same substance as the English one, written as natural Spanish — not word-for-word translated English.

Return ONLY the requested JSON object with "en" and "es".`;

// Structured-output schema: guarantees parseable JSON from the model.
// (Sentence-shape / length / language validation still happens client-side.)
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    en: { type: 'string', description: 'One-sentence English summary' },
    es: { type: 'string', description: 'One-sentence Spanish summary' },
  },
  required: ['en', 'es'],
  additionalProperties: false,
};

const client = new Anthropic();

const usageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const runningCostUsd = () =>
  (usageTotals.input * INPUT_USD_PER_MTOK + usageTotals.output * OUTPUT_USD_PER_MTOK) / 1e6;

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// Crude single-language Spanish check: an accented/inverted-punctuation char
// OR a common Spanish stopword. Cheap, but reliably rejects English output.
const SPANISH_HINT_RE = /[áéíóúñüÁÉÍÓÚÑÜ¿¡]|\b(el|la|los|las|que|de|del|para|con|por|una?|se|sus?|debe[n]?|cada|cuando|escuelas?|distrito)\b/i;

/**
 * Validate one summary string. Returns a list of problems (empty = valid).
 */
function validateSummary(text, lang) {
  const problems = [];
  const t = (text || '').trim();
  if (t.length === 0) {
    problems.push(`${lang}: empty`);
    return problems;
  }
  if (t.length > HARD_CHAR_LIMIT) {
    problems.push(`${lang}: ${t.length} chars (max ${HARD_CHAR_LIMIT})`);
  }
  // One sentence: the only period allowed is the final character. A period
  // followed by more content means a second sentence (or a dotted
  // abbreviation, which the prompt also bans).
  if (/\.\s*\S/.test(t)) {
    problems.push(`${lang}: contains a mid-string period (must be one sentence)`);
  }
  if (lang === 'en' && /^(this policy|this regulation|the policy)\b/i.test(t)) {
    problems.push('en: opens with "This policy..." style filler');
  }
  if (lang === 'es' && /^(esta política|esta norma|este reglamento|la política)\b/i.test(t)) {
    problems.push('es: opens with "Esta política..." style filler');
  }
  if (lang === 'es' && !SPANISH_HINT_RE.test(t)) {
    problems.push('es: does not look like Spanish');
  }
  return problems;
}

/**
 * One API request -> { en, es } for a single policy. Throws on validation
 * failure after one retry (caller records the skip).
 */
async function summarizePolicy(policy, attempt = 1, priorProblems = []) {
  const truncated = policy.contentText.length > CONTENT_CHAR_LIMIT
    ? policy.contentText.slice(0, CONTENT_CHAR_LIMIT) + '\n[... text truncated ...]'
    : policy.contentText;

  const typeLabel = policy.type === 'BP' ? 'Board Policy' : 'Administrative Regulation';
  let prompt = `Summarize this policy in one sentence each in English and Spanish.\n\n` +
    `Code: ${policy.code}\nType: ${policy.type} (${typeLabel})\nTitle: ${policy.title}\n\n` +
    `Policy text:\n${truncated}`;
  if (priorProblems.length > 0) {
    prompt += `\n\nYour previous answer failed validation: ${priorProblems.join('; ')}. ` +
      `Fix those problems — one sentence per language, under ${TARGET_CHARS} characters, ` +
      `single trailing period, no dotted abbreviations, no "This policy..." opener.`;
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // No cache_control: the system prompt is well under Sonnet 4.6's
    // 2048-token cacheable minimum, so a breakpoint would silently no-op.
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });

  usageTotals.input += response.usage.input_tokens;
  usageTotals.output += response.usage.output_tokens;
  usageTotals.cacheRead += response.usage.cache_read_input_tokens || 0;
  usageTotals.cacheWrite += response.usage.cache_creation_input_tokens || 0;

  const text = response.content.find((b) => b.type === 'text')?.text || '';
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* handled below as a validation failure */
  }

  const problems = parsed
    ? [...validateSummary(parsed.en, 'en'), ...validateSummary(parsed.es, 'es')]
    : ['response was not parseable JSON'];

  if (problems.length > 0) {
    if (attempt >= 2) {
      throw new Error(problems.join('; '));
    }
    console.warn(`  ${policy.code}-${policy.type}: validation failed (${problems.join('; ')}), retrying...`);
    return summarizePolicy(policy, attempt + 1, problems);
  }

  return { en: parsed.en.trim(), es: parsed.es.trim() };
}

function loadPolicies() {
  return readdirSync(POLICIES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const p = JSON.parse(readFileSync(resolve(POLICIES_DIR, f), 'utf-8'));
      return {
        code: p.code,
        title: p.title,
        type: p.type,
        contentText: (p.contentText || '').trim(),
      };
    })
    .sort((a, b) => `${a.code}-${a.type}`.localeCompare(`${b.code}-${b.type}`, undefined, { numeric: true }));
}

function writeOutput(summaries) {
  const output = {
    _metadata: {
      source: 'data/board-policies/*.json (scraped from https://simbli.eboardsolutions.com/Policy/PolicyListing.aspx?S=36030397 by scrape-board-policies.mjs)',
      method: `AI-generated one-sentence summaries via the Claude API (scripts/generate-policy-summaries.mjs); one request per policy returning English and Spanish together as structured JSON; policy text truncated to the first ${CONTENT_CHAR_LIMIT} chars as a cost/quality tradeoff; sourceHash is the sha256 of the full (untruncated) contentText for cache invalidation`,
      model: MODEL,
      generatedAt: new Date().toISOString(),
      note: 'Machine-generated summaries for the policy index pages. They simplify and may omit nuance; the full policy text on Simbli is authoritative. Spanish summaries are AI-generated, not official district translations.',
    },
    summaries: Object.fromEntries(
      Object.entries(summaries).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    ),
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
}

async function main() {
  // Single-instance lock: two concurrent runs would checkpoint-overwrite each
  // other's output (each only knows its own results). O_EXCL create fails if
  // the lock exists; a stale lock (crashed run) must be removed by hand.
  let lockFd;
  try {
    lockFd = openSync(LOCK_PATH, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(`Another run appears active (${LOCK_PATH} exists). ` +
        'If no other generate-policy-summaries.mjs process is running, delete the lock file and retry.');
    }
    throw err;
  }
  const releaseLock = () => {
    try { closeSync(lockFd); unlinkSync(LOCK_PATH); } catch { /* already gone */ }
  };
  process.on('exit', releaseLock);
  process.on('SIGINT', () => { releaseLock(); process.exit(130); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(143); });

  const policies = loadPolicies();

  let cache = {};
  if (!FORCE && existsSync(OUTPUT_PATH)) {
    cache = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8')).summaries || {};
  }

  const summaries = {};
  const pending = [];
  const skippedEmpty = [];

  for (const pol of policies) {
    const key = `${pol.code}-${pol.type}`;
    if (pol.contentText.length === 0) {
      skippedEmpty.push(key);
      continue;
    }
    const hash = sha256(pol.contentText);
    const cached = cache[key];
    if (cached && cached.sourceHash === hash && cached.en && cached.es) {
      summaries[key] = { title: pol.title, en: cached.en, es: cached.es, sourceHash: hash };
    } else {
      pending.push({ ...pol, key, hash });
    }
  }

  console.log(`Policies: ${policies.length}. Cached: ${Object.keys(summaries).length}. ` +
    `To generate: ${pending.length}. No extractable text (skipped): ${skippedEmpty.length}.`);
  for (const key of skippedEmpty) {
    console.warn(`  Skipping ${key}: contentText is empty (scanned PDF exhibit) — no summary generated.`);
  }

  const failed = [];
  let done = 0;

  // Fixed-size worker pool: CONCURRENCY workers pull from a shared cursor.
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= pending.length) return;
      const pol = pending[idx];
      try {
        const { en, es } = await summarizePolicy(pol);
        summaries[pol.key] = { title: pol.title, en, es, sourceHash: pol.hash };
      } catch (err) {
        failed.push(pol.key);
        console.warn(`  SKIPPED ${pol.key} after retry: ${err.message}`);
      }
      done++;
      if (done % CHECKPOINT_EVERY === 0) {
        writeOutput(summaries); // checkpoint so an interrupted run resumes
        console.log(`  [${done}/${pending.length}] ${usageTotals.input} in / ${usageTotals.output} out tokens ≈ $${runningCostUsd().toFixed(2)} (checkpointed)`);
      } else if (done % 10 === 0) {
        console.log(`  [${done}/${pending.length}] ${usageTotals.input} in / ${usageTotals.output} out tokens ≈ $${runningCostUsd().toFixed(2)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

  writeOutput(summaries);

  console.log(`\nWrote ${Object.keys(summaries).length} summaries to ${OUTPUT_PATH}`);
  console.log(`Generated: ${pending.length - failed.length}, cached: ${Object.keys(summaries).length - (pending.length - failed.length)}, ` +
    `failed: ${failed.length}${failed.length ? ` (${failed.join(', ')})` : ''}, no-text: ${skippedEmpty.length}`);
  console.log(`Token usage: ${usageTotals.input} in (${usageTotals.cacheRead} cache-read, ${usageTotals.cacheWrite} cache-write), ` +
    `${usageTotals.output} out ≈ $${runningCostUsd().toFixed(4)} (${MODEL} at $${INPUT_USD_PER_MTOK}/$${OUTPUT_USD_PER_MTOK} per MTok)`);
}

main().catch((err) => {
  console.error('Summary generation failed:', err.message);
  process.exit(1);
});
