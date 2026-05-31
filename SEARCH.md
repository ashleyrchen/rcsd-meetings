# Site Search — Architecture & Rationale

This document describes how full-site search works on rcsd.info, **why** it is
built this way, and where to extend it. It is the reference base for future
search work. (Operational deploy details live in `CLAUDE.md`; the pipeline table
lives in `README.md`.)

## What it does

A single global search across the whole site — board meetings, schools, board
policies, district/budget/blog pages — reachable two ways:

1. A **search box in the global nav** on every page (rendered by `siteNav` in
   `scripts/html-parts.mjs`).
2. A **dedicated results page**: `/search` (English) and `/buscar` (Spanish).

The nav box GET-submits `?q=` to the results page; the results page runs the
query and renders hits.

## The hard requirement: per-language corpus isolation

A search started from an **English** page must return **only English** results;
from a **Spanish** page, **only Spanish** results. No cross-language leakage.

This is satisfied structurally, not by post-filtering:

- Every generated page already declares its language via `<html lang="en">` or
  `<html lang="es">` (an existing project convention — all build scripts emit
  it).
- Pagefind **splits its index by that `lang` attribute** at build time. The
  bundle contains two independent indexes (verified: `en` ≈ 229 pages, `es` ≈
  225 pages in `docs/pagefind/pagefind-entry.json`).
- The Pagefind UI, when initialised on a page, loads **only the index matching
  that page's `<html lang>`**. So `/search` (lang=en) can only ever see the
  English index and `/buscar` (lang=es) only the Spanish index.
- The nav box closes the loop: on an English page it points at `/search`, on a
  Spanish page at `/buscar`. A user therefore stays in their language's corpus
  from query to results.

Verification (`lang` of every returned result page checked in a browser)
confirmed a Spanish query returned exclusively `lang="es"` pages and an English
query exclusively `lang="en"` pages.

## Why Pagefind (and not the alternatives)

The site is ~452 fully static HTML pages built by Node scripts and served from
`docs/` on Cloudflare Pages. The options were:

- **Pagefind (chosen)** — a static-site search indexer. It crawls the *rendered*
  HTML after build and produces a chunked, lazy-loaded index plus a small WASM
  search runtime. No server, no API keys, no third-party query service.
  - *Why it wins here:* it indexes whatever is already on the page, so meeting
    summaries, policy text, school details, etc. are covered with **zero index
    schema to hand-maintain** — nothing to drift out of sync as content grows.
    Multilingual splitting via `<html lang>` gives us the corpus-isolation
    requirement for free. The runtime only downloads the index shards needed for
    a query, so the 4.4 MB on-disk bundle costs the user very little per search.
- **Custom JSON index + client matcher (MiniSearch/Fuse)** — full control over
  typed results, but every new data source needs index-builder changes, and we'd
  re-implement ranking, stemming, and bilingual handling ourselves. Rejected as
  ongoing-maintenance cost for no clear benefit over Pagefind.
- **Hosted search (Algolia/Cloudflare)** — overkill for a static civic-data
  side project; adds an external dependency and (for some) cost/keys. Rejected.

Trade-off accepted: Pagefind is an external binary (shipped via the `pagefind`
npm wrapper) and its default UI needs theming to match the design system (done —
see below).

## Data flow

```
build scripts (build-*.mjs) ──> docs/**/*.html   (each with <html lang>)
                                      │
build-search.mjs ────────────> docs/search/index.html   (lang=en)
                               docs/buscar/index.html   (lang=es)
                                      │
pagefind (reads pagefind.yml) ─> docs/pagefind/   (per-language index + UI)
                                      │
wrangler pages deploy docs ───> rcsd.info  (index shipped alongside pages)
```

Ordering matters: Pagefind must run **after all HTML exists** (including the
search pages) and **before deploy**. This is wired as the final build stage in
`scripts/run-pipeline.mjs`, which CI runs before its `wrangler pages deploy`
step — so no separate CI change was needed.

## Files

| File | Role |
|------|------|
| `pagefind.yml` | Indexer config: `site: docs`; `exclude_selectors` drops the shared nav/footer so chrome text doesn't pollute results. |
| `scripts/build-search.mjs` | Generates `/search` (en) and `/buscar` (es). Loads the Pagefind UI, themes it, reads `?q=` and calls `triggerSearch`. Pages carry `data-pagefind-ignore` (they shouldn't index themselves) and `robots: noindex, follow`. |
| `scripts/html-parts.mjs` | `siteNav` renders the language-aware search `<form>` (`/search` vs `/buscar`, bilingual placeholder + `aria-label`); `baseCSS` styles `.site-nav-search`. |
| `scripts/run-pipeline.mjs` | Runs `build-search.mjs` then the `pagefind` indexer as the last build stage before deploy. |
| `package.json` | `pagefind` devDependency; `build:search` and `search:index` scripts; `build:search` appended to the `build` chain. |
| `.gitignore` | Ignores `docs/pagefind/` — it's a regenerated binary bundle, redeployed every build. |

## Theming

The Pagefind Default UI is themed entirely through its documented CSS custom
properties (set on `#search` in `build-search.mjs`): `--pagefind-ui-primary`,
`--pagefind-ui-background`, `--pagefind-ui-border`, `--pagefind-ui-font`, etc.,
mapped to the site's green palette and Fraunces/Newsreader/IBM Plex Mono fonts.
The nav box reuses the existing `.site-nav-lang` visual treatment.

## Running it locally

```bash
npm install                # pulls the pagefind binary
npm run build              # builds all pages incl. /search and /buscar
npm run search:index       # runs pagefind -> docs/pagefind/
npx wrangler pages dev docs   # or: (cd docs && python3 -m http.server)
# then open /search?q=enrollment and /buscar?q=matrícula
```

The full pipeline (`node scripts/run-pipeline.mjs`) does the build + index in one
pass; add `--deploy` to publish.

## Known limitations / future refinements

- **Pages without a `lang` attribute** merge into the English index. Currently
  one standalone page (`docs/cheatsheet-2026-02-26.html`) has no `lang`; Pagefind
  warns and folds it into `en`. Fix by adding `<html lang>` to such pages.
- **Default UI vs Component UI.** Pagefind ≥1.5 recommends the newer Component UI
  (search modal, richer a11y/customization). The Default UI is still fully
  supported and was chosen for its simple `triggerSearch` API and easy theming.
  Migrating to the Component UI is the natural next step if we want a modal /
  keyboard-first experience.
- **Filters & sorts.** Pagefind can expose faceted filters (e.g. by content type
  — meeting / policy / school) via `data-pagefind-filter` attributes on pages,
  and custom sorts via `data-pagefind-sort`. None are defined yet; adding them is
  the path to typed/grouped results without abandoning Pagefind.
- **Sub-results** are enabled (`showSubResults: true`) so a single long page
  (e.g. a meeting) can surface the specific section that matched.
- The **homepage `/`** is English-primary (`build-homepage.mjs` sets `lang="en"`);
  its nav box routes to `/search`. Revisit if/when the homepage becomes a true
  bilingual pair.
