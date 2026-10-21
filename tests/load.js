/* Test helper: loads LocalWiki script files into this Node process, the same way index.html
   loads them into the browser (each adds its part to globalThis.LocalWiki), and returns
   the LocalWiki namespace. Pass names in index.html order, e.g. load('text', 'model').

   Browser-only features the app touches are replaced with small stand-ins:
   - localStorage (crash-recovery draft): an in-memory map
   - confirm/prompt dialogs: answer "yes" / the default unless a test overrides them
   - LocalWiki.ui: no-op drawing functions, so feature modules can run without a page. */
'use strict';
const path = require('node:path');

const memory = new Map();
globalThis.localStorage ??= {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: key => { memory.delete(key); }
};
globalThis.confirm ??= () => true;
globalThis.prompt ??= (_message, fallback) => fallback;

function load(...names) {
  const LW = (globalThis.LocalWiki ||= {});
  const noop = () => {};
  LW.ui ||= new Proxy({}, {get: (target, name) => (name in target ? target[name] : noop)});
  for (const name of names) require(path.join(__dirname, '..', 'js', name + '.js'));
  return LW;
}

module.exports = {load};
