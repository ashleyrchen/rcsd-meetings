/**
 * Shared utilities for meeting page generation scripts.
 *
 * Extracted from build-meetings-html.mjs and build-transcript-viewer.mjs
 * to avoid code duplication.
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

/** R2 CDN base URL for hosted artifacts (agendas, minutes, transcripts, packets) */
export const R2_BASE = 'https://data.rcsd.info';

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} s - raw string
 * @returns {string} HTML-safe string
 */
export function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format seconds as MM:SS or H:MM:SS for display.
 * @param {number} sec - total seconds
 * @returns {string} formatted time string
 */
export function formatSec(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = n => n < 10 ? '0' + n : '' + n;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/**
 * Format a YYYY-MM-DD date string as "Month Day, Year".
 * @param {string} dateStr - date in YYYY-MM-DD format
 * @returns {string} e.g. "March 25, 2026"
 */
export function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

/**
 * Build a lookup map from attachment AID to R2 storage path.
 * Reads all JSON files in data/board-memos/ and extracts AID-to-path mappings.
 *
 * @param {string} memoDir - absolute path to the board-memos directory
 * @returns {Object<string, string>} map of AID to "board-packets/{date}/{filename}"
 */
export function buildAidToR2Path(memoDir) {
  const aidToR2Path = {};
  try {
    for (const f of readdirSync(memoDir)) {
      if (!f.endsWith('.json')) continue;
      const memo = JSON.parse(readFileSync(resolve(memoDir, f), 'utf-8'));
      for (const item of memo.items) {
        for (const att of item.attachments) {
          if (att.aid && att.filename) {
            aidToR2Path[att.aid] = `board-packets/${memo.date}/${att.filename}`;
          }
        }
      }
    }
  } catch {
    // board-memos directory may not exist in all environments
  }
  return aidToR2Path;
}

/**
 * Determine whether an agenda item is substantive (not procedural boilerplate).
 *
 * Filters out routine consent items, procedural items, and boilerplate entries
 * while keeping items with public comments, policy/resolution/budget significance,
 * and other high-signal content.
 *
 * Works with both old schema (order/category/actionType) and new formal schema
 * (itemLabel/isSection).
 *
 * @param {Object} item - agenda item object
 * @returns {boolean} true if the item should be shown to users
 */
export function isSubstantiveItem(item) {
  const title = (item.title || '').toLowerCase();
  const cat = (item.category || '').toLowerCase();
  const actionType = item.actionType || '';

  // Always show items that have public comment speaker data
  if (item.publicComments && item.publicComments.length > 0) return true;

  // New schema: skip section headers (they're structural, not items)
  if (item.isSection) return false;

  // Always skip procedural items
  if (actionType === 'Procedural') return false;

  // Skip routine consent items, but keep high-signal ones (policies, resolutions, measures, compensation)
  if (actionType === 'Action (Consent)') {
    const isSignificantConsent =
      title.includes('policy') || title.includes('bylaw') || title.includes('regulation') ||
      title.includes('resolution') || title.includes('measure') || title.includes('bond') ||
      title.includes('compensation') || title.includes('tentative agreement') ||
      title.includes('charter') || title.includes('budget') || title.includes('lcap') ||
      title.includes('spsa') || title.includes('school plan');
    if (!isSignificantConsent) return false;
  }

  // Skip boilerplate by title
  const skipTitles = [
    'roll call', 'approval of agenda', 'approval of consent', 'adjourn',
    'pledge of allegiance', 'welcome by', 'additions, deletions',
    'changes to the agenda', 'public comment', 'oral communication',
    'correspondence', 'possible other business', 'suggested items for future',
    'report from board members', 'reconvene', 'return to open session',
    'report out of closed session', 'approval of minutes',
    'ratification of warrant', 'information on san mateo county investment',
    'approval of personnel changes', 'changes to the board meetings calendar',
    'rejection of claim', 'quarterly williams report',
    'notification of remote participation', 'welcome',
  ];
  if (skipTitles.some(s => title.includes(s))) return false;

  // Skip boilerplate categories
  // Note: 'consent' is NOT here -- the actionType check above already filters routine
  // consent items while keeping significant ones (policies, resolutions, etc.)
  const skipCats = [
    'call to order', 'oral communication', 'reconvene', 'welcome',
    'pledge of allegiance', 'adjournment', 'closed session', 'report out',
  ];
  if (skipCats.some(s => cat.includes(s))) return false;

  // Skip routine consent-style items: individual contract/agreement approvals,
  // bid awards, service agreements (keep resolutions, plans, presentations)
  const isRoutineApproval =
    (title.startsWith('approval of the agreement') ||
     title.startsWith('approval of agreement') ||
     title.startsWith('approval of service agreement') ||
     title.startsWith('approval of the memorandum') ||
     title.startsWith('award of bid') ||
     title.startsWith('approval of the ') && title.includes(' quote'));
  // But keep items with "resolution", "plan", "report", "presentation", "budget", "lcap"
  const isHighSignal =
    title.includes('resolution') || title.includes('plan') ||
    title.includes('budget') || title.includes('lcap') ||
    title.includes('presentation') || title.includes('measure') ||
    title.includes('parcel tax') || title.includes('bond') ||
    title.includes('charter') || title.includes('superintendent') ||
    title.includes('facilities master') || title.includes('tentative agreement');
  if (isRoutineApproval && !isHighSignal) return false;

  // Skip very short titles (likely procedural)
  if (item.title && item.title.length <= 10) return false;

  return true;
}
