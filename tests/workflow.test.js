'use strict';
/* End-to-end behavior without a browser: open a folder, rename and delete pages, undo, save, and
   check exactly which files were written and deleted. The folder is an in-memory stand-in for the
   browser's File System Access API; drawing is stubbed out (see load.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');

const {MemoryDirectory} = require('./memory-folder');

const json = value => JSON.stringify(value, null, 2) + '\n';
const pageFile = (id, title, extra = {}) => json({id, title, parentId: null, tags: [], content: '', icon: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra});
function exampleFolder(extraPages = {}, extraEntries = []) {
  const root = new MemoryDirectory('wiki');
  const pagesDir = new MemoryDirectory('pages');
  root.dirs.set('pages', pagesDir);
  const files = {
    'welcome.json': pageFile('welcome', 'Welcome', {content: 'See [[Editing guide]], [[editing-guide|the guide]] and `[[Editing guide]]`.'}),
    'editing-guide.json': pageFile('editing-guide', 'Editing guide'),
    'tables.json': pageFile('tables', 'Tables', {parentId: 'editing-guide'}),
    ...extraPages
  };
  for (const [name, text] of Object.entries(files)) pagesDir.files.set(name, text);
  const entries = [...Object.keys(files).map(name => name.replace(/\.json$/, '')).map(id => ({id, file: `pages/${id}.json`})), ...extraEntries];
  root.files.set('wiki.json', json({schemaVersion: 1, type: 'localwiki-index', name: 'Test', pages: entries}));
  return {root, pagesDir};
}

const LW = load('icon-library', 'text', 'model', 'markdown', 'zip', 'search', 'folder', 'state', 'revisions', 'history', 'pages', 'storage');
const {state, store, history, pages, storage} = LW;
globalThis.window = globalThis;

async function open(root) {
  window.showDirectoryPicker = async () => root;
  state.dirty = false;
  await storage.openFolder();
}
function retitle(value) { pages.editTitle(value); pages.commitTitle(); }
const read = (dir, name) => JSON.parse(dir.files.get(name));

test('rename rewrites links, moves the file, and undo moves everything back', async () => {
  const {root, pagesDir} = exampleFolder();
  await open(root);
  pages.selectPage('editing-guide');
  retitle('Guide');
  await storage.saveChanges();
  assert.deepEqual([...pagesDir.files.keys()].sort(), ['guide.json', 'tables.json', 'welcome.json']);
  assert.equal(read(pagesDir, 'welcome.json').content, 'See [[Guide]], [[guide|the guide]] and `[[Editing guide]]`.');
  assert.equal(read(pagesDir, 'tables.json').parentId, 'guide');
  assert.deepEqual(JSON.parse(root.files.get('wiki.json')).pages.map(e => e.id), ['guide', 'tables', 'welcome']);

  history.undo();
  await storage.saveChanges();
  assert.deepEqual([...pagesDir.files.keys()].sort(), ['editing-guide.json', 'tables.json', 'welcome.json']);
  assert.equal(read(pagesDir, 'welcome.json').content, 'See [[Editing guide]], [[editing-guide|the guide]] and `[[Editing guide]]`.');
  assert.equal(read(pagesDir, 'tables.json').parentId, 'editing-guide');
});

test('duplicate or empty titles are refused without leaving an undo step', async () => {
  const {root} = exampleFolder();
  await open(root);
  pages.selectPage('editing-guide');
  retitle('WELCOME');
  assert.equal(store.currentPage().title, 'Editing guide');
  retitle('   ');
  assert.equal(store.currentPage().title, 'Editing guide');
  assert.equal(history.peek().undo, null);
});

test('delete removes the page and its children; undo writes them back', async () => {
  const {root, pagesDir} = exampleFolder();
  await open(root);
  pages.selectPage('editing-guide');
  pages.deletePage();
  await storage.saveChanges();
  assert.deepEqual([...pagesDir.files.keys()], ['welcome.json']);
  assert.match(history.peek().undo, /deleting "Editing guide" and 1 child/);
  history.undo();
  await storage.saveChanges();
  assert.deepEqual([...pagesDir.files.keys()].sort(), ['editing-guide.json', 'tables.json', 'welcome.json']);
});

test('saving writes only what changed', async () => {
  const {root, pagesDir} = exampleFolder();
  await open(root);
  pages.selectPage('welcome');
  pagesDir.log = []; root.log = [];
  pages.editContent('New text');
  await storage.saveChanges();
  assert.deepEqual(pagesDir.log, ['write welcome.json']);
  assert.deepEqual(root.log, []); // wiki.json unchanged
});

test('damaged page files are set aside, repaired or skipped, and never overwritten', async () => {
  const broken = '{ "id": "broken", "title": "Broken", }';
  const {root, pagesDir} = exampleFolder(
    {'broken.json': broken, 'mismatch.json': json({id: 'other', title: 'Mismatch'}), 'array.json': '[1]'},
    [{id: 'missing', file: 'pages/missing.json'}, {id: 'evil', file: '../../etc/passwd'}]
  );
  await open(root);
  const kinds = state.loadProblems.map(p => p.kind).sort();
  assert.deepEqual(kinds, ['ignored', 'missing', 'repaired', 'set-aside', 'set-aside']);
  assert.deepEqual(state.wiki.pages.map(p => p.id).sort(), ['editing-guide', 'mismatch', 'tables', 'welcome']);

  // A new page titled like a set-aside file must not take its filename.
  pages.createPage(null, 'Broken');
  assert.equal(store.currentPage().id, 'broken-2');

  await storage.saveChanges();
  assert.equal(pagesDir.files.get('broken.json'), broken);
  assert.equal(pagesDir.files.get('array.json'), '[1]');
  assert.equal(read(pagesDir, 'mismatch.json').id, 'mismatch');
  const index = JSON.parse(root.files.get('wiki.json')).pages.map(e => e.id);
  assert.ok(index.includes('broken') && index.includes('array') && !index.includes('missing') && !index.includes('evil'));
});

test('an unusable wiki.json stops opening with a clear message', async () => {
  const root = new MemoryDirectory('empty');
  await assert.rejects(storage.readFolderContents(async name => (await (await root.getFileHandle(name)).getFile()).text()), /no wiki.json/);
  root.files.set('wiki.json', '{bad');
  await assert.rejects(storage.readFolderContents(async name => (await (await root.getFileHandle(name)).getFile()).text()), /not valid JSON/);
});
