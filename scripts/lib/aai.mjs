/**
 * Shared helpers for reading the AssemblyAI raw-transcript cache.
 * The cache lives at artifacts/transcripts-aai/{videoId}.json (keyed by YouTube video ID,
 * which is globally unique — so board and committee recordings never collide).
 *
 * Used by build-meetings.mjs (board) and build-committees.mjs (committees) so the
 * "does this video have a transcript / how long is it" logic stays in one place.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/lib/aai.mjs -> repo root is two levels up
const ROOT = resolve(__dirname, '..', '..');
const AAI_DIR = resolve(ROOT, 'artifacts/transcripts-aai');

/** True if a transcribed AAI response is cached for this video ID. */
export function hasTranscript(videoId) {
  if (!videoId) return false;
  return existsSync(resolve(AAI_DIR, `${videoId}.json`));
}

/**
 * Read the audio duration from the cached AAI response.
 * Returns { seconds, display } (e.g. "1h 12m" / "47m") or null if no usable transcript.
 */
export function getDurationFromTranscript(videoId) {
  if (!videoId) return null;
  const aaiPath = resolve(AAI_DIR, `${videoId}.json`);
  if (!existsSync(aaiPath)) return null;
  try {
    const aai = JSON.parse(readFileSync(aaiPath, 'utf-8'));
    const totalSeconds = Math.round(aai.audio_duration || 0);
    if (totalSeconds > 0) {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      if (hours > 0) return { seconds: totalSeconds, display: `${hours}h ${minutes}m` };
      return { seconds: totalSeconds, display: `${minutes}m` };
    }
  } catch {}
  return null;
}
