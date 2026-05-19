/**
 * seo-fields.js
 * Field extraction from a DOM document, normalization helpers, and comparison.
 * Used by the background parser for raw HTML. Keep content-script.js in sync.
 */

/**
 * Extract all tracked SEO fields from a DOM Document.
 * @param {Document} doc
 * @returns {SeoFields}
 */
export function extractSeoFields(doc) {
  return {
    title: doc.title ?? null,
    metaDescription: getMeta(doc, 'description'),
    metaRobots: getMeta(doc, 'robots'),
    canonical: getCanonical(doc),
    h1s: getH1s(doc),
    hreflangs: getHreflangs(doc),
  };
}

function getMeta(doc, name) {
  const el = doc.querySelector(`meta[name="${name}"]`);
  return el ? el.getAttribute('content') : null;
}

function getCanonical(doc) {
  const el = doc.querySelector('link[rel="canonical"]');
  return el ? el.getAttribute('href') : null;
}

function getH1s(doc) {
  const els = doc.querySelectorAll('h1');
  if (!els.length) return null;
  const h1s = Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
  return h1s.length ? h1s : null;
}

function getHreflangs(doc) {
  const els = doc.querySelectorAll('link[rel="alternate"][hreflang]');
  if (!els.length) return null;
  return Array.from(els).map(el => ({
    lang: el.getAttribute('hreflang'),
    href: el.getAttribute('href'),
  }));
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normTitle(v) {
  return v === null ? null : v.trim();
}

function normDescription(v) {
  return v === null ? null : v.trim();
}

function normRobots(v) {
  return v === null ? null : v.trim().toLowerCase();
}

function normCanonical(v, baseUrl) {
  if (v === null) return null;
  try {
    const url = baseUrl ? new URL(v, baseUrl) : new URL(v);
    // Lowercase scheme + host, remove trailing slash from pathname.
    // Ignore hash fragments so comparison matches indexability checks.
    let path = url.pathname.replace(/\/$/, '') || '/';
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return v.trim();
  }
}

function normH1s(v) {
  if (v === null) return null;
  return [...v];
}

function normHreflangs(v) {
  if (v === null) return null;
  return [...v].sort((a, b) => a.lang.localeCompare(b.lang));
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Compare source SeoFields vs rendered SeoFields.
 * @param {SeoFields} source
 * @param {SeoFields} rendered
 * @param {string} [pageUrl]
 * @returns {CompareResult}
 */
export function compareSeoFields(source, rendered, pageUrl) {
  const fields = {};
  let hasDiff = false;

  fields.title = compareField(source.title, rendered.title, normTitle);
  fields.metaDescription = compareField(source.metaDescription, rendered.metaDescription, normDescription);
  fields.metaRobots = compareField(source.metaRobots, rendered.metaRobots, normRobots);
  fields.canonical = compareField(source.canonical, rendered.canonical, normCanonical, pageUrl);
  fields.h1s = compareArrayField(source.h1s, rendered.h1s, normH1s);
  fields.hreflangs = compareArrayField(source.hreflangs, rendered.hreflangs, normHreflangs);

  for (const f of Object.values(fields)) {
    if (f.diff) { hasDiff = true; break; }
  }

  return { fields, hasDiff };
}

function compareField(src, ren, normFn, ...args) {
  const ns = normFn(src, ...args);
  const nr = normFn(ren, ...args);
  if (ns === null && nr === null) return { diff: false, source: null, rendered: null };
  const diff = ns !== nr;
  return { diff, source: src, rendered: ren };
}

function compareArrayField(src, ren, normFn) {
  const ns = normFn(src);
  const nr = normFn(ren);
  if (ns === null && nr === null) return { diff: false, source: null, rendered: null };
  const diff = JSON.stringify(ns) !== JSON.stringify(nr);
  return { diff, source: src, rendered: ren };
}
