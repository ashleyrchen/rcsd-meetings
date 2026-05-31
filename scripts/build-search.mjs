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
 * Search itself is powered by Pagefind, whose index is built AFTER this script
 * runs (see pagefind.yml + run-pipeline.mjs). Each page loads the prebuilt
 * Pagefind UI widget and instantiates it against the index. Pagefind splits its
 * index by the page's <html lang> attribute and the UI on a given page only
 * queries the matching-language index — so /search (lang=en) searches only the
 * English corpus and /buscar (lang=es) searches only the Spanish corpus. The
 * nav search box (scripts/html-parts.mjs) GET-submits ?q= to the same-language
 * page, preserving that isolation end to end.
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
    // PagefindUI translation overrides (English defaults are mostly fine; we
    // only set the placeholder so it matches the page voice).
    translations: { placeholder: 'Search the site' },
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
    translations: {
      placeholder: 'Buscar en el sitio',
      clear_search: 'Borrar',
      load_more: 'Ver más resultados',
      search_label: 'Buscar en este sitio',
      filters_label: 'Filtros',
      zero_results: 'No se encontraron resultados para [SEARCH_TERM]',
      many_results: '[COUNT] resultados para [SEARCH_TERM]',
      one_result: '[COUNT] resultado para [SEARCH_TERM]',
      alt_search: 'No se encontraron resultados para [SEARCH_TERM]. Mostrando resultados para [DIFFERENT_TERM]',
      search_suggestion: 'No se encontraron resultados para [SEARCH_TERM]. Prueba una de estas búsquedas:',
      searching: 'Buscando [SEARCH_TERM]…',
    },
  },
};

const HREFLANG = [
  { lang: 'en', href: 'https://rcsd.info/search/' },
  { lang: 'es', href: 'https://rcsd.info/buscar/' },
];

// Page-specific CSS: theme the Pagefind UI to the site design system via its
// documented CSS custom properties, and give the results region some room.
const searchCSS = `
  .search-main {
    max-width: 760px;
    margin: 0 auto;
    padding: 2.5rem 2rem 1rem;
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
    /* Pagefind UI design tokens — see https://pagefind.app/docs/ui-usage/ */
    --pagefind-ui-scale: 0.9;
    --pagefind-ui-primary: var(--green-mid);
    --pagefind-ui-text: var(--text);
    --pagefind-ui-background: var(--cream);
    --pagefind-ui-border: var(--rule);
    --pagefind-ui-tag: var(--green-pale);
    --pagefind-ui-border-width: 1px;
    --pagefind-ui-border-radius: 6px;
    --pagefind-ui-font: 'Newsreader', Georgia, serif;
  }
  .pagefind-ui__search-input { font-family: 'IBM Plex Mono', monospace !important; }
  .pagefind-ui__result-title a { color: var(--green-deep); }
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
    extraHead: '<link href="/pagefind/pagefind-ui.css" rel="stylesheet">',
    pageCSS: searchCSS,
  });

  // The init script reads ?q= and triggers a search so nav submissions land
  // pre-searched. PagefindUI auto-selects the index for this page's <html lang>.
  const initScript = `<script src="/pagefind/pagefind-ui.js"></script>
<script>
  window.addEventListener('DOMContentLoaded', function () {
    var ui = new PagefindUI({
      element: '#search',
      showSubResults: true,
      showImages: false,
      translations: ${JSON.stringify(cfg.translations)}
    });
    var q = new URLSearchParams(window.location.search).get('q');
    if (q) { ui.triggerSearch(q); }
  });
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
  <div id="search"></div>
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
