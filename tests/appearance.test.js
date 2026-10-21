'use strict';
/* Wiki settings: app name, icon (bundled, emoji or picture) and palette are stored in the wiki
   folder (wiki.json "appearance", branding/logo.png), survive reopening and exporting, and can be
   undone like any other change. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {MemoryDirectory} = require('./memory-folder');

const LW = load('icon-library', 'palettes', 'text', 'model', 'markdown', 'zip', 'search', 'folder', 'state', 'languages', 'revisions', 'history', 'pages', 'storage');
const {state, history, pages, storage, model} = LW;
globalThis.window = globalThis;

// A real 1 × 1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const json = value => JSON.stringify(value, null, 2) + '\n';
function folder(appearance) {
  const root = new MemoryDirectory('wiki'), pagesDir = new MemoryDirectory('pages');
  root.dirs.set('pages', pagesDir);
  pagesDir.files.set('home.json', json({id: 'home', title: 'Home', parentId: null, tags: [], content: 'Hi', icon: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'}));
  root.files.set('wiki.json', json({schemaVersion: 1, type: 'localwiki-index', name: 'Test', ...(appearance ? {appearance} : {}), pages: [{id: 'home', file: 'pages/home.json'}]}));
  return root;
}
async function open(root) { window.showDirectoryPicker = async () => root; state.dirty = false; await storage.openFolder(); }
const index = root => JSON.parse(root.files.get('wiki.json'));

test('appearance values are validated, with defaults for anything missing or invalid', () => {
  assert.deepEqual(model.normalizeAppearance(undefined), {appName: 'LocalWiki', icon: '', palette: 'evergreen'});
  assert.deepEqual(model.normalizeAppearance({appName: '  Ops Wiki ', icon: 'icon:server', palette: 'ocean'}), {appName: 'Ops Wiki', icon: 'icon:server', palette: 'ocean'});
  assert.equal(model.normalizeAppearance({icon: '🛰️'}).icon, '🛰️');
  assert.equal(model.normalizeAppearance({icon: 'icon:../../x'}).icon, '');
  assert.equal(model.normalizeAppearance({icon: 'a very long text that is not an icon'}).icon, '');
  assert.equal(model.normalizeAppearance({palette: '<script>'}).palette, 'evergreen');
  assert.equal(model.normalizeAppearance({appName: 'x'.repeat(100)}).appName.length, 40);
});

test('settings are saved in wiki.json, and a picture as branding/logo.png', async () => {
  const root = folder();
  await open(root);
  assert.deepEqual(state.wiki.appearance, model.defaultAppearance(), 'a wiki without settings gets the defaults');
  pages.updateSettings({name: 'Ops', appearance: {appName: 'Acme Docs', icon: 'image', palette: 'ocean'}, logo: PNG});
  await storage.saveChanges();
  assert.deepEqual(index(root).appearance, {appName: 'Acme Docs', icon: 'image', palette: 'ocean'});
  assert.equal(index(root).name, 'Ops');
  const logo = root.dirs.get('branding').files.get('logo.png');
  assert.ok(logo instanceof Uint8Array && logo[1] === 0x50 && logo[2] === 0x4e && logo[3] === 0x47, 'a real PNG file');

  await open(root); // reopening brings everything back
  assert.equal(state.wiki.appearance.appName, 'Acme Docs');
  assert.equal(state.logo, PNG);

  pages.updateSettings({name: 'Ops', appearance: {appName: 'Acme Docs', icon: 'icon:server', palette: 'ocean'}, logo: null});
  await storage.saveChanges();
  assert.equal(root.dirs.get('branding').files.has('logo.png'), false, 'the picture is removed when no longer used');
  assert.equal(index(root).appearance.icon, 'icon:server');
});

test('changing settings can be undone', async () => {
  const root = folder({appName: 'Before', icon: '', palette: 'evergreen'});
  await open(root);
  pages.updateSettings({name: 'Test', appearance: {appName: 'After', icon: '🛰️', palette: 'plum'}, logo: null});
  assert.equal(history.peek().undo.key, 'act.settings');
  history.undo();
  assert.deepEqual(state.wiki.appearance, {appName: 'Before', icon: '', palette: 'evergreen'});
  await storage.saveChanges();
  assert.equal(index(root).appearance.appName, 'Before');
});

test('a missing logo picture falls back to the default icon and is reported', async () => {
  const root = folder({appName: 'X', icon: 'image', palette: 'slate'});
  await open(root);
  assert.equal(state.wiki.appearance.icon, '');
  assert.ok(state.loadProblems.some(p => p.file === 'branding/logo.png'));
});

test('the ZIP export and Save to folder… include the logo', async () => {
  const root = folder();
  await open(root);
  pages.updateSettings({name: 'Test', appearance: {appName: 'A', icon: 'image', palette: 'rose'}, logo: PNG});
  const files = storage.filesForExport();
  const logo = files.find(([path]) => path === 'branding/logo.png');
  assert.ok(logo && logo[1] instanceof Uint8Array);
  assert.deepEqual(JSON.parse(files[0][1]).appearance, {appName: 'A', icon: 'image', palette: 'rose'});
  const copy = new MemoryDirectory('copy');
  window.showDirectoryPicker = async () => copy;
  await storage.saveToFolder();
  assert.ok(copy.dirs.get('branding').files.get('logo.png') instanceof Uint8Array);
});
