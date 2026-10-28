/* LocalWiki — state.js
   The open wiki and its bookkeeping: which pages changed, whether there is unsaved work, and the
   crash-recovery draft kept in browser storage.

   Other modules read and write the fields of LocalWiki.state directly. Whenever data changes they
   call markDirty() (or touchPage() for one page), which saves the draft and notifies listeners
   registered with onChange() (app.js registers the save-status display and autosave).

   Depends on: model.js
   Provides:   LocalWiki.state (data), LocalWiki.store (functions) */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const {isoNow, pathFor, PAGE_PATH, normalizeWiki, defaultAppearance} = LW.model;
  const DRAFT_KEY = 'localwiki:draft';

  const state = {
    wiki: {name: 'My Wiki', appearance: defaultAppearance(), pages: []}, // {name, appearance, pages}; see model.js
    logo: null,                // the wiki's logo picture as a PNG data URL (appearance.icon "image"), or null
    images: new Map(),         // pictures of the open wiki: "images/<name>" -> {blob, url, saved} (see images.js)
    logoDirty: false,          // branding/logo.png must be written (or removed) on the next save
    currentId: null,           // id of the page being viewed
    folderHandle: null,        // the linked, writable folder, or null (not linked / read-only)
    folderName: null,          // name of the linked or last opened folder; null when there is none
    draftRecovered: false,     // the wiki was restored from the browser draft (so folderName may be null)
    dirty: false,              // there are changes not yet written to the folder
    dirtySince: 0,             // when the oldest unsaved change was made (for the autosave ceiling)
    changeVersion: 0,          // increases on every change; lets a save notice edits made while it ran
    changedIds: new Set(),     // pages whose files must be rewritten
    indexDirty: false,         // wiki.json must be rewritten (pages added, removed or renamed; wiki renamed)
    diskPaths: new Set(),      // page files known to exist in the linked folder; stale ones are deleted on save
    saving: false,
    lastSavedAt: null,         // Date of the last successful save
    renameFrom: null,          // {id, title} while the title field has an uncommitted edit (see pages.js)
    pendingRenames: [],        // [[fromId, toId]] not yet applied to revisions/ (see revisions.js)
    // Pages that could not be loaded: {id, file, text}. Their files are never written or deleted,
    // they stay listed in wiki.json, and text (the raw file, or null if unreadable) is copied verbatim
    // when the wiki is saved elsewhere or exported.
    setAside: [],
    copySetAside: false,       // true for a save to a new folder
    loadProblems: []           // [{file, message, kind}] from the last open
  };

  function pageById(id) { return state.wiki.pages.find(p => p.id === id); }
  function currentPage() { return pageById(state.currentId); }

  // --- Change tracking ----------------------------------------------------------------------------
  const listeners = [];
  function onChange(listener) { listeners.push(listener); }
  function markDirty() {
    if (!state.dirtySince) state.dirtySince = Date.now();
    state.dirty = true;
    state.changeVersion++;
    state.wiki.updatedAt = isoNow();
    saveDraft();
    for (const listener of listeners) listener();
  }
  // Call after changing a page: stamps it, marks its file for rewriting, and marks the wiki dirty.
  function touchPage(page) { page.updatedAt = isoNow(); pageText.delete(page); state.changedIds.add(page.id); markDirty(); }

  // Each page's JSON, cached until the page is touched. Undo history stores these strings, so
  // pages that did not change share one string across every history step.
  const pageText = new WeakMap();
  function serializePage(page) {
    let text = pageText.get(page);
    if (text === undefined) { text = JSON.stringify(page); pageText.set(page, text); }
    return text;
  }
  function rememberPageText(page, text) { pageText.set(page, text); }
  function forgetPageText(page) { pageText.delete(page); }

  // --- Crash-recovery draft -----------------------------------------------------------------------
  // A copy of the open wiki in browser storage. Not the master copy: folder access is not kept
  // across reloads, so a recovered draft must be saved to a folder again.
  function saveDraft() {
    const {wiki, currentId, folderName, dirty, renameFrom, setAside, pendingRenames, logo} = state;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({wiki, currentId, folderName, dirty, renameFrom, setAside, pendingRenames, logo})); }
    catch (err) { console.warn('Local draft recovery unavailable:', err); }
  }
  // Loads the draft into state, if there is one. Returns true when it held unsaved changes.
  function restoreDraft() {
    try {
      const recovered = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!recovered?.wiki) return false;
      const wiki = normalizeWiki(recovered.wiki);
      const has = id => wiki.pages.some(p => p.id === id);
      state.wiki = wiki;
      state.currentId = has(recovered.currentId) ? recovered.currentId : wiki.pages[0]?.id || null;
      if (recovered.renameFrom && has(recovered.renameFrom.id)) state.renameFrom = recovered.renameFrom;
      state.setAside = (Array.isArray(recovered.setAside) ? recovered.setAside : []).filter(entry =>
        typeof entry?.id === 'string' && entry.file === pathFor(entry.id) && PAGE_PATH.test(entry.file) &&
        (typeof entry.text === 'string' || entry.text === null) && !has(entry.id));
      state.pendingRenames = (Array.isArray(recovered.pendingRenames) ? recovered.pendingRenames : [])
        .filter(pair => Array.isArray(pair) && pair.length === 2 && pair.every(id => typeof id === 'string' && PAGE_PATH.test(pathFor(id))));
      state.logo = typeof recovered.logo === 'string' && recovered.logo.startsWith('data:image/png;base64,') ? recovered.logo : null;
      if (wiki.appearance.icon === 'image' && !state.logo) wiki.appearance.icon = '';
      state.folderName = recovered.folderName || null; state.draftRecovered = true;
      state.dirty = recovered.dirty === true;
      state.changedIds = new Set(state.dirty ? wiki.pages.map(p => p.id) : []);
      state.indexDirty = state.dirty;
      state.logoDirty = state.dirty && !!state.logo;
      return state.dirty && wiki.pages.length > 0;
    } catch (err) {
      console.warn('Draft recovery skipped:', err);
      return false;
    }
  }

  LW.state = state;
  LW.store = {pageById, currentPage, onChange, markDirty, touchPage, serializePage, rememberPageText, forgetPageText, saveDraft, restoreDraft};
})();
