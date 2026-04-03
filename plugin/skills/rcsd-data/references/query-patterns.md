# RCSD Query Patterns Reference

Examples of cross-file analysis queries with step-by-step approaches. These demonstrate how to combine data files for questions no single tool could answer.

## Pattern 1: School Comparison with Multiple Dimensions

**Question:** "Which schools have both high English Learner percentages and low math scores?"

**Approach:**
1. Read `data/sarc/sarc-summary.json`
2. For each school, extract `demographics.englishLearners` and `caaspp.mathAllStudents.metExceededPct`
3. Rank or filter by thresholds
4. Cross-reference with `data/schools.json` for enrollment and type context

**Key fields:**
- `sarc-summary.json` → `{slug}.demographics.englishLearners` (% EL)
- `sarc-summary.json` → `{slug}.caaspp.mathAllStudents.metExceededPct` (% met/exceeded)
- `schools.json` → `schools[].enrollment`, `schools[].type`, `schools[].highNeedPct`

---

## Pattern 2: Special Education Equity Analysis

**Question:** "How does the IEP rate compare across neighborhood vs. choice schools?"

**Approach:**
1. Read `data/sped-enrollment.json` for per-school IEP percentages
2. Read `data/schools.json` to classify each school as `neighborhood` or `choice`
3. Group IEP rates by school type and compute averages
4. Optionally read `data/sped-categories.json` to compare LRE placement patterns

**Key fields:**
- `sped-enrollment.json` → `schools.{slug}.pct` (IEP %)
- `sped-enrollment.json` → `schools.{slug}.total` and `.totalEnrollment`
- `sped-categories.json` → `schools.{slug}.placement.regularGt80` (most inclusive)
- `schools.json` → `schools[].type` ("neighborhood" or "choice")

---

## Pattern 3: PTO Funding Equity

**Question:** "How much does each school's PTO raise per student?"

**Approach:**
1. Read `data/schools.json`
2. For each school with a non-null `pto` field, compute `pto.revenue / enrollment`
3. Note schools with `pto: null` (no active PTO) — these rely on RCEF
4. Compare against the RCEF (Redwood City Education Foundation) which provides supplementary funding

**Key fields:**
- `schools.json` → `schools[].pto.revenue`, `schools[].pto.revenueFY`
- `schools.json` → `schools[].enrollment`
- `schools.json` → `rcef` (foundation details)

---

## Pattern 4: Board Discussion History on a Topic

**Question:** "What has the board discussed about budget cuts over the last year?"

**Approach:**
1. Read `data/meetings-data.json`
2. Filter meetings by date range
3. Search meeting `topics` arrays and item `title` fields for keywords ("budget", "cuts", "reduction", "fiscal")
4. For matching meetings, read `data/meeting-summaries.json` for context
5. For deeper detail, read the specific `data/board-memos/{date}.json` files
6. Optionally check `data/document-index.json` for related attachments

**Key fields:**
- `meetings-data.json` → `meetings[].topics[]` (keyword array)
- `meetings-data.json` → `meetings[].items[].title` (agenda item titles)
- `meetings-data.json` → `meetings[].date` (for date filtering)
- `meeting-summaries.json` → `{date-slug}` (prose summary)

---

## Pattern 5: School-Specific Board History

**Question:** "What has the board discussed about Orion?"

**Approach:**
1. Read `data/school-board-summaries.json`
2. Filter for entries containing the school slug (e.g., `"orion"`)
3. Sort by date descending
4. Present with meeting dates and summary context

**Key format:** Keys are `"YYYY-MM-DD|Agenda Item Title"`, values are objects keyed by school slug with `en`/`es` summary strings.

---

## Pattern 6: Spending vs. Outcomes

**Question:** "Do higher-spending schools have better test scores?"

**Approach:**
1. Read `data/sarc/sarc-summary.json`
2. For each school, extract `expenditures.schoolSite.totalPerPupil` and CAASPP scores
3. Correlate spending with `caaspp.elaAllStudents.metExceededPct` and `caaspp.mathAllStudents.metExceededPct`
4. Factor in `demographics.socioeconomicallyDisadvantaged` to contextualize

---

## Pattern 7: Meeting Video Deep Dive

**Question:** "Show me the video of when the board discussed [topic]"

**Approach:**
1. Search `data/meetings-data.json` for the topic in `topics[]` and item titles
2. Get the meeting date
3. Look up video in `data/youtube-index.json` by date
4. Check `data/timestamp-map.json` for the specific agenda item's video offset
5. Construct a timestamped YouTube link: `{youtube_url}&t={offset_seconds}`

---

## Pattern 8: Calendar + School Context

**Question:** "Is there school next Friday? What about the Monday after?"

**Approach:**
1. Determine the actual dates for "next Friday" and "the Monday after"
2. Read the appropriate `data/district-calendar-{year}.json`
3. For each date, check if it falls within any `no-school` event range (`date <= queryDate <= dateEnd`)
4. If no match and date is between First Day and Last Day events, it's a regular school day
5. Check day-of-week: weekends have no school

---

## Pattern 9: Demographic Trends Across Schools

**Question:** "Rank schools by racial diversity"

**Approach:**
1. Read `data/sarc/sarc-summary.json`
2. For each school, extract the demographics object (hispanicLatino, white, asian, africanAmerican, etc.)
3. Compute a diversity index (e.g., Simpson's or Shannon) or present the breakdown
4. Read `data/schools.json` for school type context (choice schools may draw from wider area)

---

## Pattern 10: Full School Profile

**Question:** "Tell me everything about Kennedy"

**Approach:**
1. Read `data/schools.json` → find the school by slug or name match
2. Read `data/sarc/kennedy.json` for detailed SARC
3. Read `data/sped-enrollment.json` and `sped-categories.json` for SpEd data
4. Read `data/school-board-summaries.json` filtered to `"kennedy"` for recent board items
5. Synthesize into a comprehensive profile

---

## Tips for Complex Queries

- **Start with the smallest file** that might answer the question before loading larger ones
- **meetings-data.json is 225KB** — for targeted searches, use Grep to find relevant dates first, then Read specific sections
- **sarc/sarc-summary.json** is the quickest route to cross-school comparisons; individual SARC files have much more detail
- **Null values in CDE data** mean cell suppression (<=10 students) — always explain this to the user
- **SARC data lags one year** — always state the reporting year
- **AI-generated summaries** must be identified as such when presenting them
