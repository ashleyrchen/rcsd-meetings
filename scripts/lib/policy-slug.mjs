/**
 * Canonical URL slug for a board policy page.
 *
 * Single source of truth shared by build-policies.mjs (page emission) and
 * build-homepage.mjs (sitemap) — these MUST agree or sitemap entries 404.
 *
 * "5144.1" + "AR"        -> "5144.1-ar"        -> /policies/5144.1-ar/
 * "0420.41-E PDF(1)" + "AR" -> "0420.41-e-pdf-1-ar"
 *
 * Dots are kept (meaningful in policy codes, safe in URL path segments);
 * any other non-alphanumeric run collapses to a single hyphen.
 */
export function policySlug(code, type) {
  return `${code}-${type}`
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
