/* LocalWiki — ui/language.js
   Applying the interface language to the page, and the language dialog (the 🌐 button).

   Static text in index.html carries data-i18n attributes naming a key from languages/en.json:
     data-i18n="key"                 the element's text
     data-i18n-title / -aria / -placeholder / -dataph="key"   the title, aria-label, placeholder
                                     or data-placeholder attribute
   applyLanguage() fills them all in, sets <html lang>, and redraws everything the code draws itself.
   **bold** in a text is shown as bold; nothing else in a text is markup.

   The dialog lists the available languages (by their own names), switches between them, and adds a
   language from a JSON file (kept in this browser and in the linked wiki folder), removes added ones,
   and downloads a translation template or the current language to edit.

   Depends on: i18n.js, languages.js, icon-library.js, ui/elements.js, ui/page.js, ui/status.js
   Provides:   LocalWiki.ui.applyLanguage, applyTranslations, installLanguage */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const i18n = LW.i18n;
  const {t} = i18n;

  // --- Filling the page in ------------------------------------------------------------------------
  function setRich(element, text) {
    if (!text.includes('**')) { element.textContent = text; return; }
    element.replaceChildren(...text.split(/\*\*(.+?)\*\*/).map((part, index) => {
      if (index % 2 === 0) return document.createTextNode(part);
      const bold = document.createElement('strong'); bold.textContent = part; return bold;
    }));
  }
  const ATTRIBUTES = [['data-i18n-title', 'title'], ['data-i18n-aria', 'aria-label'],
    ['data-i18n-placeholder', 'placeholder'], ['data-i18n-dataph', 'data-placeholder']];
  function applyTranslations(root = document) {
    for (const element of root.querySelectorAll('[data-i18n]')) setRich(element, t(element.dataset.i18n));
    for (const [source, target] of ATTRIBUTES) {
      for (const element of root.querySelectorAll(`[${source}]`)) element.setAttribute(target, t(element.getAttribute(source)));
    }
  }
  // Translates the page and redraws what the code draws itself (names, status, lists).
  function applyLanguage() {
    applyTranslations(document);
    document.documentElement.lang = i18n.language();
    ui.renderAll();
    ui.renderUndoButtons();
    ui.renderProblems();
    if (els.languageDialog.open) renderDialog();
  }

  // --- The dialog ---------------------------------------------------------------------------------
  function say(text, kind = '') {
    const line = document.createElement('p');
    line.className = 'language-result-line' + (kind ? ' is-' + kind : ''); line.textContent = text;
    els.languageResult.append(line);
    els.languageResult.hidden = false;
  }
  function clearResult() { els.languageResult.replaceChildren(); els.languageResult.hidden = true; }

  function renderDialog() {
    els.languageList.replaceChildren(...i18n.list().map(language => {
      const li = document.createElement('li');
      const label = document.createElement('label'); label.className = 'language-row';
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'interface-language'; radio.value = language.code; radio.checked = language.code === i18n.language();
      radio.addEventListener('change', () => choose(language.code));
      const name = document.createElement('span'); name.className = 'language-name'; name.textContent = language.name; name.lang = language.code;
      const code = document.createElement('span'); code.className = 'language-code'; code.textContent = language.code;
      label.append(radio, name, code);
      if (language.custom) {
        const badge = document.createElement('span'); badge.className = 'language-badge'; badge.textContent = t('lang.custom');
        label.append(badge);
      }
      li.append(label);
      if (language.custom) {
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'btn btn-sm btn-ghost'; remove.textContent = t('lang.remove'); remove.title = t('lang.remove_tip');
        remove.addEventListener('click', () => removeLanguage(language.code));
        li.append(remove);
      }
      return li;
    }));
  }
  function choose(code) {
    LW.pages.commitTitle();
    LW.languages.choose(code);
    clearResult();
    applyLanguage();
  }
  async function removeLanguage(code) {
    const name = await LW.languages.remove(code);
    clearResult();
    applyLanguage();
    say(t('lang.removed', {name}));
  }

  async function addFromFile(file) {
    clearResult();
    let text;
    try { text = await file.text(); }
    catch (err) { say(t('lang.read_failed', {error: err.message}), 'error'); return; }
    const result = await LW.languages.addFromText(text);
    if (!result.file) { for (const problem of result.errors) say(t(problem.key, problem.params), 'error'); return; }
    applyLanguage(); // the language in use may just have been replaced
    say(t('lang.added', {name: result.file.language.name, translated: result.translated, total: result.total, missing: result.missing.length}), 'ok');
    say(result.savedInFolder ? t('lang.saved_folder') : result.folderError ? t('lang.folder_failed', {error: result.folderError}) : t('lang.not_saved_folder'));
    for (const warning of result.warnings) say(t(warning.key, warning.params), 'warning');
  }
  function download(object, fileName) {
    LW.storage.downloadBlob(new Blob([LW.folder.jsonText(object)], {type: 'application/json'}), fileName);
  }

  function installLanguage() {
    els.languageButton.innerHTML = LW.icons.svg('globe');
    els.languageButton.addEventListener('click', () => { clearResult(); renderDialog(); els.languageDialog.showModal(); });
    els.languageAdd.addEventListener('click', () => els.languageFile.click());
    els.languageFile.addEventListener('change', async () => {
      const file = els.languageFile.files?.[0];
      if (file) await addFromFile(file);
      els.languageFile.value = '';
    });
    els.languageTemplate.addEventListener('click', () => download(i18n.template(), 'translation-template.json'));
    els.languageExport.addEventListener('click', () => download(i18n.exportFile(i18n.language()), i18n.language() + '.json'));
    els.languageClose.addEventListener('click', () => els.languageDialog.close());
    els.languageDone.addEventListener('click', () => els.languageDialog.close());
  }

  Object.assign(ui, {applyLanguage, applyTranslations, installLanguage});
})();
