#!/usr/bin/env node
/**
 * Build the Pagefind search index using the Pagefind NodeJS Indexing API.
 *
 * Replaces the plain `npx pagefind` CLI step. We do everything the CLI did —
 * index the rendered docs/ HTML, split per-language by <html lang>, excluding
 * the shared nav/footer chrome (with developer pages demoted, see
 * DEMOTED_PAGES) — AND additionally inject one custom record per board
 * document so a search can link DIRECTLY to the file (PDF), not just to the
 * meeting page that mentions it. We index document TITLES only (not their
 * contents). See SEARCH.md.
 *
 * Document sources:
 *   data/document-index.json   — ~1,032 board-packet attachments (title + url)
 *   data/linked-documents.json — curated search entries: docs linked from
 *                                agenda memos but hosted off the board portal
 *                                (e.g. the adopted Facilities Master Plan) and
 *                                official district resources parents search
 *                                for (instructional calendars, enrollment)
 *
 * Records are added to BOTH the en and es indexes (bilingual-by-default), so
 * /buscar surfaces documents too; per-language corpus isolation is preserved
 * because HTML pages still split by their own <html lang>.
 *
 * Verified against the installed Pagefind Node API in a browser — see SEARCH.md.
 */

import * as pagefind from 'pagefind';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import { extractMemoLinks } from './lib/memo-links.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOCS = resolve(ROOT, 'docs');

// Shared chrome excluded from indexing (formerly pagefind.yml exclude_selectors).
const EXCLUDE_SELECTORS = ['nav.site-nav', 'footer.site-footer'];
const LANGS = ['en', 'es'];

// Developer-documentation pages, demoted for parent-facing search. They stay
// searchable (a query for "mcp" still finds them) but every word in them is
// down-weighted via data-pagefind-weight so they can't outrank schools and
// meetings on generic terms the docs merely mention — /mcp/ documents a
// get-lunch-menu tool and was the live #1 result for "lunch menu".
// 0.1 ≈ one-tenth of normal body-text weight (default 1.0, h1 default 7.0);
// chosen empirically: drops /mcp/ from #1 to last place for "lunch menu"
// while it stays in the top 3 for "mcp". https://pagefind.app/docs/weighting/
const DEMOTED_PAGES = { '/mcp/': 0.1, '/mcp/es/': 0.1 };

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
async function addDoc(url, titleEn, titleEs, content, contentEs, urlEs = null) {
  if (!url || claimed.has(url)) return;
  claimed.add(url);
  if (urlEs) claimed.add(urlEs);
  // When the entry has a real per-language URL (e.g. /policies/ vs /politicas/
  // pages), each variant records its own URL and no fragment is needed; a
  // single shared URL still gets the #en/#es fragments to avoid the
  // last-wins collision on Pagefind's url key.
  const variants = [
    ['en', titleEn, content, urlEs ? url : `${url}#en`],
    ['es', titleEs || titleEn, contentEs || content, urlEs || `${url}#es`],
  ];
  for (const [language, title, body, recordUrl] of variants) {
    await index.addCustomRecord({
      url: recordUrl,
      content: body ? `${title} — ${body}` : title,
      language,
      meta: { title },
    });
  }
  docCount++;
}

// Strip leading agenda numbering ("1. ", "10.2 ") from an item title.
const cleanTitle = (t) => (t || '').replace(/^\s*\d+(\.\d+)*\.?\s+/, '').trim();

// 1) Index the rendered HTML site (per-language via <html lang>). We walk the
// files ourselves instead of index.addDirectory({path: DOCS}) because the
// directory API has no per-page hook — DEMOTED_PAGES need data-pagefind-weight
// injected on their <body>. URL derivation matches Pagefind's: a trailing
// index.html becomes the directory URL, any other .html name is kept.
let pageCount = 0;
const htmlFiles = readdirSync(DOCS, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.html'))
  .sort();
for (const rel of htmlFiles) {
  const url = '/' + rel.split(sep).join('/').replace(/(^|\/)index\.html$/, '$1');
  let content = readFileSync(resolve(DOCS, rel), 'utf8');
  const weight = DEMOTED_PAGES[url];
  if (weight !== undefined) {
    content = content.replace(/<body([^>]*)>/i, `<body$1 data-pagefind-weight="${weight}">`);
  }
  const res = await index.addHTMLFile({ url, content });
  if (res.errors?.length) console.warn(`  HTML: ${url}: ${res.errors.join('; ')}`);
  else pageCount++;
}
console.log(`  HTML: indexed ${pageCount} pages (${Object.keys(DEMOTED_PAGES).length} demoted)`);

// 2) Curated off-portal documents (best titles + provenance) — index FIRST so
// they win over the raw memo links they supersede (e.g. the FMP's bit.ly).
const linked = loadArray('data/linked-documents.json', 'documents');
let linkedCount = 0;
for (const d of linked) {
  if (!d.url) continue;
  // Claim any memo links this curated entry supersedes — its published/short
  // link plus explicit `supersedes` (e.g. earlier FMP draft URLs) — so only the
  // curated (final) document is indexed, not the raw/draft memo links.
  if (d.provenance && d.provenance.publishedLink) claimed.add(d.provenance.publishedLink);
  for (const s of d.supersedes || []) claimed.add(s);
  await addDoc(d.url, d.title, d.titleEs || d.title, d.note, d.noteEs, d.urlEs || null);
  linkedCount++;
}
console.log(`  Documents (curated off-portal links): ${linkedCount} records`);

// 3) Documents linked inside agenda memos but hosted off the board portal
// (kind === 'document'); titled by their agenda item. Public-comment forms and
// other kinds are intentionally NOT indexed. See scripts/lib/memo-links.mjs.
// Two sources: Simbli board-memos (one file per meeting) and the BoardDocs
// scrape (one file, array of meetings) — both carry per-item `memoLinks`.
async function indexMemoDocs(meetings) {
  let n = 0;
  for (const mtg of meetings) {
    for (const it of mtg.items || []) {
      const links = it.memoLinks || extractMemoLinks(it.memo);
      for (const l of links) {
        if (l.kind !== 'document' || claimed.has(l.url)) continue;
        const title = cleanTitle(it.title) || l.text || 'Linked document';
        const before = docCount;
        await addDoc(l.url, title, title, mtg.date ? `Board document · ${mtg.date}` : '');
        if (docCount > before) n++;
      }
    }
  }
  return n;
}
const memoDir = resolve(ROOT, 'data/board-memos');
const simbliMeetings = readdirSync(memoDir)
  .filter(x => x.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(resolve(memoDir, f), 'utf8')));
let boarddocsMeetings = [];
try { boarddocsMeetings = JSON.parse(readFileSync(resolve(ROOT, 'data/boarddocs-scraped.json'), 'utf8')); } catch { /* optional */ }
const memoDocCount = (await indexMemoDocs(simbliMeetings)) + (await indexMemoDocs(boarddocsMeetings));
console.log(`  Documents (memo-linked, Simbli + BoardDocs): ${memoDocCount} records`);

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
