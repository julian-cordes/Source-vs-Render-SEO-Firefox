# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Firefox WebExtension that compares the **raw HTML source** of a page (pre-JS) against the **rendered DOM** (post-JS) and reports SEO-relevant differences (title, meta description, meta robots, canonical, H1s, hreflangs) plus an indexability verdict. The toolbar icon encodes the combined indexability and content-diff state per tab.

## Running and testing

- **No build, no bundler, no npm.** Plain JavaScript plus ES modules. Load the project via `about:debugging#/runtime/this-firefox` -> **Load Temporary Add-on...** -> select `manifest.json`. Reload the temporary add-on after edits.
- **Manual test pages**: `test-pages/` contains one HTML file per icon state. Serve them with `python -m http.server 8080` from the repo root, then visit `http://localhost:8080/test-pages/`. Each page documents its expected icon state and pre/post-JS values.
- **No automated tests exist.** Verify changes by exercising the test pages and watching the toolbar icon plus popup.

## Architecture

Three runtime contexts cooperate; each has different capabilities so logic is partitioned accordingly.

```text
              +-----------------------------+
   +--------->|  background module          |<---------+
   |          |  - orchestrates analysis    |          |
   | fetch()  |  - parses raw HTML          | runtime.onMessage
   |          |  - owns session data        |          |
   |          |  - sets per-tab icon        |          |
   |          +--------------+--------------+          |
   |                         | tabs.sendMsg            |
   |                         v                         v
   |                  +--------------+            +---------+
   |                  | content-     |            | popup.js|
   |                  | script.js    |            |         |
   |                  | rendered DOM |            |         |
   |                  +--------------+            +---------+
   | network              page DOM
```

**Analysis flow** (`analyzeTab` in `src/background/service-worker.js`):

1. `fetch(url)` from the background module -> raw HTML + HTTP status.
2. Raw HTML is parsed directly in the Firefox background document with `DOMParser`.
3. Rendered fields come from `content-script.js` via `chrome.tabs.sendMessage(tabId, {type:'GET_RENDERED_SEO'})`. If the tab was open before install, the background module falls back to `chrome.scripting.executeScript` then retries.
4. `compareSeoFields()` in `src/shared/seo-fields.js` produces a per-field `{diff, source, rendered}` map.
5. Result is stored in `chrome.storage.session` keyed by `String(tabId)`, and the icon is updated via `chrome.action.setIcon` with static PNG paths.

**Two live copies of the extraction logic are intentional.** `src/shared/seo-fields.js` is the canonical source used by the background parser. `content-script.js` reimplements the same extractors inline because content scripts declared in `manifest.json` cannot be ES modules. Any field added or changed must be updated in both places.

**Indexability rule** (`isPageIndexable` in `service-worker.js`): a page is indexable iff `metaRobots` contains no `noindex`/`none` directive **and** the canonical (after URL normalization in `normalizeComparableUrl`) is self-referencing. The popup duplicates these helpers; keep them in sync.

**Icon state** is derived from two booleans: indexability of the post-diff state, and whether any tracked field differs. See `getStatusIconKey`. When indexability itself differs between source and rendered, the icon represents the **source** state's indexability so the user sees red->green / green->red transitions.

**Analysis modes** (`compare` | `html` | `rendered`) are stored in `chrome.storage.local` under `seoInspectorAnalysisMode`. Compare is the only mode that runs `compareSeoFields`; the other two skip one side of analysis and produce indexability-only icon states.

## State, caching, invalidation

- **`ANALYSIS_VERSION`** gates reuse of stored results. Bump it whenever the result schema, comparison logic, or message protocol changes so older cached results are re-analyzed.
- **`activeAnalysisTokens`** (per-tab monotonic counter) prevents a stale analysis from overwriting a newer one when navigations overlap. Any new write path into `chrome.storage.session` must call `isCurrentAnalysis(tabId, token)` first.
- **`chrome.storage.session`** is cleared on browser restart; per-tab entries are also removed in `chrome.tabs.onRemoved`.

## Message protocol

| Channel | Direction | Payload | Notes |
|---|---|---|---|
| `chrome.tabs.sendMessage` `GET_RENDERED_SEO` | background -> content | -> `{ok, fields}` | Falls back to `executeScript` injection. |
| `chrome.runtime.onMessage` `GET_SEO_DATA` / `SET_ANALYSIS_MODE` | popup -> background | -> result | Rejected unless `isTrustedExtensionSender(sender)` (popup-origin only, no `sender.tab`). |

## Conventions and gotchas

- The repo declares `* text=auto eol=lf` in `.gitattributes`; Git on Windows will warn `LF will be replaced by CRLF`, which is harmless.
- `host_permissions: ["<all_urls>"]` is required for the background fetch to read raw HTML cross-origin; removing it breaks source analysis.
- Hash fragments are stripped in `normCanonical` / `normalizeComparableUrl`; pathname trailing slashes are collapsed. Query strings are preserved in original order (so `?a=1&b=2` is not equal to `?b=2&a=1` today).
- H1s are sorted before comparison (`normH1s`), so ordering changes are not flagged as diffs.
- The popup and background module each have their own copy of `hasNoindexDirective`, `isSelfReferencingCanonical`, and `normalizeComparableUrl`. Drift between them silently changes the displayed indexability verdict.
