#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { parse as parseYaml } from 'yaml';
import { extract } from './pdf-to-text.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36';

function parseArgs(args) {
  const configIndex = args.indexOf('--config');
  const sourceIndex = args.indexOf('--source');
  if (configIndex < 0 || !args[configIndex + 1] || sourceIndex < 0 || !args[sourceIndex + 1]) {
    throw new Error('Usage: scrape-election-guide.mjs --config <path> --source <key>');
  }
  return { configPath: resolve(process.cwd(), args[configIndex + 1]), sourceKey: args[sourceIndex + 1] };
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function scrapeHtml(record) {
  const html = (await fetchBuffer(record.url)).toString('utf8');
  const document = new JSDOM(html, { url: record.url }).window.document;
  const heading = [...document.querySelectorAll('h1, h2')]
    .find(element => normalizeText(element.textContent).toLowerCase() === record.heading.toLowerCase());
  if (!heading?.parentElement) throw new Error(`${record.url}: heading not found: ${record.heading}`);
  const body = normalizeText(heading.parentElement.textContent);
  return body.startsWith(record.heading) ? body.slice(record.heading.length).trim() : body;
}

async function scrapePdf(record, sourceKey) {
  const file = resolve(ROOT, 'tmp', `${sourceKey}-${record.slug}.pdf`);
  writeFileSync(file, await fetchBuffer(record.url));
  return normalizeText(await extract(file));
}

async function main() {
  const { configPath, sourceKey } = parseArgs(process.argv.slice(2));
  const config = parseYaml(readFileSync(configPath, 'utf8'));
  const source = config.recordSources?.[sourceKey];
  if (!source?.output || !Array.isArray(source.records)) {
    throw new Error(`recordSources.${sourceKey} requires output and records`);
  }

  const output = resolve(ROOT, source.output);
  if (!output.startsWith(`${ROOT}${sep}`)) throw new Error('Record output must be inside the repository');

  const records = [];
  for (const record of source.records) {
    const body = record.format === 'pdf' ? await scrapePdf(record, sourceKey) : await scrapeHtml(record);
    records.push({ slug: record.slug, title: record.title, type: record.type, sourceUrl: record.url, body });
    console.log(`${record.slug}: ${body.length} characters`);
  }

  writeFileSync(output, `${JSON.stringify({
    key: sourceKey,
    title: source.name,
    description: source.description,
    date: source.date,
    sourceUrl: source.indexUrl,
    retrieved: new Date().toISOString().slice(0, 10),
    records,
  }, null, 2)}\n`);
  console.log(`Wrote ${records.length} records to ${relative(ROOT, output)}`);
}

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
