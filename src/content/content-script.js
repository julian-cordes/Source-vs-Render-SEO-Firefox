/**
 * content-script.js
 * Runs in the page context. On message request, extracts SEO fields
 * from the live (rendered) DOM and returns them to the service worker.
 */

(function () {
  // Guard: only register listener once even if script is injected multiple times
  if (window.__seoInspectorLoaded) return;
  window.__seoInspectorLoaded = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'GET_RENDERED_SEO') return false;

    const fields = extractFromDocument(document);
    sendResponse({ ok: true, fields });
    return false;
  });

  function getMeta(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') : null;
  }

  function getCanonical() {
    const el = document.querySelector('link[rel="canonical"]');
    return el ? el.getAttribute('href') : null;
  }

  function getH1s() {
    const els = document.querySelectorAll('h1');
    if (!els.length) return null;
    const h1s = Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
    return h1s.length ? h1s : null;
  }

  function getHreflangs() {
    const els = document.querySelectorAll('link[rel="alternate"][hreflang]');
    if (!els.length) return null;
    return Array.from(els).map(el => ({
      lang: el.getAttribute('hreflang'),
      href: el.getAttribute('href'),
    }));
  }

  function extractFromDocument(doc) {
    return {
      title: doc.title ?? null,
      metaDescription: getMeta('description'),
      metaRobots: getMeta('robots'),
      canonical: getCanonical(),
      h1s: getH1s(),
      hreflangs: getHreflangs(),
    };
  }
})();
