/**
 * Shared HTML template parts for rcsd.info pages.
 * Centralizes design tokens, meta tags, nav, and footer so changes
 * propagate to every page from a single source.
 */

// ---- Design tokens + CSS reset + nav/footer CSS ----

export function baseCSS() {
  return `
  :root {
    --green-deep: #1a3a2a;
    --green-mid: #2d5a3f;
    --green-light: #4a8c6a;
    --green-pale: #dcebd5;
    --green-wash: #f0f6ed;
    --cream: #faf8f4;
    --cream-dark: #f2efe8;
    --amber: #c4842d;
    --amber-light: #f0d9a8;
    --coral: #c45d4a;
    --coral-light: #f5ddd8;
    --text: #2a2a28;
    --text-secondary: #5a5a56;
    --text-muted: #8a8a84;
    --rule: #d4d0c8;
    --rule-light: #e8e4dc;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html {
    font-size: 17px;
    scroll-behavior: smooth;
    background: var(--cream);
  }

  body {
    font-family: 'Newsreader', Georgia, serif;
    color: var(--text);
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    background: var(--cream);
  }

  a {
    color: var(--green-mid);
    text-decoration-color: var(--rule);
    text-underline-offset: 2px;
    transition: color 0.15s, text-decoration-color 0.15s;
  }
  a:hover {
    color: var(--green-deep);
    text-decoration-color: var(--green-mid);
  }

  /* ---- SITE NAV ---- */
  .site-nav {
    background: #1a2e1a;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .site-nav-inner {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .site-nav-tabs { display: flex; gap: 0; }
  .site-nav-tab {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-decoration: none;
    color: rgba(255,255,255,0.7);
    padding: 0.75rem 1rem;
    border-bottom: 2px solid transparent;
    transition: color 0.2s, border-color 0.2s;
  }
  .site-nav-tab:hover { color: #fff; }
  .site-nav-tab.active { color: #fff; border-bottom-color: var(--green-light); }

  .site-nav-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .site-nav-search { display: flex; }
  .site-nav-search input {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.02em;
    color: #fff;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.35);
    border-radius: 3px;
    padding: 0.35rem 0.65rem;
    width: 9rem;
    transition: border-color 0.2s, background 0.2s, width 0.2s;
  }
  .site-nav-search input::placeholder { color: rgba(255,255,255,0.55); }
  .site-nav-search input:focus {
    outline: none;
    background: rgba(255,255,255,0.14);
    border-color: rgba(255,255,255,0.7);
    width: 11rem;
  }
  .site-nav-lang {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    color: rgba(255,255,255,0.7);
    text-decoration: none;
    padding: 0.35rem 0.65rem;
    border: 1px solid rgba(255,255,255,0.35);
    border-radius: 3px;
    transition: color 0.2s, border-color 0.2s;
  }
  .site-nav-lang:hover {
    color: #fff;
    border-color: rgba(255,255,255,0.6);
  }

  /* ---- FOOTER ---- */
  .site-footer {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 2rem 4rem;
    border-top: 1px solid var(--rule);
    text-align: center;
  }
  .site-footer p {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-style: italic;
  }
  .site-footer a { color: var(--green-mid); }
  .footer-nav {
    margin-top: 0.8rem;
    font-style: normal;
  }
  .footer-nav a {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    color: var(--green-mid);
    text-decoration: none;
    margin: 0 0.75rem;
  }
  .footer-nav a:hover { text-decoration: underline; }

  /* ---- RESPONSIVE (nav + footer) ---- */
  @media (max-width: 640px) {
    .site-nav-inner { padding: 0 0.9rem; gap: 0.4rem; }
    /* Tabs become a horizontal scroll strip so every link stays reachable
       without overflowing the viewport; search stays pinned on the right.
       The right-edge mask fades the last tab to hint there's more to scroll. */
    .site-nav-tabs {
      flex: 1 1 auto;
      min-width: 0;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 1.4rem), transparent);
      mask-image: linear-gradient(to right, #000 calc(100% - 1.4rem), transparent);
    }
    .site-nav-tabs::-webkit-scrollbar { display: none; }
    .site-nav-tab { flex: 0 0 auto; padding: 0.6rem 0.65rem; font-size: 0.7rem; }
    .site-nav-right { flex: 0 0 auto; }
    .site-nav-search input { width: 5rem; }
    .site-nav-search input:focus { width: 6.5rem; }
  }`;
}

// ---- Google Fonts link ----

export function fontsLink() {
  // Self-hosted fonts — eliminates cross-origin requests to Google
  // Preload the latin subsets (most critical for first paint)
  return `<link rel="preload" href="/fonts/fraunces-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/newsreader-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/ibm-plex-mono-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fonts/fonts.css">`;
}

// ---- Favicon links ----

export function faviconLinks() {
  return `<meta name="theme-color" content="#1a3a2a">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32">
<link rel="icon" type="image/png" href="/favicon-16x16.png" sizes="16x16">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;
}

// ---- OG / Twitter boilerplate ----
//
// Per-page OG images are PNGs hosted on R2 at https://data.rcsd.info/og/.
// Pass an `ogImage` URL to override the default site-wide image; pass
// `ogImageKey` (e.g. "meeting-2026-05-13-regular") as a shorthand that
// expands to data.rcsd.info/og/<key>.png.

const DEFAULT_OG_IMAGE = 'https://rcsd.info/og-1200.jpg';
const OG_BASE = 'https://data.rcsd.info/og';

function resolveOgImage({ ogImage, ogImageKey }) {
  if (ogImage) return ogImage;
  if (ogImageKey) return `${OG_BASE}/${ogImageKey}.png`;
  return DEFAULT_OG_IMAGE;
}

function ogBoilerplate({ title, description, url, ogLocale = 'en_US', ogImage, ogImageKey }) {
  const img = resolveOgImage({ ogImage, ogImageKey });
  return `<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${title}">
<meta property="og:locale" content="${ogLocale}">
<meta property="og:site_name" content="RCSD Open Data">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">`;
}

// ---- <head> block ----
// Produces everything between <head> and </head> (exclusive).
// Params:
//   title, description, canonical, ogLocale ('en_US' | 'es_US'),
//   hreflang: [{ lang, href }], robots ('index, follow' | 'noindex'),
//   jsonLd: string (raw JSON-LD blocks), pageCSS: string (page-specific CSS)

export function headMeta({
  title,
  description,
  canonical,
  ogLocale = 'en_US',
  ogImage,
  ogImageKey,
  hreflang = [],
  robots = 'index, follow',
  jsonLd = '',
  extraHead = '',
  pageCSS = '',
} = {}) {
  const hreflangTags = hreflang
    .map(h => `<link rel="alternate" hreflang="${h.lang}" href="${h.href}">`)
    .join('\n');

  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="${robots}">
<title>${title}</title>
<meta name="description" content="${description}">
${faviconLinks()}
${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
${hreflangTags}
${ogBoilerplate({ title, description, url: canonical || '', ogLocale, ogImage, ogImageKey })}
${fontsLink()}
${jsonLd}
${extraHead}
<style>
${baseCSS()}
${pageCSS}
</style>`;
}

// ---- Site nav bar ----
// Params:
//   activePage: 'home' | 'meetings' | 'schools' | 'district' | 'budget' | null
//   lang: 'en' | 'es'
//   altLangHref: string | null  (if provided, shows lang switch)

const NAV_TABS = {
  en: [
    { id: 'home',     label: 'Home',     href: '/' },
    { id: 'meetings', label: 'Meetings', href: '/meetings/' },
    { id: 'schools',  label: 'Schools',  href: '/schools/' },
    { id: 'district', label: 'District', href: '/district/' },
    { id: 'budget',   label: 'Budget',   href: '/budget/' },
    { id: 'blog',     label: 'Blog',     href: '/blog/' },
  ],
  es: [
    { id: 'home',     label: 'Inicio',       href: '/' },
    { id: 'meetings', label: 'Reuniones',    href: '/reuniones/' },
    { id: 'schools',  label: 'Escuelas',     href: '/escuelas/' },
    { id: 'district', label: 'Distrito',     href: '/distrito/' },
    { id: 'budget',   label: 'Presupuesto',  href: '/presupuesto/' },
    { id: 'blog',     label: 'Blog',     href: '/blog/es/' },
  ],
};

export function siteNav({ activePage = null, lang = 'en', altLangHref = null } = {}) {
  const tabs = NAV_TABS[lang] || NAV_TABS.en;
  const tabsHtml = tabs.map(t =>
    `      <a href="${t.href}" class="site-nav-tab${t.id === activePage ? ' active' : ''}">${t.label}</a>`
  ).join('\n');

  // Language-aware search box. The form GET-submits ?q= to the results page in
  // the SAME language as the current page (/search for EN, /buscar for ES), so
  // every search stays within its own-language corpus (see docs/SEARCH.md).
  const searchAction = lang === 'es' ? '/buscar/' : '/search/';
  const searchLabel = lang === 'es' ? 'Buscar' : 'Search';
  const searchHtml =
    `<form class="site-nav-search" role="search" action="${searchAction}" method="get">` +
    `<input type="search" name="q" placeholder="${searchLabel}…" aria-label="${searchLabel}" autocomplete="off">` +
    `</form>`;

  const langSwitch = altLangHref
    ? `<a href="${altLangHref}" class="site-nav-lang">${lang === 'en' ? 'ES' : 'EN'}</a>`
    : '';

  return `<nav class="site-nav">
  <div class="site-nav-inner">
    <div class="site-nav-tabs">
${tabsHtml}
    </div>
    <div class="site-nav-right">
      ${searchHtml}${langSwitch ? '\n      ' + langSwitch : ''}
    </div>
  </div>
</nav>`;
}

// ---- Site footer ----
// Params:
//   lang: 'en' | 'es'

const FOOTER_TEXT = {
  en: 'Independently compiled from publicly available RCSD documents. Source documents at <a href="https://www.rcsdk8.net">rcsdk8.net</a> and the <a href="https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=36030397">GAMUT board portal</a>.',
  es: 'Preparado con documentos p\u00fablicos de RCSD. Los documentos originales est\u00e1n disponibles en <a href="https://www.rcsdk8.net">rcsdk8.net</a> y en el <a href="https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=36030397">portal de la mesa directiva GAMUT</a>.',
};

export function siteFooter({ lang = 'en' } = {}) {
  const tabs = NAV_TABS[lang] || NAV_TABS.en;
  const navLinks = tabs
    .filter(t => t.id !== 'blog')
    .map(t => `    <a href="${t.href}">${t.label}</a>`)
    .concat([
      `    <a href="https://github.com/dweekly/rcsd-meetings">${lang === 'en' ? 'Source Code' : 'Código Fuente'} &#8599;</a>`,
      `    <a href="mailto:team@rcsd.info">team@rcsd.info</a>`,
    ])
    .join('\n');

  return `<footer class="site-footer">
  <p>${FOOTER_TEXT[lang] || FOOTER_TEXT.en}</p>
  <div class="footer-nav">
${navLinks}
  </div>
</footer>`;
}
