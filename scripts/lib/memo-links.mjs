/**
 * Shared extractor for URLs embedded in board agenda memos.
 *
 * BoardDocs agenda items can contain HTML or text fields. Staff frequently paste
 * links into that prose — public-comment Google Forms, and occasionally an
 * actual document hosted off the board portal (e.g. the adopted Facilities
 * Master Plan, a county report). Those links are otherwise invisible: they're
 * not board-packet attachments, so nothing surfaces or indexes them.
 *
 * `extractMemoLinks(memo)` pulls every embedded URL out and classifies it by
 * host so callers can use each kind appropriately:
 *   - document : index it in site search (title-only) and link straight to it
 *   - form     : a public-comment sign-up form — surface on the meeting page,
 *                NOT in search (they're recurring boilerplate, ~2 per meeting)
 *   - video    : an external video reference
 *   - other    : any other reference link
 * Portal and known navigation hosts are dropped —
 * those are navigation or already-captured attachments, not embedded refs.
 */

// Hosts that are navigation, already-captured, or share-button chrome —
// never "embedded refs". (Social hosts appear in BoardDocs item share buttons.)
const PORTAL = /(boarddocs\.com|zoom\.us|twitter\.com|x\.com|facebook\.com|\/sharer|\/intent\/|addtoany)/i;

const FORM_HOST = /(forms\.gle|docs\.google\.com\/forms|google\.com\/forms|surveymonkey|jotform)/i;
const VIDEO_HOST = /(youtube\.com|youtu\.be|vimeo\.com)/i;
// Document: explicit file extensions, a `/download` path, known doc hosts, and
// URL shorteners (in this corpus shorteners point at hosted documents, e.g. the
// FMP bit.ly). NOTE: matches on file/download/doc-host signals, not on a host
// alone — so a county *info page* (smcgov.org/treasurer/…) is "other", while its
// /media/…/download PDF is "document".
const DOC_HOST = /(\.(pdf|docx?|xlsx?|pptx?|csv)(\?|#|$)|\/download|bit\.ly|tinyurl|drive\.google|docs\.google\.com\/(document|spreadsheets|presentation)|dropbox|box\.com|finalsite)/i;

// BoardDocs memos are often pasted from Gmail/Docs, wrapping real links in a
// google.com/url?q=<target> redirect (and data-saferedirecturl). Unwrap to the
// real destination (recursively) so we classify + link the actual document.
export function unwrapUrl(url) {
  let u = url;
  for (let i = 0; i < 3; i++) {
    const m = u.match(/^https?:\/\/(?:www\.)?google\.com\/url\?(?:[^&]*&)*?q=([^&]+)/i);
    if (!m) break;
    try { u = decodeURIComponent(m[1]); } catch { break; }
  }
  // Strip leftover HTML entities pasted onto the end of URLs (e.g. a trailing
  // &nbsp;) and normalize &amp; so near-duplicates collapse to one record.
  return u.replace(/&nbsp;?$/i, '').replace(/&amp;/gi, '&').replace(/[).,;:'"\s]+$/, '');
}

/** Classify a single URL into form | video | document | other | portal. */
export function classifyUrl(url) {
  if (PORTAL.test(url)) return 'portal';
  if (FORM_HOST.test(url)) return 'form';
  if (VIDEO_HOST.test(url)) return 'video';
  if (DOC_HOST.test(url)) return 'document';
  return 'other';
}

// Collect every string value out of a memo (object | array | string | nested).
function collectStrings(value, out) {
  if (value == null) return;
  if (typeof value === 'string') { out.push(value); return; }
  if (Array.isArray(value)) { for (const v of value) collectStrings(v, out); return; }
  if (typeof value === 'object') { for (const v of Object.values(value)) collectStrings(v, out); }
}

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
const BARE_RE = /https?:\/\/[^\s"'<>)\]]+/gi;

// Trim trailing punctuation / zero-width chars that cling to pasted URLs.
function cleanUrl(u) {
  return u.replace(/[​-‍﻿]/g, '').replace(/[).,;:'" ]+$/g, '').trim();
}

function stripTags(html) {
  // Strip tags to a fixpoint: one pass leaves reassembled tags (<scr<b>ipt>).
  let out = html;
  for (let prev = ''; prev !== out; ) {
    prev = out;
    out = out.replace(/<[^>]+>/g, ' ');
  }
  return out.replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract classified links from a memo (object or string).
 * @returns {Array<{url:string, text:string, kind:string}>} deduped by url,
 *   excluding portal/known hosts. `text` is the anchor label when available.
 */
export function extractMemoLinks(memo) {
  if (memo == null) return [];
  const strings = [];
  collectStrings(memo, strings);
  const byUrl = new Map();
  for (const s of strings) {
    if (typeof s !== 'string' || s.indexOf('http') === -1) continue;
    // Anchored links first (so we keep their human label).
    let m;
    HREF_RE.lastIndex = 0;
    while ((m = HREF_RE.exec(s))) {
      const url = unwrapUrl(cleanUrl(m[1]));
      if (!/^https?:/i.test(url)) continue;
      const text = stripTags(m[2]).slice(0, 200);
      if (!byUrl.has(url)) byUrl.set(url, { url, text, kind: classifyUrl(url) });
      else if (text && !byUrl.get(url).text) byUrl.get(url).text = text;
    }
    // Bare URLs (anything not already captured via an anchor).
    BARE_RE.lastIndex = 0;
    while ((m = BARE_RE.exec(s))) {
      const url = unwrapUrl(cleanUrl(m[0]));
      if (!byUrl.has(url)) byUrl.set(url, { url, text: '', kind: classifyUrl(url) });
    }
  }
  // Drop portal/known hosts — not "embedded refs".
  return [...byUrl.values()].filter(l => l.kind !== 'portal');
}
