#!/usr/bin/env node
/**
 * Full data pipeline — run after new meetings are scraped or videos posted.
 * Idempotent: safe to re-run at any time. Each step skips already-processed data.
 *
 * Usage:
 *   node scripts/run-pipeline.mjs           # full pipeline
 *   node scripts/run-pipeline.mjs --quick   # skip transcription/translation (for agenda-only updates)
 */

import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const quick = process.argv.includes('--quick');
const upload = process.argv.includes('--upload');
const deploy = process.argv.includes('--deploy');

function run(label, script) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(60));
  try {
    execFileSync('node', [resolve(ROOT, 'scripts', script)], { cwd: ROOT, stdio: 'inherit', timeout: 1800000 });
  } catch (err) {
    console.error(`\n  FAILED: ${label} (${script})`);
    console.error(`  ${err.message}\n`);
    process.exit(1);
  }
}

console.log(`\nRCSD Pipeline — ${new Date().toISOString()}`);
console.log(`Mode: ${quick ? 'QUICK (skip transcription/translation)' : 'FULL'}\n`);

// Phase 0: Pull any newly-posted Simbli agendas (items + attachments) before
// the build reads them. Idempotent — only fetches MIDs without a memo file.
run('0. Scrape new Simbli agendas', 'scrape-simbli-agendas.mjs');
run('0a. Scrape new YouTube videos', 'scrape-youtube-index.mjs');

// Phase 1: Data assembly
run('1. Build meetings data', 'build-meetings.mjs');

if (!quick) {
  // Restore any existing transcription/translation caches to avoid duplicate API calls
  run('1b. Restore cache from CDN', 'restore-cache.mjs');

  // Phase 2: Audio + transcription (slow, costs API $)
  run('2. Download audio', 'download-audio.mjs');
  run('3. Transcribe (AssemblyAI)', 'transcribe-assemblyai.mjs');
  run('4. Slim transcripts', 'publish-transcripts.mjs');
  run('5. Translate transcripts (ES)', 'translate-transcripts.mjs');

  // Phase 3: LLM enrichment (costs API $)
  run('6. Chapter markers', 'extract-chapter-markers.mjs');
  run('7. Timestamp mapping', 'map-timestamps-llm.mjs');

  // Phase 4: Rebuild with enrichment data
  run('8. Rebuild meetings data', 'build-meetings.mjs');
}

// Phase 5: Summaries + HTML generation
let step = quick ? 2 : 9;
run(`${step++}. Meeting summaries`, 'generate-meeting-summaries.mjs');
run(`${step++}. OG images`, 'generate-og-images.mjs');
run(`${step++}. Meetings index`, 'build-meetings-html.mjs');
run(`${step++}. iCalendar feeds`, 'build-ics.mjs');
run(`${step++}. Meeting detail pages`, 'build-meeting-pages.mjs');
run(`${step++}. Homepage`, 'build-homepage.mjs');
run(`${step++}. School pages`, 'build-schools.mjs');
run(`${step++}. Charter school pages`, 'build-charters.mjs');
run(`${step++}. Blog`, 'build-blog.mjs');

console.log(`\n${'='.repeat(60)}`);
console.log('  Pipeline complete!');
console.log('='.repeat(60));

if (upload) {
  run('Upload data & transcripts to Cloudflare R2', 'upload-to-r2.mjs');
} else {
  console.log('\nUpload data to R2 (run with --upload to automate):');
  console.log('  node scripts/upload-to-r2.mjs');
}

if (deploy) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('  Deploying to Cloudflare Pages');
  console.log('='.repeat(60));
  try {
    execFileSync('npx', ['wrangler', 'pages', 'deploy', 'docs', '--project-name=rcsd-meetings'], { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    console.error(`\n  FAILED: Wrangler Deploy`);
    console.error(`  ${err.message}\n`);
    process.exit(1);
  }
} else {
  console.log('\nDeploy (run with --deploy to automate):');
  console.log('  npx wrangler pages deploy docs --project-name=rcsd-meetings');
}
console.log('');
