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
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractMemoLinks } from './lib/memo-links.mjs';

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

// Add a document as its own search record in BOTH languages. Pagefind keys
// custom records by url, so the same file added for two languages would collide
// (last-wins) — a #en/#es fragment keeps them distinct and is ignored when the
// file opens. Each url is added at most once (claimed set) across all sources.
const claimed = new Set();
let docCount = 0;
async function addDoc(url, titleEn, titleEs, content) {
  if (!url || claimed.has(url)) return;
  claimed.add(url);
  const variants = [['en', titleEn], ['es', titleEs || titleEn]];
  for (const [language, title] of variants) {
    await index.addCustomRecord({
      url: `${url}#${language}`,
      content: content ? `${title} — ${content}` : title,
      language,
      meta: { title },
    });
  }
  docCount++;
}

// Strip leading agenda numbering ("1. ", "10.2 ") from an item title.
const cleanTitle = (t) => (t || '').replace(/^\s*\d+(\.\d+)*\.?\s+/, '').trim();

// 1) Index the rendered HTML site (per-language via <html lang>).
const dirRes = await index.addDirectory({ path: DOCS });
console.log(`  HTML: indexed ${dirRes.page_count} pages`);

// 2) Curated off-portal documents (best titles + provenance) — index FIRST so
// they win over the raw memo links they supersede (e.g. the FMP's bit.ly).
const linked = loadArray('data/linked-documents.json', 'documents');
let linkedCount = 0;
for (const d of linked) {
  if (!d.url) continue;
  // Claim any memo links this curated entry supersedes (its published/short link).
  const alias = d.provenance && d.provenance.publishedLink;
  if (alias) claimed.add(alias);
  await addDoc(d.url, d.title, d.titleEs || d.title, d.note);
  linkedCount++;
}
console.log(`  Documents (curated off-portal links): ${linkedCount} records`);

// 3) Documents linked inside agenda memos but hosted off the board portal
// (kind === 'document'); titled by their agenda item. Public-comment forms and
// other kinds are intentionally NOT indexed. See scripts/lib/memo-links.mjs.
const memoDir = resolve(ROOT, 'data/board-memos');
let memoDocCount = 0;
for (const f of readdirSync(memoDir).filter(x => x.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(resolve(memoDir, f), 'utf8'));
  for (const it of j.items || []) {
    const links = it.memoLinks || extractMemoLinks(it.memo);
    for (const l of links) {
      if (l.kind !== 'document' || claimed.has(l.url)) continue;
      const title = cleanTitle(it.title) || l.text || 'Linked document';
      const before = docCount;
      await addDoc(l.url, title, title, j.date ? `Board document · ${j.date}` : '');
      if (docCount > before) memoDocCount++;
    }
  }
}
console.log(`  Documents (memo-linked): ${memoDocCount} records`);

// 4) Board-packet attachments: title -> direct file URL.
const attachments = loadArray('data/document-index.json');
let attCount = 0;
for (const a of attachments) {
  const title = (a.title || a.itemTitle || '').trim();
  if (!a.url || !title || claimed.has(a.url)) continue;
  const context = [a.meetingDate, a.meetingType].filter(Boolean).join(' · ');
  await addDoc(a.url, title, title, context);
  attCount++;
}
console.log(`  Documents (board attachments): ${attCount} records`);

await index.writeFiles({ outputPath: resolve(DOCS, 'pagefind') });
await pagefind.close?.();
console.log(`build-search-index: done (HTML + ${docCount} document records × ${LANGS.length} langs).`);
