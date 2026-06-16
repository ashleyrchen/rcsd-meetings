# Runbook: trogdor as the self-hosted transcription runner

**Goal:** Run the full ingestion pipeline — including AssemblyAI transcription and
Spanish translation — on **trogdor** (home server, residential IP, on Tailscale),
because YouTube blocks `yt-dlp` from GitHub's datacenter IPs.

**Decision (2026-06-15):** Self-hosted GitHub Actions runner on trogdor, running the
**full** `run-pipeline.mjs` on the twice-daily schedule. Hosted `ubuntu-latest` stays
available as a manual fallback (agenda-only; it skips transcription by design).

## Why this is needed

`scripts/transcribe-assemblyai.mjs:48` hard-exits when
`RUNNER_ENVIRONMENT === 'github-hosted'`:

```js
if (process.env.RUNNER_ENVIRONMENT === 'github-hosted') {
  // "...audio cannot be downloaded from YouTube on datacenter IPs."
  process.exit(0);
}
```

The scheduled cron runs on `ubuntu-latest` (no `workflow_dispatch` inputs → the
`runs-on` default), so **every cron run skips transcription**. Transcription only
ever ran via a manual self-hosted dispatch; the last one was **2026-06-01**, and the
self-hosted runner is now deregistered (`actions/runners` count = 0). Result: the
June 10 2026 meeting (`Os_dph0g_PQ`, uploaded to YouTube 2026-06-12, scraped
2026-06-13) — and May 27 (`7Ri8cI3wF-o`) — sit untranscribed.

## trogdor recon (2026-06-15)

- Ubuntu 24.04.4 LTS, x86_64, 125 GiB RAM. Reachable as `dew@trogdor`.
- Installed: node 18.19.1, npm, git 2.43, ffmpeg. **Missing: yt-dlp, rclone.**
- YouTube reachable (HTTP 200). Chromium system libs already present (no `--with-deps` needed).
- **BLOCKER: root FS 100% full (0 bytes free).** Consumers: `~/immich` 1.2 TB,
  `~/photo-archive-staging` 314 GB, `~/photo-staging` 29 GB, `~/.cache` 51 GB.
- **BLOCKER: no passwordless sudo for `dew`.**

## Prerequisites (need David)

### Disk: root FS was 100% full (resolved / in progress)

Root FS (`/`, 1.8 TB LVM) hit **100% full** on 2026-06-15, which crash-looped
`immich_postgres` (`FATAL: could not write lock file: No space left on device`).
A separate **3.6 TB NVMe is mounted at `/mnt/data` with 3.2 TB free** — the fix is
to move data there, not delete it.

- **Done (2026-06-15):** cleared regenerable model caches
  `~/.cache/{huggingface,suno,whisper,uv}` (~50 GB) → freed to 48 GB / 98%; immich
  recovered. These re-download on next ML run; no data loss.
- **Next (needs sudo, David runs):** relocate the **1.2 TB `~/immich/library`** to
  `/mnt/data` via the staged script `/home/dew/migrate-immich.sh`:
  ```bash
  sudo bash /home/dew/migrate-immich.sh
  ```
  It is non-destructive — Phase 1 relocates the rest of `~/.cache` + prunes; Phase 2
  **copies** the library to `/mnt/data/immich/library`, verifies file-count + byte
  size match, backs up `.env`, repoints `UPLOAD_LOCATION`, and restarts immich. It
  does **not** delete the original. After confirming photos load in the web UI,
  reclaim the 1.2 TB by hand: `sudo rm -rf /home/dew/immich/library`.
  (`~/immich/postgres` stays on `/` — small, fine once there's room.)

### For the runner itself
**A sudo window** for: installing yt-dlp + rclone, and registering the runner
systemd service (steps below).

## Setup steps (once prerequisites are met)

### 1. Install deps on trogdor (sudo)

```bash
# yt-dlp (residential-IP YouTube downloads)
sudo wget -q https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -O /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp
# rclone (R2 sync/upload)
sudo apt-get update && sudo apt-get install -y rclone
yt-dlp --version && rclone version | head -1
```

### 2. Register the GitHub Actions runner on trogdor

```bash
# Get a registration token from your Mac:
gh api -X POST repos/dweekly/rcsd-meetings/actions/runners/registration-token --jq .token

# On trogdor:
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o runner.tar.gz -L https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64-<VER>.tar.gz
tar xzf runner.tar.gz
./config.sh --url https://github.com/dweekly/rcsd-meetings --token <TOKEN> \
  --name trogdor --labels self-hosted,linux,x64 --unattended
sudo ./svc.sh install dew && sudo ./svc.sh start    # run as a service, as user dew
```

Secrets (ASSEMBLYAI_API_KEY, ANTHROPIC_API_KEY, Cloudflare/R2) are injected by
GitHub into the job env — they do **not** need to be stored on trogdor.
`actions/setup-node@v4` installs node 22 into the runner toolcache, so trogdor's
system node 18 is irrelevant.

### 3. Workflow edits (`.github/workflows/pipeline.yml`) — separate PR

- **Point the schedule at trogdor:** default `runs-on` to `self-hosted`
  (`${{ github.event.inputs.runner || 'self-hosted' }}`). Keep `ubuntu-latest`
  selectable via `workflow_dispatch` as a fallback.
- **Gate the sudo install steps to hosted only:** add
  `if: runner.environment == 'github-hosted'` to the yt-dlp + rclone install steps
  (trogdor has them pre-installed; no passwordless sudo there).
- **Playwright:** use `--with-deps` only on github-hosted; plain
  `npx playwright install chromium` on self-hosted (libs already present).
- **Concurrency:** add `concurrency: { group: pipeline, cancel-in-progress: false }`
  so an overlapping scheduled + dispatch run queues instead of colliding on
  `git push` / Pages deploy.

> Do **not** merge the workflow PR until the runner is registered and online,
> or the next cron will queue with no runner to pick it up.

### 4. Verify

```bash
gh api repos/dweekly/rcsd-meetings/actions/runners --jq '.total_count'   # expect >= 1
gh workflow run pipeline.yml -f quick=false -f runner=self-hosted        # manual kick
gh run watch <id>                                                        # watch transcribe step
curl -s -o /dev/null -w '%{http_code}\n' https://data.rcsd.info/transcripts/Os_dph0g_PQ.json  # expect 200
```

Backlog to clear on first run: May 27 (`7Ri8cI3wF-o`) + June 10 (`Os_dph0g_PQ`).
The pipeline is idempotent — already-transcribed meetings restore from R2 and skip.

## Operational notes

- If trogdor is offline at cron time, scheduled runs queue (full pipeline now depends
  on home-server uptime — accepted tradeoff). Manual `ubuntu-latest` dispatch is the
  agenda-only fallback.
- Keep ~20+ GB free on trogdor for the audio cache (`artifacts/audio/`, ~100 MB/meeting).
