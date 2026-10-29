# Feature list

Every feature, the version it arrived in, and what is planned. Details of each release are in
[CHANGELOG.md](CHANGELOG.md). Current version: see `js/version.js`.

Status: ✅ shipped · 🚧 in progress · 📋 planned · 🐞 known issue

## Pages and structure

| Feature | Status | Since |
|---|---|---|
| One JSON file per page, plus `wiki.json` index | ✅ | 1.3 |
| Nested pages (parent/child), move between parents | ✅ | 1.3 |
| Human-readable page file names; links follow renames | ✅ | 2.0 |
| Titles and text in any alphabet | ✅ | 2.0 |
| Tags, page icons, page width | ✅ | 1.3 |
| Manual page order: drag and drop, move up/down, sort A–Z | ✅ | 2.7 |

## Editing

| Feature | Status | Since |
|---|---|---|
| Markdown editor with toolbar | ✅ | 1.3 |
| Tables (grid dialog), symbols, emoji, SVG icons | ✅ | 1.3 |
| Visual (WYSIWYG) and Split editing; tables edited in place | ✅ | 2.3 |
| No table size limit | ✅ | 2.3 |
| Select, drag-move and button-move table columns and rows | ✅ | 2.10 |
| Sort a table by any column; Reset sort | ✅ | 2.10 |
| Table CSV export and import; paste spreadsheet cells as a table | ✅ | 2.11 |
| Insert link dialog (page search, list of all pages, web addresses) | ✅ | 2.5 |
| Images in pages (stored in the wiki folder; sizes; paste and drop) | ✅ | 2.8 |
| Text sizes (Small, Normal, Large, Huge) | ✅ | 2.9 |
| Text colors (eight named, theme-aware, contrast-checked) | ✅ | 2.9 |
| Caret jumps when editing table header cells (not reproduced; needs repro details) | 🐞 | — |

## Safety, saving and history

| Feature | Status | Since |
|---|---|---|
| Open/save a folder (File System Access API), ZIP export | ✅ | 1.3 |
| Autosave | ✅ | 2.1 |
| Session undo and redo | ✅ | 2.1 |
| Saved page history with comparison, restore, deleted-page recovery | ✅ | 2.2 |
| Opens wikis with damaged files; problems listed, files untouched | ✅ | 2.0 |
| Brave setup help | ✅ | 2.2 |

## Search

| Feature | Status | Since |
|---|---|---|
| Search titles, tags and text | ✅ | 1.3 |
| Case- and accent-insensitive; words matched separately; quoted phrases | ✅ | 2.0 |

## Look and language

| Feature | Status | Since |
|---|---|---|
| Light/dark mode, responsive layout | ✅ | 1.3 |
| Editable app name and icon (also the browser tab icon) | ✅ | 2.4 |
| Color palettes (8, light and dark, contrast-checked) | ✅ | 2.4 |
| Interface languages: 9 built in, user-added from JSON files, saved in the wiki folder | ✅ | 2.6 |
| Right-to-left layout | 📋 | — |
| CSV import/export of translations | 📋 | — |
| Native-speaker review of the AI-drafted translations | 📋 | — |

## Project

| Feature | Status | Since |
|---|---|---|
| MIT license, no third-party libraries | ✅ | 2.0 |
| Developer tests (`node --test`) | ✅ | 2.1 |
| Version number, changelog and feature list | ✅ | 2.6 |
