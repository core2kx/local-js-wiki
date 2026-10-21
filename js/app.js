/* LocalWiki — app.js
   Starts the app: connects state changes to the save status and autosave, wires the page's
   controls to the operations in pages.js and storage.js, restores the browser draft and view
   preferences, and draws the first screen. Loaded last (see index.html for the order).

   Depends on: every other file.
   Provides:   nothing; runs once. */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const {els, state, store, history, pages, storage, ui} = LW;

  function installEvents() {
    // Top bar
    els.open.addEventListener('click', storage.openFolder);
    els.save.addEventListener('click', () => storage.saveChanges());
    // A title edit in progress is committed first, so it becomes its own undo step.
    els.undo.addEventListener('click', () => { pages.commitTitle(); history.undo(); });
    els.redo.addEventListener('click', () => { pages.commitTitle(); history.redo(); });
    els.theme.addEventListener('click', ui.toggleTheme);

    // Sidebar
    els.search.addEventListener('input', ui.renderTree);
    els.newPage.addEventListener('click', () => pages.createPage());
    els.newWiki.addEventListener('click', storage.newWiki);
    els.saveAs.addEventListener('click', storage.saveToFolder);
    els.exportZip.addEventListener('click', storage.exportZip);
    els.rename.addEventListener('click', pages.renameWiki);

    // Page header and fields
    els.emptyCreate.addEventListener('click', () => pages.createPage());
    els.newChild.addEventListener('click', () => pages.createPage(state.currentId));
    els.del.addEventListener('click', pages.deletePage);
    els.pageWidth.addEventListener('change', () => { ui.applyPageWidth(els.pageWidth.value); ui.savePreferences(); });
    els.title.addEventListener('input', () => pages.editTitle(els.title.value));
    els.title.addEventListener('change', pages.commitTitle);
    els.title.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); pages.commitTitle(); } });
    els.tags.addEventListener('input', () => pages.editTags(els.tags.value));
    els.parent.addEventListener('change', () => pages.movePage(els.parent.value || null));

    // Editor and preview
    els.content.addEventListener('input', () => pages.editContent(els.content.value));
    els.content.addEventListener('focus', () => ui.setSurface('markdown'));
    els.visual.addEventListener('focus', () => ui.setSurface('visual'));
    for (const btn of document.querySelectorAll('[data-mode]')) btn.addEventListener('click', () => ui.setMode(btn.dataset.mode));
    // Toolbar buttons must not take the focus, or the editor would lose its selection.
    for (const btn of els.toolbar.querySelectorAll('button')) btn.addEventListener('mousedown', event => event.preventDefault());
    for (const btn of document.querySelectorAll('[data-format]')) btn.addEventListener('click', () => ui.formatSelection(btn.dataset.format));
    ui.installVisualEditor();

    // Dialogs wire their own buttons.
    ui.installTableBuilder();
    ui.installPicker();
    ui.installProblems();
    ui.installRevisions();
    ui.installFolderHelp();

    // Read-only folder fallback: chosen from the folder-access dialog (ui/folder-help.js).
    els.folderInput.addEventListener('change', async () => {
      if (els.folderInput.files?.length) {
        try { await storage.openFolderFiles([...els.folderInput.files]); }
        catch (err) { console.error(err); ui.toast('Could not import folder: ' + err.message); }
      }
      els.folderInput.value = '';
    });

    // Save right away when the user switches tabs or minimizes; the page may be closed next.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') storage.autosave(); });
    window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  function init() {
    // Every change updates the save status and (re)schedules autosave.
    store.onChange(() => { ui.setSaveStatus(); storage.scheduleAutosave(); });
    const recoveredUnsaved = store.restoreDraft();
    const mode = ui.loadPreferences();
    installEvents();
    ui.setMode(mode);
    pages.commitTitle(); // a title edit interrupted by a reload
    ui.renderAll(); ui.renderUndoButtons(); store.saveDraft();
    if (recoveredUnsaved) ui.toast('Recovered unsaved changes from this browser. Save changes to write them to a folder.');
  }

  init();
})();
