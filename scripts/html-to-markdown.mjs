#!/usr/bin/env node
/**
 * Convert saved HTML pages into clean, searchable, self-contained markdown.
 *
 * Uses two maintained libraries (jsdom + turndown) rather than a bespoke
 * parser: jsdom isolates the page's main content and rewrites relative links
 * to absolute URLs (so the markdown stands alone once detached from the live
 * site); turndown does the HTML->Markdown conversion.
 *
 * Layout expected in <records-dir>:
 *   sources.json   { "<slug>": "<source URL>", ... }
 *   pages/<slug>.html   ->  writes pages/<slug>.md
 *
 * Usage: node scripts/html-to-markdown.mjs <records-dir>   (default: measure-w-records)
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const recordsDir = resolve(process.cwd(), process.argv[2] || 'measure-w-records');
const PAGES = join(recordsDir, 'pages');
const SOURCES = JSON.parse(readFileSync(join(recordsDir, 'sources.json'), 'utf8'));

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

for (const file of readdirSync(PAGES).filter(f => f.endsWith('.html'))) {
  const slug = file.replace(/\.html$/, '');
  const src = SOURCES[slug];
  const dom = new JSDOM(readFileSync(join(PAGES, file), 'utf8'), src ? { url: src } : {});
  const doc = dom.window.document;

  // Resolve relative hrefs to absolute using the DOM's base URL.
  for (const a of doc.querySelectorAll('a[href]')) {
    try { a.setAttribute('href', a.href); } catch {}
  }

  const main = doc.querySelector('main') || doc.querySelector('#content') || doc.querySelector('article') || doc.body;
  for (const el of main.querySelectorAll('script,style,noscript,form,svg')) el.remove();

  const title = (doc.querySelector('title')?.textContent || slug).trim();
  const md = td.turndown(main.innerHTML).replace(/\n{3,}/g, '\n\n').trim();

  const front = `# ${title}\n\nSource: ${src || '(unknown)'}\nRetrieved: ${new Date().toISOString().slice(0, 10)}\n\n---\n\n`;
  writeFileSync(join(PAGES, `${slug}.md`), front + md + '\n');
  console.log(`wrote ${slug}.md  (${md.length} chars)`);
}
