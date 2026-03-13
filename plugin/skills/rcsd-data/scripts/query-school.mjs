#!/usr/bin/env node

/**
 * Query RCSD school data by name or slug.
 * Usage: node query-school.mjs <school-name-or-slug> [--calendar] [--sped] [--meetings]
 *
 * Examples:
 *   node query-school.mjs orion
 *   node query-school.mjs "Roy Cloud" --sped
 *   node query-school.mjs kennedy --meetings
 *   node query-school.mjs --calendar 2026-03-13
 *
 * Data is fetched from data.rcsd.info with local file fallback.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localDataDir = join(__dirname, '..', '..', '..', '..', 'data');
const remoteBase = 'https://data.rcsd.info/json';

async function loadJSON(path) {
  const localPath = join(localDataDir, path);
  if (existsSync(localPath)) {
    return JSON.parse(readFileSync(localPath, 'utf-8'));
  }
  const res = await fetch(`${remoteBase}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

async function findSchool(query) {
  const schools = await loadJSON('schools.json');
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  return schools.schools.find(s =>
    s.slug.replace(/-/g, '') === q ||
    s.nameShort.toLowerCase().replace(/[^a-z0-9]/g, '') === q ||
    s.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(q)
  );
}

function formatSchool(school) {
  const lines = [
    `${school.name}`,
    `  Slug: ${school.slug}`,
    `  Grades: ${school.grades} | Type: ${school.type}${school.program ? ` | Program: ${school.program}` : ''}`,
    `  Enrollment: ${school.enrollment} | High-Need: ${school.highNeedPct}%`,
    `  Principal: ${school.principal}`,
    `  Address: ${school.address}`,
    `  Phone: ${school.phone}`,
    `  Website: ${school.website}`,
    `  Bell Schedule: ${school.bellSchedule.start} - ${school.bellSchedule.end} (early: ${school.bellSchedule.earlyRelease})`,
    `  Lunch Menu: ${school.lunchUrl}`,
    `  Community School: ${school.communitySchool ? 'Yes' : 'No'}`,
    `  CDS Code: ${school.cdsCode}`,
  ];

  if (school.parentLinks) {
    lines.push(`  Parent Platform: ${school.parentLinks.platform}`);
    if (school.parentLinks.konstella) lines.push(`  Konstella: ${school.parentLinks.konstella}`);
  }

  if (school.pto) {
    lines.push(`  PTO: ${school.pto.name} — $${school.pto.revenue?.toLocaleString() || '?'} revenue (${school.pto.revenueFY})`);
    lines.push(`  PTO Per-Pupil: $${school.pto.revenue ? Math.round(school.pto.revenue / school.enrollment) : '?'}`);
  }

  return lines.join('\n');
}

async function formatSped(slug) {
  try {
    const sped = await loadJSON('sped-enrollment.json');
    const cats = await loadJSON('sped-categories.json');
    const schoolSped = sped.schools[slug];
    const schoolCats = cats.schools[slug];

    if (!schoolSped) return `  No SpEd data for ${slug}`;

    const lines = [
      `  IEP Students: ${schoolSped.total} / ${schoolSped.totalEnrollment} (${schoolSped.pct}%)`,
    ];

    if (schoolCats?.placement) {
      const p = schoolCats.placement;
      lines.push(`  LRE Placement:`);
      lines.push(`    Regular class >80%: ${p.regularGt80} (${Math.round(p.regularGt80 / p.total * 100)}%)`);
      lines.push(`    Regular class 40-79%: ${p.regular40to79}`);
      lines.push(`    Regular class <40%: ${p.regularLt40}`);
      lines.push(`    Separate school: ${p.separateSchool}`);
      if (p.preschool > 0) lines.push(`    Preschool: ${p.preschool}`);
    }

    return lines.join('\n');
  } catch {
    return '  SpEd data not available';
  }
}

async function checkCalendar(dateStr) {
  const cal2526 = await loadJSON('district-calendar-2025-26.json');
  const cal2627 = await loadJSON('district-calendar-2026-27.json');
  const calendars = [cal2526, cal2627];

  for (const cal of calendars) {
    for (const evt of cal.events) {
      const start = evt.date;
      const end = evt.dateEnd || evt.date;
      if (dateStr >= start && dateStr <= end) {
        return `${evt.en} (${evt.type}) — ${start}${evt.dateEnd ? ' to ' + evt.dateEnd : ''}`;
      }
    }
  }

  for (const cal of calendars) {
    const first = cal.events.find(e => e.en.includes('First Day'));
    const last = cal.events.find(e => e.en.includes('Last Day'));
    if (first && last && dateStr >= first.date && dateStr <= last.date) {
      return `Regular school day (${cal.schoolYear})`;
    }
  }

  return 'Not within a school year calendar range';
}

async function getRecentMeetings(slug, count = 20) {
  try {
    const summaries = await loadJSON('school-board-summaries.json');
    const entries = [];
    for (const [key, schools] of Object.entries(summaries)) {
      if (schools[slug]) {
        const date = key.split('|')[0];
        const title = key.split('|')[1];
        entries.push({ date, title, summary: schools[slug].en });
      }
    }
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return entries.slice(0, count);
  } catch {
    return [];
  }
}

// --- Main ---
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node query-school.mjs <school-name-or-slug> [--sped] [--meetings]');
  console.log('       node query-school.mjs --calendar YYYY-MM-DD');
  console.log('       node query-school.mjs --list');
  process.exit(0);
}

if (args[0] === '--list') {
  const schools = await loadJSON('schools.json');
  for (const s of schools.schools) {
    console.log(`  ${s.slug.padEnd(16)} ${s.nameShort.padEnd(16)} ${s.grades.padEnd(6)} ${s.type}`);
  }
  process.exit(0);
}

if (args[0] === '--calendar') {
  const date = args[1];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Provide a date in YYYY-MM-DD format');
    process.exit(1);
  }
  console.log(await checkCalendar(date));
  process.exit(0);
}

const query = args.filter(a => !a.startsWith('--')).join(' ');
const school = await findSchool(query);

if (!school) {
  console.error(`School not found: "${query}"`);
  console.error('Available: adelante-selby, clifford, garfield, henry-ford, hoover, kennedy, mckinley-mit, north-star, orion, roosevelt, roy-cloud, taft');
  process.exit(1);
}

console.log(formatSchool(school));

if (args.includes('--sped')) {
  console.log('\nSpecial Education:');
  console.log(await formatSped(school.slug));
}

if (args.includes('--meetings')) {
  console.log('\nRecent Board Items:');
  const meetings = await getRecentMeetings(school.slug);
  if (meetings.length === 0) {
    console.log('  No school-specific board items found');
  } else {
    for (const m of meetings) {
      console.log(`  ${m.date}: ${m.title}`);
      console.log(`    ${m.summary}`);
    }
  }
}
