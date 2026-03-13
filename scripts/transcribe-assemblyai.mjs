#!/usr/bin/env node
/**
 * Transcribe board meeting audio with AssemblyAI Universal 3 Pro.
 *
 * For each meeting with a YouTube video:
 *   1. Check if we already have a cached AssemblyAI transcript
 *   2. Download audio via yt-dlp to a temp file
 *   3. Upload to AssemblyAI, transcribe with speaker diarization
 *   4. Cache the full JSON response, clean up temp audio
 *
 * Cache: artifacts/transcripts-aai/{videoId}.json  (full AAI response)
 *
 * Usage:
 *   node scripts/transcribe-assemblyai.mjs                    # all unprocessed
 *   node scripts/transcribe-assemblyai.mjs --date 2026-01-14  # single meeting
 *   node scripts/transcribe-assemblyai.mjs --force            # reprocess all
 *   node scripts/transcribe-assemblyai.mjs --limit 5          # process at most 5
 *   node scripts/transcribe-assemblyai.mjs --oldest-first     # chronological order
 *
 * Env: ASSEMBLYAI_API_KEY (or pass via --key)
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { AssemblyAI } from 'assemblyai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CACHE_DIR = resolve(ROOT, 'artifacts/transcripts-aai');
const AUDIO_DIR = resolve(ROOT, 'artifacts/audio');

mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(AUDIO_DIR, { recursive: true });

// ---- Parse CLI args ----
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const forceAll = args.includes('--force');
const oldestFirst = args.includes('--oldest-first');
const filterDate = arg('date');
const limit = arg('limit') ? parseInt(arg('limit'), 10) : Infinity;
const apiKey = arg('key') || process.env.ASSEMBLYAI_API_KEY;

if (!apiKey) {
  console.error('Error: Set ASSEMBLYAI_API_KEY or pass --key <key>');
  process.exit(1);
}

const client = new AssemblyAI({ apiKey });

// ---- Load meetings ----
const meetingsRaw = JSON.parse(readFileSync(resolve(ROOT, 'data/meetings-data.json'), 'utf-8'));
const meetings = (meetingsRaw.meetings || meetingsRaw)
  .filter(m => m.youtube)
  .sort((a, b) => oldestFirst
    ? a.date.localeCompare(b.date)
    : b.date.localeCompare(a.date));

console.log(`${meetings.length} meetings with video`);

function cachePath(videoId) {
  return resolve(CACHE_DIR, `${videoId}.json`);
}

function hasCached(videoId) {
  return !forceAll && existsSync(cachePath(videoId));
}

/**
 * Download audio from YouTube to a local file via yt-dlp.
 * Skips download if audio already cached locally.
 * Returns the path to the audio file.
 */
function downloadAudio(videoId) {
  // Check if we already have it cached
  for (const ext of ['webm', 'm4a', 'opus', 'ogg', 'mp3']) {
    const p = resolve(AUDIO_DIR, `${videoId}.${ext}`);
    if (existsSync(p)) return p;
  }

  const outTemplate = resolve(AUDIO_DIR, `${videoId}.%(ext)s`);
  execFileSync('yt-dlp', [
    '-f', 'bestaudio',
    '--no-warnings',
    '-o', outTemplate,
    `https://www.youtube.com/watch?v=${videoId}`,
  ], { encoding: 'utf-8', timeout: 300_000, stdio: 'pipe' });

  for (const ext of ['webm', 'm4a', 'opus', 'ogg', 'mp3']) {
    const p = resolve(AUDIO_DIR, `${videoId}.${ext}`);
    if (existsSync(p)) return p;
  }
  throw new Error(`Audio file not found after download for ${videoId}`);
}

/**
 * Upload local audio to AssemblyAI and transcribe with diarization.
 * Returns the full transcript object.
 */
async function transcribe(audioPath) {
  const transcript = await client.transcripts.transcribe({
    audio: audioPath,
    speech_model: 'best',
    speaker_labels: true,
    word_boost: [
      // Board members and district leadership
      'Redwood City School District', 'RCSD',
      'Trustee Weekly', 'Trustee Sena', 'Trustee Hanna', 'Trustee Varma', 'Trustee Patel',
      'Superintendent Ramsey', 'Dr. Ramsey',
      // School names
      'Adelante Selby', 'Clifford', 'Garfield', 'Henry Ford',
      'Hoover', 'Kennedy', 'McKinley', 'North Star',
      'Orion', 'Roosevelt', 'Roy Cloud', 'Taft',
      // Common terms
      'LCAP', 'SPSA', 'CAASPP', 'ELPAC', 'CSSP',
      'Measure U', 'Measure S',
      'Brown Act', 'consent agenda',
      'ParentSquare', 'Simbli', 'BoardDocs',
    ],
  });

  return transcript;
}

// ---- Main ----
async function main() {
  const toProcess = meetings.filter(m => {
    if (filterDate && m.date !== filterDate) return false;
    if (hasCached(m.youtube)) return false;
    return true;
  });

  if (toProcess.length === 0) {
    console.log('All meetings already transcribed.');
    return;
  }

  const batch = toProcess.slice(0, limit);
  console.log(`Transcribing ${batch.length} meetings (${toProcess.length} total remaining)...\n`);

  let done = 0;
  let failed = 0;
  const totalHours = batch.reduce((s, m) => s + (m.durationSeconds || 0), 0) / 3600;
  console.log(`Estimated audio: ${totalHours.toFixed(1)} hours (~$${(totalHours * 0.37).toFixed(2)} at $0.37/hr)\n`);

  for (const mtg of batch) {
    const videoId = mtg.youtube;
    const label = `[${done + failed + 1}/${batch.length}] ${mtg.date} (${mtg.duration || '?'})`;
    let audioPath = null;

    try {
      console.log(`${label} — Downloading audio...`);
      audioPath = downloadAudio(videoId);
      console.log(`${label} — Uploading & transcribing with AssemblyAI...`);
      const transcript = await transcribe(audioPath);

      if (transcript.status === 'error') {
        console.error(`${label} — AssemblyAI error: ${transcript.error}`);
        failed++;
        continue;
      }

      // Cache full response
      writeFileSync(cachePath(videoId), JSON.stringify(transcript, null, 2));
      const words = transcript.words?.length || 0;
      const speakers = new Set(transcript.utterances?.map(u => u.speaker) || []).size;
      console.log(`${label} — Done: ${words} words, ${speakers} speakers\n`);
      done++;

    } catch (err) {
      console.error(`${label} — Failed: ${err.message?.slice(0, 200)}`);
      failed++;
    }
  }

  console.log(`\nComplete: ${done} transcribed, ${failed} failed, ${meetings.length - toProcess.length} already cached`);
  if (done > 0) {
    console.log(`Cached to: ${CACHE_DIR}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
