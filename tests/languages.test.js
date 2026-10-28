'use strict';
/* Added interface languages: kept in the browser and in the wiki folder (languages/<code>.json),
   picked up when a folder is opened, removed again, and carried along by Save to folder and ZIP. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {MemoryDirectory} = require('./memory-folder');

const LW = load('icon-library', 'text', 'model', 'markdown', 'zip', 'search', 'folder', 'state', 'languages', 'images', 'revisions', 'history', 'pages', 'storage');
const {i18n, languages, state, storage} = LW;
globalThis.window = globalThis;

const file = (code, name, strings = {'common.cancel': 'Avbryt'}) => ({language: {code, name}, strings});
const json = value => JSON.stringify(value, null, 2) + '\n';
function wikiFolder(languageFiles = {}) {
  const root = new MemoryDirectory('wiki'), pagesDir = new MemoryDirectory('pages');
  root.dirs.set('pages', pagesDir);
  pagesDir.files.set('home.json', json({id: 'home', title: 'Home', parentId: null, tags: [], content: 'Hi', icon: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'}));
  root.files.set('wiki.json', json({schemaVersion: 1, type: 'localwiki-index', name: 'Test', pages: [{id: 'home', file: 'pages/home.json'}]}));
  if (Object.keys(languageFiles).length) {
    const dir = new MemoryDirectory('languages');
    for (const [name, text] of Object.entries(languageFiles)) dir.files.set(name, text);
    root.dirs.set('languages', dir);
  }
  return root;
}
async function open(root) { window.showDirectoryPicker = async () => root; state.dirty = false; await storage.openFolder(); }
function reset() {
  for (const {code, custom} of i18n.list()) if (custom) i18n.unregister(code);
  i18n.setLanguage('en');
  state.folderHandle = null;
  localStorage.removeItem('localwiki:languages'); localStorage.removeItem('localwiki:language');
}
const stored = () => JSON.parse(localStorage.getItem('localwiki:languages') || '{}');

test('adding a language keeps it in the browser, and in the wiki folder when one is linked', async () => {
  reset();
  const root = wikiFolder();
  await open(root);
  const result = await languages.addFromText(json(file('sv', 'Svenska')));
  assert.equal(result.code, 'sv');
  assert.equal(result.savedInFolder, true);
  assert.deepEqual(Object.keys(stored()), ['sv']);
  assert.deepEqual(JSON.parse(root.dirs.get('languages').files.get('sv.json')).language, {code: 'sv', name: 'Svenska', direction: 'ltr'});
  assert.equal(i18n.list().find(l => l.code === 'sv').custom, true);
  i18n.setLanguage('sv');
  assert.equal(i18n.t('common.cancel'), 'Avbryt');
});

test('without a linked folder the language stays in the browser only', async () => {
  reset();
  const result = await languages.addFromText(json(file('da', 'Dansk')));
  assert.equal(result.savedInFolder, false);
  assert.deepEqual(Object.keys(stored()), ['da']);
});

test('a bad file adds nothing and explains why', async () => {
  reset();
  const result = await languages.addFromText('{ nope');
  assert.equal(result.file, null);
  assert.equal(result.errors[0].key, 'lang.err_json');
  assert.deepEqual(stored(), {});
});

test('opening a folder makes its languages available, and replaces same-code ones from the browser', async () => {
  reset();
  await languages.addFromText(json(file('fi', 'Suomi (selain)', {'common.cancel': 'Selain'})));
  const root = wikiFolder({
    'fi.json': json(file('fi', 'Suomi', {'common.cancel': 'Peruuta'})),
    'pl.json': json(file('pl', 'Polski', {'common.cancel': 'Anuluj'})),
    'broken.json': '{ not json',
    'notes.txt': 'ignored: not a .json file'
  });
  await open(root);
  assert.equal(i18n.get('fi').name, 'Suomi', 'the folder copy wins');
  assert.ok(i18n.has('pl'));
  assert.deepEqual(Object.keys(stored()).sort(), ['fi', 'pl'], 'adopted languages are also kept in the browser');
  const problem = state.loadProblems.find(p => p.file === 'languages/broken.json');
  assert.equal(problem.key, 'prob.language_file');
  assert.equal(problem.kind, 'info');
  assert.equal(problem.params.error.key, 'lang.err_json');
});

test('a language in the folder that replaces the one in use takes effect', async () => {
  reset();
  await languages.addFromText(json(file('fr', 'Français', {'common.cancel': 'Annuler (ancien)'})));
  languages.choose('fr');
  await open(wikiFolder({'fr.json': json(file('fr', 'Français', {'common.cancel': 'Annuler'}))}));
  assert.equal(i18n.t('common.cancel'), 'Annuler');
});

test('removing a language removes it from the browser and the folder', async () => {
  reset();
  const root = wikiFolder();
  await open(root);
  await languages.addFromText(json(file('es', 'Español')));
  languages.choose('es');
  await languages.remove('es');
  assert.equal(i18n.has('es'), false);
  assert.equal(i18n.language(), 'en');
  assert.deepEqual(stored(), {});
  assert.equal(root.dirs.get('languages').files.has('es.json'), false);
  assert.equal(localStorage.getItem('localwiki:language'), 'en');
});

test('the choice of language is remembered and used at startup', () => {
  reset();
  i18n.register(file('de', 'Deutsch'));
  assert.equal(languages.init(['de-DE']), 'de', 'the browser language is used when there is no saved choice');
  languages.choose('en');
  assert.equal(languages.init(['de-DE']), 'en', 'a saved choice wins');
  localStorage.setItem('localwiki:language', 'gone');
  assert.equal(languages.init(['de']), 'de', 'a saved language that no longer exists is ignored');
  i18n.unregister('de');
});

test('added languages saved in the browser are registered at startup', () => {
  reset();
  localStorage.setItem('localwiki:languages', JSON.stringify({sv: file('sv', 'Svenska'), bad: {oops: true}}));
  languages.init(['sv']);
  assert.equal(i18n.has('sv'), true);
  assert.equal(i18n.language(), 'sv');
  assert.equal(i18n.has('bad'), false);
});

test('Save to folder… and the ZIP export carry added languages along', async () => {
  reset();
  await languages.addFromText(json(file('nb', 'Norsk bokmål')));
  const copy = new MemoryDirectory('copy');
  window.showDirectoryPicker = async () => copy;
  await storage.saveToFolder();
  assert.equal(JSON.parse(copy.dirs.get('languages').files.get('nb.json')).language.name, 'Norsk bokmål');
  const exported = storage.filesForExport().find(([path]) => path === 'languages/nb.json');
  assert.ok(exported, 'the ZIP lists the language file');
  assert.equal(JSON.parse(exported[1]).language.code, 'nb');
});

test('the read-only folder fallback also finds languages', async () => {
  reset();
  const files = [
    {name: 'wiki.json', webkitRelativePath: 'w/wiki.json', text: async () => json({schemaVersion: 1, type: 'localwiki-index', name: 'RO', pages: []})},
    {name: 'sv.json', webkitRelativePath: 'w/languages/sv.json', text: async () => json(file('sv', 'Svenska'))}
  ];
  await storage.openFolderFiles(files);
  assert.ok(i18n.has('sv'));
});
