/* LocalWiki — images.js
   The pictures of the open wiki. A page refers to a picture as ![description](images/name.png);
   the file itself lives in the wiki folder's images/ folder (like branding/logo.png), never inside
   the page's JSON. Pictures are only ever added: removing one from a page leaves its file alone.

   Each picture is {blob, url, saved}: the file's contents, an address the page can show it from,
   and whether it is already in the wiki folder. Pictures are not part of the crash-recovery draft
   (browser storage is too small for them); they reach the wiki folder with the next save.

   Depends on: model.js, state.js
   Provides:   LocalWiki.images */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const state = LW.state;
  const {IMAGE_PATH, imagePathFor} = LW.model;
  const DIR = 'images';
  const TYPES = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp'};

  const has = path => state.images.has(path);
  const urlFor = path => state.images.get(path)?.url ?? null;
  const addressFor = blob => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '');
  const release = entry => { if (entry.url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(entry.url); };

  // Forgets every picture (another wiki is being opened or started).
  function reset() {
    for (const entry of state.images.values()) release(entry);
    state.images = new Map();
  }
  // Pictures found in a folder: [{path, blob}], already saved.
  function load(found) {
    reset();
    for (const {path, blob} of found) if (IMAGE_PATH.test(path)) state.images.set(path, {blob, url: addressFor(blob), saved: true});
  }
  // Adds a new picture (a blob of a supported type) and returns its path, e.g. "images/holiday.jpg".
  function add(blob, originalName) {
    const ext = TYPES[blob.type];
    if (!ext) throw LW.i18n.error('img.err_type');
    const path = imagePathFor(originalName, ext, state.images.keys());
    state.images.set(path, {blob, url: addressFor(blob), saved: false});
    return path;
  }
  // Pictures not yet in the wiki folder: [[path, blob]].
  function pending() { return [...state.images].filter(([, entry]) => !entry.saved).map(([path, entry]) => [path, entry.blob]); }
  function markSaved(paths) { for (const path of paths) { const entry = state.images.get(path); if (entry) entry.saved = true; } }
  // Used when the wiki moves to a new folder: every picture has to be written there.
  function markAllPending() { for (const entry of state.images.values()) entry.saved = false; }
  // Every picture as [path, bytes], for the ZIP export.
  async function allFiles() {
    const files = [];
    for (const [path, entry] of state.images) files.push([path, new Uint8Array(await entry.blob.arrayBuffer())]);
    return files;
  }
  // Paths of the pictures the pages refer to.
  function usedPaths(pages) {
    const used = new Set();
    for (const page of pages) for (const match of page.content.matchAll(/!\[[^\]\n]*\]\((images\/[^\s)]+)\)/g)) used.add(match[1]);
    return used;
  }

  LW.images = {DIR, TYPES, has, urlFor, reset, load, add, pending, markSaved, markAllPending, allFiles, usedPaths};
})();
