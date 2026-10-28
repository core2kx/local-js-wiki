/* LocalWiki — ui/image-insert.js
   Putting pictures into a page: the toolbar's Image button (a file chooser), and pasting or dropping
   picture files into the Visual editor. A picture is checked, scaled down if it is large, stored with
   images.js, and then inserted as ![description](images/name.png) in whichever editor is in use.

   Depends on: i18n.js, model.js, state.js, images.js, ui/elements.js, ui/page.js, ui/editor.js, ui/visual-editor.js
   Provides:   LocalWiki.ui.pickImage, addImageFiles, installImageInsert */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {t} = LW.i18n;
  const MAX_SIDE = 1600, KEEP_BYTES = 2 * 1024 * 1024, MAX_UPLOAD = 25 * 1024 * 1024;

  // A picture ready to store: the file itself when it is small enough, otherwise a scaled-down copy
  // (JPEG stays JPEG; everything else becomes PNG). Throws a translatable error for unusable files.
  async function prepare(file) {
    if (!LW.images.TYPES[file.type]) throw LW.i18n.error('img.err_type');
    if (file.size > MAX_UPLOAD) throw LW.i18n.error('img.err_too_large');
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch (_) { throw LW.i18n.error('img.err_unreadable'); }
    try {
      const longest = Math.max(bitmap.width, bitmap.height);
      if (longest <= MAX_SIDE && file.size <= KEEP_BYTES) return file;
      const scale = Math.min(1, MAX_SIDE / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.85));
      if (!blob) throw LW.i18n.error('img.err_unreadable');
      return blob;
    } finally { bitmap.close?.(); }
  }
  // "my-holiday_photo.jpg" -> "my holiday photo": the first description, which can be changed later.
  const describe = name => String(name || '').replace(/\.[^.]*$/, '').replace(/[-_]+/g, ' ').replace(/[\[\]]/g, '').trim();

  // Stores each picture and inserts it. A choice of several files inserts them one after another.
  async function addImageFiles(files) {
    if (!LW.store.currentPage()) return;
    let added = 0;
    for (const file of files) {
      try {
        const blob = await prepare(file);
        const path = LW.images.add(blob, file.name);
        const alt = describe(file.name);
        if (ui.activeSurface() === 'visual') ui.visualInsertImage(path, alt);
        else ui.insertAtCaret('![' + alt + '](' + path + ')\n');
        added++;
      } catch (err) { ui.toast(LW.i18n.describeError(err)); }
    }
    if (added && !state.folderHandle) ui.toast(t('toast.image_no_folder'));
  }
  // The toolbar button: remember where the caret is, then ask for a file.
  function pickImage() {
    if (!LW.store.currentPage()) return;
    if (ui.activeSurface() === 'visual') ui.saveVisualSelection();
    els.imageFile.value = '';
    els.imageFile.click();
  }

  function installImageInsert() {
    els.imageFile.addEventListener('change', () => { const files = [...els.imageFile.files]; if (files.length) addImageFiles(files); });
  }
  Object.assign(ui, {pickImage, addImageFiles, installImageInsert});
})();
