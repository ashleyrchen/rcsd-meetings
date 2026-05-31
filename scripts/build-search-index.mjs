#!/usr/bin/env node
/**
 * Build the Pagefind search index using the Pagefind NodeJS Indexing API.
 *
 * Replaces the plain `npx pagefind` CLI step. We do everything the CLI did —
 * index the rendered docs/ HTML, split per-language by <html lang>, excluding
 * the shared nav/footer chrome — AND additionally inject one custom record per
 * board document so a search can link DIRECTLY to the file (PDF), not just to
 * the meeting page that mentions it. We index document TITLES only (not their
 * contents). See SEARCH.md.
 *
 * Document sources:
 *   data/document-index.json   — ~1,032 board-packet attachments (title + url)
 *   data/linked-documents.json — curated docs linked from agenda memos but
 *                                hosted off the board portal (e.g. the adopted
 *                                Facilities Master Plan)
 *
 * Records are added to BOTH the en and es indexes (bilingual-by-default), so
 * /buscar surfaces documents too; per-language corpus isolation is preserved
 * because HTML pages still split by their own <html lang>.
 *
 * Verified against the installed Pagefind Node API in a browser — see SEARCH.md.
 */

import * as pagefind from 'pagefind';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOCS = resolve(ROOT, 'docs');

// Shared chrome excluded from indexing (formerly pagefind.yml exclude_selectors).
const EXCLUDE_SELECTORS = ['nav.site-nav', 'footer.site-footer'];
const LANGS = ['en', 'es'];

function loadArray(relPath, key) {
  const j = JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf8'));
  if (Array.isArray(j)) return j;
  if (key && Array.isArray(j[key])) return j[key];
  return Object.values(j).find(Array.isArray) || [];
}

const { index } = await pagefind.createIndex({ excludeSelectors: EXCLUDE_SELECTORS });

// 1) Index the rendered HTML site (per-language via <html lang>).
const dirRes = await index.addDirectory({ path: DOCS });
console.log(`  HTML: indexed ${dirRes.page_count} pages`);

// 2) Board-packet attachments: title -> direct file URL.
const attachments = loadArray('data/document-index.json');
let docCount = 0;
const seen = new Set();
for (const a of attachments) {
  const url = a.url;
  const title = (a.title || a.itemTitle || '').trim();
  if (!url || !title) continue;
  const dedupeKey = url + '|' + title;
  if (seen.has(dedupeKey)) continue;
  seen.add(dedupeKey);
  const context = [a.meetingDate, a.meetingType].filter(Boolean).join(' · ');
  for (const language of LANGS) {
    await index.addCustomRecord({
      // Pagefind keys custom records by url; the same PDF added for both
      // languages would collide (last-wins). A language fragment keeps the
      // records distinct and is ignored when the PDF opens.
      url: `${url}#${language}`,
      content: context ? `${title} — ${context}` : title,
      language,
      meta: { title },
    });
  }
  docCount++;
}
console.log(`  Documents (board attachments): ${docCount} records`);

// 3) Curated linked documents (e.g. adopted FMP) hosted off the board portal.
const linked = loadArray('data/linked-documents.json', 'documents');
let linkedCount = 0;
for (const d of linked) {
  if (!d.url) continue;
  const variants = [['en', d.title], ['es', d.titleEs || d.title]];
  for (const [language, title] of variants) {
    await index.addCustomRecord({
      url: `${d.url}#${language}`, // unique per language (see note above)
      content: d.note ? `${title} — ${d.note}` : title,
      language,
      meta: { title },
    });
  }
  linkedCount++;
}
console.log(`  Documents (curated off-portal links): ${linkedCount} records`);

await index.writeFiles({ outputPath: resolve(DOCS, 'pagefind') });
await pagefind.close?.();
console.log(`build-search-index: done (HTML + ${docCount + linkedCount} document records × ${LANGS.length} langs).`);
