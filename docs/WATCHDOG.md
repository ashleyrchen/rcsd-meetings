# Drift Watchdog

`scripts/watchdog.mjs` is an **independent** monitor that alerts (and optionally
self-heals) when the published site falls behind reality — the failure mode that
left the **2026-06-10** board meeting untranscribed for days with no signal.

It runs from a plain cron on **trogdor** (not from GitHub Actions), so it can also
catch the pipeline itself being down: runner offline, cron disabled, or
transcription silently failing.

## What it checks

Against `https://data.rcsd.info/json/meetings-data.json` (the published index),
the YouTube channel (`yt-dlp`), and the Simbli listing (the repo's scraper):

| Check | Gap condition |
|-------|---------------|
| **untranscribed** | a past meeting has a `youtube` id but `hasTranscript:false` |
| **undiscovered** | a channel video's id is in no meeting's `youtube` |
| **un-ingested** | a Simbli meeting (`mid`) is absent from `meetings-data.json` |

Each check is gated by `WATCHDOG_GRACE_HOURS` (default 36) so a freshly-posted
video/agenda doesn't alert before the next normal pipeline cycle. Future-dated
meetings with no video are expected and never flagged for transcription.

## On a gap

1. **Self-heal (guarded):** dispatch `pipeline.yml` (`runner=self-hosted`,
   `quick=false`) — but never while a run is queued/in-progress, and at most once
   per `WATCHDOG_COOLDOWN_HOURS` (default 12). Set `WATCHDOG_AUTO_TRIGGER=0` for
   alert-only.
2. **Alert:** ntfy push + Mailgun email, deduped per gap within the cooldown.

No gaps → no output, no alert. Always exits 0 unless the watchdog itself errors.

## Setup on trogdor

```bash
# 1. Node 22 (repo scripts need it; trogdor ships 18)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Dedicated checkout (root FS has room now; or use a dew-owned dir on /mnt/data)
git clone https://github.com/dweekly/rcsd-meetings.git ~/rcsd-watchdog
cd ~/rcsd-watchdog && npm ci && npx playwright install chromium

# 3. Config (chmod 600). Reuse the existing ~/.config/monitor/mailgun.env vars.
install -m 600 /dev/stdin ~/.config/monitor/rcsd-watchdog.env <<'ENV'
export NTFY_TOPIC=rcsd-watchdog-<your-random-suffix>
export GH_TOKEN=github_pat_xxx          # fine-grained PAT, repo dweekly/rcsd-meetings,
                                        #   Actions: Read and write
export ALERT_EMAIL=david@weekly.org
# MAILGUN_API_KEY / MAILGUN_DOMAIN come from mailgun.env
ENV

# 4. Wrapper the cron calls
install -m 755 /dev/stdin ~/scripts/check-rcsd.sh <<'SH'
#!/usr/bin/env bash
source ~/.config/monitor/mailgun.env
source ~/.config/monitor/rcsd-watchdog.env
cd ~/rcsd-watchdog && git pull -q
node scripts/watchdog.mjs
SH
```

Crontab (every 6h, offset from the 6/18 UTC pipeline cron):

```cron
0 2,8,14,20 * * * /home/dew/scripts/check-rcsd.sh >> /home/dew/scripts/check-rcsd.log 2>&1
```

### Verify

```bash
# Dry run — prints decisions, dispatches nothing, sends nothing:
WATCHDOG_DRY_RUN=1 node ~/rcsd-watchdog/scripts/watchdog.mjs
# Force one real alert to confirm ntfy/email wiring (temporarily tiny grace):
WATCHDOG_AUTO_TRIGGER=0 WATCHDOG_GRACE_HOURS=0 node ~/rcsd-watchdog/scripts/watchdog.mjs
```

## Config reference

| Env | Default | Notes |
|-----|---------|-------|
| `WATCHDOG_DATA_URL` | `…/json/meetings-data.json` | published index |
| `WATCHDOG_GRACE_HOURS` | `36` | age before an item counts as a gap |
| `WATCHDOG_COOLDOWN_HOURS` | `12` | re-alert / re-trigger suppression |
| `WATCHDOG_AUTO_TRIGGER` | `1` | `0` = alert-only |
| `WATCHDOG_DRY_RUN` | — | `1` = decide but don't act |
| `WATCHDOG_STATE_FILE` | `~/.local/state/rcsd-watchdog/state.json` | dedup state |
| `GH_TOKEN` / `GITHUB_TOKEN` | — | PAT, Actions read+write |
| `NTFY_TOPIC` | — | ntfy.sh push topic |
| `MAILGUN_API_KEY`/`MAILGUN_DOMAIN`/`ALERT_EMAIL` | — | email alerts |
