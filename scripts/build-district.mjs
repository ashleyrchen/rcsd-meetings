#!/usr/bin/env node
/**
 * Generate docs/district/index.html and docs/distrito/index.html
 * from templates/district-{en,es}.html + shared html-parts.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { headMeta, siteNav, siteFooter } from './html-parts.mjs';
import { scanDocuments, prettyDocName, prettySchool, R2_BASE } from './document-inventory.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Scan document inventory once for both EN and ES pages
const documentInventory = scanDocuments(ROOT);

// ---- Page-specific CSS (shared by both EN and ES) ----
const districtCSS = `
  .section a {
    color: var(--green-mid);
    text-decoration-color: var(--rule);
    text-underline-offset: 2px;
    transition: color 0.15s, text-decoration-color 0.15s;
  }
  .section a:hover {
    color: var(--green-deep);
    text-decoration-color: var(--green-mid);
  }

  /* ---- HEADER ---- */
  .site-header {
    background: var(--green-deep);
    color: var(--cream);
    padding: 0;
    position: relative;
    overflow: hidden;
  }

  .site-header::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 20% 80%, rgba(74,140,106,0.3) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 20%, rgba(196,132,45,0.15) 0%, transparent 50%);
    pointer-events: none;
  }

  .header-inner {
    max-width: 900px;
    margin: 0 auto;
    padding: 4rem 2rem 3.5rem;
    position: relative;
  }

  .header-district {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--green-light);
    margin-bottom: 1.2rem;
  }

  .header-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(2rem, 5vw, 3.2rem);
    font-weight: 300;
    line-height: 1.15;
    color: #fff;
    max-width: 600px;
    font-optical-sizing: auto;
  }

  .header-subtitle {
    margin-top: 1.5rem;
    font-size: 0.95rem;
    color: rgba(255,255,255,0.6);
    line-height: 1.6;
    max-width: 520px;
    font-style: italic;
  }

  .header-meta {
    margin-top: 2rem;
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .header-stat {
    display: flex;
    flex-direction: column;
  }

  .header-stat-value {
    font-family: 'Fraunces', serif;
    font-size: 1.8rem;
    font-weight: 600;
    color: #fff;
    line-height: 1;
  }

  .header-stat-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.45);
    margin-top: 0.35rem;
  }

  /* ---- DISCLAIMER ---- */
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

  /* ---- LANG SWITCH ---- */
  .lang-switch {
    background: var(--cream-dark);
    border-bottom: 1px solid var(--rule);
    text-align: center;
    padding: 0.5rem 1rem;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
  }
  .lang-switch a {
    color: var(--green-mid);
    text-decoration: none;
  }
  .lang-switch a:hover {
    text-decoration: underline;
  }

  /* ---- NAV ---- */
  .toc {
    background: var(--cream-dark);
    border-bottom: 1px solid var(--rule);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .toc-inner {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    gap: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .toc-inner::-webkit-scrollbar { display: none; }

  .toc a {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.9rem 0.9rem;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: color 0.2s, border-color 0.2s;
  }

  .toc a:hover {
    color: var(--green-mid);
    border-bottom-color: var(--green-light);
  }

  /* ---- MAIN ---- */
  .content {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 2rem 6rem;
  }

  /* ---- SECTIONS ---- */
  .section {
    padding-top: 3.5rem;
  }

  .section-rule {
    width: 100%;
    height: 1px;
    background: var(--rule);
    margin-bottom: 0;
  }

  .section-num {
    font-family: 'Fraunces', serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--green-light);
    display: inline-block;
    margin-bottom: 0.3rem;
    letter-spacing: 0.02em;
  }

  h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 400;
    line-height: 1.2;
    color: var(--green-deep);
    margin-bottom: 1.5rem;
    font-optical-sizing: auto;
  }

  h3 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text);
    margin-top: 2.5rem;
    margin-bottom: 0.8rem;
    line-height: 1.3;
  }

  p {
    margin-bottom: 1rem;
    max-width: 640px;
  }

  .wide p {
    max-width: none;
  }

  .source {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
  }
  .source a {
    color: var(--text-muted);
    text-decoration: underline;
    text-decoration-color: var(--rule-light);
    text-underline-offset: 2px;
  }
  .source a:hover {
    color: var(--green-mid);
    text-decoration-color: var(--green-mid);
  }

  .source::before {
    content: '';
  }

  /* ---- TABLES ---- */
  .table-wrap {
    overflow-x: auto;
    margin: 1.2rem 0 1.5rem;
    -webkit-overflow-scrolling: touch;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
    line-height: 1.45;
  }

  thead th {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: left;
    padding: 0.6rem 0.8rem;
    border-bottom: 2px solid var(--green-deep);
    white-space: nowrap;
  }

  thead th.num {
    text-align: right;
  }

  tbody td {
    padding: 0.55rem 0.8rem;
    border-bottom: 1px solid var(--rule-light);
    vertical-align: top;
  }

  tbody td.num {
    text-align: right;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.82rem;
    white-space: nowrap;
  }

  tbody td.school-name {
    font-weight: 500;
    white-space: nowrap;
  }

  tbody tr:last-child td {
    border-bottom: 2px solid var(--rule);
  }

  tbody tr.total-row td {
    font-weight: 500;
    border-top: 2px solid var(--green-deep);
    border-bottom: 2px solid var(--green-deep);
    background: var(--green-wash);
  }

  tbody tr:hover td {
    background: var(--green-wash);
  }

  /* Visual bar inside table cells */
  .bar-cell {
    position: relative;
    min-width: 100px;
  }

  .bar {
    display: inline-block;
    height: 6px;
    border-radius: 3px;
    margin-right: 0.5rem;
    vertical-align: middle;
    transition: width 0.4s ease;
  }

  .bar-green { background: var(--green-light); }
  .bar-amber { background: var(--amber); }
  .bar-coral { background: var(--coral); }

  /* ---- CALLOUT BOXES ---- */
  .callout {
    background: var(--green-wash);
    border-left: 3px solid var(--green-light);
    padding: 1.2rem 1.5rem;
    margin: 1.5rem 0;
    font-size: 0.92rem;
    max-width: none;
  }

  .callout p {
    max-width: none;
    margin-bottom: 0.5rem;
  }

  .callout p:last-child { margin-bottom: 0; }

  /* ---- TREND INDICATORS ---- */
  .trend-up { color: var(--green-mid); }
  .trend-down { color: var(--coral); }
  .trend-flat { color: var(--text-muted); }

  .trend-arrow {
    font-size: 0.75em;
    vertical-align: middle;
    margin-left: 0.2rem;
  }

  /* ---- GOAL CARDS ---- */
  .goal-grid {
    display: grid;
    gap: 1.5rem;
    margin: 1.5rem 0;
  }

  .goal-card {
    border: 1px solid var(--rule);
    padding: 1.5rem;
    background: #fff;
  }

  .goal-card h4 {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--green-light);
    margin-bottom: 0.3rem;
  }

  .goal-card h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.05rem;
  }

  .goal-card p {
    font-size: 0.9rem;
    max-width: none;
  }

  .goal-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.8rem;
    margin-bottom: 1rem;
  }

  .goal-metric {
    background: var(--cream);
    padding: 0.8rem;
  }

  .goal-metric-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.3rem;
  }

  .goal-metric-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .goal-metric-value {
    font-family: 'Fraunces', serif;
    font-size: 1.3rem;
    font-weight: 600;
    line-height: 1;
  }

  .goal-metric-delta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
  }

  .goal-metric-target {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
  }

  /* ---- TRENDS SECTION ---- */
  .trend-item {
    padding: 1.5rem 0;
    border-bottom: 1px solid var(--rule-light);
  }

  .trend-item:last-child { border-bottom: none; }

  .trend-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.4rem;
  }

  .trend-item p {
    font-size: 0.92rem;
    max-width: none;
  }

  /* ---- GLOSSARY ---- */
  .glossary {
    columns: 2;
    column-gap: 2.5rem;
    margin-top: 1.5rem;
  }

  .glossary-item {
    break-inside: avoid;
    margin-bottom: 1rem;
    font-size: 0.88rem;
  }

  .glossary-term {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--green-deep);
  }

  .glossary-def {
    color: var(--text-secondary);
    margin-top: 0.15rem;
    line-height: 1.5;
  }

  /* ---- MARGIN LINKS ---- */
  .has-margin-link {
    position: relative;
  }

  .margin-link {
    position: absolute;
    left: 660px;
    top: 0;
    width: 160px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.02em;
    line-height: 1.9;
  }

  .margin-link a {
    display: block;
    color: var(--green-mid);
    text-decoration: none;
    opacity: 0.85;
    transition: opacity 0.2s;
  }

  .margin-link a:hover {
    opacity: 1;
    color: var(--green-deep);
  }

  .margin-link a::before {
    display: inline-block;
    width: 1.2em;
    font-size: 0.9em;
  }

  .margin-link a.watch::before { content: '\\25b6'; }
  .margin-link a.read::before { content: '\\2197'; }

  /* ---- DOCUMENT TABS ---- */
  .doc-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--rule);
    margin-top: 1rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .doc-tab {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.02em;
    padding: 0.7rem 1.2rem;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s;
  }

  .doc-tab:hover {
    color: var(--green-mid);
  }

  .doc-tab.active {
    color: var(--green-deep);
    border-bottom-color: var(--green-mid);
  }

  .doc-panel {
    display: none;
    padding-top: 1.2rem;
  }

  .doc-panel.active {
    display: block;
  }

  .doc-year-heading {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    margin: 1.2rem 0 0.5rem;
  }

  .doc-year-heading:first-child {
    margin-top: 0;
  }

  .doc-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .doc-link {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.68rem;
    color: var(--green-mid);
    text-decoration: none;
    padding: 0.25rem 0;
  }

  .doc-link:hover {
    color: var(--green-deep);
    text-decoration: underline;
  }

  .doc-school-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.4rem;
  }

  .doc-school-link {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.68rem;
    color: var(--green-mid);
    text-decoration: none;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--rule-light);
    background: #fff;
    text-align: center;
    transition: all 0.15s;
  }

  .doc-school-link:hover {
    border-color: var(--green-light);
    background: var(--green-wash);
    color: var(--green-deep);
  }

  .doc-lang-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0.8rem 0 0.3rem;
  }

  /* ---- RESPONSIVE ---- */
  @media (max-width: 900px) {
    .margin-link { display: none; }
  }

  @media (max-width: 640px) {
    html { font-size: 15px; }
    .header-inner { padding: 3rem 1.2rem 2.5rem; }
    .content { padding: 0 1.2rem 4rem; }
    .header-meta { gap: 1.5rem; }
    .glossary { columns: 1; }
    .toc a { padding: 0.8rem 0.6rem; font-size: 0.6rem; }
    .goal-metrics { grid-template-columns: 1fr; }
    .doc-school-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
    .doc-tab { padding: 0.6rem 0.8rem; font-size: 0.6rem; }
  }

  /* page-specific footer overrides */
  .site-footer { font-size: 0.8rem; text-align: left; }
  .footer-nav { margin-top: 1rem; }
  .footer-nav a { font-size: 0.68rem; margin: 0 1.5rem 0 0; }`;

// ---- i18n labels for documents section ----
const DOC_LABELS = {
  en: {
    docsTitle: 'Documents & Reports',
    docsSubtitle: 'School plans, budgets, and accountability reports archived from official sources.',
    docsBudget: 'Budget',
    docsLcap: 'LCAP',
    docsSpsa: 'School Plans (SPSA)',
    docsSarc: 'School Report Cards',
    docsEnglish: 'English',
    docsSpanish: 'Espa\u00f1ol',
  },
  es: {
    docsTitle: 'Documentos e Informes',
    docsSubtitle: 'Planes escolares, presupuestos e informes de rendici\u00f3n de cuentas archivados de fuentes oficiales.',
    docsBudget: 'Presupuesto',
    docsLcap: 'LCAP',
    docsSpsa: 'Planes Escolares (SPSA)',
    docsSarc: 'Boletas Escolares',
    docsEnglish: 'Ingl\u00e9s',
    docsSpanish: 'Espa\u00f1ol',
  },
};

/**
 * Render the Documents & Reports section HTML for a given language.
 */
function renderDocuments(lang) {
  const L = DOC_LABELS[lang];
  const inv = documentInventory;
  const hasDocs = Object.keys(inv.budget).length || Object.keys(inv.lcap).length ||
    Object.keys(inv.spsa).length || Object.keys(inv.sarc).length;
  if (!hasDocs) return '';

  let html = `<section class="section" id="documents">
  <div class="section-rule"></div>
  <div class="section-num">08</div>
  <h2>${L.docsTitle}</h2>
  <p class="section-subtitle">${L.docsSubtitle}</p>
  <div class="doc-tabs">
    <button class="doc-tab active" data-doc-tab="budget">${L.docsBudget}</button>
    <button class="doc-tab" data-doc-tab="lcap">${L.docsLcap}</button>
    <button class="doc-tab" data-doc-tab="spsa">${L.docsSpsa}</button>
    <button class="doc-tab" data-doc-tab="sarc">${L.docsSarc}</button>
  </div>`;

  // Helper: render doc list, appending meeting date when titles collide
  function renderDocList(docs) {
    // Count how many times each title appears
    const titleCounts = {};
    for (const d of docs) titleCounts[d.title] = (titleCounts[d.title] || 0) + 1;
    let out = '';
    for (const d of docs) {
      const label = titleCounts[d.title] > 1 && d.meetingDate
        ? `${d.title} (${d.meetingDate})` : d.title;
      out += `\n      <a class="doc-link" href="${d.url}" target="_blank" rel="noopener">${label}</a>`;
    }
    return out;
  }

  // Budget panel — grouped by year, sorted by subtype priority
  html += `\n  <div class="doc-panel active" data-doc-panel="budget">`;
  for (const year of Object.keys(inv.budget).sort().reverse()) {
    html += `\n    <h3 class="doc-year-heading">${year}</h3>`;
    html += `\n    <div class="doc-list">`;
    html += renderDocList(inv.budget[year]);
    html += `\n    </div>`;
  }
  html += `\n  </div>`;

  // LCAP panel
  html += `\n  <div class="doc-panel" data-doc-panel="lcap">`;
  for (const year of Object.keys(inv.lcap).sort().reverse()) {
    html += `\n    <h3 class="doc-year-heading">${year}</h3>`;
    html += `\n    <div class="doc-list">`;
    html += renderDocList(inv.lcap[year]);
    html += `\n    </div>`;
  }
  html += `\n  </div>`;

  // SPSA panel — school grid per year
  html += `\n  <div class="doc-panel" data-doc-panel="spsa">`;
  for (const year of Object.keys(inv.spsa).sort().reverse()) {
    html += `\n    <h3 class="doc-year-heading">${year}</h3>`;
    html += `\n    <div class="doc-school-grid">`;
    for (const s of inv.spsa[year]) {
      html += `\n      <a class="doc-school-link" href="${s.url}" target="_blank" rel="noopener">${prettySchool(s.school)}</a>`;
    }
    html += `\n    </div>`;
  }
  html += `\n  </div>`;

  // SARC panel — board-presented SARCs + language-specific versions from artifacts
  html += `\n  <div class="doc-panel" data-doc-panel="sarc">`;
  for (const year of Object.keys(inv.sarc).sort().reverse()) {
    const yearData = inv.sarc[year];
    html += `\n    <h3 class="doc-year-heading">${year}</h3>`;

    // Board-presented SARCs (from document-index.json)
    if (yearData.schools?.length) {
      html += `\n    <div class="doc-school-grid">`;
      for (const s of yearData.schools) {
        html += `\n      <a class="doc-school-link" href="${s.url}" target="_blank" rel="noopener">${prettySchool(s.school)}</a>`;
      }
      html += `\n    </div>`;
    }

    // Language-specific SARCs from artifacts/documents/sarc/
    const englishSarcs = Object.values(yearData).filter(v => v?.lang === 'english');
    const spanishSarcs = Object.values(yearData).filter(v => v?.lang === 'spanish');
    if (englishSarcs.length) {
      html += `\n    <div class="doc-lang-label">${L.docsEnglish}</div>`;
      html += `\n    <div class="doc-school-grid">`;
      for (const s of englishSarcs.sort((a, b) => a.school.localeCompare(b.school))) {
        html += `\n      <a class="doc-school-link" href="${s.url}" target="_blank" rel="noopener">${prettySchool(s.school)}</a>`;
      }
      html += `\n    </div>`;
    }
    if (spanishSarcs.length) {
      html += `\n    <div class="doc-lang-label">${L.docsSpanish}</div>`;
      html += `\n    <div class="doc-school-grid">`;
      for (const s of spanishSarcs.sort((a, b) => a.school.localeCompare(b.school))) {
        html += `\n      <a class="doc-school-link" href="${s.url}" target="_blank" rel="noopener">${prettySchool(s.school)}</a>`;
      }
      html += `\n    </div>`;
    }
  }
  html += `\n  </div>`;

  html += `\n</section>`;
  return html;
}

// ---- Page configs ----
const PAGES = [
  {
    lang: 'en',
    template: 'templates/district-en.html',
    outFile: 'docs/district/index.html',
    title: 'RCSD District Overview 2025-26 \u2014 Redwood City School District',
    description: 'Budget, performance, enrollment, and governance overview for the Redwood City School District 2025-26 school year.',
    ogTitle: 'RCSD District Overview 2025-26',
    ogDesc: 'Budget, performance, enrollment, and governance overview for the Redwood City School District.',
    canonical: 'https://rcsd.info/district/',
    ogLocale: 'en_US',
    hreflang: [
      { lang: 'en', href: 'https://rcsd.info/district/' },
      { lang: 'es', href: 'https://rcsd.info/distrito/' },
    ],
    altLangHref: '/distrito/',
  },
  {
    lang: 'es',
    template: 'templates/district-es.html',
    outFile: 'docs/distrito/index.html',
    title: 'Resumen del Distrito RCSD 2025-26 \u2014 Distrito Escolar de Redwood City',
    description: 'Presupuesto, rendimiento, inscripci\u00f3n y gobernanza del Distrito Escolar de Redwood City para el a\u00f1o escolar 2025-26.',
    ogTitle: 'Resumen del Distrito RCSD 2025-26',
    ogDesc: 'Presupuesto, rendimiento, inscripci\u00f3n y gobernanza del Distrito Escolar de Redwood City.',
    canonical: 'https://rcsd.info/distrito/',
    ogLocale: 'es_US',
    hreflang: [
      { lang: 'es', href: 'https://rcsd.info/distrito/' },
      { lang: 'en', href: 'https://rcsd.info/district/' },
    ],
    altLangHref: '/district/',
  },
];

for (const page of PAGES) {
  const bodyContent = readFileSync(resolve(ROOT, page.template), 'utf-8');
  const documentsSection = renderDocuments(page.lang);

  const html = `<!DOCTYPE html>
<html lang="${page.lang}">
<head>
${headMeta({
  title: page.title,
  description: page.description,
  canonical: page.canonical,
  ogLocale: page.ogLocale,
  hreflang: page.hreflang,
  pageCSS: districtCSS,
})}
</head>
<body>

${siteNav({ activePage: 'district', lang: page.lang, altLangHref: page.altLangHref })}

${bodyContent}

${documentsSection}

</main>

${siteFooter({ lang: page.lang })}

<script>
(function() {
  var docTabs = document.querySelectorAll('.doc-tab');
  var docPanels = document.querySelectorAll('.doc-panel');
  docTabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var target = tab.dataset.docTab;
      docTabs.forEach(function(t) { t.classList.toggle('active', t.dataset.docTab === target); });
      docPanels.forEach(function(p) { p.classList.toggle('active', p.dataset.docPanel === target); });
    });
  });
})();
</script>

</body>
</html>`;

  mkdirSync(resolve(ROOT, dirname(page.outFile)), { recursive: true });
  writeFileSync(resolve(ROOT, page.outFile), html);
  console.log(`Wrote ${page.outFile}`);
}
