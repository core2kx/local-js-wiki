/* LocalWiki — ui/status.js
   Small status displays: the toast message, the save status in the top bar, and the
   Undo/Redo button states.

   Depends on: state.js, history.js, ui/elements.js
   Provides:   LocalWiki.ui.toast, setSaveStatus, renderUndoButtons */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  let toastTimeout;

  // A brief message in the bottom corner.
  function toast(message) {
    clearTimeout(toastTimeout);
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    toastTimeout = setTimeout(() => els.toast.classList.remove('visible'), 4000);
  }
  function setSaveStatus() {
    const {saving, dirty, folderHandle, folderName, lastSavedAt} = state;
    const time = lastSavedAt ? new Intl.DateTimeFormat(undefined, {timeStyle: 'short'}).format(lastSavedAt) : '';
    els.status.textContent = saving ? '◌ Saving…' : dirty ? '● Unsaved changes' :
      folderHandle ? (time ? '✓ Saved at ' + time : '✓ Saved to folder') : '◌ No linked folder';
    els.status.classList.toggle('is-dirty', dirty && !saving);
    els.fileLabel.textContent = folderName + (folderHandle ? ' · Linked folder · Autosave on' : ' · Not linked');
  }
  function renderUndoButtons() {
    const next = LW.history.peek();
    els.undo.disabled = !next.undo; els.undo.title = next.undo ? 'Undo ' + next.undo : 'Nothing to undo';
    els.redo.disabled = !next.redo; els.redo.title = next.redo ? 'Redo ' + next.redo : 'Nothing to redo';
  }

  Object.assign(ui, {toast, setSaveStatus, renderUndoButtons});
})();
