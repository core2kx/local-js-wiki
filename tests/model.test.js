'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {model} = load('text', 'model');

const page = (id, title, parentId = null) => ({id, title, parentId, tags: [], content: '', icon: '', createdAt: '', updatedAt: ''});

test('uniqueId adds a suffix on clashes, ignoring case, and avoids set-aside files', () => {
  const existing = [{id: 'c'}, {id: 'Notes'}];
  assert.equal(model.uniqueId('C#', existing), 'c-2');
  assert.equal(model.uniqueId('notes', existing), 'notes-2');
  assert.equal(model.uniqueId('Fresh', existing), 'fresh');
  assert.equal(model.uniqueId('C', existing, 'c'), 'c'); // a page keeps its own ID
});

test('paths and the page-path pattern', () => {
  assert.equal(model.pathFor('привет'), 'pages/привет.json');
  assert.ok(model.PAGE_PATH.test('pages/東京.json'));
  assert.ok(!model.PAGE_PATH.test('../../etc/passwd'));
  assert.ok(!model.PAGE_PATH.test('pages/-x.json'));
});

test('findLinkTarget prefers IDs, then case-insensitive titles', () => {
  const pages = [page('welcome', 'Start here'), page('notes', 'Welcome')];
  assert.equal(model.findLinkTarget(pages, 'welcome').id, 'welcome');
  assert.equal(model.findLinkTarget(pages, 'START HERE').id, 'welcome');
  assert.equal(model.findLinkTarget(pages, 'missing'), undefined);
});

test('linkTargetFor uses the title unless it would break the link syntax', () => {
  assert.equal(model.linkTargetFor(page('welcome', 'Welcome')), 'Welcome');
  assert.equal(model.linkTargetFor(page('a-b', 'A | B')), 'a-b');
  assert.equal(model.linkTargetFor(page('c', 'Use [x]')), 'c');
});

test('tree helpers', () => {
  const pages = [page('a', 'A'), page('b', 'B', 'a'), page('c', 'C', 'b'), page('d', 'D')];
  assert.deepEqual([...model.descendantsOf(pages, 'a')].sort(), ['a', 'b', 'c']);
  assert.deepEqual(model.ancestors(pages, pages[2]).map(p => p.id), ['a', 'b']);
});

test('normalizePage repairs missing fields and rejects data it would lose', () => {
  const {page: p, notes} = model.normalizePage({id: 'old', title: '  Hello  '}, 'hello');
  assert.equal(p.id, 'hello');
  assert.equal(p.title, 'Hello');
  assert.equal(p.content, '');
  assert.equal(notes.length, 2); // id mismatch, missing content
  assert.equal(model.normalizePage({id: 'x', content: 'c'}, 'x').page.title, 'x');
  // Problems are translatable messages: the error carries a key, not an English sentence.
  const keyOf = fn => { try { fn(); } catch (err) { return err.key; } return null; };
  assert.equal(keyOf(() => model.normalizePage([1, 2], 'x')), 'page.err_not_object');
  assert.equal(keyOf(() => model.normalizePage({title: 42}, 'x')), 'page.err_title');
  assert.equal(keyOf(() => model.normalizePage({content: ['x']}, 'x')), 'page.err_content');
  assert.deepEqual(notes.map(n => n.key), ['page.note_id_mismatch', 'page.note_no_content']);
});

test('repairStructure fixes duplicate titles and loops, and keeps missing parents', () => {
  const pages = [page('a', 'Same'), page('b', 'SAME'), page('x', 'X', 'y'), page('y', 'Y', 'x'), page('o', 'Orphan', 'gone')];
  const reports = [];
  model.repairStructure(pages, (p, message, repaired) => reports.push([p.id, repaired, message.key]));
  assert.equal(pages[1].title, 'SAME (2)');
  assert.ok(pages[2].parentId === null || pages[3].parentId === null);
  assert.equal(pages[4].parentId, 'gone'); // kept, shown at top level
  assert.deepEqual(reports.map(r => r[1]), [true, true, false]);
});

test('normalizeWiki drops invalid pages instead of failing', () => {
  const wiki = model.normalizeWiki({name: ' My ', pages: [{id: 'ok', title: 'OK', content: ''}, {title: 'no id'}, {id: 'ok', title: 'dup'}, {id: 'bad', title: 5}]});
  assert.equal(wiki.name, 'My');
  assert.deepEqual(wiki.pages.map(p => p.id), ['ok']);
  assert.equal(model.normalizeWiki(null).name, 'Untitled Wiki');
});
