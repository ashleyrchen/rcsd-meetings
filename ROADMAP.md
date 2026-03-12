# RCSD.info Roadmap

## Calendars
- [ ] Full district calendar page (not just homepage widget) with clearer visual treatment of multi-day windows (e.g. Spring Break shown as a block, not just start date)
- [ ] Per-school calendars with school-specific events layered on top of district calendar
- [ ] iCal (.ics) subscription feeds for district and per-school calendars

## School Pages — Community & Parent Links
- [x] Parent communication platform identified per school (added to schools.json parentLinks)
  - Konstella: Roy Cloud (confirmed link), Orion (confirmed link), North Star (contact PTA), Clifford (likely, needs verification)
  - Membership Toolkit / Totem: Henry Ford
  - Email/Social: Kennedy
  - ParentSquare only: Adelante, Garfield, Hoover, McKinley, Roosevelt, Taft
- [x] SchoolMessenger absence reporting app links added to schools.json districtLinks
- [x] ParentSquare district-wide link added to schools.json districtLinks
- [ ] Surface parentLinks on school detail pages and homepage cards
- [ ] WhatsApp parent group links per school
- [ ] After-school program info affiliated by school site
- [ ] Verify Clifford Konstella link (check cliffordschoolpto.org/helpful-links)
- [ ] Get North Star Konstella signup link from PTA

## School Pages — Advisory & Special Programs
- [ ] ELAC (English Learner Advisory Committee) info per school
- [ ] DELAC (District English Learner Advisory Committee) info
- [ ] Special Education / SEPTAR info and links
- [ ] After-school programs by school site

## School Pages — Documents
- [ ] Pull Spanish-language SARCs for 2024-25 and upload to data.rcsd.info/documents/sarc/2024-25/spanish/
- [ ] Link Spanish SARCs from /escuelas/ pages (currently links to English with "(inglés)" note)
- [ ] Source and add SpEd / IEP / 504 percentages per school (IEP data now in sped-enrollment.json; 504 only available from OCR CRDC, lagging ~5 years)

## School Pages — Safety
- [ ] Pull in and link the Comprehensive Safety Plan (CSP) for each school site

## School Pages — Board Presentations
- [ ] Prominently link school site presentations on school pages (e.g. presentation decks, SPSA documents)
- [ ] Link to YouTube meeting video at the correct timestamp offset for the school's presentation
- [ ] Example: Roosevelt presentation from 2026-03-11 board meeting — deck, SPSA, and video offset

## CDE Data Pulls

### Tier 1 — High value, per-school, current
- [x] CDE Census Day Enrollment — SpEd/IEP per-grade counts (done: data/sped-enrollment.json)
- [x] CDE SPED Enrollment by Program Setting — disability categories, LRE placement (done: data/sped-categories.json)
- [ ] ELPAC Results — EL proficiency levels (1-4) per school (2023-24)
  - Source: https://caaspp-elpac.cde.ca.gov/caaspp/ (Research File List, ELPAC test type)
- [ ] ELAS/LTEL Data — Long-term English Learner counts + reclassification per school/grade (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filesltel.asp
  - Critical for equity: shows students stuck as EL for 6+ years
- [ ] Staff Race/Ethnicity — Official CDE teacher diversity per school (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filesstre.asp
  - More authoritative than local HR briefings, enables multi-year trending
- [ ] Staff Experience — New vs veteran teacher distribution per school (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filesstex.asp
- [ ] Student/Staff Ratios — Class sizes, counselor ratios per school (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filesstrat.asp
- [ ] Chronic Absenteeism (disaggregated) — Demographic breakdown beyond Dashboard headline (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filesabd.asp
  - Reveals equity gaps (e.g. 15% overall but 25% among SED students)

### Tier 2 — Valuable supplemental
- [ ] Suspension Data (disaggregated) — Demographic breakdown of discipline (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filessd.asp
- [ ] Stability Rate — Student mobility/retention rates per school (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filessr.asp
- [ ] FRPM Data — Multi-year poverty trend analysis, 14 years of history (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filessp.asp (XLSX format)
- [ ] Census Day Enrollment (full disaggregation) — Grade × race enrollment detail (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filesenrcensus.asp
- [ ] Staff Education Level — % of teachers with advanced degrees per school (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/filessted.asp
- [ ] EL by Grade and Language — EL enrollment by home language per school (2024-25)
  - Source: https://www.cde.ca.gov/ds/ad/fileselsch.asp

### Tier 3 — Lower priority or limited availability
- [ ] Physical Fitness Test (PFT/FITNESSGRAM) — 5th/7th grade fitness results per school
  - Source: https://dq.cde.ca.gov/dataquest/PhysFit/ (query tool only, no bulk download post-2019)
- [ ] CA Healthy Kids Survey (CHKS) — School climate, safety, connectedness
  - Source: https://calschls.org/reports-data/query-chks/
  - Likely district-level only for public access; per-school may require district auth
- [ ] Historical Enrollment (1981-2022) — Long-term enrollment trends
  - Source: https://www.cde.ca.gov/ds/ad/fileshistenr8122.asp
- [ ] Homeless Student Enrollment — Per-school by dwelling type (heavily suppressed)
  - Source: https://www.cde.ca.gov/ds/ad/fileshse.asp
- [ ] OCR Civil Rights Data Collection (CRDC) — Only source for per-school 504 plan counts
  - Source: https://ocrdata.ed.gov/ (most recent: 2020-21, lags ~5 years)
- [ ] Board SpEd Study Report — Detailed per-school SpEd analysis from external consultant
  - April 2024: https://go.boarddocs.com/ca/redwood/Board.nsf/files/D422AX010F7C/$file/Redwood%20City%20SD%20Special%20Education%20Study%20Report.pdf
  - May 2025 update: https://go.boarddocs.com/ca/redwood/Board.nsf/files/DGVSN2736D8B/$file/05_25%20Special%20Education%20Study%20Implementation%20Update%20-%20Board%20Presentation.pdf

## Board Meetings — Lifecycle States

A meeting progresses through distinct states, each with different data confidence:

1. **Scheduled** (weeks/months out): On governance calendar. We know the date and can provisionally describe planned topics at a high level. Calendar widget shows: date, "Board Meeting", high-level preview if available.
2. **Agendized** (Friday before Wed meeting): Public agenda posts. Now concrete what will formally be discussed. Show: agenda link, one-sentence summary of key items, any attachments.
3. **Live** (during the ~2hr meeting): Prominently display Zoom join link. This should be the most visible state — a parent checking the site during a meeting should immediately see how to join.
4. **Awaiting Recording** (0-3 days after): Meeting happened but no video yet. We know what was agendized but not what actually transpired. Show: agenda-based summary with language like "Scheduled to discuss..." rather than "Discussed...". Any attendee notes or live observations could supplement.
5. **Recorded** (2-3 days after): YouTube video posts. From detailed ASR analysis we can understand what transpired, but this is unofficial. Show: video link, AI-generated summary with caveat.
6. **Minutes Approved** (~1 month later): Formal minutes approved at a subsequent meeting. High confidence about what officially transpired. Show: approved minutes link, authoritative summary.

The calendar widget and meeting pages should reflect which state each meeting is in, and be clear about the confidence level of any summary shown.

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
