#!/usr/bin/env node
/**
 * Download BoardDocs attachment files referenced in scraped data.
 *
 * Selects attachments whose agenda item (title or body) matches one of the
 * --match keywords (case-insensitive), then downloads each file into
 * data/attachments/<committee>/. Resumable: existing files are skipped.
 *
 * Usage:
 *   node scripts/download-attachments.mjs --match wellness --match "measure w"
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DELAY_MS = 300;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SOURCES = [
  { path: 'data/wvm-board-of-trustees-boarddocs.json', committee: 'board' },
  { path: 'data/wvm-cboc-boarddocs.json', committee: 'cboc' },
];

function parseArgs(args) {
  const matches = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--match') matches.push((args[++i] || '').toLowerCase());
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!matches.length) throw new Error('At least one --match keyword is required');
  return { matches };
}

function sanitize(name) {
  return name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 120);
}

function collect(matches) {
  const wanted = new Map(); // unique -> { href, name, committee, date, order }
  for (const { path, committee } of SOURCES) {
    const full = resolve(ROOT, path);
    if (!existsSync(full)) continue;
    const meetings = JSON.parse(readFileSync(full, 'utf8'));
    for (const m of meetings) {
      for (const item of m.items || []) {
        const text = `${item.title || ''} ${item.body || ''}`.toLowerCase();
        if (!matches.some(kw => text.includes(kw))) continue;
        for (const a of item.attachments || []) {
          if (!a.href) continue;
          const key = a.unique || a.href;
          if (!wanted.has(key)) {
            wanted.set(key, { href: a.href, name: a.name || key, committee, date: m.date, order: item.order || '' });
          }
        }
      }
    }
  }
  return [...wanted.values()];
}

async function download(url, dest) {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  const { matches } = parseArgs(process.argv.slice(2));
  const files = collect(matches);
  console.log(`Matched ${files.length} unique attachments for: ${matches.join(', ')}`);

  let ok = 0, skipped = 0, failed = 0, bytes = 0;
  const manifest = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const dir = join(ROOT, 'data', 'attachments', f.committee);
    mkdirSync(dir, { recursive: true });
    const fname = `${f.date}_${sanitize(f.order)}_${sanitize(f.name)}`;
    const dest = join(dir, fname);
    const rel = `data/attachments/${f.committee}/${fname}`;

    if (existsSync(dest) && statSync(dest).size > 0) {
      skipped++;
      manifest.push({ ...f, file: rel, status: 'skipped' });
      console.log(`[${i + 1}/${files.length}] skip  ${rel}`);
      continue;
    }
    try {
      await sleep(DELAY_MS);
      const n = await download(f.href, dest);
      bytes += n;
      ok++;
      manifest.push({ ...f, file: rel, status: 'ok', bytes: n });
      console.log(`[${i + 1}/${files.length}] ok    ${rel} (${(n / 1024).toFixed(0)} KB)`);
    } catch (e) {
      failed++;
      manifest.push({ ...f, file: rel, status: 'failed', error: String(e.message || e) });
      console.log(`[${i + 1}/${files.length}] FAIL  ${rel} — ${e.message || e}`);
    }
  }

  writeFileSync(join(ROOT, 'data', 'attachments', 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ${ok} downloaded, ${skipped} skipped, ${failed} failed, ${(bytes / 1024 / 1024).toFixed(1)} MB fetched.`);
  console.log('Manifest: data/attachments/manifest.json');
  if (failed) process.exitCode = 1;
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
