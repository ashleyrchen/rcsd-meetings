#!/usr/bin/env node
/**
 * Generate docs/index.html (bilingual homepage), robots.txt, humans.txt
 * Run before build-meetings-html.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---- Load data ----
const schools = JSON.parse(readFileSync(resolve(ROOT, 'data/schools.json'), 'utf-8'));
const calendar = JSON.parse(readFileSync(resolve(ROOT, 'data/district-calendar.json'), 'utf-8'));

let meetingStats = { total: 0, totalAttachments: 0 };
const meetingsPath = resolve(ROOT, 'data/meetings-data.json');
if (existsSync(meetingsPath)) {
  const mdata = JSON.parse(readFileSync(meetingsPath, 'utf-8'));
  meetingStats = mdata.stats || meetingStats;
}

const totalEnrollment = schools.schools.reduce((sum, s) => sum + s.enrollment, 0);
const numSchools = schools.schools.length;

// ---- Upcoming events (from today forward) ----
const today = new Date().toISOString().slice(0, 10);
const upcoming = calendar.events
  .filter(e => e.date >= today)
  .slice(0, 12);

// ---- School cards (sorted alphabetically) ----
const sortedSchools = [...schools.schools].sort((a, b) => a.name.localeCompare(b.name));

function schoolCard(s) {
  const typeBadgeEn = s.type === 'choice' ? 'Choice' : 'Neighborhood';
  const typeBadgeEs = s.type === 'choice' ? 'Elección' : 'Vecindario';
  const typeCls = s.type === 'choice' ? 'school-badge--choice' : 'school-badge--neighborhood';
  const communityBadge = s.communitySchool ? '<span class="school-badge school-badge--community">CS</span>' : '';

  const dashboardUrl = `https://www.caschooldashboard.org/reports/${s.cdsCode}/2024`;
  const spsaUrl = `https://data.rcsd.info/documents/spsa/2025-26/${s.slug}.pdf`;
  const ptoLink = s.ptoUrl ? `<a href="${s.ptoUrl}" target="_blank" rel="noopener">PTO</a>` : '';

  return `
    <div class="school-card">
      <div class="school-card-header">
        <a href="${s.website}" target="_blank" rel="noopener" class="school-name-link">${s.nameShort}</a>
        <span class="school-grades">${s.grades}</span>
      </div>
      <div class="school-badges"><span class="school-badge ${typeCls}">${typeBadgeEn} · ${typeBadgeEs}</span>${communityBadge}</div>
      ${s.program ? `<div class="school-program">${s.program} · ${s.programEs}</div>` : ''}
      <div class="school-details">
        <div class="school-detail"><span class="school-label">Principal</span> ${s.principal}</div>
        <div class="school-detail">${s.address}</div>
        <div class="school-detail"><a href="tel:${s.phone.replace(/[^+\d]/g, '')}">${s.phone}</a></div>
        <div class="school-detail">${s.bellSchedule.start} – ${s.bellSchedule.end} (early: ${s.bellSchedule.earlyRelease})</div>
        <div class="school-detail">${s.enrollment.toLocaleString()} students · ${s.highNeedPct}% high-need</div>
      </div>
      <div class="school-links">
        <a href="${s.website}" target="_blank" rel="noopener">Web</a>
        <a href="${s.lunchUrl}" target="_blank" rel="noopener">Lunch</a>
        <a href="${dashboardUrl}" target="_blank" rel="noopener">Dashboard</a>
        <a href="${spsaUrl}" target="_blank" rel="noopener">SPSA</a>
        ${ptoLink}
      </div>
    </div>`;
}


function eventRowEn(e) {
  const d = new Date(e.date + 'T12:00:00');
  const month = d.toLocaleDateString('en', { month: 'short' }).toUpperCase();
  const day = d.getDate();
  let dateRange = '';
  if (e.dateEnd) {
    const d2 = new Date(e.dateEnd + 'T12:00:00');
    dateRange = ` – ${d2.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;
  }
  const typeClass = e.type === 'no-school' ? 'event--no-school'
    : e.type === 'early-release' ? 'event--early-release'
    : e.type === 'board-meeting' ? 'event--board-meeting'
    : 'event--milestone';
  // EN: date on right, text on left (right-aligned row)
  return `
        <div class="event-row ${typeClass}">
          <span class="event-text">${e.en}${dateRange}</span>
          <div class="event-date">
            <span class="event-month">${month}</span>
            <span class="event-day">${day}</span>
          </div>
        </div>`;
}

function eventRowEs(e) {
  const d = new Date(e.date + 'T12:00:00');
  const month = d.toLocaleDateString('es', { month: 'short' }).toUpperCase();
  const day = d.getDate();
  let dateRange = '';
  if (e.dateEnd) {
    const d2 = new Date(e.dateEnd + 'T12:00:00');
    dateRange = ` – ${d2.toLocaleDateString('es', { month: 'short', day: 'numeric' })}`;
  }
  const typeClass = e.type === 'no-school' ? 'event--no-school'
    : e.type === 'early-release' ? 'event--early-release'
    : e.type === 'board-meeting' ? 'event--board-meeting'
    : 'event--milestone';
  // ES: date on left, text on right (left-aligned row)
  return `
        <div class="event-row ${typeClass}">
          <div class="event-date">
            <span class="event-month">${month}</span>
            <span class="event-day">${day}</span>
          </div>
          <span class="event-text">${e.es}${dateRange}</span>
        </div>`;
}

// ---- Generate homepage HTML ----
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow">
<title>RCSD Open Data — Redwood City School District Public Records</title>
<meta name="description" content="Open data portal for the Redwood City School District. ${numSchools} schools, ${totalEnrollment.toLocaleString()} students, ${meetingStats.total} board meetings with agendas, minutes, and video. Bilingual English/Spanish.">
<meta property="og:title" content="RCSD Open Data — Redwood City School District">
<meta property="og:description" content="Open data portal for RCSD: board meetings, school directory, district overview, and key documents.">
<meta property="og:url" content="https://rcsd.info/">
<meta property="og:type" content="website">
<meta property="og:image" content="https://rcsd.info/og-1200.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="es_US">
<meta property="og:site_name" content="RCSD Open Data">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://rcsd.info/og-1200.jpg">
<meta name="twitter:title" content="RCSD Open Data — Redwood City School District">
<meta name="twitter:description" content="Open data portal for RCSD: board meetings, school directory, district overview, and key documents.">
<link rel="canonical" href="https://rcsd.info/">
<link rel="alternate" hreflang="x-default" href="https://rcsd.info/">
<link rel="alternate" hreflang="en" href="https://rcsd.info/">
<link rel="alternate" hreflang="es" href="https://rcsd.info/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<script type="application/ld+json">
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
<style>
  :root {
    --green-deep: #1a3a2a;
    --green-mid: #2d5a3f;
    --green-light: #4a8c6a;
    --green-pale: #dcebd5;
    --green-wash: #f0f6ed;
    --cream: #faf8f4;
    --cream-dark: #f2efe8;
    --amber: #c4842d;
    --amber-light: #f0d9a8;
    --coral: #c45d4a;
    --coral-light: #f5ddd8;
    --text: #2a2a28;
    --text-secondary: #5a5a56;
    --text-muted: #8a8a84;
    --rule: #d4d0c8;
    --rule-light: #e8e4dc;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html {
    font-size: 17px;
    scroll-behavior: smooth;
    background: var(--cream);
  }

  body {
    font-family: 'Newsreader', Georgia, serif;
    color: var(--text);
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    background: var(--cream);
  }

  a {
    color: var(--green-mid);
    text-decoration-color: var(--rule);
    text-underline-offset: 2px;
    transition: color 0.15s, text-decoration-color 0.15s;
  }
  a:hover {
    color: var(--green-deep);
    text-decoration-color: var(--green-mid);
  }

  /* ---- SITE NAV ---- */
  .site-nav {
    background: #1a2e1a;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .site-nav-inner {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .site-nav-tabs { display: flex; gap: 0; }
  .site-nav-tab {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-decoration: none;
    color: rgba(255,255,255,0.45);
    padding: 0.7rem 1rem;
    border-bottom: 2px solid transparent;
    transition: color 0.2s, border-color 0.2s;
  }
  .site-nav-tab:hover { color: rgba(255,255,255,0.8); }
  .site-nav-tab.active { color: #fff; border-bottom-color: var(--green-light); }

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
    background: #fff;
    border: 1px solid var(--rule-light);
    padding: 0.8rem 1rem;
    transition: border-color 0.2s;
  }
  .school-card:hover { border-color: var(--green-light); }
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
    text-decoration: none;
  }
  .school-name-link:hover { color: var(--green-mid); text-decoration: underline; }
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
    gap: 0.8rem;
    margin-top: 0.5rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--rule-light);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
  }
  .school-links a { color: var(--green-mid); text-decoration: none; }
  .school-links a:hover { text-decoration: underline; }

  /* ---- EVENTS (mirrored bilingual) ---- */
  .events-section { padding-top: 1rem; }
  .events-col { display: flex; flex-direction: column; }
  .events-col.bi-en .event-row {
    flex-direction: row-reverse;
    text-align: right;
  }
  .event-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--rule-light);
  }
  .event-date {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 32px;
    flex-shrink: 0;
  }
  .event-month {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.48rem;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .event-day {
    font-family: 'Fraunces', serif;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1;
    color: var(--text);
  }
  .event-text { font-size: 0.78rem; color: var(--text); flex: 1; }
  .event--no-school .event-date { color: var(--coral); }
  .event--no-school .event-day { color: var(--coral); }
  .event--early-release .event-date { color: var(--amber); }
  .event--early-release .event-day { color: var(--amber); }
  .event--board-meeting .event-day { color: var(--green-light); }
  .event--milestone .event-day { color: var(--green-deep); }

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

  /* ---- FOOTER ---- */
  .site-footer {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 2rem 4rem;
    border-top: 1px solid var(--rule);
    text-align: center;
  }
  .site-footer p {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-style: italic;
  }
  .site-footer a { color: var(--green-mid); }
  .footer-nav {
    margin-top: 0.8rem;
    font-style: normal;
  }
  .footer-nav a {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    color: var(--green-mid);
    text-decoration: none;
    margin: 0 0.75rem;
  }
  .footer-nav a:hover { text-decoration: underline; }

  /* ---- RESPONSIVE ---- */
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
    .site-nav-tab { padding: 0.6rem 0.7rem; font-size: 0.6rem; }
    .site-nav-inner { padding: 0 1.2rem; }
    .events-col.bi-en .event-row { flex-direction: row; text-align: left; }
  }
</style>
</head>
<body>

<nav class="site-nav">
  <div class="site-nav-inner">
    <div class="site-nav-tabs">
      <a href="/" class="site-nav-tab active">Home</a>
      <a href="/meetings/" class="site-nav-tab">Meetings</a>
      <a href="/district/" class="site-nav-tab">District</a>
      <a href="https://github.com/dweekly/rcsd-meetings" class="site-nav-tab">Code</a>
    </div>
  </div>
</nav>

<header class="hero">
  <div class="hero-inner">
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
    <div class="bi-en"><h2>Upcoming Key Dates</h2><p>${calendar.schoolYear} · <a href="${calendar.calendarUrl}" target="_blank" rel="noopener">Official Calendar &#8599;</a></p></div>
    <div class="bi-es" lang="es"><h2>Fechas Importantes</h2><p>${calendar.schoolYear} · <a href="${calendar.calendarUrl}" target="_blank" rel="noopener">Calendario Oficial &#8599;</a></p></div>
  </div>
  <div class="section-rule"></div>
${upcoming.length > 0 ? `  <div class="bi-row events-section">
    <div class="bi-en events-col">
${upcoming.map(e => eventRowEn(e)).join('\n')}
    </div>
    <div class="bi-es events-col" lang="es">
${upcoming.map(e => eventRowEs(e)).join('\n')}
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

GitHub:  <code><a href="https://github.com/dweekly/rcsd-meetings">https://github.com/dweekly/rcsd-meetings</a></code>
Website: <code><a href="https://rcsd.info">https://rcsd.info</a></code>
CDN:     <code><a href="https://data.rcsd.info">https://data.rcsd.info</a></code>

DATA FILES (<a href="https://data.rcsd.info/json/">data.rcsd.info/json/</a>):
  <a href="https://data.rcsd.info/json/meetings-data.json">meetings-data.json</a>       All meetings with agendas, items, attachments, timestamps
  <a href="https://data.rcsd.info/json/meeting-summaries.json">meeting-summaries.json</a>   Curated English summaries per meeting
  <a href="https://data.rcsd.info/json/meeting-summaries-es.json">meeting-summaries-es.json</a>  Curated Spanish summaries
  <a href="https://data.rcsd.info/json/schools.json">schools.json</a>             School directory (12 schools, addresses, principals, bell schedules)
  <a href="https://data.rcsd.info/json/district-calendar.json">district-calendar.json</a>   Key dates for the school year
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

</main>

<footer class="site-footer">
  <p>Independently compiled from publicly available RCSD documents. Source documents at <a href="https://www.rcsdk8.net">rcsdk8.net</a> and the <a href="https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=36030397">GAMUT board portal</a>.</p>
  <div class="footer-nav">
    <a href="/">Home</a>
    <a href="/meetings/">Meetings</a>
    <a href="/district/">District</a>
    <a href="https://github.com/dweekly/rcsd-meetings">Source Code &#8599;</a>
    <a href="mailto:team@rcsd.info">team@rcsd.info</a>
  </div>
</footer>

</body>
</html>`;

// ---- Write homepage ----
writeFileSync(resolve(ROOT, 'docs/index.html'), html);
console.log('Wrote docs/index.html (homepage)');

// ---- robots.txt ----
const robots = `User-agent: *
Allow: /

Sitemap: https://rcsd.info/sitemap.xml

# RCSD Open Data — independently compiled public records
# for the Redwood City School District
# Source: https://github.com/dweekly/rcsd-meetings
# Contact: team@rcsd.info
`;
writeFileSync(resolve(ROOT, 'docs/robots.txt'), robots);
console.log('Wrote docs/robots.txt');

// ---- humans.txt ----
const humans = `/* TEAM */
  Maintainer: David Weekly
  Site: https://david.weekly.org
  Location: Redwood City, CA
  Contact: team@rcsd.info

/* SITE */
  Standards: HTML5, CSS3, ES6
  Software: Node.js, Vanilla HTML/CSS
  Hosting: Cloudflare Pages
  Data CDN: Cloudflare R2 (data.rcsd.info)
  Source: https://github.com/dweekly/rcsd-meetings
  Last updated: ${new Date().toISOString().slice(0, 10)}
`;
writeFileSync(resolve(ROOT, 'docs/humans.txt'), humans);
console.log('Wrote docs/humans.txt');

// ---- sitemap.xml ----
const sitemapDate = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://rcsd.info/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://rcsd.info/meetings/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
    <xhtml:link rel="alternate" hreflang="en" href="https://rcsd.info/meetings/" />
    <xhtml:link rel="alternate" hreflang="es" href="https://rcsd.info/reuniones/" />
  </url>
  <url>
    <loc>https://rcsd.info/reuniones/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
    <xhtml:link rel="alternate" hreflang="es" href="https://rcsd.info/reuniones/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://rcsd.info/meetings/" />
  </url>
  <url>
    <loc>https://rcsd.info/district/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="en" href="https://rcsd.info/district/" />
    <xhtml:link rel="alternate" hreflang="es" href="https://rcsd.info/distrito/" />
  </url>
  <url>
    <loc>https://rcsd.info/distrito/</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="es" href="https://rcsd.info/distrito/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://rcsd.info/district/" />
  </url>
</urlset>
`;
writeFileSync(resolve(ROOT, 'docs/sitemap.xml'), sitemap);
console.log('Wrote docs/sitemap.xml');
