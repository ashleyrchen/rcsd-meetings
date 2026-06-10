#!/usr/bin/env node
/**
 * Idempotent Board Policies Scraper for Redwood City School District (RCSD).
 *
 * This script pulls the global policy catalog from Simbli's REST APIs via Playwright,
 * and then politely crawls individual policy text details, caching them locally
 * under `data/board-policies/` to minimize external requests.
 *
 * A handful of policies (codes like "1312.4-E PDF(1)") are "Exhibit (PDF)"
 * entries: the ViewPolicy API returns no Content for them because Simbli
 * renders them as an embedded PDF.js viewer on ViewPolicy.aspx. For those,
 * an exhibit-capture pass loads each page, captures the PDF the viewer
 * fetches, saves it to artifacts/board-policy-exhibits/, and extracts its
 * text into contentText via PyMuPDF (needs a Python with `pymupdf`
 * installed — set RCSD_PYTHON, or it defaults to .venv/bin/python3).
 *
 * Usage:
 *   node scripts/scrape-board-policies.mjs                 # Fetch & cache new policies
 *   node scripts/scrape-board-policies.mjs --force         # Re-download all policies
 *   node scripts/scrape-board-policies.mjs --limit 5       # Download a maximum of 5 policies (for testing)
 *   node scripts/scrape-board-policies.mjs --exhibits-only # Only run the embedded-PDF exhibit capture pass
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const POLICIES_DIR = resolve(ROOT, 'data/board-policies');
const INDEX_PATH = resolve(ROOT, 'data/policies-index.json');
const EXHIBIT_DIR = resolve(ROOT, 'artifacts/board-policy-exhibits');

const URL_LISTING = 'https://simbli.eboardsolutions.com/Policy/PolicyListing.aspx?S=36030397';
const URL_VIEW = 'https://simbli.eboardsolutions.com/Policy/ViewPolicy.aspx?S=36030397';
const CONCURRENCY_LIMIT = 5;
const REQUEST_DELAY_MS = 100;

// ---- Embedded-PDF exhibit capture tuning ----
// Codes of PDF-embedded exhibits all end like "...-E PDF(1)" (verified across
// the catalog: 12 such policies as of 2026-06; nothing else contains "E PDF").
const EXHIBIT_CODE_RE = /-E PDF\(\d+\)$/;
// Each capture is a full ViewPolicy.aspx page load (Angular SPA + PDF.js
// viewer) — much heavier than the batched JSON API calls above, so space
// them out politely instead of running them concurrently.
const EXHIBIT_PAGE_DELAY_MS = 1500;
// Angular mounts the PDF.js viewer iframe a few seconds after
// DOMContentLoaded; poll for it every 500ms up to this many times (= 30s).
const EXHIBIT_PDF_WAIT_POLLS = 60;
// Zero extracted characters means a scan or a blank page (e.g. exhibit
// 6174-E PDF(1)'s source PDF is a genuinely blank wkhtmltopdf page) — leave
// contentText empty rather than store junk. Below this many characters we
// keep the text but warn loudly: most real exhibits (notices/complaint
// forms) run to thousands of characters, but a short one can be genuine
// (exhibit 1114-E PDF(1) is a one-paragraph pointer to a paper document).
const SUSPICIOUS_EXHIBIT_TEXT_CHARS = 200;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Clean up HTML text to plain text while preserving readability, newlines, and bullet points.
 */
function cleanHtmlToText(html) {
  if (!html) return '';
  let text = html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<\/li>/gi, '');
  // Strip tags to a fixpoint: one pass leaves reassembled tags (<scr<b>ipt>).
  for (let prev = ''; prev !== text; ) {
    prev = text;
    text = text.replace(/<[^>]*>/g, '');
  }
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    // &amp; must decode LAST: decoding it earlier turns &amp;lt; into &lt;,
    // which a later pass double-decodes into a real <.
    .replace(/&amp;/g, '&')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Python used for PDF text extraction (PyMuPDF). RCSD_PYTHON wins, then the
 * project venv, then whatever python3 is on PATH (which must have pymupdf).
 */
function resolveExtractionPython() {
  if (process.env.RCSD_PYTHON) return process.env.RCSD_PYTHON;
  const venvPython = resolve(ROOT, '.venv', 'bin', 'python3');
  if (existsSync(venvPython)) return venvPython;
  return 'python3';
}

// Extracts plain text from a PDF with PyMuPDF in "blocks" mode: each text
// block (≈ paragraph) becomes a blank-line-separated paragraph, matching the
// paragraph structure cleanHtmlToText() gives HTML-sourced policies — the
// downstream translator validates paragraph counts, and plain get_text()
// (single \n per visual line, no \n\n at all) breaks that. sort=True yields
// reading order; all exhibits are single-column. Also strips the invisible
// formatting characters that Google-Docs-exported PDFs wrap around every run
// of text: bidi overrides U+202A-U+202E, bidi isolates U+2066-U+2069,
// zero-widths U+200B-U+200D, word joiner U+2060, BOM/ZWNBSP U+FEFF.
// (Verified against the captured exhibits: without this, every word arrives
// bracketed in U+202D/U+202C.)
const PDF_EXTRACT_PY = `
import re
import sys
import fitz  # PyMuPDF
doc = fitz.open(sys.argv[1])
paras = []
for page in doc:
    for block in page.get_text("blocks", sort=True):
        if block[6] != 0:  # 0 = text block, 1 = image block
            continue
        text = re.sub("[\\u200b-\\u200d\\u2060\\u202a-\\u202e\\u2066-\\u2069\\ufeff]", "", block[4]).strip()
        if text:
            paras.append(text)
sys.stdout.write("\\n\\n".join(paras))
`;

function extractPdfText(pdfPath) {
  const raw = execFileSync(resolveExtractionPython(), ['-c', PDF_EXTRACT_PY, pdfPath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "1312.4-E PDF(1)" + "AR" -> "1312.4-E-PDF(1)-AR.pdf" (URL/R2-safe). */
function exhibitArtifactName(code, type) {
  return `${code}-${type}`.replace(/[^A-Za-z0-9.()_-]+/g, '-') + '.pdf';
}

/**
 * Capture pass for "E PDF" exhibit policies: Simbli's ViewPolicy API returns
 * empty Content for these, and ViewPolicy.aspx instead embeds a PDF.js
 * viewer (<iframe id="iframe1" class="exhibit-wrap"
 * src=".../SB_Assets/Tools/pdf_JS/web/viewer.html?file=<pdf-url>">). The PDF
 * itself lives at an ephemeral, per-page-view URL
 * (/Meetings/TempFolder/Policies/{S}_{code}_{timestamp}.pdf), so it must be
 * captured from the live page load — there is no stable direct link.
 *
 * For each cached policy JSON whose code matches EXHIBIT_CODE_RE and whose
 * API content is empty, this loads the page, reads the viewer iframe's
 * ?file= URL, and re-fetches that URL with an in-page fetch() — NOT by
 * snooping the viewer's own application/pdf responses: PDF.js streams the
 * file in 65536-byte range chunks, so captured response bodies arrive
 * truncated at exactly 64KB (observed live; both >64KB exhibits came back
 * as 65536-byte torsos with no %%EOF trailer). The full PDF is written to
 * artifacts/board-policy-exhibits/, its text extracted with PyMuPDF, and
 * the cached JSON updated in place (contentText + exhibitPdf provenance).
 * Already-captured exhibits are skipped unless force is set.
 */
async function captureExhibitPdfs(context, { force }) {
  const jobs = [];
  for (const file of readdirSync(POLICIES_DIR).filter(f => f.endsWith('.json')).sort()) {
    const filePath = resolve(POLICIES_DIR, file);
    const cached = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!EXHIBIT_CODE_RE.test(cached.code || '')) continue;
    // If the API ever starts returning real HTML content for an exhibit,
    // the normal flow already handled it — nothing to capture.
    if ((cached.contentHtml || '').trim()) continue;
    const artifactPath = cached.exhibitPdf?.artifact ? resolve(ROOT, cached.exhibitPdf.artifact) : null;
    const fresh = (cached.contentText || '').trim() && artifactPath && existsSync(artifactPath);
    if (fresh && !force) continue;
    jobs.push({ file, filePath, cached });
  }

  if (jobs.length === 0) {
    console.log('Exhibit capture: all embedded-PDF exhibits already captured.');
    return;
  }
  console.log(`Exhibit capture: ${jobs.length} embedded-PDF exhibit(s) to capture...`);
  mkdirSync(EXHIBIT_DIR, { recursive: true });

  const page = await context.newPage();

  let captured = 0;
  let failed = 0;
  for (let i = 0; i < jobs.length; i++) {
    const { file, filePath, cached } = jobs[i];
    if (i > 0) await delay(EXHIBIT_PAGE_DELAY_MS);

    const pageUrl = cached._metadata?.source || `${URL_VIEW}&revid=${cached.revid}`;
    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      console.error(`  [FAILED] ${file}: page load failed (${e.message})`);
      failed++;
      continue;
    }

    // Wait for Angular to mount the PDF.js viewer iframe, then read its
    // ?file= param: an ephemeral same-origin TempFolder URL for this exhibit.
    let url = null;
    for (let poll = 0; poll < EXHIBIT_PDF_WAIT_POLLS && !url; poll++) {
      await delay(500);
      const src = await page.evaluate(
        () => document.querySelector('iframe.exhibit-wrap, #iframe1')?.getAttribute('src') || ''
      ).catch(() => '');
      const match = src.match(/[?&]file=(.+)$/);
      if (match) url = match[1];
    }
    if (!url) {
      console.error(`  [FAILED] ${file}: PDF.js viewer iframe never appeared (no embedded PDF?)`);
      failed++;
      continue;
    }
    // Cross-contamination guard: the TempFolder filename embeds the exhibit
    // code (".../36030397_3320-E PDF(2)_<timestamp>.pdf"). getAttribute('src')
    // returns the raw URL (literal spaces), but decode defensively in case a
    // future Simbli build emits %20.
    let decodedUrl = url;
    try { decodedUrl = decodeURIComponent(url); } catch { /* keep raw */ }
    if (!decodedUrl.includes(cached.code)) {
      console.error(`  [FAILED] ${file}: viewer is showing a different document (${url})`);
      failed++;
      continue;
    }

    // Fetch the full PDF with an in-page fetch (same browser session; one
    // plain GET, immune to PDF.js's 64KB range-chunking). Base64 round-trip
    // because page.evaluate can only return JSON-serializable values.
    const fetched = await page.evaluate(async (pdfUrl) => {
      try {
        const resp = await fetch(pdfUrl, { credentials: 'include' });
        if (!resp.ok) return { error: `HTTP ${resp.status}` };
        const bytes = new Uint8Array(await resp.arrayBuffer());
        let binary = '';
        const CHUNK = 0x8000; // build in 32KB slices: String.fromCharCode arg limits
        for (let off = 0; off < bytes.length; off += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(off, off + CHUNK));
        }
        return { b64: btoa(binary) };
      } catch (e) {
        return { error: e.message };
      }
    }, url).catch(e => ({ error: e.message }));
    if (fetched.error) {
      console.error(`  [FAILED] ${file}: PDF fetch failed (${fetched.error})`);
      failed++;
      continue;
    }
    const buffer = Buffer.from(fetched.b64, 'base64');

    const hasMagic = buffer.subarray(0, 5).toString('latin1') === '%PDF-';
    // A complete PDF ends with an %%EOF trailer; its absence means a
    // truncated download (exactly what the range-chunk bug produced).
    const hasEof = buffer.subarray(-1024).toString('latin1').includes('%%EOF');
    if (!hasMagic || !hasEof) {
      console.error(`  [FAILED] ${file}: fetched ${buffer.length} bytes but ${!hasMagic ? 'not a PDF' : 'no %%EOF trailer (truncated)'}`);
      failed++;
      continue;
    }

    const artifactName = exhibitArtifactName(cached.code, cached.type);
    const artifactPath = resolve(EXHIBIT_DIR, artifactName);
    writeFileSync(artifactPath, buffer);

    let text = '';
    try {
      text = extractPdfText(artifactPath);
    } catch (e) {
      console.error(`  [FAILED] ${file}: PDF saved but text extraction failed (${e.message.split('\n')[0]})`);
      failed++;
      continue;
    }
    if (text.length === 0) {
      console.error(`  [FAILED] ${file}: PDF has no extractable text (scan or blank page) — contentText left empty`);
      failed++;
      continue;
    }
    if (text.length < SUSPICIOUS_EXHIBIT_TEXT_CHARS) {
      console.warn(`  [WARN] ${file}: only ${text.length} chars extracted (< ${SUSPICIOUS_EXHIBIT_TEXT_CHARS}) — keeping it, but verify the exhibit really is this short`);
    }

    cached.contentText = text;
    cached.exhibitPdf = {
      artifact: `artifacts/board-policy-exhibits/${artifactName}`,
      sourceUrl: url,
      sourceUrlNote: 'Generated per page view by Simbli (TempFolder) and expires; the ViewPolicy page in _metadata.source is the stable reference.',
      capturedAt: new Date().toISOString(),
      sizeBytes: buffer.length,
    };
    cached._metadata.method = 'Playwright + Simbli ViewPolicy API scraper; embedded exhibit PDF, text-extracted';
    writeFileSync(filePath, JSON.stringify(cached, null, 2) + '\n');
    captured++;
    console.log(`  [OK] (${captured}/${jobs.length}) ${file}: ${buffer.length} bytes PDF, ${text.length} chars extracted`);
  }

  await page.close();
  console.log(`Exhibit capture complete: ${captured} captured, ${failed} failed.`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const exhibitsOnly = args.includes('--exhibits-only');
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

  if (exhibitsOnly) {
    // Fix up embedded-PDF exhibits from the cached policy JSONs without
    // re-scraping the catalog (leaves policies-index.json untouched).
    console.log('--exhibits-only: skipping catalog scrape.');
    await captureExhibitPdfs(context, { force });
    await browser.close();
    console.log('Scraper finished successfully!');
    return;
  }

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
          _metadata: {
            source: `https://simbli.eboardsolutions.com/Policy/ViewPolicy.aspx?S=36030397&revid=${policy.revid}`,
            scrapedAt: new Date().toISOString(),
            method: 'Playwright + Simbli ViewPolicy API scraper',
          },
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

  // "E PDF" exhibits return empty Content from the API; capture their
  // embedded PDFs and extract the text (see captureExhibitPdfs).
  await captureExhibitPdfs(context, { force });

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
