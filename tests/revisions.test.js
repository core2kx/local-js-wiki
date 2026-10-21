'use strict';
/* Saved page revisions: the keep/thin/diff rules, and the whole lifecycle against an in-memory
   folder (edit, checkpoints, rename and undo, delete and restore, copying to a new folder). */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {MemoryDirectory} = require('./memory-folder');

const LW = load('icon-library', 'text', 'model', 'markdown', 'zip', 'search', 'folder', 'state', 'languages', 'revisions', 'history', 'pages', 'storage');
const {state, store, history, pages, storage, revisions} = LW;
globalThis.window = globalThis;

const MINUTE = 60e3, DAY = 864e5;
// Moves the clock used by revisions forward (page timestamps keep using the real clock).
const realNow = Date.now;
let offset = 0;
Date.now = () => realNow() + offset;

// --- Rules ----------------------------------------------------------------------------------------
const at = (iso, content = 'text') => ({updatedAt: iso, savedAt: iso, title: 'T', parentId: null, tags: [], icon: '', content});

test('a version is kept when it rested 10 minutes or the last revision was kept 10 minutes ago', () => {
  const now = Date.parse('2026-05-01T12:00:00Z');
  const last = [revisions.revisionOf(at('2026-05-01T11:00:00Z', 'old'))];
  assert.equal(revisions.worthKeeping(at('2026-05-01T11:59:00Z', 'new'), [], now), true, 'first change keeps the original');
  assert.equal(revisions.worthKeeping(at('2026-05-01T11:45:00Z', 'new'), last, now), true, 'rested 15 minutes');
  assert.equal(revisions.worthKeeping(at('2026-05-01T11:58:00Z', 'new'), last, now), true, 'last revision kept an hour ago');
  const recent = [revisions.revisionOf(at('2026-05-01T11:55:00Z', 'old'))];
  assert.equal(revisions.worthKeeping(at('2026-05-01T11:59:00Z', 'new'), recent, now), false, 'mid-burst');
  assert.equal(revisions.worthKeeping(at('2026-05-01T11:00:00Z', 'old'), last, now), false, 'same as the last revision');
});

test('thinning keeps the last week and one revision per older day, at most 100', () => {
  const now = Date.parse('2026-05-30T00:00:00Z'); // the 7-day cut-off falls at midnight
  const list = [];
  for (let d = 0; d < 20; d++) for (const hour of ['08', '16']) list.push(at(`2026-05-${String(10 + d).padStart(2, '0')}T${hour}:00:00Z`));
  const kept = revisions.thin(list, now);
  const old = kept.filter(r => now - Date.parse(r.savedAt) > 7 * DAY);
  assert.equal(new Set(old.map(r => r.savedAt.slice(0, 10))).size, old.length, 'one per old day');
  assert.ok(old.every(r => r.savedAt.includes('T16')), 'the newest of each day');
  assert.equal(kept.length - old.length, list.filter(r => now - Date.parse(r.savedAt) <= 7 * DAY).length);
  const many = Array.from({length: 150}, (_, i) => at(new Date(now - i * MINUTE).toISOString())).reverse();
  assert.equal(revisions.thin(many, now).length, 100);
});

test('diffLines marks removed and added lines', () => {
  const diff = revisions.diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne');
  assert.deepEqual(diff.map(l => (l.type === 'same' ? ' ' : l.type === 'removed' ? '-' : '+') + l.text),
    [' a', '-b', '+B', ' c', ' d', '+e']);
  assert.deepEqual(revisions.diffLines('same', 'same'), [{type: 'same', text: 'same'}]);
});

// --- Lifecycle ------------------------------------------------------------------------------------
const json = value => JSON.stringify(value, null, 2) + '\n';
const old = '2026-01-01T00:00:00.000Z';
const pageFile = (id, title, extra = {}) => json({id, title, parentId: null, tags: [], content: 'Original ' + title, icon: '', createdAt: old, updatedAt: old, ...extra});
function folder() {
  const root = new MemoryDirectory('wiki'), pagesDir = new MemoryDirectory('pages');
  root.dirs.set('pages', pagesDir);
  pagesDir.files.set('welcome.json', pageFile('welcome', 'Welcome', {content: 'Original Welcome. See [[Editing guide]].'}));
  pagesDir.files.set('editing-guide.json', pageFile('editing-guide', 'Editing guide'));
  pagesDir.files.set('tables.json', pageFile('tables', 'Tables', {parentId: 'editing-guide'}));
  root.files.set('wiki.json', json({schemaVersion: 1, type: 'localwiki-index', name: 'Test',
    pages: ['editing-guide', 'tables', 'welcome'].map(id => ({id, file: `pages/${id}.json`}))}));
  return root;
}
async function open(root) { window.showDirectoryPicker = async () => root; state.dirty = false; await storage.openFolder(); }
const revisionsOf = (root, id) => {
  const text = root.dirs.get('revisions')?.files.get(id + '.json');
  return text === undefined ? undefined : JSON.parse(text);
};
function retitle(value) { pages.editTitle(value); pages.commitTitle(); }

test('editing keeps the original, then a checkpoint after 10 minutes', async () => {
  offset = 0;
  const root = folder();
  await open(root);
  pages.selectPage('welcome');
  pages.editContent('Second version');
  await storage.saveChanges();
  assert.deepEqual(revisionsOf(root, 'welcome').revisions.map(r => r.content), ['Original Welcome. See [[Editing guide]].']);

  pages.editContent('Third version');
  await storage.saveChanges();
  assert.equal(revisionsOf(root, 'welcome').revisions.length, 1, 'no revision mid-burst');

  offset += 11 * MINUTE; // "Third version" has now rested for 11 minutes
  pages.editContent('Fourth version');
  await storage.saveChanges();
  assert.deepEqual(revisionsOf(root, 'welcome').revisions.map(r => r.content).slice(-1), ['Third version']);
  assert.deepEqual((await revisions.pageRevisions('welcome')).length, 2);
});

test('revisions follow a rename, and undo moves them back', async () => {
  offset = 0;
  const root = folder();
  await open(root);
  pages.selectPage('editing-guide');
  retitle('Guide');
  await storage.saveChanges();
  assert.equal(revisionsOf(root, 'editing-guide'), undefined);
  assert.deepEqual(revisionsOf(root, 'guide').revisions.map(r => r.title), ['Editing guide']);

  history.undo();
  await storage.saveChanges();
  assert.equal(revisionsOf(root, 'guide'), undefined);
  assert.deepEqual(revisionsOf(root, 'editing-guide').revisions.map(r => r.title), ['Editing guide']);

  history.redo();
  await storage.saveChanges();
  assert.ok(revisionsOf(root, 'guide') && !revisionsOf(root, 'editing-guide'));
});

test('deleted pages keep their history and can be restored after a reload', async () => {
  offset = 0;
  const root = folder();
  await open(root);
  pages.selectPage('editing-guide');
  pages.deletePage(); // also deletes the child page "Tables"
  await storage.saveChanges();
  assert.ok(revisionsOf(root, 'editing-guide').deletedAt);
  assert.ok(revisionsOf(root, 'tables').deletedAt);

  await open(root); // a fresh session: undo history is gone, saved history is not
  const deleted = await revisions.deletedPages();
  assert.deepEqual(deleted.map(f => f.id).sort(), ['editing-guide', 'tables']);
  pages.restoreDeleted(deleted.find(f => f.id === 'editing-guide'));
  await storage.saveChanges();
  assert.equal(JSON.parse(root.dirs.get('pages').files.get('editing-guide.json')).content, 'Original Editing guide');
  assert.equal(revisionsOf(root, 'editing-guide').deletedAt, null);
  assert.deepEqual((await revisions.deletedPages()).map(f => f.id), ['tables']);
});

test('restoring a version brings back its text, tags and icon, and can be undone', async () => {
  offset = 0;
  const root = folder();
  await open(root);
  pages.selectPage('welcome');
  pages.editContent('Changed by mistake');
  await storage.saveChanges();
  const [original] = await revisions.pageRevisions('welcome');
  pages.restoreRevision(original);
  assert.equal(store.currentPage().content, 'Original Welcome. See [[Editing guide]].');
  assert.equal(store.currentPage().title, 'Welcome');
  history.undo();
  assert.equal(store.currentPage().content, 'Changed by mistake');
});

test('an unreadable revisions file is never overwritten', async () => {
  offset = 0;
  const root = folder();
  const revisionsDir = new MemoryDirectory('revisions');
  revisionsDir.files.set('welcome.json', '{broken');
  root.dirs.set('revisions', revisionsDir);
  await open(root);
  pages.selectPage('welcome');
  pages.editContent('New');
  await storage.saveChanges();
  assert.equal(revisionsDir.files.get('welcome.json'), '{broken');
  assert.equal(JSON.parse(root.dirs.get('pages').files.get('welcome.json')).content, 'New', 'the page itself still saves');
});

test('Save to folder… copies the history along', async () => {
  offset = 0;
  const root = folder();
  await open(root);
  pages.selectPage('welcome');
  pages.editContent('Edited');
  await storage.saveChanges();
  const copy = new MemoryDirectory('copy');
  window.showDirectoryPicker = async () => copy;
  await storage.saveToFolder();
  assert.equal(copy.dirs.get('revisions').files.get('welcome.json'), root.dirs.get('revisions').files.get('welcome.json'));
  assert.equal(JSON.parse(copy.dirs.get('pages').files.get('welcome.json')).content, 'Edited');
});
