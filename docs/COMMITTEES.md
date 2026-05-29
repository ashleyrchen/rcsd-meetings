# RCSD Committees Platform

Sequenced, multi-stage plan for modeling district and school committees on rcsd.info.
CBOC (Citizens' Bond Oversight Committee) is the first instance — and currently the only
committee with video recordings. This doc is the source of truth for the effort; strike
through each stage as it merges.

## Why

The site already covers Board of Trustees meetings end-to-end (agenda, video, transcript,
bilingual pages). RCSD also runs standing committees — **CBOC** and **DELAC** (district-level),
**ELAC** and **SSC** (per-school) — whose meetings, members, and (for CBOC) recordings have no
home on the site. This effort introduces a **generic committee model** so any committee can be
indexed sparsely (just a name) and enriched over time (homepage, members, chair, email,
past/future meetings, agendas, minutes, recordings + transcripts).

## Design

- **One JSON file per committee**: `data/committees/<id>.json`. Builders glob the directory.
  Cross-committee joins are rare, so no monolithic registry.
- `<id>` = committee instance. District: `cboc`, `delac`. Per-school: `<type>-<schoolslug>`
  (e.g. `ssc-orion`, `elac-orion`).
- **Sparse by default**: only `id`, `type`, `scope`, `nameEn`, `nameEs` are required; everything
  else is optional and rendered only when present. Never fabricate members/chairs/emails.
- **Recordings reuse the board pipeline at the video-ID layer** (AssemblyAI cache is keyed by
  YouTube video ID → no collision with board). Only the date-keyed transcript/slim/R2 layer is
  namespaced via `transcriptKey = "<id>-<date>"` → R2 `transcripts/<id>-<date>.json` (+ `-es`).
- **`meetings[]` recordings are discovered, not hand-typed**: `build-committees.mjs` merges
  committee-tagged entries from `data/youtube-index.json` into each committee file and enriches
  `hasTranscript`/`duration` from the AAI cache. Curated fields (metadata, future scheduled
  meetings, agendas/minutes) are preserved.

### Schema — `data/committees/<id>.json`

```json
{
  "_metadata": { "description": "...", "source": "...", "lastUpdated": "YYYY-MM-DD" },
  "id": "cboc", "type": "cboc", "scope": "district", "school": null,
  "nameEn": "...", "nameEs": "...", "shortName": "CBOC",
  "descriptionEn": "...", "descriptionEs": "...",
  "homepage": null, "email": null, "chair": null,
  "members": [],                          // [{ name, role, since }]
  "videoTitleMatch": ["Bond Oversight"],  // YouTube discovery hint
  "meetings": [
    { "date": "2026-04-30", "status": "past", "time": null, "location": null,
      "youtube": "PnOi-XcblAE", "transcriptKey": "cboc-2026-04-30",
      "hasTranscript": true, "duration": "1h 12m", "durationSeconds": 4320,
      "agendaPdf": null, "minutesPdf": null, "descriptionEn": null, "descriptionEs": null }
  ]
}
```

## Stages

- [ ] **Stage 1 — Framework + CBOC end-to-end.** Generic committee data model; `cboc.json`
  (metadata + discovery) and `delac.json` (scheduled dates migrated from
  `committee-meetings.json`); generalized YouTube discovery (`kind` field, dedup by `(kind,date)`)
  with board build protected; `build-committees.mjs` + shared `scripts/lib/aai.mjs`; generalized
  transcription (CBOC bond-context prompt) + all 13 CBOC videos transcribed; namespaced slim + ES
  transcripts; bilingual rendering (`/committees/`, `/committees/<id>/`, `/committees/<id>/<date>/`
  + `/comites/...`); district-page nav, sitemap, OG images; ICS migration to `data/committees/*.json`;
  pipeline wiring; docs. Deploy.
- [ ] **Stage 2 — Per-school SSC migration.** `data/ssc-meetings.json` → `data/committees/ssc-<school>.json`;
  update `convert-ssc-docs.mjs`; SSC committee pages; cross-link from school pages.
- [ ] **Stage 3 — ELAC + remaining committees, sparse stubs.** Verify a name-only committee renders cleanly.
- [ ] **Stage 4 — Enrichment.** Members, chairs, emails, homepages, agendas, minutes as citable data lands.

## Conventions

- Routes: EN `/committees/` ↔ ES `/comites/`. ASCII slugs.
- Bilingual: `es_US` og:locale, `es-MX` date formatting, sixth-grade colloquial Spanish (keep
  borrowed terms families use: "CBOC", "video", "blog").
- Provenance: every data file carries a `_metadata` block. AI-derived content labeled as such.
- Never squash-merge.
