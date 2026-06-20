#!/usr/bin/env node
/**
 * Extract text from a PDF using pdfjs-dist (a project dependency, so this
 * works for anyone after `npm install` — no system tools required).
 *
 * Usage:
 *   node scripts/pdf-to-text.mjs <file.pdf> [--page N]
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

export async function extract(path, onlyPage) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(resolve(process.cwd(), path)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    if (onlyPage && p !== onlyPage) continue;
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group items into lines by their y-position so tabular layouts stay readable.
    const lines = new Map();
    for (const it of content.items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push([it.transform[4], it.str]);
    }
    const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0]);
    out.push(`\n===== page ${p} =====`);
    for (const [, parts] of ordered) {
      out.push(parts.sort((a, b) => a[0] - b[0]).map(x => x[1]).join(' ').replace(/\s+/g, ' ').trim());
    }
  }
  return out.join('\n');
}

// Run as a CLI only when invoked directly (not when imported as a module).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const pageIdx = args.indexOf('--page');
  const onlyPage = pageIdx >= 0 ? Number(args[pageIdx + 1]) : null;
  const file = args.find(a => !a.startsWith('--') && a !== String(onlyPage));
  if (!file) { console.error('Usage: node scripts/pdf-to-text.mjs <file.pdf> [--page N]'); process.exit(1); }
  extract(file, onlyPage).then(t => process.stdout.write(t + '\n'))
    .catch(e => { console.error('Error:', e.message || e); process.exit(1); });
}
