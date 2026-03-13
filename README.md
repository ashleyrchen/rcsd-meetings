# rcsd.info — Open Data for Redwood City School District

Independently compiled public records for the [Redwood City School District](https://www.rcsdk8.net) — board meetings, school profiles, budgets, and calendars — presented as a bilingual (English/Spanish) static site.

**Live site:** [rcsd.info](https://rcsd.info)
**Data API:** [data.rcsd.info](https://data.rcsd.info)
**Source:** [github.com/dweekly/rcsd-meetings](https://github.com/dweekly/rcsd-meetings)

## What's here

- **58 board meetings** (Aug 2023 – present) from Simbli/GAMUT and BoardDocs
- **1,422 agenda items** with attachments and source links
- **49 meeting recordings** with diarized transcripts (AssemblyAI Universal 3 Pro)
- **694 timestamped video offsets** mapped via LLM analysis of transcripts
- **12 school profile pages** with demographics, test scores, bell schedules, safety plans, and board presentations
- **District budget visualization** with per-pupil funding breakdowns

## Data Provenance

Every dataset on this site is traceable to its public source. We document the origin, extraction method, and any transformations for each pipeline. Methodology documents live alongside the data they describe:

| Pipeline | Methodology | Key Details |
|----------|-------------|-------------|
| Meeting transcription | [`data/METHODOLOGY-transcription.md`](data/METHODOLOGY-transcription.md) | AssemblyAI Universal 3 Pro, Opus audio from YouTube, speaker diarization |
| Meeting aggregation | [Data sources](#data-sources) below | Simbli + BoardDocs APIs, YouTube captions |
| School profiles | `data/schools.json` | CDE enrollment, CAASPP, SARC, IRS 990 PTO filings |
| Budget data | `data/budget/` | RCSD adopted budget documents, CDE LCFF data |

AI-generated content (meeting summaries, timestamp mappings) is always labeled as such and links back to the source transcript or agenda.

## Data Sources

| Source | What | Method | Scripts |
|--------|------|--------|---------|
| [Simbli/GAMUT](https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=36030397) | Agendas, minutes, attachments (Jun 2025+) | Playwright browser scraping | `scrape-simbli-agendas.mjs`, `scrape-board-packets.mjs` |
| [BoardDocs](https://go.boarddocs.com/ca/redwood/Board.nsf) | Agendas, attachments (Aug 2023 – Jun 2025) | REST API scraping | `scrape-boarddocs.mjs` |
| [YouTube](https://www.youtube.com/@redwoodcityschooldistrict) | Meeting videos | `yt-dlp` channel index | `scrape-youtube-index.mjs` |
| YouTube audio | Raw Opus 48kHz audio streams | `yt-dlp -f bestaudio` | `transcribe-assemblyai.mjs` |
| [AssemblyAI](https://www.assemblyai.com/) | Diarized transcripts with word-level timestamps | Universal 3 Pro API | `transcribe-assemblyai.mjs` |
| Claude Haiku | Agenda item → video timestamp mapping | LLM transcript analysis | `map-timestamps-llm.mjs` |
| [CDE DataQuest](https://data1.cde.ca.gov/dataquest/) | Enrollment, demographics, test scores, SpEd | Public data files | `data/sped-enrollment.json`, `data/sped-categories.json` |
| [IRS 990 filings](https://projects.propublica.org/nonprofits/) | PTO/PTA per-pupil funding | ProPublica Nonprofit Explorer | `data/schools.json` |

## Pipeline

Scripts run in order. Most can be run independently. All cache aggressively — safe to re-run at any time.

```
 Scraping & Collection
 ─────────────────────
 1. scrape:youtube        → data/youtube-index.json
 2. scrape:boarddocs      → data/boarddocs-scraped.json
 3. scrape:simbli         → sources/simbli-*.md
 4. scrape:packets        → data/board-memos/*.json + artifacts/board-packets/
 5. download:transcripts  → artifacts/transcripts/*.srt (YouTube auto-captions)

 Transcription (AssemblyAI)
 ──────────────────────────
 6. transcribe            → artifacts/audio/*.webm + artifacts/transcripts-aai/*.json
    See: data/METHODOLOGY-transcription.md

 Processing
 ──────────
 7. extract:links         → data/agenda-attachments.json (requires pymupdf)
 8. map:timestamps:llm    → data/timestamp-map.json (requires ANTHROPIC_API_KEY)

 Build
 ─────
 9.  build:data           → data/meetings-data.json
 10. build:home           → docs/index.html, sitemap.xml, robots.txt
 11. build:html           → docs/meetings/index.html
 12. build:schools        → docs/schools/**/index.html
 13. build:district       → docs/district/index.html
 14. build:budget         → docs/district/budget/

 Deploy
 ──────
 npx wrangler pages deploy docs --project-name=rcsd-meetings
 npm run upload           → R2 (data.rcsd.info)
```

Quick rebuild (build steps only):
```bash
npm run build
```

### Board packet scraping

Simbli uses Incapsula/Imperva bot protection that blocks all non-browser HTTP requests. The `scrape:packets` script uses Playwright to open a real Chromium browser, navigate each meeting page (which sets Incapsula cookies), then fetches PDFs from within the browser context.

```bash
npx playwright install chromium  # one-time setup
npm run scrape:packets           # scrape all meetings
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
