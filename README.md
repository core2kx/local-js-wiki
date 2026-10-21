# LocalWiki — an offline wiki, one JSON file per page

A browser-only wiki that works offline. **No runtime server, database, Python, Node.js, CDN, package manager, or internet connection is required.** Double-click `index.html` in Chrome or Edge, or in Brave after turning on folder access (see [Brave](#brave)).

## How it stores data

**Each page has its own JSON file, named after its title.** A page titled "Network Setup" has the ID `network-setup` and lives in `pages/network-setup.json`. The wiki's small `wiki.json` index stores the wiki name and the list of pages (sorted by ID). Page content, titles, tags, icons, and parent IDs live in the individual page files. Search covers titles, tags, and content across all opened pages (held in memory by the browser).

### Renaming pages

Page titles are unique (ignoring case). When you rename a page (the change is applied when you leave the title field or press Enter), the wiki updates everything that depends on it:

- Links to the page in every other page: `[[Old title]]` becomes `[[New title]]`, and `[[old-id|Text]]` becomes `[[new-id|Text]]` (custom link text is kept). Links inside `code` spans and code blocks are left alone.
- The page ID and filename, and the `parentId` of its child pages.
- On the next save, the new file is written, `wiki.json` is updated, and the old file is deleted.

### Titles in any language

Titles, filenames, links, and search work in any script. IDs are lowercase and keep the title's own alphabet: `Привет мир` → `привет-мир.json`, `東京の天気` → `東京の天気.json`, `שלום עולם` → `שלום-עולם.json`. Accents on Latin letters are simplified (`Café` → `cafe`); punctuation, symbols, and emoji become hyphens or are dropped; name clashes get a numeric suffix (`c`, `c-2`). Filenames are capped at 60 characters / 150 bytes.

- Title comparison (duplicates and links) ignores case the same way on every computer, regardless of the browser's language: `Straße` matches `STRASSE`, and differently-encoded accents count as equal.
- Right-to-left text (Hebrew, Arabic) is displayed right-to-left in titles, the editor, the sidebar, and each rendered paragraph.
- Search ignores case and accents: `cafe` finds `Café`, `strasse` finds `Straße`, `αθηνα` finds `Αθήνα`, `елка` finds `ёлка`. Vowel signs in scripts such as Hindi, Thai, Arabic, and Hebrew still count, and Russian `й` stays distinct from `и`. The matched text is highlighted in the result snippet.
- Word counts handle languages written without spaces (Chinese, Japanese, Thai).

## Editing pages

The page editor has three views (remembered per browser):

- **Visual** (the default): edit the formatted page directly, like a word processor. The toolbar formats the selection: heading, bold, italic, strikethrough, bulleted and numbered lists, quote, inline code, code block, external link, link to a wiki page, and table. Click inside a link for **Open / Edit / Remove**; click inside a table for **+ Row / + Column / − Row / − Column / Delete table**. Pasting inserts plain text. In a code block, Enter adds a line and Enter on an empty last line leaves the block.
- **Markdown**: edit the Markdown text directly; the same toolbar inserts Markdown around the selection.
- **Split**: Markdown and Visual side by side; typing in either updates the other.

Pages are always saved as Markdown, whichever view you use, so undo, autosave, page history, renaming and search work the same. Characters you type in Visual stay exactly as typed: `*`, `[[`, `#` or `|` become backslash-escaped in the Markdown (`\*`) instead of turning into formatting. Visual editing writes the page in a consistent Markdown style (for example `-` for bullets), so a page written by hand may be tidied slightly the first time it is edited visually; what it displays does not change.

## Tables, symbols and icons

- **Create tables:** In Visual, choose **▦ Table** to insert a table, then type into the cells and use the table bar to add or remove rows and columns. In Markdown, **▦ Table** opens a grid dialog. Tables have no size limit.
- **Edit an existing table:** In Visual, click into it and edit the cells directly. In Markdown, put the text cursor inside the table and choose **▦ Table**; changes are written back to the same Markdown table while keeping the surrounding page intact.
- **Insert symbols:** Choose **Ω Symbols**; search names (e.g. `ohm`, `arrow`, `check`, `degree`), then click an entry to insert the Unicode character at the editor cursor.
- **Insert icons:** Choose **☆ Icons**; choose from 32 local scalable SVG icons or switch to emoji. Search is included. SVG icons are saved as text markers such as `:icon[server]:`. The local `js/icon-library.js` file supplies their artwork, so no icon fonts or CSS framework are required. Symbols and emoji are saved as plain Unicode text.
- **Assign a page icon:** Click the square icon beside the page title to choose an icon, emoji, or symbol. The selection appears on the page and in the navigation sidebar, and is stored as the `icon` value in that page's JSON file.

Note: Tables are saved as **Markdown**, not separate structured table objects. This keeps JSON easy to read and edit, but it is not a spreadsheet and does not include merged cells, formulas, sorting, or CSV import.

## Folder layout

```text
localwiki/
├── index.html                  # Browser application
├── css/
│   └── wiki.css               # All styling; self-contained and editable
├── js/                        # Plain scripts, loaded in order by index.html
│   ├── icon-library.js        # Bundled SVG icons; optional to extend
│   ├── text.js, model.js, markdown.js, zip.js, search.js   # Pure logic
│   ├── folder.js, state.js    # Folder access helpers; the open wiki and change tracking
│   ├── revisions.js, history.js, pages.js, storage.js       # Saved history, undo, page operations, files
│   ├── ui/                    # Everything on screen, one file per area
│   └── app.js                 # Wiring and startup
├── tests/                     # Developer tests: node --test (not needed to use the wiki)
├── data/                      # Sample wikis: choose Open folder -> one of these directories
│   ├── cisco-catalyst-wiki/   # Mock campus network runbook (Cisco Catalyst 9000, IOS XE)
│   ├── dell-xr5610-wiki/      # Mock edge server runbook (Dell PowerEdge XR5610, iDRAC9)
│   └── example-wiki/          # Short tour of the editor's features
│       ├── wiki.json         # Index only (name, page IDs, filenames)
│       └── pages/
│           ├── welcome.json
│           ├── editing-guide.json
│           ├── project-notes.json
│           └── tables-symbols-and-icons.json
├── ARCHITECTURE.md            # How the code is organized
└── README.md
```

A wiki folder can be anywhere on your disk, independently of the app directory. **Make a new empty folder for your own wiki** (e.g. `Documents/TechWiki`). The editor writes `wiki.json` and creates `pages/` (and `revisions/` for page history) within that chosen folder.

### Example index, `wiki.json`

```json
{
  "schemaVersion": 1,
  "type": "localwiki-index",
  "name": "Example Wiki",
  "pages": [
    { "id": "welcome", "file": "pages/welcome.json" },
    { "id": "editing-guide", "file": "pages/editing-guide.json" }
  ]
}
```

### Example page, `pages/welcome.json`

```json
{
  "id": "welcome",
  "title": "Welcome",
  "icon": "icon:home",
  "parentId": null,
  "tags": ["getting started"],
  "content": "# Welcome\n\nYour wiki content goes here.",
  "createdAt": "2026-10-20T10:00:00.000Z",
  "updatedAt": "2026-10-20T10:00:00.000Z"
}
```

`id` always matches the filename. `parentId` connects nested pages; `null` is a top-level page.

## Getting started

1. Open `index.html` in Chrome or Edge on a desktop computer. In Brave, first turn on folder access (see [Brave](#brave)).
2. Click **Open folder** and select one of the samples in `data/` (`example-wiki` tours the editor; `cisco-catalyst-wiki` and `dell-xr5610-wiki` are realistic mock runbooks), **or** click the `+` button to create your own pages. The mock wikis use invented names, addresses and versions; check vendor documentation before using their procedures. Opening a sample with write access means edits are saved into it; use **Save to folder…** to work on a copy.
3. Edit titles, tags, parent relationships, and Markdown as before. Page width can be changed to 75%, 90%, or 100%; 90% is the default.
4. Click **Save changes** (or **Save to folder…**) and choose a writable directory. From then on, **changes are saved automatically** to that folder about 2 seconds after you stop editing (at least every 15 seconds while typing, and when you switch away from the tab). The status in the top bar shows *Saving…* and *Saved at …*. **Save changes** still saves immediately.
5. To make a complete portable backup, click **Export wiki ZIP…**. The downloaded ZIP contains `wiki.json` and the individual `pages/*.json` files. Extract that ZIP and open its extracted folder to work with it later.

**You must select the wiki folder again after reopening the HTML page.** A local `file://` webpage cannot silently enumerate disk folders on startup without being granted permission. Browser local storage is used only as a temporary draft-recovery cache; it is not the master copy.

### Undo and redo

**↶ Undo** and **↷ Redo** in the top bar step through every change made in this session: typing (grouped into bursts), formatting, tables, icons, tags, moves, new pages, deletes, and renames. Undoing a rename also restores the links it rewrote and the old filename; undoing a delete brings back the page and its children. Undone changes are written to the folder by autosave like any other change. Hover a button to see which step it will undo or redo. History holds the last 200 steps and is cleared when you open or create a different wiki or reload the page; for anything older, use page history (below).

### Page history (saved versions)

Earlier versions of each page are kept in the wiki folder, in `revisions/<page id>.json`, so they survive reloads and are included in backups. Choose **History** above the page:

- **This page** lists saved versions with their date. Choosing one shows what changed since then (red lines are only in that version, green lines were added since). **Restore this version** brings back its text, tags and icon; the title and position stay as they are, and the restore can be undone.
- **Deleted pages** lists pages that were deleted, with **Restore page**.

When a version is kept: just before a page is overwritten, the version on disk is kept if it had rested unchanged for 10 minutes or more (so the state before each editing session is always kept), or if the last saved version is more than 10 minutes old (a checkpoint during long sessions). The first change to a page keeps its original. Versions from the last 7 days are all kept; older ones are thinned to one per day, with at most 100 per page. Renaming a page moves its history with it, and deleting a page keeps its history so it can be restored.

Page history needs a linked folder (**Open folder** or **Save to folder…**). **Save to folder…** and **Export wiki ZIP…** copy the `revisions/` folder along.

### Browser permissions and saving

- In browsers with the File System Access API (recent Chrome and Edge, and Brave once it is turned on), **Open folder** grants access to the selected directory, and **Save changes** writes the index and changed page files in place. The browser may prompt for read/write permission.
- Without it, **Open folder** and **Save changes** show a dialog that explains what to do in your browser and offers **Open read-only** or **Export wiki ZIP…**.

#### Brave

Brave turns the File System Access API off by default, so LocalWiki cannot save into folders until you turn it on:

1. Open a new tab and go to `brave://flags/#file-system-access-api` (or search the flags page for "File System Access").
2. Set **File System Access API** to **Enabled**.
3. Click **Relaunch**, then use **Open folder** again.
- If writable folder access is missing or denied, **Open folder** falls back to a folder input, which can *read* the chosen folder but cannot overwrite it. Use **Export wiki ZIP** to save all pages as one downloadable ZIP; extract it to obtain separate JSON files.
- **Save to folder…** lets you choose a new destination. If the destination already contains a different `wiki.json`, the app warns before replacing its index. Use a new empty folder for safe copies.
- **Export wiki ZIP…** works without a server or outside libraries. It uses standard, uncompressed ZIP entries, so archives are larger but compatible with normal extraction tools.

### Damaged or hand-edited files

Opening a folder only fails if `wiki.json` itself is missing or unusable. Problems with individual pages are listed in a dialog after opening (reopen it from **⚠ N load problems** in the sidebar), and the rest of the wiki loads normally:

| Problem | What happens |
|---|---|
| Page file is not valid JSON, not a JSON object, or has a non-text title/content | **Set aside.** The file is never changed or deleted and stays in `wiki.json`; it is copied byte for byte by **Save to folder…** and **Export wiki ZIP…**. Fix it in a text editor and open the folder again. |
| Page file is missing | Skipped; removed from `wiki.json` on the next save. |
| `id` does not match the filename, missing title or content, duplicate title, pages that are each other's parent | **Repaired** in the app; the fix is written on the next save. |
| Parent page did not load | Page is shown at the top level, but its `parentId` is kept so it nests again once the parent is fixed. |
| Invalid or duplicate entry in `wiki.json` | Ignored and removed from `wiki.json` on the next save; no file is deleted. |

New pages never take the filename of a set-aside file.

## Other features

- Create, edit, nest, rename, move, and delete pages.
- Search across titles, tags, and text of all opened pages. Each word is matched separately and in any order (`lisbon friday` finds pages containing both words); put words in quotes for an exact phrase (`"lisbon trip"`). Results with words in the title rank first, and matched words are highlighted.
- Visual (WYSIWYG), Markdown and split editing; tables edited in place or with the grid dialog; Unicode symbols, emoji, inline SVG tokens; internal links `[[Page title]]` and `[[page-id|Text]]`.
- Light/dark mode, responsive sidebar and 75%/90%/100% page width.
- All assets are local and there are no third-party libraries or CSS frameworks. Layout customizations belong in `css/wiki.css`.
- Safe Markdown renderer escapes HTML and does not execute scripts from wiki content.

## Limits

- Designed for one editor at a time. It does not lock files, compare versions, merge edits, or provide database transactions.
- The browser loads all pages into memory for search and navigation. Very large wikis may take longer to open.
- Saving is a sequence of individual file writes, not a transactional operation. Keep backups. If a save is interrupted, reopen the wiki to inspect its state.
- Delete removes the page and its descendants from the index. When saving to a linked writable folder, their old JSON files are removed after the index is updated. Files not referenced by the index are ignored.
- Old files are only cleaned up in a folder opened (or first saved) in the current session. If you recover a browser draft and save it with **Save to folder…**, files from pages renamed or deleted in that draft stay behind; they are harmless because the index no longer references them.
- Links to a deleted page are not removed; they show as missing links.
- Browser restrictions prevent unattended opening of `wiki.json` and `pages/*.json` through relative `file://` paths. Always use the **Open folder** button.
- The Markdown renderer is a lightweight subset of Markdown, not a full CommonMark editor. Very complicated tables and nested formatting are not supported. Lists have one level (nested lists made in Visual are flattened), and there are no images, colors or underlining.
- SVG pictograms are selected from a bundled allowlist; arbitrary SVG or HTML in page content is not executed. If you export pages as JSON, the icon markup `:icon[name]:` is intended for LocalWiki rendering. Unicode symbols and emoji remain portable to other editors.

## For developers

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is organized. Tests need Node 22 or newer and run with `node --test` from the project folder; nothing else is installed.

## License

MIT. See [LICENSE](LICENSE).
