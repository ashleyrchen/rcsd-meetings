#!/usr/bin/env node
/**
 * Generate docs/district/index.html and docs/distrito/index.html
 * from templates/district-{en,es}.html + shared html-parts.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { headMeta, siteNav, siteFooter } from './html-parts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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
  }

  /* page-specific footer overrides */
  .site-footer { font-size: 0.8rem; text-align: left; }
  .footer-nav { margin-top: 1rem; }
  .footer-nav a { font-size: 0.68rem; margin: 0 1.5rem 0 0; }`;

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

${siteFooter({ lang: page.lang })}

</body>
</html>`;

  mkdirSync(resolve(ROOT, dirname(page.outFile)), { recursive: true });
  writeFileSync(resolve(ROOT, page.outFile), html);
  console.log(`Wrote ${page.outFile}`);
}
