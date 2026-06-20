# AGENTS.md

Guidance for coding agents working in this repository.

## Scope

This project scrapes public BoardDocs meeting data using district-specific YAML configuration. The active configuration is `config/boarddocs/wvm.yaml` for the West Valley-Mission Community College District Board of Trustees and Citizens' Bond Oversight Committee.

The current project does not use Simbli, YouTube, recorded meeting media, transcription, or RCSD-specific datasets.

## Repository layout

Work happens in a small source surface. Everything else is generated or
downloaded and should not be hand-edited or searched.

Source (edit these):
- `scripts/` — scraper, site builder, helpers.
- `config/` — district YAML.
- `assets/` — site CSS/JS, read by the builder.
- `.github/workflows/` — CI and Pages deploy.
- `package.json` and the top-level docs.

Generated or downloaded (do not edit):
- `docs/` — built by `npm run build:site`; gitignored and deployed by the
  Pages workflow rather than committed.
- `data/attachments/**` — downloaded binaries; gitignored. Only
  `data/attachments/manifest.json` is tracked.
- `data/wvm-*.json` — large scrape caches; tracked because the build reads
  them, but excluded from search via `.ignore` and from diffs via
  `.gitattributes`.
- `measure-w-records/`, `report-examples/` — local archives; gitignored.

## Conventions

- Keep `scripts/scrape-boarddocs.mjs` district-neutral. Put portal URLs, committee IDs, cutoff dates, and output paths in YAML.
- Add a thin district wrapper when a convenient no-argument command is useful.
- Preserve direct links to official BoardDocs sources in generated records.
- Treat generated meeting data as public records, but verify consequential claims against the official source.
- Use ES modules, two-space indentation, and single quotes.
- Run `npm test` before committing.
- Never squash merge; preserve history with merge commits.
