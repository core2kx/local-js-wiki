/* LocalWiki — languages.js
   Which interface language is in use and which languages have been added. Built-in languages come
   with the app (js/lang/*.js); added ones are language files (see i18n.js) that a user imported.

   Where they live:
   - the choice of language and the added languages are kept in this browser (localStorage), because
     the first screen needs them before any wiki folder is open;
   - when a wiki folder is linked, each added language is also saved there as languages/<code>.json,
     so everyone who opens the folder gets it (opening a folder adds the languages found in it);
   - Save to folder… and the ZIP export carry them along.

   Depends on: i18n.js, folder.js, state.js
   Provides:   LocalWiki.languages */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const i18n = LW.i18n;
  const folder = LW.folder;
  const state = LW.state;
  const CHOICE_KEY = 'localwiki:language', ADDED_KEY = 'localwiki:languages';
  const DIR = 'languages';

  const store = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* storage may be unavailable */ } };
  const fetchStored = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };

  // --- Which language ------------------------------------------------------------------------------
  // Registers the languages saved in this browser, then picks the language to start in: the saved
  // choice, otherwise the browser's own language if there is a matching one, otherwise English.
  function init(preferred = (typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [])) {
    let saved = {};
    try { saved = JSON.parse(fetchStored(ADDED_KEY) || '{}') || {}; } catch (_) { /* ignore a damaged value */ }
    for (const file of Object.values(saved)) {
      const parsed = i18n.parseFile(file);
      if (parsed.file) i18n.register(parsed.file, {custom: true});
    }
    const choice = fetchStored(CHOICE_KEY);
    return i18n.setLanguage(choice && i18n.has(choice) ? choice : i18n.detect(preferred));
  }
  function choose(code) {
    const active = i18n.setLanguage(code);
    store(CHOICE_KEY, active);
    return active;
  }

  // --- Added languages -----------------------------------------------------------------------------
  function persistAdded() {
    const added = {};
    for (const {code, custom} of i18n.list()) if (custom) added[code] = i18n.fileOf(code);
    store(ADDED_KEY, JSON.stringify(added));
  }
  async function writeToFolder(handle, code) {
    const dir = await folder.subfolder(handle, DIR, true);
    await folder.writeText(dir, code + '.json', folder.jsonText(i18n.fileOf(code)));
  }
  // Adds a language from a file's text. Returns the check result (see i18n.parseFile) plus
  // {code, savedInFolder, folderError}. Nothing is added when the file has errors.
  async function addFromText(text) {
    const result = i18n.parseFile(text);
    if (!result.file) return result;
    const code = i18n.register(result.file, {custom: true});
    persistAdded();
    result.code = code;
    result.savedInFolder = false;
    if (state.folderHandle) {
      try { await writeToFolder(state.folderHandle, code); result.savedInFolder = true; }
      catch (err) { result.folderError = err.message; }
    }
    if (i18n.language() === code) i18n.setLanguage(code);
    return result;
  }
  async function remove(code) {
    const name = i18n.get(code)?.name || code;
    const wasInUse = i18n.language() === String(code).toLowerCase();
    i18n.unregister(code);
    persistAdded();
    if (state.folderHandle) {
      try { const dir = await folder.subfolder(state.folderHandle, DIR); if (dir) await folder.remove(dir, code + '.json'); }
      catch (err) { console.warn('Could not remove the language file from the wiki folder:', err); }
    }
    if (wasInUse && !i18n.has(code)) choose(i18n.BASE); // forget the removed choice
    return name;
  }

  // --- Wiki folders --------------------------------------------------------------------------------
  // Registers the language files found in a wiki folder, as [{name, text}].
  // Returns {changed: true if the language in use was replaced, problems: [{file, error}]}.
  function adopt(files) {
    const problems = [];
    let changed = false;
    for (const {name, text} of files) {
      const result = i18n.parseFile(text);
      if (!result.file) { problems.push({file: `${DIR}/${name}`, error: result.errors[0]}); continue; }
      const code = i18n.register(result.file, {custom: true});
      if (code === i18n.language()) changed = true;
    }
    if (files.length) persistAdded();
    return {changed, problems};
  }
  // Save to folder…: put every added language into the new folder.
  async function writeAllToFolder(handle) {
    for (const {code, custom} of i18n.list()) if (custom) await writeToFolder(handle, code);
  }
  // For the ZIP export: [[path, text]] of every added language.
  function exportFiles() {
    return i18n.list().filter(l => l.custom).map(({code}) => [`${DIR}/${code}.json`, folder.jsonText(i18n.fileOf(code))]);
  }

  LW.languages = {init, choose, addFromText, remove, adopt, writeAllToFolder, exportFiles, DIR};
})();
