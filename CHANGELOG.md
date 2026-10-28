# Changelog

All notable changes to LocalWiki. The format follows [Keep a Changelog](https://keepachangelog.com/),
and versions follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: a change that needs action from existing wikis (a data-format change, removed features).
- **MINOR**: new features that keep existing wikis working.
- **PATCH**: bug fixes and small corrections.

The version number lives in `js/version.js` (shown at the bottom of the sidebar). The data format
has its own number, `schemaVersion` in `wiki.json`, which changes only when the file layout does.
Planned work is tracked in [FEATURES.md](FEATURES.md).

## How to release

1. Add notes under **Unreleased** as you work (Added / Changed / Fixed / Removed).
2. To release: change `js/version.js`, rename **Unreleased** to the new version and date, and start a new empty **Unreleased**.
3. Commit, then tag: `git tag vX.Y.Z` (and `git push --tags`).

## Unreleased

### Planned (see FEATURES.md)
- Images in pages.
- Text sizes and colors.

## 2.7.0 — 2026-10-28

### Added
- Manual page order: drag pages in the sidebar (top third = before, bottom third = after, middle = inside as a child), or use **Move up / Move down** on the page. **A–Z** in the sidebar heading returns every group to alphabetical order. All of it is undoable.
- Pages placed by hand store a whole-number `"order"` in their page file; pages without one stay alphabetical after the placed ones. Reordering rewrites only the page files whose order changed and does not change their "Edited" dates or saved history.
- Translations of the new texts in all nine languages.

## 2.6.0 — 2026-10-21

### Added
- Interface languages: buttons, menus and messages can be shown in English, Svenska, Deutsch, Norsk bokmål, Dansk, Suomi, Français, Español or Polski (page content is never translated).
- Users can add languages from JSON files (template download, error reporting with line and column); added languages are saved in the wiki folder (`languages/`) and in ZIP exports.
- Tests that every text has a key, every key is used, calls supply their parameters, and every shipped language is complete.

### Notes
- Translations other than English were drafted by an AI assistant and need native-speaker review.
- Right-to-left languages are accepted but still laid out left-to-right.

## 2.5.0 — 2026-10-21

### Added
- Insert link dialog: type to search pages (accent- and case-insensitive) or pick from a list of all pages; web addresses; create a link to a new page.

## 2.4.0 — 2026-10-21

### Added
- Wiki settings: editable app name, icon (bundled icon, emoji or uploaded image, also used as the browser tab icon) and eight color palettes, each with matched light and dark versions, checked for contrast. Stored in the wiki folder.

## 2.3.0 — 2026-10-21

### Added
- Visual (WYSIWYG) editor beside Markdown, plus a Split view; links, tables, code blocks and symbols editable in place.

### Removed
- The hard-coded table size limit.

## 2.2.0 — 2026-10-21

### Added
- Saved page history: earlier versions of each page are kept in the wiki folder (`revisions/`), with a line-by-line comparison, restore, and recovery of deleted pages.
- Two mock sample wikis (Cisco Catalyst, Dell XR5610).
- Step-by-step help for enabling folder saving in Brave.

## 2.1.0 — 2026-10-21

### Added
- Autosave while working (to the linked folder; to a browser draft otherwise).
- Session undo and redo, including renames and deletions.
- Developer tests (`node --test`, Node 22+).

### Changed
- The single large script was split into small files by area (see ARCHITECTURE.md).

### Removed
- Keyboard shortcuts (browsers cannot be relied on to leave them alone).

## 2.0.0 — 2026-10-21

Reworked from the imported LocalWiki 1.3. Not backward compatible with 1.3 wikis' file names.

### Changed
- Page files are named after their titles (human-readable) instead of random IDs; renaming a page updates links to it.
- Titles and text work in any alphabet; search ignores case and accents and matches each word separately, with quoted phrases.
- Wikis with damaged page files open anyway; the problems are listed and the files are left untouched.
- License changed to MIT.

### Fixed
- A spurious "Unsaved changes" state.

### Removed
- Bootstrap (the stylesheet is self-contained) and all backward-compatibility code.

## 1.3.0 — baseline

The project as first imported (created with ChatGPT). Single-file app, one JSON file per page.

[Unreleased]: https://github.com/core2kx/local-js-wiki/compare/v2.7.0...HEAD
