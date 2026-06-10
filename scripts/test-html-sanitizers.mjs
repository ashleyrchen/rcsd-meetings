#!/usr/bin/env node
/**
 * Regression test for the HTML sanitizer hardening (CodeQL findings):
 *  - js/incomplete-multi-character-sanitization: tag-strips must run to a fixpoint
 *  - js/double-escaping: &amp; must be decoded LAST in entity-decode chains,
 *    otherwise &amp;lt; double-decodes into a real < instead of literal &lt;
 *
 * The fixed functions live in scrape-board-policies.mjs / parse-formal-agenda.mjs /
 * scrape-boarddocs.mjs / lib/memo-links.mjs. The scrapers run Playwright on import,
 * so this test exercises verbatim CLONES of the fixed implementations. If you
 * change a sanitizer, update its clone here.
 *
 * The pre-fix implementations are deliberately NOT cloned here (CodeQL would —
 * correctly — flag them). Their buggy outputs are recorded as comments next to
 * each expectation; see commit 2fa6f92 for the originals.
 *
 * Usage: node scripts/test-html-sanitizers.mjs   (exits non-zero on failure)
 */

// --- Clone of FIXED cleanHtmlToText (scripts/scrape-board-policies.mjs) ---
function cleanHtmlToText(html) {
  if (!html) return '';
  let text = html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<\/li>/gi, '');
  for (let prev = ''; prev !== text; ) {
    prev = text;
    text = text.replace(/<[^>]*>/g, '');
  }
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

// --- Clone of FIXED decodeEntities (scripts/parse-formal-agenda.mjs) ---
function decodeEntities(text) {
  return text
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&');
}

// --- Clone of FIXED fixpoint tag strip (scrape-boarddocs.mjs actionType / memo-links.mjs) ---
function stripTagsFixpoint(s, replacement = '') {
  let out = s;
  for (let prev = ''; prev !== out; ) {
    prev = out;
    out = out.replace(/<[^>]*>/g, replacement);
  }
  return out;
}

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}
function checkNoTags(name, actual) {
  const ok = !/<[^>]*>/.test(actual);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     output still contains a tag: ${JSON.stringify(actual)}`);
}

// 1. CodeQL counterexample: nested-tag reassembly must never yield a tag.
//    (Pre-fix single-pass strip left '<script>' behind for this input.)
checkNoTags('fixpoint strip: <scr<b>ipt> leaves no tag',
  cleanHtmlToText('<scr<b>ipt>alert(1)</scr</b>ipt>'));
checkNoTags('fixpoint strip (boarddocs/memo-links clone): <scr<b>ipt> leaves no tag',
  stripTagsFixpoint('<scr<b>ipt>alert(1)</scr</b>ipt>'));

// 2. Double-escaping: &amp;lt; must decode ONCE to literal '&lt;', never to '<'.
//    (Pre-fix versions decoded &amp; early and produced live '<script>' / '<'.)
check("cleanHtmlToText: '&amp;lt;script&amp;gt;' decodes once",
  cleanHtmlToText('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
check("decodeEntities: '&amp;lt;' decodes once", decodeEntities('&amp;lt;'), '&lt;');
check("decodeEntities: '&amp;#60;' decodes once (numeric)", decodeEntities('&amp;#60;'), '&#60;');

// 3. Single decode still works.
check("decodeEntities: '&lt;' -> '<'", decodeEntities('&lt;'), '<');
check("decodeEntities: 'Tom &amp; Jerry'", decodeEntities('Tom &amp; Jerry'), 'Tom & Jerry');
check("decodeEntities: '&#039;' -> apostrophe", decodeEntities('&#039;'), "'");
check("decodeEntities: '&#8217;' -> right quote", decodeEntities('&#8217;'), '’');

// 4. Real-looking Simbli/BoardDocs content: output identical to pre-fix behavior
//    (expected strings below were produced by the pre-fix implementations on
//    2026-06-10 — the hardening must not change normal content).
const simbli = '<p>Approval of Minutes &amp; Agenda</p><ul><li>Facilities update &ndash; Q&amp;A</li>' +
  '<li>Budget &amp; LCAP &ldquo;overview&rdquo;</li></ul><br/>Board President&#39;s report';
check('cleanHtmlToText: normal Simbli policy HTML renders as expected',
  cleanHtmlToText(simbli),
  'Approval of Minutes & Agenda\n\n- Facilities update &ndash; Q&A\n- Budget & LCAP "overview"\nBoard President\'s report');
check('boarddocs actionType: normal value unchanged',
  stripTagsFixpoint('Action (Consent), <span class="x">Discussion</span>,').trim().replace(/,\s*$/, ''),
  'Action (Consent), Discussion');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll sanitizer tests passed.');
process.exit(failures ? 1 : 0);
