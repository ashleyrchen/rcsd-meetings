# RCSD Data Schema Reference

Complete field documentation for all JSON data files in the rcsd.info `data/` directory. Each section includes a real data sample to demonstrate the actual structure.

## data/schools.json

Top-level: `{ schools[], districtLinks, rcef, lastUpdated }`

### Sample School Record

```json
{
  "slug": "adelante-selby",
  "name": "Adelante Selby Spanish Immersion School",
  "nameShort": "Adelante Selby",
  "nameEs": "Escuela de Inmersión en Español Adelante Selby",
  "grades": "TK-5",
  "type": "choice",
  "program": "Spanish · Español",
  "programEs": "Español · Spanish",
  "enrollment": 630,
  "highNeedPct": 65,
  "address": "170 Selby Lane, Atherton, CA 94027",
  "phone": "(650) 482-2415",
  "website": "https://adelanteselby.rcsdk8.net",
  "principal": "Patricia Alcocer",
  "bellSchedule": {
    "earlyReleaseDay": "Thursday",
    "supervision": null,
    "regular": [
      { "grades": "TK", "start": "8:28 AM", "end": "1:40 PM" },
      { "grades": "K", "start": "8:18 AM", "end": "2:00 PM" },
      { "grades": "1", "start": "8:13 AM", "end": "2:20 PM" },
      { "grades": "2-3", "start": "8:08 AM", "end": "2:25 PM" },
      { "grades": "4-5", "start": "8:03 AM", "end": "2:25 PM" }
    ],
    "earlyRelease": [
      { "grades": "TK", "end": "12:45 PM" },
      { "grades": "K", "end": "1:15 PM" },
      { "grades": "1", "end": "1:20 PM" },
      { "grades": "2-5", "end": "1:25 PM" }
    ]
  },
  "lunchUrl": "https://menus.healthepro.com/organizations/1184/sites/9274/menus/103750",
  "communitySchool": true,
  "cdsCode": "41690056044580",
  "parentLinks": {
    "platform": "ParentSquare",
    "konstella": null
  },
  "pto": {
    "name": "Unidos Y Adelante",
    "url": "https://unidospto.org/",
    "ein": "48-1266142",
    "ctNumber": "119817",
    "rctStatus": "current",
    "revenue": 251126,
    "revenueFY": "2024-25",
    "sourceUrl": "https://projects.propublica.org/nonprofits/organizations/481266142"
  }
}
```

### Key Field Notes

- `type`: `"neighborhood"` (address-assigned) or `"choice"` (application-based)
- `highNeedPct`: % classified as high-need (SED + EL + Foster Youth, unduplicated)
- `bellSchedule.regular[]`: Per-grade-band start/end times (not a single time for whole school)
- `bellSchedule.earlyReleaseDay`: Varies by school (Wednesday or Thursday)
- `pto`: `null` if school has no active PTO/PTA — these schools rely on RCEF
- `rctStatus`: CA Registry of Charitable Trusts filing status
- `parentLinks.platform`: All schools use ParentSquare; some also have Konstella or Membership Toolkit
- `lunchUrl`: Encodes both site ID and menu ID for HealthePro API

### districtLinks Sample

```json
{
  "parentSquare": "https://www.parentsquare.com/signin",
  "parentSquareNote": "District-wide official parent communication platform used by all schools",
  "absenceReporting": {
    "app": "SchoolMessenger",
    "ios": "https://apps.apple.com/us/app/schoolmessenger/id978894818",
    "android": "http://play.google.com/store/apps/details?id=com.schoolmessenger.recipient"
  },
  "lunchMenuProvider": "HealthePro",
  "lunchMenuBase": "https://menus.healthepro.com/organizations/1184"
}
```

### rcef Sample

```json
{
  "name": "Redwood City Education Foundation",
  "nameEs": "Fundación Educativa de Redwood City",
  "url": "https://www.rcef.org/",
  "ein": "94-2903141",
  "description": "RCEF provides supplementary funding for all RCSD schools, with a focus on equity for schools without active PTOs."
}
```

---

## data/district-calendar-{year}.json

### Sample

```json
{
  "schoolYear": "2025-26",
  "calendarUrl": "https://resources.finalsite.net/.../2025-26TK-8InstructionalCalendarBoardapproved12112024.pdf",
  "events": [
    { "date": "2025-08-13", "type": "milestone", "en": "First Day of School", "es": "Primer Día de Clases" },
    { "date": "2025-09-01", "type": "no-school", "en": "Labor Day", "es": "Día del Trabajo" },
    { "date": "2025-09-15", "dateEnd": "2025-09-19", "type": "early-release", "en": "Parent Teacher Conference Week", "es": "Semana de Conferencias con Padres" }
  ]
}
```

### Key Field Notes

- `type`: `"no-school"`, `"early-release"`, `"milestone"`, `"board-meeting"`
- `dateEnd`: Present only for multi-day events (e.g., Spring Break). Check `date <= queryDate <= dateEnd`.
- To determine if school is in session: check for `no-school` events, then verify date falls between "First Day" and "Last Day" milestones, then check it's not a weekend.

---

## data/sped-enrollment.json

CDE Census Day Enrollment data — IEP students by school and grade.

### Sample

```json
{
  "_source": {
    "dataset": "CDE Census Day Enrollment",
    "year": "2024-25",
    "url": "https://www.cde.ca.gov/ds/ad/filesenrcensus.asp",
    "note": "Students with IEPs under IDEA. Does not include 504 plan students. Values of null indicate cell suppression (≤10 students).",
    "retrievedDate": "2026-03-12"
  },
  "district": { "total": 1121 },
  "schools": {
    "clifford": {
      "total": 138,
      "grades": { "1": 14, "2": null, "3": 15, "4": 13, "5": 12, "6": 22, "7": 12, "8": 24, "TK": null, "K": 15 },
      "totalEnrollment": 698,
      "pct": 19.8
    }
  }
}
```

### Key Field Notes

- `null` in grades = cell suppression (<=10 students, CDE privacy rule) — always explain this
- `pct` = `total / totalEnrollment * 100`
- Does NOT include 504 plan students (504 data only available from OCR CRDC, lags ~5 years)

---

## data/sped-categories.json

CDE Special Education by Program Setting — disability categories and LRE placement.

### Sample

```json
{
  "district": {
    "disabilityCategories": {
      "Specific Learning Disability": 391,
      "Speech/Language Impairment": 385,
      "Other Health Impairment": 250,
      "Autism": 185,
      "Intellectual Disability": 48,
      "Emotional Disturbance": 31,
      "Deaf-Blindness": null,
      "Hard of Hearing": null,
      "Visual Impairment": null
    },
    "placement": {
      "total": 1310,
      "regularGt80": 825,
      "regular40to79": 126,
      "regularLt40": 236,
      "separateSchool": 30,
      "preschool": 93
    }
  },
  "schools": {
    "clifford": {
      "placement": {
        "total": 138,
        "regularGt80": 65,
        "regular40to79": 22,
        "regularLt40": 46,
        "separateSchool": 2,
        "preschool": 3
      }
    }
  }
}
```

### Key Field Notes

- LRE = Least Restrictive Environment. `regularGt80` = most inclusive (in regular class >80% of day)
- `null` in disability categories = cell suppression
- Per-school data has placement only (not disability category breakdown — CDE suppresses at school level)

---

## data/sarc/sarc-summary.json

SARC summary data for all schools. **Covers prior year**: 2024-25 SARCs report 2023-24 data.

Top-level: `{ generated, "slug": { demographics, expenditures, caaspp } }`

### Key Fields Per School

| Path | Type | Description |
|------|------|-------------|
| `demographics.hispanicLatino` | number | % Hispanic/Latino |
| `demographics.white` | number | % White |
| `demographics.asian` | number | % Asian |
| `demographics.africanAmerican` | number | % African American |
| `demographics.englishLearners` | number | % English Learners |
| `demographics.socioeconomicallyDisadvantaged` | number | % SED (proxy for free/reduced lunch) |
| `expenditures.schoolSite.totalPerPupil` | number | Total per-pupil spending at school site |
| `caaspp.elaAllStudents.metExceededPct` | number | % meeting/exceeding ELA standards |
| `caaspp.mathAllStudents.metExceededPct` | number | % meeting/exceeding Math standards |

Read `data/sarc/{slug}.json` for detailed per-school data: teachers, textbooks, facilities, test results by student group, and more.

---

## data/meetings-data.json

The primary board meeting file. See `references/meetings-guide.md` for full navigation guide.

### Sample Meeting (metadata, no items)

```json
{
  "date": "2026-03-25",
  "type": "Regular",
  "source": "simbli",
  "mid": "50617",
  "slug": "2026-03-25-regular",
  "youtube": "u4Is6bk2Gh8",
  "simbli": "https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=36030397&MID=50617",
  "boarddocs": null,
  "zoom": "https://rcsdk8-net.zoom.us/s/83593509461",
  "topics": [
    "Taft/Garfield SPSA presentations, 2024-25 financial audit (Eide Bailly), Second Interim Budget ($158.1M rev), AI-assisted literacy info item, drone policy BP 3515.21 second reading, Connect charter audit review, Ed Code 41372 salary waiver (55.54% vs 60%), 650 Chromebooks ($323.9K), 16 CSBA policy updates, Measure U addenda (North Star/Henry Ford)"
  ],
  "threads": ["budget", "policy", "charter"],
  "hasTranscript": true,
  "duration": "2h 27m",
  "durationSeconds": 8852
}
```

### Sample Agenda Items (3 types)

```json
[
  {
    "itemLabel": "1",
    "title": "Call to Order",
    "isSection": true,
    "plannedMinutes": 1,
    "actionType": "Procedural",
    "speaker": null,
    "attachments": []
  },
  {
    "itemLabel": "1.2",
    "title": "Public Comment on Closed Session Items Only",
    "isSection": false,
    "plannedMinutes": null,
    "actionType": "Information",
    "speaker": "Prepared by: Evelyn Campos, Administrative Assistant to the Superintendent Approved by: John R. Baker, Ed.D., Superintendent",
    "attachments": []
  },
  {
    "itemLabel": "13.1",
    "title": "Taft School Presentation and School Plan for Student Achievement (SPSA) Approval",
    "isSection": false,
    "actionType": "Action",
    "speaker": "Prepared by: Anna Herrera, Assistant Superintendent, Ed. Services Approved by: John R. Baker, Ed. D., Superintendent",
    "attachments": [
      { "title": "Taft 25-26 Board Presentation", "aid": "1453621", "filename": "Taft-25-26-Board-Presentation.pdf" },
      { "title": "Taft SPSA 2025-26_(Spring)Elementary_School_20260315", "aid": "1451853", "filename": "Taft-SPSA-2025-26_-Spring-Elementary_School_20260315.pdf" }
    ],
    "timestamp": "00:32:35",
    "timestampSeconds": 1955,
    "phases": {
      "opened": 1955,
      "presentation": 1979,
      "discussion": 2757,
      "vote": { "seconds": 3754, "type": "voice", "result": "unanimous" }
    },
    "publicComments": [],
    "consent": false
  }
]
```

### Chapter Markers (recent meetings with transcripts)

Recent meetings include rich `chapterMarkers` with speaker identification, per-item phase timestamps, and public comment summaries:

```json
{
  "speakers": {
    "A": { "name": "Evelyn Sanchez", "role": "Executive Assistant to Superintendent / Board Secretary" },
    "B": { "name": "David Weekly", "role": "Board President" },
    "I": { "name": "John Baker", "role": "Superintendent" }
  },
  "items": [
    {
      "itemLabel": "9",
      "title": "Public Comment / Labor Association Comments",
      "phases": { "opened": 454, "publicComment": 454 },
      "publicComments": [
        {
          "name": "Christy Herrera",
          "startSeconds": 468,
          "endSeconds": 650,
          "summary": "Described kindergarten classrooms at Hoover as overwhelmed, noting class sizes of 27-28 students, and urged the board to prioritize smaller class sizes."
        }
      ]
    },
    {
      "itemLabel": "8",
      "title": "Approval of the Agenda",
      "phases": {
        "opened": 435,
        "vote": { "seconds": 439, "type": "voice", "result": "unanimous" }
      }
    }
  ]
}
```

### Key Field Notes

- `actionType`: `"Procedural"`, `"Action"`, `"Information"`, `"Discussion"`, `"Consent"`, or `null`
- `isSection`: True for major agenda section headers (numbered without decimals)
- `topics[]`: LLM-generated keyword summaries — good for searching
- `threads[]`: Thematic tags (e.g., "budget", "policy", "charter", "facilities")
- `phases`: All values are seconds from video start. `vote.result` is typically `"unanimous"`.
- `publicComments[]`: Timestamped and summarized public comments with speaker names
- Older BoardDocs-sourced meetings have simpler item structure (no phases/chapterMarkers)

---

## data/meeting-summaries.json

Keyed by slug (e.g., `"2026-03-11"` or `"2020-04-01-board-meeting"`). Each value is a prose summary paragraph (1-3 sentences). **AI-generated** — always label as such.

---

## data/school-board-summaries.json

Board items tagged to schools. Keys: `"YYYY-MM-DD|Agenda Item Title"`. Values: `{ "slug": { "en": "...", "es": "..." } }`.

---

## data/timestamp-map.json

Maps agenda items to video timestamps by meeting date. Each entry has `videoId` and `items[]` positionally aligned with `meetings-data.json` items. Each element is `{ timestamp, timestampSeconds }` or `null`.

Construct timestamped YouTube links: `https://www.youtube.com/watch?v={videoId}&t={timestampSeconds}`

---

## data/document-index.json

Categorized index of board attachments. Each document: `{ type, subtype, title, meetingDate, itemLabel, itemTitle, attachmentId, url }`.

Document types and counts:
- `resolution/resolution` (205), `tax/parcel` (109), `sped/contract` (83), `spsa/plan` (81)
- `policy/policy` (52), `budget/first-interim` (48), `lcap/annual` (46), `school-report/presentation` (46)
- `sarc/report` (42), `compliance/williams-ucp` (40), `budget/adopted-budget` (36)
- `labor/csea` (30), `labor/rcta` (29), `tax/bond` (18)

---

## HealthePro Lunch Menu API

Public REST API (no authentication). Base URL: `https://menus.healthepro.com/api/organizations/1184`

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /sites/list` | All school sites with IDs |
| `GET /sites/{siteId}/menus/` | Available menus for a site |
| `GET /menus/{menuId}/year/{YYYY}/month/{M}/date_overwrites` | **Daily menu items** |
| `GET /menus/{menuId}/start_date/{start}/end_date/{end}/recipes/` | Recipe catalog with allergens/nutrition |

### School Menu IDs (from lunchUrl in schools.json)

| School | Site ID | Menu ID |
|--------|---------|---------|
| Adelante Selby | 9274 | 103750 |
| Clifford | 9275 | 103731 |
| Garfield | 9277 | 103763 |
| Henry Ford | 9278 | 103766 |
| Hoover | 9279 | 103767 |
| Kennedy | 9280 | 103754 |
| McKinley | 9281 | 103771 |
| North Star | 9366 | 103771 |
| Orion | 9282 | 103774 |
| Roosevelt | 9284 | 103755 |
| Roy Cloud | 9283 | 103751 |
| Taft | 9285 | 103756 |

### Response Structure (date_overwrites)

```json
{
  "data": [
    {
      "id": 1446912083,
      "day": "2026-03-02",
      "meal_id": 14050158,
      "setting": "{\"current_display\": [...], ...}"
    }
  ]
}
```

Parse the `setting` JSON string → `current_display` array:
```json
[
  { "item": "Lunch Entree", "weight": 0, "name": "Lunch Entree", "type": "category" },
  { "item": 1175334, "weight": 1, "name": "Locally Made Cheese Pizza", "type": "recipe" },
  { "item": "Vegetables", "weight": 4, "name": "Vegetables", "type": "category" },
  { "item": 1175253, "weight": 5, "name": "Caesar Salad FS", "type": "recipe" }
]
```

- `type: "category"` = section header; `type: "recipe"` = menu item
- `weight` = display order
