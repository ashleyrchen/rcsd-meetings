#!/usr/bin/env node
/**
 * Build the two dedicated search results pages.
 *
 * Output:
 *   docs/search/index.html  (EN, <html lang="en">)
 *   docs/buscar/index.html  (ES, <html lang="es">)
 *
 * Architecture & rationale: SEARCH.md (repo root)
 *
 * Search is powered by Pagefind's Component UI (the recommended UI as of 1.5):
 * a set of light-DOM web components (<pagefind-config>, <pagefind-input>,
 * <pagefind-summary>, <pagefind-results>) composed inline, themed via the
 * Component UI's --pf-* CSS custom properties, and driven by the
 * window.PagefindComponents API (init / configureInstance / triggerSearch).
 *
 * Pagefind splits its index by each page's <html lang> attribute; we ALSO pass
 * `language` to <pagefind-config> explicitly so /search (en) only ever queries
 * the English corpus and /buscar (es) only the Spanish corpus. The nav search
 * box (scripts/html-parts.mjs) GET-submits ?q= to the same-language page,
 * preserving that isolation end to end.
 *
 * Ranking is tuned via the core pf.options({ ranking }) after load, and a query
 * relaxation layer broadens over-specified natural-language queries that would
 * otherwise collapse under Pagefind's all-terms (AND) matching. Both were chosen
 * by evaluating real parent/community queries in a browser — see SEARCH.md.
 *
 * These pages carry data-pagefind-ignore so they don't index themselves, and
 * robots "noindex, follow" since a results page has no standalone content.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { headMeta, siteNav, siteFooter } from './html-parts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Pagefind ranking knobs (see https://pagefind.app/docs/ranking/), applied at
// runtime via pf.options({ranking}). These are Pagefind's documented DEFAULTS —
// evaluating real parent/community queries (see SEARCH.md) showed the defaults
// already rank well (title weight defaults to 5.0, so school/meeting titles win
// for "garfield", "facilities master plan", etc.). Centralized here so retuning
// is a one-line change.
const RANKING = {
  termFrequency: 1.0,      // (1.0) lower boosts longer docs
  pageLength: 0.75,        // (0.75) higher favors shorter pages
  termSaturation: 1.4,     // (1.4) higher lets repeated terms keep boosting
  termSimilarity: 1.0,     // (1.0) higher favors exact-length term matches
};

// Below this many strict (all-terms) hits, broaden the query (see init script).
// Pagefind matches ALL terms; a rare extra word ("roy cloud principal EMAIL")
// otherwise collapses results to ~0. Verified against real queries in SEARCH.md.
const MIN_RESULTS = 5;

// Per-language page strings. Tone follows the project's Spanish register
// (sixth-grade Californian, colloquial — "Buscar", not literary forms).
const PAGES = {
  en: {
    outDir: 'docs/search',
    lang: 'en',
    ogLocale: 'en_US',
    altLangHref: '/buscar/',
    canonical: 'https://rcsd.info/search/',
    title: 'Search — RCSD Open Data',
    description: 'Search Redwood City School District board meetings, schools, board policies, and district data.',
    h1: 'Search',
    intro: 'Search across board meetings, schools, board policies, and district data.',
    placeholder: 'Search meetings, schools, policies…',
  },
  es: {
    outDir: 'docs/buscar',
    lang: 'es',
    ogLocale: 'es_US',
    altLangHref: '/search/',
    canonical: 'https://rcsd.info/buscar/',
    title: 'Buscar — Datos Abiertos de RCSD',
    description: 'Busca en las reuniones de la mesa directiva, escuelas, pólizas y datos del Distrito Escolar de Redwood City.',
    h1: 'Buscar',
    intro: 'Busca en las reuniones de la mesa directiva, escuelas, pólizas y datos del distrito.',
    placeholder: 'Busca reuniones, escuelas, pólizas…',
  },
};

const HREFLANG = [
  { lang: 'en', href: 'https://rcsd.info/search/' },
  { lang: 'es', href: 'https://rcsd.info/buscar/' },
];

// Page CSS: theme the Component UI via its --pf-* custom properties (light DOM,
// no shadow root) and lay out the results region.
const searchCSS = `
  .search-main {
    max-width: 760px;
    margin: 0 auto;
    padding: 2.5rem 2rem 3rem;
  }
  .search-main .eyebrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--green-light);
  }
  .search-main h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 2.4rem;
    line-height: 1.1;
    margin: 0.2rem 0 0.4rem;
    color: var(--green-deep);
  }
  .search-main .intro {
    color: var(--text-secondary);
    margin-bottom: 1.6rem;
  }
  #search {
    /* Pagefind Component UI tokens — https://pagefind.app/docs/ */
    --pf-font: 'Newsreader', Georgia, serif;
    --pf-text: var(--text);
    --pf-text-secondary: var(--text-secondary);
    --pf-text-muted: var(--text-muted);
    --pf-background: var(--cream);
    --pf-border: var(--rule);
    --pf-border-focus: var(--green-light);
    --pf-outline-focus: var(--green-light);
    --pf-hover: var(--green-wash);
    --pf-border-radius: 6px;
    --pf-mark: var(--amber-light);
  }
  #search pagefind-input { font-family: 'IBM Plex Mono', monospace; }
`;

function renderPage(cfg) {
  const navHtml = siteNav({ activePage: null, lang: cfg.lang, altLangHref: cfg.altLangHref });
  const footerHtml = siteFooter({ lang: cfg.lang });

  const head = headMeta({
    title: cfg.title,
    description: cfg.description,
    canonical: cfg.canonical,
    ogLocale: cfg.ogLocale,
    hreflang: HREFLANG,
    robots: 'noindex, follow',
    extraHead: '<link href="/pagefind/pagefind-component-ui.css" rel="stylesheet">',
    pageCSS: searchCSS,
  });

  // <pagefind-config language> forces the per-language index (corpus isolation);
  // the input/summary/results bind to the same default instance automatically.
  // Results show sub-results (matching sections within a page) by default.
  const widget = `<div id="search">
    <pagefind-config language="${cfg.lang}"></pagefind-config>
    <pagefind-input autofocus placeholder="${cfg.placeholder}"></pagefind-input>
    <pagefind-summary></pagefind-summary>
    <pagefind-results max-results="20"></pagefind-results>
  </div>`;

  // Init: applies ranking, installs query relaxation, and prefills from ?q=.
  // Every API call here (getInstanceManager/getInstance, triggerLoad, the core
  // __pagefind__.search + debouncedSearch + options) was verified live in a
  // browser; see SEARCH.md. Relaxation wraps the core so the Component UI renders
  // broadened results transparently, preserving its accessibility/markup.
  const initScript = `<script type="module" src="/pagefind/pagefind-component-ui.js"></script>
<script type="module">
(async function () {
  var RANKING = ${JSON.stringify(RANKING)};
  var MIN_RESULTS = ${MIN_RESULTS};

  function ready() { return window.PagefindComponents && window.PagefindComponents.getInstanceManager; }
  for (var i = 0; i < 200 && !ready(); i++) { await new Promise(function (r) { setTimeout(r, 25); }); }
  if (!ready()) return;
  var inst = window.PagefindComponents.getInstanceManager().getInstance('default');
  if (!inst) return;

  // Force the core to load so we can tune ranking + relax queries, and so a ?q=
  // prefill resolves instantly.
  if (inst.triggerLoad) { try { await inst.triggerLoad(); } catch (e) {} }
  var pf = inst.__pagefind__;
  if (pf) {
    try { await pf.options({ ranking: RANKING }); } catch (e) {}

    // Query relaxation. Pagefind requires ALL terms (AND); a query like
    // "roy cloud principal email" collapses to ~1 hit because "email" is rare.
    // When the strict result set is sparse, broaden it by dropping one term at a
    // time and merging the partial matches, re-sorted by score. Only fires below
    // MIN_RESULTS, so well-matched queries (most) are left exactly as-is.
    if (typeof pf.search === 'function' && typeof pf.debouncedSearch === 'function') {
      var origSearch = pf.search.bind(pf);
      var origDeb = pf.debouncedSearch.bind(pf);
      async function broaden(term, base, opts) {
        var words = (term || '').trim().split(/\\s+/).filter(Boolean);
        if (!base || base.results.length >= MIN_RESULTS || words.length < 2) return base;
        var seen = new Map(base.results.map(function (x) { return [x.id, x]; }));
        for (var k = 0; k < words.length; k++) {
          var sub = words.filter(function (_, j) { return j !== k; }).join(' ');
          var rr = await origSearch(sub, opts);
          rr.results.forEach(function (res) { if (!seen.has(res.id)) seen.set(res.id, res); });
        }
        var merged = Array.from(seen.values()).sort(function (a, b) { return b.score - a.score; });
        return Object.assign({}, base, { results: merged, unfilteredResultCount: merged.length });
      }
      pf.search = async function (term, opts) { return broaden(term, await origSearch(term, opts), opts); };
      pf.debouncedSearch = async function (term, opts) { return broaden(term, await origDeb(term, opts), opts); };
    }
  }

  // Eager hydration. The Component UI renders one skeleton row per result and
  // hydrates each lazily via IntersectionObserver as it scrolls into view —
  // so below-the-fold rows sit as blank skeletons ("14 results" but only 9
  // visible with text). Force-load every rendered result as soon as the list
  // changes: the wrappers live on the <pagefind-results> element's .results
  // and their load() is idempotent (guarded by result/loading internally).
  // Feature-detected and fail-open, same contract as the relaxation wrapper.
  var resultsEl = document.querySelector('pagefind-results');
  if (resultsEl && window.MutationObserver) {
    var hydrateAll = function () {
      (resultsEl.results || []).forEach(function (r) {
        if (r && typeof r.load === 'function') { try { r.load(); } catch (e) {} }
      });
    };
    new MutationObserver(hydrateAll).observe(resultsEl, { childList: true, subtree: true });
    hydrateAll();
  }

  // Prefill from ?q= (nav search box submits here).
  var q = new URLSearchParams(location.search).get('q');
  if (q) {
    var input = document.querySelector('pagefind-input input');
    if (input) input.value = q;
    if (inst.triggerSearch) inst.triggerSearch(q);
  }
})();
</script>`;

  return `<!DOCTYPE html>
<html lang="${cfg.lang}">
<head>
${head}
</head>
<body data-pagefind-ignore>

${navHtml}

<main class="search-main">
  <div class="eyebrow">RCSD Open Data</div>
  <h1>${cfg.h1}</h1>
  <p class="intro">${cfg.intro}</p>
  ${widget}
</main>

${footerHtml}

${initScript}
</body>
</html>`;
}

let count = 0;
for (const cfg of Object.values(PAGES)) {
  const html = renderPage(cfg);
  mkdirSync(resolve(ROOT, cfg.outDir), { recursive: true });
  writeFileSync(resolve(ROOT, cfg.outDir, 'index.html'), html);
  console.log(`  Wrote ${cfg.outDir}/index.html`);
  count++;
}
console.log(`build-search: ${count} pages written.`);
