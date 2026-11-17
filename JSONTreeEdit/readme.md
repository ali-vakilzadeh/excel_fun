# JSON Tree Editor

A lightweight, **no-backend**, **offline-capable** JSON editor that works entirely in your browser.
It presents your JSON as a **RegEdit-style tree of keys** on the left and an **editable detail pane** on the right,
automatically detecting **table-like arrays** (arrays of objects) and rendering them as editable grids.

**Your data never leaves your computer.** All parsing, editing, and saving happen client-side.

---

## Features

- **RegEdit-style tree view** — keys only on the left, values on the right; expand/collapse, keyboard navigation.
- **Automatic table detection** — arrays of objects with shared keys render as editable grids instead of nested nodes.
- **Inline editing** — edit scalars, rename keys, add/delete keys and rows directly in the right pane.
- **Key/value search** — filter the tree to matching keys or values; step through hits with the expanded search panel.
- **Type switching** — convert a value between string, number, boolean, and null without losing your place.
- **Validation on load and save** — precise line/column error reporting for broken JSON.
- **Portable** — one folder, no build step, no server. Works on GitHub Pages *and* when opened directly from disk (`file://`).
- **Zero dependencies** — plain HTML, CSS, and JavaScript. No frameworks, no bundler, no CDN.
- **Privacy-first** — no network requests, no analytics, no cookies. Nothing is uploaded anywhere.

---

## Quick start

### Option 1: Open locally (no install)

1. Download the repository as a ZIP (Code → Download ZIP) or clone it.
2. Extract the folder.
3. Open `index.html` in any modern browser.

That's it. The app runs entirely from disk. Sample documents cannot be fetched on `file://` (browsers block it),
so use **Load** to open a `.json` file from your computer, or paste JSON into a new file and load it.

### Option 2: Serve over HTTP (GitHub Pages or local server)

Hosting the folder over `http://` or `https://` unlocks the **Samples** menu and `?sample=` URL parameters.

**GitHub Pages:**

1. Push the project to a GitHub repository.
2. Go to **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**, select `main` (or `master`) and `/ (root)`.
4. Save. GitHub publishes the site at `https://<your-username>.github.io/<repo-name>/`.

**Local server (for development):**

```bash
# Python 3
python -m http.server 8000

# or Node.js (if you have npx)
npx serve .
