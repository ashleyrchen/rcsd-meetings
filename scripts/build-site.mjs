#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
    ['board', `${prefix}board/index.html`, 'Board of Trustees'],
    ['cboc', `${prefix}cboc/index.html`, 'CBOC'],
    ['minutes', `${prefix}minutes/index.html`, 'Minutes'],
    ['attachments', `${prefix}attachments/index.html`, 'Attachments'],
  ];
  return entries.map(([key, href, label]) => link(href, label, active === key ? 'active' : '')).join('');
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
  <footer><div class="shell">Independent public-record archive. Always verify information against the linked official BoardDocs source.</div></footer>
  <script src="${prefix}assets/site.js"></script>
</body>
</html>`;
}

function meetingCard(meeting, href) {
  const attachments = countAttachments(meeting);
  const minutes = meeting.minutes?.available || (meeting.minutesAttachments || []).length;
  const search = [meeting.date, meeting.name, meeting.type, ...(meeting.items || []).map(item => item.title)].join(' ');
  return `<article class="meeting-card" data-filter-item data-search="${escapeHtml(search.toLowerCase())}">
    <div class="eyebrow">${escapeHtml(formatDate(meeting.date))}</div>
    <h3>${link(href, meeting.name || meeting.type || 'Meeting')}</h3>
    <div class="meta"><span>${(meeting.items || []).length} agenda items</span><span>${attachments} attachments</span><span>${minutes ? 'Minutes available' : 'Minutes not published'}</span></div>
  </article>`;
}

function filterBox(label) {
  return `<div class="filter-box"><label for="archive-filter">${escapeHtml(label)}</label><input id="archive-filter" type="search" placeholder="Type to filter…" data-filter-input><p class="filter-status" aria-live="polite" data-filter-status></p></div>`;
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
  const committees = Object.entries(config.committees).map(([key, value]) => ({ key, ...value, meetings: readMeetings(value) }));
  const allMeetings = committees.flatMap(committee => committee.meetings.map(meeting => ({ committee, meeting }))).sort((a, b) => b.meeting.date.localeCompare(a.meeting.date));

  rmSync(config.outDir, { recursive: true, force: true });
  mkdirSync(resolve(config.outDir, 'assets'), { recursive: true });
  writeFileSync(resolve(config.outDir, 'assets/site.css'), CSS);
  writeFileSync(resolve(config.outDir, 'assets/site.js'), JS);

  const committeePanels = committees.map(committee => `<article class="committee-panel"><div class="eyebrow">Public body</div><h2>${link(`${committee.key}/index.html`, committee.name)}</h2><p>${committee.meetings.length} meetings in the archive.</p><p>${link(`${committee.key}/index.html`, 'Browse meetings →')}</p></article>`).join('');
  const recent = allMeetings.slice(0, 12).map(({ committee, meeting }) => meetingCard(meeting, `${committee.key}/${meetingSlug(meeting)}/index.html`)).join('');
  const homeBody = `<section class="hero"><div class="eyebrow">Public records, made browsable</div><h1>${escapeHtml(config.site.title)}</h1><p class="lede">${escapeHtml(config.site.description)}</p><p>Every record links back to the official West Valley-Mission BoardDocs portal.</p></section><section class="committee-grid">${committeePanels}</section><section><div class="section-heading"><div><div class="eyebrow">Across both bodies</div><h2>Recent meetings</h2></div></div>${recent ? `<div class="meeting-list">${recent}</div>` : '<p class="notice">Run the scraper to populate the archive.</p>'}</section>`;
  writePage(config.outDir, '', layout({ title: config.site.title, description: config.site.description, body: homeBody, active: 'home' }));

  for (const committee of committees) {
    const cards = committee.meetings.map(meeting => meetingCard(meeting, `${meetingSlug(meeting)}/index.html`)).join('');
    const body = `<div class="breadcrumbs">${link('../index.html', 'Home')} / ${escapeHtml(committee.name)}</div><section class="hero compact"><div class="eyebrow">Meeting archive</div><h1>${escapeHtml(committee.name)}</h1><p class="lede">Agendas, minutes, and agenda-item attachments from BoardDocs.</p></section>${filterBox('Filter meetings by date, title, or agenda item')}<div class="meeting-list">${cards || '<p class="notice">No meetings have been scraped yet.</p>'}</div>`;
    writePage(config.outDir, committee.key, layout({ title: `${committee.name} · ${config.site.title}`, description: `Meeting archive for ${committee.name}`, body, prefix: '../', active: committee.key }));
    for (const meeting of committee.meetings) writePage(config.outDir, `${committee.key}/${meetingSlug(meeting)}`, renderMeetingPage(config, committee, meeting));
  }

  const minutesEntries = allMeetings.filter(({ meeting }) => meeting.minutes?.available || (meeting.minutesAttachments || []).length).map(({ committee, meeting }) => {
    const page = `../${committee.key}/${meetingSlug(meeting)}/index.html`;
    const pdfs = (meeting.minutesAttachments || []).map(file => `<li>${sourceLink(file.href, file.name || 'Minutes PDF')} <span class="muted">from ${escapeHtml(file.itemTitle)}</span></li>`).join('');
    return `<article class="record-card" data-filter-item data-search="${escapeHtml(`${meeting.date} ${committee.name} ${meeting.name} ${meeting.minutes?.text || ''}`.toLowerCase())}"><div class="eyebrow">${escapeHtml(committee.name)} · ${escapeHtml(formatDate(meeting.date))}</div><h2>${link(page, meeting.name || 'Meeting')}</h2>${meeting.minutes?.available ? `<p>${link(page, 'Read published minutes')}</p>` : ''}${pdfs ? `<ul class="attachment-list">${pdfs}</ul>` : ''}</article>`;
  }).join('');
  const minutesBody = `<div class="breadcrumbs">${link('../index.html', 'Home')} / Minutes</div><section class="hero compact"><div class="eyebrow">Official records</div><h1>Meeting minutes</h1><p class="lede">Generated minutes and minutes PDFs published through BoardDocs.</p></section>${filterBox('Filter minutes by committee, date, or text')}<div class="record-list">${minutesEntries || '<p class="notice">No published minutes were found.</p>'}</div>`;
  writePage(config.outDir, 'minutes', layout({ title: `Minutes · ${config.site.title}`, description: 'Published BoardDocs meeting minutes', body: minutesBody, prefix: '../', active: 'minutes' }));

  const attachmentEntries = allMeetings.flatMap(({ committee, meeting }) => (meeting.items || []).flatMap(item => (item.attachments || []).map(file => ({ committee, meeting, item, file }))));
  const attachments = attachmentEntries.map(({ committee, meeting, item, file }) => `<article class="attachment-card" data-filter-item data-search="${escapeHtml(`${file.name} ${item.title} ${meeting.date} ${committee.name}`.toLowerCase())}"><div class="eyebrow">${escapeHtml(committee.name)} · ${escapeHtml(formatDate(meeting.date))}</div><h2>${sourceLink(file.href, file.name || 'Attachment')}</h2><p>${escapeHtml(item.order)} ${escapeHtml(item.title)}</p><p>${link(`../${committee.key}/${meetingSlug(meeting)}/index.html`, 'View meeting')}</p></article>`).join('');
  const attachmentBody = `<div class="breadcrumbs">${link('../index.html', 'Home')} / Attachments</div><section class="hero compact"><div class="eyebrow">Agenda files</div><h1>All attachments</h1><p class="lede">Every file BoardDocs lists on a public agenda item.</p></section>${filterBox('Filter attachments by filename, agenda item, committee, or date')}<div class="record-list">${attachments || '<p class="notice">No attachments were found.</p>'}</div>`;
  writePage(config.outDir, 'attachments', layout({ title: `Attachments · ${config.site.title}`, description: 'BoardDocs agenda attachments', body: attachmentBody, prefix: '../', active: 'attachments' }));

  console.log(`Built ${allMeetings.length} meetings and ${attachmentEntries.length} attachments in ${relative(ROOT, config.outDir)}/`);
}

const CSS = `:root{--ink:#16212b;--muted:#5b6873;--line:#d9e0e5;--paper:#fff;--wash:#f3f6f8;--navy:#173b57;--blue:#176b87;--gold:#d8a928}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--paper);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{width:min(1120px,calc(100% - 2rem));margin:auto}.skip-link{position:absolute;left:-9999px}.skip-link:focus{left:1rem;top:1rem;background:#fff;padding:.75rem;z-index:10}.site-header{background:var(--navy);color:#fff}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:2rem;padding:1rem 0}.brand{font-weight:750;color:#fff;text-decoration:none}.site-header nav{display:flex;gap:.25rem;flex-wrap:wrap}.site-header nav a{color:#dce9ef;text-decoration:none;padding:.5rem .65rem;border-radius:.35rem}.site-header nav a:hover,.site-header nav a.active{background:#fff;color:var(--navy)}main{padding-bottom:5rem}.hero{padding:5.5rem 0 3.5rem;max-width:850px}.hero.compact{padding:3rem 0 2rem}.hero h1{font-family:Georgia,serif;font-size:clamp(2.4rem,6vw,5rem);line-height:1.02;margin:.25rem 0 1rem;color:var(--navy)}.hero.compact h1{font-size:clamp(2rem,5vw,3.75rem)}.lede{font-size:1.25rem;color:var(--muted);max-width:720px}.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:.76rem;font-weight:800;color:var(--blue)}h2,h3,h4{line-height:1.2}a{color:#075f7d}a:hover{text-decoration-thickness:2px}.committee-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-bottom:4rem}.committee-panel{background:var(--wash);border-top:4px solid var(--gold);padding:1.5rem}.committee-panel h2{font-family:Georgia,serif;font-size:1.75rem}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--line);margin:3rem 0 1rem}.section-heading h2{font:2rem Georgia,serif;margin:.25rem 0 .75rem}.meeting-list,.record-list{display:grid;gap:.75rem}.meeting-card,.record-card,.attachment-card{border:1px solid var(--line);padding:1.15rem 1.25rem;border-radius:.35rem;background:#fff}.meeting-card h3,.record-card h2,.attachment-card h2{margin:.25rem 0;font-size:1.15rem}.meta{display:flex;gap:1rem;flex-wrap:wrap;color:var(--muted);font-size:.9rem}.breadcrumbs{padding-top:1.5rem;color:var(--muted)}.breadcrumbs a{color:inherit}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:3rem}.stats div{background:var(--paper);padding:1.25rem}.stats strong,.stats span{display:block}.stats strong{font:2rem Georgia,serif;color:var(--navy)}.stats span{color:var(--muted)}section+section{margin-top:3.5rem}.agenda-item{border-top:1px solid var(--line);padding:1.5rem 0}.agenda-item h3{font:1.45rem Georgia,serif;margin:.3rem 0}.agenda-item h4{margin-bottom:.25rem}.item-body{white-space:pre-line;max-width:850px}.attachment-list{padding-left:1.2rem}.attachment-list li{margin:.45rem 0}.file-size,.muted{color:var(--muted);font-size:.9rem}.source-link{font-weight:650}.minutes-text{white-space:pre-wrap;background:var(--wash);border-left:4px solid var(--blue);padding:1.5rem;max-height:42rem;overflow:auto}.notice{background:#fff8df;border-left:4px solid var(--gold);padding:1rem}.filter-box{background:var(--wash);padding:1rem;margin:1rem 0}.filter-box label{display:block;font-weight:700;margin-bottom:.35rem}.filter-box input{width:min(100%,600px);font:inherit;padding:.7rem;border:1px solid #9cabb6;border-radius:.25rem}.filter-status{display:inline;margin-left:.75rem;color:var(--muted)}footer{background:var(--wash);border-top:1px solid var(--line);padding:2rem 0;color:var(--muted);font-size:.9rem}@media(max-width:760px){.header-inner{align-items:flex-start;flex-direction:column;gap:.5rem}.site-header nav{display:grid;grid-template-columns:1fr 1fr;width:100%}.committee-grid{grid-template-columns:1fr}.stats{grid-template-columns:1fr}.hero{padding-top:3rem}.section-heading{align-items:start;flex-direction:column}.section-heading>.source-link{margin-bottom:1rem}}`;

const JS = `document.querySelectorAll('[data-filter-input]').forEach(input=>{const items=[...document.querySelectorAll('[data-filter-item]')];const status=document.querySelector('[data-filter-status]');const update=()=>{const query=input.value.trim().toLowerCase();let shown=0;for(const item of items){const visible=!query||item.dataset.search.includes(query);item.hidden=!visible;if(visible)shown++}if(status)status.textContent=query?shown+' result'+(shown===1?'':'s'):''};input.addEventListener('input',update)});`;

try {
  build();
} catch (error) {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
}
