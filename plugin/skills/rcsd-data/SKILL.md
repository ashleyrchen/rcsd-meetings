---
name: RCSD School Data
description: This skill should be used when the user asks about "Redwood City schools", "RCSD", "school hours", "school enrollment", "school calendar", "is there school today", "next board meeting", "what's for lunch", "lunch menu", "report an absence", "IEP data", "special education", "EL percentage", "free and reduced lunch", "PTO", "Konstella", "ParentSquare", "which school", "board meeting", "SARC", "test scores", "CAASPP", "school budget", "RCEF", "Measure U", "expenditures", "watch board meeting", or any question about Redwood City School District schools, demographics, calendars, meetings, lunch menus, funding, or parent resources. Also activates when the user mentions a child's name in the context of school.
version: 0.2.0
---

# RCSD School Data

Query and answer questions about Redwood City School District (RCSD) — a TK-8 public school district in Redwood City, California serving ~6,500 students across 12 schools.

## Family Configuration

Check for a `.claude/rcsd-info.local.md` file in the user's home directory or project root. This file stores family context so the agent can resolve questions like "What's Max having for lunch tomorrow?" without asking which school.

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

Fields:
- `program` — optional but useful for schools with multiple tracks (e.g., Orion has both Mandarin Immersion and Parent Co-op; Adelante Selby is Spanish Immersion)
- `teachers`, `homeroom` — reserved for future use. When per-teacher/homeroom data is available (e.g., class-specific field trips, homework policies), these fields enable teacher-aware queries.

When a user mentions a child by name, look up their school and grade from this config. If the config doesn't exist and the user asks a child-specific question, ask which school and offer to save the config for next time.

## Data Corpus

All structured data lives in the `data/` directory. Read JSON files directly to answer questions.

### Core Data Files

| File | Contents |
|------|----------|
| `data/schools.json` | All 12 schools: name, slug, grades, type, enrollment, address, phone, website, principal, bell schedule, lunch URL, parent links, PTO/PTA info, CDS codes |
| `data/district-calendar-2025-26.json` | 2025-26 school year calendar events |
| `data/district-calendar-2026-27.json` | 2026-27 school year calendar events |
| `data/sped-enrollment.json` | IEP student counts per school per grade (CDE 2024-25) |
| `data/sped-categories.json` | Disability categories and LRE placement per school (CDE 2024-25) |
| `data/sarc/sarc-summary.json` | Demographics, CAASPP scores, expenditures per school |
| `data/sarc/{slug}.json` | Detailed SARC per school (teachers, textbooks, facilities, test scores) |
| `data/meeting-summaries.json` | Board meeting summaries keyed by date |
| `data/meeting-summaries-es.json` | Spanish translations of meeting summaries |
| `data/school-board-summaries.json` | Board agenda items tagged to specific schools |
| `data/board-memos/{date}.json` | Per-meeting agenda details and attachments |
| `data/youtube-index.json` | YouTube video links for board meeting recordings |
| `data/meetings-data.json` | Comprehensive meeting data with timestamps and transcripts |

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

## Answering Common Questions

### "What's [child] having for lunch [date]?"

1. Resolve the child's school from the family config (`.claude/rcsd-info.local.md`)
2. Run `scripts/lunch-menu.mjs` with the school slug and date:
   ```bash
   node ${SKILL_DIR}/scripts/lunch-menu.mjs orion tomorrow
   node ${SKILL_DIR}/scripts/lunch-menu.mjs orion 2026-03-17
   ```
3. The script calls the public HealthePro API (no auth needed) and returns the daily menu grouped by category (Entree, Vegetables, Fruit, Milk)
4. Present the entree options conversationally — parents care most about the main dish

If the script is unavailable, the HealthePro API can be called directly:
```
GET https://menus.healthepro.com/api/organizations/1184/menus/{menuId}/year/{year}/month/{month}/date_overwrites
```
The `menuId` is embedded in each school's `lunchUrl` in `schools.json` (pattern: `/menus/{menuId}`). Response contains per-day entries with a `setting` JSON string; parse `current_display` for item names and categories.

### "Is there school on [date]?"

Read the calendar JSON for the relevant school year. Check if the date falls within any `no-school` event range (check both `date` and `dateEnd` for multi-day events like Spring Break). If no matching event and the date is between First Day and Last Day, school is in session.

### "What time does school start/end?"

Read `schools.json` → `bellSchedule.start`, `.end`, `.earlyRelease`. Wednesday is typically early release day.

### "How do I report an absence?"

District-wide: SchoolMessenger app. Links in `schools.json` → `districtLinks.absenceReporting` (iOS and Android app store URLs).

### "How do I join the PTO / connect with parents?"

Check `schools.json` → school's `parentLinks` for platform and join URLs. District-wide ParentSquare: `districtLinks.parentSquare`.

### "What's the IEP/special ed rate?"

Read `sped-enrollment.json` → `schools.{slug}.pct`. For LRE placement details, read `sped-categories.json`. Note: 504 plan data not available from CDE.

### "What happened at the board meeting?"

Read `meeting-summaries.json` for full-meeting summaries. For school-specific items, read `school-board-summaries.json`.

## Live Data & Document Fetching

Some questions require fetching live data beyond the static JSON files.

### Lunch Menus (HealthePro API)

The HealthePro REST API is public and requires no authentication:
- **Site list:** `GET /api/organizations/1184/sites/list` — all school sites with IDs
- **Menus for site:** `GET /api/organizations/1184/sites/{siteId}/menus/` — available menus (lunch, breakfast)
- **Daily items:** `GET /api/organizations/1184/menus/{menuId}/year/{YYYY}/month/{M}/date_overwrites` — per-day meal items
- **Recipes catalog:** `GET /api/organizations/1184/menus/{menuId}/start_date/{start}/end_date/{end}/recipes/` — ingredient/allergen/nutrition details

Use `scripts/lunch-menu.mjs` for the common case; call the API directly for allergen queries or nutrition details.

### Board Meeting Documents

Board agendas, attachments, and minutes are on BoardDocs:
- **Scraped data:** `data/boarddocs-scraped.json` contains historical agenda data
- **Board memos:** `data/board-memos/{YYYY-MM-DD}.json` for per-meeting details
- **Live agendas:** Fetch from `https://go.boarddocs.com/ca/redwood/Board.nsf` (use WebFetch)
- **Meeting videos:** YouTube links in `data/youtube-index.json`

### School Accountability Report Cards (SARCs)

- **Structured data:** `data/sarc/{slug}.json` and `data/sarc/sarc-summary.json`
- **PDF SARCs:** Hosted at `data.rcsd.info/documents/sarc/2024-25/{slug}-sarc-2024-25.pdf`
- To fetch a SARC PDF for reading, use the Read tool on a downloaded copy or WebFetch on the URL

### District Calendar PDFs

Calendar PDF URLs are in the calendar JSON files (`calendarUrl` field). These are the official board-approved calendars. Fetch with WebFetch or download and Read for visual confirmation.

## Data Caveats

- **Cell suppression**: CDE data uses `null` where counts are <=10 students (privacy)
- **SARC year lag**: 2024-25 SARCs report 2023-24 data
- **504 plans**: Not tracked by CDE; only from OCR CRDC (lags ~5 years)
- **Bilingual**: Calendar events have `en` and `es` fields. Site has `/schools/` and `/escuelas/` mirrors.
- **Lunch menus**: Published monthly; future months may not be available yet

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/query-school.mjs <slug> [--sped] [--meetings]` | School profile lookup |
| `scripts/query-school.mjs --calendar YYYY-MM-DD` | Check if a date is a school day |
| `scripts/query-school.mjs --list` | List all 12 schools |
| `scripts/lunch-menu.mjs <slug> [date]` | Fetch lunch menu (date: YYYY-MM-DD, "today", "tomorrow") |

## Additional Resources

- **`references/data-schema.md`** — Complete field-by-field documentation of every JSON data file
- **Website:** rcsd.info — school pages at `/schools/{slug}/`, meetings at `/meetings/`, budget at `/budget/`
