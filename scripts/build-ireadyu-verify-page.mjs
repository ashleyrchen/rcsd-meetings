#!/usr/bin/env node
/**
 * Build an HTML verification page for the i-Ready growth extraction.
 *
 * For each of the 10 schools with 25-26 board presentations, render the
 * source PDF slides (Reading and Math growth tables) as PNGs and show them
 * next to the extracted numbers so David can eyeball every data point
 * before any of it ships to the live site.
 *
 * Output: artifacts/ireadyu-verify/index.html + page-<slug>-<subject>.png
 *
 * Usage:
 *   node scripts/build-ireadyu-verify-page.mjs
 *   open artifacts/ireadyu-verify/index.html
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CACHE_DIR = resolve(ROOT, 'artifacts/board-packets-cache');
const GROWTH_DIR = resolve(ROOT, 'data/ireadyu-growth');
const OUT_DIR = resolve(ROOT, 'artifacts/ireadyu-verify');

function renderPage(pdfPath, pageNum, outPngPath) {
  if (existsSync(outPngPath)) return;
  // pdftoppm outputs <prefix>-<page>.png; render at 110 DPI for a readable screenshot.
  const prefix = outPngPath.replace(/\.png$/, '');
  execFileSync('pdftoppm', ['-png', '-r', '110', '-f', String(pageNum), '-l', String(pageNum), pdfPath, prefix]);
  // pdftoppm adds a -N suffix; normalize the name.
  const candidates = [
    `${prefix}-${pageNum}.png`,
    `${prefix}-${String(pageNum).padStart(2, '0')}.png`,
  ];
  const real = candidates.find(existsSync);
  if (real && real !== outPngPath) {
    execFileSync('mv', [real, outPngPath]);
  }
}

function fmtPct(n) {
  return n == null ? '—' : `${n}%`;
}

function row(r, pngName) {
  if (!r || r.error) return `<td colspan="6" class="err">${r?.error ?? 'not extracted'}</td>`;
  return `
    <td class="num">${fmtPct(r.base_23_24)}</td>
    <td class="num">${fmtPct(r.y1_24_25_expected)}</td>
    <td class="num">${fmtPct(r.y1_24_25_actual)}</td>
    <td class="num">${fmtPct(r.y2_25_26_expected)}</td>
    <td class="num bold">${fmtPct(r.y2_25_26_midyear)}</td>
    <td><a href="${pngName}" target="_blank">slide p${r.source?.pdfPage ?? '?'}</a></td>
  `;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const slugs = readdirSync(GROWTH_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => f.replace(/\.json$/, ''))
    .sort();

  const sections = [];

  for (const slug of slugs) {
    const data = JSON.parse(readFileSync(resolve(GROWTH_DIR, `${slug}.json`), 'utf-8'));

    if (data.status === 'pending_25_26_presentation') {
      sections.push(`
        <section class="pending">
          <h2>${slug} <span class="badge">awaiting 25-26 presentation</span></h2>
          <p class="src">Last presented: <a href="${data.lastPresentation.pdfUrl}" target="_blank">${data.lastPresentation.pdfUrl.split('/').pop()}</a>
            &middot; ${data.lastPresentation.date}</p>
          <p class="note">${data.note}</p>
        </section>
      `);
      continue;
    }

    const fname = data.source.pdfUrl.split('/').pop();
    const pdfPath = resolve(CACHE_DIR, fname);

    const readingPng = `page-${slug}-reading.png`;
    const mathPng = `page-${slug}-math.png`;
    if (data.reading?.source?.pdfPage) {
      renderPage(pdfPath, data.reading.source.pdfPage, resolve(OUT_DIR, readingPng));
    }
    if (data.math?.source?.pdfPage) {
      renderPage(pdfPath, data.math.source.pdfPage, resolve(OUT_DIR, mathPng));
    }

    sections.push(`
      <section>
        <h2>${slug}</h2>
        <p class="src">Source: <a href="${data.source.pdfUrl}" target="_blank">${fname}</a>
          &middot; presented ${data.source.presentationDate}
          &middot; extracted ${data.source.extractedAt}</p>
        <table>
          <thead>
            <tr>
              <th>subject</th>
              <th>base 23-24</th>
              <th>y1 24-25 expected</th>
              <th>y1 24-25 actual</th>
              <th>y2 25-26 expected</th>
              <th>y2 25-26 <b>mid-year</b></th>
              <th>source</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Reading</td>${row(data.reading, readingPng)}</tr>
            <tr><td>Math</td>${row(data.math, mathPng)}</tr>
          </tbody>
        </table>
        <div class="slides">
          <figure>
            <figcaption>Reading — slide p${data.reading?.source?.pdfPage ?? '?'}</figcaption>
            <img src="${readingPng}" alt="Reading growth slide for ${slug}" loading="lazy">
          </figure>
          <figure>
            <figcaption>Math — slide p${data.math?.source?.pdfPage ?? '?'}</figcaption>
            <img src="${mathPng}" alt="Math growth slide for ${slug}" loading="lazy">
          </figure>
        </div>
        <details>
          <summary>raw extracted lines</summary>
          <pre>reading: ${data.reading?.rawLine ?? '(none)'}
math:    ${data.math?.rawLine ?? '(none)'}</pre>
        </details>
      </section>
    `);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>i-Ready growth extraction — verification</title>
<style>
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; color: #222; max-width: 1400px; margin: 2rem auto; padding: 0 1rem; }
  h1 { margin-bottom: 0; }
  p.intro { color: #555; margin-top: 0.2rem; }
  section { border-top: 1px solid #ddd; padding: 1.5rem 0; }
  section h2 { margin: 0 0 0.3rem; text-transform: capitalize; }
  section p.src { font-size: 0.85rem; color: #666; margin: 0.2rem 0 0.8rem; }
  table { border-collapse: collapse; margin-bottom: 0.8rem; font-size: 0.92rem; }
  th, td { border: 1px solid #ccc; padding: 4px 10px; text-align: left; }
  th { background: #f4f4f4; font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.bold { font-weight: 700; background: #fff8d6; }
  td.err { color: #b00; font-style: italic; }
  .slides { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  figure { margin: 0; }
  figcaption { font-size: 0.85rem; color: #666; margin-bottom: 0.3rem; }
  img { width: 100%; border: 1px solid #ddd; border-radius: 4px; }
  details { margin-top: 0.6rem; font-size: 0.85rem; color: #555; }
  pre { background: #f6f6f6; padding: 0.5rem; border-radius: 3px; overflow-x: auto; }
  section.pending { background: #fafafa; }
  section.pending h2 { color: #666; }
  .badge { display: inline-block; background: #eee; color: #555; font-size: 0.7rem;
    font-weight: 500; padding: 2px 8px; border-radius: 10px; margin-left: 0.5rem;
    vertical-align: middle; text-transform: uppercase; letter-spacing: 0.05em; }
  section.pending .note { color: #555; font-style: italic; font-size: 0.92rem; }
</style>
</head>
<body>
<h1>i-Ready Expected Growth — extraction verification</h1>
<p class="intro">
  Numbers extracted from each school's 2025-26 Board of Trustees data presentation PDF.
  Compare the highlighted <b>mid-year</b> cell (the current headline number) against the source slide
  rendered to its right. If any value doesn't match the slide, flag the slug and I'll re-work the extractor.
</p>
<p class="intro">
  Metric: <b>% of students meeting i-Ready Expected Growth</b>. LCAP target: 4 percentage point increase each year.
</p>
${sections.join('\n')}
</body>
</html>
`;

  const outHtml = resolve(OUT_DIR, 'index.html');
  writeFileSync(outHtml, html);
  console.log(`\nWrote ${outHtml}`);
  console.log(`Open with: open ${outHtml}`);
}

main();
