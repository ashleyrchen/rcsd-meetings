# RCSD Board Meeting Index

Open data pipeline for [Redwood City School District](https://www.rcsdk8.net) board meetings. Aggregates agendas, attachments, video timestamps, and transcripts from multiple public sources into a single searchable page.

**Live site:** [rcsd.info](https://rcsd.info)

## What's here

- **57 meetings** (Mar 2024 - present) from Simbli/GAMUT and BoardDocs
- **1,122 agenda items** with attachments and source links
- **694 timestamped video offsets** mapped via Claude Haiku + transcript search
- **49 auto-generated transcripts** from YouTube captions

## Data sources

| Source | What | Method |
|--------|------|--------|
| [Simbli/GAMUT](https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=36030397) | Agendas, minutes, attachments (Jun 2025+) | Markdown index + PDF link extraction |
| [BoardDocs](https://go.boarddocs.com/ca/redwood/Board.nsf) | Agendas, attachments (Mar 2024 - Jun 2025) | API scraping |
| [YouTube](https://www.youtube.com/@redwoodcityschooldistrict) | Meeting videos + auto-captions | yt-dlp |
| Claude Haiku | Agenda item → video timestamp mapping | LLM analysis of transcripts |

## Pipeline

Scripts run in order. Most can be run independently.

```
1. scrape:youtube      → data/youtube-index.json
2. scrape:boarddocs    → data/boarddocs-scraped.json
3. download:transcripts → artifacts/transcripts/*.srt
4. extract:links       → data/agenda-attachments.json (requires pymupdf)
5. map:timestamps:llm  → data/timestamp-map.json (requires ANTHROPIC_API_KEY)
6. build:data          → data/meetings-data.json
7. build:html          → docs/index.html
```

Quick rebuild (steps 6-7 only):
```bash
npm run build
```

### Board packet scraping

Simbli uses Incapsula/Imperva bot protection that blocks all non-browser HTTP requests.
The `scrape:packets` script uses Playwright to open a real Chromium browser, navigate
each meeting page (which sets Incapsula cookies), then fetches PDFs from within the
browser context.

```bash
npx playwright install chromium  # one-time setup
npm run scrape:packets           # scrape all 19 meetings
npm run scrape:packets -- --date 2026-02-26  # single meeting
npm run scrape:packets -- --dry-run          # show what would be scraped
npm run scrape:packets -- --skip-existing    # skip meetings with existing memo JSON
```

**Output:**
- `artifacts/board-packets/{date}/*.pdf` — downloaded PDFs (gitignored)
- `data/board-memos/{date}.json` — structured memo data per meeting

**Caching:** Individual PDFs that exist on disk and pass validation (>1KB, starts with
`%PDF`) are skipped. Safe to re-run at any time. Pacing (2-5s between downloads,
30-60s between meetings) avoids triggering bot detection.

## Setup

```bash
npm install
cp .env.example .env  # add ANTHROPIC_API_KEY for timestamp mapping

# For PDF link extraction:
python3 -m venv .venv
.venv/bin/pip install pymupdf
```

## Adapting for your district

This pipeline can be adapted for other California school districts that use BoardDocs or Simbli:

1. **BoardDocs:** Change `COMMITTEE_ID` in `scrape-boarddocs.mjs`
2. **Simbli:** Change the `S=` school ID in URL patterns
3. **YouTube:** Change `CHANNEL_URL` in `scrape-youtube-index.mjs`
4. **Source data:** Replace `sources/` files with your district's meeting index

## Disclaimer

This is not an official Redwood City School District product. Data is independently assembled from publicly available sources and may contain errors. For authoritative information, visit [rcsdk8.net](https://www.rcsdk8.net).

## License

MIT
