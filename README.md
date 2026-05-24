# rcsd.info — Open Data for Redwood City School District

Independently compiled public records for the [Redwood City School District](https://www.rcsdk8.net) — board meetings, school profiles, budgets, and calendars — presented as a bilingual (English/Spanish) static site.

**Live site:** [rcsd.info](https://rcsd.info)
**Data API:** [data.rcsd.info](https://data.rcsd.info)
**Source:** [github.com/dweekly/rcsd-meetings](https://github.com/dweekly/rcsd-meetings)

## What's here

- **192 board meetings** (April 2020 – present) from BoardDocs and Simbli/GAMUT
- **8,073 agenda items** with **4,845 attachments** and source links
- **619 school board policies, bylaws, and regulations** across 9 governance sections
- **157 meeting recordings** with diarized transcripts (AssemblyAI Universal 3 Pro)
- **4,198 agenda items mapped to video timestamps** via LLM analysis of transcripts (148 meetings)
- **12 school profile pages** with demographics, test scores, bell schedules, safety plans, and board presentations
- **3 charter school profiles** plus a **district property index** (district-owned sites that aren't operating schools)
- **District budget visualization** with per-pupil funding breakdowns

*Counts reflect the data snapshot of May 2026; the pipeline runs continuously, so live figures will be higher.*

## Data Provenance

Every dataset on this site is traceable to its public source. We document the origin, extraction method, and any transformations for each pipeline. Methodology documents live alongside the data they describe:

| Pipeline | Methodology | Key Details |
|----------|-------------|-------------|
| Meeting transcription | [`data/METHODOLOGY-transcription.md`](data/METHODOLOGY-transcription.md) | AssemblyAI Universal 3 Pro, Opus audio from YouTube, speaker diarization |
| Meeting aggregation | [Data sources](#data-sources) below | Simbli + BoardDocs APIs |
| Board policies | `data/policies-index.json`, `data/board-policies/` | Full policy text, cross-references, footnotes, and metadata scraped from Simbli's REST APIs |
| School profiles | `data/schools.json` | CDE enrollment, CAASPP, SARC, IRS 990 PTO filings |
| Charter profiles | `data/charters.json` | CDE School Directory + Profile for metadata; financial docs filtered from `document-index.json` by title patterns |
| District properties | `data/properties.json` | District-owned/leased sites that aren't operating schools (admin, former campuses, storage); seed list confirmed by the Board President |
| Budget data | `data/budget/` | RCSD adopted budget documents, CDE LCFF data |
| CDE datasets | `data/cde/*.json` | Absenteeism, LTEL, staff ethnicity/experience/ratios via `pull-cde-data.mjs` |
| SPSA extraction | `data/ssc-membership.json`, `data/spsa-budgets.json` | SSC membership and budgets extracted from SPSA PDFs via Claude Haiku |
| SSC meetings | `data/ssc-meetings.json` | Per-meeting SSC agenda/minutes PDFs, published per-school to `documents/ssc/{school}/{year}/` on R2 |

AI-generated content (meeting summaries, timestamp mappings) is always labeled as such and links back to the source transcript or agenda.

## Data Sources

| Source | What | Method | Scripts |
|--------|------|--------|---------|
| [Simbli/GAMUT](https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=36030397) | Agendas, minutes, attachments (Jun 2025+) | Playwright browser scraping | `scrape-simbli-agendas.mjs`, `scrape-board-packets.mjs` |
| [Simbli Policies](https://simbli.eboardsolutions.com/Policy/PolicyListing.aspx?S=36030397) | Board Policy manual, bylaws, regulations | Playwright session interception + REST API calls | `scrape-board-policies.mjs` |
| [BoardDocs](https://go.boarddocs.com/ca/redwood/Board.nsf) | Agendas, attachments (Aug 2023 – Jun 2025) | REST API scraping | `scrape-boarddocs.mjs` |
| [YouTube](https://www.youtube.com/@redwoodcityschooldistrict) | Meeting videos | `yt-dlp` channel index | `scrape-youtube-index.mjs` |
| YouTube audio | Raw Opus 48kHz audio streams | `yt-dlp -f bestaudio` | `transcribe-assemblyai.mjs` |
| [AssemblyAI](https://www.assemblyai.com/) | Diarized transcripts with word-level timestamps | Universal 3 Pro API | `transcribe-assemblyai.mjs` |
| Claude Haiku | Agenda item → video timestamp mapping | LLM transcript analysis | `map-timestamps-llm.mjs` |
| [CDE DataQuest](https://data1.cde.ca.gov/dataquest/) | Enrollment, demographics, test scores, SpEd | Public data files | `data/sped-enrollment.json`, `data/sped-categories.json` |
| [CDE Chronic Absenteeism](https://www.cde.ca.gov/ds/ad/fsabd.asp) | Chronic absenteeism by subgroup | CDE bulk download | `data/cde/absenteeism-2024-25.json` |
| [CDE LTEL/ELAS](https://dq.cde.ca.gov/dataquest/longtermel/) | Long-term English Learner status | CDE bulk download | `data/cde/ltel-2024-25.json` |
| [CDE Staff Demographics](https://www.cde.ca.gov/ds/ad/fsspre.asp) | Teacher race/ethnicity | CDE bulk download | `data/cde/staff-ethnicity-2024-25.json` |
| [CDE Staff Experience](https://www.cde.ca.gov/ds/ad/fsspex.asp) | Teacher experience levels | CDE bulk download | `data/cde/staff-experience-2024-25.json` |
| [CDE Staff Ratios](https://www.cde.ca.gov/ds/ad/fssprat.asp) | Student-staff ratios | CDE bulk download | `data/cde/staff-ratios-2024-25.json` |
| SPSA PDFs | SSC membership, school budgets | Claude Haiku extraction from board packets | `data/ssc-membership.json`, `data/spsa-budgets.json` |
| SSC-published docs | Per-meeting SSC agendas and minutes | .docx → PDF via pandoc + headless Chromium (`scripts/convert-ssc-docs.mjs`) | `data/ssc-meetings.json` |
| [IRS 990 filings](https://projects.propublica.org/nonprofits/) | PTO/PTA per-pupil funding | ProPublica Nonprofit Explorer | `data/schools.json` |
| [CDE School Directory](https://www.cde.ca.gov/SchoolDirectory/) | Charter entity metadata (CDS, address, charter number, date opened) | Manual transcription | `data/charters.json` |
| RCSD records / Board President | District-owned non-school properties (admin, former campuses, storage) | Manual transcription, confirmed by Board President | `data/properties.json` |

## Pipeline

Scripts run in order. Most can be run independently. All cache aggressively — safe to re-run at any time.

```
 Scraping & Collection
 ─────────────────────
 1. scrape:youtube        → data/youtube-index.json
 2. scrape:boarddocs      → data/boarddocs-scraped.json
 3. scrape:simbli         → data/board-memos/*.json (agenda + attachment metadata)
 3b. scrape:policies      → data/policies-index.json + data/board-policies/*.json (raw text + refs)
 4. scrape:packets        → adds local PDFs under artifacts/board-packets/ + memo fields

 Transcription (AssemblyAI)
 ──────────────────────────
 5. transcribe            → artifacts/audio/*.webm + artifacts/transcripts-aai/*.json
    See: data/METHODOLOGY-transcription.md

 CDE Data (California Dept of Education)
 ───────────────────────────────────────
 5b. pull-cde-data.mjs    → data/cde/*.json (absenteeism, LTEL, staff ethnicity/experience/ratios)
 5c. extract:sarc         → data/sarc/*.json (School Accountability Report Cards)

 Processing
 ──────────
 6. extract:links         → data/agenda-attachments.json (requires pymupdf)
 7. map:timestamps:llm    → data/timestamp-map.json (requires ANTHROPIC_API_KEY)

 Build
 ─────
 8.  build:data           → data/meetings-data.json
 9.  build:home           → docs/index.html, sitemap.xml, robots.txt
 10. build:html           → docs/meetings/index.html
 11. build:schools        → docs/schools/**/index.html
 12. build:charters       → docs/charters/**, docs/escuelas-charter/**
 13. build:district       → docs/district/index.html
 14. build:budget         → docs/district/budget/
 15. build:blog           → docs/blog/**

 Deploy
 ──────
 npx wrangler pages deploy docs --project-name=rcsd-meetings
 npm run upload           → R2 (data.rcsd.info)
```

Quick rebuild (build steps only):
```bash
npm run build
```

### Simbli agenda scraping

Simbli's agenda is rendered by an Angular SPA. Attachment links never appear in the static HTML — the SPA fetches them per item from `GetItemsTreeDTO` + `GetSupportingDocuments`. `scrape:simbli` runs Playwright headless, lets the Imperva/Incapsula JS challenge resolve, intercepts the SPA's session params from those XHRs, and reuses them to enumerate all items + attachment AIDs in one shot. It also walks the meeting listing to discover newly-posted MIDs.

```bash
npx playwright install chromium      # one-time setup
npm run scrape:simbli                # discover + scrape any new agendas
npm run scrape:simbli -- --date 2026-05-13   # single meeting
npm run scrape:simbli -- --refresh   # re-pull all (preserves memo + filename enrichments)
npm run scrape:simbli -- --list-only # discovery report; no scrape
```

`scrape:simbli` runs as Phase 0 of `run-pipeline.mjs`, so a fresh `node scripts/run-pipeline.mjs --quick` automatically picks up newly-posted agendas before the build.

### Simbli board policies manual scraping

The entire district board policy manual (619 active policies, bylaws, and regulations across 9 sections) is dynamically fetched from Simbli's REST APIs. `scrape:policies` starts Chromium via Playwright to clear Imperva/Incapsula, intercepts the session-specific security tokens (`sct`, `ensid`, `ptid`) from the first catalog payload, and then uses direct, polite batch-concurrency REST calls inside the page context to download, sanitize, and cache every single policy text and reference in `data/board-policies/` as JSON.

```bash
npm run scrape:policies                # discover and fetch all policies (idempotent/cached)
npm run scrape:policies -- --force     # ignore cache, re-fetch all 619 policies
npm run scrape:policies -- --limit 5   # cap download at 5 policies (excellent for testing)
```

### Board packet PDF download

`scrape:packets` is a follow-on slow path that downloads the actual PDF attachments and adds memo fields (Quick Summary / Recommendation / Rationale / Financial Impact / Speaker) by walking each item's detail view. It enriches the memo files `scrape:simbli` produces.

```bash
npm run scrape:packets           # scrape all meetings (downloads PDFs)
npm run scrape:packets -- --date 2026-02-26  # single meeting
npm run scrape:packets -- --skip-existing    # skip cached meetings
```

### Transcription

Board meeting audio is transcribed with AssemblyAI Universal 3 Pro with speaker diarization. See [`data/METHODOLOGY-transcription.md`](data/METHODOLOGY-transcription.md) for full details on audio source selection, model settings, output schema, and quality observations.

```bash
npm run transcribe                          # all unprocessed meetings
npm run transcribe -- --date 2026-01-14     # single meeting
npm run transcribe -- --limit 5             # batch of 5
node scripts/transcribe-dashboard.mjs       # live progress dashboard at localhost:3456
```

**Output:**
- `artifacts/audio/{videoId}.webm` — raw Opus audio (permanent cache)
- `artifacts/transcripts-aai/{videoId}.json` — full diarized transcript with word-level timestamps
- Published to `data.rcsd.info/audio/` and `data.rcsd.info/transcripts-aai/`

## Document Ontology

All meeting attachments are classified into a document index (`data/document-index.json`) using the following taxonomy. Each document is tagged with type, subtype, school(s), school year, and meeting provenance.

| Type | Subtypes | Description |
|------|----------|-------------|
| **budget** | adopted-budget, first-interim, second-interim, unaudited-actuals, gann-limit, presentation, budget-reduction, multi-year-projection, developer-fee | District financial documents and reports |
| **lcap** | annual, mid-year, federal-addendum, amendment | Local Control and Accountability Plan |
| **spsa** | plan | School Plan for Student Achievement (per-school, per-year) |
| **sarc** | report | School Accountability Report Card (per-school, per-year) |
| **school-report** | presentation | Annual school board presentations with data and SPSA updates |
| **resolution** | resolution | Numbered board resolutions |
| **policy** | policy | Board policies, administrative regulations, bylaws |
| **tax** | parcel, bond | Parcel tax measures (E/U — revenue) and facilities bonds (S/T — construction) |
| **sped** | contract, report | Special education NPS/NPA contracts and study reports |
| **english-learners** | elac, delac, data | English Learner Advisory Committees and reclassification data |
| **early-ed** | preschool, tk | California State Preschool Program (CSPP), Head Start, Transitional Kindergarten |
| **labor** | rcta, csea, other | Union agreements — RCTA (certificated teachers), CSEA (classified staff), RCAA (administrators) |
| **compliance** | williams-ucp | Quarterly Williams/Uniform Complaint Procedure reports |
| **safety** | safety-plan | Comprehensive School Safety Plans (CSSPs) |

### Bargaining Units

The district has three employee bargaining units:
- **RCTA** — Redwood City Teachers Association (certificated/teaching staff)
- **CSEA** — California School Employees Association (classified/support staff)
- **RCAA** — Redwood City Administrators Association (management/admin)

### Meeting Item Schema

Each meeting's `items` array uses a formal agenda structure:

| Field | Type | Description |
|-------|------|-------------|
| `itemLabel` | string | Hierarchical agenda number ("1", "7.1", "11.3") |
| `title` | string | Clean title (no numeric prefix, no duration suffix) |
| `isSection` | boolean | True for section headers |
| `plannedMinutes` | number/null | Planned duration from agenda (sections only) |
| `actionType` | string/null | "Procedural", "Action", "Action (Consent)", "Discussion", "Information" |
| `speaker` | string/null | From board memo Speaker field |
| `attachments` | array | `{ title, aid, href, filename, size }` |
| `publicComments` | array/null | Individual speakers: `{ name, startSeconds, endSeconds, summary }` |
| `phases` | object/null | Chapter marker timestamps: `{ opened, presentation, publicComment, discussion, vote }` |

## Artifacts & Storage

| Location | Contents | Storage |
|----------|----------|---------|
| `data/` | JSON data files, methodology docs | Git (committed) |
| `docs/` | Generated HTML site | Git → Cloudflare Pages |
| `artifacts/` | Audio, transcripts, PDFs | Local + R2 (gitignored) |
| `data.rcsd.info` | Published artifacts | Cloudflare R2 bucket |

## Setup

```bash
npm install
cp .env.example .env  # add ANTHROPIC_API_KEY and ASSEMBLYAI_API_KEY

# For PDF link extraction:
python3 -m venv .venv
.venv/bin/pip install pymupdf

# For board packet scraping:
npx playwright install chromium
```

## Adapting for Your District

This pipeline can be adapted for other California school districts that use BoardDocs or Simbli:

1. **BoardDocs:** Change `COMMITTEE_ID` in `scrape-boarddocs.mjs`
2. **Simbli:** Change the `S=` school ID in URL patterns
3. **YouTube:** Change `CHANNEL_URL` in `scrape-youtube-index.mjs`
4. **Schools:** Replace `data/schools.json` with your district's school data
5. **Transcription:** Provide your own `ASSEMBLYAI_API_KEY` in `.env`

## Disclaimer

This is not an official Redwood City School District product. Data is independently assembled from publicly available sources and may contain errors. AI-generated content (meeting summaries, timestamp mappings) is labeled as such. For authoritative information, visit [rcsdk8.net](https://www.rcsdk8.net).

## License

MIT
