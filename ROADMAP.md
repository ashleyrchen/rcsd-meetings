# RCSD.info Roadmap

## Calendars
- [ ] Full district calendar page (not just homepage widget) with clearer visual treatment of multi-day windows (e.g. Spring Break shown as a block, not just start date)
- [ ] Per-school calendars with school-specific events layered on top of district calendar
- [ ] iCal (.ics) subscription feeds for district and per-school calendars

## School Pages — Community & Parent Links
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

## School Pages — Board Presentations
- [ ] Kennedy and Garfield have not presented since 2023-24 — flag or investigate
- [ ] Scrape BoardDocs back to ~March 2023 to capture the missing Garfield and Kennedy presentations

## District & School Committees
- [ ] Citizens' Bond Oversight Committee (CBOC) — membership, meeting dates, agendas, minutes
  - Measure S bond committee; Alan Hansen approved as taxpayer rep Dec 2025
  - Should have its own page or section on district page
- [ ] School Site Councils (SSCs) — scrape and index meeting agendas, minutes, and materials per school
  - Currently "Coming soon" on school pages
  - SSCs approve CSSPs and SPSAs; membership is public record
  - Subject to Greene Act (Ed Code 35147): 72-hour agenda posting, open meetings, 3-year record retention
  - Known sources: Taft has Google Docs (https://docs.google.com/document/d/1YsMiY6CFhrxRX9ploZViPZqy4UigzYUTZMVYTf53VdI/); Kennedy has Sept/Oct 2023 on website; Orion and MIT have placeholder pages only
  - Most schools have no publicly visible SSC documentation
- [ ] DELAC (District English Learner Advisory Committee) — scrape and index meeting agendas, minutes, presentations
  - District page: rcsdk8.net DELAC page has 2025-26 schedule (9 meetings), but only Aug 2025 docs posted
  - Aug 2025 meeting has agenda, minutes, and presentation in both EN and ES — good model
  - Need to get historical meeting documents and ongoing minutes
- [ ] ELAC (English Learner Advisory Committee) — per-school meeting agendas, minutes, materials
  - Required at schools with 21+ EL students (5 CCR 11308); all RCSD schools likely qualify
  - Subject to Greene Act like SSCs
  - Taft is only school with any ELAC info on website (meets 5x/year, one date listed)
  - No other school has visible ELAC documentation
- [ ] District Advisory Committee (DAC) — LCAP advisory body
- [ ] Special Education Community Advisory Committee (CAC/SEPTAR)
- [ ] PTO/PTA board members and meeting schedules per school

## CDE Data Pulls

### Tier 1 — High value, per-school, current
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

## Board Meetings — Public Engagement Tip Boxes
- [ ] **"So you'd like to speak at a board meeting?"** — tip box explaining how to submit a speaker card (online form links for EN/ES, in-person process, time limits, what to expect, Zoom raise-hand for remote)
- [ ] **"So you'd like a topic discussed at a future board meeting?"** — tip box explaining how to request agenda items (contact board members/superintendent, submit written communications, attend public comment to raise the topic, "Other Business/Suggested Items for Future Agenda" section)
- Should appear on the meetings page as collapsible cards near the top
- Bilingual (English + Spanish)

## Board Meetings — Historical Data
- [ ] Scrape BoardDocs back to ~March 2023 (currently starts March 2024)
  - Would capture: Garfield Nov 2023 presentation, Kennedy Nov 2023 presentation, full 2023-24 school year
  - BoardDocs is client-side Angular; need to hit API endpoints or use headful browser
  - Enables multi-year trending of board actions per school
- [ ] Pre-April 2020 BoardDocs backfill (agenda-only, no video) — 2019-2020 school year meetings exist in BoardDocs but YouTube recordings only start April 2020 (first COVID virtual meeting)
- [ ] Add "comprehensive from" statement on meetings page — clearly state April 2020 as start of full coverage (agenda + video + transcript), with agenda-only for earlier meetings if/when backfilled
- [ ] Backfill board packet PDFs for pre-June 2025 meetings — currently only 22 recent meetings have downloaded attachments; 167 older meetings have metadata links but no archived PDFs. BoardDocs links may break; good candidate for trogdor batch job

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
- [x] Replace YouTube auto-captions with proper ASR (AssemblyAI Universal 3 Pro) — 144 meetings transcribed
- [x] Generate chapter markers linking formal agenda items to meeting timestamps with phase data (opened, presentation, publicComment, discussion, vote)
- [x] Diarized speaker identification in transcripts (AAI speaker diarization + LLM speaker-to-name mapping)
- [x] Individual public comment speaker extraction with names, timestamps, and summaries
- [x] Formal agenda structure with hierarchical item labels (e.g., 7.1, 11.3) from board memos and BoardDocs
- [x] Web transcript viewer — full-width sticky YouTube player with scrollable diarized transcript, bidirectional sync, search with highlighting
- [x] Downloadable transcript JSON per meeting — slim format on R2 at transcripts/{date}.json
- [ ] Unified meeting page with tab selector: Transcript / Agenda / Minutes — all synced to video playback (click agenda item 9.3 → scrub video to that timestamp; agenda highlights current item during playback)
- [ ] Spanish translation of transcripts

## Board Meetings — Detailed summaries from transcripts
Build a pipeline for rich per-meeting summaries (inputs already in place: AAI transcripts + formal agenda + minutes + chapter markers):
- [ ] Per-agenda-item discussion summary (what was said, by whom, key points raised)
- [ ] Ordered by actual discussion sequence (not agenda order); note agenda changes proposed/approved at the top
- [x] Each public comment: who spoke + summary of remarks (done via chapter markers extraction)
- [ ] Spanish-language public comments: capture interpreter's English translation alongside original
- [ ] EN and ES output, written at sixth-grade reading level (Californian colloquial Spanish for ES)
- [ ] District-specific terms (LCAP, CAASPP, unduplicated pupil, SARC, etc.) get hover-over/clickable inline glossary definitions
- [ ] AI-generated content clearly labeled
- Open questions: glossary via `<abbr title>` vs popover component? Define terms once per page or per first-use per section?

## Agent / API Layer
- [ ] **Enhanced MCP server** — add `get-meeting-details` tool returning transcript, agenda items with PDF download links, timecode mappings, minutes, and source links (BoardDocs/Simbli/YouTube) for a given meeting date
- [ ] **ChatGPT App** via OpenAI Apps SDK (https://developers.openai.com/apps-sdk) — a "RCSD Assistant" that non-technical parents can use directly without knowing what MCP is; backed by the data.rcsd.info JSON API
- [ ] **MCP docs in Spanish** — translate /mcp/ page to match the bilingual pattern of the rest of the site
- [ ] Per-child teacher/homeroom config in family settings — enables teacher-aware queries (field trips, homework, class-specific events)
- [ ] Per-school teacher roster data — enables "Who teaches 3rd grade MI at Orion?" queries
- [ ] Subscribable lunch calendar (iCal .ics) for overlay onto Apple Calendar / Outlook / Google Calendar
- [ ] OpenAPI / JSON API endpoints on data.rcsd.info for school info, calendars, menus, meetings
- [ ] Publish plugin to npm / Claude Code plugin registry for easy installation
- [ ] **"Dial the District" voice agent** — two phone numbers (English and Spanish) that parents can call to ask questions about the district and get spoken answers. Use **Gemini 3.1 Flash Live** (native voice-to-voice, no STT→LLM→TTS pipeline, inherently multilingual). Flash Live scores 90.8% on ComplexFuncBench Audio (multi-step function calling in voice) so it can call district data tools natively during conversation. Available via Gemini Live API in Google AI Studio (preview). Architecture: Gemini 3.1 Flash Live + function declarations mirroring MCP tool schemas + Twilio SIP trunk or LiveKit for telephony. Audio is SynthID-watermarked. Separate EN/ES assistant configs with language-appropriate system prompts. Ref: https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-live/
- [ ] **WhatsApp bot** — same concept as the phone agent but over text. Parents text questions to a WhatsApp number and get answers from district data. Lower barrier than MCP setup, reaches parents where they already are. Could use the WhatsApp Business API + Claude.

## Key Parties Roster
- [ ] Build a "who's who" page: district cabinet/staff, board members (historical), vendors, unions (RCTA, CSEA, RCAA), consultants
- [ ] Neutral, judgement-free descriptions of roles and tenures (date ranges)
- [ ] Link each party to relevant documents (e.g., contract approvals for vendors, tentative agreements for unions)
- [ ] Cross-reference from meeting items to party roster entries

## Warrant Register Analysis
- [ ] Scrape all warrant registers (ratification of warrants) from board meeting attachments
- [ ] Parse payee names, amounts, dates, fund sources
- [ ] Aggregate: which entities have been paid how much over what time period
- [ ] Surface per-vendor spending trends and per-fund breakdowns

## Document Index
- [x] Unified document index from all meeting attachments (data/document-index.json) — 1,000+ docs classified
- [x] Ontology: budget, lcap, spsa, sarc, school-report, resolution, policy, tax (parcel/bond), sped, english-learners (elac/delac/data), early-ed (preschool/tk), labor (rcta/csea), compliance, safety
- [x] Multi-school tagging per document
- [ ] Surface document index on meetings page and school pages
- [ ] Document timeline/history view per type (e.g., all adopted budgets chronologically)

## Automation & Infrastructure
- [ ] **Trogdor cron automation** — move scraping pipeline to trogdor (beefy Linux server with CUDA) on a schedule:
  - Simbli agenda scrape (daily or 2x/week)
  - YouTube channel index (daily)
  - Board packet download (daily)
  - AssemblyAI transcription (triggered on new video detection)
  - Timestamp mapping via Claude (after transcription)
  - Site rebuild + `wrangler pages deploy` (after any data change)
- [ ] **Screencap demo** — narrated screen recording showing: homepage, clicking into a meeting, transcript click-to-seek, Spanish toggle, chapter markers, MCP query. For embedding on the site and social sharing.

## Data Attribution (in progress)
- [ ] Growth data (ELA/Math growth %) — find and link to the actual source document (currently attributed to "CDE Growth Model" but original data came from an untracked `hr-data-briefing-2026-03.md`)
- [ ] Pull CDE growth model spreadsheet (growthmodeldownload2025.xlsx) to check for useful RCSD data not yet represented
