# rcsd-info Plugin for Claude Code

Query Redwood City School District data from Claude Code. Covers all 12 RCSD schools (TK-8).

## What it does

Ask natural language questions about RCSD and get answers backed by real data:

- **School info** — hours, enrollment, address, principal, programs, contact
- **Live lunch menus** — fetches today's menu from the HealthePro API
- **Calendar** — is there school today? when's the next holiday?
- **Board meetings** — summaries, school-specific agenda items, video links with timestamps
- **Demographics** — EL%, FRL%, race/ethnicity breakdowns, CAASPP test scores
- **Special education** — IEP rates, disability categories, LRE placement
- **Parent resources** — Konstella, ParentSquare, PTO info, absence reporting
- **Cross-data analysis** — compare schools, correlate spending with outcomes, track board topics over time

## Install

### From GitHub (recommended)

```bash
# 1. Add the marketplace
/plugin marketplace add dweekly/rcsd-meetings

# 2. Install the plugin
/plugin install rcsd-info@rcsd-info
```

### From local directory (development)

If the repo is already cloned locally:

```bash
# Add the repo root as a marketplace (where .claude-plugin/marketplace.json lives)
/plugin marketplace add /Users/dew/dev/rcsd/rcsd.info

# Install the plugin
/plugin install rcsd-info@rcsd-info
```

Or test directly without installing:

```bash
claude --plugin-dir /Users/dew/dev/rcsd/rcsd.info/plugin
```

### Clone the data repo (recommended for full functionality)

The plugin reads JSON data files directly from disk for fast, flexible queries. Clone the repo for best results:

```bash
git clone git@github.com:dweekly/rcsd-meetings.git ~/dev/rcsd/rcsd.info
```

Without the local repo, the plugin falls back to fetching from `https://data.rcsd.info/json/` which is slower and doesn't support direct file reading for complex cross-file analysis.

### Verify installation

After installing, ask Claude any RCSD question to confirm the skill activates:

```
What time does school start at Orion?
Compare math scores across all RCSD schools.
What has the board discussed about budget this year?
```

## Family config (optional)

Create `~/.claude/rcsd-info.local.md` to personalize queries:

```yaml
---
children:
  - name: Jill
    grade: 2
    school: orion
    program: Mandarin Immersion
---
```

Then ask: "What's Jill having for lunch tomorrow?"

## How it works

Unlike traditional MCP tools that pre-build a fixed set of query endpoints, this plugin uses a **skill-based approach**: it teaches Claude about the data schemas, file locations, and analysis patterns so Claude can read the JSON files directly and reason over them. This enables arbitrary queries — comparisons, joins across datasets, temporal analysis — that no fixed API could anticipate.

The only script-based tool call is for **live lunch menus** (HealthePro API), since that requires real-time external data.

## Scripts

| Command | What it does |
|---------|-------------|
| `node plugin/skills/rcsd-data/scripts/lunch-menu.mjs orion tomorrow` | Fetch live lunch menu |
| `node plugin/skills/rcsd-data/scripts/query-school.mjs orion --sped --meetings` | Quick school profile |
| `node plugin/skills/rcsd-data/scripts/query-school.mjs --calendar 2026-03-13` | Check school day |

## Data sources

- **schools.json** — manually curated from district sources
- **SARC data** — California School Accountability Report Cards (2024-25, covering 2023-24)
- **SpEd data** — CDE Census Day Enrollment & Program Setting (2024-25)
- **Calendar** — Board-approved instructional calendar
- **Board meetings** — 190 meetings scraped from BoardDocs/Simbli, AI-generated summaries
- **Lunch menus** — Live from HealthePro public API (no auth required)

## Updating

```bash
/plugin marketplace update rcsd-meetings
```

## Uninstalling

```bash
/plugin uninstall rcsd-info@rcsd-info
/plugin marketplace remove rcsd-meetings
```
