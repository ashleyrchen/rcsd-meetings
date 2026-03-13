#!/usr/bin/env node

/**
 * Fetch lunch menu for an RCSD school on a given date.
 *
 * Usage:
 *   node lunch-menu.mjs <school-slug> [YYYY-MM-DD]
 *   node lunch-menu.mjs orion 2026-03-13
 *   node lunch-menu.mjs orion              # defaults to today
 *   node lunch-menu.mjs orion tomorrow
 *
 * The HealthePro API is public (no auth required).
 *
 * API pattern:
 *   GET https://menus.healthepro.com/api/organizations/1184/menus/{menuId}/year/{year}/month/{month}/date_overwrites
 *
 * Each day entry has a `setting` JSON string with `current_display` array of
 * {type: "category"|"recipe", name: string, weight: number} items.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localDataDir = join(__dirname, '..', '..', '..', '..', 'data');
const remoteBase = 'https://data.rcsd.info/json';

// Menu IDs per school site ID (from HealthePro API)
// Pattern: /api/organizations/1184/sites/{siteId}/menus/ returns available menus
// The lunchUrl in schools.json encodes both site ID and menu ID
function parseMenuInfo(lunchUrl) {
  const match = lunchUrl.match(/sites\/(\d+)\/menus\/(\d+)/);
  if (!match) return null;
  return { siteId: parseInt(match[1]), menuId: parseInt(match[2]) };
}

function resolveDate(input) {
  if (!input || input === 'today') {
    return new Date().toISOString().split('T')[0];
  }
  if (input === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  throw new Error(`Invalid date: ${input}. Use YYYY-MM-DD, "today", or "tomorrow".`);
}

async function fetchMenu(menuId, year, month) {
  const url = `https://menus.healthepro.com/api/organizations/1184/menus/${menuId}/year/${year}/month/${month}/date_overwrites`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

function formatDayMenu(dayData) {
  const setting = JSON.parse(dayData.setting);
  const items = setting.current_display || [];
  const lines = [];
  for (const item of items) {
    if (item.type === 'category') {
      lines.push(`  [${item.name}]`);
    } else if (item.type === 'recipe') {
      lines.push(`    ${item.name}`);
    }
  }
  return lines.join('\n');
}

// --- Main ---
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node lunch-menu.mjs <school-slug> [date]');
  console.log('  date: YYYY-MM-DD, "today", or "tomorrow" (default: today)');
  process.exit(0);
}

const slug = args[0];
const dateStr = resolveDate(args[1]);
const [year, monthStr] = dateStr.split('-');
const month = parseInt(monthStr);

// Load school data to get menu ID (local fallback to remote)
const localPath = join(localDataDir, 'schools.json');
let schoolsData;
if (existsSync(localPath)) {
  schoolsData = JSON.parse(readFileSync(localPath, 'utf-8'));
} else {
  const res = await fetch(`${remoteBase}/schools.json`);
  if (!res.ok) { console.error('Failed to fetch schools.json'); process.exit(1); }
  schoolsData = await res.json();
}
const schools = schoolsData;
const school = schools.schools.find(s => s.slug === slug || s.nameShort.toLowerCase() === slug.toLowerCase());
if (!school) {
  console.error(`School not found: "${slug}"`);
  console.error('Available slugs: ' + schools.schools.map(s => s.slug).join(', '));
  process.exit(1);
}

const menuInfo = parseMenuInfo(school.lunchUrl);
if (!menuInfo) {
  console.error(`Could not parse menu URL for ${school.nameShort}: ${school.lunchUrl}`);
  process.exit(1);
}

try {
  const days = await fetchMenu(menuInfo.menuId, year, month);
  const dayData = days.find(d => d.day === dateStr);

  if (!dayData) {
    // Check if it's a weekend
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`${dateStr} is a weekend — no school lunch.`);
    } else {
      console.log(`No menu published for ${school.nameShort} on ${dateStr}.`);
      console.log('The menu may not be published yet for this date, or it may be a holiday.');
    }
    process.exit(0);
  }

  console.log(`${school.nameShort} Lunch — ${dateStr}`);
  console.log(formatDayMenu(dayData));
} catch (err) {
  console.error(`Error fetching menu: ${err.message}`);
  process.exit(1);
}
