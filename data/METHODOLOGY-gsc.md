# Methodology — Google Search Console SEO & Crawl Error Monitor

This document outlines the design, pipeline step, and data integration methodology for the Google Search Console (GSC) monitoring process used to maintain the crawler health and search footprint of **rcsd.info**.

## Purpose

To ensure that the statically built redwood city school district portal (`docs/`) is indexed correctly by Google without crawling blocks, page-load failures, accessibility errors, or mobile usability warnings, we run a scheduled/manual GSC monitoring audit. This acts as an early-warning system for SEO degradation and indexing blocks.

## Data Source

The pipeline pulls data from the official **Google Search Console (Webmaster Tools) v1 REST API**. 

The queried property is:
- **Property siteUrl:** `https://rcsd.info/` (configured via `GSC_SITE_URL` in `.env`).

---

## API Endpoints Utilized

### 🗺️ 1. Sitemaps API (`sitemaps().list()`)
- **Query:** Retrieves all registered XML sitemaps for the domain.
- **Metrics Collected:** Sitemap path, submission date, last download time, download status (`OK` or error), warning counts, error counts, and number of discovered URLs.
- **Actionable Insight:** Verifies Google is actively retrieving and parsing `docs/sitemap.xml` after each static rebuild and deploy.

### 📈 2. Search Analytics API (`searchanalytics().query()`)
- **Query:** Retrieves historical organic search performance data for the last 30 days.
- **Dimensions:** Page and Query (Keyword).
- **Metrics Collected:** Organic clicks, impressions, Click-Through Rate (CTR), and average organic position in SERPs.
- **Actionable Insight:** Validates that search engines are actively driving traffic to newly compiled meetings or school profile pages and measures the organic footprint.

### 🔍 3. URL Inspection API (`urlInspection().index().inspect()`)
- **Query:** Performs a direct search index status inspection for individual URLs.
- **Target URLs:** Discovered dynamically by parsing the locally built `docs/sitemap.xml`.
- **Metrics Collected:**
  - **robotsTxtState:** Robots.txt block status (allowed vs. disallowed).
  - **indexingState:** General index eligibility (indexing allowed vs. blocked by noindex).
  - **pageFetchState:** Server fetch success status (successful fetch, soft-404, DNS error, server error).
  - **googleCanonical vs. userCanonical:** Mismatches where Google chosen canonical deviates from our declared URL structure.
  - **mobileUsabilityResult:** Accessibility and viewport warnings (tap targets too close, text too small).
  - **richResultsResult:** Validity of structured microdata schemas (Breadcrumbs, Organization).

---

## Quota & Performance Management

The GSC URL Inspection API has a daily limit of **2,000 requests per day per property**. 
- Because `rcsd.info` grows as new board meetings are generated, we **sample** a subset of candidate URLs to run on every monitoring cycle (defaulting to 15 inspection URLs).
- The homepage (`https://rcsd.info/`) is always preserved at the start of the inspection array, and the remaining slots are randomly sampled across all other sitemap entries.
- This ensures fast execution, comprehensive surface area validation over time, and zero risk of hitting daily API quotas.
- The sample size can be customized via `--limit <number>` (e.g. to inspect a larger batch).

---

## Credentials & Setup

The pipeline requires a Google Cloud Platform Service Account with **Full** or **Owner** delegation to the Search Console domain. The script automatically reads credentials in priority order:
1. `GSC_CREDENTIALS_JSON` environment variable containing stringified service account JSON.
2. `GSC_CREDENTIALS_FILE` pointing to a local `gsc-key.json` file.
3. Google Application Default Credentials (ADC).

If no credentials are set, the monitor prints a clear step-by-step setup guide to aid local developers. Mock/dry-run capabilities (`--mock`) are available to preview visual markdown report dashboards instantly.

---

## Pipeline Execution

The monitor is fully integrated into the project's build cycle:
- Script: `scripts/gsc_monitor.py`
- Run Command: `npm run monitor:gsc`
- Outputs:
  - Raw JSON metrics: `data/gsc-data.json` (gitignored to prevent credential leaks, but caches the latest state).
  - Operator Markdown Dashboard: `data/gsc-monitoring-report.md` (committed, representing the latest audit status).
