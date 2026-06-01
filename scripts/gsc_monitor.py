#!/usr/bin/env python3
"""Google Search Console API Monitor

Pulls sitemaps, page indexing coverage, scraping/crawling errors, 
and search performance metrics for rcsd.info.

Supports:
- Live Google Search Console API querying using service accounts or ADC.
- Self-guided setup manual when credentials are missing.
- Mock mode (`--mock`) to instantly preview reports without credentials.

Usage:
    .venv/bin/python scripts/gsc_monitor.py
    .venv/bin/python scripts/gsc_monitor.py --mock
"""

import os
import sys
import json
import argparse
import datetime
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Check for Google libraries (will be required for live mode)
google_libs_available = True
try:
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
    import google.auth
except ImportError:
    google_libs_available = False

DEFAULT_SITE_URL = "https://rcsd.info/"
SITEMAP_LOCAL_PATH = os.path.join(os.path.dirname(__file__), '..', 'docs', 'sitemap.xml')
OUTPUT_DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'gsc-data.json')
OUTPUT_REPORT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'gsc-monitoring-report.md')


def print_setup_guide():
    """Prints a detailed, step-by-step setup guide for GSC API credentials."""
    guide = """
================================================================================
          GOOGLE SEARCH CONSOLE API PIPELINE — SETUP GUIDE
================================================================================

It looks like the Google Search Console (GSC) credentials are not yet configured.
To enable live monitoring of crawling errors, sitemaps, and search analytics, follow
these steps:

STEP 1: Create a Google Cloud Project & Service Account
--------------------------------------------------------------------------------
1. Go to the Google Cloud Console (https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Search for "Google Search Console API" (Webmaster Tools API) and click "ENABLE".
4. Go to "IAM & Admin" > "Service Accounts".
5. Click "CREATE SERVICE ACCOUNT". Give it a name (e.g. `rcsd-gsc-monitor`) 
   and click Create.
6. Click on the newly created Service Account, go to the "Keys" tab, 
   click "Add Key" > "Create new key", select "JSON", and click "Create".
7. Save the downloaded JSON file. This file contains your private credentials!

STEP 2: Delegate Access in Google Search Console
--------------------------------------------------------------------------------
1. Open Google Search Console (https://search.google.com/search-console).
2. Select your property (e.g. `rcsd.info` or `https://rcsd.info/`).
3. In the sidebar, scroll down to "Settings" > "Users and permissions".
4. Click "ADD USER".
5. For Email address, enter the service account's client email address 
   (found in your downloaded JSON file under the `"client_email"` key,
   e.g. `rcsd-gsc-monitor@your-project.iam.gserviceaccount.com`).
6. For Permission, choose "Full" or "Owner" ("Full" is required for the URL
   Inspection API to report crawling errors).
7. Click "Add".

STEP 3: Configure your environment variables
--------------------------------------------------------------------------------
Option A: Using the JSON Key File (Recommended for Local Dev)
  Move your downloaded JSON key to the repository root as `gsc-key.json` and 
  add this to your `.env` file:
  
  GSC_CREDENTIALS_FILE=gsc-key.json
  GSC_SITE_URL=https://rcsd.info/

Option B: Using the JSON Content String (Great for Production/CI/CD)
  Add the entire stringified JSON contents directly to your `.env` file:
  
  GSC_CREDENTIALS_JSON='{"type": "service_account", "project_id": ...}'
  GSC_SITE_URL=https://rcsd.info/

Option C: Using Application Default Credentials (ADC) with gcloud CLI
  If you have the Google Cloud SDK (gcloud CLI) installed locally, you can
  authenticate directly by running:
  
  gcloud auth application-default login --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform

--------------------------------------------------------------------------------
PREVIEW DUMMY DATA REPORT:
  You can run the script in Mock Mode to immediately preview the generated
  reports without setting up Google Cloud first:
  
  npm run monitor:gsc -- --mock  (or: .venv/bin/python scripts/gsc_monitor.py --mock)
================================================================================
"""
    print(guide)


def get_urls_from_sitemap(sitemap_path, limit=25):
    """Parses local sitemap.xml to extract a sample of candidate URLs for inspection."""
    if not os.path.exists(sitemap_path):
        print(f"Sitemap file not found locally: {sitemap_path}", file=sys.stderr)
        return []

    try:
        tree = ET.parse(sitemap_path)
        root = tree.getroot()
        # Sitemap namespace
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        urls = []
        for url in root.findall('s:url', ns):
            loc = url.find('s:loc', ns)
            if loc is not None and loc.text:
                urls.append(loc.text.strip())
        
        total_discovered = len(urls)
        print(f"Discovered {total_discovered} URLs in local sitemap.")
        
        # Take a subset/sample to respect daily URL Inspection API quotas
        if len(urls) > limit:
            import random
            # Always keep homepage at the start for consistency
            homepage = next((u for u in urls if u == DEFAULT_SITE_URL or u == DEFAULT_SITE_URL.rstrip('/')), None)
            rest = [u for u in urls if u != homepage]
            # Take random sample from the rest
            sample = random.sample(rest, min(limit - (1 if homepage else 0), len(rest)))
            if homepage:
                urls = [homepage] + sample
            else:
                urls = sample
            print(f"Sampled {len(urls)} URLs for GSC URL inspection.")
        return urls
    except Exception as e:
        print(f"Error parsing sitemap: {e}", file=sys.stderr)
        return []


def authenticate_gsc():
    """Authenticates with the Google Search Console API using available methods."""
    if not google_libs_available:
        print("Google authentication libraries are not available.", file=sys.stderr)
        return None

    # Option 1: Credentials JSON string in env
    credentials_json = os.environ.get('GSC_CREDENTIALS_JSON')
    if credentials_json:
        try:
            info = json.loads(credentials_json)
            credentials = service_account.Credentials.from_service_account_info(
                info, scopes=['https://www.googleapis.com/auth/webmasters.readonly']
            )
            print("Authenticated using GSC_CREDENTIALS_JSON.")
            return credentials
        except Exception as e:
            print(f"Error loading credentials from JSON string: {e}", file=sys.stderr)

    # Option 2: Credentials key file path in env
    credentials_file = os.environ.get('GSC_CREDENTIALS_FILE', 'gsc-key.json')
    if credentials_file and os.path.exists(credentials_file):
        try:
            credentials = service_account.Credentials.from_service_account_file(
                credentials_file, scopes=['https://www.googleapis.com/auth/webmasters.readonly']
            )
            print(f"Authenticated using GSC_CREDENTIALS_FILE: {credentials_file}")
            return credentials
        except Exception as e:
            print(f"Error loading credentials from file {credentials_file}: {e}", file=sys.stderr)

    # Option 3: Application Default Credentials (ADC)
    try:
        credentials, project = google.auth.default(
            scopes=['https://www.googleapis.com/auth/webmasters.readonly']
        )
        print("Authenticated using Application Default Credentials.")
        return credentials
    except Exception as e:
        # No credentials could be resolved
        pass

    return None


def check_scope_error(e, site_url=None):
    """Checks if an exception is due to GSC API auth or property ownership issues and prints troubleshooting advice."""
    err_str = str(e)
    
    # 1. Check scope error
    if "ACCESS_TOKEN_SCOPE_INSUFFICIENT" in err_str or "insufficient authentication scopes" in err_str or "Request had insufficient authentication scopes" in err_str:
        print("\n" + "="*80, file=sys.stderr)
        print("[!] ERROR: Insufficient API permissions / scopes detected.", file=sys.stderr)
        print("This typically happens when you are authenticated with the Google Cloud SDK (gcloud CLI)", file=sys.stderr)
        print("but your credentials token does not include the Search Console scopes.", file=sys.stderr)
        print("\nTo resolve this, please run the following command in your terminal to re-authenticate with the correct scope:", file=sys.stderr)
        print("  gcloud auth application-default login --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform", file=sys.stderr)
        print("="*80 + "\n", file=sys.stderr)
        return True
        
    # 2. Check quota project error
    if "requires a quota project" in err_str or "SERVICE_DISABLED" in err_str:
        print("\n" + "="*80, file=sys.stderr)
        print("[!] ERROR: Google Cloud Quota Project / API Service Issue.", file=sys.stderr)
        print("Your Application Default Credentials (ADC) require a quota project to charge API limits.", file=sys.stderr)
        print("\nHow to resolve this:", file=sys.stderr)
        print("1. Set your active Google Cloud project as the billing/quota project for ADC:", file=sys.stderr)
        print("   gcloud auth application-default set-quota-project YOUR_GCP_PROJECT_ID", file=sys.stderr)
        print("\n2. Make sure the 'Google Search Console API' is enabled in that project:", file=sys.stderr)
        print("   https://console.cloud.google.com/apis/library/searchconsole.googleapis.com", file=sys.stderr)
        print("\n💡 RECOMMENDED ALTERNATIVE: Use a Service Account JSON Key!", file=sys.stderr)
        print("   Using a service account JSON file completely bypasses user quota projects,", file=sys.stderr)
        print("   interactive logins, and token expirations. See the setup guide in gsc_monitor.py.", file=sys.stderr)
        print("="*80 + "\n", file=sys.stderr)
        return True

    # 3. Check property ownership or URL mismatch error
    if "You do not own this site" in err_str or "not part of this property" in err_str:
        print("\n" + "="*80, file=sys.stderr)
        print("[!] ERROR: Google Search Console Property Ownership Mismatch.", file=sys.stderr)
        print(f"Google Search Console does not recognize '{site_url or 'the specified URL'}' as a verified property", file=sys.stderr)
        print("or the URL is outside this property's scope.", file=sys.stderr)
        print("\nHow to resolve this:", file=sys.stderr)
        print("1. Confirm how your property is registered in the Search Console dashboard (https://search.google.com/search-console).", file=sys.stderr)
        print("\n2. If it is registered as a Domain Property (e.g. rcsd.info), set GSC_SITE_URL in your .env file exactly as:", file=sys.stderr)
        print("   GSC_SITE_URL=sc-domain:rcsd.info", file=sys.stderr)
        print("\n3. If it is registered as a URL-prefix Property (e.g. with www or without https), set it exactly as:", file=sys.stderr)
        print("   GSC_SITE_URL=https://www.rcsd.info/   (or whichever protocol/subdomain matches GSC)", file=sys.stderr)
        print("\n4. Verify that your authenticated user/service account has Owner or Full access in GSC Settings > Users and permissions.", file=sys.stderr)
        print("="*80 + "\n", file=sys.stderr)
        return True
        
    return False


def run_live_monitoring(credentials, site_url, limit):
    """Executes live queries against the Google Search Console API."""
    try:
        service = build('searchconsole', 'v1', credentials=credentials)
    except Exception as e:
        print(f"Failed to build Search Console service: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Starting GSC monitoring for site property: {site_url}")
    
    # 1. Fetch Sitemaps Info
    sitemaps_data = []
    try:
        sitemaps_res = service.sitemaps().list(siteUrl=site_url).execute()
        sitemaps_data = sitemaps_res.get('sitemap', [])
        print(f"Fetched {len(sitemaps_data)} registered sitemaps.")
    except Exception as e:
        check_scope_error(e, site_url=site_url)
        print(f"Error fetching sitemaps for {site_url}: {e}", file=sys.stderr)
        print("Note: Ensure the siteUrl exact matches GSC (e.g. trailing slash or 'sc-domain:domain').", file=sys.stderr)

    # 2. Fetch Search Analytics Performance (30 days)
    performance_rows = []
    try:
        today = datetime.date.today()
        start_date = (today - datetime.timedelta(days=30)).strftime('%Y-%m-%d')
        end_date = (today - datetime.timedelta(days=2)).strftime('%Y-%m-%d') # GSC data usually has 2-day lag
        
        req_body = {
            'startDate': start_date,
            'endDate': end_date,
            'dimensions': ['page', 'query'],
            'rowLimit': 500
        }
        perf_res = service.searchanalytics().query(siteUrl=site_url, body=req_body).execute()
        performance_rows = perf_res.get('rows', [])
        print(f"Fetched {len(performance_rows)} performance rows (grouped by page & query).")
    except Exception as e:
        check_scope_error(e, site_url=site_url)
        print(f"Error fetching performance metrics: {e}", file=sys.stderr)

    # 3. Fetch URL Inspection details for sitemap URLs
    sitemap_urls = get_urls_from_sitemap(SITEMAP_LOCAL_PATH, limit=limit)
    inspected_urls = []
    
    for idx, url in enumerate(sitemap_urls):
        print(f" [{idx+1}/{len(sitemap_urls)}] Inspecting: {url} ...")
        try:
            inspect_req = {
                'inspectionUrl': url,
                'siteUrl': site_url,
                'languageCode': 'en-US'
            }
            inspect_res = service.urlInspection().index().inspect(body=inspect_req).execute()
            
            result = inspect_res.get('inspectionResult', {})
            index_status = result.get('indexStatusResult', {})
            mobile_usability = result.get('mobileUsabilityResult', {})
            rich_results = result.get('richResultsResult', {})
            
            verdict = index_status.get('verdict', 'NEUTRAL')
            
            # Map index status details
            inspected_urls.append({
                'url': url,
                'verdict': verdict,
                'coverageState': index_status.get('coverageState', 'Unknown'),
                'robotsTxtState': index_status.get('robotsTxtState', 'Unknown'),
                'indexingState': index_status.get('indexingState', 'Unknown'),
                'lastCrawlTime': index_status.get('lastCrawlTime', ''),
                'pageFetchState': index_status.get('pageFetchState', 'Unknown'),
                'googleCanonical': index_status.get('googleCanonical', ''),
                'userCanonical': index_status.get('userCanonical', ''),
                'crawlAllowed': index_status.get('crawlAllowed', True),
                'indexingAllowed': index_status.get('indexingAllowed', True),
                'mobileUsabilityVerdict': mobile_usability.get('verdict', 'NEUTRAL') if mobile_usability else 'PASS',
                'mobileIssues': mobile_usability.get('issues', []) if mobile_usability else [],
                'richResultsVerdict': rich_results.get('verdict', 'NEUTRAL') if rich_results else 'PASS',
                'richDetected': [item.get('name') for item in rich_results.get('detectedItems', [])] if rich_results else []
            })
        except Exception as e:
            check_scope_error(e, site_url=site_url)
            print(f"  Error inspecting {url}: {e}", file=sys.stderr)
            inspected_urls.append({
                'url': url,
                'verdict': 'FAIL',
                'pageFetchState': 'API_ERROR',
                'coverageState': f"GSC API Error: {str(e)}"
            })

    return {
        '_metadata': {
            'siteUrl': site_url,
            'timestamp': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'scrapedBy': 'rcsd-gsc-monitor-pipeline',
            'mode': 'live'
        },
        'sitemaps': sitemaps_data,
        'inspected_urls': inspected_urls,
        'performance': performance_rows
    }


def run_mock_monitoring(site_url, limit):
    """Generates extremely realistic simulated GSC data for dry-run/preview demonstration."""
    print("Running in MOCK mode. Generating realistic Search Console simulation data...")
    
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
    three_days_ago = (datetime.date.today() - datetime.timedelta(days=3)).strftime('%Y-%m-%d')

    # Simulated registered sitemaps
    sitemaps = [
        {
            'path': f"{site_url.rstrip('/')}/sitemap.xml",
            'lastSubmitted': '2026-05-01',
            'lastDownloaded': yesterday,
            'isPending': False,
            'isError': False,
            'status': 'OK',
            'errors': '0',
            'warnings': '0',
            'submitted': '0',
            'type': 'sitemap'
        }
    ]

    # Get local sitemap to pick genuine paths
    real_urls = get_urls_from_sitemap(SITEMAP_LOCAL_PATH, limit=limit)
    if not real_urls:
        real_urls = [
            f"{site_url}",
            f"{site_url}schools/",
            f"{site_url}escuelas/",
            f"{site_url}meetings/",
            f"{site_url}reuniones/",
            f"{site_url}district/",
            f"{site_url}distrito/"
        ]

    # Simulated inspection results
    inspected_urls = []
    
    # Introduce controlled crawl errors for demo wow-factor
    for idx, url in enumerate(real_urls):
        parsed = urlparse(url)
        path = parsed.path
        
        # Scenario A: Garfield school has some mobile usability errors for demonstration
        if 'garfield' in url or 'garfield' in path:
            verdict = 'PARTIAL'
            coverage = 'Indexed, unique page'
            fetch_state = 'SUCCESSFUL'
            mobile_verdict = 'FAIL'
            mobile_issues = [
                {'issueType': 'TAP_TARGETS_TOO_CLOSE', 'severity': 'ERROR', 'name': 'Clickable elements too close together'},
                {'issueType': 'TEXT_TOO_SMALL', 'severity': 'WARNING', 'name': 'Text too small to read'}
            ]
            google_canonical = url
        # Scenario B: A hypothetical document or non-existent file with fetch error
        elif idx == len(real_urls) - 1:
            url = f"{site_url.rstrip('/')}/meetings/2026-05-27/non-existent-agenda.pdf"
            verdict = 'FAIL'
            coverage = 'Not indexed: Crawl anomaly (Soft 404)'
            fetch_state = 'SOFT_404'
            mobile_verdict = 'NEUTRAL'
            mobile_issues = []
            google_canonical = ""
        # Scenario C: Regular successfully indexed pages
        else:
            verdict = 'PASS'
            coverage = 'Indexed, unique page'
            fetch_state = 'SUCCESSFUL'
            mobile_verdict = 'PASS'
            mobile_issues = []
            google_canonical = url

        inspected_urls.append({
            'url': url,
            'verdict': verdict,
            'coverageState': coverage,
            'robotsTxtState': 'ALLOWED',
            'indexingState': 'INDEXING_ALLOWED',
            'lastCrawlTime': three_days_ago + 'T04:12:35Z',
            'pageFetchState': fetch_state,
            'googleCanonical': google_canonical,
            'userCanonical': url,
            'crawlAllowed': True,
            'indexingAllowed': True,
            'mobileUsabilityVerdict': mobile_verdict,
            'mobileIssues': mobile_issues,
            'richResultsVerdict': 'PASS',
            'richDetected': ['Breadcrumbs', 'Organization']
        })

    # Simulated performance analytics (realistic keywords and values)
    performance = [
        {'keys': [f"{site_url}", 'redwood city school district'], 'clicks': 850, 'impressions': 12000, 'ctr': 0.0708, 'position': 1.4},
        {'keys': [f"{site_url}meetings/", 'rcsd board meetings'], 'clicks': 320, 'impressions': 4500, 'ctr': 0.0711, 'position': 2.1},
        {'keys': [f"{site_url}schools/", 'redwood city schools'], 'clicks': 210, 'impressions': 3100, 'ctr': 0.0677, 'position': 3.5},
        {'keys': [f"{site_url}schools/adelante-selby/", 'adelante selby school'], 'clicks': 180, 'impressions': 1200, 'ctr': 0.15, 'position': 1.1},
        {'keys': [f"{site_url}escuelas/garfield/", 'garfield elementary school redwood city'], 'clicks': 95, 'impressions': 980, 'ctr': 0.0969, 'position': 1.2},
        {'keys': [f"{site_url}budget/", 'rcsd budget'], 'clicks': 40, 'impressions': 550, 'ctr': 0.0727, 'position': 4.8}
    ]

    return {
        '_metadata': {
            'siteUrl': site_url,
            'timestamp': timestamp,
            'scrapedBy': 'rcsd-gsc-monitor-pipeline',
            'mode': 'mock'
        },
        'sitemaps': sitemaps,
        'inspected_urls': inspected_urls,
        'performance': performance
    }


def generate_markdown_report(data, output_path):
    """Compiles GSC details into a beautiful human-readable markdown dashboard."""
    meta = data['_metadata']
    timestamp = meta['timestamp']
    site_url = meta['siteUrl']
    mode = meta['mode']
    
    inspected = data['inspected_urls']
    sitemaps = data['sitemaps']
    performance = data['performance']
    
    # Calculate inspection statistics
    total_inspected = len(inspected)
    pass_count = sum(1 for item in inspected if item['verdict'] == 'PASS')
    partial_count = sum(1 for item in inspected if item['verdict'] == 'PARTIAL')
    fail_count = sum(1 for item in inspected if item['verdict'] == 'FAIL')
    
    # Extract hard crawl errors and pending indexation
    crawl_errors = []
    pending_index = []
    
    for item in inspected:
        verdict = item.get('verdict', 'NEUTRAL')
        fetch_state = item.get('pageFetchState', 'Unknown')
        
        # If verdict is FAIL, or fetch state is a hard error (not successful, not unspecified, not api error)
        if verdict == 'FAIL' or (fetch_state != 'SUCCESSFUL' and fetch_state != 'PAGE_FETCH_STATE_UNSPECIFIED' and fetch_state != 'Unknown' and fetch_state != 'API_ERROR'):
            crawl_errors.append(item)
        elif verdict == 'NEUTRAL' or fetch_state == 'PAGE_FETCH_STATE_UNSPECIFIED':
            pending_index.append(item)
            
    usability_issues = [item for item in inspected if item.get('mobileUsabilityVerdict') == 'FAIL' or len(item.get('mobileIssues', [])) > 0]
    
    status_emoji = "🟢 OK"
    if fail_count > 0:
        status_emoji = "🔴 ACTION REQUIRED"
    elif partial_count > 0 or len(crawl_errors) > 0:
        status_emoji = "🟡 WARNINGS FOUND"
        
    md = f"""# Google Search Console Indexing & Crawl Error Monitor

This report represents an active audit of the search footprint and crawler health for **{site_url}**.
Generated on `{timestamp}`. GSC Property URL: `{site_url}` (Mode: `{mode.upper()}`).

## System Status: {status_emoji}

- **Total Audited URLs:** {total_inspected}
- **Successfully Indexed (Pass):** {pass_count} / {total_inspected}
- **Indexed with warnings (Partial):** {partial_count} / {total_inspected}
- **Crawl Errors / Index Failures (Fail):** {fail_count} / {total_inspected}
- **Pending Indexation / Discovery:** {len(pending_index)} / {total_inspected}

---

## 🗺️ Registered Sitemaps Status

The following sitemaps are registered with Google Search Console for search indexing:

| Sitemap URL | Last Submitted | Last Fetched | Status | Warnings | Errors | Discovered URLs |
|:------------|:---------------|:-------------|:-------|:---------|:-------|:----------------|
"""

    for s in sitemaps:
        md += f"| `{s.get('path', 'n/a')}` | {s.get('lastSubmitted', 'n/a')} | {s.get('lastDownloaded', 'n/a')} | **{s.get('status', 'n/a')}** | {s.get('warnings', '0')} | {s.get('errors', '0')} | {s.get('submitted', '0')} |\n"

    md += """
---

## 🚫 Indexing & Crawling Errors

List of pages failing search indexation, blocked, or returning scraping anomalies:

"""

    if not crawl_errors:
        md += "> 🟢 **No crawl or fetch errors detected on inspected pages!** Everything is successfully requested by Googlebot.\n"
    else:
        md += "| URL | Verdict | Fetch State | Coverage / Index Status | Robots.txt |\n"
        md += "|:----|:--------|:------------|:-------------------------|:-----------|\n"
        for err in crawl_errors:
            md += f"| [`{err['url']}`]({err['url']}) | 🔴 **{err['verdict']}** | `{err.get('pageFetchState', 'UNKNOWN')}` | {err.get('coverageState', 'n/a')} | `{err.get('robotsTxtState', 'n/a')}` |\n"

    md += """
---

## ⏳ Pending Crawl / Unknown to Google

Pages that are published in the sitemap but have not been crawled or indexed by Googlebot yet (this is normal for recently updated pages):

"""

    if not pending_index:
        md += "> 🟢 **No pending pages in this batch.** All audited pages have been visited by Googlebot!\n"
    else:
        md += "| URL | Verdict | Fetch State | Coverage / Index Status |\n"
        md += "|:----|:--------|:------------|:-------------------------|\n"
        for item in pending_index:
            md += f"| [`{item['url']}`]({item['url']}) | 🟡 **{item['verdict']}** | `{item.get('pageFetchState', 'UNKNOWN')}` | {item.get('coverageState', 'n/a')} |\n"


    md += """
---

## 📱 Mobile Usability & Rich Snippet Warnings

Pages that are indexed but have layout issues, or failed rich snippet schemas (e.g. Breadcrumbs):

"""

    if not usability_issues:
        md += "> 🟢 **No mobile usability errors or warning states found!** Pages meet mobile accessibility standards.\n"
    else:
        md += "| URL | Usability Verdict | Detected Usability Issues | Rich Snippets Status |\n"
        md += "|:----|:------------------|:--------------------------|:---------------------|\n"
        for item in usability_issues:
            issues_str = ", ".join([f"**{i.get('name', 'Issue')}** ({i.get('severity', 'Warning')})" for i in item.get('mobileIssues', [])])
            if not issues_str:
                issues_str = "None"
            md += f"| [`{item['url']}`]({item['url']}) | 🟡 **{item.get('mobileUsabilityVerdict')}** | {issues_str} | **{item.get('richResultsVerdict', 'PASS')}** ({', '.join(item.get('richDetected', []))}) |\n"

    md += """
---

## 📈 Top 30-Day Search Performance & Impressions

Top pages and organic search queries driving traffic to the website:

| Target Page URL | Search Query / Keyword | Organic Clicks | Total Impressions | Click-Through Rate (CTR) | Avg Position |
|:----------------|:-----------------------|:---------------|:------------------|:-------------------------|:-------------|
"""

    for row in performance[:15]:  # Show top 15 rows
        keys = row.get('keys', [])
        page = keys[0] if len(keys) > 0 else "n/a"
        query = keys[1] if len(keys) > 1 else "(not set)"
        ctr = row.get('ctr', 0.0) * 100
        md += f"| [`{page}`]({page}) | `{query}` | {row.get('clicks', 0)} | {row.get('impressions', 0)} | {ctr:.2f}% | {row.get('position', 0.0):.1f} |\n"

    md += """
---

## 🔍 Detailed URL Audit Log

Complete checklist of inspected URLs from this audit batch:

| Inspected URL | Overall Verdict | Crawl Allowed | Indexing Allowed | Google Canonical Match |
|:--------------|:----------------|:-------------:|:----------------:|:-----------------------|
"""

    for item in inspected:
        c_allowed = "✅" if item.get('crawlAllowed', True) else "❌"
        i_allowed = "✅" if item.get('indexingAllowed', True) else "❌"
        g_canon = item.get('googleCanonical', '')
        u_canon = item.get('userCanonical', '')
        
        canon_match = "✅ Match"
        if g_canon and u_canon and g_canon.rstrip('/') != u_canon.rstrip('/'):
            canon_match = f"⚠️ Mismatch (`{g_canon}`)"
        elif not g_canon:
            canon_match = "Unknown"
            
        md += f"| [`{item['url']}`]({item['url']}) | **{item['verdict']}** | {c_allowed} | {i_allowed} | {canon_match} |\n"

    md += f"""
---

## ℹ️ Provenance Block
- **DataSource:** Google Search Console API
- **Date Checked:** `{timestamp}`
- **Method:** Static sitemap-seeded URL Inspection and Analytics Query
- **Audit Tool:** `scripts/gsc_monitor.py`
"""

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w') as f:
        f.write(md.strip() + '\n')
    print(f"Generated markdown report saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Google Search Console SEO & Crawl Error Monitor")
    parser.add_argument('--mock', action='store_true', help="Run in mock simulation mode (no credentials required)")
    parser.add_argument('--site-url', type=str, help="Search Console Site URL property (overrides GSC_SITE_URL env)")
    parser.add_argument('--limit', type=int, default=15, help="Limit number of sitemap URLs to inspect (default: 15)")
    args = parser.parse_args()

    site_url = args.site_url or os.environ.get('GSC_SITE_URL') or DEFAULT_SITE_URL
    # Ensure trailing slash if it is a standard URL prefix property
    if site_url.startswith('http') and not site_url.endswith('/'):
        site_url += '/'

    # Deciding whether to run mock or live
    if args.mock:
        gsc_data = run_mock_monitoring(site_url, limit=args.limit)
    else:
        credentials = authenticate_gsc()
        if not credentials:
            print_setup_guide()
            # Exit cleanly so the user can easily see setup guide on initial execution
            sys.exit(0)
        
        gsc_data = run_live_monitoring(credentials, site_url, limit=args.limit)

    # Save raw GSC data in data folder
    os.makedirs(os.path.dirname(OUTPUT_DATA_PATH), exist_ok=True)
    with open(OUTPUT_DATA_PATH, 'w') as f:
        json.dump(gsc_data, f, indent=2)
    print(f"Raw data saved to {OUTPUT_DATA_PATH}")

    # Compile and generate GSC markdown dashboard report
    generate_markdown_report(gsc_data, OUTPUT_REPORT_PATH)
    print("\nGSC Monitoring successfully completed!")


if __name__ == '__main__':
    main()
