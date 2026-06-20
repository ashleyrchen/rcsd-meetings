#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BUILD_DATE = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
}).format(new Date());

const SITE_CSS = readFileSync(resolve(ROOT, 'assets/site.css'), 'utf8');
const SITE_JS = readFileSync(resolve(ROOT, 'assets/site.js'), 'utf8');

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
    ['bond-spending', `${prefix}bond-spending/index.html`, 'Measure W projects'],
    ['records', `${prefix}records/index.html`, 'Records'],
    ['search', `${prefix}search/index.html`, 'Search'],
    ['about', `${prefix}about/index.html`, 'About'],
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
  if (!data.allocationSource?.url || !Array.isArray(data.measureWProjects) || !data.measureWProjects.length) {
    throw new Error(`${relative(ROOT, file)} requires allocationSource.url and measureWProjects`);
  }
  if (data.measureWProjects.some(project => !project.id || !project.name || !project.campus || !Number.isFinite(project.allocation))) {
    throw new Error(`${relative(ROOT, file)} contains an incomplete Measure W project`);
  }
  return data;
}

function loadRecordCollections(config) {
  return (config.site.recordCollections || []).map(path => {
    const file = resolve(ROOT, path);
    const collection = JSON.parse(readFileSync(file, 'utf8'));
    if (!collection.key || !collection.title || !collection.date || !collection.sourceUrl || !Array.isArray(collection.records)) {
      throw new Error(`${relative(ROOT, file)} requires key, title, date, sourceUrl, and records`);
    }
    for (const record of collection.records) {
      if (!record.slug || !record.title || !record.sourceUrl || !record.body) {
        throw new Error(`${relative(ROOT, file)} contains an incomplete record`);
      }
    }
    return collection;
  });
}

function renderRecordCollectionPage(config, collection) {
  const cards = collection.records.map(record => `<article class="record-card"><div class="eyebrow">${escapeHtml(record.type || 'Official record')}</div><h2>${link(`${record.slug}/index.html`, record.title)}</h2><p>${sourceLink(record.sourceUrl, 'Open official source')}</p></article>`).join('');
  const body = `<div class="breadcrumbs">${link('../index.html', 'Home')} / ${escapeHtml(collection.title)}</div><section class="hero compact"><div class="eyebrow">Official election record</div><h1>${escapeHtml(collection.title)}</h1><p class="lede">${escapeHtml(collection.description || '')}</p><p>${sourceLink(collection.sourceUrl, 'Open the county voter-guide index')}</p></section><div class="record-list">${cards}</div>`;
  return layout({ title: `${collection.title} · ${config.site.title}`, description: collection.description, body, prefix: '../', active: collection.key });
}

function renderRecordPage(config, collection, record) {
  const body = `<div class="breadcrumbs">${link('../../index.html', 'Home')} / ${link('../index.html', collection.title)} / ${escapeHtml(record.title)}</div><section class="hero compact"><div class="eyebrow">${escapeHtml(record.type || 'Official record')}</div><h1>${escapeHtml(record.title)}</h1><p class="lede">Official material for the November 6, 2018 Measure W election.</p><p>${sourceLink(record.sourceUrl, 'Open official source')}</p></section><section><div class="minutes-text">${escapeHtml(record.body)}</div></section>`;
  return layout({ title: `${record.title} · ${collection.title}`, description: record.title, body, prefix: '../../', active: collection.key });
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function classifyAttachment(file, item) {
  const text = `${file.name || ''} ${item.title || ''}`.toLowerCase();
  let series = 'Other attachment';
  if (/bond.?list|rebase|project priority list|\bppl\b/.test(text)) series = 'Bond list rebase';
  else if (/performance audit|financial audit|\baudit\b/.test(text)) series = 'Audit';
  else if (/annual report/.test(text)) series = 'Annual report';
  else if (/project summary|whole.?program|program update|capital accounts/.test(text)) series = 'Project report';
  else if (/financial statement|\b311\b|budget report/.test(text)) series = 'Financial report';
  else if (/minute/.test(text)) series = 'Minutes';

  const hasW = /measure\s*w|measurew/.test(text);
  const hasC = /measure\s*c|measurec/.test(text);
  const measure = hasW && hasC ? 'Measure C & W' : hasW ? 'Measure W' : hasC ? 'Measure C' : '';
  return { series, measure };
}

function renderAttachmentRecordPage(config, record) {
  const fields = [
    ['Public body', record.b], ['Date', formatDate(record.d)],
    ['Record type', record.t], ['Document series', record.s],
    ...(record.m ? [['Measure', record.m]] : []),
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  const body = `<div class="breadcrumbs">${link('../../index.html', 'Home')} / ${link('../index.html', 'Records')} / ${escapeHtml(record.n)}</div>
    <section class="hero compact"><div class="eyebrow">${escapeHtml(record.t)}</div><h1>${escapeHtml(record.n)}</h1><p class="lede">Published with ${escapeHtml(record.x)}.</p></section>
    <dl class="record-metadata">${fields}</dl>
    <section><h2>Source and context</h2><p>${sourceLink(record.o, 'Open official attachment')}</p><p>${link(record.p, 'View the meeting and agenda item')}</p></section>`;
  return layout({ title: `${record.n} · Records`, description: `${record.t} published by ${record.b}`, body, prefix: '../../', active: 'records' });
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

function renderAllocationExplorer(data) {
  const projects = escapeHtml(JSON.stringify(data.measureWProjects));
  const reportedTotals = escapeHtml(JSON.stringify(data.measureWAllocationTotals || {}));
  const sortedProjects = [...data.measureWProjects].sort((a, b) => b.allocation - a.allocation || a.name.localeCompare(b.name));
  const projectRows = sortedProjects.map(project => {
    const scope = data.measureWProjectScopes?.[project.id];
    const campusClass = {
      'Mission College': 'campus-mission',
      'West Valley College': 'campus-west-valley',
      'District Services': 'campus-district',
    }[project.campus] || '';
    return `<details class="project-disclosure" data-project-row data-campus="${escapeHtml(project.campus)}" data-project-search="${escapeHtml(`${project.id} ${project.name}`.toLowerCase())}">
      <summary><span class="project-list-title"><i class="${campusClass}"></i><span><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.id)} · ${escapeHtml(project.campus)}</small></span></span><span class="project-list-budget">${formatMoney(project.allocation)}</span><span class="project-list-toggle" aria-hidden="true"></span></summary>
      <div class="project-scope"><div class="eyebrow">Project scope</div><p>${escapeHtml(scope || 'No project scope was included for this project in the April 2026 rebase Summary of Current Changes.')}</p><p>${sourceLink(data.allocationSource.url, 'Verify in the April 2026 Bond List Rebase')}</p></div>
    </details>`;
  }).join('');
  return `<section class="allocation-section" aria-label="Measure W project allocations" data-allocation-explorer data-projects="${projects}" data-reported-totals="${reportedTotals}">
    <div class="allocation-explorer">
      <div class="allocation-controls" role="group" aria-label="Filter projects by campus">
        <button type="button" class="active" data-campus="All campuses" aria-pressed="true">All campuses</button>
        <button type="button" data-campus="Mission College" aria-pressed="false">Mission College</button>
        <button type="button" data-campus="West Valley College" aria-pressed="false">West Valley College</button>
        <button type="button" data-campus="District Services" aria-pressed="false">District Services</button>
        <label><span class="sr-only">Search Measure W projects</span><input type="search" placeholder="Search project…" autocomplete="off" data-allocation-search></label>
      </div>
      <div class="allocation-legend" aria-label="Campus colors"><span><i class="campus-mission"></i>Mission College</span><span><i class="campus-west-valley"></i>West Valley College</span><span><i class="campus-district"></i>District Services</span></div>
      <div class="allocation-chart-heading"><strong>Largest Measure W allocations</strong> <span>(current filter)</span></div>
      <p class="allocation-status" aria-live="polite" data-allocation-status></p>
      <div class="allocation-chart-scroll"><div class="allocation-chart" data-allocation-chart></div></div>
    </div>
    <div class="project-list-header"><div><div class="eyebrow">All projects</div><h2>Full project list</h2><p data-project-list-status>${data.measureWProjects.length} projects, ordered by Measure W allocation.</p></div><div class="project-list-controls"><button type="button" data-expand-all>Expand all</button><button type="button" data-close-all>Close all</button></div></div>
    <div class="project-list" data-project-list>${projectRows}</div>
  </section>`;
}

function renderBondSpendingPage(config, data) {
  const body = `<div class="breadcrumbs">${link('../index.html', 'Home')} / Bond spending</div>
    <section class="hero compact"><div class="eyebrow">Measure W · Rebase #19</div><h1>Measure W project allocations</h1><p class="lede">Current Measure W funding by project, effective April 21, 2026.</p><p>${sourceLink(data.allocationSource.url, 'Open official April 2026 Bond List Rebase')}</p></section>
    ${renderAllocationExplorer(data)}`;
  return layout({ title: `Measure W project allocations · ${config.site.title}`, description: 'Measure W project allocations and scopes from the April 2026 Bond List Rebase', body, prefix: '../', active: 'bond-spending' });
}

function layout({ title, description, body, prefix = '', active = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${prefix}assets/site.css?v=${ASSET_VERSION}">
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
  <script src="${prefix}assets/site.js?v=${ASSET_VERSION}"></script>
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
  const recordCollections = loadRecordCollections(config);
  const committees = Object.entries(config.committees).map(([key, value]) => ({ key, ...value, meetings: readMeetings(value) }));
  const allMeetings = committees.flatMap(committee => committee.meetings.map(meeting => ({ committee, meeting }))).sort((a, b) => b.meeting.date.localeCompare(a.meeting.date));
  const recordEntries = [];
  const attachmentRecords = [];
  const usedRecordSlugs = new Set();

  for (const { committee, meeting } of allMeetings) {
    const meetingPath = `../${committee.key}/${meetingSlug(meeting)}/index.html`;
    recordEntries.push({
      b: committee.name, t: 'Meeting', s: 'Meeting agenda', m: '',
      y: meeting.date.slice(0, 4), d: meeting.date,
      n: meeting.name || `${committee.name} meeting`, u: meetingPath,
      o: meeting.url, x: committee.name,
    });
    if (meeting.minutes?.available || (meeting.minutesAttachments || []).length) {
      recordEntries.push({
        b: committee.name, t: 'Minutes', s: 'Minutes', m: '',
        y: meeting.date.slice(0, 4), d: meeting.date,
        n: `Minutes · ${meeting.name || committee.name}`, u: meetingPath,
        o: meeting.minutes?.sourceUrl || meeting.url, x: committee.name,
      });
    }
    (meeting.items || []).forEach((item, itemIndex) => {
      (item.attachments || []).forEach(file => {
        const { series, measure } = classifyAttachment(file, item);
        const baseSlug = slugify(`${committee.key}-${meeting.date}-${file.unique || file.name}`) || `attachment-${attachmentRecords.length + 1}`;
        let slug = baseSlug;
        let suffix = 2;
        while (usedRecordSlugs.has(slug)) slug = `${baseSlug}-${suffix++}`;
        usedRecordSlugs.add(slug);
        const record = {
          b: committee.name, t: 'Attachment', s: series, m: measure,
          y: meeting.date.slice(0, 4), d: meeting.date,
          n: file.name || 'Agenda attachment', u: `${slug}/index.html`,
          o: file.href, x: `${meeting.name || committee.name} · item ${item.order || itemIndex + 1}`,
          p: `../../${committee.key}/${meetingSlug(meeting)}/index.html#item-${itemIndex + 1}`,
          slug,
        };
        recordEntries.push(record);
        attachmentRecords.push(record);
      });
    });
  }
  for (const collection of recordCollections) {
    for (const record of collection.records) {
      recordEntries.push({
        b: 'Santa Cruz County Elections', t: 'Election record', s: 'Measure W voter guide', m: 'Measure W',
        y: collection.date.slice(0, 4), d: collection.date, n: record.title,
        u: `../${collection.key}/${record.slug}/index.html`, o: record.sourceUrl, x: collection.title,
      });
    }
  }
  recordEntries.sort((a, b) => b.d.localeCompare(a.d) || a.n.localeCompare(b.n));

  rmSync(config.outDir, { recursive: true, force: true });
  mkdirSync(resolve(config.outDir, 'assets'), { recursive: true });
  writeFileSync(resolve(config.outDir, 'assets/site.css'), SITE_CSS);
  writeFileSync(resolve(config.outDir, 'assets/site.js'), SITE_JS);

  const committeePanels = committees.map(committee => `<article class="directory-card"><div class="eyebrow">Public body</div><h2>${link(`records/index.html?body=${encodeURIComponent(committee.name)}`, committee.name)}</h2><p>${committee.meetings.length} meetings.</p></article>`).join('');
  const electionCount = recordCollections.reduce((total, collection) => total + collection.records.length, 0);
  const homeSearch = `<form class="home-search" action="search/index.html" method="get" role="search"><input type="search" name="q" aria-label="Search all public records" placeholder="Search the full text of public records"><button type="submit">Search</button></form>`;
  const homeBody = `<section class="hero"><div class="eyebrow">Public records archive</div><h1>${escapeHtml(config.site.title)}</h1><p class="lede">A neutral index of governing-board, bond-oversight, and Measure W election records. Every entry links to its official source.</p>${homeSearch}</section>
    <section><div class="section-heading"><div><div class="eyebrow">Directory</div><h2>Browse the archive</h2></div></div><div class="directory-grid">
      <article class="directory-card primary"><div class="eyebrow">Catalog</div><h2>${link('records/index.html', 'All records')}</h2><p>${recordEntries.length.toLocaleString('en-US')} indexed records with structured filters.</p></article>
      <article class="directory-card"><div class="eyebrow">Measure W</div><h2>${link('bond-spending/index.html', 'Project allocations')}</h2><p>${bondExpenditures?.measureWProjects?.length || 0} projects with scopes from Rebase #19.</p></article>
      ${committeePanels}
      <article class="directory-card"><div class="eyebrow">Election records</div><h2>${link('records/index.html?series=Measure%20W%20voter%20guide', 'Measure W voter guide')}</h2><p>${electionCount} county election records.</p></article>
      <article class="directory-card"><div class="eyebrow">Documentation</div><h2>${link('about/index.html', 'About this archive')}</h2><p>Sources, methodology, limitations, and update information.</p></article>
    </div></section>`;
  writePage(config.outDir, '', layout({ title: config.site.title, description: config.site.description, body: homeBody, active: 'home' }));

  writeFileSync(resolve(config.outDir, 'records-index.json'), JSON.stringify(recordEntries.map(({ slug, p, ...record }) => record)));
  const optionList = (key, allLabel) => [allLabel, ...new Set(recordEntries.map(record => record[key]).filter(Boolean))].map((value, index) => `<option value="${index ? escapeHtml(value) : ''}">${escapeHtml(value)}</option>`).join('');
  const recordsBody = `<div class="breadcrumbs">${link('../index.html', 'Home')} / Records</div>
    <section class="hero compact"><div class="eyebrow">Structured catalog</div><h1>Records</h1><p class="lede">Browse source documents by public body, record type, document series, measure, or year.</p></section>
    <section class="record-browser" data-records-page data-index="../records-index.json">
      <div class="record-filters"><label class="wide">Title or filename<input type="search" placeholder="Filter record titles" data-record-q></label><label>Public body<select data-record-filter="b">${optionList('b', 'All public bodies')}</select></label><label>Record type<select data-record-filter="t">${optionList('t', 'All record types')}</select></label><label>Document series<select data-record-filter="s">${optionList('s', 'All document series')}</select></label><label>Measure<select data-record-filter="m">${optionList('m', 'All measures')}</select></label><label>Year<select data-record-filter="y">${optionList('y', 'All years')}</select></label></div>
      <p class="record-browser-status" data-records-status aria-live="polite"></p><div class="record-list" data-records-results></div>
    </section>`;
  writePage(config.outDir, 'records', layout({ title: `Records · ${config.site.title}`, description: 'Filterable catalog of public records', body: recordsBody, prefix: '../', active: 'records' }));

  const aboutBody = `<div class="breadcrumbs">${link('../index.html', 'Home')} / About</div><section class="hero compact"><div class="eyebrow">Documentation</div><h1>About this archive</h1><p class="lede">An independent index of public records from West Valley-Mission Community College District and Santa Cruz County Elections.</p></section>
    <section><h2>Sources</h2><p>Meeting records come from the district's official BoardDocs portal. Measure W election materials come from Santa Cruz County Elections. Project allocations and scopes come from the district's April 2026 Bond List Rebase.</p></section>
    <section><h2>Methodology and limitations</h2><p>Pages are generated from structured source data. Text extracted from PDFs or public web pages may contain formatting or transcription errors. This archive is not an official district publication; verify consequential information against the linked source.</p></section>
    <section><h2>Coverage</h2><dl class="record-metadata"><div><dt>Meetings</dt><dd>${allMeetings.length}</dd></div><div><dt>Attachments</dt><dd>${attachmentRecords.length}</dd></div><div><dt>Election records</dt><dd>${electionCount}</dd></div></dl></section>`;
  writePage(config.outDir, 'about', layout({ title: `About · ${config.site.title}`, description: 'Sources and methodology for this public-record archive', body: aboutBody, prefix: '../', active: 'about' }));

  for (const record of attachmentRecords) writePage(config.outDir, `records/${record.slug}`, renderAttachmentRecordPage(config, record));

  if (bondExpenditures) {
    writePage(config.outDir, 'bond-spending', renderBondSpendingPage(config, bondExpenditures));
  }

  for (const collection of recordCollections) {
    writePage(config.outDir, collection.key, renderRecordCollectionPage(config, collection));
    for (const record of collection.records) {
      writePage(config.outDir, `${collection.key}/${record.slug}`, renderRecordPage(config, collection, record));
    }
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
  for (const collection of recordCollections) {
    for (const record of collection.records) {
      searchRecords.push({
        c: collection.title, d: collection.date, m: 'Santa Cruz County Elections',
        u: `../${collection.key}/${record.slug}/index.html`, a: record.type || 'Official record',
        t: record.title, b: record.body,
      });
    }
  }
  writeFileSync(resolve(config.outDir, 'search-index.json'), JSON.stringify(searchRecords));

  const searchBody = `<div class="breadcrumbs">${link('../index.html', 'Home')} / Search</div>
    <section class="hero compact"><div class="eyebrow">Search everything</div><h1>Search the archive</h1><p class="lede">Full-text search across agendas, minutes, and official Measure W election records. Each result links straight to the record.</p></section>
    <div class="filter-box"><label for="site-search">Search public records</label><input id="site-search" type="search" placeholder="Search by keyword, project, or person" autocomplete="off" data-search-input><p class="filter-status" aria-live="polite" data-search-status></p></div>
    <div data-search-page data-index="../search-index.json"><div class="record-list" data-search-results></div></div>`;
  writePage(config.outDir, 'search', layout({ title: `Search · ${config.site.title}`, description: 'Full-text search across all agenda items and minutes', body: searchBody, prefix: '../', active: 'search' }));

  console.log(`Built ${allMeetings.length} meetings, ${attachmentEntries.length} attachments, ${searchRecords.length} search records in ${relative(ROOT, config.outDir)}/`);
}

const ASSET_VERSION = createHash('sha256')
  .update(`${SITE_CSS}${SITE_JS}`)
  .digest('hex')
  .slice(0, 10);

try {
  build();
} catch (error) {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
}
