#!/usr/bin/env node
/**
 * Static Link Validator
 *
 * Scans all generated HTML files in docs/ to verify that all internal relative
 * links (href) and resources (src) point to files that actually exist.
 *
 * Exits with status code 1 if broken links are found (useful for CI/CD or build validation).
 */

import { readFileSync, statSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');

console.log(`\n🔍 Auditing build outputs in: ${DOCS_DIR}`);

// Get all files recursively under a directory
function getFiles(dir) {
  let files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const res = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(getFiles(res));
      } else {
        files.push(res);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
  return files;
}

if (!existsSync(DOCS_DIR)) {
  console.error(`❌ Error: docs/ directory does not exist. Please run the build script first.`);
  process.exit(1);
}

const allFiles = getFiles(DOCS_DIR);
const htmlFiles = allFiles.filter(f => extname(f) === '.html');

console.log(`Found ${htmlFiles.length} HTML files to scan.`);

let totalBroken = 0;
const brokenLinksGrouped = {};

for (const file of htmlFiles) {
  const relSource = file.replace(DOCS_DIR, '');
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`❌ Error reading ${relSource}:`, err.message);
    continue;
  }
  
  // Extract all href="..." and src="..." links
  const matches = [];
  const linkRegex = /(?:href|src)="([^"]+)"/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    matches.push(match[1]);
  }

  for (const rawLink of matches) {
    let link;
    try {
      link = decodeURIComponent(rawLink);
    } catch {
      link = rawLink;
    }

    // Skip absolute/external urls, anchors, mailto, tel, webcal, javascript
    if (
      link.startsWith('http://') ||
      link.startsWith('https://') ||
      link.startsWith('webcal://') ||
      link.startsWith('//') ||
      link.startsWith('#') ||
      link.startsWith('mailto:') ||
      link.startsWith('tel:') ||
      link.startsWith('javascript:')
    ) {
      continue;
    }

    // Resolve link path relative to the file or docs/ root
    let targetPath;
    if (link.startsWith('/')) {
      // Split query parameters and hashes off
      targetPath = join(DOCS_DIR, link.split('#')[0].split('?')[0]);
    } else {
      targetPath = resolve(dirname(file), link.split('#')[0].split('?')[0]);
    }

    // Check if target exists on disk
    let exists = false;
    try {
      if (existsSync(targetPath)) {
        const stat = statSync(targetPath);
        if (stat.isDirectory()) {
          // Directories must resolve to an index.html file
          exists = existsSync(join(targetPath, 'index.html'));
        } else {
          exists = true;
        }
      }
    } catch {
      exists = false;
    }

    if (!exists) {
      totalBroken++;
      if (!brokenLinksGrouped[relSource]) {
        brokenLinksGrouped[relSource] = [];
      }
      brokenLinksGrouped[relSource].push(rawLink);
    }
  }
}

if (totalBroken === 0) {
  console.log('🟢 Success! All internal links and resource paths are valid.');
  process.exit(0);
} else {
  console.error(`\n🔴 Audit Failed: Found ${totalBroken} broken internal links:`);
  for (const [source, links] of Object.entries(brokenLinksGrouped)) {
    console.error(`\nIn ${source}:`);
    for (const link of links) {
      console.error(`  - ${link}`);
    }
  }
  process.exit(1);
}
