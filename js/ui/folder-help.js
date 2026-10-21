/* LocalWiki — ui/folder-help.js
   The "Folder saving is turned off" dialog. Saving needs the browser's File System Access API.
   Chrome and Edge have it; Brave ships with it turned off (it can be turned on in brave://flags);
   some browsers do not have it at all. The dialog explains what to do in the browser at hand and
   offers the alternatives: open the folder read-only, or keep changes with Export wiki ZIP.

   Depends on: i18n.js, state.js, storage.js, ui/elements.js
   Provides:   LocalWiki.ui.explainFolderAccess, chooseFolderReadOnly, installFolderHelp */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const {t} = LW.i18n;
  const BRAVE_FLAG = 'brave://flags/#file-system-access-api';

  const isBrave = () => typeof navigator.brave?.isBrave === 'function';

  // Read-only fallback: the hidden folder input (app.js passes the chosen files to storage).
  function chooseFolderReadOnly() { els.folderInput.click(); }

  // purpose: 'open' (offers read-only opening) or 'save' (offers ZIP export).
  // blocked: folder access exists but the browser refused it (rather than being turned off).
  function explainFolderAccess({purpose = 'save', blocked = false} = {}) {
    const brave = isBrave() && !blocked;
    els.folderHelpTitle.textContent = t(blocked ? 'fh.title_blocked' : 'fh.title_off');
    els.folderHelpBrave.hidden = !brave;
    els.folderHelpOther.hidden = brave;
    els.folderHelpOther.textContent = t(blocked ? 'fh.other_blocked' : 'fh.other_missing');
    els.folderHelpReadOnly.hidden = purpose !== 'open';
    els.folderHelpExport.hidden = purpose !== 'save' || !LW.state.wiki.pages.length;
    els.folderHelpDialog.showModal();
  }

  async function copyFlag() {
    try { await navigator.clipboard.writeText(BRAVE_FLAG); ui.toast(t('fh.copied')); }
    catch (_) { ui.toast(t('fh.copy_manual', {address: BRAVE_FLAG})); }
  }

  function installFolderHelp() {
    els.folderHelpFlag.textContent = BRAVE_FLAG;
    els.folderHelpCopy.addEventListener('click', copyFlag);
    els.folderHelpReadOnly.addEventListener('click', () => { els.folderHelpDialog.close(); chooseFolderReadOnly(); });
    els.folderHelpExport.addEventListener('click', () => { els.folderHelpDialog.close(); LW.storage.exportZip(); });
    els.folderHelpClose.addEventListener('click', () => els.folderHelpDialog.close());
    els.folderHelpCloseX.addEventListener('click', () => els.folderHelpDialog.close());
  }

  Object.assign(ui, {explainFolderAccess, chooseFolderReadOnly, installFolderHelp});
})();
