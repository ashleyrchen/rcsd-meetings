# Site Search — Architecture & Rationale

This document describes how full-site search works on rcsd.info, **why** it is
built this way, and where to extend it. It is the reference base for future
search work. (Operational deploy details live in `CLAUDE.md`; the pipeline table
lives in `README.md`.)

## What it does

A single global search across the whole site — board meetings, schools, board
policies, district/budget/blog pages — reachable two ways:

1. A **search box in the global nav** on every page (rendered by `siteNav` in
   `scripts/html-parts.mjs`). It GET-submits `?q=` to the results page.
2. A **dedicated results page** with live autocomplete: `/search` (English) and
   `/buscar` (Spanish), built by `scripts/build-search.mjs`.

## The hard requirement: per-language corpus isolation

A search started from an **English** page must return **only English** results;
from a **Spanish** page, **only Spanish** results. No cross-language leakage.

This is satisfied structurally, not by post-filtering:

- Every generated page declares its language via `<html lang="en">` / `"es"` (an
  existing project convention — all build scripts emit it).
- Pagefind **splits its index by that `lang` attribute** at build time. The
  bundle contains two independent indexes (verified: `en` ≈ 229 pages, `es` ≈
  225 in `docs/pagefind/pagefind-entry.json`).
- Each results page sets `<pagefind-config language="…">`, pinning the query to
  that one index. The nav box routes EN pages → `/search`, ES pages → `/buscar`.
- Verified in a browser: an English query returned exclusively `lang="en"`
  result pages; a Spanish query (`plan maestro de instalaciones`) returned
  exclusively `lang="es"` pages, with the UI auto-translated to Spanish.

## Why Pagefind

The site is ~452 static HTML pages built by Node scripts and served from `docs/`
on Cloudflare Pages. Pagefind crawls the *rendered* HTML after build and produces
a chunked, lazy-loaded index plus a small WASM runtime — no server, no query
service, no index schema to hand-maintain as content grows. Multilingual
splitting via `<html lang>` gives the corpus-isolation requirement for free.
(A custom JSON index + client matcher was rejected as ongoing maintenance for no
gain; hosted search as overkill for a static civic-data project.)

## UI: Pagefind Component UI (not the Default UI)

We use the **Component UI** (`pagefind-component-ui.js`), Pagefind's recommended
UI as of 1.5 — light-DOM web components with better WAI-ARIA accessibility than
the older Default UI. The results pages compose:

```html
<div id="search">
  <pagefind-config language="en"></pagefind-config>
  <pagefind-input autofocus placeholder="…"></pagefind-input>
  <pagefind-summary></pagefind-summary>
  <pagefind-results max-results="20"></pagefind-results>
</div>
<script type="module" src="/pagefind/pagefind-component-ui.js"></script>
```

The input does **live autocomplete** as you type. Theming is via the Component
UI's `--pf-*` custom properties (light DOM, no shadow root) set on `#search` in
`build-search.mjs`, mapped to the green palette and Fraunces/Newsreader/IBM Plex
Mono fonts; matched terms highlight in `--pf-mark` (amber).

**Eager hydration.** The Component UI renders one skeleton row per result and
hydrates each lazily via an internal IntersectionObserver as it scrolls into
view. In practice that read as a bug: "14 results" with only the first ~9 rows
showing any text — everything below the fold sat as a blank gray skeleton
(verified live and locally, 2026-06-10). The init script in `build-search.mjs`
now force-loads every rendered row as soon as the result list changes: the
per-result wrappers are exposed on the `<pagefind-results>` element's
`.results` property and their `load()` is internally guarded (idempotent), so
a MutationObserver that calls `load()` on all of them is safe. Like the
relaxation wrapper, this touches undocumented internals, is feature-detected,
and fails open — if the internals change, rows fall back to hydrate-on-scroll.

The exact runtime API was discovered kinesthetically in a browser (the public
docs were thin), not assumed:
`window.PagefindComponents.getInstanceManager().getInstance('default')` returns
an instance whose private `__pagefind__` is the Pagefind core
(`search`, `debouncedSearch`, `options`). `inst.triggerSearch(term)` runs a
search programmatically; `inst.triggerLoad()` forces the index to load.

## Relevance: ranking + query relaxation

We **evaluated real parent/community queries in the browser** before shipping,
inspecting the actual ranked top results (not just counts):

| Query | Result |
|-------|--------|
| `facilities master plan` | ✅ Top hits are the Study Sessions on the draft Facilities Master Plan + the architect-contract board meeting |
| `garfield measure u plan` | ✅ Garfield Community School #1, then the Measure U application meetings |
| `board meeting hvac rental` | ✅ Relevant board meetings on top |
| `dual immersion enrollment` | ✅ Adelante Selby Spanish Immersion School #1 |
| `roy cloud principal email` | ❌ **1 hit (wrong page)** before fixing — see below |

A second evaluation round (2026-06 site review) added parent queries and fixes:

| Query | Result |
|-------|--------|
| `lunch menu` / `menu de almuerzo` | ❌ `/mcp/` (developer docs, mentions its `get-lunch-menu` tool) was #1 → demoted via `DEMOTED_PAGES` (see below); school pages now fill the top results, `/mcp/` is last |
| `calendar` / `calendario` | ❌ top hits were 2020 special meetings; the instructional calendars weren't indexed at all → curated entries in `linked-documents.json`; both school-year calendar PDFs now #1–#2 in both languages |
| `kindergarten enrollment` / `inscripcion kinder` | ❌ nothing useful → curated entry for the district's official enrollment page (rcsdk8.net), now #1 in both languages. (Pagefind normalizes diacritics: `inscripcion` matches `Inscripción`, verified both directions.) |

**Demoting developer pages.** `/mcp/` and `/mcp/es/` document the MCP server's
tools, so they textually mention many parent-facing terms ("lunch menu",
"calendar") and — being short, dense pages — outranked real content. The
indexer (`build-search-index.mjs`) injects `data-pagefind-weight="0.1"` on
their `<body>` at index time (`DEMOTED_PAGES`), down-weighting every word
one-tenth: still findable for `mcp`, no longer competitive for generic terms.
To get a per-page hook, the indexer walks `docs/**/*.html` and feeds each file
through `addHTMLFile` instead of `addDirectory` (same URL derivation; as a
bonus the walk picks up one ES page the directory glob missed).

Two layers, both tuned from those findings:

**1. Ranking** — Pagefind's defaults already rank well here because the default
`metaWeights.title` is **5.0**, so school/meeting *titles* win for queries like
"garfield" or "facilities master plan". We keep the documented defaults but apply
them explicitly via `pf.options({ ranking })` from a centralized `RANKING`
constant in `build-search.mjs`, so retuning (`pageLength`, `termFrequency`,
`termSaturation`, `termSimilarity`) is a one-line change. Verified that
`pf.options({ranking})` is accepted and reorders results.

**2. Query relaxation** — Pagefind matches **all terms (AND)**. A natural-language
query with one rare extra word collapses: `roy cloud principal email` → **1 hit**,
because "email" appears on few pages and the Roy Cloud school page doesn't render
that word, so the query falls through to the one page containing all four words
scattered (the meeting index). Fix: when the strict result set is sparse
(`< MIN_RESULTS`, currently **5**), we **broaden** — drop one term at a time, run
each `(n-1)`-term subset, merge the partial matches, and re-sort by score. This
is implemented by wrapping the core `search` **and** `debouncedSearch`
(they're separate code paths — the typing path uses `debouncedSearch`, which does
*not* delegate to `search`), so the Component UI renders the broadened results
transparently with no loss of its accessibility/markup. Well-matched queries
(≥ MIN_RESULTS) are left exactly as-is. After this, `roy cloud principal email`
returns **Roy Cloud School #1** (score 22.1), verified in the rendered UI.

> Fragility note: relaxation wraps the private `__pagefind__` core object. It is
> feature-detected (`typeof pf.search === 'function'`) and fails open — if a
> future Pagefind version changes internals, relaxation is silently skipped and
> the UI still works with default matching. We regenerate the bundle every build,
> so the version is controlled. Revisit if Pagefind exposes a supported
> match-mode / OR option, which would let us drop the wrapper.

## Indexing documents by title (direct-to-file results)

Board documents (PDFs) live on R2 / off-portal hosts, not in `docs/`, so they
have no HTML page of their own. Their titles appear only as link text on meeting
pages — which means a search for "facilities master plan" surfaces the *meetings*
that discuss it, never the document itself. To return a result that links
**directly to the file**, we feed document titles into the index as their own
records, using Pagefind's **NodeJS Indexing API** (`scripts/build-search-index.mjs`,
which replaced the `npx pagefind` CLI step). It:

1. `index.addHTMLFile(...)` for every `docs/**/*.html` — indexes the rendered
   HTML site exactly as `addDirectory`/the CLI did (`excludeSelectors` drops
   nav/footer; per-language split by `<html lang>`), but the per-file walk lets
   us inject `data-pagefind-weight` on `DEMOTED_PAGES` (the `/mcp/` developer
   docs — see "Demoting developer pages" above).
2. `index.addCustomRecord(...)` for each board-packet attachment in
   `data/document-index.json` (~1,028) — `url` → the file, `meta.title` → the
   document title. Titles only; we do **not** index PDF contents.
3. `index.addCustomRecord(...)` for each entry in `data/linked-documents.json` —
   hand-curated: documents linked inside agenda memos but hosted off-portal
   (so they're absent from `document-index.json`) **plus** official district
   resources parents search for but that live on rcsdk8.net (the TK-8
   instructional calendars, the enrollment page), with the best titles +
   provenance. Entries carry `note`/`noteEs` so each language's record gets
   its own excerpt text. First entry: the **adopted Facilities Master Plan**.
4. `index.addCustomRecord(...)` for **document-kind links embedded in agenda
   memos** (see "Embedded memo links" below), titled by their agenda item — e.g.
   the San Mateo County Investment Fund report. Curated entries (source 3) win
   over the raw memo link they supersede (the FMP's `bit.ly` is claimed by the
   curated entry, so it isn't double-indexed).

After this, `facilities master plan` returns the adopted FMP PDF as the **#1
result** in both languages (verified in a browser).

### Embedded memo links

Agenda items carry body prose (Recommendation / Rationale / …). Staff paste
links into it — mostly recurring **public-comment Google Forms** (~2 per
meeting), occasionally an actual **document** (the FMP, county reports, Drive
files). `scripts/lib/memo-links.mjs` (`extractMemoLinks`) pulls every embedded
URL and classifies it by host as `document` | `form` | `video` | `other`, after
unwrapping Gmail/Docs `google.com/url?q=` redirect wrappers and dropping
social-share chrome. Only `document`-kind links are fed into search — **forms
are deliberately excluded** (they'd flood results with near-duplicate sign-up
links; verified that "public comment" returns no `forms.gle`). Forms/other kinds
remain in the data for future meeting-page rendering.

Both scrapers populate `memoLinks` per item, from the two eras of agenda data:
- **Simbli** (`scrape-simbli-agendas.mjs`, Jun 2025+) — from the `memo` object.
- **BoardDocs** (`scrape-boarddocs.mjs --bodies`, Apr 2020–Jun 2025) — the
  BoardDocs scrape historically captured only item titles + attachments; it now
  fetches each item's detail (`BD-GetAgendaItem`, browser UA required) to capture
  the item **body** and its embedded links. The indexer reads document-kind
  `memoLinks` from `data/board-memos/*.json` **and** `data/boarddocs-scraped.json`.

Records are added to **both** the `en` and `es` indexes (bilingual-by-default;
the curated list carries a `titleEs`). Pagefind keys custom records by `url`, so
the same file added for two languages would collide (last-wins) — we append a
`#en` / `#es` fragment to keep them distinct; the fragment is ignored when the
PDF opens. Per-language corpus isolation still holds for HTML pages (they split
by their own `<html lang>`).

## Data flow

```
build scripts (build-*.mjs) ──> docs/**/*.html   (each with <html lang>)
build-search.mjs ────────────> docs/search/ (en), docs/buscar/ (es)
build-search-index.mjs ──────> docs/pagefind/  (HTML pages + per-document records,
   (Pagefind Node API)            per-language index + Component UI assets)
   + data/document-index.json + data/linked-documents.json
wrangler pages deploy docs ───> rcsd.info  (index shipped alongside pages)
```

Ordering matters: the index must build **after all HTML exists** (incl. the
search pages) and **before deploy**. This is wired as the final build stage in
`scripts/run-pipeline.mjs`, which CI runs before its `wrangler pages deploy` —
so no separate CI change was needed.

## Files

| File | Role |
|------|------|
| `scripts/build-search-index.mjs` | Builds the Pagefind index via the Node API: walks `docs/**/*.html` through `addHTMLFile` (`excludeSelectors` drops nav/footer; `DEMOTED_PAGES` get `data-pagefind-weight` injected) + injects per-document records from `document-index.json`, `linked-documents.json`, and document-kind `memoLinks` in `data/board-memos/*.json`, in both languages. Replaced `npx pagefind` + `pagefind.yml`. |
| `scripts/lib/memo-links.mjs` | `extractMemoLinks(memo)` — pulls embedded URLs out of agenda-item memos and classifies them (`document`/`form`/`video`/`other`). Shared by the scraper and the indexer. |
| `scripts/scrape-simbli-agendas.mjs` | Stores `memoLinks` on each agenda item (via the shared extractor) so embedded links are captured structurally. |
| `scripts/scrape-boarddocs.mjs` | Fetches each item's detail (`BD-GetAgendaItem`) to capture the item `body` + `memoLinks` for the BoardDocs era; `--bodies` backfills already-scraped meetings (resumable). Browser User-Agent required (CloudFront). |
| `data/linked-documents.json` | Curated search entries: documents linked from agenda memos but hosted off-portal (e.g. the adopted FMP, superseding its raw memo link) and official district resources parents search for (TK-8 instructional calendars, the rcsdk8.net enrollment page). Provenance + best titles per entry; `note`/`noteEs` give each language its own excerpt. Indexed by title. |
| `scripts/build-search.mjs` | Generates `/search` + `/buscar`: composes the Component UI, themes it, applies ranking, installs query relaxation, eagerly hydrates result rows, prefills `?q=`. Holds the `RANKING` + `MIN_RESULTS` tunables. Pages carry `data-pagefind-ignore` + `robots: noindex, follow`. |
| `scripts/html-parts.mjs` | `siteNav` renders the language-aware nav search `<form>`; `baseCSS` styles `.site-nav-search`. |
| `scripts/run-pipeline.mjs` | Runs `build-search.mjs` then `build-search-index.mjs` as the last build stages before deploy. |
| `package.json` | `pagefind` devDependency (provides the Node API); `build:search` + `search:index` scripts. |
| `.gitignore` | Ignores `docs/pagefind/` — regenerated bundle, redeployed every build. |

## Running it locally

```bash
npm install              # pulls the pagefind binary
npm run build            # builds all pages incl. /search and /buscar
npm run search:index     # build-search-index.mjs -> docs/pagefind/ (HTML + docs)
cd docs && python3 -m http.server 8799   # or: npx wrangler pages dev docs
# open /search?q=facilities+master+plan and /buscar?q=plan+maestro
```

The full pipeline (`node scripts/run-pipeline.mjs`) does build + index in one
pass; add `--deploy` to publish.

## Known limitations / future refinements

- **Nav uses a plain form→page submit**, not a ⌘K modal. The Component UI ships
  `<pagefind-modal>` / `<pagefind-modal-trigger>` for a keyboard-first
  search-everywhere modal; we kept the lightweight form to avoid loading the
  ~175 KB component bundle on all 452 pages. A modal is the natural next upgrade
  if we accept that cost.
- **Pages without a `lang` attribute** merge into the English index. One
  standalone page (`docs/cheatsheet-2026-02-26.html`) currently has none;
  Pagefind warns and folds it into `en`. Fix by adding `<html lang>`.
- **Relaxation scoring** mixes scores across sub-queries and re-sorts; this is a
  heuristic that worked well on the evaluated queries. If it ever surfaces noise,
  bias toward the highest-coverage subset instead of merging all subsets.
- **Filters/sorts.** Pagefind supports faceted filters (`data-pagefind-filter`)
  and sorts (`data-pagefind-sort`) — none defined yet; the path to typed/grouped
  results without leaving Pagefind.

## Roadmap (sequenced)

Search has shipped in stages; this tracks the effort. Strike through as merged.

- ~~Global bilingual search, Component UI, ranking + query relaxation (PR #25)~~
- ~~Index board documents by title → direct-to-file results (PR #26)~~
- ~~Capture embedded memo links (Simbli scraper + classify) and index
  document-kind ones; exclude public-comment forms (PR #27)~~
- ~~Scrape BoardDocs item **bodies** (`--bodies`) to capture embedded links for
  the Apr 2020–Jun 2025 era; index document-kind ones (this PR)~~
- **Search-result iconography** — per-result images via record `meta` /
  `<pagefind-results show-images>`: YouTube thumbnail for meeting hits, a
  PDF/filetype glyph for document hits, school crest for school pages.
- **Bespoke OG cards** for `/search` + `/buscar` (EN + ES variants), instead of
  the site-default image.
- **Mirror pulled documents to R2** (`data.rcsd.info`) — board attachments and
  off-portal linked docs (FMP, county reports), for link stability + provenance,
  then point search records at the mirrored copy.
- **Index full document contents** (not just titles) for deeper searchability —
  extract text from mirrored PDFs and add as record `content`.
- **Render `memoLinks` on meeting pages** — surface the public-comment forms
  ("📝 Public comment — EN/ES") and reference links now captured per item.
- **Auto-resolve short links** (`bit.ly`) to canonical URLs at scrape time, so
  curated overrides aren't needed just to record the real target.
