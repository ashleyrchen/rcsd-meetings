#!/usr/bin/env node
/**
 * Generate the interactive board policies manual in English
 * (docs/policies/index.html) and Spanish (docs/politicas/index.html),
 * and publish docs/policies-index.json and docs/board-policies/*.json
 * for machine readability.
 *
 * Spanish page: policy TITLES and section names come from
 * data/policy-titles-es.json (AI-translated by
 * scripts/translate-policy-titles.mjs and labeled as such on the page);
 * policy BODY text is served from the same English JSON files for now,
 * with an in-drawer note saying so.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { headMeta, siteNav, siteFooter } from './html-parts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DATA_DIR = resolve(ROOT, 'data');
const POLICIES_DATA_DIR = resolve(DATA_DIR, 'board-policies');
const INDEX_DATA_PATH = resolve(DATA_DIR, 'policies-index.json');
const TITLES_ES_PATH = resolve(DATA_DIR, 'policy-titles-es.json');

const DOCS_DIR = resolve(ROOT, 'docs');
const POLICIES_DOCS_DIR = resolve(DOCS_DIR, 'board-policies');
const INDEX_DOCS_PATH = resolve(DOCS_DIR, 'policies-index.json');

const escapeAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Simbli dates are MM/DD/YYYY strings; Spanish pages render dd/mm/yyyy
// per the site's es-MX date convention.
function formatUsDate(s, lang) {
  if (!s) return null;
  if (lang === 'es') {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[2]}/${m[1]}/${m[3]}`;
  }
  return s;
}

// ---- Per-language page strings ----
// Spanish register: plain, colloquial Californian Spanish (sixth-grade);
// these are legal document names so titles stay formal-ish for accuracy.
const PAGES = {
  en: {
    lang: 'en',
    htmlLang: 'en',
    outputDir: resolve(DOCS_DIR, 'policies'),
    canonical: 'https://rcsd.info/policies/',
    altLangHref: '/politicas/',
    ogLocale: 'en_US',
    metaTitle: 'RCSD Board Policies Manual — Redwood City School District',
    metaDescription: 'Interactive and machine-readable school board policies, bylaws, and administrative regulations of the Redwood City School District.',
    jsonLdName: 'Redwood City School District Board Policies Manual',
    h1: 'Board Policies Manual',
    subtitle: "Redwood City School District's active board policies, bylaws, and administrative regulations catalog. Click on any row to load and browse the policy details.",
    disclaimer: 'Not an official District document; independently assembled by <a href="https://github.com/dweekly/rcsd-meetings" style="color:#664d03">David Weekly</a>. May contain errors. Questions? <a href="mailto:team@rcsd.info" style="color:#664d03">Contact us</a>.',
    searchPlaceholder: 'Search by policy code (e.g. 0100) or title keyword...',
    searchAriaLabel: 'Search policies',
    filterAll: 'All',
    filterBP: 'Policies (BP)',
    filterAR: 'Regulations (AR)',
    filterBB: 'Bylaws/Exhibits',
    unmodified: 'Unmodified',
    loading: '⚡ Loading policy text from machine-readable JSON...',
    noResultsTitle: 'No matching policies found',
    noResultsBody: 'Try searching for a different keyword or checking your filters. For example, search for "0100" or "Equity".',
    // Strings used by the client-side drawer script
    client: {
      lang: 'en',
      dateLocale: 'en-US',
      revisionId: 'REVISION ID',
      revised: 'REVISED',
      checked: 'CHECKED',
      na: 'N/A',
      official: 'Official Version on Simbli ↗',
      viewJson: 'View JSON ↗',
      bodyNote: '',
      legalRefs: 'Legal & Management References',
      crossRefs: 'Cross References',
      loadError: 'Failed to load policy text:',
    },
  },
  es: {
    lang: 'es',
    htmlLang: 'es',
    outputDir: resolve(DOCS_DIR, 'politicas'),
    canonical: 'https://rcsd.info/politicas/',
    altLangHref: '/policies/',
    ogLocale: 'es_US',
    metaTitle: 'Manual de Políticas de la Mesa Directiva de RCSD — Distrito Escolar de Redwood City',
    metaDescription: 'Políticas, estatutos y reglamentos administrativos de la Mesa Directiva del Distrito Escolar de Redwood City, con títulos en español y búsqueda interactiva.',
    jsonLdName: 'Manual de Políticas de la Mesa Directiva del Distrito Escolar de Redwood City',
    h1: 'Manual de Políticas de la Mesa Directiva',
    subtitle: 'Catálogo de las políticas, estatutos y reglamentos vigentes de la Mesa Directiva del Distrito Escolar de Redwood City. Haz clic en una política para ver los detalles. El texto completo está disponible solo en inglés por ahora.',
    disclaimer: 'No es un documento oficial del Distrito; compilado independientemente por <a href="https://github.com/dweekly/rcsd-meetings" style="color:#664d03">David Weekly</a>. Los títulos fueron traducidos automáticamente con IA y pueden contener errores. <a href="mailto:team@rcsd.info" style="color:#664d03">Contáctenos</a>.',
    searchPlaceholder: 'Busca por número de política (ej. 0100) o palabra clave...',
    searchAriaLabel: 'Buscar políticas',
    filterAll: 'Todas',
    filterBP: 'Políticas (BP)',
    filterAR: 'Reglamentos (AR)',
    filterBB: 'Estatutos/Anexos',
    unmodified: 'Sin modificar',
    loading: '⚡ Cargando el texto de la política desde el JSON...',
    noResultsTitle: 'No encontramos políticas con esa búsqueda',
    noResultsBody: 'Prueba con otra palabra o cambia los filtros. Por ejemplo, busca "0100" o "Equidad".',
    client: {
      lang: 'es',
      dateLocale: 'es-MX',
      revisionId: 'ID DE REVISIÓN',
      revised: 'REVISADA',
      checked: 'VERIFICADA',
      na: 'N/D',
      official: 'Versión oficial en Simbli ↗',
      viewJson: 'Ver JSON ↗',
      bodyNote: 'El texto completo de la política está disponible solo en inglés por ahora.',
      legalRefs: 'Referencias legales y administrativas',
      crossRefs: 'Referencias cruzadas',
      loadError: 'No se pudo cargar el texto de la política:',
    },
  },
};

// Both languages alternate to the same pair of URLs.
const HREFLANG = [
  { lang: 'x-default', href: 'https://rcsd.info/policies/' },
  { lang: 'en', href: 'https://rcsd.info/policies/' },
  { lang: 'es', href: 'https://rcsd.info/politicas/' },
];

function policiesIndexJsonLd(policies, page, titleFor) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": page.jsonLdName,
    "description": page.metaDescription,
    "url": page.canonical,
    "publisher": {
      "@type": "GovernmentOrganization",
      "name": "Redwood City School District",
      "url": "https://www.rcsdk8.net"
    },
    "about": {
      "@type": "GovernmentOrganization",
      "name": "Redwood City School District Board of Trustees"
    },
    "inLanguage": page.lang,
    "genre": "Government Policy",
    "hasPart": policies.map((p) => ({
      "@type": ["Legislation", "DigitalDocument"],
      "name": `${p.type} ${p.code}: ${titleFor(p)}`,
      "legislationIdentifier": `${p.type} ${p.code}`,
      "legislationType": p.type === 'BP' ? 'Board Policy' : (p.type === 'AR' ? 'Administrative Regulation' : 'Board Bylaw'),
      "url": `https://rcsd.info/board-policies/${p.code}-${p.type}.json`,
      "dateModified": p.lastRevised || undefined
    }))
  };

  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

const pageCSS = `
    .policies-header {
      background: var(--green-deep);
      color: var(--cream);
      padding: 4rem 2rem 3rem;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .policies-header::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 20% 80%, rgba(74,140,106,0.3) 0%, transparent 60%),
        radial-gradient(ellipse at 80% 20%, rgba(196,132,45,0.15) 0%, transparent 50%);
      pointer-events: none;
    }
    .policies-header-inner {
      max-width: 960px;
      margin: 0 auto;
      position: relative;
    }
    .policies-header h1 {
      font-family: 'Fraunces', Georgia, serif;
      font-size: clamp(2rem, 5vw, 3rem);
      font-weight: 300;
      line-height: 1.15;
      color: #fff;
    }
    .policies-header p {
      margin-top: 1rem;
      font-size: 0.95rem;
      color: rgba(255,255,255,0.6);
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
      font-style: italic;
    }

    /* ---- DISCLAIMER (same banner as meetings/budget pages) ---- */
    .disclaimer {
      background: #fff3cd;
      border-bottom: 2px solid #e0c36a;
      padding: 0.75rem 1.5rem;
      text-align: center;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.72rem;
      letter-spacing: 0.01em;
      line-height: 1.6;
      color: #664d03;
    }

    /* ---- SEARCH AND CONTROLS ---- */
    .controls-container {
      max-width: 960px;
      margin: 1.5rem auto 2rem;
      padding: 0 2rem;
      position: relative;
      z-index: 10;
    }
    .search-panel {
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 6px;
      padding: 1rem 1.5rem;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .search-wrapper {
      flex: 1;
      min-width: 250px;
      position: relative;
    }
    .search-input {
      width: 100%;
      padding: 0.6rem 1rem 0.6rem 2.2rem;
      font-family: inherit;
      font-size: 0.9rem;
      border: 1px solid var(--rule);
      border-radius: 4px;
      outline: none;
      background: var(--cream);
      transition: border-color 0.15s, background-color 0.15s;
    }
    .search-input:focus {
      border-color: var(--green-light);
      background: #fff;
    }
    .search-icon {
      position: absolute;
      left: 0.8rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .filter-buttons {
      display: flex;
      gap: 0.5rem;
    }
    .filter-btn {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.65rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.5rem 0.8rem;
      border: 1px solid var(--rule);
      background: #fff;
      cursor: pointer;
      transition: all 0.15s;
      border-radius: 3px;
    }
    .filter-btn:hover {
      border-color: var(--green-light);
      color: var(--green-mid);
    }
    .filter-btn.active {
      background: var(--green-deep);
      color: #fff;
      border-color: var(--green-deep);
    }

    /* ---- MAIN CONTENT ---- */
    .main-content {
      max-width: 960px;
      margin: 0 auto;
      padding: 0 2rem 4rem;
    }
    .sec-card {
      margin-bottom: 2.5rem;
      background: #fff;
      border: 1px solid var(--rule-light);
      box-shadow: 0 1px 4px rgba(0,0,0,0.02);
    }
    .sec-header {
      background: var(--cream-dark);
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--rule-light);
      display: flex;
      align-items: baseline;
      gap: 0.8rem;
    }
    .sec-code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.75rem;
      color: var(--green-light);
      font-weight: 600;
    }
    .sec-title {
      font-family: 'Fraunces', serif;
      font-size: 1.15rem;
      font-weight: 500;
      color: var(--green-deep);
    }
    .policy-list {
      display: flex;
      flex-direction: column;
    }
    .policy-row {
      border-bottom: 1px solid var(--rule-light);
      padding: 0.8rem 1.5rem;
      cursor: pointer;
      transition: background-color 0.15s;
    }
    .policy-row:last-child {
      border-bottom: none;
    }
    .policy-row:hover {
      background: var(--green-wash);
    }
    .policy-row-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    .policy-left {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      flex-wrap: wrap;
    }
    .policy-code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text);
      min-width: 60px;
    }
    .policy-title {
      font-family: 'Newsreader', serif;
      font-size: 0.92rem;
      color: var(--green-deep);
      font-weight: 500;
    }
    .policy-badges {
      display: flex;
      gap: 0.3rem;
      align-items: center;
    }
    .type-badge {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.58rem;
      text-transform: uppercase;
      padding: 0.1rem 0.4rem;
      border-radius: 2px;
    }
    .type-badge--bp { background: var(--green-wash); color: var(--green-mid); border: 1px solid rgba(74,140,106,0.3); }
    .type-badge--ar { background: var(--cream-dark); color: var(--text-secondary); border: 1px solid var(--rule); }
    .type-badge--bb { background: var(--amber-light); color: var(--amber); border: 1px solid rgba(196,132,45,0.3); }

    .policy-right {
      display: flex;
      align-items: center;
      gap: 1rem;
      color: var(--text-muted);
      font-size: 0.72rem;
      font-family: 'IBM Plex Mono', monospace;
    }
    .policy-date {
      white-space: nowrap;
    }
    .expand-chevron {
      transition: transform 0.2s;
      font-size: 0.75rem;
    }
    .policy-row.active .expand-chevron {
      transform: rotate(180deg);
      color: var(--green-light);
    }

    /* ---- POLICY DRAWER ---- */
    .policy-drawer {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease-out;
      background: var(--cream);
      margin: 0 -1.5rem -0.8rem;
      border-top: 0 solid var(--rule-light);
    }
    .policy-row.active .policy-drawer {
      max-height: 1200px;
      border-top-width: 1px;
      overflow-y: auto;
      padding: 1.5rem;
      margin-top: 0.8rem;
    }
    .drawer-content {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 0.88rem;
      line-height: 1.6;
      color: var(--text);
      max-width: 720px;
      margin: 0 auto;
    }
    .drawer-loading {
      text-align: center;
      color: var(--text-muted);
      padding: 2rem 0;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.72rem;
    }
    .drawer-meta-bar {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid var(--rule);
      padding-bottom: 0.6rem;
      margin-bottom: 1rem;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.65rem;
      color: var(--text-muted);
    }
    .drawer-actions {
      display: flex;
      gap: 0.8rem;
    }
    .drawer-btn {
      color: var(--green-mid);
      text-decoration: none;
    }
    .drawer-btn:hover {
      color: var(--green-deep);
      text-decoration: underline;
    }
    /* Spanish page: "body text is English-only for now" note */
    .policy-lang-note {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.68rem;
      color: #664d03;
      background: #fff3cd;
      border: 1px solid #e0c36a;
      border-radius: 3px;
      padding: 0.5rem 0.8rem;
      margin-bottom: 1rem;
    }
    .policy-body-text {
      white-space: pre-wrap;
      margin-bottom: 2rem;
    }
    .policy-refs-section {
      background: #fff;
      border: 1px solid var(--rule-light);
      padding: 1.2rem;
      margin-top: 1.5rem;
      font-size: 0.8rem;
    }
    .policy-refs-title {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.65rem;
      text-transform: uppercase;
      color: var(--green-light);
      letter-spacing: 0.05em;
      margin-bottom: 0.6rem;
      border-bottom: 1px solid var(--rule-light);
      padding-bottom: 0.3rem;
    }
    .ref-group {
      margin-bottom: 1rem;
    }
    .ref-group:last-child {
      margin-bottom: 0;
    }
    .ref-group-title {
      font-weight: 600;
      margin-bottom: 0.3rem;
      color: var(--text);
    }
    .ref-item {
      margin-left: 1rem;
      margin-bottom: 0.25rem;
      line-height: 1.45;
    }
    .ref-code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.72rem;
      font-weight: 500;
    }
    .no-results {
      text-align: center;
      padding: 3rem 0;
      color: var(--text-muted);
      display: none;
      background: #fff;
      border: 1px solid var(--rule-light);
    }
    .no-results h3 {
      font-family: 'Fraunces', serif;
      margin-bottom: 0.5rem;
      color: var(--green-deep);
    }
    .no-results p {
      font-size: 0.88rem;
      max-width: 400px;
      margin: 0 auto;
    }
  `;

// Dynamic Javascript for Client-Side Interactivity (loading details dynamically!)
// `clientLabels` is the per-language strings object serialized into the page.
function clientScript(clientLabels) {
  return `
    document.addEventListener('DOMContentLoaded', () => {
      const L = ${JSON.stringify(clientLabels)};
      const searchInput = document.getElementById('search-input');
      const filterBtns = document.querySelectorAll('.filter-btn');
      const policyRows = document.querySelectorAll('.policy-row');
      const secCards = document.querySelectorAll('.sec-card');
      const noResults = document.getElementById('no-results');

      let currentSearch = '';
      let currentFilter = 'all';

      // Accent-insensitive compare so "filosofia" matches "Filosofía".
      function norm(s) {
        return (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
      }

      // Simbli dates are MM/DD/YYYY; Spanish renders dd/mm/yyyy (es-MX).
      function fmtDate(s) {
        if (!s) return L.na;
        if (L.lang === 'es') {
          const m = s.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);
          if (m) return m[2] + '/' + m[1] + '/' + m[3];
        }
        return s;
      }

      // 1. Search filter logic
      function updateVisibility() {
        let totalVisible = 0;
        const q = norm(currentSearch);

        secCards.forEach(card => {
          const rowsInCard = card.querySelectorAll('.policy-row');
          let visibleInCard = 0;

          rowsInCard.forEach(row => {
            const code = row.getAttribute('data-code') || '';
            const title = row.getAttribute('data-title') || '';
            // The other language's title — so Spanish searches also work on
            // the English page and vice versa.
            const titleAlt = row.getAttribute('data-title-alt') || '';
            const type = row.getAttribute('data-type') || '';

            const matchesSearch = !q || code.toLowerCase().includes(q)
              || norm(title).includes(q) || norm(titleAlt).includes(q);
            const matchesFilter = currentFilter === 'all' || type === currentFilter;

            if (matchesSearch && matchesFilter) {
              row.style.display = 'block';
              visibleInCard++;
              totalVisible++;
            } else {
              row.style.display = 'none';
              // Collapse if hidden
              row.classList.remove('active');
            }
          });

          // Show/hide parent section card based on child visibility
          if (visibleInCard > 0) {
            card.style.display = 'block';
          } else {
            card.style.display = 'none';
          }
        });

        // Show/hide no results message
        if (totalVisible === 0) {
          noResults.style.display = 'block';
        } else {
          noResults.style.display = 'none';
        }
      }

      // Input event listener
      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim();
        updateVisibility();
      });

      // Filter button listeners
      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          filterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentFilter = btn.getAttribute('data-filter');
          updateVisibility();
        });
      });

      // 2. Expand policy rows dynamically via fetch
      policyRows.forEach(row => {
        row.addEventListener('click', async (e) => {
          // If clicked a link inside the drawer, don't collapse
          if (e.target.closest('.drawer-actions') || e.target.closest('.policy-refs-section')) {
            return;
          }

          const wasActive = row.classList.contains('active');

          // Collapse all others
          policyRows.forEach(r => r.classList.remove('active'));

          if (!wasActive) {
            row.classList.add('active');

            const code = row.getAttribute('data-code');
            const type = row.getAttribute('data-type');
            const revid = row.getAttribute('data-revid');
            const drawer = row.querySelector('.policy-drawer');
            const drawerInner = row.querySelector('.drawer-inner');

            // Load data if not already loaded
            if (drawer.getAttribute('data-loaded') !== 'true') {
              try {
                const res = await fetch(\`/board-policies/\${code}-\${type}.json\`);
                if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
                const data = await res.json();

                // Format details
                const scrapedDate = data._metadata?.scrapedAt ? new Date(data._metadata.scrapedAt).toLocaleDateString(L.dateLocale) : L.na;
                const officialUrl = data._metadata?.source || \`https://simbli.eboardsolutions.com/Policy/ViewPolicy.aspx?S=36030397&revid=\${data.revid}\`;
                let detailsHtml = \`
                  <div class="drawer-meta-bar">
                    <div>\${L.revisionId}: \${data.revid} | \${L.revised}: \${fmtDate(data.lastRevised)} | \${L.checked}: \${scrapedDate}</div>
                    <div class="drawer-actions">
                      <a href="\${officialUrl}" class="drawer-btn" target="_blank" style="margin-right: 1.5rem;">\${L.official}</a>
                      <a href="/board-policies/\${code}-\${type}.json" class="drawer-btn" target="_blank">\${L.viewJson}</a>
                    </div>
                  </div>
                  \${L.bodyNote ? '<div class="policy-lang-note">' + L.bodyNote + '</div>' : ''}
                  <div class="policy-body-text">\${escapeHtml(data.contentText)}</div>
                \`;

                // Add Footnotes/Citations if present
                if (data.footnotes && data.footnotes.length > 0) {
                  detailsHtml += \`<div class="policy-refs-section">
                    <div class="policy-refs-title">\${L.legalRefs}</div>\`;

                  data.footnotes.forEach(group => {
                    detailsHtml += \`<div class="ref-group">
                      <div class="ref-group-title">\${group.type}</div>\`;
                    group.references.forEach(ref => {
                      const link = ref.url ? \`<a href="\${ref.url}" target="_blank" rel="noopener">\${ref.code}</a>\` : \`<span class="ref-code">\${ref.code}</span>\`;
                      detailsHtml += \`<div class="ref-item">\${link} - \${ref.description}</div>\`;
                    });
                    detailsHtml += \`</div>\`;
                  });

                  detailsHtml += \`</div>\`;
                }

                // Add Cross References if present
                if (data.crossRefs && data.crossRefs.length > 0) {
                  detailsHtml += \`<div class="policy-refs-section">
                    <div class="policy-refs-title">\${L.crossRefs}</div>
                    <div class="doc-school-grid" style="display: flex; flex-direction: column; gap: 0.25rem;">\`;

                  data.crossRefs.forEach(ref => {
                    detailsHtml += \`
                      <div style="font-size: 0.75rem;">
                        <span style="font-family: monospace; font-weight: bold; width: 60px; display: inline-block;">\${ref.code} \${ref.type}</span>
                        <span>\${ref.title}</span>
                      </div>
                    \`;
                  });

                  detailsHtml += \`</div></div>\`;
                }

                drawerInner.innerHTML = detailsHtml;
                drawer.setAttribute('data-loaded', 'true');
              } catch (err) {
                drawerInner.innerHTML = \`<div style="color:var(--coral); text-align:center; padding:1rem;">\${L.loadError} \${err.message}</div>\`;
              }
            }
          }
        });
      });

      function escapeHtml(text) {
        if (!text) return '';
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }
    });
  `;
}

// ---- Per-language page assembly ----

function buildPolicyPage({ page, sections, policiesBySection, policies, titlesEs }) {
  const isEs = page.lang === 'es';
  // Per-policy display title: Spanish page uses the AI-translated title,
  // falling back to English if a translation is somehow missing.
  const esTitle = (p) => titlesEs.titles[`${p.code}-${p.type}`]?.es || p.title;
  const titleFor = (p) => (isEs ? esTitle(p) : p.title);
  const altTitleFor = (p) => (isEs ? p.title : esTitle(p));
  const sectionNameFor = (sec) => (isEs ? (titlesEs.sections[sec.code]?.es || sec.name) : sec.name);

  // Compile section lists of policies into HTML structures
  let sectionsHtml = '';
  for (const sec of sections) {
    const secPolicies = policiesBySection[sec.code] || [];
    if (secPolicies.length === 0) continue;

    let pRowsHtml = '';
    for (const p of secPolicies) {
      const typeBadgeClass = p.type.toLowerCase() === 'bp' ? 'type-badge--bp'
                           : p.type.toLowerCase() === 'ar' ? 'type-badge--ar'
                           : 'type-badge--bb';

      pRowsHtml += `
        <div class="policy-row" data-code="${escapeAttr(p.code)}" data-title="${escapeAttr(titleFor(p))}" data-title-alt="${escapeAttr(altTitleFor(p))}" data-type="${escapeAttr(p.type)}" data-revid="${escapeAttr(p.revid)}">
          <div class="policy-row-header">
            <div class="policy-left">
              <span class="policy-code">${escapeText(p.code)}</span>
              <span class="policy-title">${escapeText(titleFor(p))}</span>
              <span class="policy-badges">
                <span class="type-badge ${typeBadgeClass}">${escapeText(p.type)}</span>
              </span>
            </div>
            <div class="policy-right">
              <span class="policy-date">${formatUsDate(p.lastRevised, page.lang) || page.unmodified}</span>
              <span class="expand-chevron">▼</span>
            </div>
          </div>
          <div class="policy-drawer" data-loaded="false">
            <div class="drawer-inner">
              <div class="drawer-loading">${page.loading}</div>
            </div>
          </div>
        </div>
      `;
    }

    sectionsHtml += `
      <div class="sec-card" data-sec-code="${escapeAttr(sec.code)}">
        <div class="sec-header">
          <span class="sec-code">${escapeText(sec.code)}</span>
          <h3 class="sec-title">${escapeText(sectionNameFor(sec))}</h3>
        </div>
        <div class="policy-list">
          ${pRowsHtml}
        </div>
      </div>
    `;
  }

  // Compile complete HTML document
  return `<!DOCTYPE html>
<html lang="${page.htmlLang}">
<head>
${headMeta({
  title: page.metaTitle,
  description: page.metaDescription,
  canonical: page.canonical,
  ogLocale: page.ogLocale,
  ogImageKey: 'page-home',
  hreflang: HREFLANG,
  jsonLd: policiesIndexJsonLd(policies, page, titleFor),
  extraHead: `<link rel="describedby" href="/llms.txt" type="text/markdown">`,
  pageCSS,
})}
</head>
<body>

${siteNav({ activePage: 'district', lang: page.lang, altLangHref: page.altLangHref })}

<header class="policies-header">
  <div class="policies-header-inner">
    <h1>${page.h1}</h1>
    <p>${page.subtitle}</p>
  </div>
</header>

<div class="disclaimer">
  ${page.disclaimer}
</div>

<div class="controls-container">
  <div class="search-panel">
    <div class="search-wrapper">
      <span class="search-icon">🔍</span>
      <input type="text" id="search-input" class="search-input" placeholder="${escapeAttr(page.searchPlaceholder)}" aria-label="${escapeAttr(page.searchAriaLabel)}">
    </div>
    <div class="filter-buttons">
      <button class="filter-btn active" data-filter="all">${page.filterAll} (${policies.length})</button>
      <button class="filter-btn" data-filter="BP">${page.filterBP}</button>
      <button class="filter-btn" data-filter="AR">${page.filterAR}</button>
      <button class="filter-btn" data-filter="BB">${page.filterBB}</button>
    </div>
  </div>
</div>

<main class="main-content">
  <div id="policies-catalog">
    ${sectionsHtml}
  </div>

  <div id="no-results" class="no-results">
    <h3>${page.noResultsTitle}</h3>
    <p>${page.noResultsBody}</p>
  </div>
</main>

${siteFooter({ lang: page.lang })}

<script>
${clientScript(page.client)}
</script>

</body>
</html>
`;
}

function main() {
  console.log('Publishing policies in machine-readable form...');

  if (!existsSync(INDEX_DATA_PATH)) {
    console.error(`Error: ${INDEX_DATA_PATH} does not exist. Please run scrape:policies first.`);
    process.exit(1);
  }
  if (!existsSync(TITLES_ES_PATH)) {
    console.error(`Error: ${TITLES_ES_PATH} does not exist. Run scripts/translate-policy-titles.mjs first.`);
    process.exit(1);
  }

  // 1. Copy policies-index.json to docs/
  const indexJsonStr = readFileSync(INDEX_DATA_PATH, 'utf-8');
  writeFileSync(INDEX_DOCS_PATH, indexJsonStr);
  console.log(`Copied global index to ${INDEX_DOCS_PATH}`);

  // 2. Copy individual policy JSONs to docs/board-policies/
  mkdirSync(POLICIES_DOCS_DIR, { recursive: true });
  const dataFiles = readdirSync(POLICIES_DATA_DIR).filter(f => f.endsWith('.json'));
  console.log(`Copying ${dataFiles.length} detailed policy JSONs to public docs...`);

  for (const filename of dataFiles) {
    const srcPath = resolve(POLICIES_DATA_DIR, filename);
    const destPath = resolve(POLICIES_DOCS_DIR, filename);
    writeFileSync(destPath, readFileSync(srcPath));
  }
  console.log(`Successfully published all detailed policy JSON files.`);

  // 3. Build interactive HTML pages: docs/policies/ (EN) + docs/politicas/ (ES)
  const indexData = JSON.parse(indexJsonStr);
  const titlesEs = JSON.parse(readFileSync(TITLES_ES_PATH, 'utf-8'));

  const sections = indexData.sections || [];
  const policies = indexData.policies || [];

  // Group policies by section
  const policiesBySection = {};
  for (const sec of sections) {
    policiesBySection[sec.code] = [];
  }

  for (const pol of policies) {
    const secCode = pol.section || '0000';
    if (!policiesBySection[secCode]) {
      policiesBySection[secCode] = [];
    }
    policiesBySection[secCode].push(pol);
  }

  // Sort policies in each section by code
  for (const secCode of Object.keys(policiesBySection)) {
    policiesBySection[secCode].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  const missingEs = policies.filter(p => !titlesEs.titles[`${p.code}-${p.type}`]);
  if (missingEs.length > 0) {
    console.warn(`Warning: ${missingEs.length} policies have no Spanish title (falling back to English). Re-run scripts/translate-policy-titles.mjs.`);
  }

  for (const page of Object.values(PAGES)) {
    mkdirSync(page.outputDir, { recursive: true });
    const html = buildPolicyPage({ page, sections, policiesBySection, policies, titlesEs });
    const outPath = resolve(page.outputDir, 'index.html');
    writeFileSync(outPath, html);
    console.log(`Successfully built interactive HTML policies index (${page.lang}) at ${outPath}`);
  }
}

main();
