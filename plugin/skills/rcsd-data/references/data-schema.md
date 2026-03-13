# RCSD Data Schema Reference

Complete field documentation for all JSON data files in the rcsd.info `data/` directory.

## data/schools.json

Top-level structure:
```json
{
  "schools": [ ...school objects... ],
  "districtLinks": { ... },
  "rcef": { ... },
  "lastUpdated": "YYYY-MM-DD"
}
```

### School Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | URL-safe identifier (e.g., `"roy-cloud"`) |
| `name` | string | Full official name |
| `nameShort` | string | Short display name |
| `nameEs` | string | Spanish name |
| `grades` | string | Grade span (e.g., `"TK-5"`, `"6-8"`, `"TK-8"`) |
| `type` | string | `"neighborhood"` (address-assigned) or `"choice"` (application-based) |
| `program` | string\|null | Special program label (e.g., `"Mandarin \| Co-op"`, `"Spanish · Espanol"`) |
| `programEs` | string\|null | Spanish program label |
| `enrollment` | number | Current enrollment count |
| `highNeedPct` | number | % of students classified as high-need (SED + EL + Foster Youth, unduplicated) |
| `address` | string | Street address |
| `phone` | string | Main office phone |
| `website` | string | School website URL |
| `principal` | string | Current principal name |
| `bellSchedule.start` | string | Regular start time (e.g., `"8:15 AM"`) |
| `bellSchedule.end` | string | Regular end time |
| `bellSchedule.earlyRelease` | string | Early release dismissal time |
| `lunchUrl` | string | HealthePro lunch menu URL |
| `communitySchool` | boolean | Whether designated as a Community School |
| `cdsCode` | string | 14-digit CDE County-District-School code |

### School parentLinks Object

| Field | Type | Description |
|-------|------|-------------|
| `platform` | string | Primary parent comm platform: `"ParentSquare"`, `"Konstella"`, `"Membership Toolkit"`, `"Email/Social"` |
| `konstella` | string\|null | Direct Konstella join URL (e.g., `"https://www.konstella.com/cd/TS3MPT"`) |
| `konstellaPage` | string\|null | PTO page about Konstella |
| `konstellaNote` | string\|null | Note about how to access Konstella |
| `ptaPortal` | string\|null | PTA membership portal URL |
| `joinUrl` | string\|null | Direct PTA/PTO join URL |
| `instagram` | string\|null | PTO Instagram |
| `email` | string\|null | PTO email |

### School pto Object (null if no PTO/PTA)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | PTO/PTA organization name |
| `url` | string | PTO/PTA website |
| `ein` | string | IRS EIN |
| `ctNumber` | string | CA Registry of Charitable Trusts number |
| `rctStatus` | string | RCT filing status: `"current"`, `"current-in-process"`, `"delinquency-notice"`, `"missing-documents"` |
| `revenue` | number | Annual revenue from IRS 990 |
| `revenueFY` | string | Fiscal year of revenue figure |
| `sourceUrl` | string | ProPublica Nonprofit Explorer link |

### districtLinks Object

| Field | Type | Description |
|-------|------|-------------|
| `parentSquare` | string | ParentSquare sign-in URL (used by all schools) |
| `absenceReporting.app` | string | App name (`"SchoolMessenger"`) |
| `absenceReporting.ios` | string | iOS App Store URL |
| `absenceReporting.android` | string | Google Play URL |
| `lunchMenuProvider` | string | Menu vendor name (`"HealthePro"`) |
| `lunchMenuBase` | string | Base URL for all school menus |

### rcef Object

Redwood City Education Foundation — provides supplementary funding for all schools, especially those without active PTOs.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Foundation name |
| `url` | string | Website |
| `ein` | string | IRS EIN |
| `description` | string | Mission description |

---

## data/district-calendar-{year}.json

```json
{
  "schoolYear": "2025-26",
  "calendarUrl": "https://...",
  "events": [ ...event objects... ]
}
```

### Calendar Event Object

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | ISO date (`"YYYY-MM-DD"`) — start date |
| `dateEnd` | string\|undefined | End date for multi-day events |
| `type` | string | `"no-school"`, `"early-release"`, `"milestone"`, `"board-meeting"` |
| `en` | string | English description |
| `es` | string | Spanish description |

**Important**: For multi-day events (e.g., Spring Break), check both `date` and `dateEnd`. A date query should check `date <= queryDate <= dateEnd`.

---

## data/sped-enrollment.json

CDE Census Day Enrollment data — IEP students by school and grade.

```json
{
  "_source": { "dataset": "...", "year": "...", "url": "...", ... },
  "district": { "total": 1121, "grades": { "1": 106, ... } },
  "schools": {
    "slug": {
      "total": number,
      "grades": { "1": number|null, ... },
      "totalEnrollment": number,
      "pct": number
    }
  }
}
```

- `total`: IEP student count at this school
- `grades`: Per-grade IEP counts (`null` = cell suppression, <=10 students)
- `totalEnrollment`: Total school enrollment (denominator)
- `pct`: IEP percentage (total / totalEnrollment * 100)

---

## data/sped-categories.json

CDE Special Education Enrollment by Program Setting — disability categories and Least Restrictive Environment (LRE) placement.

### District disabilityCategories

Top disability categories across the district:
- Specific Learning Disability (SLD): 391
- Speech/Language Impairment (SLI): 385
- Other Health Impairment (OHI): 250
- Autism: 185
- (`null` values = cell suppression)

### School placement Object

| Field | Type | Description |
|-------|------|-------------|
| `total` | number | Total IEP students |
| `regularGt80` | number | In regular class >80% of day (most inclusive) |
| `regular40to79` | number | In regular class 40-79% of day |
| `regularLt40` | number | In regular class <40% of day (most restrictive) |
| `separateSchool` | number | Placed in separate school |
| `preschool` | number | Preschool-age IEP students |

---

## data/sarc/sarc-summary.json

SARC summary data for all schools. Note: covers prior year data (2024-25 SARCs report 2023-24 data).

### Per-School SARC Summary

| Field | Type | Description |
|-------|------|-------------|
| `demographics.hispanicLatino` | number | % Hispanic/Latino |
| `demographics.white` | number | % White |
| `demographics.englishLearners` | number | % English Learners |
| `demographics.socioeconomicallyDisadvantaged` | number | % SED (proxy for free/reduced lunch) |
| `expenditures.schoolSite.totalPerPupil` | number | Total per-pupil spending |
| `caaspp.elaAllStudents.metExceededPct` | number | % meeting/exceeding ELA standards |
| `caaspp.mathAllStudents.metExceededPct` | number | % meeting/exceeding Math standards |

---

## data/sarc/{slug}.json

Detailed SARC for each school. Key sections:

- `contact`: Principal, address, phone, website
- `enrollment`: Total and by-grade breakdown
- `demographics`: Full race/ethnicity, EL, SED, disability, foster, homeless percentages
- `teachers`: 3-year teacher credential/assignment data
- `textbooks`: Subject-by-subject textbook sufficiency
- `facilities`: Inspection results and repair status
- `caaspp`: SBAC test results by student group (ELA and Math)
- `expenditures`: Per-pupil spending vs. district and state averages

---

## data/meeting-summaries.json

Board meeting summaries keyed by date string (`"YYYY-MM-DD"`). Each value is a prose summary paragraph describing what was discussed, approved, and any public comment highlights.

---

## data/meeting-summaries-es.json

Spanish translations of board meeting summaries, same key structure.

---

## data/school-board-summaries.json

Board agenda items tagged to specific schools. Key format: `"YYYY-MM-DD|Agenda Item Title"`. Value is an object keyed by school slug with `en` and `es` summary strings.

Example:
```json
{
  "2026-03-11|Roosevelt School Presentation...": {
    "roosevelt": {
      "en": "Annual school presentation to the Board; SPSA review",
      "es": "Presentacion escolar anual ante la Mesa Directiva; SPSA"
    }
  }
}
```

---

## data/board-memos/{date}.json

Per-meeting board memo data with agenda item details and attachments.

---

## data/youtube-index.json

YouTube video index for board meeting recordings.

---

## data/meetings-data.json

Comprehensive meeting data including agenda items, timestamps, and transcript information.

---

## HealthePro Lunch Menu API

Public REST API (no authentication required). Base URL: `https://menus.healthepro.com/api/organizations/1184`

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /sites/list` | All school sites with IDs |
| `GET /sites/{siteId}/menus/` | Available menus (lunch, breakfast) for a site |
| `GET /menus/{menuId}/year/{YYYY}/month/{M}/date_overwrites` | **Daily menu items** — the primary endpoint |
| `GET /menus/{menuId}/start_date/{start}/end_date/{end}/recipes/` | Recipe catalog with allergens, nutrition, ingredients |
| `GET /allergens` | Allergen definitions |
| `GET /attributes` | Dietary attribute definitions |

### Site IDs (from schools.json lunchUrl)

| School | Site ID | Lunch Menu ID |
|--------|---------|---------------|
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

### date_overwrites Response Structure

```json
{
  "data": [
    {
      "id": 1446912083,
      "day": "2026-03-02",
      "meal_id": 14050158,
      "setting": "{\"current_display\": [...], \"available_recipes\": [...], ...}"
    }
  ]
}
```

The `setting` field is a JSON string. Parse it to get `current_display`, an array of items:

```json
{
  "current_display": [
    { "item": "Lunch Entree", "weight": 0, "name": "Lunch Entree", "type": "category" },
    { "item": 1175334, "weight": 1, "name": "Locally Made Cheese Pizza", "type": "recipe" },
    { "item": "Vegetables", "weight": 4, "name": "Vegetables", "type": "category" },
    { "item": 1175253, "weight": 5, "name": "Caesar Salad FS", "type": "recipe" }
  ]
}
```

- `type: "category"` — section header (Lunch Entree, Vegetables, Fruit, Milk)
- `type: "recipe"` — individual menu item
- `item` — recipe ID (number) for recipes, or category name (string) for headers
- `weight` — display order
