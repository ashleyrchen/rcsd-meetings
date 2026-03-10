#!/usr/bin/env node
/**
 * Upload local files to Cloudflare R2 bucket for public archival hosting.
 *
 * Default mode uses `rclone copy` (additive-only, never deletes remote files).
 * Use --sync for a full mirror that also removes remote files not present locally.
 *
 * Usage:
 *   node scripts/upload-to-r2.mjs              # copy new/changed files only
 *   node scripts/upload-to-r2.mjs --dry-run    # show what would be uploaded
 *   node scripts/upload-to-r2.mjs --sync       # full mirror (deletes stale remote files)
 *
 * Requires: rclone configured with an "r2" remote that has read+write+list
 * permissions on the rcsd-meetings bucket.
 *
 * Setup: brew install rclone && rclone config
 *   - Type: s3, Provider: Cloudflare
 *   - Create an R2 API token with "Object Read & Write" permission
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ARTIFACTS_DIR = resolve(ROOT, 'artifacts');
const DATA_DIR = resolve(ROOT, 'data');
const BUCKET = 'r2:rcsd-meetings';

const dryRun = process.argv.includes('--dry-run');
const fullSync = process.argv.includes('--sync');
const verb = fullSync ? 'sync' : 'copy';

function run(label, args) {
  if (dryRun) args.push('--dry-run');
  console.log(`\n${label}`);
  try {
    execFileSync('rclone', args, { stdio: 'inherit', timeout: 600_000 });
  } catch (err) {
    process.exit(err.status || 1);
  }
}

// 1. Artifacts → bucket root (exclude json/ which is managed separately)
run(`${verb} artifacts → ${BUCKET}`, [
  verb,
  ARTIFACTS_DIR,
  BUCKET,
  '--exclude', 'json/**',
  '--progress',
  '--stats-one-line',
  '-v',
]);

// 2. data/**/*.json → json/ prefix (exclude local-only caches)
run(`${verb} data → ${BUCKET}/json`, [
  verb,
  DATA_DIR,
  `${BUCKET}/json`,
  '--filter', '- llm-timestamp-cache/**',
  '--filter', '+ *.json',
  '--filter', '- *',
  '--progress',
  '--stats-one-line',
  '-v',
]);
