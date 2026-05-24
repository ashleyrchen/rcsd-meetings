#!/usr/bin/env node
/**
 * Idempotent Board Policies Scraper for Redwood City School District (RCSD).
 *
 * This script pulls the global policy catalog from Simbli's REST APIs via Playwright,
 * and then politely crawls individual policy text details, caching them locally
 * under `data/board-policies/` to minimize external requests.
 *
 * Usage:
 *   node scripts/scrape-board-policies.mjs                 # Fetch & cache new policies
 *   node scripts/scrape-board-policies.mjs --force         # Re-download all policies
 *   node scripts/scrape-board-policies.mjs --limit 5       # Download a maximum of 5 policies (for testing)
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const POLICIES_DIR = resolve(ROOT, 'data/board-policies');
const INDEX_PATH = resolve(ROOT, 'data/policies-index.json');

const URL_LISTING = 'https://simbli.eboardsolutions.com/Policy/PolicyListing.aspx?S=36030397';
const CONCURRENCY_LIMIT = 5;
const REQUEST_DELAY_MS = 100;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Clean up HTML text to plain text while preserving readability, newlines, and bullet points.
 */
function cleanHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;

  mkdirSync(POLICIES_DIR, { recursive: true });

  console.log('Launching Playwright Chromium browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  let policyListingApiUrl = null;
  let firstResponse = null;

  // Intercept the API response that contains the policy catalog
  const onResponse = async (response) => {
    const url = response.url();
    if (url.includes('Services/api/PolicyListing/') && !policyListingApiUrl) {
      policyListingApiUrl = url;
      try {
        firstResponse = await response.json();
        console.log('Successfully intercepted Simbli PolicyListing API response.');
      } catch (e) {
        console.error('Failed to parse intercepted response JSON:', e.message);
      }
    }
  };
  page.on('response', onResponse);

  console.log(`Navigating to policy listing page: ${URL_LISTING}...`);
  await page.goto(URL_LISTING, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait a bit for the API call to complete
  for (let i = 0; i < 20; i++) {
    if (policyListingApiUrl && firstResponse) break;
    await delay(500);
  }

  page.off('response', onResponse);

  if (!policyListingApiUrl || !firstResponse) {
    console.error('Error: Failed to capture Simbli PolicyListing API. This could be due to network timeout or connection limits.');
    await browser.close();
    process.exit(1);
  }

  const parsedUrl = new URL(policyListingApiUrl);
  const sct = parsedUrl.searchParams.get('sct');
  const ensid = parsedUrl.searchParams.get('ensid');
  const ptid = parsedUrl.searchParams.get('ptid');

  const rawPolicies = firstResponse.PolicyListingDTO?.Policies || firstResponse.Policies || [];
  const rawSections = firstResponse.PolicyListingDTO?.PolicySections || firstResponse.PolicySections || [];

  console.log(`Successfully parsed catalog! Total policies: ${rawPolicies.length}, Sections: ${rawSections.length}`);

  const sections = rawSections.map(s => ({
    code: s.Section,
    name: s.Name,
    encrId: s.EncrID,
  }));

  const allPolicies = rawPolicies.map(p => {
    const policyData = p.Policy || p;
    // Map section based on code prefix (e.g. "0100" -> "0000", "1230" -> "1000", "9231" -> "9000")
    const code = policyData.Code || '';
    let sectionCode = '0000';
    if (code.startsWith('1')) sectionCode = '1000';
    else if (code.startsWith('2')) sectionCode = '2000';
    else if (code.startsWith('3')) sectionCode = '3000';
    else if (code.startsWith('4')) sectionCode = '4000';
    else if (code.startsWith('5')) sectionCode = '5000';
    else if (code.startsWith('6')) sectionCode = '6000';
    else if (code.startsWith('7')) sectionCode = '7000';
    else if (code.startsWith('9')) sectionCode = '9000';

    return {
      id: p.ID || policyData.Id,
      code,
      title: policyData.Description || p.text,
      type: p.ContentType?.Abbreviation || (policyData.ContentType?.Name === 'Policy' ? 'BP' : 'AR'),
      section: sectionCode,
      lastRevised: p.LastReviewedDate || policyData.LastRevisedDate,
      lastReviewed: p.LastReviewedDate,
      hasAttachment: policyData.HasAttachment || false,
      revid: p.ID || policyData.Id,
    };
  }).filter(p => p.code); // Filter out empty codes

  console.log(`Mapped ${allPolicies.length} valid policies for indexing.`);

  // Load existing index if it exists, to calculate what needs downloading
  let existingIndex = null;
  if (existsSync(INDEX_PATH)) {
    try {
      existingIndex = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
    } catch (e) {
      console.warn('Could not read existing index, will regenerate.');
    }
  }

  // Determine what needs to be downloaded based on cache
  let queue = allPolicies;
  if (!force) {
    queue = allPolicies.filter(p => {
      const filename = `${p.code}-${p.type}.json`;
      const filePath = resolve(POLICIES_DIR, filename);
      return !existsSync(filePath);
    });
    console.log(`Cache check: ${allPolicies.length - queue.length} policies already cached. ${queue.length} in download queue.`);
  } else {
    console.log(`--force active: re-downloading all ${allPolicies.length} policies.`);
  }

  if (limit !== null) {
    queue = queue.slice(0, limit);
    console.log(`--limit active: queue capped at ${queue.length} items.`);
  }

  if (queue.length > 0) {
    console.log(`Starting batched download of ${queue.length} policies...`);
    let completed = 0;
    
    // Batch processing
    for (let i = 0; i < queue.length; i += CONCURRENCY_LIMIT) {
      const batch = queue.slice(i, i + CONCURRENCY_LIMIT);
      
      await Promise.all(batch.map(async (policy) => {
        const filename = `${policy.code}-${policy.type}.json`;
        const filePath = resolve(POLICIES_DIR, filename);

        // Fetch detail inside page context using the active session cookies/headers
        const detail = await page.evaluate(async ({ revid, sct, ensid }) => {
          const url = `/Services/api/ViewPolicy?sct=${encodeURIComponent(sct)}` +
                      `&ensid=${encodeURIComponent(ensid)}` +
                      `&enUID=&revid=${encodeURIComponent(revid)}` +
                      `&PG=&crntSecId=&isPndg=&st=&mt=`;
          try {
            const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
          } catch (e) {
            return { _error: e.message };
          }
        }, { revid: policy.revid, sct, ensid });

        if (detail._error) {
          console.error(`  [FAILED] ${policy.code} ${policy.type}: ${detail._error}`);
          return;
        }

        const rev = detail.PolicyRevision || {};
        const rawContent = rev.Content || '';
        const contentText = cleanHtmlToText(rawContent);

        // Parse legal and management references
        const footnotes = (detail.PolicyFootnotes || []).map(f => ({
          type: f.Name || 'State',
          references: (f.LegalReferences || []).map(ref => ({
            code: ref.Code || '',
            description: ref.Description || '',
            url: ref.URL || '',
          })),
        }));

        // Parse cross references
        const crossRefs = (detail.CrossRefs || []).map(c => {
          const cpol = c.Policy || {};
          return {
            code: cpol.Code || '',
            title: cpol.Description || '',
            type: c.ContentType?.Abbreviation || (cpol.ContentType?.Name === 'Policy' ? 'BP' : 'AR'),
          };
        });

        // Parse attachments
        const attachments = (rev.Attachments || []).map(a => ({
          id: a.ID || a.AttachmentID,
          name: a.DisplayName || a.FileName || '',
          filename: a.FileName || '',
        }));

        const policyDetail = {
          code: policy.code,
          title: policy.title,
          type: policy.type,
          section: policy.section,
          lastRevised: policy.lastRevised,
          lastReviewed: policy.lastReviewed,
          hasAttachment: policy.hasAttachment,
          revid: policy.revid,
          contentHtml: rawContent,
          contentText: contentText,
          footnotes,
          crossRefs,
          attachments,
        };

        writeFileSync(filePath, JSON.stringify(policyDetail, null, 2) + '\n');
        completed++;
        console.log(`  [OK] (${completed}/${queue.length}) Mapped ${policy.code} ${policy.type}`);
      }));

      if (i + CONCURRENCY_LIMIT < queue.length) {
        await delay(REQUEST_DELAY_MS);
      }
    }
    console.log(`Completed downloading all queue items.`);
  } else {
    console.log('No new policies need to be downloaded.');
  }

  // Generate policies-index.json
  const indexOutput = {
    _metadata: {
      source: URL_LISTING,
      scrapedAt: new Date().toISOString(),
      method: 'Playwright + Simbli ViewPolicy API scraper',
    },
    sections,
    policies: allPolicies,
  };

  writeFileSync(INDEX_PATH, JSON.stringify(indexOutput, null, 2) + '\n');
  console.log(`Successfully wrote global index to ${INDEX_PATH}`);

  await browser.close();
  console.log('Scraper finished successfully!');
}

main().catch(e => {
  console.error('Fatal Error running scraper:', e);
  process.exit(1);
});
