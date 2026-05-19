# Source vs Render SEO Test Pages

Minimal static pages for manually testing all eight toolbar icon states, inline source-vs-rendered differences, the dedicated hreflang comparison case, and the explicit index-signals-without-indexability-change case.

Run a local server from the project root:

```powershell
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/test-pages/
```

When opening the files directly via `file://`, enable `Allow access to file URLs` on the extension card in `chrome://extensions`.

Reload the Chrome extension after code changes, then reload each test page.

Each test page displays:

- expected icon state
- source values
- JavaScript changes
- expected rendered values
- current rendered DOM values


Notable focused regression pages:

- `09-indexable-hreflang-diff.html`: verifies hreflang changes are detected as content differences.
- `10-indexable-added-index-signals-title-diff.html`: verifies added `meta robots` and self-referencing canonical tags do not count as an indexability change when the page remains indexable.
