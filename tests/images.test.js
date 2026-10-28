'use strict';
/* Pictures in pages: how they are written in Markdown, shown, kept through the Visual editor,
   named, and saved to / opened from the wiki folder and the ZIP. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {parse} = require('./mini-dom');
const {MemoryDirectory} = require('./memory-folder');

const LW = load('icon-library', 'text', 'model', 'markdown', 'html-to-markdown', 'zip', 'search', 'folder', 'state', 'languages', 'images', 'revisions', 'history', 'pages', 'storage');
const {markdown, model, images, state, storage} = LW;
globalThis.window = globalThis;

const png = type => new Blob([Uint8Array.from([137, 80, 78, 71, 1, 2, 3])], {type});
const show = (md, known = {}) => markdown.toHtml(md, {linkExists: () => true, imageUrl: path => known[path] ?? null});
const roundTrip = md => LW.htmlToMarkdown(parse(show(md, {'images/cat.png': 'blob:cat', 'images/dog.jpg': 'blob:dog'})));

test('a picture from the wiki folder is shown, with its description and width', () => {
  const html = show('![A cat](images/cat.png){width=50%}', {'images/cat.png': 'blob:cat'});
  assert.match(html, /<img class="page-image" src="blob:cat" alt="A cat" data-image="images\/cat.png" data-alt="A cat" data-width="50">/);
  assert.doesNotMatch(show('![A cat](images/cat.png)', {'images/cat.png': 'blob:cat'}), /data-width/);
});

test('a picture that is not in the folder shows a placeholder', () => {
  const html = show('![Lost](images/gone.png)');
  assert.match(html, /<span class="page-image-missing" contenteditable="false" data-image="images\/gone.png" data-alt="Lost">Lost<\/span>/);
});

test('only pictures of the wiki folder are loaded: web addresses and other paths stay text', () => {
  for (const md of ['![x](https://example.com/a.png)', '![x](../secret.png)', '![x](images/../a.png)', '![x](images/a.svg)', '![x](images/a.png/b)']) {
    assert.doesNotMatch(show(md, {'images/a.png': 'blob:a'}), /<img|page-image/, md);
  }
});

test('descriptions are escaped', () => {
  const html = show('![<script>alert(1)</script>](images/cat.png)', {'images/cat.png': 'blob:cat'});
  assert.doesNotMatch(html, /<script>/);
});

test('pictures survive the Visual editor round trip unchanged', () => {
  for (const md of ['![A cat](images/cat.png)', '![A cat](images/cat.png){width=25%}', 'Text before ![Dog](images/dog.jpg){width=75%} and after.',
    '![](images/cat.png)', '![Lost](images/gone.png){width=50%}', '- item ![A cat](images/cat.png)']) {
    assert.equal(roundTrip(md), md, md);
  }
});

test('a picture added in the editor becomes Markdown', () => {
  const md = LW.htmlToMarkdown(parse('<p><img class="page-image" src="blob:x" data-image="images/new.png" data-alt="New [one]" data-width="50"></p>'));
  assert.equal(md, '![New one](images/new.png){width=50%}');
  assert.equal(LW.htmlToMarkdown(parse('<p><img src="https://example.com/a.png" alt="x"></p>')), '', 'foreign pictures are dropped');
  assert.equal(LW.htmlToMarkdown(parse('<p><img data-image="images/../x.png" data-alt="x"></p>')), '');
});

test('file names come from the original name and never collide', () => {
  const taken = new Set(['images/holiday.jpg']);
  assert.equal(model.imagePathFor('Holiday.JPG', 'jpg', taken), 'images/holiday-2.jpg');
  assert.equal(model.imagePathFor('Café Menu!.png', 'png', taken), 'images/cafe-menu.png');
  assert.equal(model.imagePathFor('日本.png', 'png', taken), 'images/日本.png');
  assert.equal(model.imagePathFor('???.png', 'png', taken), 'images/image.png');
  for (const path of ['images/a.png', 'images/日本.png', 'images/a-b_c.1.webp']) assert.ok(model.IMAGE_PATH.test(path), path);
  for (const path of ['images/.png', 'img/a.png', 'images/a/b.png', 'images/a.svg', 'images/a b.png']) assert.ok(!model.IMAGE_PATH.test(path), path);
});

test('the store adds, names, and reports pending pictures; other types are refused', () => {
  images.reset();
  const first = images.add(png('image/png'), 'logo.png'), second = images.add(png('image/png'), 'logo.png');
  assert.deepEqual([first, second], ['images/logo.png', 'images/logo-2.png']);
  assert.equal(images.pending().length, 2);
  images.markSaved([first]);
  assert.deepEqual(images.pending().map(([path]) => path), ['images/logo-2.png']);
  assert.throws(() => images.add(new Blob(['x'], {type: 'image/svg+xml'}), 'a.svg'), /./);
  assert.deepEqual([...images.usedPaths([{content: 'x ![a](images/logo.png) y ![b](images/other.png)'}])].sort(), ['images/logo.png', 'images/other.png']);
});

function folder(withImage) {
  const root = new MemoryDirectory('wiki'), dir = new MemoryDirectory('pages');
  root.dirs.set('pages', dir);
  dir.files.set('home.json', JSON.stringify({id: 'home', title: 'Home', parentId: null, tags: [], content: '![Cat](images/cat.png)', icon: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'}));
  root.files.set('wiki.json', JSON.stringify({schemaVersion: 1, type: 'localwiki-index', name: 'T', pages: [{id: 'home', file: 'pages/home.json'}]}));
  if (withImage) {
    const imagesDir = new MemoryDirectory('images');
    imagesDir.files.set('cat.png', Uint8Array.from([137, 80, 78, 71, 9]));
    imagesDir.files.set('notes.txt', 'ignored');
    root.dirs.set('images', imagesDir);
  }
  return root;
}
async function open(root) { window.showDirectoryPicker = async () => root; state.dirty = false; await storage.openFolder(); }

test('opening a folder finds its pictures and ignores other files', async () => {
  await open(folder(true));
  assert.deepEqual([...state.images.keys()], ['images/cat.png']);
  assert.equal(images.pending().length, 0);
  assert.ok(images.has('images/cat.png'));
});

test('a new picture is written to images/ on the next save, before the page that shows it', async () => {
  const root = folder(false);
  await open(root);
  const path = images.add(png('image/png'), 'Dog.png');
  state.wiki.pages[0].content += `\n![Dog](${path})`; LW.store.touchPage(state.wiki.pages[0]);
  await storage.saveChanges();
  assert.deepEqual([...root.dirs.get('images').files.keys()], ['dog.png']);
  assert.equal(root.dirs.get('images').files.get('dog.png').length, 7);
  assert.equal(images.pending().length, 0);
});

test('the ZIP export carries every picture', async () => {
  await open(folder(true));
  const files = await images.allFiles();
  assert.deepEqual(files.map(([path]) => path), ['images/cat.png']);
  assert.deepEqual([...files[0][1]], [137, 80, 78, 71, 9]);
});

test('starting a new wiki forgets the pictures', async () => {
  await open(folder(true));
  window.prompt = () => 'Fresh'; window.confirm = () => true;
  storage.newWiki();
  assert.equal(state.images.size, 0);
});
