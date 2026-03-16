#!/usr/bin/env node
/**
 * Generate transcript viewer pages for meetings with transcripts.
 *
 * Each page embeds a YouTube player synced to a scrollable diarized transcript.
 * Clicking an utterance seeks the video; playback auto-scrolls the transcript.
 *
 * Output: docs/meetings/{date}/index.html (one per meeting with transcript)
 *
 * Security note: transcript text is rendered via textContent (not innerHTML)
 * in the client-side JS. Search highlighting uses controlled DOM manipulation
 * with createElement, not string interpolation into HTML.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { headMeta, siteNav, siteFooter } from './html-parts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const R2_BASE = 'https://data.rcsd.info';

const data = JSON.parse(readFileSync(resolve(ROOT, 'data/meetings-data.json'), 'utf-8'));

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

const SPEAKER_COLORS = [
  '#1a5276', '#7d3c98', '#1e8449', '#b9770e', '#922b21',
  '#117a65', '#6c3483', '#1f618d', '#b7950b', '#943126',
  '#148f77', '#7d6608', '#2e4053', '#884ea0', '#239b56',
];

const pageCSS = `
  .tv-layout {
    max-width: 960px;
    margin: 0 auto;
    padding: 1rem 2rem 2rem;
  }

  .tv-header { margin-bottom: 1rem; }

  .tv-back {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-decoration: none;
    display: inline-block;
    margin-bottom: 0.5rem;
  }
  .tv-back:hover { color: var(--green-mid); }

  .tv-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--green-deep);
    margin-bottom: 0.25rem;
  }

  .tv-meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .tv-meta a { color: var(--green-mid); text-decoration: none; }
  .tv-meta a:hover { text-decoration: underline; }

  .tv-main {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .tv-video-col {
    flex: 0 0 480px;
    position: sticky;
    top: 1rem;
  }

  .tv-video-wrap {
    position: relative;
    padding-bottom: 56.25%;
    height: 0;
    border-radius: 6px;
    overflow: hidden;
    background: #000;
  }

  .tv-video-wrap iframe {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    border: none;
  }

  .tv-controls {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
    align-items: center;
  }

  .tv-btn {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--rule);
    border-radius: 4px;
    background: var(--cream);
    color: var(--text-secondary);
    cursor: pointer;
  }
  .tv-btn:hover { background: var(--cream-dark); }
  .tv-btn.active { background: var(--green-pale); border-color: var(--green-mid); color: var(--green-deep); }

  .tv-search {
    flex: 1;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--rule);
    border-radius: 4px;
    background: #fff;
    color: var(--text);
    outline: none;
  }
  .tv-search:focus { border-color: var(--green-mid); }

  .tv-transcript-col {
    flex: 1;
    min-width: 0;
    max-height: 80vh;
    overflow-y: auto;
    scroll-behavior: smooth;
    border: 1px solid var(--rule-light);
    border-radius: 6px;
    background: #fff;
  }

  .tv-utterance {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--rule-light);
    cursor: pointer;
    transition: background 0.15s;
    display: flex;
    gap: 0.5rem;
  }
  .tv-utterance:last-child { border-bottom: none; }
  .tv-utterance:hover { background: var(--green-wash); }
  .tv-utterance.active { background: #eef6eb; }
  .tv-utterance.search-match { background: #fef9e7; }

  .tv-ts {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-muted);
    flex: 0 0 3.5rem;
    padding-top: 0.15rem;
    text-align: right;
  }

  .tv-speaker {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    font-weight: 500;
    flex: 0 0 auto;
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-top: 0.15rem;
  }

  .tv-text {
    font-family: 'Newsreader', serif;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text);
    flex: 1;
    min-width: 0;
  }

  .tv-text mark {
    background: #fde68a;
    padding: 0 2px;
    border-radius: 2px;
  }

  .tv-download {
    text-align: center;
    padding: 0.75rem;
  }
  .tv-download a {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    color: var(--green-mid);
    text-decoration: none;
  }
  .tv-download a:hover { text-decoration: underline; }

  @media (max-width: 900px) {
    .tv-main { flex-direction: column; }
    .tv-video-col { flex: none; width: 100%; position: static; }
    .tv-transcript-col { max-height: 60vh; }
  }

  @media (max-width: 640px) {
    .tv-layout { padding: 0.75rem 1rem; }
    .tv-utterance { gap: 0.3rem; }
    .tv-ts { flex: 0 0 2.8rem; font-size: 0.6rem; }
    .tv-speaker { max-width: 5rem; font-size: 0.6rem; }
  }
`;

let generated = 0;

for (const m of data.meetings) {
  if (!m.youtube || !m.hasTranscript) continue;

  const outDir = resolve(ROOT, `docs/meetings/${m.date}`);
  mkdirSync(outDir, { recursive: true });

  const transcriptUrl = `${R2_BASE}/transcripts/${m.date}.json`;
  const dateFormatted = formatDate(m.date);
  const title = `Transcript — ${m.type}, ${dateFormatted}`;
  const description = `Full diarized transcript of the RCSD ${m.type} on ${dateFormatted}. Speaker-identified, synced to video.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${headMeta({
  title,
  description,
  canonical: `https://rcsd.info/meetings/${m.date}/`,
  pageCSS,
})}
</head>
<body>
${siteNav({ activePage: 'meetings', lang: 'en' })}

<div class="tv-layout">
  <div class="tv-header">
    <a href="/meetings/" class="tv-back">&larr; All Meetings</a>
    <h1 class="tv-title">${escapeHtml(m.type)} &mdash; ${dateFormatted}</h1>
    <div class="tv-meta">
      ${m.duration ? `${m.duration} &middot; ` : ''}
      <a href="https://www.youtube.com/watch?v=${m.youtube}" target="_blank" rel="noopener">YouTube</a>
      ${m.simbli ? ` &middot; <a href="${escapeHtml(m.simbli)}" target="_blank" rel="noopener">Agenda</a>` : ''}
      ${m.boarddocs ? ` &middot; <a href="${escapeHtml(m.boarddocs)}" target="_blank" rel="noopener">Agenda</a>` : ''}
    </div>
  </div>

  <div class="tv-main">
    <div class="tv-video-col">
      <div class="tv-video-wrap">
        <div id="yt-player"></div>
      </div>
      <div class="tv-controls">
        <button class="tv-btn active" id="btn-autoscroll" title="Auto-scroll transcript to current position">Auto-scroll</button>
        <input class="tv-search" type="text" id="search-input" placeholder="Search transcript...">
      </div>
    </div>

    <div class="tv-transcript-col" id="transcript-container">
      <div style="padding:1rem;color:var(--text-muted);font-style:italic">Loading transcript...</div>
    </div>
  </div>

  <div class="tv-download">
    <a href="${transcriptUrl}" target="_blank" rel="noopener" download>Download transcript (JSON)</a>
  </div>
</div>

${siteFooter({ lang: 'en' })}

<script>
(function() {
  var videoId = ${JSON.stringify(m.youtube)};
  var transcriptUrl = ${JSON.stringify(transcriptUrl)};
  var speakerColors = ${JSON.stringify(SPEAKER_COLORS)};
  var player = null;
  var utterances = [];
  var speakerMap = {};
  var autoScroll = true;
  var activeIdx = -1;

  // Load YT IFrame API
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = function() {
    player = new YT.Player('yt-player', {
      videoId: videoId,
      playerVars: { rel: 0, modestbranding: 1 },
    });
  };

  function formatTime(ms) {
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  }

  function speakerName(label) {
    var sp = speakerMap[label];
    return (sp && sp.name) ? sp.name : 'Speaker ' + label;
  }

  function speakerColor(label) {
    return speakerColors[label.charCodeAt(0) % speakerColors.length];
  }

  // Build transcript rows using safe DOM methods
  function renderTranscript() {
    var container = document.getElementById('transcript-container');
    container.textContent = ''; // clear

    utterances.forEach(function(u, i) {
      var row = document.createElement('div');
      row.className = 'tv-utterance';
      row.dataset.idx = i;
      row.dataset.start = u.start;
      row.dataset.end = u.end;

      var ts = document.createElement('span');
      ts.className = 'tv-ts';
      ts.textContent = formatTime(u.start);
      row.appendChild(ts);

      var sp = document.createElement('span');
      sp.className = 'tv-speaker';
      sp.style.color = speakerColor(u.speaker);
      var name = speakerName(u.speaker);
      sp.textContent = name;
      sp.title = name;
      row.appendChild(sp);

      var text = document.createElement('span');
      text.className = 'tv-text';
      text.textContent = u.text;
      row.appendChild(text);

      container.appendChild(row);
    });

    // Click to seek
    container.addEventListener('click', function(e) {
      var row = e.target.closest('.tv-utterance');
      if (!row) return;
      var startMs = parseInt(row.dataset.start);
      if (player && player.seekTo) {
        player.seekTo(startMs / 1000, true);
        player.playVideo();
      }
    });
  }

  // Fetch transcript
  fetch(transcriptUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      utterances = data.utterances;
      speakerMap = data.speakers || {};
      renderTranscript();
      setInterval(syncHighlight, 250);
    })
    .catch(function() {
      var c = document.getElementById('transcript-container');
      c.textContent = '';
      var msg = document.createElement('div');
      msg.style.cssText = 'padding:1rem;color:var(--coral)';
      msg.textContent = 'Failed to load transcript.';
      c.appendChild(msg);
    });

  function syncHighlight() {
    if (!player || !player.getCurrentTime) return;
    var currentMs = player.getCurrentTime() * 1000;
    var newIdx = -1;
    for (var i = utterances.length - 1; i >= 0; i--) {
      if (utterances[i].start <= currentMs) { newIdx = i; break; }
    }
    if (newIdx === activeIdx) return;
    activeIdx = newIdx;

    var rows = document.querySelectorAll('.tv-utterance');
    rows.forEach(function(r, i) {
      r.classList.toggle('active', i === activeIdx);
    });

    if (autoScroll && activeIdx >= 0 && rows[activeIdx]) {
      var container = document.getElementById('transcript-container');
      var rowTop = rows[activeIdx].offsetTop - container.offsetTop;
      container.scrollTop = rowTop - container.clientHeight / 3;
    }
  }

  // Auto-scroll toggle
  document.getElementById('btn-autoscroll').addEventListener('click', function() {
    autoScroll = !autoScroll;
    this.classList.toggle('active', autoScroll);
  });

  // Search with safe DOM highlighting
  var searchInput = document.getElementById('search-input');
  var searchTimeout = null;

  searchInput.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(doSearch, 200);
  });

  function doSearch() {
    var term = searchInput.value.trim().toLowerCase();
    var rows = document.querySelectorAll('.tv-utterance');

    rows.forEach(function(row, i) {
      var textEl = row.querySelector('.tv-text');
      var original = utterances[i].text;

      if (term && original.toLowerCase().indexOf(term) >= 0) {
        row.classList.add('search-match');
        row.style.display = '';
        // Highlight matches using safe DOM methods
        textEl.textContent = '';
        var remaining = original;
        var lc = remaining.toLowerCase();
        var pos = lc.indexOf(term);
        while (pos >= 0) {
          if (pos > 0) textEl.appendChild(document.createTextNode(remaining.slice(0, pos)));
          var mark = document.createElement('mark');
          mark.textContent = remaining.slice(pos, pos + term.length);
          textEl.appendChild(mark);
          remaining = remaining.slice(pos + term.length);
          lc = remaining.toLowerCase();
          pos = lc.indexOf(term);
        }
        if (remaining) textEl.appendChild(document.createTextNode(remaining));
      } else {
        row.classList.remove('search-match');
        textEl.textContent = original;
        row.style.display = term ? 'none' : '';
      }
    });
  }
})();
</script>
</body>
</html>`;

  writeFileSync(resolve(outDir, 'index.html'), html);
  generated++;
}

console.log(`Generated ${generated} transcript viewer pages`);
