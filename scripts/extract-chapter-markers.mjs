#!/usr/bin/env node
/**
 * Extract structured chapter markers from board meeting transcripts.
 *
 * For each meeting with an AssemblyAI transcript, sends the speaker-diarized
 * utterances + agenda items to Claude Sonnet, which returns per-item phase
 * timestamps (opened, presentation, publicComment, discussion, vote).
 *
 * Results are cached per meeting in data/chapter-markers-cache/
 * so we only call the API for new or changed meetings.
 *
 * Usage: node scripts/extract-chapter-markers.mjs [--force] [--date 2026-02-26]
 *
 * Requires ANTHROPIC_API_KEY in environment.
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CACHE_DIR = resolve(ROOT, 'data/chapter-markers-cache');
const TRANSCRIPT_AAI_DIR = resolve(ROOT, 'artifacts/transcripts-aai');
const MINUTES_DIR = resolve(ROOT, 'artifacts/minutes');
const DATA_PATH = resolve(ROOT, 'data/meetings-data.json');
const OUTPUT_PATH = resolve(ROOT, 'data/chapter-markers.json');

mkdirSync(CACHE_DIR, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes('--force');
const dateFilter = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

// ---- Format AAI utterances as compact text ----

function formatUtterances(utterances) {
  return utterances.map(u => {
    const seconds = Math.round(u.start / 1000);
    return `[${seconds}s] ${u.speaker}: ${u.text}`;
  }).join('\n');
}

// ---- Extract minutes text from PDF ----

function extractMinutesText(date) {
  const pdfPath = resolve(MINUTES_DIR, `${date}-minutes.pdf`);
  if (!existsSync(pdfPath)) return null;
  const venvPython = resolve(ROOT, '.venv/bin/python3');
  if (!existsSync(venvPython)) return null;
  try {
    const pyScript = `import fitz,sys; doc=fitz.open(sys.argv[1]); print('\\n'.join(p.get_text() for p in doc))`;
    const text = execFileSync(venvPython, ['-c', pyScript, pdfPath], {
      maxBuffer: 1024 * 1024,
      timeout: 10000,
    }).toString();
    return text.substring(0, 8000);
  } catch {
    return null;
  }
}

// ---- Build prompt ----

// Officer rotations: same source of truth as build-meetings-html.mjs.
// afterDate = first meeting UNDER the new officers (previous officers served before this date).
// Sorted newest-first.
const OFFICER_ROTATIONS = [
  {
    afterDate: '2025-12-17',
    president: 'David Weekly', vp: 'Cecilia I. Márquez', clerk: 'Jennifer Ng Kwing King',
    members: ['David Li', 'Mike Wells'],
  },
  {
    afterDate: '2024-12-17',
    president: 'Mike Wells', vp: 'David Weekly', clerk: 'Cecilia I. Márquez',
    members: ['David Li', 'Jennifer Ng Kwing King'],
    note: 'Trustees Lawson & MacAvoy departed; Li & Ng Kwing King sworn in',
  },
  {
    afterDate: '2023-12-06',
    president: 'Cecilia I. Márquez', vp: 'Janet Lawson', clerk: 'Mike Wells',
    members: ['David Weekly', 'Alisa MacAvoy'],
  },
  {
    afterDate: '2022-12-14',
    president: 'María Díaz-Slocum', vp: 'Cecilia I. Márquez', clerk: 'Janet Lawson',
    members: ['Alisa MacAvoy', 'Mike Wells'],
    note: 'Trustee Díaz-Slocum departed; Weekly & Márquez sworn in',
  },
  {
    afterDate: '2021-12-15',
    president: 'Alisa MacAvoy', vp: 'María Díaz-Slocum', clerk: 'Cecilia I. Márquez',
    members: ['Janet Lawson', 'Mike Wells'],
  },
  {
    afterDate: '2020-12-11',
    president: 'Janet Lawson', vp: 'Alisa MacAvoy', clerk: 'María Díaz-Slocum',
    members: ['Cecilia I. Márquez', 'Mike Wells'],
    note: 'Trustee McBride departed; Wells, MacAvoy, and Lawson sworn in',
  },
  {
    afterDate: '2019-12-11',
    president: 'Dennis McBride', vp: 'Janet Lawson', clerk: 'Alisa MacAvoy',
    members: ['María Díaz-Slocum', 'Cecilia I. Márquez'],
  },
];

// Key district staff (non-board). Filtered by date range.
const DISTRICT_STAFF = [
  { name: 'John Baker', role: 'Superintendent', from: '2023-07-01', notes: 'Dr. Baker' },
  { name: 'Evelyn Sanchez', role: 'Executive Assistant to Superintendent', from: '2024-01-01', notes: 'Acts as board secretary — takes roll call, drafts minutes' },
];

// Get the board roster for a specific meeting date
function getBoardRoster(date) {
  // Find the rotation that applies: the most recent rotation where afterDate <= date
  const rotation = OFFICER_ROTATIONS.find(r => date >= r.afterDate);
  if (!rotation) {
    // Before our earliest data
    return [];
  }

  const roster = [
    `  - ${rotation.president} (President)`,
    `  - ${rotation.vp} (Vice President)`,
    `  - ${rotation.clerk} (Clerk)`,
    ...rotation.members.map(m => `  - ${m} (Trustee)`),
  ];

  // Add district staff active at this date
  for (const s of DISTRICT_STAFF) {
    if (date >= s.from && (!s.to || date <= s.to)) {
      roster.push(`  - ${s.name} (${s.role}${s.notes ? '; ' + s.notes : ''})`);
    }
  }

  return roster;
}

function buildPrompt(meeting, compactTranscript, minutesText) {
  // Build agenda list with full details including attachment names (which often name presenters)
  const agendaList = meeting.items.map((item, i) => {
    let line = `${i}. ${item.title}`;
    if (item.attachments && item.attachments.length > 0) {
      const attNames = item.attachments.map(a => a.title || a.name).filter(Boolean);
      if (attNames.length > 0) {
        line += `\n   Attachments: ${attNames.join('; ')}`;
      }
    }
    return line;
  }).join('\n');

  // Get board roster for this specific meeting date
  const activeMembers = getBoardRoster(meeting.date).join('\n');

  let minutesSection = '';
  if (minutesText) {
    minutesSection = `

APPROVED MINUTES (use for speaker names, vote results, and formal actions):
${minutesText}
`;
  }

  return `You are analyzing a school board meeting transcript to extract structured chapter markers for each agenda item.

MEETING: ${meeting.date} (${meeting.type})
Duration: ${meeting.durationSeconds ? Math.round(meeting.durationSeconds) + 's' : 'unknown'}

BOARD MEMBERS AND STAFF (correct spellings — ASR often misspells these names):
${activeMembers}

POSTED AGENDA (0-indexed, with attachments that may name presenters):
${agendaList}
${minutesSection}
TRANSCRIPT (format: [Ns] Speaker: text — N is seconds from start, Speaker is a letter label):
${compactTranscript}

TASK:
1. Identify meeting-level procedural timestamps (call to order, roll call, adjournment)
2. For each agenda item, identify the timestamp (in seconds) of each phase that occurred

MEETING-LEVEL TIMESTAMPS (all are integers in seconds, or null if not found):
- "callToOrder": When the president calls the meeting to order (e.g., "it's 6 o'clock", "I call this meeting to order")
- "rollCall": When roll call begins (the clerk/secretary starts calling names)
- "pledgeOfAllegiance": When the pledge of allegiance is led (null if not done, e.g., special meetings)
- "approvalOfAgenda": When the motion to approve the agenda is called
- "adjournment": When the motion to adjourn carries or the president declares the meeting adjourned

ITEM PHASES:
- "opened": When the board president introduces/calls this item (e.g., "next we have item...", "moving on to...")
- "presentation": When a presenter begins their substantive presentation (not the president's intro)
- "publicComment": When public comment is opened for this item (may come before OR after the presentation; also note there is typically a general public comment period early in the meeting as its own agenda item)
- "discussion": When board members begin deliberating/asking questions
- "vote": When the vote is called — also identify the vote type and result

RULES:
1. All timestamps must be integers (seconds from start of recording)
2. Timestamps must be monotonically increasing within an item's phases (exception: publicComment may precede opened if public comment was taken early)
3. "opened" is required for every item that was actually discussed
4. Other phases are null if they didn't happen for that item
5. For consent calendar items approved as a bundle, mark consent:true and give a single "opened" timestamp for the bundle introduction, plus a "vote" for the bundle vote
6. If an item was pulled from the consent calendar for individual discussion, mark pulled:true and give it full individual phases
7. If the agenda was resequenced, note it in agendaChanges and list items in the order they actually appeared
8. For speaker identification: use the BOARD MEMBERS AND STAFF list above for correct name spellings (ASR frequently garbles these). Agenda item titles often name expected presenters (e.g., "Speakers: Jane Doe, Director"). Minutes list attendees with roles. Use all of these sources to map speaker labels (A, B, C...) to full names and roles. For staff presenters not in the roster, use the name as given in the agenda/minutes.

RESPOND WITH ONLY VALID JSON (no markdown fences):
{
  "speakers": {
    "A": { "name": "Name or null", "role": "role description" }
  },
  "agendaChanges": "description of any resequencing or pulls, or null",
  "callToOrder": 5,
  "rollCall": 10,
  "pledgeOfAllegiance": 45,
  "approvalOfAgenda": 60,
  "adjournment": 3600,
  "items": [
    {
      "agendaIndex": 0,
      "phases": {
        "opened": 123,
        "presentation": 200,
        "publicComment": null,
        "discussion": 400,
        "vote": { "seconds": 500, "type": "roll-call", "result": "5-0" }
      },
      "consent": false,
      "pulled": false
    }
  ]
}`;
}

// ---- Validate output ----

function validateResult(result, meeting) {
  const errors = [];
  const duration = meeting.durationSeconds || Infinity;

  if (!result.items || !Array.isArray(result.items)) {
    errors.push('Missing or invalid items array');
    return errors;
  }

  for (const item of result.items) {
    const idx = item.agendaIndex;
    if (idx == null || idx < 0 || idx >= meeting.items.length) {
      errors.push(`Invalid agendaIndex: ${idx}`);
      continue;
    }

    const p = item.phases;
    if (!p) {
      errors.push(`Item ${idx}: missing phases`);
      continue;
    }

    // Collect all non-null timestamps for monotonicity check
    const timestamps = [];
    if (p.opened != null) timestamps.push(['opened', p.opened]);
    if (p.presentation != null) timestamps.push(['presentation', p.presentation]);
    if (p.publicComment != null) timestamps.push(['publicComment', p.publicComment]);
    if (p.discussion != null) timestamps.push(['discussion', p.discussion]);
    if (p.vote != null) {
      const voteSec = typeof p.vote === 'object' ? p.vote.seconds : p.vote;
      if (voteSec != null) timestamps.push(['vote', voteSec]);
    }

    // Check within duration
    for (const [phase, sec] of timestamps) {
      if (sec < 0 || sec > duration + 60) {
        errors.push(`Item ${idx}.${phase}: ${sec}s outside duration ${duration}s`);
      }
    }

    // Check monotonicity within item
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i][1] < timestamps[i - 1][1]) {
        errors.push(`Item ${idx}: ${timestamps[i][0]} (${timestamps[i][1]}s) before ${timestamps[i - 1][0]} (${timestamps[i - 1][1]}s)`);
      }
    }
  }

  // Check opened timestamps are monotonic across items (in listed order)
  const openedTimes = result.items
    .filter(it => it.phases?.opened != null)
    .map(it => ({ idx: it.agendaIndex, opened: it.phases.opened }));
  for (let i = 1; i < openedTimes.length; i++) {
    if (openedTimes[i].opened < openedTimes[i - 1].opened) {
      errors.push(`Cross-item: item ${openedTimes[i].idx} opened (${openedTimes[i].opened}s) before item ${openedTimes[i - 1].idx} (${openedTimes[i - 1].opened}s)`);
    }
  }

  return errors;
}

// ---- Main ----

async function main() {
  const client = new Anthropic();
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));

  // Load existing output when filtering by date
  const chapterMarkers = (dateFilter && existsSync(OUTPUT_PATH))
    ? JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'))
    : {};
  let apiCalls = 0;
  let cached = 0;
  let skipped = 0;
  let errors = 0;

  for (const meeting of data.meetings) {
    if (dateFilter && meeting.date !== dateFilter) continue;
    if (!meeting.youtube) { skipped++; continue; }
    if (!meeting.items || meeting.items.length === 0) { skipped++; continue; }

    const aaiPath = resolve(TRANSCRIPT_AAI_DIR, `${meeting.youtube}.json`);
    if (!existsSync(aaiPath)) { skipped++; continue; }

    // Check cache
    const cacheFile = resolve(CACHE_DIR, `${meeting.date}.json`);
    if (!force && existsSync(cacheFile)) {
      try {
        const cacheData = JSON.parse(readFileSync(cacheFile, 'utf-8'));
        if (cacheData.result && cacheData.itemCount === meeting.items.length) {
          chapterMarkers[meeting.date] = cacheData.result;
          cached++;
          continue;
        }
      } catch { /* re-process if cache is corrupt */ }
    }

    // Parse AAI transcript
    const aai = JSON.parse(readFileSync(aaiPath, 'utf-8'));
    if (!aai.utterances || aai.utterances.length === 0) { skipped++; continue; }

    const compactTranscript = formatUtterances(aai.utterances);
    const minutesText = extractMinutesText(meeting.date);

    console.log(`${meeting.date} (${meeting.items.length} items, ${aai.utterances.length} utterances, ${Math.round(compactTranscript.length / 1000)}K chars${minutesText ? ', +minutes' : ''})...`);

    const prompt = buildPrompt(meeting, compactTranscript, minutesText);

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });

      apiCalls++;
      const text = response.content[0].text;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`  FAIL: no JSON in response`);
        errors++;
        continue;
      }

      const llmResult = JSON.parse(jsonMatch[0]);

      // Validate
      const validationErrors = validateResult(llmResult, meeting);
      if (validationErrors.length > 0) {
        console.warn(`  WARNINGS:`);
        for (const e of validationErrors) console.warn(`    ${e}`);
      }

      if (llmResult.agendaChanges) {
        console.log(`  Agenda changes: ${llmResult.agendaChanges}`);
      }

      // Build output
      const result = {
        videoId: meeting.youtube,
        speakers: llmResult.speakers || {},
        agendaChanges: llmResult.agendaChanges || null,
        callToOrder: llmResult.callToOrder ?? null,
        rollCall: llmResult.rollCall ?? null,
        pledgeOfAllegiance: llmResult.pledgeOfAllegiance ?? null,
        approvalOfAgenda: llmResult.approvalOfAgenda ?? null,
        adjournment: llmResult.adjournment ?? null,
        items: llmResult.items || [],
      };

      chapterMarkers[meeting.date] = result;

      // Cache
      writeFileSync(cacheFile, JSON.stringify({
        date: meeting.date,
        itemCount: meeting.items.length,
        llmResponse: llmResult,
        result,
        cachedAt: new Date().toISOString(),
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }, null, 2));

      const cost = (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000;
      const itemsWithOpened = (llmResult.items || []).filter(it => it.phases?.opened != null).length;
      console.log(`  ${itemsWithOpened}/${meeting.items.length} items mapped (${response.usage.input_tokens} in, ${response.usage.output_tokens} out, $${cost.toFixed(4)})`);

    } catch (err) {
      console.error(`  API error: ${err.message}`);
      errors++;
    }
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(chapterMarkers, null, 2));
  console.log(`\nDone: ${apiCalls} API calls, ${cached} cached, ${skipped} skipped, ${errors} errors`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
