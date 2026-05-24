#!/usr/bin/env node
/**
 * Generate docs/policies/index.html (interactive board policies manual)
 * and publish docs/policies-index.json and docs/board-policies/*.json
 * for machine readability.
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

const DOCS_DIR = resolve(ROOT, 'docs');
const POLICIES_DOCS_DIR = resolve(DOCS_DIR, 'board-policies');
const INDEX_DOCS_PATH = resolve(DOCS_DIR, 'policies-index.json');
const HTML_OUTPUT_DIR = resolve(DOCS_DIR, 'policies');
const HTML_OUTPUT_PATH = resolve(HTML_OUTPUT_DIR, 'index.html');

function main() {
  console.log('Publishing policies in machine-readable form...');
  
  if (!existsSync(INDEX_DATA_PATH)) {
    console.error(`Error: ${INDEX_DATA_PATH} does not exist. Please run scrape:policies first.`);
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

  // 3. Build interactive HTML page docs/policies/index.html
  mkdirSync(HTML_OUTPUT_DIR, { recursive: true });
  const indexData = JSON.parse(indexJsonStr);

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

    /* ---- SEARCH AND CONTROLS ---- */
    .controls-container {
      max-width: 960px;
      margin: -1.5rem auto 2rem;
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
  const clientScript = `
    document.addEventListener('DOMContentLoaded', () => {
      const searchInput = document.getElementById('search-input');
      const filterBtns = document.querySelectorAll('.filter-btn');
      const policyRows = document.querySelectorAll('.policy-row');
      const secCards = document.querySelectorAll('.sec-card');
      const noResults = document.getElementById('no-results');
      
      let currentSearch = '';
      let currentFilter = 'all';

      // 1. Search filter logic
      function updateVisibility() {
        let totalVisible = 0;

        secCards.forEach(card => {
          const rowsInCard = card.querySelectorAll('.policy-row');
          let visibleInCard = 0;

          rowsInCard.forEach(row => {
            const code = row.getAttribute('data-code') || '';
            const title = (row.getAttribute('data-title') || '').toLowerCase();
            const type = row.getAttribute('data-type') || '';
            
            const matchesSearch = code.includes(currentSearch) || title.includes(currentSearch.toLowerCase());
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
                const scrapedDate = data._metadata?.scrapedAt ? new Date(data._metadata.scrapedAt).toLocaleDateString() : 'N/A';
                const officialUrl = data._metadata?.source || \`https://simbli.eboardsolutions.com/Policy/ViewPolicy.aspx?S=36030397&revid=\${data.revid}\`;
                let detailsHtml = \`
                  <div class="drawer-meta-bar">
                    <div>REVISION ID: \${data.revid} | REVISED: \${data.lastRevised || 'N/A'} | CHECKED: \${scrapedDate}</div>
                    <div class="drawer-actions">
                      <a href="\${officialUrl}" class="drawer-btn" target="_blank" style="margin-right: 1.5rem;">Official Version on Simbli ↗</a>
                      <a href="/board-policies/\${code}-\${type}.json" class="drawer-btn" target="_blank">View JSON ↗</a>
                    </div>
                  </div>
                  <div class="policy-body-text">\${escapeHtml(data.contentText)}</div>
                \`;

                // Add Footnotes/Citations if present
                if (data.footnotes && data.footnotes.length > 0) {
                  detailsHtml += \`<div class="policy-refs-section">
                    <div class="policy-refs-title">Legal & Management References</div>\`;
                  
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
                    <div class="policy-refs-title">Cross References</div>
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
                drawerInner.innerHTML = \`<div style="color:var(--coral); text-align:center; padding:1rem;">Failed to load policy text: \${err.message}</div>\`;
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
        <div class="policy-row" data-code="${p.code}" data-title="${p.title.replace(/"/g, '&quot;')}" data-type="${p.type}" data-revid="${p.revid}">
          <div class="policy-row-header">
            <div class="policy-left">
              <span class="policy-code">${p.code}</span>
              <span class="policy-title">${p.title}</span>
              <span class="policy-badges">
                <span class="type-badge ${typeBadgeClass}">${p.type}</span>
              </span>
            </div>
            <div class="policy-right">
              <span class="policy-date">${p.lastRevised || 'Unmodified'}</span>
              <span class="expand-chevron">▼</span>
            </div>
          </div>
          <div class="policy-drawer" data-loaded="false">
            <div class="drawer-inner">
              <div class="drawer-loading">⚡ Loading policy text from machine-readable JSON...</div>
            </div>
          </div>
        </div>
      `;
    }

    sectionsHtml += `
      <div class="sec-card" data-sec-code="${sec.code}">
        <div class="sec-header">
          <span class="sec-code">${sec.code}</span>
          <h3 class="sec-title">${sec.name}</h3>
        </div>
        <div class="policy-list">
          ${pRowsHtml}
        </div>
      </div>
    `;
  }

  // Compile complete HTML document
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
${headMeta({
  title: 'RCSD Board Policies Manual — Redwood City School District',
  description: 'Interactive and machine-readable school board policies, bylaws, and administrative regulations of the Redwood City School District.',
  canonical: 'https://rcsd.info/policies/',
  ogLocale: 'en_US',
  ogImageKey: 'page-home',
  hreflang: [
    { lang: 'x-default', href: 'https://rcsd.info/policies/' },
    { lang: 'en', href: 'https://rcsd.info/policies/' },
  ],
  extraHead: `<link rel="describedby" href="/llms.txt" type="text/markdown">`,
  pageCSS,
})}
</head>
<body>

${siteNav({ activePage: 'district', lang: 'en' })}

<header class="policies-header">
  <div class="policies-header-inner">
    <h1>Board Policies Manual</h1>
    <p>Redwood City School District's active board policies, bylaws, and administrative regulations catalog. Click on any row to load and browse the policy details.</p>
  </div>
</header>

<div class="controls-container">
  <div class="search-panel">
    <div class="search-wrapper">
      <span class="search-icon">🔍</span>
      <input type="text" id="search-input" class="search-input" placeholder="Search by policy code (e.g. 0100) or title keyword...">
    </div>
    <div class="filter-buttons">
      <button class="filter-btn active" data-filter="all">All (${policies.length})</button>
      <button class="filter-btn" data-filter="BP">Policies (BP)</button>
      <button class="filter-btn" data-filter="AR">Regulations (AR)</button>
      <button class="filter-btn" data-filter="BB">Bylaws/Exhibits</button>
    </div>
  </div>
</div>

<main class="main-content">
  <div id="policies-catalog">
    ${sectionsHtml}
  </div>

  <div id="no-results" class="no-results">
    <h3>No matching policies found</h3>
    <p>Try searching for a different keyword or checking your filters. For example, search for "0100" or "Equity".</p>
  </div>
</main>

${siteFooter({ lang: 'en' })}

<script>
${clientScript}
</script>

</body>
</html>
`;

  writeFileSync(HTML_OUTPUT_PATH, htmlContent);
  console.log(`Successfully built interactive HTML policies index at ${HTML_OUTPUT_PATH}`);
}

main();
