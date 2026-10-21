/* LocalWiki — storage.js
   Reading and writing wiki folders: open, save, save to a new folder, autosave, ZIP export, and
   starting a new wiki.

   Folder format:  wiki.json             {schemaVersion, type, name, updatedAt, pages: [{id, file}]}
                   pages/<id>.json       one file per page (see model.js)
                   revisions/<id>.json   earlier versions of a page (see revisions.js)
   Folders are accessed with the browser's File System Access API (Chrome, Edge, Brave). Without it,
   a folder can still be read through a file input, but not written (use Export ZIP instead).

   Opening is tolerant: only an unusable wiki.json stops it. Broken page files are "set aside"
   (never written or deleted, kept in wiki.json, copied verbatim elsewhere), fixable problems are
   repaired, and everything is reported in the load-problems dialog.

   Saving first lets revisions.js keep versions that are about to be overwritten, then writes only
   changed pages, then wiki.json (only when needed), then deletes files of pages that were removed
   or renamed. Autosave does this a moment after editing pauses.

   Depends on: text.js, model.js, zip.js, folder.js, state.js, revisions.js, history.js, pages.js;
               asks LocalWiki.ui to redraw.
   Provides:   LocalWiki.storage */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const {slug} = LW.text;
  const {isoNow, pathFor, PAGE_PATH, normalizePage, repairStructure} = LW.model;
  const state = LW.state;
  const {markDirty, saveDraft} = LW.store;
  const {jsonText, readText, writeText, remove} = LW.folder;
  const revisions = LW.revisions;
  const ui = (LW.ui ||= {});
  const SCHEMA_VERSION = 1; // wiki.json format version
  const AUTOSAVE_DELAY = 2000, AUTOSAVE_MAX_WAIT = 15000;
  let autosaveTimer = null;

  // --- Folder format ------------------------------------------------------------------------------
  // forCopy: the index for a new location, which only lists set-aside files we can copy there.
  function indexObject(forCopy = false) {
    const wiki = state.wiki;
    const entries = [...wiki.pages, ...state.setAside.filter(entry => !forCopy || entry.text !== null)];
    return {
      schemaVersion: SCHEMA_VERSION, type: 'localwiki-index', name: wiki.name,
      updatedAt: wiki.updatedAt || isoNow(),
      pages: entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(p => ({id: p.id, file: pathFor(p.id)}))
    };
  }

  // --- Opening ------------------------------------------------------------------------------------
  // getText(path) returns a file's text, or throws an error named NotFoundError if it is missing.
  // Returns {name, pages, setAside, problems, repairedIds, indexNeedsRewrite}; only an unusable
  // wiki.json throws.
  async function readFolderContents(getText) {
    let index;
    try { index = JSON.parse(await getText('wiki.json')); }
    catch (err) {
      if (err.name === 'NotFoundError') throw new Error('This folder has no wiki.json.');
      throw new Error(err instanceof SyntaxError ? 'wiki.json is not valid JSON (' + err.message + ').' : 'Could not read wiki.json: ' + err.message);
    }
    if (!index || index.type !== 'localwiki-index' || !Array.isArray(index.pages)) throw new Error('wiki.json is not a LocalWiki index.');
    if (index.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported wiki.json version: ' + index.schemaVersion);
    if (index.pages.length > 20000) throw new Error('Too many wiki pages (limit 20,000).');
    const result = {name: 'Untitled Wiki', pages: [], setAside: [], problems: [], repairedIds: new Set(), indexNeedsRewrite: false};
    const problem = (file, message, kind) => result.problems.push({file, message, kind});
    if (typeof index.name === 'string' && index.name.trim()) result.name = index.name.trim().slice(0, 140);
    else problem('wiki.json', 'The wiki has no name, so "Untitled Wiki" is used.', 'info');
    const ids = new Set();
    for (const entry of index.pages) {
      const file = typeof entry?.file === 'string' ? entry.file : 'wiki.json';
      if (!entry || typeof entry.id !== 'string' || typeof entry.file !== 'string' || !PAGE_PATH.test(entry.file) || entry.file !== pathFor(entry.id)) {
        problem(file, 'Invalid entry in wiki.json (' + JSON.stringify(entry) + '). It was ignored and will be removed from wiki.json on the next save; no file is deleted.', 'ignored');
        result.indexNeedsRewrite = true; continue;
      }
      if (ids.has(entry.id)) {
        problem(file, 'Listed more than once in wiki.json. The duplicate entry was ignored.', 'ignored');
        result.indexNeedsRewrite = true; continue;
      }
      ids.add(entry.id);
      let text;
      try { text = await getText(entry.file); }
      catch (err) {
        if (err.name === 'NotFoundError') {
          problem(file, 'The file is missing. It will be removed from wiki.json on the next save.', 'missing');
          result.indexNeedsRewrite = true;
        } else {
          result.setAside.push({id: entry.id, file, text: null});
          problem(file, 'The file could not be read (' + err.message + '). It was set aside and left untouched.', 'set-aside');
        }
        continue;
      }
      try {
        const {page, notes} = normalizePage(JSON.parse(text), entry.id);
        if (notes.length) {
          result.repairedIds.add(page.id);
          problem(file, 'Repaired: ' + notes.join('; ') + '. The fix will be written on the next save.', 'repaired');
        }
        result.pages.push(page);
      } catch (err) {
        result.setAside.push({id: entry.id, file, text});
        const reason = err instanceof SyntaxError ? 'is not valid JSON (' + err.message + ')' : err.message;
        problem(file, `The file ${reason}. It was set aside and left untouched; fix it in a text editor and open the folder again.`, 'set-aside');
      }
    }
    repairStructure(result.pages, (page, message, repaired) => {
      if (repaired) result.repairedIds.add(page.id);
      problem(pathFor(page.id), 'This page ' + message + (repaired ? '. The fix will be written on the next save.' : '.'), repaired ? 'repaired' : 'info');
    });
    return result;
  }
  // Makes a freshly read folder the open wiki. handle is null for a read-only folder.
  function acceptLoadedFolder(result, name, handle) {
    state.wiki = {name: result.name, pages: result.pages};
    state.currentId = state.wiki.pages[0]?.id || null;
    // Only files that loaded may ever be deleted as stale; set-aside files are never touched.
    state.diskPaths = new Set(result.pages.map(p => pathFor(p.id)));
    state.setAside = result.setAside; state.loadProblems = result.problems; state.copySetAside = false;
    state.changedIds = new Set(result.repairedIds); state.renameFrom = null;
    state.pendingRenames = []; revisions.reset(result.pages);
    state.indexDirty = result.indexNeedsRewrite;
    state.folderHandle = handle;
    state.folderName = name;
    state.dirty = state.changedIds.size > 0;
    ui.clearSearch();
    LW.history.clear(); clearTimeout(autosaveTimer); state.lastSavedAt = null; state.dirtySince = 0;
    ui.renderAll(); ui.renderProblems(); saveDraft();
    const count = state.loadProblems.length;
    ui.toast('Opened ' + state.folderName + ': ' + state.wiki.pages.length + ' page(s)' + (count ? `, ${count} problem(s) found.` : '.'));
    if (count) ui.showProblems();
  }
  async function loadFromFolderHandle(handle) {
    const getText = async name => {
      const parts = name.split('/');
      if (parts.length === 1) return readText(handle, parts[0]);
      return readText(await handle.getDirectoryHandle('pages'), parts[1]);
    };
    return readFolderContents(getText);
  }
  function isCancellation(err) { return err?.name === 'AbortError'; }
  async function openFolder() {
    if (state.dirty && !confirm('Open a different folder? Your unsaved edits will be replaced.')) return;
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const handle = await window.showDirectoryPicker({mode:'readwrite', id:'localwiki'});
        const result = await loadFromFolderHandle(handle);
        acceptLoadedFolder(result, handle.name, handle);
        return;
      } catch (err) {
        if (isCancellation(err)) return;
        if (!['SecurityError','NotAllowedError','TypeError','NotSupportedError'].includes(err.name)) {
          console.error(err); ui.toast('Could not open folder: ' + err.message); return;
        }
        console.warn('Folder access unavailable; switching to folder import', err);
      }
    }
    ui.chooseFolderReadOnly(); // the file input calls openFolderFiles() with the chosen files
  }
  // Read-only fallback: the files of a folder chosen with <input webkitdirectory>.
  async function openFolderFiles(files) {
    const fileMap = new Map();
    let name = 'Imported folder';
    for (const file of files) {
      const relative = file.webkitRelativePath || file.name;
      const parts = relative.split('/');
      if (parts.length > 1) { name = parts[0]; parts.shift(); }
      // macOS may report decomposed (NFD) names; index paths are NFC.
      const path = parts.join('/').normalize('NFC');
      if (fileMap.has(path)) throw new Error('Duplicate file path: ' + path);
      fileMap.set(path, file);
    }
    const result = await readFolderContents(async path => {
      const file = fileMap.get(path.normalize('NFC'));
      if (!file) throw new DOMException('Missing ' + path, 'NotFoundError');
      return file.text();
    });
    acceptLoadedFolder(result, name, null);
    if (!result.problems.length) ui.toast('Folder loaded read-only. Use Save to folder or Export ZIP to keep edits.');
  }

  // --- Saving -------------------------------------------------------------------------------------
  const idOf = path => path.slice('pages/'.length, -'.json'.length);
  // "Save to folder…": choose a (new) destination and write the whole wiki there.
  async function saveToFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      ui.toast('Direct folder saving is unavailable here. Export a ZIP instead.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({mode:'readwrite', id:'localwiki'});
      let existing = null;
      try { existing = JSON.parse(await readText(handle, 'wiki.json')); }
      catch (err) { if (err.name !== 'NotFoundError') throw err; }
      if (existing) {
        const sameIndex = existing.type === 'localwiki-index' &&
          JSON.stringify(existing.pages) === JSON.stringify(indexObject().pages) && existing.name === state.wiki.name;
        if (!sameIndex && !confirm(`Folder "${handle.name}" already has a wiki.json. Overwrite its index with this wiki? Other page files are not deleted.`)) return;
      }
      // Saved revisions come along to the new folder.
      const previous = state.folderHandle;
      if (previous) {
        try { await revisions.copyFolder(previous, handle); }
        catch (err) { console.error(err); ui.toast('Page history could not be copied: ' + err.message); }
      }
      revisions.reset([]); // nothing of this wiki is in the new folder yet
      // When changing destination, copy all pages, not just previously edited pages.
      state.folderHandle = handle; state.folderName = handle.name;
      state.changedIds = new Set(state.wiki.pages.map(p => p.id));
      state.diskPaths = new Set(); state.indexDirty = true; // never delete files we did not write here
      state.copySetAside = state.setAside.length > 0;
      markDirty();
      await saveChanges();
    } catch (err) {
      if (isCancellation(err)) return;
      console.error(err); ui.toast('Could not choose save folder: ' + err.message);
    }
  }
  // Writes pending changes to the linked folder. auto: called by autosave (quiet unless it fails).
  async function saveChanges({auto = false} = {}) {
    if (state.saving) return;
    LW.pages.commitTitle();
    clearTimeout(autosaveTimer);
    if (!state.folderHandle) {
      if (auto) return;
      if (typeof window.showDirectoryPicker === 'function') { await saveToFolder(); return; }
      ui.toast('Choose Export wiki ZIP (direct folder saving is unavailable in this browser).'); return;
    }
    const {wiki, setAside} = state;
    const keep = new Set([...wiki.pages, ...setAside].map(p => pathFor(p.id)));
    const stale = [...state.diskPaths].filter(path => !keep.has(path));
    if (!state.dirty && !state.indexDirty && !state.changedIds.size && !stale.length && !state.copySetAside) { if (!auto) ui.toast('No changes to save.'); return; }
    state.saving = true; ui.setSaveStatus();
    // Snapshot everything up front so edits made during the async writes cannot mix states.
    const version = state.changeVersion;
    const pending = wiki.pages.filter(p => state.changedIds.has(p.id)).map(p => [pathFor(p.id), jsonText(p)]);
    const copying = state.copySetAside ? setAside.filter(entry => entry.text !== null) : [];
    const indexText = state.indexDirty ? jsonText(indexObject(state.copySetAside)) : null;
    try {
      // Keep versions that are about to be overwritten or deleted. A problem here must not stop
      // the save itself.
      try { await revisions.beforeSave(pending.map(([path, text]) => [idOf(path), text]), stale.map(idOf)); }
      catch (err) { console.error(err); ui.toast('Page history could not be updated: ' + err.message); }
      const pagesDir = await state.folderHandle.getDirectoryHandle('pages', {create:true});
      for (const [path, text] of pending) {
        await writeText(pagesDir, path.split('/')[1], text);
        state.diskPaths.add(path);
        revisions.afterWrite(idOf(path), text);
      }
      // Set-aside files are copied byte for byte, and are not added to diskPaths (never deleted).
      for (const entry of copying) await writeText(pagesDir, entry.file.split('/')[1], entry.text);
      // The manifest is written after every page it references exists, and before stale files go.
      if (indexText) await writeText(state.folderHandle, 'wiki.json', indexText);
      for (const path of stale) {
        await remove(pagesDir, path.split('/')[1]);
        state.diskPaths.delete(path);
      }
      if (state.copySetAside) { state.setAside = state.setAside.filter(entry => entry.text !== null); state.copySetAside = false; }
      // Repairs and index clean-ups are now on disk; only set-aside and informational notes still apply.
      state.loadProblems = state.loadProblems.filter(item => item.kind === 'set-aside' || item.kind === 'info');
      ui.renderProblems();
      state.lastSavedAt = new Date();
      if (version === state.changeVersion) {
        state.changedIds.clear(); state.indexDirty = false; state.dirty = false; state.dirtySince = 0;
        saveDraft();
        if (!auto) ui.toast('Saved ' + pending.length + ' page file(s)' + (indexText ? ' and wiki.json' : '') + ' to ' + state.folderName + '.');
      }
      // Otherwise edits arrived during the save; they are still marked and autosave picks them up.
    } catch (err) {
      console.error(err);
      ui.toast((auto ? 'Autosave failed: ' : 'Save failed: ') + err.message);
    } finally {
      state.saving = false; ui.setSaveStatus();
      if (state.dirty) scheduleAutosave();
    }
  }

  // --- Autosave -----------------------------------------------------------------------------------
  // Only into a linked, writable folder; waits for a pause in editing (with a ceiling for
  // continuous typing) and never saves a half-typed title.
  function scheduleAutosave(delay = AUTOSAVE_DELAY) {
    clearTimeout(autosaveTimer);
    if (!state.folderHandle || !state.dirty) return;
    const wait = Math.max(0, Math.min(delay, state.dirtySince + AUTOSAVE_MAX_WAIT - Date.now()));
    autosaveTimer = setTimeout(autosave, wait);
  }
  function autosave() {
    if (!state.folderHandle || !state.dirty) return;
    if (state.saving || state.renameFrom) { scheduleAutosave(); return; }
    saveChanges({auto: true});
  }

  // --- Export and new wiki ------------------------------------------------------------------------
  function filesForExport() {
    const files = [['wiki.json', jsonText(indexObject(true))]];
    for (const p of state.wiki.pages) files.push([pathFor(p.id), jsonText(p)]);
    for (const entry of state.setAside) if (entry.text !== null) files.push([entry.file, entry.text]);
    return files;
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function exportZip() {
    LW.pages.commitTitle();
    try {
      const name = slug(state.wiki.name, 'my-wiki') + '.zip';
      downloadBlob(LW.zip.makeZip([...filesForExport(), ...await revisions.allFiles()]), name);
      ui.toast('Exported ' + name + '. It contains wiki.json and every page JSON.');
    } catch (err) { console.error(err); ui.toast('ZIP export failed: ' + err.message); }
  }
  function newWiki() {
    if (state.dirty && !confirm('Create a new wiki? Your unsaved edits will be replaced.')) return;
    const name = prompt('Name your new wiki:', 'My Wiki');
    if (name === null) return;
    state.wiki = LW.model.normalizeWiki({name: name.trim() || 'My Wiki', pages: []});
    state.currentId = null; state.folderHandle = null; state.folderName = 'No folder selected'; state.dirty = false;
    state.diskPaths.clear(); state.changedIds.clear(); state.renameFrom = null; state.indexDirty = true; state.changeVersion++;
    state.pendingRenames = []; revisions.reset([]);
    state.setAside = []; state.loadProblems = []; state.copySetAside = false; ui.renderProblems();
    LW.history.clear(); clearTimeout(autosaveTimer); state.lastSavedAt = null; state.dirtySince = 0;
    ui.clearSearch();
    ui.renderAll(); saveDraft(); ui.toast('New wiki created. Use + to add a page.');
  }

  LW.storage = {readFolderContents, indexObject, filesForExport, openFolder, openFolderFiles, saveToFolder, saveChanges, scheduleAutosave, autosave, exportZip, newWiki};
})();
