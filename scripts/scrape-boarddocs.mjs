#!/usr/bin/env node
/**
 * Scrape BoardDocs meeting agendas and attachments using a district config.
 *
 * For each meeting since the configured cutoff date:
 *   1. Fetch BD-GetAgenda -> parse categories + items from HTML
 *   2. For items with attachments, fetch BD-GetPublicFiles -> parse file links
 *   3. Fetch BD-GetMinutes -> capture published meeting minutes
 *
 * Usage:
 *   node scripts/scrape-boarddocs.mjs --config config/boarddocs/wvm.yaml
 *   node scripts/scrape-boarddocs.mjs --config config/boarddocs/wvm.yaml --committee cboc
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { extractMemoLinks } from './lib/memo-links.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// BoardDocs sits behind CloudFront, which now 403s the default Node fetch
// User-Agent — a real browser UA is required for every request.
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Rate limiting: delay between requests
const DELAY_MS = 300;
const REQUEST_CONCURRENCY = 4;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function forEachConcurrent(items, limit, callback) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await callback(items[index], index);
    }
  });
  await Promise.all(workers);
}

function printUsage() {
  console.log(`Usage: node scripts/scrape-boarddocs.mjs [options]

Options:
  --config <path>     District YAML config (required)
  --committee <key>  Scrape one committee instead of every configured committee
  --bodies  Backfill item bodies for previously scraped meetings
  --refresh  Re-scrape existing meetings to capture later agendas or minutes
  --help    Show this help`);
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const options = {
    configPath: null,
    committeeKey: null,
    backfillBodies: false,
    refresh: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--bodies') {
      options.backfillBodies = true;
    } else if (arg === '--refresh') {
      options.refresh = true;
    } else if (arg === '--config' || arg === '--committee') {
      const value = args[++i];
      if (!value || value.startsWith('-')) {
        throw new Error(`${arg} requires a value`);
      }
      if (arg === '--config') options.configPath = resolve(process.cwd(), value);
      else options.committeeKey = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.configPath) throw new Error('--config is required');
  return options;
}

function loadConfig(configPath) {
  if (!existsSync(configPath)) throw new Error(`Config file not found: ${configPath}`);

  const config = parseYaml(readFileSync(configPath, 'utf8'));
  if (!config || typeof config !== 'object') throw new Error('Config must be a YAML object');
  if (typeof config.district !== 'string' || !config.district.trim()) throw new Error('Config requires district');
  if (typeof config.baseUrl !== 'string' || !/^https:\/\//.test(config.baseUrl)) {
    throw new Error('Config requires an HTTPS baseUrl');
  }
  config.baseUrl = config.baseUrl.replace(/\/$/, '');
  if (typeof config.cutoffDate !== 'string' || !/^\d{8}$/.test(config.cutoffDate)) {
    throw new Error('Config cutoffDate must be a quoted YYYYMMDD string');
  }
  if (!config.committees || typeof config.committees !== 'object' || Array.isArray(config.committees)) {
    throw new Error('Config requires a committees mapping');
  }

  const committees = Object.entries(config.committees);
  if (!committees.length) throw new Error('Config requires at least one committee');
  for (const [key, committee] of committees) {
    if (!committee || typeof committee !== 'object') throw new Error(`Committee ${key} must be an object`);
    for (const field of ['id', 'name', 'output']) {
      if (typeof committee[field] !== 'string' || !committee[field].trim()) {
        throw new Error(`Committee ${key} requires ${field}`);
      }
    }
    const outputPath = resolve(ROOT, committee.output);
    if (!outputPath.startsWith(`${ROOT}${sep}`)) {
      throw new Error(`Committee ${key} output must be inside the repository`);
    }
    committee.key = key;
    committee.outputPath = outputPath;
  }

  return config;
}

async function bdPost(baseUrl, endpoint, body) {
  const resp = await fetch(`${baseUrl}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body,
  });
  if (!resp.ok) throw new Error(`${endpoint} returned HTTP ${resp.status}`);
  return resp.text();
}

function decodeHtmlEntities(text) {
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, value) => {
    if (value[0] !== '#') return named[value.toLowerCase()] ?? entity;
    const hex = value[1].toLowerCase() === 'x';
    const codePoint = Number.parseInt(value.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
}

function htmlToText(html) {
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\/td\s*>/gi, '\t');
  for (let prev = ''; prev !== text; ) {
    prev = text;
    text = text.replace(/<[^>]+>/g, ' ');
  }
  return decodeHtmlEntities(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Pull an agenda item's body (its "public content") + embedded links from the
// BD-GetAgendaItem detail HTML. The meta header (Meeting/Category/Subject/Type)
// sits in <dl class="row"> blocks; the pasted public content follows the last
// </dl>. Links are extracted from that content HTML (Gmail/Docs redirect
// wrappers unwrapped) and classified via the shared memo-links lib.
function parseItemDetail(html) {
  // Match the closing tag the way browsers do — `</script` then anything up to
  // the next `>` (incl. whitespace/junk like `</script\t\n bar>`) — so the strip
  // can't be circumvented. Satisfies CodeQL js/bad-tag-filter. (We then drop ALL
  // tags to plain text below and only read hrefs, so nothing here is rendered.)
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ');
  const lastDl = cleaned.lastIndexOf('</dl>');
  const contentHtml = lastDl >= 0 ? cleaned.slice(lastDl + 5) : cleaned;
  // Strip tags to a fixpoint: one pass leaves reassembled tags (<scr<b>ipt>).
  let text = contentHtml;
  for (let prev = ''; prev !== text; ) {
    prev = text;
    text = text.replace(/<[^>]+>/g, ' ');
  }
  const body = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
  return { body, memoLinks: extractMemoLinks(contentHtml) };
}

const itemUnique = (item) => item.unique || (item.url || '').match(/id=([A-Z0-9]+)/i)?.[1] || null;

// Fetch + attach body/memoLinks for each item that doesn't have one yet.
// Idempotent: skips items that already carry a `body`, so --bodies is resumable.
async function fetchItemBodies(items, baseUrl, committeeId, delay = 150) {
  await forEachConcurrent(items, REQUEST_CONCURRENCY, async item => {
    if (item.body !== undefined) return;
    const uid = itemUnique(item);
    if (!uid) { item.body = ''; item.memoLinks = []; return; }
    await sleep(delay);
    try {
      const html = await bdPost(baseUrl, 'BD-GetAgendaItem', `id=${uid}&current_committee_id=${committeeId}`);
      const { body, memoLinks } = parseItemDetail(html);
      item.body = body;
      item.memoLinks = memoLinks;
    } catch (e) {
      item.body = '';
      item.memoLinks = [];
    }
  });
}

async function fetchMeetingsList(baseUrl, committeeId) {
  const text = await bdPost(baseUrl, 'BD-GetMeetingsList', `current_committee_id=${committeeId}`);
  return JSON.parse(text);
}

async function fetchMeetingDetails(baseUrl, meetingId, committeeId) {
  const html = await bdPost(baseUrl, 'BD-GetMeeting', `id=${meetingId}&current_committee_id=${committeeId}`);
  const descriptionHtml = html.match(/<div class="meeting-description">([\s\S]*?)<\/div>/i)?.[1] || '';
  return {
    description: htmlToText(descriptionHtml),
    agendaAvailable: html.includes('id="btn-view-agenda"'),
    agendaPdfAvailable: html.includes('id="btn-download-agenda-pdf"'),
  };
}

async function fetchMinutes(baseUrl, meetingId, committeeId) {
  const html = await bdPost(baseUrl, 'BD-GetMinutes', `id=${meetingId}&current_committee_id=${committeeId}`);
  const text = htmlToText(html);
  return {
    available: Boolean(text),
    text,
    sourceUrl: `${baseUrl}/goto?open&id=${meetingId}`,
  };
}

/**
 * Parse BD-GetAgenda HTML into structured categories and items.
 */
function parseAgendaHtml(html, baseUrl) {
  const categories = [];
  const items = [];

  // Parse categories
  const catRe = /<dt[^>]*class="category[^"]*"[^>]*id="([^"]*)"[^>]*unique="([^"]*)"[^>]*>.*?<span class="order">([^<]*)<\/span>.*?<span class="category-name">([^<]*)<\/span>/gs;
  let m;
  while ((m = catRe.exec(html)) !== null) {
    categories.push({
      id: m[1],
      unique: m[2],
      order: m[3].trim(),
      name: m[4].trim(),
    });
  }

  // Parse items
  const itemRe = /<li[^>]*class="[^"]*item[^"]*"[^>]*id="([^"]*)"[^>]*unique="([^"]*)"[^>]*Xtitle="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g;
  while ((m = itemRe.exec(html)) !== null) {
    const id = m[1];
    const unique = m[2];
    const xtitle = m[3];
    const body = m[4];

    const orderMatch = body.match(/<span class="order">([^<]*)<\/span>/);
    const order = orderMatch ? orderMatch[1].trim() : '';

    const titleMatch = body.match(/<span class="title">([^<]*)<\/span>/);
    const title = titleMatch ? titleMatch[1].trim() : xtitle;

    const typeMatch = body.match(/<div class="actiontype">\s*([^<]*?)(?:<span|$)/s);
    let actionType = '';
    if (typeMatch) {
      // Strip tags to a fixpoint: one pass leaves reassembled tags (<scr<b>ipt>).
      actionType = typeMatch[1];
      for (let prev = ''; prev !== actionType; ) {
        prev = actionType;
        actionType = actionType.replace(/<[^>]*>/g, '');
      }
      actionType = actionType.trim().replace(/,\s*$/, '');
    }

    const hasAttachment = body.includes('fa-file-text-o');

    const catOrder = order.split('.')[0] + '.';
    const category = categories.find(c => c.order === catOrder);

    items.push({
      id,
      unique,
      order,
      title,
      actionType,
      hasAttachment,
      categoryName: category ? category.name : '',
      url: baseUrl + `/goto?open&id=${unique}`,
      attachments: [],
    });
  }

  return { categories, items };
}

/**
 * Parse BD-GetPublicFiles HTML into attachment objects.
 */
function parsePublicFilesHtml(html) {
  const attachments = [];
  const fileRe = /<a[^>]*class="public-file"[^>]*unique="([^"]*)"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
  let m;
  while ((m = fileRe.exec(html)) !== null) {
    const rawName = m[3].trim();
    const sizeMatch = rawName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    attachments.push({
      unique: m[1],
      href: `https://go.boarddocs.com${m[2]}`,
      name: sizeMatch ? sizeMatch[1].trim() : rawName,
      size: sizeMatch ? sizeMatch[2].trim() : '',
    });
  }
  return attachments;
}

function parseBdDate(numberdate) {
  const y = numberdate.slice(0, 4);
  const m = numberdate.slice(4, 6);
  const d = numberdate.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function classifyMeetingType(name) {
  const n = name.toLowerCase();
  if (n.includes('special')) return 'Special Meeting';
  if (n.includes('study session')) return 'Study Session';
  return 'Board Meeting';
}

async function scrapeCommittee(config, committee, backfillBodies, refresh) {
  // Load existing scraped data to skip already-scraped meetings
  const outPath = committee.outputPath;
  mkdirSync(dirname(outPath), { recursive: true });
  console.log(`\nCommittee: ${committee.name} (${committee.key})`);
  console.log(`Output: ${outPath}`);
  let existing = [];
  if (existsSync(outPath)) {
    existing = JSON.parse(readFileSync(outPath, 'utf-8'));
    console.log(`Loaded ${existing.length} previously scraped meetings`);
  }

  // --bodies: backfill item bodies + memoLinks into already-scraped meetings,
  // then exit. Resumable — writes after each meeting and skips items that
  // already have a `body`, so re-running picks up where it left off.
  if (backfillBodies) {
    const todo = existing.filter(m => (m.items || []).some(it => it.body === undefined));
    console.log(`Backfilling bodies: ${todo.length} meetings need item bodies`);
    let done = 0;
    for (const mtg of todo) {
      await fetchItemBodies(mtg.items || [], config.baseUrl, committee.id);
      done++;
      const docs = (mtg.items || []).reduce((s, it) => s + (it.memoLinks || []).filter(l => l.kind === 'document').length, 0);
      console.log(`  [${done}/${todo.length}] ${mtg.date} — ${(mtg.items || []).length} items${docs ? `, ${docs} doc link(s)` : ''}`);
      writeFileSync(outPath, JSON.stringify(existing, null, 2)); // incremental, resumable
    }
    const totalDocs = existing.flatMap(m => m.items || []).flatMap(it => it.memoLinks || []).filter(l => l.kind === 'document').length;
    console.log(`\nDone backfilling bodies. ${totalDocs} document links found across all meetings.`);
    return;
  }

  const existingKeys = new Set(existing.map(m => m.unique || `${m.date}|${m.name}`));

  console.log('Fetching meetings list...');
  const allMeetings = await fetchMeetingsList(config.baseUrl, committee.id);
  console.log(`Total meetings in BoardDocs: ${allMeetings.length}`);

  const meetings = allMeetings
    .filter(m => m.numberdate && m.numberdate >= config.cutoffDate)
    .sort((a, b) => b.numberdate.localeCompare(a.numberdate));
  console.log(`Meetings since ${config.cutoffDate}: ${meetings.length}`);

  const toScrape = refresh ? meetings : meetings.filter(m => !existingKeys.has(m.unique));
  console.log(`Already scraped: ${meetings.length - toScrape.length}, to scrape: ${toScrape.length}`);

  const scrapeKeys = new Set(toScrape.map(m => m.unique));
  const results = existing.filter(m => !scrapeKeys.has(m.unique));
  let totalItems = 0;
  let totalAttachments = 0;
  let attachmentFetches = 0;

  for (let i = 0; i < toScrape.length; i++) {
    const mtg = toScrape[i];
    const date = parseBdDate(mtg.numberdate);
    const type = classifyMeetingType(mtg.name);
    console.log(`\n[${i + 1}/${toScrape.length}] ${date} — ${mtg.name.slice(0, 60)}`);

    await sleep(DELAY_MS);
    const meetingDetails = await fetchMeetingDetails(config.baseUrl, mtg.unique, committee.id);

    await sleep(DELAY_MS);
    const agendaHtml = await bdPost(config.baseUrl, 'BD-GetAgenda', `id=${mtg.unique}&current_committee_id=${committee.id}`);
    const { categories, items } = parseAgendaHtml(agendaHtml, config.baseUrl);
    console.log(`  ${categories.length} categories, ${items.length} items`);

    const itemsWithAttachments = items.filter(it => it.hasAttachment);
    if (itemsWithAttachments.length > 0) {
      console.log(`  Fetching attachments for ${itemsWithAttachments.length} items...`);
      await forEachConcurrent(itemsWithAttachments, REQUEST_CONCURRENCY, async item => {
        await sleep(DELAY_MS);
        const filesHtml = await bdPost(config.baseUrl, 'BD-GetPublicFiles', `id=${item.unique}&current_committee_id=${committee.id}`);
        item.attachments = parsePublicFilesHtml(filesHtml);
      });
      attachmentFetches += itemsWithAttachments.length;
      totalAttachments += itemsWithAttachments.reduce((sum, item) => sum + item.attachments.length, 0);
    }

    // Fetch each item's body (public content) + embedded links.
    console.log(`  Fetching item bodies for ${items.length} items...`);
    await fetchItemBodies(items, config.baseUrl, committee.id, DELAY_MS);

    await sleep(DELAY_MS);
    const minutes = await fetchMinutes(config.baseUrl, mtg.unique, committee.id);
    console.log(`  Minutes: ${minutes.available ? 'published' : 'not published'}`);

    totalItems += items.length;

    const minutesAttachments = items
      .filter(item => item.actionType.toLowerCase() === 'minutes' || /\bminutes\b/i.test(item.title))
      .flatMap(item => item.attachments.map(attachment => ({
        ...attachment,
        itemOrder: item.order,
        itemTitle: item.title,
        itemUrl: item.url,
      })));

    results.push({
      committeeKey: committee.key,
      committeeName: committee.name,
      date,
      name: mtg.name,
      type,
      description: meetingDetails.description,
      agendaAvailable: meetingDetails.agendaAvailable,
      agendaPdfAvailable: meetingDetails.agendaPdfAvailable,
      unique: mtg.unique,
      unid: mtg.unid,
      url: config.baseUrl + `/goto?open&id=${mtg.unique}`,
      scrapedAt: new Date().toISOString(),
      minutes,
      minutesAttachments,
      categories: categories.map(c => ({ order: c.order, name: c.name })),
      items: items.map(it => ({
        order: it.order,
        title: it.title,
        actionType: it.actionType,
        category: it.categoryName,
        url: it.url,
        attachments: it.attachments,
        body: it.body || '',
        memoLinks: it.memoLinks || [],
      })),
    });

    // Checkpoint after each meeting so long archive runs can resume safely.
    results.sort((a, b) => b.date.localeCompare(a.date));
    writeFileSync(outPath, JSON.stringify(results, null, 2));
  }

  // Sort by date descending and write
  results.sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nDone! Wrote ${outPath}`);
  console.log(`  ${results.length} meetings, ${totalItems} agenda items, ${totalAttachments} attachments`);
  console.log(`  ${attachmentFetches} attachment API calls made`);
}

async function main() {
  const { configPath, committeeKey, backfillBodies, refresh } = parseArgs(process.argv.slice(2));
  const config = loadConfig(configPath);
  let committees = Object.values(config.committees);

  if (committeeKey) {
    const committee = config.committees[committeeKey];
    if (!committee) {
      throw new Error(`Unknown committee "${committeeKey}". Configured committees: ${Object.keys(config.committees).join(', ')}`);
    }
    committees = [committee];
  }

  console.log(`District: ${config.district}`);
  console.log(`Config: ${configPath}`);
  for (const committee of committees) {
    await scrapeCommittee(config, committee, backfillBodies, refresh);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
