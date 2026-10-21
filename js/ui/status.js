/* LocalWiki — ui/status.js
   Small status displays: the toast message, the save status in the top bar, and the
   Undo/Redo button states.

   Depends on: i18n.js, state.js, history.js, ui/elements.js
   Provides:   LocalWiki.ui.toast, setSaveStatus, renderUndoButtons */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {t, locale} = LW.i18n;
  let toastTimeout;

  // A brief message in the bottom corner.
  function toast(message) {
    clearTimeout(toastTimeout);
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    toastTimeout = setTimeout(() => els.toast.classList.remove('visible'), 4000);
  }
  function setSaveStatus() {
    const {saving, dirty, folderHandle, folderName, draftRecovered, lastSavedAt} = state;
    const time = lastSavedAt ? new Intl.DateTimeFormat(locale(), {timeStyle: 'short'}).format(lastSavedAt) : '';
    els.status.textContent = saving ? '◌ ' + t('status.saving') : dirty ? '● ' + t('status.unsaved') :
      folderHandle ? '✓ ' + (time ? t('status.saved_at', {time}) : t('status.saved_folder')) : '◌ ' + t('status.no_folder');
    els.status.classList.toggle('is-dirty', dirty && !saving);
    const folder = folderName || t(draftRecovered ? 'file.recovered' : 'file.no_folder');
    els.fileLabel.textContent = t(folderHandle ? 'file.linked' : 'file.not_linked', {folder});
  }
  function renderUndoButtons() {
    const next = LW.history.peek();
    els.undo.disabled = !next.undo; els.undo.title = next.undo ? t('top.undo_with', {action: next.undo}) : t('top.undo_none');
    els.redo.disabled = !next.redo; els.redo.title = next.redo ? t('top.redo_with', {action: next.redo}) : t('top.redo_none');
  }

  Object.assign(ui, {toast, setSaveStatus, renderUndoButtons});
})();
