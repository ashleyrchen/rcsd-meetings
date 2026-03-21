#!/usr/bin/env node
/**
 * Scrape board packet PDFs and memo data from Simbli meeting pages.
 *
 * Uses Playwright to navigate Simbli's Incapsula-protected Angular SPA,
 * iterate through agenda items via the Next button, extract memo fields
 * and attachment links, and download PDFs using in-browser fetch.
 *
 * Usage:
 *   node scripts/scrape-board-packets.mjs              # scrape all meetings
 *   node scripts/scrape-board-packets.mjs --date 2026-02-26  # single meeting
 *   node scripts/scrape-board-packets.mjs --dry-run     # show what would be scraped
 *
 * Caching: individual PDFs that already exist and pass validation (>1KB, starts
 * with %PDF) are skipped. Safe to re-run at any time.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync, openSync, readSync, closeSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Meetings to scrape (oldest first for incremental processing)
const MEETINGS = [
  { date: '2025-06-11', mid: 45272 },
  { date: '2025-06-18', mid: 45380 },
  { date: '2025-06-25', mid: 47153 },
  { date: '2025-08-19', mid: 41854 },
  { date: '2025-08-27', mid: 42572 },
  { date: '2025-09-10', mid: 42573 },
  { date: '2025-09-18', mid: 42596 },
  { date: '2025-10-08', mid: 43741 },
  { date: '2025-10-16', mid: 45228 },
  { date: '2025-10-22', mid: 43742 },
  { date: '2025-11-12', mid: 45781 },
  { date: '2025-11-19', mid: 48981 },
  { date: '2025-12-10', mid: 48982 },
  { date: '2025-12-17', mid: 48983 },
  { date: '2026-01-13', mid: 50874 },
  { date: '2026-01-14', mid: 48984 },
  { date: '2026-01-21', mid: 48985 },
  { date: '2026-02-04', mid: 50343 },
  { date: '2026-02-11', mid: 50344 },
  { date: '2026-02-26', mid: 56022 },
  { date: '2026-03-11', mid: 50616 },
  { date: '2026-03-25', mid: 50617 },
];

const SIMBLI_BASE = 'https://simbli.eboardsolutions.com';
const SCHOOL_ID = '36030397';

// Pacing delays (ms)
const DELAY_BETWEEN_DOWNLOADS = { min: 2000, max: 5000 };
const DELAY_BETWEEN_ITEMS = { min: 1000, max: 2000 };
const DELAY_BETWEEN_MEETINGS = { min: 30000, max: 60000 };
const INCAPSULA_WAIT = 5000;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay({ min, max }) {
  return delay(min + Math.random() * (max - min));
}

function sanitizeFilename(name, maxLen = 80) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, maxLen);
}

function isValidPdf(filePath) {
  try {
    const stat = statSync(filePath);
    if (stat.size < 1024) return false;
    const buf = Buffer.alloc(5);
    const fd = openSync(filePath, 'r');
    readSync(fd, buf, 0, 5, 0);
    closeSync(fd);
    return buf.toString('ascii') === '%PDF-';
  } catch {
    return false;
  }
}

function meetingUrl(mid) {
  return `${SIMBLI_BASE}/SB_Meetings/ViewMeeting.aspx?S=${SCHOOL_ID}&MID=${mid}`;
}

function attachmentUrl(aid, mid) {
  return `${SIMBLI_BASE}/Meetings/Attachment.aspx?S=${SCHOOL_ID}&AID=${aid}&MID=${mid}`;
}

async function downloadPdfViaBrowser(page, url, savePath) {
  const b64 = await page.evaluate(async (fetchUrl) => {
    try {
      const resp = await fetch(fetchUrl, { redirect: 'follow' });
      if (!resp.ok) return { error: `HTTP ${resp.status}` };
      const blob = await resp.blob();
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      const commaIdx = dataUrl.indexOf(',');
      return { data: dataUrl.substring(commaIdx + 1), size: blob.size };
    } catch (e) {
      return { error: e.message };
    }
  }, url);

  if (b64.error) {
    console.error(`    FETCH ERROR: ${b64.error}`);
    return false;
  }

  const buf = Buffer.from(b64.data, 'base64');
  writeFileSync(savePath, buf);

  if (!isValidPdf(savePath)) {
    console.warn(`    INVALID PDF (not %PDF or too small), removing`);
    unlinkSync(savePath);
    return false;
  }

  return true;
}

/**
 * Extract item data from the Simbli detail view.
 *
 * DOM structure (Angular SPA):
 *   app-itemdetails — detail panel with:
 *     span.item-title-vm — current item title
 *     button[aria-label="Previous"] / button[aria-label="Next"]
 *     app-itemcontent (#itemComp_content) — memo sections:
 *       div > h3.h3-title (field name) + sibling div#meetingDetailList (content)
 *     app-supporting-docs — attachments:
 *       a.supportingDocText[href*="Attachment.aspx"]
 */
async function extractItemData(page) {
  return page.evaluate(() => {
    const result = { title: '', memo: {}, attachments: [] };

    // Title from the detail header
    const titleEl = document.querySelector('span.item-title-vm');
    if (titleEl) {
      result.title = titleEl.textContent.trim();
    }

    // Memo fields from app-itemcontent
    const contentPanel = document.querySelector('app-itemcontent, #itemComp_content');
    if (contentPanel) {
      const sections = contentPanel.querySelectorAll('h3.h3-title');
      for (const h of sections) {
        const key = h.textContent.trim();
        if (!key || key === 'Supporting Documents') continue;

        // Content is in the next sibling div (which contains #meetingDetailList)
        // The h3 is inside a wrapper div; the content is in the next sibling div
        const sectionWrapper = h.closest('div[_ngcontent-ng-c1050941024], div:has(> h3.h3-title)') || h.parentElement;
        const contentDiv = sectionWrapper?.nextElementSibling;
        if (contentDiv) {
          // Get text content, cleaning up CKEditor cruft
          const text = contentDiv.textContent.trim()
            .replace(/\s+/g, ' ')
            .trim();
          if (text) {
            result.memo[key] = text;
          }
        }
      }
    }

    // Attachments from supporting-docs
    const attLinks = document.querySelectorAll('a.supportingDocText[href*="Attachment.aspx"], a[href*="Attachment.aspx"]');
    const seen = new Set();
    for (const link of attLinks) {
      const href = link.getAttribute('href') || link.href;
      const aidMatch = href.match(/AID=(\d+)/);
      if (!aidMatch) continue;
      const aid = aidMatch[1];
      if (seen.has(aid)) continue;
      seen.add(aid);
      const name = link.textContent.trim();
      result.attachments.push({
        name: name || `attachment-${aid}`,
        aid,
      });
    }

    return result;
  });
}

async function scrapeOneMeeting(meeting, pdfDir, memoDir) {
  const { date, mid } = meeting;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`MEETING: ${date} (MID ${mid})`);
  console.log(`${'='.repeat(60)}`);

  mkdirSync(pdfDir, { recursive: true });
  mkdirSync(memoDir, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await context.newPage();

  try {
    // Navigate and wait for Incapsula challenge to resolve
    console.log(`  Navigating to ${meetingUrl(mid)}`);
    await page.goto(meetingUrl(mid), { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for Incapsula JS challenge to auto-resolve
    let incapsulaCleared = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      await delay(INCAPSULA_WAIT);
      const content = await page.content();
      if (!content.includes('Request unsuccessful') && !content.includes('Incapsula incident')) {
        incapsulaCleared = true;
        break;
      }
      console.log(`  Waiting for Incapsula (attempt ${attempt + 1}/10)...`);
    }

    if (!incapsulaCleared) {
      console.error(`  BLOCKED by Incapsula for ${date}. Skipping.`);
      return null;
    }

    // Wait for Angular SPA to render the agenda tree
    try {
      await page.waitForSelector('button.level-strip.node-title', { timeout: 15000 });
    } catch {
      console.warn(`  Agenda tree not found for ${date}. Page may not have loaded.`);
      return null;
    }

    // Click the first agenda item button to enter detail view
    const firstItemBtn = page.locator('button.level-strip.node-title').first();
    console.log(`  Clicking first item to enter detail view...`);
    await firstItemBtn.click();
    await delay(2000);

    // Verify we're in detail view
    const hasDetailView = await page.locator('span.item-title-vm').isVisible().catch(() => false);
    if (!hasDetailView) {
      console.error(`  Failed to enter detail view for ${date}. Skipping.`);
      return null;
    }

    // Iterate through all items using the Next button
    const items = [];
    let firstItemTitle = null;
    let itemOrder = 0;
    const meetingFilenames = new Set(); // track filenames across entire meeting to avoid collisions
    const MAX_ITEMS = 60; // safety limit

    while (itemOrder < MAX_ITEMS) {
      itemOrder++;

      // Extract current item data
      const itemData = await extractItemData(page);
      const currentTitle = itemData.title;

      // Detect loop (back to first item)
      if (firstItemTitle === null) {
        firstItemTitle = currentTitle;
      } else if (currentTitle && currentTitle === firstItemTitle) {
        console.log(`  Looped back to first item after ${itemOrder - 1} items.`);
        break;
      }

      console.log(`\n  [${itemOrder}] ${currentTitle || '(no title)'}`);
      if (Object.keys(itemData.memo).length > 0) {
        for (const [k, v] of Object.entries(itemData.memo)) {
          console.log(`    ${k}: ${v.substring(0, 80)}${v.length > 80 ? '...' : ''}`);
        }
      }

      // Process attachments
      const downloadedAttachments = [];
      for (const att of itemData.attachments) {
        let filename = sanitizeFilename(att.name) + '.pdf';
        // Disambiguate collisions (e.g. long names truncated to same 80 chars)
        if (meetingFilenames.has(filename)) {
          filename = sanitizeFilename(att.name).substring(0, 70) + `-${att.aid}.pdf`;
        }
        meetingFilenames.add(filename);
        const savePath = resolve(pdfDir, filename);

        // Check cache
        if (existsSync(savePath) && isValidPdf(savePath)) {
          const size = statSync(savePath).size;
          console.log(`    CACHED: ${filename} (${(size / 1024).toFixed(0)}KB)`);
          downloadedAttachments.push({ name: att.name, filename, aid: att.aid, cached: true });
          continue;
        }

        // Download via in-browser fetch (inherits Incapsula cookies)
        const url = attachmentUrl(att.aid, mid);
        console.log(`    Downloading: ${att.name}...`);
        const ok = await downloadPdfViaBrowser(page, url, savePath);
        if (ok) {
          const size = statSync(savePath).size;
          console.log(`    SAVED: ${filename} (${(size / 1024).toFixed(0)}KB)`);
          downloadedAttachments.push({ name: att.name, filename, aid: att.aid, cached: false });
        } else {
          console.warn(`    FAILED: ${att.name}`);
          downloadedAttachments.push({ name: att.name, filename, aid: att.aid, failed: true });
        }

        await randomDelay(DELAY_BETWEEN_DOWNLOADS);
      }

      items.push({
        order: itemOrder,
        title: currentTitle,
        memo: itemData.memo,
        attachments: downloadedAttachments,
      });

      // Click Next button (aria-label="Next")
      const nextBtn = page.locator('button[aria-label="Next"]');
      const nextVisible = await nextBtn.isVisible().catch(() => false);
      if (!nextVisible) {
        console.log(`\n  No Next button. Reached end of items.`);
        break;
      }

      try {
        await nextBtn.click();
        await delay(1500);
      } catch (e) {
        console.warn(`  Next click failed: ${e.message}`);
        break;
      }

      await randomDelay(DELAY_BETWEEN_ITEMS);
    }

    // Save memo data
    const memoData = {
      date,
      mid,
      scrapedAt: new Date().toISOString(),
      items,
    };
    const memoPath = resolve(memoDir, `${date}.json`);
    writeFileSync(memoPath, JSON.stringify(memoData, null, 2));
    console.log(`\n  Saved memo data: ${memoPath} (${items.length} items)`);

    return memoData;
  } catch (e) {
    console.error(`  ERROR scraping ${date}: ${e.message}`);
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dateFilter = args.find((_, i) => args[i - 1] === '--date');
  const skipExisting = args.includes('--skip-existing');

  const pdfBaseDir = resolve(ROOT, 'artifacts/board-packets');
  const memoDir = resolve(ROOT, 'data/board-memos');

  let meetings = MEETINGS;
  if (dateFilter) {
    meetings = meetings.filter(m => m.date === dateFilter);
    if (meetings.length === 0) {
      console.error(`No meeting found for date ${dateFilter}`);
      process.exit(1);
    }
  }

  console.log(`Board Packet Scraper`);
  console.log(`Meetings to process: ${meetings.length}`);
  console.log(`PDF output: ${pdfBaseDir}/{date}/`);
  console.log(`Memo output: ${memoDir}/{date}.json`);
  console.log();

  if (dryRun) {
    for (const m of meetings) {
      const pdfDir = resolve(pdfBaseDir, m.date);
      const memoPath = resolve(memoDir, `${m.date}.json`);
      const hasPdfs = existsSync(pdfDir);
      const hasMemo = existsSync(memoPath);
      console.log(`  ${m.date} MID=${m.mid}  PDFs:${hasPdfs ? 'yes' : 'no'}  Memo:${hasMemo ? 'yes' : 'no'}`);
    }
    return;
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < meetings.length; i++) {
    const m = meetings[i];

    if (skipExisting) {
      const memoPath = resolve(memoDir, `${m.date}.json`);
      if (existsSync(memoPath)) {
        console.log(`\nSkipping ${m.date} (memo already exists)`);
        skipped++;
        continue;
      }
    }

    const pdfDir = resolve(pdfBaseDir, m.date);
    const result = await scrapeOneMeeting(m, pdfDir, memoDir);

    if (result) {
      processed++;
      const totalAtt = result.items.reduce((sum, it) => sum + it.attachments.length, 0);
      const cached = result.items.reduce((sum, it) => sum + it.attachments.filter(a => a.cached).length, 0);
      const downloaded = result.items.reduce((sum, it) => sum + it.attachments.filter(a => !a.cached && !a.failed).length, 0);
      const failedAtt = result.items.reduce((sum, it) => sum + it.attachments.filter(a => a.failed).length, 0);
      console.log(`\n  Summary: ${totalAtt} attachments (${cached} cached, ${downloaded} downloaded, ${failedAtt} failed)`);
    } else {
      failed++;
    }

    // Delay between meetings (skip if last)
    if (i < meetings.length - 1) {
      const waitSec = 30 + Math.random() * 30;
      console.log(`\n  Waiting ${waitSec.toFixed(0)}s before next meeting...`);
      await delay(waitSec * 1000);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`DONE: ${processed} processed, ${skipped} skipped, ${failed} failed`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
