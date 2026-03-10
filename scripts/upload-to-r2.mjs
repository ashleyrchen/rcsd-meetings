#!/usr/bin/env node
/**
 * Upload local artifacts to Cloudflare R2 bucket for public archival hosting.
 *
 * Uses rclone to sync artifacts/ to the rcsd-meetings R2 bucket.
 * Only uploads new or changed files (by size/checksum).
 *
 * Usage:
 *   node scripts/upload-to-r2.mjs              # sync (upload new/changed only)
 *   node scripts/upload-to-r2.mjs --dry-run    # show what would be uploaded
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
const BUCKET = 'r2:rcsd-meetings';

const dryRun = process.argv.includes('--dry-run');

const args = [
  'sync',
  ARTIFACTS_DIR,
  BUCKET,
  '--progress',
  '--stats-one-line',
  '-v',
];

if (dryRun) args.push('--dry-run');

console.log(`Syncing artifacts to R2: ${ARTIFACTS_DIR} → ${BUCKET}`);
if (dryRun) console.log('(dry run)\n');

try {
  execFileSync('rclone', args, { stdio: 'inherit', timeout: 600_000 });
} catch (err) {
  process.exit(err.status || 1);
}

// Also sync data/*.json files to data/ prefix
const DATA_DIR = resolve(ROOT, 'data');
const dataArgs = [
  'copy',
  DATA_DIR,
  `${BUCKET}/json`,
  '--include', '*.json',
  '--max-depth', '1',
  '--progress',
  '--stats-one-line',
  '-v',
];
if (dryRun) dataArgs.push('--dry-run');

console.log(`\nSyncing data JSON to R2: ${DATA_DIR} → ${BUCKET}/data`);
try {
  execFileSync('rclone', dataArgs, { stdio: 'inherit', timeout: 120_000 });
} catch (err) {
  process.exit(err.status || 1);
}
