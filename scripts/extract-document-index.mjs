#!/usr/bin/env node
/**
 * Extract a unified document index from meetings-data.json.
 *
 * Scans all meeting agenda items and their attachments to identify and classify
 * key district documents: Budgets, LCAPs, SPSAs, SARCs, School Reports/Presentations,
 * and Resolutions.
 *
 * For each document, records:
 *   - type, subtype, title, meeting date, agenda item label/title
 *   - school slug (for school-specific docs)
 *   - school year
 *   - attachment metadata (aid, href, filename)
 *   - R2 URL if available
 *
 * Output: data/document-index.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const R2_BASE = 'https://data.rcsd.info';

// ---- School slug mapping ----

const SCHOOL_PATTERNS = [
  { slug: 'adelante-selby', patterns: ['adelante', 'selby'] },
  { slug: 'clifford', patterns: ['clifford'] },
  { slug: 'garfield', patterns: ['garfield'] },
  { slug: 'henry-ford', patterns: ['henry ford', 'henryford'] },
  { slug: 'hoover', patterns: ['hoover'] },
  { slug: 'kennedy', patterns: ['kennedy'] },
  { slug: 'mckinley-mit', patterns: ['mckinley', 'mit ', 'institute of tech', 'spsamit'] },
  { slug: 'north-star', patterns: ['north star', 'northstar', 'nsa forward', 'nsa '] },
  { slug: 'orion', patterns: ['orion'] },
  { slug: 'roosevelt', patterns: ['roosevelt'] },
  { slug: 'roy-cloud', patterns: ['roy cloud', 'roycloud'] },
  { slug: 'taft', patterns: ['taft'] },
  { slug: 'rocketship', patterns: ['rocketship'] },
];

// Return all matching school slugs from a text string
function matchSchools(text) {
  const t = text.toLowerCase();
  const matches = [];
  for (const s of SCHOOL_PATTERNS) {
    if (s.patterns.some(p => t.includes(p))) matches.push(s.slug);
  }
  return matches;
}

// Match schools across multiple text fields, deduplicated
function matchSchoolsMulti(...texts) {
  const all = new Set();
  for (const text of texts) {
    if (!text) continue;
    for (const slug of matchSchools(text)) all.add(slug);
  }
  return [...all];
}

// ---- School year inference ----
// School year runs Jul–Jun. A document from Oct 2025 is SY 2025-26.
function inferSchoolYear(date) {
  const [y, m] = date.split('-').map(Number);
  if (m >= 7) return `${y}-${String(y + 1).slice(2)}`;
  return `${y - 1}-${String(y).slice(2)}`;
}

// More specific: extract school year from title if mentioned
function extractSchoolYear(text) {
  // "2025-2026", "2025-26", "25-26"
  const m4 = text.match(/20(\d{2})[–-]20(\d{2})/);
  if (m4) return `20${m4[1]}-${m4[2]}`;
  const m2 = text.match(/20(\d{2})[–-](\d{2})/);
  if (m2) return `20${m2[1]}-${m2[2]}`;
  const m2s = text.match(/\b(\d{2})[–-](\d{2})\b/);
  if (m2s && parseInt(m2s[1]) >= 19 && parseInt(m2s[1]) <= 30) return `20${m2s[1]}-${m2s[2]}`;
  return null;
}

// ---- Build AID → R2 path lookup ----

const aidToR2Path = {};
const memoDir = resolve(ROOT, 'data/board-memos');
try {
  for (const f of readdirSync(memoDir)) {
    if (!f.endsWith('.json')) continue;
    const memo = JSON.parse(readFileSync(resolve(memoDir, f), 'utf-8'));
    for (const item of memo.items) {
      for (const att of item.attachments) {
        if (att.aid && att.filename) {
          aidToR2Path[att.aid] = `board-packets/${memo.date}/${att.filename}`;
        }
      }
    }
  }
} catch {}

// ---- Classification ----

function classify(attTitle, itemTitle) {
  const a = (attTitle || '').toLowerCase();
  const it = (itemTitle || '').toLowerCase();
  const combined = a + ' ' + it;

  // Budget documents
  if (a.includes('adopted budget') || a.includes('budget adoption'))
    return { type: 'budget', subtype: 'adopted-budget' };
  if (a.includes('first interim') || a.includes('1st interim'))
    return { type: 'budget', subtype: 'first-interim' };
  if (a.includes('second interim') || a.includes('2nd interim'))
    return { type: 'budget', subtype: 'second-interim' };
  if (a.includes('unaudited actual'))
    return { type: 'budget', subtype: 'unaudited-actuals' };
  if (a.includes('gann limit') || a.includes('gann appropriation'))
    return { type: 'budget', subtype: 'gann-limit' };
  if ((a.includes('budget') && (a.includes('presentation') || a.includes('overview') || a.includes('report') || a.includes('summary'))) ||
      (it.includes('budget') && a.includes('presentation')))
    return { type: 'budget', subtype: 'presentation' };
  if (a.includes('budget') && (a.includes('reduction') || a.includes('scenario') || a.includes('strategic resource')))
    return { type: 'budget', subtype: 'budget-reduction' };
  if (a.includes('multi-year') || a.includes('myp') || a.includes('multi year projection'))
    return { type: 'budget', subtype: 'multi-year-projection' };
  if (a.includes('developer fee'))
    return { type: 'budget', subtype: 'developer-fee' };

  // LCAP
  if (a.includes('lcap') || a.includes('local control')) {
    if (a.includes('mid-year') || a.includes('midyear') || a.includes('mid_year'))
      return { type: 'lcap', subtype: 'mid-year' };
    if (a.includes('federal addendum'))
      return { type: 'lcap', subtype: 'federal-addendum' };
    if (a.includes('amendment'))
      return { type: 'lcap', subtype: 'amendment' };
    return { type: 'lcap', subtype: 'annual' };
  }

  // SPSA
  if (a.includes('spsa') || a.includes('school plan for student') ||
      (it.includes('school plan for student') && (a.includes('school plan') || a.includes('spsa')))) {
    return { type: 'spsa', subtype: 'plan' };
  }

  // SARC
  if (a.includes('sarc') || a.includes('school accountability report'))
    return { type: 'sarc', subtype: 'report' };

  // School presentations/reports — triggered by either:
  // 1. Agenda item title mentions "school presentation" and attachment is a PDF/presentation
  // 2. Attachment itself is named as a board presentation for a school
  if (it.includes('school presentation') || it.includes('school report presentation') ||
      (it.includes('school') && it.includes('presentation') && !it.includes('williams') &&
       !it.includes('quarterly') && !it.includes('search firm')))
    return { type: 'school-report', subtype: 'presentation' };
  if (a.includes('board presentation') || a.includes('data for board'))
    return { type: 'school-report', subtype: 'presentation' };

  // Resolutions
  if (a.includes('resolution'))
    return { type: 'resolution', subtype: 'resolution' };

  // Board policies
  if (it.includes('board policy') || it.includes('first reading') || it.includes('second reading'))
    if (a.includes('policy') || a.includes('regulation') || a.includes('bylaw'))
      return { type: 'policy', subtype: 'policy' };

  // Tax: parcel tax (Measure E/U — revenue measures for programs, NOT construction)
  // Must check before bond to avoid parcel tax surveys landing under bond
  if (combined.includes('parcel tax') || combined.includes('measure e') || combined.includes('measure u'))
    return { type: 'tax', subtype: 'parcel' };

  // Tax: bond (Measure S/T — construction/facilities bonds)
  if (a.includes('measure s') || a.includes('measure t') || a.includes('implementation plan'))
    if (combined.includes('bond') || combined.includes('measure') || combined.includes('facilities'))
      return { type: 'tax', subtype: 'bond' };

  // Special Education
  if (combined.includes('special education') || combined.includes('sped') ||
      a.includes('nps') || a.includes('npa') || a.includes('non-public') || a.includes('nonpublic') ||
      combined.includes('selpa') || combined.includes('individualized education') ||
      combined.includes('special ed study') || a.includes('iep'))
    return { type: 'sped', subtype: combined.includes('study') || combined.includes('report') ? 'report' : 'contract' };

  // English Learners: ELAC, DELAC, reclassification, EL data
  if (combined.includes('elac') || combined.includes('english learner advisory') ||
      combined.includes('delac') || combined.includes('district english learner'))
    return { type: 'english-learners', subtype: combined.includes('delac') || combined.includes('district') ? 'delac' : 'elac' };
  if (a.includes('reclassification') || a.includes('rfep') || a.includes('elpac') ||
      (a.includes('english learner') && !a.includes('policy') && !a.includes('regulation') &&
       !a.includes(' bp ') && !a.includes(' ar ')))
    return { type: 'english-learners', subtype: 'data' };

  // Pre-K / TK / Preschool / Early Education
  if (combined.includes('preschool') || combined.includes('pre-k') || combined.includes('prek') ||
      combined.includes('transitional kindergarten') || combined.includes(' tk ') ||
      combined.includes('early education') || combined.includes('early learning') ||
      combined.includes('head start') || combined.includes('state preschool') ||
      combined.includes('cspp') || combined.includes('child development'))
    return { type: 'early-ed', subtype: combined.includes('preschool') || combined.includes('cspp') || combined.includes('head start') ? 'preschool' : 'tk' };

  // Williams/UCP
  if (a.includes('williams') || a.includes('ucp') || a.includes('uniform complaint'))
    return { type: 'compliance', subtype: 'williams-ucp' };

  // Labor/union agreements (RCTA = certificated, CSEA = classified)
  if (a.includes('tentative agreement') || a.includes('collective bargaining') ||
      a.includes('rcta') || a.includes('csea') || a.includes('memorandum of understanding'))
    if (combined.includes('rcta') || combined.includes('teacher') || combined.includes('certificated'))
      return { type: 'labor', subtype: 'rcta' };
    else if (combined.includes('csea') || combined.includes('classified'))
      return { type: 'labor', subtype: 'csea' };
    else return { type: 'labor', subtype: 'other' };

  // Safety plans
  if (a.includes('comprehensive school safety') || a.includes('cssp') || a.includes('safety plan'))
    return { type: 'safety', subtype: 'safety-plan' };

  return null;
}

// ---- Main scan ----

const data = JSON.parse(readFileSync(resolve(ROOT, 'data/meetings-data.json'), 'utf-8'));
const documents = [];

for (const m of data.meetings) {
  for (const item of (m.items || [])) {
    for (const att of (item.attachments || [])) {
      const title = att.title || att.name || '';
      if (!title) continue;

      const cls = classify(title, item.title);
      if (!cls) continue;

      const schools = matchSchoolsMulti(title, item.title);
      const schoolYear = extractSchoolYear(title) || extractSchoolYear(item.title || '') || inferSchoolYear(m.date);

      // Build URL
      let url = att.href || null;
      if (!url && att.aid) {
        const r2Path = aidToR2Path[att.aid];
        if (r2Path) url = `${R2_BASE}/${r2Path}`;
        else url = `https://simbli.eboardsolutions.com/Meetings/Attachment.aspx?S=36030397&AID=${att.aid}&MID=${m.mid}`;
      }

      documents.push({
        type: cls.type,
        subtype: cls.subtype,
        title,
        meetingDate: m.date,
        meetingType: m.type,
        itemLabel: item.itemLabel || item.order || null,
        itemTitle: item.title,
        schools,
        schoolYear,
        aid: att.aid || null,
        url,
        filename: att.filename || null,
        size: att.size || null,
      });
    }
  }
}

// Sort by type, then date descending
documents.sort((a, b) => {
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return b.meetingDate.localeCompare(a.meetingDate);
});

// Stats
const byType = {};
for (const doc of documents) {
  const key = `${doc.type}/${doc.subtype}`;
  byType[key] = (byType[key] || 0) + 1;
}

const output = {
  generated: new Date().toISOString().split('T')[0],
  stats: {
    total: documents.length,
    byType,
  },
  documents,
};

const outPath = resolve(ROOT, 'data/document-index.json');
writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(`Indexed ${documents.length} documents:`);
for (const [key, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`);
}
console.log(`Wrote ${outPath}`);
