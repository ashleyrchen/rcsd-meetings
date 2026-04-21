#!/usr/bin/env node
/**
 * Convert SSC agenda/minutes .docx files to PDF via pandoc → HTML → Chromium.
 *
 * Source layout (input directory): preserves the Google Drive folder structure
 * with "Agenda", "Meeting Minutes" subfolders containing .docx (and occasionally .pdf).
 *
 * Output: writes normalized ISO-dated PDFs into
 *   artifacts/documents/ssc/{school}/{year}/{YYYY-MM-DD}-{agenda|minutes}.pdf
 *
 * If a PDF already exists in the source next to the .docx, we prefer it verbatim
 * (to preserve formatting exactly as the SSC published it).
 *
 * Usage:
 *   node scripts/convert-ssc-docs.mjs --school orion --year 2025-26 --input "/tmp/orion-ssc/SSC Orion 25-26SY"
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const k = args[i].replace(/^--/, '');
    out[k] = args[++i];
  }
  if (!out.school || !out.year || !out.input) {
    console.error('Usage: --school <slug> --year <YYYY-YY> --input <dir>');
    process.exit(1);
  }
  return out;
}

// Parse a meeting date out of a filename like "Draft SSC Agenda 10.22.25.docx"
// or "SSC Meeting Minutes 9.24.25.docx" or "SSC Meeting Minutes_1_28_26.docx".
// Returns ISO "YYYY-MM-DD" or null.
function parseMeetingDate(filename) {
  const basenameNoExt = filename.replace(/\.(docx|pdf)$/i, '');
  // Try M.D.YY or MM.DD.YY or MM.DD.YYYY
  let m = basenameNoExt.match(/(\d{1,2})[._](\d{1,2})[._](\d{2,4})/);
  if (!m) return null;
  let [, month, day, year] = m;
  month = month.padStart(2, '0');
  day = day.padStart(2, '0');
  if (year.length === 2) year = (Number(year) >= 90 ? '19' : '20') + year;
  return `${year}-${month}-${day}`;
}

function detectKind(filename) {
  const lower = filename.toLowerCase();
  // "minute meeting" (seen in Orion 2/25/26 source) is a misnamed copy of the
  // agenda, not actual minutes — skip rather than treat as either.
  if (lower.includes('minute meeting')) return null;
  if (lower.includes('agenda')) return 'agenda';
  if (lower.includes('minute')) return 'minutes';
  return null;
}

async function docxToPdf(docxPath, pdfPath, browser) {
  const tmpHtml = pdfPath.replace(/\.pdf$/, '.html');
  // pandoc docx → standalone HTML with embedded styles
  execFileSync('pandoc', [docxPath, '--standalone', '--embed-resources', '-o', tmpHtml], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const page = await browser.newPage();
  await page.goto('file://' + tmpHtml, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    margin: { top: '0.5in', bottom: '0.5in', left: '0.6in', right: '0.6in' },
    printBackground: true,
  });
  await page.close();
  rmSync(tmpHtml, { force: true });
}

async function main() {
  const { school, year, input } = parseArgs();
  const outDir = resolve(ROOT, 'artifacts/documents/ssc', school, year);
  mkdirSync(outDir, { recursive: true });

  // Collect candidate files across the input tree
  const candidates = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else candidates.push(full);
    }
  }
  walk(input);

  // Build a selection: prefer source-provided PDF over generated-from-docx.
  const selection = new Map(); // key: `${iso}-${kind}` → { srcPath, isPdf }
  for (const f of candidates) {
    const name = basename(f);
    if (!/\.(docx|pdf)$/i.test(name)) continue;
    if (!/Agenda|Meeting Minutes|SSC Agenda|SSC Meeting/i.test(f)) continue;
    const iso = parseMeetingDate(name);
    const kind = detectKind(name);
    if (!iso || !kind) continue;
    const key = `${iso}-${kind}`;
    const isPdf = /\.pdf$/i.test(name);
    const existing = selection.get(key);
    if (!existing) selection.set(key, { srcPath: f, isPdf });
    else if (isPdf && !existing.isPdf) selection.set(key, { srcPath: f, isPdf });
  }

  const browser = await chromium.launch();
  try {
    for (const [key, { srcPath, isPdf }] of [...selection.entries()].sort()) {
      const outPath = join(outDir, `${key}.pdf`);
      if (isPdf) {
        copyFileSync(srcPath, outPath);
        console.log(`copy   ${basename(srcPath)} → ${basename(outPath)}`);
      } else {
        await docxToPdf(srcPath, outPath, browser);
        console.log(`render ${basename(srcPath)} → ${basename(outPath)}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nWrote ${selection.size} files to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
