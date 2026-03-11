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
    .site-nav-tab { padding: 0.6rem 0.7rem; font-size: 0.7rem; }
    .site-nav-inner { padding: 0 1.2rem; }
  }`;
}

// ---- Google Fonts link ----

export function fontsLink() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">`;
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

// ---- OG / Twitter boilerplate (same image on every page) ----

function ogBoilerplate({ title, description, url, ogLocale = 'en_US' }) {
  return `<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://rcsd.info/og-1200.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${ogLocale}">
<meta property="og:site_name" content="RCSD Open Data">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://rcsd.info/og-1200.jpg">
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
${ogBoilerplate({ title, description, url: canonical || '', ogLocale })}
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
    { id: 'code',     label: 'Code',     href: 'https://github.com/dweekly/rcsd-meetings' },
  ],
  es: [
    { id: 'home',     label: 'Inicio',       href: '/' },
    { id: 'meetings', label: 'Reuniones',    href: '/reuniones/' },
    { id: 'schools',  label: 'Escuelas',     href: '/escuelas/' },
    { id: 'district', label: 'Distrito',     href: '/distrito/' },
    { id: 'budget',   label: 'Presupuesto',  href: '/presupuesto/' },
    { id: 'code',     label: 'C\u00f3digo',  href: 'https://github.com/dweekly/rcsd-meetings' },
  ],
};

export function siteNav({ activePage = null, lang = 'en', altLangHref = null } = {}) {
  const tabs = NAV_TABS[lang] || NAV_TABS.en;
  const tabsHtml = tabs.map(t =>
    `      <a href="${t.href}" class="site-nav-tab${t.id === activePage ? ' active' : ''}">${t.label}</a>`
  ).join('\n');

  const langSwitch = altLangHref
    ? `\n    <div class="site-nav-right">\n      <a href="${altLangHref}" class="site-nav-lang">${lang === 'en' ? 'ES' : 'EN'}</a>\n    </div>`
    : '';

  return `<nav class="site-nav">
  <div class="site-nav-inner">
    <div class="site-nav-tabs">
${tabsHtml}
    </div>${langSwitch}
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
    .filter(t => t.id !== 'code')
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
