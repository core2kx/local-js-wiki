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
- Right-to-left layout; CSV import/export of translations; native-speaker review of translations.
- Table CSV export and import, and pasting spreadsheet cells as a table (next release).

## 2.10.0 — 2026-10-29

### Added
- **Move table columns and rows.** In the Visual editor, small grips appear above the columns and beside the rows when the cursor is in a table: click one to select that column or row (Shift-click to extend), drag it to move it. The table bar also has **◀ Column / Column ▶ / ▲ Row / Row ▼** buttons. The header row always stays first. Each move is one undo step.
- **Sort a table by a column.** Click the ⇅ on a column grip (or **Sort** in the table bar): ascending first, then descending. Numbers sort as numbers (`1 000`, `2,5`, `€4,50`, `12%`), `yyyy-mm-dd` dates by date, text without regard to case and with numbers in natural order (item 2 before item 10); blank cells stay last.
- **Reset sort** puts the rows back in the order they had before the first sort. The wiki remembers that order for the session, while the same rows are in the table (it is forgotten if you add or remove rows, change a header, or reload).
- The table dialog (Markdown editor) has the same ◀ ▶ ▲ ▼ and sort buttons and a **Reset sort** button.
- Texts for all of this in all nine languages (AI-drafted, as before).

## 2.9.0 — 2026-10-28

### Added
- Text sizes (Small, Normal, Large, Huge) and eight text colors (red, orange, yellow, green, blue, purple, pink, gray) from two new toolbar buttons, in both the Visual and Markdown editors. Select words, then choose a size or color; "Normal" and "Default color" take it away again.
- In the page they are written `:size[large]{words}` and `:color[red]{words}`; they can be nested and can hold bold, links and icons.
- The colors adapt to light and dark mode and are checked for readable contrast (WCAG 4.5:1) on every palette's backgrounds.
- Translations of the new texts in all nine languages.

### Changed
- A closing brace `}` typed in the Visual editor is stored as `\}` so it cannot end a size or color by accident.

### Notes
- Other Markdown tools show `:color[red]{words}` as plain text; the words themselves are never lost.

## 2.8.0 — 2026-10-28

### Added
- Pictures in pages. The **Image** toolbar button, pasting, or dropping a picture file into the Visual editor stores the picture in the wiki folder (`images/`) and shows it in the page. PNG, JPEG, GIF and WebP are accepted; pictures larger than 1600 px or 2 MB are scaled down first.
- In the page a picture is written `![description](images/name.png)`, optionally `{width=25%}`, `{width=50%}` or `{width=75%}`. Click a picture in the Visual editor to choose Small / Medium / Large / Full width, change its description, or remove it from the page (the file stays in the folder).
- Pictures are included in ZIP exports and copied by Save to folder.
- A picture whose file is missing shows a labelled placeholder instead of breaking the page.
- Translations of the new texts in all nine languages.

### Notes
- Only pictures from the wiki folder are shown; web addresses are never loaded (the wiki stays private and offline).
- Pictures are not kept in the browser's crash-recovery draft (browser storage is too small). Without a linked folder, a picture is lost when the page is closed; the app warns when this applies.

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
