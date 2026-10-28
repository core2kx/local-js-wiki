/* LocalWiki — storage.js
   Reading and writing wiki folders: open, save, save to a new folder, autosave, ZIP export, and
   starting a new wiki.

   Folder format:  wiki.json             {schemaVersion, type, name, appearance, updatedAt, pages: [{id, file}]}
                   pages/<id>.json       one file per page (see model.js)
                   revisions/<id>.json   earlier versions of a page (see revisions.js)
                   branding/logo.png     the wiki's icon, when an image was chosen (appearance.icon "image")
                   images/*              pictures shown in pages (see images.js)
                   languages/<code>.json added interface languages (see languages.js)
   Folders are accessed with the browser's File System Access API (Chrome, Edge, Brave). Without it,
   a folder can still be read through a file input, but not written (use Export ZIP instead).

   Opening is tolerant: only an unusable wiki.json stops it. Broken page files are "set aside"
   (never written or deleted, kept in wiki.json, copied verbatim elsewhere), fixable problems are
   repaired, and everything is reported in the load-problems dialog.

   Saving first lets revisions.js keep versions that are about to be overwritten, then writes only
   changed pages, then wiki.json (only when needed), then deletes files of pages that were removed
   or renamed. Autosave does this a moment after editing pauses.

   Depends on: i18n.js, text.js, model.js, zip.js, folder.js, state.js, languages.js, images.js, revisions.js,
               history.js, pages.js; asks LocalWiki.ui to redraw.
   Provides:   LocalWiki.storage */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const {slug} = LW.text;
  const i18n = LW.i18n;
  const {t} = i18n;
  const {isoNow, pathFor, PAGE_PATH, normalizePage, repairStructure, normalizeAppearance, LOGO_PATH} = LW.model;
  const state = LW.state;
  const {markDirty, saveDraft} = LW.store;
  const {jsonText, readText, writeText, remove, subfolder, blobToDataUrl, dataUrlToBytes} = LW.folder;
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
      appearance: wiki.appearance,
      updatedAt: wiki.updatedAt || isoNow(),
      pages: entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(p => ({id: p.id, file: pathFor(p.id)}))
    };
  }

  // --- Opening ------------------------------------------------------------------------------------
  // getText(path) / getBlob(path) return a file's text / contents, or throw an error named
  // NotFoundError if it is missing; listFiles(dir) lists the file names in a folder. Returns
  // {name, appearance, logo, pages, setAside, problems, languages, repairedIds, indexNeedsRewrite};
  // only an unusable wiki.json throws. Problems are {file, key, params, kind}: translatable messages
  // (see i18n.js) that the problems dialog turns into text.
  async function readFolderContents(getText, getBlob = null, listFiles = null) {
    let index;
    try { index = JSON.parse(await getText('wiki.json')); }
    catch (err) {
      if (err.name === 'NotFoundError') throw i18n.error('err.no_wiki_json');
      throw err instanceof SyntaxError ? i18n.error('err.wiki_json_invalid', {error: err.message}) : i18n.error('err.wiki_json_read', {error: err.message});
    }
    if (!index || index.type !== 'localwiki-index' || !Array.isArray(index.pages)) throw i18n.error('err.not_index');
    if (index.schemaVersion !== SCHEMA_VERSION) throw i18n.error('err.version', {version: index.schemaVersion});
    if (index.pages.length > 20000) throw i18n.error('err.too_many');
    const result = {name: 'Untitled Wiki', pages: [], setAside: [], problems: [], languages: [], repairedIds: new Set(), indexNeedsRewrite: false};
    const problem = (file, key, params, kind) => result.problems.push({file, key, params, kind});
    if (typeof index.name === 'string' && index.name.trim()) result.name = index.name.trim().slice(0, 140);
    else problem('wiki.json', 'prob.no_name', {name: result.name}, 'info');
    result.appearance = normalizeAppearance(index.appearance);
    result.logo = null;
    if (result.appearance.icon === 'image') {
      try { result.logo = await blobToDataUrl(await getBlob(LOGO_PATH), 'image/png'); }
      catch (err) {
        problem(LOGO_PATH, 'prob.logo', {reason: err.name === 'NotFoundError' ? {key: 'prob.reason_missing'} : err.message}, 'info');
        result.appearance.icon = '';
        result.indexNeedsRewrite = true;
      }
    }
    const ids = new Set();
    for (const entry of index.pages) {
      const file = typeof entry?.file === 'string' ? entry.file : 'wiki.json';
      if (!entry || typeof entry.id !== 'string' || typeof entry.file !== 'string' || !PAGE_PATH.test(entry.file) || entry.file !== pathFor(entry.id)) {
        problem(file, 'prob.bad_entry', {entry: JSON.stringify(entry)}, 'ignored');
        result.indexNeedsRewrite = true; continue;
      }
      if (ids.has(entry.id)) {
        problem(file, 'prob.duplicate', {}, 'ignored');
        result.indexNeedsRewrite = true; continue;
      }
      ids.add(entry.id);
      let text;
      try { text = await getText(entry.file); }
      catch (err) {
        if (err.name === 'NotFoundError') {
          problem(file, 'prob.missing', {}, 'missing');
          result.indexNeedsRewrite = true;
        } else {
          result.setAside.push({id: entry.id, file, text: null});
          problem(file, 'prob.unreadable', {error: err.message}, 'set-aside');
        }
        continue;
      }
      try {
        const {page, notes} = normalizePage(JSON.parse(text), entry.id);
        if (notes.length) {
          result.repairedIds.add(page.id);
          problem(file, 'prob.repaired', {notes}, 'repaired');
        }
        result.pages.push(page);
      } catch (err) {
        result.setAside.push({id: entry.id, file, text});
        const reason = err instanceof SyntaxError ? {key: 'prob.not_json', params: {error: err.message}}
          : err.name === 'KeyError' ? {key: err.key, params: err.params} : err.message;
        problem(file, 'prob.set_aside', {reason}, 'set-aside');
      }
    }
    repairStructure(result.pages, (page, note, repaired) => {
      if (repaired) result.repairedIds.add(page.id);
      problem(pathFor(page.id), repaired ? 'prob.page_note_fixed' : 'prob.page_note', {note}, repaired ? 'repaired' : 'info');
    });
    // Pictures (images/*): the files themselves are only read lazily by the browser; unusable names are ignored.
    result.images = [];
    if (listFiles) {
      for (const name of await listFiles(LW.images.DIR)) {
        const path = LW.images.DIR + '/' + name;
        if (!LW.model.IMAGE_PATH.test(path)) continue;
        try { result.images.push({path, blob: await getBlob(path)}); } catch (_) { /* unreadable: skip */ }
      }
    }
    // Interface languages added to this wiki (languages/*.json); languages.js registers them.
    if (listFiles) {
      for (const name of (await listFiles(LW.languages.DIR)).filter(n => n.toLowerCase().endsWith('.json'))) {
        try { result.languages.push({name, text: await getText(LW.languages.DIR + '/' + name)}); } catch (_) { /* unreadable: skip */ }
      }
    }
    return result;
  }
  // Makes a freshly read folder the open wiki. handle is null for a read-only folder.
  function acceptLoadedFolder(result, name, handle) {
    state.wiki = {name: result.name, appearance: result.appearance, pages: result.pages};
    state.logo = result.logo; state.logoDirty = false;
    LW.images.load(result.images);
    state.currentId = state.wiki.pages[0]?.id || null;
    // Only files that loaded may ever be deleted as stale; set-aside files are never touched.
    state.diskPaths = new Set(result.pages.map(p => pathFor(p.id)));
    state.setAside = result.setAside; state.loadProblems = result.problems; state.copySetAside = false;
    state.changedIds = new Set(result.repairedIds); state.renameFrom = null;
    state.pendingRenames = []; revisions.reset(result.pages);
    state.indexDirty = result.indexNeedsRewrite;
    state.folderHandle = handle;
    state.folderName = name; state.draftRecovered = false;
    state.dirty = state.changedIds.size > 0;
    ui.clearSearch();
    LW.history.clear(); clearTimeout(autosaveTimer); state.lastSavedAt = null; state.dirtySince = 0;
    // Languages saved in the folder become available (and replace same-code ones kept in this browser).
    const adopted = LW.languages.adopt(result.languages);
    for (const {file, error} of adopted.problems) state.loadProblems.push({file, key: 'prob.language_file', params: {error}, kind: 'info'});
    if (adopted.changed) ui.applyLanguage();
    ui.renderAll(); ui.renderProblems(); saveDraft();
    const count = state.loadProblems.length;
    const pages = t('count.pages', {count: state.wiki.pages.length});
    ui.toast(count ? t('toast.opened_problems', {folder: name, pages, problems: t('count.problems', {count})}) : t('toast.opened', {folder: name, pages}));
    if (count) ui.showProblems();
  }
  async function loadFromFolderHandle(handle) {
    const fileOf = async path => {
      const parts = path.split('/');
      return parts.length === 1 ? [handle, parts[0]] : [await handle.getDirectoryHandle(parts[0]), parts[1]];
    };
    const listFiles = async dir => { const sub = await subfolder(handle, dir); return sub ? LW.folder.fileNames(sub) : []; };
    return readFolderContents(async path => readText(...await fileOf(path)), async path => LW.folder.readBlob(...await fileOf(path)), listFiles);
  }
  function isCancellation(err) { return err?.name === 'AbortError'; }
  async function openFolder() {
    if (state.dirty && !confirm(t('confirm.open_other'))) return;
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const handle = await window.showDirectoryPicker({mode:'readwrite', id:'localwiki'});
        const result = await loadFromFolderHandle(handle);
        acceptLoadedFolder(result, handle.name, handle);
        return;
      } catch (err) {
        if (isCancellation(err)) return;
        if (!['SecurityError','NotAllowedError','TypeError','NotSupportedError'].includes(err.name)) {
          console.error(err); ui.toast(t('toast.open_failed', {error: i18n.describeError(err)})); return;
        }
        console.warn('Folder access refused', err);
        ui.explainFolderAccess({purpose: 'open', blocked: true});
        return;
      }
    }
    // No folder access (e.g. Brave's default): explain, and offer read-only opening, which ends in
    // openFolderFiles() with the files chosen in the file input.
    ui.explainFolderAccess({purpose: 'open'});
  }
  // Read-only fallback: the files of a folder chosen with <input webkitdirectory>.
  async function openFolderFiles(files) {
    const fileMap = new Map();
    let name = t('file.imported');
    for (const file of files) {
      const relative = file.webkitRelativePath || file.name;
      const parts = relative.split('/');
      if (parts.length > 1) { name = parts[0]; parts.shift(); }
      // macOS may report decomposed (NFD) names; index paths are NFC.
      const path = parts.join('/').normalize('NFC');
      if (fileMap.has(path)) throw i18n.error('err.duplicate_path', {path});
      fileMap.set(path, file);
    }
    const fileAt = path => {
      const file = fileMap.get(path.normalize('NFC'));
      if (!file) throw new DOMException('Missing ' + path, 'NotFoundError');
      return file;
    };
    const listFiles = async dir => [...fileMap.keys()].filter(k => k.startsWith(dir + '/') && !k.slice(dir.length + 1).includes('/')).map(k => k.slice(dir.length + 1));
    const result = await readFolderContents(async path => fileAt(path).text(), async path => fileAt(path), listFiles);
    acceptLoadedFolder(result, name, null);
    if (!result.problems.length) ui.toast(t('toast.readonly_loaded'));
  }

  // --- Saving -------------------------------------------------------------------------------------
  const idOf = path => path.slice('pages/'.length, -'.json'.length);
  // "Save to folder…": choose a (new) destination and write the whole wiki there.
  async function saveToFolder() {
    if (typeof window.showDirectoryPicker !== 'function') { ui.explainFolderAccess({purpose: 'save'}); return; }
    try {
      const handle = await window.showDirectoryPicker({mode:'readwrite', id:'localwiki'});
      let existing = null;
      try { existing = JSON.parse(await readText(handle, 'wiki.json')); }
      catch (err) { if (err.name !== 'NotFoundError') throw err; }
      if (existing) {
        const sameIndex = existing.type === 'localwiki-index' &&
          JSON.stringify(existing.pages) === JSON.stringify(indexObject().pages) && existing.name === state.wiki.name;
        if (!sameIndex && !confirm(t('confirm.overwrite_index', {folder: handle.name}))) return;
      }
      // Saved revisions come along to the new folder.
      const previous = state.folderHandle;
      if (previous) {
        try { await revisions.copyFolder(previous, handle); }
        catch (err) { console.error(err); ui.toast(t('toast.history_copy_failed', {error: err.message})); }
      }
      // Added interface languages come along too.
      try { await LW.languages.writeAllToFolder(handle); }
      catch (err) { console.error(err); ui.toast(t('lang.folder_failed', {error: err.message})); }
      revisions.reset([]); // nothing of this wiki is in the new folder yet
      // When changing destination, copy all pages, not just previously edited pages.
      state.folderHandle = handle; state.folderName = handle.name; state.draftRecovered = false;
      state.changedIds = new Set(state.wiki.pages.map(p => p.id));
      state.diskPaths = new Set(); state.indexDirty = true; // never delete files we did not write here
      state.copySetAside = state.setAside.length > 0;
      state.logoDirty = !!state.logo;
      LW.images.markAllPending();
      markDirty();
      await saveChanges();
    } catch (err) {
      if (isCancellation(err)) return;
      console.error(err); ui.toast(t('toast.save_folder_failed', {error: i18n.describeError(err)}));
    }
  }
  // Writes pending changes to the linked folder. auto: called by autosave (quiet unless it fails).
  async function saveChanges({auto = false} = {}) {
    if (state.saving) return;
    LW.pages.commitTitle();
    clearTimeout(autosaveTimer);
    if (!state.folderHandle) {
      if (auto) return;
      await saveToFolder(); return; // explains the problem if this browser cannot save to folders
    }
    const {wiki, setAside} = state;
    const keep = new Set([...wiki.pages, ...setAside].map(p => pathFor(p.id)));
    const stale = [...state.diskPaths].filter(path => !keep.has(path));
    if (!state.dirty && !state.indexDirty && !state.changedIds.size && !stale.length && !state.copySetAside && !state.logoDirty && !LW.images.pending().length) { if (!auto) ui.toast(t('toast.no_changes')); return; }
    state.saving = true; ui.setSaveStatus();
    // Snapshot everything up front so edits made during the async writes cannot mix states.
    const version = state.changeVersion;
    const pending = wiki.pages.filter(p => state.changedIds.has(p.id)).map(p => [pathFor(p.id), jsonText(p)]);
    const copying = state.copySetAside ? setAside.filter(entry => entry.text !== null) : [];
    const indexText = state.indexDirty ? jsonText(indexObject(state.copySetAside)) : null;
    const logoChange = state.logoDirty ? {logo: state.logo} : null;
    const newImages = LW.images.pending();
    try {
      // Keep versions that are about to be overwritten or deleted. A problem here must not stop
      // the save itself.
      try { await revisions.beforeSave(pending.map(([path, text]) => [idOf(path), text]), stale.map(idOf)); }
      catch (err) { console.error(err); ui.toast(t('toast.history_update_failed', {error: err.message})); }
      const pagesDir = await state.folderHandle.getDirectoryHandle('pages', {create:true});
      for (const [path, text] of pending) {
        await writeText(pagesDir, path.split('/')[1], text);
        state.diskPaths.add(path);
        revisions.afterWrite(idOf(path), text);
      }
      // Set-aside files are copied byte for byte, and are not added to diskPaths (never deleted).
      for (const entry of copying) await writeText(pagesDir, entry.file.split('/')[1], entry.text);
      // Pictures go before the pages that show them.
      if (newImages.length) {
        const imagesDir = await subfolder(state.folderHandle, LW.images.DIR, true);
        for (const [path, blob] of newImages) { await writeText(imagesDir, path.split('/')[1], blob); LW.images.markSaved([path]); }
      }
      // The logo picture goes before the manifest that refers to it.
      if (logoChange) {
        const [dirName, fileName] = LOGO_PATH.split('/');
        if (logoChange.logo) await writeText(await subfolder(state.folderHandle, dirName, true), fileName, dataUrlToBytes(logoChange.logo));
        else { const dir = await subfolder(state.folderHandle, dirName); if (dir) await remove(dir, fileName); }
      }
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
        state.changedIds.clear(); state.indexDirty = false; state.dirty = false; state.dirtySince = 0; state.logoDirty = false;
        saveDraft();
        if (!auto) ui.toast(t(indexText ? 'toast.saved_index' : 'toast.saved', {count: pending.length, folder: state.folderName}));
      }
      // Otherwise edits arrived during the save; they are still marked and autosave picks them up.
    } catch (err) {
      console.error(err);
      ui.toast(t(auto ? 'toast.autosave_failed' : 'toast.save_failed', {error: i18n.describeError(err)}));
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
    if (state.logo && state.wiki.appearance.icon === 'image') files.push([LOGO_PATH, dataUrlToBytes(state.logo)]);
    files.push(...LW.languages.exportFiles());
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
      downloadBlob(LW.zip.makeZip([...filesForExport(), ...await LW.images.allFiles(), ...await revisions.allFiles()]), name);
      ui.toast(t('toast.exported', {name}));
    } catch (err) { console.error(err); ui.toast(t('toast.export_failed', {error: i18n.describeError(err)})); }
  }
  function newWiki() {
    if (state.dirty && !confirm(t('confirm.new_wiki'))) return;
    const name = prompt(t('prompt.new_wiki'), t('default.wiki_name'));
    if (name === null) return;
    state.wiki = LW.model.normalizeWiki({name: name.trim() || t('default.wiki_name'), pages: []});
    state.logo = null; state.logoDirty = false; LW.images.reset();
    state.currentId = null; state.folderHandle = null; state.folderName = null; state.draftRecovered = false; state.dirty = false;
    state.diskPaths.clear(); state.changedIds.clear(); state.renameFrom = null; state.indexDirty = true; state.changeVersion++;
    state.pendingRenames = []; revisions.reset([]);
    state.setAside = []; state.loadProblems = []; state.copySetAside = false; ui.renderProblems();
    LW.history.clear(); clearTimeout(autosaveTimer); state.lastSavedAt = null; state.dirtySince = 0;
    ui.clearSearch();
    ui.renderAll(); saveDraft(); ui.toast(t('toast.new_wiki'));
  }

  LW.storage = {readFolderContents, indexObject, filesForExport, openFolder, openFolderFiles, saveToFolder, saveChanges, scheduleAutosave, autosave, exportZip, newWiki, downloadBlob};
})();
