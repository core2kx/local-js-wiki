# LocalWiki architecture

LocalWiki is a browser-only app: `index.html` plus plain JavaScript and CSS files, opened by
double-clicking. There is no build step, no server and no third-party code. This document explains
how the code is organized so you can find your way around and change it safely.

## Why plain scripts instead of modules

Browsers refuse to load JavaScript modules (`import`/`export`) from a page opened as a local file
(`file://`), and a bundler would need Node and a build step. So each file is an ordinary script that
adds its part to one shared object, `window.LocalWiki`, and `index.html` loads the files in a fixed
order. Every file starts with a header saying what it does, what it depends on, and what it provides.

```js
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});   // the shared namespace
  const {slug} = LW.text;                      // use a file loaded earlier
  function something() { ... }
  LW.example = {something};                    // publish this file's functions
})();
```

## Layers

Files are listed in load order. Each layer only uses the layers above it, with one deliberate
exception: feature modules ask the screen to redraw by calling `LocalWiki.ui.*` functions.

| Layer | Files | Role |
|---|---|---|
| **Pure logic** | `icon-library.js`, `text.js`, `model.js`, `markdown.js`, `zip.js`, `search.js` | Functions that take data and return data. They never touch the page, so they also run under Node and are covered by the tests. |
| **State** | `folder.js`, `state.js` | Helpers for reading and writing folder files; the open wiki (`LocalWiki.state`) and change tracking (`LocalWiki.store`). |
| **Features** | `revisions.js`, `history.js`, `pages.js`, `storage.js` | Operations: saved page history, undo/redo, page editing and renaming, opening/saving/autosave/export. They change state and then ask the UI to redraw. They never touch HTML elements directly. |
| **Screen** | `ui/elements.js`, `ui/status.js`, `ui/page.js`, `ui/sidebar.js`, `ui/editor.js`, `ui/table-builder.js`, `ui/picker.js`, `ui/problems.js`, `ui/revisions.js`, `ui/folder-help.js` | Draw the state and handle each dialog's own buttons. All add functions to `LocalWiki.ui`. |
| **Start** | `app.js` | Wires the remaining controls to features, restores the browser draft and preferences, draws the first screen. |

### Files at a glance

| File | Look here for |
|---|---|
| `js/text.js` | Filename slugs, title comparison, accent-insensitive search folding, word count |
| `js/model.js` | What a page is, validation and repair of damaged pages, the parent/child tree, IDs and paths |
| `js/markdown.js` | The Markdown renderer, table parsing and writing, rewriting `[[links]]` on rename |
| `js/zip.js` | The ZIP writer used by "Export wiki ZIP" |
| `js/search.js` | Query parsing, ranking, result snippets |
| `js/folder.js` | Reading, writing, deleting and listing files in a folder handle |
| `js/state.js` | Every field of the open wiki's state, `markDirty`/`touchPage`, the crash-recovery draft |
| `js/revisions.js` | Saved page history: when a version is kept, thinning, line diff, following renames and deletes |
| `js/history.js` | Undo/redo snapshots and grouping (session only; `revisions.js` is the saved history) |
| `js/pages.js` | Create/select/delete pages, editing fields, committing renames |
| `js/storage.js` | Folder format, tolerant loading, saving, autosave, export, new wiki |
| `js/ui/*.js` | Everything you see; one file per area of the screen |
| `js/app.js` | Which control triggers which operation; startup |

## How a change flows

Typing in the editor, as an example:

1. `app.js` sends the textarea's `input` event to `pages.editContent(text)`.
2. `pages.editContent` calls `history.record('typing', ...)` **before** changing anything, so undo
   can return to the previous text (quick successive keystrokes share one undo step).
3. It updates the page and calls `store.touchPage(page)`, which stamps `updatedAt`, adds the page to
   `state.changedIds`, and calls `markDirty()`.
4. `markDirty()` saves the browser draft and notifies listeners: `app.js` registered the save-status
   display and `storage.scheduleAutosave()`.
5. `pages.editContent` asks the UI to redraw the preview and word count.
6. About 2 seconds after typing stops, autosave calls `storage.saveChanges()`. It first lets
   `revisions.beforeSave()` keep versions that are about to be overwritten or deleted (and move the
   history of renamed pages), then writes only the pages in `changedIds`, then `wiki.json` if
   `state.indexDirty`, then deletes files of pages that no longer exist.

Other operations follow the same pattern: **record undo → change state → touch/markDirty → redraw**.

## Rules worth keeping

- **Pure logic stays pure.** No `document`, `window` or `localStorage` in the pure-logic files, so
  they stay testable. Pass data in as arguments (for example `model.ancestors(pages, page)`).
- **Record undo before changing state.** `history.record(label, key)` snapshots the current state.
- **Every data change ends in `touchPage` or `markDirty`.** Otherwise it won't be saved.
- **Commit pending renames before switching context.** Anything that selects another page, saves,
  exports or undoes calls `pages.commitTitle()` first.
- **Page text is never trusted as HTML.** The Markdown renderer escapes everything; only bundled
  icons become SVG.
- **Set-aside files are never written or deleted.** See `storage.js` and `state.setAside`. The same
  goes for a `revisions/` file that cannot be parsed.
- **Renames must be reported to revisions.** Anything that changes a page ID calls
  `revisions.noteRename(from, to)` (pages.js does, and undo/redo replay it), or the page's history
  is left under the old name.

## Tests

Developer-only; using the wiki never needs Node. With Node 22 or newer, from the project folder:

```bash
node --test
```

`tests/load.js` loads the script files into Node the same way `index.html` does, with small
stand-ins for browser features. The tests cover the pure-logic files plus `tests/workflow.test.js`,
which runs open → rename → save → undo → delete against an in-memory folder and checks exactly which
files are written and deleted, and `tests/revisions.test.js`, which covers the page-history rules and
lifecycle (moving the clock forward instead of waiting). The screen itself (`ui/*.js`) is checked by hand in a browser.
