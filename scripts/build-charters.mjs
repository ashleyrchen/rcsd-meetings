#!/usr/bin/env node
/**
 * Build per-charter pages for RCSD-authorized charter schools.
 *
 * Output:
 *   docs/schools/charters/{slug}/index.html (EN)
 *   docs/escuelas/charter/{slug}/index.html (ES)
 *
 * The /schools/ and /escuelas/ index pages list charters as a section; see
 * build-schools.mjs for the three-section index (district schools, charters,
 * district properties).
 *
 * Data sources:
 *   data/charters.json      — entity metadata (CDE-sourced)
 *   data/document-index.json — classified board-packet PDFs
 *
 * Charter financial docs are filtered from document-index.json by matching
 * each charter's `titlePatterns` against document titles. Report/review-letter
 * pairs are joined by (meetingDate, itemLabel) since both are attachments on
 * the same board agenda item.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { headMeta, siteNav, siteFooter } from './html-parts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const chartersData = JSON.parse(readFileSync(resolve(ROOT, 'data/charters.json'), 'utf8'));
const docIndex = JSON.parse(readFileSync(resolve(ROOT, 'data/document-index.json'), 'utf8'));

// ---- Document classification / grouping ----

// Fiscal-order for document rows within a year. Lower = earlier in the cycle.
const SUBTYPE_ORDER = [
  'adopted-budget',
  'first-interim',
  'second-interim',
  'unaudited-actuals',
  'annual-audit', // synthetic — not yet emitted by the classifier for charters
];

const SUBTYPE_LABELS = {
  en: {
    'adopted-budget': 'Adopted Budget',
    'first-interim': '1st Interim',
    'second-interim': '2nd Interim',
    'unaudited-actuals': 'Unaudited Actuals',
    'annual-audit': 'Annual Audit',
    'presentation': 'Presentation',
    'annual': 'LCAP',
    'resolution': 'Resolution',
  },
  es: {
    'adopted-budget': 'Presupuesto adoptado',
    'first-interim': '1er Informe Interino',
    'second-interim': '2do Informe Interino',
    'unaudited-actuals': 'Resultados reales no auditados',
    'annual-audit': 'Auditoría anual',
    'presentation': 'Presentación',
    'annual': 'LCAP',
    'resolution': 'Resolución',
  },
};

function matchesCharter(doc, charter) {
  const title = (doc.title || '').toLowerCase();
  return charter.titlePatterns.some(p => new RegExp(p, 'i').test(title));
}

/**
 * Heuristic: decide whether this doc is the "review letter" or the primary report.
 * Review letters always contain "Review Letter" in the title. The paired primary
 * report has the same meetingDate + itemLabel without that phrase.
 */
function isReviewLetter(doc) {
  return /review\s+letter/i.test(doc.title || '');
}

/**
 * Group documents for a charter into a year → subtype → { primary, review, all[] } map.
 */
function groupCharterDocs(charter) {
  const all = docIndex.documents.filter(d => matchesCharter(d, charter));
  const byYear = {};

  // Only surface budget + lcap doc types in the financial timeline.
  const financialTypes = new Set(['budget', 'lcap']);

  for (const d of all) {
    if (!financialTypes.has(d.type)) continue;
    const year = d.schoolYear || 'Unknown';
    if (!byYear[year]) byYear[year] = {};
    const key = d.type === 'lcap' ? 'lcap/annual' : `budget/${d.subtype}`;
    if (!byYear[year][key]) byYear[year][key] = { primary: null, review: null, all: [] };
    byYear[year][key].all.push(d);
    if (isReviewLetter(d)) byYear[year][key].review = d;
    else byYear[year][key].primary = d;
  }
  return byYear;
}

// ---- Rendering helpers ----

function fmtMeetingDate(dateStr, lang) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sortYearsDesc(years) {
  // schoolYear is "YYYY-YY"; sort by first 4 chars descending
  return years.slice().sort((a, b) => (b.slice(0, 4)).localeCompare(a.slice(0, 4)));
}

function renderDocsTimeline(group, lang) {
  const L = SUBTYPE_LABELS[lang];
  const isEs = lang === 'es';
  const years = sortYearsDesc(Object.keys(group));
  if (!years.length) {
    return `<p class="empty">${isEs ? 'No hay documentos indexados todavía.' : 'No documents indexed yet.'}</p>`;
  }

  return years.map(year => {
    const rowsMap = group[year];
    const keys = Object.keys(rowsMap).sort((a, b) => {
      const as = a.split('/')[1];
      const bs = b.split('/')[1];
      const ai = SUBTYPE_ORDER.indexOf(as);
      const bi = SUBTYPE_ORDER.indexOf(bs);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const rows = keys.map(k => {
      const { primary, review, all } = rowsMap[k];
      const subtype = k.split('/')[1];
      const label = L[subtype] || subtype;
      const anchor = primary || review || all[0];
      const meetingDate = anchor?.meetingDate;
      const meetingHref = meetingDate ? `${isEs ? '/reuniones' : '/meetings'}/${meetingDate}-regular/` : null;

      const links = [];
      if (primary) {
        links.push(`<a href="${escapeHtml(primary.url)}" target="_blank" rel="noopener">${isEs ? 'Informe' : 'Report'} <span class="ext">&#8599;</span></a>`);
      }
      if (review) {
        links.push(`<a href="${escapeHtml(review.url)}" target="_blank" rel="noopener">${isEs ? 'Carta de revisión de RCSD' : 'RCSD Review Letter'} <span class="ext">&#8599;</span></a>`);
      }
      // Fallback: any extra docs not classified as primary/review
      if (!primary && !review) {
        for (const d of all) {
          links.push(`<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.title)} <span class="ext">&#8599;</span></a>`);
        }
      }

      const meetingBadge = meetingHref
        ? `<a class="meeting-link" href="${meetingHref}">${isEs ? 'Reunión del' : 'Meeting'} ${fmtMeetingDate(meetingDate, lang)}</a>`
        : '';

      return `<tr>
              <td class="doc-label">${label}</td>
              <td class="doc-links">${links.join(' &middot; ')}</td>
              <td class="doc-meeting">${meetingBadge}</td>
            </tr>`;
    }).join('\n');

    return `<section class="year-group">
        <h3>${year}</h3>
        <table class="docs-table">
          <tbody>
${rows}
          </tbody>
        </table>
      </section>`;
  }).join('\n');
}

// ---- Page CSS (shared across charter pages) ----

const charterCSS = `
  main.charter-content { max-width: 960px; margin: 0 auto; padding: 0 2rem 6rem; }
  @media (max-width: 640px) { main.charter-content { padding: 0 1.2rem 4rem; } }
  .charter-header { padding: 3rem 0 2rem; border-bottom: 1px solid var(--rule-light); margin-bottom: 2rem; }
  .charter-header .eyebrow {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; font-weight: 500;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--green-mid);
    margin-bottom: 0.6rem;
  }
  .charter-header h1 {
    font-family: 'Fraunces', Georgia, serif; font-size: clamp(1.8rem, 4vw, 2.5rem);
    font-weight: 400; color: var(--green-deep); margin-bottom: 0.4rem; line-height: 1.15;
  }
  .charter-header .tagline { color: var(--text-secondary); font-size: 1.05rem; margin-bottom: 1.4rem; }
  .charter-meta-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.2rem 2rem; margin-top: 1rem;
  }
  .charter-meta-grid dt {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.66rem; font-weight: 500;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted);
    margin-bottom: 0.15rem;
  }
  .charter-meta-grid dd {
    font-size: 0.92rem; color: var(--text); line-height: 1.5;
  }
  .charter-meta-grid dd a { word-break: break-word; }
  section.docs-section { margin-top: 2rem; }
  section.docs-section > h2 {
    font-family: 'Fraunces', Georgia, serif; font-weight: 400; color: var(--green-deep);
    font-size: 1.5rem; margin-bottom: 0.4rem;
  }
  section.docs-section > p.intro {
    color: var(--text-secondary); font-size: 0.94rem; margin-bottom: 1.5rem; max-width: 640px;
  }
  .year-group { margin-bottom: 2rem; }
  .year-group h3 {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; font-weight: 500;
    letter-spacing: 0.06em; color: var(--green-mid);
    padding-bottom: 0.3rem; margin-bottom: 0.6rem;
    border-bottom: 2px solid var(--green-deep);
  }
  .docs-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  .docs-table td {
    padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--rule-light);
    vertical-align: top;
  }
  .docs-table tr:last-child td { border-bottom: none; }
  .docs-table td.doc-label {
    font-weight: 500; white-space: nowrap; color: var(--green-deep);
    width: 30%;
  }
  .docs-table td.doc-links { line-height: 1.8; }
  .docs-table td.doc-links a { white-space: nowrap; }
  .docs-table td.doc-links .ext {
    font-size: 0.75em; color: var(--text-muted); vertical-align: super;
  }
  .docs-table td.doc-meeting {
    text-align: right; white-space: nowrap; font-size: 0.85rem;
  }
  .docs-table td.doc-meeting a.meeting-link {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.76rem;
    color: var(--text-secondary); text-decoration: none;
  }
  .docs-table td.doc-meeting a.meeting-link:hover { color: var(--green-mid); text-decoration: underline; }
  @media (max-width: 640px) {
    .docs-table, .docs-table tbody, .docs-table tr, .docs-table td { display: block; width: 100%; }
    .docs-table tr { padding: 0.6rem 0; border-bottom: 1px solid var(--rule-light); }
    .docs-table td { border: none; padding: 0.15rem 0; }
    .docs-table td.doc-meeting { text-align: left; }
  }
  p.empty { color: var(--text-muted); font-style: italic; padding: 1rem 0; }
  aside.caveat {
    background: var(--cream-dark); border-left: 3px solid var(--amber);
    padding: 0.8rem 1rem; margin: 1.4rem 0; font-size: 0.88rem; color: var(--text-secondary);
  }
`;

// ---- Per-charter page ----

function buildCharterPage(charter, lang) {
  const isEs = lang === 'es';
  const enPath = `/schools/charters/${charter.slug}/`;
  const esPath = `/escuelas/charter/${charter.slug}/`;
  const canonical = `https://rcsd.info${isEs ? esPath : enPath}`;
  const altHref = isEs ? enPath : esPath;
  const displayName = isEs ? (charter.nameEs || charter.name) : charter.name;

  const L = isEs ? {
    eyebrow: 'Escuela autónoma autorizada por RCSD',
    tagline: (net) => net
      ? `Escuela chárter autorizada por el Distrito Escolar de Redwood City. Parte de la red ${net}.`
      : 'Escuela chárter autorizada por el Distrito Escolar de Redwood City. Operación independiente.',
    metaAddress: 'Dirección',
    metaPhone: 'Teléfono',
    metaGrades: 'Grados',
    metaEnrollment: 'Inscripción',
    metaEnrollmentNote: (y) => `Año ${y} (CDE)`,
    metaWebsite: 'Sitio web',
    metaCds: 'Código CDS',
    metaCharterNum: 'Número de Charter',
    metaAuthorizer: 'Autorizador',
    metaOpened: 'Inauguración',
    metaNetwork: 'Red',
    docsH2: 'Documentos financieros',
    docsIntro: 'Presupuestos, informes interinos, resultados reales no auditados y cartas anuales de revisión fiscal de RCSD, obtenidas de los paquetes de la mesa directiva de RCSD.',
    caveatAudit: 'Los informes de auditoría anuales de charter y sus cartas de revisión se presentan a la mesa directiva pero actualmente no están indexados automáticamente; consulte la reunión correspondiente para acceder al informe.',
  } : {
    eyebrow: 'RCSD-authorized charter school',
    tagline: (net) => net
      ? `Charter school authorized by the Redwood City School District. Part of the ${net} network.`
      : 'Charter school authorized by the Redwood City School District. Independently operated.',
    metaAddress: 'Address',
    metaPhone: 'Phone',
    metaGrades: 'Grades',
    metaEnrollment: 'Enrollment',
    metaEnrollmentNote: (y) => `${y} year (CDE)`,
    metaWebsite: 'Website',
    metaCds: 'CDS Code',
    metaCharterNum: 'Charter #',
    metaAuthorizer: 'Authorizer',
    metaOpened: 'Opened',
    metaNetwork: 'Network',
    docsH2: 'Financial documents',
    docsIntro: 'Adopted budgets, interim reports, unaudited actuals, and RCSD\u2019s annual fiscal oversight review letters, pulled from RCSD board packets.',
    caveatAudit: 'Annual independent audit reports and review letters are presented to the Board but are not yet automatically indexed here; see the corresponding meeting for the report.',
  };

  const group = groupCharterDocs(charter);
  const timeline = renderDocsTimeline(group, lang);

  const addrMap = encodeURIComponent(charter.address);
  const metaGridRows = [
    charter.address && `<div><dt>${L.metaAddress}</dt><dd><a href="https://www.google.com/maps/search/?api=1&query=${addrMap}" target="_blank" rel="noopener">${escapeHtml(charter.address)}</a>${charter.addressNote ? `<br><span style="font-size:0.78rem; color:var(--text-muted); line-height:1.4">${escapeHtml(charter.addressNote)}</span>` : ''}</dd></div>`,
    charter.phone && `<div><dt>${L.metaPhone}</dt><dd><a href="tel:${charter.phone.replace(/[^0-9+]/g, '')}">${escapeHtml(charter.phone)}</a></dd></div>`,
    charter.grades && `<div><dt>${L.metaGrades}</dt><dd>${escapeHtml(charter.grades)}</dd></div>`,
    charter.enrollment && `<div><dt>${L.metaEnrollment}</dt><dd>${charter.enrollment.toLocaleString(isEs ? 'es-US' : 'en-US')}<br><span style="font-size:0.78rem; color:var(--text-muted)">${L.metaEnrollmentNote(charter.enrollmentYear)}</span></dd></div>`,
    charter.website && `<div><dt>${L.metaWebsite}</dt><dd><a href="${escapeHtml(charter.website)}" target="_blank" rel="noopener">${escapeHtml(charter.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))} <span style="font-size:0.8em">&#8599;</span></a></dd></div>`,
    charter.network && `<div><dt>${L.metaNetwork}</dt><dd>${charter.networkUrl ? `<a href="${escapeHtml(charter.networkUrl)}" target="_blank" rel="noopener">${escapeHtml(charter.network)} <span style="font-size:0.8em">&#8599;</span></a>` : escapeHtml(charter.network)}</dd></div>`,
    charter.authorizer && `<div><dt>${L.metaAuthorizer}</dt><dd>${escapeHtml(charter.authorizer)}</dd></div>`,
    charter.charterNumber && `<div><dt>${L.metaCharterNum}</dt><dd>${escapeHtml(charter.charterNumber)}</dd></div>`,
    charter.cdsCode && `<div><dt>${L.metaCds}</dt><dd><a href="${escapeHtml(charter.cdeDirectoryUrl || '#')}" target="_blank" rel="noopener">${escapeHtml(charter.cdsCode)} <span style="font-size:0.8em">&#8599;</span></a></dd></div>`,
    charter.dateOpened && `<div><dt>${L.metaOpened}</dt><dd>${escapeHtml(charter.dateOpened)}</dd></div>`,
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
${headMeta({
  title: `${displayName} — RCSD Open Data`,
  description: `${displayName}: ${charter.grades || ''}, ${charter.enrollment || ''} students (${charter.enrollmentYear}). Charter school authorized by Redwood City School District.`,
  canonical,
  ogLocale: isEs ? 'es_US' : 'en_US',
  hreflang: [
    { lang: 'en', href: `https://rcsd.info${enPath}` },
    { lang: 'es', href: `https://rcsd.info${esPath}` },
  ],
  pageCSS: charterCSS,
})}
</head>
<body>

${siteNav({ activePage: 'schools', lang, altLangHref: altHref })}

<main class="charter-content">

  <header class="charter-header">
    <div class="eyebrow">${L.eyebrow}</div>
    <h1>${escapeHtml(displayName)}</h1>
    <p class="tagline">${L.tagline(charter.network)}</p>
    <dl class="charter-meta-grid">
${metaGridRows}
    </dl>
  </header>

  <section class="docs-section">
    <h2>${L.docsH2}</h2>
    <p class="intro">${L.docsIntro}</p>
    ${timeline}
    <aside class="caveat">${L.caveatAudit}</aside>
  </section>

</main>

${siteFooter({ lang })}

</body>
</html>`;
}

// ---- Charter summaries (consumed by build-schools.mjs for the /schools/ index) ----

/**
 * Exported helper so build-schools.mjs can render the Charter section of the
 * three-section /schools/ index without duplicating data-loading logic.
 */
export function charterSummaries() {
  return chartersData.charters.map(c => ({
    slug: c.slug,
    name: c.name,
    nameShort: c.nameShort || c.name,
    nameEs: c.nameEs || c.name,
    grades: c.grades,
    enrollment: c.enrollment,
    enrollmentYear: c.enrollmentYear,
    network: c.network,
    dateOpened: c.dateOpened,
    enPath: `/schools/charters/${c.slug}/`,
    esPath: `/escuelas/charter/${c.slug}/`,
  }));
}

// ---- Main ----

// Only run the build loop when invoked as a script (so build-schools.mjs can
// import charterSummaries without side effects).
const isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMainModule) {
  let count = 0;
  for (const charter of chartersData.charters) {
    const enDir = resolve(ROOT, 'docs', 'schools', 'charters', charter.slug);
    mkdirSync(enDir, { recursive: true });
    writeFileSync(resolve(enDir, 'index.html'), buildCharterPage(charter, 'en'));
    console.log(`Wrote docs/schools/charters/${charter.slug}/index.html`);

    const esDir = resolve(ROOT, 'docs', 'escuelas', 'charter', charter.slug);
    mkdirSync(esDir, { recursive: true });
    writeFileSync(resolve(esDir, 'index.html'), buildCharterPage(charter, 'es'));
    console.log(`Wrote docs/escuelas/charter/${charter.slug}/index.html`);

    count++;
  }
  console.log(`\nGenerated ${count} charter pages (${count * 2} HTML files total). /schools/ index is built by build-schools.mjs.`);
}
