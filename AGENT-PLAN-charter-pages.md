# Agent Plan — Charter School Pages

**Branch:** `charter-pages`
**Worktree:** `~/dev/rcsd/rcsd.info-charter-pages`
**Tracking ROADMAP entry:** "Charter School Pages" (added 2026-04-17)

## Goal

Build `/charters/{slug}/` pages for the three RCSD-authorized charter schools (Connect Community Charter, KIPP Excelencia Community Prep, Rocketship Redwood City Prep) surfacing their financial documents and RCSD review letters already landing in board packets.

## MVP scope

- `data/charters.json` — entity metadata (slug, name, address, grades, enrollment, website, authorizer status, CDS code) sourced from CDE authoritative data
- `scripts/build-charters.mjs` — generates EN + ES pages
- EN pages at `docs/charters/{slug}/index.html` + `docs/charters/index.html`
- ES pages at `docs/escuelas-charter/{slug}/index.html` + `docs/escuelas-charter/index.html`
- Each page shows:
  - Header: name, address, grades, enrollment, website, authorizer
  - Financial docs timeline (all years): adopted budgets, 1st/2nd interims, unaudited actuals, annual audits
  - Each financial doc paired with RCSD's review letter
  - Links back to board meetings where each item was discussed (already in document-index)
- Link from district page + homepage
- Update sitemap.xml + robots.txt
- Update README data sources table; add pipeline entry in CLAUDE.md

## Out of scope (future ROADMAP)

- CDE data pulls for charters (demographics, CAASPP, chronic absenteeism)
- PTO data, bell schedules, parent links (not the same entity shape as RCSD schools)
- Bilingual rich content — Spanish boilerplate only at MVP; deep translation later
- KIPP Excelencia Fair Oaks site — track separately once Prop 2 CSFP funding resolves

## Build sequence

1. Research charter metadata from CDE (parallel subagent)
2. Read existing `build-schools.mjs` patterns to understand html-parts + styling (parallel subagent)
3. Write `data/charters.json` with verified entity data
4. Build extractor: filter `data/document-index.json` for charter-related docs (title-based match: Connect, KIPP, Rocketship)
5. Write `scripts/build-charters.mjs`
6. Add to `package.json` and `scripts/run-pipeline.mjs`
7. Link from district + homepage + sitemap
8. Run build, spot-check
9. Update README + CLAUDE.md
10. Commit, push, open PR
11. Deploy to Cloudflare Pages
12. Verify live
