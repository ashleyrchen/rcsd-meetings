---
name: RCSD Data Analyst
description: This skill should be used when the user asks about "Redwood City schools", "RCSD", "school hours", "school enrollment", "school calendar", "is there school today", "next board meeting", "what's for lunch", "lunch menu", "report an absence", "IEP data", "special education", "EL percentage", "free and reduced lunch", "PTO", "Konstella", "ParentSquare", "which school", "board meeting", "SARC", "test scores", "CAASPP", "school budget", "RCEF", "Measure U", "expenditures", "watch board meeting", "compare schools", "school demographics", "meeting transcript", "board discussion", or any question about Redwood City School District schools, demographics, calendars, meetings, lunch menus, funding, or parent resources. Also activates when the user mentions a child's name in the context of school.
version: 0.3.0
---

# RCSD Data Analyst

Answer any question about Redwood City School District (RCSD) — a TK-8 public school district in Redwood City, California serving ~6,500 students across 12 schools — by reading and reasoning over local data files directly.

## Core Approach

All structured data lives in `data/` within the rcsd.info project (typically `/Users/dew/dev/rcsd/rcsd.info/data/`). The files are small JSON (under 500KB total) — read them directly with the Read tool and reason over the contents. This enables arbitrary queries, comparisons, and cross-file analysis that no pre-built tool can match.

For questions requiring live external data (lunch menus), use the bundled scripts.

## Family Configuration

Check for `~/.claude/rcsd-info.local.md` in the user's home directory. This stores family context for resolving child-specific questions ("What's Max having for lunch?").

Expected format:
```yaml
---
children:
  - name: Max
    grade: 5
    school: orion
    program: Mandarin Immersion
  - name: Cyrus
    grade: 3
    school: orion
    program: Mandarin Immersion
---
```

When a user mentions a child by name, resolve their school and grade from this config. If the config doesn't exist and the user asks a child-specific question, ask which school and offer to save the config.

## Data File Inventory

Read these files from `data/` to answer questions. For field-by-field documentation, consult `references/data-schema.md`.

### Schools & District

| File | Size | Use For |
|------|------|---------|
| `schools.json` | 609 lines | School profiles, bell schedules, addresses, principals, PTO/PTA info, parent links, CDS codes |
| `district-calendar-2025-26.json` | ~17 events | "Is there school?" queries for 2025-26 year |
| `district-calendar-2026-27.json` | ~17 events | "Is there school?" queries for 2026-27 year |
| `governance-calendar.json` | ~12 events | Board meeting schedule |

### Demographics & Academics

| File | Use For |
|------|---------|
| `sped-enrollment.json` | IEP student counts by school and grade (CDE 2024-25) |
| `sped-categories.json` | Disability categories and LRE placement by school |
| `sarc/sarc-summary.json` | Demographics, CAASPP scores, per-pupil spending across all schools |
| `sarc/{slug}.json` | Detailed SARC per school: teachers, textbooks, facilities, test results by student group |

### Board Meetings (190 meetings, Aug 2020 - present)

| File | Size | Use For |
|------|------|---------|
| `meetings-data.json` | Largest file | Comprehensive: all meetings, agenda items, timestamps, topics, threads |
| `meeting-summaries.json` | 194 entries | AI-generated 1-3 sentence summaries per meeting |
| `meeting-summaries-es.json` | 194 entries | Spanish translations of summaries |
| `school-board-summaries.json` | ~750 entries | Agenda items tagged to specific schools |
| `board-memos/{date}.json` | Per-meeting | Per-meeting agenda details and attachments |
| `youtube-index.json` | ~893 entries | YouTube video links for meeting recordings |
| `timestamp-map.json` | 694 offsets | Agenda item to video timestamp mapping |
| `document-index.json` | Taxonomy | Categorized index of all board attachments |

### School Slugs

| Slug | School | Grades | Type |
|------|--------|--------|------|
| `adelante-selby` | Adelante Selby Spanish Immersion | TK-5 | Choice |
| `clifford` | Clifford School | TK-8 | Neighborhood |
| `garfield` | Garfield Community School | K-5 | Neighborhood |
| `henry-ford` | Henry Ford School | TK-5 | Neighborhood |
| `hoover` | Hoover Community School | TK-8 | Neighborhood |
| `kennedy` | John F. Kennedy Middle School | 6-8 | Neighborhood |
| `mckinley-mit` | McKinley Institute of Technology | 6-8 | Choice |
| `north-star` | North Star Academy | 3-8 | Choice |
| `orion` | Orion Alternative School | TK-5 | Choice |
| `roosevelt` | Roosevelt School | TK-5 | Neighborhood |
| `roy-cloud` | Roy Cloud School | TK-8 | Neighborhood |
| `taft` | Taft School | TK-5 | Neighborhood |

## Query Strategy

### Simple lookups (single file)
Read the relevant file and extract the answer. Examples: school phone number, bell schedule, calendar check, meeting summary.

### Cross-file analysis (join reasoning)
Read multiple files and reason across them. Examples: "Which schools have high EL% but low math scores?" requires joining `sarc/sarc-summary.json` (demographics + CAASPP) with `schools.json` (enrollment context).

### Temporal/topical analysis (meetings corpus)
For "what has the board discussed about X?", search `meetings-data.json` for topic keywords in the `topics` array and item titles, then read `meeting-summaries.json` for context. For deeper detail, read the specific `board-memos/{date}.json` files. See `references/meetings-guide.md` for navigating the meeting corpus.

### Comparative queries
Read the relevant data for all schools and present side-by-side. The data is small enough to load entirely.

For detailed cross-file query examples, consult `references/query-patterns.md`.

## Live Data (Scripts)

Only lunch menus require live API calls. Everything else is answered from local JSON.

### Lunch Menus

Fetch live from the HealthePro API using the bundled script:
```bash
node ${SKILL_DIR}/scripts/lunch-menu.mjs <slug> [date]
node ${SKILL_DIR}/scripts/lunch-menu.mjs orion tomorrow
node ${SKILL_DIR}/scripts/lunch-menu.mjs orion 2026-04-03
```

Date accepts: `YYYY-MM-DD`, `today`, `tomorrow` (defaults to today).

If the script is unavailable, call the HealthePro API directly. See `references/data-schema.md` for endpoint details and school-to-menuId mapping.

### School Lookup (Convenience)

For quick formatted school profiles, the bundled script is available but reading `schools.json` directly is preferred for flexibility:
```bash
node ${SKILL_DIR}/scripts/query-school.mjs <slug> [--sped] [--meetings]
node ${SKILL_DIR}/scripts/query-school.mjs --calendar YYYY-MM-DD
node ${SKILL_DIR}/scripts/query-school.mjs --list
```

## Data Caveats

- **Cell suppression**: CDE data uses `null` where counts are <=10 students (privacy). State this when presenting data.
- **SARC year lag**: 2024-25 SARCs report 2023-24 data. Note the reporting year.
- **504 plans**: Not tracked by CDE; only available from OCR CRDC (lags ~5 years).
- **AI-generated content**: Meeting summaries are AI-generated and labeled as such. Always note this.
- **Lunch menus**: Published monthly; future months may not yet be available.
- **Bilingual**: Calendar events have `en` and `es` fields. The site has `/schools/` and `/escuelas/` mirrors.

## Remote Fallback

If local data files are not available (e.g., repo not cloned), all JSON is published at `https://data.rcsd.info/json/`. Use WebFetch as a fallback. Board meeting videos are on YouTube (links in `youtube-index.json`).

## Additional Resources

### Reference Files

- **`references/data-schema.md`** — Complete field-by-field documentation of every JSON data file, plus HealthePro API details
- **`references/query-patterns.md`** — Examples of cross-file analysis queries with step-by-step approaches
- **`references/meetings-guide.md`** — Navigating the 190-meeting board corpus: structure, timestamps, transcripts

### Website

- **rcsd.info** — school pages at `/schools/{slug}/`, meetings at `/meetings/`, budget at `/budget/`
- **data.rcsd.info** — public JSON and artifact hosting
