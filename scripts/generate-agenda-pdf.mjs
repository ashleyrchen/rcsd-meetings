// Generate Simbli's server-side agenda PDF matching the established artifacts/agendas/ format:
//   - Include Quick Summary / Abstracts: ON
//   - Include Recommendations: ON
//   - Additional Field(s): Rationale + Financial Impact + Speaker + Supporting
//     Documents, labels hidden (matches the field set present in the historical
//     PDFs; the memo body lives in "Rationale", not "Description")
// Validated empirically against artifacts/agendas/2026-02-04-regular.pdf (MID 50343):
// identical 69-AID link set; all memo field texts present; no field-label headings.
//
// usage: node scripts/generate-agenda-pdf.mjs <outpath>=<mid> [...more]
import { chromium } from 'playwright';

const SIMBLI_BASE = 'https://simbli.eboardsolutions.com';
const SCHOOL_ID = '36030397';
const delay = ms => new Promise(r => setTimeout(r, ms));

const jobs = process.argv.slice(2).map(s => { const [out, mid] = s.split('='); return { out, mid }; });
if (!jobs.length) { console.error('usage: node scripts/generate-agenda-pdf.mjs <outpath>=<mid> ...'); process.exit(1); }

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  acceptDownloads: true,
});
await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

for (const { out, mid } of jobs) {
  const page = await context.newPage();
  try {
    await page.goto(`${SIMBLI_BASE}/SB_Meetings/PrintAgenda.aspx?S=${SCHOOL_ID}&MID=${mid}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 6; i++) {
      await delay(5000);
      const html = await page.content();
      if (!html.includes('Request unsuccessful') && !html.includes('Incapsula incident')) break;
    }
    await delay(3000);

    // Quick Summary + Recommendations ON
    await page.evaluate(() => {
      for (const id of ['includeQuickSummary', 'includeRecommendation']) {
        const el = document.getElementById(id);
        if (el && !el.checked) el.click();
      }
    });
    await delay(800);

    // Additional Field(s) ON
    await page.evaluate(() => document.getElementById('printedAdditionalFields').click());
    await delay(1500);

    // Add a field by name in the LAST (newest) dropdown, then hide its label
    const addField = async (name, useAddAnother) => {
      if (useAddAnother) {
        await page.evaluate(() => {
          const els = [...document.querySelectorAll('a, button, span')];
          const el = els.find(e => e.textContent.trim() === 'Add another field' || /Add another field/.test(e.textContent.trim()) && e.children.length === 0);
          if (el) el.click();
        });
        await delay(1500);
      }
      const res = await page.evaluate((fieldName) => {
        const dds = [...document.querySelectorAll('app-dropdown')];
        const dd = dds[dds.length - 1];
        if (!dd) return 'no dropdown';
        dd.querySelector('button.dropdown-toggle').click();
        const items = [...dd.querySelectorAll('.dropdown-item')];
        const target = items.find(b => b.textContent.trim() === fieldName);
        if (!target) return 'no item ' + fieldName;
        target.click();
        return 'ok';
      }, name);
      await delay(1200);
      // Hide Label for the newest field row (last unchecked hide-label toggle)
      await page.evaluate(() => {
        const labels = [...document.querySelectorAll('label, span')].filter(e => e.textContent.trim() === 'Hide Label');
        for (const lab of labels) {
          const row = lab.closest('div');
          const cb = row?.querySelector('input[type=checkbox]') ||
                     lab.parentElement?.querySelector('input[type=checkbox]');
          if (cb && !cb.checked) cb.click();
        }
      });
      await delay(800);
      return res;
    };

    const fieldNames = ['Rationale', 'Financial Impact', 'Speaker', 'Supporting Documents'];
    const fieldResults = [];
    for (let i = 0; i < fieldNames.length; i++) {
      fieldResults.push(await addField(fieldNames[i], i > 0));
    }

    const state = await page.evaluate(() => ({
      qs: document.getElementById('includeQuickSummary')?.checked,
      rec: document.getElementById('includeRecommendation')?.checked,
      fields: [...document.querySelectorAll('app-dropdown button.dropdown-toggle span')].map(s => s.textContent.trim()),
      hideLabels: [...document.querySelectorAll('label, span')].filter(e => e.textContent.trim() === 'Hide Label')
        .map(lab => (lab.closest('div')?.querySelector('input[type=checkbox]') || lab.parentElement?.querySelector('input[type=checkbox]'))?.checked),
    }));
    console.log(`MID ${mid}: fields=${fieldResults.join(',')} state=${JSON.stringify(state)}`);

    const downloadP = page.waitForEvent('download', { timeout: 180000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Print').click();
    });
    const dl = await downloadP;
    await dl.saveAs(out);
    console.log(`  saved -> ${out}`);
  } catch (e) {
    console.error(`MID ${mid}: FAILED — ${e.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
  await delay(8000 + Math.random() * 7000); // polite pacing between meetings
}
await browser.close();
