# West Valley-Mission BoardDocs Data

An open-data scraper for public meetings of the West Valley-Mission Community College District. It currently collects BoardDocs agendas, agenda-item text, and attachments for:

- Board of Trustees
- Citizens' Bond Oversight Committee (CBOC)

It also indexes the official Santa Cruz County 2018 Measure W voter guide,
including the ballot question, arguments and rebuttals, impartial analysis, tax
rate statement, full measure text, election resolution, and contact information.

The project does not currently ingest Simbli, meeting recordings, YouTube videos, audio, or transcripts.

## Requirements

- Node.js 22 or newer
- npm

Install the single runtime dependency:

```bash
npm ci
```

## Scrape West Valley-Mission

Run every committee in the WVM configuration:

```bash
npm run scrape:wvm
```

Run one committee:

```bash
npm run scrape:wvm -- --committee board
npm run scrape:wvm -- --committee cboc
```

Backfill agenda-item bodies in an existing output file:

```bash
npm run scrape:wvm -- --bodies
```

Outputs are written to the paths declared in [`config/boarddocs/wvm.yaml`](config/boarddocs/wvm.yaml).

Refresh the Measure W voter-guide records:

```bash
npm run scrape:voter-guide
```

The structured output is written to `data/wvm-measure-w-voter-guide.json` and is
included in the generated site's full-text search.

## Add Another District

Create another YAML file under `config/boarddocs/`:

```yaml
district: Example District
baseUrl: https://go.boarddocs.com/ca/example/Board.nsf
cutoffDate: "20200101"

committees:
  board:
    name: Board of Trustees
    id: COMMITTEE_ID
    output: data/example-boarddocs.json
```

Then invoke the generic launcher:

```bash
npm run scrape:boarddocs -- --config config/boarddocs/example.yaml
```

The scraper validates required fields, HTTPS portal URLs, cutoff-date format, committee mappings, and output paths before contacting BoardDocs. With no `--committee` option, every configured committee is scraped in YAML order.

## Data Provenance

BoardDocs is the authoritative source for the scraped meeting records. Each configuration records the official portal URL, committee ID, cutoff date, and destination file. Generated records retain direct BoardDocs links for meetings, agenda items, and attachments.

This repository is not an official West Valley-Mission Community College District publication. Verify consequential information against the linked BoardDocs source.

## Upstream History

This project is a fork of [`dweekly/rcsd-meetings`](https://github.com/dweekly/rcsd-meetings). RCSD-specific data, generated pages, Simbli ingestion, video processing, and transcription were removed from the current tree for the WVM use case. Their history remains available through Git and the `upstream` remote.

## Development

```bash
npm test
```

The project uses ES modules, two-space indentation, and single quotes in JavaScript.

## License

MIT
