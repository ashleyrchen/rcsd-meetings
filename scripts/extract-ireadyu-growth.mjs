#!/usr/bin/env node
/**
 * Extract i-Ready Expected Growth numbers from each school's 25-26 Board of
 * Trustees data presentation PDF.
 *
 * Each presentation has the same LCAP Goal #3 tables:
 *   - "i-Ready Reading  Expected Growth" row
 *   - "i-Ready Math     Expected Growth" row
 * with columns: Base 23-24 | Y1 24-25 Expected | Y1 24-25 Actual |
 *               Y2 25-26 Expected | Y2 25-26 Mid-Year (if available).
 *
 * Per-school output: data/ireadyu-growth/<slug>.json with full provenance
 * (source PDF URL, page number, first-line context) so every number links
 * back to the exact slide it came from.
 *
 * Usage:
 *   node scripts/extract-ireadyu-growth.mjs           # extract all schools
 *   node scripts/extract-ireadyu-growth.mjs --slug orion   # one school
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CACHE_DIR = resolve(ROOT, 'artifacts/board-packets-cache');
const OUT_DIR = resolve(ROOT, 'data/ireadyu-growth');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

// Schools with 25-26 board presentations available as of 2026-04-22.
const SOURCES = [
  { slug: 'adelante-selby', date: '2026-04-22', url: 'https://data.rcsd.info/board-packets/2026-04-22/Adelante-Selby-25-26-Data-for-Board-presentation.pdf' },
  { slug: 'clifford',       date: '2026-04-01', url: 'https://data.rcsd.info/board-packets/2026-04-01/Clifford-25-26-Data-for-Board-presentation.pdf' },
  { slug: 'garfield',       date: '2026-03-25', url: 'https://data.rcsd.info/board-packets/2026-03-25/Garfield-25-26-Data-for-Board-presentation-DRAFT.pdf' },
  { slug: 'hoover',         date: '2026-03-11', url: 'https://data.rcsd.info/board-packets/2026-03-11/Hoover-25-26-Data-for-Board-presentation.pdf' },
  { slug: 'kennedy',        date: '2026-04-22', url: 'https://data.rcsd.info/board-packets/2026-04-22/Kennedy-25-26-Data-for-Board-presentation.pdf' },
  { slug: 'mckinley-mit',   date: '2026-03-11', url: 'https://data.rcsd.info/board-packets/2026-03-11/MIT-25-26-Data-for-Board-presentation.pdf' },
  { slug: 'orion',          date: '2026-04-22', url: 'https://data.rcsd.info/board-packets/2026-04-22/Orion-25-26-Data-for-Board-presentation.pdf' },
  { slug: 'roosevelt',      date: '2026-03-11', url: 'https://data.rcsd.info/board-packets/2026-03-11/Roosevelt-25-26-Board-presentation.pdf' },
  { slug: 'roy-cloud',      date: '2026-04-01', url: 'https://data.rcsd.info/board-packets/2026-04-01/Roy-cloud-25-26-Data-for-Board-presentation-1.pdf' },
  { slug: 'taft',           date: '2026-03-25', url: 'https://data.rcsd.info/board-packets/2026-03-25/Taft-25-26-Board-Presentation.pdf' },
];

// Schools that have not yet presented 25-26 data to the Board.
// Their 24-25 presentations pre-date the current LCAP Goal #3 format and do
// not contain the "% meeting i-Ready Expected Growth" metric in extractable
// form — the 24-25 decks showed Fall Diagnostic proficiency (% at/above
// grade level), which is a different metric and would be misleading to
// display on the same card. When these schools present 25-26 data, move
// them to SOURCES and re-run the extractor.
const PENDING_SOURCES = [
  {
    slug: 'henry-ford',
    lastPresentationDate: '2025-03-12',
    lastPresentationUrl: 'https://go.boarddocs.com/ca/redwood/Board.nsf/files/DEGT9C7640F7/$file/Henry%20Ford%2024-25%20Data%20for%20Board%20presentation%20-%20(1).pdf',
  },
  {
    slug: 'north-star',
    lastPresentationDate: '2024-11-20',
    lastPresentationUrl: 'https://go.boarddocs.com/ca/redwood/Board.nsf/files/DB6Q9Y684907/$file/North%20Star%2024-25%20Data%20for%20Board%20presentation.pdf',
  },
];

function ensureCached(url) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const fname = url.split('/').pop();
  const savePath = resolve(CACHE_DIR, fname);
  if (!existsSync(savePath)) {
    console.log(`  downloading ${fname}`);
    execFileSync('curl', ['-sL', '-A', UA, '-H', `Referer: ${url}`, '-o', savePath, url], { stdio: 'inherit' });
  }
  return savePath;
}

// Runs pdftotext with `-layout` and splits into pages by form-feed (\x0c).
function pdfPages(pdfPath) {
  const out = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 32 * 1024 * 1024 }).toString();
  return out.split('\x0c');
}

// Finds the i-Ready Reading / Math growth row on a page.
// Pattern: a line near "i-Ready Reading" / "i-Ready Math" that contains
// "All students" followed by 4 or 5 percentage values (%).
function extractGrowthRow(pageText, subject) {
  const lines = pageText.split('\n');
  // Must mention the subject header somewhere on this page.
  const header = new RegExp(`i-?Ready\\s+${subject}\\b`, 'i');
  if (!lines.some(l => header.test(l))) return null;

  for (const line of lines) {
    if (!/All\s+students/i.test(line)) continue;
    const pcts = [...line.matchAll(/(\d+\.\d+)\s*%/g)].map(m => parseFloat(m[1]));
    if (pcts.length >= 4) {
      return {
        base_23_24: pcts[0] ?? null,
        y1_24_25_expected: pcts[1] ?? null,
        y1_24_25_actual: pcts[2] ?? null,
        y2_25_26_expected: pcts[3] ?? null,
        y2_25_26_midyear: pcts[4] ?? null,
        rawLine: line.trim(),
      };
    }
  }
  return null;
}

function extractForPdf(pdfPath) {
  const pages = pdfPages(pdfPath);
  let reading = null;
  let math = null;
  let readingPage = null;
  let mathPage = null;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!reading) {
      const r = extractGrowthRow(page, 'Reading');
      if (r) { reading = r; readingPage = i + 1; }
    }
    if (!math) {
      const m = extractGrowthRow(page, 'Math');
      if (m) { math = m; mathPage = i + 1; }
    }
    if (reading && math) break;
  }

  return { reading, readingPage, math, mathPage };
}

function main() {
  const args = process.argv.slice(2);
  const slugFilter = args.find((_, i) => args[i - 1] === '--slug');

  mkdirSync(OUT_DIR, { recursive: true });

  const sources = slugFilter ? SOURCES.filter(s => s.slug === slugFilter) : SOURCES;
  if (sources.length === 0) {
    console.error(`No sources matched --slug ${slugFilter}`);
    process.exit(1);
  }

  const summary = [];
  for (const src of sources) {
    console.log(`\n${src.slug}`);
    const pdfPath = ensureCached(src.url);
    const { reading, readingPage, math, mathPage } = extractForPdf(pdfPath);

    const metric = '% of students meeting i-Ready Expected Growth';
    const target = '4 percentage point increase each year';

    const record = {
      slug: src.slug,
      source: {
        presentationDate: src.date,
        pdfUrl: src.url,
        extractor: 'scripts/extract-ireadyu-growth.mjs',
        extractedAt: new Date().toISOString().slice(0, 10),
      },
      reading: reading ? {
        metric,
        target,
        studentGroup: 'All students',
        ...reading,
        source: { pdfPage: readingPage },
      } : { error: 'i-Ready Reading Expected Growth row not found' },
      math: math ? {
        metric,
        target,
        studentGroup: 'All students',
        ...math,
        source: { pdfPage: mathPage },
      } : { error: 'i-Ready Math Expected Growth row not found' },
    };

    const outPath = resolve(OUT_DIR, `${src.slug}.json`);
    writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n');

    const fmt = r => r && !r.error
      ? `${r.base_23_24}% → ${r.y1_24_25_actual}% → ${r.y2_25_26_midyear ?? '—'}% (mid-year)`
      : 'NOT FOUND';
    console.log(`  reading (p${readingPage ?? '?'}): ${fmt(reading)}`);
    console.log(`  math    (p${mathPage ?? '?'}): ${fmt(math)}`);

    summary.push({
      slug: src.slug,
      readingOk: !!reading,
      mathOk: !!math,
      reading, math, readingPage, mathPage,
    });
  }

  // Emit pending-status JSON for schools without a 25-26 presentation yet.
  if (!slugFilter) {
    for (const p of PENDING_SOURCES) {
      const record = {
        slug: p.slug,
        status: 'pending_25_26_presentation',
        note: 'This school has not yet presented 2025-26 data to the Board of Trustees. Growth figures will be published here once the presentation occurs. Their most recent (2024-25) deck pre-dates the current LCAP Goal #3 "% meeting i-Ready Expected Growth" table format, so we are not backfilling from it to avoid metric confusion.',
        lastPresentation: {
          date: p.lastPresentationDate,
          pdfUrl: p.lastPresentationUrl,
        },
        reading: null,
        math: null,
      };
      const outPath = resolve(OUT_DIR, `${p.slug}.json`);
      writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n');
      console.log(`\n${p.slug}\n  [pending 25-26 presentation — last presented ${p.lastPresentationDate}]`);
    }
  }

  writeFileSync(resolve(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2) + '\n');

  const fails = summary.filter(s => !s.readingOk || !s.mathOk);
  if (fails.length) {
    console.log(`\nFAILED extractions (${fails.length}): ${fails.map(f => f.slug).join(', ')}`);
    process.exitCode = 2;
  } else {
    console.log(`\nAll ${summary.length} schools extracted successfully.`);
  }
}

main();
