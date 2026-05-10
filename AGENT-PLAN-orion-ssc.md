# Orion SSC 2025-26 — Agent Plan

## Context

The Orion parent SSC shared the 2025-26 working folder (agendas, minutes, candidate statements, school budget/climate data) via Google Drive:
https://drive.google.com/drive/folders/1ZM8gRkBjer18QwlvNG_pEKOYmgFmwRZa

Local copy: `/Users/dew/Downloads/SSC Orion 25-26SY-20260421T221652Z-3-001.zip` → extracted to `/tmp/orion-ssc/SSC Orion 25-26SY/`.

We already have `data/ssc-membership.json` (roster only). This adds per-meeting agenda/minutes documents as a new data category.

## Scope (first pass — Orion 2025-26 only)

1. Convert .docx agendas/minutes to PDF via pandoc → HTML → headless Chromium.
2. Stage normalized-name PDFs under `artifacts/documents/ssc/orion/2025-26/` (ISO-date naming).
3. Add `data/ssc-meetings.json` indexing the meetings with structured fields.
4. Extend `scripts/build-schools.mjs` to render meeting list on the Orion school page.
5. Upload PDFs to R2 under `documents/ssc/orion/2025-26/`.
6. Update README, data-schema.md, CLAUDE.md.
7. Commit on `feat/orion-ssc-25-26` and open PR.

## Out of scope (future)

- Other schools' SSC meetings (pattern established, can be extended later).
- Candidate statements / new-member intros (not indexed; could link as auxiliary docs).
- Data attachments (PTO budget, climate data, needs assessment, parcel tax) — already covered by existing SPSA and school-report pipelines.
- AI summaries of minutes.

## File naming

- `2025-09-24-agenda.pdf`
- `2025-09-24-minutes.pdf`
- etc.

## Source URL

Meeting documents original source: Google Drive folder above. Recorded in `_metadata` block of `ssc-meetings.json`.

## PR

`feat/orion-ssc-25-26` → main, Cloudflare Pages auto-deploys.
