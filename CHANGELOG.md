# Changelog

What changed on [rcsd.info](https://rcsd.info) and when — a plain-language history of the site for parents, journalists, and contributors.

> Entries before 2026-06-10 (when this file was created) were reconstructed from
> git history (`git log --date=short --pretty='%ad %h %s' --first-parent main`)
> and merged pull requests; PR numbers are cited where they exist. The repository
> began on 2026-03-04 as an extraction of earlier board-meeting pipeline work
> into a standalone public project.

*Fresh as of 2026-06-10.*

## 2026-06

- **Jun 10** — **Every board policy got its own page, in both languages.** The single-page policies browser became a light index (number, title, one-sentence AI summary) linking to 1,238 individual policy pages with clickable cross-references. Full policy text machine-translated to Spanish for 618 of 619 policies (each page states the English Simbli version is the official, binding one). Eleven exhibit policies that Simbli stores as embedded PDFs were captured and text-extracted; the twelfth (6174-E, English Learner education) turned out to be a blank PDF on the district's own portal.

- **Jun 10** — **Blog: "A big June tune-up (and two mistakes to own up to)"** — the fix sprint explained for families in both languages, including the doubled English Learner counts and the 22 repaired Spanish transcripts, with a warning to re-pull any EL numbers cited before June 10.
- **Jun 10** — **Site-wide review fix sprint** (#34). Four parallel audits of the live site (data, English+Spanish UX on desktop and mobile, accessibility/SEO, and the AI-agent interface) drove a 13-commit fix wave. Highlights: 22 corrupted Spanish transcripts repaired live; a template bug fixed that silently truncated long transcript paragraphs on every meeting page; a new "Who Teaches Here / ¿Quiénes enseñan aquí?" teacher-demographics section on school pages; a Spanish board-policies browser at `/politicas/` with all 619 policy titles translated; mobile navigation no longer clips the search box off-screen at tablet widths; stronger color contrast throughout; honest "top 20 of N" search counts; the AI interface (MCP server) grew from 10 to 14 tools (trustees, document finder, meeting list, transcript search); a pipeline bug that doubled Long-Term English Learner counts was found and fixed at the source; and three-months-stale document indexes were refreshed through June 2026 (+557 attachment links, +255 searchable documents).
- **Jun 10** — **Security hardening** (#35). Resolved all open GitHub code-scanning alerts and Dependabot advisories: cross-site-scripting fixes on the policies and schools pages, HTML-sanitizer fixes in the scrapers (with 14 new regression tests that run in CI), locked-down CI workflow permissions, and dependency updates.
- **Jun 5** — **Board of Trustees on the district page** (#33): the five elected trustees with photos, trustee areas, terms, officer roles, school assignments, and email, plus the superintendent transition, cabinet, and directors. Also made the site navigation usable on mobile.
- **Jun 1** — **Search reaches the older meeting archive** (#28): documents embedded in BoardDocs agenda items (April 2020 – June 2025) are now indexed; a blog post announced site-wide search (#29).
- **Jun 1** — **Search-engine monitoring** (#31): an automated Google Search Console report now tracks how well pages are indexed and found. Also an HTML-sanitizer security fix (#30).
- Routine ingests: the June 10, 2026 board meeting agenda was added June 5.

## 2026-05

- **May 31** — **Site-wide bilingual search launched** (#25). A search box in the nav plus dedicated results pages at `/search` and `/buscar` (Pagefind), where English pages search only the English corpus and Spanish pages only the Spanish one. Search also returns board documents directly by title — a query like "facilities master plan" links straight to the PDF (#26), including documents linked from agenda memos but hosted off the board portal (#27). Plus routine dependency bumps (#20).
- **May 29–30** — **Committees section launched** (#21–#24): pages for district committees, starting with the Citizens' Bond Oversight Committee (CBOC) — meetings, recordings, transcripts, AI-generated summaries, bylaws, and annual reports, in both languages.
- **May 23–25** — **Subscribable meeting calendars**: iCal feeds that import cleanly into Google Calendar, a compact upcoming-meetings view, and Schema.org metadata fixes so search engines correctly read school and meeting pages.
- **May 24** — **Board policies browser launched**: all 619 board policies, bylaws, and regulations scraped from the district's policy portal into an interactive browser linked from the district pages, each policy carrying a link back to its official source. AI assistants gained matching `list-policies` / `get-policy` tools.
- **May 21–22** — **Pipeline automation**: scheduled GitHub Actions now discover and ingest new board meetings automatically, with caching so nothing is re-downloaded, and transcripts restore from the public CDN without credentials.
- **May 11–12** — **Social-media preview cards** (#18): every page gets its own Open Graph image, with Spanish-language cards for Spanish pages. Also recovered three agendas an old scraper cap had truncated.
- **May 10** — Orion's 2025-26 School Site Council agendas and minutes indexed (#13); sortable columns on the schools table; May 13 board packet PDFs downloaded; dependency advisories closed.
- **May 8** — **Agenda scraping fully automated**: Simbli agendas now come straight from the portal's APIs (previously a manual-assist step); the May 13, 2026 agenda landed with 121 attachments. The budget page clarified the Supplemental & Concentration entitlement and added a fund overview.
- Routine ingests continued: May 13 and May 27 board meetings (video, transcript, Spanish translation).

## 2026-04

- **Apr 20–21** — **Charter school pages launched** (#9): profiles for the three charter schools operating within district boundaries, plus a refactored `/schools/` index; announced in a blog post (#11). AI meeting answers got richer with per-item staff memo bodies (#10). Dependencies refreshed (#2, #4, #8, #12).
- **Apr 22–24** — School data corrections: grade spans synced to the district's official site (Garfield is TK-8, not K-5), preschool treated as its own program, and school growth data rebuilt from board presentations (i-Ready Expected Growth). The April 22 meeting video and transcript were added.
- **Apr 13** — **More school-level state data**: School Site Council membership extracted from each school's improvement plan (#6), plus CDE data on chronic absenteeism, long-term English learners, staff diversity, teacher experience, and staffing ratios (#7).
- **Apr 2** — The Claude Code plugin was redesigned around a data-analyst skill instead of an MCP-first approach.
- Routine ingests: April 1 meeting video; April 22 meeting agenda.

## 2026-03

- **Mar 4** — **Site launch.** First public release: 57 board meetings, 1,122 agenda items, and 694 video timestamps compiled from Simbli, BoardDocs, and YouTube; English and Spanish district summary pages; meeting documents hosted on a public archive; community files (code of conduct, contributing guide, security policy).
- **Mar 5–7** — **Spanish meetings page** (`/reuniones/`) with translated summaries and meeting types, a language switcher in the header, site-wide navigation, and Zoom join links for upcoming meetings.
- **Mar 8–9** — **Moved to rcsd.info** (documents at data.rcsd.info); bilingual homepage and school directory; a Playwright scraper began downloading full board packets (attachment PDFs).
- **Mar 10–12** — **School profile pages built out**: demographics, state test scores, per-pupil funding with PTO comparisons from IRS 990 filings, principal photos, logos, per-grade bell schedules, and special-education data; a district budget deep-dive page; a color-coded district calendar widget; SEO metadata, favicon, and 404 page.
- **Mar 12** — **AI access launched**: an MCP server at mcp.rcsd.info lets AI assistants (like Claude) query schools, meetings, calendars, and lunch menus, with an integration test suite; plus a Claude Code plugin and `llms.txt`.
- **Mar 13** — **Meeting transcription begins**: AssemblyAI Universal 3 Pro with speaker diarization, documented in a published methodology. The meeting archive extended back to April 2020 (the full BoardDocs era), and the blog launched with its first post.
- **Mar 14–16** — **Meeting viewer**: a synced YouTube player with clickable transcript, a tabbed Transcript / Agenda / Minutes view expanded to all 188 meetings on per-meeting pages, chapter markers, formal agenda structure with public-comment extraction, and **Spanish transcript translations** with a language toggle. The district page gained a full-history documents section; the sitemap grew from 36 to 224 URLs; fonts were self-hosted.
- **Mar 21–28** — March 25 and April 1 agendas ingested; consent-agenda parsing fixed (#1); video timestamp maps backfilled from 48 to 144 meetings; provisional topics shown for upcoming meetings without posted agendas; MCP install guides published in English and Spanish; a `get-meeting-details` MCP tool added.
- **Mar 30–31** — **Meeting pages redesigned**: a slim index with an upcoming-meetings section, rich bilingual per-meeting detail pages, short descriptive titles for all 190 meetings, and corrected officer-rotation history. Transcripts were cleaned up (stray ASR hallucinations stripped, long utterances broken into readable paragraphs, board-member names corrected in transcription prompts), and `run-pipeline.mjs` began orchestrating the whole build.

---

## Maintaining this file

Add one bullet per merged PR or notable direct-to-main commit, at merge time. Date it (**Mon D**), cite the PR number where one exists, lead with what a site visitor would notice, and keep pipeline/infra notes to a phrase. Routine data ingests (new meeting agendas, videos, transcripts) get one aggregate line per month rather than individual bullets. Update the "Fresh as of" date whenever entries are verified current.
