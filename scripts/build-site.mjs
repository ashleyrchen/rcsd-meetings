#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BUILD_DATE = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
}).format(new Date());

function parseArgs(args) {
  const index = args.indexOf('--config');
  if (index < 0 || !args[index + 1]) throw new Error('--config <path> is required');
  return { configPath: resolve(process.cwd(), args[index + 1]) };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return date || 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function meetingSlug(meeting) {
  return `${meeting.date}-${String(meeting.unique || 'meeting').toLowerCase()}`;
}

function countAttachments(meeting) {
  return (meeting.items || []).reduce((total, item) => total + (item.attachments || []).length, 0);
}

function link(href, label, className = '') {
  return `<a${className ? ` class="${className}"` : ''} href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function sourceLink(href, label) {
  return `<a class="source-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
}

function nav(prefix, active = '') {
  const entries = [
    ['home', `${prefix}index.html`, 'Home'],
    ['bond-spending', `${prefix}bond-spending/index.html`, 'Bond spending'],
    ['search', `${prefix}search/index.html`, 'Search'],
    ['board', `${prefix}board/index.html`, 'Board of Trustees'],
    ['cboc', `${prefix}cboc/index.html`, 'CBOC'],
    ['minutes', `${prefix}minutes/index.html`, 'Minutes'],
    ['attachments', `${prefix}attachments/index.html`, 'Attachments'],
  ];
  return entries.map(([key, href, label]) => link(href, label, active === key ? 'active' : '')).join('');
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
  }).format(value);
}

function loadBondExpenditures(config) {
  if (!config.site.bondExpenditures) return null;
  const file = resolve(ROOT, config.site.bondExpenditures);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const rows = [...(data.fundingSources || []), ...(data.locations || [])];
  for (const key of ['budget', 'expenditures', 'encumbrances', 'remaining']) {
    if (!Number.isFinite(data.totals?.[key]) || rows.some(row => !Number.isFinite(row[key]))) {
      throw new Error(`${relative(ROOT, file)} requires numeric ${key} values`);
    }
  }
  if (!data.source?.url || !data.reportingPeriod) {
    throw new Error(`${relative(ROOT, file)} requires source.url and reportingPeriod`);
  }
  return data;
}

function spendingBar(row) {
  const width = value => row.budget ? Math.max(0, value / row.budget * 100) : 0;
  return `<div class="spending-chart-row">
    <div class="spending-chart-label"><strong>${escapeHtml(row.name)}</strong><span>${formatCompactMoney(row.budget)} budget</span></div>
    <div class="spending-bar" role="img" aria-label="${escapeHtml(row.name)}: ${formatMoney(row.expenditures)} expended, ${formatMoney(row.encumbrances)} encumbered, and ${formatMoney(row.remaining)} remaining of ${formatMoney(row.budget)}">
      <span class="bar-expended" style="width:${width(row.expenditures).toFixed(4)}%"></span><span class="bar-encumbered" style="width:${width(row.encumbrances).toFixed(4)}%"></span><span class="bar-remaining" style="width:${width(row.remaining).toFixed(4)}%"></span>
    </div>
    <div class="spending-chart-value">${row.budget ? (row.expenditures / row.budget * 100).toFixed(1) : '0.0'}% expended</div>
  </div>`;
}

function spendingTable(rows, label) {
  const body = rows.map(row => `<tr><th scope="row">${escapeHtml(row.name)}</th><td>${formatMoney(row.budget)}</td><td>${formatMoney(row.expenditures)}</td><td>${formatMoney(row.encumbrances)}</td><td>${formatMoney(row.remaining)}</td></tr>`).join('');
  return `<div class="table-scroll"><table class="spending-table"><caption>${escapeHtml(label)}</caption><thead><tr><th scope="col">Name</th><th scope="col">Budget</th><th scope="col">Expenditures</th><th scope="col">Encumbrances</th><th scope="col">Remaining</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderBondSpendingPage(config, data) {
  const totals = data.totals;
  const committed = totals.expenditures + totals.encumbrances;
  const legend = `<div class="spending-legend" aria-label="Chart legend"><span><i class="legend-expended"></i>Expenditures</span><span><i class="legend-encumbered"></i>Encumbrances</span><span><i class="legend-remaining"></i>Remaining</span></div>`;
  const notes = (data.notes || []).map(note => `<li>${escapeHtml(note)}</li>`).join('');
  const body = `<div class="breadcrumbs">${link('../index.html', 'Home')} / Bond spending</div>
    <section class="hero compact"><div class="eyebrow">Measure C and Measure W</div><h1>${escapeHtml(data.title || 'Bond spending')}</h1><p class="lede">A snapshot of the district's reported capital-program expenditures, commitments, and remaining budgets.</p><p class="report-meta"><strong>${escapeHtml(data.reportingPeriod)}</strong> · ${escapeHtml(data.status || '')} report published ${escapeHtml(data.published || 'date unavailable')}</p><p>${sourceLink(data.source.url, `Open official ${data.source.name || 'source report'}`)}</p></section>
    <div class="spending-stats"><div><span>Total program budget</span><strong>${formatCompactMoney(totals.budget)}</strong><small>Includes bond and co-funding sources</small></div><div><span>Paid and accrued</span><strong>${formatCompactMoney(totals.expenditures)}</strong><small>${(totals.expenditures / totals.budget * 100).toFixed(1)}% of budget</small></div><div><span>Committed</span><strong>${formatCompactMoney(committed)}</strong><small>Expenditures plus encumbrances</small></div><div><span>Remaining</span><strong>${formatCompactMoney(totals.remaining)}</strong><small>${(totals.remaining / totals.budget * 100).toFixed(1)}% of budget</small></div></div>
    <p class="notice"><strong>Snapshot, not live accounting.</strong> These figures were transcribed from a district ${escapeHtml((data.status || '').toLowerCase())} report. Verify consequential uses against the linked official PDF.</p>
    <section><div class="section-heading"><div><div class="eyebrow">Where the money stands</div><h2>By funding source</h2></div></div>${legend}<div class="spending-chart">${data.fundingSources.map(spendingBar).join('')}</div>${spendingTable(data.fundingSources, 'Bond program status by funding source')}</section>
    <section><div class="section-heading"><div><div class="eyebrow">Across the district</div><h2>By location</h2></div></div>${legend}<div class="spending-chart">${data.locations.map(spendingBar).join('')}</div>${spendingTable(data.locations, 'Bond program status by location')}</section>
    <section class="methodology"><h2>How to read this page</h2><ul>${notes}</ul>${data.source.meetingUrl ? `<p>${sourceLink(data.source.meetingUrl, 'Open the CBOC meeting record')}</p>` : ''}</section>`;
  return layout({ title: `Bond spending · ${config.site.title}`, description: `Bond expenditure snapshot for ${data.reportingPeriod}`, body, prefix: '../', active: 'bond-spending' });
}

function layout({ title, description, body, prefix = '', active = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${prefix}assets/site.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="shell header-inner">
      ${link(`${prefix}index.html`, 'West Valley-Mission Public Meetings', 'brand')}
      <nav aria-label="Primary">${nav(prefix, active)}</nav>
    </div>
  </header>
  <main id="main" class="shell">${body}</main>
  <footer><div class="shell">
    <p class="disclaimer"><strong>Last updated ${BUILD_DATE}.</strong> This is an independent open-data project by a private citizen — not an official publication of the West Valley-Mission Community College District. Pages and figures are compiled and generated with the assistance of AI and may contain errors or omissions. Use at your own discretion and always verify against the official source before relying on any information.</p>
  </div></footer>
  <script src="${prefix}assets/site.js"></script>
</body>
</html>`;
}

function meetingCard(meeting, href) {
  const attachments = countAttachments(meeting);
  const minutes = meeting.minutes?.available || (meeting.minutesAttachments || []).length;
  return `<article class="meeting-card">
    <div class="eyebrow">${escapeHtml(formatDate(meeting.date))}</div>
    <h3>${link(href, meeting.name || meeting.type || 'Meeting')}</h3>
    <div class="meta"><span>${(meeting.items || []).length} agenda items</span><span>${attachments} attachments</span><span>${minutes ? 'Minutes available' : 'Minutes not published'}</span></div>
  </article>`;
}

function renderMeetingPage(config, committee, meeting) {
  const agenda = (meeting.items || []).map((item, index) => {
    const attachments = (item.attachments || []).map(attachment => `<li>${sourceLink(attachment.href, attachment.name || 'Attachment')}${attachment.size ? ` <span class="file-size">${escapeHtml(attachment.size)}</span>` : ''}</li>`).join('');
    return `<article class="agenda-item" id="item-${index + 1}">
      <div class="eyebrow">${escapeHtml([item.order, item.actionType, item.category].filter(Boolean).join(' · '))}</div>
      <h3>${escapeHtml(item.title || 'Untitled agenda item')}</h3>
      ${item.body ? `<p class="item-body">${escapeHtml(item.body)}</p>` : ''}
      ${attachments ? `<h4>Attachments</h4><ul class="attachment-list">${attachments}</ul>` : ''}
      <p>${sourceLink(item.url, 'Open agenda item in BoardDocs')}</p>
    </article>`;
  }).join('');

  const minutesPdfs = (meeting.minutesAttachments || []).map(attachment => `<li>${sourceLink(attachment.href, attachment.name || 'Meeting minutes PDF')}<div class="muted">Agenda item ${escapeHtml(attachment.itemOrder)}: ${escapeHtml(attachment.itemTitle)}</div></li>`).join('');
  const minutes = meeting.minutes?.available
    ? `<section><div class="section-heading"><div><div class="eyebrow">Official record</div><h2>Published minutes</h2></div>${sourceLink(meeting.minutes.sourceUrl || meeting.url, 'View in BoardDocs')}</div><div class="minutes-text">${escapeHtml(meeting.minutes.text)}</div></section>`
    : `<section><h2>Published minutes</h2><p class="notice">BoardDocs has not published generated minutes for this meeting.</p></section>`;

  const body = `<div class="breadcrumbs">${link('../../index.html', 'Home')} / ${link('../index.html', committee.name)} / ${escapeHtml(formatDate(meeting.date))}</div>
    <section class="hero compact"><div class="eyebrow">${escapeHtml(committee.name)}</div><h1>${escapeHtml(meeting.name || meeting.type || 'Meeting')}</h1><p class="lede">${escapeHtml(formatDate(meeting.date))}</p>${meeting.description ? `<p class="meeting-description">${escapeHtml(meeting.description)}</p>` : ''}<p>${sourceLink(meeting.url, 'Open official meeting in BoardDocs')}</p></section>
    <div class="stats"><div><strong>${(meeting.items || []).length}</strong><span>Agenda items</span></div><div><strong>${countAttachments(meeting)}</strong><span>Attachments</span></div><div><strong>${meeting.minutes?.available ? 'Yes' : 'No'}</strong><span>Generated minutes</span></div></div>
    ${minutes}
    ${minutesPdfs ? `<section><h2>Minutes PDFs attached to this agenda</h2><p class="muted">These files may document an earlier meeting being approved at this meeting.</p><ul class="attachment-list prominent">${minutesPdfs}</ul></section>` : ''}
    <section><div class="section-heading"><div><div class="eyebrow">Official agenda</div><h2>Agenda items and attachments</h2></div>${sourceLink(meeting.url, 'View agenda in BoardDocs')}</div>${agenda || '<p class="notice">No public agenda items were returned by BoardDocs.</p>'}</section>`;
  return layout({ title: `${formatDate(meeting.date)} · ${committee.name}`, description: `Agenda, minutes, and attachments for ${meeting.name}`, body, prefix: '../../', active: committee.key });
}

function loadConfig(configPath) {
  const config = parseYaml(readFileSync(configPath, 'utf8'));
  if (!config?.site?.output || !config?.committees) throw new Error('Config requires site.output and committees');
  const outDir = resolve(ROOT, config.site.output);
  if (!outDir.startsWith(`${ROOT}${sep}`)) throw new Error('site.output must be inside the repository');
  config.outDir = outDir;
  return config;
}

function writePage(outDir, path, html) {
  const file = resolve(outDir, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

function readMeetings(committee) {
  const file = resolve(ROOT, committee.output);
  if (!existsSync(file)) return [];
  const meetings = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(meetings)) throw new Error(`${relative(ROOT, file)} must contain an array`);
  return meetings;
}

function build() {
  const { configPath } = parseArgs(process.argv.slice(2));
  const config = loadConfig(configPath);
  const bondExpenditures = loadBondExpenditures(config);
  const committees = Object.entries(config.committees).map(([key, value]) => ({ key, ...value, meetings: readMeetings(value) }));
  const allMeetings = committees.flatMap(committee => committee.meetings.map(meeting => ({ committee, meeting }))).sort((a, b) => b.meeting.date.localeCompare(a.meeting.date));

  rmSync(config.outDir, { recursive: true, force: true });
  mkdirSync(resolve(config.outDir, 'assets'), { recursive: true });
  writeFileSync(resolve(config.outDir, 'assets/site.css'), CSS);
  writeFileSync(resolve(config.outDir, 'assets/site.js'), JS);

  const committeePanels = committees.map(committee => `<article class="committee-panel"><div class="eyebrow">Public body</div><h2>${link(`${committee.key}/index.html`, committee.name)}</h2><p>${committee.meetings.length} meetings in the archive.</p><p>${link(`${committee.key}/index.html`, 'Browse meetings →')}</p></article>`).join('');
  const recent = allMeetings.slice(0, 12).map(({ committee, meeting }) => meetingCard(meeting, `${committee.key}/${meetingSlug(meeting)}/index.html`)).join('');
  const homeSearch = `<form class="home-search" action="search/index.html" method="get" role="search"><input type="search" name="q" aria-label="Search all agendas and minutes" placeholder="Search every agenda item &amp; minutes by keyword"><button type="submit">Search</button></form>`;
  const homeBody = `<section class="hero"><div class="eyebrow">Public records, made browsable</div><h1>${escapeHtml(config.site.title)}</h1><p class="lede">${escapeHtml(config.site.description)}</p>${homeSearch}<p>Every record links back to the official West Valley-Mission BoardDocs portal.</p></section><section class="committee-grid">${committeePanels}</section><section><div class="section-heading"><div><div class="eyebrow">Across both bodies</div><h2>Recent meetings</h2></div></div>${recent ? `<div class="meeting-list">${recent}</div>` : '<p class="notice">Run the scraper to populate the archive.</p>'}</section>`;
  writePage(config.outDir, '', layout({ title: config.site.title, description: config.site.description, body: homeBody, active: 'home' }));

  if (bondExpenditures) {
    writePage(config.outDir, 'bond-spending', renderBondSpendingPage(config, bondExpenditures));
  }

  for (const committee of committees) {
    const cards = committee.meetings.map(meeting => meetingCard(meeting, `${meetingSlug(meeting)}/index.html`)).join('');
    const body = `<div class="breadcrumbs">${link('../index.html', 'Home')} / ${escapeHtml(committee.name)}</div><section class="hero compact"><div class="eyebrow">Meeting archive</div><h1>${escapeHtml(committee.name)}</h1><p class="lede">Agendas, minutes, and agenda-item attachments from BoardDocs.</p><p>${link('../search/index.html', 'Search all agendas and minutes →')}</p></section><div class="meeting-list">${cards || '<p class="notice">No meetings have been scraped yet.</p>'}</div>`;
    writePage(config.outDir, committee.key, layout({ title: `${committee.name} · ${config.site.title}`, description: `Meeting archive for ${committee.name}`, body, prefix: '../', active: committee.key }));
    for (const meeting of committee.meetings) writePage(config.outDir, `${committee.key}/${meetingSlug(meeting)}`, renderMeetingPage(config, committee, meeting));
  }

  const minutesEntries = allMeetings.filter(({ meeting }) => meeting.minutes?.available || (meeting.minutesAttachments || []).length).map(({ committee, meeting }) => {
    const page = `../${committee.key}/${meetingSlug(meeting)}/index.html`;
    const pdfs = (meeting.minutesAttachments || []).map(file => `<li>${sourceLink(file.href, file.name || 'Minutes PDF')} <span class="muted">from ${escapeHtml(file.itemTitle)}</span></li>`).join('');
    return `<article class="record-card"><div class="eyebrow">${escapeHtml(committee.name)} · ${escapeHtml(formatDate(meeting.date))}</div><h2>${link(page, meeting.name || 'Meeting')}</h2>${meeting.minutes?.available ? `<p>${link(page, 'Read published minutes')}</p>` : ''}${pdfs ? `<ul class="attachment-list">${pdfs}</ul>` : ''}</article>`;
  }).join('');
  const minutesBody = `<div class="breadcrumbs">${link('../index.html', 'Home')} / Minutes</div><section class="hero compact"><div class="eyebrow">Official records</div><h1>Meeting minutes</h1><p class="lede">Generated minutes and minutes PDFs published through BoardDocs.</p><p>${link('../search/index.html', 'Search all agendas and minutes →')}</p></section><div class="record-list">${minutesEntries || '<p class="notice">No published minutes were found.</p>'}</div>`;
  writePage(config.outDir, 'minutes', layout({ title: `Minutes · ${config.site.title}`, description: 'Published BoardDocs meeting minutes', body: minutesBody, prefix: '../', active: 'minutes' }));

  const attachmentEntries = allMeetings.flatMap(({ committee, meeting }) => (meeting.items || []).flatMap(item => (item.attachments || []).map(file => ({ committee, meeting, item, file }))));
  const attachments = attachmentEntries.map(({ committee, meeting, item, file }) => `<article class="attachment-card"><div class="eyebrow">${escapeHtml(committee.name)} · ${escapeHtml(formatDate(meeting.date))}</div><h2>${sourceLink(file.href, file.name || 'Attachment')}</h2><p>${escapeHtml(item.order)} ${escapeHtml(item.title)}</p><p>${link(`../${committee.key}/${meetingSlug(meeting)}/index.html`, 'View meeting')}</p></article>`).join('');
  const attachmentBody = `<div class="breadcrumbs">${link('../index.html', 'Home')} / Attachments</div><section class="hero compact"><div class="eyebrow">Agenda files</div><h1>All attachments</h1><p class="lede">Every file BoardDocs lists on a public agenda item.</p></section><div class="record-list">${attachments || '<p class="notice">No attachments were found.</p>'}</div>`;
  writePage(config.outDir, 'attachments', layout({ title: `Attachments · ${config.site.title}`, description: 'BoardDocs agenda attachments', body: attachmentBody, prefix: '../', active: 'attachments' }));

  // Full-text search index: one record per agenda item (deep-linked to its
  // anchor) plus one per published minutes set. Paths are relative to /search/.
  const searchRecords = [];
  for (const { committee, meeting } of allMeetings) {
    const base = `../${committee.key}/${meetingSlug(meeting)}/index.html`;
    (meeting.items || []).forEach((item, index) => {
      searchRecords.push({
        c: committee.name, d: meeting.date, m: meeting.name || '',
        u: `${base}#item-${index + 1}`, a: item.actionType || '',
        t: item.title || '', b: item.body || '',
      });
    });
    if (meeting.minutes?.available && meeting.minutes.text) {
      searchRecords.push({
        c: committee.name, d: meeting.date, m: meeting.name || '',
        u: base, a: 'Minutes', t: 'Published minutes', b: meeting.minutes.text,
      });
    }
  }
  writeFileSync(resolve(config.outDir, 'search-index.json'), JSON.stringify(searchRecords));

  const searchBody = `<div class="breadcrumbs">${link('../index.html', 'Home')} / Search</div>
    <section class="hero compact"><div class="eyebrow">Search everything</div><h1>Search the archive</h1><p class="lede">Full-text search across every agenda item and published minutes from both public bodies. Each result links straight to the record.</p></section>
    <div class="filter-box"><label for="site-search">Search agendas &amp; minutes</label><input id="site-search" type="search" placeholder="Search by keyword, project, or person" autocomplete="off" data-search-input><p class="filter-status" aria-live="polite" data-search-status></p></div>
    <div data-search-page data-index="../search-index.json"><div class="record-list" data-search-results></div></div>`;
  writePage(config.outDir, 'search', layout({ title: `Search · ${config.site.title}`, description: 'Full-text search across all agenda items and minutes', body: searchBody, prefix: '../', active: 'search' }));

  console.log(`Built ${allMeetings.length} meetings, ${attachmentEntries.length} attachments, ${searchRecords.length} search records in ${relative(ROOT, config.outDir)}/`);
}

const CSS = `:root{--ink:#16212b;--muted:#5b6873;--line:#d9e0e5;--paper:#fff;--wash:#f3f6f8;--navy:#173b57;--blue:#176b87;--gold:#d8a928}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--paper);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{width:min(1120px,calc(100% - 2rem));margin:auto}.skip-link{position:absolute;left:-9999px}.skip-link:focus{left:1rem;top:1rem;background:#fff;padding:.75rem;z-index:10}.site-header{background:var(--navy);color:#fff}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:2rem;padding:1rem 0}.brand{font-weight:750;color:#fff;text-decoration:none}.site-header nav{display:flex;gap:.25rem;flex-wrap:wrap}.site-header nav a{color:#dce9ef;text-decoration:none;padding:.5rem .65rem;border-radius:.35rem}.site-header nav a:hover,.site-header nav a.active{background:#fff;color:var(--navy)}main{padding-bottom:5rem}.hero{padding:5.5rem 0 3.5rem;max-width:850px}.hero.compact{padding:3rem 0 2rem}.hero h1{font-family:Georgia,serif;font-size:clamp(2.4rem,6vw,5rem);line-height:1.02;margin:.25rem 0 1rem;color:var(--navy)}.hero.compact h1{font-size:clamp(2rem,5vw,3.75rem)}.lede{font-size:1.25rem;color:var(--muted);max-width:720px}.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:.76rem;font-weight:800;color:var(--blue)}h2,h3,h4{line-height:1.2}a{color:#075f7d}a:hover{text-decoration-thickness:2px}.committee-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-bottom:4rem}.committee-panel{background:var(--wash);border-top:4px solid var(--gold);padding:1.5rem}.committee-panel h2{font-family:Georgia,serif;font-size:1.75rem}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--line);margin:3rem 0 1rem}.section-heading h2{font:2rem Georgia,serif;margin:.25rem 0 .75rem}.meeting-list,.record-list{display:grid;gap:.75rem}.meeting-card,.record-card,.attachment-card{border:1px solid var(--line);padding:1.15rem 1.25rem;border-radius:.35rem;background:#fff}.meeting-card h3,.record-card h2,.attachment-card h2{margin:.25rem 0;font-size:1.15rem}.meta{display:flex;gap:1rem;flex-wrap:wrap;color:var(--muted);font-size:.9rem}.breadcrumbs{padding-top:1.5rem;color:var(--muted)}.breadcrumbs a{color:inherit}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:3rem}.stats div{background:var(--paper);padding:1.25rem}.stats strong,.stats span{display:block}.stats strong{font:2rem Georgia,serif;color:var(--navy)}.stats span{color:var(--muted)}section+section{margin-top:3.5rem}.agenda-item{border-top:1px solid var(--line);padding:1.5rem 0}.agenda-item h3{font:1.45rem Georgia,serif;margin:.3rem 0}.agenda-item h4{margin-bottom:.25rem}.item-body{white-space:pre-line;max-width:850px}.attachment-list{padding-left:1.2rem}.attachment-list li{margin:.45rem 0}.file-size,.muted{color:var(--muted);font-size:.9rem}.source-link{font-weight:650}.minutes-text{white-space:pre-wrap;background:var(--wash);border-left:4px solid var(--blue);padding:1.5rem;max-height:42rem;overflow:auto}.notice{background:#fff8df;border-left:4px solid var(--gold);padding:1rem}.filter-box{background:var(--wash);padding:1rem;margin:1rem 0}.filter-box label{display:block;font-weight:700;margin-bottom:.35rem}.filter-box input{width:min(100%,600px);font:inherit;padding:.7rem;border:1px solid #9cabb6;border-radius:.25rem}.filter-status{display:inline;margin-left:.75rem;color:var(--muted)}.home-search{display:flex;gap:.5rem;max-width:640px;margin:1.5rem 0}.home-search input{flex:1;font:inherit;padding:.8rem 1rem;border:1px solid #9cabb6;border-radius:.3rem}.home-search button{font:inherit;font-weight:700;padding:.8rem 1.4rem;border:0;border-radius:.3rem;background:var(--navy);color:#fff;cursor:pointer}.home-search button:hover{background:var(--blue)}.snippet{max-width:850px;line-height:1.5}.snippet mark,.minutes-text mark{background:#fde68a;color:inherit;padding:0 .1em}footer{background:var(--wash);border-top:1px solid var(--line);padding:2rem 0;color:var(--muted);font-size:.9rem}.disclaimer{max-width:900px;margin:0;line-height:1.6}.disclaimer strong{color:var(--ink)}.report-meta{color:var(--muted)}.spending-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:1.5rem}.spending-stats div{background:var(--paper);padding:1.15rem}.spending-stats span,.spending-stats strong,.spending-stats small{display:block}.spending-stats span{color:var(--muted);font-size:.85rem;font-weight:700}.spending-stats strong{font:2rem Georgia,serif;color:var(--navy);margin:.2rem 0}.spending-stats small{color:var(--muted)}.spending-legend{display:flex;gap:1.25rem;flex-wrap:wrap;margin:1rem 0;color:var(--muted);font-size:.9rem}.spending-legend span{display:flex;align-items:center;gap:.4rem}.spending-legend i{width:.8rem;height:.8rem;display:inline-block;border-radius:2px}.legend-expended,.bar-expended{background:#176b87}.legend-encumbered,.bar-encumbered{background:#d8a928}.legend-remaining,.bar-remaining{background:#d9e0e5}.spending-chart{display:grid;gap:1rem;margin:1.5rem 0 2rem}.spending-chart-row{display:grid;grid-template-columns:minmax(140px,1.4fr) minmax(260px,4fr) 100px;gap:1rem;align-items:center}.spending-chart-label span{display:block;color:var(--muted);font-size:.82rem}.spending-bar{display:flex;height:1.4rem;background:var(--wash);border-radius:3px;overflow:hidden}.spending-bar span{height:100%}.spending-chart-value{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums;font-size:.88rem}.table-scroll{overflow-x:auto;margin-top:1rem}.spending-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:.92rem}.spending-table caption{text-align:left;font-weight:700;padding:.5rem 0}.spending-table th,.spending-table td{padding:.7rem .6rem;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}.spending-table th:first-child{text-align:left}.spending-table thead th{color:var(--muted);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}.methodology{max-width:850px}.methodology li{margin:.5rem 0}@media(max-width:900px){.spending-stats{grid-template-columns:1fr 1fr}}@media(max-width:760px){.header-inner{align-items:flex-start;flex-direction:column;gap:.5rem}.site-header nav{display:grid;grid-template-columns:1fr 1fr;width:100%}.committee-grid{grid-template-columns:1fr}.stats{grid-template-columns:1fr}.hero{padding-top:3rem}.section-heading{align-items:start;flex-direction:column}.section-heading>.source-link{margin-bottom:1rem}.spending-chart-row{grid-template-columns:1fr}.spending-chart-value{text-align:left}.spending-bar{height:1.2rem}}@media(max-width:500px){.spending-stats{grid-template-columns:1fr}}`;

const JS = `(function(){
  var root=document.querySelector('[data-search-page]');
  if(!root)return;
  var input=document.querySelector('[data-search-input]');
  var status=document.querySelector('[data-search-status]');
  var out=root.querySelector('[data-search-results]');
  var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var data=[];var ready=false;var pending=null;
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function fmtDate(d){var p=String(d||'').split('-');if(p.length!==3)return d||'';return months[(+p[1])-1]+' '+(+p[2])+', '+p[0]}
  function highlight(frag,terms){
    var lower=frag.toLowerCase();var ranges=[];
    for(var i=0;i<terms.length;i++){var term=terms[i];if(!term)continue;var from=0;var idx;while((idx=lower.indexOf(term,from))>=0){ranges.push([idx,idx+term.length]);from=idx+term.length}}
    if(!ranges.length)return frag;
    ranges.sort(function(a,b){return a[0]-b[0]});
    var merged=[ranges[0]];for(var r=1;r<ranges.length;r++){var last=merged[merged.length-1];if(ranges[r][0]<=last[1]){if(ranges[r][1]>last[1])last[1]=ranges[r][1]}else merged.push(ranges[r])}
    var res='';var pos=0;for(var m=0;m<merged.length;m++){res+=frag.slice(pos,merged[m][0])+'<mark>'+frag.slice(merged[m][0],merged[m][1])+'</mark>';pos=merged[m][1]}
    return res+frag.slice(pos)
  }
  function snippet(text,terms){
    var lc=text.toLowerCase();var pos=-1;
    for(var i=0;i<terms.length;i++){var p=lc.indexOf(terms[i]);if(p>=0&&(pos<0||p<pos))pos=p}
    if(pos<0)pos=0;
    var start=pos>70?pos-70:0;var end=pos+200<text.length?pos+200:text.length;
    var frag=(start>0?'… ':'')+text.slice(start,end)+(end<text.length?' …':'');
    return highlight(esc(frag),terms)
  }
  function render(q){
    var phrase=q.toLowerCase().trim();
    if(!phrase){out.innerHTML='';status.textContent='';return}
    var terms=[phrase];
    var res=[];
    for(var i=0;i<data.length;i++){var r=data[i];var hay=(r.t+' '+r.b+' '+r.m+' '+r.c+' '+r.d).toLowerCase();if(hay.indexOf(phrase)>=0)res.push(r)}
    res.sort(function(a,b){return a.d<b.d?1:a.d>b.d?-1:0});
    status.textContent=res.length+' result'+(res.length===1?'':'s');
    var lim=res.slice(0,300);var html='';
    for(var k=0;k<lim.length;k++){var x=lim[k];
      html+='<article class="record-card"><div class="eyebrow">'+esc(x.c)+' · '+esc(fmtDate(x.d))+(x.a?' · '+esc(x.a):'')+'</div>'+
      '<h2><a href="'+esc(x.u)+'">'+esc(x.t||'Untitled')+'</a></h2>'+
      (x.m?'<p class="muted">'+esc(x.m)+'</p>':'')+
      '<p class="snippet">'+snippet(x.b||x.t||'',terms)+'</p></article>'}
    if(res.length>lim.length)html+='<p class="notice">Showing the first '+lim.length+' of '+res.length+' results. Add another word to narrow your search.</p>';
    out.innerHTML=html
  }
  function load(cb){if(ready){cb();return}status.textContent='Loading search index…';fetch(root.dataset.index).then(function(r){return r.json()}).then(function(j){data=j;ready=true;cb()}).catch(function(){status.textContent='Could not load the search index.'})}
  function run(){var q=input.value.trim();var u=new URL(window.location.href);if(q)u.searchParams.set('q',q);else u.searchParams.delete('q');history.replaceState(null,'',u);if(!q){out.innerHTML='';status.textContent='';return}load(function(){render(q)})}
  input.addEventListener('input',function(){clearTimeout(pending);pending=setTimeout(run,180)});
  var initial=new URL(window.location.href).searchParams.get('q');
  if(initial){input.value=initial;run()}
})();`;

try {
  build();
} catch (error) {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
}
