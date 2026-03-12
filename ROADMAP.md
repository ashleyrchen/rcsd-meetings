# RCSD.info Roadmap

## Calendars
- [ ] Full district calendar page (not just homepage widget) with clearer visual treatment of multi-day windows (e.g. Spring Break shown as a block, not just start date)
- [ ] Per-school calendars with school-specific events layered on top of district calendar
- [ ] iCal (.ics) subscription feeds for district and per-school calendars

## School Pages — Community & Parent Links
- [ ] Parent communication platform links per school (Konstella, ParentSquare, etc. — varies by site)
- [ ] WhatsApp parent group links per school
- [ ] SchoolMessenger absence reporting links per school
- [ ] After-school program info affiliated by school site

## School Pages — Advisory & Special Programs
- [ ] ELAC (English Learner Advisory Committee) info per school
- [ ] DELAC (District English Learner Advisory Committee) info
- [ ] Special Education / SEPTAR info and links
- [ ] After-school programs by school site

## School Pages — Safety
- [ ] Pull in and link the Comprehensive Safety Plan (CSP) for each school site

## School Pages — Board Presentations
- [ ] Prominently link school site presentations on school pages (e.g. presentation decks, SPSA documents)
- [ ] Link to YouTube meeting video at the correct timestamp offset for the school's presentation
- [ ] Example: Roosevelt presentation from 2026-03-11 board meeting — deck, SPSA, and video offset

## Board Meetings — School Relevance
- [ ] Better summarize school-relevant meetings: "What was discussed/approved in this board meeting (per the minutes) that could impact $SCHOOL?"
- [ ] For meetings without minutes: "What was on the agenda that could impact $SCHOOL?"
- [ ] Surface these per-school summaries on school pages

## Board Meetings — Transcription & Chapters
- [ ] Replace YouTube auto-captions with proper ASR (AssemblyAI Universal 3 Pro)
- [ ] Fix timestamp offset alignment (currently really bad)
- [ ] Generate "chapters" linking agenda items to meeting timestamps: "Agenda item 8.2 begins discussion at 18:42 and the discussion is summarized thusly..."
- [ ] Diarized speaker identification in transcripts

## Agent / API Layer
- [ ] Publish a Claude Code plugin/skill and/or MCP server that lets parent-facing agents query rcsd.info structured data (e.g. "What's Jill having for lunch tomorrow?" → agent knows Jill is 2nd grade at Orion → queries lunch menu API)
- [ ] Structured lunch menu data per school site, queryable by date
- [ ] Subscribable lunch calendar (iCal .ics) for overlay onto Apple Calendar / Outlook / Google Calendar
- [ ] OpenAPI / JSON API endpoints on data.rcsd.info for school info, calendars, menus, meetings

## Data Attribution (in progress)
- [ ] Growth data (ELA/Math growth %) — find and link to the actual source document (currently attributed to "CDE Growth Model" but original data came from an untracked `hr-data-briefing-2026-03.md`)
- [ ] Pull CDE growth model spreadsheet (growthmodeldownload2025.xlsx) to check for useful RCSD data not yet represented
