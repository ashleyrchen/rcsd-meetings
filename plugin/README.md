# rcsd-info Plugin for Claude Code

Query Redwood City School District data from Claude Code. Covers all 12 RCSD schools (TK-8).

## What it does

- **School info** — hours, enrollment, address, principal, programs, contact
- **Live lunch menus** — fetches today's menu from the HealthePro API
- **Calendar** — is there school today? when's the next holiday?
- **Board meetings** — summaries, school-specific agenda items, video links
- **Demographics** — EL%, FRL%, race/ethnicity breakdowns
- **Special education** — IEP rates, disability categories, LRE placement
- **Parent resources** — Konstella, ParentSquare, PTO info, absence reporting

## Install

```
/plugin marketplace add dweekly/rcsd-meetings
/plugin install rcsd-info@rcsd-info
```

> **Note:** This plugin reads data files from the rcsd.info repository. Clone the repo first for full functionality.

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

## Scripts

| Command | What it does |
|---------|-------------|
| `node plugin/skills/rcsd-data/scripts/query-school.mjs orion --sped --meetings` | Full school profile |
| `node plugin/skills/rcsd-data/scripts/query-school.mjs --calendar 2026-03-13` | Check school day |
| `node plugin/skills/rcsd-data/scripts/lunch-menu.mjs orion tomorrow` | Fetch lunch menu |

## Data sources

- **schools.json** — manually curated from district sources
- **SARC data** — California School Accountability Report Cards
- **SpEd data** — CDE Census Day Enrollment & Program Setting (2024-25)
- **Calendar** — Board-approved instructional calendar
- **Board meetings** — Scraped from BoardDocs, summaries from meeting recordings
- **Lunch menus** — Live from HealthePro public API (no auth required)
