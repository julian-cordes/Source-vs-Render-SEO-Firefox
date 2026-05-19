# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Chrome extension that compares the **raw HTML source** of a page (pre-JS) against the **rendered DOM** (post-JS) and reports SEO-relevant differences (title, meta description, meta robots, canonical, H1s, hreflangs) plus an indexability verdict. The toolbar icon encodes the combined indexability + content-diff state per tab.

## Running and testing

- **No build, no bundler, no npm.** Plain ES modules + classic scripts; load the project folder via `chrome://extensions` → Developer mode → **Load unpacked**. Reload the extension after edits.
- **File URLs**: enable "Allow access to file URLs" on the extension card to analyze `file://` pages.
- **Manual test pages**: `test-pages/` contains one HTML file per icon state. Serve them with `python -m http.server 8080` from the repo root, then visit `http://localhost:8080/test-pages/`. Each page documents its expected icon state and pre/post-JS values.
- **No automated tests exist.** Verify changes by exercising the eight test pages and watching the toolbar icon + popup.

## Architecture

Four runtime contexts cooperate; each has different capabilities so logic is partitioned accordingly.

```
              ┌─────────────────────────────┐
   ┌─────────►│  service-worker.js (module) │◄─────────┐
   │          │  - orchestrates analysis    │          │
   │          │  - owns chrome.storage.session per-tab │
   │  fetch() │  - sets per-tab icon                   │
   │          └──┬──────────────┬────────────────┬─────┘
   │             │ port         │ tabs.sendMsg   │ runtime.onMessage
   │             ▼              ▼                ▼
   │     ┌──────────────┐  ┌──────────────┐  ┌─────────┐
   │     │ offscreen.js │  │ content-     │  │ popup.js│
   │     │ DOMParser    │  │ script.js    │  │         │
   │     │ (raw HTML)   │  │ (rendered    │  │         │
   │     │              │  │ DOM, IIFE)   │  │         │
   │     └──────────────┘  └──────────────┘  └─────────┘
   │ network                  page DOM
```

**Analysis flow** (`analyzeTab` in `src/background/service-worker.js`):
1. `fetch(url)` from the service worker → raw HTML + HTTP status.
2. Raw HTML is parsed in the **offscreen document** (service workers have no `DOMParser`). The SW opens a dedicated `chrome.runtime.connect({name:'PARSE_RAW_HTML'})` port to `offscreen.js` and posts the HTML. Do **not** revert to `chrome.runtime.sendMessage` for HTML — it broadcasts to every extension context.
3. Rendered fields come from `content-script.js` via `chrome.tabs.sendMessage(tabId, {type:'GET_RENDERED_SEO'})`. If the tab was open before install, the SW falls back to `chrome.scripting.executeScript` then retries.
4. `compareSeoFields()` in `src/shared/seo-fields.js` produces a per-field `{diff, source, rendered}` map.
5. Result is stored in `chrome.storage.session` keyed by `String(tabId)`, and the icon is updated via `chrome.action.setIcon` with `ImageData` rendered through `OffscreenCanvas`.

**Three copies of the extraction logic — intentional.** `src/shared/seo-fields.js` is the canonical source. `content-script.js` and `offscreen.js` reimplement the same extractors inline because:
- Content scripts declared in `manifest.json` cannot be ES modules.
- `offscreen.html` loads `offscreen.js` as a classic `<script>` (not `type="module"`).
Any field added or changed must be updated in all three. If `offscreen.html` is converted to `type="module"`, the offscreen copy can be replaced with an import from `seo-fields.js`.

**Indexability rule** (`isPageIndexable` in `service-worker.js`): a page is indexable iff `metaRobots` contains no `noindex`/`none` directive **and** the canonical (after URL normalization in `normalizeComparableUrl`) is self-referencing. The popup duplicates these helpers — keep them in sync.

**Icon state** is derived from two booleans: indexability of the *post-diff* state, and whether any tracked field differs. See `getStatusIconKey`. When indexability itself differs between source and rendered, the icon represents the **source** state's indexability (so the user sees red→green / green→red transitions).

**Analysis modes** (`compare` | `html` | `rendered`) are stored in `chrome.storage.local` under `seoInspectorAnalysisMode`. Compare is the only mode that runs `compareSeoFields`; the other two skip one fetch and produce indexability-only icon states.

## State, caching, invalidation

- **`ANALYSIS_VERSION`** (currently `'analysis-mode-v4'`) gates reuse of stored results. Bump it whenever the result schema, comparison logic, or message protocol changes — older cached results are then re-analyzed instead of rendered.
- **`activeAnalysisTokens`** (per-tab monotonic counter) prevents a stale analysis from overwriting a newer one when navigations overlap. Any new write path into `chrome.storage.session` must call `isCurrentAnalysis(tabId, token)` first.
- **`offscreenDocumentPromise`** must not be cached past a successful create. Chrome auto-closes idle offscreen documents; always re-check `chrome.offscreen.hasDocument()` before assuming it's alive (see `ensureOffscreenDocument`).
- **`chrome.storage.session`** is cleared on browser restart; per-tab entries are also removed in `chrome.tabs.onRemoved`.

## Message protocol

| Channel | Direction | Payload | Notes |
|---|---|---|---|
| `chrome.runtime.connect('PARSE_RAW_HTML')` | SW → offscreen | `{html}` → `{ok, fields}` or `{ok:false, error}` | Dedicated port; do not broadcast raw HTML. |
| `chrome.tabs.sendMessage` `GET_RENDERED_SEO` | SW → content | → `{ok, fields}` | Falls back to `executeScript` injection. |
| `chrome.runtime.onMessage` `GET_SEO_DATA` / `SET_ANALYSIS_MODE` | popup → SW | → result | Rejected unless `isTrustedExtensionSender(sender)` (popup-origin only, no `sender.tab`). |

## Conventions and gotchas

- The repo declares `* text=auto eol=lf` in `.gitattributes`; Git on Windows will warn `LF will be replaced by CRLF` — harmless.
- `host_permissions: ["<all_urls>"]` is required for the SW's `fetch()` to read raw HTML cross-origin; removing it breaks source analysis.
- Hash fragments are stripped in `normCanonical` / `normalizeComparableUrl`; pathname trailing slashes are collapsed. Query strings are preserved in original order (so `?a=1&b=2` ≠ `?b=2&a=1` today).
- H1s are sorted before comparison (`normH1s`), so ordering changes are not flagged as diffs.
- The popup and service worker each have their own copy of `hasNoindexDirective`, `isSelfReferencingCanonical`, and `normalizeComparableUrl`. Drift between them silently changes the displayed indexability verdict.
