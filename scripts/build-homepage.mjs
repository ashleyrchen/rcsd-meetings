#!/usr/bin/env node
/**
 * Generate docs/index.html (bilingual homepage), docs/404.html,
 * robots.txt, humans.txt, sitemap.xml
 * Run before build-meetings-html.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { headMeta, siteNav, siteFooter } from './html-parts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---- Load data ----
const schools = JSON.parse(readFileSync(resolve(ROOT, 'data/schools.json'), 'utf-8'));
const calendar2526 = JSON.parse(readFileSync(resolve(ROOT, 'data/district-calendar-2025-26.json'), 'utf-8'));
const calendar2627 = JSON.parse(readFileSync(resolve(ROOT, 'data/district-calendar-2026-27.json'), 'utf-8'));
const boardCalendarUrl = 'https://www.rcsdk8.net/our-district/our-board-of-trustees/calendar';

let meetingStats = { total: 0, totalAttachments: 0 };
const meetingsPath = resolve(ROOT, 'data/meetings-data.json');
if (existsSync(meetingsPath)) {
  const mdata = JSON.parse(readFileSync(meetingsPath, 'utf-8'));
  meetingStats = mdata.stats || meetingStats;
}

const totalEnrollment = schools.schools.reduce((sum, s) => sum + s.enrollment, 0);
const numSchools = schools.schools.length;

// ---- Upcoming events (merge both school years, from today forward) ----
const today = new Date().toISOString().slice(0, 10);
const allEvents = [...calendar2526.events, ...calendar2627.events]
  .sort((a, b) => a.date.localeCompare(b.date));
const upcoming = allEvents
  .filter(e => e.date >= today)
  .slice(0, 12);

// ---- School demographics (from SARC 2024-25) ----
const DEMO = {
  'adelante-selby': { el: 42.4, sed: 62.6 },
  'clifford':       { el: 23.5, sed: 44.2 },
  'garfield':       { el: 68.2, sed: 95.0 },
  'henry-ford':     { el: 36.2, sed: 63.1 },
  'hoover':         { el: 66.9, sed: 96.6 },
  'kennedy':        { el: 25.8, sed: 65.8 },
  'mckinley-mit':   { el: 45.5, sed: 92.6 },
  'north-star':     { el: 2.5,  sed: 8.9 },
  'orion':          { el: 22.8, sed: 31.8 },
  'roosevelt':      { el: 42.6, sed: 69.5 },
  'roy-cloud':      { el: 3.4,  sed: 11.4 },
  'taft':           { el: 65.7, sed: 90.0 },
};

// ---- School cards (sorted alphabetically) ----
const sortedSchools = [...schools.schools].sort((a, b) => a.name.localeCompare(b.name));

function schoolCard(s) {
  const typeBadgeEn = s.type === 'choice' ? 'Choice' : 'Neighborhood';
  const typeBadgeEs = s.type === 'choice' ? 'Elección' : 'Vecindario';
  const typeCls = s.type === 'choice' ? 'school-badge--choice' : 'school-badge--neighborhood';
  const communityBadge = s.communitySchool ? '<span class="school-badge school-badge--community">CS</span>' : '';

  const detailUrl = `/schools/${s.slug}/`;
  const dashboardUrl = `https://www.caschooldashboard.org/reports/${s.cdsCode}/2024`;
  const spsaUrl = `https://data.rcsd.info/documents/spsa/2025-26/${s.slug}.pdf`;

  return `
    <div class="school-card" onclick="window.location='${detailUrl}'">
      <div class="school-card-header">
        <a href="${detailUrl}" class="school-name-link">${s.nameShort} →</a>
        <span class="school-grades">${s.grades}</span>
      </div>
      <div class="school-badges"><span class="school-badge ${typeCls}">${typeBadgeEn} · ${typeBadgeEs}</span>${communityBadge}</div>
      ${s.program ? `<div class="school-program">${s.program}</div>` : ''}
      <div class="school-details">
        <div class="school-detail">${s.enrollment.toLocaleString()} students · ${Math.round(DEMO[s.slug]?.el || 0)}% EL · ${Math.round(DEMO[s.slug]?.sed || 0)}% FRL</div>
      </div>
      <div class="school-links" onclick="event.stopPropagation()">
        <a href="${s.website}" target="_blank" rel="noopener" title="School website">🌐 Web</a>
        <a href="${s.lunchUrl}" target="_blank" rel="noopener" title="Lunch menu">🍽️ Lunch</a>
        <a href="${dashboardUrl}" target="_blank" rel="noopener" title="CA School Dashboard">📊 Dash</a>
        <a href="${spsaUrl}" target="_blank" rel="noopener" title="School Plan for Student Achievement">📋 SPSA</a>
        ${s.pto?.url ? `<a href="${s.pto.url}" target="_blank" rel="noopener" title="${s.pto.name || 'PTO/PTA'}">🤝 PTO</a>` : ''}
      </div>
    </div>`;
}


function dateBadge(dateStr, lang) {
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.toLocaleDateString(lang, { month: 'short' }).toUpperCase();
  const dow = d.toLocaleDateString(lang, { weekday: 'short' });
  const day = d.getDate();
  return { month, dow, day };
}

// Load meeting summaries for board meeting annotations
const summariesEn = JSON.parse(readFileSync(resolve(ROOT, 'data/meeting-summaries.json'), 'utf-8'));
const summariesEs = (() => {
  try { return JSON.parse(readFileSync(resolve(ROOT, 'data/meeting-summaries-es.json'), 'utf-8')); }
  catch { return {}; }
})();

function eventRow(e, lang) {
  const start = dateBadge(e.date, lang);
  const isMulti = !!e.dateEnd;
  const isEn = lang === 'en';

  const typeClass = e.type === 'no-school' ? 'event--no-school'
    : e.type === 'early-release' ? 'event--early-release'
    : e.type === 'board-meeting' ? 'event--board-meeting'
    : 'event--milestone';
  const multiClass = isMulti ? ' event--multi' : '';

  // Date label: "Fri Mar 13" or "Mon–Fri Mar 16–20"
  let dateLabel;
  if (isMulti) {
    const end = dateBadge(e.dateEnd, lang);
    const sameMonth = start.month === end.month;
    dateLabel = sameMonth
      ? `${start.dow}–${end.dow}, ${start.month} ${start.day}–${end.day}`
      : `${start.dow} ${start.month} ${start.day} – ${end.dow} ${end.month} ${end.day}`;
  } else {
    dateLabel = `${start.dow}, ${start.month} ${start.day}`;
  }

  // Board meeting: link + summary
  let summaryHtml = '';
  if (e.type === 'board-meeting') {
    const summaries = isEn ? summariesEn : summariesEs;
    const summary = summaries[e.date];
    const meetingLink = isEn ? '/meetings/#sy2526' : '/reuniones/#sy2526';
    if (summary) {
      summaryHtml = `<span class="event-summary">${summary}</span>`;
    }
  }

  let label = isEn ? e.en : e.es;
  // Strip redundant "— No School" / "— No Hay Clases" text; the red color + emoji convey this
  if (e.type === 'no-school') {
    label = label.replace(/\s*[—–-]\s*No School/i, '').replace(/\s*[—–-]\s*No Hay Clases/i, '');
    label += ' <span class="no-school-icon" aria-label="No School">🏫</span>';
  }
  const meetingLinkWrap = e.type === 'board-meeting'
    ? `<a href="${isEn ? '/meetings/#sy2526' : '/reuniones/#sy2526'}" class="event-label-link">${label}</a>`
    : label;

  return `
        <div class="event-row ${typeClass}${multiClass}">
          <span class="event-date-inline">${dateLabel}</span>
          <span class="event-text">${meetingLinkWrap}${summaryHtml}</span>
        </div>`;
}

// ---- Page-specific CSS (everything not in baseCSS) ----
const homepageCSS = `
  /* ---- BILINGUAL TWO-COLUMN CORE ---- */
  .bi-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }
  .bi-en {
    text-align: right;
    padding-right: 2.5rem;
  }
  .bi-es {
    text-align: left;
    padding-left: 2.5rem;
    border-left: 1px solid var(--rule-light);
  }

  /* ---- HERO ---- */
  .hero {
    background: var(--green-deep);
    color: var(--cream);
    position: relative;
    overflow: hidden;
  }
  .hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 20% 80%, rgba(74,140,106,0.3) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 20%, rgba(196,132,45,0.15) 0%, transparent 50%);
    pointer-events: none;
  }
  .hero-inner {
    max-width: 960px;
    margin: 0 auto;
    padding: 3.5rem 2rem 2.5rem;
    position: relative;
  }
  .hero .bi-es { border-left-color: rgba(255,255,255,0.1); }
  .hero-logo {
    display: block;
    height: 140px;
    width: auto;
    max-width: 520px;
    margin: 0 auto 1.5rem;
    object-fit: contain;
    filter: drop-shadow(0 2px 8px rgba(0,0,0,0.25));
  }
  .hero h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.5rem, 3.5vw, 2.2rem);
    font-weight: 300;
    line-height: 1.2;
    color: #fff;
    font-optical-sizing: auto;
  }
  .hero p {
    margin-top: 1rem;
    font-size: 0.88rem;
    color: rgba(255,255,255,0.55);
    line-height: 1.6;
    font-style: italic;
  }
  .hero-stats {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  .hero-stat { display: flex; flex-direction: column; text-align: center; }
  .hero-stat-value {
    font-family: 'Fraunces', serif;
    font-size: 1.6rem;
    font-weight: 600;
    color: #fff;
    line-height: 1;
  }
  .hero-stat-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.55rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.4);
    margin-top: 0.3rem;
  }

  /* ---- DISCLAIMER ---- */
  .disclaimer {
    background: #fff3cd;
    border-bottom: 1px solid #f0d9a8;
    font-size: 0.75rem;
    color: #664d03;
    font-family: 'IBM Plex Mono', monospace;
    line-height: 1.5;
  }
  .disclaimer .bi-row { max-width: 960px; margin: 0 auto; }
  .disclaimer .bi-en,
  .disclaimer .bi-es { padding-top: 0.6rem; padding-bottom: 0.6rem; }
  .disclaimer .bi-es { border-left-color: rgba(102,77,3,0.15); }
  .disclaimer a { color: #664d03; }

  /* ---- CONTENT ---- */
  .content {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 0 3rem;
  }

  /* ---- SECTION HEADINGS (bilingual) ---- */
  .section-head {
    padding: 2.5rem 0 0;
  }
  .section-head .bi-en,
  .section-head .bi-es { padding-top: 0; padding-bottom: 0; }
  .section-head h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.4rem;
    font-weight: 400;
    color: var(--green-deep);
    line-height: 1.3;
  }
  .section-head p {
    color: var(--text-muted);
    font-size: 0.82rem;
    font-style: italic;
    margin-top: 0.3rem;
  }
  .section-rule {
    height: 1px;
    background: var(--rule-light);
    margin-top: 0.8rem;
  }

  /* ---- QUICK LINKS ---- */
  .nav-links {
    padding: 1.5rem 0 0;
  }
  .nav-link-item {
    padding: 0.9rem 0;
    border-bottom: 1px solid var(--rule-light);
  }
  .nav-link-item:first-child { border-top: 1px solid var(--rule-light); }
  .nav-link-item h3 {
    font-family: 'Fraunces', serif;
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.2rem;
  }
  .nav-link-item h3 a {
    color: var(--green-deep);
    text-decoration: none;
  }
  .nav-link-item h3 a:hover {
    color: var(--green-mid);
    text-decoration: underline;
  }
  .nav-link-item p {
    font-size: 0.82rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  /* ---- SCHOOL CARDS (full-width) ---- */
  .school-section {
    padding: 1.5rem 2rem 0;
  }
  .school-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.8rem;
  }
  .school-card {
    display: block;
    background: #fff;
    border: 1px solid var(--rule-light);
    padding: 0.8rem 1rem;
    transition: border-color 0.2s, box-shadow 0.2s;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }
  .school-card:hover {
    border-color: var(--green-light);
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .school-card:hover .school-name-link { color: var(--green-mid); }
  .school-card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.2rem;
  }
  .school-name-link {
    font-family: 'Fraunces', serif;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--green-deep);
    transition: color 0.2s;
  }
  .school-grades {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
    color: var(--text-muted);
  }
  .school-badges {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    margin-bottom: 0.4rem;
  }
  .school-badge {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.5rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    padding: 0.1rem 0.4rem;
    border-radius: 2px;
  }
  .school-badge--neighborhood { background: var(--green-wash); color: var(--green-mid); }
  .school-badge--choice { background: var(--amber-light); color: var(--amber); }
  .school-badge--community { background: var(--coral-light); color: var(--coral); }
  .school-program {
    font-size: 0.72rem;
    color: var(--green-mid);
    font-style: italic;
    margin-bottom: 0.3rem;
  }
  .school-details {
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--text-secondary);
  }
  .school-detail { margin-bottom: 0.15rem; }
  .school-detail a { color: var(--green-mid); text-decoration: none; }
  .school-detail a:hover { text-decoration: underline; }
  .school-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
  }
  .school-links {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--rule-light);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
  }
  .school-links a { color: var(--green-mid); text-decoration: none; white-space: nowrap; }
  .school-links a:hover { text-decoration: underline; }

  /* ---- EVENTS (mirrored bilingual) ---- */
  .events-section { padding-top: 1rem; }
  .events-col { display: flex; flex-direction: column; }
  .event-row {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--rule-light);
  }
  .event-date-inline {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    display: block;
    margin-bottom: 0.15rem;
  }
  .event-text {
    font-size: 0.82rem;
    color: var(--text);
    display: block;
    line-height: 1.4;
  }
  .event-label-link {
    text-decoration: none;
    color: inherit;
  }
  .event-label-link:hover { text-decoration: underline; }
  .event-summary {
    display: block;
    font-size: 0.72rem;
    color: var(--text-secondary);
    margin-top: 0.15rem;
    line-height: 1.35;
  }
  .event--multi {
    background: var(--cream-dark, #f5f0e8);
    border-radius: 4px;
    padding: 0.5rem 0.65rem;
    margin: 0.15rem -0.65rem;
    border-bottom: none;
  }
  /* No school — red */
  .event--no-school .event-date-inline { color: #c0392b; }
  .event--no-school .event-text { color: #c0392b; font-weight: 500; }
  .no-school-icon {
    position: relative;
    font-style: normal;
    margin-left: 0.25rem;
  }
  .no-school-icon::after {
    content: '';
    position: absolute;
    left: -2px;
    right: -2px;
    top: 45%;
    height: 2px;
    background: #c0392b;
    transform: rotate(-45deg);
  }
  /* Early release — yellow/amber */
  .event--early-release .event-date-inline { color: #b8860b; }
  /* Board meeting — blue */
  .event--board-meeting .event-date-inline { color: #2563a0; }
  .event--board-meeting .event-label-link { color: #2563a0; font-weight: 500; }
  .event--board-meeting .event-label-link:hover { color: #1a4570; }
  /* Milestone — green */
  .event--milestone .event-date-inline { color: var(--green-deep); }
  .event--milestone .event-text { color: var(--green-deep); font-weight: 600; }

  /* ---- RESOURCE LINKS (mirrored bilingual) ---- */
  .resource-item {
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--rule-light);
  }
  .resource-item h4 {
    font-family: 'Fraunces', serif;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--green-deep);
    margin-bottom: 0.15rem;
  }
  .resource-item p {
    font-size: 0.78rem;
    color: var(--text-secondary);
    line-height: 1.4;
    margin-bottom: 0.3rem;
  }
  .resource-item a.resource-url {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.62rem;
    color: var(--green-mid);
    text-decoration: none;
  }
  .resource-item a.resource-url:hover { text-decoration: underline; }

  /* ---- AI SECTION (full-width) ---- */
  .ai-section {
    background: var(--cream-dark);
    border: 1px solid var(--rule);
    padding: 1.5rem 2rem;
    margin: 2.5rem 2rem 0;
    text-align: left;
  }
  .ai-section h2 {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--green-mid);
    margin-bottom: 1rem;
    text-align: center;
  }
  .ai-section pre {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    line-height: 1.7;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .ai-section pre a {
    color: var(--green-mid);
    text-decoration: underline;
    text-decoration-color: var(--rule);
  }
  .ai-section pre a:hover {
    color: var(--green-deep);
    text-decoration-color: var(--green-mid);
  }
  .ai-section code {
    background: rgba(0,0,0,0.04);
    padding: 0.1rem 0.3rem;
    border-radius: 2px;
  }

  /* ---- RESPONSIVE (page-specific) ---- */
  @media (max-width: 640px) {
    html { font-size: 15px; }
    .bi-row { grid-template-columns: 1fr; }
    .bi-en { text-align: left; padding-right: 1.2rem; padding-left: 1.2rem; }
    .bi-es { border-left: none; padding-left: 1.2rem; padding-right: 1.2rem;
             border-top: 1px solid var(--rule-light); padding-top: 0.8rem; margin-top: 0.5rem; }
    .hero .bi-es { border-top-color: rgba(255,255,255,0.1); }
    .disclaimer .bi-es { border-top-color: rgba(102,77,3,0.15); }
    .hero-inner { padding: 2.5rem 1.2rem 2rem; }
    .hero-stats { justify-content: center; }
    .content { padding-bottom: 2rem; }
    .school-section { padding: 1rem 1.2rem 0; }
    .school-grid { grid-template-columns: 1fr; }
    .ai-section { margin: 2rem 1.2rem 0; }
    .events-col .event-row { text-align: left; }
  }`;

// ---- JSON-LD ----
const jsonLdBlocks = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "RCSD Open Data",
  "url": "https://rcsd.info/",
  "description": "Open data portal for the Redwood City School District",
  "publisher": {
    "@type": "Person",
    "name": "David Weekly",
    "url": "https://david.weekly.org"
  }
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "RCSD Schools",
  "numberOfItems": ${numSchools},
  "itemListElement": [
${sortedSchools.map((s, i) => `    {
      "@type": "ListItem",
      "position": ${i + 1},
      "item": {
        "@type": "School",
        "name": "${s.name}",
        "address": "${s.address}",
        "telephone": "${s.phone}",
        "url": "${s.website}"
      }
    }`).join(',\n')}
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "RCSD Open Data",
  "description": "Structured open data for the Redwood City School District (RCSD) — a TK-8 public school district in Redwood City, California serving ${totalEnrollment.toLocaleString()} students across ${numSchools} schools. Includes school directory, board meeting archives with transcripts, district calendars, special education enrollment, SARC reports, demographics, and live lunch menus.",
  "url": "https://rcsd.info/",
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "creator": {
    "@type": "Person",
    "name": "David Weekly",
    "url": "https://david.weekly.org"
  },
  "about": {
    "@type": "GovernmentOrganization",
    "name": "Redwood City School District",
    "url": "https://www.rcsdk8.net",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Redwood City",
      "addressRegion": "CA",
      "addressCountry": "US"
    }
  },
  "spatialCoverage": {
    "@type": "Place",
    "name": "Redwood City, California"
  },
  "temporalCoverage": "2018/..",
  "distribution": [
    {
      "@type": "DataDownload",
      "encodingFormat": "application/json",
      "contentUrl": "https://data.rcsd.info/json/schools.json",
      "name": "School Directory",
      "description": "All ${numSchools} schools with addresses, principals, bell schedules, enrollment, and parent resources"
    },
    {
      "@type": "DataDownload",
      "encodingFormat": "application/json",
      "contentUrl": "https://data.rcsd.info/json/meetings-data.json",
      "name": "Board Meeting Archive",
      "description": "Board meetings with agendas, agenda items, attachments, timestamps, and transcripts"
    },
    {
      "@type": "DataDownload",
      "encodingFormat": "application/json",
      "contentUrl": "https://data.rcsd.info/json/district-calendar-2025-26.json",
      "name": "District Calendar 2025-26",
      "description": "School year calendar with holidays, early release days, and board meetings"
    },
    {
      "@type": "DataDownload",
      "encodingFormat": "application/json",
      "contentUrl": "https://data.rcsd.info/json/district-calendar-2026-27.json",
      "name": "District Calendar 2026-27",
      "description": "School year calendar with holidays, early release days, and board meetings"
    },
    {
      "@type": "DataDownload",
      "encodingFormat": "application/json",
      "contentUrl": "https://data.rcsd.info/json/sped-enrollment.json",
      "name": "Special Education Enrollment",
      "description": "IEP student counts per school per grade (CDE 2024-25)"
    },
    {
      "@type": "DataDownload",
      "encodingFormat": "application/json",
      "contentUrl": "https://data.rcsd.info/json/sarc/sarc-summary.json",
      "name": "SARC Summary",
      "description": "School Accountability Report Card data: demographics, test scores, expenditures per school"
    }
  ],
  "keywords": ["education", "school district", "open data", "Redwood City", "California", "TK-8", "board meetings", "school demographics", "CAASPP", "special education"]
}
</script>`;

// ---- Generate homepage HTML ----
const ogDesc = 'Open data portal for RCSD: board meetings, school directory, district overview, and key documents.';
const html = `<!DOCTYPE html>
<html lang="en">
<head>
${headMeta({
  title: 'RCSD Open Data — Redwood City School District Public Records',
  description: `Open data portal for the Redwood City School District. ${numSchools} schools, ${totalEnrollment.toLocaleString()} students, ${meetingStats.total} board meetings with agendas, minutes, and video. Bilingual English/Spanish.`,
  canonical: 'https://rcsd.info/',
  ogLocale: 'en_US',
  hreflang: [
    { lang: 'x-default', href: 'https://rcsd.info/' },
    { lang: 'en', href: 'https://rcsd.info/' },
    { lang: 'es', href: 'https://rcsd.info/' },
  ],
  jsonLd: jsonLdBlocks,
  extraHead: '<meta property="og:locale:alternate" content="es_US">\n<link rel="describedby" href="/llms.txt" type="text/markdown">',
  pageCSS: homepageCSS,
})}
</head>
<body>

${siteNav({ activePage: 'home', lang: 'en' })}

<header class="hero">
  <div class="hero-inner">
    <img src="https://data.rcsd.info/logos/district.jpg" alt="Redwood City School District" class="hero-logo">
    <div class="bi-row">
      <div class="bi-en">
        <h1>Open Data for Redwood City School District</h1>
        <p>Independently compiled public records, meeting archives, and school data — making district information accessible to families and the community.</p>
      </div>
      <div class="bi-es" lang="es">
        <h1>Datos Abiertos para el Distrito Escolar de Redwood City</h1>
        <p>Registros públicos compilados independientemente, archivos de reuniones y datos escolares — haciendo la información del distrito accesible para las familias y la comunidad.</p>
      </div>
    </div>
    <div class="hero-stats">
      <div class="hero-stat">
        <span class="hero-stat-value">${numSchools}</span>
        <span class="hero-stat-label">Schools · Escuelas</span>
      </div>
      <div class="hero-stat">
        <span class="hero-stat-value">${totalEnrollment.toLocaleString()}</span>
        <span class="hero-stat-label">Students · Estudiantes</span>
      </div>
      <div class="hero-stat">
        <span class="hero-stat-value">${meetingStats.total}</span>
        <span class="hero-stat-label">Meetings · Reuniones</span>
      </div>
      <div class="hero-stat">
        <span class="hero-stat-value">${meetingStats.totalAttachments?.toLocaleString() || 0}</span>
        <span class="hero-stat-label">Attachments · Anexos</span>
      </div>
    </div>
  </div>
</header>

<div class="disclaimer">
  <div class="bi-row">
    <div class="bi-en">Not an official RCSD product. For official info visit <a href="https://www.rcsdk8.net">rcsdk8.net</a>. Questions? <a href="mailto:team@rcsd.info">team@rcsd.info</a></div>
    <div class="bi-es" lang="es">No es un producto oficial de RCSD. Para información oficial visite <a href="https://www.rcsdk8.net">rcsdk8.net</a>. ¿Preguntas? <a href="mailto:team@rcsd.info">team@rcsd.info</a></div>
  </div>
</div>

<main class="content">

  <!-- EXPLORE -->
  <div class="section-head bi-row">
    <div class="bi-en"><h2>Explore</h2></div>
    <div class="bi-es" lang="es"><h2>Explorar</h2></div>
  </div>
  <div class="section-rule"></div>
  <div class="bi-row nav-links">
    <div class="bi-en">
      <div class="nav-link-item">
        <h3><a href="/meetings/">Board Meetings &#8599;</a></h3>
        <p>Agendas, video, minutes, and transcripts for ${meetingStats.total} board meetings.</p>
      </div>
      <div class="nav-link-item">
        <h3><a href="/district/">District Overview &#8599;</a></h3>
        <p>Budget, performance, enrollment trends, and governance in plain language.</p>
      </div>
      <div class="nav-link-item">
        <h3><a href="/meetings/#documents">Key Documents &#8599;</a></h3>
        <p>Budget reports, LCAP, school plans (SPSA), and school report cards (SARC).</p>
      </div>
      <div class="nav-link-item">
        <h3><a href="https://github.com/dweekly/rcsd-meetings">Source Code &#8599;</a></h3>
        <p>Open source on GitHub. Data pipeline, scraping tools, and website code.</p>
      </div>
    </div>
    <div class="bi-es" lang="es">
      <div class="nav-link-item">
        <h3><a href="/reuniones/">Reuniones de la Junta &#8599;</a></h3>
        <p>Agendas, video, actas y transcripciones de ${meetingStats.total} reuniones.</p>
      </div>
      <div class="nav-link-item">
        <h3><a href="/distrito/">Resumen del Distrito &#8599;</a></h3>
        <p>Presupuesto, rendimiento, tendencias de inscripción y gobernanza en lenguaje sencillo.</p>
      </div>
      <div class="nav-link-item">
        <h3><a href="/reuniones/#documents">Documentos Clave &#8599;</a></h3>
        <p>Informes de presupuesto, LCAP, planes escolares (SPSA) y boletas de calificaciones (SARC).</p>
      </div>
      <div class="nav-link-item">
        <h3><a href="https://github.com/dweekly/rcsd-meetings">Código Fuente &#8599;</a></h3>
        <p>Código abierto en GitHub. Pipeline de datos, herramientas y código del sitio.</p>
      </div>
    </div>
  </div>

  <!-- SCHOOL DIRECTORY (full-width, data is bilingual within cards) -->
  <div class="section-head bi-row">
    <div class="bi-en"><h2>Our ${numSchools} Schools</h2><p>7 neighborhood + 5 choice</p></div>
    <div class="bi-es" lang="es"><h2>Nuestras ${numSchools} Escuelas</h2><p>7 de vecindario + 5 de elección</p></div>
  </div>
  <div class="section-rule"></div>
  <div class="school-section">
    <div class="school-grid">
${sortedSchools.map(s => schoolCard(s)).join('\n')}
    </div>
  </div>

  <!-- KEY DATES -->
  <div class="section-head bi-row">
    <div class="bi-en"><h2>Upcoming Key Dates</h2><p><a href="${calendar2526.calendarUrl}" target="_blank" rel="noopener">${calendar2526.schoolYear} Calendar &#8599;</a> · <a href="${calendar2627.calendarUrl}" target="_blank" rel="noopener">${calendar2627.schoolYear} Calendar &#8599;</a> · <a href="${boardCalendarUrl}" target="_blank" rel="noopener">Board Meetings &#8599;</a></p></div>
    <div class="bi-es" lang="es"><h2>Fechas Importantes</h2><p><a href="${calendar2526.calendarUrl}" target="_blank" rel="noopener">Calendario ${calendar2526.schoolYear} &#8599;</a> · <a href="${calendar2627.calendarUrl}" target="_blank" rel="noopener">Calendario ${calendar2627.schoolYear} &#8599;</a> · <a href="${boardCalendarUrl}" target="_blank" rel="noopener">Junta &#8599;</a></p></div>
  </div>
  <div class="section-rule"></div>
${upcoming.length > 0 ? `  <div class="bi-row events-section">
    <div class="bi-en events-col">
${upcoming.map(e => eventRow(e, 'en')).join('\n')}
    </div>
    <div class="bi-es events-col" lang="es">
${upcoming.map(e => eventRow(e, 'es')).join('\n')}
    </div>
  </div>` : ''}

  <!-- OFFICIAL SOURCES -->
  <div class="section-head bi-row">
    <div class="bi-en"><h2>Official Sources</h2><p>Authoritative sources for RCSD information</p></div>
    <div class="bi-es" lang="es"><h2>Fuentes Oficiales</h2><p>Fuentes oficiales de información de RCSD</p></div>
  </div>
  <div class="section-rule"></div>
  <div class="bi-row" style="padding-top:0.5rem">
    <div class="bi-en">
      <div class="resource-item">
        <h4>District Website</h4>
        <p>Official RCSD information, news, and announcements.</p>
        <a class="resource-url" href="https://www.rcsdk8.net" target="_blank" rel="noopener">rcsdk8.net &#8599;</a>
      </div>
      <div class="resource-item">
        <h4>Board Meeting Portal</h4>
        <p>Current agendas and attachments on GAMUT/Simbli.</p>
        <a class="resource-url" href="https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=36030397" target="_blank" rel="noopener">GAMUT/Simbli &#8599;</a>
      </div>
      <div class="resource-item">
        <h4>YouTube Channel</h4>
        <p>Video recordings of public board meetings.</p>
        <a class="resource-url" href="https://www.youtube.com/@RedwoodCitySchoolDistrict" target="_blank" rel="noopener">YouTube &#8599;</a>
      </div>
      <div class="resource-item">
        <h4>CA School Dashboard</h4>
        <p>State performance data and accountability metrics.</p>
        <a class="resource-url" href="https://www.caschooldashboard.org/reports/41690050000000/2024" target="_blank" rel="noopener">caschooldashboard.org &#8599;</a>
      </div>
    </div>
    <div class="bi-es" lang="es">
      <div class="resource-item">
        <h4>Sitio del Distrito</h4>
        <p>Información oficial, noticias y anuncios de RCSD.</p>
        <a class="resource-url" href="https://www.rcsdk8.net" target="_blank" rel="noopener">rcsdk8.net &#8599;</a>
      </div>
      <div class="resource-item">
        <h4>Portal de Reuniones</h4>
        <p>Agendas actuales y anexos en GAMUT/Simbli.</p>
        <a class="resource-url" href="https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=36030397" target="_blank" rel="noopener">GAMUT/Simbli &#8599;</a>
      </div>
      <div class="resource-item">
        <h4>Canal de YouTube</h4>
        <p>Grabaciones de video de reuniones públicas de la junta.</p>
        <a class="resource-url" href="https://www.youtube.com/@RedwoodCitySchoolDistrict" target="_blank" rel="noopener">YouTube &#8599;</a>
      </div>
      <div class="resource-item">
        <h4>Panel Escolar de CA</h4>
        <p>Datos de rendimiento estatal y métricas de rendición de cuentas.</p>
        <a class="resource-url" href="https://www.caschooldashboard.org/reports/41690050000000/2024" target="_blank" rel="noopener">caschooldashboard.org &#8599;</a>
      </div>
    </div>
  </div>

  <!-- AI AGENT INSTRUCTIONS (full-width) -->
  <div class="ai-section">
    <h2>For AI Agents &amp; Developers</h2>
    <pre>
RCSD Open Data — structured data for the Redwood City School District

MCP:     <code><a href="https://mcp.rcsd.info/mcp">https://mcp.rcsd.info/mcp</a></code>  (Model Context Protocol — works with Claude, VS Code, Cursor)
GitHub:  <code><a href="https://github.com/dweekly/rcsd-meetings">https://github.com/dweekly/rcsd-meetings</a></code>
Website: <code><a href="https://rcsd.info">https://rcsd.info</a></code>
CDN:     <code><a href="https://data.rcsd.info">https://data.rcsd.info</a></code>

DATA FILES (<a href="https://data.rcsd.info/json/">data.rcsd.info/json/</a>):
  <a href="https://data.rcsd.info/json/meetings-data.json">meetings-data.json</a>       All meetings with agendas, items, attachments, timestamps
  <a href="https://data.rcsd.info/json/meeting-summaries.json">meeting-summaries.json</a>   Curated English summaries per meeting
  <a href="https://data.rcsd.info/json/meeting-summaries-es.json">meeting-summaries-es.json</a>  Curated Spanish summaries
  <a href="https://data.rcsd.info/json/schools.json">schools.json</a>             School directory (12 schools, addresses, principals, bell schedules)
  <a href="https://data.rcsd.info/json/district-calendar-2025-26.json">district-calendar-2025-26.json</a>  Key dates for 2025-26
  <a href="https://data.rcsd.info/json/district-calendar-2026-27.json">district-calendar-2026-27.json</a>  Key dates for 2026-27
  <a href="https://data.rcsd.info/json/youtube-index.json">youtube-index.json</a>       YouTube video metadata
  <a href="https://data.rcsd.info/json/agenda-attachments.json">agenda-attachments.json</a>  Attachment metadata with R2 URLs

R2 CDN DOCUMENT URLS:
  https://data.rcsd.info/agendas/{YYYY-MM-DD}-agenda.pdf
  https://data.rcsd.info/minutes/{YYYY-MM-DD}-minutes.pdf
  https://data.rcsd.info/board-packets/{AID}.pdf
  https://data.rcsd.info/documents/{type}/{filename}
    types: spsa, budget, lcap, sarc

STRUCTURED PAGES:
  /                 Homepage (bilingual EN/ES)
  /meetings/        Meeting archive (EN)
  /reuniones/       Meeting archive (ES)
  /district/        District overview (EN)
  /distrito/        District overview (ES)

Contact: team@rcsd.info</pre>
  </div>

  <!-- CLAUDE CODE PLUGIN -->
  <div class="ai-section" style="margin-top:1rem">
    <h2>Claude Code Plugin</h2>
    <pre>
Install the rcsd-info plugin for <a href="https://claude.com/claude-code">Claude Code</a> to query RCSD data
from your terminal — school info, live lunch menus, calendars,
board meetings, demographics, and special education stats.

  <code>/plugin marketplace add dweekly/rcsd-meetings</code>
  <code>/plugin install rcsd-info@rcsd-info</code>

Optional: create <code>~/.claude/rcsd-info.local.md</code> to personalize queries:

  <code>---</code>
  <code>children:</code>
  <code>  - name: Jill</code>
  <code>    grade: 2</code>
  <code>    school: orion</code>
  <code>    program: Mandarin Immersion</code>
  <code>---</code>

Then ask: "What's Jill having for lunch tomorrow?"</pre>
  </div>

</main>

${siteFooter({ lang: 'en' })}

</body>
</html>`;

// ---- Write homepage ----
writeFileSync(resolve(ROOT, 'docs/index.html'), html);
console.log('Wrote docs/index.html (homepage)');

// ---- 404 page ----
const fourOhFourCSS = `
  body {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .content {
    max-width: 960px;
    margin: 0 auto;
    padding: 6rem 2rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .code {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 5rem;
    font-weight: 300;
    color: var(--green-deep);
    line-height: 1;
    opacity: 0.3;
  }
  h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.6rem;
    font-weight: 400;
    color: var(--green-deep);
    margin-top: 1rem;
  }
  .subtitle {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.92rem;
    margin-top: 0.5rem;
  }
  .links {
    margin-top: 2rem;
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    justify-content: center;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.75rem;
  }
  .links a { text-decoration: none; }
  .links a:hover { text-decoration: underline; }
  .bi {
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--rule);
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.85rem;
  }
  .site-footer { width: 100%; }
  @media (max-width: 640px) {
    html { font-size: 15px; }
    .content { padding: 4rem 1.2rem; }
    .code { font-size: 3.5rem; }
  }`;

const fourOhFour = `<!DOCTYPE html>
<html lang="en">
<head>
${headMeta({
  title: 'Page Not Found — RCSD Open Data',
  description: 'The page you are looking for does not exist.',
  robots: 'noindex',
  pageCSS: fourOhFourCSS,
})}
</head>
<body>

${siteNav({ lang: 'en' })}

<main class="content">
  <div class="code">404</div>
  <h1>Page Not Found</h1>
  <p class="subtitle">The page you're looking for doesn't exist or may have moved.</p>
  <div class="links">
    <a href="/">Home</a>
    <a href="/meetings/">Meetings</a>
    <a href="/district/">District</a>
    <a href="https://data.rcsd.info">Data</a>
  </div>
  <div class="bi" lang="es">
    Pagina no encontrada. <a href="/">Volver al inicio</a>
  </div>
</main>

<footer class="site-footer">
  <p><a href="mailto:team@rcsd.info">team@rcsd.info</a></p>
</footer>

</body>
</html>`;

writeFileSync(resolve(ROOT, 'docs/404.html'), fourOhFour);
console.log('Wrote docs/404.html');

// ---- Template helper ----
function renderTemplate(name, vars = {}) {
  let tmpl = readFileSync(resolve(ROOT, 'templates', name), 'utf-8');
  for (const [key, val] of Object.entries(vars)) {
    tmpl = tmpl.replaceAll(`{{${key}}}`, val);
  }
  return tmpl;
}

const templateVars = {
  date: new Date().toISOString().slice(0, 10),
  totalEnrollment: totalEnrollment.toLocaleString(),
  numSchools: String(numSchools),
  schoolSlugs: sortedSchools.map(s =>
    `- \`${s.slug}\` — ${s.name} (${s.grades}, ${s.type === 'choice' ? 'Choice' : 'Neighborhood'})`
  ).join('\n'),
};

// ---- robots.txt ----
writeFileSync(resolve(ROOT, 'docs/robots.txt'), renderTemplate('robots.txt', templateVars));
console.log('Wrote docs/robots.txt');

// ---- humans.txt ----
writeFileSync(resolve(ROOT, 'docs/humans.txt'), renderTemplate('humans.txt', templateVars));
console.log('Wrote docs/humans.txt');

// ---- llms.txt ----
writeFileSync(resolve(ROOT, 'docs/llms.txt'), renderTemplate('llms.txt', templateVars));
console.log('Wrote docs/llms.txt');

// ---- sitemap.xml ----
const blogPosts = JSON.parse(readFileSync(resolve(ROOT, 'data/blog-posts.json'), 'utf-8'));
const sitemapDate = new Date().toISOString().slice(0, 10);
const schoolUrls = schools.schools.map(s => `  <url>
    <loc>https://rcsd.info/schools/${s.slug}/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://rcsd.info/escuelas/${s.slug}/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://rcsd.info/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://rcsd.info/schools/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://rcsd.info/escuelas/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
${schoolUrls}
  <url>
    <loc>https://rcsd.info/meetings/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://rcsd.info/reuniones/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://rcsd.info/district/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://rcsd.info/distrito/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://rcsd.info/blog/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://rcsd.info/blog/es/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
${blogPosts.map(p => `  <url>
    <loc>https://rcsd.info/blog/${p.slug}/</loc>
    <lastmod>${p.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://rcsd.info/blog/${p.slugEs}/</loc>
    <lastmod>${p.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n')}
  <url>
    <loc>https://rcsd.info/llms.txt</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
`;
writeFileSync(resolve(ROOT, 'docs/sitemap.xml'), sitemap);
console.log('Wrote docs/sitemap.xml');
