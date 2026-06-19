# AGENTS.md

Guidance for coding agents working in this repository.

## Scope

This project scrapes public BoardDocs meeting data using district-specific YAML configuration. The active configuration is `config/boarddocs/wvm.yaml` for the West Valley-Mission Community College District Board of Trustees and Citizens' Bond Oversight Committee.

The current project does not use Simbli, YouTube, recorded meeting media, transcription, a static website, or RCSD-specific datasets.

## Conventions

- Keep `scripts/scrape-boarddocs.mjs` district-neutral. Put portal URLs, committee IDs, cutoff dates, and output paths in YAML.
- Add a thin district wrapper when a convenient no-argument command is useful.
- Preserve direct links to official BoardDocs sources in generated records.
- Treat generated meeting data as public records, but verify consequential claims against the official source.
- Use ES modules, two-space indentation, and single quotes.
- Run `npm test` before committing.
- Never squash merge; preserve history with merge commits.
