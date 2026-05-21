#!/usr/bin/env node
/**
 * Diagnostic test script to validate Simbli scraping inside a cloud environment.
 * Navigates to Simbli, checks for CDN challenges, and outputs HTML & screenshots for verification.
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'test-results');

const SIMBLI_BASE = 'https://simbli.eboardsolutions.com';
const SCHOOL_ID = '36030397';
const LISTING_URL = `${SIMBLI_BASE}/SB_Meetings/SB_MeetingListing.aspx?S=${SCHOOL_ID}`;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Starting Simbli scraping environment test...`);
  console.log(`Target URL: ${LISTING_URL}`);

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

  try {
    console.log('Navigating to listing page...');
    const response = await page.goto(LISTING_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log(`HTTP Response Status: ${response?.status() || 'Unknown'}`);

    // Wait for the JS challenge to settle
    console.log('Waiting 10 seconds for any potential WAF/Incapsula challenge to clear...');
    await new Promise(r => setTimeout(r, 10000));

    const html = await page.content();
    const title = await page.title();
    console.log(`Page Title: "${title}"`);

    // Check for actual WAF block or CAPTCHA signatures
    const isBlocked = html.includes('Request unsuccessful') ||
                      html.includes('Incapsula incident') ||
                      html.includes('Access Denied') ||
                      /captcha/i.test(html) ||
                      /checking your browser/i.test(html) ||
                      response?.status() === 403 ||
                      response?.status() === 405;

    if (isBlocked) {
      console.warn('\n[!] BLOCKED: Imperva/Incapsula CDN has flagged this environment or IP block.');
    } else {
      console.log('\n[+] SUCCESS: Bypassed CDN successfully!');
    }

    // Always take a screenshot and dump HTML for cloud diagnostics
    const screenshotPath = resolve(OUT_DIR, 'simbli-screenshot.png');
    const htmlPath = resolve(OUT_DIR, 'simbli-content.html');

    await page.screenshot({ path: screenshotPath, fullPage: true });
    writeFileSync(htmlPath, html);

    console.log(`\nDiagnostics saved:`);
    console.log(`- HTML: ${htmlPath} (${(html.length / 1024).toFixed(1)} KB)`);
    console.log(`- Screenshot: ${screenshotPath}`);

    if (isBlocked) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n[!] Error during scraping validation:`, err.message);
    try {
      const screenshotPath = resolve(OUT_DIR, 'error-screenshot.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Saved error screenshot to: ${screenshotPath}`);
    } catch {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
