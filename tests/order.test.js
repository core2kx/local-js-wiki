'use strict';
/* Page order in the tree: the pure rules (model.js) and the whole flow (move, save, undo, sort A–Z). */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {MemoryDirectory} = require('./memory-folder');

const LW = load('icon-library', 'text', 'model', 'markdown', 'zip', 'search', 'folder', 'state', 'languages', 'revisions', 'history', 'pages', 'storage');
const {model, state, history, pages, storage} = LW;
globalThis.window = globalThis;

const page = (id, title, extra = {}) => ({id, title, parentId: null, tags: [], content: '', icon: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra});
const titles = list => list.map(p => p.title);

test('pages are alphabetical until placed by hand; placed pages come first', () => {
  const list = [page('c', 'Cherry'), page('a', 'Apple'), page('b', 'Banana', {order: 0}), page('d', 'Date', {order: 1})];
  assert.deepEqual(titles(model.sortSiblings(list)), ['Banana', 'Date', 'Apple', 'Cherry']);
});

test('siblingsOf groups by parent, and a missing parent counts as the top level', () => {
  const list = [page('a', 'A'), page('b', 'B', {parentId: 'a'}), page('c', 'C', {parentId: 'gone'})];
  assert.deepEqual(titles(model.siblingsOf(list, null)), ['A', 'C']);
  assert.deepEqual(titles(model.siblingsOf(list, 'a')), ['B']);
});

test('placePage moves a page before another and numbers the group', () => {
  const list = [page('a', 'Apple'), page('b', 'Banana'), page('c', 'Cherry')];
  const changed = model.placePage(list, 'c', null, 'a');
  assert.deepEqual(titles(model.siblingsOf(list, null)), ['Cherry', 'Apple', 'Banana']);
  assert.deepEqual(changed.sort(), ['a', 'b', 'c']);
  assert.deepEqual(model.placePage(list, 'c', null, 'a'), [], 'already there: nothing changes');
});

test('placePage can nest a page, or send it last', () => {
  const list = [page('a', 'Apple'), page('b', 'Banana'), page('c', 'Cherry', {parentId: 'b'})];
  model.placePage(list, 'a', 'b', null);
  assert.equal(list[0].parentId, 'b');
  assert.deepEqual(titles(model.siblingsOf(list, 'b')), ['Cherry', 'Apple']);
  model.placePage(list, 'a', 'b', 'c');
  assert.deepEqual(titles(model.siblingsOf(list, 'b')), ['Apple', 'Cherry']);
});

test('order is read from page files only when it is a whole number', () => {
  assert.equal(model.normalizePage({id: 'a', title: 'A', content: '', order: 3}, 'a').page.order, 3);
  for (const bad of ['3', 1.5, null, NaN, 1e12]) assert.ok(!('order' in model.normalizePage({id: 'a', title: 'A', content: '', order: bad}, 'a').page), String(bad));
  assert.ok(!('order' in model.normalizePage({id: 'a', title: 'A', content: ''}, 'a').page));
});

function folder() {
  const root = new MemoryDirectory('wiki'), dir = new MemoryDirectory('pages');
  root.dirs.set('pages', dir);
  const ids = ['apple', 'banana', 'cherry'];
  for (const id of ids) dir.files.set(id + '.json', JSON.stringify(page(id, id[0].toUpperCase() + id.slice(1)), null, 2) + '\n');
  root.files.set('wiki.json', JSON.stringify({schemaVersion: 1, type: 'localwiki-index', name: 'T', pages: ids.map(id => ({id, file: `pages/${id}.json`}))}));
  return {root, dir};
}
async function open(root) { window.showDirectoryPicker = async () => root; state.dirty = false; await storage.openFolder(); }
const shown = () => titles(model.siblingsOf(state.wiki.pages, null));

test('moving a page saves the new order, keeps dates, and undo restores it', async () => {
  const {root, dir} = folder();
  await open(root);
  pages.reorderPage('cherry', null, 'apple');
  assert.deepEqual(shown(), ['Cherry', 'Apple', 'Banana']);
  await storage.saveChanges();
  assert.equal(JSON.parse(dir.files.get('cherry.json')).order, 0);
  assert.equal(JSON.parse(dir.files.get('apple.json')).updatedAt, '2026-01-01T00:00:00.000Z', 'reordering is not an edit');

  history.undo();
  assert.deepEqual(shown(), ['Apple', 'Banana', 'Cherry']);
  await storage.saveChanges();
  assert.ok(!('order' in JSON.parse(dir.files.get('cherry.json'))));
});

test('Move up / Move down step through the group; the ends do nothing', async () => {
  const {root} = folder();
  await open(root);
  pages.selectPage('banana');
  pages.movePageBy(-1);
  assert.deepEqual(shown(), ['Banana', 'Apple', 'Cherry']);
  pages.movePageBy(-1);
  assert.deepEqual(shown(), ['Banana', 'Apple', 'Cherry'], 'already first');
  pages.movePageBy(1); pages.movePageBy(1);
  assert.deepEqual(shown(), ['Apple', 'Cherry', 'Banana']);
});

test('a drop that changes nothing leaves no undo step; a page cannot go inside itself', async () => {
  const {root} = folder();
  await open(root);
  history.clear();
  pages.reorderPage('apple', null, 'banana'); // already before Banana
  assert.deepEqual(shown(), ['Apple', 'Banana', 'Cherry']);
  assert.equal(history.peek().undo, null, 'no step recorded');
  pages.reorderPage('apple', 'apple', null);
  assert.equal(state.wiki.pages.find(p => p.id === 'apple').parentId, null);
});

test('Sort A–Z forgets every hand-made order', async () => {
  const {root} = folder();
  await open(root);
  pages.reorderPage('cherry', null, 'apple');
  pages.sortAlphabetically();
  assert.deepEqual(shown(), ['Apple', 'Banana', 'Cherry']);
  assert.ok(state.wiki.pages.every(p => !('order' in p)));
  history.undo();
  assert.deepEqual(shown(), ['Cherry', 'Apple', 'Banana']);
});
