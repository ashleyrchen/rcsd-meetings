#!/usr/bin/env node
// One-off: download the NSA and Henry Ford 25-26 data presentation PDFs from
// the May 13, 2026 board meeting (MID 51013) so they can be ingested by
// scripts/extract-ireadyu-growth.mjs and uploaded to R2.
//
// After running this, upload to R2 with rclone, add the two schools to
// SOURCES (and remove from PENDING_SOURCES) in extract-ireadyu-growth.mjs.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'artifacts', 'board-packets', '2026-05-13');
mkdirSync(OUT, { recursive: true });

const MID = '51013';
const FILES = [
  // Filenames match the sanitize-and-dash convention used by scrape-board-packets.mjs.
  { name: 'North-Star-25-26-Data-for-Board-presentation', aid: 1516017 },
  { name: 'Henry-Ford-25-26-Data-for-Board-presentation', aid: 1516019 },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});
const page = await context.newPage();

await page.goto(`https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=36030397&MID=${MID}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 6; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const html = await page.content();
  if (!/Request unsuccessful|Incapsula incident/.test(html)) break;
}

for (const { name, aid } of FILES) {
  const url = `https://simbli.eboardsolutions.com/Meetings/Attachment.aspx?S=36030397&AID=${aid}&MID=${MID}`;
  const b64 = await page.evaluate(async (u) => {
    const r = await fetch(u, { redirect: 'follow' });
    if (!r.ok) return null;
    const blob = await r.blob();
    const dataUrl = await new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
    return dataUrl.split(',', 2)[1];
  }, url);
  if (!b64) { console.error(`FAIL ${name}`); continue; }
  const path = resolve(OUT, `${name}.pdf`);
  writeFileSync(path, Buffer.from(b64, 'base64'));
  const size = Buffer.from(b64, 'base64').length;
  console.log(`${name}.pdf  ${(size/1024).toFixed(1)}KB`);
}

await browser.close();
